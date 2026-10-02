// Cloud client: fixed POAI control URLs; short-lived capability from a private file.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { validControlContext } from "../api/src/acceptance-capability.js";
const origin = "https://api.poai.cc";
export async function acceptanceRequest({
  token,
  action,
  context,
  fetcher = fetch,
}) {
  if (
    typeof token !== "string" ||
    !/^[\x21-\x7e]{1,4096}$/.test(token) ||
    token.length > 4096 ||
    !["create", "result"].includes(action) ||
    (action === "create" && !validControlContext(context))
  )
    throw Error("Invalid acceptance client input");
  let response;
  try {
    response = await fetcher(
      origin +
        (action === "create"
          ? "/v1/acceptance-control/tasks"
          : "/v1/acceptance-control/result"),
      {
        method: action === "create" ? "POST" : "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(action === "create"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(action === "create" ? { body: JSON.stringify(context) } : {}),
      },
    );
    if (!response.ok) throw Error("response rejected");
    if (
      !(response.headers.get("Content-Type") ?? "").includes("application/json")
    )
      throw Error("not JSON");
    if (Number(response.headers.get("Content-Length") ?? 0) > 100000)
      throw Error("oversized response");
    const reader = response.body?.getReader();
    if (!reader) throw Error("empty response");
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100000) {
        await reader.cancel();
        throw Error("oversized response");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, position);
      position += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw Error(
      "Acceptance request unavailable or denied; check network, short-lived grant and control enablement. No retry, redirect or credential logging was performed.",
    );
  }
}
export async function main(args) {
  const [action, tokenFile, contextFile] = args;
  if (
    args.length !== (action === "create" ? 3 : 2) ||
    !["create", "result"].includes(action)
  )
    throw Error("Invalid arguments");
  let token;
  if (tokenFile === "--env") {
    // Proxy-backed secret bindings may contain an opaque placeholder. Never decode/log it;
    // supported HTTPS proxy substitution happens only at the fixed authorized origin.
    token = process.env.POAI_ACCEPTANCE_CAPABILITY;
  } else {
    const stat = fs.lstatSync(tokenFile);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
    )
      throw Error("Capability file must be private");
    token = fs.readFileSync(tokenFile, "utf8").trim();
  }
  return acceptanceRequest({
    action,
    token,
    ...(action === "create"
      ? { context: JSON.parse(fs.readFileSync(contextFile, "utf8")) }
      : {}),
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2));
  } catch {
    console.error(
      "Acceptance request failed; verify private capability file, context, network and approval. No credentials or raw upstream errors were printed.",
    );
    process.exitCode = 1;
  }
}
