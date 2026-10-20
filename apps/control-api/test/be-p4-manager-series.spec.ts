/** BE-P4 / FE-013 + FE-033: the Manager series read. Pure component proofs over TEST_ONLY authority and rows:
 * no PostgreSQL, no source, no runtime. A produced series here is a hand-built TEST_ONLY publication, never a
 * financial fact; what the suite proves is that the read refuses everything that is not exactly published. */
import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accessDigest } from "../src/execution-v2/access-policy";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { managerModelDocument, managerPartition, type ManagerMember, type ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { managerScorePopulationDigest } from "../src/execution-v2/manager-score-publication";
import { queryManagerSeries, type SeriesSubjectScope } from "../src/execution-v2/manager-series";
import { COMPARISON_MISMATCH_REASONS, deriveSeriesComparison, managerSeriesQuery, managerSeriesResponse } from "../src/execution-v2/manager-series.contract";
import { seriesPartition, type ManagerSeriesPublication } from "../src/execution-v2/manager-series-publication.contract";
import { ManagerSeriesService } from "../src/execution-v2/manager-series.service";
import { ManagerSeriesController } from "../src/execution-v2/manager-series.controller";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";

const NOW = 1_800_000_000_000, DAY = 86_400_000;
const AS_OF = NOW - 100, WINDOW = { from_ms: AS_OF - 30 * DAY, to_ms: AS_OF };
const SHARED = OWN.portfolio_id, SOLO = PRIVATE.portfolio_id;
const partition = (currency = "USDT", domain: "PAPER" | "ACTUAL" = "PAPER", native = "TEST_ONLY:paper-ledger") => ({ economic_domain: domain, currency,
  basis: "TEST_ONLY:nav-ledger", native_profile_ref: native, domain_proof_ref: "TEST_ONLY:domain-proof" });
const member = (tuple: ManagerMember["tuple"], name: string): ManagerMember => ({ tuple: { ...tuple }, name, stage: "PAPER",
  owner_user_id: "TEST_ONLY:owner", lifecycle: "ACTIVE", venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH",
  binding_ref: "TEST_ONLY:binding", assignment_revision: "a", owner_revision: "o", binding_revision: "b", valid_from_ms: NOW - 1000, valid_to_ms: null });

async function fixture(options: { full?: boolean; qualification?: "SOURCE_VERIFIED" | "TEST_ONLY"; stale?: boolean } = {}) {
  const f = productReadFixture({ full: options.full ?? true, fields: [...BUSINESS_READ_FIELDS] });
  const profile = "PAPER_BINANCE_USDM";
  const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", workspace_id: f.principal.workspaceId,
    environment: "paper", profile_id: profile, qualification: options.qualification ?? "SOURCE_VERIFIED", family_id: "alpha_fleet_overview",
    revision: "TEST_ONLY:model-r1", supersedes_revision: null, source_epoch: "TEST_ONLY:epoch", source_sequence: "1", projection_generation: "TEST_ONLY:g1",
    catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest([OWN, PEER, PRIVATE]),
    as_of_ms: AS_OF, recorded_through_ms: NOW - 50, facts_through_ms: AS_OF, observed_at_ms: NOW,
    source_quality: { completeness: "COMPLETE", freshness: options.stale ? "STALE" : "FRESH", reasons: [] },
    members: [member(OWN, "Own"), member(PEER, "Peer"), member(PRIVATE, "Private")], facts: [] };
  const binding = { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
    catalogue_revision: doc.catalogue_digest, window: null };
  const scope = await f.scopes.authorize(f.principal, { environment: "paper", profileId: profile },
    { action: options.full === false ? "alpha.read" : "business.read_all", dataset: binding });
  const populationOf = (portfolioId?: string) => managerScorePopulationDigest(doc.members.filter(m => portfolioId === undefined || m.tuple.portfolio_id === portfolioId));
  /** A hand-built TEST_ONLY publication for a subject; patch edits the binding/series/provenance. */
  const publication = (portfolioId: string | undefined, patch: { currency?: string; points?: Array<[number, string]>; methodology?: string; basis?: string;
    window?: { from_ms: number; to_ms: number }; metric?: "NAV" | "NET_PNL" | "RETURN"; population?: string; native?: string; scale?: "FRACTION" | "PERCENT" | null } = {}): ManagerSeriesPublication => {
    const w = patch.window ?? WINDOW, currency = patch.currency ?? "USDT", p = { ...partition(currency, "PAPER", patch.native), basis: patch.basis ?? "TEST_ONLY:nav-ledger" };
    const metric = patch.metric ?? "NAV";
    return { binding: { subject_type: portfolioId === undefined ? "manager_book" : "portfolio", subject_id: portfolioId ?? doc.workspace_id,
      tuple_population_digest: patch.population ?? populationOf(portfolioId), stage_filter: ["PAPER"], metric, partition: p,
      window_start_ms: w.from_ms, window_end_ms: w.to_ms },
    series: { unit: metric === "RETURN" ? "RATIO" : "MONEY", currency: metric === "RETURN" ? null : currency,
      ratio_scale: metric === "RETURN" ? (patch.scale === undefined ? "FRACTION" : patch.scale) : null, basis: p.basis,
      methodology_ref: patch.methodology ?? "TEST_ONLY:nav-twr.v1",
      points: (patch.points ?? [[0, "100"], [1, "101.5"]]).map(([day, value]) => ({ ts_ms: w.from_ms + day * DAY, value })), gaps: [] },
    quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
    provenance: { scope: { workspace_id: doc.workspace_id, environment: "paper", profile_id: profile, catalogue_digest: doc.catalogue_digest },
      source_revision: doc.revision, source_set_digest: doc.source_set_digest, source_qualification: "SOURCE_VERIFIED",
      input_digest: accessDigest([portfolioId ?? "fund", currency, metric, patch.points ?? null]), calculation_revision: "TEST_ONLY:calc", policy_revision: "TEST_ONLY:policy" ,
      source_as_of_ms: AS_OF } };
  };
  const inputs = (subjects: Array<{ subject_type: "FUND" | "PORTFOLIO"; subject_id?: string }>): SeriesSubjectScope[] => subjects.map(subject => ({ subject, scope }));
  const read = (subjects: Array<{ subject_type: "FUND" | "PORTFOLIO"; subject_id?: string }>, query: Record<string, unknown> = {}, document: unknown = doc) =>
    queryManagerSeries(inputs(subjects), document, { environment: "paper", metric: "NAV", window: "30D", subjects, ...query });
  return { f, doc, scope, publication, read, populationOf };
}
const A = { subject_type: "PORTFOLIO" as const, subject_id: SHARED }, B = { subject_type: "PORTFOLIO" as const, subject_id: SOLO };
const FUND = { subject_type: "FUND" as const };

describe("BE-P4 FE-013: nothing is invented when the source is missing", () => {
  it("every subject is a typed UNAVAILABLE and the profile says its series source is not published", async () => {
    const t = await fixture();
    const r = t.read([FUND, A, B]);
    expect(r.series_source).toEqual({ state: "NOT_PUBLISHED", reason_code: "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED" });
    expect(r.series.map(s => [s.subject.subject_type, s.state, s.reason_code])).toEqual([
      ["FUND", "UNAVAILABLE", "SERIES_SOURCE_NOT_PUBLISHED"], ["PORTFOLIO", "UNAVAILABLE", "SERIES_SOURCE_NOT_PUBLISHED"], ["PORTFOLIO", "UNAVAILABLE", "SERIES_SOURCE_NOT_PUBLISHED"]]);
    for (const s of r.series) { expect(s.points).toEqual([]); expect(s).toMatchObject({ unit: null, currency: null, basis: null, methodology_ref: null, window: null, partition: null }); }
    expect(r.comparison).toMatchObject({ state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE", common: null, axis_ms: null });
    expect(r.selected_window.resolved).toEqual(WINDOW);
  });
  it("a TEST_ONLY or stale document is not a source", async () => {
    for (const options of [{ qualification: "TEST_ONLY" as const }, { stale: true }]) {
      const t = await fixture(options); t.doc.precomputed_series = [t.publication(SHARED)];
      expect(t.read([A]).series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "SOURCE_NOT_QUALIFIED", points: [] });
    }
  });
  it("a restricted viewer never gets a series, whatever is published (authority precedes search)", async () => {
    const t = await fixture({ full: false }); t.doc.precomputed_series = [t.publication(SHARED), t.publication(undefined)];
    const r = t.read([A]);
    expect(r.series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "SERIES_SCOPE_NOT_AUTHORIZED", points: [] });
    expect(JSON.stringify(r.series)).not.toContain("101.5");
  });
  it("an unknown portfolio is indistinguishable from an unauthorized one (no existence oracle)", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication("no-such-portfolio", { population: t.populationOf() })];
    expect(t.read([{ subject_type: "PORTFOLIO", subject_id: "no-such-portfolio" }]).series[0])
      .toMatchObject({ state: "UNAVAILABLE", reason_code: "SERIES_SCOPE_NOT_AUTHORIZED" });
  });
  it("an authorized portfolio whose members have all ended has no series to serve", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED)];
    t.doc.members.filter(m => m.tuple.portfolio_id === SHARED).forEach(m => { m.valid_to_ms = NOW - 500; });
    expect(t.read([A]).series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "SUBJECT_HAS_NO_ACTIVE_MEMBERS" });
  });
  it("ALL has no window to select: typed absence, never a favourable window", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED)];
    const r = t.read([A], { window: "ALL" });
    expect(r.series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" });
    expect(r.selected_window).toMatchObject({ requested: "ALL", resolved: null, reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" });
  });
  it("only the exact window is served; another preset is EXACT_METRIC_WINDOW_NOT_PUBLISHED, not a re-cut of the 30D series", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED)];
    expect(t.read([A], { window: "7D" }).series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "EXACT_METRIC_WINDOW_NOT_PUBLISHED", points: [] });
    expect(t.read([A], { window: WINDOW }).series[0].state).toBe("AVAILABLE");
  });
  it("a publication bound to a different population, metric or stage set is not this subject's series", async () => {
    const t = await fixture();
    t.doc.precomputed_series = [t.publication(SHARED, { population: t.populationOf(SOLO) }), t.publication(SOLO, { metric: "NET_PNL" })];
    expect(t.read([A]).series[0].reason_code).toBe("SERIES_SOURCE_NOT_PUBLISHED");
    expect(t.read([B]).series[0].reason_code).toBe("SERIES_SOURCE_NOT_PUBLISHED");
    expect(t.read([B], { metric: "NET_PNL" }).series[0].state).toBe("AVAILABLE");
  });
});

describe("MD-5 canonical zero on emit: the series read (owner decision C, 2026-10-20)", () => {
  it("a stored publication may carry a signed zero (source admission is unchanged); the response never does", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { points: [[0, "-0"], [1, "-0.000"], [2, "0.50"], [3, "-0.5"], [4, "0"]] })];
    expect(managerModelDocument.safeParse(t.doc).success).toBe(true);
    const s = t.read([A]).series[0];
    expect(s.points.map(p => p.value)).toEqual(["0", "0.000", "0.50", "-0.5", "0"]);
    expect(s.points.map(p => p.ts_ms)).toEqual([0, 1, 2, 3, 4].map(day => WINDOW.from_ms + day * DAY));
    expect(JSON.stringify(t.read([A]))).not.toMatch(/"-0(?:\.0+)?"/);
    // The stored publication is not edited: the emit step builds a new body.
    expect(t.doc.precomputed_series![0].series.points[0].value).toBe("-0");
    // Idempotent and accepted as it is by the response contract.
    const response = t.read([A]);
    expect(managerSeriesResponse.parse(response)).toEqual(response);
  });
  it("a response that still carries a signed zero point is refused with its stated code", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED)];
    const response = structuredClone(t.read([A]));
    for (const zero of ["-0", "-0.00"]) {
      response.series[0].points[0].value = zero;
      const parsed = managerSeriesResponse.safeParse(response);
      expect(parsed.success).toBe(false);
      expect(!parsed.success && parsed.error.issues.map(i => i.message)).toContain("MANAGER_DECIMAL_NEGATIVE_ZERO");
    }
  });
});

describe("BE-P4 FE-013: a published series is served exactly, with its methodology and window", () => {
  it("serves exact decimal strings with partition, unit, currency, basis, methodology and window", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { points: [[0, "100.000000000000000001"], [2, "-0.5"]] })];
    const s = t.read([A]).series[0];
    expect(s).toMatchObject({ state: "AVAILABLE", reason_code: null, unit: "MONEY", currency: "USDT", basis: "TEST_ONLY:nav-ledger",
      methodology_ref: "TEST_ONLY:nav-twr.v1", window: WINDOW, partition: partition(), source_confidence: "VERIFIED" });
    expect(s.points).toEqual([{ ts_ms: WINDOW.from_ms, value: "100.000000000000000001" }, { ts_ms: WINDOW.from_ms + 2 * DAY, value: "-0.5" }]);
  });
  it("an empty verified series is EMPTY with its own reason, not UNAVAILABLE and not zeros", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { points: [] })];
    const s = t.read([A]).series[0];
    expect(s).toMatchObject({ state: "EMPTY", reason_code: "NO_POINTS_PUBLISHED_IN_WINDOW", points: [], methodology_ref: "TEST_ONLY:nav-twr.v1" });
  });
  it("RETURN is a ratio with no currency and the scale its source stated", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { metric: "RETURN", points: [[0, "0"], [1, "0.0123"]] })];
    expect(t.read([A], { metric: "RETURN" }).series[0]).toMatchObject({ state: "AVAILABLE", unit: "RATIO", currency: null, ratio_scale: "FRACTION" });
    t.doc.precomputed_series = [t.publication(SHARED, { metric: "RETURN", points: [[0, "0"], [1, "1.23"]], scale: "PERCENT" })];
    expect(t.read([A], { metric: "RETURN" }).series[0]).toMatchObject({ state: "AVAILABLE", unit: "RATIO", ratio_scale: "PERCENT" });
  });
  it("the fund subject is read over the whole authorized population", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(undefined)];
    const r = t.read([FUND]);
    expect(r.series[0]).toMatchObject({ subject: { subject_type: "FUND", subject_id: t.doc.workspace_id }, state: "AVAILABLE" });
    expect(r.comparison).toMatchObject({ state: "SINGLE_SUBJECT", reason_code: null, axis_ms: null });
    expect(r.series_source).toEqual({ state: "PUBLISHED", reason_code: null });
  });
  it("two money partitions of one subject need an explicit partition; the choice is then exact", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED), t.publication(SHARED, { currency: "VND", points: [[0, "2500000000"]] })];
    expect(t.read([A]).series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "ECONOMIC_PARTITION_REQUIRED", points: [] });
    expect(t.read([A], { economic_partition: partition("VND") }).series[0]).toMatchObject({ state: "AVAILABLE", currency: "VND" });
    expect(t.read([A], { economic_partition: partition("EUR") }).series[0].reason_code).toBe("SERIES_SOURCE_NOT_PUBLISHED");
  });
});

describe("BE-P4 FE-033: aligned series for 2-4 subjects, typed refusal when they do not share a basis", () => {
  it("aligns subjects in one partition on the union axis without filling or rebasing", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { points: [[0, "100"], [1, "101"], [2, "99"]] }),
      t.publication(SOLO, { points: [[0, "5000"], [3, "4990"]] })];
    const r = t.read([A, B]);
    expect(r.comparison.state).toBe("ALIGNED");
    expect(r.comparison.transform).toBe("NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM");
    expect(r.comparison.axis_ms).toEqual([0, 1, 2, 3].map(d => WINDOW.from_ms + d * DAY));
    expect(r.comparison.common).toMatchObject({ currency: "USDT", unit: "MONEY", methodology_ref: "TEST_ONLY:nav-twr.v1", window: WINDOW });
    // Values are exactly what was published: B has no point on day 1 or 2, and none is invented there.
    expect(r.series[1].points.map(p => p.value)).toEqual(["5000", "4990"]);
    expect(r.series[0].points.map(p => p.value)).toEqual(["100", "101", "99"]);
  });
  it("mixed currencies: each series is delivered untouched and the comparison refuses (CURRENCY_MIXED)", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED), t.publication(SOLO, { currency: "VND", points: [[0, "2500000000"]] })];
    const r = t.read([A, B]);
    expect(r.comparison).toEqual({ state: "INCOMPARABLE", reason_code: "CURRENCY_MIXED", transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM", common: null, axis_ms: null });
    expect(r.series.map(s => [s.currency, s.points.length])).toEqual([["USDT", 2], ["VND", 1]]);
    expect(r.series[1].points[0].value).toBe("2500000000");
  });
  it.each([
    ["ECONOMIC_PARTITION_MIXED", { native: "TEST_ONLY:other-ledger" }], ["BASIS_MIXED", { basis: "TEST_ONLY:other-ledger" }], ["METHODOLOGY_MIXED", { methodology: "TEST_ONLY:other.v1" }],
  ])("refuses %s", async (reason, patch) => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED), t.publication(SOLO, patch)];
    const r = t.read([A, B]);
    expect(r.comparison).toMatchObject({ state: "INCOMPARABLE", reason_code: reason, common: null, axis_ms: null });
  });
  it("one unavailable subject makes the comparison UNAVAILABLE, never a partial 'aligned'", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED)];
    const r = t.read([A, B]);
    expect(r.series.map(s => s.state)).toEqual(["AVAILABLE", "UNAVAILABLE"]);
    expect(r.comparison).toMatchObject({ state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE", axis_ms: null });
  });
  it("four subjects at most, no duplicate, and the fund carries no id", () => {
    const ok = { environment: "paper", metric: "NAV", window: "30D" };
    const portfolios = ["a", "b", "c", "d", "e"].map(id => ({ subject_type: "PORTFOLIO", subject_id: id }));
    expect(managerSeriesQuery.safeParse({ ...ok, subjects: portfolios.slice(0, 4) }).success).toBe(true);
    for (const subjects of [portfolios, [], [portfolios[0], portfolios[0]], [{ subject_type: "FUND", subject_id: "x" }], [{ subject_type: "PORTFOLIO" }], [FUND, FUND]])
      expect(managerSeriesQuery.safeParse({ ...ok, subjects }).success).toBe(false);
    expect(managerSeriesQuery.safeParse({ environment: "paper", metric: "NAV", subjects: [FUND] }).success).toBe(false); // window is mandatory
    expect(managerSeriesQuery.safeParse({ ...ok, subjects: [FUND], metric: "DRAWDOWN" }).success).toBe(false);
    expect(managerSeriesQuery.safeParse({ ...ok, subjects: [FUND], as_of_ms: 1 }).success).toBe(false);
  });
});

describe("FE-013: the metric fixes the unit, and a ratio states its scale", () => {
  const RET = { metric: "RETURN" as const };
  it("a RETURN whose source has no authoritative scale is a typed absence, never a number to guess", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { ...RET, scale: null, points: [] })];
    expect(managerModelDocument.safeParse(t.doc).success).toBe(true); // the producer's typed way to say "no scale": admitted, never served
    const r = t.read([A], { metric: "RETURN" });
    expect(r.series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "RATIO_SCALE_NOT_PUBLISHED", unit: null, ratio_scale: null, points: [] });
    expect(r.comparison).toMatchObject({ state: "SINGLE_SUBJECT", common: null, axis_ms: null });
    expect(managerSeriesResponse.safeParse(r).success).toBe(true);
  });
  it("a RETURN with values and no scale can not enter a document (no way to publish points without a scale)", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { ...RET, scale: null })];
    expect(managerModelDocument.safeParse(t.doc).success).toBe(false);
  });
  it("two RETURN subjects on different scales are INCOMPARABLE: no shared axis", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, RET), t.publication(SOLO, { ...RET, scale: "PERCENT", points: [[0, "0"], [1, "1.23"]] })];
    const r = t.read([A, B], { metric: "RETURN" });
    expect(r.comparison).toMatchObject({ state: "INCOMPARABLE", reason_code: "RATIO_SCALE_MIXED", common: null, axis_ms: null });
    expect(r.series.map(e => e.ratio_scale)).toEqual(["FRACTION", "PERCENT"]);
  });
  it("two RETURN subjects on one scale align and the common basis states it", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, RET), t.publication(SOLO, RET)];
    expect(t.read([A, B], { metric: "RETURN" }).comparison).toMatchObject({ state: "ALIGNED", common: { unit: "RATIO", ratio_scale: "FRACTION", currency: null } });
  });
  it("NAV and NET_PNL stay MONEY with no scale", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED), t.publication(SHARED, { metric: "NET_PNL" })];
    for (const metric of ["NAV", "NET_PNL"] as const)
      expect(t.read([A], { metric }).series[0]).toMatchObject({ unit: "MONEY", currency: "USDT", ratio_scale: null });
  });
  const base = async (metric: "NAV" | "NET_PNL" | "RETURN" = "NAV") => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { metric })];
    return structuredClone(t.read([A], { metric })) as Record<string, any>;
  };
  const refused = async (metric: "NAV" | "NET_PNL" | "RETURN", mutate: (v: any) => void, message: string) => {
    const v = await base(metric); mutate(v);
    const parsed = managerSeriesResponse.safeParse(v);
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues.map(i => i.message)).toContain(message);
  };
  const MISMATCH = "MANAGER_SERIES_METRIC_UNIT_MISMATCH", SCALE = "MANAGER_SERIES_RATIO_SCALE_INVALID";
  it("NAV as a RATIO is refused", () => refused("NAV", v => { Object.assign(v.series[0], { unit: "RATIO", currency: null, ratio_scale: "FRACTION" }); }, MISMATCH));
  it("NET_PNL as a RATIO is refused", () => refused("NET_PNL", v => { Object.assign(v.series[0], { unit: "RATIO", currency: null, ratio_scale: "PERCENT" }); }, MISMATCH));
  it("RETURN as MONEY is refused", () => refused("RETURN", v => { Object.assign(v.series[0], { unit: "MONEY", currency: "USDT", ratio_scale: null }); }, MISMATCH));
  it("RETURN with values and no scale is refused", () => refused("RETURN", v => { v.series[0].ratio_scale = null; }, SCALE));
  it("an EMPTY RETURN with no scale is refused too (an absence is UNAVAILABLE, not EMPTY)", async () => {
    const v = await base("RETURN"); Object.assign(v.series[0], { state: "EMPTY", reason_code: "NO_POINTS_PUBLISHED_IN_WINDOW", points: [], ratio_scale: null });
    v.comparison = deriveSeriesComparison(v.series);
    expect(managerSeriesResponse.safeParse(v).success).toBe(false);
  });
  it("MONEY with a scale is refused", () => refused("NAV", v => { v.series[0].ratio_scale = "FRACTION"; }, SCALE));
  it("a scale outside the closed vocabulary is refused", async () => {
    const v = await base("RETURN"); v.series[0].ratio_scale = "BASIS_POINTS";
    expect(managerSeriesResponse.safeParse(v).success).toBe(false);
  });
  it("RATIO_SCALE_NOT_PUBLISHED is only a RETURN reason", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { ...RET, scale: null, points: [] })];
    const v = structuredClone(t.read([A], { metric: "RETURN" })) as Record<string, any>; v.metric = "NAV";
    const parsed = managerSeriesResponse.safeParse(v);
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues.map(i => i.message)).toContain("MANAGER_SERIES_REASON_METRIC_INVALID");
  });
  it("an unavailable entry carries no scale", async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED, { ...RET, scale: null, points: [] })];
    const v = structuredClone(t.read([A], { metric: "RETURN" })) as Record<string, any>; v.series[0].ratio_scale = "FRACTION";
    expect(managerSeriesResponse.safeParse(v).success).toBe(false);
  });
  it("the stored publication ties its own metric to its unit and scale (document admission)", async () => {
    const admitted = async (mutate: (p: any) => void, metric: "NAV" | "RETURN" = "NAV") => {
      const t = await fixture(); const pub = structuredClone(t.publication(SHARED, { metric })) as any; mutate(pub);
      t.doc.precomputed_series = [pub]; return managerModelDocument.safeParse(t.doc).success;
    };
    expect(await admitted(() => undefined)).toBe(true); expect(await admitted(() => undefined, "RETURN")).toBe(true);
    expect(await admitted(p => { p.series.unit = "RATIO"; p.series.currency = null; p.series.ratio_scale = "FRACTION"; })).toBe(false);
    expect(await admitted(p => { p.series.unit = "MONEY"; p.series.currency = "USDT"; p.series.ratio_scale = null; }, "RETURN")).toBe(false);
    expect(await admitted(p => { p.series.ratio_scale = "FRACTION"; })).toBe(false);
    expect(await admitted(p => { delete p.series.ratio_scale; })).toBe(false); // the scale is stated explicitly, null included
  });
});

describe("deriveSeriesComparison is the only authority on alignment", () => {
  const entry = (patch: Record<string, unknown> = {}) => ({ state: "AVAILABLE" as const, partition: partition(), unit: "MONEY" as const, currency: "USDT", ratio_scale: null, basis: "b",
    methodology_ref: "m", window: WINDOW, points: [{ ts_ms: 1, value: "1" }], ...patch }) as Parameters<typeof deriveSeriesComparison>[0][number];
  it("reports the first mismatch in a fixed order, currency first", () => {
    const other = (patch: Record<string, unknown>) => deriveSeriesComparison([entry(), entry(patch)]);
    expect(other({ currency: "VND", methodology_ref: "x", basis: "y" })).toMatchObject({ state: "INCOMPARABLE", reason_code: "CURRENCY_MIXED" });
    expect(other({ partition: partition("USDT", "ACTUAL") }).reason_code).toBe("ECONOMIC_PARTITION_MIXED");
    expect(other({ partition: { ...partition(), native_profile_ref: "other" } }).reason_code).toBe("ECONOMIC_PARTITION_MIXED");
    expect(other({ basis: "y" }).reason_code).toBe("BASIS_MIXED");
    expect(other({ unit: "RATIO", currency: "USDT" }).reason_code).toBe("UNIT_MIXED");
    const ratio = (scale: "FRACTION" | "PERCENT") => entry({ unit: "RATIO", currency: null, ratio_scale: scale });
    expect(deriveSeriesComparison([ratio("FRACTION"), ratio("PERCENT")]).reason_code).toBe("RATIO_SCALE_MIXED");
    expect(deriveSeriesComparison([ratio("FRACTION"), ratio("FRACTION")])).toMatchObject({ state: "ALIGNED", common: { unit: "RATIO", ratio_scale: "FRACTION", currency: null } });
    expect(other({ methodology_ref: "x" }).reason_code).toBe("METHODOLOGY_MIXED");
    expect(other({ window: { from_ms: WINDOW.from_ms + 1, to_ms: WINDOW.to_ms } }).reason_code).toBe("WINDOW_MISMATCH");
    expect(COMPARISON_MISMATCH_REASONS).toHaveLength(7);
  });
  it("is INCOMPARABLE even when a third subject is unavailable, and EMPTY is not alignable", () => {
    expect(deriveSeriesComparison([entry(), entry({ currency: "VND" }), entry({ state: "UNAVAILABLE", partition: null, unit: null, currency: null, basis: null, methodology_ref: null, window: null, points: [] })])
      .reason_code).toBe("CURRENCY_MIXED");
    expect(deriveSeriesComparison([entry(), entry({ state: "EMPTY", points: [] })])).toMatchObject({ state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE" });
  });
});

describe("the response validator refuses what the rule forbids", () => {
  const sample = async () => {
    const t = await fixture(); t.doc.precomputed_series = [t.publication(SHARED), t.publication(SOLO, { currency: "VND", points: [[0, "7"]] })];
    return structuredClone(t.read([A, B])) as Record<string, any>;
  };
  const accepted = async (mutate: (v: any) => void) => { const v = await sample(); mutate(v); return managerSeriesResponse.safeParse(v).success; };
  it("accepts the honest mixed-currency answer", async () => { expect(await accepted(() => undefined)).toBe(true); });
  it.each([
    ["mixed currencies called ALIGNED", (v: any) => { v.comparison = { ...v.comparison, state: "ALIGNED", reason_code: null, axis_ms: [1], common: { economic_domain: "PAPER", native_profile_ref: "n", currency: "USDT", basis: "b", unit: "MONEY", methodology_ref: "m", window: v.series[0].window } }; }],
    ["a different reason for the same mismatch", (v: any) => { v.comparison.reason_code = "BASIS_MIXED"; }],
    ["a rebase flag removed", (v: any) => { v.comparison.transform = "REBASED_TO_100"; }],
    ["a non-ascending point list", (v: any) => { v.series[0].points = [...v.series[0].points].reverse(); }],
    ["a point outside the window", (v: any) => { v.series[0].points[0].ts_ms = v.series[0].window.from_ms - 1; }],
    ["a float value", (v: any) => { v.series[0].points[0].value = 100.5; }],
    ["an exponent value", (v: any) => { v.series[0].points[0].value = "1e5"; }],
    ["a currency that is not the partition's", (v: any) => { v.series[0].currency = "VND"; }],
    ["an AVAILABLE series with no methodology", (v: any) => { v.series[0].methodology_ref = null; }],
    ["an AVAILABLE series with a reason", (v: any) => { v.series[0].reason_code = "SERIES_SOURCE_NOT_PUBLISHED"; }],
    ["an UNAVAILABLE series that still carries points", (v: any) => { v.series[0].state = "UNAVAILABLE"; v.series[0].reason_code = "SERIES_SOURCE_NOT_PUBLISHED"; }],
    ["a window other than the selected one", (v: any) => { v.series[0].window = { ...v.series[0].window, from_ms: v.series[0].window.from_ms + 1 }; }],
    ["a source flagged NOT_PUBLISHED beside an AVAILABLE series", (v: any) => { v.series_source = { state: "NOT_PUBLISHED", reason_code: "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED" }; }],
    ["the same subject twice", (v: any) => { v.series[1].subject = v.series[0].subject; }],
    ["an extra field", (v: any) => { v.series[0].nav_total = "1"; }],
  ])("rejects %s", async (_name, mutate) => { expect(await accepted(mutate)).toBe(false); });
});

describe("the stored publication refuses to enter a document unless it is what the contract promises", () => {
  const parse = async (mutate: (doc: any, pub: any) => void) => {
    const t = await fixture(); const pub = structuredClone(t.publication(SHARED)); const doc = structuredClone(t.doc) as any;
    mutate(doc, pub); doc.precomputed_series = [pub]; return managerModelDocument.safeParse(doc).success;
  };
  it("accepts a bound, ascending, exact publication", async () => { expect(await parse(() => undefined)).toBe(true); });
  it.each([
    ["a different revision", (_d: any, p: any) => { p.provenance.source_revision = "other"; }],
    ["a different cutoff", (_d: any, p: any) => { p.provenance.source_as_of_ms -= 1; }],
    ["a workspace other than the document's", (_d: any, p: any) => { p.provenance.scope.workspace_id = "other"; }],
    ["a stage that does not belong to the environment", (_d: any, p: any) => { p.binding.stage_filter = ["LIVE"]; }],
    ["descending points", (_d: any, p: any) => { p.series.points = [...p.series.points].reverse(); }],
    ["a point after the window", (_d: any, p: any) => { p.series.points[1].ts_ms = p.binding.window_end_ms + 1; }],
    ["a window that ends after the cutoff", (_d: any, p: any) => { p.binding.window_end_ms = p.provenance.source_as_of_ms + 1; }],
    ["a unit/currency that disagrees with the partition", (_d: any, p: any) => { p.series.currency = "VND"; }],
    ["a basis that is not the partition's", (_d: any, p: any) => { p.series.basis = "other"; }],
    ["a missing methodology", (_d: any, p: any) => { delete p.series.methodology_ref; }],
    ["values from a TEST_ONLY source", (_d: any, p: any) => { p.provenance.source_qualification = "TEST_ONLY"; }],
    ["a RETURN with a currency", (_d: any, p: any) => { p.binding.metric = "RETURN"; p.series.unit = "RATIO"; }],
    ["a gap outside the window", (_d: any, p: any) => { p.series.gaps = [{ from_ms: p.binding.window_start_ms - 1, to_ms: p.binding.window_start_ms, reason: "SOURCE_GAP" }]; }],
    ["a domain borrowed from another environment", (_d: any, p: any) => { p.binding.partition.economic_domain = "ACTUAL"; }],
  ])("rejects %s", async (_name, mutate) => { expect(await parse(mutate)).toBe(false); });
  it("rejects two publications for the same binding", async () => {
    const t = await fixture(); const pub = t.publication(SHARED); const doc = structuredClone(t.doc) as any;
    doc.precomputed_series = [pub, structuredClone(pub)];
    expect(managerModelDocument.safeParse(doc).success).toBe(false);
  });
  it("keeps its own partition schema identical to the Manager partition", () => {
    expect(Object.keys(seriesPartition.shape).sort()).toEqual(Object.keys(managerPartition.shape).sort());
  });
});

describe("service + controller (synthetic adapters, no PostgreSQL)", () => {
  const head = { revision: "TEST_ONLY:model-r1", source_epoch: "TEST_ONLY:epoch", source_sequence: "1", projection_generation: "TEST_ONLY:g1",
    payload_digest: "sha256:" + "0".repeat(64), catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest };
  async function service(full = true) {
    const t = await fixture({ full });
    // A fund reads on business.read_all; a portfolio subject reads on portfolio.read (exactly the dataset service's rule).
    if (full) t.f.context.grants.push({ ...t.f.context.grants[0], grant_id: "TEST_ONLY-portfolio-read", action: "portfolio.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [SHARED, SOLO] } });
    const service = new ManagerSeriesService({} as Pool, t.f.scopes, t.f.config);
    const repository = (service as any).repository;
    vi.spyOn(repository, "head").mockResolvedValue(head);
    vi.spyOn(repository, "document").mockResolvedValue(t.doc);
    const workspaces = { canReadExecution: vi.fn(async () => true) };
    const controller = new ManagerSeriesController(service, workspaces as any);
    const request = { portalUser: t.f.principal.user, portalSession: t.f.principal.session, portalWorkspaceId: t.f.principal.workspaceId } as any;
    return { ...t, service, repository, controller, request, workspaces };
  }
  const query = (subjects: unknown, extra: Record<string, unknown> = {}) => ({ environment: "paper", metric: "NAV", window: "30D", subjects: JSON.stringify(subjects), ...extra });

  it("answers honestly today: a real SOURCE_VERIFIED profile with no series source says so, per subject", async () => {
    const s = await service();
    const r = await s.controller.read(s.request, query([FUND, A]));
    expect(r.series_source.state).toBe("NOT_PUBLISHED");
    expect(r.series.map(e => e.reason_code)).toEqual(["SERIES_SOURCE_NOT_PUBLISHED", "SERIES_SOURCE_NOT_PUBLISHED"]);
    expect(r.comparison.state).toBe("UNAVAILABLE");
  });
  it("serves a published series through the controller with JSON subjects and an exact JSON window", async () => {
    const s = await service(); s.doc.precomputed_series = [s.publication(SHARED)];
    const r = await s.controller.read(s.request, query([A], { window: JSON.stringify(WINDOW) }));
    expect(r.series[0].state).toBe("AVAILABLE");
  });
  it("never serves a TEST_ONLY document", async () => {
    const s = await service(); s.repository.document.mockResolvedValue({ ...s.doc, qualification: "TEST_ONLY" });
    await expect(s.controller.read(s.request, query([A]))).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it("closed query is checked before any source metadata is read", async () => {
    const s = await service();
    for (const bad of [{ environment: "paper" }, query([]), query([A, A]), query([A], { metric: "DRAWDOWN" }), query([A], { sql: "x" }),
      { ...query([A]), subjects: "{" }, { ...query([A]), window: "{" }, query(Array(5).fill(A))])
      await expect(s.controller.read(s.request, bad)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    await expect(s.controller.read(s.request, query([A], { as_of_ms: "" }))).rejects.toMatchObject({ code: "EXECUTION_READ_CURRENT_ONLY", status: 400 });
    await expect(s.service.read(s.f.principal, { environment: "paper", metric: "NAV", window: "30D", subjects: [A], workspace_id: "other" }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(s.repository.head).not.toHaveBeenCalled(); expect(s.repository.document).not.toHaveBeenCalled();
  });
  it("a fund needs whole-population authority before any projection is read", async () => {
    const s = await service(false);
    await expect(s.controller.read(s.request, query([FUND]))).rejects.toMatchObject({ status: 404 });
    expect(s.repository.document).not.toHaveBeenCalled();
  });
  it("a head that moves while reading is a 409, not a stale series", async () => {
    const s = await service(); s.doc.precomputed_series = [s.publication(SHARED)];
    let calls = 0;
    s.repository.head.mockImplementation(async () => (++calls > 1 ? { ...head, payload_digest: "sha256:" + "1".repeat(64) } : head));
    await expect(s.controller.read(s.request, query([A]))).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("no publication head is an unqualified source (503), not an empty series", async () => {
    const s = await service(); s.repository.head.mockResolvedValue(null);
    await expect(s.controller.read(s.request, query([A]))).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
});

describe("canonical fixtures agree with the validator and the suite's expectations", () => {
  const load = (name: string) => JSON.parse(readFileSync(resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures", name), "utf8"));
  it("populated / empty / unavailable / currency-mixed parse and say what they claim", () => {
    const states = (name: string) => load(`execution-manager-series.${name}.synthetic.valid.json`).value;
    expect(managerSeriesResponse.parse(states("populated"))).toEqual(states("populated"));
    expect(states("populated").comparison.state).toBe("ALIGNED");
    expect(states("empty").series[0]).toMatchObject({ state: "EMPTY", reason_code: "NO_POINTS_PUBLISHED_IN_WINDOW" });
    expect(states("unavailable").series_source.state).toBe("NOT_PUBLISHED");
    expect(states("unavailable").series.every((s: any) => s.state === "UNAVAILABLE")).toBe(true);
    expect(states("currency-mixed").comparison).toMatchObject({ state: "INCOMPARABLE", reason_code: "CURRENCY_MIXED" });
  });
});
