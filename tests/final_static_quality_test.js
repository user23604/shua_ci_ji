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

const setupRender = read('assets/js/14-auth-setup-render.js');
assert.strictEqual((setupRender.match(/id=\"startBtn\"/g) || []).length, 1, 'setup must render exactly one start button');
assert(setupRender.indexOf('id=\"startBtn\"') < setupRender.indexOf('<section class=\"setup-grid\">'), 'start button must be above the long setup grid');
assert(/setupStatusBox/.test(setupRender) && /updateSetupStatusElement/.test(setupRender), 'setup status must update in place instead of rerendering the whole page');
assert(/autoSyncEnabled/.test(setupRender) && /manualSyncControls/.test(setupRender), 'auto/manual sync controls missing from setup');

const setupEvents = read('assets/js/15-setup-events.js');
assert(/handleAutoSyncPreferenceChanged/.test(setupEvents), 'auto-sync switch does not apply runtime scheduling changes');
assert(/reason:\s*"manual_retry"/.test(setupEvents), 'manual sync button does not invoke the safe sync path');
assert(/state\.settings\.autoSyncEnabled === false[\s\S]*业务数据仍只保存在本地/.test(setupEvents), 'saving cloud config while auto-sync is off still auto-uploads business data');

const scheduler = read('assets/js/09b-sync-scheduler.js');
assert(/function isAutoSyncEnabled/.test(scheduler), 'auto-sync preference helper missing');
assert(/scheduleSyncSoon[\s\S]*!isAutoSyncEnabled\(\)/.test(scheduler), 'automatic scheduling is not blocked when auto-sync is off');
assert(/startSyncHeartbeat[\s\S]*!isAutoSyncEnabled\(\)/.test(scheduler), 'heartbeat is not blocked when auto-sync is off');
const syncTick = read('assets/js/27-sync-tick.js');
assert(/syncTickInternal[\s\S]*!isAutoSyncEnabled\(\)[\s\S]*!isHardForcedSyncReason/.test(syncTick), 'sync core lacks a central auto-sync-off gate');
assert(/if \(!isAutoSyncEnabled\(\)\) return;/.test(read('assets/js/27c-sync-orchestration-helpers.js')), 'view-opening remote checks ignore auto-sync-off mode');

const flashRender = read('assets/js/17-flashcard-render.js');
const flashCss = read('assets/css/04-flashcard.css');
assert(/pause-feedback/.test(flashRender) && /已暂停 · 点击卡片继续/.test(flashRender), 'persistent pause feedback missing');
assert(/word-card--paused/.test(flashCss) && !/word-card--paused[^}]*filter:\s*blur/.test(flashCss), 'pause feedback must not blur the card');
assert(!/<details class=\"unit-group\" open>/.test(read('assets/js/21-archive-stats.js')), 'archive unit groups must be collapsed by default');

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

console.log('Final static quality tests passed');
