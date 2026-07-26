# 刷词机（最终稳定版）

纯静态考研词汇刷词网页，部署于 GitHub Pages。学习数据先写入浏览器本地存储，再通过一个 GitHub Gist 的 `sync.json` 在手机、平板和电脑之间同步。

当前版本：`2026-07-26-final-stable-v3`

## 本版原则

- 保持一个用户、一个 Gist、一个 `sync.json`，不改变手机和平板顺序切换的使用方式。
- 所有学习动作先落本地；云端不可用时仍可刷词、导出和恢复。
- 公开 Gist 读取使用匿名 GET → 匿名 JSONP → 必要时认证 GET；写入使用认证 PATCH。
- PATCH 前重读、写后验证；响应丢失先回读确认，不盲目重复覆盖。
- 远端变化且本地有业务数据时先确定性合并，不直接 Pull 覆盖。
- 云端数据写入本地使用事务、覆盖前备份和写后哈希校验；回滚失败会进入硬恢复保护。
- 权威本地 JSON 损坏时隔离原始文本并阻断云同步，避免将空数据或混合数据上传。
- 自动同步串行、服从持久退避，隐藏/关闭页面不启动远端事务。
- 设置页和右上角均以文字显示同步状态；排查包自动脱敏 PAT。

## 使用边界

手机和平板按顺序使用时，进度、标记和统计可正常衔接。用户已确认不会同时在两台设备学习，因此活动时长、次数和 Unit 完成数继续采用幂等 `max` 合并，不为并发统计引入事件日志或 CRDT。切换设备前应等待“云端已保存”；未成功时，新设备不会凭空取得另一设备尚未上传的数据。

纯前端不能保证任意中国大陆网络或 VPN 节点都可访问 GitHub。只要 VPN/代理实际接管浏览器到 `api.github.com`（以及必要时 `gist.githubusercontent.com`）的 GET、OPTIONS 和 PATCH，当前代码路径可正常读写；外部链路失败时不会再被放大为数据覆盖、无限重试或无法刷词。

## 目录

- `index.html`：主页面入口。
- `app.js`：生产加载器；优先加载 `assets/js/app.bundle.js`，失败时回退源码模块。
- `assets/js/*.js`：可维护源码模块。
- `assets/js/app.bundle.js`：由 `npm run build` 生成，不应手工编辑。
- `sw.js`：离线程序壳；GitHub API/raw 请求绕过缓存。
- `rescue.html`：独立救援页，支持完整备份、脱敏诊断和明确备份恢复。
- `FINAL_AUDIT_REPORT.md`：最终问题、修复、验证和残余边界。
- `docs/`：架构、同步规则、排查和发布文档。

## 开发与发布

修改任一 `assets/js/*.js` 后执行：

```bash
npm run build
npm test
```

发布时完整上传本目录。版本号须在 `00-env.js`、`app.js`、`sw.js`、HTML/CSS 资源参数和 `version.json` 中一致；随后重新生成 bundle、测试记录和 `RELEASE_MANIFEST.json`。
