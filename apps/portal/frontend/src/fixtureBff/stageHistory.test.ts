// @vitest-environment node
/**
 * WORLD (QA4 R2-03, R4-03, R5-02): an alpha has ONE stage history. A deployment in stage X has completed the stages before X: the Paper and Sandbox pages of an alpha that has
 * moved on show a COMPLETED record (gate met / approved, seven of seven, dated by the history), the page of the stage the alpha is in is in progress, and the dates are the history's.
 */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { lifecycleOf, stageRecord, worldAlphas } from "../../e2e/bffWorld";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const E = "/api/v1/execution";
let server: Server;
let base = "";
const get = async (path: string): Promise<Body> => (await fetch(`${base}${path}`)).json();

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

describe("one stage history per alpha", () => {
  it("the alpha's furthest stage is its current one; earlier stages are completed with a length, later ones have not begun", () => {
    for (const alpha of worldAlphas().slice(0, 12)) {
      const life = lifecycleOf(alpha.id);
      const order = ["paper", "sandbox", "canary", "live"] as const;
      const rank = order.indexOf(life.reached);
      order.forEach((stage, i) => {
        const record = stageRecord(alpha.id, stage);
        expect(record.status, `${alpha.id} ${stage}`).toBe(i < rank ? "completed" : i === rank ? "current" : "none");
        if (record.status === "completed") expect(record.toMs, `${alpha.id} ${stage}`).toBe(life[`${order[i + 1]}FromMs` as "liveFromMs"]);
      });
    }
  });

  it("Carry A is Live: its Paper and Sandbox pages are completed records, not an open gate or a failed step", async () => {
    const paper = await get(`${E}/screens/paper/dep_paper_01`);
    expect(paper.data.observation_gate.state).toBe("MET");
    expect(paper.data.observation_gate.observed_days).toBe(lifecycleOf("alpha_a").paperDays);
    expect(paper.data.observation_gate.observed_days).toBeGreaterThanOrEqual(paper.data.observation_gate.policy_minimum_observed_days);
    expect(paper.data.observation_gate.trade_count).toBeGreaterThanOrEqual(paper.data.observation_gate.policy_minimum_trade_count);
    expect(paper.data.stage_facts.sessions.rows[0].ended).not.toBeNull();
    const sandbox = await get(`${E}/deployments/dep_sandbox_01/certification`);
    expect(sandbox.certification.workflow_state).toBe("APPROVED");
    expect(sandbox.progress).toMatchObject({ passed_count: 7, total_count: 7, eligible: false, blocker_codes: ["SANDBOX_CERTIFICATION_ALREADY_DECIDED"] }); // WP-B2-S3 R4-03: a decided certification is closed, nothing is eligible to submit
    expect(sandbox.steps.every((step: Body) => step.strip_state === "DONE" && step.evaluation_state === "PASS")).toBe(true);
    expect(sandbox.findings.rows).toEqual([]);
    expect(Date.parse(sandbox.certification.decided_at)).toBe(stageRecord("alpha_a", "sandbox").toMs);
  });

  it("Grid D is in Sandbox: Paper is completed there, its Sandbox is in progress with no failed step and its Paper length is the history's", async () => {
    const paper = await get(`${E}/screens/paper/dep_d2`);
    expect(paper.data.observation_gate.state).toBe("MET");
    const sandbox = await get(`${E}/deployments/dep_d1/certification`);
    expect(sandbox.certification.workflow_state).not.toBe("APPROVED");
    expect(sandbox.steps.some((step: Body) => step.evaluation_state === "FAIL")).toBe(false);
    expect(sandbox.progress.passed_count).toBeLessThan(sandbox.progress.total_count);
    expect(Date.parse(sandbox.stage_facts.runtime.since.value)).toBe(stageRecord("alpha_d", "sandbox").fromMs);
  });
});
