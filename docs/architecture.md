# LIVV OTA V1 架构决策

评估日期：2026-10-01。V1单店、携程移动端、30家唯一酒店、滚动14/30天。api/ota/livvcc/helper为独立工程，不建立ops。

## 数据库比较与决定

| 方案 | 写入/关系/聚合 | 运维与费用 | V1决定 |
|---|---|---|---|
| D1 | SQLite关系模型、索引、JSON批量写入、事务batch；单数据库写入串行 | Workers原生绑定，无独立数据库服务；按读/写行与存储计费 | 使用 |
| PostgreSQL + Hyperdrive | 强时间序列聚合、并发与分区能力 | Hyperdrive是连接池/缓存，不是数据库；仍需外部PostgreSQL托管与费用 | 暂不使用 |
| MySQL + Hyperdrive | 常规关系查询、索引和较强写入并发 | 同样需额外托管；当前业务无MySQL专属需求 | 暂不使用 |

14天默认每天38个任务（10+6+8+8+6天×1），30家约1140条列表观察/日，另加核心详情；30天远期隔日计划增加少量任务。按每条记录及索引约1KB估算，14天计划列表约0.42GB/年，实际须测量而非当作容量保证。索引写入也计费，免费额度不应视为无限长期容量。

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
