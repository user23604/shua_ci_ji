"use strict";


function pauseFlashPlaybackForManualSync(reason) {
  if (state.view !== "flash") return false;
  if (typeof touchStudyActivity === "function") touchStudyActivity(reason || "manual_sync");
  try { commitCurrentCardActivity(); } catch (_) {}
  try { clearTimers(); } catch (_) {}
  try { releaseWakeLock(); } catch (_) {}
  state.playbackPaused = true;
  if (typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary(reason || "manual_sync");
  if (typeof renderFlashcard === "function") renderFlashcard({ touchProgress: false });
  appendAuditEvent({ type: "sync:manual_paused_flash_playback", message: "reason=" + String(reason || "manual_sync") });
  return true;
}

async function autoPushToGist({ keepalive = false } = {}) {
  pauseFlashPlaybackForManualSync("manual_push");
  return syncTick({ reason: "manual_push", keepalive, bypassBackoff: true });
}


// ── syncTick ─────────────────────────────────────────────────────

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
  const remoteHash = currentRemoteHash(remote);
  if (remoteHash && mergedHash === remoteHash) {
    markHashCleanFromRemote(remote, mergedHash, "cloud_loaded", { runId, remoteVerified: true });
    appendAuditEvent({
      type: "sync:readonly_merge_remote_already_complete",
      message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(mergedHash || "").slice(0, 8)
    });
    return { ok: true, merged: true, noPatchNeeded: true, readOnly: true };
  }
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

// ── forced sync / active study guard ───────────────────────────────

// active-study guard functions moved to 27a-sync-active-study-guard.js.

function handleBusinessHashSchemaRemoteCheck(remote, localFacts, runId) {
  var syncState = ensureHashSyncState(state.syncHashState);
  if (!syncState.hashSchemaNeedsRemoteCheck) return null;
  var remoteHash = currentRemoteHash(remote);
  var localHash = localFacts && localFacts.localPayloadHash || "";
  var remoteHasData = remoteHasBusinessPayload(remote);
  syncState.businessHashSchemaVersion = BUSINESS_HASH_SCHEMA_VERSION;
  syncState.hashSchemaNeedsRemoteCheck = false;
  if (remoteHash && remoteHash === localHash) {
    markHashCleanFromRemote(remote, remoteHash, "cloud_loaded", { runId: runId, remoteVerified: true });
    appendAuditEvent({ type: "sync:business_hash_schema_remote_equal", message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(remoteHash || "").slice(0, 8) });
    return { ok: true, schemaRefreshedClean: true };
  }
  persistHashSyncState();
  appendAuditEvent({ type: "sync:business_hash_schema_remote_diff", message: "session=" + TAB_ID + " runId=" + runId + " previousDirty=" + String(!!syncState.schemaMigrationPreviousDirty) + " localHash=" + String(localHash || "").slice(0, 8) + " remoteHash=" + String(remoteHash || "").slice(0, 8) + " remoteHasData=" + String(!!remoteHasData) });
  if (syncState.schemaMigrationPreviousDirty) {
    markHashDirty(localHash, "business_hash_schema_changed_remote_diff", { runId: runId });
  }
  return null;
}



function markPageHiddenDuringSync() {
  state.pageHiddenDuringSyncAt = Date.now();
}

function shouldDowngradeFailureForBackground(reason) {
  if (reason === "pagehide_flush" || reason === "visibility_hidden_flush") return true;
  if (typeof document !== "undefined" && document.hidden) return true;
  if (state.pageHiddenDuringSyncAt && Date.now() - Number(state.pageHiddenDuringSyncAt || 0) < 15000) return true;
  return false;
}

function clearStaleDirtyIfRemoteMatches(remote, facts, runId) {
  var syncState = ensureHashSyncState(state.syncHashState);
  var localHash = String(facts && facts.localPayloadHash || syncState.localPayloadHash || "");
  var baseHash = String(syncState.baseRemoteHash || "");
  var remoteHash = String(currentRemoteHash(remote) || state.latestRemoteHashSeen || "");
  var hasPending = Boolean((typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) || (typeof hasPendingProgressSync === "function" && hasPendingProgressSync()) || (typeof hasPendingActivityDraft === "function" && hasPendingActivityDraft()));
  if (!syncState.localDirty || !localHash || !baseHash || !remoteHash || hasPending) return false;
  if (localHash !== baseHash || localHash !== remoteHash) return false;
  var status = syncState.lastSuccessfulPushAt ? "cloud_ok" : "cloud_loaded";
  appendAuditEvent({ type: "sync:stale_dirty_cleared", message: "session=" + TAB_ID + " runId=" + String(runId || "") + " hash=" + localHash.slice(0, 8) + " status=" + status });
  markHashCleanFromRemote(remote, localHash, status, { runId: runId, remoteVerified: true });
  return true;
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


async function syncTick(options = {}) {
  var reason = String(options && options.reason || "heartbeat");
  var lockManager = typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function"
    ? navigator.locks
    : null;
  if (!lockManager || options.webLockHeld === true) return syncTickInternal(options);

  var callbackStarted = false;
  var acquired = false;
  var result = false;
  try {
    await lockManager.request(WEB_SYNC_LOCK_NAME, { mode: "exclusive", ifAvailable: true }, async function(lock) {
      callbackStarted = true;
      if (!lock) return;
      acquired = true;
      result = await syncTickInternal({ ...options, webLockHeld: true });
    });
  } catch (error) {
    // 某些旧浏览器实现不支持 ifAvailable；仅在回调尚未开始时回退到原租约锁。
    if (!callbackStarted) return syncTickInternal(options);
    appendAuditEvent({
      type: "sync:web_lock_callback_failed",
      message: "session=" + TAB_ID + " reason=" + reason + " error=" + String(error && error.message || error || "")
    });
    return false;
  }

  if (!acquired) {
    appendAuditEvent({ type: "sync:skip_web_lock", message: "session=" + TAB_ID + " reason=" + reason });
    var syncState = ensureHashSyncState(state.syncHashState);
    if (syncState.localDirty || (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) {
      scheduleSyncSoon("web_lock_retry", 3000);
    }
    return false;
  }
  return result;
}
