# Collector M03

最小可用采集扩展。

- 安装后自动 `POST /api/v1/collector/register`
- 凭证只存在 `chrome.storage.local`，Popup 不展示 token
- pending：可本地采集，不能上传
- authorized：可上传 `POST /api/v1/collector/collections`
- 五个 OTA 目前只做域名识别，不做官方列表/房价解析（M04）
