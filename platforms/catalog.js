// Release capabilities, not live health or proof of a successful collection.
const cloudBlocked = {
  status: "BLOCKED",
  reason: "CLOUD_EGRESS_DENIED",
  verified_at: null,
  checked_on: "2026-10-02",
};
const definitions = [
  {
    id: "ctrip",
    name: "携程",
    identity_namespaces: ["ctrip"],
    collection_enabled: true,
    implementation: "IMPLEMENTED_NOT_LIVE_VERIFIED",
    recommended_route: "existing_chrome_mv3_dom",
    route_label: "现有 Chrome Agent / 公开 DOM",
    adapter: "platforms/ctrip/index.js",
    capabilities: {
      market_list: true,
      detail: true,
      exhaustion_evidence: true,
    },
    official_api: {
      evidence: "historical_sdk_only",
      access: "current_partner_terms_unverified",
      url: "https://open.ctrip.com/",
    },
    public_page: "https://m.ctrip.com/webapp/hotels/",
    limitation:
      "现有携程采集继续运行；本轮 Cloud 未取得真实页面，不能代表 Mac/Windows 真机验收。",
  },
  {
    id: "meituan",
    name: "美团酒店",
    identity_namespaces: ["meituan"],
    collection_enabled: false,
    implementation: "RESEARCH_ONLY",
    recommended_route: "official_access_review_then_browser_evaluation",
    route_label: "先核实官方酒店权限，再评估浏览器",
    adapter: "platforms/meituan/index.js",
    capabilities: {
      market_list: false,
      detail: false,
      exhaustion_evidence: false,
    },
    official_api: {
      evidence: "hotel_query_not_confirmed",
      access: "unknown",
      url: "https://open.meituan.com/",
    },
    public_page: "https://hotel.meituan.com/",
    limitation:
      "未验证当前酒店页面或酒店查询接口；外卖/配送 SDK、商家订单接口不等于竞品房价接口。",
  },
  {
    id: "fliggy",
    name: "飞猪",
    identity_namespaces: ["fliggy"],
    collection_enabled: false,
    implementation: "IMPLEMENTED_NOT_LIVE_VERIFIED",
    recommended_route: "flyai_official_query",
    route_label: "FlyAI 官方酒店搜索优先",
    adapter: "platforms/fliggy/index.js",
    capabilities: {
      market_list: false,
      detail: false,
      exhaustion_evidence: false,
      experimental_search: true,
    },
    official_api: {
      evidence: "publisher_documented_hotel_search",
      access: "documented_zero_config_cli_optional_own_key",
      url: "https://flyai.open.fliggy.com/",
    },
    public_page: "https://hotel.fliggy.com/",
    limitation:
      "已实现官方示例格式解析与自有 Key 的只读 MCP 实验客户端；真实响应、日期回显、价格口径及库存完整性待验证，不写入生产。",
  },
  {
    id: "tongcheng",
    name: "同程 / 艺龙",
    identity_namespaces: ["tongcheng", "elong"],
    collection_enabled: false,
    implementation: "RESEARCH_ONLY",
    recommended_route: "official_partner_api_review",
    route_label: "优先核实合作 API / 身份命名空间",
    adapter: "platforms/tongcheng/index.js",
    capabilities: {
      market_list: false,
      detail: false,
      exhaustion_evidence: false,
    },
    official_api: {
      evidence: "historical_elong_sdk_only",
      access: "current_partner_terms_unverified",
      url: "https://open.elong.com/",
    },
    public_page: "https://www.ly.com/hotel/",
    limitation:
      "历史艺龙 API 示例不是当前同程可用性证明；同程与艺龙 Hotel ID 必须独立保存，不能直接互换。",
  },
];
export function platformCatalog() {
  return definitions.map((p) => ({
    ...structuredClone(p),
    live_verification: { ...cloudBlocked },
    health: "unknown",
  }));
}
export const identityNamespaces = Object.freeze([
  "ctrip",
  "meituan",
  "fliggy",
  "tongcheng",
  "elong",
]);
