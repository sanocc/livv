// Acceptance is a purpose of existing MARKET_LIST tasks, never a second queue/type.
export const ACCEPTANCE_PREFIX = "acceptance:v1:";
export function acceptanceOS(task) {
  const match =
    /^acceptance:v1:(macOS|Windows):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.exec(
      task?.schedule_key ?? "",
    );
  return task?.plan_id == null &&
    task?.task_type === "MARKET_LIST" &&
    task?.preferred_device_id &&
    match
    ? match[1]
    : null;
}
export const isAcceptanceTask = (task) => acceptanceOS(task) !== null;
const json = (column) =>
  `CASE WHEN json_valid(${column}) THEN ${column} ELSE '{}' END`;
export function acceptanceDeviceSQL(alias) {
  const env = json(`${alias}.environment`),
    runtime = json(`${alias}.runtime`);
  return `json_extract(${env},'$.browser_name')='Chrome' AND json_extract(${env},'$.manifest_version')=3 AND json_extract(${env},'$.capabilities.ctrip')=1 AND json_extract(${env},'$.capabilities.market_list')=1 AND json_extract(${runtime},'$.auto')=1 AND json_extract(${runtime},'$.debugger_permission')=1`;
}
export const acceptanceClaimSQL = `EXISTS(SELECT 1 FROM devices v WHERE v.id=t.preferred_device_id AND ${acceptanceDeviceSQL("v")} AND json_extract(${json("v.environment")},'$.os')=CASE WHEN t.schedule_key LIKE 'acceptance:v1:macOS:%' THEN 'macOS' WHEN t.schedule_key LIKE 'acceptance:v1:Windows:%' THEN 'Windows' ELSE NULL END)`;
export function acceptanceStartEvidence(device) {
  let env = {};
  try {
    env = JSON.parse(device.environment ?? "{}");
  } catch {}
  return {
    approved_at_start: device.status === "approved",
    os: ["macOS", "Windows"].includes(env.os) ? env.os : null,
    browser_name: env.browser_name === "Chrome" ? "Chrome" : null,
    browser_version:
      typeof env.browser_version === "string" &&
      /^\d+(?:\.\d+){1,3}$/.test(env.browser_version)
        ? env.browser_version
        : null,
    manifest_version: env.manifest_version === 3 ? 3 : null,
  };
}
export const acceptanceHumanBlockers = new Set([
  "CAPTCHA_REQUIRED",
  "LOGIN_REQUIRED",
]);
