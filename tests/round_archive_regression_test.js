const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function makeStorage() {
  const map = new Map();
  let failKey = '';
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] || null; },
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) {
      if (String(k) === failKey) {
        const error = new Error('simulated quota failure');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(String(k), String(v));
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    setFailureKey(k) { failKey = String(k || ''); }
  };
}

const storage = makeStorage();
const context = {
  console, Date, Math, JSON, Map, Set, Array, Object, String, Number, Boolean, RegExp, Promise,
  URL, TextEncoder,
  Blob: function(parts) { this.size = String((parts || []).join('')).length; },
  localStorage: storage,
  sessionStorage: makeStorage(),
  navigator: { userAgent: 'round-archive-test' },
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
  crypto: { randomUUID: (() => { let n = 0; return () => `test-uuid-${++n}`; })() },
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => 0,
  requestAnimationFrame: (fn) => { if (typeof fn === 'function') fn(); },
  addEventListener(){}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
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
  'assets/js/22-sync-payload.js',
  'assets/js/23-sync-v2-compat.js',
  'assets/js/24-sync-remote-api.js',
  'assets/js/26-sync-apply.js',
  'assets/js/28-sync-push-patch.js',
  'assets/js/29-sync-merge.js'
].forEach(load);

context.appendAuditEvent = function(){};
context.updateSyncIndicator = function(){};
context.refreshVisibleSyncDiagnostics = function(){};
context.closeRecoverableSyncProblemDialogAfterClean = function(){};
context.clearActiveStudyTimerIfClean = function(){};
context.showSyncProblemDialog = function(){};
context.recordHashSyncFailure = function(message) { throw new Error('unexpected sync failure: ' + message); };
context.isStaleSyncRun = function() { return false; };
context.markSyncProgress = function(){};
context.writeHashBackup = function() { return true; };
context.onLocalDataChanged = function(reason) { context.__lastChangedReason = reason; };
context.commitCurrentCardActivity = function(){};
context.clearTimers = function(){};

function expr(code) { return vm.runInContext(code, context); }

(async function run() {
  const bookId = expr('BOOKS[0].id');

  const archiveUiSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/21b-round-archive-ui.js'), 'utf8');
  const archiveDrawerSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/21-archive-stats.js'), 'utf8');
  assert(/roundArchiveNameInput/.test(archiveUiSource), 'archive name input missing');
  assert(/roundArchiveNoteInput/.test(archiveUiSource) && /textarea/.test(archiveUiSource), 'multiline archive note input missing');
  assert(/archiveCurrentRoundBtn/.test(fs.readFileSync(path.join(__dirname, '..', 'assets/js/21a-archive-selection.js'), 'utf8')), 'archive-current-round button missing');
  assert(/data-archive-tab="history"/.test(archiveDrawerSource), 'history archive tab missing');
  expr(`
    state.settings.bookId = ${JSON.stringify(bookId)};
    saveProgress(${JSON.stringify(bookId)}, { unit: 3, lastWordId: 77 }, { touch: false });
    saveUnknownProgress(${JSON.stringify(bookId)}, { scope: 'book' }, { lastWordId: 51 }, { touch: false });
    saveMarkStates(${JSON.stringify(bookId)}, {
      '10': { value: 'known', updatedAt: '2026-08-31T10:00:00.000+08:00', clientId: 'phone', seq: 1 },
      '11': { value: 'unknown', updatedAt: '2026-08-31T10:01:00.000+08:00', clientId: 'phone', seq: 2 }
    }, { touch: false, syncMarks: true });
    saveActivity(${JSON.stringify(bookId)}, { days: { '2026-08-31': { seconds: 120, words: 20, known: 5, unknown: 3, wordIds: [10, 11] } } }, { touch: false });
    saveUnitStats(${JSON.stringify(bookId)}, { units: { '3': { completed: 2, updatedAt: '2026-08-31T10:10:00.000+08:00' } } }, { touch: false });
    saveProgressCursorStore({ byBook: { [${JSON.stringify(bookId)}]: { unit: 3, lastWordId: 77 } } });
    localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify({ active: true, wordIds: [10, 11] }));
  `);

  const result = await expr(`archiveCurrentRound('第一轮 8月底', '这一轮重点复习\\n二刷前归档')`);
  assert.strictEqual(result.ok, true, 'archive should succeed');
  assert.strictEqual(expr('loadRoundState().generation'), 1, 'new generation should be created');
  assert.strictEqual(expr('Object.keys(loadRoundArchives()).length'), 1, 'archive history should retain the round');
  assert.strictEqual(expr('hasLiveRoundData(collectSyncPayload())'), false, 'live learning state must be fully reset');
  assert.strictEqual(expr('hasBusinessData(collectSyncPayload())'), true, 'archive-only new round must still count as business data');
  assert.strictEqual(expr('localStorage.getItem(STUDY_SESSION_KEY)'), null, 'stale study session must be cleared');
  assert.strictEqual(expr('state.settings.bookId'), bookId, 'book/settings should be preserved');
  assert.strictEqual(context.__lastChangedReason, 'round_archive', 'archive should mark business state dirty exactly as a round change');

  const archived = expr('Object.values(loadRoundArchives())[0]');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(archived.snapshot.marks[bookId])), { known: [10], unknown: [11] }, 'historical semantic marks must be preserved');
  assert.strictEqual(archived.snapshot.progress[bookId].lastWordId, 77, 'historical progress must be preserved');
  assert.strictEqual(archived.note, '这一轮重点复习\n二刷前归档', 'multiline note must be preserved');

  const currentPayload = expr('collectSyncPayload()');
  const merged = expr(`safeMergePayloads(
    normalizeSyncPayload({ progress: { [${JSON.stringify(bookId)}]: { unit: 9, lastWordId: 999 } }, marks: { [${JSON.stringify(bookId)}]: { known: [88], unknown: [] } } }),
    ${JSON.stringify(currentPayload)}
  )`);
  assert.strictEqual(merged.round.generation, 1, 'newer round must win over stale pre-archive data');
  assert.strictEqual(merged.progress[bookId].lastWordId, null, 'stale remote progress must not resurrect');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(merged.marks[bookId])), { known: [], unknown: [] }, 'stale remote marks must not resurrect');
  assert.strictEqual(Object.keys(merged.archives).length, 1, 'archive history must survive generation merge');

  const envelope = expr(`buildSyncEnvelope(${JSON.stringify(currentPayload)})`);
  assert.strictEqual(envelope.version, 2, 'new cloud envelope must be version 2 so old clients cannot silently strip archive fields');
  const parsed = expr(`parseSyncPayloadContent(${JSON.stringify(JSON.stringify(envelope))})`);
  assert.notStrictEqual(parsed.kind, 'invalid', 'new client must parse version 2 envelope');
  assert.strictEqual(parsed.snapshot.round.generation, 1, 'round generation must survive cloud envelope');
  assert.strictEqual(Object.keys(parsed.snapshot.archives).length, 1, 'archives must survive cloud envelope');

  // A device still on the old round receives the newer archived/reset round.
  expr(`
    saveRoundState({ generation: 0, roundId: 'legacy-0', startedAt: '' });
    saveRoundArchives({});
    saveProgress(${JSON.stringify(bookId)}, { unit: 8, lastWordId: 808 }, { touch: false });
    localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify({ active: true, wordIds: [808] }));
  `);
  const remoteApplyOk = expr(`applyRemotePayloadSafely(${JSON.stringify(currentPayload)}, { expectedHash: businessPayloadHash(${JSON.stringify(currentPayload)}), reason: 'round_test' })`);
  assert.strictEqual(remoteApplyOk, true, 'newer remote round should apply atomically');
  assert.strictEqual(expr('loadRoundState().generation'), 1, 'remote apply must advance round generation');
  assert.strictEqual(expr('loadProgress(' + JSON.stringify(bookId) + ').lastWordId'), null, 'remote reset must clear stale local progress');
  assert.strictEqual(expr('localStorage.getItem(STUDY_SESSION_KEY)'), null, 'remote round change must clear stale local study session');

  // Storage failure during archive must roll back old data and must not create a half-finished archive.
  storage.clear();
  expr(`
    state.roundArchiveBusy = false;
    saveRoundState({ generation: 0, roundId: 'legacy-0', startedAt: '' });
    saveProgress(${JSON.stringify(bookId)}, { unit: 2, lastWordId: 22 }, { touch: false });
    saveMarkStates(${JSON.stringify(bookId)}, {
      '22': { value: 'unknown', updatedAt: '2026-08-31T11:00:00.000+08:00', clientId: 'phone', seq: 1 }
    }, { touch: false, syncMarks: true });
  `);
  storage.setFailureKey(expr('ROUND_STATE_KEY'));
  const failed = await expr(`archiveCurrentRound('失败回滚测试', 'should rollback')`);
  storage.setFailureKey('');
  assert.strictEqual(failed.ok, false, 'simulated storage failure must fail archive');
  assert.strictEqual(expr('loadProgress(' + JSON.stringify(bookId) + ').lastWordId'), 22, 'failed archive must restore old progress');
  assert.strictEqual(expr('loadMarks(' + JSON.stringify(bookId) + ').unknown.includes(22)'), true, 'failed archive must restore old marks');
  assert.strictEqual(expr('Object.keys(loadRoundArchives()).length'), 0, 'failed archive must not leave a partial history entry');
  assert.strictEqual(expr('loadRoundState().generation'), 0, 'failed archive must not advance generation');

  console.log('Round archive regression tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
