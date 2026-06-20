"use strict";

function getActivityDay(activity, key) {
  if (!activity.days[key]) {
    activity.days[key] = { seconds: 0, words: 0, known: 0, unknown: 0, wordIds: [] };
  }
  const day = activity.days[key];
  day.seconds = Number(day.seconds) || 0;
  day.words = Number(day.words) || 0;
  day.known = Number(day.known) || 0;
  day.unknown = Number(day.unknown) || 0;
  day.wordIds = Array.isArray(day.wordIds) ? day.wordIds.map(Number).filter(Boolean) : [];
  return day;
}


function scheduleActivityDirty(reason = "activity") {
  if (state.view === "flash") {
    state.activityDirtyPending = true;
    if (state.activityDirtyTimer) return;
    state.activityDirtyTimer = setTimeout(function() {
      state.activityDirtyTimer = null;
      state.lastActivityDirtyAt = Date.now();
      // P9: activity 高频字段不单独抢同步；只标轻量 dirty，等待 active study / pagehide / 离开 flash 批量上传。
      if (state.activityDirtyPending && typeof markLocalDirtyLight === "function") {
        markLocalDirtyLight(reason || "activity_batch");
      }
    }, 30000);
    return;
  }
  onLocalDataChanged(reason || "activity");
}


function recordStudyActivity({ seconds = 0, wordId = null, counted = false, result = "" } = {}) {
  const book = currentBook();
  const activity = loadActivity(book.id);
  const day = getActivityDay(activity, localDateKey());
  day.seconds += Math.max(0, seconds);
  if (counted) day.words += 1;
  if (result === "known") day.known += 1;
  if (result === "unknown") day.unknown += 1;
  if (wordId) day.wordIds = Array.from(new Set([...day.wordIds, Number(wordId)])).sort((a, b) => a - b);
  // P9: 本地统计即时保存，但 flash 场景不因 seconds 高频变化立即触发全量 hash / push。
  saveActivity(book.id, activity, { touch: false });
  appendPendingOp({ type: "activity.day.set", bookId: book.id, date: localDateKey(), day: { ...day, wordIds: [...day.wordIds] } });
  if (counted || result === "known" || result === "unknown") scheduleActivityDirty("activity");
}


function commitCurrentCardActivity({ counted = false, result = "" } = {}) {
  if (state.view !== "flash" || !state.cardStartedAt) return;
  const word = state.unitWords[state.currentIndex];
  if (!word) return;
  const elapsed = clamp((Date.now() - state.cardStartedAt) / 1000, 0, 600);
  if (elapsed < 0.5 && !counted) return;
  recordStudyActivity({
    seconds: elapsed,
    wordId: word.id,
    counted: counted && !state.currentWordRecorded,
    result: counted && !state.currentWordRecorded ? result : ""
  });
  if (counted) state.currentWordRecorded = true;
  state.cardStartedAt = Date.now();
}


function getPeriodRange(mode, baseDate = new Date()) {
  const today = startOfLocalDay(baseDate);
  if (mode === "week") {
    const day = today.getDay() || 7;
    const start = addDays(today, 1 - day);
    return { start, end: addDays(start, 6), label: "本周" };
  }
  if (mode === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start, end, label: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` };
  }
  return { start: today, end: today, label: "今天" };
}


function collectActivityStats(mode) {
  const activity = loadActivity(currentBook().id);
  const { start, end, label } = getPeriodRange(mode);
  const wordIds = new Set();
  const totals = { seconds: 0, words: 0, known: 0, unknown: 0 };
  for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
    const item = activity.days[localDateKey(day)];
    if (!item) continue;
    totals.seconds += Number(item.seconds) || 0;
    totals.words += Number(item.words) || 0;
    totals.known += Number(item.known) || 0;
    totals.unknown += Number(item.unknown) || 0;
    (item.wordIds || []).forEach((id) => wordIds.add(Number(id)));
  }
  return { label, totals, wordIds: Array.from(wordIds).sort((a, b) => a - b) };
}


