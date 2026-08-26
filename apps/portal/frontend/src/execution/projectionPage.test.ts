/**
 * `execution-projection-page.v1` — the last published contract nobody had read.
 *
 * It is the canonical keyset envelope, and reading it found two things:
 *
 *  1. `KeysetPage.retention` has been declared since phase 0 and **no reader
 *     ever populated it**. The whole retention module — five outcomes, the
 *     rule that an empty cold range is `unavailable` rather than `empty`, the
 *     restore request — sat downstream of a field nothing parsed, so every
 *     page in the product carried `retention: undefined` no matter what the
 *     server sent.
 *  2. The wire name is `availability`. The frontend had guessed `outcome`;
 *     `EX-BE-04b` names the five values in prose and never names the field,
 *     and this is the only contract that publishes retention at all. Reading
 *     `outcome` against a real page would have found nothing — and worse than
 *     nothing, because `retentionReason` indexes its text table by that value
 *     and would have printed the literal word "undefined" to an operator.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readKeysetPage, readRetention, RETENTION_OUTCOMES } from "./adapter";
import { emptyMeansEmpty, retentionReason } from "./components/retention";

const CONTRACT = join(
  __dirname,
  "../../../../../packages/contracts/fixtures/execution-projection-page.valid.json",
);

const contract = () => JSON.parse(readFileSync(CONTRACT, "utf8")) as Record<string, unknown>;
const page = () => readKeysetPage(contract(), (row) => row);

describe("the published projection page", () => {
  it("is the shape these tests think it is", () => {
    // Without this the assertions below could pass against an empty object.
    const raw = contract();
    expect(Array.isArray(raw.rows)).toBe(true);
    expect(raw.total_count).toBe(182000);
    expect(raw.retention).toEqual({ availability: "UNKNOWN", policy_version: "UNCONFIGURED" });
    expect(Array.isArray(raw.aggregates_by_currency)).toBe(true);
  });

  it("reads the envelope the server actually applied", () => {
    const p = page();
    expect(p.rows).toHaveLength(1);
    expect(p.totalCount).toBe(182000);
    expect(p.filteredCount).toBe(45500);
    expect(p.nextCursor).toBe("opaque-next-cursor");
    expect(p.prevCursor).toBeNull();
    expect(p.hasMore).toBe(true);
    expect(p.hasPrevious).toBe(false);
    expect(p.appliedFilters).toEqual([
      { field: "status", op: "eq", value: "PARTIALLY_FILLED" },
      { field: "deployment_id", op: "eq", value: "dep_74" },
    ]);
    expect(p.appliedSort).toEqual([{ field: "as_of", direction: "desc" }]);
  });

  it("populates retention at all", () => {
    // The regression in one line: this was `undefined` for every page in the
    // product, because `readKeysetPage` returned every other field and not
    // this one.
    expect(page().retention).not.toBeUndefined();
    expect(page().retention).not.toBeNull();
  });

  it("reads retention under the name the contract publishes", () => {
    expect(page().retention?.outcome).toBe("UNKNOWN");
    // Reading `outcome` off this payload finds nothing at all.
    expect((contract().retention as Record<string, unknown>).outcome).toBeUndefined();
  });

  it("still accepts the name the frontend had guessed", () => {
    expect(readRetention({ outcome: "PURGED" })?.outcome).toBe("PURGED");
    expect(readRetention({ availability: "PURGED" })?.outcome).toBe("PURGED");
  });

  it("resolves an unreadable retention value to UNKNOWN, never HOT", () => {
    // The single worst answer here is "all of it is online", so an
    // unrecognised token must not arrive at HOT by any route.
    for (const value of ["SOMETHING_NEW", "", 7, null, {}]) {
      expect(readRetention({ availability: value })?.outcome).toBe("UNKNOWN");
    }
    expect(RETENTION_OUTCOMES).toContain("UNKNOWN");
  });

  it("keeps UNCONFIGURED rather than blanking it", () => {
    // A policy version that says "no policy is configured" is a published
    // answer, not a missing field, and the notice names it.
    expect(page().retention?.policyVersion).toBe("UNCONFIGURED");
    expect(retentionReason(page().retention)).toContain("UNCONFIGURED");
  });

  it("never prints the word undefined at an operator", () => {
    // What the old field name would have produced: `OUTCOME_TEXT[undefined]`.
    const reason = retentionReason(page().retention);
    expect(reason).not.toBeNull();
    expect(reason).not.toContain("undefined");
    expect(reason).toContain("No retention policy is published for this scope");
  });

  it("does not let this page's emptiness be read as an empty result", () => {
    // `UNKNOWN` means nobody can say what is held, so zero rows here is not
    // "your filter matched nothing".
    expect(emptyMeansEmpty(page().retention)).toBe(false);
  });

  it("says so plainly when a page publishes no retention at all", () => {
    const { retention: _dropped, ...withoutRetention } = contract();
    const p = readKeysetPage(withoutRetention, (row) => row);
    expect(p.retention).toBeNull();
    expect(retentionReason(p.retention)).toContain("No retention policy was published");
  });

  it("keeps the aggregate decimals as strings if anything reads them", () => {
    // Not consumed by any screen yet — see the audit note. Pinned now because
    // the values are 18-decimal strings, and the first thing a future reader
    // will be tempted to do is `Number()` them.
    const agg = (contract().aggregates_by_currency as Record<string, unknown>[])[0];
    expect(typeof agg.quantity).toBe("string");
    expect(typeof agg.notional).toBe("string");
    expect(agg.notional).toBe("4875000.750000000000000001");
    // Proof the precision is real and would not survive a float.
    expect(Number(agg.notional as string).toString()).not.toBe(agg.notional);
  });
});
