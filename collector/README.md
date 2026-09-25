# 酒店助手 V1.0.32

UI-S1 — Chrome Side Panel

Parser principle: Specific DOM Field Mapping First.

这是一个 Manifest V3 Chrome 扩展，只读取用户当前已经打开并加载完成的携程酒店列表 DOM。产品名称为“酒店助手”，品牌标识为 LIVV。

## 安装

1. 打开 `chrome://extensions`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择 `/Users/san/Projects/livv/collector`
5. 手工打开携程酒店搜索结果页
6. 打开“酒店助手”，点击“读取当前页面”

读取时 Popup 或 Chrome Side Panel 会按需注入 parser 与 reader，因此扩展重新加载后不需要刷新已经打开的携程页面；城市、日期和位置/品牌/酒店关键词控制仅在用户点击对应按钮后操作携程真实候选；执行搜索时才点击携程真实搜索按钮；开始采集后才以有限步长自动滚动，并可随时停止。

## 边界

Side Panel 使用 Chrome 原生承载，service worker 只负责设置点击扩展图标后打开 Side Panel；不调用 API、D1 或 Cloudflare，不创建任务，不自动打开、搜索或滚动携程页面，也不上传数据。
