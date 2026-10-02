# POAI 开发规则

本文件适用于整个仓库。GitHub `sanocc/poai` 是 POAI 唯一正式代码源。
本文记录长期工作规则；`docs/` 中的历史验收、旧版本号、旧任务范围不是当前授权或当前运行状态。
遇到冲突，核对当前代码、配置、测试和最新明确需求，不照搬历史部署操作。

## 代码与 Git

- 开始任务先检查 `git status --short`，保护已有修改；读取最新远端 `main`，记录远端 SHA 与当前基线 commit。通常使用 `git fetch origin main`、`git rev-parse origin/main`、`git rev-parse HEAD` 核对，不能把旧 checkout 当作最新 main。
- Codex Cloud 默认从已确认的基线创建独立工作分支，使用当前隔离环境的现有 checkout；除非用户明确要求，不另建 Git worktree。不重置、覆盖或删除他人的修改，不 force-push main。
- 只修改任务相关模块。先查相关 README、文档、manifest、脚本、配置及测试；协议或共享资产影响其他模块时说明具体依赖。
- 完成修改后运行适用的定向测试、必要构建/页面检查，以及根目录完整 `npm test`、`npm run check`。检查 Git diff、生成产物和未跟踪文件，排除无关改动和秘密。
- 测试通过后 commit、push 工作分支，优先创建 PR 到 main，不默认直接推送或合并 main。PR API 不可用时报告具体错误，提供已推送分支和 PR 创建链接；Git 推送认证和 API 权限必须分别验证。
- 不得为了 CI 通过删除测试、降低断言、隐藏真实错误、跳过应执行的测试，或反复碰运气重试 flaky test。先复现并定位根因，使用确定性测试数据；重复运行用于验证修复，保留实际失败证据。

## 生产发布与权限

唯一正式发布链路：`Codex Cloud → GitHub → PR/main → Cloudflare Git Integration → Production`。

- Codex Cloud 禁止直接运行 `wrangler deploy`、`npm run deploy:*`、模块 deploy 脚本，或通过 REST、Dashboard、其他工具直接发布 Cloudflare Production、绕过 GitHub。
- Cloudflare 自己在 Git 构建环境执行已配置的 Wrangler 部署命令属于正式链路，不属于 Codex 直接部署。仓库存在 deploy/build 脚本不代表 Codex 获得直接部署授权。
- 模块 `npm run build` 当前含 `wrangler deploy --dry-run`。它不发布，但为避免误执行 deploy，本规则下不要在 Codex Cloud 调用；用源码测试、检查、主站 Vite 构建和明确的本地开发验证。需要 Worker 打包检查时先选择不调用 deploy 的支持方式。
- 不得擅自修改 Cloudflare Access、Secrets、API Token、生产 D1、域名、路由、Cron、生产 Worker 配置或 Git Integration 设置。相关变更必须在明确授权范围内单独评估；直接生产部署禁令保持有效。
- 不输出、提交或复制秘密值、设备凭证、Cookie、私密备份到代码、PR、日志或文档。先核对现有绑定和可用权限，不因 GitHub CLI 未登录就要求新的 token。
- Watch Paths 建议见 `docs/cloudflare-build-watch-paths.md`。建议不是 Dashboard 当前配置或已生效变更的证明。

## 当前模块边界

| 目录 | 职责与边界 |
|---|---|
| `api/` | Cloudflare Worker API；唯一 D1 入口，设备/管理员鉴权、Plan/Task/Attempt、调度、原子上传、市场读取和诊断；迁移在 `api/migrations/` |
| `ota/` | 市场走势、任务、酒店映射、设备与诊断 UI；Worker 经 `API` Service Binding 调用 `poai-api`，不直连 D1 |
| `site/` | React/Vite 六屏官网、产品展示和 Agent 下载；源码 `src/`，素材 `homepage-assets/`，发布目录 `public/` |
| `agent/` | Chrome MV3 扩展，后台持有设备身份、心跳、领取、DOM 采集和上传；Side Panel/popup 负责展示，经受约束的消息访问后台 |
| `ops/` | 浏览器本地 CSV/XLSX 经营分析；经营文件不上传，无 OPS 业务数据库表 |
| `ai/` | 静态产品入口，当前没有模型调用或授权动作实现；不得宣称已具备 AI 后端 |
| `brand/` | 正式 PNG 品牌源图、同源图标/favicon；保持源图，不近似重绘；派生资产由既有脚本准备 |
| `scripts/` | 资产复制、Agent ZIP、品牌生成及语法/MV3/数据库边界检查；`cloudflare.mjs` 是历史运维工具，不是生产操作授权 |
| `tests/` | Node 测试、内存 SQLite 适配、浏览器/扩展 mock 和固定 fixture；不接触生产数据，不替代真机证据 |
| `docs/` | 架构、API、数据库、运维和按阶段保留的验收记录；新增记录注明版本、范围与证据 |

仓库声明五个 Worker：`poai-api`、`poai-ota`、`poai-site`、`poai-ops`、`poai-ai`。
Agent 是浏览器扩展，通过主站下载 ZIP 分发，没有独立 Cloudflare Worker。
扩展发布版本以 `agent/manifest.json` 和实际包内容核对，不以可能滞后的 `agent/package.json` 或历史文档版本判定。

## 数据与数据库

- 只有 API 持有 D1 数据库绑定。OTA 使用既定 Service Binding；Agent 经 HTTPS API；其他模块保持自己的 API/本地处理边界，不增加绕过 API 的数据库访问。
- 禁止伪造、补零、插值或猜测酒店采集数据；缺失值保持缺失，真实零值与缺失不同。失败、PARTIAL、CANCELLED、自然耗尽与 stop reason 如实保存，不能把超时或停滞当作耗尽，把缺价当作售罄。
- 原始 Observation、Snapshot 和策略历史不可改写；酒店映射须人工明确确认，解除映射保留历史。Task 与 Attempt 状态分开，不用一次 Attempt 失败推断 Task 最终失败，不以采样遥测替代 D1 业务权威状态。
- 保持单设备单任务、窗口/租约、重试上限、幂等和上传事务边界；未经明确需求不更改正式 Plan 的频率、启用状态或历史任务。业务时区以 `api/src/config.js` 的 `Asia/Shanghai` 为准。
- 当前新任务/物化计划使用 `MARKET_LIST`；旧任务保留 `LEGACY_MARKET_DETAIL` 契约。独立 `COMPETITOR_DETAIL` 尚未开放，不能把列表的详情零项当作详情验收成功。
- Schema/migration 是高风险修改。先检查新旧 API/Agent 兼容、已有数据、外键、索引、trigger、原子性及回滚/恢复影响，再在隔离数据库演练；保存已有迁移，不擅自改写历史迁移。生产执行需要单独授权和可审查的备份/恢复方案。
- 不得为测试方便清空、重建生产数据、在已有生产库重跑初始化、制造观察值或改写失败终态。自动测试使用内存 SQLite；本地 D1 明确使用 `--local` 和隔离持久目录。

## Agent 与真实设备验收

- Agent 为 Chrome MV3；涉及 DOM、携程页面、扩展生命周期、设备身份、任务执行的修改，必须明确区分自动测试与真实 Chrome/Mac/Windows 验收。
- 没有实际设备验证就报告“未验证/待验收”，不得宣称真机 PASS；Mac 结果不自动代表 Windows，浏览器模拟器/mock 或心跳在线不等于真实采集成功。
- 保留原设备 ID、凭证、批准状态和 chrome.storage；升级默认原位覆盖/重载，不卸载、清空身份或注册替代设备。实际设备操作需要用户参与或已有明确授权，避免重载正在执行任务的扩展。
- 按现有作用域限制浏览器操作，只处理自有受管携程 HTTPS 酒店标签页。保持公开 DOM/卡片城市、日期、关键词与 Hotel ID 验证；不以 URL 外观代替真实上下文，不绕过验证码/登录，不扩大 debugger 的使用范围。
- 必要真机报告应记录实际版本、平台、任务/执行/快照关联、真实数据与失败；历史样本不冒充本次改动的验收。遥测和诊断失败不能阻塞或伪造业务结果。

## 安装、构建与验证

- Node `>=24`，使用仓库锁文件。根目录安装 `npm ci`，主站依赖单独在 `site/` 执行 `npm ci`；不无故更新依赖或锁文件，不关闭 TLS、包签名或校验。
- 根目录 `npm ci` 会运行 `prepare`，复制品牌图标至四站和 Agent、复制 `site/public/style.css` 至 AI、复制 fflate 至 OPS、生成当前 Agent ZIP。先保护已有修改，再检查生成 diff，不盲目提交跨模块产物。
- 仅文档/测试任务且依赖已在环境中可用时，无需重复安装或重建资产。确需跳过安装生命周期时，只能明确使用已有有效资产并解释原因；这不允许跳过测试或 CI 检查。
- 根目录必跑 `npm test`（`node --test tests/*.test.js`）及 `npm run check`。后者执行 JS 语法、非 API 模块禁止 D1 绑定及 MV3 必需文件检查，不是完整前端构建或真机测试。以当前运行的实际测试数和退出状态为准，不将历史数量作为通过证明。
- `site/` 仍要求提交构建产物：修改主站源码/素材后执行 `npm run build:web --prefix site`，同步提交对应 `site/public/` 输出和引用；保留下载路径、既有共享 `public/style.css`。Vite 的 `emptyOutDir: false` 不保证自动清理旧产物，不做无关批量删除。
- UI 改动按范围检查桌面/手机、导航、可访问性、减少动态效果及控制台错误。测试合成数据只用于明确标识的演示/隔离测试，不混入生产观察。
- 本地服务需显式使用本地数据库和本地配置；不要假设云快照保留运行进程。现有 local 管理员方式只用于 `ENVIRONMENT=local`、loopback URL 与匹配 token，不放宽生产 JWT 校验。

## 自主工作与交接

- 普通技术选择自主完成，不频繁请求确认。必须登录、生产权限/Secrets、真实设备操作、不可逆生产变更或重大需求歧义阻塞时才请求具体人工介入；继续完成不受影响的工作，不在聊天索取秘密值。
- 每次结束报告：修改内容、测试命令与结果、未验证事项、branch、commit、PR 或创建链接、生产部署是否触发及证据。
- 分开报告本地通过、Codex Cloud 环境通过、Cloudflare 构建通过、生产部署通过、真机通过；commit/push 不证明已部署，保存配置不证明已生效，历史 PASS 不证明当前状态。
- 保留未解决失败和外部阻塞的真实说明；PR/部署状态不可读取时报告未知，不假称成功。
