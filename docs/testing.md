# 验收记录（持续更新）

2026-10-01。此记录严格区分自动测试与真实携程验收。

| Gate | 状态 | 实际证据 |
|---|---|---|
| A 工程基础 | PASS | api/ota/livvcc Wrangler独立dry-run成功；Helper MV3文件与JS语法通过；13项Node测试通过；架构/Schema/API文档已建立 |
| B 云端基础 | IN PROGRESS | 新main已推送；D1远程迁移通过；三个Worker部署、域名与Git连接保存；OTA Access应用与API验证配置完成；实际Git构建和管理员登录待验证 |
| C 设备 | NOT RUN | 尚未安装新Helper、人工批准设备 |
| D 任务闭环 | LOCAL PASS / LIVE NOT RUN | 内存SQLite验证发布、领取、Attempt、失败回队列；生产未验收 |
| E 携程自动化 | IN PROGRESS | 真实移动端已检查城市/关键词入口；发现城市显示与关键词路由上下文不同步，尚未通过自动化验收 |
| F 真实列表 | NOT RUN | 没有正式生产采集数据；DOM适配与30家真实上传仍待验证 |
| G 映射 | LOCAL PASS / LIVE NOT RUN | 本地验证手工confirm、改标准名、解除关联保留观察历史 |
| H 房型 | NOT RUN | 极简解析及售罄证据校验已编码，真实详情尚未验收 |
| I 市场展示 | LOCAL LOGIC PASS / LIVE NOT RUN | 统计、范围隔离、缺失无插值及策略保存已测试；生产无真实观察 |
| J 自动计划 | LOCAL PASS / LIVE NOT RUN | 可控时间验证滚动、频率、错峰、计划生成幂等、五次上限与过期 |

运行npm test使用内存SQLite，绝不调用生产D1。Mock仅在tests/出现，不写入生产表，不作为Gate F PASS证据。

测试覆盖：设备申请、重复申请凭证保护、审批/禁用、身份分离、Access签名/audience/expiry、单设备单任务、自然记录优先、仅广告保留、唯一酒店数量、完整原子上传/幂等、5次Attempt、窗口拒绝、部分详情保存列表、映射历史、不可修改观察、全市场隔离、缺失数据、规则建议、调度窗口/频率/滚动/幂等。

真实目标：携程移动端，咸宁，中心花坛，30家唯一酒店；首轮日期按当前业务日期+1天，退房+1天。我的酒店标准名“雅斯特酒店·咸宁温泉路中心花坛店”，不自动确认映射，不更改平台原名或Hotel ID。详情验收在用户手工分类以后进行。
