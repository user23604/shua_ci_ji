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
    if (item.progress || item.marks || item.markStates || item.activity || item.unitStats || item.settings || item.unknownProgress || item.unknown_progress) {
      return {
        settings: item.settings || {},
        progress: item.progress || {},
        unknownProgress: item.unknownProgress || item.unknown_progress || {},
        marks: item.marks || {},
        markStates: item.markStates || {},
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


function chooseBestBackup(candidates, options = {}) {
  const list = (Array.isArray(candidates) ? candidates : []).slice();
  const recoverySource = String(options.recoverySource || "");
  const needsPreOverwriteCheckpoint = /rollback|apply|overwrite|transaction/.test(recoverySource);
  function validityPriority(candidate) {
    if (candidate && candidate.kind === "valid_nonempty") return 4;
    if (candidate && candidate.kind === "valid_empty") return 3;
    if (candidate && candidate.kind === "broken_high_confidence_nonempty") return 2;
    return 1;
  }
  function reasonMatchPriority(candidate) {
    var key = String(candidate && candidate.key || "");
    if (needsPreOverwriteCheckpoint && /pre_overwrite/.test(key)) return 2;
    return 0;
  }
  function typePriority(candidate) {
    var key = String(candidate && candidate.key || "");
    // 普通“本地为空”恢复优先使用最近快照；事务/覆盖失败则由 reasonMatch 优先选覆盖前检查点。
    if (/latest/.test(key)) return 5;
    if (/daily/.test(key)) return 4;
    if (/pre_overwrite/.test(key)) return 3;
    if (/first_non_empty/.test(key)) return 2;
    if (/startup/.test(key)) return 1;
    return 0;
  }
  list.sort(function(a, b) {
    var validityDiff = validityPriority(b) - validityPriority(a);
    if (validityDiff) return validityDiff;
    var reasonDiff = reasonMatchPriority(b) - reasonMatchPriority(a);
    if (reasonDiff) return reasonDiff;
    var typeDiff = typePriority(b) - typePriority(a);
    if (typeDiff) return typeDiff;
    return (Date.parse(b && b.savedAt || "") || 0) - (Date.parse(a && a.savedAt || "") || 0);
  });
  return list[0] || null;
}


function tryRestoreFromBackupIfPayloadEmpty(options = {}) {
  const syncState = ensureHashSyncState(state.syncHashState);
  const recoveryLocked = syncState.localRecoveryRequired === true;
  const currentPayload = normalizeSyncPayload(collectSyncPayload());
  if (hasBusinessData(currentPayload)) {
    if (recoveryLocked) {
      setLocalRecoveryRequired(syncState.localRecoveryReason || "本地数据处于恢复保护状态，不能仅因当前数据非空而解除。请使用 rescue.html 选择明确备份。", [], {
        runId: options.runId,
        source: syncState.localRecoverySource || "existing_lock",
        checkpointHash: syncState.localRecoveryCheckpointHash || ""
      });
      return { status: "restore_failed", candidates: [], recoveryLocked: true };
    }
    return { status: "payload_has_data", candidates: [] };
  }

  const candidates = collectBackupCandidates().map(function(item) {
    return classifyBackupCandidate(item.key, item.raw, item.meta);
  });
  const validNonEmpty = candidates.filter(function(c) { return c.kind === "valid_nonempty"; });
  if (validNonEmpty.length > 0) {
    const best = chooseBestBackup(validNonEmpty, { recoverySource: syncState.localRecoverySource || "" });
    const ok = applyRemotePayloadSafely(best.payload, {
      source: "local_backup_restore",
      allowWhenLocalEmptyOnly: true,
      expectedHash: best.payloadHash,
      runId: options.runId,
      reason: "backup_restore:" + best.key
    });
    if (ok) {
      var restoredHash = businessPayloadHash(collectSyncPayload());
      if (restoredHash !== best.payloadHash) {
        setLocalRecoveryRequired("本地备份恢复后的哈希校验失败，需要人工处理", candidates, {
          runId: options.runId,
          source: "backup_restore_verify_failed",
          checkpointHash: best.payloadHash,
          technical: "expected=" + best.payloadHash + ", actual=" + restoredHash
        });
        return { status: "restore_failed", candidates };
      }
      markHashDirty(best.payloadHash, "已从本地备份恢复，等待同步", { runId: options.runId });
      if (recoveryLocked) {
        clearLocalRecoveryLock("已从有效非空本地备份恢复并完成哈希校验", { runId: options.runId, verifiedHash: best.payloadHash });
      }
      appendAuditEvent({ type: "backup:restored", message: "从 " + best.key + " 恢复 hash=" + best.payloadHash.slice(0, 8) });
      return { status: "restored", source: best.key, candidates };
    }
    setLocalRecoveryRequired("存在有效非空备份，但应用到本地失败", candidates, { runId: options.runId, source: "backup_restore_failed" });
    return { status: "restore_failed", candidates };
  }

  const highConfidenceBroken = candidates.some(function(c) { return c.kind === "broken_high_confidence_nonempty"; });
  if (highConfidenceBroken) {
    setLocalRecoveryRequired("存在疑似非空的损坏备份，需要人工处理", candidates, { runId: options.runId, source: "broken_backup" });
    return { status: "restore_failed", candidates };
  }

  const warning = candidates.some(function(c) { return c.kind === "broken_unknown" || c.kind === "invalid_shape" || c.kind === "invalid_payload"; });
  if (warning) {
    if (recoveryLocked) {
      setLocalRecoveryRequired(syncState.localRecoveryReason || "恢复保护仍未解除，且没有可自动验证的非空备份", candidates, {
        runId: options.runId,
        source: syncState.localRecoverySource || "existing_lock",
        checkpointHash: syncState.localRecoveryCheckpointHash || ""
      });
      return { status: "restore_failed", candidates };
    }
    setLocalRecoveryWarning("存在不可自动恢复的备份，但未证明其包含非空业务数据", candidates, { runId: options.runId });
    return { status: "broken_backup_warning", candidates };
  }

  if (recoveryLocked) {
    setLocalRecoveryRequired(syncState.localRecoveryReason || "恢复保护仍未解除，且没有找到可自动验证的非空备份", candidates, {
      runId: options.runId,
      source: syncState.localRecoverySource || "existing_lock",
      checkpointHash: syncState.localRecoveryCheckpointHash || ""
    });
    return { status: "restore_failed", candidates };
  }
  return { status: "no_nonempty_backup", candidates };
}
