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
}

function obj(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

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
  return {
    schemaVersion,
    state,
    freshness: str(root.freshness),
    completeness: str(root.completeness),
    asOf: str(root.as_of),
    readAt: str(root.read_at),
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
  const root = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!root || root.schema_version !== "governance.live-review.v1") return null;
  const approvalId = typeof root.approval_id === "string" ? root.approval_id : null;
  if (!approvalId) return null;
  const canary = typeof root.canary_ref === "object" && root.canary_ref !== null ? (root.canary_ref as Record<string, unknown>) : null;
  const actor = typeof root.actor === "object" && root.actor !== null ? (root.actor as Record<string, unknown>) : null;
  return {
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
  correlation: { state: string | null; reasonCode: string | null } | null;
}

export function readQueryAnalytics(raw: unknown): QueryAnalytics | null {
  const root = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  const a = root && typeof root.analytics === "object" && root.analytics !== null ? (root.analytics as Record<string, unknown>) : null;
  if (!root || !a) return null;
  const funnel = typeof a.order_funnel === "object" && a.order_funnel !== null ? (a.order_funnel as Record<string, unknown>) : null;
  const corr = typeof a.correlation === "object" && a.correlation !== null ? (a.correlation as Record<string, unknown>) : null;
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
    correlation: corr ? { state: s(corr.state), reasonCode: s(corr.reasonCode ?? corr.reason_code) } : null,
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
}

export interface ManagerListEnvelope<T> {
  environment: string;
  freshness: string;
  completeness: string;
  sourceAsOf: string | null;
  readAt: string;
  page: ManagerListPage<T>;
  summary?: AlphaFleetSummary;
}

function readManagerPage<T>(raw: unknown, row: (value: unknown) => T | null): ManagerListPage<T> | null {
  const root = obj(raw);
  if (!root || !Array.isArray(root.rows)) return null;
  const rows = root.rows.map(row);
  if (rows.some((item) => item === null)) return null;
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const totalCount = count(root.total_count);
  const filteredCount = count(root.filtered_count);
  if (totalCount === null || filteredCount === null) return null;
  return {
    rows: rows as T[], totalCount, filteredCount,
    nextCursor: str(root.next_cursor), prevCursor: str(root.prev_cursor),
    hasMore: root.has_more === true, hasPrevious: root.has_previous === true,
  };
}

function readManagerEnvelope<T>(
  raw: unknown,
  schemaVersion: string,
  row: (value: unknown) => T | null,
  summary?: (value: unknown) => AlphaFleetSummary | null,
): ManagerListEnvelope<T> | null {
  const root = obj(raw);
  if (!root || root.schema_version !== schemaVersion || root.record_authority !== "PORTAL_PROJECTION") return null;
  const page = readManagerPage(root.page, row);
  const environment = str(root.environment);
  const freshness = str(root.freshness);
  const completeness = str(root.completeness);
  const readAt = str(root.read_at);
  const parsedSummary = summary ? summary(root.summary) : undefined;
  if (!page || !environment || !freshness || !completeness || !readAt || (summary && !parsedSummary)) return null;
  return { environment, freshness, completeness, sourceAsOf: str(root.source_as_of), readAt, page, ...(parsedSummary ? { summary: parsedSummary } : {}) };
}

function readFleetItem(raw: unknown): AlphaFleetItem | null {
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

function exactArray<T>(raw: unknown[], reader: (value: unknown) => T | null): T[] | null {
  const values = raw.map(reader); return values.some((value) => value === null) ? null : values as T[];
}

function readFleetDeployment(value: unknown): AlphaFleetDeployment | null {
  const item = obj(value); if (!item) return null;
  const deploymentId = str(item.deployment_id); const stage = str(item.stage); const venue = str(item.venue);
  const accountId = str(item.account_id); const currency = str(item.currency); const state = str(item.state);
  const health = str(item.health); const updatedAt = str(item.updated_at);
  const realizedPnl = str(item.realized_pnl); const unrealizedPnl = str(item.unrealized_pnl);
  const netPnl = str(item.net_pnl); const exposure = str(item.exposure);
  const positionFactCount = typeof item.position_fact_count === "number"
    && Number.isSafeInteger(item.position_fact_count) && item.position_fact_count >= 0
    ? item.position_fact_count : null;
  if (!deploymentId || !stage || !venue || !accountId || !currency || !state || !health || !updatedAt
    || !realizedPnl || !unrealizedPnl || !netPnl || !exposure || positionFactCount === null
    || typeof item.active !== "boolean") return null;
  return {
    deploymentId, stage, venue, accountId, portfolioId: str(item.portfolio_id),
    portfolioName: str(item.portfolio_name), currency, allocation: str(item.allocation),
    balanceTotal: str(item.balance_total), balanceFree: str(item.balance_free),
    balanceLocked: str(item.balance_locked), positionFactCount,
    realizedPnl, unrealizedPnl, netPnl, exposure, state, active: item.active, health, updatedAt,
  };
}

function readCurrencyValue(value: unknown): CurrencyValue | null {
  const item = obj(value); const currency = str(item?.currency); const exactValue = str(item?.value);
  return item && currency && exactValue ? { currency, value: exactValue } : null;
}
function readCurrencyBalance(value: unknown): CurrencyBalance | null {
  const item = obj(value); const currency = str(item?.currency); const total = str(item?.total);
  const free = str(item?.free); const locked = str(item?.locked);
  return item && currency && total && free && locked ? { currency, total, free, locked } : null;
}
function readCurrencyPnl(value: unknown): CurrencyPnl | null {
  const item = obj(value); const currency = str(item?.currency); const realized = str(item?.realized);
  const unrealized = str(item?.unrealized); const net = str(item?.net);
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

function readBindingItem(raw: unknown): BindingItem | null {
  const root = obj(raw);
  const bindingId = str(root?.binding_id); const accountId = str(root?.account_id);
  const venue = str(root?.venue); const state = str(root?.state);
  const credentialState = str(root?.credential_state); const updatedAt = str(root?.updated_at);
  return root && bindingId && accountId && venue && state && credentialState && updatedAt
    ? { bindingId, accountId, venue, state, credentialState, updatedAt } : null;
}

export const readAlphaFleet = (raw: unknown) =>
  readManagerEnvelope(raw, "execution.alpha-fleet-list.v2", readFleetItem, readFleetSummary);

export const readBindings = (raw: unknown) =>
  readManagerEnvelope(raw, "execution.bindings-list.v1", readBindingItem);

export function readBindingDetail(raw: unknown): BindingItem | null {
  const root = obj(raw);
  return root?.schema_version === "execution.binding-detail.v1" ? readBindingItem(root.item) : null;
}
