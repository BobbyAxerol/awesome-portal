/**
 * N29-FE-01 — readers for the same-origin screen BFF (codex closeout
 * 2026-08-31, backend truth `e226ffb`).
 *
 * Every N22/N23 screen route answers ONE envelope shape: server-computed
 * `state / freshness / completeness`, a `capabilities[]` list that names each
 * data branch's availability WITH its reason code, and a sparse `data{}` of
 * canonical arrays. The reader never invents a row, never fills a gap, and
 * keeps every reason code so the screen can say precisely why a panel is not
 * there. Absent is absent — the states system does the talking.
 */
import {
  readExactDecimal,
  readGeneratedPanelEnvelope,
  readUtcEpochMs,
  type GeneratedPanelEnvelope,
} from "../screenDataContract";
import { v1Refusal } from "./schemaGuard";

export interface BranchCapability {
  capabilityId: string;
  state: string;
  reasonCode: string | null;
  retryable: boolean;
}

export interface ProfileEnvelope {
  schemaVersion: string;
  /** Server-computed UI state: ready/empty/partial/stale/unavailable/denied. */
  state: string;
  freshness: string | null;
  completeness: string | null;
  asOf: string | null;
  readAt: string | null;
  /** Canonical EDS-02 clocks; ISO aliases remain only for legacy component props. */
  asOfMs: number | null;
  readAtMs: number | null;
  workspaceId: string | null;
  selectedEnvironment: "paper" | "sandbox" | "live" | null;
  actor: string | null;
  recordAuthority: string | null;
  sourceAuthority: string | null;
  capabilities: readonly BranchCapability[];
  /** Canonical branch arrays, exactly as published; a missing key is absent. */
  data: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  /** Non-array data members (e.g. paper-workbench `deployment`, blotter `page`). */
  objects: Readonly<Record<string, Record<string, unknown>>>;
  /** Scalar data members (e.g. exact server counts). Scalars are never coerced. */
  scalars: Readonly<Record<string, string | number | boolean | null>>;
  unavailableBranches: readonly string[];
  /** Dynamic, generated EDS-02 panel contracts keyed by product branch. */
  panels: Readonly<Record<string, GeneratedPanelEnvelope>>;
  /**
   * Where the body breaks its published schema, when a reader that holds the schema checked it (the Paper workbench reader,
   * `v2/readers/paperRead.ts`). Absent = nobody checked; present and non-empty = the body is not the published contract and a screen
   * that claims the contract draws none of it. Never set by `readProfileEnvelope` itself.
   */
  schemaViolations?: readonly string[];
}

function obj(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Same bound as v2/boundary.ts MAX_DECIMAL_LENGTH: the published Decimal has no maxLength. */
const MAX_MONEY_LENGTH = 128;
const NEGATIVE_ZERO = /^-0+(\.0+)?$/;
/**
 * A money field is an exact decimal string (screenDataContract grammar: no
 * exponent, no `NaN`, no hex, no thousands comma, no leading zero) and not
 * `-0`. Anything else answers null, the same shape as a missing field.
 */
const money = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_MONEY_LENGTH || NEGATIVE_ZERO.test(v)) return null;
  const places = v.includes(".") ? v.length - v.indexOf(".") - 1 : 0;
  return readExactDecimal(v, "XXX", places);
};
/** An optional money field: absent stays absent, a present value must be a decimal. */
const optionalMoney = (v: unknown): { ok: boolean; value: string | null } =>
  v === undefined || v === null ? { ok: true, value: null } : { ok: money(v) !== null, value: money(v) };

export function readProfileEnvelope(raw: unknown): ProfileEnvelope | null {
  const root = obj(raw);
  const schemaVersion = str(root?.schema_version);
  const state = str(root?.state);
  if (!root || !schemaVersion || !state) return null;
  const dataRoot = obj(root.data) ?? {};
  const data: Record<string, readonly Record<string, unknown>[]> = {};
  const objects: Record<string, Record<string, unknown>> = {};
  const scalars: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(dataRoot)) {
    if (Array.isArray(value)) data[key] = value.flatMap((v) => (obj(v) ? [obj(v)!] : []));
    else if (obj(value)) objects[key] = obj(value)!;
    else if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      scalars[key] = value as string | number | boolean | null;
    }
  }
  const actor = obj(root.actor);
  const asOfMs = readUtcEpochMs(root.as_of_ms);
  const readAtMs = readUtcEpochMs(root.read_at_ms);
  const panels: Record<string, GeneratedPanelEnvelope> = {};
  const panelRoot = obj(root.panels);
  if (panelRoot) {
    for (const [key, value] of Object.entries(panelRoot)) {
      const panel = readGeneratedPanelEnvelope(value);
      if (panel) panels[key] = panel;
    }
  }
  return {
    schemaVersion,
    state,
    freshness: str(root.freshness),
    completeness: str(root.completeness),
    asOf: str(root.as_of) ?? (asOfMs === null ? null : new Date(asOfMs).toISOString()),
    readAt: str(root.read_at) ?? (readAtMs === null ? null : new Date(readAtMs).toISOString()),
    asOfMs,
    readAtMs,
    workspaceId: str(root.workspace_id),
    selectedEnvironment: (["paper", "sandbox", "live"] as const).find((item) => item === root.selected_environment) ?? null,
    actor: actor ? (str(actor.username) ?? str(actor.user_id)) : null,
    recordAuthority: str(root.record_authority),
    sourceAuthority: str(root.source_authority),
    capabilities: (Array.isArray(root.capabilities) ? root.capabilities : []).flatMap((c) => {
      const o = obj(c);
      const id = str(o?.capability_id);
      if (!o || !id) return [];
      return [{
        capabilityId: id,
        state: str(o.state) ?? "UNAVAILABLE",
        reasonCode: str(o.reason_code),
        // Fail closed: a branch whose retryability is unreadable is not retried.
        retryable: o.retryable === true,
      }];
    }),
    data,
    objects,
    scalars,
    unavailableBranches: (Array.isArray(root.unavailable_branches) ? root.unavailable_branches : []).flatMap((branch) => {
      if (typeof branch === "string") return [branch];
      const item = obj(branch);
      return item ? [str(item.reason_code) ?? str(item.capability_id) ?? "UNAVAILABLE"] : [];
    }),
    panels,
  };
}

/* ── N27 operator task catalogue (`execution.command-tasks.v1`) ──────────── */

export interface OperatorTaskParam {
  key: string;
  sourceRegistry: string | null;
  constraint: string | null;
  required: boolean;
  defaultValue: string | null;
}

export interface OperatorTask {
  taskId: string;
  taskGroup: string;
  title: string;
  tag: string;
  catalogKey: string | null;
  scope: string;
  cliForms: readonly string[];
  meta: string;
  /** FE-056 optional display metadata; null when the body predates it. `meta` stays the source reference. */
  displayName?: string | null;
  description?: string | null;
  scopeLabel?: string | null;
  params: readonly OperatorTaskParam[];
  typedConfirmWord: string | null;
  requiredRole: string | null;
  riskTier: string | null;
  stepUpRequired: boolean;
  twoManRule: boolean;
  planRequired: boolean;
  applyRequired: boolean;
  verifyRequired: boolean;
  /** N27 acceptance vocabulary. Nothing is enabled unless CONNECTED. */
  state: "CONNECTED" | "SUPPORTED_BUT_INACTIVE" | "SEMANTICALLY_INCOMPATIBLE";
  reasonCode: string | null;
  unlistedReason: string | null;
}

export interface OperatorTaskCatalogue {
  catalogueRevision: number | null;
  relayState: string | null;
  taskGroups: readonly string[];
  totalTasks: number | null;
  counts: { connected: number | null; inactive: number | null; incompatible: number | null };
  tasks: readonly OperatorTask[];
  actorRole: string | null;
}

export interface OperatorTaskRunResult {
  taskId: string;
  classification: "CONNECTED";
  transport: "SGP_LOCAL_PROJECTION";
  sourceRequestSent: false;
  responseDigest: string;
  result: Readonly<Record<string, unknown>>;
}

export function readOperatorTaskRunResult(raw: unknown): OperatorTaskRunResult | null {
  const root = obj(raw);
  const taskId = str(root?.task_id);
  const responseDigest = str(root?.response_digest);
  const result = obj(root?.result);
  if (!root || root.schema_version !== "execution.command-run-result.v1" || !taskId ||
      root.classification !== "CONNECTED" || root.transport !== "SGP_LOCAL_PROJECTION" ||
      root.source_request_sent !== false || !responseDigest?.match(/^sha256:[0-9a-f]{64}$/) || !result) {
    return null;
  }
  return {
    taskId,
    classification: "CONNECTED",
    transport: "SGP_LOCAL_PROJECTION",
    sourceRequestSent: false,
    responseDigest,
    result,
  };
}

const TASK_STATES = new Set(["CONNECTED", "SUPPORTED_BUT_INACTIVE", "SEMANTICALLY_INCOMPATIBLE"]);

export function readOperatorTasks(raw: unknown): OperatorTaskCatalogue | null {
  const root = obj(raw);
  if (!root || str(root.schema_version) !== "execution.command-tasks.v1" || !Array.isArray(root.tasks)) return null;
  const counts = obj(root.classification_counts);
  const scope = obj(root.scope);
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  return {
    catalogueRevision: int(root.catalogue_revision),
    relayState: str(root.relay_state),
    taskGroups: (Array.isArray(root.task_groups) ? root.task_groups : []).flatMap((g) => (typeof g === "string" ? [g] : [])),
    totalTasks: int(root.total_tasks),
    counts: {
      connected: int(counts?.CONNECTED),
      inactive: int(counts?.SUPPORTED_BUT_INACTIVE),
      incompatible: int(counts?.SEMANTICALLY_INCOMPATIBLE),
    },
    actorRole: scope ? str(scope.actor_role) : null,
    tasks: root.tasks.flatMap((t) => {
      const o = obj(t);
      const taskId = str(o?.task_id);
      const state = str(o?.state);
      if (!o || !taskId || !state || !TASK_STATES.has(state)) return [];
      const authority = obj(o.authority) ?? {};
      return [{
        taskId,
        taskGroup: str(o.task_group) ?? "READ_INSPECT",
        title: str(o.task_title) ?? taskId,
        tag: str(o.tag) ?? "READ",
        catalogKey: str(o.catalog_key),
        scope: str(o.scope) ?? "",
        cliForms: (Array.isArray(o.cli_forms) ? o.cli_forms : []).flatMap((c) => (typeof c === "string" ? [c] : [])),
        meta: str(o.meta) ?? "",
        displayName: str(o.display_name),
        description: str(o.description),
        scopeLabel: str(o.scope_label),
        params: (Array.isArray(o.params) ? o.params : []).flatMap((p) => {
          const po = obj(p);
          const key = str(po?.key);
          if (!po || !key) return [];
          return [{
            key,
            sourceRegistry: str(po.source_registry),
            constraint: str(po.constraint),
            required: po.required !== false,
            defaultValue: str(po.default),
          }];
        }),
        typedConfirmWord: str(o.typed_confirm_word),
        requiredRole: str(authority.required_role),
        riskTier: str(authority.risk_tier),
        // Dangerous direction on every one of these: absent must demand MORE
        // ceremony, never less.
        stepUpRequired: authority.step_up_required !== false,
        twoManRule: authority.two_man_rule !== false,
        planRequired: authority.plan_required !== false,
        applyRequired: authority.apply_required !== false,
        verifyRequired: authority.verify_required !== false,
        state: state as OperatorTask["state"],
        reasonCode: str(o.reason_code),
        unlistedReason: str(o.unlisted_reason),
      }];
    }),
  };
}

/* ── `governance.live-review.v1` (N23) ───────────────────────────────────── */

export interface LiveReviewPayload {
  approvalId: string;
  /** The workspace this review was read from; a decision must name the same
   *  one, and the controls stay disabled with a reason when it is null. */
  workspaceId: string | null;
  canaryDeploymentId: string | null;
  /** The full r2-review payload — decode with the existing `readGateR2Detail`. */
  governanceBackbone: unknown;
  /** Live facts envelope (profile-read). Empty is a valid live truth. */
  currentSource: ProfileEnvelope | null;
  /** The four canary-evidence branches; today every one is typed UNAVAILABLE. */
  derivedBranches: readonly BranchCapability[];
  readAt: string | null;
  actor: string | null;
}

export function readLiveReview(raw: unknown): LiveReviewPayload | null {
  if (v1Refusal(raw) !== null) return null;
  const root = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!root || root.schema_version !== "governance.live-review.v1") return null;
  const workspaceId = typeof root.workspace_id === "string" && root.workspace_id.length > 0 ? root.workspace_id : null;
  const approvalId = typeof root.approval_id === "string" ? root.approval_id : null;
  if (!approvalId) return null;
  const canary = typeof root.canary_ref === "object" && root.canary_ref !== null ? (root.canary_ref as Record<string, unknown>) : null;
  const actor = typeof root.actor === "object" && root.actor !== null ? (root.actor as Record<string, unknown>) : null;
  return {
    workspaceId,
    approvalId,
    canaryDeploymentId: canary && typeof canary.deployment_id === "string" ? canary.deployment_id : null,
    governanceBackbone: root.governance_backbone ?? null,
    currentSource: readProfileEnvelope(root.current_source),
    derivedBranches: (Array.isArray(root.derived_branches) ? root.derived_branches : []).flatMap((b) => {
      const o = typeof b === "object" && b !== null ? (b as Record<string, unknown>) : null;
      const id = o && typeof o.capability_id === "string" ? o.capability_id : null;
      if (!o || !id) return [];
      return [{
        capabilityId: id,
        state: typeof o.state === "string" ? o.state : "UNAVAILABLE",
        reasonCode: typeof o.reason_code === "string" ? o.reason_code : null,
        retryable: o.retryable === true,
      }];
    }),
    readAt: typeof root.read_at === "string" ? root.read_at : null,
    actor: actor && typeof actor.username === "string" ? actor.username : null,
  };
}

/* ── `execution.query-analytics-envelope.v1` (N25) ───────────────────────── */

export interface QueryAnalytics {
  subjectKind: string | null;
  subjectId: string | null;
  asOf: string | null;
  readAt: string | null;
  completeness: string | null;
  authority: string | null;
  formulaVersion: string | null;
  /** Per-analytics-branch availability with reason codes — 12 branches today. */
  capabilities: readonly BranchCapability[];
  orderFunnel: { totalOrders: number | null; statusCounts: Readonly<Record<string, number>> } | null;
  executionQuality: Readonly<Record<string, unknown>> | null;
  chartSeries: readonly Record<string, unknown>[];
  positions: readonly Record<string, unknown>[];
  /** Bounded facts selected server-side from one atomic local projection. */
  sourceFacts?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  replay?: {
    state: string | null;
    reasonCode: string | null;
    candlesState: string | null;
    candlesReasonCode: string | null;
    tradeLog: readonly Record<string, unknown>[];
  } | null;
  correlation: {
    state: string | null;
    reasonCode: string | null;
    formulaVersion: string | null;
    windowDays: number | null;
    alphaIds: readonly string[];
    /** Pairwise return correlation as the server computed it; `rho` is drawn, never re-derived. */
    pairs: readonly { left: string; right: string; rho: number; overlappingDays: number | null }[];
  } | null;
  /** `drawdown_overlap.v1` — per-alpha daily drawdown series and joint-drawdown windows. Optional: resource-derived facts carry none. */
  drawdownOverlap?: {
    state: string | null;
    reasonCode: string | null;
    formulaVersion: string | null;
    windowDays: number | null;
    alphas: readonly { alphaId: string; maxDrawdown: number | null; maxDrawdownAt: string | null; series: readonly { t: string; drawdown: number | null }[] }[];
    overlaps: readonly { from: string; to: string; alphaIds: readonly string[] }[];
  } | null;
}

export function readQueryAnalytics(raw: unknown): QueryAnalytics | null {
  const root = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  const a = root && typeof root.analytics === "object" && root.analytics !== null ? (root.analytics as Record<string, unknown>) : null;
  if (!root || !a) return null;
  const funnel = typeof a.order_funnel === "object" && a.order_funnel !== null ? (a.order_funnel as Record<string, unknown>) : null;
  const corr = typeof a.correlation === "object" && a.correlation !== null ? (a.correlation as Record<string, unknown>) : null;
  const dd = typeof a.drawdown_overlap === "object" && a.drawdown_overlap !== null ? (a.drawdown_overlap as Record<string, unknown>) : null;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const facts = typeof a.source_facts === "object" && a.source_facts !== null ? (a.source_facts as Record<string, unknown>) : {};
  const replay = typeof a.replay === "object" && a.replay !== null ? (a.replay as Record<string, unknown>) : null;
  const s = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    subjectKind: s(a.subject_kind),
    subjectId: s(a.subject_id),
    asOf: s(a.as_of),
    readAt: s(root.read_at),
    completeness: s(a.completeness),
    authority: s(a.authority),
    formulaVersion: s(a.formula_version),
    capabilities: (Array.isArray(a.capabilities) ? a.capabilities : []).flatMap((c) => {
      const o = typeof c === "object" && c !== null ? (c as Record<string, unknown>) : null;
      const id = o && typeof o.capability_id === "string" ? o.capability_id : null;
      if (!o || !id) return [];
      return [{ capabilityId: id, state: s(o.state) ?? "UNAVAILABLE", reasonCode: s(o.reason_code), retryable: o.retryable === true }];
    }),
    orderFunnel: funnel
      ? {
          totalOrders: typeof funnel.total_orders === "number" ? funnel.total_orders : null,
          statusCounts:
            typeof funnel.status_counts === "object" && funnel.status_counts !== null
              ? Object.fromEntries(Object.entries(funnel.status_counts as Record<string, unknown>).filter(([, v]) => typeof v === "number") as [string, number][])
              : {},
        }
      : null,
    executionQuality: typeof a.execution_quality === "object" && a.execution_quality !== null ? (a.execution_quality as Record<string, unknown>) : null,
    chartSeries: (Array.isArray(a.chart_series) ? a.chart_series : []).flatMap((v) => (typeof v === "object" && v !== null ? [v as Record<string, unknown>] : [])),
    positions: (Array.isArray(a.positions) ? a.positions : []).flatMap((v) => (typeof v === "object" && v !== null ? [v as Record<string, unknown>] : [])),
    sourceFacts: Object.fromEntries(Object.entries(facts).map(([key, value]) => [
      key,
      (Array.isArray(value) ? value : []).flatMap((row) => typeof row === "object" && row !== null ? [row as Record<string, unknown>] : []),
    ])),
    replay: replay ? {
      state: s(replay.state),
      reasonCode: s(replay.reason_code),
      candlesState: s(replay.candles_state),
      candlesReasonCode: s(replay.candles_reason_code),
      tradeLog: (Array.isArray(replay.trade_log) ? replay.trade_log : []).flatMap((row) =>
        typeof row === "object" && row !== null ? [row as Record<string, unknown>] : []),
    } : null,
    correlation: corr ? {
      state: s(corr.state),
      reasonCode: s(corr.reasonCode ?? corr.reason_code),
      formulaVersion: s(corr.formula_version),
      windowDays: num(obj(corr.window)?.days),
      alphaIds: (Array.isArray(corr.alpha_ids) ? corr.alpha_ids : []).flatMap((x) => (typeof x === "string" ? [x] : [])),
      pairs: (Array.isArray(corr.pairs) ? corr.pairs : []).flatMap((row) => {
        const o = obj(row);
        const left = s(o?.left_alpha);
        const right = s(o?.right_alpha);
        const rho = num(o?.correlation);
        return o && left && right && rho !== null ? [{ left, right, rho, overlappingDays: num(o.overlapping_days) }] : [];
      }),
    } : null,
    drawdownOverlap: dd ? {
      state: s(dd.state),
      reasonCode: s(dd.reason_code),
      formulaVersion: s(dd.formula_version),
      windowDays: num(obj(dd.window)?.days),
      alphas: (Array.isArray(dd.alphas) ? dd.alphas : []).flatMap((row) => {
        const o = obj(row);
        const alphaId = s(o?.alpha_id);
        if (!o || !alphaId) return [];
        return [{
          alphaId,
          maxDrawdown: num(o.max_drawdown),
          maxDrawdownAt: s(o.max_drawdown_at),
          series: (Array.isArray(o.series) ? o.series : []).flatMap((pt) => {
            const q = obj(pt);
            const at = s(q?.timestamp);
            return q && at ? [{ t: at, drawdown: num(q.drawdown) }] : [];
          }),
        }];
      }),
      overlaps: (Array.isArray(dd.overlaps) ? dd.overlaps : []).flatMap((row) => {
        const o = obj(row);
        const from = s(o?.from);
        const to = s(o?.to);
        return o && from && to ? [{ from, to, alphaIds: (Array.isArray(o.alpha_ids) ? o.alpha_ids : []).flatMap((x) => (typeof x === "string" ? [x] : [])) }] : [];
      }),
    } : null,
  };
}

/* ── BR-EX-72 manager list projections ─────────────────────────────────── */

export interface ManagerListPage<T> {
  rows: readonly T[];
  totalCount: number;
  filteredCount: number;
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
  /**
   * Rows that repeated an id already in this page. The first is kept, the
   * rest are counted here and never drawn, so a table never holds two rows
   * with one key and the count of what was set aside stays readable.
   */
  repeatedRowCount: number;
}

export interface AlphaFleetItem {
  alphaId: string;
  alphaLabel: string;
  version: string;
  stage: string;
  stages: readonly string[];
  owner: string | null;
  portfolios: readonly { portfolioId: string; name: string; baseCurrency: string }[];
  deployments: readonly AlphaFleetDeployment[];
  allocations: readonly CurrencyValue[];
  balances: readonly CurrencyBalance[];
  positionPnl: readonly CurrencyPnl[];
  exposure: readonly CurrencyValue[];
  health: string;
  attentionReasons: readonly string[];
  metricsAvailability: Readonly<Record<string, MetricState>>;
  updatedAt: string;
}

export interface CurrencyValue { currency: string; value: string }
export interface CurrencyBalance { currency: string; total: string; free: string; locked: string }
export interface CurrencyPnl { currency: string; realized: string; unrealized: string; net: string }
export interface MetricState { state: string; reasonCode: string | null }
export interface AlphaFleetDeployment {
  deploymentId: string; stage: string; venue: string; accountId: string;
  portfolioId: string | null; portfolioName: string | null; currency: string;
  allocation: string | null; balanceTotal: string | null; balanceFree: string | null;
  balanceLocked: string | null; positionFactCount: number;
  realizedPnl: string; unrealizedPnl: string; netPnl: string; exposure: string;
  state: string; active: boolean; health: string; updatedAt: string;
}

/** Alpha Resource V1 has a different contract from the Fleet list: it can
 * report qualified absence instead of an amount or timestamp. Keep that
 * shape separate so accepting it does not weaken the fleet-list reader. */
export interface AlphaResourceAvailability {
  state?: "AVAILABLE" | "UNAVAILABLE" | null;
  reasonCode?: string | null;
}
export interface AlphaResourceCurrencyValue extends AlphaResourceAvailability { currency: string; value: string | null }
export interface AlphaResourceCurrencyBalance extends AlphaResourceAvailability {
  currency: string; total: string | null; free: string | null; locked: string | null;
}
export interface AlphaResourceCurrencyPnl extends AlphaResourceAvailability {
  currency: string; realized: string | null; unrealized: string | null; net: string | null;
}
export interface AlphaResourceDeployment extends Omit<AlphaFleetDeployment,
  "positionFactCount" | "realizedPnl" | "unrealizedPnl" | "netPnl" | "exposure" | "updatedAt"> {
  positionFactCount: number | null;
  positionCountAvailability?: "AVAILABLE" | "UNAVAILABLE" | null;
  positionCountReasonCode?: string | null;
  realizedPnl: string | null; unrealizedPnl: string | null; netPnl: string | null; exposure: string | null;
  positionMetricsAvailability?: "UNAVAILABLE" | null;
  positionMetricsReasonCode?: string | null;
  updatedAt: string | null;
}
export interface AlphaResourceItem extends Omit<AlphaFleetItem,
  "portfolios" | "deployments" | "allocations" | "balances" | "positionPnl" | "exposure" | "updatedAt"> {
  portfolios: readonly { portfolioId: string | null; name: string; baseCurrency: string }[];
  deployments: readonly AlphaResourceDeployment[];
  allocations: readonly AlphaResourceCurrencyValue[];
  balances: readonly AlphaResourceCurrencyBalance[];
  positionPnl: readonly AlphaResourceCurrencyPnl[];
  exposure: readonly AlphaResourceCurrencyValue[];
  updatedAt: string | null;
}
export interface AlphaFleetSummary {
  alphaCount: number; deploymentCount: number; portfolioCount: number;
  needsAttentionCount: number; researchOnlyCount: number;
  stageCounts: Readonly<Record<string, number>>;
  allocationByCurrency: readonly CurrencyValue[];
  exposureByCurrency: readonly CurrencyValue[];
  currentPositionPnlByCurrency: readonly CurrencyPnl[];
  metricBasis: "CURRENT_SOURCE_FACTS";
}

export interface BindingItem {
  bindingId: string;
  accountId: string;
  venue: string;
  state: string;
  credentialState: string;
  updatedAt: string;
  /** FE-CAT-4. Present only when the producer published list figures for this row; absent means "read the row's two carriers". */
  figures?: BindingFigures;
}

/** One exact amount in one currency, as the owning source observed it. Never converted, never summed across currencies. */
export interface BindingAmountFigure {
  currency: string;
  /** The published decimal string, unchanged. */
  value: string;
  observedAt: string;
  coverage: "COMPLETE" | "PARTIAL" | "UNKNOWN";
}

export interface BindingSleeveFigure {
  count: number;
  observedAt: string;
  coverage: "COMPLETE" | "PARTIAL" | "UNKNOWN";
}

/**
 * A key that is absent was not published (this producer has no owning source for it); `null` is the owning source's typed
 * "not reported". A zero is only a published zero. `nativeEquity` is the venue's native equity, never the wallet balance.
 */
export interface BindingFigures {
  nativeEquity?: readonly BindingAmountFigure[] | null;
  virtualUsed?: readonly BindingAmountFigure[] | null;
  virtualHeadroom?: readonly BindingAmountFigure[] | null;
  sleeveCount?: BindingSleeveFigure | null;
}

/** FE-CAT-4. Counts over the same authorized snapshot as the page; `null` is "not computable", `0` is a counted zero. */
export interface BindingCounts {
  observedAt: string;
  coverage: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  all?: number | null;
  issues?: number | null;
  byEnvironment: Readonly<Partial<Record<"paper" | "sandbox" | "live", number | null>>>;
}

/** Both thresholds, because AGING is the gap between them. */
export interface FreshnessBudgetMs {
  readonly freshMs: number;
  readonly staleMs: number;
}

/** A budget is only usable if both halves are positive and ordered. */
function readFreshnessBudget(raw: unknown): FreshnessBudgetMs | null {
  const value = obj(raw);
  const freshMs = value?.fresh; const staleMs = value?.stale;
  if (typeof freshMs !== "number" || typeof staleMs !== "number") return null;
  if (!Number.isFinite(freshMs) || !Number.isFinite(staleMs)) return null;
  if (freshMs <= 0 || staleMs < freshMs) return null;
  return { freshMs, staleMs };
}

export interface ManagerListEnvelope<T> {
  environment: string;
  freshness: string;
  completeness: string;
  /**
   * R3-3 · who states the record, and who states the source behind it.
   *
   * Both are REQUIRED by `execution.bindings-list.v1`,
   * `execution.alpha-fleet-list.v1/v2` and `execution.portfolio-list.v1`. The
   * reader asserted `record_authority` and then dropped it, so four product
   * mastheads printed a constant instead: Alpha Fleet and Portfolios said
   * `EXECUTION`, Bindings said `BROKER`. `BROKER` was the wrong word — these
   * rows are a Portal projection of a Trading System read, and no broker
   * certified them. R3 rule 4 requires the source revision and authority to
   * survive to the panel, and R3-3 forbids implying broker certification.
   */
  recordAuthority: string;
  sourceAuthority: string | null;
  sourceAsOf: string | null;
  /**
   * PHASE 3 (round 2) · the instant `freshness` is computed from.
   *
   * `sourceAsOf` is when the source published; this is when our projection
   * last refreshed, and the tier is derived from it. Showing one beside the
   * other gave the reader a tier they could not check.
   */
  projectionRefreshedAt: string | null;
  /**
   * The two thresholds the tier was decided against, in milliseconds, as the
   * server's own policy declares them. Published so the tier is checkable:
   * without them the reader sees "FRESH · 12s ago" and has no way to know
   * whether 12s is inside the budget.
   */
  freshnessBudgetMs: FreshnessBudgetMs | null;
  readAt: string;
  page: ManagerListPage<T>;
  summary?: AlphaFleetSummary;
  /** Bindings list only (FE-CAT-4): published only when the producer could compute them from owning facts. */
  counts?: BindingCounts;
}

function readManagerPage<T>(
  raw: unknown,
  row: (value: unknown) => T | null,
  keyOf: (item: T) => string,
): ManagerListPage<T> | null {
  const root = obj(raw);
  if (!root || !Array.isArray(root.rows)) return null;
  const parsed = root.rows.map(row);
  if (parsed.some((item) => item === null)) return null;
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const item of parsed as T[]) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const totalCount = count(root.total_count);
  const filteredCount = count(root.filtered_count);
  if (totalCount === null || filteredCount === null) return null;
  return {
    rows, totalCount, filteredCount, repeatedRowCount: parsed.length - rows.length,
    nextCursor: str(root.next_cursor), prevCursor: str(root.prev_cursor),
    hasMore: root.has_more === true, hasPrevious: root.has_previous === true,
  };
}

function readManagerEnvelope<T>(
  raw: unknown,
  schemaVersion: string,
  row: (value: unknown) => T | null,
  keyOf: (item: T) => string,
  summary?: (value: unknown) => AlphaFleetSummary | null,
): ManagerListEnvelope<T> | null {
  const root = obj(raw);
  if (!root || root.schema_version !== schemaVersion || root.record_authority !== "PORTAL_PROJECTION") return null;
  const page = readManagerPage(root.page, row, keyOf);
  const environment = str(root.environment);
  const freshness = str(root.freshness);
  const completeness = str(root.completeness);
  const readAt = str(root.read_at);
  const parsedSummary = summary ? summary(root.summary) : undefined;
  if (!page || !environment || !freshness || !completeness || !readAt || (summary && !parsedSummary)) return null;
  return { environment, freshness, completeness, sourceAsOf: str(root.source_as_of),
    projectionRefreshedAt: str(root.projection_refreshed_at),
    freshnessBudgetMs: readFreshnessBudget(root.freshness_budget_ms),
    // Asserted just above, so it is a string by construction; published
    // rather than merely checked, because the masthead has to name it.
    recordAuthority: "PORTAL_PROJECTION",
    sourceAuthority: str(root.source_authority),
    readAt, page, ...(parsedSummary ? { summary: parsedSummary } : {}) };
}

/** Reused by the EDS-04 named Alpha resource BFF; no client-side joins. */
export function readAlphaFleetItem(raw: unknown): AlphaFleetItem | null {
  const root = obj(raw);
  if (!root || !Array.isArray(root.deployments) || !Array.isArray(root.portfolios)
    || !Array.isArray(root.allocations) || !Array.isArray(root.balances)
    || !Array.isArray(root.position_pnl) || !Array.isArray(root.exposure)
    || !Array.isArray(root.attention_reasons)) return null;
  const alphaId = str(root.alpha_id); const alphaLabel = str(root.alpha_label);
  const version = str(root.version); const stage = str(root.stage); const updatedAt = str(root.updated_at);
  const health = str(root.health); const metrics = obj(root.metrics_availability);
  const stages = Array.isArray(root.stages)
    ? root.stages.flatMap((value) => typeof value === "string" && value.length > 0 ? [value] : []) : [];
  if (!alphaId || !alphaLabel || !version || !stage || stages.length !== (Array.isArray(root.stages) ? root.stages.length : -1)
    || stages.length === 0 || !health || !updatedAt || !metrics) return null;
  const deployments = exactArray(root.deployments, readFleetDeployment);
  const portfolios = exactArray(root.portfolios, (value) => {
    const item = obj(value); const portfolioId = str(item?.portfolio_id);
    const name = str(item?.name); const baseCurrency = str(item?.base_currency);
    return item && portfolioId && name && baseCurrency ? { portfolioId, name, baseCurrency } : null;
  });
  const allocations = exactArray(root.allocations, readCurrencyValue);
  const balances = exactArray(root.balances, readCurrencyBalance);
  const positionPnl = exactArray(root.position_pnl, readCurrencyPnl);
  const exposure = exactArray(root.exposure, readCurrencyValue);
  const metricsAvailability = Object.fromEntries(Object.entries(metrics).flatMap(([key, value]) => {
    const item = obj(value); const state = str(item?.state);
    return item && state ? [[key, { state, reasonCode: str(item.reason_code) }] as const] : [];
  }));
  if (!deployments || !portfolios || !allocations || !balances || !positionPnl || !exposure
    || Object.keys(metricsAvailability).length !== Object.keys(metrics).length
    || root.attention_reasons.some((value) => typeof value !== "string")) return null;
  return {
    alphaId, alphaLabel, version, stage, stages, owner: str(root.owner), portfolios, deployments,
    allocations, balances, positionPnl, exposure, health,
    attentionReasons: root.attention_reasons as string[], metricsAvailability, updatedAt,
  };
}

/** Resource V1 reader; call only after the envelope's schema-version dispatch.
 * A typed absence is retained, never reinterpreted as a numeric zero. */
export function readAlphaResourceItem(raw: unknown): AlphaResourceItem | null {
  const root = obj(raw);
  if (!root || !Array.isArray(root.deployments) || !Array.isArray(root.portfolios)
    || !Array.isArray(root.allocations) || !Array.isArray(root.balances)
    || !Array.isArray(root.position_pnl) || !Array.isArray(root.exposure)
    || !Array.isArray(root.attention_reasons)) return null;
  const alphaId = str(root.alpha_id), alphaLabel = str(root.alpha_label), version = str(root.version), stage = str(root.stage);
  const health = str(root.health), updatedAt = str(root.updated_at), metrics = obj(root.metrics_availability);
  const stages = Array.isArray(root.stages)
    ? root.stages.flatMap((value) => typeof value === "string" && value.length > 0 ? [value] : []) : [];
  if (!alphaId || !alphaLabel || !version || !stage || !health || !metrics
    || (root.updated_at !== null && updatedAt === null)
    || stages.length !== (Array.isArray(root.stages) ? root.stages.length : -1)
    || root.attention_reasons.some((value) => typeof value !== "string")) return null;
  const portfolios = exactArray(root.portfolios, (value) => {
    const item = obj(value), name = str(item?.name), baseCurrency = str(item?.base_currency);
    const portfolioId = str(item?.portfolio_id);
    return item && name && baseCurrency && (item.portfolio_id === null || portfolioId)
      ? { portfolioId, name, baseCurrency } : null;
  });
  const deployments = exactArray(root.deployments, readAlphaResourceDeployment);
  const allocations = exactArray(root.allocations, readAlphaResourceCurrencyValue);
  const balances = exactArray(root.balances, readAlphaResourceCurrencyBalance);
  const positionPnl = exactArray(root.position_pnl, readAlphaResourceCurrencyPnl);
  const exposure = exactArray(root.exposure, readAlphaResourceCurrencyValue);
  const metricsAvailability: Record<string, MetricState> = {};
  for (const [key, value] of Object.entries(metrics)) {
    const metric = obj(value);
    if (!metric || !["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"].includes(String(metric.state))
      || (metric.reason_code !== null && typeof metric.reason_code !== "string")) return null;
    metricsAvailability[key] = { state: metric.state as string, reasonCode: metric.reason_code as string | null };
  }
  if (!portfolios || !deployments || !allocations || !balances || !positionPnl || !exposure) return null;
  return { alphaId, alphaLabel, version, stage, stages, owner: str(root.owner), portfolios, deployments,
    allocations, balances, positionPnl, exposure, health, attentionReasons: root.attention_reasons as string[],
    metricsAvailability, updatedAt };
}

function readAlphaResourceDeployment(value: unknown): AlphaResourceDeployment | null {
  const item = obj(value); if (!item) return null;
  const deploymentId = str(item.deployment_id), stage = str(item.stage), venue = str(item.venue);
  const accountId = str(item.account_id), currency = str(item.currency), state = str(item.state);
  const health = str(item.health), updatedAt = str(item.updated_at);
  const allocation = requiredNullableMoney(item.allocation), balanceTotal = requiredNullableMoney(item.balance_total);
  const balanceFree = requiredNullableMoney(item.balance_free), balanceLocked = requiredNullableMoney(item.balance_locked);
  const realizedPnl = requiredNullableMoney(item.realized_pnl), unrealizedPnl = requiredNullableMoney(item.unrealized_pnl);
  const netPnl = requiredNullableMoney(item.net_pnl), exposure = requiredNullableMoney(item.exposure);
  const count = typeof item.position_fact_count === "number" && Number.isSafeInteger(item.position_fact_count)
    && item.position_fact_count >= 0 ? item.position_fact_count : null;
  const countState = item.position_count_availability;
  const countReason = item.position_count_reason_code;
  const countValid = countState === undefined
    ? count !== null && (countReason === undefined || countReason === null || countReason === "POSITION_POPULATION_NOT_QUALIFIED")
    : countState === "AVAILABLE" ? count !== null && countReason === null
      : countState === "UNAVAILABLE" && item.position_fact_count === null && countReason === "POSITION_POPULATION_NOT_QUALIFIED";
  const metricsState = item.position_metrics_availability;
  const metricsReason = item.position_metrics_reason_code;
  const metricsValid = metricsState === undefined
    ? [realizedPnl, unrealizedPnl, netPnl, exposure].every((amount) => amount.ok && amount.value !== null)
      && (metricsReason === undefined || metricsReason === "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED")
    : metricsState === "UNAVAILABLE" && metricsReason === "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED"
      && [realizedPnl, unrealizedPnl, netPnl, exposure].every((amount) => amount.ok && amount.value === null);
  if (!deploymentId || !stage || !venue || !accountId || !currency || !state || !health
    || (item.updated_at !== null && updatedAt === null) || typeof item.active !== "boolean"
    || !allocation.ok || !balanceTotal.ok || !balanceFree.ok || !balanceLocked.ok || !countValid || !metricsValid) return null;
  return { deploymentId, stage, venue, accountId, portfolioId: str(item.portfolio_id), portfolioName: str(item.portfolio_name),
    currency, allocation: allocation.value, balanceTotal: balanceTotal.value, balanceFree: balanceFree.value,
    balanceLocked: balanceLocked.value, positionFactCount: count,
    positionCountAvailability: countState === "AVAILABLE" || countState === "UNAVAILABLE" ? countState : null,
    positionCountReasonCode: typeof countReason === "string" ? countReason : null,
    realizedPnl: realizedPnl.value, unrealizedPnl: unrealizedPnl.value, netPnl: netPnl.value, exposure: exposure.value,
    positionMetricsAvailability: metricsState === "UNAVAILABLE" ? metricsState : null,
    positionMetricsReasonCode: typeof metricsReason === "string" ? metricsReason : null,
    state, active: item.active, health, updatedAt };
}

function requiredNullableMoney(value: unknown): { ok: boolean; value: string | null } {
  if (value === null) return { ok: true, value: null };
  const result = money(value);
  return { ok: result !== null, value: result };
}

function alphaResourceAvailability(item: Record<string, unknown>, amounts: readonly { ok: boolean; value: string | null }[],
  reason: string, nullWhenUnavailable = false): AlphaResourceAvailability | null {
  if (amounts.some((amount) => !amount.ok)) return null;
  const state = item.state, code = item.reason_code;
  if (state === undefined) {
    if (amounts.some((amount) => amount.value === null) || (code !== undefined && code !== null && typeof code !== "string")) return null;
    return { state: null, reasonCode: typeof code === "string" ? code : null };
  }
  if (state === "AVAILABLE" && code === null && amounts.every((amount) => amount.value !== null)) return { state, reasonCode: null };
  if (state === "UNAVAILABLE" && code === reason && (!nullWhenUnavailable || amounts.every((amount) => amount.value === null)))
    return { state, reasonCode: reason };
  return null;
}

function readAlphaResourceCurrencyValue(value: unknown): AlphaResourceCurrencyValue | null {
  const item = obj(value), currency = str(item?.currency); if (!item || !currency) return null;
  const amount = requiredNullableMoney(item.value), availability = alphaResourceAvailability(item, [amount], "FINANCIAL_AGGREGATE_SOURCE_NOT_QUALIFIED");
  return availability ? { currency, value: amount.value, ...availability } : null;
}
function readAlphaResourceCurrencyBalance(value: unknown): AlphaResourceCurrencyBalance | null {
  const item = obj(value), currency = str(item?.currency); if (!item || !currency) return null;
  const total = requiredNullableMoney(item.total), free = requiredNullableMoney(item.free), locked = requiredNullableMoney(item.locked);
  const availability = alphaResourceAvailability(item, [total, free, locked], "FINANCIAL_AGGREGATE_SOURCE_NOT_QUALIFIED");
  return availability ? { currency, total: total.value, free: free.value, locked: locked.value, ...availability } : null;
}
function readAlphaResourceCurrencyPnl(value: unknown): AlphaResourceCurrencyPnl | null {
  const item = obj(value), currency = str(item?.currency); if (!item || !currency) return null;
  const realized = requiredNullableMoney(item.realized), unrealized = requiredNullableMoney(item.unrealized), net = requiredNullableMoney(item.net);
  const availability = alphaResourceAvailability(item, [realized, unrealized, net], "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED", true);
  if (availability?.state === "AVAILABLE") return null; // V1 publishes typed UNAVAILABLE or the older untagged shape.
  return availability ? { currency, realized: realized.value, unrealized: unrealized.value, net: net.value, ...availability } : null;
}

function exactArray<T>(raw: unknown[], reader: (value: unknown) => T | null): T[] | null {
  const values = raw.map(reader); return values.some((value) => value === null) ? null : values as T[];
}

function readFleetDeployment(value: unknown): AlphaFleetDeployment | null {
  const item = obj(value); if (!item) return null;
  const deploymentId = str(item.deployment_id); const stage = str(item.stage); const venue = str(item.venue);
  const accountId = str(item.account_id); const currency = str(item.currency); const state = str(item.state);
  const health = str(item.health); const updatedAt = str(item.updated_at);
  const realizedPnl = money(item.realized_pnl); const unrealizedPnl = money(item.unrealized_pnl);
  const netPnl = money(item.net_pnl); const exposure = money(item.exposure);
  const allocation = optionalMoney(item.allocation); const balanceTotal = optionalMoney(item.balance_total);
  const balanceFree = optionalMoney(item.balance_free); const balanceLocked = optionalMoney(item.balance_locked);
  const positionFactCount = typeof item.position_fact_count === "number"
    && Number.isSafeInteger(item.position_fact_count) && item.position_fact_count >= 0
    ? item.position_fact_count : null;
  if (!deploymentId || !stage || !venue || !accountId || !currency || !state || !health || !updatedAt
    || !realizedPnl || !unrealizedPnl || !netPnl || !exposure || positionFactCount === null
    || !allocation.ok || !balanceTotal.ok || !balanceFree.ok || !balanceLocked.ok
    || typeof item.active !== "boolean") return null;
  return {
    deploymentId, stage, venue, accountId, portfolioId: str(item.portfolio_id),
    portfolioName: str(item.portfolio_name), currency, allocation: allocation.value,
    balanceTotal: balanceTotal.value, balanceFree: balanceFree.value,
    balanceLocked: balanceLocked.value, positionFactCount,
    realizedPnl, unrealizedPnl, netPnl, exposure, state, active: item.active, health, updatedAt,
  };
}

function readCurrencyValue(value: unknown): CurrencyValue | null {
  const item = obj(value); const currency = str(item?.currency); const exactValue = money(item?.value);
  return item && currency && exactValue ? { currency, value: exactValue } : null;
}
function readCurrencyBalance(value: unknown): CurrencyBalance | null {
  const item = obj(value); const currency = str(item?.currency); const total = money(item?.total);
  const free = money(item?.free); const locked = money(item?.locked);
  return item && currency && total && free && locked ? { currency, total, free, locked } : null;
}
function readCurrencyPnl(value: unknown): CurrencyPnl | null {
  const item = obj(value); const currency = str(item?.currency); const realized = money(item?.realized);
  const unrealized = money(item?.unrealized); const net = money(item?.net);
  return item && currency && realized && unrealized && net ? { currency, realized, unrealized, net } : null;
}

function readFleetSummary(raw: unknown): AlphaFleetSummary | null {
  const root = obj(raw); const stageCountsRaw = obj(root?.stage_counts);
  if (!root || !stageCountsRaw || root.metric_basis !== "CURRENT_SOURCE_FACTS") return null;
  const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const alphaCount = integer(root.alpha_count); const deploymentCount = integer(root.deployment_count);
  const portfolioCount = integer(root.portfolio_count); const needsAttentionCount = integer(root.needs_attention_count);
  const researchOnlyCount = integer(root.research_only_count);
  const stageCounts = Object.fromEntries(Object.entries(stageCountsRaw).filter(([, value]) => integer(value) !== null)) as Record<string, number>;
  const allocations = Array.isArray(root.allocation_by_currency) ? exactArray(root.allocation_by_currency, readCurrencyValue) : null;
  const exposure = Array.isArray(root.exposure_by_currency) ? exactArray(root.exposure_by_currency, readCurrencyValue) : null;
  const pnl = Array.isArray(root.current_position_pnl_by_currency) ? exactArray(root.current_position_pnl_by_currency, readCurrencyPnl) : null;
  if (alphaCount === null || deploymentCount === null || portfolioCount === null || needsAttentionCount === null
    || researchOnlyCount === null || Object.keys(stageCounts).length !== Object.keys(stageCountsRaw).length
    || !allocations || !exposure || !pnl) return null;
  return { alphaCount, deploymentCount, portfolioCount, needsAttentionCount, researchOnlyCount,
    stageCounts, allocationByCurrency: allocations, exposureByCurrency: exposure,
    currentPositionPnlByCurrency: pnl, metricBasis: "CURRENT_SOURCE_FACTS" };
}

/** Reused by the EDS-04 named Binding resource BFF; non-secret shape only. */
export function readBindingItem(raw: unknown): BindingItem | null {
  const root = obj(raw);
  const bindingId = str(root?.binding_id); const accountId = str(root?.account_id);
  const venue = str(root?.venue); const state = str(root?.state);
  const credentialState = str(root?.credential_state); const updatedAt = str(root?.updated_at);
  if (!(root && bindingId && accountId && venue && state && credentialState && updatedAt)) return null;
  // `figures` is optional; present but malformed rejects the row (the page then fails closed), never a partial figure.
  if (root.figures === undefined) return { bindingId, accountId, venue, state, credentialState, updatedAt };
  const figures = readBindingFigures(root.figures);
  return figures ? { bindingId, accountId, venue, state, credentialState, updatedAt, figures } : null;
}

const COVERAGES = ["COMPLETE", "PARTIAL", "UNKNOWN"] as const;
const coverageOf = (v: unknown) => (COVERAGES as readonly unknown[]).includes(v) ? (v as (typeof COVERAGES)[number]) : null;
const instantOf = (v: unknown) => { const s = str(v); return s !== null && Number.isFinite(Date.parse(s)) ? s : null; };

function readAmountFigure(raw: unknown): BindingAmountFigure | null {
  const item = obj(raw); const currency = str(item?.currency); const value = money(item?.value);
  const observedAt = instantOf(item?.observed_at); const coverage = coverageOf(item?.coverage);
  return item && currency && value !== null && observedAt && coverage ? { currency, value, observedAt, coverage } : null;
}

/** One entry per currency, 1 to 8 entries: two entries for one currency are ambiguous and rejected, never merged. */
function readAmountFigures(raw: unknown): readonly BindingAmountFigure[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) return null;
  const entries = exactArray(raw, readAmountFigure);
  return entries && new Set(entries.map((entry) => entry.currency)).size === entries.length ? entries : null;
}

function readSleeveFigure(raw: unknown): BindingSleeveFigure | null {
  const item = obj(raw); const observedAt = instantOf(item?.observed_at); const coverage = coverageOf(item?.coverage);
  return item && typeof item.count === "number" && Number.isSafeInteger(item.count) && item.count >= 0 && observedAt && coverage
    ? { count: item.count, observedAt, coverage } : null;
}

function readBindingFigures(raw: unknown): BindingFigures | null {
  const root = obj(raw);
  if (!root) return null;
  const out: { -readonly [K in keyof BindingFigures]: BindingFigures[K] } = {};
  // Only the four published keys are read; any other key (a wallet balance, say) is ignored, never promoted.
  for (const [wire, key] of [["native_equity", "nativeEquity"], ["virtual_used", "virtualUsed"], ["virtual_headroom", "virtualHeadroom"]] as const) {
    if (root[wire] === undefined) continue;
    if (root[wire] === null) { out[key] = null; continue; }
    const value = readAmountFigures(root[wire]);
    if (!value) return null;
    out[key] = value;
  }
  if (root.sleeve_count !== undefined) {
    if (root.sleeve_count === null) out.sleeveCount = null;
    else {
      const sleeves = readSleeveFigure(root.sleeve_count);
      if (!sleeves) return null;
      out.sleeveCount = sleeves;
    }
  }
  return out;
}

/** `undefined` = not published, `null` = typed "not computable", an integer = a counted value (0 included). */
function countOf(v: unknown): { ok: true; value: number | null | undefined } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: v };
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? { ok: true, value: v } : { ok: false };
}

function readBindingCounts(raw: unknown): BindingCounts | null {
  const root = obj(raw); const byRaw = root?.by_environment === undefined ? {} : obj(root.by_environment);
  const observedAt = instantOf(root?.observed_at); const coverage = coverageOf(root?.coverage);
  if (!root || !byRaw || root.basis !== "AUTHORIZED_SNAPSHOT" || !observedAt || !coverage) return null;
  const all = countOf(root.all); const issues = countOf(root.issues);
  const envs = (["paper", "sandbox", "live"] as const).map((env) => [env, countOf(byRaw[env])] as const);
  if (!all.ok || !issues.ok || envs.some(([, c]) => !c.ok)) return null;
  const byEnvironment: { paper?: number | null; sandbox?: number | null; live?: number | null } = {};
  for (const [env, c] of envs) if (c.ok && c.value !== undefined) byEnvironment[env] = c.value;
  return {
    observedAt, coverage, byEnvironment,
    ...(all.value !== undefined ? { all: all.value } : {}),
    ...(issues.value !== undefined ? { issues: issues.value } : {}),
  };
}

/* ── BR-EX-76 portfolio identity list (P4-A) ───────────────────────────── */

export interface PortfolioListItem {
  portfolioId: string;
  name: string;
  owner: string | null;
  state: string;
  baseCurrency: string;
  environments: readonly string[];
  allocationCount: number;
  deploymentCount: number;
  allocatedByCurrency: readonly CurrencyValue[];
  updatedAt: string;
  /** WP-K slice 6 (N3). Absent = this producer has no owning source. A published roll-up is the worst class among the deployments, with the counts. */
  health?: PortfolioHealthRead;
  /** WP-K (GAP-17): the capital root; absent = no owning source. */
  rootId?: string;
  /** WP-K (GAP-19): the owner as a Portal user id (a link target); `null` = the owner has none; absent = no owning source. `owner` stays the display text. */
  ownerUserId?: string | null;
}

export const PORTFOLIO_HEALTH_CLASSES = ["HEALTHY", "ATTENTION", "DEGRADED", "HALTED"] as const;
export type PortfolioHealthClass = (typeof PORTFOLIO_HEALTH_CLASSES)[number];
export type PortfolioHealthRead =
  | { state: "PUBLISHED"; value: PortfolioHealthClass; deploymentsByHealth: Readonly<Record<PortfolioHealthClass, number>>; asOf: string }
  | { state: "NOT_PUBLISHED"; reasonCode: string };

/** PH-1: a published roll-up is the WORST class that has a deployment, at least one deployment counted, and never more than the portfolio has. */
function readPortfolioHealth(raw: unknown, deploymentCount: number): PortfolioHealthRead | null {
  const h = obj(raw);
  if (!h || Object.keys(h).sort().join(",") !== "as_of,basis,deployments_by_health,reason_code,state,value") return null;
  if (h.state === "NOT_PUBLISHED") {
    const reasonCode = str(h.reason_code);
    return reasonCode && /^[A-Z][A-Z0-9_]{1,63}$/.test(reasonCode) && h.value === null && h.basis === null && h.deployments_by_health === null && h.as_of === null ? { state: "NOT_PUBLISHED", reasonCode } : null;
  }
  const counts = obj(h.deployments_by_health);
  const asOf = str(h.as_of);
  if (h.state !== "PUBLISHED" || !counts || !asOf || h.basis !== "WORST_OF_DEPLOYMENT_HEALTH" || h.reason_code !== null
    || Object.keys(counts).sort().join(",") !== [...PORTFOLIO_HEALTH_CLASSES].sort().join(",")) return null;
  const parsed = {} as Record<PortfolioHealthClass, number>;
  let total = 0;
  for (const key of PORTFOLIO_HEALTH_CLASSES) {
    const n = counts[key];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) return null;
    parsed[key] = n;
    total += n;
  }
  const worst = [...PORTFOLIO_HEALTH_CLASSES].reverse().find((key) => parsed[key] > 0);
  if (worst === undefined || total > deploymentCount || h.value !== worst) return null;
  return { state: "PUBLISHED", value: worst, deploymentsByHealth: parsed, asOf };
}

export interface PortfolioListEnvelope {
  environment: string;
  freshness: string;
  completeness: string;
  /** Required by the contract, asserted by the reader, and named on screen. */
  recordAuthority: string;
  sourceAuthority: string | null;
  /**
   * Here the tier and this instant come from the same clock: the source
   * declares both on the page it returns. There is no separate basis and no
   * budget — the source publishes no threshold, and our projection cadence is
   * not the rule this verdict was reached under.
   */
  sourceAsOf: string | null;
  readAt: string;
  environmentBranches: Readonly<Record<string, MetricState>>;
  totalPortfolios: number;
  truncated: boolean;
  items: readonly PortfolioListItem[];
}

function readPortfolioItem(raw: unknown): PortfolioListItem | null {
  const root = obj(raw);
  if (!root || !Array.isArray(root.environments) || !Array.isArray(root.allocated_by_currency)) return null;
  const portfolioId = str(root.portfolio_id); const name = str(root.name);
  const state = str(root.state); const baseCurrency = str(root.base_currency);
  const updatedAt = str(root.updated_at);
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const allocationCount = count(root.allocation_count); const deploymentCount = count(root.deployment_count);
  const environments = root.environments.flatMap((value) => typeof value === "string" && value.length > 0 ? [value] : []);
  const allocatedByCurrency = exactArray(root.allocated_by_currency, readCurrencyValue);
  if (!portfolioId || !name || !state || !baseCurrency || !updatedAt
    || allocationCount === null || deploymentCount === null || !allocatedByCurrency
    || environments.length !== root.environments.length || environments.length === 0) return null;
  const health = Object.prototype.hasOwnProperty.call(root, "health") ? readPortfolioHealth(root.health, deploymentCount) : undefined;
  if (health === null) return null;
  const idText = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9._:-]{1,191}$/.test(v) ? v : null);
  const rootId = Object.prototype.hasOwnProperty.call(root, "root_id") ? idText(root.root_id) : undefined;
  const ownerUserId = Object.prototype.hasOwnProperty.call(root, "owner_user_id") ? (root.owner_user_id === null ? null : idText(root.owner_user_id)) : undefined;
  if (rootId === null || (ownerUserId === null && root.owner_user_id !== null)) return null;
  return {
    portfolioId, name, owner: str(root.owner), state, baseCurrency, environments,
    allocationCount, deploymentCount, allocatedByCurrency, updatedAt, ...(health === undefined ? {} : { health }),
    ...(rootId === undefined ? {} : { rootId }), ...(ownerUserId === undefined ? {} : { ownerUserId }),
  };
}

export function readPortfolioList(raw: unknown): PortfolioListEnvelope | null {
  const root = obj(raw);
  if (!root || root.schema_version !== "execution.portfolio-list.v1"
    || root.record_authority !== "PORTAL_PROJECTION" || !Array.isArray(root.items)) return null;
  const environment = str(root.environment); const freshness = str(root.freshness);
  const completeness = str(root.completeness); const readAt = str(root.read_at);
  const branchesRaw = obj(root.environments);
  const totalPortfolios = typeof root.total_portfolios === "number"
    && Number.isSafeInteger(root.total_portfolios) && root.total_portfolios >= 0 ? root.total_portfolios : null;
  const items = exactArray(root.items, readPortfolioItem);
  if (!environment || !freshness || !completeness || !readAt || !branchesRaw
    || totalPortfolios === null || !items || typeof root.truncated !== "boolean") return null;
  const environmentBranches = Object.fromEntries(Object.entries(branchesRaw).flatMap(([key, value]) => {
    const item = obj(value); const state = str(item?.state);
    return item && state ? [[key, { state, reasonCode: str(item.reason_code) }] as const] : [];
  }));
  if (Object.keys(environmentBranches).length !== Object.keys(branchesRaw).length) return null;
  return {
    environment, freshness, completeness, sourceAsOf: str(root.source_as_of), readAt,
    recordAuthority: "PORTAL_PROJECTION", sourceAuthority: str(root.source_authority),
    environmentBranches, totalPortfolios, truncated: root.truncated, items,
  };
}

export const readAlphaFleet = (raw: unknown) =>
  readManagerEnvelope(raw, "execution.alpha-fleet-list.v2", readAlphaFleetItem, (item) => item.alphaId, readFleetSummary);

export function readBindings(raw: unknown): ManagerListEnvelope<BindingItem> | null {
  const envelope = readManagerEnvelope(raw, "execution.bindings-list.v1", readBindingItem, (item) => item.bindingId);
  const counts = obj(raw)?.counts;
  if (!envelope || counts === undefined) return envelope;
  // Present but malformed counts reject the read: a count the reader cannot vouch for is not shown as 0 or dropped silently.
  const read = readBindingCounts(counts);
  return read ? { ...envelope, counts: read } : null;
}

/**
 * R3-3 · `execution.binding-detail.v1` is nine required fields, not one.
 *
 * The contract REQUIRES `record_authority`, `source_authority`,
 * `delivery_profile`, `workspace_id`, `environment`, `read_at`,
 * `source_as_of` and `freshness` beside `item`. The reader below returned
 * `item` alone, so eight published facts were parsed and thrown away on the
 * one screen whose whole subject is whether a binding is currently in sync —
 * and the masthead printed a constant `BROKER` over them. That is the reverse
 * of the truth: `record_authority` is `PORTAL_PROJECTION` and
 * `source_authority` is `TRADING_SYSTEM`; no broker certified this row.
 */
export interface BindingDetailRead {
  item: BindingItem;
  recordAuthority: string;
  sourceAuthority: string | null;
  deliveryProfile: string | null;
  workspaceId: string | null;
  environment: string | null;
  readAt: string | null;
  sourceAsOf: string | null;
  freshness: string | null;
}

export function readBindingDetail(raw: unknown): BindingDetailRead | null {
  const root = obj(raw);
  if (root?.schema_version !== "execution.binding-detail.v1") return null;
  const item = readBindingItem(root.item);
  if (!item) return null;
  // `record_authority` is required by the schema; a response without it is not
  // this contract, and guessing one would invent the provenance of the row.
  const recordAuthority = str(root.record_authority);
  if (!recordAuthority) return null;
  return {
    item,
    recordAuthority,
    sourceAuthority: str(root.source_authority),
    deliveryProfile: str(root.delivery_profile),
    workspaceId: str(root.workspace_id),
    environment: str(root.environment),
    readAt: str(root.read_at),
    sourceAsOf: str(root.source_as_of),
    freshness: str(root.freshness),
  };
}
