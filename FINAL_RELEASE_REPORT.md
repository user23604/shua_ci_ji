# 刷词机发布报告

版本：`2026-09-02-round-archive-v2`

## 本次修复

本版直接针对 2026-09-02 Android Edge 实际日志中的同步失败：手动同步已经读取到远端差异，但在应用云端数据前创建 `pre_overwrite` 本地安全备份时写入失败，错误类型为 `local_backup_write_failed`。此前同一设备还出现 `vocab_machine_daily_backup_2026-09-02 exceeded the quota`。

根因不是 GitHub/Gist 网络，而是上一版轮次归档加入后，本地多种安全备份仍保存完整同步 payload，导致同一份历史 `archives` 被 `local snapshot / daily backup / hash backup / pre_* backup` 多次复制，最终耗尽浏览器 localStorage。

## 修复方式

- 历史归档本体仍完整保存在 `vocab_machine_round_archives_v1`，并继续进入 Gist `sync.json`；没有删减用户历史。
- 本地安全备份只保存当前轮恢复数据、round generation 和必要状态，不再复制 `archives`。
- 升级启动时自动压缩上一版遗留的大备份，释放已有重复占用，不要求用户先清站点数据。
- 本地备份保留从“按条数”增加到“按近似字节预算”约束；quota 时先压缩，再淘汰冗余安全副本，绝不删除当前学习数据、真实历史归档、设置或云配置。
- `pre_overwrite` 等关键安全备份仍必须成功后才允许云端数据落地，没有为了让同步通过而取消覆盖前保护。
- 备份索引改为非关键元数据；即使容量压力导致索引无法保存，主程序和 rescue 也会直接扫描实际备份键。
- rescue 从“历史已排除”的紧凑安全备份恢复时会保留现有真实历史归档，不会把 `archives: {}` 写回覆盖历史。

## 验证

- 原 `Round archive regression tests` 全部继续通过，确认归档、重置、generation 防旧数据复活逻辑未回退。
- 新增 `Round archive storage quota regression tests`：构造带大量历史归档的旧版完整备份，把模拟 localStorage 压到只剩极少空间，随后执行 `pre_overwrite`；新版会自动压缩/回收冗余备份并成功创建新的覆盖前安全备份，同时 `ROUND_ARCHIVES_KEY` 原始字节保持完全一致。
- rescue 新增“紧凑备份恢复不得清空历史归档”回归断言。
- 全套 `npm test` 通过，包括同步核心、网络兜底、静态质量、UX、音频、rescue 与三份 CSV 完整性。
