import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import api from "../api/src/index.js";
import ota from "../ota/src/index.js";
import { database } from "./db-adapter.js";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.POAI_PLAYWRIGHT_MODULE || "playwright",
);
const DB = database();
const assets = fileURLToPath(new URL("../ota/public/", import.meta.url));
const screenshotDirectory = "/tmp/poai-platform-browser";
fs.mkdirSync(screenshotDirectory, { recursive: true });
const before = DB.raw.prepare("SELECT total_changes() n").get().n;
const methods = [];
const env = {
  ENVIRONMENT: "local",
  LOCAL_ADMIN_TOKEN: "isolated-platform-browser",
  API: {
    fetch: async (r) => {
      methods.push(r.method);
      return api.fetch(r, {
        DB,
        ENVIRONMENT: "local",
        LOCAL_ADMIN_TOKEN: "isolated-platform-browser",
      });
    },
  },
  ASSETS: {
    fetch: async (r) => {
      const pathname = new URL(r.url).pathname;
      const file = path.resolve(
        assets,
        pathname === "/" ? "index.html" : pathname.slice(1),
      );
      if (!file.startsWith(assets) || !fs.existsSync(file))
        return new Response("Not found", { status: 404 });
      return new Response(fs.readFileSync(file), {
        headers: {
          "Content-Type":
            {
              ".js": "text/javascript",
              ".css": "text/css",
              ".html": "text/html",
              ".png": "image/png",
              ".ico": "image/x-icon",
            }[path.extname(file)] || "application/octet-stream",
        },
      });
    },
  },
};
const server = http.createServer(async (req, res) => {
  try {
    const r = await ota.fetch(
      new Request("http://127.0.0.1" + req.url, { method: req.method }),
      env,
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.POAI_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["small-mobile", 320, 740],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator(".hotel-section").waitFor();
    await page.getByRole("button", { name: "平台能力", exact: true }).click();
    await page.locator(".platform-table").waitFor();
    assert.equal(await page.locator("tr[data-platform]").count(), 4);
    assert.equal(await page.locator("#title").innerText(), "平台能力");
    assert.match(
      await page.locator('tr[data-platform="ctrip"]').innerText(),
      /保留现有生产采集/,
    );
    for (const platform of ["meituan", "fliggy", "tongcheng"]) {
      const row = page.locator(`tr[data-platform="${platform}"]`);
      assert.match(await row.innerText(), /未开启生产任务/);
      assert.match(await row.innerText(), /未取得真实数据/);
    }
    assert.match(
      await page.locator('tr[data-platform="fliggy"]').innerText(),
      /零配置/,
    );
    assert.match(
      await page.locator('tr[data-platform="tongcheng"]').innerText(),
      /tongcheng \/ elong/,
    );
    assert.equal(await page.locator("#error").innerText(), "");
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8)
        .map((e) => e.className),
    }));
    assert.ok(
      layout.scroll <= width,
      `${name}: root overflow ${JSON.stringify(layout)}`,
    );
    await page.screenshot({
      path: `${screenshotDirectory}/${name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await page.locator(".platform-table").waitFor();
    // Return to both existing market modes, ensuring no live query/task side effect.
    await page.getByRole("button", { name: "市场", exact: true }).click();
    await page.locator(".hotel-section").waitFor();
    await page
      .getByRole("button", { name: "日内价格轨迹", exact: true })
      .click();
    await page.locator(".intraday-page").waitFor();
    await page.getByRole("button", { name: "平台能力", exact: true }).click();
    await page.locator(".platform-table").waitFor();
    await page
      .getByRole("button", { name: "未来市场", exact: true })
      .count()
      .then((n) => assert.equal(n, 0));
    assert.deepEqual(errors, []);
    console.log(
      `${name} ${width}px: platform capabilities, navigation, unknown states, no overflow/errors PASS (isolated API/D1)`,
    );
    await page.close();
  }
  assert.ok(methods.every((m) => m === "GET"));
  assert.equal(DB.raw.prepare("SELECT total_changes() n").get().n, before);
  console.log(
    "All browser requests read-only; D1 writes: 0; live OTA verification NOT performed by this test.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  DB.raw.close();
}
