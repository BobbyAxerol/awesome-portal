/**
 * `createScopedPager(port, { cursorRefusal: "stop" })` and `reset()` over the 3-page chain (BE-P14, TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT).
 * The slice uses "stop": a cursor refusal is shown, and `open(query)` ("Start over") is the one way out.
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../../testkit/loadCanonical";
import { createScopedPager, type ScopedPageAnswer, type ScopedPagePort, type ScopedPageRequest } from "./scopedPager";

interface Scenario { id: string; pages: { response: any }[] }
const CHAIN = loadCanonical<{ scenarios: Scenario[] }>("execution-manager-scoped.scenarios.synthetic").scenarios.find((s) => s.id === "fleet-owner-paper-chain")!.pages.map((p) => p.response);
const envelope = (code: string) => ({ error: { code, message: "TEST_ONLY free text" }, request_id: "req_TEST_ONLY" });
const ok = (index: number): ScopedPageAnswer => ({ ok: true, body: structuredClone(CHAIN[index]) });

function scripted(answers: ScopedPageAnswer[], hold = false) {
  const requests: ScopedPageRequest[] = [];
  const waiting: (() => void)[] = [];
  const port: ScopedPagePort = {
    async read(request) {
      requests.push(request);
      if (hold) await new Promise<void>((resolve) => waiting.push(resolve));
      return answers.shift() ?? { ok: false, transport: true };
    },
  };
  return { port, requests, release: () => waiting.splice(0).forEach((resolve) => resolve()) };
}

describe("cursorRefusal: stop", () => {
  it.each([["CURSOR_CONTEXT_MISMATCH"], ["INVALID_CURSOR"], ["CURSOR_EXPIRED"]])("400 %s is shown as a refusal, not retried; open(query) is the one way out", async (code) => {
    const { port, requests } = scripted([ok(0), { ok: false, status: 400, body: envelope(code) }, ok(0)]);
    const pager = createScopedPager(port, { cursorRefusal: "stop" });
    await pager.open("q");
    await pager.next();
    expect(requests.map((r) => r.direction)).toEqual(["first", "after"]);
    expect(pager.getState()).toMatchObject({ phase: "refused", page: null, hasNext: false, hasPrevious: false, refusal: { kind: "cursor_reset", code } });
    expect(pager.getState().counters.restarts).toBe(0);
    await pager.open(pager.getState().query!);
    expect(pager.getState()).toMatchObject({ phase: "ready", position: 1, refusal: null });
  });

  it("covers only the cursor refusals: 409 still refetches the scope once", async () => {
    const { port, requests } = scripted([ok(0), { ok: false, status: 409, body: envelope("EXECUTION_READ_ACCESS_CHANGED") }, ok(0)]);
    const pager = createScopedPager(port, { cursorRefusal: "stop" });
    await pager.open("q");
    await pager.next();
    expect(requests.map((r) => r.direction)).toEqual(["first", "after", "first"]);
    expect(pager.getState().phase).toBe("ready");
  });

  it("the default is unchanged: a cursor refusal restarts the chain once", async () => {
    const { port, requests } = scripted([ok(0), { ok: false, status: 400, body: envelope("CURSOR_EXPIRED") }, ok(0)]);
    const pager = createScopedPager(port);
    await pager.open("q");
    await pager.next();
    expect(requests.map((r) => r.direction)).toEqual(["first", "after", "first"]);
  });
});

describe("reset()", () => {
  it("drops the rows and the cursors, and an answer still in flight is discarded on arrival", async () => {
    const { port, requests, release } = scripted([ok(0), ok(1)], true);
    const pager = createScopedPager(port);
    const opened = pager.open("q");
    release();
    await opened;
    const moving = pager.next();
    pager.reset();
    expect(pager.getState()).toMatchObject({ phase: "idle", page: null, hasNext: false, hasPrevious: false, busy: false });
    release();
    await moving;
    expect(pager.getState()).toMatchObject({ phase: "idle", page: null });
    // No cursor survives the reset: nothing to send.
    await pager.next();
    expect(requests).toHaveLength(2);
    expect(pager.getState().counters.dropped).toBe(1);
  });
});
