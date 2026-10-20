/** BE-P16 (ELP2-05/06, ELP2-REQ-06-002): the pure Manager series writer. No PostgreSQL, no source, no runtime clock.
 * Every document below is a TEST_ONLY-valued fixture marked SOURCE_VERIFIED only so the derivation path is exercised: what the suite proves is
 * the writer's rules (exact decimals, typed absences, stated gaps, bounds, idempotence), not any financial fact. */
import "reflect-metadata";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { accessDigest } from "../src/execution-v2/access-policy";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { dedupeManagerFacts } from "../src/execution-v2/manager-model";
import { managerModelDocument, type ManagerFact, type ManagerMember, type ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { deriveSeriesObservations, MANAGER_SERIES_CALCULATION_REVISION, seriesPopulations } from "../src/execution-v2/manager-series-observation";
import { materializeManagerSeries, validateSeriesConfig, type ManagerSeriesConfig, type SeriesHistory } from "../src/execution-v2/manager-series-materializer";
import { ManagerSeriesRuntime } from "../src/execution-v2/manager-series-runtime";
import { queryManagerSeries } from "../src/execution-v2/manager-series";
import { managerSeriesPublication } from "../src/execution-v2/manager-series-publication.contract";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";

const DAY = 86_400_000, T0 = 1_800_000_000_000;
const CFG: ManagerSeriesConfig = { windows: ["30D"], maximum_total_points: 1_000, maximum_history_rows: 1_000 };
const PARTITION = (currency = "USDT") => ({ economic_domain: "PAPER" as const, currency, basis: "TEST_ONLY:ledger", native_profile_ref: `TEST_ONLY:native-${currency}`,
  domain_proof_ref: "TEST_ONLY:domain" });
const member = (tuple: ManagerMember["tuple"]): ManagerMember => ({ tuple: { ...tuple }, stage: "PAPER", name: "TEST_ONLY", owner_user_id: "TEST_ONLY:owner",
  lifecycle: "ACTIVE", venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding", assignment_revision: "a",
  owner_revision: "o", binding_revision: "b", valid_from_ms: 0, valid_to_ms: null });
interface FactOptions { at: number; method?: string | null; currency?: string; window?: { from_ms: number; to_ms: number } | null; account?: string; id?: string;
  unit?: string; freshness?: "FRESH" | "STALE" | "UNKNOWN"; confidence?: "VERIFIED" | "PROVISIONAL" | "UNKNOWN" }
function fact(kind: "current_nav" | "net_pnl", tuple: ManagerMember["tuple"], value: string, o: FactOptions): ManagerFact {
  const currency = o.currency ?? "USDT", account = o.account ?? tuple.account_id;
  return { fact_id: o.id ?? `TEST_ONLY:${kind}:${tuple.deployment_id}:${currency}:${o.at}`, revision: `TEST_ONLY:f${o.at}`, source_receipt_ref: "TEST_ONLY:receipt",
    tuple: { ...tuple }, partition: PARTITION(currency), economic_account_ref: `TEST_ONLY:econ:${account}`, ownership_partition_ref: `TEST_ONLY:own:${account}`, kind,
    metric: { value, unit: o.unit ?? "MONEY", currency, basis: "TEST_ONLY:ledger", window: o.window ?? null, denominator: null,
      methodology_ref: o.method === undefined ? "TEST_ONLY:method.v1" : o.method, availability: "AVAILABLE", reason_code: null,
      quality: { completeness: "COMPLETE", freshness: o.freshness ?? "FRESH", reasons: [] }, source_confidence: o.confidence ?? "VERIFIED",
      provenance_refs: ["TEST_ONLY:prov"], calculation_revision: "TEST_ONLY:calc", policy_revision: "TEST_ONLY:policy" },
    effective_at_ms: o.at, recorded_at_ms: o.at, classification: "ECONOMIC", transfer_pair_ref: null, counterpart_portfolio_id: null };
}
interface DocOptions { n: number; asOf: number; supersedes?: string | null; facts: ManagerFact[]; tuples?: ManagerMember["tuple"][]; qualification?: "SOURCE_VERIFIED" | "TEST_ONLY";
  generation?: string; epoch?: string; freshness?: "FRESH" | "STALE" }
const TUPLES = [OWN, PEER, PRIVATE];
function document(o: DocOptions): ManagerModelDocument {
  return managerModelDocument.parse({ schema_version: "portal.execution.manager-model-input.v1", workspace_id: "TEST_ONLY:workspace", environment: "paper",
    profile_id: "PAPER_BINANCE_USDM", qualification: o.qualification ?? "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision: `TEST_ONLY:r${o.n}`,
    supersedes_revision: o.supersedes === undefined ? (o.n === 0 ? null : `TEST_ONLY:r${o.n - 1}`) : o.supersedes, source_epoch: o.epoch ?? "TEST_ONLY:epoch",
    source_sequence: `${o.n + 1}`, projection_generation: o.generation ?? "TEST_ONLY:g1", catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest,
    source_set_digest: accessDigest(["set", o.n]), as_of_ms: o.asOf, recorded_through_ms: o.asOf, facts_through_ms: o.asOf, observed_at_ms: o.asOf,
    source_quality: { completeness: "COMPLETE", freshness: o.freshness ?? "FRESH", reasons: [] }, members: (o.tuples ?? TUPLES).map(member), facts: dedupeManagerFacts(o.facts) });
}
/** Facts for one revision: the SHARED account (OWN and PEER clone one economic account) and the private account. */
function facts(at: number, shared: string, priv: string, extra: Partial<FactOptions> = {}, pnl?: [string, string]): ManagerFact[] {
  const out = [fact("current_nav", OWN, shared, { at, account: "shared", ...extra }), fact("current_nav", PEER, shared, { at, account: "shared", ...extra }),
    fact("current_nav", PRIVATE, priv, { at, account: "private", ...extra })];
  // net_pnl has no ownership de-duplication in the reader, so the clone PEER carries an explicit zero (not a double count).
  if (pnl) out.push(fact("net_pnl", OWN, pnl[0], { at, account: "shared", ...extra }), fact("net_pnl", PEER, "0", { at, account: "shared", ...extra }),
    fact("net_pnl", PRIVATE, pnl[1], { at, account: "private", ...extra }));
  return out;
}
const historyOf = (docs: ManagerModelDocument[]): SeriesHistory => {
  const derived = docs.map(deriveSeriesObservations);
  return { revisions: derived.map(d => d.marker), observations: derived.flatMap(d => d.observations) };
};
/** r0 (31 days before: proves the history reaches the window start), r1 (-10d), r2 (-1d), r3 = current. */
function chain(navs: Array<[string, string]>, pnls?: Array<[string, string]>, patch: (n: number, o: DocOptions) => DocOptions = (_, o) => o) {
  const at = [T0 - 31 * DAY, T0 - 10 * DAY, T0 - DAY, T0];
  return navs.map((nav, n) => document(patch(n, { n, asOf: at[n], facts: facts(at[n], nav[0], nav[1], {}, pnls?.[n]) })));
}
const NAVS: Array<[string, string]> = [["100", "50"], ["101.5", "50.25"], ["99.25", "50"], ["102", "50.5"]];
const PNLS: Array<[string, string]> = [["0.1", "0.2"], ["0.3", "0.4"], ["0.5", "0.6"], ["0.7", "0.8"]];
const find = (r: ReturnType<typeof materializeManagerSeries>, subject: string, metric: "NAV" | "NET_PNL") =>
  r.publications.find(p => p.binding.subject_id === subject && p.binding.metric === metric);

describe("BE-P16 derivation: one revision reduced to exact observations or typed absences", () => {
  it("sums exactly (no float), counts a shared economic account once, and keeps each instant", () => {
    const d = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: facts(T0, "0.1", "0.2", {}, ["123456789012345678.123456789", "-0.000000000000000001"]) }));
    const pick = (subject: string, metric: string) => d.observations.find(o => o.subject_id === subject && o.metric === metric)!;
    expect(pick("TEST_ONLY:workspace", "NAV")).toMatchObject({ value: "0.3", point_ts_ms: T0, currency: "USDT", methodology_ref: "TEST_ONLY:method.v1", reason_code: null });
    expect(pick(OWN.portfolio_id, "NAV").value).toBe("0.1");   // OWN + PEER clone one account: counted once
    expect(pick(PRIVATE.portfolio_id, "NAV").value).toBe("0.2");
    expect(pick("TEST_ONLY:workspace", "NET_PNL").value).toBe("123456789012345678.123456788999999999");
    expect(d.observations).toHaveLength(6);
  });
  it("is deterministic: the same document always has the same digest, regardless of fact order", () => {
    const base = document({ n: 0, asOf: T0, facts: facts(T0, "1", "2", {}, ["3", "4"]) });
    const shuffled = document({ n: 0, asOf: T0, facts: [...base.facts].reverse() });
    expect(deriveSeriesObservations(base).observation_digest).toBe(deriveSeriesObservations(shuffled).observation_digest);
    expect(deriveSeriesObservations(base)).toEqual(deriveSeriesObservations(structuredClone(base)));
  });
  it("a missing methodology is a typed absence of that metric only; the other metric still has its point", () => {
    const f = [...facts(T0, "1", "2", { method: null }), ...facts(T0, "1", "2", {}, ["5", "6"]).filter(x => x.kind === "net_pnl")];
    const d = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: f }));
    expect(d.observations.filter(o => o.metric === "NAV").every(o => o.value === null && o.reason_code === "METHODOLOGY_NOT_PUBLISHED")).toBe(true);
    expect(d.observations.filter(o => o.metric === "NET_PNL").every(o => o.value !== null)).toBe(true);
    expect(d.absences).toContainEqual({ reason_code: "METHODOLOGY_NOT_PUBLISHED", metric: "NAV", count: 3 });
  });
  it("facts at different valuation instants are not one point (no alignment is invented)", () => {
    const f = [fact("current_nav", PRIVATE, "1", { at: T0 - 10, account: "private" }), fact("current_nav", OWN, "2", { at: T0, account: "shared" })];
    const d = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: f, tuples: [OWN, PRIVATE] }));
    expect(d.observations.find(o => o.subject_id === "TEST_ONLY:workspace" && o.metric === "NAV")).toMatchObject({ value: null, reason_code: "INCOMPARABLE_VALUATION_CUTOFF" });
  });
  it("a member without a fact breaks the census; a non-money unit and a stale fact are absences, never numbers", () => {
    const census = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: facts(T0, "1", "2").slice(0, 2) }));
    expect(census.observations.find(o => o.subject_id === "TEST_ONLY:workspace" && o.metric === "NAV")).toMatchObject({ value: null, reason_code: "SOURCE_FACT_CENSUS_INCOMPLETE" });
    const ratio = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: facts(T0, "1", "2", { unit: "RATIO" }) }));
    expect(ratio.observations.every(o => o.value === null)).toBe(true);
    const stale = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: facts(T0, "1", "2", { freshness: "STALE" }) }));
    expect(stale.observations.every(o => o.value === null && o.reason_code === "SOURCE_NOT_FRESH")).toBe(true);
  });
  it("two currencies: one series per partition and the cross-currency total stays absent (no FX source)", () => {
    const f = [...facts(T0, "1", "2"), fact("current_nav", PRIVATE, "9000", { at: T0, currency: "VND", account: "private-vnd", id: "TEST_ONLY:vnd" })];
    const d = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: f }));
    expect(d.absences).toContainEqual({ reason_code: "FX_RATE_NOT_PUBLISHED", metric: "NAV", count: expect.any(Number) });
    const fund = d.observations.filter(o => o.subject_id === "TEST_ONLY:workspace" && o.metric === "NAV");
    expect(fund.map(o => o.partition.currency).sort()).toEqual(["USDT", "VND"]);
    expect(fund.find(o => o.partition.currency === "VND")).toMatchObject({ value: "9000" });
  });
  it("a TEST_ONLY revision is a known, empty revision (never a point); conflicting snapshot facts do not throw", () => {
    const testOnly = deriveSeriesObservations(document({ n: 0, asOf: T0, qualification: "TEST_ONLY", facts: facts(T0, "1", "2") }));
    expect(testOnly.observations).toEqual([]); expect(testOnly.marker.qualification).toBe("TEST_ONLY");
    expect(testOnly.absences).toContainEqual({ reason_code: "SOURCE_NOT_QUALIFIED", metric: null, count: 1 });
    const clash = [fact("current_nav", OWN, "1", { at: T0, account: "shared" }), fact("current_nav", PEER, "2", { at: T0, account: "shared" })];
    const refused = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: clash, tuples: [OWN, PEER] }));
    expect(refused.observations).toEqual([]); expect(refused.absences).toContainEqual({ reason_code: "SERIES_DERIVATION_REFUSED", metric: null, count: 1 });
  });
  it("populations are the fund and each portfolio, over the members active at the cutoff only", () => {
    const d = document({ n: 0, asOf: T0, facts: [] }); d.members[2].valid_to_ms = T0 - 1;
    expect(seriesPopulations(d).map(p => [p.subject_type, p.subject_id, p.members.length])).toEqual([["manager_book", "TEST_ONLY:workspace", 2], ["portfolio", OWN.portfolio_id, 2]]);
  });
  it("more than 128 observations are never truncated: the revision is recorded empty and says so", () => {
    const many: ManagerFact[] = [], tuples: ManagerMember["tuple"][] = [];
    for (let i = 0; i < 70; i++) {
      const t = { ...OWN, portfolio_id: `p${i}`, deployment_id: `d${i}`, account_id: `a${i}` }; tuples.push(t);
      many.push(fact("current_nav", t, "1", { at: T0 }), fact("net_pnl", t, "1", { at: T0 }));
    }
    const d = deriveSeriesObservations(document({ n: 0, asOf: T0, facts: many, tuples }));
    expect(d.observations).toEqual([]); expect(d.absences).toEqual([{ reason_code: "SERIES_OBSERVATION_BOUND", metric: null, count: 1 }]);
  });
});

describe("BE-P16 materialization: stored publications from facts alone", () => {
  const docs = chain(NAVS, PNLS), current = docs[3], history = historyOf(docs.slice(0, 3));
  const out = materializeManagerSeries(current, history, CFG);
  it("publishes NAV and NET_PNL for the fund and every portfolio; every publication satisfies the stored contract and the document binding", () => {
    expect(out.publications).toHaveLength(6);
    for (const p of out.publications) expect(managerSeriesPublication.safeParse(p).success).toBe(true);
    expect(managerModelDocument.safeParse({ ...current, precomputed_series: out.publications }).success).toBe(true);
    expect(out.publications.every(p => p.binding.window_end_ms === T0 && p.binding.window_start_ms === T0 - 30 * DAY)).toBe(true);
    expect(out.publications.every(p => p.provenance.source_revision === current.revision && p.provenance.calculation_revision === MANAGER_SERIES_CALCULATION_REVISION)).toBe(true);
  });
  it("points are the exact totals at their own instants, ascending, inside the window; the r0 revision outside it only proves the history reaches back", () => {
    const fund = find(out, "TEST_ONLY:workspace", "NAV")!;
    expect(fund.series.points).toEqual([{ ts_ms: T0 - 10 * DAY, value: "151.75" }, { ts_ms: T0 - DAY, value: "149.25" }, { ts_ms: T0, value: "152.5" }]);
    expect(fund.series).toMatchObject({ unit: "MONEY", currency: "USDT", ratio_scale: null, basis: "TEST_ONLY:ledger", methodology_ref: "TEST_ONLY:method.v1", gaps: [] });
    expect(fund.quality).toEqual({ completeness: "COMPLETE", freshness: "FRESH", reasons: [] });
    expect(find(out, "TEST_ONLY:workspace", "NET_PNL")!.series.points.map(p => p.value)).toEqual(["0.7", "1.1", "1.5"]);
    expect(find(out, OWN.portfolio_id, "NAV")!.series.points.map(p => p.value)).toEqual(["101.5", "99.25", "102"]);
    expect(find(out, PRIVATE.portfolio_id, "NAV")!.series.points.map(p => p.value)).toEqual(["50.25", "50", "50.5"]);
  });
  it("never produces RETURN and reports why, per owner input; ALL and Alpha/Deployment subjects stay typed absences", () => {
    expect(out.publications.some(p => (p.binding.metric as string) === "RETURN")).toBe(false);
    for (const reason of ["RATIO_SCALE_NOT_PUBLISHED", "CASHFLOW_REVISION_NOT_PUBLISHED", "ECONOMIC_REVISION_NOT_PUBLISHED", "RETURN_DENOMINATOR_NOT_PUBLISHED", "RETURN_METHODOLOGY_NOT_PUBLISHED"])
      expect(out.absences).toContainEqual({ reason_code: reason, metric: "RETURN", count: 3 });
    expect(out.absences).toContainEqual({ reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED", metric: null, count: 1 });
    expect(out.absences).toContainEqual({ reason_code: "ALPHA_DEPLOYMENT_SUBJECT_NOT_IN_CONTRACT", metric: null, count: 1 });
  });
  it("a first-ever revision is a one-point PARTIAL series that says the history starts late (never COMPLETE)", () => {
    const first = materializeManagerSeries(docs[3], { revisions: [], observations: [] }, CFG);
    const p = find(first, "TEST_ONLY:workspace", "NAV")!;
    expect(p.series.points).toEqual([{ ts_ms: T0, value: "152.5" }]);
    expect(p.quality).toMatchObject({ completeness: "PARTIAL", reasons: expect.arrayContaining(["HISTORY_STARTS_AFTER_WINDOW_START"]) });
  });
  it("is idempotent: the same inputs give the same publications byte for byte, and a replayed revision adds nothing", () => {
    expect(materializeManagerSeries(current, history, CFG)).toEqual(out);
    const replayed = materializeManagerSeries(current, { revisions: [...history.revisions, deriveSeriesObservations(current).marker],
      observations: [...history.observations, ...deriveSeriesObservations(current).observations] }, CFG);
    expect(replayed.publications).toEqual(out.publications);
  });
  it("TEST_ONLY, stale or partial documents publish nothing", () => {
    for (const patch of [{ qualification: "TEST_ONLY" as const }, { freshness: "STALE" as const }]) {
      const doc = document({ n: 3, asOf: T0, facts: facts(T0, "102", "50.5"), ...patch });
      expect(materializeManagerSeries(doc, history, CFG).publications).toEqual([]);
    }
  });
  it("the reader serves it: window, population digest, partition and stages all match the selector", async () => {
    const f = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] });
    const live = document({ n: 3, asOf: T0, facts: facts(T0, "102", "50.5") });
    const prior = chain(NAVS).slice(0, 3);
    const doc = { ...live, workspace_id: f.principal.workspaceId };
    const rewritten = [...prior.map(p => ({ ...p, workspace_id: doc.workspace_id })), doc];
    const published = materializeManagerSeries(doc, historyOf(rewritten.slice(0, 3)), CFG);
    const withSeries = { ...doc, precomputed_series: published.publications };
    expect(managerModelDocument.safeParse(withSeries).success).toBe(true);
    const binding = { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation, catalogue_revision: doc.catalogue_digest, window: null };
    const scope = await f.scopes.authorize(f.principal, { environment: "paper", profileId: doc.profile_id }, { action: "business.read_all", dataset: binding });
    const subjects = [{ subject_type: "FUND" as const }, { subject_type: "PORTFOLIO" as const, subject_id: OWN.portfolio_id }];
    const response = queryManagerSeries(subjects.map(subject => ({ subject, scope })), withSeries, { environment: "paper", metric: "NAV", window: "30D", subjects });
    expect(response.series_source).toEqual({ state: "PUBLISHED", reason_code: null });
    expect(response.series.map(s => [s.state, s.points.map(p => p.value)])).toEqual([["AVAILABLE", ["151.75", "149.25", "152.5"]], ["AVAILABLE", ["101.5", "99.25", "102"]]]);
    expect(response.series[0]).toMatchObject({ unit: "MONEY", currency: "USDT", methodology_ref: "TEST_ONLY:method.v1", window: { from_ms: T0 - 30 * DAY, to_ms: T0 } });
    // The 7D window was not configured: exact-window rule, nothing is re-cut.
    const seven = queryManagerSeries(subjects.map(subject => ({ subject, scope })), withSeries, { environment: "paper", metric: "NAV", window: "7D", subjects });
    expect(seven.series.every(s => s.reason_code === "EXACT_METRIC_WINDOW_NOT_PUBLISHED")).toBe(true);
    // RETURN was never produced.
    const ret = queryManagerSeries(subjects.map(subject => ({ subject, scope })), withSeries, { environment: "paper", metric: "RETURN", window: "30D", subjects });
    expect(ret.series.every(s => s.state === "UNAVAILABLE" && s.points.length === 0)).toBe(true);
  });
});

describe("BE-P16 gaps are stated, never filled; what cannot be vouched for is PARTIAL", () => {
  it("a missing revision in the chain is a SOURCE_GAP between the surrounding points", () => {
    const docs = chain(NAVS), cur = docs[3];
    const skipped = { ...cur, supersedes_revision: "TEST_ONLY:r-missing" };
    const p = find(materializeManagerSeries(skipped, historyOf([docs[0], docs[1]]), CFG), "TEST_ONLY:workspace", "NAV")!;
    expect(p.series.points.map(x => x.value)).toEqual(["151.75", "152.5"]);
    expect(p.series.gaps).toEqual([{ from_ms: T0 - 10 * DAY, to_ms: T0, reason: "SOURCE_GAP" }]);
    expect(p.quality.completeness).toBe("PARTIAL"); expect(p.quality.reasons).toEqual(expect.arrayContaining(["REVISION_CHAIN_BREAK", "GAPS_STATED"]));
  });
  it("a projection generation change is a PROJECTION_DISCONTINUITY, and it outranks a plain gap", () => {
    const docs = chain(NAVS, undefined, (n, o) => n >= 2 ? { ...o, generation: "TEST_ONLY:g2" } : o);
    const p = find(materializeManagerSeries(docs[3], historyOf(docs.slice(0, 3)), CFG), "TEST_ONLY:workspace", "NAV")!;
    expect(p.series.points).toHaveLength(3);
    expect(p.series.gaps).toEqual([{ from_ms: T0 - 10 * DAY, to_ms: T0 - DAY, reason: "PROJECTION_DISCONTINUITY" }]);
  });
  it("an intervening revision that could not be valued is a gap even though the chain is unbroken", () => {
    const docs = chain(NAVS, undefined, (n, o) => n === 2 ? { ...o, facts: facts(o.asOf, "99.25", "50", { method: null }) } : o);
    const p = find(materializeManagerSeries(docs[3], historyOf(docs.slice(0, 3)), CFG), "TEST_ONLY:workspace", "NAV")!;
    expect(p.series.points.map(x => x.value)).toEqual(["151.75", "152.5"]);
    expect(p.series.gaps).toEqual([{ from_ms: T0 - 10 * DAY, to_ms: T0, reason: "SOURCE_GAP" }]);
  });
  it("a TEST_ONLY revision inside the chain keeps the chain and leaves a gap (it carries no points)", () => {
    const docs = chain(NAVS, undefined, (n, o) => n === 2 ? { ...o, qualification: "TEST_ONLY" as const } : o);
    const p = find(materializeManagerSeries(docs[3], historyOf(docs.slice(0, 3)), CFG), "TEST_ONLY:workspace", "NAV")!;
    expect(p.series.gaps).toEqual([{ from_ms: T0 - 10 * DAY, to_ms: T0, reason: "SOURCE_GAP" }]);
  });
  it("when the current revision has no valid value for a key there is no series for it (no stale tail is passed off as current)", () => {
    const docs = chain(NAVS), cur = document({ n: 3, asOf: T0, facts: facts(T0, "102", "50.5", { method: null }) });
    const r = materializeManagerSeries(cur, historyOf(docs.slice(0, 3)), CFG);
    expect(r.publications).toEqual([]); expect(r.absences).toContainEqual({ reason_code: "METHODOLOGY_NOT_PUBLISHED", metric: "NAV", count: 3 });
  });
  it("observations of another methodology, origin or population are excluded and the series is PARTIAL with the reason", () => {
    const docs = chain(NAVS, undefined, (n, o) => n === 1 ? { ...o, facts: facts(o.asOf, "101.5", "50.25", { method: "TEST_ONLY:method.v2" }) } : o);
    const p = find(materializeManagerSeries(docs[3], historyOf(docs.slice(0, 3)), CFG), "TEST_ONLY:workspace", "NAV")!;
    expect(p.series.points.map(x => x.value)).toEqual(["149.25", "152.5"]);
    expect(p.quality.reasons).toContain("OBSERVATIONS_OF_ANOTHER_BASIS_EXCLUDED");
    const grown = chain(NAVS, undefined, (n, o) => n === 3 ? { ...o, tuples: [OWN, PEER] , facts: facts(o.asOf, "102", "50.5").slice(0, 2) } : o);
    const q = find(materializeManagerSeries(grown[3], historyOf(grown.slice(0, 3)), CFG), OWN.portfolio_id, "NAV")!;
    expect(q.quality.reasons).not.toContain("POPULATION_CHANGED_IN_WINDOW");
    const fund = find(materializeManagerSeries(grown[3], historyOf(grown.slice(0, 3)), CFG), "TEST_ONLY:workspace", "NAV")!;
    expect(fund.series.points.map(x => x.value)).toEqual(["102"]);
    expect(fund.quality.reasons).toContain("POPULATION_CHANGED_IN_WINDOW");
  });
  it("two revisions that disagree about one instant produce no series for it; equal decimals spelled differently do not disagree", () => {
    const docs = chain(NAVS), history = historyOf(docs.slice(0, 3));
    const twin = deriveSeriesObservations(document({ n: 9, asOf: T0 - 9 * DAY, supersedes: "TEST_ONLY:r1", facts: facts(T0 - 10 * DAY, "101.5", "50.25") }));
    const spelled = deriveSeriesObservations(document({ n: 8, asOf: T0 - 9 * DAY, supersedes: "TEST_ONLY:r1", facts: facts(T0 - 10 * DAY, "101.50", "50.250") }));
    const agree = materializeManagerSeries(docs[3], { revisions: [...history.revisions, spelled.marker], observations: [...history.observations, ...spelled.observations] }, CFG);
    expect(find(agree, OWN.portfolio_id, "NAV")!.series.points).toHaveLength(3);
    const clash = twin.observations.map(o => o.metric === "NAV" ? { ...o, value: "999" } : o);
    const conflicted = materializeManagerSeries(docs[3], { revisions: [...history.revisions, twin.marker], observations: [...history.observations, ...clash] }, CFG);
    expect(find(conflicted, OWN.portfolio_id, "NAV")).toBeUndefined();
    expect(conflicted.absences.some(a => a.reason_code === "CONFLICTING_OBSERVATIONS_AT_INSTANT" && a.metric === "NAV")).toBe(true);
  });
});

describe("BE-P16 bounds and configuration", () => {
  const docs = chain(NAVS, PNLS), history = historyOf(docs.slice(0, 3));
  it("a document-wide point budget stops publication deterministically with a stated reason, never a prefix of a series", () => {
    const r = materializeManagerSeries(docs[3], history, { ...CFG, maximum_total_points: 7 });
    expect(r.publications.every(p => p.series.points.length === 3)).toBe(true);
    expect(r.publications).toHaveLength(2);
    expect(r.absences).toContainEqual({ reason_code: "SERIES_DOCUMENT_BOUND", metric: null, count: 1 });
  });
  it("a history larger than the read cap publishes nothing", () => {
    const r = materializeManagerSeries(docs[3], history, { ...CFG, maximum_history_rows: 5 });
    expect(r.publications).toEqual([]); expect(r.absences).toContainEqual({ reason_code: "SERIES_HISTORY_BOUND", metric: null, count: 1 });
  });
  it("more than 2000 points is a typed absence, not a truncated series", () => {
    const start = T0 - 20 * DAY, rows = Array.from({ length: 2001 }, (_, i) => document({ n: 1000 + i, asOf: start + i * 1000, supersedes: i ? `TEST_ONLY:r${999 + i}` : null,
      facts: facts(start + i * 1000, `${i + 1}`, "1") }));
    const h = historyOf(rows), cur = document({ n: 5000, asOf: T0, supersedes: "TEST_ONLY:r3000", facts: facts(T0, "5", "1") });
    const r = materializeManagerSeries(cur, h, { ...CFG, maximum_history_rows: 100_000 });
    expect(find(r, "TEST_ONLY:workspace", "NAV")).toBeUndefined();
    expect(r.absences.some(a => a.reason_code === "SERIES_POINT_BOUND_EXCEEDED")).toBe(true);
  });
  it("a window before the epoch is not fabricated", () => {
    const early = document({ n: 0, asOf: 5 * DAY, facts: facts(5 * DAY, "1", "2") });
    expect(materializeManagerSeries(early, { revisions: [], observations: [] }, CFG).absences).toContainEqual({ reason_code: "WINDOW_BEFORE_EPOCH", metric: null, count: 1 });
  });
  it("configuration is explicit, finite and closed", () => {
    for (const bad of [{ windows: [] }, { windows: ["ALL"] }, { windows: ["7D", "7D"] }, { maximum_total_points: 0 }, { maximum_history_rows: 200_001 }, { maximum_total_points: 1.5 }])
      expect(() => validateSeriesConfig({ ...CFG, ...bad } as unknown as ManagerSeriesConfig)).toThrow("MANAGER_SERIES_CONFIG_INVALID");
    expect(Object.isFrozen(validateSeriesConfig(CFG))).toBe(true);
    expect(() => new ManagerSeriesRuntime({} as Pool, { ...CFG, maximum_backfill_revisions: 0 })).toThrow("MANAGER_SERIES_CONFIG_INVALID");
    expect(() => new ManagerSeriesRuntime({} as Pool, { ...CFG, maximum_backfill_revisions: 17 })).toThrow("MANAGER_SERIES_CONFIG_INVALID");
  });
});

describe("BE-P16 runtime slot: the series writer may refuse, it can never fail the financial revision", () => {
  const abort = new AbortController();
  it("materialize survives a failing history read: no publications, a typed absence, the revision is still derivable", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("connection reset")) } as unknown as Pool;
    const runtime = new ManagerSeriesRuntime(pool, { ...CFG, maximum_backfill_revisions: 1 });
    const r = await runtime.materialize(chain(NAVS)[3], abort.signal);
    expect(r.publications).toEqual([]); expect(r.absences).toEqual([{ reason_code: "SERIES_MATERIALIZATION_FAILED", metric: null, count: 1 }]);
    expect(r.current.observations.length).toBeGreaterThan(0);
  });
  it("cancellation is not swallowed", async () => {
    const stop = new AbortController(); stop.abort(new Error("MANAGER_RUNTIME_STOPPED"));
    const runtime = new ManagerSeriesRuntime({ query: vi.fn() } as unknown as Pool, { ...CFG, maximum_backfill_revisions: 1 });
    await expect(runtime.materialize(chain(NAVS)[3], stop.signal)).rejects.toThrow("MANAGER_RUNTIME_STOPPED");
  });
  const clientFor = (failOn: RegExp | null) => {
    const sql: string[] = [];
    const query = vi.fn(async (text: string) => {
      sql.push(text.split("\n")[0].trim().slice(0, 60));
      if (failOn && failOn.test(text)) throw Object.assign(new Error("SERIES_STATEMENT_REFUSED"), { code: "23514" });
      return { rows: [], rowCount: 0 };
    });
    return { client: { query } as unknown as PoolClient, sql };
  };
  const delivered = () => { const document = chain(NAVS)[3]; return { document, publication: {} } as never; };
  it("a refused series write rolls back to its SAVEPOINT, is remembered, and does not throw", async () => {
    const runtime = new ManagerSeriesRuntime({ query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool, { ...CFG, maximum_backfill_revisions: 1 });
    const delivery = delivered(), materialized = await runtime.materialize((delivery as { document: ManagerModelDocument }).document, abort.signal);
    runtime.attach(delivery, materialized);
    const { client, sql } = clientFor(/INSERT INTO execution_manager_series_revisions/);
    await expect(runtime.lifecycle().persistAttached(client, delivery)).resolves.toBeUndefined();
    expect(sql.some(s => s.startsWith("SAVEPOINT manager_optional_series"))).toBe(true);
    expect(sql.some(s => s.startsWith("ROLLBACK TO SAVEPOINT manager_optional_series"))).toBe(true);
    expect(sql.some(s => s.startsWith("INSERT INTO execution_manager_series_checkpoints"))).toBe(true);
    expect(sql.some(s => s.startsWith("RELEASE SAVEPOINT manager_optional_series"))).toBe(true);
  });
  it("a delivery without an attached materialization (a lost-ACK replay) writes nothing", async () => {
    const runtime = new ManagerSeriesRuntime({ query: vi.fn() } as unknown as Pool, { ...CFG, maximum_backfill_revisions: 1 });
    const { client, sql } = clientFor(null);
    await runtime.lifecycle().persistAttached(client, delivered());
    expect(sql).toEqual([]);
  });
  it("the wrapper delegates deadline, assertion and idle to the lifecycle it wraps, and is a no-op around nothing", async () => {
    const delegate = { attachedDeadline: vi.fn(() => 42), assertAttached: vi.fn(), persistAttached: vi.fn(async () => undefined), idle: vi.fn(async () => undefined) };
    const runtime = new ManagerSeriesRuntime({ query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool, { ...CFG, maximum_backfill_revisions: 1 });
    const wrapped = runtime.lifecycle(delegate as never), d = delivered();
    expect(wrapped.attachedDeadline(d)).toBe(42); wrapped.assertAttached(d); expect(delegate.assertAttached).toHaveBeenCalledWith(d);
    await wrapped.persistAttached({ query: vi.fn() } as unknown as PoolClient, d); expect(delegate.persistAttached).toHaveBeenCalledTimes(1);
    expect(runtime.lifecycle().attachedDeadline(d)).toBeUndefined();
  });
});

describe("BE-P16 migration 147: file hygiene (no PostgreSQL)", () => {
  const dir = resolve(__dirname, "../migrations"), name = "1723680000147_execution-manager-series-observations.sql";
  const sql = readFileSync(resolve(dir, name), "utf8"), [up, down] = sql.split("-- Down Migration");
  it("is the only migration with its number and strictly after 146", () => {
    const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
    expect(files.filter(f => f.startsWith("1723680000147_"))).toEqual([name]);
    expect(files.indexOf(name)).toBe(files.indexOf("1723680000146_execution-f0-apply-attempts.sql") + 1);
  });
  it("creates exactly the three tables, append-only triggers and no destructive statement", () => {
    expect([...up.matchAll(/CREATE TABLE (\w+)/g)].map(m => m[1])).toEqual(["execution_manager_series_revisions", "execution_manager_series_observations", "execution_manager_series_checkpoints"]);
    expect(up).toMatch(/BEFORE UPDATE OR DELETE ON execution_manager_series_observations/);
    expect(up).not.toMatch(/\b(DROP|TRUNCATE|ALTER TABLE)\b/i);
    expect(down).not.toMatch(/\bDROP\b/i);
  });
  it("makes a value and a reason mutually exclusive and ties both to the point columns", () => {
    expect(up).toMatch(/execution_manager_series_value_xor_reason CHECK \(\(value IS NULL\) <> \(reason_code IS NULL\)\)/);
    expect(up).toMatch(/execution_manager_series_value_has_point/);
  });
});
