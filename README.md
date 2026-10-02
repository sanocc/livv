# POAI

POAI 酒店数据平台。现有采集、任务、映射与历史观察继续保留。

| 产品 | 地址 | 当前能力 |
|---|---|---|
| 主站 | https://poai.cc | 产品官网与 Agent 下载 |
| OTA | https://ota.poai.cc | 携程市场、价格走势、任务、设备与云端诊断 |
| OPS | https://ops.poai.cc | 浏览器本地 CSV / XLSX 经营分析 |
| AI | https://ai.poai.cc | 产品入口；模型与授权动作尚未开放 |
| API | https://api.poai.cc/health | 统一 API、D1、计划与设备日志 |
| Agent | 主站下载 | POAI 酒店助手 1.3.4，Chrome MV3 / Side Panel |

目录：site/、ota/、ops/、ai/、api/、agent/、docs/、tests/、scripts/。
Node >=24；npm ci；npm test；npm run check。
部署：npm run deploy:api / deploy:ota / deploy:site / deploy:ops / deploy:ai。

API 为唯一数据库入口；OTA 经 Service Binding 读取。生产数据来自真实浏览器 DOM，缺失数据不插值、不补零。单设备单任务，现有正式 14 天 Plan 继续启用。历史 PARTIAL / FAILED 保持真实。

当前迁移进度与限制见 [迁移记录](docs/poai-migration.md)，验收证据见 [测试记录](docs/testing.md)。架构、接口、数据库与部署分别见 docs/architecture.md、docs/api.md、docs/database.md、docs/deployment.md。
