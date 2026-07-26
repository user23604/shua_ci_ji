"use strict";

function cloneJsonFallback(fallback) {
  if (Array.isArray(fallback)) return fallback.slice();
  if (isPlainObject(fallback)) return { ...fallback };
  return fallback;
}

const CORRUPT_STORAGE_PREFIX = "vocab_machine_corrupt_storage:";

function isAuthoritativeBusinessStorageKey(key) {
  key = String(key || "");
  return key === PROGRESS_CURSOR_KEY ||
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

function storageReadIssueSignature(issue) {
  return String(issue && issue.key || "") + "|" + String(issue && issue.raw || "").slice(0, 256) + "|" + String(issue && issue.kind || "");
}

function queueStorageReadIssue(key, raw, error, kind) {
  if (!isAuthoritativeBusinessStorageKey(key)) return;
  var issues = Array.isArray(globalThis.__SHUA_STORAGE_READ_ISSUES__) ? globalThis.__SHUA_STORAGE_READ_ISSUES__ : [];
  var issue = {
    key: String(key || ""),
    raw: String(raw == null ? "" : raw),
    kind: String(kind || "parse_error"),
    message: String(error && error.message || error || kind || "读取失败"),
    at: new Date().toISOString()
  };
  var signature = storageReadIssueSignature(issue);
  if (!issues.some(function(item) { return storageReadIssueSignature(item) === signature; })) issues.push(issue);
  globalThis.__SHUA_STORAGE_READ_ISSUES__ = issues.slice(-20);
  if (globalThis.__SHUA_APP_READY__ === true && typeof processPendingStorageReadIssues === "function") {
    setTimeout(function() { processPendingStorageReadIssues({ source: "runtime" }); }, 0);
  }
}

function quarantineStorageReadIssue(issue) {
  if (!issue || !issue.key) return false;
  var safeKey = encodeURIComponent(String(issue.key)).replace(/%/g, "_").slice(0, 180);
  var quarantineKey = CORRUPT_STORAGE_PREFIX + safeKey;
  return safeLocalStorageSet(quarantineKey, JSON.stringify({
    originalKey: issue.key,
    raw: issue.raw,
    kind: issue.kind,
    message: issue.message,
    capturedAt: issue.at || new Date().toISOString()
  }), { priority: "recovery" });
}

function scanAuthoritativeStorageForCorruption() {
  try {
    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      if (!isAuthoritativeBusinessStorageKey(key)) continue;
      var raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        var parsed = JSON.parse(raw);
        if (!isPlainObject(parsed)) queueStorageReadIssue(key, raw, new Error("JSON 根结构不是对象"), "invalid_shape");
      } catch (error) {
        queueStorageReadIssue(key, raw, error, "parse_error");
      }
    }
  } catch (_) {}
}

function processPendingStorageReadIssues(options = {}) {
  scanAuthoritativeStorageForCorruption();
  var issues = Array.isArray(globalThis.__SHUA_STORAGE_READ_ISSUES__) ? globalThis.__SHUA_STORAGE_READ_ISSUES__.slice() : [];
  if (!issues.length) return { status: "none", issues: [] };
  globalThis.__SHUA_STORAGE_READ_ISSUES__ = [];
  issues.forEach(function(issue) { try { quarantineStorageReadIssue(issue); } catch (_) {} });
  var keys = Array.from(new Set(issues.map(function(issue) { return issue.key; }))).join(", ");
  var reason = "检测到本地关键学习数据损坏或格式异常，已停止自动同步，避免把空数据或混合数据上传云端。请先导出排查包并使用 rescue.html 恢复。涉及键：" + keys;
  if (typeof setLocalRecoveryRequired === "function") {
    setLocalRecoveryRequired(reason, [], {
      source: "storage_corruption",
      checkpointHash: "",
      errorKind: "local_storage_corrupt",
      stage: "local_storage_read",
      technical: issues.map(function(issue) { return issue.key + ": " + issue.message; }).join(" | ")
    });
  }
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "storage:authoritative_read_failed", message: "source=" + String(options.source || "unknown") + " keys=" + keys });
  }
  return { status: "recovery_required", issues: issues };
}

function loadJson(key, fallback) {
  var raw = null;
  try {
    raw = localStorage.getItem(key);
    if (!raw) return cloneJsonFallback(fallback);
    const parsed = JSON.parse(raw);
    if (isPlainObject(fallback)) {
      if (!isPlainObject(parsed)) {
        queueStorageReadIssue(key, raw, new Error("JSON 根结构不是对象"), "invalid_shape");
        return { ...fallback };
      }
      return { ...fallback, ...parsed };
    }
    if (Array.isArray(fallback)) {
      if (!Array.isArray(parsed)) {
        queueStorageReadIssue(key, raw, new Error("JSON 根结构不是数组"), "invalid_shape");
        return fallback.slice();
      }
      return parsed;
    }
    return parsed === undefined ? fallback : parsed;
  } catch (error) {
    queueStorageReadIssue(key, raw, error, "parse_error");
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
