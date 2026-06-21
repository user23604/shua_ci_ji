# 刷词机模块说明

## 启动方式

```
index.html → app.js loader → assets/js/00~31-*.js → 99-bootstrap.js → init()
```

1. `index.html` 加载 8 个 CSS 文件和 `app.js`
2. `app.js` 是小型加载器，按顺序动态创建 `<script>` 标签加载 `assets/js/` 下 36 个 JS 文件
3. `99-bootstrap.js` 最后加载，定义并调用 `init()` 启动应用
4. 所有 JS 文件共享全局作用域（经典 script，非 ES Modules）

## JS 文件职责

### 00-env.js
全局版本号、所有 localStorage key 常量、同步超时/间隔常量、TAB_ID。
**只放常量，不放业务函数。**

### 01-utils-basic.js
通用工具函数：clamp、escapeHtml、cloneJson、stableStringify、dateMs、formatDuration、clearTimers/addTimer 等。
**与业务逻辑无关的纯工具函数。**

### 02-storage-basic.js
localStorage 基础读写：loadJson、saveJson、safeLocalStorageSet、safeSetLocalStorage、Quota 处理。

### 03-domain-defaults.js
项目默认配置与常量：PLAYBACK_RATE_*、SPEECH_*、SHANGUO_BOOK_ID、SYNC_STATUS_LABELS、BOOKS、DEFAULT_SETTINGS、DEFAULT_SYNC_META、DEFAULT_HASH_SYNC_STATE 等。

### 04-state.js
DOM 根节点 `app`、全局 `state` 对象、`createGroupStats()`。
**state 初始化依赖 02 和 03 已加载。**

### 05-storage-domain.js
业务数据 key 生成与读写：progressKey、marksKey、loadProgress、saveProgress、loadMarks、saveMarks 等。
书籍/设置管理：currentBook、persistSettings、normalizeSettings 等。

### 06-sync-runtime.js
同步运行时保护：fetchWithTimeout、isStaleSyncRun、跨标签锁、markSyncProgress、backoffDelayForFailure 等。
**不放 Gist API 业务逻辑。**

### 07-sync-diagnostics-ui.js
同步诊断 UI：showSyncFailureBanner、buildSyncDiagnosisText、showSyncProblemDialog、renderSyncIndicator、formatSyncTime、setSyncStatus、updateSyncIndicator、renderVersionBadge 等。

### 08-sync-hash-state.js
Hash 同步状态管理：ensureSyncMeta、pendingOps、ensureHashSyncState、businessPayloadHash、currentSyncFacts、setHashSyncStatus、recordHashSyncFailure、migrateHashSyncStateIfNeeded 等。
**同步状态机核心文件之一。** 文件较大（~500行），后续可进一步拆分。

### 09-sync-backup-recovery.js
本地备份与恢复：loadHashBackupIndex、writeHashBackup、writeDailyHashBackups、collectBackupCandidates、classifyBackupCandidate、tryRestoreFromBackupIfPayloadEmpty、writeLocalSnapshot、appendAuditEvent 等。

### 10-version-service.js
版本检测与 Service Worker 注册：checkServerVersion、startVersionChecks、registerServiceWorker。

### 11-word-data.js
词库加载与 CSV 解析：ensureWords、parseCsv、mapWords、primeSetupBookData、buildStudyUnitWords、unknownWordsForScope 等。

### 12-formatting.js
释义格式化与文本高亮：formatDefinition、splitDefinitionLines、renderDefinitionHtml、highlightTerms 等。

### 13-activity.js
学习统计采集：recordStudyActivity、commitCurrentCardActivity、collectActivityStats 等。P14 保留并加固原 13-activity-p10.js 的 active-study activity draft 行为，本文件是唯一 activity 运行逻辑；刷词中 activity 写 draft，不直接进入 cloud business hash。

### 14-auth-setup-render.js
登录页与设置页渲染：renderAuth、renderSetup、renderSyncDiagnostics、renderUnitSelectOptions、radio、toggle、rateRangeControl 等纯渲染函数。

### 15-setup-events.js
设置页事件绑定：testAndSaveCloudConfig、bindSetupEvents、exportLocalBackup、exportDiagnosisSummary 等。

### 16-study-start.js
学习启动：startStudy、startReview、getStartIndex、getStartIndexFromProgress。

### 17-flashcard-render.js
闪卡 UI 渲染：renderFlashcard、renderWordCard、renderCardSwipeControls、scheduleWordTimers、revealZhAfterDelay、setSpeechPhase、clearSpeechPhase、highlightZhByCharIndex 等。

### 18-speech.js
Web Speech 朗读：speakWithHighlight、waitForSpeechVoices、selectSpeechVoice、cancelSpeechOnly、pausePlaybackForBackground、resumePlayback、速率计算、preloadSpeechVoices 等。

### 19-gesture.js
手势操作：bindGesturePanelControls、bindCardGesture、finishPointer、swipeDirectionFromDelta、triggerCardDirection、cardActionFromDirection 等。

### 20-study-flow.js
学习流程控制：markCurrent、undoMark、advanceWord、finishCurrentGroup、goPrevious、renderBreak、continueAfterBreak、renderCurrentView 等。

### 21-archive-stats.js
重难点抽屉与统计抽屉：openArchive、openStats、renderArchiveDrawer、renderStatsDrawer、renderWeekHeatmap、renderMonthHeatmap 等。

### 22-sync-payload.js
同步 Payload 采集与校验：collectSyncPayload、normalizeSyncPayload、validateSyncPayload、sanitizeProgressPayload、isEffectivelyEmptyLocalPayload 等。

### 23-sync-v2-ops.js
V2 Ops 兼容逻辑：buildV2OpsFromLocal、applyPendingOps、applyWordMarkSet、applyProgressSet 等。
**旧兼容代码，不建议新增功能。**

### 24-sync-remote-api.js
Gist 远程 API：fetchGistSyncPayload、fetchGistMetadata、readGistFileContent、parseSyncPayloadContent、classifyGithubResponseError、syncErrorMessage 等。
**空云端保护新增**：currentRemotePayload（统一远端 payload 解析）、remoteHasBusinessPayload（远端是否有业务数据）、remoteIsEmptyPayload（远端是否为空，排除 invalid/v2_unknown_ops）。

### 25-sync-status-config.js
云配置校验与初始化：validateSavedCloudConfig、validateCloudConfigDraft、savedCloudConfigGate、bootstrapSyncAfterInit、initializeP0Sync 等。
**P14 起不再承载 computeSyncStatus。**

### 25a-sync-status-core.js
同步状态唯一计算核心：buildSyncStatusFacts、hasQueuedStudyLocalState、canShowCloudOk、computeSyncStatus。
P14 规则：pending cursor/draft 优先 study_queued；cloud_ok 必须来自 verified push；cloud_loaded 不能显示为绿色保存态。

### 26-sync-apply.js
应用远端 Payload 到本地：applyRemotePayloadSafely、restoreRemotePayloadFromDialog、pullRemotePayload、applySyncPayload、updateLegacyMetaAfterRemote、markHashCleanFromRemote 等。
**pullRemotePayload 兜底守卫**：直接 Pull 前检查 `remoteHasData && !localHasData`，阻断云端空数据或本地非空时的覆盖 Pull。`applyRemotePayloadSafely` 保持通用，不限制 merge/backup/rescue 使用。

### 27a-sync-active-study-guard.js
Active study 统一守卫：getActiveStudyFacts、shouldDeferForActiveStudy、shouldAbortAutoPatchForActiveStudy、activeStudyDelayRemainingMs。
自动播放、朗读、timer、pointer、transition、idle window 都在这里统一判断，避免刷词中误 PATCH。

### 27b-sync-decision.js
同步决策诊断：decideSyncAction、appendSyncDecisionAudit。
把 A/B/C/D 同步分支记录为结构化 decision，便于从 audit log 直接判断为什么 pull/push/merge/noop。

### 27-sync-tick.js
**同步唯一入口 syncTick。** 所有同步操作必须通过此文件调度。
**空云端保护决策树**（A/B/C/D 四分支）：A. 本地非空+云端空→阻止Pull/尝试Push；B. 本地空+云端空→local_only；C. 本地空+云端非空→Pull后hash校验；D. 本地非空+云端非空→safe merge。
新增辅助函数：makeSyncRiskProblemFields（构建风险诊断字段）、syncRiskTechnicalText（格式化诊断文本）、markReadOnlyDirtyState（只读脏状态管理）、syncBranchReadOnlyMergeLocal（只读本地合并，不改baseRemoteHash，不Push）。
**不要绕过 syncTick 直接调用其他同步函数。**

### 28-sync-push-patch.js
上传 PATCH 与校验：syncBranchPushLocal、syncBranchMerge、buildSyncEnvelope、patchBusinessPayloadToGist、finalizeVerifiedPatch、verifyRemoteContentAfterPatch 等。
patchBusinessPayloadToGist 所有失败路径均通过 recordHashSyncFailure({dialog:true}) 弹窗，确保 Push/PATCH 失败用户可见。

### 29-sync-merge.js
自动合并逻辑：safeMergePayloads、chooseFurtherProgress、mergeUnknownProgress、mergeMarksLocalPriority、mergeActivity、mergeUnitStats。

### 30-sync-legacy-compat.js
已废弃但保留的旧同步兼容函数（大部分为 stub，throw deprecated）：
runGistSync、patchGistFiles、patchGistFilesV2、createRemoteSyncJson、pushPayloadWithBackup、markSyncedWithRemote、enterSafeConflictMode、enterSyncInfoMode、scheduleAutoPush、schedulePeriodicPush、shouldAttemptAutoPush。
**不建议新增代码，后续可安全删除。**

### 31-wake-lock.js
屏幕常亮：requestWakeLock、releaseWakeLock。

### 99-bootstrap.js
**仅放 init() 定义和 init() 调用。**
init() 负责初始化同步状态、注册 SW、启动心跳、绑定全局事件、渲染初始页面。
**不放其他业务函数。**

## CSS 文件职责

| 文件 | 职责 |
|---|---|
| `00-tokens.css` | `:root` CSS 变量 + 暗色模式 `@media` 覆盖 |
| `01-base.css` | reset、html/body、button/input/select 基础、`.app-shell`、`.view` |
| `02-components.css` | 通用组件：btn、input、select、status、settings-panel、control-*、range、radio、toggle |
| `03-auth-setup.css` | 登录页/设置页布局：auth-view、auth-panel、auth-form、setup-view、setup-grid、sync-grid |
| `04-flashcard.css` | 刷卡界面：flash-view、word-card、swipe-edges、tap-zones、gesture-panel、朗读高亮、卡片动画 |
| `05-drawers-stats.css` | 休息页、抽屉、热力图、重难点列表 |
| `06-sync-version-dialog.css` | 同步指示灯、版本角标、同步错误弹窗 |
| `07-responsive.css` | 布局响应式媒体查询（width/orientation/height 断点） |

## 同步相关文件索引

修同步时重点看这些文件：

```
06-sync-runtime.js          — 运行时保护（超时、锁、退避）
07-sync-diagnostics-ui.js   — 同步诊断弹窗/横幅（含 buildSyncDiagnosisText 风险字段）
08-sync-hash-state.js       — 同步状态机（hash、dirty、recovery lock、recordHashSyncFailure 弹窗）
09-sync-backup-recovery.js  — 本地备份与恢复
22-sync-payload.js          — Payload 采集/校验/清理
23-sync-v2-ops.js           — V2 Ops 兼容（只读不改）
24-sync-remote-api.js       — Gist 读取/解析（含 remoteIsEmptyPayload / remoteHasBusinessPayload 空云端判断）
25-sync-status-config.js    — 同步状态计算/配置校验（含 setReadOnlySyncState）
26-sync-apply.js            — 应用远端数据到本地（pullRemotePayload 含兜底守卫）
27-sync-tick.js             — **唯一同步入口**（syncTick 四分支决策树 + makeSyncRiskProblemFields）
28-sync-push-patch.js       — PATCH 上传与校验（syncBranchPushLocal / syncBranchMerge）
29-sync-merge.js            — 自动合并（safeMergePayloads）
30-sync-legacy-compat.js    — 废弃兼容（不建议改）
```

## UI 相关文件索引

修 UI 时重点看这些文件：

```
14-auth-setup-render.js  — 登录/设置页渲染
15-setup-events.js       — 设置页事件
16-study-start.js        — 学习启动
17-flashcard-render.js   — 闪卡渲染
18-speech.js             — 朗读
19-gesture.js            — 手势
20-study-flow.js         — 学习流程
21-archive-stats.js      — 抽屉/统计/热力图
```

## 重要约束

- **不要绕过 syncTick**：27-sync-tick.js 是唯一同步入口。
- **不要在 UI 文件里直接 PATCH Gist**：上传操作只能通过 28-sync-push-patch.js。
- **rescue.html 独立**：不依赖主应用 `assets/js/*.js`。
- **不要改 localStorage key**：所有 key 定义在 00-env.js。
- **不要改 DOM id/class**：影响 CSS 和 JS 选择器。
- **99-bootstrap.js 只放 init()**：不要塞其他函数进去。
- **空云端保护铁律**：云端合法空 payload 不能自动覆盖本地非空学习数据。`remote.kind === "missing"` 按云端空处理（非错误），仅真正 HTTP 错误（401/403/404/网络失败/超时）才报错。
- **同步异常必须弹窗**：任何同步失败/异常/风险/阻断/Pull被阻止/Push被阻止/版本不一致/超时都必须弹持久窗（非自动消失），弹窗包含完整诊断字段。同步成功/无需同步/本地云端都空不弹窗。

## 后续新增功能建议

- 通用工具 → `01-utils-basic.js`
- 新 UI 组件 → 新建 `assets/js/` 文件，在 loader 中按依赖顺序插入
- 新同步逻辑 → 新建文件，通过 `27-sync-tick.js` 调度
- 新设置项 → 在 `03-domain-defaults.js` 加默认值，在 `14/15` 加 UI

## 已知问题

| 问题 | 说明 |
|---|---|
| `migrateSyncMetaIfNeeded` 旧兼容函数 | 保留在 `30-sync-legacy-compat.js`；`08-sync-hash-state.js` 里的是 `migrateHashSyncStateIfNeeded`，两者不是同一个函数。 |
| 部分 sync 文件仍较大 | P14 已将 sync status 与 active-study guard / decision helper 拆为独立模块；08-sync-hash-state.js 仍较大，后续可继续无行为拆分。 |
