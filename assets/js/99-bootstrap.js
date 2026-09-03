"use strict";


function flushDirtyOnPageHide(reason) {
  try {
    if (typeof markPageHiddenDuringSync === "function") markPageHiddenDuringSync();
    var changed = typeof flushPendingStudyForBoundary === "function"
      ? flushPendingStudyForBoundary(reason || "pagehide_local_flush")
      : false;
    var syncState = ensureHashSyncState(state.syncHashState);
    if (changed || (syncState && syncState.localDirty)) {
      state.pendingActiveStudyUpload = true;
      try { writeLocalSnapshot(reason || "pagehide_local_flush"); } catch (_) {}
      try { writeDailyBackup(reason || "pagehide_local_flush"); } catch (_) {}
      appendAuditEvent({
        type: "sync:pagehide_local_saved",
        message: "session=" + TAB_ID + " reason=" + String(reason || "") + " dirty_preserved=true"
      });
      updateSyncIndicator();
    }
  } catch (error) {
    state.pendingActiveStudyUpload = true;
    appendAuditEvent({
      type: "sync:pagehide_local_save_failed",
      message: "session=" + TAB_ID + " reason=" + String(reason || "") + " error=" + String(error && error.message || error || "")
    });
  }
}

function flushPendingDirtyAfterVisible(reason) {
  try {
    if (typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary(reason || "visibility_resume");
    var syncState = ensureHashSyncState(state.syncHashState);
    var shouldFlush = Boolean(
      (syncState && syncState.localDirty) ||
      state.pendingActiveStudyUpload ||
      (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())
    );
    if (shouldFlush) {
      state.pendingActiveStudyUpload = false;
      scheduleSyncSoon(reason || "visibility_resume", 1500);
      appendAuditEvent({ type: "sync:visibility_resume_scheduled", message: "session=" + TAB_ID + " dirty=true" });
      return;
    }
    if (typeof requestFreshRemoteCheck === "function") requestFreshRemoteCheck(reason || "visibility_resume");
  } catch (error) {
    appendAuditEvent({
      type: "sync:visibility_resume_failed",
      message: "session=" + TAB_ID + " error=" + String(error && error.message || error || "")
    });
  }
}

function init() {
  appendAuditEvent({ type: "app:startup", message: APP_VERSION + "/" + APP_BUILD_ID });
  state.syncMeta = ensureSyncMeta(state.syncMeta);
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  // v2 storage repair: old round-archive builds duplicated the full archive history into
  // every local snapshot/backup. Compact those redundant copies before any new sync write.
  try {
    var backupRepair = compactExistingLocalBackupCopies();
    var budgetRepair = pruneLocalBackupCopiesToBudget();
    if ((backupRepair.bytesFreed || 0) > 0 || (budgetRepair.bytesFreed || 0) > 0) {
      appendAuditEvent({
        type: "storage:backup_compacted",
        message: "compacted=" + String(backupRepair.compacted || 0) +
          " removed=" + String((backupRepair.removed || 0) + (budgetRepair.removed || 0)) +
          " bytesFreed=" + String((backupRepair.bytesFreed || 0) + (budgetRepair.bytesFreed || 0))
      });
    }
  } catch (_) {}
  if (typeof restoreProgressPending === "function") restoreProgressPending();
  if (typeof restoreActivityDraftPending === "function") restoreActivityDraftPending();
  persistSyncMeta();
  persistHashSyncState();
  migrateHashSyncStateIfNeeded();
  // pendingOps 已冻结。一次性截断超量旧数据。
  try {
    var opsStore = loadPendingOpsStore();
    if (opsStore.ops && opsStore.ops.length > 200) {
      savePendingOpsStore({ ops: opsStore.ops.slice(-200) });
    }
  } catch (_) {}
  // 启动时检查 localRecoveryRequired 是否可以解除
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
      flushDirtyOnPageHide("visibility_hidden_local_flush");
      return;
    }
    checkServerVersion({ force: false });
    flushPendingDirtyAfterVisible("visibility_resume");
  });
  window.addEventListener("pagehide", function() {
    if (typeof markPageHiddenDuringSync === "function") markPageHiddenDuringSync();
    appendAuditEvent({ type: "app:background" });
    pausePlaybackForBackground();
    flushDirtyOnPageHide("pagehide_local_flush");
  });
  window.addEventListener("online", function() {
    appendAuditEvent({ type: "network:online", message: "session=" + TAB_ID });
    scheduleSyncSoon("network_online", 1500);
  });
  window.addEventListener("blur", pausePlaybackForBackground);
  window.addEventListener("resize", fitActiveWord);
  preloadSpeechVoices();
  if (isAuthenticated()) {
    Promise.resolve(enterStudyOnLaunch({ reason: "init" }))
      .then(function() { return initializeSync({ reason: "init" }); })
      .catch(function(error) {
        appendAuditEvent({ type: "sync:init_after_launch_failed", message: String(error && error.message || error || "") });
      });
  } else {
    renderAuth();
  }
  window.__SHUA_APP_READY__ = true;
  appendAuditEvent({ type: "app:ready", message: APP_VERSION + "/" + APP_BUILD_ID });
}


init();
