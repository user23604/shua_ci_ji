"use strict";

function renderStudyLaunchLoading(message) {
  state.view = "loading";
  releaseWakeLock();
  clearTimers();
  app.innerHTML = `
    <section class="view loading-view">
      <div class="auth-panel">
        <h1>正在恢复刷词</h1>
        <div class="status">${escapeHtml(message || "正在读取上次学习位置…")}</div>
      </div>
    </section>
    ${renderSyncIndicator()}
  `;
}

function sanitizeStoredReviewMode(value) {
  if (!isPlainObject(value) || !value.mode) return null;
  const allowed = new Set(["unknown-archive", "round-unknown", "unit-replay", "archive-unit-selection", "activity-review"]);
  if (!allowed.has(String(value.mode))) return null;
  const result = {
    mode: String(value.mode),
    label: String(value.label || "复盘")
  };
  if (isPlainObject(value.scope)) {
    result.scope = value.scope.scope === "book"
      ? { scope: "book" }
      : { scope: "unit", unit: Math.max(1, Number(value.scope.unit) || 1) };
  }
  if (Array.isArray(value.wordIds)) result.wordIds = normalizeIdList(value.wordIds);
  return result;
}

function saveActiveStudySession(reason) {
  if (state.view !== "flash") return false;
  const word = state.unitWords && state.unitWords[state.currentIndex];
  if (!word || !state.unitWords.length) return false;
  const payload = {
    schemaVersion: 1,
    savedAt: beijingISOString(),
    reason: String(reason || "render"),
    bookId: currentBook().id,
    unit: Number(word.unit) || Number(state.settings.unit) || 1,
    wordIds: state.unitWords.map((item) => Number(item.id)).filter(Boolean),
    currentWordId: Number(word.id) || 0,
    currentIndex: Math.max(0, Number(state.currentIndex) || 0),
    showZh: state.showZh === true,
    reviewMode: state.reviewMode ? sanitizeStoredReviewMode({
      ...state.reviewMode,
      wordIds: Array.isArray(state.reviewMode.wordIds) ? state.reviewMode.wordIds : undefined
    }) : null,
    groupStats: {
      seen: Math.max(0, Number(state.groupStats && state.groupStats.seen) || 0),
      known: Math.max(0, Number(state.groupStats && state.groupStats.known) || 0),
      unknown: Math.max(0, Number(state.groupStats && state.groupStats.unknown) || 0),
      unknownIds: normalizeIdList(state.groupStats && state.groupStats.unknownIds)
    }
  };
  return saveJson(STUDY_SESSION_KEY, payload);
}

function loadActiveStudySession() {
  const value = loadJson(STUDY_SESSION_KEY, null);
  if (!isPlainObject(value) || Number(value.schemaVersion) !== 1) return null;
  const book = BOOKS.find((item) => item.id === value.bookId);
  const ids = normalizeIdList(value.wordIds);
  if (!book || !ids.length) return null;
  return {
    bookId: book.id,
    unit: clamp(Number(value.unit) || 1, 1, book.totalUnits),
    wordIds: ids,
    currentWordId: Number(value.currentWordId) || 0,
    currentIndex: Math.max(0, Number(value.currentIndex) || 0),
    showZh: value.showZh === true,
    reviewMode: sanitizeStoredReviewMode(value.reviewMode),
    groupStats: {
      seen: Math.max(0, Number(value.groupStats && value.groupStats.seen) || 0),
      known: Math.max(0, Number(value.groupStats && value.groupStats.known) || 0),
      unknown: Math.max(0, Number(value.groupStats && value.groupStats.unknown) || 0),
      unknownIds: normalizeIdList(value.groupStats && value.groupStats.unknownIds)
    }
  };
}

function findResumeIndexForQueue(words, lastWordId, fallbackIndex) {
  if (!words.length) return 0;
  const id = Number(lastWordId);
  const exact = words.findIndex((word) => Number(word.id) === id);
  if (exact >= 0) return exact;
  const fallback = clamp(Number(fallbackIndex) || 0, 0, words.length - 1);
  return fallback;
}

function restoreStudySessionRecord(record, words) {
  const idSet = new Set(record.wordIds);
  let queue = words.filter((word) => idSet.has(Number(word.id)));
  if (!queue.length) return false;
  state.words = words;
  state.unitWords = queue;
  state.currentIndex = findResumeIndexForQueue(queue, record.currentWordId, record.currentIndex);
  state.settings.unit = clamp(Number(queue[state.currentIndex] && queue[state.currentIndex].unit) || record.unit, 1, currentBook().totalUnits);
  state.reviewMode = record.reviewMode;
  state.groupStats = record.groupStats || createGroupStats();
  state.showZh = record.showZh === true;
  state.playbackPaused = true;
  state.awaitingManualZhReveal = Boolean(state.settings.manualZhReveal && !state.showZh);
  state.roundReturn = null;
  state.undoWordId = null;
  state.navQueue = [];
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.archiveOpen = false;
  state.statsOpen = false;
  resetCardTransitionState();
  return true;
}

function prepareDefaultLaunchQueue(book, words) {
  state.words = words;
  const unknownMode = state.settings.queueMode === "unknown";
  const scope = currentUnknownScope();
  let queue = unknownMode ? buildUnknownStudyWords(book.id, scope) : buildStudyUnitWords(book.id, state.settings.unit);
  let reviewMode = unknownMode ? { mode: "unknown-archive", label: unknownScopeLabel(book, scope), scope } : null;
  if (!queue.length) {
    queue = buildAllUnitWords(state.settings.unit);
    reviewMode = queue.length ? { mode: "unit-replay", label: `${unitDisplayLabel(book, state.settings.unit)} · 重新刷` } : null;
  }
  if (!queue.length) {
    const firstUnitWithWords = Array.from({ length: book.totalUnits }, (_, index) => index + 1)
      .find((unit) => words.some((word) => Number(word.unit) === unit));
    if (firstUnitWithWords) {
      state.settings.unit = firstUnitWithWords;
      queue = words.filter((word) => Number(word.unit) === firstUnitWithWords);
      reviewMode = null;
    }
  }
  if (!queue.length) throw new Error("词库没有可显示的单词");
  const progress = unknownMode ? loadUnknownProgressForResume(book.id, scope) : loadProgressForResume(book.id);
  const currentIndex = findResumeIndexForQueue(queue, progress && progress.lastWordId, 0);
  state.unitWords = queue;
  state.currentIndex = currentIndex;
  state.reviewMode = reviewMode;
  state.groupStats = createGroupStats();
  state.showZh = false;
  state.playbackPaused = true;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  state.roundReturn = null;
  state.undoWordId = null;
  state.navQueue = [];
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.archiveOpen = false;
  state.statsOpen = false;
  resetCardTransitionState();
}

async function enterStudyOnLaunch(options = {}) {
  if (state.launchRestoringStudy) return;
  state.launchRestoringStudy = true;
  renderStudyLaunchLoading(options.reason === "auth_success" ? "登录成功，正在打开上次刷词位置…" : "正在打开上次刷词位置…");
  try {
    normalizeSettings();
    const record = loadActiveStudySession();
    if (record && record.bookId !== state.settings.bookId) restoreBookSettings(record.bookId);
    const book = currentBook();
    const words = await ensureWords(book);
    if (!record || record.bookId !== book.id || !restoreStudySessionRecord(record, words)) {
      prepareDefaultLaunchQueue(book, words);
    }
    state.setupStatus = "";
    renderFlashcard({ touchProgress: false, progressReason: "launch_restore" });
    appendAuditEvent({
      type: "study:launch_restored",
      message: "bookId=" + book.id + " wordId=" + String(state.unitWords[state.currentIndex] && state.unitWords[state.currentIndex].id || "") + " paused=true stored=" + String(Boolean(record))
    });
  } catch (error) {
    state.setupStatus = { message: error && error.message || "恢复上次刷词失败，请在设置页重新选择。", type: "error" };
    renderSetup();
  } finally {
    state.launchRestoringStudy = false;
  }
}
