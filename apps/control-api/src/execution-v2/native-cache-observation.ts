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
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, writeSync } from "node:fs";
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

/** What the in-process delivery/recovery RETURN carried, nothing more.
 * NOT_OBSERVED_IN_RETURN is the honest answer when the return has no terminal
 * phase (the real RECONCILED return, or a recovery that threw): it is NOT a
 * claim that no final witness exists. The durable projection decides at the
 * private operator join. */
export type NativeCacheEgressPhase = "SERVED" | "ABORTED" | "UNKNOWN" | "NOT_OBSERVED_IN_RETURN";
/** Existing evidence names, never invented here. UNKNOWN has no witness. */
const EGRESS_EVIDENCE = {
  SERVED: "FINAL_HTTP_SEND_COMPLETED",
  ABORTED: "FINAL_HTTP_ABORT_CONFIRMED",
  UNKNOWN: "NO_FINAL_WITNESS",
  NOT_OBSERVED_IN_RETURN: "EGRESS_NOT_OBSERVED_IN_RETURN",
} as const;

/** Maps the structural shape of `NativeHTTPRecovery` (current-human-candidate)
 * without importing it. Only a TERMINAL return with a SERVED/ABORTED phase is a
 * witness; UNKNOWN / UNSENT_FENCED are explicitly unsettled; RECONCILED (which
 * the real code returns WITHOUT a phase after recording the source ACK) and a
 * missing return are "not observed in return". Never throws, never guesses. */
export function egressPhaseOfRecovery(recovery: unknown): NativeCacheEgressPhase {
  if (typeof recovery !== "object" || recovery === null) return "NOT_OBSERVED_IN_RETURN";
  const { state, phase } = recovery as { state?: unknown; phase?: unknown };
  if (state === "TERMINAL") return phase === "SERVED" || phase === "ABORTED" ? phase : "NOT_OBSERVED_IN_RETURN";
  if (state === "UNKNOWN" || state === "UNSENT_FENCED") return "UNKNOWN";
  return "NOT_OBSERVED_IN_RETURN";
}

const recordSchema = z.object({
  schema_version: z.literal(NATIVE_CACHE_OBSERVATION_SCHEMA),
  lease_id: uuid, attempt_id: uuid, operation_id: operationId,
  cache_state: cacheState,
  cache_identity_mac: mac, native_epoch_mac: mac,
  body_digest: sha,
  egress_evidence_kind: z.enum(["FINAL_HTTP_SEND_COMPLETED", "FINAL_HTTP_ABORT_CONFIRMED", "NO_FINAL_WITNESS", "EGRESS_NOT_OBSERVED_IN_RETURN"]),
  egress_semantics: z.literal("LOCAL_CORE_HTTP_EGRESS_ONLY"),
}).strict();
export type NativeCacheObservationRecord = Readonly<z.infer<typeof recordSchema>>;

const inputSchema = z.object({
  lease_id: uuid, attempt_id: uuid, operation_id: operationId,
  capture: captureSchema,
  native_epoch_digest: sha, body_digest: sha,
  egress_phase: z.enum(["SERVED", "ABORTED", "UNKNOWN", "NOT_OBSERVED_IN_RETURN"]),
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
/** `create=false` (operator read) never creates a directory: a missing one is a refusal. */
function privateDirectory(dir: string, create = true): void {
  let stat;
  try {
    if (create) mkdirSync(dir, { recursive: true, mode: 0o700 });
    stat = lstatSync(dir);
  } catch { throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_DIRECTORY_REFUSED"); }
  // Operator-only: our own, not a symlink, no group/other access.
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && stat.uid !== process.getuid()))
    throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_DIRECTORY_REFUSED");
}
const KEY_BYTES = 32;
function refused(code: string): never { throw new NativeCacheObservationError(code); }
/** Descriptor-level guards: regular file, current owner, no group/other access,
 * exactly one link (a hard link to a file outside the private directory is
 * refused). Returns the size observed on THIS descriptor. */
function privateFileStat(fd: number): number {
  const stat = fstatSync(fd);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.nlink !== 1 ||
    (typeof process.getuid === "function" && stat.uid !== process.getuid()))
    refused("NATIVE_CACHE_OBSERVATION_FILE_REFUSED");
  return stat.size;
}
/** Read at most `max` bytes from the descriptor. It reads into a buffer of
 * max+1 and never grows it, so a file that grew after fstat cannot make this
 * allocate or return more than the cap: one extra byte is proof of overflow
 * and is refused, not truncated. */
export function readDescriptorBounded(fd: number, max: number, code: string): Buffer {
  const buffer = Buffer.allocUnsafe(max + 1);
  let filled = 0;
  while (filled < buffer.length) {
    const n = readSync(fd, buffer, filled, buffer.length - filled, null);
    if (n === 0) break;
    filled += n;
  }
  if (filled > max) refused(code);
  return buffer.subarray(0, filled);
}
function openRefusing(path: string, flags: number, mode: number | undefined, code: string): number {
  try { return mode === undefined ? openSync(path, flags) : openSync(path, flags, mode); }
  catch { return refused(code); }
}

/** Load (or, with create, mint) the 32-byte MAC key next to the log. The key
 * never enters a record, a log line, an error or a return value other than
 * this Buffer. An existing key is NEVER replaced: a wrong-sized, linked or
 * loose file is refused, and the file is left exactly as found. */
export function loadNativeCacheObservationKey(dir: string, create: boolean): Buffer {
  privateDirectory(dir, create);
  const path = join(dir, KEY_FILE);
  if (create) {
    try {
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { writeSync(fd, randomBytes(KEY_BYTES)); } finally { closeSync(fd); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") refused("NATIVE_CACHE_OBSERVATION_KEY_REFUSED");
    }
  }
  const fd = openRefusing(path, constants.O_RDONLY | constants.O_NOFOLLOW, undefined, "NATIVE_CACHE_OBSERVATION_KEY_REFUSED");
  try {
    // Size is validated on the opened descriptor BEFORE any read.
    if (privateFileStat(fd) !== KEY_BYTES) refused("NATIVE_CACHE_OBSERVATION_KEY_REFUSED");
    const key = readDescriptorBounded(fd, KEY_BYTES, "NATIVE_CACHE_OBSERVATION_KEY_REFUSED");
    if (key.length !== KEY_BYTES) refused("NATIVE_CACHE_OBSERVATION_KEY_REFUSED");
    assertKey(key);
    return key;
  } finally { closeSync(fd); }
}

/** Append-only JSONL under an operator-private directory (0700 / 0600). Bounded:
 * once the file reaches the cap new observations are dropped (best effort, never
 * custody) rather than growing without limit. A log over the cap is refused, not
 * truncated, deleted or rotated: the operator decides. */
export class FileNativeCacheObservationSink implements NativeCacheObservationSink {
  readonly #path: string;
  /** `create:false` is the operator READ mode: it never creates the directory. */
  constructor(dir: string, options: { create?: boolean } = {}) {
    privateDirectory(dir, options.create !== false);
    this.#path = join(dir, LOG_FILE);
  }
  append(record: NativeCacheObservationRecord): void {
    const line = `${JSON.stringify(recordSchema.parse(record))}\n`;
    const fd = openRefusing(this.#path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600,
      "NATIVE_CACHE_OBSERVATION_FILE_REFUSED");
    try {
      if (privateFileStat(fd) + Buffer.byteLength(line) > NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES)
        refused("NATIVE_CACHE_OBSERVATION_LOG_FULL");
      writeSync(fd, line);
    } finally { closeSync(fd); }
  }
  find(leaseId: string, attemptId: string): NativeCacheObservationRecord | undefined {
    let fd: number;
    try { fd = openSync(this.#path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) {
      // Only "no log yet" is an empty answer; a symlink or any other failure is a refusal.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      return refused("NATIVE_CACHE_OBSERVATION_FILE_REFUSED");
    }
    try {
      if (privateFileStat(fd) > NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES) refused("NATIVE_CACHE_OBSERVATION_LOG_OVERSIZE");
      const text = readDescriptorBounded(fd, NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES, "NATIVE_CACHE_OBSERVATION_LOG_OVERSIZE").toString("utf8");
      let found: NativeCacheObservationRecord | undefined;
      for (const line of text.split("\n")) {
        if (!line) continue;
        let json: unknown;
        try { json = JSON.parse(line); } catch { continue; } // a torn/foreign line proves nothing
        const parsed = recordSchema.safeParse(json);
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
  /** What the DURABLE row says about final egress, independent of what the
   * in-process return carried. NO_TERMINAL = not (yet) SERVED/ABORTED. */
  durable_egress: "SERVED" | "ABORTED" | "NO_TERMINAL";
  verdict: "CORRELATED" | "MISMATCH";
}

/** The durable row is the authority for SERVED / ABORTED; the in-process
 * observation only has to not contradict it.
 *  - FINAL_HTTP_SEND_COMPLETED  needs durable SERVED  (+ terminal receipt digest)
 *  - FINAL_HTTP_ABORT_CONFIRMED needs durable ABORTED (+ terminal receipt digest)
 *  - NO_FINAL_WITNESS           the return was explicitly UNKNOWN/UNSENT_FENCED:
 *                               a durable terminal contradicts it
 *  - EGRESS_NOT_OBSERVED_IN_RETURN makes NO claim (e.g. the real RECONCILED
 *                               return has no phase): a durable SERVED/ABORTED
 *                               is accepted as the witness, a non-terminal row
 *                               is accepted as "no terminal yet". */
export function correlateNativeCacheObservation(record: NativeCacheObservationRecord,
  custody: unknown): NativeCacheOperatorReceipt {
  const row = nativeCacheObligationProjectionSchema.safeParse(custody);
  if (!row.success) throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_CUSTODY_REFUSED");
  const c = row.data;
  const durable = c.phase === "SERVED" || c.phase === "ABORTED" ? c.phase : "NO_TERMINAL" as const;
  // A durable terminal row always carries its immutable receipt digest.
  const terminalReceiptPresent = durable === "NO_TERMINAL" || c.receipt_digest !== null;
  const checks = {
    lease_attempt_match: c.lease_id === record.lease_id && c.attempt_id === record.attempt_id,
    body_digest_match: c.body_digest !== null && c.body_digest === record.body_digest,
    egress_phase_consistent: terminalReceiptPresent && (
      record.egress_evidence_kind === "FINAL_HTTP_SEND_COMPLETED" ? durable === "SERVED"
      : record.egress_evidence_kind === "FINAL_HTTP_ABORT_CONFIRMED" ? durable === "ABORTED"
      : record.egress_evidence_kind === "NO_FINAL_WITNESS" ? durable === "NO_TERMINAL"
      : true),
  };
  return Object.freeze({
    schema_version: "portal.native-cache-observation-receipt.v1" as const,
    observation: record, custody: c, checks, durable_egress: durable,
    verdict: Object.values(checks).every(Boolean) ? "CORRELATED" as const : "MISMATCH" as const,
  });
}

/* ---------- the ONE bounded operator join (used by cli/execution-native-cache-observation.ts) ---------- */

/** The 7 existing obligation columns, nothing else: never base_body, cookies,
 * session tokens, source-terminal JWTs, signing/TLS inputs or any other column.
 * Exact (lease_id, attempt_id) equality on indexed unique keys: it can return at
 * most one row, so there is no list / range / enumerate form of this query. */
export const NATIVE_CACHE_OBLIGATION_COLUMNS = ["lease_id", "attempt_id", "phase", "body_digest",
  "receipt_digest", "source_ack_digest", "source_reconciled"] as const;
export const NATIVE_CACHE_OBLIGATION_SQL =
  `SELECT ${NATIVE_CACHE_OBLIGATION_COLUMNS.join(", ")} FROM elp210_candidate.native_read_obligations WHERE lease_id = $1 AND attempt_id = $2`;

const joinKeySchema = z.object({ lease_id: uuid, attempt_id: uuid }).strict();

export type NativeCacheJoinResult =
  | NativeCacheOperatorReceipt
  | { schema_version: "portal.native-cache-observation-receipt.v1"; verdict: "NO_OBSERVATION" }
  | { schema_version: "portal.native-cache-observation-receipt.v1"; verdict: "NO_CUSTODY_ROW"; observation: NativeCacheObservationRecord };

/** `readObligation` is an injected, caller-bounded read-only fetch that MUST run
 * NATIVE_CACHE_OBLIGATION_SQL with exactly these two parameters. A missing
 * observation is reported as such (it proves nothing about the cache); a missing
 * custody row is reported, never synthesised; more than one row is refused. */
export async function joinNativeCacheObservation(sink: NativeCacheObservationSink,
  readObligation: (leaseId: string, attemptId: string) => Promise<readonly unknown[]>,
  leaseId: string, attemptId: string): Promise<NativeCacheJoinResult> {
  const key = joinKeySchema.safeParse({ lease_id: leaseId, attempt_id: attemptId });
  if (!key.success) throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_JOIN_KEY_REFUSED");
  const observation = await sink.find(key.data.lease_id, key.data.attempt_id);
  const schema_version = "portal.native-cache-observation-receipt.v1" as const;
  if (!observation) return { schema_version, verdict: "NO_OBSERVATION" };
  const rows = await readObligation(key.data.lease_id, key.data.attempt_id);
  if (rows.length > 1) throw new NativeCacheObservationError("NATIVE_CACHE_OBSERVATION_CUSTODY_REFUSED");
  if (rows.length === 0) return { schema_version, verdict: "NO_CUSTODY_ROW", observation };
  return correlateNativeCacheObservation(observation, rows[0]);
}
