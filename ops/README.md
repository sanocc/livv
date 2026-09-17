# ops.livv.cc

酒店经营后台：上传 Excel → 解析字段 → 看板展示。

## 本地打开

直接打开 `index.html`，或：

```bash
npx wrangler pages dev .
```

## 部署到 Cloudflare Pages

1. 把 `ops/` 目录作为 Pages 项目根目录
2. 自定义域绑 `ops.livv.cc`
3. 建议用 Cloudflare Access 保护整个站

## 接 api.livv.cc（可选）

浏览器控制台执行一次：

```js
localStorage.setItem("livv_api", "https://api.livv.cc");
localStorage.setItem("livv_token", "你的OPS_TOKEN");
```

导入时会额外 POST `/v1/daily`。未配置则只存在本机 localStorage。

## Excel

使用仓库内 `../excel/LIVV_日营业上传模板.xlsx`。
工作表名含「日营业」或「渠道」会被自动选中。
