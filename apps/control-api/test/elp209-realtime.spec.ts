/** TEST_ONLY trusted-adapter/authority doubles. These pure race proofs are not
 * a commissioned Edge transport, dense source coverage proof or trading replay. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { edgeScopedNoticeBatch, scopedRealtimeFrame, type EdgeScopedNoticeBatch,
  type ScopedReplayBinding, type ScopedRealtimeFrame } from "../src/execution-v2/realtime.contract";
import { ScopedReplayCursorCodec, ScopedReplayError, ScopedReplayHub,
  type ReplayDeliveryGuard, type ScopedNoticeSource, type ScopedReplayLimits } from "../src/execution-v2/realtime";

const NOW = 1792140000000;
const SECRET = "TEST_ONLY-never-a-runtime-key-".repeat(3);
const SOURCE_BASE = "TEST_ONLY.private.scan-1";
const SOURCE_NEXT = "TEST_ONLY.private.scan-3";
const binding = (patch: Partial<ScopedReplayBinding> = {}): ScopedReplayBinding => ({
  workspace_id: "TEST_ONLY:workspace", environment: "paper", profile_id: "TEST_ONLY:profile",
  principal_scope_digest: "TEST_ONLY:session-and-current-scope", app_policy_revision: "TEST_ONLY:app-policy",
  field_policy_revision: "TEST_ONLY:field-policy", model_revision: "TEST_ONLY:model",
  schema_revision: "portal.execution.scoped-realtime.v1", dataset: "alpha_fleet_overview",
  query_digest: "TEST_ONLY:authorized-query", source_set_digest: "TEST_ONLY:source-set",
  source_continuity_epoch: "TEST_ONLY:epoch", projection_generation: "TEST_ONLY:generation",
  snapshot_id: "TEST_ONLY:snapshot", window: { from_ms: NOW - 60000, to_ms: NOW }, ...patch,
});
const quality = (): NonNullable<ScopedRealtimeFrame["quality"]> => ({ completeness: "PARTIAL", freshness: "STALE",
  coverage: "AUTHORIZED_ONLY", source_as_of_ms: NOW - 120000, portal_observed_at_ms: NOW,
  source_set_ref: "TEST_ONLY:authorized-source-set", confidence: "PROVISIONAL", reasons: ["TEST_ONLY:source-reason"] });
const notice = (cursor = SOURCE_NEXT) => ({ resume_cursor: cursor,
  projection_generation: binding().projection_generation, quality: quality() });
const batch = (patch: Partial<EdgeScopedNoticeBatch> = {}): EdgeScopedNoticeBatch => ({
  notices: [notice()], next_cursor: SOURCE_NEXT, caught_up: true, ...patch,
});
const limits = (patch: Partial<ScopedReplayLimits> = {}): ScopedReplayLimits => ({ maximumClients: 4,
  maximumEntriesPerClient: 8, maximumFrameBytes: 8192, maximumClientBytes: 65536,
  maximumTotalBytes: 262144, maximumNoticesPerRead: 8, readTimeoutMs: 100, ...patch });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const owned: ScopedReplayHub[] = [];
const harness = (configuration: Partial<ScopedReplayLimits> = {}) => {
  const codec = new ScopedReplayCursorCodec("test1", { test1: SECRET }, 60000, () => NOW);
  const read = vi.fn<ScopedNoticeSource["read"]>(async () => batch());
  const frames: ScopedRealtimeFrame[] = [];
  const authority = { identity: binding().principal_scope_digest, writes: 0 };
  const guard: ReplayDeliveryGuard = { currentIdentity: async () => authority.identity,
    write: async (expected, send) => {
      authority.writes++;
      if (expected !== authority.identity) throw new ScopedReplayError("SCOPE_CHANGED");
      return send();
    } };
  const write = vi.fn((frame: ScopedRealtimeFrame) => { frames.push(frame); return true; });
  const hub = new ScopedReplayHub({ read }, codec, limits(configuration));
  owned.push(hub);
  const subscribe = (patch: Partial<Parameters<ScopedReplayHub["subscribe"]>[0]> = {}) => hub.subscribe({
    binding: binding(), guard, write, baselineCursor: SOURCE_BASE, ...patch,
  });
  return { codec, read, frames, authority, guard, write, hub, subscribe };
};
const terminal = (frame: ScopedRealtimeFrame, reason: ScopedRealtimeFrame["reason_code"], event = "resync_required") => {
  expect(frame).toMatchObject({ event_type: event, reason_code: reason, terminal: true,
    resume_cursor: null, projection_generation: null, quality: null, semantics: "NOTIFICATION_ONLY" });
  expect(scopedRealtimeFrame.safeParse(frame).success).toBe(true);
};

afterEach(() => {
  for (const hub of owned.splice(0)) hub.stop();
  vi.useRealTimers();
});

describe("ELP2-09 scoped opaque cursor — encryption, expiration and every authority/query axis", () => {
  it("round-trips only on the exact current binding, with randomized fixed-length encrypted tokens", () => {
    const codec = new ScopedReplayCursorCodec("test1", { test1: SECRET }, 60000, () => NOW);
    const first = codec.encode(binding(), SOURCE_BASE);
    const again = codec.encode(binding(), SOURCE_BASE);
    const longerPrivateCursor = codec.encode(binding(), "TEST_ONLY.private.source-" + "x".repeat(1900));
    expect(codec.decode(first, binding())).toBe(SOURCE_BASE);
    expect(first).not.toBe(again);
    expect(first.length).toBe(again.length);
    expect(first.length).toBe(longerPrivateCursor.length);
    expect(first.length).toBeLessThanOrEqual(4096);
    expect(first).not.toContain(SOURCE_BASE);
    expect(Buffer.from(first.split(".")[3], "base64url").toString("utf8")).not.toContain(SOURCE_BASE);
  });
  it("accepts an old key only while explicitly retained and encodes using the new active key", () => {
    const old = new ScopedReplayCursorCodec("old", { old: SECRET }, 60000, () => NOW);
    const rotated = new ScopedReplayCursorCodec("new", { old: SECRET, new: SECRET + "new" }, 60000, () => NOW);
    const removed = new ScopedReplayCursorCodec("new", { new: SECRET + "new" }, 60000, () => NOW);
    const cursor = old.encode(binding(), SOURCE_BASE);
    expect(rotated.decode(cursor, binding())).toBe(SOURCE_BASE);
    expect(rotated.encode(binding(), SOURCE_BASE)).toMatch(/^sr1\.new\./);
    expect(() => removed.decode(cursor, binding())).toThrow(ScopedReplayError);
  });
  it("rejects ciphertext, tag, key identifier, version and noncanonical base64 tampering with one public error", () => {
    const codec = new ScopedReplayCursorCodec("test1", { test1: SECRET }, 60000, () => NOW);
    const token = codec.encode(binding(), SOURCE_BASE);
    const components = token.split(".");
    const changed = (index: number, value: string) => components.map((item, i) => i === index ? value : item).join(".");
    const corruptions = [changed(0, "sr2"), changed(1, "missing"), changed(2, components[2] + "="),
      changed(3, (components[3][0] === "A" ? "B" : "A") + components[3].slice(1)),
      changed(4, (components[4][0] === "A" ? "B" : "A") + components[4].slice(1)), token + ".extra"];
    for (const value of corruptions) {
      try { codec.decode(value, binding()); expect.fail("tampered cursor must not decode"); }
      catch (error) {
        expect(error).toMatchObject({ code: "CURSOR_INVALID_OR_EXPIRED",
          message: "Execution updates require a current authorized snapshot." });
        expect(String(error)).not.toContain(SOURCE_BASE);
      }
    }
  });
  it("rejects expiry at its exact boundary and a clock that has moved before issue time", () => {
    let clock = NOW;
    const codec = new ScopedReplayCursorCodec("test1", { test1: SECRET }, 10, () => clock);
    const cursor = codec.encode(binding(), SOURCE_BASE);
    clock = NOW + 9;
    expect(codec.decode(cursor, binding())).toBe(SOURCE_BASE);
    clock = NOW + 10;
    expect(() => codec.decode(cursor, binding())).toThrow(ScopedReplayError);
    clock = NOW - 1;
    expect(() => codec.decode(cursor, binding())).toThrow(ScopedReplayError);
  });
  it.each([
    ["workspace", { workspace_id: "TEST_ONLY:other-workspace" }], ["environment", { environment: "live" }],
    ["profile", { profile_id: "TEST_ONLY:other-profile" }],
    ["principal/session", { principal_scope_digest: "TEST_ONLY:other-session" }],
    ["application policy", { app_policy_revision: "TEST_ONLY:app-policy2" }],
    ["field policy", { field_policy_revision: "TEST_ONLY:field-policy2" }],
    ["model", { model_revision: "TEST_ONLY:model2" }], ["query/filter", { query_digest: "TEST_ONLY:query2" }],
    ["source set", { source_set_digest: "TEST_ONLY:source-set2" }],
    ["continuity epoch", { source_continuity_epoch: "TEST_ONLY:epoch2" }],
    ["projection generation", { projection_generation: "TEST_ONLY:generation2" }],
    ["snapshot", { snapshot_id: "TEST_ONLY:snapshot2" }],
    ["window", { window: { from_ms: NOW - 120000, to_ms: NOW } }], ["missing window", { window: null }],
  ] as Array<[string, Partial<ScopedReplayBinding>]>) ("invalidates continuation after %s changes", (_name, patch) => {
    const codec = new ScopedReplayCursorCodec("test1", { test1: SECRET }, 60000, () => NOW);
    const cursor = codec.encode(binding(), SOURCE_BASE);
    expect(() => codec.decode(cursor, binding(patch))).toThrow(ScopedReplayError);
  });
  it("rejects unknown schema/dataset scope and malformed, oversized or empty private cursors", () => {
    const codec = new ScopedReplayCursorCodec("test1", { test1: SECRET }, 60000, () => NOW);
    const cursor = codec.encode(binding(), SOURCE_BASE);
    expect(codec.decode(codec.encode(binding(), "x".repeat(2048)),binding())).toBe("x".repeat(2048));
    expect(() => codec.decode(cursor, { ...binding(), schema_revision: "TEST_ONLY:unsupported" } as never)).toThrow();
    expect(() => codec.decode(cursor, { ...binding(), dataset: "TEST_ONLY:peer-dataset" } as never)).toThrow();
    for (const value of ["", "TEST_ONLY:colon-is-not-an-opaque-source-token", "x".repeat(2049)])
      expect(() => codec.encode(binding(), value)).toThrow(ScopedReplayError);
    expect(() => codec.decode("x".repeat(4097), binding())).toThrow(ScopedReplayError);
  });
  it("fails closed if the trusted clock is not a UTC safe integer", () => {
    let now=NOW;
    const codec=new ScopedReplayCursorCodec("test1",{test1:SECRET},60000,()=>now);
    const token=codec.encode(binding(),SOURCE_BASE);
    for(const bad of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1]){
      now=bad;expect(()=>codec.decode(token,binding())).toThrow(ScopedReplayError);
      expect(()=>codec.encode(binding(),SOURCE_BASE)).toThrow("REPLAY_CLOCK_INVALID");
    }
  });
  it("rejects weak keys, unknown active key, excessive rotation keys and invalid TTL", () => {
    expect(() => new ScopedReplayCursorCodec("test1", { test1: "short" }, 60000)).toThrow("REPLAY_CURSOR_CONFIG_INVALID");
    expect(() => new ScopedReplayCursorCodec("absent", { test1: SECRET }, 60000)).toThrow("REPLAY_CURSOR_CONFIG_INVALID");
    expect(() => new ScopedReplayCursorCodec("test1", { test1: SECRET }, 300001)).toThrow("REPLAY_CURSOR_CONFIG_INVALID");
    expect(() => new ScopedReplayCursorCodec("test1", { test1: SECRET }, 0)).toThrow("REPLAY_CURSOR_CONFIG_INVALID");
    expect(() => new ScopedReplayCursorCodec("a", { a: SECRET, b: SECRET, c: SECRET, d: SECRET, e: SECRET }, 60000))
      .toThrow("REPLAY_CURSOR_CONFIG_INVALID");
  });
});

describe("ELP2-09 snapshot-bound notification fanout — trusted source coverage, not economic replay", () => {
  it("requires a named snapshot barrier before subscribing and never starts the source at head", async () => {
    const h = harness();
    await expect(h.subscribe({ baselineCursor: "" })).rejects.toMatchObject({ code: "SNAPSHOT_REQUIRED" });
    expect(h.read).not.toHaveBeenCalled();
    expect(h.hub.diagnostics().clients).toBe(0);
  });
  it("checks current actor identity before admitting a subscription", async () => {
    const h = harness();
    h.authority.identity = "TEST_ONLY:revoked-session";
    await expect(h.subscribe()).rejects.toMatchObject({ code: "SCOPE_CHANGED" });
    expect(h.read).not.toHaveBeenCalled();
    expect(h.hub.diagnostics().clients).toBe(0);
  });
  it("passes only the decoded exact Last-Event-ID continuation to the trusted adapter", async () => {
    const h = harness();
    const saved = h.codec.encode(binding(), "TEST_ONLY.private.saved-scan");
    await h.subscribe({ lastEventId: saved });
    await h.hub.poll();
    expect(h.read).toHaveBeenCalledOnce();
    expect(h.read.mock.calls[0][1]).toBe("TEST_ONLY.private.saved-scan");
    expect(h.read.mock.calls[0][2]).toBe(8);
    expect(h.read.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
  });
  it("rejects a cursor from another filter before allocating a client or reading the source", async () => {
    const h = harness();
    const saved = h.codec.encode(binding({ query_digest: "TEST_ONLY:another-filter" }), SOURCE_BASE);
    await expect(h.subscribe({ lastEventId: saved })).rejects.toMatchObject({ code: "CURSOR_INVALID_OR_EXPIRED" });
    expect(h.hub.diagnostics().clients).toBe(0);
    expect(h.read).not.toHaveBeenCalled();
  });
  it("coalesces two identical subscribers into one bounded in-flight adapter read", async () => {
    const h = harness();
    const pending = deferred<EdgeScopedNoticeBatch>();
    h.read.mockReturnValueOnce(pending.promise);
    await h.subscribe();
    const peer: ScopedRealtimeFrame[] = [];
    await h.subscribe({ write: frame => { peer.push(frame); return true; } });
    const work = h.hub.poll();
    await flush();
    expect(h.read).toHaveBeenCalledOnce();
    expect(h.hub.diagnostics().source_flights).toBe(1);
    pending.resolve(batch());
    await work;
    expect(h.frames).toHaveLength(1);
    expect(peer).toHaveLength(1);
    expect(h.frames[0].resume_cursor).not.toBe(peer[0].resume_cursor);
    expect(h.hub.diagnostics()).toMatchObject({ clients: 2, queued_bytes: 0, source_flights: 0, browser_source_calls: 0 });
  });
  it("does not coalesce distinct authorized query scopes", async () => {
    const h = harness();
    await h.subscribe();
    await h.subscribe({ binding: binding({ query_digest: "TEST_ONLY:another-query" }) });
    await h.hub.poll();
    expect(h.read).toHaveBeenCalledTimes(2);
  });
  it("detaches subscription binding from later caller mutation and adapter argument mutation", async () => {
    const h = harness();
    const submitted = binding();
    await h.subscribe({ binding: submitted });
    submitted.query_digest = "TEST_ONLY:caller-mutated";
    const received: string[] = [];
    h.read.mockImplementation(async input => {
      received.push(input.query_digest);
      input.query_digest = "TEST_ONLY:adapter-mutated";
      const cursor = `TEST_ONLY.private.scan-${received.length + 2}`;
      return batch({ notices: [notice(cursor)], next_cursor: cursor });
    });
    await h.hub.poll();
    await h.hub.poll();
    expect(received).toEqual([binding().query_digest, binding().query_digest]);
    expect(h.codec.decode(h.frames[0].resume_cursor!, binding())).toBe(SOURCE_NEXT);
    expect(h.codec.decode(h.frames[1].resume_cursor!, binding())).toBe("TEST_ONLY.private.scan-4");
  });
  it("does not fabricate a gap for source-verified visible/hidden/visible progression", async () => {
    const h = harness();
    h.read.mockResolvedValueOnce(batch({ notices: [notice("TEST_ONLY.private.scan-2"), notice("TEST_ONLY.private.scan-5")],
      next_cursor: "TEST_ONLY.private.scan-5" }));
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames.map(frame => frame.event_type)).toEqual(["revalidate", "revalidate"]);
    expect(h.frames.map(frame => h.codec.decode(frame.resume_cursor!, binding()))).toEqual([
      "TEST_ONLY.private.scan-2", "TEST_ONLY.private.scan-5",
    ]);
    // The authoritative adapter verified dense scan coverage. Source token text
    // is opaque; Portal neither counts missing suffixes nor certifies history.
    expect(JSON.stringify(h.frames)).not.toMatch(/hidden_count|peer_count|source_sequence|scan-2|scan-5/);
  });
  it("accepts Edge's coalesced final notice at the hidden-trailing scan end, not a guessed visible position", async () => {
    const h = harness();
    h.read.mockResolvedValueOnce(batch({ notices: [notice("TEST_ONLY.private.scan-end-with-hidden-tail")],
      next_cursor: "TEST_ONLY.private.scan-end-with-hidden-tail" }));
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames).toHaveLength(1);
    expect(h.frames[0].event_type).toBe("revalidate");
    expect(h.codec.decode(h.frames[0].resume_cursor!, binding())).toBe("TEST_ONLY.private.scan-end-with-hidden-tail");
  });
  it("rotates heartbeat ciphertext on identical no-change polls without exposing hidden counts or token length", async () => {
    const h = harness();
    h.read.mockResolvedValue(batch({ notices: [], next_cursor: SOURCE_BASE }));
    await h.subscribe();
    await h.hub.poll();
    await h.hub.poll();
    expect(h.frames.map(frame => frame.event_type)).toEqual(["heartbeat", "heartbeat"]);
    expect(h.frames[0].resume_cursor).not.toBe(h.frames[1].resume_cursor);
    expect(h.frames[0].resume_cursor!.length).toBe(h.frames[1].resume_cursor!.length);
    expect(h.frames.every(frame => frame.quality === null)).toBe(true);
    expect(h.codec.decode(h.frames[0].resume_cursor!, binding())).toBe(SOURCE_BASE);
  });
  it("preserves partial/stale/source-time metadata and never calls notification catch-up economic completeness", async () => {
    const h = harness();
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames[0].quality).toEqual(quality());
    expect(h.frames[0]).toMatchObject({ event_type: "revalidate", semantics: "NOTIFICATION_ONLY", next_action: "READ_NAMED_SNAPSHOT" });
    expect(h.frames[0]).not.toHaveProperty("caught_up");
    expect(h.frames[0]).not.toHaveProperty("total");
    expect(h.frames[0]).not.toHaveProperty("source_sequence");
  });
  it("requires an adapter cursor even when the source claims caught_up", async () => {
    const h = harness();
    h.read.mockResolvedValue(batch({ notices: [], next_cursor: null, caught_up: true }));
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "SOURCE_COVERAGE_UNPROVED");
  });
  it("propagates a typed adapter coverage failure as resync, never a successful empty heartbeat", async () => {
    const h = harness();
    h.read.mockRejectedValue(new ScopedReplayError("SOURCE_COVERAGE_UNPROVED"));
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "SOURCE_COVERAGE_UNPROVED");
    expect(h.hub.diagnostics().clients).toBe(0);
  });
  it.each([
    ["duplicate notice", () => batch({ notices: [notice(), notice()] })],
    ["notice repeats after barrier", () => batch({ notices: [notice(SOURCE_BASE)], next_cursor: SOURCE_BASE })],
    ["mismatched final scan cursor", () => batch({ next_cursor: "TEST_ONLY.private.different-scan" })],
    ["not caught up but no cursor progress", () => batch({ notices: [], next_cursor: SOURCE_BASE, caught_up: false })],
  ] as Array<[string, () => EdgeScopedNoticeBatch]>) ("rejects source envelope violation: %s", async (_label, value) => {
    const h = harness();
    h.read.mockResolvedValueOnce(value());
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "SOURCE_COVERAGE_UNPROVED");
  });
  it("restarts from a named snapshot after a projection generation reset", async () => {
    const h = harness();
    h.read.mockResolvedValueOnce(batch({ notices: [{ ...notice(), projection_generation: "TEST_ONLY:new-generation" }] }));
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "GENERATION_CHANGED");
  });
  it("fails closed on unsupported legacy/source fields rather than forwarding arbitrary source values", async () => {
    const h = harness();
    h.read.mockResolvedValueOnce({ ...batch(), source_generation: "TEST_ONLY:unsplit-legacy-generation" } as EdgeScopedNoticeBatch);
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "SOURCE_UNAVAILABLE", "unavailable");
    expect(JSON.stringify(h.frames)).not.toContain("unsplit-legacy");
    expect(edgeScopedNoticeBatch.safeParse({ ...batch(), hidden_count: 1 }).success).toBe(false);
  });
});

describe("ELP2-09 revoke races — each protected write must carry current authority", () => {
  it("denies a changed policy/session before reading and emits no protected notices", async () => {
    const h = harness();
    await h.subscribe();
    h.authority.identity = "TEST_ONLY:new-current-identity";
    await h.hub.poll();
    expect(h.read).not.toHaveBeenCalled();
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "ACCESS_CHANGED", "access_revoked");
  });
  it("rechecks between queued notices and purges all remaining protected frames after revocation", async () => {
    const h = harness();
    h.read.mockResolvedValueOnce(batch({ notices: [notice("TEST_ONLY.private.scan-2"), notice()], next_cursor: SOURCE_NEXT }));
    h.write.mockImplementation(frame => {
      h.frames.push(frame);
      if (frame.event_type === "revalidate") h.authority.identity = "TEST_ONLY:revoked-after-first-send";
      return true;
    });
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames.map(frame => frame.event_type)).toEqual(["revalidate", "access_revoked"]);
    expect(h.authority.writes).toBe(2);
    terminal(h.frames[1], "ACCESS_CHANGED", "access_revoked");
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, queued_bytes: 0 });
  });
  it.each([401, 403, 404]) ("treats current authority refusal %i as revoked without leaking server prose", async status => {
    const h = harness();
    h.guard.write = async () => { throw { status, message: "TEST_ONLY:private-current-grant-failure" }; };
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "ACCESS_CHANGED", "access_revoked");
    expect(JSON.stringify(h.frames)).not.toContain("private-current-grant");
  });
  it("applies an explicit revoke hint while a source request is pending, ignoring late completion", async () => {
    const h = harness();
    const pending = deferred<EdgeScopedNoticeBatch>();
    h.read.mockReturnValueOnce(pending.promise);
    await h.subscribe();
    const polling = h.hub.poll();
    await flush();
    h.hub.revoke(current => current.workspace_id === binding().workspace_id);
    terminal(h.frames[0], "ACCESS_CHANGED", "access_revoked");
    pending.resolve(batch());
    await polling;
    expect(h.frames).toHaveLength(1);
    expect(h.authority.writes).toBe(0);
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, queued_bytes: 0, source_flights: 0 });
  });
  it("keeps other authorized subscribers alive when one scope is revoked", async () => {
    const h = harness();
    const peer: ScopedRealtimeFrame[] = [];
    await h.subscribe();
    await h.subscribe({ binding: binding({ workspace_id: "TEST_ONLY:peer-workspace" }),
      write: frame => { peer.push(frame); return true; } });
    h.hub.revoke(current => current.workspace_id === binding().workspace_id);
    await h.hub.poll();
    expect(h.frames.map(frame => frame.event_type)).toEqual(["access_revoked"]);
    expect(peer.map(frame => frame.event_type)).toEqual(["revalidate"]);
    expect(h.hub.diagnostics().clients).toBe(1);
  });
  it("never includes target rows, scope, cursor, quality or private error details in terminal frames", async () => {
    const h = harness();
    await h.subscribe();
    h.hub.revoke(() => true);
    const serialized = JSON.stringify(h.frames[0]);
    for (const privateValue of [binding().workspace_id, binding().profile_id, binding().principal_scope_digest,
      binding().snapshot_id, SOURCE_BASE, binding().source_set_digest]) expect(serialized).not.toContain(privateValue);
    expect(h.frames[0].next_action).toBe("SIGN_IN_OR_REQUEST_ACCESS");
    expect(h.frames[0].reconnect_required).toBe(false);
  });
});

describe("ELP2-09 bounded ownership — slow clients, reconnects and uncooperative providers", () => {
  it.each(Object.keys(limits()) as Array<keyof ScopedReplayLimits>) ("requires explicit bounded config key %s", key => {
    const input = limits();
    delete (input as Partial<ScopedReplayLimits>)[key];
    const source = { read: vi.fn<ScopedNoticeSource["read"]>(async () => batch()) };
    const codec = new ScopedReplayCursorCodec("test1", { test1: SECRET }, 60000, () => NOW);
    expect(() => new ScopedReplayHub(source, codec, input)).toThrow("REPLAY_LIMITS_INVALID");
  });
  it("rejects unknown or unbounded limits and snapshots config against later external mutation", async () => {
    const codec = new ScopedReplayCursorCodec("test1", { test1: SECRET }, 60000, () => NOW);
    const source = { read: vi.fn<ScopedNoticeSource["read"]>(async () => batch()) };
    expect(() => new ScopedReplayHub(source, codec, { ...limits(), unknown: 1 } as ScopedReplayLimits)).toThrow("REPLAY_LIMITS_INVALID");
    for (const value of [0, -1, NaN, Infinity, 1.5])
      expect(() => new ScopedReplayHub(source, codec, limits({ maximumClients: value }))).toThrow("REPLAY_LIMITS_INVALID");
    expect(() => new ScopedReplayHub(source, codec, limits({ maximumNoticesPerRead: 201 }))).toThrow("REPLAY_LIMITS_INVALID");
    expect(() => new ScopedReplayHub(source, codec, limits({ maximumTotalBytes: 64 * 1048576 + 1 }))).toThrow("REPLAY_LIMITS_INVALID");
    const input = limits();
    const hub = new ScopedReplayHub(source, codec, input);
    owned.push(hub);
    input.maximumEntriesPerClient = 0;
    const frames: ScopedRealtimeFrame[] = [];
    const guard: ReplayDeliveryGuard = { currentIdentity: async () => binding().principal_scope_digest,
      write: async (_identity, send) => send() };
    await hub.subscribe({ binding: binding(), guard, baselineCursor: SOURCE_BASE, write: frame => { frames.push(frame); return true; } });
    await hub.poll();
    expect(frames.map(frame => frame.event_type)).toEqual(["revalidate"]);
  });
  it("caps concurrent reconnect admission including the post-await race and reuses only closed client slots", async () => {
    const h = harness({ maximumClients: 1 });
    const results = await Promise.allSettled([h.subscribe(), h.subscribe()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "RECONNECT_LIMIT" });
    const accepted = results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof h.subscribe>>>;
    accepted.value.close();
    accepted.value.close();
    await expect(h.subscribe()).resolves.toHaveProperty("id");
    expect(h.hub.diagnostics().clients).toBe(1);
  });
  it("counts pending authorization before invoking another expensive guard", async () => {
    const h = harness({ maximumClients: 1 });
    const pending = deferred<string>();
    const currentIdentity = vi.fn(() => pending.promise);
    const work = h.subscribe({ guard: { ...h.guard, currentIdentity } });
    await flush();
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, pending_subscriptions: 1 });
    const denied = vi.fn(async () => binding().principal_scope_digest);
    await expect(h.subscribe({ guard: { ...h.guard, currentIdentity: denied } })).rejects.toMatchObject({ code: "RECONNECT_LIMIT" });
    expect(denied).not.toHaveBeenCalled();
    expect(currentIdentity).toHaveBeenCalledOnce();
    pending.resolve(binding().principal_scope_digest);
    await work;
    expect(h.hub.diagnostics()).toMatchObject({ clients: 1, pending_subscriptions: 0 });
  });
  it("releases a pending admission after failed authority so another authorized session can subscribe", async () => {
    const h = harness({ maximumClients: 1 });
    await expect(h.subscribe({ guard: { ...h.guard, currentIdentity: async () => { throw new Error("TEST_ONLY:identity-failure"); } } }))
      .rejects.toThrow("TEST_ONLY:identity-failure");
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, pending_subscriptions: 0 });
    await expect(h.subscribe()).resolves.toHaveProperty("id");
  });
  it("latches stop before pending authorization completes and rejects all later subscriptions", async () => {
    const h = harness();
    const pending = deferred<string>();
    const currentIdentity = vi.fn(() => pending.promise);
    const work = h.subscribe({ guard: { ...h.guard, currentIdentity } });
    await flush();
    h.hub.stop();
    pending.resolve(binding().principal_scope_digest);
    await expect(work).rejects.toMatchObject({ code: "STOPPED" });
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, pending_subscriptions: 0 });
    const laterIdentity = vi.fn(async () => binding().principal_scope_digest);
    await expect(h.subscribe({ guard: { ...h.guard, currentIdentity: laterIdentity } })).rejects.toMatchObject({ code: "STOPPED" });
    expect(laterIdentity).not.toHaveBeenCalled();
    await h.hub.poll();
    expect(h.read).not.toHaveBeenCalled();
    expect(h.frames).toHaveLength(0);
  });
  it("does not create overlapping source reads when the coordinator polls twice concurrently", async () => {
    const h = harness();
    const pending = deferred<EdgeScopedNoticeBatch>();
    h.read.mockReturnValueOnce(pending.promise);
    await h.subscribe();
    const first = h.hub.poll();
    await flush();
    await h.hub.poll();
    expect(h.read).toHaveBeenCalledOnce();
    pending.resolve(batch());
    await first;
  });
  it("drops a nonaccepting client without retaining buffers or disrupting peers", async () => {
    const h = harness();
    await h.subscribe({ write: frame => { h.frames.push(frame); return false; } });
    await h.hub.poll();
    expect(h.frames.map(frame => frame.event_type)).toEqual(["revalidate", "resync_required"]);
    terminal(h.frames[1], "SLOW_CLIENT");
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, queued_bytes: 0 });
  });
  it.each([
    ["entries", { maximumEntriesPerClient: 1 }],
    ["client bytes", { maximumClientBytes: 8192 }],
    ["single frame bytes", { maximumFrameBytes: 1024 }],
  ] as Array<[string, Partial<ScopedReplayLimits>]>) ("enforces the %s bound without a partial protected delivery", async (_label, patch) => {
    const h = harness(patch);
    h.read.mockResolvedValue(batch({ notices: [notice("TEST_ONLY.private.scan-2"), notice()] }));
    await h.subscribe();
    await h.hub.poll();
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "SLOW_CLIENT");
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, queued_bytes: 0 });
  });
  it("bounds aggregate queued bytes across subscribers while another delivery is blocked", async () => {
    const h = harness({ maximumClientBytes: 16384, maximumTotalBytes: 16384 });
    h.read.mockResolvedValue(batch({ notices: [notice("TEST_ONLY.private.scan-2"), notice()] }));
    const release = deferred<void>();
    const blockedGuard: ReplayDeliveryGuard = { currentIdentity: async () => binding().principal_scope_digest,
      write: async (_expected, send) => { await release.promise; return send(); } };
    await h.subscribe({ guard: blockedGuard });
    const peer: ScopedRealtimeFrame[] = [];
    await h.subscribe({ write: frame => { peer.push(frame); return true; } });
    const polling = h.hub.poll();
    await flush();
    expect(peer).toHaveLength(1);
    terminal(peer[0], "SLOW_CLIENT");
    expect(h.hub.diagnostics().queued_bytes).toBeGreaterThan(0);
    expect(h.hub.diagnostics().queued_bytes).toBeLessThanOrEqual(16384);
    release.resolve();
    await polling;
    expect(h.frames.map(frame => frame.event_type)).toEqual(["revalidate", "revalidate"]);
    expect(h.hub.diagnostics().queued_bytes).toBe(0);
  });
  it("aborts an owned cooperating read on stop without a late protected delivery", async () => {
    const h = harness();
    const entered = deferred<void>();
    h.read.mockImplementationOnce((_binding, _after, _limit, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      entered.resolve();
    }));
    await h.subscribe();
    const polling = h.hub.poll();
    await entered.promise;
    const signal = h.read.mock.calls[0][3];
    h.hub.stop();
    await polling;
    expect(signal.aborted).toBe(true);
    expect(h.frames).toHaveLength(1);
    terminal(h.frames[0], "STOPPED", "unavailable");
    expect(h.authority.writes).toBe(0);
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, source_flights: 0, queued_bytes: 0 });
    await h.hub.poll();
    expect(h.read).toHaveBeenCalledOnce();
  });
  it("settles stopped pollers but retains an abort-ignoring source slot until actual completion", async () => {
    const h = harness();
    const pending = deferred<EdgeScopedNoticeBatch>();
    h.read.mockReturnValueOnce(pending.promise);
    await h.subscribe();
    const polling = h.hub.poll();
    await flush();
    const signal = h.read.mock.calls[0][3];
    h.hub.stop();
    let settled = false;
    void polling.then(() => { settled = true; });
    try {
      await new Promise<void>(resolve=>setImmediate(resolve)); // Drain the current turn, not a guessed microtask count.
      expect(settled).toBe(true);
      expect(signal.aborted).toBe(true);
      expect(h.frames).toHaveLength(1);
      terminal(h.frames[0], "STOPPED", "unavailable");
      expect(h.hub.diagnostics()).toMatchObject({ clients: 0, source_flights: 1, timed_out_flights: 0, queued_bytes: 0 });
      h.hub.stop();
      await h.hub.poll();
      expect(h.read).toHaveBeenCalledOnce();
    } finally {
      pending.resolve(batch());
      await polling;
      await flush();
    }
    expect(h.frames).toHaveLength(1);
    expect(h.authority.writes).toBe(0);
    expect(h.hub.diagnostics()).toMatchObject({ source_flights: 0, queued_bytes: 0 });
  });
  it("aborts timed-out providers but retains their bounded slot until an ignored abort really completes", async () => {
    vi.useFakeTimers();
    const h = harness({ maximumClients: 1, readTimeoutMs: 5 });
    const pending = deferred<EdgeScopedNoticeBatch>();
    h.read.mockReturnValueOnce(pending.promise);
    await h.subscribe();
    const polling = h.hub.poll();
    await flush();
    const signal = h.read.mock.calls[0][3];
    await vi.advanceTimersByTimeAsync(5);
    await polling;
    expect(signal.aborted).toBe(true);
    terminal(h.frames[0], "SOURCE_UNAVAILABLE", "unavailable");
    expect(h.hub.diagnostics()).toMatchObject({ clients: 0, source_flights: 1, timed_out_flights: 1 });
    await h.subscribe({ binding: binding({ query_digest: "TEST_ONLY:new-reconnect-query" }) });
    await h.hub.poll();
    expect(h.read).toHaveBeenCalledOnce();
    expect(h.hub.diagnostics().source_flights).toBe(1);
    pending.resolve(batch());
    await flush();
    expect(h.hub.diagnostics()).toMatchObject({ source_flights: 0, timed_out_flights: 0 });
    await h.subscribe({ binding: binding({ query_digest: "TEST_ONLY:recovered-query" }) });
    await h.hub.poll();
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(h.frames.at(-1)?.event_type).toBe("revalidate");
  });
});
