/**
 * The testkit checks itself: a generator that silently produced nothing, or
 * edited L0, would make every conformance suite built on it vacuous.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalText, listCanonical, loadCanonical, loadSchema, schemaEnum } from "./loadCanonical";
import { ABSENT, cartesian, coverage, dimension, dimensionOf, getPath, pairwise, setPath, withPath } from "./matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases,
  stringCases,
} from "./negative";
import { cloneRows, cursorFilter, fillToBytes, keysetCursor, MIB, serializedBytes, splitIntoPages } from "./scale";
import { validateAgainst } from "./schema";

describe("loadCanonical", () => {
  it("lists and parses every published canonical fixture, each load a fresh copy", () => {
    const files = listCanonical();
    expect(files.length).toBeGreaterThan(80);
    for (const file of files) {
      expect(() => loadCanonical(file), file).not.toThrow();
    }
    const a = loadCanonical<Record<string, unknown>>(files[0]!);
    a.__touched = true;
    expect(loadCanonical<Record<string, unknown>>(files[0]!).__touched).toBeUndefined();
  });

  it("digests are stable and the file text is what the loader parses", () => {
    const name = "execution-alpha-fleet-list.v2";
    expect(canonicalDigest(name)).toBe(canonicalDigest(`${name}.valid.json`));
    expect(JSON.parse(canonicalText(name))).toEqual(loadCanonical(name));
    expect(() => loadCanonical("no-such-fixture")).toThrow();
  });

  it("reads schemas and their enums", () => {
    expect(loadSchema("execution-alpha-fleet-list.v2").$ref).toBe("#/$defs/AlphaFleetResponse");
    expect(schemaEnum("execution-alpha-fleet-list.v2", "/$defs/AlphaFleetResponse/properties/freshness")).toEqual(["FRESH", "AGING", "STALE"]);
    expect(() => schemaEnum("execution-alpha-fleet-list.v2", "/$defs/Nope")).toThrow();
  });
});

describe("schema checker", () => {
  const SCHEMA = "execution-alpha-fleet-list.v2";
  it("accepts the canonical and names each kind of violation", () => {
    const ok = loadCanonical<Record<string, any>>(SCHEMA);
    expect(validateAgainst(SCHEMA, "", ok)).toEqual([]);
    const wrongEnum = withPath(ok, ["freshness"], "STALEISH");
    expect(validateAgainst(SCHEMA, "", wrongEnum).join()).toMatch(/freshness/);
    const extra = withPath(ok, ["page", "surprise"], 1);
    expect(validateAgainst(SCHEMA, "", extra).join()).toMatch(/surprise: not allowed/);
    expect(validateAgainst(SCHEMA, "", withPath(ok, ["page", "rows"], new Array(51).fill(ok.page.rows[0]))).join()).toMatch(/more than 50/);
    expect(validateAgainst(SCHEMA, "", withPath(ok, ["summary", "alpha_count"], -1)).join()).toMatch(/below 0/);
    expect(validateAgainst(SCHEMA, "", withPath(ok, ["page", "rows", 0, "deployments", 0, "net_pnl"], "1e5")).join()).toMatch(/pattern/);
  });

  it("applies prefixItems, not, allOf/if/then/else and contains, which the operations schema relies on", () => {
    const OPS = "execution-operations.v1";
    const queue = loadCanonical<Record<string, any>>("execution-operational-queue-links-counts.synthetic").queue;
    const check = (ptr: string, value: unknown) => validateAgainst(OPS, ptr, value).join();
    // prefixItems + items:false (a fixed three-word tuple)
    expect(check("/$defs/OperationalQueueV2", queue)).toBe("");
    expect(check("/$defs/OperationalQueueV2", withPath(queue, ["supported_target_types"], ["ACCOUNT", "DEPLOYMENT", "PORTFOLIO"]))).toMatch(/supported_target_types\[1\]/);
    expect(check("/$defs/OperationalQueueV2", withPath(queue, ["supported_target_types"], ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT"]))).toMatch(/more than 3 items/);
    // allOf + if/then/else (a NOT_PUBLISHED panel pages nothing; has_more needs a cursor and no more means none)
    const live = loadCanonical<Record<string, any>>("execution-live-source.synthetic").populated;
    const cursor = `lps2.a.00000001.1234567890.${"A".repeat(43)}`;
    expect(check("/$defs/LiveSourceOperationsReadV2", live)).toBe("");
    expect(check("/$defs/LiveSourceOperationsReadV2", withPath(live, ["data", "orders", "has_more"], true))).toMatch(/orders\.next_cursor/);
    expect(check("/$defs/LiveSourceOperationsReadV2", withPath(live, ["data", "orders", "next_cursor"], cursor))).toMatch(/orders\.next_cursor/);
    expect(check("/$defs/LiveSourceOperationsReadV2", withPath(live, ["data", "broker_sync", "returned_count"], 1))).not.toBe("");
    // not (an id may not carry a control character)
    expect(check("/$defs/LiveSourceOperationsReadV2", withPath(live, ["workspace_id"], "a\u0007b"))).toMatch(/forbidden/);
    // contains / minContains / maxContains (each of the seven steps exactly once)
    const sandbox = loadCanonical<Record<string, any>>("execution-positive-parent.synthetic").sandbox;
    expect(check("/$defs/SandboxParentReadV2", sandbox)).toBe("");
    const doubled = withPath(sandbox, ["steps", "items", 1, "step_key"], "CONNECT");
    // The contains rules sit inside a oneOf branch, so the checker reports the branch that matched none.
    expect(check("/$defs/SandboxParentReadV2", doubled)).toMatch(/matched 0 oneOf branches/);
  });

  it("is not fooled by planted prototype keys", () => {
    const [planted] = pollutionCases(loadCanonical(SCHEMA), [[]]);
    expect(validateAgainst(SCHEMA, "", planted!.value).join()).toMatch(/not allowed/);
  });

  describe("maxProperties", () => {
    // The canary control room's free row: `{type: object, maxProperties: 80}` inside `UnavailableCollection.rows`.
    const CANARY = "execution-canary-control-room.v1";
    const COLLECTION = "/$defs/UnavailableCollection";
    const wide = (members: number): Record<string, string> => Object.fromEntries(Array.from({ length: members }, (_, i) => [`k${i}`, "v"]));
    const collection = (row: unknown) => {
      const body = loadCanonical<Record<string, any>>("execution-canary-control-room.unavailable");
      return { ...body.positions, returned_count: 1, rows: [row] };
    };

    it("accepts exactly the bound and names the object that is one over", () => {
      expect(validateAgainst(CANARY, COLLECTION, collection(wide(80)))).toEqual([]);
      expect(validateAgainst(CANARY, COLLECTION, collection(wide(81))).join()).toMatch(/\$\.rows\[0\]: more than 80 properties/);
    });

    it("counts members whatever their values are (an empty object is within any bound, null members still count)", () => {
      expect(validateAgainst(CANARY, COLLECTION, collection({}))).toEqual([]);
      expect(validateAgainst(CANARY, COLLECTION, collection(Object.fromEntries(Array.from({ length: 81 }, (_, i) => [`k${i}`, null])))).join()).toMatch(/more than 80 properties/);
    });

    it("applies to a nullable object only when it is an object (null is the other branch of `type`)", () => {
      const envelope = loadCanonical<Record<string, any>>("execution-canary-control-room.unavailable").source_panels[0];
      expect(validateAgainst(CANARY, "/$defs/SourceEnvelope", envelope)).toEqual([]);
      // `data` is `{type: [object, null], maxProperties: 16}`: the panel is `unavailable`, so the if/then pins data to null;
      // a 17-member object is refused by the bound and by the pin, a null is refused by neither.
      const lit = { ...envelope, data: wide(17) };
      expect(validateAgainst(CANARY, "/$defs/SourceEnvelope", lit).join()).toMatch(/\$\.data: more than 16 properties/);
    });
  });

  describe("propertyNames", () => {
    // The manager dataset's row metrics: member NAMES are a closed enum, member VALUES are metric objects.
    const OPENAPI = "../openapi/execution-manager-models.openapi.json";
    const METRICS = "/components/schemas/ManagerDataset/properties/items/items/properties/metrics";
    const metric = loadCanonical<Record<string, any>>("execution-manager-dataset.rows.synthetic").value.items[0].metrics.net_pnl;

    it("accepts a name inside the enum and refuses one outside it, naming the member", () => {
      expect(validateAgainst(OPENAPI, METRICS, { net_pnl: metric })).toEqual([]);
      const refused = validateAgainst(OPENAPI, METRICS, { net_pnl: metric, not_a_metric: metric });
      expect(refused.join()).toMatch(/\$\.not_a_metric: property name refused/);
      expect(refused.join()).not.toMatch(/net_pnl: property name/);
    });

    it("judges the NAME as a string instance, so type, pattern and length of the name apply too", () => {
      // A name is not looked up in `properties`; it is validated against the subschema even when `additionalProperties` accepts the member.
      expect(validateAgainst(OPENAPI, METRICS, { "": metric }).join()).toMatch(/property name refused/);
      expect(validateAgainst(OPENAPI, METRICS, {})).toEqual([]);
    });

    it("does not read propertyNames on an array or a scalar", () => {
      expect(validateAgainst(OPENAPI, METRICS, []).join()).toMatch(/expected object/);
      expect(validateAgainst(OPENAPI, METRICS, "net_pnl").join()).toMatch(/expected object/);
    });
  });

  describe("discriminator", () => {
    it("is an annotation: a document that carries it is read, and the oneOf branches still decide", () => {
      const OPENAPI = "../openapi/execution-access.openapi.json";
      const selector = "/components/schemas/AccessSelector";
      expect(() => validateAgainst(OPENAPI, selector, { kind: "no-such-kind" })).not.toThrow();
      expect(validateAgainst(OPENAPI, selector, { kind: "no-such-kind" }).join()).toMatch(/matched 0 oneOf branches/);
    });
  });

  describe("dependentRequired", () => {
    // JSON Schema 2020-12 section 10.2.2.4, exercised on a scratch schema so the semantics are pinned independently of any published document.
    const run = (schema: Record<string, unknown>, value: unknown): string[] => {
      const dir = mkdtempSync(join(tmpdir(), "testkit-dependent-required-"));
      try {
        const file = join(dir, "dep.schema.json");
        writeFileSync(file, JSON.stringify(schema));
        return validateAgainst(file, "", value);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const schema = { type: "object", dependentRequired: { credit_card: ["billing_address"], billing_address: [] } };

    it("requires the listed members only when the trigger member is present", () => {
      expect(run(schema, {})).toEqual([]);
      expect(run(schema, { billing_address: "x" })).toEqual([]);
      expect(run(schema, { credit_card: 1, billing_address: "x" })).toEqual([]);
      expect(run(schema, { credit_card: 1 }).join()).toMatch(/\$\.billing_address: required when credit_card is present/);
    });

    it("counts a present member whose value is null (or falsy) as present, and does not inspect the value", () => {
      expect(run(schema, { credit_card: null, billing_address: null })).toEqual([]);
      expect(run(schema, { credit_card: 0, billing_address: "" })).toEqual([]);
      expect(run(schema, { credit_card: null }).join()).toMatch(/billing_address: required/);
    });

    it("is silent for an inherited name, an array and a scalar (only an own member of an object triggers it)", () => {
      expect(run({ dependentRequired: { toString: ["x"] } }, {})).toEqual([]);
      expect(run({ dependentRequired: { a: ["b"] } }, ["a"])).toEqual([]);
      expect(run({ dependentRequired: { a: ["b"] } }, "a")).toEqual([]);
    });

    it("refuses a map whose list is not an array rather than passing everything", () => {
      expect(() => run({ type: "object", dependentRequired: { a: "b" } }, { a: 1 })).toThrow(/dependentRequired\.a must be an array/);
    });

    it("is applied to the published identity rules: the five keys travel together", () => {
      const PAPER = "execution-paper-read.v1";
      const RULES = "/$defs/DeploymentIdentityRules";
      const together = { alpha_id: null, alpha_name: null, portfolio_name: null, alpha_reason_code: "ALPHA_MEMBERSHIP_NOT_QUALIFIED", portfolio_name_reason_code: "PORTFOLIO_NOT_ASSIGNED" };
      expect(validateAgainst(PAPER, RULES, {})).toEqual([]);
      const { alpha_id: _drop, ...partial } = together;
      expect(validateAgainst(PAPER, RULES, partial).join()).toMatch(/\$\.alpha_id: required when alpha_name is present/);
    });
  });

  describe("minProperties", () => {
    it("requires at least that many own members (null members count)", () => {
      const ENVELOPE = "execution-paper-read.v1";
      const QUERY = "/$defs/QueryAnalytics";
      expect(validateAgainst(ENVELOPE, QUERY, {})).toEqual(expect.arrayContaining([expect.stringMatching(/fewer than 1 properties/)]));
      expect(validateAgainst(ENVELOPE, QUERY, { a: null })).toEqual([]);
    });
  });

  it("still refuses a keyword it does not know, so a schema that grows one cannot pass everything", () => {
    // `unevaluatedProperties` is a real JSON Schema keyword the checker deliberately does not interpret (it needs annotation collection).
    const dir = mkdtempSync(join(tmpdir(), "testkit-unknown-keyword-"));
    try {
      const file = join(dir, "unknown.schema.json");
      writeFileSync(file, JSON.stringify({ type: "object", unevaluatedProperties: false }));
      expect(() => validateAgainst(file, "", {})).toThrow(/schema keyword not supported by the testkit checker: unevaluatedProperties/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("matrix", () => {
  const base = { a: "x", b: "y", c: "z", nested: { d: 0 } };
  const dims = [dimension("a", ["a"], ["1", "2", "3"]), dimension("b", ["b"], ["1", "2", "3"]), dimension("c", ["c"], ["1", "2", "3", ABSENT]), dimension("d", ["nested", "d"], [0, 1])];

  it("cartesian multiplies, names are unique and stable, the base is untouched", () => {
    const all = cartesian(base, dims);
    expect(all).toHaveLength(3 * 3 * 4 * 2);
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length);
    expect(all[0]!.name).toBe("a=1 b=1 c=1 d=0");
    expect(base).toEqual({ a: "x", b: "y", c: "z", nested: { d: 0 } });
    expect(all.find((s) => s.picks.c === "absent")!.value).not.toHaveProperty("c");
  });

  it("pairwise covers every pair with far fewer states, and an exclusion shrinks what must be covered", () => {
    const pairs = pairwise(base, dims);
    const c = coverage(dims, pairs);
    expect(c.pairsCovered).toBe(c.pairsPossible);
    expect(pairs.length).toBeLessThan(cartesian(base, dims).length / 2);
    const exclude = (p: Readonly<Record<string, string>>) => p.a === "1" && p.b === "1";
    const some = pairwise(base, dims, { exclude });
    expect(some.every((s) => !(s.picks.a === "1" && s.picks.b === "1"))).toBe(true);
    const cover = coverage(dims, some, { exclude });
    expect(cover.pairsCovered).toBe(cover.pairsPossible);
    expect(cover.cartesianValid).toBeLessThan(cover.cartesianRaw);
  });

  it("refuses a matrix too large to enumerate rather than running for minutes", () => {
    const wide = Array.from({ length: 8 }, (_, i) => dimension(`x${i}`, ["a"], ["1", "2", "3", "4", "5", "6", "7", "8"]));
    expect(() => cartesian(base, wide)).toThrow(/too large/);
  });

  it("custom axes move several fields together", () => {
    const both = dimensionOf("pair", [{ label: "p", apply: (d: any) => { d.a = "p"; d.b = "p"; } }]);
    expect(cartesian(base, [both])[0]!.value).toMatchObject({ a: "p", b: "p" });
  });

  it("paths: get, set, remove, and a missing parent is a loud error", () => {
    const o = { x: [{ y: 1 }] };
    expect(getPath(o, ["x", 0, "y"])).toBe(1);
    expect(getPath(o, ["x", 3, "y"])).toBeUndefined();
    setPath(o, ["x", 0, "y"], ABSENT);
    expect(o.x[0]).toEqual({});
    expect(() => setPath(o, ["nope", "y"], 1)).toThrow();
    expect(withPath(o, ["x", 0, "z"], 2).x[0]).toEqual({ z: 2 });
    expect(o.x[0]).toEqual({});
  });
});

describe("scale", () => {
  it("clones with unique ids and leaves the template alone", () => {
    const template = { id: "t", nested: { n: 1 } };
    const rows = cloneRows(template, 200, (r, i) => { r.id = `r${i}`; });
    expect(new Set(rows.map((r) => r.id)).size).toBe(200);
    rows[0]!.nested.n = 99;
    expect(rows[1]!.nested.n).toBe(1);
    expect(template.nested.n).toBe(1);
  });

  it("splits into keyset pages whose cursors chain and are bound to the filter", () => {
    const rows = cloneRows({ id: "" }, 200, (r, i) => { r.id = `r${i}`; });
    const { pages, cursors } = splitIntoPages(rows, 50, "f1", (r) => r.id, (slice, info) => ({ n: slice.length, ...info }));
    expect(pages.map((p) => p.n)).toEqual([50, 50, 50, 50]);
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, true, false]);
    expect(pages.map((p) => p.hasPrevious)).toEqual([false, true, true, true]);
    expect(pages[3]!.nextCursor).toBeNull();
    expect(cursors).toHaveLength(3);
    expect(cursors.every((c) => cursorFilter(c) === "f1")).toBe(true);
    expect(keysetCursor("f1", "r49")).toBe(cursors[0]);
    expect(keysetCursor("f2", "r49")).not.toBe(cursors[0]);
    expect(cursorFilter("not a cursor")).toBeNull();
    expect(splitIntoPages([], 50, "f", () => "", (s, i) => ({ s, i })).pages).toHaveLength(1);
  });

  it("fillToBytes reaches the target and returns the smallest factor that does", () => {
    const build = (factor: number) => ({ text: "x".repeat(factor * 1000) });
    const { value, factor, bytes } = fillToBytes(build, MIB, 4096);
    expect(bytes).toBeGreaterThanOrEqual(MIB);
    expect(serializedBytes(build(factor - 1))).toBeLessThan(MIB);
    expect(serializedBytes(value)).toBe(bytes);
    expect(() => fillToBytes(build, MIB, 4)).toThrow();
    expect(serializedBytes("é")).toBe(4);
  });
});

describe("negative generators", () => {
  const base = { dec: "1.5", word: "READY", n: 3, text: "abc", list: [{ id: "a", v: 1 }, { id: "b", v: 2 }], version: "x.v1", nested: { k: "v" } };

  it("every case is a changed copy, the base is untouched, names are unique per generator", () => {
    const snapshot = structuredClone(base);
    const sets = {
      decimal: decimalCases(base, ["dec"]),
      enum: enumCases(base, ["word"], ["READY", "DONE"]),
      required: requiredCases(base, [["dec"], ["word"]]),
      integer: integerCases(base, ["n"]),
      string: stringCases(base, ["text"]),
      array: arrayCases(base, ["list"], { idKey: "id" }),
      version: schemaVersionCases(base, ["version"], "x.v1", ["x.v0"]),
      pollution: pollutionCases(base, [[], ["nested"]]),
      roots: rootCases(),
    };
    expect(base).toEqual(snapshot);
    for (const [label, cases] of Object.entries(sets)) {
      expect(cases.length, label).toBeGreaterThan(3);
      expect(new Set(cases.map((c) => c.name)).size, label).toBe(cases.length);
      if (label !== "roots") for (const c of cases) expect(c.value, c.name).not.toStrictEqual(base);
    }
    console.info(`testkit L3 generators: ${Object.entries(sets).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
  });

  it("covers the named categories", () => {
    const categories = new Set([
      ...decimalCases(base, ["dec"]), ...enumCases(base, ["word"], ["READY"]), ...requiredCases(base, [["dec"]]), ...integerCases(base, ["n"]),
      ...stringCases(base, ["text"]), ...arrayCases(base, ["list"], { idKey: "id" }), ...schemaVersionCases(base, ["version"], "x.v1", ["x.v0"]),
      ...pollutionCases(base, [[]]), ...rootCases(),
    ].map((c) => c.category));
    for (const wanted of ["wrong-type", "number-as-decimal", "exponent", "negative-zero", "malformed-decimal", "unknown-enum", "missing-required",
      "null-vs-absent", "duplicate-id", "schema-swapped", "truncated", "huge-string", "prototype-pollution", "bad-integer", "bad-root"]) {
      expect(categories.has(wanted as never), wanted).toBe(true);
    }
  });

  it("plants a real own __proto__ key without touching the shared prototype", () => {
    const [first] = pollutionCases(base, [[]]);
    expect(Object.getOwnPropertyNames(first!.value)).toContain("__proto__");
    expect(prototypeIsClean()).toBe(true);
    expect(leaked({ a: "x polluted_by_testkit y" }, first!.probe)).toBe(true);
    expect(leaked({ a: "clean" }, first!.probe)).toBe(false);
    expect(leaked(12n, "12")).toBe(true);
  });

  it("number cases really are numbers and exponent cases really are strings", () => {
    const cases = decimalCases(base, ["dec"]);
    expect(cases.filter((c) => c.category === "number-as-decimal").every((c) => typeof (c.value as typeof base).dec === "number" || typeof (c.value as { dec: unknown }).dec === "bigint")).toBe(true);
    expect(cases.filter((c) => c.category === "exponent").every((c) => typeof (c.value as typeof base).dec === "string" && /e/i.test((c.value as typeof base).dec))).toBe(true);
  });
});

describe("testkit hygiene (the same rules the product scans apply to these files)", () => {
  const files = readdirSync(__dirname).filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name));
  it("scans the generators", () => {
    expect(files.sort()).toEqual(["loadCanonical.ts", "matrix.ts", "negative.ts", "scale.ts", "schema.ts"]);
  });
  it.each(files)("%s has no fixture-producer import, no cast name, no dash character", (file) => {
    const text = readFileSync(join(__dirname, file), "utf8");
    expect(text).not.toMatch(/from "[^"]*\.(fixtures|smoke)"/);
    expect(text).not.toMatch(/createFixtureApi|CC_FIXTURES/);
    expect(text).not.toMatch(/"(Carry v3\.2|VnMomo v0\.9|Grid v2\.1|dep_88|dep_77|dep_74|AP-201|AP-352|av_2041|EX-771|inc_fixture_44)"/);
    expect(text).not.toMatch(/—|–/);
    expect(text).not.toMatch(/(\?\?|\?)\s*"(N\/A|n\/a)"/);
  });
});
