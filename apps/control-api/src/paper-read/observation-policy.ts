/**
 * P4-I / F16 — the versioned Paper observation policy, published as a
 * Portal-control record.
 *
 * Portal-control owns this policy; nothing external publishes it. The
 * thresholds are the reviewed product cast, not invention: the hi-fi Paper
 * Workbench gate closes at 30 observed days and 300 trades (GATE_MET in the
 * reviewed cast), and the 14-day figure elsewhere in the loop is the canary
 * trial window, which is a different stage's policy.
 *
 * The record is deliberately flat scalars so it can ride inside the published
 * `observation_gate` NarrowRecord without a schema change.
 */
export const OBSERVATION_POLICY_VERSION = "execution.observation-policy.v1";

export const PAPER_OBSERVATION_POLICY = Object.freeze({
  policy_version: OBSERVATION_POLICY_VERSION,
  stage: "PAPER_OBSERVATION",
  minimum_observed_days: 30,
  minimum_trade_count: 300,
});
