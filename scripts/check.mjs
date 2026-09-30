import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
for (const d of ["api/src", "ota/src", "ota/public", "helper", "scripts"])
  for (const file of walk(path.join(root, d)))
    if (/\.(js|mjs)$/.test(file))
      execFileSync(process.execPath, ["--check", file]);
for (const d of ["ota", "livvcc"]) {
  const c = JSON.parse(
    fs.readFileSync(path.join(root, d, "wrangler.jsonc"), "utf8"),
  );
  if (c.d1_databases) throw new Error("Database boundary violation");
}
await import("./build-helper.mjs");
console.log("Syntax and database boundaries passed");
