"use strict";

function buildSyncEnvelope(payload) {
  const normalized = normalizeSyncPayload(payload);
  const payloadHash = businessPayloadHash(normalized);
  return {
    version: 2,
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    updatedAt: beijingISOString(),
    clientId: ensureSyncMeta(state.syncMeta).clientId,
    payloadHash,
    payload: compactSyncPayloadForTransport(normalized)
  };
}


function buildGistPatchFiles(payloadJson, remote) {
  // 关键业务 PATCH 只包含 sync.json 与当天备份的 upsert。
  // 旧 sync.backup.* 的保留期删除不再混入业务 PATCH：删除条目依赖“远端当前文件列表”，
  // 一旦列表陈旧（对端设备刚清理过，或读回内容命中 GitHub 边缘缓存），对已不存在的
  // 文件再次发送 null 删除会让 GitHub 返回 422 Validation Failed，把一次已成功的
  // 业务写入变成“同步失败”。清理由 maybeCleanupExpiredCloudBackups 在业务写入
  // 确认成功后 best-effort 完成，失败只记警告，不影响同步结果。
  var files = {};
  files[SYNC_FILE_NAME] = { content: payloadJson };

  // 当天首次成功写入时才新增一份远端日备份。普通同步只发送 sync.json，
  // 避免在国内网络下每轮 PATCH 重复传输两到三份完整 payload。
  var todayName = SYNC_CLOUD_BACKUP_PREFIX + localDateKey() + ".json";
  var existingNames = Array.isArray(remote && remote.fileNames) ? remote.fileNames.slice() : [];
  if (!existingNames.includes(todayName)) files[todayName] = { content: payloadJson };
  return files;
}


function isUserInitiatedSyncReason(reason) {
  return ["manual", "manual_retry", "manual_push", "manual_pull", "config_saved", "remote_restore_merge"].includes(String(reason || ""));
}

function setCloudWriteCapability(writable, message) {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.cloudWritable = writable === true;
  state.syncMeta.readOnlyMode = writable !== true;
  if (message) {
    state.syncMeta.lastSyncErrorAt = beijingISOString();
    state.syncMeta.lastSyncErrorMessage = String(message);
  } else if (writable === true) {
    state.syncMeta.lastSyncErrorAt = "";
    state.syncMeta.lastSyncErrorMessage = "";
  }
  persistSyncMeta();
}

function isGithubRateLimitedResponse(response) {
  if (!response) return false;
  var retryAfter = response.headers && response.headers.get ? response.headers.get("retry-after") : "";
  var remaining = response.headers && response.headers.get ? response.headers.get("x-ratelimit-remaining") : "";
  return Number(response.status) === 429 || Boolean(retryAfter) || String(remaining || "") === "0";
}

async function confirmUploadedHashAfterUncertainPatch(uploadedHash, runId, source) {
  try {
    await delay(1200);
    // 确认刚才那次写入是否生效：必须带 PAT 读取，匿名读可能返回写入前的旧缓存。
    var remote = await fetchGistSyncPayload({ forceAuthenticated: true });
    markSessionRemoteChecked(remote, runId, source || "patch.uncertain_confirm");
    if (!isRemoteValidKind(remote.kind)) return { confirmed: false, remote: remote };
    var remoteHash = currentRemoteHash(remote);
    if (String(remoteHash || "") === String(uploadedHash || "")) {
      appendAuditEvent({
        type: "sync:patch_uncertain_confirmed",
        message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(uploadedHash || "").slice(0, 8)
      });
      return { confirmed: true, remote: remote };
    }
    return { confirmed: false, remote: remote, remoteChanged: true };
  } catch (error) {
    appendAuditEvent({
      type: "sync:patch_uncertain_confirm_failed",
      message: "session=" + TAB_ID + " runId=" + runId + " " + requestErrorTechnical(error),
      httpStatus: Number(error && error.httpStatus || 0)
    });
    return { confirmed: false, error: error };
  }
}

async function patchBusinessPayloadToGist(payload, { remote, keepalive = false, runId, reason = "", remoteHashAtDecision = "" } = {}) {
  const normalized = normalizeSyncPayload(payload);
  const uploadedHash = businessPayloadHash(normalized);
  const userInitiated = isUserInitiatedSyncReason(reason);

  if (!validateSyncPayload(normalized)) {
    recordHashSyncFailure("准备上传的数据校验失败", { errorKind: "patch_failed", banner: true, dialog: true, runId });
    return { ok: false };
  }

  if (typeof shouldAbortAutoPatchForActiveStudy === "function" && shouldAbortAutoPatchForActiveStudy(reason)) {
    appendAuditEvent({ type: "sync:defer_active_study_before_patch", message: "session=" + TAB_ID + " runId=" + runId + " reason=" + String(reason || "") + " stage=patch_start" });
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
    return { ok: false, deferredActiveStudy: true };
  }

  // 同一标签页内只允许一个完整的 preflight → PATCH → verify 事务。
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
      const technical = requestErrorTechnical(error);
      const normalizedError = normalizeSyncRequestError(error);
      recordHashSyncFailure("上传前无法读取最新云端数据，本地数据已保留", {
        errorKind: "remote_get_failed",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        httpStatus: Number(error && error.httpStatus || 0),
        stage: normalizedError.stage || "preflight_get",
        transport: normalizedError.transport || "",
        technical: technical
      });
      return { ok: false, retryable: true };
    }
    markSyncProgress("preflight:get:done", runId);

    if (isStaleSyncRun(runId)) return { ok: false };
    if (latestRemote.kind === "invalid" || latestRemote.kind === "v2_unknown_ops") {
      recordHashSyncFailure("上传前发现云端 sync.json 无法安全解析，已停止上传", {
        errorKind: latestRemote.kind,
        banner: true,
        dialog: true,
        runId,
        technical: latestRemote.reason || ""
      });
      return { ok: false };
    }

    const latestRemoteHash = currentRemoteHash(latestRemote);
    if (String(latestRemoteHash || "") !== String(remoteHashAtDecision || "")) {
      return { ok: false, preflightChanged: true, remote: latestRemote };
    }

    if (typeof shouldAbortAutoPatchForActiveStudy === "function" && shouldAbortAutoPatchForActiveStudy(reason)) {
      state.pendingActiveStudyUpload = true;
      if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload();
      return { ok: false, deferredActiveStudy: true };
    }

    const envelope = buildSyncEnvelope(normalized);
    // 云端交换数据使用紧凑 JSON，减少 PATCH 体积和超时概率。
    const payloadJson = JSON.stringify(envelope);
    const payloadBytes = typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(payloadJson).length
      : payloadJson.length;
    if (payloadBytes > GIST_RELIABLE_INLINE_MAX_BYTES) {
      recordHashSyncFailure("同步数据已接近 GitHub Gist 单文件可靠读取上限，已停止上传以避免部分网络环境无法读回。请先导出排查包并清理异常膨胀数据。", {
        errorKind: "payload_too_large",
        retryable: false,
        banner: true,
        dialog: true,
        runId,
        stage: "payload_size_guard",
        technical: "payloadBytes=" + payloadBytes + ", limit=" + GIST_RELIABLE_INLINE_MAX_BYTES
      });
      return { ok: false, fatal: true, payloadTooLarge: true };
    }
    const files = buildGistPatchFiles(payloadJson, latestRemote);

    let response;
    try {
      markSyncProgress("patch:start", runId);
      appendAuditEvent({ type: "sync:patch_sent", message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(uploadedHash).slice(0, 8) + " bytes=" + String(payloadBytes) + " files=" + String(Object.keys(files).length) });
      response = await fetchWithTimeout(gistApiUrl(state.cloud.gistId), {
        method: "PATCH",
        keepalive: keepalive === true,
        headers: {
          Authorization: "Bearer " + state.cloud.token,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ files: files })
      }, GITHUB_PATCH_TIMEOUT_MS, { stage: "gist_patch", transport: "authenticated_fetch" });
      markSyncProgress("patch:done", runId);
    } catch (error) {
      // PATCH 可能已被 GitHub 接收，只是响应在网络中丢失；先读回确认，禁止盲目重写。
      const confirmation = await confirmUploadedHashAfterUncertainPatch(uploadedHash, runId, "patch.network_error_confirm");
      if (confirmation.confirmed) {
        setCloudWriteCapability(true);
        return { ok: true, remote: confirmation.remote, uploadedHash: uploadedHash, confirmedAfterNetworkError: true };
      }
      if (confirmation.remoteChanged && confirmation.remote && isRemoteValidKind(confirmation.remote.kind)) {
        return { ok: false, preflightChanged: true, remote: confirmation.remote, patchResultUnknown: true };
      }
      const technical = requestErrorTechnical(error);
      const normalizedError = normalizeSyncRequestError(error);
      recordHashSyncFailure("云端写入结果暂时无法确认，本地数据已保留，稍后会先核验再重试", {
        errorKind: "patch_result_unknown",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        httpStatus: Number(error && error.httpStatus || 0),
        stage: normalizedError.stage || "gist_patch",
        transport: normalizedError.transport || "authenticated_fetch",
        technical: technical
      });
      return { ok: false, retryable: true, patchResultUnknown: true };
    }

    if (!response.ok) {
      if (response.status === 409) {
        appendAuditEvent({ type: "sync:patch_409", message: "session=" + TAB_ID + " runId=" + runId + " HTTP 409", httpStatus: 409 });
        const confirmation = await confirmUploadedHashAfterUncertainPatch(uploadedHash, runId, "patch.409_confirm");
        if (confirmation.confirmed) {
          setCloudWriteCapability(true);
          return { ok: true, remote: confirmation.remote, uploadedHash: uploadedHash };
        }
        if (confirmation.remoteChanged && confirmation.remote && isRemoteValidKind(confirmation.remote.kind)) {
          return { ok: false, preflightChanged: true, remote: confirmation.remote };
        }
        return { ok: false, retryableConflict: true, httpStatus: 409 };
      }

      const classified = await classifyGithubResponseError(response, "PATCH sync.json");
      const status = Number(response.status || 0);
      const rateLimited = isGithubRateLimitedResponse(response);
      const authFailed = (status === 401 || status === 403) && !rateLimited;
      const invalidRequest = status === 404 || status === 422;
      if (authFailed) setCloudWriteCapability(false, classified.message);

      // 422 诊断增强：GitHub 返回的 message/errors 安全摘要 + 本次 PATCH 的文件操作清单。
      // 只记录文件名和 upsert/delete 类型，不含 payload 内容，更不含 PAT/token。
      const patchFileDigest = Object.keys(files).map(function(name) {
        return files[name] === null ? (name + ":delete") : (name + ":upsert");
      }).join(",");
      if (status === 422) {
        appendAuditEvent({
          type: "sync:patch_rejected",
          message: "session=" + TAB_ID + " runId=" + (runId || "") +
            " httpStatus=" + status +
            " githubBody=" + String(classified.technical || "").slice(0, 600) +
            " patchFiles=" + patchFileDigest,
          httpStatus: status
        });
      }

      recordHashSyncFailure(classified.message, {
        errorKind: rateLimited ? "rate_limited" : (authFailed ? "auth_failed" : (status === 404 ? "invalid_config" : (status === 422 ? "patch_failed_422" : "patch_failed_http"))),
        retryable: rateLimited || status >= 500,
        banner: userInitiated || authFailed || invalidRequest,
        dialog: userInitiated || authFailed || invalidRequest,
        runId,
        httpStatus: status,
        stage: "gist_patch",
        transport: "authenticated_fetch",
        nextRetryAt: classified.retryAt || "",
        technical: String(classified.technical || "").slice(0, 1200) + (patchFileDigest ? " | patchFiles=" + patchFileDigest : "")
      });
      return { ok: false, fatal: authFailed || invalidRequest, retryable: rateLimited || status >= 500, httpStatus: status };
    }

    setCloudWriteCapability(true);
    appendAuditEvent({ type: "sync:patch_success", message: "session=" + TAB_ID + " runId=" + runId + " uploadedHash=" + String(uploadedHash).slice(0, 8) });

    // ── 第一步：用 PATCH 2xx 响应本身作为本次写入的收据 ──
    // 响应体就是写入完成后的 Gist；只要其中 sync.json 的业务 hash 等于 uploadedHash，
    // 本次写入即确认成功。之后即使匿名 GET 仍读到旧缓存内容，也绝不因此重新 PATCH。
    var receipt = null;
    try {
      receipt = extractGistReceiptFromPatchResponse(await response.json());
    } catch (_) {
      receipt = null;
    }
    if (receipt && isRemoteValidKind(receipt.kind)) {
      if (String(receipt.payloadHash || "") === String(uploadedHash || "")) {
        appendAuditEvent({
          type: "sync:patch_receipt_confirmed",
          message: "session=" + TAB_ID + " runId=" + runId + " hash=" + String(uploadedHash || "").slice(0, 8)
        });
        const receiptRemote = {
          kind: receipt.kind,
          snapshot: receipt.snapshot,
          payload: receipt.snapshot,
          payloadHash: receipt.payloadHash,
          rawContent: "",
          remoteVersion: receipt.remoteVersion,
          remoteUpdatedAt: receipt.remoteUpdatedAt,
          fileName: SYNC_FILE_NAME,
          fileNames: receipt.fileNames,
          readOnlyAuthFallback: false,
          authenticatedRead: true,
          authStatus: Number(response.status || 0),
          readTransport: "patch_response_receipt"
        };
        await maybeCleanupExpiredCloudBackups(receipt.fileNames, runId);
        return { ok: true, remote: receiptRemote, uploadedHash: uploadedHash, confirmedByPatchResponse: true };
      }
      appendAuditEvent({
        type: "sync:patch_receipt_mismatch",
        message: "session=" + TAB_ID + " runId=" + runId +
          " expected=" + String(uploadedHash || "").slice(0, 8) +
          " actual=" + String(receipt.payloadHash || "").slice(0, 8) +
          " truncated=" + String(receipt.truncated === true)
      });
    } else if (receipt) {
      appendAuditEvent({
        type: "sync:patch_receipt_unusable",
        message: "session=" + TAB_ID + " runId=" + runId + " reason=" + String(receipt.kind || "") + " truncated=" + String(receipt.truncated === true)
      });
    }

    // ── 第二步：收据不可用时才读回确认，且必须带 PAT（写后确认禁止匿名读） ──
    let verified;
    try {
      markSyncProgress("verify:get:start", runId);
      verified = await fetchGistSyncPayload({ forceAuthenticated: true });
      markSessionRemoteChecked(verified, runId, "patch.verify");
      markSyncProgress("verify:get:done", runId);
      appendAuditEvent({ type: "sync:verify_done", message: "session=" + TAB_ID + " runId=" + runId + " verifiedHash=" + String(currentRemoteHash(verified) || "").slice(0, 8) });
    } catch (error) {
      const normalizedError = normalizeSyncRequestError(error);
      recordHashSyncFailure("GitHub 已接受写入，但暂时无法完成读回校验；本地数据已保留", {
        errorKind: "patch_result_unknown",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        httpStatus: Number(error && error.httpStatus || 0),
        stage: normalizedError.stage || "verify_get",
        transport: normalizedError.transport || "",
        technical: requestErrorTechnical(error)
      });
      return { ok: false, verifyDeferred: true, commitAccepted: true, patchResultUnknown: true };
    }

    if (!isRemoteValidKind(verified.kind)) {
      recordHashSyncFailure("GitHub 已接受写入，但云端 sync.json 未通过校验", {
        errorKind: "verify_failed",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        technical: verified.reason || verified.kind || ""
      });
      return { ok: false, verifyDeferred: true };
    }

    const verifiedHash = currentRemoteHash(verified);
    if (verifiedHash !== uploadedHash) {
      appendAuditEvent({ type: "sync:verify_mismatch", message: "session=" + TAB_ID + " runId=" + runId + " expected=" + String(uploadedHash).slice(0, 8) + " actual=" + String(verifiedHash).slice(0, 8) });
      await delay(1500);
      var recheck = null;
      var recheckError = null;
      try {
        recheck = await fetchGistSyncPayload({ forceAuthenticated: true });
        markSessionRemoteChecked(recheck, runId, "patch.verify_mismatch_recheck");
      } catch (error) {
        recheckError = error;
      }

      if (recheck && currentRemoteHash(recheck) === uploadedHash) {
        await maybeCleanupExpiredCloudBackups((recheck && recheck.fileNames) || [], runId);
        return { ok: true, remote: recheck, uploadedHash: uploadedHash };
      }

      // 核心语义：PATCH 已经返回 2xx，读回 hash 不一致 ≠ 远端被并发修改——读回内容
      // 可能仍是缓存/复制延迟的旧数据。这里只进入“写入结果待确认”状态，保留本地
      // dirty，稍后重新核验；同一个 sync run 内绝不因 mismatch 再发送相同 PATCH，
      // 也不再把它转成 preflightChanged 触发 merge+PATCH。
      recordHashSyncFailure("云端写入尚未完成一致性确认，本地数据已保留，稍后会先核验再确认", {
        errorKind: "patch_result_unknown",
        retryable: true,
        banner: userInitiated,
        dialog: userInitiated,
        runId,
        stage: "verify_recheck",
        transport: recheckError ? normalizeSyncRequestError(recheckError).transport : (recheck && recheck.readTransport) || "authenticated_fetch",
        technical: recheckError ? requestErrorTechnical(recheckError) : ("expected=" + uploadedHash + ", actual=" + String(verifiedHash || ""))
      });
      scheduleSyncSoon("verify_mismatch_retry", 10000);
      return { ok: false, verifyDeferred: true, patchResultUnknown: true, verifyMismatchUnknown: true };
    }

    await maybeCleanupExpiredCloudBackups(verified.fileNames, runId);
    return { ok: true, remote: verified, uploadedHash: uploadedHash };
  } finally {
    endPatchTransaction(runId);
  }
}


function canMarkCloudOkAfterVerify({ uploadedHash, currentHash, runId } = {}) {
  if (isStaleSyncRun(runId)) return false;
  if (!uploadedHash || !currentHash || String(uploadedHash) !== String(currentHash)) return false;
  if (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) return false;
  var syncState = ensureHashSyncState(state.syncHashState);
  if (hasUnclearedBlockingSyncError(syncState)) return false;
  return true;
}

function finalizeVerifiedPatch({ uploadedPayload, uploadedHash, verifiedRemote, runId }) {
  if (isStaleSyncRun(runId)) return false;
  markSyncProgress("sync:finalize", runId);
  const current = refreshLocalPayloadHash({ persist: false });
  if (!canMarkCloudOkAfterVerify({ uploadedHash: uploadedHash, currentHash: current.hash, runId: runId })) {
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
    state.lastDirtyReason = "local_changed_during_verify";
    state.lastDirtyFromVerify = true;

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

    if (typeof scheduleActiveStudyUpload === "function" && state.view === "flash") {
      scheduleActiveStudyUpload();
    } else {
      scheduleSyncSoon("local_changed_during_verify", Math.max(2500, ACTIVE_STUDY_SYNC_DEBOUNCE_MS));
    }
    refreshVisibleSyncDiagnostics();

    return { ok: false, localChangedDuringVerify: true };
  }
  markHashCleanFromRemote(verifiedRemote, uploadedHash, "cloud_ok", { runId: runId, remoteVerified: true });
  return true;
}

// ── 本地数据保护 ──────────────────────────────────────────────────────


