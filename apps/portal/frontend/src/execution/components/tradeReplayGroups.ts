/**
 * Order groups, packages and ledgers of the Trading System — read ahead of
 * publication (owner order 2026-09-06: "viết sẵn code cho các logic đó dù TS
 * chưa phát"). Shapes follow `DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md`
 * §7 / §16 / §11 and the contract pack vocabularies:
 *
 *   order_brackets / order_bracket_legs         bracket (entry + STOP / TP / TRAILING children)
 *   conditional_order_groups / …_group_legs     BRACKET | OCO | OTO | OUO | NONE contingency
 *   arb_order_packages                          ATOMIC_ALL_OR_NONE multi-leg packages
 *   portfolio_capital_ledger · settlements      capital movements and cash / security settlements
 *
 * Every reader tolerates absent fields (null), never invents a value, and
 * drops a row only when it has no identity. Vocabulary values outside the
 * published sets are kept as-is (string) so a new value is visible, not lost.
 */
import { ms, num, str } from "./tradeReplayModel";

export const BRACKET_LEG_TYPES = ["ENTRY", "STOP", "TP", "TRAILING"] as const;
export type BracketLegType = (typeof BRACKET_LEG_TYPES)[number];
export const CONTINGENCY_TYPES = ["BRACKET", "OCO", "OTO", "OUO", "NONE"] as const;
export type ContingencyType = (typeof CONTINGENCY_TYPES)[number];
/** group states that are still live on the venue */
export const GROUP_LIVE_STATES: readonly string[] = ["CREATED", "VALIDATED", "SUBMITTING", "ACTIVE", "ENTRY_SUBMITTED", "ENTRY_FILLED", "PARTIALLY_EXECUTED", "UPDATING", "CLOSING", "PARTIALLY_CLOSED", "COMPENSATING", "CANCELING"];
export const GROUP_ATTENTION_STATES: readonly string[] = ["ERROR", "OVERFILLED", "DEGRADED_RECONCILIATION_REQUIRED"];
/** conditional leg states before the leg exists as an `orders` row */
export const LEG_WAITING_STATES: readonly string[] = ["WAITING", "PENDING_SUBMIT"];

export interface BracketGroupLeg {
  legId: string;
  groupId: string;
  legType: BracketLegType | string;
  legIndex: number;
  clientOrderId: string | null;
  side: string | null;
  orderType: string | null;
  quantity: string | null;
  quantityFraction: string | null;
  price: string | null;
  trigger: string | null;
  timeInForce: string | null;
  reduceOnly: boolean;
  intent: string | null;
  status: string | null;
  submittedAt: string | null;
  filledAt: string | null;
  cancelledAt: string | null;
}

export interface BracketGroup {
  groupId: string;
  strategyId: string | null;
  accountId: string | null;
  symbol: string | null;
  positionSide: string | null;
  state: string | null;
  entryClientOrderId: string | null;
  activationPolicy: string | null;
  ocoPolicy: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  legs: BracketGroupLeg[];
}

export interface ConditionalLeg {
  legId: string;
  groupId: string;
  legIndex: number;
  clientOrderId: string | null;
  role: string | null;
  side: string | null;
  orderType: string | null;
  quantity: string | null;
  price: string | null;
  trigger: string | null;
  state: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
}

export interface ConditionalGroup {
  groupId: string;
  contingency: ContingencyType | string;
  executionTrigger: string | null;
  lateFillPolicy: string | null;
  remainderPolicy: string | null;
  state: string | null;
  strategyId: string | null;
  accountId: string | null;
  symbol: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  legs: ConditionalLeg[];
}

export interface PackagePlannedOrder {
  clientOrderId: string | null;
  symbol: string | null;
  side: string | null;
  orderType: string | null;
  quantity: string | null;
  price: string | null;
}

export interface OrderPackage {
  packageId: string;
  strategyId: string | null;
  accountId: string | null;
  venue: string | null;
  policy: string | null;
  state: string | null;
  legCount: number | null;
  grossNotional: string | null;
  netNotional: string | null;
  imbalanceBps: string | null;
  plannedOrders: PackagePlannedOrder[];
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface LedgerMovement {
  id: string;
  /** CAPITAL = portfolio_capital_ledger · SETTLEMENT = settlements */
  kind: "CAPITAL" | "SETTLEMENT";
  /** movement_type, or `${settlement_type} ${direction}` */
  type: string;
  amount: string | null;
  currency: string | null;
  at: string;
  before: string | null;
  after: string | null;
  reason: string | null;
  actor: string | null;
  strategyId: string | null;
  accountId: string | null;
  status: string | null;
}

export interface ReplayGroups {
  brackets: BracketGroup[];
  conditional: ConditionalGroup[];
  packages: OrderPackage[];
  ledger: LedgerMovement[];
  /** which relations the source published at all (a relation absent from the facts is "not published", not "empty") */
  published: { brackets: boolean; conditional: boolean; packages: boolean; ledger: boolean };
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : fallback);
const bool = (v: unknown): boolean => v === true || v === "true";

export function readBracketGroups(groupRows: readonly Record<string, unknown>[], legRows: readonly Record<string, unknown>[]): BracketGroup[] {
  const legsByGroup = new Map<string, BracketGroupLeg[]>();
  for (const row of legRows) {
    const groupId = str(row.bracket_group_id);
    const legId = str(row.leg_id);
    if (!groupId || !legId) continue;
    const leg: BracketGroupLeg = {
      legId, groupId,
      legType: (str(row.leg_type) ?? "").toUpperCase(),
      legIndex: int(row.leg_index),
      clientOrderId: str(row.client_order_id),
      side: str(row.side), orderType: str(row.order_type),
      quantity: str(row.quantity), quantityFraction: str(row.quantity_fraction),
      price: str(row.price), trigger: str(row.trigger_price),
      timeInForce: str(row.time_in_force), reduceOnly: bool(row.reduce_only),
      intent: str(row.intent), status: str(row.status),
      submittedAt: str(row.submitted_at), filledAt: str(row.filled_at), cancelledAt: str(row.cancelled_at),
    };
    legsByGroup.set(groupId, [...(legsByGroup.get(groupId) ?? []), leg]);
  }
  const seen = new Set<string>();
  return groupRows.flatMap((row) => {
    const groupId = str(row.bracket_group_id);
    if (!groupId || seen.has(groupId)) return [];
    seen.add(groupId);
    return [{
      groupId,
      strategyId: str(row.strategy_id), accountId: str(row.account_id),
      symbol: str(row.symbol) ?? (str(row.instrument_id)?.split(".")[0] ?? null),
      positionSide: str(row.position_side), state: str(row.state),
      entryClientOrderId: str(row.entry_client_order_id),
      activationPolicy: str(row.activation_policy), ocoPolicy: obj(row.oco_policy),
      errorMessage: str(row.error_message),
      createdAt: str(row.created_at), updatedAt: str(row.updated_at),
      legs: (legsByGroup.get(groupId) ?? []).sort((a, b) => a.legIndex - b.legIndex),
    }];
  });
}

export function readConditionalGroups(groupRows: readonly Record<string, unknown>[], legRows: readonly Record<string, unknown>[]): ConditionalGroup[] {
  const legsByGroup = new Map<string, ConditionalLeg[]>();
  for (const row of legRows) {
    const groupId = str(row.group_id) ?? str(row.conditional_group_id);
    const legId = str(row.leg_id) ?? str(row.client_order_id);
    if (!groupId || !legId) continue;
    const leg: ConditionalLeg = {
      legId, groupId, legIndex: int(row.leg_index),
      clientOrderId: str(row.client_order_id), role: str(row.leg_role) ?? str(row.role),
      side: str(row.side), orderType: str(row.order_type), quantity: str(row.quantity),
      price: str(row.price), trigger: str(row.trigger_price), state: str(row.state) ?? str(row.status),
      submittedAt: str(row.submitted_at), updatedAt: str(row.updated_at),
    };
    legsByGroup.set(groupId, [...(legsByGroup.get(groupId) ?? []), leg]);
  }
  const seen = new Set<string>();
  return groupRows.flatMap((row) => {
    const groupId = str(row.group_id) ?? str(row.conditional_group_id);
    if (!groupId || seen.has(groupId)) return [];
    seen.add(groupId);
    return [{
      groupId,
      contingency: (str(row.contingency_type) ?? "NONE").toUpperCase(),
      executionTrigger: str(row.execution_trigger), lateFillPolicy: str(row.late_fill_policy), remainderPolicy: str(row.remainder_policy),
      state: str(row.state),
      strategyId: str(row.strategy_id), accountId: str(row.account_id),
      symbol: str(row.symbol) ?? (str(row.instrument_id)?.split(".")[0] ?? null),
      errorMessage: str(row.error_message),
      createdAt: str(row.created_at), updatedAt: str(row.updated_at),
      legs: (legsByGroup.get(groupId) ?? []).sort((a, b) => a.legIndex - b.legIndex),
    }];
  });
}

export function readOrderPackages(rows: readonly Record<string, unknown>[]): OrderPackage[] {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const packageId = str(row.package_id);
    if (!packageId || seen.has(packageId)) return [];
    seen.add(packageId);
    const planned = Array.isArray(row.planned_orders) ? row.planned_orders : [];
    return [{
      packageId,
      strategyId: str(row.strategy_id), accountId: str(row.account_id), venue: str(row.venue),
      policy: str(row.package_policy), state: str(row.state),
      legCount: typeof row.leg_count === "number" ? row.leg_count : planned.length || null,
      grossNotional: str(row.gross_notional), netNotional: str(row.net_notional), imbalanceBps: str(row.imbalance_bps),
      plannedOrders: planned.map((p) => { const o = obj(p); return { clientOrderId: str(o.client_order_id), symbol: str(o.symbol) ?? (str(o.instrument_id)?.split(".")[0] ?? null), side: str(o.side), orderType: str(o.order_type), quantity: str(o.quantity), price: str(o.price) }; }),
      createdAt: str(row.created_at), updatedAt: str(row.updated_at), completedAt: str(row.completed_at),
    }];
  });
}

export function readLedgerMovements(capitalRows: readonly Record<string, unknown>[], settlementRows: readonly Record<string, unknown>[]): LedgerMovement[] {
  const out: LedgerMovement[] = [];
  for (const row of capitalRows) {
    const id = str(row.capital_ledger_id);
    const at = str(row.created_at);
    if (!id || !at) continue;
    out.push({
      id: `capital:${id}`, kind: "CAPITAL", type: str(row.movement_type) ?? "MOVEMENT",
      amount: str(row.amount), currency: str(row.currency), at,
      before: str(row.before_allocated), after: str(row.after_allocated),
      reason: str(row.reason), actor: str(row.actor), strategyId: str(row.strategy_id), accountId: str(row.account_id), status: null,
    });
  }
  for (const row of settlementRows) {
    const id = str(row.settlement_id);
    const at = str(row.settled_at) ?? str(row.settlement_date) ?? str(row.trade_date);
    if (!id || !at) continue;
    out.push({
      id: `settlement:${id}`, kind: "SETTLEMENT", type: `${str(row.settlement_type) ?? "SETTLEMENT"} ${str(row.direction) ?? ""}`.trim(),
      amount: str(row.amount) ?? str(row.quantity), currency: str(row.currency), at,
      before: null, after: null, reason: null, actor: null, strategyId: str(row.strategy_id), accountId: str(row.account_id), status: str(row.status),
    });
  }
  return out.sort((a, b) => (ms(a.at) ?? 0) - (ms(b.at) ?? 0));
}

/** The whole set from a facts bag; a relation missing from the bag is "not published", an empty array is "published, empty". */
export function readReplayGroups(facts: Readonly<Record<string, readonly Record<string, unknown>[] | undefined>>): ReplayGroups {
  const has = (k: string) => Array.isArray(facts[k]);
  return {
    brackets: readBracketGroups(facts.order_brackets ?? [], facts.order_bracket_legs ?? []),
    conditional: readConditionalGroups(facts.conditional_order_groups ?? [], facts.conditional_order_group_legs ?? []),
    packages: readOrderPackages(facts.arb_order_packages ?? []),
    ledger: readLedgerMovements(facts.portfolio_capital_ledger ?? [], facts.settlements ?? []),
    published: { brackets: has("order_brackets"), conditional: has("conditional_order_groups"), packages: has("arb_order_packages"), ledger: has("portfolio_capital_ledger") || has("settlements") },
  };
}

export const EMPTY_GROUPS: ReplayGroups = { brackets: [], conditional: [], packages: [], ledger: [], published: { brackets: false, conditional: false, packages: false, ledger: false } };

/** Published leg roles by client_order_id — authoritative over the type / suffix heuristics when present. */
export function publishedLegRoles(groups: ReplayGroups): Map<string, "ENTRY" | "TP" | "SL" | "TRAILING"> {
  const out = new Map<string, "ENTRY" | "TP" | "SL" | "TRAILING">();
  for (const g of groups.brackets) for (const l of g.legs) {
    if (!l.clientOrderId) continue;
    const t = l.legType.toUpperCase();
    out.set(l.clientOrderId, t === "ENTRY" ? "ENTRY" : t === "TP" ? "TP" : t === "TRAILING" ? "TRAILING" : "SL");
  }
  return out;
}

/** Scope groups to the subject the replay is drawing (accounts and / or strategy). */
export function scopeGroups(groups: ReplayGroups, accounts: ReadonlySet<string>, alphaId: string | null): ReplayGroups {
  const mine = (accountId: string | null, strategyId: string | null) => (accounts.size === 0 || (accountId !== null && accounts.has(accountId)) || (alphaId !== null && strategyId === alphaId));
  return {
    ...groups,
    brackets: groups.brackets.filter((g) => mine(g.accountId, g.strategyId)),
    conditional: groups.conditional.filter((g) => mine(g.accountId, g.strategyId)),
    packages: groups.packages.filter((g) => mine(g.accountId, g.strategyId)),
    ledger: groups.ledger.filter((g) => mine(g.accountId, g.strategyId)),
  };
}

export const groupTimeSpan = (createdAt: string | null, updatedAt: string | null, live: boolean): { t0: number | null; t1: number | null } => ({ t0: ms(createdAt), t1: live ? null : ms(updatedAt) });
export const isGroupLive = (state: string | null): boolean => GROUP_LIVE_STATES.includes((state ?? "").toUpperCase());
export const groupNeedsAttention = (state: string | null): boolean => GROUP_ATTENTION_STATES.includes((state ?? "").toUpperCase());
export const legIsWaiting = (state: string | null): boolean => LEG_WAITING_STATES.includes((state ?? "").toUpperCase());
export const packageIsAtomic = (policy: string | null): boolean => (policy ?? "").toUpperCase().startsWith("ATOMIC");
export { num };
