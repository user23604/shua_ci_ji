# 模块职责图

本文档以 `2026-09-02-round-archive-v2` 为准。实际加载顺序以 `app.js` 为唯一事实来源。

## 启动与基础层

| 文件 | 职责 |
|---|---|
| `app.js` | 优先加载生产 bundle；失败时按顺序回退源码模块；区分启动致命错误与启动后非致命错误。 |
| `tools/build_bundle.js` | 按 `app.js` 的模块顺序生成/校验 `assets/js/app.bundle.js`。 |
| `00-env.js` | 版本、存储键、同步时间参数和传输上限。 |
| `01-utils-basic.js` | 通用类型、时间、哈希、转义和格式化工具。 |
| `02-storage-basic.js` | localStorage 安全读写、配额清理和写入失败提示。 |
| `03-domain-defaults.js` | 设置、同步元数据和同步状态默认结构。 |
| `04-state.js` | 页面会话内状态。 |

## 本地业务数据层

| 文件 | 职责 |
|---|---|
| `05a-storage-progress.js` | 正常/重难点进度、持久游标、pending 重建。 |
| `05b-storage-marks.js` | 已知/未知标记、`markStates`、逻辑递增时间戳。 |
| `05c-storage-activity.js` | 学习活动草稿、每日活动、Unit 完成统计。 |
| `05d-storage-settings.js` | 本机设置、云配置、syncMeta、业务修订号。 |
| `05e-round-archive-storage.js` | 学习轮次、历史归档快照、归档事务、当前轮重置与跨轮防复活语义。 |

所有关键保存函数必须返回并检查结果；失败时不得清 pending、标记 clean 或显示已保存。

## 学习功能层

| 文件 | 职责 |
|---|---|
| `11-word-data.js` | CSV 词表加载、过滤和索引。 |
| `12-formatting.js` | 词义、统计和界面文本格式化。 |
| `13-activity.js` | 当前学习会话活动记录。 |
| `14-auth-setup-render.js` | 登录、设置、同步状态和高级诊断渲染。 |
| `15-setup-events.js` | 通用设置交互、云配置验证、备份和排查包导出。 |
| `15a-audio-settings-events.js` | 标准音频开关、当前 Unit 预缓存和读音缓存清理。 |
| `16-study-start.js` | 从设置页建立正常/复盘学习队列。 |
| `16a-study-session.js` | 本地保存并恢复上次刷词队列、当前词和显示状态；启动恢复后固定暂停。 |
| `17-flashcard-render.js` | 单词卡渲染。 |
| `18a-audio-pronunciation.js` | 同源离线音频、词典美音下载、CacheStorage、预取、失败熔断和 HTML Audio 播放。 |
| `18-speech.js` | Web Speech 中文朗读及英文最终兜底、语音状态。 |
| `19-gesture.js` | 点击、滑动等手势。 |
| `20-study-flow.js` | 下一词、暂停、标记、撤销和轮次流程。 |
| `21-archive-stats.js` | 归档抽屉、Unit 强制折叠和统计页面。 |
| `21a-archive-selection.js` | Unit 长按组合刷词、单词长按批量撤销及选择状态机。 |
| `21b-round-archive-ui.js` | 归档当前轮表单、名称/多行备注、历史归档只读列表与摘要。 |
| `31-wake-lock.js` | 屏幕常亮锁。 |

## 同步与恢复层

| 文件 | 职责 |
|---|---|
| `06-sync-runtime.js` | 请求超时、结构化错误、JSONP、跨标签锁和退避基础。 |
| `07-sync-diagnostics-ui.js` | 同步指示器、问题对话框和诊断文本。 |
| `08a-sync-hash-core.js` | 业务哈希、同步哈希状态和基础持久化。 |
| `08b-sync-hash-status.js` | dirty/clean 判定、远端确认状态和状态迁移。 |
| `08c-sync-error-state.js` | 结构化失败记录、恢复要求和错误展示。 |
| `09a-sync-backups.js` | 哈希备份、备份分类和自动恢复。 |
| `09b-sync-scheduler.js` | 学习活动保护、统一自动调度和 heartbeat。 |
| `09c-sync-audit.js` | 本地快照、每日备份和分级审计日志。 |
| `22-sync-payload.js` | `sync.json` 规范化、校验、采集和紧凑传输。 |
| `23-sync-v2-compat.js` | 只读旧 V2/pendingOps 兼容；不产生新操作日志。 |
| `24-sync-remote-api.js` | 匿名 GET、JSONP 回退、必要时认证 GET、raw 读取和错误分类。 |
| `25-sync-status-config.js` | 云配置门禁、只读状态和同步初始化。 |
| `25a-sync-status-core.js` | 唯一同步状态计算。 |
| `26-sync-apply.js` | 远端数据事务式应用、覆盖前备份、写后校验和失败回滚。 |
| `27a-sync-active-study-guard.js` | 学习过程中的自动同步延迟规则。 |
| `27b-sync-decision.js` | 根据本地/远端事实决定 Pull、Push、Merge 或 No-op；远端变化不得盲 Pull 覆盖有数据本地。 |
| `27c-sync-orchestration-helpers.js` | 手动同步暂停、风险字段、只读合并、跨标签锁和编排辅助。 |
| `27-sync-tick.js` | 单轮同步主编排。 |
| `28a-sync-branches.js` | Merge/Push/Pull 的独立分支实现。 |
| `28-sync-push-patch.js` | PATCH 预检、响应丢失确认、紧凑传输、日备份和写后验证。 |
| `29-sync-merge.js` | 多设备确定性合并；同轮按原规则合并，不同轮按 generation 整轮择新并联合并历史归档。 |
| `99-bootstrap.js` | 启动、前后台和网络恢复；初始化完成后设置 ready 门禁。 |

## 离线与恢复页面

| 文件 | 职责 |
|---|---|
| `sw.js` | 原子安装同源程序壳；同源读音文件使用独立 cache-first；GitHub API/raw 完全绕过缓存。 |
| `rescue.html`、`assets/rescue/rescue.js` | 完整备份、脱敏诊断、`markStates` 恢复和失败回滚。 |

## 不应重新引入

- clean 本地遇到远端变化时直接 Pull；
- 自动路径使用 `bypassBackoff: true`；
- `pagehide`/隐藏页面发起 Gist 请求；
- outgoing pendingOps/V2 操作日志；
- 匿名 GET 携带 PAT 或仅为版本号添加会触发预检的自定义头；
- 未确认远端成功就显示绿色；
- 日志、URL、备份或排查包出现明文 PAT。
