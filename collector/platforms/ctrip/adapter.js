import { readCtripContext } from "./context-reader.js";
import { createCtripNavigation } from "./navigation.js";

export const ctripAdapter = Object.freeze({
  platform: "ctrip",
  readContext: readCtripContext,
  createNavigation: createCtripNavigation,
});

export function createPlatformAdapter(adapter) {
  if (!adapter?.platform || typeof adapter.readContext !== "function" || typeof adapter.createNavigation !== "function") throw new TypeError("invalid platform adapter");
  return Object.freeze({ ...adapter });
}
