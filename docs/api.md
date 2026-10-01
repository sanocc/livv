# API V1

## MARKET_LIST契约（Helper1.2.0）

POST tasks（管理员/设备）默认task_type=MARKET_LIST，可显式LEGACY_MARKET_DETAIL保留旧合并契约；其他类型拒绝。Task响应包含task_type。新物化计划Task使用MARKET_LIST，已有schedule_key行不改写。MARKET_LIST的core_hotels/rooms/detail_results为空，达到collection_limit直接上传；不足仍按原规则PARTIAL/FAILED。详情以后由独立COMPETITOR_DETAIL任务负责，本轮未开放该类型或新增详情计划。旧Task不重新解释为列表任务，鉴权与窗口约束不变。

新增FAST_NAV_START/FAST_NAV_VERIFIED/FAST_NAV_FAILED/FAST_NAV_CONTEXT_MISMATCH、LIST_READY、UPLOAD_START事件，沿用现有events接口及100条上限。MARKET_LOCKED.message追加真实阶段耗时JSON；TASK_TIMING仅本地日志，不在终态后伪造云端事件。

JSON。除GET /health和注册外，全部鉴权；错误为{error:{code,message}}。注册入口有Cloudflare Rate Limiting，初始只能pending。注册允许任意设备申请但不授予工作资格。

## 设备

请求头X-LIVV-Device-ID + Authorization: Bearer <本机随机64位hex凭证>。凭证不进入Git；生产只走HTTPS。

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
- POST tasks / plans / livv-hotels
- PATCH devices/:id：name、status=approved/disabled（恢复也使用approved）。
- PATCH plans/:id：enabled，停用取消尚未领取的计划任务。
- PATCH livv-hotels/:id：name、category=mine/core/competitor/watch/other。
- POST mappings：platform、hotel_id、livv_hotel_id、confirm=true，禁止自动确认。
- DELETE mappings?platform=ctrip&hotel_id=...：仅解除关系，保留全部历史。
- GET market?platform=ctrip&city=咸宁&keyword=中心花坛&scope=top30&horizon=14&checkin=YYYY-MM-DD：各入住日期最新独立快照、无插值曲线、选中日期酒店、房型、不可变策略历史。

生产无本地管理员后门。测试只能ENVIRONMENT=local并且API URL为localhost/127.0.0.1且LOCAL_ADMIN_TOKEN匹配。

GET /health执行D1 SELECT 1，只返回数据库依赖状态；成功200，数据库不可用503，不披露业务记录或内部错误。

市场curve.myPrice按当前人工映射读取该日期快照原始观察；snapshot.facts与strategy_history仍保留采集时不可变策略事实。缺失快照/未映射/缺失价格返回null，不插值。

Plan.horizon=14/30含今日D0和D+1～14/30；market.horizon默认从今日起14/30个展示点；可选inclusive=1包含T+horizon端点，返回15/31个日期（省略或0保持原响应，其他值拒绝）。OTA走势使用inclusive=1，未来14天=T～T+14、未来30天=T～T+30；顶部入住日期范围独立保留T～T+30，周期只更新图表。此参数只扩大同口径历史读取范围，不创建Task或改变所选日期统计。POST plans保存后立即物化当前业务日剩余窗口；Cron持续滚动。schedule_key=Plan ID/业务日/入住日期/窗口编号，重复生成不新建Task、不移动已有due_at。capacity_warning表示预估设备容量不足；领取/重试均不越过window_end。

## V1.1只读生产运行状态

GET /v1/admin/runtime（OTA代理/api/v1/admin/runtime），沿用现有人类管理员鉴权。返回at、day、timezone、statuses（PENDING/RUNNING/COMPLETED/PARTIAL/FAILED）、total、terminal、success_rate、attempts、errors（source/code/count）、online_devices（id/name/status/last_seen_at/last_error/running）、last_success_at。

统计当前enabled=1 Plan的Task.window_start落于Asia/Shanghai今日[00:00,次日00:00)的已生成Task（含未到期），排除无Plan任务和停用验收计划。success_rate=COMPLETED/terminal，PARTIAL算终态不算成功，无终态null；attempts累计上述Task全部Attempt；errors按Task/Attempt来源分别聚合不合并。在线仅approved且心跳不足120秒，不返回credential_hash。last_success_at取当前启用计划全部COMPLETED快照的最新received_at，无数据null。接口不回收任务、不改变Plan/Task/Attempt或历史，任务页刷新获取最新值。
