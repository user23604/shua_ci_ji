"use strict";

function shouldAttemptAutoPush() {
  if (state.isSyncing) return false;
  const cloud = validateSavedCloudConfig(state.cloud);
  if (!cloud.ok || state.syncMeta.readOnlyMode) return false;
  return currentSyncFacts({ persistHash: false }).effectiveDirty;
}


function scheduleAutoPush() {
  if (!shouldAttemptAutoPush()) return;
  syncTick({ reason: "legacy_schedule", bypassBackoff: true });
}


function schedulePeriodicPush() {
  // P0 sync uses one heartbeat only. This compatibility stub prevents older
  // callers from starting a second retry loop.
}


async function migrateSyncMetaIfNeeded() {
  var meta = ensureSyncMeta(state.syncMeta);
  if (meta.lastSyncedPayloadHash) return;
  if (!meta.lastRemoteVersion || !meta.initialized) return;
  var cloud = validateSavedCloudConfig(state.cloud);
  if (!cloud.ok) return;
  try {
    var remote = await fetchGistSyncPayload();
    if (isRemoteValidKind(remote.kind)) {
      var remoteHash = currentRemoteHash(remote);
      var currentHash = computeCurrentPayloadHash();
      if (remoteHash === currentHash) {
        state.syncMeta.lastSyncedPayloadHash = remoteHash;
        state.syncMeta.lastSyncedLocalUpdatedAt = meta.localUpdatedAt || "";
        if (!meta.lastCloudSaveConfirmedAt && meta.lastRemoteVersion) {
          state.syncMeta.lastCloudSaveConfirmedAt = meta.lastRemoteUpdatedAt || "";
          state.syncMeta.lastSuccessfulPushAt = meta.lastRemoteUpdatedAt || "";
        }
        persistSyncMeta();
      } else {
        state.syncMeta.lastSyncedPayloadHash = "";
        persistSyncMeta();
      }
    }
  } catch (_) {}
}

async function runGistSync() {
  throw new Error("runGistSync 已废弃，请使用 syncTick");
}


function buildClientsMap(remoteOps, localOps) {
  var clients = {};
  (Array.isArray(remoteOps) ? remoteOps : []).concat(Array.isArray(localOps) ? localOps : []).forEach(function(op) {
    var cid = op.clientId || "";
    if (!cid) return;
    var seq = Number(op.seq) || 0;
    if (!clients[cid] || seq > (clients[cid].lastSeq || 0)) {
      clients[cid] = { lastSeq: seq };
    }
  });
  return clients;
}

// P0: 已废弃。P0 使用 syncTick() 统一同步入口。

async function createRemoteSyncJson() {
  throw new Error("createRemoteSyncJson 已废弃");
}

// P0: 已废弃。P0 使用 syncTick() 统一同步入口。

async function pushPayloadWithBackup() {
  throw new Error("pushPayloadWithBackup 已废弃");
}

// ── 旧版 PATCH 引擎（P0 已废弃，syncTick 使用 patchBusinessPayloadToGist）──
// P0: 以下两个函数已封死，防止任何旧路径绕过 syncTick 直接 PATCH Gist


async function patchGistFilesV2() {
  throw new Error("patchGistFilesV2 已废弃，请使用 patchBusinessPayloadToGist");
}


async function patchGistFiles() {
  throw new Error("patchGistFiles 已废弃，请使用 patchBusinessPayloadToGist");
}
// P0: 已废弃。P0 使用 markHashCleanFromRemote()。

function markSyncedWithRemote() {
  throw new Error("markSyncedWithRemote 已废弃，请使用 markHashCleanFromRemote");
}


function enterSafeConflictMode(message) {
  state.syncMeta.lastSyncErrorAt = beijingISOString();
  state.syncMeta.lastSyncErrorMessage = message || "同步已安全阻断";
  persistSyncMeta();
  appendAuditEvent({ type: "sync:blocked", message: message || "同步已安全阻断" });
  if (state.view === "setup") {
    state.setupStatus = { message: message, type: "error" };
    renderSetup();
  }
  updateSyncIndicator();
}


function enterSyncInfoMode(message) {
  if (state.view === "setup") {
    state.setupStatus = { message: message, type: "success" };
    renderSetup();
  }
}


