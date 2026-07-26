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
