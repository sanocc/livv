# Helper V1.3运行观测

D1保存业务权威记录；Workers Logs保存API调用/异常；Analytics Engine保存Helper结构化遥测。普通界面中文，技术详情保留原始标识/错误码。没有新监控平台、Schema、采集字段或详情任务。

## 实际事件Schema

Dataset：livv_helper_events；绑定：HELPER_EVENTS；index1=device_id。

| Analytics字段 | 内容 |
|---|---|
| blob1～3 | device_id / task_id / attempt_id |
| blob4～7 | helper_version / event_code / platform / task_type |
| blob8～9 | os（Mac/Windows/Other）/ navigation_mode |
| blob10～11 | event_id / occurred_at（ISO） |
| double1～2 | duration_ms / hotel_count；缺失存-1，API返回null |
| timestamp | Cloudflare写入时间，不冒充业务发生时间 |
| _sample_interval | Cloudflare采样权重，技术详情保留 |

事件包括DEVICE_ONLINE、TASK_CLAIMED、FAST_NAV_START/SUCCESS/FAILED/CONTEXT_MISMATCH、LIST_READY/PROGRESS、MARKET_LOCKED、UPLOAD_START/SUCCESS、TASK_COMPLETED/PARTIAL/FAILED、ATTEMPT_FAILED，以及API_TIMEOUT、SEARCH_CONTROL_TIMEOUT、INPUT_TARGET_CHANGED、PAGE_CONTEXT_MISMATCH、CAPTCHA_REQUIRED、LOGIN_REQUIRED、HELPER_ERROR、ATTEMPT_TIMEOUT、UPLOAD_FAILED。原本地FAST_NAV_VERIFIED映射为遥测FAST_NAV_SUCCESS，原日志不删除。

TASK_CLAIMED发生时间取真实云端claimed_at；FAST_NAV_START取导航开始；ready/锁定/上传开始取已有阶段时间。一般duration_ms为领取以来耗时，MARKET_LOCKED为ready→锁定，UPLOAD_SUCCESS为上传开始→收到成功响应。UPLOAD_SUCCESS晚于云端finished_at是正常响应传输，D1 finished_at仍为业务完成时间。

只上传上述字段，不发送日志message、完整URL/HTML/Header、Cookie、验证码、密码或任何Token/设备凭证。API规范化并验证设备关联。此次没有为观测增加扩展权限。

## 异步与边界

本地telemetry_queue最多100条/24小时，每批最多25条；正常约2秒批量，失败30秒退避，4秒请求上限；心跳恢复MV3挂起后的发送。追加与ACK串行化，发送途中新增事件不会被ACK删除；服务不可用只留有限队列，采集主链路不等待。DEVICE_ONLINE每5分钟，LIST_PROGRESS按约10家级别变化发送，不复制每轮DOM/PHASE调试日志。不是保证逐条不丢的审计队列，队列上限/浏览器长期关闭/平台采样可能缺事件。

真实SQL查询已观察_sample_interval=1～2，个别上传/终态事件未被保留；不能宣称完整精确时间线。OTA显示“可能写入延迟、采样及重传”，最近任务真实状态和平均耗时由D1计算，不用采样行数算成功率。后续如分析事件数量/平均，应使用sum(_sample_interval)、加权均值，不能简单count/avg。参考[Cloudflare采样文档](https://developers.cloudflare.com/analytics/analytics-engine/sampling/)。

## 远程排障

OTA→设备→运行概况：在线/版本/心跳、最近错误、24小时Task与Attempt结果分开、主要执行错误、市场列表平均耗时、最近20次执行、可选采样运行事件。技术详情保留真实ID/原始状态/错误码。新Secret只在Worker使用，固定SQL最多100条/24小时，5秒失败返回不可用；仍可查看D1信息。

API Workers Logs持久化调用日志，2026-10-02短时live tail实测heartbeat/claim/health均200且outcome=ok，未复制进入D1；没有为测试制造异常或改写失败。可通过Cloudflare Worker日志筛选请求/异常，原始敏感请求头不得复制到Helper遥测。
