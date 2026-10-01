# 验收记录（持续更新）

2026-10-01。此记录严格区分自动测试与真实携程验收。

| Gate | 状态 | 实际证据 |
|---|---|---|
| A 工程基础 | PASS | api/ota/livvcc Wrangler独立dry-run成功；Helper MV3文件与JS语法通过；20项Node测试通过；架构/Schema/API文档已建立 |
| B 云端基础 | PASS | 新main已推送；D1远程迁移通过；三个Worker部署、域名与Git连接保存；OTA Access应用与API验证配置完成；提交2d905d8三个Workers Builds均成功；Chrome真实Access登录后OTA市场页加载成功；生产表暂无采集数据 |
| C 设备 | PASS | Chrome加载当前Helper；真实UUID注册待批准；用户人工批准；在线空闲；禁用后生产API拒绝claim；停止心跳后离线；恢复在线，同一Device ID保留 |
| D 任务闭环 | PASS | OTA正式发布Task 52c34384-0d3c-40da-bd44-866a68e370e4；生产D1只读核验两次自动领取、开始、SEARCH_CONTROL_TIMEOUT失败、返回同一任务池的完整时间线；该任务窗口到期后FAILED / EXECUTION_WINDOW_EXPIRED；新Task 4765e749-a69c-45ed-974a-e811e467c712真实5/5后FAILED / MAX_ATTEMPTS_REACHED；相关自动测试通过 |
| E 携程自动化 | PASS | Task a6d6ae1c-a69b-4705-830c-70c4f3e55b1c Attempt #3：Helper实际自动设置咸宁、10月2–3日、中心花坛并搜索；公开DOM和最终上传context校验通过；用户已授权debugger必需权限；未用手动诊断代替本次正式自动搜索 |
| F 真实列表 | PASS | 同一Task COMPLETED；2026-10-01 11:10:25（Asia/Shanghai）生产D1保存snapshot a0ef566b-fe56-4b82-a081-6bd358a09bc7：30条Observation、30唯一Hotel ID、排名1–30、6条仅广告；OTA选择10月2日展示30家、中位价¥166和原始名称/ID/价格 |
| G 映射 | IN PROGRESS | 30家真实平台酒店已出现在OTA酒店页；用户指定的标准酒店已创建永久ID 1418c494-e3b3-4b89-9122-7659c67a6487；最终关联与核心分类待用户确认；本地修改/解除关联/历史不可变测试已通过 |
| H 房型 | NOT RUN | 极简解析及售罄证据校验已编码，真实详情尚未验收 |
| I 市场展示 | IN PROGRESS | OTA真实展示30家排名、起售价和¥166中位数，14天图缺失日期留空；我的酒店未最终关联，起售价保持空；正式分类、悬浮信息及房型完成后继续验收 |
| J 自动计划 | LOCAL PASS / LIVE NOT RUN | 可控时间验证滚动、频率、错峰、计划生成幂等、五次上限与过期 |

运行npm test使用内存SQLite，绝不调用生产D1。Mock仅在tests/出现，不写入生产表，不作为Gate F PASS证据。

测试覆盖：设备申请、重复申请凭证保护、审批/禁用、身份分离、Access签名/audience/expiry、单设备单任务、自然记录优先、仅广告保留、唯一酒店数量、完整原子上传/幂等、5次Attempt、窗口拒绝、部分详情保存列表、映射历史、不可修改观察、全市场隔离、缺失数据、规则建议、调度窗口/频率/滚动/幂等。

真实目标：携程移动端，咸宁，中心花坛，30家唯一酒店；首轮日期按当前业务日期+1天，退房+1天。我的酒店标准名“雅斯特酒店·咸宁温泉路中心花坛店”，不自动确认映射，不更改平台原名或Hotel ID。详情验收在用户手工分类以后进行。

生产API真实采集上传已完成；提交b7167c8的Workers Builds完成成功。Chrome debugger授权生效，Helper已加载本次真实页面修复；失败Attempt保留，未修改为成功。

输入适配新增3项测试：外域/未授权/非自有标签页拒绝；仅发送Input点击/文本命令并断开；操作中导航离开携程立即停止并断开。这些测试不替代真实页面验收。

详情故障新增2项测试：第二阶段浏览器故障保留锁定列表、成功房型和已记录的失败原因，只将尚未完成的详情标记失败；搜索/未锁定列表不进入此恢复路径。详情打开时页面仍在加载则等待，不提前进入解析阶段。正式上传仍受服务端Attempt与原始窗口校验约束。

真实自动化修复：输入前滚动到控件，debugger连接后用scripting重新读取公开DOM坐标，避免提示栏改变布局；关键词入口未导航时重试，不提前判定列表已搜索；日期按URL与任务核对；关键词点击整个唯一精确匹配候选记录。输入重定位/目标消失立即断开的自动测试通过，总计20项。

证据保存在本地忽略目录 `.local/proofs/helper-input-enabled.png`、`helper-30-completed.png`、`ctrip-helper-auto-search.png`、`ota-real-market-30.png`、`ota-hotel-mapping-ready.png`。数据库只读核验确认携程2114264原始名“雅斯特酒店(咸宁温泉路中心花坛店)”、排名2、起售价176、划线价272、评分4.4、非广告。该值属于本次快照，不代表未来实时价格。
