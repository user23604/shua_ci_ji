"use strict";

function writeLocalSnapshot(reason) {
  reason = reason || "change";
  var sourcePayload = normalizeSyncPayload(collectSyncPayload());
  var payload = localSafetyBackupPayload(sourcePayload);
  safeLocalStorageSet(LOCAL_SNAPSHOT_KEY, JSON.stringify({
    reason: reason,
    savedAt: beijingISOString(),
    pendingOpsCount: getPendingOps().length,
    payload: payload
  }), { priority: "snapshot", allowAggressiveBackupEviction: false, silentFailure: true });
}


function writeDailyBackup(reason) {
  reason = reason || "change";
  var date = localDateKey();
  var sourcePayload = normalizeSyncPayload(collectSyncPayload());
  var payload = localSafetyBackupPayload(sourcePayload);
  var key = DAILY_BACKUP_PREFIX + date;
  var newHash = businessPayloadHash(normalizeSyncPayload(payload));
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
    }), { priority: "daily_backup", allowAggressiveBackupEviction: false, silentFailure: true });
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
    saveJson(SYNC_AUDIT_KEY, { events: events }, { allowAggressiveBackupEviction: false, silentFailure: true });
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
    saveJson(SYNC_AUDIT_KEY, { events: trimAuditEvents(events, AUDIT_EVENT_LIMIT) }, { allowAggressiveBackupEviction: false, silentFailure: true });
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
