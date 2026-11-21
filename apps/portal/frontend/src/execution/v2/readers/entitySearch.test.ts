/** WP-K slice 7: the strict entity search reader, judged against the canonical fixtures and the published JSON Schema. */
import { describe, expect, it } from "vitest";
import { loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";
import { entitySearchAnswers, entitySearchPath, readEntitySearchV1 } from "./entitySearch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const SCHEMA = "execution-entity-search.v1.schema.json";
const body = (name: string): Draft => structuredClone(loadCanonical<{ value: Draft }>(`execution-entity-search.${name}.synthetic.valid.json`).value);

describe("fixtures", () => {
  it.each(["hit", "none", "not-commissioned"])("%s passes the schema and the reader", (name) => {
    expect(validateAgainst(SCHEMA, "", body(name))).toEqual([]);
    expect(readEntitySearchV1(body(name))?.kind).toBe("entity_search");
  });
  it("keeps a counted zero, an uncounted group and a group with rows apart; answers only the text asked", () => {
    const search = (readEntitySearchV1(body("hit")) as Draft).search;
    expect(search.groups.map((g: Draft) => [g.kind, g.totalMatched, g.rows.length])).toEqual([["alpha", 4, 2], ["portfolio", 0, 0], ["operation", null, 1]]);
    expect(search.groups[0].rows[0]).toEqual({ kind: "alpha", id: "TEST_ONLY:alpha-a", label: "Carry A", detail: "v2 · Canary", routeHint: "/deployments/alphas/TEST_ONLY%3Aalpha-a" });
    expect(entitySearchAnswers(search, "carry")).toBe(true);
    expect(entitySearchAnswers(search, "other")).toBe(false);
  });
  it("reads a NOT_COMMISSIONED group as its own state: a null count and no rows, never a counted zero", () => {
    const search = (readEntitySearchV1(body("not-commissioned")) as Draft).search;
    expect(search.groups).toHaveLength(6);
    for (const g of search.groups) expect(g).toMatchObject({ totalMatched: null, rows: [], notCommissioned: true });
    const answered = (readEntitySearchV1(body("none")) as Draft).search;
    for (const g of answered.groups) expect(g.notCommissioned).toBeUndefined();
  });
  it("builds a safe path", () => {
    expect(entitySearchPath({ q: " carry ", kinds: ["alpha", "portfolio"], limit: 8 })).toBe("/search?q=carry&kinds=alpha%2Cportfolio&limit=8");
    expect(entitySearchPath({ q: "" })).toBeNull();
    expect(entitySearchPath({ q: "x", limit: 0 })).toBeNull();
    expect(entitySearchPath({ q: "x", kinds: ["alpha", "alpha"] })).toBeNull();
  });
});

describe("refusals", () => {
  const rule = loadCanonical<Draft>("execution-entity-search.synthetic.negative.json");
  it.each(rule.cases.map((c: Draft): [string, Draft] => [c.id, c]) as [string, Draft][])("%s (schema and reader)", (_id: string, c: Draft) => {
    const draft = structuredClone(loadCanonical<{ value: Draft }>(rule.bases[c.base]).value);
    for (const op of c.ops) {
      const holder = op.path.slice(0, -1).reduce((node: Draft, key: string | number) => node[key], draft);
      if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
    }
    expect(validateAgainst(SCHEMA, "", draft).length).toBeGreaterThan(0);
    expect(readEntitySearchV1(draft)).toBeNull();
  });
  it("ES-1 a row of another kind, ES-2 a group outside the asked kinds or twice, ES-3 more rows than the limit, a count below its rows, another schema", () => {
    const kind = body("hit"); kind.groups[0].rows[0].kind = "portfolio";
    expect(readEntitySearchV1(kind)).toBeNull();
    const outside = body("hit"); outside.query.kinds = ["alpha"];
    expect(readEntitySearchV1(outside)).toBeNull();
    const twice = body("hit"); twice.groups[1].kind = "alpha";
    expect(readEntitySearchV1(twice)).toBeNull();
    const limit = body("hit"); limit.query.limit = 1;
    expect(readEntitySearchV1(limit)).toBeNull();
    const below = body("hit"); below.groups[0].total_matched = 1;
    expect(readEntitySearchV1(below)).toBeNull();
    expect(readEntitySearchV1({ schema_version: "portal.execution.entity-search.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.entity-search.v2" });
    expect(readEntitySearchV1(null)).toBeNull();
  });
});
