"use strict";

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    const mergedOptions = {
      ...options,
      signal: controller.signal,
      cache: options.cache || "no-store"
    };
    return await fetch(url, mergedOptions);
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("网络请求超时：" + (timeoutMs / 1000) + " 秒内没有响应");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── P0.6: 移动端网络恢复 ──────────────────────────────────────────────

function isFetchNetworkFailure(error) {
  if (!error) return false;
  if (error.name === "TypeError" && String(error.message || "").indexOf("Failed to fetch") !== -1) return true;
  return false;
}

var visibleSyncTimer = 0;

function scheduleVisibleSync() {
  clearTimeout(visibleSyncTimer);
  visibleSyncTimer = setTimeout(function() {
    if (document.visibilityState !== "visible") return;
    if (state.isSyncing) return;
    syncTick({ reason: "visible_delayed", bypassBackoff: true });
  }, 1000);
}

// ── P0.6: runId 过期保护 ──────────────────────────────────────────────

function isStaleSyncRun(runId) {
  return runId !== undefined && runId !== null && state.syncRunId !== runId;
}


function readCrossTabSyncLock() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_LOCK_KEY) || "null");
  } catch (_) {
    return null;
  }
}


function isUrgentSyncReason(reason) {
  return [
    "active_study_idle_upload",
    "visibility_resume_dirty_flush",
    "visibility_resume",
    "pagehide_flush",
    "visibility_hidden_flush",
    "archive_open",
    "archive_tab_switch",
    "stats_open",
    "startup",
    "manual",
    "manual_push",
    "manual_pull",
    "manual_retry"
  ].indexOf(String(reason || "")) !== -1;
}

function isCrossTabSyncLockLikelyAbandoned(lock, now, reason) {
  if (!lock || lock.owner === TAB_ID) return false;
  var touchedAt = Math.max(Number(lock.renewedAt || 0), Number(lock.startedAt || 0));
  if (!touchedAt) return false;
  var noProgressMs = now - touchedAt;
  if (noProgressMs <= SYNC_NO_PROGRESS_TIMEOUT_MS) return false;
  // 真实活跃同步会通过 markSyncProgress() 续租；超过 watchdog 时间还无进展的外部锁视为遗留锁。
  return isUrgentSyncReason(reason) || noProgressMs > Math.min(CROSS_TAB_LOCK_LEASE_MS, SYNC_NO_PROGRESS_TIMEOUT_MS + 15000);
}

function tryAcquireCrossTabSyncLock(reason) {
  const now = Date.now();
  const existing = readCrossTabSyncLock();
  if (existing && existing.expiresAt && existing.expiresAt > now && existing.owner !== TAB_ID) {
    if (isCrossTabSyncLockLikelyAbandoned(existing, now, reason)) {
      try { localStorage.removeItem(SYNC_LOCK_KEY); } catch (_) {}
      appendAuditEvent({
        type: "sync:stale_cross_tab_lock_cleared",
        message:
          "session=" + TAB_ID +
          " reason=" + String(reason || "") +
          " owner=" + String(existing.owner || "") +
          " age=" + String(now - Math.max(Number(existing.renewedAt || 0), Number(existing.startedAt || 0)))
      });
    } else {
      return false;
    }
  }
  const lock = { owner: TAB_ID, startedAt: now, renewedAt: now, expiresAt: now + CROSS_TAB_LOCK_LEASE_MS, reason: reason || "" };
  safeLocalStorageSet(SYNC_LOCK_KEY, JSON.stringify(lock), { priority: "sync_lock" });
  const check = readCrossTabSyncLock();
  return Boolean(check && check.owner === TAB_ID);
}


function renewCrossTabSyncLock(reason) {
  const lock = readCrossTabSyncLock();
  if (!lock || lock.owner !== TAB_ID) return false;
  lock.expiresAt = Date.now() + CROSS_TAB_LOCK_LEASE_MS;
  lock.reason = reason || lock.reason || "";
  lock.renewedAt = Date.now();
  return safeLocalStorageSet(SYNC_LOCK_KEY, JSON.stringify(lock), { priority: "sync_lock" });
}


function releaseCrossTabSyncLock() {
  try {
    const lock = readCrossTabSyncLock();
    if (lock && lock.owner === TAB_ID) localStorage.removeItem(SYNC_LOCK_KEY);
  } catch (_) {}
}


function markSyncProgress(stage, runId) {
  if (isStaleSyncRun(runId)) return;
  state.syncLastProgressAt = Date.now();
  state.syncLastProgressStage = stage || "";
  renewCrossTabSyncLock(stage);
}


function releaseStuckSyncLockIfNeeded() {
  if (!state.isSyncing) return false;
  const base = state.syncLastProgressAt || state.syncStartedAt || 0;
  const noProgressMs = Date.now() - base;
  if (base && noProgressMs <= SYNC_NO_PROGRESS_TIMEOUT_MS) return false;
  state.isSyncing = false;
  state.syncStartedAt = 0;
  state.syncLastProgressAt = 0;
  state.syncRunId = ++state.syncRunSeq;
  releaseCrossTabSyncLock();
  var cleanForWatchdog = isCleanConfirmedSyncState();
  recordHashSyncFailure(
    cleanForWatchdog
      ? "本地数据和上次确认的云端数据一致。刚才一轮后台同步检查卡住，系统已自动解除同步锁，后续会继续自动检查。"
      : "同步流程超过 45 秒没有进展，已自动解除同步锁。本地数据未丢失。",
    {
      errorKind: "sync_watchdog_timeout",
      banner: true,
      dialog: true,
      severity: cleanForWatchdog ? "warning" : "error",
      title: cleanForWatchdog ? "同步检查超时" : undefined,
      technical: "lastStage=" + (state.syncLastProgressStage || "")
    }
  );
  refreshVisibleSyncDiagnostics();
  return true;
}

// ── P0.8: PATCH 事务锁（仅页面内存级，不替代 cross-tab lock）─────────────
// 仅用于同一页面会话内防止并发 PATCH。
// 多设备冲突仍依赖 remote hash / verify / merge 处理。
var activePatchTransaction = null;

function hasActivePatchTransaction() {
  return Boolean(activePatchTransaction);
}

function beginPatchTransaction(runId, reason) {
  if (activePatchTransaction) return false;
  activePatchTransaction = { runId: runId, reason: reason || "", startedAt: Date.now() };
  return true;
}

function endPatchTransaction(runId) {
  if (!activePatchTransaction) return;
  if (String(activePatchTransaction.runId) !== String(runId)) return;
  activePatchTransaction = null;
}

// ── P0.6: 同步失败短横幅 ─────────────────────────────────────────────────

function backoffDelayForFailure(count) {
  const base = 5000;
  const max = 5 * 60 * 1000;
  const n = Math.max(0, Number(count) || 0);
  return Math.min(max, base * Math.pow(2, n)) + Math.floor(Math.random() * 1000);
}


function shouldMarkDirtyOnFailure(errorKind, facts) {
  const syncState = ensureHashSyncState(state.syncHashState);
  const alreadyDirty = syncState.localDirty === true;
  const localHasData = hasBusinessData(facts && facts.payload);
  const hasBase = Boolean(syncState.baseRemoteHash);
  const hashDiffersFromBase = hasBase && facts && facts.localPayloadHash !== syncState.baseRemoteHash;
  if (alreadyDirty) return true;
  if (["patch_failed", "verify_failed", "merge_failed", "readonly_with_local_changes", "preflight_remote_changed", "local_changed_during_verify", "local_apply_verify_failed"].indexOf(errorKind) !== -1) return localHasData;
  if (["config_invalid", "remote_get_failed", "version_check_failed", "recovery_required", "empty_local_empty_remote", "sync_watchdog_timeout"].indexOf(errorKind) !== -1) return false;
  return localHasData && hashDiffersFromBase;
}


