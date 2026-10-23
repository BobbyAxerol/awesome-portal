// @vitest-environment node
/**
 * WP-F2 (FIXTURE_LAB, `e2e/bffSimulated.ts` generated bindings): on the populated lane every generated binding publishes list figures
 * through the bindings-list contract, so the capped per-row fallback is not the normal path. Dedicated cases stay: absent equity,
 * mixed currency, over physical, PARTIAL coverage, true zero and the fallback-only rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { answerExecutionBff, type BffDoubleOptions } from "../../../../../e2e/bffDouble";
import { fixtureScale, setFixtureScale } from "../../../../../e2e/bffScale";
import { readBindings } from "../../../api/profileRead";
import { checkOf, listFactsFromFigures, toBindingRow } from "./model";

const ON: BffDoubleOptions = { operationsV2: true, screensV2: true, simulated: true };
const read = (environment: string) =>
  readBindings(answerExecutionBff("GET", "/api/v1/execution/broker-bindings", new URLSearchParams({ environment, limit: "50" }), ON).body)!;

const before = fixtureScale();
beforeAll(() => setFixtureScale("medium"));
afterAll(() => setFixtureScale(before));

const cents = (text: string) => BigInt(text.replace(".", ""));

describe("generated list figures", () => {
  it("publishes figures for nearly every row of every environment; the fallback is the dedicated minority", () => {
    for (const environment of ["live", "paper", "sandbox"]) {
      const rows = read(environment).page.rows;
      const bare = rows.filter((row) => row.figures === undefined);
      expect(rows.length, environment).toBeGreaterThan(0);
      // okx_main (live) and the native paper/sandbox rows are fallback-only on purpose; generated rows: one in sixteen.
      expect(bare.length / rows.length, environment).toBeLessThanOrEqual(0.25);
    }
    const live = read("live").page.rows;
    expect(live.filter((row) => row.figures !== undefined).length).toBeGreaterThanOrEqual(40);
  });

  it("covers the dedicated cases on the live list", () => {
    const rows = read("live").page.rows;
    const facts = rows.map((row) => toBindingRow(row));
    expect(rows.some((row) => row.figures?.nativeEquity === null)).toBe(true); // absent equity
    expect(rows.some((row) => (row.figures?.virtualUsed?.length ?? 0) === 2)).toBe(true); // mixed currency
    expect(rows.some((row) => row.figures?.sleeveCount?.coverage === "PARTIAL")).toBe(true);
    const checks = facts.filter((f) => f.listFacts !== null).map((f) => checkOf(f.listFacts!.physical, f.listFacts!.virtual).kind);
    expect(checks).toContain("within");
    expect(checks).toContain("exceeded");
    expect(checks).toContain("unavailable");
  });

  it("headroom is native equity less used, exactly, in the same currency (no float, no cross-currency sum)", () => {
    for (const row of read("live").page.rows.filter((r) => r.bindingId.startsWith("bnd_"))) {
      const f = row.figures;
      if (!f || f.nativeEquity === null || f.nativeEquity === undefined) continue;
      const equity = f.nativeEquity[0]!;
      const used = f.virtualUsed!.find((e) => e.currency === equity.currency)!;
      const room = f.virtualHeadroom!.find((e) => e.currency === equity.currency)!;
      if (equity.currency === "BTC") continue;
      expect(cents(room.value)).toBe(cents(equity.value) - cents(used.value));
      expect(equity.value).toMatch(/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/);
    }
  });

  it("is stable: the same binding gets the same figures on every read", () => {
    expect(JSON.stringify(read("live").page.rows)).toBe(JSON.stringify(read("live").page.rows));
  });

  it("a published row prints in the list: listFacts exist and name the sleeves", () => {
    const row = read("live").page.rows.find((r) => r.bindingId.startsWith("bnd_") && r.figures !== undefined)!;
    const facts = listFactsFromFigures(row.figures!)!;
    expect(facts).not.toBeNull();
    expect(facts.sleeves).toBeGreaterThan(0);
  });

  it("counts still equal the served list lengths", () => {
    const live = read("live");
    expect(live.counts!.byEnvironment!.live).toBe(live.page.totalCount);
  });
});
