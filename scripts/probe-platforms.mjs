// Anonymous public-page evidence only; no login, CAPTCHA actions, stealth or API replay.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { platformCatalog } from "../platforms/catalog.js";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.POAI_PLAYWRIGHT_MODULE || "playwright",
);
const directory = process.argv[2] || "/tmp/poai-platform-probes";
fs.mkdirSync(directory, { recursive: true });
const suppliedProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const proxyUrl = suppliedProxy ? new URL(suppliedProxy) : null;
const browser = await chromium.launch({
  executablePath: process.env.POAI_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
  args: ["--no-sandbox"],
  ...(proxyUrl
    ? {
        proxy: {
          server: proxyUrl.origin,
          ...(proxyUrl.username
            ? {
                username: decodeURIComponent(proxyUrl.username),
                password: decodeURIComponent(proxyUrl.password),
              }
            : {}),
        },
      }
    : {}),
});
const results = [];
try {
  for (const p of platformCatalog()) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const origins = new Set();
    page.on("request", (r) => {
      try {
        origins.add(new URL(r.url()).origin);
      } catch {}
    });
    const result = {
      platform: p.id,
      requested_url: p.public_page,
      attempted_at: new Date().toISOString(),
      status: "UNVERIFIED",
      authenticated: false,
      observed_hotels: null,
    };
    try {
      const response = await page.goto(p.public_page, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      result.http_status = response?.status() ?? null;
      result.final_origin = new URL(page.url()).origin;
      result.title = (await page.title()).slice(0, 150);
      const visible = (
        await page.locator("body").innerText({ timeout: 3000 })
      ).slice(0, 20000);
      result.captcha_or_verification_prompt =
        /验证码|人机验证|安全验证|CAPTCHA/i.test(visible);
      result.login_prompt = /扫码登录|短信登录|手机号登录/.test(visible);
      result.status = response?.ok()
        ? "PAGE_REACHED_DATA_NOT_VERIFIED"
        : "HTTP_BLOCKED";
      if (result.captcha_or_verification_prompt)
        result.status = "VERIFICATION_BLOCKED";
      await page.screenshot({
        path: path.join(directory, `${p.id}.png`),
        fullPage: false,
      });
    } catch (error) {
      result.status = "NETWORK_BLOCKED";
      result.error_code =
        String(error.message).match(/net::[A-Z_]+/)?.[0] ||
        (error.name === "TimeoutError"
          ? "NAVIGATION_TIMEOUT"
          : "NAVIGATION_FAILED");
    }
    result.request_origins = [...origins];
    results.push(result);
    await page.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(
  path.join(directory, "results.json"),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
