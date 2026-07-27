"use strict";

function updatePronunciationStatusText(text) {
  state.pronunciationCacheStatus = String(text || "");
  const status = document.getElementById("pronunciationAudioStatus");
  if (status) status.textContent = state.pronunciationCacheStatus || pronunciationAudioStatusText();
}

function bindPronunciationSettingsEvents() {
  const preferStandardAudio = document.getElementById("preferStandardAudio");
  const cachePronunciationUnitBtn = document.getElementById("cachePronunciationUnitBtn");
  const clearPronunciationCacheBtn = document.getElementById("clearPronunciationCacheBtn");

  if (preferStandardAudio) {
    preferStandardAudio.addEventListener("change", function() {
      state.settings.preferStandardAudio = preferStandardAudio.checked;
      state.pronunciationCacheStatus = "";
      persistSettings();
      if (preferStandardAudio.checked && typeof primePronunciationForCurrentStudy === "function") {
        primePronunciationForCurrentStudy();
      }
      const status = document.getElementById("pronunciationAudioStatus");
      if (status) status.textContent = pronunciationAudioStatusText();
      if (cachePronunciationUnitBtn) cachePronunciationUnitBtn.disabled = !preferStandardAudio.checked;
    });
  }

  if (cachePronunciationUnitBtn) {
    cachePronunciationUnitBtn.addEventListener("click", function() {
      cachePronunciationUnitBtn.disabled = true;
      updatePronunciationStatusText("正在缓存当前 Unit 读音…");
      Promise.resolve(cacheCurrentUnitPronunciation(function(progress) {
        updatePronunciationStatusText(`正在缓存：${progress.completed}/${progress.total}，成功 ${progress.cached}`);
      })).then(function(result) {
        updatePronunciationStatusText(`当前 Unit 缓存完成：成功 ${result.cached}/${result.completed}；缺失词会自动回退设备语音。`);
      }).catch(function(error) {
        updatePronunciationStatusText("读音缓存未完成：" + String(error && error.message || error || "网络不可用"));
      }).finally(function() {
        cachePronunciationUnitBtn.disabled = state.settings.preferStandardAudio === false;
      });
    });
  }

  if (clearPronunciationCacheBtn) {
    clearPronunciationCacheBtn.addEventListener("click", function() {
      clearPronunciationCacheBtn.disabled = true;
      Promise.resolve(clearPronunciationAudioCache()).then(function() {
        updatePronunciationStatusText("读音缓存已清理；下次播放会重新获取。");
      }).catch(function(error) {
        updatePronunciationStatusText("清理失败：" + String(error && error.message || error || "未知错误"));
      }).finally(function() {
        clearPronunciationCacheBtn.disabled = false;
      });
    });
  }
}
