/**
 * Phases 10 and 11 — Sandbox Certification and Canary Control Room
 * (EX-BE-05b F2/F3).
 *
 * One module because both are *source-dark promotion screens* and share the
 * hazard that comes with that: they describe a deployment the Portal cannot
 * currently see, and every figure on them is either the server's or absent.
 *
 * THREE RULES, TAKEN FROM THE HANDOFFS VERBATIM
 *
 *   1. `runtime_state` is `null` and stays `null`. Not HALTED, not RUNNING,
 *      not zero. The fixture profile has no runtime truth, and translating an
 *      absence into a state is how a screen tells an operator a deployment is
 *      stopped when nobody knows.
 *   2. Nothing is recomputed in the browser — not gate progress, not the
 *      current step, not freshness, not evidence expiry, not headroom, not the
 *      day index, not action eligibility. Every one of those is a server field.
 *   3. Where an action group is `visible: false` it is ABSENT, not disabled. A
 *      greyed control advertises a capability that does not exist; the canary
 *      room in particular must not look like a running canary.
 */
import type { Authority, FreshnessState, PanelStatus } from "./contracts";

function obj(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}
function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
function int(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}
function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}
function codes(raw: unknown): readonly string[] {
  return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string") : [];
}

const AUTHORITIES = ["PORTAL", "EXECUTION", "BROKER", "DERIVED", "RESEARCH"] as const;
const PANEL_STATES: readonly PanelStatus[] = [
  "loading", "ok", "empty", "partial", "stale", "denied", "unavailable", "insufficient_data", "terminal",
];
const FRESHNESS: readonly FreshnessState[] = ["OK", "AGING", "STALE", "PAUSED", "UNKNOWN"];

/**
 * The envelope every degradable panel carries on these two screens.
 *
 * Read once here so a panel cannot be rendered without its attribution: an
 * unattributed figure on a promotion screen is a figure nobody owns.
 */
export interface PanelEnvelope {
  panelId: string;
  authority: Authority | null;
  panelState: PanelStatus;
  freshness: FreshnessState | null;
  deliveryProfile: string | null;
  /** `VERIFIED` or `UNAVAILABLE`. Distinct from `panelState`. */
  sourceVerification: string | null;
  asOf: string | null;
  readAt: string | null;
}

export function readPanelEnvelope(raw: unknown, fallbackId = ""): PanelEnvelope {
  const o = obj(raw) ?? {};
  return {
    panelId: str(o.panel_id) ?? fallbackId,
    authority: pick(o.source_authority, AUTHORITIES),
    // Deny-by-default: a state we cannot read is unavailable, never `ok` and
    // never `empty`.
    panelState: pick(o.panel_state, PANEL_STATES) ?? "unavailable",
    freshness: pick(o.freshness_state, FRESHNESS),
    deliveryProfile: str(o.delivery_profile),
    sourceVerification: str(o.source_verification_state),
    asOf: str(o.as_of),
    readAt: str(o.read_at),
  };
}

export interface LineageItem {
  kind: string;
  value: string;
  href: string | null;
  authority: Authority | null;
}

function lineage(raw: unknown): readonly LineageItem[] {
  return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const o = obj(entry);
    const kind = str(o?.kind);
    const value = str(o?.value);
    return kind && value
      ? [{ kind, value, href: str(o!.href), authority: pick(o!.source_authority, AUTHORITIES) }]
      : [];
  });
}

export interface Collection<T> {
  totalCount: number | null;
  returnedCount: number | null;
  truncated: boolean;
  rows: readonly T[];
}

function collection<T>(raw: unknown, read: (row: unknown) => T | null): Collection<T> {
  const o = obj(raw);
  return {
    totalCount: int(o?.total_count),
    returnedCount: int(o?.returned_count),
    truncated: o?.truncated === true,
    rows: (Array.isArray(o?.rows) ? o.rows : []).flatMap((r) => {
      const row = read(r);
      return row ? [row] : [];
    }),
  };
}

/* ---------------------------------------------------------------------------
 * Phase 10 — Sandbox Certification
 * ------------------------------------------------------------------------ */

export const STEP_KEYS = [
  "CONNECT",
  "SYNC",
  "ORDER_TYPES",
  "RECONCILIATION",
  "TIMEBOXED_RUN",
  "CLEANUP",
  "EXIT_REVIEW",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STRIP_STATES = ["DONE", "CURRENT", "PENDING"] as const;
export type StripState = (typeof STRIP_STATES)[number];

/**
 * What the evidence for a step says.
 *
 * `STALE` and `FAIL` are deliberately separate: evidence that expired is not
 * evidence that failed, and a screen that showed both as red would tell an
 * operator a check went wrong when it merely went out of date.
 */
export const EVALUATION_STATES = ["PASS", "FAIL", "STALE", "UNAVAILABLE"] as const;
export type EvaluationState = (typeof EVALUATION_STATES)[number];

export interface CertificationStep {
  stepKey: StepKey | null;
  ordinal: number | null;
  label: string;
  stripState: StripState | null;
  evaluationState: EvaluationState | null;
  authority: Authority | null;
  evidenceHash: string | null;
  evidenceSchemaVersion: string | null;
  sourceVerification: string | null;
  summary: string | null;
  asOf: string | null;
  /** When the evidence lapses. Never computed here. */
  expiresAt: string | null;
  blockerCode: string | null;
}

export interface CertificationProgress {
  passedCount: number | null;
  totalCount: number | null;
  /** The server's verdict. The browser never counts steps to reach it. */
  eligible: boolean;
  evidenceSetHash: string | null;
  blockerCodes: readonly string[];
}

export interface PromotionPlan {
  planId: string;
  targetStage: string | null;
  /** `BLOCKED` in F2. A record of refusal, not an activation attempt. */
  status: string | null;
  blockerCodes: readonly string[];
  sourceSideEffectRequested: boolean;
  createdAt: string | null;
}

export interface SandboxFinding {
  findingId: string;
  severity: string | null;
  status: string | null;
  identity: string | null;
  localValue: string | null;
  brokerValue: string | null;
}

export interface SandboxCertification {
  certificationId: string;
  deploymentId: string | null;
  venue: string | null;
  workflowState: string | null;
  workflowVersion: number | null;
  /** `null` and left that way. Runtime truth is unavailable in this profile. */
  runtimeState: string | null;
  accountId: string | null;
  externalAccountRef: string | null;
  deliveryProfile: string | null;
  sourceIntegrationState: string | null;
  /** All three false in F2; read so the screen can state them. */
  sourceSideEffectRequested: boolean;
  runtimeActivationRequested: boolean;
  promotionExecutionRequested: boolean;
  actorRoles: readonly string[];
  submittedBy: string | null;
  lineage: readonly LineageItem[];
  progress: CertificationProgress | null;
  steps: readonly CertificationStep[];
  sourcePanels: readonly PanelEnvelope[];
  findings: Collection<SandboxFinding>;
  timeline: Collection<{ eventId: string; action: string | null; actor: string | null; createdAt: string | null }>;
  promotionPlans: readonly PromotionPlan[];
}

export function readSandboxCertification(raw: unknown): SandboxCertification | null {
  const root = obj(raw);
  const cert = obj(root?.certification);
  const certificationId = str(cert?.certification_id);
  if (!root || !cert || !certificationId) return null;
  const binding = obj(cert.account_binding);
  const progress = obj(root.progress);
  const actor = obj(root.actor);

  return {
    certificationId,
    deploymentId: str(cert.deployment_id),
    venue: str(cert.venue),
    workflowState: str(cert.workflow_state),
    workflowVersion: int(cert.workflow_version),
    // Read as-is. `null` means nobody knows, and this is the one field where
    // guessing produces a confident lie about whether money is moving.
    runtimeState: str(cert.runtime_state),
    accountId: str(binding?.account_id),
    externalAccountRef: str(binding?.external_account_ref),
    deliveryProfile: str(root.delivery_profile),
    sourceIntegrationState: str(root.source_integration_state),
    // Fail-closed on all three: an unreadable "did this touch the source" is
    // reported as "it might have".
    sourceSideEffectRequested: root.source_side_effect_requested !== false,
    runtimeActivationRequested: root.runtime_activation_requested !== false,
    promotionExecutionRequested: root.promotion_execution_requested !== false,
    actorRoles: Array.isArray(actor?.roles)
      ? actor.roles.filter((r): r is string => typeof r === "string")
      : [],
    submittedBy: str(cert.submitted_by_user_id),
    lineage: lineage(root.lineage),
    progress: progress
      ? {
          passedCount: int(progress.passed_count),
          totalCount: int(progress.total_count),
          eligible: progress.eligible === true,
          evidenceSetHash: str(progress.evidence_set_hash),
          blockerCodes: codes(progress.blocker_codes),
        }
      : null,
    // Order is the server's `ordinal`; nothing is re-sorted and nothing is
    // added. Seven steps means seven, and a missing one is a missing one.
    steps: (Array.isArray(root.steps) ? root.steps : []).flatMap((s) => {
      const o = obj(s);
      if (!o) return [];
      return [
        {
          stepKey: pick(o.step_key, STEP_KEYS),
          ordinal: int(o.ordinal),
          label: str(o.label) ?? str(o.step_key) ?? "",
          stripState: pick(o.strip_state, STRIP_STATES),
          evaluationState: pick(o.evaluation_state, EVALUATION_STATES),
          authority: pick(o.source_authority, AUTHORITIES),
          evidenceHash: str(o.evidence_hash),
          evidenceSchemaVersion: str(o.evidence_schema_version),
          sourceVerification: str(o.source_verification_state),
          summary: str(o.summary),
          asOf: str(o.as_of),
          expiresAt: str(o.expires_at),
          blockerCode: str(o.blocker_code),
        },
      ];
    }),
    sourcePanels: (Array.isArray(root.source_panels) ? root.source_panels : []).map((p) =>
      readPanelEnvelope(p),
    ),
    findings: collection(root.findings, (r) => {
      const o = obj(r);
      const findingId = str(o?.finding_id);
      if (!findingId) return null;
      return {
        findingId,
        severity: str(o!.severity),
        status: str(o!.status),
        identity: str(o!.identity),
        localValue: str(o!.local_value),
        brokerValue: str(o!.broker_value),
      };
    }),
    timeline: collection(root.timeline, (r) => {
      const o = obj(r);
      const eventId = str(o?.event_id);
      if (!eventId) return null;
      return {
        eventId,
        action: str(o!.action),
        actor: str(o!.actor_user_id),
        createdAt: str(o!.created_at),
      };
    }),
    promotionPlans: (Array.isArray(root.promotion_plans) ? root.promotion_plans : []).flatMap((p) => {
      const o = obj(p);
      const planId = str(o?.plan_id);
      if (!planId) return [];
      return [
        {
          planId,
          targetStage: str(o!.target_stage),
          status: str(o!.status),
          blockerCodes: codes(o!.blocker_codes),
          sourceSideEffectRequested: o!.source_side_effect_requested !== false,
          createdAt: str(o!.created_at),
        },
      ];
    }),
  };
}

/**
 * May the certification be submitted or exited?
 *
 * `eligible` is the server's and governs. The two extra refusals below are not
 * a second opinion — they are the handoff's own rule stated where it can be
 * tested: a CRITICAL unresolved finding or any non-PASS step keeps this shut
 * even if a future response set `eligible` by mistake.
 */
export function certificationBlocked(
  cert: SandboxCertification,
): { blocked: boolean; reasons: readonly string[] } {
  const reasons: string[] = [];
  if (!cert.progress?.eligible) {
    reasons.push(...(cert.progress?.blockerCodes ?? ["The server has not marked this eligible."]));
  }
  const critical = cert.findings.rows.filter(
    (f) => f.severity === "CRITICAL" && f.status !== "RESOLVED",
  );
  if (critical.length > 0) {
    reasons.push(
      `${critical.length} unresolved CRITICAL reconciliation finding — activation fail-closed.`,
    );
  }
  const notPassed = cert.steps.filter((s) => s.evaluationState !== "PASS");
  if (notPassed.length > 0) {
    reasons.push(
      `${notPassed.length} of ${cert.steps.length} steps are not PASS.`,
    );
  }
  return { blocked: reasons.length > 0, reasons };
}

/* ---------------------------------------------------------------------------
 * Phase 11 — Canary Control Room
 * ------------------------------------------------------------------------ */

export interface CanaryKpi {
  key: string;
  label: string;
  /** `null` while the source is dark. Rendered as unavailable, never as zero. */
  value: string | null;
  unit: string | null;
  envelope: PanelEnvelope;
}

export interface CanaryEnvelopeLimits {
  /** Exact decimal strings, carried through untouched. */
  capitalCap: string | null;
  grossNotionalCap: string | null;
  dailyLossCap: string | null;
  maxOpenOrders: number | null;
  durationDays: number | null;
}

export interface CanaryEnvelope {
  envelopeId: string | null;
  revision: number | null;
  status: string | null;
  currency: string | null;
  baseRiskProfileRevision: string | null;
  limits: CanaryEnvelopeLimits;
  evidenceSetHash: string | null;
  blockerCodes: readonly string[];
  reason: string | null;
}

/**
 * One action group's policy.
 *
 * `brokerSyncBlocks` is the asymmetry the whole screen exists to show: a stale
 * broker blocks scaling up and does NOT block protective actions, because
 * staleness affects what the Portal can see rather than what the guardrails
 * enforce locally. Read per group so the two can differ, which is the point.
 */
export interface CanaryActionPolicy {
  riskTier: string | null;
  /** `false` in F3 → the group is ABSENT, not a disabled placeholder. */
  visible: boolean;
  enabled: boolean;
  brokerSyncBlocks: boolean;
  blockerCodes: readonly string[];
}

export interface CanaryCommandPolicy {
  productionCommandActive: boolean;
  /** `BROKER_STALE_BLOCKS_SCALE_ONLY`. Read, never assumed. */
  guardSemantics: string | null;
  protective: CanaryActionPolicy | null;
  scaleUp: CanaryActionPolicy | null;
}

export interface CanaryControlRoom {
  deploymentId: string | null;
  portfolioId: string | null;
  accountId: string | null;
  venue: string | null;
  declaredStage: string | null;
  /** `null`, and never mapped to RUNNING, HALTED or zero. */
  runtimeState: string | null;
  /** `null` while dark. The screen says "not stated", not "day 0". */
  dayIndex: number | null;
  durationDays: number | null;
  lifecycleBlockers: readonly string[];
  deliveryProfile: string | null;
  sourceIntegrationState: string | null;
  productionCommandActive: boolean;
  sourceSideEffectRequested: boolean;
  runtimeActivationRequested: boolean;
  promotionExecutionRequested: boolean;
  actorRoles: readonly string[];
  lineage: readonly LineageItem[];
  envelope: CanaryEnvelope | null;
  kpis: readonly CanaryKpi[];
  envelopeCompliance: PanelEnvelope | null;
  sourcePanels: readonly PanelEnvelope[];
  positions: PanelEnvelope | null;
  blotter: PanelEnvelope | null;
  series: PanelEnvelope | null;
  rollbackReadiness: PanelEnvelope | null;
  commandPolicy: CanaryCommandPolicy | null;
}

function actionPolicy(raw: unknown): CanaryActionPolicy | null {
  const o = obj(raw);
  if (!o) return null;
  return {
    riskTier: str(o.risk_tier),
    // Deny-by-default on both: an unreadable flag never reveals a control.
    visible: o.visible === true,
    enabled: o.enabled === true,
    // Fail-closed the other way: an unreadable "does broker staleness block
    // this" is treated as blocking, because the safe error is refusing a scale
    // rather than permitting one on evidence nobody can vouch for.
    brokerSyncBlocks: o.broker_sync_blocks !== false,
    blockerCodes: codes(o.blocker_codes),
  };
}

export function readCanaryControlRoom(raw: unknown): CanaryControlRoom | null {
  const root = obj(raw);
  const dep = obj(root?.deployment);
  if (!root || !dep) return null;
  const life = obj(root.lifecycle);
  const env = obj(root.envelope);
  const limits = obj(env?.limits);
  const policy = obj(root.command_policy);
  const actor = obj(root.actor);
  const panel = (key: string) => {
    const o = obj(root[key]);
    return o ? readPanelEnvelope(o.envelope ?? o, key) : null;
  };

  return {
    deploymentId: str(dep.deployment_id),
    portfolioId: str(dep.portfolio_id),
    accountId: str(dep.account_id),
    venue: str(dep.venue),
    declaredStage: str(life?.declared_stage) ?? str(dep.declared_environment),
    runtimeState: str(life?.runtime_state) ?? str(dep.runtime_state),
    dayIndex: int(life?.day_index),
    durationDays: int(life?.duration_days),
    lifecycleBlockers: codes(life?.blocker_codes),
    deliveryProfile: str(root.delivery_profile),
    sourceIntegrationState: str(root.source_integration_state),
    productionCommandActive: root.production_command_active === true,
    sourceSideEffectRequested: root.source_side_effect_requested !== false,
    runtimeActivationRequested: root.runtime_activation_requested !== false,
    promotionExecutionRequested: root.promotion_execution_requested !== false,
    actorRoles: Array.isArray(actor?.roles)
      ? actor.roles.filter((r): r is string => typeof r === "string")
      : [],
    lineage: lineage(root.lineage),
    envelope: env
      ? {
          envelopeId: str(env.envelope_id),
          revision: int(env.revision),
          status: str(env.status),
          currency: str(env.currency),
          baseRiskProfileRevision: str(env.base_risk_profile_revision),
          limits: {
            // Strings throughout. `Number()` on a cap is how "5000" becomes
            // something a rounding step can move.
            capitalCap: str(limits?.capital_cap),
            grossNotionalCap: str(limits?.gross_notional_cap),
            dailyLossCap: str(limits?.daily_loss_cap),
            maxOpenOrders: int(limits?.max_open_orders),
            durationDays: int(limits?.duration_days),
          },
          evidenceSetHash: str(env.evidence_set_hash),
          blockerCodes: codes(env.blocker_codes),
          reason: str(env.reason),
        }
      : null,
    kpis: (Array.isArray(root.kpis) ? root.kpis : []).flatMap((k) => {
      const o = obj(k);
      const key = str(o?.key);
      if (!key) return [];
      return [
        {
          key,
          label: str(o!.label) ?? key,
          // `null` is preserved. A KPI slot showing 0 is a claim; showing
          // "unavailable" is the truth.
          value: str(o!.value),
          unit: str(o!.unit),
          envelope: readPanelEnvelope(o!.envelope, `kpi-${key}`),
        },
      ];
    }),
    envelopeCompliance: panel("envelope_compliance"),
    sourcePanels: (Array.isArray(root.source_panels) ? root.source_panels : []).map((p) =>
      readPanelEnvelope(p),
    ),
    positions: panel("positions"),
    blotter: panel("blotter"),
    series: panel("series"),
    rollbackReadiness: panel("rollback_readiness"),
    commandPolicy: policy
      ? {
          productionCommandActive: policy.production_command_active === true,
          guardSemantics: str(policy.guard_semantics),
          protective: actionPolicy(policy.protective),
          scaleUp: actionPolicy(policy.scale_up),
        }
      : null,
  };
}

/**
 * The asymmetry, stated so a screen cannot get it backwards.
 *
 * Derived from the two groups' own `brokerSyncBlocks` rather than from the
 * `guard_semantics` string, because the string is a summary and the booleans
 * are the rule. When they disagree, the booleans are what the server enforces.
 */
export function guardAsymmetry(policy: CanaryCommandPolicy | null): {
  asymmetric: boolean;
  text: string;
} {
  const protectiveBlocks = policy?.protective?.brokerSyncBlocks;
  const scaleBlocks = policy?.scaleUp?.brokerSyncBlocks;
  if (protectiveBlocks === undefined || scaleBlocks === undefined) {
    return { asymmetric: false, text: "The guard rule for this deployment was not published." };
  }
  if (!protectiveBlocks && scaleBlocks) {
    return {
      asymmetric: true,
      text: "A stale broker snapshot blocks scaling up and does not block protective actions. Staleness affects what the Portal can SEE, not what the guardrails enforce locally.",
    };
  }
  return {
    asymmetric: false,
    text: protectiveBlocks
      ? "A stale broker snapshot blocks every action on this deployment, including protective ones."
      : "A stale broker snapshot blocks no action on this deployment.",
  };
}
