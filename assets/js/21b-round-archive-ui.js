"use strict";

function sortedRoundArchiveRecords() {
  return Object.values(loadRoundArchives()).sort(function(a, b) {
    const ams = Date.parse(a.archivedAt || "") || 0;
    const bms = Date.parse(b.archivedAt || "") || 0;
    if (ams !== bms) return bms - ams;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

function formatArchiveTime(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return String(value || "");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderRoundArchiveHistory() {
  const records = sortedRoundArchiveRecords();
  const currentRound = loadRoundState();
  const currentLabel = currentRound.generation > 0 ? `当前：第 ${currentRound.generation + 1} 轮` : "当前：第 1 轮";
  if (!records.length) {
    return `
      <section class="round-archive-intro">
        <strong>${escapeHtml(currentLabel)}</strong>
        <span>还没有历史归档。归档后，旧一轮学习记录会完整保留，当前学习状态会恢复为未标记、未删除、无进度的初始状态。</span>
      </section>
      <div class="status">暂无历史归档。</div>
    `;
  }
  return `
    <section class="round-archive-intro">
      <strong>${escapeHtml(currentLabel)} · 已归档 ${records.length} 轮</strong>
      <span>历史归档只读保留；新一轮不会继承旧一轮的生词、熟词、删除标记或学习进度。</span>
    </section>
    <div class="round-archive-list">${records.map(renderRoundArchiveRecord).join("")}</div>
  `;
}

function renderRoundArchiveRecord(record) {
  const summary = record.summary || archiveSnapshotSummary(record.snapshot);
  const roundNumber = Math.max(1, Number(record.round && record.round.generation || 0) + 1);
  const bookRows = BOOKS.map(function(book) {
    const item = summary.books && summary.books[book.id] || { known: 0, unknown: 0, activityDays: 0, completedUnits: 0 };
    return `
      <div class="round-archive-book-row">
        <span>${escapeHtml(book.name)}</span>
        <strong>已删 ${Number(item.known) || 0} · 重难 ${Number(item.unknown) || 0}</strong>
      </div>
    `;
  }).join("");
  const note = record.note
    ? `<div class="round-archive-note">${escapeHtml(record.note)}</div>`
    : `<div class="round-archive-note round-archive-note--empty">未填写备注</div>`;
  return `
    <details class="round-archive-card">
      <summary>
        <span class="round-archive-card-title">${escapeHtml(record.name)}</span>
        <span class="round-archive-card-meta">第 ${roundNumber} 轮 · ${escapeHtml(formatArchiveTime(record.archivedAt))}</span>
      </summary>
      <div class="round-archive-card-body">
        ${note}
        <div class="round-archive-summary-grid">
          <div><span>已删词</span><strong>${Number(summary.known) || 0}</strong></div>
          <div><span>重难词</span><strong>${Number(summary.unknown) || 0}</strong></div>
          <div><span>学习日</span><strong>${Number(summary.activityDays) || 0}</strong></div>
          <div><span>完成计数</span><strong>${Number(summary.completedUnits) || 0}</strong></div>
        </div>
        <div class="round-archive-book-list">${bookRows}</div>
        <div class="round-archive-readonly">此归档为只读历史记录，不会影响当前轮。</div>
      </div>
    </details>
  `;
}

function renderRoundArchiveForm() {
  if (!state.archiveFormOpen) return "";
  const error = state.archiveFormError ? `<div class="status status--danger">${escapeHtml(state.archiveFormError)}</div>` : "";
  return `
    <div class="round-archive-form-backdrop" id="roundArchiveFormBackdrop">
      <section class="round-archive-form" role="dialog" aria-modal="true" aria-labelledby="roundArchiveFormTitle">
        <header>
          <div>
            <h3 id="roundArchiveFormTitle">归档当前这一轮</h3>
            <p>确认后，当前学习记录会封存到历史归档；词库本身和云同步配置不会删除。</p>
          </div>
        </header>
        <label class="field-label">
          归档名称
          <input class="input" id="roundArchiveNameInput" maxlength="160" autocomplete="off" placeholder="例如：第一轮 · 8月底" value="${escapeHtml(state.archiveDraftName || "")}" />
        </label>
        <label class="field-label">
          备注（可多行）
          <textarea class="input round-archive-note-input" id="roundArchiveNoteInput" maxlength="12000" rows="6" placeholder="可以记录这一轮的状态、范围、复盘想法等。">${escapeHtml(state.archiveDraftNote || "")}</textarea>
        </label>
        <div class="round-archive-warning">
          <strong>归档后会重置：</strong>生词/熟词/已删标记、普通与重难点学习进度、学习统计和当前刷词会话。<br />
          <strong>不会重置：</strong>原始词库、词书与播放设置、GitHub Gist 配置、历史归档和安全备份。
        </div>
        ${error}
        <div class="round-archive-form-actions">
          <button class="btn btn--ghost" id="cancelRoundArchiveBtn" type="button" ${state.roundArchiveBusy ? "disabled" : ""}>取消</button>
          <button class="btn btn--primary" id="confirmRoundArchiveBtn" type="button" ${state.roundArchiveBusy ? "disabled" : ""}>${state.roundArchiveBusy ? "正在归档…" : "确认归档并开启新一轮"}</button>
        </div>
      </section>
    </div>
  `;
}

function openRoundArchiveForm() {
  resetArchiveSelection({ collapse: false });
  state.archiveFormOpen = true;
  state.archiveFormError = "";
  renderCurrentView({ touchProgress: false });
  const input = document.getElementById("roundArchiveNameInput");
  if (input) input.focus();
}

function closeRoundArchiveForm() {
  if (state.roundArchiveBusy) return;
  state.archiveFormOpen = false;
  state.archiveFormError = "";
  renderCurrentView({ touchProgress: false });
}

async function confirmRoundArchiveFromForm() {
  if (state.roundArchiveBusy) return;
  const nameInput = document.getElementById("roundArchiveNameInput");
  const noteInput = document.getElementById("roundArchiveNoteInput");
  const name = String(nameInput && nameInput.value || "").trim();
  const note = String(noteInput && noteInput.value || "");
  state.archiveDraftName = name;
  state.archiveDraftNote = note;
  if (!name) {
    state.archiveFormError = "请先填写归档名称。";
    renderCurrentView({ touchProgress: false });
    return;
  }
  state.archiveFormError = "";
  const archivePromise = archiveCurrentRound(name, note);
  renderCurrentView({ touchProgress: false });
  const result = await archivePromise;
  if (!result.ok) {
    state.archiveFormError = result.error || "归档失败，原数据已保留。";
    renderCurrentView({ touchProgress: false });
    return;
  }
  state.archiveFormOpen = false;
  state.archiveDraftName = "";
  state.archiveDraftNote = "";
  state.archiveFormError = "";
  state.archiveTab = "history";
  state.archiveStatus = `“${result.record.name}”已归档。当前已进入第 ${result.nextRound.generation + 1} 轮，学习状态已恢复为初始状态。`;
  resetArchiveSelection();
  renderSetup();
  updateSyncIndicator();
}

function bindRoundArchiveUiEvents() {
  const openButton = document.getElementById("archiveCurrentRoundBtn");
  const cancelButton = document.getElementById("cancelRoundArchiveBtn");
  const confirmButton = document.getElementById("confirmRoundArchiveBtn");
  const formBackdrop = document.getElementById("roundArchiveFormBackdrop");
  if (openButton) openButton.addEventListener("click", openRoundArchiveForm);
  if (cancelButton) cancelButton.addEventListener("click", closeRoundArchiveForm);
  if (confirmButton) confirmButton.addEventListener("click", confirmRoundArchiveFromForm);
  if (formBackdrop) {
    formBackdrop.addEventListener("click", function(event) {
      if (event.target === formBackdrop) closeRoundArchiveForm();
    });
  }
}
