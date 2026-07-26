"use strict";

// ── session remote check ─────────────────────────────────────────

function markSessionRemoteChecked(remote, runId, source) {
  if (!remote || remote.kind === "error") return;
  var remoteHash = currentRemoteHash(remote);
  state.sessionRemoteCheckDone = true;
  state.sessionRemoteCheckAt = beijingISOString();
  state.lastCleanRemotePollAt = Date.now();
  state.latestRemoteHashSeen = remoteHash || "";
  state.latestRemoteKindSeen = (remote && remote.kind) || "";
  state.latestRemoteCheckRunId = runId || 0;
  appendAuditEvent({
    type: "sync:remote_checked",
    message: "session=" + TAB_ID + " runId=" + (runId || "") + " source=" + String(source || "") + " kind=" + String(state.latestRemoteKindSeen || "") + " hash=" + String(state.latestRemoteHashSeen || "").slice(0, 8)
  });
}

function hasFreshSessionRemoteConfirmation() {
  if (!state.sessionRemoteCheckDone) return false;
  if (!state.sessionRemoteCheckAt) return false;
  var checkedAt = Date.parse(state.sessionRemoteCheckAt);
  if (!Number.isFinite(checkedAt)) return false;
  return Date.now() - checkedAt <= SYNC_REMOTE_CONFIRM_TTL_MS;
}

// ── blocking error ───────────────────────────────────────────────

function isBlockingSyncErrorKind(errorKind, options = {}) {
  var reason = String(options.reason || "");
  if (options.retryable === true) return false;
  if (errorKind === "verify_failed" && [
    "heartbeat",
    "local_change",
    "min_interval_reschedule",
    "active_study_idle_upload",
    "visibility_resume",
    "visibility_resume_dirty_flush",
    "verify_mismatch_retry"
  ].includes(reason)) return false;
  if (typeof shouldDowngradeFailureForBackground === "function" && shouldDowngradeFailureForBackground(reason)) return false;
  return ["remote_invalid","remote_v2_unknown_ops","patch_failed_422","patch_conflict_409","merge_failed","local_apply_verify_failed","local_rollback_failed","local_storage_corrupt","apply_failed","invalid_config","auth_failed"].indexOf(errorKind || "") !== -1;
}

function hasUnclearedBlockingSyncError(syncState) {
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  if (!syncState.lastBlockingErrorAt) return false;
  if (!syncState.lastBlockingErrorClearedAt) return true;
  return Date.parse(syncState.lastBlockingErrorAt) > Date.parse(syncState.lastBlockingErrorClearedAt);
}

// ── clean 状态判断（watchdog/网络错误不覆盖已确认的 cloud_ok/cloud_loaded）──

function isCleanConfirmedSyncState(facts, syncState) {
  facts = facts || currentSyncFacts({ persistHash: false });
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  return (
    !facts.effectiveDirty &&
    Boolean(syncState.baseRemoteHash) &&
    facts.localPayloadHash === syncState.baseRemoteHash &&
    (Boolean(syncState.lastSuccessfulPushAt) || Boolean(syncState.lastSuccessfulPullAt))
  );
}


function recordHashSyncFailure(message, options) {
  options = options || {};
  if (isStaleSyncRun(options.runId)) return false;
  const now = new Date();
  var text = message && message.message ? message.message : String(message || "同步失败");
  var facts = currentSyncFacts({ persistHash: false });
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  var syncState = state.syncHashState;

  // 非阻塞错误（watchdog/网络/版本检查）且数据已 clean 时，保持成功态
  var nonBlockingErrors = ["sync_watchdog_timeout", "remote_get_failed", "patch_result_unknown", "rate_limited", "patch_failed_http", "version_check_failed"];
  var isNonBlocking = nonBlockingErrors.indexOf(options.errorKind || "") !== -1;
  var cleanConfirmed = isNonBlocking && isCleanConfirmedSyncState(facts, syncState);
  var preserveCleanSuccessStatus = isNonBlocking && cleanConfirmed;

  if (preserveCleanSuccessStatus) {
    // clean 分支：明确写回正确成功态，绝不到达 lastSyncStatus = "error"
    syncState.localDirty = false;
    syncState.localPayloadHash = facts.localPayloadHash;
    syncState.lastSyncError = text;
    syncState.lastSyncErrorAt = beijingISOString();
    if (syncState.lastSuccessfulPushAt) {
      syncState.lastSyncStatus = "cloud_ok";
    } else {
      syncState.lastSyncStatus = "cloud_loaded";
    }
    // 不覆盖 baseRemoteHash、lastSuccessfulPushAt/PullAt
  } else {
    // 原有失败逻辑
    // dirty 保护：原本 dirty 不清掉
    if (facts.effectiveDirty || syncState.localDirty) {
      syncState.localDirty = true;
    } else {
      syncState.localDirty = shouldMarkDirtyOnFailure(options.errorKind || "unknown", facts);
    }
    if (syncState.localDirty && !syncState.dirtySince) syncState.dirtySince = beijingISOString(now);
    var blockingFailure = isBlockingSyncErrorKind(options.errorKind, options);
    if (!blockingFailure && (options.retryable === true || options.errorKind === "verify_failed" || options.errorKind === "remote_get_failed" || options.errorKind === "patch_failed_network")) {
      syncState.lastSyncStatus = syncState.localDirty ? "dirty" : "local_only";
    } else {
      syncState.lastSyncStatus = options.status || "error";
    }
    syncState.lastSyncError = text;
    syncState.lastSyncErrorAt = beijingISOString();
    // 只有真正 blocking 的错误才写 blocking error，retryable verify/network 不让红灯长驻。
    if (blockingFailure) {
      syncState.lastBlockingErrorAt = beijingISOString();
      syncState.lastBlockingErrorCode = options.errorKind || "SYNC_FAILED";
      syncState.lastBlockingErrorText = text;
    }
  }
  syncState.localPayloadHash = facts.localPayloadHash;
  syncState.lastErrorKind = String(options.errorKind || "unknown");
  syncState.lastErrorStage = String(options.stage || "");
  syncState.lastErrorTransport = String(options.transport || "");
  syncState.lastErrorHttpStatus = Math.max(0, Number(options.httpStatus) || 0);
  syncState.lastErrorTechnical = String(options.technical || "").slice(0, 3000);
  syncState.consecutiveSyncFailures += 1;
  var backoffAtMs = now.getTime() + backoffDelayForFailure(syncState.consecutiveSyncFailures - 1);
  var requestedRetryAtMs = Date.parse(options.nextRetryAt || "");
  if (Number.isFinite(requestedRetryAtMs) && requestedRetryAtMs > backoffAtMs) backoffAtMs = requestedRetryAtMs;
  syncState.nextRetryAt = beijingISOString(new Date(backoffAtMs));
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncMeta.lastSyncAttemptAt = beijingISOString(now);
  state.syncMeta.lastSyncErrorAt = beijingISOString();
  state.syncMeta.lastSyncErrorMessage = text;
  persistSyncMeta();
  persistHashSyncState();
  appendAuditEvent({ type: "sync:failed", message: "session=" + TAB_ID + " runId=" + (options.runId || "") + " errorKind=" + (options.errorKind || "unknown") + " stage=" + String(options.stage || "") + " transport=" + String(options.transport || "") + " " + text, httpStatus: options.httpStatus || 0 });
  refreshVisibleSyncDiagnostics();
  if (options.banner === true) showSyncFailureBanner("同步失败", text, { runId: options.runId });
  if (options.dialog === true || options.banner === true) {
    var dialogExtra = {
      severity: preserveCleanSuccessStatus ? "warning" : (options.severity || "error"),
      code: options.errorKind || "SYNC_FAILED",
      title: options.title || (preserveCleanSuccessStatus ? "同步检查超时" : "同步失败"),
      message: text,
      technical: options.technical || "",
      runId: options.runId,
      candidates: options.candidates
    };
    // 补充风险诊断字段，确保弹窗截图信息完整
    var remoteForFields = options.remote || null;
    if (remoteForFields && typeof makeSyncRiskProblemFields === "function") {
      var riskFields = makeSyncRiskProblemFields(remoteForFields, facts, {
        remoteHash: options.remoteHash,
        remoteHasBusinessData: options.remoteHasBusinessData,
        readOnly: Object.prototype.hasOwnProperty.call(options, "readOnly") ? options.readOnly : (remoteForFields.readOnlyAuthFallback === true),
        runId: options.runId
      });
      Object.keys(riskFields).forEach(function(k) { dialogExtra[k] = riskFields[k]; });
    } else {
      dialogExtra.remoteKind = options.remoteKind || "";
      dialogExtra.remoteHash = options.remoteHash || "";
      dialogExtra.localHasBusinessData = hasBusinessData(facts.payload);
      dialogExtra.remoteHasBusinessData = Boolean(options.remoteHasBusinessData);
      dialogExtra.baseRemoteHash = syncState.baseRemoteHash || "";
      dialogExtra.localPayloadHash = facts.localPayloadHash || "";
      dialogExtra.localDirty = syncState.localDirty === true;
      dialogExtra.effectiveDirty = facts.effectiveDirty === true;
      dialogExtra.readOnly = Boolean(Object.prototype.hasOwnProperty.call(options, "readOnly") ? options.readOnly : (state.syncMeta && state.syncMeta.readOnlyMode));
    }
    showSyncProblemDialog(dialogExtra);
  }
  return true;
}


function migrateHashSyncStateIfNeeded() {
  try {
    var existing = loadJson(HASH_SYNC_STATE_KEY, null);
    if (
      existing &&
      Number(existing.schemaVersion) === 2 &&
      typeof existing.localPayloadHash === "string" &&
      existing.localPayloadHash.length > 0
    ) {
      state.syncHashState = ensureHashSyncState(existing);
      if (state.syncHashState.businessHashSchemaVersion !== BUSINESS_HASH_SCHEMA_VERSION) {
        var previousDirty = state.syncHashState.localDirty === true;
        var localForSchema = refreshLocalPayloadHash({ persist: false });
        state.syncHashState.localPayloadHash = localForSchema.hash;
        state.syncHashState.localDirty = false;
        state.syncHashState.dirtySince = "";
        state.syncHashState.lastSyncError = "";
        markBusinessHashSchemaForRemoteCheck(previousDirty);
        appendAuditEvent({ type: "sync:business_hash_schema_changed", message: "session=" + TAB_ID + " old=" + String(existing.businessHashSchemaVersion || "") + " new=" + BUSINESS_HASH_SCHEMA_VERSION + " previousDirty=" + String(previousDirty) });
        return;
      }
      persistHashSyncState();
      return;
    }
  } catch (_) { /* proceed with migration */ }

  var local = refreshLocalPayloadHash({ persist: false });
  var hasData = hasBusinessData(local.payload);
  var now = beijingISOString();

  var oldV1 = null;
  try {
    oldV1 = loadJson("vocab_machine_hash_sync_state_v1", null);
  } catch (_) {}

  var oldV1Clean =
    oldV1 &&
    oldV1.localDirty === false &&
    typeof oldV1.localPayloadHash === "string" &&
    typeof oldV1.baseRemoteHash === "string" &&
    oldV1.localPayloadHash &&
    oldV1.baseRemoteHash &&
    oldV1.localPayloadHash === oldV1.baseRemoteHash;

  if (hasData && oldV1Clean) {
    state.syncHashState = ensureHashSyncState({
      schemaVersion: 2,
      businessHashSchemaVersion: BUSINESS_HASH_SCHEMA_VERSION,
      localPayloadHash: local.hash,
      localDirty: false,
      baseRemoteHash: local.hash,
      dirtySince: "",
      lastSyncStatus: "local_only",
      lastSyncError: "",
      lastSyncErrorAt: "",
      lastSyncedPayloadHash: local.hash,
      lastBlockingErrorAt: "",
      lastBlockingErrorCode: "",
      lastBlockingErrorText: "",
      lastBlockingErrorClearedAt: ""
    });
    appendAuditEvent({ type: "sync:hash_state_migrated_clean_snapshot", message: "session=" + TAB_ID + " oldV1Clean=true localHash=" + String(local.hash || "").slice(0, 8) });
  } else {
    state.syncHashState = ensureHashSyncState({
      schemaVersion: 2,
      businessHashSchemaVersion: BUSINESS_HASH_SCHEMA_VERSION,
      localPayloadHash: local.hash,
      localDirty: hasData,
      baseRemoteHash: "",
      dirtySince: hasData ? now : "",
      lastSyncStatus: hasData ? "dirty" : "local_only",
      lastSyncError: "",
      lastSyncErrorAt: "",
      lastSyncedPayloadHash: "",
      lastBlockingErrorAt: "",
      lastBlockingErrorCode: "",
      lastBlockingErrorText: "",
      lastBlockingErrorClearedAt: ""
    });
    appendAuditEvent({ type: "sync:hash_state_migrated_dirty_or_empty", message: "session=" + TAB_ID + " hasData=" + String(!!hasData) + " oldV1Clean=" + String(!!oldV1Clean) });
  }

  state.sessionRemoteCheckDone = false;
  state.sessionRemoteCheckAt = "";
  state.latestRemoteHashSeen = "";
  state.latestRemoteKindSeen = "";
  state.latestRemoteCheckRunId = 0;

  persistHashSyncState();
}

// ── Backup recovery ─────────────────────────────────────────────────

