# 酒店助手 V1.0.19

Phase 3A — City Control State Verification Fix

Parser principle: Specific DOM Field Mapping First.

这是一个 Manifest V3 Chrome 扩展，只读取用户当前已经打开并加载完成的携程酒店列表 DOM。产品名称为“酒店助手”，品牌标识为 LIVV。

## 安装

1. 打开 `chrome://extensions`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择 `/Users/san/Projects/livv/collector`
5. 手工打开携程酒店搜索结果页
6. 打开“酒店助手”，点击“读取当前页面”

读取时 Popup 会按需注入 parser 与 reader，因此扩展重新加载后不需要刷新已经打开的携程页面。

## 边界

本阶段没有 background/service worker，不调用 API、D1 或 Cloudflare，不创建任务，不自动打开、输入、搜索、滚动携程页面，也不上传数据。
