# 设备环境补充接口（Agent 1.3.4）

POST /v1/device/environment：沿用已有设备ID+凭证认证；pending/approved 可补充环境，disabled 禁止。它不注册、不批准、不更新设备名称或身份，不授权领取。只接收 environment 白名单标量与至多24个布尔能力项；未知/敏感字段丢弃；只有JSON不同才UPDATE。无D1直连或新增权限。

POST /v1/device/heartbeat 增加可选 runtime 白名单对象。旧客户端不传时兼容；最近在线/错误/版本仍使用原字段和现有语义，实际版本变化时间才保存。静态信息不随每次心跳重传。

GET /v1/admin/devices 与 /:id/diagnostics 增加解析后的 environment/runtime/version_changed_at 与 health。health 的24h任务按最新Attempt的device归属去重，完全成功率分母为已结束Task（COMPLETED/PARTIAL/FAILED），待执行/运行不混入；原Attempt分组/错误仍保留。最近执行耗时与MARKET_LIST平均值按真实Attempt领取→结束计算。FAST_NAV率分母为存在已记录导航事件的Attempt，成功须FAST_NAV_VERIFIED/FAST_NAV_SUCCESS；回退次数按FAILED/MISMATCH的Attempt去重。无记录时比例null，不推断为成功或失败。运行阶段只有与D1当前Attempt匹配才显示，空闲/执行中以云端Attempt为准。

# API V1

## POAI 当前入口（2026-10-02）

统一入口 https://api.poai.cc，OTA同源/api/继续通过原Service Binding转发。管理员生产写来源只允许ota.poai.cc；OPS/AI首版不调用跨源API，不放宽鉴权。当前设备鉴权头为 X-Device-ID；标准酒店接口与映射字段为 standard_hotels / standard_hotel_id。此命名切换客户端和 API 同步部署，实际永久 ID 保留。

原telemetry增加可选白名单error_code/diagnostic；诊断仅API_RESPONSE_NOT_JSON/NETWORK_FETCH_FAILED，不接收自由日志正文、HTML、Cookie或Token。关键错误/终态写agent_logs，其他事件维持Analytics。终态须匹配D1，不通过事件修改任务。

diagnostics追加agent_logs（最多100条D1关键记录）、logs（最多100条既有D1执行事件）；返回device_id/app_version/task_id/level/event/message/error_code/metadata/created_at等字段。历史应用版本未知保持NULL；Analytics仍可能采样，不作完整审计依据。

## Helper V1.3运行事件与设备诊断

POST /v1/device/telemetry：沿用已批准设备鉴权，body={events:[...]}，最多25条；接受白名单事件、24小时内/未来最多60秒的occurred_at、UUID事件标识与有限标量字段。设备身份由鉴权决定，关联task_id/attempt_id必须属于该设备。TASK_COMPLETED/PARTIAL/FAILED必须匹配D1 Task真实状态；ATTEMPT_FAILED必须匹配执行FAILED，仅Task真实FAILED才转换为TASK_FAILED。绑定不可用返回available=false，Helper独立重试，不改变Task状态。字段与隐私边界见helper-observability.md。

GET /v1/admin/devices/:id/diagnostics（OTA代理/api同路径）：沿用现有人类Access鉴权，只读。返回at/since、device（无credential_hash，approved且心跳不足120秒才online）、最近20次执行及其Task/Snapshot、24小时关联Task真实状态分组/Attempt状态分组/主要Attempt错误，以及已完成MARKET_LIST执行平均领取至完成耗时与样本数。范围是该设备最近24小时领取的执行，含人工及正式Plan任务，不冒充正式计划今日统计；缺失不填成功。

analytics返回available/reason/events，限该设备24小时最多100条采样事件，按event_id去重；时间使用occurred_at，数值缺失null。查询使用固定SQL、ID校验、5秒上限与Worker Secret，仅账户分析读取；不可用时D1概况照常返回。无用户SQL入口，不向前端暴露Token。

## MARKET_LIST契约（Helper1.2.0）

POST tasks（管理员/设备）默认task_type=MARKET_LIST，可显式LEGACY_MARKET_DETAIL保留旧合并契约；其他类型拒绝。Task响应包含task_type。新物化计划Task使用MARKET_LIST，已有schedule_key行不改写。MARKET_LIST的core_hotels/rooms/detail_results为空，达到collection_limit直接上传；不足仍按原规则PARTIAL/FAILED。详情以后由独立COMPETITOR_DETAIL任务负责，本轮未开放该类型或新增详情计划。旧Task不重新解释为列表任务，鉴权与窗口约束不变。

新增FAST_NAV_START/FAST_NAV_VERIFIED/FAST_NAV_FAILED/FAST_NAV_CONTEXT_MISMATCH、LIST_READY、UPLOAD_START事件，沿用现有events接口及100条上限。MARKET_LOCKED.message追加真实阶段耗时JSON；TASK_TIMING仅本地日志，不在终态后伪造云端事件。

JSON。除GET /health和注册外，全部鉴权；错误为{error:{code,message}}。注册入口有Cloudflare Rate Limiting，初始只能pending。注册允许任意设备申请但不授予工作资格。

## 设备

请求头X-Device-ID + Authorization: Bearer <本机随机64位hex凭证>。凭证不进入Git；生产只走HTTPS。

- POST /v1/devices/register：device_id、credential、version。重复同凭证可重试。
- POST /v1/device/heartbeat：version、可选error_code；返回云端名称、审批状态、当前Attempt、服务器时间。
- POST /v1/device/tasks：platform/city/keyword/checkin/checkout/scope/limit，默认本设备领取。
- POST /v1/device/claim：返回{task,attempt,core_hotels}或null。
- POST /v1/device/attempts/:id/start
- POST /v1/device/attempts/:id/events：event、code、message，每Attempt最多100条。
- POST /v1/device/attempts/:id/fail：error_code、error_message。
- POST /v1/device/attempts/:id/result：source='ctrip-dom'，实际page context，observed_at、hotels、rooms、detail_results、exhausted、stop_reason。同一payload可幂等重传，不同payload返回409。

API规范化且只保存允许字段。结果必须属于领取设备、有效Attempt与窗口。未成功详情必须给明确错误；SUCCESS必须至少有真实房型或整店售罄证据。全市场不自然耗尽就拒绝正式all快照。市场列表不足但真实可保存为PARTIAL。

## 管理员

CF-Access-Jwt-Assertion签名验证+ADMIN_EMAILS。OTA的/api/v1/admin/*经Service Binding调用API；代理不授予管理员资格。

- GET session / devices / tasks / tasks/:id / plans / hotels / market
- POST tasks / plans / standard-hotels
- PATCH devices/:id：name、status=approved/disabled（恢复也使用approved）。
- PATCH plans/:id：enabled，停用取消尚未领取的计划任务。
- PATCH standard-hotels/:id：name、category=mine/core/competitor/watch/other。
- POST mappings：platform、hotel_id、standard_hotel_id、confirm=true，禁止自动确认。
- DELETE mappings?platform=ctrip&hotel_id=...：仅解除关系，保留全部历史。
- GET market?platform=ctrip&city=咸宁&keyword=中心花坛&scope=top30&horizon=14&checkin=YYYY-MM-DD：各入住日期最新独立快照、无插值曲线、选中日期酒店、房型、不可变策略历史。

生产无本地管理员后门。测试只能ENVIRONMENT=local并且API URL为localhost/127.0.0.1且LOCAL_ADMIN_TOKEN匹配。

GET /health执行D1 SELECT 1，只返回数据库依赖状态；成功200，数据库不可用503，不披露业务记录或内部错误。

市场curve.myPrice按当前人工映射读取该日期快照原始观察；snapshot.facts与strategy_history仍保留采集时不可变策略事实。缺失快照/未映射/缺失价格返回null，不插值。

Plan.horizon=14/30含今日D0和D+1～14/30；market.horizon默认从今日起14/30个展示点；可选inclusive=1包含T+horizon端点，返回15/31个日期（省略或0保持原响应，其他值拒绝）。OTA走势使用inclusive=1，未来14天=T～T+14、未来30天=T～T+30；顶部入住日期范围独立保留T～T+30，周期只更新图表。此参数只扩大同口径历史读取范围，不创建Task或改变所选日期统计。POST plans保存后立即物化当前业务日剩余窗口；Cron持续滚动。schedule_key=Plan ID/业务日/入住日期/窗口编号，重复生成不新建Task、不移动已有due_at。capacity_warning表示预估设备容量不足；领取/重试均不越过window_end。

## V1.1只读生产运行状态

GET /v1/admin/runtime（OTA代理/api/v1/admin/runtime），沿用现有人类管理员鉴权。返回at、day、timezone、statuses（PENDING/RUNNING/COMPLETED/PARTIAL/FAILED）、total、terminal、success_rate、attempts、errors（source/code/count）、online_devices（id/name/status/last_seen_at/last_error/running）、last_success_at。

统计当前enabled=1 Plan的Task.window_start落于Asia/Shanghai今日[00:00,次日00:00)的已生成Task（含未到期），排除无Plan任务和停用验收计划。success_rate=COMPLETED/terminal，PARTIAL算终态不算成功，无终态null；attempts累计上述Task全部Attempt；errors按Task/Attempt来源分别聚合不合并。在线仅approved且心跳不足120秒，不返回credential_hash。last_success_at取当前启用计划全部COMPLETED快照的最新received_at，无数据null。接口不回收任务、不改变Plan/Task/Attempt或历史，任务页刷新获取最新值。


## 管理员取消任务（Agent 1.3.6）

POST /v1/admin/tasks/:id/cancel，OTA代理为/api/v1/admin/tasks/:id/cancel，沿用现有管理员鉴权。仅PENDING/RUNNING可取消；重复取消幂等，已COMPLETED/PARTIAL/FAILED返回409 TASK_ALREADY_FINISHED，未知任务404。原子写入Task及当前RUNNING Attempt的CANCELLED/ADMIN_CANCELLED/finished_at；执行时间线保存取消操作者。先前失败执行、已保存快照与Observation均不修改，不调用失败重试逻辑。

心跳可附带active_attempt_id，响应新增last_attempt（仅限当前认证设备的id/task_id/status/finished_at/error_code）。Agent在下一次成功心跳检查到CANCELLED后停止后续步骤、清除本地active并如实显示已取消；当前进行中的浏览器操作或网络请求不会被强制中断。取消后所有attempt start/events/fail/result返回409 TASK_CANCELLED，上传事务仍有快照guard防竞争。旧Agent兼容原active_attempt=null处理；升级1.3.6可显示准确取消状态。设备身份与批准状态不变。

TASK_CANCELLED运行事件必须对应真实已取消Task，保存在既有agent_logs与Analytics，不增加日志Schema。runtime.statuses新增CANCELLED，total包含取消数量；成功率仍为COMPLETED/(COMPLETED+PARTIAL+FAILED)，主动取消单列且不纳入分母。


## OTA 日内价格轨迹

新增管理员只读 `GET /v1/admin/market/price-history`，按上海观察日期、入住/退房日期、平台/城市/关键词/范围和原始酒店集合读取全部快照历史。返回真实价格、缺失原因、前一个有效观察和涨跌；基准可跨观察日。计划未形成快照的任务单独返回，不虚构观察时间。原 `/market` 契约不变，无 Schema 或 Agent 修改。参数、响应与验证见 [日内价格轨迹](intraday-price-history.md)。
