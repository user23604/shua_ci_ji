"use strict";

async function autoPullFromGist() {
  return syncTick({ reason: "manual_pull", bypassBackoff: true });
}


async function autoPushToGist({ keepalive = false } = {}) {
  return syncTick({ reason: "manual_push", keepalive, bypassBackoff: true });
}


async function syncWithGist({ keepalive = false } = {}) {
  return syncTick({ reason: "manual", keepalive, bypassBackoff: true });
}


async function pushLocalPayload() {
  throw new Error("pushLocalPayload 已废弃，请使用 syncTick");
}

// P0: 已废弃。P0 使用 syncTick() 四分支。

function pullOrMergeRemotePayload() {
  throw new Error("pullOrMergeRemotePayload 已废弃，请使用 syncTick");
}

// P0: 已废弃。P0 使用 syncTick() → syncBranchMerge()。

function safeMergeAndPush() {
  throw new Error("safeMergeAndPush 已废弃，请使用 syncTick");
}

// P0: 已废弃。P0 使用 safeMergePayloads()。

function autoSafeMerge() {
  throw new Error("autoSafeMerge 已废弃，请使用 safeMergePayloads");
}

// P0: 已废弃。cloud_saved 只能由 finalizeVerifiedPatch() → markHashCleanFromRemote() 写入。

function markHashClean() {
  throw new Error("markHashClean 已废弃，请使用 markHashCleanFromRemote");
}

// ── P0.1 syncTick ─────────────────────────────────────────────────────


async function syncTick({ reason = "heartbeat", keepalive = false, bypassBackoff = false } = {}) {
  if (state.isSyncing) {
    if (!releaseStuckSyncLockIfNeeded()) return false;
  }
  if (typeof document !== "undefined" && document.hidden) return false;

  const gate = savedCloudConfigGate();
  if (!gate.ok) {
    if (gate.configured) {
      recordHashSyncFailure(gate.message, { errorKind: "config_invalid", banner: true, dialog: true, title: "同步配置无效" });
    }
    return false;
  }

  const preFacts = currentSyncFacts({ persistHash: true });
  if (reason === "heartbeat" && isIdleForSyncHeartbeat() && !preFacts.effectiveDirty) return false;
  if (shouldSkipSyncForBackoff(bypassBackoff)) return false;
  if (!tryAcquireCrossTabSyncLock(reason)) {
    setHashSyncStatus("syncing", "其他标签页正在同步");
    return false;
  }

  const runId = ++state.syncRunSeq;
  state.syncRunId = runId;
  state.isSyncing = true;
  state.syncStartedAt = Date.now();
  state.syncLastProgressAt = state.syncStartedAt;
  state.syncLastProgressStage = "sync:start";
  const localRevisionAtStart = state.localBusinessRevision || 0;
  const localHashAtStart = businessPayloadHash(collectSyncPayload());
  setSyncStatus("syncing");
  markSyncProgress("sync:start", runId);

  try {
    state.syncMeta = ensureSyncMeta(state.syncMeta);
    state.syncMeta.lastSyncAttemptAt = new Date().toISOString();
    persistSyncMeta();

    markSyncProgress("remote:get:start", runId);
    const remote = await fetchGistSyncPayload();
    markSyncProgress("remote:get:done", runId);
    if (isStaleSyncRun(runId)) return false;

    const remotePayload = currentRemotePayload(remote);
    const remoteHash = currentRemoteHash(remote);

    if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") {
      recordHashSyncFailure(remote.reason || "云端 sync.json 无法安全解析，已停止自动写入", {
        errorKind: remote.kind === "v2_unknown_ops" ? "v2_unknown_ops" : "remote_invalid",
        banner: true,
        dialog: true,
        runId,
        technical: remote.reason || ""
      });
      return false;
    }

    if (!isRemoteValidKind(remote.kind) && !isRemoteEmptyKind(remote.kind)) {
      recordHashSyncFailure("云端 sync.json 状态未知，已停止同步", { errorKind: "remote_invalid", banner: true, dialog: true, runId, technical: remote.kind || "unknown" });
      return false;
    }

    if (remote.readOnlyAuthFallback) {
      state.syncMeta.readOnlyMode = true;
      state.syncMeta.cloudWritable = false;
    } else {
      state.syncMeta.readOnlyMode = false;
      state.syncMeta.cloudWritable = true;
    }
    persistSyncMeta();

    markSyncProgress("recovery:check:start", runId);
    if (ensureHashSyncState(state.syncHashState).localRecoveryRequired) {
      const recovery = tryRestoreFromBackupIfPayloadEmpty({ runId });
      if (recovery.status === "restore_failed") return false;
    }
    markSyncProgress("recovery:check:done", runId);

    let local = refreshLocalPayloadHash({ persist: true });
    let facts = currentSyncFacts({ persistHash: false });

    if (!hasBusinessData(local.payload)) {
      const recovery = tryRestoreFromBackupIfPayloadEmpty({ runId });
      if (recovery.status === "restore_failed") return false;
      if (recovery.status === "restored") {
        local = refreshLocalPayloadHash({ persist: true });
        facts = currentSyncFacts({ persistHash: false });
      } else if (remotePayload && hasBusinessData(remotePayload)) {
        if (hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) {
          facts = currentSyncFacts({ persistHash: true });
          return syncBranchMerge({ remote, remotePayload, local: facts, keepalive, reason: "local_changed_before_pull", runId });
        }
        const pulled = pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId });
        if (remote.readOnlyAuthFallback) setReadOnlySyncState("PAT 无效或无写权限，当前只读；已加载云端数据但不会上传。", { runId });
        return pulled;
      } else {
        state.syncHashState = ensureHashSyncState(state.syncHashState);
        state.syncHashState.localDirty = false;
        state.syncHashState.localPayloadHash = local.hash;
        state.syncHashState.baseRemoteHash = "";
        state.syncHashState.dirtySince = "";
        state.syncHashState.lastSyncStatus = "local_only";
        state.syncHashState.lastSyncError = "";
        state.syncHashState.localRecoveryRequired = false;
        persistHashSyncState();
        updateSyncIndicator();
        if (remote.readOnlyAuthFallback) setReadOnlySyncState("PAT 无效或无写权限，当前只读。", { runId });
        return true;
      }
    }

    if (remote.readOnlyAuthFallback) {
      if (!facts.effectiveDirty && remotePayload && remoteHash !== facts.syncState.baseRemoteHash) {
        const pulled = pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId, localRevisionAtStart, localHashAtStart });
        setReadOnlySyncState("PAT 无效或无写权限，当前只读；已尽量读取云端数据但不会上传。", { runId });
        return pulled;
      }
      setReadOnlySyncState(facts.effectiveDirty ? "本地有未上传数据，但 PAT 无效或无写权限，当前无法上传。" : "PAT 无效或无写权限，当前只读。", { runId });
      return false;
    }

    const syncState = ensureHashSyncState(state.syncHashState);
    const effectiveDirty = facts.effectiveDirty;

    if (remoteHash === syncState.baseRemoteHash && !effectiveDirty) return true;

    if (remoteHash === syncState.baseRemoteHash && effectiveDirty) {
      return syncBranchPushLocal({ remote, local: facts, keepalive, reason, runId, remoteHashAtDecision: remoteHash });
    }

    if (remoteHash !== syncState.baseRemoteHash && !effectiveDirty) {
      if (!remotePayload) {
        markHashDirty(facts.localPayloadHash, "云端缺少 sync.json，等待重新上传本地快照", { runId });
        return syncBranchPushLocal({ remote, local: facts, keepalive, reason: "remote_missing_repush", runId, remoteHashAtDecision: remoteHash });
      }
      if (hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) {
        const recheck = currentSyncFacts({ persistHash: true });
        return syncBranchMerge({ remote, remotePayload, local: recheck, keepalive, reason: "local_changed_before_pull", runId });
      }
      return pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId, localRevisionAtStart, localHashAtStart });
    }

    return syncBranchMerge({ remote, remotePayload, local: facts, keepalive, reason, runId });
  } catch (error) {
    if (!isStaleSyncRun(runId)) {
      recordHashSyncFailure(syncErrorMessage(error), { errorKind: "remote_get_failed", banner: true, dialog: true, runId, technical: error && (error.stack || error.message) });
    }
    return false;
  } finally {
    if (!isStaleSyncRun(runId)) {
      markSyncProgress("sync:finalize", runId);
      state.isSyncing = false;
      state.syncStartedAt = 0;
      state.syncLastProgressAt = 0;
      updateSyncIndicator();
    }
    releaseCrossTabSyncLock();
  }
}


