"use strict";

function hasActiveError() {
  var meta = ensureSyncMeta(state.syncMeta);
  if (!meta.lastSyncErrorAt) return false;
  if (!meta.lastSuccessfulPushAt) return true;
  return meta.lastSyncErrorAt > meta.lastSuccessfulPushAt;
}


function hasUnsyncedLocalPayload() {
  if (getPendingOps().length > 0) return false;
  var meta = ensureSyncMeta(state.syncMeta);
  if (!meta.lastSyncedPayloadHash) {
    return hasBusinessData(collectSyncPayload());
  }
  var currentHash = computeCurrentPayloadHash();
  return currentHash !== meta.lastSyncedPayloadHash;
}


function canShowCloudSaved() {
  // P0: cloud_saved 只能由 finalizeVerifiedPatch() 写入。
  // 本函数只读取 lastSyncStatus，不自算 hash/revision/ops。
  return { ok: state.syncHashState && state.syncHashState.lastSyncStatus === "cloud_saved" };
}


function buildStatusDetail(status, baseMessage, opsCount) {
  var opsSuffix = opsCount > 0 ? "；本地 " + opsCount + " 条待上传" : "";
  var msg = baseMessage || "";
  if (status === "error" || status === "read_only" || status === "dirty") {
    return msg + opsSuffix;
  }
  return msg || opsSuffix;
}


function cachedSyncFactsForStatus(syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  var localHash = String(syncState.localPayloadHash || "");
  var baseHash = String(syncState.baseRemoteHash || "");
  return {
    payload: null,
    localPayloadHash: localHash,
    syncState: syncState,
    effectiveDirty: syncState.localDirty === true || Boolean(baseHash && localHash && localHash !== baseHash),
    hasBusinessData: Boolean(localHash)
  };
}


// ── P0.8: green confirmation gate ────────────────────────────────────

function canShowCloudOk(facts, syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  if (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) return false;
  if (state.isSyncing) return false;
  if (!facts) return false;
  if (syncState.localDirty) return false;
  if (facts.effectiveDirty) return false;
  if (!syncState.baseRemoteHash) return false;
  if (String(facts.localPayloadHash || "") !== String(syncState.baseRemoteHash || "")) return false;
  if (String(state.latestRemoteHashSeen || "") !== String(facts.localPayloadHash || "")) return false;
  if (typeof hasFreshSessionRemoteConfirmation !== "function") return false;
  if (!hasFreshSessionRemoteConfirmation()) return false;
  if (hasUnclearedBlockingSyncError(syncState)) return false;
  if (syncState.lastSyncedPayloadHash && String(syncState.lastSyncedPayloadHash) !== String(facts.localPayloadHash || "")) return false;
  return true;
}


function canShowConfirmedCloudState(facts, syncState) {
  return canShowCloudOk(facts, syncState);
}


function activeStudyDirtyDetail() {
  if (state.lastDirtyFromVerify) return "本地已保存，稍后继续同步";
  if (state.view === "flash") {
    if (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) return "学习中，本地已保存，稍后同步";
    var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
    if (last && Date.now() - last < ACTIVE_STUDY_SYNC_DEBOUNCE_MS) return "本地已保存，待同步";
  }
  return "本地待上传";
}


function syncedDetail(syncState) {
  var pushAt = syncState.lastSuccessfulPushAt || "";
  var pullAt = syncState.lastSuccessfulPullAt || "";
  var pushTime = Date.parse(pushAt) || 0;
  var pullTime = Date.parse(pullAt) || 0;
  if (syncState.lastSyncStatus === "cloud_loaded" || pullTime > pushTime) return "已从云端更新";
  return "云端已保存";
}


function computeSyncStatus() {
  const syncState = ensureHashSyncState(state.syncHashState);

  if (syncState.localRecoveryRequired) {
    return { status: "error", detail: "本地备份待恢复，请打开 rescue.html" };
  }

  if (state.isSyncing && (Date.now() - (state.syncLastProgressAt || state.syncStartedAt || 0) > SYNC_NO_PROGRESS_TIMEOUT_MS)) {
    return { status: "error", detail: "同步超时，正在等待下一轮自动重试" };
  }

  const token = (state.cloud.token || "").trim();
  const gistId = (state.cloud.gistId || "").trim();

  if (!token && !gistId) {
    return { status: "local_only", detail: "本地进度已保存，云同步未配置" };
  }

  const cloud = validateSavedCloudConfig(state.cloud);
  if (!cloud.ok) {
    return { status: "invalid_config", detail: cloud.errors.join("；") };
  }

  if (hasUnclearedBlockingSyncError(syncState)) {
    return { status: "error", detail: syncState.lastBlockingErrorText || syncState.lastSyncError || "同步异常，点开查看" };
  }

  if (syncState.lastSyncStatus === "conflict") {
    return { status: "conflict", detail: syncState.lastSyncError || "自动合并失败" };
  }

  if (syncState.lastSyncStatus === "error" && syncState.localDirty) {
    return { status: "error", detail: syncState.lastSyncError || "同步失败" };
  }

  if (state.isSyncing && state.syncActuallyStarted) {
    var elapsed = Date.now() - Number(state.syncStartedAtMs || state.syncStartedAt || 0);
    return {
      status: "syncing",
      detail: elapsed > SYNC_LONG_RUNNING_UI_MS ? "后台同步中，本地可继续学习" : "正在同步"
    };
  }

  if (syncState.localDirty) {
    if (state.syncMeta.readOnlyMode) {
      return { status: "dirty_read_only", detail: "只读模式·本地已保存，待更换可写 PAT 后上传" };
    }
    return { status: "dirty", detail: activeStudyDirtyDetail() };
  }

  const facts = cachedSyncFactsForStatus(syncState);

  if (facts.effectiveDirty) {
    if (state.syncMeta.readOnlyMode) {
      return { status: "dirty_read_only", detail: "只读模式·本地已保存，待更换可写 PAT 后上传" };
    }
    return { status: "dirty", detail: activeStudyDirtyDetail() };
  }

  if (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) {
    return { status: "dirty", detail: state.view === "flash" ? "学习中，本地已保存，稍后同步" : "本地已保存，待同步" };
  }

  if (canShowCloudOk(facts, syncState)) {
    return { status: "cloud_ok", detail: syncedDetail(syncState) };
  }

  if (!state.sessionRemoteCheckDone && cloud.ok) {
    return { status: "local_only", detail: "本地可用，待云端检查" };
  }

  if (cloud.ok) {
    if (typeof hasFreshSessionRemoteConfirmation !== "function" || !hasFreshSessionRemoteConfirmation()) {
      return { status: "local_only", detail: "本地可用，待云端检查" };
    }
  }

  if (state.syncMeta.readOnlyMode) {
    if (!facts.hasBusinessData && syncState.lastSyncStatus === "local_only") {
      return { status: "local_only", detail: "本地和云端都没有学习数据" };
    }
    return { status: "read_only", detail: "只读模式·无法上传" };
  }

  return { status: "local_only", detail: "本地已保存，尚未确认云端保存" };
}

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


function normalizeCloudConfig() {
  state.cloud.token = (state.cloud.token || "").trim();
  state.cloud.gistId = (state.cloud.gistId || "").trim();
  persistCloud();
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  persistSyncMeta();
  return Boolean(state.cloud.token && state.cloud.gistId);
}


function queueAutoPull(reason = "auto") {
  initializeP0Sync({ reason });
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
    // P0.6: 区分未配置 vs 已配置但无效（前者不弹横幅）
    var hasAnyConfig = Boolean(state.cloud.token || state.cloud.gistId);
    return { ok: false, message: validation.errors.join("；"), configured: hasAnyConfig };
  }
  persistCloud();
  return { ok: true, message: "", configured: true };
}


function isIdleForSyncHeartbeat() {
  return state.view !== "flash" || state.playbackPaused === true;
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
  // P0.8: 防重入 — 仅限制 init，不限制 config_saved/manual/local_change
  if (reason === "init") {
    if (state.initialSyncStarted) return;
    state.initialSyncStarted = true;
  }
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  const localAtStart = refreshLocalPayloadHash({ persist: true });
  writeHashBackup("startup", localAtStart.payload, reason);
  updateSyncIndicator();
  return syncTick({ reason: reason || "init", bypassBackoff: true });
}


async function initializeP0Sync({ reason = "init" } = {}) {
  return bootstrapSyncAfterInit(reason);
}
// ── P0.1 分支函数 ─────────────────────────────────────────────────────


