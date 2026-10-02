# 已批准 Agent 远程验收

2026-10-02；实现基线 `214c1373f8bef79cb16fc4c0f6c432afe5dde821`。本文描述可发布闭环，不是本轮真机 PASS。

## 执行边界

管理员/Cloud 通过现有 Access 管理员身份创建任务，在线已批准 Mac/Windows Chrome Agent 在正常自动领取中执行既有携程导航、实际上下文检查和 DOM 采集，并沿原上传事务写入 Snapshot、市场 Observation。API 把原链路整理为验收报告，OTA「平台能力」页创建并每 5 秒读取尚在执行的报告，离开页面停止轮询。

这不是远程 shell、任意脚本、任意 URL、浏览器会话或设备凭证代理。没有新增任务表、任务类型、迁移、扩展权限、设备身份、生产 Plan、Worker 绑定或 Secrets。现有 Agent 1.3.6 可执行，无需远程重载设备。新增管理员错误码按仓库约束补充 Agent/OTA 共享中文标签及对应下载包；执行器、manifest、设备身份与权限未变。只选择已批准且最近 120 秒在线、空闲、自动执行开启、已报告 debugger 权限和携程 MARKET_LIST 能力、Chrome MV3 的设备；创建后领取时再次检查执行环境。保留单设备单任务、45 分钟窗口、原有 Attempt/租约与最多 5 次尝试，不抢占当前任务，不修改正式采集频率。

验收复用 `MARKET_LIST`、`scope=custom`、`collection_limit=3`；`plan_id=NULL`、既有 `preferred_device_id` 定向分配。既有唯一 `schedule_key` 使用 `acceptance:v1:{macOS|Windows}:{request UUID}` 命名空间，同一请求 ID/系统/口径幂等，变更口径冲突。Task、Attempt、Snapshot、Observation 仍是唯一执行链；验收上传是真实普通列表数据，`custom/3` 口径不会冒充 `top30/all`。

## 管理员 API

均沿用现有生产 Access JWT、写入 Origin/JSON 检查；生产不接受 local token。未批准或冒用另一设备凭证不能执行。

- `GET /v1/admin/acceptance/readiness`：静态可实现的权限范围，不把能力声明当作在线状态。
- `POST /v1/admin/acceptance-tasks`：`{platform:"ctrip",os:"macOS"|"Windows",city,keyword,checkin,checkout,request_id?,device_id?}`；可选 device_id 仅进一步限制目标，不自动批准。201 创建，200 幂等，409 没有就绪设备或平台权限审查阻塞。拒绝其他参数，不能注入 URL、代码或价格。
- `GET /v1/admin/acceptance-tasks`：最近 50 个现有验收 Task，包含其原状态。
- `GET /v1/admin/acceptance-tasks/:task_id`：报告本次关联、口径、实际观察、执行时设备、检查条件、安全诊断与状态。
- 取消、详情、心跳、领取、开始、事件、结果与失败继续使用既有 Task/Agent API；不另建执行端。

报告仅使用对应 Snapshot 的 Attempt，而非历史成功样本。`STARTED` 的版本、批准状态、系统、Chrome/MV3 信息由服务器从该已认证设备当前记录截取，后续环境变更不重写本次证据。业务事件由原 Agent 上传；报告不导出事件原始 message、错误原文、页面 HTML、Cookie、URL 查询串或凭证，仅事件白名单与错误码白名单。保留 platform + hotel_id、真实名称、rank/is_ad、display_price/original_price，null 与真实 0 分开。

## 验收状态

`VERIFIED` 必须同时满足：生产环境、Task/关联 Attempt 完成、Snapshot SUCCESS、执行时已批准的目标设备/指定 OS/Chrome MV3/已知 Agent 版本、执行中的 LIST_READY 与其后的 MARKET_LOCKED、至少 3 个当前平台唯一酒店 Observation 且数量与 Snapshot 一致、至少一个真实有效价格。实际 observed_at 在原上传检查的 Attempt 时间范围内；不能要求观察时间晚于 LIST_READY 的异步服务器确认时间，因为快照可能先产生再确认事件。

这是已批准 Agent 的执行报告，不是硬件远程 attestation；不从 heartbeat、任务 COMPLETED 单项或上次验收推断真机通过。Mac 与 Windows 分别验收。自然耗尽不足 3 家、全缺价、PARTIAL、缺关键事件均为 `INCONCLUSIVE`，不是失败数据被丢弃。

非 production 环境的同样完整数据只能为 `SIMULATED_PASS`；尚未执行是 `AWAITING_REAL_AGENT`；取消是 `CANCELLED`。验收中的 `LOGIN_REQUIRED`/`CAPTCHA_REQUIRED` 终止该 Task 并报告 `BLOCKED`，不会排队重试；原 Agent 已在这些情况下暂停 auto，需人工处理后恢复。其他普通任务的既有重试规则不变。设备暂停可能影响其后续正常领取，但不关闭或重写生产 Plan。

`automatic_repair_count=0`：本实现没有自动改代码/调整解析器机制。`retry_count` 单独表示该 Task 的再次尝试，绝不把重试算作修复。解析器问题仅提供诊断，不通过动态修改规则、跳过上下文或伪造数据自愈。

## 后续平台与真正的 blocker

携程先建立基准。美团、飞猪、同程/艺龙明确返回 `AGENT_HOST_PERMISSION_REVIEW_REQUIRED`，不会创建或执行新平台任务，因为当前扩展 hosts/content script 仅限 POAI API 与受管 `m.ctrip.com`。不打开缺乏授权的站点，不绕过验证码，不把未知 DOM Adapter 开启生产。

批准新平台访问范围与采集安全边界之前，停在该项；后续每个平台须验证导航与 city/date/search 实际上下文、原始酒店身份、明确的字段/缺失/自然耗尽证据，再决定最小兼容上传方案。飞猪优先评估已研究的官方路线，不能把官方实验查询冒充 Chrome DOM 真机执行。若新增来源/未知 rank 等确实需要 migration，进入 main 前单独批准；本轮没有实现迁移。

本轮 Cloud 没有可用 POAI 管理员会话，API 域名被出口代理拒绝。因此未查询真实设备是否在线、未在生产创建 Acceptance Task，也未领取本轮真实 Snapshot。可在已有登录的 OTA「平台能力」创建携程任务；若要求今后 Cloud 完全无人值守创建/读取，需在环境设置提供现有授权身份与 API 网络可达条件，不能在聊天提供秘密，也不能放宽 Access。Agent 必须已批准、在线且开启现有自动执行；本轮无法代替真实设备登录/验证码操作。

## 隔离回归

```sh
node --test tests/acceptance.test.js
npm test
npm run check
POAI_PLAYWRIGHT_MODULE=/path/to/playwright node tests/acceptance.browser.mjs
POAI_PLAYWRIGHT_MODULE=/path/to/playwright node tests/platforms.browser.mjs
POAI_PLAYWRIGHT_MODULE=/path/to/playwright node tests/price-history.browser.mjs
```

浏览器用本地 SQLite 与合成已批准设备，检查 1440/390/320px 创建、定向执行协议、报告、零价/缺价、幂等、验证码阻塞、导航与布局；不访问 OTA 网站，不是 Mac/Windows 真机 PASS。写入浏览器测试使用现有 local Origin `http://localhost:8788`（IPv6 loopback，避免占用现有 IPv4 开发进程），没有放宽生产或本地 Origin。
