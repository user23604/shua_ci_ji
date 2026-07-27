"use strict";

// ── merge defense ──────────────────────────────────────────────────

async function syncBranchPushLocal({ remote, local, keepalive, reason, runId, remoteHashAtDecision, rebaseCount = 0, patch409Retries = 0 }) {
  if (isStaleSyncRun(runId)) return false;
  if (typeof shouldAbortAutoPatchForActiveStudy === "function" && shouldAbortAutoPatchForActiveStudy(reason)) {
    appendAuditEvent({ type: "sync:defer_active_study_before_patch", message: "session=" + TAB_ID + " runId=" + runId + " reason=" + String(reason || "") + " elapsedSinceStudyAction=" + String(Date.now() - (typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0))) });
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
    return { ok: false, deferredActiveStudy: true };
  }
  const currentLocal = local && local.payload ? local : refreshLocalPayloadHash({ persist: true });
  const payload = normalizeSyncPayload(currentLocal.payload);
  writeHashBackup("pre_push", payload, reason);
  const uploadedHash = businessPayloadHash(payload);
  const result = await patchBusinessPayloadToGist(payload, { remote, keepalive, runId, reason, remoteHashAtDecision: remoteHashAtDecision || currentRemoteHash(remote) });
  if (isStaleSyncRun(runId)) return false;
  // 409 retryable conflict: 延迟后重试，不超过 MAX_PATCH_409_RETRIES
  if (result.retryableConflict) {
    if (patch409Retries >= MAX_PATCH_409_RETRIES) {
      recordHashSyncFailure("GitHub Gist 并发更新冲突，已重试" + MAX_PATCH_409_RETRIES + "次仍失败。本地数据已保留，请稍后重新同步。", { errorKind: "patch_conflict_409", banner: true, dialog: true, runId, httpStatus: 409 });
      return false;
    }
    appendAuditEvent({ type: "sync:patch_retry", message: "session=" + TAB_ID + " runId=" + runId + " 409 retry " + (patch409Retries + 1) + "/" + MAX_PATCH_409_RETRIES, httpStatus: 409 });
    await delay(1200);
    return await syncBranchPushLocal({ remote, local: currentSyncFacts({ persistHash: true }), keepalive, reason: "patch_409_retry", runId, remoteHashAtDecision, rebaseCount, patch409Retries: patch409Retries + 1 });
  }
  if (result.preflightChanged) {
    if (rebaseCount >= MAX_PREFLIGHT_REBASE) {
      recordHashSyncFailure("云端在上传前连续变化，已停止自动上传。本地数据仍保留，请稍后重新同步。", { errorKind: "preflight_remote_changed", banner: true, dialog: true, runId, remote: result.remote, remoteHash: currentRemoteHash(result.remote), remoteHasBusinessData: remoteHasBusinessPayload(result.remote), readOnly: result.remote && result.remote.readOnlyAuthFallback === true });
      return false;
    }
    const latestRemote = result.remote;
    var mergeResult = await syncBranchMerge({ remote: latestRemote, remotePayload: currentRemotePayload(latestRemote), local: currentSyncFacts({ persistHash: true }), keepalive, reason: result.verifyMismatch ? "verify_mismatch_rebase" : "preflight_rebase", runId, rebaseCount: rebaseCount + 1 });
    return mergeResult;
  }
  if (!result.ok) return false;
  var finalResult = finalizeVerifiedPatch({ uploadedPayload: payload, uploadedHash, verifiedRemote: result.remote, runId });
  if (finalResult && finalResult.localChangedDuringVerify) {
    return finalResult;
  }
  return finalResult;
}


async function syncBranchMerge({ remote, remotePayload, local, keepalive, reason, runId, rebaseCount = 0, patch409Retries = 0 }) {
  if (isStaleSyncRun(runId)) return false;
  if (typeof shouldAbortAutoPatchForActiveStudy === "function" && shouldAbortAutoPatchForActiveStudy(reason)) {
    appendAuditEvent({ type: "sync:defer_active_study_before_patch", message: "session=" + TAB_ID + " runId=" + runId + " reason=" + String(reason || "") + " stage=merge_before_apply elapsedSinceStudyAction=" + String(Date.now() - (typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0))) });
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
    return { ok: false, deferredActiveStudy: true };
  }
  markSyncProgress("merge:start", runId);
  if (!remotePayload) remotePayload = normalizeSyncPayload({});
  const currentLocal = local && local.payload ? local : refreshLocalPayloadHash({ persist: true });
  writeHashBackup("pre_merge", currentLocal.payload, reason);
  const mergedPayload = normalizeSyncPayload(safeMergePayloads(remotePayload, currentLocal.payload));
  if (!validateSyncPayload(mergedPayload)) {
    recordHashSyncFailure("自动合并后的数据校验失败；本地数据已保留", { errorKind: "merge_failed", banner: true, dialog: true, runId, remote, remoteHash: currentRemoteHash(remote), remoteHasBusinessData: remoteHasBusinessPayload(remote), readOnly: remote && remote.readOnlyAuthFallback === true });
    return false;
  }
  const mergedHash = businessPayloadHash(mergedPayload);
  const applied = applyRemotePayloadSafely(mergedPayload, { source: "sync", expectedHash: mergedHash, runId, reason: reason || "safe_merge_apply" });
  if (!applied) return false;
  const localAfterMergeHash = businessPayloadHash(collectSyncPayload());
  if (localAfterMergeHash !== mergedHash) {
    recordHashSyncFailure("safe merge 写入本地后校验失败，已停止上传", { errorKind: "local_apply_verify_failed", banner: true, dialog: true, runId, remote, remoteHash: currentRemoteHash(remote), remoteHasBusinessData: remoteHasBusinessPayload(remote), readOnly: remote && remote.readOnlyAuthFallback === true, technical: "expected=" + mergedHash + ", actual=" + localAfterMergeHash });
    return false;
  }
  markSyncProgress("merge:done", runId);
  const remoteHashAfterMerge = currentRemoteHash(remote);
  if (remoteHashAfterMerge && mergedHash === remoteHashAfterMerge) {
    markHashCleanFromRemote(remote, mergedHash, "cloud_loaded", { runId, remoteVerified: true });
    if (typeof renderCurrentView === "function") renderCurrentView({ touchProgress: false });
    appendAuditEvent({
      type: "sync:merge_remote_already_complete",
      message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(mergedHash || "").slice(0, 8)
    });
    return { ok: true, merged: true, noPatchNeeded: true };
  }
  const result = await patchBusinessPayloadToGist(mergedPayload, { remote, keepalive, runId, reason, remoteHashAtDecision: remoteHashAfterMerge });
  if (isStaleSyncRun(runId)) return false;
  // 409 retryable conflict: 延迟后重试，不超过 MAX_PATCH_409_RETRIES
  if (result.retryableConflict) {
    if (patch409Retries >= MAX_PATCH_409_RETRIES) {
      recordHashSyncFailure("GitHub Gist 并发更新冲突，已重试" + MAX_PATCH_409_RETRIES + "次仍失败。本地数据已保留，请稍后重新同步。", { errorKind: "patch_conflict_409", banner: true, dialog: true, runId, httpStatus: 409 });
      return false;
    }
    appendAuditEvent({ type: "sync:patch_retry", message: "session=" + TAB_ID + " runId=" + runId + " 409 retry " + (patch409Retries + 1) + "/" + MAX_PATCH_409_RETRIES, httpStatus: 409 });
    await delay(1200);
    var mergeResult409 = await syncBranchMerge({ remote, remotePayload, local: currentSyncFacts({ persistHash: true }), keepalive, reason: "patch_409_retry", runId, rebaseCount, patch409Retries: patch409Retries + 1 });
    return mergeResult409;
  }
  if (result.preflightChanged) {
    if (rebaseCount >= MAX_PREFLIGHT_REBASE) {
      recordHashSyncFailure("云端在上传前连续变化，已停止自动上传。本地数据仍保留，请稍后重新同步。", { errorKind: "preflight_remote_changed", banner: true, dialog: true, runId, remote: result.remote, remoteHash: currentRemoteHash(result.remote), remoteHasBusinessData: remoteHasBusinessPayload(result.remote), readOnly: result.remote && result.remote.readOnlyAuthFallback === true });
      return false;
    }
    const latestRemote = result.remote;
    var mergeResult = await syncBranchMerge({ remote: latestRemote, remotePayload: currentRemotePayload(latestRemote), local: currentSyncFacts({ persistHash: true }), keepalive, reason: result.verifyMismatch ? "verify_mismatch_rebase" : "preflight_rebase", runId, rebaseCount: rebaseCount + 1 });
    return mergeResult;
  }
  if (!result.ok) return false;
  var finalResult = finalizeVerifiedPatch({ uploadedPayload: mergedPayload, uploadedHash: mergedHash, verifiedRemote: result.remote, runId });
  if (finalResult && finalResult.localChangedDuringVerify) {
    return finalResult;
  }
  return finalResult;
}
