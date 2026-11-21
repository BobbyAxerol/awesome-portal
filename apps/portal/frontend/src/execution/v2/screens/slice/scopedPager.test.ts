/**
 * The cursor-chain pager over the 3-page `fleet-owner-paper-chain` scenario (BE-P14, TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT).
 * The port is a script; nothing reaches a network.
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../../testkit/loadCanonical";
import { createScopedPager, type ScopedPageAnswer, type ScopedPagePort, type ScopedPageRequest } from "./scopedPager";

interface Scenario { id: string; pages: { response: any }[] }
const scenarios = loadCanonical<{ scenarios: Scenario[] }>("execution-manager-scoped.scenarios.synthetic").scenarios;
const CHAIN = scenarios.find((s) => s.id === "fleet-owner-paper-chain")!.pages.map((p) => p.response);
const copy = (value: unknown) => structuredClone(value);
const envelope = (code: string) => ({ error: { code, message: "TEST_ONLY free text" }, request_id: "req_TEST_ONLY" });

/** Page n answers a request whose cursor is the previous page's next_cursor (after) or the next page's previous_cursor (before). */
function chainPort(opts: { hold?: boolean } = {}) {
  const requests: ScopedPageRequest[] = [];
  const waiting: { release: () => void }[] = [];
  const port: ScopedPagePort = {
    async read(request) {
      requests.push(request);
      if (opts.hold) await new Promise<void>((resolve) => waiting.push({ release: resolve }));
      let index = 0;
      if (request.direction === "after") index = CHAIN.findIndex((_p, i) => CHAIN[i - 1]?.page.next_cursor === request.cursor);
      if (request.direction === "before") index = CHAIN.findIndex((_p, i) => CHAIN[i + 1]?.page.previous_cursor === request.cursor);
      if (index < 0) return { ok: false, status: 400, body: envelope("INVALID_CURSOR") };
      return { ok: true, body: copy(CHAIN[index]) };
    },
  };
  return { port, requests, release: () => waiting.splice(0).forEach((w) => w.release()) };
}

const ids = (pager: ReturnType<typeof createScopedPager>) => pager.getState().page?.items.map((i) => i.identity.alpha_id);

describe("the 3-page chain", () => {
  it("walks forward with each page's next cursor, back with previous, and keeps ONE page", async () => {
    const { port, requests } = chainPort();
    const pager = createScopedPager(port);
    await pager.open("paper|limit1");
    expect(ids(pager)).toEqual(["alpha_TEST_ONLY_A1"]);
    expect(pager.getState()).toMatchObject({ phase: "ready", position: 1, hasNext: true, hasPrevious: false });
    await pager.next();
    expect(ids(pager)).toEqual(["alpha_TEST_ONLY_A2"]);
    expect(pager.getState()).toMatchObject({ position: 2, hasNext: true, hasPrevious: true });
    await pager.next();
    expect(ids(pager)).toEqual(["alpha_TEST_ONLY_A3"]);
    expect(pager.getState()).toMatchObject({ position: 3, hasNext: false, hasPrevious: true });
    await pager.previous();
    expect(ids(pager)).toEqual(["alpha_TEST_ONLY_A2"]);
    expect(pager.getState().position).toBe(2);
    expect(requests.map((r) => r.direction)).toEqual(["first", "after", "after", "before"]);
    // The server's own count stays the server's: the visible count is constant along the chain and no merged list is kept.
    expect(pager.getState().page?.page.visibleCount).toBe(3);
  });

  it("hands the cursor to the port unchanged and never puts it in the state", async () => {
    const { port, requests } = chainPort();
    const pager = createScopedPager(port);
    await pager.open("q");
    await pager.next();
    expect(requests[1]!.cursor).toBe(CHAIN[0].page.next_cursor);
    const text = JSON.stringify(pager.getState());
    for (const page of CHAIN) for (const cursor of [page.page.next_cursor, page.page.previous_cursor]) if (cursor !== null) expect(text).not.toContain(cursor);
    expect(text).not.toContain("kc1.");
  });

  it("is single flight: presses while a read is open are ignored, not queued", async () => {
    const { port, requests, release } = chainPort({ hold: true });
    const pager = createScopedPager(port);
    const opened = pager.open("q");
    release();
    await opened;
    const first = pager.next();
    expect(pager.getState().busy).toBe(true);
    await pager.next();
    await pager.previous();
    await pager.next();
    expect(requests).toHaveLength(2);
    expect(pager.getState().counters.ignored).toBe(3);
    release();
    await first;
    expect(pager.getState()).toMatchObject({ position: 2, busy: false });
    expect(requests).toHaveLength(2);
  });

  it("does nothing past the ends (no cursor, no read)", async () => {
    const { port, requests } = chainPort();
    const pager = createScopedPager(port);
    await pager.previous();
    await pager.open("q");
    await pager.previous();
    expect(requests).toHaveLength(1);
    expect(pager.getState().counters.ignored).toBe(2);
  });
});

describe("a changed query is a new chain", () => {
  it("drops rows and cursors, reads the first page of the new query, and never replays an old cursor", async () => {
    const { port, requests } = chainPort();
    const pager = createScopedPager(port);
    await pager.open("paper");
    await pager.next();
    expect(pager.getState().position).toBe(2);
    await pager.open("paper|search=Aurora");
    expect(requests.at(-1)).toEqual({ query: "paper|search=Aurora", direction: "first", cursor: null });
    expect(pager.getState()).toMatchObject({ position: 1, query: "paper|search=Aurora", hasPrevious: false });
    await pager.previous();
    expect(requests.at(-1)!.direction).toBe("first");
  });

  it("an answer still in flight for the old query is discarded on arrival", async () => {
    const { port, release } = chainPort({ hold: true });
    const pager = createScopedPager(port);
    const old = pager.open("old");
    const fresh = pager.open("new");
    release();
    await Promise.all([old, fresh]);
    release();
    expect(pager.getState()).toMatchObject({ query: "new", phase: "ready" });
    expect(pager.getState().counters.dropped).toBe(1);
  });
});

describe("refusals, by status and code", () => {
  const scripted = (answers: ScopedPageAnswer[]) => {
    const requests: ScopedPageRequest[] = [];
    const port: ScopedPagePort = { read: async (request) => { requests.push(request); return answers.shift() ?? { ok: false, transport: true }; } };
    return { port, requests };
  };
  const ok = (index: number): ScopedPageAnswer => ({ ok: true, body: copy(CHAIN[index]) });
  const refuse = (status: number, code: string): ScopedPageAnswer => ({ ok: false, status, body: envelope(code) });

  it.each([
    ["CURSOR_CONTEXT_MISMATCH"], ["INVALID_CURSOR"], ["CURSOR_EXPIRED"],
  ])("400 %s on a cursor restarts the chain from page 1 (once)", async (code) => {
    const { port, requests } = scripted([ok(0), refuse(400, code), ok(0)]);
    const pager = createScopedPager(port);
    await pager.open("q");
    await pager.next();
    expect(requests.map((r) => r.direction)).toEqual(["first", "after", "first"]);
    expect(pager.getState()).toMatchObject({ phase: "ready", position: 1, refusal: null });
    expect(pager.getState().counters.restarts).toBe(1);
  });

  it("a refusal of the restart itself is shown, not retried", async () => {
    const { port, requests } = scripted([ok(0), refuse(400, "CURSOR_EXPIRED"), refuse(400, "CURSOR_EXPIRED")]);
    const pager = createScopedPager(port);
    await pager.open("q");
    await pager.next();
    expect(requests).toHaveLength(3);
    expect(pager.getState()).toMatchObject({ phase: "refused", page: null, refusal: { kind: "cursor_reset" } });
  });

  it("409 EXECUTION_READ_ACCESS_CHANGED discards the page and reads the scope again from the first page", async () => {
    const { port, requests } = scripted([ok(0), refuse(409, "EXECUTION_READ_ACCESS_CHANGED"), ok(0)]);
    const pager = createScopedPager(port);
    await pager.open("q");
    await pager.next();
    expect(requests.map((r) => r.direction)).toEqual(["first", "after", "first"]);
    expect(pager.getState()).toMatchObject({ phase: "ready", position: 1 });
  });

  it.each([
    [404, "EXECUTION_READ_NOT_AVAILABLE", "not_available"],
    [403, "EXECUTION_READ_POLICY_PENDING", "policy_pending"],
    [503, "EXECUTION_READ_AUTHORITY_UNAVAILABLE", "authority_unavailable"],
    [503, "EXECUTION_READ_FIELD_POLICY_PENDING", "field_policy_pending"],
  ])("%s %s clears the rows and shows the typed refusal (a withheld read is not an empty list)", async (status, code, kind) => {
    const { port, requests } = scripted([ok(0), refuse(status, code)]);
    const pager = createScopedPager(port);
    await pager.open("q");
    await pager.next();
    expect(requests).toHaveLength(2);
    expect(pager.getState()).toMatchObject({ phase: "refused", page: null, hasNext: false, refusal: { kind } });
  });

  it("an unknown pair, a malformed body, a transport failure and a thrown port are all unreadable, with no rows", async () => {
    for (const answer of [refuse(500, "INVALID_CURSOR"), refuse(400, "SOMETHING"), { ok: true, body: { schema_version: "portal.execution.manager-scoped.v1" } } as ScopedPageAnswer, { ok: false, transport: true } as ScopedPageAnswer]) {
      const pager = createScopedPager(scripted([answer]).port);
      await pager.open("q");
      expect(pager.getState()).toMatchObject({ phase: "unreadable", page: null });
    }
    const pager = createScopedPager({ read: async () => { throw new Error("boom"); } });
    await pager.open("q");
    expect(pager.getState()).toMatchObject({ phase: "unreadable", page: null });
  });

  it("a page of another workspace, surface or environment than the chain's first is unreadable", async () => {
    for (const change of [(b: any) => { b.workspace_id = "workspace_OTHER"; }, (b: any) => { b.environment = "live"; b.items[0].environment = "live"; }]) {
      const other = copy(CHAIN[1]);
      change(other);
      const pager = createScopedPager(scripted([ok(0), { ok: true, body: other }]).port);
      await pager.open("q");
      await pager.next();
      expect(pager.getState()).toMatchObject({ phase: "unreadable", page: null });
    }
  });
});
