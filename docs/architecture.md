# 设备环境与运行诊断（Agent 1.3.4）

Agent独立异步探测 chrome.runtime.getPlatformInfo 与 User-Agent Client Hints，仅请求平台版本/架构/位数/完整浏览器版本。环境与能力在启动及变化时上报；每5分钟检查静态变化、失败后至少5分钟重试，JSON未变化不上传/不写D1。探测有1.5秒上限，不await于采集主链路。权限与受管页状态异步缓存，动态Task/phase/auto跟随既有心跳。登录无可靠证据时永远unknown；不读取账号/Cookie或进行额外DOM探测。

设备列表简洁呈现系统/Chrome主版本/Agent、状态、最近成功与24h结果；详情分概览、环境、能力、生命周期、最近任务/运行记录和技术详情。业务状态来源既有D1，不以声明能力或本机phase伪造任务结果。能力表示实现支持，模板/权限/登录可用性另行展示；当前支持携程，未来能力通过JSON扩展，不增加平台固定列。

# POAI 架构决策

## POAI 当前主线（2026-10-02）

唯一品牌POAI。原api/ota/site/helper分别对应API/OTA/site/agent，保留路径与三个Worker标识；新增ops/ai。不重建D1、不改采集/调度/酒店映射/市场口径。下方旧品牌与不开发OPS的表述为历史阶段范围，已由本次用户请求替代。

OPS首版为浏览器内CSV/XLSX分析。ADR=营收/售卖房量，OCC=售卖房量/可售房量。同日同房型可售房量跨渠道只计一次；缺失不推算。重复营业日/房型/渠道拒绝导入。无经营文件上传、无OPS数据库表；AI只提供产品框架，未接模型。

Agent关键错误/终态通过原异步telemetry通道写D1 agent_logs，按设备+事件ID幂等；高频进度/心跳仍走原Analytics。既有attempt_events原样保留；新STARTED.message保存应用版本，历史未知版本不从当前设备推断。原鉴权与真实终态校验不变。

## Helper V1.3可观测性分层

D1维持原业务表与必要阶段事件，不增加高频日志表。Helper本地日志保持，白名单标量事件独立批量POST到API，再写Analytics Engine。上传事件失败只影响本地有限队列，不抛入Task执行链路；API读取既有Attempt关系及真实Task终态，不能让执行失败冒充Task最终FAILED。Workers Logs继续持久化API调用与异常，未使用Logpush/R2或第三方监控。OTA设备运行概况读取D1业务状态及可选Analytics采样事件。详情见helper-observability.md。

Side Panel保留STATE轮询，展示内容未变化不替换innerHTML/textContent；storage变化只监听界面相关键并合并刷新。错误不再每次先隐藏再显示，展开状态与滚动恢复。不调整采集状态机、tick或滚动等待。

## MARKET_LIST导航与详情分离（Helper1.2.0）

Helper1.2.1（FAST_NAV Mac: PASS；Windows: PENDING）在24小时本机缓存之外，为咸宁/中心花坛提供独立浏览器回放过的原生导航模板，解决新设备无缓存冷启动；每次仍必须通过真实DOM/卡片曝光Context，不通过则UI fallback。本版本完成三轮Mac真实30家验收（含无缓存），尚未完成Windows真实30家验收，不宣称跨平台PASS，见helper-fast-navigation.md与testing.md。以下1.2.0限制保留为历史基线。

新建与后续新物化Task：领取→导航→严格Context验证→列表→上传，不进入详情/房型。既有Task保留LEGACY_MARKET_DETAIL契约和原详情执行。独立COMPETITOR_DETAIL及其计划属于后续工作，本轮未实现；新列表快照不会自动刷新详情。正式Plan频率及状态机不变，上文核心详情容量描述属于旧合并任务。

优先复用24小时内同平台/城市/关键词的本机原生导航资料，只替换已验证c-in/c-out，其他opaque字段保留。DOM必须确认平台、城市、日期、可见关键词，每张hotel-card曝光城市ID/日期也必须一致；URL本身不是正确Context证据。无资料、过期、参数不支持或Context错误，记录明确事件并走原CITY→DATE→KEYWORD→SEARCH，清空错误页面候选观察。验证码仍真实失败，不自动绕过。

冷启动仍需原生UI搜索；本轮确认咸宁中心花坛/咸宁北站参数，不推断全国城市或任意POI。单设备单Task、自然结果优先去重、采集字段和sold_out要求不降低，未优化tick或滚动。逆向证据与限制见helper-fast-navigation.md。

评估日期：2026-10-01。V1单店、携程移动端、30家唯一酒店、滚动14/30天。api/ota/site/helper为独立工程，不建立ops。

## 数据库比较与决定

| 方案 | 写入/关系/聚合 | 运维与费用 | V1决定 |
|---|---|---|---|
| D1 | SQLite关系模型、索引、JSON批量写入、事务batch；单数据库写入串行 | Workers原生绑定，无独立数据库服务；按读/写行与存储计费 | 使用 |
| PostgreSQL + Hyperdrive | 强时间序列聚合、并发与分区能力 | Hyperdrive是连接池/缓存，不是数据库；仍需外部PostgreSQL托管与费用 | 暂不使用 |
| MySQL + Hyperdrive | 常规关系查询、索引和较强写入并发 | 同样需额外托管；当前业务无MySQL专属需求 | 暂不使用 |

14天计划包括D0及D+1～14，完整业务日39个任务（10+6+8+8+7天×1），30家约1170条列表观察/日，另加核心详情；30天远期隔日计划增加少量任务。按每条记录及索引约1KB估算，14天计划列表约0.42GB/年，实际须测量而非当作容量保证。索引写入也计费，免费额度不应视为无限长期容量。

D1当前Free单库500MB，Paid单库10GB；单库本质串行。V1上传每次约10条SQL，通过json_each批量写入酒店/观察，避免30家上传超过Free每次调用50条查询限制。只有API持有DB绑定；前端Service Binding转API，Helper通过HTTPS API。

达到单库容量约70%、持续overloaded、写入延迟影响任务窗口、或多门店复杂分析时再评估PostgreSQL + Hyperdrive与历史归档，不能通过牺牲原始数据真实性解决扩展。

## Cloudflare组件评估

| 能力 | V1选择 | 原因 |
|---|---|---|
| Workers | 使用 | 三个Worker，API持有DB，网站assets与API代理 |
| D1 | 使用 | 单店关系数据、事务、迁移与索引 |
| Cron Triggers | 使用 | 每分钟生成当前业务日窗口任务、回收失效租约；UTC触发转Asia/Shanghai语义 |
| Queues | 不使用 | 任务需要设备审批、范围截止与单设备约束，D1任务池已有持久状态，避免双状态同步 |
| Workflows | 不使用 | 浏览器实际执行在Chrome，不由Worker长时间运行；Attempt状态和租约足够 |
| Durable Objects | 不使用 | D1唯一部分索引与事务保证抢单互斥，无需另设调度协调器 |
| KV | 不使用 | 最终一致性不适合作为审批与禁用权威数据源 |
| R2 | 不使用 | 不采集图片，极简业务数据无需对象存储 |
| Workers AI | 不使用 | 可解释代码规则先完成，AI不能替代事实 |
| AI Gateway | 不使用 | 当前没有AI调用 |
| Access | 使用人类管理员身份 | API验证签名、issuer、audience、有效期及管理员邮箱，设备身份独立 |
| Secrets / Service Tokens | 管理员配置保密存放 | 无扩展全局密钥；OTA Service Binding仍转交并验证人类JWT，不把service token当人类身份 |
| Workers Builds | 使用Git Integration目标 | 新GitHub repo ID绑定main，三个项目各自watch paths |

## 安全与状态

设备在扩展可信storage生成永久UUID和32字节随机凭证，注册只存SHA-256摘要。重复注册同凭证可重试，知道Device ID不能重新颁发凭证。未审批设备只可心跳。禁用立即阻止领取、发布和上传，DB上传trigger再次验证审批与执行窗口。

Plan -> Task -> Attempt分离。部分索引保证每设备/任务只有一个RUNNING Attempt。claim以事务batch选择并建立Attempt，重试最多5次，同时受原Task.window_end约束。心跳续租不能恢复过期租约；15分钟单Attempt硬截止，默认45分钟立即任务窗口。

任务先锁定列表再采核心详情。详情失败保存列表并标PARTIAL。全市场必须有自然耗尽证据，安全超时/停滞不能冒充全市场。策略与观察不可UPDATE；算法升级只影响后续建议。映射只由管理员明确确认，解除关联写历史，不删除观察。

业务时区Asia/Shanghai与验收城市一致；与用户Asia/Singapore均UTC+8。当前窗口转换明确使用+08:00，如未来改变时区必须同步转换实现与测试。

## 官方依据

- [Workers](https://developers.cloudflare.com/workers/)
- [D1限制](https://developers.cloudflare.com/d1/platform/limits/) / [费用](https://developers.cloudflare.com/d1/platform/pricing/)
- [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) / [费用](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
- [Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Queues](https://developers.cloudflare.com/queues/) / [Workflows](https://developers.cloudflare.com/workflows/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/) / [KV](https://developers.cloudflare.com/kv/) / [R2](https://developers.cloudflare.com/r2/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/) / [AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [验证Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Builds Monorepo](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/) / [watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)

携程房型适配按当前真实DOM的基础房型卡片采集；展开房型如果展示多个销售方案，仅保存当前DOM可见方案中的最低展示价及该价格对应的划线价/活动标签，不保存早餐、取消、渠道等Rate Plan字段。房型已订完必须有该卡片明确文字证据。详情DOM公开业务属性再次核对Hotel ID、入住/退房日期及原始酒店名。

## Helper 浏览器输入

普通合成DOM事件在真实携程候选项上不能稳定触发导航。Helper从公开DOM读取控件坐标，使用Chrome官方`chrome.debugger`的Input命令发送点击和搜索文本；Chrome不支持把`debugger`设为可选权限，因此声明为必需权限；更新扩展前须获得用户明确授权。Helper按钮检查权限，不尝试可选权限请求。此权限在Chrome层面能力较广，业务代码每条命令前核验自有active/managed_tab及HTTPS携程酒店路径，只发送Input命令，每次操作finally断开；不使用Runtime、Network或Storage协议命令。原有设备凭证仍仅在后台存储/API请求使用，不传入页面脚本。

参考：[Chrome debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)、[Input协议](https://chromedevtools.github.io/devtools-protocol/tot/Input/)。

第二阶段发生输入权限、输入连接或采集标签页作用域故障时，Helper保留锁定的市场列表和成功房型，为剩余详情记录明确失败代码，并通过原有result接口上传部分结果。服务端照常拒绝过期或失去资格的Attempt；不会为了保存列表跨窗口补采。

权限声明依据：[Chrome permissions：不可选权限列表](https://developer.chrome.com/docs/extensions/reference/api/permissions)。

浏览器连接后会出现调试提示栏并改变可视区域；Input适配在连接后通过`scripting.executeScript`重新读取目标公开DOM几何位置，再发送点击。搜索状态机等待实际页面导航，关键词入口未打开会重试，不提前将旧列表作为新关键词的结果。

详情返回列表后可能仅加载首批卡片，页面complete不代表所有冻结目标入口已出现。DETAIL_OPEN缺少目标Hotel ID时，在45秒内滚动列表容器并等待后续批次，保持已锁定市场列表不变；到期仍记录DETAIL_CARD_NOT_FOUND，下一目标单独计算入口等待时间。原有Attempt/任务截止继续约束执行，房型解析与列表去重不受此兼容修复影响。

## Gate J调度边界与负载

计划horizon=14/30表示D0加未来14/30天（D+14/D+30均包含）；市场曲线horizon仍是14/30个日期点，从今日开始。修复原调度循环遗漏端点，与既有频率表一致。D+15～30按业务日序号和Plan ID稳定相位隔日一次；不是隔日采不同日期。

每分钟仅为尚未到期的窗口生成缺失schedule_key，due_at不早于生成时间。按稳定hash排序和窗口内jitter，使用在线已批准设备数量、执行中Attempt硬截止与已有待执行任务预留估计180秒负载；不足时标capacity_warning，不跨窗口延长。既有Task的due_at不重排，唯一schedule_key抵御Cron重复/并发插入。设备离线、禁用和Attempt最终互斥仍以领取事务与原始窗口为准。

## Helper正式侧边栏展示

Helper1.1.0采用Chrome Side Panel；background/service worker继续独占注册、心跳、领取、执行与上传，panel关闭/页面切换只影响展示。STATE只返回白名单任务摘要、设备云端名称、进度、日志及本地30条近期任务缓存，凭证/全量房型payload不进入panel。精确允许扩展自身popup.html/sidepanel.html发出管理消息；内容脚本仍只能对自有managed_tab发送PAGE_READY。无新取消语义、后台计时器调整、Schema或业务API。旧popup开发入口保留，Side Panel不可用时回退popup。Task终态不能由Attempt失败推断，未确认状态展示待云端确认。
