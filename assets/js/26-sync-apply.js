"use strict";

function updateLegacyMetaAfterRemote(remote, payloadHash, type) {
  const now = beijingISOString();
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.initialized = true;
  state.syncMeta.gistId = state.cloud.gistId;
  state.syncMeta.fileName = SYNC_FILE_NAME;
  state.syncMeta.lastRemoteVersion = remote?.remoteVersion || state.syncMeta.lastRemoteVersion || "";
  state.syncMeta.lastRemoteUpdatedAt = remote?.remoteUpdatedAt || state.syncMeta.lastRemoteUpdatedAt || "";
  state.syncMeta.lastSyncedPayloadHash = payloadHash || "";
  state.syncMeta.lastSyncedLocalUpdatedAt = now;
  state.syncMeta.lastSyncErrorAt = "";
  state.syncMeta.lastSyncErrorMessage = "";
  if (type === "push") {
    state.syncMeta.lastCloudSaveConfirmedAt = now;
    state.syncMeta.lastSuccessfulPushAt = now;
    state.syncMeta.cloudWritable = true;
    state.syncMeta.readOnlyMode = false;
  }
  if (type === "pull") {
    state.syncMeta.lastSuccessfulPullAt = now;
  }
  persistSyncMeta();
}


function markHashCleanFromRemote(remote, payloadHash, status, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  const now = beijingISOString();
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.baseRemoteHash = payloadHash || "";
  state.syncHashState.localPayloadHash = payloadHash || "";
  state.syncHashState.localDirty = false;
  state.syncHashState.dirtySince = "";
  state.syncHashState.localRecoveryRequired = false;
  state.syncHashState.lastSyncStatus = status || "cloud_loaded";
  state.syncHashState.lastSyncError = "";
  state.syncHashState.consecutiveSyncFailures = 0;
  state.syncHashState.nextRetryAt = "";
  if (status === "cloud_saved") state.syncHashState.lastSuccessfulPushAt = now;
  if (status === "cloud_loaded") state.syncHashState.lastSuccessfulPullAt = now;
  persistHashSyncState();
  if (status === "cloud_saved" || status === "cloud_loaded") {
    updateLegacyMetaAfterRemote(remote, payloadHash, status === "cloud_saved" ? "push" : "pull");
  }
  refreshVisibleSyncDiagnostics();
  appendAuditEvent({
    type: "sync:mark_clean",
    message:
      "runId=" + (options && options.runId || "") +
      " status=" + String(status || "") +
      " hash=" + String(payloadHash || "").slice(0, 8)
  });
  return true;
}


function markHashDirty(localHash, reason, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  var wasDirty = state.syncHashState && state.syncHashState.localDirty === true;
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localPayloadHash = localHash || state.syncHashState.localPayloadHash || "";
  state.syncHashState.localDirty = true;
  if (!state.syncHashState.dirtySince) state.syncHashState.dirtySince = beijingISOString();
  state.syncHashState.lastSyncStatus = "dirty";
  if (reason) state.syncHashState.lastSyncError = reason;
  persistHashSyncState();
  refreshVisibleSyncDiagnostics();

  if (!wasDirty) {
    appendAuditEvent({
      type: "sync:mark_dirty",
      message:
        "runId=" + (options.runId || "") +
        " reason=" + String(reason || "").slice(0, 100)
    });
  }
  return true;
}


function applyRemotePayloadSafely(payload, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  var normalized = normalizeSyncPayload(payload);
  if (!validateSyncPayload(normalized)) return false;
  const expectedHash = options.expectedHash || businessPayloadHash(normalized);
  const beforePayload = normalizeSyncPayload(collectSyncPayload());
  if (options.allowWhenLocalEmptyOnly && hasBusinessData(beforePayload)) return false;
  if (hasBusinessData(beforePayload)) {
    writeHashBackup("pre_overwrite", beforePayload, options.reason || options.source || "local_apply");
  }
  markSyncProgress("local:apply:start", options.runId);
  const previousApplying = state.applyingRemotePayload;
  const previousSuppressDirty = state.suppressDirty;
  state.applyingRemotePayload = true;
  state.suppressDirty = true;
  try {
    state.settings = { ...DEFAULT_SETTINGS, ...normalized.settings };
    normalizeSettings();
    if (!saveJson(SETTINGS_KEY, state.settings, { priority: "business" })) return false;
    Object.keys(normalized.progress).forEach(function(bookId) {
      saveProgress(bookId, normalized.progress[bookId], { touch: false });
    });
    Object.keys(normalized.marks).forEach(function(bookId) {
      saveMarks(bookId, normalized.marks[bookId], { touch: false });
    });
    Object.keys(normalized.activity).forEach(function(bookId) {
      saveActivity(bookId, normalized.activity[bookId], { touch: false });
    });
    Object.keys(normalized.unitStats).forEach(function(bookId) {
      saveUnitStats(bookId, normalized.unitStats[bookId], { touch: false });
    });
    Object.keys(normalized.unknownProgress).forEach(function(bookId) {
      applyUnknownProgressPayload(bookId, normalized.unknownProgress[bookId]);
    });
    state.syncMeta.localUpdatedAt = normalized.updatedAt || beijingISOString();
    persistSyncMeta();
    bumpLocalBusinessRevision(options.reason || options.source || "remote_apply", { source: options.source === "rescue" ? "rescue" : "sync", runId: options.runId || null });
    const afterHash = businessPayloadHash(collectSyncPayload());
    if (afterHash !== expectedHash) {
      recordHashSyncFailure("本地数据写入后校验失败，已保留覆盖前备份", {
        errorKind: "local_apply_verify_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        technical: "expected=" + expectedHash + ", actual=" + afterHash
      });
      return false;
    }
    markSyncProgress("local:apply:done", options.runId);
    return true;
  } finally {
    state.applyingRemotePayload = previousApplying;
    state.suppressDirty = previousSuppressDirty;
  }
}

// P0: 已废弃。P0 使用 syncTick() → syncBranchPushLocal()。

function restoreRemotePayloadFromDialog(remotePayload, remoteHash, remote) {
  const normalized = normalizeSyncPayload(remotePayload || {});
  const computedHash = remoteHash || businessPayloadHash(normalized);
  if (!validateSyncPayload(normalized) || !hasBusinessData(normalized)) {
    showSyncProblemDialog({
      severity: "warning",
      code: "REMOTE_RESTORE_EMPTY_OR_INVALID",
      title: "云端数据不可直接恢复",
      message: "云端 payload 为空或校验失败，已停止一键恢复。",
      canRetry: true,
      force: true
    });
    return false;
  }

  const localPayload = normalizeSyncPayload(collectSyncPayload());
  if (hasBusinessData(localPayload)) {
    showSyncProblemDialog({
      severity: "warning",
      code: "REMOTE_RESTORE_LOCAL_NOT_EMPTY",
      title: "本机已有学习数据",
      message: "不能直接用云端覆盖本机数据。请使用重新同步一次，系统会合并云端和本机数据。",
      canRetry: true,
      force: true
    });
    syncTick({ reason: "remote_restore_merge", bypassBackoff: true });
    return false;
  }

  const ok = applyRemotePayloadSafely(normalized, {
    source: "remote_pull",
    expectedHash: computedHash,
    reason: "dialog_remote_restore"
  });
  if (!ok) return false;
  const afterHash = businessPayloadHash(collectSyncPayload());
  if (afterHash !== computedHash) {
    recordHashSyncFailure("从云端恢复到本机后校验失败", {
      errorKind: "local_apply_verify_failed",
      banner: true,
      dialog: true,
      technical: "expected=" + computedHash + ", actual=" + afterHash
    });
    return false;
  }
  renderCurrentView({ touchProgress: false });
  markHashCleanFromRemote(remote || { kind: "valid_nonempty", payloadHash: computedHash, snapshot: normalized }, computedHash, "cloud_loaded");
  enterSyncInfoMode("已从云端恢复到本机");
  return true;
}

function pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId, localRevisionAtStart, localHashAtStart }) {
  if (isStaleSyncRun(runId)) return false;

  const beforeFacts = currentSyncFacts({ persistHash: true });
  const normalizedRemotePayload = normalizeSyncPayload(remotePayload);
  const localHasData = hasBusinessData(beforeFacts.payload);
  const remoteHasData = remote && remote.kind === "valid_nonempty" && hasBusinessData(normalizedRemotePayload);

  if (!remoteHasData || localHasData) {
    const message = localHasData
      ? "已阻止直接 Pull：本地仍有学习数据，不能用云端直接覆盖。"
      : "已阻止直接 Pull：云端没有可安全拉取的非空学习数据。";
    if (localHasData) markHashDirty(beforeFacts.localPayloadHash, message, { runId });
    const fields = typeof makeSyncRiskProblemFields === "function"
      ? makeSyncRiskProblemFields(remote, beforeFacts, { remoteHash, remoteHasBusinessData: remoteHasData, readOnly: remote && remote.readOnlyAuthFallback, runId })
      : {};
    const technical = typeof syncRiskTechnicalText === "function"
      ? syncRiskTechnicalText(fields)
      : "remote.kind=" + String(remote && remote.kind || "") + "\nremoteHash=" + String(remoteHash || "");
    showSyncProblemDialog({
      severity: "warning",
      code: localHasData ? "PULL_BLOCKED_LOCAL_HAS_DATA" : "PULL_BLOCKED_REMOTE_EMPTY",
      title: "已阻止不安全的云端 Pull",
      message,
      technical,
      canCopy: true,
      canRetry: true,
      runId,
      ...fields
    });
    return false;
  }

  if (localRevisionAtStart !== undefined && hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) return false;
  const ok = applyRemotePayloadSafely(normalizedRemotePayload, { source: "remote_pull", expectedHash: remoteHash, runId, reason: reason || "remote_pull" });
  if (!ok) return false;
  const afterHash = businessPayloadHash(collectSyncPayload());
  if (afterHash !== remoteHash) {
    recordHashSyncFailure("云端数据应用到本地后校验失败", { errorKind: "local_apply_verify_failed", banner: true, dialog: true, runId, technical: "expected=" + remoteHash + ", actual=" + afterHash });
    return false;
  }
  renderCurrentView({ touchProgress: false });
  markHashCleanFromRemote(remote, remoteHash, "cloud_loaded", { runId });
  enterSyncInfoMode("已从云端加载");
  return true;
}
function applySyncPayload(payload) {
  const normalized = normalizeSyncPayload(payload);
  return applyRemotePayloadSafely(normalized, {
    source: "sync",
    expectedHash: businessPayloadHash(normalized),
    reason: "apply_sync_payload"
  });
}

function applyUnknownProgressPayload(bookId, progressMap) {
  const book = BOOKS.find((item) => item.id === bookId);
  if (!book || !isPlainObject(progressMap)) return;
  if (isPlainObject(progressMap.book)) {
    saveUnknownProgress(book.id, { scope: "book" }, sanitizeProgressPayload(progressMap.book), { touch: false });
  }
  const units = isPlainObject(progressMap.units) ? progressMap.units : {};
  Object.entries(units).forEach(([unit, progress]) => {
    const unitNumber = Number(unit);
    if (!Number.isFinite(unitNumber) || unitNumber < 1 || unitNumber > book.totalUnits) return;
    saveUnknownProgress(book.id, { scope: "unit", unit: unitNumber }, sanitizeProgressPayload(progress), { touch: false });
  });
}


