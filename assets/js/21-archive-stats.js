"use strict";

async function openArchive() {
  commitCurrentCardActivity();
  clearTimers();
  state.statsOpen = false;
  state.archiveOpen = true;
  state.archiveStatus = "正在加载归档...";
  resetArchiveSelection();
  if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck("archive_open");
  renderCurrentView({ touchProgress: false });
  try {
    await ensureWords(currentBook());
    state.archiveStatus = "";
  } catch (error) {
    state.archiveStatus = error.message || "归档加载失败";
  }
  renderCurrentView({ touchProgress: false });
}

function openStats() {
  commitCurrentCardActivity();
  clearTimers();
  state.archiveOpen = false;
  resetArchiveSelection();
  state.statsOpen = true;
  if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck("stats_open");
  renderCurrentView({ touchProgress: false });
}

function closeStats() {
  state.statsOpen = false;
  renderCurrentView({ touchProgress: false });
}

function closeArchive() {
  state.archiveOpen = false;
  state.archiveStatus = "";
  resetArchiveSelection();
  renderCurrentView({ touchProgress: false });
}

function renderArchiveDrawer() {
  const book = currentBook();
  const words = state.wordsByBook.get(book.id) || [];
  const marks = loadMarks(book.id);
  const ids = state.archiveTab === "known" ? marks.known : marks.unknown;
  const groups = groupMarkedWords(words, ids);
  const status = state.archiveStatus ? `<div class="status archive-status">${escapeHtml(state.archiveStatus)}</div>` : "";
  const list = groups.length ? groups.map(renderArchiveGroup).join("") : `<div class="status">暂无记录。</div>`;
  const selectionHint = state.archiveSelectionMode === "unit"
    ? "点选 Unit 后开始组合刷词"
    : state.archiveSelectionMode === "word"
      ? "点选单词后批量撤销标记"
      : "长按 Unit 可组合刷词；展开后长按单词可批量撤销";

  return `
    <div class="archive-backdrop" id="archiveBackdrop">
      <aside class="archive-drawer" role="dialog" aria-modal="true">
        <header class="archive-head">
          <div>
            <h2>归档复盘</h2>
            <div class="archive-selection-hint">${escapeHtml(selectionHint)}</div>
          </div>
          ${archiveHeaderActionsHtml()}
        </header>
        <div class="tabs">
          <button class="tab ${state.archiveTab === "known" ? "is-active" : ""}" data-archive-tab="known" type="button">已删词库</button>
          <button class="tab ${state.archiveTab === "unknown" ? "is-active" : ""}" data-archive-tab="unknown" type="button">重难点词库</button>
        </div>
        <div class="archive-body">${status}${list}</div>
      </aside>
    </div>
  `;
}

function groupMarkedWords(words, ids) {
  const idSet = new Set(normalizeIdList(ids));
  const grouped = new Map();
  words.filter((word) => idSet.has(word.id)).forEach((word) => {
    if (!grouped.has(word.unit)) grouped.set(word.unit, []);
    grouped.get(word.unit).push(word);
  });
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
}

function renderArchiveGroup([unit, words]) {
  const book = currentBook();
  const expanded = state.archiveExpandedUnits.has(Number(unit));
  const unitSelected = state.archiveSelectedUnits.has(Number(unit));
  const unitSelection = state.archiveSelectionMode === "unit";
  const wordSelection = state.archiveSelectionMode === "word";
  const list = words.map((word) => {
    const selected = state.archiveSelectedWordIds.has(Number(word.id));
    return `
      <div class="archive-word${selected ? " is-selected" : ""}${wordSelection ? " is-selectable" : ""}" data-archive-word-id="${Number(word.id)}" role="button" tabindex="0" aria-pressed="${selected ? "true" : "false"}">
        <span class="archive-select-indicator" aria-hidden="true">${selected ? "✓" : ""}</span>
        <strong>${escapeHtml(word.en)}</strong>
        <span>${escapeHtml(formatDefinition(word))}</span>
      </div>
    `;
  }).join("");
  return `
    <details class="unit-group${unitSelected ? " is-selected" : ""}${unitSelection ? " is-selectable" : ""}" data-archive-unit="${Number(unit)}" ${expanded ? "open" : ""}>
      <summary data-archive-unit-summary="${Number(unit)}" aria-pressed="${unitSelected ? "true" : "false"}">
        <span class="archive-select-indicator" aria-hidden="true">${unitSelected ? "✓" : ""}</span>
        <span>${escapeHtml(unitDisplayLabel(book, unit))} · ${words.length} 个</span>
      </summary>
      <div class="word-list">${list}</div>
    </details>
  `;
}

function bindArchiveEvents() {
  const close = document.getElementById("closeArchiveBtn");
  const cancelSelection = document.getElementById("cancelArchiveSelectionBtn");
  const selectionAction = document.getElementById("archiveSelectionActionBtn");
  const backdrop = document.getElementById("archiveBackdrop");
  if (close) close.addEventListener("click", closeArchive);
  if (cancelSelection) cancelSelection.addEventListener("click", () => {
    resetArchiveSelection({ collapse: false });
    renderCurrentView({ touchProgress: false });
  });
  if (selectionAction) selectionAction.addEventListener("click", handleArchiveSelectionAction);
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeArchive();
    });
  }
  document.querySelectorAll("[data-archive-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.archiveTab = button.dataset.archiveTab;
      state.archiveStatus = "";
      resetArchiveSelection();
      if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck("archive_tab_switch");
      renderCurrentView({ touchProgress: false });
    });
  });
  document.querySelectorAll(".unit-group[data-archive-unit]").forEach((details) => {
    const unit = Number(details.dataset.archiveUnit);
    details.addEventListener("toggle", () => {
      if (details.open) state.archiveExpandedUnits.add(unit);
      else state.archiveExpandedUnits.delete(unit);
    });
  });
  document.querySelectorAll("[data-archive-unit-summary]").forEach((summary) => {
    const unit = Number(summary.dataset.archiveUnitSummary);
    const key = `unit:${unit}`;
    bindArchiveLongPress(summary, key, () => toggleArchiveUnitSelection(unit));
    summary.addEventListener("click", (event) => {
      if (state.archiveSuppressClickKey === key) {
        state.archiveSuppressClickKey = "";
        event.preventDefault();
        return;
      }
      if (state.archiveSelectionMode === "unit") {
        event.preventDefault();
        toggleArchiveUnitSelection(unit);
      }
    });
  });
  document.querySelectorAll("[data-archive-word-id]").forEach((row) => {
    const wordId = Number(row.dataset.archiveWordId);
    const key = `word:${wordId}`;
    bindArchiveLongPress(row, key, () => toggleArchiveWordSelection(wordId));
    const activate = (event) => {
      if (state.archiveSuppressClickKey === key) {
        state.archiveSuppressClickKey = "";
        event.preventDefault();
        return;
      }
      if (state.archiveSelectionMode === "word") {
        event.preventDefault();
        toggleArchiveWordSelection(wordId);
      }
    };
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
  });
}

function renderStatsDrawer() {
  const book = currentBook();
  const activity = loadActivity(book.id);
  const stats = collectActivityStats(state.statsMode);
  const reviewLabel = state.statsMode === "day" ? "复盘今天" : state.statsMode === "week" ? "复盘本周" : "复盘本月";
  return `
    <div class="stats-backdrop" id="statsBackdrop">
      <aside class="stats-drawer" role="dialog" aria-modal="true">
        <header class="archive-head">
          <div>
            <h2>统计复盘</h2>
            <div class="status">${escapeHtml(book.name)}</div>
          </div>
          <button class="btn btn--ghost" id="closeStatsBtn" type="button">关闭</button>
        </header>
        <div class="tabs">
          <button class="tab ${state.statsMode === "day" ? "is-active" : ""}" data-stats-mode="day" type="button">今天</button>
          <button class="tab ${state.statsMode === "week" ? "is-active" : ""}" data-stats-mode="week" type="button">本周</button>
          <button class="tab ${state.statsMode === "month" ? "is-active" : ""}" data-stats-mode="month" type="button">本月</button>
        </div>
        <div class="stats-body">
          <section class="stats-summary">
            <div class="stat-box"><span>${escapeHtml(stats.label)}时长</span><strong>${escapeHtml(formatDuration(stats.totals.seconds))}</strong></div>
            <div class="stat-box"><span>扫过单词</span><strong>${stats.totals.words}</strong></div>
            <div class="stat-box"><span>已斩 / 生词</span><strong>${stats.totals.known}/${stats.totals.unknown}</strong></div>
          </section>
          <button class="btn btn--primary btn--wide" id="startReviewBtn" type="button" ${stats.wordIds.length ? "" : "disabled"}>${escapeHtml(reviewLabel)}</button>
          <section class="heat-section">
            <div class="heat-head">
              <h3>本周热力</h3>
              <span>${escapeHtml(renderWeekRangeLabel())}</span>
            </div>
            ${renderWeekHeatmap(activity)}
          </section>
          <section class="heat-section">
            <div class="heat-head">
              <button class="heat-nav" data-month-nav="-1" type="button">‹</button>
              <h3>${escapeHtml(renderMonthLabel())}</h3>
              <button class="heat-nav" data-month-nav="1" type="button">›</button>
            </div>
            ${renderMonthHeatmap(activity)}
          </section>
        </div>
      </aside>
    </div>
  `;
}


function renderWeekRangeLabel() {
  const { start, end } = getPeriodRange("week");
  return `${localDateKey(start).slice(5)} - ${localDateKey(end).slice(5)}`;
}


function monthBaseDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + state.statsMonthOffset, 1);
}


function renderMonthLabel() {
  const base = monthBaseDate();
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}


function activityLevel(seconds) {
  const minutes = (seconds || 0) / 60;
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 45) return 2;
  if (minutes < 90) return 3;
  return 4;
}


function renderWeekHeatmap(activity) {
  const { start } = getPeriodRange("week");
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  return `
    <div class="week-heatmap">
      ${labels.map((label, index) => {
        const date = addDays(start, index);
        const key = localDateKey(date);
        const day = activity.days[key] || {};
        const level = activityLevel(day.seconds);
        return `
          <div class="week-cell heat-level-${level}" title="${escapeHtml(key)}">
            <strong>${label}</strong>
            <span>${day.seconds ? escapeHtml(formatHours(day.seconds)) : "0m"}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}


function renderMonthHeatmap(activity) {
  const base = monthBaseDate();
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const leading = (first.getDay() || 7) - 1;
  const cells = [];
  for (let i = 0; i < leading; i += 1) cells.push(`<div class="month-cell month-cell--empty"></div>`);
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(base.getFullYear(), base.getMonth(), day);
    const key = localDateKey(date);
    const item = activity.days[key] || {};
    const level = activityLevel(item.seconds);
    cells.push(`
      <div class="month-cell heat-level-${level}" title="${escapeHtml(key)} ${escapeHtml(formatDuration(item.seconds || 0))}">
        <strong>${day}</strong>
        <span>${item.seconds ? escapeHtml(formatHours(item.seconds)) : ""}</span>
      </div>
    `);
  }
  return `
    <div class="month-weekdays">
      <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
    </div>
    <div class="month-heatmap">${cells.join("")}</div>
  `;
}


function bindStatsEvents() {
  const close = document.getElementById("closeStatsBtn");
  const backdrop = document.getElementById("statsBackdrop");
  const review = document.getElementById("startReviewBtn");
  if (close) close.addEventListener("click", closeStats);
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeStats();
    });
  }
  document.querySelectorAll("[data-stats-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statsMode = button.dataset.statsMode;
      renderCurrentView();
    });
  });
  document.querySelectorAll("[data-month-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statsMonthOffset += Number(button.dataset.monthNav);
      renderCurrentView();
    });
  });
  if (review) review.addEventListener("click", () => startReview(state.statsMode));
}

// ── v2 sync.json ops engine ───────────────────────────────────────────


