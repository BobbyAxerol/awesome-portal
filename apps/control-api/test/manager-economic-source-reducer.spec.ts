/**
 * BE-P21 (ELP2-10 C5): the dark economic-source reducer. PROPOSAL_NOT_A_PRODUCER_MAPPING.
 *
 * TEST_ONLY: every source id, leaf, account, amount and revision below is synthetic. PM's returned 14 / 28 / null examples inspired the
 * values; nothing here is a runtime fact, a producer example, a qualification or a financial acceptance. No PostgreSQL, no clock, no I/O.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { economicSourceReduction, economicSourceReductionInput, economicProvenRow, type EconomicExpectation, type EconomicProvenRow,
  type EconomicSourceReduction } from "../src/execution-v2/manager-economic-source.contract";
import { economicRowContentDigest, reduceEconomicSource } from "../src/execution-v2/manager-economic-source-reducer";

const DAY = 86_400_000, T0 = 1_800_000_000_000, NS = "TEST_ONLY:ns", HASH = `sha256:${"a".repeat(64)}`;
const EXP: EconomicExpectation = { metric: "NET_PNL", environment: "paper", currency: "TEST_ONLY:USDT", basis: "TEST_ONLY:basis",
  cut: { effective_at_ms: T0, recorded_through_ms: T0 + 1_000 }, valuation_cutoff_ms: T0, window: { from_ms: T0 - 30 * DAY, to_ms: T0 },
  revisions: { economic: "TEST_ONLY:econ-1", cashflow: "TEST_ONLY:cash-1", valuation: "TEST_ONLY:val-1", ownership: "TEST_ONLY:own-1" },
  restatement_relation: "ORIGINAL" };
const src = (id: string) => ({ namespace: NS, source_id: `TEST_ONLY:src-${id}` });

function row(id: string, leaves: string[], amount: string, over: Partial<EconomicProvenRow> = {}): EconomicProvenRow {
  return { evidence: "PROVEN_SOURCE_ROW", portal_fact_id: `TEST_ONLY:fact-${id}`, physical_account_ref: `TEST_ONLY:phys-${id}`,
    source_identity: src(id), leaves, metric: "NET_PNL", amount, environment: "paper", currency: EXP.currency, basis: EXP.basis,
    cut: { ...EXP.cut }, window: { ...EXP.window! }, economic_revision: EXP.revisions.economic, cashflow_revision: EXP.revisions.cashflow,
    valuation: { valuation_cutoff_ms: EXP.valuation_cutoff_ms, valuation_revision: EXP.revisions.valuation },
    ownership: { ownership_revision: EXP.revisions.ownership, attribution_ref: `TEST_ONLY:attr-${id}`, assignment_digest: HASH, owner_digest: HASH,
      economic_account_ref: { state: "ABSENT", reason_code: "NO_ACCEPTED_BRIDGE" }, ownership_partition_ref: { state: "ABSENT", reason_code: "NO_ACCEPTED_BRIDGE" } },
    cost_layers: { included: ["TEST_ONLY:fees", "TEST_ONLY:funding"], missing: [] },
    restatement: { relation: "ORIGINAL", original_ref: null }, ...over };
}
interface Over { expectation?: Partial<EconomicExpectation>; census?: string[] | null; trusted?: string[] }
function input(rows: unknown[], o: Over = {}) {
  return { schema_version: "portal.execution.manager-economic-source-reduction-input.proposal.v1", expectation: { ...EXP, ...o.expectation },
    trust_policy: { policy_ref: "TEST_ONLY:trust", accepted_namespaces: o.trusted ?? [NS] },
    census: o.census === null ? null : { census_ref: "TEST_ONLY:census-1", expected_sources: (o.census ?? ["a", "b"]).map(src) }, rows };
}
const A = () => row("a", ["leaf-1", "leaf-2"], "14"), B = () => row("b", ["leaf-3"], "14");
const reduce = (rows: unknown[], o?: Over) => reduceEconomicSource(input(rows, o));
const codes = (r: EconomicSourceReduction) => r.reason_codes;
const details = (r: EconomicSourceReduction, code: string) => r.findings.filter(f => f.code === code).map(f => f.detail);

/** Independent exact arithmetic for expectations: scale to 19 fractional digits and use BigInt, never the reducer's own helper. */
const scaled = (v: string) => { const neg = v.startsWith("-"), [w, f = ""] = (neg ? v.slice(1) : v).split("."); return BigInt(w + f.padEnd(19, "0")) * (neg ? -1n : 1n); };
const unscaled = (n: bigint) => { const neg = n < 0n, d = (neg ? -n : n).toString().padStart(20, "0"), w = d.slice(0, -19).replace(/^0+(?=\d)/, ""), f = d.slice(-19).replace(/0+$/, "");
  return `${neg ? "-" : ""}${w}${f ? "." + f : ""}`; };

describe("BE-P21 case 1: an identical row counts once", () => {
  it("the same trusted source id and identical content, carried by two Portal fact ids, is one term", () => {
    const r = reduce([A(), { ...A(), portal_fact_id: "TEST_ONLY:fact-a-resent" }, B()]);
    expect(r.state).toBe("COMPLETE");
    expect(r.value).toBe("28"); // 14 + 14, not 14 + 14 + 14
    expect(r.collapsed_duplicate_count).toBe(1);
    expect(r.sources.map(s => s.source_id)).toEqual(["TEST_ONLY:src-a", "TEST_ONLY:src-b"]);
    expect(r.sources[0].portal_fact_ids).toEqual(["TEST_ONLY:fact-a", "TEST_ONLY:fact-a-resent"]);
  });
  it("content equality is value equality, not spelling: 14, 14.0 and 14.000 are one amount; leaf order is irrelevant", () => {
    const r = reduce([A(), { ...A(), amount: "14.000", leaves: ["leaf-2", "leaf-1"], portal_fact_id: "TEST_ONLY:other" }, B()]);
    expect(r.state).toBe("COMPLETE"); expect(r.value).toBe("28"); expect(r.collapsed_duplicate_count).toBe(1);
  });
  it("the physical-account hint and the Portal fact id are not content", () => {
    expect(economicRowContentDigest(A())).toBe(economicRowContentDigest({ ...A(), portal_fact_id: "TEST_ONLY:x", physical_account_ref: null }));
  });
});

describe("BE-P21 case 2: the same id with changed content is a conflict", () => {
  it.each<[string, Partial<EconomicProvenRow>]>([
    ["amount", { amount: "15" }], ["leaves", { leaves: ["leaf-1", "leaf-2", "leaf-9"] }],
    ["revision", { economic_revision: "TEST_ONLY:econ-2" }], ["restatement", { restatement: { relation: "CORRECTED", original_ref: "TEST_ONLY:orig" } }],
    ["valuation proof dropped", { valuation: null }], ["cost layers", { cost_layers: { included: [], missing: ["TEST_ONLY:fees"] } }],
  ])("a changed %s under src-a refuses with REPORT_SOURCE_CONFLICT and no number", (_name, change) => {
    const r = reduce([A(), { ...A(), portal_fact_id: "TEST_ONLY:fact-a2", ...change }, B()]);
    expect(r.state).toBe("REFUSED"); expect(r.value).toBeNull(); expect(r.sources).toEqual([]);
    expect(codes(r)).toContain("REPORT_SOURCE_CONFLICT");
    expect(r.findings.find(f => f.code === "REPORT_SOURCE_CONFLICT")).toMatchObject({ namespace: NS, source_id: "TEST_ONLY:src-a" });
  });
});

describe("BE-P21 case 3: different ids with overlapping leaves refuse", () => {
  it("is REPORT_SOURCE_OVERLAP, never additive because the fact ids differ", () => {
    const r = reduce([row("a", ["leaf-1", "leaf-2"], "14"), row("b", ["leaf-2", "leaf-3"], "14")]);
    expect(r.state).toBe("REFUSED"); expect(r.value).toBeNull(); expect(codes(r)).toEqual(["REPORT_SOURCE_OVERLAP"]);
    expect(r.findings[0]).toMatchObject({ source_id: "TEST_ONLY:src-a", detail: JSON.stringify([NS, "TEST_ONLY:src-b"]) });
  });
  it("one shared leaf among many is enough; a third sharer is reported against the first", () => {
    const r = reduce([row("a", ["l1", "shared"], "1"), row("b", ["l2", "shared"], "1"), row("c", ["l3", "shared"], "1")], { census: ["a", "b", "c"] });
    expect(r.state).toBe("REFUSED"); expect(details(r, "REPORT_SOURCE_OVERLAP")).toHaveLength(2);
  });
});

describe("BE-P21 case 4: validated disjoint sources sum exactly", () => {
  it("sums 19-digit decimals with no float error (independent BigInt oracle)", () => {
    const values = ["1234567890123456789.1234567890123456789", "-0.0000000000000000001", "9007199254740993.5", "0.1000000000000000001"];
    const ids = ["a", "b", "c", "d"], rows = ids.map((id, i) => row(id, [`leaf-${id}`], values[i]));
    const r = reduce(rows, { census: ids });
    expect(r.state).toBe("COMPLETE");
    expect(r.value).toBe(unscaled(values.reduce((t, v) => t + scaled(v), 0n)));
    expect(r.value).toBe("1243575089378197782.7234567890123456789"); // hand-checked: float arithmetic cannot produce this string
  });
  it("is canonical: no trailing zero, no signed zero, negative totals keep their sign", () => {
    expect(reduce([row("a", ["l1"], "1.50"), row("b", ["l2"], "-1.5")]).value).toBe("0");
    expect(reduce([row("a", ["l1"], "-0"), row("b", ["l2"], "0.0")]).value).toBe("0");
    expect(reduce([row("a", ["l1"], "-2.25"), row("b", ["l2"], "0.25")]).value).toBe("-2");
  });
  it("only sums a COMPLETE census: the sum is the whole expected population, labelled with its digest", () => {
    const r = reduce([A(), B()]);
    expect(r).toMatchObject({ state: "COMPLETE", value: "28", census_ref: "TEST_ONLY:census-1", reason_codes: [], findings: [], findings_truncated: false });
    expect(r.economic_set_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("BE-P21 case 5: missing expected source / valuation / ownership is typed null, never zero", () => {
  it("a census source with no row is PARTIAL and carries no number", () => {
    const r = reduce([A()]);
    expect(r.state).toBe("PARTIAL"); expect(r.value).toBeNull(); expect(codes(r)).toEqual(["ECONOMIC_SOURCE_MISSING"]);
    expect(r.findings[0]).toMatchObject({ source_id: "TEST_ONLY:src-b" });
    expect(r.sources.map(s => s.source_id)).toEqual(["TEST_ONLY:src-a"]); // what is present stays auditable; it is not a subtotal
  });
  it("no rows at all against a published census is PARTIAL, not zero", () => {
    const r = reduce([]);
    expect(r.state).toBe("PARTIAL"); expect(r.value).toBeNull(); expect(r.value).not.toBe("0");
    expect(r.findings.filter(f => f.code === "ECONOMIC_SOURCE_MISSING")).toHaveLength(2);
  });
  it("a row without valuation proof is PARTIAL", () => {
    const r = reduce([A(), row("b", ["leaf-3"], "14", { valuation: null })]);
    expect(r.state).toBe("PARTIAL"); expect(r.value).toBeNull(); expect(codes(r)).toEqual(["ECONOMIC_VALUATION_MISSING"]);
  });
  it("a row without ownership / attribution proof is PARTIAL; weights are never inferred", () => {
    const r = reduce([A(), row("b", ["leaf-3"], "14", { ownership: null })]);
    expect(r.state).toBe("PARTIAL"); expect(r.value).toBeNull(); expect(codes(r)).toEqual(["ECONOMIC_OWNERSHIP_MISSING"]);
  });
  it("a row that states missing cost layers is PARTIAL (a fees+funding NET_PNL is not a complete NET_PNL)", () => {
    const r = reduce([A(), row("b", ["leaf-3"], "14", { cost_layers: { included: ["TEST_ONLY:fees"], missing: ["TEST_ONLY:interest", "TEST_ONLY:borrow"] } })]);
    expect(r.state).toBe("PARTIAL"); expect(codes(r)).toEqual(["ECONOMIC_COST_LAYERS_MISSING"]);
    expect(details(r, "ECONOMIC_COST_LAYERS_MISSING")).toEqual(["TEST_ONLY:borrow,TEST_ONLY:interest"]);
  });
  it("several gaps are all reported, sorted; the verdict does not depend on which one is looked at first", () => {
    const r = reduce([row("a", ["l1"], "14", { valuation: null, ownership: null })]);
    expect(r.state).toBe("PARTIAL"); expect(codes(r)).toEqual(["ECONOMIC_OWNERSHIP_MISSING", "ECONOMIC_SOURCE_MISSING", "ECONOMIC_VALUATION_MISSING"]);
  });
  it("a typed-absent economic_account_ref / ownership_partition_ref is NOT a missing ownership proof and is never filled in", () => {
    const r = reduce([A(), B()]);
    expect(r.state).toBe("COMPLETE");
    expect(economicProvenRow.safeParse(row("a", ["l"], "1", { ownership: { ...A().ownership!, economic_account_ref: { state: "ABSENT", reason_code: "NOT_PUBLISHED_BY_SOURCE" } } })).success).toBe(true);
    expect(economicProvenRow.safeParse(row("a", ["l"], "1", { ownership: { ...A().ownership!, economic_account_ref: { state: "ABSENT" } as never } })).success).toBe(false);
  });
});

describe("BE-P21 case 6: mismatched comparability keys refuse", () => {
  const T = (over: Partial<EconomicProvenRow>) => reduce([A(), row("b", ["leaf-3"], "14", over)]);
  it.each<[string, Partial<EconomicProvenRow>]>([
    ["currency", { currency: "TEST_ONLY:EUR" }], ["basis", { basis: "TEST_ONLY:other-basis" }], ["environment", { environment: "live" }],
    ["metric", { metric: "NAV" }],
    ["cut.effective_at_ms", { cut: { effective_at_ms: T0 + 1, recorded_through_ms: EXP.cut.recorded_through_ms } }],
    ["cut.recorded_through_ms", { cut: { effective_at_ms: T0, recorded_through_ms: EXP.cut.recorded_through_ms + 1 } }],
    ["window", { window: { from_ms: T0 - 7 * DAY, to_ms: T0 } }], ["window", { window: null }],
    ["valuation_cutoff_ms", { valuation: { valuation_cutoff_ms: T0 - 1, valuation_revision: EXP.revisions.valuation } }],
    ["valuation_revision", { valuation: { valuation_cutoff_ms: T0, valuation_revision: "TEST_ONLY:val-2" } }],
    ["ownership_revision", { ownership: { ...A().ownership!, ownership_revision: "TEST_ONLY:own-2" } }],
    ["economic_revision", { economic_revision: "TEST_ONLY:econ-2" }], ["cashflow_revision", { cashflow_revision: "TEST_ONLY:cash-2" }],
    ["restatement_relation", { restatement: { relation: "RESTATED", original_ref: "TEST_ONLY:orig" } }],
  ])("a row whose %s differs refuses the whole reduction", (field, over) => {
    const r = T(over);
    expect(r.state).toBe("REFUSED"); expect(r.value).toBeNull(); expect(r.sources).toEqual([]);
    expect(codes(r)).toEqual(["ECONOMIC_COMPARABILITY_MISMATCH"]); expect(details(r, "ECONOMIC_COMPARABILITY_MISMATCH")).toEqual([field]);
    expect(r.findings[0]).toMatchObject({ source_id: "TEST_ONLY:src-b" });
  });
  it("the same holds when the expectation moves instead of the row (a different cut / currency is a different reduction)", () => {
    for (const expectation of [{ currency: "TEST_ONLY:EUR" }, { cut: { effective_at_ms: T0 + DAY, recorded_through_ms: T0 + DAY } }] as const) {
      const r = reduce([A(), B()], { expectation: expectation as Partial<EconomicExpectation> });
      expect(r.state).toBe("REFUSED"); expect(r.value).toBeNull();
    }
  });
  it("cumulative snapshots are not events: rows of two cuts are never summed across time", () => {
    const earlier = { cut: { effective_at_ms: T0 - DAY, recorded_through_ms: T0 - DAY + 1_000 } };
    const mixed = reduce([A(), row("b", ["leaf-3"], "14", earlier)]);
    expect(mixed.state).toBe("REFUSED"); expect(mixed.value).toBeNull();
    // The one legitimate way to look at two cuts is two reductions, kept apart; each is a value at ITS cut, and nothing adds them.
    const atT0 = reduce([A(), B()]);
    const yesterday = { cut: earlier.cut, valuation_cutoff_ms: T0 - DAY };
    const atT1 = reduce([row("a", ["leaf-1", "leaf-2"], "12", { ...earlier, valuation: { valuation_cutoff_ms: T0 - DAY, valuation_revision: EXP.revisions.valuation } }),
      row("b", ["leaf-3"], "12", { ...earlier, valuation: { valuation_cutoff_ms: T0 - DAY, valuation_revision: EXP.revisions.valuation } })], { expectation: yesterday });
    expect([atT0.value, atT1.value]).toEqual(["28", "24"]);
    expect(atT0.economic_set_digest).not.toBe(atT1.economic_set_digest);
  });
});

describe("BE-P21 case 7: equal money, physical account and fact id are not dedupe (or disjointness) proof", () => {
  it("two source ids with equal money both count", () => {
    const r = reduce([row("a", ["l1"], "14"), row("b", ["l2"], "14")]);
    expect(r.value).toBe("28");
  });
  it("two source ids on one physical account with disjoint leaves both count: equality proves no duplication", () => {
    const r = reduce([row("a", ["l1"], "14", { physical_account_ref: "TEST_ONLY:shared-pool" }), row("b", ["l2"], "14", { physical_account_ref: "TEST_ONLY:shared-pool" })]);
    expect(r.state).toBe("COMPLETE"); expect(r.value).toBe("28");
  });
  it("one physical account is not a disjointness proof either: overlapping leaves still refuse", () => {
    const r = reduce([row("a", ["l1"], "14", { physical_account_ref: "TEST_ONLY:shared-pool" }), row("b", ["l1"], "14", { physical_account_ref: "TEST_ONLY:shared-pool" })]);
    expect(r.state).toBe("REFUSED"); expect(codes(r)).toEqual(["REPORT_SOURCE_OVERLAP"]);
  });
  it("one Portal fact id carried by two different source ids does not merge them", () => {
    const r = reduce([row("a", ["l1"], "14", { portal_fact_id: "TEST_ONLY:fact-same" }), row("b", ["l2"], "14", { portal_fact_id: "TEST_ONLY:fact-same" })]);
    expect(r.state).toBe("COMPLETE"); expect(r.value).toBe("28");
  });
  it("different fact ids over one source id and one content still count once (the identity is the source id)", () => {
    expect(reduce([A(), { ...A(), portal_fact_id: "TEST_ONLY:z" }, B()]).value).toBe("28");
  });
  it("equal ownership refs are not identity either: shared typed refs neither merge nor split sources", () => {
    const shared = { ...A().ownership!, economic_account_ref: { state: "PROVIDED" as const, ref: "TEST_ONLY:econ-acct" }, ownership_partition_ref: { state: "PROVIDED" as const, ref: "TEST_ONLY:part" } };
    const r = reduce([row("a", ["l1"], "14", { ownership: shared }), row("b", ["l2"], "14", { ownership: shared })]);
    expect(r.state).toBe("COMPLETE"); expect(r.value).toBe("28");
  });
});

describe("BE-P21 case 8: legacy unproven input is unavailable, not zero", () => {
  const legacy = (id: string, amount = "14") => ({ evidence: "LEGACY_UNPROVEN", portal_fact_id: `TEST_ONLY:legacy-${id}`, physical_account_ref: "TEST_ONLY:phys", amount,
    currency: EXP.currency, basis: EXP.basis });
  it("legacy rows alone are UNAVAILABLE with no number", () => {
    const r = reduce([legacy("1"), legacy("2")]);
    expect(r.state).toBe("UNAVAILABLE"); expect(r.value).toBeNull(); expect(r.value).not.toBe("0"); expect(codes(r)).toEqual(["ECONOMIC_SOURCE_LEGACY_UNPROVEN"]);
    expect(r.economic_set_digest).toBeNull(); expect(r.sources).toEqual([]);
  });
  it("it is not account-only dedupe: two legacy rows on one physical account do not collapse to one, nor sum to two", () => {
    const r = reduce([legacy("1"), legacy("2")]);
    expect(r.value).toBeNull(); expect(r.collapsed_duplicate_count).toBe(0);
  });
  it("one unproven row makes the whole set unprovable; proven rows beside it are not summed or judged", () => {
    const r = reduce([A(), B(), legacy("1")]);
    expect(r.state).toBe("UNAVAILABLE"); expect(r.value).toBeNull();
  });
  it("proven rows with no published census are UNAVAILABLE", () => {
    const r = reduce([A(), B()], { census: null });
    expect(r.state).toBe("UNAVAILABLE"); expect(codes(r)).toEqual(["ECONOMIC_SOURCE_CENSUS_NOT_PUBLISHED"]);
  });
  it("a source id in a namespace nobody vouches for is not a trusted id (an empty trust policy trusts nothing: the dark default)", () => {
    const r = reduce([A(), B()], { trusted: [] });
    expect(r.state).toBe("UNAVAILABLE"); expect(r.value).toBeNull(); expect(codes(r)).toEqual(["ECONOMIC_SOURCE_ID_NOT_TRUSTED"]);
    expect(reduce([A(), row("b", ["l"], "1", { source_identity: { namespace: "TEST_ONLY:other-ns", source_id: "TEST_ONLY:src-b" } })]).state).toBe("UNAVAILABLE");
  });
  it("the same source id in two namespaces is two identities", () => {
    const r = reduce([A(), row("a", ["leaf-9"], "1", { source_identity: { namespace: "TEST_ONLY:ns-2", source_id: "TEST_ONLY:src-a" } })],
      { trusted: [NS, "TEST_ONLY:ns-2"], census: ["a"] });
    expect(r.state).toBe("REFUSED"); expect(codes(r)).toEqual(["ECONOMIC_SOURCE_OUTSIDE_CENSUS"]); // the second identity is not in the census; it was not merged into the first
  });
  it("a source outside the expected census is refused (it cannot be validated as part of the population)", () => {
    const r = reduce([A(), B(), row("c", ["leaf-4"], "1")]);
    expect(r.state).toBe("REFUSED"); expect(codes(r)).toEqual(["ECONOMIC_SOURCE_OUTSIDE_CENSUS"]);
  });
  it("unparseable input is a REFUSED verdict, not an exception; RETURN is not representable", () => {
    for (const bad of [null, "x", {}, { ...input([A(), B()]), extra: true }, { ...input([A(), B()]), expectation: { ...EXP, metric: "RETURN" } }]) {
      const r = reduceEconomicSource(bad);
      expect(r.state).toBe("REFUSED"); expect(r.value).toBeNull(); expect(codes(r)).toEqual(["ECONOMIC_SOURCE_INPUT_INVALID"]);
    }
  });
});

describe("BE-P21 case 9: reader / writer economic-set parity", () => {
  // Two thin callers of the ONE reducer, shaped like the future dataset reader and series writer. They are test doubles, not wiring.
  const readerCall = (facts: EconomicProvenRow[]) => reduceEconomicSource(input(facts));
  const writerCall = (revisions: EconomicProvenRow[][]) => reduceEconomicSource(input(revisions.flat()));
  it("a reader over the facts and a writer over three re-sent revisions in another order agree on the set, the digest and the value", () => {
    const facts = [A(), B()];
    const resent = (suffix: string) => [...facts].reverse().map(f => ({ ...f, portal_fact_id: `${f.portal_fact_id}-${suffix}` }));
    const reader = readerCall(facts), writer = writerCall([resent("r1"), resent("r2"), [...facts].reverse()]);
    expect(writer.state).toBe("COMPLETE");
    expect(writer.value).toBe(reader.value);
    expect(writer.economic_set_digest).toBe(reader.economic_set_digest);
    expect(writer.sources.map(s => [s.namespace, s.source_id, s.content_digest])).toEqual(reader.sources.map(s => [s.namespace, s.source_id, s.content_digest]));
    expect(writer.collapsed_duplicate_count).toBe(4); expect(reader.collapsed_duplicate_count).toBe(0);
  });
  it("they also agree when the answer is not a number: both see the same refusal / partial for the same set", () => {
    const conflict = [A(), { ...A(), amount: "99", portal_fact_id: "TEST_ONLY:fact-a-x" }, B()];
    expect(readerCall(conflict as EconomicProvenRow[])).toEqual(writerCall([conflict.slice().reverse() as EconomicProvenRow[]]));
    const partial = [readerCall([A()]), writerCall([[A()], [{ ...A(), portal_fact_id: "TEST_ONLY:again" }]])];
    expect(partial.map(r => r.state)).toEqual(["PARTIAL", "PARTIAL"]);
    expect(partial[1].economic_set_digest).toBe(partial[0].economic_set_digest); expect(partial[1].findings).toEqual(partial[0].findings);
  });
  it("a changed economic set changes the digest: a writer cannot store a point the reader would not serve", () => {
    const base = readerCall([A(), B()]).economic_set_digest;
    expect(readerCall([A(), row("b", ["leaf-3"], "15")]).economic_set_digest).not.toBe(base);
    expect(readerCall([A(), row("b", ["leaf-3", "leaf-4"], "14")]).economic_set_digest).not.toBe(base);
  });
});

describe("BE-P21 properties", () => {
  const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffle = <T,>(items: T[], next: () => number) => { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ids = ["a", "b", "c", "d", "e", "f"];
  const population = () => ids.flatMap(id => [row(id, [`leaf-${id}-1`, `leaf-${id}-2`], `${ids.indexOf(id) + 1}.5`),
    { ...row(id, [`leaf-${id}-2`, `leaf-${id}-1`], `${ids.indexOf(id) + 1}.50`), portal_fact_id: `TEST_ONLY:fact-${id}-dup` }]);

  it("is order independent for COMPLETE, PARTIAL, REFUSED and UNAVAILABLE inputs (byte-identical output)", () => {
    const next = rng(20261021);
    const scenarios: Array<[string, unknown[], Over]> = [
      ["COMPLETE", population(), { census: ids }], ["PARTIAL", population().slice(2), { census: ids }],
      ["REFUSED", [...population(), row("g", ["leaf-a-1"], "1")], { census: [...ids, "g"] }],
      ["UNAVAILABLE", [...population(), { evidence: "LEGACY_UNPROVEN", portal_fact_id: "TEST_ONLY:l", physical_account_ref: null, amount: "1", currency: null, basis: null }], { census: ids }],
    ];
    for (const [state, rows, over] of scenarios) {
      const reference = reduce(rows, over);
      expect(reference.state).toBe(state);
      for (let i = 0; i < 40; i++) expect(JSON.stringify(reduce(shuffle(rows, next), over))).toBe(JSON.stringify(reference));
    }
  });
  it("is idempotent: re-sending rows already present changes neither the verdict, the value, the set nor the audit list", () => {
    const rows = population(), once = reduce(rows, { census: ids }), twice = reduce([...rows, ...rows, ...rows], { census: ids });
    const { collapsed_duplicate_count: c1, ...rest1 } = once, { collapsed_duplicate_count: c3, ...rest3 } = twice;
    expect(rest3).toEqual(rest1);
    expect(c1).toBe(6); expect(c3).toBe(6 + 2 * 12);
    expect(once.value).toBe("24"); // 1.5+2.5+3.5+4.5+5.5+6.5
  });
  it("has no float drift: 1000 sources of 0.1000000000000000001 sum exactly; the 2^53+1 integer survives", () => {
    const many = Array.from({ length: 1_000 }, (_, i) => row(`m${i}`, [`leaf-m${i}`], "0.1000000000000000001"));
    const r = reduce(many, { census: many.map((_, i) => `m${i}`) });
    expect(r.state).toBe("COMPLETE"); expect(r.value).toBe(unscaled(1_000n * scaled("0.1000000000000000001"))); expect(r.value).toBe("100.0000000000000001");
    expect(0.1000000000000000001 * 1_000).toBe(100); // IEEE-754 loses the last digit entirely; the reducer does not
    expect(reduce([row("a", ["l1"], "9007199254740993"), row("b", ["l2"], "1")]).value).toBe("9007199254740994");
  });
  it("is pure: the input is not mutated and a second call returns an equal, independent value", () => {
    const original = input([A(), B()]), frozen = JSON.stringify(original);
    const first = reduceEconomicSource(original), second = reduceEconomicSource(original);
    expect(JSON.stringify(original)).toBe(frozen); expect(second).toEqual(first); expect(second).not.toBe(first);
  });
  it("bounds its findings and says so", () => {
    const many = Array.from({ length: 400 }, (_, i) => row(`o${i}`, [`leaf-o${i}`], "1", { currency: "TEST_ONLY:EUR" }));
    const r = reduce(many, { census: many.map((_, i) => `o${i}`) });
    expect(r.state).toBe("REFUSED"); expect(r.findings).toHaveLength(256); expect(r.findings_truncated).toBe(true);
  });
});

describe("BE-P21 contract: closed shapes, dark by construction", () => {
  it("every verdict the reducer emits satisfies the closed output schema", () => {
    for (const r of [reduce([A(), B()]), reduce([A()]), reduce([]), reduce([A(), B()], { census: null }), reduce([row("a", ["l"], "1"), row("b", ["l"], "1")])])
      expect(economicSourceReduction.safeParse(r).success).toBe(true);
  });
  it("the output schema refuses a number on anything but COMPLETE, and a COMPLETE without one", () => {
    const complete = reduce([A(), B()]), partial = reduce([A()]);
    expect(economicSourceReduction.safeParse({ ...partial, value: "0" }).success).toBe(false);
    expect(economicSourceReduction.safeParse({ ...complete, value: null }).success).toBe(false);
    expect(economicSourceReduction.safeParse({ ...partial, reason_codes: [] }).success).toBe(false);
    expect(economicSourceReduction.safeParse({ ...complete, surprise: 1 }).success).toBe(false);
  });
  it("the input schema is strict: unknown producer-style columns are refused, not ignored", () => {
    expect(economicSourceReductionInput.safeParse(input([A()])).success).toBe(true);
    expect(economicSourceReductionInput.safeParse(input([{ ...A(), account_id: "TEST_ONLY:x" }])).success).toBe(false);
    expect(economicProvenRow.safeParse({ ...A(), leaves: ["l", "l"] }).success).toBe(false);
    expect(economicProvenRow.safeParse({ ...A(), leaves: [] }).success).toBe(false);
    expect(economicProvenRow.safeParse({ ...A(), restatement: { relation: "CORRECTED", original_ref: null } }).success).toBe(false);
    expect(economicProvenRow.safeParse({ ...A(), restatement: { relation: "ORIGINAL", original_ref: "TEST_ONLY:o" } }).success).toBe(false);
    expect(economicProvenRow.safeParse({ ...A(), amount: "1e3" }).success).toBe(false);
    expect(economicProvenRow.safeParse({ ...A(), amount: 14 }).success).toBe(false);
  });
  it("is not wired: no other source file imports the contract or the reducer", () => {
    const root = resolve(__dirname, "../src"), hits: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(name) && !/manager-economic-source/.test(name) && /manager-economic-source/.test(readFileSync(p, "utf8"))) hits.push(p); } };
    walk(root);
    expect(hits).toEqual([]);
  });
  it("uses no float, no FX and no clock", () => {
    const code = readFileSync(resolve(__dirname, "../src/execution-v2/manager-economic-source-reducer.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/parseFloat|\bNumber\(|Math\.|toFixed|Date\.|performance\.|process\.env|fx_rate|carry/i);
  });
});
