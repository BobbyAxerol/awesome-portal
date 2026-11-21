/**
 * Conformance of `scopedRead.ts` / `scopedRefusal.ts` against the RV-12 canonical scoped fixtures (BE-P14, TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT):
 *
 * - `execution-manager-scoped.scenarios.synthetic.valid.json`: 7 scenarios, 9 pages, each the answer of the real `ScopedManagerReader`;
 * - `execution-manager-scoped.bounded.synthetic.valid.json`: the maximum page (100 of 101, one item at the 200-total bound);
 * - `execution-manager-scoped.refusals.synthetic.negative.json`: 20 schema mutations the reader must refuse and 15 runtime refusals
 *   (HTTP status + `error.code`) that map to typed outcomes, never by text.
 *
 * SS-4 is pinned here per kind: a row is keyed by the dataset's own identity (see `rowIdentity` in `scopedRead.ts`).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical } from "../../testkit/loadCanonical";
import { type Draft } from "../../testkit/matrix";
import { timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { MAX_SCOPED_TOTALS_PER_ITEM, readManagerScoped, type ScopedRead } from "./scopedRead";

const SCENARIOS = "execution-manager-scoped.scenarios.synthetic";
const BOUNDED = "execution-manager-scoped.bounded.synthetic";
const REFUSALS = "execution-manager-scoped.refusals.synthetic.negative.json";
const SCHEMA = "execution-manager-scoped.v1.schema.json";
const digests = [SCENARIOS, BOUNDED, REFUSALS].map((name) => [name, canonicalDigest(name)] as const);
afterAll(() => {
  for (const [name, digest] of digests) expect(canonicalDigest(name), name).toBe(digest);
});

const violations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/ManagerScopedResponse", value);
const scopedOf = (raw: unknown): ScopedRead | null => {
  const read = readManagerScoped(raw);
  return read !== null && read.kind === "scoped" ? read.read : null;
};

interface Scenario { id: string; level: string; covers: string[]; pages: { request: Draft; response: Draft }[] }
const scenarios = loadCanonical<{ lane: string; scenarios: Scenario[] }>(SCENARIOS);
const scenario = (id: string): Scenario => {
  const found = scenarios.scenarios.find((s) => s.id === id);
  if (found === undefined) throw new Error(`no scenario ${id}`);
  return found;
};
const page = (id: string, index = 0): Draft => structuredClone(scenario(id).pages[index]!.response);

describe("SS-4 · a row is keyed by its dataset's own identity (the reproduced defect)", () => {
  it("BINDINGS: two bindings of one environment are two rows (they were refused as one)", () => {
    const body = page("bindings-owner-live");
    expect(body.items.map((i: Draft) => i.environment)).toEqual(["live", "live"]);
    const read = scopedOf(body);
    expect(read).not.toBeNull();
    expect(read!.items.map((i) => i.identity.binding_id)).toEqual(["binding_TEST_ONLY_B1", "binding_TEST_ONLY_B2"]);
  });

  it("PORTFOLIOS: one portfolio in three environments is three rows; two portfolios of one environment are two", () => {
    const read = scopedOf(page("portfolios-owner-all"));
    expect(read!.items).toHaveLength(9);
  });

  it("the TRUE identity twice is still refused, for every kind", () => {
    const dup = (body: Draft, count = 1) => {
      body.items.push(structuredClone(body.items[0]));
      body.page.returned_count = body.items.length;
      body.page.visible_count = Math.max(body.page.visible_count, body.items.length);
      body.page.limit = Math.max(body.page.limit, body.items.length);
      return count === 1 ? body : body;
    };
    for (const id of ["bindings-owner-live", "portfolios-owner-all", "fleet-researcher-paper"]) {
      const body = dup(page(id));
      expect(violations(body), id).toEqual([]);
      expect(scopedOf(body), id).toBeNull();
    }
  });

  it("BINDING_DETAIL: one row; a second row of the same binding is refused", () => {
    const body = page("binding-detail-owner-live");
    expect(scopedOf(structuredClone(body))).not.toBeNull();
    body.items.push(structuredClone(body.items[0]));
    body.page.returned_count = 2;
    body.page.visible_count = 2;
    expect(scopedOf(body)).toBeNull();
  });

  it("the same binding in two environments is two rows; the same binding id twice in one environment is not", () => {
    const body = page("bindings-owner-live");
    body.items[1].environment = "paper";
    body.items[1].identity.binding_id = body.items[0].identity.binding_id;
    expect(scopedOf(structuredClone(body))).not.toBeNull();
    body.items[1].environment = "live";
    expect(scopedOf(body)).toBeNull();
  });

  it("a different binding_id does not make two ALPHA_FLEET rows of one alpha/version/portfolio distinct", () => {
    const body = page("fleet-researcher-all-denied-unavailable");
    body.items[1].identity = { ...body.items[0].identity, binding_id: "binding_TEST_ONLY_B9" };
    expect(scopedOf(body)).toBeNull();
  });
});

describe("L0 · the scenarios, all pages", () => {
  it("is the synthetic lane: 7 scenarios, 9 pages", () => {
    expect(scenarios.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(scenarios.scenarios).toHaveLength(7);
    expect(scenarios.scenarios.reduce((n, s) => n + s.pages.length, 0)).toBe(9);
  });

  const pages = scenarios.scenarios.flatMap((s) => s.pages.map((p, i) => [`${s.id} #${i + 1}`, s, p] as const));
  it.each(pages)("%s validates against the schema and reads", (_name, s, p) => {
    expect(violations(p.response)).toEqual([]);
    const read = scopedOf(structuredClone(p.response));
    expect(read).not.toBeNull();
    expect(read!.surface).toBe(p.response.surface);
    expect(read!.items).toHaveLength(p.response.items.length);
    expect(read!.page.visibleCount).toBe(p.response.page.visible_count);
    expect(s.pages.length).toBeGreaterThan(0);
  });

  it("surfaces covered: PORTFOLIOS, BINDINGS, BINDING_DETAIL and ALPHA_FLEET are all read", () => {
    const surfaces = new Set(scenarios.scenarios.flatMap((s) => s.pages.map((p) => scopedOf(p.response)!.surface)));
    expect([...surfaces].sort()).toEqual(["ALPHA_FLEET", "BINDINGS", "BINDING_DETAIL", "PORTFOLIOS"]);
  });

  it("the researcher page and the owner page keep their dispositions as published", () => {
    const read = scopedOf(page("fleet-researcher-all-pending-unrecorded"))!;
    expect(read.dispositions.map((d) => [d.environment, d.state, d.reasonCode])).toEqual([
      ["paper", "PARTIAL", "AUTHORIZED_RETAINED_FACTS"],
      ["sandbox", "DENIED", "EXECUTION_READ_POLICY_PENDING"],
      ["live", "UNAVAILABLE", "SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED"],
    ]);
  });
});

describe("L2 · the bounded fixture", () => {
  const bounded = loadCanonical<{ scenarios: Scenario[] }>(BOUNDED);
  const body = (): Draft => structuredClone(bounded.scenarios[0]!.pages[0]!.response);

  it("is one scenario of one page: 100 of 101, more exist, and it validates", () => {
    expect(bounded.scenarios).toHaveLength(1);
    expect(bounded.scenarios[0]!.pages).toHaveLength(1);
    expect(violations(body())).toEqual([]);
    expect(body().page).toMatchObject({ visible_count: 101, returned_count: 100, limit: 100, has_more: true });
  });

  it("reads inside a generous budget, keeps 100 rows and the 200-total item whole", () => {
    const { value, ms } = timed(() => scopedOf(body()));
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(3_000);
    expect(value!.items).toHaveLength(100);
    expect(value!.page).toMatchObject({ visibleCount: 101, returnedCount: 100, limit: 100, hasMore: true, hasNextCursor: true });
    expect(Math.max(...value!.items.map((i) => i.financialTotals.length))).toBe(MAX_SCOPED_TOTALS_PER_ITEM);
  });
});

describe("L3 · the 20 schema mutations", () => {
  interface Mutation { id: string; rule: string; refused_by: "SCHEMA_AND_PRODUCER" | "PRODUCER_ONLY"; ops: { op: "set"; path: (string | number)[]; value: unknown }[] }
  const file = loadCanonical<{ base: string; mutations: Mutation[] }>(REFUSALS);
  const apply = (m: Mutation): Draft => {
    const body = page("fleet-researcher-paper");
    for (const { path, value } of m.ops) {
      let node = body;
      for (const step of path.slice(0, -1)) node = node[step];
      node[path[path.length - 1]!] = value;
    }
    return body;
  };

  it("there are 20, in two named groups", () => {
    expect(file.mutations).toHaveLength(20);
    expect(file.mutations.filter((m) => m.refused_by === "PRODUCER_ONLY").map((m) => m.id).sort()).toEqual([
      "has-more-without-cursor", "no-dispositions", "returned-count-above-items",
    ]);
  });

  it.each(file.mutations.map((m) => [m.id, m] as const))("%s is refused by the reader", (_id, m) => {
    const body = apply(m);
    expect(() => readManagerScoped(body)).not.toThrow();
    // A different schema version reads as the typed `unsupported_shape`; every other mutation reads as nothing. Neither is a scoped read.
    expect(scopedOf(body)).toBeNull();
    // Never looser than the schema: what the schema refuses, the reader refuses. The PRODUCER_ONLY ones are the schema's recorded gaps.
    if (m.refused_by === "SCHEMA_AND_PRODUCER") expect(violations(body).length).toBeGreaterThan(0);
    else expect(violations(body)).toEqual([]);
  });

  it("every schema-refused mutation is refused by the reader (looser = 0)", () => {
    const looser = file.mutations.filter((m) => violations(apply(m)).length > 0 && scopedOf(apply(m)) !== null);
    expect(looser.map((m) => m.id)).toEqual([]);
  });
});
