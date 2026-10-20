/**
 * The Sandbox screen's boundary: what `getSandboxCertificationVersioned` answered,
 * turned into the one shape the screen prints, strictly.
 *
 * Two bodies answer the same route (`GET /deployments/{id}/certification`):
 *
 * - V1 `governance.sandbox-certification.v1`: steps with a server sentence, a server
 *   progress count, findings, a timeline, promotion plans and three source panels;
 * - V2 `portal.execution.following-parent.v2`: the stored certification, seven stored
 *   step evaluations and the lineage. No progress, no sentences, no findings, no panels.
 *
 * The dispatch (`v2/readers/dispatch.ts`) has already refused every body that is neither,
 * and the V2 body went through `readSandboxParentV2`, which holds the published schema.
 * This module adds what the PRINTED screen needs on top, and is where a value the screen
 * would otherwise mis-print is refused:
 *
 * - the seven steps are seven, once each, or the whole step section is absent (the V1
 *   reader is tolerant here: it answers 3 steps, or 9, without complaint);
 * - a step whose evaluation is not one of the four published words is `unknown`, never
 *   `pass`; a V2 step with no stored evidence is `not-recorded`, never `unavailable`;
 * - a count that does not fit (`passed > total`, a total that is not the seven) is
 *   `null`, which the screen prints as `Not available`, never as a clamped number;
 * - timestamps are UTC epoch milliseconds or `null`: a V1 ISO string that is not
 *   exactly ISO-8601 UTC is `null`, not whatever `Date.parse` makes of it;
 * - an `unsupported` answer is a typed refusal with its sentence, never a partial view.
 *
 * BE-P2 / BE-P3 additive members (V1 body only; read closed by `execution/stageFacts.ts`): `stage_facts` (FE-067) become
 * `runtime` / `reconciliation`, the `certification` identity keys (FE-066) become `identity`, `source_figures` (FE-072)
 * become `figures`, a finding's `opened_at` is the Opened column (else `created_at`), and a plan's `author` / `envelope`
 * (FE-072) are its Author / Envelope. A V2 following-parent body carries none of them: every one reads as typed absence.
 *
 * What it will not do: compute. No gate, no headroom, no freshness: every figure here is the
 * server's or absent (certification.ts, rules 1 and 2). A finding is `open` only when its row
 * carries `resolved_at: null` and `resolved` only when it carries an instant; a row without the
 * key is `unknown`, never open. The counts built on that (model.ts `findingCounts`) exist only
 * for a complete, untruncated list in which every state is known.
 */
import type { FreshnessState, PanelStatus } from "../../../contracts";
import { STEP_KEYS, type SandboxCertification, type StepKey } from "../../../certification";
import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import { unsupportedText, type SandboxVersionRead } from "../../readers/dispatch";
import type { SandboxParentV2 } from "../../readers/governanceParents";
import {
  cell,
  figureRowsOf,
  reconciliationFactOf,
  runtimeFactOf,
  type FactCell,
  type FigureRow,
  type ReconciliationFact,
  type RuntimeFact,
} from "../../readers/stageFactViews";
import type { DeploymentIdentity, PlanEnvelopeRef } from "../../../stageFacts";

/* ── the view ─────────────────────────────────────────────────────────────── */

export type StepState = "pass" | "fail" | "stale" | "unavailable" | "not-recorded" | "unknown";

export interface StepView {
  key: StepKey;
  /** 1 to 7, the fixed order of the seven steps. */
  ordinal: number;
  label: string;
  state: StepState;
  /** The source word as published (`BROKER`); the screen words it. */
  authority: string | null;
  /** The server's sentence (V1 only). */
  summary: string | null;
  /** The server's blocker code for this step (V1 only); provenance, never a sentence. */
  blockerCode: string | null;
  asOf: UtcEpochMs | null;
  expiresAt: UtcEpochMs | null;
  evidenceId: string | null;
}

export type StepsView =
  | { availability: "available"; items: readonly StepView[] }
  | { availability: "absent"; text: string; code: string | null };

export interface ProgressView {
  /** The server's count; `null` when it does not fit the total. */
  passed: number | null;
  total: number | null;
  /** The server's verdict. Absent or unreadable is `false`. */
  eligible: boolean;
  blockerCodes: readonly string[];
  evidenceSetHash: string | null;
}

export interface CollectionView<T> {
  total: number | null;
  returned: number | null;
  truncated: boolean;
  rows: readonly T[];
}

export type FindingState = "open" | "resolved" | "unknown";

export interface FindingView {
  id: string;
  /** `CRITICAL`, `ERROR`, `WARNING`, `INFO`; any other word is `null` (the screen words it Unknown). */
  severity: string | null;
  /** The server's `finding_code`; provenance, never a sentence. */
  code: string | null;
  /** The server's sentence for the finding. */
  summary: string | null;
  /** `blocking` as published; `null` = not a boolean / absent. */
  blocking: boolean | null;
  /** `opened_at` when the body publishes it, else `created_at`: when the finding was recorded (the hi-fi's Opened column). */
  openedAt: UtcEpochMs | null;
  resolvedAt: UtcEpochMs | null;
  /** From `resolved_at` alone: `null` is open, an instant is resolved, an absent or unreadable key is unknown. */
  state: FindingState;
}

export interface TimelineRowView {
  id: string;
  action: string | null;
  actor: string | null;
  at: UtcEpochMs | null;
}

/** The latest Canary envelope drafted from a plan: `null` value = the lookup ran and none exists. */
export type PlanEnvelope = { envelopeId: string; revision: number } | null;

export interface PlanView {
  id: string;
  target: string | null;
  status: string | null;
  blockerCodes: readonly string[];
  createdAt: UtcEpochMs | null;
  /** `author.user_id`; `null` = not published. */
  author: string | null;
  /** FE-072; `null` = the body carries none (or it was refused). */
  envelope: FactCell<PlanEnvelope> | null;
}

export interface PanelView {
  id: string;
  authority: string | null;
  state: PanelStatus;
  freshness: FreshnessState | null;
  asOf: UtcEpochMs | null;
  /** The server withheld this panel (figures disagree). */
  suppressed: boolean;
  verified: boolean;
}

export type LineageKind = "artifact" | "r1" | "r2" | "paper" | "grant";

export interface LineageView {
  kind: LineageKind;
  value: string;
  /** A published route, or `null`. */
  href: string | null;
}

export interface SandboxView {
  version: "v1" | "v2";
  schemaVersion: string | null;
  certificationId: string;
  deploymentId: string | null;
  portfolioId: string | null;
  venue: string | null;
  accountRef: string | null;
  workflowState: string | null;
  workflowVersion: number | null;
  /** Published by the V2 body only; V1 carries none, the screen falls back to the runtime manifest. */
  workspaceId: string | null;
  /** The Portal's own read clock (V2 only). Not source freshness. */
  observedAt: UtcEpochMs | null;
  policyVersion: string | null;
  formulaVersion: string | null;
  deliveryProfile: string | null;
  sourceIntegrationState: string | null;
  /** `null` and left `null`: the published runtime state is always absent (certification.ts rule 1). */
  runtimeState: string | null;
  /** V1 only: true if the body says the Portal asked the Trading System to act (fail-closed: unreadable is true). */
  sourceActed: boolean;
  /** FE-067: `stage_facts.runtime` / `.reconciliation`; `null` = the response carries none (V2 body, older producer, or refused). */
  runtime: RuntimeFact | null;
  reconciliation: ReconciliationFact | null;
  /** FE-066: the five identity keys of the `certification` record; `null` = none. */
  identity: DeploymentIdentity | null;
  /** FE-072: Internal / Broker / Difference rows; `null` = none. */
  figures: readonly FigureRow[] | null;
  steps: StepsView;
  progress: ProgressView | null;
  findings: CollectionView<FindingView> | null;
  timeline: CollectionView<TimelineRowView> | null;
  plans: readonly PlanView[] | null;
  panels: readonly PanelView[];
  lineage: readonly LineageView[];
}

export type SandboxViewRead =
  | { kind: "ready"; view: SandboxView }
  | { kind: "unsupported"; text: string; schemaVersion: string | null };

/* ── helpers ──────────────────────────────────────────────────────────────── */

export const STEP_LABELS: Readonly<Record<StepKey, string>> = {
  CONNECT: "Connect",
  SYNC: "Sync",
  ORDER_TYPES: "Order types",
  RECONCILIATION: "Reconciliation clean",
  TIMEBOXED_RUN: "Timeboxed run",
  CLEANUP: "Cleanup",
  EXIT_REVIEW: "Exit review",
};

/** A published word inside its published vocabulary, or `null`: an enum is closed here, so a word this build does not know never reaches the screen as text. */
function closed(word: string | null, vocabulary: readonly string[]): string | null {
  return word !== null && vocabulary.includes(word) ? word : null;
}
const SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const;
const TIMELINE_ACTIONS = ["CREATE", "SUBMIT", "APPROVE", "DENY", "PLAN_PROMOTION"] as const;
const WORKFLOW_STATES = ["DRAFT", "IN_REVIEW", "APPROVED", "DENIED"] as const;
const INTEGRATION_STATES = ["UNAVAILABLE", "SHADOW", "SOURCE_BACKED"] as const;
const DELIVERY_PROFILES = ["fixture", "shadow", "SANDBOX_BINANCE_USDM"] as const;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

/** An ISO-8601 UTC instant as epoch milliseconds, or `null`. Nothing else is accepted. */
export function isoToMs(iso: string | null | undefined): UtcEpochMs | null {
  if (typeof iso !== "string" || !ISO_UTC.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? readUtcEpochMs(ms) : null;
}

/** The four published evaluation words (V1 `evaluation_state`, V2 `stored_evaluation_state`). Any other word is `unknown`, never `pass`. */
const EVALUATION_STATE: Readonly<Record<string, StepState>> = { PASS: "pass", FAIL: "fail", STALE: "stale", UNAVAILABLE: "unavailable" };
const stateOf = (word: string | null): StepState => (word !== null && Object.hasOwn(EVALUATION_STATE, word) ? EVALUATION_STATE[word]! : "unknown");

function orderedSteps(items: readonly StepView[]): StepsView {
  const byKey = new Map<StepKey, StepView>();
  for (const item of items) {
    if (byKey.has(item.key)) return { availability: "absent", text: "The response named a certification step twice, so none of the steps are shown.", code: null };
    byKey.set(item.key, item);
  }
  if (byKey.size !== STEP_KEYS.length) {
    return { availability: "absent", text: "The response did not carry all seven certification steps, so none of them are shown.", code: null };
  }
  return { availability: "available", items: STEP_KEYS.map((key, index) => ({ ...byKey.get(key)!, ordinal: index + 1 })) };
}

/* ── V1 ───────────────────────────────────────────────────────────────────── */

function fromV1(cert: SandboxCertification, schemaVersion: string | null): SandboxView {
  const stepItems: StepView[] = [];
  for (const step of cert.steps) {
    if (step.stepKey === null) {
      // A step with a key this build does not know breaks "seven, once each".
      return viewV1(cert, schemaVersion, { availability: "absent", text: "The response carried a certification step this build does not know, so none of the steps are shown.", code: null });
    }
    stepItems.push({
      key: step.stepKey,
      ordinal: 0,
      label: step.label !== "" ? step.label : STEP_LABELS[step.stepKey],
      state: stateOf(step.evaluationState),
      authority: step.authority,
      summary: step.summary,
      blockerCode: step.blockerCode,
      asOf: isoToMs(step.asOf),
      expiresAt: isoToMs(step.expiresAt),
      evidenceId: step.evidenceHash,
    });
  }
  return viewV1(cert, schemaVersion, orderedSteps(stepItems));
}

function viewV1(cert: SandboxCertification, schemaVersion: string | null, steps: StepsView): SandboxView {
  const progress = cert.progress;
  const total = progress?.totalCount ?? null;
  const passed = progress?.passedCount ?? null;
  const fits = total !== null && passed !== null && total > 0 && passed >= 0 && passed <= total;
  const lineage: LineageView[] = cert.lineage.flatMap((item) => {
    const kind = ({ ARTIFACT: "artifact", R1_APPROVAL: "r1", R2_APPROVAL: "r2", PAPER_EXIT: "paper", PROMOTION_GRANT: "grant" } as Record<string, LineageKind | undefined>)[item.kind];
    return kind === undefined ? [] : [{ kind, value: item.value, href: item.href }];
  });
  return {
    version: "v1",
    schemaVersion,
    certificationId: cert.certificationId,
    deploymentId: cert.deploymentId,
    portfolioId: cert.portfolioId,
    venue: cert.venue,
    accountRef: cert.externalAccountRef,
    workflowState: closed(cert.workflowState, WORKFLOW_STATES),
    workflowVersion: cert.workflowVersion,
    workspaceId: null,
    observedAt: null,
    policyVersion: null,
    formulaVersion: null,
    deliveryProfile: closed(cert.deliveryProfile, DELIVERY_PROFILES),
    sourceIntegrationState: closed(cert.sourceIntegrationState, INTEGRATION_STATES),
    runtimeState: cert.runtimeState,
    sourceActed: cert.sourceSideEffectRequested || cert.runtimeActivationRequested || cert.promotionExecutionRequested,
    runtime: runtimeFactOf(cert.stageFacts),
    reconciliation: reconciliationFactOf(cert.stageFacts),
    identity: cert.identity,
    figures: figureRowsOf(cert.sourceFigures),
    steps,
    progress: progress
      ? {
          passed: fits ? passed : null,
          total: fits ? total : null,
          eligible: progress.eligible,
          blockerCodes: progress.blockerCodes,
          evidenceSetHash: progress.evidenceSetHash,
        }
      : null,
    findings: {
      total: cert.findings.totalCount,
      returned: cert.findings.returnedCount,
      truncated: cert.findings.truncated,
      rows: cert.findings.rows.map((row): FindingView => {
        const resolvedAt = isoToMs(row.resolvedAt);
        return {
          id: row.findingId,
          severity: closed(row.severity, SEVERITIES),
          code: row.findingCode,
          summary: row.summary,
          blocking: row.blocking,
          openedAt: isoToMs(row.openedAt) ?? isoToMs(row.createdAt),
          resolvedAt,
          state: row.resolution === "OPEN" ? "open" : row.resolution === "RESOLVED" && resolvedAt !== null ? "resolved" : "unknown",
        };
      }),
    },
    timeline: {
      total: cert.timeline.totalCount,
      returned: cert.timeline.returnedCount,
      truncated: cert.timeline.truncated,
      rows: cert.timeline.rows.map((row) => ({ id: row.eventId, action: closed(row.action, TIMELINE_ACTIONS), actor: row.actor, at: isoToMs(row.createdAt) })),
    },
    plans: cert.promotionPlans.map((plan) => ({
      id: plan.planId,
      target: closed(plan.targetStage, ["CANARY"]),
      status: closed(plan.status, ["BLOCKED"]),
      blockerCodes: plan.blockerCodes,
      createdAt: isoToMs(plan.createdAt),
      author: plan.author,
      envelope: cell<PlanEnvelopeRef | null, PlanEnvelope>(plan.envelope, (ref) => ref === null ? null : { envelopeId: ref.envelopeId, revision: ref.revision }),
    })),
    panels: cert.sourcePanels.map((panel) => ({
      id: panel.panelId,
      authority: panel.authority,
      state: panel.panelState,
      freshness: panel.freshness,
      asOf: isoToMs(panel.asOf),
      suppressed: panel.suppressed,
      verified: panel.sourceVerification === "VERIFIED",
    })),
    lineage,
  };
}

/* ── V2 ───────────────────────────────────────────────────────────────────── */

function fromV2(body: SandboxParentV2, schemaVersion: string): SandboxView {
  const steps: StepsView =
    body.steps.availability === "AVAILABLE"
      ? orderedSteps(
          body.steps.items.map((item) => ({
            key: item.stepKey,
            ordinal: 0,
            label: STEP_LABELS[item.stepKey],
            state: !item.recorded ? "not-recorded" : stateOf(item.storedEvaluation),
            authority: item.sourceAuthority,
            summary: null,
            blockerCode: null,
            asOf: item.asOf,
            expiresAt: item.expiresAt,
            evidenceId: item.evidenceId,
          })),
        )
      : { availability: "absent", text: "The steps are not published for this response.", code: body.steps.reasonCode };
  const lineage: LineageView[] =
    body.lineage.availability === "AVAILABLE"
      ? [
          { kind: "r1", value: body.lineage.r1ApprovalId, href: `/governance/approvals/${encodeURIComponent(body.lineage.r1ApprovalId)}/r1` },
          { kind: "r2", value: body.lineage.r2ApprovalId, href: `/governance/approvals/${encodeURIComponent(body.lineage.r2ApprovalId)}/r2` },
          { kind: "paper", value: body.lineage.paperExitReviewId, href: `/governance/exit-reviews/${encodeURIComponent(body.lineage.paperExitReviewId)}` },
          { kind: "grant", value: body.lineage.promotionGrantId, href: null },
        ]
      : [];
  return {
    version: "v2",
    schemaVersion,
    certificationId: body.certification.certificationId,
    deploymentId: body.anchors.deploymentId,
    portfolioId: body.anchors.portfolioId,
    venue: null,
    accountRef: null,
    workflowState: body.certification.workflowState,
    workflowVersion: body.certification.workflowVersion,
    workspaceId: body.header.workspaceId,
    observedAt: body.header.observedAt,
    policyVersion: body.certification.policyVersion,
    formulaVersion: body.certification.formulaVersion,
    deliveryProfile: body.certification.deliveryProfile,
    sourceIntegrationState: body.certification.sourceIntegrationState,
    runtimeState: null,
    // The V2 reader refuses a body whose source flags are not exactly false.
    sourceActed: false,
    // The following-parent v2 body is sealed: it carries no stage facts, identity or figures (typed absence; see the receipt's request).
    runtime: null,
    reconciliation: null,
    identity: null,
    figures: null,
    steps,
    progress: null,
    findings: null,
    timeline: null,
    plans: null,
    panels: [],
    lineage,
  };
}

/* ── entry ────────────────────────────────────────────────────────────────── */

/**
 * The port's answer as the screen's view. Never throws; an `unsupported` answer keeps its
 * sentence (`unsupportedText`), which quotes at most 80 control-free characters of the version.
 */
export function readSandboxView(read: SandboxVersionRead): SandboxViewRead {
  try {
    switch (read.kind) {
      case "v1":
        return { kind: "ready", view: fromV1(read.value, read.schemaVersion) };
      case "v2":
        return { kind: "ready", view: fromV2(read.value, read.schemaVersion) };
      case "unsupported":
        return { kind: "unsupported", text: unsupportedText(read), schemaVersion: read.schemaVersion };
      default:
        return { kind: "unsupported", text: "The response is not a document this screen can read.", schemaVersion: null };
    }
  } catch {
    // A value the types promise and a caller broke: refuse the whole answer rather than print half.
    return { kind: "unsupported", text: "The response could not be read, so none of it is shown.", schemaVersion: null };
  }
}
