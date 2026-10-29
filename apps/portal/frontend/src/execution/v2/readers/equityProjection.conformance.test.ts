/**
 * Reader conformance for `equityProjection.ts` (R-C, FIXTURE lane).
 *
 * Oracle: `execution-analytics-series.v1.schema.json#/$defs/EquityProjectionResponse` through the testkit checker, and the canonical
 * `execution-analytics.equity-projection.valid.json` (digest-checked). The canonical set publishes one valid body (a PARTIAL one with an
 * explicit gap); every negative below is a mutation of it, and the schema-invalid ones are proven schema-invalid first.
 * The real route is source-dark: nothing here is a runtime read.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

import { canonicalDigest, loadCanonical } from "../testkit/loadCanonical";
import type { Draft } from "../testkit/matrix";
import { leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases } from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import {
  EQUITY_PROJECTION_SCHEMA, MAX_PROJECTION_ITEMS, compareDecimal, equityProjectionUrl, fetchEquityProjection, projectionFailureForStatus, readEquityProjectionV1,
} from "./equityProjection";

const FILE = "execution-analytics.equity-projection";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
  expect(prototypeIsClean()).toBe(true);
});

const SCHEMA = "execution-analytics-series.v1";
const PTR = "/$defs/EquityProjectionResponse";
const schemaViolations = (v: unknown) => validateAgainst(SCHEMA, PTR, v);
const base = () => loadCanonical<Draft>(FILE);
const data = (b: Draft) => ((b.analytics as Draft).data as Draft);
const analytics = (b: Draft) => (b.analytics as Draft);
const edit = (change: (b: Draft) => void): Draft => {
  const copy = base();
  change(copy);
  return copy;
};
const reasonOf = (raw: unknown, ask = {}) => {
  const read = readEquityProjectionV1(raw, ask);
  return read.kind === "refused" ? read.reason : read.kind;
};

describe("L0 · canonical, verbatim", () => {
  it("the published body is schema-valid and reads, gap and band included", () => {
    expect(schemaViolations(base())).toEqual([]);
    const read = readEquityProjectionV1(base(), { deploymentId: "dep_88" });
    expect(read.kind).toBe("equity_projection");
    if (read.kind !== "equity_projection") return;
    const p = read.projection;
    expect(p).toMatchObject({ runtimeActive: false, deploymentId: "dep_88", currency: "USDT", interval: "1m", expectedBuckets: 121, returnedBuckets: 2, completeness: "PARTIAL", panelState: "partial", isEmpty: false });
    expect(p.points.map((x) => x.equity)).toEqual(["100.000000000000000001", null, "100.250000000000000001"]);
    expect(p.points[1]!.drawdown).toBeNull(); // a hole is a hole, never 0
    expect(p.gaps).toHaveLength(1);
    expect(p.band!.points).toHaveLength(2);
    expect(p.retention).toEqual({ availability: "HOT", policyVersion: "retention.paper.v1" });
  });

  it("another schema_version is unsupported_shape; a body without one is refused", () => {
    expect(readEquityProjectionV1(edit((b) => { b.schema_version = "execution.analytics.equity-projection.v2"; }))).toEqual({ kind: "unsupported_shape", schemaVersion: "execution.analytics.equity-projection.v2" });
    expect(readEquityProjectionV1({})).toMatchObject({ kind: "refused" });
    expect(EQUITY_PROJECTION_SCHEMA).toBe("execution.analytics.equity-projection.v1");
  });
});

describe("L1 · the dark-route constants are read, never assumed", () => {
  it.each<[string, (b: Draft) => void, string]>([
    ["runtime_active true", (b) => { b.runtime_active = true; }, "runtime_active"],
    ["runtime_active as text", (b) => { b.runtime_active = "false"; }, "wrong_type"],
    ["source_side_effect_requested true", (b) => { b.source_side_effect_requested = true; }, "side_effect"],
    ["another formula", (b) => { analytics(b).formula_version = "equity_projection.v2"; }, "version"],
    ["another source authority", (b) => { analytics(b).source_authority = "BROKER"; }, "version"],
  ])("%s", (_n, change, reason) => {
    const body = edit(change);
    expect(schemaViolations(body).length).toBeGreaterThan(0);
    expect(reasonOf(body)).toBe(reason);
  });
});

describe("L2 · the named negatives", () => {
  // [name, change, reason, schema-invalid?]
  const cases: [string, (b: Draft) => void, string, boolean][] = [
    ["an unknown root key", (b) => { b.registry = []; }, "unknown_key", true],
    ["an unknown data key", (b) => { data(b).account_equity = "1"; }, "unknown_key", true],
    ["an unknown point key", (b) => { ((data(b).points as Draft[])[0] as Draft).mark = "x"; }, "unknown_key", true],
    ["a missing data key", (b) => { delete data(b).retention; }, "missing_key", true],
    ["a deployment other than the asked one", (b) => { data(b).deployment_id = "dep_99"; }, "identity_mismatch", false],
    ["a band of another run", (b) => { ((data(b).approved_band as Draft)).run_id = "run_99"; }, "band_lineage", false],
    ["a band of another artifact digest", (b) => { ((data(b).approved_band as Draft)).artifact_digest = `sha256:${"b".repeat(64)}`; }, "band_lineage", false],
    ["a bad digest", (b) => { data(b).artifact_digest = "sha256:abc"; }, "bad_value", true],
    ["an interval and seconds that disagree", (b) => { data(b).interval_seconds = 300; }, "interval_pair", false],
    ["expected_buckets 5001", (b) => { data(b).expected_buckets = 5001; }, "bad_value", true],
    ["expected_buckets 0", (b) => { data(b).expected_buckets = 0; }, "bad_value", true],
    ["returned_buckets above expected", (b) => { data(b).returned_buckets = 122; }, "count_mismatch", false],
    ["returned_buckets that is not the equities listed", (b) => { data(b).returned_buckets = 1; (data(b)).coverage = "0.0082644628099173553719008264"; }, "count_mismatch", false],
    ["a coverage that is not returned / expected", (b) => { data(b).coverage = "0.5"; }, "coverage_mismatch", false],
    ["a coverage above 1", (b) => { data(b).coverage = "1.5"; }, "coverage_mismatch", false],
    ["a null equity outside any gap (a hole read as nothing)", (b) => { data(b).gaps = []; }, "gap_unexplained", false],
    ["COMPLETE with a gap", (b) => { analytics(b).input_completeness = "COMPLETE"; }, "completeness_claim", false],
    ["an equity with a null drawdown", (b) => { ((data(b).points as Draft[])[0] as Draft).drawdown = null; }, "bad_value", false],
    ["a drawdown above zero", (b) => { ((data(b).points as Draft[])[0] as Draft).drawdown = "0.1"; }, "decimal_range", false],
    ["a drawdown below -1", (b) => { ((data(b).points as Draft[])[0] as Draft).drawdown = "-1.5"; }, "decimal_range", false],
    ["an equity written as a number", (b) => { ((data(b).points as Draft[])[0] as Draft).equity = 100; }, "wrong_type", true],
    ["an equity in exponent form", (b) => { ((data(b).points as Draft[])[0] as Draft).equity = "1e2"; }, "bad_value", true],
    ["points out of order", (b) => { data(b).points = [...(data(b).points as Draft[])].reverse(); }, "point_order", false],
    ["a point off the interval lattice", (b) => { ((data(b).points as Draft[])[2] as Draft).bucket_start = "2026-08-26T08:02:30Z"; }, "point_alignment", false],
    ["a point before the window", (b) => { ((data(b).points as Draft[])[0] as Draft).bucket_start = "2026-08-26T07:59:00Z"; }, "point_out_of_window", false],
    ["a point after the window", (b) => { ((data(b).points as Draft[])[2] as Draft).bucket_start = "2026-08-26T10:01:00Z"; }, "point_out_of_window", false],
    ["a window that ends before it starts", (b) => { data(b).requested_to = "2026-08-26T07:00:00Z"; }, "bad_value", false],
    ["a date that is not a date", (b) => { data(b).requested_from = "2026-02-30T08:00:00Z"; }, "bad_value", false],
    ["a gap outside the window", (b) => { data(b).gaps = [{ from: "2026-08-26T07:00:00Z", to: "2026-08-26T08:01:00Z", reason: "SOURCE_GAP" }]; }, "gap_invalid", false],
    ["a gap that ends before it starts", (b) => { data(b).gaps = [{ from: "2026-08-26T08:02:00Z", to: "2026-08-26T08:01:00Z", reason: "SOURCE_GAP" }]; }, "gap_invalid", false],
    ["overlapping gaps", (b) => { data(b).gaps = [{ from: "2026-08-26T08:01:00Z", to: "2026-08-26T08:03:00Z", reason: "SOURCE_GAP" }, { from: "2026-08-26T08:02:00Z", to: "2026-08-26T08:04:00Z", reason: "RETENTION" }]; }, "gap_invalid", false],
    ["a gap reason outside the vocabulary", (b) => { ((data(b).gaps as Draft[])[0] as Draft).reason = "UNKNOWN"; }, "bad_value", true],
    ["a band point with lower above upper", (b) => { (((data(b).approved_band as Draft).points as Draft[])[0] as Draft).lower = "999"; }, "band_invalid", false],
    ["band points out of order", (b) => { const pts = (data(b).approved_band as Draft).points as Draft[]; (data(b).approved_band as Draft).points = [...pts].reverse(); }, "band_invalid", false],
    ["a band point off the lattice", (b) => { (((data(b).approved_band as Draft).points as Draft[])[1] as Draft).bucket_start = "2026-08-26T08:02:10Z"; }, "point_alignment", false],
    ["a retention word outside the vocabulary", (b) => { (data(b).retention as Draft).availability = "WARM"; }, "bad_value", true],
    ["a currency in lower case", (b) => { data(b).currency = "usdt"; }, "bad_value", true],
    ["a warning with a bidi control", (b) => { analytics(b).warnings = [{ code: "X", message: "a‮b" }]; }, "bad_value", false],
    ["17 warnings", (b) => { analytics(b).warnings = Array.from({ length: 17 }, () => ({ code: "X", message: "m" })); }, "over_cap", true],
  ];
  it.each(cases)("%s", (_name, change, reason, schemaInvalid) => {
    const body = edit(change);
    if (schemaInvalid) expect(schemaViolations(body).length, "the schema refuses it too").toBeGreaterThan(0);
    else expect(schemaViolations(body), "schema-valid, refused by a named reader group").toEqual([]);
    expect(reasonOf(body, { deploymentId: "dep_88" })).toBe(reason);
  });

  it("zero points is read as EMPTY with no invented point, and may not claim ok/partial", () => {
    const empty = edit((b) => {
      data(b).points = []; data(b).returned_buckets = 0; data(b).source_rows = 0; data(b).coverage = "0"; data(b).gaps = []; data(b).approved_band = null;
      analytics(b).panel_state = "insufficient_data"; analytics(b).input_completeness = "UNKNOWN";
    });
    expect(schemaViolations(empty)).toEqual([]);
    const read = readEquityProjectionV1(empty, { deploymentId: "dep_88" });
    expect(read.kind === "equity_projection" && read.projection.isEmpty).toBe(true);
    expect(read.kind === "equity_projection" && read.projection.points).toEqual([]);
    expect(read.kind === "equity_projection" && read.projection.band).toBeNull();
    for (const state of ["ok", "partial"]) {
      const lying = structuredClone(empty);
      (lying.analytics as Draft).panel_state = state;
      expect(reasonOf(lying)).toBe("empty_claims_data");
    }
  });

  it("a window narrower than the span is refused when the window was asked", () => {
    expect(reasonOf(base(), { deploymentId: "dep_88", window: "1d" })).toBe("equity_projection"); // 2 h fits one day
    const wide = edit((b) => { data(b).requested_from = "2026-08-20T08:00:00Z"; data(b).expected_buckets = 5000; data(b).interval = "5m"; data(b).interval_seconds = 300; data(b).gaps = []; data(b).points = []; data(b).returned_buckets = 0; data(b).source_rows = 0; data(b).coverage = "0"; data(b).approved_band = null; analytics(b).panel_state = "empty"; analytics(b).input_completeness = "UNKNOWN"; });
    expect(reasonOf(wide, { window: "1d" })).toBe("window_mismatch");
  });

  it("the 5,000 point cap: 5,000 reads, 5,001 is over_cap (and schema-invalid)", () => {
    const many = (n: number) => edit((b) => {
      const d = data(b);
      d.requested_from = "2026-08-20T00:00:00Z";
      d.requested_to = "2026-08-20T23:59:00Z";
      d.interval = "1m"; d.interval_seconds = 60; d.expected_buckets = 5000;
      d.gaps = []; d.approved_band = null;
      analytics(b).input_completeness = "UNKNOWN"; analytics(b).panel_state = "ok";
      const start = Date.parse("2026-08-20T00:00:00Z");
      d.points = Array.from({ length: n }, (_, i) => ({ bucket_start: new Date(start + i * 60_000).toISOString().replace(".000Z", "Z"), equity: "1", drawdown: "0" }));
      d.returned_buckets = Math.min(n, 5000); d.source_rows = Math.min(n, 5000); d.coverage = (Math.min(n, 5000) / 5000).toString();
    });
    // 24 h at one minute is 1,440 buckets: widen the window so 5,000 fit on the lattice
    const wide = (n: number) => { const b = many(n); data(b).requested_to = "2026-08-23T11:19:00Z"; return b; };
    expect(readEquityProjectionV1(wide(5000)).kind).toBe("equity_projection");
    const over = wide(5001);
    expect(schemaViolations(over).length).toBeGreaterThan(0);
    expect(reasonOf(over)).toBe("over_cap");
    expect(MAX_PROJECTION_ITEMS).toBe(5000);
  });

  it("required members: missing or null is refused and nothing leaks", () => {
    const paths = [["runtime_active"], ["analytics"], ["analytics", "data"], ["analytics", "data", "deployment_id"], ["analytics", "data", "points"], ["analytics", "data", "gaps"],
      ["analytics", "data", "retention"], ["analytics", "data", "joined_run_id"], ["analytics", "data", "artifact_digest"], ["analytics", "panel_state"]];
    for (const c of requiredCases(base(), paths)) {
      const read = readEquityProjectionV1(c.value);
      expect(read.kind, c.name).toBe("refused");
      expect(leaked(read, c.probe), c.name).toBe(false);
    }
  });

  it("schema_version spellings, pollution and bad roots are refused without throwing", () => {
    for (const c of schemaVersionCases(base(), ["schema_version"], EQUITY_PROJECTION_SCHEMA, ["execution.analytics.v1"])) expect(readEquityProjectionV1(c.value).kind, c.name).not.toBe("equity_projection");
    for (const c of pollutionCases(base(), [[], ["analytics"], ["analytics", "data"], ["analytics", "data", "points", 0]])) {
      const read = readEquityProjectionV1(c.value);
      expect(read.kind, c.name).toBe("refused");
      expect(leaked(read, c.probe), c.name).toBe(false);
    }
    for (const c of rootCases()) expect(readEquityProjectionV1(c.value).kind, c.name).not.toBe("equity_projection");
    expect(prototypeIsClean()).toBe(true);
  });
});

describe("L3 · helpers and the request", () => {
  it("compareDecimal is exact", () => {
    expect(compareDecimal("100.000000000000000001", "100")).toBe(1);
    expect(compareDecimal("-0.0025", "0")).toBe(-1);
    expect(compareDecimal("0", "-0")).toBe(0);
    expect(compareDecimal("+1.50", "1.5")).toBe(0);
  });
  it("builds the path; sends nothing for a query the contract refuses", () => {
    expect(equityProjectionUrl({ deploymentId: "dep_88" })).toBe("/api/v1/execution/deployments/dep_88/equity-projection");
    expect(equityProjectionUrl({ deploymentId: "dep_88", window: "7d", intent: "inspect" })).toBe("/api/v1/execution/deployments/dep_88/equity-projection?window=7d&intent=inspect");
    expect(equityProjectionUrl({ deploymentId: "a/b" })).toBeNull();
    expect(equityProjectionUrl({ deploymentId: "dep_88", window: "2d" as never })).toBeNull();
    expect(equityProjectionUrl({ deploymentId: "dep_88", intent: "x" as never })).toBeNull();
  });
  it("carries the workspace as a validated optional query (workspace_id), after window and intent", () => {
    expect(equityProjectionUrl({ deploymentId: "dep_88", workspaceId: "ws_TEST_ONLY" })).toBe("/api/v1/execution/deployments/dep_88/equity-projection?workspace_id=ws_TEST_ONLY");
    expect(equityProjectionUrl({ deploymentId: "dep_88", window: "7d", intent: "inspect", workspaceId: "ws_1" })).toBe("/api/v1/execution/deployments/dep_88/equity-projection?window=7d&intent=inspect&workspace_id=ws_1");
    expect(equityProjectionUrl({ deploymentId: "dep_88", workspaceId: "" })).toBe("/api/v1/execution/deployments/dep_88/equity-projection");
    for (const bad of ["a b", "ws/1", "x".repeat(129), "ws?x=1", "ws&workspace_id=other"]) expect(equityProjectionUrl({ deploymentId: "dep_88", workspaceId: bad }), bad).toBeNull();
  });
  it("status words", () => {
    expect([400, 401, 403, 404, 500, 503].map(projectionFailureForStatus)).toEqual(["INVALID_REQUEST", "DENIED", "DENIED", "NOT_FOUND", "UNAVAILABLE", "UNAVAILABLE"]);
  });
});

describe("L4 · the fetch behind the port never throws", () => {
  const respond = (status: number, body: unknown) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response);
  it("reads the published body for the asked deployment", async () => {
    expect((await fetchEquityProjection({ deploymentId: "dep_88" }, undefined, respond(200, base()))).kind).toBe("projection");
  });
  it("a body for another deployment is MISMATCH, not shown", async () => {
    expect(await fetchEquityProjection({ deploymentId: "dep_77" }, undefined, respond(200, base()))).toEqual({ kind: "failed", word: "MISMATCH", refusal: "identity_mismatch" });
  });
  it("a refused body is UNREADABLE with the named reason; another version is UNSUPPORTED_SHAPE", async () => {
    expect(await fetchEquityProjection({ deploymentId: "dep_88" }, undefined, respond(200, edit((b) => { b.runtime_active = true; })))).toEqual({ kind: "failed", word: "UNREADABLE", refusal: "runtime_active" });
    expect(await fetchEquityProjection({ deploymentId: "dep_88" }, undefined, respond(200, edit((b) => { b.schema_version = "x.v2"; })))).toEqual({ kind: "failed", word: "UNSUPPORTED_SHAPE" });
  });
  it("sends the workspace, and sends nothing for one the contract cannot carry", async () => {
    const f = respond(200, base());
    await fetchEquityProjection({ deploymentId: "dep_88", workspaceId: "ws_TEST_ONLY" }, undefined, f);
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain("workspace_id=ws_TEST_ONLY");
    const never = vi.fn();
    expect(await fetchEquityProjection({ deploymentId: "dep_88", workspaceId: "a b" }, undefined, never as unknown as typeof fetch)).toEqual({ kind: "failed", word: "INVALID_REQUEST" });
    expect(never).not.toHaveBeenCalled();
  });
  it("problems, a network failure, an abort and an unsendable query", async () => {
    expect(await fetchEquityProjection({ deploymentId: "dep_88" }, undefined, respond(404, { error: { code: "X", message: "SECRET PROSE" } }))).toEqual({ kind: "failed", word: "NOT_FOUND" });
    expect(await fetchEquityProjection({ deploymentId: "dep_88" }, undefined, respond(503, "not json"))).toEqual({ kind: "failed", word: "UNAVAILABLE" });
    expect(await fetchEquityProjection({ deploymentId: "dep_88" }, undefined, vi.fn(async () => { throw new TypeError("x"); }) as unknown as typeof fetch)).toEqual({ kind: "failed", word: "NETWORK" });
    const c = new AbortController();
    c.abort();
    expect(await fetchEquityProjection({ deploymentId: "dep_88" }, c.signal, vi.fn(async () => { throw new DOMException("a", "AbortError"); }) as unknown as typeof fetch)).toEqual({ kind: "failed", word: "ABORTED" });
    const never = vi.fn();
    expect(await fetchEquityProjection({ deploymentId: "a b" }, undefined, never as unknown as typeof fetch)).toEqual({ kind: "failed", word: "INVALID_REQUEST" });
    expect(never).not.toHaveBeenCalled();
  });
});
