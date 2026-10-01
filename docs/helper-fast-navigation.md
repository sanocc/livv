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
