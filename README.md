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

第一阶段已封板（2026-10-01），生产代码基线208a300dfcfd62e200542835e898f82cefc2028e。Gate A–F、H–J通过；Gate G封板时保留的线上修改/解除复验缺口，已在V1.1生产稳定化阶段补证PASS（下述历史详情结果仍保留）。默认14天生产Plan已启用，真实Cron与窗口过期/幂等闭环已验证；Helper维也纳详情入口兼容修复后，两次真实30家任务均COMPLETED、详情3/3、各14种房型。全套30项自动测试通过。历史PARTIAL/FAILED及Gate H的13种房型、3项明确sold_out证据全部保留；临时验收Plan已停用，无遗留验收任务待执行。详细最终状态与封板检查见docs/testing.md、docs/deployment.md。真实Chrome Helper执行仍依赖在线、已批准且具备扩展运行能力的电脑。

V1.1生产稳定化（2026-10-01）：Gate G真实OTA改名、解除、重连及市场恢复通过，永久ID、平台原始身份、既有Observation与正式Plan均未变。现有任务页增加只读今日生产运行状态，分别展示终态任务、成功率、Attempt错误与在线设备；32项自动测试通过。不新增平台、OPS、采集字段或人工验收任务，不调整已通过的调度/采集逻辑；完成后停止新增开发，由正式14天Plan自然积累数据。

V1.2市场UI第一版：仅重排OTA市场页，桌面固定深色导航、五张核心卡片、四线价格走势（价格轴/日期Hover/缺失断线）、真实分类标签及平台横向酒店表。复用market/runtime只读接口，无新增平台/字段/API规则或生产计划变动。

Helper正式Side Panel UI V1（Helper1.1.0）：浏览器右侧采集/任务/日志界面，列表与核心详情分段进度，云端创建立即任务、本地近期任务与开发工具；关闭面板后台继续执行。44项测试通过，两次真实30家/三家详情/sold_out上传通过；期间真实搜索失败仍保留。本轮不含性能提速、采集逻辑/API/Schema/正式Plan变动。

Helper1.2.1 MARKET_LIST快速导航（FAST_NAV Mac: PASS；Windows: PENDING）：新建及后续新物化Task仅采列表，达到目标后直接上传；既有Task保留LEGACY_MARKET_DETAIL合并详情契约和历史。导航资料来自严格确认的携程原生页面，不猜POI；咸宁/中心花坛随扩展附带已回放模板，无本机缓存也先尝试直接导航。每次仍严格验证Context，失败保留UI回退。实测与限制见docs/helper-fast-navigation.md、docs/testing.md。正式Plan频率、映射、统计与sold_out规则不变。
