import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
const root = path.resolve(import.meta.dirname, "..");
for (const directory of ["ota", "ops", "ai"]) {
  for (const name of ["poai-logo.svg", "poai-icon.svg"])
    fs.copyFileSync(
      path.join(root, "livvcc/public", name),
      path.join(root, directory, "public", name),
    );
}
fs.copyFileSync(
  path.join(root, "livvcc/public/style.css"),
  path.join(root, "ai/public/style.css"),
);
fs.mkdirSync(path.join(root, "ops/public/vendor"), { recursive: true });
fs.copyFileSync(
  path.join(root, "node_modules/fflate/esm/browser.js"),
  path.join(root, "ops/public/vendor/fflate.js"),
);
fs.copyFileSync(
  path.join(root, "node_modules/fflate/LICENSE"),
  path.join(root, "ops/public/vendor/fflate.LICENSE"),
);
const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "helper/manifest.json")),
  ),
  files = {};
for (const name of fs.readdirSync(path.join(root, "helper")).sort())
  if (/\.(js|json|html|css|png)$/.test(name) && name !== "package.json")
    files[name] = [
      new Uint8Array(fs.readFileSync(path.join(root, "helper", name))),
      { mtime: new Date("2026-10-02T00:00:00Z") },
    ];
fs.mkdirSync(path.join(root, "livvcc/public/downloads"), { recursive: true });
fs.writeFileSync(
  path.join(
    root,
    "livvcc/public/downloads",
    `poai-agent-${manifest.version}.zip`,
  ),
  zipSync(files),
);
console.log("POAI assets and Agent package prepared");
