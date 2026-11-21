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
import { v1Refusal } from "./api/schemaGuard";
import { unsafeText } from "./unsafeText";
import {
  readComplianceRows,
  readDeploymentIdentity,
  readEnvelopeVerdict,
  readPlanAuthor,
  readPlanEnvelope,
  readRollbackItems,
  readSeriesMembers,
  readSourceFigures,
  readStageFacts,
  readTrial,
  readTypedOrders,
  readTypedPositions,
  type DeploymentIdentity,
  type EnvelopeComplianceRow,
  type EnvelopeVerdict,
  type Fact,
  type PlanEnvelopeRef,
  type RollbackReadinessItem,
  type SourceFigure,
  type StageFacts,
  type StageSeries,
  type TrialSchedule,
  type TypedOrderRow,
  type TypedPositionRow,
  type TypedRows,
} from "./stageFacts";

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
/** A non-empty string no longer than `max` characters; a longer one is `null`, never cut. */
function bounded(raw: unknown, max: number): string | null {
  return typeof raw === "string" && raw.length > 0 && raw.length <= max ? raw : null;
}
function bool(raw: unknown): boolean | null {
  return typeof raw === "boolean" ? raw : null;
}
function count(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
}
/**
 * An exact decimal as the wire writes it: a STRING, optional minus, no exponent, no leading zero, at
 * most 57 characters (the published `PositiveDecimal` bound). A JS number is never a decimal here:
 * `5000.10` would arrive as `5000.1` and the trailing zero is a claim about precision.
 */
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
function decimalString(raw: unknown): string | null {
  return typeof raw === "string" && raw.length <= 57 && DECIMAL.test(raw) && !/^-0+(?:\.0+)?$/.test(raw) ? raw : null;
}

const AUTHORITIES = ["PORTAL", "EXECUTION", "BROKER", "DERIVED", "RESEARCH"] as const;
/**
 * The published `panel_state` vocabulary of the three promotion screens, mapped to the FE rendering
 * vocabulary (`PanelStatus`).
 *
 *   sandbox  `ready | stale | error | unavailable`            (execution-sandbox-certification.v1)
 *   canary   `ready | empty | partial | stale | unavailable | suppressed`
 *   live     the same six as canary
 *
 * `ready` is the wire's word for the FE's `ok`; `error` is a source read that failed, which the FE
 * words "Failed" (`terminal`). `suppressed` is not a rendering state: it is read as the `suppressed`
 * flag and the panel renders `unavailable`. A word outside this table (including the FE's own `ok`,
 * `loading`, `denied` or `insufficient_data`, none of which a promotion body publishes) is
 * `unavailable`: deny by default, never `ok`.
 */
const PANEL_STATE_WIRE: Readonly<Record<string, PanelStatus>> = {
  ready: "ok",
  empty: "empty",
  partial: "partial",
  stale: "stale",
  unavailable: "unavailable",
  error: "terminal",
};
/**
 * `freshness_state`: canary and live publish `FRESH | AGING | STALE | UNKNOWN`, sandbox publishes
 * `OK | STALE | UNKNOWN`. `FRESH` and `OK` are the same claim and read as the FE's `OK`; any other
 * word is `null` (not stated).
 */
const FRESHNESS_WIRE: Readonly<Record<string, FreshnessState>> = {
  FRESH: "OK",
  OK: "OK",
  AGING: "AGING",
  STALE: "STALE",
  UNKNOWN: "UNKNOWN",
};
function wire<T>(table: Readonly<Record<string, T>>, raw: unknown): T | null {
  return typeof raw === "string" && Object.hasOwn(table, raw) ? table[raw]! : null;
}

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
  /**
   * The server marked this panel `suppressed`.
   *
   * Kept as a flag rather than a tenth `PanelStatus`, because the nine states
   * are a rendering vocabulary shared by seventeen screens while this is a
   * policy outcome. It lives here rather than only in the live-full reader so
   * that the day a canary or certification panel is suppressed, the screen
   * reports withholding instead of quietly degrading to "unavailable" — which
   * is what this reader used to do, and would have kept doing silently.
   */
  suppressed: boolean;
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
    panelState: wire(PANEL_STATE_WIRE, o.panel_state) ?? "unavailable",
    freshness: wire(FRESHNESS_WIRE, o.freshness_state),
    deliveryProfile: str(o.delivery_profile),
    sourceVerification: str(o.source_verification_state),
    suppressed: o.panel_state === "suppressed",
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
  /**
   * ADDITIVE (FE-072, BE-P2). `author.user_id` as published; `null` = the key is absent or malformed. The V1 screen never reads it.
   */
  author: string | null;
  /**
   * ADDITIVE (FE-072). The latest Canary envelope drafted from this plan, as a Fact: AVAILABLE with a `null` value means the
   * lookup ran and none exists; `null` (not a Fact) = the key is absent or malformed.
   */
  envelope: Fact<PlanEnvelopeRef | null> | null;
}

export interface SandboxFinding {
  findingId: string;
  severity: string | null;
  /**
   * `status`, `identity`, `local_value` and `broker_value` are NOT on the published finding row
   * (`execution-sandbox-certification.v1` FindingCollection). They are read only because the V1
   * screen has always read them; on a published body they are `null`. Do not build on them.
   */
  status: string | null;
  identity: string | null;
  localValue: string | null;
  brokerValue: string | null;
  /** The published finding row: `finding_code` (<= 191 characters). */
  findingCode: string | null;
  /** The server's sentence (<= 2000 characters; a longer one is `null`, not cut). */
  summary: string | null;
  /** Whether the finding blocks the exit; `null` when the field is absent or not a boolean. */
  blocking: boolean | null;
  /** ISO instant as published; `null` = not resolved OR not published (see `resolution`). */
  resolvedAt: string | null;
  /**
   * `OPEN` only when the row carries `resolved_at: null`; `RESOLVED` only when it carries an instant;
   * `null` when the key is absent or unreadable. An absent key is not an open finding.
   */
  resolution: "OPEN" | "RESOLVED" | null;
  /** ISO instant the finding was recorded (`created_at`). */
  createdAt: string | null;
  /** ADDITIVE (FE-072): the published `opened_at` (equal to `created_at` on the producer); `null` = absent or malformed. */
  openedAt: string | null;
}

export interface SandboxCertification {
  certificationId: string;
  deploymentId: string | null;
  /** ADDITIVE: the record's `portfolio_id` (V1 never printed it). */
  portfolioId: string | null;
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
  /*
   * Additive fields (BE-P2/P3). The V1 Sandbox screen ignores every one of them; each is `null` when the key is absent or
   * does not match the published schema exactly (`stageFacts.ts` reads them closed).
   */
  /** FE-066: the five identity keys of the `certification` record. */
  identity: DeploymentIdentity | null;
  /** FE-067: runtime, reconciliation and sessions. */
  stageFacts: StageFacts | null;
  /** FE-072: Internal / Broker / Difference figures. */
  sourceFigures: readonly SourceFigure[] | null;
}

export function readSandboxCertification(raw: unknown): SandboxCertification | null {
  // The V2 following-parent body would read here with all three side-effect flags `true` (api/schemaGuard.ts).
  if (v1Refusal(raw) !== null) return null;
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
    portfolioId: str(cert.portfolio_id),
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
        findingCode: bounded(o!.finding_code, 191),
        summary: bounded(o!.summary, 2000),
        blocking: bool(o!.blocking),
        resolvedAt: str(o!.resolved_at),
        resolution: !Object.hasOwn(o!, "resolved_at")
          ? null
          : o!.resolved_at === null
            ? "OPEN"
            : str(o!.resolved_at) !== null
              ? "RESOLVED"
              : null,
        createdAt: str(o!.created_at),
        openedAt: str(o!.opened_at),
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
          author: Object.hasOwn(o!, "author") ? readPlanAuthor(o!.author) : null,
          envelope: Object.hasOwn(o!, "envelope") ? readPlanEnvelope(o!.envelope) : null,
        },
      ];
    }),
    identity: readDeploymentIdentity(cert),
    stageFacts: Object.hasOwn(root, "stage_facts") ? readStageFacts(root.stage_facts) : null,
    sourceFigures: Object.hasOwn(root, "source_figures") ? readSourceFigures(root.source_figures) : null,
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
    // The COUNT comes from the server's progress, not from this filter. The
    // two can legitimately differ — the server evaluates against a policy that
    // may weigh steps the strip does not — and printing a browser tally beside
    // a server gate is how a screen ends up arguing with itself. The filter
    // decides only WHETHER to say something; `progress` decides what.
    const passed = cert.progress?.passedCount;
    const total = cert.progress?.totalCount;
    reasons.push(
      passed !== null && passed !== undefined && total !== null && total !== undefined
        ? `${passed} of ${total} steps have passed.`
        : "Not every step has passed.",
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

/**
 * One cell of a free-form row. The published collections declare their rows as `{type: object,
 * maxProperties: 80}` and nothing more, so a cell can only be what JSON scalars are; this reader keeps
 * strings (<= 256 characters, so decimals travel as the exact strings the server wrote), booleans and
 * `null`. A JS number, array or object cell is NOT kept: a number has already lost its trailing zeros,
 * and a decimal that arrives as one is not a decimal this build may print.
 */
export type RowCell = string | boolean | null;
export type RowRecord = Readonly<Record<string, RowCell>>;

export const MAX_ROW_RECORDS = 200;
const MAX_ROW_CELLS = 80;
const MAX_CELL_CHARS = 256;
const CELL_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
/**
 * Why a cell the response carried is not in the row. `number`: a JS number is never kept (it has lost its trailing
 * zeros; a figure that arrives as one is not a decimal this build may print). `unreadable`: a string that is too long
 * or carries unsafe characters, or an array or object.
 */
export type CellLoss = "number" | "unreadable";

/**
 * What a kept row lost, so a V2 screen can say "Unreadable" for a cell that was PRESENT, instead of "Not available".
 * `cells` are the dropped cells whose key is safe to name; `notShown` counts the rest (a key that is not a plain
 * identifier, or a cell past the per-row bounds). V1 never reads this.
 */
export interface RowLoss {
  cells: Readonly<Record<string, CellLoss>>;
  notShown: number;
}

/** A bounded free row and what it dropped, or `null` when the row is not an object or nothing in it is readable. */
export function readRowRecordWithLoss(raw: unknown): { row: RowRecord; loss: RowLoss } | null {
  const o = obj(raw);
  if (!o) return null;
  const cells: Record<string, RowCell> = {};
  const lost: Record<string, CellLoss> = {};
  let kept = 0;
  let lostCount = 0;
  let notShown = 0;
  for (const [key, value] of Object.entries(o)) {
    if (kept >= MAX_ROW_CELLS) {
      notShown += 1;
      continue;
    }
    if (!CELL_KEY.test(key)) {
      notShown += 1;
      continue;
    }
    if (value === null || typeof value === "boolean" || (typeof value === "string" && value.length <= MAX_CELL_CHARS && !unsafeText(value))) {
      cells[key] = value;
      kept += 1;
    } else if (lostCount < MAX_ROW_CELLS) {
      lost[key] = typeof value === "number" ? "number" : "unreadable";
      lostCount += 1;
    } else {
      notShown += 1;
    }
  }
  return { row: cells, loss: { cells: lost, notShown } };
}

/** A bounded free row: the readable scalar cells, or `null` when the row is not an object or nothing in it is readable. */
export function readRowRecord(raw: unknown): RowRecord | null {
  const read = readRowRecordWithLoss(raw);
  return read === null || Object.keys(read.row).length === 0 ? null : read.row;
}

/**
 * A `UnavailableCollection` (`positions`, `blotter`, live `orders`): the source envelope, the server's
 * exact total, and the rows it returned. `rows` is empty and says nothing about the source when the
 * envelope is not `ok`; `rowsDropped` counts rows past the bound or unreadable, so a screen can say
 * "N more" instead of looking complete.
 */
export interface RowCollection {
  envelope: PanelEnvelope;
  /** The server's `exact_total`; `null` = not published. */
  exactTotal: number | null;
  /** The server's `returned_count`; `null` = not published. */
  returnedCount: number | null;
  rows: readonly RowRecord[];
  /** Rows the response carried that this reader did not keep (past 200, or with no readable cell). */
  rowsDropped: number;
  /** ADDITIVE, V2 only: what each kept row lost, aligned with `rows`. A collection built by hand may omit it. */
  rowLosses?: readonly RowLoss[];
  /** ADDITIVE, V2 only: of `rowsDropped`, the rows that had cells but none readable (a present row is not "none"). */
  rowsUnreadable?: number;
}

export function readRowCollection(raw: unknown, fallbackId = ""): RowCollection | null {
  const o = obj(raw);
  if (!o) return null;
  const source = Array.isArray(o.rows) ? o.rows : [];
  const rows: RowRecord[] = [];
  const rowLosses: RowLoss[] = [];
  let dropped = 0;
  let unreadable = 0;
  for (const entry of source) {
    const read = rows.length < MAX_ROW_RECORDS ? readRowRecordWithLoss(entry) : null;
    if (read === null || Object.keys(read.row).length === 0) {
      dropped += 1;
      if (read !== null && (Object.keys(read.loss.cells).length > 0 || read.loss.notShown > 0)) unreadable += 1;
    } else {
      rows.push(read.row);
      rowLosses.push(read.loss);
    }
  }
  return {
    envelope: readPanelEnvelope(o.envelope, fallbackId),
    exactTotal: count(o.exact_total),
    returnedCount: count(o.returned_count),
    rows,
    rowsDropped: dropped,
    rowLosses,
    rowsUnreadable: unreadable,
  };
}

/** `envelope_compliance.consumed` / `.headroom`: a free object of at most 8 members, kept as exact decimal strings only. */
export type DecimalMap = Readonly<Record<string, string>>;

function decimalMap(raw: unknown): DecimalMap | null {
  const o = obj(raw);
  if (!o) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(o).slice(0, 8)) {
    const decimal = decimalString(value);
    if (CELL_KEY.test(key) && decimal !== null) out[key] = decimal;
  }
  return out;
}

export interface CanaryCompliance {
  envelope: PanelEnvelope;
  /** The four caps the response states, as exact decimal strings (and the open-order count as an integer). */
  limits: {
    capitalCap: string | null;
    grossNotionalCap: string | null;
    dailyLossCap: string | null;
    maxOpenOrders: number | null;
  };
  /** `null` = the response states none (it is `null` on every body published so far). */
  consumed: DecimalMap | null;
  headroom: DecimalMap | null;
  /** The schema pins `false`; a body that says anything else reads `null`. */
  baseRiskProfileVerified: boolean | null;
}

export interface CanaryRollback {
  envelope: PanelEnvelope;
  /** The schema's boolean, as published; `null` when the key is not a boolean. Never inferred. */
  ready: boolean | null;
  blockerCodes: readonly string[];
  evidenceHash: string | null;
}

export interface CanarySeries {
  envelope: PanelEnvelope;
  /** The schema pins `null` (and `points` to zero items); read, not assumed. */
  resolution: string | null;
  points: readonly RowRecord[];
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
  /*
   * Additive fields. The V1 Canary screen ignores every one of them (it reads only the envelopes
   * above); they exist for the V2 screen, which prints them only where the response states them.
   */
  compliance: CanaryCompliance | null;
  positionRows: RowCollection | null;
  blotterRows: RowCollection | null;
  seriesDetail: CanarySeries | null;
  rollbackDetail: CanaryRollback | null;
  /*
   * Additive fields (BE-P2/P3). Each is `null` when the key is absent or does not match the published schema exactly
   * (`stageFacts.ts` reads them closed); the V1 screen ignores all of them.
   */
  /** FE-066: the five identity keys of the `deployment` block. */
  identity: DeploymentIdentity | null;
  /** FE-067: runtime, reconciliation and sessions. */
  stageFacts: StageFacts | null;
  /** FE-072: Internal / Broker / Difference figures. */
  sourceFigures: readonly SourceFigure[] | null;
  /** FE-071: `envelope_compliance.rows` (one per cap) and the server's verdict. */
  complianceRows: readonly EnvelopeComplianceRow[] | null;
  complianceVerdict: EnvelopeVerdict | null;
  /** FE-071: `rollback_readiness.items` (the four checks). */
  rollbackItems: readonly RollbackReadinessItem[] | null;
  /** FE-071: `lifecycle.trial`. */
  trial: TrialSchedule | null;
  /** FE-072: `positions.typed` and `blotter.typed`. */
  typedPositions: TypedRows<TypedPositionRow> | null;
  typedOrders: TypedRows<TypedOrderRow> | null;
  /** FE-072: the series' resolution, methodology, unit and exact points. */
  seriesMembers: StageSeries | null;
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
  if (v1Refusal(raw) !== null) return null;
  const root = obj(raw);
  const dep = obj(root?.deployment);
  if (!root || !dep) return null;
  const life = obj(root.lifecycle);
  const env = obj(root.envelope);
  const limits = obj(env?.limits);
  const policy = obj(root.command_policy);
  const actor = obj(root.actor);
  const compliance = obj(root.envelope_compliance);
  const complianceLimits = obj(compliance?.limits);
  const series = obj(root.series);
  const rollback = obj(root.rollback_readiness);
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
    compliance: compliance
      ? {
          envelope: readPanelEnvelope(compliance.envelope, "envelope_compliance"),
          limits: {
            capitalCap: decimalString(complianceLimits?.capital_cap),
            grossNotionalCap: decimalString(complianceLimits?.gross_notional_cap),
            dailyLossCap: decimalString(complianceLimits?.daily_loss_cap),
            maxOpenOrders: count(complianceLimits?.max_open_orders),
          },
          consumed: decimalMap(compliance.consumed),
          headroom: decimalMap(compliance.headroom),
          baseRiskProfileVerified: bool(compliance.base_risk_profile_verified),
        }
      : null,
    positionRows: readRowCollection(root.positions, "positions"),
    blotterRows: readRowCollection(root.blotter, "blotter"),
    seriesDetail: series
      ? {
          envelope: readPanelEnvelope(series.envelope, "series"),
          resolution: bounded(series.resolution, 32),
          points: (Array.isArray(series.points) ? series.points : [])
            .slice(0, MAX_ROW_RECORDS)
            .flatMap((point) => {
              const row = readRowRecord(point);
              return row ? [row] : [];
            }),
        }
      : null,
    rollbackDetail: rollback
      ? {
          envelope: readPanelEnvelope(rollback.envelope, "rollback_readiness"),
          ready: bool(rollback.ready),
          blockerCodes: codes(rollback.blocker_codes).slice(0, 16),
          evidenceHash: bounded(rollback.evidence_hash, 80),
        }
      : null,
    identity: readDeploymentIdentity(dep),
    stageFacts: Object.hasOwn(root, "stage_facts") ? readStageFacts(root.stage_facts) : null,
    sourceFigures: Object.hasOwn(root, "source_figures") ? readSourceFigures(root.source_figures) : null,
    complianceRows: compliance !== null && Object.hasOwn(compliance, "rows") ? readComplianceRows(compliance.rows) : null,
    complianceVerdict: compliance !== null && Object.hasOwn(compliance, "verdict") ? readEnvelopeVerdict(compliance.verdict) : null,
    rollbackItems: rollback !== null && Object.hasOwn(rollback, "items") ? readRollbackItems(rollback.items) : null,
    trial: life !== null && Object.hasOwn(life, "trial") ? readTrial(life.trial) : null,
    typedPositions: obj(root.positions) !== null && Object.hasOwn(obj(root.positions)!, "typed") ? readTypedPositions(obj(root.positions)!.typed) : null,
    typedOrders: obj(root.blotter) !== null && Object.hasOwn(obj(root.blotter)!, "typed") ? readTypedOrders(obj(root.blotter)!.typed) : null,
    seriesMembers: series !== null ? readSeriesMembers(series) : null,
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
