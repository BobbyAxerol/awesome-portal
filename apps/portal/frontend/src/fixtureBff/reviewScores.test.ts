// @vitest-environment node
/**
 * SIMULATED portfolio and alpha scores of the review lane (FIXTURE_LAB, register section 2c): exact decimals from bigint, the
 * 0.45 P + 0.30 R + 0.25 B identity on the published components, every case present, the window gap, and the unchanged
 * production reader accepting the open keys. Nothing here is source acceptance.
 */
import "./useMissingScenario";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { answerReviewManager, type ReviewManagerProfile } from "../../../fixture-bff/review-manager";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { readManagerDataset } from "../execution/v2/readers/managerDataset";
import { bandOf } from "../execution/v2/screens/portfolios/registerMetrics";
import { disposeSchemaCheck } from "./schemaCheck";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const NOW = "2026-10-22T12:00:00Z";
const ask = (path: string, extra: Record<string, string>, profile: ReviewManagerProfile = "populated"): Body => {
  setFixtureScale(profile === "layout-stress" ? "large" : "medium");
  setFixtureNow(NOW);
  return answerReviewManager("GET", path, new URLSearchParams({ environment: "live", ...extra }), profile);
};
afterEach(() => {
  setFixtureScale("small");
  setFixtureNow("2026-08-22T13:00:00Z");
});
afterAll(disposeSchemaCheck);

/** Hundredths of a score string ("83.17" -> 8317n); the test does its own bigint arithmetic, never a float. */
function hundredths(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole! + fraction.padEnd(2, "0").slice(0, 2));
}
const ten4 = (value: string): bigint => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole! + fraction.padEnd(4, "0").slice(0, 4));
};

describe("portfolio score keys on the groups by portfolio_id", () => {
  const read = (window: string) => ask("/manager/fleet", { group_by: "portfolio_id", limit: "1", window: JSON.stringify(window) });

  it("every group partition publishes the five keys; the score is exactly 0.45 P + 0.30 R + 0.25 B on the published components", () => {
    const result = read("30D");
    expect(result.status).toBe(200);
    let checked = 0;
    for (const group of result.body.groups as Body[]) {
      for (const entry of group.economic_partitions as Body[]) {
        const m = entry.metrics;
        for (const key of ["portfolio_score", "portfolio_score_p", "portfolio_score_r", "portfolio_score_b", "portfolio_score_evidence"]) {
          expect(m[key], key).toBeDefined();
          expect(m[key].provenance_refs[0]).toContain("FIXTURE_LAB");
          expect(m[key].policy_revision).toBe("FIXTURE_LAB");
        }
        expect(m.portfolio_score).toMatchObject({ unit: "SCORE", currency: null });
        if (m.portfolio_score.availability !== "AVAILABLE") {
          expect(m.portfolio_score.reason_code).toBe("INSUFFICIENT_EVIDENCE");
          expect(m.portfolio_score_p.availability).toBe("UNAVAILABLE");
          continue;
        }
        const sum = 45n * hundredths(m.portfolio_score_p.value) + 30n * hundredths(m.portfolio_score_r.value) + 25n * hundredths(m.portfolio_score_b.value);
        expect(ten4(m.portfolio_score.value)).toBe(sum);
        expect(m.portfolio_score.methodology_ref).toContain("FIXTURE_LAB");
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("the variety is there: weak, neutral, fair, good, very good, a provisional one, an insufficient-evidence absence and a true zero", () => {
    const bands = new Set<string>();
    let provisional = 0;
    let insufficient = 0;
    let zero = 0;
    for (const group of read("30D").body.groups as Body[]) {
      for (const entry of group.economic_partitions as Body[]) {
        const m = entry.metrics.portfolio_score;
        if (m.availability !== "AVAILABLE") { insufficient += 1; continue; }
        bands.add(bandOf(m.value));
        if (m.source_confidence === "PROVISIONAL") provisional += 1;
        if (m.value === "0") zero += 1;
      }
    }
    expect([...bands].sort()).toEqual(["fair", "good", "neutral", "very_good", "weak"].sort());
    expect(provisional).toBeGreaterThan(0);
    expect(insufficient).toBeGreaterThan(0);
    expect(zero).toBeGreaterThan(0);
  });

  it("a portfolio keeps the same case on another window and on its own 360 read", () => {
    const first = (window: string): Body => (read(window).body.groups as Body[]).map((group) => [group.key[0].value, group.economic_partitions[0].metrics.portfolio_score.availability]);
    expect(first("7D")).toEqual(first("90D"));
    const one = (read("30D").body.groups as Body[])[0]!;
    const own = ask(`/manager/portfolios/${one.key[0].value}/overview`, { group_by: "portfolio_id", limit: "1", window: JSON.stringify("30D") });
    expect(own.body.groups[0].economic_partitions[0].metrics.portfolio_score.value).toBe(one.economic_partitions[0].metrics.portfolio_score.value);
  });

  it("is deterministic: the same question twice is the same bytes", () => {
    expect(JSON.stringify(read("30D").body.groups)).toBe(JSON.stringify(read("30D").body.groups));
  });

  it("ALL is the window gap: every score key is a typed absence, never a number", () => {
    for (const group of read("ALL").body.groups as Body[]) {
      for (const entry of group.economic_partitions as Body[]) {
        for (const key of ["portfolio_score", "portfolio_score_p", "portfolio_score_r", "portfolio_score_b", "portfolio_score_evidence"]) {
          expect(entry.metrics[key]).toMatchObject({ value: null, availability: "UNAVAILABLE", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED", window: null });
        }
      }
    }
  });

  it("the unchanged production reader accepts the open keys and keeps a true zero a value", () => {
    const parsed = readManagerDataset(read("30D").body);
    expect(parsed?.kind).toBe("dataset");
    if (parsed?.kind !== "dataset") return;
    const scores = parsed.dataset.groups.flatMap((group) => group.economicPartitions.map((entry) => entry.metrics.get("portfolio_score")!));
    expect(scores.some((metric) => metric.kind === "value" && metric.exact === "0" && metric.zero)).toBe(true);
    expect(scores.some((metric) => metric.kind === "absent" && metric.reasonCode === "INSUFFICIENT_EVIDENCE")).toBe(true);
  });

  it("the score keys are not row metrics: rows and capital statements are untouched", () => {
    const body = read("30D").body;
    for (const row of body.items as Body[]) expect(Object.keys(row.metrics).some((key) => key.startsWith("portfolio_score"))).toBe(false);
    for (const statement of body.capital_statements as Body[]) expect(Object.keys(statement.metrics).some((key) => key.startsWith("portfolio_score"))).toBe(false);
  });
});

describe("raw alpha score under `score` on the groups by alpha_id", () => {
  it("is published per alpha group partition by the same rule and is never summed across alphas", () => {
    const result = ask("/manager/fleet", { group_by: "alpha_id", limit: "1", window: JSON.stringify("30D") });
    expect(result.status).toBe(200);
    const groups = result.body.groups as Body[];
    expect(groups.length).toBeGreaterThan(3);
    for (const group of groups) {
      for (const entry of group.economic_partitions as Body[]) {
        const metric = entry.metrics.score;
        expect(metric).toMatchObject({ unit: "SCORE", currency: null, policy_revision: "FIXTURE_LAB" });
        if (metric.availability === "AVAILABLE") expect(metric.value).toMatch(/^\d+(\.\d+)?$/);
        else expect(metric.reason_code).toBe("INSUFFICIENT_EVIDENCE");
      }
    }
    expect(readManagerDataset(result.body)?.kind).toBe("dataset");
  });
});
