"use strict";

// ── P5 markStates LWW merge ───────────────────────────────────────────

function mergeMarkStatesLww(remoteStates, localStates) {
  var remote = sanitizeMarkStatesPayload(remoteStates);
  var local = sanitizeMarkStatesPayload(localStates);
  var result = {};
  var ids = new Set([...Object.keys(remote), ...Object.keys(local)]);
  ids.forEach(function(id) {
    var r = remote[id];
    var l = local[id];
    if (r && !l) { result[id] = r; return; }
    if (!r && l) { result[id] = l; return; }
    result[id] = compareMarkState(l, r) >= 0 ? l : r;
  });
  return sanitizeMarkStatesPayload(result);
}


function safeMergePayloads(remotePayload, localPayload) {
  const remote = normalizeSyncPayload(cloneJson(remotePayload));
  const local = normalizeSyncPayload(cloneJson(localPayload));
  const merged = normalizeSyncPayload(remote);
  merged.settings = normalizeSettingsPayload(local.settings);
  merged.activeBookId = local.activeBookId || remote.activeBookId;
  BOOKS.forEach((book) => {
    merged.progress[book.id] = chooseFurtherProgress(remote.progress[book.id], local.progress[book.id]);
    merged.unknownProgress[book.id] = mergeUnknownProgress(book, remote.unknownProgress[book.id], local.unknownProgress[book.id]);
    merged.markStates[book.id] = mergeMarkStatesLww(remote.markStates[book.id], local.markStates[book.id]);
    merged.marks[book.id] = deriveMarksFromMarkStates(merged.markStates[book.id]);
    merged.activity[book.id] = mergeActivity(remote.activity[book.id], local.activity[book.id]);
    merged.unitStats[book.id] = mergeUnitStats(remote.unitStats[book.id], local.unitStats[book.id]);
  });
  merged.updatedAt = beijingISOString();
  return normalizeSyncPayload(merged);
}


function chooseFurtherProgress(remoteProgress, localProgress) {
  const remote = sanitizeProgressPayload(remoteProgress);
  const local = sanitizeProgressPayload(localProgress);
  if (progressDepth(local) >= progressDepth(remote)) return local;
  return remote;
}


function mergeUnknownProgress(book, remoteProgress, localProgress) {
  const remote = normalizeUnknownProgressPayload(book, remoteProgress);
  const local = normalizeUnknownProgressPayload(book, localProgress);
  const units = {};
  Array.from({ length: book.totalUnits }, (_, index) => index + 1).forEach((unit) => {
    const key = String(unit);
    units[key] = chooseFurtherProgress(remote.units[key], local.units[key]);
  });
  return {
    book: chooseFurtherProgress(remote.book, local.book),
    units
  };
}


function mergeMarksLocalPriority(remoteMarks, localMarks) {
  const remote = sanitizeMarksPayload(remoteMarks);
  const local = sanitizeMarksPayload(localMarks);
  const ids = new Set([...remote.known, ...remote.unknown, ...local.known, ...local.unknown]);
  const known = [];
  const unknown = [];
  ids.forEach((id) => {
    if (local.known.includes(id)) known.push(id);
    else if (local.unknown.includes(id)) unknown.push(id);
    else if (remote.known.includes(id)) known.push(id);
    else if (remote.unknown.includes(id)) unknown.push(id);
  });
  return sanitizeMarksPayload({ known, unknown });
}


function mergeActivity(remoteActivity, localActivity) {
  // Activity is currently stored as daily counters without eventId/sessionId.
  // For same-day conflicts we take max values to avoid double-counting duplicated sync data.
  // A future event log can sum by eventId after dedupe.
  const remote = sanitizeActivityPayload(remoteActivity);
  const local = sanitizeActivityPayload(localActivity);
  const days = {};
  const keys = new Set([...Object.keys(remote.days), ...Object.keys(local.days)]);
  keys.forEach((date) => {
    const a = remote.days[date] || { seconds: 0, words: 0, known: 0, unknown: 0, wordIds: [] };
    const b = local.days[date] || { seconds: 0, words: 0, known: 0, unknown: 0, wordIds: [] };
    days[date] = {
      seconds: Math.max(Number(a.seconds) || 0, Number(b.seconds) || 0),
      words: Math.max(Number(a.words) || 0, Number(b.words) || 0),
      known: Math.max(Number(a.known) || 0, Number(b.known) || 0),
      unknown: Math.max(Number(a.unknown) || 0, Number(b.unknown) || 0),
      wordIds: normalizeIdList([...(a.wordIds || []), ...(b.wordIds || [])])
    };
  });
  return sanitizeActivityPayload({ days });
}


function mergeUnitStats(remoteStats, localStats) {
  const remote = sanitizeUnitStatsPayload(remoteStats);
  const local = sanitizeUnitStatsPayload(localStats);
  const units = {};
  const keys = new Set([...Object.keys(remote.units), ...Object.keys(local.units)]);
  keys.forEach((unit) => {
    const a = remote.units[unit] || { completed: 0 };
    const b = local.units[unit] || { completed: 0 };
    const completed = Math.max(Number(a.completed) || 0, Number(b.completed) || 0);
    units[unit] = {
      completed,
      updatedAt: dateMs(a.updatedAt) >= dateMs(b.updatedAt) ? a.updatedAt : b.updatedAt
    };
  });
  return sanitizeUnitStatsPayload({ units });
}

