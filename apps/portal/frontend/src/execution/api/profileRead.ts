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
  actor: string | null;
  recordAuthority: string | null;
  sourceAuthority: string | null;
  capabilities: readonly BranchCapability[];
  /** Canonical branch arrays, exactly as published; a missing key is absent. */
  data: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  /** Non-array data members (e.g. paper-workbench `deployment`, blotter `page`). */
  objects: Readonly<Record<string, Record<string, unknown>>>;
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
  for (const [key, value] of Object.entries(dataRoot)) {
    if (Array.isArray(value)) data[key] = value.flatMap((v) => (obj(v) ? [obj(v)!] : []));
    else if (obj(value)) objects[key] = obj(value)!;
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
    unavailableBranches: (Array.isArray(root.unavailable_branches) ? root.unavailable_branches : []).flatMap((b) =>
      typeof b === "string" ? [b] : [],
    ),
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
  correlation: { state: string | null; reasonCode: string | null } | null;
}

export function readQueryAnalytics(raw: unknown): QueryAnalytics | null {
  const root = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  const a = root && typeof root.analytics === "object" && root.analytics !== null ? (root.analytics as Record<string, unknown>) : null;
  if (!root || !a) return null;
  const funnel = typeof a.order_funnel === "object" && a.order_funnel !== null ? (a.order_funnel as Record<string, unknown>) : null;
  const corr = typeof a.correlation === "object" && a.correlation !== null ? (a.correlation as Record<string, unknown>) : null;
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
    correlation: corr ? { state: s(corr.state), reasonCode: s(corr.reasonCode ?? corr.reason_code) } : null,
  };
}
