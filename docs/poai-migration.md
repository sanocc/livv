# POAI 品牌迁移实况

日期：2026-10-02。代码基线9c1f9d84b792735e7bdd62924f193be1a6d53ce4，main继续开发。POAI为唯一正式品牌；旧名称只作为历史证据与少量技术标识保留。

## 产品与域名

| 地址 | 服务 | 实际状态 |
|---|---|---|
| poai.cc | livv-livvcc | 完整POAI官网、PO连接字标及同源App图标、Agent下载 |
| ota.poai.cc | livv-ota | 原市场/趋势/映射/任务/设备，原Access应用迁移 |
| api.poai.cc | livv-api | 原API、D1、Cron、Agent日志；/health正常 |
| ops.poai.cc | poai-ops | 新建浏览器本地CSV/XLSX分析，无云端经营文件上传 |
| ai.poai.cc | poai-ai | 新建产品页面/基础入口，未接模型，未执行自动动作 |

五个Custom Domains已启用；poai.cc区域active，原旧域名路由不再作为正式开发目标。保留Worker名称可避免重建Secrets、Service Binding和现有Git Builds；这不是双轨业务。Access应用ID、JWT audience与管理员授权规则保持不变，仅名称/目标域名更新。团队技术域livvcc.cloudflareaccess.com暂时保留。

品牌代码f55bc9373504ed09e128d920412c4e08d1fd5460已推送main；原API/OTA/主站三项Workers Builds全部success。新增OPS/AI也连接sanocc/livv的main，复用原构建令牌、不扩大权限，构建命令npm ci && npm test && npm run check，分别部署ops/wrangler.jsonc与ai/wrangler.jsonc，预览构建关闭。后续提交由五项Git Builds自动部署。

本机代理曾将新域解析成198.18.0.x并对poai.cc/ai.poai.cc重置连接；公开Cloudflare DNS为104.21.50.133/172.67.206.138。使用真实公开地址且保持TLS证书验证的HTTPS请求两站均200；相同部署Worker地址也通过真实浏览器检查。不是绕过证书警告，不修改用户代理/系统DNS。其他新域通过正常本机访问验证。

## 保留范围

原D1 livv-v1 / 68cfcb1e-913a-4013-aa9d-5ae27f2a1150未清空。原表、Schema字段、身份、历史Observation/PARTIAL/FAILED保留。正式14天Plan3963a563-7687-45dc-9b2a-d33cbdd0cd7c整行不变、enabled=1。临时验收Plan仍enabled=0。

迁移后核对：原58个历史快照仍58个，总快照61个；FAILED仍40、PARTIAL仍11，COMPLETED由47增加到50。两个Plan整行与迁移前JSON一致。Mac原设备已心跳上报1.3.1；Windows仍1.2.0，需更新原扩展并完成新域名真机验收。

内部保留项：仓库sanocc/livv、livvcc/与helper/路径、三个旧Worker名称、DB名、livv_hotels/livv_hotel_id协议字段、X-LIVV-Device-ID、livv-heartbeat闹钟、原Analytics数据集及只读Token名称。原因是身份/鉴权/绑定/历史连续性；不在普通品牌页面展示。

携程mobile/input/navigation/collection逻辑、Task/Attempt状态机、正式Plan频率、市场统计和映射不变。新MARKET_LIST仍仅采列表，详情沿用历史合并任务契约；不为品牌切换新增平台或推测URL。

## Agent 与日志

POAI Agent / POAI酒店助手1.3.1，从1.3.0递增0.0.1。原Chrome扩展目录和ID不变，设备身份不变。Manifest host_permissions与API基址改api.poai.cc；关于区显示版本、构建日期和生产环境。主站提供同版本ZIP，已有设备覆盖原目录再重载，不重新注册替代设备。

复用原telemetry独立异步队列。0003_agent_logs.sql仅增加低频关键日志表：设备、版本、任务/执行、等级、事件、安全描述、错误码、白名单metadata与发生/接收时间。按设备/事件ID幂等。高频心跳/列表进度仍走Analytics；原attempt_events和Workers Logs保留。无Token/Cookie/HTML/自由URL上传，错误/终态匹配D1状态才接受。OTA设备运行概况可远程查看关键日志及原执行错误，历史未知版本保持缺失。

Wrangler迁移子命令一度7403；随后使用同一既有OAuth的已验证D1 REST通道成功执行0003并登记d1_migrations，无新凭证/权限申请。

## 首版能力边界

仓库原来没有OPS/AI；没有声称复用了不存在的旧页面。OPS支持CSV（UTF-8/GB18030）及.xlsx第一张表、日/周/月/季/自定义范围、营收/房量/ADR/OCC、渠道收入/均价、房型及同日对比。公式须转值，.xls须另存.xlsx；5MB/10000行限制。文件仅在浏览器内处理，刷新后不保存。AI明确标记建设中，数据问答/模型/授权动作未开放。

用户清单中review_count及估算动态时间等字段不在当前Schema；品牌迁移没有伪造、补写或扩展这些采集字段。原dynamic及原有数据保持原样，相关新增能力属于后续明确需求。

真实Mac任务与云端证据、测试结果见testing.md。Windows新版本及新域名最终真机验收仍PENDING，不宣称跨平台PASS。
