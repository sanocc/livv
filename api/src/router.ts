import type { AppContext } from "./env";
import { authenticateDevice, requireAuthorizedDevice } from "./deviceAuth";
import { authorizeDevice, getDevice, heartbeat, listDevices, register, revokeDevice } from "./deviceService";
import { claimTask, createBatch, failTask, updateProgress } from "./taskService";
import { requireRole } from "./rbac";
import { envelope, HttpError, json } from "./response";
import { parseHeartbeat, parseRegistration } from "./validation";
import { parseBatch, parseFailure, parseProgress } from "./taskValidation";

const healthBody = { ok: true, service: "livv-api-v2" } as const;

export async function route(context: AppContext): Promise<Response> {
  const url = new URL(context.request.url);

  if (context.request.method === "GET" &&
      (url.pathname === "/health" || url.pathname === "/api/v1/health")) {
    return json(healthBody);
  }

  if (context.request.method === "POST" && url.pathname === "/api/v1/collector/register") {
    const result = await register(context.env, await parseRegistration(context.request));
    return envelope({ device: result.device, ...(result.credential ? { credential: result.credential } : {}) }, context.requestId, result.created ? 201 : 200);
  }

  if (context.request.method === "GET" && url.pathname === "/api/v1/collector/device") {
    const device = await authenticateDevice(context.request, context.env);
    return envelope({ device }, context.requestId);
  }

  if (context.request.method === "POST" && url.pathname === "/api/v1/collector/heartbeat") {
    const device = await authenticateDevice(context.request, context.env);
    const updated = await heartbeat(context.env, device.device_id, await parseHeartbeat(context.request));
    return envelope({ device: updated }, context.requestId);
  }

  if (context.request.method === "POST" && url.pathname === "/api/v1/collector/tasks/claim") {
    const authenticated = await authenticateDevice(context.request, context.env);
    requireAuthorizedDevice(authenticated);
    const task = await claimTask(context.env, authenticated.device_id);
    return task ? envelope({ task }, context.requestId) : new Response(null, { status: 204 });
  }

  const taskAction = url.pathname.match(/^\/api\/v1\/collector\/tasks\/([^/]+)\/(fail|progress)$/);
  if (taskAction && context.request.method === "POST") {
    const authenticated = await authenticateDevice(context.request, context.env);
    requireAuthorizedDevice(authenticated);
    const taskId = decodeURIComponent(taskAction[1]);
    if (taskAction[2] === "fail") {
      const input = await parseFailure(context.request);
      await failTask(context.env, taskId, authenticated.device_id, input.attempt_id, input.failure_code);
      return envelope({ accepted: true }, context.requestId);
    }
    const input = await parseProgress(context.request);
    await updateProgress(context.env, taskId, authenticated.device_id, input.attempt_id, input);
    return envelope({ accepted: true }, context.requestId);
  }

  if (context.request.method === "POST" && url.pathname === "/api/v1/batches") {
    requireRole(context.accessIdentity, "manager");
    const result = await createBatch(context.env, await parseBatch(context.request));
    return envelope({ batch: result.batch, tasks: result.tasks }, context.requestId, 201);
  }

  const deviceMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)(?:\/(authorize|revoke))?$/);
  if (url.pathname === "/api/v1/devices" && context.request.method === "GET") {
    requireRole(context.accessIdentity, "viewer");
    return envelope({ devices: await listDevices(context.env) }, context.requestId);
  }
  if (deviceMatch) {
    const deviceId = decodeURIComponent(deviceMatch[1]);
    const action = deviceMatch[2];
    if (context.request.method === "GET" && !action) {
      requireRole(context.accessIdentity, "viewer");
      return envelope({ device: await getDevice(context.env, deviceId) }, context.requestId);
    }
    const identity = requireRole(context.accessIdentity, "admin");
    if (context.request.method === "POST" && action === "authorize") {
      return envelope({ device: await authorizeDevice(context.env, deviceId, identity) }, context.requestId);
    }
    if (context.request.method === "POST" && action === "revoke") {
      return envelope({ device: await revokeDevice(context.env, deviceId, identity) }, context.requestId);
    }
  }

  throw new HttpError(404, "NOT_FOUND", "Route not found");
}
