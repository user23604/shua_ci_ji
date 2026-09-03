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
  while (Date.now() - startedAt < (maxMs || 2000)) {
    var blocked = Boolean(state.isSyncing || hasForeignSyncLock());
    if (!blocked) return true;
    if (!warned) {
      warned = true;
      appendAuditEvent({ type: "study:start_wait_sync", message: "isSyncing=" + String(Boolean(state.isSyncing)) + " foreignLock=" + String(hasForeignSyncLock()) });
      setSetupStatus("正在完成云端快速检查；网络较慢时将直接使用本地数据开始。");
    }
    await startStudyDelay(250);
  }
  appendAuditEvent({ type: "study:start_wait_sync_timeout", message: "isSyncing=" + String(Boolean(state.isSyncing)) + " foreignLock=" + String(hasForeignSyncLock()) });
  return false;
}


async function startStudy() {
  if (state.studyStartPending) return;
  state.studyStartPending = true;
  updateStudyStartButton();
  clearTimers();
  unlockSpeech();
  setSetupStatus("正在加载词库...");
  try {
    await waitForStartupSyncBeforeStudy(2000);
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
    state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
    state.setupStatus = "";
    await requestWakeLock();
    if (typeof touchStudyActivity === "function") touchStudyActivity("start_study");
    renderFlashcard({ touchProgress: true, progressReason: "start_study" });
  } catch (error) {
    setSetupStatus(error.message || "词库加载失败", "error");
  } finally {
    state.studyStartPending = false;
    updateStudyStartButton();
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
    state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
    state.reviewMode = { mode: "activity-review", label: `${stats.label}复盘`, wordIds: stats.wordIds };
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


// 刷词页内快速切换 Unit：不回设置页，原地重建会话（与 startStudy 相同的会话字段）。
// 仅普通 Unit 模式可用（复盘/重难点会话没有 Unit 语义，由调用方隐藏入口）。
async function switchUnitFromFlash(unit) {
  if (state.view !== "flash" || state.reviewMode) return false;
  const book = currentBook();
  const targetUnit = Number(unit);
  const previousUnit = Number(state.settings.unit);
  if (!Number.isFinite(targetUnit) || targetUnit < 1 || targetUnit > book.totalUnits || targetUnit === previousUnit) return false;
  if (state.unitSwitchPending) return false;
  state.unitSwitchPending = true;
  try {
    commitCurrentCardActivity();
    clearTimers();
    await ensureWords(book);
    const unitWords = buildStudyUnitWords(book.id, targetUnit);
    if (!unitWords.length) {
      // 目标 Unit 已全部斩完：不切换，留在当前 Unit，并给出一次性提示。
      state.unitSwitchNotice = `${unitDisplayLabel(book, targetUnit)} 没有未斩词条，仍停留在 ${unitDisplayLabel(book, previousUnit)}`;
      appendAuditEvent({ type: "study:unit_switch_blocked", message: "targetUnit=" + targetUnit + " remaining=0" });
      renderFlashcard({ progressReason: "unit_switch_blocked" });
      return false;
    }
    state.settings.unit = targetUnit;
    state.settings.unknownScope = "unit";
    persistSettings();
    state.unitSwitchNotice = "";
    state.roundReturn = null;
    state.playbackPaused = false;
    state.unitWords = unitWords;
    state.currentIndex = getStartIndex(book.id);
    state.groupStats = createGroupStats();
    state.undoWordId = null;
    state.navQueue = [];
    if (typeof resetCardTransitionState === "function") resetCardTransitionState();
    else state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
    touchStudyActivity("unit_switch");
    appendAuditEvent({ type: "study:unit_switched", message: "from=" + previousUnit + " to=" + targetUnit + " remaining=" + unitWords.length + " startIndex=" + state.currentIndex });
    renderFlashcard({ touchProgress: true, progressReason: "unit_switch" });
    return true;
  } finally {
    state.unitSwitchPending = false;
  }
}


