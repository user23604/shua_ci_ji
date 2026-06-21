"use strict";

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

function buildSyncStatusFacts(syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  var facts;
  try {
    facts = currentSyncFacts({ persistHash: false });
  } catch (_) {
    facts = cachedSyncFactsForStatus(syncState);
  }
  facts.syncState = syncState;
  facts.pendingProgressSync = typeof hasPendingProgressSync === "function" && hasPendingProgressSync();
  facts.activityDirtyPending = typeof hasPendingActivityDraft === "function" && hasPendingActivityDraft();
  facts.pendingStudyFlush = facts.pendingProgressSync || facts.activityDirtyPending;
  facts.queuedStudy = hasQueuedStudyLocalState(facts);
  facts.freshRemote = typeof hasFreshSessionRemoteConfirmation === "function" && hasFreshSessionRemoteConfirmation();
  facts.latestRemoteHashSeen = String(state.latestRemoteHashSeen || "");
  facts.baseRemoteHash = String(syncState.baseRemoteHash || "");
  facts.localPayloadHash = String(facts.localPayloadHash || "");
  return facts;
}

function hasQueuedStudyLocalState(facts) {
  if (facts && facts.pendingStudyFlush) return true;
  if (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) return true;
  if (state.view !== "flash") return false;
  if (typeof getActiveStudyFacts === "function") {
    var active = getActiveStudyFacts();
    return Boolean(active.inFlash && (active.withinIdleWindow || active.studyMoving || active.playbackActive || active.timersActive || active.speechSpeaking || active.pointerActive));
  }
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  if (last && Date.now() - last < ACTIVE_STUDY_SYNC_DEBOUNCE_MS) return true;
  if (typeof isStudyMoving === "function" && isStudyMoving()) return true;
  return false;
}

function queuedStudyDetail() {
  if (state.view === "flash") return "学习中，待同步（本地已保存）";
  return "待同步（本地已保存）";
}

function activeStudyDirtyDetail() {
  if (state.lastDirtyFromVerify) return "本地已保存，稍后继续同步";
  if (state.view === "flash" && hasQueuedStudyLocalState()) return queuedStudyDetail();
  return "本地待上传";
}

function syncedDetail(syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  var pushAt = syncState.lastSuccessfulPushAt || "";
  var pullAt = syncState.lastSuccessfulPullAt || "";
  var pushTime = Date.parse(pushAt) || 0;
  var pullTime = Date.parse(pullAt) || 0;
  if (syncState.lastSyncStatus === "cloud_loaded" || (pullTime > pushTime && syncState.lastSyncStatus !== "cloud_ok" && syncState.lastSyncStatus !== "cloud_saved")) return "已从云端更新";
  return "云端已保存";
}

function canShowCloudOk(facts, syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  facts = facts || buildSyncStatusFacts(syncState);
  if (facts.pendingStudyFlush) return false;
  if (state.isSyncing) return false;
  if (syncState.localDirty) return false;
  if (facts.effectiveDirty) return false;
  if (!syncState.baseRemoteHash) return false;
  if (!syncState.lastSuccessfulPushAt) return false;
  if (syncState.lastSyncStatus !== "cloud_ok" && syncState.lastSyncStatus !== "cloud_saved") return false;
  if (String(facts.localPayloadHash || "") !== String(syncState.baseRemoteHash || "")) return false;
  if (String(state.latestRemoteHashSeen || "") !== String(facts.localPayloadHash || "")) return false;
  if (typeof hasFreshSessionRemoteConfirmation !== "function" || !hasFreshSessionRemoteConfirmation()) return false;
  if (hasUnclearedBlockingSyncError(syncState)) return false;
  if (syncState.lastSyncedPayloadHash && String(syncState.lastSyncedPayloadHash) !== String(facts.localPayloadHash || "")) return false;
  return true;
}

function canShowConfirmedCloudState(facts, syncState) {
  return canShowCloudOk(facts, syncState);
}

function canShowCloudSaved() {
  return { ok: canShowCloudOk(buildSyncStatusFacts(), state.syncHashState) };
}

function buildStatusDetail(status, baseMessage, opsCount) {
  var opsSuffix = opsCount > 0 ? "；本地 " + opsCount + " 条待上传" : "";
  var msg = baseMessage || "";
  if (status === "error" || status === "read_only" || status === "dirty" || status === "dirty_read_only") return msg + opsSuffix;
  return msg || opsSuffix;
}

function computeSyncStatus() {
  var syncState = ensureHashSyncState(state.syncHashState);
  var facts = buildSyncStatusFacts(syncState);
  var token = String(state.cloud && state.cloud.token || "").trim();
  var gistId = String(state.cloud && state.cloud.gistId || "").trim();
  var cloud = validateSavedCloudConfig(state.cloud || {});

  if (syncState.localRecoveryRequired) return { status: "error", detail: "本地备份待恢复，请打开 rescue.html" };
  if (!token && !gistId) return { status: "local_only", detail: "本地进度已保存，云同步未配置" };
  if (!cloud.ok) return { status: "invalid_config", detail: cloud.errors.join("；") };

  if (hasUnclearedBlockingSyncError(syncState)) {
    return { status: "error", detail: syncState.lastBlockingErrorText || syncState.lastSyncError || "同步异常，点开查看" };
  }
  if (syncState.lastSyncStatus === "conflict") return { status: "conflict", detail: syncState.lastSyncError || "自动合并失败" };
  if (state.isSyncing && (Date.now() - (state.syncLastProgressAt || state.syncStartedAt || 0) > SYNC_NO_PROGRESS_TIMEOUT_MS)) {
    return { status: "error", detail: "同步超时，正在等待下一轮自动重试" };
  }
  if (state.isSyncing && state.syncActuallyStarted) {
    var elapsed = Date.now() - Number(state.syncStartedAtMs || state.syncStartedAt || 0);
    return { status: "syncing", detail: elapsed > SYNC_LONG_RUNNING_UI_MS ? "后台同步中，本地可继续学习" : "正在同步" };
  }

  // P14: actual pending cursor/draft wins over clean. Active movement alone must not hide a verified cloud_ok.
  if (facts.pendingStudyFlush) {
    if (state.syncMeta && state.syncMeta.readOnlyMode && (syncState.localDirty || facts.effectiveDirty)) {
      return { status: "dirty_read_only", detail: "只读模式·本地已保存，待更换可写 PAT 后上传" };
    }
    return { status: "study_queued", detail: queuedStudyDetail() };
  }

  if (syncState.localDirty || facts.effectiveDirty) {
    if (state.syncMeta && state.syncMeta.readOnlyMode) return { status: "dirty_read_only", detail: "只读模式·本地已保存，待更换可写 PAT 后上传" };
    if (syncState.lastSyncStatus === "error") return { status: "error", detail: syncState.lastSyncError || "同步失败，本地数据已保留" };
    return { status: "dirty", detail: activeStudyDirtyDetail() };
  }

  if (canShowCloudOk(facts, syncState)) return { status: "cloud_ok", detail: "云端已保存" };

  if (syncState.lastSyncStatus === "cloud_loaded") {
    return { status: "cloud_loaded", detail: "已从云端更新" };
  }

  if (!state.sessionRemoteCheckDone) return { status: "local_only", detail: "本地可用，待云端检查" };
  if (state.syncMeta && state.syncMeta.readOnlyMode) return { status: "read_only", detail: "只读模式·无法上传" };
  return { status: "local_only", detail: "本地已保存，尚未确认云端保存" };
}
