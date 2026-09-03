# 刷词机（最终独立审查版）

纯静态考研词汇刷词网页，部署于 GitHub Pages。学习数据先写入浏览器本地存储，再通过一个 GitHub Gist 的 `sync.json` 在手机、平板和电脑之间同步。

当前版本：`2026-09-02-round-archive-v2`

## 本版结论

- 已登录打开网页后直接恢复上次未完成的卡片与位置，不再先进入设置页；恢复后固定暂停，避免页面打开即朗读或自动翻词。
- 新增“归档当前轮”：填写归档名称和多行备注后，封存整轮学习记录并重置当前学习状态，随后从全新一轮继续刷词。
- 修复归档后 Android/移动浏览器本地容量被重复备份撑满的问题：历史归档只保存一份，本地安全备份不再重复复制全部历史；升级时会自动压缩旧版大备份。
- 历史归档随业务数据同步；round generation 阻止其他设备的旧一轮进度、标记在归档后重新复活。
- 归档已删词库、重难点词库的全部 Unit 默认强制折叠，只显示 Unit 和词数。
- 长按 Unit 可多选并组合刷词；展开后长按单词可多选并批量撤销归档标记，两种选择模式互斥。
- Unit 总结新增“本单元从头再刷一遍”，会包含该 Unit 全部单词。
- 新增“手动显示中文”：开启后中文不再按延迟自动出现，点击卡片中部或右侧才显示。
- 平板滑动采用非线性增益，小幅手势更容易触发，大幅手势移动更明显。
- 英文朗读新增标准音频优先链路：同源离线包 → 本机缓存的标准美式词典录音 → 在线词典录音 → 设备语音兜底。
- 自动预取当前及后续少量单词；设置页可缓存当前 Unit 或清理读音缓存。
- 提供 `tools/build_pronunciation_pack.py`，可下载词典录音，或用一个固定 Piper 美式模型生成完整同源音频包。
- 自动同步开关与手动安全同步保持上一版逻辑；关闭自动同步后仅本地保存，所有自动网络入口继续由中央门禁拦截。
- 保留上一版确定性合并、PATCH 前重读、写后校验、事务式本地应用、覆盖前备份、匿名读取/JSONP 回退、退避和救援恢复。
- 源码继续按职责拆分；生产使用 bundle，源码模块用于审查和回退。

## 网络边界

这版显著降低了中国大陆/VPN环境下“公开 Gist 明明能打开、程序却因认证跨域链路失败而无法读取”的概率。纯前端仍无法绕过运营商、代理、浏览器或网络策略对 `api.github.com` 的完全阻断，尤其写入必须执行带认证的跨域 PATCH；网络失败时，本地学习、保存、导出、恢复、退避和后续重试必须继续正常。

## 目录

- `index.html`：主页面入口。
- `app.js`：生产加载器；优先加载 `assets/js/app.bundle.js`，失败时回退到源码模块。
- `assets/js/*.js`：可维护源码模块。
- `assets/js/app.bundle.js`：由 `npm run build` 生成，不应手工编辑。
- `assets/audio/en-us/`：同源英文音频清单与可选离线音频文件。
- `docs/PRONUNCIATION_AUDIO.md`：读音优先级、缓存、完整音频包生成和部署说明。
- `sw.js`：离线程序壳；GitHub API/raw 请求绕过缓存。
- `rescue.html`：独立本地救援页，支持完整备份、脱敏诊断和回滚恢复。
- `FINAL_AUDIT_REPORT.md`：本轮独立审查、修复证据、测试矩阵和残余边界。
- `docs/`：当前架构、同步规则、排查和发布文档。
- `docs/archive/`：历史 P14 文档，仅用于追溯。

## 开发与发布

修改任一 `assets/js/*.js` 后执行：

```bash
npm run build
npm test
```

检查完整词表音频构建环境：

```bash
python3 tools/build_pronunciation_pack.py --check
```

完整读音包的生成方式见 `docs/PRONUNCIATION_AUDIO.md`。

发布时完整上传本目录。不得遗漏 `assets/`、三个 CSV、`manifest.json`、`sw.js`、`rescue.html`、`version.json` 和生成后的 `assets/js/app.bundle.js`。若已生成离线读音包，还必须完整上传 `assets/audio/en-us/files/`。

发布新版本必须同步修改：

1. `assets/js/00-env.js`；
2. `app.js`；
3. `sw.js`；
4. `index.html`、`rescue.html`、`style.css` 的资源版本；
5. `version.json`；
6. 重新生成 bundle、测试记录和 `RELEASE_MANIFEST.json`。
