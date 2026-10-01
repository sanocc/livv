import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  dir = path.join(root, "helper"),
  manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
  );
for (const file of [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.side_panel?.default_path,
  ...manifest.content_scripts.flatMap((x) => x.js),
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action.default_icon ?? {}),
])
  if (file && !fs.existsSync(path.join(dir, file)))
    throw new Error("Missing " + file);
console.log("MV3 helper validated; load unpacked: " + dir);
