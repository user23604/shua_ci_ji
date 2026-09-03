# 英文读音系统

版本：`2026-07-27-final-audio-v5`

## 播放优先级

每个英文单词按以下顺序处理：

1. `assets/audio/en-us/manifest.json` 指向的同源离线音频；
2. 浏览器 `CacheStorage` 中已经缓存的标准美式词典录音；
3. 在线获取标准美式词典录音并立即写入独立音频缓存；
4. 上述方式失败时，才使用设备自带的 `speechSynthesis`。

这样可以消除“不同设备选到不同系统语音”的主要差异。完全离线且所有设备读音完全一致，需要生成并部署同源音频包。

## 日常使用

- “优先标准美式音频”默认开启。
- 进入刷词后会预取当前词和后续少量单词，不会一次下载全部 4515 个唯一单词。
- 设置页点击“缓存当前 Unit 读音”，可把当前 Unit 可获取的音频提前保存到当前浏览器。
- 点击“清理读音缓存”只删除读音缓存，不影响学习进度、归档标记或同步数据。
- VPN、网络或音频源瞬时失败时，该词只进入短暂冷却，稍后会自动重试；不会在整次会话中永久禁用。

## 生成完整同源音频包

脚本会扫描三份 CSV，共识别 4515 个唯一单词，并生成浏览器可直接读取的 `manifest.json`。

### 方案 A：标准美式词典录音

```bash
python3 tools/build_pronunciation_pack.py --provider dictionary --workers 4
```

Windows 可使用：

```powershell
py tools/build_pronunciation_pack.py --provider dictionary --workers 4
```

该方式不需要额外 Python 包。它会断点续传，已有有效文件不会重复下载。失败词记录在 `assets/audio/en-us/missing.json`。

### 方案 B：固定为同一个 Piper 美式声线

先准备 Piper 可执行文件、一个明确允许使用的 `en_US` 模型和 `ffmpeg`，然后执行：

```bash
python3 tools/build_pronunciation_pack.py \
  --provider piper \
  --piper-bin /path/to/piper \
  --piper-model /path/to/en_US-model.onnx \
  --ffmpeg-bin /path/to/ffmpeg
```

Piper 模式会对全部单词使用同一个模型，设备之间音色和重音最一致。脚本输出单声道 24 kHz、48 kbps MP3，以兼顾体积和浏览器兼容性。

### 只检查，不生成

```bash
python3 tools/build_pronunciation_pack.py --check
```

### 小规模试生成

```bash
python3 tools/build_pronunciation_pack.py --provider dictionary --limit 20
```

## 部署要求

生成后必须连同以下目录完整部署：

```text
assets/audio/en-us/manifest.json
assets/audio/en-us/files/
```

不要把音频转成 Base64 塞进 JavaScript 或 HTML。独立文件才能按需加载、由 Service Worker 缓存，并避免主程序包膨胀。

## 授权边界

- 在线词典录音及其底层媒体可能逐文件采用不同授权；公开重新分发完整离线包前，应核对对应来源和署名要求。
- Piper 模型也有独立许可证；只能使用许可范围满足部署需求的模型。
- 当前代码包不内置第三方录音或模型，因此不会把未经核对的音频直接混入发布 ZIP。
