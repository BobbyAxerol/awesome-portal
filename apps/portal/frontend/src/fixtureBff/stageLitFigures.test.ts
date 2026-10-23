// @vitest-environment node
/**
 * WP-F3 (register 2f3): the lit stage bodies agree with themselves. Every figure the real source would derive (an unrealised amount, a
 * difference, a used ratio, the trial's review date) is asserted here in integer arithmetic on the body the fixture server answers, so a
 * simulated value can never contradict another simulated value. The broker side of a MISMATCH is asserted absent from the body itself.
 */
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { usedRatio } from "../../e2e/bffSimulatedStage";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";

type Obj = Record<string, any>;
const CANONICAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;

let server: import("node:http").Server;
let raw: (path: string) => Promise<unknown>;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "medium", FIXTURE_REVIEW_PROFILE: "populated" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  raw = async (path) => (await fetch(`${origin}/api/v1/execution${path}`)).json();
}, 30_000);

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
});

/** Six-place scaled integer of a canonical decimal. */
function micro(text: string): bigint {
  const negative = text.startsWith("-");
  const [whole, frac = ""] = (negative ? text.slice(1) : text).split(".");
  const value = BigInt(whole!) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
  return negative ? -value : value;
}

describe("the lit Live body agrees with itself", () => {
  it("each typed position's unrealised amount is (mark - entry) x quantity, signed by side, exactly", async () => {
    const body = (await raw("/deployments/dep_live_01/live")) as Obj;
    expect(body.positions.typed.rows).toHaveLength(4);
    for (const row of body.positions.typed.rows as Obj[]) {
      const move = micro(row.mark) - micro(row.entry);
      const signed = row.side === "long" ? move : -move;
      expect(micro(row.unrealised), row.symbol).toBe((signed * micro(row.quantity)) / 1_000_000n);
    }
  });

  it("every published decimal is canonical: no float, no trailing zero, no -0", async () => {
    const body = (await raw("/deployments/dep_live_01/live")) as Obj;
    for (const row of body.positions.typed.rows as Obj[]) for (const key of ["quantity", "entry", "mark", "unrealised"]) expect(row[key], `${row.symbol} ${key}`).toMatch(CANONICAL);
    for (const row of body.orders.typed.rows as Obj[]) for (const key of ["quantity", "price"]) expect(row[key], `${row.symbol} ${key}`).toMatch(CANONICAL);
    for (const point of body.series.points as Obj[]) expect(point.value).toMatch(CANONICAL);
    for (const figure of body.source_figures.figures as Obj[]) for (const side of ["internal", "broker", "difference"]) if (figure[side].value !== null) expect(figure[side].value).toMatch(CANONICAL);
  });

  it("each figure's difference is internal minus broker", async () => {
    const body = (await raw("/deployments/dep_live_01/live")) as Obj;
    for (const figure of body.source_figures.figures as Obj[]) {
      expect(micro(figure.difference.value), figure.key).toBe(micro(figure.internal.value) - micro(figure.broker.value));
    }
  });

  it("the series has 31 daily points, ends on the published net PnL and holds the design's high and low", async () => {
    const body = (await raw("/deployments/dep_live_01/live")) as Obj;
    const values = (body.series.points as Obj[]).map((p) => micro(p.value));
    expect(values).toHaveLength(31);
    expect(values.at(-1)).toBe(micro("4210.55"));
    expect(values.reduce((a, b) => (a > b ? a : b))).toBe(micro("7523.04"));
    expect(values.reduce((a, b) => (a < b ? a : b))).toBe(micro("-900.06"));
  });

  it("_mismatch: the broker side is never sent (the body itself withholds it, not only the screen)", async () => {
    const body = (await raw("/deployments/dep_live_01_mismatch/live")) as Obj;
    expect(body.broker_consistency).toMatchObject({ state: "MISMATCH", broker_values_visible: false });
    expect((body.kpis as Obj[]).find((k) => k.key === "broker_equity")!.value).toBeNull();
    for (const figure of body.source_figures.figures as Obj[]) {
      expect(figure.broker.availability).toBe("NOT_PUBLISHED");
      expect(figure.difference.availability).toBe("NOT_PUBLISHED");
      expect(figure.internal.availability).toBe("AVAILABLE");
    }
    expect(JSON.stringify(body)).not.toContain("60131.12");
  });
});

describe("the lit Canary body agrees with itself", () => {
  it("every cap row's used ratio is the server's consumed / approved at six places, and the verdict follows the rows", async () => {
    for (const [id, verdict] of [["dep_canary_01", "WITHIN_ENVELOPE"], ["dep_canary_01_breach", "BREACH"]] as const) {
      const body = (await raw(`/deployments/${id}/canary`)) as Obj;
      for (const row of body.envelope_compliance.rows as Obj[]) {
        expect(row.used_ratio.value, `${id} ${row.cap}`).toBe(usedRatio(row.consumed.value, row.approved));
        expect(row.consumed.value).toMatch(CANONICAL);
      }
      expect(body.envelope_compliance.verdict.state).toBe(verdict);
      const above = (body.envelope_compliance.rows as Obj[]).some((r) => micro(r.consumed.value) > micro(r.approved));
      expect(above).toBe(verdict === "BREACH");
    }
  });

  it("the trial's review date is the start plus the duration in days, and the day is inside the duration", async () => {
    const body = (await raw("/deployments/dep_canary_01/canary")) as Obj;
    const trial = body.lifecycle.trial;
    expect(Date.parse(trial.exit_review_opens_at.value)).toBe(Date.parse(trial.started_at.value) + trial.duration_days * 86_400_000);
    expect(body.lifecycle.day_index).toBeLessThanOrEqual(trial.duration_days);
  });

  it("a healthy canary's Internal and Broker agree; a stale broker panel says STALE", async () => {
    const healthy = (await raw("/deployments/dep_canary_01/canary")) as Obj;
    for (const figure of healthy.source_figures.figures as Obj[]) expect(figure.difference.value).toBe("0");
    const stale = (await raw("/deployments/dep_canary_01_stale/canary")) as Obj;
    const broker = (stale.source_panels as Obj[]).find((p) => p.panel_id === "broker")!;
    expect(broker).toMatchObject({ panel_state: "stale", freshness_state: "STALE" });
  });
});

describe("the lit Sandbox body", () => {
  it("publishes the design's reconciliation to the cent: equity -0.01, fees -0.01, positions and open orders agree", async () => {
    const body = (await raw("/deployments/dep_sandbox_01/certification")) as Obj;
    const by = Object.fromEntries((body.source_figures.figures as Obj[]).map((f) => [f.key, f]));
    expect(by.equity.difference.value).toBe("-0.01");
    expect(by.fees.difference.value).toBe("-0.01");
    expect(by.positions.difference.value).toBe("0");
    expect(by.open_orders.difference.value).toBe("0");
  });
});

describe("every lit stage body names its deployment's own alpha, portfolio and (Paper) strategy", () => {
  it("the five identity keys agree across the four reads of dep_*_01", async () => {
    const live = (await raw("/deployments/dep_live_01/live")) as Obj;
    const sandbox = (await raw("/deployments/dep_sandbox_01/certification")) as Obj;
    const paper = (await raw("/screens/paper/dep_paper_01")) as Obj;
    for (const who of [live.deployment, sandbox.certification, paper.data.deployment] as Obj[]) {
      expect(who).toMatchObject({ alpha_id: "alpha_a", alpha_name: "Carry A", portfolio_name: "Core", alpha_reason_code: null, portfolio_name_reason_code: null });
    }
    expect(paper.data.deployment.strategy_id).toBe("alpha_a");
  });
});
