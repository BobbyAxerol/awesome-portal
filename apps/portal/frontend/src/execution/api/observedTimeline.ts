/**
 * `GET /api/v1/execution/views/observed-timeline` — EDS-09b / EDS-10b observed
 * timeline BFF (codex, FRONTEND_HANDOFF §8.51). A Portal observation of the
 * profile's current page of orders / fills / sessions / command-journal rows,
 * ordered `OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1`, never
 * an authoritative event replay. The reader keeps decimals as strings, keeps
 * the `after` cursor opaque and never reconstructs history from it. The
 * `projection.sequence` is the real revision the motion follows (G8).
 */
export type ObservedSubjectKind = "deployment" | "alpha" | "portfolio" | "account";
export type ObservedPanelState = "READY" | "EMPTY" | "PARTIAL" | "STALE" | "UNAVAILABLE";

export interface ObservedEntry {
  /** stable identity for row diffing: `${kind}:${id}` */
  key: string;
  observedAtMs: number;
  sourceClock: string | null;
  observationType: string;
  record: { kind: string; id: string };
  resource: { deploymentId: string | null; strategyId: string | null; accountId: string | null; portfolioId: string | null; sessionId: string | null; instrumentId: string | null };
  values: { price: string | null; quantity: string | null; realizedPnl: string | null };
  rejectedFields: string[];
}

export interface ObservedSegment { segment: string; state: string; reasonCode: string | null }
export interface ObservedMark { positionId: string | null; instrumentId: string | null; markPrice: string | null; markPriceAtMs: number | null }

export interface ObservedTimeline {
  schemaVersion: string;
  operationId: string | null;
  observationAuthority: string | null;
  observationSemantics: string | null;
  environment: string | null;
  resource: { kind: string | null; id: string | null };
  projection: { epochId: string | null; sequence: number | null; sourceAsOfMs: number | null; receivedAtMs: number | null; lastRefreshMs: number | null; completeness: string | null };
  timeline: {
    state: ObservedPanelState;
    reasonCode: string | null;
    retryable: boolean;
    asOfMs: number | null;
    readAtMs: number | null;
    label: string | null;
    orderingRule: string | null;
    historySemantics: string | null;
    entries: ObservedEntry[];
    segments: ObservedSegment[];
  };
  mark: {
    state: ObservedPanelState;
    reasonCode: string | null;
    label: string | null;
    marks: ObservedMark[];
    marketContext: { state: string | null; reasonCode: string | null };
  };
  page: { hasMore: boolean; nextCursor: string | null };
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const STATES: readonly ObservedPanelState[] = ["READY", "EMPTY", "PARTIAL", "STALE", "UNAVAILABLE"];
const panelState = (v: unknown): ObservedPanelState => (typeof v === "string" && (STATES as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as ObservedPanelState) : "UNAVAILABLE");

export function readObservedTimeline(raw: unknown): ObservedTimeline | null {
  const root = obj(raw);
  const schema = str(root.schema_version);
  if (!schema) return null;
  const projection = obj(root.projection);
  const panel = obj(root.observed_timeline);
  const data = obj(panel.data);
  const freshness = obj(panel.freshness);
  const entries: ObservedEntry[] = (Array.isArray(data.entries) ? data.entries : []).flatMap((row) => {
    const e = obj(row);
    const record = obj(e.source_record);
    const kind = str(record.kind), id = str(record.id);
    const at = int(e.observed_at_ms);
    if (!kind || !id || at === null) return [];
    const res = obj(e.resource), values = obj(e.values);
    return [{
      key: `${kind}:${id}`,
      observedAtMs: at,
      sourceClock: str(e.source_clock),
      observationType: str(e.observation_type) ?? `${kind}_OBSERVED`,
      record: { kind, id },
      resource: { deploymentId: str(res.deployment_id), strategyId: str(res.strategy_id), accountId: str(res.account_id), portfolioId: str(res.portfolio_id), sessionId: str(res.execution_session_id), instrumentId: str(res.instrument_id) },
      values: { price: str(values.price), quantity: str(values.quantity), realizedPnl: str(values.realized_pnl) },
      rejectedFields: (Array.isArray(e.rejected_exact_value_fields) ? e.rejected_exact_value_fields : []).flatMap((f) => (typeof f === "string" ? [f] : [])),
    }];
  });
  const segments: ObservedSegment[] = (Array.isArray(data.unavailable_segments) ? data.unavailable_segments : []).flatMap((row) => {
    const s = obj(row); const segment = str(s.segment);
    return segment ? [{ segment, state: str(s.state) ?? "UNAVAILABLE", reasonCode: str(s.reason_code) }] : [];
  });
  const markPanel = obj(root.mark_context);
  const markData = obj(markPanel.data);
  const marks: ObservedMark[] = (Array.isArray(markData.marks) ? markData.marks : []).map((row) => { const m = obj(row); return { positionId: str(m.position_id), instrumentId: str(m.instrument_id), markPrice: str(m.mark_price), markPriceAtMs: int(m.mark_price_at_ms) ?? int(m.observed_at_ms) }; });
  const marketContext = obj(markData.unavailable_market_context);
  const page = obj(root.page);
  const resource = obj(root.resource);
  return {
    schemaVersion: schema,
    operationId: str(root.logical_operation_id),
    observationAuthority: str(root.observation_authority),
    observationSemantics: str(root.observation_semantics),
    environment: str(root.environment),
    resource: { kind: str(resource.kind), id: str(resource.id) },
    projection: { epochId: str(projection.epoch_id), sequence: int(projection.sequence), sourceAsOfMs: int(projection.source_as_of_ms), receivedAtMs: int(projection.received_at_ms), lastRefreshMs: int(projection.last_successful_refresh_at_ms), completeness: str(projection.completeness) },
    timeline: {
      state: panelState(panel.state), reasonCode: str(panel.reason_code), retryable: panel.retryable === true,
      asOfMs: int(freshness.as_of_ms), readAtMs: int(freshness.read_at_ms),
      label: str(data.label), orderingRule: str(data.ordering_rule), historySemantics: str(panel.source_history_semantics) ?? str(data.source_history_semantics),
      entries, segments,
    },
    mark: { state: panelState(markPanel.state), reasonCode: str(markPanel.reason_code), label: str(markData.label), marks, marketContext: { state: str(marketContext.state), reasonCode: str(marketContext.reason_code) } },
    page: { hasMore: page.has_more === true, nextCursor: str(page.next_cursor) },
  };
}

export interface ObservedTimelineQuery {
  environment: "paper" | "sandbox" | "live";
  subjectKind: ObservedSubjectKind;
  subjectId: string;
  limit?: number;
  /** the Portal's own continuation token — passed back unchanged */
  after?: string | null;
}

export function observedTimelinePath(q: ObservedTimelineQuery): string {
  const params = new URLSearchParams({ environment: q.environment, subject_kind: q.subjectKind, subject_id: q.subjectId });
  if (q.limit !== undefined) params.set("limit", String(Math.max(1, Math.min(200, Math.round(q.limit)))));
  if (q.after) params.set("after", q.after);
  return `/views/observed-timeline?${params.toString()}`;
}

/** Entries of `next` that `previous` did not hold — the rows a revision brought in. */
export function newEntryKeys(previous: readonly ObservedEntry[] | null, next: readonly ObservedEntry[]): Set<string> {
  if (!previous) return new Set();
  const seen = new Set(previous.map((e) => e.key));
  return new Set(next.filter((e) => !seen.has(e.key)).map((e) => e.key));
}

export const OBSERVED_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type ObservedEnvironment = (typeof OBSERVED_ENVIRONMENTS)[number];

/**
 * The environments a subject is actually deployed in, read from the resource's
 * own `deployments` panel rows (`mode`), in paper → sandbox → live order. The
 * resource's `selected_environment` is the resolver's default (live when none
 * was requested) and says nothing about where the subject's rows live.
 */
export function deployedEnvironments(panels: Readonly<Record<string, unknown>> | null | undefined): ObservedEnvironment[] {
  const panel = panels?.deployments as { data?: { rows?: unknown } | null } | undefined;
  const rows = Array.isArray(panel?.data?.rows) ? (panel.data.rows as unknown[]) : [];
  const seen = new Set<ObservedEnvironment>();
  for (const row of rows) {
    const mode = typeof row === "object" && row !== null ? (row as { mode?: unknown }).mode : null;
    const env = OBSERVED_ENVIRONMENTS.find((item) => item === mode);
    if (env) seen.add(env);
  }
  return OBSERVED_ENVIRONMENTS.filter((env) => seen.has(env));
}
