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

第一阶段已封板（2026-10-01），生产代码基线208a300dfcfd62e200542835e898f82cefc2028e。Gate A–F、H–J通过；Gate G已完成现用酒店的人工映射与真实采集关联，完整线上修改/解除操作复验仍为已知验收缺口，未冒充PASS。默认14天生产Plan已启用，真实Cron与窗口过期/幂等闭环已验证；Helper维也纳详情入口兼容修复后，两次真实30家任务均COMPLETED、详情3/3、各14种房型。全套30项自动测试通过。历史PARTIAL/FAILED及Gate H的13种房型、3项明确sold_out证据全部保留；临时验收Plan已停用，无遗留验收任务待执行。详细最终状态与封板检查见docs/testing.md、docs/deployment.md。真实Chrome Helper执行仍依赖在线、已批准且具备扩展运行能力的电脑。
