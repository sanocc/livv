const esc = (v) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const implementation = {
  IMPLEMENTED_NOT_LIVE_VERIFIED: "实现完成 · 本轮真实平台未验证",
  RESEARCH_ONLY: "研究阶段",
};
const access = {
  documented_zero_config_cli_optional_own_key:
    "官方文档声明 CLI 零配置；自有 Key 可选，Cloud 接入尚未验证",
  current_partner_terms_unverified: "历史接口线索；当前合作准入待核实",
  unknown: "当前酒店查询权限未知",
};
export function platformCapabilitiesView(result) {
  return `<section class="platform-capabilities"><p class="muted">实现能力、生产开关与真实验证分别记录；未知状态不代表平台离线或售罄。</p><div class="table platform-table"><table><thead><tr><th>平台 / 原始身份</th><th>推荐路线 / 接入</th><th>实现与生产采集</th><th>本轮真实验证 / 健康</th></tr></thead><tbody>${result.platforms.map((p) => `<tr data-platform="${esc(p.id)}"><td><strong>${esc(p.name)}</strong><small>${p.identity_namespaces.map(esc).join(" / ")}</small></td><td><b>${esc(p.route_label)}</b><small>${esc(access[p.official_api.access] ?? "权限待核实")}</small></td><td>${esc(implementation[p.implementation] ?? p.implementation)}<small>${p.collection_enabled ? "保留现有生产采集" : "未开启生产任务"}</small></td><td>${p.live_verification.status === "BLOCKED" ? "Cloud 出口拒绝 · 未取得真实数据" : esc(p.live_verification.status)}<small>检查日期 ${esc(p.live_verification.checked_on)} · 平台实时健康未知</small></td></tr><tr class="platform-limit"><td colspan="4">${esc(p.limitation)}</td></tr>`).join("")}</tbody></table></div><p class="platform-contract-note">只使用当前平台实际观察的数据。缺价保留 null，零价保留 0；未见明确售罄或自然结束证据时保持 unknown。研究解析结果不会自动上传 D1，也不会启用新平台调度。Cloud 浏览器检查不能替代已批准 Chrome Agent 的 Mac/Windows 真机验收。</p></section>`;
}
