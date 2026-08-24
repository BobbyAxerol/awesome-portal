/**
 * Slice S3 — the wire adapter.
 *
 * One place where the Portal Execution Query API's snake_case JSON becomes the
 * camelCase types the seventeen screens are written against. It exists so that
 * when a field name changes, one file changes.
 *
 * It sits at the **Portal** boundary, not the Trading System one. The contract
 * pack's `query-samples/order-page.v1.json` is explicit that the Trading System
 * returns `{status, <collection>, count}` and that the envelope fields are "the
 * PORTAL target shape". Absorbing the Trading System's own quirks — offset
 * paging, thirteen serializer variants, raw UUIDs — is the Rust edge's job
 * (master plan §4.3). This module trusts the edge and distrusts the network.
 *
 * Two rules from `extract/` drive most of what follows.
 *
 * **Decimals arrive as strings and must stay strings.**
 * `extract/serialization-contract.json` headline: "Every `numeric` column
 * arrives as a JSON STRING, not a number." 63 fields are affected. A JS `number`
 * is an IEEE-754 double, so `Number("0.00100000")` is `0.001` — the same value
 * with its precision thrown away, and the precision is the part that says what
 * the instrument's tick size is. Rendering that back gives `0.001` where the
 * venue said `0.00100000`. Nothing here ever calls `Number()` on a money,
 * quantity, price, PnL or fee field.
 *
 * **An unknown enum is a finding, not a default.**
 * Master plan §2.2: unknown external enum values "must deserialize to an
 * explicit unsupported value, raise a compatibility alert, and preserve the raw
 * token; they must not crash the stream or silently map to a known state."
 */
import {
  type Authority,
  type DeliveryProfile,
  type Envelope,
  type FilterEcho,
  type FreshnessState,
  type KeysetPage,
  type PanelStatus,
  type RetentionOutcome,
  type RetentionState,
  type SortSpec,
  type OperationStatus,
  type SourceCompleteness,
  type SourceCursor,
  type VerificationResult,
} from "./contracts";

/* ---------------------------------------------------------------------------
 * Decimal
 * ------------------------------------------------------------------------ */

declare const decimalBrand: unique symbol;

/**
 * A decimal exactly as the server wrote it.
 *
 * Branded so that passing one into arithmetic is a compile error. There is no
 * `toNumber` here and adding one would defeat the point: the moment a price
 * becomes a `number`, the digits the venue chose are gone and no later code can
 * tell that they were lost.
 */
export type Decimal = string & { readonly [decimalBrand]: "decimal" };

/** `-12`, `0.5`, `60890.00`, `1e-8` is NOT accepted — the wire never uses it. */
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/**
 * Read a decimal field. Returns `null` for absent or malformed input rather
 * than coercing, because a malformed price is a contract violation worth
 * surfacing as an empty cell and a warning, not worth guessing at.
 */
export function readDecimal(raw: unknown): Decimal | null {
  if (typeof raw === "string" && DECIMAL_RE.test(raw)) return raw as Decimal;
  // A JSON number where the contract promised a string. Not silently accepted:
  // by the time it is here the precision loss has already happened upstream,
  // and rendering it would launder a bug into a plausible-looking figure.
  return null;
}

/**
 * Group the integer part for display. The fraction is returned untouched.
 *
 * `60890.00` → `60,890.00`. `0.00100000` → `0.00100000`. Every digit the server
 * sent survives, which is the whole contract: mechanism M6 forbids abbreviating
 * or ellipsising a numeric, and quietly dropping trailing zeros is a subtler
 * version of the same lie.
 */
export function formatDecimal(value: Decimal, separator = ","): string {
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const dot = body.indexOf(".");
  const whole = dot === -1 ? body : body.slice(0, dot);
  const fraction = dot === -1 ? "" : body.slice(dot);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return `${negative ? "-" : ""}${grouped}${fraction}`;
}

/**
 * There is deliberately no `compareDecimal`.
 *
 * Sorting is server-side and allowlisted (BR-EX-02, master plan §7.2). A
 * comparator here would be an invitation to sort a page in the browser, which
 * produces an order that disagrees with the server's for every row not
 * currently loaded — the exact failure keyset pagination exists to avoid.
 */

/* ---------------------------------------------------------------------------
 * Enums
 * ------------------------------------------------------------------------ */

export type MaybeKnown<T extends string> =
  | { known: true; value: T }
  | { known: false; raw: string };

/**
 * Read an enum without ever guessing.
 *
 * The unsupported branch keeps the raw token so the UI can print what the
 * server actually said. A screen that maps an unrecognised order status onto
 * the nearest familiar one is worse than a screen that shows a strange word:
 * the strange word gets reported, the plausible wrong one does not.
 */
export function readEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): MaybeKnown<T> | null {
  if (typeof raw !== "string") return null;
  return (allowed as readonly string[]).includes(raw)
    ? { known: true, value: raw as T }
    : { known: false, raw };
}

const AUTHORITIES: readonly Authority[] = ["RESEARCH", "EXECUTION", "BROKER", "DERIVED"];
const FRESHNESS: readonly FreshnessState[] = ["OK", "AGING", "STALE", "PAUSED", "UNKNOWN"];
const COMPLETENESS: readonly SourceCompleteness[] = [
  "EVENT_SOURCED",
  "POLL_BOUNDED",
  "UNKNOWN",
];
const PROFILES: readonly DeliveryProfile[] = [
  "fixture",
  "shadow",
  "paper",
  "sandbox",
  "live_canary",
  "live_full",
];
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

/* ---------------------------------------------------------------------------
 * Scalars
 * ------------------------------------------------------------------------ */

/**
 * IDs are strings and stay strings.
 *
 * `extract/serialization-contract.json` records that the `_jsonable` helper is
 * copy-pasted across seven repositories and only one of them stringifies UUIDs,
 * so the same logical field can arrive quoted from one endpoint and unquoted
 * from another. Its own instruction — "treat any uuid-typed column as String
 * and tolerate both quoted and unquoted forms" — is what this implements.
 */
export function readId(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

/** RFC3339, kept verbatim. Never parsed for display — see the note below. */
export function readTimestamp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Shape check only. A timestamp is not reformatted here because the display
  // timezone is still an open owner decision (PHASE_TRACKER §8.4), and picking
  // one in the adapter would scatter that decision across every screen.
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

function readInt(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}

function readBool(raw: unknown): boolean {
  return raw === true;
}

function readStrings(raw: unknown): readonly string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/* ---------------------------------------------------------------------------
 * Envelope
 * ------------------------------------------------------------------------ */

function readSourceCursor(raw: unknown): SourceCursor | null {
  const o = obj(raw);
  if (!o) return null;
  const eventTs = readTimestamp(o.event_ts);
  const createdAt = readTimestamp(o.created_at);
  const eventId = readId(o.event_id);
  if (!eventTs || !createdAt || !eventId) return null;
  return { eventTs, createdAt, eventId };
}

export interface EnvelopeRead {
  envelope: Envelope;
  /**
   * Compatibility findings — a field the server sent that this build does not
   * understand. Master plan §2.2 requires these to be raised rather than
   * swallowed, so they ride along with the value instead of being logged and
   * forgotten.
   */
  unsupported: readonly { field: string; raw: string }[];
}

/**
 * Read the canonical envelope (master plan §7.1).
 *
 * Missing optional fields are absent, not defaulted. The one field that cannot
 * be absent is `authority`, because a panel with no stated authority is a panel
 * making an anonymous claim; it falls back to `DERIVED` with a warning, which is
 * the weakest of the four and therefore the safe one to be wrong about.
 */
export function readEnvelope(raw: unknown): EnvelopeRead {
  const o = obj(raw) ?? {};
  const unsupported: { field: string; raw: string }[] = [];

  function enumOr<T extends string>(
    field: string,
    allowed: readonly T[],
    fallback: T | undefined,
  ): T | undefined {
    const parsed = readEnum(o[field], allowed);
    if (!parsed) return fallback;
    if (parsed.known) return parsed.value;
    unsupported.push({ field, raw: parsed.raw });
    return fallback;
  }

  const authority = enumOr("source_authority", AUTHORITIES, "DERIVED") as Authority;
  const freshness = enumOr("freshness_state", FRESHNESS, "UNKNOWN") as FreshnessState;

  const warnings = [...readStrings(o.warnings)];
  if (!o.source_authority) {
    warnings.push("No source authority was stated; this panel is shown as DERIVED.");
  }
  for (const u of unsupported) {
    warnings.push(`Unsupported ${u.field} value "${u.raw}" — shown as a compatibility gap.`);
  }

  const envelope: Envelope = {
    authority,
    asOf: readTimestamp(o.as_of),
    readAt: readTimestamp(o.read_at),
    sourceCursor: readSourceCursor(o.source_cursor),
    sourceSequence: readInt(o.source_sequence),
    projectionEpoch: readId(o.projection_epoch),
    projectionSequence: readInt(o.projection_sequence),
    sourceCompleteness: enumOr("source_completeness", COMPLETENESS, undefined),
    pollIntervalMs: readInt(o.poll_interval_ms),
    deliveryProfile: enumOr("delivery_profile", PROFILES, undefined),
    freshness,
    ageSeconds: typeof o.age_seconds === "number" ? o.age_seconds : null,
    lagMs: readInt(o.lag_ms),
    panelState: enumOr("panel_state", PANEL_STATES, undefined),
    capabilitySnapshotId: readId(o.capability_snapshot_id),
    warnings,
    digest: readId(o.digest),
    formulaVersion: typeof o.formula_version === "string" ? o.formula_version : null,
  };

  return { envelope, unsupported };
}

/* ---------------------------------------------------------------------------
 * Keyset page
 * ------------------------------------------------------------------------ */

function readSort(raw: unknown): readonly SortSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const o = obj(entry);
    const field = o && typeof o.field === "string" ? o.field : null;
    const direction = o?.direction === "desc" ? "desc" : "asc";
    return field ? [{ field, direction } as SortSpec] : [];
  });
}

function readFilters(raw: unknown): readonly FilterEcho[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const o = obj(entry);
    if (!o || typeof o.field !== "string") return [];
    return [
      {
        field: o.field,
        // No defaults. This echo exists so a reader can see what the server
        // actually filtered by; inventing `eq` and `""` for a filter we could
        // not read produced a line that says the server filtered on an empty
        // string — which it never did, and which reads as a real constraint.
        op: typeof o.op === "string" ? o.op : null,
        value:
          typeof o.value === "string"
            ? o.value
            : Array.isArray(o.value)
              ? o.value.filter((v): v is string => typeof v === "string").join(", ")
              : null,
      } as FilterEcho,
    ];
  });
}

/**
 * Read one page of a keyset list (master plan §7.2).
 *
 * `total_count` is required. There is no fallback to `rows.length`: a page that
 * cannot say how large the population is has not met the contract, and rendering
 * the loaded-row count in the footer would be the precise failure mechanism M7
 * exists to prevent. A missing count surfaces as `0`, which reads as wrong
 * rather than as plausible.
 */
export const RETENTION_OUTCOMES: readonly RetentionOutcome[] = [
  "HOT",
  "PARTIAL_HOT",
  "COLD_REQUESTABLE",
  "PURGED",
  "UNKNOWN",
];

/**
 * Read the retention envelope off a page.
 *
 * `KeysetPage.retention` has been declared since phase 0 and **no reader ever
 * populated it**, so the whole retention module — five outcomes, the
 * empty-versus-unavailable rule, the restore request — sat downstream of a
 * field nothing parsed.
 *
 * The wire name is `availability`. `execution-projection-page.v1` is the only
 * contract that publishes retention at all, and it publishes
 * `{ availability, policy_version }`; `outcome` was a frontend guess, and
 * `EX-BE-04b` names the five values in prose without ever giving the field a
 * name. `outcome` is still accepted so that a server which adopts the guessed
 * name is not misread, but `availability` is what the contract says.
 *
 * An unreadable value becomes `UNKNOWN`, never `HOT`: "nobody can say" is the
 * safe answer, and the one thing that must never happen here is an unrecognised
 * token resolving to "all of it is online".
 */
export function readRetention(raw: unknown): RetentionState | null {
  const o = obj(raw);
  if (!o) return null;
  const parsed = readEnum(o.availability ?? o.outcome, RETENTION_OUTCOMES);
  return {
    outcome: parsed?.known ? parsed.value : "UNKNOWN",
    hotFrom: typeof o.hot_from === "string" ? o.hot_from : null,
    // `UNCONFIGURED` is a real published value, not a missing one — the policy
    // exists as a field and says no policy is configured. It is carried through
    // verbatim rather than blanked, so the notice can name it.
    policyVersion: typeof o.policy_version === "string" ? o.policy_version : null,
  };
}

export function readKeysetPage<T>(
  raw: unknown,
  mapRow: (row: Record<string, unknown>) => T | null,
): KeysetPage<T> {
  const o = obj(raw) ?? {};
  // Three envelopes reach this reader and all three are real. The governance
  // BFF wraps its page under `page` beside a sibling `counts`
  // (`governance.service.ts` list response); other endpoints wrap under `data`;
  // fixtures pass the page bare. Reading only the last two returned an empty
  // list and a zero count against the live BFF — a table that says "no results"
  // when the server sent a full page.
  const data = obj(o.page) ?? obj(o.data) ?? o;
  const rowsRaw = Array.isArray(data.rows) ? data.rows : Array.isArray(o.rows) ? o.rows : [];

  const rows: T[] = [];
  for (const entry of rowsRaw) {
    const row = obj(entry);
    if (!row) continue;
    const mapped = mapRow(row);
    // A row this build cannot read is dropped rather than rendered half-empty.
    // The count still comes from the server, so the footer will not match the
    // visible rows — which is the correct, visible symptom of a contract skew.
    if (mapped !== null) rows.push(mapped);
  }

  return {
    rows,
    // No `?? 0`. A count nobody published is not a count of nothing.
    totalCount: readInt(data.total_count) ?? readInt(o.total_count),
    filteredCount: readInt(data.filtered_count) ?? readInt(o.filtered_count),
    nextCursor: typeof data.next_cursor === "string" ? data.next_cursor : null,
    prevCursor: typeof data.prev_cursor === "string" ? data.prev_cursor : null,
    hasMore: readBool(data.has_more),
    hasPrevious: readBool(data.has_previous),
    appliedSort: readSort(data.applied_sort),
    appliedFilters: readFilters(data.applied_filters),
    retention: readRetention(data.retention ?? o.retention),
  };
}

/* ---------------------------------------------------------------------------
 * Operations — 202 is not a result
 * ------------------------------------------------------------------------ */

export const VERIFICATION_RESULTS: readonly VerificationResult[] = [
  "NOT_STARTED",
  "PENDING",
  "ACKNOWLEDGED",
  "SUCCEEDED",
  "FAILED",
  "DENIED",
  "PARTIAL",
  "UNCERTAIN",
  "EXPIRED",
];

/**
 * Has verification reached a state that stops the operator watching?
 *
 * `UNCERTAIN` is deliberately **not** settled. Master plan §7.3: it "is terminal
 * for the automatic retry loop but non-terminal for operational truth... It
 * never ages into EXPIRED: the external effect may have happened." A UI that
 * treats it as settled closes the incident nobody opened.
 */
export function isSettled(result: VerificationResult): boolean {
  return (
    result === "SUCCEEDED" ||
    result === "FAILED" ||
    result === "DENIED" ||
    result === "PARTIAL" ||
    result === "EXPIRED"
  );
}

/**
 * The single value that means the command did what was asked.
 *
 * Written as an equality rather than a list of exclusions on purpose. Every
 * "not failed" formulation eventually admits `ACKNOWLEDGED` or `PARTIAL`, and
 * both of those mean something happened that is not what was requested.
 */
export function isTerminalSuccess(result: VerificationResult): boolean {
  return result === "SUCCEEDED";
}

export interface OperationRead {
  operationId: string | null;
  /** Where the Portal workflow is. */
  status: OperationStatus | null;
  /** What verify observed. A second axis — see contracts.ts. */
  verification: MaybeKnown<VerificationResult> | null;
  receipt: string | null;
  /**
   * Why nothing was relayed, verbatim from the server.
   *
   * `execution.command-operation.v1` publishes `blockers: ["COMMAND_RELAY_DISABLED"]`
   * beside a BLOCKED status, and this reader used to drop it — leaving a screen
   * that could say an operation was stuck and never say what stuck it.
   */
  blockers: readonly string[];
  /**
   * Whether this operation asked anything of the Trading System.
   *
   * Read here as well as on the plan because the operation is the record that
   * outlives the drawer: after an apply, this is the only published answer to
   * "did that reach the source?".
   */
  sourceSideEffectRequested: boolean;
  unsupported: readonly { field: string; raw: string }[];
}

export const OPERATION_STATUSES: readonly OperationStatus[] = [
  "BLOCKED",
  "PLANNED",
  "AWAITING_APPLY",
  "APPLIED_UNVERIFIED",
  "VERIFIED",
  "PARTIAL",
  "FAILED",
];

/**
 * Read an operation, including the response to `apply`.
 *
 * `httpStatus` is passed in because the most dangerous reading on this whole
 * surface is of a bare `202`. Master plan §7.3: "Apply returns 202 plus
 * operation ID and receipt only." So a 202 becomes `APPLIED_UNVERIFIED` with
 * verification `PENDING` — never `VERIFIED`, never `SUCCEEDED`, and never a
 * closed drawer. If the body claims otherwise, the body is not believed: a
 * server that returns 202 and `SUCCEEDED` together has contradicted itself, and
 * the safe half of a contradiction is the one that keeps the operator watching.
 */
export function readOperation(raw: unknown, httpStatus?: number): OperationRead {
  const o = obj(raw) ?? {};
  const unsupported: { field: string; raw: string }[] = [];

  const statusParsed = readEnum(o.status, OPERATION_STATUSES);
  if (statusParsed && !statusParsed.known) {
    unsupported.push({ field: "status", raw: statusParsed.raw });
  }

  const verificationParsed = readEnum(o.verification_result, VERIFICATION_RESULTS);
  if (verificationParsed && !verificationParsed.known) {
    unsupported.push({ field: "verification_result", raw: verificationParsed.raw });
  }

  const accepted = httpStatus === 202;

  return {
    operationId: readId(o.operation_id),
    status: accepted
      ? "APPLIED_UNVERIFIED"
      : statusParsed?.known
        ? statusParsed.value
        : null,
    verification: accepted
      ? { known: true, value: "PENDING" }
      : (verificationParsed ?? null),
    // `relay_receipt` is the published name. The two below are earlier guesses
    // kept for the apply response; against the contract's own fixture the old
    // pair matched nothing, so the receipt was always null and the evidence of
    // what the relay did never reached the screen.
    receipt: readId(o.relay_receipt) ?? readId(o.receipt) ?? readId(o.receipt_id),
    blockers: Array.isArray(o.blockers) ? o.blockers.filter((b): b is string => typeof b === "string") : [],
    sourceSideEffectRequested: o.source_side_effect_requested !== false,
    unsupported,
  };
}

/* ---------------------------------------------------------------------------
 * Problems
 * ------------------------------------------------------------------------ */

export interface Problem {
  code: string;
  message: string;
  retryAfterSeconds: number | null;
  /**
   * Which panel state this failure resolves to.
   *
   * Never `ok`. Stated in the type so the callers that build a `Result` from
   * this do not need a cast — and a cast is what was hiding the fact that
   * nothing proved it.
   */
  panelStatus: Exclude<PanelStatus, "ok">;
}

/**
 * Map an HTTP failure onto a panel state.
 *
 * The rule is `error-samples/problems.v1.json`, verbatim: "empty list = []/OK;
 * 5xx = unavailable; unknown enum fail closed". The distinctions matter because
 * the three failures below need three different responses from a human, and one
 * generic error box would flatten them into "something went wrong".
 */
export function panelStatusForHttp(status: number): Exclude<PanelStatus, "ok"> {
  if (status === 401 || status === 403) return "denied";
  if (status >= 500) return "unavailable";
  if (status === 406 || status === 409) return "unavailable";
  if (status === 429) return "stale";
  return "unavailable";
}

export function readProblem(raw: unknown, httpStatus: number): Problem {
  const o = obj(raw) ?? {};
  const envelope = obj(o.envelope) ?? o;
  const error = obj(envelope.error) ?? {};
  return {
    code: typeof error.code === "string" ? error.code : `HTTP_${httpStatus}`,
    message: typeof error.message === "string" ? error.message : "The request failed.",
    retryAfterSeconds: readInt(error.retry_after_seconds),
    panelStatus: panelStatusForHttp(httpStatus),
  };
}

/**
 * An empty list is not a failure — `error-samples/problems.v1.json` bothers to
 * say so ("empty list = []/OK"), and `KeysetTable` implements it: zero rows
 * render as `empty` with a reason, never as `unavailable`. A screen that reports
 * "nothing matched" as "the system is broken" provokes the opposite response
 * from a human. There is no helper here because there is no decision to make.
 */

/* ---------------------------------------------------------------------------
 * Request key (BR-EX-18)
 * ------------------------------------------------------------------------ */

/**
 * A client-generated opaque key for `POST /commands/plans`.
 *
 * Master plan §7.3: the key's idempotency scope is actor, workspace,
 * environment, command type and target. Repeating it with the same payload hash
 * while the plan is valid returns the existing operation; reusing it with a
 * different hash returns `409`; a new intent after expiry needs a new key.
 *
 * The consequence for the UI is the part worth stating: the key belongs to the
 * **intent**, not to the click. It is generated once when the operator opens a
 * command and reused for every retry, which is what makes a double-submit, a
 * restored tab and a connection that returns after the client gave up all
 * resolve to one operation instead of three.
 */
export function newRequestKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return `rk_${c.randomUUID()}`;
  // No secure context. 16 bytes from getRandomValues is still opaque and
  // collision-free enough for an idempotency scope already narrowed by actor,
  // environment, command type and target.
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return `rk_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A request key for one intent, derived from a session key and the intent.
 *
 * BR-EX-18 scopes idempotency to the intent, and the intent includes the
 * verdict. A single key held by a container and reused across APPROVE and DENY
 * makes the second call an idempotent replay of the first: the server returns
 * the original operation and the reviewer is told their refusal succeeded when
 * an approval is what was recorded.
 *
 * The suffix stays inside the server's `^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$`.
 */
export function intentKey(
  sessionKey: string,
  subjectId: string,
  verdict: string,
  reason: string,
): string {
  let hash = 5381;
  for (const ch of `${subjectId}|${verdict}|${reason}`) {
    hash = ((hash << 5) + hash + ch.charCodeAt(0)) >>> 0;
  }
  return `${sessionKey}.${verdict}.${hash.toString(36)}`;
}

/** A `409` from reusing a request key with a different payload. */
export function isRequestKeyConflict(problem: Problem): boolean {
  return problem.code === "REQUEST_KEY_CONFLICT" || problem.code === "IDEMPOTENCY_CONFLICT";
}
