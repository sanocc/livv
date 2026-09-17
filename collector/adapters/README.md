# LIVV OTA Adapters

M04 将 OTA 页面采集逻辑从 Popup 和通用 Parser 中拆出。

## 原则

每个平台独立实现 Adapter。

禁止：

- 扫描整个页面文本猜酒店。
- 使用酒店名称冒充 OTA 官方 ID。
- 因为“看起来像价格”就取卡片最小数字。
- Adapter 直接上传 API/D1。

必须：

- 从真实酒店 Card 开始。
- 字段使用明确 selector / 数据源。
- ID 不确定时返回 null。
- 价格不确定时标记 ambiguous。
- 保存 evidence。
- 输出统一 HotelFact。

## Migration

1. Ctrip
2. Meituan
3. Tongcheng
4. Fliggy

旧 `parsers/` 在四个平台全部验收前保留。
