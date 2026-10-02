# 多 OTA 自主研发：证据、实现和边界

研究日期：2026-10-02 UTC。基线 `93476ea08e85349ed8673bd64f877d929f8a191b`。
这是本轮研究/验证记录，不是四个平台已生产采集成功的证明。

## 结论与路线

| 平台 | 本轮交付状态 | 推荐路线 | 接入证据 / 当前限制 |
|---|---|---|---|
| 携程 | IMPLEMENTED_NOT_LIVE_VERIFIED；当前 Cloud 验证 BLOCKED | 保留现有 Chrome MV3 DOM；有合作权限时再评估官方 API | 当前代码已具备严格列表/详情上下文、自然耗尽、导航、租约与上传；本轮 Cloud 未访问到携程，历史 Mac 验收不算本轮 PASS。2014 联盟 SDK 只证明历史接口 |
| 美团酒店 | RESEARCH_ONLY；真实验证 BLOCKED | 先核实官方酒店搜索/分销权限；否则再评估正常浏览器 DOM | 没有确认当前对公众开放的竞品房价 API。不能把外卖/配送 API 或商家订单后台当作酒店搜索能力。旧爬虫不证明当前可用 |
| 飞猪 | IMPLEMENTED_NOT_LIVE_VERIFIED；真实验证 BLOCKED | 优先 FlyAI 官方酒店查询，不预设浏览器采集 | 飞猪发布者技能仓库的 `search-hotel` 提供目的地/日期/关键词参数及 `shId/name/price/score` 示例；文档声明 CLI 零配置、自有 Key 可选。已完成示例解析、自有 Key 的只读 MCP 实验客户端，未证明 Cloud 渠道签名/会话准入、真实响应、日期回显或完整库存 |
| 同程 / 艺龙 | RESEARCH_ONLY；真实验证 BLOCKED | 优先核实官方合作 API；当前不编造 DOM Adapter | 2014 艺龙示例包含酒店列表、详情、库存和价格结构，要求 API 用户与 keys；无法确认今天准入规则或同程酒店搜索授权。`tongcheng` 与 `elong` 身份独立 |

**本轮没有任何平台达到 VERIFIED。** 没有登录、验证码、扫码或账号授权尝试，也没有确认这些是当前网站的实际 blocker：请求在到达平台前已被 Cloud 出口代理拒绝。

飞猪的 `API_ACCESS_REQUIRED` 仅表示本仓库实验 Bearer 客户端需要自有 `FLYAI_API_KEY`，不是断言官方 CLI 必须申请 Key。官方零配置路线存在文档依据，但入口网络不可达，不能验证其实际授权、额度和可用性。

## 互联网、官方入口与真实浏览器结果

已通过普通 HTTPS 请求尝试核查以下开发者/页面候选入口；被出口拒绝的域名，未能确认其当前页面或接口是否仍存在：

- 携程：<https://open.ctrip.com/>、<https://openservice.ctrip.com/>、<https://developers.trip.com/>、<https://hotels.ctrip.com/>、<https://m.ctrip.com/webapp/hotels/>。
- 美团：<https://open.meituan.com/>、<https://developer.meituan.com/>、<https://hotel.meituan.com/>、<https://i.meituan.com/>。
- 飞猪：<https://open.fliggy.com/>、<https://open.taobao.com/>、<https://flyai.open.fliggy.com/>、<https://hotel.fliggy.com/>。
- 同程 / 艺龙：<https://open.ly.com/>、<https://open.elong.com/>、<https://openapi.elong.com/>、<https://www.ly.com/hotel/>、<https://hotel.elong.com/>。

上述请求均收到出口代理 `Tunnel connection failed: 403 Forbidden`，不是网站返回的登录/验证码结论。Google、Bing、DuckDuckGo 搜索入口也被出口拒绝；改用可访问的 GitHub 仓库搜索、源码与 npm 元数据继续研究。GitHub 部分高频搜索返回 429，保留结果，不循环重试。

Chromium 使用环境提供的代理，匿名打开四个平台入口，每个平台一次；均为 `net::ERR_TUNNEL_CONNECTION_FAILED`。未获得列表 DOM、价格观察、正常页面的网络响应或公开网络 API。因此本轮不能确认 PC/Mobile Web 的现行 DOM 结构、登录要求或正常网络请求的稳定性；不根据旧代码编造当前 selector/endpoint。

实际请求证据见 [research-evidence.json](research-evidence.json)。文件仅保存公开 URL、日期、状态、原始错误类型和来源元数据，不含 Cookie/凭证/响应正文。需要核查 Cloud 环境的网络出口/允许域名；网络可用后再运行公开页面探针，不绕过限制。

## 查阅的 GitHub 项目与许可

下列仓库均实际读取；列出的日期是克隆 HEAD 的 commit 日期，不把 GitHub 搜索的 `updated_at` 当作最后维护时间。不执行下载仓库的代码。

| 项目 | 核对的 HEAD / 日期 | 许可证 | 研究价值与不能直接复用的部分 |
|---|---|---|---|
| [alibaba-flyai/flyai-skill](https://github.com/alibaba-flyai/flyai-skill) | `86fe2cc3` / 2026-09-16 | MIT | 发布者酒店搜索文档、参数和输出示例；优先 API 路线。无日期回显、库存完整性保证，不能视为酒店起售价快照契约 |
| [chinakungfu/ctrip-openapi-nodejs](https://github.com/chinakungfu/ctrip-openapi-nodejs) | `5c543941` / 2014-10-03 | MIT | 历史联盟 `AllianceID/SID` 与认证签名封装，历史 HTTP 地址不能直接用于当前生产 |
| [sdogsq/ctrip-hotel-spider](https://github.com/sdogsq/ctrip-hotel-spider) | `1893ded8` / 2018-12-06 | Apache-2.0 | Selenium 通过正常页面读取名称/评分/评论/最低价的思路；不复制过时 DOM，不采用绕过逻辑 |
| [IntegratedTeam/MeituanSpider](https://github.com/IntegratedTeam/MeituanSpider) | `de94b97b` / 2018-06-29 | 未发现 LICENSE | 历史 `hotel.meituan.com/ihotel.meituan.com` 页面/请求线索；无许可且年代久，不移植代码或 token 算法 |
| [webvul/meituan_hotel](https://github.com/webvul/meituan_hotel) | 仓库页面研究；README 最后注明 2019-05-07 | 未发现 LICENSE | 商家账号订单后台、Cookie 与 token 依赖；不是竞品搜索，不复用其认证/风控处理 |
| [yongchun/eLong-OpenAPI-JAVA-demo](https://github.com/yongchun/eLong-OpenAPI-JAVA-demo) | `addb87ec` / 2014-04-17 | Apache-2.0 | 历史 `HotelId/ArrivalDate/DepartureDate`、HotelList/Detail/Inventory/Rate 结构与 API keys 要求。默认 Demo 会创建订单，另含旧测试环境/TLS 特殊处理，未执行、不采用 |
| [mr-cn/fliggy-mcp](https://github.com/mr-cn/fliggy-mcp) | `7c5f9e02` / 2026-09-12 | 未发现 LICENSE | 固定只读 tools、响应限长、JSON/SSE、用户凭证隔离设计；README 与代码共享签名配置描述不完全一致，未复制实现/共享凭证/设备指纹 |
| [tiantour/ota](https://github.com/tiantour/ota) | `b20e0568` / 2023-04-10 | MIT | 宣称多 OTA 的 README 不等于实际支持；当前树只有马蜂窝实现，不能当成携程/飞猪现成 Adapter |
| [Twealhula/travel-search](https://github.com/Twealhula/travel-search) | 仓库页面研究 | README 声明 MIT | 币种/每晚与整段住宿价格分开的思路；实际酒店主数据来自 Google/DIDA，不能冒充飞猪酒店。对未公开接口稳定性的免责声明具有参考价值 |

另读取 npm `@fly-ai/flyai-cli@1.0.16` 元数据：2026-04-21 发布，MIT，maintainers `ocean_wll/open-flyai`；下载包的 SHA-512 与 registry `dist.integrity` 一致。包为打包/混淆 CLI，未执行或引入项目依赖，未抽取共享凭证/签名材料。包校验不等于平台接入成功或授权确认。

官方飞猪参数/示例原文：
<https://github.com/alibaba-flyai/flyai-skill/blob/86fe2cc3e25464d0e0bd6a769b27b5f9f3b04128/skills/flyai/references/search-hotel.md>。

## 字段证据

| 字段 | 当前携程真实解析代码 | 飞猪发布者文档示例 / 本轮解析 | 美团 / 同程 / 艺龙当前能力 |
|---|---|---|---|
| 酒店身份 | `masterhotelid`，原始 `ctrip + hotel_id` | 字符串 `shId`，保留 `fliggy + hotel_id`，不当作淘宝商品 ID | 当前未确认；艺龙历史 XSD 有 HotelId，不能映射到同程 ID |
| 城市、入住/离店 | DOM/卡片曝光核对 URL、可见关键词与任务 | 请求使用 `destName/checkInDate/checkOutDate`；示例不回显，`context_verified=false` | 未确认当前城市 ID、日期参数或回显 |
| 展示价 / 原价 | 可见货币节点、起价及划线样式；缺失 null | 精确 `¥618/￥1,234.50` 格式；真实 `¥0` 保留，原价 null；价格语义未验证 | 未确认 |
| 评分 / 评论 | 可见 0–5 评分；独立评论数未保存 | 文档 `score`，0–5 内解析；`review` 文本不是评论数，review_count=null | 当前评分量纲未确认，不擅自归一化 |
| 房型 / 套餐 | 旧详情路径有基础房型，不是完整 Rate Plan | 酒店搜索示例不提供完整房型/套餐，均未实现 | 历史艺龙结构存在房型/费率，但当前未确认 |
| 广告、平台排名 | 当前携程代码有明确广告与曝光排名 | 文档未证明广告标记或平台排名，保持 null；不把数组序号当平台 rank | 未确认 |
| 活动、动态 | 携程可见标签/动态；缺失 null | 文档示例未证明，保持 null | 未确认 |
| 售罄、耗尽 | 售罄需明确详情文字；自然结束需可见标记 | 价格缺失不代表售罄；空搜索结果不代表自然耗尽，unknown/null | 未确认 |

## 架构与兼容性

新增根目录 `platforms/`，统一显式查找和 `parseObservation` 入口，未知平台拒绝，不 fallback 到携程。导航/DOM 与官方查询按路线分别声明，不强迫 API 模拟浏览器：

- `catalog.js`：四个研发目标、五个原始身份命名空间、推荐路线、实际实现能力、生产开关、按日期记录的本轮阻塞、实时健康 unknown；不从“实现完成”推断在线/成功。
- `contract.js`：研发 observation envelope，缺价 null/零价 0、平台身份、来源、时间语义、请求/实际上下文及验证标记、价格量纲、广告/排名/售罄 unknown、明确耗尽证据。拒绝跨平台身份、重复酒店、非法数值和无证据售罄/耗尽。
- `ctrip/index.js`：直接复用现有 `agent/mobile.js` 与导航函数，增加严格上下文检查后的研发 envelope 转换；没有重写生产携程 parser 或修改扩展权限、设备身份。
- `fliggy/index.js`：只解析发布者示例证明的字段；只读 `search_hotels` 实验客户端，仅固定 FlyAI HTTPS 目标、自有 Key、限长 JSON/SSE、禁止跳转、不重试、不输出上游错误/秘密。没有签名 profile/共享身份仿造，实际渠道的签名/会话要求待真实接入确认。
- 美团 / 同程 / 艺龙：显式 unavailable Adapter，有证据前不编造 selector。

API 新增 `GET /v1/admin/platforms`，沿用现有人类管理员鉴权，返回 `{contract_version:1, platforms:[...]}`。不查询/写入业务表、不改原市场/上传契约、不改调度；OTA 增加只读“平台能力”页，区分实现、生产开关与真实验证。

### 为什么本轮无需 migration

现有 Task/Attempt/Snapshot/Observation 已包含平台维度，`platform_hotels` 和映射使用 `(platform,hotel_id)`，可复用追加式历史。当前 `platforms` 字典只启用携程，Task 创建只接受携程，上传来源是 `ctrip-dom`，广告/排名必需且价格默认人民币；这不是“新平台已经可写入”的证明。

本轮研发结果不上传 D1、不创建新平台 Plan/Task、不改 Schema 或历史数据；因此无需 migration。以后启用平台前应：

1. 用真实响应/页面验证城市、日期、价格口径、平台身份及完整性，明确是否只是候选搜索（不能承诺 top30/all）。
2. 按能力建立平台/source/task-type 校验与设备匹配；旧 Agent 继续只领取携程，官方 API 执行端不冒充 Chrome 设备，也不复用设备凭证。
3. 原始数据若缺 rank/is_ad/currency/price basis 等现有契约要求，不能补值让上传通过。先设计最小兼容字段/来源证据扩展与未知状态，保留旧 API/Agent；任何 Schema/migration 进入 main 前须按 AGENTS 人工确认。
4. `review_count`、评分量纲、平台字段或 Rate Plan 若需要持久保存，先做兼容迁移方案；不把这些额外字段悄悄塞入价格/动态字段。
5. 人工确认标准酒店映射，不自动按名字跨平台合并；同程和艺龙分别保存身份。

没有 Worker、Service Binding、Secrets、Access 或 Agent host permissions 变更；生产携程执行和租约安全边界保持原状。

## 测试与复现

```sh
node --test tests/platforms.test.js
npm test
npm run check
POAI_PLAYWRIGHT_MODULE=/path/to/playwright node tests/platforms.browser.mjs
POAI_PLAYWRIGHT_MODULE=/path/to/playwright node tests/price-history.browser.mjs
POAI_PLAYWRIGHT_MODULE=/path/to/playwright node scripts/probe-platforms.mjs
```

- `tests/platforms.test.js`：13 项确定性测试，原始身份/上下文隔离、缺失/零价、广告/排名未知、耗尽/售罄证据、携程兼容、飞猪格式/日期/RPC/响应限长、秘密错误隔离、固定只读工具/禁止跳转与重试、管理员鉴权和 D1 零写入。
- `tests/platforms.browser.mjs`：1440/390/320px，实际本地 OTA Worker → API Worker → 内存 SQLite；四平台状态/导航/刷新/旧市场切换、无根级溢出/控制台错误、全部 GET、数据库零写入。
- `tests/fixtures/fliggy-search.example.json` 取自发布者文档示例，明确不是本轮真实酒店观察；MIT 署名见同目录说明。
- 公共页面探针结果是 BLOCKED，不是浏览器业务测试 PASS。
- API/OTA 已使用现有 esbuild 在 `/tmp` 离线打包，未调用 Wrangler/deploy；新增解析测试重复 5 次用于确定性回归。
- 页面开发期间发现并修复了千位价格格式边界、手机表格继承 nowrap 引起的溢出，以及新增静态 import 与现有 VM 测试加载方式不兼容的问题；保留原测试和断言。

本环境使用 `POAI_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright` 与 `/usr/bin/chromium`。依赖已可用，无需更新 lockfile 或安装未知爬虫包。

实验查询：`node scripts/query-fliggy.mjs 杭州 2026-10-05 2026-10-06 ''`。当前实验客户端没有自有 Key，会以 `FLYAI_API_ACCESS_REQUIRED` 停止，不发请求、不打印 key；配置只能通过安全环境变量提供，不能放入命令行/代码/聊天。官方 CLI 零配置路线可以另行在网络允许的隔离环境评估，不借用第三方账号或从 CLI 抽取材料。

## 需要外部条件的后续验证

- 核查/放行上述官方页面与开发者域名的 Cloud 出口；这是目前四个平台共同的实际 blocker。
- 网络可用后先验证 FlyAI 发布者官方零配置路径；是否需要自有 Key、渠道签名/额度，以真实官方响应为准，不预先要求账号。
- 携程使用已批准设备/现有登录态的 Mac/Windows 真机验收，需要实际设备环境。其他平台若真实出现登录/验证码或合作准入，再分别记录并请求必要介入。
- 当前开放平台合作资格、接口条款、采集许可和持续商业使用边界尚未核实。官方授权接口一般更稳；私人网络 endpoint、旧 DOM、混淆签名等维护成本高，不能仅因技术可调用就启用生产。
