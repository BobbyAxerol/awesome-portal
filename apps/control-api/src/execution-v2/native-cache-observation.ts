/** PRIVATE, UNMOUNTED, OPERATOR-ONLY native cache observation (BE-P22).
 *
 * Pure builder / keyed hasher / redaction / sinks. It imports NO shared source
 * file and is wired into nothing: until the one-writer patch in
 * BE-P22-native-cache-observation.md is applied it has zero runtime effect.
 *
 * What it is: one bounded record per native finite READ that correlates the
 * ACTUAL cache branch (HIT / MISS / COALESCED), a KEYED digest of the cache
 * identity, a KEYED digest of the native epoch, the existing lease / attempt
 * and the existing body digest, plus the NAME of the existing egress witness.
 *
 * What it is not: not authority, not custody, not a receipt, not a browser
 * field, not a diagnostic endpoint. It never holds cached data, the cache
 * identity, the epoch, a cookie / token / key or a response byte. It records no
 * timestamp: a DB phase time is not the physical write time and this record
 * does not pretend to carry one. Observation failure never changes a response.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const NATIVE_CACHE_OBSERVATION_SCHEMA = "portal.native-cache-observation.v1";
export const NATIVE_CACHE_OBSERVATION_MAX_RECORD_BYTES = 768;
export const NATIVE_CACHE_OBSERVATION_MAX_MEMORY_RECORDS = 256;
export const NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES = 1_048_576;

export type NativeCacheState = "HIT" | "MISS" | "COALESCED";
/** The three non-denied results of ExecutionSharedReadRepository.begin(). */
export type NativeCacheAdmissionKind = "CACHE_HIT" | "FOLLOWER" | "LEADER";

/** Existing mapping in ExecutionCurrentSourceProxy.request(): CACHE_HIT -> HIT,
 * FOLLOWER -> COALESCED, LEADER (source fetched) -> MISS. Anything else (DENIED)
 * has no served branch and is refused rather than guessed. */
export function cacheStateOfAdmission(kind: NativeCacheAdmissionKind): NativeCacheState {
  if (kind === "CACHE_HIT") return "HIT";
  if (kind === "FOLLOWER") return "COALESCED";
  if (kind === "LEADER") return "MISS";
  throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_BRANCH_REFUSED");
}

export class NativeCacheObservationError extends Error {
  /** Finite code only; never serialises input, keys, paths or causes. */
  constructor(readonly code: string) { super(code); }
}

const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const sha = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const mac = z.string().regex(/^hmac-sha256:[a-f0-9]{64}$(?![\s\S])/);
const operationId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$(?![\s\S])/);
const cacheState = z.enum(["HIT", "MISS", "COALESCED"]);

const captureSchema = z.object({ cache_state: cacheState, cache_identity: sha }).strict();
export type NativeCacheBranchCapture = Readonly<z.infer<typeof captureSchema>>;

/* ---------- in-process carrier (never serialised, never on the DTO) ---------- */

const carried = new WeakMap<object, NativeCacheBranchCapture>();

/** Attach the branch to the source-side response object. The WeakMap is not
 * reachable from JSON.stringify / structuredClone / spread, so the safe DTO and
 * every cache key are unchanged. Strict: throws on a malformed capture. */
export function captureCacheBranch<T>(target: T, capture: NativeCacheBranchCapture): T {
  const parsed = captureSchema.safeParse(capture);
  if (!parsed.success || typeof target !== "object" || target === null)
    throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_CAPTURE_REFUSED");
  carried.set(target, Object.freeze({ ...parsed.data }));
  return target;
}
/** The call the proxy makes in the read path: it can NEVER throw, so a bad
 * capture is dropped silently and the served response is untouched. */
export function noteCacheBranch<T>(target: T, capture: NativeCacheBranchCapture): T {
  try { captureCacheBranch(target, capture); } catch { /* observation only */ }
  return target;
}
/** Move the capture from the source-side object to the object that is actually
 * delivered. Identity-bound: only the exact object it was captured on. Never
 * throws; a non-object on either side is a no-op. */
export function carryCacheBranch(from: unknown, to: unknown): void {
  if (typeof from !== "object" || from === null || typeof to !== "object" || to === null || from === to) return;
  const capture = carried.get(from);
  if (capture) { carried.set(to, capture); carried.delete(from); }
}
/** One-shot: a second take, or a take on any other object, yields undefined. */
export function takeCacheBranch(target: unknown): NativeCacheBranchCapture | undefined {
  if (typeof target !== "object" || target === null) return undefined;
  const capture = carried.get(target);
  carried.delete(target);
  return capture;
}

/* ---------- record ---------- */

export type NativeCacheEgressPhase = "SERVED" | "ABORTED" | "UNKNOWN";
/** Existing evidence names, never invented here. UNKNOWN has no witness. */
const EGRESS_EVIDENCE = {
  SERVED: "FINAL_HTTP_SEND_COMPLETED",
  ABORTED: "FINAL_HTTP_ABORT_CONFIRMED",
  UNKNOWN: "NO_FINAL_WITNESS",
} as const;

const recordSchema = z.object({
  schema_version: z.literal(NATIVE_CACHE_OBSERVATION_SCHEMA),
  lease_id: uuid, attempt_id: uuid, operation_id: operationId,
  cache_state: cacheState,
  cache_identity_mac: mac, native_epoch_mac: mac,
  body_digest: sha,
  egress_evidence_kind: z.enum(["FINAL_HTTP_SEND_COMPLETED", "FINAL_HTTP_ABORT_CONFIRMED", "NO_FINAL_WITNESS"]),
  egress_semantics: z.literal("LOCAL_CORE_HTTP_EGRESS_ONLY"),
}).strict();
export type NativeCacheObservationRecord = Readonly<z.infer<typeof recordSchema>>;

const inputSchema = z.object({
  lease_id: uuid, attempt_id: uuid, operation_id: operationId,
  capture: captureSchema,
  native_epoch_digest: sha, body_digest: sha,
  egress_phase: z.enum(["SERVED", "ABORTED", "UNKNOWN"]),
}).strict();
export type NativeCacheObservationInput = z.input<typeof inputSchema>;

function keyed(key: Buffer, domain: string, value: string): string {
  return `hmac-sha256:${createHmac("sha256", key).update(`${NATIVE_CACHE_OBSERVATION_SCHEMA}\0${domain}\0${value}`, "utf8").digest("hex")}`;
}
function assertKey(key: Buffer): void {
  // A 32-byte random key. Refuse the degenerate keys a config slip produces.
  if (!Buffer.isBuffer(key) || key.length < 32 || key.every(byte => byte === key[0]))
    throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_KEY_REFUSED");
}
const FORBIDDEN_FIELD = /secret|token|cookie|jwt|password|authorization|private|base_body|bearer|session|key(?!ed)/i;

export function buildNativeCacheObservation(key: Buffer, input: NativeCacheObservationInput): NativeCacheObservationRecord {
  assertKey(key);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_INPUT_REFUSED");
  const v = parsed.data;
  const record = recordSchema.parse({
    schema_version: NATIVE_CACHE_OBSERVATION_SCHEMA,
    lease_id: v.lease_id, attempt_id: v.attempt_id, operation_id: v.operation_id,
    cache_state: v.capture.cache_state,
    // The N21 cache key already folds in the native epoch, so a revoke changes
    // both MACs. The MAC is deterministic under one key: same identity -> same
    // MAC across requests (HIT/MISS/COALESCED share it), never reversible.
    cache_identity_mac: keyed(key, "cache-identity", v.capture.cache_identity),
    native_epoch_mac: keyed(key, "native-epoch", v.native_epoch_digest),
    body_digest: v.body_digest,
    egress_evidence_kind: EGRESS_EVIDENCE[v.egress_phase],
    egress_semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY",
  });
  if (Object.keys(record).some(name => FORBIDDEN_FIELD.test(name)) ||
    Buffer.byteLength(JSON.stringify(record), "utf8") > NATIVE_CACHE_OBSERVATION_MAX_RECORD_BYTES)
    throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_RECORD_REFUSED");
  return Object.freeze(record);
}

/** Operator-side check for a claimed identity (e.g. "was this the same cache
 * entry as that other lease?"). Recomputes the MAC; constant-time compare. */
export function nativeCacheIdentityMatches(key: Buffer, record: NativeCacheObservationRecord, cacheIdentity: string): boolean {
  assertKey(key);
  const expected = Buffer.from(keyed(key, "cache-identity", cacheIdentity));
  const actual = Buffer.from(record.cache_identity_mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ---------- sinks (no list / enumerate API by construction) ---------- */

export interface NativeCacheObservationSink {
  append(record: NativeCacheObservationRecord): void | Promise<void>;
  /** Exact (lease_id, attempt_id) pair only; a lease_id alone finds nothing. */
  find(leaseId: string, attemptId: string): NativeCacheObservationRecord | undefined | Promise<NativeCacheObservationRecord | undefined>;
}

export class MemoryNativeCacheObservationSink implements NativeCacheObservationSink {
  readonly #records = new Map<string, NativeCacheObservationRecord>();
  append(record: NativeCacheObservationRecord): void {
    const checked = recordSchema.parse(record);
    this.#records.set(`${checked.lease_id}\0${checked.attempt_id}`, Object.freeze(checked));
    while (this.#records.size > NATIVE_CACHE_OBSERVATION_MAX_MEMORY_RECORDS)
      this.#records.delete(this.#records.keys().next().value as string);
  }
  find(leaseId: string, attemptId: string): NativeCacheObservationRecord | undefined {
    return this.#records.get(`${leaseId}\0${attemptId}`);
  }
}

const KEY_FILE = "observation.key", LOG_FILE = "observation.jsonl";
function privateDirectory(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  // Operator-only: our own, not a symlink, no group/other access.
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && stat.uid !== process.getuid()))
    throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_DIRECTORY_REFUSED");
}
function privateFileStat(fd: number): void {
  const stat = fstatSync(fd);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && stat.uid !== process.getuid()))
    throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_FILE_REFUSED");
}

/** Load (or, with create, mint) the 32-byte MAC key next to the log. The key
 * never enters a record, a log line, an error or a return value other than
 * this Buffer. */
export function loadNativeCacheObservationKey(dir: string, create: boolean): Buffer {
  privateDirectory(dir);
  const path = join(dir, KEY_FILE);
  if (create) {
    try {
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { writeSync(fd, randomBytes(32)); } finally { closeSync(fd); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_KEY_REFUSED");
    }
  }
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch { throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_KEY_REFUSED"); }
  try {
    privateFileStat(fd);
    const key = readFileSync(fd);
    assertKey(key);
    return key;
  } finally { closeSync(fd); }
}

/** Append-only JSONL under an operator-private directory (0700 / 0600). Bounded:
 * once the file reaches the cap new observations are dropped (best effort, never
 * custody) rather than growing without limit. */
export class FileNativeCacheObservationSink implements NativeCacheObservationSink {
  readonly #path: string;
  constructor(dir: string) { privateDirectory(dir); this.#path = join(dir, LOG_FILE); }
  append(record: NativeCacheObservationRecord): void {
    const line = `${JSON.stringify(recordSchema.parse(record))}\n`;
    const fd = openSync(this.#path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    try {
      privateFileStat(fd);
      if (fstatSync(fd).size + Buffer.byteLength(line) > NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES)
        throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_LOG_FULL");
      writeSync(fd, line);
    } finally { closeSync(fd); }
  }
  find(leaseId: string, attemptId: string): NativeCacheObservationRecord | undefined {
    let fd: number;
    try { fd = openSync(this.#path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { return undefined; }
    try {
      privateFileStat(fd);
      let found: NativeCacheObservationRecord | undefined;
      for (const line of readFileSync(fd, "utf8").split("\n")) {
        if (!line) continue;
        const parsed = recordSchema.safeParse(JSON.parse(line));
        if (parsed.success && parsed.data.lease_id === leaseId && parsed.data.attempt_id === attemptId) found = parsed.data;
      }
      return found;
    } finally { closeSync(fd); }
  }
}

/* ---------- request-side observer (what the wiring calls) ---------- */

export type NativeCacheRecordOutcome =
  | { recorded: true }
  | { recorded: false; reason: "BUILD_REFUSED" | "SINK_FAILED" };

export class NativeCacheObserver {
  readonly #key: Buffer;
  readonly #sink: NativeCacheObservationSink;
  constructor(key: Buffer, sink: NativeCacheObservationSink) {
    assertKey(key);
    this.#key = Buffer.from(key);
    this.#sink = sink;
  }
  /** Never throws and never alters the response: a refused build or a failing
   * sink is a finite reason code, not an exception. Call AFTER delivery. */
  async record(input: NativeCacheObservationInput): Promise<NativeCacheRecordOutcome> {
    let record: NativeCacheObservationRecord;
    try { record = buildNativeCacheObservation(this.#key, input); }
    catch { return { recorded: false, reason: "BUILD_REFUSED" }; }
    try { await this.#sink.append(record); return { recorded: true }; }
    catch { return { recorded: false, reason: "SINK_FAILED" }; }
  }
}

/* ---------- operator receipt: observation x existing durable custody row ---------- */

/** Bounded projection of EXISTING native_read_obligations columns. Never
 * base_body, cookies, session tokens, source-terminal JWTs or signing inputs. */
export const nativeCacheObligationProjectionSchema = z.object({
  lease_id: uuid, attempt_id: uuid,
  phase: z.enum(["ADMITTED", "SENDING", "UNKNOWN", "SERVED", "ABORTED", "CANCELLED"]),
  body_digest: sha.nullable(), receipt_digest: sha.nullable(),
  source_ack_digest: sha.nullable(), source_reconciled: z.boolean(),
}).strict();
export type NativeCacheObligationProjection = z.infer<typeof nativeCacheObligationProjectionSchema>;

export interface NativeCacheOperatorReceipt {
  schema_version: "portal.native-cache-observation-receipt.v1";
  observation: NativeCacheObservationRecord;
  custody: NativeCacheObligationProjection;
  checks: { lease_attempt_match: boolean; body_digest_match: boolean; egress_phase_consistent: boolean };
  verdict: "CORRELATED" | "MISMATCH";
}

export function correlateNativeCacheObservation(record: NativeCacheObservationRecord,
  custody: unknown): NativeCacheOperatorReceipt {
  const row = nativeCacheObligationProjectionSchema.safeParse(custody);
  if (!row.success) throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_CUSTODY_REFUSED");
  const c = row.data;
  const checks = {
    lease_attempt_match: c.lease_id === record.lease_id && c.attempt_id === record.attempt_id,
    body_digest_match: c.body_digest !== null && c.body_digest === record.body_digest,
    // The durable terminal (not the in-process observation) is the authority
    // for SERVED / ABORTED; "NO_FINAL_WITNESS" matches any non-terminal phase.
    egress_phase_consistent:
      record.egress_evidence_kind === "FINAL_HTTP_SEND_COMPLETED" ? c.phase === "SERVED"
      : record.egress_evidence_kind === "FINAL_HTTP_ABORT_CONFIRMED" ? c.phase === "ABORTED"
      : !["SERVED", "ABORTED"].includes(c.phase),
  };
  return Object.freeze({
    schema_version: "portal.native-cache-observation-receipt.v1" as const,
    observation: record, custody: c, checks,
    verdict: Object.values(checks).every(Boolean) ? "CORRELATED" as const : "MISMATCH" as const,
  });
}
