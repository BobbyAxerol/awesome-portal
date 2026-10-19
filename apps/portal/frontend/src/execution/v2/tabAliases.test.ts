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
  // S3 stage screens (D3): hi-fi slug primary, V1 label and review2/07 short slug as aliases.
  ["sandbox", "reconciliation", "reconciliation", null, {}],
  ["sandbox", "steps", "steps", null, {}],
  ["sandbox", "promotion-plans", "promotion-plans", null, {}],
  ["sandbox", "timeline", "timeline", null, {}],
  ["sandbox", "Reconciliation", "reconciliation", null, {}],
  ["sandbox", "Steps", "steps", null, {}],
  ["sandbox", "Steps (7)", "steps", null, {}],
  ["sandbox", "Promotion plans", "promotion-plans", null, {}],
  ["sandbox", "plans", "promotion-plans", null, {}],
  ["sandbox", "Timeline", "timeline", null, {}],
  ["canary", "envelope", "envelope", null, {}],
  ["canary", "positions-orders", "positions-orders", null, {}],
  ["canary", "reconciliation", "reconciliation", null, {}],
  ["canary", "guard-rule", "guard-rule", null, {}],
  ["canary", "Positions & orders", "positions-orders", null, {}],
  ["canary", "Guard rule", "guard-rule", null, {}],
  ["canary", "positions", "positions-orders", null, {}],
  ["canary", "guard", "guard-rule", null, {}],
  ["live", "exposure-orders", "exposure-orders", null, {}],
  ["live", "continuity", "continuity", null, {}],
  ["live", "predecessor-envelope", "predecessor-envelope", null, {}],
  ["live", "guard-rules", "guard-rules", null, {}],
  ["live", "Exposure & orders", "exposure-orders", null, {}],
  ["live", "Predecessor envelope", "predecessor-envelope", null, {}],
  ["live", "Guard rules", "guard-rules", null, {}],
  ["live", "Continuity", "continuity", null, {}],
  ["live", "exposure", "exposure-orders", null, {}],
  ["live", "predecessor", "predecessor-envelope", null, {}],
  ["live", "guard", "guard-rules", null, {}],
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

describe("stage surfaces (S3 D3)", () => {
  it.each([
    ["sandbox", "reconciliation"],
    ["canary", "envelope"],
    ["live", "exposure-orders"],
  ] as const)("%s opens %s on a bare URL, with no notice", (surface, tab) => {
    for (const raw of [null, "", "  "]) {
      const res = resolveTab(surface, raw);
      expect(res.target.tab).toBe(tab);
      expect(res.notice).toBeNull();
    }
  });

  it("accepts every encoding of the V1 labels with spaces and ampersands", () => {
    for (const raw of ["Promotion+plans", "promotion%20plans", "PROMOTION   PLANS"]) expect(resolveTab("sandbox", raw).target.tab).toBe("promotion-plans");
    for (const raw of ["Positions+%26+orders", "positions%20%26%20orders", "Positions&orders"]) expect(resolveTab("canary", raw).target.tab).toBe("positions-orders");
    for (const raw of ["Exposure+%26+orders", "exposure%20%26%20orders"]) expect(resolveTab("live", raw).target.tab).toBe("exposure-orders");
  });

  it("marks an alias or a V1 label for rewrite and a hi-fi slug as canonical", () => {
    expect(resolveTab("sandbox", "Promotion plans").legacy).toBe(true);
    expect(resolveTab("sandbox", "plans").legacy).toBe(true);
    expect(resolveTab("sandbox", "Steps (7)").legacy).toBe(true);
    expect(resolveTab("sandbox", "promotion-plans").legacy).toBe(false);
    expect(resolveTab("canary", "guard").legacy).toBe(true);
    expect(resolveTab("live", "guard-rules").legacy).toBe(false);
  });

  it("canary and live both answer `guard`, each with its own tab", () => {
    expect(resolveTab("canary", "guard").target.tab).toBe("guard-rule");
    expect(resolveTab("live", "guard").target.tab).toBe("guard-rules");
  });

  it("an unknown value gets the default tab and a one-line notice, never silence", () => {
    for (const surface of ["sandbox", "canary", "live"] as const) {
      const res = resolveTab(surface, "Heat Map");
      expect(res.notice).toMatch(/^Tab "Heat Map" is not available\. Showing [a-z-]+\.$/);
      expect(res.notice).not.toContain("\n");
      expect(res.target.params).toEqual({});
    }
  });

  it("does not take a tab from another surface, a count on its own, or a prototype key", () => {
    expect(resolveTab("sandbox", "envelope").notice).not.toBeNull();
    expect(resolveTab("canary", "steps").notice).not.toBeNull();
    expect(resolveTab("live", "timeline").notice).not.toBeNull();
    expect(resolveTab("live", "(7)").notice).not.toBeNull();
    expect(resolveTab("sandbox", "constructor").notice).not.toBeNull();
    expect(resolveTab("canary", "__proto__").notice).not.toBeNull();
  });

  it("keeps a count only for a tab it follows: `Heat Map (3)` is still unknown", () => {
    expect(resolveTab("sandbox", "Heat Map (3)").notice).not.toBeNull();
    expect(resolveTab("sandbox", "Timeline (12)").target.tab).toBe("timeline");
  });

  it("applyTab canonicalises: alias to slug, default dropped, other params kept", () => {
    const alias = applyTab("canary", new URLSearchParams("tab=Positions+%26+orders&workspace_id=w1"), resolveTab("canary", "Positions & orders"));
    expect(alias.search.toString()).toBe("tab=positions-orders&workspace_id=w1");
    const def = applyTab("sandbox", new URLSearchParams("tab=Reconciliation&env=sandbox"), resolveTab("sandbox", "Reconciliation"));
    expect(def.search.toString()).toBe("env=sandbox");
    const unknown = applyTab("live", new URLSearchParams("tab=Nope&sel=x"), resolveTab("live", "Nope"));
    expect(unknown.search.toString()).toBe("sel=x");
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
