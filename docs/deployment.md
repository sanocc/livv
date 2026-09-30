# 部署实况

2026-10-01：新仓库 https://github.com/sanocc/livv ，创建时间2026-09-30T16:59:15Z，验证时size=0，无refs，管理员写权限正常。本地旧.git移入忽略目录.local/discarded-git-v0；新main重新初始化，旧9个提交不推送。

Cloudflare账号已通过现有Wrangler OAuth验证。创建全新D1 livv-v1；数据库ID在api/wrangler.jsonc。旧数据库/Worker未迁移；盘点时Worker、D1与Access Apps均为空。

## 工程与命令

Node24+，npm ci，npm test，npm run check。当前官方Wrangler4.145.0锁定在package-lock。

npm run deploy:api / deploy:ota / deploy:livvcc。D1迁移：wrangler d1 migrations apply livv-v1 --remote --config api/wrangler.jsonc，仅对新库执行。

## Workers Git Integration

必须选择新仓库的repo ID，不能沿用旧同名仓库连接。生产分支main。项目根目录保留仓库根，让公共package-lock与测试可用。构建命令npm ci && npm test && npm run check。

| Worker | 部署命令 | watch includes |
|---|---|---|
| livv-api | npx wrangler deploy --config api/wrangler.jsonc | api/**, tests/**, scripts/**, package.json, package-lock.json |
| livv-ota | npx wrangler deploy --config ota/wrangler.jsonc | ota/**, package.json, package-lock.json |
| livv-livvcc | npx wrangler deploy --config livvcc/wrangler.jsonc | livvcc/**, package.json, package-lock.json |

helper不会作为网站部署。首次连接需Cloudflare GitHub App授权新repo，后续可以使用Builds API建立三个触发器。

## 人类身份配置

Cloudflare Access应用尚未创建，API管理员鉴权因此fail closed，OTA页面拒绝访问。管理员需要确认邮箱白名单；API需要CF_ACCESS_TEAM_DOMAIN、CF_ACCESS_AUD或INTERNAL_OTA_ACCESS_CLIENT_ID、ADMIN_EMAILS，保密配置通过Wrangler secrets设置，不提交Git。

Access只保护ota.livv.cc；api设备路径使用独立设备凭证，不应被人类Access登录重定向阻断。API仍验证人类JWT用于管理员接口。仅前端有认证网关不够，后端签名校验保持开启。
