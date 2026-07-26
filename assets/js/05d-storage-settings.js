"use strict";

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
  var saved = saveJson(SETTINGS_KEY, state.settings);
  if (!saved) return false;
  if (touch) {
    // 设置属于本机 UI 状态，不参与云端 business hash，避免不同设备互相覆盖当前 Unit/播放偏好。
    touchLocalSync();
  }
  return true;
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
  return saveJson(CLOUD_KEY, state.cloud);
}


function persistSyncMeta() {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  return saveJson(SYNC_META_KEY, state.syncMeta);
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
  return persistSyncMeta();
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
