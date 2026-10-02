# 部署与运维

正式域名：poai.cc、ota.poai.cc、ops.poai.cc、ai.poai.cc、api.poai.cc。
Worker：poai-site、poai-ota、poai-ops、poai-ai、poai-api。

API 独占 DB 绑定；poai-data ID 为 75a2bb2d-ca57-4be9-9eb4-6b389d504c5f。OTA 通过 API Service Binding 调用 poai-api，不直接访问 D1。数据库全量复制、命名迁移与校验见 docs/poai-migration.md。不要在已有生产数据库重新执行初始化 SQL。

Node >=24，npm ci 自动准备品牌资产和 Agent ZIP。npm test 与 npm run check 均须通过，再执行 npm run deploy:api / deploy:ota / deploy:site / deploy:ops / deploy:ai。各服务使用自己的 wrangler.jsonc。当前 Agent 版本 1.3.2，下载包必须和 manifest 同步，不保留旧协议包作为正式下载。

API Secret 名称：ADMIN_EMAILS、CF_ACCESS_TEAM_DOMAIN、INTERNAL_OTA_ACCESS_CLIENT_ID、CF_ANALYTICS_READ_TOKEN。不提交实际密钥。Access 团队域为 poai-cc.cloudflareaccess.com；POAI OTA 应用 ID 19068fef-ab4b-43e3-b547-23b284945bee，audience 与唯一管理员规则保留。禁止为解决登录问题放宽 Access 或绕过 JWT 校验。

Agent 心跳与高频事件写入 agent_events；真实业务状态以 D1 Task/Attempt 为准。关键错误与终态写 agent_logs，历史错误不清洗为成功。Analytics 具备采样与延迟，不能用其事件数量代替任务审计。

Cron 为 * * * * *。正式 14 天 Plan 的 ID、内容、启用状态与频率不变。2026-10-02 的最终数据库切换获用户批准，01:09 UTC 左右暂停，01:10:19 UTC 恢复。无跨窗口补采或状态改写。

Mac 安装路径 /Users/san/Github/poai/agent，扩展 ID nefbadfphcnndlmjemnkmaplajmflmfm。本机批准设备 UUID 保留，自动接单恢复。迁移路径时先私密备份 chrome.storage.local，通过临时无网络入口恢复身份，然后移除入口并重载正式 background.js；临时文件不进入发布包。不要用重新注册设备替代已批准设备。

Windows 仍为旧版，最终新版本真机验收 PENDING。须在原设备配置基础上升级，保留 UUID/凭证；不宣称已跨平台通过。

五项 Git Builds 已有连接，但本轮目录和仓库改名后的构建配置、Access 策略/令牌名称及全面云端残留核验仍在进行。现阶段不能将全量清理标记为完成。生产网站/API 的手动部署成功不等同 Git 自动部署验收成功。

原数据库与旧扩展只有在新链路、历史读取、日志与 OTA/OPS/API 验证全部通过后才可删除。私密备份保存在 .local/proofs，排除当前有效源代码扫描和 Git 提交；凭证不写入报告。
