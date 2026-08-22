/**
 * C-PI04-03 gates.
 *
 * The load-bearing one is the last describe block: a context mismatch must not
 * be able to page rows from one query into another list. Everything else here
 * is wording; that one is correctness.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ApprovalInboxContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";
import type { ExecutionApi, InboxQuery } from "./api/ports";

import { CURSOR_CODES, readCursorFailure } from "./cursorFailure";

afterEach(cleanup);

const CONTROL_API = join(
  __dirname,
  "../../../../../apps/control-api/src/query/cursor.ts",
);

describe("the three codes are the server's three codes", () => {
  it("matches what apps/control-api actually throws", () => {
    const source = readFileSync(CONTROL_API, "utf8");
    const thrown = [
      ...source.matchAll(/new QueryContractError\(\s*\n?\s*"([A-Z_]+)"/g),
    ].map((m) => m[1]);
    // Guards the regex itself.
    expect(thrown.length).toBeGreaterThanOrEqual(3);
    expect([...CURSOR_CODES].sort()).toEqual([...new Set(thrown)].sort());
  });
});

describe("each code gets its own recovery", () => {
  it("tells the operator their filters survived an expired lease", () => {
    const f = readCursorFailure("CURSOR_EXPIRED: Query cursor has expired.")!;
    expect(f.code).toBe("CURSOR_EXPIRED");
    expect(f.notice).toMatch(/filters and sort are unchanged/);
  });

  it("says a malformed cursor was simply not valid", () => {
    expect(readCursorFailure("INVALID_CURSOR: Invalid query cursor.")!.notice).toMatch(/not valid/);
  });

  it("names what changed when the context is what changed", () => {
    const f = readCursorFailure(
      "CURSOR_CONTEXT_MISMATCH: Query cursor does not match this resource, workspace, direction, or query.",
    )!;
    expect(f.notice).toMatch(/workspace, filter or sort changed/);
  });

  it("gives the three of them three different sentences", () => {
    const notices = CURSOR_CODES.map((c) => readCursorFailure(`${c}: x`)!.notice);
    expect(new Set(notices).size).toBe(3);
  });
});

describe("nothing internal reaches the operator", () => {
  it("does not echo the cursor, its signature or a parser error", () => {
    const f = readCursorFailure(
      'INVALID_CURSOR: token kc1.eyJhIjoxfQ.9f1c signature mismatch at parse("cursor")',
    )!;
    expect(f.notice).not.toContain("kc1.");
    expect(f.notice).not.toContain("signature");
    expect(f.notice).not.toContain("parse(");
  });
});

describe("it does not claim failures that are not cursor rejections", () => {
  it("ignores an unrelated failure that merely mentions a cursor", () => {
    // The previous matcher had a bare `cursor` alternative and would reset the
    // operator's page on this.
    expect(readCursorFailure("UPSTREAM_TIMEOUT: the cursor service did not answer")).toBeNull();
  });

  it("ignores an ordinary failure", () => {
    expect(readCursorFailure("HTTP_503: unavailable")).toBeNull();
    expect(readCursorFailure("")).toBeNull();
  });

  it("does not match a code embedded in a longer identifier", () => {
    expect(readCursorFailure("MY_INVALID_CURSORS_THING: x")).toBeNull();
  });
});



/* ---------------------------------------------------------------------------
 * The container behaviour codex asked to be tested: a context mismatch cannot
 * reuse rows from another context.
 * ------------------------------------------------------------------------ */

describe("the inbox recovers from each rejection without replaying the cursor", () => {
  /**
   * A port that records every query and rejects any cursored one.
   *
   * The recorded queries are the assertion: after a rejection the container
   * must ask for a first page and must never send that cursor again. Checking
   * the rows on screen would not prove it — the container re-requests page one,
   * so the same rows legitimately come back, and a test that expected an empty
   * table would be asserting the wrong thing.
   */
  function rejectingApi(code: string, seen: InboxQuery[]): ExecutionApi {
    const base = createFixtureApi();
    return {
      ...base,
      async listApprovals(query) {
        seen.push(query);
        if (query.after || query.before) {
          return { ok: false, status: "unavailable", reason: `${code}: rejected` };
        }
        const first = await base.listApprovals(query);
        if (!first.ok) return first;
        // The fixture serves a single page, so `hasMore` is false and the
        // "load older" control never renders. Forcing it is what makes the
        // rejection path reachable at all — without it these tests pass
        // without ever exercising the code they name.
        return {
          ...first,
          value: {
            ...first.value,
            page: { ...first.value.page, hasMore: true, nextCursor: "cur-1" },
          },
        };
      },
    };
  }

  for (const code of CURSOR_CODES) {
    it(`${code}: states its own recovery and never re-sends the rejected cursor`, async () => {
      const seen: InboxQuery[] = [];
      render(<ApprovalInboxContainer api={rejectingApi(code, seen)} />);
      await screen.findByText("AP-352");

      // No early return: a rejection path that never runs proves nothing.
      fireEvent.click(screen.getByRole("button", { name: /load older/i }));

      expect(await screen.findByText(readCursorFailure(`${code}: rejected`)!.notice)).toBeTruthy();

      const cursored = seen.filter((q) => q.after || q.before);
      // Exactly one: the click. The rejection must not leave the cursor in
      // state to be re-sent on the next render — the bug the previous code
      // called out and this keeps closed.
      expect(cursored.length).toBe(1);
      // And the request after it went back to the first page.
      expect(seen.at(-1)?.after).toBeUndefined();
      expect(seen.at(-1)?.before).toBeUndefined();
    });
  }

  it("gives the three rejections three different notices on screen", async () => {
    const notices = new Set<string>();
    for (const code of CURSOR_CODES) {
      const seen: InboxQuery[] = [];
      render(<ApprovalInboxContainer api={rejectingApi(code, seen)} />);
      await screen.findByText("AP-352");
      fireEvent.click(screen.getByRole("button", { name: /load older/i }));
      notices.add((await screen.findByText(readCursorFailure(`${code}: rejected`)!.notice)).textContent!);
      cleanup();
    }
    expect(notices.size).toBe(3);
  });
});
