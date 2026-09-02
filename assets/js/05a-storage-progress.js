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
