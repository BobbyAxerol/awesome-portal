/** Compare model: who shares a basis, who is listed apart and why, and where Back goes. */
import { describe, expect, it } from "vitest";

import type { PortfolioListItem } from "../../../api/profileRead";
import { toRows, type PortfolioRow } from "../portfolios/listModel";
import { backTarget, basisOf, resolveSelection, selectionHint, selectionState } from "./model";

const item = (id: string, over: Partial<PortfolioListItem> = {}): PortfolioListItem => ({
  portfolioId: id, name: id, owner: null, state: "ACTIVE", baseCurrency: "USDT", environments: ["live"], allocationCount: 1, deploymentCount: 1,
  allocatedByCurrency: [{ currency: "USDT", value: "1.00" }], updatedAt: "2026-10-17T00:00:00Z", ...over,
});
const rows = (...items: PortfolioListItem[]): readonly PortfolioRow[] => toRows(items);

describe("resolveSelection", () => {
  it("keeps the order picked and names ids the list does not hold", () => {
    const all = rows(item("a"), item("b"), item("c"));
    const { rows: found, unresolved } = resolveSelection(all, ["c", "zzz", "a"]);
    expect(found.map((r) => r.portfolioId)).toEqual(["c", "a"]);
    expect(unresolved).toEqual(["zzz"]);
  });
});

describe("basisOf", () => {
  it("reads portfolios of one currency and one domain on one basis", () => {
    const basis = basisOf(rows(item("a"), item("b")));
    expect(basis).toMatchObject({ currency: "USDT", domain: "real" });
    expect(basis.comparable.map((r) => r.portfolioId)).toEqual(["a", "b"]);
    expect(basis.apart).toEqual([]);
    expect(basis.partitions).toHaveLength(1);
  });

  it("lists another currency apart with the reason, and keeps it as its own partition", () => {
    const basis = basisOf(rows(item("a"), item("j", { baseCurrency: "JPY", allocatedByCurrency: [{ currency: "JPY", value: "7" }] })));
    expect(basis.apart.map((a) => [a.row.portfolioId, a.reason])).toEqual([["j", "Other currency (JPY); cannot be compared on a USDT basis"]]);
    expect(basis.partitions.map((p) => [p.currency, p.ids])).toEqual([["USDT", ["a"]], ["JPY", ["j"]]]);
  });

  it("lists a Simulated book apart from a Real-funded one, and the other way round", () => {
    const sim = item("s", { environments: ["paper"] });
    expect(basisOf(rows(item("a"), sim)).apart[0].reason).toBe("Simulated book; the basis is Real-funded, and the two are never combined");
    expect(basisOf(rows(sim, item("a"))).apart[0].reason).toBe("Real-funded book; the basis is Simulated, and the two are never combined");
  });

  it("refuses a portfolio whose one allocation figure spans both domains, and takes the basis from the first that can be compared", () => {
    const mixed = item("m", { environments: ["live", "paper"] });
    const basis = basisOf(rows(mixed, item("a"), item("b")));
    expect(basis.apart.map((a) => a.row.portfolioId)).toEqual(["m"]);
    expect(basis.comparable.map((r) => r.portfolioId)).toEqual(["a", "b"]);
    expect(basis.currency).toBe("USDT");
  });

  it("lets a mixed book with no allocation figure through: there is no shared figure to refuse", () => {
    const noFigure = item("m", { environments: ["live", "paper"], allocatedByCurrency: [] });
    expect(basisOf(rows(noFigure)).apart).toEqual([]);
  });

  it("refuses the Unallocated bucket on any basis", () => {
    const basis = basisOf(rows(item("pf_unallocated", { baseCurrency: "UNKNOWN", allocatedByCurrency: [] }), item("a")));
    expect(basis.apart.map((a) => a.row.portfolioId)).toEqual(["pf_unallocated"]);
    expect(basis.apart[0].reason).toContain("nothing to compare");
    expect(basis.currency).toBe("USDT");
  });

  it("has no basis, and says nothing about one, when nothing can be compared", () => {
    expect(basisOf([])).toMatchObject({ currency: null, domain: null, comparable: [], apart: [], partitions: [] });
    expect(basisOf(rows(item("pf_unallocated"))).currency).toBeNull();
  });

  it("never drops a pick: every row is comparable or apart, exactly once", () => {
    const all = rows(item("a"), item("m", { environments: ["live", "paper"] }), item("j", { baseCurrency: "JPY" }), item("s", { environments: ["paper"] }), item("pf_unallocated"));
    const basis = basisOf(all);
    expect([...basis.comparable.map((r) => r.key), ...basis.apart.map((a) => a.row.key)].sort()).toEqual(all.map((r) => r.key).sort());
  });
});

describe("selection words and Back", () => {
  it("counts picks into a state and a hint", () => {
    expect(selectionState(0)).toEqual({ kind: "empty" });
    expect(selectionState(1)).toEqual({ kind: "too-few", count: 1 });
    expect(selectionState(3)).toEqual({ kind: "ready", count: 3 });
    expect(selectionState(4)).toEqual({ kind: "full", count: 4 });
    expect([0, 1, 3, 4].map((n) => selectionHint(selectionState(n)))).toEqual(["Pick two to four portfolios to compare.", "Pick at least one more to compare.", "", "4 selected. Remove one to change."]);
  });

  it("sends Back to where the link came from, and to the list for anything else", () => {
    expect(backTarget("fleet")).toEqual({ kind: "fleet" });
    expect(backTarget("portfolio:pf_1")).toEqual({ kind: "portfolio", portfolioId: "pf_1" });
    expect(backTarget("portfolio:")).toEqual({ kind: "list" });
    expect(backTarget("portfolios")).toEqual({ kind: "list" });
    expect(backTarget(null)).toEqual({ kind: "list" });
  });
});
