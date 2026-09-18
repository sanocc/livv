import { runAdapter } from "./engine.js";
import ctripAdapter from "../adapters/ctrip.js";
import meituanAdapter from "../adapters/meituan.js";
import fliggyAdapter from "../adapters/fliggy.js";

/**
 * LIVV Collector M04 Runtime
 *
 * 统一负责：
 *
 * 当前页面
 *   ↓
 * 匹配 OTA Adapter
 *   ↓
 * Adapter.collect()
 *   ↓
 * Quality Gate
 *   ↓
 * 标准 M04 result
 *
 * Runtime 不负责：
 * - 上传 API
 * - D1
 * - 设备授权
 * - Popup UI
 */

const adapters = [
  ctripAdapter,
  meituanAdapter,
  fliggyAdapter
];

function resolveAdapter() {
  for (const adapter of adapters) {
    try {
      if (adapter.match(location)) {
        return adapter;
      }
    } catch (error) {
      console.warn(
        "[酒店助手] Adapter match failed",
        adapter?.platform,
        error
      );
    }
  }

  return null;
}

export async function collectM04() {
  const adapter = resolveAdapter();

  if (!adapter) {
    throw new Error(
      "当前页面没有可用的 M04 Adapter"
    );
  }

  console.info(
    `[酒店助手] M04 Runtime → ${adapter.platform}`
  );

  return await runAdapter(adapter);
}

export function getM04RuntimeInfo() {
  return {
    version: "M04",
    adapters: adapters.map(
      (adapter) => adapter.platform
    ),
    current:
      resolveAdapter()?.platform || null
  };
}
