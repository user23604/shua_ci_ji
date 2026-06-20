"use strict";

function init() {
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  persistSyncMeta();
  persistHashSyncState();
  migrateHashSyncStateIfNeeded();
  // P0: pendingOps 已冻结。一次性截断超量旧数据。
  try {
    var opsStore = loadPendingOpsStore();
    if (opsStore.ops && opsStore.ops.length > 200) {
      savePendingOpsStore({ ops: opsStore.ops.slice(-200) });
    }
  } catch (_) {}
  // P0: 启动时检查 localRecoveryRequired 是否可以解除
  try {
    var syncState = ensureHashSyncState(state.syncHashState);
    if (syncState.localRecoveryRequired) {
      var currentPayload = normalizeSyncPayload(collectSyncPayload());
      if (validateSyncPayload(currentPayload) && hasBusinessData(currentPayload)) {
        // 用户可能已通过 rescue 或其他方式手动恢复了数据
        state.syncHashState.localRecoveryRequired = false;
        state.syncHashState.localDirty = true;
        state.syncHashState.baseRemoteHash = "";
        state.syncHashState.dirtySince = new Date().toISOString();
        state.syncHashState.lastSyncStatus = "dirty";
        state.syncHashState.lastSyncError = "";
        persistHashSyncState();
        appendAuditEvent({ type: "recovery:cleared", message: "启动时检测到本地业务数据已恢复，解除保护状态" });
      }
    }
  } catch (_) {}
  normalizeSettings();
  registerServiceWorker();
  startVersionChecks();
  startSyncHeartbeat();
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") {
      pausePlaybackForBackground();
      return;
    }
    checkServerVersion({ force: false });
    syncTick({ reason: "visible", bypassBackoff: true });
  });
  window.addEventListener("pagehide", function() {
    pausePlaybackForBackground();
  });
  window.addEventListener("blur", pausePlaybackForBackground);
  window.addEventListener("resize", fitActiveWord);
  preloadSpeechVoices();
  if (isAuthenticated()) {
    renderSetup();
    initializeP0Sync({ reason: "init" });
  } else {
    renderAuth();
  }
}


init();
