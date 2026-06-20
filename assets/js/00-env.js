"use strict";

const APP_VERSION = "2026-06-20-p4-modular6";
const APP_BUILD_ID = "2026-06-20-p4-modular6";


const ACCESS_KEY = "ky2027";
const AUTH_KEY = "is_authenticated";

const SETTINGS_KEY = "vocab_machine_settings_v1";
const CLOUD_KEY = "vocab_machine_cloud_v1";

const SYNC_META_KEY = "vocab_machine_sync_meta_v1";
const HASH_SYNC_STATE_KEY = "vocab_machine_hash_sync_state_v1";

const PENDING_OPS_KEY = "vocab_machine_pending_ops_v1";
const LOCAL_SNAPSHOT_KEY = "vocab_machine_local_snapshot_latest_v1";

const DAILY_BACKUP_PREFIX = "vocab_machine_daily_backup_";
const HASH_BACKUP_PREFIX = "vocab_machine_backup:";

const HASH_BACKUP_INDEX_KEY = "vocab_machine_backup_index_v1";
const SYNC_AUDIT_KEY = "vocab_machine_sync_audit_v1";

const SYNC_FILE_NAME = "sync.json";
const SYNC_BACKUP_FILE_NAME = "sync.prev.json";

const SYNC_HEALTHCHECK_FILE_NAME = "_sync_probe.txt";
const SYNC_CLOUD_BACKUP_PREFIX = "sync.backup.";

const AUTO_PUSH_DEBOUNCE_MS = 3000;
const AUTO_SYNC_DEBOUNCE_MS = 700;

const AUTO_PUSH_BASE_INTERVAL_MS = 15000;
const AUTO_PUSH_MAX_INTERVAL_MS = 300000;

const SYNC_HEARTBEAT_MS = 5000;
const SYNC_BACKOFF_STEPS_MS = [5000, 15000, 30000, 60000, 120000, 300000];

const VERSION_CHECK_INTERVAL_MS = 60000;
const GITHUB_GET_TIMEOUT_MS = 12000;

const GITHUB_PATCH_TIMEOUT_MS = 20000;
const VERSION_CHECK_TIMEOUT_MS = 8000;

const SYNC_NO_PROGRESS_TIMEOUT_MS = 45000;
const CROSS_TAB_LOCK_LEASE_MS = 90000;

const MAX_PREFLIGHT_REBASE = 2;
const MAX_PATCH_409_RETRIES = 2;
const SYNC_MIN_INTERVAL_MS = 2000;
const SYNC_LOCK_KEY = "shua_ci_ji_sync_lock";

const TAB_ID = (globalThis.crypto && globalThis.crypto.randomUUID)
  ? globalThis.crypto.randomUUID()
  : String(Date.now()) + "-" + Math.random().toString(36).slice(2);

// ── P0.6: 统一 fetch 超时 ────────────────────────────────────────────────

