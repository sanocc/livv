import { assertNoUnknownKeys, optionalString, requiredString } from "./common";

export interface RegisterDeviceInput {
  deviceId: string;
  name?: string;
  collectorVersion: string;
  protocolVersion: string;
  os: string;
  arch: string;
  browser: string;
  browserVersion: string;
}

export function parseRegisterDevice(body: Record<string, unknown>): RegisterDeviceInput {
  assertNoUnknownKeys(body, [
    "device_id",
    "name",
    "collector_version",
    "protocol_version",
    "os",
    "arch",
    "browser",
    "browser_version"
  ]);

  const name = optionalString(body, "name", { max: 120 });
  return {
    deviceId: requiredString(body, "device_id", { max: 128 }),
    ...(name ? { name } : {}),
    collectorVersion: requiredString(body, "collector_version", { max: 64 }),
    protocolVersion: requiredString(body, "protocol_version", { max: 64 }),
    os: requiredString(body, "os", { max: 64 }),
    arch: requiredString(body, "arch", { max: 64 }),
    browser: requiredString(body, "browser", { max: 64 }),
    browserVersion: requiredString(body, "browser_version", { max: 64 })
  };
}
