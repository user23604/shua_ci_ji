const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const archive = read('assets/js/21-archive-stats.js');
const archiveSelection = read('assets/js/21a-archive-selection.js');
const archiveCss = read('assets/css/05-drawers-stats.css');
const gesture = read('assets/js/19-gesture.js');
const flow = read('assets/js/20-study-flow.js');
const session = read('assets/js/16a-study-session.js');
const flash = read('assets/js/17-flashcard-render.js');
const bootstrap = read('assets/js/99-bootstrap.js');
const auth = read('assets/js/14-auth-setup-render.js');
const syncTick = read('assets/js/27-sync-tick.js');
const setupEvents = read('assets/js/15-setup-events.js');

assert(/\.unit-group:not\(\[open\]\)\s*>\s*\.word-list\s*\{[\s\S]*display:\s*none\s*!important/.test(archiveCss), 'archive collapsed state is not explicitly enforced');
assert(/resetArchiveSelection\(\)/.test(archive) && /archiveExpandedUnits\s*=\s*new Set/.test(archiveSelection), 'archive does not reset to all-collapsed on open/tab change');
assert(/data-archive-unit-summary/.test(archive) && /bindArchiveLongPress\(summary/.test(archive), 'unit long-press selection missing');
assert(/data-archive-word-id/.test(archive) && /bindArchiveLongPress\(row/.test(archive), 'word long-press selection missing');
assert(/mode:\s*"archive-unit-selection"/.test(archiveSelection), 'selected archive units cannot start a combined review');
assert(/setWordMarkStatesBatch\(currentBook\(\)\.id, ids, null\)/.test(archiveSelection), 'archive word batch undo is not atomic');

assert(/id="replayUnitBtn"/.test(flow) && /function startCurrentUnitReplay/.test(flow), 'full-unit replay button missing');
assert(/buildAllUnitWords\(unit\)/.test(flow), 'full-unit replay still filters already-marked words');
assert(/\["round-unknown", "unit-replay"\]/.test(flow), 'unit replay does not return safely to the original break');

assert(/manualZhReveal/.test(flash) && /function revealZhManually/.test(flash), 'manual Chinese reveal flow missing');
assert(/button\.dataset\.cardTap === "tap-right" && revealZhManually\(\)/.test(gesture), 'right-side tap does not reveal Chinese first');
const cardClickStart = gesture.indexOf('card.addEventListener("click"');
const cardClickEnd = gesture.indexOf('stack.addEventListener("pointerdown"', cardClickStart);
const cardClickHandler = gesture.slice(cardClickStart, cardClickEnd);
assert(cardClickStart >= 0 && cardClickEnd > cardClickStart, 'card click handler missing');
assert(cardClickHandler.indexOf('revealZhManually()') >= 0, 'center tap manual reveal missing');
assert(cardClickHandler.indexOf('revealZhManually()') < cardClickHandler.indexOf('state.playbackPaused'), 'paused center tap resumes before revealing Chinese');
assert(cardClickHandler.indexOf('revealZhManually()') < cardClickHandler.indexOf('pausePlaybackFromCard()'), 'playing center tap pauses before revealing Chinese');
assert(/已暂停 · 点击显示中文，再点继续/.test(flash), 'paused manual-reveal feedback is misleading');
assert(/pauseFeedback[\s\S]*已暂停 · 点击卡片继续/.test(flash), 'pause feedback is not updated after manual reveal');
assert(/\.unit-group summary,\s*\.archive-word\s*\{[\s\S]*user-select:\s*none/.test(archiveCss), 'archive word long-press can still select text');
assert(!/STUDY_SESSION_KEY/.test(read('assets/js/22-sync-payload.js')), 'device-local study session leaked into cloud sync payload');

const context = {
  console, Math, Number, Set, Array, Object,
  state: { settings: {}, navQueue: [] },
  document: { querySelectorAll: () => [], getElementById: () => null },
  window: { innerWidth: 1200, innerHeight: 800 },
  clamp: (value, min, max) => Math.max(min, Math.min(max, value))
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(gesture, context, { filename: '19-gesture.js' });
const small = context.amplifySwipeDelta(10, 1200);
const large = context.amplifySwipeDelta(80, 1200);
assert(small > 10, 'small swipe is not amplified');
assert(large / 80 > small / 10, 'swipe response is not nonlinear');
assert.strictEqual(context.amplifySwipeDelta(-30, 1200), -context.amplifySwipeDelta(30, 1200), 'swipe amplification is directionally asymmetric');

assert(/STUDY_SESSION_KEY/.test(session) && /playbackPaused\s*=\s*true/.test(session), 'last study session is not restored paused');
assert(/enterStudyOnLaunch\(\{ reason: "init" \}\)/.test(bootstrap), 'authenticated startup still opens settings instead of study');
assert(!/if \(isAuthenticated\(\)\)\s*\{\s*renderSetup\(\)/.test(bootstrap), 'authenticated startup still renders settings first');
assert(/enterStudyOnLaunch\(\{ reason: "auth_success" \}\)/.test(auth), 'successful login does not enter the study view');
assert(/state\.view === "loading"/.test(flow), 'sync re-render cannot preserve the launch loading view');

assert(/!isAutoSyncEnabled\(\) && !isHardForcedSyncReason/.test(syncTick), 'central auto-sync-off gate regressed');
assert(/state\.settings\.autoSyncEnabled === false[\s\S]*点击手动同步后再上传/.test(setupEvents), 'saving config while auto sync is off still uploads business data');
assert(/reason:\s*"manual_retry"/.test(setupEvents), 'manual sync safe path missing');

console.log('UX v4 regression tests passed');
