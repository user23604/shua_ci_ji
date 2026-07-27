"use strict";

// sync status computation moved to 25a-sync-status-core.js.

// ── 配置校验 ──────────────────────────────────────────────────────────


function validateSavedCloudConfig(cloud) {
  var token = (cloud && cloud.token || "").trim();
  var gistId = (cloud && cloud.gistId || "").trim();
  return validateCloudConfigDraft({ token: token, gistId: gistId });
}


function validateCloudConfigDraft(_ref) {
  var token = _ref.token;
  var gistId = _ref.gistId;
  var errors = [];
  var t = (token || "").trim();
  var g = (gistId || "").trim();

  if (!t) errors.push("GitHub PAT 不能为空");
  if (!g) errors.push("Gist ID 不能为空");

  if (t && g && t === g) {
    errors.push("GitHub PAT 和 Gist ID 完全相同。您可能把 Gist ID 粘贴到了 PAT 输入框。请分别填入两个不同的值。");
  }

  var PAT_PREFIX_RE = /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/;
  var GIST_ID_RE = /^[a-f0-9]{20,64}$/i;

  if (t && GIST_ID_RE.test(t) && !PAT_PREFIX_RE.test(t)) {
    errors.push("GitHub PAT 看起来像 Gist ID（纯十六进制字符串）。请确认是否把 Gist ID 粘贴到了 PAT 输入框。PAT 通常以 ghp_ 或 github_pat_ 开头。");
  }

  if (g && PAT_PREFIX_RE.test(g)) {
    errors.push("Gist ID 看起来像 GitHub Token（以 ghp_/github_pat_ 开头）。请确认是否把 PAT 粘贴到了 Gist ID 输入框。");
  }

  if (t && t.length < 20 && errors.length === 0) {
    errors.push("GitHub PAT 太短，可能不是完整的 Personal Access Token。");
  }

  return { ok: errors.length === 0, errors: errors };
}


function savedCloudConfigGate() {
  state.cloud.token = (state.cloud.token || "").trim();
  state.cloud.gistId = (state.cloud.gistId || "").trim();
  const validation = validateSavedCloudConfig(state.cloud);
  if (!validation.ok) {
    state.syncMeta = ensureSyncMeta(state.syncMeta);
    state.syncMeta.cloudWritable = false;
    state.syncMeta.readOnlyMode = false;
    persistSyncMeta();
    setHashSyncStatus("invalid_config", validation.errors.join("；"));
    // 区分未配置 vs 已配置但无效（前者不弹横幅）
    var hasAnyConfig = Boolean(state.cloud.token || state.cloud.gistId);
    return { ok: false, message: validation.errors.join("；"), configured: hasAnyConfig };
  }
  persistCloud();
  return { ok: true, message: "", configured: true };
}


function setReadOnlySyncState(message, options = {}) {
  if (isStaleSyncRun(options.runId)) return false;
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.cloudWritable = false;
  state.syncMeta.readOnlyMode = true;
  state.syncMeta.lastSyncErrorAt = beijingISOString();
  state.syncMeta.lastSyncErrorMessage = message || "GitHub Gist 当前不可写";
  persistSyncMeta();
  setHashSyncStatus("read_only", state.syncMeta.lastSyncErrorMessage, { runId: options.runId });
  showSyncProblemDialog({ severity: "warning", code: "READ_ONLY", title: "云同步只读", message: state.syncMeta.lastSyncErrorMessage, runId: options.runId });
  return true;
}


function shouldSkipSyncForBackoff(bypassBackoff) {
  if (bypassBackoff) return false;
  const nextRetryAt = ensureHashSyncState(state.syncHashState).nextRetryAt;
  const time = Date.parse(nextRetryAt || "");
  return Number.isFinite(time) && time > Date.now();
}


async function bootstrapSyncAfterInit(reason = "init") {
  // 防重入 — 仅限制 init，不限制 config_saved/manual/local_change
  if (reason === "init") {
    if (state.initialSyncStarted) return;
    state.initialSyncStarted = true;
  }
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  const localAtStart = refreshLocalPayloadHash({ persist: true });
  writeHashBackup("startup", localAtStart.payload, reason);
  updateSyncIndicator();
  return syncTick({ reason: reason || "init" });
}


async function initializeSync({ reason = "init" } = {}) {
  if (!isAutoSyncEnabled()) {
    updateSyncIndicator();
    appendAuditEvent({ type: "sync:init_skipped_auto_disabled", message: "reason=" + String(reason || "init") });
    return false;
  }
  return bootstrapSyncAfterInit(reason);
}
// ── 分支函数 ─────────────────────────────────────────────────────


