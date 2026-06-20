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
    businessHashSchemaVersion: Math.max(0, Number(source.businessHashSchemaVersion) || 0),
    hashSchemaNeedsRemoteCheck: source.hashSchemaNeedsRemoteCheck === true,
    schemaMigrationPreviousDirty: source.schemaMigrationPreviousDirty === true,
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
    localRecoveryRequired: source.localRecoveryRequired === true,
    lastBlockingErrorAt: typeof source.lastBlockingErrorAt === "string" ? source.lastBlockingErrorAt : "",
    lastBlockingErrorCode: typeof source.lastBlockingErrorCode === "string" ? source.lastBlockingErrorCode : "",
    lastBlockingErrorText: typeof source.lastBlockingErrorText === "string" ? source.lastBlockingErrorText : "",
    lastBlockingErrorClearedAt: typeof source.lastBlockingErrorClearedAt === "string" ? source.lastBlockingErrorClearedAt : "",
    lastSyncedPayloadHash: typeof source.lastSyncedPayloadHash === "string" ? source.lastSyncedPayloadHash : ""
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


function progressPayloadForBusinessHash(progress) {
  const item = sanitizeProgressPayload(progress);
  const out = { lastWordId: item.lastWordId || null };
  if (Number.isFinite(Number(item.unit)) && Number(item.unit) > 0) out.unit = Number(item.unit);
  return out;
}


function progressMapForBusinessHash(progressMap) {
  const source = isPlainObject(progressMap) ? progressMap : {};
  const out = {};
  BOOKS.forEach(function(book) {
    out[book.id] = progressPayloadForBusinessHash(source[book.id]);
  });
  return out;
}


function unknownProgressForBusinessHash(unknownProgressMap) {
  const source = isPlainObject(unknownProgressMap) ? unknownProgressMap : {};
  const out = {};
  BOOKS.forEach(function(book) {
    var normalized = normalizeUnknownProgressPayload(book, source[book.id]);
    var units = {};
    Object.keys(normalized.units || {}).forEach(function(unit) {
      units[unit] = progressPayloadForBusinessHash(normalized.units[unit]);
    });
    out[book.id] = {
      book: progressPayloadForBusinessHash(normalized.book),
      units: units
    };
  });
  return out;
}


function unitStatsForBusinessHash(unitStatsMap) {
  const source = isPlainObject(unitStatsMap) ? unitStatsMap : {};
  const out = {};
  BOOKS.forEach(function(book) {
    var stats = sanitizeUnitStatsPayload(source[book.id]);
    var units = {};
    Object.keys(stats.units || {}).forEach(function(unit) {
      units[unit] = { completed: Math.max(0, Number(stats.units[unit] && stats.units[unit].completed) || 0) };
    });
    out[book.id] = { units: units };
  });
  return out;
}


function activityPayloadForBusinessHash(activity) {
  // P9: activity.seconds is a high-frequency local-only field. It can be synced opportunistically
  // when a real business sync happens, but it must not keep the flash screen dirty by itself.
  const normalized = sanitizeActivityPayload(activity);
  const days = {};
  Object.keys(normalized.days || {}).forEach(function(date) {
    const day = normalized.days[date] || {};
    days[date] = {
      words: Math.max(0, Number(day.words) || 0),
      known: Math.max(0, Number(day.known) || 0),
      unknown: Math.max(0, Number(day.unknown) || 0),
      wordIds: normalizeIdList(day.wordIds)
    };
  });
  return { days: days };
}


function activityMapForBusinessHash(activityMap) {
  const source = isPlainObject(activityMap) ? activityMap : {};
  const out = {};
  BOOKS.forEach(function(book) {
    out[book.id] = activityPayloadForBusinessHash(source[book.id]);
  });
  return out;
}


function businessPayloadForHash(payload) {
  const normalized = normalizeSyncPayload(payload);
  return {
    hashSchemaVersion: BUSINESS_HASH_SCHEMA_VERSION,
    progress: progressMapForBusinessHash(normalized.progress),
    unknownProgress: unknownProgressForBusinessHash(normalized.unknownProgress),
    marks: normalized.marks,
    markStates: normalized.markStates,
    activity: activityMapForBusinessHash(normalized.activity),
    unitStats: unitStatsForBusinessHash(normalized.unitStats)
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
    countUserStudyStateRecords(p) > 0 ||
    (typeof hasMarkStatesBusinessData === "function" && hasMarkStatesBusinessData(p.markStates));
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


function auditLocalDirtySet(reason, extra = {}) {
  try {
    var syncState = ensureHashSyncState(state.syncHashState);
    var now = Date.now();
    var lastStudy = Number(state.lastUserStudyActionAt || 0);
    var lastClean = Number(state.lastMarkCleanAtMs || 0);
    var stack = String((new Error()).stack || "").split("\n").slice(2, 7).join(" | ");
    appendAuditEvent({
      type: "sync:local_dirty_set",
      message:
        "reason=" + String(reason || "") +
        " view=" + String(state.view || "") +
        " beforeLocalDirty=" + String(!!syncState.localDirty) +
        " lastUserStudyActionAgo=" + String(lastStudy ? now - lastStudy : -1) +
        " lastMarkCleanAgo=" + String(lastClean ? now - lastClean : -1) +
        " localHash=" + String(syncState.localPayloadHash || "").slice(0, 8) +
        " baseHash=" + String(syncState.baseRemoteHash || "").slice(0, 8) +
        " caller=" + stack
    });
  } catch (_) {}
}


function appendHashDiffSummary(payload, runId, reason) {
  try {
    var p = normalizeSyncPayload(payload || collectSyncPayload());
    var summary = [];
    BOOKS.forEach(function(book) {
      var pr = p.progress && p.progress[book.id] || {};
      var ms = p.markStates && p.markStates[book.id] || {};
      var act = p.activity && p.activity[book.id] || { days: {} };
      summary.push(book.id + ":progress=" + String(pr.unit || "") + "/" + String(pr.lastWordId || "") + ",markStates=" + Object.keys(ms).length + ",activityDays=" + Object.keys(act.days || {}).length);
    });
    appendAuditEvent({
      type: "sync:hash_diff_summary",
      message:
        "session=" + TAB_ID +
        " runId=" + String(runId || "") +
        " reason=" + String(reason || "") +
        " settingsExcluded=true activitySecondsExcluded=true " +
        summary.join("; ")
    });
  } catch (error) {
    appendAuditEvent({ type: "sync:hash_diff_summary_failed", message: String(error && error.message || error || "") });
  }
}


function markBusinessHashSchemaForRemoteCheck(previousDirty) {
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.businessHashSchemaVersion = BUSINESS_HASH_SCHEMA_VERSION;
  state.syncHashState.hashSchemaNeedsRemoteCheck = true;
  state.syncHashState.schemaMigrationPreviousDirty = previousDirty === true;
  state.syncHashState.lastSyncStatus = "local_only";
  state.syncHashState.lastSyncError = "";
  state.sessionRemoteCheckDone = false;
  state.sessionRemoteCheckAt = "";
  state.latestRemoteHashSeen = "";
  state.latestRemoteKindSeen = "";
  persistHashSyncState();
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


// ── P0.8 session remote check ─────────────────────────────────────────

function markSessionRemoteChecked(remote, runId, source) {
  if (!remote || remote.kind === "error") return;
  var remoteHash = currentRemoteHash(remote);
  state.sessionRemoteCheckDone = true;
  state.sessionRemoteCheckAt = beijingISOString();
  state.lastCleanRemotePollAt = Date.now();
  state.latestRemoteHashSeen = remoteHash || "";
  state.latestRemoteKindSeen = (remote && remote.kind) || "";
  state.latestRemoteCheckRunId = runId || 0;
  appendAuditEvent({
    type: "sync:remote_checked",
    message: "session=" + TAB_ID + " runId=" + (runId || "") + " source=" + String(source || "") + " kind=" + String(state.latestRemoteKindSeen || "") + " hash=" + String(state.latestRemoteHashSeen || "").slice(0, 8)
  });
}

function hasFreshSessionRemoteConfirmation() {
  if (!state.sessionRemoteCheckDone) return false;
  if (!state.sessionRemoteCheckAt) return false;
  var checkedAt = Date.parse(state.sessionRemoteCheckAt);
  if (!Number.isFinite(checkedAt)) return false;
  return Date.now() - checkedAt <= SYNC_REMOTE_CONFIRM_TTL_MS;
}

function hasCurrentSessionRemoteConfirmation(facts) {
  if (!state.sessionRemoteCheckDone) return false;
  if (!hasFreshSessionRemoteConfirmation()) return false;
  if (!state.latestRemoteHashSeen) return false;
  return String(state.latestRemoteHashSeen) === String(facts.localPayloadHash || "");
}

// ── P0.8 blocking error ───────────────────────────────────────────────

function isBlockingSyncErrorKind(errorKind, options = {}) {
  var reason = String(options.reason || "");
  if (options.retryable === true) return false;
  if (errorKind === "verify_failed" && [
    "heartbeat",
    "local_change",
    "min_interval_reschedule",
    "active_study_idle_upload",
    "visibility_resume",
    "visibility_resume_dirty_flush",
    "verify_mismatch_retry"
  ].includes(reason)) return false;
  if (typeof shouldDowngradeFailureForBackground === "function" && shouldDowngradeFailureForBackground(reason)) return false;
  return ["remote_invalid","remote_v2_unknown_ops","patch_failed_422","patch_conflict_409","merge_failed","local_apply_verify_failed","apply_failed","invalid_config","auth_failed"].indexOf(errorKind || "") !== -1;
}

function hasUnclearedBlockingSyncError(syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  if (!syncState.lastBlockingErrorAt) return false;
  if (!syncState.lastBlockingErrorClearedAt) return true;
  return Date.parse(syncState.lastBlockingErrorAt) > Date.parse(syncState.lastBlockingErrorClearedAt);
}

// ── P0.7 clean 状态判断（watchdog/网络错误不覆盖已确认的 cloud_saved/cloud_loaded）──

function isCleanConfirmedSyncState(facts, syncState) {
  facts = facts || currentSyncFacts({ persistHash: false });
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  return (
    !facts.effectiveDirty &&
    Boolean(syncState.baseRemoteHash) &&
    facts.localPayloadHash === syncState.baseRemoteHash &&
    (Boolean(syncState.lastSuccessfulPushAt) || Boolean(syncState.lastSuccessfulPullAt))
  );
}


function recordHashSyncFailure(message, options) {
  options = options || {};
  if (isStaleSyncRun(options.runId)) return false;
  const now = new Date();
  var text = message && message.message ? message.message : String(message || "同步失败");
  var facts = currentSyncFacts({ persistHash: false });
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  var syncState = state.syncHashState;

  // P0.7: 非阻塞错误（watchdog/网络/版本检查）且数据已 clean 时，保持成功态
  var nonBlockingErrors = ["sync_watchdog_timeout", "remote_get_failed", "version_check_failed"];
  var isNonBlocking = nonBlockingErrors.indexOf(options.errorKind || "") !== -1;
  var cleanConfirmed = isNonBlocking && isCleanConfirmedSyncState(facts, syncState);
  var preserveCleanSuccessStatus = isNonBlocking && cleanConfirmed;

  if (preserveCleanSuccessStatus) {
    // clean 分支：明确写回正确成功态，绝不到达 lastSyncStatus = "error"
    syncState.localDirty = false;
    syncState.localPayloadHash = facts.localPayloadHash;
    syncState.lastSyncError = text;
    syncState.lastSyncErrorAt = beijingISOString();
    if (syncState.lastSuccessfulPushAt) {
      syncState.lastSyncStatus = "cloud_saved";
    } else {
      syncState.lastSyncStatus = "cloud_loaded";
    }
    // 不覆盖 baseRemoteHash、lastSuccessfulPushAt/PullAt
  } else {
    // 原有失败逻辑
    // dirty 保护：原本 dirty 不清掉
    if (facts.effectiveDirty || syncState.localDirty) {
      syncState.localDirty = true;
    } else {
      syncState.localDirty = shouldMarkDirtyOnFailure(options.errorKind || "unknown", facts);
    }
    if (syncState.localDirty && !syncState.dirtySince) syncState.dirtySince = beijingISOString(now);
    var blockingFailure = isBlockingSyncErrorKind(options.errorKind, options);
    if (!blockingFailure && (options.retryable === true || options.errorKind === "verify_failed" || options.errorKind === "remote_get_failed" || options.errorKind === "patch_failed_network")) {
      syncState.lastSyncStatus = syncState.localDirty ? "dirty" : "local_only";
    } else {
      syncState.lastSyncStatus = options.status || "error";
    }
    syncState.lastSyncError = text;
    syncState.lastSyncErrorAt = beijingISOString();
    // P0.8/P9: 只有真正 blocking 的错误才写 blocking error，retryable verify/network 不让红灯长驻。
    if (blockingFailure) {
      syncState.lastBlockingErrorAt = beijingISOString();
      syncState.lastBlockingErrorCode = options.errorKind || "SYNC_FAILED";
      syncState.lastBlockingErrorText = text;
    }
  }
  syncState.localPayloadHash = facts.localPayloadHash;
  syncState.consecutiveSyncFailures += 1;
  syncState.nextRetryAt = beijingISOString(new Date(now.getTime() + backoffDelayForFailure(syncState.consecutiveSyncFailures - 1)));
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.lastSyncAttemptAt = beijingISOString(now);
  state.syncMeta.lastSyncErrorAt = beijingISOString();
  state.syncMeta.lastSyncErrorMessage = text;
  persistSyncMeta();
  persistHashSyncState();
  appendAuditEvent({ type: "sync:failed", message: "session=" + TAB_ID + " runId=" + (options.runId || "") + " errorKind=" + (options.errorKind || "unknown") + " " + text, httpStatus: options.httpStatus || 0 });
  refreshVisibleSyncDiagnostics();
  if (options.banner === true) showSyncFailureBanner("同步失败", text, { runId: options.runId });
  if (options.dialog === true || options.banner === true) {
    var dialogExtra = {
      severity: preserveCleanSuccessStatus ? "warning" : (options.severity || "error"),
      code: options.errorKind || "SYNC_FAILED",
      title: options.title || (preserveCleanSuccessStatus ? "同步检查超时" : "同步失败"),
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
      dialogExtra.baseRemoteHash = syncState.baseRemoteHash || "";
      dialogExtra.localPayloadHash = facts.localPayloadHash || "";
      dialogExtra.localDirty = syncState.localDirty === true;
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
    if (
      existing &&
      Number(existing.schemaVersion) === 2 &&
      typeof existing.localPayloadHash === "string" &&
      existing.localPayloadHash.length > 0
    ) {
      state.syncHashState = ensureHashSyncState(existing);
      if (state.syncHashState.businessHashSchemaVersion !== BUSINESS_HASH_SCHEMA_VERSION) {
        var previousDirty = state.syncHashState.localDirty === true;
        var localForSchema = refreshLocalPayloadHash({ persist: false });
        state.syncHashState.localPayloadHash = localForSchema.hash;
        state.syncHashState.localDirty = false;
        state.syncHashState.dirtySince = "";
        state.syncHashState.lastSyncError = "";
        markBusinessHashSchemaForRemoteCheck(previousDirty);
        appendAuditEvent({ type: "sync:business_hash_schema_changed", message: "session=" + TAB_ID + " old=" + String(existing.businessHashSchemaVersion || "") + " new=" + BUSINESS_HASH_SCHEMA_VERSION + " previousDirty=" + String(previousDirty) });
        return;
      }
      persistHashSyncState();
      return;
    }
  } catch (_) { /* proceed with migration */ }

  var local = refreshLocalPayloadHash({ persist: false });
  var hasData = hasBusinessData(local.payload);
  var now = beijingISOString();

  var oldV1 = null;
  try {
    oldV1 = loadJson("vocab_machine_hash_sync_state_v1", null);
  } catch (_) {}

  var oldV1Clean =
    oldV1 &&
    oldV1.localDirty === false &&
    typeof oldV1.localPayloadHash === "string" &&
    typeof oldV1.baseRemoteHash === "string" &&
    oldV1.localPayloadHash &&
    oldV1.baseRemoteHash &&
    oldV1.localPayloadHash === oldV1.baseRemoteHash;

  if (hasData && oldV1Clean) {
    state.syncHashState = ensureHashSyncState({
      schemaVersion: 2,
      businessHashSchemaVersion: BUSINESS_HASH_SCHEMA_VERSION,
      localPayloadHash: local.hash,
      localDirty: false,
      baseRemoteHash: local.hash,
      dirtySince: "",
      lastSyncStatus: "local_only",
      lastSyncError: "",
      lastSyncErrorAt: "",
      lastSyncedPayloadHash: local.hash,
      lastBlockingErrorAt: "",
      lastBlockingErrorCode: "",
      lastBlockingErrorText: "",
      lastBlockingErrorClearedAt: ""
    });
    appendAuditEvent({ type: "sync:hash_state_migrated_clean_snapshot", message: "session=" + TAB_ID + " oldV1Clean=true localHash=" + String(local.hash || "").slice(0, 8) });
  } else {
    state.syncHashState = ensureHashSyncState({
      schemaVersion: 2,
      businessHashSchemaVersion: BUSINESS_HASH_SCHEMA_VERSION,
      localPayloadHash: local.hash,
      localDirty: hasData,
      baseRemoteHash: "",
      dirtySince: hasData ? now : "",
      lastSyncStatus: hasData ? "dirty" : "local_only",
      lastSyncError: "",
      lastSyncErrorAt: "",
      lastSyncedPayloadHash: "",
      lastBlockingErrorAt: "",
      lastBlockingErrorCode: "",
      lastBlockingErrorText: "",
      lastBlockingErrorClearedAt: ""
    });
    appendAuditEvent({ type: "sync:hash_state_migrated_dirty_or_empty", message: "session=" + TAB_ID + " hasData=" + String(!!hasData) + " oldV1Clean=" + String(!!oldV1Clean) });
  }

  state.sessionRemoteCheckDone = false;
  state.sessionRemoteCheckAt = "";
  state.latestRemoteHashSeen = "";
  state.latestRemoteKindSeen = "";
  state.latestRemoteCheckRunId = 0;

  persistHashSyncState();
}

// ── P0: Backup recovery ─────────────────────────────────────────────────

