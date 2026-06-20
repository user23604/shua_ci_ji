"use strict";

function loadHashBackupIndex() {
  const store = loadJson(HASH_BACKUP_INDEX_KEY, { items: [] });
  return Array.isArray(store.items) ? store.items.filter(isPlainObject) : [];
}


function saveHashBackupIndex(items) {
  safeSetLocalStorage(HASH_BACKUP_INDEX_KEY, JSON.stringify({ items: Array.isArray(items) ? items.slice(-100) : [] }), { priority: "snapshot" });
}


function pruneOldHashBackups() {
  const items = loadHashBackupIndex()
    .filter(function(item) { return item && item.key; })
    .filter(function(item, index, array) { return array.findIndex(function(other) { return other.key === item.key; }) === index; });
  function timeValue(item) { return Date.parse(item.savedAt || "") || 0; }
  const existing = items.filter(function(item) { try { return Boolean(localStorage.getItem(item.key)); } catch (_) { return false; } });
  const nonEmpty = existing.filter(function(item) { return item.nonEmpty === true; }).sort(function(a, b) { return timeValue(b) - timeValue(a); });
  const preOverwrite = existing.filter(function(item) { return item.kind === "pre_overwrite"; }).sort(function(a, b) { return timeValue(b) - timeValue(a); });
  const startupEmpty = existing.filter(function(item) { return item.kind === "startup" && item.nonEmpty === false; }).sort(function(a, b) { return timeValue(b) - timeValue(a); }).slice(0, 3);
  const daily = existing.filter(function(item) { return /^daily/.test(item.kind || ""); }).sort(function(a, b) { return timeValue(b) - timeValue(a); }).slice(0, 10);
  const keep = [];
  function add(list) {
    list.forEach(function(item) {
      if (item && item.key && keep.findIndex(function(k) { return k.key === item.key; }) === -1) keep.push(item);
    });
  }
  add(preOverwrite.slice(0, 5));
  add(nonEmpty.slice(0, 5));
  add(daily);
  add(startupEmpty);
  add(existing.sort(function(a, b) { return timeValue(b) - timeValue(a); }));
  const finalKeep = keep.slice(0, 20).sort(function(a, b) { return timeValue(a) - timeValue(b); });
  const keepKeys = new Set(finalKeep.map(function(item) { return item.key; }));
  existing.forEach(function(item) {
    if (item.key && !keepKeys.has(item.key)) {
      try { localStorage.removeItem(item.key); } catch (_) {}
    }
  });
  saveHashBackupIndex(finalKeep);
}

function backupBundle(kind, payload, reason = "") {
  const normalized = normalizeSyncPayload(payload || collectSyncPayload());
  const progressCount = countProgressRecords(normalized);
  const marksCount = countMarkedRecords(normalized);
  const activityDayCount = countActivityRecords(normalized);
  const studyStateCount = countUserStudyStateRecords(normalized);
  return {
    kind,
    reason,
    savedAt: beijingISOString(),
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    nonEmpty: hasBusinessData(normalized),
    progressCount,
    marksCount,
    activityDayCount,
    studyStateCount,
    payloadHash: businessPayloadHash(normalized),
    payload: normalized,
    syncState: ensureHashSyncState(state.syncHashState),
    pendingOpsCount: getPendingOps().length
  };
}


function writeHashBackup(kind, payload = null, reason = "") {
  const timestamp = beijingISOString().replace(/[:.]/g, "-");
  const key = kind === "latest" ? `${HASH_BACKUP_PREFIX}latest` : `${HASH_BACKUP_PREFIX}${kind}:${timestamp}`;
  const bundle = backupBundle(kind, payload, reason);
  let ok = safeSetLocalStorage(key, JSON.stringify(bundle));
  if (!ok) {
    pruneOldHashBackups();
    ok = safeSetLocalStorage(key, JSON.stringify(bundle));
  }
  if (ok && kind !== "latest") {
    const items = loadHashBackupIndex();
    items.push({ key, kind, savedAt: bundle.savedAt, payloadHash: bundle.payloadHash, nonEmpty: bundle.nonEmpty, progressCount: bundle.progressCount, marksCount: bundle.marksCount, activityDayCount: bundle.activityDayCount, studyStateCount: bundle.studyStateCount });
    saveHashBackupIndex(items);
    pruneOldHashBackups();
  }
  return ok;
}


function writeDailyHashBackups(payload, reason = "") {
  const date = localDateKey();
  const latestKey = `${HASH_BACKUP_PREFIX}daily:${date}:latest`;
  const firstKey = `${HASH_BACKUP_PREFIX}daily:${date}:first_non_empty`;
  const bundle = backupBundle("daily", payload, reason);
  safeSetLocalStorage(latestKey, JSON.stringify(bundle));
  if (!localStorage.getItem(firstKey) && !isEffectivelyEmptyLocalPayload(bundle.payload)) {
    safeSetLocalStorage(firstKey, JSON.stringify({ ...bundle, kind: "daily:first_non_empty" }));
  }
}


function hasNonEmptyBackupData() {
  try {
    return collectBackupCandidates().some(function(item) {
      return classifyBackupCandidate(item.key, item.raw, item.meta).kind === "valid_nonempty";
    });
  } catch (_) {
    return false;
  }
}


function isStrictlyEmptyLocalPayload(payload) {
  return !hasBusinessData(payload || collectSyncPayload()) && !hasNonEmptyBackupData();
}


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
    "config_saved"
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
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  if (!last) return false;
  return Date.now() - last < ACTIVE_STUDY_SYNC_DEBOUNCE_MS || (typeof isStudyMoving === "function" && isStudyMoving());
}


function activeStudyIdleDelayMs(delayOverride) {
  if (Number.isFinite(Number(delayOverride)) && Number(delayOverride) >= 0) return Math.max(1000, Number(delayOverride));
  var last = typeof lastActiveStudyAt === "function" ? Number(lastActiveStudyAt() || 0) : Number(state.lastUserStudyActionAt || 0);
  if (!last || state.view !== "flash") return ACTIVE_STUDY_SYNC_DEBOUNCE_MS;
  return Math.max(1000, ACTIVE_STUDY_SYNC_DEBOUNCE_MS - (Date.now() - last));
}


function scheduleActiveStudyUpload(delayOverride) {
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
    Promise.resolve(syncTick({ reason: "active_study_idle_upload", bypassBackoff: true, keepalive: hidden })).then(function(result) {
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
    if (state.minIntervalRescheduleTimer) {
      clearTimeout(state.minIntervalRescheduleTimer);
      state.minIntervalRescheduleTimer = null;
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


function scheduleSyncSoon(reason = "local_change", delayMs = AUTO_PUSH_DEBOUNCE_MS) {
  var timerName = String(reason || "") === "min_interval_reschedule" ? "minIntervalRescheduleTimer" : "autoPushDebounceTimer";
  if (state[timerName]) clearTimeout(state[timerName]);
  state[timerName] = setTimeout(function() {
    state[timerName] = null;
    syncTick({ reason, bypassBackoff: true });
  }, delayMs);
}


function startSyncHeartbeat() {
  if (state.syncHeartbeatTimer) clearInterval(state.syncHeartbeatTimer);
  state.syncHeartbeatTimer = setInterval(() => {
    syncTick({ reason: "heartbeat" });
  }, SYNC_HEARTBEAT_MS);
}

function extractBusinessPayloadFromBackupObject(obj) {
  if (!obj || typeof obj !== "object") return null;
  const innerCandidates = [
    obj.payload,
    obj.snapshot,
    obj.data,
    obj.businessPayload,
    obj.syncPayload,
    obj.payload && obj.payload.payload,
    obj.snapshot && obj.snapshot.payload,
    obj
  ].filter(Boolean);
  for (var i = 0; i < innerCandidates.length; i += 1) {
    var item = innerCandidates[i];
    if (!item || typeof item !== "object") continue;
    if (item.progress || item.marks || item.activity || item.unitStats || item.settings || item.unknownProgress || item.unknown_progress) {
      return {
        settings: item.settings || {},
        progress: item.progress || {},
        unknownProgress: item.unknownProgress || item.unknown_progress || {},
        marks: item.marks || {},
        activity: item.activity || {},
        unitStats: item.unitStats || item.unit_stats || {},
        activeBookId: item.activeBookId || item.bookId || ""
      };
    }
  }
  return null;
}


function collectBackupCandidates() {
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 86400000));
  const keys = new Map();
  function add(key, meta) { if (key && !keys.has(key)) keys.set(key, meta || {}); }
  add(`${HASH_BACKUP_PREFIX}latest`, { kind: "latest" });
  add(`${HASH_BACKUP_PREFIX}daily:${today}:latest`, { kind: "daily" });
  add(`${HASH_BACKUP_PREFIX}daily:${today}:first_non_empty`, { kind: "daily:first_non_empty" });
  if (yesterday !== today) {
    add(`${HASH_BACKUP_PREFIX}daily:${yesterday}:latest`, { kind: "daily" });
    add(`${HASH_BACKUP_PREFIX}daily:${yesterday}:first_non_empty`, { kind: "daily:first_non_empty" });
  }
  loadHashBackupIndex().forEach(function(item) { if (item && item.key) add(item.key, item); });
  add(LOCAL_SNAPSHOT_KEY, { kind: "legacy_snapshot" });
  add(DAILY_BACKUP_PREFIX + today, { kind: "legacy_daily" });
  if (yesterday !== today) add(DAILY_BACKUP_PREFIX + yesterday, { kind: "legacy_daily" });
  const out = [];
  keys.forEach(function(meta, key) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_) { raw = null; }
    out.push({ key, raw, meta });
  });
  return out;
}


function classifyBackupCandidate(key, raw, meta = {}) {
  const base = {
    key,
    exists: raw !== null && raw !== undefined,
    parseOk: false,
    wrapperOk: false,
    payloadOk: false,
    validateOk: false,
    nonEmpty: false,
    payloadHash: "",
    savedAt: meta.savedAt || "",
    reason: "",
    payload: null,
    meta: meta || {},
    kind: "missing"
  };
  if (!base.exists) {
    base.reason = "missing";
    return base;
  }
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    base.parseOk = true;
  } catch (error) {
    base.reason = error && error.message || "JSON 解析失败";
    base.kind = meta && meta.nonEmpty === true ? "broken_high_confidence_nonempty" : "broken_unknown";
    return base;
  }
  if (!parsed || typeof parsed !== "object") {
    base.reason = "备份不是对象";
    base.kind = "invalid_shape";
    return base;
  }
  base.wrapperOk = true;
  base.savedAt = parsed.savedAt || parsed.timestamp || parsed.createdAt || base.savedAt || "";
  const extracted = extractBusinessPayloadFromBackupObject(parsed);
  if (!extracted) {
    base.reason = "未找到业务 payload";
    base.kind = "invalid_shape";
    return base;
  }
  base.payloadOk = true;
  let normalized;
  try {
    normalized = normalizeSyncPayload(extracted);
  } catch (error) {
    base.reason = error && error.message || "payload normalize 失败";
    base.kind = (parsed.nonEmpty === true || meta.nonEmpty === true) ? "broken_high_confidence_nonempty" : "invalid_payload";
    return base;
  }
  if (!validateSyncPayload(normalized)) {
    base.reason = "payload validate 失败";
    base.kind = (parsed.nonEmpty === true || meta.nonEmpty === true) ? "broken_high_confidence_nonempty" : "invalid_payload";
    return base;
  }
  base.validateOk = true;
  base.payload = normalized;
  base.payloadHash = businessPayloadHash(normalized);
  base.nonEmpty = hasBusinessData(normalized);
  base.kind = base.nonEmpty ? "valid_nonempty" : "valid_empty";
  base.reason = base.kind;
  return base;
}


function chooseBestBackup(candidates) {
  const list = (Array.isArray(candidates) ? candidates : []).slice();
  list.sort(function(a, b) {
    const score = function(c) {
      let s = 0;
      if (c.kind === "valid_nonempty") s += 1000;
      if (/pre_overwrite/.test(c.key || "")) s += 200;
      if (/first_non_empty/.test(c.key || "")) s += 150;
      if (/latest/.test(c.key || "")) s += 100;
      s += Date.parse(c.savedAt || "") || 0;
      return s;
    };
    return score(b) - score(a);
  });
  return list[0] || null;
}


function summarizeBackupCandidates(candidates) {
  return backupCandidateSummaryText(candidates);
}


function tryRestoreFromBackupIfPayloadEmpty(options = {}) {
  const currentPayload = normalizeSyncPayload(collectSyncPayload());
  if (hasBusinessData(currentPayload)) {
    clearLocalRecoveryLock("当前本地已有业务数据，不需要备份恢复", { runId: options.runId });
    return { status: "payload_has_data", candidates: [] };
  }

  const candidates = collectBackupCandidates().map(function(item) {
    return classifyBackupCandidate(item.key, item.raw, item.meta);
  });
  const validNonEmpty = candidates.filter(function(c) { return c.kind === "valid_nonempty"; });
  if (validNonEmpty.length > 0) {
    const best = chooseBestBackup(validNonEmpty);
    const ok = applyRemotePayloadSafely(best.payload, {
      source: "local_backup_restore",
      allowWhenLocalEmptyOnly: true,
      expectedHash: best.payloadHash,
      runId: options.runId,
      reason: "backup_restore:" + best.key
    });
    if (ok) {
      markHashDirty(best.payloadHash, "已从本地备份恢复，等待同步", { runId: options.runId });
      clearLocalRecoveryLock("已从有效非空本地备份恢复", { runId: options.runId });
      appendAuditEvent({ type: "backup:restored", message: "从 " + best.key + " 恢复" });
      return { status: "restored", source: best.key, candidates };
    }
    setLocalRecoveryRequired("存在有效非空备份，但应用到本地失败", candidates, { runId: options.runId });
    return { status: "restore_failed", candidates };
  }

  const highConfidenceBroken = candidates.some(function(c) { return c.kind === "broken_high_confidence_nonempty"; });
  if (highConfidenceBroken) {
    setLocalRecoveryRequired("存在疑似非空的损坏备份，需要人工处理", candidates, { runId: options.runId });
    return { status: "restore_failed", candidates };
  }

  const warning = candidates.some(function(c) { return c.kind === "broken_unknown" || c.kind === "invalid_shape" || c.kind === "invalid_payload"; });
  if (warning) {
    setLocalRecoveryWarning("存在不可自动恢复的备份，但未证明其包含非空业务数据", candidates, { runId: options.runId });
    clearLocalRecoveryLock("未发现高可信非空损坏备份，允许继续云同步", { runId: options.runId });
    return { status: "broken_backup_warning", candidates };
  }

  clearLocalRecoveryLock("只有空备份或没有备份，允许继续同步", { runId: options.runId });
  return { status: "no_nonempty_backup", candidates };
}

function writeLocalSnapshot(reason) {
  reason = reason || "change";
  var payload = normalizeSyncPayload(collectSyncPayload());
  safeLocalStorageSet(LOCAL_SNAPSHOT_KEY, JSON.stringify({
    reason: reason,
    savedAt: beijingISOString(),
    pendingOpsCount: getPendingOps().length,
    payload: payload
  }), { priority: "snapshot" });
}


function writeDailyBackup(reason) {
  reason = reason || "change";
  var date = localDateKey();
  var payload = normalizeSyncPayload(collectSyncPayload());
  var key = DAILY_BACKUP_PREFIX + date;
  var newHash = businessPayloadHash(payload);
  var stored = localStorage.getItem(key);
  var storedHash = "";
  if (stored) {
    try {
      var parsed = JSON.parse(stored);
      if (parsed && parsed.payload) storedHash = businessPayloadHash(parsed.payload);
    } catch (_) {}
  }
  if (newHash !== storedHash) {
    safeLocalStorageSet(key, JSON.stringify({
      reason: reason,
      savedAt: beijingISOString(),
      payloadHash: newHash,
      payload: payload
    }), { priority: "daily_backup" });
  }
}


// ── P0.7 审计日志 buffer ──────────────────────────────────────────────────
var auditBuffer = [];
var auditBufferTimer = 0;
var AUDIT_BUFFER_MAX = 50;
var AUDIT_FLUSH_INTERVAL_MS = 30000;

function flushAuditBuffer() {
  clearTimeout(auditBufferTimer);
  auditBufferTimer = 0;
  if (!auditBuffer.length) return;
  try {
    var store = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var events = Array.isArray(store.events) ? store.events : [];
    var batch = auditBuffer.splice(0);
    events = events.concat(batch);
    saveJson(SYNC_AUDIT_KEY, { events: events.slice(-500) });
  } catch (_) {
    // quota 满或解析失败，静默丢弃 buffer
    auditBuffer = [];
  }
}

function appendAuditEvent(event) {
  var isHighFreq = event.type === "user:mark" || event.type === "user:undo";
  var entry = {
    at: beijingISOString(),
    type: event.type || "",
    message: event.message || "",
    httpStatus: event.httpStatus || 0
  };
  // 只对高频事件进 buffer，其他直接写入
  if (isHighFreq) {
    try {
      auditBuffer.push(entry);
      if (auditBuffer.length >= AUDIT_BUFFER_MAX) flushAuditBuffer();
      else if (!auditBufferTimer) auditBufferTimer = setTimeout(flushAuditBuffer, AUDIT_FLUSH_INTERVAL_MS);
    } catch (_) { /* 静默 */ }
    return;
  }
  try {
    var store = loadJson(SYNC_AUDIT_KEY, { events: [] });
    var events = Array.isArray(store.events) ? store.events : [];
    events.push(entry);
    saveJson(SYNC_AUDIT_KEY, { events: events.slice(-500) });
  } catch (_) { /* quota 满静默 */ }
}

// 页面离开/隐藏时强制 flush
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushAuditBuffer);
  window.addEventListener("beforeunload", flushAuditBuffer);
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") flushAuditBuffer();
  });
}


function maybeRemindExport() {
  var meta = ensureSyncMeta(state.syncMeta);
  if ((meta.readOnlyMode || !meta.cloudWritable) && !sessionStorage.getItem("export_reminded")) {
    sessionStorage.setItem("export_reminded", "1");
  }
}


function onLocalDataChanged(reason) {
  reason = reason || "change";
  bumpLocalBusinessRevision(reason, { source: "user" });
  markLocalDirtyAfterBusinessWrite(reason);
  maybeRemindExport();
}

// ── 自动推送调度 ──────────────────────────────────────────────────────


