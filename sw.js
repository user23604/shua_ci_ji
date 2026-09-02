"use strict";

const APP_VERSION = "2026-08-31-round-archive-v1";
const STATIC_CACHE = "shua-ci-ji-static-" + APP_VERSION;
const RUNTIME_CACHE = "shua-ci-ji-runtime-" + APP_VERSION;
const AUDIO_CACHE = "shua-ci-ji-pronunciation-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  "./style.css",
  "./rescue.html",
  "./27ky_shanguo_gaopin.csv",
  "./hongbaoshu_bikao.csv",
  "./hongbaoshu_jichu.csv",
  "./assets/css/00-tokens.css",
  "./assets/css/01-base.css",
  "./assets/css/02-components.css",
  "./assets/css/03-auth-setup.css",
  "./assets/css/04-flashcard.css",
  "./assets/css/05-drawers-stats.css",
  "./assets/css/06-sync-version-dialog.css",
  "./assets/css/07-responsive.css",
  "./assets/js/app.bundle.js",
  "./assets/audio/en-us/manifest.json",
  "./assets/rescue/rescue.css",
  "./assets/rescue/rescue.js"
];

self.addEventListener("install", function(event) {
  event.waitUntil((async function() {
    const cache = await caches.open(STATIC_CACHE);
    try {
      // 新版本程序壳必须完整写入后才接管；任何关键资源失败都保留旧 Service Worker。
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(STATIC_CACHE);
      throw error;
    }
  })());
});

self.addEventListener("activate", function(event) {
  event.waitUntil((async function() {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function(key) {
      return key.startsWith("shua-ci-ji-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE && key !== AUDIO_CACHE;
    }).map(function(key) { return caches.delete(key); }));
    await self.clients.claim();
  })());
});

self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function networkWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(function() { clearTimeout(timer); });
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    fetch(request).then(async function(response) {
      if (response && response.ok) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
      }
    }).catch(function() {});
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function audioCacheFirst(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackPath) {
  try {
    const response = await networkWithTimeout(request, 5000);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
      return response;
    }
    // 临时 4xx/5xx 不应覆盖一个已知可用的本地程序壳或词表。
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await caches.match(fallbackPath, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await caches.match(fallbackPath, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener("fetch", function(event) {
  const request = event.request;
  if (!request || request.method !== "GET") return;
  const url = new URL(request.url);

  // GitHub API、Gist raw 等跨域同步请求完全绕过 Service Worker。
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }
  if (/\.(?:mp3|ogg|opus|m4a|wav)$/i.test(url.pathname)) {
    event.respondWith(audioCacheFirst(request));
    return;
  }
  if (/\.csv$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (/\.(?:js|css|svg|png|jpg|jpeg|webp|json)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
