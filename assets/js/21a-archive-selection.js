"use strict";

function resetArchiveSelection(options = {}) {
  state.archiveSelectionMode = "";
  state.archiveSelectedUnits = new Set();
  state.archiveSelectedWordIds = new Set();
  state.archiveSuppressClickKey = "";
  if (options.collapse !== false) state.archiveExpandedUnits = new Set();
}

function archiveSelectionCount() {
  if (state.archiveSelectionMode === "unit") return state.archiveSelectedUnits.size;
  if (state.archiveSelectionMode === "word") return state.archiveSelectedWordIds.size;
  return 0;
}

function archiveHeaderActionsHtml() {
  const count = archiveSelectionCount();
  if (!state.archiveSelectionMode) return `
    <div class="archive-selection-actions">
      <button class="btn btn--ghost" id="archiveCurrentRoundBtn" type="button">归档当前轮</button>
      <button class="btn btn--ghost" id="closeArchiveBtn" type="button">关闭</button>
    </div>
  `;
  const actionLabel = state.archiveSelectionMode === "unit" ? `开始刷词 (${count})` : `撤销 (${count})`;
  return `
    <div class="archive-selection-actions">
      <button class="btn btn--ghost" id="cancelArchiveSelectionBtn" type="button">取消</button>
      <button class="btn btn--primary" id="archiveSelectionActionBtn" type="button" ${count ? "" : "disabled"}>${escapeHtml(actionLabel)}</button>
    </div>
  `;
}

function beginArchiveSelection(mode) {
  if (mode !== "unit" && mode !== "word") return;
  if (state.archiveSelectionMode !== mode) {
    state.archiveSelectionMode = mode;
    state.archiveSelectedUnits = new Set();
    state.archiveSelectedWordIds = new Set();
  }
}

function toggleArchiveUnitSelection(unit) {
  const value = Number(unit);
  if (!Number.isFinite(value)) return;
  beginArchiveSelection("unit");
  if (state.archiveSelectedUnits.has(value)) state.archiveSelectedUnits.delete(value);
  else state.archiveSelectedUnits.add(value);
  renderCurrentView({ touchProgress: false });
}

function toggleArchiveWordSelection(wordId) {
  const value = Number(wordId);
  if (!Number.isFinite(value)) return;
  beginArchiveSelection("word");
  if (state.archiveSelectedWordIds.has(value)) state.archiveSelectedWordIds.delete(value);
  else state.archiveSelectedWordIds.add(value);
  renderCurrentView({ touchProgress: false });
}

function bindArchiveLongPress(element, key, callback) {
  if (!element) return;
  let timer = null;
  let startX = 0;
  let startY = 0;
  let pointerId = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pointerId = null;
  };
  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancel();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    timer = window.setTimeout(() => {
      timer = null;
      state.archiveSuppressClickKey = key;
      if (navigator.vibrate) navigator.vibrate(20);
      callback();
    }, 520);
  });
  element.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) cancel();
  });
  element.addEventListener("pointerup", cancel);
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("contextmenu", (event) => event.preventDefault());
}

async function startSelectedArchiveUnits() {
  const selectedUnits = new Set(Array.from(state.archiveSelectedUnits).map(Number));
  if (!selectedUnits.size) return;
  const book = currentBook();
  const words = await ensureWords(book);
  const marks = loadMarks(book.id);
  const markedIds = new Set(state.archiveTab === "known" ? marks.known : marks.unknown);
  const queue = words.filter((word) => selectedUnits.has(Number(word.unit)) && markedIds.has(Number(word.id)));
  if (!queue.length) {
    state.archiveStatus = "所选 Unit 已没有可刷的归档单词。";
    resetArchiveSelection({ collapse: false });
    renderCurrentView({ touchProgress: false });
    return;
  }
  state.unitWords = queue;
  state.currentIndex = 0;
  state.groupStats = createGroupStats();
  state.reviewMode = {
    mode: "archive-unit-selection",
    label: `${state.archiveTab === "known" ? "已删词库" : "重难点词库"} · ${selectedUnits.size} 个 Unit`,
    wordIds: queue.map((word) => word.id)
  };
  state.roundReturn = null;
  state.undoWordId = null;
  state.navQueue = [];
  resetCardTransitionState();
  state.currentWordId = null;
  state.currentWordRecorded = false;
  state.showZh = false;
  state.awaitingManualZhReveal = state.settings.manualZhReveal === true;
  state.playbackPaused = false;
  state.archiveOpen = false;
  resetArchiveSelection();
  await requestWakeLock();
  renderFlashcard({ touchProgress: false, progressReason: "archive_unit_selection" });
}

function undoSelectedArchiveWords() {
  const ids = Array.from(state.archiveSelectedWordIds).map(Number).filter(Boolean);
  if (!ids.length) return;
  const kindLabel = state.archiveTab === "known" ? "上滑" : "下滑";
  const ok = setWordMarkStatesBatch(currentBook().id, ids, null);
  if (!ok) {
    state.archiveStatus = "撤销失败：浏览器未能完整保存修改。";
    renderCurrentView({ touchProgress: false });
    return;
  }
  appendAuditEvent({ type: "user:archive_batch_undo", message: `kind=${state.archiveTab} count=${ids.length}` });
  state.archiveStatus = `已撤销 ${ids.length} 个单词的${kindLabel}标记。`;
  resetArchiveSelection({ collapse: false });
  updateSyncIndicator();
  renderCurrentView({ touchProgress: false });
}

function handleArchiveSelectionAction() {
  if (state.archiveSelectionMode === "unit") startSelectedArchiveUnits();
  else if (state.archiveSelectionMode === "word") undoSelectedArchiveWords();
}
