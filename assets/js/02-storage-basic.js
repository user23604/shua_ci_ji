"use strict";

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


function saveJson(key, value, options = {}) {
  return safeLocalStorageSet(key, JSON.stringify(value), options);
}


function safeLocalStorageSet(key, value, options = {}) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      return handleStorageQuotaExceeded(key, value, options);
    }
    throw err;
  }
}


function isQuotaExceededError(err) {
  return Boolean(err) && (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota/i.test(String(err && (err.message || err)))
  );
}


function handleStorageQuotaExceeded(key, value, options = {}) {
  pruneStorageForQuota(options);
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    state.syncHashState = ensureHashSyncState(state.syncHashState);
    state.syncHashState.lastBackupError = "本地浏览器存储空间不足，无法写入 " + key;
    try { persistHashSyncState(); } catch (_) {}
    showSyncProblemDialog({
      severity: "error",
      code: "LOCAL_STORAGE_QUOTA",
      title: "本地浏览器存储空间不足",
      message: "本地数据或备份写入失败。请先导出 rescue 备份，再清理浏览器存储空间。",
      technical: err && (err.message || String(err)),
      dialogKeySuffix: key
    });
    return false;
  }
}


function pruneStorageForQuota(options = {}) {
  try {
    localStorage.removeItem(SYNC_AUDIT_KEY);
  } catch (_) {}
  pruneBackupsForQuota();
}


function pruneBackupsForQuota() {
  var items = loadHashBackupIndex().slice();
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
  if (removed) {
    var remainingKeys = new Set();
    for (var i = 0; i < localStorage.length; i += 1) remainingKeys.add(localStorage.key(i));
    saveHashBackupIndex(items.filter(function(item) { return item && item.key && remainingKeys.has(item.key); }));
  }
}


function safeSetLocalStorage(key, value, options = {}) {
  try {
    return safeLocalStorageSet(key, value, options);
  } catch (error) {
    state.syncHashState = ensureHashSyncState(state.syncHashState);
    state.syncHashState.lastBackupError = error?.message || "本地备份写入失败";
    persistHashSyncState();
    return false;
  }
}


