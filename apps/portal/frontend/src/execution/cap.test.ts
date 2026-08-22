/**
 * M5 tests.
 *
 * The property under test is not "the list got shorter". It is that the rows a
 * reader opened the list for survived the shortening.
 */
import { describe, expect, it } from "vitest";
import { capNotice, capPreserving } from "./components/cap";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ i, bad: false }));

describe("M5 — capping keeps what matters", () => {
  it("returns a short list untouched", () => {
    const list = capPreserving(rows(5), 10);
    expect(list.shown).toHaveLength(5);
    expect(list.capped).toBe(false);
    expect(capNotice(list, "rows")).toBeNull();
  });

  it("still reports a cap when the local list is a page of a larger set", () => {
    const list = capPreserving(rows(8), 10, () => false, 4120);
    expect(list.capped).toBe(true);
    expect(capNotice(list, "syncs")).toBe("showing 8 of 4,120 syncs");
  });

  it("keeps an exceptional row a head-cap would have dropped", () => {
    // The one STALE sync in a window of a thousand is the reason to look.
    const many = rows(1000);
    many[900].bad = true;
    const list = capPreserving(many, 10, (r) => r.bad);
    expect(list.shown.some((r) => r.bad)).toBe(true);
    expect(list.rescued).toBe(1);
    expect(list.shown).toHaveLength(10);
  });

  it("says a rescued row came from outside the visible window", () => {
    const many = rows(1000);
    many[900].bad = true;
    const notice = capNotice(capPreserving(many, 10, (r) => r.bad), "syncs")!;
    // Without this clause the visible rows look contiguous and are not.
    expect(notice).toContain("showing 10 of 1,000 syncs");
    expect(notice).toContain("1 outside the most recent 10");
  });

  it("keeps the input's order, so a capped history still reads chronologically", () => {
    const many = rows(100);
    many[80].bad = true;
    const shown = capPreserving(many, 5, (r) => r.bad).shown.map((r) => r.i);
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
    expect(shown).toContain(80);
  });

  it("does not count an exception the head would have shown anyway", () => {
    const many = rows(100);
    many[2].bad = true;
    expect(capPreserving(many, 10, (r) => r.bad).rescued).toBe(0);
  });

  it("says so when the exceptions alone overflow the budget", () => {
    // Ten problems and room for three is a finding about the system, not a
    // rendering detail, and a plain "showing 3 of 100" would hide it.
    const many = rows(100);
    for (let i = 0; i < 10; i += 1) many[i * 7].bad = true;
    const list = capPreserving(many, 3, (r) => r.bad);
    expect(list.exceptionsTruncated).toBe(true);
    expect(capNotice(list, "rows")).toContain("more non-routine rows exist");
    expect(list.shown.every((r) => r.bad)).toBe(true);
  });

  it("never abbreviates a count in the notice", () => {
    const list = capPreserving(rows(50), 10, () => false, 4_120_000);
    expect(capNotice(list, "fills")).toContain("4,120,000");
    expect(capNotice(list, "fills")).not.toMatch(/[0-9]k|M\b/);
  });

  it("handles a zero budget without pretending the list was empty", () => {
    const list = capPreserving(rows(9), 0);
    expect(list.shown).toHaveLength(0);
    expect(list.capped).toBe(true);
    expect(capNotice(list, "rows")).toContain("showing 0 of 9 rows");
  });
});
