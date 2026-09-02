"use strict";

function setupStatusFallbackText() {
  try { return "词库文件：" + currentBook().csv; }
  catch (_) { return "词库文件正在准备"; }
}

function updateSetupStatusElement() {
  var status = document.getElementById("setupStatusBox");
  if (!status) return false;
  var current = state.setupStatus;
  status.textContent = current ? current.message : setupStatusFallbackText();
  status.className = "status" + (current && current.type ? " status--" + current.type : "");
  return true;
}

function updateStudyStartButton() {
  var button = document.getElementById("startBtn");
  if (!button) return false;
  button.disabled = state.studyStartPending === true;
  button.textContent = state.studyStartPending ? "正在开始…" : "开始刷词";
  button.setAttribute("aria-busy", state.studyStartPending ? "true" : "false");
  return true;
}

function setSetupStatus(message, type = "") {
  state.setupStatus = message ? { message, type } : "";
  if (state.view !== "setup") return;
  if (!updateSetupStatusElement()) renderSetup();
  else updateStudyStartButton();
}


function isAuthenticated() {
  try { return localStorage.getItem(AUTH_KEY) === "true"; }
  catch (_) { return false; }
}

// ── Hash sync state migration ──────────────────────────────────────
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
      if (safeSetLocalStorage(AUTH_KEY, "true", { priority: "auth" })) {
        Promise.resolve(enterStudyOnLaunch({ reason: "auth_success" }))
          .then(function() { return initializeSync({ reason: "auth_success" }); })
          .catch(function(error) {
            appendAuditEvent({ type: "sync:auth_init_failed", message: String(error && error.message || error || "") });
          });
      } else {
        var status = form.querySelector(".status");
        if (status) {
          status.textContent = "浏览器无法保存登录状态，请检查站点存储权限或空间。";
          status.className = "status status--error";
        }
      }
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
    ? `<div class="status ${state.setupStatus.type ? `status--${state.setupStatus.type}` : ""}" id="setupStatusBox">${escapeHtml(state.setupStatus.message)}</div>`
    : `<div class="status" id="setupStatusBox">词库文件：${escapeHtml(book.csv)}</div>`;
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

      <div class="setup-launchbar">
        <button class="btn btn--primary btn--wide setup-start-btn" id="startBtn" type="button" ${state.studyStartPending ? "disabled" : ""} aria-busy="${state.studyStartPending ? "true" : "false"}">${state.studyStartPending ? "正在开始…" : "开始刷词"}</button>
      </div>

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
            <div class="${state.settings.manualZhReveal ? "control-row control-row--disabled" : "control-row"}" id="zhDelayControl">
              <div class="control-head">
                <span>中文出现延迟</span>
                <span class="control-value" id="zhDelayInputValue">${escapeHtml(state.settings.zhDelay)}ms</span>
              </div>
              <input class="range" id="zhDelayInput" type="range" min="${ZH_DELAY_MIN}" max="${ZH_DELAY_MAX}" step="50" value="${state.settings.zhDelay}" aria-label="中文出现延迟" ${state.settings.manualZhReveal ? "disabled" : ""}>
            </div>
            <div class="toggle-grid">
              ${toggle("manualZhReveal", "手动显示中文", state.settings.manualZhReveal)}
            </div>
            <div class="status">开启“手动显示中文”后，延迟设置失效；当前词会停在英文，点击卡片或右侧区域才显示中文。</div>
            ${rangeControl("retentionPauseInput", "读后停留", state.settings.retentionPause, "ms", RETENTION_PAUSE_MIN, RETENTION_PAUSE_MAX, RETENTION_PAUSE_STEP)}
            <div class="toggle-grid">
              ${toggle("manualMode", "手动模式", state.settings.manualMode)}
            </div>
            <div class="status">朗读倍速只影响中英文读音；读前停留和读后停留均为绝对时间。</div>
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
              ${toggle("preferStandardAudio", "优先标准美式音频", state.settings.preferStandardAudio !== false)}
            </div>
            <div class="status" id="pronunciationAudioStatus">${escapeHtml(state.pronunciationCacheStatus || (typeof pronunciationAudioStatusText === "function" ? pronunciationAudioStatusText() : "标准美音失败时自动回退设备语音。"))}</div>
            <div class="audio-cache-actions">
              <button class="btn btn--ghost" id="cachePronunciationUnitBtn" type="button" ${state.settings.preferStandardAudio === false ? "disabled" : ""}>缓存当前 Unit 读音</button>
              <button class="btn btn--ghost" id="clearPronunciationCacheBtn" type="button">清理读音缓存</button>
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
            <div class="toggle-grid">
              ${toggle("autoSyncEnabled", "自动同步", state.settings.autoSyncEnabled !== false)}
            </div>
            <div class="status" id="autoSyncModeStatus">${state.settings.autoSyncEnabled !== false
              ? "自动同步已开启：沿用当前安全合并、后台重试和多设备同步逻辑。"
              : "自动同步已关闭：学习数据只保存在当前浏览器；需要时点击下方按钮手动安全同步。"}</div>
            <div class="manual-sync-controls" id="manualSyncControls" ${state.settings.autoSyncEnabled !== false ? "hidden" : ""}>
              <button class="btn btn--primary btn--wide" id="manualSyncBtn" type="button" ${state.isSyncing ? "disabled" : ""}>${state.isSyncing ? "同步中…" : "手动同步到云端（先安全合并）"}</button>
            </div>
            <div class="sync-grid">
              <label class="field-label">
                GitHub PAT
                <span class="secret-input-wrap">
                  <input class="input" id="tokenInput" type="password" value="${escapeHtml(state.cloudConfigDraft.token || state.cloud.token)}" autocomplete="off" spellcheck="false" placeholder="ghp_ 或 github_pat_ 开头">
                  <button class="btn btn--ghost secret-input-toggle" id="toggleTokenVisibilityBtn" type="button" aria-label="显示或隐藏 PAT">显示</button>
                </span>
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
  var statusLabel = SYNC_STATUS_LABELS[info.status] || "同步状态未知";
  var statusColor = SYNC_STATUS_COLORS[info.status] || "#94a3b8";
  var lastSuccessAt = [syncState.lastSuccessfulPushAt, syncState.lastSuccessfulPullAt, meta.lastSuccessfulPushAt, meta.lastSuccessfulPullAt]
    .filter(Boolean)
    .sort(function(a, b) { return (Date.parse(b) || 0) - (Date.parse(a) || 0); })[0] || "";
  var retryAtMs = Date.parse(syncState.nextRetryAt || "");
  var retryText = state.settings.autoSyncEnabled === false
    ? "已关闭"
    : (Number.isFinite(retryAtMs) && retryAtMs > Date.now() ? formatLocalDateTime(syncState.nextRetryAt) : "无等待");
  var syncAge = state.isSyncing && state.syncStartedAt ? Math.floor((Date.now() - state.syncStartedAt) / 1000) : 0;
  var lines = [];

  lines.push('<div class="settings-panel settings-panel--span4 sync-overview-panel" data-cloud-sync-diagnostics>');
  lines.push('<div class="sync-overview" data-status="' + escapeHtml(info.status) + '">');
  lines.push('<div class="sync-overview__header">');
  lines.push('<span class="sync-overview__dot" style="--sync-color:' + statusColor + '"></span>');
  lines.push('<div><strong>' + escapeHtml(statusLabel) + '</strong><p>' + escapeHtml(info.detail || "") + '</p></div>');
  lines.push('</div>');
  lines.push('<div class="sync-overview__meta">');
  lines.push('<span>本地数据：已保存</span>');
  lines.push('<span>最近成功：' + escapeHtml(formatLocalDateTime(lastSuccessAt)) + '</span>');
  lines.push('<span>自动重试：' + escapeHtml(retryText) + '</span>');
  lines.push('</div>');
  lines.push('<div class="sync-overview__actions">');
  if (state.settings.autoSyncEnabled !== false) {
    lines.push('<button class="btn btn--primary" id="syncNowBtn" type="button"' + (state.isSyncing ? ' disabled' : '') + '>' + (state.isSyncing ? '同步中…' : '立即同步') + '</button>');
  }
  lines.push('<button class="btn btn--ghost" id="exportSupportBundleBtn" type="button">导出排查包</button>');
  lines.push('</div>');
  lines.push('</div>');

  lines.push('<details class="sync-diagnostics-details">');
  lines.push('<summary>高级诊断与备份</summary>');
  lines.push('<div class="sync-diagnostics-grid">');
  lines.push('<div>应用版本：' + escapeHtml(APP_VERSION) + '</div>');
  lines.push('<div>服务器版本：' + escapeHtml(state.versionInfo && state.versionInfo.serverVersion || "未检查") + '</div>');
  lines.push('<div>Gist ID：' + escapeHtml(gistDisplay || "未设置") + '</div>');
  lines.push('<div>PAT 配置：' + (cloud.ok ? '格式通过' : escapeHtml(cloud.errors.join("；"))) + '</div>');
  lines.push('<div>云端写入：' + (meta.readOnlyMode ? '只读/不可写' : (meta.cloudWritable ? '已确认可写' : '尚未确认')) + '</div>');
  lines.push('<div>当前同步：' + (state.isSyncing ? '是（' + syncAge + ' 秒）' : '否') + '</div>');
  lines.push('<div>本地 dirty：' + String(syncState.localDirty) + '；有效 dirty：' + String(facts.effectiveDirty) + '</div>');
  lines.push('<div>base hash：' + escapeHtml(shortHash(syncState.baseRemoteHash)) + '；local hash：' + escapeHtml(shortHash(facts.localPayloadHash)) + '</div>');
  lines.push('<div>最近 Push：' + escapeHtml(formatLocalDateTime(syncState.lastSuccessfulPushAt || meta.lastSuccessfulPushAt)) + '</div>');
  lines.push('<div>最近 Pull：' + escapeHtml(formatLocalDateTime(syncState.lastSuccessfulPullAt || meta.lastSuccessfulPullAt)) + '</div>');
  lines.push('<div>连续失败：' + syncState.consecutiveSyncFailures + '；下次重试：' + escapeHtml(formatLocalDateTime(syncState.nextRetryAt)) + '</div>');
  lines.push('<div>最近错误类型：' + escapeHtml(syncState.lastErrorKind || "无") + '</div>');
  lines.push('<div>错误阶段/方式：' + escapeHtml((syncState.lastErrorStage || "无") + ' / ' + (syncState.lastErrorTransport || "无")) + '</div>');
  lines.push('<div>HTTP 状态：' + escapeHtml(String(syncState.lastErrorHttpStatus || 0)) + '</div>');
  lines.push('<div class="sync-diagnostics-grid__wide">最近错误：' + escapeHtml(syncState.lastSyncError || meta.lastSyncErrorMessage || "无") + '</div>');
  if (syncState.lastErrorTechnical) lines.push('<div class="sync-diagnostics-grid__wide"><code>' + escapeHtml(syncState.lastErrorTechnical.slice(0, 1200)) + '</code></div>');
  lines.push('<div>本地备份：' + backups.length + ' 条；最新快照：' + escapeHtml(getLocalSnapshotTime()) + '</div>');
  lines.push('<div>今日备份：' + escapeHtml(getDailyBackupTime()) + '</div>');
  if (opsCount > 0) lines.push('<div class="sync-diagnostics-grid__wide">旧版兼容操作记录：' + opsCount + ' 条（仅用于旧数据读取，不参与当前同步）</div>');
  if (syncState.lastBackupError) lines.push('<div class="sync-diagnostics-grid__wide">备份写入错误：' + escapeHtml(syncState.lastBackupError) + '</div>');
  lines.push('</div>');
  lines.push('<div class="sync-diagnostics-actions">');
  lines.push('<button class="btn btn--ghost" id="exportBackupBtn" type="button">导出本地备份</button>');
  lines.push('<button class="btn btn--ghost" id="exportDiagnosisBtn" type="button">导出诊断摘要</button>');
  lines.push('<button class="btn btn--ghost" id="exportAuditLogBtn" type="button">导出运行日志</button>');
  lines.push('</div>');
  lines.push('</details>');
  lines.push('</div>');
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
  var exportSupportBundleBtn = document.getElementById("exportSupportBundleBtn");
  var syncNowBtn = document.getElementById("syncNowBtn");

  if (exportBackupBtn) exportBackupBtn.onclick = exportLocalBackup;
  if (exportDiagnosisBtn) exportDiagnosisBtn.onclick = exportDiagnosisSummary;
  if (exportAuditLogBtn) exportAuditLogBtn.onclick = exportAuditLog;
  if (exportSupportBundleBtn) exportSupportBundleBtn.onclick = exportSupportBundle;
  if (syncNowBtn) syncNowBtn.onclick = function() { syncTick({ reason: "manual_retry", bypassBackoff: true }); };
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


