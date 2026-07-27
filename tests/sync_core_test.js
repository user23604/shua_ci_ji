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
