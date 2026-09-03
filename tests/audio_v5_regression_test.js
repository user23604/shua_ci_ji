const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const app = read('app.js');
const audio = read('assets/js/18a-audio-pronunciation.js');
const speech = read('assets/js/18-speech.js');
const flash = read('assets/js/17-flashcard-render.js');
const utils = read('assets/js/01-utils-basic.js');
const defaults = read('assets/js/03-domain-defaults.js');
const storage = read('assets/js/05d-storage-settings.js');
const setup = read('assets/js/14-auth-setup-render.js');
const events = read('assets/js/15-setup-events.js') + '\n' + read('assets/js/15a-audio-settings-events.js');
const sw = read('sw.js');
const indexHtml = read('index.html');

assert(exists('assets/audio/en-us/manifest.json'), 'pronunciation manifest missing');
const manifest = JSON.parse(read('assets/audio/en-us/manifest.json'));
assert.strictEqual(manifest.schemaVersion, 1, 'pronunciation manifest schema mismatch');
assert.strictEqual(manifest.language, 'en-US', 'pronunciation manifest language mismatch');
assert(manifest.entries && typeof manifest.entries === 'object', 'pronunciation manifest entries missing');

assert(app.includes('18a-audio-pronunciation.js'), 'audio pronunciation module not loaded');
assert(app.indexOf('18a-audio-pronunciation.js') < app.indexOf('18-speech.js'), 'audio module must load before speech fallback');
assert(/preferStandardAudio:\s*true/.test(defaults), 'standard audio is not enabled by default');
assert(/preferStandardAudio: typeof source\.preferStandardAudio === "boolean"/.test(storage), 'standard audio preference is not normalized');
assert(/toggle\("preferStandardAudio"/.test(setup), 'standard audio toggle missing');
assert(/cachePronunciationUnitBtn/.test(setup) && /clearPronunciationCacheBtn/.test(setup), 'audio cache controls missing');
assert(/cacheCurrentUnitPronunciation/.test(events) && /clearPronunciationAudioCache/.test(events), 'audio cache controls are not wired');

const standardIndex = flash.indexOf('playStandardEnglishAudio(word.en, token)');
const fallbackIndex = flash.indexOf('speakWithHighlight(word.en, "en-US", "en", token)');
assert(standardIndex >= 0 && fallbackIndex > standardIndex, 'browser speech is not a last-resort English fallback');
assert(/setSpeechPhase\(phase, rate, sourceLabel = ""\)/.test(flash), 'speech UI cannot identify the standard audio source');
assert(/stopPronunciationAudio/.test(utils), 'clearing study timers does not stop HTML audio');
assert(/unlockPronunciationAudio/.test(speech), 'audio is not unlocked from the user gesture path');

assert(/const AUDIO_CACHE = "shua-ci-ji-pronunciation-v1"/.test(sw), 'dedicated pronunciation cache missing');
assert(/key !== AUDIO_CACHE/.test(sw), 'service-worker activation deletes pronunciation cache');
assert(/mp3\|ogg\|opus\|m4a\|wav/.test(sw) && /event\.respondWith\(audioCacheFirst\(request\)\)/.test(sw), 'same-origin pronunciation files are not cache-first');
assert(sw.includes('./assets/audio/en-us/manifest.json'), 'audio manifest missing from offline app shell');
assert(/connect-src[^;]*https:\/\/api\.dictionaryapi\.dev/.test(indexHtml), 'dictionary audio fetch is blocked by CSP');
assert(/media-src[^;]*blob:/.test(indexHtml), 'blob pronunciation playback is blocked by CSP');

assert(/failureUntil: new Map\(\)/.test(audio), 'temporary audio failure cooldown missing');
assert(/remoteBackoffUntil:\s*0/.test(audio) && /markRemotePronunciationFailure/.test(audio), 'global remote-audio circuit breaker missing');
assert(/PRONUNCIATION_FETCH_TIMEOUT_MS = 2800/.test(audio), 'remote audio fallback timeout is too long');
assert(!/unavailable: new Set\(\)/.test(audio), 'transient network failures still permanently disable words');
assert.strictEqual((audio.match(/const objectUrl = URL\.createObjectURL\(blob\);/g) || []).length, 1, 'audio object URL is declared more than once');
assert(audio.split(/\r?\n/).length <= 500, 'audio module is too long for reliable review');
assert(exists('tools/build_pronunciation_pack.py'), 'offline pronunciation pack builder missing');

const context = {
  console,
  Map,
  Set,
  Object,
  Array,
  String,
  Number,
  Math,
  Date,
  JSON,
  Promise,
  state: { settings: { preferStandardAudio: true } },
  window: {},
  location: { href: 'https://example.test/index.html' },
  isPlainObject: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
  loadJson: () => ({}),
  saveJson: () => {},
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(audio, context, { filename: '18a-audio-pronunciation.js' });
assert.strictEqual(vm.runInContext('normalizePronunciationKey("  ’Home!  ")', context), "home", 'word normalization regressed');
assert.strictEqual(vm.runInContext('isUsAudioUrl("https://x.test/home-us.mp3")', context), true, 'US audio detection regressed');
vm.runInContext('markPronunciationFailure("home", 60000)', context);
assert.strictEqual(vm.runInContext('pronunciationTemporarilyUnavailable("home")', context), true, 'failure cooldown is not applied');
vm.runInContext('clearPronunciationFailure("home")', context);
assert.strictEqual(vm.runInContext('pronunciationTemporarilyUnavailable("home")', context), false, 'failure cooldown cannot be cleared');
vm.runInContext('markRemotePronunciationFailure()', context);
assert.strictEqual(vm.runInContext('remotePronunciationAllowed()', context), false, 'remote audio circuit breaker is not applied');
vm.runInContext('clearRemotePronunciationFailure()', context);
assert.strictEqual(vm.runInContext('remotePronunciationAllowed()', context), true, 'remote audio circuit breaker cannot recover');

const python = process.env.PYTHON || 'python3';
const check = spawnSync(python, ['tools/build_pronunciation_pack.py', '--check'], {
  cwd: root,
  encoding: 'utf8',
});
assert.strictEqual(check.status, 0, `audio pack builder check failed: ${check.stderr || check.stdout}`);
assert(/唯一单词：4515/.test(check.stdout), 'audio pack builder did not discover all unique words');

console.log('Audio v5 regression tests passed');
