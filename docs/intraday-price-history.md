# OTA 日内价格轨迹基础版

基线 main `e6104228305c3fefb11bfb8750b90a5618440001`。仅新增 API 只读查询、OTA 展示和隔离测试；没有 Schema/migration、Agent、采集频率或 Cloudflare 配置变更。

## API 契约

`GET /v1/admin/market/price-history`，沿用管理员 Cloudflare Access 验证和 OTA Service Binding，不接受写入方法。

| 参数 | 说明 |
|---|---|
| `observation_date` | 必填 YYYY-MM-DD，Asia/Shanghai 的观察日期 |
| `checkin` / `checkout` | 必填，退房晚于入住，住宿不超过 30 天；允许查询历史入住日期 |
| `platform` / `city` / `keyword` | 必填，keyword 可以是空字符串；严格匹配市场口径 |
| `scope` | top30（默认）、all 或 custom |
| `collection_limit` | top30 可省略或为 30；all 省略或为 null；custom 必须为 1～2000 |
| `hotel_ids` | 同一平台的原始 Hotel ID，逗号分隔，去重后 1～10 家；包含当前 mine 映射时最多 11 家 |

示例：`/v1/admin/market/price-history?observation_date=2026-10-02&checkin=2026-10-05&checkout=2026-10-06&platform=ctrip&city=咸宁&keyword=中心花坛&scope=top30&collection_limit=30&hotel_ids=111,222,333`。

响应返回筛选口径、timezone、hotels、observations、unobserved_tasks，以及 `price_context=HOTEL_LIST_STARTING_PRICE`、`timestamp_context=LIST_SNAPSHOT`、`mapping_context=CURRENT`。

- `hotels`：原始 platform/hotel_id/hotel_name 与附加的当前 standard_hotel_id/standard_name/category；映射不替换原始身份。没有目录记录时以原始 ID 标识，不创造名称或价格。
- `observations[]`：snapshot_id、task_id、真实 observed_at、received_at、market_status、task_status、stop_reason、exhausted、prices、summary。保留全部符合口径的当日快照，不截取最新，不因所选酒店全部缺失而删除快照。
- `prices[]`：原始身份、当前映射、该快照原始酒店名、display_price、missing_reason、previous_observed_at、previous_snapshot_id、previous_price、change、change_ratio。`change_ratio` 是比值（0.1 表示 10%）。真实零价保留；缺少观察为 OBSERVATION_MISSING，存在观察但缺价为 PRICE_MISSING，价格均为 null。
- `summary`：up/down/unchanged/unavailable，覆盖请求的所有酒店。缺价或无基准归为 unavailable。OTA 的竞品摘要排除固定显示的我的酒店。
- `unobserved_tasks[]`：按该观察日内 due_at 查询的同口径、未形成快照任务，包含 task_id/plan_id、计划时间、窗口、task_status、error_code。可以包含失败、取消、待执行、执行中；没有 observed_at，绝不转换成虚构价格点。

## 查询与比较语义

观察日转换为上海午夜对应的 UTC 半开区间，例如 2026-10-02 为 `[2026-10-01T16:00:00Z, 2026-10-02T16:00:00Z)`，筛选 snapshots.observed_at，不使用 received_at 代替。

查询关联 tasks、snapshots、market_observations，严格隔离 platform/city/keyword/checkin/checkout/scope/collection_limit。排序为 observed_at、received_at、snapshot_id；同时间的不同快照均保留，最后两项提供稳定次序，不宣称同时快照存在额外秒级精度。

每家酒店先读取观察日之前最后一个同口径有效价格，随后按日内时间顺序比较。比较基准可以跨观察日，Tooltip 显示准确日期和时间；缺价不覆盖基准。当前价或基准缺失时 change=null；基准不存在或前价为 0 时 change_ratio=null。真实零价仍是有效价格，可计算金额变化。此功能使用实际金额变化，不套用策略建议的 ±3% 涨跌阈值。

酒店选择沿用当前人工映射，历史原始名称和平台 ID 保留；不声称恢复采集当时的标准名称/分类。基础版只查询一个平台口径，平台之间不自动合价，不使用 room_observations 生成房型历史。

## OTA 交互

市场一级视图为“未来市场｜日内价格轨迹”，默认未来市场，既有 /market 契约和未来走势保持不变。

日内页面提供观察/入住/退房日期、平台、城市、关键词和范围；选择器支持标准/原始酒店名及 Hotel ID 搜索。3/5/10 快捷选择优先当前核心竞品，可用不足时仅选已有酒店；最多 10 家。当前平台仅有一条明确 mine 映射时固定显示我的酒店，不占竞品数量；不唯一或未映射时明确提示，不制造我的酒店。

横轴是 24 小时真实时间尺度，刻度仅为时间参照，不代表采集点。每个价格点来自真实快照；null 或未观察到该酒店时断线。中间存在未形成快照任务时也断线，但不把任务 due_at 当作观察点。没有任何快照/任务证据的时段不生成虚构点；连线不表示持续报价。涨跌仍比较上一个有效观察，不用断线位置猜价格。

Tooltip 支持鼠标、点击、Tab/方向键及 Escape，展示时间、状态、原始平台身份、当前价、前价、金额/比例变化和基准时间。摘要只基于当前观察的实际比较结果，区分无法比较的酒店。

默认采集为窗口内错峰：D0 10窗、D+1 6窗、D+2～3 4窗、D+4～7 2窗、D+8～14 1窗、D+15～30隔日1窗，没有默认06～08窗。实际时间受 jitter、设备、领取、重试影响，不承诺固定整点或成功覆盖。

## 验证与限制

根目录执行 `npm test`、`npm run check`。新增固定历史样本测试覆盖时间边界、同日多点、平台/市场隔离、映射、真实零价、缺失、基准、PARTIAL、整次任务未形成快照，以及图表断线和 Tooltip。

浏览器集成脚本 `tests/price-history.browser.mjs` 启动 loopback 临时端口，使用实际 OTA Worker → API Worker → 内存 SQLite；品牌/脚本/样式使用仓库静态文件。它生成明确的隔离 fixture，不访问生产资源，并检查所有请求为 GET、数据库总变更数不增加。检查桌面 1440×1000、390×844、320×740、选择/搜索/日期/平台、Hover/键盘、迟到响应与页面溢出。

已有 Playwright 和 Chromium 时可执行：

```bash
POAI_CHROMIUM_EXECUTABLE=/path/to/chromium node tests/price-history.browser.mjs
```

Playwright 不在本仓库依赖中；如已安装在环境其他位置，设置 `POAI_PLAYWRIGHT_MODULE` 为其模块路径。`POAI_BROWSER_SCREENSHOTS` 可覆盖截图目录，默认 `/tmp/poai-price-history-browser`。不通过跳过测试替代浏览器检查。

生产真实历史覆盖、D1 查询性能、Cloudflare 构建/部署和真实 Chrome/Mac/Windows 未由隔离测试证明。仅 API 持有 D1；没有增加凭证、生产写入或数据库迁移。正式发布仍由 GitHub main 合并后的 Git Integration 完成。
