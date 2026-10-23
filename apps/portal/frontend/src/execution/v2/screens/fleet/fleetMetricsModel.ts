/**
 * Alpha Fleet metrics model (guide M03, sections 8.1 and 8.2): the pure part of the metric columns, their sort and filter, no React.
 *
 * What it decides, and only what the PUBLISHED dataset can carry:
 *
 * - SORT (8.2): server-side, through `query_options.sort_fields` only. A header sorts when its field is offered and, for the five money keys,
 *   when ONE economic partition is pinned (the dataset refuses a money order across partitions: "no cross-currency implicit sort"). The
 *   order is a list of up to three keys, in priority; nulls go last in both directions and the tie-break is the immutable row id, both
 *   the server's (`query_policy.null_order`, `row_key`). Nothing is ever sorted here, and a decimal is never compared as text.
 * - FILTER (8.2): numeric RANGES are `GTE` / `LTE` filters on the decimal fields (inclusive: >= min and <= max); portfolio, venue, version and
 *   source state are `EQ` / `IN`; "missing score" is `score IS_NULL`; economic domain and currency are the pinned partition (the basis).
 *   Anything the published schema cannot carry is NOT a control (see ALPHA_FLEET_COMPLETION): logical account, regime status, score
 *   evidence status, a window on the Fleet.
 * - QBTS (spec 5.8): a score is read as published. The band, the evidence word and the provisional flag come from the dataset's open partition
 *   map (`qbts_band`, `qbts_evidence`, `qbts_provisional`); the client never computes a band, a component or a contribution.
 */
import type { ManagerDatasetFilter, ManagerDatasetPartitionQuery } from "../../../api/managerDatasetQuery";
import type { ManagerRow, ManagerSortField } from "../../readers/managerDataset";
import type { ManagerMetricRead, ManagerPartitionedMetrics } from "../../readers/managerMetric";
import type { FlagKind } from "../../flagKinds";
import { humanize } from "./fleetModel";

export const MAX_SORT_KEYS = 3;
export type SortDir = "asc" | "desc";
export interface SortKey { field: ManagerSortField; dir: SortDir }

/** The five money keys: a sort or range on one needs a pinned economic partition. */
export const MONEY_FIELDS: readonly ManagerSortField[] = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"];
export const isMoneyField = (field: ManagerSortField): boolean => MONEY_FIELDS.includes(field);

/* ── columns ───────────────────────────────────────────────────────────── */

export interface DatasetColumnSpec {
  key: string;
  label: string;
  /** The guide 8.1 row this column answers (or "8.1 optional"). */
  guide: string;
  /** Shown by default; optional columns live in the chooser. */
  optional: boolean;
  /** The published sort field the header sorts by, or `null` (not a sortable key). */
  sortField: ManagerSortField | null;
  numeric?: boolean;
}

export const DATASET_COLUMNS: readonly DatasetColumnSpec[] = [
  { key: "alpha", label: "Alpha", guide: "Alpha / Version", optional: false, sortField: "name" },
  { key: "owner", label: "Owner", guide: "Owner / Portfolio", optional: false, sortField: "owner_user_id" },
  { key: "portfolio", label: "Portfolio", guide: "Owner / Portfolio", optional: false, sortField: "portfolio_id" },
  { key: "stage", label: "Current stage", guide: "Stage Presence", optional: false, sortField: "current_stage" },
  { key: "in-stage", label: "In stage", guide: "Stage Presence", optional: false, sortField: null },
  { key: "allocation", label: "Alloc", guide: "Alloc", optional: false, sortField: "allocation", numeric: true },
  { key: "pnl", label: "PNL Amount", guide: "PNL Amount", optional: false, sortField: "net_pnl", numeric: true },
  { key: "unrealized", label: "Unrealized PNL", guide: "Unrealized PNL", optional: false, sortField: "unrealized_pnl", numeric: true },
  { key: "balance", label: "Account balance", guide: "Account Balance", optional: false, sortField: "balance_total", numeric: true },
  { key: "equity", label: "Equity 30D", guide: "Equity 30D", optional: false, sortField: "equity_30d_end_value", numeric: true },
  { key: "health", label: "Health", guide: "Health / Source State", optional: false, sortField: "health" },
  { key: "source", label: "Source", guide: "Health / Source State", optional: false, sortField: "source_state" },
  { key: "qbts", label: "QBTS", guide: "QBTS", optional: false, sortField: "score", numeric: true },
  // Optional (guide 8.1 "additional optional columns"): only those the dataset can carry. The others are recorded, not drawn.
  { key: "venue", label: "Venue", guide: "8.1 optional: venue / profile", optional: true, sortField: "venue" },
  { key: "lifecycle", label: "Lifecycle", guide: "8.1 optional: archive monitor state", optional: true, sortField: "lifecycle" },
  { key: "version", label: "Version", guide: "8.1 optional: version", optional: true, sortField: "alpha_version_id" },
  { key: "domain", label: "Economic domain", guide: "8.1 optional: economic domain", optional: true, sortField: null },
  { key: "drawdown", label: "Drawdown", guide: "8.1 optional: current drawdown", optional: true, sortField: null },
  { key: "coverage", label: "Score coverage", guide: "8.1 optional: score coverage", optional: true, sortField: null },
];

export const OPTIONAL_SHOWN_PARAM = "cols";
export function parseShownOptional(raw: string | null): ReadonlySet<string> {
  const optional = new Set(DATASET_COLUMNS.filter((column) => column.optional).map((column) => column.key));
  return new Set((raw ?? "").split(",").map((part) => part.trim()).filter((part) => optional.has(part)));
}
export function serializeShownOptional(shown: ReadonlySet<string>): string | null {
  const keys = DATASET_COLUMNS.filter((column) => column.optional && shown.has(column.key)).map((column) => column.key);
  return keys.length === 0 ? null : keys.join(",");
}
/** Guide 8.1 optional columns the published dataset cannot carry yet: named in the chooser, never a dead control. */
export const UNPUBLISHED_OPTIONAL: readonly { label: string; request: string }[] = [
  { label: "Deployer", request: "a deployer id on the Manager row (the researcher owner is `owner_user_id`; the deployer is a different person)" },
  { label: "Fee / funding completeness", request: "a per-row cost completeness fact next to the cost-drag metrics" },
  { label: "Regime-fit status", request: "a regime status scalar on the Fleet row (regime is per alpha or deployment, not on a Fleet dataset)" },
  { label: "Last trade / event", request: "a last trade / event time on the Manager row" },
];

/* ── equity scalar (8.1: the sparkline does not sort; the scalar does) ─── */

export type EquityScalar = "value" | "return" | "drawdown";
export const EQUITY_SCALARS: readonly { id: EquityScalar; label: string; key: string; field: ManagerSortField | null; unit: "money" | "pct" }[] = [
  { id: "value", label: "Equity 30D end value", key: "equity_30d_end_value", field: "equity_30d_end_value", unit: "money" },
  { id: "return", label: "Return 30D", key: "return_30d_pct", field: "return_30d_pct", unit: "pct" },
  // The drawdown is an open partition key (`max_drawdown_pct`): shown, but it is not a published sort field.
  { id: "drawdown", label: "Drawdown 30D", key: "max_drawdown_pct", field: null, unit: "pct" },
];
export const equityScalarOf = (raw: string | null): (typeof EQUITY_SCALARS)[number] => EQUITY_SCALARS.find((scalar) => scalar.id === raw) ?? EQUITY_SCALARS[0]!;

/** The sort field of a column given the equity scalar. */
export function sortFieldOf(column: DatasetColumnSpec, scalar: (typeof EQUITY_SCALARS)[number]): ManagerSortField | null {
  return column.key === "equity" ? scalar.field : column.sortField;
}

/* ── sort ──────────────────────────────────────────────────────────────── */

const FIELD_SET: ReadonlySet<string> = new Set(DATASET_COLUMNS.flatMap((column) => (column.sortField === null ? [] : [column.sortField])).concat(["return_30d_pct"]));

/** `score:desc,name:asc` -> keys (known fields only, unique, at most three). */
export function parseSorts(raw: string | null): readonly SortKey[] {
  const out: SortKey[] = [];
  for (const part of (raw ?? "").split(",")) {
    const [field, dir] = part.trim().split(":");
    if (field === undefined || !FIELD_SET.has(field) || (dir !== "asc" && dir !== "desc") || out.some((key) => key.field === field)) continue;
    out.push({ field: field as ManagerSortField, dir });
    if (out.length === MAX_SORT_KEYS) break;
  }
  return out;
}
export const serializeSorts = (keys: readonly SortKey[]): string | null => (keys.length === 0 ? null : keys.map((key) => `${key.field}:${key.dir}`).join(","));

/** A click on a header: not sorted -> added last (ascending); ascending -> descending; descending -> removed. The priority is the position. */
export function cycleSort(keys: readonly SortKey[], field: ManagerSortField): readonly SortKey[] {
  const at = keys.findIndex((key) => key.field === field);
  if (at < 0) return keys.length >= MAX_SORT_KEYS ? [...keys.slice(1), { field, dir: "asc" }] : [...keys, { field, dir: "asc" }];
  const current = keys[at]!;
  return current.dir === "asc" ? keys.map((key, index) => (index === at ? { field, dir: "desc" as const } : key)) : keys.filter((_, index) => index !== at);
}

/**
 * The keys the dataset will actually be asked: offered by `sort_fields`, and a money key only with a pinned partition. A key that is not
 * askable is dropped from the QUERY, never silently from the URL, and `unaskable` names why so the screen can say so.
 */
export function askableSorts(keys: readonly SortKey[], offered: readonly ManagerSortField[] | null, pinned: boolean): { sort: readonly SortKey[]; unaskable: readonly { key: SortKey; why: string }[] } {
  const sort: SortKey[] = [];
  const unaskable: { key: SortKey; why: string }[] = [];
  for (const key of keys) {
    if (offered === null || !offered.includes(key.field)) unaskable.push({ key, why: "The dataset does not offer this field for sorting." });
    else if (isMoneyField(key.field) && !pinned) unaskable.push({ key, why: "A money order needs one economic partition (choose a Basis)." });
    else sort.push(key);
  }
  return { sort, unaskable };
}

/* ── ranges ────────────────────────────────────────────────────────────── */

export interface RangeSpec { field: ManagerSortField; label: string; unit: string }
/** The metrics a numeric range may bound (guide 8.2: PnL / DD / score ranges). Each is a decimal field of the dataset. */
export const RANGE_FIELDS: readonly RangeSpec[] = [
  { field: "allocation", label: "Alloc", unit: "currency of the basis" },
  { field: "net_pnl", label: "PNL Amount", unit: "currency of the basis" },
  { field: "unrealized_pnl", label: "Unrealized PNL", unit: "currency of the basis" },
  { field: "equity_30d_end_value", label: "Equity 30D end value", unit: "currency of the basis" },
  { field: "return_30d_pct", label: "Return 30D", unit: "percent, 5 means 5%" },
  { field: "score", label: "QBTS", unit: "score points, 0 to 100" },
];
export interface Range { field: ManagerSortField; min: string | null; max: string | null }
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
export const isDecimalText = (text: string): boolean => text.length <= 64 && DECIMAL.test(text);

/** `score~60~75,net_pnl~~100`: field, min, max (empty = open). Unknown fields, repeats and non-decimals are dropped; at least one bound. */
export function parseRanges(raw: string | null): readonly Range[] {
  const out: Range[] = [];
  for (const part of (raw ?? "").split(",")) {
    const [field, min = "", max = ""] = part.trim().split("~");
    if (!RANGE_FIELDS.some((spec) => spec.field === field) || out.some((range) => range.field === field)) continue;
    if ((min !== "" && !isDecimalText(min)) || (max !== "" && !isDecimalText(max)) || (min === "" && max === "")) continue;
    out.push({ field: field as ManagerSortField, min: min === "" ? null : min, max: max === "" ? null : max });
  }
  return out;
}
export const serializeRanges = (ranges: readonly Range[]): string | null =>
  ranges.length === 0 ? null : ranges.map((range) => `${range.field}~${range.min ?? ""}~${range.max ?? ""}`).join(",");

/** Inclusive bounds as the wire: `GTE min` and `LTE max`. Money ranges need a pinned partition and are left out without one. */
export function rangeFilters(ranges: readonly Range[], offered: readonly ManagerSortField[] | null, pinned: boolean): readonly ManagerDatasetFilter[] {
  const out: ManagerDatasetFilter[] = [];
  for (const range of ranges) {
    if (offered === null || !offered.includes(range.field) || (isMoneyField(range.field) && !pinned)) continue;
    if (range.min !== null) out.push({ field: range.field, op: "GTE", value: range.min });
    if (range.max !== null) out.push({ field: range.field, op: "LTE", value: range.max });
  }
  return out;
}

/** A range in words, with the unit and the boundary rule the guide asks for. */
export function rangeText(range: Range, basis: string | null): string {
  const spec = RANGE_FIELDS.find((entry) => entry.field === range.field)!;
  const bounds = range.min !== null && range.max !== null ? `${range.min} to ${range.max}` : range.min !== null ? `at least ${range.min}` : `at most ${range.max}`;
  return `${spec.label} ${bounds} (inclusive; ${isMoneyField(range.field) ? basis === null ? "needs a basis" : `in ${basis}` : spec.unit})`;
}

/* ── basis (the pinned economic partition) ─────────────────────────────── */

export interface BasisOption { id: string; label: string; query: ManagerDatasetPartitionQuery }
export const BASIS_PARAM = "basis";
const DOMAIN_WORD = { ACTUAL: "Real-funded", PAPER: "Paper", SANDBOX: "Sandbox" } as const;

/** The partitions the loaded rows publish, once each in first-seen order: `ACTUAL|USDT` is the id (domain and currency). */
export function basisOptions(rows: readonly ManagerRow[]): readonly BasisOption[] {
  const seen = new Map<string, BasisOption>();
  for (const row of rows) for (const entry of row.economicPartitions) {
    const p = entry.partition;
    const id = `${p.economicDomain}|${p.currency}`;
    if (!seen.has(id)) seen.set(id, { id, label: `${DOMAIN_WORD[p.economicDomain]} · ${p.currency}`, query: {
      economicDomain: p.economicDomain, currency: p.currency, basis: p.basis, nativeProfileRef: p.nativeProfileRef, domainProofRef: p.domainProofRef } });
  }
  return [...seen.values()];
}
export const basisOf = (id: string | null, options: readonly BasisOption[]): BasisOption | null => options.find((option) => option.id === id) ?? null;

/* ── filters of the toolbar ────────────────────────────────────────────── */

export type EvidenceFilter = "missing" | "stale";
export const EVIDENCE_FILTERS: readonly { id: EvidenceFilter; label: string }[] = [
  { id: "missing", label: "Missing score (no QBTS published)" },
  { id: "stale", label: "Stale source" },
];
export const evidenceOf = (raw: string | null): EvidenceFilter | null => EVIDENCE_FILTERS.find((entry) => entry.id === raw)?.id ?? null;

/* ── QBTS ──────────────────────────────────────────────────────────────── */

export const BAND_LABEL: Readonly<Record<string, { label: string; kind: FlagKind }>> = {
  weak: { label: "Weak", kind: "attention" },
  neutral: { label: "Neutral", kind: "neutral" },
  fair: { label: "Fair", kind: "partial" },
  good: { label: "Good", kind: "ok" },
  very_good: { label: "Very good", kind: "applied" },
};

export interface QbtsView {
  kind: "value" | "absent";
  /** The exact published score, or null. */
  exact: string | null;
  /** The published band code and its label, never derived from the number. `null`: the dataset names none. */
  band: { code: string; label: string; kind: FlagKind } | null;
  evidence: "eligible" | "provisional" | "insufficient" | null;
  provisional: boolean;
  p: string | null;
  r: string | null;
  b: string | null;
  /** `FIXTURE_LAB` and the like: the policy label of the score metric. */
  policy: string | null;
  reason: string | null;
  /** The partition the components belong to (a score is per alpha version; the open map sits in its partition). */
  partition: ManagerPartitionedMetrics | null;
}

const exactOf = (metric: ManagerMetricRead | undefined): string | null => (metric !== undefined && metric.kind === "value" ? metric.exact : null);

export function qbtsOf(row: ManagerRow): QbtsView | null {
  const headline = row.metrics.score;
  if (headline === undefined) return null;
  const partition = row.economicPartitions.find((entry) => entry.metrics.has("qbts_band") || entry.metrics.has("qbts_evidence") || entry.metrics.has("score")) ?? row.economicPartitions[0] ?? null;
  const map = partition?.metrics;
  const bandMetric = map?.get("qbts_band");
  const code = bandMetric !== undefined && bandMetric.kind === "value" ? bandMetric.reasonCode : null;
  const evidenceMetric = map?.get("qbts_evidence");
  const word = evidenceMetric !== undefined && evidenceMetric.kind === "value" ? evidenceMetric.reasonCode : null;
  const evidence = word === "eligible" || word === "provisional" || word === "insufficient" ? word : null;
  const flag = map?.get("qbts_provisional");
  const provisional = (flag !== undefined && flag.kind === "value" && flag.exact === "1") || evidence === "provisional";
  const band = code === null ? null : { code, ...(BAND_LABEL[code] ?? { label: humanize(code), kind: "neutral" as FlagKind }) };
  if (headline.kind === "absent") {
    return { kind: "absent", exact: null, band: null, evidence: evidence ?? "insufficient", provisional: false, p: null, r: null, b: null, policy: headline.policyRevision, reason: headline.reasonCode, partition };
  }
  return { kind: "value", exact: headline.exact, band, evidence, provisional, p: exactOf(map?.get("qbts_p")), r: exactOf(map?.get("qbts_r")), b: exactOf(map?.get("qbts_b")),
    policy: headline.policyRevision, reason: null, partition };
}

/** The QBTS disclosure rows (components, band, evidence, policy): all published, none computed. */
export function qbtsRows(view: QbtsView): readonly string[] {
  if (view.kind === "absent") return [`No QBTS is published for this version: ${view.reason ?? "reason not published"}.`, `Policy: ${view.policy ?? "not published"}.`];
  const lines = [`QBTS ${view.exact}${view.band ? `, band ${view.band.label} (${view.band.code})` : ", the dataset names no band"}.`];
  lines.push(view.p !== null || view.r !== null || view.b !== null ? `Components: P ${view.p ?? "not published"}, R ${view.r ?? "not published"}, B ${view.b ?? "not published"}.` : "Components P, R and B: not published.");
  lines.push(`Evidence: ${view.evidence ?? "not published"}${view.provisional ? " (provisional: the sample has not reached the maturity policy)" : ""}.`);
  lines.push(`Policy: ${view.policy ?? "not published"}.`);
  return lines;
}
