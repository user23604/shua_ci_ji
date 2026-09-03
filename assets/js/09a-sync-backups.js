"use strict";

function loadHashBackupIndex() {
  const store = loadJson(HASH_BACKUP_INDEX_KEY, { items: [] });
  return Array.isArray(store.items) ? store.items.filter(isPlainObject) : [];
}


function saveHashBackupIndex(items) {
  const raw = JSON.stringify({ items: Array.isArray(items) ? items.slice(-100) : [] });
  try {
    localStorage.setItem(HASH_BACKUP_INDEX_KEY, raw);
    return true;
  } catch (_) {
    // Index is only metadata. Never evict real recovery backups just to save the index.
    try { localStorage.removeItem(HASH_BACKUP_INDEX_KEY); } catch (_) {}
    try { localStorage.setItem(HASH_BACKUP_INDEX_KEY, raw); return true; } catch (_) { return false; }
  }
}

const LOCAL_BACKUP_SOFT_BUDGET_BYTES = 1536 * 1024;

function localStorageApproxBytes(key, value) {
  return (String(key || "").length + String(value || "").length) * 2;
}

function localSafetyBackupPayload(payload) {
  const normalized = normalizeSyncPayload(payload || collectSyncPayload());
  const compact = typeof compactSyncPayloadForTransport === "function"
    ? compactSyncPayloadForTransport(normalized)
    : cloneJson(normalized);
  // Historical round archives already live in ROUND_ARCHIVES_KEY and are synchronized to Gist.
  // Duplicating them into every local safety backup multiplies storage usage after each round.
  compact.round = sanitizeRoundStatePayload(normalized.round);
  compact.archives = {};
  return compact;
}

function compactBackupObjectForLocalStorage(parsed) {
  if (!isPlainObject(parsed) || !isPlainObject(parsed.payload)) return null;
  let normalized;
  try { normalized = normalizeSyncPayload(parsed.payload); } catch (_) { return null; }
  const compactPayload = localSafetyBackupPayload(normalized);
  const result = { ...parsed };
  result.payload = compactPayload;
  result.payloadHash = businessPayloadHash(normalizeSyncPayload(compactPayload));
  result.archiveHistoryExcluded = true;
  result.archiveCountAtSave = Object.keys(sanitizeRoundArchiveStore(normalized.archives)).length;
  return result;
}

function isLocalBackupStorageKey(key) {
  const value = String(key || "");
  return value === LOCAL_SNAPSHOT_KEY || value.startsWith(DAILY_BACKUP_PREFIX) || value.startsWith(HASH_BACKUP_PREFIX);
}

function compactLocalBackupStorageKey(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch (_) { return { compacted: false, removed: false, bytesFreed: 0 }; }
  if (!raw) return { compacted: false, removed: false, bytesFreed: 0 };
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return { compacted: false, removed: false, bytesFreed: 0 }; }
  const compacted = compactBackupObjectForLocalStorage(parsed);
  if (!compacted) return { compacted: false, removed: false, bytesFreed: 0 };
  const nextRaw = JSON.stringify(compacted);
  if (nextRaw.length >= raw.length) return { compacted: false, removed: false, bytesFreed: 0 };
  try {
    localStorage.setItem(key, nextRaw);
    return { compacted: true, removed: false, bytesFreed: Math.max(0, (raw.length - nextRaw.length) * 2) };
  } catch (error) {
    // Replacing a large value can itself hit quota on some WebViews. This key is only a
    // redundant safety copy, so deleting that one copy is safer than blocking live data.
    if (!isQuotaExceededError(error)) return { compacted: false, removed: false, bytesFreed: 0 };
    try {
      localStorage.removeItem(key);
      try {
        localStorage.setItem(key, nextRaw);
        return { compacted: true, removed: false, bytesFreed: Math.max(0, (raw.length - nextRaw.length) * 2) };
      } catch (_) {
        return { compacted: false, removed: true, bytesFreed: localStorageApproxBytes(key, raw) };
      }
    } catch (_) {
      return { compacted: false, removed: false, bytesFreed: 0 };
    }
  }
}

function compactExistingLocalBackupCopies() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (isLocalBackupStorageKey(key)) keys.push(key);
    }
  } catch (_) {}
  let compacted = 0;
  let removed = 0;
  let bytesFreed = 0;
  keys.forEach(function(key) {
    const result = compactLocalBackupStorageKey(key);
    if (result.compacted) compacted += 1;
    if (result.removed) removed += 1;
    bytesFreed += Number(result.bytesFreed || 0);
  });
  return { scanned: keys.length, compacted, removed, bytesFreed };
}

function localBackupEntryMeta(key, raw, indexByKey) {
  const indexed = indexByKey.get(key) || {};
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch (_) {}
  const savedAt = String(indexed.savedAt || (parsed && parsed.savedAt) || "");
  let nonEmpty = indexed.nonEmpty === true || Boolean(parsed && parsed.nonEmpty === true);
  if (!nonEmpty && isPlainObject(parsed && parsed.payload)) {
    try { nonEmpty = hasBusinessData(normalizeSyncPayload(parsed.payload)); } catch (_) {}
  }
  let priority = 40;
  if (key === `${HASH_BACKUP_PREFIX}latest`) priority = 95;
  else if (key === `${HASH_BACKUP_PREFIX}daily:${localDateKey()}:first_non_empty`) priority = 110;
  else if (String(indexed.kind || (parsed && parsed.kind) || "") === "pre_overwrite") priority = 105;
  else if (String(indexed.kind || (parsed && parsed.kind) || "") === "pre_round_archive") priority = 100;
  else if (key === LOCAL_SNAPSHOT_KEY) priority = 85;
  else if (key === DAILY_BACKUP_PREFIX + localDateKey()) priority = 90;
  else if (nonEmpty) priority = 75;
  return { key, raw, savedAt, nonEmpty, priority, bytes: localStorageApproxBytes(key, raw) };
}

function clearRedundantLocalBackupCopiesForQuota() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (isLocalBackupStorageKey(key)) keys.push(key);
    }
  } catch (_) {}
  let removed = 0;
  let bytesFreed = 0;
  keys.forEach(function(key) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_) {}
    try {
      localStorage.removeItem(key);
      removed += 1;
      if (raw !== null) bytesFreed += localStorageApproxBytes(key, raw);
    } catch (_) {}
  });
  try { localStorage.removeItem(HASH_BACKUP_INDEX_KEY); } catch (_) {}
  return { removed, bytesFreed };
}

function pruneLocalBackupCopiesToBudget(maxBytes = LOCAL_BACKUP_SOFT_BUDGET_BYTES, options = {}) {
  const budget = Math.max(128 * 1024, Number(maxBytes) || LOCAL_BACKUP_SOFT_BUDGET_BYTES);
  const index = loadHashBackupIndex();
  const indexByKey = new Map(index.filter(function(item) { return item && item.key; }).map(function(item) { return [item.key, item]; }));
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!isLocalBackupStorageKey(key)) continue;
      const raw = localStorage.getItem(key);
      if (raw !== null) entries.push(localBackupEntryMeta(key, raw, indexByKey));
    }
  } catch (_) {}
  let total = entries.reduce(function(sum, item) { return sum + item.bytes; }, 0);
  if (total <= budget) return { removed: 0, bytesFreed: 0, bytesRemaining: total };

  const newestNonEmpty = entries.filter(function(item) { return item.nonEmpty; }).sort(function(a, b) {
    return (Date.parse(b.savedAt || "") || 0) - (Date.parse(a.savedAt || "") || 0);
  })[0];
  const protectedKey = newestNonEmpty && newestNonEmpty.key;
  const removable = entries.slice().sort(function(a, b) {
    const aProtected = a.key === protectedKey ? 1 : 0;
    const bProtected = b.key === protectedKey ? 1 : 0;
    if (aProtected !== bProtected) return aProtected - bProtected;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const at = Date.parse(a.savedAt || "") || 0;
    const bt = Date.parse(b.savedAt || "") || 0;
    if (at !== bt) return at - bt;
    return b.bytes - a.bytes;
  });

  let removed = 0;
  let bytesFreed = 0;
  removable.forEach(function(item) {
    if (total <= budget) return;
    if (item.key === protectedKey && options.keepOneRecovery !== false) return;
    try {
      localStorage.removeItem(item.key);
      removed += 1;
      bytesFreed += item.bytes;
      total = Math.max(0, total - item.bytes);
    } catch (_) {}
  });

  if (removed) {
    try {
      const remaining = new Set();
      for (let i = 0; i < localStorage.length; i += 1) remaining.add(localStorage.key(i));
      localStorage.setItem(HASH_BACKUP_INDEX_KEY, JSON.stringify({ items: index.filter(function(item) { return item && item.key && remaining.has(item.key); }).slice(-100) }));
    } catch (_) {}
  }
  return { removed, bytesFreed, bytesRemaining: total };
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
  const source = normalizeSyncPayload(payload || collectSyncPayload());
  const normalized = localSafetyBackupPayload(source);
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
    payloadHash: businessPayloadHash(normalizeSyncPayload(normalized)),
    archiveHistoryExcluded: true,
    archiveCountAtSave: Object.keys(sanitizeRoundArchiveStore(source.archives)).length,
    payload: normalized,
    syncState: ensureHashSyncState(state.syncHashState),
    pendingOpsCount: getPendingOps().length
  };
}


function writeHashBackup(kind, payload = null, reason = "") {
  const timestamp = beijingISOString().replace(/[:.]/g, "-");
  const key = kind === "latest" ? `${HASH_BACKUP_PREFIX}latest` : `${HASH_BACKUP_PREFIX}${kind}:${timestamp}`;
  const bundle = backupBundle(kind, payload, reason);
  const critical = kind === "pre_overwrite" || kind === "pre_round_archive";
  const storageOptions = critical
    ? { allowAggressiveBackupEviction: true }
    : { allowAggressiveBackupEviction: false, silentFailure: true };
  let ok = safeSetLocalStorage(key, JSON.stringify(bundle), storageOptions);
  if (!ok) {
    pruneOldHashBackups();
    ok = safeSetLocalStorage(key, JSON.stringify(bundle), storageOptions);
  }
  if (ok && kind !== "latest") {
    const items = loadHashBackupIndex();
    items.push({ key, kind, savedAt: bundle.savedAt, payloadHash: bundle.payloadHash, nonEmpty: bundle.nonEmpty, progressCount: bundle.progressCount, marksCount: bundle.marksCount, activityDayCount: bundle.activityDayCount, studyStateCount: bundle.studyStateCount });
    saveHashBackupIndex(items);
    pruneOldHashBackups();
    pruneLocalBackupCopiesToBudget();
  }
  return ok;
}


function writeDailyHashBackups(payload, reason = "") {
  const date = localDateKey();
  const latestKey = `${HASH_BACKUP_PREFIX}daily:${date}:latest`;
  const firstKey = `${HASH_BACKUP_PREFIX}daily:${date}:first_non_empty`;
  const bundle = backupBundle("daily", payload, reason);
  safeSetLocalStorage(latestKey, JSON.stringify(bundle), { allowAggressiveBackupEviction: false, silentFailure: true });
  if (!localStorage.getItem(firstKey) && !isEffectivelyEmptyLocalPayload(bundle.payload)) {
    safeSetLocalStorage(firstKey, JSON.stringify({ ...bundle, kind: "daily:first_non_empty" }), { allowAggressiveBackupEviction: false, silentFailure: true });
  }
  pruneLocalBackupCopiesToBudget();
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
        round: item.round || defaultRoundState(),
        archives: item.archives || {},
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
  // The index is best-effort metadata. Scan physical hash-backup keys too so a quota
  // event that dropped the index never makes a real recovery copy undiscoverable.
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(HASH_BACKUP_PREFIX)) add(key, {});
    }
  } catch (_) {}
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
