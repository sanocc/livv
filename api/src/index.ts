import { createDeviceRepository } from './repositories/devices.ts';
import { verifyDeviceRequest } from './auth/device.ts';
import { createDeviceService } from './services/devices.ts';
import { createAdminService } from './services/admin.ts';
import { authorizeAdmin, verifyAccessJwt } from './auth/access.ts';
import { jsonError, jsonOk } from './types/index.ts';
import { readJson } from './utils/request.ts';

const VERSION = '0.1.0-local';

function routeError(error) {
  console.error('[livv-api]', error);
  return jsonError('INTERNAL_ERROR', 'Internal server error', 500);
}

async function authenticatedAdmin(request, env, accessVerifier) {
  const authentication = await accessVerifier(request, env);
  if (!authentication.ok) return { response: jsonError(authentication.code, authentication.message, authentication.status) };
  const authorization = authorizeAdmin(authentication.claims, env);
  if (!authorization.ok) return { response: jsonError(authorization.code, authorization.message, authorization.status) };
  return { claims: authentication.claims, email: authorization.email };
}

async function authenticatedDevice(request, env, body, { allowInactive = false } = {}) {
  const deviceId = request.headers.get('X-LIVV-Device-ID');
  if (!deviceId) return { response: jsonError('INVALID_DEVICE_SIGNATURE', 'X-LIVV-Device-ID is required', 401) };
  const repository = createDeviceRepository(env.DB);
  const device = await repository.find(deviceId);
  if (!device) return { response: jsonError('DEVICE_NOT_FOUND', 'Device was not found', 404) };
  const verified = await verifyDeviceRequest(request, device, body, Date.now(), repository);
  if (!verified.ok) return { response: jsonError(verified.code, verified.message, verified.code === 'REQUEST_EXPIRED' ? 401 : 401) };
  if (!allowInactive && device.status === 'disabled') return { response: jsonError('DEVICE_DISABLED', 'Device is disabled', 403) };
  if (!allowInactive && device.status === 'revoked') return { response: jsonError('DEVICE_REVOKED', 'Device is revoked', 403) };
  return { device, repository };
}

export function createApp({ version = VERSION, accessVerifier = verifyAccessJwt } = {}) {
  return {
    async fetch(request, env = {}) {
      try {
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/health') return jsonOk({ ok: true, service: 'livv-api', version, database: Boolean(env.DB) });
        if (!env.DB) return jsonError('INTERNAL_ERROR', 'D1 database is not configured', 503);
        const repository = createDeviceRepository(env.DB);
        const service = createDeviceService(repository);
        const adminService = createAdminService(repository);
        if (request.method === 'POST' && url.pathname === '/v1/devices/register') {
          const result = await service.register(await readJson(request));
          return result.ok ? jsonOk({ device: result.device, idempotent: result.idempotent }) : jsonError(result.code, result.message, result.code === 'DEVICE_CREDENTIAL_CONFLICT' ? 409 : 400);
        }
        if (request.method === 'GET' && url.pathname === '/v1/devices/me') {
          const auth = await authenticatedDevice(request, env, '', { allowInactive: true });
          if (auth.response) return auth.response;
          return jsonOk({ device: service.publicDevice(auth.device) });
        }
        if (request.method === 'POST' && url.pathname === '/v1/devices/heartbeat') {
          const body = await readJson(request);
          const auth = await authenticatedDevice(request, env, JSON.stringify(body || {}));
          if (auth.response) return auth.response;
          if (auth.device.status !== 'approved') return jsonError('DEVICE_PENDING', 'Device is not approved for heartbeat', 403);
          const result = await service.heartbeat(auth.device, body);
          return result.ok ? jsonOk({ device: result.device }) : jsonError(result.code, result.message, 400);
        }
        if (url.pathname.startsWith('/v1/admin/devices')) {
          const admin = await authenticatedAdmin(request, env, accessVerifier);
          if (admin.response) return admin.response;
          if (request.method === 'GET' && url.pathname === '/v1/admin/devices') return jsonOk({ devices: await adminService.listDevices() });
          const match = url.pathname.match(/^\/v1\/admin\/devices\/([^/]+)\/(approve|disable|revoke)$/);
          if (request.method === 'POST' && match) {
            const targetStatus = { approve: 'approved', disable: 'disabled', revoke: 'revoked' }[match[2]];
            const result = await adminService.changeStatus(decodeURIComponent(match[1]), targetStatus);
            if (!result.ok) return jsonError(result.code, result.message, result.code === 'DEVICE_NOT_FOUND' ? 404 : 409);
            return jsonOk({ device: service.publicDevice(result.device), idempotent: result.idempotent });
          }
          return jsonError('INVALID_REQUEST', 'Route not found', 404);
        }
        return jsonError('INVALID_REQUEST', 'Route not found', 404);
      } catch (error) {
        return routeError(error);
      }
    }
  };
}

export default { fetch: (request, env, ctx) => createApp().fetch(request, env, ctx) };
