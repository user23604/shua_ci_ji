"use strict";

function defaultRoundState() {
  return { generation: 0, roundId: "legacy-0", startedAt: "" };
}

function sanitizeRoundStatePayload(value) {
  const source = isPlainObject(value) ? value : {};
  const generation = Math.max(0, Math.floor(Number(source.generation) || 0));
  const roundId = String(source.roundId || (generation === 0 ? "legacy-0" : `round-${generation}`)).slice(0, 160);
  const startedAt = typeof source.startedAt === "string" && source.startedAt ? source.startedAt : "";
  return { generation, roundId, startedAt };
}

function sameRoundState(a, b) {
  const left = sanitizeRoundStatePayload(a);
  const right = sanitizeRoundStatePayload(b);
  return left.generation === right.generation && left.roundId === right.roundId;
}

function compareRoundStates(a, b) {
  const left = sanitizeRoundStatePayload(a);
  const right = sanitizeRoundStatePayload(b);
  if (left.generation !== right.generation) return left.generation > right.generation ? 1 : -1;
  const leftMs = Date.parse(left.startedAt || "") || 0;
  const rightMs = Date.parse(right.startedAt || "") || 0;
  if (leftMs !== rightMs) return leftMs > rightMs ? 1 : -1;
  return left.roundId === right.roundId ? 0 : (left.roundId > right.roundId ? 1 : -1);
}

function loadRoundState() {
  return sanitizeRoundStatePayload(loadJson(ROUND_STATE_KEY, defaultRoundState()));
}

function saveRoundState(value) {
  return saveJson(ROUND_STATE_KEY, sanitizeRoundStatePayload(value), { priority: "snapshot" });
}

function createNextRoundState(previous) {
  const current = sanitizeRoundStatePayload(previous);
  const generation = current.generation + 1;
  const randomPart = globalThis.crypto && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  return {
    generation,
    roundId: `round-${generation}-${randomPart}`,
    startedAt: beijingISOString()
  };
}

function sanitizeArchiveSnapshot(snapshot) {
  const source = isPlainObject(snapshot) ? snapshot : {};
  const progress = {};
  const unknownProgress = {};
  const marks = {};
  const activity = {};
  const unitStats = {};
  BOOKS.forEach(function(book) {
    progress[book.id] = sanitizeProgressPayload(source.progress && source.progress[book.id]);
    unknownProgress[book.id] = normalizeUnknownProgressPayload(book, source.unknownProgress && source.unknownProgress[book.id]);
    marks[book.id] = sanitizeMarksPayload(source.marks && source.marks[book.id]);
    activity[book.id] = sanitizeActivityPayload(source.activity && source.activity[book.id]);
    unitStats[book.id] = sanitizeUnitStatsPayload(source.unitStats && source.unitStats[book.id]);
  });
  return {
    activeBookId: BOOKS.some(function(book) { return book.id === source.activeBookId; }) ? source.activeBookId : BOOKS[0].id,
    settings: normalizeSettingsPayload(source.settings),
    progress,
    unknownProgress,
    marks,
    activity,
    unitStats
  };
}

function archiveSnapshotFromPayload(payload) {
  const normalized = normalizeSyncPayload(payload || {});
  return sanitizeArchiveSnapshot({
    activeBookId: normalized.activeBookId,
    settings: normalized.settings,
    progress: normalized.progress,
    unknownProgress: normalized.unknownProgress,
    marks: normalized.marks,
    activity: normalized.activity,
    unitStats: normalized.unitStats
  });
}

function archiveSnapshotSummary(snapshot) {
  const normalized = sanitizeArchiveSnapshot(snapshot);
  const books = {};
  let known = 0;
  let unknown = 0;
  let activityDays = 0;
  let completedUnits = 0;
  BOOKS.forEach(function(book) {
    const bookMarks = normalized.marks[book.id] || { known: [], unknown: [] };
    const bookKnown = normalizeIdList(bookMarks.known).length;
    const bookUnknown = normalizeIdList(bookMarks.unknown).length;
    const bookDays = Object.keys((normalized.activity[book.id] && normalized.activity[book.id].days) || {}).length;
    const bookCompleted = Object.values((normalized.unitStats[book.id] && normalized.unitStats[book.id].units) || {})
      .reduce(function(total, item) { return total + Math.max(0, Number(item && item.completed) || 0); }, 0);
    books[book.id] = { known: bookKnown, unknown: bookUnknown, activityDays: bookDays, completedUnits: bookCompleted };
    known += bookKnown;
    unknown += bookUnknown;
    activityDays += bookDays;
    completedUnits += bookCompleted;
  });
  return { known, unknown, activityDays, completedUnits, books };
}

function sanitizeRoundArchiveRecord(record, fallbackId) {
  const source = isPlainObject(record) ? record : {};
  const id = String(source.id || fallbackId || "").slice(0, 200);
  const name = String(source.name || "").trim().slice(0, 160);
  const note = String(source.note || "").slice(0, 12000);
  const archivedAt = typeof source.archivedAt === "string" && source.archivedAt ? source.archivedAt : "";
  if (!id || !name || !archivedAt) return null;
  const snapshot = sanitizeArchiveSnapshot(source.snapshot);
  return {
    schemaVersion: 1,
    id,
    name,
    note,
    archivedAt,
    sourceAppVersion: String(source.sourceAppVersion || "").slice(0, 120),
    round: sanitizeRoundStatePayload(source.round),
    summary: archiveSnapshotSummary(snapshot),
    snapshot
  };
}

function sanitizeRoundArchiveStore(store) {
  const source = isPlainObject(store) ? store : {};
  const result = {};
  Object.keys(source).forEach(function(id) {
    const record = sanitizeRoundArchiveRecord(source[id], id);
    if (record) result[record.id] = record;
  });
  return result;
}

function loadRoundArchives() {
  return sanitizeRoundArchiveStore(loadJson(ROUND_ARCHIVES_KEY, {}));
}

function saveRoundArchives(store) {
  return saveJson(ROUND_ARCHIVES_KEY, sanitizeRoundArchiveStore(store), { priority: "snapshot" });
}

function mergeRoundArchiveStores(remoteStore, localStore) {
  const remote = sanitizeRoundArchiveStore(remoteStore);
  const local = sanitizeRoundArchiveStore(localStore);
  const merged = { ...remote };
  Object.keys(local).forEach(function(id) {
    if (!merged[id]) {
      merged[id] = local[id];
      return;
    }
    const a = stableStringifyHash(merged[id]);
    const b = stableStringifyHash(local[id]);
    if (b > a) merged[id] = local[id];
  });
  return sanitizeRoundArchiveStore(merged);
}

function hasRoundArchiveBusinessData(round, archives) {
  const current = sanitizeRoundStatePayload(round);
  return current.generation > 0 || Object.keys(sanitizeRoundArchiveStore(archives)).length > 0;
}

function makeRoundArchiveRecord(name, note, round, payload) {
  const current = sanitizeRoundStatePayload(round);
  const archivedAt = beijingISOString();
  const randomPart = globalThis.crypto && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  const snapshot = archiveSnapshotFromPayload(payload);
  return sanitizeRoundArchiveRecord({
    id: `archive-${current.generation}-${randomPart}`,
    name: String(name || "").trim(),
    note: String(note || ""),
    archivedAt,
    sourceAppVersion: APP_VERSION,
    round: current,
    snapshot
  });
}

function emptyLivePayloadForNewRound(payload, round, archives) {
  const candidate = normalizeSyncPayload(cloneJson(payload || {}));
  candidate.round = sanitizeRoundStatePayload(round);
  candidate.archives = sanitizeRoundArchiveStore(archives);
  BOOKS.forEach(function(book) {
    candidate.progress[book.id] = { lastWordId: null };
    candidate.unknownProgress[book.id] = normalizeUnknownProgressPayload(book, {});
    candidate.marks[book.id] = { known: [], unknown: [] };
    candidate.markStates[book.id] = {};
    candidate.activity[book.id] = { days: {} };
    candidate.unitStats[book.id] = { units: {} };
  });
  candidate.updatedAt = beijingISOString();
  return normalizeSyncPayload(candidate);
}

function isRoundArchiveTransactionKey(key) {
  const value = String(key || "");
  return value === ROUND_STATE_KEY || value === ROUND_ARCHIVES_KEY || value === STUDY_SESSION_KEY ||
    value === PROGRESS_CURSOR_KEY || value === UNKNOWN_PROGRESS_CURSOR_KEY || value === PROGRESS_PENDING_KEY || value === ACTIVITY_DRAFT_KEY ||
    value.startsWith("progress:") || value.startsWith("unknown_progress:") || value.startsWith("marks:") ||
    value.startsWith(MARK_STATES_PREFIX) || value.startsWith("activity:") || value.startsWith("unit_stats:");
}

function captureRoundArchiveTransaction() {
  const items = {};
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!isRoundArchiveTransactionKey(key)) continue;
    keys.push(key);
    items[key] = localStorage.getItem(key);
  }
  return { keys, items };
}

function rollbackRoundArchiveTransaction(snapshot) {
  if (!snapshot || !snapshot.items) return false;
  try {
    const before = new Set(snapshot.keys || []);
    const current = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (isRoundArchiveTransactionKey(key)) current.push(key);
    }
    current.forEach(function(key) { if (!before.has(key)) localStorage.removeItem(key); });
    Object.keys(snapshot.items).forEach(function(key) { localStorage.setItem(key, snapshot.items[key]); });
    return true;
  } catch (_) {
    return false;
  }
}

function resetLiveRoundStorage() {
  let ok = true;
  BOOKS.forEach(function(book) {
    ok = saveProgress(book.id, { lastWordId: null }, { touch: false, reason: "round_archive_reset" }) !== false && ok;
    ok = saveMarkStates(book.id, {}, { touch: false, syncMarks: true }) !== false && ok;
    ok = saveActivity(book.id, { days: {} }, { touch: false }) !== false && ok;
    ok = saveUnitStats(book.id, { units: {} }, { touch: false }) !== false && ok;
    ok = saveUnknownProgress(book.id, { scope: "book" }, { lastWordId: null }, { touch: false, reason: "round_archive_reset" }) !== false && ok;
    Array.from({ length: book.totalUnits }, function(_, index) { return index + 1; }).forEach(function(unit) {
      ok = saveUnknownProgress(book.id, { scope: "unit", unit }, { lastWordId: null }, { touch: false, reason: "round_archive_reset" }) !== false && ok;
    });
  });
  ok = saveProgressCursorStore({ byBook: {} }) !== false && ok;
  ok = saveUnknownProgressCursorStore({ byBook: {} }) !== false && ok;
  ok = clearProgressPending() !== false && ok;
  ok = clearActivityDraftPending() !== false && ok;
  try { localStorage.removeItem(STUDY_SESSION_KEY); } catch (_) { ok = false; }
  return ok;
}

function resetStudyRuntimeAfterRoundChange() {
  state.unitWords = [];
  state.currentIndex = 0;
  state.groupStats = createGroupStats();
  state.reviewMode = null;
  state.roundReturn = null;
  state.undoWordId = null;
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.navQueue = [];
  state.showZh = false;
  state.playbackPaused = false;
  state.pendingProgressSync = false;
  state.activityDirtyPending = false;
  state.activityDraftPending = false;
}

function roundArchivePayloadBytes(payload) {
  if (typeof buildSyncEnvelope !== "function") return 0;
  const json = JSON.stringify(buildSyncEnvelope(payload));
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(json).length : json.length;
}

async function archiveCurrentRound(name, note) {
  const archiveName = String(name || "").trim();
  if (!archiveName) return { ok: false, error: "请填写归档名称。" };
  if (state.roundArchiveBusy) return { ok: false, error: "归档正在进行，请勿重复提交。" };
  state.roundArchiveBusy = true;
  try {
    if (typeof commitCurrentCardActivity === "function") commitCurrentCardActivity();
    if (typeof clearTimers === "function") clearTimers();
    if (typeof flushProgressForCloud === "function") flushProgressForCloud("round_archive");
    if (typeof flushActivityForCloud === "function") flushActivityForCloud("round_archive");

    const beforePayload = normalizeSyncPayload(collectSyncPayload());
    const currentRound = loadRoundState();
    const currentArchives = loadRoundArchives();
    const record = makeRoundArchiveRecord(archiveName, note, currentRound, beforePayload);
    if (!record) return { ok: false, error: "归档信息无效，未修改任何数据。" };
    const archives = { ...currentArchives, [record.id]: record };
    const nextRound = createNextRoundState(currentRound);
    const candidate = emptyLivePayloadForNewRound(beforePayload, nextRound, archives);
    const bytes = roundArchivePayloadBytes(candidate);
    if (bytes > GIST_RELIABLE_INLINE_MAX_BYTES) {
      return { ok: false, error: "归档后同步数据会超过当前云同步的可靠大小上限。为避免归档成功后无法同步，本次已停止且没有重置数据。" };
    }

    if (typeof writeHashBackup === "function" && hasBusinessData(beforePayload)) {
      if (!writeHashBackup("pre_round_archive", beforePayload, "user_round_archive")) {
        return { ok: false, error: "归档前安全备份写入失败，已停止归档，没有重置任何数据。" };
      }
    }

    const transaction = captureRoundArchiveTransaction();
    const previousSuppressDirty = state.suppressDirty;
    state.suppressDirty = true;
    let saved = false;
    try {
      saved = saveRoundArchives(archives) !== false && saveRoundState(nextRound) !== false && resetLiveRoundStorage() !== false;
      const after = normalizeSyncPayload(collectSyncPayload());
      saved = saved && Boolean(loadRoundArchives()[record.id]) && sameRoundState(loadRoundState(), nextRound) && !hasLiveRoundData(after);
      if (!saved) throw new Error("archive_write_verify_failed");
    } catch (error) {
      rollbackRoundArchiveTransaction(transaction);
      return { ok: false, error: "归档写入或校验失败，已自动回滚，原有学习数据没有被清空。" };
    } finally {
      state.suppressDirty = previousSuppressDirty;
    }

    resetStudyRuntimeAfterRoundChange();
    touchLocalSync();
    bumpLocalBusinessRevision("round_archive", { source: "user" });
    onLocalDataChanged("round_archive");
    if (typeof appendAuditEvent === "function") {
      appendAuditEvent({
        type: "user:round_archived",
        message: `archiveId=${record.id} generation=${currentRound.generation}->${nextRound.generation} name=${archiveName.slice(0, 80)} bytes=${bytes}`
      });
    }
    return { ok: true, record, nextRound, bytes };
  } finally {
    state.roundArchiveBusy = false;
  }
}
