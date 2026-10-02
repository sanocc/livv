// Operator-side offline signer. Never run keygen/issue with production keys in Codex Cloud.
import fs from "node:fs";
import { generateKeyPairSync, createPrivateKey, sign } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  CAPABILITY_ISSUER,
  CAPABILITY_AUDIENCE,
  MAX_CAPABILITY_SECONDS,
  validControlContext,
  validGrantID,
  capabilityParts,
  b64url,
} from "../api/src/acceptance-capability.js";
import { target } from "../api/src/domain.js";
export function issueCapability({
  privateKey,
  kid,
  context,
  os,
  grantID = crypto.randomUUID(),
  ttl = 900,
  now = Math.floor(Date.now() / 1000),
}) {
  if (
    !/^[a-zA-Z0-9_-]{1,64}$/.test(kid) ||
    !validControlContext(context) ||
    !["macOS", "Windows"].includes(os) ||
    !validGrantID(grantID) ||
    !Number.isInteger(ttl) ||
    ttl < 1 ||
    ttl > MAX_CAPABILITY_SECONDS
  )
    throw Error("Invalid capability policy");
  target({ ...context, scope: "custom", limit: 3 }, { now: now * 1000 });
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== "ed25519") throw Error("Ed25519 key required");
  const claims = {
    iss: CAPABILITY_ISSUER,
    aud: CAPABILITY_AUDIENCE,
    sub: "codex-acceptance",
    jti: grantID,
    iat: now,
    nbf: now,
    exp: now + ttl,
    scope: ["acceptance:create", "acceptance:read"],
    os,
    context,
  };
  const payload = capabilityParts(
    { alg: "EdDSA", typ: "poai-acceptance-capability+JWT", kid },
    claims,
  );
  return {
    token: payload + "." + b64url(sign(null, Buffer.from(payload), key)),
    grant_id: grantID,
    expires_at: new Date(claims.exp * 1000).toISOString(),
  };
}
function writeNew(path, content, mode) {
  fs.writeFileSync(path, content, { flag: "wx", mode });
}
export function main(args) {
  const [command, ...pairs] = args;
  if (pairs.length % 2) throw Error("Arguments must be flag/value pairs");
  const options = {};
  for (let i = 0; i < pairs.length; i += 2) {
    const flag = pairs[i];
    if (!/^--[a-z-]+$/.test(flag) || Object.hasOwn(options, flag))
      throw Error("Invalid arguments");
    options[flag] = pairs[i + 1];
  }
  const allowed =
    command === "keygen"
      ? ["--private-file", "--public-file", "--kid"]
      : command === "issue"
        ? [
            "--private-file",
            "--kid",
            "--context-file",
            "--os",
            "--token-file",
            "--grant-id",
            "--ttl",
          ]
        : [];
  if (!allowed.length || Object.keys(options).some((k) => !allowed.includes(k)))
    throw Error("Use keygen or issue with documented file arguments");
  const required =
    command === "keygen"
      ? ["--private-file", "--public-file", "--kid"]
      : ["--private-file", "--kid", "--context-file", "--os", "--token-file"];
  if (
    required.some((k) => !options[k]) ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(options["--kid"])
  )
    throw Error("Missing or invalid arguments");
  if (command === "keygen") {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    writeNew(
      options["--private-file"],
      privateKey.export({ type: "pkcs8", format: "pem" }),
      0o600,
    );
    const pub = publicKey.export({ format: "jwk" });
    writeNew(
      options["--public-file"],
      JSON.stringify(
        [{ kid: options["--kid"], kty: pub.kty, crv: pub.crv, x: pub.x }],
        null,
        2,
      ) + "\n",
      0o644,
    );
    return { status: "KEY_CREATED_OFFLINE", kid: options["--kid"] };
  }
  const stat = fs.lstatSync(options["--private-file"]);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
  )
    throw Error("Private key must be a private regular file");
  const result = issueCapability({
    privateKey: fs.readFileSync(options["--private-file"]),
    kid: options["--kid"],
    context: JSON.parse(fs.readFileSync(options["--context-file"], "utf8")),
    os: options["--os"],
    grantID: options["--grant-id"],
    ttl: options["--ttl"] === undefined ? 900 : Number(options["--ttl"]),
  });
  writeNew(options["--token-file"], result.token + "\n", 0o600);
  return {
    status: "SHORT_LIVED_CAPABILITY_CREATED",
    grant_id: result.grant_id,
    expires_at: result.expires_at,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2))));
  } catch {
    console.error(
      "Capability operation failed; check documented arguments, key type, private file permissions and valid context. No credential was printed.",
    );
    process.exitCode = 1;
  }
}
