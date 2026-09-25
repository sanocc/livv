import { nowISO } from '../utils/request.ts';

export function createAdminService(repository) {
  return {
    async listDevices() { return repository.listPublic(); },
    async changeStatus(deviceId, targetStatus) {
      const device = await repository.find(deviceId);
      if (!device) return { ok: false, code: 'DEVICE_NOT_FOUND', message: 'Device was not found' };
      if (device.status === 'revoked' && targetStatus !== 'revoked') return { ok: false, code: 'DEVICE_REVOKED', message: 'Revoked device is terminal' };
      if (targetStatus === 'approved' && device.status === 'revoked') return { ok: false, code: 'DEVICE_REVOKED', message: 'Revoked device cannot be approved' };
      if (targetStatus === 'approved' && device.status === 'disabled') return { ok: false, code: 'DEVICE_DISABLED', message: 'Disabled device cannot be approved' };
      const updated = device.status === targetStatus ? device : await repository.setStatus(deviceId, targetStatus, nowISO());
      return { ok: true, device: updated, idempotent: device.status === targetStatus };
    }
  };
}
