import { describe, expect, it } from "vitest";

import { applyTab, resolveTab, type TabSurface } from "./tabAliases";

type Row = [surface: TabSurface, label: string, tab: string, hash: string | null, params: Record<string, string>];

// Every row of review2/07 s2.
const ROWS: Row[] = [
  ["alpha", "Overview", "performance", null, {}],
  ["alpha", "Insight Charts", "performance", "charts", {}],
  ["alpha", "Trade Replay", "replay", null, {}],
  ["alpha", "Positions", "positions", null, {}],
  ["alpha", "Orders & Fills", "orders", null, {}],
  ["alpha", "Risk", "positions", "risk", {}],
  ["alpha", "Sessions", "activity", null, { type: "session" }],
  ["alpha", "Accounting", "performance", "costs", {}],
  ["alpha", "Reconciliation", "reconciliation", null, {}],
  ["alpha", "Audit", "activity", null, { type: "audit" }],
  ["portfolio", "Overview", "overview", null, {}],
  ["portfolio", "Structure & Correlation", "risk", null, {}],
  ["portfolio", "Capital Ledger", "allocations", "ledger", {}],
  ["portfolio", "Approvals", "approvals", null, {}],
  ["portfolio", "Incidents", "incidents", null, {}],
  ["portfolio", "Audit", "people", null, { type: "audit" }],
  ["paper", "Overview", "overview", null, {}],
  ["paper", "Positions", "positions", null, {}],
  ["paper", "Orders", "orders", null, {}],
  ["paper", "Fills", "fills", null, {}],
  ["paper", "Sessions", "sessions", null, {}],
  ["paper", "Accounting", "overview", "accounting", {}],
  ["paper", "Evidence", "overview", "evidence", {}],
];

describe("resolveTab", () => {
  it.each(ROWS)("%s: %s", (surface, label, tab, hash, params) => {
    const { target, notice } = resolveTab(surface, label);
    expect(target).toEqual({ tab, hash, params });
    expect(notice).toBeNull();
  });

  it.each([
    ["Insight+Charts", "performance"],
    ["insight%20charts", "performance"],
    ["INSIGHT   CHARTS", "performance"],
    ["Orders+%26+Fills", "orders"],
    ["orders%20%26%20fills", "orders"],
    ["Orders&Fills", "orders"],
    ["  Trade Replay ", "replay"],
  ])("alpha accepts %j however it was encoded", (raw, tab) => {
    expect(resolveTab("alpha", raw).target.tab).toBe(tab);
  });

  it("accepts the encodings of the portfolio ampersand label", () => {
    for (const raw of ["Structure+%26+Correlation", "structure%20%26%20correlation", "Structure & Correlation"]) {
      expect(resolveTab("portfolio", raw).target.tab).toBe("risk");
    }
  });

  it("passes a V2 key through and says it needs no rewrite", () => {
    const res = resolveTab("alpha", "performance");
    expect(res).toEqual({ target: { tab: "performance", hash: null, params: {} }, legacy: false, notice: null });
  });

  it("marks a V1 label for rewrite", () => {
    expect(resolveTab("alpha", "Insight Charts").legacy).toBe(true);
    expect(resolveTab("paper", "Orders").legacy).toBe(true);
    expect(resolveTab("paper", "orders").legacy).toBe(false);
  });

  it("opens the default tab without a notice when there is no value", () => {
    for (const raw of [null, "", "  "]) {
      const res = resolveTab("paper", raw);
      expect(res.target.tab).toBe("overview");
      expect(res.notice).toBeNull();
      expect(res.legacy).toBe(false);
    }
  });

  it("never falls back silently for an unknown tab", () => {
    const res = resolveTab("alpha", "Heat Map");
    expect(res.target).toEqual({ tab: "performance", hash: null, params: {} });
    expect(res.notice).toBe('Tab "Heat Map" is not available. Showing performance.');
  });

  it("does not take a label from another surface or an object prototype key", () => {
    expect(resolveTab("paper", "Insight Charts").notice).not.toBeNull();
    expect(resolveTab("alpha", "constructor").notice).not.toBeNull();
    expect(resolveTab("alpha", "__proto__").notice).not.toBeNull();
  });

  it("survives a malformed escape", () => {
    expect(resolveTab("alpha", "%E0%A4%A").notice).not.toBeNull();
  });
});

describe("applyTab", () => {
  it("rewrites tab, implied params and anchor, keeping other params", () => {
    const out = applyTab("alpha", new URLSearchParams("tab=Audit&venue=binance"), resolveTab("alpha", "Audit"));
    expect(out.search.toString()).toBe("tab=activity&venue=binance&type=audit");
    expect(out.hash).toBe("");
  });

  it("returns the anchor", () => {
    const out = applyTab("portfolio", new URLSearchParams("tab=Capital+Ledger"), resolveTab("portfolio", "Capital+Ledger"));
    expect(out.search.toString()).toBe("tab=allocations");
    expect(out.hash).toBe("#ledger");
  });

  it("drops the default tab from the URL", () => {
    const out = applyTab("paper", new URLSearchParams("tab=Overview&cal=vn"), resolveTab("paper", "Overview"));
    expect(out.search.toString()).toBe("cal=vn");
  });

  it("leaves the unknown value out and shows the default", () => {
    const out = applyTab("alpha", new URLSearchParams("tab=Nope"), resolveTab("alpha", "Nope"));
    expect(out.search.toString()).toBe("");
  });
});
