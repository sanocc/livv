# Cloudflare monorepo Build Watch Paths 审计建议

审计基线：`main` commit `00d79a6dba10fe5df99d6dcc03b50e42b5d162ae`（2026-10-02）。
依据：五份 Wrangler 配置、根/模块 package scripts、`scripts/prepare-assets.mjs`、`scripts/check.mjs`、全部现有测试及模块说明。
这里只提出建议，没有读取或修改 Dashboard 实时设置；历史文档称五项 Git Builds 连接 main，不能据此确认它们当前的全部构建命令、根目录和 include/exclude 规则。

## 共享路径集合

以下路径均相对于仓库根。最终 include 列表取集合并集，去掉重复项；`S`、`V` 是本文缩写，不是可直接粘贴的 Cloudflare pattern。

**S：共享安装、资产准备和测试入口，建议五项均包含：**

```text
package.json
package-lock.json
scripts/**
tests/**
brand/**
site/public/style.css
```

- 根 `npm ci` 会执行 `prepare`：从 brand 复制四站与 Agent 图标，从 site/public/style.css 复制 AI 样式，从根依赖 fflate 复制 OPS vendor，并打包 Agent 到 site/public/downloads。
- 所以根依赖/锁文件、脚本、品牌与共享样式影响安装或产物，不能只监视单个模块目录。
- `scripts/**` 包含当前不参与正常构建的运维/品牌生成工具；这里是便于长期维护的保守覆盖，不宣称每个脚本都会执行。

**V：若该服务使用完整 `npm test && npm run check`，还须包含：**

```text
api/**
ota/**
ops/**
agent/**
site/wrangler.jsonc
ai/wrangler.jsonc
```

- 测试导入 API、Agent、OPS 模型和 OTA 诊断/UI，内存 SQLite 读取 api/migrations；注册、取消、采集、展示及品牌绑定测试有跨模块依赖。
- check 遍历 api/src、ota/src、ota/public、ops/public、agent、scripts；检查 OTA/Site/OPS/AI 配置不持有 D1，校验 Agent manifest 及其引用文件。
- `tests/poai.test.js` 读取全部五份 Wrangler 配置。因此单独更改 API/Agent/OTA/OPS 或某个 Wrangler 配置，也可能改变其他服务的全仓验证结果。
- V 触发其他服务构建是共享验证的实际耦合，并不表示它们的运行时代码互相导入。不通过缩窄路径、跳过测试来掩盖这种耦合。

用户最近提供的 Cloudflare 构建命令为 `npm ci && npm test && npm run check`；以下采用保守的 **S + V + 服务目录** 推荐。对尚未逐项确认的构建设置，这是一套建议，不是对 Dashboard 当前状态的断言。

## 服务审计表

| 服务 | 当前发布入口/产物 | 建议 include（集合并集） | 主要依赖说明 |
|---|---|---|---|
| `poai-site` | `site/wrangler.jsonc` → `site/public/` | S + V + `site/**` | 包含 React 源码、homepage-assets、Vite 配置、site/package.json 和独立锁文件、已提交 public 及下载包；Agent/brand 经 prepare 影响下载和图标 |
| `poai-api` | `api/wrangler.jsonc` → `api/src/index.js` | S + V + `api/**` | API 源码、配置和迁移；Agent/OTA/OPS 及所有测试参与完整验证。监视迁移不代表授权自动执行生产迁移 |
| `poai-ota` | `ota/wrangler.jsonc` → `ota/src/index.js`、`ota/public/` | S + V + `ota/**` | 静态 UI 与代理 Worker；API Service Binding 和接口契约；共享品牌及跨模块验证 |
| `poai-ops` | `ops/wrangler.jsonc` → `ops/public/` | S + V + `ops/**` | 本地经营分析/XLSX、静态资源；根 fflate 依赖和 prepare 生成的 vendor；共享品牌及完整验证 |
| `poai-ai` | `ai/wrangler.jsonc` → `ai/public/` | S + V + `ai/**` | 静态入口、品牌和从 site/public/style.css 复制的样式；共享验证，无模型部署服务 |
| Agent（非独立 Worker） | Chrome MV3；ZIP 位于 `site/public/downloads/` | 包含在 Site 的 `agent/**`、`brand/**`、`scripts/**`、`site/**` 依赖中 | 无单独 Cloudflare build target；不要另建不存在的 Agent Worker |

在当前仓库配置与部署脚本中未发现第六个 Cloudflare 服务。历史归档域名、隧道及 Analytics 数据集不是新的代码部署目标；账户全部资源是否仍存在不属于本次仓库审计结论。

## Dashboard 人工核对建议

1. 在五个实际 Git Integration 项目核对仓库为 sanocc/poai、生产分支为 main，以及工作目录、安装/构建/部署命令。保留已配置的正式 Wrangler 部署命令；Codex 不直接执行它。
2. 按实际从仓库根解析的规则展开 S、V 和对应服务目录。核对 Cloudflare 支持的 glob 语义及现有 exclude；exclude 不能把测试、共享代码或锁文件重新排除。若构建 root 指向子目录，先核对其路径匹配规则，不猜测相对路径含义。
3. 主站必须继续同步提交 Vite 产物；只监视 src 而没有更新 public，仍会发布旧页面。独立 site/package-lock.json 当前只影响 Site 前端构建，不因根 npm ci 而成为其他服务的依赖。
4. 纯 `AGENTS.md`、README、docs、设计/验收记录变化目前不参与构建测试，无需为了文档更新触发生产构建。文档放在被包含的模块目录时可能保守触发；仅在确认不排除真实输入后再考虑文档 exclude，不在本任务直接修改。
5. 合并影响对应路径的真实变更后，核对实际触发的服务、构建 SHA、检查结果及部署结果。不能用本地通过代替 Cloudflare Build PASS，也不能据 Watch Paths 建议声称配置已经生效。

如果未来将验证拆成真正独立的 GitHub CI，可以另行评估更窄的服务监视集；本次不修改任何构建命令、不删减检查、不调整生产资源。
