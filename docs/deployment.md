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

## V1.1稳定化部署与轻量运行检查（2026-10-01）

32项自动测试及scripts/check.mjs通过后，用既有Wrangler授权部署API只读runtime接口，再部署OTA任务页；无迁移、Secret/鉴权/权限或Cron变动。API版本1af23dd6-77d4-48bb-8c2d-9fd7e8cbfb2b，OTA版本789eb7d8-88fc-4cc8-9dab-a685146e7aad。14:58核验API health=200/database=ok，OTA首页200、LIVVCC首页200；已登录真实OTA任务页成功显示与D1一致的汇总。

日常只需打开现有任务页并刷新：看今日已生成Task、终态成功率、来源分开的错误代码、在线设备和最近成功上传；需要具体原因时查看既有Task详情的Attempt/事件时间线。指标与范围定义见docs/api.md、docs/testing.md。设备最近错误随后续心跳变化，历史Attempt错误不变；无数据不能当成功。

保持设备56d208e8-90cd-49bf-ae84-b17a43d9f1b9的Chrome/Helper在线、电脑不休眠，现有正式14天Plan自然运行。不补采过期窗口，不额外创建验收Task，不删除PARTIAL/FAILED。ATTEMPT_TIMEOUT保留观察项，积累跨窗口/多次真实证据后再评估，不能为个别错误延长租约或改写终态。Gate G独立映射已恢复正确名称/other分类，原三家详情目标不变；停用验收Plan仍无活动Task。此次范围完成后停止新增开发，无新监控平台或OPS。

## V1.2市场UI发布（2026-10-01）

只修改OTA静态前端、UI测试和文档，沿用market/runtime只读API与现有Access/Service Binding。npm test（34项）、npm run check、OTA Worker dry-run及本地真实数据UI检查通过；从GitHub main Push触发既有Cloudflare Workers Builds，等待自动部署后验证线上。无手工部署替代自动部署、无迁移、无新Secret/权限/接口/业务规则。生产Plan/Device只读前后证据保存在.local/proofs/v12-production-before.json及发布后证据，本地预览仅GET/SELECT，结束后停止。

发布代码提交f3363f7579f31435e11ed41cfca6948d7cbed4cb：GitHub Workers Builds livv-api于15:42:24、livv-ota于15:42:32（UTC+8）均completed/success。API因tests/**监视路径触发相同源码自动构建，API业务代码未改。随后已登录真实Chrome加载ota.livv.cc，确认OTA V1.2资产、默认市场/14天、五卡真实价格、30天走势至10月30日（无数据四项—）、核心竞品两家、Vienna悬浮原始Hotel ID/划线/优惠/起售价正常；线上截图确认五卡一行和蓝色商务布局，无需继续像素调整。构建证据.local/proofs/v12-builds.json。

15:43:39 Helper设备仍approved/在线/1.0.0，无RUNNING Attempt；正式14天Plan及停用验收Plan整行与发布前完全相同。API health=200/database=ok。设备last_error=API_TIMEOUT在15:38本地预览证据中已存在，早于15:42发布，保留为实际观察项，不归因此次UI也不伪称消失。下一自然Task due_at为16:06:55.233，本轮未新增人工Task、未重载扩展、不宣称执行了新真实采集复验；以未修改业务源码/配置、计划整行不变、设备心跳及API健康确认UI未变更生产链路。发布后证据.local/proofs/v12-production-after.json。已结束本地仅读预览，完成第一版后停止新增开发。

## 走势周期胶囊发布（2026-10-01）

实现提交e5b7f3545f659ef96deccdbd51f8a7750eeb3d14已Push main，Workers Builds livv-api于16:43:50、livv-ota于16:43:57（UTC+8）completed/success。线上真实已登录Chrome核验：顶部只有入住日期/市场范围，默认未来14天至10月15日T+14，切未来30天至10月31日T+30，所选入住日期10月1日、30家市场、五卡价格及酒店列表保持原样；胶囊位于图表标题旁，副标题无重复周期，四线和真实缺失—保留。证据.local/proofs/period-builds.json、period-online.png。

发布前后D1 Plan逐字段比较完全一致：正式3963a563-7687-45dc-9b2a-d33cbdd0cd7c仍enabled=1/horizon=14，停用验收Plan仍enabled=0。16:44只读核验设备56d208e8-90cd-49bf-ae84-b17a43d9f1b9 approved/1.0.0，心跳16:44:09、last_error=null。期间自然Task96afe25685b21ad2b4823b7e6baf7778在16:00～18:00原窗口内于16:08:53真实COMPLETED；该成功早于本次16:43发布，证明开发期间仍自然运行，不冒充发布后新的采集验收。全部历史错误与结果保留，无人工任务、生产数据改写或Helper重载。比较证据.local/proofs/period-production-before.json、period-production-after.json。
