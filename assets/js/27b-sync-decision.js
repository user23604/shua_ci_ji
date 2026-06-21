"use strict";

function decideSyncAction({ remote, facts, syncState, remoteHash, reason = "", runId = 0 } = {}) {
  remote = remote || {};
  syncState = ensureHashSyncState(syncState || state.syncHashState);
  facts = facts && facts.payload ? facts : currentSyncFacts({ persistHash: false });
  var localHasData = hasBusinessData(facts.payload);
  var remoteHasData = remoteHasBusinessPayload(remote);
  var remoteEmpty = remoteIsEmptyPayload(remote);
  var readOnly = remote.readOnlyAuthFallback === true || (state.syncMeta && state.syncMeta.readOnlyMode === true);
  var effective = facts.effectiveDirty === true;
  var baseHash = String(syncState.baseRemoteHash || "");
  var rHash = String(remoteHash || currentRemoteHash(remote) || "");
  var type = "ERROR";
  var shouldPatch = false;
  var shouldPull = false;
  var shouldMerge = false;
  var shouldNoop = false;
  var riskCode = "";

  if (remote.kind === "invalid" || remote.kind === "v2_unknown_ops") {
    type = "REMOTE_INVALID";
    riskCode = remote.kind || "remote_invalid";
  } else if (!localHasData && remoteEmpty) {
    type = "BOTH_EMPTY_NOOP";
    shouldNoop = true;
  } else if (!localHasData && remoteHasData) {
    type = "LOCAL_EMPTY_REMOTE_NONEMPTY_PULL";
    shouldPull = true;
  } else if (readOnly && effective && localHasData) {
    type = "READ_ONLY_DIRTY";
    riskCode = "read_only_dirty";
  } else if (localHasData && remoteEmpty) {
    type = "LOCAL_NONEMPTY_REMOTE_EMPTY_PUSH";
    shouldPatch = !readOnly;
    riskCode = readOnly ? "readonly_remote_empty_local_has_data" : "remote_empty_local_has_data";
  } else if (localHasData && remoteHasData && rHash === baseHash && effective) {
    type = "LOCAL_DIRTY_REMOTE_SAME_PUSH";
    shouldPatch = !readOnly;
  } else if (localHasData && remoteHasData && rHash !== baseHash && !effective && syncState.localDirty !== true) {
    type = "LOCAL_CLEAN_REMOTE_CHANGED_PULL";
    shouldPull = true;
  } else if (localHasData && remoteHasData && rHash !== baseHash) {
    type = "BOTH_CHANGED_MERGE_PUSH";
    shouldMerge = true;
    shouldPatch = !readOnly;
  } else if (rHash === baseHash && !effective) {
    type = "CLEAN_NOOP";
    shouldNoop = true;
  } else {
    type = "ERROR";
    riskCode = "unclassified_sync_state";
  }

  return {
    type: type,
    reason: reason,
    runId: runId,
    canWrite: !readOnly,
    readOnly: readOnly,
    localHasData: localHasData,
    remoteHasData: remoteHasData,
    remoteEmpty: remoteEmpty,
    localHash: facts.localPayloadHash || "",
    remoteHash: rHash,
    baseRemoteHash: baseHash,
    effectiveDirty: effective,
    localDirty: syncState.localDirty === true,
    shouldPatch: shouldPatch,
    shouldPull: shouldPull,
    shouldMerge: shouldMerge,
    shouldNoop: shouldNoop,
    riskCode: riskCode
  };
}

function appendSyncDecisionAudit(decision) {
  try {
    appendAuditEvent({
      type: "sync:decision",
      message:
        "session=" + TAB_ID +
        " runId=" + String(decision.runId || "") +
        " type=" + String(decision.type || "") +
        " reason=" + String(decision.reason || "") +
        " localHasData=" + String(!!decision.localHasData) +
        " remoteHasData=" + String(!!decision.remoteHasData) +
        " remoteEmpty=" + String(!!decision.remoteEmpty) +
        " readOnly=" + String(!!decision.readOnly) +
        " effectiveDirty=" + String(!!decision.effectiveDirty) +
        " localDirty=" + String(!!decision.localDirty) +
        " localHash=" + String(decision.localHash || "").slice(0, 8) +
        " remoteHash=" + String(decision.remoteHash || "").slice(0, 8) +
        " baseHash=" + String(decision.baseRemoteHash || "").slice(0, 8) +
        " action=" + [decision.shouldPull ? "pull" : "", decision.shouldMerge ? "merge" : "", decision.shouldPatch ? "patch" : "", decision.shouldNoop ? "noop" : ""].filter(Boolean).join("+")
    });
  } catch (_) {}
}
