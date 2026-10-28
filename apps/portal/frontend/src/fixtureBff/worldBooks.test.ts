// @vitest-environment node
/** WP-B2-C: books, marks, whole-account and drawdown are queries over the world; these are the ties. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { MARKS, WORLD_INCIDENTS, accountFact, bindingFact, toCents, netPnlSeries } from "../../e2e/bffWorld";
import { isRetired } from "../../e2e/bffWorldStage";
import {
  accountPositions, alphaDrawdownSeries, alphaWindow, drawdownOfLevels, incidentEnvironmentLabel, limitState, notionalCents, environmentFor, riskTierFor, openIncidentsOfPortfolio, partitionOfEntity, units4,
} from "../../e2e/bffWorldBooks";

let server: Server;
let base = "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = async (path: string): Promise<any> => (await fetch(`${base}${path}`)).json();

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "small" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

const account = async (id: string) => (await get(`/api/v1/execution/resources/accounts/${id}`)).data;

describe("account positions are quantity x the one world mark", () => {
  it.each(["acc_bnc_core", "acc_bnc_sat"])("%s", async (id) => {
    const data = await account(id);
    const rows = data.positions as { instrument_id: string; quantity: string; notional: string }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(MARKS[row.instrument_id]).toBeDefined();
      expect(toCents(row.notional)).toBe(notionalCents(row.instrument_id, row.quantity));
    }
    // and they are the world's own positions merged
    expect(rows.map((r) => r.notional).sort()).toEqual(accountPositions(id).map((p) => p.notional).sort());
  });
});

describe("retired deployments hold no positions", () => {
  it("Core positions are the sum of its non-retired deployments only", () => {
    const live = accountFact("acc_bnc_core")!.deployments.filter((d) => !isRetired(d.id)).map((d) => d.id);
    const retired = accountFact("acc_bnc_core")!.deployments.filter((d) => isRetired(d.id));
    expect(retired.length).toBeGreaterThan(0);
    expect(accountPositions("acc_bnc_core")).toEqual(accountPositions("acc_bnc_core", live));
    expect(accountPositions("acc_bnc_core", retired.map((d) => d.id))).toEqual([]);
  });
});

describe("whole account = the sum of the sleeves", () => {
  it("every sleeve page states the same whole-account margin, headroom and buying power", async () => {
    const core = await account("acc_bnc_core");
    const sat = await account("acc_bnc_sat");
    expect(sat.margin_balances).toEqual(core.margin_balances.map((m: object) => ({ ...m, account_id: "acc_bnc_sat" })));
    expect(sat.exposure_headroom).toEqual(core.exposure_headroom);
    expect(sat.broker_sync[0].buying_power).toBe(core.broker_sync[0].buying_power);
    const binding = bindingFact("bnc_main@BINANCE")!;
    const free = binding.sleeves.reduce((n, s) => n + s.free, 0n);
    expect(toCents(core.exposure_headroom[0].free)).toBe(free);
    expect(toCents(core.margin_balances[0].initial)).toBe(binding.locked);
  });
});

describe("drawdown is value / running max - 1", () => {
  it("<= 0, equals the definition, and never jumps up without a new high", () => {
    const levels = [100n, 90n, 95n, 110n, 99n, 120n].map((v) => v * 100n);
    const dd = drawdownOfLevels(levels);
    expect(dd.every((v) => v <= 0n)).toBe(true);
    expect(dd[3]).toBe(0n);
    expect(dd[4]).toBe(-10n * 1_000_000n); // 99/110 - 1 = -10%
  });
  it("an alpha window series stays <= 0 and recovers only to a new high", () => {
    const series = alphaDrawdownSeries("alpha_btc_trend", "live", 0, 86_400_000 * 14, 48);
    expect(series.length).toBe(48);
    let peak = 0n;
    for (const p of series) {
      const nav = toCents(p.nav);
      if (nav > peak) peak = nav;
      expect(Number(p.value)).toBeLessThanOrEqual(0);
      expect(Number(p.value)).toBeCloseTo(Number(nav - peak) / Number(peak) * 100, 3);
    }
  });
  it("one return per alpha-window: Carry A 980.40 + 140.40 on 40,000", () => {
    const w = alphaWindow("alpha_a", "live");
    expect(w.allocation).toBe(4_000_000n);
    expect(w.net).toBe(toCents("980.40") + toCents("140.40"));
    expect(Number(w.returnPct)).toBeCloseTo(Number(w.net) / Number(w.allocation) * 100, 4);
    expect(netPnlSeries("dep_live_01", 0, 1000, 5).at(-1)!.value).toBe("1120.80");
  });
});

describe("environment label and attention derive from the world", () => {
  it("Canary is a Sandbox portfolio, so its incident is not Real-funded", () => {
    expect(partitionOfEntity("PORTFOLIO", "pf_TEST_ONLY_canary")).not.toBeNull();
    const canary = WORLD_INCIDENTS.find((i) => i.id === "inc_TEST_ONLY_fx_mismatch")!;
    expect(incidentEnvironmentLabel(canary)).toBe(partitionOfEntity("PORTFOLIO", canary.target[1]));
  });
  it("an operation or incident states a partition its target has: Canary has only Sandbox", () => {
    expect(partitionOfEntity("PORTFOLIO", "pf_TEST_ONLY_canary")).toBe("Sandbox");
    expect(environmentFor("PORTFOLIO", "pf_TEST_ONLY_canary", "LIVE")).toBe("SANDBOX");
    expect(riskTierFor("SANDBOX", "R4_LIVE_RISK_INCREASING", "LIVE")).toBe("R2_SANDBOX");
    expect(environmentFor("PORTFOLIO", "pf_TEST_ONLY_core", "SANDBOX")).toBe("SANDBOX"); // Core does hold a sandbox book
    expect(environmentFor("ACCOUNT", "acc_TEST_ONLY_binance02", "PAPER")).toBe("PAPER"); // unknown to the world: declared stays
  });
  it("Core is flagged because the world has open incidents on it", () => {
    expect(openIncidentsOfPortfolio("pf_TEST_ONLY_core").map((i) => i.id)).toContain("inc_TEST_ONLY_fx_budget");
  });
  it("a limit at exactly 100% is at-limit, not breach", () => {
    expect(limitState(30_000n, 30_000n)).toBe("at-limit");
    expect(limitState(30_001n, 30_000n)).toBe("breach");
    expect(units4("0.9")).toBe(9_000n);
    expect(accountFact("acc_bnc_core")).not.toBeNull();
  });
});
