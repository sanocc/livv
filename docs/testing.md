# 验收记录（持续更新）

2026-10-01。此记录严格区分自动测试与真实携程验收。

| Gate | 状态 | 实际证据 |
|---|---|---|
| A 工程基础 | PASS | api/ota/livvcc Wrangler独立dry-run成功；Helper MV3文件与JS语法通过；14项Node测试通过；架构/Schema/API文档已建立 |
| B 云端基础 | PASS | 新main已推送；D1远程迁移通过；三个Worker部署、域名与Git连接保存；OTA Access应用与API验证配置完成；提交2d905d8三个Workers Builds均成功；Chrome真实Access登录后OTA市场页加载成功；生产表暂无采集数据 |
| C 设备 | PASS | Chrome加载当前Helper；真实UUID注册待批准；用户人工批准；在线空闲；禁用后生产API拒绝claim；停止心跳后离线；恢复在线，同一Device ID保留 |
| D 任务闭环 | PASS | OTA正式发布Task 52c34384-0d3c-40da-bd44-866a68e370e4；生产D1只读核验两次自动领取、开始、SEARCH_CONTROL_TIMEOUT失败、返回同一任务池的完整时间线；任务PENDING，Attempt 2/5；五次上限和窗口过期自动测试通过 |
| E 携程自动化 | IN PROGRESS | 真实移动端已检查城市/关键词入口；已实测列表城市入口、日历与关键词搜索；解析器核对真实DOM城市/日期/关键词，正式Helper自动执行尚未验收 |
| F 真实列表 | NOT RUN | 没有正式生产采集数据；DOM适配与30家真实上传仍待验证 |
| G 映射 | LOCAL PASS / LIVE NOT RUN | 本地验证手工confirm、改标准名、解除关联保留观察历史 |
| H 房型 | NOT RUN | 极简解析及售罄证据校验已编码，真实详情尚未验收 |
| I 市场展示 | LOCAL LOGIC PASS / LIVE NOT RUN | 统计、范围隔离、缺失无插值及策略保存已测试；生产无真实观察 |
| J 自动计划 | LOCAL PASS / LIVE NOT RUN | 可控时间验证滚动、频率、错峰、计划生成幂等、五次上限与过期 |

运行npm test使用内存SQLite，绝不调用生产D1。Mock仅在tests/出现，不写入生产表，不作为Gate F PASS证据。

测试覆盖：设备申请、重复申请凭证保护、审批/禁用、身份分离、Access签名/audience/expiry、单设备单任务、自然记录优先、仅广告保留、唯一酒店数量、完整原子上传/幂等、5次Attempt、窗口拒绝、部分详情保存列表、映射历史、不可修改观察、全市场隔离、缺失数据、规则建议、调度窗口/频率/滚动/幂等。

真实目标：携程移动端，咸宁，中心花坛，30家唯一酒店；首轮日期按当前业务日期+1天，退房+1天。我的酒店标准名“雅斯特酒店·咸宁温泉路中心花坛店”，不自动确认映射，不更改平台原名或Hotel ID。详情验收在用户手工分类以后进行。

当前生产API健康检查返回200及database: ok，提交bd8f595的Workers Builds完成成功。Mac锁屏阻止加载最新Helper搜索点击修正；自动领取已关闭，没有把失败Attempt或解析预览伪造为生产采集成功。
