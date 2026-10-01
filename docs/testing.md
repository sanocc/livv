# 验收记录（持续更新）

2026-10-01。第一阶段封板，生产代码基线208a300dfcfd62e200542835e898f82cefc2028e。此记录严格区分自动测试与真实携程验收；下表含V1.1补证后的当前状态，后文按时间保留历次证据。

| Gate | 状态 | 实际证据 |
|---|---|---|
| A 工程基础 | PASS | api/ota/livvcc Wrangler独立dry-run成功；Helper MV3文件与JS语法通过；当前30项Node测试通过；架构/Schema/API文档已核对 |
| B 云端基础 | PASS | 新main已推送；D1远程迁移通过；三个Worker部署、域名与Git连接保存；OTA Access应用与API验证配置完成；提交2d905d8三个Workers Builds均成功；Chrome真实Access登录后OTA市场页加载成功；后续已保存真实市场与房型数据 |
| C 设备 | PASS | Chrome加载当前Helper；真实UUID注册待批准；用户人工批准；在线空闲；禁用后生产API拒绝claim；停止心跳后离线；恢复在线，同一Device ID保留 |
| D 任务闭环 | PASS | OTA正式发布Task 52c34384-0d3c-40da-bd44-866a68e370e4；生产D1只读核验两次自动领取、开始、SEARCH_CONTROL_TIMEOUT失败、返回同一任务池的完整时间线；该任务窗口到期后FAILED / EXECUTION_WINDOW_EXPIRED；新Task 4765e749-a69c-45ed-974a-e811e467c712真实5/5后FAILED / MAX_ATTEMPTS_REACHED；相关自动测试通过 |
| E 携程自动化 | PASS | Task a6d6ae1c-a69b-4705-830c-70c4f3e55b1c Attempt #3：Helper实际自动设置咸宁、10月2–3日、中心花坛并搜索；公开DOM和最终上传context校验通过；用户已授权debugger必需权限；未用手动诊断代替本次正式自动搜索 |
| F 真实列表 | PASS | 同一Task COMPLETED；2026-10-01 11:10:25（Asia/Shanghai）生产D1保存snapshot a0ef566b-fe56-4b82-a081-6bd358a09bc7：30条Observation、30唯一Hotel ID、排名1–30、6条仅广告；OTA选择10月2日展示30家、中位价¥166和原始名称/ID/价格 |
| G 映射 | PASS（V1.1生产补证） | 2026-10-01 14:52～14:57真实OTA完成1286886独立映射改名、解除、原ID重连、市场恢复；平台原始身份、15条既有Observation、正式Plan与三家主酒店映射不变；mapping_history保留link/unlink/link（见V1.1章节） |
| H 房型 | PASS（含完整详情复验） | 历史Gate H任务三家详情3/3、13种房型、3项明确sold_out保留；208a300修复后两个新真实30家任务均COMPLETED、三家详情3/3、各14种房型；均在原窗口上传 |
| I 市场展示 | PASS（代码与线上展示） | 当前映射对应我的酒店价、市场最低/中位/最高价、14/30天框架、五类酒店、携程横向列组、排名/起售价与完整悬浮字段；缺失留空；23项自动测试通过 |
| J 自动计划 | PASS（代码、正式计划执行与独立短窗口闭环） | 调度可控时间测试通过；真实临时窗口7个COMPLETED、2个自然过期，失败Attempt保留；窗口后两个真实Cron周期无重复、无跨窗口领取/上传；正式14天Plan不变，已有真实30家/详情3/3的计划Task |

运行npm test使用内存SQLite，绝不调用生产D1。Mock仅在tests/出现，不写入生产表，不作为Gate F PASS证据。

## 第一阶段封板核对

2026-10-01 14:01～14:03（UTC+8）只读核验：README与架构、测试、部署、API、数据库文档对照当前源码和Schema；纠正README的“新计划浏览器执行尚未复验”等过时交接结论，历史章节仍作为当时记录保留。API和数据库契约与实现一致，无需为封板改动业务代码或Schema。

正式14天Plan 3963a563-7687-45dc-9b2a-d33cbdd0cd7c enabled=1，携程/咸宁/中心花坛/top30/30，created_at与updated_at均仍为2026-10-01T04:41:45.228Z。唯一临时Plan acceptance-window-bbdea3bb-4570-47d9-86a4-dc41aab5c017 enabled=0，其25个Task全部终态；停用Plan下PENDING/RUNNING任务数为0。所有独立验收Task均已终态，无plan_id为空或acceptance计划下的待执行/运行任务。正式Plan剩余PENDING为正常生产任务，不作清理。

设备56d208e8-90cd-49bf-ae84-b17a43d9f1b9 approved、Helper 1.0.0；14:02:53.259有心跳，按120秒在线标准online=1，当时无RUNNING Attempt。last_error=ATTEMPT_TIMEOUT，作为最近执行错误如实保留，不代表设备被禁用。新完成的两个3/3快照及历史PARTIAL/FAILED仍存在；封板未修改或删除任何生产记录。

生产表仅为既有业务表、迁移及D1系统表，无临时Debug表；测试Fixture仅在内存，本地.local/proofs与历史诊断文件被Git忽略，不被生产Worker加载。Helper只读“当前页面结构”诊断不会生成任务或写观察。14:03单次验收跟进status=PAUSED，无遗留验收自动唤醒。API / OTA / LIVVCC健康检查见部署文档；封板前main与origin/main均为208a300，工作区干净，封板修改仅涉及文档。

封板结论为第一阶段真实主闭环PASS；Gate G线上修改/解除映射仍缺追加证据。维也纳已修复并通过真实复验，但页面变化、电脑休眠/后台页面、验证码及网络仍可能造成真实PARTIAL/FAILED；不保证未来任务全部成功，不伪造缺失趋势或售罄。封板检查证据位于.local/proofs/seal-production.json、seal-final-device.json、seal-health.json。

测试覆盖：设备申请、重复申请凭证保护、审批/禁用、身份分离、Access签名/audience/expiry、单设备单任务、自然记录优先、仅广告保留、唯一酒店数量、完整原子上传/幂等、5次Attempt、窗口拒绝、部分详情保存列表、映射历史、不可修改观察、全市场隔离、缺失数据、规则建议、调度窗口/频率/滚动/幂等。

真实目标：携程移动端，咸宁，中心花坛，30家唯一酒店；首轮日期按当前业务日期+1天，退房+1天。我的酒店标准名“雅斯特酒店·咸宁温泉路中心花坛店”，不自动确认映射，不更改平台原名或Hotel ID。详情验收在用户手工分类以后进行。

生产API真实采集上传已完成；提交b7167c8的Workers Builds完成成功。Chrome debugger授权生效，Helper已加载本次真实页面修复；失败Attempt保留，未修改为成功。

输入适配新增3项测试：外域/未授权/非自有标签页拒绝；仅发送Input点击/文本命令并断开；操作中导航离开携程立即停止并断开。这些测试不替代真实页面验收。

详情故障新增2项测试：第二阶段浏览器故障保留锁定列表、成功房型和已记录的失败原因，只将尚未完成的详情标记失败；搜索/未锁定列表不进入此恢复路径。详情打开时页面仍在加载则等待，不提前进入解析阶段。正式上传仍受服务端Attempt与原始窗口校验约束。

真实自动化修复：输入前滚动到控件，debugger连接后用scripting重新读取公开DOM坐标，避免提示栏改变布局；关键词入口未导航时重试，不提前判定列表已搜索；日期按URL与任务核对；关键词点击整个唯一精确匹配候选记录。输入重定位/目标消失立即断开的自动测试通过，总计21项。

证据保存在本地忽略目录 `.local/proofs/helper-input-enabled.png`、`helper-30-completed.png`、`ctrip-helper-auto-search.png`、`ota-real-market-30.png`、`ota-hotel-mapping-ready.png`。数据库只读核验确认携程2114264原始名“雅斯特酒店(咸宁温泉路中心花坛店)”、排名2、起售价176、划线价272、评分4.4、非广告。该值属于本次快照，不代表未来实时价格。

## Gate H 最终复验与交接

2026-10-01 11:58:36（Asia/Shanghai）正式采集完成，入住2026-10-02、退房2026-10-03，携程、咸宁、中心花坛、30家。Task e6961d63-b49f-4a0d-a7f9-56a985378074；snapshot 967b4614-fb4a-4dbe-99d5-d6243138d8d1；Attempt #1从11:56:48执行至11:58:36，窗口截止12:41:25。生产只读查询确认30条列表记录、30唯一Hotel ID、详情3/3，非Mock。

| 平台Hotel ID | 原始酒店名 | 房型数 | 明确售罄房型 |
|---|---|---|---|
| 2114264 | 雅斯特酒店(咸宁温泉路中心花坛店) | 4 | 高级双床房（电视投屏+零圧床垫+办公桌椅） |
| 6422421 | 雅斯特酒店(咸宁温泉财富广场店) | 5 | 特价大床房 |
| 6955433 | 维也纳酒店(咸宁中心花坛店) | 4 | 商务双床房 |

这三项均保存availability_status=sold_out、sold_out_evidence=已订完、original_price=null、display_price=null；其余10种可售房型保存页面实际价格及活动标签。原始名称中的“零圧”按页面保留，不因标准映射改写。

修复：兼容RECOMMEND_ROOM_CARD与BASE_ROOM_CARD；标题读取自身文本，排除箭头图标；房型区域滚动后等待至少10秒且新增房型稳定6秒，避免只取得初始3张卡；公开上下文诊断保留Hotel ID/日期/名称确认及卡片数量。

部分列表在详情阶段前结束时，也必须为本次范围内已出现的冻结核心酒店补齐DETAIL_INCOMPLETE，重载后待上传的真实部分结果可正常保存。新增自动测试覆盖此恢复路径、范围外酒店不补采及重复执行幂等。

早期Task 8ffd98ae-317c-41dc-93d2-e6740605105d保持PARTIAL（列表30，详情1/3）；cf600842-17c4-44da-be69-4e045ea6b645保持PARTIAL（22家，详情0/3）；b20b38af-d376-4910-8d16-c9e6e2f32ba2保持PARTIAL（12家，详情0/3）。未将失败或部分结果改写成成功。

真实Chrome验收时保持Helper管理的携程页前台；切换标签页后曾出现加载停滞。最终保持前台的正式任务成功。真实DOM复验仍需本地或具备Chrome扩展能力的电脑；云端代码开发可从main继续，未验证Codex Cloud直接运行本机Helper。Gate I/J按用户要求暂不推进，生产Plan数量仍为0。只读证据在本地忽略目录.local/proofs/gate-h-final.json。

## Gate I 继续验收

修复采集后才映射我的酒店时曲线价格缺失：展示按当前人工映射读取同一快照原始起售价，策略历史的当时价格/事实保持不可变。未映射/解除映射回到市场其他。中位价保留小数；携程列组横向包含排名和起售价；悬浮提示移至固定层避免表格裁切，支持焦点与Escape关闭。

新增内存SQLite API测试覆盖映射前后与解除、最低/中位/最高价、30天缺失框架和历史不可变；图表测试覆盖四序列、缺口不连线、孤立点与小数价格。全套23项通过，语法/数据库边界检查通过。此处不新增或替代Chrome Helper真实DOM验收。

## Gate J继续验收

新增4项可控时间测试：逐日频率覆盖D+14/D+30端点与隔日相位、UTC+8午夜滚动；单/双设备容量、忙碌设备、既有任务及重复jitter；重复Cron不改已排due_at、跨日新增、不回填过期窗口、临近午夜不创建过去due_at；自动Plan下Task与Attempt身份独立、单设备互斥、最多5次与窗口过期。所有测试只使用内存SQLite。全套27项通过，语法和数据库边界检查通过，API/OTA dry-run构建通过。

修复原循环遗漏D+14/D+30，不改变频率表、采集目标、重试规则或Helper。生产计划建立与云端Cron记录只能证明调度生效，不能证明新的真实携程浏览器采集成功。

## Gate I/J线上继续验收（2026-10-01）

代码提交a4d1ca2（I）、72f36ca（J）已推送main；该J提交的Workers Builds: livv-api、livv-ota均completed/success。API健康200、database=ok。Helper与fd802d1基线完全一致。

已登录Chrome OTA使用Gate H真实快照：入住10月2日，30家酒店；我的酒店¥176，市场中位价¥166.5；14/30天切换成功，四价格序列仅有真实日期点、缺失不连线。携程横向列组包含排名和起售价，原始酒店ID保持不变；我的酒店/两家核心竞品及市场其他实际展示正常。我的酒店价格提示实际显示携程、平台原名、2114264、划线价¥272、活动“3项优惠96 / 早鸟优惠”、起售价¥176，Escape关闭有效。竞品/观察分类和映射修改在内存API测试验证，未为验收修改生产映射。

先完成可控时间/幂等测试及部署，再通过正式OTA创建唯一默认14天计划3963a563-7687-45dc-9b2a-d33cbdd0cd7c：携程、咸宁、中心花坛、top30，2026-10-01 12:41:45（Asia/Shanghai）启用。只读生产D1确认25个剩余窗口Task、25唯一schedule_key、入住10月1～15日、due_at全部在窗口内，首个due_at为12:47:39.915；已过期上午窗口没有补采。完整业务日仍为39个窗口任务。

此验收不将自动计划后续浏览器采集视为PASS；执行仍依赖在线已批准Chrome Helper，后续真实结果以正式Task/Attempt状态为准。

生产Cron实测：2026-10-01 12:43:47.000（Asia/Shanghai）每分钟调度事件outcome=ok。事件前后两次只读D1查询的25个Task ID、schedule_key、due_at、原始窗口及created_at完全一致，确认无重复且无重排。证据：.local/proofs/gate-j-cron.json、gate-j-plan-before.json、gate-j-plan-after.json（本地忽略目录；不提交设备或认证数据）。

## 独立生产短窗口验收（2026-10-01）

结论：本次窗口生命周期与真实Helper执行闭环PASS。基线f1508fb7182635b5ecb2b66afbe10d2811d093c3，无代码、部署、业务规则或系统时钟修改。本次不是30家及三家详情的完整复验；相关Helper问题单独列于下一节。

正式Plan `3963a563-7687-45dc-9b2a-d33cbdd0cd7c` 保持启用、horizon=14、top30/30。前后只读D1逐字段比较整个Plan，以及25个正式Task的ID、Plan ID、schedule_key、目标参数、入住/离店、created_at、due_at、window_start/end、preferred_device_id、capacity_warning，完全相同。正式任务可以自然执行，未冻结或改写其状态。

临时测试Plan：`acceptance-window-bbdea3bb-4570-47d9-86a4-dc41aab5c017`，携程/咸宁/中心花坛，custom/1，明确以acceptance-window标识测试用途。生产市场查询同时匹配scope/limit，此范围与正式top30/30隔离；7份快照均来自真实携程页面，不作为正式30家市场证据。

现有API的立即任务为45分钟，自动Plan使用固定业务窗口。为满足本次独立10分钟验收，生产D1建立临时Plan后，由真实每分钟Cron先生成25个Task；仅将其中9个尚未领取的临时Task调整为13:05:27.097～13:15:27.097（Asia/Shanghai/Asia/Singapore，UTC+8）的窗口并安排窗口内due_at，绑定当前已批准Helper。其余16个仍为未来任务，最后停用时取消。没有手工建立替代Task，没有调用Scheduler代替真实Cron，没有修改正式Plan或其Task。此方法验证现有窗口边界与schedule_key幂等，不宣称API原生支持自定义短窗口。

设备 `56d208e8-90cd-49bf-ae84-b17a43d9f1b9` 为当前Mac的真实Chrome Helper（1.0.0、approved）。维持其管理的携程页前台，由Helper自行领取、开始、设置搜索参数并上传；没有人工执行领取、结果上传或Attempt终态更新。

| 验收项 | 真实生产证据 |
|---|---|
| 有效窗口内领取与执行 | 9个短窗口Task中7个COMPLETED；7份Snapshot、7条Market Observation、0条Room Observation；custom/1不要求详情 |
| 示例完整关联 | Task f8d7edd9e1ab6d1ea2862736ccddeb8f → Attempt 8f97f6b0-47d3-4675-8294-0b74ed45218a → Snapshot 3a1c7942-ad04-4e91-94d8-4007556a1086；领取13:05:53.375、开始13:05:53.821、observed 13:06:20.064、收到/完成13:06:20.632；Device及观察关联一致 |
| 失败Attempt如实保存 | Task 02e620067c0166744762ed9801707dae 的Attempt c0197c27-012a-4702-b43a-a02d4782814e 于13:15:23.599领取，13:15:26.401自然FAILED / ATTEMPT_TIMEOUT，无Snapshot；没有人为制造或改写失败 |
| 过期不补采 | 上述Task与未领取的a1e91efb43d2dfbe6f63ad01357ea458 均于13:15:53.718自然FAILED / EXECUTION_WINDOW_EXPIRED；分别保留1、0个Attempt |
| Cron幂等 | 实际每分钟Cron持续运行；到期后13:15:47、13:16:47两个scheduled事件均outcome=ok；25个临时Task ID与原始集合相同、25唯一schedule_key，无同一窗口重复Task |
| 不跨窗口 | 共8个Attempt，全部在各自due/window内领取、timeout_at不晚于window_end、无RUNNING；7份快照的observed/received均在原窗口与Attempt截止之前；窗口后领取数、上传数、重新生成过期窗口Task数均为0 |
| 终态真实性 | 短窗口Task最终7 COMPLETED、0 PARTIAL、2 FAILED；失败Attempt及过期Task由Helper/API/Cron自然产生，验收操作未修改这些终态 |

窗口到期后保持临时Plan启用，先观察两个真实Cron周期，再查询生产D1。13:25:55.079停用临时Plan，仅将其16个未来PENDING Task按现有停用语义取消为FAILED / PLAN_DISABLED。25个Task、8个Attempt、7份Snapshot及观察/事件历史全部保留，未执行DELETE。停用后再次比较：9个已结束短窗口Task及其Attempt、Snapshot、观察/事件逐字段不变，正式Plan和任务调度元数据仍完全相同。14:03的单次跟进已暂停。

证据保存于本地忽略目录 `.local/proofs/short-window-*`：formal-before、config（包含Cron生成的原始Task）、各轮watch、cron、final、verification、cleanup、after-cleanup。可通过上述生产ID复查D1；不提交认证材料。结论限于本次真实窗口及其后两个Cron周期，没有把短窗口实验描述为正式两小时业务窗口的到期实测。本次仅更新文档，未重复运行无代码变化的27项自动测试。

## Helper维也纳详情兼容性问题（独立记录，未修复）

以下为修复前记录；修复与新的真实复验见下一节，历史PARTIAL未改写。

正式14天Plan已自动生成任务，真实Helper执行与上传成立，但完整详情不能标为PASS。Task `638b35b1a40f0f22cf0c61229ea28212`（10月15～16日）与 `a8db0d6e41b0e7396c10f64b454ecaf7`（10月10～11日）均自然PARTIAL / PARTIAL_COLLECTION，快照分别为 `716271b3-173a-4fc0-8f32-682a6ed5d908`、`0170ae72-9811-49c7-b227-9b82d499e22f`：30家唯一酒店，三家详情成功2/3；我的酒店2114264与核心竞品6422421成功，维也纳6955433失败 `DETAIL_CARD_NOT_FOUND`。这里“2/3”是成功比例，失败为1/3。两份快照各保存9种真实房型，本次没有sold_out记录，不借用Gate H的售罄结果。

后续正式Task `5ca4f15e1ca6e7b56a97fe7970566a5f`、`07de2130c3604c66a5a3357be31cdc5e` 也保存30条列表、详情2/3及同一维也纳错误。Task `d206c4a22688e6802d129b55b3abbc74` 自然PARTIAL，保存22条列表、三家DETAIL_INCOMPLETE；其部分采集原因未在本轮定位。所有结果原样保留，不纳入临时窗口过期证明，也未修改Helper兼容逻辑。既有Gate H的历史3/3证据仍有效，但不代表这些新的入住日期全部成功。

## 维也纳详情入口最小兼容修复与完整详情复验（2026-10-01）

结论：完整详情复验PASS。以main 0a1d942为基线，仅修改Helper详情入口恢复、增加3项自动测试；没有修改Plan/Task/Attempt调度、自动计划、鉴权、Schema、市场展示、酒店映射或携程列表采集逻辑。`mobile.js`中detailLink之前的搜索、列表、房型解析函数与基线逐字节一致。生产正式14天Plan整行与验收前只读证据完全相同，仍正常启用。

真实复现与根因：错误 `DETAIL_CARD_NOT_FOUND` 发生于DETAIL_OPEN，尚未进入维也纳详情页。失败任务中我的酒店/另一核心竞品为第2/5位，维也纳为第15位（10月15日）或第14位（10月10日）。返回列表使用原有list_url重新加载，而首次DOM只包含首批酒店；旧代码找不到目标即失败，没有恢复后续批次入口。

13:35:15.164（UTC+8）Chrome DevTools只读公开DOM诊断重现10月15～16日：document.readyState=complete，`.hotel-card`只有12个，Hotel ID依次为111856815、2114264、1286886、6422421、116905374、2261358、15154559、121746305、10476245、740437、104586680、28327212；6955433不在DOM，携程显示“上拉加载更多”。卡片class为`xtaro-xview xt-xview hotel-card`，公开data-exposure.data.masterhotelid用于身份匹配；10月2日的页面首批已含6955433，图像URL带`_ubt_hotelId=6955433&`，同一旧Helper当天也曾完成三家详情。这说明差异在返回列表后的入口加载批次，不能归因于维也纳房型解析器或平台阻止详情自动化。

修复：仅在DETAIL_OPEN找不到冻结目标Hotel ID时，限45秒滚动实际列表容器并等待下次tick；返回pending，保持锁定市场列表、详情目标和原始参数不变。超时继续保存DETAIL_CARD_NOT_FOUND；切换到下一个失败目标时重置其入口等待起点。已有入口直接打开，原有详情上下文确认、房型选择器、价格及sold_out解析完全沿用。原有任务/Attempt剩余时间限制继续生效，不跨窗口。

真实加载证据：修复后10月12日Task的Helper日志13:44:55.404、13:44:57.521保存 `DETAIL_ENTRY_WAIT {cards:13,hotel_id:"6955433",ready_state:"complete"}`（cards为入口选择器候选节点数）；随后13:45:00.702详情房型卡片0、13:45:02.655为3、13:45:04.799为5，最终上传成功。房型卡片命中原有BASE_ROOM_CARD/RECOMMEND_ROOM_CARD选择器，无需改房型卡片结构适配。此处DOM入口诊断为人工只读检查，下面的Task搜索、列表/详情采集与结果上传由真实Helper全自动完成。

新增自动测试覆盖：首批缺失维也纳后加载目标，仅点击精确冻结Hotel ID；嵌套滚动容器恢复、45秒截止仍失败、相似ID不误点；我的酒店/另一核心竞品及公开exposure/attribute/image身份路径立即打开不回归。全套30项测试通过，Helper MV3、JS语法、数据库边界与git diff --check通过；测试Fixture仅在内存，不写生产D1。

当前已批准Mac设备56d208e8-90cd-49bf-ae84-b17a43d9f1b9已重载本次Helper，权限和设备身份不变。诊断/重载期间暂缓新领取后恢复自动接单，没有停用或改动正式Plan。另通过现有Helper“云端发布立即任务”创建10月15～16日、携程/咸宁/中心花坛/top30真实复验Task，使用原有45分钟窗口；没有人工领取、上传或改写终态。

| 真实复验 | 正式计划Task（10月12～13日） | 立即复验Task（10月15～16日） |
|---|---|---|
| Task | 9c5d448d3bfc6f848c362fb5e2939a0a | b1eb79b3-d503-4e3e-900c-955b8bed346b |
| 成功Attempt | #3 / 60552b2b-ec52-491b-b306-7803d33f6cec | #1 / 82157ede-e537-4f5b-9a11-3fe695ef0db8 |
| 执行时间（UTC+8） | 13:43:24.013～13:45:14.152 | 13:47:00.679～13:48:55.700 |
| 原始窗口 | 12:00～14:00 | 13:40:05.312～14:25:05.312 |
| Snapshot | 69c6c63a-8aae-4212-bc13-05f59da333cf | aee7e0b8-cbc8-4b27-9d55-3859d7af2652 |
| 最终状态 | COMPLETED / 详情3/3 | COMPLETED / 详情3/3 |
| 市场列表 | 30条、30唯一Hotel ID | 30条、30唯一Hotel ID |
| 三家排名（2114264 / 6422421 / 6955433） | 2 / 4 / 14 | 2 / 5 / 14 |
| 三家房型数 | 4 / 5 / 5，共14种 | 4 / 5 / 5，共14种 |

两份快照的Device、Task、Attempt、Market Observation、Room Observation及MARKET_LOCKED事件关联核验一致；observed_at在开始之后、received_at之前，上传在原窗口与Attempt截止之前。维也纳保存城景大床房、商务大床房、商务双床房、亲子双床房、家庭套房的真实价格与活动。两次均无明确sold_out，不借用Gate H的售罄数据。新的3/3结果支持本次兼容修复通过，不保证平台未来所有日期永远稳定。

正式10月12日Task较早的Attempt #1自然FAILED / DEVICE_OFFLINE，#2自然FAILED / SEARCH_CONTROL_TIMEOUT；两次发生在详情阶段之前，不作为维也纳修复失败或成功证据，原样保留。此前10月15日/10月10日的两个PARTIAL及DETAIL_CARD_NOT_FOUND亦原样保留。生产只读证据在本地忽略目录 `.local/proofs/vienna-watch-*`、`vienna-final.json`、`vienna-verification.json`；可按以上ID复查D1。此次没有修改平台页面、系统时钟或生产结果。

## V1.1生产稳定化：Gate G补证与轻量运行状态（2026-10-01）

本轮从4df8669（V1封板文档）继续，只增加现有任务页的只读汇总；无Schema迁移、鉴权调整、调度或Helper采集修改，无新增业务平台、OPS、采集字段或人工Task。第一阶段封板章节的Gate G缺口是当时事实，此次补证关闭该缺口，保留全部历史记录。

### Gate G生产操作证据：PASS

通过已有登录态的真实Chrome OTA酒店页面操作，选择非核心酒店ctrip/1286886，平台原始名称“7天优品酒店(咸宁温泉购物公园店)”。建立标准酒店“7天优品酒店·咸宁温泉购物公园店”，分类other，永久LIVV Hotel ID为9376a9c7-87c3-4f71-b9a5-82d7ab8210ba；不加入核心详情目标。

| 时间（UTC+8） | 真实操作与核验 |
|---|---|
| 14:52:14 | 创建标准酒店，分类市场其他；固定永久LIVV ID |
| 14:52:54 | 确认正确映射；mapping_history id=4，action=link |
| 14:54:11 | 标准名修改为“7天优品酒店·咸宁温泉购物公园店（Gate G 名称验收）”；OTA和D1均确认永久ID不变，平台Hotel ID/原始名称不变 |
| 14:55:05 | 解除该测试映射；history id=5，action=unlink；真实市场页面仍展示原始名称、市场其他、排名3、起售价¥127 |
| 14:56:29 | 恢复正式标准名称，原永久ID与other分类不变 |
| 14:57:04 | 重新关联同一LIVV ID；history id=6，action=link；刷新真实市场页恢复标准名称、市场其他、排名3、¥127 |

改名/解除/重连三个阶段只读D1导出与操作前逐记录比较：全部Plan整行一致；我的酒店2114264及核心竞品6422421/6955433映射整行一致；1286886平台原始Hotel ID/原始名称一致；操作前15条market_observations按snapshot_id逐字段一致。目标历史room_observations为0，不冒充房型历史比较通过。本轮没有观察记录写入/删除。期间正式Plan自然采集追加1条目标Observation，最终16条；追加数据不算历史改写。

正确重连保留为真实市场其他酒店的正式映射，不留验收后缀；没有建立或修改测试Plan/Task。映射操作历史不删除。原始导出及比较位于本地Git忽略目录.local/proofs/v11-mapping-before.json、v11-mapping-renamed.json、v11-mapping-unlinked.json、v11-mapping-relinked.json、v11-mapping-comparison.json；日志id及关键不变量已记录于本节供交接。

### 轻量运行状态：PASS

现有“任务”页调用GET /v1/admin/runtime，沿用管理员鉴权，只读既有Task/Attempt/Device/Snapshot，不调用reap、Scheduler或其他写入。业务日为Asia/Shanghai 00:00～次日00:00半开区间，以Task.window_start归属；统计当前enabled=1的Plan已生成任务，含未来待执行窗口，排除独立手动Task与停用验收Plan。今日“计划任务数”是已生成记录数，不是全天理论排期数；计划启用当日为25，完整业务日14天计划理论39。

COMPLETED / (COMPLETED + PARTIAL + FAILED)为终态成功率；PARTIAL不算成功，无终态返回null显示—。Attempt次数为该任务集合所有Attempt累计次数；Task与Attempt错误分别聚合展示，不能把两来源相加当独立故障总数。在线设备仅approved且心跳距服务器统计时间不足120秒，列出运行中Attempt状态、最近心跳及设备最近错误，无凭证字段。最近成功采集时间为当前启用Plan的COMPLETED快照received_at（所有业务日，不局限今日），无成功返回null。页面刷新更新，无新监控服务或自动唤醒。

14:57:57生产OTA显示并于14:58生产D1对照：25个今日已生成Task，COMPLETED=4、PARTIAL=5、FAILED=1、PENDING=15、RUNNING=0；终态成功率40.0%（4/10），19次Attempt。错误代码：Attempt SEARCH_CONTROL_TIMEOUT=7、ATTEMPT_TIMEOUT=2、DEVICE_OFFLINE=1；Task PARTIAL_COLLECTION=5、EXECUTION_WINDOW_EXPIRED=1。最近成功上传14:45:07.923。唯一设备56d208e8-90cd-49bf-ae84-b17a43d9f1b9 approved/Helper 1.0.0，当时在线空闲，心跳14:58:23.232、last_error=null；历史Attempt错误仍原样保存，设备最新心跳清除最近错误并不删除历史。

5个正式Plan历史PARTIAL分别完成于12:51、12:55、13:05、13:12、13:21，早于已通过的13:45/13:48详情复验；四项Vienna DETAIL_CARD_NOT_FOUND、一次全部DETAIL_INCOMPLETE均保留。14:00自然终止的FAILED/EXECUTION_WINDOW_EXPIRED亦保留。此统计包含旧版失败，不能据40%把修复后的成功复验改写为失败，亦不能剔除旧失败美化成功率。ATTEMPT_TIMEOUT只有2次，继续观察，不据此调整状态机。

新增2项自动测试：鉴权拒绝/空数据；209条任务不受任务列表200条上限影响，业务日左右边界、手动/停用计划排除、PARTIAL分母、失败重试错误、在线/离线/未批准设备、无凭证输出、成功时间与只读不回收。全套32项自动测试通过，scripts/check.mjs语法/Schema边界/MV3检查通过；生产真实任务页和布局已核验。测试Fixture仅内存，无生产Fixture。

正式Plan3963a563-7687-45dc-9b2a-d33cbdd0cd7c仍enabled=1/horizon=14，created_at/updated_at保持2026-10-01T04:41:45.228Z，每分钟Cron不变。唯一短窗口验收Plan仍enabled=0且活动Task=0，所有独立历史Task均终态。只读统计/健康证据：.local/proofs/v11-runtime-d1.json、v11-health.json。此次部署API及OTA成功，API / OTA / LIVVCC健康200（API database=ok），版本见部署文档。完成此范围后停止新增开发，保持当前已批准Helper电脑Chrome在线，由正式Plan自然积累真实数据。
