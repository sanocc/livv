import { nowISO, validText } from '../utils/request.ts';
import { APPROVED_STATUS } from '../types/index.ts';

function publicDevice(device) {
  if (!device) return null;
  return {
    device_id: device.device_id, device_name: device.device_name, status: device.status,
    extension_version: device.extension_version, platform: device.platform, browser: device.browser,
    os: device.os, created_at: device.created_at, approved_at: device.approved_at, last_seen_at: device.last_seen_at
  };
}

export function createDeviceService(repository) {
  return {
    async register(input) {
      const required = ['device_id', 'device_secret_verifier', 'extension_version', 'platform', 'browser', 'os'];
      if (!input || required.some((field) => !validText(input[field], 300))) return { ok: false, code: 'INVALID_REQUEST', message: 'Required device registration fields are missing' };
      const existing = await repository.find(input.device_id.trim());
      if (existing) {
        if (existing.device_secret_hash !== input.device_secret_verifier.trim()) return { ok: false, code: 'DEVICE_CREDENTIAL_CONFLICT', message: 'Device credentials do not match the existing device' };
        return { ok: true, device: publicDevice(existing), idempotent: true };
      }
      const device = await repository.insert({
        device_id: input.device_id.trim(), device_name: validText(input.device_name, 200),
        device_secret_hash: input.device_secret_verifier.trim(), extension_version: input.extension_version.trim(),
        platform: input.platform.trim(), browser: input.browser.trim(), os: input.os.trim(), created_at: nowISO()
      });
      return { ok: true, device: publicDevice(device), idempotent: false };
    },
    publicDevice,
    isApproved(device) { return device?.status === APPROVED_STATUS; },
    async heartbeat(device, input) {
      const version = validText(input?.extension_version, 100);
      if (!version) return { ok: false, code: 'INVALID_REQUEST', message: 'extension_version is required' };
      const updated = await repository.updateHeartbeat(device.device_id, version, nowISO());
      return { ok: true, device: publicDevice(updated) };
    }
  };
}
