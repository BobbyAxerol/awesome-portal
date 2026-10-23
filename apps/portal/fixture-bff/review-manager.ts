/**
 * Opt-in, SYNTHETIC review data only. Never imported by product code, never source acceptance.
 * The original sparse L0 doubles are not changed. The caller selects the shared medium/large
 * bffScale universe; this answerer never changes process-global scale or clock state.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPositiveManagerSeries } from "../../../packages/contracts/tooling/execution-manager-positive-series-fixtures.mjs";

import { ALPHA_DOUBLE_AS_OF_MS, answerAlpha } from "../frontend/e2e/bffDoubleAlpha";
import { answerManagerFleet, answerManagerSeries } from "../frontend/e2e/bffDoubleManager";
import { answerPortfolios } from "../frontend/e2e/bffDoublePortfolios";
import { addDecimal, fixtureNowMs, scaled, type AlphaSpec, type DeploymentSpec } from "../frontend/e2e/bffScale";

// Mutable copies of published JSON templates, confined to this server-only fixture module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
export type ReviewManagerProfile = "populated" | "layout-stress";
export interface ReviewManagerResponse { status: number; body: unknown }
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// The standalone build has one explicit supported relocation: fixture-bff/dist/server.mjs.
// Do not search arbitrary parent directories or substitute another fixture source.
const CONTRACTS = join(MODULE_DIR, basename(MODULE_DIR) === "dist" ? "../../../../packages/contracts/fixtures" : "../../../packages/contracts/fixtures");
const fixture = (name: string): Draft => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")).value;
const copy = <T,>(value: T): T => structuredClone(value);
const digest = (value: unknown): string => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const problem = (status: number, code: string, message: string): ReviewManagerResponse => ({ status, body: { error: { code, message } } });
const unavailable = (subject: Draft, reason: string): Draft => {
  const entry = fixture("execution-manager-series.unavailable.synthetic.valid.json").series[1];
  return { ...entry, subject, reason_code: reason, quality: { ...entry.quality, reasons: [reason, "FIXTURE_LAB_SYNTHETIC"] } };
};
const STAGES: Record<string, readonly string[]> = { paper: ["PAPER"], sandbox: ["SANDBOX"], live: ["CANARY", "LIVE"] };
const domain = (environment: string): string => environment === "live" ? "ACTUAL" : environment.toUpperCase();

function comparison(series: Draft[]): Draft {
  const neutral = { transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM", axis_ms: null };
  const described = series.filter((entry) => entry.state !== "UNAVAILABLE");
  const common = (entry: Draft): Draft => ({ economic_domain: entry.partition.economic_domain, native_profile_ref: entry.partition.native_profile_ref,
    currency: entry.currency, basis: entry.basis, unit: entry.unit, ratio_scale: entry.ratio_scale, methodology_ref: entry.methodology_ref, window: entry.window });
  if (series.length === 1) return { ...neutral, state: "SINGLE_SUBJECT", reason_code: null, common: described.length ? common(described[0]) : null };
  const first = described[0];
  if (first) {
    const mismatches: [string, (entry: Draft) => boolean][] = [
      ["CURRENCY_MIXED", (entry) => entry.currency !== first.currency],
      ["ECONOMIC_PARTITION_MIXED", (entry) => entry.partition.economic_domain !== first.partition.economic_domain || entry.partition.native_profile_ref !== first.partition.native_profile_ref],
      ["BASIS_MIXED", (entry) => entry.basis !== first.basis], ["UNIT_MIXED", (entry) => entry.unit !== first.unit],
      ["RATIO_SCALE_MIXED", (entry) => entry.ratio_scale !== first.ratio_scale], ["METHODOLOGY_MIXED", (entry) => entry.methodology_ref !== first.methodology_ref],
      ["WINDOW_MISMATCH", (entry) => JSON.stringify(entry.window) !== JSON.stringify(first.window)],
    ];
    for (const [reason, differs] of mismatches) if (described.some(differs)) return { ...neutral, state: "INCOMPARABLE", reason_code: reason, common: null };
  }
  if (series.some((entry) => entry.state !== "AVAILABLE")) return { ...neutral, state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE", common: null };
  return { ...neutral, state: "ALIGNED", reason_code: null, common: common(first), axis_ms: [...new Set<number>(series.flatMap((entry) => entry.points.map((point: Draft) => point.ts_ms)))].sort((a, b) => a - b) };
}

/** Exact decimal synthesis uses integer arithmetic, not floats, and keeps true zero distinct. */
function sampleValue(metric: string, index: number, subjectIndex: number): string {
  if (metric === "RETURN") return index === 0 ? "0" : decimal(BigInt((index % 79) - 24) * 137n + BigInt(subjectIndex), 6);
  if (metric === "NET_PNL") return index === 0 ? "0" : decimal(BigInt((index % 97) - 39) * 1_000_000_000_000_000_003n + BigInt(subjectIndex), 18);
  return decimal(100_000_000_000_000_000_000_001n + BigInt(subjectIndex) * 5_000_000_000_000_000_000_000n + BigInt(index) * 170_000_000_000_000_003n, 18);
}
function decimal(value: bigint, places: number): string {
  const sign = value < 0n ? "-" : "";
  const raw = (value < 0n ? -value : value).toString().padStart(places + 1, "0");
  return `${sign}${raw.slice(0, -places)}.${raw.slice(-places)}`;
}

function seriesAnswer(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse | null {
  const checked = answerManagerSeries(method, path, search);
  if (checked === null || checked.status !== 200) return checked;
  const original = checked.body as Draft;
  // Existing explicit state cases remain usable in the rich lane too; no absence becomes zero.
  if (search.get("workspace_id")?.startsWith("ws_TEST_SERIES_") || original.selected_window.requested === "ALL") return checked;
  const metric = search.get("metric")!;
  const subjects = JSON.parse(search.get("subjects")!) as Draft[];
  const requested = JSON.parse(search.get("window")!) as string | { from_ms: number; to_ms: number };
  const now = fixtureNowMs();
  const target = profile === "layout-stress" ? 1440 : 240;
  const days = requested === "7D" ? 7 : requested === "90D" ? 90 : 30;
  const window = typeof requested === "string" ? { from_ms: now - days * 86_400_000, to_ms: now } : requested;
  if (window.from_ms < 0 || window.to_ms > now || window.to_ms - window.from_ms < target + 1) {
    return problem(400, "MANAGER_REVIEW_WINDOW_NOT_SUPPORTED", "Synthetic review windows must end by FIXTURE_NOW and contain enough distinct timestamps for this profile.");
  }
  const body = fixture(wpkTemplateFile(metric));
  body.metric = metric;
  body.environment = original.environment;
  body.workspace_id = original.workspace_id;
  body.as_of_ms = now;
  body.recorded_through_ms = now;
  body.quality = { completeness: "COMPLETE", freshness: "FRESH", reasons: [] };
  body.selected_window = { requested, resolved: window, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
  const pinned = search.has("economic_partition") ? JSON.parse(search.get("economic_partition")!) : null;
  const knownPortfolios = new Map([...scaled().portfolios, ...wpcPortfolioStubs(body.environment)].map((portfolio) => [portfolio.id, portfolio]));
  body.series = subjects.map((subject, subjectIndex) => {
    const identity = { subject_type: subject.subject_type, subject_id: subject.subject_type === "FUND" ? body.workspace_id : subject.subject_id };
    const portfolio = subject.subject_type === "ALPHA" ? wpkAlphaBook(identity.subject_id, body.environment) : knownPortfolios.get(identity.subject_id); // WP-K
    // Keep the canonical small-lane subjects valid; unknown scaled IDs are not fabricated.
    if (subject.subject_type === "ALPHA" && !portfolio) return unavailable(identity, "SUBJECT_HAS_NO_ACTIVE_MEMBERS"); // WP-K
    if (subject.subject_type === "PORTFOLIO" && !portfolio && !["TEST_ONLY:portfolio-a", "TEST_ONLY:portfolio-b", "pf_a", "pf_b"].includes(identity.subject_id)) return unavailable(identity, "SUBJECT_HAS_NO_ACTIVE_MEMBERS");
    const entry = copy(body.series[0]);
    entry.subject = identity;
    entry.partition = { economic_domain: domain(body.environment), currency: portfolio?.base ?? "USDT", basis: `FIXTURE_LAB:${metric}:synthetic-book`,
      native_profile_ref: `FIXTURE_LAB:${body.environment}:synthetic`, domain_proof_ref: "FIXTURE_LAB:NOT_PRODUCT_AUTHORITY" };
    if (pinned && Object.keys(entry.partition).some((key) => pinned[key] !== entry.partition[key])) return unavailable(identity, "ECONOMIC_PARTITION_REQUIRED");
    entry.unit = wpkRatio(metric) ? "RATIO" : "MONEY";
    entry.currency = wpkRatio(metric) ? null : entry.partition.currency;
    entry.ratio_scale = wpkRatio(metric) ? "FRACTION" : null;
    entry.basis = entry.partition.basis;
    entry.methodology_ref = `FIXTURE_LAB:${metric}:synthetic-sequence-v1`;
    entry.window = copy(window);
    const at = (index: number): number => window.from_ms + Math.floor(index * (window.to_ms - window.from_ms - 1) / (target - 1));
    entry.points = Array.from({ length: target }, (_, index) => index)
      .map((index) => ({ ts_ms: at(index), value: sampleValue(metric === "DRAWDOWN" ? "NAV" : metric, index, subjectIndex) })); // WP-K: a drawdown is derived from the NAV walk below
    entry.gaps = [];
    if (subject.subject_type === "FUND") wpF1ShapeFund(entry, metric === "DRAWDOWN" ? "NAV" : metric, body.environment, requested); // WP-F1: the fund line ends on the fund dataset's own statement figure
    else wpcShapeSeries(entry, metric === "DRAWDOWN" ? "NAV" : metric, identity.subject_id, body.environment, requested, subject.subject_type === "ALPHA" ? "alpha_id" : "portfolio_id"); // WP-C: per-subject shape that ends on the dataset's own figure
    if (metric === "DRAWDOWN") wpkDrawdownFromNav(entry); // WP-K
    entry.quality = copy(body.quality);
    entry.source_confidence = "VERIFIED";
    entry.provenance_refs = [digest(["FIXTURE_LAB_SYNTHETIC", profile, body.environment, identity, metric, window])];
    entry.calculation_revision = "FIXTURE_LAB:review-manager.v1";
    entry.policy_revision = "FIXTURE_LAB:NOT_PRODUCT_POLICY";
    return entry;
  });
  body.comparison = comparison(body.series);
  body.lineage.source_set_ref = digest(["FIXTURE_LAB_SYNTHETIC", profile, now]);
  body.lineage.revision = digest([body.workspace_id, body.environment, body.metric, body.selected_window, body.series]);
  // NAV and drawdown use exactly the same complete synthetic walk. PnL and
  // Return retain their published dataset bases: allocated capital is not the
  // capital statement NAV, so zero-flow returns must not replace those values.
  if (metric === "DRAWDOWN") {
    const navQuery = new URLSearchParams(search);
    navQuery.set("metric", "NAV");
    const nav = seriesAnswer(method, path, navQuery, profile);
    if (nav?.status === 200 && (nav.body as Draft).series.every((entry: Draft) => entry.state === "AVAILABLE" && toScaled(entry.points[0].value) > 0n && toScaled(entry.points.at(-1).value) > 0n)) {
      return { status: 200, body: buildPositiveManagerSeries({ lane: "FIXTURE_LAB", nav: nav.body, pointCount: target }).DRAWDOWN };
    }
  }
  if (metric === "NAV" && body.series.every((entry: Draft) => entry.state === "AVAILABLE" && toScaled(entry.points[0].value) > 0n && toScaled(entry.points.at(-1).value) > 0n)) {
    return { status: 200, body: buildPositiveManagerSeries({ lane: "FIXTURE_LAB", nav: body, pointCount: target }).NAV };
  }
  return { status: 200, body };
}

function metric(template: Draft, value: string | null, currency: string): Draft {
  const out = copy(template);
  out.value = value;
  out.currency = currency;
  out.unit = "MONEY";
  out.basis = "FIXTURE_LAB:synthetic-book";
  out.methodology_ref = value === null ? null : "FIXTURE_LAB:synthetic-sequence-v1";
  out.availability = value === null ? "UNAVAILABLE" : "AVAILABLE";
  out.reason_code = value === null ? "SOURCE_FACTS_NOT_PUBLISHED" : null;
  out.quality = { completeness: value === null ? "UNRESOLVED" : "COMPLETE", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC"] };
  out.source_confidence = "PROVISIONAL";
  out.provenance_refs = ["FIXTURE_LAB:SYNTHETIC_NOT_SOURCE_ACCEPTANCE"];
  out.policy_revision = "FIXTURE_LAB:NOT_PRODUCT_POLICY";
  return out;
}
const sum = (values: string[]): string => values.reduce(addDecimal, "0");
/* SIMULATED derived keys (README "Explicit populated/layout review"): bigint only, never a float, never across partitions. */
const SCALE = 18;
const toScaled = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const n = BigInt(whole + fraction.padEnd(SCALE, "0").slice(0, SCALE));
  return negative ? -n : n;
};
const trimmed = (value: bigint, places: number): string => decimal(value, places).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
/** A percent with 6 places, truncated toward zero: numerator * 100 / denominator. `null` when the denominator is not positive. */
const pct = (numerator: bigint, denominator: bigint): string | null => denominator <= 0n ? null : trimmed(numerator * 100n * 1_000_000n / denominator, 6);
/** Sum of squared shares, 6 places, in [0, 1]. `null` unless every allocation is known and the total is positive. */
const hhi = (allocations: (string | null)[]): string | null => {
  if (allocations.length === 0 || allocations.some((value) => value === null)) return null;
  const parts = allocations.map((value) => toScaled(value!));
  const total = parts.reduce((a, b) => a + b, 0n);
  if (total <= 0n || parts.some((part) => part < 0n)) return null;
  return trimmed(parts.reduce((a, b) => a + b * b, 0n) * 1_000_000n / (total * total), 6);
};
const seedOf = (...parts: unknown[]): number => parseInt(digest(parts).slice(7, 15), 16);
/** A deterministic negative percent between -2.00 and -19.99. */
const drawdownOf = (...parts: unknown[]): string => trimmed(-(200n + BigInt(seedOf(...parts) % 1800)), 2);
const plainMetric = (template: Draft, value: string | null, unit: string): Draft => {
  const out = metric(template, value, "X");
  out.currency = null;
  out.unit = unit;
  return out;
};
const pctMetric = (template: Draft, value: string | null): Draft => plainMetric(template, value, "PERCENT");
/** A present metric becomes a typed absence in its own unit. */
const nulled = (key: string, template: Draft, currency: string): Draft =>
  (key === "return_30d_pct" || key === "max_drawdown_pct") ? pctMetric(template, null)
    : (key === "score" || key.startsWith("qbts_")) ? qbtsMetric(template, null, "SCORE", "INSUFFICIENT_EVIDENCE") : metric(template, null, currency);

const NEW_ROW_KEYS = ["balance_total", "equity_30d_end_value", "return_30d_pct", "score"] as const;

// ===== WP-A begin (Alpha Fleet QBTS: qbtsMetric, addQbts; also touched: nulled, aggregate, enrichRow, rowsFor, datasetAnswer options push, balance_total basis)
/**
 * SIMULATED QBTS (FIXTURE_LAB, quality_bands_v1_1 shape). Per row, from a deterministic seed: raw q = 0.45 P + 0.30 R + 0.25 B with P, R, B in tenths
 * (integer arithmetic, exact to 3 places), the band looked up on the unrounded value, an evidence state (eligible / provisional / insufficient),
 * and variety on purpose: high, mid and low bands, a provisional score, a true zero, an insufficient-evidence typed absence. The closed row key
 * `score` carries q; P, R, B, band, evidence and the provisional flag live in the OPEN partition map (`qbts_p`, `qbts_r`, `qbts_b`, `qbts_band`,
 * `qbts_evidence`, `qbts_provisional`). A band code or an evidence word is not a decimal, so it is the `reason_code` of an AVAILABLE ordinal metric
 * (needs a contract field; recorded in ALPHA_FLEET_COMPLETION). The contribution w*q is NOT a Fleet column and has no band.
 */
const QBTS_BANDS = [
  { code: "weak", below: 40_000n }, { code: "neutral", below: 60_000n }, { code: "fair", below: 75_000n }, { code: "good", below: 90_000n }, { code: "very_good", below: 1_000_000n },
] as const;
function qbtsMetric(template: Draft, value: string | null, unit: string, reason: string | null = null, extra: { evidence?: string; reasonCode?: string } = {}): Draft {
  const out = plainMetric(template, value, unit);
  out.basis = "FIXTURE_LAB:qbts-comparable-basis";
  out.methodology_ref = value === null ? null : "FIXTURE_LAB:qbts_v1_1";
  out.policy_revision = "FIXTURE_LAB";
  out.calculation_revision = "FIXTURE_LAB:qbts-fixture.v1";
  out.window = null;
  if (value === null) out.reason_code = reason ?? "INSUFFICIENT_EVIDENCE";
  else if (extra.reasonCode) out.reason_code = extra.reasonCode;
  if (extra.evidence === "provisional") {
    out.quality = { completeness: "COMPLETE", freshness: "FRESH", reasons: ["PROVISIONAL_EVIDENCE", "FIXTURE_LAB_SYNTHETIC"] };
  } else if (extra.evidence === "eligible") {
    out.source_confidence = "VERIFIED";
    out.quality = { completeness: "COMPLETE", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC"] };
  } else if (value === null) {
    out.quality = { completeness: "UNRESOLVED", freshness: "FRESH", reasons: [out.reason_code] };
  }
  return out;
}
function addQbts(m: Draft, template: Draft, rowKey: string, components: boolean): void {
  const seed = seedOf(rowKey, "qbts");
  const bucket = seed % 10;
  if (bucket === 0) {
    // Insufficient evidence: no score, no components, no band; the reason is the same everywhere.
    if (!components) return;
    m.score = qbtsMetric(template, null, "SCORE", "INSUFFICIENT_EVIDENCE");
    for (const key of ["qbts_p", "qbts_r", "qbts_b"]) m[key] = qbtsMetric(template, null, "SCORE", "INSUFFICIENT_EVIDENCE");
    m.qbts_band = qbtsMetric(template, null, "BAND_ORDINAL", "INSUFFICIENT_EVIDENCE");
    m.qbts_evidence = qbtsMetric(template, "0", "EVIDENCE_STATE", null, { reasonCode: "insufficient" });
    m.qbts_provisional = qbtsMetric(template, "0", "FLAG");
    return;
  }
  const zero = bucket === 1;
  const tenths = (salt: string, low: number, span: number): bigint => BigInt(low + seedOf(rowKey, salt) % span);
  // Three profiles over the 0..100 range so every band is seen: weak/neutral, fair/good, good/very good.
  const profile = seed % 3;
  const [low, span] = profile === 0 ? [150, 450] : profile === 1 ? [450, 400] : [650, 340];
  const P = zero ? 0n : tenths("p", low, span), R = zero ? 0n : tenths("r", low, span), B = zero ? 0n : tenths("b", low, span);
  const thousandths = 45n * P + 30n * R + 25n * B;
  const band = QBTS_BANDS.find((entry) => thousandths < entry.below)!;
  const evidence = bucket === 2 || bucket === 3 ? "provisional" : "eligible";
  const q = trimmed(thousandths, 3) === "" ? "0" : trimmed(thousandths, 3);
  const text = (tenth: bigint): string => (tenth === 0n ? "0" : trimmed(tenth, 1));
  // The layout-stress profile serves no QBTS at all (its responses are near the size bound); the populated profile has all of it.
  if (!components) return;
  m.score = qbtsMetric(template, q, "SCORE", null, { evidence });
  m.qbts_p = qbtsMetric(template, text(P), "SCORE", null, { evidence });
  m.qbts_r = qbtsMetric(template, text(R), "SCORE", null, { evidence });
  m.qbts_b = qbtsMetric(template, text(B), "SCORE", null, { evidence });
  m.qbts_band = qbtsMetric(template, String(QBTS_BANDS.indexOf(band)), "BAND_ORDINAL", null, { evidence, reasonCode: band.code });
  m.qbts_evidence = qbtsMetric(template, evidence === "eligible" ? "2" : "1", "EVIDENCE_STATE", null, { evidence, reasonCode: evidence });
  m.qbts_provisional = qbtsMetric(template, evidence === "provisional" ? "1" : "0", "FLAG", null, { evidence });
}
// ===== WP-A end
/**
 * SIMULATED row keys, per economic partition, from that partition's own allocation (A), net PnL (N) and unrealized PnL (U):
 * balance_total = A + N, equity_30d_end_value = A + N + U, return_30d_pct = N * 100 / A. A missing input is a typed absence.
 */
function enrichRow(row: Draft, preset: WindowPreset, components = true): Draft {
  const template = row.metrics.net_pnl;
  for (const entry of row.economic_partitions) {
    const m = entry.metrics;
    const known = (key: string): string | null => m[key]?.availability === "AVAILABLE" ? m[key].value : null;
    const [A, N, U] = [known("allocation"), known("net_pnl"), known("unrealized_pnl")];
    const balance = A !== null && N !== null ? trimmed(toScaled(A) + toScaled(N), SCALE) : null;
    const equity = balance !== null && U !== null ? trimmed(toScaled(balance) + toScaled(U), SCALE) : null;
    const ret = A !== null && N !== null ? pct(toScaled(N), toScaled(A)) : null;
    m.balance_total = metric(template, balance, entry.partition.currency);
    // Guide 8.1: the default Account Balance basis is the internal account balance (never a native custody balance, never summed across shared sources).
    m.balance_total.basis = "FIXTURE_LAB:INTERNAL_ACCOUNT_BALANCE";
    m.equity_30d_end_value = metric(template, equity, entry.partition.currency);
    m.return_30d_pct = pctMetric(template, ret);
    // SIMULATED partition-level keys (open key names inside `economic_partitions[].metrics`): max drawdown, cost drag, forward days.
    // Cost drag = allocation * basis points * window days / 30 (fees 5, funding 2, slippage 1); slippage is a typed absence for
    // about 1 row in 4; forward days is 5..40; a true zero net PnL has a true zero drawdown.
    const cost = (bp: bigint): string | null => A === null ? null : trimmed(toScaled(A) * bp * BigInt(preset.days) / (10_000n * 30n), SCALE);
    m.max_drawdown_pct = pctMetric(template, A === null ? null : N !== null && toScaled(N) === 0n ? "0" : drawdownOf(row.row_key, "row"));
    m.cost_drag_fees = metric(template, cost(5n), entry.partition.currency);
    m.cost_drag_funding = metric(template, cost(2n), entry.partition.currency);
    m.cost_drag_slippage = metric(template, seedOf(row.row_key, "slippage") % 4 === 0 ? null : cost(1n), entry.partition.currency);
    m.forward_observation_days = plainMetric(template, A === null ? null : String(5 + seedOf(row.row_key, "forward") % 36), "DAYS");
    addQbts(m, template, row.row_key, components);
  }
  for (const key of NEW_ROW_KEYS) {
    if (key === "score" && !components) continue;
    // One partition: the headline IS that partition's figure. Several: the row headline names no currency (mixed), as net_pnl does.
    row.metrics[key] = row.economic_partitions.length === 1 ? copy(row.economic_partitions[0].metrics[key])
      : key === "score" ? qbtsMetric(template, null, "SCORE", "MIXED_ECONOMIC_DOMAINS") : copy(template);
  }
  return row;
}

function aggregate(rows: Draft[]): Draft[] {
  const byPartition = new Map<string, { item: Draft; members: Draft[] }>();
  for (const row of rows) for (const item of row.economic_partitions) {
    const key = JSON.stringify(item.partition);
    const found = byPartition.get(key);
    if (!found) { byPartition.set(key, { item: copy(item), members: [item.metrics] }); continue; }
    found.members.push(item.metrics);
    for (const name of Object.keys(item.metrics)) {
      if (name === "return_30d_pct" || name === "max_drawdown_pct" || name === "forward_observation_days" || name === "score" || name.startsWith("qbts_")) continue;
      const a = found.item.metrics[name];
      const b = item.metrics[name];
      found.item.metrics[name] = metric(a, a.value === null || b.value === null ? null : addDecimal(a.value, b.value), item.partition.currency);
    }
  }
  return [...byPartition.entries()].map(([key, { item, members }]) => {
    const currency = item.partition.currency;
    const template = item.metrics.net_pnl;
    const total = (name: string): string | null => item.metrics[name]?.availability === "AVAILABLE" ? item.metrics[name].value : null;
    const [A, N, B] = [total("allocation"), total("net_pnl"), total("balance_total")];
    // SIMULATED group keys, inside this ONE partition only: NAV, return on allocation, drawdown, concentration of allocation.
    item.metrics.current_nav = metric(template, B, currency);
    item.metrics.return_30d_pct = pctMetric(template, A !== null && N !== null ? pct(toScaled(N), toScaled(A)) : null);
    // The seed carries the group's own rows: with the partition alone every portfolio of one currency drew the same value (all absent).
    const salt = rows.map((row) => row.row_key).join("|");
    item.metrics.max_drawdown_pct = pctMetric(template, seedOf(key, "group-drawdown", salt) % 5 === 0 ? null : drawdownOf(key, members.length, salt));
    item.metrics.concentration_hhi = pctMetric(template, hhi(members.map((metrics) => metrics.allocation?.availability === "AVAILABLE" ? metrics.allocation.value : null)));
    item.metrics.concentration_hhi.unit = "RATIO";
    // Row-only keys (days observed, cost drag) are not portfolio totals here and would only grow the response.
    // A score is per alpha version and is never added up: the group carries none.
    for (const rowOnly of ["forward_observation_days", "cost_drag_fees", "cost_drag_funding", "cost_drag_slippage", "score", "qbts_p", "qbts_r", "qbts_b", "qbts_band", "qbts_evidence", "qbts_provisional"]) delete item.metrics[rowOnly];
    return item;
  });
}

/* SIMULATED window presets. The base data is the 30D answer; 7D and 90D scale net PnL (and so balance, equity, return) by an exact
 * fraction, with bigint math. `ALL` is a typed gap (ALL_HISTORY_WINDOW_NOT_PUBLISHED), never a 400 and never a number. */
interface WindowPreset { days: number; num: bigint; den: bigint }
const WINDOW_PRESETS: Record<"7D" | "30D" | "90D", WindowPreset> = {
  "7D": { days: 7, num: 1n, den: 4n }, "30D": { days: 30, num: 1n, den: 1n }, "90D": { days: 90, num: 5n, den: 2n },
};
const WINDOWED_KEYS = ["net_pnl", "return_30d_pct", "max_drawdown_pct", "equity_30d_end_value", "cost_drag_fees", "cost_drag_funding", "cost_drag_slippage"];
const ALL_GAP = "ALL_HISTORY_WINDOW_NOT_PUBLISHED";
const scaleBy = (value: string, preset: WindowPreset): string => trimmed(toScaled(value) * preset.num / preset.den, SCALE);

/** Net PnL of a row for the preset, before the derived keys are computed from it. A true zero stays "0"; an absence stays one. */
function windowedRow(row: Draft, preset: WindowPreset): Draft {
  if (preset.num === preset.den) return row;
  for (const entry of row.economic_partitions) {
    const m = entry.metrics.net_pnl;
    if (m?.availability === "AVAILABLE" && toScaled(m.value) !== 0n) m.value = scaleBy(m.value, preset);
  }
  if (row.economic_partitions.length === 1) row.metrics.net_pnl = copy(row.economic_partitions[0].metrics.net_pnl);
  return row;
}

/** Stamps the selected window on the body: every AVAILABLE windowed metric carries it; for `ALL` they become the window gap. */
function applyWindow(body: Draft, name: "7D" | "30D" | "90D" | "ALL", preset: WindowPreset): void {
  const now = fixtureNowMs();
  const resolved = { from_ms: now - preset.days * 86_400_000, to_ms: now };
  const all = name === "ALL";
  body.selected_window = all
    ? { requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: ALL_GAP }
    : { requested: name, resolved, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
  if (all) {
    const slot = { value: null, status: "window_not_published", reason_code: ALL_GAP };
    body.scores = { ...body.scores, raw: { ...slot }, composition: { ...slot }, direct_nav: { ...slot }, reason_code: ALL_GAP };
  }
  const days: Record<string, number> = { "7D": 7, "30D": 30, "90D": 90 };
  for (const entry of body.query_options.window.presets as Draft[]) {
    if (entry.value !== "ALL") Object.assign(entry, { resolved: { from_ms: now - days[entry.value]! * 86_400_000, to_ms: now }, data_state: "METRIC_SPECIFIC", reason_code: null });
  }
  const stamp = (bag: Draft): void => {
    for (const key of WINDOWED_KEYS) {
      const m = bag[key];
      if (!m || m.availability !== "AVAILABLE") continue;
      if (all) {
        bag[key] = nulled(key, m, m.currency ?? "X");
        bag[key].reason_code = ALL_GAP;
        bag[key].window = null;
      } else {
        if (key === "max_drawdown_pct" && toScaled(m.value) !== 0n) m.value = scaleBy(m.value, preset);
        m.window = copy(resolved);
      }
    }
  };
  const visit = (list: Draft[]): void => { for (const entry of list) stamp(entry.metrics); };
  for (const row of body.items) { stamp(row.metrics); visit(row.economic_partitions); }
  visit(body.capital_statements);
  for (const group of body.groups) visit(group.economic_partitions);
}

/** Separate synthetic capital receipts, NOT aliases for the table's allocation/PnL.
 * Like the real statement projection, scope and selected stages are applied first,
 * table filters/page limits never change the statement, and currencies stay apart.
 * The fixture's account identity is its economic ownership identity; repeated
 * deployments of that account do not invent another NAV/budget snapshot.
 */
function capitalStatements(rows: Draft[]): Draft[] {
  const sources = new Map([...SUITE_ALPHAS, ...WPC_ALPHAS, ...scaled().alphas].flatMap(a => a.deployments.map(d => [d.id, d] as const)));
  const partitions = new Map<string, { partition: Draft; accounts: Set<string>; deployments: Set<string>; template: Draft; pnl: (string | null)[] }>();
  for (const row of rows) for (const entry of row.economic_partitions) {
    const key = JSON.stringify(entry.partition);
    const found = partitions.get(key) ?? { partition: entry.partition, accounts: new Set<string>(), deployments: new Set<string>(), template: row.metrics.net_pnl, pnl: [] };
    // This partition's own rows only; a row's figure is never moved to another partition.
    found.pnl.push(entry.metrics.net_pnl?.availability === "AVAILABLE" ? entry.metrics.net_pnl.value : null);
    for (const child of row.children) { found.accounts.add(child.account_id); found.deployments.add(child.deployment_id); }
    partitions.set(key, found);
  }
  return [...partitions.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry], index) => {
    const accounts = [...entry.accounts].sort();
    const members = [...entry.deployments].map(id => sources.get(id));
    const known = members.every(d => d !== undefined && d.currency === entry.partition.currency);
    const opening = known ? sum(members.map(d => d!.allocation)) : null;
    const currentPnl = known ? sum(members.map(d => d!.realized)) : null;
    // Explicit synthetic current receipt/valuation amounts, independent of the
    // performance window. Adverse books belong to explicit negative scenarios.
    const values: Record<string, string | null> = {
      initial_funds: opening,
      added_funds: "0",
      returned_capital: "0",
      current_nav: opening !== null && currentPnl !== null ? addDecimal(opening, currentPnl) : null,
      current_budget: opening,
      pending_amount: "0",
    };
    const money = Object.fromEntries(Object.entries(values).map(([kind, value]) => {
      const out = metric(entry.template, value, entry.partition.currency);
      // Current/cumulative capital receipts have no performance-window claim.
      out.window = null;
      out.denominator = null;
      out.methodology_ref = value === null ? null : "FIXTURE_LAB:synthetic-capital-receipts-v1";
      out.provenance_refs = [digest(["FIXTURE_LAB_SYNTHETIC_CAPITAL", key, accounts, kind])];
      out.calculation_revision = "FIXTURE_LAB:capital-review.v1";
      return [kind, out];
    }));
    // SIMULATED performance keys of the same partition: net_pnl = sum of THIS partition's rows; return = net_pnl * 100 / initial_funds;
    // drawdown is a deterministic negative percent (an exact "0" for the first partition, so a true zero stays testable).
    const pnl = entry.pnl.every((value) => value !== null) ? sum(entry.pnl as string[]) : null;
    const perf = (kind: string, built: Draft): Draft => {
      built.window = null;
      built.denominator = null;
      built.provenance_refs = [digest(["FIXTURE_LAB_SYNTHETIC_CAPITAL", key, accounts, kind])];
      built.calculation_revision = "FIXTURE_LAB:capital-review.v1";
      built.methodology_ref = built.availability === "AVAILABLE" ? "FIXTURE_LAB:synthetic-capital-performance-v1" : null;
      return built;
    };
    const ret = pnl === null || opening === null ? null : pct(toScaled(pnl), toScaled(opening));
    const returnMetric = perf("return_30d_pct", pctMetric(entry.template, ret));
    returnMetric.denominator = returnMetric.availability === "AVAILABLE" ? values.initial_funds : null;
    const extra = {
      net_pnl: perf("net_pnl", metric(entry.template, pnl, entry.partition.currency)),
      return_30d_pct: returnMetric,
      max_drawdown_pct: perf("max_drawdown_pct", pctMetric(entry.template, index === 0 ? "0" : drawdownOf(key, "capital"))),
    };
    return { partition: copy(entry.partition), metrics: { ...money, ...extra } };
  });
}

/** SIMULATED suite universe for the small scale: the ids the Playwright doubles use (alpha_a..d, alpha_btc_trend; Main, Satellite, Core). */
type Env = "paper" | "sandbox" | "live";
const suiteDeployment = (id: string, alphaId: string, stage: DeploymentSpec["stage"], environment: Env, portfolio: [string, string], allocation: string, realized: string, unrealized: string, state: "ACTIVE" | "HALTED" = "ACTIVE"): DeploymentSpec => ({
  id, alphaId, stage, environment, venue: "BINANCE", accountId: `acct_${id}`, portfolioId: portfolio[0], portfolioName: portfolio[1], currency: "USDT",
  allocation, exposure: "0", realized, unrealized, health: "READY", state, active: state === "ACTIVE", updatedAt: "2026-10-22T11:00:00Z",
});
const MAIN: [string, string] = ["pf_main", "Main"];
const SAT: [string, string] = ["pf_sat", "Satellite"];
const CORE: [string, string] = ["pf_core", "Core"];
const suiteAlpha = (id: string, label: string, version: string, owner: string | null, health: AlphaSpec["health"], deployments: DeploymentSpec[]): AlphaSpec =>
  ({ id, label, version, owner, stages: [...new Set(deployments.map((entry) => entry.stage))], health, attention: [], deployments, updatedAt: "2026-10-22T11:00:00Z" });
const SUITE_ALPHAS: AlphaSpec[] = [
  suiteAlpha("alpha_a", "Carry A", "1.0", "Bobby-001", "READY", [suiteDeployment("dep_a1", "alpha_a", "PAPER", "paper", MAIN, "25000", "484.31", "12.5")]),
  suiteAlpha("alpha_b", "Basis B", "1.4", "Lan-002", "READY", [
    suiteDeployment("dep_b1", "alpha_b", "LIVE", "live", MAIN, "120000", "2150.75", "310.2"),
    suiteDeployment("dep_b2", "alpha_b", "LIVE", "live", SAT, "60000", "-98.4", "21.05"),
    suiteDeployment("dep_b3", "alpha_b", "CANARY", "live", MAIN, "30000", "410.1", "-5.5"),
  ]),
  suiteAlpha("alpha_c", "Momentum C", "2.0", "Minh-003", "ATTENTION", [suiteDeployment("dep_c1", "alpha_c", "CANARY", "live", SAT, "15000", "0", "0", "HALTED")]),
  suiteAlpha("alpha_d", "Grid D", "0.9", "Bobby-001", "READY", [
    suiteDeployment("dep_d1", "alpha_d", "SANDBOX", "sandbox", SAT, "8000", "61.2", "3"),
    suiteDeployment("dep_d2", "alpha_d", "PAPER", "paper", SAT, "10000", "-30.75", "8.4"),
  ]),
  suiteAlpha("alpha_btc_trend", "BTC Trend", "3.0", "Lan-002", "READY", [
    suiteDeployment("dep_live_01", "alpha_btc_trend", "LIVE", "live", CORE, "80000", "1120.8", "55.4"),
    suiteDeployment("dep_paper_01", "alpha_btc_trend", "PAPER", "paper", CORE, "50000.5", "-125.25", "40.1"),
  ]),
];

function rowsFor(environment: string, template: Draft, preset: WindowPreset, components = true, only?: AlphaSpec[]): Draft[] {
  const universe = scaled();
  // The small universe has no generated alphas: the review lane then answers with the e2e suite's own alpha ids and portfolio ids
  // (SUITE_ALPHAS), one single-book partition per row, so every screen shows real simulated figures instead of the canonical test row.
  const alphas = only ?? (universe.alphas.length === 0 ? SUITE_ALPHAS : universe.alphas);
  const rows: Draft[] = [];
  const make = (alpha: AlphaSpec, deployments: DeploymentSpec[]): void => {
    const first = deployments[0]!;
    const row = copy(template.items[0]);
    row.alpha_id = alpha.id;
    row.alpha_version_id = alpha.version;
    row.portfolio_id = first.portfolioId;
    row.row_key = JSON.stringify([row.alpha_id, row.alpha_version_id, row.portfolio_id]);
    row.name = `${alpha.label} · synthetic review`;
    row.owner_user_id = alpha.owner;
    row.lifecycle = deployments.some((entry) => entry.active) ? "ACTIVE" : "HALTED";
    row.venue = first.venue;
    row.health = alpha.health;
    row.source_state = "FRESH";
    row.stage_presence = [...new Set(deployments.map((entry) => entry.stage))].sort();
    row.children = deployments.map((entry) => ({ alpha_id: alpha.id, alpha_version_id: alpha.version, portfolio_id: entry.portfolioId,
      deployment_id: entry.id, account_id: entry.accountId, stage: entry.stage, binding_ref: universe.bindings.find((binding) => binding.accountId === entry.accountId)?.bindingId ?? null }));
    row.current_stage = row.stage_presence.length === 1 ? row.stage_presence[0] : null;
    row.entered_at_ms = null;
    row.days_in_stage = null;
    row.stage_lifecycle_reasons = { current_stage: row.current_stage === null ? "MULTIPLE_ACTIVE_STAGES" : null,
      entered_at_ms: "STAGE_ENTRY_TIME_NOT_PUBLISHED", days_in_stage: "STAGE_ENTRY_TIME_NOT_PUBLISHED" };
    const sourceMetric = template.items[0].metrics.net_pnl;
    // Preserve the shared deployment facts; row position must not invent a zero
    // or missing value that differs from the linked detail's source.
    row.metrics = { allocation: metric(sourceMetric, sum(deployments.map((entry) => entry.allocation)), first.currency),
      net_pnl: metric(sourceMetric, sum(deployments.map((entry) => entry.realized)), first.currency),
      unrealized_pnl: metric(sourceMetric, sum(deployments.map((entry) => entry.unrealized)), first.currency) };
    row.economic_partitions = [{ partition: { economic_domain: domain(environment), currency: first.currency, basis: "FIXTURE_LAB:synthetic-book",
      native_profile_ref: `FIXTURE_LAB:${environment}:synthetic`, domain_proof_ref: "FIXTURE_LAB:NOT_PRODUCT_AUTHORITY" }, metrics: copy(row.metrics) }];
    rows.push(row);
  };
  for (const alpha of alphas) {
    const books = new Map<string, DeploymentSpec[]>();
    for (const deployment of alpha.deployments.filter((entry) => entry.environment === environment)) {
      const key = deployment.portfolioId;
      books.set(key, [...(books.get(key) ?? []), deployment]);
    }
    for (const deployments of books.values()) make(alpha, deployments);
  }
  return rows.map((row) => enrichRow(windowedRow(row, preset), preset, components));
}

/**
 * FE-CAT-3 (FIXTURE_LAB, populated profile only): `environment=ALL` on the Fleet. Each environment is answered by the SAME single-environment
 * path above, then merged: rows relabelled with their environment, partitions side by side, per-environment coverage, no total. Simulated
 * states: Paper is degraded (its own quality), Sandbox is a typed absence (NOT_CONFIGURED), a stage filter that excludes an environment
 * leaves it a counted zero. The layout-stress profile does not offer ALL (400), so the Portal keeps the fleet read there.
 */
// ===== WP-A begin (Fleet numeric sort and range filters: exact decimals, null last in both directions, money only in ONE pinned partition)
const FLEET_NUMERIC = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value", "return_30d_pct", "score"];
const FLEET_MONEY = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"];
const PARTITION_FIELDS = ["economic_domain", "currency", "basis", "native_profile_ref", "domain_proof_ref"];
const DECIMAL_TEXT = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
interface FleetPlan { pin: Draft | null; textFilters: Draft[]; textSort: Draft[] }
/** Splits a Fleet query into what the shared L0 double can validate (text fields) and what this lane evaluates itself (numeric fields). */
function fleetPlan(search: URLSearchParams): { plan: FleetPlan } | { refusal: ReviewManagerResponse } {
  const bad = (message: string) => ({ refusal: problem(400, "EXECUTION_READ_QUERY_INVALID", message) });
  let pin: Draft | null = null;
  if (search.has("economic_partition")) {
    try { pin = JSON.parse(search.get("economic_partition")!); } catch { return bad("economic_partition is JSON."); }
    if (pin === null || typeof pin !== "object" || Object.keys(pin).sort().join(",") !== [...PARTITION_FIELDS].sort().join(",") || PARTITION_FIELDS.some((key) => typeof pin[key] !== "string")) return bad("economic_partition names all five partition fields.");
  }
  let filters: Draft[]; let sort: Draft[];
  try { filters = JSON.parse(search.get("filters") ?? "[]"); sort = JSON.parse(search.get("sort") ?? "[]"); } catch { return bad("filters and sort are JSON."); }
  if (!Array.isArray(filters) || !Array.isArray(sort)) return bad("filters and sort are arrays.");
  for (const filter of filters) {
    if (!FLEET_NUMERIC.includes(filter?.field)) continue;
    const operands = filter.op === "IN" ? filter.values : filter.op === "IS_NULL" ? [] : [filter.value];
    if (!["EQ", "GTE", "LTE", "IN", "IS_NULL"].includes(filter.op) || !Array.isArray(operands) || operands.some((value: unknown) => typeof value !== "string" || !DECIMAL_TEXT.test(value))) return bad("A numeric filter takes exact decimal operands.");
    if (FLEET_MONEY.includes(filter.field) && filter.op !== "IS_NULL" && pin === null) return bad("A money filter needs economic_partition.");
  }
  for (const key of sort) if (FLEET_MONEY.includes(key?.field) && pin === null) return bad("A money sort needs economic_partition.");
  return { plan: { pin, textFilters: filters.filter((filter) => !FLEET_NUMERIC.includes(filter?.field)), textSort: sort.filter((key) => !FLEET_NUMERIC.includes(key?.field)) } };
}
/** The exact published decimal of a numeric field of a row, or `null` (a typed absence or no figure in the pinned partition). */
function numericOf(row: Draft, field: string, pin: Draft | null): string | null {
  const figure = (m: Draft | undefined): string | null => (m !== undefined && m.availability === "AVAILABLE" ? m.value : null);
  if (FLEET_MONEY.includes(field)) {
    if (pin === null) return null;
    const entry = (row.economic_partitions as Draft[]).find((candidate) => PARTITION_FIELDS.every((key) => candidate.partition[key] === pin[key]));
    return entry === undefined ? null : figure(entry.metrics[field]);
  }
  return figure(row.metrics[field]);
}
const compareExact = (a: string, b: string): number => { const x = toScaled(a), y = toScaled(b); return x < y ? -1 : x > y ? 1 : 0; };
/** One filter of a row: the numeric ones by exact comparison, the text ones as before. */
function fleetFilterHolds(row: Draft, filter: Draft, pin: Draft | null, textOf: (row: Draft, field: string) => string | null): boolean {
  if (FLEET_NUMERIC.includes(filter.field)) {
    const value = numericOf(row, filter.field, pin);
    if (filter.op === "IS_NULL") return value === null;
    if (value === null) return false;
    if (filter.op === "IN") return (filter.values as string[]).some((candidate) => compareExact(value, candidate) === 0);
    const c = compareExact(value, filter.value);
    return filter.op === "EQ" ? c === 0 : filter.op === "GTE" ? c >= 0 : c <= 0;
  }
  return filter.op === "EQ" ? textOf(row, filter.field) === filter.value : filter.op === "IN" ? filter.values.includes(textOf(row, filter.field)) : textOf(row, filter.field) === null;
}
/** The row order: exact for numbers, a null always last (both directions), the immutable row key last. */
function fleetOrder(sort: Draft[], pin: Draft | null, textOf: (row: Draft, field: string) => string | null) {
  return (a: Draft, b: Draft): number => {
    for (const key of sort) {
      const numeric = FLEET_NUMERIC.includes(key.field);
      const x = numeric ? numericOf(a, key.field, pin) : textOf(a, key.field);
      const y = numeric ? numericOf(b, key.field, pin) : textOf(b, key.field);
      if (x === y) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      const c = numeric ? compareExact(x, y) : (x < y ? -1 : 1);
      if (c !== 0) return c * (key.direction === "asc" ? 1 : -1);
    }
    return a.row_key < b.row_key ? -1 : a.row_key > b.row_key ? 1 : 0;
  };
}
// ===== WP-A end

const ALL_ORDER = ["paper", "sandbox", "live"] as const;
function allAnswer(path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse {
  if (profile !== "populated" || path !== "/manager/fleet" || search.has("window") || search.has("before")) return problem(400, "EXECUTION_READ_QUERY_INVALID", "ALL is the Fleet read of the populated review profile, without a window.");
  const subs = ALL_ORDER.map((env) => {
    if (env === "sandbox") return { env, body: null as Draft | null, reason: "NOT_CONFIGURED" as string | null };
    const params = new URLSearchParams(search);
    params.set("environment", env); params.set("limit", "200"); params.delete("after"); params.delete("group_by");
    const stages = params.get("stage_filter")?.split(",").filter((stage) => STAGES[env]!.includes(stage));
    if (params.has("stage_filter")) { if (stages!.length === 0) params.delete("stage_filter"); else params.set("stage_filter", stages!.join(",")); }
    const excluded = search.has("stage_filter") && stages!.length === 0;
    const answer = excluded ? null : datasetAnswer("GET", path, params, profile);
    if (!excluded && (answer === null || answer.status !== 200)) return { env, body: null, reason: "SOURCE_UNAVAILABLE" };
    return { env, body: excluded ? { items: [], groups: [], capital_statements: [], quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] } } as Draft : copy(answer!.body) as Draft, reason: null };
  });
  const first = subs.find((entry) => entry.body !== null && entry.body.snapshot_id !== undefined)?.body;
  if (!first) return problem(503, "EXECUTION_READ_AUTHORITY_UNAVAILABLE", "No environment answered.");
  const body = copy(first) as Draft;
  const merged: Draft[] = [];
  for (const entry of subs) for (const row of entry.body?.items ?? []) {
    row.environment = entry.env;
    row.row_key = JSON.stringify([entry.env, row.alpha_id, row.alpha_version_id, row.portfolio_id]);
    merged.push(row);
  }
  const sort = JSON.parse(search.get("sort") ?? "[]") as Draft[];
  const textOf = (row: Draft, field: string): string | null => field === "stage_presence" ? row.stage_presence.join(",") : typeof row[field] === "string" ? row[field] : null;
  const planned = fleetPlan(search);
  merged.sort(fleetOrder(sort, "plan" in planned ? planned.plan.pin : null, textOf));
  const groups = search.has("group_by") ? search.get("group_by")!.split(",") : [];
  const grouped = new Map<string, { key: Draft[]; rows: Draft[] }>();
  for (const row of merged) if (groups.length) {
    const key = groups.map((field) => ({ field, value: textOf(row, field) }));
    const group = grouped.get(JSON.stringify(key)) ?? { key, rows: [] };
    group.rows.push(row); grouped.set(JSON.stringify(key), group);
  }
  body.groups = [...grouped.values()].map((group) => ({ key: group.key, unique_row_count: group.rows.length, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
    economic_partitions: ALL_ORDER.flatMap((env) => aggregate(group.rows.filter((row) => row.environment === env))) }));
  body.capital_statements = subs.flatMap((entry) => entry.body?.capital_statements ?? []);
  const limit = Number(search.get("limit") ?? 100);
  const bound = digest([profile, path, [...search.entries()].filter(([key]) => !["after", "before", "limit"].includes(key)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]);
  const snapshot = digest(["FIXTURE_LAB_SYNTHETIC", profile, "ALL", fixtureNowMs(), merged]);
  let offset = 0;
  const cursorText = search.get("after");
  if (cursorText !== null) {
    let cursor: Draft;
    try { cursor = JSON.parse(Buffer.from(cursorText, "base64url").toString("utf8")); } catch { return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor was not issued by this review profile."); }
    if (!cursor || typeof cursor !== "object" || Object.keys(cursor).sort().join(",") !== "b,o,s" || !Number.isSafeInteger(cursor.o) || cursor.o < 0) return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor shape is invalid.");
    if (cursor.b !== bound || cursor.s !== snapshot) return problem(409, "MANAGER_CURSOR_CHANGED", "The cursor belongs to another query, profile or snapshot.");
    offset = cursor.o;
    if (offset >= merged.length) return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor is outside this result.");
  }
  const encode = (at: number): string => Buffer.from(JSON.stringify({ o: at, b: bound, s: snapshot })).toString("base64url");
  body.items = merged.slice(offset, offset + limit);
  body.page = { limit, returned_count: body.items.length, authorized_filtered_count: merged.length,
    next_cursor: offset + limit < merged.length ? encode(offset + limit) : null, previous_cursor: offset > 0 ? encode(Math.max(0, offset - limit)) : null };
  body.environment = "ALL";
  body.selected_window = null;
  body.environment_coverage = subs.map((entry) => {
    if (entry.body === null) return { environment: entry.env, availability: "UNAVAILABLE", reason_code: entry.reason, snapshot_id: null, as_of_ms: null, recorded_through_ms: null, facts_through_ms: null, quality: null, authorized_filtered_count: null, returned_count: null };
    const own = merged.filter((row) => row.environment === entry.env).length;
    const degraded = entry.env === "paper" ? { completeness: "PARTIAL", freshness: "STALE", reasons: ["FIXTURE_LAB_SIMULATED_SOURCE_LAG"] } : { completeness: "COMPLETE", freshness: "FRESH", reasons: [] };
    return { environment: entry.env, availability: "INCLUDED", reason_code: null, snapshot_id: digest([snapshot, entry.env]), as_of_ms: body.as_of_ms, recorded_through_ms: body.recorded_through_ms,
      facts_through_ms: body.facts_through_ms, quality: degraded, authorized_filtered_count: own, returned_count: body.items.filter((row: Draft) => row.environment === entry.env).length };
  });
  body.quality = { completeness: "PARTIAL", freshness: "STALE", reasons: ["paper:FIXTURE_LAB_SIMULATED_SOURCE_LAG", "sandbox:ENVIRONMENT_UNAVAILABLE:NOT_CONFIGURED"] };
  body.snapshot_id = snapshot;
  body.lineage.source_set_ref = digest(["FIXTURE_LAB_SYNTHETIC", profile, "ALL", fixtureNowMs()]);
  body.lineage.revision = snapshot;
  body.query_options.sort_fields = body.query_options.sort_fields.slice();
  return { status: 200, body };
}

/* SIMULATED scores (FIXTURE_LAB, 2026-10-23; register section 2c). Open metric keys in `economic_partitions[].metrics` of a GROUP only:
 *   portfolio_score (+ _p, _r, _b, _evidence) on the groups by portfolio_id, and `score` (the raw alpha q_i) on the groups by alpha_id.
 * Exact decimals, bigint only: score = (45*P + 30*R + 25*B) / 100 with P, R, B in hundredths, so the value is exact at four places and
 * no float, no rounding and no client arithmetic is involved. The band is NOT published (the screen maps the published value to the
 * spec's band edges). One case per portfolio, stable across windows and surfaces: a high (very good), a good, a mid, a low, a provisional, an
 * "insufficient evidence" typed absence and a true zero. ALL is the window gap, as for the scores block. No schema is widened. */
type ScoreCase = "high" | "good" | "mid" | "low" | "provisional" | "insufficient" | "zero";
const SCORE_CASES: readonly ScoreCase[] = ["high", "good", "mid", "low", "provisional", "insufficient", "zero"];
const SCORE_CASE_OF: Record<string, ScoreCase> = {
  pf_main: "high", pf_sat: "good", pf_core: "low", pf_TEST_ONLY_core: "provisional", pf_TEST_ONLY_satellite: "insufficient", pf_TEST_ONLY_canary: "zero",
};
const SCORE_RANGE: Record<ScoreCase, [bigint, bigint]> = {
  high: [9100n, 9800n], good: [7600n, 8400n], mid: [4200n, 5800n], low: [900n, 3200n], provisional: [6200n, 7300n], insufficient: [0n, 0n], zero: [0n, 0n],
};
const SCORE_EVIDENCE: Record<ScoreCase, string> = { high: "0.9712", good: "0.9420", mid: "0.8834", low: "0.8120", provisional: "0.6405", insufficient: "0.1830", zero: "0.9301" };
const SCORE_POLICY = "FIXTURE_LAB";
const SCORE_METHOD = "FIXTURE_LAB:portfolio-score-direct-nav-v1";
const scoreCaseOf = (id: string, environment: string): ScoreCase => SCORE_CASE_OF[id] ?? SCORE_CASES[seedOf(id, environment, "score-case") % SCORE_CASES.length]!;
const scoreMetric = (template: Draft, value: string | null, unit: string, kind: ScoreCase, window: Draft | null, absentReason: string): Draft => {
  const out = plainMetric(template, value, unit);
  out.window = window === null ? null : copy(window);
  out.methodology_ref = value === null ? null : SCORE_METHOD;
  out.policy_revision = SCORE_POLICY;
  out.calculation_revision = "FIXTURE_LAB:score-review.v1";
  out.source_confidence = kind === "provisional" ? "PROVISIONAL" : "VERIFIED";
  out.reason_code = value === null ? absentReason : null;
  out.quality = { completeness: value === null || kind === "provisional" ? "PARTIAL" : "COMPLETE", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC", ...(kind === "provisional" ? ["SAMPLE_BELOW_MATURITY"] : [])] };
  out.provenance_refs = ["FIXTURE_LAB:SYNTHETIC_SCORE_NOT_SOURCE_ACCEPTANCE"];
  return out;
};
const scorePart = (id: string, partition: Draft, windowName: string, part: string, kind: ScoreCase): bigint => {
  const [lo, hi] = SCORE_RANGE[kind];
  return hi === 0n ? 0n : lo + BigInt(seedOf(id, partition.economic_domain, windowName, part) % Number(hi - lo + 1n));
};
/** The five portfolio score keys of one partition entry (a group by portfolio_id). */
function portfolioScoreMetrics(template: Draft, id: string, partition: Draft, windowName: string, window: Draft | null): Record<string, Draft> {
  const kind = scoreCaseOf(id, partition.economic_domain);
  const gap = windowName === "ALL";
  const reason = gap ? ALL_GAP : "INSUFFICIENT_EVIDENCE";
  const [P, R, B] = ["p", "r", "b"].map((part) => scorePart(id, partition, windowName, part, kind)) as [bigint, bigint, bigint];
  const absent = gap || kind === "insufficient";
  const hundredths = (value: bigint): string | null => (absent ? null : trimmed(value, 2));
  return {
    portfolio_score: scoreMetric(template, absent ? null : trimmed(45n * P + 30n * R + 25n * B, 4), "SCORE", kind, window, reason),
    portfolio_score_p: scoreMetric(template, hundredths(P), "SCORE", kind, window, reason),
    portfolio_score_r: scoreMetric(template, hundredths(R), "SCORE", kind, window, reason),
    portfolio_score_b: scoreMetric(template, hundredths(B), "SCORE", kind, window, reason),
    portfolio_score_evidence: scoreMetric(template, gap ? null : SCORE_EVIDENCE[kind], "RATIO", kind, window, reason),
  };
}
/** The raw alpha score q_i under the key `score` of each group by alpha_id: same rule, never summed across alphas. */
function alphaScoreMetric(template: Draft, id: string, partition: Draft, windowName: string, window: Draft | null): Draft {
  const kind = scoreCaseOf(id, partition.economic_domain);
  const gap = windowName === "ALL";
  const absent = gap || kind === "insufficient";
  const [P, R, B] = ["p", "r", "b"].map((part) => scorePart(id, partition, windowName, part, kind)) as [bigint, bigint, bigint];
  return scoreMetric(template, absent ? null : trimmed(45n * P + 30n * R + 25n * B, 4), "SCORE", kind, window, gap ? ALL_GAP : "INSUFFICIENT_EVIDENCE");
}
/** Adds the score keys to the groups of the answer (after `groups` and the window are known). */
function addGroupScores(body: Draft, groupFields: string[], windowName: string | null): void {
  if (groupFields.length !== 1 || (groupFields[0] !== "portfolio_id" && groupFields[0] !== "alpha_id")) return;
  const window = body.selected_window?.resolved ?? null;
  const name = windowName ?? "30D";
  for (const group of body.groups) {
    const id = group.key[0].value as string | null;
    if (id === null) continue;
    for (const entry of group.economic_partitions) {
      if (groupFields[0] === "portfolio_id") Object.assign(entry.metrics, portfolioScoreMetrics(entry.metrics.net_pnl, id, entry.partition, name, window));
      else entry.metrics.score = alphaScoreMetric(entry.metrics.net_pnl, id, entry.partition, name, window);
    }
  }
}

// ===== WP-F1 begin (Overview / Portfolio 360 capital statements and allocation shares; register 2f1; one call line in datasetAnswer)
/* SIMULATED capital-statement keys (FIXTURE_LAB, 2026-10-23; register 2f1). Open metric keys in `capital_statements[].metrics` of ONE partition,
 * derived from the SAME partition's published statement values (like every capital receipt of this fixture, they are separate synthetic
 * receipts and NOT aliases of the table's allocation column):
 *   allocation         = current_budget * P / 100 truncated to 2 places, P = 55 + (seed of the partition mod 36), so 55 to 90 percent of the budget
 *   net_external_flows = initial_funds + added_funds - returned_capital (exact)
 *   headroom           = current_budget - allocation (never negative by construction: a budget is a limit, not cash)
 *   recalling          = current_budget * R / 100 truncated to 2 places, R = 1 + (seed mod 4); an exact "0" in one partition of three
 * and, on the groups by alpha_id only, `allocation_share_pct` = that group's allocation * 100 / the sum of the allocations of the groups
 * in the SAME partition (6 places, truncated; absent when the total is not positive). Bigint only; never across partitions or currencies;
 * windows do not apply (current facts, window null). No schema is widened: both maps are open. */
function wpF1Money(template: Draft, value: string | null, currency: string, kind: string): Draft {
  const out = metric(template, value, currency);
  out.window = null;
  out.denominator = null;
  out.methodology_ref = value === null ? null : "FIXTURE_LAB:synthetic-capital-derived-v1";
  out.provenance_refs = [digest(["FIXTURE_LAB_SYNTHETIC_CAPITAL_F1", kind, currency])];
  out.calculation_revision = "FIXTURE_LAB:capital-review-f1.v1";
  return out;
}
const wpF1Value = (entry: Draft, key: string): string | null => (entry.metrics[key]?.availability === "AVAILABLE" ? entry.metrics[key].value : null);
const wpF1Part = (budget: string, percent: bigint): string => trimmed(toScaled(budget) * percent / 100n / 10n ** 16n * 10n ** 16n, SCALE);
function addWpF1(body: Draft, groupFields: string[]): void {
  for (const entry of body.capital_statements) {
    const currency = entry.partition.currency;
    const template = entry.metrics.current_budget;
    const key = JSON.stringify(entry.partition);
    const [initial, added, returned, budget] = ["initial_funds", "added_funds", "returned_capital", "current_budget"].map((name) => wpF1Value(entry, name));
    const net = initial !== null && added !== null && returned !== null ? trimmed(toScaled(initial) + toScaled(added) - toScaled(returned), SCALE) : null;
    const allocation = budget === null ? null : wpF1Part(budget, 55n + BigInt(seedOf(key, "allocation") % 36));
    const room = budget !== null && allocation !== null ? trimmed(toScaled(budget) - toScaled(allocation), SCALE) : null;
    const recall = budget === null ? null : seedOf(key, "recalling") % 3 === 0 ? "0" : wpF1Part(budget, 1n + BigInt(seedOf(key, "recall-pct") % 4));
    entry.metrics.allocation = wpF1Money(template, allocation, currency, "allocation");
    entry.metrics.net_external_flows = wpF1Money(template, net, currency, "net_external_flows");
    entry.metrics.headroom = wpF1Money(template, room, currency, "headroom");
    entry.metrics.recalling = wpF1Money(template, recall, currency, "recalling");
  }
  if (groupFields.length === 1 && groupFields[0] === "alpha_id") {
    const totals = new Map<string, bigint>();
    for (const group of body.groups) for (const item of group.economic_partitions) {
      const value = wpF1Value(item, "allocation");
      if (value !== null) totals.set(JSON.stringify(item.partition), (totals.get(JSON.stringify(item.partition)) ?? 0n) + toScaled(value));
    }
    for (const group of body.groups) for (const item of group.economic_partitions) {
      const value = wpF1Value(item, "allocation");
      const total = totals.get(JSON.stringify(item.partition)) ?? 0n;
      const share = pctMetric(item.metrics.net_pnl, value === null ? null : pct(toScaled(value), total));
      share.window = null;
      share.denominator = null;
      share.methodology_ref = share.availability === "AVAILABLE" ? "FIXTURE_LAB:synthetic-allocation-share-v1" : null;
      item.metrics.allocation_share_pct = share;
    }
  }
}

/* SIMULATED capital ledger of the scale portfolios (FIXTURE_LAB, register 2f1). `GET /portfolios/{id}/capital-ledger?environment=` for a portfolio
 * of the generated universe (`pf_scale_*`; the suite portfolios `pf_TEST_ONLY_*` keep the double's own answers, WP-C's). The ledger is an ALLOCATION
 * ledger (capital allocated to accounts), one bucket per currency, built from the portfolio's own deployments of that environment:
 *   per deployment: INITIAL_ALLOCATE of 60% of its allocation (82 days before FIXTURE_NOW) and ALLOCATE of the other 40% (41 days before);
 *   the first deployment adds a REBALANCE that moved nothing (UNCHANGED, 8 days before) and a WITHDRAW of 5% of its allocation (6 days before).
 * Amounts are truncated to 2 places, exact decimals, bigint only; `before_allocated` / `after_allocated` are that account's running total;
 * the bucket totals are the sums of THIS bucket's own entries (one currency). An environment the portfolio has no book in answers an empty ledger
 * (a fact, not a zero balance). Receipts are not part of this contract (FE-032). */
function wpF1Ledger(id: string, environment: string): Draft | null {
  const universe = scaled();
  const portfolio = universe.portfolios.find((entry) => entry.id === id);
  if (portfolio === undefined || !["live", "paper", "sandbox"].includes(environment)) return null;
  const base = JSON.parse(readFileSync(join(CONTRACTS, "execution-analytics.capital-ledger.valid.json"), "utf8")) as Draft;
  const deployments = portfolio.environments.includes(environment as never)
    ? universe.alphas.flatMap((alpha) => alpha.deployments).filter((entry) => entry.portfolioId === id && entry.environment === environment)
    : [];
  const DAY = 86_400_000;
  const now = fixtureNowMs();
  const iso = (daysBefore: number): string => new Date(now - daysBefore * DAY).toISOString().replace(".000Z", "Z");
  const trunc = (value: bigint): bigint => value / 10n ** 16n * 10n ** 16n;
  const cents = (value: bigint): string => trimmed(trunc(value), SCALE);
  const buckets = new Map<string, { entries: Draft[]; up: bigint; down: bigint }>();
  let n = 0;
  deployments.forEach((dep, index) => {
    const bucket = buckets.get(dep.currency) ?? { entries: [], up: 0n, down: 0n };
    const total = toScaled(dep.allocation);
    const first = trunc(total * 60n / 100n);
    const second = total - first;
    let running = 0n;
    const add = (movement: string, direction: string, amount: bigint, days: number): void => {
      const before = running;
      running = direction === "INCREASE" ? running + amount : direction === "DECREASE" ? running - amount : running;
      n += 1;
      bucket.entries.push({ ledger_id: `ledger-${id}-${n}`, allocation_id: `allocation-${dep.id}`, account_id: dep.accountId, movement_type: movement, direction, amount: cents(amount), before_allocated: cents(before), after_allocated: cents(running), occurred_at: iso(days) });
      if (direction === "INCREASE") bucket.up += amount;
      if (direction === "DECREASE") bucket.down += amount;
    };
    add("INITIAL_ALLOCATE", "INCREASE", first, 82 - (index % 5));
    add("ALLOCATE", "INCREASE", second, 41 - (index % 5));
    if (index === 0) {
      add("REBALANCE", "UNCHANGED", 0n, 8);
      add("WITHDRAW", "DECREASE", trunc(total * 5n / 100n), 6);
    }
    buckets.set(dep.currency, bucket);
  });
  const list = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([currency, bucket]) => ({
    currency, gross_increase: cents(bucket.up), gross_decrease: cents(bucket.down), entry_count: bucket.entries.length, entries: bucket.entries.reverse(),
  }));
  const count = list.reduce((sum, bucket) => sum + bucket.entry_count, 0);
  const analytics = base.analytics as Draft;
  return { ...base, read_at: new Date(now).toISOString(), analytics: { ...analytics, input_as_of: new Date(now).toISOString(), data: { ...analytics.data, portfolio_id: id, entry_count: count, returned_entry_count: count, has_more: false, buckets: list } } };
}
/* SIMULATED self-eligibility for the Portfolio 360 Actions rail (FIXTURE_LAB, register 2f1). `GET /api/admin/profile-access/v2/eligibility/batch` for
 * resources that are all `PORTFOLIO:pf_*` (the rail's own question; the canonical `portfolio_TEST_ONLY` question stays with its double). Rows are
 * the canonical `capital.top_up` row of the published batch case with the asked action name: ALLOWED for the grant and recall actions, and for
 * `capital.adjust_target_budget` on half of the portfolios (seeded by id), the others UNAVAILABLE / ACTION_TARGET_UNSUPPORTED (the canonical
 * unavailable row). ADVISORY ONLY, as the contract says: `command_readiness` stays NOT_CHECKED, nothing is a permit, no command is enabled. */
function wpF1Eligibility(search: URLSearchParams): ReviewManagerResponse | null {
  const resources = (search.get("resources") ?? "").split(",").filter((token) => token !== "");
  if (resources.length === 0 || !resources.every((token) => /^PORTFOLIO:pf_[A-Za-z0-9._:%-]+$/.test(token))) return null;
  const actions = (search.get("actions") ?? "").split(",").filter((token) => token !== "");
  const environment = search.get("environment") ?? "";
  const workspace = search.get("workspace_id") ?? "";
  if (actions.length === 0 || !["paper", "sandbox", "live"].includes(environment) || !/^[A-Za-z0-9._:-]{1,128}$/.test(workspace)) return null;
  const file = JSON.parse(readFileSync(join(CONTRACTS, "execution-access.synthetic.valid.json"), "utf8")) as Draft;
  const base = copy(file.batch_cases.find((entry: Draft) => entry.case_name === "STEP_UP_REQUIRED_NOT_ACTIVE").value) as Draft;
  const rows = base.results.flatMap((result: Draft) => result.actions) as Draft[];
  const allowed = rows.find((row) => row.action === "capital.top_up")!;
  const refused = rows.find((row) => row.permission === "UNAVAILABLE")!;
  const now = fixtureNowMs();
  const ceiling = 365 * 86_400_000;
  base.workspace_id = workspace;
  base.environment = environment;
  base.observed_at_ms = now;
  base.valid_until_ms = now + ceiling;
  base.results = resources.map((token) => {
    const id = decodeURIComponent(token.slice("PORTFOLIO:".length));
    return {
      resource: { kind: "PORTFOLIO", id },
      actions: actions.map((action) => {
        const open = action !== "capital.adjust_target_budget" || seedOf(id, "target-eligibility") % 2 === 0;
        const row = copy(open ? allowed : refused);
        row.action = action;
        if (open) row.grant_ref = `acg_FIXTURE_LAB_OWN_${action.replace(/\W/g, "_").toUpperCase()}`;
        return row;
      }),
    };
  });
  return { status: 200, body: base };
}
function wpF1Answer(method: string, path: string, search: URLSearchParams): ReviewManagerResponse | null {
  if (method === "GET" && path === "/api/admin/profile-access/v2/eligibility/batch") return wpF1Eligibility(search);
  const match = /^\/portfolios\/([^/]+)\/capital-ledger$/.exec(path);
  if (method !== "GET" || match === null) return null;
  let id: string;
  try { id = decodeURIComponent(match[1]!); } catch { return null; }
  const body = wpF1Ledger(id, search.get("environment") ?? "live");
  return body === null ? null : { status: 200, body };
}

/* SIMULATED fund series (FIXTURE_LAB, register 2f1, QA1 OV-03). The fund's NAV, Net PnL and Return series end on the figures the FUND dataset's
 * capital statement publishes for the SAME partition (domain of the environment, currency of the series) and window, so the chart and the KPI
 * tile of the Overview read one number; the walk between is the deterministic noisy path of `wpcWalk` (no sawtooth). The statement is the one
 * `datasetAnswer` serves (`capitalStatements` over the same rows and window preset). A partition with no figure keeps the old synthetic values. */
function wpF1ShapeFund(entry: Draft, metricName: string, environment: string, requested: unknown): void {
  const days = requested === "7D" ? "7D" : requested === "90D" ? "90D" : "30D";
  const template = fixture("execution-manager-dataset.partitions.synthetic.valid.json");
  const rows = rowsFor(environment, template, WINDOW_PRESETS[days], true);
  const statement = capitalStatements(rows).find((e) => e.partition.currency === entry.partition.currency && e.partition.economic_domain === entry.partition.economic_domain);
  const figure = (key: string): string | null => (statement?.metrics[key]?.availability === "AVAILABLE" ? (statement.metrics[key].value as string) : null);
  const [net, nav, ret] = [figure("net_pnl"), figure("current_nav"), figure("return_30d_pct")];
  // A series needs the figures that frame its walk; the Return of a partition that publishes none is left as it was.
  if (net === null || nav === null || (metricName === "RETURN" && ret === null)) return;
  const target = { net: toScaled(net), nav: toScaled(nav), ret: ret === null ? 0n : toScaled(ret) / 100n };
  const n = entry.points.length;
  const navPos = target.nav > 0n ? target.nav : 1n;
  const [start, end, amp] = metricName === "NAV" ? [target.nav - target.net, target.nav, navPos / 120n]
    : metricName === "NET_PNL" ? [0n, target.net, wpcAbs(target.net) > navPos / 150n ? wpcAbs(target.net) / 2n : navPos / 150n]
      : [0n, target.ret, wpcAbs(target.ret) > 5n * 10n ** 15n ? wpcAbs(target.ret) / 2n : 10n ** 16n];
  const values = wpcWalk(seedOf("FUND", environment, metricName, "wpf1-walk"), n - 1, start, end, amp);
  const text = (value: bigint): string => (metricName === "RETURN" ? trimmed(value / 10n ** 10n, 8) : trimmed(value, 18));
  entry.points.forEach((point: Draft, k: number) => { point.value = text(values[k]!); });
}
// ===== WP-F1 end

function datasetAnswer(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse | null {
  if (method === "GET" && search.get("environment") === "ALL") return allAnswer(path, search, profile);
  const match = /^\/manager\/(fund-overview|fleet|(?:portfolios|alphas|accounts|deployments)\/([^/]+)\/overview)$/.exec(path);
  if (method !== "GET" || !match) return null;
  const checkedQuery = new URLSearchParams(search);
  checkedQuery.delete("after");
  checkedQuery.delete("before");
  checkedQuery.delete("lifecycle_filter");
  // WP-A: numeric filters and sorts and the pinned partition are evaluated by this lane (below), the L0 double validates the rest.
  const planned = fleetPlan(search);
  if ("refusal" in planned) return planned.refusal;
  const { pin, textFilters, textSort } = planned.plan;
  checkedQuery.delete("economic_partition");
  if (textFilters.length > 0) checkedQuery.set("filters", JSON.stringify(textFilters)); else checkedQuery.delete("filters");
  if (textSort.length > 0) checkedQuery.set("sort", JSON.stringify(textSort)); else checkedQuery.delete("sort");
  checkedQuery.delete("group_sort"); // WP-K: validated and applied below (the L0 double refuses what it cannot apply)
  checkedQuery.delete("group_filters");
  // SIMULATED window presets: bare (`30D`) or JSON-quoted (`"30D"`, as httpApi encodes it). Any other window shape stays the double's 400.
  const rawWindow = search.get("window");
  const windowName = rawWindow === null ? null : (["7D", "30D", "90D", "ALL"] as const).find((name) => rawWindow === name || rawWindow === JSON.stringify(name)) ?? null;
  if (windowName !== null) checkedQuery.delete("window");
  const windowPreset: WindowPreset = windowName === null || windowName === "ALL" ? WINDOW_PRESETS["30D"] : WINDOW_PRESETS[windowName];
  const checked = answerManagerFleet("GET", "/manager/fleet", checkedQuery)!;
  if (checked.status !== 200) return checked;
  const filters = JSON.parse(search.get("filters") ?? "[]") as Draft[];
  const sort = JSON.parse(search.get("sort") ?? "[]") as Draft[];
  if (filters.some((filter) => Object.keys(filter).sort().join(",") !== (filter.op === "IN" ? "field,op,values" : filter.op === "IS_NULL" ? "field,op" : "field,op,value"))
    || sort.some((key) => Object.keys(key).sort().join(",") !== "direction,field")
    || new Set(sort.map((key) => key.field)).size !== sort.length) return problem(400, "EXECUTION_READ_QUERY_INVALID", "Filter/sort objects contain only the published fields; a sort field occurs once.");
  // Do not let the validation copy conceal a duplicate or unsupported cursor/lifecycle shape.
  if ([...search.keys()].some((key) => search.getAll(key).length !== 1) || (search.has("after") && search.has("before"))) return problem(400, "EXECUTION_READ_QUERY_INVALID", "A parameter is repeated, or both cursor directions were supplied.");
  const lifecycle = search.get("lifecycle_filter");
  if (lifecycle !== null && (lifecycle.length < 1 || lifecycle.length > 256 || /[\u0000-\u001f\u007f]/.test(lifecycle))) return problem(400, "EXECUTION_READ_QUERY_INVALID", "lifecycle_filter is printable text.");
  const body = copy(checked.body) as Draft;
  const template = fixture("execution-manager-dataset.partitions.synthetic.valid.json");
  const environment = search.get("environment")!;
  const surface = match[1] === "fleet" ? "FLEET" : match[1] === "fund-overview" ? "FUND" : ({ portfolios: "PORTFOLIO", alphas: "ALPHA", accounts: "ACCOUNT", deployments: "DEPLOYMENT" } as Record<string, string>)[match[1]!.split("/")[0]!]!;
  let id: string | undefined;
  try { id = match[2] === undefined ? undefined : decodeURIComponent(match[2]); } catch { return problem(400, "EXECUTION_READ_QUERY_INVALID", "The resource id is not URI text."); }
  let rows = rowsFor(environment, template, windowPreset, profile === "populated", wpcAlphasFor(surface, id)); // WP-C: the native ids answer from their own books
  const universe = scaled();
  if (id !== undefined) {
    const known = surface === "PORTFOLIO" ? universe.portfolios.some((entry) => entry.id === id) : surface === "ALPHA" ? universe.alphas.some((entry) => entry.id === id)
      : surface === "ACCOUNT" ? universe.bindings.some((entry) => entry.accountId === id && entry.environment === environment) : universe.alphas.some((alpha) => alpha.deployments.some((entry) => entry.id === id && entry.environment === environment));
    const canonicalKnown = rows.some((row) => surface === "PORTFOLIO" ? row.portfolio_id === id : surface === "ALPHA" ? row.alpha_id === id : row.children.some((child: Draft) => child[surface === "ACCOUNT" ? "account_id" : "deployment_id"] === id));
    if (!known && !canonicalKnown && !wpcKnown(surface, id)) return problem(404, "EXECUTION_READ_NOT_AVAILABLE", "This synthetic review resource is not in the selected universe/environment.");
    rows = rows.filter((row) => surface === "PORTFOLIO" ? row.portfolio_id === id : surface === "ALPHA" ? row.alpha_id === id : row.children.some((child: Draft) => child[surface === "ACCOUNT" ? "account_id" : "deployment_id"] === id));
    if (surface === "ACCOUNT" || surface === "DEPLOYMENT") {
      // Select the source contributions BEFORE aggregating: a shared portfolio
      // is not the account's amount, but the selected child's facts do exist.
      const source = wpcAlphasFor(surface, id) ?? (universe.alphas.length ? universe.alphas : SUITE_ALPHAS);
      const selected = source.map(alpha => ({ ...alpha, deployments: alpha.deployments.filter(d =>
        d.environment === environment && (surface === "ACCOUNT" ? d.accountId === id : d.id === id)) }));
      rows = rowsFor(environment, template, windowPreset, profile === "populated", selected);
    }
  }
  const stages = search.has("stage_filter") ? search.get("stage_filter")!.split(",") : STAGES[environment]!;
  rows = rows.flatMap((row) => {
    const children = row.children.filter((child: Draft) => stages.includes(child.stage));
    if (!children.length) return [];
    if (children.length !== row.children.length) {
      for (const key of Object.keys(row.metrics)) row.metrics[key] = nulled(key, row.metrics[key], row.economic_partitions[0].partition.currency);
      row.economic_partitions[0].metrics = copy(row.metrics);
    }
    row.children = children;
    row.stage_presence = [...new Set(children.map((child: Draft) => child.stage))].sort();
    row.current_stage = row.stage_presence.length === 1 ? row.stage_presence[0] : null;
    row.stage_lifecycle_reasons.current_stage = row.current_stage === null ? "MULTIPLE_ACTIVE_STAGES" : null;
    return [row];
  });
  body.surface = surface;
  body.as_of_ms = fixtureNowMs();
  body.recorded_through_ms = fixtureNowMs();
  body.facts_through_ms = fixtureNowMs();
  body.quality = { completeness: "PARTIAL", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC", "RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED"] };
  body.capital_statements = capitalStatements(rows); // Selected resource/stages BEFORE table filters.
  const textOf = (row: Draft, field: string): string | null => field === "stage_presence" ? row.stage_presence.join(",") : typeof row[field] === "string" ? row[field] : null;
  const q = search.get("q")?.toLowerCase();
  rows = rows.filter((row) => (lifecycle === null || row.lifecycle === lifecycle)
    && (q === undefined || (search.get("q_mode") === "CONTAINS" ? row.name.toLowerCase().includes(q) : row.name.toLowerCase().startsWith(q)))
    && filters.every((filter) => fleetFilterHolds(row, filter, pin, textOf)));
  rows.sort(fleetOrder(sort, pin, textOf));
  const groups = search.has("group_by") ? search.get("group_by")!.split(",") : [];
  const grouped = new Map<string, { key: Draft[]; rows: Draft[] }>();
  for (const row of rows) if (groups.length) {
    const key = groups.map((field) => ({ field, value: textOf(row, field) }));
    const encoded = JSON.stringify(key);
    const group = grouped.get(encoded) ?? { key, rows: [] };
    group.rows.push(row);
    grouped.set(encoded, group);
  }
  body.groups = [...grouped.values()].map((group) => ({ key: group.key, unique_row_count: group.rows.length, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: aggregate(group.rows) }));
  // SIMULATED (FE-CAT-5): in a read grouped by alpha_id alone, the first group's first partition publishes a true zero net_pnl
  // and the second group's first partition publishes none (a typed absence, SOURCE_FACTS_NOT_PUBLISHED).
  if (groups.length === 1 && groups[0] === "alpha_id") {
    body.groups.slice(0, 2).forEach((group: Draft, index: number) => {
      const entry = group.economic_partitions[0];
      if (entry?.metrics.net_pnl) entry.metrics.net_pnl = metric(entry.metrics.net_pnl, index === 0 ? "0" : null, entry.partition.currency);
    });
  }
  const bound = digest([profile, path, [...search.entries()].filter(([key]) => !["after", "before", "limit"].includes(key)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]);
  const snapshot = digest(["FIXTURE_LAB_SYNTHETIC", profile, environment, body.workspace_id, fixtureNowMs(), rows]);
  const limit = Number(search.get("limit") ?? 100);
  let offset = 0;
  const cursorText = search.get("after") ?? search.get("before");
  if (cursorText !== null) {
    let cursor: Draft;
    try { cursor = JSON.parse(Buffer.from(cursorText, "base64url").toString("utf8")); } catch { return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor was not issued by this review profile."); }
    if (!cursor || typeof cursor !== "object" || Object.keys(cursor).sort().join(",") !== "b,o,s" || !Number.isSafeInteger(cursor.o) || cursor.o < 0) return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor shape is invalid.");
    if (cursor.b !== bound || cursor.s !== snapshot) return problem(409, "MANAGER_CURSOR_CHANGED", "The cursor belongs to another query, profile or snapshot.");
    offset = cursor.o;
    if (offset >= rows.length) return problem(400, "EXECUTION_READ_QUERY_INVALID", "The cursor is outside this result.");
  }
  const encode = (at: number): string => Buffer.from(JSON.stringify({ o: at, b: bound, s: snapshot })).toString("base64url");
  body.items = rows.slice(offset, offset + limit);
  body.page = { limit, returned_count: body.items.length, authorized_filtered_count: rows.length,
    next_cursor: offset + limit < rows.length ? encode(offset + limit) : null, previous_cursor: offset > 0 ? encode(Math.max(0, offset - limit)) : null };
  body.snapshot_id = snapshot;
  body.lineage.source_set_ref = digest(["FIXTURE_LAB_SYNTHETIC", profile, fixtureNowMs()]);
  body.lineage.revision = snapshot;
  // Keep the published descriptor; numeric requests receive the original explicit 400 above,
  // never a body that silently ignores them. This review module is not the production query engine.
  body.query_options = copy(template.query_options);
  // SIMULATED metric keys (README): rows carry exactly the keys the dataset names; each is also offered as a sort field.
  for (const key of NEW_ROW_KEYS) {
    if (key === "score" && profile !== "populated") continue;
    body.query_options.metric_keys.push(key);
    if (!body.query_options.sort_fields.includes(key)) body.query_options.sort_fields.push(key);
  }
  body.query_options.economic_partition_required_for.push("balance_total", "equity_30d_end_value");
  if (!body.query_options.window.independent_metrics.includes("balance_total")) body.query_options.window.independent_metrics.push("balance_total");
  if (windowName !== null) applyWindow(body, windowName, windowPreset);
  addGroupScores(body, groups, windowName); // SIMULATED score keys (register 2c), after the window so ALL stays a gap
  addWpF1(body, groups); // WP-F1: capital statement keys and allocation shares (register 2f1)
  wpkStageEntry(body); // WP-K: FIXTURE_LAB stage entry (register 2k2), the single-environment reads only
  const groupQuery = wpkGroupQuery(body, search, groups);
  if (groupQuery !== null) return groupQuery; // WP-K slice 6: a 400 for a malformed or unsupported group query
  if (Buffer.byteLength(JSON.stringify(body)) > body.query_policy.maximum_response_bytes) return problem(400, "MANAGER_REVIEW_RESPONSE_TOO_LARGE", "Reduce limit/grouping for this bounded review response.");
  return { status: 200, body };
}

export function answerReviewManager(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile, requestBody: unknown = null): ReviewManagerResponse | null {
  const normalized = path.replace(/^\/api\/v1\/execution(?=\/)/, "");
  return seriesAnswer(method, normalized, search, profile) ?? wpkApprovalEvidence(method, normalized, search, profile) ?? wpkAlphaLifecycle(method, normalized, search) ?? wpkOperationsExtras(method, normalized, search) ?? wpkEntitySearch(method, normalized, search) ?? wpkPortfolioHealth(method, normalized, search) ?? wpkSiblings(method, normalized, search, requestBody) ?? wpcCandles(method, normalized, search) ?? wpcEquity(method, normalized, search) ?? wpcAlphaResource(method, normalized, search) ?? wpF1Answer(method, normalized, search) ?? wpcAlphaKeys(normalized, search, datasetAnswer(method, normalized, search, profile));
}

// ===== WP-C begin (Alpha 360, Trade replay, Compare; FIXTURE_LAB, register section 2c-wpc)
// Touches in shared functions (one expression each): seriesAnswer (knownPortfolios, one call after `entry.gaps`), rowsFor (optional 4th
// parameter), datasetAnswer (the rowsFor call and the 404 test), answerReviewManager (one wrapper around datasetAnswer).
type WpcSurface = string;
let wpcTemplate: Draft | null = null;
const WPC_CORE: [string, string] = ["pf_TEST_ONLY_core", "Core"];
const WPC_SAT: [string, string] = ["pf_TEST_ONLY_satellite", "Satellite"];
const WPC_CAN: [string, string] = ["pf_TEST_ONLY_canary", "Canary"];
/** The portfolio ids the Portfolios list publishes for the native (TEST_ONLY) universe; Pilot (empty) has no members and keeps no series. */
const WPC_PORTFOLIO_IDS = ["pf_TEST_ONLY_core", "pf_TEST_ONLY_satellite", "pf_TEST_ONLY_canary", "pf_TEST_ONLY_yen", "pf_TEST_ONLY_empty"] as const;
/** The native alphas of the e2e suite (the ids the doubles and the audit open), booked into the TEST_ONLY portfolios. dep_*_01 are the ids the alpha resource double names. */
// The fixture makes the FIRST row of an environment a true zero (rows.length % 11), so the halted and grid alphas come first: the default audit subjects keep their figures.
const WPC_ALPHAS: AlphaSpec[] = [
  suiteAlpha("alpha_c", "Momentum C", "2.0", "Minh-003", "ATTENTION", [suiteDeployment("dep_c1", "alpha_c", "CANARY", "live", WPC_SAT, "15000", "0", "0", "HALTED")]),
  suiteAlpha("alpha_d", "Grid D", "0.9", "Bobby-001", "READY", [
    suiteDeployment("dep_d1", "alpha_d", "SANDBOX", "sandbox", WPC_CAN, "8000", "61.2", "3"),
    suiteDeployment("dep_d2", "alpha_d", "PAPER", "paper", WPC_SAT, "10000", "-30.75", "8.4"),
  ]),
  suiteAlpha("alpha_a", "Carry A", "1.0", "Bobby-001", "READY", [
    suiteDeployment("dep_live_01", "alpha_a", "LIVE", "live", WPC_CORE, "40000.00", "980.40", "140.40"),
    suiteDeployment("dep_paper_01", "alpha_a", "PAPER", "paper", WPC_CORE, "20000.00", "-84.20", "0"),
    suiteDeployment("dep_sandbox_01", "alpha_a", "SANDBOX", "sandbox", WPC_CORE, "10000.00", "0", "0", "HALTED"),
  ]),
  suiteAlpha("alpha_btc_trend", "BTC Trend", "3.0", "Lan-002", "READY", [
    suiteDeployment("dep_btc_live", "alpha_btc_trend", "LIVE", "live", WPC_CORE, "80000", "1120.8", "55.4"),
    suiteDeployment("dep_btc_paper", "alpha_btc_trend", "PAPER", "paper", WPC_CORE, "50000.5", "-125.25", "40.1"),
    suiteDeployment("dep_btc_sandbox", "alpha_btc_trend", "SANDBOX", "sandbox", WPC_CAN, "12000", "61.2", "3"),
  ]),
  suiteAlpha("alpha_b", "Basis B", "1.4", "Lan-002", "READY", [
    suiteDeployment("dep_b1", "alpha_b", "LIVE", "live", WPC_CORE, "120000", "2150.75", "310.2"),
    suiteDeployment("dep_b2", "alpha_b", "LIVE", "live", WPC_SAT, "60000", "-98.4", "21.05"),
    suiteDeployment("dep_b3", "alpha_b", "CANARY", "live", WPC_CORE, "30000", "410.1", "-5.5"),
  ]),
];
const wpcNativeAlpha = (id: string | undefined): boolean => id !== undefined && WPC_ALPHAS.some((alpha) => alpha.id === id);
const wpcNativePortfolio = (id: string | undefined): boolean => id !== undefined && (WPC_PORTFOLIO_IDS as readonly string[]).includes(id);
/** The native ids answer from the native books, in whatever environment is asked (an empty environment is a 200 with no rows, never a 404). */
function wpcAlphasFor(surface: WpcSurface, id: string | undefined): AlphaSpec[] | undefined {
  // The small scale keeps the e2e suite's own SUITE_ALPHAS (pinned by tests); medium and large have no native alphas in the generated universe.
  if (scaled().alphas.length === 0) return undefined;
  return (surface === "ALPHA" && wpcNativeAlpha(id)) || (surface === "PORTFOLIO" && wpcNativePortfolio(id)) ? WPC_ALPHAS : undefined;
}
const wpcKnown = (surface: WpcSurface, id: string | undefined): boolean => wpcAlphasFor(surface, id) !== undefined;
/** Portfolio ids the series port may answer for beyond the scaled universe: the native books that hold at least one deployment in this environment. */
function wpcPortfolioStubs(environment: string): { id: string; base: string }[] {
  wpcTemplate ??= fixture("execution-manager-dataset.partitions.synthetic.valid.json");
  const held = new Set(rowsFor(environment, wpcTemplate, WINDOW_PRESETS["30D"], true, WPC_ALPHAS).map((row) => row.portfolio_id));
  return [...held].map((id) => ({ id, base: "USDT" }));
}

/** Deterministic integer walk of n+1 values from `start` to `end` (a bridge), step size about `amp`. Bigint only. */
function wpcWalk(seed: number, n: number, start: bigint, end: bigint, amp: bigint): bigint[] {
  let state = BigInt((seed % 2_147_483_646) + 1);
  const steps = BigInt(Math.max(4, Math.round(Math.sqrt(n) * 0.8)));
  const walk: bigint[] = [0n];
  for (let i = 1; i <= n; i += 1) {
    state = (state * 48_271n) % 2_147_483_647n;
    walk.push(walk[i - 1]! + ((state % 2001n) - 1000n) * amp / (1000n * steps));
  }
  const total = BigInt(n);
  return walk.map((value, i) => start + value - walk[n]! * BigInt(i) / total + (end - start) * BigInt(i) / total);
}
const wpcAbs = (value: bigint): bigint => (value < 0n ? -value : value);
/** The dataset figures of one portfolio, from the SAME rows the overview read serves: the series ends on them. */
function wpcTarget(environment: string, id: string, preset: WindowPreset, currency: string, by: "portfolio_id" | "alpha_id" = "portfolio_id"): { net: bigint; nav: bigint; ret: bigint } | null {
  wpcTemplate ??= fixture("execution-manager-dataset.partitions.synthetic.valid.json");
  const only = wpcAlphasFor(by === "alpha_id" ? "ALPHA" : "PORTFOLIO", id); // WP-K: the same figures, by alpha
  const rows = rowsFor(environment, wpcTemplate, preset, true, only).filter((row) => row[by] === id);
  const partition = aggregate(rows).find((entry) => entry.partition.currency === currency);
  const available = (key: string): string | null => partition?.metrics[key]?.availability === "AVAILABLE" ? partition.metrics[key].value : null;
  // NAV is the capital statement's `current_nav` of this partition (what the Compare table prints for NAV); the group's own sum is the fallback.
  const statement = capitalStatements(rows).find((entry) => entry.partition.currency === currency)?.metrics.current_nav;
  const statementNav = statement?.availability === "AVAILABLE" ? (statement.value as string) : null;
  const [net, nav, ret] = [available("net_pnl"), statementNav ?? available("current_nav"), available("return_30d_pct")];
  return net === null || nav === null || ret === null ? null : { net: toScaled(net), nav: toScaled(nav), ret: toScaled(ret) / 100n };
}
/** Replaces the values of one series entry with a per-subject walk whose end equals the subject's dataset figure (NAV, Net PnL, Return). */
function wpcShapeSeries(entry: Draft, metricName: string, subjectId: string, environment: string, requested: unknown, by: "portfolio_id" | "alpha_id" = "portfolio_id"): void {
  const days = requested === "7D" ? "7D" : requested === "90D" ? "90D" : "30D";
  const target = wpcTarget(environment, subjectId, WINDOW_PRESETS[days], entry.partition.currency, by);
  if (target === null) return;
  const n = entry.points.length;
  const seed = seedOf(subjectId, environment, metricName, "wpc-walk");
  const nav = target.nav > 0n ? target.nav : 1n;
  const [start, end, amp] = metricName === "NAV" ? [target.nav - target.net, target.nav, nav / 120n]
    : metricName === "NET_PNL" ? [0n, target.net, wpcAbs(target.net) > nav / 150n ? wpcAbs(target.net) / 2n : nav / 150n]
      : [0n, target.ret, wpcAbs(target.ret) > 5n * 10n ** 15n ? wpcAbs(target.ret) / 2n : 10n ** 16n];
  const values = wpcWalk(seed, n - 1, start, end, amp);
  const indices = Array.from({ length: n }, (_, i) => i);
  // Return is a fraction (8 places); money keeps its 18 places. The walk itself is in 18-place integers.
  const text = (value: bigint): string => (metricName === "RETURN" ? trimmed(value / 10n ** 10n, 8) : trimmed(value, 18));
  entry.points.forEach((point: Draft, k: number) => { point.value = text(values[indices[k]!]!); });
}

/* ---- ALPHA lifecycle and events: open partition keys of each ALPHA row (register 2c-wpc). Text rides `reason_code` (the WP-A precedent). */
const DAY_MS = 86_400_000;
const WPC_ACTORS = ["bjones", "asmith", "lnguyen"] as const;
/** The instant the alpha doubles state as "now" (17 Oct 12:04Z): the lifecycle, the events, the replay's trades and the equity line end here, so they share one window whatever FIXTURE_NOW is. */
const wpcAnchorMs = (): number => ALPHA_DOUBLE_AS_OF_MS;
function wpcLifecycleKeys(alphaId: string, template: Draft): Record<string, Draft> {
  const now = wpcAnchorMs();
  const seed = seedOf(alphaId, "wpc-life");
  const actor = (n: number): string => WPC_ACTORS[(seed + n) % WPC_ACTORS.length]!;
  const liveDays = 4 + (seed % 17);
  const canaryDays = 3 + (seed >> 3) % 5;
  const sandboxDays = 14 + (seed >> 5) % 11;
  const paperDays = 25 + (seed >> 7) % 20;
  const liveFrom = now - liveDays * DAY_MS;
  const canaryFrom = liveFrom - canaryDays * DAY_MS;
  const sandboxFrom = canaryFrom - sandboxDays * DAY_MS;
  const paperFrom = sandboxFrom - paperDays * DAY_MS;
  const r2 = paperFrom - DAY_MS;
  const r1 = r2 - (8 + (seed >> 9) % 8) * DAY_MS;
  const out: Record<string, Draft> = {};
  const put = (key: string, value: string, unit: string, text: string | null = null): void => {
    const built = plainMetric(template, value, unit);
    built.reason_code = text;
    built.methodology_ref = "FIXTURE_LAB:lifecycle-simulation-v1";
    out[key] = built;
  };
  const at = (ms: number): string => String(Math.round(ms));
  put("life_r1_exit_ms", at(r1), "TIMESTAMP_MS", actor(0));
  put("life_r2_exit_ms", at(r2), "TIMESTAMP_MS", actor(1));
  put("life_paper_exit_ms", at(sandboxFrom), "TIMESTAMP_MS", actor(2));
  put("life_sandbox_exit_ms", at(canaryFrom), "TIMESTAMP_MS", actor(0));
  put("life_canary_exit_ms", at(liveFrom), "TIMESTAMP_MS", actor(1));
  put("life_paper_days", String(paperDays), "DAYS");
  put("life_sandbox_days", String(sandboxDays), "DAYS");
  put("life_canary_days", String(canaryDays), "DAYS");
  put("life_live_days", String(liveDays), "DAYS");
  for (const stage of ["paper", "sandbox", "canary"]) { put(`life_${stage}_criteria_met`, "7", "COUNT"); put(`life_${stage}_criteria_total`, "7", "COUNT"); }
  put("life_run_ms", at(r1 - 20 * DAY_MS), "TIMESTAMP_MS", actor(1));
  put("life_evidence_revision", String(1 + (seed >> 11) % 4), "COUNT");
  put("life_live_decider", "1", "ROLE", "Manager");
  put("life_blocked_reason", "1", "TEXT", "Criterion 6 of 7 is not met");
  // Events: kind, time, "Title|actor". Offsets are inside the lifecycle above, so the stage lane agrees with the spine.
  const events: [string, number, string, string][] = [
    ["stage", paperFrom, "Paper started", "system"], ["stage", sandboxFrom, "Sandbox started", "system"],
    ["stage", canaryFrom, "Canary started", actor(0)], ["stage", liveFrom, "Live started", actor(1)],
    ["decision", r1, "R1 gate approved", actor(0)], ["decision", r2, "R2 gate approved", actor(1)],
    ["decision", sandboxFrom - DAY_MS / 2, "Sandbox exit approved", actor(2)], ["decision", canaryFrom - DAY_MS / 2, "Canary approved", actor(0)], ["decision", liveFrom - DAY_MS / 2, "Live approved", actor(1)],
    // Events on the day the e2e doubles' trades print (the anchor), so Trade Replay's lanes have something to show.
    ["decision", now - 20 * 3_600_000, "Position limit reviewed", actor(2)],
    ["incident", sandboxFrom + (sandboxDays * DAY_MS) / 2, "Sandbox feed gap", "system"], ["incident", now - 2 * 3_600_000, "Broker sync diverged", "system"],
    ["incident", now - 26 * 3_600_000, "Venue feed gap", "system"],
    ["recall", now - DAY_MS, "Recall pending", actor(1)],
    ["flow", liveFrom + 300_000, "Allocation added", actor(1)], ["flow", canaryFrom + 300_000, "Allocation added", actor(0)],
  ];
  const seen: Record<string, number> = {};
  for (const [kind, time, title, by] of events) {
    seen[kind] = (seen[kind] ?? 0) + 1;
    put(`evt_${kind}_${seen[kind]}_ms`, at(time), "TIMESTAMP_MS", `${title}|${by}`);
  }
  // Regime fit: one alpha in three is a typed absence (insufficient data); the others publish a ratio, apart from the score.
  if (seed % 3 === 0) { const absent = plainMetric(template, null, "RATIO"); absent.reason_code = "INSUFFICIENT_DATA"; out.regime_fit = absent; }
  else put("regime_fit", trimmed(BigInt(5200 + (seed % 3500)), 4), "RATIO");
  return out;
}
/** Adds the lifecycle/event/regime keys to an ALPHA overview answer (detail reads only; lists and groups stay as they are). */
function wpcAlphaKeys(path: string, search: URLSearchParams, answer: ReviewManagerResponse | null): ReviewManagerResponse | null {
  const match = /^\/manager\/alphas\/([^/]+)\/overview$/.exec(path);
  if (match === null || answer === null || answer.status !== 200 || search.get("environment") === "ALL") return answer;
  const body = answer.body as Draft;
  const id = decodeURIComponent(match[1]!);
  for (const row of body.items) {
    const keys = wpcLifecycleKeys(row.alpha_id ?? id, row.metrics.net_pnl);
    for (const entry of row.economic_partitions) Object.assign(entry.metrics, copy(keys));
  }
  return answer;
}
/* ---- Trade replay candles (review lane only; the e2e double and its golden are untouched). The double's venue candles drift around 67,200 while
 * the book's trades print up to 67,411, so a fill sat 200 above its candles and stretched the axis. These bars wander (mean-reverting, integer
 * cents, deterministic) around the band the trades print in, so a fill is on its candle and the axis is the candles' own. */
const wpcCents = (value: number): string => `${Math.trunc(value / 100)}.${String(Math.abs(value % 100)).padStart(2, "0")}`;
function wpcCandles(method: string, path: string, search: URLSearchParams): ReviewManagerResponse | null {
  if (method !== "GET" || path !== "/market/venue-candles") return null;
  const base = answerAlpha(method, path, search);
  const body = base?.body as Draft;
  if (base === null || base.status !== 200 || body?.state !== "READY" || !Array.isArray(body.candles) || body.candles.length === 0) return base;
  const CENTRE = 6_730_000;
  let close = 6_722_000;
  body.candles = body.candles.map((candle: Draft, i: number) => {
    const drift = ((i * 37) % 23) - 11;
    const open = close;
    close = open + drift * 1100 + Math.trunc((CENTRE - open) / 16);
    const high = Math.max(open, close) + 120 + (i % 5) * 20;
    const low = Math.min(open, close) - 110 - (i % 4) * 25;
    return { ...candle, o: wpcCents(open), h: wpcCents(high), l: wpcCents(low), c: wpcCents(close) };
  });
  return { status: base.status, body };
}
/* ---- Alpha equity chart (review lane only): the double serves 24 hourly points, a day of a window the design shows as 90 days, so the
 * lifecycle and the event ribbon (which span months) had no axis to sit on. Same body, same start and end values, 120 daily closes in
 * between from a deterministic bridge walk (integer cents). The e2e double and its golden are untouched. */
function wpcEquity(method: string, path: string, search: URLSearchParams): ReviewManagerResponse | null {
  if (method !== "GET" || path !== "/views/equity-chart" || search.get("subject_kind") !== "alpha") return null;
  const base = answerAlpha(method, path, search);
  const body = base?.body as Draft;
  const series = body?.panel?.data?.series?.[0];
  if (base === null || base.status !== 200 || !series || !Array.isArray(series.points) || series.points.length < 2) return base;
  const cents = (text: string): bigint => BigInt(text.replace(".", ""));
  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  let [from, to] = [cents(first[1] as string), cents(last[1] as string)];
  // This alpha's own book (QA1 R2-02): in this environment its USDT deployments open at their allocation and end at allocation plus their net PnL.
  const own = [...WPC_ALPHAS, ...scaled().alphas].find((alpha) => alpha.id === search.get("subject_id"));
  const mine = own?.deployments.filter((d) => d.environment === search.get("environment") && d.currency === "USDT") ?? [];
  if (mine.length > 0 && scaled().alphas.length > 0) {
    const centsOf = (value: string): bigint => toScaled(value) / 10n ** 16n;
    from = mine.reduce((total, d) => total + centsOf(d.allocation), 0n);
    to = mine.reduce((total, d) => total + centsOf(addDecimal(d.allocation, addDecimal(d.realized, d.unrealized))), 0n);
  }
  const n = 119;
  const end = last[0] as number;
  const walk = wpcWalk(seedOf(search.get("subject_id"), search.get("environment"), "wpc-equity"), n, from, to, from / 160n);
  const points = walk.map((value, i) => [end - (n - i) * DAY_MS, wpcCents(Number(value))]);
  const start = points[0]![0] as number;
  series.points = points;
  const panel = body.panel;
  panel.coverage = { ...panel.coverage, from_ms: start, to_ms: end, source_total: String(points.length), filtered_total: String(points.length), returned_count: points.length };
  panel.data.sampling = { ...panel.data.sampling, source_rows: String(points.length), numeric_rows: String(points.length), returned_rows: points.length };
  panel.data.retention = { ...panel.data.retention, oldest_available_ms: start, newest_available_ms: end };
  return { status: base.status, body };
}
/* ---- Alpha resource (review lane, medium and large scale; QA1 R2-02, R2-12): the alpha double answers EVERY id with one template (dep_live_01, 40,000.00,
 * +1,120.80, "Unnamed alpha"), so a Fleet row opened a 360 with another alpha's figures. The same body now carries THIS alpha's own published identity (label,
 * version, owner, health) and its own deployments, with the money fields summed per currency from those deployments (exact decimals, never across currencies).
 * Orders, fills, positions and the equity path keep the double's single book (a request to the fixture world, not invented here). */
const WPC_STAGE_ORDER = ["LIVE", "CANARY", "SANDBOX", "PAPER"] as const;
function wpcAlphaResource(method: string, path: string, search: URLSearchParams): ReviewManagerResponse | null {
  const match = /^\/resources\/alphas\/([^/]+)$/.exec(path);
  if (method !== "GET" || match === null || search.has("workspace_id") || scaled().alphas.length === 0) return null;
  const id = decodeURIComponent(match[1]!);
  const spec = [...WPC_ALPHAS, ...scaled().alphas].find((alpha) => alpha.id === id);
  if (spec === undefined) return null;
  const base = answerAlpha(method, path, search);
  const body = base?.body as Draft;
  const alpha = body?.data?.alpha;
  if (base === null || base.status !== 200 || !alpha || !Array.isArray(alpha.deployments) || alpha.deployments.length === 0) return base;
  const template = alpha.deployments[0];
  const sum = (values: string[]): string => values.reduce(addDecimal, "0");
  const currencies = [...new Set(spec.deployments.map((d) => d.currency))];
  const mode: Record<string, string> = { paper: "paper", sandbox: "sandbox", live: "live" };
  alpha.alpha_label = spec.label;
  alpha.version = spec.version;
  alpha.owner = spec.owner;
  alpha.health = spec.health;
  alpha.stage = WPC_STAGE_ORDER.find((stage) => spec.deployments.some((d) => d.stage === stage && d.active)) ?? spec.deployments[0]?.stage ?? "PAPER";
  alpha.stages = WPC_STAGE_ORDER.filter((stage) => spec.deployments.some((d) => d.stage === stage)).reverse();
  alpha.portfolios = [...new Map(spec.deployments.map((d) => [d.portfolioId, { portfolio_id: d.portfolioId, name: d.portfolioName, base_currency: d.currency }])).values()];
  alpha.deployments = spec.deployments.map((d) => {
    const net = addDecimal(d.realized, d.unrealized);
    return { ...copy(template), deployment_id: d.id, strategy_id: id, stage: d.stage, venue: d.venue, account_id: d.accountId, portfolio_id: d.portfolioId, currency: d.currency,
      allocation: d.allocation, balance_total: addDecimal(d.allocation, net), balance_free: addDecimal(d.allocation, net), balance_locked: "0", realized_pnl: d.realized,
      unrealized_pnl: d.unrealized, net_pnl: net, exposure: d.exposure, state: d.active ? "ACTIVE" : "ENDED", active: d.active, health: d.health };
  });
  const per = (pick: (d: DeploymentSpec) => string, currency: string): string => sum(spec.deployments.filter((d) => d.currency === currency).map(pick));
  alpha.allocations = currencies.map((currency) => ({ currency, value: per((d) => d.allocation, currency) }));
  alpha.balances = currencies.map((currency) => ({ currency, total: per((d) => addDecimal(d.allocation, addDecimal(d.realized, d.unrealized)), currency), free: per((d) => addDecimal(d.allocation, addDecimal(d.realized, d.unrealized)), currency), locked: "0" }));
  alpha.position_pnl = currencies.map((currency) => ({ currency, realized: per((d) => d.realized, currency), unrealized: per((d) => d.unrealized, currency), net: per((d) => addDecimal(d.realized, d.unrealized), currency) }));
  alpha.exposure = currencies.map((currency) => ({ currency, value: per((d) => d.exposure, currency) }));
  body.resource = { ...body.resource, label: spec.label };
  const rows = spec.deployments.map((d) => ({ deployment_id: d.id, strategy_id: id, account_id: d.accountId, mode: mode[d.environment], venue: d.venue, currency: d.currency, portfolio_id: d.portfolioId,
    state: d.active ? "ACTIVE" : "ENDED", active: d.active, updated_at: alpha.updated_at, updated_at_ms: alpha.updated_at_ms, profile_environment: d.environment }));
  body.data.deployments = rows;
  if (body.panels?.deployments) {
    body.panels.deployments.data = { rows };
    body.panels.deployments.coverage = { ...body.panels.deployments.coverage, source_total: String(rows.length), filtered_total: String(rows.length), returned_count: rows.length };
  }
  const first = spec.deployments.find((d) => d.stage === "LIVE" && d.active) ?? spec.deployments[0]!;
  for (const key of ["positions", "reconciliation"]) {
    const list = body.data[key];
    if (Array.isArray(list)) for (const row of list) { row.deployment_id = first.id; row.account_id = first.accountId; }
  }
  return { status: base.status, body };
}
// ===== WP-C end

// ===== WP-K begin (contracts lane: ALPHA subjects and the DRAWDOWN series, FIXTURE_LAB, register section 2k)
// Touches in shared functions (one expression each): seriesAnswer (template file, alpha book lookup, ratio test, NAV walk for a drawdown, one call after
// wpcShapeSeries), wpcTarget / wpcShapeSeries (optional grain parameter `by`, default unchanged).
const wpkRatio = (metric: string): boolean => metric === "RETURN" || metric === "DRAWDOWN";
const wpkTemplateFile = (metric: string): string => metric === "RETURN" ? "execution-manager-series.return.synthetic.valid.json"
  : metric === "DRAWDOWN" ? "execution-manager-series.drawdown.synthetic.valid.json" : "execution-manager-series.populated.synthetic.valid.json";
/** The two alpha ids the published canonical fixtures name (small lane). */
const TEST_ONLY_ALPHAS = new Set(["TEST_ONLY:alpha-a", "TEST_ONLY:alpha-b"]);
/** The book of one alpha in this environment: its currency is its deployment's. `null` for an alpha the universe does not hold. */
function wpkAlphaBook(alphaId: string, environment: string): { id: string; base: string } | null {
  const alphas = [...scaled().alphas, ...WPC_ALPHAS];
  const alpha = alphas.find((candidate) => candidate.id === alphaId);
  if (alpha === undefined) return TEST_ONLY_ALPHAS.has(alphaId) ? { id: alphaId, base: "USDT" } : null;
  const deployment = alpha.deployments.find((candidate) => candidate.environment === environment);
  return deployment === undefined ? null : { id: alphaId, base: deployment.currency };
}
/**
 * Peak-to-trough drawdown of the entry's own NAV values: (value - running peak) / running peak, 8 places truncated toward zero, so it is zero at a
 * new high and never above zero. Bigint only. Derived from FIXTURE_LAB NAV values, never a source fact; a non-positive peak is undefined and
 * leaves the point at a true zero (no ratio is invented).
 */
function wpkDrawdownFromNav(entry: Draft): void {
  let peak: bigint | null = null;
  for (const point of entry.points) {
    const value = toScaled(point.value);
    if (peak === null || value > peak) peak = value;
    const ratio = peak !== null && peak > 0n ? (value - peak) * 100_000_000n / peak : 0n;
    point.value = ratio === 0n ? "0" : trimmed(ratio, 8);
  }
}

/* ---- Approval evidence (slice 2): `GET /governance/approvals/{id}/evidence`, FIXTURE_LAB. Deterministic per approval id (FNV digest); nothing here is a
 * source fact. The history is the review lane's own NAV series of a native portfolio (so the panel draws what the Compare overlay draws), the
 * counts are small integers with true zeros, and some ids answer null (source not read) or omit a section (no owning source). */
function wpkApprovalEvidence(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse | null {
  const match = /^\/governance\/approvals\/([A-Za-z0-9._:-]{1,191})\/evidence$/.exec(path);
  if (match === null || method !== "GET") return null;
  const approvalId = match[1]!;
  const seed = seedOf(approvalId, "wpk-evidence");
  const now = fixtureNowMs();
  const body: Draft = { schema_version: "portal.execution.approval-evidence.v1", workspace_id: search.get("workspace_id") ?? "ws_FIXTURE_LAB", approval_id: approvalId,
    record_authority: "PORTAL_PROJECTION", read_at_ms: now };
  const mode = seed % 7; // 0: nothing read (null); 1: no owning source (omitted); else published
  if (mode === 1) return { status: 200, body };
  if (mode === 0) {
    Object.assign(body, { prior_economic_history: null, evidence_diff: null, obligations_after_approval: null, receipt_preview: null });
    return { status: 200, body };
  }
  const subject = ["pf_TEST_ONLY_satellite", "pf_TEST_ONLY_core"][seed % 2]!;
  const environment = subject === "pf_TEST_ONLY_core" ? "live" : "paper";
  const query = new URLSearchParams({ environment, metric: "NAV", window: JSON.stringify("90D"), subjects: JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: subject }]) });
  const series = seriesAnswer("GET", "/manager/series", query, profile);
  const entry = series?.status === 200 ? (series.body as Draft).series[0] : null;
  body.prior_economic_history = entry && entry.state === "AVAILABLE" ? { subject: { subject_type: "PORTFOLIO", subject_id: subject }, metric: "NAV", unit: entry.unit,
    currency: entry.currency, ratio_scale: null, window: entry.window, methodology_ref: entry.methodology_ref, points: entry.points, as_of_ms: (series!.body as Draft).as_of_ms } : null;
  const n = (k: number, max: number): number => (seed >>> k) % max; // small integers; a true 0 is common
  body.evidence_diff = { previous_revision: `FIXTURE_LAB:revision-${1 + n(3, 6)}`, changes: [
    { label: "Requested capital", before: `${10_000 + n(5, 5) * 1000}.00`, after: `${16_000 + n(7, 5) * 1000}.00`, unit: "MONEY" },
    { label: "Criteria met", before: String(5 + n(9, 2)), after: "7", unit: "COUNT" },
    { label: "Reviewer note", before: null, after: "Added", unit: "TEXT" }] };
  body.obligations_after_approval = { open_positions: n(2, 4), working_orders: n(4, 3) === 2 ? 0 : n(4, 3), reservations: n(6, 2), unknown_outcomes: 0, settlement_pending: n(8, 3) === 0 ? 1 : 0 };
  const total = Object.values(body.obligations_after_approval as Record<string, number>).reduce((sum, value) => sum + value, 0);
  body.receipt_preview = { what_changes: `Allocation changes on ${subject}; the gate counts 7 of 7 criteria as met after approval. ${total === 0 ? "Nothing stays open." : `${total} obligations stay open.`}`,
    counts_as: { met_after: 7, required: 7 } };
  return { status: 200, body };
}

/* ---- Alpha lifecycle (slice 5): `GET /alphas/{id}/lifecycle`, FIXTURE_LAB. The stage instants, days, actors, events and the regime fit are the SAME
 * derivation the WP-C open keys use (`wpcLifecycleKeys`), restated in the published shape; the criteria counts have no observed values (items stay empty:
 * no observed figure is invented); Net PnL per venue is the exact decimal sum of the alpha's own deployments in that venue and currency. */
function wpkAlphaLifecycle(method: string, path: string, search: URLSearchParams): ReviewManagerResponse | null {
  const match = /^\/alphas\/([A-Za-z0-9._:-]{1,191})\/lifecycle$/.exec(path);
  if (match === null || method !== "GET") return null;
  const alphaId = match[1]!;
  const alpha = [...scaled().alphas, ...WPC_ALPHAS].find((candidate) => candidate.id === alphaId);
  if (alpha === undefined) return problem(404, "EXECUTION_READ_NOT_AVAILABLE", "The requested Execution read is not available.");
  const now = fixtureNowMs();
  const keys = wpcLifecycleKeys(alphaId, {});
  const num = (key: string): number | null => { const metric = keys[key]; return metric && metric.availability === "AVAILABLE" ? Number(metric.value) : null; };
  const who = (key: string): string | null => keys[key]?.reason_code ?? null;
  const receipt = (stage: string): string => `FIXTURE_LAB:receipt-${alphaId}-${stage}`;
  const day = 86_400_000;
  const row = (stage: string, exit: number | null, days: number | null, entered: number | null, criteria: boolean, state: string, extra: Draft = {}): Draft => ({
    stage, state, entered_at_ms: entered, exited_at_ms: exit, days_in_stage: days,
    criteria: criteria ? { met: num(`life_${stage.toLowerCase()}_criteria_met`) ?? 0, total: num(`life_${stage.toLowerCase()}_criteria_total`) ?? 0, items: [] } : null,
    decider_role: "Manager", decided_by: who(`life_${stage.toLowerCase()}_exit_ms`), receipt_ref: exit === null ? null : receipt(stage.toLowerCase()), blocked_reason: null, ...extra });
  const exit = (stage: string): number | null => num(`life_${stage}_exit_ms`);
  const days = (stage: string): number | null => num(`life_${stage}_days`);
  const from = (stage: string): number | null => { const to = exit(stage); const d = days(stage); return to === null || d === null ? null : to - d * day; };
  const stages = [
    row("R1", exit("r1"), null, null, false, "DONE"), row("R2", exit("r2"), null, null, false, "DONE"),
    row("PAPER", exit("paper"), days("paper"), from("paper"), true, "DONE"), row("SANDBOX", exit("sandbox"), days("sandbox"), from("sandbox"), true, "DONE"),
    row("CANARY", exit("canary"), days("canary"), from("canary"), true, "DONE"),
    row("LIVE", null, days("live"), exit("canary"), false, "CURRENT", { decided_by: null, receipt_ref: null, decider_role: who("life_live_decider"), blocked_reason: who("life_blocked_reason") })];
  const kinds = ["stage", "decision", "incident", "recall", "flow"] as const;
  const items: Draft[] = [];
  for (const [key, metric] of Object.entries(keys)) {
    const m = /^evt_(stage|decision|incident|recall|flow)_(\d+)_ms$/.exec(key);
    if (m === null || metric.availability !== "AVAILABLE") continue;
    const [title, actor] = String(metric.reason_code).split("|");
    items.push({ event_id: `FIXTURE_LAB:${alphaId}:${key}`, kind: m[1], at_ms: Number(metric.value), title, actor: actor && actor !== "system" ? actor : null,
      receipt_ref: m[1] === "decision" ? receipt(`${key}`) : null });
  }
  items.sort((x, y) => x.at_ms - y.at_ms || x.event_id.localeCompare(y.event_id));
  void kinds;
  const fit = keys.regime_fit;
  const regime = fit && fit.availability === "AVAILABLE" ? { state: "PUBLISHED", ratio_scale: "FRACTION", value: fit.value, reason_code: null }
    : { state: "NOT_PUBLISHED", ratio_scale: null, value: null, reason_code: "INSUFFICIENT_DATA" };
  const environment = search.get("environment");
  const books = new Map<string, Draft>();
  for (const dep of alpha.deployments.filter((candidate) => environment === null || candidate.environment === environment)) {
    const key = `${dep.venue}|${dep.environment}|${dep.currency}`;
    const net = addDecimal(dep.realized, dep.unrealized);
    const have = books.get(key);
    books.set(key, have ? { ...have, net_pnl: addDecimal(have.net_pnl, net) }
      : { venue: dep.venue, economic_domain: dep.environment === "live" ? "ACTUAL" : dep.environment.toUpperCase(), currency: dep.currency, net_pnl: net, as_of_ms: now });
  }
  const body: Draft = { schema_version: "portal.execution.alpha-lifecycle.v1", workspace_id: search.get("workspace_id") ?? "ws_FIXTURE_LAB", alpha_id: alphaId, alpha_version_id: null,
    record_authority: "PORTAL_PROJECTION", read_at_ms: now, stages, events: { total: items.length, truncated: false, items }, regime_fit: regime, venue_net_pnl: [...books.values()] };
  return { status: 200, body };
}

/* ---- Operations extras (slice 3): `GET /operations/incidents/{id}/children` and `GET /operations/audit`, FIXTURE_LAB. Deterministic per id (FNV digest).
 * The audit rows are the loaded universe's operations: created at the operation's own time, acknowledged and resolved at stated offsets after it (the
 * triage state decides which exist), by one of three actors from the digest; every acknowledgement and resolution carries `FIXTURE_LAB:receipt-...`. */
const WPK_ACTORS = ["bjones", "asmith", "lnguyen"] as const;
function wpkOperationsExtras(method: string, path: string, search: URLSearchParams): ReviewManagerResponse | null {
  if (method !== "GET") return null;
  const now = fixtureNowMs();
  const workspace = search.get("workspace_id") ?? "ws_FIXTURE_LAB";
  const children = /^\/operations\/incidents\/([A-Za-z0-9._:-]{1,191})\/children$/.exec(path);
  if (children !== null) {
    const incidentId = children[1]!;
    const seed = seedOf(incidentId, "wpk-children");
    const body: Draft = { schema_version: "portal.execution.incident-children.v1", workspace_id: workspace, incident_id: incidentId, record_authority: "PORTAL_PROJECTION", read_at_ms: now };
    const mode = seed % 6; // 0: not read (null); 1: no owning source (omitted); else published
    if (mode === 1) return { status: 200, body };
    if (mode === 0) { Object.assign(body, { evidence: null, assigned_to: null, resolution_gate: null, timeline: null, linked_operations: null }); return { status: 200, body }; }
    const hour = 3_600_000;
    const sources = ["FINDING", "ALERT", "DEAD_LETTER", "ORDER_TRACE"] as const;
    body.evidence = sources.flatMap((source, i) => Array.from({ length: (seed >>> (i * 3)) % 3 }, (_, n) => ({ source, digest: digest([incidentId, source, n]), label: `${source.replace("_", " ").toLowerCase()} ${n + 1}`, added_at_ms: now - (6 - i + n) * hour })));
    body.assigned_to = seed % 2 === 0 ? { actor: WPK_ACTORS[seed % 3], assigned_at_ms: now - 5 * hour } : null;
    const blockers = [...(body.evidence.some((e: Draft) => e.source === "DEAD_LETTER") ? ["OPEN_DEAD_LETTER"] : []), ...(seed % 5 === 0 ? ["UNVERIFIED_ORDER_TRACE"] : [])];
    body.resolution_gate = { eligible: blockers.length === 0, blocker_codes: blockers };
    body.timeline = [{ event_id: `FIXTURE_LAB:${incidentId}:1`, action: "OPENED", actor: null, version_before: null, version_after: 1, at_ms: now - 8 * hour },
      { event_id: `FIXTURE_LAB:${incidentId}:2`, action: "ACKNOWLEDGED", actor: WPK_ACTORS[(seed >>> 4) % 3], version_before: 1, version_after: 2, at_ms: now - 7 * hour }];
    const ops = scaled().operations;
    body.linked_operations = ops.length === 0 ? [] : Array.from({ length: 1 + (seed % 3) }, (_, n) => ops[(seed + n * 7) % ops.length]!).filter((op, i, all) => all.findIndex((x) => x.id === op.id) === i)
      .map((op, n) => ({ operation_id: op.id, original_target: n % 4 === 3 ? null : { type: op.target[0], id: op.target[1] } }));
    return { status: 200, body };
  }
  if (path === "/operations/audit") {
    const incident = search.get("incident_id");
    const limit = Math.min(250, Math.max(1, Number(search.get("limit") ?? 100)));
    const after = search.get("after");
    const start = after === null ? 0 : Number.parseInt(after.replace(/^FIXTURE_LAB:cursor:/, ""), 10);
    if (!Number.isInteger(start) || start < 0) return problem(400, "EXECUTION_READ_QUERY_INVALID", "The audit cursor is not one this feed issued.");
    const rows: Draft[] = [];
    for (const op of scaled().operations) {
      if (incident !== null && seedOf(incident, op.id) % 4 !== 0) continue;
      const created = Date.parse(op.at);
      if (!Number.isFinite(created)) continue;
      const actor = WPK_ACTORS[seedOf(op.id, "actor") % 3]!;
      const subject = { type: "OPERATION", id: op.id };
      rows.push({ audit_id: `FIXTURE_LAB:${op.id}:created`, at_ms: created, actor, action: "CREATED", subject, receipt_ref: null });
      if (op.triage !== "UNACKNOWLEDGED") rows.push({ audit_id: `FIXTURE_LAB:${op.id}:ack`, at_ms: created + 5 * 60_000, actor, action: "ACKNOWLEDGED", subject, receipt_ref: `FIXTURE_LAB:receipt-${op.id}-ack`, policy_revision: "FIXTURE_LAB:policy-4" });
      if (op.triage === "RESOLVED") rows.push({ audit_id: `FIXTURE_LAB:${op.id}:resolved`, at_ms: created + 60 * 60_000, actor, action: "RESOLVED", subject, receipt_ref: `FIXTURE_LAB:receipt-${op.id}-resolved` });
    }
    rows.sort((x, y) => y.at_ms - x.at_ms || x.audit_id.localeCompare(y.audit_id));
    const items = rows.slice(start, start + limit);
    const more = start + limit < rows.length;
    return { status: 200, body: { schema_version: "portal.execution.operations-audit.v1", workspace_id: workspace, record_authority: "PORTAL_PROJECTION", read_at_ms: now,
      items, has_more: more, next_cursor: more ? `FIXTURE_LAB:cursor:${start + limit}` : null } };
  }
  return null;
}

/* ---- Entity search (slice 7): `GET /search`, FIXTURE_LAB. A case-insensitive contains-match on id and label over what the loaded universe holds, per kind, capped at
 * `limit`; `total_matched` is the exact number of matches for the kinds counted here (alpha, portfolio, operation, approval) and null for the kinds with no list in
 * this lane (account, incident). The lane serves every entity to every caller (no authorization model here): the real producer must scope. */
function wpkEntitySearch(method: string, path: string, search: URLSearchParams): ReviewManagerResponse | null {
  if (method !== "GET" || path !== "/search") return null;
  const q = (search.get("q") ?? "").trim();
  if (q.length < 1 || q.length > 128) return problem(400, "EXECUTION_READ_QUERY_INVALID", "The search text is 1 to 128 printable characters.");
  const all = ["alpha", "portfolio", "account", "operation", "incident", "approval"] as const;
  const kinds = search.get("kinds") === null ? [...all] : search.get("kinds")!.split(",").filter((k): k is (typeof all)[number] => (all as readonly string[]).includes(k));
  if (kinds.length < 1 || new Set(kinds).size !== kinds.length) return problem(400, "EXECUTION_READ_QUERY_INVALID", "kinds is a comma-separated subset of the six kinds.");
  const limit = Math.min(50, Math.max(1, Number(search.get("limit") ?? 8)));
  const needle = q.toLowerCase();
  const universe = scaled();
  const pools: Record<string, { id: string; label: string; detail: string | null; route: string }[] | null> = {
    alpha: [...universe.alphas, ...WPC_ALPHAS].map((a) => ({ id: a.id, label: a.label, detail: `v${a.version}`, route: `/deployments/alphas/${encodeURIComponent(a.id)}` })),
    portfolio: universe.portfolios.map((p) => ({ id: p.id, label: p.name, detail: p.base, route: `/deployments/portfolios/${encodeURIComponent(p.id)}` })),
    operation: universe.operations.map((o) => ({ id: o.id, label: o.command, detail: o.env, route: `/operations?operation=${encodeURIComponent(o.id)}` })),
    approval: universe.approvals.map((a: Draft) => ({ id: String(a.id), label: String(a.subject ?? a.id), detail: a.gate ? String(a.gate) : null, route: `/approvals?sel=${encodeURIComponent(String(a.id))}` })),
    account: null, incident: null,
  };
  const groups = kinds.map((kind) => {
    const pool = pools[kind];
    if (pool === null || pool === undefined) return { kind, total_matched: null, rows: [] };
    const hits = pool.filter((row) => /^[A-Za-z0-9._:-]{1,191}$/.test(row.id) && (row.id.toLowerCase().includes(needle) || row.label.toLowerCase().includes(needle)));
    return { kind, total_matched: hits.length, rows: hits.slice(0, limit).map((row) => ({ kind, id: row.id, label: row.label, detail: row.detail, route_hint: row.route })) };
  });
  return { status: 200, body: { schema_version: "portal.execution.entity-search.v1", workspace_id: search.get("workspace_id") ?? "ws_FIXTURE_LAB", record_authority: "PORTAL_PROJECTION", read_at_ms: fixtureNowMs(),
    query: { q, kinds, limit }, groups } };
}

/* ---- Group sort and filter (slice 6): `group_sort` / `group_filters` on the dataset, FIXTURE_LAB. The same semantics the control-api applies
 * (`applyGroupQuery`): a metric is read in the pinned partition, else in the group's only partition (several partitions = no comparable value);
 * decimals compare exactly (bigint); null sorts last in both directions and fails GTE / LTE; IS_NULL keeps exactly the null ones. */
function wpkGroupQuery(body: Draft, search: URLSearchParams, groupFields: string[]): ReviewManagerResponse | null {
  if (!search.has("group_sort") && !search.has("group_filters")) return null;
  const bad = (message: string): ReviewManagerResponse => problem(400, "EXECUTION_READ_QUERY_INVALID", message);
  let sort: Draft[]; let filters: Draft[];
  try { sort = JSON.parse(search.get("group_sort") ?? "[]"); filters = JSON.parse(search.get("group_filters") ?? "[]"); } catch { return bad("group_sort and group_filters are JSON arrays."); }
  const key = /^[a-z][a-z0-9_]{1,63}$/, decimalText = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
  if (!Array.isArray(sort) || !Array.isArray(filters) || sort.length > 1 || filters.length > 8 || groupFields.length === 0 || search.get("environment") === "ALL") return bad("A group query needs group_by, one environment, at most one sort and eight filters.");
  if (sort.some((o) => Object.keys(o ?? {}).sort().join(",") !== "direction,metric_key" || !key.test(o.metric_key) || !["asc", "desc"].includes(o.direction))) return bad("group_sort is [{metric_key, direction}].");
  if (filters.some((f) => !f || typeof f !== "object" || !key.test(f.metric_key) || !["GTE", "LTE", "IS_NULL"].includes(f.op)
    || Object.keys(f).sort().join(",") !== (f.op === "IS_NULL" ? "metric_key,op" : "metric_key,op,value") || (f.op !== "IS_NULL" && !decimalText.test(String(f.value))))) return bad("group_filters are [{metric_key, op GTE|LTE|IS_NULL, value}] with an exact decimal value.");
  if (new Set(filters.map((f) => `${f.metric_key}:${f.op}`)).size !== filters.length) return bad("A group filter occurs once per operator.");
  const pinned = search.has("economic_partition") ? JSON.parse(search.get("economic_partition")!) : null;
  const valueOf = (group: Draft, metricKey: string): bigint | null => {
    const pool = pinned === null ? group.economic_partitions
      : group.economic_partitions.filter((entry: Draft) => ["economic_domain", "currency", "basis", "native_profile_ref"].every((field) => entry.partition[field] === pinned[field]));
    if (pool.length !== 1) return null;
    const m = pool[0].metrics[metricKey];
    return m && m.availability === "AVAILABLE" && typeof m.value === "string" && decimalText.test(m.value) ? toScaled(m.value) : null;
  };
  const before = body.groups.length;
  let kept = (body.groups as Draft[]).filter((group) => filters.every((f) => {
    const v = valueOf(group, f.metric_key);
    if (f.op === "IS_NULL") return v === null;
    if (v === null) return false;
    return f.op === "GTE" ? v >= toScaled(f.value) : v <= toScaled(f.value);
  }));
  if (sort[0]) {
    const { metric_key: metricKey, direction } = sort[0];
    kept = [...kept].sort((a, b) => {
      const x = valueOf(a, metricKey), y = valueOf(b, metricKey);
      const tie = JSON.stringify(a.key) < JSON.stringify(b.key) ? -1 : 1;
      if (x === null || y === null) return x === y ? tie : x === null ? 1 : -1;
      return x === y ? tie : (x < y ? -1 : 1) * (direction === "asc" ? 1 : -1);
    });
  }
  body.groups = kept;
  body.group_query = { sort, filters, partition_basis: pinned === null ? "SINGLE_PARTITION_ONLY" : "PINNED_PARTITION", groups_before_filter: before, groups_returned: kept.length };
  return null;
}

/* ---- Portfolio health roll-up (slice 6, N3): `GET /portfolios` with `health` on each item, FIXTURE_LAB. The worst class among the portfolio's deployments in the
 * review universe (HALTED state, else FINDING = DEGRADED, ATTENTION, READY = HEALTHY), with the counts. A portfolio the universe holds no deployment of, or
 * whose deployments outnumber the list's own `deployment_count` (two sources disagree), is NOT_PUBLISHED with a reason, never a default of HEALTHY. */
function wpkPortfolioHealth(method: string, path: string, search: URLSearchParams): ReviewManagerResponse | null {
  if (method !== "GET" || path !== "/portfolios") return null;
  const base = answerPortfolios("GET", "/portfolios", search);
  if (base === null || base.status !== 200) return base;
  const body = copy(base.body) as Draft;
  if (!Array.isArray(body.items)) return base;
  const deployments = [...scaled().alphas, ...WPC_ALPHAS].flatMap((alpha) => alpha.deployments);
  const order = ["HEALTHY", "ATTENTION", "DEGRADED", "HALTED"] as const;
  const now = new Date(fixtureNowMs()).toISOString().replace(/\.\d+Z$/, "Z");
  for (const item of body.items as Draft[]) {
    const mine = deployments.filter((dep) => dep.portfolioId === item.portfolio_id);
    const counts: Record<(typeof order)[number], number> = { HEALTHY: 0, ATTENTION: 0, DEGRADED: 0, HALTED: 0 };
    for (const dep of mine) counts[dep.state === "HALTED" ? "HALTED" : dep.health === "FINDING" ? "DEGRADED" : dep.health === "ATTENTION" ? "ATTENTION" : "HEALTHY"] += 1;
    const total = mine.length;
    const worst = [...order].reverse().find((key) => counts[key] > 0);
    item.health = total === 0 || worst === undefined ? { state: "NOT_PUBLISHED", value: null, basis: null, deployments_by_health: null, as_of: null, reason_code: "DEPLOYMENT_HEALTH_NOT_PUBLISHED" }
      : total > item.deployment_count ? { state: "NOT_PUBLISHED", value: null, basis: null, deployments_by_health: null, as_of: null, reason_code: "DEPLOYMENT_COUNT_MISMATCH" }
        : { state: "PUBLISHED", value: worst, basis: "WORST_OF_DEPLOYMENT_HEALTH", deployments_by_health: counts, as_of: now, reason_code: null };
    // GAP-17 / GAP-19 (FIXTURE_LAB): one capital root for the review universe; the owner's Portal user id is a digest of the owner text, null for a portfolio with no owner.
    item.root_id = "FIXTURE_LAB:root-1";
    item.owner_user_id = item.owner === null ? null : `FIXTURE_LAB:user-${seedOf(item.owner, "wpk-owner") % 5 + 1}`;
  }
  return { status: 200, body };
}


/* ---- Sibling reads (second pass, GAP-3 4 5 6 7 9 11 12 13 14 15 16), FIXTURE_LAB. Each answer is deterministic per id (FNV digest) and follows the slice-2 rule:
 * about one id in seven answers every section null (source not read), one in seven omits them (no owning source), the rest publish. Registered in the
 * register section 2k2. Only the visit digest is stateful: the baseline is kept per workspace in this process (the "server" of the fixture). */
const wpkBaselines = new Map<string, { set_at_ms: number; set_by: string; cut_revision: string }>();
const WPK_USER = "FIXTURE_LAB:user";
function wpkDigest(workspace: string): Draft {
  const now = fixtureNowMs();
  const alpha = WPC_ALPHAS[2]!;
  const keys = wpcLifecycleKeys(alpha.id, {});
  const kindOf: Record<string, string> = { stage: "STAGE_CHANGED", decision: "APPROVAL_DECIDED", incident: "INCIDENT_OPENED", recall: "RECALL", flow: "CAPITAL_COMMAND" };
  const items: Draft[] = [];
  for (const [key, metric] of Object.entries(keys)) {
    const m = /^evt_(stage|decision|incident|recall|flow)_(\d+)_ms$/.exec(key);
    if (m === null || metric.availability !== "AVAILABLE") continue;
    // The events are placed in the last 36 hours before FIXTURE_NOW, newest by key order, so a baseline set "a while ago" has some before and some after.
    const age = (seedOf(alpha.id, key, "wpk-digest") % 36) * 3_600_000 + 60_000;
    items.push({ item_id: `FIXTURE_LAB:${key}`, kind: kindOf[m[1]!], at_ms: now - age, title: String(metric.reason_code).split("|")[0], subject: { type: "ALPHA", id: alpha.id } });
  }
  for (const op of scaled().operations.filter((o) => o.source === "FAILED").slice(0, 3))
    items.push({ item_id: `FIXTURE_LAB:${op.id}`, kind: "OPERATION_FAILED", at_ms: now - (seedOf(op.id, "wpk-digest") % 30) * 3_600_000 - 120_000, title: op.command, subject: { type: "OPERATION", id: op.id } });
  items.sort((a, b) => b.at_ms - a.at_ms || a.item_id.localeCompare(b.item_id));
  const shown = items.slice(0, 24);
  const baseline = wpkBaselines.get(workspace) ?? null;
  const rows = shown.map((item) => ({ ...item, since_baseline: baseline === null ? true : item.at_ms > baseline.set_at_ms }));
  const kinds = ["APPROVAL_DECIDED", "INCIDENT_OPENED", "OPERATION_FAILED", "STAGE_CHANGED", "RECALL", "CAPITAL_COMMAND", "ACCESS_CHANGED"];
  return { schema_version: "portal.execution.visit-digest.v1", workspace_id: workspace, record_authority: "PORTAL_PROJECTION", read_at_ms: now, user_id: WPK_USER, baseline,
    current_cut: { as_of_ms: now, revision: digest(["FIXTURE_LAB:cut", workspace, shown.map((i) => i.item_id), now]) }, items: rows,
    counts_by_kind: kinds.flatMap((kind) => { const count = rows.filter((r) => r.since_baseline && r.kind === kind).length; return count > 0 ? [{ kind, count }] : []; }) };
}
function wpkSiblings(method: string, path: string, search: URLSearchParams, requestBody: unknown): ReviewManagerResponse | null {
  const now = fixtureNowMs();
  const workspace = search.get("workspace_id") ?? "ws_FIXTURE_LAB";
  const head = (name: string): Draft => ({ schema_version: `portal.execution.${name}.v1`, workspace_id: workspace, record_authority: "PORTAL_PROJECTION", read_at_ms: now });
  const ID = /^[A-Za-z0-9._:-]{1,191}$/;
  const subject = (fallbackType: string, fallbackId: string): { type: string; id: string } | null => {
    const type = search.get("subject_type") ?? fallbackType, id = search.get("subject_id") ?? fallbackId;
    return ID.test(id) && ["ALPHA", "PORTFOLIO", "ACCOUNT", "DEPLOYMENT", "OPERATION", "INCIDENT", "APPROVAL"].includes(type) ? { type, id } : null;
  };
  /** 0: every section null (not read); 1: every section omitted (no source); else published. */
  const mode = (...parts: unknown[]): "null" | "omit" | "ok" => { const m = seedOf(...parts, "wpk-sib") % 7; return m === 0 ? "null" : m === 1 ? "omit" : "ok"; };
  const sections = (body: Draft, keys: string[], m: "null" | "omit" | "ok", fill: () => Draft): Draft => { if (m === "null") for (const k of keys) body[k] = null; else if (m === "ok") Object.assign(body, fill()); return body; };
  const invalid = problem(400, "EXECUTION_READ_QUERY_INVALID", "The query names an id or a type this read does not accept.");
  const ok = (body: Draft): ReviewManagerResponse => ({ status: 200, body });
  const T = (n: number): number => now - n * 3_600_000;

  const order = /^\/orders\/([A-Za-z0-9._:-]{1,191})\/detail$/.exec(path);
  if (order !== null && method === "GET") {
    // GAP-10. The fee rule: never defaulted to 0. An order without fills has no fee (NO_FILLS); fills in two currencies leave no single fee (MIXED_FEE_CURRENCIES); a fill
    // without a commission leaves none either; otherwise the fee is the exact sum of the fills' commissions in their one currency.
    const orderId = order[1]!, seed = seedOf(orderId, "wpk-order"), m = mode(orderId);
    const body: Draft = { ...head("order-detail"), order_id: orderId };
    if (m === "null") { body.deployment_id = null; body.filled_quantity = null; body.average_fill_price = null; body.fee = null; body.fee_absence = null; body.ack_latency_ms = null; body.intent = null; return ok(body); }
    if (m === "omit") return ok(body);
    body.deployment_id = `FIXTURE_LAB:dep-${1 + seed % 6}`;
    const kind = seed % 5; // 0: no fills, 1: mixed currencies, 2: a fill without commission, else a clean fee
    if (kind === 0) { body.filled_quantity = "0"; body.fee_absence = "NO_FILLS"; }
    else {
      body.filled_quantity = decimal(BigInt(1 + seed % 90), 2);
      body.average_fill_price = decimal(BigInt(6_700_000 + seed % 40_000), 2);
      if (kind === 1) body.fee_absence = "MIXED_FEE_CURRENCIES"; else if (kind === 2) body.fee_absence = "FILL_WITHOUT_COMMISSION";
      else body.fee = { currency: "USDT", value: decimal(BigInt(10 + seed % 900), 2) };
    }
    if (kind !== 0 || seed % 2 === 0) body.ack_latency_ms = 8 + seed % 120;
    body.intent = { intent_id: `FIXTURE_LAB:intent-${orderId}`, idempotency_scope: seed % 2 === 0 ? "ACTOR_REQUEST_KEY" : "WORKSPACE_REQUEST_KEY" };
    return ok(body);
  }
  if (path === "/blotter/summary" && method === "GET") {
    const environment = search.get("environment") ?? "paper";
    if (!["paper", "sandbox", "live"].includes(environment)) return invalid;
    const scope = search.get("deployment_id") ?? "all";
    if (scope !== "all" && !ID.test(scope)) return invalid;
    const seed = seedOf(environment, scope, "wpk-blotter"), m = mode(environment, scope);
    const body: Draft = { ...head("blotter-summary"), environment };
    return ok(sections(body, ["status_buckets", "funnel"], m, () => {
      const submitted = 40 + seed % 400, granted = submitted - seed % 7, acknowledged = granted - (seed >>> 3) % 5, filled = acknowledged - (seed >>> 6) % 30;
      const rest = acknowledged - filled;
      return { funnel: { submitted, risk_granted: granted, venue_acknowledged: acknowledged, filled },
        status_buckets: [{ bucket: "WORKING", count: Math.min(rest, 1 + seed % 6) }, { bucket: "CONDITIONAL", count: seed % 3 === 0 ? 0 : seed % 4 }, { bucket: "PARTIAL", count: seed % 5 },
          { bucket: "CANCELLED", count: Math.max(0, rest - 2) }, { bucket: "REJECTED", count: submitted - granted }, { bucket: "FILLED", count: filled }] };
    }));
  }
  const receipt = /^\/commands\/([A-Za-z0-9._:-]{1,191})\/receipt$/.exec(path);
  if (receipt !== null && method === "GET") {
    // GAP-2: the positive receipt. The pinned F0 denial is untouched; this is the sibling that carries the applied case. FIXTURE_LAB: one operation in four is denied.
    const operationId = receipt[1]!, seed = seedOf(operationId, "wpk-receipt");
    const state = (["APPLIED", "VERIFIED", "VERIFIED", "DENIED"] as const)[seed % 4]!;
    const body: Draft = { ...head("command-receipt"), operation_id: operationId, command_key: "allocation/increase", request_key: `FIXTURE_LAB:req-${operationId}`, state,
      side_effect: state === "DENIED" ? { source_request_sent: false, relay: "DISABLED" } : { source_request_sent: true, relay: "RELAYED" } };
    if (state !== "DENIED") body.receipt = { receipt_ref: `FIXTURE_LAB:receipt-${operationId}`, content_hash: digest(["FIXTURE_LAB:receipt", operationId]), issued_at_ms: T(2), issued_by: WPK_ACTORS[seed % 3]!,
      what_changes: "Allocation changes as the request stated; nothing else.", verification: state === "VERIFIED" ? { result: "SUCCEEDED", verified_at_ms: T(1) } : { result: "PENDING", verified_at_ms: null } };
    return ok(body);
  }
  if (path === "/digest" && method === "GET") return ok(wpkDigest(workspace));
  if (path === "/digest/baseline" && method === "POST") {
    const b = requestBody as Draft;
    if (!b || typeof b !== "object" || Object.keys(b).sort().join(",") !== "cut_revision,workspace_id" || typeof b.workspace_id !== "string" || !/^sha256:[a-f0-9]{64}$/.test(String(b.cut_revision))) return invalid;
    const current = wpkDigest(b.workspace_id);
    // The cut moves with the clock; a cut the server no longer holds is a conflict, never a silent move to a different cut.
    if (current.current_cut.revision !== b.cut_revision) return problem(409, "EXECUTION_READ_NOT_AVAILABLE", "The cut changed since it was read; read the digest again.");
    wpkBaselines.set(b.workspace_id, { set_at_ms: now, set_by: WPK_USER, cut_revision: b.cut_revision });
    return ok(wpkDigest(b.workspace_id));
  }
  if (method !== "GET") return null;

  if (path === "/controls") {
    const type = search.get("scope_type") ?? "WORKSPACE", id = search.get("scope_id") ?? workspace;
    if (!ID.test(id) || !["WORKSPACE", "PORTFOLIO", "ACCOUNT", "DEPLOYMENT"].includes(type)) return invalid;
    const seed = seedOf(type, id, "wpk-controls"), m = mode(type, id);
    return ok(sections(head("controls"), ["locks", "trading_state"], m, () => {
      const locks = Array.from({ length: seed % 3 }, (_, i) => ({ lock_id: `FIXTURE_LAB:lock-${id}-${i + 1}`, scope: { type, id }, revision: 1 + (seed >>> (i + 3)) % 5, state: i === 0 ? "ACTIVE" : "RELEASED",
        set_at_ms: T(30 + i * 20), set_by: WPK_ACTORS[(seed + i) % 3]!, reason_code: i === 0 ? "RISK_REVIEW" : null }));
      const reducing = seed % 4 === 0;
      return { locks, trading_state: { state: reducing ? "REDUCING" : "ACTIVE", since_ms: T(reducing ? 3 : 48),
        history: reducing ? [{ state: "REDUCING", at_ms: T(3), actor: WPK_ACTORS[seed % 3]!, reason_code: "LIMIT_WARN" }, { state: "ACTIVE", at_ms: T(48), actor: null, reason_code: null }] : [{ state: "ACTIVE", at_ms: T(48), actor: null, reason_code: null }] } };
    }));
  }
  if (path === "/obligations") {
    const sub = subject("PORTFOLIO", "pf_TEST_ONLY_core"); if (sub === null) return invalid;
    const seed = seedOf(sub.type, sub.id, "wpk-ob"), m = mode(sub.type, sub.id);
    const kinds = ["OPEN_POSITION", "WORKING_ORDER", "RESERVATION", "UNKNOWN_OUTCOME", "SETTLEMENT_PENDING"] as const;
    return ok(sections({ ...head("obligations"), subject: sub }, ["items"], m, () => ({ items: Array.from({ length: seed % 5 }, (_, i) => {
      const kind = kinds[(seed + i) % kinds.length]!, unknown = kind === "UNKNOWN_OUTCOME";
      return { obligation_id: `FIXTURE_LAB:ob-${sub.id}-${i + 1}`, kind, state: unknown ? "RECOVERING" : "OPEN", recovery_id: unknown ? `FIXTURE_LAB:rec-${i + 1}` : null,
        order_id: kind === "WORKING_ORDER" || unknown ? `FIXTURE_LAB:ord-${i + 1}` : null, operation_id: unknown ? `FIXTURE_LAB:op-${i + 1}` : null, opened_at_ms: T(2 + i * 5) };
    }) })));
  }
  const members = /^\/portfolios\/([A-Za-z0-9._:-]{1,191})\/members$/.exec(path);
  if (members !== null) {
    const id = members[1]!, seed = seedOf(id, "wpk-members"), m = mode(id);
    const labels = ["Manager", "Researcher", "Viewer"];
    return ok(sections({ ...head("portfolio-members"), portfolio_id: id }, ["members"], m, () => ({ members: Array.from({ length: 1 + seed % 3 }, (_, i) => ({
      membership_id: `FIXTURE_LAB:m-${id}-${i + 1}`, user_id: `FIXTURE_LAB:user-${(seed + i) % 5 + 1}`, role_label: labels[i % 3]!, valid_from_ms: T(24 * 90), valid_until_ms: i === 2 ? T(24) : null, state: i === 2 ? "ENDED" : "ACTIVE" })) })));
  }
  const profile = /^\/accounts\/([A-Za-z0-9._:-]{1,191})\/profile$/.exec(path);
  if (profile !== null) {
    const id = profile[1]!, seed = seedOf(id, "wpk-profile"), m = mode(id);
    const usdt = seed % 4 !== 0;
    const cents = (n: number): string => `${Math.trunc(n / 100)}.${String(n % 100).padStart(2, "0")}`;
    return ok(sections({ ...head("account-profile"), account_id: id }, ["product", "network", "margin_mode", "margin_ratio", "wallet_balance", "native_equity"], m, () => ({
      product: usdt ? "USDT-M futures · hedge" : "Perpetual swap · net", network: { name: "MAINNET", proof_at_ms: now - 120_000 }, margin_mode: ["CROSS", "ISOLATED", "PORTFOLIO"][seed % 3]!,
      margin_ratio: { percent: cents(200 + seed % 900), as_of_ms: now }, wallet_balance: { currency: usdt ? "USDT" : "BTC", value: cents(4_000_000 + seed % 5_000_000), as_of_ms: now },
      native_equity: { currency: usdt ? "USDT" : "BTC", value: cents(4_000_000 + (seed >>> 5) % 5_000_000), as_of_ms: now } })));
  }
  if (path === "/readiness") {
    const environment = search.get("environment") ?? "paper";
    if (!["paper", "sandbox", "live"].includes(environment)) return invalid;
    const alphas = [...scaled().alphas, ...WPC_ALPHAS].filter((a) => a.deployments.some((d) => d.environment === environment));
    return ok({ ...head("alpha-readiness"), environment, items: alphas.slice(0, 200).map((a) => {
      const seed = seedOf(a.id, environment, "wpk-ready"), item: Draft = { alpha_id: a.id };
      if (seed % 11 !== 0) item.readiness = { met: seed % 8, total: 7 };
      if (seed % 13 !== 0) item.archive_state = seed % 17 === 0 ? "ARCHIVED" : seed % 9 === 0 ? "PAPER_WATCH" : "ACTIVE";
      return item;
    }) });
  }
  if (path === "/reconciliation") {
    const sub = subject("ACCOUNT", "acct_fixture"); if (sub === null) return invalid;
    const seed = seedOf(sub.type, sub.id, "wpk-rec"), m = mode(sub.type, sub.id);
    return ok(sections({ ...head("reconciliation"), subject: sub }, ["runs", "breaks"], m, () => {
      const open = seed % 3 === 0 ? 1 : 0;
      const runs = [{ run_id: `FIXTURE_LAB:run-${sub.id}-2`, state: open ? "BREAKS_FOUND" : "MATCHED", started_at_ms: T(1), finished_at_ms: T(1) + 60_000, breaks_open: open },
        { run_id: `FIXTURE_LAB:run-${sub.id}-1`, state: "MATCHED", started_at_ms: T(25), finished_at_ms: T(25) + 60_000, breaks_open: 0 }];
      return { runs, breaks: open ? [{ break_id: `FIXTURE_LAB:brk-${sub.id}-1`, run_id: runs[0]!.run_id, state: "OPEN", kind: ["POSITION", "BALANCE", "ORDER", "FILL"][seed % 4]!, resolution_revision: null, detected_at_ms: T(1) }] : [] };
    }));
  }
  if (path === "/limits") {
    const sub = subject("DEPLOYMENT", "dep_fixture"); if (sub === null) return invalid;
    const m = mode(sub.type, sub.id);
    const scopeType = sub.type === "PORTFOLIO" || sub.type === "ACCOUNT" || sub.type === "DEPLOYMENT" ? sub.type : "WORKSPACE";
    return ok(sections({ ...head("limits"), subject: sub }, ["items"], m, () => ({ items: ["Gross notional", "Open orders", "Leverage"].map((label, i) => {
      const seed = seedOf(sub.id, label, "wpk-limit"), thousandths = seed % 1_100_000; // used ratio in millionths of the cap, above 1 is a breach
      const ratio = i === 2 && seed % 3 === 0 ? null : `${Math.trunc(thousandths / 1_000_000)}.${String(thousandths % 1_000_000).padStart(6, "0")}`;
      return { limit_id: `FIXTURE_LAB:lim-${sub.id}-${i + 1}`, scope: { type: scopeType, id: sub.id }, label, model_revision: "FIXTURE_LAB:model-4", used_ratio: ratio,
        state: ratio === null ? "UNKNOWN" : thousandths >= 1_000_000 ? "BREACH" : thousandths >= 800_000 ? "WARN" : "OK", cap: i === 0 ? { currency: "USDT", value: "150000.00" } : null };
    }) })));
  }
  if (path === "/cost-events") {
    const sub = subject("ALPHA", "alpha_a"); if (sub === null) return invalid;
    const seed = seedOf(sub.type, sub.id, "wpk-cost"), m = mode(sub.type, sub.id);
    return ok(sections({ ...head("cost-events"), subject: sub }, ["events", "totals"], m, () => {
      const kinds = ["FEE", "FUNDING", "INTEREST"] as const;
      const events = Array.from({ length: 2 + seed % 5 }, (_, i) => {
        const kind = kinds[(seed + i) % 3]!, currency = i % 4 === 3 ? "BNB" : "USDT", n = BigInt((seed >>> i) % 90_000 + 1), neg = kind === "FUNDING" && i % 2 === 0;
        const value = currency === "BNB" ? decimal(n, 6) : decimal(n, 2);
        return { event_id: `FIXTURE_LAB:cost-${sub.id}-${i + 1}`, kind, at_ms: T(1 + i * 3), currency, amount: neg ? `-${value}` : value, order_id: kind === "FEE" ? `FIXTURE_LAB:ord-${i + 1}` : null };
      });
      const totals = new Map<string, string>();
      for (const e of events) { const key = `${e.kind}|${e.currency}`; totals.set(key, addDecimal(totals.get(key) ?? "0", e.amount)); }
      return { events, totals: [...totals].map(([key, amount]) => { const [kind, currency] = key.split("|"); return { kind, currency, amount }; }) };
    }));
  }
  if (path === "/reports") {
    const sub = subject("PORTFOLIO", "pf_TEST_ONLY_core"); if (sub === null) return invalid;
    const seed = seedOf(sub.type, sub.id, "wpk-report"), m = mode(sub.type, sub.id);
    return ok(sections({ ...head("report-snapshots"), subject: sub }, ["items"], m, () => ({ items: Array.from({ length: seed % 4 }, (_, i) => ({
      report_id: `FIXTURE_LAB:rep-${sub.id}-${i + 1}`, content_hash: digest(["FIXTURE_LAB:report", sub.id, i]), source_cut: { as_of_ms: T(24 * (i + 1)), revision: digest(["FIXTURE_LAB:cut", sub.id, i]) },
      created_at_ms: T(24 * (i + 1)) + 5000, created_by: i % 2 === 0 ? WPK_ACTORS[seed % 3]! : null })) })));
  }
  if (path === "/recovery-events") {
    const sub = subject("INCIDENT", "inc_fixture"); if (sub === null) return invalid;
    const seed = seedOf(sub.type, sub.id, "wpk-recov"), m = mode(sub.type, sub.id);
    return ok(sections({ ...head("recovery-events"), subject: sub }, ["events"], m, () => ({ events: Array.from({ length: seed % 4 }, (_, i) => {
      const kind = (["RECOVERY_STARTED", "QUALITY_DEGRADED", "RECOVERY_COMPLETED", "QUALITY_RESTORED"] as const)[(seed + i) % 4]!;
      return { event_id: `FIXTURE_LAB:rev-${sub.id}-${i + 1}`, kind, at_ms: T(1 + i), recovery_id: kind.startsWith("RECOVERY") ? `FIXTURE_LAB:rec-${i + 1}` : null,
        quality_event_id: kind.startsWith("QUALITY") ? `FIXTURE_LAB:q-${i + 1}` : null, detail: kind === "QUALITY_DEGRADED" ? "Feed gap" : null };
    }) })));
  }
  if (path === "/grants") {
    const sub = subject("DEPLOYMENT", "dep_fixture"); if (sub === null) return invalid;
    const seed = seedOf(sub.type, sub.id, "wpk-grants"), m = mode(sub.type, sub.id);
    return ok(sections({ ...head("grants"), subject: sub }, ["items"], m, () => ({ items: Array.from({ length: seed % 4 }, (_, i) => {
      const state = (["GRANTED", "RESERVED", "CONSUMED", "RELEASED", "EXPIRED"] as const)[(seed + i) % 5]!;
      return { grant_id: `FIXTURE_LAB:g-${sub.id}-${i + 1}`, reservation_id: state === "RESERVED" || state === "CONSUMED" ? `FIXTURE_LAB:res-${i + 1}` : null, state,
        amounts: [{ currency: "USDT", value: decimal(BigInt((seed >>> i) % 900_000 + 100), 2) }, ...(i === 1 ? [{ currency: "BTC", value: "0.01" }] : [])], granted_at_ms: T(2 + i), expires_at_ms: state === "RESERVED" ? now + 3_600_000 : null };
    }) })));
  }
  return null;
}

/* ---- Stage entry (A->K): `stage_lifecycle.entry_time` EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED, `unavailable_fields` empty, and per row `entered_at_ms` /
 * `days_in_stage` for a row with ONE current stage. FIXTURE_LAB: 1 to 45 whole days, the entry instant a deterministic offset (under one day) older, so
 * `days_in_stage == floor((as_of_ms - entered_at_ms) / 86400000)` holds exactly. One row in nine keeps the typed absence (coverage is per row). */
function wpkStageEntry(body: Draft): void {
  body.stage_lifecycle = { ...body.stage_lifecycle, entry_time: "EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED" };
  body.query_options.unavailable_fields = [];
  const day = 86_400_000;
  for (const row of body.items as Draft[]) {
    const reasons = row.stage_lifecycle_reasons ?? {};
    if (row.current_stage === null || row.current_stage === undefined) { row.stage_lifecycle_reasons = { ...reasons, entered_at_ms: "STAGE_ENTRY_TIME_NOT_PUBLISHED", days_in_stage: "STAGE_ENTRY_TIME_NOT_PUBLISHED" }; continue; }
    const seed = seedOf(row.row_key, "wpk-stage-entry");
    if (seed % 9 === 0) { row.entered_at_ms = null; row.days_in_stage = null; row.stage_lifecycle_reasons = { ...reasons, entered_at_ms: "STAGE_ENTRY_TIME_NOT_PUBLISHED", days_in_stage: "STAGE_ENTRY_TIME_NOT_PUBLISHED" }; continue; }
    const days = 1 + (seed % 45);
    row.entered_at_ms = body.as_of_ms - days * day - ((seed >>> 8) % day);
    row.days_in_stage = days;
    row.stage_lifecycle_reasons = { ...reasons, entered_at_ms: null, days_in_stage: null };
  }
}
// ===== WP-K end
