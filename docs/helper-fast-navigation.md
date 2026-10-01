# MARKET_LIST快速导航验证（2026-10-01）

真实办公室Mac，已批准设备56d208e8-90cd-49bf-ae84-b17a43d9f1b9。先通过携程自身UI生成URL，再只读DOM/data-exposure，没有input.value伪注入。原始URL/DOM存于本地忽略目录.local/proofs/fast-nav-*，完整追踪URL不硬编码入仓库。

| 样本 | 城市 | 入住→离店 | 关键词 | 实际原生参数 |
|---|---|---|---|---|
| A | 咸宁 | 10/05→10/06 | 中心花坛 | city937，POI 13\|10674382 |
| B | 咸宁 | 10/06→10/07 | 中心花坛 | city937，相同POI，日期改变 |
| C | 咸宁 | 10/05→10/06 | 咸宁北站 | city937，POI 10\|2468545 |

d-city为城市ID，d-name数组首项为城市名；c-in/c-out为ISO日期。s-keyword首项为关键词，后续13/10及组合键为原生分类/POI导航标识；s-filters同关键词组合键必须一致。日期切换时中心花坛filter分类实际从13变为18，不能凭名称猜完整tuple。类别列表、坐标复合串及其他索引原样保留，不声称完全理解。

A首页查询带日期相关cache-key/cacheKey，不缓存此类模板；B/C后续原生导航没有这些键。locale/curr/alliance/sid/trace/extra/page-token/dplinktracelogid等opaque上下文保留。简化city/date/keyword/filter URL以及去掉page-token/dplink的候选均实际落到上海2、10/01→10/02、空关键词，尽管地址栏像正确；记录失败，未采集上传。完整B URL回放及只替换日期回放A，实际Context/曝光全部匹配。不能据此宣称某个单独opaque字段必需。

本机navigation_profiles包含platform/city_name/platform_city_id/keyword/keyword_type/keyword_id/url/verified_at，最多30条、24小时有效，成功验证后刷新。不硬编码937/POI生产映射；未知城市/关键词、过期资料自动UI回退。首次测试资料取自上述真实UI页面，不将冷启动自动取得可缓存模板标为独立真实PASS。未来平台拥有独立资料，本轮不新增OTA。

FAST_NAVIGATION全部Context一致才进入列表；45秒未ready或已出现不一致卡片记录回退。列表每轮继续核验，不混入错误页面；隐藏关键词不算确认。达到目标立即锁定上传，既有去重/滚动策略保留。独立详情任务属于后续工作，本轮不创建COMPETITOR_DETAIL，不把新列表快照详情0解释为详情采集成功。

## 跨设备冷启动补验（Helper1.2.1：FAST_NAV Mac: PASS；Windows: PENDING）

2026-10-01生产日志确认：Mac后续仍执行升级前LEGACY_MARKET_DETAIL，按原契约走UI并采详情；这不是MARKET_LIST快速路径未启用。Windows“酒店办公室”（3cad8b8e-0a99-410d-9fb3-8e1bf88004c7）首次MARKET_LIST无本机navigation_profiles，五次都记录No verified city/keyword profile，回退UI，其中四次SEARCH_CONTROL_TIMEOUT，一次DEVICE_OFFLINE；Task最终MAX_ATTEMPTS_REACHED，历史不修改。

独立Codex浏览器直接回放B原生完整URL，页面可见咸宁/中心花坛，所有初始卡片曝光937/20261006/20261007。去掉page-token与dplinktracelogid仍落到上海/默认日期，再次记录失败，不能据此猜出精简URL。原完整URL仅替换为10/02→10/03，独立页面可见与12张曝光全部一致。此为导航模型验证，不是Windows Helper采集PASS。

本轮随Helper提供版本化的咸宁/中心花坛原生B模板（ctrip-navigation-profiles.js），字段均来自原成功导航；保留完整opaque公开搜索/跟踪字段，不包含cookie、设备/API凭证。此前“不将完整追踪URL硬编码”的实现已改为保留经过独立回放的公开模板，以解决新设备无法经UI建立缓存的问题。它不是每次任务已经验证的结果；observed_on只表示证据日期。缓存仍优先复用24小时内资料；无缓存、失效或损坏时，已支持的城市/关键词可尝试随扩展模板。模板没有假定24小时后仍能永远有效，实际每次必须通过严格DOM/曝光验证，失败走既有UI。未知城市/关键词仍回退，不推断其他POI。

MARKET_LIST专用入口保持chrome.tabs.update/create直接目标页→FAST_NAVIGATION→严格Context→LIST→达到数量锁定→上传；不进入详情/房型。LEGACY_MARKET_DETAIL既有契约不改，正式Plan频率不改；尚未实现独立COMPETITOR_DETAIL调度。按阶段A/B授权：今晚三轮Mac通过后Commit/Push，Windows留至设备可用后真实验收；仅双方通过才报告跨平台PASS。

Mac三轮真实列表全部COMPLETED，其中第三轮先确认active=false再仅清除navigation_profiles，真实10/03→10/04直接导航、严格Context成功，验证随扩展模板冷启动有效；缓存由成功DOM自动重建。未清除identity、日志、Task或历史观察。具体Task/Attempt/Snapshot及耗时见testing.md。
