import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const http = require("node:http");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { fileURLToPath } = require("node:url");
const assetsRoot = fileURLToPath(new URL("../ota/public/", import.meta.url));
const screenshots =
  process.env.POAI_BROWSER_SCREENSHOTS || "/tmp/poai-price-history-browser";
fs.mkdirSync(screenshots, { recursive: true });
const { chromium } = require(
  process.env.POAI_PLAYWRIGHT_MODULE || "playwright",
);
(async () => {
  const api = (await import(new URL("../api/src/index.js", import.meta.url)))
    .default;
  const ota = (await import(new URL("../ota/src/index.js", import.meta.url)))
    .default;
  const { upload } = await import(
    new URL("../api/src/upload.js", import.meta.url)
  );
  const { database } = await import(
    new URL("./db-adapter.js", import.meta.url)
  );
  const DB = database();
  DB.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,created_at) VALUES('fixture-device','fixture','approved','2026-10-01')",
    )
    .run();
  DB.raw
    .prepare("INSERT INTO platforms VALUES('fixture-platform','隔离平台')")
    .run();
  let seq = 0;
  async function seed(time, prices, platform = "ctrip") {
    const id = `fixture-task-${++seq}`,
      a = `fixture-attempt-${seq}`,
      start = new Date(Date.parse(time) - 60000).toISOString(),
      end = new Date(Date.parse(time) + 3600000).toISOString();
    DB.raw
      .prepare(
        "INSERT INTO tasks(id,platform,city,keyword,checkin,checkout,scope,collection_limit,status,created_at,due_at,window_start,window_end,task_type) VALUES(?,?,'咸宁','中心花坛','2026-10-05','2026-10-06','top30',30,'RUNNING',?,?,?,?,'MARKET_LIST')",
      )
      .run(id, platform, start, start, start, end);
    DB.raw
      .prepare(
        "INSERT INTO attempts(id,task_id,attempt_number,device_id,claimed_at,started_at,timeout_at,lease_until,status) VALUES(?,?,1,'fixture-device',?,?,?,?,'RUNNING')",
      )
      .run(a, id, start, start, end, end);
    await upload(
      DB,
      { id: "fixture-device" },
      DB.raw.prepare("SELECT * FROM attempts WHERE id=?").get(a),
      {
        source: "ctrip-dom",
        platform,
        city: "咸宁",
        keyword: "中心花坛",
        checkin: "2026-10-05",
        checkout: "2026-10-06",
        observed_at: time,
        hotels: Object.entries(prices).map(([hotel_id, display_price], i) => ({
          hotel_id,
          hotel_name: `隔离竞品${String(hotel_id).padStart(2, "0")}`,
          rank: i + 1,
          is_ad: false,
          display_price,
          original_price: null,
        })),
        rooms: [],
        detail_results: [],
        exhausted: false,
        stop_reason: "TARGET_REACHED",
      },
      Date.parse(time) + 1000,
    );
  }
  const base = Object.fromEntries([
    ...Array.from({ length: 10 }, (_, i) => [String(i + 1), 100 + i * 10]),
    ["11", 0],
    ["12", 200],
  ]);
  await seed("2026-10-01T15:50:00Z", base);
  const times = [
    "2026-10-01T16:10:00Z",
    "2026-10-01T19:10:00Z",
    "2026-10-02T02:05:00Z",
    "2026-10-02T09:50:00Z",
    "2026-10-02T15:00:00Z",
  ];
  for (let i = 0; i < times.length; i++) {
    const p = {
      ...base,
      1: 100 + i * 10,
      2: 110 - i * 5,
      3: i === 1 ? null : 120 + i * 2,
    };
    if (i === 2) delete p["4"];
    await seed(times[i], p);
  }
  await seed("2026-10-01T16:10:00Z", { 1: 500 }, "fixture-platform");
  for (const id of Object.keys(base)) {
    DB.raw
      .prepare("INSERT INTO standard_hotels VALUES(?,?,?,?,?)")
      .run(
        `mapped-${id}`,
        id === "11" ? "隔离我的酒店" : `隔离竞品${id.padStart(2, "0")}`,
        id === "11" ? "mine" : "core",
        "2026-10-01",
        "2026-10-01",
      );
    DB.raw
      .prepare("INSERT INTO hotel_mappings VALUES('ctrip',?,?,?,?)")
      .run(id, `mapped-${id}`, "2026-10-01", "fixture");
  }
  DB.raw
    .prepare(
      "INSERT INTO tasks(id,platform,city,keyword,checkin,checkout,scope,collection_limit,status,created_at,due_at,window_start,window_end,error_code,task_type) VALUES('missing-task','ctrip','咸宁','中心花坛','2026-10-05','2026-10-06','top30',30,'FAILED','2026-10-02T06:00:00Z','2026-10-02T06:30:00Z','2026-10-02T06:00:00Z','2026-10-02T07:00:00Z','MAX_ATTEMPTS_REACHED','MARKET_LIST')",
    )
    .run();
  const initialChanges = DB.raw.prepare("SELECT total_changes() n").get().n;
  const methods = [];
  let slow = false;
  const apiEnv = {
    DB,
    ENVIRONMENT: "local",
    LOCAL_ADMIN_TOKEN: "isolated-browser-fixture",
  };
  const otaEnv = {
    ENVIRONMENT: "local",
    LOCAL_ADMIN_TOKEN: "isolated-browser-fixture",
    API: {
      fetch: async (r) => {
        methods.push(r.method);
        if (slow && new URL(r.url).pathname.endsWith("/price-history")) {
          const date = new URL(r.url).searchParams.get("observation_date");
          await new Promise((resolve) =>
            setTimeout(resolve, date === "2026-10-02" ? 180 : 15),
          );
        }
        return api.fetch(r, apiEnv);
      },
    },
    ASSETS: {
      fetch: async (r) => {
        const pathname = new URL(r.url).pathname;
        const file =
          assetsRoot + (pathname === "/" ? "index.html" : pathname.slice(1));
        if (!file.startsWith(assetsRoot) || !fs.existsSync(file))
          return new Response("not found", { status: 404 });
        const ext = file.split(".").pop();
        return new Response(fs.readFileSync(file), {
          headers: {
            "content-type":
              {
                js: "text/javascript",
                css: "text/css",
                html: "text/html",
                png: "image/png",
                ico: "image/x-icon",
              }[ext] || "application/octet-stream",
          },
        });
      },
    },
  };
  const server = http.createServer(async (req, res) => {
    try {
      const r = await ota.fetch(
        new Request("http://127.0.0.1:4181" + req.url, { method: req.method }),
        otaEnv,
      );
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: process.env.POAI_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
      ["small-mobile", 320, 740],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator(".hotel-section").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "未来市场", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page
        .getByRole("button", { name: "日内价格轨迹", exact: true })
        .click();
      await page.locator(".history-chart-card").waitFor();
      const field = (n) => page.locator(`.history-filters [name="${n}"]`);
      await field("checkin").fill("2026-10-05");
      await field("checkin").dispatchEvent("change");
      await field("checkout").fill("2026-10-06");
      await field("observation_date").fill("2026-10-02");
      await field("observation_date").dispatchEvent("change");
      await page.waitForFunction(
        () => document.querySelectorAll(".intraday-hit").length === 5,
      );
      assert.match(
        await page.locator(".history-summary").innerText(),
        /5 家竞品 \+ 我的酒店/,
      );
      assert.match(
        await page.locator(".history-gap-note").innerText(),
        /1 项任务尚未形成快照/,
      );
      assert.match(
        await page.locator(".history-mine").innerText(),
        /隔离我的酒店/,
      );
      for (const count of [3, 5, 10]) {
        await page
          .getByRole("button", { name: `${count} 家`, exact: true })
          .click();
        await page.waitForFunction(
          (n) =>
            document
              .querySelector(".history-summary")
              ?.innerText.startsWith(`${n} 家竞品`),
          count,
        );
        assert.equal(
          await page.locator(".history-hotel-options input:checked").count(),
          count,
        );
      }
      assert.ok(
        (await page.locator(".history-hotel-options input:disabled").count()) >
          0,
      );
      await page.getByRole("button", { name: "5 家", exact: true }).click();
      await page.waitForFunction(() =>
        document
          .querySelector(".history-summary")
          ?.innerText.startsWith("5 家竞品"),
      );
      const search = page.getByLabel("搜索酒店", { exact: true });
      await search.fill("隔离竞品02");
      assert.equal(
        await page.locator(".history-hotel-options label").count(),
        1,
      );
      await page.locator(".history-hotel-options input").uncheck();
      await page.waitForFunction(() =>
        document
          .querySelector(".history-summary")
          ?.innerText.startsWith("4 家竞品"),
      );
      await page.locator(".history-hotel-options input").check();
      await page.waitForFunction(() =>
        document
          .querySelector(".history-summary")
          ?.innerText.startsWith("5 家竞品"),
      );
      await search.fill("2");
      assert.ok(
        (await page.locator(".history-hotel-options").innerText()).includes(
          "02",
        ),
      );
      await search.clear();
      await page.locator(".intraday-hit").nth(3).hover();
      assert.match(
        await page.locator(".intraday-tooltip").innerText(),
        /17:50:00/,
      );
      await page.locator(".intraday-hit").nth(2).focus();
      await page.waitForTimeout(50);
      const tooltip = page.locator(".intraday-tooltip");
      assert.match(await tooltip.innerText(), /10:05:00/);
      assert.match(await tooltip.innerText(), /列表部分采集/);
      assert.match(await tooltip.innerText(), /Hotel ID: 1/);
      assert.match(await tooltip.innerText(), /本次未观察到该酒店/);
      assert.match(await tooltip.innerText(), /家涨价/);
      assert.match(await tooltip.innerText(), /基准 2026-10-02/);
      const b = await tooltip.boundingBox();
      assert.ok(
        b.x >= 0 &&
          b.x + b.width <= width + 1 &&
          b.y >= 0 &&
          b.y + b.height <= height + 1,
      );
      await page.screenshot({
        path: `${screenshots}/history-${name}-tooltip.png`,
        fullPage: false,
      });
      await page.locator(".intraday-hit").nth(2).press("ArrowRight");
      assert.equal(
        await page
          .locator(".intraday-hit")
          .nth(3)
          .evaluate((e) => e === document.activeElement),
        true,
      );
      await page.locator(".intraday-hit").nth(3).press("Escape");
      assert.equal(await tooltip.isVisible(), false);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `${screenshots}/history-${name}.png`,
        fullPage: true,
      });
      await field("observation_date").fill("2026-10-03");
      await field("observation_date").dispatchEvent("change");
      await page.locator(".intraday-empty").waitFor();
      assert.equal(await page.locator(".intraday-hit").count(), 0);
      assert.match(
        await page.locator(".history-latest").innerText(),
        /暂无符合口径/,
      );
      await field("observation_date").fill("2026-10-02");
      await field("observation_date").dispatchEvent("change");
      await field("platform").selectOption("fixture-platform");
      await page.waitForFunction(() =>
        document
          .querySelector(".history-summary")
          ?.innerText.includes("1 家竞品"),
      );
      assert.match(
        await page.locator(".history-mine").innerText(),
        /暂无唯一可靠/,
      );
      assert.equal(await page.locator(".intraday-hit").count(), 1);
      await field("platform").selectOption("ctrip");
      await page.waitForFunction(
        () => document.querySelectorAll(".intraday-hit").length === 5,
      );
      slow = true;
      await field("observation_date").fill("2026-10-02");
      await field("observation_date").dispatchEvent("change");
      await field("observation_date").fill("2026-10-03");
      await field("observation_date").dispatchEvent("change");
      await page.locator(".intraday-empty").waitFor();
      await page.waitForTimeout(250);
      assert.equal(await page.locator(".intraday-hit").count(), 0);
      slow = false;
      await page.getByRole("button", { name: "未来市场", exact: true }).click();
      await page.locator(".hotel-section").waitFor();
      assert.equal(await page.locator(".intraday-page").count(), 0);
      assert.deepEqual(errors, []);
      console.log(
        "PASS",
        name,
        "default future/3-5-10/search/selection/date/platform/gaps/tooltip/summary/keyboard/race/overflow/errors",
      );
      await page.close();
    }
    assert.ok(methods.every((m) => m === "GET"));
    assert.equal(
      DB.raw.prepare("SELECT total_changes() n").get().n,
      initialChanges,
    );
    console.log(
      "PASS real OTA Service Binding -> API -> in-memory SQLite integration, GET-only, no database mutations",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
