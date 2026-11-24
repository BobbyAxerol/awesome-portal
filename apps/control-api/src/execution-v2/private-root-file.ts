/** PRIVATE OWNER MAINTENANCE file boundary shared by the offline Core009 tools
 * (owner policy installer, manager-domain revoke, acceptance session issuer and
 * revoke). No controller, no URL, no credential. The caller supplies an absolute
 * path and the independently approved SHA-256; the bytes are returned only when
 * the file is a root-owned 0600 regular file, never a symlink, unchanged between
 * lstat/open/fstat, within the size cap, and hash-equal to the pin. Every refusal
 * is the same opaque Error: no path, size, owner or hash is ever echoed. */
import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";

export const PRIVATE_FILE_MAX_BYTES = 131072;
const REFUSED = (): never => { throw new Error("invalid"); };

export async function readRootOwnedPinnedFile(path: string, approvedSha256: string,
  maximumBytes: number = PRIVATE_FILE_MAX_BYTES): Promise<Buffer> {
  if (!path.startsWith("/") || !/^[0-9a-f]{64}$/.test(approvedSha256) || !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 || maximumBytes > PRIVATE_FILE_MAX_BYTES) return REFUSED();
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== 0 || (before.mode & 0o7777) !== 0o600 ||
    before.size < 1 || before.size > maximumBytes) return REFUSED();
  // A replaceable parent can swap the checked regular file for a FIFO between
  // lstat and open. Do not wait for a writer before fstat can reject that race.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let raw: Buffer;
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.uid !== 0 || (actual.mode & 0o7777) !== 0o600 ||
      actual.dev !== before.dev || actual.ino !== before.ino || actual.size !== before.size) return REFUSED();
    const buffer = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const part = await file.read(buffer, length, buffer.length - length, null);
      if (part.bytesRead === 0) break;
      length += part.bytesRead;
    }
    raw = buffer.subarray(0, length);
    if (raw.length !== actual.size || raw.length > maximumBytes) return REFUSED();
  } finally { await file.close(); }
  if (createHash("sha256").update(raw).digest("hex") !== approvedSha256) return REFUSED();
  return raw;
}

/** Operator window of ONE use of a private artifact: finite and at most 24 h. */
export const OWNER_ARTIFACT_MAX_WINDOW_MS = 86_400_000;
export interface OwnerArtifactCliArguments {
  artifact: string; sha256: string; notBeforeMs: number; notAfterMs: number; dryRun: boolean;
}
/** Pure argv parser shared by the offline owner CLIs. Everything is validated BEFORE
 * any file or database is touched; unknown flags, missing values and non-finite
 * windows are usage errors (the thrown message is the fixed token OWNER_ARTIFACT_USAGE). */
export function parseOwnerArtifactArgs(argv: readonly string[]): OwnerArtifactCliArguments {
  const values = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") { dryRun = true; continue; }
    if (!["--artifact", "--sha256", "--not-before-ms", "--not-after-ms"].includes(a) || values.has(a) || i + 1 >= argv.length)
      throw new Error("OWNER_ARTIFACT_USAGE");
    values.set(a, argv[++i]!);
  }
  const artifact = values.get("--artifact"), sha256 = values.get("--sha256");
  const beforeText = values.get("--not-before-ms") ?? "", afterText = values.get("--not-after-ms") ?? "";
  const before = Number(beforeText), after = Number(afterText);
  if (!artifact?.startsWith("/") || !sha256 || !/^[0-9a-f]{64}$/.test(sha256) || !/^[0-9]+$/.test(beforeText) ||
    !/^[0-9]+$/.test(afterText) || !Number.isSafeInteger(before) || !Number.isSafeInteger(after) ||
    before >= after || after - before > OWNER_ARTIFACT_MAX_WINDOW_MS) throw new Error("OWNER_ARTIFACT_USAGE");
  return { artifact, sha256, notBeforeMs: before, notAfterMs: after, dryRun };
}

/** One reviewed compact JSON spelling: duplicate keys, whitespace variants,
 * invalid-UTF-8 replacement and trailing bytes cannot normalize silently. */
export function parseCompactJson(raw: Uint8Array): unknown {
  const parsed: unknown = JSON.parse(Buffer.from(raw).toString("utf8"));
  if (Buffer.from(JSON.stringify(parsed), "utf8").compare(Buffer.from(raw)) !== 0) return REFUSED();
  return parsed;
}
