"use strict";

function enterSyncInfoMode(message) {
  if (state.view === "setup") {
    state.setupStatus = { message: message, type: "success" };
    renderSetup();
  }
}

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
  var normalizedStatus = status === "cloud_saved" ? "cloud_ok" : (status || "cloud_loaded");
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.baseRemoteHash = payloadHash || "";
  state.syncHashState.localPayloadHash = payloadHash || "";
  state.syncHashState.lastSyncedPayloadHash = payloadHash || "";
  state.syncHashState.businessHashSchemaVersion = BUSINESS_HASH_SCHEMA_VERSION;
  state.syncHashState.hashSchemaNeedsRemoteCheck = false;
  state.syncHashState.schemaMigrationPreviousDirty = false;
  state.syncHashState.localDirty = false;
  state.syncHashState.dirtySince = "";
  state.syncHashState.localRecoveryRequired = false;
  state.syncHashState.lastSyncStatus = normalizedStatus;
  state.syncHashState.lastSyncError = "";
  state.syncHashState.lastErrorKind = "";
  state.syncHashState.lastErrorStage = "";
  state.syncHashState.lastErrorTransport = "";
  state.syncHashState.lastErrorHttpStatus = 0;
  state.syncHashState.lastErrorTechnical = "";
  state.lastDirtyReason = "";
  state.lastDirtyFromVerify = false;
  state.lastMarkCleanAtMs = Date.now();
  state.syncHashState.consecutiveSyncFailures = 0;
  state.syncHashState.nextRetryAt = "";
  // 清 blocking error；cloud_ok 是唯一绿色保存态，cloud_saved 仅作旧别名输入。
  state.syncHashState.lastBlockingErrorAt = "";
  state.syncHashState.lastBlockingErrorCode = "";
  state.syncHashState.lastBlockingErrorText = "";
  state.syncHashState.lastBlockingErrorClearedAt = now;
  if (normalizedStatus === "cloud_ok") state.syncHashState.lastSuccessfulPushAt = now;
  if (normalizedStatus === "cloud_loaded") state.syncHashState.lastSuccessfulPullAt = now;
  persistHashSyncState();
  if (normalizedStatus === "cloud_ok" || normalizedStatus === "cloud_loaded") {
    updateLegacyMetaAfterRemote(remote, payloadHash, normalizedStatus === "cloud_ok" ? "push" : "pull");
  }
  // 只有真实 remote GET 确认后才更新 session remote confirmation
  if (options && options.remoteVerified === true) {
    state.sessionRemoteCheckDone = true;
    state.latestRemoteHashSeen = payloadHash || "";
    state.latestRemoteKindSeen = (remote && remote.kind) || "";
    state.sessionRemoteCheckAt = now;
  }
  refreshVisibleSyncDiagnostics();
  if (typeof closeRecoverableSyncProblemDialogAfterClean === "function") closeRecoverableSyncProblemDialogAfterClean();
  if (typeof clearActiveStudyTimerIfClean === "function") clearActiveStudyTimerIfClean();
  appendAuditEvent({
    type: "sync:mark_clean",
    message:
      "session=" + TAB_ID +
      " runId=" + (options && options.runId || "") +
      " status=" + String(normalizedStatus || "") +
      " hash=" + String(payloadHash || "").slice(0, 8)
  });
  return true;
}


function markHashDirty(localHash, reason, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  if (typeof auditLocalDirtySet === "function") auditLocalDirtySet(reason || "markHashDirty");
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
        "session=" + TAB_ID +
        " runId=" + (options.runId || "") +
        " reason=" + String(reason || "").slice(0, 100)
    });
  }
  return true;
}


function isRemoteApplyStorageKey(key) {
  key = String(key || "");
  return key === SYNC_META_KEY ||
    key === ROUND_STATE_KEY ||
    key === ROUND_ARCHIVES_KEY ||
    key === STUDY_SESSION_KEY ||
    key === PROGRESS_CURSOR_KEY ||
    key === UNKNOWN_PROGRESS_CURSOR_KEY ||
    key === PROGRESS_PENDING_KEY ||
    key === ACTIVITY_DRAFT_KEY ||
    key.startsWith("progress:") ||
    key.startsWith("unknown_progress:") ||
    key.startsWith("marks:") ||
    key.startsWith(MARK_STATES_PREFIX) ||
    key.startsWith("activity:") ||
    key.startsWith("unit_stats:");
}

function captureRemoteApplyTransaction() {
  var items = {};
  var keys = [];
  for (var i = 0; i < localStorage.length; i += 1) {
    var key = localStorage.key(i);
    if (!isRemoteApplyStorageKey(key)) continue;
    keys.push(key);
    items[key] = localStorage.getItem(key);
  }
  return {
    keys: keys,
    items: items,
    syncMeta: JSON.parse(JSON.stringify(ensureSyncMeta(state.syncMeta))),
    pendingProgressSync: state.pendingProgressSync === true,
    activityDirtyPending: state.activityDirtyPending === true,
    activityDraftPending: state.activityDraftPending === true,
    localBusinessRevision: Number(state.localBusinessRevision || 0),
    lastLocalBusinessChangeAt: Number(state.lastLocalBusinessChangeAt || 0),
    lastLocalBusinessChangeReason: String(state.lastLocalBusinessChangeReason || ""),
    lastLocalBusinessChangeSource: String(state.lastLocalBusinessChangeSource || ""),
    lastLocalBusinessChangeRunId: state.lastLocalBusinessChangeRunId || null
  };
}

function rollbackRemoteApplyTransaction(snapshot, options = {}) {
  if (!snapshot || !snapshot.items) return false;
  var ok = true;
  var beforeKeys = new Set(snapshot.keys || []);
  try {
    var currentKeys = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      if (isRemoteApplyStorageKey(key)) currentKeys.push(key);
    }
    currentKeys.forEach(function(key) {
      if (!beforeKeys.has(key)) localStorage.removeItem(key);
    });
    Object.keys(snapshot.items).forEach(function(key) {
      localStorage.setItem(key, snapshot.items[key]);
    });
  } catch (error) {
    ok = false;
    try {
      state.syncHashState = ensureHashSyncState(state.syncHashState);
      state.syncHashState.localRecoveryRequired = true;
      state.syncHashState.lastBackupError = "本地回滚失败：" + String(error && error.message || error || "未知错误");
      persistHashSyncState();
    } catch (_) {}
  }
  state.syncMeta = ensureSyncMeta(snapshot.syncMeta);
  state.pendingProgressSync = snapshot.pendingProgressSync;
  state.activityDirtyPending = snapshot.activityDirtyPending;
  state.activityDraftPending = snapshot.activityDraftPending;
  state.localBusinessRevision = snapshot.localBusinessRevision;
  state.lastLocalBusinessChangeAt = snapshot.lastLocalBusinessChangeAt;
  state.lastLocalBusinessChangeReason = snapshot.lastLocalBusinessChangeReason;
  state.lastLocalBusinessChangeSource = snapshot.lastLocalBusinessChangeSource;
  state.lastLocalBusinessChangeRunId = snapshot.lastLocalBusinessChangeRunId;
  appendAuditEvent({
    type: ok ? "sync:local_apply_rolled_back" : "sync:local_apply_rollback_failed",
    message: "session=" + TAB_ID + " runId=" + String(options.runId || "") + " reason=" + String(options.reason || "")
  });
  return ok;
}

function applyRemotePayloadSafely(payload, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  var normalized = normalizeSyncPayload(payload);
  if (!validateSyncPayload(normalized)) return false;
  const expectedHash = options.expectedHash || businessPayloadHash(normalized);
  const beforePayload = normalizeSyncPayload(collectSyncPayload());
  const roundChanged = !sameRoundState(beforePayload.round, normalized.round);
  if (options.allowWhenLocalEmptyOnly && hasBusinessData(beforePayload)) return false;
  if (hasBusinessData(beforePayload)) {
    var backupSaved = writeHashBackup("pre_overwrite", beforePayload, options.reason || options.source || "local_apply");
    if (!backupSaved) {
      recordHashSyncFailure("本地覆盖前备份写入失败，已停止应用云端数据", {
        errorKind: "local_backup_write_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        stage: "local_backup"
      });
      return false;
    }
  }
  var transactionSnapshot;
  try {
    transactionSnapshot = captureRemoteApplyTransaction();
  } catch (error) {
    recordHashSyncFailure("无法建立本地写入事务，已停止应用云端数据", {
      errorKind: "local_transaction_snapshot_failed",
      runId: options.runId,
      banner: true,
      dialog: true,
      stage: "local_apply_snapshot",
      technical: String(error && error.message || error || "")
    });
    return false;
  }
  markSyncProgress("local:apply:start", options.runId);
  const previousApplying = state.applyingRemotePayload;
  const previousSuppressDirty = state.suppressDirty;
  state.applyingRemotePayload = true;
  state.suppressDirty = true;
  try {
    // 云端 payload 不覆盖本机 UI settings；只规范化并保留当前设备的设置。
    normalizeSettings();
    var allSaved = true;
    allSaved = saveRoundState(normalized.round) !== false && allSaved;
    allSaved = saveRoundArchives(normalized.archives) !== false && allSaved;
    Object.keys(normalized.progress).forEach(function(bookId) {
      allSaved = saveProgress(bookId, normalized.progress[bookId], { touch: false }) !== false && allSaved;
    });
    if (normalized.markStates && Object.keys(normalized.markStates).length) {
      Object.keys(normalized.markStates).forEach(function(bookId) {
        allSaved = saveMarkStates(bookId, normalized.markStates[bookId], { touch: false, syncMarks: true }) !== false && allSaved;
      });
    } else {
      Object.keys(normalized.marks).forEach(function(bookId) {
        allSaved = saveMarks(bookId, normalized.marks[bookId], { touch: false, updateStates: true }) !== false && allSaved;
      });
    }
    Object.keys(normalized.activity).forEach(function(bookId) {
      allSaved = saveActivity(bookId, normalized.activity[bookId], { touch: false }) !== false && allSaved;
    });
    Object.keys(normalized.unitStats).forEach(function(bookId) {
      allSaved = saveUnitStats(bookId, normalized.unitStats[bookId], { touch: false }) !== false && allSaved;
    });
    Object.keys(normalized.unknownProgress).forEach(function(bookId) {
      allSaved = applyUnknownProgressPayload(bookId, normalized.unknownProgress[bookId]) !== false && allSaved;
    });
    if (typeof syncProgressCursorFromCloudPayload === "function") {
      allSaved = syncProgressCursorFromCloudPayload(normalized) !== false && allSaved;
    }
    if (roundChanged) {
      try { localStorage.removeItem(STUDY_SESSION_KEY); } catch (_) { allSaved = false; }
    }
    if (!allSaved) {
      rollbackRemoteApplyTransaction(transactionSnapshot, { runId: options.runId, reason: "storage_write_failed" });
      recordHashSyncFailure("云端数据写入本地存储失败，已自动回滚到写入前状态并保留覆盖前备份", {
        errorKind: "local_storage_write_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        stage: "local_apply"
      });
      return false;
    }
    if (typeof clearProgressPending === "function") {
      allSaved = clearProgressPending() !== false && allSaved;
    }
    if (typeof clearActivityDraftPending === "function") {
      allSaved = clearActivityDraftPending() !== false && allSaved;
    }
    state.syncMeta.localUpdatedAt = normalized.updatedAt || beijingISOString();
    allSaved = persistSyncMeta() !== false && allSaved;
    if (!allSaved) {
      rollbackRemoteApplyTransaction(transactionSnapshot, { runId: options.runId, reason: "pending_or_meta_write_failed" });
      recordHashSyncFailure("云端数据写入收尾失败，已自动回滚到写入前状态", {
        errorKind: "local_storage_write_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        stage: "local_apply_finalize"
      });
      return false;
    }
    bumpLocalBusinessRevision(options.reason || options.source || "remote_apply", { source: options.source === "rescue" ? "rescue" : "sync", runId: options.runId || null });
    const afterHash = businessPayloadHash(collectSyncPayload());
    if (afterHash !== expectedHash) {
      rollbackRemoteApplyTransaction(transactionSnapshot, { runId: options.runId, reason: "hash_verify_failed" });
      recordHashSyncFailure("本地数据写入后校验失败，已自动回滚到写入前状态并保留覆盖前备份", {
        errorKind: "local_apply_verify_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        stage: "local_verify",
        technical: "expected=" + expectedHash + ", actual=" + afterHash
      });
      return false;
    }
    if (roundChanged && typeof resetStudyRuntimeAfterRoundChange === "function") resetStudyRuntimeAfterRoundChange();
    markSyncProgress("local:apply:done", options.runId);
    return true;
  } finally {
    state.applyingRemotePayload = previousApplying;
    state.suppressDirty = previousSuppressDirty;
  }
}


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
  markHashCleanFromRemote(remote || { kind: "valid_nonempty", payloadHash: computedHash, snapshot: normalized }, computedHash, "cloud_loaded", { remoteVerified: Boolean(remote) });
  enterSyncInfoMode("已从云端恢复到本机");
  return true;
}

function pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId, localRevisionAtStart, localHashAtStart }) {
  if (isStaleSyncRun(runId)) return false;

  const beforeFacts = currentSyncFacts({ persistHash: true });
  const normalizedRemotePayload = normalizeSyncPayload(remotePayload);
  const localHasData = hasBusinessData(beforeFacts.payload);
  const remoteHasData = remote && remote.kind === "valid_nonempty" && hasBusinessData(normalizedRemotePayload);
  if (!remoteHasData) {
    showSyncProblemDialog({
      severity: "warning",
      code: "PULL_BLOCKED_REMOTE_EMPTY",
      title: "已阻止不安全的云端 Pull",
      message: "云端没有可安全拉取的非空学习数据。",
      runId
    });
    return { ok: false, pullBlocked: true, remoteEmpty: true };
  }

  if (localHasData) {
    markHashDirty(beforeFacts.localPayloadHash, "已阻止直接 Pull：本地仍有学习数据，不能用云端直接覆盖。", { runId });
    showSyncProblemDialog({
      severity: "warning",
      code: "PULL_BLOCKED_LOCAL_HAS_DATA",
      title: "已阻止不安全的云端 Pull",
      message: "本地有学习数据，因此没有直接覆盖。系统只允许在本地业务数据为空时执行 Pull；其他情况必须合并。",
      runId
    });
    return { ok: false, pullBlocked: true, localHasData: true };
  }

  if (localRevisionAtStart !== undefined && hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) return false;
  const ok = applyRemotePayloadSafely(normalizedRemotePayload, { source: "remote_pull", expectedHash: remoteHash, runId, reason: reason || "remote_pull" });
  if (!ok) return { ok: false, applyFailed: true };
  const afterHash = businessPayloadHash(collectSyncPayload());
  if (afterHash !== remoteHash) {
    recordHashSyncFailure("云端数据应用到本地后校验失败", { errorKind: "local_apply_verify_failed", banner: true, dialog: true, runId, technical: "expected=" + remoteHash + ", actual=" + afterHash });
    return { ok: false, applyFailed: true };
  }
  renderCurrentView({ touchProgress: false });
  markHashCleanFromRemote(remote, remoteHash, "cloud_loaded", { runId: runId, remoteVerified: true });
  enterSyncInfoMode("已从云端加载");
  if (typeof refreshCurrentBusinessViewAfterSync === "function") refreshCurrentBusinessViewAfterSync();
  return { ok: true, pulled: true, hash: remoteHash };
}
function applyUnknownProgressPayload(bookId, progressMap) {
  const book = BOOKS.find((item) => item.id === bookId);
  if (!book || !isPlainObject(progressMap)) return false;
  var allSaved = true;
  if (isPlainObject(progressMap.book)) {
    allSaved = saveUnknownProgress(book.id, { scope: "book" }, sanitizeProgressPayload(progressMap.book), { touch: false }) !== false && allSaved;
  }
  const units = isPlainObject(progressMap.units) ? progressMap.units : {};
  Object.entries(units).forEach(([unit, progress]) => {
    const unitNumber = Number(unit);
    if (!Number.isFinite(unitNumber) || unitNumber < 1 || unitNumber > book.totalUnits) return;
    allSaved = saveUnknownProgress(book.id, { scope: "unit", unit: unitNumber }, sanitizeProgressPayload(progress), { touch: false }) !== false && allSaved;
  });
  return allSaved;
}

