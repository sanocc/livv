import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  errorLabel,
  statusLabel,
  businessLog,
  technicalError,
  statusLabels,
  errorLabels,
  eventLabels,
} from "../helper/i18n.js";
import {
  taskView,
  publicState,
  remember,
  trustedView,
} from "../helper/view-state.js";
import {
  taskCard,
  historyCards,
  stageLabel,
  updateHTML,
  updateText,
} from "../helper/sidepanel-view.js";
const active = () => ({
  task: {
    id: "task",
    platform: "ctrip",
    city: "咸宁",
    keyword: "中心花坛",
    checkin: "2026-10-02",
    checkout: "2026-10-03",
    scope: "top30",
    collection_limit: 30,
  },
  attempt: {
    id: "attempt",
    attempt_number: 1,
    claimed_at: "2026-10-01T09:00:00Z",
  },
  phase: "DETAIL_READ",
  phase_at: Date.now(),
  details: [{ hotel_id: "1" }, { hotel_id: "2" }, { hotel_id: "3" }],
  detail_index: 2,
  market: [
    { hotel_id: "1", hotel_name: "我的酒店" },
    { hotel_id: "3", hotel_name: "维也纳酒店" },
  ],
  rooms: [{ hotel_id: "1", room_name: "房型", sold_out_evidence: "已订完" }],
  detail_results: [
    { hotel_id: "1", status: "SUCCESS" },
    { hotel_id: "2", status: "FAILED", error_code: "DETAIL_CARD_NOT_FOUND" },
  ],
});

test("Side Panel public state restores persisted task, separates list/details and never exposes credentials or room payloads", () => {
  const a = active(),
    s = {
      active: a,
      identity: { credential: "secret" },
      cloud: {
        name: "办公室Mac",
        status: "approved",
        active_attempt: { secret: "private" },
      },
      logs: [],
      ui_history: [],
    };
  const v = publicState(s, "device", "1.1.0");
  assert.equal(v.active.count, 2);
  assert.equal(v.active.detail_success, 1);
  assert.equal(v.active.detail_failed, 1);
  assert.equal(v.active.detail_total, 3);
  assert.equal(v.active.current_hotel.hotel_id, "3");
  assert.ok(!JSON.stringify(v).includes("secret"));
  assert.ok(!JSON.stringify(v).includes("sold_out_evidence"));
  assert.deepEqual(
    publicState(JSON.parse(JSON.stringify(s)), "device", "1.1.0"),
    v,
  );
  a.upload = {};
  assert.equal(taskView(a).phase, "UPLOAD");
  const html = taskCard(v.active);
  assert.match(html, /市场列表/);
  assert.match(html, /核心详情/);
  assert.match(html, /2 \/ 30/);
  assert.match(html, /2 \/ 3/);
  assert.doesNotMatch(html, /2 \/ 33/);
  assert.match(html, /维也纳酒店/);
  assert.match(html, /平台酒店 ID：3/);
});

test("local task history preserves PARTIAL/FAILED distinction and does not infer a final Task from failed Attempt", () => {
  const v = taskView(active());
  let history = [];
  for (let i = 0; i < 35; i++)
    history = remember(history, { ...v, task_id: "" + i });
  assert.equal(history.length, 30);
  history = remember(history, {
    ...v,
    task_id: "34",
    status: "PARTIAL",
    error_code: "PARTIAL_COLLECTION",
  });
  assert.equal(history.length, 30);
  assert.equal(history[0].status, "PARTIAL");
  const html = historyCards([
    {
      ...v,
      status: null,
      attempt_status: "FAILED",
      error_code: "SEARCH_CONTROL_TIMEOUT",
    },
    { ...v, status: "PARTIAL" },
  ]);
  assert.match(html, /任务状态：待云端确认/);
  assert.match(html, /执行状态：失败/);
  assert.match(html, /PARTIAL/);
  assert.doesNotMatch(html, /COMPLETED/);
  assert.match(historyCards([]), /暂无/);
  const escaped = taskCard({
    ...v,
    current_hotel: { hotel_name: "<img src=x onerror=bad()>", hotel_id: "3" },
  });
  assert.doesNotMatch(escaped, /<img/);
});

test("only exact extension popup and sidepanel may send privileged commands", () => {
  const e = {
    id: "extension",
    getURL: (p) => "chrome-extension://extension/" + p,
  };
  for (const page of ["popup.html", "sidepanel.html"])
    assert.equal(trustedView({ id: e.id, url: e.getURL(page) }, e), true);
  for (const url of [
    "https://m.ctrip.com",
    "chrome-extension://extension/sidepanel.html?x",
    "chrome-extension://other/sidepanel.html",
  ])
    assert.equal(trustedView({ id: e.id, url }, e), false);
  assert.equal(
    trustedView({ id: "other", url: e.getURL("sidepanel.html") }, e),
    false,
  );
});

test("sidepanel manifest is MV3, hosts unchanged, no dangerous cancel, and background retains ownership of execution", () => {
  const m = JSON.parse(
    fs.readFileSync(new URL("../helper/manifest.json", import.meta.url)),
  );
  assert.equal(m.manifest_version, 3);
  assert.equal(m.side_panel.default_path, "sidepanel.html");
  assert.ok(m.permissions.includes("sidePanel"));
  assert.equal(m.action.default_popup, undefined);
  assert.deepEqual(m.host_permissions, [
    "https://api.poai.cc/*",
    "https://m.ctrip.com/*",
  ]);
  const script = fs.readFileSync(
    new URL("../helper/sidepanel.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(script, /\/v1\//);
  assert.doesNotMatch(
    script,
    /executeScript|debugger\.attach|active:\s*null|cancel|set\(\{.*active/,
  );
  const bg = fs.readFileSync(
    new URL("../helper/background.js", import.meta.url),
    "utf8",
  );
  assert.match(bg, /openPanelOnActionClick: true/);
  assert.match(bg, /setTimeout\(\(\) => tick\(\), 2000\)/);
  assert.equal(stageLabel({ phase: "DETAIL_OPEN" }), "正在寻找详情入口");
});

test("sidepanel submit goes through existing background TASK message; closing view clears only presentation timer", async () => {
  const source = fs
    .readFileSync(new URL("../helper/sidepanel.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?;\n/g, "");
  const nodes = new Map();
  const node = (s) => {
    if (!nodes.has(s))
      nodes.set(s, {
        value: "",
        dataset: {},
        hidden: false,
        textContent: "",
        innerHTML: "",
        checked: false,
        disabled: false,
      });
    return nodes.get(s);
  };
  const calls = [],
    copies = [],
    listeners = {};
  const ctx = vm.createContext({
    document: { querySelector: node, querySelectorAll: () => [] },
    chrome: {
      runtime: {
        sendMessage: async (m) => {
          calls.push(m);
          return m.type === "STATE"
            ? {
                version: "1.1.0",
                cloud: { status: "approved" },
                logs: [
                  {
                    at: "2026-10-01T09:00:00Z",
                    event: "API_TIMEOUT",
                    message: "raw diagnostic",
                  },
                ],
                history: [],
                device_id: "d",
              }
            : { id: "new-task" };
        },
      },
      storage: { onChanged: { addListener: () => {} } },
    },
    navigator: { clipboard: { writeText: async (text) => copies.push(text) } },
    window: {
      addEventListener: (e, fn) => {
        listeners[e] = fn;
      },
    },
    setInterval: () => 42,
    setTimeout,
    clearTimeout,
    clearInterval: (id) => calls.push({ clearTimer: id }),
    Intl,
    Date,
    FormData: class {
      constructor() {
        return new Map(
          Object.entries({
            platform: "ctrip",
            city: "咸宁",
            checkin: "2026-10-02",
            checkout: "2026-10-03",
            keyword: "中心花坛",
            scope: "top30",
            limit: "30",
          }),
        );
      }
    },
    errorLabel,
    statusLabel,
    businessLog,
    technicalError,
    esc: (v) => String(v ?? "—"),
    time: (v) => String(v),
    taskCard: () => "",
    historyCards: () => "",
    updateHTML,
    updateText,
  });
  vm.runInContext(source, ctx);
  await new Promise((r) => setImmediate(r));
  node("#task").onsubmit({ preventDefault() {}, target: {} });
  await new Promise((r) => setImmediate(r));
  assert.ok(
    calls.some(
      (m) =>
        m.type === "TASK" && m.task.scope === "top30" && !("limit" in m.task),
    ),
  );
  assert.ok(calls.every((m) => ["STATE", "TASK"].includes(m.type)));
  node("#copy").onclick();
  await new Promise((r) => setImmediate(r));
  assert.match(copies[0], /接口连接超时/);
  assert.doesNotMatch(copies[0], /API_TIMEOUT|raw diagnostic/);
  node("#copy-technical").onclick();
  await new Promise((r) => setImmediate(r));
  assert.match(copies[1], /API_TIMEOUT raw diagnostic/);
  listeners.unload();
  assert.equal(calls.at(-1).clearTimer, 42);
  assert.ok(!calls.some((m) => m.type === "AUTO"));
});

test("new attempts retain prior local failure evidence while latest Task remains truthful", () => {
  const v = taskView(active());
  let h = remember([], {
    ...v,
    status: null,
    attempt_status: "FAILED",
    error_code: "SEARCH_CONTROL_TIMEOUT",
  });
  h = remember(h, {
    ...v,
    attempt_id: "retry",
    status: "RUNNING",
    attempt_status: "RUNNING",
  });
  assert.equal(h[0].status, "RUNNING");
  assert.equal(h[0].attempts.length, 2);
  assert.equal(h[0].attempts[1].error_code, "SEARCH_CONTROL_TIMEOUT");
  assert.equal(h[0].attempts[1].status, "FAILED");
  assert.match(historyCards(h), /SEARCH_CONTROL_TIMEOUT/);
});

test("display localization keeps raw status, errors and IDs only in technical details; list-only hides unrelated detail metrics", () => {
  const a = active();
  a.task.task_type = "MARKET_LIST";
  a.details = [];
  a.rooms = [];
  a.detail_results = [];
  a.phase = "LIST";
  const view = taskView(a);
  assert.equal(view.task.task_type, "MARKET_LIST");
  const running = taskCard(view);
  assert.match(running, /执行中/);
  assert.doesNotMatch(running, /核心详情|核心酒店详情|详情成功|详情失败/);
  const record = {
    ...view,
    status: "PARTIAL",
    attempt_status: "PARTIAL",
    error_code: "API_TIMEOUT",
    finished_at: "2026-10-01T09:00:27Z",
    snapshot_id: "snapshot",
  };
  const saved = JSON.stringify(record);
  const html = historyCards([record]);
  const normal = html.split('<details class="technical"')[0];
  assert.match(normal, /部分完成/);
  assert.match(normal, /接口连接超时/);
  assert.match(normal, /27秒/);
  assert.doesNotMatch(
    normal,
    /API_TIMEOUT|PARTIAL|Task|Attempt|Snapshot|房型|详情 0/,
  );
  assert.match(html, /技术详情/);
  assert.match(html, /原始状态：PARTIAL/);
  assert.match(html, /API_TIMEOUT/);
  assert.match(html, /市场快照 ID：snapshot/);
  assert.equal(JSON.stringify(record), saved);
  assert.match(
    historyCards([{ ...record, finished_at: null }]),
    /耗时<\/span><strong>—/,
  );
  const old = { ...record, task: { ...record.task, task_type: undefined } };
  assert.doesNotMatch(
    historyCards(
      [old],
      [
        {
          task_id: old.task_id,
          event: "TASK_TIMING",
          message: '{"task_type":"MARKET_LIST"}',
        },
      ],
    ),
    /房型/,
  );
  assert.equal(old.task.task_type, undefined);
  assert.doesNotMatch(
    historyCards([{ ...old, detail_total: 0, detail_results: [], rooms: 0 }]),
    /房型|详情 0/,
  );
});

test("all emitted API/helper error codes have Chinese display mapping; business logs do not expose diagnostic payloads", () => {
  for (const [code, text] of Object.entries(statusLabels)) {
    assert.equal(statusLabel(code), text);
    assert.match(text, /[\u4e00-\u9fff]/);
  }
  assert.equal(statusLabel("approved"), "已批准");
  assert.equal(statusLabel("pending"), "待批准");
  assert.equal(statusLabel("UNKNOWN_STATUS"), "状态待确认");
  const sources = [
    ...fs
      .readdirSync("helper")
      .filter((x) => x.endsWith(".js") && !/i18n|view|sidepanel|popup/.test(x))
      .map((x) => "helper/" + x),
    ...fs
      .readdirSync("api/src")
      .filter((x) => x.endsWith(".js"))
      .map((x) => "api/src/" + x),
  ];
  const codes = new Set(
    sources
      .flatMap((f) =>
        [...fs.readFileSync(f, "utf8").matchAll(/["']([A-Z][A-Z_]+)["']/g)].map(
          (m) => m[1],
        ),
      )
      .filter((c) =>
        /^(INVALID_|INPUT_|ATTEMPT_|DEVICE_|ADMIN_|DETAIL_.*(?:FAILED|FOUND|TIMEOUT|INCOMPLETE|BUDGET)|.*(?:_REQUIRED|_MISMATCH|_CONFLICT|_EXPIRED|_NOT_FOUND|_TIMEOUT))/.test(
          c,
        ),
      ),
  );
  for (const code of codes)
    assert.ok(
      errorLabels[code] || eventLabels[code],
      `Missing display translation: ${code}`,
    );
  assert.equal(errorLabel("SEARCH_CONTROL_TIMEOUT"), "搜索条件设置超时");
  assert.equal(errorLabel("INPUT_TARGET_CHANGED"), "页面操作目标发生变化");
  assert.equal(errorLabel("NEW_ERROR"), "操作异常，请查看技术详情");
  assert.match(technicalError("API_TIMEOUT"), /接口连接超时\nAPI_TIMEOUT/);
  assert.equal(
    businessLog({
      event: "MARKET_LOCKED",
      message: "30家唯一酒店，详情目标0家",
    }),
    "✓ 已采集30家酒店",
  );
  assert.equal(
    businessLog({ event: "PHASE", message: "CITY_OPEN → CITY_INPUT" }),
    "✓ 采集步骤已切换",
  );
  assert.doesNotMatch(
    businessLog({
      event: "FAST_NAV_VERIFIED",
      message: '{"url":"raw diagnostic"}',
    }),
    /url|raw|FAST_NAV/,
  );
});
