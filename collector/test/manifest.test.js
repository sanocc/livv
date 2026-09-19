import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../manifest.json", import.meta.url)), "utf8"));

describe("M05 Manifest V3", () => {
  it("uses a module Service Worker and only minimum permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toMatchObject({ service_worker: "background/service-worker.js", type: "module" });
    expect(manifest.permissions).toEqual(["storage", "alarms"]);
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("scripting");
    expect(manifest.permissions).not.toContain("activeTab");
    expect(manifest.host_permissions).toEqual(["http://localhost:8787/*"]);
  });
});
