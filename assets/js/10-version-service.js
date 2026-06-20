"use strict";

async function checkServerVersion(options = {}) {
  try {
    const response = await fetchWithTimeout("version.json?_=" + Date.now(), { cache: "no-store" }, VERSION_CHECK_TIMEOUT_MS);
    if (!response.ok) throw new Error("version.json HTTP " + response.status);
    const info = await response.json();
    state.versionInfo = {
      status: info.appVersion === APP_VERSION ? "latest" : "stale",
      serverVersion: String(info.appVersion || ""),
      serverBuildId: String(info.buildId || ""),
      checkedAt: beijingISOString(),
      error: ""
    };
    renderVersionBadge();
    if (info.appVersion && info.appVersion !== APP_VERSION) {
      showSyncProblemDialog({
        severity: "warning",
        code: "APP_VERSION_STALE",
        title: "检测到网页新版",
        message: "当前运行版本：" + APP_VERSION + "；服务器发布版本：" + info.appVersion + "。请刷新到新版后再继续使用，旧版可能存在同步 bug。",
        refreshVersion: true,
        serverVersion: info.appVersion,
        force: options.force === true
      });
    }
    return state.versionInfo;
  } catch (error) {
    state.versionInfo = { ...(state.versionInfo || {}), status: "error", checkedAt: beijingISOString(), error: error && error.message || String(error) };
    renderVersionBadge();
    return state.versionInfo;
  }
}


function startVersionChecks() {
  renderVersionBadge();
  checkServerVersion({ force: false });
  if (state.versionCheckTimer) clearInterval(state.versionCheckTimer);
  state.versionCheckTimer = setInterval(function() { checkServerVersion({ force: false }); }, VERSION_CHECK_INTERVAL_MS);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("sw.js?v=" + encodeURIComponent(APP_BUILD_ID), { updateViaCache: "none" }).then((registration) => {
    if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
    registration.update().catch(() => {});
  }).catch(() => {});
}


