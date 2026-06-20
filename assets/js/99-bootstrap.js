"use strict";


function flushDirtyOnPageHide(reason) {
  try {
    if (typeof markPageHiddenDuringSync === "function") markPageHiddenDuringSync();
    var syncState = ensureHashSyncState(state.syncHashState);
    if (state.activityDirtyPending && !syncState.localDirty && typeof markLocalDirtyLight === "function") {
      markLocalDirtyLight("activity_pagehide");
      syncState = ensureHashSyncState(state.syncHashState);
    }
    if (!syncState || !syncState.localDirty) return;
    appendAuditEvent({ type: "sync:pagehide_flush_start", message: "session=" + TAB_ID + " reason=" + reason });
    syncTick({ reason: reason, bypassBackoff: true, keepalive: true }).then(function(result) {
      if (!result) {
        state.pendingActiveStudyUpload = true;
        appendAuditEvent({ type: "sync:pagehide_flush_deferred", message: "session=" + TAB_ID + " reason=" + reason + " dirty_preserved=true" });
      }
    }).catch(function(error) {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:pagehide_flush_deferred", message: "session=" + TAB_ID + " reason=" + reason + " dirty_preserved=true error=" + String(error && error.message || error || "") });
    });
  } catch (error) {
    state.pendingActiveStudyUpload = true;
    appendAuditEvent({ type: "sync:pagehide_flush_deferred", message: "session=" + TAB_ID + " reason=" + reason + " dirty_preserved=true error=" + String(error && error.message || error || "") });
  }
}


function flushPendingDirtyAfterVisible(reason) {
  try {
    var syncState = ensureHashSyncState(state.syncHashState);
    if (state.activityDirtyPending && !syncState.localDirty && typeof markLocalDirtyLight === "function") {
      markLocalDirtyLight("activity_visibility_resume");
      syncState = ensureHashSyncState(state.syncHashState);
    }
    var shouldFlush = Boolean((syncState && syncState.localDirty) || state.pendingActiveStudyUpload);
    if (!shouldFlush) {
      if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck(reason || "visibility_resume");
      return;
    }
    state.pendingActiveStudyUpload = false;
    appendAuditEvent({ type: "sync:visibility_resume_dirty_flush_start", message: "session=" + TAB_ID + " reason=" + String(reason || "visibility_resume_dirty_flush") });
    Promise.resolve(syncTick({ reason: reason || "visibility_resume_dirty_flush", bypassBackoff: true })).then(function(result) {
      var latestState = ensureHashSyncState(state.syncHashState);
      if (!result && latestState && latestState.localDirty) {
        state.pendingActiveStudyUpload = true;
        scheduleSyncSoon("visibility_resume_dirty_flush", 2000);
        appendAuditEvent({ type: "sync:visibility_resume_dirty_flush_rescheduled", message: "session=" + TAB_ID + " reason=result_false dirty_preserved=true" });
      }
    }).catch(function(error) {
      state.pendingActiveStudyUpload = true;
      scheduleSyncSoon("visibility_resume_dirty_flush", 2000);
      appendAuditEvent({ type: "sync:visibility_resume_dirty_flush_rescheduled", message: "session=" + TAB_ID + " error=" + String(error && error.message || error || "") + " dirty_preserved=true" });
    });
  } catch (error) {
    appendAuditEvent({ type: "sync:visibility_resume_dirty_flush_failed", message: "session=" + TAB_ID + " error=" + String(error && error.message || error || "") });
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
    flushPendingDirtyAfterVisible("visibility_resume_dirty_flush");
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
