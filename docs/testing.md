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

## V1.2市场UI第一版（2026-10-01）

从03ec90c继续，本轮代码修改只限ota/public及tests/market-ui.test.js；API、Helper、Schema、Task/Attempt/Plan与正式14天排期无改动。保持一级导航市场/任务/酒店/设备、默认市场。

市场页复用现有market/runtime接口：选中入住日期快照展示我的酒店起售价/平台/排名、市场中位价与有价样本、最高/最低价格及对应真实酒店名称；并列极值显示第一家与同价酒店数。分类与标准名称仍来自当前人工映射。策略直接使用API recommendation/reason/facts，不重算或伪造。当前快照的列表SUCCESS/部分结果、详情成功数与生产最近COMPLETED上传/在线设备分开展示；没有快照/价格/策略显示—或明确暂无。生产最近成功是当前启用Plan的最新COMPLETED，不等于所选日期最新快照，不把PARTIAL美化成完整成功。

桌面五卡一行、固定204px深色侧栏、白色卡片/克制阴影/蓝色主强调。一张SVG图展示我的酒店/最高/中位/最低四线，默认14天支持30天，日期与价格轴、每日期四价格Hover及键盘焦点Tooltip；缺失日期断线，单点独立保留，无插值。

酒店分类按钮对应我的/核心/竞品/观察/其他，另有全部；酒店表第一列标准名或原始名（分类小字置于名称下），后续按API实际平台分组，当前仅携程排名/起售价。按永久LIVV ID归组，未映射按platform/Hotel ID区分，缺平台单元格留—；不显示无真实数据的美团/飞猪列，不新增类型/趋势/导出/操作。排名及价格Hover保留平台名、原始酒店名、平台Hotel ID、划线价、活动、起售价。历史策略以可展开区域保留。

本地UI用原有API handle和生产D1只读SELECT响应预览，临时服务器绑定127.0.0.1，拒绝非GET/SELECT，仅开放market/runtime；无Mock生产数据、凭证转存或生产写入。1440px桌面检查后修正长策略文字撑宽卡片，五卡一行无溢出。真实30家快照核验：我的酒店¥190/排名2，中位¥192、最高¥636/全季、最低¥86/乘悦；图表10月1日四值悬浮一致；核心分类两家，Vienna价格Hover原始ID6955433/划线¥241/活动优惠23/起售价¥218。上述仅为验收快照示例。30天显示30个日期悬浮区域；10月3日无快照、全市场无数据查询正确显示空卡片/空表，保留其他日期真实走势。390px手机检查document宽度=viewport=390，卡片换行、表与图局部横向滚动，桌面密度保持。

新增2项UI自动测试：真实接口结构字段对应五卡与横向列/原始悬浮身份、仅GET现有接口；空数据/30日期/四项缺失悬浮/无虚构价格及策略。连同既有断线/小数测试，全套34项npm test通过；npm run check通过；OTA wrangler deploy --dry-run构建通过，无新增依赖。运行时原带Node24但无npm，指定命令临时通过官方npm11.6.0执行，项目lockfile不变。本轮不创建验收Task，不重载/修改办公室Helper，正式Plan自然运行。线上Git部署与生产核对结果记录于部署文档。

V1.2线上验收：f3363f7自动Git构建成功，真实已登录OTA市场14/30天、分类与价格Hover检查通过，详见docs/deployment.md。正式Plan前后整行一致，批准Helper在线；发布前既有API_TIMEOUT保留，新自然窗口尚未执行，不冒充新任务采集PASS。

## 走势观察周期交互调整（2026-10-01）

页面顶部仅保留入住日期与市场范围。未来价格走势标题旁使用“未来14天 / 未来30天”胶囊，默认14天，副标题仅“按入住日期观察”。未来14天含T～T+14共15个入住日期；未来30天含T～T+30共31个。此节替代上一版14/30点展示约定，历史验收记录原样保留。

独立图表请求仅GET既有market接口，使用inclusive=1读取包含末日的真实快照；原API省略该参数的14/30点响应兼容。周期响应只替换图表及胶囊状态，不更新卡片、入住日期、范围、酒店分类或表格；并防止快速切换的旧响应覆盖新选择。顶部入住日期始终可选至T+30，选中T+30再切回14天不会重置入住日期。

四种颜色及真实点位保留，我的酒店主线增加淡蓝渐变区域；单调三次曲线仅平滑已有连续点，缺失日期拆分路径及区域，不生成观察值、不跨缺失连线。悬浮包含日期、周几、T+n、节假日提示及四项真实价格（缺失—）。普通日期灰色、周五周六蓝色、节假日假期优先暖色。2026年假期仅采用[国务院办公厅公布安排的官方转载](https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html)，未知年份明确安排未确认，不猜测农历节日或创建业务字段。

38项npm test通过，npm run check及OTA Worker dry-run构建通过。新增验证覆盖15/31端点、T+30真实快照可读、旧接口响应兼容/非法参数/只读、周期切换不改变卡片与表格、选中T+30不变、快速响应竞态、周末/假期优先颜色及缺失断线。所有任务Fixture仅内存。

本地1440px预览使用真实生产D1的只读SELECT；默认15点、切30天31点，切换前后入住日期/范围/卡片/核心竞品表HTML逐项一致。无生产Mock或人工Task；正式Plan、Helper、Schema、调度与市场统计口径未修改。线上发布核验补记于部署文档。

## Helper正式Side Panel UI V1（2026-10-01）

界面迁移使用Chrome Side Panel，白色卡片、采集/任务/日志导航；后台仍唯一持有active、单任务执行timer与设备凭证。关闭界面只清理显示刷新timer，重开读取既有持久状态。新增权限仅sidePanel，携程/API主机范围、debugger输入约束和原解析器不变；旧popup与全部DOM探测/权限检查/禁用探测保留。依据[Chrome官方Side Panel文档](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)。

立即采集沿用TASK消息→既有POST /v1/device/tasks，当前设备依序领取；没有本地绕过执行，没有新增cancel或业务状态机。自动接单开关只暂缓新领取，不中断active。市场列表与详情处理数分别展示，详情完成数含成功+失败并明确失败数；失败时间线显示真实错误。设备名称仅云端读取，API/在线以最近真实心跳判断，不伪称无错误。

任务页为当前Helper本地最近30条创建/执行记录，非完整云端历史；仅API确认的COMPLETED/PARTIAL显示为Task终态。fail接口只确认Attempt失败，Task可能重排，因此Task显示待云端确认；服务器失去active也不猜测最终状态。本地记录追加最近5次Attempt摘要，不覆盖云端历史。清空日志仅清本机logs，不删除任务缓存、观察或云端事件。性能剖析草稿按用户最新“本轮只做UI”要求暂存，阶段数据未记录时明确暂无，不制造示例耗时。

新增6项自动测试覆盖持久状态恢复/无凭证输出/列表详情分开、PARTIAL和Attempt失败与Task未知区分、精确可信扩展页面消息来源、MV3/主机边界/无cancel、云端TASK提交与关闭仅销毁显示timer、本地多Attempt失败摘要保留；连同既有测试44项通过，MV3构建/语法/数据库边界检查通过。真实验收完成证据继续补记，不将此自动测试当真实采集PASS。

### 真实Chrome验收：UI链路PASS，历史错误原样保留

办公室Mac设备56d208e8-90cd-49bf-ae84-b17a43d9f1b9空闲时重载Helper1.1.0，注册身份、审批与权限沿用；实际Side Panel打开、采集/任务/日志导航、云端设备名、在线心跳及30家/详情分段进度核验通过。此前为安全重载暂缓新领取，最终已恢复auto=true。没有改动Task频率或Plan开关。

| 类型 | Task / Attempt / Snapshot | 真实结果 |
|---|---|---|
| 正式Plan自然领取 | a307530ce0142765261ab66488843a31 / 791aa7c4-5770-4559-afdd-1650dc3994e6 / ccc069e6-2ba7-49e8-9c88-e176e940aaf3 | 17:53:05～17:54:44，10月1～2日，COMPLETED，30条/30唯一ID、详情3/3，房型4+5+3=12，明确sold_out 3条 |
| 从Side Panel“开始采集”创建 | c00da60e-a10d-4529-b2dc-6bd00cf61318 / f9322c9e-2648-4987-9757-09a50963198f / cc3a3d94-a03b-44f9-b274-ca98ad24df79 | 17:52:53云端正式创建，preferred_device为当前设备；先执行既有生产任务，18:00:21～18:01:59自动执行10月2～3日，COMPLETED，30条/30唯一ID、详情3/3，房型4+5+4=13，明确sold_out 2条 |

三家为2114264 / 6422421 / 6955433。两份快照Attempt/Task/Device关联一致，observed_at在started_at之后、received_at之前，上传在原窗口内。5条sold_out均真实房型卡片“已订完”，original_price/display_price均NULL，不将缺价猜为售罄。不同入住日期房型数量如实保存，不借用历史14房型补齐。携程mobile.js、input.js、detail-state.js、ready.js与本轮基线逐字节相同。

第一次在a307530详情阶段关闭Side Panel，后台继续完成并上传；第二次a0dc4e2c59d7ae37f65f8efef8d15d09执行中快速关闭重开，仍显示相同Task及Attempt04c509ee-006d-4b0b-8da1-f14533774f71，搜索阶段继续推进。该Task随后出现INPUT_TARGET_CHANGED，并自然保留3次失败Attempt：SEARCH_CONTROL_TIMEOUT、ATTEMPT_TIMEOUT、ATTEMPT_TIMEOUT；18:00原窗口结束后Task最终FAILED。此失败不改写、不删除，不将上述两个COMPLETED宣称为所有任务均无错误。搜索控件超时/输入目标变动在本轮UI迁移前的生产样本已存在，但尚未证明本次失败的具体因果；单独保留为后续采集可靠性/性能剖析观察项，本轮不修改搜索状态机。任务页对未获云端终态确认记录仍显示待云端确认。

生产Plan前后整行完全一致，唯一临时验收Plan仍停用；18:06:50设备approved/1.1.0/last_error=null，无RUNNING Attempt；18:08最终展示修正重载后auto=true、在线空闲。最后小修仅保留本地多Attempt摘要、避免提交期间刷新重新启用按钮，不改采集执行。证据位于本地忽略目录.local/proofs/sidepanel-before.json、sidepanel-final.json、sidepanel-tests.txt及真实Chrome截图。未使用生产Mock、修改终态或新建验收Plan。

18:13最终已登录OTA真实刷新，仍正常读取新生产快照：当日最新17:53:54，详情3/3、30家有价样本、中位¥189.5，生产最近COMPLETED为17:54:44（只统计正式启用Plan，18:01手动任务不纳入该运行指标）。Side Panel在切换到OTA后仍在线、空闲、auto=true；重载后任务页仍保留c00da60e的真实COMPLETED、13房型及Snapshot ID。API health=200/database=ok，LIVVCC=200，未登录OTA仍正常302至Access；不把302代替已登录应用核验。日志/开发工具实际打开检查通过；不清空本机历史作为演示。

## MARKET_LIST快速导航真实验证（2026-10-01，Helper1.2.0）

先通过真实携程UI生成A/B/C URL，实际DOM曝光验证城市937、日期、中心花坛/咸宁北站关键词；参数对比、失败候选和限制见helper-fast-navigation.md。精简URL实际落到上海和错误日期，未采集上传；保留完整opaque原生参数后日期切换匹配。没有伪注入input/change、生产Mock或改写终态。

新增及新物化Task显式MARKET_LIST，列表达到目标即上传、不进入详情；旧Task默认LEGACY_MARKET_DETAIL，不改历史契约。迁移仅增加task_type；领取空core_hotels由API冻结，现有上传校验拒绝MARKET_LIST详情/房型。独立COMPETITOR_DETAIL及其自动计划尚未实现，本轮不宣称独立详情PASS。

51项npm test通过，npm run check/MV3/语法/数据库边界及API Worker dry-run通过。新增验证覆盖真实曝光城市ID/日期逐卡一致、隐藏关键词拒绝、导航资料须完整Context、原生opaque URL仅替换日期、未知城市/关键词/过期资料/日期缓存/不安全URL回退、列表任务拒绝额外详情并正常COMPLETED、旧详情契约保留、新物化类型/幂等/Plan不变。既有自然优先广告去重测试继续通过；本次DOM样本未出现同Hotel ID广告/自然重复，不宣称新实际重复案例已覆盖。

真实办公室Mac设备56d208e8-90cd-49bf-ae84-b17a43d9f1b9，approved，单设备单任务，三次均Helper→API创建正式Task→设备自动领取→真实DOM→D1，没有本地绕过。首次navigation_profiles取自已验证原生UI页面；不将冷启动UI自动缓存或故障后的完整UI回退标为独立真实PASS。最后一次在空闲重载最终源码后从Helper“开始采集”真实表单创建。

| Task | Attempt | Snapshot | 入住→离店 | 结果 |
|---|---|---|---|---|
| f80a622c-c506-4167-ab6e-0c4cc50a27e0 | 455da2a0-99db-4156-a639-3fea8ae24f11 | e0b0d4fe-469b-42f3-a61b-6f1c97226350 | 10/05→10/06 | COMPLETED，30唯一ID，详情0/0，房型0 |
| ed8365eb-25f6-4413-bae8-87da4976fcdc | bcd2f863-c908-463b-8700-d883acb0fc6a | 885707ed-f5f4-4f53-a8bb-27e1909cdaff | 10/06→10/07 | COMPLETED，30唯一ID，详情0/0，房型0 |
| ea16f8b1-7a42-4168-9ce5-30de4189c394 | 9c9f89d9-a51c-4bde-9b95-90ef66d47da7 | a0980c77-d57a-44df-9dc5-f72bc81f0c65 | 10/06→10/07 | COMPLETED，30唯一ID，详情0/0，房型0 |

三次Context均咸宁/中心花坛，日期如上。D1 Task/Attempt/Device/Snapshot/Observation关联一致、有效时窗内上传。A及最终复验各30条与当次DOM逐行对照，Hotel ID/原名/排名/广告标记/起售价/划线价零差异。B任务后只读检查遇到后续正式任务已换页面（10/05、空关键词），该诊断不作为B的DOM对照，不混入B数据；B仍以其真实严格Context事件和D1快照为证据。观察原始值不借用前次结果。

| 秒 | 快速A | 快速B | 最终复验 | 三次平均 |
|---|---:|---:|---:|---:|
| 领取→LIST_READY | 4.877 | 4.673 | 4.803 | 4.784 |
| LIST_READY→锁定30家 | 24.865 | 25.163 | 26.927 | 25.652 |
| 领取→锁定30家 | 29.743 | 29.836 | 31.730 | 30.436 |
| MARKET_LIST总耗时（至上传响应） | 31.008 | 31.274 | 32.901 | 31.728 |
| 上传请求→响应 | 0.884 | 0.929 | 0.835 | 0.883 |

旧真实UI流程同城市/关键词/日期的领取→30家锁定：bfe9075d17df123bf8e8e9d3f3ac0763/da33525f-83c2-4f3a-a445-9f08489a767f为54.674秒，7257e234-3fec-4f59-bc1a-aa219fb9af7c/6e94b1a2-1f14-4e69-8183-de85734fc9b1为53.637秒（均10/05），cf8a5b97-7fd9-494b-bf7d-a1af34c456b8/22ca345d-4b4c-4745-b2fd-27e13a019513为58.447秒（10/06）。同端点均值55.586→30.436秒，降低45.2%。新列表任务总耗时P50=31.274秒；仅3样本不报告P95。旧样本没有LIST_READY独立时间戳，也没有列表单独上传总耗时（后续含详情），两项保持缺失，不用合并任务总时长冒充列表基准。不根据此小样本外推全天吞吐或所有关键词都更快。

已知问题原样保留：旧合并Task526c8ed38f61ce423d8b2fbfd4233ad3曾DEVICE_OFFLINE/搜索等待失败；2731c369129837b134ff43dd616593d2自然PARTIAL、仅12家，错误PARTIAL_COLLECTION。其UI_FALLBACK领取→ready29.017秒、总76.904秒不是成功30家速度基准，不清洗成成功。本轮保留UI fallback但未修复原有输入/滚动可靠性问题；完整运行时Context错误→UI成功上传的真实故障注入仍未验收，不宣称全覆盖。未改tick、滚动、详情DOM或sold_out规则。

正式14天Plan3963a563-7687-45dc-9b2a-d33cbdd0cd7c整行与本轮开始一致、enabled=1/horizon=14/updated_at=2026-10-01T04:41:45.228Z；原临时Plan仍停用，本轮未创建Plan、不改变频率。三个少量真实手动Task作为真实观察保留，未删除历史；后续新物化任务为MARKET_LIST，原已存在Task仍旧合并契约。证据.local/proofs/fast-nav-production.json、fast-nav-final-production.json、fast-nav-old-baseline.json、fast-nav-A-row-comparison.json、fast-nav-final-row-comparison.json及真实截图。最终设备自动接单保持启用。

21:20最终只读核对Plan整行完全一致，设备approved/1.2.0、心跳21:20:50，无RUNNING Task。20:41:20本地记录HELPER_ERROR/Failed to fetch，设备last_error仍HELPER_ERROR但随后心跳继续成功；API health=200/database=ok。保留此网络/领取错误观察，不因三次成功消除它，也不宣称所有生产错误已解决。

## 未来价格走势等宽列与浮动Tooltip（2026-10-01）

仅ota/public图表布局、交互和测试变动。未来14天仍T～T+14共15列，30天T～T+30共31列；每列至少64px，宽屏按比例填满，超宽只滚动chart-scroll绘图区，标题/周期/图例保持在外。所有日期MM/DD显示，不稀疏标签或删点。普通背景透明，周五/六浅灰蓝，法定假期浅暖色且优先；调休上班按普通背景。日期字色统一，2026调休日期来自既有官方通知（10/10周六普通背景，Tooltip调休上班）；未知年份继续明确安排未确认。

整列从绘图区上部到日期区域响应鼠标与键盘焦点；唯一active-day参考线/轻高亮，四条线当天实际点同时强调。Tooltip约280px，日期/星期/T或T+n/假期或调休标签，两列价格对齐、我的酒店权重最高。mouseenter/focus选择日期，mousemove更新位置且同列不改内容或高亮点；左右按可视区域翻转，16px间距并上下限位，pointer-events:none，无延迟动画。滚动隐藏旧提示，继续移鼠标重新显示当前真实日期。表格Hover仍用原身份Tooltip，没有更改酒店列表交互。

53项npm test通过，npm run check及OTA Worker dry-run通过。新增测试覆盖15/31列完整等距/最小宽度/所有日期/全缺失无点、调休背景，以及Tooltip上下跟随、左右翻转/列外间距/四边界。既有缺失断线、单调平滑曲线/我的酒店渐变区域、真实小数中位价、周期请求竞态及不改变入住日期/范围/酒店列表测试继续通过。

本地预览经现有API Worker查询生产D1，只允许GET与SELECT（无写入）；1280px下列宽64px，1440px下14天15列填满1120px可视区、每日约68.923px，30天31列绘图区2064px/可视1120px，横向滚至944px显示末日10/31。真实10/03 Hover显示周六/T+2/国庆节假期及190/361/170.5/83，鼠标Y从300移220时提示top从316移236，日期和4高亮点不变；底部向上限位、右半区提示向左均通过。10/10背景透明，10/09周五浅色，国庆列暖色。滚至10/31仍可整列Hover，四项全部—、0高亮点，无补0或延伸10/19后的曲线。截图.local/proofs/chart-14-tooltip.png、chart-30-missing.png；真实API响应保存在本地忽略目录，未用Mock。

本轮未修改API、数据库、Helper、Task、Attempt、Plan、观察/统计口径。开发期间正式Plan自然成功采集（21:42:15观察，21:43:13成功上传）仍显示于真实只读预览，不将其算作图表开发触发的验收任务。未重载Helper、创建任务或写生产数据；设备/Plan只读证据.local/proofs/chart-production-status.json。

## Tooltip紧凑视觉（2026-10-01）

仅视觉调整：浮层目标宽250px，CSS允许230～270px，标题日期/星期/T+n与假期Badge分层排版；国庆展示“国庆假期”，法定假期统一暖色白字21px小圆角标签，调休及安排未确认用中性标签。价格名称缩为市场最高/中位/最低，两列对齐、四行12px，只有我的酒店名称/价格加粗，行高1.6。原data-tip与aria-label保留完整语义，鼠标跟随/翻转/边界/整列Hover、15/31列和缺失断线逻辑未改。

53项自动测试、check、OTA Worker dry-run通过；未改API、Helper或任何生产任务/计划/数据。重新启动真实API本地预览时Cloudflare查询发生网络超时，未将失败预览标记为成功；上线后以实际页面复核视觉。

视觉提交dab3ede76ce12a1d4028658f25b42800be69924f已Push且Cloudflare OTA completed/success。真实Chrome线上刷新验证：10/03暖色国庆假期Badge、190/361/170.5/83未变；同列上下移动仅浮层位置变化；10/10中性调休上班Badge、右半区向左翻转及165/256/125.5/68正确。屏幕2x显示的500物理像素对应250 CSS px，四行字号一致、我的酒店加粗。线上证据.local/proofs/tooltip-compact-online.png。Helper1.2.0保持在线，未操作其任务入口、重载或改变设备配置。

## MARKET_LIST跨设备冷启动补验（阶段A完成，2026-10-01）

Helper1.2.1补充随扩展的已验证原生导航模板，仅咸宁/中心花坛；54项test及check/MV3通过。严格城市/日期/可见关键词/所有卡片曝光验证、自然结果优先去重、30家立即上传与UI fallback保留。独立浏览器原生B完整URL及改日期回放验证通过，删除opaque跟踪字段的候选真实Context失败，无上传。详见helper-fast-navigation.md。

Mac空闲重载且自动接单不变，真实Task8715c2ee-a426-4f7b-a827-2115ea08c626，Attempt13b87340-717c-49f1-bae6-a5f0dcf3863e，Snapshotc9de528c-cc85-46da-8c89-6f6153de38af：咸宁/中心花坛/10月2日→3日，FAST_NAV_START/VERIFIED/LIST_READY/锁定/上传/COMPLETED真实关联。领取→ready5.368秒，ready→锁定26.390秒，领取→终态32.700秒；列表30条/30唯一Hotel ID，排名1～30，无缺失价格，详情0/0，房型0。未进入UI搜索，未出现SEARCH_CONTROL_TIMEOUT；本轮Mac样本1/1，不外推长期成功率。此任务可能复用现有缓存，不能将它单独当作无缓存冷启动实测。

生产累计MARKET_LIST：截至23:03，Mac 5次均FAST_NAV_VERIFIED且COMPLETED；Windows原1.2.0五次均无本机资料→UI fallback，四次SEARCH_CONTROL_TIMEOUT/一次DEVICE_OFFLINE，同一Task5314f0af-7f0d-4e7e-92ab-03fe36742deb最终MAX_ATTEMPTS_REACHED。Windows新版本尚未重载/执行，耗时与新路径成功率保持缺失，跨平台未PASS。用户确认今晚无法访问Windows；阶段A不等待，阶段B明天设备可用后验收。已提供1.2.1验收包，保留Device ID。

正式Plan3963a563-7687-45dc-9b2a-d33cbdd0cd7c enabled=1/horizon=14/updated_at=2026-10-01T04:41:45.228Z，旧临时Plan仍停用，本轮未改API/Schema/Plan/历史观察或市场UI。证据.local/proofs/cross-platform-nav-current.json、cross-platform-before-reload.json、cross-platform-independent-context.json、cross-platform-mac-1.json、cross-platform-mac-upload.json、cross-platform-mac-page.png。以上为第一轮记录；后续按用户阶段A授权完成多轮Mac后Commit/Push，Windows保持PENDING。


### 阶段A最终验收

FAST_NAV Mac: PASS

Windows FAST_NAV real-browser acceptance: PENDING

| Task / 入住→离店 | 领取→LIST_READY 秒 | LIST_READY→30家锁定 秒 | 领取→真实终态 秒 | 导航 / 结果 |
|---|---:|---:|---:|---|
| 8715c2ee-a426-4f7b-a827-2115ea08c626 / 10/02→10/03 | 5.368 | 26.390 | 32.700 | FAST_NAV / COMPLETED |
| 7a3f9420-66a0-4e15-a52c-fa87da094adc / 10/02→10/03 | 5.900 | 25.854 | 32.778 | FAST_NAV / COMPLETED |
| 106811e2-120e-405e-a949-3c1e6b59d3cb / 10/03→10/04（无缓存） | 5.016 | 26.885 | 32.955 | FAST_NAV / COMPLETED |
| 三轮平均 | 5.428 | 26.376 | 32.811 | FAST_NAV成功3/3 |

总耗时P50=32.778秒，仅3个样本不报告P95/长期成功率。三轮均无FAST_NAV_FAILED/CONTEXT_MISMATCH，无UI fallback，无SEARCH_CONTROL_TIMEOUT，30条/30唯一Hotel ID、排名1～30、价格完整、详情0/0、房型0；实际城市咸宁、关键词中心花坛、日期分别如表，FAST_NAV_VERIFIED表示可见关键词与每张卡片城市ID/日期严格验证通过。第二轮Attemptfc8337e7-d0d1-4380-9f39-231a6814f64e/Snapshotccedbcf6-b805-40b6-983d-1aefd815dd00；第三轮Attempt6504f653-9251-47d2-8aeb-e8e10525377b/Snapshotb622bc3e-983f-4fc0-bba8-f9c30bd2dc49。

第三轮无缓存证据：空闲Service Worker检查NAV_CACHE_CHECK active=false，随后仅remove navigation_profiles，NAV_COLD_START={}；立即创建正式设备Task，无本机模板也直接FAST_NAV，达到30即上传。Task后使用既有inspectList只读读取受管页33张卡片，按原自然优先去重/排名截取30，与D1上传逐行对照Hotel ID、平台原名、rank、is_ad、划线价、起售价零差异；context_verified=true且unparsed_cards=0。没有重新加载列表后借用另一页面结果，没有伪造输入值/事件或手写终态。

同日期10/02→03、同城市/关键词的旧UI成功Attemptf9322c9e-2648-4987-9757-09a50963198f和3251ae8f-630a-4a75-8d38-111744267b91，统一用云端CLAIMED→MARKET_LOCKED事件时间，50.701/48.352秒，平均49.527秒；本轮同日期前两次32.044/32.056秒，平均32.050秒，缩短35.3%。旧任务总时长118.480/98.817秒含三家详情，不冒充纯列表基准；旧第一条无LIST_READY独立记录，保持缺失。已有1.2.0缓存快速路径三轮平均总时长31.728秒，本轮32.811秒，不声称1.2.1比已生效的缓存路径更快；本次改进重点是冷启动无需先完成UI搜索。不同采集时刻市场价格本可变化，不要求跨任务价格恒等。

证据：.local/proofs/phase-a-three-mac.json、phase-a-performance.json、phase-a-cold-cache.txt、phase-a-final-dom-rows.txt、phase-a-final-comparison.json、phase-a-matching-baseline.json、phase-a-mac-pass.png、phase-a-tests.txt。54项自动测试、MV3构建/语法/数据库边界检查通过。历史Windows四次SEARCH_CONTROL_TIMEOUT/一次DEVICE_OFFLINE、Mac旧合并任务失败/PARTIAL及原网络错误均保留，不清洗。正式14天Plan整行与既有基线未变，临时Plan仍停用。

### 阶段B待验收清单

Windows FAST_NAV real-browser acceptance: PENDING。设备“酒店办公室”3cad8b8e-0a99-410d-9fb3-8e1bf88004c7明天可用后，空闲时更新/重载1.2.1，保留身份，保持自动接单；创建同参数真实MARKET_LIST（咸宁/中心花坛/10/02→03或与Mac同期相同有效日期/30家）并记录Task/Attempt/Snapshot。必须确认不点击城市/日历/关键词，直接目标listPage，FAST_NAV_VERIFIED/Context PASS、30唯一酒店/正确排名价格、上传COMPLETED，详情0/房型0；记录领取→ready、ready→锁定、总时长及有无fallback/SEARCH_CONTROL_TIMEOUT。PARTIAL/FAILED如实保留，只有真实成功才标记Windows PASS及跨平台PASS。今晚不等待、不安排未经请求的自动验收。
