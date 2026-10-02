# 设备运行环境元数据（2026-10-02）

0004_device_environment.sql 仅在 devices 增加 environment（JSON）、runtime（JSON）、version_changed_at（可空时间）三列。旧行均为 NULL，不改身份、credential_hash、批准时间或业务历史。environment 为系统/浏览器/manifest/生产端点和可扩展 capabilities 对象；runtime 为自动接单、调试器权限、侧边栏、标签页/携程状态及本机任务阶段。已知字段白名单过滤，不保存账号、Cookie、Token、设备硬件序列或地理位置。

静态内容只在变化时UPDATE，重复JSON不写入；动态内容并入原心跳同一个UPDATE，没有额外心跳历史表。version_changed_at 仅在实际收到不同 Agent version 时更新，旧设备历史升级时间缺失保持 NULL。任务、最近成功/失败与统计均查询现有 Task/Attempt，不将本机声明当作权威业务结果。

# 实际数据库

## POAI 迁移（2026-10-02）

当前 poai-data（75a2bb2d-ca57-4be9-9eb4-6b389d504c5f）来自完整复制及命名迁移，所有业务 ID、Plan 与 Observation 内容保留。0003_agent_logs.sql只新增低频关键日志及设备时间索引，没有删除或改写原业务表。

agent_logs：device_id/app_version/task_id/attempt_id/level/event/message/error_code/metadata/created_at/received_at；PRIMARY KEY(device_id,id)。错误和终态持久保存，高频心跳/列表进度不写此表。正文为安全业务描述，metadata为白名单，禁止Token/Cookie/HTML/完整URL。旧版本未知显示NULL，新STARTED.message记录app_version。

当前实际市场字段为hotel_id/hotel_name/rank/is_ad/score/dynamic/activity_tags/original_price/display_price，日期/关键词/observed_at通过任务及快照追溯。用户清单中的review_count、event_at_estimated、precision、is_estimated尚无独立Schema字段；本次不伪造或新增采集字段。OPS本版仅浏览器分析，无经营数据库表。

数据库poai-data。仅api/wrangler.jsonc绑定DB，ota通过API Service Binding读取。

迁移：0001_v1.sql用于全新数据库，后续顺序应用0002_task_type.sql。0002仅增加tasks.task_type，历史默认LEGACY_MARKET_DETAIL；新任务显式MARKET_LIST。不修改Observation Schema或历史结果。

- platforms：平台字典，V1只有ctrip，价格列不以平台命名。
- devices：永久ID、凭证摘要、审批状态、名称、心跳、错误。
- plans：滚动窗口与采集目标；频率集中在api/src/config.js。
- tasks：具体入住日期、scope与limit、due/window、总体及两阶段状态。
- attempts：Task固定ID下的1..5次尝试、Device ID、领取/开始/完成/硬超时/租约/回队列时间、错误与领取时核心映射。
- attempt_events：顺序可还原领取、开始、锁定列表、失败/回队列、结束。
- platform_hotels：(platform,hotel_id)独立身份，original_name为最新平台名称，观察表保留每次原名。
- standard_hotels：永久ID、可改标准名、分类；单店只允许一个mine。
- hotel_mappings / mapping_history：人工确认关系与建立/解除审计。
- snapshots：Task唯一完成快照、来源Attempt/Device、观察/接收时间、自然耗尽、两阶段完成率、幂等哈希。
- market_observations：严格极简列表字段，来源参数由snapshot -> task追溯，禁止更新原始观察。
- room_observations：极简房型与明确售罄证据；不做Rate Plan或跨平台房型映射。
- market_analyses：亦为Strategy History，保存版本、scope、当时我的酒店价、规则得分、客观事实及建议，不重写。

索引：待执行due/window、活跃Attempt租约、酒店时间序列、市场参数。部分唯一索引与上传trigger构成并发和禁用的最终边界。所有价格缺失写NULL，tags未出现写NULL。30家与all/custom查询同时匹配scope/limit。

Gate I展示只读关联当前hotel_mappings与原始market_observations，支持采集后的人工映射；不重写market_analyses.my_price或facts。无需Schema迁移。

Gate J沿用现有Plan/Task/Attempt表和schedule_key唯一约束，无Schema迁移；滚动按业务日物化D0～D+horizon。jitter与负载只决定新Task.due_at/capacity_warning，已有Task排期和Attempt历史不重写。

Helper1.2.0的MARKET_LIST领取时Attempt.core_hotels冻结为空数组，既有上传校验拒绝额外详情/房型；LEGACY_MARKET_DETAIL仍冻结原映射。状态、窗口、租约及幂等键不变。平台导航资料存于Helper本机navigation_profiles，不写Hotel Observation或云端数据库。

Helper V1.3无新增D1表、列、迁移或触发器，生产Schema维持0001/0002。device telemetry仅SELECT验证当前设备Task/Attempt归属和真实终态，然后写Analytics Engine，不INSERT高频D1日志。原attempt_events领取/开始/FAST_NAV/ready/锁定/上传/终态记录保留；新增LIST_PROGRESS、DEVICE_ONLINE等遥测不进入该表。既有失败/PARTIAL/Observation不删除或改写。

## 全量复制安全校验

冻结复制时原数据库 ID 68cfcb1e-913a-4013-aa9d-5ae27f2a1150 → 当前 poai-data / 75a2bb2d-ca57-4be9-9eb4-6b389d504c5f。16 表逐行哈希核对通过、外键错误 0。下列数量为切换时同一冻结截面的前后对照，后续正常生产写入会增加总量。原标准酒店表仅改名，4 个永久 ID 与内容不变。

| 当前表 | 复制前 | 复制后 |
|---|---:|---:|
| platforms | 1 | 1 |
| devices | 2 | 2 |
| plans | 2 | 2 |
| standard_hotels | 4 | 4 |
| platform_hotels | 47 | 47 |
| tasks | 137 | 137 |
| attempts | 125 | 125 |
| snapshots | 65 | 65 |
| hotel_mappings | 4 | 4 |
| mapping_history | 6 | 6 |
| attempt_events | 583 | 583 |
| market_observations | 1615 | 1615 |
| room_observations | 389 | 389 |
| market_analyses | 65 | 65 |
| agent_logs | 9 | 9 |
| d1_migrations | 3 | 3 |

原 schema dump SHA256：9fe564c444be1c309ae22f17c78999a6bc6267743013cd6b422d0f8d6573b4d5。改名后规范 schema SHA256：2af11ed9ba39d757489e65995319a2dbae9d184e498a7165b290f2889597cdc6；哈希差异来自已验收的命名变更，不表示数据变更。完整副本导出 SHA256：9822b6927f8028a1197517a7002706784dfbb0c7b636a6ace57ac9a9b7a66d71。原数据库仅在新链路、Mac 真实采集与历史子集校验全部通过后删除；私密备份仍保留。


## 0005_task_cancellation.sql

仅扩展tasks.status与attempts.status CHECK为支持CANCELLED；不新增业务字段或表。D1原子迁移使用defer_foreign_keys临时重建两表，原ID、全部列值、外键引用、唯一索引、快照上传guard完整保留。恢复后以pragma_foreign_key_check计数约束校验，无错误才结束事务。不得分条手动执行迁移。

上线前生产导出备份的本地演练：16表逐表数据摘要完全一致（153 tasks/182 attempts/106 snapshots/2812 market_observations/389 room_observations/988 attempt_events/121 agent_logs）。生产应用21条SQL成功，外键检查0。正式计划整行保持不变。备份和私有摘要仅本机临时保存，不提交设备凭证。
