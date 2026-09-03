# 同步设计与不变量

## 业务不变量

1. 学习动作必须先写本地。
2. 本地写入失败必须明显报错，不能继续显示已保存。
3. 本地有数据、云端为空时，禁止 Pull 空数据覆盖本地。
4. 本地和远端都有数据且远端变化时，必须确定性合并，不得因本地 clean 而直接覆盖。
5. 覆盖本地前必须创建 `pre_overwrite` 备份；备份失败则停止。
6. 云端数据落本地必须是事务；任一写入或校验失败必须回滚。
7. 任意时刻每个标签页最多一轮同步、最多一个 PATCH；多标签页优先 Web Locks，回退本地租约锁。
8. 自动请求服从 `nextRetryAt`；只有明确用户操作或刚保存配置可立即尝试一次。
9. 页面隐藏、关闭时只刷新本地游标、草稿、快照和日志。
10. `markStates` tombstone 是当前轮业务数据，备份、精简和恢复不得删除。
11. `round.generation` 是跨轮边界：不同 generation 的当前学习状态不得逐字段合并，较新轮次整套获胜。
12. `archives` 是不可变历史集合；多设备只做按 archive id 的确定性并集，不得因当前轮重置而删除。

## 读取顺序

```text
匿名 GET api.github.com/gists/{id}
  ├─ 成功：使用内联内容；必要时读取 raw_url
  ├─ 网络/超时：匿名 JSONP 回退
  └─ 私有/权限场景：最后尝试带 PAT 的 GET
```

匿名 GET 不携带 PAT。所有浏览器端 Gist 请求都省略 `X-GitHub-Api-Version`：GitHub 当前对省略版本头的请求默认使用 `2022-11-28`，同时避免把额外自定义头加入 CORS 预检。PATCH 仍会因方法、认证和 JSON 内容类型执行必要预检。

## 决策矩阵

| 本地 | 远端 | 动作 |
|---|---|---|
| 无业务数据 | 有有效数据 | 安全 Pull |
| 有业务数据 | 空/缺失 | Push；只读时保留本地 dirty |
| 有业务数据且远端等于基线 | 本地有变化 | Push |
| 有业务数据且远端变化 | 不论本地 dirty 是否为 false | Merge；可写则验证后 PATCH，只读则本地合并并保留 dirty |
| 本地与远端业务 hash 相同 | 任意 | No-op/确认 clean |

## 写入顺序

```text
读取最新远端
→ 比较远端 hash 与决策时 hash
→ 远端变化则重新合并
→ 检查紧凑 sync.json 字节数
→ PATCH
→ 使用响应或再次 GET 验证业务 hash
→ 验证成功后才标记 cloud_ok
```

PATCH 网络错误可能表示“服务端已写入、响应在途中丢失”。程序先回读：相同则确认成功；远端另有变化则重合并；无法读取则进入 `patch_result_unknown`，保留 dirty。

紧凑 `sync.json`（当前轮 + 历史归档）超过 900 KiB 时停止上传并提示诊断。GitHub Gist 元数据对大文件可能只返回截断内容，需要再访问 `raw_url`；在受限网络中，继续扩大同步文件会降低读写确认可靠性。

## 本地事务应用

```text
建立受影响键与内存状态快照
→ 创建 pre_overwrite 备份
→ 写正式业务键
→ 清 pending/保存 syncMeta
→ 重采集业务数据并校验 hash
→ 成功提交；失败则恢复快照
```

回滚本身若失败，设置 `localRecoveryRequired`，提示使用 `rescue.html` 和覆盖前备份。

## 自动调度

自动触发只提交到一个合并调度器：本地变化后的空闲期、启动检查、回到前台、网络恢复和低频 heartbeat。网络失败按约 30 秒、1 分钟、2 分钟、5 分钟、15 分钟、30 分钟退避并持久化；服务器 `Retry-After`/`X-RateLimit-Reset` 优先。

## 多设备合并

- 首先比较学习轮次：generation 更高的一侧整套当前学习状态获胜；generation 相同但 roundId 不同视为并发开新轮，按 startedAt/roundId 确定性择一，绝不把两轮当前状态混在一起。历史 `archives` 始终做确定性并集。
- 只有 roundId 相同才执行以下旧规则。
- 单词标记：按 `updatedAt → seq → clientId` 稳定 LWW；新本地时间推进到已观察最大时间之后。
- 正常/重难点进度：保留更靠后的合法位置。
- Unit 完成次数：取最大值以保持幂等。
- 当日活动：取最大值并合并 `wordIds`；会低估真正的并行独立增量，但不会因重复同步无限累加。

## 状态含义

| 状态 | 含义 |
|---|---|
| `cloud_ok` | 已验证 Push 成功，远端与本地一致。 |
| `cloud_loaded` | 已验证安全 Pull 或等值合并成功。 |
| `dirty` | 本地已保存，等待上传。 |
| `study_queued` | 持久游标/活动草稿等待空闲后同步。 |
| `syncing` | 正在执行单轮同步。 |
| `confirm_pending` | PATCH 结果未知，等待回读确认。 |
| `cloud_unavailable` | 网络或 GitHub 暂不可用，已退避。 |
| `read_only` | PAT 无写权限或失效。 |
| `error/conflict` | 需要用户查看诊断。 |
