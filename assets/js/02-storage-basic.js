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
