"use strict";

const APP_VERSION = "2026-09-03-gist-read-after-write-v3";
const APP_BUILD_ID = "2026-09-03-gist-read-after-write-v3";


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
const ROUND_STATE_KEY = "vocab_machine_round_state_v1";
const ROUND_ARCHIVES_KEY = "vocab_machine_round_archives_v1";

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

