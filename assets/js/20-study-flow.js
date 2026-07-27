"use strict";

function markUnknownInPlace(card) {
  const book = currentBook();
  const word = state.unitWords[state.currentIndex];
  if (!word) return;
  const shouldRestartTimers = state.timers.length === 0 && !state.playbackPaused;
  const wasUnknown = loadMarks(book.id).unknown.includes(word.id);
  markCurrent("unknown");
  if (!wasUnknown) {
    state.groupStats.unknown += 1;
    state.groupStats.unknownIds = Array.from(new Set([...(state.groupStats.unknownIds || []), word.id]));
    recordStudyActivity({ wordId: word.id, seconds: 0, result: "unknown", counted: false });
    updateLiveUnknownCount();
  }
  state.undoWordId = word.id;
  showUnknownMarkFeedback(card, word.id);
  if (shouldRestartTimers) scheduleWordTimers();
}


function updateLiveUnknownCount() {
  const counters = document.querySelectorAll(".live-counter strong");
  if (counters[2]) counters[2].textContent = String(state.groupStats.unknown);
}


function showUnknownMarkFeedback(card, wordId) {
  if (!card) return;
  card.classList.add("is-animated", "is-swipe-down", "word-card--mark-feedback");
  card.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
  ensureUndoButton(card, wordId, undoLabelForMark("unknown"));
  const oldFeedback = card.querySelector(".mark-feedback");
  if (oldFeedback) oldFeedback.remove();
  const feedback = document.createElement("div");
  feedback.className = "mark-feedback";
  feedback.setAttribute("aria-live", "polite");
  feedback.textContent = "已标记重难点";
  card.appendChild(feedback);
  addTimer(() => {
    clearCardSwipeFeedback(card);
    card.classList.remove("is-animated", "word-card--mark-feedback");
    feedback.remove();
  }, 820);
}


function ensureUndoButton(card, wordId, label) {
  let actions = card.querySelector(".word-card__actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "word-card__actions";
    card.appendChild(actions);
  }
  let button = actions.querySelector("#undoMarkBtn");
  if (!button) {
    button = document.createElement("button");
    button.className = "undo-btn";
    button.id = "undoMarkBtn";
    button.type = "button";
    actions.appendChild(button);
  }
  button.textContent = label;
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    undoMark(wordId);
  };
}


function snapBack(card) {
  card.classList.add("is-animated");
  card.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
  addTimer(() => {
    clearCardSwipeFeedback(card);
    card.classList.remove("is-animated");
    scheduleWordTimers();
  }, 180);
}


function clearCardTransitionTimer() {
  if (state.cardTransitionTimer) {
    clearTimeout(state.cardTransitionTimer);
    state.cardTransitionTimer = null;
  }
}


function clearTransitionSafetyTimer() {
  if (state.transitionSafetyTimer) {
    clearTimeout(state.transitionSafetyTimer);
    state.transitionSafetyTimer = null;
  }
}


function startCardTransition() {
  state.transitioning = true;
  clearTransitionSafetyTimer();
  state.transitionSafetyTimer = window.setTimeout(function() {
    if (state.transitioning) {
      if (typeof resetCardTransitionState === "function") resetCardTransitionState();
      else state.transitioning = false;
      state.pointer = null;
      clearCardTransitionTimer();
      appendAuditEvent({ type: "flash:transition_safety_reset", message: "transitioning reset by safety timer" });
      if (typeof processNavigationQueueSoon === "function") processNavigationQueueSoon();
    }
    state.transitionSafetyTimer = null;
  }, 900);
}


function finishCardTransition() {
  state.transitioning = false;
  clearTransitionSafetyTimer();
}


function resetCardTransitionState() {
  state.transitioning = false;
  state.pointer = null;
  clearCardTransitionTimer();
  clearTransitionSafetyTimer();
}


function animateOut(card, x, y, done) {
  card.classList.add("is-animated");
  card.style.opacity = "0";
  card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${x / 34}deg)`;
  clearCardTransitionTimer();
  state.cardTransitionTimer = window.setTimeout(function() {
    state.cardTransitionTimer = null;
    done();
  }, 210);
}


function markCurrent(kind) {
  const book = currentBook();
  const word = state.unitWords[state.currentIndex];
  if (!word) return;
  if (state.view === "flash") {
    state.lastUserStudyActionAt = Date.now();
    if (typeof touchStudyActivity === "function") touchStudyActivity("mark");
  }
  setWordMarkState(book.id, word.id, kind, { touch: true });
  appendAuditEvent({ type: "user:mark", message: "wordId=" + word.id + " kind=" + kind });
  updateSyncIndicator();
}


function undoMark(wordId) {
  const book = currentBook();
  if (state.view === "flash") {
    state.lastUserStudyActionAt = Date.now();
    if (typeof touchStudyActivity === "function") touchStudyActivity("undo");
  }
  setWordMarkState(book.id, wordId, null, { touch: true });
  appendAuditEvent({ type: "user:undo", message: "wordId=" + wordId });
  updateSyncIndicator();
  state.undoWordId = null;
  renderFlashcard();
}


function advanceWord(reason) {
  clearTimers();
  var progressReason = reason === "auto" ? "auto_advance" : reason === "manual" ? "manual_next" : reason ? "advance_" + String(reason) : "advance";
  if (typeof touchStudyActivity === "function") touchStudyActivity(progressReason);
  const wasRecorded = state.currentWordRecorded;
  const result = reason === "known" || reason === "unknown" ? reason : "";
  commitCurrentCardActivity({ counted: true, result });
  if (!wasRecorded) {
    state.groupStats.seen += 1;
    if (reason === "known") state.groupStats.known += 1;
    if (reason === "unknown") {
      state.groupStats.unknown += 1;
      const currentWord = state.unitWords[state.currentIndex];
      if (currentWord) {
        state.groupStats.unknownIds = Array.from(new Set([...(state.groupStats.unknownIds || []), currentWord.id]));
      }
    }
  }
  state.undoWordId = null;
  state.currentIndex += 1;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  // 这里是“新卡片入场方向”：手动下一个从右侧轻进入，和旧卡飞出方向不是同一个概念。
  if (reason === "manual") state.cardEnterDirection = "from-right";

  if (state.currentIndex >= state.unitWords.length) {
    state.cardEnterDirection = "";
    renderBreak({ unitEnd: true, reviewEnd: Boolean(state.reviewMode) });
    return;
  }

  if (state.settings.summaryMode === "count" && state.groupStats.seen >= state.settings.summaryCount) {
    state.cardEnterDirection = "";
    renderBreak({ unitEnd: false });
    return;
  }

  renderFlashcard({ touchProgress: true, progressReason: progressReason });
}


function finishCurrentGroup() {
  clearTimers();
  if (typeof touchStudyActivity === "function") touchStudyActivity("finish_group");
  const wasRecorded = state.currentWordRecorded;
  commitCurrentCardActivity({ counted: true });
  if (!wasRecorded) state.groupStats.seen += 1;
  if (state.currentIndex < state.unitWords.length) state.currentIndex += 1;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  renderBreak({
    manual: true,
    unitEnd: state.currentIndex >= state.unitWords.length,
    reviewEnd: Boolean(state.reviewMode)
  });
}


function goPrevious() {
  clearTimers();
  var progressReason = "manual_previous";
  if (typeof touchStudyActivity === "function") touchStudyActivity(progressReason);
  commitCurrentCardActivity();
  if (state.currentIndex <= 0) {
    renderFlashcard();
    return;
  }
  state.currentIndex -= 1;
  const word = state.unitWords[state.currentIndex];
  const marks = loadMarks(currentBook().id);
  state.undoWordId = marks.known.includes(word.id) || marks.unknown.includes(word.id) ? word.id : null;
  state.showZh = state.settings.manualZhReveal !== true;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  // 上一个词的新卡片从左侧轻进入；旧卡飞出方向在 triggerCardDirection() 中控制。
  state.cardEnterDirection = "from-left";
  renderFlashcard({ touchProgress: true, progressReason: progressReason });
}


function renderBreak(info) {
  if (typeof touchStudyActivity === "function") touchStudyActivity(info && info.unitEnd ? "break_unit_end" : "break");
  const enteringBreak = state.view !== "break";
  state.view = "break";
  state.breakInfo = info;
  clearTimers();
  releaseWakeLock();
  state.navQueue = [];
  if (typeof resetCardTransitionState === "function") resetCardTransitionState();
  else state.transitioning = false;
  state.currentWordId = null;
  const book = currentBook();
  if (enteringBreak && info.unitEnd && !info.reviewEnd && !info.manual && !state.reviewMode) {
    recordUnitCompletion(book.id, state.settings.unit);
  }
  const roundUnknownIds = getRoundUnknownIds();
  const title = info.reviewEnd
    ? `${state.reviewMode?.label || "复盘"}总结`
    : info.manual
      ? "手动完成总结"
      : info.unitEnd
        ? `${unitDisplayLabel(book, state.settings.unit)} 阶段总结`
        : "间歇总结";
  app.innerHTML = `
    <section class="view break-view">
      <div class="break-panel">
        <h1>${escapeHtml(title)}</h1>
        <div class="stats-grid">
          <div class="stat-box"><span>扫过</span><strong>${state.groupStats.seen}</strong></div>
          <div class="stat-box"><span>已斩</span><strong>${state.groupStats.known}</strong></div>
          <div class="stat-box"><span>重难点</span><strong>${state.groupStats.unknown}</strong></div>
        </div>
        <button class="btn btn--primary btn--wide" id="continueBtn" type="button">${info.unitEnd && !info.reviewEnd ? "下一单元" : "继续下一组"}</button>
        ${info.unitEnd && !info.reviewEnd && !state.reviewMode ? `<button class="btn btn--ghost btn--wide" id="replayUnitBtn" type="button">本单元从头再刷一遍</button>` : ""}
        ${roundUnknownIds.length && !info.reviewEnd ? `<button class="btn btn--ghost btn--wide" id="roundUnknownReviewBtn" type="button">仅复习本轮重难点 (${roundUnknownIds.length})</button>` : ""}
      </div>
    </section>
    ${renderSyncIndicator()}
  `;
  document.getElementById("continueBtn").addEventListener("click", continueAfterBreak);
  const replayUnitBtn = document.getElementById("replayUnitBtn");
  if (replayUnitBtn) replayUnitBtn.addEventListener("click", startCurrentUnitReplay);
  const roundReviewBtn = document.getElementById("roundUnknownReviewBtn");
  if (roundReviewBtn) roundReviewBtn.addEventListener("click", startRoundUnknownReview);
  if (enteringBreak && typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary("break");
  if (enteringBreak) autoPushToGist();
}


async function continueAfterBreak() {
  if (typeof touchStudyActivity === "function") touchStudyActivity("continue_after_break");
  const book = currentBook();
  if (state.breakInfo?.reviewEnd && ["round-unknown", "unit-replay"].includes(state.reviewMode?.mode) && state.roundReturn) {
    const ret = state.roundReturn;
    state.reviewMode = null;
    state.roundReturn = null;
    state.unitWords = ret.unitWords;
    state.currentIndex = ret.currentIndex;
    state.groupStats = createGroupStats();
    state.navQueue = [];
    if (typeof resetCardTransitionState === "function") resetCardTransitionState();
    else state.transitioning = false;
    state.markFeedback = "";
    state.currentWordId = null;
    state.currentWordRecorded = false;
    state.showZh = false;
    state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
    if (state.currentIndex >= state.unitWords.length) {
      state.groupStats = ret.groupStats || createGroupStats();
      renderBreak(ret.breakInfo || { unitEnd: true });
      return;
    }
    await requestWakeLock();
    renderFlashcard({ touchProgress: true, progressReason: "continue_after_break_return" });
    return;
  }
  if (state.breakInfo?.reviewEnd) {
    const label = state.reviewMode?.label || "复盘";
    state.reviewMode = null;
    state.groupStats = createGroupStats();
    setSetupStatus(`${label}已完成。`, "ok");
    renderSetup();
    return;
  }
  state.groupStats = createGroupStats();
  state.navQueue = [];
  if (typeof resetCardTransitionState === "function") resetCardTransitionState();
  else state.transitioning = false;
  state.markFeedback = "";
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  if (state.breakInfo?.unitEnd) {
    if (state.settings.unit < book.totalUnits) {
      state.settings.unit += 1;
      persistSettings();
      state.words = await ensureWords(book);
      state.unitWords = buildStudyUnitWords(book.id, state.settings.unit);
      state.currentIndex = 0;
      if (!state.unitWords.length) {
        setSetupStatus(`${unitDisplayLabel(book, state.settings.unit)} 的词条已全部已斩，请选择其他 Unit。`, "ok");
        renderSetup();
        return;
      }
    } else {
      setSetupStatus("全部 Unit 已完成。", "ok");
      renderSetup();
      return;
    }
  }
  await requestWakeLock();
  renderFlashcard({ touchProgress: true, progressReason: "continue_after_break" });
}


async function startCurrentUnitReplay() {
  if (typeof touchStudyActivity === "function") touchStudyActivity("unit_replay");
  const unit = Number(state.settings.unit) || 1;
  const words = buildAllUnitWords(unit);
  if (!words.length) return;
  state.roundReturn = {
    unitWords: state.unitWords,
    currentIndex: state.currentIndex,
    groupStats: { ...state.groupStats, unknownIds: [...(state.groupStats.unknownIds || [])] },
    breakInfo: state.breakInfo
  };
  state.unitWords = words;
  state.currentIndex = 0;
  state.groupStats = createGroupStats();
  state.navQueue = [];
  resetCardTransitionState();
  state.markFeedback = "";
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  state.playbackPaused = false;
  state.reviewMode = { mode: "unit-replay", label: `${unitDisplayLabel(currentBook(), unit)} · 从头重刷` };
  await requestWakeLock();
  renderFlashcard({ touchProgress: false, progressReason: "unit_replay" });
}


function getRoundUnknownIds() {
  return Array.from(new Set((state.groupStats.unknownIds || []).map(Number).filter(Boolean)));
}


async function startRoundUnknownReview() {
  if (typeof touchStudyActivity === "function") touchStudyActivity("round_unknown_review");
  const ids = getRoundUnknownIds();
  if (!ids.length) return;
  const idSet = new Set(ids);
  state.roundReturn = {
    unitWords: state.unitWords,
    currentIndex: state.currentIndex,
    groupStats: { ...state.groupStats, unknownIds: [...(state.groupStats.unknownIds || [])] },
    breakInfo: state.breakInfo
  };
  state.unitWords = state.unitWords.filter((word) => idSet.has(word.id));
  state.currentIndex = 0;
  state.groupStats = createGroupStats();
  state.navQueue = [];
  if (typeof resetCardTransitionState === "function") resetCardTransitionState();
  else state.transitioning = false;
  state.markFeedback = "";
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  state.playbackPaused = false;
  state.reviewMode = { mode: "round-unknown", label: "本轮重难点复习", wordIds: ids };
  await requestWakeLock();
  renderFlashcard({ touchProgress: true, progressReason: "round_unknown_review" });
}


function renderCurrentView(options = {}) {
  if (state.view === "flash") renderFlashcard(options);
  else if (state.view === "setup") renderSetup();
  else if (state.view === "break") renderBreak(state.breakInfo || { unitEnd: false });
  else if (state.view === "loading") renderStudyLaunchLoading();
  else renderAuth();
}


