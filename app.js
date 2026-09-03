(function() {
  "use strict";

  var BUILD_ID = "2026-09-02-round-archive-v2";

  window.__SHUA_APP_VERSION__ = BUILD_ID;
  window.__SHUA_BUILD_ID__ = BUILD_ID;

  var scripts = [
    "00-env.js",
    "01-utils-basic.js",
    "02-storage-basic.js",
    "03-domain-defaults.js",
    "04-state.js",
    "05a-storage-progress.js",
    "05b-storage-marks.js",
    "05c-storage-activity.js",
    "05d-storage-settings.js",
    "05e-round-archive-storage.js",
    "06-sync-runtime.js",
    "07-sync-diagnostics-ui.js",
    "08a-sync-hash-core.js",
    "08b-sync-hash-status.js",
    "08c-sync-error-state.js",
    "09a-sync-backups.js",
    "09b-sync-scheduler.js",
    "09c-sync-audit.js",
    "10-version-service.js",
    "11-word-data.js",
    "12-formatting.js",
    "13-activity.js",
    "14-auth-setup-render.js",
    "15-setup-events.js",
    "15a-audio-settings-events.js",
    "16-study-start.js",
    "16a-study-session.js",
    "17-flashcard-render.js",
    "18a-audio-pronunciation.js",
    "18-speech.js",
    "19-gesture.js",
    "20-study-flow.js",
    "21-archive-stats.js",
    "21a-archive-selection.js",
    "21b-round-archive-ui.js",
    "22-sync-payload.js",
    "23-sync-v2-compat.js",
    "24-sync-remote-api.js",
    "25-sync-status-config.js",
    "25a-sync-status-core.js",
    "26-sync-apply.js",
    "27a-sync-active-study-guard.js",
    "27b-sync-decision.js",
    "27c-sync-orchestration-helpers.js",
    "27-sync-tick.js",
    "28a-sync-branches.js",
    "28-sync-push-patch.js",
    "29-sync-merge.js",
    "31-wake-lock.js",
    "99-bootstrap.js"
  ];

  var BUNDLE_FILE = "app.bundle.js";
  var currentScript = document.currentScript;
  var baseUrl = new URL("assets/js/", currentScript ? currentScript.src : location.href);
  window.__SHUA_SOURCE_MODULES__ = scripts.slice();
  window.__SHUA_LOADER_MODE__ = "starting";

  // 安全挂载错误红屏（防止 document.body 不存在时崩溃）
  function appendErrorBox(box) {
    if (document.body) {
      document.body.appendChild(box);
      return;
    }
    document.documentElement.appendChild(box);
  }

  function createErrorBox(title, message, technical) {
    var box = document.createElement("div");
    box.id = "app-load-error";
    box.style.cssText = "position:fixed;inset:0;z-index:999999;background:#7f1d1d;color:#fff;padding:24px;font:14px/1.6 system-ui,sans-serif;overflow:auto;";
    var heading = document.createElement("h2");
    heading.textContent = title;
    var paragraph = document.createElement("p");
    paragraph.textContent = message;
    var pre = document.createElement("pre");
    pre.style.cssText = "white-space:pre-wrap;background:rgba(0,0,0,.25);padding:12px;border-radius:8px;";
    pre.textContent = technical || "";
    box.appendChild(heading);
    box.appendChild(paragraph);
    box.appendChild(pre);
    return box;
  }


  function showRuntimeWarning(title, technical) {
    var existing = document.getElementById("app-runtime-warning");
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "app-runtime-warning";
      existing.setAttribute("role", "alert");
      existing.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:999998;background:#7f1d1d;color:#fff;padding:10px 12px;border-radius:10px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);max-height:35vh;overflow:auto;";
      var close = document.createElement("button");
      close.type = "button";
      close.textContent = "关闭";
      close.style.cssText = "float:right;margin-left:12px;background:#fff;color:#7f1d1d;border:0;border-radius:6px;padding:4px 9px;cursor:pointer;";
      close.addEventListener("click", function() { existing.remove(); });
      existing.appendChild(close);
      var text = document.createElement("div");
      text.className = "app-runtime-warning__text";
      existing.appendChild(text);
      appendErrorBox(existing);
    }
    var textNode = existing.querySelector(".app-runtime-warning__text");
    if (textNode) textNode.textContent = title + "。学习数据仍保存在本机；可导出排查包后继续使用。\n" + String(technical || "");
  }

  // 全局错误兜底：模块加载后运行时错误。
  window.addEventListener("error", function(event) {
    if (document.getElementById("app-load-error")) return;
    var technical = "文件：" + String(event.filename || "") + "\n" +
      "行列：" + String(event.lineno || "") + ":" + String(event.colno || "") + "\n" +
      "错误：" + String(event.message || "");
    if (window.__SHUA_APP_READY__ === true) {
      showRuntimeWarning("刷词机发生非致命运行错误", technical);
      return;
    }
    appendErrorBox(createErrorBox("刷词机启动失败", "应用初始化阶段发生运行错误。", technical));
  });

  window.addEventListener("unhandledrejection", function(event) {
    if (document.getElementById("app-load-error")) return;
    var reason = event && event.reason;
    var technical = String(reason && reason.stack || reason && reason.message || reason || "未知错误");
    if (window.__SHUA_APP_READY__ === true) {
      showRuntimeWarning("刷词机发生非致命异步错误", technical);
      return;
    }
    appendErrorBox(createErrorBox("刷词机启动失败", "应用初始化阶段发生未处理的异步错误。", technical));
  });

  function showLoadError(file, err) {
    if (document.getElementById("app-load-error")) return;
    appendErrorBox(createErrorBox(
      "刷词机加载失败",
      "模块文件加载失败：" + String(file) + "。请刷新页面；离线时请确认曾经成功打开过当前版本。",
      String(err && err.message || err || "")
    ));
  }

  function loadNext(index) {
    if (index >= scripts.length) return;

    var file = scripts[index];
    var script = document.createElement("script");
    script.src = new URL(file + "?v=" + encodeURIComponent(BUILD_ID), baseUrl).toString();
    script.async = false;

    script.onload = function() {
      if (index === 0) window.__SHUA_LOADER_MODE__ = "source-fallback";
      loadNext(index + 1);
    };

    script.onerror = function(err) {
      showLoadError(file, err);
    };

    document.head.appendChild(script);
  }

  function loadBundle() {
    var script = document.createElement("script");
    script.src = new URL(BUNDLE_FILE + "?v=" + encodeURIComponent(BUILD_ID), baseUrl).toString();
    script.async = false;
    script.onload = function() {
      window.__SHUA_LOADER_MODE__ = "bundle";
    };
    script.onerror = function() {
      // 部署遗漏或单文件传输失败时，回退到源码模块，避免整个应用不可用。
      window.__SHUA_LOADER_MODE__ = "source-fallback";
      loadNext(0);
    };
    document.head.appendChild(script);
  }

  loadBundle();
})();
