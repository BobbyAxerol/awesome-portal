// @vitest-environment node
/**
 * WP-F3 QA1 fix round (R5-02, R5-03, R5-04, R5-07): the lit stage bodies come from ONE lifecycle record per deployment and ONE book per
 * deployment, and every instant in them is an offset from one `now` constant. Asserted on the bodies the fixture server answers.
 */
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CANARY_PNL, STAGE_NOW_ISO, at, reached, stageOf, usedRatio } from "../../e2e/bffSimulatedStage";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";

type Obj = Record<string, any>;
let server: import("node:http").Server;
let raw: (path: string) => Promise<Obj>;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "medium", FIXTURE_REVIEW_PROFILE: "populated" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  raw = async (path) => (await fetch(`${origin}/api/v1/execution${path}`)).json() as Promise<Obj>;
}, 30_000);
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
});

/** Tenths of a unit, from a canonical decimal with at most one place. */
const tenths = (text: string): number => Math.round(Number(text) * 10);
const cents = (text: string): bigint => {
  const negative = text.startsWith("-");
  const [w, f = ""] = (negative ? text.slice(1) : text).split(".");
  const v = BigInt(w!) * 100n + BigInt((f + "00").slice(0, 2));
  return negative ? -v : v;
};

describe("R5-07 one lifecycle record per deployment", () => {
  it("the stage of a deployment is one answer, and a stage page exists only for a stage it has reached", () => {
    expect(stageOf("dep_canary_01", "live")).toBe("canary");
    expect(stageOf("dep_live_01_mismatch", "canary")).toBe("live");
    expect(reached("canary", "live")).toBe(false);
    expect(reached("live", "canary")).toBe(true);
    expect(reached("paper", "sandbox")).toBe(false);
    expect(stageOf("dep_unknown_9", "sandbox")).toBe("sandbox");
  });

  it("a deployment still in Canary answers NO lit Live page: the published dark body stands", async () => {
    const body = await raw("/deployments/dep_canary_01/live");
    expect(body.source_integration_state).toBe("UNAVAILABLE");
    expect((body.kpis as Obj[]).every((k) => k.value === null)).toBe(true);
  });

  it("a live deployment's own Canary page is typed (no source carries a finished trial of its own), and its Live page links the canary deployment it was promoted from", async () => {
    expect((await raw("/deployments/dep_live_01/canary")).source_integration_state).toBe("UNAVAILABLE");
    const live = await raw("/deployments/dep_live_01/live");
    const canaryLink = (live.lineage as Obj[]).find((l) => l.kind === "CANARY_ENVELOPE")!.href;
    expect(canaryLink).toBe("/deployments/live/dep_canary_01/canary");
    expect((await raw("/deployments/dep_canary_01/canary")).source_integration_state).toBe("SOURCE_BACKED");
  });

  it("a Paper-stage deployment has no lit Sandbox, Canary or Live page; a Sandbox one has no Canary or Live", async () => {
    for (const kind of ["certification", "canary", "live"]) expect((await raw(`/deployments/dep_paper_01/${kind}`)).source_integration_state).toBe("UNAVAILABLE");
    expect((await raw("/deployments/dep_sandbox_01/canary")).source_integration_state).toBe("UNAVAILABLE");
    expect((await raw("/deployments/dep_sandbox_01/certification")).source_integration_state).toBe("SOURCE_BACKED");
  });
});

describe("R5-04 numbers tie: one book per deployment", () => {
  it("Canary: gross notional is the sum of the positions at their marks, and Daily PnL is the series' last point minus the point 24 h earlier", async () => {
    const body = await raw("/deployments/dep_canary_01/canary");
    let gross = 0n;
    for (const row of body.positions.typed.rows as Obj[]) gross += (cents(row.quantity) * cents(row.mark)) / 100n;
    const kpi = (key: string) => (body.kpis as Obj[]).find((k) => k.key === key)!.value as string;
    expect(cents(kpi("gross_notional"))).toBe(gross);
    const points = body.series.points as Obj[];
    const last = points.at(-1)!;
    const dayBefore = points.find((p) => Date.parse(p.t) === Date.parse(last.t) - 86_400_000)!;
    expect(tenths(kpi("daily_pnl"))).toBe(tenths(last.value) - tenths(dayBefore.value));
    expect(CANARY_PNL).toHaveLength(32);
  });

  it("Live: the same two ties", async () => {
    const body = await raw("/deployments/dep_live_01/live");
    let gross = 0n;
    for (const row of body.positions.typed.rows as Obj[]) gross += (cents(row.quantity) * cents(row.mark)) / 100n;
    const kpi = (key: string) => (body.kpis as Obj[]).find((k) => k.key === key)!.value as string;
    expect(cents(kpi("gross_notional"))).toBe(gross);
    const points = body.series.points as Obj[];
    const last = points.at(-1)!;
    const dayBefore = points.find((p) => Date.parse(p.t) === Date.parse(last.t) - 86_400_000)!;
    expect(cents(kpi("daily_pnl"))).toBe(cents(last.value) - cents(dayBefore.value));
  });

  it("one percent precision: every used ratio has at most four places, so every readout is two", async () => {
    for (const id of ["dep_canary_01", "dep_canary_01_breach", "dep_canary_01_stale"]) {
      const body = await raw(`/deployments/${id}/canary`);
      for (const row of body.envelope_compliance.rows as Obj[]) {
        const ratio = row.used_ratio.value as string;
        expect((ratio.split(".")[1] ?? "").length, `${id} ${row.cap} ${ratio}`).toBeLessThanOrEqual(4);
        expect(ratio).toBe(usedRatio(row.consumed.value, row.approved));
      }
    }
  });
});

describe("R5-02 one now", () => {
  it("every offset helper is relative to the one constant, and no lit canary or live point is after it", async () => {
    expect(at(0)).toBe(STAGE_NOW_ISO);
    for (const path of ["/deployments/dep_canary_01/canary", "/deployments/dep_live_01/live"]) {
      const body = await raw(path);
      for (const point of body.series.points as Obj[]) expect(Date.parse(point.t)).toBeLessThanOrEqual(Date.parse(STAGE_NOW_ISO));
    }
  });

  it("a stale canary sends no point newer than its stale stamp", async () => {
    const body = await raw("/deployments/dep_canary_01_stale/canary");
    const broker = (body.source_panels as Obj[]).find((p) => p.panel_id === "broker")!;
    const stamp = Date.parse(broker.as_of);
    for (const point of body.series.points as Obj[]) expect(Date.parse(point.t)).toBeLessThanOrEqual(stamp);
  });

  it("halted is its own fixture: a halted runtime with a FRESH broker; stale is a stale broker with a RUNNING runtime", async () => {
    const halted = await raw("/deployments/dep_c1/canary");
    expect(halted.stage_facts.runtime.runtime_state.value).toBe("HALTED");
    expect((halted.source_panels as Obj[]).find((p) => p.panel_id === "broker")!.freshness_state).toBe("FRESH");
    const stale = await raw("/deployments/dep_canary_01_stale/canary");
    expect(stale.stage_facts.runtime.runtime_state.value).toBe("RUNNING");
    expect((stale.source_panels as Obj[]).find((p) => p.panel_id === "broker")!.freshness_state).toBe("STALE");
  });
});
