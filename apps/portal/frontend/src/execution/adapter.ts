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
  type SortSpec,
  type SourceCompleteness,
  type SourceCursor,
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
        op: typeof o.op === "string" ? o.op : "eq",
        value: typeof o.value === "string" ? o.value : String(o.value ?? ""),
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
export function readKeysetPage<T>(
  raw: unknown,
  mapRow: (row: Record<string, unknown>) => T | null,
): KeysetPage<T> {
  const o = obj(raw) ?? {};
  const data = obj(o.data) ?? o;
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
    totalCount: readInt(data.total_count) ?? readInt(o.total_count) ?? 0,
    filteredCount: readInt(data.filtered_count) ?? readInt(o.filtered_count),
    nextCursor: typeof data.next_cursor === "string" ? data.next_cursor : null,
    prevCursor: typeof data.prev_cursor === "string" ? data.prev_cursor : null,
    hasMore: readBool(data.has_more),
    hasPrevious: readBool(data.has_previous),
    appliedSort: readSort(data.applied_sort),
    appliedFilters: readFilters(data.applied_filters),
  };
}
