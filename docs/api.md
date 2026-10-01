# API V1

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
