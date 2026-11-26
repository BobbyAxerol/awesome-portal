import { describe, expect, it } from "vitest";
import { joinPolicyRisk, POLICY_RISK_MEMBERS } from "../src/paper-read/policy-risk-facts";
import { BUSINESS_READ_FIELDS, RECORD_DETAIL_READ_FIELDS, SIBLING_DETAIL_READ_FIELDS } from "../src/execution-v2/read-fields";
import { namedRetainedBusinessFields } from "../src/execution/retained-business-aliases";
import { profileProjectionCatalog } from "../src/execution/profile-projection.catalog";

const deployment = { deployment_id: "d1", strategy_id: "s1", account_id: "a1", mode: "paper", venue: "okx" };
const policy = { account_policy_id: "p1", account_id: "a1", margin_mode: "cross", position_accounting_mode: "NET", default_leverage: "3", maker_fee_bps: "2", taker_fee_bps: "5" };
const risk = { strategy_id: "s1", mode: "paper", venue: "okx", instrument_id: "", max_leverage: "5", max_notional_order: "1000", max_notional_position: "5000",
  max_daily_loss: "250", max_drawdown: "0.1", trading_state: "ACTIVE", is_active: true };

describe("joinPolicyRisk", () => {
  it("joins the one policy by account and the one empty-instrument risk profile by (strategy, mode, venue)", () => {
    expect(joinPolicyRisk(deployment, [policy], [risk])).toEqual({
      margin_mode: "cross", position_accounting_mode: "NET", default_leverage: "3", maker_fee_bps: "2", taker_fee_bps: "5",
      risk_max_leverage: "5", risk_max_notional_order: "1000", risk_max_notional_position: "5000", risk_max_daily_loss: "250",
      risk_max_drawdown: "0.1", risk_trading_state: "ACTIVE", risk_is_active: true,
    });
  });

  it("a missing join stays null, never 0 or a default", () => {
    const out = joinPolicyRisk(deployment, [], []);
    expect(Object.keys(out).sort()).toEqual([...POLICY_RISK_MEMBERS].sort());
    expect(Object.values(out).every((v) => v === null)).toBe(true);
  });

  it("a stated null, an empty string and a false stay what they are (null, null, false)", () => {
    const out = joinPolicyRisk(deployment, [{ ...policy, margin_mode: null, default_leverage: "" }], [{ ...risk, is_active: false }]);
    expect([out.margin_mode, out.default_leverage, out.risk_is_active]).toEqual([null, null, false]);
  });

  it("never guesses: two policies for the account, two empty-instrument profiles, or only a per-instrument profile give null", () => {
    expect(joinPolicyRisk(deployment, [policy, { ...policy, account_policy_id: "p2" }], [risk]).margin_mode).toBeNull();
    expect(joinPolicyRisk(deployment, [policy], [risk, { ...risk, max_leverage: "9" }]).risk_max_leverage).toBeNull();
    expect(joinPolicyRisk(deployment, [policy], [{ ...risk, instrument_id: "BTC-USDT-SWAP" }]).risk_max_leverage).toBeNull();
  });

  it("prefers the empty-instrument profile when per-instrument rows exist beside it", () => {
    expect(joinPolicyRisk(deployment, [policy], [{ ...risk, instrument_id: "BTC-USDT-SWAP", max_leverage: "9" }, risk]).risk_max_leverage).toBe("5");
  });

  it("another account, strategy, mode or venue does not match", () => {
    expect(joinPolicyRisk(deployment, [{ ...policy, account_id: "other" }], [{ ...risk, venue: "binance" }]).margin_mode).toBeNull();
    expect(joinPolicyRisk(deployment, [policy], [{ ...risk, strategy_id: "other" }]).risk_max_leverage).toBeNull();
  });
});

/**
 * Fail closed in an authorized-scope read. Such a read keeps a retained row field only when it is in BUSINESS_READ_FIELDS or the
 * record-detail vocabulary (retainedFieldAllowed / retainedDetailFieldAllowed), and a named account-policy row only inside its
 * narrow alias list. None of the new columns is in any of them, so every one is dropped, not leaked. The access-policy wave must
 * extend exactly this list (see CORE_POLICY_WAVE_FIELD_VOCABULARY_TODO_20261126.md).
 */
describe("authorized-scope reads drop the policy and risk columns", () => {
  const NEW_COLUMNS = [
    "account_type", "margin_mode", "settlement_policy", "allow_borrowing", "default_leverage", "maker_fee_bps", "taker_fee_bps",
    "maintenance_margin_rate", "enforce_pretrade_balance", "require_broker_sync", "max_sync_age_seconds", "position_accounting_mode",
    "loan_package_id", "max_notional_order", "max_notional_position", "max_leverage", "max_order_per_second", "max_order_per_minute",
    "max_daily_loss", "max_drawdown", "trading_state", "is_active", "instrument_id",
  ].filter((name) => !["account_type", "instrument_id"].includes(name));
  const granted = new Set<string>([...BUSINESS_READ_FIELDS, ...RECORD_DETAIL_READ_FIELDS, ...SIBLING_DETAIL_READ_FIELDS]);

  it.each(NEW_COLUMNS)("%s is in no authorized vocabulary", (name) => {
    expect(granted.has(name), name).toBe(false);
  });

  it("the narrow account-policy alias still carries only its metadata members", () => {
    expect(namedRetainedBusinessFields("account_policies")).toEqual(["account_id", "mode", "venue", "created_at", "updated_at"]);
  });

  it("the projection requests the columns (the catalogue is wider than what an authorized read may serve)", () => {
    const bindings = profileProjectionCatalog("paper");
    expect(bindings.find((b) => b.key === "account_policies")!.fields).toContain("margin_mode");
    expect(bindings.find((b) => b.key === "risk_profiles")!.fields).toContain("max_leverage");
  });
});
