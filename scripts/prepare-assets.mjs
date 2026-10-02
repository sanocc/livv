import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
const root = path.resolve(import.meta.dirname, "..");
const brandFiles = ["poai-logo.png", "poai-icon.png", "favicon-16.png", "favicon-32.png", "favicon-48.png", "favicon.ico"];
for (const directory of ["site", "ota", "ops", "ai"]) {
  for (const name of brandFiles)
    fs.copyFileSync(path.join(root, "brand", name), path.join(root, directory, "public", name));
}
for (const size of [16, 32, 48, 128])
  fs.copyFileSync(path.join(root, "brand", `icon-${size}.png`), path.join(root, "agent", `icon-${size}.png`));
fs.copyFileSync(
  path.join(root, "site/public/style.css"),
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
    fs.readFileSync(path.join(root, "agent/manifest.json")),
  ),
  files = {};
for (const name of fs.readdirSync(path.join(root, "agent")).sort())
  if (/\.(js|json|html|css|png)$/.test(name) && name !== "package.json")
    files[name] = [
      new Uint8Array(fs.readFileSync(path.join(root, "agent", name))),
      { mtime: new Date("2026-10-02T00:00:00Z") },
    ];
fs.mkdirSync(path.join(root, "site/public/downloads"), { recursive: true });
fs.writeFileSync(
  path.join(
    root,
    "site/public/downloads",
    `poai-agent-${manifest.version}.zip`,
  ),
  zipSync(files),
);
console.log("POAI assets and Agent package prepared");
