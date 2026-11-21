/** PURE UNIT / SYNTHETIC persisted-shape fixtures, NOT source qualification,
 * Core authorization, PostgreSQL, HTTP, TLS, runtime or browser evidence.
 * Intended path: test/elp204-retained-service-heartbeat-projector.spec.ts. */
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { projectRetainedServiceHeartbeats, RetainedHeartbeatProjectionError,
  RETAINED_HEARTBEAT_MAXIMUM_ROWS } from "../src/execution/retained-service-heartbeat-projector";
import { projectionDigest } from "../src/execution/profile-projection.repository";

type Input = Parameters<typeof projectRetainedServiceHeartbeats>[0];
type Snapshot = NonNullable<Input["snapshot"]>;
type SourceRow = Snapshot["document"]["relations"][string]["items"][number];
const SOURCE = "manager.current.service-heartbeats", RELATION = "service_heartbeats", KEY = `${SOURCE}:${RELATION}`;
const TIME = "2026-10-17T12:00:00.000Z", MS = Date.parse(TIME), READ = MS + 60_000;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const CATALOGUE = hash("TEST_ONLY-heartbeat-catalogue"), CONTRACT = "TEST_ONLY-manager-contract-v2";
const ROOT_KEY = "TEST_ONLY-key-for-pure-codec-not-installed-32-bytes-minimum";
function keyed(context: readonly string[], key = ROOT_KEY) {
  // Callback obligation only: not evidence of any current ROOT/grant/source.
  const frozenContext = [...context];
  return (name: string) => `por1_${createHmac("sha256", key).update(JSON.stringify([
    "TEST_ONLY-heartbeat-record-v1", ...frozenContext, name,
  ])).digest("hex")}`;
}
function fixture(names = ["TEST_ONLY-private-service-a"]) {
  const workspaceId = "TEST_ONLY-heartbeat-projector", profileId = "PAPER_BINANCE_USDM";
  const row = (name: string): SourceRow => ({ lineage: { workspace_id: workspaceId, profile_id: profileId,
    source_contract_revision: CONTRACT, source_catalogue_sha256: CATALOGUE },
  fields: { service_name: name, last_seen_at: TIME, status: "TEST_ONLY-PRIVATE-UNINTERPRETED" } });
  const document: Snapshot["document"] = { schema_version: "portal.execution.profile-projection.v1",
    workspace_id: workspaceId, environment: "paper", profile_id: profileId,
    source_contract_revision: CONTRACT, source_catalogue_sha256: CATALOGUE,
    relations: { [KEY]: { source_id: SOURCE, relation: RELATION, availability: "AVAILABLE", reason_code: null,
      as_of: TIME, freshness: "FRESH", completeness: "COMPLETE", source_catalogue_sha256: CATALOGUE,
      items: names.map(row) } } };
  const snapshot: Snapshot = { document, sourceEpoch: "TEST_ONLY-source-epoch", sourceCursor: "TEST_ONLY-private-cursor",
    sourceAsOf: new Date(MS), receivedAt: new Date(MS + 1_000), lastSuccessfulRefreshAt: new Date(MS + 2_000),
    completeness: "COMPLETE", projectionEpoch: "00000000-0000-4000-8000-000000000001", projectionSequence: 1,
    payloadDigest: projectionDigest(document), sourceCatalogueSha256: CATALOGUE };
  const input: Input = { snapshot, binding: { workspaceId, environment: "paper", profileId,
    snapshot: { payloadDigest: snapshot.payloadDigest, projectionEpoch: snapshot.projectionEpoch,
      sourceCatalogueSha256: snapshot.sourceCatalogueSha256 } }, readAtMs: READ,
    recordIdFor: keyed([workspaceId, "paper", profileId, "TEST_ONLY-finite-heartbeat-operation"]) };
  const relation = () => snapshot.document.relations[KEY];
  const repin = () => {
    snapshot.payloadDigest = projectionDigest(snapshot.document);
    input.binding.snapshot = { payloadDigest: snapshot.payloadDigest, projectionEpoch: snapshot.projectionEpoch,
      sourceCatalogueSha256: snapshot.sourceCatalogueSha256 };
  };
  return { input, snapshot, relation, repin, row, run: () => projectRetainedServiceHeartbeats(input) };
}
type Fixture = ReturnType<typeof fixture>;
function refused(f: Fixture) {
  let caught: unknown;
  try { f.run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(RetainedHeartbeatProjectionError);
  expect(caught).toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  return caught;
}

describe("ELP2-04 retained heartbeat finite projector (pure, SYNTHETIC only)", () => {
  it("projects exact scalar clocks and never turns source text into health/status or a public name", () => {
    const f = fixture();
    Object.assign(f.relation().items[0].fields, { instance_id: "TEST_ONLY-PRIVATE-HOST",
      extra_topology: "TEST_ONLY-PRIVATE-ENDPOINT", unknown_scalar: "TEST_ONLY-PRIVATE-UNKNOWN" }); f.repin();
    const result = f.run(), record = result.view.observations[0];
    expect(result.view).toMatchObject({ environment: "paper", profile_id: "PAPER_BINANCE_USDM",
      record_basis: "PORTAL_RETAINED_OBSERVATION", capture_state: "OBSERVATIONS", availability: "AVAILABLE",
      source_as_of_ms: MS, source_as_of_reason_code: null, snapshot_received_at_ms: MS + 1_000,
      captured_source_freshness: "FRESH", captured_source_completeness: "COMPLETE",
      continuity_digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
    expect(record).toEqual({ record_id: f.input.recordIdFor("TEST_ONLY-private-service-a"), component: "SERVICE_HEARTBEAT",
      source_last_seen_at_ms: MS, source_last_seen_reason_code: null, source_status: null, health: null,
      status_reason_code: "SOURCE_STATUS_SEMANTICS_NOT_PUBLISHED" });
    expect(JSON.stringify(result)).not.toMatch(/TEST_ONLY-private-service|PRIVATE-|UNINTERPRETED|service_name|instance_id|extra_topology/);
    expect(result.private_clock_fence).toEqual({ source_as_of_identity: String(MS),
      observation_clocks: [{ record_id: record.record_id, identity: String(MS) }] });
  });
  it("accepts genuinely absent legacy catalogue, never filling a digest from the current configuration", () => {
    const f = fixture(); f.snapshot.sourceCatalogueSha256 = null;
    delete f.snapshot.document.source_catalogue_sha256; delete f.relation().source_catalogue_sha256;
    delete f.relation().items[0].lineage.source_catalogue_sha256; f.repin();
    expect(f.run().view.observations).toHaveLength(1);
    expect(JSON.stringify(f.run().view)).not.toContain(CATALOGUE);
  });
  it("accepts null-prototype own-data records without treating inherited values as source facts", () => {
    const f = fixture(); Object.setPrototypeOf(f.input.binding, null);
    Object.setPrototypeOf(f.relation().items[0].fields, null); Object.setPrototypeOf(f.snapshot.document.relations, null);
    expect(f.run().view.observations).toHaveLength(1);
  });

  it.each([
    ["null", null, null, "SOURCE_CLOCK_NOT_PUBLISHED"],
    ["missing", undefined, null, "SOURCE_CLOCK_NOT_PUBLISHED"],
    ["unparseable", "not-a-source-clock", null, "SOURCE_CLOCK_INVALID"],
    ["number", 0, null, "SOURCE_CLOCK_INVALID"],
    ["array", [TIME], null, "SOURCE_CLOCK_INVALID"],
    ["invalid date", "2026-02-30T12:00:00Z", null, "SOURCE_CLOCK_INVALID"],
    ["final newline", `${TIME}\n`, null, "SOURCE_CLOCK_INVALID"],
    ["future", new Date(READ + 1).toISOString(), null, "SOURCE_CLOCK_AHEAD_OF_READ"],
    ["explicit offset", "2026-10-17T14:00:00+02:00", MS, null],
  ])("source clock %s has honest typed value/reason at both scopes", (_label, raw, value, reason) => {
    const f = fixture(); Object.assign(f.relation().items[0].fields, { last_seen_at: raw });
    Object.assign(f.relation(), { as_of: raw }); f.repin();
    const view = f.run().view;
    expect(view.observations[0]).toMatchObject({ source_last_seen_at_ms: value, source_last_seen_reason_code: reason });
    expect(view.source_as_of_ms).toBe(value); expect(view.source_as_of_reason_code).toBe(reason);
    expect(view.snapshot_received_at_ms).toBe(MS + 1_000); // no source clock substitution
  });
  it("compares the submillisecond suffix to readAt without rounding a future observation into the present", () => {
    const f = fixture(); f.input.readAtMs = MS;
    f.snapshot.receivedAt = new Date(MS); f.snapshot.lastSuccessfulRefreshAt = new Date(MS);
    f.relation().items[0].fields.last_seen_at = "2026-10-17T12:00:00.000001Z"; f.repin();
    const future = f.run();
    expect(future.view.observations[0]).toMatchObject({ source_last_seen_at_ms: null,
      source_last_seen_reason_code: "SOURCE_CLOCK_AHEAD_OF_READ" });
    expect(future.private_clock_fence.observation_clocks[0].identity).toBe(`${MS}:001000`);
    f.relation().items[0].fields.last_seen_at = TIME; f.repin();
    expect(f.run().view.observations[0]).toMatchObject({ source_last_seen_at_ms: MS, source_last_seen_reason_code: null });
  });
  it("preserves exact clock identity privately while public continuity uses the actual published millisecond precision", () => {
    const f = fixture(); f.relation().items[0].fields.last_seen_at = "2026-10-17T12:00:00.000001Z"; f.repin();
    const first = f.run();
    f.relation().items[0].fields.last_seen_at = "2026-10-17T14:00:00.000001+02:00"; f.repin();
    expect(f.run()).toEqual(first);
    f.relation().items[0].fields.last_seen_at = "2026-10-17T12:00:00.000002Z"; f.repin();
    const second = f.run();
    expect(second.view.continuity_digest).toBe(first.view.continuity_digest);
    expect(second.private_clock_fence).not.toEqual(first.private_clock_fence);
    expect(second.view.observations[0].source_last_seen_at_ms).toBe(MS);
  });

  it("distinguishes absent snapshot, absent relation and a valid unavailable relation with no callback", () => {
    const f = fixture(), callback = vi.fn(f.input.recordIdFor); f.input.recordIdFor = callback;
    f.input.snapshot = null; f.input.binding.snapshot = null;
    expect(f.run().view).toMatchObject({ capture_state: "SNAPSHOT_NOT_CAPTURED", availability: "UNAVAILABLE",
      captured_source_freshness: null, captured_source_completeness: null, snapshot_received_at_ms: null, observations: [] });
    f.input.snapshot = f.snapshot; delete f.snapshot.document.relations[KEY]; f.repin();
    expect(f.run().view).toMatchObject({ capture_state: "RELATION_NOT_CAPTURED", availability: "UNAVAILABLE",
      captured_source_freshness: null, captured_source_completeness: null, snapshot_received_at_ms: MS + 1_000, observations: [] });
    const unavailable = fixture([]); unavailable.input.recordIdFor = callback;
    Object.assign(unavailable.relation(), { availability: "UNAVAILABLE", completeness: "UNKNOWN", freshness: "UNKNOWN", as_of: null });
    unavailable.repin();
    expect(unavailable.run().view).toMatchObject({ capture_state: "RELATION_UNAVAILABLE", availability: "UNAVAILABLE",
      captured_source_freshness: "UNKNOWN", captured_source_completeness: "UNKNOWN", observations: [] });
    expect(callback).not.toHaveBeenCalled();
  });
  it.each(["COMPLETE", "PARTIAL", "UNKNOWN"] as const)("empty %s is not missing or a false complete history", quality => {
    const f = fixture([]); f.relation().completeness = quality; f.repin();
    expect(f.run().view).toMatchObject({ availability: "AVAILABLE", observations: [],
      captured_source_completeness: quality, capture_state: quality === "COMPLETE" ? "EMPTY_COMPLETE" : "EMPTY_INCOMPLETE" });
  });
  it("rejects contradictory unavailable-with-rows instead of resurfacing earlier bytes as available", () => {
    const f = fixture(); f.relation().availability = "UNAVAILABLE"; f.repin(); refused(f);
  });

  const metadataFaults: [string, (f: Fixture) => void][] = [
    ["payload identity", f => { f.input.binding.snapshot!.payloadDigest = hash("TEST_ONLY-other-payload"); }],
    ["generation", f => { f.input.binding.snapshot!.projectionEpoch = "TEST_ONLY-other-generation"; }],
    ["catalogue identity", f => { f.input.binding.snapshot!.sourceCatalogueSha256 = hash("TEST_ONLY-other-catalogue"); }],
    ["digest final newline", f => { f.snapshot.payloadDigest += "\n"; f.input.binding.snapshot!.payloadDigest = f.snapshot.payloadDigest; }],
    ["missing earlier metadata", f => { f.input.binding.snapshot = null; }],
    ["negative read clock", f => { f.input.readAtMs = -1; }],
    ["invalid received Date", f => { f.snapshot.receivedAt = new Date(Number.NaN); }],
    ["future local receipt", f => { f.snapshot.receivedAt = new Date(READ + 1); }],
    ["future local refresh", f => { f.snapshot.lastSuccessfulRefreshAt = new Date(READ + 1); }],
    ["invalid source Date metadata", f => { f.snapshot.sourceAsOf = new Date(Number.NaN); }],
    ["unsafe sequence", f => { f.snapshot.projectionSequence = Number.MAX_SAFE_INTEGER + 1; }],
    ["workspace mismatch", f => { f.snapshot.document.workspace_id = "TEST_ONLY-wrong-workspace"; }],
    ["environment mismatch", f => { f.snapshot.document.environment = "live"; }],
    ["profile mismatch", f => { f.snapshot.document.profile_id = "LIVE_BINANCE_USDM"; }],
    ["document catalogue mismatch", f => { f.snapshot.document.source_catalogue_sha256 = hash("TEST_ONLY-other"); }],
  ];
  it.each(metadataFaults)("refuses metadata/dimension %s before IDs", (_label, mutate) => {
    const f = fixture(), callback = vi.fn(f.input.recordIdFor); f.input.recordIdFor = callback; mutate(f);
    refused(f); expect(callback).not.toHaveBeenCalled();
  });
  it.each(["alias key", "duplicate alias", "wrong source", "wrong relation", "catalogue"] as const)(
    "requires one exact canonical relation: %s", fault => {
      const f = fixture();
      if (fault === "alias key") { f.snapshot.document.relations["TEST_ONLY-alias"] = f.relation(); delete f.snapshot.document.relations[KEY]; }
      if (fault === "duplicate alias") f.snapshot.document.relations["TEST_ONLY-duplicate"] = structuredClone(f.relation());
      if (fault === "wrong source") f.relation().source_id = "manager.current.TEST_ONLY-unregistered";
      if (fault === "wrong relation") f.relation().relation = "orders";
      if (fault === "catalogue") f.relation().source_catalogue_sha256 = hash("TEST_ONLY-other");
      f.repin(); refused(f);
    });
  it.each(["workspace_id", "profile_id", "source_contract_revision", "source_catalogue_sha256"] as const)(
    "rejects exact row lineage mismatch %s", field => {
      const f = fixture(); f.relation().items[0].lineage[field] = field === "source_catalogue_sha256"
        ? hash("TEST_ONLY-other") : "TEST_ONLY-unrelated"; f.repin(); refused(f);
    });
  it.each([null, [], ["TEST_ONLY-name"], "", "nul\u0000name", "newline\nname", "del\u007fname", "é".repeat(2_049)])(
    "rejects nonfinite private PK %j before invoking ID callback", name => {
      const f = fixture(), callback = vi.fn(f.input.recordIdFor); f.input.recordIdFor = callback;
      f.relation().items[0].fields.service_name = name; f.repin(); refused(f); expect(callback).not.toHaveBeenCalled();
    });
  it("checks the UTF8 byte boundary and absent/duplicate private PK across the full input before IDs", () => {
    const f = fixture(["é".repeat(2_048)]); expect(f.run().view.observations).toHaveLength(1);
    const bad = fixture(["TEST_ONLY-good", "TEST_ONLY-good"]), callback = vi.fn(bad.input.recordIdFor);
    bad.input.recordIdFor = callback; refused(bad); expect(callback).not.toHaveBeenCalled();
    bad.relation().items[1].fields.service_name = "TEST_ONLY-second";
    delete bad.relation().items[1].fields.service_name; bad.repin(); refused(bad); expect(callback).not.toHaveBeenCalled();
  });
  it("accepts the complete 2000-row bound, not a smaller pass-only population, and refuses 2001", () => {
    const f = fixture(Array.from({ length: RETAINED_HEARTBEAT_MAXIMUM_ROWS }, (_, i) => `TEST_ONLY-service-${i}`));
    const view = f.run().view;
    expect(view.observations).toHaveLength(2_000); expect(view.captured_source_completeness).toBe("COMPLETE");
    expect(new Set(view.observations.map(row => row.record_id)).size).toBe(2_000);
    const callback = vi.fn(f.input.recordIdFor); f.input.recordIdFor = callback;
    f.relation().items.push(f.row("TEST_ONLY-service-2000")); f.repin(); refused(f); expect(callback).not.toHaveBeenCalled();
  });
  it.each(["known field", "ignored field", "array item", "relation entry"] as const)(
    "never executes getter in %s and rejects it as unsupported own data", target => {
      const f = fixture(), getter = vi.fn(() => { throw new Error("TEST_ONLY-PRIVATE-GETTER"); });
      const object = target === "relation entry" ? f.snapshot.document.relations
        : target === "array item" ? f.relation().items : f.relation().items[0].fields;
      const key = target === "relation entry" ? KEY : target === "array item" ? "0"
        : target === "known field" ? "service_name" : "ignored_private_topology";
      Object.defineProperty(object, key, { enumerable: true, configurable: true, get: getter });
      refused(f); expect(getter).not.toHaveBeenCalled(); // do NOT hash/serialize these adversarial fixtures
    });

  it.each(["invalid prefix", "final newline", "duplicate", "throw"] as const)("safely rejects ID callback %s", fault => {
    const f = fixture(["TEST_ONLY-first", "TEST_ONLY-second"]);
    f.input.recordIdFor = fault === "throw" ? () => { throw new Error("TEST_ONLY-PRIVATE-KEY-DETAIL"); }
      : fault === "invalid prefix" ? () => "not-a-keyed-record-id"
        : fault === "final newline" ? name => `${keyed([])(name)}\n` : () => keyed([])("same");
    const error = refused(f); expect(String(error)).not.toMatch(/PRIVATE-KEY-DETAIL|TEST_ONLY-first|TEST_ONLY-second/);
  });
  it("uses a caller context/key-bound callback and does not mistake an unhashed source key for the observation ID", () => {
    const f = fixture(), first = f.run().view.observations[0].record_id;
    expect(f.run().view.observations[0].record_id).toBe(first);
    const plainGuess = `por1_${createHash("sha256").update("TEST_ONLY-private-service-a").digest("hex")}`;
    expect(first).not.toBe(plainGuess);
    for (const context of [["TEST_ONLY-other-workspace"], ["TEST_ONLY-live"], ["TEST_ONLY-other-profile"], ["TEST_ONLY-other-operation"]]) {
      f.input.recordIdFor = keyed(context); expect(f.run().view.observations[0].record_id).not.toBe(first);
    }
    f.input.recordIdFor = keyed([], "TEST_ONLY-rotated-key-not-installed");
    expect(f.run().view.observations[0].record_id).not.toBe(first);
  });
  it("never reads mutable input again after the first callback; output remains detached after return too", () => {
    const f = fixture(["TEST_ONLY-first", "TEST_ONLY-second"]), identify = f.input.recordIdFor;
    const baseline = f.run(); let calls = 0;
    f.input.recordIdFor = name => {
      if (++calls === 1) {
        f.input.binding.profileId = "TEST_ONLY-retargeted"; f.snapshot.document.profile_id = "TEST_ONLY-retargeted";
        f.relation().items[1].fields.service_name = "TEST_ONLY-attacker";
        f.relation().items[1].fields.last_seen_at = null; f.relation().completeness = "UNKNOWN";
        f.snapshot.receivedAt.setTime(0);
      }
      return identify(name);
    };
    const result = f.run(); expect(calls).toBe(2); expect(result).toEqual(baseline);
    f.relation().items.length = 0; expect(result).toEqual(baseline);
  });
  it("has stable canonical order across row permutations", () => {
    const f = fixture(["TEST_ONLY-a", "TEST_ONLY-b", "TEST_ONLY-c"]), before = f.run();
    f.relation().items.reverse(); f.repin(); const after = f.run();
    expect(after).toEqual(before);
    const ids = after.view.observations.map(row => row.record_id); expect(ids).toEqual([...ids].sort());
  });
  it("does not leak private status/unknown fields, hidden finance or profile capture time through continuity", () => {
    const f = fixture(), before = f.run().view.continuity_digest;
    f.relation().items[0].fields.status = "TEST_ONLY-PRIVATE-CHANGED";
    f.relation().items[0].fields.unknown_scalar = "TEST_ONLY-PRIVATE-NEW-FIELD";
    f.snapshot.document.relations["manager.accounts:accounts"] = {
      source_id: "manager.accounts", relation: "accounts", availability: "AVAILABLE", reason_code: null,
      as_of: TIME, freshness: "FRESH", completeness: "COMPLETE", items: [{ lineage: structuredClone(f.relation().items[0].lineage),
        fields: { account_id: "TEST_ONLY-PRIVATE-ACCOUNT", equity: "999999999999999.001" } }],
    };
    f.snapshot.receivedAt = new Date(MS + 5_000); f.snapshot.lastSuccessfulRefreshAt = new Date(MS + 6_000);
    f.repin(); expect(f.run().view.continuity_digest).toBe(before);
    expect(f.run().view.snapshot_received_at_ms).toBe(MS + 5_000);
    expect(JSON.stringify(f.run())).not.toMatch(/PRIVATE-CHANGED|PRIVATE-NEW-FIELD|PRIVATE-ACCOUNT|999999999999999/);
  });
  it.each(["last-seen", "source-asof", "captured freshness", "captured completeness"] as const)(
    "changes public continuity for actually published %s", field => {
      const f = fixture(), before = f.run().view.continuity_digest;
      if (field === "last-seen") f.relation().items[0].fields.last_seen_at = new Date(MS + 1_000).toISOString();
      if (field === "source-asof") f.relation().as_of = new Date(MS + 1_000).toISOString();
      if (field === "captured freshness") f.relation().freshness = "STALE";
      if (field === "captured completeness") f.relation().completeness = "PARTIAL";
      f.repin(); expect(f.run().view.continuity_digest).not.toBe(before);
    });
});
