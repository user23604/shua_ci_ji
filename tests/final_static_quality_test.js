const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const app = read('app.js');
const scriptsMatch = app.match(/var scripts = \[([\s\S]*?)\];/);
assert(scriptsMatch, 'app.js script list missing');
const scripts = [...scriptsMatch[1].matchAll(/"([^"]+\.js)"/g)].map((m) => m[1]);
assert(scripts.length >= 30, 'unexpectedly short module list');
scripts.forEach((file) => assert(exists(path.join('assets/js', file)), `missing loader module: ${file}`));
assert.strictEqual(new Set(scripts).size, scripts.length, 'duplicate loader module');

const sw = read('sw.js');
const shellMatch = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert(shellMatch, 'service worker APP_SHELL missing');
const shell = [...shellMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
shell.forEach((item) => {
  if (item === './') return;
  assert(exists(item.replace(/^\.\//, '')), `missing service-worker asset: ${item}`);
});
assert(shell.includes('./assets/js/app.bundle.js'), 'production bundle missing from app shell');
assert(shell.includes('./assets/rescue/rescue.js') && shell.includes('./assets/rescue/rescue.css'), 'rescue assets missing from offline app shell');
assert(!shell.some((item) => /^\.\/assets\/js\/(?!app\.bundle\.js$).+\.js$/.test(item)), 'service worker should cache the production bundle, not every source module');
assert(/cache\.addAll\(APP_SHELL\)/.test(sw), 'service-worker install must be atomic');
assert(!/Promise\.allSettled/.test(sw), 'partial service-worker app-shell install returned');
assert(/if \(response && response\.ok\)[\s\S]*return response;[\s\S]*caches\.match\(request/.test(sw), 'network-first must fall back to cache on non-ok responses');

const version = JSON.parse(read('version.json'));
const expected = version.version || version.appVersion;
assert(expected, 'version.json missing version');
['app.js', 'sw.js', 'assets/js/00-env.js', 'index.html', 'rescue.html', 'style.css'].forEach((file) => {
  assert(read(file).includes(expected), `${file} version mismatch`);
});
assert(/app\.bundle\.js/.test(app) && /source-fallback/.test(app), 'bundle loader or source fallback missing');

const jsFiles = fs.readdirSync(path.join(root, 'assets/js')).filter((f) => f.endsWith('.js'));
const allJs = jsFiles.map((f) => read(path.join('assets/js', f))).join('\n');
assert(!allJs.includes('appendPendingOp('), 'frozen pending-op producer still referenced');
assert(!exists('assets/js/30-sync-legacy-compat.js'), 'deleted legacy compatibility file returned');
assert(!exists('assets/js/13-activity-p10.js'), 'duplicate activity file returned');

const bypassMatches = [...allJs.matchAll(/syncTick\(\{[^}]*reason:\s*"([^"]+)"[^}]*bypassBackoff:\s*true/g)].map((m) => m[1]);
const allowedBypass = new Set(['manual_retry', 'config_saved', 'remote_restore_merge', 'ignore_empty_backup', 'manual_push']);
bypassMatches.forEach((reason) => assert(allowedBypass.has(reason), `automatic reason bypasses backoff: ${reason}`));

const bootstrap = read('assets/js/99-bootstrap.js');
const hiddenBlock = bootstrap.match(/visibilitychange[\s\S]*?\n\s*\}\);/);
if (hiddenBlock) assert(!/syncTick\s*\(/.test(hiddenBlock[0]), 'hidden lifecycle starts remote sync');
assert(!/pagehide[\s\S]{0,500}syncTick\s*\(/.test(bootstrap), 'pagehide starts remote sync');
assert(/waitForStartupSyncBeforeStudy\(2000\)/.test(read('assets/js/16-study-start.js')), 'study startup must not wait indefinitely for cloud sync');
assert(/navigator\.locks\.request/.test(read('assets/js/27c-sync-orchestration-helpers.js')), 'Web Locks cross-tab guard missing');

const support = read('assets/js/15-setup-events.js');
assert(/排查包不写入明文 PAT/.test(support), 'support-bundle token safety guard missing');
assert(!/token:\s*state\.cloud\.token/.test(support), 'support bundle exports clear token');

const rescueHtml = read('rescue.html');
const rescueJs = read('assets/rescue/rescue.js');
assert(/Content-Security-Policy/.test(rescueHtml), 'rescue page CSP missing');
assert(/"mark_states:"/.test(rescueJs), 'rescue page ignores authoritative mark states');
assert(/CLOUD_KEY/.test(rescueJs), 'full rescue backup omits cloud configuration');
assert(/applyStorageOperationsAtomically/.test(rescueJs), 'rescue restore rollback guard missing');

const sourceText = fs.readdirSync(root, { recursive: true })
  .filter((name) => typeof name === 'string' && !name.startsWith('.git') && !name.endsWith('.csv') && !name.endsWith('app.bundle.js'))
  .filter((name) => {
    try { return fs.statSync(path.join(root, name)).isFile(); } catch (_) { return false; }
  })
  .map((name) => read(name))
  .join('\n');
assert(!/github_pat_[A-Za-z0-9_]{30,}/.test(sourceText), 'repository contains a GitHub fine-grained token');
assert(!/gh[pousr]_[A-Za-z0-9]{30,}/.test(sourceText), 'repository contains a GitHub token');



const loader = read('app.js');
assert(/__SHUA_APP_READY__/.test(loader), 'runtime errors are not distinguished from bootstrap failures');
assert(/app-runtime-warning/.test(loader), 'post-startup runtime failures should be non-blocking');
const transport = read('assets/js/28-sync-push-patch.js');
assert(/GIST_RELIABLE_INLINE_MAX_BYTES/.test(transport), 'Gist payload size guard missing');
const remoteApi = read('assets/js/24-sync-remote-api.js');
assert(!/X-GitHub-Api-Version/.test(transport), 'PATCH added an extra browser CORS request header');
assert(!/X-GitHub-Api-Version/.test(remoteApi), 'Gist GET added an extra browser CORS request header');
[
  'assets/js/08a-sync-hash-core.js',
  'assets/js/08b-sync-hash-status.js',
  'assets/js/08c-sync-error-state.js',
  'assets/js/27c-sync-orchestration-helpers.js',
  'assets/js/27-sync-tick.js',
  'assets/js/28a-sync-branches.js',
  'assets/js/28-sync-push-patch.js'
].forEach((file) => {
  const lines = read(file).split(/\r?\n/).length;
  assert(lines <= 500, `${file} is too long for reliable review: ${lines} lines`);
});

// Final v3 safety gates: a hard recovery lock must survive startup and corrupt
// authoritative JSON must be quarantined instead of silently becoming empty data.
assert(/enforceLocalRecoveryGuardAtStartup\(\)/.test(bootstrap), 'startup recovery-lock guard missing');
assert(!/localRecoveryRequired\s*=\s*false/.test(bootstrap), 'bootstrap must not auto-clear a hard recovery lock');
const storageBasic = read('assets/js/02-storage-basic.js');
assert(/processPendingStorageReadIssues/.test(storageBasic), 'authoritative storage corruption guard missing');
assert(/vocab_machine_corrupt_storage:/.test(storageBasic), 'corrupt raw storage quarantine missing');
const recoveryStatus = read('assets/js/08b-sync-hash-status.js');
assert(/verifiedHash/.test(recoveryStatus) && /lock_clear_refused/.test(recoveryStatus), 'recovery lock clear is not hash-verified');

console.log('Final static quality tests passed');
