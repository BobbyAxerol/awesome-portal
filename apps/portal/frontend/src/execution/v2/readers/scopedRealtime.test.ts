/**
 * Unit tests of the scoped-realtime reader (UXM-08, FIXTURE ONLY): what each published frame reads to, which refusal
 * each broken frame gets, and the binding and header rules. The schema-level proofs (L0 to L3) are in
 * `scopedRealtime.conformance.test.ts`.
 *
 * Consumer rules of ELP2-REQ-09-001 held here, each by name:
 *   C1 a notification is never a financial event: the typed frame has no field a figure could travel in
 *   C2 a heartbeat never implies quality or freshness: the typed heartbeat has no quality at all
 *   C3 a terminal frame never keeps a cursor, generation or quality
 *   C4 a wrong-context frame is dropped with a typed reason
 *   C5 the server-private transport objects never read as a frame
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../testkit/loadCanonical";
import {
  MAX_SCOPED_CURSOR,
  checkScopedBinding,
  readNativeBaselineHeaders,
  readScopedRealtimeFrame,
  type ScopedBinding,
  type ScopedRealtimeFrame,
} from "./scopedRealtime";

const FILE = "execution-scoped-realtime.synthetic";
const cases = loadCanonical<{ cases: { id: string; response: Record<string, unknown> }[] }>(FILE).cases;
const published = (id: string): Record<string, unknown> => structuredClone(cases.find((c) => c.id === id)!.response);

function frameOf(raw: unknown): ScopedRealtimeFrame {
  const read = readScopedRealtimeFrame(raw);
  if (!read.ok) throw new Error(`expected a frame, got ${read.drop.reason}/${String(read.drop.detail)}`);
  return read.frame;
}

describe("the five published frames", () => {
  it("revalidate: cursor, generation and the NOTICE quality, one action", () => {
    const frame = frameOf(published("N09-REVALIDATE"));
    expect(frame).toMatchObject({ kind: "revalidate", nextAction: "READ_NAMED_SNAPSHOT", generation: "TEST_ONLY:g1" });
    if (frame.kind !== "revalidate") throw new Error("kind");
    expect(frame.quality).toMatchObject({ completeness: "PARTIAL", freshness: "UNKNOWN", coverage: "AUTHORIZED_ONLY", confidence: "PROVISIONAL", sourceAsOfMs: null });
    expect(frame.quality.portalObservedAtMs).toBe(1_800_000_000_000);
  });

  it("C2 heartbeat: a cursor and a generation, and NO quality property at all", () => {
    const frame = frameOf(published("N09-HEARTBEAT"));
    expect(frame.kind).toBe("heartbeat");
    expect(Object.keys(frame).sort()).toEqual(["cursor", "generation", "kind", "nextAction"]);
    expect("quality" in frame).toBe(false);
  });

  it("C3 the three terminal frames keep a reason and nothing else of the stream", () => {
    for (const [id, kind, reason, action] of [
      ["N09-RESYNC_REQUIRED", "resync_required", "GENERATION_CHANGED", "READ_NAMED_SNAPSHOT"],
      ["N09-ACCESS_REVOKED", "access_revoked", "ACCESS_CHANGED", "SIGN_IN_OR_REQUEST_ACCESS"],
      ["N09-UNAVAILABLE", "unavailable", "SOURCE_UNAVAILABLE", "WAIT"],
    ] as const) {
      const frame = frameOf(published(id));
      expect(frame).toEqual({ kind, reason, nextAction: action });
    }
  });

  it("C1 no typed frame has a field a figure could travel in", () => {
    const keys = new Set<string>();
    for (const id of ["N09-REVALIDATE", "N09-HEARTBEAT", "N09-RESYNC_REQUIRED", "N09-ACCESS_REVOKED", "N09-UNAVAILABLE"]) {
      for (const key of Object.keys(frameOf(published(id)))) keys.add(key);
    }
    expect([...keys].sort()).toEqual(["cursor", "generation", "kind", "nextAction", "quality", "reason"]);
  });
});

describe("refusals are typed", () => {
  const revalidate = () => published("N09-REVALIDATE");
  const cases2: [string, unknown, string, string | null][] = [
    ["null", null, "NOT_AN_OBJECT", null],
    ["an array", [], "NOT_AN_OBJECT", null],
    ["a string", "revalidate", "NOT_AN_OBJECT", null],
    ["another contract", { schema_version: "portal.execution.profile-realtime.v1" }, "UNSUPPORTED_SCHEMA", null],
    ["no schema_version", { event_type: "revalidate" }, "MALFORMED", "required_keys"],
    ["an empty schema_version", { schema_version: "" }, "MALFORMED", "schema_version"],
    ["a numeric schema_version", { schema_version: 1 }, "MALFORMED", "schema_version"],
    ["semantics claiming data", { ...revalidate(), semantics: "SNAPSHOT" }, "WRONG_SEMANTICS", null],
    ["semantics null", { ...revalidate(), semantics: null }, "WRONG_SEMANTICS", null],
    ["an extra key", { ...revalidate(), amount: "1.00" }, "MALFORMED", "closed_keys"],
    ["a missing key", (() => { const f = revalidate(); delete f.next_action; return f; })(), "MALFORMED", "required_keys"],
    ["a missing semantics", (() => { const f = revalidate(); delete f.semantics; return f; })(), "MALFORMED", "required_keys"],
    ["an unknown event", { ...revalidate(), event_type: "delta" }, "MALFORMED", "event_type"],
    ["a case-variant event", { ...revalidate(), event_type: "Revalidate" }, "MALFORMED", "event_type"],
    ["a string terminal flag", { ...revalidate(), terminal: "false" }, "MALFORMED", "terminal_flag"],
    ["terminal true on a revalidate", { ...revalidate(), terminal: true }, "MALFORMED", "terminal_flag"],
    ["terminal false on an access_revoked", { ...published("N09-ACCESS_REVOKED"), terminal: false }, "MALFORMED", "terminal_flag"],
    ["a wrong action on a revalidate", { ...revalidate(), next_action: "WAIT" }, "MALFORMED", "next_action"],
    ["an unknown action", { ...revalidate(), next_action: "RELOAD" }, "MALFORMED", "next_action"],
    ["reconnect_required on a heartbeat", { ...published("N09-HEARTBEAT"), reconnect_required: true }, "MALFORMED", "reconnect_flag"],
    ["no reconnect on a resync", { ...published("N09-RESYNC_REQUIRED"), reconnect_required: false }, "MALFORMED", "reconnect_flag"],
    ["an unknown reason", { ...published("N09-ACCESS_REVOKED"), reason_code: "SQL_ERROR_17" }, "MALFORMED", "reason_code"],
    ["a reason on a live frame", { ...revalidate(), reason_code: "STOPPED" }, "MALFORMED", "live_carries_reason"],
    ["a terminal frame with no reason", { ...published("N09-UNAVAILABLE"), reason_code: null }, "MALFORMED", "terminal_lacks_reason"],
    ["C3 a terminal frame keeping its cursor", { ...published("N09-ACCESS_REVOKED"), resume_cursor: "abc" }, "MALFORMED", "terminal_carries_cursor"],
    ["C3 a terminal frame keeping its generation", { ...published("N09-RESYNC_REQUIRED"), projection_generation: "g" }, "MALFORMED", "terminal_carries_generation"],
    ["C3 a terminal frame keeping a quality", { ...published("N09-UNAVAILABLE"), quality: (revalidate() as { quality: unknown }).quality }, "MALFORMED", "terminal_carries_quality"],
    ["a live frame with no cursor", { ...revalidate(), resume_cursor: null }, "MALFORMED", "live_lacks_cursor"],
    ["a live frame with no generation", { ...revalidate(), projection_generation: null }, "MALFORMED", "live_lacks_generation"],
    ["a cursor with a space", { ...revalidate(), resume_cursor: "a b" }, "MALFORMED", "cursor"],
    ["a cursor with a newline at the end", { ...revalidate(), resume_cursor: "abc\n" }, "MALFORMED", "cursor"],
    ["an empty cursor", { ...revalidate(), resume_cursor: "" }, "MALFORMED", "cursor"],
    ["a numeric cursor", { ...revalidate(), resume_cursor: 7 }, "MALFORMED", "cursor"],
    ["C2 a heartbeat carrying a quality", { ...published("N09-HEARTBEAT"), quality: (revalidate() as { quality: unknown }).quality }, "MALFORMED", "heartbeat_carries_quality"],
    ["a revalidate with no quality", { ...revalidate(), quality: null }, "MALFORMED", "revalidate_lacks_quality"],
  ];
  it.each(cases2)("%s -> %s %s", (_name, raw, reason, detail) => {
    const read = readScopedRealtimeFrame(raw);
    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("accepted");
    expect(read.drop).toEqual({ reason, detail });
  });

  it("a refusal never echoes the offending value", () => {
    const secret = "SECRET-MARKER-9876";
    for (const raw of [{ ...revalidate(), resume_cursor: `${secret} ` }, { ...revalidate(), projection_generation: 5, extra: secret }, { schema_version: secret }]) {
      const read = readScopedRealtimeFrame(raw);
      expect(JSON.stringify(read)).not.toContain(secret);
    }
  });

  it("a quality that breaks the schema voids the whole frame, not just the quality", () => {
    for (const mutate of [
      (q: Record<string, unknown>) => { q.freshness = "FRESHISH"; },
      (q: Record<string, unknown>) => { q.coverage = "EVERYTHING"; },
      (q: Record<string, unknown>) => { q.source_as_of_ms = "1800000000000"; },
      (q: Record<string, unknown>) => { q.portal_observed_at_ms = -1; },
      (q: Record<string, unknown>) => { q.portal_observed_at_ms = 1.5; },
      (q: Record<string, unknown>) => { q.reasons = ["a", "a"]; },
      (q: Record<string, unknown>) => { q.extra = 1; },
      (q: Record<string, unknown>) => { delete q.confidence; },
      (q: Record<string, unknown>) => { q.source_set_ref = ""; },
    ]) {
      const frame = published("N09-REVALIDATE") as { quality: Record<string, unknown> };
      mutate(frame.quality);
      expect(readScopedRealtimeFrame(frame)).toEqual({ ok: false, drop: { reason: "MALFORMED", detail: "quality" } });
    }
  });

  it("a source_as_of_ms of null is kept as null, never 0", () => {
    const frame = frameOf(published("N09-REVALIDATE"));
    if (frame.kind !== "revalidate") throw new Error("kind");
    expect(frame.quality.sourceAsOfMs).toBeNull();
    expect(frame.quality.sourceAsOfMs).not.toBe(0);
  });
});

describe("C5 the server-private transport objects", () => {
  it.each(["N09-SOURCE-NOTICE", "N09-SOURCE-COALESCED", "N09-SOURCE-HIDDEN-ONLY"])("%s is refused by name", (id) => {
    expect(readScopedRealtimeFrame(published(id))).toEqual({ ok: false, drop: { reason: "SERVER_PRIVATE_SHAPE", detail: null } });
  });
});

describe("C4 binding: the browser checks only what it has itself observed", () => {
  const binding = (over: Partial<ScopedBinding> = {}): ScopedBinding => ({ connection: "A", arrivedOn: "A", generation: null, sourceSetRef: null, ...over });
  const revalidate = frameOf(published("N09-REVALIDATE"));
  const heartbeat = frameOf(published("N09-HEARTBEAT"));
  const terminals = ["N09-RESYNC_REQUIRED", "N09-ACCESS_REVOKED", "N09-UNAVAILABLE"].map((id) => frameOf(published(id)));

  it("accepts a frame on its own connection with nothing pinned yet", () => {
    for (const frame of [revalidate, heartbeat, ...terminals]) expect(checkScopedBinding(frame, binding())).toBeNull();
  });

  it("another connection is CONTEXT_MISMATCH, for every kind including a terminal one", () => {
    for (const frame of [revalidate, heartbeat, ...terminals]) {
      expect(checkScopedBinding(frame, binding({ arrivedOn: "B" }))).toEqual({ reason: "CONTEXT_MISMATCH", detail: null });
    }
  });

  it("a pinned generation must match on live frames; terminal frames carry none to compare", () => {
    expect(checkScopedBinding(revalidate, binding({ generation: "TEST_ONLY:g1" }))).toBeNull();
    expect(checkScopedBinding(revalidate, binding({ generation: "TEST_ONLY:g2" }))).toEqual({ reason: "GENERATION_MISMATCH", detail: null });
    expect(checkScopedBinding(heartbeat, binding({ generation: "TEST_ONLY:g2" }))).toEqual({ reason: "GENERATION_MISMATCH", detail: null });
    for (const frame of terminals) expect(checkScopedBinding(frame, binding({ generation: "TEST_ONLY:g2" }))).toBeNull();
  });

  it("a pinned source set must match on a revalidate; a heartbeat has none", () => {
    expect(checkScopedBinding(revalidate, binding({ sourceSetRef: "TEST_ONLY:source-set" }))).toBeNull();
    expect(checkScopedBinding(revalidate, binding({ sourceSetRef: "other" }))).toEqual({ reason: "SOURCE_SET_MISMATCH", detail: null });
    expect(checkScopedBinding(heartbeat, binding({ sourceSetRef: "other" }))).toBeNull();
  });

  it("the connection is checked first", () => {
    expect(checkScopedBinding(revalidate, binding({ arrivedOn: "B", generation: "x", sourceSetRef: "y" }))?.reason).toBe("CONTEXT_MISMATCH");
  });
});

describe("native baseline headers", () => {
  const baseline = () => published("N10-NATIVE-BASELINE-HEADERS") as Record<string, string>;
  const none = () => published("N10-NATIVE-NO-STREAM-HEADERS") as Record<string, string>;

  it("reads the published baseline pair and the published no-stream state", () => {
    expect(readNativeBaselineHeaders(baseline())).toEqual({ kind: "baseline", cursor: "TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME" });
    expect(readNativeBaselineHeaders(none())).toEqual({ kind: "stream_unavailable" });
  });

  it("absence is legacy transport, not a stream", () => {
    expect(readNativeBaselineHeaders({})).toBeNull();
    expect(readNativeBaselineHeaders(undefined)).toBeNull();
    expect(readNativeBaselineHeaders(null)).toBeNull();
  });

  it("a cursor on the no-stream state, a baseline with no cursor, a third key, or a bad cursor are all refused", () => {
    expect(readNativeBaselineHeaders({ ...none(), "X-Portal-Realtime-Cursor": "abc" })).toBeNull();
    expect(readNativeBaselineHeaders({ "X-Portal-Realtime-State": "NATIVE_SCOPED_BASELINE_V1" })).toBeNull();
    expect(readNativeBaselineHeaders({ ...baseline(), "Content-Type": "application/json" })).toBeNull();
    expect(readNativeBaselineHeaders({ ...baseline(), "X-Portal-Realtime-Cursor": "a b" })).toBeNull();
    expect(readNativeBaselineHeaders({ ...baseline(), "X-Portal-Realtime-Cursor": "a".repeat(MAX_SCOPED_CURSOR + 1) })).toBeNull();
    expect(readNativeBaselineHeaders({ "X-Portal-Realtime-State": "NATIVE_SCOPED_STREAM_V2" })).toBeNull();
    expect(readNativeBaselineHeaders({ "x-portal-realtime-state": "NATIVE_SCOPED_STREAM_UNAVAILABLE" })).toBeNull();
  });
});
