/**
 * Canary envelope compliance rows, rollback-readiness items and the trial
 * schedule (FE-071, BE-P2).
 *
 * Pure. Every number is either the stored envelope's own approved limit or a
 * value the profile source states under the relation that owns it; the
 * Portal never divides, compares or rounds in the browser, so the server
 * states the ratio and the verdict. When a figure cannot be proven it is a
 * typed `NOT_PUBLISHED` fact with a reason code, never a zero.
 */
import {
  exactCurrencySum,
  latest,
  openOrders,
  ProfileScreenSource,
} from "./profile-screen-composer";
import { available, Fact, missing } from "./stage-facts";

export const COMPLIANCE_CAPS = ["capital", "gross_notional", "daily_loss", "open_orders"] as const;
export type ComplianceCap = (typeof COMPLIANCE_CAPS)[number];

/** Fixed ratio scale and rounding, declared on the wire so nobody guesses. */
export const USED_RATIO_SCALE = 6;

export interface ApprovedEnvelope {
  currency: string;
  capital_cap: string;
  gross_notional_cap: string;
  daily_loss_cap: string;
  max_open_orders: number;
  duration_days: number;
}

export interface ComplianceRow {
  cap: ComplianceCap;
  unit: string;
  policy_limit: Fact<string>;
  approved: string;
  consumed: Fact<string>;
  used_ratio: Fact<string>;
  as_of: Fact<string>;
}

export type EnvelopeVerdictState = "WITHIN_ENVELOPE" | "BREACH" | "UNDETERMINED";
export interface EnvelopeVerdict {
  state: EnvelopeVerdictState;
  basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP";
  undetermined_caps: ComplianceCap[];
}

export interface RollbackItem {
  key: "flatten_plan" | "paper_twin" | "broker_data" | "rollback_drill";
  ready: Fact<boolean>;
  checked_at: Fact<string>;
}

export interface TrialSchedule {
  basis: "STARTED_AT_PLUS_DURATION_DAYS";
  duration_days: number;
  started_at: Fact<string>;
  exit_review_opens_at: Fact<string>;
}

/* ── exact decimals ────────────────────────────────────────────────────────── */

/** Canonical non-negative-or-signed decimal ("007.50" -> "7.5", "-0" -> "0"); `null` when not a plain decimal. */
export function canonicalDecimal(value: unknown): string | null {
  if (typeof value !== "string" || !/^-?\d{1,40}(?:\.\d{1,40})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const tail = fraction.replace(/0+$/, "");
  const body = tail.length > 0 ? `${integer}.${tail}` : integer;
  return negative && body !== "0" ? `-${body}` : body;
}

function scaled(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(scale, "0"));
}

/** consumed / approved at USED_RATIO_SCALE digits, ROUND_HALF_UP, canonical. `null` when approved is not positive. */
export function usedRatio(consumed: string, approved: string): string | null {
  const c = canonicalDecimal(consumed);
  const a = canonicalDecimal(approved);
  if (c === null || a === null || c.startsWith("-") || a.startsWith("-")) return null;
  const scale = Math.max(c.split(".")[1]?.length ?? 0, a.split(".")[1]?.length ?? 0);
  const numerator = scaled(c, scale);
  const denominator = scaled(a, scale);
  if (denominator === 0n) return null;
  const factor = 10n ** BigInt(USED_RATIO_SCALE);
  const rounded = (numerator * factor * 2n + denominator) / (denominator * 2n);
  const digits = rounded.toString().padStart(USED_RATIO_SCALE + 1, "0");
  const whole = digits.slice(0, -USED_RATIO_SCALE);
  const fraction = digits.slice(-USED_RATIO_SCALE).replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

function exceeds(consumed: string, approved: string): boolean {
  const scale = Math.max(consumed.split(".")[1]?.length ?? 0, approved.split(".")[1]?.length ?? 0);
  return scaled(consumed, scale) > scaled(approved, scale);
}

const isoOf = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length === 0) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};

/* ── compliance rows ───────────────────────────────────────────────────────── */

const POLICY_LIMIT_REASON = "BASE_RISK_PROFILE_LIMITS_NOT_PUBLISHED";
/** `positions_v2` proves neither a currency nor a mark lineage (same rule the Live screen applies). */
const POSITION_VALUE_REASON = "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED";

type Consumed = Fact<string>;

function relationBlocks(source: ProfileScreenSource, key: string): string | null {
  const { state, reasonCode } = source.relationState(key);
  if (state === "UNAVAILABLE") return reasonCode ?? `${key.toUpperCase()}_RELATION_UNAVAILABLE`;
  if (state === "PARTIAL") return `${key.toUpperCase()}_WINDOW_PARTIAL`;
  return null;
}

function consumedFacts(approved: ApprovedEnvelope, source: ProfileScreenSource): Record<ComplianceCap, Consumed> {
  const dark = (reason: string): Record<ComplianceCap, Consumed> => ({
    capital: missing(reason), gross_notional: missing(reason), daily_loss: missing(reason), open_orders: missing(reason),
  });
  if (!source.connected) return dark("LIVE_SOURCE_UNAVAILABLE");

  // capital: Σ margin_balances.initial, only when one explicit currency equals the envelope's.
  let capital: Consumed;
  const marginBlock = relationBlocks(source, "margin_balances");
  const margins = source.rows("margin_balances");
  if (marginBlock !== null) capital = missing(marginBlock);
  else if (margins.length === 0) capital = missing("MARGIN_BALANCES_EMPTY_NOT_PROVEN_ZERO");
  else {
    const sum = exactCurrencySum(margins, ["initial"]);
    if (sum.reasonCode !== null) capital = missing(sum.reasonCode);
    else if (sum.value === null || sum.currency === null) capital = missing("MARGIN_INITIAL_NOT_PUBLISHED");
    else if (sum.currency !== approved.currency) capital = missing("EDS03_CANARY_BALANCE_CURRENCY_MISMATCH");
    else {
      const value = canonicalDecimal(sum.value);
      capital = value === null || value.startsWith("-") ? missing("SOURCE_VALUE_NOT_A_NON_NEGATIVE_DECIMAL") : available(value);
    }
  }

  // gross notional: a complete, empty positions relation is an exact 0; anything else is unqualified.
  let gross: Consumed;
  const positionBlock = relationBlocks(source, "positions");
  const positions = source.rows("positions");
  if (positionBlock !== null) gross = missing(positionBlock);
  else if (positions.length === 0) gross = available("0");
  else gross = missing(POSITION_VALUE_REASON);

  // open orders: a count over a complete orders relation.
  let open: Consumed;
  const orderBlock = relationBlocks(source, "orders");
  if (orderBlock !== null) open = missing(orderBlock);
  else open = available(String(openOrders(source.rows("orders")).length));

  return {
    capital,
    gross_notional: gross,
    // A daily window of realised + unrealised loss is not published by any relation this screen holds.
    daily_loss: missing("DAILY_LOSS_WINDOW_NOT_PUBLISHED"),
    open_orders: open,
  };
}

export function complianceRows(approved: ApprovedEnvelope, source: ProfileScreenSource): { rows: ComplianceRow[]; verdict: EnvelopeVerdict } {
  const consumed = consumedFacts(approved, source);
  const limits: Record<ComplianceCap, string> = {
    capital: canonicalDecimal(approved.capital_cap) ?? approved.capital_cap,
    gross_notional: canonicalDecimal(approved.gross_notional_cap) ?? approved.gross_notional_cap,
    daily_loss: canonicalDecimal(approved.daily_loss_cap) ?? approved.daily_loss_cap,
    open_orders: String(approved.max_open_orders),
  };
  const asOf = source.connected ? isoOf(source.asOf) : null;
  const rows: ComplianceRow[] = COMPLIANCE_CAPS.map((cap) => {
    const have = consumed[cap];
    const ratio = have.availability === "AVAILABLE" ? usedRatio(have.value, limits[cap]) : null;
    return {
      cap,
      unit: cap === "open_orders" ? "COUNT" : approved.currency,
      policy_limit: missing(POLICY_LIMIT_REASON),
      approved: limits[cap],
      consumed: have,
      used_ratio: have.availability === "AVAILABLE"
        ? (ratio === null ? missing("APPROVED_LIMIT_NOT_POSITIVE") : available(ratio))
        : missing(have.reason_code),
      as_of: have.availability !== "AVAILABLE" ? missing(have.reason_code)
        : asOf === null ? missing("SOURCE_AS_OF_NOT_PUBLISHED") : available(asOf),
    };
  });
  const breach = rows.some((row) => row.consumed.availability === "AVAILABLE" && exceeds(row.consumed.value, row.approved));
  const undetermined = rows.filter((row) => row.consumed.availability !== "AVAILABLE").map((row) => row.cap);
  return {
    rows,
    verdict: {
      state: breach ? "BREACH" : undetermined.length === 0 ? "WITHIN_ENVELOPE" : "UNDETERMINED",
      basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP",
      undetermined_caps: undetermined,
    },
  };
}

/* ── rollback readiness ────────────────────────────────────────────────────── */

const HEALTHY_BROKER = new Set(["SYNCED", "CURRENT", "OK", "HEALTHY"]);

export function rollbackItems(source: ProfileScreenSource): RollbackItem[] {
  let broker: RollbackItem["ready"];
  let checked: RollbackItem["checked_at"];
  if (!source.connected) {
    broker = missing("LIVE_SOURCE_UNAVAILABLE");
    checked = missing("LIVE_SOURCE_UNAVAILABLE");
  } else {
    const record = latest(source.rows("broker_sync"), "synced_at");
    const at = record === null ? null : isoOf(record.synced_at);
    if (record === null) {
      broker = missing("BROKER_SYNC_NOT_PUBLISHED");
      checked = missing("BROKER_SYNC_NOT_PUBLISHED");
    } else if (at === null) {
      broker = missing("BROKER_SYNC_TIME_NOT_PUBLISHED");
      checked = missing("BROKER_SYNC_TIME_NOT_PUBLISHED");
    } else if (source.freshness === "UNKNOWN") {
      broker = missing("SOURCE_FRESHNESS_UNKNOWN");
      checked = available(at);
    } else {
      // Ready only while the snapshot is healthy AND the profile says it is fresh.
      broker = available(HEALTHY_BROKER.has(String(record.status ?? "").toUpperCase()) && source.freshness === "FRESH");
      checked = available(at);
    }
  }
  return [
    { key: "flatten_plan", ready: missing("FLATTEN_PLAN_NOT_RECORDED"), checked_at: missing("FLATTEN_PLAN_NOT_RECORDED") },
    { key: "paper_twin", ready: missing("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"), checked_at: missing("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED") },
    { key: "broker_data", ready: broker, checked_at: checked },
    { key: "rollback_drill", ready: missing("ROLLBACK_DRILL_NOT_RECORDED"), checked_at: missing("ROLLBACK_DRILL_NOT_RECORDED") },
  ];
}

/* ── trial schedule ────────────────────────────────────────────────────────── */

/**
 * `started_at` is the instant the source states the deployment was activated;
 * the exit review opens when the planned trial ends. With no stated start
 * both are unpublished: a DRAFT envelope is not a started trial.
 */
export function trialSchedule(startedAt: unknown, durationDays: number): TrialSchedule {
  const started = isoOf(startedAt);
  const base = { basis: "STARTED_AT_PLUS_DURATION_DAYS" as const, duration_days: durationDays };
  if (started === null) {
    const reason = "CANARY_ACTIVATION_NOT_RECORDED";
    return { ...base, started_at: missing(reason), exit_review_opens_at: missing(reason) };
  }
  return {
    ...base,
    started_at: available(started),
    exit_review_opens_at: available(new Date(Date.parse(started) + durationDays * 86_400_000).toISOString()),
  };
}
