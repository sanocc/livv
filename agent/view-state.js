// A public projection for extension views. Credentials and collected payloads stay in background.
export function taskView(a) {
  if (!a) return null;
  const details = a.detail_results ?? [];
  return {
    task_id: a.task.id,
    attempt_id: a.attempt.id,
    attempt: a.attempt.attempt_number,
    task: {
      task_type: a.task.task_type,
      platform: a.task.platform,
      city: a.task.city,
      keyword: a.task.keyword,
      checkin: a.task.checkin,
      checkout: a.task.checkout,
      scope: a.task.scope,
      collection_limit: a.task.collection_limit,
    },
    status: "RUNNING",
    attempt_status: "RUNNING",
    phase: a.upload ? "UPLOAD" : a.phase,
    phase_at: a.phase_at,
    started_at: a.attempt.started_at ?? a.attempt.claimed_at,
    count: a.market?.length ?? 0,
    detail_total: a.details?.length ?? 0,
    detail_success: details.filter((d) => d.status === "SUCCESS").length,
    detail_failed: details.filter((d) => d.status === "FAILED").length,
    detail_results: details.map((d) => ({ ...d })),
    current_hotel: a.details?.[a.detail_index]
      ? {
          hotel_id: a.details[a.detail_index].hotel_id,
          hotel_name:
            a.market?.find(
              (h) => h.hotel_id === a.details[a.detail_index].hotel_id,
            )?.hotel_name ?? null,
        }
      : null,
    rooms: a.rooms?.length ?? 0,
    waiting_stable:
      a.phase === "DETAIL_READ" && !!a.current_detail_rooms?.length,
  };
}
export function publicState(s, device_id, version) {
  return {
    device_id,
    version,
    auto: s.auto,
    cloud: s.cloud
      ? {
          name: s.cloud.name,
          status: s.cloud.status,
          server_time: s.cloud.server_time,
        }
      : null,
    cloud_at: s.cloud_at,
    active: taskView(s.active),
    last_error: s.error,
    logs: s.logs ?? [],
    history: s.ui_history ?? [],
  };
}
export function remember(history, record) {
  const previous = history.find((r) => r.task_id === record.task_id);
  const attempts = previous?.attempts ?? [];
  if (record.attempt_id) {
    record = {
      ...record,
      attempts: [
        {
          attempt_id: record.attempt_id,
          status: record.attempt_status,
          error_code: record.error_code ?? null,
          started_at: record.started_at,
          finished_at: record.finished_at ?? null,
        },
        ...attempts.filter((a) => a.attempt_id !== record.attempt_id),
      ].slice(0, 5),
    };
  }
  return [record, ...history.filter((r) => r.task_id !== record.task_id)].slice(
    0,
    30,
  );
}
export function trustedView(sender, extension) {
  return (
    sender.id === extension.id &&
    ["popup.html", "sidepanel.html"].some(
      (path) => sender.url === extension.getURL(path),
    )
  );
}
