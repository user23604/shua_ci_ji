"use strict";

function collectSyncPayload() {
  const progress = {};
  const unknownProgress = {};
  const marks = {};
  const markStates = {};
  const activity = {};
  const unitStats = {};
  BOOKS.forEach((book) => {
    progress[book.id] = loadProgress(book.id);
    unknownProgress[book.id] = collectUnknownProgressForBook(book);
    markStates[book.id] = loadMarkStates(book.id);
    marks[book.id] = deriveMarksFromMarkStates(markStates[book.id]);
    activity[book.id] = loadActivity(book.id);
    unitStats[book.id] = loadUnitStats(book.id);
  });
  return {
    version: 1,
    updatedAt: beijingISOString(),
    activeBookId: state.settings.bookId,
    settings: { ...state.settings },
    progress,
    unknownProgress,
    marks,
    markStates,
    activity,
    unitStats
  };
}


function collectUnknownProgressForBook(book) {
  const units = {};
  Array.from({ length: book.totalUnits }, (_, index) => index + 1).forEach((unit) => {
    units[String(unit)] = loadUnknownProgress(book.id, { scope: "unit", unit });
  });
  return {
    book: loadUnknownProgress(book.id, { scope: "book" }),
    units
  };
}


function normalizeSettingsPayload(settings) {
  const source = isPlainObject(settings) ? settings : {};
  const book = BOOKS.find((item) => item.id === source.bookId) || BOOKS[0];
  const bookValues = normalizeBookSettingValues(book, source);
  return {
    ...DEFAULT_SETTINGS,
    ...source,
    ...bookValues,
    bookId: book.id,
    bookSettings: normalizeBookSettingsStore(source.bookSettings)
  };
}


function normalizeUnknownProgressPayload(book, progressMap) {
  const source = isPlainObject(progressMap) ? progressMap : {};
  const sourceUnits = isPlainObject(source.units) ? source.units : {};
  const units = {};
  Array.from({ length: book.totalUnits }, (_, index) => index + 1).forEach((unit) => {
    units[String(unit)] = sanitizeProgressPayload(sourceUnits[String(unit)] || { lastWordId: null });
  });
  return {
    book: sanitizeProgressPayload(source.book || { lastWordId: null }),
    units
  };
}


function normalizeSyncPayload(payload) {
  const source = isPlainObject(payload) ? payload : {};
  const progress = {};
  const unknownProgress = {};
  const marks = {};
  const markStates = {};
  const activity = {};
  const unitStats = {};
  BOOKS.forEach((book) => {
    progress[book.id] = sanitizeProgressPayload(source.progress?.[book.id] || { lastWordId: null });
    unknownProgress[book.id] = normalizeUnknownProgressPayload(book, source.unknownProgress?.[book.id]);

    var sourceMarkStates = sanitizeMarkStatesPayload(source.markStates?.[book.id]);
    if (Object.keys(sourceMarkStates).length) {
      markStates[book.id] = sourceMarkStates;
      marks[book.id] = deriveMarksFromMarkStates(sourceMarkStates);
    } else {
      marks[book.id] = sanitizeMarksPayload(source.marks?.[book.id]);
      var legacyUpdatedAt = source.updatedAt || source.lastSyncedLocalUpdatedAt || source.localUpdatedAt || "1970-01-01T00:00:00.000Z";
      markStates[book.id] = deriveMarkStatesFromMarks(book.id, marks[book.id], legacyUpdatedAt);
    }

    activity[book.id] = sanitizeActivityPayload(source.activity?.[book.id]);
    unitStats[book.id] = sanitizeUnitStatsPayload(source.unitStats?.[book.id]);
  });
  return {
    version: 1,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : beijingISOString(),
    activeBookId: BOOKS.some((book) => book.id === source.activeBookId) ? source.activeBookId : normalizeSettingsPayload(source.settings).bookId,
    settings: normalizeSettingsPayload(source.settings),
    progress,
    unknownProgress,
    marks,
    markStates,
    activity,
    unitStats
  };
}


function validateSyncPayload(payload) {
  if (!isPlainObject(payload) || payload.version !== 1) return false;
  if (!isPlainObject(payload.settings) || !isPlainObject(payload.progress)) return false;
  const knownBookIds = new Set(BOOKS.map((book) => book.id));
  if (payload.activeBookId && !knownBookIds.has(payload.activeBookId)) return false;
  return BOOKS.every((book) => (
    validateProgressPayload(payload.progress?.[book.id], book) &&
    validateUnknownProgressPayload(payload.unknownProgress?.[book.id], book) &&
    validateMarksForBook(payload.marks?.[book.id]) &&
    validateMarkStatesForBook(payload.markStates?.[book.id]) &&
    validateActivityForBook(payload.activity?.[book.id]) &&
    validateUnitStatsForBook(payload.unitStats?.[book.id], book)
  ));
}


function validateProgressPayload(progress, book) {
  if (!isPlainObject(progress)) return false;
  const lastWordId = progress.lastWordId;
  if (lastWordId !== null && (!Number.isFinite(Number(lastWordId)) || Number(lastWordId) <= 0)) return false;
  if (progress.unit !== undefined) {
    const unit = Number(progress.unit);
    if (!Number.isFinite(unit) || unit < 1 || unit > book.totalUnits) return false;
  }
  return true;
}


function validateUnknownProgressPayload(progressMap, book) {
  if (!isPlainObject(progressMap) || !isPlainObject(progressMap.units)) return false;
  if (!validateProgressPayload(progressMap.book, book)) return false;
  return Object.entries(progressMap.units).every(([unit, progress]) => {
    const unitNumber = Number(unit);
    return Number.isFinite(unitNumber) && unitNumber >= 1 && unitNumber <= book.totalUnits && validateProgressPayload(progress, book);
  });
}


function validateMarksForBook(marks) {
  if (!isPlainObject(marks)) return false;
  const known = normalizeIdList(marks.known);
  const unknown = normalizeIdList(marks.unknown);
  if (known.length !== (Array.isArray(marks.known) ? marks.known.length : 0)) return false;
  if (unknown.length !== (Array.isArray(marks.unknown) ? marks.unknown.length : 0)) return false;
  const unknownSet = new Set(unknown);
  return known.every((id) => !unknownSet.has(id));
}


function validateMarkStatesForBook(markStates) {
  if (markStates === undefined || markStates === null) return true;
  if (!isPlainObject(markStates)) return false;
  return Object.entries(markStates).every(function(entry) {
    var wordId = entry[0];
    var item = entry[1];
    var id = Number(wordId);
    if (!Number.isFinite(id) || id <= 0) return false;
    if (!isPlainObject(item)) return false;
    if (item.value !== "known" && item.value !== "unknown" && item.value !== null) return false;
    if (typeof item.updatedAt !== "string" || !item.updatedAt) return false;
    if (Number.isNaN(Date.parse(item.updatedAt))) return false;
    if (typeof item.clientId !== "string") return false;
    var seq = Number(item.seq);
    if (!Number.isFinite(seq) || seq < 0) return false;
    return true;
  });
}


function hasMarkStatesBusinessData(markStates) {
  if (!isPlainObject(markStates)) return false;
  return Object.keys(markStates).some(function(bookId) {
    var bookStates = markStates[bookId];
    return isPlainObject(bookStates) && Object.keys(bookStates).length > 0;
  });
}


function validateActivityForBook(activity) {
  if (!isPlainObject(activity) || !isPlainObject(activity.days)) return false;
  return Object.entries(activity.days).every(([date, day]) => (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    isPlainObject(day) &&
    Number(day.seconds) >= 0 &&
    Number(day.words) >= 0 &&
    Number(day.known) >= 0 &&
    Number(day.unknown) >= 0 &&
    Array.isArray(day.wordIds) &&
    normalizeIdList(day.wordIds).length === day.wordIds.length
  ));
}


function validateUnitStatsForBook(stats, book) {
  if (!isPlainObject(stats) || !isPlainObject(stats.units)) return false;
  return Object.entries(stats.units).every(([unit, item]) => {
    const unitNumber = Number(unit);
    return Number.isFinite(unitNumber) &&
      unitNumber >= 1 &&
      unitNumber <= book.totalUnits &&
      isPlainObject(item) &&
      Number(item.completed) >= 0;
  });
}


function isEffectivelyEmptyLocalPayload(payload) {
  const normalized = normalizeSyncPayload(payload);
  return noMarks(normalized) &&
    noProgress(normalized) &&
    noUnknownProgress(normalized) &&
    noActivity(normalized) &&
    noUnitStats(normalized);
}


function shouldRepairEmptyLocalFromRemote() {
  // P0: 已废弃。P0 用 isStrictlyEmptyLocalPayload + initializeP0Sync 替代。
  throw new Error("shouldRepairEmptyLocalFromRemote 已废弃");
}


function noMarks(payload) {
  return BOOKS.every((book) => {
    const marks = payload.marks?.[book.id] || {};
    return !normalizeIdList(marks.known).length && !normalizeIdList(marks.unknown).length;
  });
}


function noProgress(payload) {
  return BOOKS.every((book) => !Number(payload.progress?.[book.id]?.lastWordId));
}


function noUnknownProgress(payload) {
  return BOOKS.every((book) => {
    const item = payload.unknownProgress?.[book.id] || {};
    const units = isPlainObject(item.units) ? Object.values(item.units) : [];
    return !Number(item.book?.lastWordId) && units.every((progress) => !Number(progress?.lastWordId));
  });
}


function noActivity(payload) {
  return BOOKS.every((book) => {
    const days = payload.activity?.[book.id]?.days || {};
    return !Object.values(days).some((day) => (
      Number(day.seconds) > 0 ||
      Number(day.words) > 0 ||
      Number(day.known) > 0 ||
      Number(day.unknown) > 0 ||
      normalizeIdList(day.wordIds).length > 0
    ));
  });
}


function noUnitStats(payload) {
  return BOOKS.every((book) => {
    const units = payload.unitStats?.[book.id]?.units || {};
    return !Object.values(units).some((unit) => Number(unit.completed) > 0);
  });
}


function progressDepth(progress) {
  const sanitized = sanitizeProgressPayload(progress);
  const unit = Number(sanitized.unit) || 0;
  const lastWordId = Number(sanitized.lastWordId) || 0;
  return unit * 100000 + lastWordId;
}

// P0: syncContentScore 及其 5 个 helper 已删除。P0 不使用数据量评分做同步决策。


function normalizeIdList(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0)))
    .sort((a, b) => a - b);
}


function sanitizeProgressPayload(progress) {
  if (!isPlainObject(progress)) return { lastWordId: null };
  const lastWordId = Number(progress.lastWordId);
  const unit = Number(progress.unit);
  const sanitized = {
    ...progress,
    lastWordId: Number.isFinite(lastWordId) && lastWordId > 0 ? lastWordId : null
  };
  if (Number.isFinite(unit) && unit > 0) sanitized.unit = unit;
  else delete sanitized.unit;
  return sanitized;
}


function sanitizeMarksPayload(marks) {
  return {
    known: normalizeIdList(marks?.known),
    unknown: normalizeIdList(marks?.unknown)
  };
}


function sanitizeActivityPayload(activity) {
  const sourceDays = isPlainObject(activity?.days) ? activity.days : {};
  const days = {};
  Object.entries(sourceDays).forEach(([key, value]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !isPlainObject(value)) return;
    days[key] = {
      seconds: Math.max(0, Number(value.seconds) || 0),
      words: Math.max(0, Number(value.words) || 0),
      known: Math.max(0, Number(value.known) || 0),
      unknown: Math.max(0, Number(value.unknown) || 0),
      wordIds: normalizeIdList(value.wordIds)
    };
  });
  return {
    days
  };
}


function sanitizeUnitStatsPayload(stats) {
  const sourceUnits = isPlainObject(stats?.units) ? stats.units : {};
  const units = {};
  Object.entries(sourceUnits).forEach(([key, value]) => {
    const unit = Number(key);
    if (!Number.isFinite(unit) || unit <= 0) return;
    const source = isPlainObject(value) ? value : { completed: value };
    const completed = Math.max(0, Math.floor(Number(source.completed) || 0));
    const item = { completed };
    if (typeof source.updatedAt === "string" && source.updatedAt) item.updatedAt = source.updatedAt;
    units[String(Math.floor(unit))] = item;
  });
  return { units };
}


