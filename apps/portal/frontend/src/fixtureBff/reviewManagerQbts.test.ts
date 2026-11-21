// @vitest-environment node
/**
 * Alpha Fleet on the explicit SYNTHETIC review lane (FIXTURE_LAB): the simulated QBTS (guide M03 8.1, spec 5.8). The closed row key `score`
 * carries q = 0.45 P + 0.30 R + 0.25 B (integer tenths, exact); P, R, B, band, evidence and the provisional flag sit in the OPEN partition
 * map; the layout-stress profile serves none (size bound); a group never carries a score; every body is schema-valid and is read by the
 * production reader.
 */
import "./useMissingScenario";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { answerReviewManager, type ReviewManagerProfile } from "../../../fixture-bff/review-manager";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { readManagerDataset } from "../execution/v2/readers/managerDataset";
import { qbtsOf } from "../execution/v2/screens/fleet/fleetMetricsModel";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const ask = (extra: Record<string, string> = {}, profile: ReviewManagerProfile = "populated", environment = "live"): { status: number; body: Body } => {
  setFixtureScale(profile === "layout-stress" ? "large" : "medium");
  setFixtureNow("2026-10-22T12:00:00Z");
  return answerReviewManager("GET", "/manager/fleet", new URLSearchParams({ environment, limit: "200", ...extra }), profile) as { status: number; body: Body };
};
afterEach(() => { setFixtureScale("small"); setFixtureNow("2026-08-22T13:00:00Z"); });
afterAll(() => disposeSchemaCheck());

const tenths = (text: string): bigint => BigInt(text.includes(".") ? text.replace(".", "") : `${text}0`);
const BANDS = [["weak", 40_000n], ["neutral", 60_000n], ["fair", 75_000n], ["good", 90_000n], ["very_good", 1_000_000n]] as const;

describe("the simulated QBTS on the populated profile", () => {
  it("is schema-valid and offers score as a metric key and a sort field", () => {
    const { status, body } = ask();
    expect(status).toBe(200);
    expect(violationsOf({ file: "execution-manager-dataset.v1", ptr: "" }, body).violations).toEqual([]);
    expect(body.query_options.metric_keys).toContain("score");
    expect(body.query_options.sort_fields).toContain("score");
    expect(body.query_options.economic_partition_required_for).not.toContain("score");
  });

  it("q is exactly 0.45 P + 0.30 R + 0.25 B in integer arithmetic, and the band is the policy band of the UNROUNDED value", () => {
    const { body } = ask();
    let checked = 0;
    for (const row of body.items) {
      const m = row.economic_partitions[0].metrics;
      if (m.score.availability !== "AVAILABLE") continue;
      const thousandths = 45n * tenths(m.qbts_p.value) + 30n * tenths(m.qbts_r.value) + 25n * tenths(m.qbts_b.value);
      const [whole, fraction = ""] = m.score.value.split(".");
      expect(BigInt(whole + fraction.padEnd(3, "0")), row.row_key).toBe(thousandths);
      const band = BANDS.find(([, below]) => thousandths < below)![0];
      expect(m.qbts_band.reason_code, row.row_key).toBe(band);
      expect(row.metrics.score).toEqual(m.score);
      expect(m.score.policy_revision).toBe("FIXTURE_LAB");
      checked += 1;
    }
    expect(checked).toBeGreaterThan(3);
  });

  it("has variety: every band, a provisional score, a true zero and an insufficient-evidence typed absence", () => {
    const seen = new Set<string>();
    let provisional = 0; let zero = 0; let absent = 0;
    for (const environment of ["live", "paper", "sandbox"]) {
      for (const row of ask({}, "populated", environment).body.items) {
        const m = row.economic_partitions[0].metrics;
        if (m.score.availability !== "AVAILABLE") {
          absent += 1;
          expect(m.score.value).toBeNull();
          expect(m.score.reason_code).toBe("INSUFFICIENT_EVIDENCE");
          expect(m.qbts_evidence.reason_code).toBe("insufficient");
          expect(m.qbts_band.availability).toBe("UNAVAILABLE");
          continue;
        }
        seen.add(m.qbts_band.reason_code);
        if (m.qbts_evidence.reason_code === "provisional") { provisional += 1; expect(m.qbts_provisional.value).toBe("1"); }
        if (m.score.value === "0") zero += 1;
      }
    }
    expect(provisional).toBeGreaterThan(0);
    expect(absent).toBeGreaterThan(0);
    expect(zero + seen.size).toBeGreaterThan(1);
    expect([...seen].every((band) => BANDS.some(([code]) => code === band))).toBe(true);
  });

  it("is read by the production reader as published, and a score never reaches a group or a statement", () => {
    const { body } = ask({ group_by: "health" });
    const read = readManagerDataset(body);
    if (read === null || read.kind !== "dataset") throw new Error("unreadable");
    const views = read.dataset.items.map((row) => qbtsOf(row));
    expect(views.every((view) => view !== null)).toBe(true);
    expect(views.some((view) => view!.kind === "value" && view!.band !== null && view!.p !== null)).toBe(true);
    for (const group of body.groups) for (const part of group.economic_partitions) {
      for (const key of Object.keys(part.metrics)) expect(key === "score" || key.startsWith("qbts_"), key).toBe(false);
    }
    for (const statement of body.capital_statements) expect(Object.keys(statement.metrics).some((key) => key === "score" || key.startsWith("qbts_"))).toBe(false);
  });

  it("the layout-stress profile serves no QBTS (its responses sit near the size bound) and is still schema-valid", () => {
    const { status, body } = ask({}, "layout-stress");
    expect(status).toBe(200);
    expect(body.query_options.metric_keys).not.toContain("score");
    expect(body.items.every((row: Body) => !("score" in row.metrics))).toBe(true);
  });
});
