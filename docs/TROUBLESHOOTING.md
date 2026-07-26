# 故障排查手册

## 用户先做什么

1. 不清除浏览器站点数据，不卸载浏览器。
2. 在设置页查看“云同步”状态卡。
3. 先导出“排查包”；怀疑本地存储问题时再导出“完整本地备份”。
4. 排查包自动脱敏 PAT；完整备份可能包含 PAT，只能自己保管。

## 中国大陆/VPN网络问题

程序读取公开 Gist 的顺序是匿名 GET → 匿名 JSONP → 必要时认证 GET。匿名请求不携带 PAT，也不使用会额外触发 CORS 预检的版本头。

检查顺序：

1. 浏览器直接打开 `https://api.github.com/gists/<GIST_ID>`；
2. 查看排查包中的 `lastErrorStage`、`lastErrorTransport` 和 `lastErrorHttpStatus`；
3. 匿名 GET 失败但 JSONP 成功，说明普通 fetch 链路受限，程序仍可只读；
4. 两者都失败，说明当前网络无法到达 GitHub API，换节点/网络后等待自动重试；
5. 读取成功但 PATCH 失败，通常是认证跨域预检、PAT 权限、代理或 GitHub 写入链路问题。本地学习不受影响。

VPN“已开启”不等于浏览器到 `api.github.com` 的 GET、OPTIONS、PATCH 都走同一可用链路。不要连续点击立即同步制造重试和限流。

## 状态判断

- **本地已保存，等待上传**：数据已在本机，等待自动重试。
- **云端暂不可用**：查看下次重试时间和失败阶段。
- **写入待确认**：不要反复点击；下一轮先回读确认。
- **只读/不可写**：更新具备 Gist 写权限的 PAT。
- **云端已保存**：只在远端哈希验证成功后出现。

## 关键诊断字段

- `lastErrorKind`：逻辑分类，如 `remote_get_failed`、`rate_limited`、`patch_result_unknown`、`payload_too_large`。
- `lastErrorStage`：如 `gist_metadata_anonymous`、`gist_jsonp`、`patch`、`verify_recheck`、`local_apply_transaction`。
- `lastErrorTransport`：`anonymous_fetch`、`jsonp`、`authenticated_fetch`。
- `lastErrorHttpStatus=0`：浏览器未获得 HTTP 响应，通常是网络、超时、代理或跨域链路失败，不是 GitHub 返回 401/403。
- `baseRemoteHash` 与 `localPayloadHash`：不同表示仍有待上传变化。

## 常见错误

### `remote_get_failed` / HTTP 0

匿名 GET 和 JSONP 均失败后进入退避。学习数据仍在本地。换网络或 VPN 节点后等待重试，不要清除站点数据。

### `auth_failed` / 401、403

PAT 失效、权限不足或 GitHub 拒绝认证。更新 PAT 后“测试并保存”。

### `rate_limited`

等待状态卡中的重试时间；程序会服从 GitHub 返回的限流时间。

### `patch_result_unknown`

PATCH 可能成功但响应丢失。程序将回读哈希；不能直接当失败重复覆盖。

### `payload_too_large`

紧凑 `sync.json` 已超过 900 KiB。先导出完整备份和排查包；维护者应检查异常膨胀字段，不能直接取消保护上限。

### `local_storage_write_failed` / `local_apply_verify_failed`

远端事务会自动回滚到写入前状态并保留覆盖前备份。若提示 `localRecoveryRequired`，立即停止修改，打开 `rescue.html` 导出和恢复。

### `local_rollback_failed`

本地事务回滚未能恢复到事务前哈希。程序会保留硬恢复锁，不会仅因当前数据非空而继续同步。立即导出排查包和完整备份，使用 `rescue.html` 选择明确的覆盖前/有效备份恢复。

### `local_storage_corrupt`

关键业务 localStorage JSON 无法解析或根结构异常。原始文本已保存到 `vocab_machine_corrupt_storage:*`，并随救援导出保留。不要继续手动同步；先导出，再使用 `rescue.html` 恢复。

### 主程序无法打开

打开同域名 `rescue.html`：扫描候选 → 下载脱敏诊断 → 下载完整备份 → 恢复。恢复失败会尝试回滚，并清除旧哈希基线让主程序重新计算。

## 维护者复现

1. 记录版本、Build ID、浏览器、网络/VPN节点。
2. 按 `requestId/runId` 串联 `sync:start → remote transport → decision → patch/verify → sync:complete`。
3. 必须覆盖两设备从同一旧远端并发写入、PATCH 响应丢失和 localStorage 中途失败。
4. 修复后运行 `npm run build && npm test`，更新审查报告、测试结果和发布清单。
