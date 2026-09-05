/**
 * EDS-07 — `GET /api/v1/execution/views/equity-chart` and `/views/risk-decisions`.
 *
 * The chart route answers a viewport-sized series: the server keeps every
 * bucket's min, max and last (`MIN_MAX_LAST_BUCKET_V1`), states whether extrema
 * and first/last survived, and how many source rows stood behind the points.
 * All of that travels into the `ChartEnvelope` caption — a downsample that is
 * not declared is a lie by omission (CLAUDE.md §8 invariant). Points stay
 * decimal strings; only the timestamps become numbers, and only to become ISO
 * bucket labels the existing `EquitySeries` contract already carries.
 */
import type { Authority, ChartEnvelope, PanelStatus } from "../contracts";
import type { EquitySeries } from "../components/EquityChart";

export const FINANCIAL_METRICS = [
  "equity", "net_pnl", "gross_pnl", "realized_pnl", "unrealized_pnl", "fee_total", "funding_pnl",
  "cash_total", "cash_free", "cash_locked", "margin_initial", "margin_maintenance", "drawdown",
  "notional", "exposure_long", "exposure_short", "allocated_capital",
] as const;
export type FinancialMetric = (typeof FINANCIAL_METRICS)[number];
export type FinancialSubjectKind = "alpha" | "deployment" | "account" | "portfolio";
export type FinancialEnvironment = "paper" | "sandbox" | "live";

export interface FinancialChartQuery {
  environment: FinancialEnvironment;
  subjectKind: FinancialSubjectKind;
  subjectId: string;
  metric?: FinancialMetric;
  fromMs?: number;
  toMs?: number;
  /** Server accepts 256–2048; the caller clamps its measured width into that. */
  viewportPx?: number;
  includeBenchmark?: boolean;
  /** The projection workspace the resource envelope named; the server rejects any other. */
  workspaceId?: string | null;
}

export interface FinancialChartSeries {
  id: string;
  label: string;
  accountId: string | null;
  currency: string | null;
  /** `[epoch_ms, decimal string | null]` as published */
  points: readonly (readonly [number, string | null])[];
}

export interface FinancialChartSampling {
  algorithm: string | null;
  sourceRows: string | null;
  numericRows: string | null;
  rejectedRows: string | null;
  returnedRows: number | null;
  targetPoints: number | null;
  bucketSeconds: number | null;
  preservesExtrema: boolean | null;
  preservesFirstLast: boolean | null;
  preservesGaps: boolean | null;
  gapSemantics: string | null;
  markerSemantics: string | null;
}

export interface FinancialChartPayload {
  schemaVersion: string;
  environment: FinancialEnvironment | null;
  profileId: string | null;
  workspaceId: string | null;
  subject: { kind: string | null; id: string | null };
  metric: string | null;
  sourceAuthority: string | null;
  state: string;
  reasonCode: string | null;
  retryable: boolean;
  comparisonMode: string | null;
  scaleMode: string | null;
  currencyPolicy: string | null;
  series: readonly FinancialChartSeries[];
  sampling: FinancialChartSampling | null;
  retention: { floorMs: number | null; floorState: string | null; oldestMs: number | null; newestMs: number | null; semantics: string | null } | null;
  benchmark: { requested: boolean; state: string | null; reasonCode: string | null } | null;
  clocks: { asOfMs: number | null; readAtMs: number | null; sourcePublishedAtMs: number | null };
  coverage: {
    fromMs: number | null;
    toMs: number | null;
    sourceTotal: string | null;
    filteredTotal: string | null;
    returnedCount: number | null;
    truncated: boolean;
    downsampled: boolean;
    hasMore: boolean;
    gaps: readonly { fromMs: number; toMs: number; reason: string | null }[];
  };
  formula: { id: string | null; version: string | null; inputDigest: string | null; inputRevision: string | null };
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const ENVS = new Set(["paper", "sandbox", "live"]);

export function readFinancialChart(raw: unknown): FinancialChartPayload | null {
  const root = obj(raw);
  const panel = obj(root?.panel);
  const schema = str(root?.schema_version);
  if (!root || !panel || !schema) return null;
  const data = obj(panel.data) ?? {};
  const clocks = obj(panel.clocks) ?? {};
  const coverage = obj(panel.coverage) ?? {};
  const formula = obj(panel.formula) ?? {};
  const sampling = obj(data.sampling);
  const retention = obj(data.retention);
  const benchmark = obj(data.benchmark);
  const subject = obj(root.subject);
  const env = str(root.environment);
  return {
    schemaVersion: schema,
    environment: env && ENVS.has(env) ? (env as FinancialEnvironment) : null,
    profileId: str(root.profile_id),
    workspaceId: str(root.workspace_id),
    subject: { kind: str(subject?.kind), id: str(subject?.id) },
    metric: str(root.metric),
    sourceAuthority: str(root.source_authority),
    state: str(panel.state) ?? "UNAVAILABLE",
    reasonCode: str(panel.reason_code),
    retryable: panel.retryable === true,
    comparisonMode: str(data.comparison_mode),
    scaleMode: str(data.scale_mode),
    currencyPolicy: str(data.currency_policy),
    series: (Array.isArray(data.series) ? data.series : []).flatMap((s) => {
      const o = obj(s);
      const id = str(o?.id);
      if (!o || !id) return [];
      const points = (Array.isArray(o.points) ? o.points : []).flatMap((p) => {
        if (!Array.isArray(p) || p.length < 2) return [];
        const t = int(p[0]);
        const v = p[1];
        if (t === null || !(typeof v === "string" || v === null)) return [];
        return [[t, v] as const];
      });
      return [{ id, label: str(o.label) ?? id, accountId: str(o.account_id), currency: str(o.currency), points }];
    }),
    sampling: sampling
      ? {
          algorithm: str(sampling.algorithm),
          sourceRows: str(sampling.source_rows),
          numericRows: str(sampling.numeric_rows),
          rejectedRows: str(sampling.rejected_rows),
          returnedRows: int(sampling.returned_rows),
          targetPoints: int(sampling.target_points),
          bucketSeconds: int(sampling.bucket_seconds),
          preservesExtrema: bool(sampling.preserves_extrema),
          preservesFirstLast: bool(sampling.preserves_first_last),
          preservesGaps: bool(sampling.preserves_gaps),
          gapSemantics: str(sampling.gap_semantics),
          markerSemantics: str(sampling.marker_semantics),
        }
      : null,
    retention: retention
      ? {
          floorMs: int(retention.retention_floor_ms),
          floorState: str(retention.retention_floor_state),
          oldestMs: int(retention.oldest_available_ms),
          newestMs: int(retention.newest_available_ms),
          semantics: str(retention.history_semantics),
        }
      : null,
    // `requested` echoes the FE's own include_benchmark query — descriptive, not a safety bit.
    benchmark: benchmark ? { requested: bool(benchmark.requested) ?? false, state: str(benchmark.state), reasonCode: str(benchmark.reason_code) } : null,
    clocks: { asOfMs: int(clocks.as_of_ms), readAtMs: int(clocks.read_at_ms), sourcePublishedAtMs: int(clocks.source_published_at_ms) },
    coverage: {
      fromMs: int(coverage.from_ms),
      toMs: int(coverage.to_ms),
      sourceTotal: str(coverage.source_total),
      filteredTotal: str(coverage.filtered_total),
      returnedCount: int(coverage.returned_count),
      truncated: coverage.truncated === true,
      downsampled: coverage.downsampled === true,
      hasMore: coverage.has_more === true,
      gaps: (Array.isArray(coverage.gaps) ? coverage.gaps : []).flatMap((g) => {
        const o = obj(g);
        const fromMs = int(o?.from_ms);
        const toMs = int(o?.to_ms);
        return o && fromMs !== null && toMs !== null ? [{ fromMs, toMs, reason: str(o.reason) ?? str(o.reason_code) }] : [];
      }),
    },
    formula: { id: str(formula.formula_id), version: str(formula.formula_version), inputDigest: str(formula.input_digest), inputRevision: str(formula.input_revision) },
  };
}

/* ── adapter: EDS-07 panel → the EquityChart contract ────────────────── */

const AUTHORITY: Record<string, Authority> = { TRADING_SYSTEM: "EXECUTION", PORTAL_CONTROL: "PORTAL", RESEARCH: "RESEARCH", BROKER: "BROKER", DERIVED: "DERIVED" };

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"));

function bucketLabel(seconds: number | null): string {
  if (seconds === null) return "bucket not stated";
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d bucket`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h bucket`;
  if (seconds % 60 === 0) return `${seconds / 60}m bucket`;
  return `${seconds}s bucket`;
}

export function financialChartPanelStatus(p: FinancialChartPayload): PanelStatus {
  switch (p.state) {
    case "READY": return "ok";
    case "PARTIAL": return "partial";
    case "EMPTY": return "empty";
    case "DENIED": return "denied";
    default: return "unavailable";
  }
}

export interface FinancialChartView {
  status: PanelStatus;
  reason: string | null;
  envelope: ChartEnvelope;
  /** null when the panel published no points — the chart then renders its honest compact state */
  series: EquitySeries | null;
}

/**
 * The envelope is built from the panel's own words: window from `coverage`,
 * interval from `sampling.bucket_seconds`, the downsample method named only
 * when the server said it downsampled, and its preservation flags echoed as
 * warnings where they are false. Nothing is judged client-side.
 */
export function financialChartView(p: FinancialChartPayload): FinancialChartView {
  const status = financialChartPanelStatus(p);
  const first = p.series[0] ?? null;
  const warnings: string[] = [];
  if (p.coverage.truncated) warnings.push("Series truncated by the server — the window is shorter than requested.");
  if (p.coverage.hasMore) warnings.push("More points exist beyond this window.");
  if (p.sampling?.preservesExtrema === false) warnings.push("Downsample did not preserve extrema.");
  if (p.sampling?.preservesFirstLast === false) warnings.push("Downsample did not preserve the first and last point.");
  if (p.sampling && p.sampling.rejectedRows !== null && p.sampling.rejectedRows !== "0") warnings.push(`${p.sampling.rejectedRows} source rows rejected as non-numeric.`);
  if (p.retention?.semantics === "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY") warnings.push("Retained snapshot range — not event replay, not total history.");
  if (p.benchmark?.requested && p.benchmark.state !== "READY") warnings.push(`Benchmark ${p.benchmark.state ?? "not published"}${p.benchmark.reasonCode ? ` · ${p.benchmark.reasonCode}` : ""}.`);
  const envelope: ChartEnvelope = {
    window: p.coverage.fromMs !== null && p.coverage.toMs !== null ? `${iso(p.coverage.fromMs)!.slice(0, 10)} → ${iso(p.coverage.toMs)!.slice(0, 10)}` : "window not stated",
    interval: bucketLabel(p.sampling?.bucketSeconds ?? null),
    currency: first?.currency ?? null,
    asOf: iso(p.clocks.asOfMs) ?? "as_of not stated",
    authority: AUTHORITY[p.sourceAuthority ?? ""] ?? "PORTAL",
    formulaVersion: p.formula.id ? `${p.formula.id}${p.formula.version ? ` ${p.formula.version}` : ""}` : null,
    sourceRows: p.coverage.filteredTotal !== null && Number.isFinite(Number(p.coverage.filteredTotal)) ? Number(p.coverage.filteredTotal) : null,
    returnedRows: p.coverage.returnedCount,
    coverage: null,
    downsampleMethod: p.coverage.downsampled ? p.sampling?.algorithm ?? "downsampled (method not stated)" : null,
    warnings,
  };
  const reason = p.reasonCode ?? (status === "ok" ? null : `EDS-07 panel ${p.state}`);
  if (!first || first.points.length === 0) return { status, reason, envelope, series: null };
  const metric = p.metric ?? "equity";
  return {
    status,
    reason,
    envelope,
    series: {
      label: `${first.label} · ${metric}`,
      kind: metric === "drawdown" ? "drawdown" : metric === "equity" ? "equity" : "value",
      points: first.points.map(([t, v]) => ({ t: iso(t)!, equity: v })),
      gaps: p.coverage.gaps.map((g) => ({ from: iso(g.fromMs)!, to: iso(g.toMs)!, reason: g.reason ?? "source gap" })),
    },
  };
}

/** The server accepts 256–2048 px; a measured width outside that is clamped, never rejected. */
export function viewportPx(width: number | null | undefined): number {
  const w = Math.round(width ?? 960);
  return Math.min(2048, Math.max(256, Number.isFinite(w) ? w : 960));
}

export function financialChartPath(q: FinancialChartQuery): string {
  const params = new URLSearchParams();
  params.set("environment", q.environment);
  params.set("subject_kind", q.subjectKind);
  params.set("subject_id", q.subjectId);
  params.set("metric", q.metric ?? "equity");
  params.set("viewport_px", String(viewportPx(q.viewportPx)));
  if (q.fromMs !== undefined) params.set("from_ms", String(q.fromMs));
  if (q.toMs !== undefined) params.set("to_ms", String(q.toMs));
  if (q.includeBenchmark) params.set("include_benchmark", "true");
  if (q.workspaceId) params.set("workspace_id", q.workspaceId);
  return `/views/equity-chart?${params.toString()}`;
}
