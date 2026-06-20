"use strict";

function renderFlashcard({ touchProgress = false } = {}) {
  state.view = "flash";
  clearTimers();
  const book = currentBook();
  const word = state.unitWords[state.currentIndex];
  const next = state.unitWords[state.currentIndex + 1];
  if (!word) {
    renderBreak({ unitEnd: true, reviewEnd: Boolean(state.reviewMode) });
    return;
  }
  if (state.reviewMode?.mode === "unknown-archive") {
    saveUnknownProgress(book.id, state.reviewMode.scope || currentUnknownScope(), { lastWordId: word.id, unit: word.unit, updatedAt: beijingISOString() }, { touch: touchProgress });
  } else if (!state.reviewMode) {
    saveProgress(book.id, { lastWordId: word.id, unit: word.unit, updatedAt: beijingISOString() }, { touch: touchProgress });
  }
  const marks = loadMarks(book.id);
  const markedKind = marks.known.includes(word.id) ? "known" : marks.unknown.includes(word.id) ? "unknown" : "";
  const undoLabel = markedKind ? undoLabelForMark(markedKind) : "";
  const cardEnterDirection = state.cardEnterDirection;
  const resumeFeedback = state.resumeFeedback;
  const markFeedback = state.markFeedback;
  const modeSuffix = state.reviewMode?.mode === "unknown-archive" ? " · 重难点词库" : state.reviewMode ? " · 复盘" : "";
  state.cardEnterDirection = "";
  state.resumeFeedback = false;
  state.markFeedback = "";

  app.innerHTML = `
    <section class="view flash-view">
      <aside class="side-panel">
        <button class="btn btn--ghost" id="backSetupBtn" type="button">返回设置页</button>
        <button class="btn btn--ghost" id="statsBtn" type="button">统计复盘</button>
        <button class="btn btn--ghost" id="archiveBtn" type="button">归档复盘</button>
        <button class="btn btn--ghost" id="manualModeBtn" type="button">${state.settings.manualMode ? "手动模式" : "自动播放"}</button>
        <button class="btn btn--primary" id="finishBtn" type="button">✓ 完成</button>
        <div class="progress-block">
          <div class="progress-title">${escapeHtml(state.reviewMode?.label || bookContextLabel(book, word.unit))}</div>
          <div class="progress-main">${escapeHtml(unitDisplayLabel(book, word.unit))} [${state.currentIndex + 1}/${state.unitWords.length}]</div>
          <div class="progress-sub">词频 ${word.freq} · ID ${word.id}${escapeHtml(modeSuffix)}</div>
          <div class="live-counter" aria-label="本轮实时计数">
            <span>扫过 <strong>${state.groupStats.seen}</strong></span>
            <span>已斩 <strong>${state.groupStats.known}</strong></span>
            <span>重难点 <strong>${state.groupStats.unknown}</strong></span>
          </div>
        </div>
      </aside>

      <section class="stage">
        <div class="card-stack" id="cardStack">
          ${next ? renderWordCard(next, true) : ""}
          ${renderWordCard(word, false, undoLabel, cardEnterDirection, resumeFeedback, markFeedback)}
        </div>
      </section>

      <aside class="side-panel gesture-panel">
        <div class="gesture-list">
          ${gesture("↑", "斩")}
          ${gesture("↓", "生词")}
          ${gesture("←", "上一个")}
          ${gesture("→", "下一个")}
        </div>
      </aside>
    </section>
    ${state.archiveOpen ? renderArchiveDrawer() : ""}
    ${state.statsOpen ? renderStatsDrawer() : ""}
    ${renderSyncIndicator()}
  `;

  document.getElementById("backSetupBtn").addEventListener("click", () => {
    commitCurrentCardActivity();
    state.reviewMode = null;
    renderSetup();
    autoPushToGist();
  });
  document.getElementById("statsBtn").addEventListener("click", openStats);
  document.getElementById("archiveBtn").addEventListener("click", openArchive);
  document.getElementById("manualModeBtn").addEventListener("click", toggleManualModeFromFlash);
  document.getElementById("finishBtn").addEventListener("click", finishCurrentGroup);
  const undoBtn = document.getElementById("undoMarkBtn");
  if (undoBtn) undoBtn.addEventListener("click", () => undoMark(word.id));
  bindGesturePanelControls();
  bindCardGesture();
  bindArchiveEvents();
  bindStatsEvents();
  if (state.currentWordId !== word.id) {
    state.currentWordId = word.id;
    state.currentWordRecorded = false;
  }
  state.cardStartedAt = Date.now();
  requestAnimationFrame(fitActiveWord);
  scheduleWordTimers();
  processNavigationQueueSoon();
}


function renderWordCard(word, isNext = false, undoLabel = "", enterDirection = "", resumeFeedback = false, markFeedback = "") {
  const definition = formatDefinition(word);
  const definitionId = isNext ? "" : ' id="definition"';
  const speechStatusId = isNext ? "" : ' id="speechStatus"';
  const wordEnId = isNext ? "" : ' id="wordEn"';
  const enClass = !isNext && state.speechPhase === "en" ? " is-speaking" : "";
  const zhHtml = isNext ? "" : renderDefinitionHtml(word);
  const freqLabel = word.freq ? `${word.freq} 次` : "0 次";
  const alpha = Number(freqAlpha(word.freq));
  const enterClass = !isNext && ["from-left", "from-right"].includes(enterDirection) ? ` word-card--enter-${enterDirection}` : "";
  const resumeClass = !isNext && resumeFeedback ? " word-card--resume-feedback" : "";
  const markClass = !isNext && markFeedback ? " word-card--mark-feedback" : "";
  const zhHidden = isNext || !state.showZh ? " is-hidden" : "";
  return `
    <article class="word-card ${isNext ? "word-card--next" : ""}${enterClass}${resumeClass}${markClass}" id="${isNext ? "nextCard" : "activeCard"}" style="--freq-alpha: ${alpha.toFixed(3)}; --freq-alpha-soft: ${(alpha * 0.35).toFixed(3)}">
      ${isNext ? "" : renderCardSwipeControls()}
      ${resumeFeedback ? '<div class="resume-feedback" aria-live="polite">继续播放</div>' : ""}
      ${markFeedback === "unknown" ? '<div class="mark-feedback" aria-live="polite">已标记重难点</div>' : ""}
      <div class="freq-watermark">${escapeHtml(freqLabel)}</div>
      <div class="word-card__meta">
        <span>${escapeHtml(unitDisplayLabel(currentBook(), word.unit))}</span>
        <span${speechStatusId}>${escapeHtml(freqLabel)}</span>
      </div>
      <div class="word-card__en-shell"><div class="word-card__en${enClass}"${wordEnId}>${escapeHtml(word.en)}</div></div>
      <div class="word-card__zh${zhHidden}"${definitionId}>${zhHtml}</div>
      ${undoLabel ? `<div class="word-card__actions"><button class="undo-btn" id="undoMarkBtn" type="button">${escapeHtml(undoLabel)}</button></div>` : ""}
    </article>
  `;
}


function renderCardSwipeControls() {
  // 交互契约：左侧点击=上一个，右侧点击=下一个。不要把点击热区和滑动方向直接等同。
  return `
    <div class="card-swipe-edges" aria-hidden="true">
      <span class="card-swipe-edge card-swipe-edge--left"></span>
      <span class="card-swipe-edge card-swipe-edge--right"></span>
      <span class="card-swipe-edge card-swipe-edge--up"></span>
      <span class="card-swipe-edge card-swipe-edge--down"></span>
    </div>
    <button class="card-tap-zone card-tap-zone--left" data-card-tap="tap-left" type="button" aria-label="上一个"></button>
    <button class="card-tap-zone card-tap-zone--right" data-card-tap="tap-right" type="button" aria-label="下一个"></button>
    <button class="card-tap-zone card-tap-zone--up" data-card-tap="up" type="button" aria-label="标记为已斩"></button>
    <button class="card-tap-zone card-tap-zone--down" data-card-tap="down" type="button" aria-label="标记为重难点"></button>
  `;
}


function gesture(symbol, label) {
  const actions = { "↑": "up", "↓": "down", "←": "previous", "→": "next" };
  return `
    <button class="gesture-item" data-gesture-action="${actions[symbol] || ""}" type="button" aria-label="${escapeHtml(label)}">
      <span class="gesture-symbol">${escapeHtml(symbol)}</span>
      <span class="gesture-text">${escapeHtml(label)}</span>
    </button>
  `;
}


function undoLabelForMark(kind) {
  return kind === "known" ? "撤销上滑" : "撤销下滑";
}


async function scheduleWordTimers() {
  const word = state.unitWords[state.currentIndex];
  if (!word || state.archiveOpen || state.statsOpen || state.playbackPaused) return;
  const token = ++state.playbackToken;
  const spokenDefinition = formatSpokenDefinition(word);
  const speechAvailable = "speechSynthesis" in window;
  const hasEnSpeech = Boolean(state.settings.speakEn && speechAvailable);
  const hasZhSpeech = Boolean(state.settings.speakZh && spokenDefinition && speechAvailable);

  const revealTask = revealZhAfterDelay(token);
  await sleepFor(preReadDelayMs());
  if (!isPlaybackToken(token)) return;

  if (hasEnSpeech) {
    const spoken = await speakWithHighlight(word.en, "en-US", "en", token);
    if (!isPlaybackToken(token)) return;
    if (!spoken) await sleepFor(quietBudgetMs(word.en, "en-US", 420));
  } else {
    await sleepFor(quietBudgetMs(word.en, "en-US", 420));
  }

  if (!isPlaybackToken(token)) return;
  await revealTask;
  if (!isPlaybackToken(token)) return;

  if (spokenDefinition) {
    if (hasZhSpeech) {
      const spoken = await speakWithHighlight(spokenDefinition, "zh-CN", "zh", token, { followBoundaries: false });
      if (!isPlaybackToken(token)) return;
      if (!spoken) await sleepFor(quietBudgetMs(spokenDefinition, "zh-CN", 720));
    } else {
      await sleepFor(quietBudgetMs(spokenDefinition, "zh-CN", 720));
    }
  } else {
    await sleepFor(phaseGapMs(320));
  }

  if (!isPlaybackToken(token)) return;
  await sleepFor(postZhRetentionPauseMs());
  if (!isPlaybackToken(token) || state.settings.manualMode) return;
  advanceWord("auto");
}


async function revealZhAfterDelay(token) {
  // zhDelay 为 0 时必须立即显示中文，且不等待英文朗读完成。
  const delay = zhRevealDelayMs();
  if (delay > 0) await sleepFor(delay);
  if (!isPlaybackToken(token)) return false;
  state.showZh = true;
  const definitionNode = document.getElementById("definition");
  if (definitionNode) definitionNode.classList.remove("is-hidden");
  return true;
}


function fitActiveWord() {
  const wordNode = document.getElementById("wordEn");
  const shell = wordNode?.closest(".word-card__en-shell");
  if (!wordNode || !shell) return;
  wordNode.style.fontSize = "";
  const baseSize = Number.parseFloat(getComputedStyle(wordNode).fontSize) || 72;
  const available = shell.clientWidth;
  if (!available) return;
  const scale = Math.min(1, available / Math.max(1, wordNode.scrollWidth));
  wordNode.style.fontSize = `${Math.max(26, Math.floor(baseSize * scale))}px`;
}


function setSpeechPhase(phase, rate) {
  state.speechPhase = phase;
  state.activeZhIndex = -1;
  const en = document.getElementById("wordEn");
  const status = document.getElementById("speechStatus");
  if (en) en.classList.toggle("is-speaking", phase === "en");
  if (status) status.textContent = `${phase === "en" ? "朗读英文" : "朗读义项"} · ${formatRate(rate)}x`;
  if (phase === "zh") highlightZhByCharIndex(0);
}


function clearSpeechPhase() {
  state.speechPhase = "";
  state.activeZhIndex = -1;
  const en = document.getElementById("wordEn");
  const status = document.getElementById("speechStatus");
  if (en) en.classList.remove("is-speaking");
  if (status) {
    const word = state.unitWords[state.currentIndex];
    status.textContent = word?.freq ? `${word.freq} 次` : "0 次";
  }
  document.querySelectorAll(".speech-token.is-speaking").forEach((node) => node.classList.remove("is-speaking"));
}


function highlightZhByCharIndex(charIndex) {
  const tokens = Array.from(document.querySelectorAll(".speech-token"));
  if (!tokens.length) return;
  const active = tokens.find((node) => {
    const start = Number(node.dataset.start) || 0;
    const end = Number(node.dataset.end) || start;
    return charIndex >= start && charIndex <= end;
  }) || tokens[tokens.length - 1];
  tokens.forEach((node) => node.classList.toggle("is-speaking", node === active));
}


function simulateZhHighlight(text, budgetMs, token) {
  const nodes = Array.from(document.querySelectorAll(".speech-token"));
  if (!nodes.length) return;
  const step = Math.max(scaledMinimumMs(120, 35), budgetMs / nodes.length);
  nodes.forEach((_, index) => {
    addTimer(() => {
      if (!isPlaybackToken(token) || state.speechPhase !== "zh") return;
      state.activeZhIndex = index;
      nodes.forEach((node) => {
        node.classList.toggle("is-speaking", Number(node.dataset.tokenIndex) === index);
      });
    }, index * step);
  });
}


