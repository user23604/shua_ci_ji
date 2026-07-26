"use strict";

function preloadSpeechVoices() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      window.speechSynthesis.getVoices();
    });
  }
}


function pausePlaybackForBackground() {
  if (state.view !== "flash" || state.playbackPaused) return;
  if (typeof touchStudyActivity === "function") touchStudyActivity("pause_background");
  commitCurrentCardActivity();
  clearTimers();
  releaseWakeLock();
  state.playbackPaused = true;
  if (typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary("pause_background");
  renderFlashcard({ touchProgress: false });
}


function pausePlaybackFromCard() {
  if (state.view !== "flash" || state.playbackPaused) return;
  if (typeof touchStudyActivity === "function") touchStudyActivity("pause");
  commitCurrentCardActivity();
  clearTimers();
  releaseWakeLock();
  state.playbackPaused = true;
  if (typeof flushPendingStudyForBoundary === "function") flushPendingStudyForBoundary("pause");
  if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload(1500);
  renderFlashcard({ touchProgress: false });
}


async function resumePlayback() {
  if (state.view !== "flash") return;
  if (typeof touchStudyActivity === "function") touchStudyActivity("resume");
  state.playbackPaused = false;
  state.resumeFeedback = true;
  await requestWakeLock();
  renderFlashcard({ touchProgress: false });
}


function toggleManualModeFromFlash() {
  state.settings.manualMode = !state.settings.manualMode;
  if (typeof touchStudyActivity === "function") touchStudyActivity(state.settings.manualMode ? "manual_mode_on" : "manual_mode_off");
  persistSettings();
  if (state.settings.manualMode && typeof flushPendingStudyForBoundary === "function") {
    flushPendingStudyForBoundary("manual_mode_on");
    if (typeof scheduleActiveStudyUpload === "function") scheduleActiveStudyUpload(1500);
  }
  renderFlashcard({ touchProgress: false });
}


function isPlaybackToken(token) {
  return token === state.playbackToken;
}


function sleepFor(delay) {
  return new Promise((resolve) => {
    addTimer(resolve, Math.max(0, delay), resolve);
  });
}


function estimateSpeechMs(text, lang) {
  const normalized = String(text || "").trim();
  if (!normalized) return 0;
  if (lang.startsWith("zh")) {
    const chars = normalized.replace(/\s+/g, "").length;
    return Math.max(650, (chars / 5.2) * 1000);
  }
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const chars = normalized.replace(/\s+/g, "").length;
  return Math.max(680, (words / 2.45) * 1000, (chars / 11) * 1000);
}


function playbackRate() {
  return clamp(Number(state.settings.rate) || DEFAULT_SETTINGS.rate, PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX);
}


function speechRate() {
  return clamp(playbackRate(), SPEECH_RATE_MIN, SPEECH_RATE_MAX);
}


function formatRate(rate) {
  return Number(rate).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}


function zhRevealDelayMs() {
  return clampFinite(state.settings.zhDelay, DEFAULT_SETTINGS.zhDelay, ZH_DELAY_MIN, ZH_DELAY_MAX);
}


function preReadDelayMs() {
  return clampFinite(state.settings.preReadDelay, DEFAULT_SETTINGS.preReadDelay, PRE_READ_DELAY_MIN, PRE_READ_DELAY_MAX);
}


function retentionPauseSettingMs() {
  return clampFinite(state.settings.retentionPause, DEFAULT_SETTINGS.retentionPause, RETENTION_PAUSE_MIN, RETENTION_PAUSE_MAX);
}


function speechBudgetMs(text, lang, minMs = 520) {
  return Math.max(Math.max(120, minMs / speechRate()), estimateSpeechMs(text, lang) / speechRate());
}


function quietBudgetMs(text, lang, minMs = 420) {
  return Math.max(minMs, estimateSpeechMs(text, lang) * 0.55);
}


function phaseGapMs(baseMs) {
  return Math.max(35, baseMs);
}


function postZhRetentionPauseMs() {
  return retentionPauseSettingMs();
}


function scaledMinimumMs(baseMs, floorMs = 40) {
  return Math.max(floorMs, baseMs);
}


function speakWithHighlight(text, lang, phase, token, { followBoundaries = true } = {}) {
  // Web Speech 在不同浏览器上开始时间不稳定；朗读开始后不要再设置硬超时，否则会截断读音。
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text || !isPlaybackToken(token)) {
      resolve(false);
      return;
    }
    waitForSpeechVoices(token).then(() => {
      if (!isPlaybackToken(token)) {
        resolve(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voice = selectSpeechVoice(lang);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || lang;
      }
      utterance.rate = speechRate();
      const highlightBudget = speechBudgetMs(text, lang, phase === "zh" ? 620 : 560);
      let settled = false;
      let started = false;
      const queuedAt = Date.now();
      const settle = (completed = true) => {
        if (settled) return;
        settled = true;
        if (isPlaybackToken(token)) clearSpeechPhase();
        resolve(completed);
      };
      const settleCanceled = () => {
        if (settled) return;
        settled = true;
        resolve(false);
      };
      const pollDone = () => {
        if (settled) return;
        if (!isPlaybackToken(token)) {
          settleCanceled();
          return;
        }
        if (!started && !window.speechSynthesis.speaking && !window.speechSynthesis.pending && Date.now() - queuedAt < SPEECH_START_TIMEOUT_MS) {
          addTimer(pollDone, SPEECH_POLL_MS, settleCanceled);
          return;
        }
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          settle(started);
          return;
        }
        addTimer(pollDone, SPEECH_POLL_MS, settleCanceled);
      };
      utterance.onstart = () => {
        if (settled || !isPlaybackToken(token)) return;
        started = true;
        setSpeechPhase(phase, utterance.rate);
        if (phase === "zh") simulateZhHighlight(text, highlightBudget, token);
      };
      utterance.onboundary = (event) => {
        if (settled || !followBoundaries || !isPlaybackToken(token) || phase !== "zh") return;
        highlightZhByCharIndex(event.charIndex || 0);
      };
      utterance.onend = () => settle(true);
      utterance.onerror = () => settle(false);
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        settle(false);
        return;
      }
      addTimer(() => {
        if (settled || started) return;
        window.speechSynthesis.cancel();
        settle(false);
      }, SPEECH_START_TIMEOUT_MS, settleCanceled);
      addTimer(pollDone, SPEECH_POLL_MS, settleCanceled);
    });
  });
}


function waitForSpeechVoices(token, timeoutMs = 500) {
  if (!("speechSynthesis" in window) || window.speechSynthesis.getVoices().length) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (typeof window.speechSynthesis.removeEventListener === "function") {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      }
      resolve();
    };
    const handleVoicesChanged = () => {
      if (!isPlaybackToken(token) || window.speechSynthesis.getVoices().length) finish();
    };
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    }
    addTimer(finish, timeoutMs, finish);
  });
}


function selectSpeechVoice(lang) {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const lowerLang = lang.toLowerCase();
  const family = lowerLang.slice(0, 2);
  const candidates = voices.filter((voice) => String(voice.lang || "").toLowerCase().startsWith(family));
  const preferred = lowerLang.startsWith("en")
    ? [/google us english/i, /microsoft (aria|jenny|guy|david|mark|zira).*english/i, /samantha/i, /alex/i, /daniel/i, /karen/i, /en-us/i, /english.*united states/i]
    : [/xiaoxiao/i, /tingting/i, /mei-jia/i, /google.*(普通话|mandarin|chinese)/i, /zh-cn/i, /chinese/i];
  const text = (voice) => `${voice.name || ""} ${voice.lang || ""}`;
  return preferred.map((pattern) => candidates.find((voice) => pattern.test(text(voice)))).find(Boolean) ||
    candidates.find((voice) => String(voice.lang || "").toLowerCase() === lowerLang) ||
    candidates[0] ||
    null;
}


function unlockSpeech() {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}


