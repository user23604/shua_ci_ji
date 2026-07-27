/*
 * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 * Source order: app.js -> scripts[].
 * Rebuild: npm run build
 */
/* ===== 00-env.js ===== */
"use strict";

const APP_VERSION = "2026-07-27-final-ux-sync-v4";
const APP_BUILD_ID = "2026-07-27-final-ux-sync-v4";


const ACCESS_KEY = "ky2027";
const AUTH_KEY = "is_authenticated";

const SETTINGS_KEY = "vocab_machine_settings_v1";
const CLOUD_KEY = "vocab_machine_cloud_v1";

const SYNC_META_KEY = "vocab_machine_sync_meta_v1";
const HASH_SYNC_STATE_KEY = "vocab_machine_hash_sync_state_v2";
const MARK_STATES_PREFIX = "mark_states:";

const PENDING_OPS_KEY = "vocab_machine_pending_ops_v1";
const LOCAL_SNAPSHOT_KEY = "vocab_machine_local_snapshot_latest_v1";

const DAILY_BACKUP_PREFIX = "vocab_machine_daily_backup_";
const HASH_BACKUP_PREFIX = "vocab_machine_backup:";

const HASH_BACKUP_INDEX_KEY = "vocab_machine_backup_index_v1";
const SYNC_AUDIT_KEY = "vocab_machine_sync_audit_v1";
const PROGRESS_CURSOR_KEY = "vocab_machine_progress_cursor_v1";
const UNKNOWN_PROGRESS_CURSOR_KEY = "vocab_machine_unknown_progress_cursor_v1";
const PROGRESS_PENDING_KEY = "vocab_machine_progress_pending_v1";
const ACTIVITY_DRAFT_KEY = "vocab_machine_activity_draft_v1";
const STUDY_SESSION_KEY = "vocab_machine_study_session_v1";

const SYNC_FILE_NAME = "sync.json";
const SYNC_BACKUP_FILE_NAME = "sync.prev.json";

const SYNC_HEALTHCHECK_FILE_NAME = "_sync_probe.txt";
const SYNC_CLOUD_BACKUP_PREFIX = "sync.backup.";
const SYNC_CLOUD_BACKUP_RETENTION_DAYS = 7;

const AUTO_PUSH_DEBOUNCE_MS = 5000;
const ACTIVE_STUDY_SYNC_DEBOUNCE_MS = 8000;
const SYNC_LONG_RUNNING_UI_MS = 8000;


const SYNC_HEARTBEAT_MS = 60000;
const SYNC_BACKOFF_STEPS_MS = [30000, 60000, 120000, 300000, 900000, 1800000];

const VERSION_CHECK_INTERVAL_MS = 300000;
const GITHUB_GET_TIMEOUT_MS = 15000;
const GIST_RELIABLE_INLINE_MAX_BYTES = 900 * 1024;

const GITHUB_PATCH_TIMEOUT_MS = 20000;
const VERSION_CHECK_TIMEOUT_MS = 8000;
const WORD_DATA_TIMEOUT_MS = 15000;

const SYNC_NO_PROGRESS_TIMEOUT_MS = 60000;
const CROSS_TAB_LOCK_LEASE_MS = 75000;

const MAX_PREFLIGHT_REBASE = 2;
const MAX_PATCH_409_RETRIES = 2;
const SYNC_MIN_INTERVAL_MS = 5000;
const SYNC_LOCK_KEY = "shua_ci_ji_sync_lock";
const WEB_SYNC_LOCK_NAME = "shua-ci-ji-cloud-sync";

const SYNC_CLEAN_REMOTE_POLL_MS = 300000;
const SYNC_REMOTE_CONFIRM_TTL_MS = 120000;

const TAB_ID = (globalThis.crypto && globalThis.crypto.randomUUID)
  ? globalThis.crypto.randomUUID()
  : String(Date.now()) + "-" + Math.random().toString(36).slice(2);

// ── 统一 fetch 超时 ────────────────────────────────────────────────

/* ===== 01-utils-basic.js ===== */
"use strict";

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms || 0);
  });
}


function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  var ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  return Promise.resolve();
}


function formatLocalDateTime(value) {
  if (!value) return "无";
  var d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(d);
}

// ── business hash engine ───────────────────────────────────────────────


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


function beijingISOString(date) {
  if (date === undefined || date === null) date = new Date();
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const ms = date.getTime() + 8 * 3600000;
  const bj = new Date(ms);
  return bj.getUTCFullYear() + "-" +
    String(bj.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(bj.getUTCDate()).padStart(2, "0") + "T" +
    String(bj.getUTCHours()).padStart(2, "0") + ":" +
    String(bj.getUTCMinutes()).padStart(2, "0") + ":" +
    String(bj.getUTCSeconds()).padStart(2, "0") + "." +
    String(bj.getUTCMilliseconds()).padStart(3, "0") + "+08:00";
}


function localDateKey(date = new Date()) {
  const ms = (date instanceof Date ? date.getTime() : Date.parse(date)) + 8 * 3600000;
  const bj = new Date(Number.isFinite(ms) ? ms : Date.now() + 8 * 3600000);
  const year = bj.getUTCFullYear();
  const month = String(bj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function startOfLocalDay(date = new Date()) {
  const ms = date.getTime() + 8 * 3600000;
  const bj = new Date(ms);
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()));
}


function addDays(date, days) {
  const ms = date.getTime() + days * 86400000;
  return new Date(ms);
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


function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}


function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map(function(k) { return stableStringify(k) + ":" + stableStringify(value[k]); });
  return "{" + pairs.join(",") + "}";
}


function stableStringifyHash(payload) {
  var copy = {};
  Object.keys(payload).forEach(function(k) { if (k !== "updatedAt") copy[k] = payload[k]; });
  var json = stableStringify(copy);
  var hash = 5381;
  for (var i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}


function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}


function dateMs(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

/* ===== 02-storage-basic.js ===== */
"use strict";

function cloneJsonFallback(fallback) {
  if (Array.isArray(fallback)) return fallback.slice();
  if (isPlainObject(fallback)) return { ...fallback };
  return fallback;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return cloneJsonFallback(fallback);
    const parsed = JSON.parse(raw);
    if (isPlainObject(fallback)) return isPlainObject(parsed) ? { ...fallback, ...parsed } : { ...fallback };
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback.slice();
    return parsed === undefined ? fallback : parsed;
  } catch (_) {
    return cloneJsonFallback(fallback);
  }
}

function saveJson(key, value, options = {}) {
  return safeLocalStorageSet(key, JSON.stringify(value), options);
}

function safeLocalStorageSet(key, value, options = {}) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (isQuotaExceededError(err)) return handleStorageQuotaExceeded(key, value, options);
    return handleStorageWriteFailure(key, err, options);
  }
}

function isQuotaExceededError(err) {
  return Boolean(err) && (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota/i.test(String(err && (err.message || err)))
  );
}

function handleStorageWriteFailure(key, err, options = {}) {
  var quota = isQuotaExceededError(err);
  var detail = quota
    ? "本地浏览器存储空间不足，无法写入 " + key
    : "浏览器拒绝本地存储写入，无法写入 " + key;
  // 不能在 HASH_SYNC_STATE_KEY 写入失败时再次调用 persistHashSyncState，避免递归耗尽调用栈。
  try {
    if (typeof state !== "undefined" && typeof ensureHashSyncState === "function") {
      state.syncHashState = ensureHashSyncState(state.syncHashState);
      state.syncHashState.lastBackupError = detail;
      if (key !== HASH_SYNC_STATE_KEY) {
        try { localStorage.setItem(HASH_SYNC_STATE_KEY, JSON.stringify(state.syncHashState)); } catch (_) {}
      }
    }
  } catch (_) {}
  if (typeof showSyncProblemDialog === "function") {
    showSyncProblemDialog({
      severity: "error",
      code: quota ? "LOCAL_STORAGE_QUOTA" : "LOCAL_STORAGE_WRITE_FAILED",
      title: quota ? "本地浏览器存储空间不足" : "本地存储不可用",
      message: quota
        ? "本地数据或备份写入失败。请立即导出排查包和本地备份，再清理浏览器存储空间。"
        : "浏览器拒绝保存本地数据。请检查站点存储权限；在恢复前不要继续产生重要学习记录。",
      technical: err && (err.message || String(err)),
      dialogKeySuffix: key
    });
  }
  return false;
}

function handleStorageQuotaExceeded(key, value, options = {}) {
  pruneStorageForQuota(options);
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    return handleStorageWriteFailure(key, err, options);
  }
}

function pruneStorageForQuota(options = {}) {
  try { localStorage.removeItem(SYNC_AUDIT_KEY); } catch (_) {}
  pruneBackupsForQuota();
  pruneDailySnapshotsForQuota();
}

function pruneDailySnapshotsForQuota() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DAILY_BACKUP_PREFIX)) keys.push(key);
    }
    keys.sort().slice(0, Math.max(0, keys.length - 14)).forEach(function(key) {
      try { localStorage.removeItem(key); } catch (_) {}
    });
  } catch (_) {}
}

function pruneBackupsForQuota() {
  var items = typeof loadHashBackupIndex === "function" ? loadHashBackupIndex().slice() : [];
  function priority(item) {
    if (!item || !item.key) return 0;
    if (item.kind === "pre_overwrite") return 100;
    if (item.nonEmpty === true) return 80;
    if (item.kind === "daily:first_non_empty") return 70;
    if (item.kind === "startup" && item.nonEmpty === false) return 10;
    if (item.nonEmpty === false) return 20;
    return 40;
  }
  items.sort(function(a, b) {
    var pa = priority(a);
    var pb = priority(b);
    if (pa !== pb) return pa - pb;
    return String(a.savedAt || "").localeCompare(String(b.savedAt || ""));
  });
  var removed = 0;
  items.some(function(item) {
    if (!item || !item.key || priority(item) >= 70) return false;
    try { localStorage.removeItem(item.key); removed += 1; } catch (_) {}
    return removed >= 5;
  });
  if (removed && typeof saveHashBackupIndex === "function") {
    var remainingKeys = new Set();
    for (var i = 0; i < localStorage.length; i += 1) remainingKeys.add(localStorage.key(i));
    saveHashBackupIndex(items.filter(function(item) { return item && item.key && remainingKeys.has(item.key); }));
  }
}

function safeSetLocalStorage(key, value, options = {}) {
  try {
    return safeLocalStorageSet(key, value, options);
  } catch (error) {
    try {
      state.syncHashState = ensureHashSyncState(state.syncHashState);
      state.syncHashState.lastBackupError = error && error.message || "本地备份写入失败";
      if (key !== HASH_SYNC_STATE_KEY) persistHashSyncState();
    } catch (_) {}
    return false;
  }
}

/* ===== 03-domain-defaults.js ===== */
"use strict";

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
const BUSINESS_HASH_SCHEMA_VERSION = 3;


const SYNC_STATUS_LABELS = {
  unconfigured: "云同步未配置",
  invalid_config: "配置错误",
  local_only: "本地保存",
  dirty: "待上传",
  study_queued: "待同步",
  syncing: "同步中…",
  confirm_pending: "写入待确认",
  cloud_unavailable: "云端暂不可用",
  cloud_loaded: "已从云端更新",
  cloud_saved: "云端已保存",
  cloud_ok: "云端已保存",
  read_only: "只读",
  dirty_read_only: "\u53ea\u8bfb\u00b7\u672c\u5730\u5f85\u4e0a\u4f20",
  error: "同步失败",
  conflict: "自动合并失败"
};


const SYNC_STATUS_COLORS = {
  unconfigured: "#94a3b8",
  invalid_config: "#dc2626",
  local_only: "#ea580c",
  dirty: "#ea580c",
  study_queued: "#7c3aed",
  syncing: "#2563eb",
  confirm_pending: "#7c3aed",
  cloud_unavailable: "#d97706",
  cloud_loaded: "#64748b",
  cloud_saved: "#16a34a",
  cloud_ok: "#16a34a",
  read_only: "#ea580c",
  dirty_read_only: "#ea580c",
  error: "#dc2626",
  conflict: "#dc2626"
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
  "manualZhReveal",
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
  autoSyncEnabled: true,
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
  manualZhReveal: false,
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
  clientId: "",
  lastSuccessfulPushAt: "",
  lastSuccessfulPullAt: "",
  lastCloudSaveConfirmedAt: "",
  lastSyncAttemptAt: "",
  lastSyncErrorAt: "",
  lastSyncErrorMessage: "",
  lastSyncedPayloadHash: "",
  dirtySince: "",
  cloudWritable: false,
  readOnlyMode: false,
  localSeq: 0
};

const DEFAULT_HASH_SYNC_STATE = {
  schemaVersion: 2,
  businessHashSchemaVersion: BUSINESS_HASH_SCHEMA_VERSION,
  hashSchemaNeedsRemoteCheck: false,
  schemaMigrationPreviousDirty: false,
  localDirty: false,
  baseRemoteHash: "",
  localPayloadHash: "",
  dirtySince: "",
  lastSyncStatus: "unconfigured",
  lastSyncError: "",
  lastErrorKind: "",
  lastErrorStage: "",
  lastErrorTransport: "",
  lastErrorHttpStatus: 0,
  lastErrorTechnical: "",
  lastSuccessfulPushAt: "",
  lastSuccessfulPullAt: "",
  consecutiveSyncFailures: 0,
  nextRetryAt: "",
  lastBackupError: "",
  localRecoveryRequired: false,
  lastBlockingErrorAt: "",
  lastBlockingErrorCode: "",
  lastBlockingErrorText: "",
  lastBlockingErrorClearedAt: "",
  lastSyncedPayloadHash: ""
};

/* ===== 04-state.js ===== */
"use strict";

const app = document.getElementById("app");


const state = {
  settings: loadJson(SETTINGS_KEY, DEFAULT_SETTINGS),
  cloud: loadJson(CLOUD_KEY, { token: "", gistId: "" }),
  syncMeta: loadJson(SYNC_META_KEY, DEFAULT_SYNC_META),
  syncHashState: loadJson(HASH_SYNC_STATE_KEY, DEFAULT_HASH_SYNC_STATE),
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
  cardTransitionTimer: null,
  transitionSafetyTimer: null,
  groupStats: createGroupStats(),
  breakInfo: null,
  roundReturn: null,
  undoWordId: null,
  archiveOpen: false,
  archiveTab: "unknown",
  archiveStatus: "",
  archiveExpandedUnits: new Set(),
  archiveSelectionMode: "",
  archiveSelectedUnits: new Set(),
  archiveSelectedWordIds: new Set(),
  archiveLongPressTimer: null,
  archiveLongPressTriggered: false,
  archiveSuppressClickKey: "",
  statsOpen: false,
  statsMode: "day",
  statsMonthOffset: 0,
  reviewMode: null,
  setupStatus: "",
  studyStartPending: false,
  setupPrimeBookIds: new Set(),
  wakeLock: null,
  playbackPaused: false,
  awaitingManualZhReveal: false,
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
  syncStatus: "unconfigured",
  syncHeartbeatTimer: null,
  isSyncing: false,
  syncStartedAt: 0,
  syncRunSeq: 0,
  syncRunId: 0,
  lastSyncBannerKey: "",
  lastSyncBannerAt: 0,
  syncLastProgressAt: 0,
  syncLastProgressStage: "",
  lastSyncFinishedAt: 0,
  syncActuallyStarted: false,
  syncStartedAtMs: 0,
  localBusinessRevision: 0,
  lastLocalBusinessChangeAt: 0,
  lastLocalBusinessChangeReason: "",
  lastLocalBusinessChangeSource: "",
  lastLocalBusinessChangeRunId: null,
  lastUserStudyActionAt: 0,
  lastStudyActivityAt: 0,
  activeStudySyncTimer: null,
  lastDirtyReason: "",
  lastDirtyFromVerify: false,
  activeSyncProblemDialogKey: null,
  activeSyncProblemDialogProblem: null,
  lastSyncProblemDialogKey: null,
  lastSyncProblemDialogShownAt: 0,
  dismissedSyncProblemDialogKeys: {},
  versionInfo: { status: "unknown", serverVersion: "", serverBuildId: "", checkedAt: "", error: "" },
  versionCheckTimer: null,
  applyingRemotePayload: false,
  suppressDirty: false,
  cloudConfigDraft: { token: "", gistId: "" },
  autoPushDebounceTimer: null,
  autoSyncDueAt: 0,
  autoSyncReason: "",
  syncRequestedAfterCurrent: false,
  consecutivePushFailures: 0,
  sessionRemoteCheckDone: false,
  sessionRemoteCheckAt: "",
  latestRemoteHashSeen: "",
  latestRemoteKindSeen: "",
  latestRemoteCheckRunId: 0,
  initialSyncStarted: false,
  lastCleanRemotePollAt: 0,
  pageHiddenDuringSyncAt: 0,
  pendingActiveStudyUpload: false,
  pendingProgressSync: false,
  activityDirtyPending: false,
  activityDraftPending: false,
  lastMarkCleanAtMs: 0,
  lastStatusRenderAuditKey: "",
  lastStatusRenderAuditAt: 0,
  launchRestoringStudy: false
};


function createGroupStats() {
  return { seen: 0, known: 0, unknown: 0, unknownIds: [] };
}

/* ===== 05a-storage-progress.js ===== */
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
  return saveJson(
    PROGRESS_CURSOR_KEY,
    { byBook: isPlainObject(store && store.byBook) ? store.byBook : {} },
    { priority: "local_cursor" }
  );
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
  if (!saveProgressCursorStore(store)) return false;
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
  return saveJson(
    UNKNOWN_PROGRESS_CURSOR_KEY,
    { byBook: isPlainObject(store && store.byBook) ? store.byBook : {} },
    { priority: "local_cursor" }
  );
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
  if (!saveUnknownProgressCursorStore(store)) return false;
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
  var saved = saveJson(
    PROGRESS_PENDING_KEY,
    { pending: true, reason: String(reason || ""), updatedAt: beijingISOString() },
    { priority: "local_cursor" }
  );
  if (!wasPending && typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "sync:progress_pending", message: "reason=" + String(reason || "") + " persisted=" + String(saved) });
  }
  if (typeof updateSyncIndicator === "function") updateSyncIndicator();
  return saved;
}


function hasUnflushedProgressCursorData() {
  var progressStore = loadProgressCursorStore();
  var progressPending = Object.keys(progressStore.byBook || {}).some(function(bookId) {
    var cursor = sanitizeProgressPayload(progressStore.byBook[bookId]);
    return Number(cursor.lastWordId || 0) > 0 && !sameProgressPosition(loadProgress(bookId), cursor);
  });
  if (progressPending) return true;
  var unknownStore = loadUnknownProgressCursorStore();
  return Object.keys(unknownStore.byBook || {}).some(function(bookId) {
    var item = normalizeUnknownProgressCursorBook(unknownStore.byBook[bookId]);
    if (Number(item.book && item.book.lastWordId || 0) > 0 &&
        !sameProgressPosition(loadUnknownProgress(bookId, { scope: "book" }), item.book)) return true;
    return Object.keys(item.units || {}).some(function(unit) {
      var cursor = sanitizeProgressPayload(item.units[unit]);
      var scope = { scope: "unit", unit: Number(unit) };
      return Number(cursor.lastWordId || 0) > 0 && !sameProgressPosition(loadUnknownProgress(bookId, scope), cursor);
    });
  });
}

function restoreProgressPending() {
  var meta = loadJson(PROGRESS_PENDING_KEY, { pending: false });
  var reconstructed = hasUnflushedProgressCursorData();
  state.pendingProgressSync = Boolean(meta && meta.pending === true) || reconstructed;
  if (reconstructed && !(meta && meta.pending === true)) {
    saveJson(PROGRESS_PENDING_KEY, {
      pending: true,
      reason: "startup_cursor_reconstruction",
      updatedAt: beijingISOString()
    }, { priority: "local_cursor" });
    if (typeof appendAuditEvent === "function") {
      appendAuditEvent({ type: "sync:progress_pending_reconstructed", message: "durable cursor differs from cloud progress" });
    }
  }
  return state.pendingProgressSync;
}


function clearProgressPending() {
  var saved = saveJson(
    PROGRESS_PENDING_KEY,
    { pending: false, updatedAt: beijingISOString() },
    { priority: "local_cursor" }
  );
  if (saved) state.pendingProgressSync = false;
  return saved;
}


function hasPendingProgressSync() {
  if (state.pendingProgressSync === true) return true;
  var meta = loadJson(PROGRESS_PENDING_KEY, { pending: false });
  return meta && meta.pending === true;
}


function syncProgressCursorFromCloudPayload(payload) {
  var normalized = normalizeSyncPayload(payload || {});
  var allSaved = true;
  Object.keys(normalized.progress || {}).forEach(function(bookId) {
    var progress = normalized.progress[bookId];
    if (!sameProgressPosition(loadProgressCursor(bookId), progress)) {
      allSaved = saveProgressCursor(bookId, progress, { queue: false, reason: "cloud_apply" }) !== false && allSaved;
    }
  });
  Object.keys(normalized.unknownProgress || {}).forEach(function(bookId) {
    var item = normalized.unknownProgress[bookId] || {};
    if (item.book && !sameProgressPosition(loadUnknownProgressCursor(bookId, { scope: "book" }), item.book)) {
      allSaved = saveUnknownProgressCursor(bookId, { scope: "book" }, item.book, { queue: false, reason: "cloud_apply" }) !== false && allSaved;
    }
    Object.keys(item.units || {}).forEach(function(unit) {
      var scope = { scope: "unit", unit: Number(unit) };
      if (!sameProgressPosition(loadUnknownProgressCursor(bookId, scope), item.units[unit])) {
        allSaved = saveUnknownProgressCursor(bookId, scope, item.units[unit], { queue: false, reason: "cloud_apply" }) !== false && allSaved;
      }
    });
  });
  return allSaved;
}


function flushProgressForCloud(reason = "flush") {
  if (!hasPendingProgressSync()) return false;
  var changed = false;
  var allSaved = true;
  var progressStore = loadProgressCursorStore();
  Object.keys(progressStore.byBook || {}).forEach(function(bookId) {
    var cursor = sanitizeProgressPayload(progressStore.byBook[bookId]);
    if (!Number(cursor.lastWordId || 0)) return;
    if (!sameProgressPosition(loadProgress(bookId), cursor)) {
      var saved = saveProgress(bookId, cursor, { touch: true, source: "cloud_flush", reason: reason });
      allSaved = allSaved && saved !== false;
      changed = changed || saved === true;
    }
  });
  var unknownStore = loadUnknownProgressCursorStore();
  Object.keys(unknownStore.byBook || {}).forEach(function(bookId) {
    var item = normalizeUnknownProgressCursorBook(unknownStore.byBook[bookId]);
    if (Number(item.book && item.book.lastWordId || 0) && !sameProgressPosition(loadUnknownProgress(bookId, { scope: "book" }), item.book)) {
      var bookSaved = saveUnknownProgress(bookId, { scope: "book" }, item.book, { touch: true, source: "cloud_flush", reason: reason });
      allSaved = allSaved && bookSaved !== false;
      changed = changed || bookSaved === true;
    }
    Object.keys(item.units || {}).forEach(function(unit) {
      var cursor = sanitizeProgressPayload(item.units[unit]);
      if (!Number(cursor.lastWordId || 0)) return;
      var scope = { scope: "unit", unit: Number(unit) };
      if (!sameProgressPosition(loadUnknownProgress(bookId, scope), cursor)) {
        var unitSaved = saveUnknownProgress(bookId, scope, cursor, { touch: true, source: "cloud_flush", reason: reason });
        allSaved = allSaved && unitSaved !== false;
        changed = changed || unitSaved === true;
      }
    });
  });
  if (allSaved) clearProgressPending();
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({
      type: "sync:flush_progress_for_cloud",
      message: "reason=" + String(reason || "") + " changed=" + String(changed) + " persisted=" + String(allSaved)
    });
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
  var options = _ref || {};
  var touch = options.touch !== false;
  if (touch && state.view === "flash" && options.source !== "cloud_flush" && state.allowCloudProgressWrite !== true) {
    if (typeof appendAuditEvent === "function") {
      appendAuditEvent({ type: "progress:cloud_write_blocked_in_flash", message: "bookId=" + String(bookId || "") + " reason=" + String(options.reason || "") });
    }
    return saveProgressCursor(bookId, progress, { reason: options.reason || "blocked_cloud_progress_write", queue: true });
  }
  var sanitized = sanitizeProgressPayload(progress);
  var previous = loadProgress(bookId);
  if (sameProgressPosition(previous, sanitized)) {
    var preserved = { ...sanitized };
    if (previous.updatedAt) preserved.updatedAt = previous.updatedAt;
    return saveJson(progressKey(bookId), preserved);
  }
  var saved = saveJson(progressKey(bookId), sanitized);
  if (!saved) return false;
  if (touch) {
    touchLocalSync();
    onLocalDataChanged("progress");
  }
  return true;
}


function loadUnknownProgress(bookId, scope = currentUnknownScope()) {
  return sanitizeProgressPayload(loadJson(unknownProgressKey(bookId, scope), { lastWordId: null }), { priority: "snapshot" });
}


function saveUnknownProgress(bookId, scope, progress, _ref) {
  var options = _ref || {};
  var touch = options.touch !== false;
  if (touch && state.view === "flash" && options.source !== "cloud_flush" && state.allowCloudProgressWrite !== true) {
    if (typeof appendAuditEvent === "function") {
      appendAuditEvent({ type: "unknown_progress:cloud_write_blocked_in_flash", message: "bookId=" + String(bookId || "") + " scope=" + String(scope && scope.scope || "") + " unit=" + String(scope && scope.unit || "") + " reason=" + String(options.reason || "") });
    }
    return saveUnknownProgressCursor(bookId, scope || currentUnknownScope(), progress, { reason: options.reason || "blocked_cloud_unknown_progress_write", queue: true });
  }
  var sanitized = sanitizeProgressPayload(progress);
  var previous = loadUnknownProgress(bookId, scope);
  if (sameProgressPosition(previous, sanitized)) {
    var preserved = { ...sanitized };
    if (previous.updatedAt) preserved.updatedAt = previous.updatedAt;
    return saveJson(unknownProgressKey(bookId, scope), preserved);
  }
  var saved = saveJson(unknownProgressKey(bookId, scope), sanitized);
  if (!saved) return false;
  if (touch) {
    touchLocalSync();
    onLocalDataChanged("unknownProgress");
  }
  return true;
}

/* ===== 05b-storage-marks.js ===== */
"use strict";

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
  var states = updateStates ? deriveMarkStatesFromMarks(bookId, sanitized) : null;
  if (states && !saveJson(markStatesKey(bookId), states)) return false;
  var saved = saveJson(marksKey(bookId), sanitized);
  if (!saved && !states) return false;
  if (touch && (saved || states)) touchLocalSync();
  return saved || Boolean(states);
}


function sanitizeMarkStateItem(item) {
  var source = isPlainObject(item) ? item : {};
  var value = source.value === "known" || source.value === "unknown" || source.value === null
    ? source.value
    : null;
  var updatedAt = typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : "";
  var clientId = typeof source.clientId === "string" ? source.clientId : "";
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
  if (!saveJson(markStatesKey(bookId), sanitized)) return false;
  if (syncMarks) {
    var marks = deriveMarksFromMarkStates(sanitized);
    if (!saveJson(marksKey(bookId), marks) && typeof appendAuditEvent === "function") {
      appendAuditEvent({
        type: "storage:derived_marks_write_failed",
        message: "bookId=" + String(bookId || "") + " authoritativeMarkStatesSaved=true"
      });
    }
  }
  if (touch) touchLocalSync();
  return true;
}


function nextMarkLogicalUpdatedAt(markStates) {
  var maxSeen = Date.now();
  Object.keys(markStates || {}).forEach(function(wordId) {
    var parsed = Date.parse(markStates[wordId] && markStates[wordId].updatedAt || "");
    if (Number.isFinite(parsed)) maxSeen = Math.max(maxSeen, parsed + 1);
  });
  return beijingISOString(new Date(maxSeen));
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
  var now = nextMarkLogicalUpdatedAt(states);
  states[String(id)] = {
    value: value,
    updatedAt: now,
    clientId: meta.clientId,
    seq: seq
  };
  if (!saveMarkStates(bookId, states, { touch: touch, syncMarks: true })) return false;
  if (touch) onLocalDataChanged("mark");
  return true;
}

function setWordMarkStatesBatch(bookId, wordIds, value) {
  if (value !== "known" && value !== "unknown" && value !== null) return false;
  const ids = Array.from(new Set((Array.isArray(wordIds) ? wordIds : []).map(Number).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return false;
  const states = loadMarkStates(bookId);
  const meta = ensureSyncMeta(state.syncMeta);
  const originalSeq = Math.max(0, Number(meta.localSeq) || 0);
  let maxTimestamp = Date.now();
  Object.values(states).forEach((item) => {
    const parsed = Date.parse(item && item.updatedAt || "");
    if (Number.isFinite(parsed)) maxTimestamp = Math.max(maxTimestamp, parsed + 1);
  });
  ids.forEach((id, index) => {
    states[String(id)] = {
      value,
      updatedAt: beijingISOString(new Date(maxTimestamp + index)),
      clientId: meta.clientId,
      seq: originalSeq + index + 1
    };
  });
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.localSeq = originalSeq + ids.length;
  if (!persistSyncMeta()) {
    state.syncMeta.localSeq = originalSeq;
    return false;
  }
  // 序号先持久化再写标记：标记写入失败最多留下安全的序号空洞，不会在下次操作复用序号。
  if (!saveMarkStates(bookId, states, { touch: true, syncMarks: true })) return false;
  onLocalDataChanged("mark_batch");
  return true;
}

/* ===== 05c-storage-activity.js ===== */
"use strict";

function loadActivity(bookId) {
  const activity = loadJson(activityKey(bookId), { days: {} });
  return sanitizeActivityPayload(activity);
}


function saveActivity(bookId, activity, { touch = true } = {}) {
  const sanitized = sanitizeActivityPayload(activity);
  var saved = saveJson(activityKey(bookId), sanitized);
  if (!saved) return false;
  if (touch) touchLocalSync();
  return true;
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
  return saveJson(ACTIVITY_DRAFT_KEY, {
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
  if (!saveActivityDraftStore(store)) return false;
  state.activityDirtyPending = true;
  state.activityDraftPending = true;
  if (!wasPending && typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "sync:activity_draft_pending", message: "reason=" + String(reason || "") });
  }
  if (typeof updateSyncIndicator === "function") updateSyncIndicator();
  return true;
}


function restoreActivityDraftPending() {
  var store = loadActivityDraftStore();
  state.activityDirtyPending = store.pending === true;
  state.activityDraftPending = store.pending === true;
  return state.activityDirtyPending;
}


function clearActivityDraftPending() {
  var saved = saveActivityDraftStore({ byBook: {}, pending: false, reason: "" });
  if (saved) {
    state.activityDirtyPending = false;
    state.activityDraftPending = false;
  }
  return saved;
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
  var allSaved = true;
  Object.keys(store.byBook || {}).forEach(function(bookId) {
    var draft = sanitizeActivityPayload(store.byBook[bookId]);
    var cloud = loadActivity(bookId);
    if (stableStringifyHash(draft) !== stableStringifyHash(cloud)) {
      var saved = saveActivity(bookId, draft, { touch: false });
      allSaved = allSaved && saved !== false;
      changed = changed || saved === true;
    }
  });
  if (allSaved) clearActivityDraftPending();
  if (changed) {
    touchLocalSync();
    onLocalDataChanged("activity:" + String(reason || "flush"));
  }
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({
      type: "sync:flush_activity_for_cloud",
      message: "reason=" + String(reason || "") + " changed=" + String(changed) + " persisted=" + String(allSaved)
    });
  }
  if (typeof updateSyncIndicator === "function") updateSyncIndicator();
  return changed;
}

function loadUnitStats(bookId) {
  return sanitizeUnitStatsPayload(loadJson(unitStatsKey(bookId), { units: {} }), { priority: "snapshot" });
}


function saveUnitStats(bookId, stats, { touch = true } = {}) {
  const sanitized = sanitizeUnitStatsPayload(stats);
  var saved = saveJson(unitStatsKey(bookId), sanitized);
  if (!saved) return false;
  if (touch) touchLocalSync();
  return true;
}

/* ===== 05d-storage-settings.js ===== */
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
    manualZhReveal: typeof source.manualZhReveal === "boolean" ? source.manualZhReveal : DEFAULT_SETTINGS.manualZhReveal,
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
    autoSyncEnabled: typeof state.settings.autoSyncEnabled === "boolean"
      ? state.settings.autoSyncEnabled
      : DEFAULT_SETTINGS.autoSyncEnabled,
    bookId: book.id,
    bookSettings
  };
  persistSettings({ touch: false });
}

/* ===== 06-sync-runtime.js ===== */
"use strict";

function createSyncRequestError(message, details = {}) {
  const error = new Error(String(message || "网络请求失败"));
  error.name = details.name || "SyncRequestError";
  error.kind = details.kind || "network";
  error.stage = details.stage || "request";
  error.method = details.method || "GET";
  error.transport = details.transport || "fetch";
  error.timeoutMs = Number(details.timeoutMs) || 0;
  error.httpStatus = Number(details.httpStatus) || 0;
  error.urlHost = details.urlHost || "";
  error.rateLimited = details.rateLimited === true;
  error.retryAt = typeof details.retryAt === "string" ? details.retryAt : "";
  if (details.cause) error.cause = details.cause;
  return error;
}

function requestUrlHost(url) {
  try { return new URL(String(url), location.href).host; } catch (_) { return ""; }
}

function normalizeSyncRequestError(error, details = {}) {
  if (error && error.kind && error.stage) return error;
  return createSyncRequestError(error && error.message || "网络请求失败", {
    name: error && error.name || "SyncRequestError",
    kind: error && error.name === "AbortError" ? "timeout" : "network",
    stage: details.stage || "request",
    method: details.method || "GET",
    transport: details.transport || "fetch",
    timeoutMs: details.timeoutMs,
    urlHost: details.urlHost,
    cause: error
  });
}

function requestErrorTechnical(error) {
  if (!error) return "";
  return [
    "name=" + String(error.name || ""),
    "kind=" + String(error.kind || ""),
    "stage=" + String(error.stage || ""),
    "method=" + String(error.method || ""),
    "transport=" + String(error.transport || ""),
    "host=" + String(error.urlHost || ""),
    "timeoutMs=" + String(error.timeoutMs || 0),
    "httpStatus=" + String(error.httpStatus || 0),
    "rateLimited=" + String(error.rateLimited === true),
    "retryAt=" + String(error.retryAt || ""),
    "message=" + String(error.message || "")
  ].join("\n");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000, context = {}) {
  const controller = new AbortController();
  const method = String(options.method || "GET").toUpperCase();
  const stage = context.stage || "request";
  const transport = context.transport || "fetch";
  const urlHost = requestUrlHost(url);
  const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    const mergedOptions = {
      ...options,
      signal: controller.signal,
      cache: options.cache || "no-store"
    };
    return await fetch(url, mergedOptions);
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw createSyncRequestError("网络请求超时：" + (timeoutMs / 1000) + " 秒内没有响应", {
        name: "TimeoutError",
        kind: "timeout",
        stage,
        method,
        transport,
        timeoutMs,
        urlHost,
        cause: err
      });
    }
    throw normalizeSyncRequestError(err, { stage, method, transport, timeoutMs, urlHost });
  } finally {
    clearTimeout(timer);
  }
}

function isFetchNetworkFailure(error) {
  if (!error) return false;
  if (error.kind === "network" || error.kind === "timeout") return true;
  return error.name === "TypeError" && /Failed to fetch|NetworkError|Load failed/i.test(String(error.message || ""));
}

function fetchJsonp(url, timeoutMs = 15000, context = {}) {
  if (typeof document === "undefined" || !document.head) {
    return Promise.reject(createSyncRequestError("当前环境不支持 JSONP 回退", {
      kind: "unsupported",
      stage: context.stage || "jsonp",
      transport: "jsonp",
      timeoutMs,
      urlHost: requestUrlHost(url)
    }));
  }
  return new Promise(function(resolve, reject) {
    const callbackName = "__shua_jsonp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
    const script = document.createElement("script");
    let settled = false;
    let timer = 0;

    function cleanup() {
      if (timer) clearTimeout(timer);
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    function fail(message, kind, cause) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(createSyncRequestError(message, {
        kind: kind || "network",
        stage: context.stage || "jsonp",
        transport: "jsonp",
        timeoutMs,
        urlHost: requestUrlHost(url),
        cause
      }));
    }

    window[callbackName] = function(payload) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload || {});
    };

    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.onerror = function(event) { fail("JSONP 回退请求失败", "network", event); };
    const jsonpUrl = new URL(String(url), location.href);
    jsonpUrl.searchParams.set("callback", callbackName);
    script.src = jsonpUrl.toString();
    timer = setTimeout(function() { fail("JSONP 回退请求超时", "timeout"); }, timeoutMs);
    document.head.appendChild(script);
  });
}

var visibleSyncTimer = 0;

// ── runId 过期保护 ──────────────────────────────────────────────

function isStaleSyncRun(runId) {
  return runId !== undefined && runId !== null && state.syncRunId !== runId;
}


function readCrossTabSyncLock() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_LOCK_KEY) || "null");
  } catch (_) {
    return null;
  }
}


function isUrgentSyncReason(reason) {
  return [
    "active_study_idle_upload",
    "visibility_resume_dirty_flush",
    "visibility_resume",
    "pagehide_flush",
    "visibility_hidden_flush",
    "archive_open",
    "archive_tab_switch",
    "stats_open",
    "startup",
    "manual",
    "manual_push",
    "manual_pull",
    "manual_retry"
  ].indexOf(String(reason || "")) !== -1;
}

function isCrossTabSyncLockLikelyAbandoned(lock, now, reason) {
  if (!lock || lock.owner === TAB_ID) return false;
  var touchedAt = Math.max(Number(lock.renewedAt || 0), Number(lock.startedAt || 0));
  if (!touchedAt) return false;
  var noProgressMs = now - touchedAt;
  if (noProgressMs <= SYNC_NO_PROGRESS_TIMEOUT_MS) return false;
  // 真实活跃同步会通过 markSyncProgress() 续租；超过 watchdog 时间还无进展的外部锁视为遗留锁。
  return isUrgentSyncReason(reason) || noProgressMs > Math.min(CROSS_TAB_LOCK_LEASE_MS, SYNC_NO_PROGRESS_TIMEOUT_MS + 15000);
}

function tryAcquireCrossTabSyncLock(reason) {
  const now = Date.now();
  const existing = readCrossTabSyncLock();
  if (existing && existing.expiresAt && existing.expiresAt > now && existing.owner !== TAB_ID) {
    if (isCrossTabSyncLockLikelyAbandoned(existing, now, reason)) {
      try { localStorage.removeItem(SYNC_LOCK_KEY); } catch (_) {}
      appendAuditEvent({
        type: "sync:stale_cross_tab_lock_cleared",
        message:
          "session=" + TAB_ID +
          " reason=" + String(reason || "") +
          " owner=" + String(existing.owner || "") +
          " age=" + String(now - Math.max(Number(existing.renewedAt || 0), Number(existing.startedAt || 0)))
      });
    } else {
      return false;
    }
  }
  const lock = { owner: TAB_ID, startedAt: now, renewedAt: now, expiresAt: now + CROSS_TAB_LOCK_LEASE_MS, reason: reason || "" };
  safeLocalStorageSet(SYNC_LOCK_KEY, JSON.stringify(lock), { priority: "sync_lock" });
  const check = readCrossTabSyncLock();
  return Boolean(check && check.owner === TAB_ID);
}


function renewCrossTabSyncLock(reason) {
  const lock = readCrossTabSyncLock();
  if (!lock || lock.owner !== TAB_ID) return false;
  lock.expiresAt = Date.now() + CROSS_TAB_LOCK_LEASE_MS;
  lock.reason = reason || lock.reason || "";
  lock.renewedAt = Date.now();
  return safeLocalStorageSet(SYNC_LOCK_KEY, JSON.stringify(lock), { priority: "sync_lock" });
}


function releaseCrossTabSyncLock() {
  try {
    const lock = readCrossTabSyncLock();
    if (lock && lock.owner === TAB_ID) localStorage.removeItem(SYNC_LOCK_KEY);
  } catch (_) {}
}


function markSyncProgress(stage, runId) {
  if (isStaleSyncRun(runId)) return;
  state.syncLastProgressAt = Date.now();
  state.syncLastProgressStage = stage || "";
  renewCrossTabSyncLock(stage);
}


function releaseStuckSyncLockIfNeeded() {
  if (!state.isSyncing) return false;
  const base = state.syncLastProgressAt || state.syncStartedAt || 0;
  const noProgressMs = Date.now() - base;
  if (base && noProgressMs <= SYNC_NO_PROGRESS_TIMEOUT_MS) return false;
  state.isSyncing = false;
  state.syncStartedAt = 0;
  state.syncLastProgressAt = 0;
  state.syncRunId = ++state.syncRunSeq;
  releaseCrossTabSyncLock();
  var cleanForWatchdog = isCleanConfirmedSyncState();
  recordHashSyncFailure(
    cleanForWatchdog
      ? "本地数据和上次确认的云端数据一致。刚才一轮后台同步检查卡住，系统已自动解除同步锁，后续会继续自动检查。"
      : "同步流程超过 " + Math.round(SYNC_NO_PROGRESS_TIMEOUT_MS / 1000) + " 秒没有进展，已自动解除同步锁。本地数据未丢失。",
    {
      errorKind: "sync_watchdog_timeout",
      banner: !cleanForWatchdog && state.view === "setup",
      dialog: false,
      severity: cleanForWatchdog ? "warning" : "error",
      title: cleanForWatchdog ? "同步检查超时" : undefined,
      technical: "lastStage=" + (state.syncLastProgressStage || "")
    }
  );
  refreshVisibleSyncDiagnostics();
  return true;
}

// ── PATCH 事务锁（仅页面内存级，不替代 cross-tab lock）─────────────
// 仅用于同一页面会话内防止并发 PATCH。
// 多设备冲突仍依赖 remote hash / verify / merge 处理。
var activePatchTransaction = null;

function hasActivePatchTransaction() {
  return Boolean(activePatchTransaction);
}

function beginPatchTransaction(runId, reason) {
  if (activePatchTransaction) return false;
  activePatchTransaction = { runId: runId, reason: reason || "", startedAt: Date.now() };
  return true;
}

function endPatchTransaction(runId) {
  if (!activePatchTransaction) return;
  if (String(activePatchTransaction.runId) !== String(runId)) return;
  activePatchTransaction = null;
}

// ── 同步失败短横幅 ─────────────────────────────────────────────────

function backoffDelayForFailure(count) {
  const n = Math.max(0, Number(count) || 0);
  const steps = Array.isArray(SYNC_BACKOFF_STEPS_MS) && SYNC_BACKOFF_STEPS_MS.length
    ? SYNC_BACKOFF_STEPS_MS
    : [30000, 60000, 120000, 300000, 900000, 1800000];
  const base = Number(steps[Math.min(n, steps.length - 1)]) || 30000;
  const jitter = Math.floor(base * (0.05 + Math.random() * 0.1));
  return base + jitter;
}


function shouldMarkDirtyOnFailure(errorKind, facts) {
  const syncState = ensureHashSyncState(state.syncHashState);
  const alreadyDirty = syncState.localDirty === true;
  const localHasData = hasBusinessData(facts && facts.payload);
  const hasBase = Boolean(syncState.baseRemoteHash);
  const hashDiffersFromBase = hasBase && facts && facts.localPayloadHash !== syncState.baseRemoteHash;
  if (alreadyDirty) return true;
  if (["patch_failed", "verify_failed", "merge_failed", "readonly_with_local_changes", "preflight_remote_changed", "local_changed_during_verify", "local_apply_verify_failed"].indexOf(errorKind) !== -1) return localHasData;
  if (["config_invalid", "remote_get_failed", "version_check_failed", "recovery_required", "empty_local_empty_remote", "sync_watchdog_timeout"].indexOf(errorKind) !== -1) return false;
  return localHasData && hashDiffersFromBase;
}

/* ===== 07-sync-diagnostics-ui.js ===== */
"use strict";

function showSyncFailureBanner(title, detail, options) {
  if (isStaleSyncRun(options && options.runId)) return;
  var now = Date.now();
  var key = (title || "") + "|" + (detail || "");
  // 相同错误 60s 内不重复
  if (key === state.lastSyncBannerKey && now - state.lastSyncBannerAt < 60000) return;
  state.lastSyncBannerKey = key;
  state.lastSyncBannerAt = now;

  var banner = document.getElementById("sync-failure-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "sync-failure-banner";
    banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#b42318;color:#fff;padding:10px 16px;font-size:14px;line-height:1.5;text-align:center;transform:translateY(-100%);transition:transform 0.25s ease;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
    banner.innerHTML = '<span class="sync-failure-title" style="font-weight:700;"></span><span class="sync-failure-detail" style="margin-left:8px;opacity:0.85;"></span>';
    document.body.appendChild(banner);
  }
  banner.querySelector(".sync-failure-title").textContent = title || "同步失败";
  banner.querySelector(".sync-failure-detail").textContent = detail ? String(detail).slice(0, 160) : "请检查网络、Token 或 Gist 权限。";
  banner.style.transform = "translateY(0)";
  setTimeout(function() {
    banner.style.transform = "translateY(-100%)";
  }, (options && options.durationMs) || 2200);
}

function makeSyncProblemKey(problem) {
  return [problem.severity || "", problem.code || "", problem.title || "", problem.message || ""].join("|").slice(0, 500);
}


function maskTokenForDiagnosis(token) {
  const t = String(token || "").trim();
  if (!t) return "未设置";
  const prefix = t.startsWith("github_pat_") ? "github_pat" : (t.slice(0, 4) === "ghp_" ? "ghp" : "unknown");
  const bucket = t.length < 40 ? "<40" : (t.length <= 80 ? "40-80" : (t.length <= 120 ? "80-120" : ">120"));
  return prefix + " · 长度 " + bucket + " · 末四位 " + t.slice(-4);
}


function maskGistId(gistId) {
  const g = String(gistId || "").trim();
  return g ? g.slice(0, 4) + "…" + g.slice(-4) : "未设置";
}


function backupCandidateSummaryText(candidates) {
  const list = Array.isArray(candidates) ? candidates : (typeof collectBackupCandidates === "function" ? collectBackupCandidates().map(function(item) { return classifyBackupCandidate(item.key, item.raw, item.meta); }) : []);
  if (!list.length) return "无";
  return list.slice(0, 8).map(function(c) {
    return [c.kind || "?", c.key || "?", c.nonEmpty ? "nonEmpty" : "empty", c.reason || ""].filter(Boolean).join(" ");
  }).join("；");
}


function buildSyncDiagnosisText(extra = {}) {
  const meta = ensureSyncMeta(state.syncMeta);
  const syncState = ensureHashSyncState(state.syncHashState);
  const facts = currentSyncFacts({ persistHash: false });
  const info = computeSyncStatus();
  const config = validateSavedCloudConfig(state.cloud);
  const versionInfo = state.versionInfo || {};
  const lines = [];
  lines.push("刷词机同步诊断摘要");
  lines.push("================================");
  lines.push("导出时间：" + beijingISOString());
  lines.push("应用版本：" + APP_VERSION);
  lines.push("Build ID：" + APP_BUILD_ID);
  lines.push("服务器 version.json：" + (versionInfo.serverVersion || "未检查") + (versionInfo.serverBuildId ? " / " + versionInfo.serverBuildId : ""));
  lines.push("最近版本检查时间：" + (versionInfo.checkedAt || "无"));
  lines.push("页面地址：" + (location && location.href || ""));
  lines.push("User Agent：" + (navigator && navigator.userAgent || ""));
  lines.push("浏览器在线状态：" + (typeof navigator !== "undefined" && navigator.onLine === false ? "离线" : "在线/未知"));
  lines.push("同步状态：" + info.status + " - " + (info.detail || ""));
  lines.push("syncRunId：" + state.syncRunId);
  lines.push("syncRunSeq：" + state.syncRunSeq);
  lines.push("syncStartedAt：" + (state.syncStartedAt ? beijingISOString(new Date(state.syncStartedAt)) : "无"));
  lines.push("syncLastProgressStage：" + (state.syncLastProgressStage || "无"));
  lines.push("当前是否同步中：" + (state.isSyncing ? "是" : "否"));
  lines.push("Gist ID：" + maskGistId(state.cloud.gistId));
  lines.push("PAT 格式：" + (config.ok ? "通过" : "失败：" + config.errors.join("；")));
  lines.push("PAT 脱敏：" + maskTokenForDiagnosis(state.cloud.token));
  lines.push("云端可读：" + (meta.lastRemoteVersion || meta.lastRemoteUpdatedAt ? "是" : "未确认"));
  lines.push("云端可写：" + (meta.cloudWritable ? "是" : "未验证"));
  lines.push("只读模式：" + (meta.readOnlyMode ? "是" : "否"));
  lines.push("localRecoveryRequired：" + syncState.localRecoveryRequired);
  lines.push("localDirty：" + syncState.localDirty);
  lines.push("effectiveDirty：" + facts.effectiveDirty);
  lines.push("baseRemoteHash：" + (syncState.baseRemoteHash || "无"));
  lines.push("localPayloadHash：" + (facts.localPayloadHash || "无"));
  lines.push("dirtySince：" + (syncState.dirtySince || "无"));
  lines.push("最近成功 Push：" + (syncState.lastSuccessfulPushAt || meta.lastSuccessfulPushAt || "无"));
  lines.push("最近成功 Pull：" + (syncState.lastSuccessfulPullAt || meta.lastSuccessfulPullAt || "无"));
  lines.push("最近尝试同步：" + (meta.lastSyncAttemptAt || "无"));
  lines.push("最近错误时间：" + (meta.lastSyncErrorAt || "无"));
  lines.push("最近错误全文：" + (syncState.lastSyncError || meta.lastSyncErrorMessage || "无"));
  lines.push("最近错误类型：" + (syncState.lastErrorKind || "无"));
  lines.push("最近错误阶段：" + (syncState.lastErrorStage || "无"));
  lines.push("最近请求方式：" + (syncState.lastErrorTransport || "无"));
  lines.push("最近 HTTP 状态：" + String(syncState.lastErrorHttpStatus || 0));
  lines.push("最近技术细节：" + (syncState.lastErrorTechnical || "无"));
  lines.push("连续失败次数：" + String(syncState.consecutiveSyncFailures || 0));
  lines.push("下次自动重试：" + (syncState.nextRetryAt || "无"));
  lines.push("lastRemoteVersion：" + (meta.lastRemoteVersion || "无"));
  lines.push("lastSyncedPayloadHash：" + (meta.lastSyncedPayloadHash || "无"));
  lines.push("备份索引数量：" + loadHashBackupIndex().length);
  lines.push("备份候选摘要：" + backupCandidateSummaryText(extra.candidates));
  lines.push("当前业务数据摘要：progress=" + countProgressRecords(facts.payload) + ", marks=" + countMarkedRecords(facts.payload) + ", activityDays=" + countActivityRecords(facts.payload) + ", studyState=" + countUserStudyStateRecords(facts.payload));
  lines.push("APP_VERSION=" + APP_VERSION);
  lines.push("APP_BUILD_ID=" + APP_BUILD_ID);
  if (Object.prototype.hasOwnProperty.call(extra, "runId")) lines.push("runId=" + String(extra.runId || ""));
  if (Object.prototype.hasOwnProperty.call(extra, "remoteKind")) lines.push("remote.kind=" + String(extra.remoteKind || ""));
  if (Object.prototype.hasOwnProperty.call(extra, "remoteHash")) lines.push("remoteHash=" + String(extra.remoteHash || ""));
  if (Object.prototype.hasOwnProperty.call(extra, "localHasBusinessData")) lines.push("localHasBusinessData=" + String(extra.localHasBusinessData === true));
  if (Object.prototype.hasOwnProperty.call(extra, "remoteHasBusinessData")) lines.push("remoteHasBusinessData=" + String(extra.remoteHasBusinessData === true));
  if (Object.prototype.hasOwnProperty.call(extra, "baseRemoteHash")) lines.push("baseRemoteHash=" + String(extra.baseRemoteHash || ""));
  if (Object.prototype.hasOwnProperty.call(extra, "localPayloadHash")) lines.push("localPayloadHash=" + String(extra.localPayloadHash || ""));
  if (Object.prototype.hasOwnProperty.call(extra, "localDirty")) lines.push("localDirty=" + String(extra.localDirty === true));
  if (Object.prototype.hasOwnProperty.call(extra, "effectiveDirty")) lines.push("effectiveDirty=" + String(extra.effectiveDirty === true));
  if (Object.prototype.hasOwnProperty.call(extra, "readOnly")) lines.push("readOnly=" + String(extra.readOnly === true));
  if (extra.remoteSummary) lines.push("云端数据摘要：" + extra.remoteSummary);
  if (extra.code) lines.push("错误代码：" + extra.code);
  if (extra.technical) lines.push("技术细节：" + extra.technical);
  // 最近 5 条审计事件
  try {
    var auditStore = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var recentEvents = (Array.isArray(auditStore.events) ? auditStore.events : []).slice(-5);
    if (recentEvents.length) {
      lines.push("---最近审计事件---");
      recentEvents.forEach(function(ev) {
        lines.push("[" + (ev.at || "") + "] " + (ev.type || "") + " | " + String(ev.message || "").slice(0, 200));
      });
    }
  } catch (_) {}
  return lines.join("\n");
}


function showSyncProblemDialog(problem) {
  problem = problem || {};
  if (isStaleSyncRun(problem.runId)) return false;
  const key = makeSyncProblemKey(problem);
  const now = Date.now();
  if (state.activeSyncProblemDialogKey === key) return false;
  if (state.dismissedSyncProblemDialogKeys && state.dismissedSyncProblemDialogKeys[key] && now - state.dismissedSyncProblemDialogKeys[key] < 60000 && !problem.force) return false;
  state.activeSyncProblemDialogKey = key;
  state.activeSyncProblemDialogProblem = { code: problem.code || "", severity: problem.severity || "", title: problem.title || "", message: problem.message || "", shownAt: now };
  state.lastSyncProblemDialogKey = key;
  state.lastSyncProblemDialogShownAt = now;
  var existing = document.getElementById("sync-problem-dialog");
  if (existing) existing.remove();
  var dialog = document.createElement("div");
  dialog.id = "sync-problem-dialog";
  dialog.className = "sync-problem-dialog";
  var diagnosis = buildSyncDiagnosisText({
    code: problem.code,
    technical: problem.technical,
    candidates: problem.candidates,
    remoteSummary: problem.remoteSummary,
    remoteKind: problem.remoteKind,
    remoteHash: problem.remoteHash,
    localHasBusinessData: problem.localHasBusinessData,
    remoteHasBusinessData: problem.remoteHasBusinessData,
    baseRemoteHash: problem.baseRemoteHash,
    localPayloadHash: problem.localPayloadHash,
    localDirty: problem.localDirty,
    effectiveDirty: problem.effectiveDirty,
    readOnly: problem.readOnly,
    runId: problem.runId
  });
  dialog.innerHTML = `
    <div class="sync-problem-dialog__panel" role="dialog" aria-modal="true">
      <div class="sync-problem-dialog__header">
        <strong>${escapeHtml(problem.title || "同步出现问题")}</strong>
        <span style="color:${problem.severity === 'warning' ? '#ea580c' : '#b42318'}">${escapeHtml(problem.code || problem.severity || "SYNC_PROBLEM")}</span>
      </div>
      <div class="sync-problem-dialog__body">
        <p>${escapeHtml(problem.message || "同步未能完成。为避免数据风险，当前不会显示云端已保存。")}</p>
        ${problem.technical ? `<pre>${escapeHtml(String(problem.technical)).slice(0, 1200)}</pre>` : ""}
        <textarea readonly>${escapeHtml(diagnosis)}</textarea>
      </div>
      <div class="sync-problem-dialog__actions">
        <button class="btn btn--ghost" data-sync-dialog-action="copy" type="button">复制诊断信息</button>
        <button class="btn btn--ghost" data-sync-dialog-action="export_log" type="button">导出完整日志</button>
        <button class="btn btn--ghost" data-sync-dialog-action="retry" type="button">重新同步一次</button>
        <button class="btn btn--ghost" data-sync-dialog-action="rescue" type="button">打开 rescue.html</button>
        ${problem.refreshVersion ? '<button class="btn btn--primary" data-sync-dialog-action="refresh" type="button">刷新到新版</button>' : ""}
        ${problem.allowRemoteRestore ? '<button class="btn btn--primary" data-sync-dialog-action="remote_restore" type="button">从云端恢复到本机</button>' : ""}
        ${problem.allowIgnoreEmptyBackup ? '<button class="btn btn--ghost" data-sync-dialog-action="ignore_empty_backup" type="button">忽略空备份并继续同步</button>' : ""}
        <button class="btn btn--primary" data-sync-dialog-action="dismiss" type="button">知道了</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener("click", function(event) {
    const action = event.target && event.target.getAttribute && event.target.getAttribute("data-sync-dialog-action");
    if (!action) return;
    if (action === "copy") copyTextToClipboard(diagnosis).catch(function() {});
    if (action === "export_log") {
      if (typeof window.exportAuditLog === "function") {
        window.exportAuditLog();
      } else {
        alert("日志导出函数未加载，请刷新页面后重试。");
      }
    }
    if (action === "retry") {
      state.dismissedSyncProblemDialogKeys[key] = 0;
      closeSyncProblemDialog(key);
      syncTick({ reason: "manual_retry", bypassBackoff: true });
    }
    if (action === "rescue") window.open("rescue.html", "_blank");
    if (action === "refresh") refreshToServerVersion(problem.serverVersion || (state.versionInfo && state.versionInfo.serverVersion) || APP_VERSION);
    if (action === "remote_restore" && problem.remotePayload && problem.remoteHash) {
      closeSyncProblemDialog(key);
      restoreRemotePayloadFromDialog(problem.remotePayload, problem.remoteHash, problem.remote || null);
    }
    if (action === "ignore_empty_backup") {
      clearLocalRecoveryLock("用户确认忽略空备份并继续同步");
      closeSyncProblemDialog(key);
      syncTick({ reason: "ignore_empty_backup", bypassBackoff: true });
    }
    if (action === "dismiss") closeSyncProblemDialog(key);
  });
  return true;
}


function closeSyncProblemDialog(key) {
  var dialog = document.getElementById("sync-problem-dialog");
  if (dialog) dialog.remove();
  if (key) state.dismissedSyncProblemDialogKeys[key] = Date.now();
  state.activeSyncProblemDialogKey = null;
  state.activeSyncProblemDialogProblem = null;
}

function isRecoverableSyncProblemCode(code) {
  return [
    "REMOTE_EMPTY_LOCAL_HAS_DATA",
    "READONLY_REMOTE_EMPTY_LOCAL_HAS_DATA",
    "patch_failed_network",
    "remote_get_failed",
    "verify_failed",
    "SYNC_BACKGROUND_DEFERRED"
  ].indexOf(String(code || "")) !== -1;
}

function closeRecoverableSyncProblemDialogAfterClean() {
  var problem = state.activeSyncProblemDialogProblem || {};
  var code = problem.code || "";
  if (!code || !isRecoverableSyncProblemCode(code)) return false;
  closeSyncProblemDialog(state.activeSyncProblemDialogKey);
  appendAuditEvent({ type: "sync:recoverable_dialog_closed_after_clean", message: "session=" + TAB_ID + " code=" + String(code || "") });
  return true;
}

function renderSyncIndicator() {
  // 指示器由 updateSyncIndicatorDOM() 管理，挂载在 document.body 上
  // 这里只触发一次 DOM 创建，后续 render 视图时指示器不受 #app overflow:hidden 影响
  updateSyncIndicator();
  return "";
}


function formatSyncTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch (_) { return ""; }
}


function setSyncStatus(status) {
  // 只有 syncing 是临时状态，其他都是持久事实状态
  // 此函数仅供 syncing 状态使用；其他状态由 updateSyncIndicator() 通过 computeSyncStatus() 管理
  if (status === "syncing") {
    state.syncStatus = "syncing";
    updateSyncIndicatorDOM({ status: "syncing", detail: "" });
    return;
  }
  // 其他状态一律通过 updateSyncIndicator() 计算
  updateSyncIndicator();
}


function auditSyncStatusRender(info) {
  try {
    var syncState = ensureHashSyncState(state.syncHashState);
    var key = [
      info && info.status || "",
      info && info.detail || "",
      syncState.localDirty === true,
      syncState.lastSyncStatus || "",
      syncState.lastBlockingErrorCode || "",
      state.lastDirtyReason || ""
    ].join("|");
    var now = Date.now();
    // 同一状态一分钟内只记一次；状态真正变化时仍立即记录，避免诊断日志被渲染噪声淹没。
    if (state.lastStatusRenderAuditKey === key && now - Number(state.lastStatusRenderAuditAt || 0) < 60000) return;
    state.lastStatusRenderAuditKey = key;
    state.lastStatusRenderAuditAt = now;
    appendAuditEvent({
      type: "sync:status_render",
      message:
        "status=" + String(info && info.status || "") +
        " detail=" + String(info && info.detail || "") +
        " view=" + String(state.view || "") +
        " localDirty=" + String(!!syncState.localDirty) +
        " localHash=" + String(syncState.localPayloadHash || "").slice(0, 8) +
        " baseHash=" + String(syncState.baseRemoteHash || "").slice(0, 8) +
        " latestRemoteHashSeen=" + String(state.latestRemoteHashSeen || "").slice(0, 8) +
        " lastSyncStatus=" + String(syncState.lastSyncStatus || "") +
        " lastDirtyReason=" + String(state.lastDirtyReason || "") +
        " pendingProgressSync=" + String(typeof hasPendingProgressSync === "function" && hasPendingProgressSync()) +
        " activityDirtyPending=" + String(typeof hasPendingActivityDraft === "function" && hasPendingActivityDraft()) +
        " lastStudyActivityAgo=" + String((typeof lastActiveStudyAt === "function" && lastActiveStudyAt()) ? Date.now() - Number(lastActiveStudyAt()) : -1) +
        " playbackActive=" + String(typeof isFlashPlaybackActive === "function" && isFlashPlaybackActive()) +
        " studyMoving=" + String(typeof isStudyMoving === "function" && isStudyMoving()) +
        " transitioning=" + String(!!state.transitioning) +
        " speechSpeaking=" + String(typeof isSpeechSpeakingNow === "function" && isSpeechSpeakingNow()) +
        " timersActive=" + String(Array.isArray(state.timers) && state.timers.length > 0) +
        " indicatorClass=is-" + String(info && info.status || "") +
        " blockingCode=" + String(syncState.lastBlockingErrorCode || "") +
        " hashSchema=" + String(syncState.businessHashSchemaVersion || "") +
        " schemaNeedsRemoteCheck=" + String(!!syncState.hashSchemaNeedsRemoteCheck)
    });
  } catch (_) {}
}


function updateSyncIndicator() {
  const info = computeSyncStatus();
  state.syncStatus = info.status;
  if (typeof auditSyncStatusRender === "function") auditSyncStatusRender(info);
  updateSyncIndicatorDOM(info);
}


function updateSyncIndicatorDOM(info) {
  const label = SYNC_STATUS_LABELS[info.status] || "";
  const color = SYNC_STATUS_COLORS[info.status] || "#94a3b8";
  const isCloudSavedStatus = info.status === "cloud_saved" || info.status === "cloud_ok";
  const timeText = isCloudSavedStatus && state.syncMeta.lastCloudSaveConfirmedAt
    ? formatSyncTime(state.syncMeta.lastCloudSaveConfirmedAt)
    : "";
  var indicator = document.getElementById("cloudSyncIndicator");
  // 确保指示器挂在 body 上，不被 #app 的 overflow:hidden 裁剪
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "cloudSyncIndicator";
    indicator.innerHTML = '<span class="cloud-sync-indicator__dot"></span><span class="cloud-sync-indicator__label"></span><span class="cloud-sync-indicator__time"></span>';
    document.body.appendChild(indicator);
  }
  indicator.className = "cloud-sync-indicator is-" + info.status;
  indicator.style.setProperty("--sync-color", color);
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.setAttribute("aria-label", label + (info.detail ? "：" + info.detail : ""));
  indicator.title = label + (info.detail ? "：" + info.detail : "");
  indicator.onclick = function() {
    var setupBox = document.querySelector("[data-cloud-sync-diagnostics]");
    if (setupBox) {
      setupBox.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (typeof showSyncProblemDialog === "function") {
      showSyncProblemDialog({
        severity: info.status === "error" || info.status === "conflict" ? "error" : "info",
        code: "SYNC_STATUS_DETAILS",
        title: label || "云同步状态",
        message: info.detail || "本地数据已保存。",
        technical: buildSyncDiagnosisText(),
        canCopy: true,
        canRetry: info.status !== "cloud_ok" && info.status !== "cloud_saved"
      });
    }
  };
  var dot = indicator.querySelector(".cloud-sync-indicator__dot");
  if (dot) dot.style.backgroundColor = color;
  var labelEl = indicator.querySelector(".cloud-sync-indicator__label");
  if (labelEl) labelEl.textContent = label;
  var timeEl = indicator.querySelector(".cloud-sync-indicator__time");
  if (timeEl) {
    if (timeText) { timeEl.textContent = timeText; timeEl.style.display = ""; }
    else timeEl.style.display = "none";
  }
}


// ── 诊断 UI 防抖刷新 ─────────────────────────────────────────────────

var syncDiagnosticsRefreshTimer = 0;

function isEditingSetupField() {
  var el = document.activeElement;
  if (!el) return false;
  var tag = String(el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function refreshVisibleSyncDiagnostics() {
  updateSyncIndicator();
  if (state.view !== "setup") return;
  clearTimeout(syncDiagnosticsRefreshTimer);
  syncDiagnosticsRefreshTimer = setTimeout(function() {
    if (state.view !== "setup") return;
    if (typeof renderCloudSyncDiagnostics === "function") {
      renderCloudSyncDiagnostics();
      return;
    }
    if (typeof renderSetup === "function" && !isEditingSetupField()) {
      var sx = window.scrollX || 0;
      var sy = window.scrollY || 0;
      renderSetup();
      requestAnimationFrame(function() {
        window.scrollTo(sx, sy);
      });
    }
  }, 100);
}


function renderVersionBadge() {
  var badge = document.getElementById("app-version-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "app-version-badge";
    badge.className = "app-version-badge";
    document.body.appendChild(badge);
  }
  const info = state.versionInfo || {};
  const latest = !info.serverVersion || info.serverVersion === APP_VERSION;
  badge.textContent = "版本 " + APP_VERSION + " · " + (latest ? "最新" : "发现新版");
  badge.className = "app-version-badge" + (latest ? "" : " is-stale");
}


function refreshToServerVersion(serverVersion) {
  const version = serverVersion || APP_VERSION;
  location.href = location.pathname + "?app_v=" + encodeURIComponent(version) + "&reload=" + Date.now();
}

/* ===== 08a-sync-hash-core.js ===== */
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

/* ===== 08b-sync-hash-status.js ===== */
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

/* ===== 08c-sync-error-state.js ===== */
"use strict";

// ── session remote check ─────────────────────────────────────────

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

// ── blocking error ───────────────────────────────────────────────

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

// ── clean 状态判断（watchdog/网络错误不覆盖已确认的 cloud_ok/cloud_loaded）──

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

  // 非阻塞错误（watchdog/网络/版本检查）且数据已 clean 时，保持成功态
  var nonBlockingErrors = ["sync_watchdog_timeout", "remote_get_failed", "patch_result_unknown", "rate_limited", "patch_failed_http", "version_check_failed"];
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
      syncState.lastSyncStatus = "cloud_ok";
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
    // 只有真正 blocking 的错误才写 blocking error，retryable verify/network 不让红灯长驻。
    if (blockingFailure) {
      syncState.lastBlockingErrorAt = beijingISOString();
      syncState.lastBlockingErrorCode = options.errorKind || "SYNC_FAILED";
      syncState.lastBlockingErrorText = text;
    }
  }
  syncState.localPayloadHash = facts.localPayloadHash;
  syncState.lastErrorKind = String(options.errorKind || "unknown");
  syncState.lastErrorStage = String(options.stage || "");
  syncState.lastErrorTransport = String(options.transport || "");
  syncState.lastErrorHttpStatus = Math.max(0, Number(options.httpStatus) || 0);
  syncState.lastErrorTechnical = String(options.technical || "").slice(0, 3000);
  syncState.consecutiveSyncFailures += 1;
  var backoffAtMs = now.getTime() + backoffDelayForFailure(syncState.consecutiveSyncFailures - 1);
  var requestedRetryAtMs = Date.parse(options.nextRetryAt || "");
  if (Number.isFinite(requestedRetryAtMs) && requestedRetryAtMs > backoffAtMs) backoffAtMs = requestedRetryAtMs;
  syncState.nextRetryAt = beijingISOString(new Date(backoffAtMs));
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.lastSyncAttemptAt = beijingISOString(now);
  state.syncMeta.lastSyncErrorAt = beijingISOString();
  state.syncMeta.lastSyncErrorMessage = text;
  persistSyncMeta();
  persistHashSyncState();
  appendAuditEvent({ type: "sync:failed", message: "session=" + TAB_ID + " runId=" + (options.runId || "") + " errorKind=" + (options.errorKind || "unknown") + " stage=" + String(options.stage || "") + " transport=" + String(options.transport || "") + " " + text, httpStatus: options.httpStatus || 0 });
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

// ── Backup recovery ─────────────────────────────────────────────────

/* ===== 09a-sync-backups.js ===== */
"use strict";

function loadHashBackupIndex() {
  const store = loadJson(HASH_BACKUP_INDEX_KEY, { items: [] });
  return Array.isArray(store.items) ? store.items.filter(isPlainObject) : [];
}


function saveHashBackupIndex(items) {
  safeSetLocalStorage(HASH_BACKUP_INDEX_KEY, JSON.stringify({ items: Array.isArray(items) ? items.slice(-100) : [] }), { priority: "snapshot" });
}


function pruneOldHashBackups() {
  const items = loadHashBackupIndex()
    .filter(function(item) { return item && item.key; })
    .filter(function(item, index, array) { return array.findIndex(function(other) { return other.key === item.key; }) === index; });
  function timeValue(item) { return Date.parse(item.savedAt || "") || 0; }
  const existing = items.filter(function(item) { try { return Boolean(localStorage.getItem(item.key)); } catch (_) { return false; } });
  const nonEmpty = existing.filter(function(item) { return item.nonEmpty === true; }).sort(function(a, b) { return timeValue(b) - timeValue(a); });
  const preOverwrite = existing.filter(function(item) { return item.kind === "pre_overwrite"; }).sort(function(a, b) { return timeValue(b) - timeValue(a); });
  const startupEmpty = existing.filter(function(item) { return item.kind === "startup" && item.nonEmpty === false; }).sort(function(a, b) { return timeValue(b) - timeValue(a); }).slice(0, 3);
  const daily = existing.filter(function(item) { return /^daily/.test(item.kind || ""); }).sort(function(a, b) { return timeValue(b) - timeValue(a); }).slice(0, 10);
  const keep = [];
  function add(list) {
    list.forEach(function(item) {
      if (item && item.key && keep.findIndex(function(k) { return k.key === item.key; }) === -1) keep.push(item);
    });
  }
  add(preOverwrite.slice(0, 5));
  add(nonEmpty.slice(0, 5));
  add(daily);
  add(startupEmpty);
  add(existing.sort(function(a, b) { return timeValue(b) - timeValue(a); }));
  const finalKeep = keep.slice(0, 20).sort(function(a, b) { return timeValue(a) - timeValue(b); });
  const keepKeys = new Set(finalKeep.map(function(item) { return item.key; }));
  existing.forEach(function(item) {
    if (item.key && !keepKeys.has(item.key)) {
      try { localStorage.removeItem(item.key); } catch (_) {}
    }
  });
  saveHashBackupIndex(finalKeep);
}

function backupBundle(kind, payload, reason = "") {
  const normalized = normalizeSyncPayload(payload || collectSyncPayload());
  const progressCount = countProgressRecords(normalized);
  const marksCount = countMarkedRecords(normalized);
  const activityDayCount = countActivityRecords(normalized);
  const studyStateCount = countUserStudyStateRecords(normalized);
  return {
    kind,
    reason,
    savedAt: beijingISOString(),
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    nonEmpty: hasBusinessData(normalized),
    progressCount,
    marksCount,
    activityDayCount,
    studyStateCount,
    payloadHash: businessPayloadHash(normalized),
    payload: normalized,
    syncState: ensureHashSyncState(state.syncHashState),
    pendingOpsCount: getPendingOps().length
  };
}


function writeHashBackup(kind, payload = null, reason = "") {
  const timestamp = beijingISOString().replace(/[:.]/g, "-");
  const key = kind === "latest" ? `${HASH_BACKUP_PREFIX}latest` : `${HASH_BACKUP_PREFIX}${kind}:${timestamp}`;
  const bundle = backupBundle(kind, payload, reason);
  let ok = safeSetLocalStorage(key, JSON.stringify(bundle));
  if (!ok) {
    pruneOldHashBackups();
    ok = safeSetLocalStorage(key, JSON.stringify(bundle));
  }
  if (ok && kind !== "latest") {
    const items = loadHashBackupIndex();
    items.push({ key, kind, savedAt: bundle.savedAt, payloadHash: bundle.payloadHash, nonEmpty: bundle.nonEmpty, progressCount: bundle.progressCount, marksCount: bundle.marksCount, activityDayCount: bundle.activityDayCount, studyStateCount: bundle.studyStateCount });
    saveHashBackupIndex(items);
    pruneOldHashBackups();
  }
  return ok;
}


function writeDailyHashBackups(payload, reason = "") {
  const date = localDateKey();
  const latestKey = `${HASH_BACKUP_PREFIX}daily:${date}:latest`;
  const firstKey = `${HASH_BACKUP_PREFIX}daily:${date}:first_non_empty`;
  const bundle = backupBundle("daily", payload, reason);
  safeSetLocalStorage(latestKey, JSON.stringify(bundle));
  if (!localStorage.getItem(firstKey) && !isEffectivelyEmptyLocalPayload(bundle.payload)) {
    safeSetLocalStorage(firstKey, JSON.stringify({ ...bundle, kind: "daily:first_non_empty" }));
  }
}


function extractBusinessPayloadFromBackupObject(obj) {
  if (!obj || typeof obj !== "object") return null;
  const innerCandidates = [
    obj.payload,
    obj.snapshot,
    obj.data,
    obj.businessPayload,
    obj.syncPayload,
    obj.payload && obj.payload.payload,
    obj.snapshot && obj.snapshot.payload,
    obj
  ].filter(Boolean);
  for (var i = 0; i < innerCandidates.length; i += 1) {
    var item = innerCandidates[i];
    if (!item || typeof item !== "object") continue;
    if (item.progress || item.marks || item.markStates || item.activity || item.unitStats || item.settings || item.unknownProgress || item.unknown_progress) {
      return {
        settings: item.settings || {},
        progress: item.progress || {},
        unknownProgress: item.unknownProgress || item.unknown_progress || {},
        marks: item.marks || {},
        markStates: item.markStates || {},
        activity: item.activity || {},
        unitStats: item.unitStats || item.unit_stats || {},
        activeBookId: item.activeBookId || item.bookId || ""
      };
    }
  }
  return null;
}


function collectBackupCandidates() {
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 86400000));
  const keys = new Map();
  function add(key, meta) { if (key && !keys.has(key)) keys.set(key, meta || {}); }
  add(`${HASH_BACKUP_PREFIX}latest`, { kind: "latest" });
  add(`${HASH_BACKUP_PREFIX}daily:${today}:latest`, { kind: "daily" });
  add(`${HASH_BACKUP_PREFIX}daily:${today}:first_non_empty`, { kind: "daily:first_non_empty" });
  if (yesterday !== today) {
    add(`${HASH_BACKUP_PREFIX}daily:${yesterday}:latest`, { kind: "daily" });
    add(`${HASH_BACKUP_PREFIX}daily:${yesterday}:first_non_empty`, { kind: "daily:first_non_empty" });
  }
  loadHashBackupIndex().forEach(function(item) { if (item && item.key) add(item.key, item); });
  add(LOCAL_SNAPSHOT_KEY, { kind: "legacy_snapshot" });
  add(DAILY_BACKUP_PREFIX + today, { kind: "legacy_daily" });
  if (yesterday !== today) add(DAILY_BACKUP_PREFIX + yesterday, { kind: "legacy_daily" });
  const out = [];
  keys.forEach(function(meta, key) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_) { raw = null; }
    out.push({ key, raw, meta });
  });
  return out;
}


function classifyBackupCandidate(key, raw, meta = {}) {
  const base = {
    key,
    exists: raw !== null && raw !== undefined,
    parseOk: false,
    wrapperOk: false,
    payloadOk: false,
    validateOk: false,
    nonEmpty: false,
    payloadHash: "",
    savedAt: meta.savedAt || "",
    reason: "",
    payload: null,
    meta: meta || {},
    kind: "missing"
  };
  if (!base.exists) {
    base.reason = "missing";
    return base;
  }
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    base.parseOk = true;
  } catch (error) {
    base.reason = error && error.message || "JSON 解析失败";
    base.kind = meta && meta.nonEmpty === true ? "broken_high_confidence_nonempty" : "broken_unknown";
    return base;
  }
  if (!parsed || typeof parsed !== "object") {
    base.reason = "备份不是对象";
    base.kind = "invalid_shape";
    return base;
  }
  base.wrapperOk = true;
  base.savedAt = parsed.savedAt || parsed.timestamp || parsed.createdAt || base.savedAt || "";
  const extracted = extractBusinessPayloadFromBackupObject(parsed);
  if (!extracted) {
    base.reason = "未找到业务 payload";
    base.kind = "invalid_shape";
    return base;
  }
  base.payloadOk = true;
  let normalized;
  try {
    normalized = normalizeSyncPayload(extracted);
  } catch (error) {
    base.reason = error && error.message || "payload normalize 失败";
    base.kind = (parsed.nonEmpty === true || meta.nonEmpty === true) ? "broken_high_confidence_nonempty" : "invalid_payload";
    return base;
  }
  if (!validateSyncPayload(normalized)) {
    base.reason = "payload validate 失败";
    base.kind = (parsed.nonEmpty === true || meta.nonEmpty === true) ? "broken_high_confidence_nonempty" : "invalid_payload";
    return base;
  }
  base.validateOk = true;
  base.payload = normalized;
  base.payloadHash = businessPayloadHash(normalized);
  base.nonEmpty = hasBusinessData(normalized);
  base.kind = base.nonEmpty ? "valid_nonempty" : "valid_empty";
  base.reason = base.kind;
  return base;
}


function chooseBestBackup(candidates) {
  const list = (Array.isArray(candidates) ? candidates : []).slice();
  list.sort(function(a, b) {
    const score = function(c) {
      let s = 0;
      if (c.kind === "valid_nonempty") s += 1000;
      if (/pre_overwrite/.test(c.key || "")) s += 200;
      if (/first_non_empty/.test(c.key || "")) s += 150;
      if (/latest/.test(c.key || "")) s += 100;
      s += Date.parse(c.savedAt || "") || 0;
      return s;
    };
    return score(b) - score(a);
  });
  return list[0] || null;
}


function tryRestoreFromBackupIfPayloadEmpty(options = {}) {
  const currentPayload = normalizeSyncPayload(collectSyncPayload());
  if (hasBusinessData(currentPayload)) {
    clearLocalRecoveryLock("当前本地已有业务数据，不需要备份恢复", { runId: options.runId });
    return { status: "payload_has_data", candidates: [] };
  }

  const candidates = collectBackupCandidates().map(function(item) {
    return classifyBackupCandidate(item.key, item.raw, item.meta);
  });
  const validNonEmpty = candidates.filter(function(c) { return c.kind === "valid_nonempty"; });
  if (validNonEmpty.length > 0) {
    const best = chooseBestBackup(validNonEmpty);
    const ok = applyRemotePayloadSafely(best.payload, {
      source: "local_backup_restore",
      allowWhenLocalEmptyOnly: true,
      expectedHash: best.payloadHash,
      runId: options.runId,
      reason: "backup_restore:" + best.key
    });
    if (ok) {
      markHashDirty(best.payloadHash, "已从本地备份恢复，等待同步", { runId: options.runId });
      clearLocalRecoveryLock("已从有效非空本地备份恢复", { runId: options.runId });
      appendAuditEvent({ type: "backup:restored", message: "从 " + best.key + " 恢复" });
      return { status: "restored", source: best.key, candidates };
    }
    setLocalRecoveryRequired("存在有效非空备份，但应用到本地失败", candidates, { runId: options.runId });
    return { status: "restore_failed", candidates };
  }

  const highConfidenceBroken = candidates.some(function(c) { return c.kind === "broken_high_confidence_nonempty"; });
  if (highConfidenceBroken) {
    setLocalRecoveryRequired("存在疑似非空的损坏备份，需要人工处理", candidates, { runId: options.runId });
    return { status: "restore_failed", candidates };
  }

  const warning = candidates.some(function(c) { return c.kind === "broken_unknown" || c.kind === "invalid_shape" || c.kind === "invalid_payload"; });
  if (warning) {
    setLocalRecoveryWarning("存在不可自动恢复的备份，但未证明其包含非空业务数据", candidates, { runId: options.runId });
    clearLocalRecoveryLock("未发现高可信非空损坏备份，允许继续云同步", { runId: options.runId });
    return { status: "broken_backup_warning", candidates };
  }

  clearLocalRecoveryLock("只有空备份或没有备份，允许继续同步", { runId: options.runId });
  return { status: "no_nonempty_backup", candidates };
}

/* ===== 09b-sync-scheduler.js ===== */
"use strict";

function isAutoSyncEnabled() {
  return !state.settings || state.settings.autoSyncEnabled !== false;
}

function cancelAutomaticSyncTimers(reason) {
  if (state.autoPushDebounceTimer) {
    clearTimeout(state.autoPushDebounceTimer);
    state.autoPushDebounceTimer = null;
  }
  if (state.activeStudySyncTimer) {
    clearTimeout(state.activeStudySyncTimer);
    state.activeStudySyncTimer = null;
  }
  state.autoSyncDueAt = 0;
  state.autoSyncReason = "";
  state.pendingActiveStudyUpload = false;
}

function handleAutoSyncPreferenceChanged(enabled) {
  if (!enabled) {
    cancelAutomaticSyncTimers("user_disabled_auto_sync");
    var syncState = ensureHashSyncState(state.syncHashState);
    var facts;
    try { facts = currentSyncFacts({ persistHash: true }); }
    catch (_) { facts = { effectiveDirty: syncState.localDirty === true }; }
    if (facts.effectiveDirty) {
      syncState.lastSyncStatus = "dirty";
    } else if (!["cloud_ok", "cloud_saved", "cloud_loaded", "error", "conflict"].includes(syncState.lastSyncStatus)) {
      syncState.lastSyncStatus = "local_only";
    }
    syncState.nextRetryAt = "";
    persistHashSyncState();
    updateSyncIndicator();
    appendAuditEvent({ type: "sync:auto_disabled", message: "effectiveDirty=" + String(!!facts.effectiveDirty) });
    return;
  }
  appendAuditEvent({ type: "sync:auto_enabled", message: "schedule=true" });
  updateSyncIndicator();
  scheduleSyncSoon("auto_sync_enabled", 0);
}

function touchStudyActivity(reason = "study") {
  state.lastStudyActivityAt = Date.now();
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({
      type: "study:activity_touch",
      message:
        "reason=" + String(reason || "") +
        " view=" + String(state.view || "") +
        " index=" + String(state.currentIndex || 0)
    });
  }
}


function lastActiveStudyAt() {
  return Math.max(
    Number(state.lastUserStudyActionAt || 0),
    Number(state.lastStudyActivityAt || 0)
  );
}


function currentFlashWord() {
  return state.unitWords && state.unitWords[state.currentIndex] || null;
}


function isFlashPlaybackActive() {
  return Boolean(
    state.view === "flash" &&
    !state.archiveOpen &&
    !state.statsOpen &&
    currentFlashWord() &&
    state.settings &&
    state.settings.manualMode !== true &&
    state.playbackPaused !== true
  );
}


function isSpeechSpeakingNow() {
  try {
    return Boolean(typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.speaking);
  } catch (_) {
    return false;
  }
}


function isStudyMoving() {
  return Boolean(
    state.view === "flash" &&
    (
      isFlashPlaybackActive() ||
      state.transitioning === true ||
      Boolean(state.pointer) ||
      isSpeechSpeakingNow() ||
      (Array.isArray(state.timers) && state.timers.length > 0)
    )
  );
}


function pendingStudyFlushExists() {
  return Boolean(
    (typeof hasPendingProgressSync === "function" && hasPendingProgressSync()) ||
    (typeof hasPendingActivityDraft === "function" && hasPendingActivityDraft())
  );
}


function flushPendingStudyForBoundary(reason = "boundary") {
  var progressFlushed = typeof flushProgressForCloud === "function" ? flushProgressForCloud(reason) : false;
  var activityFlushed = typeof flushActivityForCloud === "function" ? flushActivityForCloud(reason) : false;
  return Boolean(progressFlushed || activityFlushed);
}


function shouldFlushPendingBeforeSync(reason) {
  return [
    "active_study_idle_upload",
    "manual",
    "manual_push",
    "manual_retry",
    "pagehide_flush",
    "visibility_hidden_flush",
    "visibility_resume_dirty_flush",
    "visibility_resume",
    "archive_open",
    "archive_tab_switch",
    "stats_open",
    "setup_open",
    "config_saved",
    "pause",
    "pause_background",
    "manual_pause"
  ].includes(String(reason || ""));
}


function preparePendingStudyFlushForSync(reason) {
  if (!shouldFlushPendingBeforeSync(reason)) return false;
  var changed = flushPendingStudyForBoundary(reason || "sync");
  if (changed && typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "sync:pending_study_flushed_before_facts", message: "reason=" + String(reason || "") });
  }
  return changed;
}

function shouldUseActiveStudyDebounce() {
  if (state.view !== "flash") return false;
  if (typeof getActiveStudyFacts === "function") {
    var facts = getActiveStudyFacts();
    return Boolean(facts.inFlash && (facts.withinIdleWindow || facts.studyMoving || facts.playbackActive || facts.timersActive || facts.speechSpeaking || facts.pointerActive || facts.transitioning));
  }
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  if (!last) return false;
  return Date.now() - last < ACTIVE_STUDY_SYNC_DEBOUNCE_MS || (typeof isStudyMoving === "function" && isStudyMoving());
}


function activeStudyIdleDelayMs(delayOverride) {
  if (Number.isFinite(Number(delayOverride)) && Number(delayOverride) >= 0) return Math.max(1000, Number(delayOverride));
  if (typeof activeStudyDelayRemainingMs === "function") return activeStudyDelayRemainingMs();
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  if (!last || state.view !== "flash") return ACTIVE_STUDY_SYNC_DEBOUNCE_MS;
  return Math.max(1000, ACTIVE_STUDY_SYNC_DEBOUNCE_MS - (Date.now() - last));
}


function activeStudySyncWorkExists() {
  var syncState = ensureHashSyncState(state.syncHashState);
  var localHash = String(syncState.localPayloadHash || "");
  var baseHash = String(syncState.baseRemoteHash || "");
  var hashDirty = Boolean(baseHash && localHash && localHash !== baseHash);
  return Boolean(syncState.localDirty || hashDirty || (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) || state.lastDirtyFromVerify);
}

function scheduleActiveStudyUpload(delayOverride) {
  if (!isAutoSyncEnabled()) {
    cancelAutomaticSyncTimers("active_study_auto_sync_disabled");
    updateSyncIndicator();
    return false;
  }
  if (!activeStudySyncWorkExists()) {
    state.pendingActiveStudyUpload = false;
    if (state.activeStudySyncTimer) {
      clearTimeout(state.activeStudySyncTimer);
      state.activeStudySyncTimer = null;
    }
    var now = Date.now();
    if (!state.lastActiveStudySkipCleanAuditAt || now - state.lastActiveStudySkipCleanAuditAt > 10000) {
      state.lastActiveStudySkipCleanAuditAt = now;
      appendAuditEvent({ type: "sync:active_study_idle_upload_skip_clean", message: "session=" + TAB_ID + " reason=no_dirty_or_pending" });
    }
    return false;
  }
  state.pendingActiveStudyUpload = true;
  if (state.activeStudySyncTimer) {
    clearTimeout(state.activeStudySyncTimer);
    state.activeStudySyncTimer = null;
  }
  var delay = activeStudyIdleDelayMs(delayOverride);
  state.activeStudySyncTimer = setTimeout(function() {
    state.activeStudySyncTimer = null;
    var hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    appendAuditEvent({ type: "sync:active_study_idle_upload", message: "session=" + TAB_ID + " hidden=" + String(!!hidden) + " delay=" + String(delay) });
    if (hidden) {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:active_study_idle_upload_deferred_hidden", message: "session=" + TAB_ID + " dirty_preserved=true wait=visibility_resume" });
      updateSyncIndicator();
      return;
    }
    Promise.resolve(syncTick({ reason: "active_study_idle_upload", keepalive: false })).then(function(result) {
      var syncState = ensureHashSyncState(state.syncHashState);
      if (result && syncState && !syncState.localDirty && !(typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) {
        state.pendingActiveStudyUpload = false;
      }
    }).catch(function(error) {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:active_study_idle_upload_deferred", message: "session=" + TAB_ID + " dirty_preserved=true error=" + String(error && error.message || error || "") });
    });
  }, delay);
}


function clearActiveStudyTimerIfClean() {
  var syncState = ensureHashSyncState(state.syncHashState);
  if (!syncState.localDirty && !pendingStudyFlushExists()) {
    state.pendingActiveStudyUpload = false;
    if (state.activeStudySyncTimer) {
      clearTimeout(state.activeStudySyncTimer);
      state.activeStudySyncTimer = null;
    }
    if (state.autoPushDebounceTimer) {
      clearTimeout(state.autoPushDebounceTimer);
      state.autoPushDebounceTimer = null;
    }
    appendAuditEvent({ type: "sync:pending_timers_cleared_after_clean", message: "session=" + TAB_ID });
  }
}


function markLocalDirtyLight(reason = "change") {
  if (state.applyingRemotePayload || state.suppressDirty) return;
  if (typeof auditLocalDirtySet === "function") auditLocalDirtySet(reason);
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localDirty = true;
  if (!state.syncHashState.dirtySince) state.syncHashState.dirtySince = beijingISOString();
  state.syncHashState.lastSyncStatus = "dirty";
  state.syncHashState.lastSyncError = "";
  state.syncHashState.lastSyncErrorAt = "";
  if (reason !== "local_changed_during_verify") {
    state.lastDirtyReason = state.view === "flash" ? "active_study" : String(reason || "change");
    state.lastDirtyFromVerify = false;
  }
  persistHashSyncState();
  updateSyncIndicator();
  if (state.view === "flash") {
    scheduleActiveStudyUpload();
  } else {
    scheduleSyncSoon("local_change", AUTO_PUSH_DEBOUNCE_MS);
  }
}


function markLocalDirtyAfterBusinessWrite(reason = "change") {
  if (state.applyingRemotePayload || state.suppressDirty) return;
  if (typeof auditLocalDirtySet === "function") auditLocalDirtySet(reason);
  if (shouldUseActiveStudyDebounce()) {
    markLocalDirtyLight(reason);
    return;
  }
  const local = refreshLocalPayloadHash({ persist: false });
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localPayloadHash = local.hash;
  state.syncHashState.localDirty = true;
  if (!state.syncHashState.dirtySince) state.syncHashState.dirtySince = beijingISOString();
  state.syncHashState.lastSyncStatus = "dirty";
  if (reason !== "local_changed_during_verify") {
    state.lastDirtyReason = shouldUseActiveStudyDebounce() ? "active_study" : String(reason || "change");
    state.lastDirtyFromVerify = false;
  }
  persistHashSyncState();
  try { writeLocalSnapshot(reason); } catch (error) { state.syncHashState.lastBackupError = error?.message || "本地快照写入失败"; persistHashSyncState(); }
  try { writeDailyBackup(reason); } catch (error) { state.syncHashState.lastBackupError = error?.message || "每日备份写入失败"; persistHashSyncState(); }
  writeHashBackup("latest", local.payload, reason);
  writeDailyHashBackups(local.payload, reason);
  updateSyncIndicator();
  if (shouldUseActiveStudyDebounce()) {
    scheduleActiveStudyUpload();
    return;
  }
  scheduleSyncSoon("local_change", AUTO_PUSH_DEBOUNCE_MS);
}


function syncRetryRemainingMs() {
  var nextRetryAt = ensureHashSyncState(state.syncHashState).nextRetryAt;
  var retryAtMs = Date.parse(nextRetryAt || "");
  if (!Number.isFinite(retryAtMs)) return 0;
  return Math.max(0, retryAtMs - Date.now());
}

function scheduleSyncSoon(reason = "local_change", delayMs = AUTO_PUSH_DEBOUNCE_MS) {
  reason = String(reason || "local_change");
  if (!isAutoSyncEnabled() && !isHardForcedSyncReason(reason)) {
    cancelAutomaticSyncTimers("schedule_blocked_" + reason);
    updateSyncIndicator();
    return false;
  }
  var delay = Math.max(0, Number(delayMs) || 0);
  var automatic = !isHardForcedSyncReason(reason);
  if (automatic) delay = Math.max(delay, syncRetryRemainingMs());

  var dueAt = Date.now() + delay;
  if (state.autoPushDebounceTimer && state.autoSyncDueAt && state.autoSyncDueAt <= dueAt) {
    return false;
  }
  if (state.autoPushDebounceTimer) clearTimeout(state.autoPushDebounceTimer);
  state.autoSyncDueAt = dueAt;
  state.autoSyncReason = reason;
  state.autoPushDebounceTimer = setTimeout(function() {
    state.autoPushDebounceTimer = null;
    state.autoSyncDueAt = 0;
    var queuedReason = state.autoSyncReason || reason;
    state.autoSyncReason = "";
    if (typeof document !== "undefined" && document.hidden) {
      state.pendingActiveStudyUpload = true;
      return;
    }
    syncTick({ reason: queuedReason });
  }, delay);
  return true;
}

function startSyncHeartbeat() {
  if (state.syncHeartbeatTimer) clearInterval(state.syncHeartbeatTimer);
  state.syncHeartbeatTimer = setInterval(function() {
    if (!isAutoSyncEnabled()) return;
    if (typeof document !== "undefined" && document.hidden) return;
    var gate = savedCloudConfigGate();
    if (!gate.ok) return;
    var syncState = ensureHashSyncState(state.syncHashState);
    var pollDue = !state.lastCleanRemotePollAt || Date.now() - state.lastCleanRemotePollAt >= SYNC_CLEAN_REMOTE_POLL_MS;
    if (!syncState.localDirty && !pollDue && !(typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) return;
    syncTick({ reason: "heartbeat" });
  }, SYNC_HEARTBEAT_MS);
}


function maybeRemindExport() {
  var meta = ensureSyncMeta(state.syncMeta);
  try {
    if ((meta.readOnlyMode || !meta.cloudWritable) && !sessionStorage.getItem("export_reminded")) {
      sessionStorage.setItem("export_reminded", "1");
    }
  } catch (_) {}
}


function onLocalDataChanged(reason) {
  reason = reason || "change";
  bumpLocalBusinessRevision(reason, { source: "user" });
  markLocalDirtyAfterBusinessWrite(reason);
  maybeRemindExport();
}

// ── 自动推送调度 ──────────────────────────────────────────────────────

/* ===== 09c-sync-audit.js ===== */
"use strict";

function writeLocalSnapshot(reason) {
  reason = reason || "change";
  var payload = normalizeSyncPayload(collectSyncPayload());
  safeLocalStorageSet(LOCAL_SNAPSHOT_KEY, JSON.stringify({
    reason: reason,
    savedAt: beijingISOString(),
    pendingOpsCount: getPendingOps().length,
    payload: payload
  }), { priority: "snapshot" });
}


function writeDailyBackup(reason) {
  reason = reason || "change";
  var date = localDateKey();
  var payload = normalizeSyncPayload(collectSyncPayload());
  var key = DAILY_BACKUP_PREFIX + date;
  var newHash = businessPayloadHash(payload);
  var stored = localStorage.getItem(key);
  var storedHash = "";
  if (stored) {
    try {
      var parsed = JSON.parse(stored);
      if (parsed && parsed.payload) storedHash = businessPayloadHash(parsed.payload);
    } catch (_) {}
  }
  if (newHash !== storedHash) {
    safeLocalStorageSet(key, JSON.stringify({
      reason: reason,
      savedAt: beijingISOString(),
      payloadHash: newHash,
      payload: payload
    }), { priority: "daily_backup" });
  }
}


// ── 审计日志 buffer ──────────────────────────────────────────────────
var auditBuffer = [];
var auditBufferTimer = 0;
var AUDIT_BUFFER_MAX = 50;
var AUDIT_FLUSH_INTERVAL_MS = 30000;
var AUDIT_EVENT_LIMIT = 500;

function isNoisyAuditType(type) {
  type = String(type || "");
  return type === "sync:status_render" ||
    type === "study:activity_touch" ||
    type === "sync:local_dirty_set" ||
    type.indexOf("sync:skip_") === 0 ||
    type.indexOf("sync:defer_") === 0;
}

function isBufferedAuditType(type) {
  type = String(type || "");
  return type === "user:mark" || type === "user:undo" || isNoisyAuditType(type);
}

function trimAuditEvents(events, limit) {
  var list = Array.isArray(events) ? events : [];
  var max = Math.max(50, Number(limit || AUDIT_EVENT_LIMIT));
  if (list.length <= max) return list;

  var indexed = list.map(function(entry, index) { return { entry: entry, index: index }; });
  var critical = indexed.filter(function(item) { return !isNoisyAuditType(item.entry && item.entry.type); });
  var noisy = indexed.filter(function(item) { return isNoisyAuditType(item.entry && item.entry.type); });
  var criticalKeep = Math.min(critical.length, Math.floor(max * 0.8));
  var noisyKeep = Math.min(noisy.length, max - criticalKeep);
  if (criticalKeep + noisyKeep < max) {
    criticalKeep = Math.min(critical.length, max - noisyKeep);
  }
  var selected = new Set();
  critical.slice(-criticalKeep).forEach(function(item) { selected.add(item.index); });
  noisy.slice(-noisyKeep).forEach(function(item) { selected.add(item.index); });
  return indexed.filter(function(item) { return selected.has(item.index); }).map(function(item) { return item.entry; });
}

function flushAuditBuffer() {
  clearTimeout(auditBufferTimer);
  auditBufferTimer = 0;
  if (!auditBuffer.length) return;
  try {
    var store = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var events = Array.isArray(store.events) ? store.events : [];
    var batch = auditBuffer.splice(0);
    events = trimAuditEvents(events.concat(batch), AUDIT_EVENT_LIMIT);
    saveJson(SYNC_AUDIT_KEY, { events: events });
  } catch (_) {
    // quota 满或解析失败，静默丢弃 buffer
    auditBuffer = [];
  }
}

function appendAuditEvent(event) {
  var isHighFreq = isBufferedAuditType(event.type);
  var entry = {
    at: beijingISOString(),
    type: event.type || "",
    message: event.message || "",
    httpStatus: event.httpStatus || 0
  };
  // 只对高频事件进 buffer，其他直接写入
  if (isHighFreq) {
    try {
      auditBuffer.push(entry);
      if (auditBuffer.length >= AUDIT_BUFFER_MAX) flushAuditBuffer();
      else if (!auditBufferTimer) auditBufferTimer = setTimeout(flushAuditBuffer, AUDIT_FLUSH_INTERVAL_MS);
    } catch (_) { /* 静默 */ }
    return;
  }
  try {
    var store = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var events = Array.isArray(store.events) ? store.events : [];
    events.push(entry);
    saveJson(SYNC_AUDIT_KEY, { events: trimAuditEvents(events, AUDIT_EVENT_LIMIT) });
  } catch (_) { /* quota 满静默 */ }
}

// 页面离开/隐藏时强制 flush
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushAuditBuffer);
  window.addEventListener("beforeunload", flushAuditBuffer);
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") flushAuditBuffer();
  });
}

/* ===== 10-version-service.js ===== */
"use strict";

async function checkServerVersion(options = {}) {
  try {
    const response = await fetchWithTimeout("version.json?_=" + Date.now(), { cache: "no-store" }, VERSION_CHECK_TIMEOUT_MS);
    if (!response.ok) throw new Error("version.json HTTP " + response.status);
    const info = await response.json();
    state.versionInfo = {
      status: info.appVersion === APP_VERSION ? "latest" : "stale",
      serverVersion: String(info.appVersion || ""),
      serverBuildId: String(info.buildId || ""),
      checkedAt: beijingISOString(),
      error: ""
    };
    renderVersionBadge();
    if (info.appVersion && info.appVersion !== APP_VERSION) {
      showSyncProblemDialog({
        severity: "warning",
        code: "APP_VERSION_STALE",
        title: "检测到网页新版",
        message: "当前运行版本：" + APP_VERSION + "；服务器发布版本：" + info.appVersion + "。请刷新到新版后再继续使用，旧版可能存在同步 bug。",
        refreshVersion: true,
        serverVersion: info.appVersion,
        force: options.force === true
      });
    }
    return state.versionInfo;
  } catch (error) {
    state.versionInfo = { ...(state.versionInfo || {}), status: "error", checkedAt: beijingISOString(), error: error && error.message || String(error) };
    renderVersionBadge();
    return state.versionInfo;
  }
}


function startVersionChecks() {
  renderVersionBadge();
  checkServerVersion({ force: false });
  if (state.versionCheckTimer) clearInterval(state.versionCheckTimer);
  state.versionCheckTimer = setInterval(function() { checkServerVersion({ force: false }); }, VERSION_CHECK_INTERVAL_MS);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    var syncState = typeof ensureHashSyncState === "function" ? ensureHashSyncState(state.syncHashState) : { localDirty: false };
    var hasPendingStudy = typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists();
    if (state.view === "flash" || syncState.localDirty || hasPendingStudy) {
      showSyncProblemDialog({
        severity: "warning",
        code: "APP_UPDATE_READY",
        title: "新版已准备好",
        message: "本地学习数据已保存。完成当前操作后点击刷新，即可切换到新版。",
        refreshVersion: true,
        serverVersion: state.versionInfo && state.versionInfo.serverVersion || APP_VERSION
      });
      return;
    }
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("sw.js?v=" + encodeURIComponent(APP_BUILD_ID), { updateViaCache: "none" }).then((registration) => {
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

/* ===== 11-word-data.js ===== */
"use strict";

async function ensureWords(book = currentBook()) {
  if (state.wordsByBook.has(book.id)) return state.wordsByBook.get(book.id);
  const response = await fetchWithTimeout(book.csv, { cache: "default" }, WORD_DATA_TIMEOUT_MS, {
    stage: "word_csv",
    transport: "same_origin_fetch"
  });
  if (!response.ok) {
    throw new Error(`词库加载失败：${book.csv} (${response.status})`);
  }
  const text = await response.text();
  const rows = parseCsv(text);
  const words = mapWords(rows);
  if (!words.length) throw new Error(`词库没有有效词条：${book.csv}`);
  const duplicateIds = words.map((word) => word.id).filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`词库存在重复序号：${Array.from(new Set(duplicateIds)).slice(0, 8).join("、")}`);
  const invalidUnits = words.filter((word) => word.unit < 1 || word.unit > book.totalUnits);
  if (invalidUnits.length) throw new Error(`词库 Unit 超出范围：${invalidUnits.slice(0, 5).map((word) => word.id).join("、")}`);
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


function buildStudyUnitWords(bookId, unit) {
  const knownIds = new Set(loadMarks(bookId).known.map(Number));
  return state.words.filter((word) => word.unit === unit && !knownIds.has(Number(word.id)));
}


function buildAllUnitWords(unit) {
  return state.words.filter((word) => Number(word.unit) === Number(unit));
}


function buildUnknownStudyWords(bookId, scope = currentUnknownScope()) {
  return unknownWordsForScope(bookId, state.words, scope);
}


function unknownScopeLabel(book, scope = currentUnknownScope()) {
  return scope.scope === "book" ? `${book.name} · 整本重难点词库` : `${unitDisplayLabel(book, scope.unit)} · 重难点词库`;
}


function recordUnitCompletion(bookId, unit) {
  const stats = loadUnitStats(bookId);
  const key = String(unit);
  const item = stats.units[key] || { completed: 0 };
  const updatedAt = beijingISOString();
  const completed = Math.max(0, Number(item.completed) || 0) + 1;
  stats.units[key] = { completed, updatedAt };
  saveUnitStats(bookId, stats);
  onLocalDataChanged("unitCompletion");
}

/* ===== 12-formatting.js ===== */
"use strict";

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

/* ===== 13-activity.js ===== */
"use strict";

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


function scheduleActivityDirty(reason = "activity") {
  if (state.view === "flash") {
    // active-study activity draft semantics are merged here.
    // Active-study activity is local queued state, not cloud business hash dirty.
    state.activityDirtyPending = true;
    state.activityDraftPending = true;
    if (typeof updateSyncIndicator === "function") updateSyncIndicator();
    return;
  }
  onLocalDataChanged(reason || "activity");
}


function recordStudyActivity({ seconds = 0, wordId = null, counted = false, result = "" } = {}) {
  const book = currentBook();
  const useDraft = state.view === "flash" && typeof loadActivityDraft === "function";
  const activity = useDraft ? loadActivityDraft(book.id) : loadActivity(book.id);
  const day = getActivityDay(activity, localDateKey());
  day.seconds += Math.max(0, seconds);
  if (counted) day.words += 1;
  if (result === "known") day.known += 1;
  if (result === "unknown") day.unknown += 1;
  if (wordId) day.wordIds = Array.from(new Set([...day.wordIds, Number(wordId)])).sort((a, b) => a - b);

  if (useDraft && typeof saveActivityDraft === "function") {
    saveActivityDraft(book.id, activity, "activity");
    return;
  }

  saveActivity(book.id, activity, { touch: false });
  scheduleActivityDirty("activity");
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

/* ===== 14-auth-setup-render.js ===== */
"use strict";

function setupStatusFallbackText() {
  try { return "词库文件：" + currentBook().csv; }
  catch (_) { return "词库文件正在准备"; }
}

function updateSetupStatusElement() {
  var status = document.getElementById("setupStatusBox");
  if (!status) return false;
  var current = state.setupStatus;
  status.textContent = current ? current.message : setupStatusFallbackText();
  status.className = "status" + (current && current.type ? " status--" + current.type : "");
  return true;
}

function updateStudyStartButton() {
  var button = document.getElementById("startBtn");
  if (!button) return false;
  button.disabled = state.studyStartPending === true;
  button.textContent = state.studyStartPending ? "正在开始…" : "开始刷词";
  button.setAttribute("aria-busy", state.studyStartPending ? "true" : "false");
  return true;
}

function setSetupStatus(message, type = "") {
  state.setupStatus = message ? { message, type } : "";
  if (state.view !== "setup") return;
  if (!updateSetupStatusElement()) renderSetup();
  else updateStudyStartButton();
}


function isAuthenticated() {
  try { return localStorage.getItem(AUTH_KEY) === "true"; }
  catch (_) { return false; }
}

// ── Hash sync state migration ──────────────────────────────────────
// 旧设备没有 vocab_machine_hash_sync_state_v1 时，保守默认 dirty。
// 旧 syncMeta 不能作为"已同步"证明——只有 syncTick GET 后发现云端 hash 匹配才标记 clean。

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
      if (safeSetLocalStorage(AUTH_KEY, "true", { priority: "auth" })) {
        Promise.resolve(enterStudyOnLaunch({ reason: "auth_success" }))
          .then(function() { return initializeSync({ reason: "auth_success" }); })
          .catch(function(error) {
            appendAuditEvent({ type: "sync:auth_init_failed", message: String(error && error.message || error || "") });
          });
      } else {
        var status = form.querySelector(".status");
        if (status) {
          status.textContent = "浏览器无法保存登录状态，请检查站点存储权限或空间。";
          status.className = "status status--error";
        }
      }
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
    ? `<div class="status ${state.setupStatus.type ? `status--${state.setupStatus.type}` : ""}" id="setupStatusBox">${escapeHtml(state.setupStatus.message)}</div>`
    : `<div class="status" id="setupStatusBox">词库文件：${escapeHtml(book.csv)}</div>`;
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

      <div class="setup-launchbar">
        <button class="btn btn--primary btn--wide setup-start-btn" id="startBtn" type="button" ${state.studyStartPending ? "disabled" : ""} aria-busy="${state.studyStartPending ? "true" : "false"}">${state.studyStartPending ? "正在开始…" : "开始刷词"}</button>
      </div>

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
            <div class="${state.settings.manualZhReveal ? "control-row control-row--disabled" : "control-row"}" id="zhDelayControl">
              <div class="control-head">
                <span>中文出现延迟</span>
                <span class="control-value" id="zhDelayInputValue">${escapeHtml(state.settings.zhDelay)}ms</span>
              </div>
              <input class="range" id="zhDelayInput" type="range" min="${ZH_DELAY_MIN}" max="${ZH_DELAY_MAX}" step="50" value="${state.settings.zhDelay}" aria-label="中文出现延迟" ${state.settings.manualZhReveal ? "disabled" : ""}>
            </div>
            <div class="toggle-grid">
              ${toggle("manualZhReveal", "手动显示中文", state.settings.manualZhReveal)}
            </div>
            <div class="status">开启“手动显示中文”后，延迟设置失效；当前词会停在英文，点击卡片或右侧区域才显示中文。</div>
            ${rangeControl("retentionPauseInput", "读后停留", state.settings.retentionPause, "ms", RETENTION_PAUSE_MIN, RETENTION_PAUSE_MAX, RETENTION_PAUSE_STEP)}
            <div class="toggle-grid">
              ${toggle("manualMode", "手动模式", state.settings.manualMode)}
            </div>
            <div class="status">朗读倍速只影响中英文读音；读前停留和读后停留均为绝对时间。</div>
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
            <div class="toggle-grid">
              ${toggle("autoSyncEnabled", "自动同步", state.settings.autoSyncEnabled !== false)}
            </div>
            <div class="status" id="autoSyncModeStatus">${state.settings.autoSyncEnabled !== false
              ? "自动同步已开启：沿用当前安全合并、后台重试和多设备同步逻辑。"
              : "自动同步已关闭：学习数据只保存在当前浏览器；需要时点击下方按钮手动安全同步。"}</div>
            <div class="manual-sync-controls" id="manualSyncControls" ${state.settings.autoSyncEnabled !== false ? "hidden" : ""}>
              <button class="btn btn--primary btn--wide" id="manualSyncBtn" type="button" ${state.isSyncing ? "disabled" : ""}>${state.isSyncing ? "同步中…" : "手动同步到云端（先安全合并）"}</button>
            </div>
            <div class="sync-grid">
              <label class="field-label">
                GitHub PAT
                <span class="secret-input-wrap">
                  <input class="input" id="tokenInput" type="password" value="${escapeHtml(state.cloudConfigDraft.token || state.cloud.token)}" autocomplete="off" spellcheck="false" placeholder="ghp_ 或 github_pat_ 开头">
                  <button class="btn btn--ghost secret-input-toggle" id="toggleTokenVisibilityBtn" type="button" aria-label="显示或隐藏 PAT">显示</button>
                </span>
              </label>
              <label class="field-label">
                Gist ID
                <input class="input" id="gistInput" type="text" value="${escapeHtml(state.cloudConfigDraft.gistId || state.cloud.gistId)}" autocomplete="off" placeholder="例如：a1b2c3d4e5f6...">
              </label>
            </div>
            <button class="btn btn--primary" id="testSaveCloudBtn" type="button" style="margin-top:8px;">测试并保存云同步配置</button>
            <div class="status" id="cloudConfigStatus"></div>
          </div>
        </div>
        ${renderSyncDiagnostics()}
      </section>

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


function renderSyncDiagnostics() {
  var meta = ensureSyncMeta(state.syncMeta);
  var syncState = ensureHashSyncState(state.syncHashState);
  var facts = currentSyncFacts({ persistHash: false });
  var opsCount = getPendingOps().length;
  var info = computeSyncStatus();
  var cloud = validateSavedCloudConfig(state.cloud);
  var backups = loadHashBackupIndex();
  var gistDisplay = (state.cloud.gistId || "").trim();
  if (gistDisplay.length > 8) gistDisplay = gistDisplay.slice(0, 4) + "…" + gistDisplay.slice(-4);
  var shortHash = function(value) { return value ? String(value).slice(0, 10) : "无"; };
  var statusLabel = SYNC_STATUS_LABELS[info.status] || "同步状态未知";
  var statusColor = SYNC_STATUS_COLORS[info.status] || "#94a3b8";
  var lastSuccessAt = [syncState.lastSuccessfulPushAt, syncState.lastSuccessfulPullAt, meta.lastSuccessfulPushAt, meta.lastSuccessfulPullAt]
    .filter(Boolean)
    .sort(function(a, b) { return (Date.parse(b) || 0) - (Date.parse(a) || 0); })[0] || "";
  var retryAtMs = Date.parse(syncState.nextRetryAt || "");
  var retryText = state.settings.autoSyncEnabled === false
    ? "已关闭"
    : (Number.isFinite(retryAtMs) && retryAtMs > Date.now() ? formatLocalDateTime(syncState.nextRetryAt) : "无等待");
  var syncAge = state.isSyncing && state.syncStartedAt ? Math.floor((Date.now() - state.syncStartedAt) / 1000) : 0;
  var lines = [];

  lines.push('<div class="settings-panel settings-panel--span4 sync-overview-panel" data-cloud-sync-diagnostics>');
  lines.push('<div class="sync-overview" data-status="' + escapeHtml(info.status) + '">');
  lines.push('<div class="sync-overview__header">');
  lines.push('<span class="sync-overview__dot" style="--sync-color:' + statusColor + '"></span>');
  lines.push('<div><strong>' + escapeHtml(statusLabel) + '</strong><p>' + escapeHtml(info.detail || "") + '</p></div>');
  lines.push('</div>');
  lines.push('<div class="sync-overview__meta">');
  lines.push('<span>本地数据：已保存</span>');
  lines.push('<span>最近成功：' + escapeHtml(formatLocalDateTime(lastSuccessAt)) + '</span>');
  lines.push('<span>自动重试：' + escapeHtml(retryText) + '</span>');
  lines.push('</div>');
  lines.push('<div class="sync-overview__actions">');
  if (state.settings.autoSyncEnabled !== false) {
    lines.push('<button class="btn btn--primary" id="syncNowBtn" type="button"' + (state.isSyncing ? ' disabled' : '') + '>' + (state.isSyncing ? '同步中…' : '立即同步') + '</button>');
  }
  lines.push('<button class="btn btn--ghost" id="exportSupportBundleBtn" type="button">导出排查包</button>');
  lines.push('</div>');
  lines.push('</div>');

  lines.push('<details class="sync-diagnostics-details">');
  lines.push('<summary>高级诊断与备份</summary>');
  lines.push('<div class="sync-diagnostics-grid">');
  lines.push('<div>应用版本：' + escapeHtml(APP_VERSION) + '</div>');
  lines.push('<div>服务器版本：' + escapeHtml(state.versionInfo && state.versionInfo.serverVersion || "未检查") + '</div>');
  lines.push('<div>Gist ID：' + escapeHtml(gistDisplay || "未设置") + '</div>');
  lines.push('<div>PAT 配置：' + (cloud.ok ? '格式通过' : escapeHtml(cloud.errors.join("；"))) + '</div>');
  lines.push('<div>云端写入：' + (meta.readOnlyMode ? '只读/不可写' : (meta.cloudWritable ? '已确认可写' : '尚未确认')) + '</div>');
  lines.push('<div>当前同步：' + (state.isSyncing ? '是（' + syncAge + ' 秒）' : '否') + '</div>');
  lines.push('<div>本地 dirty：' + String(syncState.localDirty) + '；有效 dirty：' + String(facts.effectiveDirty) + '</div>');
  lines.push('<div>base hash：' + escapeHtml(shortHash(syncState.baseRemoteHash)) + '；local hash：' + escapeHtml(shortHash(facts.localPayloadHash)) + '</div>');
  lines.push('<div>最近 Push：' + escapeHtml(formatLocalDateTime(syncState.lastSuccessfulPushAt || meta.lastSuccessfulPushAt)) + '</div>');
  lines.push('<div>最近 Pull：' + escapeHtml(formatLocalDateTime(syncState.lastSuccessfulPullAt || meta.lastSuccessfulPullAt)) + '</div>');
  lines.push('<div>连续失败：' + syncState.consecutiveSyncFailures + '；下次重试：' + escapeHtml(formatLocalDateTime(syncState.nextRetryAt)) + '</div>');
  lines.push('<div>最近错误类型：' + escapeHtml(syncState.lastErrorKind || "无") + '</div>');
  lines.push('<div>错误阶段/方式：' + escapeHtml((syncState.lastErrorStage || "无") + ' / ' + (syncState.lastErrorTransport || "无")) + '</div>');
  lines.push('<div>HTTP 状态：' + escapeHtml(String(syncState.lastErrorHttpStatus || 0)) + '</div>');
  lines.push('<div class="sync-diagnostics-grid__wide">最近错误：' + escapeHtml(syncState.lastSyncError || meta.lastSyncErrorMessage || "无") + '</div>');
  if (syncState.lastErrorTechnical) lines.push('<div class="sync-diagnostics-grid__wide"><code>' + escapeHtml(syncState.lastErrorTechnical.slice(0, 1200)) + '</code></div>');
  lines.push('<div>本地备份：' + backups.length + ' 条；最新快照：' + escapeHtml(getLocalSnapshotTime()) + '</div>');
  lines.push('<div>今日备份：' + escapeHtml(getDailyBackupTime()) + '</div>');
  if (opsCount > 0) lines.push('<div class="sync-diagnostics-grid__wide">旧版兼容操作记录：' + opsCount + ' 条（仅用于旧数据读取，不参与当前同步）</div>');
  if (syncState.lastBackupError) lines.push('<div class="sync-diagnostics-grid__wide">备份写入错误：' + escapeHtml(syncState.lastBackupError) + '</div>');
  lines.push('</div>');
  lines.push('<div class="sync-diagnostics-actions">');
  lines.push('<button class="btn btn--ghost" id="exportBackupBtn" type="button">导出本地备份</button>');
  lines.push('<button class="btn btn--ghost" id="exportDiagnosisBtn" type="button">导出诊断摘要</button>');
  lines.push('<button class="btn btn--ghost" id="exportAuditLogBtn" type="button">导出运行日志</button>');
  lines.push('</div>');
  lines.push('</details>');
  lines.push('</div>');
  return lines.join("\n");
}

function renderCloudSyncDiagnostics() {
  var box = document.querySelector("[data-cloud-sync-diagnostics]");
  if (!box) return;

  var sx = window.scrollX || 0;
  var sy = window.scrollY || 0;

  box.outerHTML = renderSyncDiagnostics();

  bindSyncDiagnosticsButtons();

  requestAnimationFrame(function() {
    window.scrollTo(sx, sy);
  });
}

function bindSyncDiagnosticsButtons() {
  var exportBackupBtn = document.getElementById("exportBackupBtn");
  var exportDiagnosisBtn = document.getElementById("exportDiagnosisBtn");
  var exportAuditLogBtn = document.getElementById("exportAuditLogBtn");
  var exportSupportBundleBtn = document.getElementById("exportSupportBundleBtn");
  var syncNowBtn = document.getElementById("syncNowBtn");

  if (exportBackupBtn) exportBackupBtn.onclick = exportLocalBackup;
  if (exportDiagnosisBtn) exportDiagnosisBtn.onclick = exportDiagnosisSummary;
  if (exportAuditLogBtn) exportAuditLogBtn.onclick = exportAuditLog;
  if (exportSupportBundleBtn) exportSupportBundleBtn.onclick = exportSupportBundle;
  if (syncNowBtn) syncNowBtn.onclick = function() { syncTick({ reason: "manual_retry", bypassBackoff: true }); };
}

function getLocalSnapshotTime() {
  try {
    var raw = localStorage.getItem(LOCAL_SNAPSHOT_KEY);
    if (!raw) return "无";
    var parsed = JSON.parse(raw);
    return parsed.savedAt || "无";
  } catch (_) { return "无"; }
}


function getDailyBackupTime() {
  try {
    var date = localDateKey();
    var raw = localStorage.getItem(DAILY_BACKUP_PREFIX + date);
    if (!raw) return "无";
    var parsed = JSON.parse(raw);
    return parsed.savedAt || "无";
  } catch (_) { return "无"; }
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

/* ===== 15-setup-events.js ===== */
"use strict";

function setCloudConfigStatus(message, kind) {
  var statusEl = document.getElementById("cloudConfigStatus");
  var btn = document.getElementById("testSaveCloudBtn");
  var normalizedKind = kind || "info";
  if (statusEl) {
    statusEl.textContent = message || "";
    statusEl.className = "status" + (normalizedKind === "ok" ? " status--ok" : normalizedKind === "error" ? " status--error" : "");
    statusEl.setAttribute("data-sync-config-status", normalizedKind);
  }
  try {
    window.__lastCloudConfigStatus = { kind: normalizedKind, message: String(message || ""), at: Date.now() };
    document.dispatchEvent(new CustomEvent("cloud-config-status-change", { detail: window.__lastCloudConfigStatus }));
  } catch (_) {}
  if (btn) {
    btn.setAttribute("data-sync-config-status", normalizedKind);
    btn.disabled = normalizedKind === "testing";
  }
}


async function testAndSaveCloudConfig() {
  var tokenInput = document.getElementById("tokenInput");
  var gistInput = document.getElementById("gistInput");
  var statusEl = document.getElementById("cloudConfigStatus");
  var draft = {
    token: tokenInput ? tokenInput.value.trim() : state.cloudConfigDraft.token,
    gistId: gistInput ? gistInput.value.trim() : state.cloudConfigDraft.gistId
  };

  state.cloudConfigDraft = draft;

  var validation = validateCloudConfigDraft(draft);
  if (!validation.ok) {
    setCloudConfigStatus(validation.errors.join("；"), "error");
    return;
  }

  setCloudConfigStatus("正在测试连接…", "testing");

  // Step 1: anonymous-first GET with authenticated/private and JSONP fallbacks.
  var getUrl = "https://api.github.com/gists/" + encodeURIComponent(draft.gistId);
  var metadataResult;
  try {
    metadataResult = await fetchGistMetadataWithCredentials({
      gistId: draft.gistId,
      token: draft.token,
      allowJsonp: true
    });
  } catch (e) {
    setCloudConfigStatus("读取 Gist 失败：" + syncErrorMessage(e), "error");
    appendAuditEvent({ type: "sync:config_read_failed", message: requestErrorTechnical(e), httpStatus: Number(e && e.httpStatus || 0) });
    return;
  }

  setCloudConfigStatus("已通过" + (metadataResult.readTransport === "jsonp" ? " JSONP 回退" : "网络") + "读取 Gist，正在测试写权限…", "testing");

  // Step 2: PATCH healthcheck to test write permission. If the response is lost,
  // read the tiny probe file back before declaring failure.
  var probeContent = "sync probe at " + beijingISOString() + " clientId=" + ensureSyncMeta().clientId + " nonce=" + Math.random().toString(36).slice(2);
  var patchResponse = null;
  var patchConfirmedByReadback = false;
  try {
    patchResponse = await fetchWithTimeout(getUrl, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + draft.token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          [SYNC_HEALTHCHECK_FILE_NAME]: { content: probeContent }
        }
      })
    }, GITHUB_PATCH_TIMEOUT_MS, { stage: "config_patch_probe", transport: "authenticated_fetch" });
  } catch (e) {
    try {
      var readback = await fetchGistMetadataWithCredentials({ gistId: draft.gistId, token: draft.token, allowJsonp: true });
      var probeFile = readback && readback.gist && readback.gist.files && readback.gist.files[SYNC_HEALTHCHECK_FILE_NAME];
      patchConfirmedByReadback = Boolean(probeFile && probeFile.content === probeContent);
    } catch (_) {}
    if (!patchConfirmedByReadback) {
      setCloudConfigStatus("写权限测试失败：" + syncErrorMessage(e), "error");
      appendAuditEvent({ type: "sync:config_patch_failed", message: requestErrorTechnical(e), httpStatus: Number(e && e.httpStatus || 0) });
      return;
    }
  }

  if (patchResponse && !patchResponse.ok) {
    var classifiedPatch = await classifyGithubResponseError(patchResponse, "测试 Gist 写权限");
    setCloudConfigStatus(classifiedPatch.message, "error");
    appendAuditEvent({ type: "sync:config_patch_failed", message: classifiedPatch.technical, httpStatus: patchResponse.status });
    return;
  }

  // Success: healthcheck only proves write permission. It must not mark the
  // business snapshot as cloud_saved.
  var previousCloud = { ...state.cloud };
  state.cloud.token = draft.token;
  state.cloud.gistId = draft.gistId;
  if (!persistCloud()) {
    state.cloud = previousCloud;
    setCloudConfigStatus("配置已验证，但浏览器本地存储写入失败。请先导出排查包并释放存储空间。", "error");
    return;
  }
  resetSyncMetaForGist(draft.gistId);
  state.syncMeta.cloudWritable = true;
  state.syncMeta.readOnlyMode = false;
  state.syncMeta.lastSyncErrorAt = "";
  state.syncMeta.lastSyncErrorMessage = "";
  state.consecutivePushFailures = 0;
  persistSyncMeta();
  const local = refreshLocalPayloadHash({ persist: false });
  state.syncHashState = ensureHashSyncState({
    ...DEFAULT_HASH_SYNC_STATE,
    localPayloadHash: local.hash,
    localDirty: hasBusinessData(local.payload),
    dirtySince: hasBusinessData(local.payload) ? beijingISOString() : "",
    lastSyncStatus: hasBusinessData(local.payload) ? "dirty" : "local_only"
  });
  persistHashSyncState();
  updateSyncIndicator();
  if (state.settings.autoSyncEnabled === false) {
    setCloudConfigStatus("配置保存成功，已确认 Gist 可写" + (patchConfirmedByReadback ? "（通过回读确认）" : "") + "；自动同步已关闭，业务数据仍只保存在本地，点击手动同步后再上传。", "ok");
  } else {
    setCloudConfigStatus("配置保存成功，已确认 Gist 可写" + (patchConfirmedByReadback ? "（通过回读确认）" : "") + "；业务数据将在后台安全同步。", "ok");
    syncTick({ reason: "config_saved", bypassBackoff: true });
  }
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
  const autoSyncEnabled = document.getElementById("autoSyncEnabled");
  const manualSyncBtn = document.getElementById("manualSyncBtn");

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
  const manualZhReveal = document.getElementById("manualZhReveal");
  if (manualZhReveal) {
    manualZhReveal.addEventListener("change", () => {
      state.settings.manualZhReveal = manualZhReveal.checked;
      persistSettings();
      renderSetup();
    });
  }
  bindCheckbox("manualMode", "manualMode");
  bindCheckbox("highOnly", "highOnly");

  if (autoSyncEnabled) {
    autoSyncEnabled.addEventListener("change", function() {
      state.settings.autoSyncEnabled = autoSyncEnabled.checked;
      persistSettings({ touch: false });
      if (typeof handleAutoSyncPreferenceChanged === "function") {
        handleAutoSyncPreferenceChanged(autoSyncEnabled.checked);
      }
      var controls = document.getElementById("manualSyncControls");
      var modeStatus = document.getElementById("autoSyncModeStatus");
      if (controls) controls.hidden = autoSyncEnabled.checked;
      if (modeStatus) {
        modeStatus.textContent = autoSyncEnabled.checked
          ? "自动同步已开启：沿用当前安全合并、后台重试和多设备同步逻辑。"
          : "自动同步已关闭：学习数据只保存在当前浏览器；需要时点击下方按钮手动安全同步。";
      }
      renderCloudSyncDiagnostics();
    });
  }

  if (manualSyncBtn) {
    manualSyncBtn.addEventListener("click", function() {
      manualSyncBtn.disabled = true;
      manualSyncBtn.textContent = "同步中…";
      setCloudConfigStatus("正在执行手动安全同步…", "testing");
      Promise.resolve(syncTick({ reason: "manual_retry", bypassBackoff: true })).then(function(result) {
        var completed = result && result.ok !== false;
        setCloudConfigStatus(completed ? "手动同步已完成。" : "手动同步未完成；本地数据仍已保存，请查看同步状态。", completed ? "ok" : "error");
      }).catch(function(error) {
        setCloudConfigStatus("手动同步失败：" + syncErrorMessage(error), "error");
      }).finally(function() {
        manualSyncBtn.disabled = false;
        manualSyncBtn.textContent = "手动同步到云端（先安全合并）";
      });
    });
  }

  document.getElementById("summaryMode").addEventListener("change", (event) => {
    state.settings.summaryMode = event.target.value;
    persistSettings();
    renderSetup();
  });

  // token/gist input 只更新 draft，不自动保存和同步
  tokenInput.addEventListener("input", function() {
    state.cloudConfigDraft.token = tokenInput.value.trim();
  });

  gistInput.addEventListener("input", function() {
    state.cloudConfigDraft.gistId = gistInput.value.trim();
  });

  var toggleTokenVisibilityBtn = document.getElementById("toggleTokenVisibilityBtn");
  if (toggleTokenVisibilityBtn && tokenInput) {
    toggleTokenVisibilityBtn.addEventListener("click", function() {
      var reveal = tokenInput.type === "password";
      tokenInput.type = reveal ? "text" : "password";
      toggleTokenVisibilityBtn.textContent = reveal ? "隐藏" : "显示";
      toggleTokenVisibilityBtn.setAttribute("aria-pressed", reveal ? "true" : "false");
    });
  }

  // 初始化 draft 值
  state.cloudConfigDraft.token = state.cloud.token || "";
  state.cloudConfigDraft.gistId = state.cloud.gistId || "";
  if (tokenInput) tokenInput.value = state.cloudConfigDraft.token;
  if (gistInput) gistInput.value = state.cloudConfigDraft.gistId;

  // 新增"测试并保存"按钮事件
  var testSaveBtn = document.getElementById("testSaveCloudBtn");
  if (testSaveBtn) {
    testSaveBtn.addEventListener("click", function() {
      testAndSaveCloudConfig();
    });
  }

  startBtn.addEventListener("click", startStudy);
  statsBtn.addEventListener("click", openStats);
  archiveBtn.addEventListener("click", openArchive);
  logoutBtn.addEventListener("click", function() {
    try { localStorage.removeItem(AUTH_KEY); } catch (_) {}
    renderAuth();
  });

  // 同步状态卡可能被局部重绘，所有按钮统一由同一个绑定函数维护。
  bindSyncDiagnosticsButtons();
}


function exportLocalBackup() {
  var payload = normalizeSyncPayload(collectSyncPayload());
  var meta = ensureSyncMeta(state.syncMeta);
  var bundle = {
    exportedAt: beijingISOString(),
    appVersion: APP_VERSION,
    pendingOpsCount: getPendingOps().length,
    syncMeta: meta,
    payload: payload
  };
  var json = JSON.stringify(bundle, null, 2);
  var blob = new Blob([json], { type: "application/json;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var stamp = beijingISOString().replace(/[:.]/g, "-");
  var a = document.createElement("a");
  a.href = url;
  a.download = "shua-ci-ji-backup-" + stamp + ".json";
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
}


function downloadTextFile(filename, content, mimeType) {
  var blob = new Blob([String(content || "")], { type: mimeType || "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function exportDiagnosisSummary() {
  try {
    var stamp = beijingISOString().replace(/[:.]/g, "-");
    downloadTextFile("shua-ci-ji-diagnosis-" + stamp + ".txt", buildSyncDiagnosisText(), "text/plain;charset=utf-8");
  } catch (error) {
    alert("诊断摘要导出失败：" + String(error && error.message || error || "unknown"));
  }
}

function exportSupportBundle() {
  try {
    if (typeof flushAuditBuffer === "function") flushAuditBuffer();
    var audit = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var syncState = ensureHashSyncState(state.syncHashState);
    var meta = ensureSyncMeta(state.syncMeta);
    var bundle = {
      exportedAt: beijingISOString(),
      appVersion: APP_VERSION,
      buildId: APP_BUILD_ID,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
      runtime: {
        loaderMode: String(window.__SHUA_LOADER_MODE__ || "unknown"),
        sourceModuleCount: Array.isArray(window.__SHUA_SOURCE_MODULES__) ? window.__SHUA_SOURCE_MODULES__.length : 0,
        visibilityState: typeof document !== "undefined" ? String(document.visibilityState || "") : "",
        serviceWorkerControlled: Boolean(typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller)
      },
      cloudConfig: {
        gistIdMasked: maskGistId(state.cloud && state.cloud.gistId),
        tokenMasked: maskTokenForDiagnosis(state.cloud && state.cloud.token),
        configured: validateSavedCloudConfig(state.cloud).ok
      },
      status: computeSyncStatus(),
      syncState: syncState,
      syncMeta: meta,
      diagnosisText: buildSyncDiagnosisText(),
      payload: normalizeSyncPayload(collectSyncPayload()),
      backupIndex: loadHashBackupIndex(),
      auditOrderProblems: validateAuditSyncOrder(Array.isArray(audit.events) ? audit.events : []),
      events: Array.isArray(audit.events) ? audit.events : []
    };
    // 安全约束：排查包不写入明文 PAT。
    if (bundle.syncMeta && Object.prototype.hasOwnProperty.call(bundle.syncMeta, "token")) delete bundle.syncMeta.token;
    var stamp = beijingISOString().replace(/[:.]/g, "-");
    downloadTextFile("shua-ci-ji-support-bundle-" + stamp + ".json", JSON.stringify(bundle, null, 2), "application/json;charset=utf-8");
  } catch (error) {
    alert("排查包导出失败：" + String(error && error.message || error || "unknown"));
  }
}


// ── 审计顺序验证 ─────────────────────────────────────────────

function validateAuditSyncOrder(events) {
  var byKey = {};
  (events || []).forEach(function(e) {
    if (!e.at || !e.type) return;
    var msg = e.message || "";
    var sessionMatch = /session=([^ ]+)/.exec(msg);
    var runMatch = /runId=([0-9]+)/.exec(msg);
    if (!runMatch) return;
    var key = (sessionMatch ? sessionMatch[1] : "legacy") + "#" + runMatch[1];
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(e);
  });
  var problems = [];
  Object.keys(byKey).forEach(function(key) {
    var list = byKey[key].slice().sort(function(a, b) { return (Date.parse(a.at || "") || 0) - (Date.parse(b.at || "") || 0); });
    var completeIdx = list.findIndex(function(e) { return e.type === "sync:complete"; });
    var patchSentIdx = list.findIndex(function(e) { return e.type === "sync:patch_sent"; });
    var patchSuccessIdx = list.findIndex(function(e) { return e.type === "sync:patch_success"; });
    var verifyIdx = list.findIndex(function(e) { return e.type === "sync:verify_done"; });
    if (completeIdx >= 0 && patchSentIdx >= 0 && completeIdx < patchSentIdx) problems.push(key + " complete before patch_sent");
    if (completeIdx >= 0 && patchSuccessIdx >= 0 && completeIdx < patchSuccessIdx) problems.push(key + " complete before patch_success");
    if (completeIdx >= 0 && verifyIdx >= 0 && completeIdx < verifyIdx) problems.push(key + " complete before verify_done");
  });
  return problems;
}

function exportAuditLog() {
  try {
    if (typeof flushAuditBuffer === "function") flushAuditBuffer();
    var store = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var events = Array.isArray(store.events) ? store.events : [];
    events.sort(function(a, b) {
      return (Date.parse(a.at || "") || 0) - (Date.parse(b.at || "") || 0);
    });
    var orderProblems = validateAuditSyncOrder(events);
    var bundle = {
      exportedAt: beijingISOString(),
      appVersion: APP_VERSION,
      buildId: APP_BUILD_ID,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      totalEvents: events.length,
      auditOrderProblems: orderProblems,
      events: events
    };
    var json = JSON.stringify(bundle, null, 2);
    var blob = new Blob([json], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var stamp = beijingISOString().replace(/[:.]/g, "-");
    var a = document.createElement("a");
    a.href = url;
    a.download = "shua-ci-ji-audit-log-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
  } catch (err) {
    alert("日志导出失败：" + (err && err.message || "unknown"));
  }
}

window.exportAuditLog = exportAuditLog;

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

/* ===== 16-study-start.js ===== */
"use strict";


function startStudyDelay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}


function hasForeignSyncLock() {
  try {
    if (typeof readCrossTabSyncLock !== "function") return false;
    var lock = readCrossTabSyncLock();
    return Boolean(lock && lock.owner && lock.owner !== TAB_ID && Number(lock.expiresAt || 0) > Date.now());
  } catch (_) {
    return false;
  }
}


async function waitForStartupSyncBeforeStudy(maxMs) {
  var startedAt = Date.now();
  var warned = false;
  while (Date.now() - startedAt < (maxMs || 2000)) {
    var blocked = Boolean(state.isSyncing || hasForeignSyncLock());
    if (!blocked) return true;
    if (!warned) {
      warned = true;
      appendAuditEvent({ type: "study:start_wait_sync", message: "isSyncing=" + String(Boolean(state.isSyncing)) + " foreignLock=" + String(hasForeignSyncLock()) });
      setSetupStatus("正在完成云端快速检查；网络较慢时将直接使用本地数据开始。");
    }
    await startStudyDelay(250);
  }
  appendAuditEvent({ type: "study:start_wait_sync_timeout", message: "isSyncing=" + String(Boolean(state.isSyncing)) + " foreignLock=" + String(hasForeignSyncLock()) });
  return false;
}


async function startStudy() {
  if (state.studyStartPending) return;
  state.studyStartPending = true;
  updateStudyStartButton();
  clearTimers();
  unlockSpeech();
  setSetupStatus("正在加载词库...");
  try {
    await waitForStartupSyncBeforeStudy(2000);
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
      ? getStartIndexFromProgress(loadUnknownProgressForResume(book.id, scope))
      : getStartIndex(book.id);
    state.groupStats = createGroupStats();
    state.undoWordId = null;
    state.navQueue = [];
    if (typeof resetCardTransitionState === "function") resetCardTransitionState();
    else state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.playbackPaused = false;
    state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
    state.setupStatus = "";
    await requestWakeLock();
    if (typeof touchStudyActivity === "function") touchStudyActivity("start_study");
    renderFlashcard({ touchProgress: true, progressReason: "start_study" });
  } catch (error) {
    setSetupStatus(error.message || "词库加载失败", "error");
  } finally {
    state.studyStartPending = false;
    updateStudyStartButton();
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
    if (typeof resetCardTransitionState === "function") resetCardTransitionState();
    else state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
    state.reviewMode = { mode: "activity-review", label: `${stats.label}复盘`, wordIds: stats.wordIds };
    state.roundReturn = null;
    state.playbackPaused = false;
    state.statsOpen = false;
    state.archiveOpen = false;
    await requestWakeLock();
    if (typeof touchStudyActivity === "function") touchStudyActivity("start_review");
    renderFlashcard({ touchProgress: true, progressReason: "start_review" });
  } catch (error) {
    state.setupStatus = { message: error.message || "复盘启动失败", type: "error" };
    renderSetup();
  }
}


function getStartIndex(bookId) {
  if (state.settings.mode !== "resume") return 0;
  return getStartIndexFromProgress(loadProgressForResume(bookId));
}


function getStartIndexFromProgress(progress) {
  if (state.settings.mode !== "resume") return 0;
  const lastWordId = Number(progress.lastWordId);
  if (!Number.isFinite(lastWordId)) return 0;
  if (!state.unitWords.length) return 0;
  const index = state.unitWords.findIndex((word) => word.id === lastWordId);
  if (index >= 0) return index;
  const nextIndex = state.unitWords.findIndex((word) => Number(word.id) > lastWordId);
  if (nextIndex >= 0) return nextIndex;
  appendAuditEvent({ type: "study:resume_progress_out_of_range", message: "lastWordId=" + String(lastWordId || "") + " unitWords=" + String(state.unitWords.length || 0) + " fallback=0" });
  return 0;
}

/* ===== 16a-study-session.js ===== */
"use strict";

function renderStudyLaunchLoading(message) {
  state.view = "loading";
  releaseWakeLock();
  clearTimers();
  app.innerHTML = `
    <section class="view loading-view">
      <div class="auth-panel">
        <h1>正在恢复刷词</h1>
        <div class="status">${escapeHtml(message || "正在读取上次学习位置…")}</div>
      </div>
    </section>
    ${renderSyncIndicator()}
  `;
}

function sanitizeStoredReviewMode(value) {
  if (!isPlainObject(value) || !value.mode) return null;
  const allowed = new Set(["unknown-archive", "round-unknown", "unit-replay", "archive-unit-selection", "activity-review"]);
  if (!allowed.has(String(value.mode))) return null;
  const result = {
    mode: String(value.mode),
    label: String(value.label || "复盘")
  };
  if (isPlainObject(value.scope)) {
    result.scope = value.scope.scope === "book"
      ? { scope: "book" }
      : { scope: "unit", unit: Math.max(1, Number(value.scope.unit) || 1) };
  }
  if (Array.isArray(value.wordIds)) result.wordIds = normalizeIdList(value.wordIds);
  return result;
}

function saveActiveStudySession(reason) {
  if (state.view !== "flash") return false;
  const word = state.unitWords && state.unitWords[state.currentIndex];
  if (!word || !state.unitWords.length) return false;
  const payload = {
    schemaVersion: 1,
    savedAt: beijingISOString(),
    reason: String(reason || "render"),
    bookId: currentBook().id,
    unit: Number(word.unit) || Number(state.settings.unit) || 1,
    wordIds: state.unitWords.map((item) => Number(item.id)).filter(Boolean),
    currentWordId: Number(word.id) || 0,
    currentIndex: Math.max(0, Number(state.currentIndex) || 0),
    showZh: state.showZh === true,
    reviewMode: state.reviewMode ? sanitizeStoredReviewMode({
      ...state.reviewMode,
      wordIds: Array.isArray(state.reviewMode.wordIds) ? state.reviewMode.wordIds : undefined
    }) : null,
    groupStats: {
      seen: Math.max(0, Number(state.groupStats && state.groupStats.seen) || 0),
      known: Math.max(0, Number(state.groupStats && state.groupStats.known) || 0),
      unknown: Math.max(0, Number(state.groupStats && state.groupStats.unknown) || 0),
      unknownIds: normalizeIdList(state.groupStats && state.groupStats.unknownIds)
    }
  };
  return saveJson(STUDY_SESSION_KEY, payload);
}

function loadActiveStudySession() {
  const value = loadJson(STUDY_SESSION_KEY, null);
  if (!isPlainObject(value) || Number(value.schemaVersion) !== 1) return null;
  const book = BOOKS.find((item) => item.id === value.bookId);
  const ids = normalizeIdList(value.wordIds);
  if (!book || !ids.length) return null;
  return {
    bookId: book.id,
    unit: clamp(Number(value.unit) || 1, 1, book.totalUnits),
    wordIds: ids,
    currentWordId: Number(value.currentWordId) || 0,
    currentIndex: Math.max(0, Number(value.currentIndex) || 0),
    showZh: value.showZh === true,
    reviewMode: sanitizeStoredReviewMode(value.reviewMode),
    groupStats: {
      seen: Math.max(0, Number(value.groupStats && value.groupStats.seen) || 0),
      known: Math.max(0, Number(value.groupStats && value.groupStats.known) || 0),
      unknown: Math.max(0, Number(value.groupStats && value.groupStats.unknown) || 0),
      unknownIds: normalizeIdList(value.groupStats && value.groupStats.unknownIds)
    }
  };
}

function findResumeIndexForQueue(words, lastWordId, fallbackIndex) {
  if (!words.length) return 0;
  const id = Number(lastWordId);
  const exact = words.findIndex((word) => Number(word.id) === id);
  if (exact >= 0) return exact;
  const fallback = clamp(Number(fallbackIndex) || 0, 0, words.length - 1);
  return fallback;
}

function restoreStudySessionRecord(record, words) {
  const idSet = new Set(record.wordIds);
  let queue = words.filter((word) => idSet.has(Number(word.id)));
  if (!queue.length) return false;
  state.words = words;
  state.unitWords = queue;
  state.currentIndex = findResumeIndexForQueue(queue, record.currentWordId, record.currentIndex);
  state.settings.unit = clamp(Number(queue[state.currentIndex] && queue[state.currentIndex].unit) || record.unit, 1, currentBook().totalUnits);
  state.reviewMode = record.reviewMode;
  state.groupStats = record.groupStats || createGroupStats();
  state.showZh = record.showZh === true;
  state.playbackPaused = true;
  state.awaitingManualZhReveal = Boolean(state.settings.manualZhReveal && !state.showZh);
  state.roundReturn = null;
  state.undoWordId = null;
  state.navQueue = [];
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.archiveOpen = false;
  state.statsOpen = false;
  resetCardTransitionState();
  return true;
}

function prepareDefaultLaunchQueue(book, words) {
  state.words = words;
  const unknownMode = state.settings.queueMode === "unknown";
  const scope = currentUnknownScope();
  let queue = unknownMode ? buildUnknownStudyWords(book.id, scope) : buildStudyUnitWords(book.id, state.settings.unit);
  let reviewMode = unknownMode ? { mode: "unknown-archive", label: unknownScopeLabel(book, scope), scope } : null;
  if (!queue.length) {
    queue = buildAllUnitWords(state.settings.unit);
    reviewMode = queue.length ? { mode: "unit-replay", label: `${unitDisplayLabel(book, state.settings.unit)} · 重新刷` } : null;
  }
  if (!queue.length) {
    const firstUnitWithWords = Array.from({ length: book.totalUnits }, (_, index) => index + 1)
      .find((unit) => words.some((word) => Number(word.unit) === unit));
    if (firstUnitWithWords) {
      state.settings.unit = firstUnitWithWords;
      queue = words.filter((word) => Number(word.unit) === firstUnitWithWords);
      reviewMode = null;
    }
  }
  if (!queue.length) throw new Error("词库没有可显示的单词");
  const progress = unknownMode ? loadUnknownProgressForResume(book.id, scope) : loadProgressForResume(book.id);
  const currentIndex = findResumeIndexForQueue(queue, progress && progress.lastWordId, 0);
  state.unitWords = queue;
  state.currentIndex = currentIndex;
  state.reviewMode = reviewMode;
  state.groupStats = createGroupStats();
  state.showZh = false;
  state.playbackPaused = true;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  state.roundReturn = null;
  state.undoWordId = null;
  state.navQueue = [];
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.archiveOpen = false;
  state.statsOpen = false;
  resetCardTransitionState();
}

async function enterStudyOnLaunch(options = {}) {
  if (state.launchRestoringStudy) return;
  state.launchRestoringStudy = true;
  renderStudyLaunchLoading(options.reason === "auth_success" ? "登录成功，正在打开上次刷词位置…" : "正在打开上次刷词位置…");
  try {
    normalizeSettings();
    const record = loadActiveStudySession();
    if (record && record.bookId !== state.settings.bookId) restoreBookSettings(record.bookId);
    const book = currentBook();
    const words = await ensureWords(book);
    if (!record || record.bookId !== book.id || !restoreStudySessionRecord(record, words)) {
      prepareDefaultLaunchQueue(book, words);
    }
    state.setupStatus = "";
    renderFlashcard({ touchProgress: false, progressReason: "launch_restore" });
    appendAuditEvent({
      type: "study:launch_restored",
      message: "bookId=" + book.id + " wordId=" + String(state.unitWords[state.currentIndex] && state.unitWords[state.currentIndex].id || "") + " paused=true stored=" + String(Boolean(record))
    });
  } catch (error) {
    state.setupStatus = { message: error && error.message || "恢复上次刷词失败，请在设置页重新选择。", type: "error" };
    renderSetup();
  } finally {
    state.launchRestoringStudy = false;
  }
}

/* ===== 17-flashcard-render.js ===== */
"use strict";

function renderFlashcard({ touchProgress = false, progressReason = "render" } = {}) {
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
    saveUnknownProgressCursor(book.id, state.reviewMode.scope || currentUnknownScope(), { lastWordId: word.id, unit: word.unit, updatedAt: beijingISOString() }, { queue: touchProgress, reason: progressReason });
  } else if (!state.reviewMode) {
    saveProgressCursor(book.id, { lastWordId: word.id, unit: word.unit, updatedAt: beijingISOString() }, { queue: touchProgress, reason: progressReason });
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
  saveActiveStudySession(progressReason || "render");
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
  const pausedClass = !isNext && state.playbackPaused ? " word-card--paused" : "";
  const manualRevealClass = !isNext && state.settings.manualZhReveal && !state.showZh ? " word-card--awaiting-zh" : "";
  const zhHidden = isNext || !state.showZh ? " is-hidden" : "";
  return `
    <article class="word-card ${isNext ? "word-card--next" : ""}${enterClass}${resumeClass}${markClass}${pausedClass}${manualRevealClass}" id="${isNext ? "nextCard" : "activeCard"}" style="--freq-alpha: ${alpha.toFixed(3)}; --freq-alpha-soft: ${(alpha * 0.35).toFixed(3)}">
      ${isNext ? "" : renderCardSwipeControls()}
      ${resumeFeedback ? '<div class="resume-feedback" aria-live="polite">继续播放</div>' : ""}
      ${!isNext && state.playbackPaused ? `<div class="pause-feedback" role="status" aria-live="polite"><span aria-hidden="true">Ⅱ</span> ${state.settings.manualZhReveal && !state.showZh ? "已暂停 · 点击显示中文，再点继续" : "已暂停 · 点击卡片继续"}</div>` : ""}
      ${!isNext && state.settings.manualZhReveal && !state.showZh ? '<div class="manual-zh-feedback" role="status">点击卡片或右侧显示中文</div>' : ""}
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

  if (state.settings.manualZhReveal && state.showZh) {
    state.awaitingManualZhReveal = false;
    await runPostZhSequence(word, spokenDefinition, token);
    return;
  }

  const revealTask = state.settings.manualZhReveal ? null : revealZhAfterDelay(token);
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
  if (state.settings.manualZhReveal) {
    state.awaitingManualZhReveal = true;
    return;
  }
  await revealTask;
  if (!isPlaybackToken(token)) return;
  await runPostZhSequence(word, spokenDefinition, token);
}


async function runPostZhSequence(word, spokenDefinition, token) {
  const speechAvailable = "speechSynthesis" in window;
  const hasZhSpeech = Boolean(state.settings.speakZh && spokenDefinition && speechAvailable);
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


function revealZhManually() {
  if (!state.settings.manualZhReveal || state.showZh || state.view !== "flash") return false;
  state.showZh = true;
  state.awaitingManualZhReveal = false;
  const definitionNode = document.getElementById("definition");
  if (definitionNode) definitionNode.classList.remove("is-hidden");
  const card = document.getElementById("activeCard");
  if (card) card.classList.remove("word-card--awaiting-zh");
  const feedback = document.querySelector(".manual-zh-feedback");
  if (feedback) feedback.remove();
  const pauseFeedback = document.querySelector(".pause-feedback");
  if (pauseFeedback && state.playbackPaused) {
    pauseFeedback.innerHTML = '<span aria-hidden="true">Ⅱ</span> 已暂停 · 点击卡片继续';
  }
  saveActiveStudySession("manual_zh_reveal");
  if (!state.playbackPaused) {
    clearTimers();
    scheduleWordTimers();
  }
  return true;
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

/* ===== 18-speech.js ===== */
"use strict";

function preloadSpeechVoices() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      window.speechSynthesis.getVoices();
    });
  }
}


function pausePlaybackForBackground() {
  if (state.view !== "flash" || state.playbackPaused) return;
  if (typeof touchStudyActivity === "function") touchStudyActivity("pause_background");
  commitCurrentCardActivity();
  clearTimers();
  releaseWakeLock();
  state.playbackPaused = true;
  saveActiveStudySession("pause_background");
  if (typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary("pause_background");
  renderFlashcard({ touchProgress: false });
}


function pausePlaybackFromCard() {
  if (state.view !== "flash" || state.playbackPaused) return;
  if (typeof touchStudyActivity === "function") touchStudyActivity("pause");
  commitCurrentCardActivity();
  clearTimers();
  releaseWakeLock();
  state.playbackPaused = true;
  saveActiveStudySession("pause_card");
  if (typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary("pause");
  if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload(1500);
  renderFlashcard({ touchProgress: false });
}


async function resumePlayback() {
  if (state.view !== "flash") return;
  if (typeof touchStudyActivity === "function") touchStudyActivity("resume");
  state.playbackPaused = false;
  state.resumeFeedback = true;
  await requestWakeLock();
  renderFlashcard({ touchProgress: false });
}


function toggleManualModeFromFlash() {
  state.settings.manualMode = !state.settings.manualMode;
  if (typeof touchStudyActivity === "function") touchStudyActivity(state.settings.manualMode ? "manual_mode_on" : "manual_mode_off");
  persistSettings();
  if (state.settings.manualMode && typeof flushPendingStudyForBoundary === "function") {
    flushPendingStudyForBoundary("manual_mode_on");
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload(1500);
  }
  renderFlashcard({ touchProgress: false });
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


function unlockSpeech() {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}

/* ===== 19-gesture.js ===== */
"use strict";

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
      if (typeof touchStudyActivity === "function") touchStudyActivity("gesture_" + String(direction || ""));
      triggerCardDirection(direction);
    });
  });
}

function amplifySwipeDelta(delta, viewportSize) {
  const raw = Number(delta) || 0;
  const magnitude = Math.abs(raw);
  if (!magnitude) return 0;
  const boosted = magnitude * 1.28 + Math.pow(magnitude, 1.18) * 0.34;
  const limit = Math.max(180, (Number(viewportSize) || 800) * 0.92);
  return Math.sign(raw) * Math.min(limit, boosted);
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
      if (button.dataset.cardTap === "tap-right" && revealZhManually()) return;
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
    // 手动中文模式下，整张卡片都优先承担“显示中文”。即使当前处于暂停态，
    // 第一次点击也只显示中文并保持暂停；再次点击才恢复播放，避免启动恢复后
    // 用户明明想看释义却意外开始自动播放。
    if (revealZhManually()) return;
    if (state.playbackPaused) {
      resumePlayback();
      return;
    }
    pausePlaybackFromCard();
  });

  stack.addEventListener("pointerdown", (event) => {
    if (state.transitioning || state.playbackPaused) return;
    const interactiveTarget = event.target.closest("button, a, input, select, textarea");
    // 点击热区本身也允许作为滑动起点，否则从左右边缘起手的滑动会失效。
    if (interactiveTarget && !interactiveTarget.matches("[data-card-tap]")) return;
    clearTimers();
    if (typeof touchStudyActivity === "function") touchStudyActivity("pointer_down");
    stack.setPointerCapture(event.pointerId);
    state.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      dx: 0,
      dy: 0,
      displayDx: 0,
      displayDy: 0
    };
    card.classList.remove("is-animated");
  });

  stack.addEventListener("pointermove", (event) => {
    if (!state.pointer || state.pointer.id !== event.pointerId) return;
    state.pointer.dx = event.clientX - state.pointer.startX;
    state.pointer.dy = event.clientY - state.pointer.startY;
    state.pointer.displayDx = amplifySwipeDelta(state.pointer.dx, window.innerWidth);
    state.pointer.displayDy = amplifySwipeDelta(state.pointer.dy, window.innerHeight);
    const rotate = state.pointer.displayDx / 28;
    updateCardSwipeFeedback(card, state.pointer.displayDx, state.pointer.displayDy);
    card.style.transform = `translate3d(${state.pointer.displayDx}px, ${state.pointer.displayDy}px, 0) rotate(${rotate}deg)`;
  });

  stack.addEventListener("pointerup", (event) => finishPointer(event, card));
  stack.addEventListener("pointercancel", (event) => finishPointer(event, card, true));
}

function finishPointer(event, card, cancelled = false) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const { dx, dy, displayDx, displayDy, startTime } = state.pointer;
  state.pointer = null;
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  const threshold = clamp(minSide * 0.055, 28, 46);
  const elapsed = Math.max(1, performance.now() - startTime);
  const rawDistance = Math.max(Math.abs(dx), Math.abs(dy));
  const displayedDistance = Math.max(Math.abs(displayDx), Math.abs(displayDy));
  const velocity = rawDistance / elapsed;
  const flick = rawDistance > 16 && velocity > 0.32;
  const didSwipe = !cancelled && (displayedDistance >= threshold || flick);
  state.suppressNextCardClickPause = cancelled || didSwipe || rawDistance > 6;

  if (!didSwipe) {
    snapBack(card);
    return;
  }

  triggerCardDirection(swipeDirectionFromDelta(displayDx, displayDy), card, { dx: displayDx, dy: displayDy });
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
    startCardTransition();
    animateOut(card, x, dy, () => {
      finishCardTransition();
      advanceWord("manual");
    });
  } else if (action === "previous") {
    if (state.currentIndex <= 0) {
      snapBack(card);
    } else {
      const x = window.innerWidth;
      startCardTransition();
      animateOut(card, x, dy, () => {
        finishCardTransition();
        goPrevious();
      });
    }
  } else if (action === "known") {
    markCurrent("known");
    startCardTransition();
    animateOut(card, dx, -window.innerHeight, () => {
      finishCardTransition();
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

/* ===== 20-study-flow.js ===== */
"use strict";

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


function clearCardTransitionTimer() {
  if (state.cardTransitionTimer) {
    clearTimeout(state.cardTransitionTimer);
    state.cardTransitionTimer = null;
  }
}


function clearTransitionSafetyTimer() {
  if (state.transitionSafetyTimer) {
    clearTimeout(state.transitionSafetyTimer);
    state.transitionSafetyTimer = null;
  }
}


function startCardTransition() {
  state.transitioning = true;
  clearTransitionSafetyTimer();
  state.transitionSafetyTimer = window.setTimeout(function() {
    if (state.transitioning) {
      if (typeof resetCardTransitionState === "function") resetCardTransitionState();
      else state.transitioning = false;
      state.pointer = null;
      clearCardTransitionTimer();
      appendAuditEvent({ type: "flash:transition_safety_reset", message: "transitioning reset by safety timer" });
      if (typeof processNavigationQueueSoon === "function") processNavigationQueueSoon();
    }
    state.transitionSafetyTimer = null;
  }, 900);
}


function finishCardTransition() {
  state.transitioning = false;
  clearTransitionSafetyTimer();
}


function resetCardTransitionState() {
  state.transitioning = false;
  state.pointer = null;
  clearCardTransitionTimer();
  clearTransitionSafetyTimer();
}


function animateOut(card, x, y, done) {
  card.classList.add("is-animated");
  card.style.opacity = "0";
  card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${x / 34}deg)`;
  clearCardTransitionTimer();
  state.cardTransitionTimer = window.setTimeout(function() {
    state.cardTransitionTimer = null;
    done();
  }, 210);
}


function markCurrent(kind) {
  const book = currentBook();
  const word = state.unitWords[state.currentIndex];
  if (!word) return;
  if (state.view === "flash") {
    state.lastUserStudyActionAt = Date.now();
    if (typeof touchStudyActivity === "function") touchStudyActivity("mark");
  }
  setWordMarkState(book.id, word.id, kind, { touch: true });
  appendAuditEvent({ type: "user:mark", message: "wordId=" + word.id + " kind=" + kind });
  updateSyncIndicator();
}


function undoMark(wordId) {
  const book = currentBook();
  if (state.view === "flash") {
    state.lastUserStudyActionAt = Date.now();
    if (typeof touchStudyActivity === "function") touchStudyActivity("undo");
  }
  setWordMarkState(book.id, wordId, null, { touch: true });
  appendAuditEvent({ type: "user:undo", message: "wordId=" + wordId });
  updateSyncIndicator();
  state.undoWordId = null;
  renderFlashcard();
}


function advanceWord(reason) {
  clearTimers();
  var progressReason = reason === "auto" ? "auto_advance" : reason === "manual" ? "manual_next" : reason ? "advance_" + String(reason) : "advance";
  if (typeof touchStudyActivity === "function") touchStudyActivity(progressReason);
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
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
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

  renderFlashcard({ touchProgress: true, progressReason: progressReason });
}


function finishCurrentGroup() {
  clearTimers();
  if (typeof touchStudyActivity === "function") touchStudyActivity("finish_group");
  const wasRecorded = state.currentWordRecorded;
  commitCurrentCardActivity({ counted: true });
  if (!wasRecorded) state.groupStats.seen += 1;
  if (state.currentIndex < state.unitWords.length) state.currentIndex += 1;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  renderBreak({
    manual: true,
    unitEnd: state.currentIndex >= state.unitWords.length,
    reviewEnd: Boolean(state.reviewMode)
  });
}


function goPrevious() {
  clearTimers();
  var progressReason = "manual_previous";
  if (typeof touchStudyActivity === "function") touchStudyActivity(progressReason);
  commitCurrentCardActivity();
  if (state.currentIndex <= 0) {
    renderFlashcard();
    return;
  }
  state.currentIndex -= 1;
  const word = state.unitWords[state.currentIndex];
  const marks = loadMarks(currentBook().id);
  state.undoWordId = marks.known.includes(word.id) || marks.unknown.includes(word.id) ? word.id : null;
  state.showZh = state.settings.manualZhReveal !== true;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  // 上一个词的新卡片从左侧轻进入；旧卡飞出方向在 triggerCardDirection() 中控制。
  state.cardEnterDirection = "from-left";
  renderFlashcard({ touchProgress: true, progressReason: progressReason });
}


function renderBreak(info) {
  if (typeof touchStudyActivity === "function") touchStudyActivity(info && info.unitEnd ? "break_unit_end" : "break");
  const enteringBreak = state.view !== "break";
  state.view = "break";
  state.breakInfo = info;
  clearTimers();
  releaseWakeLock();
  state.navQueue = [];
  if (typeof resetCardTransitionState === "function") resetCardTransitionState();
  else state.transitioning = false;
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
        <button class="btn btn--primary btn--wide" id="continueBtn" type="button">${info.unitEnd && !info.reviewEnd ? "下一单元" : "继续下一组"}</button>
        ${info.unitEnd && !info.reviewEnd && !state.reviewMode ? `<button class="btn btn--ghost btn--wide" id="replayUnitBtn" type="button">本单元从头再刷一遍</button>` : ""}
        ${roundUnknownIds.length && !info.reviewEnd ? `<button class="btn btn--ghost btn--wide" id="roundUnknownReviewBtn" type="button">仅复习本轮重难点 (${roundUnknownIds.length})</button>` : ""}
      </div>
    </section>
    ${renderSyncIndicator()}
  `;
  document.getElementById("continueBtn").addEventListener("click", continueAfterBreak);
  const replayUnitBtn = document.getElementById("replayUnitBtn");
  if (replayUnitBtn) replayUnitBtn.addEventListener("click", startCurrentUnitReplay);
  const roundReviewBtn = document.getElementById("roundUnknownReviewBtn");
  if (roundReviewBtn) roundReviewBtn.addEventListener("click", startRoundUnknownReview);
  if (enteringBreak && typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary("break");
  if (enteringBreak) autoPushToGist();
}


async function continueAfterBreak() {
  if (typeof touchStudyActivity === "function") touchStudyActivity("continue_after_break");
  const book = currentBook();
  if (state.breakInfo?.reviewEnd && ["round-unknown", "unit-replay"].includes(state.reviewMode?.mode) && state.roundReturn) {
    const ret = state.roundReturn;
    state.reviewMode = null;
    state.roundReturn = null;
    state.unitWords = ret.unitWords;
    state.currentIndex = ret.currentIndex;
    state.groupStats = createGroupStats();
    state.navQueue = [];
    if (typeof resetCardTransitionState === "function") resetCardTransitionState();
    else state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
    if (state.currentIndex >= state.unitWords.length) {
      state.groupStats = ret.groupStats || createGroupStats();
      renderBreak(ret.breakInfo || { unitEnd: true });
      return;
    }
    await requestWakeLock();
    renderFlashcard({ touchProgress: true, progressReason: "continue_after_break_return" });
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
  if (typeof resetCardTransitionState === "function") resetCardTransitionState();
  else state.transitioning = false;
  state.markFeedback = "";
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
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
  renderFlashcard({ touchProgress: true, progressReason: "continue_after_break" });
}


async function startCurrentUnitReplay() {
  if (typeof touchStudyActivity === "function") touchStudyActivity("unit_replay");
  const unit = Number(state.settings.unit) || 1;
  const words = buildAllUnitWords(unit);
  if (!words.length) return;
  state.roundReturn = {
    unitWords: state.unitWords,
    currentIndex: state.currentIndex,
    groupStats: { ...state.groupStats, unknownIds: [...(state.groupStats.unknownIds || [])] },
    breakInfo: state.breakInfo
  };
  state.unitWords = words;
  state.currentIndex = 0;
  state.groupStats = createGroupStats();
  state.navQueue = [];
  resetCardTransitionState();
  state.markFeedback = "";
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  state.playbackPaused = false;
  state.reviewMode = { mode: "unit-replay", label: `${unitDisplayLabel(currentBook(), unit)} · 从头重刷` };
  await requestWakeLock();
  renderFlashcard({ touchProgress: false, progressReason: "unit_replay" });
}


function getRoundUnknownIds() {
  return Array.from(new Set((state.groupStats.unknownIds || []).map(Number).filter(Boolean)));
}


async function startRoundUnknownReview() {
  if (typeof touchStudyActivity === "function") touchStudyActivity("round_unknown_review");
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
  if (typeof resetCardTransitionState === "function") resetCardTransitionState();
  else state.transitioning = false;
  state.markFeedback = "";
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  state.playbackPaused = false;
  state.reviewMode = { mode: "round-unknown", label: "本轮重难点复习", wordIds: ids };
  await requestWakeLock();
  renderFlashcard({ touchProgress: true, progressReason: "round_unknown_review" });
}


function renderCurrentView(options = {}) {
  if (state.view === "flash") renderFlashcard(options);
  else if (state.view === "setup") renderSetup();
  else if (state.view === "break") renderBreak(state.breakInfo || { unitEnd: false });
  else if (state.view === "loading") renderStudyLaunchLoading();
  else renderAuth();
}

/* ===== 21-archive-stats.js ===== */
"use strict";

async function openArchive() {
  commitCurrentCardActivity();
  clearTimers();
  state.statsOpen = false;
  state.archiveOpen = true;
  state.archiveStatus = "正在加载归档...";
  resetArchiveSelection();
  if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck("archive_open");
  renderCurrentView({ touchProgress: false });
  try {
    await ensureWords(currentBook());
    state.archiveStatus = "";
  } catch (error) {
    state.archiveStatus = error.message || "归档加载失败";
  }
  renderCurrentView({ touchProgress: false });
}

function openStats() {
  commitCurrentCardActivity();
  clearTimers();
  state.archiveOpen = false;
  resetArchiveSelection();
  state.statsOpen = true;
  if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck("stats_open");
  renderCurrentView({ touchProgress: false });
}

function closeStats() {
  state.statsOpen = false;
  renderCurrentView({ touchProgress: false });
}

function closeArchive() {
  state.archiveOpen = false;
  state.archiveStatus = "";
  resetArchiveSelection();
  renderCurrentView({ touchProgress: false });
}

function renderArchiveDrawer() {
  const book = currentBook();
  const words = state.wordsByBook.get(book.id) || [];
  const marks = loadMarks(book.id);
  const ids = state.archiveTab === "known" ? marks.known : marks.unknown;
  const groups = groupMarkedWords(words, ids);
  const status = state.archiveStatus ? `<div class="status archive-status">${escapeHtml(state.archiveStatus)}</div>` : "";
  const list = groups.length ? groups.map(renderArchiveGroup).join("") : `<div class="status">暂无记录。</div>`;
  const selectionHint = state.archiveSelectionMode === "unit"
    ? "点选 Unit 后开始组合刷词"
    : state.archiveSelectionMode === "word"
      ? "点选单词后批量撤销标记"
      : "长按 Unit 可组合刷词；展开后长按单词可批量撤销";

  return `
    <div class="archive-backdrop" id="archiveBackdrop">
      <aside class="archive-drawer" role="dialog" aria-modal="true">
        <header class="archive-head">
          <div>
            <h2>归档复盘</h2>
            <div class="archive-selection-hint">${escapeHtml(selectionHint)}</div>
          </div>
          ${archiveHeaderActionsHtml()}
        </header>
        <div class="tabs">
          <button class="tab ${state.archiveTab === "known" ? "is-active" : ""}" data-archive-tab="known" type="button">已删词库</button>
          <button class="tab ${state.archiveTab === "unknown" ? "is-active" : ""}" data-archive-tab="unknown" type="button">重难点词库</button>
        </div>
        <div class="archive-body">${status}${list}</div>
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
  const expanded = state.archiveExpandedUnits.has(Number(unit));
  const unitSelected = state.archiveSelectedUnits.has(Number(unit));
  const unitSelection = state.archiveSelectionMode === "unit";
  const wordSelection = state.archiveSelectionMode === "word";
  const list = words.map((word) => {
    const selected = state.archiveSelectedWordIds.has(Number(word.id));
    return `
      <div class="archive-word${selected ? " is-selected" : ""}${wordSelection ? " is-selectable" : ""}" data-archive-word-id="${Number(word.id)}" role="button" tabindex="0" aria-pressed="${selected ? "true" : "false"}">
        <span class="archive-select-indicator" aria-hidden="true">${selected ? "✓" : ""}</span>
        <strong>${escapeHtml(word.en)}</strong>
        <span>${escapeHtml(formatDefinition(word))}</span>
      </div>
    `;
  }).join("");
  return `
    <details class="unit-group${unitSelected ? " is-selected" : ""}${unitSelection ? " is-selectable" : ""}" data-archive-unit="${Number(unit)}" ${expanded ? "open" : ""}>
      <summary data-archive-unit-summary="${Number(unit)}" aria-pressed="${unitSelected ? "true" : "false"}">
        <span class="archive-select-indicator" aria-hidden="true">${unitSelected ? "✓" : ""}</span>
        <span>${escapeHtml(unitDisplayLabel(book, unit))} · ${words.length} 个</span>
      </summary>
      <div class="word-list">${list}</div>
    </details>
  `;
}

function bindArchiveEvents() {
  const close = document.getElementById("closeArchiveBtn");
  const cancelSelection = document.getElementById("cancelArchiveSelectionBtn");
  const selectionAction = document.getElementById("archiveSelectionActionBtn");
  const backdrop = document.getElementById("archiveBackdrop");
  if (close) close.addEventListener("click", closeArchive);
  if (cancelSelection) cancelSelection.addEventListener("click", () => {
    resetArchiveSelection({ collapse: false });
    renderCurrentView({ touchProgress: false });
  });
  if (selectionAction) selectionAction.addEventListener("click", handleArchiveSelectionAction);
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeArchive();
    });
  }
  document.querySelectorAll("[data-archive-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.archiveTab = button.dataset.archiveTab;
      state.archiveStatus = "";
      resetArchiveSelection();
      if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck("archive_tab_switch");
      renderCurrentView({ touchProgress: false });
    });
  });
  document.querySelectorAll(".unit-group[data-archive-unit]").forEach((details) => {
    const unit = Number(details.dataset.archiveUnit);
    details.addEventListener("toggle", () => {
      if (details.open) state.archiveExpandedUnits.add(unit);
      else state.archiveExpandedUnits.delete(unit);
    });
  });
  document.querySelectorAll("[data-archive-unit-summary]").forEach((summary) => {
    const unit = Number(summary.dataset.archiveUnitSummary);
    const key = `unit:${unit}`;
    bindArchiveLongPress(summary, key, () => toggleArchiveUnitSelection(unit));
    summary.addEventListener("click", (event) => {
      if (state.archiveSuppressClickKey === key) {
        state.archiveSuppressClickKey = "";
        event.preventDefault();
        return;
      }
      if (state.archiveSelectionMode === "unit") {
        event.preventDefault();
        toggleArchiveUnitSelection(unit);
      }
    });
  });
  document.querySelectorAll("[data-archive-word-id]").forEach((row) => {
    const wordId = Number(row.dataset.archiveWordId);
    const key = `word:${wordId}`;
    bindArchiveLongPress(row, key, () => toggleArchiveWordSelection(wordId));
    const activate = (event) => {
      if (state.archiveSuppressClickKey === key) {
        state.archiveSuppressClickKey = "";
        event.preventDefault();
        return;
      }
      if (state.archiveSelectionMode === "word") {
        event.preventDefault();
        toggleArchiveWordSelection(wordId);
      }
    };
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
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

// ── v2 sync.json ops engine ───────────────────────────────────────────

/* ===== 21a-archive-selection.js ===== */
"use strict";

function resetArchiveSelection(options = {}) {
  state.archiveSelectionMode = "";
  state.archiveSelectedUnits = new Set();
  state.archiveSelectedWordIds = new Set();
  state.archiveSuppressClickKey = "";
  if (options.collapse !== false) state.archiveExpandedUnits = new Set();
}

function archiveSelectionCount() {
  if (state.archiveSelectionMode === "unit") return state.archiveSelectedUnits.size;
  if (state.archiveSelectionMode === "word") return state.archiveSelectedWordIds.size;
  return 0;
}

function archiveHeaderActionsHtml() {
  const count = archiveSelectionCount();
  if (!state.archiveSelectionMode) return '<button class="btn btn--ghost" id="closeArchiveBtn" type="button">关闭</button>';
  const actionLabel = state.archiveSelectionMode === "unit" ? `开始刷词 (${count})` : `撤销 (${count})`;
  return `
    <div class="archive-selection-actions">
      <button class="btn btn--ghost" id="cancelArchiveSelectionBtn" type="button">取消</button>
      <button class="btn btn--primary" id="archiveSelectionActionBtn" type="button" ${count ? "" : "disabled"}>${escapeHtml(actionLabel)}</button>
    </div>
  `;
}

function beginArchiveSelection(mode) {
  if (mode !== "unit" && mode !== "word") return;
  if (state.archiveSelectionMode !== mode) {
    state.archiveSelectionMode = mode;
    state.archiveSelectedUnits = new Set();
    state.archiveSelectedWordIds = new Set();
  }
}

function toggleArchiveUnitSelection(unit) {
  const value = Number(unit);
  if (!Number.isFinite(value)) return;
  beginArchiveSelection("unit");
  if (state.archiveSelectedUnits.has(value)) state.archiveSelectedUnits.delete(value);
  else state.archiveSelectedUnits.add(value);
  renderCurrentView({ touchProgress: false });
}

function toggleArchiveWordSelection(wordId) {
  const value = Number(wordId);
  if (!Number.isFinite(value)) return;
  beginArchiveSelection("word");
  if (state.archiveSelectedWordIds.has(value)) state.archiveSelectedWordIds.delete(value);
  else state.archiveSelectedWordIds.add(value);
  renderCurrentView({ touchProgress: false });
}

function bindArchiveLongPress(element, key, callback) {
  if (!element) return;
  let timer = null;
  let startX = 0;
  let startY = 0;
  let pointerId = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pointerId = null;
  };
  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancel();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    timer = window.setTimeout(() => {
      timer = null;
      state.archiveSuppressClickKey = key;
      if (navigator.vibrate) navigator.vibrate(20);
      callback();
    }, 520);
  });
  element.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) cancel();
  });
  element.addEventListener("pointerup", cancel);
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("contextmenu", (event) => event.preventDefault());
}

async function startSelectedArchiveUnits() {
  const selectedUnits = new Set(Array.from(state.archiveSelectedUnits).map(Number));
  if (!selectedUnits.size) return;
  const book = currentBook();
  const words = await ensureWords(book);
  const marks = loadMarks(book.id);
  const markedIds = new Set(state.archiveTab === "known" ? marks.known : marks.unknown);
  const queue = words.filter((word) => selectedUnits.has(Number(word.unit)) && markedIds.has(Number(word.id)));
  if (!queue.length) {
    state.archiveStatus = "所选 Unit 已没有可刷的归档单词。";
    resetArchiveSelection({ collapse: false });
    renderCurrentView({ touchProgress: false });
    return;
  }
  state.unitWords = queue;
  state.currentIndex = 0;
  state.groupStats = createGroupStats();
  state.reviewMode = {
    mode: "archive-unit-selection",
    label: `${state.archiveTab === "known" ? "已删词库" : "重难点词库"} · ${selectedUnits.size} 个 Unit`,
    wordIds: queue.map((word) => word.id)
  };
  state.roundReturn = null;
  state.undoWordId = null;
  state.navQueue = [];
  resetCardTransitionState();
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  state.playbackPaused = false;
  state.archiveOpen = false;
  resetArchiveSelection();
  await requestWakeLock();
  renderFlashcard({ touchProgress: false, progressReason: "archive_unit_selection" });
}

function undoSelectedArchiveWords() {
  const ids = Array.from(state.archiveSelectedWordIds).map(Number).filter(Boolean);
  if (!ids.length) return;
  const kindLabel = state.archiveTab === "known" ? "上滑" : "下滑";
  const ok = setWordMarkStatesBatch(currentBook().id, ids, null);
  if (!ok) {
    state.archiveStatus = "撤销失败：浏览器未能完整保存修改。";
    renderCurrentView({ touchProgress: false });
    return;
  }
  appendAuditEvent({ type: "user:archive_batch_undo", message: `kind=${state.archiveTab} count=${ids.length}` });
  state.archiveStatus = `已撤销 ${ids.length} 个单词的${kindLabel}标记。`;
  resetArchiveSelection({ collapse: false });
  updateSyncIndicator();
  renderCurrentView({ touchProgress: false });
}

function handleArchiveSelectionAction() {
  if (state.archiveSelectionMode === "unit") startSelectedArchiveUnits();
  else if (state.archiveSelectionMode === "word") undoSelectedArchiveWords();
}

/* ===== 22-sync-payload.js ===== */
"use strict";

function collectSyncPayload() {
  const progress = {};
  const unknownProgress = {};
  const marks = {};
  const markStates = {};
  const activity = {};
  const unitStats = {};
  BOOKS.forEach((book) => {
    progress[book.id] = loadProgress(book.id);
    unknownProgress[book.id] = collectUnknownProgressForBook(book);
    markStates[book.id] = loadMarkStates(book.id);
    marks[book.id] = deriveMarksFromMarkStates(markStates[book.id]);
    activity[book.id] = loadActivity(book.id);
    unitStats[book.id] = loadUnitStats(book.id);
  });
  return {
    version: 1,
    updatedAt: beijingISOString(),
    activeBookId: state.settings.bookId,
    settings: { ...state.settings },
    progress,
    unknownProgress,
    marks,
    markStates,
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
  const markStates = {};
  const activity = {};
  const unitStats = {};
  BOOKS.forEach((book) => {
    progress[book.id] = sanitizeProgressPayload(source.progress?.[book.id] || { lastWordId: null });
    unknownProgress[book.id] = normalizeUnknownProgressPayload(book, source.unknownProgress?.[book.id]);

    var sourceMarkStates = sanitizeMarkStatesPayload(source.markStates?.[book.id]);
    if (Object.keys(sourceMarkStates).length) {
      markStates[book.id] = sourceMarkStates;
      marks[book.id] = deriveMarksFromMarkStates(sourceMarkStates);
    } else {
      marks[book.id] = sanitizeMarksPayload(source.marks?.[book.id]);
      var legacyUpdatedAt = source.updatedAt || source.lastSyncedLocalUpdatedAt || source.localUpdatedAt || "1970-01-01T00:00:00.000Z";
      markStates[book.id] = deriveMarkStatesFromMarks(book.id, marks[book.id], legacyUpdatedAt);
    }

    activity[book.id] = sanitizeActivityPayload(source.activity?.[book.id]);
    unitStats[book.id] = sanitizeUnitStatsPayload(source.unitStats?.[book.id]);
  });
  return {
    version: 1,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : beijingISOString(),
    activeBookId: BOOKS.some((book) => book.id === source.activeBookId) ? source.activeBookId : normalizeSettingsPayload(source.settings).bookId,
    settings: normalizeSettingsPayload(source.settings),
    progress,
    unknownProgress,
    marks,
    markStates,
    activity,
    unitStats
  };
}

function compactSyncPayloadForTransport(payload) {
  const normalized = normalizeSyncPayload(payload || {});
  const progress = {};
  const unknownProgress = {};
  const markStates = {};
  const activity = {};
  const unitStats = {};

  BOOKS.forEach(function(book) {
    const bookId = book.id;
    const progressItem = sanitizeProgressPayload(normalized.progress && normalized.progress[bookId]);
    if (progressItem.lastWordId) progress[bookId] = progressItem;

    const unknown = normalizeUnknownProgressPayload(book, normalized.unknownProgress && normalized.unknownProgress[bookId]);
    const units = {};
    Object.keys(unknown.units || {}).forEach(function(unit) {
      const item = sanitizeProgressPayload(unknown.units[unit]);
      if (item.lastWordId) units[unit] = item;
    });
    const bookProgress = sanitizeProgressPayload(unknown.book);
    if (bookProgress.lastWordId || Object.keys(units).length) {
      unknownProgress[bookId] = { book: bookProgress.lastWordId ? bookProgress : { lastWordId: null }, units: units };
    }

    const states = sanitizeMarkStatesPayload(normalized.markStates && normalized.markStates[bookId]);
    if (Object.keys(states).length) markStates[bookId] = states;

    const activityItem = sanitizeActivityPayload(normalized.activity && normalized.activity[bookId]);
    if (Object.keys(activityItem.days || {}).length) activity[bookId] = activityItem;

    const stats = sanitizeUnitStatsPayload(normalized.unitStats && normalized.unitStats[bookId]);
    const nonEmptyUnits = {};
    Object.keys(stats.units || {}).forEach(function(unit) {
      const item = stats.units[unit] || {};
      if (Number(item.completed) > 0) nonEmptyUnits[unit] = item;
    });
    if (Object.keys(nonEmptyUnits).length) unitStats[bookId] = { units: nonEmptyUnits };
  });

  return {
    version: 1,
    updatedAt: normalized.updatedAt,
    activeBookId: normalized.activeBookId,
    settings: normalized.settings,
    progress: progress,
    unknownProgress: unknownProgress,
    // marks 可由 markStates 确定性推导；旧格式读取兼容仍保留在 normalizeSyncPayload 中。
    markStates: markStates,
    activity: activity,
    unitStats: unitStats
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
    validateMarkStatesForBook(payload.markStates?.[book.id]) &&
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


function validateMarkStatesForBook(markStates) {
  if (markStates === undefined || markStates === null) return true;
  if (!isPlainObject(markStates)) return false;
  return Object.entries(markStates).every(function(entry) {
    var wordId = entry[0];
    var item = entry[1];
    var id = Number(wordId);
    if (!Number.isFinite(id) || id <= 0) return false;
    if (!isPlainObject(item)) return false;
    if (item.value !== "known" && item.value !== "unknown" && item.value !== null) return false;
    if (typeof item.updatedAt !== "string" || !item.updatedAt) return false;
    if (Number.isNaN(Date.parse(item.updatedAt))) return false;
    if (typeof item.clientId !== "string") return false;
    var seq = Number(item.seq);
    if (!Number.isFinite(seq) || seq < 0) return false;
    return true;
  });
}


function hasMarkStatesBusinessData(markStates) {
  if (!isPlainObject(markStates)) return false;
  return Object.keys(markStates).some(function(bookId) {
    var bookStates = markStates[bookId];
    return isPlainObject(bookStates) && Object.keys(bookStates).length > 0;
  });
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
    const markStates = sanitizeMarkStatesPayload(payload.markStates?.[book.id]);
    return !normalizeIdList(marks.known).length &&
      !normalizeIdList(marks.unknown).length &&
      !Object.keys(markStates).length;
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


function progressDepth(progress) {
  const sanitized = sanitizeProgressPayload(progress);
  const unit = Number(sanitized.unit) || 0;
  const lastWordId = Number(sanitized.lastWordId) || 0;
  return unit * 100000 + lastWordId;
}

// syncContentScore 及其 5 个 helper 已删除。同步决策不使用数据量评分。


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

/* ===== 23-sync-v2-compat.js ===== */
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

/* ===== 24-sync-remote-api.js ===== */
"use strict";

function classifyParsedPayloadSnapshot(snapshot, extra = {}) {
  const normalized = normalizeSyncPayload(snapshot || {});
  if (!validateSyncPayload(normalized)) return { kind: "invalid", reason: extra.reason || "payload validate failed", raw: extra.raw || null };
  const payloadHash = businessPayloadHash(normalized);
  return {
    kind: hasBusinessData(normalized) ? "valid_nonempty" : "valid_empty",
    schemaVersion: extra.schemaVersion || 1,
    snapshot: normalized,
    payload: normalized,
    payloadHash,
    ops: extra.ops || [],
    clients: extra.clients || {},
    rawV1: extra.rawV1,
    rawV2: extra.rawV2,
    payloadHashMismatch: extra.envelopeHash && extra.envelopeHash !== payloadHash,
    envelopePayloadHash: extra.envelopeHash || ""
  };
}


function parseSyncPayloadContent(content) {
  if (!String(content || "").trim()) return { kind: "empty", reason: "blank" };
  try {
    var payload = JSON.parse(content);
    if (!isPlainObject(payload) || !Object.keys(payload).length) return { kind: "empty", reason: "empty object" };

    if (payload.schemaVersion === 2) {
      if (!isPlainObject(payload.snapshot)) return { kind: "empty", reason: "v2 snapshot missing" };
      const ops = Array.isArray(payload.ops) ? payload.ops : [];
      if (ops.some(function(op) { return !isKnownV2Op(op); })) {
        return { kind: "v2_unknown_ops", reason: "v2 包含未知 ops，不能可靠 reduce", raw: payload, rawV2: payload };
      }
      let snapshot = normalizeSyncPayload(payload.snapshot || {});
      if (ops.length > 0) snapshot = reduceOps(snapshot, ops);
      return classifyParsedPayloadSnapshot(snapshot, {
        schemaVersion: 2,
        ops,
        clients: isPlainObject(payload.clients) ? payload.clients : {},
        rawV2: payload,
        raw: payload,
        reason: "v2 reduced"
      });
    }

    if (payload.version === 1 && isPlainObject(payload.payload)) {
      return classifyParsedPayloadSnapshot(payload.payload, {
        schemaVersion: 1,
        rawV1: payload,
        raw: payload,
        envelopeHash: typeof payload.payloadHash === "string" ? payload.payloadHash : ""
      });
    }

    if (payload.version === 1) {
      if (!isPlainObject(payload.settings) || !isPlainObject(payload.progress)) return { kind: "empty", reason: "legacy v1 no business fields" };
      return classifyParsedPayloadSnapshot(payload, { schemaVersion: 1, rawV1: payload, raw: payload });
    }

    return { kind: "invalid", reason: "unknown schema", raw: payload };
  } catch (error) {
    return { kind: "invalid", reason: error && error.message || "JSON parse failed" };
  }
}
function gistApiUrl(gistId) {
  return "https://api.github.com/gists/" + encodeURIComponent(String(gistId || "").trim());
}

function githubHttpError(response, action, details = {}) {
  return createSyncRequestError((action || "GitHub 请求") + "失败：HTTP " + Number(response && response.status || 0), {
    kind: "http",
    stage: details.stage || "github",
    method: details.method || "GET",
    transport: details.transport || "fetch",
    httpStatus: Number(response && response.status || 0),
    urlHost: "api.github.com",
    rateLimited: details.rateLimited === true,
    retryAt: details.retryAt || ""
  });
}

async function fetchGistMetadataWithCredentials(options = {}) {
  const gistId = String(options.gistId || "").trim();
  const token = String(options.token || "").trim();
  const allowJsonp = options.allowJsonp !== false;
  const url = gistApiUrl(gistId);
  let anonymousResponse = null;
  let anonymousError = null;

  try {
    anonymousResponse = await fetchWithTimeout(url, {
      headers: { Accept: "application/vnd.github+json" }
    }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_metadata_anonymous", transport: "anonymous_fetch" });
  } catch (error) {
    anonymousError = error;
  }

  if (anonymousResponse && anonymousResponse.ok) {
    return {
      gist: await anonymousResponse.json(),
      readOnlyAuthFallback: false,
      authenticatedRead: false,
      authStatus: 0,
      readTransport: "anonymous_fetch"
    };
  }

  if (anonymousError && allowJsonp && isFetchNetworkFailure(anonymousError)) {
    try {
      const wrapped = await fetchJsonp(url, GITHUB_GET_TIMEOUT_MS, { stage: "gist_metadata_jsonp" });
      const status = Number(wrapped && wrapped.meta && wrapped.meta.status || 0);
      if (status >= 200 && status < 300 && wrapped && wrapped.data) {
        return {
          gist: wrapped.data,
          readOnlyAuthFallback: false,
          authenticatedRead: false,
          authStatus: 0,
          readTransport: "jsonp"
        };
      }
      if (status && status !== 403 && status !== 404) {
        throw createSyncRequestError("GitHub JSONP 读取失败：HTTP " + status, {
          kind: "http",
          stage: "gist_metadata_jsonp",
          method: "GET",
          transport: "jsonp",
          httpStatus: status,
          urlHost: "api.github.com"
        });
      }
    } catch (jsonpError) {
      anonymousError.jsonpError = requestErrorTechnical(jsonpError);
    }
  }

  const anonymousStatus = Number(anonymousResponse && anonymousResponse.status || 0);
  const shouldTryAuthenticated = Boolean(token) && (
    anonymousError || anonymousStatus === 401 || anonymousStatus === 403 || anonymousStatus === 404
  );

  if (shouldTryAuthenticated) {
    let authResponse;
    try {
      authResponse = await fetchWithTimeout(url, {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json"
        }
      }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_metadata_authenticated", transport: "authenticated_fetch" });
    } catch (authError) {
      if (anonymousError) authError.anonymousError = requestErrorTechnical(anonymousError);
      throw authError;
    }
    if (authResponse.ok) {
      return {
        gist: await authResponse.json(),
        readOnlyAuthFallback: false,
        authenticatedRead: true,
        authStatus: authResponse.status,
        readTransport: "authenticated_fetch"
      };
    }
    const classified = await classifyGithubResponseError(authResponse, "读取 Gist");
    const error = githubHttpError(authResponse, "读取 Gist", {
      stage: "gist_metadata_authenticated",
      method: "GET",
      transport: "authenticated_fetch",
      rateLimited: classified.rateLimited,
      retryAt: classified.retryAt
    });
    error.message = classified.message;
    error.technical = classified.technical;
    throw error;
  }

  if (anonymousResponse) {
    const classified = await classifyGithubResponseError(anonymousResponse, "读取 Gist");
    const error = githubHttpError(anonymousResponse, "读取 Gist", {
      stage: "gist_metadata_anonymous",
      method: "GET",
      transport: "anonymous_fetch",
      rateLimited: classified.rateLimited,
      retryAt: classified.retryAt
    });
    error.message = classified.message;
    error.technical = classified.technical;
    throw error;
  }

  throw anonymousError || createSyncRequestError("无法访问 GitHub Gist", {
    kind: "network",
    stage: "gist_metadata_anonymous",
    method: "GET",
    transport: "anonymous_fetch",
    urlHost: "api.github.com"
  });
}

function sortedGistRecoveryCandidates(files) {
  return Object.values(files || {})
    .filter(function(file) {
      return file && file.filename !== SYNC_BACKUP_FILE_NAME && /\.json$/i.test(file.filename || "");
    })
    .sort(function(a, b) {
      var an = String(a && a.filename || "");
      var bn = String(b && b.filename || "");
      var aDaily = an.startsWith(SYNC_CLOUD_BACKUP_PREFIX);
      var bDaily = bn.startsWith(SYNC_CLOUD_BACKUP_PREFIX);
      if (aDaily !== bDaily) return aDaily ? -1 : 1;
      return bn.localeCompare(an);
    });
}

async function fetchGistSyncPayload() {
  const metadataResult = await fetchGistMetadata();
  const { gist, readOnlyAuthFallback, authStatus, authenticatedRead, readTransport } = metadataResult;
  var remoteVersion = (gist.history && gist.history[0] && gist.history[0].version) || "";
  const remoteUpdatedAt = gist.updated_at || "";
  const files = gist.files || {};
  const fileNames = Object.keys(files);
  const primary = files[SYNC_FILE_NAME];
  if (primary) {
    const content = await readGistFileContent(primary, { preferAnonymous: true });
    return {
      ...parseSyncPayloadContent(content),
      rawContent: content,
      remoteVersion,
      remoteUpdatedAt,
      fileName: SYNC_FILE_NAME,
      fileNames,
      readOnlyAuthFallback,
      authenticatedRead,
      authStatus,
      readTransport
    };
  }

  const candidates = sortedGistRecoveryCandidates(files);
  for (const file of candidates) {
    const content = await readGistFileContent(file, { preferAnonymous: true });
    const parsed = parseSyncPayloadContent(content);
    if (isRemoteValidKind(parsed.kind)) {
      return {
        ...parsed,
        rawContent: content,
        remoteVersion,
        remoteUpdatedAt,
        fileName: file.filename || "",
        fileNames,
        readOnlyAuthFallback,
        authenticatedRead,
        authStatus,
        readTransport
      };
    }
  }
  return {
    kind: "missing",
    rawContent: "",
    remoteVersion,
    remoteUpdatedAt,
    fileName: "",
    fileNames,
    readOnlyAuthFallback,
    authenticatedRead,
    authStatus,
    readTransport,
    reason: "sync.json missing"
  };
}

async function fetchGistMetadata() {
  return fetchGistMetadataWithCredentials({
    gistId: state.cloud.gistId,
    token: state.cloud.token,
    allowJsonp: true
  });
}

async function readGistFileContent(file, options = {}) {
  if (!file.truncated && typeof file.content === "string") return file.content;
  if (!file.raw_url) return "";

  let anonymousResponse = null;
  let anonymousError = null;
  try {
    anonymousResponse = await fetchWithTimeout(file.raw_url, {
      headers: { Accept: "application/vnd.github.raw" }
    }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_raw_anonymous", transport: "anonymous_fetch" });
  } catch (error) {
    anonymousError = error;
  }
  if (anonymousResponse && anonymousResponse.ok) return anonymousResponse.text();

  const status = Number(anonymousResponse && anonymousResponse.status || 0);
  if (state.cloud.token && (anonymousError || status === 401 || status === 403 || status === 404)) {
    const authResponse = await fetchWithTimeout(file.raw_url, {
      headers: {
        Authorization: "Bearer " + state.cloud.token,
        Accept: "application/vnd.github.raw"
      }
    }, GITHUB_GET_TIMEOUT_MS, { stage: "gist_raw_authenticated", transport: "authenticated_fetch" });
    if (authResponse.ok) return authResponse.text();
    const classified = await classifyGithubResponseError(authResponse, "读取 Gist 文件");
    const error = githubHttpError(authResponse, "读取 Gist 文件", {
      stage: "gist_raw_authenticated",
      method: "GET",
      transport: "authenticated_fetch",
      rateLimited: classified.rateLimited,
      retryAt: classified.retryAt
    });
    error.message = classified.message;
    error.technical = classified.technical;
    throw error;
  }
  if (anonymousResponse) {
    throw githubHttpError(anonymousResponse, "读取 Gist 文件", {
      stage: "gist_raw_anonymous",
      method: "GET",
      transport: "anonymous_fetch"
    });
  }
  throw anonymousError || createSyncRequestError("云端文件读取失败", {
    kind: "network",
    stage: "gist_raw_anonymous",
    method: "GET",
    transport: "anonymous_fetch",
    urlHost: "gist.githubusercontent.com"
  });
}

function isRemoteValidKind(kind) {
  return kind === "valid_nonempty" || kind === "valid_empty";
}


function isRemoteEmptyKind(kind) {
  return kind === "missing" || kind === "empty" || kind === "valid_empty";
}


function currentRemoteHash(remote) {
  return remote && isRemoteValidKind(remote.kind) && remote.snapshot ? businessPayloadHash(remote.snapshot) : "";
}


function currentRemotePayload(remote) {
  if (!remote) return null;
  if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") return null;
  if (remote.payload && isPlainObject(remote.payload)) return normalizeSyncPayload(remote.payload);
  if (remote.snapshot && isPlainObject(remote.snapshot)) return normalizeSyncPayload(remote.snapshot);
  if (remote.parsed && remote.parsed.payload && isPlainObject(remote.parsed.payload)) return normalizeSyncPayload(remote.parsed.payload);
  if (remote.parsed && remote.parsed.snapshot && isPlainObject(remote.parsed.snapshot)) return normalizeSyncPayload(remote.parsed.snapshot);
  return null;
}


function remoteHasBusinessPayload(remote) {
  const payload = currentRemotePayload(remote);
  return Boolean(payload && hasBusinessData(payload));
}


function remoteIsEmptyPayload(remote) {
  if (!remote) return true;
  if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") return false;
  if (remote.kind === "missing" || remote.kind === "empty" || remote.kind === "valid_empty") return true;
  const payload = currentRemotePayload(remote);
  if (!payload) return false;
  return !hasBusinessData(payload);
}


function githubRetryAtFromResponse(response) {
  if (!response || !response.headers || typeof response.headers.get !== "function") return "";
  var now = Date.now();
  var candidates = [];
  var retryAfter = String(response.headers.get("Retry-After") || "").trim();
  if (retryAfter) {
    if (/^\d+$/.test(retryAfter)) candidates.push(now + Number(retryAfter) * 1000);
    else {
      var retryDate = Date.parse(retryAfter);
      if (Number.isFinite(retryDate)) candidates.push(retryDate);
    }
  }
  var reset = Number(response.headers.get("X-RateLimit-Reset") || 0);
  if (Number.isFinite(reset) && reset > 0) candidates.push(reset * 1000);
  var future = candidates.filter(function(value) { return Number.isFinite(value) && value > now; });
  if (!future.length) return "";
  return beijingISOString(new Date(Math.max.apply(Math, future)));
}


async function classifyGithubResponseError(response, action) {
  let body = "";
  try { body = await response.text(); } catch (_) {}
  const status = response.status;
  const remaining = response.headers && response.headers.get ? response.headers.get("X-RateLimit-Remaining") : "";
  const reset = response.headers && response.headers.get ? response.headers.get("X-RateLimit-Reset") : "";
  let message = (action || "GitHub 请求") + "失败：HTTP " + status;
  if (status === 401) message = "GitHub PAT 无效或已过期，请重新生成带 Gist 权限的 PAT。";
  else if (status === 403 && remaining === "0") message = "GitHub API 限流，请等待到 " + (reset ? beijingISOString(new Date(Number(reset) * 1000)) : "reset 时间") + " 后重试。";
  else if (status === 403) message = "GitHub API 拒绝访问，可能是 PAT 权限不足、scope 不含 Gist，或触发限流。";
  else if (status === 404) message = "没有找到这个 Gist，或当前 token 无权访问 private gist。";
  else if (status === 409) message = "GitHub Gist 并发更新冲突，即将自动重试。";
  else if (status === 422) message = "GitHub 拒绝 PATCH 内容或请求格式，请导出诊断联系处理。";
  else if (status >= 500) message = "GitHub 服务端异常，请稍后重试。";
  var rateLimited = status === 429 || remaining === "0" || Boolean(response.headers && response.headers.get && response.headers.get("Retry-After"));
  return {
    message,
    technical: body ? body.slice(0, 1200) : "HTTP " + status,
    rateLimited,
    retryAt: rateLimited ? githubRetryAtFromResponse(response) : ""
  };
}

function syncErrorMessage(error) {
  const normalized = normalizeSyncRequestError(error);
  if (normalized.kind === "timeout") return "连接 GitHub 超时，本地数据已保存，稍后会自动重试。";
  if (normalized.kind === "network") return "当前无法完成 GitHub Gist 网络请求，本地数据已保存，稍后会自动重试。";
  if (normalized.httpStatus === 401) return "GitHub PAT 无效或已过期，请重新生成带 Gist 写入权限的 PAT。";
  if (normalized.httpStatus === 403) return "GitHub 拒绝访问：可能是 PAT 权限不足或 API 限流。";
  if (normalized.httpStatus === 404) return "没有找到这个 Gist，或当前 PAT 无权访问它。";
  return normalized.message || "云同步失败";
}

/* ===== 25-sync-status-config.js ===== */
"use strict";

// sync status computation moved to 25a-sync-status-core.js.

// ── 配置校验 ──────────────────────────────────────────────────────────


function validateSavedCloudConfig(cloud) {
  var token = (cloud && cloud.token || "").trim();
  var gistId = (cloud && cloud.gistId || "").trim();
  return validateCloudConfigDraft({ token: token, gistId: gistId });
}


function validateCloudConfigDraft(_ref) {
  var token = _ref.token;
  var gistId = _ref.gistId;
  var errors = [];
  var t = (token || "").trim();
  var g = (gistId || "").trim();

  if (!t) errors.push("GitHub PAT 不能为空");
  if (!g) errors.push("Gist ID 不能为空");

  if (t && g && t === g) {
    errors.push("GitHub PAT 和 Gist ID 完全相同。您可能把 Gist ID 粘贴到了 PAT 输入框。请分别填入两个不同的值。");
  }

  var PAT_PREFIX_RE = /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/;
  var GIST_ID_RE = /^[a-f0-9]{20,64}$/i;

  if (t && GIST_ID_RE.test(t) && !PAT_PREFIX_RE.test(t)) {
    errors.push("GitHub PAT 看起来像 Gist ID（纯十六进制字符串）。请确认是否把 Gist ID 粘贴到了 PAT 输入框。PAT 通常以 ghp_ 或 github_pat_ 开头。");
  }

  if (g && PAT_PREFIX_RE.test(g)) {
    errors.push("Gist ID 看起来像 GitHub Token（以 ghp_/github_pat_ 开头）。请确认是否把 PAT 粘贴到了 Gist ID 输入框。");
  }

  if (t && t.length < 20 && errors.length === 0) {
    errors.push("GitHub PAT 太短，可能不是完整的 Personal Access Token。");
  }

  return { ok: errors.length === 0, errors: errors };
}


function savedCloudConfigGate() {
  state.cloud.token = (state.cloud.token || "").trim();
  state.cloud.gistId = (state.cloud.gistId || "").trim();
  const validation = validateSavedCloudConfig(state.cloud);
  if (!validation.ok) {
    state.syncMeta = ensureSyncMeta(state.syncMeta);
    state.syncMeta.cloudWritable = false;
    state.syncMeta.readOnlyMode = false;
    persistSyncMeta();
    setHashSyncStatus("invalid_config", validation.errors.join("；"));
    // 区分未配置 vs 已配置但无效（前者不弹横幅）
    var hasAnyConfig = Boolean(state.cloud.token || state.cloud.gistId);
    return { ok: false, message: validation.errors.join("；"), configured: hasAnyConfig };
  }
  persistCloud();
  return { ok: true, message: "", configured: true };
}


function setReadOnlySyncState(message, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.cloudWritable = false;
  state.syncMeta.readOnlyMode = true;
  state.syncMeta.lastSyncErrorAt = beijingISOString();
  state.syncMeta.lastSyncErrorMessage = message || "GitHub Gist 当前不可写";
  persistSyncMeta();
  setHashSyncStatus("read_only", state.syncMeta.lastSyncErrorMessage, { runId: options.runId });
  showSyncProblemDialog({ severity: "warning", code: "READ_ONLY", title: "云同步只读", message: state.syncMeta.lastSyncErrorMessage, runId: options.runId });
  return true;
}


function shouldSkipSyncForBackoff(bypassBackoff) {
  if (bypassBackoff) return false;
  const nextRetryAt = ensureHashSyncState(state.syncHashState).nextRetryAt;
  const time = Date.parse(nextRetryAt || "");
  return Number.isFinite(time) && time > Date.now();
}


async function bootstrapSyncAfterInit(reason = "init") {
  // 防重入 — 仅限制 init，不限制 config_saved/manual/local_change
  if (reason === "init") {
    if (state.initialSyncStarted) return;
    state.initialSyncStarted = true;
  }
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  const localAtStart = refreshLocalPayloadHash({ persist: true });
  writeHashBackup("startup", localAtStart.payload, reason);
  updateSyncIndicator();
  return syncTick({ reason: reason || "init" });
}


async function initializeSync({ reason = "init" } = {}) {
  if (!isAutoSyncEnabled()) {
    updateSyncIndicator();
    appendAuditEvent({ type: "sync:init_skipped_auto_disabled", message: "reason=" + String(reason || "init") });
    return false;
  }
  return bootstrapSyncAfterInit(reason);
}
// ── 分支函数 ─────────────────────────────────────────────────────

/* ===== 25a-sync-status-core.js ===== */
"use strict";

function cachedSyncFactsForStatus(syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  var localHash = String(syncState.localPayloadHash || "");
  var baseHash = String(syncState.baseRemoteHash || "");
  return {
    payload: null,
    localPayloadHash: localHash,
    syncState: syncState,
    effectiveDirty: syncState.localDirty === true || Boolean(baseHash && localHash && localHash !== baseHash),
    hasBusinessData: Boolean(localHash)
  };
}

function buildSyncStatusFacts(syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  var facts;
  try {
    facts = currentSyncFacts({ persistHash: false });
  } catch (_) {
    facts = cachedSyncFactsForStatus(syncState);
  }
  facts.syncState = syncState;
  facts.pendingProgressSync = typeof hasPendingProgressSync === "function" && hasPendingProgressSync();
  facts.activityDirtyPending = typeof hasPendingActivityDraft === "function" && hasPendingActivityDraft();
  facts.pendingStudyFlush = facts.pendingProgressSync || facts.activityDirtyPending;
  facts.queuedStudy = hasQueuedStudyLocalState(facts);
  facts.freshRemote = typeof hasFreshSessionRemoteConfirmation === "function" && hasFreshSessionRemoteConfirmation();
  facts.latestRemoteHashSeen = String(state.latestRemoteHashSeen || "");
  facts.baseRemoteHash = String(syncState.baseRemoteHash || "");
  facts.localPayloadHash = String(facts.localPayloadHash || "");
  return facts;
}

function hasQueuedStudyLocalState(facts) {
  if (facts && facts.pendingStudyFlush) return true;
  if (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) return true;
  if (state.view !== "flash") return false;
  if (typeof getActiveStudyFacts === "function") {
    var active = getActiveStudyFacts();
    return Boolean(active.inFlash && (active.withinIdleWindow || active.studyMoving || active.playbackActive || active.timersActive || active.speechSpeaking || active.pointerActive));
  }
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  if (last && Date.now() - last < ACTIVE_STUDY_SYNC_DEBOUNCE_MS) return true;
  if (typeof isStudyMoving === "function" && isStudyMoving()) return true;
  return false;
}

function queuedStudyDetail() {
  if (state.view === "flash") return "学习中，待同步（本地已保存）";
  return "待同步（本地已保存）";
}

function activeStudyDirtyDetail() {
  if (state.lastDirtyFromVerify) return "本地已保存，稍后继续同步";
  if (state.view === "flash" && hasQueuedStudyLocalState()) return queuedStudyDetail();
  return "本地待上传";
}

function canShowCloudOk(facts, syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  facts = facts || buildSyncStatusFacts(syncState);
  if (facts.pendingStudyFlush) return false;
  if (state.isSyncing) return false;
  if (syncState.localDirty) return false;
  if (facts.effectiveDirty) return false;
  if (!syncState.baseRemoteHash) return false;
  if (!syncState.lastSuccessfulPushAt) return false;
  if (syncState.lastSyncStatus !== "cloud_ok" && syncState.lastSyncStatus !== "cloud_saved") return false;
  if (String(facts.localPayloadHash || "") !== String(syncState.baseRemoteHash || "")) return false;
  if (String(state.latestRemoteHashSeen || "") !== String(facts.localPayloadHash || "")) return false;
  if (typeof hasFreshSessionRemoteConfirmation !== "function" || !hasFreshSessionRemoteConfirmation()) return false;
  if (hasUnclearedBlockingSyncError(syncState)) return false;
  if (syncState.lastSyncedPayloadHash && String(syncState.lastSyncedPayloadHash) !== String(facts.localPayloadHash || "")) return false;
  return true;
}

function computeSyncStatus() {
  var syncState = ensureHashSyncState(state.syncHashState);
  var facts = buildSyncStatusFacts(syncState);
  var token = String(state.cloud && state.cloud.token || "").trim();
  var gistId = String(state.cloud && state.cloud.gistId || "").trim();
  var cloud = validateSavedCloudConfig(state.cloud || {});

  if (syncState.localRecoveryRequired) return { status: "error", detail: "本地备份待恢复，请打开 rescue.html" };
  if (!token && !gistId) return { status: "local_only", detail: "本地进度已保存，云同步未配置" };
  if (!cloud.ok) return { status: "invalid_config", detail: cloud.errors.join("；") };

  if (hasUnclearedBlockingSyncError(syncState)) {
    return { status: "error", detail: syncState.lastBlockingErrorText || syncState.lastSyncError || "同步异常，点开查看" };
  }
  if (syncState.lastSyncStatus === "conflict") return { status: "conflict", detail: syncState.lastSyncError || "自动合并失败" };
  if (state.isSyncing && (Date.now() - (state.syncLastProgressAt || state.syncStartedAt || 0) > SYNC_NO_PROGRESS_TIMEOUT_MS)) {
    return { status: "error", detail: "同步超时，正在等待下一轮自动重试" };
  }
  if (state.isSyncing && state.syncActuallyStarted) {
    var elapsed = Date.now() - Number(state.syncStartedAtMs || state.syncStartedAt || 0);
    return { status: "syncing", detail: elapsed > SYNC_LONG_RUNNING_UI_MS ? "后台同步中，本地可继续学习" : "正在同步" };
  }

  if (!isAutoSyncEnabled()) {
    if (syncState.lastSyncStatus === "error") return { status: "error", detail: syncState.lastSyncError || "手动同步失败，本地数据已保留" };
    if (facts.pendingStudyFlush || syncState.localDirty || facts.effectiveDirty) {
      return { status: "dirty", detail: "自动同步已关闭·本地已保存，点击手动同步后上传" };
    }
    if (canShowCloudOk(facts, syncState)) return { status: "cloud_ok", detail: "云端已保存·自动同步已关闭" };
    if (syncState.lastSyncStatus === "cloud_loaded") return { status: "cloud_loaded", detail: "已从云端更新·自动同步已关闭" };
    return { status: "local_only", detail: "自动同步已关闭·数据仅保存在当前浏览器" };
  }

  // actual pending cursor/draft wins over clean. Active movement alone must not hide a verified cloud_ok.
  if (facts.pendingStudyFlush) {
    if (state.syncMeta && state.syncMeta.readOnlyMode && (syncState.localDirty || facts.effectiveDirty)) {
      return { status: "dirty_read_only", detail: "只读模式·本地已保存，待更换可写 PAT 后上传" };
    }
    return { status: "study_queued", detail: queuedStudyDetail() };
  }

  if (syncState.localDirty || facts.effectiveDirty) {
    if (state.syncMeta && state.syncMeta.readOnlyMode) return { status: "dirty_read_only", detail: "只读模式·本地已保存，待更换可写 PAT 后上传" };
    if (syncState.lastErrorKind === "patch_result_unknown") {
      return { status: "confirm_pending", detail: "云端可能已写入，稍后会先核验；本地数据已保存" };
    }
    if (["remote_get_failed", "patch_failed_http", "rate_limited"].includes(syncState.lastErrorKind)) {
      var retryAt = syncState.nextRetryAt ? formatLocalDateTime(syncState.nextRetryAt) : "稍后";
      return { status: "cloud_unavailable", detail: "本地已保存，将在 " + retryAt + " 自动重试" };
    }
    if (syncState.lastSyncStatus === "error") return { status: "error", detail: syncState.lastSyncError || "同步失败，本地数据已保留" };
    return { status: "dirty", detail: activeStudyDirtyDetail() };
  }

  if (canShowCloudOk(facts, syncState)) return { status: "cloud_ok", detail: "云端已保存" };

  if (syncState.lastSyncStatus === "cloud_loaded") {
    return { status: "cloud_loaded", detail: "已从云端更新" };
  }

  if (!state.sessionRemoteCheckDone) return { status: "local_only", detail: "本地可用，待云端检查" };
  if (state.syncMeta && state.syncMeta.readOnlyMode) return { status: "read_only", detail: "只读模式·无法上传" };
  return { status: "local_only", detail: "本地已保存，尚未确认云端保存" };
}

/* ===== 26-sync-apply.js ===== */
"use strict";

function enterSyncInfoMode(message) {
  if (state.view === "setup") {
    state.setupStatus = { message: message, type: "success" };
    renderSetup();
  }
}

function updateLegacyMetaAfterRemote(remote, payloadHash, type) {
  const now = beijingISOString();
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.initialized = true;
  state.syncMeta.gistId = state.cloud.gistId;
  state.syncMeta.fileName = SYNC_FILE_NAME;
  state.syncMeta.lastRemoteVersion = remote?.remoteVersion || state.syncMeta.lastRemoteVersion || "";
  state.syncMeta.lastRemoteUpdatedAt = remote?.remoteUpdatedAt || state.syncMeta.lastRemoteUpdatedAt || "";
  state.syncMeta.lastSyncedPayloadHash = payloadHash || "";
  state.syncMeta.lastSyncedLocalUpdatedAt = now;
  state.syncMeta.lastSyncErrorAt = "";
  state.syncMeta.lastSyncErrorMessage = "";
  if (type === "push") {
    state.syncMeta.lastCloudSaveConfirmedAt = now;
    state.syncMeta.lastSuccessfulPushAt = now;
    state.syncMeta.cloudWritable = true;
    state.syncMeta.readOnlyMode = false;
  }
  if (type === "pull") {
    state.syncMeta.lastSuccessfulPullAt = now;
  }
  persistSyncMeta();
}


function markHashCleanFromRemote(remote, payloadHash, status, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  const now = beijingISOString();
  var normalizedStatus = status === "cloud_saved" ? "cloud_ok" : (status || "cloud_loaded");
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.baseRemoteHash = payloadHash || "";
  state.syncHashState.localPayloadHash = payloadHash || "";
  state.syncHashState.lastSyncedPayloadHash = payloadHash || "";
  state.syncHashState.businessHashSchemaVersion = BUSINESS_HASH_SCHEMA_VERSION;
  state.syncHashState.hashSchemaNeedsRemoteCheck = false;
  state.syncHashState.schemaMigrationPreviousDirty = false;
  state.syncHashState.localDirty = false;
  state.syncHashState.dirtySince = "";
  state.syncHashState.localRecoveryRequired = false;
  state.syncHashState.lastSyncStatus = normalizedStatus;
  state.syncHashState.lastSyncError = "";
  state.syncHashState.lastErrorKind = "";
  state.syncHashState.lastErrorStage = "";
  state.syncHashState.lastErrorTransport = "";
  state.syncHashState.lastErrorHttpStatus = 0;
  state.syncHashState.lastErrorTechnical = "";
  state.lastDirtyReason = "";
  state.lastDirtyFromVerify = false;
  state.lastMarkCleanAtMs = Date.now();
  state.syncHashState.consecutiveSyncFailures = 0;
  state.syncHashState.nextRetryAt = "";
  // 清 blocking error；cloud_ok 是唯一绿色保存态，cloud_saved 仅作旧别名输入。
  state.syncHashState.lastBlockingErrorAt = "";
  state.syncHashState.lastBlockingErrorCode = "";
  state.syncHashState.lastBlockingErrorText = "";
  state.syncHashState.lastBlockingErrorClearedAt = now;
  if (normalizedStatus === "cloud_ok") state.syncHashState.lastSuccessfulPushAt = now;
  if (normalizedStatus === "cloud_loaded") state.syncHashState.lastSuccessfulPullAt = now;
  persistHashSyncState();
  if (normalizedStatus === "cloud_ok" || normalizedStatus === "cloud_loaded") {
    updateLegacyMetaAfterRemote(remote, payloadHash, normalizedStatus === "cloud_ok" ? "push" : "pull");
  }
  // 只有真实 remote GET 确认后才更新 session remote confirmation
  if (options && options.remoteVerified === true) {
    state.sessionRemoteCheckDone = true;
    state.latestRemoteHashSeen = payloadHash || "";
    state.latestRemoteKindSeen = (remote && remote.kind) || "";
    state.sessionRemoteCheckAt = now;
  }
  refreshVisibleSyncDiagnostics();
  if (typeof closeRecoverableSyncProblemDialogAfterClean === "function") closeRecoverableSyncProblemDialogAfterClean();
  if (typeof clearActiveStudyTimerIfClean === "function") clearActiveStudyTimerIfClean();
  appendAuditEvent({
    type: "sync:mark_clean",
    message:
      "session=" + TAB_ID +
      " runId=" + (options && options.runId || "") +
      " status=" + String(normalizedStatus || "") +
      " hash=" + String(payloadHash || "").slice(0, 8)
  });
  return true;
}


function markHashDirty(localHash, reason, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  if (typeof auditLocalDirtySet === "function") auditLocalDirtySet(reason || "markHashDirty");
  var wasDirty = state.syncHashState && state.syncHashState.localDirty === true;
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localPayloadHash = localHash || state.syncHashState.localPayloadHash || "";
  state.syncHashState.localDirty = true;
  if (!state.syncHashState.dirtySince) state.syncHashState.dirtySince = beijingISOString();
  state.syncHashState.lastSyncStatus = "dirty";
  if (reason) state.syncHashState.lastSyncError = reason;
  persistHashSyncState();
  refreshVisibleSyncDiagnostics();

  if (!wasDirty) {
    appendAuditEvent({
      type: "sync:mark_dirty",
      message:
        "session=" + TAB_ID +
        " runId=" + (options.runId || "") +
        " reason=" + String(reason || "").slice(0, 100)
    });
  }
  return true;
}


function isRemoteApplyStorageKey(key) {
  key = String(key || "");
  return key === SYNC_META_KEY ||
    key === PROGRESS_CURSOR_KEY ||
    key === UNKNOWN_PROGRESS_CURSOR_KEY ||
    key === PROGRESS_PENDING_KEY ||
    key === ACTIVITY_DRAFT_KEY ||
    key.startsWith("progress:") ||
    key.startsWith("unknown_progress:") ||
    key.startsWith("marks:") ||
    key.startsWith(MARK_STATES_PREFIX) ||
    key.startsWith("activity:") ||
    key.startsWith("unit_stats:");
}

function captureRemoteApplyTransaction() {
  var items = {};
  var keys = [];
  for (var i = 0; i < localStorage.length; i += 1) {
    var key = localStorage.key(i);
    if (!isRemoteApplyStorageKey(key)) continue;
    keys.push(key);
    items[key] = localStorage.getItem(key);
  }
  return {
    keys: keys,
    items: items,
    syncMeta: JSON.parse(JSON.stringify(ensureSyncMeta(state.syncMeta))),
    pendingProgressSync: state.pendingProgressSync === true,
    activityDirtyPending: state.activityDirtyPending === true,
    activityDraftPending: state.activityDraftPending === true,
    localBusinessRevision: Number(state.localBusinessRevision || 0),
    lastLocalBusinessChangeAt: Number(state.lastLocalBusinessChangeAt || 0),
    lastLocalBusinessChangeReason: String(state.lastLocalBusinessChangeReason || ""),
    lastLocalBusinessChangeSource: String(state.lastLocalBusinessChangeSource || ""),
    lastLocalBusinessChangeRunId: state.lastLocalBusinessChangeRunId || null
  };
}

function rollbackRemoteApplyTransaction(snapshot, options = {}) {
  if (!snapshot || !snapshot.items) return false;
  var ok = true;
  var beforeKeys = new Set(snapshot.keys || []);
  try {
    var currentKeys = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      if (isRemoteApplyStorageKey(key)) currentKeys.push(key);
    }
    currentKeys.forEach(function(key) {
      if (!beforeKeys.has(key)) localStorage.removeItem(key);
    });
    Object.keys(snapshot.items).forEach(function(key) {
      localStorage.setItem(key, snapshot.items[key]);
    });
  } catch (error) {
    ok = false;
    try {
      state.syncHashState = ensureHashSyncState(state.syncHashState);
      state.syncHashState.localRecoveryRequired = true;
      state.syncHashState.lastBackupError = "本地回滚失败：" + String(error && error.message || error || "未知错误");
      persistHashSyncState();
    } catch (_) {}
  }
  state.syncMeta = ensureSyncMeta(snapshot.syncMeta);
  state.pendingProgressSync = snapshot.pendingProgressSync;
  state.activityDirtyPending = snapshot.activityDirtyPending;
  state.activityDraftPending = snapshot.activityDraftPending;
  state.localBusinessRevision = snapshot.localBusinessRevision;
  state.lastLocalBusinessChangeAt = snapshot.lastLocalBusinessChangeAt;
  state.lastLocalBusinessChangeReason = snapshot.lastLocalBusinessChangeReason;
  state.lastLocalBusinessChangeSource = snapshot.lastLocalBusinessChangeSource;
  state.lastLocalBusinessChangeRunId = snapshot.lastLocalBusinessChangeRunId;
  appendAuditEvent({
    type: ok ? "sync:local_apply_rolled_back" : "sync:local_apply_rollback_failed",
    message: "session=" + TAB_ID + " runId=" + String(options.runId || "") + " reason=" + String(options.reason || "")
  });
  return ok;
}

function applyRemotePayloadSafely(payload, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  var normalized = normalizeSyncPayload(payload);
  if (!validateSyncPayload(normalized)) return false;
  const expectedHash = options.expectedHash || businessPayloadHash(normalized);
  const beforePayload = normalizeSyncPayload(collectSyncPayload());
  if (options.allowWhenLocalEmptyOnly && hasBusinessData(beforePayload)) return false;
  if (hasBusinessData(beforePayload)) {
    var backupSaved = writeHashBackup("pre_overwrite", beforePayload, options.reason || options.source || "local_apply");
    if (!backupSaved) {
      recordHashSyncFailure("本地覆盖前备份写入失败，已停止应用云端数据", {
        errorKind: "local_backup_write_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        stage: "local_backup"
      });
      return false;
    }
  }
  var transactionSnapshot;
  try {
    transactionSnapshot = captureRemoteApplyTransaction();
  } catch (error) {
    recordHashSyncFailure("无法建立本地写入事务，已停止应用云端数据", {
      errorKind: "local_transaction_snapshot_failed",
      runId: options.runId,
      banner: true,
      dialog: true,
      stage: "local_apply_snapshot",
      technical: String(error && error.message || error || "")
    });
    return false;
  }
  markSyncProgress("local:apply:start", options.runId);
  const previousApplying = state.applyingRemotePayload;
  const previousSuppressDirty = state.suppressDirty;
  state.applyingRemotePayload = true;
  state.suppressDirty = true;
  try {
    // 云端 payload 不覆盖本机 UI settings；只规范化并保留当前设备的设置。
    normalizeSettings();
    var allSaved = true;
    Object.keys(normalized.progress).forEach(function(bookId) {
      allSaved = saveProgress(bookId, normalized.progress[bookId], { touch: false }) !== false && allSaved;
    });
    if (normalized.markStates && Object.keys(normalized.markStates).length) {
      Object.keys(normalized.markStates).forEach(function(bookId) {
        allSaved = saveMarkStates(bookId, normalized.markStates[bookId], { touch: false, syncMarks: true }) !== false && allSaved;
      });
    } else {
      Object.keys(normalized.marks).forEach(function(bookId) {
        allSaved = saveMarks(bookId, normalized.marks[bookId], { touch: false, updateStates: true }) !== false && allSaved;
      });
    }
    Object.keys(normalized.activity).forEach(function(bookId) {
      allSaved = saveActivity(bookId, normalized.activity[bookId], { touch: false }) !== false && allSaved;
    });
    Object.keys(normalized.unitStats).forEach(function(bookId) {
      allSaved = saveUnitStats(bookId, normalized.unitStats[bookId], { touch: false }) !== false && allSaved;
    });
    Object.keys(normalized.unknownProgress).forEach(function(bookId) {
      allSaved = applyUnknownProgressPayload(bookId, normalized.unknownProgress[bookId]) !== false && allSaved;
    });
    if (typeof syncProgressCursorFromCloudPayload === "function") {
      allSaved = syncProgressCursorFromCloudPayload(normalized) !== false && allSaved;
    }
    if (!allSaved) {
      rollbackRemoteApplyTransaction(transactionSnapshot, { runId: options.runId, reason: "storage_write_failed" });
      recordHashSyncFailure("云端数据写入本地存储失败，已自动回滚到写入前状态并保留覆盖前备份", {
        errorKind: "local_storage_write_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        stage: "local_apply"
      });
      return false;
    }
    if (typeof clearProgressPending === "function") {
      allSaved = clearProgressPending() !== false && allSaved;
    }
    if (typeof clearActivityDraftPending === "function") {
      allSaved = clearActivityDraftPending() !== false && allSaved;
    }
    state.syncMeta.localUpdatedAt = normalized.updatedAt || beijingISOString();
    allSaved = persistSyncMeta() !== false && allSaved;
    if (!allSaved) {
      rollbackRemoteApplyTransaction(transactionSnapshot, { runId: options.runId, reason: "pending_or_meta_write_failed" });
      recordHashSyncFailure("云端数据写入收尾失败，已自动回滚到写入前状态", {
        errorKind: "local_storage_write_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        stage: "local_apply_finalize"
      });
      return false;
    }
    bumpLocalBusinessRevision(options.reason || options.source || "remote_apply", { source: options.source === "rescue" ? "rescue" : "sync", runId: options.runId || null });
    const afterHash = businessPayloadHash(collectSyncPayload());
    if (afterHash !== expectedHash) {
      rollbackRemoteApplyTransaction(transactionSnapshot, { runId: options.runId, reason: "hash_verify_failed" });
      recordHashSyncFailure("本地数据写入后校验失败，已自动回滚到写入前状态并保留覆盖前备份", {
        errorKind: "local_apply_verify_failed",
        runId: options.runId,
        banner: true,
        dialog: true,
        stage: "local_verify",
        technical: "expected=" + expectedHash + ", actual=" + afterHash
      });
      return false;
    }
    markSyncProgress("local:apply:done", options.runId);
    return true;
  } finally {
    state.applyingRemotePayload = previousApplying;
    state.suppressDirty = previousSuppressDirty;
  }
}


function restoreRemotePayloadFromDialog(remotePayload, remoteHash, remote) {
  const normalized = normalizeSyncPayload(remotePayload || {});
  const computedHash = remoteHash || businessPayloadHash(normalized);
  if (!validateSyncPayload(normalized) || !hasBusinessData(normalized)) {
    showSyncProblemDialog({
      severity: "warning",
      code: "REMOTE_RESTORE_EMPTY_OR_INVALID",
      title: "云端数据不可直接恢复",
      message: "云端 payload 为空或校验失败，已停止一键恢复。",
      canRetry: true,
      force: true
    });
    return false;
  }

  const localPayload = normalizeSyncPayload(collectSyncPayload());
  if (hasBusinessData(localPayload)) {
    showSyncProblemDialog({
      severity: "warning",
      code: "REMOTE_RESTORE_LOCAL_NOT_EMPTY",
      title: "本机已有学习数据",
      message: "不能直接用云端覆盖本机数据。请使用重新同步一次，系统会合并云端和本机数据。",
      canRetry: true,
      force: true
    });
    syncTick({ reason: "remote_restore_merge", bypassBackoff: true });
    return false;
  }

  const ok = applyRemotePayloadSafely(normalized, {
    source: "remote_pull",
    expectedHash: computedHash,
    reason: "dialog_remote_restore"
  });
  if (!ok) return false;
  const afterHash = businessPayloadHash(collectSyncPayload());
  if (afterHash !== computedHash) {
    recordHashSyncFailure("从云端恢复到本机后校验失败", {
      errorKind: "local_apply_verify_failed",
      banner: true,
      dialog: true,
      technical: "expected=" + computedHash + ", actual=" + afterHash
    });
    return false;
  }
  renderCurrentView({ touchProgress: false });
  markHashCleanFromRemote(remote || { kind: "valid_nonempty", payloadHash: computedHash, snapshot: normalized }, computedHash, "cloud_loaded", { remoteVerified: Boolean(remote) });
  enterSyncInfoMode("已从云端恢复到本机");
  return true;
}

function pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId, localRevisionAtStart, localHashAtStart }) {
  if (isStaleSyncRun(runId)) return false;

  const beforeFacts = currentSyncFacts({ persistHash: true });
  const normalizedRemotePayload = normalizeSyncPayload(remotePayload);
  const localHasData = hasBusinessData(beforeFacts.payload);
  const remoteHasData = remote && remote.kind === "valid_nonempty" && hasBusinessData(normalizedRemotePayload);
  if (!remoteHasData) {
    showSyncProblemDialog({
      severity: "warning",
      code: "PULL_BLOCKED_REMOTE_EMPTY",
      title: "已阻止不安全的云端 Pull",
      message: "云端没有可安全拉取的非空学习数据。",
      runId
    });
    return { ok: false, pullBlocked: true, remoteEmpty: true };
  }

  if (localHasData) {
    markHashDirty(beforeFacts.localPayloadHash, "已阻止直接 Pull：本地仍有学习数据，不能用云端直接覆盖。", { runId });
    showSyncProblemDialog({
      severity: "warning",
      code: "PULL_BLOCKED_LOCAL_HAS_DATA",
      title: "已阻止不安全的云端 Pull",
      message: "本地有学习数据，因此没有直接覆盖。系统只允许在本地业务数据为空时执行 Pull；其他情况必须合并。",
      runId
    });
    return { ok: false, pullBlocked: true, localHasData: true };
  }

  if (localRevisionAtStart !== undefined && hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) return false;
  const ok = applyRemotePayloadSafely(normalizedRemotePayload, { source: "remote_pull", expectedHash: remoteHash, runId, reason: reason || "remote_pull" });
  if (!ok) return { ok: false, applyFailed: true };
  const afterHash = businessPayloadHash(collectSyncPayload());
  if (afterHash !== remoteHash) {
    recordHashSyncFailure("云端数据应用到本地后校验失败", { errorKind: "local_apply_verify_failed", banner: true, dialog: true, runId, technical: "expected=" + remoteHash + ", actual=" + afterHash });
    return { ok: false, applyFailed: true };
  }
  renderCurrentView({ touchProgress: false });
  markHashCleanFromRemote(remote, remoteHash, "cloud_loaded", { runId: runId, remoteVerified: true });
  enterSyncInfoMode("已从云端加载");
  if (typeof refreshCurrentBusinessViewAfterSync === "function") refreshCurrentBusinessViewAfterSync();
  return { ok: true, pulled: true, hash: remoteHash };
}
function applyUnknownProgressPayload(bookId, progressMap) {
  const book = BOOKS.find((item) => item.id === bookId);
  if (!book || !isPlainObject(progressMap)) return false;
  var allSaved = true;
  if (isPlainObject(progressMap.book)) {
    allSaved = saveUnknownProgress(book.id, { scope: "book" }, sanitizeProgressPayload(progressMap.book), { touch: false }) !== false && allSaved;
  }
  const units = isPlainObject(progressMap.units) ? progressMap.units : {};
  Object.entries(units).forEach(([unit, progress]) => {
    const unitNumber = Number(unit);
    if (!Number.isFinite(unitNumber) || unitNumber < 1 || unitNumber > book.totalUnits) return;
    allSaved = saveUnknownProgress(book.id, { scope: "unit", unit: unitNumber }, sanitizeProgressPayload(progress), { touch: false }) !== false && allSaved;
  });
  return allSaved;
}

/* ===== 27a-sync-active-study-guard.js ===== */
"use strict";

function isHardForcedSyncReason(reason) {
  return [
    "manual", "manual_retry", "manual_push", "manual_pull",
    "ignore_empty_backup", "config_saved", "remote_restore_merge"
  ].includes(String(reason || ""));
}

function isActiveStudyIdleUploadReason(reason) {
  return String(reason || "") === "active_study_idle_upload";
}

function shouldBypassMinInterval(reason) {
  return isHardForcedSyncReason(reason);
}

function isForcedRemoteCheckReason(reason) {
  return isHardForcedSyncReason(reason) || ["init", "startup", "visibility_resume"].includes(String(reason || ""));
}

function canRunWhileHidden() {
  return false;
}

function getActiveStudyFacts() {
  var inFlash = state.view === "flash";
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  var elapsedMs = last ? Date.now() - last : Infinity;
  var playbackActive = inFlash && typeof isFlashPlaybackActive === "function" && isFlashPlaybackActive();
  var speechSpeaking = inFlash && typeof isSpeechSpeakingNow === "function" && isSpeechSpeakingNow();
  var timersActive = inFlash && Array.isArray(state.timers) && state.timers.length > 0;
  var pointerActive = inFlash && Boolean(state.pointer);
  var transitioning = inFlash && state.transitioning === true;
  var studyMoving = inFlash && typeof isStudyMoving === "function" && isStudyMoving();
  var withinIdleWindow = inFlash && last && elapsedMs < ACTIVE_STUDY_SYNC_DEBOUNCE_MS;
  return {
    inFlash: inFlash,
    lastActiveStudyAt: last || 0,
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : -1,
    withinIdleWindow: Boolean(withinIdleWindow),
    playbackActive: Boolean(playbackActive),
    speechSpeaking: Boolean(speechSpeaking),
    timersActive: Boolean(timersActive),
    pointerActive: Boolean(pointerActive),
    transitioning: Boolean(transitioning),
    studyMoving: Boolean(studyMoving),
    shouldDeferAutoPatch: Boolean(inFlash && (withinIdleWindow || studyMoving || playbackActive || speechSpeaking || timersActive || pointerActive || transitioning)),
    hardFlushAllowed: false
  };
}

function activeStudyDelayRemainingMs() {
  var facts = getActiveStudyFacts();
  if (!facts.inFlash || !facts.lastActiveStudyAt) return ACTIVE_STUDY_SYNC_DEBOUNCE_MS;
  if (facts.studyMoving || facts.playbackActive || facts.speechSpeaking || facts.timersActive || facts.pointerActive || facts.transitioning) return Math.max(3000, ACTIVE_STUDY_SYNC_DEBOUNCE_MS - Math.max(0, facts.elapsedMs));
  return Math.max(1000, ACTIVE_STUDY_SYNC_DEBOUNCE_MS - Math.max(0, facts.elapsedMs));
}

function shouldDeferForActiveStudy(reason) {
  if (isHardForcedSyncReason(reason)) return false;
  var facts = getActiveStudyFacts();
  if (!facts.inFlash) return false;
  if (isActiveStudyIdleUploadReason(reason)) return facts.shouldDeferAutoPatch;
  if (!facts.shouldDeferAutoPatch) return false;
  return [
    "heartbeat", "local_change", "min_interval_reschedule", "visible_delayed", "active_auto",
    "active_study_idle_upload_pending", "local_changed_during_verify", "patch_in_flight_reschedule",
    "verify_mismatch_retry", "cross_tab_lock_retry", "web_lock_retry"
  ].includes(String(reason || ""));
}

function shouldAbortAutoPatchForActiveStudy(reason) {
  if (isHardForcedSyncReason(reason)) return false;
  var facts = getActiveStudyFacts();
  return Boolean(facts.inFlash && facts.shouldDeferAutoPatch);
}

function shouldDeferFlashAutoSync(reason) {
  if (state.view !== "flash") return false;
  return [
    "heartbeat", "local_change", "min_interval_reschedule", "cross_tab_lock_retry",
    "verify_mismatch_retry", "patch_in_flight_reschedule", "web_lock_retry"
  ].includes(String(reason || ""));
}

/* ===== 27b-sync-decision.js ===== */
"use strict";

function decideSyncAction({ remote, facts, syncState, remoteHash, reason = "", runId = 0 } = {}) {
  remote = remote || {};
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  facts = facts && facts.payload ? facts : currentSyncFacts({ persistHash: false });
  var localHasData = hasBusinessData(facts.payload);
  var remoteHasData = remoteHasBusinessPayload(remote);
  var remoteEmpty = remoteIsEmptyPayload(remote);
  var readOnly = remote.readOnlyAuthFallback === true || (state.syncMeta && state.syncMeta.readOnlyMode === true);
  var effective = facts.effectiveDirty === true;
  var baseHash = String(syncState.baseRemoteHash || "");
  var rHash = String(remoteHash || currentRemoteHash(remote) || "");
  var type = "ERROR";
  var shouldPatch = false;
  var shouldPull = false;
  var shouldMerge = false;
  var shouldNoop = false;
  var riskCode = "";

  if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") {
    type = "REMOTE_INVALID";
    riskCode = remote.kind || "remote_invalid";
  } else if (!localHasData && remoteEmpty) {
    type = "BOTH_EMPTY_NOOP";
    shouldNoop = true;
  } else if (!localHasData && remoteHasData) {
    type = "LOCAL_EMPTY_REMOTE_NONEMPTY_PULL";
    shouldPull = true;
  } else if (readOnly && effective && localHasData) {
    type = "READ_ONLY_DIRTY";
    riskCode = "read_only_dirty";
  } else if (localHasData && remoteEmpty) {
    type = "LOCAL_NONEMPTY_REMOTE_EMPTY_PUSH";
    shouldPatch = !readOnly;
    riskCode = readOnly ? "readonly_remote_empty_local_has_data" : "remote_empty_local_has_data";
  } else if (localHasData && remoteHasData && rHash === baseHash && effective) {
    type = "LOCAL_DIRTY_REMOTE_SAME_PUSH";
    shouldPatch = !readOnly;
  } else if (localHasData && remoteHasData && rHash !== baseHash && !effective && syncState.localDirty !== true) {
    type = "LOCAL_CLEAN_REMOTE_CHANGED_SAFE_MERGE";
    shouldMerge = true;
    shouldPatch = !readOnly;
  } else if (localHasData && remoteHasData && rHash !== baseHash) {
    type = "BOTH_CHANGED_MERGE_PUSH";
    shouldMerge = true;
    shouldPatch = !readOnly;
  } else if (rHash === baseHash && !effective) {
    type = "CLEAN_NOOP";
    shouldNoop = true;
  } else {
    type = "ERROR";
    riskCode = "unclassified_sync_state";
  }

  return {
    type: type,
    reason: reason,
    runId: runId,
    canWrite: !readOnly,
    readOnly: readOnly,
    localHasData: localHasData,
    remoteHasData: remoteHasData,
    remoteEmpty: remoteEmpty,
    localHash: facts.localPayloadHash || "",
    remoteHash: rHash,
    baseRemoteHash: baseHash,
    effectiveDirty: effective,
    localDirty: syncState.localDirty === true,
    shouldPatch: shouldPatch,
    shouldPull: shouldPull,
    shouldMerge: shouldMerge,
    shouldNoop: shouldNoop,
    riskCode: riskCode
  };
}

function appendSyncDecisionAudit(decision) {
  try {
    appendAuditEvent({
      type: "sync:decision",
      message:
        "session=" + TAB_ID +
        " runId=" + String(decision.runId || "") +
        " type=" + String(decision.type || "") +
        " reason=" + String(decision.reason || "") +
        " localHasData=" + String(!!decision.localHasData) +
        " remoteHasData=" + String(!!decision.remoteHasData) +
        " remoteEmpty=" + String(!!decision.remoteEmpty) +
        " readOnly=" + String(!!decision.readOnly) +
        " effectiveDirty=" + String(!!decision.effectiveDirty) +
        " localDirty=" + String(!!decision.localDirty) +
        " localHash=" + String(decision.localHash || "").slice(0, 8) +
        " remoteHash=" + String(decision.remoteHash || "").slice(0, 8) +
        " baseHash=" + String(decision.baseRemoteHash || "").slice(0, 8) +
        " action=" + [decision.shouldPull ? "pull" : "", decision.shouldMerge ? "merge" : "", decision.shouldPatch ? "patch" : "", decision.shouldNoop ? "noop" : ""].filter(Boolean).join("+")
    });
  } catch (_) {}
}

/* ===== 27c-sync-orchestration-helpers.js ===== */
"use strict";


function pauseFlashPlaybackForManualSync(reason) {
  if (state.view !== "flash") return false;
  if (typeof touchStudyActivity === "function") touchStudyActivity(reason || "manual_sync");
  try { commitCurrentCardActivity(); } catch (_) {}
  try { clearTimers(); } catch (_) {}
  try { releaseWakeLock(); } catch (_) {}
  state.playbackPaused = true;
  if (typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary(reason || "manual_sync");
  if (typeof renderFlashcard === "function") renderFlashcard({ touchProgress: false });
  appendAuditEvent({ type: "sync:manual_paused_flash_playback", message: "reason=" + String(reason || "manual_sync") });
  return true;
}

async function autoPushToGist({ keepalive = false } = {}) {
  if (!isAutoSyncEnabled()) {
    updateSyncIndicator();
    return false;
  }
  pauseFlashPlaybackForManualSync("manual_push");
  return syncTick({ reason: "manual_push", keepalive, bypassBackoff: true });
}


// ── syncTick ─────────────────────────────────────────────────────

function summarizeSyncResult(result) {
  if (!result) return "false";
  if (result === true) return "true";
  if (result.localChangedDuringVerify) return "deferred_dirty";
  if (result.verifyFailed) return "verify_failed";
  if (result.preflightChanged) return "preflight_changed";
  if (result.ok) return "ok";
  return "not_ok";
}

function makeSyncRiskProblemFields(remote, facts, options = {}) {
  const currentFacts = facts && facts.payload ? facts : currentSyncFacts({ persistHash: false });
  const syncState = ensureHashSyncState(state.syncHashState);
  const remoteHash = Object.prototype.hasOwnProperty.call(options, "remoteHash") ? options.remoteHash : currentRemoteHash(remote);
  const remoteHasData = Object.prototype.hasOwnProperty.call(options, "remoteHasBusinessData") ? options.remoteHasBusinessData : remoteHasBusinessPayload(remote);
  return {
    remoteKind: remote && remote.kind || "",
    remoteHash: remoteHash || "",
    localHasBusinessData: hasBusinessData(currentFacts.payload),
    remoteHasBusinessData: Boolean(remoteHasData),
    baseRemoteHash: syncState.baseRemoteHash || "",
    localPayloadHash: currentFacts.localPayloadHash || "",
    localDirty: syncState.localDirty === true,
    effectiveDirty: currentFacts.effectiveDirty === true,
    readOnly: Boolean(Object.prototype.hasOwnProperty.call(options, "readOnly") ? options.readOnly : remote && remote.readOnlyAuthFallback),
    runId: options.runId
  };
}


function syncRiskTechnicalText(fields) {
  fields = fields || {};
  return [
    "remote.kind=" + String(fields.remoteKind || ""),
    "remoteHash=" + String(fields.remoteHash || ""),
    "localHasBusinessData=" + String(fields.localHasBusinessData === true),
    "remoteHasBusinessData=" + String(fields.remoteHasBusinessData === true),
    "baseRemoteHash=" + String(fields.baseRemoteHash || ""),
    "localPayloadHash=" + String(fields.localPayloadHash || ""),
    "localDirty=" + String(fields.localDirty === true),
    "effectiveDirty=" + String(fields.effectiveDirty === true),
    "readOnly=" + String(fields.readOnly === true),
    "runId=" + String(fields.runId || "")
  ].join("\n");
}


function markReadOnlyDirtyState(message, facts, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  const currentFacts = facts && facts.payload ? facts : currentSyncFacts({ persistHash: true });
  const now = beijingISOString();

  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localPayloadHash = currentFacts.localPayloadHash || state.syncHashState.localPayloadHash || "";
  state.syncHashState.localDirty = true;
  if (!state.syncHashState.dirtySince) state.syncHashState.dirtySince = now;
  state.syncHashState.lastSyncStatus = "read_only";
  state.syncHashState.lastSyncError = message || "当前 PAT 不可写，本地数据等待上传";
  persistHashSyncState();

  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.cloudWritable = false;
  state.syncMeta.readOnlyMode = true;
  state.syncMeta.lastSyncErrorAt = now;
  state.syncMeta.lastSyncErrorMessage = state.syncHashState.lastSyncError;
  persistSyncMeta();
  updateSyncIndicator();
  return true;
}


function syncBranchReadOnlyMergeLocal({ remote, remotePayload, local, reason, runId }) {
  if (isStaleSyncRun(runId)) return false;
  const message = "当前 PAT 不可写，已在本地合并云端数据，等待更换可写 PAT 后上传。";
  const currentLocal = local && local.payload ? local : currentSyncFacts({ persistHash: true });
  writeHashBackup("pre_merge", currentLocal.payload, reason || "read_only_merge");

  const mergedPayload = normalizeSyncPayload(safeMergePayloads(remotePayload, currentLocal.payload));
  if (!validateSyncPayload(mergedPayload)) {
    markReadOnlyDirtyState("只读模式下自动合并失败；本地数据已保留，未覆盖云端。", currentLocal, { runId });
    const failedFields = makeSyncRiskProblemFields(remote, currentLocal, { remoteHash: currentRemoteHash(remote), readOnly: true, runId });
    showSyncProblemDialog({
      severity: "warning",
      code: "READONLY_MERGE_FAILED",
      title: "只读模式下自动合并失败",
      message: state.syncHashState.lastSyncError,
      technical: syncRiskTechnicalText(failedFields),
      canCopy: true,
      canRetry: true,
      ...failedFields
    });
    return false;
  }

  const mergedHash = businessPayloadHash(mergedPayload);
  const applied = applyRemotePayloadSafely(mergedPayload, { source: "sync", expectedHash: mergedHash, runId, reason: reason || "read_only_merge_apply" });
  if (!applied) return false;

  const afterHash = businessPayloadHash(collectSyncPayload());
  if (afterHash !== mergedHash) {
    recordHashSyncFailure("只读模式下合并写入本地后 hash 校验失败", {
      errorKind: "local_apply_verify_failed",
      banner: true,
      dialog: true,
      runId,
      technical: "expected=" + mergedHash + ", actual=" + afterHash
    });
    return false;
  }

  renderCurrentView({ touchProgress: false });
  const afterFacts = currentSyncFacts({ persistHash: true });
  const remoteHash = currentRemoteHash(remote);
  if (remoteHash && mergedHash === remoteHash) {
    markHashCleanFromRemote(remote, mergedHash, "cloud_loaded", { runId, remoteVerified: true });
    appendAuditEvent({
      type: "sync:readonly_merge_remote_already_complete",
      message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(mergedHash || "").slice(0, 8)
    });
    return { ok: true, merged: true, noPatchNeeded: true, readOnly: true };
  }
  markReadOnlyDirtyState(message, afterFacts, { runId });
  const fields = makeSyncRiskProblemFields(remote, afterFacts, { remoteHash: currentRemoteHash(remote), readOnly: true, runId });
  showSyncProblemDialog({
    severity: "warning",
    code: "READONLY_REMOTE_MERGED_LOCAL_DIRTY",
    title: "只读模式下已合并到本地",
    message,
    technical: syncRiskTechnicalText(fields),
    canCopy: true,
    canRetry: true,
    ...fields
  });
  return false;
}

// ── forced sync / active study guard ───────────────────────────────

// active-study guard functions moved to 27a-sync-active-study-guard.js.

function handleBusinessHashSchemaRemoteCheck(remote, localFacts, runId) {
  var syncState = ensureHashSyncState(state.syncHashState);
  if (!syncState.hashSchemaNeedsRemoteCheck) return null;
  var remoteHash = currentRemoteHash(remote);
  var localHash = localFacts && localFacts.localPayloadHash || "";
  var remoteHasData = remoteHasBusinessPayload(remote);
  syncState.businessHashSchemaVersion = BUSINESS_HASH_SCHEMA_VERSION;
  syncState.hashSchemaNeedsRemoteCheck = false;
  if (remoteHash && remoteHash === localHash) {
    markHashCleanFromRemote(remote, remoteHash, "cloud_loaded", { runId: runId, remoteVerified: true });
    appendAuditEvent({ type: "sync:business_hash_schema_remote_equal", message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(remoteHash || "").slice(0, 8) });
    return { ok: true, schemaRefreshedClean: true };
  }
  persistHashSyncState();
  appendAuditEvent({ type: "sync:business_hash_schema_remote_diff", message: "session=" + TAB_ID + " runId=" + runId + " previousDirty=" + String(!!syncState.schemaMigrationPreviousDirty) + " localHash=" + String(localHash || "").slice(0, 8) + " remoteHash=" + String(remoteHash || "").slice(0, 8) + " remoteHasData=" + String(!!remoteHasData) });
  if (syncState.schemaMigrationPreviousDirty) {
    markHashDirty(localHash, "business_hash_schema_changed_remote_diff", { runId: runId });
  }
  return null;
}



function markPageHiddenDuringSync() {
  state.pageHiddenDuringSyncAt = Date.now();
}

function shouldDowngradeFailureForBackground(reason) {
  if (reason === "pagehide_flush" || reason === "visibility_hidden_flush") return true;
  if (typeof document !== "undefined" && document.hidden) return true;
  if (state.pageHiddenDuringSyncAt && Date.now() - Number(state.pageHiddenDuringSyncAt || 0) < 15000) return true;
  return false;
}

function clearStaleDirtyIfRemoteMatches(remote, facts, runId) {
  var syncState = ensureHashSyncState(state.syncHashState);
  var localHash = String(facts && facts.localPayloadHash || syncState.localPayloadHash || "");
  var baseHash = String(syncState.baseRemoteHash || "");
  var remoteHash = String(currentRemoteHash(remote) || state.latestRemoteHashSeen || "");
  var hasPending = Boolean((typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) || (typeof hasPendingProgressSync === "function" && hasPendingProgressSync()) || (typeof hasPendingActivityDraft === "function" && hasPendingActivityDraft()));
  if (!syncState.localDirty || !localHash || !baseHash || !remoteHash || hasPending) return false;
  if (localHash !== baseHash || localHash !== remoteHash) return false;
  var status = syncState.lastSuccessfulPushAt ? "cloud_ok" : "cloud_loaded";
  appendAuditEvent({ type: "sync:stale_dirty_cleared", message: "session=" + TAB_ID + " runId=" + String(runId || "") + " hash=" + localHash.slice(0, 8) + " status=" + status });
  markHashCleanFromRemote(remote, localHash, status, { runId: runId, remoteVerified: true });
  return true;
}

function requestFreshRemoteCheck(reason) {
  if (!isAutoSyncEnabled()) return;
  var gate = savedCloudConfigGate();
  if (!gate.ok) return;
  scheduleSyncSoon(reason || "view_open_remote_check", 0);
}

function refreshCurrentBusinessViewAfterSync() {
  if (state.view === "archive" || state.view === "stats") {
    if (typeof renderArchiveStats === "function") renderArchiveStats();
  }
  if (state.view === "flash") {
    if (typeof renderFlashcard === "function") renderFlashcard();
  }
}


async function syncTick(options = {}) {
  var reason = String(options && options.reason || "heartbeat");
  var lockManager = typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function"
    ? navigator.locks
    : null;
  if (!lockManager || options.webLockHeld === true) return syncTickInternal(options);

  var callbackStarted = false;
  var acquired = false;
  var result = false;
  try {
    await lockManager.request(WEB_SYNC_LOCK_NAME, { mode: "exclusive", ifAvailable: true }, async function(lock) {
      callbackStarted = true;
      if (!lock) return;
      acquired = true;
      result = await syncTickInternal({ ...options, webLockHeld: true });
    });
  } catch (error) {
    // 某些旧浏览器实现不支持 ifAvailable；仅在回调尚未开始时回退到原租约锁。
    if (!callbackStarted) return syncTickInternal(options);
    appendAuditEvent({
      type: "sync:web_lock_callback_failed",
      message: "session=" + TAB_ID + " reason=" + reason + " error=" + String(error && error.message || error || "")
    });
    return false;
  }

  if (!acquired) {
    appendAuditEvent({ type: "sync:skip_web_lock", message: "session=" + TAB_ID + " reason=" + reason });
    var syncState = ensureHashSyncState(state.syncHashState);
    if (syncState.localDirty || (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) {
      scheduleSyncSoon("web_lock_retry", 3000);
    }
    return false;
  }
  return result;
}

/* ===== 27-sync-tick.js ===== */
"use strict";

async function syncTickInternal({ reason = "heartbeat", keepalive = false, bypassBackoff = false } = {}) {
  reason = String(reason || "heartbeat");
  if (!isAutoSyncEnabled() && !isHardForcedSyncReason(reason)) {
    appendAuditEvent({ type: "sync:skip_auto_disabled", message: "session=" + TAB_ID + " reason=" + reason });
    updateSyncIndicator();
    return false;
  }
  if (state.isSyncing) {
    if (!releaseStuckSyncLockIfNeeded()) {
      if (reason !== "heartbeat") state.syncRequestedAfterCurrent = true;
      if (reason === "active_study_idle_upload") state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:request_coalesced", message: "session=" + TAB_ID + " reason=" + reason + " activeRunId=" + String(state.syncRunId || "") });
      return false;
    }
  }
  if (typeof document !== "undefined" && document.hidden && !canRunWhileHidden(reason)) {
    if (reason === "active_study_idle_upload") {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:active_study_idle_upload_deferred_hidden", message: "session=" + TAB_ID + " dirty_preserved=true" });
    } else {
      appendAuditEvent({ type: "sync:skip_hidden", message: "session=" + TAB_ID + " reason=" + reason });
    }
    return false;
  }

  if (!isHardForcedSyncReason(reason) && shouldDeferForActiveStudy(reason)) {
    appendAuditEvent({
      type: "sync:defer_active_study",
      message: "session=" + TAB_ID + " reason=" + reason + " elapsedSinceStudyAction=" + String(Date.now() - (typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0)))
    });
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
    updateSyncIndicator();
    return false;
  }

  if (shouldDeferFlashAutoSync(reason)) {
    var flashSkipState = ensureHashSyncState(state.syncHashState);
    if (flashSkipState.localDirty || state.pendingActiveStudyUpload || (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) {
      if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
      setHashSyncStatus("dirty", "本地已保存，稍后自动同步");
      appendAuditEvent({
        type: "sync:defer_flash_auto_sync",
        message:
          "session=" + TAB_ID +
          " reason=" + String(reason || "") +
          " dirty=" + String(!!flashSkipState.localDirty) +
          " pendingActiveStudyUpload=" + String(!!state.pendingActiveStudyUpload) +
          " idleRemaining=" + String(typeof activeStudyIdleDelayMs === "function" ? activeStudyIdleDelayMs() : ACTIVE_STUDY_SYNC_DEBOUNCE_MS)
      });
      return false;
    }
  }

  // PATCH 事务锁 — 同一页面会话内不并发 PATCH
  if (hasActivePatchTransaction()) {
    appendAuditEvent({ type: "sync:skip_patch_in_flight", message: "session=" + TAB_ID + " reason=" + reason });
    if (reason === "active_study_idle_upload") {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:active_study_idle_upload_pending", message: "session=" + TAB_ID + " reason=patch_in_flight" });
    } else {
      state.syncRequestedAfterCurrent = true;
    }
    return false;
  }

  const gate = savedCloudConfigGate();
  if (!gate.ok) {
    if (gate.configured) {
      recordHashSyncFailure(gate.message, { errorKind: "config_invalid", banner: true, dialog: true, title: "同步配置无效" });
    }
    return false;
  }

  // 自动同步最小间隔。强制触发和 active study idle upload 不被普通间隔拦截。
  var bypassMinInterval = bypassBackoff === true || shouldBypassMinInterval(reason);
  if (!bypassMinInterval && state.lastSyncFinishedAt && Date.now() - state.lastSyncFinishedAt < SYNC_MIN_INTERVAL_MS) {
    var syncStateForSkip = ensureHashSyncState(state.syncHashState);
    appendAuditEvent({ type: "sync:skip_min_interval", message: "session=" + TAB_ID + " reason=" + reason + " remaining=" + (SYNC_MIN_INTERVAL_MS - (Date.now() - state.lastSyncFinishedAt)) });
    if (syncStateForSkip.localDirty) {
      var remainingMs = SYNC_MIN_INTERVAL_MS - (Date.now() - state.lastSyncFinishedAt) + 300;
      if (state.view === "flash" && typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
      else scheduleSyncSoon("min_interval_reschedule", remainingMs);
    }
    return false;
  }

  if (typeof preparePendingStudyFlushForSync === "function") {
    preparePendingStudyFlushForSync(reason); // pre_facts_prepare_marker
  }
  const preFacts = currentSyncFacts({ persistHash: true });
  if (reason === "heartbeat" && !preFacts.effectiveDirty && !isForcedRemoteCheckReason(reason)) {
    var lastPollAt = Number(state.lastCleanRemotePollAt || 0);
    if (lastPollAt && Date.now() - lastPollAt < SYNC_CLEAN_REMOTE_POLL_MS) {
      return false;
    }
  }
  if (shouldSkipSyncForBackoff(bypassBackoff || shouldBypassMinInterval(reason))) {
    var backoffState = ensureHashSyncState(state.syncHashState);
    var retryAt = Date.parse(backoffState.nextRetryAt || "");
    var retryDelay = Number.isFinite(retryAt) ? Math.max(1000, retryAt - Date.now()) : 30000;
    if (backoffState.localDirty || (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) {
      scheduleSyncSoon("backoff_retry", retryDelay);
    }
    appendAuditEvent({ type: "sync:skip_backoff", message: "session=" + TAB_ID + " reason=" + reason + " retryIn=" + retryDelay });
    return false;
  }
  if (!tryAcquireCrossTabSyncLock(reason)) {
    var lockInfo = typeof readCrossTabSyncLock === "function" ? readCrossTabSyncLock() : null;
    var lockState = ensureHashSyncState(state.syncHashState);
    setHashSyncStatus(lockState.localDirty ? "dirty" : "local_only", lockState.localDirty ? "本地已保存，等待上一轮同步锁释放后上传" : "本地可用，等待上一轮同步锁释放");
    appendAuditEvent({ type: "sync:skip_cross_tab_lock", message: "session=" + TAB_ID + " reason=" + reason + " owner=" + String(lockInfo && lockInfo.owner || "") + " lockReason=" + String(lockInfo && lockInfo.reason || "") + " expiresIn=" + String(lockInfo && lockInfo.expiresAt ? lockInfo.expiresAt - Date.now() : "") });
    var lockRetryDelay = Math.max(3000, Math.min(15000, Number(lockInfo && lockInfo.expiresAt || 0) - Date.now() + 500));
    if (reason === "active_study_idle_upload" && typeof scheduleActiveStudyUpload === "function") {
      state.pendingActiveStudyUpload = true;
      scheduleActiveStudyUpload(lockRetryDelay);
    } else if (lockState.localDirty) {
      scheduleSyncSoon("cross_tab_lock_retry", lockRetryDelay);
    }
    return false;
  }

  const runId = ++state.syncRunSeq;
  state.syncRunId = runId;
  state.isSyncing = true;
  state.syncStartedAt = Date.now();
  state.syncLastProgressAt = state.syncStartedAt;
  state.syncLastProgressStage = "sync:start";
  appendAuditEvent({ type: "sync:start", message: "session=" + TAB_ID + " reason=" + reason + " runId=" + runId });
  state.syncActuallyStarted = true;
  state.syncStartedAtMs = Date.now();
  if (typeof preparePendingStudyFlushForSync === "function") {
    preparePendingStudyFlushForSync(reason);
  }
  const localRevisionAtStart = state.localBusinessRevision || 0;
  const localHashAtStart = businessPayloadHash(collectSyncPayload());
  setSyncStatus("syncing");
  markSyncProgress("sync:start", runId);

  var syncResult = { ok: false, unknown: true };
  var startedAtMs = Date.now();

  try {
    state.syncMeta = ensureSyncMeta(state.syncMeta);
    state.syncMeta.lastSyncAttemptAt = beijingISOString();
    persistSyncMeta();

    markSyncProgress("remote:get:start", runId);
    const remote = await fetchGistSyncPayload();
    markSessionRemoteChecked(remote, runId, "syncTick.remote_get");
    markSyncProgress("remote:get:done", runId);
    if (isStaleSyncRun(runId)) return false;

    const remotePayload = currentRemotePayload(remote);
    const remoteHash = currentRemoteHash(remote);

    if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") {
      recordHashSyncFailure(remote.reason || "云端 sync.json 无法安全解析，已停止自动同步", {
        errorKind: remote.kind === "v2_unknown_ops" ? "remote_v2_unknown_ops" : "remote_invalid",
        banner: true,
        dialog: true,
        runId,
        technical: remote.reason || "",
        remote,
        remoteHash,
        remoteHasBusinessData: remoteHasBusinessPayload(remote),
        readOnly: remote.readOnlyAuthFallback === true
      });
      return false;
    }

    if (!isRemoteValidKind(remote.kind) && !isRemoteEmptyKind(remote.kind)) {
      recordHashSyncFailure("云端 sync.json 状态未知，已停止同步", { errorKind: "remote_invalid", banner: true, dialog: true, runId, technical: remote.kind || "unknown", remote, remoteHash, remoteHasBusinessData: remoteHasBusinessPayload(remote), readOnly: remote.readOnlyAuthFallback === true });
      return false;
    }

    if (remote.authenticatedRead === true && state.syncMeta.readOnlyMode !== true) {
      state.syncMeta.cloudWritable = state.syncMeta.cloudWritable === true;
    }
    persistSyncMeta();
    appendAuditEvent({
      type: "sync:remote_transport",
      message: "session=" + TAB_ID + " runId=" + runId + " transport=" + String(remote.readTransport || "unknown") + " authenticated=" + String(remote.authenticatedRead === true)
    });

    markSyncProgress("recovery:check:start", runId);
    if (ensureHashSyncState(state.syncHashState).localRecoveryRequired) {
      const recovery = tryRestoreFromBackupIfPayloadEmpty({ runId });
      if (recovery.status === "restore_failed") return false;
    }
    markSyncProgress("recovery:check:done", runId);

    let local = refreshLocalPayloadHash({ persist: true });
    let facts = currentSyncFacts({ persistHash: false });

    var schemaCheckResult = handleBusinessHashSchemaRemoteCheck(remote, facts, runId);
    if (schemaCheckResult) {
      syncResult = schemaCheckResult;
      return syncResult;
    }
    if (ensureHashSyncState(state.syncHashState).localDirty) {
      facts = currentSyncFacts({ persistHash: false });
    }

    if (!hasBusinessData(facts.payload)) {
      const recovery = tryRestoreFromBackupIfPayloadEmpty({ runId });
      if (recovery.status === "restore_failed") return false;
      if (recovery.status === "restored") {
        local = refreshLocalPayloadHash({ persist: true });
        facts = currentSyncFacts({ persistHash: false });
      }
    }

    const syncState = ensureHashSyncState(state.syncHashState);
    if (clearStaleDirtyIfRemoteMatches(remote, facts, runId)) {
      syncResult = { ok: true, staleDirtyCleared: true };
      return syncResult;
    }
    facts = currentSyncFacts({ persistHash: false });
    const effectiveDirty = facts.effectiveDirty;
    const localHasBusinessData = hasBusinessData(facts.payload);
    const remoteHasData = remoteHasBusinessPayload(remote);
    const remoteEmpty = remoteIsEmptyPayload(remote);
    const readOnly = ensureSyncMeta(state.syncMeta).readOnlyMode === true;

    if (typeof decideSyncAction === "function") {
      const syncDecision = decideSyncAction({ remote, facts, syncState, remoteHash, reason, runId });
      if (typeof appendSyncDecisionAudit === "function") appendSyncDecisionAudit(syncDecision);
    }

    if (remoteEmpty && localHasBusinessData) {
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=empty_cloud_protect_local remoteKind=" + (remote && remote.kind) + " readOnly=" + readOnly + " runId=" + runId });
      const message = readOnly
        ? "只读模式：云端为空，但本地有学习数据。已阻止云端空数据覆盖本地。请更换可写 PAT 后重新同步。"
        : "云端 sync.json 是空数据，但本机仍有学习记录。已阻止云端空数据覆盖本地。";
      markHashDirty(facts.localPayloadHash, message, { runId });
      const fields = makeSyncRiskProblemFields(remote, facts, { remoteHash, remoteHasBusinessData: remoteHasData, readOnly, runId });
      if (readOnly) {
        showSyncProblemDialog({
          severity: "warning",
          code: "READONLY_REMOTE_EMPTY_LOCAL_HAS_DATA",
          title: "只读模式下已保护本地数据",
          message: "当前 PAT 不能写入 Gist。云端 sync.json 是空数据，但本机仍有学习记录，因此没有把云端空数据拉到本机。请更换可写 PAT 后重新同步。",
          technical: syncRiskTechnicalText(fields),
          canRetry: true,
          canCopy: true,
          ...fields
        });
      } else {
        appendAuditEvent({ type: "sync:remote_empty_local_data_auto_push", message: "session=" + TAB_ID + " runId=" + runId + " localHash=" + String(facts.localPayloadHash || "").slice(0, 8) });
      }

      if (!readOnly) {
        syncResult = await syncBranchPushLocal({
          remote,
          local: facts,
          keepalive,
          reason: "remote_empty_protect_local",
          runId,
          remoteHashAtDecision: remoteHash
        });
        return syncResult;
      }

      markReadOnlyDirtyState(message, facts, { runId });
      return false;
    }

    if (!localHasBusinessData) {
      if (remoteEmpty) {
        state.syncHashState = ensureHashSyncState(state.syncHashState);
        state.syncHashState.localDirty = false;
        state.syncHashState.localPayloadHash = facts.localPayloadHash || local.hash || "";
        state.syncHashState.baseRemoteHash = "";
        state.syncHashState.dirtySince = "";
        state.syncHashState.lastSyncStatus = "local_only";
        state.syncHashState.lastSyncError = "";
        state.syncHashState.localRecoveryRequired = false;
        persistHashSyncState();
        updateSyncIndicator();
        return true;
      }

      if (remoteHasData) {
        appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=pull_remote remoteKind=" + (remote && remote.kind) + " runId=" + runId });
        if (hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) {
          const recheck = currentSyncFacts({ persistHash: true });
          if (readOnly) {
            return syncBranchReadOnlyMergeLocal({ remote, remotePayload, local: recheck, reason: "local_changed_before_pull_read_only", runId });
          }
          syncResult = await syncBranchMerge({ remote, remotePayload, local: recheck, keepalive, reason: "local_changed_before_pull", runId });
          return syncResult;
        }
        syncResult = await Promise.resolve(pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId, localRevisionAtStart, localHashAtStart }));
        return syncResult;
      }

      recordHashSyncFailure("云端 sync.json 无法判断为安全可拉取数据，已停止同步", {
        errorKind: "remote_unreadable_payload",
        banner: true,
        dialog: true,
        runId,
        remote,
        remoteHash,
        remoteHasBusinessData: remoteHasData,
        readOnly,
        technical: "remote.kind=" + String(remote && remote.kind || "")
      });
      return false;
    }

    if (readOnly) {
      if (remoteHasData && remoteHash !== syncState.baseRemoteHash) {
        // Read-only mode still merges instead of overwriting. If the merged result is
        // identical to remote, the branch is marked clean without requiring a PATCH.
        syncResult = await syncBranchReadOnlyMergeLocal({
          remote,
          remotePayload,
          local: facts,
          reason: (!effectiveDirty && !syncState.localDirty)
            ? "read_only_remote_changed_local_clean_merge"
            : "read_only_remote_changed_local_dirty",
          runId
        });
        return syncResult;
      }
      if (effectiveDirty) {
        markReadOnlyDirtyState("本地有未上传数据，但 PAT 无效或无写权限，当前无法上传。", facts, { runId });
        syncResult = { ok: false, readOnlyDirty: true };
        return syncResult;
      }
      setReadOnlySyncState("PAT 无效或无写权限，当前只读。", { runId });
      syncResult = { ok: false, readOnly: true };
      return syncResult;
    }

    if (remoteHash === syncState.baseRemoteHash && !effectiveDirty) {
      markSessionRemoteChecked(remote, runId, "syncTick.noop_same_hash");
      syncResult = { ok: true, noop: true };
      return syncResult;
    }

    if (remoteHash === syncState.baseRemoteHash && effectiveDirty) {
      if (typeof appendHashDiffSummary === "function") appendHashDiffSummary(facts.payload, runId, reason);
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=push_local hash_match dirty=true runId=" + runId });
      syncResult = await syncBranchPushLocal({ remote, local: facts, keepalive, reason, runId, remoteHashAtDecision: remoteHash });
      return syncResult;
    }

    if (remoteHash !== syncState.baseRemoteHash) {
      if (!remoteHasData) {
        recordHashSyncFailure("云端 sync.json 无法安全解析为可合并数据，已停止自动同步", {
          errorKind: "remote_invalid",
          banner: true,
          dialog: true,
          runId,
          remote,
          remoteHash,
          remoteHasBusinessData: remoteHasData,
          readOnly,
          technical: "remote.kind=" + String(remote && remote.kind || "")
        });
        syncResult = { ok: false, remoteInvalid: true };
        return syncResult;
      }

      // Any remote change is merged. A device marked clean may still hold records that
      // another stale device overwrote after this device's last successful upload.
      const localForMerge = hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)
        ? currentSyncFacts({ persistHash: true })
        : facts;
      const mergeReason = (!effectiveDirty && !syncState.localDirty)
        ? "clean_local_remote_changed_safe_merge"
        : "dirty_local_remote_changed_merge";
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=merge_remote_changed remoteHash=" + String(remoteHash || "").slice(0, 8) + " baseHash=" + String(syncState.baseRemoteHash || "").slice(0, 8) + " localHash=" + String(localForMerge.localPayloadHash || "").slice(0, 8) + " runId=" + runId });
      syncResult = await syncBranchMerge({ remote, remotePayload, local: localForMerge, keepalive, reason: mergeReason, runId });
      return syncResult;
    }

    // Should not reach here with correct branching above
    syncResult = { ok: false, unknown: true };
    return syncResult;
  } catch (error) {
    if (!isStaleSyncRun(runId)) {
      if (shouldDowngradeFailureForBackground(reason)) {
        appendAuditEvent({ type: "sync:pagehide_flush_deferred", message: "session=" + TAB_ID + " runId=" + runId + " reason=" + reason + " dirty_preserved=true error=" + syncErrorMessage(error) });
      } else {
        var normalizedRequestError = normalizeSyncRequestError(error);
        var showImmediateFailure = typeof isUserInitiatedSyncReason === "function" && isUserInitiatedSyncReason(reason);
        recordHashSyncFailure(syncErrorMessage(error), {
          errorKind: normalizedRequestError.rateLimited === true ? "rate_limited" : "remote_get_failed",
          title: "云同步请求失败",
          banner: showImmediateFailure,
          dialog: showImmediateFailure,
          retryable: true,
          runId,
          httpStatus: Number(normalizedRequestError.httpStatus || 0),
          stage: normalizedRequestError.stage || "remote_get",
          transport: normalizedRequestError.transport || "",
          nextRetryAt: normalizedRequestError.retryAt || "",
          technical: requestErrorTechnical(error) + (error && error.technical ? "\n" + error.technical : "")
        });
      }
    }
    syncResult = { ok: false, error: true };
    return syncResult;
  } finally {
    if (!isStaleSyncRun(runId)) {
      markSyncProgress("sync:finalize", runId);
      var elapsedMs = Date.now() - startedAtMs;

      // sync:complete = syncTick 流程结束（不一定已 cloud_saved）
      // sync:mark_clean = 已确认云端保存或加载
      // sync:local_changed_during_verify = 上一轮云端已写入，但本地又产生新变化
      // sync:failed = 真失败
      appendAuditEvent({
        type: "sync:complete",
        message: "session=" + TAB_ID + " runId=" + runId + " elapsed=" + elapsedMs + "ms reason=" + (reason || "") + " result=" + summarizeSyncResult(syncResult)
      });

      state.isSyncing = false;
      state.syncStartedAt = 0;
      state.syncActuallyStarted = false;
      state.syncStartedAtMs = 0;
      state.syncLastProgressAt = 0;
      state.lastSyncFinishedAt = Date.now();
      if (typeof clearActiveStudyTimerIfClean === "function") clearActiveStudyTimerIfClean();
      refreshVisibleSyncDiagnostics();
      if (typeof refreshCurrentBusinessViewAfterSync === "function") refreshCurrentBusinessViewAfterSync();
      var finalSyncState = ensureHashSyncState(state.syncHashState);
      var finalHashDirty = Boolean(finalSyncState.baseRemoteHash && finalSyncState.localPayloadHash && finalSyncState.localPayloadHash !== finalSyncState.baseRemoteHash);
      var finalPendingStudy = typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists();
      if ((finalPendingStudy || finalSyncState.localDirty || finalHashDirty) && typeof scheduleActiveStudyUpload === "function") {
        if (state.view === "flash" && !state.activeStudySyncTimer) {
          scheduleActiveStudyUpload();
        }
      } else if (!finalPendingStudy && !finalSyncState.localDirty && !finalHashDirty) {
        state.pendingActiveStudyUpload = false;
      }
      if (state.syncRequestedAfterCurrent) {
        state.syncRequestedAfterCurrent = false;
        if (finalPendingStudy || finalSyncState.localDirty || finalHashDirty) {
          scheduleSyncSoon("queued_after_current", 1000);
        }
      }
    } else {
      state.syncActuallyStarted = false;
      state.syncStartedAtMs = 0;
    }

    releaseCrossTabSyncLock();
  }
}

/* ===== 28a-sync-branches.js ===== */
"use strict";

// ── merge defense ──────────────────────────────────────────────────

async function syncBranchPushLocal({ remote, local, keepalive, reason, runId, remoteHashAtDecision, rebaseCount = 0, patch409Retries = 0 }) {
  if (isStaleSyncRun(runId)) return false;
  if (typeof shouldAbortAutoPatchForActiveStudy === "function" && shouldAbortAutoPatchForActiveStudy(reason)) {
    appendAuditEvent({ type: "sync:defer_active_study_before_patch", message: "session=" + TAB_ID + " runId=" + runId + " reason=" + String(reason || "") + " elapsedSinceStudyAction=" + String(Date.now() - (typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0))) });
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
    return { ok: false, deferredActiveStudy: true };
  }
  const currentLocal = local && local.payload ? local : refreshLocalPayloadHash({ persist: true });
  const payload = normalizeSyncPayload(currentLocal.payload);
  writeHashBackup("pre_push", payload, reason);
  const uploadedHash = businessPayloadHash(payload);
  const result = await patchBusinessPayloadToGist(payload, { remote, keepalive, runId, reason, remoteHashAtDecision: remoteHashAtDecision || currentRemoteHash(remote) });
  if (isStaleSyncRun(runId)) return false;
  // 409 retryable conflict: 延迟后重试，不超过 MAX_PATCH_409_RETRIES
  if (result.retryableConflict) {
    if (patch409Retries >= MAX_PATCH_409_RETRIES) {
      recordHashSyncFailure("GitHub Gist 并发更新冲突，已重试" + MAX_PATCH_409_RETRIES + "次仍失败。本地数据已保留，请稍后重新同步。", { errorKind: "patch_conflict_409", banner: true, dialog: true, runId, httpStatus: 409 });
      return false;
    }
    appendAuditEvent({ type: "sync:patch_retry", message: "session=" + TAB_ID + " runId=" + runId + " 409 retry " + (patch409Retries + 1) + "/" + MAX_PATCH_409_RETRIES, httpStatus: 409 });
    await delay(1200);
    return await syncBranchPushLocal({ remote, local: currentSyncFacts({ persistHash: true }), keepalive, reason: "patch_409_retry", runId, remoteHashAtDecision, rebaseCount, patch409Retries: patch409Retries + 1 });
  }
  if (result.preflightChanged) {
    if (rebaseCount >= MAX_PREFLIGHT_REBASE) {
      recordHashSyncFailure("云端在上传前连续变化，已停止自动上传。本地数据仍保留，请稍后重新同步。", { errorKind: "preflight_remote_changed", banner: true, dialog: true, runId, remote: result.remote, remoteHash: currentRemoteHash(result.remote), remoteHasBusinessData: remoteHasBusinessPayload(result.remote), readOnly: result.remote && result.remote.readOnlyAuthFallback === true });
      return false;
    }
    const latestRemote = result.remote;
    var mergeResult = await syncBranchMerge({ remote: latestRemote, remotePayload: currentRemotePayload(latestRemote), local: currentSyncFacts({ persistHash: true }), keepalive, reason: result.verifyMismatch ? "verify_mismatch_rebase" : "preflight_rebase", runId, rebaseCount: rebaseCount + 1 });
    return mergeResult;
  }
  if (!result.ok) return false;
  var finalResult = finalizeVerifiedPatch({ uploadedPayload: payload, uploadedHash, verifiedRemote: result.remote, runId });
  if (finalResult && finalResult.localChangedDuringVerify) {
    return finalResult;
  }
  return finalResult;
}


async function syncBranchMerge({ remote, remotePayload, local, keepalive, reason, runId, rebaseCount = 0, patch409Retries = 0 }) {
  if (isStaleSyncRun(runId)) return false;
  if (typeof shouldAbortAutoPatchForActiveStudy === "function" && shouldAbortAutoPatchForActiveStudy(reason)) {
    appendAuditEvent({ type: "sync:defer_active_study_before_patch", message: "session=" + TAB_ID + " runId=" + runId + " reason=" + String(reason || "") + " stage=merge_before_apply elapsedSinceStudyAction=" + String(Date.now() - (typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0))) });
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
    return { ok: false, deferredActiveStudy: true };
  }
  markSyncProgress("merge:start", runId);
  if (!remotePayload) remotePayload = normalizeSyncPayload({});
  const currentLocal = local && local.payload ? local : refreshLocalPayloadHash({ persist: true });
  writeHashBackup("pre_merge", currentLocal.payload, reason);
  const mergedPayload = normalizeSyncPayload(safeMergePayloads(remotePayload, currentLocal.payload));
  if (!validateSyncPayload(mergedPayload)) {
    recordHashSyncFailure("自动合并后的数据校验失败；本地数据已保留", { errorKind: "merge_failed", banner: true, dialog: true, runId, remote, remoteHash: currentRemoteHash(remote), remoteHasBusinessData: remoteHasBusinessPayload(remote), readOnly: remote && remote.readOnlyAuthFallback === true });
    return false;
  }
  const mergedHash = businessPayloadHash(mergedPayload);
  const applied = applyRemotePayloadSafely(mergedPayload, { source: "sync", expectedHash: mergedHash, runId, reason: reason || "safe_merge_apply" });
  if (!applied) return false;
  const localAfterMergeHash = businessPayloadHash(collectSyncPayload());
  if (localAfterMergeHash !== mergedHash) {
    recordHashSyncFailure("safe merge 写入本地后校验失败，已停止上传", { errorKind: "local_apply_verify_failed", banner: true, dialog: true, runId, remote, remoteHash: currentRemoteHash(remote), remoteHasBusinessData: remoteHasBusinessPayload(remote), readOnly: remote && remote.readOnlyAuthFallback === true, technical: "expected=" + mergedHash + ", actual=" + localAfterMergeHash });
    return false;
  }
  markSyncProgress("merge:done", runId);
  const remoteHashAfterMerge = currentRemoteHash(remote);
  if (remoteHashAfterMerge && mergedHash === remoteHashAfterMerge) {
    markHashCleanFromRemote(remote, mergedHash, "cloud_loaded", { runId, remoteVerified: true });
    if (typeof renderCurrentView === "function") renderCurrentView({ touchProgress: false });
    appendAuditEvent({
      type: "sync:merge_remote_already_complete",
      message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(mergedHash || "").slice(0, 8)
    });
    return { ok: true, merged: true, noPatchNeeded: true };
  }
  const result = await patchBusinessPayloadToGist(mergedPayload, { remote, keepalive, runId, reason, remoteHashAtDecision: remoteHashAfterMerge });
  if (isStaleSyncRun(runId)) return false;
  // 409 retryable conflict: 延迟后重试，不超过 MAX_PATCH_409_RETRIES
  if (result.retryableConflict) {
    if (patch409Retries >= MAX_PATCH_409_RETRIES) {
      recordHashSyncFailure("GitHub Gist 并发更新冲突，已重试" + MAX_PATCH_409_RETRIES + "次仍失败。本地数据已保留，请稍后重新同步。", { errorKind: "patch_conflict_409", banner: true, dialog: true, runId, httpStatus: 409 });
      return false;
    }
    appendAuditEvent({ type: "sync:patch_retry", message: "session=" + TAB_ID + " runId=" + runId + " 409 retry " + (patch409Retries + 1) + "/" + MAX_PATCH_409_RETRIES, httpStatus: 409 });
    await delay(1200);
    var mergeResult409 = await syncBranchMerge({ remote, remotePayload, local: currentSyncFacts({ persistHash: true }), keepalive, reason: "patch_409_retry", runId, rebaseCount, patch409Retries: patch409Retries + 1 });
    return mergeResult409;
  }
  if (result.preflightChanged) {
    if (rebaseCount >= MAX_PREFLIGHT_REBASE) {
      recordHashSyncFailure("云端在上传前连续变化，已停止自动上传。本地数据仍保留，请稍后重新同步。", { errorKind: "preflight_remote_changed", banner: true, dialog: true, runId, remote: result.remote, remoteHash: currentRemoteHash(result.remote), remoteHasBusinessData: remoteHasBusinessPayload(result.remote), readOnly: result.remote && result.remote.readOnlyAuthFallback === true });
      return false;
    }
    const latestRemote = result.remote;
    var mergeResult = await syncBranchMerge({ remote: latestRemote, remotePayload: currentRemotePayload(latestRemote), local: currentSyncFacts({ persistHash: true }), keepalive, reason: result.verifyMismatch ? "verify_mismatch_rebase" : "preflight_rebase", runId, rebaseCount: rebaseCount + 1 });
    return mergeResult;
  }
  if (!result.ok) return false;
  var finalResult = finalizeVerifiedPatch({ uploadedPayload: mergedPayload, uploadedHash: mergedHash, verifiedRemote: result.remote, runId });
  if (finalResult && finalResult.localChangedDuringVerify) {
    return finalResult;
  }
  return finalResult;
}

/* ===== 28-sync-push-patch.js ===== */
"use strict";

function buildSyncEnvelope(payload) {
  const normalized = normalizeSyncPayload(payload);
  const payloadHash = businessPayloadHash(normalized);
  return {
    version: 1,
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    updatedAt: beijingISOString(),
    clientId: ensureSyncMeta(state.syncMeta).clientId,
    payloadHash,
    payload: compactSyncPayloadForTransport(normalized)
  };
}


function buildGistPatchFiles(payloadJson, remote) {
  var files = {};
  files[SYNC_FILE_NAME] = { content: payloadJson };

  // 当天首次成功写入时才新增一份远端日备份。普通同步只发送 sync.json，
  // 避免在国内网络下每轮 PATCH 重复传输两到三份完整 payload。
  var todayName = SYNC_CLOUD_BACKUP_PREFIX + localDateKey() + ".json";
  var existingNames = Array.isArray(remote && remote.fileNames) ? remote.fileNames.slice() : [];
  if (!existingNames.includes(todayName)) files[todayName] = { content: payloadJson };

  var backupNames = existingNames.filter(function(name) {
    return String(name || "").startsWith(SYNC_CLOUD_BACKUP_PREFIX) && /\.json$/i.test(name);
  });
  if (!backupNames.includes(todayName)) backupNames.push(todayName);
  backupNames.sort().reverse();
  backupNames.slice(Math.max(1, SYNC_CLOUD_BACKUP_RETENTION_DAYS)).forEach(function(name) {
    files[name] = null;
  });
  return files;
}


function isUserInitiatedSyncReason(reason) {
  return ["manual", "manual_retry", "manual_push", "manual_pull", "config_saved", "remote_restore_merge"].includes(String(reason || ""));
}

function setCloudWriteCapability(writable, message) {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.cloudWritable = writable === true;
  state.syncMeta.readOnlyMode = writable !== true;
  if (message) {
    state.syncMeta.lastSyncErrorAt = beijingISOString();
    state.syncMeta.lastSyncErrorMessage = String(message);
  } else if (writable === true) {
    state.syncMeta.lastSyncErrorAt = "";
    state.syncMeta.lastSyncErrorMessage = "";
  }
  persistSyncMeta();
}

function isGithubRateLimitedResponse(response) {
  if (!response) return false;
  var retryAfter = response.headers && response.headers.get ? response.headers.get("retry-after") : "";
  var remaining = response.headers && response.headers.get ? response.headers.get("x-ratelimit-remaining") : "";
  return Number(response.status) === 429 || Boolean(retryAfter) || String(remaining || "") === "0";
}

async function confirmUploadedHashAfterUncertainPatch(uploadedHash, runId, source) {
  try {
    await delay(1200);
    var remote = await fetchGistSyncPayload();
    markSessionRemoteChecked(remote, runId, source || "patch.uncertain_confirm");
    if (!isRemoteValidKind(remote.kind)) return { confirmed: false, remote: remote };
    var remoteHash = currentRemoteHash(remote);
    if (String(remoteHash || "") === String(uploadedHash || "")) {
      appendAuditEvent({
        type: "sync:patch_uncertain_confirmed",
        message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(uploadedHash || "").slice(0, 8)
      });
      return { confirmed: true, remote: remote };
    }
    return { confirmed: false, remote: remote, remoteChanged: true };
  } catch (error) {
    appendAuditEvent({
      type: "sync:patch_uncertain_confirm_failed",
      message: "session=" + TAB_ID + " runId=" + runId + " " + requestErrorTechnical(error),
      httpStatus: Number(error && error.httpStatus || 0)
    });
    return { confirmed: false, error: error };
  }
}

async function patchBusinessPayloadToGist(payload, { remote, keepalive = false, runId, reason = "", remoteHashAtDecision = "" } = {}) {
  const normalized = normalizeSyncPayload(payload);
  const uploadedHash = businessPayloadHash(normalized);
  const userInitiated = isUserInitiatedSyncReason(reason);

  if (!validateSyncPayload(normalized)) {
    recordHashSyncFailure("准备上传的数据校验失败", { errorKind: "patch_failed", banner: true, dialog: true, runId });
    return { ok: false };
  }

  if (typeof shouldAbortAutoPatchForActiveStudy === "function" && shouldAbortAutoPatchForActiveStudy(reason)) {
    appendAuditEvent({ type: "sync:defer_active_study_before_patch", message: "session=" + TAB_ID + " runId=" + runId + " reason=" + String(reason || "") + " stage=patch_start" });
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
    return { ok: false, deferredActiveStudy: true };
  }

  // 同一标签页内只允许一个完整的 preflight → PATCH → verify 事务。
  if (!beginPatchTransaction(runId, "patchBusinessPayloadToGist")) {
    appendAuditEvent({ type: "sync:blocked_patch_in_flight", message: "session=" + TAB_ID + " runId=" + runId });
    return { ok: false, patchInFlight: true, retryable: true };
  }

  try {
    markSyncProgress("preflight:get:start", runId);
    let latestRemote;
    try {
      latestRemote = await fetchGistSyncPayload();
      markSessionRemoteChecked(latestRemote, runId, "patch.preflight");
    } catch (error) {
      const technical = requestErrorTechnical(error);
      const normalizedError = normalizeSyncRequestError(error);
      recordHashSyncFailure("上传前无法读取最新云端数据，本地数据已保留", {
        errorKind: "remote_get_failed",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        httpStatus: Number(error && error.httpStatus || 0),
        stage: normalizedError.stage || "preflight_get",
        transport: normalizedError.transport || "",
        technical: technical
      });
      return { ok: false, retryable: true };
    }
    markSyncProgress("preflight:get:done", runId);

    if (isStaleSyncRun(runId)) return { ok: false };
    if (latestRemote.kind === "invalid" || latestRemote.kind === "v2_unknown_ops") {
      recordHashSyncFailure("上传前发现云端 sync.json 无法安全解析，已停止上传", {
        errorKind: latestRemote.kind,
        banner: true,
        dialog: true,
        runId,
        technical: latestRemote.reason || ""
      });
      return { ok: false };
    }

    const latestRemoteHash = currentRemoteHash(latestRemote);
    if (String(latestRemoteHash || "") !== String(remoteHashAtDecision || "")) {
      return { ok: false, preflightChanged: true, remote: latestRemote };
    }

    if (typeof shouldAbortAutoPatchForActiveStudy === "function" && shouldAbortAutoPatchForActiveStudy(reason)) {
      state.pendingActiveStudyUpload = true;
      if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
      return { ok: false, deferredActiveStudy: true };
    }

    const envelope = buildSyncEnvelope(normalized);
    // 云端交换数据使用紧凑 JSON，减少 PATCH 体积和超时概率。
    const payloadJson = JSON.stringify(envelope);
    const payloadBytes = typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(payloadJson).length
      : payloadJson.length;
    if (payloadBytes > GIST_RELIABLE_INLINE_MAX_BYTES) {
      recordHashSyncFailure("同步数据已接近 GitHub Gist 单文件可靠读取上限，已停止上传以避免部分网络环境无法读回。请先导出排查包并清理异常膨胀数据。", {
        errorKind: "payload_too_large",
        retryable: false,
        banner: true,
        dialog: true,
        runId,
        stage: "payload_size_guard",
        technical: "payloadBytes=" + payloadBytes + ", limit=" + GIST_RELIABLE_INLINE_MAX_BYTES
      });
      return { ok: false, fatal: true, payloadTooLarge: true };
    }
    const files = buildGistPatchFiles(payloadJson, latestRemote);

    let response;
    try {
      markSyncProgress("patch:start", runId);
      appendAuditEvent({ type: "sync:patch_sent", message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(uploadedHash).slice(0, 8) + " bytes=" + String(payloadBytes) + " files=" + String(Object.keys(files).length) });
      response = await fetchWithTimeout(gistApiUrl(state.cloud.gistId), {
        method: "PATCH",
        keepalive: keepalive === true,
        headers: {
          Authorization: "Bearer " + state.cloud.token,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ files: files })
      }, GITHUB_PATCH_TIMEOUT_MS, { stage: "gist_patch", transport: "authenticated_fetch" });
      markSyncProgress("patch:done", runId);
    } catch (error) {
      // PATCH 可能已被 GitHub 接收，只是响应在网络中丢失；先读回确认，禁止盲目重写。
      const confirmation = await confirmUploadedHashAfterUncertainPatch(uploadedHash, runId, "patch.network_error_confirm");
      if (confirmation.confirmed) {
        setCloudWriteCapability(true);
        return { ok: true, remote: confirmation.remote, uploadedHash: uploadedHash, confirmedAfterNetworkError: true };
      }
      if (confirmation.remoteChanged && confirmation.remote && isRemoteValidKind(confirmation.remote.kind)) {
        return { ok: false, preflightChanged: true, remote: confirmation.remote, patchResultUnknown: true };
      }
      const technical = requestErrorTechnical(error);
      const normalizedError = normalizeSyncRequestError(error);
      recordHashSyncFailure("云端写入结果暂时无法确认，本地数据已保留，稍后会先核验再重试", {
        errorKind: "patch_result_unknown",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        httpStatus: Number(error && error.httpStatus || 0),
        stage: normalizedError.stage || "gist_patch",
        transport: normalizedError.transport || "authenticated_fetch",
        technical: technical
      });
      return { ok: false, retryable: true, patchResultUnknown: true };
    }

    if (!response.ok) {
      if (response.status === 409) {
        appendAuditEvent({ type: "sync:patch_409", message: "session=" + TAB_ID + " runId=" + runId + " HTTP 409", httpStatus: 409 });
        const confirmation = await confirmUploadedHashAfterUncertainPatch(uploadedHash, runId, "patch.409_confirm");
        if (confirmation.confirmed) {
          setCloudWriteCapability(true);
          return { ok: true, remote: confirmation.remote, uploadedHash: uploadedHash };
        }
        if (confirmation.remoteChanged && confirmation.remote && isRemoteValidKind(confirmation.remote.kind)) {
          return { ok: false, preflightChanged: true, remote: confirmation.remote };
        }
        return { ok: false, retryableConflict: true, httpStatus: 409 };
      }

      const classified = await classifyGithubResponseError(response, "PATCH sync.json");
      const status = Number(response.status || 0);
      const rateLimited = isGithubRateLimitedResponse(response);
      const authFailed = (status === 401 || status === 403) && !rateLimited;
      const invalidRequest = status === 404 || status === 422;
      if (authFailed) setCloudWriteCapability(false, classified.message);

      recordHashSyncFailure(classified.message, {
        errorKind: rateLimited ? "rate_limited" : (authFailed ? "auth_failed" : (status === 404 ? "invalid_config" : (status === 422 ? "patch_failed_422" : "patch_failed_http"))),
        retryable: rateLimited || status >= 500,
        banner: userInitiated || authFailed || invalidRequest,
        dialog: userInitiated || authFailed || invalidRequest,
        runId,
        httpStatus: status,
        stage: "gist_patch",
        transport: "authenticated_fetch",
        nextRetryAt: classified.retryAt || "",
        technical: classified.technical
      });
      return { ok: false, fatal: authFailed || invalidRequest, retryable: rateLimited || status >= 500, httpStatus: status };
    }

    setCloudWriteCapability(true);
    appendAuditEvent({ type: "sync:patch_success", message: "session=" + TAB_ID + " runId=" + runId + " uploadedHash=" + String(uploadedHash).slice(0, 8) });

    let verified;
    try {
      markSyncProgress("verify:get:start", runId);
      verified = await fetchGistSyncPayload();
      markSessionRemoteChecked(verified, runId, "patch.verify");
      markSyncProgress("verify:get:done", runId);
      appendAuditEvent({ type: "sync:verify_done", message: "session=" + TAB_ID + " runId=" + runId + " verifiedHash=" + String(currentRemoteHash(verified) || "").slice(0, 8) });
    } catch (error) {
      const normalizedError = normalizeSyncRequestError(error);
      recordHashSyncFailure("GitHub 已接受写入，但暂时无法完成读回校验；本地数据已保留", {
        errorKind: "patch_result_unknown",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        httpStatus: Number(error && error.httpStatus || 0),
        stage: normalizedError.stage || "verify_get",
        transport: normalizedError.transport || "",
        technical: requestErrorTechnical(error)
      });
      return { ok: false, verifyDeferred: true, commitAccepted: true, patchResultUnknown: true };
    }

    if (!isRemoteValidKind(verified.kind)) {
      recordHashSyncFailure("GitHub 已接受写入，但云端 sync.json 未通过校验", {
        errorKind: "verify_failed",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        technical: verified.reason || verified.kind || ""
      });
      return { ok: false, verifyDeferred: true };
    }

    const verifiedHash = currentRemoteHash(verified);
    if (verifiedHash !== uploadedHash) {
      appendAuditEvent({ type: "sync:verify_mismatch", message: "session=" + TAB_ID + " runId=" + runId + " expected=" + String(uploadedHash).slice(0, 8) + " actual=" + String(verifiedHash).slice(0, 8) });
      await delay(1500);
      var recheck = null;
      var recheckError = null;
      try {
        recheck = await fetchGistSyncPayload();
        markSessionRemoteChecked(recheck, runId, "patch.verify_mismatch_recheck");
      } catch (error) {
        recheckError = error;
      }

      if (recheck && currentRemoteHash(recheck) === uploadedHash) {
        return { ok: true, remote: recheck, uploadedHash: uploadedHash };
      }
      if (recheck && isRemoteValidKind(recheck.kind)) {
        return { ok: false, preflightChanged: true, remote: recheck, verifyMismatch: true };
      }

      recordHashSyncFailure("云端写入尚未完成一致性确认，本地数据已保留", {
        errorKind: "patch_result_unknown",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        stage: "verify_recheck",
        transport: recheckError ? normalizeSyncRequestError(recheckError).transport : "",
        technical: recheckError ? requestErrorTechnical(recheckError) : ("expected=" + uploadedHash + ", actual=" + String(verifiedHash || ""))
      });
      scheduleSyncSoon("verify_mismatch_retry", 10000);
      return { ok: false, verifyDeferred: true, patchResultUnknown: true };
    }

    return { ok: true, remote: verified, uploadedHash: uploadedHash };
  } finally {
    endPatchTransaction(runId);
  }
}


function canMarkCloudOkAfterVerify({ uploadedHash, currentHash, runId } = {}) {
  if (isStaleSyncRun(runId)) return false;
  if (!uploadedHash || !currentHash || String(uploadedHash) !== String(currentHash)) return false;
  if (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) return false;
  var syncState = ensureHashSyncState(state.syncHashState);
  if (hasUnclearedBlockingSyncError(syncState)) return false;
  return true;
}

function finalizeVerifiedPatch({ uploadedPayload, uploadedHash, verifiedRemote, runId }) {
  if (isStaleSyncRun(runId)) return false;
  markSyncProgress("sync:finalize", runId);
  const current = refreshLocalPayloadHash({ persist: false });
  if (!canMarkCloudOkAfterVerify({ uploadedHash: uploadedHash, currentHash: current.hash, runId: runId })) {
    var now = beijingISOString();
    state.syncHashState = ensureHashSyncState(state.syncHashState);

    // 云端已确认 uploadedHash
    state.syncHashState.baseRemoteHash = uploadedHash;
    state.syncHashState.lastSuccessfulPushAt = now;
    state.syncHashState.lastSyncedPayloadHash = uploadedHash;

    // 当前本地又变，保持 dirty
    state.syncHashState.localPayloadHash = current.hash;
    state.syncHashState.localDirty = true;
    if (!state.syncHashState.dirtySince) {
      state.syncHashState.dirtySince = now;
    }

    state.syncHashState.lastSyncStatus = "dirty";
    state.syncHashState.lastSyncError = "";
    state.syncHashState.lastSyncErrorAt = "";
    state.lastDirtyReason = "local_changed_during_verify";
    state.lastDirtyFromVerify = true;

    persistHashSyncState();
    updateLegacyMetaAfterRemote(verifiedRemote, uploadedHash, "push");

    appendAuditEvent({
      type: "sync:local_changed_during_verify",
      message:
        "session=" + TAB_ID +
        " runId=" + runId +
        " uploadedHash=" + String(uploadedHash || "").slice(0, 8) +
        " currentHash=" + String(current.hash || "").slice(0, 8)
    });

    if (typeof scheduleActiveStudyUpload === "function" && state.view === "flash") {
      scheduleActiveStudyUpload();
    } else {
      scheduleSyncSoon("local_changed_during_verify", Math.max(2500, ACTIVE_STUDY_SYNC_DEBOUNCE_MS));
    }
    refreshVisibleSyncDiagnostics();

    return { ok: false, localChangedDuringVerify: true };
  }
  markHashCleanFromRemote(verifiedRemote, uploadedHash, "cloud_ok", { runId: runId, remoteVerified: true });
  return true;
}

// ── 本地数据保护 ──────────────────────────────────────────────────────

/* ===== 29-sync-merge.js ===== */
"use strict";

// ── markStates LWW merge ───────────────────────────────────────────

function mergeMarkStatesLww(remoteStates, localStates) {
  var remote = sanitizeMarkStatesPayload(remoteStates);
  var local = sanitizeMarkStatesPayload(localStates);
  var result = {};
  var ids = new Set([...Object.keys(remote), ...Object.keys(local)]);
  ids.forEach(function(id) {
    var r = remote[id];
    var l = local[id];
    if (r && !l) { result[id] = r; return; }
    if (!r && l) { result[id] = l; return; }
    result[id] = compareMarkState(l, r) >= 0 ? l : r;
  });
  return sanitizeMarkStatesPayload(result);
}


function safeMergePayloads(remotePayload, localPayload) {
  const remote = normalizeSyncPayload(cloneJson(remotePayload));
  const local = normalizeSyncPayload(cloneJson(localPayload));
  const merged = normalizeSyncPayload(remote);
  merged.settings = normalizeSettingsPayload(local.settings);
  merged.activeBookId = local.activeBookId || remote.activeBookId;
  BOOKS.forEach((book) => {
    merged.progress[book.id] = chooseFurtherProgress(remote.progress[book.id], local.progress[book.id]);
    merged.unknownProgress[book.id] = mergeUnknownProgress(book, remote.unknownProgress[book.id], local.unknownProgress[book.id]);
    merged.markStates[book.id] = mergeMarkStatesLww(remote.markStates[book.id], local.markStates[book.id]);
    merged.marks[book.id] = deriveMarksFromMarkStates(merged.markStates[book.id]);
    merged.activity[book.id] = mergeActivity(remote.activity[book.id], local.activity[book.id]);
    merged.unitStats[book.id] = mergeUnitStats(remote.unitStats[book.id], local.unitStats[book.id]);
  });
  merged.updatedAt = beijingISOString();
  return normalizeSyncPayload(merged);
}


function chooseFurtherProgress(remoteProgress, localProgress) {
  const remote = sanitizeProgressPayload(remoteProgress);
  const local = sanitizeProgressPayload(localProgress);
  if (progressDepth(local) >= progressDepth(remote)) return local;
  return remote;
}


function mergeUnknownProgress(book, remoteProgress, localProgress) {
  const remote = normalizeUnknownProgressPayload(book, remoteProgress);
  const local = normalizeUnknownProgressPayload(book, localProgress);
  const units = {};
  Array.from({ length: book.totalUnits }, (_, index) => index + 1).forEach((unit) => {
    const key = String(unit);
    units[key] = chooseFurtherProgress(remote.units[key], local.units[key]);
  });
  return {
    book: chooseFurtherProgress(remote.book, local.book),
    units
  };
}


function mergeActivity(remoteActivity, localActivity) {
  // Activity is currently stored as daily counters without eventId/sessionId.
  // For same-day conflicts we take max values to avoid double-counting duplicated sync data.
  // A future event log can sum by eventId after dedupe.
  const remote = sanitizeActivityPayload(remoteActivity);
  const local = sanitizeActivityPayload(localActivity);
  const days = {};
  const keys = new Set([...Object.keys(remote.days), ...Object.keys(local.days)]);
  keys.forEach((date) => {
    const a = remote.days[date] || { seconds: 0, words: 0, known: 0, unknown: 0, wordIds: [] };
    const b = local.days[date] || { seconds: 0, words: 0, known: 0, unknown: 0, wordIds: [] };
    days[date] = {
      seconds: Math.max(Number(a.seconds) || 0, Number(b.seconds) || 0),
      words: Math.max(Number(a.words) || 0, Number(b.words) || 0),
      known: Math.max(Number(a.known) || 0, Number(b.known) || 0),
      unknown: Math.max(Number(a.unknown) || 0, Number(b.unknown) || 0),
      wordIds: normalizeIdList([...(a.wordIds || []), ...(b.wordIds || [])])
    };
  });
  return sanitizeActivityPayload({ days });
}


function mergeUnitStats(remoteStats, localStats) {
  const remote = sanitizeUnitStatsPayload(remoteStats);
  const local = sanitizeUnitStatsPayload(localStats);
  const units = {};
  const keys = new Set([...Object.keys(remote.units), ...Object.keys(local.units)]);
  keys.forEach((unit) => {
    const a = remote.units[unit] || { completed: 0 };
    const b = local.units[unit] || { completed: 0 };
    const completed = Math.max(Number(a.completed) || 0, Number(b.completed) || 0);
    units[unit] = {
      completed,
      updatedAt: dateMs(a.updatedAt) >= dateMs(b.updatedAt) ? a.updatedAt : b.updatedAt
    };
  });
  return sanitizeUnitStatsPayload({ units });
}

/* ===== 31-wake-lock.js ===== */
"use strict";

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

/* ===== 99-bootstrap.js ===== */
"use strict";


function flushDirtyOnPageHide(reason) {
  try {
    if (typeof markPageHiddenDuringSync === "function") markPageHiddenDuringSync();
    var changed = typeof flushPendingStudyForBoundary === "function"
      ? flushPendingStudyForBoundary(reason || "pagehide_local_flush")
      : false;
    var syncState = ensureHashSyncState(state.syncHashState);
    if (changed || (syncState && syncState.localDirty)) {
      state.pendingActiveStudyUpload = true;
      try { writeLocalSnapshot(reason || "pagehide_local_flush"); } catch (_) {}
      try { writeDailyBackup(reason || "pagehide_local_flush"); } catch (_) {}
      appendAuditEvent({
        type: "sync:pagehide_local_saved",
        message: "session=" + TAB_ID + " reason=" + String(reason || "") + " dirty_preserved=true"
      });
      updateSyncIndicator();
    }
  } catch (error) {
    state.pendingActiveStudyUpload = true;
    appendAuditEvent({
      type: "sync:pagehide_local_save_failed",
      message: "session=" + TAB_ID + " reason=" + String(reason || "") + " error=" + String(error && error.message || error || "")
    });
  }
}

function flushPendingDirtyAfterVisible(reason) {
  try {
    if (typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary(reason || "visibility_resume");
    var syncState = ensureHashSyncState(state.syncHashState);
    var shouldFlush = Boolean(
      (syncState && syncState.localDirty) ||
      state.pendingActiveStudyUpload ||
      (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())
    );
    if (shouldFlush) {
      state.pendingActiveStudyUpload = false;
      scheduleSyncSoon(reason || "visibility_resume", 1500);
      appendAuditEvent({ type: "sync:visibility_resume_scheduled", message: "session=" + TAB_ID + " dirty=true" });
      return;
    }
    if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck(reason || "visibility_resume");
  } catch (error) {
    appendAuditEvent({
      type: "sync:visibility_resume_failed",
      message: "session=" + TAB_ID + " error=" + String(error && error.message || error || "")
    });
  }
}

function init() {
  appendAuditEvent({ type: "app:startup", message: APP_VERSION + "/" + APP_BUILD_ID });
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  if (typeof restoreProgressPending === "function") restoreProgressPending();
  if (typeof restoreActivityDraftPending === "function") restoreActivityDraftPending();
  persistSyncMeta();
  persistHashSyncState();
  migrateHashSyncStateIfNeeded();
  // pendingOps 已冻结。一次性截断超量旧数据。
  try {
    var opsStore = loadPendingOpsStore();
    if (opsStore.ops && opsStore.ops.length > 200) {
      savePendingOpsStore({ ops: opsStore.ops.slice(-200) });
    }
  } catch (_) {}
  // 启动时检查 localRecoveryRequired 是否可以解除
  try {
    var syncState = ensureHashSyncState(state.syncHashState);
    if (syncState.localRecoveryRequired) {
      var currentPayload = normalizeSyncPayload(collectSyncPayload());
      if (validateSyncPayload(currentPayload) && hasBusinessData(currentPayload)) {
        // 用户可能已通过 rescue 或其他方式手动恢复了数据
        state.syncHashState.localRecoveryRequired = false;
        state.syncHashState.localDirty = true;
        state.syncHashState.baseRemoteHash = "";
        state.syncHashState.dirtySince = beijingISOString();
        state.syncHashState.lastSyncStatus = "dirty";
        state.syncHashState.lastSyncError = "";
        persistHashSyncState();
        appendAuditEvent({ type: "recovery:cleared", message: "启动时检测到本地业务数据已恢复，解除保护状态" });
      }
    }
  } catch (_) {}
  normalizeSettings();
  registerServiceWorker();
  startVersionChecks();
  startSyncHeartbeat();
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") {
      pausePlaybackForBackground();
      flushDirtyOnPageHide("visibility_hidden_local_flush");
      return;
    }
    checkServerVersion({ force: false });
    flushPendingDirtyAfterVisible("visibility_resume");
  });
  window.addEventListener("pagehide", function() {
    if (typeof markPageHiddenDuringSync === "function") markPageHiddenDuringSync();
    appendAuditEvent({ type: "app:background" });
    pausePlaybackForBackground();
    flushDirtyOnPageHide("pagehide_local_flush");
  });
  window.addEventListener("online", function() {
    appendAuditEvent({ type: "network:online", message: "session=" + TAB_ID });
    scheduleSyncSoon("network_online", 1500);
  });
  window.addEventListener("blur", pausePlaybackForBackground);
  window.addEventListener("resize", fitActiveWord);
  preloadSpeechVoices();
  if (isAuthenticated()) {
    Promise.resolve(enterStudyOnLaunch({ reason: "init" }))
      .then(function() { return initializeSync({ reason: "init" }); })
      .catch(function(error) {
        appendAuditEvent({ type: "sync:init_after_launch_failed", message: String(error && error.message || error || "") });
      });
  } else {
    renderAuth();
  }
  window.__SHUA_APP_READY__ = true;
  appendAuditEvent({ type: "app:ready", message: APP_VERSION + "/" + APP_BUILD_ID });
}


init();
