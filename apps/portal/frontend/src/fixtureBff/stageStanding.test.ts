// @vitest-environment node
/**
 * WORLD (UXM-07 step B, WP-B2-S; QA5 R2-01, R2-02, R3-02 lineage side, R4-01, R4-02, R5-02, R5-03): a deployment id has exactly ONE stage and ONE stage history. A stage page of a stage
 * the alpha has LEFT is a completed record (stopped, exit date, final figures, nothing open); the current stage is current; the pages, the Deployments tab and the Alpha 360 lifecycle
 * all read the history of bffWorldStage.ts / bffWorld.lifecycleOf.
 */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { lifecycleOf, NATIVE_ALPHAS } from "../../e2e/bffWorld";
import { PAPER_POLICY_MIN_TRADES, resolveStageDeployment, sandboxRecordIdOf, stageHistoryOf, standingOf, userIdOf } from "../../e2e/bffWorldStage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const E = "/api/v1/execution";
const ORDER = ["paper", "sandbox", "canary", "live"] as const;
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

const runtimeOf = (facts: Body): string => facts.runtime.runtime_state.value;
const sinceOf = (facts: Body): number => Date.parse(facts.runtime.since.value);

describe("one stage per deployment id, one history per alpha", () => {
  it("every deployment id belongs to one alpha and one stage; it is completed exactly when the alpha's furthest stage is later, and its exit is the day the next stage began", () => {
    const seen = new Set<string>();
    for (const alpha of NATIVE_ALPHAS) {
      const life = lifecycleOf(alpha.id);
      for (const d of alpha.deployments) {
        expect(seen.has(d.id), d.id).toBe(false);
        seen.add(d.id);
        const standing = standingOf(d.id)!;
        const rank = ORDER.indexOf(standing.stage);
        const completed = rank < ORDER.indexOf(life.reached);
        expect(standing.status, d.id).toBe(completed ? "completed" : "current");
        if (completed) expect(standing.exitMs, d.id).toBe(life[`${ORDER[rank + 1]}FromMs` as "liveFromMs"]);
        else expect(standing.exitMs, d.id).toBeNull();
      }
    }
    // the named blockers: Carry A's Paper and Sandbox, Basis B's Canary are over; the live deployments and Grid D's Sandbox are current
    for (const id of ["dep_paper_01", "dep_sandbox_01", "dep_canary_01", "dep_d2"]) expect(standingOf(id)!.status, id).toBe("completed");
    for (const id of ["dep_live_01", "dep_b1", "dep_b2", "dep_d1", "dep_c1"]) expect(standingOf(id)!.status, id).toBe("current");
  });

  it("an alpha's sandbox record is its own sandbox deployment, else a history record of the stage it left; a deployment that never left Sandbox has none", () => {
    expect(sandboxRecordIdOf("dep_live_01")).toBe("dep_sandbox_01");
    expect(sandboxRecordIdOf("dep_b1")).toBe("dep_b_sandbox_hist");
    expect(sandboxRecordIdOf("dep_canary_01")).toBe("dep_b_sandbox_hist");
    expect(sandboxRecordIdOf("dep_paper_01")).toBeNull();
    const record = resolveStageDeployment("dep_b_sandbox_hist")!;
    expect(record.standing).toMatchObject({ stage: "sandbox", status: "completed", alphaId: "alpha_b", history: true });
    expect(record.standing.exitMs).toBe(stageHistoryOf("alpha_b").stages.sandbox.toMs);
    // an alpha that owns a sandbox deployment has no second record of the stage
    expect(resolveStageDeployment("dep_a_sandbox_hist")).toBeNull();
  });
});

describe("R2-01 / R4-01: Carry A (Live) - its Paper and Sandbox are over on every screen", () => {
  it("the Deployments tab says ENDED for Paper and Sandbox and ACTIVE for Live, with no exposure on the ended ones (R2-01)", async () => {
    const alpha = (await get(`${E}/resources/alphas/alpha_a`)).data.alpha;
    const state = Object.fromEntries(alpha.deployments.map((d: Body) => [d.deployment_id, d]));
    expect(state.dep_paper_01).toMatchObject({ state: "ENDED", active: false, exposure: "0.00" });
    expect(state.dep_sandbox_01).toMatchObject({ state: "ENDED", active: false, exposure: "0.00" });
    expect(state.dep_live_01).toMatchObject({ state: "ACTIVE", active: true });
    expect(alpha.stage).toBe("LIVE");
    const rows = (await get(`${E}/resources/alphas/alpha_a`)).data.deployments;
    for (const row of rows) expect(row.state, row.deployment_id).toBe(state[row.deployment_id].state);
  });

  it("the Paper page is a completed record: stopped on the lifecycle's exit date, nothing dated after it, final figures, one count of trades (R4-02)", async () => {
    const standing = standingOf("dep_paper_01")!;
    const page = await get(`${E}/screens/paper/dep_paper_01`);
    const data = page.data;
    const exit = standing.exitMs!;
    expect(runtimeOf(data.stage_facts)).toBe("STOPPED");
    expect(sinceOf(data.stage_facts)).toBe(exit);
    expect(data.stage_facts.sessions.rows).toHaveLength(1);
    expect(Date.parse(data.stage_facts.sessions.rows[0].ended)).toBe(exit);
    expect(data.stage_facts.sessions.rows[0].state).toBe("COMPLETED");
    expect(data.deployment.active).toBe(false);
    expect(Date.parse(page.as_of)).toBe(exit);
    // nothing after the exit: orders, fills, equity points
    for (const o of data.orders) expect(Date.parse(o.submitted_at), o.order_id).toBeLessThanOrEqual(exit);
    for (const f of data.fills) expect(Date.parse(f.trade_time), f.fill_id).toBeLessThanOrEqual(exit);
    for (const p of data.account_equity) expect(Date.parse(p.ts)).toBeLessThanOrEqual(exit);
    expect(Date.parse(data.account_equity.at(-1).ts)).toBe(exit);
    // no working order after the stage ended, no open position
    expect(data.orders.every((o: Body) => ["FILLED", "REJECTED", "CANCELED", "EXPIRED"].includes(o.status))).toBe(true);
    expect(data.positions).toEqual([]);
    // one count: the gate's trades are the fills listed, the quality derivation counts the same book, and the gate is met by that count
    const gate = data.observation_gate;
    expect(gate.policy_minimum_trade_count).toBe(PAPER_POLICY_MIN_TRADES);
    expect(gate.trade_count).toBe(data.fills.length);
    expect(gate.trade_count).toBeGreaterThanOrEqual(gate.policy_minimum_trade_count);
    expect(gate.observed_days).toBe(standing.days);
    expect(gate.state).toBe("MET");
    const quality = (await get(`${E}/derivations/deployments/dep_paper_01/execution-quality?environment=paper`)).data;
    expect(Number(quality.fill_population)).toBe(data.fills.length);
    expect(Number(quality.order_population)).toBe(data.orders.length);
    expect(Number(quality.execution_session_population)).toBe(data.stage_facts.sessions.rows.length);
    // the stage length, the exit and the session start are the Alpha 360 spine's
    const metrics = (await get(`${E}/manager/alphas/alpha_a/overview?environment=live`)).items[0].economic_partitions[0].metrics;
    expect(Number(metrics.life_paper_exit_ms.value)).toBe(exit);
    expect(Number(metrics.life_paper_days.value)).toBe(standing.days);
    expect(Date.parse(data.stage_facts.sessions.rows[0].started)).toBe(standing.fromMs);
    expect(metrics.life_paper_exit_ms.reason_code).toBe(standing.decidedBy);
  });

  it("the Sandbox page is a completed record: approved on the exit date by the lifecycle's decider, stopped, nothing open (R2-01)", async () => {
    const standing = standingOf("dep_sandbox_01")!;
    const page = await get(`${E}/deployments/dep_sandbox_01/certification`);
    expect(page.certification.workflow_state).toBe("APPROVED");
    expect(Date.parse(page.certification.decided_at)).toBe(standing.exitMs);
    expect(page.certification.decided_by_user_id).toBe(userIdOf(standing.decidedBy!));
    expect(page.timeline.rows.at(-1)).toMatchObject({ action: "APPROVE", actor_user_id: standing.decidedBy });
    expect(runtimeOf(page.stage_facts)).toBe("STOPPED");
    expect(sinceOf(page.stage_facts)).toBe(standing.exitMs);
    expect(page.promotion_plans).toEqual([]);
    expect(page.findings.rows).toEqual([]);
    const metrics = (await get(`${E}/manager/alphas/alpha_a/overview?environment=live`)).items[0].economic_partitions[0].metrics;
    expect(Number(metrics.life_sandbox_exit_ms.value)).toBe(standing.exitMs);
    expect(metrics.life_sandbox_exit_ms.reason_code).toBe(standing.decidedBy);
  });

  it("the lifecycle deciders of every gate are the stage history's (R3-02, lineage side)", async () => {
    const history = stageHistoryOf("alpha_a");
    const metrics = (await get(`${E}/manager/alphas/alpha_a/overview?environment=live`)).items[0].economic_partitions[0].metrics;
    expect(metrics.life_r1_exit_ms.reason_code).toBe(history.r1.by);
    expect(Number(metrics.life_r1_exit_ms.value)).toBe(history.r1.atMs);
    expect(metrics.life_r2_exit_ms.reason_code).toBe(history.r2.by);
    expect(Number(metrics.life_r2_exit_ms.value)).toBe(history.r2.atMs);
    expect(metrics.life_canary_exit_ms.reason_code).toBe(history.stages.canary.decidedBy);
    // R1 comes before R2 comes before Paper began: an alpha that is Live has no gate request open, only decided ones
    expect(history.r1.atMs).toBeLessThan(history.r2.atMs);
    expect(history.r2.atMs).toBeLessThan(history.stages.paper.fromMs);
  });

  it("the Live page of Carry A links the sandbox record of its own alpha (dep_sandbox_01), which is Sandbox and over (R5-03)", async () => {
    const live = await get(`${E}/deployments/dep_live_01/live`);
    const link = live.lineage.find((item: Body) => item.kind === "SANDBOX_EXIT");
    expect(link.href).toBe("/deployments/sandbox/dep_sandbox_01");
    expect(standingOf("dep_sandbox_01")!.stage).toBe("sandbox");
  });
});

describe("R2-02 / R5-02 / R5-03: Basis B (Live) - its Canary is a finished trial, its sandbox record is its own", () => {
  it("the Canary room is a finished trial: started and exit review on the lifecycle's dates, stopped at the exit, nothing open (R5-02)", async () => {
    const standing = standingOf("dep_canary_01")!;
    const life = lifecycleOf("alpha_b");
    expect(standing).toMatchObject({ stage: "canary", status: "completed", fromMs: life.canaryFromMs, exitMs: life.liveFromMs, days: life.canaryDays });
    const page = await get(`${E}/deployments/dep_canary_01/canary`);
    expect(Date.parse(page.lifecycle.trial.started_at.value)).toBe(life.canaryFromMs);
    expect(Date.parse(page.lifecycle.trial.exit_review_opens_at.value)).toBe(life.liveFromMs);
    expect(page.lifecycle.day_index).toBe(life.canaryDays);
    expect(page.lifecycle.trial.duration_days).toBe(life.canaryDays);
    expect(page.lifecycle.duration_days).toBe(life.canaryDays);
    expect(runtimeOf(page.stage_facts)).toBe("STOPPED");
    expect(sinceOf(page.stage_facts)).toBe(life.liveFromMs);
    expect(page.stage_facts.sessions.rows[0].state).toBe("COMPLETED");
    const gross = page.kpis.find((k: Body) => k.key === "gross_notional");
    expect(gross.value).toBe("0.00");
    // the Alpha 360 spine: Canary lasted `canaryDays` and was exited on the day Live began
    const metrics = (await get(`${E}/manager/alphas/alpha_b/overview?environment=live`)).items[0].economic_partitions[0].metrics;
    expect(Number(metrics.life_canary_exit_ms.value)).toBe(life.liveFromMs);
    expect(Number(metrics.life_canary_days.value)).toBe(life.canaryDays);
  });

  it("the Deployments tab of Basis B: Live ACTIVE, the Canary ENDED with no exposure (R2-02)", async () => {
    const alpha = (await get(`${E}/resources/alphas/alpha_b`)).data.alpha;
    const state = Object.fromEntries(alpha.deployments.map((d: Body) => [d.deployment_id, d]));
    expect(state.dep_canary_01).toMatchObject({ state: "ENDED", active: false, exposure: "0.00" });
    expect(state.dep_b1.state).toBe("ACTIVE");
    expect(state.dep_b2.state).toBe("ACTIVE");
  });

  it("the Canary room and the Live page link a sandbox record that is not their own id and is Sandbox, over, approved on the day Canary began (R5-03)", async () => {
    const life = lifecycleOf("alpha_b");
    for (const [room, path] of [["dep_canary_01", "canary"], ["dep_b1", "live"]] as const) {
      const page = await get(`${E}/deployments/${room}/${path}`);
      const link = page.lineage.find((item: Body) => item.kind === "SANDBOX_EXIT");
      const record = decodeURIComponent(String(link.href).replace("/deployments/sandbox/", ""));
      expect(record, room).not.toBe(room);
      expect(standingOf(record)).toMatchObject({ stage: "sandbox", status: "completed" });
      const cert = await get(`${E}/deployments/${record}/certification`);
      expect(cert.certification).toMatchObject({ deployment_id: record, alpha_id: "alpha_b", alpha_name: "Basis B", workflow_state: "APPROVED", alpha_reason_code: null });
      expect(Date.parse(cert.certification.decided_at)).toBe(life.canaryFromMs);
      expect(runtimeOf(cert.stage_facts)).toBe("STOPPED");
      expect(cert.progress).toMatchObject({ passed_count: 7, total_count: 7 });
      expect(cert.promotion_plans).toEqual([]);
      // its figures are its own, not the real-funded canary's
      const figures = (page: Body): Body[] => (Array.isArray(page.source_figures) ? page.source_figures : page.source_figures.figures);
      const equity = figures(cert).find((f: Body) => f.key === "equity").internal.value;
      expect(equity).not.toBe(figures(await get(`${E}/deployments/dep_canary_01/canary`)).find((f: Body) => f.key === "equity").internal.value);
    }
  });

  it("a stage page that is not the deployment's stage is typed absence of THAT deployment, never a second stage for the same id", async () => {
    const cert = await get(`${E}/deployments/dep_canary_01/certification`);
    expect(cert.certification.workflow_state).not.toBe("APPROVED");
    expect(cert.certification.alpha_id).toBe("alpha_b");
    expect(cert.certification.account_binding.account_id).toBe("acc_bnc_core");
    expect(runtimeOf(cert.stage_facts)).not.toBe("STOPPED");
  });
});

describe("current stages stay current", () => {
  it("Grid D's Sandbox and Basis B's Live are running since their stage began; Momentum C's Canary is a trial in progress", async () => {
    const sandbox = await get(`${E}/deployments/dep_d1/certification`);
    expect(runtimeOf(sandbox.stage_facts)).toBe("RUNNING");
    expect(sinceOf(sandbox.stage_facts)).toBe(standingOf("dep_d1")!.fromMs);
    const live = await get(`${E}/deployments/dep_b1/live`);
    expect(runtimeOf(live.stage_facts)).toBe("RUNNING");
    expect(sinceOf(live.stage_facts)).toBe(lifecycleOf("alpha_b").liveFromMs);
    const canary = await get(`${E}/deployments/dep_c1/canary`);
    expect(Date.parse(canary.lifecycle.trial.started_at.value)).toBe(standingOf("dep_c1")!.fromMs);
    expect(canary.lifecycle.trial.duration_days).toBe(14);
  });
});
