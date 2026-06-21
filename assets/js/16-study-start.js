"use strict";


function startStudyDelay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}


function hasForeignSyncLock() {
  try {
    if (typeof readCrossTabSyncLock !== "function") return false;
    var lock = readCrossTabSyncLock();
    return Boolean(lock && lock.owner && lock.owner !== TAB_ID && Number(lock.expiresAt || 0) > Date.now());
  } catch (_) {
    return false;
  }
}


async function waitForStartupSyncBeforeStudy(maxMs) {
  var startedAt = Date.now();
  var warned = false;
  while (Date.now() - startedAt < (maxMs || 26000)) {
    var blocked = Boolean(state.isSyncing || hasForeignSyncLock());
    if (!blocked) return true;
    if (!warned) {
      warned = true;
      appendAuditEvent({ type: "study:start_wait_sync", message: "isSyncing=" + String(Boolean(state.isSyncing)) + " foreignLock=" + String(hasForeignSyncLock()) });
      setSetupStatus("正在完成云端检查，稍后自动开始刷词...");
    }
    await startStudyDelay(250);
  }
  appendAuditEvent({ type: "study:start_wait_sync_timeout", message: "isSyncing=" + String(Boolean(state.isSyncing)) + " foreignLock=" + String(hasForeignSyncLock()) });
  return false;
}


async function startStudy() {
  clearTimers();
  unlockSpeech();
  setSetupStatus("正在加载词库...");
  try {
    await waitForStartupSyncBeforeStudy(26000);
    const book = currentBook();
    state.roundReturn = null;
    state.playbackPaused = false;
    state.words = await ensureWords(book);
    const unknownMode = state.settings.queueMode === "unknown";
    const scope = currentUnknownScope();
    state.reviewMode = unknownMode
      ? { mode: "unknown-archive", label: unknownScopeLabel(book, scope), scope }
      : null;
    state.unitWords = unknownMode
      ? buildUnknownStudyWords(book.id, scope)
      : buildStudyUnitWords(book.id, state.settings.unit);
    if (!state.unitWords.length) {
      throw new Error(unknownMode
        ? `${unknownScopeLabel(book, scope)} 暂无重难点词条`
        : `${unitDisplayLabel(book, state.settings.unit)} 没有未斩词条`);
    }
    state.currentIndex = unknownMode
      ? getStartIndexFromProgress(loadUnknownProgressForResume(book.id, scope))
      : getStartIndex(book.id);
    state.groupStats = createGroupStats();
    state.undoWordId = null;
    state.navQueue = [];
    if (typeof resetCardTransitionState === "function") resetCardTransitionState();
    else state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.playbackPaused = false;
    state.setupStatus = "";
    await requestWakeLock();
    if (typeof touchStudyActivity === "function") touchStudyActivity("start_study");
    renderFlashcard({ touchProgress: true, progressReason: "start_study" });
  } catch (error) {
    setSetupStatus(error.message || "词库加载失败", "error");
  }
}


async function startReview(mode) {
  clearTimers();
  unlockSpeech();
  try {
    const book = currentBook();
    const stats = collectActivityStats(mode);
    if (!stats.wordIds.length) {
      state.setupStatus = { message: `${stats.label}还没有可复盘的单词。`, type: "error" };
      renderSetup();
      return;
    }
    const idSet = new Set(stats.wordIds);
    state.words = await ensureWords(book);
    state.unitWords = state.words.filter((word) => idSet.has(word.id));
    state.currentIndex = 0;
    state.groupStats = createGroupStats();
    state.undoWordId = null;
    state.navQueue = [];
    if (typeof resetCardTransitionState === "function") resetCardTransitionState();
    else state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.reviewMode = { mode, label: `${stats.label}复盘`, wordIds: stats.wordIds };
    state.roundReturn = null;
    state.playbackPaused = false;
    state.statsOpen = false;
    state.archiveOpen = false;
    await requestWakeLock();
    if (typeof touchStudyActivity === "function") touchStudyActivity("start_review");
    renderFlashcard({ touchProgress: true, progressReason: "start_review" });
  } catch (error) {
    state.setupStatus = { message: error.message || "复盘启动失败", type: "error" };
    renderSetup();
  }
}


function getStartIndex(bookId) {
  if (state.settings.mode !== "resume") return 0;
  return getStartIndexFromProgress(loadProgressForResume(bookId));
}


function getStartIndexFromProgress(progress) {
  if (state.settings.mode !== "resume") return 0;
  const lastWordId = Number(progress.lastWordId);
  if (!Number.isFinite(lastWordId)) return 0;
  if (!state.unitWords.length) return 0;
  const index = state.unitWords.findIndex((word) => word.id === lastWordId);
  if (index >= 0) return index;
  const nextIndex = state.unitWords.findIndex((word) => Number(word.id) > lastWordId);
  if (nextIndex >= 0) return nextIndex;
  appendAuditEvent({ type: "study:resume_progress_out_of_range", message: "lastWordId=" + String(lastWordId || "") + " unitWords=" + String(state.unitWords.length || 0) + " fallback=0" });
  return 0;
}


