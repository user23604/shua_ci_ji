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
  // 恢复保护只能由哈希验证成功的回滚/备份恢复，或 rescue.html 的明确用户确认解除。
  // 不能因为当前数据“合法且非空”就自动解除，否则半写入混合状态会被错误上传。
  try { enforceLocalRecoveryGuardAtStartup(); } catch (_) {}
  try { processPendingStorageReadIssues({ source: "startup" }); } catch (_) {}
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
    renderSetup();
    initializeSync({ reason: "init" });
  } else {
    renderAuth();
  }
  window.__SHUA_APP_READY__ = true;
  appendAuditEvent({ type: "app:ready", message: APP_VERSION + "/" + APP_BUILD_ID });
}


init();
