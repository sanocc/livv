# POAI 六屏展示主站

顺序：品牌首屏 → AI → OTA → OPS → DATA → AGENT。正式 PNG Logo 仅放在导航与页尾，首屏不重复，不显示登录。桌面滚动吸附，手机内容可延伸，支持减少动态效果。

源码在 src/，品牌和 WebP 光影素材在 homepage-assets/，生产文件在 public/。运行 npm ci 和 npm run build:web 更新 public/；运行 npm run dev 本地预览。public/style.css 保留供既有 AI 页面准备脚本使用。下载包保留现有路径。

仓库当前 Git Builds 从 main 部署已提交的 public/，因此源码修改后须先构建再提交。Cloudflare 路由和 Worker 配置沿用 wrangler.jsonc。
