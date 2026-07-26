"use strict";

function touchStudyActivity(reason = "study") {
  state.lastStudyActivityAt = Date.now();
  if (typeof appendAuditEvent === "function") {
    appendAuditEvent({
      type: "study:activity_touch",
      message:
        "reason=" + String(reason || "") +
        " view=" + String(state.view || "") +
        " index=" + String(state.currentIndex || 0)
    });
  }
}


function lastActiveStudyAt() {
  return Math.max(
    Number(state.lastUserStudyActionAt || 0),
    Number(state.lastStudyActivityAt || 0)
  );
}


function currentFlashWord() {
  return state.unitWords && state.unitWords[state.currentIndex] || null;
}


function isFlashPlaybackActive() {
  return Boolean(
    state.view === "flash" &&
    !state.archiveOpen &&
    !state.statsOpen &&
    currentFlashWord() &&
    state.settings &&
    state.settings.manualMode !== true &&
    state.playbackPaused !== true
  );
}


function isSpeechSpeakingNow() {
  try {
    return Boolean(typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.speaking);
  } catch (_) {
    return false;
  }
}


function isStudyMoving() {
  return Boolean(
    state.view === "flash" &&
    (
      isFlashPlaybackActive() ||
      state.transitioning === true ||
      Boolean(state.pointer) ||
      isSpeechSpeakingNow() ||
      (Array.isArray(state.timers) && state.timers.length > 0)
    )
  );
}


function pendingStudyFlushExists() {
  return Boolean(
    (typeof hasPendingProgressSync === "function" && hasPendingProgressSync()) ||
    (typeof hasPendingActivityDraft === "function" && hasPendingActivityDraft())
  );
}


function flushPendingStudyForBoundary(reason = "boundary") {
  var progressFlushed = typeof flushProgressForCloud === "function" ? flushProgressForCloud(reason) : false;
  var activityFlushed = typeof flushActivityForCloud === "function" ? flushActivityForCloud(reason) : false;
  return Boolean(progressFlushed || activityFlushed);
}


function shouldFlushPendingBeforeSync(reason) {
  return [
    "active_study_idle_upload",
    "manual",
    "manual_push",
    "manual_retry",
    "pagehide_flush",
    "visibility_hidden_flush",
    "visibility_resume_dirty_flush",
    "visibility_resume",
    "archive_open",
    "archive_tab_switch",
    "stats_open",
    "setup_open",
    "config_saved",
    "pause",
    "pause_background",
    "manual_pause"
  ].includes(String(reason || ""));
}


function preparePendingStudyFlushForSync(reason) {
  if (!shouldFlushPendingBeforeSync(reason)) return false;
  var changed = flushPendingStudyForBoundary(reason || "sync");
  if (changed && typeof appendAuditEvent === "function") {
    appendAuditEvent({ type: "sync:pending_study_flushed_before_facts", message: "reason=" + String(reason || "") });
  }
  return changed;
}

function shouldUseActiveStudyDebounce() {
  if (state.view !== "flash") return false;
  if (typeof getActiveStudyFacts === "function") {
    var facts = getActiveStudyFacts();
    return Boolean(facts.inFlash && (facts.withinIdleWindow || facts.studyMoving || facts.playbackActive || facts.timersActive || facts.speechSpeaking || facts.pointerActive || facts.transitioning));
  }
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  if (!last) return false;
  return Date.now() - last < ACTIVE_STUDY_SYNC_DEBOUNCE_MS || (typeof isStudyMoving === "function" && isStudyMoving());
}


function activeStudyIdleDelayMs(delayOverride) {
  if (Number.isFinite(Number(delayOverride)) && Number(delayOverride) >= 0) return Math.max(1000, Number(delayOverride));
  if (typeof activeStudyDelayRemainingMs === "function") return activeStudyDelayRemainingMs();
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  if (!last || state.view !== "flash") return ACTIVE_STUDY_SYNC_DEBOUNCE_MS;
  return Math.max(1000, ACTIVE_STUDY_SYNC_DEBOUNCE_MS - (Date.now() - last));
}


function activeStudySyncWorkExists() {
  var syncState = ensureHashSyncState(state.syncHashState);
  var localHash = String(syncState.localPayloadHash || "");
  var baseHash = String(syncState.baseRemoteHash || "");
  var hashDirty = Boolean(baseHash && localHash && localHash !== baseHash);
  return Boolean(syncState.localDirty || hashDirty || (typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists()) || state.lastDirtyFromVerify);
}

function scheduleActiveStudyUpload(delayOverride) {
  if (!activeStudySyncWorkExists()) {
    state.pendingActiveStudyUpload = false;
    if (state.activeStudySyncTimer) {
      clearTimeout(state.activeStudySyncTimer);
      state.activeStudySyncTimer = null;
    }
    var now = Date.now();
    if (!state.lastActiveStudySkipCleanAuditAt || now - state.lastActiveStudySkipCleanAuditAt > 10000) {
      state.lastActiveStudySkipCleanAuditAt = now;
      appendAuditEvent({ type: "sync:active_study_idle_upload_skip_clean", message: "session=" + TAB_ID + " reason=no_dirty_or_pending" });
    }
    return false;
  }
  state.pendingActiveStudyUpload = true;
  if (state.activeStudySyncTimer) {
    clearTimeout(state.activeStudySyncTimer);
    state.activeStudySyncTimer = null;
  }
  var delay = activeStudyIdleDelayMs(delayOverride);
  state.activeStudySyncTimer = setTimeout(function() {
    state.activeStudySyncTimer = null;
    var hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    appendAuditEvent({ type: "sync:active_study_idle_upload", message: "session=" + TAB_ID + " hidden=" + String(!!hidden) + " delay=" + String(delay) });
    if (hidden) {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:active_study_idle_upload_deferred_hidden", message: "session=" + TAB_ID + " dirty_preserved=true wait=visibility_resume" });
      updateSyncIndicator();
      return;
    }
    Promise.resolve(syncTick({ reason: "active_study_idle_upload", keepalive: false })).then(function(result) {
      var syncState = ensureHashSyncState(state.syncHashState);
      if (result && syncState && !syncState.localDirty && !(typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) {
        state.pendingActiveStudyUpload = false;
      }
    }).catch(function(error) {
      state.pendingActiveStudyUpload = true;
      appendAuditEvent({ type: "sync:active_study_idle_upload_deferred", message: "session=" + TAB_ID + " dirty_preserved=true error=" + String(error && error.message || error || "") });
    });
  }, delay);
}


function clearActiveStudyTimerIfClean() {
  var syncState = ensureHashSyncState(state.syncHashState);
  if (!syncState.localDirty && !pendingStudyFlushExists()) {
    state.pendingActiveStudyUpload = false;
    if (state.activeStudySyncTimer) {
      clearTimeout(state.activeStudySyncTimer);
      state.activeStudySyncTimer = null;
    }
    if (state.autoPushDebounceTimer) {
      clearTimeout(state.autoPushDebounceTimer);
      state.autoPushDebounceTimer = null;
    }
    appendAuditEvent({ type: "sync:pending_timers_cleared_after_clean", message: "session=" + TAB_ID });
  }
}


function markLocalDirtyLight(reason = "change") {
  if (state.applyingRemotePayload || state.suppressDirty) return;
  if (typeof auditLocalDirtySet === "function") auditLocalDirtySet(reason);
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localDirty = true;
  if (!state.syncHashState.dirtySince) state.syncHashState.dirtySince = beijingISOString();
  state.syncHashState.lastSyncStatus = "dirty";
  state.syncHashState.lastSyncError = "";
  state.syncHashState.lastSyncErrorAt = "";
  if (reason !== "local_changed_during_verify") {
    state.lastDirtyReason = state.view === "flash" ? "active_study" : String(reason || "change");
    state.lastDirtyFromVerify = false;
  }
  persistHashSyncState();
  updateSyncIndicator();
  if (state.view === "flash") {
    scheduleActiveStudyUpload();
  } else {
    scheduleSyncSoon("local_change", AUTO_PUSH_DEBOUNCE_MS);
  }
}


function markLocalDirtyAfterBusinessWrite(reason = "change") {
  if (state.applyingRemotePayload || state.suppressDirty) return;
  if (typeof auditLocalDirtySet === "function") auditLocalDirtySet(reason);
  if (shouldUseActiveStudyDebounce()) {
    markLocalDirtyLight(reason);
    return;
  }
  const local = refreshLocalPayloadHash({ persist: false });
  state.syncHashState = ensureHashSyncState(state.syncHashState);
  state.syncHashState.localPayloadHash = local.hash;
  state.syncHashState.localDirty = true;
  if (!state.syncHashState.dirtySince) state.syncHashState.dirtySince = beijingISOString();
  state.syncHashState.lastSyncStatus = "dirty";
  if (reason !== "local_changed_during_verify") {
    state.lastDirtyReason = shouldUseActiveStudyDebounce() ? "active_study" : String(reason || "change");
    state.lastDirtyFromVerify = false;
  }
  persistHashSyncState();
  try { writeLocalSnapshot(reason); } catch (error) { state.syncHashState.lastBackupError = error?.message || "本地快照写入失败"; persistHashSyncState(); }
  try { writeDailyBackup(reason); } catch (error) { state.syncHashState.lastBackupError = error?.message || "每日备份写入失败"; persistHashSyncState(); }
  writeHashBackup("latest", local.payload, reason);
  writeDailyHashBackups(local.payload, reason);
  updateSyncIndicator();
  if (shouldUseActiveStudyDebounce()) {
    scheduleActiveStudyUpload();
    return;
  }
  scheduleSyncSoon("local_change", AUTO_PUSH_DEBOUNCE_MS);
}


function syncRetryRemainingMs() {
  var nextRetryAt = ensureHashSyncState(state.syncHashState).nextRetryAt;
  var retryAtMs = Date.parse(nextRetryAt || "");
  if (!Number.isFinite(retryAtMs)) return 0;
  return Math.max(0, retryAtMs - Date.now());
}

function scheduleSyncSoon(reason = "local_change", delayMs = AUTO_PUSH_DEBOUNCE_MS) {
  reason = String(reason || "local_change");
  var delay = Math.max(0, Number(delayMs) || 0);
  var automatic = !isHardForcedSyncReason(reason);
  if (automatic) delay = Math.max(delay, syncRetryRemainingMs());

  var dueAt = Date.now() + delay;
  if (state.autoPushDebounceTimer && state.autoSyncDueAt && state.autoSyncDueAt <= dueAt) {
    return false;
  }
  if (state.autoPushDebounceTimer) clearTimeout(state.autoPushDebounceTimer);
  state.autoSyncDueAt = dueAt;
  state.autoSyncReason = reason;
  state.autoPushDebounceTimer = setTimeout(function() {
    state.autoPushDebounceTimer = null;
    state.autoSyncDueAt = 0;
    var queuedReason = state.autoSyncReason || reason;
    state.autoSyncReason = "";
    if (typeof document !== "undefined" && document.hidden) {
      state.pendingActiveStudyUpload = true;
      return;
    }
    syncTick({ reason: queuedReason });
  }, delay);
  return true;
}

function startSyncHeartbeat() {
  if (state.syncHeartbeatTimer) clearInterval(state.syncHeartbeatTimer);
  state.syncHeartbeatTimer = setInterval(function() {
    if (typeof document !== "undefined" && document.hidden) return;
    var gate = savedCloudConfigGate();
    if (!gate.ok) return;
    var syncState = ensureHashSyncState(state.syncHashState);
    var pollDue = !state.lastCleanRemotePollAt || Date.now() - state.lastCleanRemotePollAt >= SYNC_CLEAN_REMOTE_POLL_MS;
    if (!syncState.localDirty && !pollDue && !(typeof pendingStudyFlushExists === "function" && pendingStudyFlushExists())) return;
    syncTick({ reason: "heartbeat" });
  }, SYNC_HEARTBEAT_MS);
}


function maybeRemindExport() {
  var meta = ensureSyncMeta(state.syncMeta);
  try {
    if ((meta.readOnlyMode || !meta.cloudWritable) && !sessionStorage.getItem("export_reminded")) {
      sessionStorage.setItem("export_reminded", "1");
    }
  } catch (_) {}
}


function onLocalDataChanged(reason) {
  reason = reason || "change";
  bumpLocalBusinessRevision(reason, { source: "user" });
  markLocalDirtyAfterBusinessWrite(reason);
  maybeRemindExport();
}

// ── 自动推送调度 ──────────────────────────────────────────────────────
