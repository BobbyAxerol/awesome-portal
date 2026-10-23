// @vitest-environment node
/**
 * FE-CAT-4 · the strict `execution.bindings-list.v1` reader and the optional `figures` / `counts` it now reads. The bodies are the
 * published fixtures (L0 canonical and the synthetic figures fixture), parsed fresh per test and edited in memory only.
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../v2/testkit/loadCanonical";
import { listFactsFromFigures } from "../v2/screens/account/model";
import { readBindingItem, readBindings } from "./profileRead";

type Body = Record<string, any>;
const figures = (edit: (body: Body) => void = () => undefined): Body => {
  const body = loadCanonical<Body>("execution-bindings-list.figures.synthetic.valid.json");
  edit(body);
  return body;
};

describe("reading the published figures fixture", () => {
  const read = readBindings(figures())!;

  it("reads every row and keeps an omitted figures object omitted", () => {
    expect(read.page.rows.map((row) => row.bindingId)).toEqual(["bnc_main@BINANCE", "byb_noeq@BYBIT", "okx_mixed@OKX", "gate_legacy@GATE"]);
    expect(read.page.rows[3]!.figures).toBeUndefined();
    expect(Object.hasOwn(read.page.rows[3]!, "figures")).toBe(false);
  });

  it("keeps the decimal strings exactly as published (no float, no reformatting)", () => {
    const first = read.page.rows[0]!.figures!;
    expect(first.nativeEquity![0]).toEqual({ currency: "USDT", value: "412880.25", observedAt: "2026-10-23T09:59:58Z", coverage: "COMPLETE" });
    expect(first.virtualUsed![0]!.value).toBe("197500.00");
    expect(first.virtualHeadroom![0]!.value).toBe("215380.25");
  });

  it("keeps omitted, typed null and zero apart", () => {
    const noEquity = read.page.rows[1]!.figures!;
    expect(noEquity.nativeEquity).toBeNull();
    expect(noEquity.virtualHeadroom).toBeNull();
    expect(noEquity.sleeveCount).toEqual({ count: 0, observedAt: "2026-10-23T09:59:59Z", coverage: "COMPLETE" });
    const partial = readBindings(figures((b) => { delete b.page.rows[0].figures.sleeve_count; }))!;
    expect(Object.hasOwn(partial.page.rows[0]!.figures!, "sleeveCount")).toBe(false);
  });

  it("reads a mixed-currency figure as one entry per currency", () => {
    expect(read.page.rows[2]!.figures!.nativeEquity!.map((entry) => [entry.currency, entry.value])).toEqual([["USDC", "5000.10"], ["USDT", "7000.00"]]);
  });

  it("reads the counts: a number, a typed null and a counted zero", () => {
    expect(read.counts).toEqual({ observedAt: "2026-10-23T10:00:00Z", coverage: "COMPLETE", all: 7, issues: 3, byEnvironment: { paper: 4, sandbox: 2, live: 1 } });
    const body = readBindings(figures((b) => { b.counts.all = null; b.counts.by_environment.live = null; b.counts.by_environment.sandbox = 0; }))!;
    expect(body.counts!.all).toBeNull();
    expect(body.counts!.byEnvironment).toEqual({ paper: 4, sandbox: 0, live: null });
  });

  it("reads the L0 canonical fixture with no figures and no counts", () => {
    const l0 = readBindings(loadCanonical("execution-bindings-list"))!;
    expect(l0.counts).toBeUndefined();
    expect(l0.page.rows.every((row) => row.figures === undefined)).toBe(true);
  });

  it("does not promote a key outside the four published figures (a wallet balance, say)", () => {
    const body = readBindings(figures((b) => { b.page.rows[0].figures.wallet_balance = [{ currency: "USDT", value: "1.00", observed_at: "2026-10-23T09:59:58Z", coverage: "COMPLETE" }]; }))!;
    expect(Object.keys(body.page.rows[0]!.figures!).sort()).toEqual(["nativeEquity", "sleeveCount", "virtualHeadroom", "virtualUsed"]);
  });
});

describe("rejecting malformed figures and counts", () => {
  const rejected = (edit: (body: Body) => void) => readBindings(figures(edit)) === null;
  const f = (b: Body) => b.page.rows[0].figures;

  it("rejects a value that is not an exact decimal string", () => {
    for (const value of [412880.25, "4.1e5", "1,000.5", "", " 1", "NaN", "-0", "0x10", "01.5", null]) {
      expect(rejected((b) => { f(b).native_equity[0].value = value; }), String(value)).toBe(true);
    }
  });

  it("rejects an entry missing its currency, instant or coverage, or with an unknown coverage word", () => {
    expect(rejected((b) => { delete f(b).native_equity[0].currency; })).toBe(true);
    expect(rejected((b) => { delete f(b).native_equity[0].observed_at; })).toBe(true);
    expect(rejected((b) => { f(b).native_equity[0].observed_at = "yesterday"; })).toBe(true);
    expect(rejected((b) => { delete f(b).native_equity[0].coverage; })).toBe(true);
    expect(rejected((b) => { f(b).native_equity[0].coverage = "FULL"; })).toBe(true);
  });

  it("rejects an empty list, a non-list and two entries for one currency (ambiguous, never merged)", () => {
    expect(rejected((b) => { f(b).native_equity = []; })).toBe(true);
    expect(rejected((b) => { f(b).native_equity = "412880.25"; })).toBe(true);
    expect(rejected((b) => { f(b).native_equity.push({ ...f(b).native_equity[0], value: "1.00" }); })).toBe(true);
  });

  it("rejects a sleeve count that is not a non-negative integer, and non-object figures", () => {
    for (const count of [-1, 1.5, "3", null]) expect(rejected((b) => { f(b).sleeve_count.count = count; }), String(count)).toBe(true);
    expect(rejected((b) => { b.page.rows[0].figures = []; })).toBe(true);
    expect(rejected((b) => { b.page.rows[0].figures = null; })).toBe(true);
  });

  it("rejects counts that are negative, fractional, the wrong basis or have no observation instant", () => {
    expect(rejected((b) => { b.counts.all = -1; })).toBe(true);
    expect(rejected((b) => { b.counts.issues = 1.5; })).toBe(true);
    expect(rejected((b) => { b.counts.by_environment.paper = "4"; })).toBe(true);
    expect(rejected((b) => { b.counts.basis = "LOADED_ROWS"; })).toBe(true);
    expect(rejected((b) => { delete b.counts.observed_at; })).toBe(true);
    expect(rejected((b) => { b.counts = null; })).toBe(true);
  });

  it("ignores an environment key it does not know in the counts", () => {
    const body = readBindings(figures((b) => { b.counts.by_environment.archived = 9; }))!;
    expect(body.counts!.byEnvironment).toEqual({ paper: 4, sandbox: 2, live: 1 });
  });

  it("the detail item reads the same figures", () => {
    const item = readBindingItem(figures().page.rows[0])!;
    expect(item.figures!.sleeveCount!.count).toBe(3);
  });
});

describe("a row's facts from the figures", () => {
  const rows = readBindings(figures())!.page.rows;
  const exact = (metric: unknown) => (metric as { kind?: string } | null | undefined)?.kind === "value" ? (metric as { decimal: { full: string } }).decimal.full : null;

  it("an unequal wallet balance and native equity: the row carries equity only (the wallet is not a list figure)", () => {
    const facts = listFactsFromFigures(rows[0]!.figures!)!;
    expect(exact(facts.physical)).toBe("412880.25");
    expect(facts.currency).toBe("USDT");
    expect(facts.sleeves).toBe(3);
    expect(JSON.stringify(facts)).not.toContain("wallet");
  });

  it("an absent equity stays a typed absence, with the virtual figures still in their own currency", () => {
    const facts = listFactsFromFigures(rows[1]!.figures!)!;
    expect(facts.physical).toMatchObject({ kind: "absent" });
    expect(exact(facts.virtual)).toBe("1200.50");
    expect(facts.headroom).toMatchObject({ kind: "absent" });
    expect(facts.sleeves).toBe(0);
  });

  it("a mixed-currency row is one line per currency; no line holds another currency's amount", () => {
    const facts = listFactsFromFigures(rows[2]!.figures!)!;
    const lines = [facts, ...(facts.more ?? [])];
    expect(lines.map((line) => line.currency)).toEqual(["USDC", "USDT"]);
    expect(lines.map((line) => exact(line.physical))).toEqual(["5000.10", "7000.00"]);
    expect(lines.map((line) => exact(line.virtual))).toEqual([null, "2500.00"]);
    expect(lines[0]!.virtual).toBeUndefined();
    expect(lines[0]!.physicalWhy).toBeUndefined();
  });

  it("a figures object missing any of the four keys is no row facts at all (the row is read per row)", () => {
    for (const key of ["native_equity", "virtual_used", "virtual_headroom", "sleeve_count"]) {
      const body = readBindings(figures((b) => { delete b.page.rows[0].figures[key]; }))!;
      expect(listFactsFromFigures(body.page.rows[0]!.figures!), key).toBeNull();
    }
  });
});
