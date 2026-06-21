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
  'assets/js/05-storage-domain.js',
  'assets/js/08-sync-hash-state.js',
  'assets/js/09-sync-backup-recovery.js',
  'assets/js/22-sync-payload.js',
  'assets/js/24-sync-remote-api.js',
  'assets/js/25-sync-status-config.js',
  'assets/js/25a-sync-status-core.js',
  'assets/js/27a-sync-active-study-guard.js',
  'assets/js/27b-sync-decision.js'
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

const decision = expr(`
  (function(){
    var remoteEmpty = { kind: 'valid_empty', payload: normalizeSyncPayload({}) };
    var facts = currentSyncFacts({ persistHash: false });
    return decideSyncAction({ remote: remoteEmpty, facts: facts, syncState: state.syncHashState, remoteHash: businessPayloadHash(normalizeSyncPayload({})), reason: 'test', runId: 1 });
  })()
`);
assert.strictEqual(decision.type, 'LOCAL_NONEMPTY_REMOTE_EMPTY_PUSH', 'local data + empty remote must protect local and push when writable');
assert.strictEqual(decision.shouldPull, false, 'empty remote must not be pulled over local data');

console.log('P14 sync core tests passed');
