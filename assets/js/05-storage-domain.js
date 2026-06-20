"use strict";

function progressKey(bookId) {
  return `progress:${bookId}`;
}


function unknownProgressKey(bookId, scope = currentUnknownScope()) {
  if (scope.scope === "book") return `unknown_progress:${bookId}:book`;
  return `unknown_progress:${bookId}:unit:${scope.unit}`;
}


function marksKey(bookId) {
  return `marks:${bookId}`;
}


function markStatesKey(bookId) {
  return MARK_STATES_PREFIX + bookId;
}


function activityKey(bookId) {
  return `activity:${bookId}`;
}


function unitStatsKey(bookId) {
  return `unit_stats:${bookId}`;
}


function loadProgress(bookId) {
  return sanitizeProgressPayload(loadJson(progressKey(bookId), { lastWordId: null }), { priority: "snapshot" });
}


function loadProgressCursorStore() {
  var store = loadJson(PROGRESS_CURSOR_KEY, { byBook: {} });
  return { byBook: isPlainObject(store.byBook) ? store.byBook : {} };
}


function saveProgressCursorStore(store) {
  saveJson(PROGRESS_CURSOR_KEY, { byBook: isPlainObject(store && store.byBook) ? store.byBook : {} }, { priority: "local_cursor" });
}


function loadProgressCursor(bookId) {
  var store = loadProgressCursorStore();
  return sanitizeProgressPayload(store.byBook && store.byBook[bookId] || { lastWordId: null });
}


function saveProgressCursor(bookId, progress, options = {}) {
  var store = loadProgressCursorStore();
  var previous = sanitizeProgressPayload(store.byBook && store.byBook[bookId] || { lastWordId: null });
  var sanitized = sanitizeProgressPayload(progress);
  if (sameProgressPosition(previous, sanitized)) return false;
  store.byBook[bookId] = sanitized;
  saveProgressCursorStore(store);
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({
      type: "progress:cursor_saved",
      message: "bookId=" + String(bookId || "") + " unit=" + String(sanitized.unit || "") + " lastWordId=" + String(sanitized.lastWordId || "") + " reason=" + String(options.reason || "")
    });
  }
  if (options.queue !== false && typeof queueProgressCloudSync === "function") {
    queueProgressCloudSync(options.reason || "cursor_saved");
  }
  return true;
}


function loadProgressForResume(bookId) {
  var cursor = loadProgressCursor(bookId);
  return Number(cursor.lastWordId || 0) > 0 ? cursor : loadProgress(bookId);
}


function loadUnknownProgressCursorStore() {
  var store = loadJson(UNKNOWN_PROGRESS_CURSOR_KEY, { byBook: {} });
  return { byBook: isPlainObject(store.byBook) ? store.byBook : {} };
}


function saveUnknownProgressCursorStore(store) {
  saveJson(UNKNOWN_PROGRESS_CURSOR_KEY, { byBook: isPlainObject(store && store.byBook) ? store.byBook : {} }, { priority: "local_cursor" });
}


function normalizeUnknownProgressCursorBook(item) {
  var source = isPlainObject(item) ? item : {};
  return {
    book: sanitizeProgressPayload(source.book || { lastWordId: null }),
    units: isPlainObject(source.units) ? source.units : {}
  };
}


function loadUnknownProgressCursor(bookId, scope = currentUnknownScope()) {
  var store = loadUnknownProgressCursorStore();
  var item = normalizeUnknownProgressCursorBook(store.byBook && store.byBook[bookId]);
  if (scope.scope === "book") return sanitizeProgressPayload(item.book || { lastWordId: null });
  return sanitizeProgressPayload(item.units && item.units[String(Number(scope.unit) || 0)] || { lastWordId: null });
}


function saveUnknownProgressCursor(bookId, scope, progress, options = {}) {
  var store = loadUnknownProgressCursorStore();
  var item = normalizeUnknownProgressCursorBook(store.byBook && store.byBook[bookId]);
  var key = scope && scope.scope === "book" ? "book" : String(Number(scope && scope.unit) || 0);
  var previous = scope && scope.scope === "book" ? item.book : sanitizeProgressPayload(item.units[key] || { lastWordId: null });
  var sanitized = sanitizeProgressPayload(progress);
  if (sameProgressPosition(previous, sanitized)) return false;
  if (scope && scope.scope === "book") item.book = sanitized;
  else item.units[key] = sanitized;
  store.byBook[bookId] = item;
  saveUnknownProgressCursorStore(store);
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({
      type: "unknown_progress:cursor_saved",
      message: "bookId=" + String(bookId || "") + " scope=" + String(scope && scope.scope || "") + " unit=" + String(scope && scope.unit || "") + " lastWordId=" + String(sanitized.lastWordId || "") + " reason=" + String(options.reason || "")
    });
  }
  if (options.queue !== false && typeof queueProgressCloudSync === "function") {
    queueProgressCloudSync(options.reason || "unknown_cursor_saved");
  }
  return true;
}


function loadUnknownProgressForResume(bookId, scope = currentUnknownScope()) {
  var cursor = loadUnknownProgressCursor(bookId, scope);
  return Number(cursor.lastWordId || 0) > 0 ? cursor : loadUnknownProgress(bookId, scope);
}


function queueProgressCloudSync(reason = "progress_cursor") {
  var wasPending = state.pendingProgressSync === true;
  state.pendingProgressSync = true;
  saveJson(PROGRESS_PENDING_KEY, { pending: true, reason: String(reason || ""), updatedAt: beijingISOString() }, { priority: "local_cursor" });
  if (!wasPending && typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "sync:progress_pending", message: "reason=" + String(reason || "") });
  }
  if (typeof updateSyncIndicator === "function") updateSyncIndicator();
}


function restoreProgressPending() {
  var meta = loadJson(PROGRESS_PENDING_KEY, { pending: false });
  state.pendingProgressSync = meta && meta.pending === true;
  return state.pendingProgressSync;
}


function clearProgressPending() {
  state.pendingProgressSync = false;
  saveJson(PROGRESS_PENDING_KEY, { pending: false, updatedAt: beijingISOString() }, { priority: "local_cursor" });
}


function hasPendingProgressSync() {
  if (state.pendingProgressSync === true) return true;
  var meta = loadJson(PROGRESS_PENDING_KEY, { pending: false });
  return meta && meta.pending === true;
}


function syncProgressCursorFromCloudPayload(payload) {
  var normalized = normalizeSyncPayload(payload || {});
  Object.keys(normalized.progress || {}).forEach(function(bookId) {
    saveProgressCursor(bookId, normalized.progress[bookId], { queue: false, reason: "cloud_apply" });
  });
  Object.keys(normalized.unknownProgress || {}).forEach(function(bookId) {
    var item = normalized.unknownProgress[bookId] || {};
    if (item.book) saveUnknownProgressCursor(bookId, { scope: "book" }, item.book, { queue: false, reason: "cloud_apply" });
    Object.keys(item.units || {}).forEach(function(unit) {
      saveUnknownProgressCursor(bookId, { scope: "unit", unit: Number(unit) }, item.units[unit], { queue: false, reason: "cloud_apply" });
    });
  });
}


function flushProgressForCloud(reason = "flush") {
  if (!hasPendingProgressSync()) return false;
  var changed = false;
  var progressStore = loadProgressCursorStore();
  Object.keys(progressStore.byBook || {}).forEach(function(bookId) {
    var cursor = sanitizeProgressPayload(progressStore.byBook[bookId]);
    if (!Number(cursor.lastWordId || 0)) return;
    if (!sameProgressPosition(loadProgress(bookId), cursor)) {
      saveProgress(bookId, cursor, { touch: true });
      changed = true;
    }
  });
  var unknownStore = loadUnknownProgressCursorStore();
  Object.keys(unknownStore.byBook || {}).forEach(function(bookId) {
    var item = normalizeUnknownProgressCursorBook(unknownStore.byBook[bookId]);
    if (Number(item.book && item.book.lastWordId || 0) && !sameProgressPosition(loadUnknownProgress(bookId, { scope: "book" }), item.book)) {
      saveUnknownProgress(bookId, { scope: "book" }, item.book, { touch: true });
      changed = true;
    }
    Object.keys(item.units || {}).forEach(function(unit) {
      var cursor = sanitizeProgressPayload(item.units[unit]);
      if (!Number(cursor.lastWordId || 0)) return;
      var scope = { scope: "unit", unit: Number(unit) };
      if (!sameProgressPosition(loadUnknownProgress(bookId, scope), cursor)) {
        saveUnknownProgress(bookId, scope, cursor, { touch: true });
        changed = true;
      }
    });
  });
  clearProgressPending();
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "sync:flush_progress_for_cloud", message: "reason=" + String(reason || "") + " changed=" + String(changed) });
  }
  if (typeof updateSyncIndicator === "function") updateSyncIndicator();
  return changed;
}

function sameProgressPosition(a, b) {
  var oldItem = sanitizeProgressPayload(a || { lastWordId: null });
  var nextItem = sanitizeProgressPayload(b || { lastWordId: null });
  return Number(oldItem.unit || 0) === Number(nextItem.unit || 0) &&
    Number(oldItem.lastWordId || 0) === Number(nextItem.lastWordId || 0);
}


function saveProgress(bookId, progress, _ref) {
  var touch = (_ref && _ref.touch) !== false;
  var sanitized = sanitizeProgressPayload(progress);
  var previous = loadProgress(bookId);
  if (sameProgressPosition(previous, sanitized)) {
    // P9: 同一学习位置的 updatedAt 重写不能制造 business dirty。
    var preserved = { ...sanitized };
    if (previous.updatedAt) preserved.updatedAt = previous.updatedAt;
    saveJson(progressKey(bookId), preserved);
    return;
  }
  saveJson(progressKey(bookId), sanitized);
  if (touch) {
    touchLocalSync();
    appendPendingOp({ type: "progress.set", bookId: bookId, progress: sanitized });
    onLocalDataChanged("progress");
  }
}


function loadUnknownProgress(bookId, scope = currentUnknownScope()) {
  return sanitizeProgressPayload(loadJson(unknownProgressKey(bookId, scope), { lastWordId: null }), { priority: "snapshot" });
}


function saveUnknownProgress(bookId, scope, progress, _ref) {
  var touch = (_ref && _ref.touch) !== false;
  var sanitized = sanitizeProgressPayload(progress);
  var previous = loadUnknownProgress(bookId, scope);
  if (sameProgressPosition(previous, sanitized)) {
    var preserved = { ...sanitized };
    if (previous.updatedAt) preserved.updatedAt = previous.updatedAt;
    saveJson(unknownProgressKey(bookId, scope), preserved);
    return;
  }
  saveJson(unknownProgressKey(bookId, scope), sanitized);
  if (touch) {
    touchLocalSync();
    appendPendingOp({
      type: "unknownProgress.set",
      bookId: bookId,
      scope: scope.scope === "book" ? "book" : "unit",
      unit: scope.scope === "book" ? null : Number(scope.unit),
      progress: sanitized
    });
    onLocalDataChanged("unknownProgress");
  }
}


function loadRawMarks(bookId) {
  var marks = loadJson(marksKey(bookId), { known: [], unknown: [] });
  return sanitizeMarksPayload(marks);
}


function loadMarkStates(bookId) {
  var states = loadJson(markStatesKey(bookId), null);
  if (isPlainObject(states) && Object.keys(states).length) {
    return sanitizeMarkStatesPayload(states);
  }
  var rawMarks = loadRawMarks(bookId);
  if (normalizeIdList(rawMarks.known).length || normalizeIdList(rawMarks.unknown).length) {
    var legacyUpdatedAt =
      state.syncMeta.localUpdatedAt ||
      state.syncMeta.lastSyncedLocalUpdatedAt ||
      "1970-01-01T00:00:00.000Z";
    var migrated = deriveMarkStatesFromMarks(bookId, rawMarks, legacyUpdatedAt);
    saveMarkStates(bookId, migrated, { touch: false, syncMarks: false });
    return migrated;
  }
  return {};
}


function loadMarks(bookId) {
  var states = loadJson(markStatesKey(bookId), null);
  if (isPlainObject(states) && Object.keys(states).length) {
    return deriveMarksFromMarkStates(sanitizeMarkStatesPayload(states));
  }
  return loadRawMarks(bookId);
}


function saveMarks(bookId, marks, options) {
  options = options || {};
  var touch = options.touch !== false;
  var updateStates = options.updateStates === true;
  var sanitized = sanitizeMarksPayload(marks);
  saveJson(marksKey(bookId), sanitized);
  if (updateStates) {
    var states = deriveMarkStatesFromMarks(bookId, sanitized);
    saveJson(markStatesKey(bookId), states);
  }
  if (touch) touchLocalSync();
}


// ── markStates sanitizers ──────────────────────────────────────────────

function sanitizeMarkStateItem(item) {
  var source = isPlainObject(item) ? item : {};
  var value =
    source.value === "known" ||
    source.value === "unknown" ||
    source.value === null
      ? source.value
      : null;
  var updatedAt =
    typeof source.updatedAt === "string" && source.updatedAt
      ? source.updatedAt
      : "";
  var clientId =
    typeof source.clientId === "string" ? source.clientId : "";
  var seq = Number(source.seq);
  return {
    value: value,
    updatedAt: updatedAt,
    clientId: clientId,
    seq: Number.isFinite(seq) && seq >= 0 ? seq : 0
  };
}


function sanitizeMarkStatesPayload(states) {
  var source = isPlainObject(states) ? states : {};
  var result = {};
  Object.keys(source).forEach(function(wordId) {
    var id = Number(wordId);
    if (!Number.isFinite(id) || id <= 0) return;
    var item = sanitizeMarkStateItem(source[wordId]);
    if (!item.updatedAt) return;
    result[String(id)] = item;
  });
  return result;
}


function deriveMarksFromMarkStates(markStates) {
  var states = sanitizeMarkStatesPayload(markStates);
  var known = [];
  var unknown = [];
  Object.keys(states).forEach(function(wordId) {
    var id = Number(wordId);
    var item = states[wordId];
    if (item.value === "known") known.push(id);
    if (item.value === "unknown") unknown.push(id);
  });
  return sanitizeMarksPayload({ known: known, unknown: unknown });
}


function compareMarkState(a, b) {
  var at = Date.parse((a && a.updatedAt) || "") || 0;
  var bt = Date.parse((b && b.updatedAt) || "") || 0;
  if (at !== bt) return at > bt ? 1 : -1;
  var as = Number((a && a.seq) || 0);
  var bs = Number((b && b.seq) || 0);
  if (as !== bs) return as > bs ? 1 : -1;
  var ac = String((a && a.clientId) || "");
  var bc = String((b && b.clientId) || "");
  if (ac === bc) return 0;
  return ac > bc ? 1 : -1;
}


function deriveMarkStatesFromMarks(bookId, marks, fallbackUpdatedAt) {
  var safeFallbackUpdatedAt =
    fallbackUpdatedAt ||
    "1970-01-01T00:00:00.000Z";
  var sanitized = sanitizeMarksPayload(marks);
  var meta = ensureSyncMeta(state.syncMeta);
  var result = {};
  sanitized.known.forEach(function(id) {
    result[String(id)] = {
      value: "known",
      updatedAt: safeFallbackUpdatedAt,
      clientId: meta.clientId || "legacy",
      seq: Number(meta.localSeq || 0)
    };
  });
  sanitized.unknown.forEach(function(id) {
    var key = String(id);
    if (!result[key]) {
      result[key] = {
        value: "unknown",
        updatedAt: safeFallbackUpdatedAt,
        clientId: meta.clientId || "legacy",
        seq: Number(meta.localSeq || 0)
      };
    }
  });
  return result;
}


function saveMarkStates(bookId, markStates, options) {
  options = options || {};
  var touch = options.touch !== false;
  var syncMarks = options.syncMarks !== false;
  var sanitized = sanitizeMarkStatesPayload(markStates);
  saveJson(markStatesKey(bookId), sanitized);
  if (syncMarks) {
    var marks = deriveMarksFromMarkStates(sanitized);
    saveJson(marksKey(bookId), marks);
  }
  if (touch) touchLocalSync();
}


function setWordMarkState(bookId, wordId, value, options) {
  options = options || {};
  var touch = options.touch !== false;
  var id = Number(wordId);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (value !== "known" && value !== "unknown" && value !== null) return false;
  var states = loadMarkStates(bookId);
  var meta = ensureSyncMeta(state.syncMeta);
  var seq = nextLocalSeq();
  var now = beijingISOString();
  states[String(id)] = {
    value: value,
    updatedAt: now,
    clientId: meta.clientId,
    seq: seq
  };
  saveMarkStates(bookId, states, { touch: touch, syncMarks: true });
  if (touch) {
    appendPendingOp({
      type: "word.mark.set",
      bookId: bookId,
      wordId: id,
      value: value,
      updatedAt: now,
      clientId: meta.clientId,
      seq: seq
    });
    onLocalDataChanged("mark");
  }
  return true;
}


function loadActivity(bookId) {
  const activity = loadJson(activityKey(bookId), { days: {} });
  return sanitizeActivityPayload(activity);
}


function saveActivity(bookId, activity, { touch = true } = {}) {
  const sanitized = sanitizeActivityPayload(activity);
  saveJson(activityKey(bookId), sanitized);
  if (touch) touchLocalSync();
}


function loadActivityDraftStore() {
  var store = loadJson(ACTIVITY_DRAFT_KEY, { byBook: {}, pending: false });
  return {
    byBook: isPlainObject(store.byBook) ? store.byBook : {},
    pending: store.pending === true,
    reason: typeof store.reason === "string" ? store.reason : "",
    updatedAt: typeof store.updatedAt === "string" ? store.updatedAt : ""
  };
}


function saveActivityDraftStore(store) {
  saveJson(ACTIVITY_DRAFT_KEY, {
    byBook: isPlainObject(store && store.byBook) ? store.byBook : {},
    pending: store && store.pending === true,
    reason: String(store && store.reason || ""),
    updatedAt: beijingISOString()
  }, { priority: "local_cursor" });
}


function loadActivityDraft(bookId) {
  var store = loadActivityDraftStore();
  if (store.byBook && store.byBook[bookId]) return sanitizeActivityPayload(store.byBook[bookId]);
  return loadActivity(bookId);
}


function saveActivityDraft(bookId, activity, reason = "activity") {
  var store = loadActivityDraftStore();
  var wasPending = store.pending === true || state.activityDirtyPending === true;
  store.byBook[bookId] = sanitizeActivityPayload(activity);
  store.pending = true;
  store.reason = String(reason || "activity");
  saveActivityDraftStore(store);
  state.activityDirtyPending = true;
  state.activityDraftPending = true;
  if (!wasPending && typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "sync:activity_draft_pending", message: "reason=" + String(reason || "") });
  }
  if (typeof updateSyncIndicator === "function") updateSyncIndicator();
}


function restoreActivityDraftPending() {
  var store = loadActivityDraftStore();
  state.activityDirtyPending = store.pending === true;
  state.activityDraftPending = store.pending === true;
  return state.activityDirtyPending;
}


function clearActivityDraftPending() {
  state.activityDirtyPending = false;
  state.activityDraftPending = false;
  saveActivityDraftStore({ byBook: {}, pending: false, reason: "" });
}


function hasPendingActivityDraft() {
  if (state.activityDirtyPending === true || state.activityDraftPending === true) return true;
  var store = loadActivityDraftStore();
  return store.pending === true;
}


function flushActivityForCloud(reason = "activity_flush") {
  if (!hasPendingActivityDraft()) return false;
  var store = loadActivityDraftStore();
  var changed = false;
  Object.keys(store.byBook || {}).forEach(function(bookId) {
    var draft = sanitizeActivityPayload(store.byBook[bookId]);
    var cloud = loadActivity(bookId);
    if (stableStringifyHash(draft) !== stableStringifyHash(cloud)) {
      saveActivity(bookId, draft, { touch: false });
      changed = true;
    }
  });
  clearActivityDraftPending();
  if (changed) {
    touchLocalSync();
    onLocalDataChanged("activity:" + String(reason || "flush"));
  }
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "sync:flush_activity_for_cloud", message: "reason=" + String(reason || "") + " changed=" + String(changed) });
  }
  if (typeof updateSyncIndicator === "function") updateSyncIndicator();
  return changed;
}

function loadUnitStats(bookId) {
  return sanitizeUnitStatsPayload(loadJson(unitStatsKey(bookId), { units: {} }), { priority: "snapshot" });
}


function saveUnitStats(bookId, stats, { touch = true } = {}) {
  const sanitized = sanitizeUnitStatsPayload(stats);
  saveJson(unitStatsKey(bookId), sanitized);
  if (touch) touchLocalSync();
}


function currentBook() {
  return BOOKS.find((book) => book.id === state.settings.bookId) || BOOKS[0];
}


function unitBandLabel(book, unit) {
  if (book.id !== SHANGUO_BOOK_ID) return "";
  const number = Number(unit);
  if (number >= 1 && number <= 12) return "高频词";
  if (number >= 13 && number <= 21) return "中频词";
  if (number >= 22 && number <= 30) return "低频词";
  return "";
}


function unitDisplayLabel(book, unit) {
  const band = unitBandLabel(book, unit);
  return band ? `Unit ${unit} · ${band}` : `Unit ${unit}`;
}


function bookContextLabel(book, unit = state.settings.unit) {
  const band = unitBandLabel(book, unit);
  return band ? `${book.name} · ${band}` : book.name;
}


function persistSettings(_ref) {
  var touch = (_ref && _ref.touch) !== false;
  var book = currentBook();
  state.settings.unit = clamp(Number(state.settings.unit) || 1, 1, book.totalUnits);
  state.settings.queueMode = QUEUE_MODES.has(state.settings.queueMode) ? state.settings.queueMode : DEFAULT_SETTINGS.queueMode;
  state.settings.unknownScope = UNKNOWN_SCOPES.has(state.settings.unknownScope) ? state.settings.unknownScope : DEFAULT_SETTINGS.unknownScope;
  rememberCurrentBookSettings(book.id);
  saveJson(SETTINGS_KEY, state.settings);
  if (touch) {
    // P7: settings 是本机 UI 状态，不再参与云同步 dirty/hash，避免不同设备当前 Unit/播放设置互相覆盖。
    touchLocalSync();
  }
}


function rememberCurrentBookSettings(bookId = state.settings.bookId) {
  const book = BOOKS.find((item) => item.id === bookId) || currentBook();
  state.settings.bookSettings = normalizeBookSettingsStore(state.settings.bookSettings);
  state.settings.bookSettings[book.id] = createBookSettingsSnapshot(book, state.settings);
}


function restoreBookSettings(bookId) {
  const book = BOOKS.find((item) => item.id === bookId) || BOOKS[0];
  const store = normalizeBookSettingsStore(state.settings.bookSettings);
  const remembered = store[book.id];
  state.settings = {
    ...state.settings,
    ...(remembered || { unit: 1 }),
    bookId: book.id,
    bookSettings: store
  };
  normalizeSettings();
}


function createBookSettingsSnapshot(book, source) {
  const normalized = normalizeBookSettingValues(book, source);
  return PER_BOOK_SETTING_KEYS.reduce((snapshot, key) => {
    snapshot[key] = normalized[key];
    return snapshot;
  }, {});
}


function normalizeBookSettingsStore(store) {
  if (!isPlainObject(store)) return {};
  return Object.entries(store).reduce((normalized, [bookId, values]) => {
    const book = BOOKS.find((item) => item.id === bookId);
    if (book && isPlainObject(values)) normalized[book.id] = createBookSettingsSnapshot(book, values);
    return normalized;
  }, {});
}


function normalizeBookSettingValues(book, values) {
  const source = { ...DEFAULT_SETTINGS, ...(isPlainObject(values) ? values : {}) };
  return {
    unit: clamp(Number(source.unit) || 1, 1, book.totalUnits),
    queueMode: QUEUE_MODES.has(source.queueMode) ? source.queueMode : DEFAULT_SETTINGS.queueMode,
    unknownScope: UNKNOWN_SCOPES.has(source.unknownScope) ? source.unknownScope : DEFAULT_SETTINGS.unknownScope,
    mode: STUDY_MODES.has(source.mode) ? source.mode : DEFAULT_SETTINGS.mode,
    summaryMode: SUMMARY_MODES.has(source.summaryMode) ? source.summaryMode : DEFAULT_SETTINGS.summaryMode,
    summaryCount: clamp(Number(source.summaryCount) || DEFAULT_SETTINGS.summaryCount, 5, 200),
    speakEn: typeof source.speakEn === "boolean" ? source.speakEn : DEFAULT_SETTINGS.speakEn,
    speakZh: typeof source.speakZh === "boolean" ? source.speakZh : DEFAULT_SETTINGS.speakZh,
    rate: clamp(Number(source.rate) || DEFAULT_SETTINGS.rate, PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX),
    preReadDelay: clampFinite(source.preReadDelay, DEFAULT_SETTINGS.preReadDelay, PRE_READ_DELAY_MIN, PRE_READ_DELAY_MAX),
    zhDelay: clampFinite(source.zhDelay, DEFAULT_SETTINGS.zhDelay, ZH_DELAY_MIN, ZH_DELAY_MAX),
    retentionPause: clampFinite(source.retentionPause, DEFAULT_SETTINGS.retentionPause, RETENTION_PAUSE_MIN, RETENTION_PAUSE_MAX),
    manualMode: typeof source.manualMode === "boolean" ? source.manualMode : DEFAULT_SETTINGS.manualMode,
    highOnly: typeof source.highOnly === "boolean" ? source.highOnly : DEFAULT_SETTINGS.highOnly
  };
}


function persistCloud() {
  saveJson(CLOUD_KEY, state.cloud);
}


function persistSyncMeta() {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  saveJson(SYNC_META_KEY, state.syncMeta);
}


function nextLocalSeq() {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  var next = Number(state.syncMeta.localSeq || 0) + 1;
  state.syncMeta.localSeq = next;
  persistSyncMeta();
  return next;
}


function touchLocalSync() {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.localUpdatedAt = beijingISOString();
  persistSyncMeta();
}


function bumpLocalBusinessRevision(reason, options = {}) {
  state.localBusinessRevision = (state.localBusinessRevision || 0) + 1;
  state.lastLocalBusinessChangeAt = Date.now();
  state.lastLocalBusinessChangeReason = reason || "";
  state.lastLocalBusinessChangeSource = options.source || "user";
  state.lastLocalBusinessChangeRunId = options.runId || null;
}


function hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId) {
  const currentHash = businessPayloadHash(collectSyncPayload());
  if (currentHash === localHashAtStart && (state.localBusinessRevision || 0) === localRevisionAtStart) return false;
  const source = state.lastLocalBusinessChangeSource;
  const changeRunId = state.lastLocalBusinessChangeRunId;
  return !(source === "sync" && changeRunId === runId);
}


function normalizeSettings() {
  const book = BOOKS.find((item) => item.id === state.settings.bookId) || BOOKS[0];
  const bookSettings = normalizeBookSettingsStore(state.settings.bookSettings);
  const bookValues = normalizeBookSettingValues(book, state.settings);
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...state.settings,
    ...bookValues,
    bookId: book.id,
    bookSettings
  };
  persistSettings({ touch: false });
}


