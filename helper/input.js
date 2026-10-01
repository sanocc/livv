const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
export function hotelTab(url) {
  try {
    const u = new URL(url);
    return (
      u.origin === "https://m.ctrip.com" &&
      (u.pathname === "/webapp/hotels" ||
        u.pathname.startsWith("/webapp/hotels/"))
    );
  } catch {
    return false;
  }
}
export async function performInput(browser, tabId, action) {
  if (
    !Number.isInteger(tabId) ||
    !action ||
    !["click", "text"].includes(action.type) ||
    !Number.isFinite(action.x) ||
    !Number.isFinite(action.y) ||
    action.x < 0 ||
    action.y < 0
  )
    fail("INVALID_INPUT_ACTION");
  if (
    action.type === "text" &&
    (typeof action.text !== "string" || action.text.length > 200)
  )
    fail("INVALID_INPUT_ACTION");
  const guard = async () => {
    const tab = await browser.tabs.get(tabId);
    if (!hotelTab(tab.url)) fail("MANAGED_TAB_NAVIGATED");
    const state = await browser.storage.local.get(["active", "managed_tab"]);
    if (state.managed_tab !== tabId || state.active?.tab_id !== tabId)
      fail("INPUT_TAB_NOT_OWNED");
  };
  await guard();
  if (!(await browser.permissions.contains({ permissions: ["debugger"] })))
    fail("INPUT_PERMISSION_REQUIRED");
  const target = { tabId };
  try {
    await browser.debugger.attach(target, "1.3");
  } catch (error) {
    throw Object.assign(new Error(error.message), {
      code: "INPUT_ATTACH_FAILED",
    });
  }
  try {
    // Attaching Chrome's debugger can resize the viewport via its information bar.
    // Re-read the public target geometry after attachment, before sending input.
    let point = action;
    if (action.selector) {
      if (typeof action.selector !== "string" || action.selector.length > 4000)
        fail("INVALID_INPUT_ACTION");
      await guard();
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          element.scrollIntoView({ block: "center", inline: "nearest" });
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        },
        args: [action.selector],
      });
      point = results[0]?.result;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
        fail("INPUT_TARGET_CHANGED");
    }
    const send = async (method, params) => {
      await guard();
      return browser.debugger.sendCommand(target, method, params);
    };
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    if (action.type === "text") {
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        commands: ["selectAll"],
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
      });
      await send("Input.insertText", { text: action.text });
    }
  } finally {
    await browser.debugger.detach(target).catch(() => {});
  }
}
