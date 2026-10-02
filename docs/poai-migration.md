# POAI 全量迁移记录

2026-10-02；起始代码基线 c54d024a06f44b6eb27eaf9dd2a9f2432c63c603。当前记录是进行中的实际进度，尚非最终验收 PASS。

## 已完成

GitHub 仓库已改名为 sanocc/poai，本地目录已移至 /Users/san/Github/poai。site/ 与 agent/ 分别承载主站和本地执行端。

五个 Worker 已为 poai-site、poai-api、poai-ota、poai-ops、poai-ai。前三项通过现有 Worker 原地改名，保留资源 ID、Secrets、域名与 Git Builds。OTA 的 API Service Binding 已确认自动改为 poai-api。

统一正式地址为 poai.cc、ota.poai.cc、ops.poai.cc、ai.poai.cc、api.poai.cc。API 已部署到新数据库 poai-data，ID 75a2bb2d-ca57-4be9-9eb4-6b389d504c5f。

数据库副本来自原数据库 68cfcb1e-913a-4013-aa9d-5ae27f2a1150 的完整 schema 与逐表数据备份。标准酒店表为 standard_hotels，映射永久 ID 字段为 standard_hotel_id，所有酒店、设备、任务、执行与观察的实际 ID 不变。原不可变约束保留，当前初始化 SQL 使用新命名；此过程为全量复制后的命名迁移，没有对原数据库执行破坏性修改。

切换前 16 表逐行哈希一致、外键错误 0；137 tasks、125 attempts、65 snapshots、1615 market_observations、389 room_observations、2 devices、2 plans。最终同步包含 9 条 agent_logs、583 条 attempt_events。其他表数量见 docs/database.md。私密完整备份、逐表哈希与 schema 证据位于 .local/proofs，不提交凭证或业务备份。

维护窗口经用户明确批准。01:09 UTC 左右暂停 API Cron；01:10:19 UTC 部署完成并恢复 * * * * *。正式 Plan 3963a563-7687-45dc-9b2a-d33cbdd0cd7c 整行保留、enabled=1、horizon=14；临时验收 Plan 仍 disabled。

Agent 版本从 1.3.1 递增到 1.3.2，API 地址为 api.poai.cc，请求头为 X-Device-ID。新设备使用 poai_ 前缀；既有 UUID 无需改名。Mac 从私密 chrome.storage 备份恢复原批准设备身份至新路径扩展；临时离线迁移入口已移除，不产生替代设备。当前扩展 ID nefbadfphcnndlmjemnkmaplajmflmfm，原设备 ID 56d208e8-90cd-49bf-ae84-b17a43d9f1b9。新版本心跳已通过，自动接单已恢复。

## 尚待最终核验

Mac 新数据库完整采集/上传与 OTA 展示；Access 团队技术域、策略名称、Cloudflare 令牌名称、旧 Analytics 历史归档、Git Builds 路径/仓库绑定、云端和 GitHub 全量资源扫描。原数据库与旧扩展暂保留为未删除的迁移证据，在完整真实验收通过前不删除。

Windows 新版本最终真机验收 PENDING，不能据 Mac 验收声称跨平台 PASS。

OPS 保持本机文件分析；AI 保持基础入口，未连接模型。没有扩大采集字段或修改生产市场统计、Plan 频率、携程 DOM 逻辑。
