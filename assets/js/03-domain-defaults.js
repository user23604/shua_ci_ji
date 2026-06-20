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
const SYNC_SCHEMA_VERSION = 2;
const BUSINESS_HASH_SCHEMA_VERSION = 3;


const SYNC_STATUS_LABELS = {
  unconfigured: "云同步未配置",
  invalid_config: "配置错误",
  local_only: "本地保存",
  dirty: "待上传",
  study_queued: "本地已保存",
  syncing: "同步中…",
  cloud_loaded: "已从云端更新",
  cloud_saved: "云端已保存",
  cloud_ok: "已同步",
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
  study_queued: "#0f766e",
  syncing: "#2563eb",
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


