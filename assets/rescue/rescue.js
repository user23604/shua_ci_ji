(function() {
  "use strict";
  const CLOUD_KEY = "vocab_machine_cloud_v1";
  const SETTINGS_KEY = "vocab_machine_settings_v1";
  const HASH_SYNC_STATE_KEY = "vocab_machine_hash_sync_state_v2";
  const HASH_SYNC_STATE_KEY_V1 = "vocab_machine_hash_sync_state_v1";
  const PROGRESS_CURSOR_KEY = "vocab_machine_progress_cursor_v1";
  const UNKNOWN_PROGRESS_CURSOR_KEY = "vocab_machine_unknown_progress_cursor_v1";
  const PROGRESS_PENDING_KEY = "vocab_machine_progress_pending_v1";
  const ACTIVITY_DRAFT_KEY = "vocab_machine_activity_draft_v1";
  const HASH_BACKUP_PREFIX = "vocab_machine_backup:";
  const HASH_BACKUP_INDEX_KEY = "vocab_machine_backup_index_v1";
  const DAILY_BACKUP_PREFIX = "vocab_machine_daily_backup_";
  const LOCAL_SNAPSHOT_KEY = "vocab_machine_local_snapshot_latest_v1";
  const BUSINESS_PREFIXES = [CLOUD_KEY, SETTINGS_KEY, "vocab_machine_sync_meta_v1", HASH_SYNC_STATE_KEY, HASH_SYNC_STATE_KEY_V1, HASH_BACKUP_PREFIX, DAILY_BACKUP_PREFIX, "vocab_machine_sync_audit_v1", PROGRESS_CURSOR_KEY, UNKNOWN_PROGRESS_CURSOR_KEY, PROGRESS_PENDING_KEY, ACTIVITY_DRAFT_KEY, "progress:", "unknown_progress:", "marks:", "mark_states:", "activity:", "unit_stats:", LOCAL_SNAPSHOT_KEY, "shua_ci_ji_sync_lock"];
  let lastBundle = null;
  let lastSafeBundle = null;
  let lastSummary = "";
  let lastCandidates = [];

  function $(id) { return document.getElementById(id); }
  function isPlainObject(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function nowStamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }
  function byteSize(text) { return new Blob([String(text || "")]).size; }
  function localDateKey(d = new Date()) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function sanitizeText(s) {
    return String(s || "")
      .replace(/github_pat_[A-Za-z0-9_]{30,}/g, "github_pat_[已脱敏]")
      .replace(/gh[pousr]_[A-Za-z0-9]{30,}/g, "gh*_[已脱敏]");
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      const wrapped = new Error("无法读取浏览器本地存储：" + (err && err.message ? err.message : String(err)));
      wrapped.name = (err && err.name) || "StorageReadError";
      throw wrapped;
    }
  }

  function loadHashSyncStateForRescue() {
    const current = parseJson(storageGet(HASH_SYNC_STATE_KEY) || "{}", {});
    if (current && Object.keys(current).length) return current;
    return parseJson(storageGet(HASH_SYNC_STATE_KEY_V1) || "{}", {});
  }

  function sanitize(obj) {
    if (obj == null) return obj;
    if (typeof obj === "string") return sanitizeText(obj);
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (typeof obj !== "object") return obj;
    const out = {};
    Object.keys(obj).forEach(function(k) {
      if (/token|authorization|password|secret|pat|credential|auth/i.test(k)) out[k] = "[已脱敏]";
      else out[k] = sanitize(obj[k]);
    });
    return out;
  }

  function parseJson(raw, fallback) { try { return JSON.parse(raw); } catch (_) { return fallback; } }
  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    return "{" + Object.keys(value).sort().map(k => stableStringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }
  function shortHash(obj) {
    const json = stableStringify(obj || {});
    let hash = 5381;
    for (let i = 0; i < json.length; i += 1) hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
    return hash.toString(36);
  }

  function isBusinessKey(key) { return BUSINESS_PREFIXES.some(p => key === p || key.startsWith(p)); }
  function collectLocalStorage() {
    const items = {};
    const parsed = {};
    const keys = [];
    let skipped = 0;
    let totalBytes = 0;
    let length;
    try {
      length = localStorage.length;
    } catch (err) {
      throw new Error("无法枚举浏览器本地存储：" + (err && err.message ? err.message : String(err)));
    }
    for (let i = 0; i < length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = storageGet(key);
      if (!isBusinessKey(key)) { skipped += 1; continue; }
      keys.push(key);
      items[key] = value;
      totalBytes += byteSize(value || "");
      parsed[key] = parseJson(value, null);
    }
    return { keys, items, parsed, skippedCount: skipped, totalBytes };
  }

  function extractPayload(obj) {
    if (!isPlainObject(obj)) return null;
    const candidates = [obj.payload, obj.snapshot, obj.data, obj.businessPayload, obj.syncPayload, obj.payload && obj.payload.payload, obj.snapshot && obj.snapshot.payload, obj];
    for (const item of candidates) {
      if (!isPlainObject(item)) continue;
      if (item.progress || item.marks || item.markStates || item.activity || item.unitStats || item.unknownProgress || item.settings) return normalizePayload(item);
    }
    return null;
  }
  function normalizePayload(p) {
    const src = isPlainObject(p) ? p : {};
    return {
      version: 1,
      updatedAt: typeof src.updatedAt === "string" ? src.updatedAt : new Date().toISOString(),
      activeBookId: src.activeBookId || src.bookId || "",
      settings: isPlainObject(src.settings) ? src.settings : {},
      progress: isPlainObject(src.progress) ? src.progress : {},
      unknownProgress: isPlainObject(src.unknownProgress) ? src.unknownProgress : {},
      marks: isPlainObject(src.marks) ? src.marks : {},
      markStates: isPlainObject(src.markStates) ? src.markStates : {},
      activity: isPlainObject(src.activity) ? src.activity : {},
      unitStats: isPlainObject(src.unitStats) ? src.unitStats : {}
    };
  }

  function sanitizeMarkStatesForRescue(states) {
    const source = isPlainObject(states) ? states : {};
    const out = {};
    Object.keys(source).forEach(function(wordId) {
      const id = Number(wordId);
      const item = isPlainObject(source[wordId]) ? source[wordId] : {};
      const value = item.value === "known" || item.value === "unknown" || item.value === null
        ? item.value
        : null;
      const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : "";
      const seq = Number(item.seq);
      if (!Number.isFinite(id) || id <= 0 || !updatedAt) return;
      out[String(id)] = {
        value,
        updatedAt,
        clientId: typeof item.clientId === "string" ? item.clientId : "",
        seq: Number.isFinite(seq) && seq >= 0 ? seq : 0
      };
    });
    return out;
  }

  function deriveMarksFromMarkStatesForRescue(states) {
    const known = [];
    const unknown = [];
    const clean = sanitizeMarkStatesForRescue(states);
    Object.keys(clean).forEach(function(wordId) {
      const id = Number(wordId);
      if (clean[wordId].value === "known") known.push(id);
      if (clean[wordId].value === "unknown") unknown.push(id);
    });
    known.sort((a, b) => a - b);
    unknown.sort((a, b) => a - b);
    return { known, unknown };
  }
  function countProgress(p) {
    let n = 0;
    Object.values(p.progress || {}).forEach(v => { if (v && Number(v.lastWordId) > 0) n += 1; });
    Object.values(p.unknownProgress || {}).forEach(v => {
      if (v && v.book && Number(v.book.lastWordId) > 0) n += 1;
      Object.values((v && v.units) || {}).forEach(u => { if (u && Number(u.lastWordId) > 0) n += 1; });
    });
    return n;
  }
  function countMarks(p) {
    const stateBooks = isPlainObject(p.markStates) ? p.markStates : {};
    const stateCount = Object.values(stateBooks).reduce(function(total, states) {
      return total + Object.keys(sanitizeMarkStatesForRescue(states)).length;
    }, 0);
    if (stateCount > 0) return stateCount;
    let n = 0;
    Object.values(p.marks || {}).forEach(v => { n += (Array.isArray(v.known) ? v.known.length : 0) + (Array.isArray(v.unknown) ? v.unknown.length : 0); });
    return n;
  }
  function countActivity(p) {
    let n = 0;
    Object.values(p.activity || {}).forEach(v => {
      Object.values((v && v.days) || {}).forEach(day => {
        if (day && (Number(day.seconds) > 0 || Number(day.words) > 0 || Number(day.known) > 0 || Number(day.unknown) > 0 || (Array.isArray(day.wordIds) && day.wordIds.length))) n += 1;
      });
    });
    return n;
  }
  function countStudyState(p) {
    let n = 0;
    Object.values(p.unitStats || {}).forEach(v => { Object.values((v && v.units) || {}).forEach(u => { if (u && Number(u.completed) > 0) n += 1; }); });
    return n;
  }
  function hasBusinessData(p) { return countProgress(p) > 0 || countMarks(p) > 0 || countActivity(p) > 0 || countStudyState(p) > 0; }

  function loadBackupIndex() {
    const raw = storageGet(HASH_BACKUP_INDEX_KEY);
    const parsed = parseJson(raw || "{}", {});
    return Array.isArray(parsed.items) ? parsed.items.filter(isPlainObject) : [];
  }
  function collectBackupCandidates() {
    const keys = new Map();
    const today = localDateKey();
    const yesterday = localDateKey(new Date(Date.now() - 86400000));
    function add(key, meta) { if (key && !keys.has(key)) keys.set(key, meta || {}); }
    add(HASH_BACKUP_PREFIX + "latest", { kind: "latest" });
    add(HASH_BACKUP_PREFIX + "daily:" + today + ":latest", { kind: "daily" });
    add(HASH_BACKUP_PREFIX + "daily:" + today + ":first_non_empty", { kind: "daily:first_non_empty" });
    add(HASH_BACKUP_PREFIX + "daily:" + yesterday + ":latest", { kind: "daily" });
    add(HASH_BACKUP_PREFIX + "daily:" + yesterday + ":first_non_empty", { kind: "daily:first_non_empty" });
    loadBackupIndex().forEach(item => add(item.key, item));
    add(LOCAL_SNAPSHOT_KEY, { kind: "snapshot" });
    add(DAILY_BACKUP_PREFIX + today, { kind: "legacy_daily" });
    add(DAILY_BACKUP_PREFIX + yesterday, { kind: "legacy_daily" });
    const out = [];
    keys.forEach((meta, key) => out.push({ key, meta, raw: storageGet(key) }));
    return out;
  }
  function classifyCandidate(item) {
    const c = { key: item.key, kind: "missing", savedAt: item.meta.savedAt || "", payloadHash: "", parseOk: false, validateOk: false, nonEmpty: false, progressCount: 0, marksCount: 0, activityDayCount: 0, studyStateCount: 0, score: 0, reason: "", payload: null, raw: item.raw };
    if (item.raw == null) { c.reason = "missing"; return c; }
    let parsed;
    try { parsed = JSON.parse(item.raw); c.parseOk = true; } catch (e) { c.kind = item.meta.nonEmpty === true ? "broken_high_confidence_nonempty" : "broken_unknown"; c.reason = e.message; return c; }
    const payload = extractPayload(parsed);
    if (!payload) { c.kind = "invalid_shape"; c.reason = "未找到 payload"; return c; }
    c.payload = payload;
    c.savedAt = parsed.savedAt || parsed.timestamp || item.meta.savedAt || "";
    c.payloadHash = shortHash({ settings: payload.settings, progress: payload.progress, unknownProgress: payload.unknownProgress, marks: payload.marks, markStates: payload.markStates, activity: payload.activity, unitStats: payload.unitStats });
    c.progressCount = countProgress(payload);
    c.marksCount = countMarks(payload);
    c.activityDayCount = countActivity(payload);
    c.studyStateCount = countStudyState(payload);
    c.score = c.progressCount * 10 + c.marksCount * 3 + c.activityDayCount * 2 + c.studyStateCount * 5;
    c.nonEmpty = hasBusinessData(payload);
    c.validateOk = true;
    c.kind = c.nonEmpty ? "valid_nonempty" : "valid_empty";
    c.reason = c.kind;
    return c;
  }

  function buildBundle() {
    const local = collectLocalStorage();
    const candidates = collectBackupCandidates().map(classifyCandidate).sort((a, b) => (b.score || 0) - (a.score || 0));
    const progressPending = parseJson(storageGet(PROGRESS_PENDING_KEY) || "{}", {});
    const activityDraft = parseJson(storageGet(ACTIVITY_DRAFT_KEY) || "{}", {});
    return {
      meta: { generatedAt: new Date().toISOString(), href: location.href, origin: location.origin, userAgent: navigator.userAgent },
      activeStudyPending: {
        progressPending: progressPending.pending === true,
        progressReason: progressPending.reason || "",
        activityPending: activityDraft.pending === true,
        activityReason: activityDraft.reason || ""
      },
      localStorage: local,
      candidates
    };
  }

  function buildSummary(bundle) {
    const syncState = loadHashSyncStateForRescue();
    const validNonEmpty = bundle.candidates.filter(c => c.kind === "valid_nonempty").length;
    const lines = [];
    lines.push("刷词机本地数据救援诊断摘要");
    lines.push("================================");
    lines.push("生成时间：" + bundle.meta.generatedAt);
    lines.push("页面地址：" + bundle.meta.href);
    lines.push("User Agent：" + bundle.meta.userAgent);
    lines.push("敏感信息：默认诊断已脱敏，完整备份可能包含 GitHub Token");
    lines.push("localRecoveryRequired：" + (syncState.localRecoveryRequired === true));
    lines.push("localDirty：" + (syncState.localDirty === true));
    lines.push("lastSyncStatus：" + (syncState.lastSyncStatus || "无"));
    lines.push("lastSyncError：" + (syncState.lastSyncError || "无"));
    lines.push("业务 localStorage key 数量：" + bundle.localStorage.keys.length);
    lines.push("跳过非业务 key：" + bundle.localStorage.skippedCount);
    lines.push("业务 localStorage 大小：" + bundle.localStorage.totalBytes + " bytes");
    lines.push("progress pending：" + (bundle.activeStudyPending.progressPending === true) + " reason=" + (bundle.activeStudyPending.progressReason || ""));
    lines.push("activity draft pending：" + (bundle.activeStudyPending.activityPending === true) + " reason=" + (bundle.activeStudyPending.activityReason || ""));
    lines.push("备份候选数量：" + bundle.candidates.length);
    lines.push("可自动恢复的非空备份：" + validNonEmpty);
    lines.push("");
    lines.push("备份候选：");
    bundle.candidates.forEach(c => lines.push("- " + c.kind + " | score=" + (c.score || 0) + " | " + c.key + " | savedAt=" + (c.savedAt || "无") + " | hash=" + (c.payloadHash || "无") + " | progress=" + c.progressCount + " marks=" + c.marksCount + " activityDays=" + c.activityDayCount + " unitStats=" + c.studyStateCount + " | " + (c.reason || "")));
    return sanitizeText(lines.join("\n"));
  }

  function renderQuick(bundle) {
    const nonEmpty = bundle.candidates.filter(c => c.kind === "valid_nonempty").length;
    const broken = bundle.candidates.filter(c => /broken|invalid/.test(c.kind)).length;
    $("quick").innerHTML = [
      '<div class="pill ' + (nonEmpty ? 'ok' : 'warn') + '">非空可恢复备份：' + nonEmpty + '</div>',
      '<div class="pill ' + (broken ? 'warn' : 'ok') + '">异常备份：' + broken + '</div>',
      '<div class="pill">业务 key：' + bundle.localStorage.keys.length + '</div>',
      '<div class="pill">大小：' + bundle.localStorage.totalBytes + ' bytes</div>'
    ].join('');
  }
  function renderCandidates(candidates) {
    if (!candidates.length) { $("candidateTable").textContent = "没有发现候选。"; return; }
    const rows = candidates.map((c, index) => '<tr>' +
      '<td><code>' + escapeHtml(c.key) + '</code></td>' +
      '<td>' + escapeHtml(c.kind) + '</td>' +
      '<td>' + escapeHtml(c.savedAt || '无') + '</td>' +
      '<td>' + (c.score || 0) + '</td>' +
      '<td><code>' + escapeHtml(c.payloadHash || '无') + '</code></td>' +
      '<td>' + c.parseOk + '</td><td>' + c.validateOk + '</td><td>' + c.nonEmpty + '</td>' +
      '<td>progress ' + c.progressCount + '<br>marks ' + c.marksCount + '<br>activity ' + c.activityDayCount + '<br>unitStats ' + c.studyStateCount + '</td>' +
      '<td>' + escapeHtml(c.reason || '') + '</td>' +
      '<td><button class="secondary" data-action="raw" data-index="' + index + '">原始</button><button class="secondary" data-action="norm" data-index="' + index + '" ' + (!c.validateOk ? 'disabled' : '') + '>payload</button><button class="danger-btn" data-action="restore" data-index="' + index + '" ' + (!(c.validateOk && c.nonEmpty) ? 'disabled' : '') + '>恢复</button></td>' +
      '</tr>').join('');
    $("candidateTable").innerHTML = '<table><thead><tr><th>key</th><th>kind</th><th>savedAt</th><th>score</th><th>payloadHash</th><th>parse</th><th>valid</th><th>nonEmpty</th><th>摘要</th><th>原因</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }

  function downloadJson(name, obj, sanitizeFirst) {
    const data = sanitizeFirst ? sanitize(obj) : obj;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function runScan() {
    try {
      lastBundle = buildBundle();
      lastSafeBundle = sanitize(lastBundle);
      lastCandidates = lastBundle.candidates;
      lastSummary = buildSummary(lastBundle);
      renderQuick(lastBundle);
      renderCandidates(lastCandidates);
      $("summary").value = lastSummary;
      $("status").textContent = "扫描完成。默认请下载脱敏诊断包；完整备份只应自己保管。";
      $("status").className = "big-status ok";
      $("downloadSafeBtn").disabled = false;
      $("downloadFullBtn").disabled = false;
      $("copyBtn").disabled = false;
    } catch (err) {
      lastBundle = null;
      lastSafeBundle = null;
      lastCandidates = [];
      lastSummary = "";
      $("downloadSafeBtn").disabled = true;
      $("downloadFullBtn").disabled = true;
      $("copyBtn").disabled = true;
      $("status").textContent = err && err.message ? err.message : "扫描失败。";
      $("status").className = "big-status danger";
    }
  }

  function exportCurrentFullBeforeRestore() {
    const full = buildBundle();
    downloadJson("shua-ci-ji-before-restore-full-" + nowStamp() + ".json", full, false);
  }


  function applyStorageOperationsAtomically(operations) {
    const previous = new Map();
    const probeKey = "vocab_machine_rescue_probe_" + nowStamp();
    try {
      localStorage.setItem(probeKey, "1");
      localStorage.removeItem(probeKey);
      operations.forEach(function(op) {
        if (!previous.has(op.key)) previous.set(op.key, storageGet(op.key));
        if (op.remove === true) localStorage.removeItem(op.key);
        else localStorage.setItem(op.key, String(op.value));
      });
      return true;
    } catch (err) {
      previous.forEach(function(value, key) {
        try {
          if (value == null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch (_) {}
      });
      const message = err && (err.name === "QuotaExceededError" || String(err).toLowerCase().includes("quota"))
        ? "本地浏览器存储空间不足，恢复已停止并尝试回滚。请保留刚下载的完整备份，清理浏览器空间后重试。"
        : "写入本地存储失败，恢复已停止并尝试回滚：" + (err && err.message ? err.message : String(err));
      $("status").textContent = message;
      $("status").className = "big-status danger";
      return false;
    }
  }

  function buildRestoreOperations(payload, candidate) {
    const p = payload || {};
    const operations = [{ key: SETTINGS_KEY, value: JSON.stringify(p.settings || {}) }];
    Object.keys(p.progress || {}).forEach(bookId => operations.push({ key: "progress:" + bookId, value: JSON.stringify(p.progress[bookId]) }));

    const markBooks = new Set(Object.keys(p.marks || {}).concat(Object.keys(p.markStates || {})));
    markBooks.forEach(function(bookId) {
      const cleanStates = sanitizeMarkStatesForRescue((p.markStates || {})[bookId]);
      if (Object.keys(cleanStates).length) {
        operations.push({ key: "mark_states:" + bookId, value: JSON.stringify(cleanStates) });
        operations.push({ key: "marks:" + bookId, value: JSON.stringify(deriveMarksFromMarkStatesForRescue(cleanStates)) });
      } else {
        operations.push({ key: "mark_states:" + bookId, remove: true });
        operations.push({ key: "marks:" + bookId, value: JSON.stringify((p.marks || {})[bookId] || { known: [], unknown: [] }) });
      }
    });

    Object.keys(p.activity || {}).forEach(bookId => operations.push({ key: "activity:" + bookId, value: JSON.stringify(p.activity[bookId]) }));
    Object.keys(p.unitStats || {}).forEach(bookId => operations.push({ key: "unit_stats:" + bookId, value: JSON.stringify(p.unitStats[bookId]) }));
    Object.keys(p.unknownProgress || {}).forEach(bookId => {
      const up = p.unknownProgress[bookId] || {};
      if (up.book) operations.push({ key: "unknown_progress:" + bookId + ":book", value: JSON.stringify(up.book) });
      Object.keys(up.units || {}).forEach(unit => operations.push({ key: "unknown_progress:" + bookId + ":unit:" + unit, value: JSON.stringify(up.units[unit]) }));
    });

    const stateRaw = loadHashSyncStateForRescue();
    stateRaw.localDirty = true;
    stateRaw.dirtySince = new Date().toISOString();
    stateRaw.lastSyncStatus = "dirty";
    stateRaw.lastSyncError = "已通过 rescue.html 从本地备份恢复，等待用户回主页面确认同步";
    stateRaw.localRecoveryRequired = false;
    // rescue 使用的是独立的候选摘要 hash，不等同于主程序的业务 hash。
    // 清空同步基线，让主程序启动时按当前 hash schema 重新计算，避免误判 clean/dirty。
    stateRaw.localPayloadHash = "";
    stateRaw.baseRemoteHash = "";
    stateRaw.lastSyncedPayloadHash = "";
    stateRaw.hashSchemaNeedsRemoteCheck = true;
    operations.push({ key: HASH_SYNC_STATE_KEY_V1, remove: true });
    operations.push({ key: HASH_SYNC_STATE_KEY, value: JSON.stringify(stateRaw) });
    operations.push({
      key: "vocab_machine_rescue_audit_" + nowStamp(),
      value: JSON.stringify({ at: new Date().toISOString(), restoredKey: candidate.key, payloadHash: candidate.payloadHash })
    });
    return operations;
  }

  function restoreCandidate(index) {
    const c = lastCandidates[index];
    if (!c || !c.validateOk || !c.nonEmpty || !c.payload) return;
    alert("将先下载当前完整 localStorage 备份。该文件可能包含 GitHub Token，请自行保存，勿发给陌生人。");
    exportCurrentFullBeforeRestore();
    const confirmText = prompt("确认恢复该备份到本机请输入：恢复到本机");
    if (confirmText !== "恢复到本机") { $("status").textContent = "已取消恢复。"; return; }
    if (!applyStorageOperationsAtomically(buildRestoreOperations(c.payload, c))) return;
    $("status").textContent = "已恢复到本机。请回主页面检查数据，再手动确认同步到云端。";
    $("status").className = "big-status ok";
  }

  $("scanBtn").addEventListener("click", runScan);
  $("downloadSafeBtn").addEventListener("click", () => { if (lastSafeBundle) downloadJson("shua-ci-ji-sanitized-diagnosis-" + nowStamp() + ".json", lastSafeBundle, true); });
  $("downloadFullBtn").addEventListener("click", () => { if (lastBundle && confirm("完整备份可能包含 GitHub Token。确认只为自己保存，不发给陌生人？")) downloadJson("shua-ci-ji-full-local-backup-" + nowStamp() + ".json", lastBundle, false); });
  $("copyBtn").addEventListener("click", async () => {
    try {
      if (!lastSummary) return;
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("当前浏览器不支持剪贴板接口");
      await navigator.clipboard.writeText(lastSummary);
      $("status").textContent = "诊断摘要已复制。";
      $("status").className = "big-status ok";
    } catch (err) {
      $("status").textContent = "复制失败，请直接选中下方诊断摘要复制：" + (err && err.message ? err.message : String(err));
      $("status").className = "big-status warn";
    }
  });
  $("candidateTable").addEventListener("click", function(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const index = Number(btn.dataset.index);
    const c = lastCandidates[index];
    if (!c) return;
    if (btn.dataset.action === "raw") downloadJson("backup-raw-" + index + "-" + nowStamp() + ".json", { key: c.key, raw: c.raw }, false);
    if (btn.dataset.action === "norm") downloadJson("backup-normalized-payload-" + index + "-" + nowStamp() + ".json", c.payload, true);
    if (btn.dataset.action === "restore") restoreCandidate(index);
  });

  if (window.__SHUA_RESCUE_TEST_MODE__ === true) {
    window.__SHUA_RESCUE_TEST_API__ = {
      normalizePayload,
      countMarks,
      sanitizeMarkStatesForRescue,
      deriveMarksFromMarkStatesForRescue,
      buildRestoreOperations,
      applyStorageOperationsAtomically,
      collectLocalStorage,
      sanitize
    };
  }
})();
