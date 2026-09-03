"use strict";

const PRONUNCIATION_MANIFEST_URL = "./assets/audio/en-us/manifest.json";
const PRONUNCIATION_AUDIO_CACHE = "shua-ci-ji-pronunciation-v1";
const PRONUNCIATION_URL_CACHE_KEY = "vocab_machine_pronunciation_url_cache_v1";
const PRONUNCIATION_DIRECT_BASE = "https://api.dictionaryapi.dev/media/pronunciations/en/";
const PRONUNCIATION_API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const PRONUNCIATION_FETCH_TIMEOUT_MS = 2800;
const PRONUNCIATION_AUTOPREFETCH_COUNT = 7;

const pronunciationRuntime = {
  manifest: null,
  manifestPromise: null,
  urlCache: null,
  failureUntil: new Map(),
  remoteBackoffUntil: 0,
  remoteFailureCount: 0,
  active: null,
  sharedAudio: null,
  unlockAttempted: false,
  lastPrimeKey: "",
  primeTimer: 0,
  cacheStatus: ""
};

function standardPronunciationEnabled() {
  return state.settings.preferStandardAudio !== false;
}

function normalizePronunciationKey(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'-]+$/g, "")
    .replace(/^['-]+|['-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function pronunciationTemporarilyUnavailable(key) {
  const retryAt = Number(pronunciationRuntime.failureUntil.get(key) || 0);
  if (!retryAt) return false;
  if (Date.now() >= retryAt) {
    pronunciationRuntime.failureUntil.delete(key);
    return false;
  }
  return true;
}

function markPronunciationFailure(key, retryAfterMs = 2 * 60 * 1000) {
  if (!key) return;
  pronunciationRuntime.failureUntil.set(key, Date.now() + Math.max(10000, Number(retryAfterMs) || 0));
}

function clearPronunciationFailure(key) {
  if (key) pronunciationRuntime.failureUntil.delete(key);
}

function remotePronunciationAllowed() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return Date.now() >= Number(pronunciationRuntime.remoteBackoffUntil || 0);
}

function markRemotePronunciationFailure() {
  pronunciationRuntime.remoteFailureCount = Math.min(8, Number(pronunciationRuntime.remoteFailureCount || 0) + 1);
  const delay = Math.min(10 * 60 * 1000, 15000 * (2 ** (pronunciationRuntime.remoteFailureCount - 1)));
  pronunciationRuntime.remoteBackoffUntil = Date.now() + delay;
}

function clearRemotePronunciationFailure() {
  pronunciationRuntime.remoteFailureCount = 0;
  pronunciationRuntime.remoteBackoffUntil = 0;
}

function isRemotePronunciationCandidate(candidate) {
  return Boolean(candidate && String(candidate.kind || "").startsWith("dictionary"));
}

function pronunciationDirectUrl(key) {
  return PRONUNCIATION_DIRECT_BASE + encodeURIComponent(key) + "-us.mp3";
}

function normalizeManifestEntry(entry) {
  if (typeof entry === "string") return { path: entry };
  if (!isPlainObject(entry) || !entry.path) return null;
  return {
    path: String(entry.path),
    durationMs: Math.max(0, Number(entry.durationMs) || 0),
    source: String(entry.source || "local-pack")
  };
}

async function loadPronunciationManifest() {
  if (pronunciationRuntime.manifest) return pronunciationRuntime.manifest;
  if (pronunciationRuntime.manifestPromise) return pronunciationRuntime.manifestPromise;
  pronunciationRuntime.manifestPromise = (async function() {
    try {
      const response = await fetch(PRONUNCIATION_MANIFEST_URL, { cache: "no-cache", credentials: "same-origin" });
      if (!response.ok) throw new Error("manifest_http_" + response.status);
      const value = await response.json();
      const rawEntries = isPlainObject(value && value.entries) ? value.entries : {};
      const entries = {};
      Object.entries(rawEntries).forEach(function(pair) {
        const key = normalizePronunciationKey(pair[0]);
        const entry = normalizeManifestEntry(pair[1]);
        if (key && entry) entries[key] = entry;
      });
      pronunciationRuntime.manifest = {
        schemaVersion: Number(value && value.schemaVersion) || 1,
        language: String(value && value.language || "en-US"),
        voice: String(value && value.voice || "standard-us"),
        entries
      };
    } catch (_) {
      pronunciationRuntime.manifest = { schemaVersion: 1, language: "en-US", voice: "standard-us", entries: {} };
    }
    return pronunciationRuntime.manifest;
  })();
  return pronunciationRuntime.manifestPromise;
}

function loadPronunciationUrlCache() {
  if (pronunciationRuntime.urlCache) return pronunciationRuntime.urlCache;
  const value = loadJson(PRONUNCIATION_URL_CACHE_KEY, {});
  pronunciationRuntime.urlCache = isPlainObject(value) ? value : {};
  return pronunciationRuntime.urlCache;
}

function rememberPronunciationUrl(key, url) {
  const cache = loadPronunciationUrlCache();
  cache[key] = { url: String(url), savedAt: Date.now() };
  const entries = Object.entries(cache)
    .sort(function(a, b) { return Number(b[1] && b[1].savedAt || 0) - Number(a[1] && a[1].savedAt || 0); })
    .slice(0, 1200);
  pronunciationRuntime.urlCache = Object.fromEntries(entries);
  saveJson(PRONUNCIATION_URL_CACHE_KEY, pronunciationRuntime.urlCache);
}

function forgetPronunciationUrl(key, url) {
  const cache = loadPronunciationUrlCache();
  const entry = cache[key];
  if (!entry || (url && String(entry.url || "") !== String(url))) return;
  delete cache[key];
  pronunciationRuntime.urlCache = cache;
  saveJson(PRONUNCIATION_URL_CACHE_KEY, cache);
}

function cachedPronunciationUrl(key) {
  const entry = loadPronunciationUrlCache()[key];
  if (!entry || !entry.url) return "";
  return String(entry.url);
}

function audioFetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = window.setTimeout(function() { controller.abort(); }, PRONUNCIATION_FETCH_TIMEOUT_MS);
  return fetch(url, { ...(options || {}), signal: controller.signal }).finally(function() {
    window.clearTimeout(timer);
  });
}

function isUsAudioUrl(url) {
  return /(?:-|_|\/)(?:us|usa)(?:\.|-|_|\/)/i.test(String(url || "")) || /en-us/i.test(String(url || ""));
}

async function resolveDictionaryPronunciationUrl(key) {
  const cached = cachedPronunciationUrl(key);
  if (cached) return cached;
  if (!remotePronunciationAllowed()) return "";
  try {
    const response = await audioFetchWithTimeout(PRONUNCIATION_API_BASE + encodeURIComponent(key), {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "force-cache"
    });
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) markRemotePronunciationFailure();
      return "";
    }
    clearRemotePronunciationFailure();
    const payload = await response.json();
    const phonetics = Array.isArray(payload)
      ? payload.flatMap(function(item) { return Array.isArray(item && item.phonetics) ? item.phonetics : []; })
      : [];
    const audios = phonetics.map(function(item) { return String(item && item.audio || "").trim(); }).filter(Boolean);
    const url = audios.find(isUsAudioUrl) || audios[0] || "";
    if (url) rememberPronunciationUrl(key, url);
    return url;
  } catch (_) {
    markRemotePronunciationFailure();
    return "";
  }
}

async function pronunciationCandidates(text, options) {
  const key = normalizePronunciationKey(text);
  if (!key || pronunciationTemporarilyUnavailable(key)) return [];
  const manifest = await loadPronunciationManifest();
  const result = [];
  const local = manifest.entries[key];
  if (local && local.path) result.push({ url: new URL(local.path, location.href).toString(), kind: "local", key });
  const remembered = cachedPronunciationUrl(key);
  if (remembered) result.push({ url: remembered, kind: "dictionary", key });
  if ((!options || options.remote !== false) && remotePronunciationAllowed()) {
    result.push({ url: pronunciationDirectUrl(key), kind: "dictionary-direct", key });
  }
  return result.filter(function(item, index, list) {
    return list.findIndex(function(other) { return other.url === item.url; }) === index;
  });
}

async function openPronunciationCache() {
  if (!("caches" in window)) return null;
  try {
    return await caches.open(PRONUNCIATION_AUDIO_CACHE);
  } catch (_) {
    return null;
  }
}

function validAudioResponse(response) {
  if (!response || !response.ok) return false;
  const type = String(response.headers && response.headers.get("content-type") || "").toLowerCase();
  return !type || type.startsWith("audio/") || type.includes("octet-stream");
}

async function fetchPronunciationBlob(candidate) {
  const request = new Request(candidate.url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
  const cache = await openPronunciationCache();
  try {
    const cached = cache ? await cache.match(request) : null;
    if (validAudioResponse(cached)) {
      const blob = await cached.blob();
      if (blob.size > 128) return { blob, cached: true };
    }
  } catch (_) {}
  if (isRemotePronunciationCandidate(candidate) && !remotePronunciationAllowed()) return null;
  try {
    const response = await audioFetchWithTimeout(candidate.url, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "force-cache"
    });
    if (!validAudioResponse(response)) {
      if (isRemotePronunciationCandidate(candidate) && response && (response.status === 429 || response.status >= 500)) {
        markRemotePronunciationFailure();
      }
      return null;
    }
    if (isRemotePronunciationCandidate(candidate)) clearRemotePronunciationFailure();
    const clone = response.clone();
    const blob = await response.blob();
    if (blob.size <= 128) return null;
    if (cache) {
      try { await cache.put(request, clone); } catch (_) {}
    }
    return { blob, cached: false };
  } catch (_) {
    if (isRemotePronunciationCandidate(candidate)) markRemotePronunciationFailure();
    return null;
  }
}

function getSharedPronunciationAudio() {
  if (pronunciationRuntime.sharedAudio) return pronunciationRuntime.sharedAudio;
  const audio = new Audio();
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  pronunciationRuntime.sharedAudio = audio;
  return audio;
}

function unlockPronunciationAudio() {
  if (!standardPronunciationEnabled() || typeof Audio === "undefined") return;
  const audio = getSharedPronunciationAudio();
  if (pronunciationRuntime.unlockAttempted) return;
  pronunciationRuntime.unlockAttempted = true;
  const previous = audio.src;
  audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
  audio.volume = 0;
  const promise = audio.play();
  if (promise && typeof promise.then === "function") {
    promise.then(function() {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
      if (previous) audio.src = previous;
    }).catch(function() {
      audio.volume = 1;
      if (previous) audio.src = previous;
    });
  } else {
    audio.pause();
    audio.volume = 1;
    if (previous) audio.src = previous;
  }
}

function stopPronunciationAudio() {
  const active = pronunciationRuntime.active;
  pronunciationRuntime.active = null;
  const audio = pronunciationRuntime.sharedAudio;
  if (audio) {
    try { audio.pause(); } catch (_) {}
    try { audio.removeAttribute("src"); audio.load(); } catch (_) {}
  }
  if (active && active.objectUrl) {
    try { URL.revokeObjectURL(active.objectUrl); } catch (_) {}
  }
  if (active && typeof active.finish === "function") active.finish(false);
}

function playPronunciationBlob(blob, token, sourceLabel) {
  return new Promise(function(resolve) {
    if (!isPlaybackToken(token) || !blob || typeof Audio === "undefined") {
      resolve(false);
      return;
    }
    stopPronunciationAudio();
    const audio = getSharedPronunciationAudio();
    const objectUrl = URL.createObjectURL(blob);
    let settled = false;
    let started = false;
    const rate = clamp(speechRate(), 0.5, 3);
    const finish = function(ok) {
      if (settled) return;
      settled = true;
      if (pronunciationRuntime.active && pronunciationRuntime.active.objectUrl === objectUrl) {
        pronunciationRuntime.active = null;
      }
      try { audio.pause(); } catch (_) {}
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      if (isPlaybackToken(token)) clearSpeechPhase();
      resolve(Boolean(ok));
    };
    pronunciationRuntime.active = { objectUrl, finish };
    audio.onplaying = function() {
      if (!isPlaybackToken(token)) {
        finish(false);
        return;
      }
      started = true;
      setSpeechPhase("en", rate, sourceLabel || "标准美音");
    };
    audio.onended = function() { finish(started); };
    audio.onerror = function() { finish(false); };
    audio.onabort = function() { finish(false); };
    audio.src = objectUrl;
    audio.currentTime = 0;
    audio.volume = 1;
    audio.playbackRate = rate;
    if ("preservesPitch" in audio) audio.preservesPitch = true;
    if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = true;
    if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
    let playResult;
    try {
      playResult = audio.play();
    } catch (_) {
      finish(false);
      return;
    }
    if (playResult && typeof playResult.catch === "function") playResult.catch(function() { finish(false); });
    addTimer(function() {
      if (!settled && !started) finish(false);
    }, PRONUNCIATION_FETCH_TIMEOUT_MS, function() { finish(false); });
  });
}

async function playStandardEnglishAudio(text, token) {
  if (!standardPronunciationEnabled() || !isPlaybackToken(token)) return false;
  const key = normalizePronunciationKey(text);
  if (!key || pronunciationTemporarilyUnavailable(key)) return false;
  const initial = await pronunciationCandidates(text, { remote: true });
  for (const candidate of initial) {
    if (!isPlaybackToken(token)) return false;
    const fetched = await fetchPronunciationBlob(candidate);
    if (!fetched) {
      if (candidate.kind === "dictionary" && candidate.url === cachedPronunciationUrl(key)) {
        forgetPronunciationUrl(key, candidate.url);
      }
      continue;
    }
    const played = await playPronunciationBlob(fetched.blob, token, candidate.kind === "local" ? "离线标准美音" : "标准美音");
    if (played) { clearPronunciationFailure(key); return true; }
  }
  const resolved = await resolveDictionaryPronunciationUrl(key);
  if (resolved && !initial.some(function(item) { return item.url === resolved; })) {
    const fetched = await fetchPronunciationBlob({ url: resolved, key, kind: "dictionary" });
    if (fetched && await playPronunciationBlob(fetched.blob, token, "标准美音")) { clearPronunciationFailure(key); return true; }
  }
  markPronunciationFailure(key);
  return false;
}

async function prefetchPronunciationWord(text, options) {
  if (!standardPronunciationEnabled()) return false;
  const key = normalizePronunciationKey(text);
  if (!key || pronunciationTemporarilyUnavailable(key)) return false;
  const candidates = await pronunciationCandidates(text, { remote: options && options.remote !== false });
  for (const candidate of candidates) {
    const fetched = await fetchPronunciationBlob(candidate);
    if (fetched) { clearPronunciationFailure(key); return true; }
  }
  if (options && options.resolveDictionary) {
    const resolved = await resolveDictionaryPronunciationUrl(key);
    if (resolved) {
      const fetched = await fetchPronunciationBlob({ url: resolved, key, kind: "dictionary" });
      if (fetched) { clearPronunciationFailure(key); return true; }
    }
  }
  markPronunciationFailure(key);
  return false;
}

async function prefetchPronunciationWords(words, options) {
  const unique = [];
  const seen = new Set();
  (words || []).forEach(function(word) {
    const text = typeof word === "string" ? word : word && word.en;
    const key = normalizePronunciationKey(text);
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(text);
    }
  });
  const limit = Math.max(0, Number(options && options.limit) || unique.length);
  const queue = unique.slice(0, limit);
  let completed = 0;
  let cached = 0;
  const worker = async function() {
    while (queue.length) {
      const text = queue.shift();
      if (await prefetchPronunciationWord(text, options || {})) cached += 1;
      completed += 1;
      if (options && typeof options.onProgress === "function") options.onProgress({ completed, total: unique.slice(0, limit).length, cached });
    }
  };
  await Promise.all([worker(), worker()]);
  return { completed, cached };
}

function primePronunciationForCurrentStudy() {
  if (!standardPronunciationEnabled() || state.view !== "flash" || !state.unitWords.length) return;
  const word = state.unitWords[state.currentIndex];
  if (!word) return;
  const key = currentBook().id + ":" + word.id;
  if (pronunciationRuntime.lastPrimeKey === key) return;
  pronunciationRuntime.lastPrimeKey = key;
  if (pronunciationRuntime.primeTimer) window.clearTimeout(pronunciationRuntime.primeTimer);
  pronunciationRuntime.primeTimer = window.setTimeout(function() {
    pronunciationRuntime.primeTimer = 0;
    const ahead = [];
    for (let index = state.currentIndex; index < state.unitWords.length && ahead.length < PRONUNCIATION_AUTOPREFETCH_COUNT; index += 1) {
      ahead.push(state.unitWords[index]);
    }
    prefetchPronunciationWords(ahead, { limit: PRONUNCIATION_AUTOPREFETCH_COUNT, remote: true, resolveDictionary: false }).catch(function() {});
  }, 250);
}

async function cacheCurrentUnitPronunciation(onProgress) {
  const book = currentBook();
  const words = await ensureWords(book);
  const selected = words.filter(function(word) { return Number(word.unit) === Number(state.settings.unit); });
  return prefetchPronunciationWords(selected, {
    limit: selected.length,
    remote: true,
    resolveDictionary: true,
    onProgress
  });
}

async function clearPronunciationAudioCache() {
  pronunciationRuntime.failureUntil.clear();
  clearRemotePronunciationFailure();
  pronunciationRuntime.lastPrimeKey = "";
  pronunciationRuntime.urlCache = {};
  saveJson(PRONUNCIATION_URL_CACHE_KEY, {});
  if ("caches" in window) {
    try { await caches.delete(PRONUNCIATION_AUDIO_CACHE); } catch (_) {}
  }
}

function pronunciationAudioStatusText() {
  if (!standardPronunciationEnabled()) return "标准美式音频已关闭，将直接使用设备语音。";
  const count = pronunciationRuntime.manifest && pronunciationRuntime.manifest.entries
    ? Object.keys(pronunciationRuntime.manifest.entries).length
    : 0;
  return count
    ? `优先使用离线标准美音包（${count} 词）；缺失词自动缓存统一词典美音，最后才回退设备语音。`
    : "优先使用统一词典美式发音并写入本机缓存；离线音频包存在时优先使用，失败才回退设备语音。";
}
