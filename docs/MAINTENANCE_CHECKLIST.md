# 维护与发布检查清单

## 修改前

- [ ] 保存当前生产 ZIP、Gist revision、手机/平板本地备份。
- [ ] 明确用户行为和数据兼容边界。
- [ ] 搜索函数调用、存储键和测试，不凭行数或名称删除代码。
- [ ] 阅读 `ARCHITECTURE_DECISIONS.md` 与 `SYNC_DESIGN.md`。

## 代码规则

- [ ] 修改 `assets/js/*.js` 后运行 `npm run build`，不手工修改 bundle。
- [ ] 受审核心源码模块保持单一职责，原则上不超过 500 行；生成 bundle 除外。
- [ ] 新增关键 localStorage 写入必须检查结果；多键写入必须有事务/回滚策略。
- [ ] 本地有业务数据且远端变化时必须合并，禁止 clean-local 直接 Pull。
- [ ] 新增远端请求必须有超时、阶段、传输方式、HTTP 状态和脱敏日志。
- [ ] 匿名 GET 不携带 PAT，不随意添加会触发预检的自定义头。
- [ ] 自动同步不得使用 `bypassBackoff: true`；隐藏/关闭页面不得启动远端请求。
- [ ] 任何 clean/绿色状态必须来自远端确认。
- [ ] PAT 不进入 URL、日志、诊断包、异常文本或仓库。
- [ ] 不改变 `sync.json` 语义而缺少迁移、回滚和并发测试。

## 必跑自动测试

```bash
npm run build
npm test
```

另执行：JavaScript 语法扫描、全局函数重复扫描、版本一致性、manifest 哈希和 ZIP 完整性检查。

## 必做真机场景

- [ ] 中国大陆移动/宽带：不开 VPN、开启至少两个 VPN 节点分别测试匿名读和 PATCH。
- [ ] 手机学习后平板继续，反向再测一次。
- [ ] 两设备从同一远端版本分别修改不同标记后连续上传，确认两边记录最终都保留。
- [ ] 同一单词相反标记，确认较新操作胜出。
- [ ] 断网学习、恢复网络、切后台、强制关闭后重开。
- [ ] PAT 失效、Gist ID 错误、403/404/429/5xx。
- [ ] PATCH 发出后断网，确认进入“写入待确认”。
- [ ] 同一浏览器两个标签页。
- [ ] localStorage 配额不足/被禁用，确认远端应用回滚。
- [ ] Service Worker 旧版升级、服务器 5xx 和离线启动。
- [ ] `rescue.html` 完整备份、脱敏包、恢复和回滚。

## 发布

- [ ] 版本号在 env、loader、SW、HTML/CSS 参数和 `version.json` 一致。
- [ ] `sw.js` APP_SHELL 每个文件真实存在，安装原子化。
- [ ] bundle 与源码一致。
- [ ] ZIP 不包含 `.git`、临时文件、PAT、用户日志或用户备份。
- [ ] 更新 `CHANGELOG.md`、`FINAL_AUDIT_REPORT.md`、`FINAL_RELEASE_REPORT.md`、`TEST_RESULTS.txt`、`RELEASE_MANIFEST.json`。

- [ ] 自动同步关闭时，任何非用户强制原因都不得读取或写入 Gist；本地存储、快照和导出必须继续可用。
- [ ] 手动同步必须继续使用安全合并和写后验证，不得实现为直接覆盖远端。
- [ ] 设置页启动状态不得通过 `renderSetup()` 全量重绘，避免滚动位置重置。
