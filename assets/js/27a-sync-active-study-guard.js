"use strict";

function isHardForcedSyncReason(reason) {
  return [
    "manual", "manual_retry", "manual_push", "manual_pull",
    "ignore_empty_backup", "config_saved", "remote_restore_merge",
    "startup", "view_open_remote_check", "archive_open", "archive_tab_switch",
    "stats_open", "setup_open", "visibility_resume", "visibility_resume_dirty_flush",
    "pagehide_flush", "visibility_hidden_flush", "pause", "pause_background"
  ].includes(String(reason || ""));
}

function isActiveStudyIdleUploadReason(reason) {
  return String(reason || "") === "active_study_idle_upload";
}

function shouldBypassMinInterval(reason) {
  return isHardForcedSyncReason(reason) || isActiveStudyIdleUploadReason(reason);
}

function isForcedSyncReason(reason) {
  return isHardForcedSyncReason(reason);
}

function isForcedRemoteCheckReason(reason) {
  return isHardForcedSyncReason(reason);
}

function canRunWhileHidden(reason) {
  return ["pagehide_flush", "visibility_hidden_flush"].includes(String(reason || ""));
}

function getActiveStudyFacts() {
  var inFlash = state.view === "flash";
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  var elapsedMs = last ? Date.now() - last : Infinity;
  var playbackActive = inFlash && typeof isFlashPlaybackActive === "function" && isFlashPlaybackActive();
  var speechSpeaking = inFlash && typeof isSpeechSpeakingNow === "function" && isSpeechSpeakingNow();
  var timersActive = inFlash && Array.isArray(state.timers) && state.timers.length > 0;
  var pointerActive = inFlash && Boolean(state.pointer);
  var transitioning = inFlash && state.transitioning === true;
  var studyMoving = inFlash && typeof isStudyMoving === "function" && isStudyMoving();
  var withinIdleWindow = inFlash && last && elapsedMs < ACTIVE_STUDY_SYNC_DEBOUNCE_MS;
  return {
    inFlash: inFlash,
    lastActiveStudyAt: last || 0,
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : -1,
    withinIdleWindow: Boolean(withinIdleWindow),
    playbackActive: Boolean(playbackActive),
    speechSpeaking: Boolean(speechSpeaking),
    timersActive: Boolean(timersActive),
    pointerActive: Boolean(pointerActive),
    transitioning: Boolean(transitioning),
    studyMoving: Boolean(studyMoving),
    shouldDeferAutoPatch: Boolean(inFlash && (withinIdleWindow || studyMoving || playbackActive || speechSpeaking || timersActive || pointerActive || transitioning)),
    hardFlushAllowed: false
  };
}

function activeStudyDelayRemainingMs() {
  var facts = getActiveStudyFacts();
  if (!facts.inFlash || !facts.lastActiveStudyAt) return ACTIVE_STUDY_SYNC_DEBOUNCE_MS;
  if (facts.studyMoving || facts.playbackActive || facts.speechSpeaking || facts.timersActive || facts.pointerActive || facts.transitioning) return Math.max(3000, ACTIVE_STUDY_SYNC_DEBOUNCE_MS - Math.max(0, facts.elapsedMs));
  return Math.max(1000, ACTIVE_STUDY_SYNC_DEBOUNCE_MS - Math.max(0, facts.elapsedMs));
}

function shouldDeferForActiveStudy(reason) {
  if (isHardForcedSyncReason(reason)) return false;
  var facts = getActiveStudyFacts();
  if (!facts.inFlash) return false;
  if (isActiveStudyIdleUploadReason(reason)) return facts.shouldDeferAutoPatch;
  if (!facts.shouldDeferAutoPatch) return false;
  return [
    "heartbeat", "local_change", "min_interval_reschedule", "visible_delayed", "active_auto",
    "active_study_idle_upload_pending", "local_changed_during_verify", "patch_in_flight_reschedule",
    "verify_mismatch_retry", "cross_tab_lock_retry"
  ].includes(String(reason || ""));
}

function shouldAbortAutoPatchForActiveStudy(reason) {
  if (isHardForcedSyncReason(reason)) return false;
  var facts = getActiveStudyFacts();
  return Boolean(facts.inFlash && facts.shouldDeferAutoPatch);
}

function shouldDeferFlashAutoSync(reason) {
  if (state.view !== "flash") return false;
  return [
    "heartbeat", "local_change", "min_interval_reschedule", "cross_tab_lock_retry",
    "verify_mismatch_retry", "patch_in_flight_reschedule"
  ].includes(String(reason || ""));
}
