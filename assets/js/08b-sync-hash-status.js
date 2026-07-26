"use strict";

// ── 本地时间格式化 ──────────────────────────────────────────────

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
  if (!state.syncHashState.localRecoveryRequired) return true;

  var currentHash = "";
  try { currentHash = businessPayloadHash(collectSyncPayload()); } catch (_) {}
  var expectedHash = String(options.verifiedHash || options.checkpointHash || "");
  var verified = Boolean(expectedHash && currentHash && expectedHash === currentHash);
  var userConfirmed = options.userConfirmed === true;
  if (!verified && !userConfirmed) {
    appendAuditEvent({
      type: "recovery:lock_clear_refused",
      message: "reason=" + String(reason || "") + " expected=" + expectedHash.slice(0, 8) + " actual=" + currentHash.slice(0, 8)
    });
    return false;
  }

  state.syncHashState.localRecoveryRequired = false;
  state.syncHashState.localRecoveryReason = "";
  state.syncHashState.localRecoverySetAt = "";
  state.syncHashState.localRecoverySource = "";
  state.syncHashState.localRecoveryCheckpointHash = "";
  if (/本地备份|恢复|损坏|回滚/.test(state.syncHashState.lastSyncError || "")) state.syncHashState.lastSyncError = "";
  persistHashSyncState();
  appendAuditEvent({
    type: "recovery:lock_cleared",
    message: (reason || "cleared") + " mode=" + (verified ? "hash_verified" : "user_confirmed")
  });
  updateSyncIndicator();
  return true;
}


function setLocalRecoveryRequired(reason, candidates, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localRecoveryRequired = true;
  state.syncHashState.localRecoveryReason = reason || "本地备份需要人工处理";
  state.syncHashState.localRecoverySetAt = beijingISOString();
  state.syncHashState.localRecoverySource = String(options.source || "unknown");
  state.syncHashState.localRecoveryCheckpointHash = String(options.checkpointHash || "");
  state.syncHashState.lastSyncStatus = "error";
  state.syncHashState.lastSyncError = state.syncHashState.localRecoveryReason;
  state.syncHashState.lastErrorKind = String(options.errorKind || "local_recovery_required");
  state.syncHashState.lastErrorStage = String(options.stage || "local_recovery");
  state.syncHashState.lastErrorTechnical = String(options.technical || "");
  persistHashSyncState();
  updateSyncIndicator();
  showSyncProblemDialog({
    severity: "error",
    code: "LOCAL_RECOVERY_REQUIRED",
    title: "本地数据需要恢复确认",
    message: state.syncHashState.lastSyncError,
    technical: options.technical || "",
    candidates: candidates,
    runId: options.runId
  });
  return true;
}


function enforceLocalRecoveryGuardAtStartup() {
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  if (!state.syncHashState.localRecoveryRequired) return false;
  state.syncHashState.lastSyncStatus = "error";
  if (!state.syncHashState.lastSyncError) {
    state.syncHashState.lastSyncError = state.syncHashState.localRecoveryReason || "本地数据处于恢复保护状态，请先使用 rescue.html 检查或恢复。";
  }
  persistHashSyncState();
  appendAuditEvent({
    type: "recovery:lock_preserved_on_startup",
    message: "source=" + String(state.syncHashState.localRecoverySource || "unknown") + " checkpoint=" + String(state.syncHashState.localRecoveryCheckpointHash || "").slice(0, 8)
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
