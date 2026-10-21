/** BE-P22 private native cache observation: observer LOGIC only.
 * The admission fixture below is SYNTHETIC. It proves the HIT / MISS /
 * COALESCED distinction, hashing, redaction, isolation and bounds of the
 * observer; it is NOT connected source acceptance and exercises no DB, no
 * proxy, no egress and no Core session. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sharedReadIdentity, type SharedReadScope } from "../src/execution/shared-read.repository";
import {
  FileNativeCacheObservationSink, MemoryNativeCacheObservationSink, NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES,
  NATIVE_CACHE_OBSERVATION_MAX_MEMORY_RECORDS, NATIVE_CACHE_OBSERVATION_MAX_RECORD_BYTES, NativeCacheObserver,
  NativeCacheObservationError, buildNativeCacheObservation, cacheStateOfAdmission, captureCacheBranch,
  carryCacheBranch, correlateNativeCacheObservation, egressPhaseOfRecovery, loadNativeCacheObservationKey,
  nativeCacheIdentityMatches, noteCacheBranch, readDescriptorBounded,
  takeCacheBranch, type NativeCacheAdmissionKind, type NativeCacheObservationInput,
  type NativeCacheObservationRecord, type NativeCacheState,
} from "../src/execution-v2/native-cache-observation";
import type { NativeHTTPRecovery } from "../src/execution-v2/current-human-candidate";

const sha = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const KEY = randomBytes(32);
const EPOCH_A = sha("epoch-A"), EPOCH_B = sha("epoch-B-after-revoke");
const scope = (nativeEpochDigest: string): SharedReadScope => ({
  sourceId: "manager-v2", profileId: "PAPER_PROFILE", workspaceId: "ws-1", principalId: "user-1",
  principalRole: "owner", adapterRevision: "rev1", requestPath: "/v1/relations/deployments?limit=100",
  nativeEpochDigest,
});

/** Synthetic stand-in for ExecutionSharedReadRepository.begin()/complete():
 * LEADER first, FOLLOWER while the leader is in flight, CACHE_HIT afterwards.
 * The cache key comes from the REAL sharedReadIdentity(). */
class SyntheticSharedRead {
  readonly #cached = new Set<string>();
  readonly #inflight = new Set<string>();
  begin(s: SharedReadScope): { kind: NativeCacheAdmissionKind; cacheKey: string } {
    const { cacheKey } = sharedReadIdentity(s);
    if (this.#cached.has(cacheKey)) return { kind: "CACHE_HIT", cacheKey };
    if (this.#inflight.has(cacheKey)) return { kind: "FOLLOWER", cacheKey };
    this.#inflight.add(cacheKey);
    return { kind: "LEADER", cacheKey };
  }
  complete(cacheKey: string) { this.#inflight.delete(cacheKey); this.#cached.add(cacheKey); }
  fail(cacheKey: string) { this.#inflight.delete(cacheKey); }
}

const input = (state: NativeCacheState, cacheIdentity: string, epoch = EPOCH_A, extra: Partial<NativeCacheObservationInput> = {}): NativeCacheObservationInput => ({
  lease_id: randomUUID(), attempt_id: randomUUID(), operation_id: "portal.execution.maximum-data.deployment-page",
  capture: { cache_state: state, cache_identity: cacheIdentity }, native_epoch_digest: epoch,
  body_digest: sha(`body-${randomUUID()}`), egress_phase: "SERVED", ...extra,
});
const dirs: string[] = [];
const tempDir = () => { const d = mkdtempSync(join(tmpdir(), "native-cache-obs-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("actual cache branch: HIT vs MISS vs COALESCED (synthetic admission fixture)", () => {
  it("derives the state from the admission kind, not from call order or repetition", () => {
    const shared = new SyntheticSharedRead();
    const leader = shared.begin(scope(EPOCH_A));
    const follower = shared.begin(scope(EPOCH_A));
    shared.complete(leader.cacheKey);
    const hit = shared.begin(scope(EPOCH_A));
    expect([leader.kind, follower.kind, hit.kind]).toEqual(["LEADER", "FOLLOWER", "CACHE_HIT"]);
    expect([leader, follower, hit].map(a => cacheStateOfAdmission(a.kind))).toEqual(["MISS", "COALESCED", "HIT"]);

    const records = [leader, follower, hit].map(a => buildNativeCacheObservation(KEY,
      input(cacheStateOfAdmission(a.kind), a.cacheKey)));
    expect(records.map(r => r.cache_state)).toEqual(["MISS", "COALESCED", "HIT"]);
    // One cache entry => one keyed identity across all three branches.
    expect(new Set(records.map(r => r.cache_identity_mac)).size).toBe(1);
  });

  it("a repeated GET is not a HIT receipt: a failed leader makes the retry MISS again", () => {
    const shared = new SyntheticSharedRead();
    const first = shared.begin(scope(EPOCH_A));
    shared.fail(first.cacheKey);
    const retry = shared.begin(scope(EPOCH_A));
    expect(cacheStateOfAdmission(retry.kind)).toBe("MISS");
  });

  it("refuses a DENIED / unknown admission instead of guessing a branch", () => {
    expect(() => cacheStateOfAdmission("DENIED" as NativeCacheAdmissionKind)).toThrow(NativeCacheObservationError);
  });

  it("a revoke (new native epoch) lands on a different cache entry and different MACs", () => {
    const shared = new SyntheticSharedRead();
    const before = shared.begin(scope(EPOCH_A));
    shared.complete(before.cacheKey);
    const after = shared.begin(scope(EPOCH_B));
    expect(after.cacheKey).not.toBe(before.cacheKey);
    expect(cacheStateOfAdmission(after.kind)).toBe("MISS"); // old bytes are logically unreachable
    const a = buildNativeCacheObservation(KEY, input("HIT", before.cacheKey, EPOCH_A));
    const b = buildNativeCacheObservation(KEY, input("MISS", after.cacheKey, EPOCH_B));
    expect(b.native_epoch_mac).not.toBe(a.native_epoch_mac);
    expect(b.cache_identity_mac).not.toBe(a.cache_identity_mac);
  });
});

describe("keyed digests", () => {
  const identity = sharedReadIdentity(scope(EPOCH_A)).cacheKey;
  it("never contains the identity or epoch, nor their unkeyed hash", () => {
    const record = buildNativeCacheObservation(KEY, input("HIT", identity));
    const text = JSON.stringify(record);
    for (const forbidden of [identity, identity.slice(7), EPOCH_A, EPOCH_A.slice(7), sha(identity), sha(EPOCH_A), KEY.toString("hex"), KEY.toString("base64")])
      expect(text).not.toContain(forbidden);
    expect(record.cache_identity_mac).toMatch(/^hmac-sha256:[a-f0-9]{64}$/);
    expect(record.native_epoch_mac).toMatch(/^hmac-sha256:[a-f0-9]{64}$/);
    expect(record.cache_identity_mac).not.toBe(record.native_epoch_mac);
  });
  it("is deterministic under one key and unrelated under another", () => {
    const one = buildNativeCacheObservation(KEY, input("HIT", identity));
    const two = buildNativeCacheObservation(KEY, input("MISS", identity));
    const other = buildNativeCacheObservation(randomBytes(32), input("HIT", identity));
    expect(two.cache_identity_mac).toBe(one.cache_identity_mac);
    expect(other.cache_identity_mac).not.toBe(one.cache_identity_mac);
    expect(nativeCacheIdentityMatches(KEY, one, identity)).toBe(true);
    expect(nativeCacheIdentityMatches(KEY, one, sharedReadIdentity(scope(EPOCH_B)).cacheKey)).toBe(false);
    expect(nativeCacheIdentityMatches(randomBytes(32), one, identity)).toBe(false);
  });
  it("refuses short, constant or non-buffer keys", () => {
    for (const bad of [Buffer.alloc(16, 7), Buffer.alloc(32, 0), "x".repeat(40) as unknown as Buffer])
      expect(() => buildNativeCacheObservation(bad, input("HIT", identity))).toThrow(/KEY_REFUSED/);
    expect(() => new NativeCacheObserver(Buffer.alloc(32, 1), new MemoryNativeCacheObservationSink())).toThrow(/KEY_REFUSED/);
  });
});

describe("redaction / absence of secrets", () => {
  const identity = sharedReadIdentity(scope(EPOCH_A)).cacheKey;
  it("rejects any extra, secret-looking or raw-data input field", () => {
    for (const extra of [{ base_body: "{}" }, { cookie: "sid=abc" }, { session_token: "t" }, { authorization: "Bearer x" },
      { response_body: "{}" }, { cache_identity: identity }, { bytes: 10 }, { written_at_ms: 1 }] as unknown[])
      expect(() => buildNativeCacheObservation(KEY, { ...input("HIT", identity), ...(extra as object) })).toThrow(/INPUT_REFUSED/);
    expect(() => buildNativeCacheObservation(KEY, { ...input("HIT", identity), capture: { cache_state: "HIT", cache_identity: identity, etag: "x" } } as never)).toThrow(/INPUT_REFUSED/);
  });
  it("rejects malformed digests, ids and a free-form operation id", () => {
    for (const bad of [{ body_digest: "sha256:zz" }, { lease_id: "not-a-uuid" }, { attempt_id: "A".repeat(36) },
      { operation_id: "x y\nz" }, { native_epoch_digest: "epoch" }, { egress_phase: "FINISHED" as never }])
      expect(() => buildNativeCacheObservation(KEY, { ...input("HIT", identity), ...bad })).toThrow(/INPUT_REFUSED/);
    expect(() => buildNativeCacheObservation(KEY, input("HIT", "raw-cache-identity"))).toThrow(/INPUT_REFUSED/);
    expect(() => buildNativeCacheObservation(KEY, input("STALE" as never, identity))).toThrow(/INPUT_REFUSED/);
  });
  it("record field names carry nothing secret-like and no time that could pass for a write time", () => {
    const names = Object.keys(buildNativeCacheObservation(KEY, input("HIT", identity)));
    expect(names).toEqual(["schema_version", "lease_id", "attempt_id", "operation_id", "cache_state",
      "cache_identity_mac", "native_epoch_mac", "body_digest", "egress_evidence_kind", "egress_semantics"]);
    expect(names.filter(n => /secret|token|cookie|jwt|password|authorization|private|base_body|bearer|session|(^|_)key($|_)|_at|_ms|time|bytes/i.test(n))).toEqual([]);
  });
  it("names the EXISTING egress witness and never calls a local send a browser ACK", () => {
    const kinds = (["SERVED", "ABORTED", "UNKNOWN", "NOT_OBSERVED_IN_RETURN"] as const).map(egress_phase =>
      buildNativeCacheObservation(KEY, input("MISS", identity, EPOCH_A, { egress_phase })));
    expect(kinds.map(r => r.egress_evidence_kind)).toEqual(["FINAL_HTTP_SEND_COMPLETED", "FINAL_HTTP_ABORT_CONFIRMED",
      "NO_FINAL_WITNESS", "EGRESS_NOT_OBSERVED_IN_RETURN"]);
    expect(new Set(kinds.map(r => r.egress_semantics))).toEqual(new Set(["LOCAL_CORE_HTTP_EGRESS_ONLY"]));
  });
  it("the in-process carrier is invisible to the DTO: JSON, spread and structuredClone", () => {
    const dto = { schema_version: "portal.execution.maximum-data.deployment-page.v1", records: [{ a: 1 }] };
    const before = JSON.stringify(dto);
    captureCacheBranch(dto, { cache_state: "HIT", cache_identity: identity });
    expect(JSON.stringify(dto)).toBe(before);
    expect(Object.keys(dto)).toEqual(["schema_version", "records"]);
    expect(takeCacheBranch(structuredClone(dto))).toBeUndefined();
    expect(takeCacheBranch({ ...dto })).toBeUndefined();
    expect(takeCacheBranch(dto)?.cache_state).toBe("HIT");
  });
});

describe("isolation", () => {
  const identity = sharedReadIdentity(scope(EPOCH_A)).cacheKey;
  it("one request's capture cannot be taken through another request's object, and only once", () => {
    const a = { n: "A" }, b = { n: "B" };
    captureCacheBranch(a, { cache_state: "HIT", cache_identity: identity });
    expect(takeCacheBranch(b)).toBeUndefined();
    expect(takeCacheBranch(a)?.cache_state).toBe("HIT");
    expect(takeCacheBranch(a)).toBeUndefined();
  });
  it("carry moves (not copies) the capture to the delivered object only", () => {
    const bff = {}, dto = {}, other = {};
    captureCacheBranch(bff, { cache_state: "COALESCED", cache_identity: identity });
    carryCacheBranch(bff, dto);
    expect(takeCacheBranch(bff)).toBeUndefined();
    expect(takeCacheBranch(other)).toBeUndefined();
    expect(takeCacheBranch(dto)?.cache_state).toBe("COALESCED");
  });
  it("the read-path call never throws, even on garbage, and a primitive response is a no-op", () => {
    expect(() => noteCacheBranch({}, { cache_state: "HIT", cache_identity: "raw" })).not.toThrow();
    expect(() => noteCacheBranch(undefined, { cache_state: "HIT", cache_identity: identity })).not.toThrow();
    expect(() => noteCacheBranch("text", { cache_state: "HIT", cache_identity: identity })).not.toThrow();
    const response = { ok: true };
    expect(noteCacheBranch(response, { cache_state: "HIT", cache_identity: "raw" })).toBe(response);
    expect(takeCacheBranch(response)).toBeUndefined(); // a refused capture leaves nothing behind
    expect(() => carryCacheBranch(undefined, {})).not.toThrow();
    expect(() => carryCacheBranch({}, 5)).not.toThrow();
    expect(takeCacheBranch(null)).toBeUndefined();
  });
  it("captures are frozen copies and validated at attach time", () => {
    const capture: { cache_state: NativeCacheState; cache_identity: string } = { cache_state: "MISS", cache_identity: identity }, target = {};
    captureCacheBranch(target, capture);
    capture.cache_state = "HIT";
    expect(takeCacheBranch(target)?.cache_state).toBe("MISS");
    expect(() => captureCacheBranch({}, { cache_state: "HIT", cache_identity: "raw" })).toThrow(/CAPTURE_REFUSED/);
    expect(() => captureCacheBranch({}, { cache_state: "HIT", cache_identity: identity, extra: 1 } as never)).toThrow(/CAPTURE_REFUSED/);
  });
  it("sinks find only the exact (lease, attempt) pair and expose no list / enumerate API", async () => {
    const sink = new MemoryNativeCacheObservationSink();
    const observer = new NativeCacheObserver(KEY, sink);
    const mine = input("HIT", identity), theirs = input("MISS", identity);
    expect(await observer.record(mine)).toEqual({ recorded: true });
    expect(await observer.record(theirs)).toEqual({ recorded: true });
    expect(sink.find(mine.lease_id, mine.attempt_id)?.cache_state).toBe("HIT");
    expect(sink.find(theirs.lease_id, theirs.attempt_id)?.cache_state).toBe("MISS");
    expect(sink.find(mine.lease_id, theirs.attempt_id)).toBeUndefined();
    expect(sink.find(theirs.lease_id, mine.attempt_id)).toBeUndefined();
    expect(sink.find(mine.lease_id, randomUUID())).toBeUndefined();
    expect(Object.getOwnPropertyNames(MemoryNativeCacheObservationSink.prototype).sort()).toEqual(["append", "constructor", "find"]);
    expect(Object.getOwnPropertyNames(FileNativeCacheObservationSink.prototype).sort()).toEqual(["append", "constructor", "find"]);
    expect(Object.keys(sink)).toEqual([]); // records live in a private field
  });
});

describe("bounds and failure containment", () => {
  const identity = sharedReadIdentity(scope(EPOCH_A)).cacheKey;
  it("a record is far below its byte cap", () => {
    const record = buildNativeCacheObservation(KEY, input("COALESCED", identity));
    expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThanOrEqual(NATIVE_CACHE_OBSERVATION_MAX_RECORD_BYTES);
  });
  it("the memory sink is a bounded FIFO", () => {
    const sink = new MemoryNativeCacheObservationSink();
    const first = buildNativeCacheObservation(KEY, input("HIT", identity));
    sink.append(first);
    for (let i = 0; i < NATIVE_CACHE_OBSERVATION_MAX_MEMORY_RECORDS; i += 1) sink.append(buildNativeCacheObservation(KEY, input("MISS", identity)));
    expect(sink.find(first.lease_id, first.attempt_id)).toBeUndefined();
  });
  it("observation failure is a finite code, never an exception, never a leaked cause", async () => {
    const failing = new NativeCacheObserver(KEY, { append() { throw new Error(`disk /secret/path ${KEY.toString("hex")}`); }, find: () => undefined });
    const outcome = await failing.record(input("HIT", identity));
    expect(outcome).toEqual({ recorded: false, reason: "SINK_FAILED" });
    expect(JSON.stringify(outcome)).not.toContain("secret");
    const refused = await new NativeCacheObserver(KEY, new MemoryNativeCacheObservationSink()).record({ ...input("HIT", identity), body_digest: "x" });
    expect(refused).toEqual({ recorded: false, reason: "BUILD_REFUSED" });
  });
});

describe("operator file sink (private directory, append-only)", () => {
  const identity = sharedReadIdentity(scope(EPOCH_A)).cacheKey;
  it("mints a 0600 key, appends 0600 JSONL, finds by exact pair, and never writes the key or identity to the log", async () => {
    const dir = tempDir(); chmodSync(dir, 0o700);
    const key = loadNativeCacheObservationKey(dir, true);
    expect(key.length).toBe(32);
    expect(statSync(join(dir, "observation.key")).mode & 0o777).toBe(0o600);
    expect(loadNativeCacheObservationKey(dir, true).equals(key)).toBe(true); // stable across restart
    const sink = new FileNativeCacheObservationSink(dir), observer = new NativeCacheObserver(key, sink);
    const a = input("HIT", identity), b = input("MISS", identity);
    expect(await observer.record(a)).toEqual({ recorded: true });
    expect(await observer.record(b)).toEqual({ recorded: true });
    expect(statSync(join(dir, "observation.jsonl")).mode & 0o777).toBe(0o600);
    const log = readFileSync(join(dir, "observation.jsonl"), "utf8");
    expect(log.trim().split("\n")).toHaveLength(2);
    for (const forbidden of [key.toString("hex"), key.toString("base64"), identity, identity.slice(7), EPOCH_A, EPOCH_A.slice(7)])
      expect(log).not.toContain(forbidden);
    expect(new FileNativeCacheObservationSink(dir).find(a.lease_id, a.attempt_id)?.cache_state).toBe("HIT");
    expect(new FileNativeCacheObservationSink(dir).find(a.lease_id, b.attempt_id)).toBeUndefined();
  });
  it("refuses a group/other-accessible directory, log or key", () => {
    const loose = tempDir(); chmodSync(loose, 0o755);
    expect(() => new FileNativeCacheObservationSink(loose)).toThrow(/DIRECTORY_REFUSED/);
    expect(() => loadNativeCacheObservationKey(loose, true)).toThrow(/DIRECTORY_REFUSED/);
    const dir = tempDir(); chmodSync(dir, 0o700);
    writeFileSync(join(dir, "observation.key"), randomBytes(32), { mode: 0o644 }); chmodSync(join(dir, "observation.key"), 0o644);
    expect(() => loadNativeCacheObservationKey(dir, false)).toThrow(/KEY_REFUSED|FILE_REFUSED/);
    expect(() => loadNativeCacheObservationKey(tempDir(), false)).toThrow(/KEY_REFUSED/); // no implicit key creation
  });
  it("is size-bounded: a full log drops the observation and the observer reports SINK_FAILED", async () => {
    const dir = tempDir(); chmodSync(dir, 0o700);
    writeFileSync(join(dir, "observation.jsonl"), "x".repeat(NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES), { mode: 0o600 });
    const outcome = await new NativeCacheObserver(KEY, new FileNativeCacheObservationSink(dir)).record(input("HIT", identity));
    expect(outcome).toEqual({ recorded: false, reason: "SINK_FAILED" });
    expect(existsSync(join(dir, "observation.jsonl"))).toBe(true);
  });
});

describe("operator receipt: observation x existing durable custody projection", () => {
  const identity = sharedReadIdentity(scope(EPOCH_A)).cacheKey;
  const custody = (record: NativeCacheObservationRecord, extra: Record<string, unknown> = {}) => ({
    lease_id: record.lease_id, attempt_id: record.attempt_id, phase: "SERVED", body_digest: record.body_digest,
    receipt_digest: sha("receipt"), source_ack_digest: sha("ack"), source_reconciled: true, ...extra,
  });
  it("CORRELATED when lease/attempt, body digest and terminal phase agree", () => {
    const record = buildNativeCacheObservation(KEY, input("HIT", identity));
    const receipt = correlateNativeCacheObservation(record, custody(record));
    expect(receipt.verdict).toBe("CORRELATED");
    expect(receipt.checks).toEqual({ lease_attempt_match: true, body_digest_match: true, egress_phase_consistent: true });
    expect(receipt.observation.cache_state).toBe("HIT");
  });
  it("MISMATCH on another request's custody row, a different body or a phase the witness contradicts", () => {
    const record = buildNativeCacheObservation(KEY, input("MISS", identity));
    const other = buildNativeCacheObservation(KEY, input("MISS", identity));
    expect(correlateNativeCacheObservation(record, custody(other)).verdict).toBe("MISMATCH");
    expect(correlateNativeCacheObservation(record, custody(record, { body_digest: sha("different") })).checks.body_digest_match).toBe(false);
    expect(correlateNativeCacheObservation(record, custody(record, { phase: "ABORTED" })).checks.egress_phase_consistent).toBe(false);
    const aborted = buildNativeCacheObservation(KEY, input("MISS", identity, EPOCH_A, { egress_phase: "ABORTED" }));
    expect(correlateNativeCacheObservation(aborted, custody(aborted, { phase: "ABORTED" })).verdict).toBe("CORRELATED");
    const unknown = buildNativeCacheObservation(KEY, input("MISS", identity, EPOCH_A, { egress_phase: "UNKNOWN" }));
    expect(correlateNativeCacheObservation(unknown, custody(unknown, { phase: "UNKNOWN", body_digest: unknown.body_digest })).verdict).toBe("CORRELATED");
    expect(correlateNativeCacheObservation(unknown, custody(unknown, { phase: "SERVED" })).verdict).toBe("MISMATCH");
  });
  it("refuses a custody projection carrying anything beyond the bounded columns (base_body, jwt, cookie)", () => {
    const record = buildNativeCacheObservation(KEY, input("HIT", identity));
    for (const extra of [{ base_body: "{}" }, { terminal: "eyJhbGciOi" }, { cookie: "sid" }, { session_id: "s" }])
      expect(() => correlateNativeCacheObservation(record, custody(record, extra))).toThrow(/CUSTODY_REFUSED/);
  });
});

describe("P22-1: the ACTUAL NativeHTTPRecovery return shapes (current-human-candidate.ts:184-186)", () => {
  const identity = sharedReadIdentity(scope(EPOCH_A)).cacheKey;
  // `context` is the private NativeBase; the observation must never read it.
  const context = { poison: "base_body-cookie-jwt" } as unknown as NativeHTTPRecovery["context"];
  const reconciled: NativeHTTPRecovery = { state: "RECONCILED", context };
  const terminal = (phase: "SERVED" | "ABORTED"): NativeHTTPRecovery => ({ state: "TERMINAL", phase, context, terminal: "eyJ.jwt.sig" });
  const unknown: NativeHTTPRecovery = { state: "UNKNOWN", context };
  const unsent: NativeHTTPRecovery = { state: "UNSENT_FENCED", context };
  const custody = (record: NativeCacheObservationRecord, extra: Record<string, unknown> = {}) => ({
    lease_id: record.lease_id, attempt_id: record.attempt_id, phase: "SERVED", body_digest: record.body_digest,
    receipt_digest: sha("receipt"), source_ack_digest: sha("ack"), source_reconciled: true, ...extra,
  });
  const observe = (recovery: unknown) => buildNativeCacheObservation(KEY, input("HIT", identity, EPOCH_A, { egress_phase: egressPhaseOfRecovery(recovery) }));

  it("maps every real return explicitly; RECONCILED carries no phase and is NOT 'no witness'", () => {
    expect(egressPhaseOfRecovery(terminal("SERVED"))).toBe("SERVED");
    expect(egressPhaseOfRecovery(terminal("ABORTED"))).toBe("ABORTED");
    expect(egressPhaseOfRecovery(unknown)).toBe("UNKNOWN");
    expect(egressPhaseOfRecovery(unsent)).toBe("UNKNOWN");
    expect(egressPhaseOfRecovery(reconciled)).toBe("NOT_OBSERVED_IN_RETURN");
    // reconcile threw / returned nothing, or a shape we do not know: no claim either way.
    for (const odd of [undefined, null, 5, "TERMINAL", {}, { state: "TERMINAL" }, { state: "TERMINAL", phase: "CANCELLED" }, { state: "NEW_STATE" }])
      expect(egressPhaseOfRecovery(odd)).toBe("NOT_OBSERVED_IN_RETURN");
    expect(JSON.stringify(observe(reconciled))).not.toContain("poison");
  });

  it("RECONCILED return joined with durable SERVED is CORRELATED (the successful ACKed response)", () => {
    const record = observe(reconciled);
    expect(record.egress_evidence_kind).toBe("EGRESS_NOT_OBSERVED_IN_RETURN");
    const receipt = correlateNativeCacheObservation(record, custody(record, { phase: "SERVED" }));
    expect(receipt.verdict).toBe("CORRELATED");
    expect(receipt.durable_egress).toBe("SERVED");
    expect(receipt.checks).toEqual({ lease_attempt_match: true, body_digest_match: true, egress_phase_consistent: true });
  });

  it("RECONCILED return joined with durable ABORTED is CORRELATED and reported as ABORTED", () => {
    const record = observe(reconciled);
    const receipt = correlateNativeCacheObservation(record, custody(record, { phase: "ABORTED" }));
    expect(receipt.verdict).toBe("CORRELATED");
    expect(receipt.durable_egress).toBe("ABORTED");
  });

  it("RECONCILED joined with a non-terminal durable row makes no terminal claim (NO_TERMINAL), not SERVED", () => {
    const record = observe(reconciled);
    const receipt = correlateNativeCacheObservation(record, custody(record, { phase: "UNKNOWN", receipt_digest: null }));
    expect(receipt.durable_egress).toBe("NO_TERMINAL");
    expect(receipt.verdict).toBe("CORRELATED");
  });

  it("a durable terminal without its immutable receipt digest is refused for every witness kind", () => {
    for (const recovery of [reconciled, terminal("SERVED")]) {
      const record = observe(recovery);
      expect(correlateNativeCacheObservation(record, custody(record, { phase: "SERVED", receipt_digest: null })).verdict).toBe("MISMATCH");
    }
  });

  it("the observed TERMINAL witnesses still need the matching durable phase", () => {
    const served = observe(terminal("SERVED")), aborted = observe(terminal("ABORTED"));
    expect(correlateNativeCacheObservation(served, custody(served, { phase: "SERVED" })).verdict).toBe("CORRELATED");
    expect(correlateNativeCacheObservation(aborted, custody(aborted, { phase: "ABORTED" })).verdict).toBe("CORRELATED");
    expect(correlateNativeCacheObservation(served, custody(served, { phase: "ABORTED" })).verdict).toBe("MISMATCH");
    expect(correlateNativeCacheObservation(aborted, custody(aborted, { phase: "SERVED" })).verdict).toBe("MISMATCH");
    expect(correlateNativeCacheObservation(served, custody(served, { phase: "UNKNOWN", receipt_digest: null })).verdict).toBe("MISMATCH");
  });

  it("explicit UNKNOWN / UNSENT_FENCED keeps its unsettled meaning: a durable terminal contradicts it", () => {
    for (const recovery of [unknown, unsent]) {
      const record = observe(recovery);
      expect(record.egress_evidence_kind).toBe("NO_FINAL_WITNESS");
      expect(correlateNativeCacheObservation(record, custody(record, { phase: "UNKNOWN", receipt_digest: null })).verdict).toBe("CORRELATED");
      expect(correlateNativeCacheObservation(record, custody(record, { phase: "SENDING", receipt_digest: null })).verdict).toBe("CORRELATED");
      expect(correlateNativeCacheObservation(record, custody(record, { phase: "SERVED" })).verdict).toBe("MISMATCH");
      expect(correlateNativeCacheObservation(record, custody(record, { phase: "ABORTED" })).verdict).toBe("MISMATCH");
    }
  });

  it("digest, lease and attempt mismatches are refused for the not-observed kind too", () => {
    const record = observe(reconciled), other = observe(reconciled);
    expect(correlateNativeCacheObservation(record, custody(record, { body_digest: sha("different") })).checks.body_digest_match).toBe(false);
    expect(correlateNativeCacheObservation(record, custody(record, { body_digest: null })).verdict).toBe("MISMATCH");
    expect(correlateNativeCacheObservation(record, custody(record, { lease_id: other.lease_id })).checks.lease_attempt_match).toBe(false);
    expect(correlateNativeCacheObservation(record, custody(record, { attempt_id: other.attempt_id })).checks.lease_attempt_match).toBe(false);
    expect(correlateNativeCacheObservation(record, custody(record, { lease_id: other.lease_id })).verdict).toBe("MISMATCH");
  });
});

describe("P22-2: files are size-checked on the opened descriptor before any read", () => {
  const identity = sharedReadIdentity(scope(EPOCH_A)).cacheKey;
  const privateDir = () => { const d = tempDir(); chmodSync(d, 0o700); return d; };

  it("refuses an oversized and an undersized existing key and leaves the file exactly as found", () => {
    for (const bytes of [33, 31, 1024, 0, 5 * 1024 * 1024]) {
      const dir = privateDir(), path = join(dir, "observation.key"), content = randomBytes(bytes);
      writeFileSync(path, content, { mode: 0o600 });
      for (const create of [false, true]) expect(() => loadNativeCacheObservationKey(dir, create)).toThrow(/KEY_REFUSED/);
      expect(readFileSync(path).equals(content)).toBe(true); // never replaced / truncated / re-minted
    }
  });
  it("accepts exactly the 32-byte key", () => {
    const dir = privateDir(), key = randomBytes(32);
    writeFileSync(join(dir, "observation.key"), key, { mode: 0o600 });
    expect(loadNativeCacheObservationKey(dir, false).equals(key)).toBe(true);
  });
  it("refuses a symlinked key, a hard-linked key and a non-regular key", () => {
    const outside = tempDir(), real = join(outside, "real.key");
    writeFileSync(real, randomBytes(32), { mode: 0o600 });
    const sym = privateDir(); symlinkSync(real, join(sym, "observation.key"));
    expect(() => loadNativeCacheObservationKey(sym, false)).toThrow(/KEY_REFUSED/);
    expect(() => loadNativeCacheObservationKey(sym, true)).toThrow(/KEY_REFUSED/);
    const hard = privateDir(); linkSync(real, join(hard, "observation.key"));
    expect(() => loadNativeCacheObservationKey(hard, false)).toThrow(/FILE_REFUSED/);
    const notFile = privateDir(); mkdirSync(join(notFile, "observation.key"));
    expect(() => loadNativeCacheObservationKey(notFile, false)).toThrow(/KEY_REFUSED|FILE_REFUSED/);
  });

  it("refuses to read an oversized existing log; it is neither read nor deleted nor truncated", () => {
    const dir = privateDir(), path = join(dir, "observation.jsonl");
    const big = Buffer.alloc(NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES + 1, 0x78);
    writeFileSync(path, big, { mode: 0o600 });
    const sink = new FileNativeCacheObservationSink(dir);
    expect(() => sink.find(randomUUID(), randomUUID())).toThrow(/LOG_OVERSIZE/);
    expect(() => sink.append(buildNativeCacheObservation(KEY, input("HIT", identity)))).toThrow(/LOG_FULL/);
    expect(statSync(path).size).toBe(big.length);
  });
  it("a full-but-legal log (exactly the cap) is readable, still bounded, and append is refused", async () => {
    const dir = privateDir(), path = join(dir, "observation.jsonl");
    const record = buildNativeCacheObservation(KEY, input("MISS", identity));
    const line = `${JSON.stringify(record)}\n`;
    const filler = Buffer.alloc(NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES - Buffer.byteLength(line), 0x0a);
    writeFileSync(path, Buffer.concat([filler, Buffer.from(line)]), { mode: 0o600 });
    const sink = new FileNativeCacheObservationSink(dir);
    expect(sink.find(record.lease_id, record.attempt_id)?.cache_state).toBe("MISS");
    expect(await new NativeCacheObserver(KEY, sink).record(input("HIT", identity))).toEqual({ recorded: false, reason: "SINK_FAILED" });
    expect(statSync(path).size).toBe(NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES);
  });
  it("the read itself is bounded: growth after fstat cannot exceed the cap", () => {
    const dir = privateDir(), path = join(dir, "grown");
    writeFileSync(path, Buffer.alloc(4096, 0x61), { mode: 0o600 });
    const read = (max: number) => {
      const fd = openSync(path, "r"); // sequential reads: a fresh descriptor per attempt
      try { return readDescriptorBounded(fd, max, "NATIVE_CACHE_OBSERVATION_LOG_OVERSIZE"); } finally { closeSync(fd); }
    };
    // Pretend fstat saw <= 1024 bytes; the descriptor now yields 4096.
    expect(() => read(1024)).toThrow(/LOG_OVERSIZE/);
    expect(read(4096).length).toBe(4096);
    expect(read(8192).length).toBe(4096);
  });
  it("refuses a symlinked or hard-linked log and does not follow it", async () => {
    const outside = tempDir(), real = join(outside, "elsewhere.jsonl");
    writeFileSync(real, "", { mode: 0o600 });
    const sym = privateDir(); symlinkSync(real, join(sym, "observation.jsonl"));
    const symSink = new FileNativeCacheObservationSink(sym);
    expect(() => symSink.find(randomUUID(), randomUUID())).toThrow(/FILE_REFUSED/);
    expect(await new NativeCacheObserver(KEY, symSink).record(input("HIT", identity))).toEqual({ recorded: false, reason: "SINK_FAILED" });
    const hard = privateDir(); linkSync(real, join(hard, "observation.jsonl"));
    const hardSink = new FileNativeCacheObservationSink(hard);
    expect(() => hardSink.find(randomUUID(), randomUUID())).toThrow(/FILE_REFUSED/);
    expect(await new NativeCacheObserver(KEY, hardSink).record(input("HIT", identity))).toEqual({ recorded: false, reason: "SINK_FAILED" });
    expect(readFileSync(real, "utf8")).toBe(""); // nothing written through either link
  });
  it("a missing log is the only empty answer; a torn line is skipped without leaking its text", () => {
    const dir = privateDir();
    const sink = new FileNativeCacheObservationSink(dir);
    expect(sink.find(randomUUID(), randomUUID())).toBeUndefined();
    const record = buildNativeCacheObservation(KEY, input("COALESCED", identity));
    writeFileSync(join(dir, "observation.jsonl"), `{"torn":\n${JSON.stringify(record)}\n`, { mode: 0o600 });
    expect(sink.find(record.lease_id, record.attempt_id)?.cache_state).toBe("COALESCED");
  });
});
