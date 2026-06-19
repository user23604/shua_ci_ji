"use strict";

const CACHE_PREFIX = "vocab-machine-";
const CACHE_NAME = `${CACHE_PREFIX}v25`;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./sw.js"
];
const STATIC_ASSETS = [
  "./icon.svg",
  "./27ky_shanguo_gaopin.csv",
  "./hongbaoshu_bikao.csv",
  "./hongbaoshu_jichu.csv"
];
const PRECACHE_ASSETS = [...CORE_ASSETS, ...STATIC_ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isCoreRequest(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

function isCoreRequest(url) {
  const pathname = url.pathname.split("/").pop() || "index.html";
  return pathname === "" ||
    pathname === "index.html" ||
    pathname === "app.js" ||
    pathname === "style.css" ||
    pathname === "manifest.json" ||
    pathname === "sw.js";
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(noStoreRequest(request));
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Network unavailable and no cache match.");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetched = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) return cached;
  const response = await fetched;
  if (response) return response;
  throw new Error("Network unavailable and no cache match.");
}

function noStoreRequest(request) {
  return new Request(request, { cache: "no-store" });
}
