/**
 * Reader conformance for `runLibraryAlphaCatalogue.ts` (FE-069).
 *
 * Oracle: `research-run-library.openapi.json#/components/schemas/RunLibraryAlphaCatalogueResponse` through the testkit checker, and the
 * canonical `research-run-library-alpha-catalogue.synthetic.valid.json`, digest-checked. The canonical set publishes ONE valid body and no
 * negative file, so every negative below is a mutation of that body (and, for the schema-invalid ones, is proven schema-invalid first).
 * Lane: FIXTURE_LAB (synthetic bodies; not a runtime read).
 */
import { afterAll, describe, expect, it, vi } from "vitest";

import { canonicalDigest, loadCanonical } from "../testkit/loadCanonical";
import type { Draft } from "../testkit/matrix";
import { leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases } from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import {
  ALPHA_CATALOGUE_PATH, ALPHA_CATALOGUE_SCHEMA, CATALOGUE_FAILURES, CATALOGUE_FAILURE_TEXT, alphaCatalogueUrl, failureForStatus, fetchAlphaCataloguePage,
  readAlphaCataloguePage,
} from "./runLibraryAlphaCatalogue";

const FILE = "research-run-library-alpha-catalogue.synthetic";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
  expect(prototypeIsClean()).toBe(true);
});

const OA = "../openapi/research-run-library.openapi.json";
const PTR = "/components/schemas/RunLibraryAlphaCatalogueResponse";
const schemaViolations = (value: unknown) => validateAgainst(OA, PTR, value);
const base = () => loadCanonical<Draft>(FILE);
const edit = (change: (b: Draft) => void): Draft => {
  const copy = base();
  change(copy);
  return copy;
};
const refusedWord = (raw: unknown, asked: number | null = 100) => {
  const read = readAlphaCataloguePage(raw, asked);
  return read.kind === "refused" ? read.word : null;
};

describe("L0 · canonical, verbatim", () => {
  it("the published body is schema-valid and reads", () => {
    expect(schemaViolations(base())).toEqual([]);
    const read = readAlphaCataloguePage(base(), 100);
    expect(read).toEqual({
      kind: "page",
      page: { items: [{ id: "alpha-delta", name: "Delta RSI" }], limit: 100, hasMore: false, nextCursor: null, asOfUtcMs: 1793113200000 },
    });
  });

  it("the constants are the schema's", () => {
    expect(ALPHA_CATALOGUE_SCHEMA).toBe("research.run-library-alpha-catalogue.v1");
    expect(ALPHA_CATALOGUE_PATH).toBe("/api/v1/quantbt/runs/alpha-catalogue");
  });

  it("every failure word has fixed words of its own, none empty", () => {
    for (const word of CATALOGUE_FAILURES) expect(CATALOGUE_FAILURE_TEXT[word].length, word).toBeGreaterThan(10);
  });
});

describe("L1 · a second page reads with its cursor", () => {
  const more = edit((b) => {
    (b.page as Draft).has_more = true;
    (b.page as Draft).next_cursor = "opaque.cursor-1";
  });
  it("is schema-valid and carries the cursor", () => {
    expect(schemaViolations(more)).toEqual([]);
    const read = readAlphaCataloguePage(more, 100);
    expect(read.kind === "page" && read.page.nextCursor).toBe("opaque.cursor-1");
  });
});

describe("L2 · refused whole, never repaired", () => {
  it.each<[string, (b: Draft) => void, string, boolean]>([
    ["another contract version", (b) => { b.schema_version = "research.run-library-alpha-catalogue.v2"; }, "WRONG_SCHEMA", true],
    ["another read authority", (b) => { b.read_authority = "PORTAL_RETAINED_CURRENT_SOURCE"; }, "WRONG_AUTHORITY", true],
    ["an unknown root key", (b) => { b.registry = []; }, "UNREADABLE", true],
    ["an unknown item key", (b) => { ((b.items as Draft[])[0] as Draft).create_allowed = true; }, "ITEMS_INVALID", true],
    ["an unknown page key", (b) => { (b.page as Draft).total = 1; }, "PAGE_INVALID", true],
    ["an alpha id with an underscore", (b) => { ((b.items as Draft[])[0] as Draft).alpha_id = "alpha_delta"; }, "ITEMS_INVALID", true],
    ["an alpha id in capitals", (b) => { ((b.items as Draft[])[0] as Draft).alpha_id = "Alpha-Delta"; }, "ITEMS_INVALID", true],
    ["an alpha id of two characters", (b) => { ((b.items as Draft[])[0] as Draft).alpha_id = "ab"; }, "ITEMS_INVALID", true],
    ["an empty alpha name", (b) => { ((b.items as Draft[])[0] as Draft).alpha_name = ""; }, "ITEMS_INVALID", true],
    ["a 241-character alpha name", (b) => { ((b.items as Draft[])[0] as Draft).alpha_name = "x".repeat(241); }, "ITEMS_INVALID", true],
    ["a limit of 201", (b) => { (b.page as Draft).limit = 201; }, "PAGE_INVALID", true],
    ["a limit of 0", (b) => { (b.page as Draft).limit = 0; }, "PAGE_INVALID", true],
    ["another order", (b) => { (b.page as Draft).order = "ALPHA_ID_DESC"; }, "PAGE_INVALID", true],
    ["has_more as text", (b) => { (b.page as Draft).has_more = "true"; }, "PAGE_INVALID", true],
    ["a negative as_of", (b) => { b.as_of_utc_ms = -1; }, "UNREADABLE", true],
    ["a fractional as_of", (b) => { b.as_of_utc_ms = 1.5; }, "UNREADABLE", true],
    ["an empty cursor", (b) => { (b.page as Draft).has_more = true; (b.page as Draft).next_cursor = ""; }, "PAGE_INVALID", true],
    ["a 4097-character cursor", (b) => { (b.page as Draft).has_more = true; (b.page as Draft).next_cursor = "c".repeat(4097); }, "PAGE_INVALID", true],
    // Schema-valid, refused by the reader on purpose (named groups).
    ["has_more with no cursor", (b) => { (b.page as Draft).has_more = true; }, "PAGE_INVALID", false],
    ["a cursor on the last page", (b) => { (b.page as Draft).next_cursor = "stray"; }, "PAGE_INVALID", false],
    ["has_more over an empty page (no progress)", (b) => { b.items = []; (b.page as Draft).has_more = true; (b.page as Draft).next_cursor = "c1"; }, "PAGE_INVALID", false],
    ["a page size other than the one asked", (b) => { (b.page as Draft).limit = 50; }, "LIMIT_MISMATCH", false],
    ["a cursor with a space in it", (b) => { (b.page as Draft).has_more = true; (b.page as Draft).next_cursor = "a b"; }, "PAGE_INVALID", false],
    ["a name that is only blanks", (b) => { ((b.items as Draft[])[0] as Draft).alpha_name = "   "; }, "ITEMS_INVALID", false],
    ["a name with a bidi control", (b) => { ((b.items as Draft[])[0] as Draft).alpha_name = "Delta‮RSI"; }, "ITEMS_INVALID", false],
    ["a name with a zero-width space", (b) => { ((b.items as Draft[])[0] as Draft).alpha_name = "Delta​RSI"; }, "ITEMS_INVALID", false],
    ["a name with a newline", (b) => { ((b.items as Draft[])[0] as Draft).alpha_name = "Delta\nRSI"; }, "ITEMS_INVALID", false],
    ["a name with a lone surrogate", (b) => { ((b.items as Draft[])[0] as Draft).alpha_name = "Delta\ud800"; }, "ITEMS_INVALID", false],
    ["two items repeating one id", (b) => { b.items = [{ alpha_id: "alpha-delta", alpha_name: "A" }, { alpha_id: "alpha-delta", alpha_name: "B" }]; }, "ORDER_VIOLATION", false],
    ["items out of order", (b) => { b.items = [{ alpha_id: "alpha-zed", alpha_name: "Z" }, { alpha_id: "alpha-delta", alpha_name: "D" }]; }, "ORDER_VIOLATION", false],
    ["more items than the limit", (b) => { (b.page as Draft).limit = 1; b.items = [{ alpha_id: "alpha-a1", alpha_name: "A" }, { alpha_id: "alpha-a2", alpha_name: "B" }]; }, "ITEMS_INVALID", false],
  ])("%s", (_name, change, word, schemaInvalid) => {
    const body = edit(change);
    if (schemaInvalid) expect(schemaViolations(body).length, "the schema refuses it too").toBeGreaterThan(0);
    else expect(schemaViolations(body), "schema-valid, refused by a named reader group").toEqual([]);
    // The page size asked is the body's own unless the case is the mismatch.
    const asked = word === "LIMIT_MISMATCH" ? 100 : ((body.page as Draft | undefined)?.limit as number | undefined) ?? 100;
    expect(refusedWord(body, typeof asked === "number" ? asked : 100)).toBe(word);
  });

  it("a missing or null required key is refused, and no probe leaks", () => {
    const paths = [["schema_version"], ["read_authority"], ["items"], ["page"], ["as_of_utc_ms"], ["page", "limit"], ["page", "has_more"], ["page", "next_cursor"], ["page", "order"],
      ["items", 0, "alpha_id"], ["items", 0, "alpha_name"]] as const;
    for (const c of requiredCases(base(), paths.map((p) => [...p]))) {
      if (c.name.includes("page.next_cursor <- null")) continue; // null IS the published last-page value
      const read = readAlphaCataloguePage(c.value, 100);
      expect(read.kind, c.name).toBe("refused");
      expect(leaked(read, c.probe), c.name).toBe(false);
    }
  });

  it("a schema_version of any other spelling is refused", () => {
    for (const c of schemaVersionCases(base(), ["schema_version"], ALPHA_CATALOGUE_SCHEMA, ["research.run-library.v1", "execution.command-catalog.v1"])) {
      expect(readAlphaCataloguePage(c.value, 100).kind, c.name).toBe("refused");
    }
  });

  it("a planted own __proto__ / constructor / prototype key is an unknown key, refused, and pollutes nothing", () => {
    for (const c of pollutionCases(base(), [[], ["page"], ["items", 0]])) {
      const read = readAlphaCataloguePage(c.value, 100);
      expect(read.kind, c.name).toBe("refused");
      expect(leaked(read, c.probe), c.name).toBe(false);
    }
    expect(prototypeIsClean()).toBe(true);
  });

  it("anything that is not an object is refused without throwing", () => {
    for (const c of rootCases()) expect(readAlphaCataloguePage(c.value, 100).kind, c.name).toBe("refused");
  });

  it("an accessor that throws is UNREADABLE, never a throw", () => {
    const evil = {} as Record<string, unknown>;
    Object.defineProperty(evil, "schema_version", { enumerable: true, get() { throw new Error("boom"); } });
    expect(refusedWord(evil)).toBe("UNREADABLE");
  });

  it("200 items is the most a page holds; 201 is refused", () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ alpha_id: `alpha-${String(i).padStart(4, "0")}`, alpha_name: `A${i}` }));
    expect(readAlphaCataloguePage(edit((b) => { (b.page as Draft).limit = 200; b.items = items(200); }), 200).kind).toBe("page");
    const over = edit((b) => { (b.page as Draft).limit = 200; b.items = items(201); });
    expect(schemaViolations(over).length).toBeGreaterThan(0);
    expect(refusedWord(over, 200)).toBe("ITEMS_INVALID");
  });
});

describe("L3 · the request", () => {
  it("builds the path with limit, optional workspace and cursor", () => {
    expect(alphaCatalogueUrl()).toBe("/api/v1/quantbt/runs/alpha-catalogue?limit=200");
    expect(alphaCatalogueUrl({ workspaceId: "ws_1", cursor: "a.b", limit: 50 })).toBe("/api/v1/quantbt/runs/alpha-catalogue?workspace_id=ws_1&limit=50&cursor=a.b");
    expect(alphaCatalogueUrl({ cursor: "a/b+c=" })).toContain("cursor=a%2Fb%2Bc%3D");
  });
  it.each<[string, Parameters<typeof alphaCatalogueUrl>[0]]>([
    ["limit 0", { limit: 0 }], ["limit 201", { limit: 201 }], ["limit 1.5", { limit: 1.5 }], ["a bad workspace", { workspaceId: "a b" }],
    ["an empty cursor", { cursor: "" }], ["a cursor with a blank", { cursor: "a b" }], ["a 4097 cursor", { cursor: "c".repeat(4097) }],
  ])("sends nothing for %s", (_n, q) => expect(alphaCatalogueUrl(q)).toBeNull());

  it("status and the published code give the closed word; prose is never read", () => {
    expect(failureForStatus(400, "RESEARCH_RUN_LIBRARY_CURSOR_INVALID")).toBe("CURSOR_REFUSED");
    expect(failureForStatus(400, "RESEARCH_RUN_LIBRARY_INVALID")).toBe("REQUEST_INVALID");
    expect(failureForStatus(400, null)).toBe("REQUEST_INVALID");
    expect(failureForStatus(401, null)).toBe("UNAUTHENTICATED");
    expect(failureForStatus(403, null)).toBe("FORBIDDEN");
    expect(failureForStatus(404, null)).toBe("WORKSPACE_NOT_OBSERVABLE");
    expect(failureForStatus(503, null)).toBe("UNAVAILABLE");
    expect(failureForStatus(500, null)).toBe("UNAVAILABLE");
  });
});

describe("L4 · the fetch behind the port never throws", () => {
  const respond = (status: number, body: unknown) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response);
  it("reads a 200 page", async () => {
    const answer = await fetchAlphaCataloguePage({ limit: 100 }, undefined, respond(200, base()));
    expect(answer.kind).toBe("page");
  });
  it("a 200 that is not the contract is a typed failure", async () => {
    expect(await fetchAlphaCataloguePage({ limit: 100 }, undefined, respond(200, { items: [] }))).toEqual({ kind: "failed", word: "UNREADABLE" });
    expect(await fetchAlphaCataloguePage({ limit: 50 }, undefined, respond(200, base()))).toEqual({ kind: "failed", word: "LIMIT_MISMATCH" });
  });
  it("maps the problem bodies", async () => {
    const cursor = { error: { code: "RESEARCH_RUN_LIBRARY_CURSOR_INVALID", message: "SECRET PROSE" } };
    expect(await fetchAlphaCataloguePage({}, undefined, respond(400, cursor))).toEqual({ kind: "failed", word: "CURSOR_REFUSED" });
    expect(await fetchAlphaCataloguePage({}, undefined, respond(404, { error: { code: "RESEARCH_RUN_LIBRARY_NOT_FOUND" } }))).toEqual({ kind: "failed", word: "WORKSPACE_NOT_OBSERVABLE" });
    expect(await fetchAlphaCataloguePage({}, undefined, respond(503, "not json"))).toEqual({ kind: "failed", word: "UNAVAILABLE" });
  });
  it("a network failure, an abort and an unsendable query", async () => {
    expect(await fetchAlphaCataloguePage({}, undefined, vi.fn(async () => { throw new TypeError("x"); }) as unknown as typeof fetch)).toEqual({ kind: "failed", word: "NETWORK" });
    const c = new AbortController();
    c.abort();
    expect(await fetchAlphaCataloguePage({}, c.signal, vi.fn(async () => { throw new DOMException("a", "AbortError"); }) as unknown as typeof fetch)).toEqual({ kind: "failed", word: "ABORTED" });
    const never = vi.fn();
    expect(await fetchAlphaCataloguePage({ limit: 999 }, undefined, never as unknown as typeof fetch)).toEqual({ kind: "failed", word: "REQUEST_INVALID" });
    expect(never).not.toHaveBeenCalled();
  });
  it("the error prose never reaches the answer", async () => {
    const answer = await fetchAlphaCataloguePage({}, undefined, respond(400, { error: { code: "X", message: "SECRET PROSE" } }));
    expect(JSON.stringify(answer)).not.toContain("SECRET");
  });
});
