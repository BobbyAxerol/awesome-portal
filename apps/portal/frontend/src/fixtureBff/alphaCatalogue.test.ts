/**
 * FE-069 · the paged alpha catalogue: fixture route + traversal + fences. Lane: FIXTURE_LAB (the deterministic route of
 * `fixture-bff/alpha-catalogue.ts` answers in process; nothing here is a real-API or browser receipt).
 */
import { describe, expect, it } from "vitest";

import { answerAlphaCatalogue, fixtureCatalogue, mintCursor, WS_EMPTY, WS_FAIL_PAGE2, WS_REVOKED, FIXTURE_PAD } from "../../../fixture-bff/alpha-catalogue";
import { validateAgainst } from "../execution/v2/testkit/schema";
import {
  alphaCatalogueUrl, failureForStatus, readAlphaCataloguePage, traverseAlphaCatalogue, type AlphaCatalogueQuery, type AlphaCataloguePageAnswer,
  type AlphaCataloguePort,
} from "../execution/v2/readers/runLibraryAlphaCatalogue";

// WP-B2-A3 (N3-06): the session workspace lists the world's alphas only; the multi-page traversals run on a named workspace, which also carries the 230 padding entries
const LONG = "ws_long";
const OA = "../openapi/research-run-library.openapi.json";
const PTR = "/components/schemas/RunLibraryAlphaCatalogueResponse";

function call(query: AlphaCatalogueQuery) {
  const url = alphaCatalogueUrl(query)!;
  const [path, search = ""] = url.split("?");
  return answerAlphaCatalogue({ method: "GET", path: path!, search, headers: {}, body: null })!;
}
/** The fixture route as a port: the same status/code -> word mapping the HTTP port uses. */
const fixturePort = (log: AlphaCatalogueQuery[] = []): AlphaCataloguePort => async (query) => {
  log.push(query);
  const response = call(query);
  if (response.status !== 200) {
    const code = (response.body as { error?: { code?: string } }).error?.code ?? null;
    return { kind: "failed", word: failureForStatus(response.status, code) };
  }
  const read = readAlphaCataloguePage(response.body, query.limit ?? 200);
  return read.kind === "page" ? read : { kind: "failed", word: read.word };
};

describe("the fixture route", () => {
  it("is schema-valid on every page and ordered bytewise", () => {
    let cursor: string | undefined;
    let seen = 0;
    for (let guard = 0; guard < 10; guard += 1) {
      const response = call({ limit: 100, workspaceId: LONG, ...(cursor !== undefined ? { cursor } : {}) });
      expect(response.status).toBe(200);
      expect(validateAgainst(OA, PTR, response.body)).toEqual([]);
      const body = response.body as { items: { alpha_id: string }[]; page: { has_more: boolean; next_cursor: string | null } };
      seen += body.items.length;
      if (!body.page.has_more) break;
      cursor = body.page.next_cursor!;
    }
    expect(seen).toBe(fixtureCatalogue().length);
    const ids = fixtureCatalogue().map((e) => e.alpha_id);
    expect(ids).toEqual([...ids].sort());
  });

  it("is built from the world: the native alphas are in, in the published spelling", () => {
    const ids = fixtureCatalogue().map((e) => e.alpha_id);
    for (const id of ["alpha-a", "alpha-b", "alpha-btc-trend", "alpha-c", "alpha-d"]) expect(ids).toContain(id);
    expect(ids.filter((id) => id.startsWith("fixture-alpha-"))).toHaveLength(FIXTURE_PAD);
    expect(ids.length).toBeGreaterThan(200);
    // the session workspace (a person's picker) lists no placeholder
    expect(fixtureCatalogue(false).filter((e) => e.alpha_id.startsWith("fixture-alpha-"))).toHaveLength(0);
    const session = call({ limit: 200 }).body as { items: { alpha_id: string }[]; page: { has_more: boolean } };
    expect(session.items.some((e) => e.alpha_id.startsWith("fixture-alpha-"))).toBe(false);
    expect(session.page.has_more).toBe(false);
  });

  it("is deterministic", () => {
    expect(call({ limit: 50 }).body).toEqual(call({ limit: 50 }).body);
  });

  it("answers only its own GET", () => {
    expect(answerAlphaCatalogue({ method: "POST", path: "/api/v1/quantbt/runs/alpha-catalogue", search: "", headers: {}, body: null })).toBeNull();
    expect(answerAlphaCatalogue({ method: "GET", path: "/api/v1/quantbt/runs", search: "", headers: {}, body: null })).toBeNull();
  });

  it("refuses an unknown query key and a bad limit", () => {
    const get = (search: string) => answerAlphaCatalogue({ method: "GET", path: "/api/v1/quantbt/runs/alpha-catalogue", search, headers: {}, body: null })!;
    expect(get("registry=1").status).toBe(400);
    expect(get("limit=0").status).toBe(400);
    expect(get("limit=201").status).toBe(400);
    expect(get("limit=abc").status).toBe(400);
  });
});

describe("traversal over more than 200 entries", () => {
  it("follows next_cursor to the last page: complete, in order, no duplicate, no gap", async () => {
    const log: AlphaCatalogueQuery[] = [];
    const result = await traverseAlphaCatalogue(fixturePort(log), { limit: 100, workspaceId: LONG });
    expect(result.kind).toBe("complete");
    if (result.kind !== "complete") return;
    expect(result.alphas.map((a) => a.id)).toEqual(fixtureCatalogue().map((e) => e.alpha_id));
    expect(result.pages).toBe(Math.ceil(fixtureCatalogue().length / 100));
    expect(result.pages).toBeGreaterThan(2);
    expect(log[0]!.cursor).toBeNull();
    expect(log.slice(1).every((q) => typeof q.cursor === "string")).toBe(true);
  });

  it("at the 200 maximum there are still two pages, and the first page alone is never reported complete", async () => {
    const first = call({ limit: 200, workspaceId: LONG }).body as { items: unknown[]; page: { has_more: boolean } };
    expect(first.items).toHaveLength(200);
    expect(first.page.has_more).toBe(true);
    const log: AlphaCatalogueQuery[] = [];
    const result = await traverseAlphaCatalogue(fixturePort(log), { limit: 200, workspaceId: LONG });
    expect(result.kind === "complete" && result.pages).toBe(2);
    // One page only (a cap of one) is partial, with its reason, and carries a count that is not the list.
    const capped = await traverseAlphaCatalogue(fixturePort(), { limit: 200, maxPages: 1, workspaceId: LONG });
    expect(capped).toMatchObject({ kind: "partial", pages: 1, failure: "PAGE_CAP" });
  });

  it("an empty workspace is complete with no alpha (not a failure, not a list of fixtures)", async () => {
    const result = await traverseAlphaCatalogue(fixturePort(), { workspaceId: WS_EMPTY });
    expect(result).toMatchObject({ kind: "complete", alphas: [], pages: 1 });
  });
});

describe("fences: workspace, page size, forged and expired cursors", () => {
  const firstCursor = (workspace: string, limit: number) => (call({ limit, workspaceId: workspace }).body as { page: { next_cursor: string } }).page.next_cursor;

  it("a cursor of another workspace is refused 400 CURSOR_INVALID, nothing repaired", () => {
    const cursor = firstCursor("ws_one", 100);
    const response = call({ limit: 100, workspaceId: "ws_two", cursor });
    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe("RESEARCH_RUN_LIBRARY_CURSOR_INVALID");
  });

  it("a cursor of another page size, a tampered one and a stray one are refused", () => {
    const cursor = firstCursor("ws_one", 100);
    expect(call({ limit: 50, workspaceId: "ws_one", cursor }).status).toBe(400);
    expect(call({ limit: 100, workspaceId: "ws_one", cursor: `${cursor}x` }).status).toBe(400);
    expect(call({ limit: 100, workspaceId: "ws_one", cursor: "garbage" }).status).toBe(400);
    expect(call({ limit: 100, workspaceId: "ws_one", cursor: mintCursor("ws_other", 100, "alpha-a") }).status).toBe(400);
  });

  it("the traversal maps a refused cursor to CURSOR_REFUSED: partial with the pages read, and the next attempt starts from page one", async () => {
    const log: AlphaCatalogueQuery[] = [];
    const real = fixturePort(log);
    let n = 0;
    const flaky: AlphaCataloguePort = async (q) => (++n === 2 ? { kind: "failed", word: "CURSOR_REFUSED" } : real(q));
    const result = await traverseAlphaCatalogue(flaky, { limit: 100, workspaceId: LONG });
    expect(result).toMatchObject({ kind: "partial", pages: 1, failure: "CURSOR_REFUSED" });
    // Restart: a fresh call asks for the first page again (cursor null), never the refused one.
    const again: AlphaCatalogueQuery[] = [];
    const second = await traverseAlphaCatalogue(fixturePort(again), { limit: 100, workspaceId: LONG });
    expect(second.kind).toBe("complete");
    expect(again[0]!.cursor).toBeNull();
  });

  it("a cursor does not carry from one traversal to the next", async () => {
    const a: AlphaCatalogueQuery[] = [];
    const b: AlphaCatalogueQuery[] = [];
    await traverseAlphaCatalogue(fixturePort(a), { limit: 100, workspaceId: LONG });
    await traverseAlphaCatalogue(fixturePort(b), { limit: 100, workspaceId: LONG });
    expect(a[0]!.cursor).toBeNull();
    expect(b[0]!.cursor).toBeNull();
  });

  it("every request of a traversal names the one workspace and the one limit", async () => {
    const log: AlphaCatalogueQuery[] = [];
    await traverseAlphaCatalogue(fixturePort(log), { limit: 100, workspaceId: "ws_one" });
    expect(new Set(log.map((q) => q.workspaceId))).toEqual(new Set(["ws_one"]));
    expect(new Set(log.map((q) => q.limit))).toEqual(new Set([100]));
  });
});

describe("page failure and revocation", () => {
  it("a failing second page is partial: the first page's alphas are NOT the list", async () => {
    const result = await traverseAlphaCatalogue(fixturePort(), { limit: 100, workspaceId: WS_FAIL_PAGE2 });
    expect(result).toMatchObject({ kind: "partial", pages: 1, failure: "UNAVAILABLE" });
    if (result.kind === "partial") expect(result.alphas).toHaveLength(100);
  });

  it("a revoked workspace on the first page is failed with nothing", async () => {
    const result = await traverseAlphaCatalogue(fixturePort(), { workspaceId: WS_REVOKED });
    expect(result).toEqual({ kind: "failed", pages: 0, failure: "WORKSPACE_NOT_OBSERVABLE" });
  });

  it("a revoke between pages drops what was read, whole", async () => {
    const real = fixturePort();
    let n = 0;
    const revoked: AlphaCataloguePort = async (q) => (++n === 2 ? ({ kind: "failed", word: "WORKSPACE_NOT_OBSERVABLE" } as AlphaCataloguePageAnswer) : real(q));
    const result = await traverseAlphaCatalogue(revoked, { limit: 100, workspaceId: LONG });
    expect(result).toEqual({ kind: "failed", pages: 1, failure: "WORKSPACE_NOT_OBSERVABLE" });
    expect(JSON.stringify(result)).not.toContain("alpha-");
  });

  it("a lost session or a forbidden read mid-way also drops it", async () => {
    for (const word of ["FORBIDDEN", "UNAUTHENTICATED"] as const) {
      const real = fixturePort();
      let n = 0;
      const port: AlphaCataloguePort = async (q) => (++n === 2 ? { kind: "failed", word } : real(q));
      expect(await traverseAlphaCatalogue(port, { limit: 100, workspaceId: LONG })).toMatchObject({ kind: "failed", failure: word });
    }
  });

  it("a rejecting port is NETWORK, never a throw", async () => {
    const result = await traverseAlphaCatalogue(async () => { throw new Error("boom"); });
    expect(result).toEqual({ kind: "failed", pages: 0, failure: "NETWORK" });
  });
});

describe("workspace change while a traversal is in flight", () => {
  it("a page that lands after the workspace changed is dropped (ABORTED), results are not reused", async () => {
    let current = true;
    const real = fixturePort();
    const port: AlphaCataloguePort = async (q) => {
      const answer = await real(q);
      current = false; // the workspace switches while this page is on its way
      return answer;
    };
    const result = await traverseAlphaCatalogue(port, { limit: 100, isCurrent: () => current });
    expect(result).toEqual({ kind: "failed", pages: 0, failure: "ABORTED" });
  });

  it("a traversal that is no longer current never asks for a page", async () => {
    let asked = 0;
    const result = await traverseAlphaCatalogue(async () => { asked += 1; return fixturePort()({}); }, { isCurrent: () => false });
    expect(asked).toBe(0);
    expect(result.kind).toBe("failed");
  });
});

describe("a source that changes while it is read", () => {
  const page = (ids: string[], more: string | null): AlphaCataloguePageAnswer => ({
    kind: "page", page: { items: ids.map((id) => ({ id, name: id })), limit: 2, hasMore: more !== null, nextCursor: more, asOfUtcMs: 1 },
  });
  const script = (...answers: AlphaCataloguePageAnswer[]): AlphaCataloguePort => { let i = 0; return async () => answers[i++]!; };

  it("ids that go backwards across pages are ORDER_VIOLATION (two snapshots, not one census)", async () => {
    const r = await traverseAlphaCatalogue(script(page(["alpha-a1", "alpha-c3"], "c1"), page(["alpha-b2", "alpha-d4"], null)), { limit: 2 });
    expect(r).toMatchObject({ kind: "partial", failure: "ORDER_VIOLATION", pages: 1 });
  });

  it("an id repeated across pages is ORDER_VIOLATION", async () => {
    const r = await traverseAlphaCatalogue(script(page(["alpha-a1", "alpha-b2"], "c1"), page(["alpha-b2", "alpha-c3"], null)), { limit: 2 });
    expect(r).toMatchObject({ kind: "partial", failure: "ORDER_VIOLATION" });
  });

  it("a cursor that comes back is CURSOR_REPEATED, not a loop", async () => {
    const r = await traverseAlphaCatalogue(script(page(["alpha-a1", "alpha-b2"], "c1"), page(["alpha-c3", "alpha-d4"], "c1")), { limit: 2 });
    expect(r).toMatchObject({ kind: "partial", failure: "CURSOR_REPEATED", pages: 2 });
  });

  it("a page of a port that skipped the reader is judged again", async () => {
    const bad: AlphaCataloguePageAnswer = { kind: "page", page: { items: [{ id: "Alpha_Bad", name: "x" }], limit: 2, hasMore: false, nextCursor: null, asOfUtcMs: 1 } };
    expect(await traverseAlphaCatalogue(script(bad), { limit: 2 })).toEqual({ kind: "failed", pages: 0, failure: "ITEMS_INVALID" });
  });

  it("a page size other than the one asked is LIMIT_MISMATCH", async () => {
    const r = await traverseAlphaCatalogue(script(page(["alpha-a1"], null)), { limit: 100, workspaceId: LONG });
    expect(r).toEqual({ kind: "failed", pages: 0, failure: "LIMIT_MISMATCH" });
  });
});
