/** R-C: the strict V2 reader over the published SYNTHETIC fixtures and negatives. No source is commissioned; nothing here is acceptance evidence. */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../testkit/loadCanonical";
import { EQUITY_PROJECTION_SOURCE_SCHEMA, SOURCE_REFUSALS, readEquityProjectionSourceV2, type SourceRefusal } from "./equityProjectionV2";
import { readEquityProjectionV1 } from "./equityProjection";

const fixture = loadCanonical<{ lane: string; source_commissioned: boolean; cases: Record<string, any> }>("execution-equity-projection-source.synthetic");
const v1 = loadCanonical<Record<string, unknown>>("execution-analytics.equity-projection");
const copy = (name: string, patch: (b: any) => void = () => undefined) => { const b = structuredClone(fixture.cases[name]); patch(b); return b; };
const refusal = (raw: unknown, ask = {}) => { const r = readEquityProjectionSourceV2(raw, ask); return r.kind === "refused" ? r.reason : r.kind; };

describe("equity projection V2 reader: canonical synthetic fixtures", () => {
  it("is the uncommissioned synthetic lane", () => {
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.source_commissioned).toBe(false);
  });
  it("available: both sections read; the band has its own lineage; a missing bucket stays null", () => {
    const r = readEquityProjectionSourceV2(fixture.cases.available, { workspaceId: "ws_TEST_ONLY", deploymentId: "dep_88", environment: "paper" });
    expect(r.kind).toBe("equity_projection_source");
    if (r.kind !== "equity_projection_source") return;
    const { series, band, isUncommissioned } = r.projection;
    expect(isUncommissioned).toBe(false);
    expect(series.availability).toBe("AVAILABLE");
    expect(band.availability).toBe("AVAILABLE");
    if (series.availability !== "AVAILABLE" || band.availability !== "AVAILABLE") return;
    expect(series.points).toHaveLength(24);
    expect(series.points.filter((p) => p.equity === null)).toHaveLength(1);
    expect(series.points.find((p) => p.equity === null)?.drawdown).toBeNull();
    expect(series.lineage.sourceDigest).not.toBe(band.lineage.artifactDigest);
    expect(series.drawdown).toMatchObject({ authority: "PORTAL_DERIVED", confirmedBySource: false });
  });
  it("series_only: an available series with a typed band absence (independent sections)", () => {
    const r = readEquityProjectionSourceV2(fixture.cases.series_only);
    expect(r.kind === "equity_projection_source" && r.projection.band).toEqual({ availability: "ABSENT", reasonCode: "BAND_NOT_APPROVED" });
    expect(r.kind === "equity_projection_source" && r.projection.series.availability).toBe("AVAILABLE");
  });
  it("series_absent: the uncommissioned state, with no point anywhere", () => {
    const r = readEquityProjectionSourceV2(fixture.cases.series_absent);
    expect(r.kind === "equity_projection_source" && r.projection.isUncommissioned).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/points|equity"|drawdown/);
  });
  it("not_authorized: typed absence for both, not an uncommissioned claim", () => {
    const r = readEquityProjectionSourceV2(fixture.cases.not_authorized);
    expect(r.kind === "equity_projection_source" && r.projection.series).toEqual({ availability: "ABSENT", reasonCode: "NOT_AUTHORIZED" });
    expect(r.kind === "equity_projection_source" && r.projection.isUncommissioned).toBe(false);
  });
  it("source_rows may exceed the points: 5000 observations aggregated into 60 buckets is accepted", () => {
    const body = copy("series_only"), start = Date.parse("2026-08-26T00:00:00Z");
    Object.assign(body.series, { interval: "1m", interval_seconds: 60, window_from: "2026-08-26T00:00:00Z", window_to: "2026-08-26T01:00:00Z",
      expected_buckets: 60, returned_buckets: 60, source_rows: 5000, coverage: "1", gaps: [],
      points: Array.from({ length: 60 }, (_, i) => ({ bucket_start: new Date(start + i * 60000).toISOString().replace(".000Z", "Z"), equity: "100", drawdown: "0" })) });
    const r = readEquityProjectionSourceV2(body);
    expect(r.kind).toBe("equity_projection_source");
    expect(r.kind === "equity_projection_source" && r.projection.series.availability === "AVAILABLE" && r.projection.series.sourceRows).toBe(5000);
  });
  it("every vocabulary word is reachable from the reader, and the refusal vocabulary has no duplicate", () => {
    expect(new Set(SOURCE_REFUSALS).size).toBe(SOURCE_REFUSALS.length);
  });
});

describe("equity projection V2 reader: refusals", () => {
  const cases: [SourceRefusal, string, (b: any) => void][] = [
    ["unknown_key", "available", (b) => { b.extra = 1; }],
    ["unknown_key", "available", (b) => { b.series.points[0].extra = 1; }],
    ["unknown_key", "available", (b) => { b.band.lineage.extra = 1; }],
    ["missing_key", "available", (b) => { delete b.workspace_id; }],
    ["missing_key", "available", (b) => { delete b.series.lineage; }],
    ["band_lineage", "available", (b) => { delete b.band.lineage; }],
    ["band_lineage", "available", (b) => { b.band.lineage.immutable = false; }],
    ["band_lineage", "available", (b) => { b.band.lineage.approval_authority = "EXECUTION"; }],
    ["absence_shape", "series_only", (b) => { b.band.reason_code = "MADE_UP"; }],
    ["absence_shape", "series_only", (b) => { b.band.reason_code = "SOURCE_STALE"; }],
    ["absence_shape", "series_absent", (b) => { b.series.reason_code = "BAND_NOT_APPROVED"; }],
    ["unknown_key", "series_absent", (b) => { b.series.points = []; }],
    ["missing_key", "series_absent", (b) => { delete b.series.reason_code; }],
    ["unknown_key", "available", (b) => { b.series.reason_code = "SOURCE_NOT_COMMISSIONED"; }],
    ["side_effect", "available", (b) => { b.source_side_effect_requested = true; }],
    ["bad_value", "available", (b) => { b.environment = "research"; }],
    ["over_cap", "available", (b) => { b.series.points = Array.from({ length: 5001 }, (_, i) => ({ bucket_start: new Date(Date.UTC(2026, 7, 26) + i * 60000).toISOString(), equity: "1", drawdown: "0" })); }],
    ["bad_value", "available", (b) => { b.request.limit = 5001; }],
    ["over_limit", "available", (b) => { b.request.limit = 10; }],
    ["count_mismatch", "available", (b) => { b.series.returned_buckets = 23; }],
    ["source_rows", "available", (b) => { b.series.source_rows = 22; }],
    ["source_rows", "available", (b) => { b.series.points.forEach((p: any) => { p.equity = null; p.drawdown = null; }); b.series.source_rows = 5; b.series.coverage = "0"; }],
    ["source_rows", "available", (b) => { b.series.points.forEach((p: any) => { p.equity = null; p.drawdown = null; }); b.series.source_rows = 0; b.series.coverage = "0.5"; }],
    ["interval_pair", "available", (b) => { b.series.interval = "1h"; b.series.interval_seconds = 60; }],
    ["interval_pair", "available", (b) => { b.series.interval = "1m"; b.series.interval_seconds = 3600; }],
    ["coverage_range", "available", (b) => { b.series.coverage = "-1"; }],
    ["coverage_range", "available", (b) => { b.series.coverage = "2"; }],
    ["coverage_range", "available", (b) => { b.series.coverage = "1.0001"; }],
    ["point_order", "available", (b) => { b.series.points.reverse(); }],
    ["point_out_of_window", "available", (b) => { b.series.window_to = "2026-08-26T12:00:00Z"; }],
    ["null_pairing", "available", (b) => { b.series.points[0].drawdown = null; }],
    ["decimal_range", "available", (b) => { b.series.points[0].drawdown = "0.5"; }],
    ["drawdown_derivation", "available", (b) => { b.series.drawdown.confirmed_by_source = true; }],
    ["drawdown_derivation", "available", (b) => { b.series.drawdown.peak_resets_on_gap = true; }],
    ["gap_invalid", "available", (b) => { b.series.gaps[0].to = b.series.gaps[0].from; }],
    ["band_invalid", "available", (b) => { b.band.points[0].lower = "999"; }],
    ["band_invalid", "available", (b) => { b.band.points[0].bucket_start = "2030-01-01T00:00:00Z"; }],
    ["currency_mismatch", "available", (b) => { b.band.currency = "EUR"; }],
    ["wrong_type", "available", (b) => { b.series.points[1].equity = 100.5; }],
    ["bad_value", "available", (b) => { b.series.points[1].bucket_start = "yesterday"; }],
  ];
  it.each(cases)("%s: %#", (reason, name, patch) => {
    expect(refusal(copy(name, patch))).toBe(reason);
  });
  it("mismatched workspace, deployment or environment is refused", () => {
    expect(refusal(fixture.cases.available, { workspaceId: "ws_other" })).toBe("identity_mismatch");
    expect(refusal(fixture.cases.available, { deploymentId: "dep_other" })).toBe("identity_mismatch");
    expect(refusal(fixture.cases.available, { environment: "live" })).toBe("identity_mismatch");
  });
  it("an own __proto__ key and non-objects are refused, and none throws", () => {
    const withProto = JSON.parse(JSON.stringify(fixture.cases.series_absent).replace('"schema_version"', '"__proto__":{},"schema_version"'));
    expect(refusal(withProto)).toBe("unknown_key");
    for (const raw of [null, 1, "x", [], undefined]) expect(readEquityProjectionSourceV2(raw).kind).toBe("refused");
  });
  it("another schema_version is unsupported_shape: V1 stays its own contract and is never coerced into V2", () => {
    expect(readEquityProjectionSourceV2(v1)).toEqual({ kind: "unsupported_shape", schemaVersion: "execution.analytics.equity-projection.v1" });
    expect(readEquityProjectionV1(v1).kind).toBe("equity_projection");
    expect(readEquityProjectionV1(fixture.cases.available).kind).not.toBe("equity_projection");
    expect(EQUITY_PROJECTION_SOURCE_SCHEMA).toBe(fixture.cases.available.schema_version);
  });
});
