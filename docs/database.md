# 实际数据库

数据库livv-v1。仅api/wrangler.jsonc绑定DB，ota通过API Service Binding读取。

迁移：0001_v1.sql用于全新数据库，后续顺序应用0002_task_type.sql。0002仅增加tasks.task_type，历史默认LEGACY_MARKET_DETAIL；新任务显式MARKET_LIST。不修改Observation Schema或历史结果。

- platforms：平台字典，V1只有ctrip，价格列不以平台命名。
- devices：永久ID、凭证摘要、审批状态、名称、心跳、错误。
- plans：滚动窗口与采集目标；频率集中在api/src/config.js。
- tasks：具体入住日期、scope与limit、due/window、总体及两阶段状态。
- attempts：Task固定ID下的1..5次尝试、Device ID、领取/开始/完成/硬超时/租约/回队列时间、错误与领取时核心映射。
- attempt_events：顺序可还原领取、开始、锁定列表、失败/回队列、结束。
- platform_hotels：(platform,hotel_id)独立身份，original_name为最新平台名称，观察表保留每次原名。
- livv_hotels：永久ID、可改标准名、分类；单店只允许一个mine。
- hotel_mappings / mapping_history：人工确认关系与建立/解除审计。
- snapshots：Task唯一完成快照、来源Attempt/Device、观察/接收时间、自然耗尽、两阶段完成率、幂等哈希。
- market_observations：严格极简列表字段，来源参数由snapshot -> task追溯，禁止更新原始观察。
- room_observations：极简房型与明确售罄证据；不做Rate Plan或跨平台房型映射。
- market_analyses：亦为Strategy History，保存版本、scope、当时我的酒店价、规则得分、客观事实及建议，不重写。

索引：待执行due/window、活跃Attempt租约、酒店时间序列、市场参数。部分唯一索引与上传trigger构成并发和禁用的最终边界。所有价格缺失写NULL，tags未出现写NULL。30家与all/custom查询同时匹配scope/limit。

Gate I展示只读关联当前hotel_mappings与原始market_observations，支持采集后的人工映射；不重写market_analyses.my_price或facts。无需Schema迁移。

Gate J沿用现有Plan/Task/Attempt表和schedule_key唯一约束，无Schema迁移；滚动按业务日物化D0～D+horizon。jitter与负载只决定新Task.due_at/capacity_warning，已有Task排期和Attempt历史不重写。

Helper1.2.0的MARKET_LIST领取时Attempt.core_hotels冻结为空数组，既有上传校验拒绝额外详情/房型；LEGACY_MARKET_DETAIL仍冻结原映射。状态、窗口、租约及幂等键不变。平台导航资料存于Helper本机navigation_profiles，不写Hotel Observation或云端数据库。
