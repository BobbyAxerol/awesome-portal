/**
 * Reader conformance for `scopedRealtime.ts` (Rules 9.8.3, tiers L0 to L3; UXM-08, FIXTURE ONLY).
 *
 * Contract: `packages/contracts/schemas/execution-scoped-realtime.v1.schema.json`, `$defs/ScopedRealtimeFrame` (and `Quality`,
 * `NativeProfileRealtimeHeaders`); generated `execution-scoped-realtime.d.ts`; fixture `execution-scoped-realtime.synthetic`
 * (TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT). Every payload below is built from that fixture, never written by hand, and the
 * schema oracle is the testkit checker run on the published schema file itself.
 *
 * L0  the fixture verbatim: the five frame cases validate against the schema AND read to their kind; the two header cases and the
 *     three server-private cases validate against their own definitions and are refused or read as the right thing; no
 *     other published family (all `.valid.json`, every embedded body) reads as a frame; the digest of the file is unchanged at
 *     the end; the closed words are compared with the schema's enums, and the kinds with the generated type.
 * L1  state matrices against the schema as oracle (reader accepts iff the schema does):
 *       F  the whole frame: event_type x terminal x reconnect_required x next_action x cursor x generation x quality x reason (1,920)
 *       Q  the quality: completeness x freshness x coverage x confidence x source_as_of_ms x reasons (648)
 *     and the consumer rules per state (ELP2-REQ-09-001): a heartbeat has no quality, a terminal frame keeps nothing of the stream.
 * L2  cursor at 4096 and 4097, generation at 256 and 257, 32 reasons of 256 characters, 20,000 reads, 70,000-character strings
 *     refused fast, and a 5,000-deep object.
 * L3  generated negatives (enum, required, string, integer, array, schema_version, prototype pollution, bad roots) over a
 *     revalidate, a heartbeat and a terminal base: every case is refused or accepted only where the schema accepts; never throws,
 *     never leaks its probe, never accepts what the schema refuses. Where the reader is stricter it is on purpose and named:
 *       SR-S1 display safety of every text (whitespace-only, bidi and zero-width characters, C1 controls)
 *       SR-S2 clocks stay inside the Date range
 *       SR-S3 the quality's reasons are unique
 */
import { afterAll, describe, expect, it } from "vitest";

import type { components } from "../../../../../../../packages/contracts/generated/execution-scoped-realtime";
import { canonicalDigest, listCanonical, loadCanonical, loadSchema, schemaEnum } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, pairwise, type Draft } from "../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  MAX_SCOPED_CURSOR,
  MAX_SCOPED_QUALITY_REASONS,
  MAX_SCOPED_TEXT,
  SCOPED_COMPLETENESS,
  SCOPED_CONFIDENCE,
  SCOPED_COVERAGE,
  SCOPED_DROP_REASONS,
  SCOPED_EVENT_TYPES,
  SCOPED_FRESHNESS,
  SCOPED_NEXT_ACTIONS,
  SCOPED_REALTIME_SCHEMA,
  SCOPED_REASON_CODES,
  readNativeBaselineHeaders,
  readScopedRealtimeFrame,
  type ScopedRealtimeFrame,
} from "./scopedRealtime";

const FILE = "execution-scoped-realtime.synthetic";
const SCHEMA = "execution-scoped-realtime.v1.schema.json";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const frameViolations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/ScopedRealtimeFrame", value);
const headerViolations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/NativeProfileRealtimeHeaders", value);

const fixture = loadCanonical<{ lane: string; production_config: boolean; cases: { id: string; schema: string; response: Draft }[] }>(FILE);
const byId = (id: string): Draft => structuredClone(fixture.cases.find((c) => c.id === id)!.response);
const REVALIDATE = byId("N09-REVALIDATE");
const HEARTBEAT = byId("N09-HEARTBEAT");
const TERMINAL = byId("N09-ACCESS_REVOKED");
const QUALITY = structuredClone(REVALIDATE.quality);

const accepted = (raw: unknown): boolean => readScopedRealtimeFrame(raw).ok;

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("is the synthetic lane, not production config", () => {
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.production_config).toBe(false);
  });

  const frameCases = fixture.cases.filter((c) => c.schema === "ScopedRealtimeFrame");
  it("holds the five published frames", () => {
    expect(frameCases.map((c) => c.id)).toEqual(["N09-REVALIDATE", "N09-HEARTBEAT", "N09-RESYNC_REQUIRED", "N09-ACCESS_REVOKED", "N09-UNAVAILABLE"]);
  });

  it.each(frameCases.map((c) => [c.id, c] as const))("%s validates against the schema and reads to its kind", (_id, c) => {
    expect(frameViolations(c.response)).toEqual([]);
    const read = readScopedRealtimeFrame(c.response);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("refused");
    expect(read.frame.kind).toBe(c.response.event_type);
    expect(read.frame.nextAction).toBe(c.response.next_action);
  });

  it("the header cases validate against NativeProfileRealtimeHeaders and read", () => {
    for (const c of fixture.cases.filter((x) => x.schema === "NativeProfileRealtimeHeaders")) {
      expect(headerViolations(c.response), c.id).toEqual([]);
      expect(readNativeBaselineHeaders(c.response), c.id).not.toBeNull();
    }
  });

  it("the server-private cases validate against their own definitions and are never a frame", () => {
    const priv = fixture.cases.filter((x) => x.schema === "EdgeScopedNotice" || x.schema === "EdgeScopedNoticeBatch");
    expect(priv).toHaveLength(3);
    for (const c of priv) {
      expect(validateAgainst(SCHEMA, `/$defs/${c.schema}`, c.response), c.id).toEqual([]);
      expect(frameViolations(c.response).length, `${c.id} is not a frame`).toBeGreaterThan(0);
      expect(readScopedRealtimeFrame(c.response), c.id).toEqual({ ok: false, drop: { reason: "SERVER_PRIVATE_SHAPE", detail: null } });
    }
  });

  it("no other published family reads as a scoped frame (every .valid.json and every body embedded in one)", () => {
    let bodies = 0;
    for (const file of listCanonical()) {
      if (file.startsWith("execution-scoped-realtime")) continue;
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

  it("the closed words are the schema's enums", () => {
    expect([...SCOPED_EVENT_TYPES]).toEqual(schemaEnum(SCHEMA, "/$defs/ScopedRealtimeFrame/properties/event_type"));
    expect([...SCOPED_NEXT_ACTIONS]).toEqual(schemaEnum(SCHEMA, "/$defs/ScopedRealtimeFrame/properties/next_action"));
    const reasonSchema = (loadSchema(SCHEMA) as Draft).$defs.ScopedRealtimeFrame.properties.reason_code.anyOf[0] as { enum: string[] };
    expect([...SCOPED_REASON_CODES]).toEqual(reasonSchema.enum);
    expect([...SCOPED_COMPLETENESS]).toEqual(schemaEnum(SCHEMA, "/$defs/Quality/properties/completeness"));
    expect([...SCOPED_FRESHNESS]).toEqual(schemaEnum(SCHEMA, "/$defs/Quality/properties/freshness"));
    expect([...SCOPED_COVERAGE]).toEqual(schemaEnum(SCHEMA, "/$defs/Quality/properties/coverage"));
    expect([...SCOPED_CONFIDENCE]).toEqual(schemaEnum(SCHEMA, "/$defs/Quality/properties/confidence"));
    expect(SCOPED_REALTIME_SCHEMA).toBe("portal.execution.scoped-realtime.v1");
  });

  it("the typed kinds are the generated type's event_type (a compile-time link, checked at run time)", () => {
    type Generated = components["schemas"]["ScopedRealtimeFrame"]["event_type"];
    const kinds: readonly Generated[] = SCOPED_EVENT_TYPES;
    const back: readonly ScopedRealtimeFrame["kind"][] = kinds;
    expect(back).toEqual([...SCOPED_EVENT_TYPES]);
    expect(SCOPED_DROP_REASONS.length).toBe(8);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrix F · the whole frame, against the schema", () => {
  const DIMS = [
    dimension("event_type", ["event_type"], [...SCOPED_EVENT_TYPES]),
    dimension("terminal", ["terminal"], [true, false]),
    dimension("reconnect_required", ["reconnect_required"], [true, false]),
    dimension("next_action", ["next_action"], [...SCOPED_NEXT_ACTIONS]),
    dimension("resume_cursor", ["resume_cursor"], [null, "abc"]),
    dimension("projection_generation", ["projection_generation"], [null, "g1"]),
    dimension("quality", ["quality"], [null, QUALITY], (value) => (value === null ? "null" : "quality")),
    dimension("reason_code", ["reason_code"], [null, "SOURCE_UNAVAILABLE", "ACCESS_CHANGED"]),
  ];
  const states = cartesian(REVALIDATE as Draft, DIMS);

  it("prints the matrix size", () => {
    console.info(describeCoverage("scoped frame F cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(5 * 2 * 2 * 4 * 2 * 2 * 2 * 3);
  });

  it("the reader accepts exactly the states the schema accepts, and no others", () => {
    const valid = states.filter((s) => frameViolations(s.value).length === 0);
    const readable = states.filter((s) => accepted(s.value));
    console.info(`scoped frame F: ${states.length} states, schema accepts ${valid.length}, reader accepts ${readable.length}`);
    // Five kinds, each with exactly one consistent shape here (the two reasons are interchangeable on terminal kinds).
    expect(valid.length).toBeGreaterThan(0);
    expect(readable.map((s) => s.name)).toEqual(valid.map((s) => s.name));
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const schemaOk = frameViolations(state.value).length === 0;
    const read = readScopedRealtimeFrame(state.value);
    expect(read.ok).toBe(schemaOk);
    if (read.ok) {
      const frame = read.frame;
      // ELP2-REQ-09-001, state by state.
      expect(frame.kind).toBe(state.picks.event_type);
      if (frame.kind === "heartbeat") expect("quality" in frame).toBe(false);
      if (frame.kind === "revalidate") {
        expect(frame.nextAction).toBe("READ_NAMED_SNAPSHOT");
        expect(frame.quality.completeness).toBeDefined();
      }
      if (frame.kind === "resync_required" || frame.kind === "access_revoked" || frame.kind === "unavailable") {
        expect(Object.keys(frame).sort()).toEqual(["kind", "nextAction", "reason"]);
      }
    }
  });

  it("pairwise subset of the same axes meets every pair in fewer states", () => {
    const pairs = pairwise(REVALIDATE as Draft, DIMS);
    const cover = coverage(DIMS, pairs);
    console.info(describeCoverage("scoped frame F pairwise", cover));
    expect(cover.pairsCovered).toBe(cover.pairsPossible);
    expect(pairs.length).toBeLessThan(states.length);
  });
});

describe("L1 · matrix Q · the quality, against the schema", () => {
  const manyReasons = (count: number) => Array.from({ length: count }, (_, i) => `R${i}`);
  const DIMS = [
    dimension("completeness", ["quality", "completeness"], [...SCOPED_COMPLETENESS]),
    dimension("freshness", ["quality", "freshness"], [...SCOPED_FRESHNESS]),
    dimension("coverage", ["quality", "coverage"], [...SCOPED_COVERAGE]),
    dimension("confidence", ["quality", "confidence"], [...SCOPED_CONFIDENCE]),
    dimension("source_as_of_ms", ["quality", "source_as_of_ms"], [null, 1_800_000_000_000]),
    dimensionOf("reasons", [0, 1, MAX_SCOPED_QUALITY_REASONS, MAX_SCOPED_QUALITY_REASONS + 1].map((count) => ({
      label: `${count} reasons`,
      apply: (d: Draft) => { d.quality.reasons = manyReasons(count); },
    }))),
  ];
  const states = cartesian(REVALIDATE as Draft, DIMS);

  it("prints the matrix size", () => {
    console.info(describeCoverage("scoped quality Q cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(3 * 3 * 3 * 3 * 2 * 4);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const schemaOk = frameViolations(state.value).length === 0;
    expect(accepted(state.value)).toBe(schemaOk);
    // 33 reasons is the one cell the schema refuses.
    expect(schemaOk).toBe(state.picks.reasons !== `${MAX_SCOPED_QUALITY_REASONS + 1} reasons`);
    const read = readScopedRealtimeFrame(state.value);
    if (!read.ok || read.frame.kind !== "revalidate") return;
    const q = read.frame.quality;
    expect([q.completeness, q.freshness, q.coverage, q.confidence]).toEqual([
      state.picks.completeness, state.picks.freshness, state.picks.coverage, state.picks.confidence,
    ]);
    // null is kept as null; there is no 0 to mistake for a source time.
    expect(q.sourceAsOfMs === null).toBe(state.picks.source_as_of_ms === "null");
    // The quality is the NOTICE's. Nothing in the typed frame turns it into a freshness of the data.
    expect(Object.keys(read.frame).sort()).toEqual(["cursor", "generation", "kind", "nextAction", "quality"]);
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

  it("cursor: 4096 characters read, 4097 are refused (schema maxLength)", () => {
    const ok = withField(REVALIDATE, ["resume_cursor"], "a".repeat(MAX_SCOPED_CURSOR));
    const over = withField(REVALIDATE, ["resume_cursor"], "a".repeat(MAX_SCOPED_CURSOR + 1));
    expect(frameViolations(ok)).toEqual([]);
    expect(accepted(ok)).toBe(true);
    expect(frameViolations(over).length).toBeGreaterThan(0);
    expect(accepted(over)).toBe(false);
  });

  it("generation and source_set_ref: 256 read, 257 refused", () => {
    for (const path of [["projection_generation"], ["quality", "source_set_ref"]] as const) {
      expect(accepted(withField(REVALIDATE, path, "g".repeat(MAX_SCOPED_TEXT)))).toBe(true);
      expect(accepted(withField(REVALIDATE, path, "g".repeat(MAX_SCOPED_TEXT + 1)))).toBe(false);
    }
  });

  it("32 reasons of 256 characters read; the 33rd is refused", () => {
    const reasons = (n: number) => Array.from({ length: n }, (_, i) => `${i}`.padStart(4, "0").padEnd(MAX_SCOPED_TEXT, "r"));
    expect(accepted(withField(REVALIDATE, ["quality", "reasons"], reasons(32)))).toBe(true);
    expect(accepted(withField(REVALIDATE, ["quality", "reasons"], reasons(33)))).toBe(false);
  });

  it("20,000 mixed frames read inside a generous budget, and every kind comes back", () => {
    const pool = ["N09-REVALIDATE", "N09-HEARTBEAT", "N09-RESYNC_REQUIRED", "N09-ACCESS_REVOKED", "N09-UNAVAILABLE"].map(byId);
    const kinds = new Set<string>();
    const { ms } = timed(() => {
      for (let i = 0; i < 20_000; i += 1) {
        const read = readScopedRealtimeFrame(pool[i % pool.length]);
        if (read.ok) kinds.add(read.frame.kind);
      }
    });
    expect(kinds.size).toBe(5);
    expect(ms).toBeLessThan(5_000);
  });

  it("70,000-character strings in any text field are refused fast", () => {
    const big = "x".repeat(70_000);
    const { ms } = timed(() => {
      for (const path of [["resume_cursor"], ["projection_generation"], ["quality", "source_set_ref"], ["quality", "reasons"], ["reason_code"], ["event_type"]] as const) {
        expect(accepted(withField(REVALIDATE, path, path[1] === "reasons" ? [big] : big))).toBe(false);
      }
    });
    expect(ms).toBeLessThan(2_000);
  });

  it("a 5,000-deep object is not an object of this contract and does not overflow the stack", () => {
    for (const c of rootCases().filter((x) => x.name.includes("5000"))) {
      expect(() => readScopedRealtimeFrame(c.value)).not.toThrow();
      expect(accepted(c.value)).toBe(false);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));

const FRAME_KEYS = Object.keys(REVALIDATE);
const QUALITY_KEYS = Object.keys(QUALITY);

function negativesFor(base: Draft): Case[] {
  const live = base.terminal === false;
  return [
    ...enumsOf(base, ["event_type"], [...SCOPED_EVENT_TYPES]),
    ...enumsOf(base, ["next_action"], [...SCOPED_NEXT_ACTIONS]),
    ...enumsOf(base, ["reason_code"], [...SCOPED_REASON_CODES, null]),
    ...enumsOf(base, ["semantics"], ["NOTIFICATION_ONLY"]),
    ...requiredCases(base, FRAME_KEYS.map((key) => [key] as const)),
    ...stringCases(base, ["resume_cursor"]),
    ...stringCases(base, ["projection_generation"]),
    ...schemaVersionCases(base, ["schema_version"], SCOPED_REALTIME_SCHEMA, ["portal.execution.profile-realtime.v1", "portal.execution.scoped-realtime.v2", "execution.manager-realtime-snapshot.v2"]),
    ...pollutionCases(base, [[]]),
    ...(live && base.quality !== null
      ? [
          ...enumsOf(base, ["quality", "completeness"], [...SCOPED_COMPLETENESS]),
          ...enumsOf(base, ["quality", "freshness"], [...SCOPED_FRESHNESS]),
          ...enumsOf(base, ["quality", "coverage"], [...SCOPED_COVERAGE]),
          ...enumsOf(base, ["quality", "confidence"], [...SCOPED_CONFIDENCE]),
          ...requiredCases(base, QUALITY_KEYS.map((key) => ["quality", key] as const)),
          ...stringCases(base, ["quality", "source_set_ref"]),
          ...integerCases(base, ["quality", "portal_observed_at_ms"]),
          ...integerCases(base, ["quality", "source_as_of_ms"]),
          ...arrayCases(base, ["quality", "reasons"]),
          ...pollutionCases(base, [["quality"]]),
        ]
      : []),
  ];
}

const NEGATIVE_SETS: [string, Case[]][] = [
  ["revalidate", negativesFor(REVALIDATE)],
  ["heartbeat", negativesFor(HEARTBEAT)],
  ["access_revoked", negativesFor(TERMINAL)],
];

describe.each(NEGATIVE_SETS)("L3 · negative · %s", (label, cases) => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of cases) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`scoped frame L3 ${label}: ${cases.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")})`);
    expect(cases.length).toBeGreaterThan(label === "revalidate" ? 200 : 100);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readScopedRealtimeFrame(c.value)).not.toThrow();
    const read = readScopedRealtimeFrame(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    // Never looser than the schema: a payload the schema refuses is never a frame.
    if (read.ok) expect(frameViolations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
    // And an unknown word is never a state.
    if (c.category === "unknown-enum" && read.ok) expect(frameViolations(c.value)).toEqual([]);
  });

  it("prints how much stricter the reader is than the schema, by category (never looser)", () => {
    let invalid = 0;
    let looser = 0;
    const stricter: string[] = [];
    for (const c of cases) {
      if (c.category === "prototype-pollution" || c.category === "schema-swapped") continue;
      const bad = frameViolations(c.value).length > 0;
      const ok = accepted(c.value);
      if (bad) invalid += 1;
      if (bad && ok) looser += 1;
      if (!bad && !ok) stricter.push(c.name);
    }
    console.info(`scoped frame L3 ${label}: reader accepts ${looser} of ${invalid} schema-invalid payloads; refuses ${stricter.length} schema-valid ones`);
    expect(invalid).toBeGreaterThan(50);
    expect(looser).toBe(0);
    // Every schema-valid payload the reader refuses is SR-S1: a text that is blank, or carries a NUL (the schema's pattern
    // forbids it only on the generation and the cursor, not on source_set_ref or a reason) or a bidi character.
    for (const name of stricter) expect(name, name).toMatch(/huge-string: .*("   "|\\u0000|\u202e)/);
  });
});

describe("L3 · roots that are not objects", () => {
  it.each(rootCases().map((c) => [c.name, c] as const))("%s is refused and never throws", (_name, c) => {
    expect(() => readScopedRealtimeFrame(c.value)).not.toThrow();
    expect(readScopedRealtimeFrame(c.value).ok).toBe(false);
  });
});

describe("L3 · where the reader is stricter than the schema, on purpose", () => {
  const rlo = String.fromCharCode(0x202e);
  const zwsp = String.fromCharCode(0x200b);
  const c1 = String.fromCharCode(0x85);
  it.each([
    ["SR-S1 whitespace-only generation", (b: Draft) => { b.projection_generation = "   "; }],
    ["SR-S1 bidi override in generation", (b: Draft) => { b.projection_generation = `g${rlo}1`; }],
    ["SR-S1 zero-width in source_set_ref", (b: Draft) => { b.quality.source_set_ref = `s${zwsp}1`; }],
    ["SR-S1 C1 control in a reason", (b: Draft) => { b.quality.reasons = [`r${c1}1`]; }],
    ["SR-S1 whitespace-only reason", (b: Draft) => { b.quality.reasons = [" "]; }],
    ["SR-S2 portal_observed_at_ms beyond the Date range", (b: Draft) => { b.quality.portal_observed_at_ms = 9_007_199_254_740_991; }],
    ["SR-S2 source_as_of_ms beyond the Date range", (b: Draft) => { b.quality.source_as_of_ms = 9_007_199_254_740_991; }],
    ["SR-S3 duplicate reasons", (b: Draft) => { b.quality.reasons = ["same", "same"]; }],
  ])("%s: schema valid, reader refuses", (_name, change) => {
    const body = structuredClone(REVALIDATE);
    change(body);
    expect(frameViolations(body)).toEqual([]);
    expect(accepted(body)).toBe(false);
  });
});
