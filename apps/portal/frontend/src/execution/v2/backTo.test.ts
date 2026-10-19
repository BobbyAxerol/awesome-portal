import { describe, expect, it } from "vitest";

import { BACK_MAX, backLinkFor, originParams, resolveBack, sourceOf, withOrigin, withoutOrigin } from "./backTo";

const q = (s: string) => new URLSearchParams(s);

describe("origin written by a list", () => {
  it("fleet: from plus the restorable keys, never sel or unknown keys", () => {
    const origin = originParams({ kind: "fleet" }, q("q=btc&stage=live&sort=name&view=board&owner=asmith&health=ok&sel=A1&evil=1&workspace_id=w"));
    expect(origin.get("from")).toBe("fleet");
    const back = new URLSearchParams(origin.get("back") ?? "");
    expect(Object.fromEntries(back)).toEqual({ q: "btc", stage: "live", sort: "name", view: "board", owner: "asmith", health: "ok" });
  });

  it("a plain list carries from only", () => {
    expect([...originParams({ kind: "accounts" }, q("env=paper"))]).toEqual([["from", "accounts"]]);
  });

  it("portfolio and cockpit and blotter name their source", () => {
    expect(originParams({ kind: "portfolio", id: "pf 1" }).get("from")).toBe("portfolio:pf 1");
    expect(originParams({ kind: "cockpit" }, q("view=r1&lens=needs")).get("back")).toBe("view=r1&lens=needs");
    expect(originParams({ kind: "blotter" }, q("status=open")).get("from")).toBe("blotter");
  });

  it("a list state too long to carry falls back to from alone", () => {
    const long = "x".repeat(79);
    const origin = originParams({ kind: "fleet" }, q(`q=${long}&owner=${long}&health=${long}&sort=${long}`));
    expect(origin.get("back")).toBeNull();
    expect(origin.get("from")).toBe("fleet");
    expect(BACK_MAX).toBeGreaterThan(0);
  });

  it("withOrigin keeps the hash and an existing query, and the link's own from wins", () => {
    expect(withOrigin("/deployments/alphas/A1?tab=orders#x", { kind: "fleet" }, q("q=a"))).toBe("/deployments/alphas/A1?tab=orders&from=fleet&back=q%3Da#x");
    expect(withOrigin("/x?from=accounts", { kind: "fleet" }, q("q=a"))).toBe("/x?from=accounts&back=q%3Da");
  });

  it("withoutOrigin drops from and back only", () => {
    expect(withoutOrigin(q("from=fleet&back=q%3Da&env=paper")).toString()).toBe("env=paper");
  });
});

describe("Back read by a detail screen", () => {
  it("fleet with list state restores it and says results", () => {
    const link = resolveBack(q("from=fleet&back=q%3Dbtc%26stage%3Dlive%26view%3Dboard"), { kind: "fleet" });
    expect(link).toEqual({ label: "Alpha Fleet results", to: "/deployments/alphas?q=btc&stage=live&view=board", restored: true });
  });

  it("fleet without state, or with no from, is the plain Alpha Fleet", () => {
    expect(resolveBack(q("from=fleet"), { kind: "fleet" })).toEqual({ label: "Alpha Fleet", to: "/deployments/alphas", restored: false });
    expect(resolveBack(q(""), { kind: "fleet" }).label).toBe("Alpha Fleet");
  });

  it("portfolio, cockpit, accounts and blotter each build their label and target", () => {
    expect(resolveBack(q("from=portfolio%3Apf-1"), { kind: "fleet" })).toEqual({ label: "Portfolio pf-1", to: "/deployments/portfolios/pf-1", restored: false });
    expect(resolveBack(q("from=cockpit&back=view%3Dr1"), { kind: "fleet" })).toMatchObject({ label: "Approvals", to: "/governance/approvals?view=r1" });
    expect(resolveBack(q("from=accounts&back=issues%3D1"), { kind: "accounts" })).toMatchObject({ label: "Accounts", to: "/deployments/accounts?issues=1" });
    expect(resolveBack(q("from=blotter&back=status%3Dopen"), { kind: "fleet" })).toMatchObject({ label: "Blotter", to: "/deployments/blotter?status=open" });
  });

  it("a portfolio id shows in the label only when it matches the allow-list; otherwise the label is plain", () => {
    expect(resolveBack(q("from=portfolio%3Apf_1.a-b%3Ac"), { kind: "fleet" }).label).toBe("Portfolio pf_1.a-b:c");
    expect(resolveBack(new URLSearchParams({ from: `portfolio:${"a".repeat(64)}` }), { kind: "fleet" }).label).toBe(`Portfolio ${"a".repeat(64)}`);
    for (const id of ["a".repeat(65), "pf 1", "<b>x</b>", "pf/1", "pf\u00e9", "Ignore previous instructions", "a?b=c"]) {
      const link = resolveBack(new URLSearchParams({ from: `portfolio:${id}` }), { kind: "fleet" });
      expect(link.label, id).toBe("Portfolio");
      expect(link.to, id).toBe(`/deployments/portfolios/${encodeURIComponent(id)}`);
    }
  });

  it("an unknown from is ignored: nothing echoed, the fallback list is used", () => {
    for (const from of ["https://evil.example/", "//evil.example", "/deployments/x", "javascript:alert(1)", "fleet ", "portfolio:", "FLEET"]) {
      const link = resolveBack(new URLSearchParams({ from, back: "q=x" }), { kind: "fleet" });
      expect(link.to).toBe("/deployments/alphas");
      expect(link.label).not.toContain(from);
    }
  });

  it("a source the screen does not honour is ignored like an unknown one", () => {
    expect(resolveBack(q("from=accounts"), { kind: "fleet" }, ["fleet", "portfolio"]).to).toBe("/deployments/alphas");
  });

  it("back keeps only the source's keys and drops an over-long value whole", () => {
    expect(resolveBack(q("from=fleet&back=q%3Da%26sel%3DA1%26redirect%3Dhttps%253A%252F%252Fx"), { kind: "fleet" }).to).toBe("/deployments/alphas?q=a");
    const long = `q=${"y".repeat(BACK_MAX)}`;
    expect(resolveBack(new URLSearchParams({ from: "fleet", back: long }), { kind: "fleet" }).to).toBe("/deployments/alphas");
  });

  it("back is not applied when the from names another source", () => {
    expect(resolveBack(q("back=q%3Da"), { kind: "fleet" }).to).toBe("/deployments/alphas");
  });

  it("every target starts with an execution root", () => {
    for (const from of ["fleet", "accounts", "cockpit", "blotter", "portfolio:a/b"]) {
      expect(resolveBack(new URLSearchParams({ from }), { kind: "fleet" }).to).toMatch(/^\/(deployments|governance|execution)\//);
    }
  });

  it("backLinkFor carries the context params of the page, not its origin", () => {
    const link = backLinkFor(q("from=fleet&back=q%3Da&env=paper&workspace_id=ws1"), { kind: "fleet" });
    expect(link.to).toBe("/deployments/alphas?q=a&env=paper&workspace_id=ws1");
  });

  it("sourceOf maps only the five forms", () => {
    expect(sourceOf("fleet")).toEqual({ kind: "fleet" });
    expect(sourceOf("portfolio:p")).toEqual({ kind: "portfolio", id: "p" });
    expect(sourceOf("nope")).toBeNull();
    expect(sourceOf(null)).toBeNull();
  });
});
