import test from "node:test";
import assert from "node:assert/strict";
import { hotelTab, performInput } from "../agent/input.js";
function fixture() {
  const calls = [],
    state = {
      url: "https://m.ctrip.com/webapp/hotels/hotelsearch/search",
      owner: 7,
      permission: true,
    };
  const browser = {
    tabs: { get: async () => ({ url: state.url }) },
    storage: {
      local: {
        get: async () => ({
          managed_tab: state.owner,
          active: { tab_id: state.owner },
        }),
      },
    },
    permissions: { contains: async () => state.permission },
    debugger: {
      attach: async (target) => calls.push(["attach", target]),
      sendCommand: async (target, method, params) => {
        calls.push([method, params]);
        if (state.navigate) state.url = "https://example.com/";
      },
      detach: async (target) => calls.push(["detach", target]),
    },
  };
  return { browser, calls, state };
}
test("browser input refuses foreign origins, missing permission and unowned tabs", async () => {
  for (const url of [
    "http://m.ctrip.com/webapp/hotels/",
    "https://m.ctrip.com.evil.test/webapp/hotels/",
    "https://m.ctrip.com/webapp/flights/",
    "chrome://extensions/",
  ])
    assert.equal(hotelTab(url), false);
  for (const scenario of ["origin", "owner", "permission"]) {
    const { browser, calls, state } = fixture();
    if (scenario === "origin") state.url = "https://example.com/";
    if (scenario === "owner") state.owner = 8;
    if (scenario === "permission") state.permission = false;
    await assert.rejects(
      performInput(browser, 7, { type: "click", x: 30, y: 40 }),
    );
    assert.equal(calls.length, 0);
  }
});
test("browser input only clicks and inserts search text, then detaches", async () => {
  const { browser, calls } = fixture();
  await performInput(browser, 7, { type: "text", x: 30, y: 40, text: "咸宁" });
  assert.deepEqual(
    calls.map((c) => c[0]),
    [
      "attach",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
      "Input.insertText",
      "detach",
    ],
  );
  assert.deepEqual(calls[3][1].commands, ["selectAll"]);
  assert.equal(calls[5][1].text, "咸宁");
});
test("navigation during input stops further commands and always detaches", async () => {
  const { browser, calls, state } = fixture();
  state.navigate = true;
  await assert.rejects(
    performInput(browser, 7, { type: "click", x: 30, y: 40 }),
    { code: "MANAGED_TAB_NAVIGATED" },
  );
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["attach", "Input.dispatchMouseEvent", "detach"],
  );
});

test("input remeasures its target after debugger changes viewport", async () => {
  const { browser, calls } = fixture();
  browser.scripting = {
    executeScript: async ({ target, args }) => {
      assert.equal(calls[0][0], "attach");
      assert.equal(target.tabId, 7);
      assert.deepEqual(args, ["html > body > input"]);
      return [{ result: { x: 35, y: 21 } }];
    },
  };
  await performInput(browser, 7, {
    type: "click",
    x: 30,
    y: 40,
    selector: "html > body > input",
  });
  assert.equal(calls[1][1].x, 35);
  assert.equal(calls[1][1].y, 21);
  assert.equal(calls.at(-1)[0], "detach");
  browser.scripting.executeScript = async () => [{ result: null }];
  calls.length = 0;
  await assert.rejects(
    performInput(browser, 7, {
      type: "click",
      x: 30,
      y: 40,
      selector: "html > body > input",
    }),
    { code: "INPUT_TARGET_CHANGED" },
  );
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["attach", "detach"],
  );
});
