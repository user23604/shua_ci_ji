const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function makeStorage(initial) {
  const map = new Map(Object.entries(initial || {}).map(([key, value]) => [String(key), String(value)]));
  let failKey = '';
  return {
    get length() { return map.size; },
    key(index) { return Array.from(map.keys())[index] || null; },
    getItem(key) { return map.has(String(key)) ? map.get(String(key)) : null; },
    setItem(key, value) {
      if (String(key) === failKey) {
        const error = new Error('simulated storage failure');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(String(key), String(value));
    },
    removeItem(key) { map.delete(String(key)); },
    setFailureKey(key) { failKey = String(key || ''); },
    snapshot() { return Object.fromEntries(map.entries()); }
  };
}

function makeElement() {
  return {
    disabled: false,
    textContent: '',
    className: '',
    value: '',
    innerHTML: '',
    addEventListener() {},
    closest() { return null; }
  };
}

const elements = new Map();
const storage = makeStorage({
  vocab_machine_cloud_v1: JSON.stringify({ token: `ghp_${'a'.repeat(36)}`, gistId: 'gist' }),
  'mark_states:book': JSON.stringify({
    1: { value: 'known', updatedAt: '2026-07-25T01:00:00.000Z', clientId: 'phone', seq: 1 }
  })
});

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
  Error,
  Blob: function(parts) { this.size = String((parts || []).join('')).length; },
  localStorage: storage,
  navigator: { userAgent: 'rescue-test', clipboard: { writeText: () => Promise.resolve() } },
  location: { href: 'https://example.test/rescue.html', origin: 'https://example.test' },
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    createElement() { return { click() {}, remove() {} }; },
    body: { appendChild() {} }
  },
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
  alert() {},
  prompt() { return '恢复到本机'; },
  confirm() { return true; },
  __SHUA_RESCUE_TEST_MODE__: true
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/rescue/rescue.js'), 'utf8'), context, {
  filename: 'assets/rescue/rescue.js'
});

const api = context.__SHUA_RESCUE_TEST_API__;
assert(api, 'rescue test API missing');

const payload = api.normalizePayload({
  settings: { bookId: 'book' },
  marks: { book: { known: [99], unknown: [] } },
  markStates: {
    book: {
      1: { value: 'known', updatedAt: '2026-07-25T01:00:00.000Z', clientId: 'phone', seq: 1 },
      2: { value: 'unknown', updatedAt: '2026-07-25T01:01:00.000Z', clientId: 'tablet', seq: 2 },
      3: { value: null, updatedAt: '2026-07-25T01:02:00.000Z', clientId: 'phone', seq: 3 }
    }
  }
});
assert.strictEqual(api.countMarks(payload), 3, 'authoritative markStates, including tombstones, must be counted');
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(api.deriveMarksFromMarkStatesForRescue(payload.markStates.book))),
  { known: [1], unknown: [2] },
  'derived legacy marks must match authoritative mark states'
);

const operations = api.buildRestoreOperations(payload, { key: 'backup:test', payloadHash: 'abc123' });
assert(operations.some((op) => op.key === 'mark_states:book' && !op.remove), 'restore must write mark_states');
assert(operations.some((op) => op.key === 'marks:book' && !op.remove), 'restore must write derived legacy marks');
assert.strictEqual(api.applyStorageOperationsAtomically(operations), true, 'valid restore operations should succeed');
assert.deepStrictEqual(
  JSON.parse(storage.getItem('marks:book')),
  { known: [1], unknown: [2] },
  'restored legacy marks must be derived from markStates rather than stale marks'
);
const restoredSyncState = JSON.parse(storage.getItem('vocab_machine_hash_sync_state_v2'));
assert.strictEqual(restoredSyncState.localPayloadHash, '', 'rescue must not write its display hash into the app business-hash field');
assert.strictEqual(restoredSyncState.baseRemoteHash, '', 'rescue must force a fresh remote baseline after restore');
assert.strictEqual(storage.getItem('vocab_machine_hash_sync_state_v1'), null, 'legacy clean hash state must not override a restored dirty payload');

const collected = api.collectLocalStorage();
assert(collected.keys.includes('vocab_machine_cloud_v1'), 'full rescue backup must include cloud configuration');
assert(collected.keys.includes('mark_states:book'), 'full rescue backup must include authoritative mark states');
const safe = api.sanitize(collected);
assert(!JSON.stringify(safe).includes(`ghp_${'a'.repeat(36)}`), 'sanitized rescue output leaked PAT');

storage.setItem('rollback:first', 'old-first');
storage.setItem('rollback:second', 'old-second');
storage.setFailureKey('rollback:second');
const rollbackOk = api.applyStorageOperationsAtomically([
  { key: 'rollback:first', value: 'new-first' },
  { key: 'rollback:second', value: 'new-second' }
]);
assert.strictEqual(rollbackOk, false, 'simulated storage failure should fail restore');
assert.strictEqual(storage.getItem('rollback:first'), 'old-first', 'failed restore must roll back earlier writes');
assert.strictEqual(storage.getItem('rollback:second'), 'old-second', 'failed restore must preserve failing key');
storage.setFailureKey('');

console.log('Rescue recovery tests passed');
