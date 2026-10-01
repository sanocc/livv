# LIVV OTA V1

携程移动端真实酒店市场采集：OTA创建任务 → API → 已批准Chrome Helper → 携程 → API → D1 → 市场快照与可解释建议。

目录：api/、ota/、livvcc/、helper/、docs/、tests/、scripts/。不开发ops。

Node >=24，npm ci；npm test；npm run check。三个Worker使用Wrangler独立构建，helper为Chrome MV3解压扩展。

- api.livv.cc / livv-api：唯一数据库入口、设备鉴权、任务、调度、观察、分析。
- ota.livv.cc / livv-ota：市场/任务/酒店/设备，转交人类Access JWT。
- livv.cc / livv-livvcc：公开入口，不访问业务数据库。
- helper/：设备凭证由本机生成，待管理员批准后接单。

实际配置与验收状态见docs/deployment.md、docs/testing.md。生产数据只能来自真实浏览器DOM，单元测试使用内存SQLite，不连接生产D1。

完整设计依据见docs/architecture.md；Schema见docs/database.md；接口见docs/api.md。

当前交接节点：Gate H真实验收通过（三家详情3/3，共13种房型，3项明确已订完）。Gate I市场展示、Gate J自动计划代码验收通过（27项自动测试）；线上展示与生产计划验收见docs/testing.md。云端开发从新仓库main继续；真实Chrome Helper验收仍需有扩展运行能力的电脑。
