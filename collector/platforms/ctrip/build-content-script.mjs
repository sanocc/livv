import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const removeModuleSyntax = (source) => source
  .replace(/^import .*\n/gu, "")
  .replace(/^export /gmu, "");
const contract = removeModuleSyntax(await readFile(resolve(directory, "context-contract.js"), "utf8"));
const reader = removeModuleSyntax(await readFile(resolve(directory, "context-reader.js"), "utf8"));
const output = `// Generated from context-contract.js and context-reader.js. Do not edit manually.\n(() => {\n${contract}\n${reader}\n  globalThis.LIVV_CTRIP_CONTEXT = { readCtripContext, ctripContextProbe };\n})();\n`;
await writeFile(resolve(directory, "context-reader.bundle.js"), output);
