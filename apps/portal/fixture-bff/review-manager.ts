/**
 * Opt-in, SYNTHETIC review data only. Never imported by product code, never source acceptance.
 * The original sparse L0 doubles are not changed. The caller selects the shared medium/large
 * bffScale universe; this answerer never changes process-global scale or clock state.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { answerManagerFleet, answerManagerSeries } from "../frontend/e2e/bffDoubleManager";
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
  const body = fixture(metric === "RETURN" ? "execution-manager-series.return.synthetic.valid.json" : "execution-manager-series.populated.synthetic.valid.json");
  body.metric = metric;
  body.environment = original.environment;
  body.workspace_id = original.workspace_id;
  body.as_of_ms = now;
  body.recorded_through_ms = now;
  body.quality = { completeness: "PARTIAL", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC", "SOURCE_GAP"] };
  body.selected_window = { requested, resolved: window, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
  const pinned = search.has("economic_partition") ? JSON.parse(search.get("economic_partition")!) : null;
  const knownPortfolios = new Map(scaled().portfolios.map((portfolio) => [portfolio.id, portfolio]));
  body.series = subjects.map((subject, subjectIndex) => {
    const identity = { subject_type: subject.subject_type, subject_id: subject.subject_type === "FUND" ? body.workspace_id : subject.subject_id };
    const portfolio = knownPortfolios.get(identity.subject_id);
    // Keep the canonical small-lane subjects valid; unknown scaled IDs are not fabricated.
    if (subject.subject_type === "PORTFOLIO" && !portfolio && !["TEST_ONLY:portfolio-a", "TEST_ONLY:portfolio-b", "pf_a", "pf_b"].includes(identity.subject_id)) return unavailable(identity, "SUBJECT_HAS_NO_ACTIVE_MEMBERS");
    const entry = copy(body.series[0]);
    entry.subject = identity;
    entry.partition = { economic_domain: domain(body.environment), currency: portfolio?.base ?? "USDT", basis: `FIXTURE_LAB:${metric}:synthetic-book`,
      native_profile_ref: `FIXTURE_LAB:${body.environment}:synthetic`, domain_proof_ref: "FIXTURE_LAB:NOT_PRODUCT_AUTHORITY" };
    if (pinned && Object.keys(entry.partition).some((key) => pinned[key] !== entry.partition[key])) return unavailable(identity, "ECONOMIC_PARTITION_REQUIRED");
    entry.unit = metric === "RETURN" ? "RATIO" : "MONEY";
    entry.currency = metric === "RETURN" ? null : entry.partition.currency;
    entry.ratio_scale = metric === "RETURN" ? "FRACTION" : null;
    entry.basis = entry.partition.basis;
    entry.methodology_ref = `FIXTURE_LAB:${metric}:synthetic-sequence-v1`;
    entry.window = copy(window);
    const missing = Math.floor(target / 2);
    const at = (index: number): number => window.from_ms + Math.floor(index * (window.to_ms - window.from_ms - 1) / target);
    entry.points = Array.from({ length: target + 1 }, (_, index) => index).filter((index) => index !== missing)
      .map((index) => ({ ts_ms: at(index), value: sampleValue(metric, index, subjectIndex) }));
    entry.gaps = [{ from_ms: at(missing), to_ms: at(missing), reason: "SOURCE_GAP" }];
    entry.quality = copy(body.quality);
    entry.source_confidence = "PROVISIONAL";
    entry.provenance_refs = [digest(["FIXTURE_LAB_SYNTHETIC", profile, body.environment, identity, metric, window])];
    entry.calculation_revision = "FIXTURE_LAB:review-manager.v1";
    entry.policy_revision = "FIXTURE_LAB:NOT_PRODUCT_POLICY";
    return entry;
  });
  body.comparison = comparison(body.series);
  body.lineage.source_set_ref = digest(["FIXTURE_LAB_SYNTHETIC", profile, now]);
  body.lineage.revision = digest([body.workspace_id, body.environment, body.metric, body.selected_window, body.series]);
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
  const partitions = new Map<string, { partition: Draft; accounts: Set<string>; template: Draft; pnl: (string | null)[] }>();
  for (const row of rows) for (const entry of row.economic_partitions) {
    const key = JSON.stringify(entry.partition);
    const found = partitions.get(key) ?? { partition: entry.partition, accounts: new Set<string>(), template: row.metrics.net_pnl, pnl: [] };
    // This partition's own rows only; a row's figure is never moved to another partition.
    found.pnl.push(entry.metrics.net_pnl?.availability === "AVAILABLE" ? entry.metrics.net_pnl.value : null);
    for (const child of row.children) found.accounts.add(child.account_id);
    partitions.set(key, found);
  }
  return [...partitions.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry], index, all) => {
    const accounts = [...entry.accounts].sort();
    const count = BigInt(accounts.length);
    const scale = 1_000_000_000_000_000_000n;
    // These are explicit synthetic receipt/valuation amounts. A negative NAV
    // is a deliberate adverse-book case, not a negative budget or missing value.
    const values: Record<string, string | null> = {
      initial_funds: decimal(count * 10_000n * scale + 1n, 18),
      added_funds: "0",
      returned_capital: decimal(count * 125n * scale, 18),
      current_nav: index === 1 ? "-125.500000000000000001" : decimal(count * 11_500n * scale + 7n, 18),
      current_budget: decimal(count * 9_000n * scale, 18),
      pending_amount: index === 0 ? null : "0",
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
    const ret = pnl === null ? null : pct(toScaled(pnl), toScaled(values.initial_funds!));
    const returnMetric = perf("return_30d_pct", pctMetric(entry.template, index === 1 && all.length > 1 ? null : ret));
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

function rowsFor(environment: string, template: Draft, preset: WindowPreset, components = true): Draft[] {
  const universe = scaled();
  // The small universe has no generated alphas: the review lane then answers with the e2e suite's own alpha ids and portfolio ids
  // (SUITE_ALPHAS), one single-book partition per row, so every screen shows real simulated figures instead of the canonical test row.
  const alphas = universe.alphas.length === 0 ? SUITE_ALPHAS : universe.alphas;
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
    // Real zero, signed exact decimals, and a declared missing figure are all present.
    row.metrics = { allocation: metric(sourceMetric, sum(deployments.map((entry) => entry.allocation)), first.currency),
      net_pnl: metric(sourceMetric, rows.length % 11 === 0 ? "0" : sum(deployments.map((entry) => entry.realized)), first.currency),
      unrealized_pnl: metric(sourceMetric, rows.length % 7 === 0 ? null : sum(deployments.map((entry) => entry.unrealized)), first.currency) };
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
  merged.sort((a, b) => {
    for (const key of sort) {
      const x = textOf(a, key.field); const y = textOf(b, key.field);
      if (x === y) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * (key.direction === "asc" ? 1 : -1);
    }
    return a.row_key < b.row_key ? -1 : a.row_key > b.row_key ? 1 : 0;
  });
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

function datasetAnswer(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse | null {
  if (method === "GET" && search.get("environment") === "ALL") return allAnswer(path, search, profile);
  const match = /^\/manager\/(fund-overview|fleet|(?:portfolios|alphas|accounts|deployments)\/([^/]+)\/overview)$/.exec(path);
  if (method !== "GET" || !match) return null;
  const checkedQuery = new URLSearchParams(search);
  checkedQuery.delete("after");
  checkedQuery.delete("before");
  checkedQuery.delete("lifecycle_filter");
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
  let rows = rowsFor(environment, template, windowPreset, profile === "populated");
  const universe = scaled();
  if (id !== undefined) {
    const known = surface === "PORTFOLIO" ? universe.portfolios.some((entry) => entry.id === id) : surface === "ALPHA" ? universe.alphas.some((entry) => entry.id === id)
      : surface === "ACCOUNT" ? universe.bindings.some((entry) => entry.accountId === id && entry.environment === environment) : universe.alphas.some((alpha) => alpha.deployments.some((entry) => entry.id === id && entry.environment === environment));
    const canonicalKnown = rows.some((row) => surface === "PORTFOLIO" ? row.portfolio_id === id : surface === "ALPHA" ? row.alpha_id === id : row.children.some((child: Draft) => child[surface === "ACCOUNT" ? "account_id" : "deployment_id"] === id));
    if (!known && !canonicalKnown) return problem(404, "EXECUTION_READ_NOT_AVAILABLE", "This synthetic review resource is not in the selected universe/environment.");
    rows = rows.filter((row) => surface === "PORTFOLIO" ? row.portfolio_id === id : surface === "ALPHA" ? row.alpha_id === id : row.children.some((child: Draft) => child[surface === "ACCOUNT" ? "account_id" : "deployment_id"] === id));
    if (surface === "ACCOUNT" || surface === "DEPLOYMENT") {
      // The book metric cannot be relabelled as one child's contribution.
      for (const row of rows) {
        const children = row.children.filter((child: Draft) => child[surface === "ACCOUNT" ? "account_id" : "deployment_id"] === id);
        if (children.length !== row.children.length) {
          for (const key of Object.keys(row.metrics)) row.metrics[key] = nulled(key, row.metrics[key], row.economic_partitions[0].partition.currency);
          row.economic_partitions[0].metrics = copy(row.metrics);
        }
        row.children = children;
      }
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
    && filters.every((filter) => filter.op === "EQ" ? textOf(row, filter.field) === filter.value : filter.op === "IN" ? filter.values.includes(textOf(row, filter.field)) : textOf(row, filter.field) === null));
  rows.sort((a, b) => {
    for (const key of sort) {
      const x = textOf(a, key.field); const y = textOf(b, key.field);
      if (x === y) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * (key.direction === "asc" ? 1 : -1);
    }
    return a.row_key < b.row_key ? -1 : a.row_key > b.row_key ? 1 : 0;
  });
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
  if (Buffer.byteLength(JSON.stringify(body)) > body.query_policy.maximum_response_bytes) return problem(400, "MANAGER_REVIEW_RESPONSE_TOO_LARGE", "Reduce limit/grouping for this bounded review response.");
  return { status: 200, body };
}

export function answerReviewManager(method: string, path: string, search: URLSearchParams, profile: ReviewManagerProfile): ReviewManagerResponse | null {
  const normalized = path.replace(/^\/api\/v1\/execution(?=\/)/, "");
  return seriesAnswer(method, normalized, search, profile) ?? datasetAnswer(method, normalized, search, profile);
}
