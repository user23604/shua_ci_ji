"use strict";


function flushDirtyOnPageHide(reason) {
  try {
    if (typeof markPageHiddenDuringSync === "function") markPageHiddenDuringSync();
    var syncState = ensureHashSyncState(state.syncHashState);
    if (!syncState || !syncState.localDirty) return;
    appendAuditEvent({ type: "sync:pagehide_flush_start", message: "session=" + TAB_ID + " reason=" + reason });
    syncTick({ reason: reason, bypassBackoff: true, keepalive: true }).then(function(result) {
      if (!result) {
        appendAuditEvent({ type: "sync:pagehide_flush_deferred", message: "session=" + TAB_ID + " reason=" + reason + " dirty_preserved=true" });
      }
    }).catch(function(error) {
      appendAuditEvent({ type: "sync:pagehide_flush_deferred", message: "session=" + TAB_ID + " reason=" + reason + " dirty_preserved=true error=" + String(error && error.message || error || "") });
    });
  } catch (error) {
    appendAuditEvent({ type: "sync:pagehide_flush_deferred", message: "session=" + TAB_ID + " reason=" + reason + " dirty_preserved=true error=" + String(error && error.message || error || "") });
  }
}

function init() {
  appendAuditEvent({ type: "app:startup", message: APP_VERSION + "/" + APP_BUILD_ID });
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
    if (typeof markPageHiddenDuringSync === "function") markPageHiddenDuringSync();
    var syncState = ensureHashSyncState(state.syncHashState);
    if (syncState.localRecoveryRequired) {
      var currentPayload = normalizeSyncPayload(collectSyncPayload());
      if (validateSyncPayload(currentPayload) && hasBusinessData(currentPayload)) {
        // 用户可能已通过 rescue 或其他方式手动恢复了数据
        state.syncHashState.localRecoveryRequired = false;
        state.syncHashState.localDirty = true;
        state.syncHashState.baseRemoteHash = "";
        state.syncHashState.dirtySince = beijingISOString();
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
      flushDirtyOnPageHide("visibility_hidden_flush");
      return;
    }
    checkServerVersion({ force: false });
    scheduleVisibleSync();
    if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck("visibility_resume");
  });
  window.addEventListener("pagehide", function() {
    if (typeof markPageHiddenDuringSync === "function") markPageHiddenDuringSync();
    appendAuditEvent({ type: "app:background" });
    pausePlaybackForBackground();
    flushDirtyOnPageHide("pagehide_flush");
  });
  window.addEventListener("blur", pausePlaybackForBackground);
  window.addEventListener("resize", fitActiveWord);
  preloadSpeechVoices();
  if (isAuthenticated()) {
    renderSetup();
    initializeP0Sync({ reason: "init" });
    if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck("startup");
  } else {
    renderAuth();
  }
}


init();
