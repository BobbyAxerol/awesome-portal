/** BE-P16 CR-02: the revision-scoped repair retry budget, as a pure state machine, plus migration 148 hygiene and the store's use of it. No PostgreSQL. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRepairEntries, refuse, settle, spentAttempts, SERIES_REPAIR_ATTEMPTS, SERIES_REPAIR_MAX_TRACKED, type RepairEntry } from "../src/execution-v2/manager-series-repair";
import { SERIES_REPAIR_ATTEMPTS as STORE_ATTEMPTS } from "../src/execution-v2/manager-series.store";

describe("revision-scoped repair budget (pure)", () => {
  it("keeps the three-attempt bound: attempts 1 and 2 retry, attempt 3 exhausts and states the gap", () => {
    expect(SERIES_REPAIR_ATTEMPTS).toBe(3);
    expect(STORE_ATTEMPTS).toBe(3);                       // the store re-exports the one constant
    const a = refuse([], "r3");
    expect(a).toEqual({ attempt: 1, exhausted: false, entries: [{ revision: "r3", attempts: 1 }] });
    const b = refuse(a.entries, "r3");
    expect(b).toEqual({ attempt: 2, exhausted: false, entries: [{ revision: "r3", attempts: 2 }] });
    const c = refuse(b.entries, "r3");
    expect(c).toEqual({ attempt: 3, exhausted: true, entries: [] });          // the gap ends the budget: nothing lingers
  });
  it("an interleaved failure of another revision neither resets nor consumes this revision's budget", () => {
    let entries: RepairEntry[] = refuse([], "r3").entries;                     // repair(r3) -> 1
    entries = refuse(entries, "r4").entries;                                  // the r4 failure is charged to r4 only
    expect(spentAttempts(entries, "r3")).toBe(1);
    expect(spentAttempts(entries, "r4")).toBe(1);
    const r3 = refuse(entries, "r3");                                         // repair(r3) again -> 2, not 1
    expect(r3.attempt).toBe(2);
    expect(spentAttempts(r3.entries, "r4")).toBe(1);
    expect(refuse(r3.entries, "r3")).toMatchObject({ attempt: 3, exhausted: true });
    expect(spentAttempts(refuse(r3.entries, "r3").entries, "r4")).toBe(1);   // r3's gap leaves r4's own budget alone
  });
  it("settle (repaired, recorded live, stated gap) clears only that revision", () => {
    const entries: RepairEntry[] = [{ revision: "r3", attempts: 2 }, { revision: "r4", attempts: 1 }];
    expect(settle(entries, "r3")).toEqual([{ revision: "r4", attempts: 1 }]);
    expect(settle(entries, "r9")).toEqual(entries);
    expect(entries).toHaveLength(2);                                          // inputs are never mutated
  });
  it("is hard-capped: a new revision beyond the cap evicts the oldest, never grows the array", () => {
    let entries: RepairEntry[] = [];
    for (let i = 0; i < SERIES_REPAIR_MAX_TRACKED + 5; i++) entries = refuse(entries, `r${i}`).entries;
    expect(entries).toHaveLength(SERIES_REPAIR_MAX_TRACKED);
    expect(entries[0].revision).toBe("r5");
    expect(spentAttempts(entries, "r0")).toBe(0);                             // only the evicted revision's budget restarts
  });
  it("reads the stored array defensively: junk, out-of-range attempts and duplicates cannot widen the bound", () => {
    expect(parseRepairEntries(null)).toEqual([]);
    expect(parseRepairEntries({ revision: "r3", attempts: 1 })).toEqual([]);
    expect(parseRepairEntries([null, 1, "x", { revision: "", attempts: 1 }, { revision: "a", attempts: 0 }, { revision: "b", attempts: 3 }, { revision: "c", attempts: 1.5 },
      { revision: "d", attempts: "1" }, { revision: "e", attempts: 2 }, { revision: "e", attempts: 1 }])).toEqual([{ revision: "e", attempts: 1 }]);
    const many = Array.from({ length: 40 }, (_, i) => ({ revision: `r${i}`, attempts: 1 }));
    expect(parseRepairEntries(many)).toHaveLength(SERIES_REPAIR_MAX_TRACKED);
  });
});

describe("BE-P16 migration 148: file hygiene (no PostgreSQL)", () => {
  const dir = resolve(__dirname, "../migrations"), name = "1723680000148_execution-manager-series-repair-attempts.sql";
  const sql = readFileSync(resolve(dir, name), "utf8"), [up, down] = sql.split("-- Down Migration");
  it("is the only migration with its number, directly after 147, and 145-147 are untouched in name", () => {
    const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
    expect(files.filter(f => f.startsWith("1723680000148_"))).toEqual([name]);
    expect(files.indexOf(name)).toBe(files.indexOf("1723680000147_execution-manager-series-observations.sql") + 1);
  });
  it("is one additive, defaulted, bounded column on the checkpoint and nothing destructive", () => {
    expect([...up.matchAll(/ALTER TABLE (\w+)/g)].map(m => m[1])).toEqual(["execution_manager_series_checkpoints"]);
    expect(up).toMatch(/ADD COLUMN repair_attempts jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(up).toMatch(/jsonb_typeof\(repair_attempts\)='array' AND jsonb_array_length\(repair_attempts\) <= 16/);
    expect(up).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|CREATE TRIGGER)\b/i);
    expect(down).not.toMatch(/\bDROP\b/i);
  });
  it("matches the cap the application enforces", () => { expect(SERIES_REPAIR_MAX_TRACKED).toBe(16); });
});

describe("the store keeps the budget off the shared diagnostic (source regression)", () => {
  const source = readFileSync(resolve(__dirname, "../src/execution-v2/manager-series.store.ts"), "utf8");
  it("no longer derives the attempt number from last_error_*", () => {
    expect(source).not.toMatch(/repairAttempt\(/);
    expect(source).toMatch(/refuse\(parseRepairEntries\(/);
  });
  it("clears one revision's entry on repair, live record and stated gap, and the lookup costs nothing for a COMPLETE checkpoint", () => {
    expect(source.match(/repairWithout\("\$4"\)/g)?.length).toBe(3);          // recordRevision upsert, replay, skip
    expect(source).toMatch(/if \(cp\?\.backfill_state === "COMPLETE"\) return out;/);   // before any repair_attempts read: one point-read per tick
  });
});
