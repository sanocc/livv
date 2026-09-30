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

helper不会作为网站部署。首次连接需Cloudflare GitHub App授权新repo，三个Worker均已连接新仓库main，预览分支构建关闭，监视路径按上表保存；提交2d905d8已触发三个Workers Builds，GitHub check-runs均completed/success。现有Wrangler OAuth不具备Builds/Access组织管理权限，连接与Access配置通过已登录控制台完成。

## 人类身份配置

Cloudflare Access应用LIVV OTA已创建（19068fef-ab4b-43e3-b547-23b284945bee），域名ota.livv.cc，唯一Allow策略为用户确认的管理员邮箱。团队livvcc.cloudflareaccess.com。实际AUD已通过Wrangler secrets配置到API的INTERNAL_OTA_ACCESS_CLIENT_ID，另配置CF_ACCESS_TEAM_DOMAIN和ADMIN_EMAILS，不提交凭证。Chrome已实际通过Access登录，OTA市场页正常加载，尚无真实市场数据。

Access只保护ota.livv.cc；api设备路径使用独立设备凭证，不应被人类Access登录重定向阻断。API仍验证人类JWT用于管理员接口。仅前端有认证网关不够，后端签名校验保持开启。

## 已部署资源

2026-10-01：D1远程迁移0001_v1.sql成功，三个Worker已实际部署并绑定api.livv.cc、ota.livv.cc、livv.cc；API健康检查200、官网200。OTA域名正常重定向Access，实际管理员登录后市场页正常加载；未登录管理员API返回401。三个Git构建均成功，Gate B通过。

构建镜像默认Node24，项目要求Node24+：[Cloudflare官方构建镜像说明](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)。
