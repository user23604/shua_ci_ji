"use strict";

function buildV2OpsFromLocal() {
  return getPendingOps().map(function(op) { return localOpToWireOp(op); });
}


function buildV2SyncPayload() {
  var snapshot = normalizeSyncPayload(collectSyncPayload());
  var ops = buildV2OpsFromLocal();
  var clients = {};
  var meta = ensureSyncMeta(state.syncMeta);
  clients[meta.clientId] = { lastSeq: meta.localSeq };
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    clientId: meta.clientId,
    snapshot: snapshot,
    ops: ops,
    clients: clients
  };
}


function snapshotFromV2Payload(v2) {
  if (!v2 || !v2.snapshot) return null;
  return normalizeSyncPayload(v2.snapshot);
}


function applyOpToSnapshot(snapshot, op) {
  // op.payload contains the same fields as old flat op
  var flatOp = { type: op.type, createdAt: op.createdAt };
  if (op.payload && typeof op.payload === "object") {
    Object.keys(op.payload).forEach(function(k) { flatOp[k] = op.payload[k]; });
  }
  var ops = [flatOp];
  return normalizeSyncPayload(applyPendingOps(cloneJson(snapshot), ops));
}


function reduceOps(baseSnapshot, ops) {
  var current = normalizeSyncPayload(baseSnapshot || {});
  var sorted = (Array.isArray(ops) ? ops.slice() : []).sort(function(a, b) {
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });
  sorted.forEach(function(op) {
    current = applyOpToSnapshot(current, op);
  });
  return current;
}


function mergeOpLists(remoteOps, localOps) {
  var map = {};
  (Array.isArray(remoteOps) ? remoteOps : []).forEach(function(op) {
    if (op && op.opId) map[op.opId] = op;
  });
  (Array.isArray(localOps) ? localOps : []).forEach(function(op) {
    if (op && op.opId) {
      var existing = map[op.opId];
      if (existing) {
        // Same opId — check if identical
        var existingJson = stableStringify(existing);
        var newJson = stableStringify(op);
        if (existingJson !== newJson) {
          // True conflict: same opId, different content → newer wins by seq
          if ((Number(op.seq) || 0) >= (Number(existing.seq) || 0)) {
            map[op.opId] = op;
          }
        }
      } else {
        map[op.opId] = op;
      }
    }
  });
  var result = [];
  Object.keys(map).forEach(function(k) { result.push(map[k]); });
  result.sort(function(a, b) { return (a.createdAt || "").localeCompare(b.createdAt || ""); });
  return result;
}


function applyPendingOps(payload, ops) {
  const merged = normalizeSyncPayload(cloneJson(payload));
  compactPendingOps(ops).forEach((op) => {
    if (op.type === "word.mark.set") applyWordMarkSet(merged, op);
    else if (op.type === "progress.set") applyProgressSet(merged, op);
    else if (op.type === "unknownProgress.set") applyUnknownProgressSet(merged, op);
    else if (op.type === "unitStats.completed.set") applyUnitStatsCompletedSet(merged, op);
    else if (op.type === "activity.day.set") applyActivityDaySet(merged, op);
    else if (op.type === "settings.set") applySettingsSet(merged, op);
  });
  const latestOpTime = compactPendingOps(ops).reduce((latest, op) => Math.max(latest, dateMs(op.createdAt)), dateMs(merged.updatedAt));
  merged.updatedAt = new Date(latestOpTime || Date.now()).toISOString();
  return normalizeSyncPayload(merged);
}


function applyWordMarkSet(payload, op) {
  const book = BOOKS.find((item) => item.id === op.bookId);
  const wordId = Number(op.wordId);
  if (!book || !Number.isFinite(wordId) || wordId <= 0) return;
  const marks = payload.marks[book.id] || { known: [], unknown: [] };
  // 本地 pendingOp 表示用户在本设备上未同步的最后意图；rebase 时它覆盖云端同一词的互斥状态。
  marks.known = normalizeIdList(marks.known).filter((id) => id !== wordId);
  marks.unknown = normalizeIdList(marks.unknown).filter((id) => id !== wordId);
  if (op.value === "known") marks.known.push(wordId);
  if (op.value === "unknown") marks.unknown.push(wordId);
  payload.marks[book.id] = sanitizeMarksPayload(marks);
}


function applyProgressSet(payload, op) {
  const book = BOOKS.find((item) => item.id === op.bookId);
  if (!book) return;
  const next = sanitizeProgressPayload({ ...(op.progress || {}), updatedAt: op.progress?.updatedAt || op.createdAt });
  const current = payload.progress[book.id] || { lastWordId: null };
  if (dateMs(next.updatedAt) >= dateMs(current.updatedAt)) payload.progress[book.id] = next;
}


function applyUnknownProgressSet(payload, op) {
  const book = BOOKS.find((item) => item.id === op.bookId);
  if (!book || (op.scope !== "book" && op.scope !== "unit")) return;
  const progressMap = payload.unknownProgress[book.id] || normalizeUnknownProgressPayload(book);
  const next = sanitizeProgressPayload({ ...(op.progress || {}), updatedAt: op.progress?.updatedAt || op.createdAt });
  if (op.scope === "book") {
    if (dateMs(next.updatedAt) >= dateMs(progressMap.book?.updatedAt)) progressMap.book = next;
  } else {
    const unit = Number(op.unit);
    if (!Number.isFinite(unit) || unit < 1 || unit > book.totalUnits) return;
    const key = String(unit);
    if (dateMs(next.updatedAt) >= dateMs(progressMap.units?.[key]?.updatedAt)) progressMap.units[key] = next;
  }
  payload.unknownProgress[book.id] = progressMap;
}


function applyUnitStatsCompletedSet(payload, op) {
  const book = BOOKS.find((item) => item.id === op.bookId);
  const unit = Number(op.unit);
  if (!book || !Number.isFinite(unit) || unit < 1 || unit > book.totalUnits) return;
  const stats = payload.unitStats[book.id] || { units: {} };
  const key = String(unit);
  const current = stats.units[key] || { completed: 0 };
  if (dateMs(op.createdAt) >= dateMs(current.updatedAt)) {
    stats.units[key] = {
      completed: Math.max(0, Number(op.completed) || 0),
      updatedAt: op.createdAt
    };
  }
  payload.unitStats[book.id] = sanitizeUnitStatsPayload(stats);
}


function applyActivityDaySet(payload, op) {
  const book = BOOKS.find((item) => item.id === op.bookId);
  if (!book || !/^\d{4}-\d{2}-\d{2}$/.test(op.date || "")) return;
  const activity = payload.activity[book.id] || { days: {} };
  const current = activity.days[op.date] || { seconds: 0, words: 0, known: 0, unknown: 0, wordIds: [] };
  const next = sanitizeActivityPayload({ days: { [op.date]: op.day || {} } }).days[op.date] || current;
  activity.days[op.date] = {
    seconds: Math.max(Number(current.seconds) || 0, Number(next.seconds) || 0),
    words: Math.max(Number(current.words) || 0, Number(next.words) || 0),
    known: Math.max(Number(current.known) || 0, Number(next.known) || 0),
    unknown: Math.max(Number(current.unknown) || 0, Number(next.unknown) || 0),
    wordIds: normalizeIdList([...(current.wordIds || []), ...(next.wordIds || [])])
  };
  payload.activity[book.id] = sanitizeActivityPayload(activity);
}


function applySettingsSet(payload, op) {
  if (!isPlainObject(op.patch)) return;
  const currentUpdatedAt = dateMs(payload.settings?.updatedAt);
  if (currentUpdatedAt && currentUpdatedAt > dateMs(op.createdAt)) return;
  payload.settings = normalizeSettingsPayload({ ...(payload.settings || {}), ...op.patch, updatedAt: op.createdAt });
}

// ── P0 同步状态核心函数 ──────────────────────────────────────────────


function isKnownV2Op(op) {
  if (!isPlainObject(op) || typeof op.type !== "string") return false;
  return ["word.mark.set", "progress.set", "unknownProgress.set", "unitStats.completed.set", "activity.day.set", "settings.set"].indexOf(op.type) !== -1;
}


