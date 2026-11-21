/**
 * Typed stage facts shared by the Paper workbench and the Sandbox, Canary and
 * Live Full screens (FE-067, BE-P2).
 *
 * Pure and dependency-free so it is unit-testable with plain fakes. Three
 * rules govern every value built here:
 *
 * 1. A fact is published only from a source row the screen already holds. A
 *    missing source, relation or field becomes a typed `NOT_PUBLISHED` fact
 *    with a reason code. Never a zero, an empty string or a guess.
 * 2. `runtime_state` is NEVER inferred from `active`, from a session, from
 *    readiness or from a freshness word. It is published only when the source
 *    deployment row itself carries a word of the closed vocabulary below.
 * 3. A "no open findings" statement is not a "reconciled" statement. The
 *    reconciliation fact names its basis and refuses the verdict when the
 *    findings window is partial or a finding status cannot be read.
 */

export const STAGE_FACTS_SCHEMA_VERSION = "execution.stage-facts.v1" as const;

/** The closed vocabulary the FE chip already maps. Any other source word is refused, not echoed. */
export const RUNTIME_STATES = ["RUNNING", "PAUSED", "HALTED", "STOPPED"] as const;
export type RuntimeState = (typeof RUNTIME_STATES)[number];

export const RECONCILIATION_VERDICTS = ["NO_OPEN_FINDINGS", "OPEN_FINDINGS"] as const;
export type ReconciliationVerdict = (typeof RECONCILIATION_VERDICTS)[number];

/** Rows a session table may carry; the rest is counted in `omitted_count`, never listed. */
export const SESSION_ROW_CAP = 50;

export type Fact<T> =
  | { availability: "AVAILABLE"; value: T; reason_code: null }
  | { availability: "NOT_PUBLISHED"; value: null; reason_code: string };

export const available = <T>(value: T): Fact<T> => ({ availability: "AVAILABLE", value, reason_code: null });
export const missing = <T = never>(reason_code: string): Fact<T> => ({ availability: "NOT_PUBLISHED", value: null, reason_code });

export type RelationAvailability = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

/** One relation as the screen holds it. `present:false` = the read never asked the source for it. */
export interface RelationInput {
  present: boolean;
  state: RelationAvailability;
  reasonCode: string | null;
  rows: readonly Record<string, unknown>[];
  /** Why a relation that is not present is not present (a reviewed code, not free text). */
  absentReason: string;
}

export const absentRelation = (absentReason: string): RelationInput => ({
  present: false, state: "UNAVAILABLE", reasonCode: null, rows: [], absentReason,
});

export interface StageFactsInput {
  /** The deployment row from the source, or `null` when none was published. */
  deployment: Record<string, unknown> | null;
  sessions: RelationInput;
  reconciliation: RelationInput;
  /** The source's own `as_of` for the findings window; `null` when it states none. */
  reconciliationAsOf: string | null;
}

export interface SessionRow {
  id: string;
  started: string;
  ended: string | null;
  state: string | null;
}

export interface SessionsFact {
  availability: "AVAILABLE" | "NOT_PUBLISHED";
  reason_code: string | null;
  basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW";
  rows: SessionRow[];
  returned_count: number;
  omitted_count: number;
  source_complete: boolean | null;
}

export interface StageFacts {
  schema_version: typeof STAGE_FACTS_SCHEMA_VERSION;
  runtime: {
    runtime_state: Fact<RuntimeState>;
    since: Fact<string>;
  };
  reconciliation: {
    basis: "FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN";
    verdict: Fact<ReconciliationVerdict>;
    open_finding_count: Fact<number>;
    unknown_order_count: Fact<number>;
    as_of: Fact<string>;
  };
  sessions: SessionsFact;
}

/**
 * Reviewed classification of open `reconciliation_findings.finding_type` words.
 *
 * Intentionally EMPTY: the source does not publish its `finding_type`
 * vocabulary, so no word may be called "unknown order" from here. With the
 * table empty an exact zero is still provable (no open finding at all); any
 * open finding makes the unknown-order count NOT_PUBLISHED. Codex fills the
 * table from the source vocabulary; nothing else changes.
 */
export const UNKNOWN_ORDER_FINDING_TYPES: ReadonlySet<string> = new Set<string>();
/** Reviewed finding types that are NOT unknown-order. Same rule: empty until the source names them. */
export const OTHER_FINDING_TYPES: ReadonlySet<string> = new Set<string>();

const RESOLVED_STATUSES = new Set(["RESOLVED", "CLOSED"]);
const OPEN_STATUSES = new Set(["OPEN", "ACKED"]);
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$/;
const STATE_WORD = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

function isoOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/** `runtime_state` / `since` straight from the source deployment row; nothing is derived. */
export function runtimeFacts(deployment: Record<string, unknown> | null): StageFacts["runtime"] {
  if (deployment === null) {
    return { runtime_state: missing("DEPLOYMENT_ROW_NOT_PUBLISHED"), since: missing("DEPLOYMENT_ROW_NOT_PUBLISHED") };
  }
  const word = deployment.runtime_state;
  if (word === undefined || word === null) {
    // `active` is a source flag, not a health check: it is deliberately not read.
    const reason = "SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED";
    return { runtime_state: missing(reason), since: missing(reason) };
  }
  const state = typeof word === "string" ? RUNTIME_STATES.find((item) => item === word.trim().toUpperCase()) : undefined;
  if (state === undefined) {
    const reason = "RUNTIME_STATE_WORD_NOT_IN_CLOSED_VOCABULARY";
    return { runtime_state: missing(reason), since: missing(reason) };
  }
  const since = isoOf(deployment.runtime_state_since) ?? isoOf(deployment.runtime_state_changed_at);
  return {
    runtime_state: available(state),
    since: since === null ? missing("SOURCE_RUNTIME_SINCE_NOT_PUBLISHED") : available(since),
  };
}

function reconciliationFacts(input: RelationInput, asOf: string | null): StageFacts["reconciliation"] {
  const basis = "FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN" as const;
  const refuse = (reason: string): StageFacts["reconciliation"] => ({
    basis, verdict: missing(reason), open_finding_count: missing(reason), unknown_order_count: missing(reason), as_of: missing(reason),
  });
  if (!input.present) return refuse(input.absentReason);
  if (input.state === "UNAVAILABLE") return refuse(input.reasonCode ?? "RECONCILIATION_RELATION_UNAVAILABLE");

  let open = 0;
  let unreadable = 0;
  let unclassified = 0;
  let unknownOrders = 0;
  for (const row of input.rows) {
    const status = typeof row.status === "string" ? row.status.trim().toUpperCase() : "";
    if (RESOLVED_STATUSES.has(status)) continue;
    if (!OPEN_STATUSES.has(status)) { unreadable += 1; continue; }
    open += 1;
    const type = typeof row.finding_type === "string" ? row.finding_type : "";
    if (UNKNOWN_ORDER_FINDING_TYPES.has(type)) unknownOrders += 1;
    else if (!OTHER_FINDING_TYPES.has(type)) unclassified += 1;
  }
  const stamp = asOf === null ? missing<string>("SOURCE_AS_OF_NOT_PUBLISHED") : available(asOf);
  // A finding whose status cannot be read is neither open nor resolved: no verdict at all.
  if (unreadable > 0) return { ...refuse("FINDING_STATUS_UNREADABLE"), as_of: stamp };
  if (open > 0) {
    return {
      basis,
      verdict: available("OPEN_FINDINGS"),
      open_finding_count: available(open),
      unknown_order_count: unclassified > 0 ? missing("FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED") : available(unknownOrders),
      as_of: stamp,
    };
  }
  // Nothing open in a window that may not hold every finding proves nothing.
  if (input.state === "PARTIAL") {
    return { ...refuse(input.reasonCode ?? "RECONCILIATION_WINDOW_PARTIAL"), as_of: stamp };
  }
  return {
    basis,
    verdict: available("NO_OPEN_FINDINGS"),
    open_finding_count: available(0),
    unknown_order_count: available(0),
    as_of: stamp,
  };
}

function sessionsFact(input: RelationInput): SessionsFact {
  const refuse = (reason: string): SessionsFact => ({
    availability: "NOT_PUBLISHED", reason_code: reason, basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW",
    rows: [], returned_count: 0, omitted_count: 0, source_complete: null,
  });
  if (!input.present) return refuse(input.absentReason);
  if (input.state === "UNAVAILABLE") return refuse(input.reasonCode ?? "SESSIONS_RELATION_UNAVAILABLE");
  const valid: SessionRow[] = [];
  for (const row of input.rows) {
    const id = row.execution_session_id;
    const started = isoOf(row.started_at);
    if (typeof id !== "string" || !SESSION_ID.test(id) || started === null) continue;
    const word = typeof row.state === "string" && STATE_WORD.test(row.state) ? row.state : null;
    valid.push({ id, started, ended: isoOf(row.completed_at), state: word });
  }
  valid.sort((a, b) => b.started.localeCompare(a.started) || a.id.localeCompare(b.id));
  const rows = valid.slice(0, SESSION_ROW_CAP);
  return {
    availability: "AVAILABLE",
    reason_code: null,
    basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW",
    rows,
    returned_count: rows.length,
    omitted_count: input.rows.length - rows.length,
    source_complete: input.state !== "PARTIAL",
  };
}

export function buildStageFacts(input: StageFactsInput): StageFacts {
  return {
    schema_version: STAGE_FACTS_SCHEMA_VERSION,
    runtime: runtimeFacts(input.deployment),
    reconciliation: reconciliationFacts(input.reconciliation, input.reconciliationAsOf),
    sessions: sessionsFact(input.sessions),
  };
}

/** Everything unpublished because the whole source is dark (Sandbox/Canary/Live without a readable profile). */
export function darkStageFacts(reason: string): StageFacts {
  const none = absentRelation(reason);
  const facts = buildStageFacts({ deployment: null, sessions: none, reconciliation: none, reconciliationAsOf: null });
  return { ...facts, runtime: { runtime_state: missing(reason), since: missing(reason) } };
}
