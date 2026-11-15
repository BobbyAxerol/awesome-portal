/** R1c-ARCHIVE, offline owner maintenance ONLY (never in a server path): checks (and, with --mint, signs) the ABORTED terminal for the
 * one stuck frame lease out of the verified schema archive. No database, no network, no HTTP listener.
 * usage: execution-native-archive-terminal --row <file> --row-sha256 <hex> (--check | --mint --out-dir <dir>)
 *        [--expect-source-digest <hex>] [--expect-binding-digest <hex>]
 * Reads the pinned native Core manifest through the usual env pair (CONTROL_API_NATIVE_CORE_CONFIG_FILE/SHA256) for the terminal signer. */
import "reflect-metadata";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { importPKCS8 } from "jose";
import { nativeCoreRuntimeManifest, nativeCoreRuntimeReference, readNativeRuntimeReference } from "../execution-v2/native-core-runtime";
import { mintArchivedUnsentFrameTerminal, NativeArchiveTerminalError } from "../execution-v2/native-archive-terminal";

const abs = (p: string | undefined): string => {
  if (!p || !isAbsolute(p) || normalize(p) !== p) throw new Error("NATIVE_ARCHIVE_TERMINAL_ARGS_REQUIRED");
  return p;
};
async function readPinned(path: string, sha256: string, maxBytes: number): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maxBytes || (before.mode & 0o077) !== 0)
    throw new Error("NATIVE_ARCHIVE_TERMINAL_FILE_REFUSED");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = await handle.readFile();
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("NATIVE_ARCHIVE_TERMINAL_HASH_MISMATCH");
    return bytes;
  } finally { await handle.close(); }
}

async function main() {
  const args = process.argv.slice(2), val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const mint = args.includes("--mint"), check = args.includes("--check");
  if (mint === check) throw new Error("NATIVE_ARCHIVE_TERMINAL_ARGS_REQUIRED");
  const rowPath = abs(val("--row")), rowSha = val("--row-sha256");
  if (!rowSha || !/^[a-f0-9]{64}$/.test(rowSha)) throw new Error("NATIVE_ARCHIVE_TERMINAL_ARGS_REQUIRED");
  const reference = nativeCoreRuntimeReference();
  if (!reference) throw new Error("NATIVE_ARCHIVE_TERMINAL_SCOPE_REQUIRED");
  const manifestBytes = await readNativeRuntimeReference(reference, 131072);
  const manifest = nativeCoreRuntimeManifest.parse(JSON.parse(manifestBytes.toString("utf8")));
  const terminalCfg = manifest.composition.selections[0]!.config.terminal;
  const keyBytes = await readNativeRuntimeReference(terminalCfg.private_key_ref, 16384);
  const private_key = await importPKCS8(keyBytes.toString("utf8"), "EdDSA"); keyBytes.fill(0);
  const row = JSON.parse((await readPinned(rowPath, rowSha, 65536)).toString("utf8"));
  const limits = { request_bytes: 32768, response_bytes: 32768 };
  const result = await mintArchivedUnsentFrameTerminal({
    row, mint, limits, now_s: Math.floor(Date.now() / 1000),
    terminal: { issuer: terminalCfg.issuer, audience: terminalCfg.audience, key_id: terminalCfg.key_id, private_key, ttl_seconds: terminalCfg.ttl_seconds },
    expect: { source_digest: val("--expect-source-digest"), binding_digest: val("--expect-binding-digest") },
  });
  if (check) { process.stdout.write(JSON.stringify({ mode: "CHECK", checked: result.checked }) + "\n"); return; }
  const dir = abs(val("--out-dir")), out: Record<string, string> = {};
  for (const [name, doc] of [["recovery-request-status.json", result.status_request], ["recovery-request-resolve.json", result.resolve_request]] as const) {
    const bytes = Buffer.from(JSON.stringify(doc), "utf8");
    await writeFile(join(dir, name), bytes, { flag: "wx", mode: 0o600 });
    out[name] = createHash("sha256").update(bytes).digest("hex");
  }
  // Hash of everything EXCEPT the signed terminal: what a reviewer can pin before the 60-second terminal exists.
  process.stdout.write(JSON.stringify({ mode: "MINT", checked: result.checked, files_sha256: out, iat: result.iat, exp: result.exp,
    receipt_id: result.receipt_id, receipt_digest: result.receipt_digest, unsigned_base_sha256: result.checked.stable_core_digest }) + "\n");
}
void main().catch(error => {
  const code = error instanceof NativeArchiveTerminalError ? error.code
    : error instanceof Error && /^NATIVE_ARCHIVE_TERMINAL_[A-Z_]+$/.test(error.message) ? error.message : "NATIVE_ARCHIVE_TERMINAL_FAILED";
  process.stderr.write(JSON.stringify({ code }) + "\n");
  process.exitCode = 1;
});
