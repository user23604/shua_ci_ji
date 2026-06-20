"use strict";

async function autoPullFromGist() {
  return syncTick({ reason: "manual_pull", bypassBackoff: true });
}


async function autoPushToGist({ keepalive = false } = {}) {
  return syncTick({ reason: "manual_push", keepalive, bypassBackoff: true });
}


async function syncWithGist({ keepalive = false } = {}) {
  return syncTick({ reason: "manual", keepalive, bypassBackoff: true });
}


async function pushLocalPayload() {
  throw new Error("pushLocalPayload 已废弃，请使用 syncTick");
}

// P0: 已废弃。P0 使用 syncTick() 四分支。

function pullOrMergeRemotePayload() {
  throw new Error("pullOrMergeRemotePayload 已废弃，请使用 syncTick");
}

// P0: 已废弃。P0 使用 syncTick() → syncBranchMerge()。

function safeMergeAndPush() {
  throw new Error("safeMergeAndPush 已废弃，请使用 syncTick");
}

// P0: 已废弃。P0 使用 safeMergePayloads()。

function autoSafeMerge() {
  throw new Error("autoSafeMerge 已废弃，请使用 safeMergePayloads");
}

// P0: 已废弃。cloud_saved 只能由 finalizeVerifiedPatch() → markHashCleanFromRemote() 写入。

function markHashClean() {
  throw new Error("markHashClean 已废弃，请使用 markHashCleanFromRemote");
}

// ── P0.1 syncTick ─────────────────────────────────────────────────────

function summarizeSyncResult(result) {
  if (!result) return "false";
  if (result === true) return "true";
  if (result.localChangedDuringVerify) return "deferred_dirty";
  if (result.verifyFailed) return "verify_failed";
  if (result.preflightChanged) return "preflight_changed";
  if (result.ok) return "ok";
  return "not_ok";
}

function makeSyncRiskProblemFields(remote, facts, options = {}) {
  const currentFacts = facts && facts.payload ? facts : currentSyncFacts({ persistHash: false });
  const syncState = ensureHashSyncState(state.syncHashState);
  const remoteHash = Object.prototype.hasOwnProperty.call(options, "remoteHash") ? options.remoteHash : currentRemoteHash(remote);
  const remoteHasData = Object.prototype.hasOwnProperty.call(options, "remoteHasBusinessData") ? options.remoteHasBusinessData : remoteHasBusinessPayload(remote);
  return {
    remoteKind: remote && remote.kind || "",
    remoteHash: remoteHash || "",
    localHasBusinessData: hasBusinessData(currentFacts.payload),
    remoteHasBusinessData: Boolean(remoteHasData),
    baseRemoteHash: syncState.baseRemoteHash || "",
    localPayloadHash: currentFacts.localPayloadHash || "",
    localDirty: syncState.localDirty === true,
    effectiveDirty: currentFacts.effectiveDirty === true,
    readOnly: Boolean(Object.prototype.hasOwnProperty.call(options, "readOnly") ? options.readOnly : remote && remote.readOnlyAuthFallback),
    runId: options.runId
  };
}


function syncRiskTechnicalText(fields) {
  fields = fields || {};
  return [
    "remote.kind=" + String(fields.remoteKind || ""),
    "remoteHash=" + String(fields.remoteHash || ""),
    "localHasBusinessData=" + String(fields.localHasBusinessData === true),
    "remoteHasBusinessData=" + String(fields.remoteHasBusinessData === true),
    "baseRemoteHash=" + String(fields.baseRemoteHash || ""),
    "localPayloadHash=" + String(fields.localPayloadHash || ""),
    "localDirty=" + String(fields.localDirty === true),
    "effectiveDirty=" + String(fields.effectiveDirty === true),
    "readOnly=" + String(fields.readOnly === true),
    "runId=" + String(fields.runId || "")
  ].join("\n");
}


function markReadOnlyDirtyState(message, facts, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  const currentFacts = facts && facts.payload ? facts : currentSyncFacts({ persistHash: true });
  const now = beijingISOString();

  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localPayloadHash = currentFacts.localPayloadHash || state.syncHashState.localPayloadHash || "";
  state.syncHashState.localDirty = true;
  if (!state.syncHashState.dirtySince) state.syncHashState.dirtySince = now;
  state.syncHashState.lastSyncStatus = "read_only";
  state.syncHashState.lastSyncError = message || "当前 PAT 不可写，本地数据等待上传";
  persistHashSyncState();

  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.cloudWritable = false;
  state.syncMeta.readOnlyMode = true;
  state.syncMeta.lastSyncErrorAt = now;
  state.syncMeta.lastSyncErrorMessage = state.syncHashState.lastSyncError;
  persistSyncMeta();
  updateSyncIndicator();
  return true;
}


function syncBranchReadOnlyMergeLocal({ remote, remotePayload, local, reason, runId }) {
  if (isStaleSyncRun(runId)) return false;
  const message = "当前 PAT 不可写，已在本地合并云端数据，等待更换可写 PAT 后上传。";
  const currentLocal = local && local.payload ? local : currentSyncFacts({ persistHash: true });
  writeHashBackup("pre_merge", currentLocal.payload, reason || "read_only_merge");

  const mergedPayload = normalizeSyncPayload(safeMergePayloads(remotePayload, currentLocal.payload));
  if (!validateSyncPayload(mergedPayload)) {
    markReadOnlyDirtyState("只读模式下自动合并失败；本地数据已保留，未覆盖云端。", currentLocal, { runId });
    const failedFields = makeSyncRiskProblemFields(remote, currentLocal, { remoteHash: currentRemoteHash(remote), readOnly: true, runId });
    showSyncProblemDialog({
      severity: "warning",
      code: "READONLY_MERGE_FAILED",
      title: "只读模式下自动合并失败",
      message: state.syncHashState.lastSyncError,
      technical: syncRiskTechnicalText(failedFields),
      canCopy: true,
      canRetry: true,
      ...failedFields
    });
    return false;
  }

  const mergedHash = businessPayloadHash(mergedPayload);
  const applied = applyRemotePayloadSafely(mergedPayload, { source: "sync", expectedHash: mergedHash, runId, reason: reason || "read_only_merge_apply" });
  if (!applied) return false;

  const afterHash = businessPayloadHash(collectSyncPayload());
  if (afterHash !== mergedHash) {
    recordHashSyncFailure("只读模式下合并写入本地后 hash 校验失败", {
      errorKind: "local_apply_verify_failed",
      banner: true,
      dialog: true,
      runId,
      technical: "expected=" + mergedHash + ", actual=" + afterHash
    });
    return false;
  }

  renderCurrentView({ touchProgress: false });
  const afterFacts = currentSyncFacts({ persistHash: true });
  markReadOnlyDirtyState(message, afterFacts, { runId });
  const fields = makeSyncRiskProblemFields(remote, afterFacts, { remoteHash: currentRemoteHash(remote), readOnly: true, runId });
  showSyncProblemDialog({
    severity: "warning",
    code: "READONLY_REMOTE_MERGED_LOCAL_DIRTY",
    title: "只读模式下已合并到本地",
    message,
    technical: syncRiskTechnicalText(fields),
    canCopy: true,
    canRetry: true,
    ...fields
  });
  return false;
}

// ── P5 forced remote check ──────────────────────────────────────────────

function isForcedRemoteCheckReason(reason) {
  return [
    "manual", "manual_retry", "manual_push", "manual_pull",
    "config_saved", "startup",
    "view_open_remote_check", "archive_open", "archive_tab_switch",
    "stats_open", "visibility_resume"
  ].includes(reason);
}

function requestFreshRemoteCheck(reason) {
  var gate = savedCloudConfigGate();
  if (!gate.ok) return;
  scheduleSyncSoon(reason || "view_open_remote_check", 0);
}

function refreshCurrentBusinessViewAfterSync() {
  if (state.view === "archive" || state.view === "stats") {
    if (typeof renderArchiveStats === "function") renderArchiveStats();
  }
  if (state.view === "flash") {
    if (typeof renderFlashcard === "function") renderFlashcard();
  }
}

async function syncTick({ reason = "heartbeat", keepalive = false, bypassBackoff = false } = {}) {
  if (state.isSyncing) {
    if (!releaseStuckSyncLockIfNeeded()) return false;
  }
  if (typeof document !== "undefined" && document.hidden) return false;

  // P0.8: PATCH 事务锁 — 同一页面会话内不并发 PATCH
  if (hasActivePatchTransaction()) {
    appendAuditEvent({ type: "sync:skip_patch_in_flight", message: "session=" + TAB_ID + " reason=" + reason });
    scheduleSyncSoon("patch_in_flight_reschedule", 1500);
    return false;
  }

  const gate = savedCloudConfigGate();
  if (!gate.ok) {
    if (gate.configured) {
      recordHashSyncFailure(gate.message, { errorKind: "config_invalid", banner: true, dialog: true, title: "同步配置无效" });
    }
    return false;
  }

  // P0.7: 自动同步最小间隔。非手动触发的同步，距离上次完成不到 2s 则跳过，但 dirty 会重调度
  var isManualSync = reason === "manual" || reason === "manual_retry" || reason === "manual_push" || reason === "manual_pull" || reason === "ignore_empty_backup" || reason === "config_saved" || reason === "remote_restore_merge";
  var bypassMinInterval = isManualSync || isForcedRemoteCheckReason(reason);
  if (!bypassMinInterval && state.lastSyncFinishedAt && Date.now() - state.lastSyncFinishedAt < SYNC_MIN_INTERVAL_MS) {
    var syncStateForSkip = ensureHashSyncState(state.syncHashState);
    appendAuditEvent({ type: "sync:skip_min_interval", message: "session=" + TAB_ID + " reason=" + reason + " remaining=" + (SYNC_MIN_INTERVAL_MS - (Date.now() - state.lastSyncFinishedAt)) });
    if (syncStateForSkip.localDirty) {
      var remainingMs = SYNC_MIN_INTERVAL_MS - (Date.now() - state.lastSyncFinishedAt) + 300;
      scheduleSyncSoon("min_interval_reschedule", remainingMs);
    }
    return false;
  }

  const preFacts = currentSyncFacts({ persistHash: true });
  if (reason === "heartbeat" && !preFacts.effectiveDirty && !isForcedRemoteCheckReason(reason)) {
    var lastPollAt = Number(state.lastCleanRemotePollAt || 0);
    if (lastPollAt && Date.now() - lastPollAt < SYNC_CLEAN_REMOTE_POLL_MS) {
      return false;
    }
  }
  if (shouldSkipSyncForBackoff(bypassBackoff)) return false;
  if (!tryAcquireCrossTabSyncLock(reason)) {
    setHashSyncStatus("syncing", "其他标签页正在同步");
    return false;
  }

  const runId = ++state.syncRunSeq;
  state.syncRunId = runId;
  state.isSyncing = true;
  state.syncStartedAt = Date.now();
  state.syncLastProgressAt = state.syncStartedAt;
  state.syncLastProgressStage = "sync:start";
  appendAuditEvent({ type: "sync:start", message: "session=" + TAB_ID + " reason=" + reason + " runId=" + runId });
  const localRevisionAtStart = state.localBusinessRevision || 0;
  const localHashAtStart = businessPayloadHash(collectSyncPayload());
  setSyncStatus("syncing");
  markSyncProgress("sync:start", runId);

  var syncResult = { ok: false, unknown: true };
  var startedAtMs = Date.now();

  try {
    state.syncMeta = ensureSyncMeta(state.syncMeta);
    state.syncMeta.lastSyncAttemptAt = beijingISOString();
    persistSyncMeta();

    markSyncProgress("remote:get:start", runId);
    const remote = await fetchGistSyncPayload();
    markSessionRemoteChecked(remote, runId, "syncTick.remote_get");
    markSyncProgress("remote:get:done", runId);
    if (isStaleSyncRun(runId)) return false;

    const remotePayload = currentRemotePayload(remote);
    const remoteHash = currentRemoteHash(remote);

    if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") {
      recordHashSyncFailure(remote.reason || "云端 sync.json 无法安全解析，已停止自动同步", {
        errorKind: remote.kind === "v2_unknown_ops" ? "remote_v2_unknown_ops" : "remote_invalid",
        banner: true,
        dialog: true,
        runId,
        technical: remote.reason || "",
        remote,
        remoteHash,
        remoteHasBusinessData: remoteHasBusinessPayload(remote),
        readOnly: remote.readOnlyAuthFallback === true
      });
      return false;
    }

    if (!isRemoteValidKind(remote.kind) && !isRemoteEmptyKind(remote.kind)) {
      recordHashSyncFailure("云端 sync.json 状态未知，已停止同步", { errorKind: "remote_invalid", banner: true, dialog: true, runId, technical: remote.kind || "unknown", remote, remoteHash, remoteHasBusinessData: remoteHasBusinessPayload(remote), readOnly: remote.readOnlyAuthFallback === true });
      return false;
    }

    if (remote.readOnlyAuthFallback) {
      state.syncMeta.readOnlyMode = true;
      state.syncMeta.cloudWritable = false;
    } else {
      state.syncMeta.readOnlyMode = false;
      state.syncMeta.cloudWritable = true;
    }
    persistSyncMeta();

    markSyncProgress("recovery:check:start", runId);
    if (ensureHashSyncState(state.syncHashState).localRecoveryRequired) {
      const recovery = tryRestoreFromBackupIfPayloadEmpty({ runId });
      if (recovery.status === "restore_failed") return false;
    }
    markSyncProgress("recovery:check:done", runId);

    let local = refreshLocalPayloadHash({ persist: true });
    let facts = currentSyncFacts({ persistHash: false });

    if (!hasBusinessData(facts.payload)) {
      const recovery = tryRestoreFromBackupIfPayloadEmpty({ runId });
      if (recovery.status === "restore_failed") return false;
      if (recovery.status === "restored") {
        local = refreshLocalPayloadHash({ persist: true });
        facts = currentSyncFacts({ persistHash: false });
      }
    }

    const syncState = ensureHashSyncState(state.syncHashState);
    const effectiveDirty = facts.effectiveDirty;
    const localHasBusinessData = hasBusinessData(facts.payload);
    const remoteHasData = remoteHasBusinessPayload(remote);
    const remoteEmpty = remoteIsEmptyPayload(remote);
    const readOnly = remote.readOnlyAuthFallback === true;

    if (remoteEmpty && localHasBusinessData) {
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=empty_cloud_protect_local remoteKind=" + (remote && remote.kind) + " readOnly=" + readOnly + " runId=" + runId });
      const message = readOnly
        ? "只读模式：云端为空，但本地有学习数据。已阻止云端空数据覆盖本地。请更换可写 PAT 后重新同步。"
        : "云端 sync.json 是空数据，但本机仍有学习记录。已阻止云端空数据覆盖本地。";
      markHashDirty(facts.localPayloadHash, message, { runId });
      const fields = makeSyncRiskProblemFields(remote, facts, { remoteHash, remoteHasBusinessData: remoteHasData, readOnly, runId });
      showSyncProblemDialog({
        severity: "warning",
        code: readOnly ? "READONLY_REMOTE_EMPTY_LOCAL_HAS_DATA" : "REMOTE_EMPTY_LOCAL_HAS_DATA",
        title: readOnly ? "只读模式下已保护本地数据" : "已阻止云端空数据覆盖本地",
        message: readOnly
          ? "当前 PAT 不能写入 Gist。云端 sync.json 是空数据，但本机仍有学习记录，因此没有把云端空数据拉到本机。请更换可写 PAT 后重新同步。"
          : "云端 sync.json 是合法空数据，但本机仍有学习记录。为了防止数据丢失，本轮没有把云端空数据拉到本机。",
        technical: syncRiskTechnicalText(fields),
        canRetry: true,
        canCopy: true,
        ...fields
      });

      if (!readOnly) {
        syncResult = await syncBranchPushLocal({
          remote,
          local: facts,
          keepalive,
          reason: "remote_empty_protect_local",
          runId,
          remoteHashAtDecision: remoteHash
        });
        return syncResult;
      }

      markReadOnlyDirtyState(message, facts, { runId });
      return false;
    }

    if (!localHasBusinessData) {
      if (remoteEmpty) {
        state.syncHashState = ensureHashSyncState(state.syncHashState);
        state.syncHashState.localDirty = false;
        state.syncHashState.localPayloadHash = facts.localPayloadHash || local.hash || "";
        state.syncHashState.baseRemoteHash = "";
        state.syncHashState.dirtySince = "";
        state.syncHashState.lastSyncStatus = "local_only";
        state.syncHashState.lastSyncError = "";
        state.syncHashState.localRecoveryRequired = false;
        persistHashSyncState();
        updateSyncIndicator();
        return true;
      }

      if (remoteHasData) {
        appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=pull_remote remoteKind=" + (remote && remote.kind) + " runId=" + runId });
        if (hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) {
          const recheck = currentSyncFacts({ persistHash: true });
          if (remote.readOnlyAuthFallback) {
            return syncBranchReadOnlyMergeLocal({ remote, remotePayload, local: recheck, reason: "local_changed_before_pull_read_only", runId });
          }
          syncResult = await syncBranchMerge({ remote, remotePayload, local: recheck, keepalive, reason: "local_changed_before_pull", runId });
          if (syncResult && syncResult.needPull) {
            syncResult = await Promise.resolve(pullRemotePayload({ remote, remotePayload, remoteHash: currentRemoteHash(remote), reason: "merge_blocked_clean_local_pull", runId, localRevisionAtStart, localHashAtStart, allowCleanLocalOverwrite: true }));
          }
          return syncResult;
        }
        syncResult = await Promise.resolve(pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId, localRevisionAtStart, localHashAtStart }));
        return syncResult;
      }

      recordHashSyncFailure("云端 sync.json 无法判断为安全可拉取数据，已停止同步", {
        errorKind: "remote_unreadable_payload",
        banner: true,
        dialog: true,
        runId,
        remote,
        remoteHash,
        remoteHasBusinessData: remoteHasData,
        readOnly,
        technical: "remote.kind=" + String(remote && remote.kind || "")
      });
      return false;
    }

    if (readOnly) {
      if (remoteHasData && remoteHash !== syncState.baseRemoteHash) {
        // CLEAN local + remote changed → Pull (readOnly blocks Push, not Pull)
        if (!effectiveDirty && !syncState.localDirty) {
          appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=readonly_pull_remote_changed_local_clean runId=" + runId });
          syncResult = await Promise.resolve(pullRemotePayload({
            remote, remotePayload, remoteHash,
            reason: "readonly_remote_changed_local_clean", runId,
            localRevisionAtStart, localHashAtStart,
            allowCleanLocalOverwrite: true
          }));
          return syncResult;
        }
        // DIRTY local + remote changed → readOnly local merge (can't Push)
        syncResult = await syncBranchReadOnlyMergeLocal({ remote, remotePayload, local: facts, reason: "read_only_remote_changed_local_dirty", runId });
        return syncResult;
      }
      if (effectiveDirty) {
        markReadOnlyDirtyState("本地有未上传数据，但 PAT 无效或无写权限，当前无法上传。", facts, { runId });
        syncResult = { ok: false, readOnlyDirty: true };
        return syncResult;
      }
      setReadOnlySyncState("PAT 无效或无写权限，当前只读。", { runId });
      syncResult = { ok: false, readOnly: true };
      return syncResult;
    }

    if (remoteHash === syncState.baseRemoteHash && !effectiveDirty) {
      markSessionRemoteChecked(remote, runId, "syncTick.noop_same_hash");
      syncResult = { ok: true, noop: true };
      return syncResult;
    }

    if (remoteHash === syncState.baseRemoteHash && effectiveDirty) {
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=push_local hash_match dirty=true runId=" + runId });
      syncResult = await syncBranchPushLocal({ remote, local: facts, keepalive, reason, runId, remoteHashAtDecision: remoteHash });
      return syncResult;
    }

    if (remoteHash !== syncState.baseRemoteHash) {
      if (!remoteHasData) {
        recordHashSyncFailure("云端 sync.json 无法安全解析为可合并数据，已停止自动同步", {
          errorKind: "remote_invalid",
          banner: true,
          dialog: true,
          runId,
          remote,
          remoteHash,
          remoteHasBusinessData: remoteHasData,
          readOnly,
          technical: "remote.kind=" + String(remote && remote.kind || "")
        });
        syncResult = { ok: false, remoteInvalid: true };
        return syncResult;
      }

      // CLEAN local + remote changed → PULL (not merge!)
      if (!effectiveDirty && !syncState.localDirty) {
        appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=pull_remote_changed_local_clean remoteHash=" + String(remoteHash || "").slice(0, 8) + " baseHash=" + String(syncState.baseRemoteHash || "").slice(0, 8) + " localHash=" + String(facts.localPayloadHash || "").slice(0, 8) + " runId=" + runId });
        if (hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) {
          const recheck = currentSyncFacts({ persistHash: true });
          syncResult = await syncBranchMerge({ remote, remotePayload, local: recheck, keepalive, reason: "local_changed_before_clean_pull", runId });
          if (syncResult && syncResult.needPull) {
            syncResult = await Promise.resolve(pullRemotePayload({ remote, remotePayload, remoteHash: currentRemoteHash(remote), reason: "merge_blocked_clean_local_pull", runId, localRevisionAtStart, localHashAtStart, allowCleanLocalOverwrite: true }));
          }
          return syncResult;
        }
        syncResult = await Promise.resolve(pullRemotePayload({
          remote, remotePayload, remoteHash,
          reason: "clean_local_remote_changed_pull", runId,
          localRevisionAtStart, localHashAtStart,
          allowCleanLocalOverwrite: true
        }));
        return syncResult;
      }

      // DIRTY local + remote changed → MERGE
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=merge_dirty_local_remote_changed remoteHash=" + String(remoteHash || "").slice(0, 8) + " baseHash=" + String(syncState.baseRemoteHash || "").slice(0, 8) + " localHash=" + String(facts.localPayloadHash || "").slice(0, 8) + " runId=" + runId });
      if (hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) {
        const recheck = currentSyncFacts({ persistHash: true });
        syncResult = await syncBranchMerge({ remote, remotePayload, local: recheck, keepalive, reason: "local_changed_before_dirty_merge", runId });
        if (syncResult && syncResult.needPull) {
          syncResult = await Promise.resolve(pullRemotePayload({ remote, remotePayload, remoteHash: currentRemoteHash(remote), reason: "merge_blocked_clean_local_pull", runId, localRevisionAtStart, localHashAtStart, allowCleanLocalOverwrite: true }));
        }
        return syncResult;
      }
      syncResult = await syncBranchMerge({ remote, remotePayload, local: facts, keepalive, reason: "dirty_local_remote_changed_merge", runId });
      if (syncResult && syncResult.needPull) {
        syncResult = await Promise.resolve(pullRemotePayload({ remote, remotePayload, remoteHash: currentRemoteHash(remote), reason: "merge_blocked_clean_local_pull", runId, localRevisionAtStart, localHashAtStart, allowCleanLocalOverwrite: true }));
      }
      return syncResult;
    }

    // Should not reach here with correct branching above
    syncResult = { ok: false, unknown: true };
    return syncResult;
  } catch (error) {
    if (!isStaleSyncRun(runId)) {
      recordHashSyncFailure(syncErrorMessage(error), { errorKind: "remote_get_failed", title: "云同步请求失败", banner: true, dialog: true, runId, technical: error && (error.stack || error.message) });
    }
    syncResult = { ok: false, error: true };
    return syncResult;
  } finally {
    if (!isStaleSyncRun(runId)) {
      markSyncProgress("sync:finalize", runId);
      var elapsedMs = Date.now() - startedAtMs;

      // sync:complete = syncTick 流程结束（不一定已 cloud_saved）
      // sync:mark_clean = 已确认云端保存或加载
      // sync:local_changed_during_verify = 上一轮云端已写入，但本地又产生新变化
      // sync:failed = 真失败
      appendAuditEvent({
        type: "sync:complete",
        message: "session=" + TAB_ID + " runId=" + runId + " elapsed=" + elapsedMs + "ms reason=" + (reason || "") + " result=" + summarizeSyncResult(syncResult)
      });

      state.isSyncing = false;
      state.syncStartedAt = 0;
      state.syncLastProgressAt = 0;
      state.lastSyncFinishedAt = Date.now();
      refreshVisibleSyncDiagnostics();
      if (typeof refreshCurrentBusinessViewAfterSync === "function") refreshCurrentBusinessViewAfterSync();
    }

    releaseCrossTabSyncLock();
  }
}


