const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function makeQuotaStorage() {
  const map = new Map();
  let quotaBytes = Infinity;
  function bytesOf(k, v) { return (String(k).length + String(v).length) * 2; }
  function totalBytesWith(nextKey, nextValue) {
    let total = 0;
    map.forEach((value, key) => {
      if (String(key) === String(nextKey)) return;
      total += bytesOf(key, value);
    });
    if (nextKey !== undefined) total += bytesOf(nextKey, nextValue);
    return total;
  }
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] || null; },
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      if (totalBytesWith(k, v) > quotaBytes) {
        const error = new Error('Setting the value exceeded the quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(k, v);
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    seed(k, v) { map.set(String(k), String(v)); },
    setQuota(bytes) { quotaBytes = Number(bytes); },
    approxBytes() { return totalBytesWith(); },
    keys() { return Array.from(map.keys()); }
  };
}

const storage = makeQuotaStorage();
const context = {
  console, Date, Math, JSON, Map, Set, Array, Object, String, Number, Boolean, RegExp, Promise,
  URL, TextEncoder,
  localStorage: storage,
  sessionStorage: makeQuotaStorage(),
  navigator: { userAgent: 'quota-round-archive-test' },
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
  crypto: { randomUUID: (() => { let n = 0; return () => `quota-uuid-${++n}`; })() },
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
  'assets/js/09a-sync-backups.js',
  'assets/js/09c-sync-audit.js',
  'assets/js/22-sync-payload.js'
].forEach(load);

context.getPendingOps = function(){ return []; };
context.showSyncProblemDialog = function(problem) { context.__problem = problem; };
context.persistHashSyncState = function(){ return true; };
context.appendAuditEvent = function(){};

function expr(code) { return vm.runInContext(code, context); }

const bookId = expr('BOOKS[0].id');
const ids = Array.from({ length: 8000 }, (_, i) => i + 1);
expr(`
  state.settings.bookId = ${JSON.stringify(bookId)};
  saveRoundState({ generation: 1, roundId: 'round-1-quota', startedAt: '2026-09-02T20:00:00.000+08:00' });
  saveMarkStates(${JSON.stringify(bookId)}, Object.fromEntries(${JSON.stringify(ids.slice(0, 1200))}.map(function(id, index) {
    return [String(id), { value: index % 2 ? 'known' : 'unknown', updatedAt: '2026-09-02T20:00:00.000+08:00', clientId: 'tablet', seq: index + 1 }];
  })), { touch: false, syncMarks: true });
`);

const archiveRecord = expr(`sanitizeRoundArchiveRecord({
  id: 'archive-0-large',
  name: '第一轮',
  note: 'quota regression',
  archivedAt: '2026-09-02T19:00:00.000+08:00',
  round: { generation: 0, roundId: 'legacy-0', startedAt: '' },
  snapshot: {
    activeBookId: ${JSON.stringify(bookId)},
    settings: state.settings,
    progress: { [${JSON.stringify(bookId)}]: { lastWordId: 500 } },
    marks: { [${JSON.stringify(bookId)}]: { known: ${JSON.stringify(ids.slice(0, 4000))}, unknown: ${JSON.stringify(ids.slice(4000))} } },
    activity: {},
    unitStats: {},
    unknownProgress: {}
  }
}, 'archive-0-large')`);
expr(`saveRoundArchives({ 'archive-0-large': ${JSON.stringify(archiveRecord)} })`);

const liveArchiveRawBefore = storage.getItem(expr('ROUND_ARCHIVES_KEY'));
const fullPayload = expr('collectSyncPayload()');
const oldBundle = {
  kind: 'daily',
  savedAt: '2026-09-02T22:00:00.000+08:00',
  nonEmpty: true,
  payload: fullPayload
};
const oldRaw = JSON.stringify(oldBundle);
const oldDailyKey = expr('DAILY_BACKUP_PREFIX + localDateKey()');
const oldHashKey = expr('HASH_BACKUP_PREFIX + "pre_merge:legacy-large"');
storage.seed(oldDailyKey, oldRaw);
storage.seed(oldHashKey, oldRaw);
storage.seed(expr('HASH_BACKUP_INDEX_KEY'), JSON.stringify({ items: [{ key: oldHashKey, kind: 'pre_merge', savedAt: oldBundle.savedAt, nonEmpty: true }] }));

const legacyWithoutNonEmpty = JSON.stringify({ savedAt: '2026-09-02T21:00:00.000+08:00', payload: fullPayload });
const inferredLegacyNonEmpty = expr(`localBackupEntryMeta('legacy-backup', ${JSON.stringify(legacyWithoutNonEmpty)}, new Map()).nonEmpty`);
assert.strictEqual(inferredLegacyNonEmpty, true, 'legacy backup payloads must still be recognized as non-empty recovery copies');

const beforeBytes = storage.approxBytes();
// Leave almost no free space. The old implementation would fail while trying to write
// the pre_overwrite backup because every backup duplicated the entire archive history.
storage.setQuota(beforeBytes + 2048);

const safety = expr(`backupBundle('pre_overwrite', collectSyncPayload(), 'quota_regression')`);
assert.strictEqual(Object.keys(safety.payload.archives).length, 0, 'local safety backup must not duplicate historical archives');
assert.strictEqual(safety.archiveCountAtSave, 1, 'backup metadata should retain archive count for diagnostics');

const writeOk = expr(`writeHashBackup('pre_overwrite', collectSyncPayload(), 'quota_regression')`);
assert.strictEqual(writeOk, true, 'pre_overwrite backup should recover from quota pressure and succeed');
assert.strictEqual(context.__problem, undefined, 'quota recovery should not surface a blocking error after successful compaction');
assert.strictEqual(storage.getItem(expr('ROUND_ARCHIVES_KEY')), liveArchiveRawBefore, 'quota cleanup must never alter the real archive store');

const compactedDailyRaw = storage.getItem(oldDailyKey);
if (compactedDailyRaw) {
  const compactedDaily = JSON.parse(compactedDailyRaw);
  assert.strictEqual(Object.keys(compactedDaily.payload.archives || {}).length, 0, 'an existing retained daily backup must be compacted');
}
assert(storage.approxBytes() < beforeBytes, 'quota recovery should release storage space by compacting or evicting redundant backup copies');
const preOverwriteKeys = storage.keys().filter((key) => key.startsWith(expr('HASH_BACKUP_PREFIX + "pre_overwrite:"')));
assert(preOverwriteKeys.length >= 1, 'the requested pre_overwrite safety backup should exist after quota recovery');

console.log('Round archive storage quota regression tests passed');
