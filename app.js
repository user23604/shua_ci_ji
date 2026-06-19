"use strict";

const ACCESS_KEY = "ky2027";
const AUTH_KEY = "is_authenticated";
const SETTINGS_KEY = "vocab_machine_settings_v1";
const CLOUD_KEY = "vocab_machine_cloud_v1";
const SYNC_META_KEY = "vocab_machine_sync_meta_v1";
const PENDING_OPS_KEY = "vocab_machine_pending_ops_v1";
const SYNC_FILE_NAME = "sync.json";
const SYNC_BACKUP_FILE_NAME = "sync.prev.json";
const AUTO_SYNC_DEBOUNCE_MS = 700;
const SYNC_OK_VISIBLE_MS = 2000;
const PLAYBACK_RATE_MIN = 0.5;
const PLAYBACK_RATE_MAX = 10;
const PLAYBACK_RATE_STEP = 0.05;
const SPEECH_RATE_MIN = 0.5;
const SPEECH_RATE_MAX = PLAYBACK_RATE_MAX;
// 朗读倍速只控制 Web Speech 语速；所有停留和延迟都按用户设置的绝对毫秒值执行。
const SPEECH_START_TIMEOUT_MS = 900;
const SPEECH_POLL_MS = 120;
const PRE_READ_DELAY_MIN = 0;
const PRE_READ_DELAY_MAX = 3000;
const PRE_READ_DELAY_STEP = 50;
const PRE_READ_DELAY_DEFAULT = 500;
const ZH_DELAY_MIN = 0;
const ZH_DELAY_MAX = 5000;
const RETENTION_PAUSE_MIN = 0;
const RETENTION_PAUSE_MAX = 5000;
const RETENTION_PAUSE_STEP = 50;
const RETENTION_PAUSE_DEFAULT = 850;
const SHANGUO_BOOK_ID = "27ky-shanguo-gaopin";
const SYNC_STATUS_LABELS = {
  idle: "云同步空闲",
  syncing: "云同步中",
  ok: "云同步完成",
  error: "云同步失败"
};
const SUMMARY_MODES = new Set(["count", "unit", "manual"]);
const STUDY_MODES = new Set(["restart", "resume"]);
const QUEUE_MODES = new Set(["main", "unknown"]);
const UNKNOWN_SCOPES = new Set(["unit", "book"]);
const PER_BOOK_SETTING_KEYS = [
  "unit",
  "queueMode",
  "unknownScope",
  "mode",
  "summaryMode",
  "summaryCount",
  "speakEn",
  "speakZh",
  "rate",
  "preReadDelay",
  "zhDelay",
  "retentionPause",
  "manualMode",
  "highOnly"
];
const BOOKS = [
  {
    id: SHANGUO_BOOK_ID,
    name: "27考研英语闪过词典",
    csv: "27ky_shanguo_gaopin.csv",
    totalUnits: 30
  },
  {
    id: "hongbaoshu-bikao",
    name: "红宝书 必考词",
    csv: "hongbaoshu_bikao.csv",
    totalUnits: 26
  },
  {
    id: "hongbaoshu-jichu",
    name: "红宝书 基础词",
    csv: "hongbaoshu_jichu.csv",
    totalUnits: 30
  }
];

const DEFAULT_SETTINGS = {
  bookId: BOOKS[0].id,
  unit: 1,
  mode: "restart",
  summaryMode: "count",
  summaryCount: 20,
  speakEn: true,
  speakZh: false,
  rate: 1,
  preReadDelay: PRE_READ_DELAY_DEFAULT,
  zhDelay: 1200,
  retentionPause: RETENTION_PAUSE_DEFAULT,
  manualMode: false,
  queueMode: "main",
  unknownScope: "unit",
  highOnly: false,
  bookSettings: {}
};

const DEFAULT_SYNC_META = {
  initialized: false,
  gistId: "",
  fileName: SYNC_FILE_NAME,
  lastRemoteVersion: "",
  lastRemoteUpdatedAt: "",
  lastSyncedLocalUpdatedAt: "",
  localUpdatedAt: "",
  clientId: ""
};

const app = document.getElementById("app");

const state = {
  settings: loadJson(SETTINGS_KEY, DEFAULT_SETTINGS),
  cloud: loadJson(CLOUD_KEY, { token: "", gistId: "" }),
  syncMeta: loadJson(SYNC_META_KEY, DEFAULT_SYNC_META),
  wordsByBook: new Map(),
  maxFreqByBook: new Map(),
  view: "auth",
  words: [],
  unitWords: [],
  currentIndex: 0,
  showZh: false,
  speechPhase: "",
  activeZhIndex: -1,
  playbackToken: 0,
  timers: [],
  groupStats: createGroupStats(),
  breakInfo: null,
  roundReturn: null,
  undoWordId: null,
  archiveOpen: false,
  archiveTab: "unknown",
  archiveStatus: "",
  statsOpen: false,
  statsMode: "day",
  statsMonthOffset: 0,
  reviewMode: null,
  setupStatus: "",
  setupPrimeBookIds: new Set(),
  wakeLock: null,
  playbackPaused: false,
  resumeFeedback: false,
  markFeedback: "",
  cardStartedAt: 0,
  cardEnterDirection: "",
  currentWordId: null,
  currentWordRecorded: false,
  transitioning: false,
  navQueue: [],
  pointer: null,
  suppressNextCardClickPause: false,
  syncStatus: "idle",
  syncConfigTimer: null,
  syncHideTimer: null,
  syncInFlight: null,
  applyingRemotePayload: false
};

function createGroupStats() {
  return { seen: 0, known: 0, unknown: 0, unknownIds: [] };
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? { ...fallback, ...parsed } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

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

function activityKey(bookId) {
  return `activity:${bookId}`;
}

function unitStatsKey(bookId) {
  return `unit_stats:${bookId}`;
}

function loadProgress(bookId) {
  return sanitizeProgressPayload(loadJson(progressKey(bookId), { lastWordId: null }));
}

function saveProgress(bookId, progress, { touch = true } = {}) {
  const sanitized = sanitizeProgressPayload(progress);
  saveJson(progressKey(bookId), sanitized);
  if (touch) {
    touchLocalSync();
    appendPendingOp({ type: "progress.set", bookId, progress: sanitized });
  }
}

function loadUnknownProgress(bookId, scope = currentUnknownScope()) {
  return sanitizeProgressPayload(loadJson(unknownProgressKey(bookId, scope), { lastWordId: null }));
}

function saveUnknownProgress(bookId, scope, progress, { touch = true } = {}) {
  const sanitized = sanitizeProgressPayload(progress);
  saveJson(unknownProgressKey(bookId, scope), sanitized);
  if (touch) {
    touchLocalSync();
    appendPendingOp({
      type: "unknownProgress.set",
      bookId,
      scope: scope.scope === "book" ? "book" : "unit",
      unit: scope.scope === "book" ? null : Number(scope.unit),
      progress: sanitized
    });
  }
}

function loadMarks(bookId) {
  const marks = loadJson(marksKey(bookId), { known: [], unknown: [] });
  return sanitizeMarksPayload(marks);
}

function saveMarks(bookId, marks, { touch = true } = {}) {
  saveJson(marksKey(bookId), sanitizeMarksPayload(marks));
  if (touch) touchLocalSync();
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

function loadUnitStats(bookId) {
  return sanitizeUnitStatsPayload(loadJson(unitStatsKey(bookId), { units: {} }));
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

function persistSettings({ touch = true } = {}) {
  const book = currentBook();
  state.settings.unit = clamp(Number(state.settings.unit) || 1, 1, book.totalUnits);
  state.settings.queueMode = QUEUE_MODES.has(state.settings.queueMode) ? state.settings.queueMode : DEFAULT_SETTINGS.queueMode;
  state.settings.unknownScope = UNKNOWN_SCOPES.has(state.settings.unknownScope) ? state.settings.unknownScope : DEFAULT_SETTINGS.unknownScope;
  rememberCurrentBookSettings(book.id);
  saveJson(SETTINGS_KEY, state.settings);
  if (touch) {
    touchLocalSync();
    appendPendingOp({ type: "settings.set", patch: { ...state.settings } });
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

function touchLocalSync() {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.localUpdatedAt = new Date().toISOString();
  persistSyncMeta();
}

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
    "localUpdatedAt"
  ].forEach((key) => {
    normalized[key] = typeof normalized[key] === "string" ? normalized[key] : "";
  });
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

function appendPendingOp(op) {
  if (!isPlainObject(op) || state.applyingRemotePayload) return;
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  const createdAt = op.createdAt || new Date().toISOString();
  const next = {
    ...op,
    opId: op.opId || createOpId(),
    baseRemoteVersion: op.baseRemoteVersion ?? state.syncMeta.lastRemoteVersion ?? "",
    createdAt
  };
  const ops = compactPendingOps([...loadPendingOpsStore().ops, next]);
  savePendingOpsStore({ ops });
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampFinite(value, fallback, min, max) {
  const number = Number(value);
  return clamp(Number.isFinite(number) ? number : fallback, min, max);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function freqAlpha(freq) {
  const maxFreq = state.maxFreqByBook.get(currentBook().id) || 1;
  const level = Math.log1p(Math.max(0, Number(freq) || 0)) / Math.log1p(maxFreq);
  return (0.035 + clamp(level, 0, 1) * 0.245).toFixed(3);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total < 60) return `${total}秒`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
}

function formatHours(seconds) {
  const hours = (seconds || 0) / 3600;
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round((seconds || 0) / 60)}m`;
}

function getActivityDay(activity, key) {
  if (!activity.days[key]) {
    activity.days[key] = { seconds: 0, words: 0, known: 0, unknown: 0, wordIds: [] };
  }
  const day = activity.days[key];
  day.seconds = Number(day.seconds) || 0;
  day.words = Number(day.words) || 0;
  day.known = Number(day.known) || 0;
  day.unknown = Number(day.unknown) || 0;
  day.wordIds = Array.isArray(day.wordIds) ? day.wordIds.map(Number).filter(Boolean) : [];
  return day;
}

function recordStudyActivity({ seconds = 0, wordId = null, counted = false, result = "" } = {}) {
  const book = currentBook();
  const activity = loadActivity(book.id);
  const day = getActivityDay(activity, localDateKey());
  day.seconds += Math.max(0, seconds);
  if (counted) day.words += 1;
  if (result === "known") day.known += 1;
  if (result === "unknown") day.unknown += 1;
  if (wordId) day.wordIds = Array.from(new Set([...day.wordIds, Number(wordId)])).sort((a, b) => a - b);
  saveActivity(book.id, activity);
  appendPendingOp({ type: "activity.day.set", bookId: book.id, date: localDateKey(), day: { ...day, wordIds: [...day.wordIds] } });
}

function commitCurrentCardActivity({ counted = false, result = "" } = {}) {
  if (state.view !== "flash" || !state.cardStartedAt) return;
  const word = state.unitWords[state.currentIndex];
  if (!word) return;
  const elapsed = clamp((Date.now() - state.cardStartedAt) / 1000, 0, 600);
  if (elapsed < 0.5 && !counted) return;
  recordStudyActivity({
    seconds: elapsed,
    wordId: word.id,
    counted: counted && !state.currentWordRecorded,
    result: counted && !state.currentWordRecorded ? result : ""
  });
  if (counted) state.currentWordRecorded = true;
  state.cardStartedAt = Date.now();
}

function getPeriodRange(mode, baseDate = new Date()) {
  const today = startOfLocalDay(baseDate);
  if (mode === "week") {
    const day = today.getDay() || 7;
    const start = addDays(today, 1 - day);
    return { start, end: addDays(start, 6), label: "本周" };
  }
  if (mode === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start, end, label: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` };
  }
  return { start: today, end: today, label: "今天" };
}

function collectActivityStats(mode) {
  const activity = loadActivity(currentBook().id);
  const { start, end, label } = getPeriodRange(mode);
  const wordIds = new Set();
  const totals = { seconds: 0, words: 0, known: 0, unknown: 0 };
  for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
    const item = activity.days[localDateKey(day)];
    if (!item) continue;
    totals.seconds += Number(item.seconds) || 0;
    totals.words += Number(item.words) || 0;
    totals.known += Number(item.known) || 0;
    totals.unknown += Number(item.unknown) || 0;
    (item.wordIds || []).forEach((id) => wordIds.add(Number(id)));
  }
  return { label, totals, wordIds: Array.from(wordIds).sort((a, b) => a - b) };
}

function formatDefinition(word) {
  if (!word) return "";
  const source = state.settings.highOnly && word.zh_high ? word.zh_high : word.zh_full;
  return String(source || "").replace(/\s+/g, " ").trim();
}

const POS_TAG_PATTERN = "(?:interj|prep|conj|pron|adj|adv|aux|num|art|vi|vt|nm|ad|int|n|v|a)";
const POS_SPLIT_RE = new RegExp(`\\s+(?=${POS_TAG_PATTERN}\\.?\\s*[\\u4e00-\\u9fff（(])`, "gi");
const POS_ADJOINED_RE = new RegExp(`([\\u4e00-\\u9fff）)])(?=${POS_TAG_PATTERN}\\.?\\s*[\\u4e00-\\u9fff（(])`, "gi");
const POS_PREFIX_RE = new RegExp(`^${POS_TAG_PATTERN}\\.?\\s*`, "i");

function splitDefinitionLines(text) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(POS_SPLIT_RE, "\n")
    .replace(POS_ADJOINED_RE, "$1\n")
    .trim();
  if (!normalized) return [];
  return normalized.split("\n").map((line) => line.trim()).filter(Boolean);
}

function formatSpokenDefinition(word) {
  if (!word) return "";
  if (word.zh_high) return normalizeSpokenMeaning(word.zh_high);
  const lines = splitDefinitionLines(word.zh_full);
  const brief = lines.map(pickBroadMeaning).filter(Boolean);
  return normalizeSpokenMeaning(brief.join("；") || word.zh_full);
}

function pickBroadMeaning(line) {
  const withoutPos = String(line || "")
    .replace(POS_PREFIX_RE, "")
    .replace(/[()（）]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!withoutPos) return "";
  return withoutPos.split(/[；;，,、/]/).map((item) => item.trim()).find(Boolean) || withoutPos;
}

function normalizeSpokenMeaning(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[；;、/]+/g, "；")
    .replace(/[，,]+/g, "，")
    .replace(/；{2,}/g, "；")
    .replace(/^；|；$/g, "")
    .trim();
}

function highlightTerms(highlight) {
  const raw = String(highlight || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const parts = raw.split(/[；;，,、]/).map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set([raw, ...parts])).sort((a, b) => b.length - a.length);
}

function highlightText(text, highlight) {
  const terms = highlightTerms(highlight).filter((term) => text.includes(term));
  if (!terms.length) return escapeHtml(text);
  const pattern = new RegExp(terms.map(escapeRegExp).join("|"), "g");
  let cursor = 0;
  let html = "";
  for (const match of text.matchAll(pattern)) {
    const start = match.index || 0;
    html += escapeHtml(text.slice(cursor, start));
    html += `<mark class="meaning-highlight">${escapeHtml(match[0])}</mark>`;
    cursor = start + match[0].length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function renderDefinitionHtml(word) {
  const text = formatDefinition(word);
  const highlight = word?.zh_high || "";
  const lines = splitDefinitionLines(text);
  let cursor = 0;
  return lines.map((line, index) => {
    const start = text.indexOf(line, cursor);
    const safeStart = start >= 0 ? start : cursor;
    const end = safeStart + line.length;
    cursor = end;
    const active = state.activeZhIndex === index ? " is-speaking" : "";
    return `<span class="meaning-line speech-token${active}" data-token-index="${index}" data-start="${safeStart}" data-end="${end}">${highlightText(line, highlight)}</span>`;
  }).join("");
}

function setSetupStatus(message, type = "") {
  state.setupStatus = message ? { message, type } : "";
  if (state.view === "setup") renderSetup();
}

function renderSyncIndicator() {
  const status = normalizeSyncStatus(state.syncStatus);
  const label = syncStatusLabel(status);
  return `
    <div class="cloud-sync-indicator is-${status}" id="cloudSyncIndicator" aria-label="${escapeHtml(label)}">
      <span class="cloud-sync-indicator__dot"></span>
    </div>
  `;
}

function setSyncStatus(status) {
  status = normalizeSyncStatus(status);
  state.syncStatus = status;
  if (state.syncHideTimer) {
    clearTimeout(state.syncHideTimer);
    state.syncHideTimer = null;
  }
  const indicator = document.getElementById("cloudSyncIndicator");
  if (indicator) {
    indicator.className = `cloud-sync-indicator is-${status}`;
    indicator.setAttribute("aria-label", syncStatusLabel(status));
  }
  if (status === "ok" || status === "error") {
    state.syncHideTimer = window.setTimeout(() => {
      state.syncStatus = "idle";
      const current = document.getElementById("cloudSyncIndicator");
      if (current) {
        current.className = "cloud-sync-indicator is-idle";
        current.setAttribute("aria-label", syncStatusLabel("idle"));
      }
    }, SYNC_OK_VISIBLE_MS);
  }
}

function syncStatusLabel(status) {
  return SYNC_STATUS_LABELS[normalizeSyncStatus(status)];
}

function normalizeSyncStatus(status) {
  return Object.prototype.hasOwnProperty.call(SYNC_STATUS_LABELS, status) ? status : "idle";
}

function clearTimers() {
  state.playbackToken += 1;
  state.timers.forEach((timer) => {
    clearTimeout(timer.id);
    if (timer.onCancel) timer.onCancel();
  });
  state.timers = [];
  state.speechPhase = "";
  state.activeZhIndex = -1;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  clearSpeechPhase();
}

function addTimer(fn, delay, onCancel = null) {
  const timer = { id: 0, onCancel };
  timer.id = window.setTimeout(() => {
    state.timers = state.timers.filter((item) => item !== timer);
    fn();
  }, delay);
  state.timers.push(timer);
  return timer.id;
}

async function ensureWords(book = currentBook()) {
  if (state.wordsByBook.has(book.id)) return state.wordsByBook.get(book.id);
  const response = await fetch(book.csv);
  if (!response.ok) {
    throw new Error(`词库加载失败：${book.csv} (${response.status})`);
  }
  const text = await response.text();
  const rows = parseCsv(text);
  const words = mapWords(rows);
  state.wordsByBook.set(book.id, words);
  state.maxFreqByBook.set(book.id, Math.max(1, ...words.map((word) => Number(word.freq) || 0)));
  return words;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      if (next === "\n") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((line) => line.some((cell) => String(cell).trim() !== ""));
}

function mapWords(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  const col = (name) => headers.indexOf(name);
  const required = ["序号", "Unit", "单词", "真题词频", "完整释义（保留红色）", "标红释义"];
  const missing = required.filter((name) => col(name) === -1);
  if (missing.length) throw new Error(`CSV 缺少列：${missing.join("、")}`);

  return rows.slice(1).map((row) => ({
    id: Number.parseInt(row[col("序号")] || "0", 10),
    unit: Number.parseInt(row[col("Unit")] || "0", 10),
    en: String(row[col("单词")] || "").trim(),
    freq: Number.parseInt(row[col("真题词频")] || "0", 10) || 0,
    zh_full: String(row[col("完整释义（保留红色）")] || "").replace(/\s+/g, " ").trim(),
    zh_high: String(row[col("标红释义")] || "").replace(/\s+/g, " ").trim()
  })).filter((word) => word.id && word.unit && word.en);
}

function isAuthenticated() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

function init() {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  persistSyncMeta();
  normalizeSettings();
  registerServiceWorker();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      pausePlaybackForBackground();
      autoPushToGist({ keepalive: true });
    }
  });
  window.addEventListener("pagehide", () => {
    pausePlaybackForBackground();
    autoPushToGist({ keepalive: true });
  });
  window.addEventListener("blur", pausePlaybackForBackground);
  window.addEventListener("resize", fitActiveWord);
  preloadSpeechVoices();
  if (isAuthenticated()) {
    renderSetup();
    queueAutoPull("init");
  } else {
    renderAuth();
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("sw.js").then((registration) => {
    if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
    registration.update().catch(() => {});
  }).catch(() => {});
}

function preloadSpeechVoices() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      window.speechSynthesis.getVoices();
    });
  }
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

function renderAuth(error = false) {
  state.view = "auth";
  releaseWakeLock();
  clearTimers();
  app.innerHTML = `
    <section class="view auth-view">
      <div class="auth-panel">
        <h1>考研词汇自动刷词机</h1>
        <p>输入访问密钥后进入个人词库。</p>
        <form class="auth-form" id="authForm">
          <label class="field-label">
            访问密钥
            <input class="input ${error ? "is-error" : ""}" id="passwordInput" type="password" autocomplete="current-password" autofocus>
          </label>
          <button class="btn btn--primary" type="submit">进入应用</button>
          <div class="status ${error ? "status--error" : ""}">${error ? "密钥错误，请重试。" : ""}</div>
        </form>
      </div>
    </section>
    ${renderSyncIndicator()}
  `;
  const form = document.getElementById("authForm");
  const input = document.getElementById("passwordInput");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value === ACCESS_KEY) {
      localStorage.setItem(AUTH_KEY, "true");
      renderSetup();
    } else {
      renderAuth(true);
    }
  });
  input.focus();
}

function renderSetup() {
  state.view = "setup";
  releaseWakeLock();
  clearTimers();
  normalizeSettings();
  const book = currentBook();
  const setupWords = state.wordsByBook.get(book.id) || [];
  const unknownMode = state.settings.queueMode === "unknown";
  const unitOptions = renderUnitSelectOptions(book, setupWords);
  const unitSelectLabel = unknownMode ? "重难点范围" : "目标 Unit";
  const bookOptions = BOOKS.map((item) => `
    <option value="${escapeHtml(item.id)}" ${item.id === state.settings.bookId ? "selected" : ""}>${escapeHtml(item.name)}</option>
  `).join("");
  const setupStatus = state.setupStatus
    ? `<div class="status ${state.setupStatus.type ? `status--${state.setupStatus.type}` : ""}">${escapeHtml(state.setupStatus.message)}</div>`
    : `<div class="status">词库文件：${escapeHtml(book.csv)}</div>`;
  const summaryCountControl = state.settings.summaryMode === "count"
    ? rangeControl("summaryCount", "每组单词数", state.settings.summaryCount, "个", 5, 120, 1)
    : `<div class="status">当前模式不会按固定数量打断播放。</div>`;

  app.innerHTML = `
    <section class="view setup-view">
      <header class="setup-topbar">
        <div class="setup-title">
          <h1>考研词汇自动刷词机</h1>
          <p>${escapeHtml(bookContextLabel(book))}</p>
        </div>
        <div class="setup-actions">
          <button class="btn btn--ghost" id="statsBtn" type="button">统计复盘</button>
          <button class="btn btn--ghost" id="archiveBtn" type="button">归档复盘</button>
          <button class="btn btn--ghost" id="logoutBtn" type="button">退出</button>
        </div>
      </header>

      <section class="setup-grid">
        <div class="settings-panel settings-panel--span2">
          <h2 class="panel-title">书库与范围</h2>
          <div class="control-list">
            <label class="field-label">
              词书
              <select class="select" id="bookSelect">${bookOptions}</select>
            </label>
            <label class="field-label">
              ${escapeHtml(unitSelectLabel)}
              <select class="select" id="unitSelect">${unitOptions}</select>
            </label>
            <div class="toggle-grid">
              ${toggle("unknownMode", "重难点词库", unknownMode)}
            </div>
            ${renderSelectedUnitStats(book, setupWords)}
            <div class="radio-group">
              ${radio("mode", "restart", "从选定 Unit 开头重新开始")}
              ${radio("mode", "resume", "恢复上一次学习进度")}
            </div>
          </div>
        </div>

        <div class="settings-panel settings-panel--span2">
          <h2 class="panel-title">节奏控制</h2>
          <div class="control-list">
            ${rateRangeControl()}
            ${rangeControl("preReadDelayInput", "读前停留", state.settings.preReadDelay, "ms", PRE_READ_DELAY_MIN, PRE_READ_DELAY_MAX, PRE_READ_DELAY_STEP)}
            ${rangeControl("zhDelayInput", "中文出现延迟", state.settings.zhDelay, "ms", ZH_DELAY_MIN, ZH_DELAY_MAX, 50)}
            ${rangeControl("retentionPauseInput", "读后停留", state.settings.retentionPause, "ms", RETENTION_PAUSE_MIN, RETENTION_PAUSE_MAX, RETENTION_PAUSE_STEP)}
            <div class="toggle-grid">
              ${toggle("manualMode", "手动模式", state.settings.manualMode)}
            </div>
            <div class="status">朗读倍速只影响中英文读音；读前停留、中文出现延迟和读后停留均为绝对时间。</div>
            <label class="field-label">
              总结节点
              <select class="select" id="summaryMode">
                <option value="count" ${state.settings.summaryMode === "count" ? "selected" : ""}>每 X 个单词</option>
                <option value="unit" ${state.settings.summaryMode === "unit" ? "selected" : ""}>当前整个 Unit 结束</option>
                <option value="manual" ${state.settings.summaryMode === "manual" ? "selected" : ""}>手动点击完成</option>
              </select>
            </label>
            ${summaryCountControl}
          </div>
        </div>

        <div class="settings-panel">
          <h2 class="panel-title">声音</h2>
          <div class="control-list">
            <div class="toggle-grid">
              ${toggle("speakEn", "英文朗读", state.settings.speakEn)}
              ${toggle("speakZh", "中文朗读", state.settings.speakZh)}
            </div>
            <div class="status">中文朗读只读简要义项，卡片仍显示完整释义。</div>
          </div>
        </div>

        <div class="settings-panel">
          <h2 class="panel-title">显示</h2>
          <div class="control-list">
            <div class="toggle-grid">
              ${toggle("highOnly", "仅显示高频标红释义", state.settings.highOnly)}
            </div>
            ${setupStatus}
          </div>
        </div>

        <div class="settings-panel settings-panel--span4">
          <h2 class="panel-title">云同步</h2>
          <div class="control-list">
            <div class="sync-grid">
              <label class="field-label">
                GitHub PAT
                <input class="input" id="tokenInput" type="password" value="${escapeHtml(state.cloud.token)}" autocomplete="off">
              </label>
              <label class="field-label">
                Gist ID
                <input class="input" id="gistInput" type="password" value="${escapeHtml(state.cloud.gistId)}" autocomplete="off">
              </label>
            </div>
          </div>
        </div>
      </section>

      <button class="btn btn--primary btn--wide" id="startBtn" type="button">开始刷词</button>
    </section>
    ${state.archiveOpen ? renderArchiveDrawer() : ""}
    ${state.statsOpen ? renderStatsDrawer() : ""}
    ${renderSyncIndicator()}
  `;

  bindSetupEvents();
  bindArchiveEvents();
  bindStatsEvents();
  primeSetupBookData(book);
}

function primeSetupBookData(book) {
  if (state.wordsByBook.has(book.id) || state.setupPrimeBookIds.has(book.id)) return;
  state.setupPrimeBookIds.add(book.id);
  ensureWords(book)
    .then(() => {
      state.setupPrimeBookIds.delete(book.id);
      if (state.view === "setup" && currentBook().id === book.id) renderSetup();
    })
    .catch(() => {
      state.setupPrimeBookIds.delete(book.id);
    });
}

function renderUnitSelectOptions(book, words) {
  const options = [];
  if (state.settings.queueMode === "unknown") {
    const allCount = unknownWordsForScope(book.id, words, { scope: "book" }).length;
    options.push(`<option value="all" ${state.settings.unknownScope === "book" ? "selected" : ""}>整本词书 · 重难点 ${allCount} 个</option>`);
  }
  Array.from({ length: book.totalUnits }, (_, index) => index + 1).forEach((unit) => {
    const label = state.settings.queueMode === "unknown"
      ? unknownUnitOptionLabel(book, unit, words)
      : unitOptionLabel(book, unit, words);
    const selected = state.settings.unknownScope !== "book" && unit === state.settings.unit;
    options.push(`<option value="${unit}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`);
  });
  return options.join("");
}

function unitOptionLabel(book, unit, words) {
  const info = unitProgressInfo(book, unit, words);
  const progress = info.total ? `${info.seen}/${info.total}` : "加载中";
  return `${unitDisplayLabel(book, unit)} · 进度 ${progress} · 完整看完 ${info.completed} 次`;
}

function unknownUnitOptionLabel(book, unit, words) {
  const count = unknownWordsForScope(book.id, words, { scope: "unit", unit }).length;
  return `${unitDisplayLabel(book, unit)} · 重难点 ${count} 个`;
}

function renderSelectedUnitStats(book, words) {
  if (state.settings.queueMode === "unknown") {
    const scope = currentUnknownScope();
    const items = unknownWordsForScope(book.id, words, scope);
    const progress = loadUnknownProgress(book.id, scope);
    const lastWordId = Number(progress.lastWordId);
    const index = items.findIndex((word) => Number(word.id) === lastWordId);
    const seen = index >= 0 ? index + 1 : 0;
    const label = scope.scope === "book" ? "整本词书重难点" : `${unitDisplayLabel(book, scope.unit)} 重难点`;
    return `<div class="status">当前 ${escapeHtml(label)}：${items.length} 个 · 恢复进度 ${seen}/${items.length || 0}</div>`;
  }
  const info = unitProgressInfo(book, state.settings.unit, words);
  const progress = info.total ? `${info.seen}/${info.total}` : "正在读取词表";
  return `<div class="status">当前 ${escapeHtml(unitDisplayLabel(book, state.settings.unit))}：进度 ${escapeHtml(progress)} · 完整看完 ${info.completed} 次</div>`;
}

function currentUnknownScope() {
  const book = currentBook();
  if (state.settings.unknownScope === "book") return { scope: "book" };
  return { scope: "unit", unit: clamp(Number(state.settings.unit) || 1, 1, book.totalUnits) };
}

function unknownWordsForScope(bookId, words = state.words, scope = currentUnknownScope()) {
  const unknownIds = new Set(loadMarks(bookId).unknown.map(Number));
  return words.filter((word) => {
    if (!unknownIds.has(Number(word.id))) return false;
    return scope.scope === "book" || Number(word.unit) === Number(scope.unit);
  });
}

function unitProgressInfo(book, unit, words = []) {
  const progress = loadProgress(book.id);
  const stats = loadUnitStats(book.id);
  const unitWords = words.filter((word) => Number(word.unit) === Number(unit));
  const total = unitWords.length;
  const completed = Number(stats.units[String(unit)]?.completed) || 0;
  let seen = 0;
  if (Number(progress.unit) === Number(unit)) {
    const lastWordId = Number(progress.lastWordId);
    const index = unitWords.findIndex((word) => Number(word.id) === lastWordId);
    seen = index >= 0 ? index + 1 : 0;
  }
  return { seen, total, completed };
}

function radio(name, value, label) {
  return `
    <label class="radio-option">
      <input type="radio" name="${name}" value="${value}" ${state.settings[name] === value ? "checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function toggle(key, label, checked) {
  return `
    <label class="toggle-option">
      <input type="checkbox" id="${key}" ${checked ? "checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function rateRangeControl() {
  const rate = playbackRate();
  return rangeControl("rateInput", "朗读倍速", rate, "x", PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX, PLAYBACK_RATE_STEP, formatRate(rate));
}

function rangeControl(id, label, value, unit, min, max, step, displayValue = value) {
  return `
    <div class="control-row">
      <div class="control-head">
        <span>${escapeHtml(label)}</span>
        <span class="control-value" id="${id}Value">${escapeHtml(displayValue)}${escapeHtml(unit)}</span>
      </div>
      <input class="range" id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${escapeHtml(label)}">
    </div>
  `;
}

function bindSetupEvents() {
  const bookSelect = document.getElementById("bookSelect");
  const unitSelect = document.getElementById("unitSelect");
  const startBtn = document.getElementById("startBtn");
  const statsBtn = document.getElementById("statsBtn");
  const archiveBtn = document.getElementById("archiveBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const tokenInput = document.getElementById("tokenInput");
  const gistInput = document.getElementById("gistInput");

  bookSelect.addEventListener("change", () => {
    rememberCurrentBookSettings();
    restoreBookSettings(bookSelect.value);
    persistSettings();
    state.setupStatus = "";
    renderSetup();
  });

  unitSelect.addEventListener("change", () => {
    if (unitSelect.value === "all") {
      state.settings.unknownScope = "book";
    } else {
      state.settings.unknownScope = "unit";
      state.settings.unit = Number(unitSelect.value);
    }
    persistSettings();
    renderSetup();
  });

  const unknownMode = document.getElementById("unknownMode");
  if (unknownMode) {
    unknownMode.addEventListener("change", () => {
      state.settings.queueMode = unknownMode.checked ? "unknown" : "main";
      if (!unknownMode.checked) state.settings.unknownScope = "unit";
      persistSettings();
      renderSetup();
    });
  }

  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.settings.mode = input.value;
      persistSettings();
    });
  });

  if (document.getElementById("summaryCount")) bindRange("summaryCount", "summaryCount", "个", Number);
  bindRange("preReadDelayInput", "preReadDelay", "ms", Number);
  bindRange("zhDelayInput", "zhDelay", "ms", Number);
  bindRange("retentionPauseInput", "retentionPause", "ms", Number);
  bindRange("rateInput", "rate", "x", Number, formatRate);
  bindCheckbox("speakEn", "speakEn");
  bindCheckbox("speakZh", "speakZh");
  bindCheckbox("manualMode", "manualMode");
  bindCheckbox("highOnly", "highOnly");

  document.getElementById("summaryMode").addEventListener("change", (event) => {
    state.settings.summaryMode = event.target.value;
    persistSettings();
    renderSetup();
  });

  tokenInput.addEventListener("input", () => {
    state.cloud.token = tokenInput.value.trim();
    persistCloud();
    queueAutoPull("config");
  });

  gistInput.addEventListener("input", () => {
    state.cloud.gistId = gistInput.value.trim();
    persistCloud();
    queueAutoPull("config");
  });

  startBtn.addEventListener("click", startStudy);
  statsBtn.addEventListener("click", openStats);
  archiveBtn.addEventListener("click", openArchive);
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(AUTH_KEY);
    renderAuth();
  });
}

function bindRange(elementId, key, unit, parser, formatter = String) {
  const input = document.getElementById(elementId);
  const output = document.getElementById(`${elementId}Value`);
  if (!input || !output) return;
  input.addEventListener("input", () => {
    const value = parser(input.value);
    state.settings[key] = value;
    output.textContent = `${formatter(value)}${unit}`;
    persistSettings();
  });
}

function bindCheckbox(elementId, key) {
  const input = document.getElementById(elementId);
  if (!input) return;
  input.addEventListener("change", () => {
    state.settings[key] = input.checked;
    persistSettings();
  });
}

async function startStudy() {
  clearTimers();
  unlockSpeech();
  setSetupStatus("正在加载词库...");
  try {
    const book = currentBook();
    state.roundReturn = null;
    state.playbackPaused = false;
    state.words = await ensureWords(book);
    const unknownMode = state.settings.queueMode === "unknown";
    const scope = currentUnknownScope();
    state.reviewMode = unknownMode
      ? { mode: "unknown-archive", label: unknownScopeLabel(book, scope), scope }
      : null;
    state.unitWords = unknownMode
      ? buildUnknownStudyWords(book.id, scope)
      : buildStudyUnitWords(book.id, state.settings.unit);
    if (!state.unitWords.length) {
      throw new Error(unknownMode
        ? `${unknownScopeLabel(book, scope)} 暂无重难点词条`
        : `${unitDisplayLabel(book, state.settings.unit)} 没有未斩词条`);
    }
    state.currentIndex = unknownMode
      ? getStartIndexFromProgress(loadUnknownProgress(book.id, scope))
      : getStartIndex(book.id);
    state.groupStats = createGroupStats();
    state.undoWordId = null;
    state.navQueue = [];
    state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.playbackPaused = false;
    state.setupStatus = "";
    await requestWakeLock();
    renderFlashcard();
  } catch (error) {
    setSetupStatus(error.message || "词库加载失败", "error");
  }
}

async function startReview(mode) {
  clearTimers();
  unlockSpeech();
  try {
    const book = currentBook();
    const stats = collectActivityStats(mode);
    if (!stats.wordIds.length) {
      state.setupStatus = { message: `${stats.label}还没有可复盘的单词。`, type: "error" };
      renderSetup();
      return;
    }
    const idSet = new Set(stats.wordIds);
    state.words = await ensureWords(book);
    state.unitWords = state.words.filter((word) => idSet.has(word.id));
    state.currentIndex = 0;
    state.groupStats = createGroupStats();
    state.undoWordId = null;
    state.navQueue = [];
    state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.reviewMode = { mode, label: `${stats.label}复盘`, wordIds: stats.wordIds };
    state.roundReturn = null;
    state.playbackPaused = false;
    state.statsOpen = false;
    state.archiveOpen = false;
    await requestWakeLock();
    renderFlashcard();
  } catch (error) {
    state.setupStatus = { message: error.message || "复盘启动失败", type: "error" };
    renderSetup();
  }
}

function buildStudyUnitWords(bookId, unit) {
  const knownIds = new Set(loadMarks(bookId).known.map(Number));
  return state.words.filter((word) => word.unit === unit && !knownIds.has(Number(word.id)));
}

function buildUnknownStudyWords(bookId, scope = currentUnknownScope()) {
  return unknownWordsForScope(bookId, state.words, scope);
}

function unknownScopeLabel(book, scope = currentUnknownScope()) {
  return scope.scope === "book" ? `${book.name} · 整本重难点词库` : `${unitDisplayLabel(book, scope.unit)} · 重难点词库`;
}

function getStartIndex(bookId) {
  if (state.settings.mode !== "resume") return 0;
  return getStartIndexFromProgress(loadProgress(bookId));
}

function getStartIndexFromProgress(progress) {
  if (state.settings.mode !== "resume") return 0;
  const lastWordId = Number(progress.lastWordId);
  if (!Number.isFinite(lastWordId)) return 0;
  const index = state.unitWords.findIndex((word) => word.id === lastWordId);
  if (index >= 0) return index;
  const nextIndex = state.unitWords.findIndex((word) => Number(word.id) > lastWordId);
  return nextIndex >= 0 ? nextIndex : state.unitWords.length;
}

function recordUnitCompletion(bookId, unit) {
  const stats = loadUnitStats(bookId);
  const key = String(unit);
  const item = stats.units[key] || { completed: 0 };
  const updatedAt = new Date().toISOString();
  const completed = Math.max(0, Number(item.completed) || 0) + 1;
  stats.units[key] = { completed, updatedAt };
  saveUnitStats(bookId, stats);
  appendPendingOp({ type: "unitStats.completed.set", bookId, unit: Number(unit), completed, createdAt: updatedAt });
}

function renderFlashcard({ touchProgress = true } = {}) {
  state.view = "flash";
  clearTimers();
  const book = currentBook();
  const word = state.unitWords[state.currentIndex];
  const next = state.unitWords[state.currentIndex + 1];
  if (!word) {
    renderBreak({ unitEnd: true, reviewEnd: Boolean(state.reviewMode) });
    return;
  }
  if (state.reviewMode?.mode === "unknown-archive") {
    saveUnknownProgress(book.id, state.reviewMode.scope || currentUnknownScope(), { lastWordId: word.id, unit: word.unit, updatedAt: new Date().toISOString() }, { touch: touchProgress });
  } else if (!state.reviewMode) {
    saveProgress(book.id, { lastWordId: word.id, unit: word.unit, updatedAt: new Date().toISOString() }, { touch: touchProgress });
  }
  const marks = loadMarks(book.id);
  const markedKind = marks.known.includes(word.id) ? "known" : marks.unknown.includes(word.id) ? "unknown" : "";
  const undoLabel = markedKind ? undoLabelForMark(markedKind) : "";
  const cardEnterDirection = state.cardEnterDirection;
  const resumeFeedback = state.resumeFeedback;
  const markFeedback = state.markFeedback;
  const modeSuffix = state.reviewMode?.mode === "unknown-archive" ? " · 重难点词库" : state.reviewMode ? " · 复盘" : "";
  state.cardEnterDirection = "";
  state.resumeFeedback = false;
  state.markFeedback = "";

  app.innerHTML = `
    <section class="view flash-view">
      <aside class="side-panel">
        <button class="btn btn--ghost" id="backSetupBtn" type="button">返回设置页</button>
        <button class="btn btn--ghost" id="statsBtn" type="button">统计复盘</button>
        <button class="btn btn--ghost" id="archiveBtn" type="button">归档复盘</button>
        <button class="btn btn--ghost" id="manualModeBtn" type="button">${state.settings.manualMode ? "手动模式" : "自动播放"}</button>
        <button class="btn btn--primary" id="finishBtn" type="button">✓ 完成</button>
        <div class="progress-block">
          <div class="progress-title">${escapeHtml(state.reviewMode?.label || bookContextLabel(book, word.unit))}</div>
          <div class="progress-main">${escapeHtml(unitDisplayLabel(book, word.unit))} [${state.currentIndex + 1}/${state.unitWords.length}]</div>
          <div class="progress-sub">词频 ${word.freq} · ID ${word.id}${escapeHtml(modeSuffix)}</div>
          <div class="live-counter" aria-label="本轮实时计数">
            <span>扫过 <strong>${state.groupStats.seen}</strong></span>
            <span>已斩 <strong>${state.groupStats.known}</strong></span>
            <span>重难点 <strong>${state.groupStats.unknown}</strong></span>
          </div>
        </div>
      </aside>

      <section class="stage">
        <div class="card-stack" id="cardStack">
          ${next ? renderWordCard(next, true) : ""}
          ${renderWordCard(word, false, undoLabel, cardEnterDirection, resumeFeedback, markFeedback)}
        </div>
      </section>

      <aside class="side-panel gesture-panel">
        <div class="gesture-list">
          ${gesture("↑", "斩")}
          ${gesture("↓", "生词")}
          ${gesture("←", "上一个")}
          ${gesture("→", "下一个")}
        </div>
      </aside>
    </section>
    ${state.archiveOpen ? renderArchiveDrawer() : ""}
    ${state.statsOpen ? renderStatsDrawer() : ""}
    ${renderSyncIndicator()}
  `;

  document.getElementById("backSetupBtn").addEventListener("click", () => {
    commitCurrentCardActivity();
    state.reviewMode = null;
    renderSetup();
    autoPushToGist();
  });
  document.getElementById("statsBtn").addEventListener("click", openStats);
  document.getElementById("archiveBtn").addEventListener("click", openArchive);
  document.getElementById("manualModeBtn").addEventListener("click", toggleManualModeFromFlash);
  document.getElementById("finishBtn").addEventListener("click", finishCurrentGroup);
  const undoBtn = document.getElementById("undoMarkBtn");
  if (undoBtn) undoBtn.addEventListener("click", () => undoMark(word.id));
  bindGesturePanelControls();
  bindCardGesture();
  bindArchiveEvents();
  bindStatsEvents();
  if (state.currentWordId !== word.id) {
    state.currentWordId = word.id;
    state.currentWordRecorded = false;
  }
  state.cardStartedAt = Date.now();
  requestAnimationFrame(fitActiveWord);
  scheduleWordTimers();
  processNavigationQueueSoon();
}

function renderWordCard(word, isNext = false, undoLabel = "", enterDirection = "", resumeFeedback = false, markFeedback = "") {
  const definition = formatDefinition(word);
  const definitionId = isNext ? "" : ' id="definition"';
  const speechStatusId = isNext ? "" : ' id="speechStatus"';
  const wordEnId = isNext ? "" : ' id="wordEn"';
  const enClass = !isNext && state.speechPhase === "en" ? " is-speaking" : "";
  const zhHtml = isNext ? "" : renderDefinitionHtml(word);
  const freqLabel = word.freq ? `${word.freq} 次` : "0 次";
  const alpha = Number(freqAlpha(word.freq));
  const enterClass = !isNext && ["from-left", "from-right"].includes(enterDirection) ? ` word-card--enter-${enterDirection}` : "";
  const resumeClass = !isNext && resumeFeedback ? " word-card--resume-feedback" : "";
  const markClass = !isNext && markFeedback ? " word-card--mark-feedback" : "";
  const zhHidden = isNext || !state.showZh ? " is-hidden" : "";
  return `
    <article class="word-card ${isNext ? "word-card--next" : ""}${enterClass}${resumeClass}${markClass}" id="${isNext ? "nextCard" : "activeCard"}" style="--freq-alpha: ${alpha.toFixed(3)}; --freq-alpha-soft: ${(alpha * 0.35).toFixed(3)}">
      ${isNext ? "" : renderCardSwipeControls()}
      ${resumeFeedback ? '<div class="resume-feedback" aria-live="polite">继续播放</div>' : ""}
      ${markFeedback === "unknown" ? '<div class="mark-feedback" aria-live="polite">已标记重难点</div>' : ""}
      <div class="freq-watermark">${escapeHtml(freqLabel)}</div>
      <div class="word-card__meta">
        <span>${escapeHtml(unitDisplayLabel(currentBook(), word.unit))}</span>
        <span${speechStatusId}>${escapeHtml(freqLabel)}</span>
      </div>
      <div class="word-card__en-shell"><div class="word-card__en${enClass}"${wordEnId}>${escapeHtml(word.en)}</div></div>
      <div class="word-card__zh${zhHidden}"${definitionId}>${zhHtml}</div>
      ${undoLabel ? `<div class="word-card__actions"><button class="undo-btn" id="undoMarkBtn" type="button">${escapeHtml(undoLabel)}</button></div>` : ""}
    </article>
  `;
}

function renderCardSwipeControls() {
  // 交互契约：左侧点击=上一个，右侧点击=下一个。不要把点击热区和滑动方向直接等同。
  return `
    <div class="card-swipe-edges" aria-hidden="true">
      <span class="card-swipe-edge card-swipe-edge--left"></span>
      <span class="card-swipe-edge card-swipe-edge--right"></span>
      <span class="card-swipe-edge card-swipe-edge--up"></span>
      <span class="card-swipe-edge card-swipe-edge--down"></span>
    </div>
    <button class="card-tap-zone card-tap-zone--left" data-card-tap="tap-left" type="button" aria-label="上一个"></button>
    <button class="card-tap-zone card-tap-zone--right" data-card-tap="tap-right" type="button" aria-label="下一个"></button>
    <button class="card-tap-zone card-tap-zone--up" data-card-tap="up" type="button" aria-label="标记为已斩"></button>
    <button class="card-tap-zone card-tap-zone--down" data-card-tap="down" type="button" aria-label="标记为重难点"></button>
  `;
}

function gesture(symbol, label) {
  const actions = { "↑": "up", "↓": "down", "←": "previous", "→": "next" };
  return `
    <button class="gesture-item" data-gesture-action="${actions[symbol] || ""}" type="button" aria-label="${escapeHtml(label)}">
      <span class="gesture-symbol">${escapeHtml(symbol)}</span>
      <span class="gesture-text">${escapeHtml(label)}</span>
    </button>
  `;
}

function undoLabelForMark(kind) {
  return kind === "known" ? "撤销上滑" : "撤销下滑";
}

async function scheduleWordTimers() {
  const word = state.unitWords[state.currentIndex];
  if (!word || state.archiveOpen || state.statsOpen || state.playbackPaused) return;
  const token = ++state.playbackToken;
  const spokenDefinition = formatSpokenDefinition(word);
  const speechAvailable = "speechSynthesis" in window;
  const hasEnSpeech = Boolean(state.settings.speakEn && speechAvailable);
  const hasZhSpeech = Boolean(state.settings.speakZh && spokenDefinition && speechAvailable);

  const revealTask = revealZhAfterDelay(token);
  await sleepFor(preReadDelayMs());
  if (!isPlaybackToken(token)) return;

  if (hasEnSpeech) {
    const spoken = await speakWithHighlight(word.en, "en-US", "en", token);
    if (!isPlaybackToken(token)) return;
    if (!spoken) await sleepFor(quietBudgetMs(word.en, "en-US", 420));
  } else {
    await sleepFor(quietBudgetMs(word.en, "en-US", 420));
  }

  if (!isPlaybackToken(token)) return;
  await revealTask;
  if (!isPlaybackToken(token)) return;

  if (spokenDefinition) {
    if (hasZhSpeech) {
      const spoken = await speakWithHighlight(spokenDefinition, "zh-CN", "zh", token, { followBoundaries: false });
      if (!isPlaybackToken(token)) return;
      if (!spoken) await sleepFor(quietBudgetMs(spokenDefinition, "zh-CN", 720));
    } else {
      await sleepFor(quietBudgetMs(spokenDefinition, "zh-CN", 720));
    }
  } else {
    await sleepFor(phaseGapMs(320));
  }

  if (!isPlaybackToken(token)) return;
  await sleepFor(postZhRetentionPauseMs());
  if (!isPlaybackToken(token) || state.settings.manualMode) return;
  advanceWord("auto");
}

async function revealZhAfterDelay(token) {
  // zhDelay 为 0 时必须立即显示中文，且不等待英文朗读完成。
  const delay = zhRevealDelayMs();
  if (delay > 0) await sleepFor(delay);
  if (!isPlaybackToken(token)) return false;
  state.showZh = true;
  const definitionNode = document.getElementById("definition");
  if (definitionNode) definitionNode.classList.remove("is-hidden");
  return true;
}

function pausePlaybackForBackground() {
  if (state.view !== "flash" || state.playbackPaused) return;
  commitCurrentCardActivity();
  clearTimers();
  releaseWakeLock();
  state.playbackPaused = true;
  renderFlashcard();
}

function pausePlaybackFromCard() {
  if (state.view !== "flash" || state.playbackPaused) return;
  commitCurrentCardActivity();
  clearTimers();
  releaseWakeLock();
  state.playbackPaused = true;
  renderFlashcard({ touchProgress: false });
}

async function resumePlayback() {
  if (state.view !== "flash") return;
  state.playbackPaused = false;
  state.resumeFeedback = true;
  await requestWakeLock();
  renderFlashcard();
}

function toggleManualModeFromFlash() {
  state.settings.manualMode = !state.settings.manualMode;
  persistSettings();
  renderFlashcard({ touchProgress: false });
}

function fitActiveWord() {
  const wordNode = document.getElementById("wordEn");
  const shell = wordNode?.closest(".word-card__en-shell");
  if (!wordNode || !shell) return;
  wordNode.style.fontSize = "";
  const baseSize = Number.parseFloat(getComputedStyle(wordNode).fontSize) || 72;
  const available = shell.clientWidth;
  if (!available) return;
  const scale = Math.min(1, available / Math.max(1, wordNode.scrollWidth));
  wordNode.style.fontSize = `${Math.max(26, Math.floor(baseSize * scale))}px`;
}

function isPlaybackToken(token) {
  return token === state.playbackToken;
}

function sleepFor(delay) {
  return new Promise((resolve) => {
    addTimer(resolve, Math.max(0, delay), resolve);
  });
}

function estimateSpeechMs(text, lang) {
  const normalized = String(text || "").trim();
  if (!normalized) return 0;
  if (lang.startsWith("zh")) {
    const chars = normalized.replace(/\s+/g, "").length;
    return Math.max(650, (chars / 5.2) * 1000);
  }
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const chars = normalized.replace(/\s+/g, "").length;
  return Math.max(680, (words / 2.45) * 1000, (chars / 11) * 1000);
}

function playbackRate() {
  return clamp(Number(state.settings.rate) || DEFAULT_SETTINGS.rate, PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX);
}

function speechRate() {
  return clamp(playbackRate(), SPEECH_RATE_MIN, SPEECH_RATE_MAX);
}

function formatRate(rate) {
  return Number(rate).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function zhRevealDelayMs() {
  return clampFinite(state.settings.zhDelay, DEFAULT_SETTINGS.zhDelay, ZH_DELAY_MIN, ZH_DELAY_MAX);
}

function preReadDelayMs() {
  return clampFinite(state.settings.preReadDelay, DEFAULT_SETTINGS.preReadDelay, PRE_READ_DELAY_MIN, PRE_READ_DELAY_MAX);
}

function retentionPauseSettingMs() {
  return clampFinite(state.settings.retentionPause, DEFAULT_SETTINGS.retentionPause, RETENTION_PAUSE_MIN, RETENTION_PAUSE_MAX);
}

function speechBudgetMs(text, lang, minMs = 520) {
  return Math.max(Math.max(120, minMs / speechRate()), estimateSpeechMs(text, lang) / speechRate());
}

function quietBudgetMs(text, lang, minMs = 420) {
  return Math.max(minMs, estimateSpeechMs(text, lang) * 0.55);
}

function phaseGapMs(baseMs) {
  return Math.max(35, baseMs);
}

function postEnRetentionPauseMs() {
  return retentionPauseSettingMs();
}

function postZhRetentionPauseMs() {
  return retentionPauseSettingMs();
}

function scaledMinimumMs(baseMs, floorMs = 40) {
  return Math.max(floorMs, baseMs);
}

function speakWithHighlight(text, lang, phase, token, { followBoundaries = true } = {}) {
  // Web Speech 在不同浏览器上开始时间不稳定；朗读开始后不要再设置硬超时，否则会截断读音。
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text || !isPlaybackToken(token)) {
      resolve(false);
      return;
    }
    waitForSpeechVoices(token).then(() => {
      if (!isPlaybackToken(token)) {
        resolve(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voice = selectSpeechVoice(lang);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || lang;
      }
      utterance.rate = speechRate();
      const highlightBudget = speechBudgetMs(text, lang, phase === "zh" ? 620 : 560);
      let settled = false;
      let started = false;
      const queuedAt = Date.now();
      const settle = (completed = true) => {
        if (settled) return;
        settled = true;
        if (isPlaybackToken(token)) clearSpeechPhase();
        resolve(completed);
      };
      const settleCanceled = () => {
        if (settled) return;
        settled = true;
        resolve(false);
      };
      const pollDone = () => {
        if (settled) return;
        if (!isPlaybackToken(token)) {
          settleCanceled();
          return;
        }
        if (!started && !window.speechSynthesis.speaking && !window.speechSynthesis.pending && Date.now() - queuedAt < SPEECH_START_TIMEOUT_MS) {
          addTimer(pollDone, SPEECH_POLL_MS, settleCanceled);
          return;
        }
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          settle(started);
          return;
        }
        addTimer(pollDone, SPEECH_POLL_MS, settleCanceled);
      };
      utterance.onstart = () => {
        if (settled || !isPlaybackToken(token)) return;
        started = true;
        setSpeechPhase(phase, utterance.rate);
        if (phase === "zh") simulateZhHighlight(text, highlightBudget, token);
      };
      utterance.onboundary = (event) => {
        if (settled || !followBoundaries || !isPlaybackToken(token) || phase !== "zh") return;
        highlightZhByCharIndex(event.charIndex || 0);
      };
      utterance.onend = () => settle(true);
      utterance.onerror = () => settle(false);
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        settle(false);
        return;
      }
      addTimer(() => {
        if (settled || started) return;
        window.speechSynthesis.cancel();
        settle(false);
      }, SPEECH_START_TIMEOUT_MS, settleCanceled);
      addTimer(pollDone, SPEECH_POLL_MS, settleCanceled);
    });
  });
}

function waitForSpeechVoices(token, timeoutMs = 500) {
  if (!("speechSynthesis" in window) || window.speechSynthesis.getVoices().length) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (typeof window.speechSynthesis.removeEventListener === "function") {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      }
      resolve();
    };
    const handleVoicesChanged = () => {
      if (!isPlaybackToken(token) || window.speechSynthesis.getVoices().length) finish();
    };
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    }
    addTimer(finish, timeoutMs, finish);
  });
}

function selectSpeechVoice(lang) {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const lowerLang = lang.toLowerCase();
  const family = lowerLang.slice(0, 2);
  const candidates = voices.filter((voice) => String(voice.lang || "").toLowerCase().startsWith(family));
  const preferred = lowerLang.startsWith("en")
    ? [/google us english/i, /microsoft (aria|jenny|guy|david|mark|zira).*english/i, /samantha/i, /alex/i, /daniel/i, /karen/i, /en-us/i, /english.*united states/i]
    : [/xiaoxiao/i, /tingting/i, /mei-jia/i, /google.*(普通话|mandarin|chinese)/i, /zh-cn/i, /chinese/i];
  const text = (voice) => `${voice.name || ""} ${voice.lang || ""}`;
  return preferred.map((pattern) => candidates.find((voice) => pattern.test(text(voice)))).find(Boolean) ||
    candidates.find((voice) => String(voice.lang || "").toLowerCase() === lowerLang) ||
    candidates[0] ||
    null;
}

function cancelSpeechOnly() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  clearSpeechPhase();
}

function setSpeechPhase(phase, rate) {
  state.speechPhase = phase;
  state.activeZhIndex = -1;
  const en = document.getElementById("wordEn");
  const status = document.getElementById("speechStatus");
  if (en) en.classList.toggle("is-speaking", phase === "en");
  if (status) status.textContent = `${phase === "en" ? "朗读英文" : "朗读义项"} · ${formatRate(rate)}x`;
  if (phase === "zh") highlightZhByCharIndex(0);
}

function clearSpeechPhase() {
  state.speechPhase = "";
  state.activeZhIndex = -1;
  const en = document.getElementById("wordEn");
  const status = document.getElementById("speechStatus");
  if (en) en.classList.remove("is-speaking");
  if (status) {
    const word = state.unitWords[state.currentIndex];
    status.textContent = word?.freq ? `${word.freq} 次` : "0 次";
  }
  document.querySelectorAll(".speech-token.is-speaking").forEach((node) => node.classList.remove("is-speaking"));
}

function highlightZhByCharIndex(charIndex) {
  const tokens = Array.from(document.querySelectorAll(".speech-token"));
  if (!tokens.length) return;
  const active = tokens.find((node) => {
    const start = Number(node.dataset.start) || 0;
    const end = Number(node.dataset.end) || start;
    return charIndex >= start && charIndex <= end;
  }) || tokens[tokens.length - 1];
  tokens.forEach((node) => node.classList.toggle("is-speaking", node === active));
}

function simulateZhHighlight(text, budgetMs, token) {
  const nodes = Array.from(document.querySelectorAll(".speech-token"));
  if (!nodes.length) return;
  const step = Math.max(scaledMinimumMs(120, 35), budgetMs / nodes.length);
  nodes.forEach((_, index) => {
    addTimer(() => {
      if (!isPlaybackToken(token) || state.speechPhase !== "zh") return;
      state.activeZhIndex = index;
      nodes.forEach((node) => {
        node.classList.toggle("is-speaking", Number(node.dataset.tokenIndex) === index);
      });
    }, index * step);
  });
}

function unlockSpeech() {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}

function bindGesturePanelControls() {
  document.querySelectorAll("[data-gesture-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const direction = button.dataset.gestureAction;
      if (!direction) return;
      if (state.playbackPaused) {
        state.playbackPaused = false;
        requestWakeLock();
      }
      triggerCardDirection(direction);
    });
  });
}

function bindCardGesture() {
  const stack = document.getElementById("cardStack");
  const card = document.getElementById("activeCard");
  if (!stack || !card) return;

  card.querySelectorAll("[data-card-tap]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.suppressNextCardClickPause) {
        state.suppressNextCardClickPause = false;
        return;
      }
      if (state.playbackPaused) {
        // 暂停态点击当前卡片只恢复播放，不触发左右切词或上下标记。
        resumePlayback();
        return;
      }
      triggerCardDirection(button.dataset.cardTap, card);
    });
  });

  card.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    if (state.suppressNextCardClickPause) {
      state.suppressNextCardClickPause = false;
      return;
    }
    if (state.playbackPaused) {
      resumePlayback();
      return;
    }
    pausePlaybackFromCard();
  });

  stack.addEventListener("pointerdown", (event) => {
    if (state.playbackPaused) return;
    const interactiveTarget = event.target.closest("button, a, input, select, textarea");
    // 点击热区本身也允许作为滑动起点，否则从左右边缘起手的滑动会失效。
    if (interactiveTarget && !interactiveTarget.matches("[data-card-tap]")) return;
    clearTimers();
    stack.setPointerCapture(event.pointerId);
    state.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      dx: 0,
      dy: 0
    };
    card.classList.remove("is-animated");
  });

  stack.addEventListener("pointermove", (event) => {
    if (!state.pointer || state.pointer.id !== event.pointerId) return;
    state.pointer.dx = event.clientX - state.pointer.startX;
    state.pointer.dy = event.clientY - state.pointer.startY;
    const rotate = state.pointer.dx / 28;
    updateCardSwipeFeedback(card, state.pointer.dx, state.pointer.dy);
    card.style.transform = `translate3d(${state.pointer.dx}px, ${state.pointer.dy}px, 0) rotate(${rotate}deg)`;
  });

  stack.addEventListener("pointerup", (event) => finishPointer(event, card));
  stack.addEventListener("pointercancel", (event) => finishPointer(event, card, true));
}

function finishPointer(event, card, cancelled = false) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const { dx, dy, startTime } = state.pointer;
  state.pointer = null;
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  const threshold = clamp(minSide * 0.07, 34, 58);
  const elapsed = Math.max(1, performance.now() - startTime);
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  const velocity = distance / elapsed;
  const flick = distance > 24 && velocity > 0.42;
  const didSwipe = !cancelled && (distance >= threshold || flick);
  state.suppressNextCardClickPause = cancelled || didSwipe || distance > 6;

  if (!didSwipe) {
    snapBack(card);
    return;
  }

  triggerCardDirection(swipeDirectionFromDelta(dx, dy), card, { dx, dy });
}

function swipeDirectionFromDelta(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

function updateCardSwipeFeedback(card, dx, dy) {
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance < 14) {
    clearCardSwipeFeedback(card);
    return;
  }
  setCardSwipeFeedback(card, swipeDirectionFromDelta(dx, dy));
}

function setCardSwipeFeedback(card, direction) {
  clearCardSwipeFeedback(card);
  if (["left", "right", "up", "down"].includes(direction)) {
    card.classList.add(`is-swipe-${direction}`);
  }
}

function clearCardSwipeFeedback(card) {
  if (!card) return;
  card.classList.remove("is-swipe-left", "is-swipe-right", "is-swipe-up", "is-swipe-down");
}

function triggerCardDirection(direction, card = document.getElementById("activeCard"), offset = {}) {
  if (!card || state.playbackPaused) return;
  const action = cardActionFromDirection(direction);
  if (!action) {
    snapBack(card);
    return;
  }
  if (state.transitioning) {
    if (action === "next" || action === "previous") queueNavigationAction(action);
    return;
  }
  if (action === "unknown") {
    markUnknownInPlace(card);
    return;
  }
  clearTimers();
  card.classList.remove("is-animated");
  // 方向矩阵不要改反：
  // left swipe -> next，旧卡向左飞出；right swipe -> previous，旧卡向右飞出。
  // tap-left -> previous，旧卡向右飞出；tap-right -> next，旧卡向左飞出。
  const feedbackDirection = feedbackDirectionForAction(direction, action);
  setCardSwipeFeedback(card, feedbackDirection);
  const dx = Number(offset.dx) || 0;
  const dy = Number(offset.dy) || 0;
  if (action === "next") {
    const x = -window.innerWidth;
    state.transitioning = true;
    animateOut(card, x, dy, () => {
      state.transitioning = false;
      advanceWord("manual");
    });
  } else if (action === "previous") {
    if (state.currentIndex <= 0) {
      snapBack(card);
    } else {
      const x = window.innerWidth;
      state.transitioning = true;
      animateOut(card, x, dy, () => {
        state.transitioning = false;
        goPrevious();
      });
    }
  } else if (action === "known") {
    markCurrent("known");
    state.transitioning = true;
    animateOut(card, dx, -window.innerHeight, () => {
      state.transitioning = false;
      advanceWord("known");
    });
  } else {
    snapBack(card);
  }
}

function cardActionFromDirection(direction) {
  if (direction === "left" || direction === "tap-right" || direction === "next") return "next";
  if (direction === "right" || direction === "tap-left" || direction === "previous") return "previous";
  if (direction === "up") return "known";
  if (direction === "down") return "unknown";
  return "";
}

function feedbackDirectionForAction(direction, action) {
  if (direction === "tap-left" || direction === "previous") return "right";
  if (direction === "tap-right" || direction === "next") return "left";
  if (action === "known") return "up";
  if (action === "unknown") return "down";
  return direction;
}

function queueNavigationAction(action) {
  if (action !== "next" && action !== "previous") return;
  state.navQueue.push(action);
  if (state.navQueue.length > 30) state.navQueue = state.navQueue.slice(-30);
}

function processNavigationQueueSoon() {
  if (!state.navQueue.length || state.transitioning || state.view !== "flash") return;
  addTimer(() => {
    if (!state.navQueue.length || state.transitioning || state.view !== "flash") return;
    const action = state.navQueue.shift();
    triggerCardDirection(action);
  }, 0);
}

function markUnknownInPlace(card) {
  const book = currentBook();
  const word = state.unitWords[state.currentIndex];
  if (!word) return;
  const shouldRestartTimers = state.timers.length === 0 && !state.playbackPaused;
  const wasUnknown = loadMarks(book.id).unknown.includes(word.id);
  markCurrent("unknown");
  if (!wasUnknown) {
    state.groupStats.unknown += 1;
    state.groupStats.unknownIds = Array.from(new Set([...(state.groupStats.unknownIds || []), word.id]));
    recordStudyActivity({ wordId: word.id, seconds: 0, result: "unknown", counted: false });
    updateLiveUnknownCount();
  }
  state.undoWordId = word.id;
  showUnknownMarkFeedback(card, word.id);
  if (shouldRestartTimers) scheduleWordTimers();
}

function updateLiveUnknownCount() {
  const counters = document.querySelectorAll(".live-counter strong");
  if (counters[2]) counters[2].textContent = String(state.groupStats.unknown);
}

function showUnknownMarkFeedback(card, wordId) {
  if (!card) return;
  card.classList.add("is-animated", "is-swipe-down", "word-card--mark-feedback");
  card.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
  ensureUndoButton(card, wordId, undoLabelForMark("unknown"));
  const oldFeedback = card.querySelector(".mark-feedback");
  if (oldFeedback) oldFeedback.remove();
  const feedback = document.createElement("div");
  feedback.className = "mark-feedback";
  feedback.setAttribute("aria-live", "polite");
  feedback.textContent = "已标记重难点";
  card.appendChild(feedback);
  addTimer(() => {
    clearCardSwipeFeedback(card);
    card.classList.remove("is-animated", "word-card--mark-feedback");
    feedback.remove();
  }, 820);
}

function ensureUndoButton(card, wordId, label) {
  let actions = card.querySelector(".word-card__actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "word-card__actions";
    card.appendChild(actions);
  }
  let button = actions.querySelector("#undoMarkBtn");
  if (!button) {
    button = document.createElement("button");
    button.className = "undo-btn";
    button.id = "undoMarkBtn";
    button.type = "button";
    actions.appendChild(button);
  }
  button.textContent = label;
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    undoMark(wordId);
  };
}

function snapBack(card) {
  card.classList.add("is-animated");
  card.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
  addTimer(() => {
    clearCardSwipeFeedback(card);
    card.classList.remove("is-animated");
    scheduleWordTimers();
  }, 180);
}

function animateOut(card, x, y, done) {
  card.classList.add("is-animated");
  card.style.opacity = "0";
  card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${x / 34}deg)`;
  addTimer(done, 210);
}

function markCurrent(kind) {
  const book = currentBook();
  const word = state.unitWords[state.currentIndex];
  if (!word) return;
  const marks = loadMarks(book.id);
  marks.known = marks.known.filter((id) => id !== word.id);
  marks.unknown = marks.unknown.filter((id) => id !== word.id);
  marks[kind].push(word.id);
  saveMarks(book.id, marks);
  appendPendingOp({ type: "word.mark.set", bookId: book.id, wordId: word.id, value: kind });
}

function undoMark(wordId) {
  const book = currentBook();
  const marks = loadMarks(book.id);
  marks.known = marks.known.filter((id) => id !== wordId);
  marks.unknown = marks.unknown.filter((id) => id !== wordId);
  saveMarks(book.id, marks);
  appendPendingOp({ type: "word.mark.set", bookId: book.id, wordId, value: null });
  state.undoWordId = null;
  renderFlashcard();
}

function advanceWord(reason) {
  clearTimers();
  const wasRecorded = state.currentWordRecorded;
  const result = reason === "known" || reason === "unknown" ? reason : "";
  commitCurrentCardActivity({ counted: true, result });
  if (!wasRecorded) {
    state.groupStats.seen += 1;
    if (reason === "known") state.groupStats.known += 1;
    if (reason === "unknown") {
      state.groupStats.unknown += 1;
      const currentWord = state.unitWords[state.currentIndex];
      if (currentWord) {
        state.groupStats.unknownIds = Array.from(new Set([...(state.groupStats.unknownIds || []), currentWord.id]));
      }
    }
  }
  state.undoWordId = null;
  state.currentIndex += 1;
  state.showZh = false;
  // 这里是“新卡片入场方向”：手动下一个从右侧轻进入，和旧卡飞出方向不是同一个概念。
  if (reason === "manual") state.cardEnterDirection = "from-right";

  if (state.currentIndex >= state.unitWords.length) {
    state.cardEnterDirection = "";
    renderBreak({ unitEnd: true, reviewEnd: Boolean(state.reviewMode) });
    return;
  }

  if (state.settings.summaryMode === "count" && state.groupStats.seen >= state.settings.summaryCount) {
    state.cardEnterDirection = "";
    renderBreak({ unitEnd: false });
    return;
  }

  renderFlashcard();
}

function finishCurrentGroup() {
  clearTimers();
  const wasRecorded = state.currentWordRecorded;
  commitCurrentCardActivity({ counted: true });
  if (!wasRecorded) state.groupStats.seen += 1;
  if (state.currentIndex < state.unitWords.length) state.currentIndex += 1;
  state.showZh = false;
  renderBreak({
    manual: true,
    unitEnd: state.currentIndex >= state.unitWords.length,
    reviewEnd: Boolean(state.reviewMode)
  });
}

function goPrevious() {
  clearTimers();
  commitCurrentCardActivity();
  if (state.currentIndex <= 0) {
    renderFlashcard();
    return;
  }
  state.currentIndex -= 1;
  const word = state.unitWords[state.currentIndex];
  const marks = loadMarks(currentBook().id);
  state.undoWordId = marks.known.includes(word.id) || marks.unknown.includes(word.id) ? word.id : null;
  state.showZh = true;
  // 上一个词的新卡片从左侧轻进入；旧卡飞出方向在 triggerCardDirection() 中控制。
  state.cardEnterDirection = "from-left";
  renderFlashcard();
}

function renderBreak(info) {
  const enteringBreak = state.view !== "break";
  state.view = "break";
  state.breakInfo = info;
  clearTimers();
  releaseWakeLock();
  state.navQueue = [];
  state.transitioning = false;
  state.currentWordId = null;
  const book = currentBook();
  if (enteringBreak && info.unitEnd && !info.reviewEnd && !info.manual && !state.reviewMode) {
    recordUnitCompletion(book.id, state.settings.unit);
  }
  const roundUnknownIds = getRoundUnknownIds();
  const title = info.reviewEnd
    ? `${state.reviewMode?.label || "复盘"}总结`
    : info.manual
      ? "手动完成总结"
      : info.unitEnd
        ? `${unitDisplayLabel(book, state.settings.unit)} 阶段总结`
        : "间歇总结";
  app.innerHTML = `
    <section class="view break-view">
      <div class="break-panel">
        <h1>${escapeHtml(title)}</h1>
        <div class="stats-grid">
          <div class="stat-box"><span>扫过</span><strong>${state.groupStats.seen}</strong></div>
          <div class="stat-box"><span>已斩</span><strong>${state.groupStats.known}</strong></div>
          <div class="stat-box"><span>重难点</span><strong>${state.groupStats.unknown}</strong></div>
        </div>
        <button class="btn btn--primary btn--wide" id="continueBtn" type="button">继续下一组</button>
        ${roundUnknownIds.length && !info.reviewEnd ? `<button class="btn btn--ghost btn--wide" id="roundUnknownReviewBtn" type="button">仅复习本轮重难点 (${roundUnknownIds.length})</button>` : ""}
      </div>
    </section>
    ${renderSyncIndicator()}
  `;
  document.getElementById("continueBtn").addEventListener("click", continueAfterBreak);
  const roundReviewBtn = document.getElementById("roundUnknownReviewBtn");
  if (roundReviewBtn) roundReviewBtn.addEventListener("click", startRoundUnknownReview);
  if (enteringBreak) autoPushToGist();
}

async function continueAfterBreak() {
  const book = currentBook();
  if (state.breakInfo?.reviewEnd && state.reviewMode?.mode === "round-unknown" && state.roundReturn) {
    const ret = state.roundReturn;
    state.reviewMode = null;
    state.roundReturn = null;
    state.unitWords = ret.unitWords;
    state.currentIndex = ret.currentIndex;
    state.groupStats = createGroupStats();
    state.navQueue = [];
    state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    if (state.currentIndex >= state.unitWords.length) {
      state.groupStats = ret.groupStats || createGroupStats();
      renderBreak(ret.breakInfo || { unitEnd: true });
      return;
    }
    await requestWakeLock();
    renderFlashcard();
    return;
  }
  if (state.breakInfo?.reviewEnd) {
    const label = state.reviewMode?.label || "复盘";
    state.reviewMode = null;
    state.groupStats = createGroupStats();
    setSetupStatus(`${label}已完成。`, "ok");
    renderSetup();
    return;
  }
  state.groupStats = createGroupStats();
  state.navQueue = [];
  state.transitioning = false;
  state.markFeedback = "";
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  if (state.breakInfo?.unitEnd) {
    if (state.settings.unit < book.totalUnits) {
      state.settings.unit += 1;
      persistSettings();
      state.words = await ensureWords(book);
      state.unitWords = buildStudyUnitWords(book.id, state.settings.unit);
      state.currentIndex = 0;
      if (!state.unitWords.length) {
        setSetupStatus(`${unitDisplayLabel(book, state.settings.unit)} 的词条已全部已斩，请选择其他 Unit。`, "ok");
        renderSetup();
        return;
      }
    } else {
      setSetupStatus("全部 Unit 已完成。", "ok");
      renderSetup();
      return;
    }
  }
  await requestWakeLock();
  renderFlashcard();
}

function getRoundUnknownIds() {
  return Array.from(new Set((state.groupStats.unknownIds || []).map(Number).filter(Boolean)));
}

async function startRoundUnknownReview() {
  const ids = getRoundUnknownIds();
  if (!ids.length) return;
  const idSet = new Set(ids);
  state.roundReturn = {
    unitWords: state.unitWords,
    currentIndex: state.currentIndex,
    groupStats: { ...state.groupStats, unknownIds: [...(state.groupStats.unknownIds || [])] },
    breakInfo: state.breakInfo
  };
  state.unitWords = state.unitWords.filter((word) => idSet.has(word.id));
  state.currentIndex = 0;
  state.groupStats = createGroupStats();
  state.navQueue = [];
  state.transitioning = false;
  state.markFeedback = "";
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.playbackPaused = false;
  state.reviewMode = { mode: "round-unknown", label: "本轮重难点复习", wordIds: ids };
  await requestWakeLock();
  renderFlashcard();
}

async function openArchive() {
  commitCurrentCardActivity();
  clearTimers();
  state.statsOpen = false;
  state.archiveOpen = true;
  state.archiveStatus = "正在加载归档...";
  renderCurrentView();
  try {
    await ensureWords(currentBook());
    state.archiveStatus = "";
  } catch (error) {
    state.archiveStatus = error.message || "归档加载失败";
  }
  renderCurrentView();
}

function openStats() {
  commitCurrentCardActivity();
  clearTimers();
  state.archiveOpen = false;
  state.statsOpen = true;
  renderCurrentView();
}

function closeStats() {
  state.statsOpen = false;
  renderCurrentView();
}

function closeArchive() {
  state.archiveOpen = false;
  state.archiveStatus = "";
  renderCurrentView();
}

function renderCurrentView(options = {}) {
  if (state.view === "flash") renderFlashcard(options);
  else if (state.view === "setup") renderSetup();
  else if (state.view === "break") renderBreak(state.breakInfo || { unitEnd: false });
  else renderAuth();
}

function renderArchiveDrawer() {
  const book = currentBook();
  const words = state.wordsByBook.get(book.id) || [];
  const marks = loadMarks(book.id);
  const ids = state.archiveTab === "known" ? marks.known : marks.unknown;
  const groups = groupMarkedWords(words, ids);
  const body = state.archiveStatus
    ? `<div class="status">${escapeHtml(state.archiveStatus)}</div>`
    : groups.length
      ? groups.map(renderArchiveGroup).join("")
      : `<div class="status">暂无记录。</div>`;

  return `
    <div class="archive-backdrop" id="archiveBackdrop">
      <aside class="archive-drawer" role="dialog" aria-modal="true">
        <header class="archive-head">
          <h2>归档复盘</h2>
          <button class="btn btn--ghost" id="closeArchiveBtn" type="button">关闭</button>
        </header>
        <div class="tabs">
          <button class="tab ${state.archiveTab === "known" ? "is-active" : ""}" data-archive-tab="known" type="button">已删词库</button>
          <button class="tab ${state.archiveTab === "unknown" ? "is-active" : ""}" data-archive-tab="unknown" type="button">重难点词库</button>
        </div>
        <div class="archive-body">${body}</div>
      </aside>
    </div>
  `;
}

function groupMarkedWords(words, ids) {
  const idSet = new Set(normalizeIdList(ids));
  const grouped = new Map();
  words.filter((word) => idSet.has(word.id)).forEach((word) => {
    if (!grouped.has(word.unit)) grouped.set(word.unit, []);
    grouped.get(word.unit).push(word);
  });
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
}

function renderArchiveGroup([unit, words]) {
  const book = currentBook();
  const list = words.map((word) => `
    <div class="archive-word">
      <strong>${escapeHtml(word.en)}</strong>
      <span>${escapeHtml(formatDefinition(word))}</span>
    </div>
  `).join("");
  return `
    <details class="unit-group" open>
      <summary>${escapeHtml(unitDisplayLabel(book, unit))} · ${words.length} 个</summary>
      <div class="word-list">${list}</div>
    </details>
  `;
}

function bindArchiveEvents() {
  const close = document.getElementById("closeArchiveBtn");
  const backdrop = document.getElementById("archiveBackdrop");
  if (close) close.addEventListener("click", closeArchive);
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeArchive();
    });
  }
  document.querySelectorAll("[data-archive-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.archiveTab = button.dataset.archiveTab;
      renderCurrentView();
    });
  });
}

function renderStatsDrawer() {
  const book = currentBook();
  const activity = loadActivity(book.id);
  const stats = collectActivityStats(state.statsMode);
  const reviewLabel = state.statsMode === "day" ? "复盘今天" : state.statsMode === "week" ? "复盘本周" : "复盘本月";
  return `
    <div class="stats-backdrop" id="statsBackdrop">
      <aside class="stats-drawer" role="dialog" aria-modal="true">
        <header class="archive-head">
          <div>
            <h2>统计复盘</h2>
            <div class="status">${escapeHtml(book.name)}</div>
          </div>
          <button class="btn btn--ghost" id="closeStatsBtn" type="button">关闭</button>
        </header>
        <div class="tabs">
          <button class="tab ${state.statsMode === "day" ? "is-active" : ""}" data-stats-mode="day" type="button">今天</button>
          <button class="tab ${state.statsMode === "week" ? "is-active" : ""}" data-stats-mode="week" type="button">本周</button>
          <button class="tab ${state.statsMode === "month" ? "is-active" : ""}" data-stats-mode="month" type="button">本月</button>
        </div>
        <div class="stats-body">
          <section class="stats-summary">
            <div class="stat-box"><span>${escapeHtml(stats.label)}时长</span><strong>${escapeHtml(formatDuration(stats.totals.seconds))}</strong></div>
            <div class="stat-box"><span>扫过单词</span><strong>${stats.totals.words}</strong></div>
            <div class="stat-box"><span>已斩 / 生词</span><strong>${stats.totals.known}/${stats.totals.unknown}</strong></div>
          </section>
          <button class="btn btn--primary btn--wide" id="startReviewBtn" type="button" ${stats.wordIds.length ? "" : "disabled"}>${escapeHtml(reviewLabel)}</button>
          <section class="heat-section">
            <div class="heat-head">
              <h3>本周热力</h3>
              <span>${escapeHtml(renderWeekRangeLabel())}</span>
            </div>
            ${renderWeekHeatmap(activity)}
          </section>
          <section class="heat-section">
            <div class="heat-head">
              <button class="heat-nav" data-month-nav="-1" type="button">‹</button>
              <h3>${escapeHtml(renderMonthLabel())}</h3>
              <button class="heat-nav" data-month-nav="1" type="button">›</button>
            </div>
            ${renderMonthHeatmap(activity)}
          </section>
        </div>
      </aside>
    </div>
  `;
}

function renderWeekRangeLabel() {
  const { start, end } = getPeriodRange("week");
  return `${localDateKey(start).slice(5)} - ${localDateKey(end).slice(5)}`;
}

function monthBaseDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + state.statsMonthOffset, 1);
}

function renderMonthLabel() {
  const base = monthBaseDate();
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

function activityLevel(seconds) {
  const minutes = (seconds || 0) / 60;
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 45) return 2;
  if (minutes < 90) return 3;
  return 4;
}

function renderWeekHeatmap(activity) {
  const { start } = getPeriodRange("week");
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  return `
    <div class="week-heatmap">
      ${labels.map((label, index) => {
        const date = addDays(start, index);
        const key = localDateKey(date);
        const day = activity.days[key] || {};
        const level = activityLevel(day.seconds);
        return `
          <div class="week-cell heat-level-${level}" title="${escapeHtml(key)}">
            <strong>${label}</strong>
            <span>${day.seconds ? escapeHtml(formatHours(day.seconds)) : "0m"}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderMonthHeatmap(activity) {
  const base = monthBaseDate();
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const leading = (first.getDay() || 7) - 1;
  const cells = [];
  for (let i = 0; i < leading; i += 1) cells.push(`<div class="month-cell month-cell--empty"></div>`);
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(base.getFullYear(), base.getMonth(), day);
    const key = localDateKey(date);
    const item = activity.days[key] || {};
    const level = activityLevel(item.seconds);
    cells.push(`
      <div class="month-cell heat-level-${level}" title="${escapeHtml(key)} ${escapeHtml(formatDuration(item.seconds || 0))}">
        <strong>${day}</strong>
        <span>${item.seconds ? escapeHtml(formatHours(item.seconds)) : ""}</span>
      </div>
    `);
  }
  return `
    <div class="month-weekdays">
      <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
    </div>
    <div class="month-heatmap">${cells.join("")}</div>
  `;
}

function bindStatsEvents() {
  const close = document.getElementById("closeStatsBtn");
  const backdrop = document.getElementById("statsBackdrop");
  const review = document.getElementById("startReviewBtn");
  if (close) close.addEventListener("click", closeStats);
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeStats();
    });
  }
  document.querySelectorAll("[data-stats-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statsMode = button.dataset.statsMode;
      renderCurrentView();
    });
  });
  document.querySelectorAll("[data-month-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statsMonthOffset += Number(button.dataset.monthNav);
      renderCurrentView();
    });
  });
  if (review) review.addEventListener("click", () => startReview(state.statsMode));
}

function collectSyncPayload() {
  const progress = {};
  const unknownProgress = {};
  const marks = {};
  const activity = {};
  const unitStats = {};
  BOOKS.forEach((book) => {
    progress[book.id] = loadProgress(book.id);
    unknownProgress[book.id] = collectUnknownProgressForBook(book);
    marks[book.id] = loadMarks(book.id);
    activity[book.id] = loadActivity(book.id);
    unitStats[book.id] = loadUnitStats(book.id);
  });
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    activeBookId: state.settings.bookId,
    settings: { ...state.settings },
    progress,
    unknownProgress,
    marks,
    activity,
    unitStats
  };
}

function collectUnknownProgressForBook(book) {
  const units = {};
  Array.from({ length: book.totalUnits }, (_, index) => index + 1).forEach((unit) => {
    units[String(unit)] = loadUnknownProgress(book.id, { scope: "unit", unit });
  });
  return {
    book: loadUnknownProgress(book.id, { scope: "book" }),
    units
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeSettingsPayload(settings) {
  const source = isPlainObject(settings) ? settings : {};
  const book = BOOKS.find((item) => item.id === source.bookId) || BOOKS[0];
  const bookValues = normalizeBookSettingValues(book, source);
  return {
    ...DEFAULT_SETTINGS,
    ...source,
    ...bookValues,
    bookId: book.id,
    bookSettings: normalizeBookSettingsStore(source.bookSettings)
  };
}

function normalizeUnknownProgressPayload(book, progressMap) {
  const source = isPlainObject(progressMap) ? progressMap : {};
  const sourceUnits = isPlainObject(source.units) ? source.units : {};
  const units = {};
  Array.from({ length: book.totalUnits }, (_, index) => index + 1).forEach((unit) => {
    units[String(unit)] = sanitizeProgressPayload(sourceUnits[String(unit)] || { lastWordId: null });
  });
  return {
    book: sanitizeProgressPayload(source.book || { lastWordId: null }),
    units
  };
}

function normalizeSyncPayload(payload) {
  const source = isPlainObject(payload) ? payload : {};
  const progress = {};
  const unknownProgress = {};
  const marks = {};
  const activity = {};
  const unitStats = {};
  BOOKS.forEach((book) => {
    progress[book.id] = sanitizeProgressPayload(source.progress?.[book.id] || { lastWordId: null });
    unknownProgress[book.id] = normalizeUnknownProgressPayload(book, source.unknownProgress?.[book.id]);
    marks[book.id] = sanitizeMarksPayload(source.marks?.[book.id]);
    activity[book.id] = sanitizeActivityPayload(source.activity?.[book.id]);
    unitStats[book.id] = sanitizeUnitStatsPayload(source.unitStats?.[book.id]);
  });
  return {
    version: 1,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : new Date().toISOString(),
    activeBookId: BOOKS.some((book) => book.id === source.activeBookId) ? source.activeBookId : normalizeSettingsPayload(source.settings).bookId,
    settings: normalizeSettingsPayload(source.settings),
    progress,
    unknownProgress,
    marks,
    activity,
    unitStats
  };
}

function validateSyncPayload(payload) {
  if (!isPlainObject(payload) || payload.version !== 1) return false;
  if (!isPlainObject(payload.settings) || !isPlainObject(payload.progress)) return false;
  const knownBookIds = new Set(BOOKS.map((book) => book.id));
  if (payload.activeBookId && !knownBookIds.has(payload.activeBookId)) return false;
  return BOOKS.every((book) => (
    validateProgressPayload(payload.progress?.[book.id], book) &&
    validateUnknownProgressPayload(payload.unknownProgress?.[book.id], book) &&
    validateMarksForBook(payload.marks?.[book.id]) &&
    validateActivityForBook(payload.activity?.[book.id]) &&
    validateUnitStatsForBook(payload.unitStats?.[book.id], book)
  ));
}

function validateProgressPayload(progress, book) {
  if (!isPlainObject(progress)) return false;
  const lastWordId = progress.lastWordId;
  if (lastWordId !== null && (!Number.isFinite(Number(lastWordId)) || Number(lastWordId) <= 0)) return false;
  if (progress.unit !== undefined) {
    const unit = Number(progress.unit);
    if (!Number.isFinite(unit) || unit < 1 || unit > book.totalUnits) return false;
  }
  return true;
}

function validateUnknownProgressPayload(progressMap, book) {
  if (!isPlainObject(progressMap) || !isPlainObject(progressMap.units)) return false;
  if (!validateProgressPayload(progressMap.book, book)) return false;
  return Object.entries(progressMap.units).every(([unit, progress]) => {
    const unitNumber = Number(unit);
    return Number.isFinite(unitNumber) && unitNumber >= 1 && unitNumber <= book.totalUnits && validateProgressPayload(progress, book);
  });
}

function validateMarksForBook(marks) {
  if (!isPlainObject(marks)) return false;
  const known = normalizeIdList(marks.known);
  const unknown = normalizeIdList(marks.unknown);
  if (known.length !== (Array.isArray(marks.known) ? marks.known.length : 0)) return false;
  if (unknown.length !== (Array.isArray(marks.unknown) ? marks.unknown.length : 0)) return false;
  const unknownSet = new Set(unknown);
  return known.every((id) => !unknownSet.has(id));
}

function validateActivityForBook(activity) {
  if (!isPlainObject(activity) || !isPlainObject(activity.days)) return false;
  return Object.entries(activity.days).every(([date, day]) => (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    isPlainObject(day) &&
    Number(day.seconds) >= 0 &&
    Number(day.words) >= 0 &&
    Number(day.known) >= 0 &&
    Number(day.unknown) >= 0 &&
    Array.isArray(day.wordIds) &&
    normalizeIdList(day.wordIds).length === day.wordIds.length
  ));
}

function validateUnitStatsForBook(stats, book) {
  if (!isPlainObject(stats) || !isPlainObject(stats.units)) return false;
  return Object.entries(stats.units).every(([unit, item]) => {
    const unitNumber = Number(unit);
    return Number.isFinite(unitNumber) &&
      unitNumber >= 1 &&
      unitNumber <= book.totalUnits &&
      isPlainObject(item) &&
      Number(item.completed) >= 0;
  });
}

function isEffectivelyEmptyLocalPayload(payload) {
  const normalized = normalizeSyncPayload(payload);
  return noMarks(normalized) &&
    noProgress(normalized) &&
    noUnknownProgress(normalized) &&
    noActivity(normalized) &&
    noUnitStats(normalized);
}

function noMarks(payload) {
  return BOOKS.every((book) => {
    const marks = payload.marks?.[book.id] || {};
    return !normalizeIdList(marks.known).length && !normalizeIdList(marks.unknown).length;
  });
}

function noProgress(payload) {
  return BOOKS.every((book) => !Number(payload.progress?.[book.id]?.lastWordId));
}

function noUnknownProgress(payload) {
  return BOOKS.every((book) => {
    const item = payload.unknownProgress?.[book.id] || {};
    const units = isPlainObject(item.units) ? Object.values(item.units) : [];
    return !Number(item.book?.lastWordId) && units.every((progress) => !Number(progress?.lastWordId));
  });
}

function noActivity(payload) {
  return BOOKS.every((book) => {
    const days = payload.activity?.[book.id]?.days || {};
    return !Object.values(days).some((day) => (
      Number(day.seconds) > 0 ||
      Number(day.words) > 0 ||
      Number(day.known) > 0 ||
      Number(day.unknown) > 0 ||
      normalizeIdList(day.wordIds).length > 0
    ));
  });
}

function noUnitStats(payload) {
  return BOOKS.every((book) => {
    const units = payload.unitStats?.[book.id]?.units || {};
    return !Object.values(units).some((unit) => Number(unit.completed) > 0);
  });
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
  payload.settings = normalizeSettingsPayload({ ...(payload.settings || {}), ...op.patch });
}

function normalizeCloudConfig() {
  state.cloud.token = (state.cloud.token || "").trim();
  state.cloud.gistId = (state.cloud.gistId || "").trim();
  persistCloud();
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  persistSyncMeta();
  return Boolean(state.cloud.token && state.cloud.gistId);
}

function queueAutoPull(reason = "auto") {
  if (!normalizeCloudConfig()) return;
  if (state.syncConfigTimer) clearTimeout(state.syncConfigTimer);
  state.syncConfigTimer = window.setTimeout(() => {
    state.syncConfigTimer = null;
    autoPullFromGist();
  }, reason === "init" ? 0 : AUTO_SYNC_DEBOUNCE_MS);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function dateMs(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function progressDepth(progress) {
  const sanitized = sanitizeProgressPayload(progress);
  const unit = Number(sanitized.unit) || 0;
  const lastWordId = Number(sanitized.lastWordId) || 0;
  return unit * 100000 + lastWordId;
}

function progressMapScore(progressMap) {
  if (!isPlainObject(progressMap)) return 0;
  return BOOKS.reduce((score, book) => score + progressDepth(progressMap[book.id]), 0);
}

function unknownProgressMapScore(progressMap) {
  if (!isPlainObject(progressMap)) return 0;
  return BOOKS.reduce((score, book) => {
    const item = isPlainObject(progressMap[book.id]) ? progressMap[book.id] : {};
    const unitScore = isPlainObject(item.units)
      ? Object.values(item.units).reduce((sum, progress) => sum + progressDepth(progress), 0)
      : 0;
    return score + progressDepth(item.book) + unitScore;
  }, 0);
}

function marksMapScore(marksMap) {
  if (!isPlainObject(marksMap)) return 0;
  return BOOKS.reduce((score, book) => {
    const marks = sanitizeMarksPayload(marksMap[book.id]);
    return score + marks.known.length + marks.unknown.length;
  }, 0);
}

function activityMapScore(activityMap) {
  if (!isPlainObject(activityMap)) return 0;
  return BOOKS.reduce((score, book) => {
    const activity = sanitizeActivityPayload(activityMap[book.id]);
    return score + Object.values(activity.days).reduce((sum, day) => (
      sum + (Number(day.words) || 0) + (Number(day.known) || 0) + (Number(day.unknown) || 0) + normalizeIdList(day.wordIds).length
    ), 0);
  }, 0);
}

function unitStatsMapScore(unitStatsMap) {
  if (!isPlainObject(unitStatsMap)) return 0;
  return BOOKS.reduce((score, book) => {
    const stats = sanitizeUnitStatsPayload(unitStatsMap[book.id]);
    return score + Object.values(stats.units).reduce((sum, unit) => sum + (Number(unit.completed) || 0), 0);
  }, 0);
}

function syncContentScore(payload) {
  if (!isPlainObject(payload)) return 0;
  return (
    progressMapScore(payload.progress) +
    unknownProgressMapScore(payload.unknownProgress) +
    marksMapScore(payload.marks) * 1000000 +
    activityMapScore(payload.activity) * 100000 +
    unitStatsMapScore(payload.unitStats) * 100000
  );
}

function normalizeIdList(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0)))
    .sort((a, b) => a - b);
}

function sanitizeProgressPayload(progress) {
  if (!isPlainObject(progress)) return { lastWordId: null };
  const lastWordId = Number(progress.lastWordId);
  const unit = Number(progress.unit);
  const sanitized = {
    ...progress,
    lastWordId: Number.isFinite(lastWordId) && lastWordId > 0 ? lastWordId : null
  };
  if (Number.isFinite(unit) && unit > 0) sanitized.unit = unit;
  else delete sanitized.unit;
  return sanitized;
}

function sanitizeMarksPayload(marks) {
  return {
    known: normalizeIdList(marks?.known),
    unknown: normalizeIdList(marks?.unknown)
  };
}

function sanitizeActivityPayload(activity) {
  const sourceDays = isPlainObject(activity?.days) ? activity.days : {};
  const days = {};
  Object.entries(sourceDays).forEach(([key, value]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !isPlainObject(value)) return;
    days[key] = {
      seconds: Math.max(0, Number(value.seconds) || 0),
      words: Math.max(0, Number(value.words) || 0),
      known: Math.max(0, Number(value.known) || 0),
      unknown: Math.max(0, Number(value.unknown) || 0),
      wordIds: normalizeIdList(value.wordIds)
    };
  });
  return {
    days
  };
}

function sanitizeUnitStatsPayload(stats) {
  const sourceUnits = isPlainObject(stats?.units) ? stats.units : {};
  const units = {};
  Object.entries(sourceUnits).forEach(([key, value]) => {
    const unit = Number(key);
    if (!Number.isFinite(unit) || unit <= 0) return;
    const source = isPlainObject(value) ? value : { completed: value };
    const completed = Math.max(0, Math.floor(Number(source.completed) || 0));
    const item = { completed };
    if (typeof source.updatedAt === "string" && source.updatedAt) item.updatedAt = source.updatedAt;
    units[String(Math.floor(unit))] = item;
  });
  return { units };
}

function parseSyncPayloadContent(content) {
  if (!String(content || "").trim()) return { kind: "empty" };
  try {
    const payload = JSON.parse(content);
    if (!isPlainObject(payload) || !Object.keys(payload).length) return { kind: "empty" };
    if (payload.version !== undefined && payload.version !== 1) return { kind: "invalid" };
    if (!isPlainObject(payload.settings) || !isPlainObject(payload.progress)) return { kind: "empty" };
    const normalized = normalizeSyncPayload(payload);
    if (!validateSyncPayload(normalized)) return { kind: "invalid" };
    return { kind: "valid", payload: normalized };
  } catch {
    return { kind: "invalid" };
  }
}

async function fetchGistSyncPayload() {
  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(state.cloud.gistId)}`, {
    headers: {
      Authorization: `Bearer ${state.cloud.token}`,
      Accept: "application/vnd.github+json"
    }
  });
  if (!response.ok) throw new Error(`云端拉取失败：${response.status}`);
  const gist = await response.json();
  const remoteVersion = gist.history?.[0]?.version || gist.updated_at || "";
  const remoteUpdatedAt = gist.updated_at || "";
  const file = gist.files?.[SYNC_FILE_NAME];
  if (!file) return { kind: "empty", rawContent: "", remoteVersion, remoteUpdatedAt };
  const content = await readGistFileContent(file);
  return {
    ...parseSyncPayloadContent(content),
    rawContent: content,
    remoteVersion,
    remoteUpdatedAt
  };
}

async function readGistFileContent(file) {
  if (!file.truncated && typeof file.content === "string") return file.content;
  if (!file.raw_url) return "";
  const response = await fetch(file.raw_url, {
    headers: {
      Authorization: `Bearer ${state.cloud.token}`,
      Accept: "application/vnd.github.raw"
    }
  });
  if (!response.ok) throw new Error(`云端文件读取失败：${response.status}`);
  return response.text();
}

async function autoPullFromGist() {
  return syncWithGist();
}

async function autoPushToGist({ keepalive = false } = {}) {
  return syncWithGist({ keepalive });
}

async function syncWithGist({ keepalive = false } = {}) {
  if (!normalizeCloudConfig()) return false;
  if (state.syncInFlight) return state.syncInFlight;
  state.syncInFlight = runGistSync({ keepalive }).finally(() => {
    state.syncInFlight = null;
  });
  return state.syncInFlight;
}

async function runGistSync({ keepalive = false } = {}) {
  try {
    setSyncStatus("syncing");
    state.syncMeta = ensureSyncMeta(state.syncMeta);
    const remote = await fetchGistSyncPayload();
    const localPayload = normalizeSyncPayload(collectSyncPayload());
    const ops = getPendingOps();

    if (remote.kind === "empty") {
      return createRemoteSyncJson(localPayload, remote, { keepalive });
    }

    if (remote.kind !== "valid") {
      enterSafeConflictMode("云端 sync.json 无法解析。为避免数据丢失，已暂停自动同步。");
      return false;
    }

    if (!state.syncMeta.initialized || state.syncMeta.gistId !== state.cloud.gistId || !state.syncMeta.lastRemoteVersion) {
      if (isEffectivelyEmptyLocalPayload(localPayload)) {
        applySyncPayload(remote.payload);
        markSyncedWithRemote(remote, remote.payload);
        clearPendingOps();
        renderCurrentView({ touchProgress: false });
        setSyncStatus("ok");
        return true;
      }
      enterSafeConflictMode("本地和云端都已有学习数据。为避免覆盖，已暂停自动同步，请先导出本地备份后手动处理。");
      return false;
    }

    const remoteChanged = remote.remoteVersion !== state.syncMeta.lastRemoteVersion;
    const localChanged = ops.length > 0 || state.syncMeta.localUpdatedAt !== state.syncMeta.lastSyncedLocalUpdatedAt;

    if (!remoteChanged && !localChanged) {
      setSyncStatus("ok");
      return true;
    }

    if (!remoteChanged && localChanged) {
      return pushPayloadWithBackup(remote, localPayload, { keepalive });
    }

    if (remoteChanged && !localChanged) {
      applySyncPayload(remote.payload);
      markSyncedWithRemote(remote, remote.payload);
      clearPendingOps();
      renderCurrentView({ touchProgress: false });
      setSyncStatus("ok");
      return true;
    }

    if (remoteChanged && localChanged) {
      if (!ops.length) {
        enterSafeConflictMode("云端和本地都有新改动，但本地没有可重放操作日志。为避免数据丢失，已暂停自动同步。");
        return false;
      }
      const mergedPayload = normalizeSyncPayload(applyPendingOps(cloneJson(remote.payload), ops));
      if (!validateSyncPayload(mergedPayload)) {
        enterSafeConflictMode("本地操作重放后校验失败。为避免数据丢失，已暂停自动同步。");
        return false;
      }
      return pushPayloadWithBackup(remote, mergedPayload, { keepalive, applyBackToLocal: true, acceptCurrentRemoteVersion: true });
    }
    setSyncStatus("ok");
    return true;
  } catch {
    setSyncStatus("error");
    return false;
  }
}

async function createRemoteSyncJson(payload, remote, { keepalive = false } = {}) {
  const normalized = normalizeSyncPayload(payload);
  if (!validateSyncPayload(normalized)) {
    enterSafeConflictMode("本地同步数据校验失败，已阻止创建云端 sync.json。");
    return false;
  }
  return patchGistFiles({
    payload: normalized,
    remote,
    keepalive,
    includeBackup: false,
    applyBackToLocal: false
  });
}

async function pushPayloadWithBackup(remote, payload, { keepalive = false, applyBackToLocal = false, acceptCurrentRemoteVersion = false } = {}) {
  if (!state.syncMeta.initialized || state.syncMeta.gistId !== state.cloud.gistId || !state.syncMeta.lastRemoteVersion) {
    enterSafeConflictMode("本地尚未从云端初始化，请先拉取云端数据。");
    return false;
  }
  if (!acceptCurrentRemoteVersion && remote.remoteVersion !== state.syncMeta.lastRemoteVersion) {
    enterSafeConflictMode("云端版本已变化，已禁止覆盖。请先完成安全同步。");
    return false;
  }
  if (acceptCurrentRemoteVersion && !remote.remoteVersion) {
    enterSafeConflictMode("云端版本未知，已禁止覆盖。");
    return false;
  }
  const normalized = normalizeSyncPayload(payload);
  if (!validateSyncPayload(normalized)) {
    enterSafeConflictMode("本地同步数据校验失败，已阻止上传。");
    return false;
  }
  const remoteScore = syncContentScore(remote.payload);
  const localScore = syncContentScore(normalized);
  if (remoteScore >= 20 && localScore < remoteScore * 0.1) {
    enterSafeConflictMode("本地数据量明显小于云端，疑似缓存清空或数据损坏，已阻止上传。");
    return false;
  }
  return patchGistFiles({
    payload: normalized,
    remote,
    keepalive,
    includeBackup: true,
    applyBackToLocal
  });
}

async function patchGistFiles({ payload, remote, keepalive = false, includeBackup = true, applyBackToLocal = false }) {
  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(state.cloud.gistId)}`, {
    method: "PATCH",
    keepalive,
    headers: {
      Authorization: `Bearer ${state.cloud.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      files: {
        ...(includeBackup ? {
          [SYNC_BACKUP_FILE_NAME]: {
            content: remote.rawContent || JSON.stringify(remote.payload || {}, null, 2)
          }
        } : {}),
        [SYNC_FILE_NAME]: {
          content: JSON.stringify(payload, null, 2)
        }
      }
    })
  });
  if (!response.ok) throw new Error(`云端推送失败：${response.status}`);
  const updatedGist = await response.json();
  const updatedRemote = {
    remoteVersion: updatedGist.history?.[0]?.version || updatedGist.updated_at || "",
    remoteUpdatedAt: updatedGist.updated_at || ""
  };
  if (applyBackToLocal) applySyncPayload(payload);
  markSyncedWithRemote(updatedRemote, payload);
  clearPendingOps();
  setSyncStatus("ok");
  return true;
}

function markSyncedWithRemote(remote, payload) {
  const syncedAt = payload?.updatedAt || new Date().toISOString();
  state.syncMeta = {
    ...ensureSyncMeta(state.syncMeta),
    initialized: true,
    gistId: state.cloud.gistId,
    fileName: SYNC_FILE_NAME,
    lastRemoteVersion: remote.remoteVersion || "",
    lastRemoteUpdatedAt: remote.remoteUpdatedAt || "",
    localUpdatedAt: syncedAt,
    lastSyncedLocalUpdatedAt: syncedAt
  };
  persistSyncMeta();
}

function enterSafeConflictMode(message) {
  if (state.view === "setup") state.setupStatus = { message, type: "error" };
  setSyncStatus("error");
}

function applySyncPayload(payload) {
  const normalized = normalizeSyncPayload(payload);
  if (!validateSyncPayload(normalized)) return false;
  state.applyingRemotePayload = true;
  try {
    state.settings = { ...DEFAULT_SETTINGS, ...normalized.settings };
    normalizeSettings();
    saveJson(SETTINGS_KEY, state.settings);
    Object.entries(normalized.progress).forEach(([bookId, progress]) => saveProgress(bookId, progress, { touch: false }));
    Object.entries(normalized.marks).forEach(([bookId, marks]) => saveMarks(bookId, marks, { touch: false }));
    Object.entries(normalized.activity).forEach(([bookId, activity]) => saveActivity(bookId, activity, { touch: false }));
    Object.entries(normalized.unitStats).forEach(([bookId, stats]) => saveUnitStats(bookId, stats, { touch: false }));
    Object.entries(normalized.unknownProgress).forEach(([bookId, progressMap]) => applyUnknownProgressPayload(bookId, progressMap));
    state.syncMeta.localUpdatedAt = normalized.updatedAt || new Date().toISOString();
    persistSyncMeta();
    return true;
  } finally {
    state.applyingRemotePayload = false;
  }
}

function applyUnknownProgressPayload(bookId, progressMap) {
  const book = BOOKS.find((item) => item.id === bookId);
  if (!book || !isPlainObject(progressMap)) return;
  if (isPlainObject(progressMap.book)) {
    saveUnknownProgress(book.id, { scope: "book" }, sanitizeProgressPayload(progressMap.book), { touch: false });
  }
  const units = isPlainObject(progressMap.units) ? progressMap.units : {};
  Object.entries(units).forEach(([unit, progress]) => {
    const unitNumber = Number(unit);
    if (!Number.isFinite(unitNumber) || unitNumber < 1 || unitNumber > book.totalUnits) return;
    saveUnknownProgress(book.id, { scope: "unit", unit: unitNumber }, sanitizeProgressPayload(progress), { touch: false });
  });
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
    });
  } catch {
    state.wakeLock = null;
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }
}

init();
