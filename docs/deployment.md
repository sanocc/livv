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

Cloudflare Access应用LIVV OTA已创建（19068fef-ab4b-43e3-b547-23b284945bee），域名ota.livv.cc，唯一Allow策略为用户确认的管理员邮箱。团队livvcc.cloudflareaccess.com。实际AUD已通过Wrangler secrets配置到API的INTERNAL_OTA_ACCESS_CLIENT_ID，另配置CF_ACCESS_TEAM_DOMAIN和ADMIN_EMAILS，不提交凭证。Chrome已实际通过Access登录，OTA市场页正常加载，后续已保存真实市场列表与极简房型，详见docs/testing.md。

Access只保护ota.livv.cc；api设备路径使用独立设备凭证，不应被人类Access登录重定向阻断。API仍验证人类JWT用于管理员接口。仅前端有认证网关不够，后端签名校验保持开启。

## 已部署资源

2026-10-01：D1远程迁移0001_v1.sql成功，三个Worker已实际部署并绑定api.livv.cc、ota.livv.cc、livv.cc；API健康检查200、官网200。OTA域名正常重定向Access，实际管理员登录后市场页正常加载；未登录管理员API返回401。三个Git构建均成功，Gate B通过。

构建镜像默认Node24，项目要求Node24+：[Cloudflare官方构建镜像说明](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)。

## Gate I/J部署（2026-10-01）

main代码提交72f36ca50040f50b2683da976fca79c356969fb6包含Gate I/J；API和OTA Workers Builds均success，API健康200且D1依赖正常；官网和Helper无改动，无数据库迁移。Git CLI缺少HTTPS凭证时使用已登录GitHub Desktop完成正常push，未改认证规则。

已在自动测试通过和部署成功后，通过正式OTA创建生产14天计划3963a563-7687-45dc-9b2a-d33cbdd0cd7c；每分钟Cron沿用现有配置，计划与任务排期只读证据在本地忽略目录.local/proofs/gate-j-plan-before.json。实际浏览器采集不是部署检查的通过条件，需在线Chrome Helper执行。

生产Cron实测：2026-10-01 12:43:47.000（Asia/Shanghai）每分钟调度事件outcome=ok。事件前后两次只读D1查询的25个Task ID、schedule_key、due_at、原始窗口及created_at完全一致，确认无重复且无重排。证据：.local/proofs/gate-j-cron.json、gate-j-plan-before.json、gate-j-plan-after.json（本地忽略目录；不提交设备或认证数据）。

## 第一阶段封板部署核验（2026-10-01）

生产代码基线208a300dfcfd62e200542835e898f82cefc2028e。该提交新增Helper详情入口限时加载兼容及3项测试，GitHub的Workers Builds: livv-api completed/success；API业务代码未变，OTA/LIVVCC仍为各自已有成功部署，无需强制重部署。当前Mac同一已批准设备已重载Helper，两个真实30家任务详情3/3成功，详见testing.md。

14:01:26（UTC+8）HTTP核验：api.livv.cc/health=200、database=ok；livv.cc/=200；未登录ota.livv.cc/=302到既有Cloudflare Access，未登录API管理员session=401。随后已登录Chrome刷新OTA成功，市场实际加载快照、酒店表、我的酒店¥190与中位价¥190，确认Access、OTA资产及API Service Binding链路正常；302本身不单独作为已登录应用健康证据。这些价格仅是该快照值。

正式14天Plan仍启用，每分钟Cron配置未变；唯一短窗口验收Plan已停用，其Task全部终态，无其他独立验收任务继续执行。生产无Debug表、无测试Fixture写入观察；历史结果全部保留，14:03验收跟进已暂停。本轮只修正文档交接状态，不修改或部署业务逻辑。封板期间未新增Secret、权限或数据库迁移。
