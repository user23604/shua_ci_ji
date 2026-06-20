"use strict";

function ensureSyncMeta(meta = state.syncMeta) {
  const source = isPlainObject(meta) ? meta : {};
  const cloudGistId = String(state.cloud?.gistId || "").trim();
  const clientId = typeof source.clientId === "string" && source.clientId ? source.clientId : createClientId();
  const normalized = {
    ...DEFAULT_SYNC_META,
    ...source,
    fileName: SYNC_FILE_NAME,
    clientId
  };
  if (cloudGistId && normalized.gistId && normalized.gistId !== cloudGistId) {
    return {
      ...DEFAULT_SYNC_META,
      gistId: cloudGistId,
      fileName: SYNC_FILE_NAME,
      clientId,
      localUpdatedAt: typeof normalized.localUpdatedAt === "string" ? normalized.localUpdatedAt : ""
    };
  }
  normalized.initialized = normalized.initialized === true;
  normalized.gistId = cloudGistId || String(normalized.gistId || "");
  [
    "lastRemoteVersion",
    "lastRemoteUpdatedAt",
    "lastSyncedLocalUpdatedAt",
    "localUpdatedAt",
    "lastSuccessfulPushAt",
    "lastSuccessfulPullAt",
    "lastCloudSaveConfirmedAt",
    "lastSyncAttemptAt",
    "lastSyncErrorAt",
    "lastSyncErrorMessage",
    "lastSyncedPayloadHash",
    "dirtySince"
  ].forEach(function(key) {
    normalized[key] = typeof normalized[key] === "string" ? normalized[key] : "";
  });
  ["cloudWritable", "readOnlyMode"].forEach(function(key) {
    normalized[key] = normalized[key] === true;
  });
  normalized.localSeq = Math.max(0, Number(normalized.localSeq) || 0);
  return normalized;
}


function resetSyncMetaForGist(gistId = state.cloud.gistId) {
  state.syncMeta = {
    ...DEFAULT_SYNC_META,
    gistId: String(gistId || "").trim(),
    fileName: SYNC_FILE_NAME,
    clientId: ensureSyncMeta().clientId,
    localUpdatedAt: ensureSyncMeta().localUpdatedAt
  };
  persistSyncMeta();
}


function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


function createOpId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


function loadPendingOpsStore() {
  const store = loadJson(PENDING_OPS_KEY, { ops: [] });
  return {
    ops: Array.isArray(store.ops) ? store.ops.filter(isPlainObject) : []
  };
}


function savePendingOpsStore(store) {
  saveJson(PENDING_OPS_KEY, { ops: Array.isArray(store?.ops) ? store.ops : [] });
}


function getPendingOps() {
  return compactPendingOps(loadPendingOpsStore().ops);
}


function clearPendingOps() {
  savePendingOpsStore({ ops: [] });
}


function nextSeq() {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.localSeq += 1;
  persistSyncMeta();
  return state.syncMeta.localSeq;
}


function makeOpId() {
  return (state.syncMeta.clientId || "local") + ":" + nextSeq();
}


function localOpToWireOp(op) {
  // Convert flat local op to v2 wire format
  var wire = { opId: op.opId, clientId: state.syncMeta.clientId, seq: Number(op.seq) || 0, type: op.type, createdAt: op.createdAt };
  var payload = {};
  Object.keys(op).forEach(function(k) {
    if (k === "opId" || k === "clientId" || k === "seq" || k === "type" || k === "createdAt" || k === "baseRemoteVersion") return;
    payload[k] = op[k];
  });
  wire.payload = payload;
  return wire;
}


function wireOpToLocalOp(wire) {
  var local = { opId: wire.opId, type: wire.type, createdAt: wire.createdAt, seq: Number(wire.seq) || 0, clientId: wire.clientId || "" };
  if (wire.payload && typeof wire.payload === "object") {
    Object.keys(wire.payload).forEach(function(k) { local[k] = wire.payload[k]; });
  }
  return local;
}

// P0: pendingOps 已冻结，不再写入新操作。已有数据保留仅诊断。
// 旧 pendingOps 不参与 dirty 判断、绿灯判断、Pull/Push 决策。

function appendPendingOp(op) {
  // P0: pendingOps 已冻结，不再写入
  return;
}


function compactPendingOps(ops) {
  const latest = new Map();
  const passthrough = [];
  (Array.isArray(ops) ? ops : []).filter(isPlainObject).forEach((op) => {
    const key = pendingOpKey(op);
    if (!key) {
      passthrough.push(op);
      return;
    }
    const existing = latest.get(key);
    if (!existing || dateMs(op.createdAt) >= dateMs(existing.createdAt)) latest.set(key, op);
  });
  return [...passthrough, ...latest.values()].sort((a, b) => dateMs(a.createdAt) - dateMs(b.createdAt));
}


function pendingOpKey(op) {
  if (!isPlainObject(op) || !op.type) return "";
  if (op.type === "word.mark.set") return `${op.type}:${op.bookId}:${Number(op.wordId) || 0}`;
  if (op.type === "progress.set") return `${op.type}:${op.bookId}`;
  if (op.type === "unknownProgress.set") return `${op.type}:${op.bookId}:${op.scope}:${Number(op.unit) || 0}`;
  if (op.type === "unitStats.completed.set") return `${op.type}:${op.bookId}:${Number(op.unit) || 0}`;
  if (op.type === "activity.day.set") return `${op.type}:${op.bookId}:${op.date}`;
  if (op.type === "settings.set") return `${op.type}`;
  return "";
}

function hasLocalChangedSinceSyncStart(localUpdatedAtAtStart, opIdsAtStart) {
  const initialIds = new Set((Array.isArray(opIdsAtStart) ? opIdsAtStart : []).filter(Boolean));
  const currentIds = getPendingOps().map((op) => op.opId).filter(Boolean);
  if (currentIds.length !== initialIds.size) return true;
  if (currentIds.some((id) => !initialIds.has(id))) return true;
  const currentUpdatedAt = ensureSyncMeta(state.syncMeta).localUpdatedAt || "";
  return currentUpdatedAt !== (localUpdatedAtAtStart || "");
}


function stopIfLocalChangedDuringPull(localUpdatedAtAtStart, opIdsAtStart) {
  if (!hasLocalChangedSinceSyncStart(localUpdatedAtAtStart, opIdsAtStart)) return false;
  enterSafeConflictMode("同步过程中检测到新的本地操作，本轮已停止以避免覆盖。请稍后再次同步。");
  updateSyncIndicator();
  return true;
}

// ── Hash-based P0 sync state helpers ──────────────────────────────────


function ensureHashSyncState(sourceState = state.syncHashState) {
  const source = isPlainObject(sourceState) ? sourceState : {};
  return {
    ...DEFAULT_HASH_SYNC_STATE,
    ...source,
    localDirty: source.localDirty === true,
    baseRemoteHash: typeof source.baseRemoteHash === "string" ? source.baseRemoteHash : "",
    localPayloadHash: typeof source.localPayloadHash === "string" ? source.localPayloadHash : "",
    dirtySince: typeof source.dirtySince === "string" ? source.dirtySince : "",
    lastSyncStatus: typeof source.lastSyncStatus === "string" ? source.lastSyncStatus : DEFAULT_HASH_SYNC_STATE.lastSyncStatus,
    lastSyncError: typeof source.lastSyncError === "string" ? source.lastSyncError : "",
    lastSuccessfulPushAt: typeof source.lastSuccessfulPushAt === "string" ? source.lastSuccessfulPushAt : "",
    lastSuccessfulPullAt: typeof source.lastSuccessfulPullAt === "string" ? source.lastSuccessfulPullAt : "",
    consecutiveSyncFailures: Math.max(0, Number(source.consecutiveSyncFailures) || 0),
    nextRetryAt: typeof source.nextRetryAt === "string" ? source.nextRetryAt : "",
    lastBackupError: typeof source.lastBackupError === "string" ? source.lastBackupError : "",
    localRecoveryRequired: source.localRecoveryRequired === true
  };
}


function persistHashSyncState() {
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  try {
    saveJson(HASH_SYNC_STATE_KEY, state.syncHashState);
  } catch (error) {
    state.syncHashState.lastBackupError = error?.message || "同步状态写入失败";
  }
}


function businessPayloadForHash(payload) {
  const normalized = normalizeSyncPayload(payload);
  return {
    settings: normalized.settings,
    progress: normalized.progress,
    unknownProgress: normalized.unknownProgress,
    marks: normalized.marks,
    activity: normalized.activity,
    unitStats: normalized.unitStats
  };
}


function businessPayloadHash(payload) {
  return stableStringifyHash(businessPayloadForHash(payload));
}


function currentBusinessPayload() {
  return normalizeSyncPayload(collectSyncPayload());
}


function refreshLocalPayloadHash({ persist = true } = {}) {
  const payload = currentBusinessPayload();
  const hash = businessPayloadHash(payload);
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localPayloadHash = hash;
  if (persist) persistHashSyncState();
  return { payload, hash };
}

// ── P0.6: 本地时间格式化 ──────────────────────────────────────────────

var HASH_EXCLUDE_KEYS = [
  "updatedAt", "savedAt", "syncedAt", "generatedAt",
  "lastHeartbeatAt", "localUpdatedAt", "lastSyncedLocalUpdatedAt",
  "dirtySince", "lastSyncAttemptAt", "diagnostic"
];


function stripTransient(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripTransient);
  var out = {};
  Object.keys(obj).sort().forEach(function(k) {
    if (HASH_EXCLUDE_KEYS.indexOf(k) !== -1) return;
    out[k] = stripTransient(obj[k]);
  });
  return out;
}


function businessHash(normalizedPayload) {
  return businessPayloadHash(normalizedPayload);
}


function computeLocalPayloadHash() {
  return businessPayloadHash(collectSyncPayload());
}


function emptyBusinessHash() {
  return businessPayloadHash(normalizeSyncPayload({}), { priority: "snapshot" });
}


function effectiveDirty() {
  return effectiveDirtyForHash(currentSyncFacts({ persistHash: false }), { priority: "snapshot" });
}


function countProgressRecords(payload) {
  const p = normalizeSyncPayload(payload || {});
  let count = 0;
  BOOKS.forEach(function(book) {
    if (Number(p.progress?.[book.id]?.lastWordId) > 0) count += 1;
    const up = p.unknownProgress?.[book.id] || {};
    if (Number(up.book?.lastWordId) > 0) count += 1;
    Object.values(up.units || {}).forEach(function(item) {
      if (Number(item && item.lastWordId) > 0) count += 1;
    });
  });
  return count;
}


function countMarkedRecords(payload) {
  const p = normalizeSyncPayload(payload || {});
  return BOOKS.reduce(function(total, book) {
    const marks = p.marks?.[book.id] || {};
    return total + normalizeIdList(marks.known).length + normalizeIdList(marks.unknown).length;
  }, 0);
}


function countActivityRecords(payload) {
  const p = normalizeSyncPayload(payload || {});
  let count = 0;
  BOOKS.forEach(function(book) {
    Object.values(p.activity?.[book.id]?.days || {}).forEach(function(day) {
      if (Number(day.seconds) > 0 || Number(day.words) > 0 || Number(day.known) > 0 || Number(day.unknown) > 0 || normalizeIdList(day.wordIds).length > 0) {
        count += 1;
      }
    });
  });
  return count;
}


function countUserStudyStateRecords(payload) {
  const p = normalizeSyncPayload(payload || {});
  let count = 0;
  BOOKS.forEach(function(book) {
    Object.values(p.unitStats?.[book.id]?.units || {}).forEach(function(unit) {
      if (Number(unit && unit.completed) > 0) count += 1;
    });
  });
  return count;
}


function hasBusinessData(payload) {
  const p = normalizeSyncPayload(payload || {});
  return countProgressRecords(p) > 0 ||
    countMarkedRecords(p) > 0 ||
    countActivityRecords(p) > 0 ||
    countUserStudyStateRecords(p) > 0;
}


function hasLearningData(payload) {
  return hasBusinessData(payload);
}


function isStrictlyEmptyLocalPayload(payload) {
  return !hasBusinessData(normalizeSyncPayload(payload || collectSyncPayload())) && !hasNonEmptyBackupData();
}


function effectiveDirtyForHash(factsOrHash = state.syncHashState.localPayloadHash) {
  const syncState = ensureHashSyncState(state.syncHashState);
  const facts = isPlainObject(factsOrHash)
    ? factsOrHash
    : { localPayloadHash: String(factsOrHash || ""), payload: null };
  const localPayloadHash = String(facts.localPayloadHash || "");
  const baseRemoteHash = String(syncState.baseRemoteHash || "");
  if (syncState.localDirty === true) return true;
  if (!baseRemoteHash) return hasBusinessData(facts.payload || collectSyncPayload());
  return localPayloadHash !== baseRemoteHash;
}


function currentSyncFacts({ persistHash = false } = {}) {
  const local = refreshLocalPayloadHash({ persist: persistHash });
  const facts = {
    payload: local.payload,
    localPayloadHash: local.hash,
    syncState: ensureHashSyncState(state.syncHashState)
  };
  facts.effectiveDirty = effectiveDirtyForHash(facts);
  facts.hasBusinessData = hasBusinessData(local.payload);
  return facts;
}


function setHashSyncStatus(status, message = "", options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.lastSyncStatus = status || state.syncHashState.lastSyncStatus;
  if (message) state.syncHashState.lastSyncError = status === "error" || status === "conflict" || status === "read_only" ? message : state.syncHashState.lastSyncError;
  persistHashSyncState();
  updateSyncIndicator();
  return true;
}


function clearLocalRecoveryLock(reason = "", options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localRecoveryRequired = false;
  if (/本地备份|恢复/.test(state.syncHashState.lastSyncError || "")) state.syncHashState.lastSyncError = "";
  persistHashSyncState();
  appendAuditEvent({ type: "recovery:lock_cleared", message: reason || "cleared" });
  updateSyncIndicator();
  return true;
}


function setLocalRecoveryRequired(reason, candidates, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localRecoveryRequired = true;
  state.syncHashState.lastSyncStatus = "error";
  state.syncHashState.lastSyncError = reason || "本地备份需要人工处理";
  persistHashSyncState();
  updateSyncIndicator();
  showSyncProblemDialog({
    severity: "error",
    code: "LOCAL_RECOVERY_REQUIRED",
    title: "本地备份需要人工处理",
    message: state.syncHashState.lastSyncError,
    candidates: candidates,
    runId: options.runId
  });
  return true;
}


function setLocalRecoveryWarning(reason, candidates, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  appendAuditEvent({ type: "recovery:warning", message: reason || "backup warning" });
  showSyncProblemDialog({
    severity: "warning",
    code: "LOCAL_BACKUP_WARNING",
    title: "发现不可自动恢复的备份",
    message: reason || "存在损坏或格式异常的备份，但未证明包含非空学习数据，云同步不会被永久阻断。",
    candidates: candidates,
    runId: options.runId
  });
  return true;
}


function clearHashSyncError() {
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.lastSyncError = "";
  state.syncHashState.consecutiveSyncFailures = 0;
  state.syncHashState.nextRetryAt = "";
  persistHashSyncState();
}


function recordHashSyncFailure(message, options) {
  options = options || {};
  if (isStaleSyncRun(options.runId)) return false;
  const now = new Date();
  var text = message && message.message ? message.message : String(message || "同步失败");
  const facts = currentSyncFacts({ persistHash: false });
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localDirty = shouldMarkDirtyOnFailure(options.errorKind || "unknown", facts);
  state.syncHashState.localPayloadHash = facts.localPayloadHash;
  if (state.syncHashState.localDirty && !state.syncHashState.dirtySince) state.syncHashState.dirtySince = beijingISOString(now);
  state.syncHashState.lastSyncStatus = options.status || "error";
  state.syncHashState.lastSyncError = text;
  state.syncHashState.consecutiveSyncFailures += 1;
  state.syncHashState.nextRetryAt = beijingISOString(new Date(now.getTime() + backoffDelayForFailure(state.syncHashState.consecutiveSyncFailures - 1)));
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.lastSyncAttemptAt = beijingISOString(now);
  state.syncMeta.lastSyncErrorAt = beijingISOString(now);
  state.syncMeta.lastSyncErrorMessage = text;
  persistSyncMeta();
  persistHashSyncState();
  appendAuditEvent({ type: "sync:failed", message: text, httpStatus: options.httpStatus || 0 });
  updateSyncIndicator();
  if (options.banner === true) showSyncFailureBanner("同步失败", text, { runId: options.runId });
  if (options.dialog === true || options.banner === true) {
    var dialogExtra = {
      severity: options.severity || "error",
      code: options.errorKind || "SYNC_FAILED",
      title: options.title || "同步失败",
      message: text,
      technical: options.technical || "",
      runId: options.runId,
      candidates: options.candidates
    };
    // 补充风险诊断字段，确保弹窗截图信息完整
    var remoteForFields = options.remote || null;
    if (remoteForFields && typeof makeSyncRiskProblemFields === "function") {
      var riskFields = makeSyncRiskProblemFields(remoteForFields, facts, {
        remoteHash: options.remoteHash,
        remoteHasBusinessData: options.remoteHasBusinessData,
        readOnly: Object.prototype.hasOwnProperty.call(options, "readOnly") ? options.readOnly : (remoteForFields.readOnlyAuthFallback === true),
        runId: options.runId
      });
      Object.keys(riskFields).forEach(function(k) { dialogExtra[k] = riskFields[k]; });
    } else {
      dialogExtra.remoteKind = options.remoteKind || "";
      dialogExtra.remoteHash = options.remoteHash || "";
      dialogExtra.localHasBusinessData = hasBusinessData(facts.payload);
      dialogExtra.remoteHasBusinessData = Boolean(options.remoteHasBusinessData);
      dialogExtra.baseRemoteHash = state.syncHashState.baseRemoteHash || "";
      dialogExtra.localPayloadHash = facts.localPayloadHash || "";
      dialogExtra.localDirty = state.syncHashState.localDirty === true;
      dialogExtra.effectiveDirty = facts.effectiveDirty === true;
      dialogExtra.readOnly = Boolean(Object.prototype.hasOwnProperty.call(options, "readOnly") ? options.readOnly : (state.syncMeta && state.syncMeta.readOnlyMode));
    }
    showSyncProblemDialog(dialogExtra);
  }
  return true;
}


function migrateHashSyncStateIfNeeded() {
  try {
    var existing = loadJson(HASH_SYNC_STATE_KEY, null);
    if (existing && typeof existing.localPayloadHash === "string" && existing.localPayloadHash.length > 0) {
      // Already has valid hash sync state; ensure persisted
      state.syncHashState = ensureHashSyncState(existing);
      persistHashSyncState();
      return;
    }
  } catch (_) { /* proceed with migration */ }

  var local = refreshLocalPayloadHash({ persist: false });
  var empty = isStrictlyEmptyLocalPayload(local.payload);
  state.syncHashState = ensureHashSyncState({
    localPayloadHash: local.hash,
    localDirty: !empty,
    baseRemoteHash: "",
    dirtySince: empty ? "" : beijingISOString(),
    lastSyncStatus: empty ? "local_only" : "dirty"
  });
  persistHashSyncState();
}

// ── P0: Backup recovery ─────────────────────────────────────────────────

