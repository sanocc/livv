# LIVV OTA V1 架构决策

评估日期：2026-10-01。V1单店、携程移动端、30家唯一酒店、滚动14/30天。api/ota/livvcc/helper为独立工程，不建立ops。

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
