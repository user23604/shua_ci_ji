"use strict";

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms || 0);
  });
}


function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  var ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  return Promise.resolve();
}


function formatLocalDateTime(value) {
  if (!value) return "无";
  var d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(d);
}

// ── business hash engine ───────────────────────────────────────────────


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


function clampFinite(value, fallback, min, max) {
  const number = Number(value);
  return clamp(Number.isFinite(number) ? number : fallback, min, max);
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function freqAlpha(freq) {
  const maxFreq = state.maxFreqByBook.get(currentBook().id) || 1;
  const level = Math.log1p(Math.max(0, Number(freq) || 0)) / Math.log1p(maxFreq);
  return (0.035 + clamp(level, 0, 1) * 0.245).toFixed(3);
}


function beijingISOString(date) {
  if (date === undefined || date === null) date = new Date();
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const ms = date.getTime() + 8 * 3600000;
  const bj = new Date(ms);
  return bj.getUTCFullYear() + "-" +
    String(bj.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(bj.getUTCDate()).padStart(2, "0") + "T" +
    String(bj.getUTCHours()).padStart(2, "0") + ":" +
    String(bj.getUTCMinutes()).padStart(2, "0") + ":" +
    String(bj.getUTCSeconds()).padStart(2, "0") + "." +
    String(bj.getUTCMilliseconds()).padStart(3, "0") + "+08:00";
}


function localDateKey(date = new Date()) {
  const ms = (date instanceof Date ? date.getTime() : Date.parse(date)) + 8 * 3600000;
  const bj = new Date(Number.isFinite(ms) ? ms : Date.now() + 8 * 3600000);
  const year = bj.getUTCFullYear();
  const month = String(bj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function startOfLocalDay(date = new Date()) {
  const ms = date.getTime() + 8 * 3600000;
  const bj = new Date(ms);
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()));
}


function addDays(date, days) {
  const ms = date.getTime() + days * 86400000;
  return new Date(ms);
}


function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total < 60) return `${total}秒`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
}


function formatHours(seconds) {
  const hours = (seconds || 0) / 3600;
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round((seconds || 0) / 60)}m`;
}


function clearTimers() {
  state.playbackToken += 1;
  state.timers.forEach((timer) => {
    clearTimeout(timer.id);
    if (timer.onCancel) timer.onCancel();
  });
  state.timers = [];
  state.speechPhase = "";
  state.activeZhIndex = -1;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (typeof stopPronunciationAudio === "function") stopPronunciationAudio();
  clearSpeechPhase();
}


function addTimer(fn, delay, onCancel = null) {
  const timer = { id: 0, onCancel };
  timer.id = window.setTimeout(() => {
    state.timers = state.timers.filter((item) => item !== timer);
    fn();
  }, delay);
  state.timers.push(timer);
  return timer.id;
}


function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}


function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map(function(k) { return stableStringify(k) + ":" + stableStringify(value[k]); });
  return "{" + pairs.join(",") + "}";
}


function stableStringifyHash(payload) {
  var copy = {};
  Object.keys(payload).forEach(function(k) { if (k !== "updatedAt") copy[k] = payload[k]; });
  var json = stableStringify(copy);
  var hash = 5381;
  for (var i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}


function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}


function dateMs(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}


