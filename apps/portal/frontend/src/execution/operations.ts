/**
 * Phases 7 and 8 — Operations Queue and Incident Detail (EX-BE-05b F1a/F1b).
 *
 * One module because the two screens share a vocabulary and a hazard, and
 * splitting them would let the hazard be handled twice and differently.
 *
 * THE HAZARD, stated once
 *
 * Both responses pin `source_status_unchanged: true` and
 * `source_side_effect_requested: false` as SCHEMA CONSTANTS. Acknowledging an
 * operation, resolving it, mitigating an incident or closing one changes
 * exactly one thing: a Portal record. Nothing reaches the Trading System.
 *
 * An operator who reads "resolved" as "fixed" stops looking at a position that
 * is still diverged. So every mutation here carries its own disclaimer, and
 * `triageState` is kept structurally apart from `sourceStatus` and
 * `verificationResult` rather than merged into one badge — three fields, three
 * questions:
 *
 *   sourceStatus        what the Trading System is doing
 *   verificationResult  what verify observed
 *   triageState         what a human in the Portal has done about it
 *
 * The four fields rule from the master plan applies here as literally as
 * anywhere: a screen that folded these into one "status" column would let
 * `RESOLVED` sit over a `FAILED` source and read as success.
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

/* ---------------------------------------------------------------------------
 * Shared vocabulary — every list is the schema's
 * ------------------------------------------------------------------------ */

export const SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const;
export type OpSeverity = (typeof SEVERITIES)[number];

export const ENVIRONMENTS = ["PAPER", "SANDBOX", "LIVE"] as const;
export type OpEnvironment = (typeof ENVIRONMENTS)[number];

/** What the Trading System is doing. Not a triage state. */
export const SOURCE_STATUSES = [
  "BLOCKED",
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "UNCERTAIN",
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** What verify observed. A different axis from the two beside it. */
export const VERIFICATION_RESULTS = [
  "NOT_STARTED",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL",
  "UNCERTAIN",
  "DENIED",
  "EXPIRED",
] as const;
export type OpVerification = (typeof VERIFICATION_RESULTS)[number];

/** What a human in the Portal has done. Changes nothing upstream. */
export const TRIAGE_STATES = ["UNACKNOWLEDGED", "ACKNOWLEDGED", "RESOLVED"] as const;
export type TriageState = (typeof TRIAGE_STATES)[number];

const AUTHORITIES = ["PORTAL", "EXECUTION", "BROKER", "DERIVED", "RESEARCH"] as const;

/* ---------------------------------------------------------------------------
 * Phase 7 — the queue
 * ------------------------------------------------------------------------ */

export interface QueueRow {
  operationId: string;
  commandKey: string;
  environment: OpEnvironment | null;
  target: { type: string | null; id: string | null };
  riskTier: string | null;
  severity: OpSeverity | null;
  sourceAuthority: Authority | null;
  /** The Trading System's own state. */
  sourceStatus: SourceStatus | null;
  /** What verify observed. */
  verificationResult: OpVerification | null;
  /** What a Portal operator has done. Never merged with the two above. */
  triageState: TriageState | null;
  /** Optimistic concurrency. Every mutation must echo it. */
  workflowVersion: number | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  resolutionEvidenceHash: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface QueuePage {
  rows: readonly QueueRow[];
  /** Server-counted, both of them. The browser never counts its own rows. */
  totalCount: number | null;
  filteredCount: number | null;
  /** Opaque. There are no page numbers to draw and none may be invented. */
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
  appliedSort: readonly { field: string; direction: string }[];
}

export interface OperationsQueue {
  page: QueuePage;
  actorRoles: readonly string[];
  deliveryProfile: string | null;
  /** `UNAVAILABLE` while the source is dark. Rendered, never hidden. */
  sourceIntegrationState: string | null;
  readAt: string | null;
}

function readQueueRow(raw: unknown): QueueRow | null {
  const o = obj(raw);
  const operationId = str(o?.operation_id);
  if (!o || !operationId) return null;
  const target = obj(o.target);
  return {
    operationId,
    commandKey: str(o.command_key) ?? "",
    environment: pick(o.environment, ENVIRONMENTS),
    target: { type: str(target?.type), id: str(target?.id) },
    riskTier: str(o.risk_tier),
    severity: pick(o.severity, SEVERITIES),
    sourceAuthority: pick(o.source_authority, AUTHORITIES),
    sourceStatus: pick(o.source_status, SOURCE_STATUSES),
    verificationResult: pick(o.verification_result, VERIFICATION_RESULTS),
    triageState: pick(o.triage_state, TRIAGE_STATES),
    workflowVersion: int(o.workflow_version),
    acknowledgedAt: str(o.acknowledged_at),
    acknowledgedBy: str(o.acknowledged_by_user_id),
    resolvedAt: str(o.resolved_at),
    resolvedBy: str(o.resolved_by_user_id),
    resolutionReason: str(o.resolution_reason),
    resolutionEvidenceHash: str(o.resolution_evidence_hash),
    createdAt: str(o.created_at),
    updatedAt: str(o.updated_at),
  };
}

export function readOperationsQueue(raw: unknown): OperationsQueue | null {
  const root = obj(raw);
  const page = obj(root?.page);
  if (!root || !page) return null;
  const actor = obj(root.actor);
  return {
    page: {
      rows: (Array.isArray(page.rows) ? page.rows : []).flatMap((r) => {
        const row = readQueueRow(r);
        return row ? [row] : [];
      }),
      totalCount: int(page.total_count),
      filteredCount: int(page.filtered_count),
      nextCursor: str(page.next_cursor),
      prevCursor: str(page.prev_cursor),
      hasMore: page.has_more === true,
      hasPrevious: page.has_previous === true,
      appliedSort: (Array.isArray(page.applied_sort) ? page.applied_sort : []).flatMap((s) => {
        const entry = obj(s);
        const field = str(entry?.field);
        return field ? [{ field, direction: str(entry?.direction) ?? "" }] : [];
      }),
    },
    actorRoles: Array.isArray(actor?.roles)
      ? actor.roles.filter((r): r is string => typeof r === "string")
      : [],
    deliveryProfile: str(root.delivery_profile),
    sourceIntegrationState: str(root.source_integration_state),
    readAt: str(root.read_at),
  };
}

/**
 * What a triage mutation actually did.
 *
 * Both flags are schema constants today and both are read rather than assumed,
 * because the sentence the screen shows is built from them. If a future profile
 * ever sets `sourceSideEffectRequested`, the disclaimer must stop claiming that
 * nothing was asked of the Trading System.
 */
export interface WorkflowResult {
  sourceStatusUnchanged: boolean;
  sourceSideEffectRequested: boolean;
  /** The server recognised the request key and returned the existing record. */
  replayed: boolean;
  operation: QueueRow | null;
}

export function readWorkflowResult(raw: unknown): WorkflowResult | null {
  const o = obj(raw);
  if (!o) return null;
  return {
    // Deny-by-default in the honest direction on both: an unreadable
    // "did the source change" must not be reported as "it did not".
    sourceStatusUnchanged: o.source_status_unchanged === true,
    sourceSideEffectRequested: o.source_side_effect_requested !== false,
    replayed: o.replayed === true,
    operation: readQueueRow(o.operation),
  };
}

/** The sentence every triage mutation carries. Built once so none can soften it. */
export function workflowEffectText(result: WorkflowResult): string {
  if (result.sourceSideEffectRequested) {
    return "This request reached the Trading System. Verify the target before assuming its state.";
  }
  return result.sourceStatusUnchanged
    ? "Recorded in the Portal only. The Trading System was not asked to do anything and its state is unchanged."
    : "Recorded in the Portal. Whether the Trading System state changed was not stated, so do not assume it did not.";
}

/* ---------------------------------------------------------------------------
 * Phase 8 — the incident
 * ------------------------------------------------------------------------ */

export const INCIDENT_STATES = ["OPEN", "MITIGATED", "RESOLVED"] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

/**
 * The rail is forward-only, and that is a property of the DATA rather than of
 * the buttons drawn over it.
 *
 * `stepsFor` exists so no screen can render a reverse or reopen transition by
 * arranging its own steps: the order is fixed here, and a state the reader does
 * not recognise yields no rail at all rather than a plausible one.
 */
export function incidentRail(state: IncidentState | null): readonly {
  state: IncidentState;
  done: boolean;
  current: boolean;
}[] {
  if (!state) return [];
  const at = INCIDENT_STATES.indexOf(state);
  return INCIDENT_STATES.map((s, i) => ({ state: s, done: i < at, current: i === at }));
}

export interface IncidentSourcePanel {
  panelId: string;
  authority: Authority | null;
  /** `unavailable` for all four today. Not empty, not healthy, not zero. */
  panelState: PanelStatus;
  freshness: FreshnessState | null;
  asOf: string | null;
  readAt: string | null;
  completeness: string | null;
  deliveryProfile: string | null;
}

export interface IncidentCollection<T> {
  totalCount: number | null;
  returnedCount: number | null;
  /** The server bounded this. The screen says so; it never infers the rest. */
  truncated: boolean;
  rows: readonly T[];
}

export interface CorrelatedOperation {
  operationId: string;
  relationship: string | null;
  commandKey: string | null;
  severity: OpSeverity | null;
  triageState: TriageState | null;
  sourceStatus: SourceStatus | null;
  verificationResult: OpVerification | null;
  linkedAt: string | null;
}

export interface IncidentEvidence {
  evidenceId: string;
  /** A SHA-256 reference and metadata. Never an artifact body. */
  hash: string | null;
  label: string | null;
  addedAt: string | null;
}

export interface IncidentAnnotation {
  annotationId: string;
  author: string | null;
  body: string;
  /** `CLEAR` or a redaction the server applied. Rendered as given. */
  redactionState: string | null;
  createdAt: string | null;
}

export interface IncidentTimelineEvent {
  eventId: string;
  actor: string | null;
  action: string | null;
  versionBefore: number | null;
  versionAfter: number | null;
  createdAt: string | null;
}

/**
 * What resolution still needs.
 *
 * `eligible` is the server's verdict and the only thing that governs. The
 * blocker codes exist so the screen can say WHICH of four things is missing
 * rather than greying a button and leaving the reviewer to guess.
 */
export interface ResolutionGate {
  eligible: boolean;
  blockerCodes: readonly string[];
  cleanDryRunEvidencePresent: boolean;
  reasonRequired: boolean;
  /** Resolving never resumes a deployment. Read so the screen can prove it. */
  deploymentResumeRequested: boolean;
}

export interface IncidentDetail {
  incidentId: string;
  title: string;
  summary: string;
  severity: OpSeverity | null;
  environment: OpEnvironment | null;
  target: { type: string | null; id: string | null };
  workflowState: IncidentState | null;
  workflowVersion: number | null;
  assignedTo: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  mitigatedAt: string | null;
  mitigationEvidenceHash: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  cleanDryRunEvidenceHash: string | null;
  /** Both false by construction; read so the screen can state them. */
  sourceSideEffectRequested: boolean;
  deploymentResumeRequested: boolean;
  sourcePanels: readonly IncidentSourcePanel[];
  correlatedOperations: IncidentCollection<CorrelatedOperation>;
  evidence: IncidentCollection<IncidentEvidence>;
  annotations: IncidentCollection<IncidentAnnotation>;
  timeline: IncidentCollection<IncidentTimelineEvent>;
  resolutionGate: ResolutionGate | null;
  actorRoles: readonly string[];
  deliveryProfile: string | null;
  sourceIntegrationState: string | null;
}

const PANEL_STATES: readonly PanelStatus[] = [
  "loading",
  "ok",
  "empty",
  "partial",
  "stale",
  "denied",
  "unavailable",
  "insufficient_data",
  "terminal",
];

const FRESHNESS: readonly FreshnessState[] = ["OK", "AGING", "STALE", "PAUSED", "UNKNOWN"];

function collection<T>(raw: unknown, read: (row: unknown) => T | null): IncidentCollection<T> {
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

export function readIncidentDetail(raw: unknown): IncidentDetail | null {
  const root = obj(raw);
  const inc = obj(root?.incident);
  const incidentId = str(inc?.incident_id);
  if (!root || !inc || !incidentId) return null;
  const target = obj(inc.target);
  const gate = obj(root.resolution_gate);
  const actor = obj(root.actor);

  return {
    incidentId,
    title: str(inc.title) ?? incidentId,
    summary: str(inc.summary) ?? "",
    severity: pick(inc.severity, SEVERITIES),
    environment: pick(inc.environment, ENVIRONMENTS),
    target: { type: str(target?.type), id: str(target?.id) },
    // An unrecognised state yields no rail rather than a plausible one.
    workflowState: pick(inc.workflow_state, INCIDENT_STATES),
    workflowVersion: int(inc.workflow_version),
    assignedTo: str(inc.assigned_to_user_id),
    acknowledgedAt: str(inc.acknowledged_at),
    acknowledgedBy: str(inc.acknowledged_by_user_id),
    mitigatedAt: str(inc.mitigated_at),
    mitigationEvidenceHash: str(inc.mitigation_evidence_hash),
    resolvedAt: str(inc.resolved_at),
    resolutionReason: str(inc.resolution_reason),
    cleanDryRunEvidenceHash: str(inc.clean_dry_run_evidence_hash),
    sourceSideEffectRequested: inc.source_side_effect_requested !== false,
    deploymentResumeRequested: inc.deployment_resume_requested !== false,
    sourcePanels: (Array.isArray(root.source_panels) ? root.source_panels : []).flatMap((p) => {
      const panel = obj(p);
      const panelId = str(panel?.panel_id);
      if (!panelId) return [];
      return [
        {
          panelId,
          authority: pick(panel!.source_authority, AUTHORITIES),
          // Deny-by-default: a panel state we cannot read is unavailable, never
          // `ok` and never `empty` — "we looked and there is none" is a claim
          // no dark source can support.
          panelState: pick(panel!.panel_state, PANEL_STATES) ?? "unavailable",
          freshness: pick(panel!.freshness_state, FRESHNESS),
          asOf: str(panel!.as_of),
          readAt: str(panel!.read_at),
          completeness: str(panel!.source_completeness),
          deliveryProfile: str(panel!.delivery_profile),
        },
      ];
    }),
    correlatedOperations: collection(root.correlated_operations, (r) => {
      const o = obj(r);
      const operationId = str(o?.operation_id);
      if (!operationId) return null;
      return {
        operationId,
        relationship: str(o!.relationship),
        commandKey: str(o!.command_key),
        severity: pick(o!.severity, SEVERITIES),
        triageState: pick(o!.triage_state, TRIAGE_STATES),
        sourceStatus: pick(o!.source_status, SOURCE_STATUSES),
        verificationResult: pick(o!.verification_result, VERIFICATION_RESULTS),
        linkedAt: str(o!.linked_at),
      };
    }),
    evidence: collection(root.evidence, (r) => {
      const o = obj(r);
      const evidenceId = str(o?.evidence_id);
      if (!evidenceId) return null;
      return {
        evidenceId,
        hash: str(o!.evidence_hash) ?? str(o!.hash),
        label: str(o!.label) ?? str(o!.kind),
        addedAt: str(o!.created_at) ?? str(o!.added_at),
      };
    }),
    annotations: collection(root.annotations, (r) => {
      const o = obj(r);
      const annotationId = str(o?.annotation_id);
      if (!annotationId) return null;
      return {
        annotationId,
        author: str(o!.author_user_id),
        body: str(o!.body) ?? "",
        redactionState: str(o!.redaction_state),
        createdAt: str(o!.created_at),
      };
    }),
    timeline: collection(root.timeline, (r) => {
      const o = obj(r);
      const eventId = str(o?.event_id);
      if (!eventId) return null;
      return {
        eventId,
        actor: str(o!.actor_user_id),
        action: str(o!.action),
        versionBefore: int(o!.workflow_version_before),
        versionAfter: int(o!.workflow_version_after),
        createdAt: str(o!.created_at),
      };
    }),
    resolutionGate: gate
      ? {
          // Deny-by-default: absent eligibility is not eligibility.
          eligible: gate.eligible === true,
          blockerCodes: Array.isArray(gate.blocker_codes)
            ? gate.blocker_codes.filter((c): c is string => typeof c === "string")
            : [],
          cleanDryRunEvidencePresent: gate.clean_dry_run_evidence_present === true,
          reasonRequired: gate.reason_required !== false,
          // `!== false`, matching the incident record's own copy of this field
          // twenty lines up. One field read two ways is a defect waiting for a
          // second consumer: the screen happens to read the incident's, so the
          // rendered claim is safe today and would not have been tomorrow.
          deploymentResumeRequested: gate.deployment_resume_requested !== false,
        }
      : null,
    actorRoles: Array.isArray(actor?.roles)
      ? actor.roles.filter((r): r is string => typeof r === "string")
      : [],
    deliveryProfile: str(root.delivery_profile),
    sourceIntegrationState: str(root.source_integration_state),
  };
}

/**
 * What each resolution blocker means, in the reviewer's terms.
 *
 * The codes are for machines. A greyed button teaches nothing; "this incident
 * has no assignee" tells the reviewer what to do next.
 */
export const INCIDENT_BLOCKER_TEXT: Record<string, string> = {
  INCIDENT_ACKNOWLEDGEMENT_REQUIRED: "Nobody has acknowledged this incident yet.",
  INCIDENT_ASSIGNEE_REQUIRED: "This incident has no assignee.",
  INCIDENT_NOT_MITIGATED: "Exposure has not been recorded as mitigated.",
  CLEAN_DRY_RUN_EVIDENCE_REQUIRED:
    "A clean dry-run evidence reference has not been attached.",
  INCIDENT_RESOLUTION_REASON_REQUIRED: "A resolution reason is required.",
};

export function blockerText(code: string): string {
  // An unknown code is shown as itself rather than dropped: a blocker nobody
  // can read is still a blocker, and hiding it would make the button look
  // arbitrarily disabled.
  return INCIDENT_BLOCKER_TEXT[code] ?? code;
}
