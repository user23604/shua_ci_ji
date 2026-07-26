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


// ── Hash-based sync state helpers ──────────────────────────────────


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
    lastErrorKind: typeof source.lastErrorKind === "string" ? source.lastErrorKind : "",
    lastErrorStage: typeof source.lastErrorStage === "string" ? source.lastErrorStage : "",
    lastErrorTransport: typeof source.lastErrorTransport === "string" ? source.lastErrorTransport : "",
    lastErrorHttpStatus: Math.max(0, Number(source.lastErrorHttpStatus) || 0),
    lastErrorTechnical: typeof source.lastErrorTechnical === "string" ? source.lastErrorTechnical : "",
    lastSuccessfulPushAt: typeof source.lastSuccessfulPushAt === "string" ? source.lastSuccessfulPushAt : "",
    lastSuccessfulPullAt: typeof source.lastSuccessfulPullAt === "string" ? source.lastSuccessfulPullAt : "",
    consecutiveSyncFailures: Math.max(0, Number(source.consecutiveSyncFailures) || 0),
    nextRetryAt: typeof source.nextRetryAt === "string" ? source.nextRetryAt : "",
    lastBackupError: typeof source.lastBackupError === "string" ? source.lastBackupError : "",
    localRecoveryRequired: source.localRecoveryRequired === true,
    localRecoveryReason: typeof source.localRecoveryReason === "string" ? source.localRecoveryReason : "",
    localRecoverySetAt: typeof source.localRecoverySetAt === "string" ? source.localRecoverySetAt : "",
    localRecoverySource: typeof source.localRecoverySource === "string" ? source.localRecoverySource : "",
    localRecoveryCheckpointHash: typeof source.localRecoveryCheckpointHash === "string" ? source.localRecoveryCheckpointHash : "",
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
    var saved = saveJson(HASH_SYNC_STATE_KEY, state.syncHashState);
    if (!saved) state.syncHashState.lastBackupError = "同步状态写入失败";
    return saved;
  } catch (error) {
    state.syncHashState.lastBackupError = error?.message || "同步状态写入失败";
    return false;
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
  // activity.seconds is a high-frequency local-only field. It can be synced opportunistically
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
