"use strict";

function setCloudConfigStatus(message, kind) {
  var statusEl = document.getElementById("cloudConfigStatus");
  var btn = document.getElementById("testSaveCloudBtn");
  var normalizedKind = kind || "info";
  if (statusEl) {
    statusEl.textContent = message || "";
    statusEl.className = "status" + (normalizedKind === "ok" ? " status--ok" : normalizedKind === "error" ? " status--error" : "");
    statusEl.setAttribute("data-sync-config-status", normalizedKind);
  }
  try {
    window.__lastCloudConfigStatus = { kind: normalizedKind, message: String(message || ""), at: Date.now() };
    document.dispatchEvent(new CustomEvent("cloud-config-status-change", { detail: window.__lastCloudConfigStatus }));
  } catch (_) {}
  if (btn) {
    btn.setAttribute("data-sync-config-status", normalizedKind);
    btn.disabled = normalizedKind === "testing";
  }
}


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
    setCloudConfigStatus(validation.errors.join("；"), "error");
    return;
  }

  setCloudConfigStatus("正在测试连接…", "testing");

  // Step 1: anonymous-first GET with authenticated/private and JSONP fallbacks.
  var getUrl = "https://api.github.com/gists/" + encodeURIComponent(draft.gistId);
  var metadataResult;
  try {
    metadataResult = await fetchGistMetadataWithCredentials({
      gistId: draft.gistId,
      token: draft.token,
      allowJsonp: true
    });
  } catch (e) {
    setCloudConfigStatus("读取 Gist 失败：" + syncErrorMessage(e), "error");
    appendAuditEvent({ type: "sync:config_read_failed", message: requestErrorTechnical(e), httpStatus: Number(e && e.httpStatus || 0) });
    return;
  }

  setCloudConfigStatus("已通过" + (metadataResult.readTransport === "jsonp" ? " JSONP 回退" : "网络") + "读取 Gist，正在测试写权限…", "testing");

  // Step 2: PATCH healthcheck to test write permission. If the response is lost,
  // read the tiny probe file back before declaring failure.
  var probeContent = "sync probe at " + beijingISOString() + " clientId=" + ensureSyncMeta().clientId + " nonce=" + Math.random().toString(36).slice(2);
  var patchResponse = null;
  var patchConfirmedByReadback = false;
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
          [SYNC_HEALTHCHECK_FILE_NAME]: { content: probeContent }
        }
      })
    }, GITHUB_PATCH_TIMEOUT_MS, { stage: "config_patch_probe", transport: "authenticated_fetch" });
  } catch (e) {
    try {
      var readback = await fetchGistMetadataWithCredentials({ gistId: draft.gistId, token: draft.token, allowJsonp: true });
      var probeFile = readback && readback.gist && readback.gist.files && readback.gist.files[SYNC_HEALTHCHECK_FILE_NAME];
      patchConfirmedByReadback = Boolean(probeFile && probeFile.content === probeContent);
    } catch (_) {}
    if (!patchConfirmedByReadback) {
      setCloudConfigStatus("写权限测试失败：" + syncErrorMessage(e), "error");
      appendAuditEvent({ type: "sync:config_patch_failed", message: requestErrorTechnical(e), httpStatus: Number(e && e.httpStatus || 0) });
      return;
    }
  }

  if (patchResponse && !patchResponse.ok) {
    var classifiedPatch = await classifyGithubResponseError(patchResponse, "测试 Gist 写权限");
    setCloudConfigStatus(classifiedPatch.message, "error");
    appendAuditEvent({ type: "sync:config_patch_failed", message: classifiedPatch.technical, httpStatus: patchResponse.status });
    return;
  }

  // Success: healthcheck only proves write permission. It must not mark the
  // business snapshot as cloud_saved.
  var previousCloud = { ...state.cloud };
  state.cloud.token = draft.token;
  state.cloud.gistId = draft.gistId;
  if (!persistCloud()) {
    state.cloud = previousCloud;
    setCloudConfigStatus("配置已验证，但浏览器本地存储写入失败。请先导出排查包并释放存储空间。", "error");
    return;
  }
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
  if (state.settings.autoSyncEnabled === false) {
    setCloudConfigStatus("配置保存成功，已确认 Gist 可写" + (patchConfirmedByReadback ? "（通过回读确认）" : "") + "；自动同步已关闭，业务数据仍只保存在本地，点击手动同步后再上传。", "ok");
  } else {
    setCloudConfigStatus("配置保存成功，已确认 Gist 可写" + (patchConfirmedByReadback ? "（通过回读确认）" : "") + "；业务数据将在后台安全同步。", "ok");
    syncTick({ reason: "config_saved", bypassBackoff: true });
  }
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
  const autoSyncEnabled = document.getElementById("autoSyncEnabled");
  const manualSyncBtn = document.getElementById("manualSyncBtn");

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
  bindPronunciationSettingsEvents();
  const manualZhReveal = document.getElementById("manualZhReveal");
  if (manualZhReveal) {
    manualZhReveal.addEventListener("change", () => {
      state.settings.manualZhReveal = manualZhReveal.checked;
      persistSettings();
      renderSetup();
    });
  }
  bindCheckbox("manualMode", "manualMode");
  bindCheckbox("highOnly", "highOnly");

  if (autoSyncEnabled) {
    autoSyncEnabled.addEventListener("change", function() {
      state.settings.autoSyncEnabled = autoSyncEnabled.checked;
      persistSettings({ touch: false });
      if (typeof handleAutoSyncPreferenceChanged === "function") {
        handleAutoSyncPreferenceChanged(autoSyncEnabled.checked);
      }
      var controls = document.getElementById("manualSyncControls");
      var modeStatus = document.getElementById("autoSyncModeStatus");
      if (controls) controls.hidden = autoSyncEnabled.checked;
      if (modeStatus) {
        modeStatus.textContent = autoSyncEnabled.checked
          ? "自动同步已开启：沿用当前安全合并、后台重试和多设备同步逻辑。"
          : "自动同步已关闭：学习数据只保存在当前浏览器；需要时点击下方按钮手动安全同步。";
      }
      renderCloudSyncDiagnostics();
    });
  }

  if (manualSyncBtn) {
    manualSyncBtn.addEventListener("click", function() {
      manualSyncBtn.disabled = true;
      manualSyncBtn.textContent = "同步中…";
      setCloudConfigStatus("正在执行手动安全同步…", "testing");
      Promise.resolve(syncTick({ reason: "manual_retry", bypassBackoff: true })).then(function(result) {
        var completed = result && result.ok !== false;
        setCloudConfigStatus(completed ? "手动同步已完成。" : "手动同步未完成；本地数据仍已保存，请查看同步状态。", completed ? "ok" : "error");
      }).catch(function(error) {
        setCloudConfigStatus("手动同步失败：" + syncErrorMessage(error), "error");
      }).finally(function() {
        manualSyncBtn.disabled = false;
        manualSyncBtn.textContent = "手动同步到云端（先安全合并）";
      });
    });
  }

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

  var toggleTokenVisibilityBtn = document.getElementById("toggleTokenVisibilityBtn");
  if (toggleTokenVisibilityBtn && tokenInput) {
    toggleTokenVisibilityBtn.addEventListener("click", function() {
      var reveal = tokenInput.type === "password";
      tokenInput.type = reveal ? "text" : "password";
      toggleTokenVisibilityBtn.textContent = reveal ? "隐藏" : "显示";
      toggleTokenVisibilityBtn.setAttribute("aria-pressed", reveal ? "true" : "false");
    });
  }

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
    try { localStorage.removeItem(AUTH_KEY); } catch (_) {}
    renderAuth();
  });

  // 同步状态卡可能被局部重绘，所有按钮统一由同一个绑定函数维护。
  bindSyncDiagnosticsButtons();
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


function downloadTextFile(filename, content, mimeType) {
  var blob = new Blob([String(content || "")], { type: mimeType || "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function exportDiagnosisSummary() {
  try {
    var stamp = beijingISOString().replace(/[:.]/g, "-");
    downloadTextFile("shua-ci-ji-diagnosis-" + stamp + ".txt", buildSyncDiagnosisText(), "text/plain;charset=utf-8");
  } catch (error) {
    alert("诊断摘要导出失败：" + String(error && error.message || error || "unknown"));
  }
}

function exportSupportBundle() {
  try {
    if (typeof flushAuditBuffer === "function") flushAuditBuffer();
    var audit = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var syncState = ensureHashSyncState(state.syncHashState);
    var meta = ensureSyncMeta(state.syncMeta);
    var bundle = {
      exportedAt: beijingISOString(),
      appVersion: APP_VERSION,
      buildId: APP_BUILD_ID,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
      runtime: {
        loaderMode: String(window.__SHUA_LOADER_MODE__ || "unknown"),
        sourceModuleCount: Array.isArray(window.__SHUA_SOURCE_MODULES__) ? window.__SHUA_SOURCE_MODULES__.length : 0,
        visibilityState: typeof document !== "undefined" ? String(document.visibilityState || "") : "",
        serviceWorkerControlled: Boolean(typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller)
      },
      cloudConfig: {
        gistIdMasked: maskGistId(state.cloud && state.cloud.gistId),
        tokenMasked: maskTokenForDiagnosis(state.cloud && state.cloud.token),
        configured: validateSavedCloudConfig(state.cloud).ok
      },
      status: computeSyncStatus(),
      syncState: syncState,
      syncMeta: meta,
      diagnosisText: buildSyncDiagnosisText(),
      payload: normalizeSyncPayload(collectSyncPayload()),
      backupIndex: loadHashBackupIndex(),
      auditOrderProblems: validateAuditSyncOrder(Array.isArray(audit.events) ? audit.events : []),
      events: Array.isArray(audit.events) ? audit.events : []
    };
    // 安全约束：排查包不写入明文 PAT。
    if (bundle.syncMeta && Object.prototype.hasOwnProperty.call(bundle.syncMeta, "token")) delete bundle.syncMeta.token;
    var stamp = beijingISOString().replace(/[:.]/g, "-");
    downloadTextFile("shua-ci-ji-support-bundle-" + stamp + ".json", JSON.stringify(bundle, null, 2), "application/json;charset=utf-8");
  } catch (error) {
    alert("排查包导出失败：" + String(error && error.message || error || "unknown"));
  }
}


// ── 审计顺序验证 ─────────────────────────────────────────────

function validateAuditSyncOrder(events) {
  var byKey = {};
  (events || []).forEach(function(e) {
    if (!e.at || !e.type) return;
    var msg = e.message || "";
    var sessionMatch = /session=([^ ]+)/.exec(msg);
    var runMatch = /runId=([0-9]+)/.exec(msg);
    if (!runMatch) return;
    var key = (sessionMatch ? sessionMatch[1] : "legacy") + "#" + runMatch[1];
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(e);
  });
  var problems = [];
  Object.keys(byKey).forEach(function(key) {
    var list = byKey[key].slice().sort(function(a, b) { return (Date.parse(a.at || "") || 0) - (Date.parse(b.at || "") || 0); });
    var completeIdx = list.findIndex(function(e) { return e.type === "sync:complete"; });
    var patchSentIdx = list.findIndex(function(e) { return e.type === "sync:patch_sent"; });
    var patchSuccessIdx = list.findIndex(function(e) { return e.type === "sync:patch_success"; });
    var verifyIdx = list.findIndex(function(e) { return e.type === "sync:verify_done"; });
    if (completeIdx >= 0 && patchSentIdx >= 0 && completeIdx < patchSentIdx) problems.push(key + " complete before patch_sent");
    if (completeIdx >= 0 && patchSuccessIdx >= 0 && completeIdx < patchSuccessIdx) problems.push(key + " complete before patch_success");
    if (completeIdx >= 0 && verifyIdx >= 0 && completeIdx < verifyIdx) problems.push(key + " complete before verify_done");
  });
  return problems;
}

function exportAuditLog() {
  try {
    if (typeof flushAuditBuffer === "function") flushAuditBuffer();
    var store = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var events = Array.isArray(store.events) ? store.events : [];
    events.sort(function(a, b) {
      return (Date.parse(a.at || "") || 0) - (Date.parse(b.at || "") || 0);
    });
    var orderProblems = validateAuditSyncOrder(events);
    var bundle = {
      exportedAt: beijingISOString(),
      appVersion: APP_VERSION,
      buildId: APP_BUILD_ID,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      totalEvents: events.length,
      auditOrderProblems: orderProblems,
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


