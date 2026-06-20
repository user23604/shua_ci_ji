"use strict";

function scheduleActivityDirty(reason = "activity") {
  if (state.view === "flash") {
    state.activityDirtyPending = true;
    state.activityDraftPending = true;
    if (typeof updateSyncIndicator === "function") updateSyncIndicator();
    return;
  }
  onLocalDataChanged(reason || "activity");
}


function recordStudyActivity({ seconds = 0, wordId = null, counted = false, result = "" } = {}) {
  const book = currentBook();
  const activity = state.view === "flash" && typeof loadActivityDraft === "function" ? loadActivityDraft(book.id) : loadActivity(book.id);
  const day = getActivityDay(activity, localDateKey());
  day.seconds += Math.max(0, seconds);
  if (counted) day.words += 1;
  if (result === "known") day.known += 1;
  if (result === "unknown") day.unknown += 1;
  if (wordId) day.wordIds = Array.from(new Set([...day.wordIds, Number(wordId)])).sort((a, b) => a - b);
  if (state.view === "flash" && typeof saveActivityDraft === "function") {
    saveActivityDraft(book.id, activity, "activity");
    return;
  }
  saveActivity(book.id, activity, { touch: false });
  appendPendingOp({ type: "activity.day.set", bookId: book.id, date: localDateKey(), day: { ...day, wordIds: [...day.wordIds] } });
  scheduleActivityDirty("activity");
}