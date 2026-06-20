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


function tryAcquireCrossTabSyncLock(reason) {
  const now = Date.now();
  const existing = readCrossTabSyncLock();
  if (existing && existing.expiresAt && existing.expiresAt > now && existing.owner !== TAB_ID) return false;
  const lock = { owner: TAB_ID, startedAt: now, expiresAt: now + CROSS_TAB_LOCK_LEASE_MS, reason: reason || "" };
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
  recordHashSyncFailure("同步流程超过 45 秒没有进展，已自动解除同步锁。本地数据未丢失。", {
    errorKind: "sync_watchdog_timeout",
    banner: true,
    dialog: true,
    technical: "lastStage=" + (state.syncLastProgressStage || "")
  });
  updateSyncIndicator();
  return true;
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


