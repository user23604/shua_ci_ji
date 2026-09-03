const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
function load(context, file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const context = {
  console, Date, Math, JSON, URL, Promise, Error, TypeError,
  setTimeout, clearTimeout,
  crypto: { randomUUID: () => 'test-device' }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
load(context, 'assets/js/00-env.js');
load(context, 'assets/js/01-utils-basic.js');
load(context, 'assets/js/24-sync-remote-api.js');
load(context, 'assets/js/28-sync-push-patch.js');
load(context, 'assets/js/28b-sync-backup-cleanup.js');

const today = context.localDateKey();
const todayName = `sync.backup.${today}.json`;

{
  const files = context.buildGistPatchFiles('{"ok":1}', { fileNames: ['sync.json'] });
  assert.deepStrictEqual(Object.keys(files).sort(), ['sync.json', todayName].sort());
  assert.strictEqual(files['sync.prev.json'], undefined, 'normal PATCH should not resend full previous payload');
}

{
  const names = ['sync.json', todayName];
  for (let i = 1; i <= 8; i += 1) names.push(`sync.backup.2025-01-0${i}.json`);
  const files = context.buildGistPatchFiles('{"ok":1}', { fileNames: names });
  assert.strictEqual(files[todayName], undefined, 'existing daily backup should not be retransmitted');
  const deletions = Object.entries(files).filter(([, value]) => value === null).map(([name]) => name);
  assert.strictEqual(deletions.length, 0, 'business PATCH must not carry deletion entries (stale file lists turned successful writes into 422 failures)');
  // 过期备份保留期计算移至独立 best-effort 清理（业务写入确认成功后执行）。
  const expired = context.collectExpiredCloudBackupNames(names);
  assert(expired.length >= 2, 'expired backup retention list should still cover old cloud backups');
  assert(expired.every((name) => name.startsWith('sync.backup.') && name !== todayName), 'cleanup list must only contain old sync.backup.* files, never sync.json');
}

{
  const candidates = context.sortedGistRecoveryCandidates({
    old: { filename: 'other.json' },
    prev: { filename: 'sync.prev.json' },
    d1: { filename: 'sync.backup.2026-07-23.json' },
    d2: { filename: 'sync.backup.2026-07-24.json' }
  });
  assert.deepStrictEqual(Array.from(candidates, (item) => item.filename), [
    'sync.backup.2026-07-24.json',
    'sync.backup.2026-07-23.json',
    'other.json'
  ]);
}

console.log('Final transport efficiency tests passed');
