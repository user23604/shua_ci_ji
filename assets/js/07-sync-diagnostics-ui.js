"use strict";

function showSyncFailureBanner(title, detail, options) {
  if (isStaleSyncRun(options && options.runId)) return;
  var now = Date.now();
  var key = (title || "") + "|" + (detail || "");
  // 相同错误 60s 内不重复
  if (key === state.lastSyncBannerKey && now - state.lastSyncBannerAt < 60000) return;
  state.lastSyncBannerKey = key;
  state.lastSyncBannerAt = now;

  var banner = document.getElementById("sync-failure-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "sync-failure-banner";
    banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#b42318;color:#fff;padding:10px 16px;font-size:14px;line-height:1.5;text-align:center;transform:translateY(-100%);transition:transform 0.25s ease;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
    banner.innerHTML = '<span class="sync-failure-title" style="font-weight:700;"></span><span class="sync-failure-detail" style="margin-left:8px;opacity:0.85;"></span>';
    document.body.appendChild(banner);
  }
  banner.querySelector(".sync-failure-title").textContent = title || "同步失败";
  banner.querySelector(".sync-failure-detail").textContent = detail ? String(detail).slice(0, 160) : "请检查网络、Token 或 Gist 权限。";
  banner.style.transform = "translateY(0)";
  setTimeout(function() {
    banner.style.transform = "translateY(-100%)";
  }, (options && options.durationMs) || 2200);
}

function makeSyncProblemKey(problem) {
  return [problem.severity || "", problem.code || "", problem.title || "", problem.message || ""].join("|").slice(0, 500);
}


function maskTokenForDiagnosis(token) {
  const t = String(token || "").trim();
  if (!t) return "未设置";
  const prefix = t.startsWith("github_pat_") ? "github_pat" : (t.slice(0, 4) === "ghp_" ? "ghp" : "unknown");
  const bucket = t.length < 40 ? "<40" : (t.length <= 80 ? "40-80" : (t.length <= 120 ? "80-120" : ">120"));
  return prefix + " · 长度 " + bucket + " · " + t.slice(0, Math.min(10, t.length)) + "****" + t.slice(-4);
}


function maskGistId(gistId) {
  const g = String(gistId || "").trim();
  return g ? g.slice(0, 4) + "…" + g.slice(-4) : "未设置";
}


function backupCandidateSummaryText(candidates) {
  const list = Array.isArray(candidates) ? candidates : (typeof collectBackupCandidates === "function" ? collectBackupCandidates().map(function(item) { return classifyBackupCandidate(item.key, item.raw, item.meta); }) : []);
  if (!list.length) return "无";
  return list.slice(0, 8).map(function(c) {
    return [c.kind || "?", c.key || "?", c.nonEmpty ? "nonEmpty" : "empty", c.reason || ""].filter(Boolean).join(" ");
  }).join("；");
}


function buildSyncDiagnosisText(extra = {}) {
  const meta = ensureSyncMeta(state.syncMeta);
  const syncState = ensureHashSyncState(state.syncHashState);
  const facts = currentSyncFacts({ persistHash: false });
  const info = computeSyncStatus();
  const config = validateSavedCloudConfig(state.cloud);
  const versionInfo = state.versionInfo || {};
  const lines = [];
  lines.push("刷词机同步诊断摘要");
  lines.push("================================");
  lines.push("导出时间：" + new Date().toISOString());
  lines.push("应用版本：" + APP_VERSION);
  lines.push("Build ID：" + APP_BUILD_ID);
  lines.push("服务器 version.json：" + (versionInfo.serverVersion || "未检查") + (versionInfo.serverBuildId ? " / " + versionInfo.serverBuildId : ""));
  lines.push("最近版本检查时间：" + (versionInfo.checkedAt || "无"));
  lines.push("页面地址：" + (location && location.href || ""));
  lines.push("User Agent：" + (navigator && navigator.userAgent || ""));
  lines.push("同步状态：" + info.status + " - " + (info.detail || ""));
  lines.push("syncRunId：" + state.syncRunId);
  lines.push("syncRunSeq：" + state.syncRunSeq);
  lines.push("syncStartedAt：" + (state.syncStartedAt ? new Date(state.syncStartedAt).toISOString() : "无"));
  lines.push("syncLastProgressStage：" + (state.syncLastProgressStage || "无"));
  lines.push("当前是否同步中：" + (state.isSyncing ? "是" : "否"));
  lines.push("Gist ID：" + maskGistId(state.cloud.gistId));
  lines.push("PAT 格式：" + (config.ok ? "通过" : "失败：" + config.errors.join("；")));
  lines.push("PAT 脱敏：" + maskTokenForDiagnosis(state.cloud.token));
  lines.push("云端可读：" + (meta.lastRemoteVersion || meta.lastRemoteUpdatedAt ? "是" : "未确认"));
  lines.push("云端可写：" + (meta.cloudWritable ? "是" : "未验证"));
  lines.push("只读模式：" + (meta.readOnlyMode ? "是" : "否"));
  lines.push("localRecoveryRequired：" + syncState.localRecoveryRequired);
  lines.push("localDirty：" + syncState.localDirty);
  lines.push("effectiveDirty：" + facts.effectiveDirty);
  lines.push("baseRemoteHash：" + (syncState.baseRemoteHash || "无"));
  lines.push("localPayloadHash：" + (facts.localPayloadHash || "无"));
  lines.push("dirtySince：" + (syncState.dirtySince || "无"));
  lines.push("最近成功 Push：" + (syncState.lastSuccessfulPushAt || meta.lastSuccessfulPushAt || "无"));
  lines.push("最近成功 Pull：" + (syncState.lastSuccessfulPullAt || meta.lastSuccessfulPullAt || "无"));
  lines.push("最近尝试同步：" + (meta.lastSyncAttemptAt || "无"));
  lines.push("最近错误时间：" + (meta.lastSyncErrorAt || "无"));
  lines.push("最近错误全文：" + (syncState.lastSyncError || meta.lastSyncErrorMessage || "无"));
  lines.push("lastRemoteVersion：" + (meta.lastRemoteVersion || "无"));
  lines.push("lastSyncedPayloadHash：" + (meta.lastSyncedPayloadHash || "无"));
  lines.push("备份索引数量：" + loadHashBackupIndex().length);
  lines.push("备份候选摘要：" + backupCandidateSummaryText(extra.candidates));
  lines.push("当前业务数据摘要：progress=" + countProgressRecords(facts.payload) + ", marks=" + countMarkedRecords(facts.payload) + ", activityDays=" + countActivityRecords(facts.payload) + ", studyState=" + countUserStudyStateRecords(facts.payload));
  if (extra.remoteSummary) lines.push("云端数据摘要：" + extra.remoteSummary);
  if (extra.code) lines.push("错误代码：" + extra.code);
  if (extra.technical) lines.push("技术细节：" + extra.technical);
  return lines.join("\n");
}


function showSyncProblemDialog(problem) {
  problem = problem || {};
  if (isStaleSyncRun(problem.runId)) return false;
  const key = makeSyncProblemKey(problem);
  const now = Date.now();
  if (state.activeSyncProblemDialogKey === key) return false;
  if (state.dismissedSyncProblemDialogKeys && state.dismissedSyncProblemDialogKeys[key] && now - state.dismissedSyncProblemDialogKeys[key] < 600000 && !problem.force) return false;
  state.activeSyncProblemDialogKey = key;
  state.lastSyncProblemDialogKey = key;
  state.lastSyncProblemDialogShownAt = now;
  var existing = document.getElementById("sync-problem-dialog");
  if (existing) existing.remove();
  var dialog = document.createElement("div");
  dialog.id = "sync-problem-dialog";
  dialog.className = "sync-problem-dialog";
  var diagnosis = buildSyncDiagnosisText({ code: problem.code, technical: problem.technical, candidates: problem.candidates, remoteSummary: problem.remoteSummary });
  dialog.innerHTML = `
    <div class="sync-problem-dialog__panel" role="dialog" aria-modal="true">
      <div class="sync-problem-dialog__header">
        <strong>${escapeHtml(problem.title || "同步出现问题")}</strong>
        <span>${escapeHtml(problem.code || problem.severity || "SYNC_PROBLEM")}</span>
      </div>
      <div class="sync-problem-dialog__body">
        <p>${escapeHtml(problem.message || "同步未能完成。为避免数据风险，当前不会显示云端已保存。")}</p>
        ${problem.technical ? `<pre>${escapeHtml(String(problem.technical)).slice(0, 1200)}</pre>` : ""}
        <textarea readonly>${escapeHtml(diagnosis)}</textarea>
      </div>
      <div class="sync-problem-dialog__actions">
        <button class="btn btn--ghost" data-sync-dialog-action="copy" type="button">复制诊断信息</button>
        <button class="btn btn--ghost" data-sync-dialog-action="retry" type="button">重新同步一次</button>
        <button class="btn btn--ghost" data-sync-dialog-action="rescue" type="button">打开 rescue.html</button>
        ${problem.refreshVersion ? '<button class="btn btn--primary" data-sync-dialog-action="refresh" type="button">刷新到新版</button>' : ""}
        ${problem.allowRemoteRestore ? '<button class="btn btn--primary" data-sync-dialog-action="remote_restore" type="button">从云端恢复到本机</button>' : ""}
        ${problem.allowIgnoreEmptyBackup ? '<button class="btn btn--ghost" data-sync-dialog-action="ignore_empty_backup" type="button">忽略空备份并继续同步</button>' : ""}
        <button class="btn btn--primary" data-sync-dialog-action="dismiss" type="button">知道了</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener("click", function(event) {
    const action = event.target && event.target.getAttribute && event.target.getAttribute("data-sync-dialog-action");
    if (!action) return;
    if (action === "copy") copyTextToClipboard(diagnosis).catch(function() {});
    if (action === "retry") {
      state.dismissedSyncProblemDialogKeys[key] = 0;
      closeSyncProblemDialog(key);
      syncTick({ reason: "manual_retry", bypassBackoff: true });
    }
    if (action === "rescue") window.open("rescue.html", "_blank");
    if (action === "refresh") refreshToServerVersion(problem.serverVersion || (state.versionInfo && state.versionInfo.serverVersion) || APP_VERSION);
    if (action === "remote_restore" && problem.remotePayload && problem.remoteHash) {
      closeSyncProblemDialog(key);
      restoreRemotePayloadFromDialog(problem.remotePayload, problem.remoteHash, problem.remote || null);
    }
    if (action === "ignore_empty_backup") {
      clearLocalRecoveryLock("用户确认忽略空备份并继续同步");
      closeSyncProblemDialog(key);
      syncTick({ reason: "ignore_empty_backup", bypassBackoff: true });
    }
    if (action === "dismiss") closeSyncProblemDialog(key);
  });
  return true;
}


function closeSyncProblemDialog(key) {
  var dialog = document.getElementById("sync-problem-dialog");
  if (dialog) dialog.remove();
  if (key) state.dismissedSyncProblemDialogKeys[key] = Date.now();
  state.activeSyncProblemDialogKey = null;
}

function renderSyncIndicator() {
  // 指示器由 updateSyncIndicatorDOM() 管理，挂载在 document.body 上
  // 这里只触发一次 DOM 创建，后续 render 视图时指示器不受 #app overflow:hidden 影响
  updateSyncIndicator();
  return "";
}


function formatSyncTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch (_) { return ""; }
}


function setSyncStatus(status) {
  // P0: 只有 syncing 是临时状态，其他都是持久事实状态
  // 此函数仅供 syncing 状态使用；其他状态由 updateSyncIndicator() 通过 computeSyncStatus() 管理
  if (status === "syncing") {
    state.syncStatus = "syncing";
    updateSyncIndicatorDOM({ status: "syncing", detail: "" });
    return;
  }
  // 其他状态一律通过 updateSyncIndicator() 计算
  updateSyncIndicator();
}


function updateSyncIndicator() {
  const info = computeSyncStatus();
  state.syncStatus = info.status;
  updateSyncIndicatorDOM(info);
}


function updateSyncIndicatorDOM(info) {
  const label = SYNC_STATUS_LABELS[info.status] || "";
  const color = SYNC_STATUS_COLORS[info.status] || "#94a3b8";
  const timeText = info.status === "cloud_saved" && state.syncMeta.lastCloudSaveConfirmedAt
    ? formatSyncTime(state.syncMeta.lastCloudSaveConfirmedAt)
    : "";
  var indicator = document.getElementById("cloudSyncIndicator");
  // 确保指示器挂在 body 上，不被 #app 的 overflow:hidden 裁剪
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "cloudSyncIndicator";
    indicator.innerHTML = '<span class="cloud-sync-indicator__dot"></span><span class="cloud-sync-indicator__label"></span><span class="cloud-sync-indicator__time"></span>';
    document.body.appendChild(indicator);
  }
  indicator.className = "cloud-sync-indicator is-" + info.status;
  indicator.style.setProperty("--sync-color", color);
  var dot = indicator.querySelector(".cloud-sync-indicator__dot");
  if (dot) dot.style.backgroundColor = color;
  var labelEl = indicator.querySelector(".cloud-sync-indicator__label");
  if (labelEl) labelEl.textContent = label;
  var timeEl = indicator.querySelector(".cloud-sync-indicator__time");
  if (timeEl) {
    if (timeText) { timeEl.textContent = timeText; timeEl.style.display = ""; }
    else timeEl.style.display = "none";
  }
}


function normalizeSyncStatus(status) {
  return Object.prototype.hasOwnProperty.call(SYNC_STATUS_LABELS, status) ? status : "unconfigured";
}


function renderVersionBadge() {
  var badge = document.getElementById("app-version-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "app-version-badge";
    badge.className = "app-version-badge";
    document.body.appendChild(badge);
  }
  const info = state.versionInfo || {};
  const latest = !info.serverVersion || info.serverVersion === APP_VERSION;
  badge.textContent = "版本 " + APP_VERSION + " · " + (latest ? "最新" : "发现新版");
  badge.className = "app-version-badge" + (latest ? "" : " is-stale");
}


function refreshToServerVersion(serverVersion) {
  const version = serverVersion || APP_VERSION;
  location.href = location.pathname + "?app_v=" + encodeURIComponent(version) + "&reload=" + Date.now();
}


