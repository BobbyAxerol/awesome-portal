/**
 * Reader conformance (Rules 9.8.3, L0 to L3) for the PAGE CHAIN of `portal.execution.manager-scoped.v1`: `page.has_more`,
 * `page.next_cursor`, `page.previous_cursor` of the three pages of RV-12 `fleet-owner-paper-chain` (BE-P14,
 * TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT). The schema (`$defs/ManagerScopedResponse`) is the oracle:
 *
 * - a cursor is `null` or a string of 1..4096 characters matching `^[A-Za-z0-9._-]+$` (no trailing newline); `has_more` is a boolean;
 * - the reader NEVER accepts what the schema refuses (looser = 0);
 * - where the reader refuses something the schema accepts, it is the one named rule SS-2 (`has_more` is true exactly when `next_cursor`
 *   is present; the schema's own description says the runtime enforces it) and nothing else;
 * - the reader's output carries only whether a cursor exists, never its text.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical } from "../../testkit/loadCanonical";
import { cartesian, dimensionOf, type Draft } from "../../testkit/matrix";
import { timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { MAX_SCOPED_CURSOR_TEXT, readManagerScoped, type ScopedRead } from "./scopedRead";

const FILE = "execution-manager-scoped.scenarios.synthetic";
const SCHEMA = "execution-manager-scoped.v1.schema.json";
const digest = canonicalDigest(FILE);
afterAll(() => expect(canonicalDigest(FILE)).toBe(digest));

interface Scenario { id: string; pages: { request: Draft; response: Draft }[] }
const CHAIN: Draft[] = loadCanonical<{ scenarios: Scenario[] }>(FILE).scenarios.find((s) => s.id === "fleet-owner-paper-chain")!.pages.map((p) => p.response);
const page = (index: number): Draft => structuredClone(CHAIN[index]);
const violations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/ManagerScopedResponse", value);
const scopedOf = (raw: unknown): ScopedRead | null => {
  const read = readManagerScoped(raw);
  return read !== null && read.kind === "scoped" ? read.read : null;
};
const schemaAccepts = (value: unknown) => violations(value).length === 0;

/** What the schema accepts for the page keys, plus SS-2 (the one rule the reader adds on this surface). */
const readerShouldAccept = (body: Draft): boolean => schemaAccepts(body) && body.page.has_more === (body.page.next_cursor !== null);

describe("L0 · the chain, verbatim", () => {
  it("is 3 pages of one query: 1 row each, 3 visible, has_more true, true, false", () => {
    expect(CHAIN).toHaveLength(3);
    expect(CHAIN.map((p) => [p.page.returned_count, p.page.visible_count, p.page.limit, p.page.has_more])).toEqual([[1, 3, 1, true], [1, 3, 1, true], [1, 3, 1, false]]);
  });

  it.each([0, 1, 2])("page %i validates against the schema and reads", (i) => {
    expect(violations(CHAIN[i])).toEqual([]);
    expect(scopedOf(page(i))).not.toBeNull();
  });

  it("each page says only whether a next / previous page exists", () => {
    expect(CHAIN.map((_p, i) => scopedOf(page(i))!.page)).toEqual([
      { visibleCount: 3, returnedCount: 1, limit: 1, hasMore: true, hasNextCursor: true, hasPreviousCursor: false },
      { visibleCount: 3, returnedCount: 1, limit: 1, hasMore: true, hasNextCursor: true, hasPreviousCursor: true },
      { visibleCount: 3, returnedCount: 1, limit: 1, hasMore: false, hasNextCursor: false, hasPreviousCursor: true },
    ]);
  });

  it("the cursor text is in no field of the read", () => {
    for (let i = 0; i < CHAIN.length; i += 1) {
      const text = JSON.stringify(scopedOf(page(i)));
      expect(text).not.toContain("kc1.");
      for (const key of ["next_cursor", "previous_cursor"]) if (CHAIN[i].page[key] !== null) expect(text).not.toContain(CHAIN[i].page[key]);
    }
  });

  it("the cursors of the chain are all distinct and each is a published, schema-valid string", () => {
    const cursors = CHAIN.flatMap((p) => [p.page.next_cursor, p.page.previous_cursor]).filter((c) => c !== null);
    expect(new Set(cursors).size).toBe(cursors.length);
    expect(cursors).toHaveLength(4);
  });
});

describe("L1 · matrix · has_more x next_cursor x previous_cursor (on each page of the chain)", () => {
  const VALID = "TEST_ONLY-cursor.1_x";
  const DIMS = [
    dimensionOf("has_more", [true, false].map((v) => ({ label: String(v), apply: (d: Draft) => { d.page.has_more = v; } }))),
    dimensionOf("next_cursor", [null, VALID, CHAIN[0].page.next_cursor].map((v) => ({ label: v === null ? "null" : v === VALID ? "valid" : "chain", apply: (d: Draft) => { d.page.next_cursor = v; } }))),
    dimensionOf("previous_cursor", [null, VALID, CHAIN[1].page.previous_cursor].map((v) => ({ label: v === null ? "null" : v === VALID ? "valid" : "chain", apply: (d: Draft) => { d.page.previous_cursor = v; } }))),
  ];
  for (const index of [0, 1, 2]) {
    const states = cartesian(page(index), DIMS);
    it(`page ${index + 1}: ${states.length} states, the reader accepts exactly where schema + SS-2 accept`, () => {
      expect(states).toHaveLength(2 * 3 * 3);
      for (const state of states) {
        expect(scopedOf(structuredClone(state.value)) !== null, state.name).toBe(readerShouldAccept(state.value));
        // Every one of these is schema-valid: the cursor rules are the pattern and the length, nothing else.
        expect(violations(state.value), state.name).toEqual([]);
        const read = scopedOf(structuredClone(state.value));
        if (read !== null) {
          expect(read.page.hasNextCursor, state.name).toBe(state.value.page.next_cursor !== null);
          expect(read.page.hasPreviousCursor, state.name).toBe(state.value.page.previous_cursor !== null);
          expect(read.page.hasMore, state.name).toBe(read.page.hasNextCursor);
        }
      }
    });
  }
});

describe("L2 · bounds and scale", () => {
  const cursorOf = (length: number, ch = "a") => ch.repeat(length);
  it("a cursor of 4096 characters is read, 4097 is refused, and the schema agrees", () => {
    expect(MAX_SCOPED_CURSOR_TEXT).toBe(4096);
    for (const key of ["next_cursor", "previous_cursor"] as const) {
      for (const [length, accepted] of [[1, true], [4096, true], [4097, false], [70_000, false]] as const) {
        const body = page(1);
        body.page[key] = cursorOf(length);
        expect(schemaAccepts(body), `${key} ${length} schema`).toBe(accepted);
        expect(scopedOf(body) !== null, `${key} ${length} reader`).toBe(accepted);
      }
    }
  });

  it("an empty cursor is refused (minLength 1) by both", () => {
    for (const key of ["next_cursor", "previous_cursor"] as const) {
      const body = page(1);
      body.page[key] = "";
      expect(schemaAccepts(body)).toBe(false);
      expect(scopedOf(body)).toBeNull();
    }
  });

  it("the whole chain is read 20,000 times inside a generous budget, each page keeping its flags", () => {
    const { value, ms } = timed(() => {
      let ok = 0;
      for (let n = 0; n < 20_000; n += 1) {
        const read = scopedOf(CHAIN[n % 3]);
        if (read !== null && read.page.hasNextCursor === (n % 3 !== 2)) ok += 1;
      }
      return ok;
    });
    expect(value).toBe(20_000);
    expect(ms).toBeLessThan(10_000);
  });

  it("a 4096-character cursor on both keys reads fast and is still not echoed", () => {
    const body = page(1);
    body.page.next_cursor = cursorOf(4096, "n");
    body.page.previous_cursor = cursorOf(4096, "p");
    const { value, ms } = timed(() => scopedOf(body));
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(1_000);
    expect(JSON.stringify(value)).not.toContain("nnnnnnnn");
  });
});

describe("L3 · negatives on the page keys (never looser than the schema)", () => {
  const BAD_CURSORS: unknown[] = [
    "", " ", "a b", "a\n", "\na", "a\r", "a\t", "a\u0000", "a/b", "a+b", "a=b", "a:b", "a,b", "é", "a​b", "a‮b", "a\u0085b", "%41", "<a>", "a;b",
    0, 1, true, false, {}, [], ["a"], { cursor: "a" }, Number.NaN,
  ];
  const BAD_FLAGS: unknown[] = ["true", "false", 0, 1, null, "", [], {}];

  it.each(["next_cursor", "previous_cursor"] as const)("%s: every malformed value is refused, by both", (key) => {
    let refused = 0;
    for (const bad of BAD_CURSORS) {
      const body = page(1);
      body.page[key] = bad;
      // has_more would disagree with a bad next_cursor; keep the page rule out of this check so only the cursor rule is under test.
      const schema = schemaAccepts(body);
      const reader = scopedOf(structuredClone(body)) !== null;
      expect(schema, `${key} ${JSON.stringify(bad)} schema`).toBe(false);
      expect(reader, `${key} ${JSON.stringify(bad)} reader`).toBe(false);
      refused += 1;
    }
    expect(refused).toBe(BAD_CURSORS.length);
  });

  it("an absent cursor key is refused (both keys are required, the contract says explicit null)", () => {
    for (const key of ["next_cursor", "previous_cursor", "has_more"] as const) {
      const body = page(1);
      delete body.page[key];
      expect(schemaAccepts(body), key).toBe(false);
      expect(scopedOf(body), key).toBeNull();
    }
  });

  it("has_more must be a boolean: every other type is refused, by both", () => {
    for (const bad of BAD_FLAGS) {
      const body = page(1);
      body.page.has_more = bad;
      expect(schemaAccepts(body), JSON.stringify(bad)).toBe(false);
      expect(scopedOf(body), JSON.stringify(bad)).toBeNull();
    }
  });

  it("a key the contract does not name in `page` is refused (the object is closed)", () => {
    for (const extra of ["cursor", "total", "total_count", "offset", "page_number", "after", "before", "next", "__proto__x"]) {
      const body = page(1);
      body.page[extra] = "x";
      expect(schemaAccepts(body), extra).toBe(false);
      expect(scopedOf(body), extra).toBeNull();
    }
  });

  it("SS-2 is the only place the reader is stricter on the chain: has_more against next_cursor, both ways, on every page", () => {
    for (const index of [0, 1, 2]) {
      const flipped = page(index);
      flipped.page.has_more = !flipped.page.has_more;
      expect(schemaAccepts(flipped), `page ${index + 1} schema`).toBe(true);
      expect(scopedOf(flipped), `page ${index + 1} reader`).toBeNull();
    }
  });

  it("counts: nothing the schema refuses is read (looser = 0), over every bad value of every page key on every page", () => {
    let looser = 0;
    let probed = 0;
    for (const index of [0, 1, 2]) {
      for (const key of ["next_cursor", "previous_cursor", "has_more"] as const) {
        for (const bad of [...BAD_CURSORS, ...BAD_FLAGS]) {
          const body = page(index);
          body.page[key] = bad;
          probed += 1;
          if (!schemaAccepts(body) && scopedOf(body) !== null) looser += 1;
        }
      }
    }
    console.info(`scoped chain L3: ${probed} payloads, reader accepts ${looser} that the schema refuses`);
    expect(looser).toBe(0);
  });

  it("prototype pollution through the page object changes nothing and nothing is read", () => {
    const body = page(1);
    body.page = JSON.parse(`{"visible_count":3,"returned_count":1,"limit":1,"maximum_response_bytes":1048576,"has_more":true,"next_cursor":"a","previous_cursor":"b","__proto__":{"polluted":true}}`);
    expect(scopedOf(body)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
