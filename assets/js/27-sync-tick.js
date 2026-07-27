"use strict";

async function syncTickInternal({ reason = "heartbeat", keepalive = false, bypassBackoff = false } = {}) {
  reason = String(reason || "heartbeat");
  if (!isAutoSyncEnabled() && !isHardForcedSyncReason(reason)) {
    appendAuditEvent({ type: "sync:skip_auto_disabled", message: "session=" + TAB_ID + " reason=" + reason });
    updateSyncIndicator();
    return false;
  }
  if (state.isSyncing) {
    if (!releaseStuckSyncLockIfNeeded()) {
      if (reason !== "heartbeat") state.syncRequestedAfterCurrent = true;
      if (reason === "active_study_idle_upload") state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:request_coalesced", message: "session=" + TAB_ID + " reason=" + reason + " activeRunId=" + String(state.syncRunId || "") });
      return false;
    }
  }
  if (typeof document !== "undefined" && document.hidden && !canRunWhileHidden(reason)) {
    if (reason === "active_study_idle_upload") {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:active_study_idle_upload_deferred_hidden", message: "session=" + TAB_ID + " dirty_preserved=true" });
    } else {
      appendAuditEvent({ type: "sync:skip_hidden", message: "session=" + TAB_ID + " reason=" + reason });
    }
    return false;
  }

  if (!isHardForcedSyncReason(reason) && shouldDeferForActiveStudy(reason)) {
    appendAuditEvent({
      type: "sync:defer_active_study",
      message: "session=" + TAB_ID + " reason=" + reason + " elapsedSinceStudyAction=" + String(Date.now() - (typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0)))
    });
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
    updateSyncIndicator();
    return false;
  }

  if (shouldDeferFlashAutoSync(reason)) {
    var flashSkipState = ensureHashSyncState(state.syncHashState);
    if (flashSkipState.localDirty || state.pendingActiveStudyUpload || (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) {
      if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
      setHashSyncStatus("dirty", "本地已保存，稍后自动同步");
      appendAuditEvent({
        type: "sync:defer_flash_auto_sync",
        message:
          "session=" + TAB_ID +
          " reason=" + String(reason || "") +
          " dirty=" + String(!!flashSkipState.localDirty) +
          " pendingActiveStudyUpload=" + String(!!state.pendingActiveStudyUpload) +
          " idleRemaining=" + String(typeof activeStudyIdleDelayMs === "function" ? activeStudyIdleDelayMs() : ACTIVE_STUDY_SYNC_DEBOUNCE_MS)
      });
      return false;
    }
  }

  // PATCH 事务锁 — 同一页面会话内不并发 PATCH
  if (hasActivePatchTransaction()) {
    appendAuditEvent({ type: "sync:skip_patch_in_flight", message: "session=" + TAB_ID + " reason=" + reason });
    if (reason === "active_study_idle_upload") {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:active_study_idle_upload_pending", message: "session=" + TAB_ID + " reason=patch_in_flight" });
    } else {
      state.syncRequestedAfterCurrent = true;
    }
    return false;
  }

  const gate = savedCloudConfigGate();
  if (!gate.ok) {
    if (gate.configured) {
      recordHashSyncFailure(gate.message, { errorKind: "config_invalid", banner: true, dialog: true, title: "同步配置无效" });
    }
    return false;
  }

  // 自动同步最小间隔。强制触发和 active study idle upload 不被普通间隔拦截。
  var bypassMinInterval = bypassBackoff === true || shouldBypassMinInterval(reason);
  if (!bypassMinInterval && state.lastSyncFinishedAt && Date.now() - state.lastSyncFinishedAt < SYNC_MIN_INTERVAL_MS) {
    var syncStateForSkip = ensureHashSyncState(state.syncHashState);
    appendAuditEvent({ type: "sync:skip_min_interval", message: "session=" + TAB_ID + " reason=" + reason + " remaining=" + (SYNC_MIN_INTERVAL_MS - (Date.now() - state.lastSyncFinishedAt)) });
    if (syncStateForSkip.localDirty) {
      var remainingMs = SYNC_MIN_INTERVAL_MS - (Date.now() - state.lastSyncFinishedAt) + 300;
      if (state.view === "flash" && typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
      else scheduleSyncSoon("min_interval_reschedule", remainingMs);
    }
    return false;
  }

  if (typeof preparePendingStudyFlushForSync === "function") {
    preparePendingStudyFlushForSync(reason); // pre_facts_prepare_marker
  }
  const preFacts = currentSyncFacts({ persistHash: true });
  if (reason === "heartbeat" && !preFacts.effectiveDirty && !isForcedRemoteCheckReason(reason)) {
    var lastPollAt = Number(state.lastCleanRemotePollAt || 0);
    if (lastPollAt && Date.now() - lastPollAt < SYNC_CLEAN_REMOTE_POLL_MS) {
      return false;
    }
  }
  if (shouldSkipSyncForBackoff(bypassBackoff || shouldBypassMinInterval(reason))) {
    var backoffState = ensureHashSyncState(state.syncHashState);
    var retryAt = Date.parse(backoffState.nextRetryAt || "");
    var retryDelay = Number.isFinite(retryAt) ? Math.max(1000, retryAt - Date.now()) : 30000;
    if (backoffState.localDirty || (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) {
      scheduleSyncSoon("backoff_retry", retryDelay);
    }
    appendAuditEvent({ type: "sync:skip_backoff", message: "session=" + TAB_ID + " reason=" + reason + " retryIn=" + retryDelay });
    return false;
  }
  if (!tryAcquireCrossTabSyncLock(reason)) {
    var lockInfo = typeof readCrossTabSyncLock === "function" ? readCrossTabSyncLock() : null;
    var lockState = ensureHashSyncState(state.syncHashState);
    setHashSyncStatus(lockState.localDirty ? "dirty" : "local_only", lockState.localDirty ? "本地已保存，等待上一轮同步锁释放后上传" : "本地可用，等待上一轮同步锁释放");
    appendAuditEvent({ type: "sync:skip_cross_tab_lock", message: "session=" + TAB_ID + " reason=" + reason + " owner=" + String(lockInfo && lockInfo.owner || "") + " lockReason=" + String(lockInfo && lockInfo.reason || "") + " expiresIn=" + String(lockInfo && lockInfo.expiresAt ? lockInfo.expiresAt - Date.now() : "") });
    var lockRetryDelay = Math.max(3000, Math.min(15000, Number(lockInfo && lockInfo.expiresAt || 0) - Date.now() + 500));
    if (reason === "active_study_idle_upload" && typeof scheduleActiveStudyUpload === "function") {
      state.pendingActiveStudyUpload = true;
      scheduleActiveStudyUpload(lockRetryDelay);
    } else if (lockState.localDirty) {
      scheduleSyncSoon("cross_tab_lock_retry", lockRetryDelay);
    }
    return false;
  }

  const runId = ++state.syncRunSeq;
  state.syncRunId = runId;
  state.isSyncing = true;
  state.syncStartedAt = Date.now();
  state.syncLastProgressAt = state.syncStartedAt;
  state.syncLastProgressStage = "sync:start";
  appendAuditEvent({ type: "sync:start", message: "session=" + TAB_ID + " reason=" + reason + " runId=" + runId });
  state.syncActuallyStarted = true;
  state.syncStartedAtMs = Date.now();
  if (typeof preparePendingStudyFlushForSync === "function") {
    preparePendingStudyFlushForSync(reason);
  }
  const localRevisionAtStart = state.localBusinessRevision || 0;
  const localHashAtStart = businessPayloadHash(collectSyncPayload());
  setSyncStatus("syncing");
  markSyncProgress("sync:start", runId);

  var syncResult = { ok: false, unknown: true };
  var startedAtMs = Date.now();

  try {
    state.syncMeta = ensureSyncMeta(state.syncMeta);
    state.syncMeta.lastSyncAttemptAt = beijingISOString();
    persistSyncMeta();

    markSyncProgress("remote:get:start", runId);
    const remote = await fetchGistSyncPayload();
    markSessionRemoteChecked(remote, runId, "syncTick.remote_get");
    markSyncProgress("remote:get:done", runId);
    if (isStaleSyncRun(runId)) return false;

    const remotePayload = currentRemotePayload(remote);
    const remoteHash = currentRemoteHash(remote);

    if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") {
      recordHashSyncFailure(remote.reason || "云端 sync.json 无法安全解析，已停止自动同步", {
        errorKind: remote.kind === "v2_unknown_ops" ? "remote_v2_unknown_ops" : "remote_invalid",
        banner: true,
        dialog: true,
        runId,
        technical: remote.reason || "",
        remote,
        remoteHash,
        remoteHasBusinessData: remoteHasBusinessPayload(remote),
        readOnly: remote.readOnlyAuthFallback === true
      });
      return false;
    }

    if (!isRemoteValidKind(remote.kind) && !isRemoteEmptyKind(remote.kind)) {
      recordHashSyncFailure("云端 sync.json 状态未知，已停止同步", { errorKind: "remote_invalid", banner: true, dialog: true, runId, technical: remote.kind || "unknown", remote, remoteHash, remoteHasBusinessData: remoteHasBusinessPayload(remote), readOnly: remote.readOnlyAuthFallback === true });
      return false;
    }

    if (remote.authenticatedRead === true && state.syncMeta.readOnlyMode !== true) {
      state.syncMeta.cloudWritable = state.syncMeta.cloudWritable === true;
    }
    persistSyncMeta();
    appendAuditEvent({
      type: "sync:remote_transport",
      message: "session=" + TAB_ID + " runId=" + runId + " transport=" + String(remote.readTransport || "unknown") + " authenticated=" + String(remote.authenticatedRead === true)
    });

    markSyncProgress("recovery:check:start", runId);
    if (ensureHashSyncState(state.syncHashState).localRecoveryRequired) {
      const recovery = tryRestoreFromBackupIfPayloadEmpty({ runId });
      if (recovery.status === "restore_failed") return false;
    }
    markSyncProgress("recovery:check:done", runId);

    let local = refreshLocalPayloadHash({ persist: true });
    let facts = currentSyncFacts({ persistHash: false });

    var schemaCheckResult = handleBusinessHashSchemaRemoteCheck(remote, facts, runId);
    if (schemaCheckResult) {
      syncResult = schemaCheckResult;
      return syncResult;
    }
    if (ensureHashSyncState(state.syncHashState).localDirty) {
      facts = currentSyncFacts({ persistHash: false });
    }

    if (!hasBusinessData(facts.payload)) {
      const recovery = tryRestoreFromBackupIfPayloadEmpty({ runId });
      if (recovery.status === "restore_failed") return false;
      if (recovery.status === "restored") {
        local = refreshLocalPayloadHash({ persist: true });
        facts = currentSyncFacts({ persistHash: false });
      }
    }

    const syncState = ensureHashSyncState(state.syncHashState);
    if (clearStaleDirtyIfRemoteMatches(remote, facts, runId)) {
      syncResult = { ok: true, staleDirtyCleared: true };
      return syncResult;
    }
    facts = currentSyncFacts({ persistHash: false });
    const effectiveDirty = facts.effectiveDirty;
    const localHasBusinessData = hasBusinessData(facts.payload);
    const remoteHasData = remoteHasBusinessPayload(remote);
    const remoteEmpty = remoteIsEmptyPayload(remote);
    const readOnly = ensureSyncMeta(state.syncMeta).readOnlyMode === true;

    if (typeof decideSyncAction === "function") {
      const syncDecision = decideSyncAction({ remote, facts, syncState, remoteHash, reason, runId });
      if (typeof appendSyncDecisionAudit === "function") appendSyncDecisionAudit(syncDecision);
    }

    if (remoteEmpty && localHasBusinessData) {
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=empty_cloud_protect_local remoteKind=" + (remote && remote.kind) + " readOnly=" + readOnly + " runId=" + runId });
      const message = readOnly
        ? "只读模式：云端为空，但本地有学习数据。已阻止云端空数据覆盖本地。请更换可写 PAT 后重新同步。"
        : "云端 sync.json 是空数据，但本机仍有学习记录。已阻止云端空数据覆盖本地。";
      markHashDirty(facts.localPayloadHash, message, { runId });
      const fields = makeSyncRiskProblemFields(remote, facts, { remoteHash, remoteHasBusinessData: remoteHasData, readOnly, runId });
      if (readOnly) {
        showSyncProblemDialog({
          severity: "warning",
          code: "READONLY_REMOTE_EMPTY_LOCAL_HAS_DATA",
          title: "只读模式下已保护本地数据",
          message: "当前 PAT 不能写入 Gist。云端 sync.json 是空数据，但本机仍有学习记录，因此没有把云端空数据拉到本机。请更换可写 PAT 后重新同步。",
          technical: syncRiskTechnicalText(fields),
          canRetry: true,
          canCopy: true,
          ...fields
        });
      } else {
        appendAuditEvent({ type: "sync:remote_empty_local_data_auto_push", message: "session=" + TAB_ID + " runId=" + runId + " localHash=" + String(facts.localPayloadHash || "").slice(0, 8) });
      }

      if (!readOnly) {
        syncResult = await syncBranchPushLocal({
          remote,
          local: facts,
          keepalive,
          reason: "remote_empty_protect_local",
          runId,
          remoteHashAtDecision: remoteHash
        });
        return syncResult;
      }

      markReadOnlyDirtyState(message, facts, { runId });
      return false;
    }

    if (!localHasBusinessData) {
      if (remoteEmpty) {
        state.syncHashState = ensureHashSyncState(state.syncHashState);
        state.syncHashState.localDirty = false;
        state.syncHashState.localPayloadHash = facts.localPayloadHash || local.hash || "";
        state.syncHashState.baseRemoteHash = "";
        state.syncHashState.dirtySince = "";
        state.syncHashState.lastSyncStatus = "local_only";
        state.syncHashState.lastSyncError = "";
        state.syncHashState.localRecoveryRequired = false;
        persistHashSyncState();
        updateSyncIndicator();
        return true;
      }

      if (remoteHasData) {
        appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=pull_remote remoteKind=" + (remote && remote.kind) + " runId=" + runId });
        if (hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)) {
          const recheck = currentSyncFacts({ persistHash: true });
          if (readOnly) {
            return syncBranchReadOnlyMergeLocal({ remote, remotePayload, local: recheck, reason: "local_changed_before_pull_read_only", runId });
          }
          syncResult = await syncBranchMerge({ remote, remotePayload, local: recheck, keepalive, reason: "local_changed_before_pull", runId });
          return syncResult;
        }
        syncResult = await Promise.resolve(pullRemotePayload({ remote, remotePayload, remoteHash, reason, runId, localRevisionAtStart, localHashAtStart }));
        return syncResult;
      }

      recordHashSyncFailure("云端 sync.json 无法判断为安全可拉取数据，已停止同步", {
        errorKind: "remote_unreadable_payload",
        banner: true,
        dialog: true,
        runId,
        remote,
        remoteHash,
        remoteHasBusinessData: remoteHasData,
        readOnly,
        technical: "remote.kind=" + String(remote && remote.kind || "")
      });
      return false;
    }

    if (readOnly) {
      if (remoteHasData && remoteHash !== syncState.baseRemoteHash) {
        // Read-only mode still merges instead of overwriting. If the merged result is
        // identical to remote, the branch is marked clean without requiring a PATCH.
        syncResult = await syncBranchReadOnlyMergeLocal({
          remote,
          remotePayload,
          local: facts,
          reason: (!effectiveDirty && !syncState.localDirty)
            ? "read_only_remote_changed_local_clean_merge"
            : "read_only_remote_changed_local_dirty",
          runId
        });
        return syncResult;
      }
      if (effectiveDirty) {
        markReadOnlyDirtyState("本地有未上传数据，但 PAT 无效或无写权限，当前无法上传。", facts, { runId });
        syncResult = { ok: false, readOnlyDirty: true };
        return syncResult;
      }
      setReadOnlySyncState("PAT 无效或无写权限，当前只读。", { runId });
      syncResult = { ok: false, readOnly: true };
      return syncResult;
    }

    if (remoteHash === syncState.baseRemoteHash && !effectiveDirty) {
      markSessionRemoteChecked(remote, runId, "syncTick.noop_same_hash");
      syncResult = { ok: true, noop: true };
      return syncResult;
    }

    if (remoteHash === syncState.baseRemoteHash && effectiveDirty) {
      if (typeof appendHashDiffSummary === "function") appendHashDiffSummary(facts.payload, runId, reason);
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=push_local hash_match dirty=true runId=" + runId });
      syncResult = await syncBranchPushLocal({ remote, local: facts, keepalive, reason, runId, remoteHashAtDecision: remoteHash });
      return syncResult;
    }

    if (remoteHash !== syncState.baseRemoteHash) {
      if (!remoteHasData) {
        recordHashSyncFailure("云端 sync.json 无法安全解析为可合并数据，已停止自动同步", {
          errorKind: "remote_invalid",
          banner: true,
          dialog: true,
          runId,
          remote,
          remoteHash,
          remoteHasBusinessData: remoteHasData,
          readOnly,
          technical: "remote.kind=" + String(remote && remote.kind || "")
        });
        syncResult = { ok: false, remoteInvalid: true };
        return syncResult;
      }

      // Any remote change is merged. A device marked clean may still hold records that
      // another stale device overwrote after this device's last successful upload.
      const localForMerge = hasUserLocalChangeSinceSyncStart(localRevisionAtStart, localHashAtStart, runId)
        ? currentSyncFacts({ persistHash: true })
        : facts;
      const mergeReason = (!effectiveDirty && !syncState.localDirty)
        ? "clean_local_remote_changed_safe_merge"
        : "dirty_local_remote_changed_merge";
      appendAuditEvent({ type: "sync:decision", message: "session=" + TAB_ID + " branch=merge_remote_changed remoteHash=" + String(remoteHash || "").slice(0, 8) + " baseHash=" + String(syncState.baseRemoteHash || "").slice(0, 8) + " localHash=" + String(localForMerge.localPayloadHash || "").slice(0, 8) + " runId=" + runId });
      syncResult = await syncBranchMerge({ remote, remotePayload, local: localForMerge, keepalive, reason: mergeReason, runId });
      return syncResult;
    }

    // Should not reach here with correct branching above
    syncResult = { ok: false, unknown: true };
    return syncResult;
  } catch (error) {
    if (!isStaleSyncRun(runId)) {
      if (shouldDowngradeFailureForBackground(reason)) {
        appendAuditEvent({ type: "sync:pagehide_flush_deferred", message: "session=" + TAB_ID + " runId=" + runId + " reason=" + reason + " dirty_preserved=true error=" + syncErrorMessage(error) });
      } else {
        var normalizedRequestError = normalizeSyncRequestError(error);
        var showImmediateFailure = typeof isUserInitiatedSyncReason === "function" && isUserInitiatedSyncReason(reason);
        recordHashSyncFailure(syncErrorMessage(error), {
          errorKind: normalizedRequestError.rateLimited === true ? "rate_limited" : "remote_get_failed",
          title: "云同步请求失败",
          banner: showImmediateFailure,
          dialog: showImmediateFailure,
          retryable: true,
          runId,
          httpStatus: Number(normalizedRequestError.httpStatus || 0),
          stage: normalizedRequestError.stage || "remote_get",
          transport: normalizedRequestError.transport || "",
          nextRetryAt: normalizedRequestError.retryAt || "",
          technical: requestErrorTechnical(error) + (error && error.technical ? "\n" + error.technical : "")
        });
      }
    }
    syncResult = { ok: false, error: true };
    return syncResult;
  } finally {
    if (!isStaleSyncRun(runId)) {
      markSyncProgress("sync:finalize", runId);
      var elapsedMs = Date.now() - startedAtMs;

      // sync:complete = syncTick 流程结束（不一定已 cloud_saved）
      // sync:mark_clean = 已确认云端保存或加载
      // sync:local_changed_during_verify = 上一轮云端已写入，但本地又产生新变化
      // sync:failed = 真失败
      appendAuditEvent({
        type: "sync:complete",
        message: "session=" + TAB_ID + " runId=" + runId + " elapsed=" + elapsedMs + "ms reason=" + (reason || "") + " result=" + summarizeSyncResult(syncResult)
      });

      state.isSyncing = false;
      state.syncStartedAt = 0;
      state.syncActuallyStarted = false;
      state.syncStartedAtMs = 0;
      state.syncLastProgressAt = 0;
      state.lastSyncFinishedAt = Date.now();
      if (typeof clearActiveStudyTimerIfClean === "function") clearActiveStudyTimerIfClean();
      refreshVisibleSyncDiagnostics();
      if (typeof refreshCurrentBusinessViewAfterSync === "function") refreshCurrentBusinessViewAfterSync();
      var finalSyncState = ensureHashSyncState(state.syncHashState);
      var finalHashDirty = Boolean(finalSyncState.baseRemoteHash && finalSyncState.localPayloadHash && finalSyncState.localPayloadHash !== finalSyncState.baseRemoteHash);
      var finalPendingStudy = typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists();
      if ((finalPendingStudy || finalSyncState.localDirty || finalHashDirty) && typeof scheduleActiveStudyUpload === "function") {
        if (state.view === "flash" && !state.activeStudySyncTimer) {
          scheduleActiveStudyUpload();
        }
      } else if (!finalPendingStudy && !finalSyncState.localDirty && !finalHashDirty) {
        state.pendingActiveStudyUpload = false;
      }
      if (state.syncRequestedAfterCurrent) {
        state.syncRequestedAfterCurrent = false;
        if (finalPendingStudy || finalSyncState.localDirty || finalHashDirty) {
          scheduleSyncSoon("queued_after_current", 1000);
        }
      }
    } else {
      state.syncActuallyStarted = false;
      state.syncStartedAtMs = 0;
    }

    releaseCrossTabSyncLock();
  }
}


