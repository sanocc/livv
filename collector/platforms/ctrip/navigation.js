import { verifyTaskContext } from "./context-contract.js";

export class NavigationError extends Error {
  constructor(code, message = code) { super(message); this.name = "NavigationError"; this.code = code; }
}

function withTimeout(promise, timeoutMs, code) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new NavigationError(code)), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

export function createCtripNavigation({ driver, readContext, timeoutMs = 15000 }) {
  if (!driver) throw new TypeError("driver is required");
  async function run(task) {
    await withTimeout(driver.ensureSurface(), timeoutMs, "NAVIGATION_TIMEOUT");
    await withTimeout(driver.setCity(task.city), timeoutMs, "NAVIGATION_TIMEOUT");
    await withTimeout(driver.confirmCity(), timeoutMs, "NAVIGATION_TIMEOUT");
    await withTimeout(driver.setKeyword(task.keyword), timeoutMs, "NAVIGATION_TIMEOUT");
    await withTimeout(driver.confirmKeyword(), timeoutMs, "NAVIGATION_TIMEOUT");
    await withTimeout(driver.setDates(task.check_in, task.check_out), timeoutMs, "NAVIGATION_TIMEOUT");
    await withTimeout(driver.submitSearch(), timeoutMs, "NAVIGATION_TIMEOUT");
    await withTimeout(driver.waitForResults(), timeoutMs, "NAVIGATION_TIMEOUT");
    const context = await withTimeout(readContext(), timeoutMs, "CONTEXT_READ_TIMEOUT");
    return { context, verification: verifyTaskContext(task, context) };
  }
  return {
    async navigate(task) {
      let result = await run(task);
      if (result.verification.ok) return { ...result, attempts: 1 };
      result = await run(task);
      if (result.verification.ok) return { ...result, attempts: 2 };
      throw new NavigationError(result.verification.code, result.verification.reason);
    },
  };
}
