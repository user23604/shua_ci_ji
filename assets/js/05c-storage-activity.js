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
