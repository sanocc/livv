import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import api from "../api/src/index.js";
import ota from "../ota/src/index.js";
import {
  harness,
  input,
  device,
  claimStart,
  complete,
} from "./acceptance-support.js";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.POAI_PLAYWRIGHT_MODULE || "playwright",
);
// Cloudflare accepts streamed Request bodies without Node's duplex hint.
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
  constructor(url, init) {
    super(url, { ...init, ...(init?.body ? { duplex: "half" } : {}) });
  }
};
const h = harness(),
  DB = h.DB;
const mac = await device(h),
  win = await device(h, "Windows");
const assets = fileURLToPath(new URL("../ota/public/", import.meta.url));
const screenshotDirectory = "/tmp/poai-acceptance-browser";
fs.mkdirSync(screenshotDirectory, { recursive: true });
const methods = [];
const env = {
  ENVIRONMENT: "local",
  LOCAL_ADMIN_TOKEN: "isolated-acceptance-test",
  API: {
    fetch: async (r) => {
      methods.push(r.method);
      return api.fetch(r, {
        DB,
        ENVIRONMENT: "local",
        LOCAL_ADMIN_TOKEN: "isolated-acceptance-test",
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
      new Request("http://127.0.0.1" + req.url, {
        method: req.method,
        headers: req.headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : {
              body: Buffer.concat(await Array.fromAsync(req)),
              duplex: "half",
            }),
      }),
      env,
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(8788, "::1", resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.POAI_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox", "--host-resolver-rules=MAP localhost [::1]"],
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
    await page.goto(`http://localhost:${server.address().port}`);
    await page.locator(".hotel-section").waitFor();
    await page.getByRole("button", { name: "平台能力", exact: true }).click();
    await page.locator(".platform-table").waitFor();
    await page.locator("#acceptance-form").waitFor();
    const os = name === "mobile" ? "Windows" : "macOS",
      d = os === "Windows" ? win : mac;
    const values = input(os);
    await page.locator('[name="os"]').selectOption(os);
    for (const key of ["city", "keyword", "checkin", "checkout"])
      await page.locator(`#acceptance-form [name="${key}"]`).fill(values[key]);
    const previous = DB.raw.prepare("SELECT count(*) n FROM tasks").get().n;
    await page
      .getByRole("button", { name: "创建携程真机验收", exact: true })
      .click();
    try {
      await page
        .locator('[data-acceptance-status="AWAITING_REAL_AGENT"]')
        .waitFor({ timeout: 5000 });
    } catch (e) {
      console.error({
        url: page.url(),
        error: await page.locator("#acceptance-error").innerText(),
        errors,
        methods,
        tasks: DB.raw.prepare("SELECT id,status FROM tasks").all(),
      });
      throw e;
    }
    assert.equal(
      DB.raw.prepare("SELECT count(*) n FROM tasks").get().n,
      previous + 1,
    );
    const task = DB.raw
      .prepare("SELECT * FROM tasks WHERE status='PENDING'")
      .get();
    const attempt = await claimStart(h, d, task);
    if (name === "small-mobile") {
      await h.call(
        `/v1/device/attempts/${attempt.id}/fail`,
        "POST",
        { error_code: "CAPTCHA_REQUIRED", error_message: "private-cookie" },
        d.headers,
      );
      await page.locator('[data-acceptance-status="BLOCKED"]').waitFor();
      assert.match(
        await page.locator('[data-acceptance-status="BLOCKED"]').innerText(),
        /验证码/,
      );
    } else {
      await complete(h, d, task, attempt);
      await page
        .locator('[data-acceptance-status="SIMULATED_PASS"]')
        .first()
        .waitFor();
      const card = page
        .locator('[data-acceptance-status="SIMULATED_PASS"]')
        .filter({ hasText: task.id });
      await card.waitFor();
      assert.match(await card.innerText(), /隔离模拟通过 · 非真机/);
      assert.match(await card.innerText(), /¥0/);
      assert.match(await card.innerText(), /缺失/);
      assert.match(await card.innerText(), /1.3.6/);
      await card.locator("summary").click();
      assert.match(await card.innerText(), /LIST_READY/);
      assert.match(await card.innerText(), /MARKET_LOCKED/);
      assert.ok(!(await card.innerText()).includes("do-not-export"));
      await page
        .getByRole("button", { name: "创建携程真机验收", exact: true })
        .click();
      await page.waitForFunction(
        () => !document.querySelector("#acceptance-form button").disabled,
      );
      assert.equal(
        DB.raw.prepare("SELECT count(*) n FROM tasks").get().n,
        previous + 1,
      );
    }
    assert.equal(
      await page.locator('[data-acceptance-status="VERIFIED"]').count(),
      0,
    );
    assert.equal(await page.locator("#acceptance-error").innerText(), "");
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
    await page.getByRole("button", { name: "市场", exact: true }).click();
    await page.locator(".hotel-section").waitFor();
    assert.deepEqual(errors, []);
    console.log(
      `${name} ${width}px: create/claim/start/upload/report, ${os}, local simulation or blocker, zero/null, idempotency, navigation, no overflow/errors PASS (NOT real OTA verification)`,
    );
    await page.close();
  }
  assert.ok(methods.includes("POST"));
  assert.equal(DB.raw.prepare("SELECT count(*) n FROM tasks").get().n, 3);
  assert.equal(DB.raw.prepare("SELECT count(*) n FROM snapshots").get().n, 2);
  assert.equal(
    DB.raw
      .prepare("SELECT count(*) n FROM devices WHERE status='approved'")
      .get().n,
    2,
  );
  console.log(
    "Only isolated DB exercised. No production task or live OTA page was accessed.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  DB.raw.close();
  globalThis.Request = NativeRequest;
}
