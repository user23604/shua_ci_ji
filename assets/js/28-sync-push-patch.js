"use strict";

// ── P5 merge defense ──────────────────────────────────────────────────

function assertMergeAllowed(local, remote, reason, runId) {
  var facts = local && local.payload ? local : currentSyncFacts({ persistHash: true });
  var syncState = ensureHashSyncState(state.syncHashState);
  var remoteHash = currentRemoteHash(remote);

  var localClean =
    !facts.effectiveDirty &&
    syncState.localDirty !== true &&
    String(facts.localPayloadHash || "") === String(syncState.baseRemoteHash || "");

  var remoteChanged =
    remoteHash &&
    String(remoteHash) !== String(syncState.baseRemoteHash || "");

  // ONLY block: clean local + remote changed
  // Do NOT block: dirty local + remote changed, preflightChanged, verify mismatch
  if (localClean && remoteChanged) {
    appendAuditEvent({
      type: "sync:merge_blocked_clean_local",
      message: "session=" + TAB_ID + " runId=" + runId + " reason=" + String(reason || "")
    });
    return false;
  }
  return true;
}

async function syncBranchPushLocal({ remote, local, keepalive, reason, runId, remoteHashAtDecision, rebaseCount = 0, patch409Retries = 0 }) {
  if (isStaleSyncRun(runId)) return false;
  const currentLocal = local && local.payload ? local : refreshLocalPayloadHash({ persist: true });
  const payload = normalizeSyncPayload(currentLocal.payload);
  writeHashBackup("pre_push", payload, reason);
  const uploadedHash = businessPayloadHash(payload);
  const result = await patchBusinessPayloadToGist(payload, { remote, keepalive, runId, remoteHashAtDecision: remoteHashAtDecision || currentRemoteHash(remote) });
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
    if (mergeResult && mergeResult.needPull) {
      return await Promise.resolve(pullRemotePayload({ remote: latestRemote, remotePayload: currentRemotePayload(latestRemote), remoteHash: currentRemoteHash(latestRemote), reason: "merge_blocked_clean_local_pull", runId, localRevisionAtStart: state.localBusinessRevision, localHashAtStart: "", allowCleanLocalOverwrite: true }));
    }
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
  if (!assertMergeAllowed(local, remote, reason, runId)) {
    return { ok: false, mergeBlockedCleanLocal: true, needPull: true };
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
  const result = await patchBusinessPayloadToGist(mergedPayload, { remote, keepalive, runId, remoteHashAtDecision: currentRemoteHash(remote) });
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
    if (mergeResult409 && mergeResult409.needPull) {
      return await Promise.resolve(pullRemotePayload({ remote, remotePayload, remoteHash: currentRemoteHash(remote), reason: "merge_blocked_clean_local_pull", runId, localRevisionAtStart: state.localBusinessRevision, localHashAtStart: "", allowCleanLocalOverwrite: true }));
    }
    return mergeResult409;
  }
  if (result.preflightChanged) {
    if (rebaseCount >= MAX_PREFLIGHT_REBASE) {
      recordHashSyncFailure("云端在上传前连续变化，已停止自动上传。本地数据仍保留，请稍后重新同步。", { errorKind: "preflight_remote_changed", banner: true, dialog: true, runId, remote: result.remote, remoteHash: currentRemoteHash(result.remote), remoteHasBusinessData: remoteHasBusinessPayload(result.remote), readOnly: result.remote && result.remote.readOnlyAuthFallback === true });
      return false;
    }
    const latestRemote = result.remote;
    var mergeResult = await syncBranchMerge({ remote: latestRemote, remotePayload: currentRemotePayload(latestRemote), local: currentSyncFacts({ persistHash: true }), keepalive, reason: result.verifyMismatch ? "verify_mismatch_rebase" : "preflight_rebase", runId, rebaseCount: rebaseCount + 1 });
    if (mergeResult && mergeResult.needPull) {
      return await Promise.resolve(pullRemotePayload({ remote: latestRemote, remotePayload: currentRemotePayload(latestRemote), remoteHash: currentRemoteHash(latestRemote), reason: "merge_blocked_clean_local_pull", runId, localRevisionAtStart: state.localBusinessRevision, localHashAtStart: "", allowCleanLocalOverwrite: true }));
    }
    return mergeResult;
  }
  if (!result.ok) return false;
  var finalResult = finalizeVerifiedPatch({ uploadedPayload: mergedPayload, uploadedHash: mergedHash, verifiedRemote: result.remote, runId });
  if (finalResult && finalResult.localChangedDuringVerify) {
    return finalResult;
  }
  return finalResult;
}


function buildSyncEnvelope(payload) {
  const normalized = normalizeSyncPayload(payload);
  const payloadHash = businessPayloadHash(normalized);
  return {
    version: 1,
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    updatedAt: beijingISOString(),
    clientId: ensureSyncMeta(state.syncMeta).clientId,
    payloadHash,
    payload: normalized
  };
}


async function patchBusinessPayloadToGist(payload, { remote, keepalive = false, runId, remoteHashAtDecision = "" } = {}) {
  const normalized = normalizeSyncPayload(payload);
  if (!validateSyncPayload(normalized)) {
    recordHashSyncFailure("准备上传的数据校验失败", { errorKind: "patch_failed", banner: true, dialog: true, runId });
    return { ok: false };
  }

  // P0.8: PATCH 事务锁 — 包住 preflight GET + PATCH + verify GET 全过程
  if (!beginPatchTransaction(runId, "patchBusinessPayloadToGist")) {
    appendAuditEvent({ type: "sync:blocked_patch_in_flight", message: "session=" + TAB_ID + " runId=" + runId });
    return { ok: false, patchInFlight: true, retryable: true };
  }

  try {
    markSyncProgress("preflight:get:start", runId);
    let latestRemote;
    try {
      latestRemote = await fetchGistSyncPayload();
      markSessionRemoteChecked(latestRemote, runId, "patch.preflight");
    } catch (error) {
      recordHashSyncFailure("PATCH 前 preflight GET 失败：" + (error && error.message || "unknown"), { errorKind: "remote_get_failed", banner: true, dialog: true, runId });
      return { ok: false };
    }
    markSyncProgress("preflight:get:done", runId);
    if (isStaleSyncRun(runId)) return { ok: false };
    if (latestRemote.kind === "invalid" || latestRemote.kind === "v2_unknown_ops") {
      recordHashSyncFailure("PATCH 前发现云端 sync.json 无法安全解析，已停止上传", { errorKind: latestRemote.kind, banner: true, dialog: true, runId, technical: latestRemote.reason || "" });
      return { ok: false };
    }
    const latestRemoteHash = currentRemoteHash(latestRemote);
    if (String(latestRemoteHash || "") !== String(remoteHashAtDecision || "")) {
      return { ok: false, preflightChanged: true, remote: latestRemote };
    }

    const envelope = buildSyncEnvelope(normalized);
    const payloadJson = JSON.stringify(envelope, null, 2);
    const today = localDateKey();
    const files = {};
    files[SYNC_FILE_NAME] = { content: payloadJson };
    files[SYNC_BACKUP_FILE_NAME] = { content: (remote && remote.rawContent) || "{}" };
    files[SYNC_CLOUD_BACKUP_PREFIX + today + ".json"] = { content: payloadJson };

    let response;
    try {
      markSyncProgress("patch:start", runId);
      appendAuditEvent({ type: "sync:patch_sent", message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(businessPayloadHash(normalized)).slice(0, 8) });
      response = await fetchWithTimeout("https://api.github.com/gists/" + encodeURIComponent(state.cloud.gistId), {
        method: "PATCH",
        keepalive,
        headers: {
          Authorization: "Bearer " + state.cloud.token,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ files })
      }, GITHUB_PATCH_TIMEOUT_MS);
      markSyncProgress("patch:done", runId);
    } catch (error) {
      recordHashSyncFailure("网络请求失败：" + (error && error.message || "unknown"), { errorKind: "patch_failed", banner: true, dialog: true, runId });
      return { ok: false };
    }

    if (!response.ok) {
      // 409 Conflict: GitHub Gist 并发/短时间连续更新冲突，可重试
      if (response.status === 409) {
        appendAuditEvent({ type: "sync:patch_409", message: "session=" + TAB_ID + " runId=" + runId + " HTTP 409", httpStatus: 409 });
        await delay(1000 + Math.floor(Math.random() * 500));
        var recheckRemote;
        try {
          recheckRemote = await fetchGistSyncPayload();
        } catch (_) {
          recheckRemote = null;
        }
        if (recheckRemote && isRemoteValidKind(recheckRemote.kind)) {
          var recheckHash = currentRemoteHash(recheckRemote);
          var uploadedHash409 = businessPayloadHash(normalized);
          // 虽然 PATCH 返回 409，但云端内容已是本轮内容
          if (recheckHash === uploadedHash409) {
            return { ok: true, remote: recheckRemote, uploadedHash: uploadedHash409 };
          }
          // 远端已变 → 走 rebase
          if (String(recheckHash || "") !== String(remoteHashAtDecision || "")) {
            return { ok: false, preflightChanged: true, remote: recheckRemote };
          }
        }
        // 远端没变但 GitHub 仍拒绝 → 上层重试
        return { ok: false, retryableConflict: true, httpStatus: 409 };
      }
      // 422: 请求内容/格式错误，不可重试
      var is422 = response.status === 422;
      const classified = await classifyGithubResponseError(response, "PATCH sync.json");
      recordHashSyncFailure(classified.message, { errorKind: is422 ? "patch_failed_422" : "patch_failed_network", banner: true, dialog: true, runId, httpStatus: response.status, technical: classified.technical });
      return { ok: false, fatal: true, httpStatus: response.status, message: classified.message, technical: classified.technical };
    }

    const uploadedHash = businessPayloadHash(normalized);
    appendAuditEvent({ type: "sync:patch_success", message: "session=" + TAB_ID + " runId=" + runId + " uploadedHash=" + String(uploadedHash).slice(0, 8) });
    let verified;
    try {
      markSyncProgress("verify:get:start", runId);
      appendAuditEvent({ type: "sync:verify_start", message: "session=" + TAB_ID + " runId=" + runId });
      verified = await fetchGistSyncPayload();
      markSessionRemoteChecked(verified, runId, "patch.verify");
      markSyncProgress("verify:get:done", runId);
      appendAuditEvent({ type: "sync:verify_done", message: "session=" + TAB_ID + " runId=" + runId + " verifiedHash=" + String(currentRemoteHash(verified) || "").slice(0, 8) });
    } catch (error) {
      recordHashSyncFailure("PATCH 成功但 GET 校验失败：" + (error && error.message || "unknown"), { errorKind: "verify_failed", banner: true, dialog: true, runId });
      return { ok: false };
    }

    if (!isRemoteValidKind(verified.kind)) {
      recordHashSyncFailure("PATCH 成功但云端 sync.json 无法通过校验", { errorKind: "verify_failed", banner: true, dialog: true, runId, technical: verified.reason || verified.kind || "" });
      return { ok: false };
    }
    const verifiedHash = currentRemoteHash(verified);
    if (verifiedHash !== uploadedHash) {
      // P0.8: verify mismatch → recheck，不立即 fatal
      appendAuditEvent({ type: "sync:verify_mismatch", message: "session=" + TAB_ID + " runId=" + runId + " expected=" + String(uploadedHash).slice(0, 8) + " actual=" + String(verifiedHash).slice(0, 8) });
      await delay(1200);
      var recheck;
      try {
        recheck = await fetchGistSyncPayload();
        markSessionRemoteChecked(recheck, runId, "patch.verify_mismatch_recheck");
      } catch (_) {
        recheck = null;
      }
      if (recheck) {
        var recheckHash = currentRemoteHash(recheck);
        if (recheckHash === uploadedHash) {
          appendAuditEvent({ type: "sync:verify_recheck_matched", message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(uploadedHash).slice(0, 8) });
          return { ok: true, remote: recheck, uploadedHash };
        }
        if (isRemoteValidKind(recheck.kind)) {
          appendAuditEvent({ type: "sync:verify_recheck_remote_changed", message: "session=" + TAB_ID + " runId=" + runId + " expected=" + String(uploadedHash).slice(0, 8) + " actual=" + String(recheckHash).slice(0, 8) });
          return { ok: false, preflightChanged: true, remote: recheck, verifyMismatch: true };
        }
      }
      recordHashSyncFailure("PATCH 成功但云端内容 hash 不匹配", { errorKind: "verify_failed", banner: true, dialog: true, runId, technical: "expected=" + uploadedHash + ", actual=" + (recheck && currentRemoteHash(recheck) || String(verifiedHash)) });
      return { ok: false, verifyFailed: true };
    }
    return { ok: true, remote: verified, uploadedHash };
  } finally {
    endPatchTransaction(runId);
  }
}


function finalizeVerifiedPatch({ uploadedPayload, uploadedHash, verifiedRemote, runId }) {
  if (isStaleSyncRun(runId)) return false;
  markSyncProgress("sync:finalize", runId);
  const current = refreshLocalPayloadHash({ persist: false });
  if (current.hash !== uploadedHash) {
    var now = beijingISOString();
    state.syncHashState = ensureHashSyncState(state.syncHashState);

    // 云端已确认 uploadedHash
    state.syncHashState.baseRemoteHash = uploadedHash;
    state.syncHashState.lastSuccessfulPushAt = now;
    state.syncHashState.lastSyncedPayloadHash = uploadedHash;

    // 当前本地又变，保持 dirty
    state.syncHashState.localPayloadHash = current.hash;
    state.syncHashState.localDirty = true;
    if (!state.syncHashState.dirtySince) {
      state.syncHashState.dirtySince = now;
    }

    state.syncHashState.lastSyncStatus = "dirty";
    state.syncHashState.lastSyncError = "";
    state.syncHashState.lastSyncErrorAt = "";

    persistHashSyncState();
    updateLegacyMetaAfterRemote(verifiedRemote, uploadedHash, "push");

    appendAuditEvent({
      type: "sync:local_changed_during_verify",
      message:
        "session=" + TAB_ID +
        " runId=" + runId +
        " uploadedHash=" + String(uploadedHash || "").slice(0, 8) +
        " currentHash=" + String(current.hash || "").slice(0, 8)
    });

    scheduleSyncSoon("local_changed_during_verify", 2500);
    refreshVisibleSyncDiagnostics();

    return { ok: false, localChangedDuringVerify: true };
  }
  markHashCleanFromRemote(verifiedRemote, uploadedHash, "cloud_saved", { runId: runId, remoteVerified: true });
  return true;
}

function buildPushSnapshot(payloadToPush, opIdsToClear) {
  var payload = normalizeSyncPayload(payloadToPush || collectSyncPayload());
  return {
    pushedOpIds: Array.isArray(opIdsToClear) ? opIdsToClear.filter(Boolean) : [],
    pushedPayload: payload,
    pushedPayloadHash: stableStringifyHash(payload),
    localUpdatedAtAtBuild: payload.updatedAt || state.syncMeta.localUpdatedAt || beijingISOString(),
    payloadBuiltAt: beijingISOString()
  };
}


function clearPendingOpsByIds(opIds) {
  var idSet = new Set((Array.isArray(opIds) ? opIds : []).filter(Boolean));
  var remaining = loadPendingOpsStore().ops.filter(function(op) { return !idSet.has(op.opId); });
  savePendingOpsStore({ ops: remaining });
}


function markCloudSaveConfirmed() {
  // P0: 已废弃。P0 使用 finalizeVerifiedPatch() → markHashCleanFromRemote()。
  throw new Error("markCloudSaveConfirmed 已废弃，请使用 finalizeVerifiedPatch");
}


function recordSyncError(message, httpStatus) {
  httpStatus = httpStatus || 0;
  var now = beijingISOString();
  state.syncMeta.lastSyncErrorAt = now;
  state.syncMeta.lastSyncErrorMessage = message;
  state.syncMeta.lastSyncAttemptAt = now;
  state.consecutivePushFailures += 1;
  persistSyncMeta();
  appendAuditEvent({ type: "push:failed", message: message, httpStatus: httpStatus });
  updateSyncIndicator();
}


async function verifyRemoteContentAfterPatch(gistId, snapshot) {
  // P0: 业务同步决策只看 sync.json 内容 hash，不依赖 gist.history[0].version
  try {
    var response = await fetchWithTimeout(
      "https://api.github.com/gists/" + encodeURIComponent(gistId),
      { headers: { Authorization: "Bearer " + state.cloud.token, Accept: "application/vnd.github+json" } }
    );
    if (!response.ok) return { verified: false, reason: "GET verify failed: " + response.status };
    var gist = await response.json();
    var syncFile = gist.files && gist.files[SYNC_FILE_NAME];
    var content = syncFile && syncFile.content;
    if (!content) return { verified: false, reason: "远端 sync.json 不存在" };
    var parsed = parseSyncPayloadContent(content);
    if (!isRemoteValidKind(parsed.kind)) return { verified: false, reason: "远端 sync.json 无效" };
    var remoteHash = businessPayloadHash(parsed.payload || parsed.snapshot);
    if (remoteHash === snapshot.pushedPayloadHash) {
      // P0: hash 匹配即确认内容一致。revision 仅用于 audit，从 PATCH 响应中取
      var confirmedRevision = (gist.history && gist.history[0] && gist.history[0].version) || "";
      return { verified: true, revision: confirmedRevision || "hash-confirmed" };
    }
    return { verified: false, reason: "hash mismatch: expected " + snapshot.pushedPayloadHash.slice(0, 8) + "…" };
  } catch (e) {
    return { verified: false, reason: "verify request error: " + (e && e.message) };
  }
}

// ── 本地数据保护 ──────────────────────────────────────────────────────


