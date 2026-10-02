# 验收专用控制面：待人工批准的最小权限方案

日期 2026-10-02。基线 main `9d6cb26e54dab6b5b167d99a15d225534c063f16`。
本轮只实现与隔离验证，**未合入 main、未发布生产、未修改生产配置、未签发或使用生产凭据、未创建生产任务、真机执行为 0**。

## 权限和信任边界

Cloud 不能获得管理员 Cookie/JWT、设备凭证、长期生产 Secret 或签发私钥。新增独立的短期 capability，不能通过现有管理员/设备鉴权，也不能签发其他凭据：

- Ed25519 签名；固定 issuer、audience、subject、算法和 token 类型；API 仅导入配置中的公钥，不从 token 的 URL 下载密钥、不允许嵌入 JWK 或算法降级。
- 默认 15 分钟，最多 30 分钟；无刷新接口，无到期容差，拒绝未来签发。到期不能创建或读取。需要读取仍在执行的任务时，由可信操作者签发**同 grant ID、同口径、同系统**的新短期凭据，不新增任务，不把签发能力交给 Cloud。
- scope 固定为 `acceptance:create` 与 `acceptance:read`，绑定唯一随机 v4 UUID grant ID、`ctrip`、城市、关键词、入住/离店日期和 `PLATFORM_ACCEPTANCE` purpose；同时由签发者绑定 macOS 或 Windows。Cloud 请求不接受系统/设备 ID、URL、脚本、Task 类型、计划、scope、limit、任意 SQL、价格或权限参数。
- 每份 grant 只能幂等创建一个既有 `MARKET_LIST/custom/3` 验收 Task，不创建 Plan。复用原 `acceptance:v1:{OS}:{grant UUID}` 唯一 schedule_key 和 Task → Attempt → Agent → Snapshot → Observation。设备仍只能已批准、在线、空闲、开启 auto、具备现有权限/能力的指定系统 Chrome MV3；领取时重新检查。不批准设备、不抢占、不改变生产 Plan、不修改 Agent 代码或身份。
- 结果只按签名 grant 找到自己的 Task；不能按客户端 task_id、device_id 查询，不能枚举验收列表或普通采集记录；再次核对该 Task 的实际采集口径。即使某个管理员意外占用了同 grant namespace 的其他口径，也不泄露结果。
- 美团、飞猪、同程/艺龙关闭；没有新增 hosts、DOM adapter 或平台写入能力。

这是新的 API 身份和权限边界，虽然默认关闭，也**不自动合入 main**。依据根 AGENTS「身份认证或权限模型的重大变化……必须在进入 main、触发生产发布前……获得……人工确认」。不能通过“新增功能默认关闭”绕过这条规则。

## 最小 API 契约

`Authorization: Bearer <短期验收 capability>`，仅 header，不在 URL、Cookie 或日志中传递。

1. `POST /v1/acceptance-control/tasks`

```json
{"platform":"ctrip","city":"咸宁","checkin":"2026-10-05","checkout":"2026-10-06","keyword":"中心花坛","purpose":"PLATFORM_ACCEPTANCE"}
```

以上六字段是完整白名单，必须与签名授权口径相同。沿用业务日期范围校验。仅接受 JSON、不接受浏览器 Origin；返回 task_id、purpose、task_status、idempotent 和固定 result_path。201 创建，200 幂等；不能指定普通生产采集类型/计划或修改数据。

2. `GET /v1/acceptance-control/result`

只读取当前凭据对应的 Task。未创建返回 NOT_CREATED / execution=null。拒绝 query 参数、列表、任意路径、GET 以外的结果操作。GET 不 reap、不 heartbeat、不修改 D1。

3. 其他操作均拒绝；不提供批准设备、注册、计划、取消/删除、映射、迁移、上传、签发或配置操作。持有 capability 的请求走现有 `/v1/admin/*` 或 `/v1/device/*` 时仍受原身份校验，不能获得该权限。

控制面默认返回 `ACCEPTANCE_CONTROL_UNAVAILABLE` (503)；凭据错误/过期/撤销统一 `ACCEPTANCE_CONTROL_DENIED` (401)，不输出签名、key、token 或原始异常。

## 结构化证据与安全诊断

原 Agent 无需升级。读取现有认证上传的 events/snapshots/market_observations：

| 字段 | 事实来源 / 缺失语义 |
|---|---|
| execution_id / attempt_id | 实际关联 Snapshot 的 Attempt，尚无 Snapshot 时为最新真实执行 Attempt；无 Attempt 为 null |
| task_id / snapshot_id | 原链路 ID；无快照为 null |
| navigation | 已记录 FAST_NAV 白名单事件；未记录为 null，不猜测导航方式 |
| page_reached / page_context_verified | 已认证 Agent 的 LIST_READY（只在实际列表口径验证后发出）；未记录为 null，不从 URL 猜测 |
| card_count | MARKET_LOCKED 的有限整数 count，是去重后锁定的酒店卡片数，**不是整页 DOM 总卡片数**；缺失/非法为 null |
| uploaded_card_count | 实际 Snapshot 的 Observation 条数；无 Snapshot 为 null |
| parsed_fields | 已上传各字段非 null 的条数，含 Hotel ID、名称、rank/is_ad、价格/原价；不是字段完整率或缺失价格补零 |
| upload_result | 原 Snapshot market_status、ID、received_at；上传未成功产生快照为 null |
| error_code | 白名单 code，未识别值为 UNKNOWN_ERROR；不输出错误原文 |
| sanitized_diagnostics | 已有事件和错误码白名单、时间、关联 ID；不输出 message、HTML、完整 URL、Cookie、设备凭证 |
| observed_at | 原 Snapshot 列表级实际观察时间；无 Snapshot 为 null |

真实零价与 null 保持分开。PARTIAL、无有效价格、缺执行事件、无 snapshot、登录/验证码均不能 PASS；登录/验证码沿现有验收规则停止该 Task。

非 production 环境完整证据只为 SIMULATED_PASS。生产 VERIFIED 沿用已批准设备、对应任务/执行/快照 SUCCESS、3 条真实观察及有效价格、已知实际执行版本/OS/Chrome MV3、LIST_READY/MARKET_LOCKED 条件。生产配置值本身不是本轮真机证据；fixture、内存数据库、mock Chrome 的测试结果不计验收。本轮没有生产 execution/attempt/snapshot ID。

证据属于受信的已批准 Agent 执行报告，不是硬件 attestation；仍不能把 Linux Cloud 浏览器、伪造 metadata、仅 heartbeat 或历史 PASS 宣称为新一次 Mac/Windows 真机通过。若以后需要防恶意已批准设备的硬件证明，必须单独设计设备安全边界，不能在本轮暗中扩大权限。

## 需要批准的配置（本轮均未执行）

API **不需要新增生产 Secret 或长期 Service Token**：

| 配置 | 性质 / 用途 |
|---|---|
| ACCEPTANCE_CONTROL_ENABLED | 默认缺失/false；批准后显式设 true，false 为整体 kill switch |
| ACCEPTANCE_CONTROL_PUBLIC_KEYS | 公钥 JSON 数组，1～4 个 `{kid,kty:"OKP",crv:"Ed25519",x}`，拒绝任何私钥字段 |
| ACCEPTANCE_CONTROL_REVOKED_IDS | 公共 UUID JSON 数组，必须显式提供，初始 `[]`；最多 256 个，单 grant 撤销读写权限 |

公钥轮换/移除、撤销列表和 kill switch 的生产变更需批准。撤销在配置生效后有效，Cloudflare 全局传播期间仍受最多 30 分钟 TTL 限制；不是无状态 token 的即时数据库撤销。移除 key 可撤销该签发 key 下全部凭据。本轮不添加 D1 表、不需要 Schema/migration；没有新持久队列或第二套执行体系。

**签发私钥**是新的受控签发材料，只在可信操作者机器保存（私有文件/系统密钥库），不得交给 Codex Cloud、API Worker、仓库、Git、聊天或日志。Cloud 只通过安全配置拿到一次短期 bearer；不需要管理员凭据。短期 bearer 仍敏感，任务结束或到期从临时配置中移除，不将其写入长期环境初始化脚本。

**Access policy**是否需要改动取决于实际应用覆盖路径，当前 Cloud 无权限审计 Dashboard，不能声称现有 Access 不拦截新路径。如果当前 Access 保护整域：需要人工审批仅这两个精确控制路径的独立策略，将鉴权交给 capability 校验；不能放宽 `/v1/admin/*`、设备路径或全域。不要自动创建宽权限 Service Token。若组织要求额外服务身份，应只覆盖这两个路径，凭据通过安全配置注入，另行评审；当前客户端未加入这类未批准身份。

**Cloud 网络**也必须独立解决：确认环境现有 allowlist，追加 `api.poai.cc` 的 HTTPS 出站访问，而不是替换未知列表。签名凭据不能绕过 Cloud 出口代理。当前阻塞是出口/身份，不能通过公开数据接口、GitHub issue/commit 传命令、日志读取或临时关闭 Access 绕过。

## 操作者签发与 Cloud 运行（仅审批后的步骤）

提供 `scripts/acceptance-capability.mjs`，在操作者机器运行，**不要在 Codex 使用生产签发 key**。所有私密输出文件使用新建/不覆盖和 0600；Windows 上需操作者确认私有 ACL。stdout 仅输出状态、kid/grant ID 和 expiry；失败不输出原始文件/密钥/上下文异常。

```sh
# 在可信操作者机器，路径位于仓库外；一次性生成新签发 key。
node scripts/acceptance-capability.mjs keygen --private-file /secure/poai-signer.pem --public-file /secure/poai-public-keys.json --kid acceptance-operator-v1
# context.json 是上面的六字段 JSON；日期需处于当前允许业务范围。
node scripts/acceptance-capability.mjs issue --private-file /secure/poai-signer.pem --kid acceptance-operator-v1 --context-file /secure/context.json --os macOS --token-file /secure/short-capability.token --ttl 900
```

只将公钥通过获批准的配置链路设置至 API；通过安全配置将短期 capability 文件传入 Cloud。不要 cat token、在 shell 参数中嵌入 token、启用 shell tracing 或把 key/token 文件放入仓库。

`scripts/acceptance-control-client.mjs` 固定目标 `https://api.poai.cc`、仅 create/result、禁跳转、15 秒超时、不重试、不输出 token 或上游异常：

```sh
node scripts/acceptance-control-client.mjs create /secure/cloud-short-capability.token /secure/context.json
node scripts/acceptance-control-client.mjs result /secure/cloud-short-capability.token
```

也支持安全环境绑定 `POAI_ACCEPTANCE_CAPABILITY`：将短期值通过环境设置输入（不在聊天或仓库），Cloud 可用 `create --env /secure/context.json`、`result --env`。代理绑定的 opaque placeholder 仅通过固定 HTTPS Origin 的 Authorization header 交给平台支持的代理替换；客户端不解码或验证 placeholder，最终签名验证仍由 API 完成，不提供任意目标 URL。声明该短期凭据需求不等于已经签发、注入或获生产批准。

结果成功时仅打印 API 结构化安全报告。Cloud 没有管理员/设备凭证、不能执行批准或上传，仍必须等真实 Agent 的下一次正常领取。登录/验证码只能在真实设备处理，不提供远程绕过功能。Windows 验收需另签 Windows 专用 grant，不能以 Mac 结果代替。

## 安全上线与回滚方案（无数据库迁移）

1. 审批本身份方案、公钥管理/单 grant 撤销方式、两个精确 API 路径及所需 Access/Cloud 网络范围。
2. 代码按 GitHub main → 现有 Git Integration 发布，初始保持控制面关闭；无直接 wrangler deploy。
3. 操作者配置获批准的公钥与明确 revoked 列表，再开启控制面；不改设备批准/身份、Secrets、D1 或 Schema。
4. 签发一次 macOS 携程短期 grant，Cloud 创建、读取；保存实际 task/attempt/snapshot/observed_at/版本与页面检查证据。若有已批准 Windows Agent，再用独立 grant 验证。
5. 回滚先关闭控制面/移除 key；保持既有 Task/Attempt/Snapshot/Observation，正在执行的任务和上传走原链路，不能清空数据或为了回滚取消普通 Plan。撤销不自动终止已创建任务，避免 Cloud 获取任务取消权；如需人工取消，走原管理员接口。
6. 有有效 production grant 前仅隔离测试，无生产任务或真实证据，不宣称已经完成目标闭环。

## 验证

新增隔离测试覆盖单 grant/幂等/口径绑定、跨任务读取拒绝、普通管理员/设备操作拒绝、JWT 算法/issuer/audience/subject/TTL/时间边界/签名/撤销/配置失效、真实零与 null、失败/CAPTCHA/无上传、现有事件的安全诊断、离线签发器与 Cloud 固定端点客户端。还需完整 `npm test`、`npm run check`、Worker 离线打包；不访问生产 D1，不调用 Cloudflare 部署。

本轮完成：25 项控制面定向测试、完整 163 项 `npm test`、`npm run check`、API esbuild 离线打包、既有 OTA 1440/390/320px 浏览器回归通过。`node tests/acceptance-control.worker.mjs` 在真实**本地隔离** workerd/D1 验证 Ed25519、创建/幂等、合成设备领取/上传、只读关联报告和零/null；结果 SIMULATED_PASS，不能计为真实酒店或 Mac/Windows 验收。测试脚本只用 localhost、独立临时 D1 和合成 key/凭据，不访问生产。

Cloud 环境草稿已保存 `api.poai.cc` 允许域、个人短期 `POAI_ACCEPTANCE_CAPABILITY` 绑定需求和安全启动说明（保留包管理预设、没有保存值，移除旧 dry-run deploy 建议）。草稿尚不证明运行环境生效，也不授权新生产身份边界。
