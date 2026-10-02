// Read only platform metadata. No account, cookies, personal hardware IDs or page DOM.
async function boundedProbe(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({}), 1500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function collectEnvironment(runtime, nav, sidePanel) {
  let platform = {},
    hints = {};
  try {
    platform = await boundedProbe(runtime.getPlatformInfo());
  } catch {}
  try {
    if (nav.userAgentData?.getHighEntropyValues)
      hints = await boundedProbe(
        nav.userAgentData.getHighEntropyValues([
          "platformVersion",
          "architecture",
          "bitness",
          "fullVersionList",
        ]),
      );
  } catch {}
  const os =
    { win: "Windows", mac: "macOS", linux: "Linux" }[platform.os] ?? null;
  const pv = /^\d+(?:\.\d+){0,3}$/.test(hints.platformVersion ?? "")
    ? hints.platformVersion
    : null;
  // Microsoft's documented UA-CH mapping: 13+ is Windows 11 or later; not a Windows build number.
  const osVersion =
    os === "Windows"
      ? pv && Number(pv.split(".")[0]) >= 13
        ? "11+"
        : pv && Number(pv.split(".")[0]) >= 1 && Number(pv.split(".")[0]) <= 10
          ? "10"
          : null
      : os === "macOS"
        ? pv
        : null;
  const brands = hints.fullVersionList ?? nav.userAgentData?.brands ?? [];
  const brand =
    brands.find((x) => x.brand === "Microsoft Edge") ??
    brands.find((x) => x.brand === "Google Chrome");
  const major = brand
    ? Number(brand.version.split(".")[0])
    : Number(nav.userAgent?.match(/(?:Edg|Chrome)\/(\d+)/)?.[1]) || null;
  const architecture =
    hints.architecture === "arm" && hints.bitness === "64"
      ? "arm64"
      : hints.architecture === "x86" && hints.bitness === "64"
        ? "x64"
        : ({ "x86-64": "x64", x86: "x86", arm: "arm", arm64: "arm64" }[
            platform.arch
          ] ?? null);
  return {
    os,
    os_version: osVersion,
    platform_version: pv,
    os_version_source: osVersion ? "client_hints" : null,
    architecture,
    browser_name:
      brand?.brand === "Microsoft Edge"
        ? "Edge"
        : brand?.brand === "Google Chrome"
          ? "Chrome"
          : /Chrome\//.test(nav.userAgent ?? "")
            ? "Chromium"
            : null,
    browser_version:
      (hints.fullVersionList ?? []).find((x) => x.brand === brand?.brand)
        ?.version ?? null,
    browser_major_version: major,
    browser_language: nav.language ?? null,
    manifest_version: runtime.getManifest().manifest_version,
    environment: "production",
    api_endpoint: "https://api.poai.cc",
    capabilities: {
      fast_navigation: true,
      market_list: true,
      detail_collection: true,
      debugger_input: !!runtime,
      side_panel: !!sidePanel,
      cloud_telemetry: true,
      mobile_view: true,
      ctrip: true,
    },
  };
}
export function environmentReporter({
  chrome,
  navigator,
  send,
  now = Date.now,
}) {
  let active = false,
    nextRetry = 0,
    cache = null,
    acknowledged = null,
    lastProbe = 0;
  let dynamic = {
    debugger_permission: null,
    side_panel: !!chrome.sidePanel?.setPanelBehavior,
    managed_tab: null,
    ctrip_page_status: "unknown",
    ctrip_login_status: "unknown",
  };
  async function refresh(state) {
    if (active || now() < nextRetry) return;
    active = true;
    try {
      const permission = await chrome.permissions.contains({
        permissions: ["debugger"],
      });
      let tab = null;
      try {
        if (state.active?.tab_id ?? state.managed_tab)
          tab = await chrome.tabs.get(
            state.active?.tab_id ?? state.managed_tab,
          );
      } catch {}
      let validPage = false;
      try {
        const url = new URL(tab?.url);
        validPage =
          url.origin === "https://m.ctrip.com" &&
          url.pathname.startsWith("/webapp/hotels");
      } catch {}
      dynamic = {
        debugger_permission: permission,
        side_panel: !!chrome.sidePanel?.setPanelBehavior,
        managed_tab: !!tab,
        ctrip_page_status: !tab
          ? "not_open"
          : validPage
            ? "normal"
            : "abnormal",
        ctrip_login_status: "unknown",
      };
      if (!cache || now() - lastProbe >= 300000) {
        cache = await collectEnvironment(
          chrome.runtime,
          navigator,
          chrome.sidePanel?.setPanelBehavior,
        );
        lastProbe = now();
      }
      if (["approved", "pending"].includes(state.cloud?.status)) {
        const fingerprint = JSON.stringify(cache);
        if (acknowledged !== fingerprint) {
          await send(cache);
          acknowledged = fingerprint;
        }
      }
    } catch {
      nextRetry = now() + 300000;
    } finally {
      active = false;
    }
  }
  function snapshot(state) {
    return {
      ...dynamic,
      auto: typeof state.auto === "boolean" ? state.auto : null,
      task_id: state.active?.task.id ?? null,
      attempt_id: state.active?.attempt.id ?? null,
      phase: state.active?.upload ? "UPLOAD" : (state.active?.phase ?? null),
      platform: state.active?.task.platform ?? null,
    };
  }
  return { refresh, snapshot };
}
