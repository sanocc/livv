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

## 真实链路与云端核验

代码提交 2c4b0a30b6a86edd26accf4fc02854f616efcbb9 已推送 main；五个 Worker 在 01:40:46～53 UTC 自动部署。五个 Git Builds 连接指向 sanocc/poai，使用现有通用构建令牌，原构建命令和监视路径保留。70/70 自动测试与语法检查通过；当前 HEAD 内容、文件名及发布包旧品牌扫描 0。

Mac 1.3.2 在新 D1 完成五次 30 家真实采集，成功执行耗时 27.777、28.744、28.602、29.276、34.423 秒。前三项已核验 30 个唯一 Hotel ID、rank 1～30、价格非缺失、任务城市/日期/关键词与 FAST_NAV_VERIFIED。一次操作人员误导航造成的 FAILED 与之后一项 22 家 PARTIAL 原样保存，详见 testing.md。

OTA 经批准清除仅本网站旧会话、重新通过新团队域登录后，市场 30 家、价格曲线、设备心跳及云端日志均正常。API /health 正常；主站、OPS 与 AI 入口 HTTPS 正常。OPS 保持本机文件分析；AI 保持基础入口，未连接模型。没有扩大采集字段或修改生产市场统计、Plan 频率、携程 DOM 逻辑。

Access 应用 POAI OTA，五条相关策略、六项用户令牌和三个服务令牌均已改名，访问规则/Client ID/密钥值保留。服务令牌编辑界面自动续期一年，从原 2027-09-27 到期变为 2027-10-02 到期；此副作用明确记录，没有宣称到期日不变。

旧遥测原始 CSV 已私密归档：175 条物理记录、44 列、权重合计 210 条事件，原时间与采样权重未修改；不将旧日志重新写成当前发生事件。SHA256 为 dce58b777e14e638f63d96eb93a5900a7c0115d501b3937b702b95b23754b10b。新数据集为 agent_events，已经有真实写入。

完整新链路和历史数据读取通过后，原数据库已删除。原路径 Chrome 扩展已获用户即时确认后移除，仅新 1.3.2 扩展启用。旧域名仅保留注册，DNS 0 条、Worker 路由 0 条，不承担正式业务。两条离线隧道改为 poai-api-archive / poai-hotel-api-archive，UUID 与原配置保留；没有删除未完全确认引用的归档资源。

## 尚待清理与验收

Windows 新版本最终真机验收 PENDING，不能据 Mac 验收声称跨平台 PASS。

历史 Analytics 数据集已停写并导出，但管理 UI 仅提供浏览/复制绑定，没有改名或删除入口；不能因此报告全账户旧资源数量为 0。两项旧名称 Build Token 缓存已不用于五项正式构建，需要专用 Builds 管理权限删除；目前 OAuth 403。账户全量残留清理尚未 PASS，正式链路已使用 POAI Worker、数据库、域名和新 Agent。
