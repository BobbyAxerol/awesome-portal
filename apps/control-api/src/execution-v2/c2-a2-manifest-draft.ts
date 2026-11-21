import { createHash } from "node:crypto";

/** NOT MOUNTED. A deterministic metadata-only draft; no authority or file I/O.
 * In particular this is NOT the TS verifier, proof of installed issuer/P7, a
 * publication or an A2 package. No caller may treat this as delivery-ready.
 * A future write-once delivery adapter must independently attest installation,
 * P7 lineage, trust, content and TS validation before writing anything. */
const REQUIRED = ["acceptance-evidence.json", "human-token-jwks.json", "identifiers.json",
  "portal-ca.pem", "portal-server-cert.pem", "publication-signer.jwk.json", "ts-mtls-client.crt.pem"] as const;
const OPTIONAL = "sample-token.jwt";
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const fail = (): never => { throw new Error("C2_A2_DRAFT_INVALID"); };

export function draftA2ManifestNotAuthorized(input: {
  revision: number; produced_by: string; produced_utc: string;
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}): Readonly<{ state: "DRAFT_NOT_DELIVERABLE"; manifest: string; sha256sums: string }> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 1 ||
      typeof input.produced_by !== "string" || input.produced_by !== input.produced_by.trim() ||
      Buffer.byteLength(input.produced_by) < 1 || Buffer.byteLength(input.produced_by) > 512 ||
      /[\u0000-\u001f\u007f]/u.test(input.produced_by) ||
      typeof input.produced_utc !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(input.produced_utc) ||
      !Number.isFinite(Date.parse(input.produced_utc)) || new Date(input.produced_utc).toISOString() !== input.produced_utc.replace("Z", ".000Z") ||
      !Array.isArray(input.files)) return fail();
  const seen = new Set<string>();
  const files = input.files.map(item => {
    if (!item || typeof item.path !== "string" || !([...REQUIRED, OPTIONAL] as string[]).includes(item.path) ||
        seen.has(item.path) || !(item.bytes instanceof Uint8Array) || !item.bytes.byteLength || item.bytes.byteLength > 65536) return fail();
    seen.add(item.path);
    const snapshot = Buffer.from(item.bytes);
    return { path: item.path, bytes: snapshot.length, sha256: sha(snapshot) };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (REQUIRED.some(name => !seen.has(name))) return fail();
  const manifest = JSON.stringify({ schema: "ts-portal.pm-authority-exchange.v1", direction: "portal-to-ts", step: "a2",
    revision: input.revision, produced_by: input.produced_by, produced_utc: input.produced_utc, files }) + "\n";
  const sha256sums = `${sha(Buffer.from(manifest))}  MANIFEST.json\n` + files.map(row => `${row.sha256}  ${row.path}\n`).join("");
  return Object.freeze({ state: "DRAFT_NOT_DELIVERABLE", manifest, sha256sums });
}
