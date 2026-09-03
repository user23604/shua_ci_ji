const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] || null; },
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); }
  };
}

const context = {
  console,
  Date,
  Math,
  JSON,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Promise,
  URL,
  Blob: function(parts){ this.size = String(parts && parts.join ? parts.join('') : '').length; },
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  navigator: { userAgent: 'node-test', clipboard: { writeText: () => Promise.resolve() } },
  location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/' },
  document: {
    hidden: false,
    visibilityState: 'visible',
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild(){}, remove(){}, setAttribute(){}, querySelector(){ return null; } }),
    body: { appendChild(){} },
    documentElement: { appendChild(){} },
    addEventListener(){}
  },
  crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: (fn) => { if (typeof fn === 'function') fn(); },
  addEventListener(){}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInContext(code, context, { filename: file });
}

[
  'assets/js/00-env.js',
  'assets/js/01-utils-basic.js',
  'assets/js/02-storage-basic.js',
  'assets/js/03-domain-defaults.js',
  'assets/js/04-state.js',
  'assets/js/05a-storage-progress.js',
  'assets/js/05b-storage-marks.js',
  'assets/js/05c-storage-activity.js',
  'assets/js/05d-storage-settings.js',
  'assets/js/05e-round-archive-storage.js',
  'assets/js/08a-sync-hash-core.js',
  'assets/js/08b-sync-hash-status.js',
  'assets/js/08c-sync-error-state.js',
  'assets/js/09a-sync-backups.js',
  'assets/js/09b-sync-scheduler.js',
  'assets/js/09c-sync-audit.js',
  'assets/js/22-sync-payload.js',
  'assets/js/24-sync-remote-api.js',
  'assets/js/25-sync-status-config.js',
  'assets/js/25a-sync-status-core.js',
  'assets/js/26-sync-apply.js',
  'assets/js/27a-sync-active-study-guard.js',
  'assets/js/27b-sync-decision.js',
  'assets/js/29-sync-merge.js'
].forEach(load);

context.appendAuditEvent = function(){};
context.updateSyncIndicator = function(){};
context.refreshVisibleSyncDiagnostics = function(){};
context.showSyncProblemDialog = function(){};
context.writeLocalSnapshot = function(){};
context.writeDailyBackup = function(){};
context.writeHashBackup = function(){};
context.writeDailyHashBackups = function(){};
context.persistHashSyncState = context.persistHashSyncState || function(){};
context.persistSyncMeta = context.persistSyncMeta || function(){};
context.releaseWakeLock = function(){};
context.renderSetup = function(){};
context.isStaleSyncRun = function(){ return false; };
context.markSyncProgress = function(){};


function expr(code) { return vm.runInContext(code, context); }

const bookId = expr('BOOKS[0].id');
expr(`state.cloud = { token: 'ghp_${'a'.repeat(36)}', gistId: '0123456789abcdef0123456789abcdef' };`);
expr('state.syncMeta = ensureSyncMeta(state.syncMeta); state.syncHashState = ensureHashSyncState(state.syncHashState);');

const hash0 = expr('businessPayloadHash(collectSyncPayload())');
expr(`state.view = 'flash'; saveProgressCursor(${JSON.stringify(bookId)}, { unit: 1, lastWordId: 7 }, { reason: 'test_cursor' });`);
const hashAfterCursor = expr('businessPayloadHash(collectSyncPayload())');
assert.strictEqual(hashAfterCursor, hash0, 'cursor must not change business hash before flush');
assert.strictEqual(expr('hasPendingProgressSync()'), true, 'cursor save must queue pending progress sync');

let status = expr('computeSyncStatus()');
assert.strictEqual(status.status, 'study_queued', 'pending progress in flash must render study_queued');

expr(`flushProgressForCloud('manual')`);
const hashAfterFlush = expr('businessPayloadHash(collectSyncPayload())');
assert.notStrictEqual(hashAfterFlush, hash0, 'flush must move cursor into cloud progress/business hash');
assert.strictEqual(expr('hasPendingProgressSync()'), false, 'flush must clear progress pending flag');

expr(`
  state.syncHashState.baseRemoteHash = ${JSON.stringify(hashAfterFlush)};
  state.syncHashState.localPayloadHash = ${JSON.stringify(hashAfterFlush)};
  state.syncHashState.localDirty = false;
  state.syncHashState.lastSyncStatus = 'cloud_loaded';
  state.syncHashState.lastSuccessfulPullAt = '2026-06-21T00:00:00.000+08:00';
  state.sessionRemoteCheckDone = true;
  state.sessionRemoteCheckAt = new Date().toISOString();
  state.latestRemoteHashSeen = ${JSON.stringify(hashAfterFlush)};
`);
status = expr('computeSyncStatus()');
assert.strictEqual(status.status, 'cloud_loaded', 'pull success must not render green cloud_ok');

expr(`
  state.syncHashState.lastSyncStatus = 'cloud_ok';
  state.syncHashState.lastSuccessfulPushAt = new Date().toISOString();
  state.syncHashState.lastSyncedPayloadHash = ${JSON.stringify(hashAfterFlush)};
  state.syncMeta.lastCloudSaveConfirmedAt = new Date().toISOString();
`);
status = expr('computeSyncStatus()');
assert.strictEqual(status.status, 'cloud_ok', 'verified push clean state should render cloud_ok');

expr(`queueProgressCloudSync('queued_again')`);
status = expr('computeSyncStatus()');
assert.strictEqual(status.status, 'study_queued', 'pending study state must override previous cloud_ok');

// Manual/offline mode must preserve local dirty state and block every automatic scheduler path.
expr(`state.settings.autoSyncEnabled = false; state.syncHashState.localDirty = true; state.syncHashState.lastSyncStatus = 'dirty';`);
status = expr('computeSyncStatus()');
assert.strictEqual(status.status, 'dirty', 'auto-sync-off dirty state must remain local and visible');
assert(/自动同步已关闭/.test(status.detail), 'auto-sync-off status must not promise an automatic retry');
assert.strictEqual(expr(`scheduleSyncSoon('local_change', 0)`), false, 'local-change scheduling must be blocked when auto sync is off');
assert.strictEqual(expr(`scheduleSyncSoon('manual_retry', 0)`), true, 'explicit manual sync must remain available when auto sync is off');
expr(`cancelAutomaticSyncTimers('test_cleanup'); state.settings.autoSyncEnabled = true;`);

const decision = expr(`
  (function(){
    var remoteEmpty = { kind: 'valid_empty', payload: normalizeSyncPayload({}) };
    var facts = currentSyncFacts({ persistHash: false });
    return decideSyncAction({ remote: remoteEmpty, facts: facts, syncState: state.syncHashState, remoteHash: businessPayloadHash(normalizeSyncPayload({})), reason: 'test', runId: 1 });
  })()
`);
assert.strictEqual(decision.type, 'LOCAL_NONEMPTY_REMOTE_EMPTY_PUSH', 'local data + empty remote must protect local and push when writable');
assert.strictEqual(decision.shouldPull, false, 'empty remote must not be pulled over local data');

console.log('Sync core tests passed');

// Critical local writes must never report success or clear pending state when storage is unavailable.
const originalSetItem = context.localStorage.setItem;
context.localStorage.setItem = function() {
  const error = new Error('quota exceeded');
  error.name = 'QuotaExceededError';
  throw error;
};
expr('state.pendingProgressSync = false');
const quotaCursorSaved = expr(`saveProgressCursor(${JSON.stringify(bookId)}, { unit: 1, lastWordId: 999 }, { reason: 'quota_test' })`);
assert.strictEqual(quotaCursorSaved, false, 'cursor save must fail closed on storage quota errors');
assert.strictEqual(expr('state.pendingProgressSync'), false, 'failed cursor write must not create a false pending/saved state');
const quotaDraftSaved = expr(`saveActivityDraft(${JSON.stringify(bookId)}, { days: { '2026-07-25': { seconds: 1, words: 1, known: 0, unknown: 0, wordIds: [1] } } }, 'quota_test')`);
assert.strictEqual(quotaDraftSaved, false, 'activity draft must fail closed on storage quota errors');
context.localStorage.setItem = originalSetItem;

const originalSetItemForSecurity = context.localStorage.setItem;
context.localStorage.setItem = function() {
  const error = new Error('storage blocked');
  error.name = 'SecurityError';
  throw error;
};
const blockedSave = expr(`saveJson('blocked-storage-test', { ok: true })`);
assert.strictEqual(blockedSave, false, 'blocked localStorage must fail closed instead of throwing');
context.localStorage.setItem = originalSetItemForSecurity;


// Deterministic multi-device merge: distinct marks survive and newer conflicting mark wins.
const merged = expr(`(function(){
  var remote = normalizeSyncPayload({
    progress: { [${JSON.stringify(bookId)}]: { unit: 1, lastWordId: 10, updatedAt: '2026-07-25T10:00:00.000+08:00' } },
    markStates: { [${JSON.stringify(bookId)}]: {
      '1': { value: 'known', updatedAt: '2026-07-25T10:00:00.000+08:00', clientId: 'tablet', seq: 1 },
      '2': { value: 'unknown', updatedAt: '2026-07-25T10:00:00.000+08:00', clientId: 'tablet', seq: 2 }
    } }
  });
  var local = normalizeSyncPayload({
    progress: { [${JSON.stringify(bookId)}]: { unit: 1, lastWordId: 12, updatedAt: '2026-07-25T10:01:00.000+08:00' } },
    markStates: { [${JSON.stringify(bookId)}]: {
      '2': { value: 'known', updatedAt: '2026-07-25T10:02:00.000+08:00', clientId: 'phone', seq: 3 },
      '3': { value: 'unknown', updatedAt: '2026-07-25T10:01:00.000+08:00', clientId: 'phone', seq: 1 }
    } }
  });
  return safeMergePayloads(remote, local);
})()`);
assert.strictEqual(merged.progress[bookId].lastWordId, 12, 'further progress should be retained');
assert.strictEqual(merged.markStates[bookId]['1'].value, 'known', 'remote-only mark should survive');
assert.strictEqual(merged.markStates[bookId]['2'].value, 'known', 'newer conflicting mark should win deterministically');
assert.strictEqual(merged.markStates[bookId]['3'].value, 'unknown', 'local-only mark should survive');

expr(`clearProgressPending(); state.activityDirtyPending = false; state.activityDraftPending = false; state.pendingActiveStudyUpload = false; state.syncHashState.localDirty = true; state.syncHashState.lastSyncStatus = 'dirty'; state.syncHashState.lastErrorKind = 'patch_result_unknown';`);
status = expr('computeSyncStatus()');
assert.strictEqual(status.status, 'confirm_pending', 'uncertain PATCH response must display confirmation-pending state');

console.log('Critical storage and merge tests passed');

// Transport compaction must reduce redundant fields without changing business meaning or hash.
const transportCompact = expr('(function(){ var full = normalizeSyncPayload(collectSyncPayload()); var compact = compactSyncPayloadForTransport(full); return { full: full, compact: compact, restored: normalizeSyncPayload(compact), fullHash: businessPayloadHash(full), restoredHash: businessPayloadHash(normalizeSyncPayload(compact)) }; })()');
assert.strictEqual(transportCompact.compact.marks, undefined, 'derived marks should not be duplicated in transport payload');
assert.strictEqual(transportCompact.restoredHash, transportCompact.fullHash, 'transport compaction must preserve business hash');
assert.strictEqual(expr(`validateSyncPayload(normalizeSyncPayload(${JSON.stringify(transportCompact.compact)}))`), true, 'compacted payload must normalize to a valid payload');
console.log('Transport compaction tests passed');

// Audit retention must preserve critical failures/decisions instead of being flooded by UI noise.
const trimmedAudit = expr(`(function(){
  var events = [];
  for (var i = 0; i < 600; i += 1) events.push({ type: 'sync:status_render', message: 'noise-' + i });
  for (var j = 0; j < 100; j += 1) events.push({ type: 'sync:failed', message: 'critical-' + j });
  return trimAuditEvents(events, 500);
})()`);
assert.strictEqual(trimmedAudit.length, 500, 'audit retention must remain bounded');
assert.strictEqual(trimmedAudit.filter((event) => event.type === 'sync:failed').length, 100, 'critical audit events must survive noisy-event pruning');
assert.strictEqual(expr(`isBufferedAuditType('sync:status_render')`), true, 'noisy status events should be buffered');
console.log('Audit retention tests passed');

const compactBackup = expr(`extractBusinessPayloadFromBackupObject({ payload: { markStates: { [${JSON.stringify(bookId)}]: { '7': { value: 'known', updatedAt: '2026-07-25T00:00:00.000Z', clientId: 'phone', seq: 1 } } } } })`);
assert(compactBackup && compactBackup.markStates && compactBackup.markStates[bookId], 'backup recovery must retain compact authoritative markStates');
assert.strictEqual(expr(`isEffectivelyEmptyLocalPayload({ markStates: { [${JSON.stringify(bookId)}]: { '7': { value: null, updatedAt: '2026-07-25T00:00:00.000Z', clientId: 'phone', seq: 1 } } } })`), false, 'mark tombstones are business data and must be backed up');
console.log('Compact backup compatibility tests passed');


// A clean local copy must still merge a changed remote, because a stale peer may have
// overwritten records that only this device retains.
const safeMergeDecision = expr(`(function(){
  var localPayload = normalizeSyncPayload({ markStates: { [${JSON.stringify(bookId)}]: {
    '101': { value: 'known', updatedAt: '2026-07-25T10:00:00.000+08:00', clientId: 'device-a', seq: 1 }
  } } });
  var remotePayload = normalizeSyncPayload({ markStates: { [${JSON.stringify(bookId)}]: {
    '202': { value: 'unknown', updatedAt: '2026-07-25T10:01:00.000+08:00', clientId: 'device-b', seq: 1 }
  } } });
  var remote = { kind: 'valid_nonempty', payload: remotePayload, snapshot: remotePayload };
  return decideSyncAction({
    remote: remote,
    facts: { payload: localPayload, localPayloadHash: businessPayloadHash(localPayload), effectiveDirty: false },
    syncState: { baseRemoteHash: 'older-base', localDirty: false },
    remoteHash: businessPayloadHash(remotePayload),
    reason: 'stale_peer_overwrite_regression',
    runId: 77
  });
})()`);
assert.strictEqual(safeMergeDecision.type, 'LOCAL_CLEAN_REMOTE_CHANGED_SAFE_MERGE', 'clean local + changed remote must use safe merge');
assert.strictEqual(safeMergeDecision.shouldMerge, true, 'changed remote must merge instead of blind pull');
assert.strictEqual(safeMergeDecision.shouldPull, false, 'blind pull would lose records retained only on this device');

// Applying a remote payload must be transactional. A mid-write failure must restore the
// exact previous business state rather than leaving a half-old/half-new local database.
context.writeHashBackup = function(){ return true; };
const originalRecordHashSyncFailure = context.recordHashSyncFailure;
context.recordHashSyncFailure = function(){};
expr(`
  localStorage.clear();
  state.syncMeta = ensureSyncMeta({ clientId: 'transaction-test', gistId: state.cloud.gistId });
  state.syncHashState = ensureHashSyncState({});
  saveProgress(${JSON.stringify(bookId)}, { unit: 1, lastWordId: 11, updatedAt: '2026-07-25T09:00:00.000+08:00' }, { touch: false });
  saveMarkStates(${JSON.stringify(bookId)}, {
    '11': { value: 'known', updatedAt: '2026-07-25T09:00:00.000+08:00', clientId: 'old', seq: 1 }
  }, { touch: false, syncMarks: true });
`);
const transactionBeforeHash = expr('businessPayloadHash(collectSyncPayload())');
const transactionBeforeProgress = context.localStorage.getItem(`progress:${bookId}`);
const originalTransactionSetItem = context.localStorage.setItem;
let injectedFailure = false;
context.localStorage.setItem = function(key, value) {
  if (!injectedFailure && String(key) === `mark_states:${bookId}`) {
    injectedFailure = true;
    const error = new Error('injected mid-transaction failure');
    error.name = 'SecurityError';
    throw error;
  }
  return originalTransactionSetItem.call(context.localStorage, key, value);
};
const transactionApplied = expr(`applyRemotePayloadSafely(normalizeSyncPayload({
  progress: { [${JSON.stringify(bookId)}]: { unit: 1, lastWordId: 999, updatedAt: '2026-07-25T11:00:00.000+08:00' } },
  markStates: { [${JSON.stringify(bookId)}]: {
    '999': { value: 'unknown', updatedAt: '2026-07-25T11:00:00.000+08:00', clientId: 'remote', seq: 9 }
  } }
}), { source: 'sync', runId: 88, expectedHash: 'intentionally-not-used-after-write-failure' })`);
context.localStorage.setItem = originalTransactionSetItem;
context.recordHashSyncFailure = originalRecordHashSyncFailure;
assert.strictEqual(transactionApplied, false, 'injected write failure must abort remote apply');
assert.strictEqual(expr('businessPayloadHash(collectSyncPayload())'), transactionBeforeHash, 'failed remote apply must roll back all business data');
assert.strictEqual(context.localStorage.getItem(`progress:${bookId}`), transactionBeforeProgress, 'progress key must be restored after rollback');

console.log('Final robustness regression tests passed');


// Startup must reconstruct a lost pending marker from the durable progress cursor.
expr(`
  localStorage.clear();
  state.pendingProgressSync = false;
  saveProgressCursor(${JSON.stringify(bookId)}, { unit: 2, lastWordId: 321 }, { queue: false, reason: 'reconstruction_test' });
`);
assert.strictEqual(context.localStorage.getItem('vocab_machine_progress_pending_v1'), null, 'test requires a missing pending marker');
assert.strictEqual(expr('restoreProgressPending()'), true, 'startup must reconstruct pending progress from cursor divergence');

// A future-skewed device clock must not permanently win mark conflict resolution.
expr(`
  localStorage.clear();
  state.syncMeta = ensureSyncMeta({ clientId: 'logical-clock-test' });
  saveMarkStates(${JSON.stringify(bookId)}, {
    '1': { value: 'known', updatedAt: '2099-01-01T00:00:00.000Z', clientId: 'future-device', seq: 1 }
  }, { touch: false, syncMarks: true });
  setWordMarkState(${JSON.stringify(bookId)}, 2, 'unknown', { touch: false });
`);
const logicalClockStates = expr(`loadMarkStates(${JSON.stringify(bookId)})`);
assert(Date.parse(logicalClockStates['2'].updatedAt) > Date.parse(logicalClockStates['1'].updatedAt), 'new local mark must advance beyond the maximum observed logical timestamp');

console.log('Durable cursor and logical clock tests passed');


// ══════════════════════════════════════════════════════════════════════
// Gist read-after-write 回归（2026-09-03 修复）
// 故障链：PATCH 200 成功 → 匿名 verify 命中 GitHub 边缘缓存读到旧 hash →
// 被误判为 preflightChanged → 重发相同 PATCH → GitHub 422 → 同步失败。
// ══════════════════════════════════════════════════════════════════════
[
  'assets/js/28-sync-push-patch.js',
  'assets/js/28a-sync-branches.js',
  'assets/js/28b-sync-backup-cleanup.js'
].forEach(load);

(async function runReadAfterWriteRegression() {
  // vm 测试环境缺失的依赖桩（07-diagnostics-ui / 06-sync-runtime 未加载）
  context.showSyncFailureBanner = function(){};
  context.backoffDelayForFailure = function(){ return 60000; };
  context.shouldMarkDirtyOnFailure = function(){ return true; };
  context.beginPatchTransaction = function(){ return true; };
  context.endPatchTransaction = function(){};
  context.normalizeSyncRequestError = function(error, details = {}) {
    return {
      kind: (error && error.kind) || 'network',
      stage: (details && details.stage) || '',
      method: (details && details.method) || 'GET',
      transport: (details && details.transport) || '',
      httpStatus: Number(error && error.httpStatus) || 0,
      message: (error && error.message) || ''
    };
  };
  context.requestErrorTechnical = function(error) {
    return 'kind=' + String((error && error.kind) || '') + ' message=' + String((error && error.message) || '');
  };
  context.delay = function(){ return Promise.resolve(); };

  const auditEvents = [];
  context.appendAuditEvent = function(event){ auditEvents.push(event || {}); };
  const scheduleCalls = [];
  context.scheduleSyncSoon = function(reason){ scheduleCalls.push(String(reason || '')); return true; };

  function makeGistResponse(status, body) {
    const text = typeof body === 'string' ? body : JSON.stringify(body || {});
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => '' },
      json: async () => JSON.parse(text),
      text: async () => text
    };
  }

  function resetLocalState() {
    expr(`
      localStorage.clear();
      state.cloud = { token: 'ghp_' + 't'.repeat(36), gistId: 'gist123' };
      state.syncMeta = ensureSyncMeta({ clientId: 'patch-test' });
      state.syncHashState = ensureHashSyncState({});
      state.pendingProgressSync = false;
      state.activityDirtyPending = false;
      state.activityDraftPending = false;
      state.applyingRemotePayload = false;
      state.suppressDirty = false;
      saveProgress(${JSON.stringify(bookId)}, { unit: 3, lastWordId: 42, updatedAt: '2026-09-03T09:00:00.000+08:00' }, { touch: false });
      saveMarkStates(${JSON.stringify(bookId)}, {
        '42': { value: 'known', updatedAt: '2026-09-03T09:00:00.000+08:00', clientId: 'patch-test', seq: 1 }
      }, { touch: false, syncMarks: true });
    `);
  }

  resetLocalState();
  // 远端旧数据（模拟另一设备的旧状态 / 边缘缓存内容）
  expr(`
    var __remoteOldPayload = normalizeSyncPayload({
      progress: { [${JSON.stringify(bookId)}]: { unit: 2, lastWordId: 30, updatedAt: '2026-09-01T09:00:00.000+08:00' } }
    });
    var __remoteOld = {
      kind: 'valid_nonempty',
      snapshot: __remoteOldPayload,
      payload: __remoteOldPayload,
      payloadHash: businessPayloadHash(__remoteOldPayload),
      fileNames: ['sync.json'],
      readTransport: 'anonymous_fetch'
    };
    var __remoteOldHash = businessPayloadHash(__remoteOldPayload);
    var __expected = refreshLocalPayloadHash({ persist: false });
    var __expectedHash = __expected.hash;
  `);

  // ── 场景 1：PATCH 200 + 响应收据 hash 一致，随后所有 GET 永远返回旧 hash ──
  // 期望：同步成功、只发 1 次业务 PATCH、不进 verify_mismatch_rebase、不二次 PATCH。
  {
    const patchCalls = [];
    const verifyCalls = [];
    context.fetchGistSyncPayload = async function(options = {}) {
      verifyCalls.push({ forceAuthenticated: options.forceAuthenticated === true });
      return vm.runInContext('__remoteOld', context); // 永远是旧数据（模拟边缘缓存）
    };
    context.fetchWithTimeout = async function(url, options = {}, timeoutMs, ctx = {}) {
      patchCalls.push({ body: JSON.parse(options.body || '{}'), stage: ctx.stage || '' });
      const files = JSON.parse(options.body).files;
      return makeGistResponse(200, {
        id: 'gist123',
        updated_at: '2026-09-03T09:10:00Z',
        history: [{ version: 'rev-receipt' }],
        files: Object.keys(files).reduce((acc, name) => {
          acc[name] = files[name] === null ? { filename: name, status: 'removed' } : { filename: name, content: files[name].content };
          return acc;
        }, {})
      });
    };
    const pushed = await expr(`syncBranchPushLocal({ remote: __remoteOld, local: null, keepalive: false, reason: 'manual_retry', runId: 901, remoteHashAtDecision: __remoteOldHash })`);
    assert.strictEqual(pushed, true, 'receipt-confirmed push must succeed even when read-backs stay stale');
    assert.strictEqual(patchCalls.length, 1, `business PATCH must be sent exactly once, got ${patchCalls.length}`);
    assert.strictEqual(verifyCalls.length, 1, 'only the preflight GET is expected; no follow-up verify GET');
    assert.strictEqual(verifyCalls[0].forceAuthenticated, false, 'preflight keeps anonymous-first behaviour');
    assert.strictEqual(expr('state.syncHashState.lastSyncStatus'), 'cloud_ok', 'receipt-confirmed push must mark cloud_ok');
    assert.strictEqual(expr('state.syncHashState.localDirty'), false, 'receipt-confirmed push must clear dirty');
    assert(patchCalls[0].body.files['sync.json'] && typeof patchCalls[0].body.files['sync.json'].content === 'string', 'business PATCH must upsert sync.json content');
    assert(!Object.values(patchCalls[0].body.files).some((v) => v === null), 'business PATCH must not carry deletion entries');
    assert(auditEvents.some((e) => e.type === 'sync:patch_receipt_confirmed'), 'audit must record the receipt confirmation');
  }

  // ── 场景 2：PATCH 200 但响应体无法用于验证，authenticated verify 返回 uploadedHash ──
  // 期望：成功、只 PATCH 一次、读回确认必须带 forceAuthenticated。
  {
    resetLocalState();
    expr(`
      var __expected = refreshLocalPayloadHash({ persist: false });
      var __expectedHash = __expected.hash;
    `);
    const patchCalls = [];
    const verifyCalls = [];
    context.fetchGistSyncPayload = async function(options = {}) {
      verifyCalls.push({ forceAuthenticated: options.forceAuthenticated === true });
      if (verifyCalls.length === 1) return vm.runInContext('__remoteOld', context); // preflight
      return vm.runInContext(`({ kind: 'valid_nonempty', snapshot: __expected.payload, payload: __expected.payload, payloadHash: __expectedHash, fileNames: ['sync.json'], readTransport: 'authenticated_fetch' })`, context);
    };
    context.fetchWithTimeout = async function(url, options = {}, timeoutMs, ctx = {}) {
      patchCalls.push({ body: JSON.parse(options.body || '{}'), stage: ctx.stage || '' });
      // 响应体缺少 sync.json 文件条目 → 收据不可用
      return makeGistResponse(200, { id: 'gist123', updated_at: '2026-09-03T09:10:00Z', history: [{ version: 'rev-2' }], files: {} });
    };
    const result = await expr(`patchBusinessPayloadToGist(refreshLocalPayloadHash({ persist: false }).payload, { remote: __remoteOld, keepalive: false, runId: 902, reason: 'manual', remoteHashAtDecision: __remoteOldHash })`);
    assert.strictEqual(result.ok, true, 'authenticated verify matching uploadedHash must succeed');
    assert.strictEqual(patchCalls.length, 1, 'unusable receipt must not trigger a second PATCH');
    assert.strictEqual(verifyCalls.length, 2, 'preflight GET + one verify GET expected');
    assert.strictEqual(verifyCalls[1].forceAuthenticated, true, 'read-after-write verify must request authenticated read');
    assert(auditEvents.some((e) => e.type === 'sync:patch_receipt_unusable'), 'audit must record the unusable receipt');
  }

  // ── 场景 2b：fetchGistMetadataWithCredentials(forceAuthenticated) 契约 ──
  {
    const gistBody = { id: 'g1', updated_at: '2026-09-03T09:10:00Z', history: [{ version: 'v1' }], files: { 'sync.json': { filename: 'sync.json', content: JSON.stringify({ version: 2, payloadHash: 'hash-x', payload: {} }) } } };
    const authCalls = [];
    context.fetchWithTimeout = async function(url, options = {}, timeoutMs, ctx = {}) {
      authCalls.push({
        stage: ctx.stage || '',
        bearer: Boolean(options.headers && String(options.headers.Authorization || '').includes('Bearer '))
      });
      return makeGistResponse(200, gistBody);
    };
    const meta = await expr(`fetchGistMetadataWithCredentials({ gistId: 'g1', token: 'tok', forceAuthenticated: true })`);
    assert.strictEqual(authCalls.length, 1, 'forceAuthenticated must skip the anonymous-first attempt');
    assert.strictEqual(authCalls[0].bearer, true, 'forceAuthenticated must send the PAT');
    assert.strictEqual(meta.readTransport, 'authenticated_fetch', 'authenticated read must be reported');

    authCalls.length = 0;
    context.fetchWithTimeout = async function(url, options = {}, timeoutMs, ctx = {}) {
      authCalls.push({ stage: ctx.stage || '' });
      if (ctx.stage === 'gist_metadata_authenticated') return makeGistResponse(401, { message: 'Bad credentials' });
      return makeGistResponse(200, gistBody);
    };
    const metaFallback = await expr(`fetchGistMetadataWithCredentials({ gistId: 'g1', token: 'tok', forceAuthenticated: true })`);
    assert.strictEqual(authCalls[0].stage, 'gist_metadata_authenticated', 'authenticated attempt must come first');
    assert.strictEqual(authCalls[1].stage, 'gist_metadata_anonymous', 'invalid PAT (401) must fall back to anonymous read');
    assert.strictEqual(metaFallback.readTransport, 'anonymous_fetch', 'fallback must be reported');
  }

  // ── 场景 3：PATCH 200、收据不可用、authenticated verify 持续返回旧 hash ──
  // 期望：进入 verifyDeferred/patch_result_unknown，本地数据不丢，同一 run 内 PATCH 次数 == 1。
  {
    resetLocalState();
    expr(`
      var __expected = refreshLocalPayloadHash({ persist: false });
      var __expectedHash = __expected.hash;
    `);
    const patchCalls = [];
    const verifyCalls = [];
    context.fetchGistSyncPayload = async function(options = {}) {
      verifyCalls.push({ forceAuthenticated: options.forceAuthenticated === true });
      return vm.runInContext('__remoteOld', context); // preflight/verify/recheck 永远读到旧 hash
    };
    context.fetchWithTimeout = async function(url, options = {}, timeoutMs, ctx = {}) {
      patchCalls.push({ body: JSON.parse(options.body || '{}'), stage: ctx.stage || '' });
      return makeGistResponse(200, { id: 'gist123', files: {} }); // 收据不可用
    };
    const beforeHash = expr('businessPayloadHash(collectSyncPayload())');
    const result = await expr(`patchBusinessPayloadToGist(refreshLocalPayloadHash({ persist: false }).payload, { remote: __remoteOld, keepalive: false, runId: 903, reason: 'heartbeat', remoteHashAtDecision: __remoteOldHash })`);
    assert.strictEqual(result.ok, false, 'unconfirmed write must not report ok');
    assert.strictEqual(result.patchResultUnknown, true, 'unconfirmed write must be patch_result_unknown');
    assert.strictEqual(result.verifyDeferred, true, 'unconfirmed write must be verifyDeferred');
    assert.strictEqual(result.preflightChanged, undefined, 'stale verify reads must NOT become preflightChanged');
    assert.strictEqual(patchCalls.length, 1, `verify mismatch must never re-PATCH in the same run, got ${patchCalls.length}`);
    assert.strictEqual(verifyCalls.length, 3, 'preflight + verify + limited recheck expected');
    assert(verifyCalls.slice(1).every((call) => call.forceAuthenticated === true), 'verify and recheck must both be authenticated');
    assert.strictEqual(expr('businessPayloadHash(collectSyncPayload())'), beforeHash, 'local business data must be untouched');
    assert.strictEqual(expr('state.syncHashState.localDirty'), true, 'local data must stay dirty until the write is confirmed');
    assert.strictEqual(expr('state.syncHashState.lastErrorKind'), 'patch_result_unknown', 'state must record patch_result_unknown');
    assert(scheduleCalls.includes('verify_mismatch_retry'), 'a confirmation retry must be scheduled');
  }

  // ── 场景 4：过期云端备份清理 422，不得污染已确认成功的业务写入 ──
  // 期望：业务写入仍成功；清理是独立 PATCH 且只含删除条目；清理失败只记 warning。
  {
    resetLocalState();
    expr(`
      var __expected = refreshLocalPayloadHash({ persist: false });
      var __expectedHash = __expected.hash;
    `);
    const patchCalls = [];
    const today = expr('localDateKey()');
    const oldBackupNames = [];
    for (let d = 25; d >= 17; d -= 1) oldBackupNames.push(`sync.backup.2026-08-${String(d).padStart(2, '0')}.json`);
    const gistFileNames = ['sync.json', `sync.backup.${today}.json`, ...oldBackupNames];
    context.fetchGistSyncPayload = async function() {
      return vm.runInContext('__remoteOld', context); // preflight
    };
    context.fetchWithTimeout = async function(url, options = {}, timeoutMs, ctx = {}) {
      const body = JSON.parse(options.body || '{}');
      patchCalls.push({ body, stage: ctx.stage || '' });
      if (ctx.stage === 'gist_backup_cleanup') {
        return makeGistResponse(422, { message: 'Validation Failed', errors: [{ resource: 'Gist', field: 'data', code: 'missing_field' }] });
      }
      const responseFiles = {};
      gistFileNames.forEach((name) => {
        responseFiles[name] = body.files[name] && body.files[name].content
          ? { filename: name, content: body.files[name].content }
          : { filename: name, content: '{"stale":true}' };
      });
      return makeGistResponse(200, { id: 'gist123', updated_at: '2026-09-03T09:10:00Z', history: [{ version: 'rev-4' }], files: responseFiles });
    };
    const pushed = await expr(`syncBranchPushLocal({ remote: __remoteOld, local: null, keepalive: false, reason: 'manual', runId: 904, remoteHashAtDecision: __remoteOldHash })`);
    assert.strictEqual(pushed, true, 'failed backup cleanup must not fail an already-confirmed sync');
    assert(patchCalls[0].body.files['sync.json'], 'business PATCH must upsert sync.json');
    assert(!Object.values(patchCalls[0].body.files).some((v) => v === null), 'business PATCH must not mix deletion entries');
    const cleanupCall = patchCalls.find((call) => call.stage === 'gist_backup_cleanup');
    assert(cleanupCall, 'expired backup cleanup must run after the business write');
    assert(Object.values(cleanupCall.body.files).every((v) => v === null), 'cleanup PATCH must only delete old backups');
    assert(!Object.keys(cleanupCall.body.files).includes('sync.json'), 'cleanup must never delete sync.json');
    const cleanupFailed = auditEvents.find((e) => e.type === 'sync:backup_cleanup_failed');
    assert(cleanupFailed && String(cleanupFailed.message).includes('status=422'), 'cleanup failure must be recorded as a warning');
    assert.strictEqual(expr('state.syncHashState.lastSyncStatus'), 'cloud_ok', 'cleanup failure must not pollute the successful sync state');
    assert.strictEqual(expr('state.syncHashState.localDirty'), false, 'cleanup failure must not re-dirty a confirmed sync');
  }

  // ── 场景 5：真正的第一次业务 PATCH 返回 422 ──
  // 期望：同步失败；日志保存 GitHub message/errors 摘要 + 文件操作清单；不泄露 token。
  {
    resetLocalState();
    const patchCalls = [];
    context.fetchGistSyncPayload = async function() {
      return vm.runInContext('__remoteOld', context);
    };
    context.fetchWithTimeout = async function(url, options = {}, timeoutMs, ctx = {}) {
      patchCalls.push({ body: JSON.parse(options.body || '{}'), stage: ctx.stage || '' });
      return makeGistResponse(422, { message: 'Validation Failed', errors: [{ resource: 'Gist', field: 'data', code: 'missing_field' }] });
    };
    const result = await expr(`patchBusinessPayloadToGist(refreshLocalPayloadHash({ persist: false }).payload, { remote: __remoteOld, keepalive: false, runId: 905, reason: 'manual', remoteHashAtDecision: __remoteOldHash })`);
    assert.strictEqual(result.ok, false, 'a real 422 business PATCH must fail the sync');
    assert.strictEqual(result.httpStatus, 422, '422 must be reported');
    assert.strictEqual(expr('state.syncHashState.lastErrorKind'), 'patch_failed_422', 'state must record patch_failed_422');
    const rejected = auditEvents.find((e) => e.type === 'sync:patch_rejected');
    assert(rejected, '422 must emit a dedicated diagnostic audit event');
    assert(String(rejected.message).includes('Validation Failed') && String(rejected.message).includes('missing_field'), 'diagnostic must include the GitHub message/errors digest');
    assert(String(rejected.message).includes('sync.json:upsert'), 'diagnostic must classify patch file operations');
    assert(String(expr('state.syncHashState.lastErrorTechnical')).includes('patchFiles='), 'state technical must include the patch file digest');
    const leaked = JSON.stringify({ auditEvents, state: expr('({ technical: state.syncHashState.lastErrorTechnical, error: state.syncHashState.lastSyncError })') });
    assert(!leaked.includes('ghp_'), 'no PAT/token may ever reach diagnostics or audit');
  }

  console.log('Gist read-after-write regression tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
