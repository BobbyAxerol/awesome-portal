/**
 * Reader conformance for `alphaFleetRealtime.ts` (Rules 9.8.3, tiers L0 to L3; ELP2-09 `alpha_fleet_overview`, BE-P16; FIXTURE_LAB).
 *
 * Contract: `packages/contracts/schemas/execution-alpha-fleet-realtime.v1.schema.json`, `$defs/AlphaFleetRealtimeSnapshot` (and
 * `ScopedRealtimeFrame`, byte for byte the ELP2-09 frame); generated `execution-alpha-fleet-realtime.d.ts`; fixtures
 * `execution-alpha-fleet-realtime.synthetic.valid.json` and `.negative.json` (TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT), each case
 * proved by the REAL producer validator before the generator wrote it. Every payload below is built from those files, never by hand.
 *
 * L0  the fixture verbatim: every snapshot case validates against the schema AND reads; every wire case reads through the SSE
 *     reader to its kind; the negative file is refused by the reader (and by the schema, except the named cross-field rule); the
 *     closed words are the schema's enums; the digest of both files is unchanged at the end; no other published family reads.
 * L1  state matrix S against the schema as oracle (reader accepts iff the schema does): stream x environment x ordinal x edge source.
 * L2  every numeric bound at both sides, 256/257 texts, 4096/4097 cursor, 20,000 reads, 70,000-character strings, a 5,000-deep object.
 * L3  generated negatives over the snapshot: never looser than the schema, never throws, never leaks its probe. Where the reader is
 *     stricter it is on purpose and named: AF-S1 display safety, AF-S2 Date range, AF-S3 revision pairing, AF-S4 closed source words.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import type { components } from "../../../../../../../packages/contracts/generated/execution-alpha-fleet-realtime";
import { CONTRACTS_DIR, canonicalDigest, listCanonical, loadCanonical, loadSchema, schemaEnum } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, type Draft } from "../testkit/matrix";
import { enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases } from "../testkit/negative";
import { timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  ALPHA_FLEET_BOUNDS,
  ALPHA_FLEET_DATASET,
  ALPHA_FLEET_DROP_REASONS,
  ALPHA_FLEET_ENVIRONMENTS,
  ALPHA_FLEET_MALFORMED_DETAILS,
  ALPHA_FLEET_NAMED_SNAPSHOT_OPERATION,
  ALPHA_FLEET_NAMED_SNAPSHOT_PATH,
  ALPHA_FLEET_SNAPSHOT_PATH,
  ALPHA_FLEET_SNAPSHOT_SCHEMA,
  ALPHA_FLEET_STREAM_PATH,
  ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS,
  FLEET_SSE_DROP_REASONS,
  baselineOf,
  pairBaselineWithFleet,
  readAlphaFleetRealtimeSnapshot,
  readFleetSseBlock,
  readFleetSseEvent,
  scopeChanged,
} from "./alphaFleetRealtime";
import { readScopedRealtimeFrame } from "./scopedRealtime";

const VALID = "execution-alpha-fleet-realtime.synthetic";
const NEGATIVE = "execution-alpha-fleet-realtime.synthetic.negative.json";
const SCHEMA = "execution-alpha-fleet-realtime.v1.schema.json";
const digestBefore = [canonicalDigest(VALID), canonicalDigest(NEGATIVE)];
afterAll(() => {
  expect([canonicalDigest(VALID), canonicalDigest(NEGATIVE)]).toEqual(digestBefore);
});

const snapshotViolations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/AlphaFleetRealtimeSnapshot", value);
const frameViolations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/ScopedRealtimeFrame", value);

interface Case { id: string; schema: string; response: Draft; wire?: string; rule?: string }
const valid = loadCanonical<{ lane: string; production_config: boolean; cases: Case[] }>(VALID);
const negative = loadCanonical<{ lane: string; production_config: boolean; cases: Case[] }>(NEGATIVE);
const byId = (id: string): Draft => structuredClone(valid.cases.find((c) => c.id === id)!.response);
const AVAILABLE = byId("AFR-SNAPSHOT-AVAILABLE");
const UNAVAILABLE = byId("AFR-SNAPSHOT-PARTIAL-VIEWER");
const accepted = (raw: unknown): boolean => readAlphaFleetRealtimeSnapshot(raw).ok;
const snapshotCases = valid.cases.filter((c) => c.schema === "AlphaFleetRealtimeSnapshot");
const wireCases = valid.cases.filter((c) => c.wire !== undefined);

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("is the synthetic lane, not production config", () => {
    for (const file of [valid, negative]) {
      expect(file.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
      expect(file.production_config).toBe(false);
    }
  });

  it.each(snapshotCases.map((c) => [c.id, c] as const))("%s validates against the schema and reads", (_id, c) => {
    expect(snapshotViolations(c.response)).toEqual([]);
    const read = readAlphaFleetRealtimeSnapshot(structuredClone(c.response));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const { snapshot } = read;
    expect(snapshot.environment).toBe(c.response.environment);
    expect(snapshot.baseline.ordinal).toBe(c.response.baseline.ordinal);
    expect(snapshot.pairsWithRevision).toBe(c.response.baseline.revision);
    expect(snapshot.noticeOrigin).toBe("PORTAL_PUBLICATION_REVISION");
    expect(snapshot.edgeNoticeSource).toBe("NOT_COMMISSIONED");
    // The barrier's quality is kept apart from any data quality.
    expect(Object.keys(snapshot)).toContain("barrierQuality");
    expect(Object.keys(snapshot)).not.toContain("quality");
  });

  it("an unavailable stream reads with its reason and has no cursor property at all", () => {
    const read = readAlphaFleetRealtimeSnapshot(UNAVAILABLE);
    expect(read.ok && read.snapshot.stream).toEqual({ state: "unavailable", reason: "WHOLE_FLEET_AUTHORITY_REQUIRED" });
    expect(read.ok && "cursor" in read.snapshot.stream).toBe(false);
  });

  it("the ordinal is kept as the source's decimal string, exact beyond a safe integer", () => {
    const read = readAlphaFleetRealtimeSnapshot(byId("AFR-SNAPSHOT-ORDINAL-WIDER-THAN-SAFE-INTEGER"));
    expect(read.ok && read.snapshot.baseline.ordinal).toBe("9007199254740993");
    expect(typeof (read.ok && read.snapshot.baseline.ordinal)).toBe("string");
  });

  it.each(wireCases.map((c) => [c.id, c] as const))("%s: the published wire reads to its frame and agrees with the schema", (_id, c) => {
    expect(frameViolations(c.response)).toEqual([]);
    const read = readFleetSseBlock(c.wire);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.frame.kind).toBe(c.response.event_type);
    expect(read.eventId).toBe(c.response.terminal ? null : c.response.resume_cursor);
    // The wire adds no figure: the frame is exactly what the frame reader makes of the data line.
    expect(read.frame).toEqual((readScopedRealtimeFrame(c.response) as { frame: unknown }).frame);
  });

  it("every negative case is refused by the reader; the schema refuses all of them except the named cross-field rule", () => {
    expect(negative.cases.length).toBeGreaterThan(20);
    for (const c of negative.cases) {
      expect(accepted(c.response), c.id).toBe(false);
      const violations = snapshotViolations(c.response);
      if (c.id === "revision-pairing-broken") expect(violations, "AF-S3 is a cross-field equality the schema cannot state").toEqual([]);
      else expect(violations.length, c.id).toBeGreaterThan(0);
    }
  });

  it("no other published family reads as an alpha-fleet snapshot", () => {
    let bodies = 0;
    for (const file of listCanonical()) {
      if (file.startsWith("execution-alpha-fleet-realtime")) continue;
      const doc = loadCanonical<Draft>(file);
      const candidates: unknown[] = [doc];
      if (Array.isArray(doc.cases)) for (const c of doc.cases) candidates.push(c, c?.response, c?.body);
      for (const candidate of candidates) {
        bodies += 1;
        expect(accepted(candidate), file).toBe(false);
      }
    }
    expect(bodies).toBeGreaterThan(50);
  });

  it("the closed words are the schema's enums and the paths are the contract's", () => {
    expect([...ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS]).toEqual(schemaEnum(SCHEMA, "/$defs/AlphaFleetStreamUnavailable/properties/reason_code"));
    expect([...ALPHA_FLEET_ENVIRONMENTS]).toEqual(schemaEnum(SCHEMA, "/$defs/AlphaFleetRealtimeSnapshot/properties/environment"));
    const defs = (loadSchema(SCHEMA) as Draft).$defs;
    expect(defs.AlphaFleetRealtimeSnapshot.properties.schema_version.const).toBe(ALPHA_FLEET_SNAPSHOT_SCHEMA);
    expect(defs.AlphaFleetRealtimeSnapshot.properties.dataset.const).toBe(ALPHA_FLEET_DATASET);
    expect(defs.AlphaFleetRealtimeSnapshot.properties.named_snapshot.properties.operation_id.const).toBe(ALPHA_FLEET_NAMED_SNAPSHOT_OPERATION);
    expect(defs.AlphaFleetRealtimeSnapshot.properties.named_snapshot.properties.path.const).toBe(ALPHA_FLEET_NAMED_SNAPSHOT_PATH);
    expect(defs.AlphaFleetStreamAvailable.properties.stream_path.const).toBe(ALPHA_FLEET_STREAM_PATH);
    const bounds = defs.AlphaFleetStreamAvailable.properties;
    expect([bounds.heartbeat_interval_ms.minimum, bounds.heartbeat_interval_ms.maximum]).toEqual([ALPHA_FLEET_BOUNDS.heartbeatIntervalMs.min, ALPHA_FLEET_BOUNDS.heartbeatIntervalMs.max]);
    expect([bounds.replay_window_ms.minimum, bounds.replay_window_ms.maximum]).toEqual([ALPHA_FLEET_BOUNDS.replayWindowMs.min, ALPHA_FLEET_BOUNDS.replayWindowMs.max]);
    expect([bounds.max_frame_bytes.minimum, bounds.max_frame_bytes.maximum]).toEqual([ALPHA_FLEET_BOUNDS.maxFrameBytes.min, ALPHA_FLEET_BOUNDS.maxFrameBytes.max]);
    expect([bounds.max_streams_per_session.minimum, bounds.max_streams_per_session.maximum]).toEqual([ALPHA_FLEET_BOUNDS.maxStreamsPerSession.min, ALPHA_FLEET_BOUNDS.maxStreamsPerSession.max]);
    expect(ALPHA_FLEET_SNAPSHOT_PATH).toBe("/api/v1/execution/manager/fleet/realtime-snapshot");
    const api = JSON.parse(readFileSync(resolve(CONTRACTS_DIR, "openapi/execution-alpha-fleet-realtime.openapi.json"), "utf8")) as Draft;
    expect(Object.keys(api.paths).sort()).toEqual([ALPHA_FLEET_SNAPSHOT_PATH, ALPHA_FLEET_STREAM_PATH].sort());
    expect(api.paths[ALPHA_FLEET_SNAPSHOT_PATH].get.operationId).toBe("executionAlphaFleetRealtimeSnapshotGetV1");
    expect(api.paths[ALPHA_FLEET_STREAM_PATH].get.operationId).toBe("executionAlphaFleetRealtimeStreamGetV1");
  });

  it("the typed words are the generated type's (a compile-time link, checked at run time)", () => {
    type Generated = components["schemas"]["AlphaFleetStreamUnavailable"]["reason_code"];
    const reasons: readonly Generated[] = ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS;
    const back: readonly (typeof ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS)[number][] = reasons;
    expect(back).toEqual([...ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS]);
    type Env = components["schemas"]["AlphaFleetRealtimeSnapshot"]["environment"];
    const envs: readonly Env[] = ALPHA_FLEET_ENVIRONMENTS;
    expect(envs).toEqual([...ALPHA_FLEET_ENVIRONMENTS]);
    expect(ALPHA_FLEET_DROP_REASONS.length).toBe(6);
    expect(ALPHA_FLEET_MALFORMED_DETAILS.length).toBe(15);
    expect(FLEET_SSE_DROP_REASONS.length).toBe(10);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrix S · the stream x environment x ordinal x Edge source, against the schema", () => {
  const unavailableStream = (reason: string) => ({ state: "UNAVAILABLE", reason_code: reason, resume_cursor: null });
  const DIMS = [
    dimensionOf("stream", [
      { label: "available", apply: () => undefined },
      ...[...ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS, "MAINTENANCE"].map((reason) => ({ label: `unavailable/${reason}`, apply: (d: Draft) => { d.stream = unavailableStream(reason); } })),
      { label: "unavailable-with-cursor", apply: (d: Draft) => { d.stream = { ...unavailableStream("STREAM_CAPACITY_REACHED"), resume_cursor: "abc" }; } },
      { label: "available-no-cursor", apply: (d: Draft) => { delete d.stream.resume_cursor; } },
      { label: "available-null-cursor", apply: (d: Draft) => { d.stream.resume_cursor = null; } },
    ]),
    dimension("environment", ["environment"], [...ALPHA_FLEET_ENVIRONMENTS, "all"]),
    dimension("ordinal", ["baseline", "ordinal"], ["0", "7", "07", "-1", "9007199254740993", "1".repeat(19), "1".repeat(20), 7]),
    dimension("edge_source", ["source", "edge_notice_source"], ["NOT_COMMISSIONED", "COMMISSIONED"]),
  ];
  const states = cartesian(AVAILABLE as Draft, DIMS);

  it("prints the matrix size", () => {
    console.info(describeCoverage("alpha fleet S cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(8 * 4 * 8 * 2);
  });
  it("the reader accepts exactly the states the schema accepts, and no others", () => {
    const valids = states.filter((s) => snapshotViolations(s.value).length === 0);
    const readable = states.filter((s) => accepted(s.value));
    console.info(`alpha fleet S: ${states.length} states, schema accepts ${valids.length}, reader accepts ${readable.length}`);
    expect(valids.length).toBeGreaterThan(0);
    expect(readable.map((s) => s.name)).toEqual(valids.map((s) => s.name));
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const schemaOk = snapshotViolations(state.value).length === 0;
    const read = readAlphaFleetRealtimeSnapshot(state.value);
    expect(read.ok).toBe(schemaOk);
    if (!read.ok) return;
    // AF-3 in every readable state: a cursor exists exactly when the stream is available.
    expect("cursor" in read.snapshot.stream).toBe(read.snapshot.stream.state === "available");
    expect(read.snapshot.edgeNoticeSource).toBe("NOT_COMMISSIONED");
    expect(baselineOf(read.snapshot).kind).toBe(read.snapshot.stream.state === "available" ? "baseline" : "stream_unavailable");
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale and bounds", () => {
  const withField = (base: Draft, path: readonly (string | number)[], value: unknown): Draft => {
    const copy = structuredClone(base);
    let node = copy;
    for (const step of path.slice(0, -1)) node = node[step];
    node[path[path.length - 1]!] = value;
    return copy;
  };
  const edge = (path: readonly string[], range: { min: number; max: number }) => {
    for (const value of [range.min, range.max]) {
      const body = withField(AVAILABLE, path, value);
      expect(snapshotViolations(body), `${path.join(".")}=${value}`).toEqual([]);
      expect(accepted(body), `${path.join(".")}=${value}`).toBe(true);
    }
    for (const value of [range.min - 1, range.max + 1]) {
      const body = withField(AVAILABLE, path, value);
      expect(snapshotViolations(body).length, `${path.join(".")}=${value}`).toBeGreaterThan(0);
      expect(accepted(body), `${path.join(".")}=${value}`).toBe(false);
    }
  };

  it("every numeric bound reads at both ends and is refused one step outside (schema agrees)", () => {
    edge(["stream", "heartbeat_interval_ms"], ALPHA_FLEET_BOUNDS.heartbeatIntervalMs);
    edge(["stream", "replay_window_ms"], ALPHA_FLEET_BOUNDS.replayWindowMs);
    edge(["stream", "max_frame_bytes"], ALPHA_FLEET_BOUNDS.maxFrameBytes);
    edge(["stream", "max_streams_per_session"], ALPHA_FLEET_BOUNDS.maxStreamsPerSession);
  });
  it("cursor: 4096 characters read, 4097 are refused", () => {
    expect(accepted(withField(AVAILABLE, ["stream", "resume_cursor"], "a".repeat(4096)))).toBe(true);
    expect(accepted(withField(AVAILABLE, ["stream", "resume_cursor"], "a".repeat(4097)))).toBe(false);
  });
  it("texts: 256 read, 257 refused (workspace, revision, generation, epoch, lineage revision, catalogue)", () => {
    for (const path of [["workspace_id"], ["baseline", "projection_generation"], ["baseline", "source_epoch"], ["baseline", "catalogue_digest"]] as const) {
      expect(accepted(withField(AVAILABLE, path, "x".repeat(256))), path.join(".")).toBe(true);
      expect(accepted(withField(AVAILABLE, path, "x".repeat(257))), path.join(".")).toBe(false);
    }
    const both = withField(withField(AVAILABLE, ["baseline", "revision"], "r".repeat(256)), ["named_snapshot", "lineage_revision"], "r".repeat(256));
    expect(accepted(both)).toBe(true);
    const long = withField(withField(AVAILABLE, ["baseline", "revision"], "r".repeat(257)), ["named_snapshot", "lineage_revision"], "r".repeat(257));
    expect(accepted(long)).toBe(false);
  });
  it("an ordinal of 19 digits reads, 20 do not", () => {
    expect(accepted(withField(AVAILABLE, ["baseline", "ordinal"], "9".repeat(19)))).toBe(true);
    expect(accepted(withField(AVAILABLE, ["baseline", "ordinal"], "9".repeat(20)))).toBe(false);
  });
  it("20,000 mixed snapshots read inside a generous budget", () => {
    const pool = snapshotCases.map((c) => c.response);
    let ok = 0;
    const { ms } = timed(() => {
      for (let i = 0; i < 20_000; i += 1) if (readAlphaFleetRealtimeSnapshot(pool[i % pool.length]).ok) ok += 1;
    });
    expect(ok).toBe(20_000);
    expect(ms).toBeLessThan(5_000);
  });
  it("70,000-character strings in any text field are refused fast", () => {
    const big = "x".repeat(70_000);
    const { ms } = timed(() => {
      for (const path of [["workspace_id"], ["scope_fingerprint"], ["baseline", "revision"], ["baseline", "ordinal"], ["stream", "resume_cursor"], ["quality", "source_set_ref"]] as const)
        expect(accepted(withField(AVAILABLE, path, big)), path.join(".")).toBe(false);
    });
    expect(ms).toBeLessThan(2_000);
  });
  it("a 5,000-deep object is not a snapshot and does not overflow the stack", () => {
    for (const c of rootCases().filter((x) => x.name.includes("5000"))) {
      expect(() => readAlphaFleetRealtimeSnapshot(c.value)).not.toThrow();
      expect(accepted(c.value)).toBe(false);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface NCase { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], validValues: readonly unknown[]): NCase[] =>
  enumCases(base, path, validValues.map(String)).filter((c) => !validValues.includes(getPath(c.value, path)));

function negativesFor(base: Draft): NCase[] {
  const available = base.stream.state === "AVAILABLE";
  return [
    ...enumsOf(base, ["environment"], [...ALPHA_FLEET_ENVIRONMENTS]),
    ...enumsOf(base, ["dataset"], [ALPHA_FLEET_DATASET]),
    ...enumsOf(base, ["semantics"], ["NOTIFICATION_ONLY"]),
    ...enumsOf(base, ["source", "notice_origin"], ["PORTAL_PUBLICATION_REVISION"]),
    ...enumsOf(base, ["source", "edge_notice_source"], ["NOT_COMMISSIONED"]),
    ...enumsOf(base, ["source", "qualification"], ["SOURCE_VERIFIED"]),
    ...requiredCases(base, Object.keys(base).map((key) => [key] as const)),
    ...requiredCases(base, Object.keys(base.baseline).map((key) => ["baseline", key] as const)),
    ...requiredCases(base, Object.keys(base.named_snapshot).map((key) => ["named_snapshot", key] as const)),
    ...requiredCases(base, Object.keys(base.source).map((key) => ["source", key] as const)),
    ...requiredCases(base, Object.keys(base.quality).map((key) => ["quality", key] as const)),
    ...stringCases(base, ["workspace_id"]),
    ...stringCases(base, ["scope_fingerprint"]),
    ...stringCases(base, ["baseline", "projection_generation"]),
    ...stringCases(base, ["baseline", "source_epoch"]),
    ...stringCases(base, ["baseline", "ordinal"]),
    ...stringCases(base, ["baseline", "revision"]),
    ...stringCases(base, ["named_snapshot", "lineage_revision"]),
    ...schemaVersionCases(base, ["schema_version"], ALPHA_FLEET_SNAPSHOT_SCHEMA, ["portal.execution.scoped-realtime.v1", "portal.execution.profile-realtime.v1", "portal.execution.manager-dataset.v1"]),
    ...pollutionCases(base, [[], ["baseline"], ["source"], ["stream"], ["quality"], ["named_snapshot"]]),
    ...(available
      ? [
          ...requiredCases(base, Object.keys(base.stream).map((key) => ["stream", key] as const)),
          ...stringCases(base, ["stream", "resume_cursor"]),
          ...integerCases(base, ["stream", "heartbeat_interval_ms"]),
          ...integerCases(base, ["stream", "replay_window_ms"]),
          ...integerCases(base, ["stream", "max_frame_bytes"]),
          ...integerCases(base, ["stream", "max_streams_per_session"]),
          ...enumsOf(base, ["stream", "state"], ["AVAILABLE", "UNAVAILABLE"]),
        ]
      : [
          ...requiredCases(base, Object.keys(base.stream).map((key) => ["stream", key] as const)),
          ...enumsOf(base, ["stream", "reason_code"], [...ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS]),
        ]),
    ...integerCases(base, ["quality", "portal_observed_at_ms"]),
    ...enumsOf(base, ["quality", "completeness"], ["COMPLETE", "PARTIAL", "UNRESOLVED"]),
  ];
}

describe.each([["available", AVAILABLE], ["unavailable", UNAVAILABLE]] as const)("L3 · negative · %s stream", (label, base) => {
  const cases = negativesFor(base as Draft);
  it("reports the case count", () => {
    console.info(`alpha fleet L3 ${label}: ${cases.length} cases`);
    expect(cases.length).toBeGreaterThan(150);
  });
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readAlphaFleetRealtimeSnapshot(c.value)).not.toThrow();
    const read = readAlphaFleetRealtimeSnapshot(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    // Never looser than the schema: a payload the schema refuses is never a snapshot.
    if (read.ok) expect(snapshotViolations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });
  it("prints how much stricter the reader is than the schema (never looser)", () => {
    let invalid = 0, looser = 0;
    const stricter: string[] = [];
    for (const c of cases) {
      if (c.category === "prototype-pollution" || c.category === "schema-swapped") continue;
      const bad = snapshotViolations(c.value).length > 0, ok = accepted(c.value);
      if (bad) invalid += 1;
      if (bad && ok) looser += 1;
      if (!bad && !ok) stricter.push(c.name);
    }
    console.info(`alpha fleet L3 ${label}: reader accepts ${looser} of ${invalid} schema-invalid payloads; refuses ${stricter.length} schema-valid ones`);
    expect(invalid).toBeGreaterThan(80);
    expect(looser).toBe(0);
    // Every schema-valid payload the reader refuses is AF-S1 (blank/NUL/bidi text) or AF-S3 (the revision pairing broken by a text edit).
    for (const name of stricter) expect(name, name).toMatch(/huge-string: .*("   "|\\u0000|‮)|huge-string: (baseline\.revision|named_snapshot\.lineage_revision) <-/);
  });
});

describe("L3 · roots that are not objects", () => {
  it.each(rootCases().map((c) => [c.name, c] as const))("%s is refused and never throws", (_name, c) => {
    expect(() => readAlphaFleetRealtimeSnapshot(c.value)).not.toThrow();
    expect(accepted(c.value)).toBe(false);
  });
});

describe("L3 · where the reader is stricter than the schema, on purpose", () => {
  const rlo = String.fromCharCode(0x202e), zwsp = String.fromCharCode(0x200b), c1 = String.fromCharCode(0x85);
  it.each([
    ["AF-S1 whitespace-only workspace", (b: Draft) => { b.workspace_id = "   "; }],
    ["AF-S1 bidi override in generation", (b: Draft) => { b.baseline.projection_generation = `g${rlo}1`; }],
    ["AF-S1 zero-width in epoch", (b: Draft) => { b.baseline.source_epoch = `e${zwsp}1`; }],
    ["AF-S1 C1 control in a reason", (b: Draft) => { b.quality.reasons = [`r${c1}1`]; }],
    ["AF-S2 portal_observed_at_ms beyond the Date range", (b: Draft) => { b.quality.portal_observed_at_ms = 9_007_199_254_740_991; }],
    ["AF-S3 the barrier names another revision than the one it pairs with", (b: Draft) => { b.named_snapshot.lineage_revision = "TEST_ONLY:other"; }],
    ["AF-S3 pairing broken on the baseline side", (b: Draft) => { b.baseline.revision = "TEST_ONLY:other"; }],
  ])("%s: schema valid, reader refuses", (_name, change) => {
    const body = structuredClone(AVAILABLE);
    change(body);
    expect(snapshotViolations(body)).toEqual([]);
    expect(accepted(body)).toBe(false);
  });
  it("AF-S3 names its detail", () => {
    const body = structuredClone(AVAILABLE);
    body.named_snapshot.lineage_revision = "TEST_ONLY:other";
    expect(readAlphaFleetRealtimeSnapshot(body)).toEqual({ ok: false, drop: { reason: "MALFORMED", detail: "pairing" } });
  });
  it("AF-4 a claimed Edge source is refused as UNSUPPORTED_SOURCE, never shown as a live feed", () => {
    const body = structuredClone(AVAILABLE);
    body.source.edge_notice_source = "COMMISSIONED";
    expect(readAlphaFleetRealtimeSnapshot(body)).toEqual({ ok: false, drop: { reason: "UNSUPPORTED_SOURCE", detail: null } });
  });
});

/* ═════════════════════════ adapters ═════════════════════════ */
describe("pairing, scope and the machine's baseline", () => {
  const read = (body: Draft) => {
    const result = readAlphaFleetRealtimeSnapshot(body);
    if (!result.ok) throw new Error("fixture must read");
    return result.snapshot;
  };
  it("pairBaselineWithFleet: the fleet answer's lineage revision, or the barrier is stale", () => {
    const snapshot = read(AVAILABLE);
    expect(pairBaselineWithFleet(snapshot, AVAILABLE.baseline.revision)).toBe("PAIRED");
    for (const other of ["TEST_ONLY:fleet-r8", "", null, undefined, 7, {}, [AVAILABLE.baseline.revision]]) expect(pairBaselineWithFleet(snapshot, other), String(other)).toBe("STALE_BASELINE");
  });
  it("baselineOf gives the machine the cursor, or 'no stream'; never a cursor for an unavailable stream", () => {
    expect(baselineOf(read(AVAILABLE))).toEqual({ kind: "baseline", cursor: AVAILABLE.stream.resume_cursor });
    expect(baselineOf(read(UNAVAILABLE))).toEqual({ kind: "stream_unavailable" });
  });
  it("scopeChanged: a different fingerprint, workspace or environment is a new scope", () => {
    const a = read(AVAILABLE);
    expect(scopeChanged(a, read(AVAILABLE))).toBe(false);
    expect(scopeChanged(a, read(byId("AFR-SNAPSHOT-PARTIAL-VIEWER")))).toBe(true);
    expect(scopeChanged(a, read({ ...AVAILABLE, environment: "live" }))).toBe(true);
    expect(scopeChanged(a, read({ ...AVAILABLE, workspace_id: "TEST_ONLY:other" }))).toBe(true);
  });
});

/* ═════════════════════════ SSE wire ═════════════════════════ */
describe("SSE wire · id, event and data", () => {
  const wire = (id: string) => valid.cases.find((c) => c.id === id)!.wire!;
  const reval = wire("AFR-WIRE-REVALIDATE"), beat = wire("AFR-WIRE-HEARTBEAT"), revoked = wire("AFR-WIRE-REVOKED");
  const drop = (raw: unknown, max?: number) => { const r = readFleetSseBlock(raw, max); return r.ok ? null : r.drop.reason; };

  it("a live frame carries its cursor as the id, a terminal frame carries none", () => {
    expect(reval).toMatch(/^id: TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME\nevent: revalidate\ndata: \{/);
    expect(revoked).toMatch(/^event: access_revoked\ndata: \{/);
    const live = readFleetSseBlock(beat);
    expect(live.ok && live.eventId).toBe("TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME");
  });
  it("an id that is not the frame's cursor, a missing id on a live frame, or an id on a terminal frame are refused", () => {
    expect(drop(reval.replace(/^id: .*\n/, "id: someone-elses-cursor\n"))).toBe("ID_MISMATCH");
    expect(drop(reval.replace(/^id: .*\n/, ""))).toBe("ID_MISMATCH");
    expect(drop(`id: x\n${revoked}`)).toBe("ID_MISMATCH");
    // A transport that cannot say (EventSource keeps the previous lastEventId) leaves the rule unapplied, not silently passed.
    const data = beat.split("\n").find((l) => l.startsWith("data: "))!.slice(6);
    expect(readFleetSseEvent({ event: "heartbeat", data }).ok).toBe(true);
    expect(readFleetSseEvent({ event: "heartbeat", data, id: "other" }).ok).toBe(false);
    expect(readFleetSseEvent({ event: "access_revoked", data: revoked.split("\n").find((l) => l.startsWith("data: "))!.slice(6), id: "stale" }).ok).toBe(false);
  });
  it("the event name must be the frame's event_type", () => {
    expect(drop(reval.replace("event: revalidate", "event: heartbeat"))).toBe("EVENT_MISMATCH");
    expect(drop(reval.replace("event: revalidate", "event: message"))).toBe("EVENT_MISMATCH");
    expect(drop(reval.replace(/event: .*\n/, ""))).toBe("MISSING_EVENT");
  });
  it("only id, event and data exist: a comment, retry, another field or a repeat voids the block", () => {
    expect(drop(`: ping\n${beat}`)).toBe("UNKNOWN_FIELD");
    expect(drop(`retry: 1000\n${beat}`)).toBe("UNKNOWN_FIELD");
    expect(drop(`${beat.trimEnd()}\nretry: 1`)).toBe("UNKNOWN_FIELD");
    expect(drop(`${beat.trimEnd()}\ndata: {}`)).toBe("DUPLICATE_FIELD");
    expect(drop(`id: a\n${beat}`)).toBe("DUPLICATE_FIELD");
    expect(drop("")).toBe("EMPTY");
    expect(drop("\n\n")).toBe("EMPTY");
    expect(drop(null)).toBe("EMPTY");
    expect(drop(7)).toBe("EMPTY");
  });
  it("data must be one JSON frame within the published bound", () => {
    expect(drop(beat.replace(/data: .*/, "data: not json"))).toBe("DATA_NOT_JSON");
    expect(drop(beat.replace(/data: .*/, "data: "))).toBe("MISSING_DATA");
    expect(drop(beat, 100)).toBe("DATA_TOO_LARGE");
    expect(drop(beat, ALPHA_FLEET_BOUNDS.maxFrameBytes.min)).toBeNull();
  });
  it("what the frame reader refuses is refused with its reason (a server-private notice batch is named, not generic)", () => {
    const batch = JSON.stringify({ notices: [], next_cursor: "x", caught_up: true });
    const read = readFleetSseBlock(`event: heartbeat\ndata: ${batch}\n\n`);
    expect(read).toEqual({ ok: false, drop: { reason: "FRAME", frame: { reason: "SERVER_PRIVATE_SHAPE", detail: null } } });
    const wrongSemantics = JSON.parse(beat.split("\n").find((l) => l.startsWith("data: "))!.slice(6));
    wrongSemantics.semantics = "EVENT_REPLAY";
    expect(readFleetSseBlock(`id: ${wrongSemantics.resume_cursor}\nevent: heartbeat\ndata: ${JSON.stringify(wrongSemantics)}\n\n`))
      .toEqual({ ok: false, drop: { reason: "FRAME", frame: { reason: "WRONG_SEMANTICS", detail: null } } });
  });
  it("never throws on a hostile block", () => {
    const hostile = ["\u0000", "id: \nevent: \ndata: ", "data: " + "x".repeat(70_000), "__proto__: x", "id: a\r\nevent: b\r\ndata: {}", ": : :", "\n".repeat(1000)];
    for (const block of hostile) expect(() => readFleetSseBlock(block)).not.toThrow();
  });
});
