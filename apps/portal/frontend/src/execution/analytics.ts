/**
 * Analytics contracts (EX-BE-07a/b).
 *
 * Written against the published schema —
 * `packages/contracts/openapi/execution-analytics.openapi.json` — not against
 * the prose. Nine field names differ from what the prose implied and are noted
 * where they bite; the screens did not change, which is what the port is for.
 *
 * One rule governs the whole module: **it reads numbers, it never makes them.**
 * §2.2 spells out the capital relationships, and the engine sends every side of
 * every one of them — `allocated_before` *and* `allocated_after`,
 * `available_before` *and* `available_after`. A browser that derived the second
 * from the first would produce a second answer, and two answers to "how much
 * capital does this have" is one answer too many. There is no arithmetic below.
 *
 * Decimals stay strings end to end, as in `adapter.ts` and for the same reason:
 * `"50.000000000000000001"` is a real value in the published fixture, and a
 * double drops the digit that makes it one.
 */
import { readDecimal, readId, readTimestamp, type Decimal } from "./adapter";
import type { Authority, FreshnessState, PanelStatus } from "./contracts";

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}
function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
function int(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}
function arr(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

/** `PopulationCompleteness`. How much of the intended population a figure covers. */
export type PopulationCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";

function readCompleteness(raw: unknown): PopulationCompleteness {
  // Absent is UNKNOWN, never COMPLETE. A figure that did not say how complete
  // it is has not said it is complete.
  const value = str(raw);
  return value === "COMPLETE" || value === "PARTIAL" ? value : "UNKNOWN";
}

/**
 * The two-layer envelope every analytics response carries.
 *
 * `AnalyticsScreenMetadata` is about the *read* — which projection epoch, which
 * snapshot, which delivery profile. `DerivedMetadata` is about the *computation*
 * — which formula version, how fresh its worst input was, how complete its
 * population. They are separate because a perfectly fresh read of a stale
 * computation is a real state, and one field could not say so.
 */
export interface AnalyticsEnvelope {
  schemaVersion: string | null;
  epochId: string | null;
  sourceSnapshotId: string | null;
  capabilitySnapshotId: string | null;
  /** Stays `fixture` for this phase. Nothing here marks an endpoint live. */
  sourceProfile: string | null;
  projectionSequence: number | null;
  freshnessPolicyVersion: string | null;
  readAt: string | null;
  formulaVersion: string | null;
  authority: Authority;
  /** Freshness of the **worst** input, not an average. */
  inputFreshnessFloor: FreshnessState;
  panelState: PanelStatus;
  inputCompleteness: PopulationCompleteness;
  inputAsOf: string | null;
  warnings: readonly { code: string; message: string }[];
}

const PANEL_STATES: readonly PanelStatus[] = [
  "loading", "ok", "empty", "partial", "stale",
  "denied", "unavailable", "insufficient_data", "terminal",
];
/**
 * All five, not four.
 *
 * `PAUSED` was missing, so a paused deployment's analytics read as `UNKNOWN` —
 * "we cannot tell how fresh this is" in place of "this is deliberately not
 * moving". The first sends an operator looking for a fault; the second is the
 * system working as intended.
 */
const FRESHNESS: readonly FreshnessState[] = ["OK", "AGING", "STALE", "PAUSED", "UNKNOWN"];

export function readAnalyticsEnvelope(raw: unknown): AnalyticsEnvelope | null {
  const o = obj(raw);
  if (!o) return null;
  const derived = obj(o.analytics) ?? {};
  const panelState = str(derived.panel_state);
  const floor = str(derived.input_freshness_floor);
  return {
    schemaVersion: str(o.schema_version),
    epochId: str(o.epoch_id),
    sourceSnapshotId: str(o.source_snapshot_id),
    capabilitySnapshotId: str(o.capability_snapshot_id),
    sourceProfile: str(o.source_profile),
    projectionSequence: int(o.projection_sequence),
    freshnessPolicyVersion: str(o.freshness_policy_version),
    readAt: readTimestamp(o.read_at),
    formulaVersion: str(derived.formula_version),
    authority: (str(derived.source_authority) as Authority) ?? "DERIVED",
    inputFreshnessFloor: FRESHNESS.includes(floor as FreshnessState)
      ? (floor as FreshnessState)
      : "UNKNOWN",
    panelState: PANEL_STATES.includes(panelState as PanelStatus)
      ? (panelState as PanelStatus)
      : "unavailable",
    inputCompleteness: readCompleteness(derived.input_completeness),
    inputAsOf: readTimestamp(derived.input_as_of),
    warnings: arr(derived.warnings).flatMap((w) => {
      const entry = obj(w);
      const code = entry && str(entry.code);
      const message = entry && str(entry.message);
      return code && message ? [{ code, message }] : [];
    }),
  };
}

/** The payload lives two levels down: `analytics.data`. */
function payload(raw: unknown): Record<string, unknown> | null {
  const o = obj(raw);
  if (!o) return null;
  return obj(obj(o.analytics)?.data) ?? obj(o.data);
}

/* ---------------------------------------------------------------------------
 * Gate R2 — capital preview
 * ------------------------------------------------------------------------ */

export interface CapitalLine {
  label: string;
  currency: string;
  before: Decimal;
  after: Decimal;
  /** The rule the after value was checked against, when the engine names one. */
  note: string | null;
}

export interface CapitalPreview {
  portfolioId: string;
  currency: string;
  /** `null` when the engine did not send it. Never defaulted to zero — a
   * missing amount and a zero amount are different facts, and on this panel
   * the difference is the whole decision. */
  requestedAmount: Decimal | null;
  maximumAllocated: Decimal | null;
  /**
   * Built by *naming* server fields in pairs, never by arithmetic.
   *
   * The engine sends both sides of every line, so a line is a rename: `before`
   * is `allocated_before`, `after` is `allocated_after`. The one thing that
   * would break this — computing an `after` from a `before` and the request —
   * has no code path here.
   */
  lines: readonly CapitalLine[];
  /**
   * The server's verdict on whether this preview may be decided against.
   *
   * §2.2: a stale or incomplete preview stays visible for diagnosis with
   * `decision_eligible=false`. Visible and un-actionable is a deliberate pair —
   * hiding it removes the diagnosis, enabling approval decides against numbers
   * nobody stands behind.
   */
  decisionEligible: boolean;
  blockers: readonly string[];
}

export function readCapitalPreview(raw: unknown): CapitalPreview | null {
  const data = payload(raw);
  if (!data) return null;
  const portfolioId = readId(data.portfolio_id);
  const currency = str(data.currency);
  if (!portfolioId || !currency) return null;

  // A line needs both sides. One side present is a change from nothing, which
  // on this panel is the most expensive misreading available.
  const pair = (label: string, beforeKey: string, afterKey: string, note: string | null) => {
    const before = readDecimal(data[beforeKey]);
    const after = readDecimal(data[afterKey]);
    return before !== null && after !== null
      ? [{ label, currency, before, after, note } as CapitalLine]
      : [];
  };
  // `used` and `reserved` arrive as one field each: the engine is saying an
  // allocation change does not move them. Rendered with both sides equal, which
  // states that rather than implying it by omission.
  const held = (label: string, key: string, note: string | null) => {
    const value = readDecimal(data[key]);
    return value !== null ? [{ label, currency, before: value, after: value, note }] : [];
  };

  const maximumAllocated = readDecimal(data.maximum_allocated);
  return {
    portfolioId,
    currency,
    requestedAmount: readDecimal(data.requested_amount),
    maximumAllocated,
    lines: [
      ...pair("Allocated", "allocated_before", "allocated_after", null),
      ...held("Used", "used", "Unchanged by an allocation change."),
      ...held("Reserved", "reserved", "Unchanged by an allocation change."),
      ...pair("Available", "available_before", "available_after", null),
      ...pair(
        "Allocation headroom",
        "allocation_headroom_before",
        "allocation_headroom_after",
        maximumAllocated ? `Against a ceiling of ${maximumAllocated} ${currency}.` : null,
      ),
    ],
    // Absent is not eligible. A preview that did not say whether it may be
    // decided against has not said yes.
    decisionEligible: data.decision_eligible === true,
    blockers: arr(data.blockers).filter((b): b is string => typeof b === "string"),
  };
}

/* ---------------------------------------------------------------------------
 * Full Blotter — order funnel
 * ------------------------------------------------------------------------ */

/** The canonical four, in the server's order. Never reordered here. */
export const FUNNEL_STAGES = ["SUBMIT", "SOURCE_ACK", "BROKER_ACK", "FILL"] as const;
export type FunnelStageName = (typeof FUNNEL_STAGES)[number];

/**
 * `MISSING` and `PARTIAL` are rendered, never inferred away.
 *
 * A broker acknowledgement we did not observe is not implied by a fill that
 * followed it. The fill proves the order reached the venue; it does not prove
 * we ever saw the acknowledgement, and those are different facts on a screen
 * whose entire job is saying which facts we hold.
 */
export type FunnelStageState = "OBSERVED" | "PARTIAL" | "MISSING";

export interface FunnelEvent {
  sourceId: string;
  occurredAt: string | null;
  /** Null for hops that carry no quantity, e.g. an acknowledgement. */
  quantity: Decimal | null;
  authority: Authority;
  freshness: FreshnessState;
  completeness: PopulationCompleteness;
  asOf: string | null;
}

/**
 * How much of a population a response actually carried.
 *
 * The three numbers are not interchangeable and the screen must never derive
 * one from another. `total` is the server's exact count of the validated
 * population; `returned` is how many rows came back; `hasMore` says the
 * response is a window rather than the whole thing. A screen that inferred
 * `hasMore` from `returned < total` would be right today and wrong the moment
 * the server bounds a response whose total it could not compute.
 */
export interface Bounded {
  /** Exact count of the complete validated population. `null` if unpublished. */
  total: number | null;
  /** Rows actually returned. */
  returned: number | null;
  /** The server says this is a bounded window. Absent is not "complete". */
  hasMore: boolean;
}

/**
 * Which window the server chose.
 *
 * `LIFECYCLE_AND_LATEST` is lifecycle coverage plus the latest retained events
 * — NOT a full chronological export, and saying "all events" beside it would
 * be false. `LATEST` is the newest slice only. Both are shown to the operator
 * verbatim rather than translated into a friendlier word that loses the
 * distinction.
 */
export type AnalyticsWindow = "LIFECYCLE_AND_LATEST" | "LATEST";

const WINDOWS: readonly AnalyticsWindow[] = ["LIFECYCLE_AND_LATEST", "LATEST"];

function readWindow(raw: unknown): AnalyticsWindow | null {
  return typeof raw === "string" && (WINDOWS as readonly string[]).includes(raw)
    ? (raw as AnalyticsWindow)
    : null;
}

function readBounded(o: Record<string, unknown> | null, totalKey: string, returnedKey: string): Bounded {
  return {
    total: int(o?.[totalKey]),
    returned: int(o?.[returnedKey]),
    // Deny-by-default in the honest direction: an absent flag does not get to
    // claim the response is complete.
    hasMore: o?.has_more === true,
  };
}

export interface FunnelStage {
  name: FunnelStageName;
  state: FunnelStageState;
  /** Multiple fills stay in the server's order. */
  events: readonly FunnelEvent[];
  /** This stage's own exact count. Never the length of `events`. */
  eventCount: number | null;
  returnedEventCount: number | null;
  /** The server truncated this stage's events. */
  truncated: boolean;
}

export interface OrderFunnel {
  orderId: string;
  stages: readonly FunnelStage[];
  /** True when any stage is MISSING or PARTIAL. */
  incomplete: boolean;
  /** Population vs window across the whole funnel. */
  bounded: Bounded;
  window: AnalyticsWindow | null;
}

function readFunnelEvent(raw: unknown): FunnelEvent | null {
  const e = obj(raw);
  const sourceId = e && readId(e.source_id);
  if (!sourceId) return null;
  const quality = obj(e!.quality) ?? {};
  const freshness = str(quality.freshness_state);
  return {
    sourceId,
    occurredAt: readTimestamp(e!.occurred_at),
    quantity: readDecimal(e!.quantity),
    // The event's own authority. `quality.source_authority` describes the
    // *measurement* of that hop, and the two are separate required fields in
    // the schema precisely because they can differ — a broker fill observed
    // through a derived reconciliation is BROKER data with DERIVED quality,
    // and reading the second as the first credits the wrong system.
    authority:
      (str(e!.source_authority) as Authority) ??
      (str(quality.source_authority) as Authority) ??
      "DERIVED",
    freshness: FRESHNESS.includes(freshness as FreshnessState)
      ? (freshness as FreshnessState)
      : "UNKNOWN",
    completeness: readCompleteness(quality.completeness),
    asOf: readTimestamp(quality.as_of),
  };
}

export function readOrderFunnel(raw: unknown): OrderFunnel | null {
  const data = payload(raw);
  if (!data) return null;
  const orderId = readId(data.order_id);
  if (!orderId) return null;

  // Keyed on `stage`, not `name` — the published schema's field.
  const byName = new Map<string, Record<string, unknown>>();
  for (const entry of arr(data.stages)) {
    const s = obj(entry);
    const name = s && str(s.stage);
    if (name) byName.set(name, s!);
  }

  // All four always render, in the canonical order. A funnel that showed only
  // the stages the server sent would let a missing hop vanish rather than
  // appear as MISSING, which is the one thing this view exists to show.
  const stages: FunnelStage[] = FUNNEL_STAGES.map((name) => {
    const s = byName.get(name);
    const rawState = s ? str(s.state) : null;
    return {
      name,
      state:
        rawState === "OBSERVED" || rawState === "PARTIAL"
          ? (rawState as FunnelStageState)
          : "MISSING",
      events: arr(s?.events).flatMap((e) => {
        const event = readFunnelEvent(e);
        return event ? [event] : [];
      }),
      // Read, not counted. `events.length` is what came back; `event_count` is
      // how many exist. A stage with 200 fills and a 10-event window must be
      // able to say both, and only the server knows the first.
      eventCount: int(s?.event_count),
      returnedEventCount: int(s?.returned_event_count),
      truncated: s?.truncated === true,
    };
  });

  return {
    orderId,
    stages,
    incomplete: stages.some((s) => s.state !== "OBSERVED"),
    bounded: readBounded(data, "event_count", "returned_event_count"),
    window: readWindow(data.window),
  };
}

/* ---------------------------------------------------------------------------
 * Alpha 360° — insight batch
 * ------------------------------------------------------------------------ */

/** §3: one request carries at most this many items, and the schema enforces it. */
export const INSIGHT_BATCH_LIMIT = 64;

export type InsightItemState = "READY" | "ERROR" | "MISSING";
export type InsightMetricName =
  | "ALLOCATED_CAPITAL" | "USED_CAPITAL" | "NET_PNL" | "DRAWDOWN" | "CONTRIBUTION";

export interface InsightItem {
  insightId: string;
  alphaId: string;
  /** Echoed per item. A metric without its portfolio answers nobody. */
  portfolioId: string;
  state: InsightItemState;
  freshness: FreshnessState;
  metrics: readonly { metric: InsightMetricName; value: Decimal }[];
  /** Present when `state` is ERROR — isolated to this item. */
  errorCode: string | null;
  errorMessage: string | null;
}

export interface InsightBatch {
  portfolioId: string;
  /** Server-side counts. The client does not tally what it happened to render. */
  requestedCount: number | null;
  readyCount: number | null;
  errorCount: number | null;
  items: readonly InsightItem[];
}

export interface InsightItemRequest {
  insightId: string;
  alphaId: string;
}

/**
 * Split a request into batches the contract will accept.
 *
 * Exposed rather than left to each caller because 64 is a schema bound, not a
 * preference: a 65-item request is rejected outright, and a screen that
 * discovered that at runtime would render 64 cards and one silent hole.
 */
export function chunkInsightRequests<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += INSIGHT_BATCH_LIMIT) {
    out.push(items.slice(i, i + INSIGHT_BATCH_LIMIT));
  }
  return out;
}

/** Build one request body, refusing an over-long batch rather than sending it. */
export function insightBatchRequest(portfolioId: string, items: readonly InsightItemRequest[]) {
  if (items.length > INSIGHT_BATCH_LIMIT) {
    throw new Error(
      `An insight batch carries at most ${INSIGHT_BATCH_LIMIT} items; ${items.length} were given. Use chunkInsightRequests.`,
    );
  }
  return {
    portfolio_id: portfolioId,
    items: items.map((i) => ({ insight_id: i.insightId, alpha_id: i.alphaId })),
  };
}

const METRICS: readonly InsightMetricName[] = [
  "ALLOCATED_CAPITAL", "USED_CAPITAL", "NET_PNL", "DRAWDOWN", "CONTRIBUTION",
];

export function readInsightBatch(raw: unknown, expectedPortfolio: string): InsightBatch | null {
  const data = payload(raw);
  if (!data) return null;
  const portfolioId = readId(data.portfolio_id);
  // A batch echoed for a different portfolio is not a partial answer to this
  // one. Fail closed rather than render another portfolio's figures.
  if (!portfolioId || portfolioId !== expectedPortfolio) return null;

  const seen = new Set<string>();
  const items: InsightItem[] = [];
  for (const entry of arr(data.items)) {
    const it = obj(entry);
    const insightId = it && readId(it.insight_id);
    const alphaId = it && readId(it.alpha_id);
    const itemPortfolio = it && readId(it.portfolio_id);
    if (!insightId || !alphaId || seen.has(insightId)) continue;
    // Cross-portfolio leakage inside an otherwise-correct batch is exactly what
    // a cache bug looks like, so the item is dropped rather than shown.
    if (itemPortfolio && itemPortfolio !== portfolioId) continue;
    seen.add(insightId);
    const state = str(it!.state);
    const freshness = str(it!.freshness_state);
    items.push({
      insightId,
      alphaId,
      portfolioId: itemPortfolio ?? portfolioId,
      state: state === "READY" || state === "ERROR" ? (state as InsightItemState) : "MISSING",
      freshness: FRESHNESS.includes(freshness as FreshnessState)
        ? (freshness as FreshnessState)
        : "UNKNOWN",
      metrics: arr(it!.metrics).flatMap((m) => {
        const metric = obj(m);
        const name = metric && str(metric.metric);
        const value = metric && readDecimal(metric.value);
        return name && value && METRICS.includes(name as InsightMetricName)
          ? [{ metric: name as InsightMetricName, value }]
          : [];
      }),
      errorCode: str(it!.error_code),
      errorMessage: str(it!.error_message),
    });
  }
  return {
    portfolioId,
    requestedCount: int(data.requested_count),
    readyCount: int(data.ready_count),
    errorCount: int(data.error_count),
    items,
  };
}

/* ---------------------------------------------------------------------------
 * Portfolio 360° — correlation
 * ------------------------------------------------------------------------ */

/** §3: `dimension` is capped here in the schema. Above it, ranked pairs. */
export const CORRELATION_PACK_LIMIT = 150;
/** And the ranked fallback is itself bounded. */
export const CORRELATION_RANKED_LIMIT = 500;

export interface CorrelationLabel {
  entityId: string;
  displayName: string;
}

export interface CorrelationCluster {
  clusterId: string;
  label: string;
  members: readonly string[];
}

export interface PackedCorrelation {
  kind: "PACKED_MATRIX";
  portfolioId: string;
  labels: readonly CorrelationLabel[];
  clusters: readonly CorrelationCluster[];
  dimension: number;
  /** Lower triangle including the diagonal, row-major. Length n(n+1)/2. */
  values: readonly Decimal[];
  /**
   * Sample count per pair, packed identically. `null` when not published.
   *
   * `RANKED_PAIRS` carries `sample_count` on every pair; the packed matrix
   * carries none, so the rule *"render INSUFFICIENT_DATA when samples are below
   * the threshold instead of numbers"* cannot be applied per cell today. Read
   * here so it works the day the field lands, and `null` is surfaced by the
   * screen as a stated limitation rather than as sufficiency. See BR-EX-27.
   */
  sampleCounts: readonly number[] | null;
}

export interface RankedCorrelation {
  kind: "RANKED_PAIRS";
  portfolioId: string;
  labels: readonly CorrelationLabel[];
  clusters: readonly CorrelationCluster[];
  pairs: readonly {
    leftId: string;
    rightId: string;
    coefficient: Decimal;
    sampleCount: number | null;
  }[];
}

export type Correlation = PackedCorrelation | RankedCorrelation;

/**
 * Order two decimal strings by magnitude, without a float.
 *
 * Sorting needs a comparison and a comparison is not a computation, but
 * `Number(a) - Number(b)` still routes a decimal through a double — and the one
 * habit this codebase cannot afford is the one that looks harmless in the range
 * you happened to test. Correlations live in [-1, 1] where a double is exact
 * enough; capital does not, and a comparator copied from here to a money column
 * would be wrong in a way nothing catches.
 *
 * Returns a negative number when `a` is smaller in magnitude than `b`.
 */
export function compareAbsDecimal(a: string, b: string): number {
  const parts = (raw: string) => {
    const [int = "0", frac = ""] = raw.replace(/^[-+\u2212]/, "").split(".");
    return [int.replace(/^0+(?=\d)/, ""), frac] as const;
  };
  const [ai, af] = parts(a);
  const [bi, bf] = parts(b);
  if (ai.length !== bi.length) return ai.length - bi.length;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const width = Math.max(af.length, bf.length);
  const ap = af.padEnd(width, "0");
  const bp = bf.padEnd(width, "0");
  return ap === bp ? 0 : ap < bp ? -1 : 1;
}

/**
 * The packed index for `LOWER_INCLUDING_DIAGONAL_ROW_MAJOR`.
 *
 * `index = row × (row + 1) / 2 + column`, valid for `row ≥ column`. Callers may
 * ask in either order and this normalises, because a correlation is symmetric
 * and making every call site remember that is how one of them forgets.
 */
export function packedIndex(row: number, column: number): number {
  const [r, c] = row >= column ? [row, column] : [column, row];
  return (r * (r + 1)) / 2 + c;
}

/** Exact length the packing requires for `n` entities. */
export function packedLength(n: number): number {
  return (n * (n + 1)) / 2;
}

/**
 * Read one coefficient.
 *
 * Returns `null` past the edge rather than a zero. A zero correlation is a
 * strong claim of independence, which is the opposite of not knowing.
 */
export function correlationAt(
  matrix: PackedCorrelation,
  row: number,
  column: number,
): Decimal | null {
  const n = matrix.dimension;
  if (row < 0 || column < 0 || row >= n || column >= n) return null;
  return matrix.values[packedIndex(row, column)] ?? null;
}

function readLabels(raw: unknown): CorrelationLabel[] {
  return arr(raw).flatMap((l) => {
    const label = obj(l);
    const entityId = label && readId(label.entity_id);
    const displayName = label && str(label.display_name);
    return entityId && displayName ? [{ entityId, displayName }] : [];
  });
}

/**
 * Sample count behind one coefficient, or `null` when unknowable.
 *
 * Two different `null`s reach the same answer here and the screen must not
 * conflate them with a low count: out of range, and not published at all. Both
 * mean "cannot judge sufficiency", never "insufficient".
 */
export function samplesAt(
  matrix: PackedCorrelation,
  row: number,
  column: number,
): number | null {
  if (!matrix.sampleCounts) return null;
  const n = matrix.dimension;
  if (row < 0 || column < 0 || row >= n || column >= n) return null;
  return matrix.sampleCounts[packedIndex(row, column)] ?? null;
}

export function readCorrelation(raw: unknown): Correlation | null {
  const data = payload(raw);
  if (!data) return null;
  const portfolioId = readId(data.portfolio_id);
  if (!portfolioId) return null;
  const labels = readLabels(data.labels);
  const clusters = arr(data.clusters).flatMap((c) => {
    const cluster = obj(c);
    const clusterId = cluster && readId(cluster.cluster_id);
    const label = cluster && str(cluster.label);
    return clusterId && label
      ? [
          {
            clusterId,
            label,
            members: arr(cluster!.members).filter((m): m is string => typeof m === "string"),
          },
        ]
      : [];
  });

  const representation = obj(data.representation);
  if (!representation) return null;

  if (str(representation.kind) === "RANKED_PAIRS") {
    return {
      kind: "RANKED_PAIRS",
      portfolioId,
      labels,
      clusters,
      pairs: arr(representation.pairs)
        .flatMap((p) => {
          const pair = obj(p);
          const leftId = pair && readId(pair.left_id);
          const rightId = pair && readId(pair.right_id);
          const coefficient = pair && readDecimal(pair.coefficient);
          return leftId && rightId && coefficient
            ? [{ leftId, rightId, coefficient, sampleCount: int(pair!.sample_count) }]
            : [];
        })
        .slice(0, CORRELATION_RANKED_LIMIT),
    };
  }

  const matrix = obj(representation.matrix);
  if (!matrix) return null;
  const dimension = int(matrix.dimension);
  const values = arr(matrix.values).flatMap((v) => {
    const d = readDecimal(v);
    return d ? [d] : [];
  });
  // Three refusals, each because indexing past them returns the wrong pair
  // rather than nothing: an unknown packing, a dimension above the cap, and a
  // triangle whose length does not match its dimension.
  if (str(matrix.packing) !== "LOWER_INCLUDING_DIAGONAL_ROW_MAJOR") return null;
  if (dimension === null || dimension < 0 || dimension > CORRELATION_PACK_LIMIT) return null;
  if (values.length !== packedLength(dimension)) return null;

  // Optional and forward-compatible. A partial array is refused rather than
  // padded: an index that silently returned the wrong pair's sample count
  // would make the insufficiency rule fire on the wrong cells, which is worse
  // than not applying it at all.
  const rawCounts = arr(matrix.sample_counts);
  const sampleCounts =
    rawCounts.length === values.length
      ? rawCounts.map((c) => int(c)).filter((c): c is number => c !== null)
      : [];
  return {
    kind: "PACKED_MATRIX",
    portfolioId,
    labels,
    clusters,
    dimension,
    values,
    sampleCounts: sampleCounts.length === values.length ? sampleCounts : null,
  };
}

/* ---------------------------------------------------------------------------
 * Portfolio 360° — capital ledger
 * ------------------------------------------------------------------------ */

export type LedgerMovement =
  "INITIAL_ALLOCATE" | "ALLOCATE" | "WITHDRAW" | "REBALANCE" | "ADJUST";
/** Server-provided. The client never infers a direction from a sign. */
export type LedgerDirection = "INCREASE" | "DECREASE" | "UNCHANGED";

export interface LedgerEntry {
  ledgerId: string;
  allocationId: string | null;
  accountId: string;
  movementType: LedgerMovement;
  direction: LedgerDirection;
  amount: Decimal;
  beforeAllocated: Decimal;
  afterAllocated: Decimal;
  occurredAt: string | null;
}

export interface LedgerBucket {
  currency: string;
  /** Server-counted entries in this bucket. `null` when unpublished. */
  entryCount: number | null;
  /** Server-summed, per currency. Nothing is added across currencies. */
  grossIncrease: Decimal;
  grossDecrease: Decimal;
  entries: readonly LedgerEntry[];
}

export interface CapitalLedger {
  portfolioId: string;
  buckets: readonly LedgerBucket[];
  /** Population vs returned rows. The gross totals describe the population. */
  bounded: Bounded;
  window: AnalyticsWindow | null;
}

const MOVEMENTS: readonly LedgerMovement[] = [
  "INITIAL_ALLOCATE", "ALLOCATE", "WITHDRAW", "REBALANCE", "ADJUST",
];
const DIRECTIONS: readonly LedgerDirection[] = ["INCREASE", "DECREASE", "UNCHANGED"];

export function readCapitalLedger(raw: unknown): CapitalLedger | null {
  const data = payload(raw);
  if (!data) return null;
  const portfolioId = readId(data.portfolio_id);
  if (!portfolioId) return null;
  return {
    portfolioId,
    buckets: arr(data.buckets).flatMap((b) => {
      const bucket = obj(b);
      const currency = bucket && str(bucket.currency);
      const grossIncrease = bucket && readDecimal(bucket.gross_increase);
      const grossDecrease = bucket && readDecimal(bucket.gross_decrease);
      if (!currency || grossIncrease === null || grossDecrease === null) return [];
      return [
        {
          currency,
          entryCount: int(bucket!.entry_count),
          grossIncrease,
          grossDecrease,
          entries: arr(bucket!.entries).flatMap((e) => {
            const entry = obj(e);
            const ledgerId = entry && readId(entry.ledger_id);
            const accountId = entry && readId(entry.account_id);
            const amount = entry && readDecimal(entry.amount);
            const beforeAllocated = entry && readDecimal(entry.before_allocated);
            const afterAllocated = entry && readDecimal(entry.after_allocated);
            const movementType = entry && str(entry.movement_type);
            const direction = entry && str(entry.direction);
            if (
              !ledgerId || !accountId || amount === null ||
              beforeAllocated === null || afterAllocated === null ||
              !MOVEMENTS.includes(movementType as LedgerMovement) ||
              // A direction the client would have to guess is a direction it
              // must not show: the sign of `amount` is not the movement.
              !DIRECTIONS.includes(direction as LedgerDirection)
            ) {
              return [];
            }
            return [
              {
                ledgerId,
                allocationId: readId(entry!.allocation_id),
                accountId,
                movementType: movementType as LedgerMovement,
                direction: direction as LedgerDirection,
                amount,
                beforeAllocated,
                afterAllocated,
                occurredAt: readTimestamp(entry!.occurred_at),
              },
            ];
          }),
        },
      ];
    }),
    // The gross totals inside each bucket describe the whole validated
    // population, not the rows in this window. Keeping the two counts here
    // means a screen can say "showing 12 of 4,180" beside a total that is
    // correct for all 4,180 — which is the only honest way to show both.
    bounded: readBounded(data, "entry_count", "returned_entry_count"),
    window: readWindow(data.window),
  };
}

/* ---------------------------------------------------------------------------
 * Account / Broker 360° — binding exposure
 * ------------------------------------------------------------------------ */

export interface ExposureBucket {
  currency: string;
  /** How many accounts fed *this* bucket. Not the same as the binding total. */
  accountCount: number | null;
  used: Decimal | null;
  reserved: Decimal | null;
  available: Decimal | null;
  headroom: Decimal | null;
  oldestSourceAsOf: string | null;
  newestSourceAsOf: string | null;
}

/**
 * The server's verdict on whether a binding still has room.
 *
 * Read forward-compatibly, exactly as `sample_counts` is: BR-EX-26 asks for it
 * and no response carries it yet, so `null` here means "the source published no
 * verdict" and the screen renders `unavailable` rather than an `OK` it invented.
 *
 * The browser must never compute this. It sees only the buckets the endpoint
 * chose to return, so summing them answers a question about the response rather
 * than about the binding — and the screen it feeds is a fail-closed control:
 * a client that reports +2,120 of room while the execution cell holds 46,800
 * and refuses every order has told the operator the opposite of what is about
 * to happen.
 */
export interface AggregateVerdict {
  verdict: "OK" | "EXCEEDED" | "UNKNOWN";
  /** The authoritative figure behind the verdict, as a decimal string. */
  headroom: Decimal | null;
  /**
   * The two totals the verdict rests on: what the Portal's own records add to,
   * and what the venue holds. The hi-fi shows both because a verdict with no
   * visible working is an assertion, and this screen refuses assertions about
   * exposure.
   */
  virtualTotal: Decimal | null;
  physicalTotal: Decimal | null;
  currency: string | null;
  /** What evaluated it, so the screen can attribute the claim. */
  evaluatedBy: string | null;
  asOf: string | null;
}

const AGGREGATE_VERDICTS: readonly AggregateVerdict["verdict"][] = ["OK", "EXCEEDED", "UNKNOWN"];

function readAggregateVerdict(raw: unknown): AggregateVerdict | null {
  const o = obj(raw);
  if (!o) return null;
  const verdict = str(o.verdict);
  // Deny-by-default: an unrecognised verdict is not `OK`, and an absent one is
  // not a verdict at all.
  if (!verdict || !(AGGREGATE_VERDICTS as readonly string[]).includes(verdict)) return null;
  return {
    verdict: verdict as AggregateVerdict["verdict"],
    headroom: readDecimal(o.headroom),
    virtualTotal: readDecimal(o.virtual_total),
    physicalTotal: readDecimal(o.physical_total),
    currency: str(o.currency),
    evaluatedBy: str(o.evaluated_by),
    asOf: readTimestamp(o.as_of),
  };
}

/**
 * Map the server's verdict onto the shape `AccountBroker360` renders.
 *
 * Returns `null` unless every figure the screen displays is present. A partial
 * verdict is refused rather than shown with gaps, because the screen's own rule
 * is that a verdict with no visible working is an assertion — and half its
 * working is still no working.
 */
export function aggregateHeadroomFrom(
  aggregate: AggregateVerdict | null,
): {
  virtualTotal: Decimal;
  physicalTotal: Decimal;
  headroom: Decimal;
  currency: string;
  verdict: AggregateVerdict["verdict"];
} | null {
  if (
    !aggregate ||
    aggregate.headroom === null ||
    aggregate.virtualTotal === null ||
    aggregate.physicalTotal === null ||
    aggregate.currency === null
  ) {
    return null;
  }
  return {
    virtualTotal: aggregate.virtualTotal,
    physicalTotal: aggregate.physicalTotal,
    headroom: aggregate.headroom,
    currency: aggregate.currency,
    verdict: aggregate.verdict,
  };
}

export interface BindingExposure {
  bindingId: string;
  /**
   * `null` until BR-EX-26 lands. Rendered as an unavailable verdict with a
   * reason — never as `OK`, and never derived from `buckets`.
   */
  aggregate: AggregateVerdict | null;
  /** How many virtual accounts the aggregate actually covered. */
  accountCount: number | null;
  /** How many it should have covered. A mismatch is the whole point. */
  expectedAccountCount: number | null;
  completeness: PopulationCompleteness;
  buckets: readonly ExposureBucket[];
}

/**
 * May this aggregate be described as a total?
 *
 * §6.5: never label a partial binding aggregate as total. The count and the
 * expected count are two fields precisely so a screen can tell — a sum over 21
 * of 24 accounts is not the exposure, it is most of it, and on a screen whose
 * job is a safety claim the difference is the claim.
 */
export function isFullPopulation(exposure: BindingExposure): boolean {
  if (exposure.completeness !== "COMPLETE") return false;
  if (exposure.accountCount === null || exposure.expectedAccountCount === null) return false;
  return exposure.accountCount === exposure.expectedAccountCount;
}

export function readBindingExposure(raw: unknown): BindingExposure | null {
  const data = payload(raw);
  if (!data) return null;
  const bindingId = readId(data.binding_id);
  if (!bindingId) return null;
  return {
    bindingId,
    aggregate: readAggregateVerdict(data.aggregate),
    accountCount: int(data.account_count),
    expectedAccountCount: int(data.expected_account_count),
    completeness: readCompleteness(data.population_completeness),
    buckets: arr(data.buckets).flatMap((b) => {
      const bucket = obj(b);
      const currency = bucket && str(bucket.currency);
      return currency
        ? [
            {
              currency,
              accountCount: int(bucket!.account_count),
              used: readDecimal(bucket!.used),
              reserved: readDecimal(bucket!.reserved),
              available: readDecimal(bucket!.available),
              headroom: readDecimal(bucket!.headroom),
              oldestSourceAsOf: readTimestamp(bucket!.oldest_source_as_of),
              newestSourceAsOf: readTimestamp(bucket!.newest_source_as_of),
            },
          ]
        : [];
    }),
  };
}
