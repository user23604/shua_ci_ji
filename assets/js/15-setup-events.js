"use strict";

async function testAndSaveCloudConfig() {
  var tokenInput = document.getElementById("tokenInput");
  var gistInput = document.getElementById("gistInput");
  var statusEl = document.getElementById("cloudConfigStatus");
  var draft = {
    token: tokenInput ? tokenInput.value.trim() : state.cloudConfigDraft.token,
    gistId: gistInput ? gistInput.value.trim() : state.cloudConfigDraft.gistId
  };

  state.cloudConfigDraft = draft;

  var validation = validateCloudConfigDraft(draft);
  if (!validation.ok) {
    if (statusEl) {
      statusEl.textContent = validation.errors.join("；");
      statusEl.className = "status status--error";
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = "正在测试连接…";
    statusEl.className = "status";
  }

  // Step 1: GET Gist
  var getUrl = "https://api.github.com/gists/" + encodeURIComponent(draft.gistId);
  var getResponse;
  try {
    getResponse = await fetchWithTimeout(getUrl, {
      headers: { Authorization: "Bearer " + draft.token, Accept: "application/vnd.github+json" }
    }, GITHUB_GET_TIMEOUT_MS);
  } catch (e) {
    if (statusEl) { statusEl.textContent = "网络错误：无法访问 GitHub。"; statusEl.className = "status status--error"; }
    return;
  }

  if (getResponse.status === 401 || getResponse.status === 403) {
    // 尝试公开访问
    var publicResp = await fetchWithTimeout(getUrl, { headers: { Accept: "application/vnd.github+json" } }, GITHUB_GET_TIMEOUT_MS).catch(function() { return null; });
    if (publicResp && publicResp.ok) {
      if (statusEl) { statusEl.textContent = "❌ PAT 无效，但 Gist 是公开的——只能读取，无法上传。请重新生成有 Gist 写入权限的 PAT。"; statusEl.className = "status status--error"; }
    } else {
      if (statusEl) { statusEl.textContent = "❌ PAT 无效、已过期或没有此 Gist 的访问权限。"; statusEl.className = "status status--error"; }
    }
    return;
  }

  if (!getResponse.ok) {
    if (statusEl) { statusEl.textContent = "❌ 无法访问 Gist：HTTP " + getResponse.status; statusEl.className = "status status--error"; }
    return;
  }

  // Step 2: PATCH healthcheck to test write permission
  var patchResponse;
  try {
    patchResponse = await fetchWithTimeout(getUrl, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + draft.token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          [SYNC_HEALTHCHECK_FILE_NAME]: {
            content: "sync probe at " + beijingISOString() + " clientId=" + ensureSyncMeta().clientId
          }
        }
      })
    }, GITHUB_PATCH_TIMEOUT_MS);
  } catch (e) {
    if (statusEl) { statusEl.textContent = "❌ 写权限测试网络错误。"; statusEl.className = "status status--error"; }
    return;
  }

  if (!patchResponse.ok) {
    if (patchResponse.status === 403) {
      if (statusEl) { statusEl.textContent = "❌ PAT 没有 Gist 写入权限（只能读）。请更新 PAT 权限范围。"; statusEl.className = "status status--error"; }
    } else {
      if (statusEl) { statusEl.textContent = "❌ 写权限测试失败：HTTP " + patchResponse.status; statusEl.className = "status status--error"; }
    }
    return;
  }

  // Success: healthcheck only proves write permission. It must not mark the
  // business snapshot as cloud_saved.
  state.cloud.token = draft.token;
  state.cloud.gistId = draft.gistId;
  persistCloud();
  resetSyncMetaForGist(draft.gistId);
  state.syncMeta.cloudWritable = true;
  state.syncMeta.readOnlyMode = false;
  state.syncMeta.lastSyncErrorAt = "";
  state.syncMeta.lastSyncErrorMessage = "";
  state.consecutivePushFailures = 0;
  persistSyncMeta();
  const local = refreshLocalPayloadHash({ persist: false });
  state.syncHashState = ensureHashSyncState({
    ...DEFAULT_HASH_SYNC_STATE,
    localPayloadHash: local.hash,
    localDirty: hasBusinessData(local.payload),
    dirtySince: hasBusinessData(local.payload) ? beijingISOString() : "",
    lastSyncStatus: hasBusinessData(local.payload) ? "dirty" : "local_only"
  });
  persistHashSyncState();
  updateSyncIndicator();
  if (statusEl) { statusEl.textContent = "配置保存成功，已确认 Gist 可写；业务数据将在后台安全同步。"; statusEl.className = "status status--ok"; }

  syncTick({ reason: "config_saved", bypassBackoff: true });
}


function bindSetupEvents() {
  const bookSelect = document.getElementById("bookSelect");
  const unitSelect = document.getElementById("unitSelect");
  const startBtn = document.getElementById("startBtn");
  const statsBtn = document.getElementById("statsBtn");
  const archiveBtn = document.getElementById("archiveBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const tokenInput = document.getElementById("tokenInput");
  const gistInput = document.getElementById("gistInput");

  bookSelect.addEventListener("change", () => {
    rememberCurrentBookSettings();
    restoreBookSettings(bookSelect.value);
    persistSettings();
    state.setupStatus = "";
    renderSetup();
  });

  unitSelect.addEventListener("change", () => {
    if (unitSelect.value === "all") {
      state.settings.unknownScope = "book";
    } else {
      state.settings.unknownScope = "unit";
      state.settings.unit = Number(unitSelect.value);
    }
    persistSettings();
    renderSetup();
  });

  const unknownMode = document.getElementById("unknownMode");
  if (unknownMode) {
    unknownMode.addEventListener("change", () => {
      state.settings.queueMode = unknownMode.checked ? "unknown" : "main";
      if (!unknownMode.checked) state.settings.unknownScope = "unit";
      persistSettings();
      renderSetup();
    });
  }

  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.settings.mode = input.value;
      persistSettings();
    });
  });

  if (document.getElementById("summaryCount")) bindRange("summaryCount", "summaryCount", "个", Number);
  bindRange("preReadDelayInput", "preReadDelay", "ms", Number);
  bindRange("zhDelayInput", "zhDelay", "ms", Number);
  bindRange("retentionPauseInput", "retentionPause", "ms", Number);
  bindRange("rateInput", "rate", "x", Number, formatRate);
  bindCheckbox("speakEn", "speakEn");
  bindCheckbox("speakZh", "speakZh");
  bindCheckbox("manualMode", "manualMode");
  bindCheckbox("highOnly", "highOnly");

  document.getElementById("summaryMode").addEventListener("change", (event) => {
    state.settings.summaryMode = event.target.value;
    persistSettings();
    renderSetup();
  });

  // token/gist input 只更新 draft，不自动保存和同步
  tokenInput.addEventListener("input", function() {
    state.cloudConfigDraft.token = tokenInput.value.trim();
  });

  gistInput.addEventListener("input", function() {
    state.cloudConfigDraft.gistId = gistInput.value.trim();
  });

  // 初始化 draft 值
  state.cloudConfigDraft.token = state.cloud.token || "";
  state.cloudConfigDraft.gistId = state.cloud.gistId || "";
  if (tokenInput) tokenInput.value = state.cloudConfigDraft.token;
  if (gistInput) gistInput.value = state.cloudConfigDraft.gistId;

  // 新增"测试并保存"按钮事件
  var testSaveBtn = document.getElementById("testSaveCloudBtn");
  if (testSaveBtn) {
    testSaveBtn.addEventListener("click", function() {
      testAndSaveCloudConfig();
    });
  }

  startBtn.addEventListener("click", startStudy);
  statsBtn.addEventListener("click", openStats);
  archiveBtn.addEventListener("click", openArchive);
  logoutBtn.addEventListener("click", function() {
    localStorage.removeItem(AUTH_KEY);
    renderAuth();
  });

  // 导出按钮
  var exportBackupBtn = document.getElementById("exportBackupBtn");
  var exportDiagnosisBtn = document.getElementById("exportDiagnosisBtn");
  var exportAuditLogBtn = document.getElementById("exportAuditLogBtn");
  if (exportBackupBtn) exportBackupBtn.addEventListener("click", exportLocalBackup);
  if (exportDiagnosisBtn) exportDiagnosisBtn.addEventListener("click", exportDiagnosisSummary);
  if (exportAuditLogBtn) exportAuditLogBtn.addEventListener("click", exportAuditLog);
}


function exportLocalBackup() {
  var payload = normalizeSyncPayload(collectSyncPayload());
  var meta = ensureSyncMeta(state.syncMeta);
  var bundle = {
    exportedAt: beijingISOString(),
    appVersion: APP_VERSION,
    pendingOpsCount: getPendingOps().length,
    syncMeta: meta,
    payload: payload
  };
  var json = JSON.stringify(bundle, null, 2);
  var blob = new Blob([json], { type: "application/json;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var stamp = beijingISOString().replace(/[:.]/g, "-");
  var a = document.createElement("a");
  a.href = url;
  a.download = "shua-ci-ji-backup-" + stamp + ".json";
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
}


function exportDiagnosisSummary() {
  var text = buildSyncDiagnosisText();
  copyTextToClipboard(text).then(function() {
    alert("诊断摘要已复制到剪贴板。");
  }).catch(function() {
    alert("诊断摘要复制失败，请在同步错误弹窗中手动选择文本复制。");
  });
}

function exportAuditLog() {
  try {
    if (typeof flushAuditBuffer === "function") flushAuditBuffer();
    var store = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var events = Array.isArray(store.events) ? store.events : [];
    events.sort(function(a, b) {
      return (Date.parse(a.at || "") || 0) - (Date.parse(b.at || "") || 0);
    });
    var bundle = {
      exportedAt: beijingISOString(),
      appVersion: APP_VERSION,
      buildId: APP_BUILD_ID,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      totalEvents: events.length,
      events: events
    };
    var json = JSON.stringify(bundle, null, 2);
    var blob = new Blob([json], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var stamp = beijingISOString().replace(/[:.]/g, "-");
    var a = document.createElement("a");
    a.href = url;
    a.download = "shua-ci-ji-audit-log-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
  } catch (err) {
    alert("日志导出失败：" + (err && err.message || "unknown"));
  }
}

window.exportAuditLog = exportAuditLog;

function bindRange(elementId, key, unit, parser, formatter = String) {
  const input = document.getElementById(elementId);
  const output = document.getElementById(`${elementId}Value`);
  if (!input || !output) return;
  input.addEventListener("input", () => {
    const value = parser(input.value);
    state.settings[key] = value;
    output.textContent = `${formatter(value)}${unit}`;
    persistSettings();
  });
}


function bindCheckbox(elementId, key) {
  const input = document.getElementById(elementId);
  if (!input) return;
  input.addEventListener("change", () => {
    state.settings[key] = input.checked;
    persistSettings();
  });
}


