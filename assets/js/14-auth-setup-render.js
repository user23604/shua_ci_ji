"use strict";

function setSetupStatus(message, type = "") {
  state.setupStatus = message ? { message, type } : "";
  if (state.view === "setup") renderSetup();
}


function isAuthenticated() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

// ── P0: Hash sync state migration ──────────────────────────────────────
// 旧设备没有 vocab_machine_hash_sync_state_v1 时，保守默认 dirty。
// 旧 syncMeta 不能作为"已同步"证明——只有 syncTick GET 后发现云端 hash 匹配才标记 clean。

function renderAuth(error = false) {
  state.view = "auth";
  releaseWakeLock();
  clearTimers();
  app.innerHTML = `
    <section class="view auth-view">
      <div class="auth-panel">
        <h1>考研词汇自动刷词机</h1>
        <p>输入访问密钥后进入个人词库。</p>
        <form class="auth-form" id="authForm">
          <label class="field-label">
            访问密钥
            <input class="input ${error ? "is-error" : ""}" id="passwordInput" type="password" autocomplete="current-password" autofocus>
          </label>
          <button class="btn btn--primary" type="submit">进入应用</button>
          <div class="status ${error ? "status--error" : ""}">${error ? "密钥错误，请重试。" : ""}</div>
        </form>
      </div>
    </section>
    ${renderSyncIndicator()}
  `;
  const form = document.getElementById("authForm");
  const input = document.getElementById("passwordInput");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value === ACCESS_KEY) {
      localStorage.setItem(AUTH_KEY, "true");
      renderSetup();
    } else {
      renderAuth(true);
    }
  });
  input.focus();
}


function renderSetup() {
  state.view = "setup";
  releaseWakeLock();
  clearTimers();
  normalizeSettings();
  const book = currentBook();
  const setupWords = state.wordsByBook.get(book.id) || [];
  const unknownMode = state.settings.queueMode === "unknown";
  const unitOptions = renderUnitSelectOptions(book, setupWords);
  const unitSelectLabel = unknownMode ? "重难点范围" : "目标 Unit";
  const bookOptions = BOOKS.map((item) => `
    <option value="${escapeHtml(item.id)}" ${item.id === state.settings.bookId ? "selected" : ""}>${escapeHtml(item.name)}</option>
  `).join("");
  const setupStatus = state.setupStatus
    ? `<div class="status ${state.setupStatus.type ? `status--${state.setupStatus.type}` : ""}">${escapeHtml(state.setupStatus.message)}</div>`
    : `<div class="status">词库文件：${escapeHtml(book.csv)}</div>`;
  const summaryCountControl = state.settings.summaryMode === "count"
    ? rangeControl("summaryCount", "每组单词数", state.settings.summaryCount, "个", 5, 120, 1)
    : `<div class="status">当前模式不会按固定数量打断播放。</div>`;

  app.innerHTML = `
    <section class="view setup-view">
      <header class="setup-topbar">
        <div class="setup-title">
          <h1>考研词汇自动刷词机</h1>
          <p>${escapeHtml(bookContextLabel(book))}</p>
        </div>
        <div class="setup-actions">
          <button class="btn btn--ghost" id="statsBtn" type="button">统计复盘</button>
          <button class="btn btn--ghost" id="archiveBtn" type="button">归档复盘</button>
          <button class="btn btn--ghost" id="logoutBtn" type="button">退出</button>
        </div>
      </header>

      <section class="setup-grid">
        <div class="settings-panel settings-panel--span2">
          <h2 class="panel-title">书库与范围</h2>
          <div class="control-list">
            <label class="field-label">
              词书
              <select class="select" id="bookSelect">${bookOptions}</select>
            </label>
            <label class="field-label">
              ${escapeHtml(unitSelectLabel)}
              <select class="select" id="unitSelect">${unitOptions}</select>
            </label>
            <div class="toggle-grid">
              ${toggle("unknownMode", "重难点词库", unknownMode)}
            </div>
            ${renderSelectedUnitStats(book, setupWords)}
            <div class="radio-group">
              ${radio("mode", "restart", "从选定 Unit 开头重新开始")}
              ${radio("mode", "resume", "恢复上一次学习进度")}
            </div>
          </div>
        </div>

        <div class="settings-panel settings-panel--span2">
          <h2 class="panel-title">节奏控制</h2>
          <div class="control-list">
            ${rateRangeControl()}
            ${rangeControl("preReadDelayInput", "读前停留", state.settings.preReadDelay, "ms", PRE_READ_DELAY_MIN, PRE_READ_DELAY_MAX, PRE_READ_DELAY_STEP)}
            ${rangeControl("zhDelayInput", "中文出现延迟", state.settings.zhDelay, "ms", ZH_DELAY_MIN, ZH_DELAY_MAX, 50)}
            ${rangeControl("retentionPauseInput", "读后停留", state.settings.retentionPause, "ms", RETENTION_PAUSE_MIN, RETENTION_PAUSE_MAX, RETENTION_PAUSE_STEP)}
            <div class="toggle-grid">
              ${toggle("manualMode", "手动模式", state.settings.manualMode)}
            </div>
            <div class="status">朗读倍速只影响中英文读音；读前停留、中文出现延迟和读后停留均为绝对时间。</div>
            <label class="field-label">
              总结节点
              <select class="select" id="summaryMode">
                <option value="count" ${state.settings.summaryMode === "count" ? "selected" : ""}>每 X 个单词</option>
                <option value="unit" ${state.settings.summaryMode === "unit" ? "selected" : ""}>当前整个 Unit 结束</option>
                <option value="manual" ${state.settings.summaryMode === "manual" ? "selected" : ""}>手动点击完成</option>
              </select>
            </label>
            ${summaryCountControl}
          </div>
        </div>

        <div class="settings-panel">
          <h2 class="panel-title">声音</h2>
          <div class="control-list">
            <div class="toggle-grid">
              ${toggle("speakEn", "英文朗读", state.settings.speakEn)}
              ${toggle("speakZh", "中文朗读", state.settings.speakZh)}
            </div>
            <div class="status">中文朗读只读简要义项，卡片仍显示完整释义。</div>
          </div>
        </div>

        <div class="settings-panel">
          <h2 class="panel-title">显示</h2>
          <div class="control-list">
            <div class="toggle-grid">
              ${toggle("highOnly", "仅显示高频标红释义", state.settings.highOnly)}
            </div>
            ${setupStatus}
          </div>
        </div>

        <div class="settings-panel settings-panel--span4">
          <h2 class="panel-title">云同步</h2>
          <div class="control-list">
            <div class="sync-grid">
              <label class="field-label">
                GitHub PAT
                <input class="input" id="tokenInput" type="text" value="${escapeHtml(state.cloudConfigDraft.token || state.cloud.token)}" autocomplete="off" placeholder="ghp_ 或 github_pat_ 开头">
              </label>
              <label class="field-label">
                Gist ID
                <input class="input" id="gistInput" type="text" value="${escapeHtml(state.cloudConfigDraft.gistId || state.cloud.gistId)}" autocomplete="off" placeholder="例如：a1b2c3d4e5f6...">
              </label>
            </div>
            <button class="btn btn--primary" id="testSaveCloudBtn" type="button" style="margin-top:8px;">测试并保存云同步配置</button>
            <div class="status" id="cloudConfigStatus"></div>
          </div>
        </div>
        ${renderSyncDiagnostics()}
      </section>

      <button class="btn btn--primary btn--wide" id="startBtn" type="button">开始刷词</button>
    </section>
    ${state.archiveOpen ? renderArchiveDrawer() : ""}
    ${state.statsOpen ? renderStatsDrawer() : ""}
    ${renderSyncIndicator()}
  `;

  bindSetupEvents();
  bindArchiveEvents();
  bindStatsEvents();
  primeSetupBookData(book);
}


function renderSyncDiagnostics() {
  var meta = ensureSyncMeta(state.syncMeta);
  var syncState = ensureHashSyncState(state.syncHashState);
  var facts = currentSyncFacts({ persistHash: false });
  var opsCount = getPendingOps().length;
  var info = computeSyncStatus();
  var cloud = validateSavedCloudConfig(state.cloud);
  var backups = loadHashBackupIndex();
  var gistDisplay = (state.cloud.gistId || "").trim();
  if (gistDisplay.length > 8) gistDisplay = gistDisplay.slice(0, 4) + "…" + gistDisplay.slice(-4);
  var shortHash = function(value) { return value ? String(value).slice(0, 10) : "无"; };
  var lines = [];
  lines.push('<div class="settings-panel settings-panel--span4" style="margin-top:8px;" data-cloud-sync-diagnostics>');
  lines.push('<h2 class="panel-title">云同步诊断</h2>');
  lines.push('<div class="control-list" style="font-size:13px;line-height:1.8;">');

  var statusLabel = SYNC_STATUS_LABELS[info.status] || "";
  var statusColor = SYNC_STATUS_COLORS[info.status] || "#94a3b8";
  lines.push('<div>同步状态：<span style="color:' + statusColor + ';font-weight:700;">' + escapeHtml(statusLabel) + '</span></div>');
  lines.push('<div>\u5e94\u7528\u7248\u672c：' + escapeHtml(APP_VERSION) + '；Build ID：' + escapeHtml(APP_BUILD_ID) + '</div>');
  lines.push('<div>\u670d\u52a1\u5668\u7248\u672c：' + escapeHtml(state.versionInfo && state.versionInfo.serverVersion || "\u672a\u68c0\u67e5") + '；\u6700\u8fd1\u68c0\u67e5：' + formatLocalDateTime(state.versionInfo && state.versionInfo.lastCheckedAt) + '</div>');
  lines.push('<div>Gist ID：' + escapeHtml(gistDisplay || "未设置") + '</div>');
  lines.push('<div>PAT 格式：' + (cloud.ok ? '通过' : escapeHtml(cloud.errors.join("；"))) + '</div>');
  lines.push('<div>云端可写：' + (meta.cloudWritable ? '是' : '未确认') + '</div>');
  lines.push('<div>只读模式：' + (meta.readOnlyMode ? '是' : '否') + '</div>');
  // P0.6: 同步卡住检测
  var syncAge = state.isSyncing && state.syncStartedAt ? Math.floor((Date.now() - state.syncStartedAt) / 1000) : 0;
  lines.push('<div>当前是否同步中：' + (state.isSyncing ? '是' : '否') + (syncAge > 0 ? '（已持续 ' + syncAge + ' 秒）' : '') + '</div>');
  lines.push('<div>同步锁状态：' + (syncAge > 45 ? '<span style="color:#dc2626;">疑似卡住</span>' : '正常') + '</div>');
  lines.push('<div>localRecoveryRequired：' + (syncState.localRecoveryRequired ? 'true' : 'false') + '</div>');
  lines.push('<div>本地 dirty：' + (syncState.localDirty ? 'true' : 'false') + '；有效 dirty：' + (facts.effectiveDirty ? 'true' : 'false') + '</div>');
  lines.push('<div>baseRemoteHash：' + escapeHtml(shortHash(syncState.baseRemoteHash)) + '；localPayloadHash：' + escapeHtml(shortHash(facts.localPayloadHash)) + '</div>');
  lines.push('<div>dirtySince：' + formatLocalDateTime(syncState.dirtySince) + '</div>');
  lines.push('<div>最近成功 Push：' + formatLocalDateTime(syncState.lastSuccessfulPushAt || meta.lastSuccessfulPushAt) + '</div>');
  lines.push('<div>最近成功 Pull：' + formatLocalDateTime(syncState.lastSuccessfulPullAt || meta.lastSuccessfulPullAt) + '</div>');
  lines.push('<div>待处理旧 pendingOps：' + opsCount + ' 条（P0 已冻结，不再写入）</div>');
  lines.push('<div>连续失败：' + syncState.consecutiveSyncFailures + '；下次重试：' + formatLocalDateTime(syncState.nextRetryAt) + '</div>');
  lines.push('<div>关键备份：' + backups.length + ' 条；最新本地快照：' + escapeHtml(getLocalSnapshotTime()) + '</div>');
  if (backups.length > 0) {
    var recentBackups = backups.slice(-5).reverse();
    lines.push('<div style="font-size:11px;color:#94a3b8;">最近备份：' + recentBackups.map(function(b) {
      return escapeHtml((b.kind || b.tag || "?") + " " + (b.savedAt || b.timestamp || b.createdAt || "").slice(0, 19));
    }).join("；") + '</div>');
  }
  lines.push('<div>今日备份：' + escapeHtml(getDailyBackupTime()) + '</div>');
  lines.push('<div>最近错误：' + escapeHtml(syncState.lastSyncError || meta.lastSyncErrorMessage || "无") + '</div>');
  if (syncState.lastBackupError) lines.push('<div>备份写入错误：' + escapeHtml(syncState.lastBackupError) + '</div>');

  lines.push('<div style="margin-top:8px;">');
  lines.push('<button class="btn btn--ghost" id="exportBackupBtn" type="button" style="font-size:12px;">导出本地完整备份 JSON</button>');
  lines.push('<button class="btn btn--ghost" id="exportDiagnosisBtn" type="button" style="font-size:12px;margin-left:4px;">导出诊断摘要</button>');
  lines.push('<button class="btn btn--ghost" id="exportAuditLogBtn" type="button" style="font-size:12px;margin-left:4px;">导出运行日志</button>');
  lines.push('</div>');
  lines.push('<div style="color:#94a3b8;font-size:11px;margin-top:4px;">诊断版本：' + escapeHtml(APP_VERSION) + ' · ' + escapeHtml(APP_BUILD_ID) + '</div>');
  lines.push('</div></div>');
  return lines.join("\n");
}

function renderCloudSyncDiagnostics() {
  var box = document.querySelector("[data-cloud-sync-diagnostics]");
  if (!box) return;

  var sx = window.scrollX || 0;
  var sy = window.scrollY || 0;

  box.outerHTML = renderSyncDiagnostics();

  bindSyncDiagnosticsButtons();

  requestAnimationFrame(function() {
    window.scrollTo(sx, sy);
  });
}

function bindSyncDiagnosticsButtons() {
  var exportBackupBtn = document.getElementById("exportBackupBtn");
  var exportDiagnosisBtn = document.getElementById("exportDiagnosisBtn");
  var exportAuditLogBtn = document.getElementById("exportAuditLogBtn");

  if (exportBackupBtn) exportBackupBtn.onclick = exportLocalBackup;
  if (exportDiagnosisBtn) exportDiagnosisBtn.onclick = exportDiagnosisSummary;
  if (exportAuditLogBtn) exportAuditLogBtn.onclick = exportAuditLog;
}

function getLocalSnapshotTime() {
  try {
    var raw = localStorage.getItem(LOCAL_SNAPSHOT_KEY);
    if (!raw) return "无";
    var parsed = JSON.parse(raw);
    return parsed.savedAt || "无";
  } catch (_) { return "无"; }
}


function getDailyBackupTime() {
  try {
    var date = localDateKey();
    var raw = localStorage.getItem(DAILY_BACKUP_PREFIX + date);
    if (!raw) return "无";
    var parsed = JSON.parse(raw);
    return parsed.savedAt || "无";
  } catch (_) { return "无"; }
}


function renderUnitSelectOptions(book, words) {
  const options = [];
  if (state.settings.queueMode === "unknown") {
    const allCount = unknownWordsForScope(book.id, words, { scope: "book" }).length;
    options.push(`<option value="all" ${state.settings.unknownScope === "book" ? "selected" : ""}>整本词书 · 重难点 ${allCount} 个</option>`);
  }
  Array.from({ length: book.totalUnits }, (_, index) => index + 1).forEach((unit) => {
    const label = state.settings.queueMode === "unknown"
      ? unknownUnitOptionLabel(book, unit, words)
      : unitOptionLabel(book, unit, words);
    const selected = state.settings.unknownScope !== "book" && unit === state.settings.unit;
    options.push(`<option value="${unit}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`);
  });
  return options.join("");
}


function unitOptionLabel(book, unit, words) {
  const info = unitProgressInfo(book, unit, words);
  const progress = info.total ? `${info.seen}/${info.total}` : "加载中";
  return `${unitDisplayLabel(book, unit)} · 进度 ${progress} · 完整看完 ${info.completed} 次`;
}


function unknownUnitOptionLabel(book, unit, words) {
  const count = unknownWordsForScope(book.id, words, { scope: "unit", unit }).length;
  return `${unitDisplayLabel(book, unit)} · 重难点 ${count} 个`;
}


function renderSelectedUnitStats(book, words) {
  if (state.settings.queueMode === "unknown") {
    const scope = currentUnknownScope();
    const items = unknownWordsForScope(book.id, words, scope);
    const progress = loadUnknownProgress(book.id, scope);
    const lastWordId = Number(progress.lastWordId);
    const index = items.findIndex((word) => Number(word.id) === lastWordId);
    const seen = index >= 0 ? index + 1 : 0;
    const label = scope.scope === "book" ? "整本词书重难点" : `${unitDisplayLabel(book, scope.unit)} 重难点`;
    return `<div class="status">当前 ${escapeHtml(label)}：${items.length} 个 · 恢复进度 ${seen}/${items.length || 0}</div>`;
  }
  const info = unitProgressInfo(book, state.settings.unit, words);
  const progress = info.total ? `${info.seen}/${info.total}` : "正在读取词表";
  return `<div class="status">当前 ${escapeHtml(unitDisplayLabel(book, state.settings.unit))}：进度 ${escapeHtml(progress)} · 完整看完 ${info.completed} 次</div>`;
}


function radio(name, value, label) {
  return `
    <label class="radio-option">
      <input type="radio" name="${name}" value="${value}" ${state.settings[name] === value ? "checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}


function toggle(key, label, checked) {
  return `
    <label class="toggle-option">
      <input type="checkbox" id="${key}" ${checked ? "checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}


function rateRangeControl() {
  const rate = playbackRate();
  return rangeControl("rateInput", "朗读倍速", rate, "x", PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX, PLAYBACK_RATE_STEP, formatRate(rate));
}


function rangeControl(id, label, value, unit, min, max, step, displayValue = value) {
  return `
    <div class="control-row">
      <div class="control-head">
        <span>${escapeHtml(label)}</span>
        <span class="control-value" id="${id}Value">${escapeHtml(displayValue)}${escapeHtml(unit)}</span>
      </div>
      <input class="range" id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${escapeHtml(label)}">
    </div>
  `;
}


