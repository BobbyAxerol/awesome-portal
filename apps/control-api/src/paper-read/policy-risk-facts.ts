/**
 * Joined account-policy and risk-profile facts for the Paper workbench deployment block.
 *
 * Built server-side from the profile's own stored snapshot rows, never invented: a member is the published scalar or null.
 * - deployment.account_id -> account_policies.account_id (exactly one row, else every policy member is null);
 * - (strategy_id, mode, venue) -> risk_profiles; `instrument_id` may be empty, so the row with an empty instrument_id is the one
 *   used, and only when exactly one such row matches. More than one match never guesses (null), and neither does a row that names an
 *   instrument (a per-instrument limit is not the deployment's own limit).
 * Additive and optional: the whole block is absent when the join was not read (no snapshot, another workspace, or an authorized-scope
 * read, where the vocabulary of these members is not granted yet and the read fails closed).
 */

type Scalar = string | number | boolean | null;
type Row = Readonly<Record<string, unknown>>;

/** Policy member -> published member of the deployment block. */
const POLICY_MEMBERS = [
  "margin_mode", "position_accounting_mode", "default_leverage", "maker_fee_bps", "taker_fee_bps",
] as const;
/** Risk-profile column -> published member of the deployment block. */
const RISK_MEMBERS = [
  ["max_leverage", "risk_max_leverage"], ["max_notional_order", "risk_max_notional_order"],
  ["max_notional_position", "risk_max_notional_position"], ["max_daily_loss", "risk_max_daily_loss"],
  ["max_drawdown", "risk_max_drawdown"], ["trading_state", "risk_trading_state"], ["is_active", "risk_is_active"],
] as const;

export const POLICY_RISK_MEMBERS: readonly string[] = [...POLICY_MEMBERS, ...RISK_MEMBERS.map(([, out]) => out)];

const scalar = (value: unknown): Scalar => {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
};
const text = (row: Row, key: string): string | null => {
  const value = row[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
};
const emptyInstrument = (row: Row): boolean => {
  const value = row.instrument_id;
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
};

export function joinPolicyRisk(deployment: Row, policies: readonly Row[], risks: readonly Row[]): Record<string, Scalar> {
  const out: Record<string, Scalar> = Object.fromEntries(POLICY_RISK_MEMBERS.map((key) => [key, null]));
  const account = text(deployment, "account_id");
  const policy = account === null ? [] : policies.filter((row) => text(row, "account_id") === account);
  if (policy.length === 1) for (const key of POLICY_MEMBERS) out[key] = scalar(policy[0]![key]);
  const strategy = text(deployment, "strategy_id"), mode = text(deployment, "mode")?.toLowerCase() ?? null, venue = text(deployment, "venue");
  if (strategy !== null && mode !== null && venue !== null) {
    const own = risks.filter((row) => text(row, "strategy_id") === strategy && text(row, "mode")?.toLowerCase() === mode
      && text(row, "venue") === venue && emptyInstrument(row));
    if (own.length === 1) for (const [column, key] of RISK_MEMBERS) out[key] = scalar(own[0]![column]);
  }
  return out;
}
