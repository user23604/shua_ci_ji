"use strict";

// Legacy pending-op readers are retained only for old backup compatibility.
function loadPendingOpsStore() {
  const store = loadJson(PENDING_OPS_KEY, { ops: [] });
  return {
    ops: Array.isArray(store.ops) ? store.ops.filter(isPlainObject) : []
  };
}


function savePendingOpsStore(store) {
  return saveJson(PENDING_OPS_KEY, { ops: Array.isArray(store?.ops) ? store.ops : [] });
}


function getPendingOps() {
  return compactPendingOps(loadPendingOpsStore().ops);
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
  merged.updatedAt = beijingISOString(new Date(latestOpTime || Date.now()));
  return normalizeSyncPayload(merged);
}


function applyWordMarkSet(payload, op) {
  var book = BOOKS.find(function(b) { return b.id === op.bookId; });
  if (!book) return;
  if (!payload.markStates) payload.markStates = {};
  if (!payload.markStates[book.id]) payload.markStates[book.id] = {};
  var states = sanitizeMarkStatesPayload(payload.markStates[book.id]);
  var existing = states[String(op.wordId)];
  var next = {
    value: op.value,
    updatedAt: op.updatedAt || op.createdAt || beijingISOString(),
    clientId: op.clientId || "",
    seq: Number.isFinite(Number(op.seq)) ? Number(op.seq) : 0
  };
  if (!existing || compareMarkState(next, existing) >= 0) {
    states[String(op.wordId)] = next;
  }
  payload.markStates[book.id] = states;
  if (!payload.marks) payload.marks = {};
  payload.marks[book.id] = deriveMarksFromMarkStates(states);
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

// ── 同步状态核心函数 ──────────────────────────────────────────────


function isKnownV2Op(op) {
  if (!isPlainObject(op) || typeof op.type !== "string") return false;
  return ["word.mark.set", "progress.set", "unknownProgress.set", "unitStats.completed.set", "activity.day.set", "settings.set"].indexOf(op.type) !== -1;
}


