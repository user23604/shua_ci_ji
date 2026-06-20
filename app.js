(function() {
  "use strict";

  var BUILD_ID = "2026-06-20-p5-sync-converge-final";

  window.__SHUA_APP_VERSION__ = BUILD_ID;
  window.__SHUA_BUILD_ID__ = BUILD_ID;

  var scripts = [
    "00-env.js",
    "01-utils-basic.js",
    "02-storage-basic.js",
    "03-domain-defaults.js",
    "04-state.js",
    "05-storage-domain.js",
    "06-sync-runtime.js",
    "07-sync-diagnostics-ui.js",
    "08-sync-hash-state.js",
    "09-sync-backup-recovery.js",
    "10-version-service.js",
    "11-word-data.js",
    "12-formatting.js",
    "13-activity.js",
    "14-auth-setup-render.js",
    "15-setup-events.js",
    "16-study-start.js",
    "17-flashcard-render.js",
    "18-speech.js",
    "19-gesture.js",
    "20-study-flow.js",
    "21-archive-stats.js",
    "22-sync-payload.js",
    "23-sync-v2-ops.js",
    "24-sync-remote-api.js",
    "25-sync-status-config.js",
    "26-sync-apply.js",
    "27-sync-tick.js",
    "28-sync-push-patch.js",
    "29-sync-merge.js",
    "30-sync-legacy-compat.js",
    "31-wake-lock.js",
    "99-bootstrap.js"
  ];

  var currentScript = document.currentScript;
  var baseUrl = new URL("assets/js/", currentScript ? currentScript.src : location.href);

  // 安全挂载错误红屏（防止 document.body 不存在时崩溃）
  function appendErrorBox(box) {
    if (document.body) {
      document.body.appendChild(box);
      return;
    }
    document.documentElement.appendChild(box);
  }

  // 全局错误兜底：模块加载后运行时错误
  window.addEventListener("error", function(event) {
    if (document.getElementById("app-load-error")) return;

    var box = document.createElement("div");
    box.id = "app-load-error";
    box.style.cssText = "position:fixed;inset:0;z-index:999999;background:#7f1d1d;color:#fff;padding:24px;font:14px/1.6 system-ui,sans-serif;overflow:auto;";
    box.innerHTML =
      "<h2>刷词机运行错误</h2>" +
      "<p>模块加载后发生运行错误。请截图给程序员。</p>" +
      "<pre style='white-space:pre-wrap;background:rgba(0,0,0,.25);padding:12px;border-radius:8px;'>" +
      "文件：" + String(event.filename || "") + "\n" +
      "行列：" + String(event.lineno || "") + ":" + String(event.colno || "") + "\n" +
      "错误：" + String(event.message || "") +
      "</pre>";
    appendErrorBox(box);
  });

  function showLoadError(file, err) {
    if (document.getElementById("app-load-error")) return;

    var box = document.createElement("div");
    box.id = "app-load-error";
    box.style.cssText = "position:fixed;inset:0;z-index:999999;background:#7f1d1d;color:#fff;padding:24px;font:14px/1.6 system-ui,sans-serif;overflow:auto;";
    box.innerHTML =
      "<h2>刷词机加载失败</h2>" +
      "<p>模块文件加载失败：" + String(file) + "</p>" +
      "<p>请刷新页面，或清理浏览器缓存后重试。</p>" +
      "<pre style='white-space:pre-wrap;background:rgba(0,0,0,.25);padding:12px;border-radius:8px;'>" +
      String(err && err.message || err || "") +
      "</pre>";
    appendErrorBox(box);
  }

  function loadNext(index) {
    if (index >= scripts.length) return;

    var file = scripts[index];
    var script = document.createElement("script");
    script.src = new URL(file + "?v=" + encodeURIComponent(BUILD_ID), baseUrl).toString();
    script.async = false;

    script.onload = function() {
      loadNext(index + 1);
    };

    script.onerror = function(err) {
      showLoadError(file, err);
    };

    document.head.appendChild(script);
  }

  loadNext(0);
})();
