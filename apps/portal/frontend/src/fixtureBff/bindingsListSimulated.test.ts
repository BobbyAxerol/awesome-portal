// @vitest-environment node
/**
 * FE-CAT-4 on the fixture lane (FIXTURE_LAB, `e2e/bffSimulated.ts`): the populated profile's bindings list publishes list figures for
 * two bindings and per-environment counts; everything else is served exactly as before. Opt-in like every simulated overlay.
 */
import { describe, expect, it } from "vitest";

import { answerExecutionBff, type BffDoubleOptions } from "../../e2e/bffDouble";
import { readBindingExposure } from "../execution/analytics";
import { readBindings, readProfileEnvelope } from "../execution/api/profileRead";
import { credentialView, listFactsFromFigures, listRowFacts, stateView, toBindingRow } from "../execution/v2/screens/account/model";

const OFF: BffDoubleOptions = { operationsV2: true, screensV2: true };
const ON: BffDoubleOptions = { operationsV2: true, screensV2: true, simulated: true };
const ask = (path: string, options: BffDoubleOptions, query: Record<string, string> = {}) =>
  answerExecutionBff("GET", `/api/v1/execution${path}`, new URLSearchParams(query), options).body;
const list = (options: BffDoubleOptions, environment: string) => readBindings(ask("/broker-bindings", options, { environment }))!;

describe("opt-in", () => {
  it("off, the list carries no figures and no counts", () => {
    for (const environment of ["live", "paper", "sandbox"]) {
      const body = ask("/broker-bindings", OFF, { environment }) as Record<string, unknown>;
      expect(body.counts).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("figures");
    }
  });
});

describe("the populated profile's list figures", () => {
  const live = list(ON, "live");
  const row = (id: string) => live.page.rows.find((r) => r.bindingId === id)!;

  it("reads in the strict reader", () => {
    expect(live.page.rows.map((r) => r.bindingId)).toEqual(["bnc_main@BINANCE", "bnc_sub@BINANCE", "okx_main@OKX"]);
  });

  it("serves figures for two bindings only; the third stays on the capped fallback", () => {
    expect(row("bnc_main@BINANCE").figures).toBeDefined();
    expect(row("bnc_sub@BINANCE").figures).toBeDefined();
    expect(row("okx_main@OKX").figures).toBeUndefined();
    expect(toBindingRow(row("okx_main@OKX")).listFacts).toBeNull();
  });

  it("the unequal case: native equity 414,010.40 is the list's equity; the wallet balance (412,880.25) is not on the list", () => {
    const equity = row("bnc_main@BINANCE").figures!.nativeEquity!;
    expect(equity).toHaveLength(1);
    expect(equity[0]!.value).toBe("414010.40");
    expect(JSON.stringify(live.page.rows)).not.toContain("412880.25");
  });

  it("the absent case: the sub account reports a wallet balance but no native equity, so its equity is a typed null", () => {
    expect(row("bnc_sub@BINANCE").figures!.nativeEquity).toBeNull();
    expect(JSON.stringify(live.page.rows)).not.toContain("118050.00");
  });

  it("the mixed-currency case: one entry per currency, none summed", () => {
    const used = row("bnc_main@BINANCE").figures!.virtualUsed!;
    expect(used.map((entry) => [entry.currency, entry.value])).toEqual([["USDC", "10000.00"], ["USDT", "197500.00"]]);
  });

  it("agrees with what the two-read fallback derives for the same binding, in the figure's own currency", () => {
    const exposure = readBindingExposure(ask("/broker-bindings/bnc_main@BINANCE/exposure", ON))!;
    const account = readProfileEnvelope(ask("/resources/accounts/acc_bnc_core", ON))!;
    const fallback = listRowFacts(account, exposure);
    const published = listFactsFromFigures(row("bnc_main@BINANCE").figures!)!;
    const line = [published, ...(published.more ?? [])].find((l) => l.currency === fallback.currency)!;
    const full = (metric: unknown) => (metric as { decimal: { full: string } }).decimal.full;
    expect(full(line.physical)).toBe(full(fallback.physical));
    expect(full(line.virtual)).toBe(full(fallback.virtual));
    expect(full(line.headroom)).toBe(full(fallback.headroom));
    expect(published.sleeves).toBe(fallback.sleeves);
  });
});

describe("the published counts", () => {
  const lists = { live: list(ON, "live"), paper: list(ON, "paper"), sandbox: list(ON, "sandbox") };

  it("each environment's count is exactly what that environment's own list holds (nothing hidden, nothing added)", () => {
    const counts = lists.live.counts!;
    for (const environment of ["live", "paper", "sandbox"] as const) {
      expect(counts.byEnvironment[environment], environment).toBe(lists[environment].page.totalCount);
    }
  });

  it("all is their sum and issues counts the rows the Accounts list itself flags, over every environment", () => {
    const counts = lists.live.counts!;
    const every = [...lists.live.page.rows, ...lists.paper.page.rows, ...lists.sandbox.page.rows];
    expect(counts.all).toBe(every.length);
    expect(counts.issues).toBe(every.filter((r) => credentialView(r.credentialState).issue || stateView(r.state).issue).length);
    expect(counts.issues).toBeGreaterThan(0);
  });

  it("the same counts come with every environment's read", () => {
    expect(lists.paper.counts).toEqual(lists.live.counts);
    expect(lists.sandbox.counts).toEqual(lists.live.counts);
  });

  it("rows of the other environments carry no figures (they keep the fallback)", () => {
    expect([...lists.paper.page.rows, ...lists.sandbox.page.rows].every((r) => r.figures === undefined)).toBe(true);
  });
});
