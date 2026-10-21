/** BE-P22 private native cache observation: observer LOGIC only.
 * The admission fixture below is SYNTHETIC. It proves the HIT / MISS /
 * COALESCED distinction, hashing, redaction, isolation and bounds of the
 * observer; it is NOT connected source acceptance and exercises no DB, no
 * proxy, no egress and no Core session. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sharedReadIdentity, type SharedReadScope } from "../src/execution/shared-read.repository";
import {
  FileNativeCacheObservationSink, MemoryNativeCacheObservationSink, NATIVE_CACHE_OBSERVATION_MAX_FILE_BYTES,
  NATIVE_CACHE_OBSERVATION_MAX_MEMORY_RECORDS, NATIVE_CACHE_OBSERVATION_MAX_RECORD_BYTES, NativeCacheObserver,
  NativeCacheObservationError, buildNativeCacheObservation, cacheStateOfAdmission, captureCacheBranch,
  carryCacheBranch, correlateNativeCacheObservation, loadNativeCacheObservationKey, nativeCacheIdentityMatches,
  noteCacheBranch,
  takeCacheBranch, type NativeCacheAdmissionKind, type NativeCacheObservationInput,
  type NativeCacheObservationRecord, type NativeCacheState,
} from "../src/execution-v2/native-cache-observation";

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
    const kinds = (["SERVED", "ABORTED", "UNKNOWN"] as const).map(egress_phase =>
      buildNativeCacheObservation(KEY, input("MISS", identity, EPOCH_A, { egress_phase })));
    expect(kinds.map(r => r.egress_evidence_kind)).toEqual(["FINAL_HTTP_SEND_COMPLETED", "FINAL_HTTP_ABORT_CONFIRMED", "NO_FINAL_WITNESS"]);
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
