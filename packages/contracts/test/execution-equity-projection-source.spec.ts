/** R-C: source-backed equity projection V2. Synthetic fixtures only; nothing here asserts an Edge source. V1 stays fixture-only. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { equityProjectionSourceResponse, parseEquityProjectionQuery } from "../../../apps/control-api/src/equity-projection/equity-projection-source.contract";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const schema = load("schemas/execution-equity-projection-source.v2.schema.json"), api = load("openapi/execution-equity-projection-source.openapi.json");
const fixture = load("fixtures/execution-equity-projection-source.synthetic.valid.json");
const v1 = load("schemas/execution-analytics-series.v1.schema.json"), v1Fixture = load("fixtures/execution-analytics.equity-projection.valid.json");
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
const validate = ajv.compile(schema);
const clone = <T>(v: T): T => structuredClone(v);
const both = (value: unknown, expected: boolean) => {
  expect(validate(value), "JSON Schema " + JSON.stringify(validate.errors?.slice(0, 2))).toBe(expected);
  expect(equityProjectionSourceResponse.safeParse(value).success, "zod").toBe(expected);
};
const cases = fixture.cases;

describe("R-C equity projection source V2 contract", () => {
  it("is a synthetic, uncommissioned lane and does not touch V1", () => {
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.source_commissioned).toBe(false);
    expect(v1.$defs.EquityProjectionResponse.properties.runtime_active.const).toBe(false);
    expect(v1Fixture.runtime_active).toBe(false);
    expect(Object.keys(api.paths)).toEqual(["/api/v1/execution/deployments/{deploymentId}/equity-projection/source"]);
    expect(api.paths[Object.keys(api.paths)[0]!].get.operationId).toBe("executionEquityProjectionSource");
    const names = api.paths[Object.keys(api.paths)[0]!].get.parameters.map((p: any) => p.name);
    expect(names).toEqual(["deploymentId", "workspace_id", "environment", "window", "intent", "limit", "cursor"]);
  });
  it.each(["available", "series_only", "series_absent", "not_authorized"])("fixture %s is valid in JSON Schema and zod", name => both(cases[name], true));
  it("series and band are independent: series available with band absent, and absent series is not an empty series", () => {
    expect(cases.series_only.series.availability).toBe("AVAILABLE");
    expect(cases.series_only.band).toEqual({ availability: "ABSENT", reason_code: "BAND_NOT_APPROVED" });
    expect(cases.series_absent.series).toEqual({ availability: "ABSENT", reason_code: "SOURCE_NOT_COMMISSIONED" });
    expect(JSON.stringify(cases.series_absent)).not.toMatch(/"points"|"equity"|"lower"/);
  });
  it("the series and the band each carry their own revision and digest", () => {
    const a = cases.available;
    expect(a.series.lineage.source_digest).not.toBe(a.band.lineage.artifact_digest);
    expect(a.series.lineage.source_revision).not.toBe(a.band.lineage.band_revision);
    expect(a.band.lineage).toMatchObject({ approval_authority: "RESEARCH", immutable: true });
  });
  it("missing buckets are null (never 0) and are listed as gaps", () => {
    const missing = cases.available.series.points.filter((p: any) => p.equity === null);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ equity: null, drawdown: null });
    expect(cases.available.series.gaps).toHaveLength(1);
  });

  /** 60 one-minute buckets of one hour, every bucket present. Used for the aggregation cases. */
  const hour = (patch: (series: any) => void = () => undefined) => {
    const body = clone(cases.series_only), start = Date.parse("2026-08-26T00:00:00Z");
    Object.assign(body.series, { interval: "1m", interval_seconds: 60, window_from: "2026-08-26T00:00:00Z", window_to: "2026-08-26T01:00:00Z",
      expected_buckets: 60, returned_buckets: 60, source_rows: 60, coverage: "1", gaps: [],
      points: Array.from({ length: 60 }, (_, i) => ({ bucket_start: new Date(start + i * 60000).toISOString().replace(".000Z", "Z"), equity: "100", drawdown: "0" })) });
    patch(body.series);
    return body;
  };
  it("interval and interval_seconds are one closed pair, at both layers", () => {
    both(hour(), true);
    for (const [name, seconds] of [["1h", 60], ["1m", 3600], ["5m", 60], ["1d", 3600]] as const) both(hour(s => { s.interval = name; s.interval_seconds = seconds; }), false);
    both(hour(s => { s.interval = "2m"; }), false);
    both(hour(s => { s.interval_seconds = 61; }), false);
  });
  it("coverage is a ratio in [0, 1], at both layers", () => {
    for (const ok of ["0", "1", "0.5", "0.958333333333333333333333", "1.000"]) both(hour(s => { s.coverage = ok; }), true);
    for (const bad of ["-1", "2", "1.0001", "-0.5", "+0.5", "01", "1.5", "NaN", "", "0.", ".5"]) both(hour(s => { s.coverage = bad; }), false);
  });
  it("source_rows may EXCEED the points: 5000 observations aggregated into 60 buckets is legitimate", () => {
    both(hour(s => { s.source_rows = 5000; }), true);
    both(hour(s => { s.source_rows = 9007199254740991; }), true);
  });
  it("source_rows impossible cases: below the non-null buckets, nonzero with no value, zero with a value, negative or fractional", () => {
    // JSON Schema expresses zero <=> no value; zod also enforces source_rows >= non-null buckets (not expressible across items).
    const nulls = (s: any) => { for (const p of s.points) { p.equity = null; p.drawdown = null; } };
    both(hour(s => { nulls(s); s.source_rows = 0; s.coverage = "0"; }), true);
    both(hour(s => { nulls(s); s.source_rows = 5; s.coverage = "0"; }), false);
    both(hour(s => { nulls(s); s.source_rows = 0; s.coverage = "0.5"; }), false);
    both(hour(s => { s.source_rows = 0; s.coverage = "0"; }), false);
    both(hour(s => { s.source_rows = -1; }), false);
    both(hour(s => { s.source_rows = 1.5; }), false);
    const below = hour(s => { s.source_rows = 59; });
    expect(validate(below), "schema alone cannot express rows >= non-null buckets").toBe(true);
    expect(equityProjectionSourceResponse.safeParse(below).success).toBe(false);
  });
  it("negatives: unknown keys at every level", () => {
    for (const patch of [(b: any) => { b.extra = 1; }, (b: any) => { b.request.extra = 1; }, (b: any) => { b.series.extra = 1; },
      (b: any) => { b.band.extra = 1; }, (b: any) => { b.series.lineage.extra = 1; }, (b: any) => { b.band.lineage.extra = 1; },
      (b: any) => { b.series.points[0].extra = 1; }, (b: any) => { b.series.drawdown.extra = 1; }]) {
      const body = clone(cases.available); patch(body); both(body, false);
    }
  });
  it("negatives: over the hard cap of 5,000 points (series, band, buckets, limit)", () => {
    const series = clone(cases.available); series.series.points = Array.from({ length: 5001 }, (_, i) => ({ bucket_start: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(), equity: "1", drawdown: "0" }));
    both(series, false);
    const band = clone(cases.available); band.band.points = Array.from({ length: 5001 }, (_, i) => ({ bucket_start: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(), lower: "1", upper: "2" }));
    both(band, false);
    const buckets = clone(cases.available); buckets.series.expected_buckets = 5001; both(buckets, false);
    const limit = clone(cases.available); limit.request.limit = 5001; both(limit, false);
    const zero = clone(cases.available); zero.request.limit = 0; both(zero, false);
  });
  it("negatives: AVAILABLE with a reason, ABSENT without one, ABSENT carrying data, unknown reason", () => {
    for (const patch of [(b: any) => { b.series.reason_code = "SOURCE_NOT_COMMISSIONED"; }, (b: any) => { b.series.availability = "AVAILABLE"; b.band = { ...cases.available.band, reason_code: "BAND_NOT_APPROVED" }; },
      (b: any) => { delete b.band.reason_code; }, (b: any) => { b.band.points = []; },
      (b: any) => { b.band = { availability: "ABSENT", reason_code: "RETENTION_FOREVER" }; },
      (b: any) => { b.band = { availability: "ABSENT", reason_code: "SOURCE_STALE" }; }, // a series-only reason
      (b: any) => { b.series = { availability: "ABSENT", reason_code: "BAND_NOT_APPROVED" }; }, // a band-only reason
      (b: any) => { b.series = { availability: "UNKNOWN" }; }]) {
      const body = clone(cases.series_only); patch(body); both(body, false);
    }
    const absentNoReason = clone(cases.series_absent); delete absentNoReason.series.reason_code; both(absentNoReason, false);
    const absentWithData = clone(cases.series_absent); absentWithData.series.points = []; both(absentWithData, false);
  });
  it("negatives: a band without lineage, or with unapproved/mutable lineage", () => {
    for (const patch of [(b: any) => { delete b.band.lineage; }, (b: any) => { delete b.band.lineage.artifact_digest; },
      (b: any) => { b.band.lineage.immutable = false; }, (b: any) => { b.band.lineage.approval_authority = "EXECUTION"; },
      (b: any) => { delete b.band.lineage.approval_reference; }, (b: any) => { b.band.lineage.artifact_digest = "sha256:short"; }]) {
      const body = clone(cases.available); patch(body); both(body, false);
    }
  });
  it("negatives: a series without its own lineage or with a bad drawdown derivation", () => {
    for (const patch of [(b: any) => { delete b.series.lineage; }, (b: any) => { delete b.series.lineage.source_digest; },
      (b: any) => { b.series.lineage.account_scope = "ACCOUNT"; }, (b: any) => { delete b.series.drawdown; },
      (b: any) => { b.series.drawdown.formula = "value - max"; }, (b: any) => { b.series.drawdown.peak_resets_on_gap = true; },
      (b: any) => { b.series.drawdown.authority = "PORTAL_DERIVED"; b.series.drawdown.confirmed_by_source = true; }]) {
      const body = clone(cases.available); patch(body); both(body, false);
    }
  });
  it("negatives: identity fields are required and the runtime flags are constants", () => {
    for (const key of ["workspace_id", "deployment_id", "environment", "observed_at", "request", "series", "band", "schema_version"]) {
      const body = clone(cases.available); delete body[key]; both(body, false);
    }
    for (const patch of [(b: any) => { b.environment = "research"; }, (b: any) => { b.source_side_effect_requested = true; },
      (b: any) => { b.schema_version = "execution.analytics.equity-projection.v1"; }, (b: any) => { b.runtime_active = true; }]) {
      const body = clone(cases.available); patch(body); both(body, false);
    }
  });
  it("runtime-only rules (not expressible across properties in JSON Schema) are refused by the zod contract", () => {
    const refused = (patch: (b: any) => void) => { const body = clone(cases.available); patch(body); expect(validate(body), "schema alone allows it").toBe(true); expect(equityProjectionSourceResponse.safeParse(body).success).toBe(false); };
    refused(b => { b.band.currency = "EUR"; });                 // band currency != series currency
    refused(b => { b.series.returned_buckets = 23; });          // returned_buckets != points.length
    refused(b => { b.request.limit = 10; });                    // more points than the request limit
    refused(b => { b.series.points.reverse(); });               // order
    refused(b => { b.band.points[0].lower = "999"; });          // lower > upper
    refused(b => { b.band.points[0].bucket_start = "2030-01-01T00:00:00Z"; }); // outside the series window
    refused(b => { b.series.points[0].drawdown = null; });      // equity without drawdown
  });
  it("query: exact keys, explicit workspace and environment, hard limit", () => {
    const ok = parseEquityProjectionQuery({ workspace_id: "ws_TEST_ONLY", environment: "paper" });
    expect(ok).toMatchObject({ ok: true, value: { window: "30d", intent: "overview", limit: 5000, cursor: null } });
    for (const raw of [{}, { workspace_id: "ws" }, { environment: "paper" }, { workspace_id: "ws", environment: "research" },
      { workspace_id: "ws", environment: "paper", extra: "1" }, { workspace_id: "ws", environment: "paper", limit: "5001" },
      { workspace_id: "ws", environment: "paper", limit: "0" }, { workspace_id: "ws", environment: "paper", limit: "1e3" },
      { workspace_id: "ws", environment: "paper", window: "2d" }, { workspace_id: ["a", "b"], environment: "paper" }])
      expect(parseEquityProjectionQuery(raw as any), JSON.stringify(raw)).toMatchObject({ ok: false, code: "OPERATIONAL_READ_INPUT_INVALID" });
    expect(parseEquityProjectionQuery({ workspace_id: "ws", environment: "paper", cursor: "bad cursor!" })).toMatchObject({ ok: false, code: "OPERATIONAL_READ_CURSOR_INVALID" });
    expect(parseEquityProjectionQuery({ workspace_id: "ws", environment: "paper", cursor: "abc_DEF-123", limit: "5000" })).toMatchObject({ ok: true });
  });
});
