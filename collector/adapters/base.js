/**
 * LIVV OTA Adapter Contract
 *
 * 每个平台必须实现：
 *
 * match(location)
 * collect()
 *
 * Adapter 不上传、不访问 D1、不负责设备授权。
 */

export function createAdapter(definition) {
  if (!definition?.platform) {
    throw new Error("Adapter platform is required");
  }

  if (typeof definition.match !== "function") {
    throw new Error(
      `${definition.platform}: match() is required`
    );
  }

  if (typeof definition.collect !== "function") {
    throw new Error(
      `${definition.platform}: collect() is required`
    );
  }

  return Object.freeze(definition);
}
