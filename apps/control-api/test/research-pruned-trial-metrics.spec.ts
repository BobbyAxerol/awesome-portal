/** BR-S02-20 public projection regressions; source facts remain unmodified. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TrialFactsSchema, PrunedTrialMetricSchema } from "../src/research/current-source.contract";
import { trialFacts, TRIAL_PRUNED_NO_OBJECTIVE, RS02_ROW_PREDATES_FACTS } from "../src/research/current-source-facts";
import { CurrentSourceTrialFactsSchema } from "../src/research/current-source.payload";
import { openApiValidator } from "./research-rf05-openapi";

const metricNames = ["mean_is_sharpe", "mean_oos_sharpe", "mean_decay", "std_decay", "temporal_score"] as const;
const real = JSON.parse(readFileSync(resolve(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8"));
const source = () => CurrentSourceTrialFactsSchema.parse(structuredClone(real.rows.TRIAL[0].payload.trial_facts));
const absent = { value: null, reason_code: TRIAL_PRUNED_NO_OBJECTIVE };
const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const canonical = JSON.parse(readFileSync(resolve(contractsRoot, "fixtures/research-current-source.pruned-trial.synthetic.valid.json"), "utf8"));
const validator = openApiValidator("research-current-source.openapi.json", "TrialFacts");

describe("BR-S02-20 completed-objective metrics of PRUNED trials", () => {
  it.each(["0", "2.125", "-0.875"])("suppresses partial source value %s, not just a zero sentinel", value => {
    const facts = source(); facts.pruned = true;
    for (const key of metricNames) facts.metrics[key] = value;
    const before = structuredClone(facts);
    const mapped = trialFacts(facts, "COMPACT", true);
    for (const key of metricNames) expect(mapped.metrics[key]).toEqual(absent);
    expect(mapped.objective_components).toEqual({ state: "NOT_PUBLISHED", reason_code: TRIAL_PRUNED_NO_OBJECTIVE, formula: null, terms: [] });
    expect(mapped.source_trial_id).toBe(facts.source_trial_id);
    expect(mapped).toMatchObject({ evaluation_scope: "INNER_VALIDATION", study_id: facts.study_id });
    expect(facts).toEqual(before);
    expect(TrialFactsSchema.safeParse(mapped).success).toBe(true); validator.assert(mapped);
  });
  it.each([false, null])("ledger PRUNED wins over an old fact flag %s", flag => {
    const facts = source(); facts.pruned = flag;
    const mapped = trialFacts(facts, "COMPACT", false, true);
    expect(mapped.pruned).toBe(true);
    for (const key of metricNames) expect(mapped.metrics[key]).toEqual(absent);
    validator.assert(mapped); expect(TrialFactsSchema.safeParse(mapped).success).toBe(true);
  });
  it("knows PRUNED from the ledger without inventing other historical facts", () => {
    const mapped = trialFacts(undefined, null, false, true);
    expect(mapped).toMatchObject({ state: "NOT_PUBLISHED", reason_code: RS02_ROW_PREDATES_FACTS,
      source_trial_id: null, pruned: true, oos_seen_by_optuna: null });
    for (const key of metricNames) expect(mapped.metrics[key]).toEqual(absent);
    validator.assert(mapped); expect(TrialFactsSchema.safeParse(mapped).success).toBe(true);
  });
  it("retains genuine zero on COMPLETE and the original reason for a missing metric", () => {
    const facts = source(); facts.pruned = false; facts.metrics.mean_is_sharpe = "0";
    const mapped = trialFacts(facts, "COMPACT");
    expect(mapped.metrics.mean_is_sharpe).toEqual({ value: "0", reason_code: null });
    expect(mapped.metrics.mean_oos_sharpe).toEqual({ value: null, reason_code: facts.metrics.oos_reason_code });
    expect(mapped.objective_components).toEqual(facts.objective_components);
    validator.assert(mapped); expect(TrialFactsSchema.safeParse(mapped).success).toBe(true);
    expect(trialFacts(undefined, null).metrics.mean_is_sharpe).toEqual({ value: null, reason_code: RS02_ROW_PREDATES_FACTS });
  });
  it.each(metricNames)("both public contracts reject an unqualified PRUNED %s", key => {
    const invalid = structuredClone(canonical); invalid.metrics[key] = { value: "0", reason_code: null };
    expect(TrialFactsSchema.safeParse(invalid).success).toBe(false); expect(validator.check(invalid)).toBe(false);
    invalid.metrics[key] = { value: null, reason_code: "OTHER_ABSENCE_REASON" };
    expect(TrialFactsSchema.safeParse(invalid).success).toBe(false); expect(validator.check(invalid)).toBe(false);
  });
  it("both public contracts forbid a partial objective decomposition on PRUNED", () => {
    const invalid = structuredClone(canonical);
    invalid.objective_components = source().objective_components;
    expect(TrialFactsSchema.safeParse(invalid).success).toBe(false); expect(validator.check(invalid)).toBe(false);
    expect(PrunedTrialMetricSchema.safeParse(absent).success).toBe(true);
    expect(PrunedTrialMetricSchema.safeParse({ value: "0", reason_code: null }).success).toBe(false);
    expect(TrialFactsSchema.safeParse(canonical).success).toBe(true); validator.assert(canonical);
  });
});
