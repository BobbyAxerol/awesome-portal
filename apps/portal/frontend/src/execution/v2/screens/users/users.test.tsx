/**
 * Users V2: the roster, the filters, the drawer and every state, through the
 * real `accountApi` client against the Playwright double's routes.
 */
import { whyText } from "../../gapWhyTestUtil";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerUsers, setUsersDoubleVariant, USERS_DOUBLE_COUNT, type UsersDoubleVariant } from "../../../../../e2e/bffDoubleUsers";
import type { AccountSummary } from "../../../../features/admin/accountApi";
import { ABSENT, getPath } from "../../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, stringCases, type NegativeCase,
} from "../../testkit/negative";
import UsersScreen, { USERS_SCREEN_KEY, type UsersClient } from "./index";
import { readDetailAccount, readHistory, readRoster, readRosterPage, rosterPath, RosterMalformed } from "./rosterReader";
import {
  failureOf, ROW_CAP, stepUpView, STATE_VIEW,
} from "./usersModel";

const originalFetch = globalThis.fetch;
const calls: { method: string; path: string; search: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  setUsersDoubleVariant("paged");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname, search: url.search });
    const answer = answerUsers(method, url.pathname, url.searchParams);
    if (answer === null) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function mount(entry = "/administration/users", props: Partial<React.ComponentProps<typeof UsersScreen>> = {}) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <UsersScreen {...props} />
      <Where />
    </MemoryRouter>,
  );
}

const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Accounts" });
const rowsOf = () => within(table()).getAllByRole("row").slice(1);
const loaded = () => screen.findByRole("table", { name: "Accounts" });
const variant = (v: UsersDoubleVariant) => setUsersDoubleVariant(v);

describe("roster", () => {
  it("is the users flag's screen", () => {
    expect(USERS_SCREEN_KEY).toBe("users");
  });

  it("shows the first 50 rows and the exact counts of the whole roster read", async () => {
    mount();
    await loaded();
    expect(rowsOf()).toHaveLength(50);
    const kpis = screen.getByRole("region", { name: "Account counts" });
    expect(within(kpis).getByText("Accounts").parentElement?.textContent).toContain(String(USERS_DOUBLE_COUNT));
    expect(screen.getByText(/Showing 50 of 123 accounts, 123 in the roster read/)).toBeTruthy();
  });

  it("prints the lifecycle word, locked and awaiting-first-password on the row, never colour alone", async () => {
    mount();
    await loaded();
    const first = rowsOf()[0]!;
    expect(first.querySelector("td[data-l='Account']")?.textContent).toContain("Bobby Vu");
    expect(first.querySelector("td[data-l='Account']")?.textContent).toContain("bobby");
    expect(first.querySelector("td[data-l='State']")?.textContent).toContain("Active");
    expect(first.querySelector("td[data-l='Role']")?.textContent).toBe("Administrator");
    const texts = rowsOf().map((r) => r.querySelector("td[data-l='State']")?.textContent ?? "");
    expect(texts.some((t) => t.includes("Invited") && t.includes("Awaiting first password"))).toBe(true);
    expect(texts.some((t) => t.includes("Disabled"))).toBe(true);
    expect(texts.some((t) => t.includes("Archived"))).toBe(true);
    expect(texts.some((t) => t.includes("Locked"))).toBe(true);
  });

  it("names role presets and last sign-in on one Not available line, with their request ids behind the disclosure", async () => {
    mount("/administration/users?sel=usr_0001");
    await loaded();
    const note = document.querySelector(".exec-usr-unpub")!;
    expect(note.querySelectorAll('[data-testid="not-available-line"]').length).toBe(1);
    expect(note.textContent).toContain("Not available: Role presets, Last sign-in");
    expect(note.textContent).toContain("Account changes are made on the current Users screen.");
    expect(note.textContent).not.toMatch(/no request/i);
    // The drawer does not repeat the two gaps: they are on the toolbar line.
    const dock = await screen.findByRole("complementary");
    expect(dock.textContent).not.toContain("Not available");
    const why = whyText(note.querySelector(".exec-blk-nal"));
    expect(why).toContain("FE-015, FE-026, FE-037, FE-038");
    expect(why).toContain("FE-053");
  });

  it("renders inside an execution surface, so the type roles apply (USR-B1)", async () => {
    mount();
    await loaded();
    const root = document.querySelector(".exec-usr-v2")!;
    expect(root.closest(".exec-surface")).not.toBeNull();
    expect(root.closest("[data-theme='operations-carbon']")).not.toBeNull();
  });

  it("renders no dash, no zero for an absence and no abbreviated number", async () => {
    mount();
    await loaded();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/\b\d+(\.\d+)?[kKmM]\b/);
  });

  it("is a real table with a labelled cell on every column (cards at 660px)", async () => {
    mount();
    await loaded();
    for (const cell of rowsOf()[0]!.querySelectorAll("td")) expect(cell.getAttribute("data-l")).toBeTruthy();
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Account", "State", "Role", "Revision"]);
  });
});

const rosterGets = () => calls.filter((c) => c.method === "GET" && c.path.endsWith("/accounts"));

describe("paging, search and filters (keyset pages and server-side filters, BE-P23)", () => {
  it("reads the first page with a limit and nothing else: never the unpaged roster", async () => {
    mount();
    await loaded();
    expect(rosterGets()).toHaveLength(1);
    expect([...new URLSearchParams(rosterGets()[0]!.search).entries()]).toEqual([["limit", "50"]]);
  });

  it("adds 50 rows per Load more by sending the cursor it was given, and says how many of how many", async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(rowsOf()).toHaveLength(100));
    const second = new URLSearchParams(rosterGets()[1]!.search);
    expect(second.get("limit")).toBe("50");
    expect(second.get("cursor")).toMatch(/^kc1\./);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(rowsOf()).toHaveLength(ROW_CAP > USERS_DOUBLE_COUNT ? USERS_DOUBLE_COUNT : ROW_CAP));
    expect(rosterGets()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText(/Showing 123 of 123 accounts/)).toBeTruthy();
    // The pages were walked, not re-read: 123 rows, each once, in the server's order.
    const names = rowsOf().map((r) => r.querySelector("td[data-l='Account'] .exec-usr-username")?.textContent ?? "");
    expect(new Set(names).size).toBe(123);
    expect(names).toEqual([...names].sort());
  });

  it("at 660px and narrower the server is asked for ten; Load more asks for the next ten with the cursor it was given", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 660px)", media: query, addEventListener: () => {}, removeEventListener: () => {},
    }));
    try {
      mount();
      await loaded();
      expect(rowsOf()).toHaveLength(10);
      expect(new URLSearchParams(rosterGets()[0]!.search).get("limit")).toBe("10");
      expect(screen.getByText(/Showing 10 of 123 accounts, 123 in the roster read/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await waitFor(() => expect(rowsOf()).toHaveLength(20));
      expect(screen.getByText(/Showing 20 of 123 accounts/)).toBeTruthy();
      expect(rosterGets()).toHaveLength(2);
      const second = new URLSearchParams(rosterGets()[1]!.search);
      expect(second.get("limit")).toBe("10");
      expect(second.get("cursor")).toMatch(/^kc1\./);
      // A row is still a keyboard-reachable control of the same table.
      expect(rowsOf()[0]!.getAttribute("tabindex")).toBe("0");
      // A filter starts the walk over, from the first page.
      fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "a" } });
      await waitFor(() => expect(rosterGets().length).toBe(3));
      expect(new URLSearchParams(rosterGets()[2]!.search).get("cursor")).toBeNull();
      await waitFor(() => expect(rowsOf().length).toBeLessThanOrEqual(10));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("marks Load more busy while the next page is on its way (no reasonless disabled control), and asks once", async () => {
    mount();
    await loaded();
    const button = screen.getByRole("button", { name: "Load more" }) as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(false);   // §3.5: a disabled control must state its reason; a busy guard needs none
    await waitFor(() => expect(rowsOf()).toHaveLength(100));
    expect(rosterGets()).toHaveLength(2);
  });

  it("sends the search to the server after a pause and writes it to the URL; the rows are the server's matches", async () => {
    mount();
    await loaded();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "lan" } });
    await waitFor(() => expect(search().get("q")).toBe("lan"));
    await waitFor(() => expect(rowsOf()).toHaveLength(1));
    expect(rowsOf()[0]!.textContent).toContain("Lan Tran");
    expect(new URLSearchParams(rosterGets()[rosterGets().length - 1]!.search).get("q")).toBe("lan");
    expect(screen.getByText(/Showing 1 of 1 matching accounts, 123 in the roster read/)).toBeTruthy();
    // The cards and the pickers stay roster-wide: a search does not shrink them.
    const kpis = screen.getByRole("region", { name: "Account counts" });
    expect(within(kpis).getByText("Accounts").parentElement?.textContent).toContain("123");
  });

  it("a search that matches only an account on a page not yet read still finds it (the filter is not over the loaded rows)", async () => {
    mount();
    await loaded();
    expect(screen.queryByText(/Account 120\b/)).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "Account 120" } });
    await waitFor(() => expect(rowsOf()).toHaveLength(1));
    expect(rowsOf()[0]!.textContent).toContain("Account 120");
  });

  it("sends the V1 role and lifecycle state from the URL to the server, and counts each option from the server's roster-wide counts", async () => {
    mount("/administration/users?role=ADMIN&state=ACTIVE");
    await loaded();
    const query = new URLSearchParams(rosterGets()[0]!.search);
    expect([query.get("role"), query.get("state")]).toEqual(["ADMIN", "ACTIVE"]);
    expect(rowsOf().map((r) => r.querySelector("td[data-l='Role']")?.textContent)).toEqual(["Administrator", "Administrator", "Administrator"]);
    expect(screen.getByRole("option", { name: "Administrator (3)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Archived (12)" })).toBeTruthy();
  });

  it("an unknown role or state in the URL is ignored, not sent and not applied", async () => {
    mount("/administration/users?role=SUPER&state=GONE");
    await loaded();
    expect(rowsOf()).toHaveLength(50);
    expect([...new URLSearchParams(rosterGets()[0]!.search).keys()]).toEqual(["limit"]);
  });

  it("says so, with a way out, when nothing matches", async () => {
    mount();
    await loaded();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "no-such-person" } });
    expect(await screen.findByText("No accounts match these filters.")).toBeTruthy();
    expect(screen.getByText("0 of 123 accounts in the roster read")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    await waitFor(() => expect(rowsOf()).toHaveLength(50));
  });

  it("a cursor the server refuses is an unavailable roster naming its code, with Try again from the first page", async () => {
    mount();
    await loaded();
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://portal.test");
      if (url.pathname === "/api/admin/accounts" && url.searchParams.has("cursor")) {
        return new Response(JSON.stringify({ error: { code: "ROSTER_CURSOR_EXPIRED", message: "The roster cursor has expired. Reload the roster." } }), { status: 409 });
      }
      return real(input, init);
    }) as typeof fetch;
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText(/The account roster could not be read \(ROSTER_CURSOR_EXPIRED\)\./)).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Accounts" })).toBeNull();
    globalThis.fetch = real;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await loaded();
    expect(rowsOf()).toHaveLength(50);
  });

  it("a page that repeats an account already read refuses the roster, naming the row and never the account", async () => {
    mount();
    await loaded();
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://portal.test");
      if (url.pathname === "/api/admin/accounts" && url.searchParams.has("cursor")) {
        const first = await (await real(`/api/admin/accounts?limit=50`, init)).json();
        return new Response(JSON.stringify({ ...first, page: { ...first.page } }), { status: 200 });
      }
      return real(input, init);
    }) as typeof fetch;
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText(/The account roster could not be read \(ROSTER_MALFORMED, row 51, user_id \(repeated\)\)\./)).toBeTruthy();
    expect(document.body.textContent).not.toContain("usr_0001");
  });

  it("a walk that a filter replaced does not append its late page", async () => {
    mount();
    await loaded();
    const real = globalThis.fetch;
    const gate = { release: () => {} };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://portal.test");
      if (url.pathname === "/api/admin/accounts" && url.searchParams.has("cursor")) {
        await new Promise<void>((done) => { gate.release = done; });
      }
      return real(input, init);
    }) as typeof fetch;
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "lan" } });
    await waitFor(() => expect(rowsOf()).toHaveLength(1));
    await act(async () => {
      gate.release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(rowsOf()).toHaveLength(1);
  });
});

describe("scale and keyboard", () => {
  const many = (n: number): AccountSummary[] =>
    Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, username: `user${String(i).padStart(3, "0")}`, displayName: `User ${i}`, role: "USER", accountState: "ACTIVE", mustChangePassword: false, accountRevision: 1, locked: false }));

  /** A client over a held list, paged the way the server pages (an offset stands in for the cursor). */
  const pagedClient = (all: AccountSummary[]): UsersClient => ({
    roster: async ({ limit, cursor, q }) => {
      const matching = all.filter((a) => !q || a.username.includes(q.toLowerCase()));
      const at = cursor ? Number(cursor) : 0;
      const rows = matching.slice(at, at + limit);
      const more = at + rows.length < matching.length;
      return {
        accounts: rows,
        page: { limit, returnedCount: rows.length, hasMore: more, nextCursor: more ? String(at + rows.length) : null },
        counts: { total: all.length, matching: matching.length, byState: { ACTIVE: all.length, INVITED: 0, DISABLED: 0, ARCHIVED: 0 }, byRole: { ADMIN: 0, USER: all.length }, locked: 0, awaitingFirstPassword: 0 },
      };
    },
    detail: async () => { throw new Error("n/a"); },
    stepUp: async () => ({ state: "REQUIRED", expiresAt: null }),
  });

  it("never puts more than 200 rows in the DOM, reads no more than four pages, says so, and tells the reader to narrow the search", async () => {
    const client = pagedClient(many(300));
    const spy = vi.spyOn(client, "roster");
    mount("/administration/users", { client });
    await loaded();
    for (const expected of [100, 150, 200]) {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await waitFor(() => expect(rowsOf()).toHaveLength(expected));
    }
    expect(spy).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText(/Showing the first 200 rows\. Narrow the search to see the rest\./)).toBeTruthy();
    expect(screen.getByText(/Showing 200 of 300 accounts, 300 in the roster read/)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "user299" } });
    await waitFor(() => expect(rowsOf()).toHaveLength(1));
  });

  it("a row opens its drawer from the keyboard", async () => {
    mount();
    await loaded();
    const row = rowsOf()[2]!;
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(search().get("sel")).toBe("usr_0003");
    expect(await screen.findByRole("complementary")).toBeTruthy();
  });

  it("a link to an account on a page not yet read opens it from its own detail read, never as 'not in the roster read'", async () => {
    mount("/administration/users?sel=usr_0100");
    const dock = await screen.findByRole("complementary");
    await within(dock).findByRole("list", { name: "Account history" });
    expect(within(dock).getByRole("heading", { name: "Account 100" })).toBeTruthy();
    expect(dock.textContent).not.toContain("Account not in the roster read");
    expect(dock.textContent).toContain("Role");
    expect(rowsOf()).toHaveLength(50);
  });
});

describe("step-up state", () => {
  it("says a check is required when the server says REQUIRED", async () => {
    mount();
    await loaded();
    expect(await screen.findByText("Step-up required")).toBeTruthy();
  });

  it("shows the verified state and the server's expiry, not a recomputed one", async () => {
    variant("verified");
    mount();
    await loaded();
    expect(await screen.findByText("Step-up verified")).toBeTruthy();
    expect(screen.getByText(/until 17 Oct 12:11Z/)).toBeTruthy();
  });

  it("says it was not read, rather than required, when that read fails", async () => {
    const client: UsersClient = {
      roster: async () => ({
        accounts: [], page: { limit: 50, returnedCount: 0, hasMore: false, nextCursor: null },
        counts: { total: 0, matching: 0, byState: { ACTIVE: 0, INVITED: 0, DISABLED: 0, ARCHIVED: 0 }, byRole: { ADMIN: 0, USER: 0 }, locked: 0, awaitingFirstPassword: 0 },
      }),
      detail: async () => { throw new Error("no"); },
      stepUp: async () => { throw new Error("down"); },
    };
    mount("/administration/users", { client });
    expect(await screen.findByText("Step-up state not read")).toBeTruthy();
  });
});

describe("drawer", () => {
  it("opens from the URL with the account's facts and history", async () => {
    mount("/administration/users?sel=usr_0001");
    const dock = await screen.findByRole("complementary");
    expect(within(dock).getByRole("heading", { name: "Bobby Vu" })).toBeTruthy();
    expect(dock.textContent).toContain("Administrator");
    await within(dock).findByRole("list", { name: "Account history" });
    const items = within(dock).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[2]!.textContent).toContain("Conflict");
    expect(items[2]!.textContent).toContain("ACCOUNT_REVISION_STALE");
  });

  it("opens by clicking a row and closes with Esc", async () => {
    mount();
    await loaded();
    fireEvent.click(rowsOf()[1]!);
    expect(search().get("sel")).toBe("usr_0002");
    await screen.findByRole("complementary");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(search().get("sel")).toBeNull());
  });

  it("every change is disabled with the reason, and the V1 route is linked when given", async () => {
    mount("/administration/users?sel=usr_0002", { legacyHref: "/administration/users?legacy=1" });
    const dock = await screen.findByRole("complementary");
    for (const name of ["Disable", "Archive"]) {
      const button = within(dock).getByRole("button", { name });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.getAttribute("aria-describedby")).toBeTruthy();
    }
    // One reason for both actions: printed once, and still each button's description.
    expect(within(dock).getAllByText(/Account changes are made on the current Users screen/)).toHaveLength(2);
    expect(dock.querySelectorAll(".exec-dock-reason")).toHaveLength(1);
    expect(dock.querySelectorAll(".exec-dock-sr")).toHaveLength(1);
    // Each blocked action carries its own link; the action is part of the name (WCAG 2.4.4).
    const legacy = within(dock).getAllByRole("link", { name: /^Current Users screen: / });
    expect(legacy.length).toBeGreaterThan(0);
    for (const link of legacy) expect(link.getAttribute("href")).toContain("legacy=1");
    expect(screen.queryByRole("button", { name: "Invite account" })).toBeNull();
  });

  it("never writes: the screen only issues GETs", async () => {
    mount("/administration/users?sel=usr_0001");
    await screen.findByRole("complementary");
    expect(calls.length).toBeGreaterThan(2);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("an id the roster does not hold says so instead of showing an empty account", async () => {
    mount("/administration/users?sel=usr_NOT_FOUND");
    const dock = await screen.findByRole("complementary");
    await waitFor(() => expect(dock.textContent).toContain("Account not in the roster read"));
    expect(dock.textContent).toMatch(/The account history could not be read|ACCOUNT_NOT_FOUND/);
  });
});

describe("states", () => {
  it("loading", async () => {
    mount();
    expect(screen.getByRole("status", { name: "Loading accounts" })).toBeTruthy();
    await loaded();
  });

  it("denied: a 403 is a denial with a link to My access, not an outage", async () => {
    variant("denied");
    mount("/administration/users", { accessHref: "/profile-access" });
    expect(await screen.findByText(/Users is for administrators/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "My access" }).getAttribute("href")).toBe("/profile-access");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("denied: My access is a router link that keeps the context (no full page reload)", async () => {
    variant("denied");
    mount("/administration/users?env=paper&workspace_id=ws_1", { accessHref: "/profile-access" });
    const link = await screen.findByRole("link", { name: "My access" });
    expect(link.getAttribute("href")).toBe("/profile-access?env=paper&workspace_id=ws_1");
    // A router link is handled in the page: the click is cancelled (a plain anchor would be left to the browser).
    expect(fireEvent.click(link)).toBe(false);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/profile-access?env=paper&workspace_id=ws_1"));
  });

  it("unavailable: a 503 names the code, offers Try again, and a retry recovers", async () => {
    variant("broken");
    mount();
    expect(await screen.findByText(/could not be read \(ACCOUNT_STORE_UNAVAILABLE\)/)).toBeTruthy();
    variant("paged");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await loaded();
  });

  it("empty: an empty roster is a different claim from a filter that matched nothing", async () => {
    variant("empty");
    mount();
    expect(await screen.findByText(/The roster is empty/)).toBeTruthy();
    expect(screen.queryByText("No accounts match these filters.")).toBeNull();
  });
});

/* ── pure model ──────────────────────────────────────────────────────── */

describe("usersModel", () => {
  it("gives each lifecycle state its own flag kind", () => {
    const kinds = Object.values(STATE_VIEW).map((v) => v.kind);
    expect(new Set(kinds).size).toBe(4);
  });

  it("reads the step-up state without recomputing it", () => {
    expect(stepUpView(null).kind).toBe("unknown");
    expect(stepUpView({ state: "ACTIVE", expiresAt: "2026-10-17T12:11:00Z" })).toMatchObject({ kind: "ok", until: "2026-10-17T12:11:00Z" });
    expect(stepUpView({ state: "REQUIRED", expiresAt: null })).toMatchObject({ kind: "approval", until: null });
  });

  it("a 401 or 403 is denied, anything else is unavailable, and an odd throw never leaks its text", () => {
    expect(failureOf({ status: 403, code: "X" }).status).toBe("denied");
    expect(failureOf({ status: 401 }).status).toBe("denied");
    expect(failureOf({ status: 500, code: "BOOM" })).toMatchObject({ status: "unavailable", reason: expect.stringContaining("BOOM") });
    expect(failureOf(new Error("secret stack text")).reason).not.toContain("secret");
    expect(failureOf(null).status).toBe("unavailable");
  });
});

/* ── F5 L3 negative: the roster read as the V2 screen consumes it ───────────────────────────
 *
 * The contract (rosterReader.ts): a malformed body is the honest "unavailable" state naming the
 * row and the field; ONE malformed row refuses the WHOLE roster (a partial table that looks real
 * would carry wrong counts); unknown extra keys are ignored and never shown. The old V1 repairs
 * (non-list read as an empty roster, a bad revision read as 0, a string row read as an account
 * with no id) are gone from this screen: each was a lie.
 */

const goodRow = (n: number, over: Record<string, unknown> = {}) => ({
  user_id: `usr_${n}`,
  username: `user${n}`,
  display_name: `Account ${n}`,
  role: "USER",
  account_state: "ACTIVE",
  must_change_password: false,
  account_revision: 3,
  locked: false,
  ...over,
});
/** A coherent page over `rows`: the counts are what the rows are, and there is no more. */
const pageOf = (rows: Record<string, unknown>[], extra: { page?: Record<string, unknown>; counts?: Record<string, unknown> } = {}) => {
  const n = (test: (row: Record<string, unknown>) => boolean) => rows.filter(test).length;
  return {
    accounts: rows,
    page: { limit: 50, returned_count: rows.length, has_more: false, next_cursor: null, ...extra.page },
    counts: {
      total: rows.length, matching: rows.length,
      by_state: { INVITED: n((r) => r.account_state === "INVITED"), ACTIVE: n((r) => r.account_state === "ACTIVE"), DISABLED: n((r) => r.account_state === "DISABLED"), ARCHIVED: n((r) => r.account_state === "ARCHIVED") },
      by_role: { ADMIN: n((r) => r.role === "ADMIN"), USER: n((r) => r.role === "USER") },
      locked: n((r) => r.locked === true), awaiting_first_password: n((r) => r.must_change_password === true && r.account_state !== "ARCHIVED"),
      ...extra.counts,
    },
  };
};
const goodBody = () => pageOf([goodRow(1), goodRow(2), goodRow(3)]);
const PROBE = "PROBE_HOSTILE_TEXT_9137";

/** The reader's verdict on a whole payload: rows when accepted, the refusal's location when not. A throw of any other kind fails the test. */
function verdict(body: unknown): { ok: true; rows: ReturnType<typeof readRoster> } | { ok: false; error: RosterMalformed } {
  try {
    return { ok: true, rows: readRoster(body) };
  } catch (error) {
    if (error instanceof RosterMalformed) return { ok: false, error };
    throw error;
  }
}

/** What the screen shows when it is handed `body` as the roster response. */
async function mountWith(body: unknown, init: ResponseInit = { status: 200 }, raw?: string) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://portal.test");
    if (url.pathname === "/api/admin/step-up") return new Response(JSON.stringify({ state: "REQUIRED", expires_at: null }), { status: 200 });
    return new Response(raw ?? JSON.stringify(body), init);
  }) as unknown as typeof fetch;
  mount();
  await waitFor(() => expect(screen.queryByRole("status", { name: "Loading accounts" })).toBeNull());
}
const unavailable = () => document.querySelector(".exec-state[data-status='unavailable']");

describe("roster reader: the V2 contract on each field the screen shows", () => {
  it("accepts a well-formed roster and reads every field it shows, and only those", () => {
    const v = verdict({ accounts: [{ ...goodRow(1), password_hash: "sekrit", extra: { nested: [1] } }] });
    expect(v.ok && v.rows).toEqual([{ userId: "usr_1", username: "user1", displayName: "Account 1", role: "USER", accountState: "ACTIVE", mustChangePassword: false, accountRevision: 3, locked: false }]);
  });

  const fields: [string, (c: NegativeCase) => boolean][] = [];
  const refusedAll = () => false;

  describe.each([
    ["user_id", () => stringCases(goodBody(), ["accounts", 1, "user_id"]), refusedAll],
    ["username", () => stringCases(goodBody(), ["accounts", 1, "username"]), refusedAll],
    ["display_name (absent, null, blank, or text up to 256 characters with unsafe characters replaced = read; wrong type or longer = refused)", () => stringCases(goodBody(), ["accounts", 1, "display_name"]), (c: NegativeCase) => {
      const v = getPath(c.value, ["accounts", 1, "display_name"]);
      return v === undefined || v === null || (typeof v === "string" && (v.trim() === "" || v.length <= 256));
    }],
    ["role", () => enumCases(goodBody(), ["accounts", 1, "role"], ["ADMIN", "USER"]), refusedAll],
    ["account_state", () => enumCases(goodBody(), ["accounts", 1, "account_state"], ["ACTIVE", "INVITED", "DISABLED", "ARCHIVED"]), refusedAll],
    ["account_revision (a count: null is not 0)", () => integerCases(goodBody(), ["accounts", 1, "account_revision"]), refusedAll],
  ] as const)("%s", (_field, make, accepted) => {
    const cases = make();
    it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
      const v = verdict(c.value);
      if (accepted(c)) {
        expect(v.ok, c.name).toBe(true);
        return;
      }
      expect(v.ok, c.name).toBe(false);
      if (!v.ok) {
        expect(v.error.code).toBe("ROSTER_MALFORMED");
        expect(v.error.where).toMatch(/^row 2, /);
        // The refusal names a position and a field, never the refused value.
        expect(v.error.message + v.error.where).not.toMatch(/PROBE|evil|XXXX/);
        expect(leaked({ code: v.error.code, where: v.error.where, message: v.error.message }, c.probe)).toBe(false);
      }
    });
  });
  void fields;

  it.each([
    ["must_change_password", "yes"], ["must_change_password", 1], ["must_change_password", 0], ["must_change_password", "true"], ["must_change_password", null], ["must_change_password", ABSENT], ["must_change_password", []],
    ["locked", "yes"], ["locked", 1], ["locked", 0], ["locked", "false"], ["locked", null], ["locked", ABSENT], ["locked", {}],
  ] as const)("%s <- %j is refused: a flag is true or false, never a guess", (field, value) => {
    const body = goodBody() as { accounts: Record<string, unknown>[] };
    if (value === ABSENT) delete body.accounts[1]![field];
    else body.accounts[1]![field] = value;
    const v = verdict(body);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.where).toBe(`row 2, ${field}`);
  });

  it("a revision of exactly 0 is a real 0 and is kept; nothing else becomes 0", () => {
    const v = verdict({ accounts: [goodRow(1, { account_revision: 0 })] });
    expect(v.ok && v.rows[0]!.accountRevision).toBe(0);
  });

  it("missing or null required keys: each refused by name (missing-required, null-vs-absent)", () => {
    const required = ["user_id", "username", "role", "account_state", "must_change_password", "locked", "account_revision"];
    for (const c of requiredCases(goodBody(), required.map((k) => ["accounts", 1, k]))) {
      const v = verdict(c.value);
      expect(v.ok, c.name).toBe(false);
      if (!v.ok) expect(v.error.where, c.name).toMatch(/^row 2, /);
    }
  });

  it("the container: not an array, null, absent, array elements of the wrong type, a half-keyed row and a repeated id are refused; a shorter list is a valid shorter roster", () => {
    for (const c of arrayCases(goodBody(), ["accounts"], { idKey: "user_id" })) {
      const v = verdict(c.value);
      if (c.category === "truncated" && /<- cut to \d+ of \d+$/.test(c.name)) {
        expect(v.ok, c.name).toBe(true);
        continue;
      }
      expect(v.ok, c.name).toBe(false);
    }
  });

  it("bad roots: null, text, a bare array, an empty object, a Map, 5000-deep nesting are refused and never throw anything else", () => {
    for (const c of rootCases()) expect(verdict(c.value).ok, c.name).toBe(false);
    expect(verdict({ accounts: [] }).ok).toBe(true);
  });

  it("duplicate user ids: the second is refused by position (two rows would collide on selection and keys)", () => {
    const v = verdict({ accounts: [goodRow(1), goodRow(2), goodRow(1, { username: "other" })] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.where).toBe("row 3, user_id (repeated)");
  });

  const UNSAFE_SAMPLES = ["a\u0000b", "a\nb", "a\tb", "a\u007fb", "a\u0085b", "a\u2028b", "a\u2029b", "a\u202eb", "a\u202ab", "a\u2066b", "a\u2069b", "a\u200eb", "a\u200fb", "a\u061cb"];

  it("control and bidirectional characters are refused in ids and usernames (identity); ordinary Unicode (Vietnamese, ZWJ emoji, RTL words without marks) is kept exactly", () => {
    for (const bad of UNSAFE_SAMPLES) {
      for (const field of ["user_id", "username"]) {
        const v = verdict({ accounts: [goodRow(1, { [field]: bad })] });
        expect(v.ok, `${field} <- ${JSON.stringify(bad)}`).toBe(false);
      }
    }
    const fine = "Nguy\u1ec5n V\u0103n A \u{1F468}\u200D\u{1F4BB} \u05e9\u05dc\u05d5\u05dd";
    const v = verdict({ accounts: [goodRow(1, { display_name: fine })] });
    expect(v.ok && v.rows[0]!.displayName).toBe(fine);
  });

  it("a display name with controls, separators or bidi marks is a valid account: it reads, each unsafe character becomes U+FFFD, and the raw string is gone", () => {
    for (const bad of [...UNSAFE_SAMPLES, "\u05e9\u05dc\u05d5\u05dd\u200f", "A\u0085B", "A\tB"]) {
      const v = verdict({ accounts: [goodRow(1, { display_name: bad })] });
      expect(v.ok, JSON.stringify(bad)).toBe(true);
      const shown = v.ok ? v.rows[0]!.displayName : "";
      expect(shown, JSON.stringify(bad)).toContain("\uFFFD");
      expect(shown).toHaveLength(bad.length);
      expect(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(shown)).toBe(false);
    }
    expect(verdict({ accounts: [goodRow(1, { display_name: "A\u0085B" })] })).toMatchObject({ ok: true, rows: [{ displayName: "A\uFFFDB" }] });
  });

  it("a display name of the wrong type or over 256 characters is still refused, and the refusal never echoes the value", () => {
    for (const bad of [5, true, {}, ["x"], "x".repeat(257), `${PROBE}\u200f`.padEnd(300, "z")]) {
      const v = verdict({ accounts: [goodRow(1, { display_name: bad })] });
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.error.where).toBe("row 1, display_name");
        expect(v.error.message).not.toContain(PROBE);
      }
    }
  });

  it("oversize: 256 characters are kept, 257 and 70,000 are refused (user_id, username, display_name)", () => {
    for (const field of ["user_id", "username", "display_name"]) {
      expect(verdict({ accounts: [goodRow(1, { [field]: "a".repeat(256) })] }).ok, `${field} 256`).toBe(true);
      expect(verdict({ accounts: [goodRow(1, { [field]: "a".repeat(257) })] }).ok, `${field} 257`).toBe(false);
      expect(verdict({ accounts: [goodRow(1, { [field]: "a".repeat(70_000) })] }).ok, `${field} 70k`).toBe(false);
    }
  });

  it("extra unknown keys (secrets, nested objects, __proto__, constructor) are ignored and never reach the rows", () => {
    for (const c of pollutionCases(goodBody(), [["accounts", 1], []])) {
      const v = verdict(c.value);
      expect(v.ok, c.name).toBe(true);
      expect(leaked(v.ok ? v.rows : null, c.probe), c.name).toBe(false);
      expect(prototypeIsClean()).toBe(true);
    }
    const parsed = JSON.parse(`{"accounts":[{"user_id":"u","username":"x","role":"USER","account_state":"ACTIVE","must_change_password":false,"locked":false,"account_revision":1,"__proto__":{"role":"ADMIN"},"role_preset":"ROOT"}]}`);
    const v = verdict(parsed);
    expect(v.ok && v.rows[0]!.role).toBe("USER");
    expect(v.ok && Object.keys(v.rows[0]!).sort()).toEqual(["accountRevision", "accountState", "displayName", "locked", "mustChangePassword", "role", "userId", "username"]);
  });

  it("10,000 rows are read whole and exactly (order kept, counts exact)", () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => goodRow(i + 1, { account_state: ["ACTIVE", "INVITED", "DISABLED", "ARCHIVED"][i % 4], locked: i % 10 === 0, role: i < 5 ? "ADMIN" : "USER" }));
    const v = verdict({ accounts: rows });
    if (!v.ok) throw new Error("a well-formed 10,000-row roster must be read");
    expect(v.rows).toHaveLength(10_000);
    expect(v.rows[0]!.userId).toBe("usr_1");
    expect(v.rows[9_999]!.userId).toBe("usr_10000");
    const read = v.rows;
    const by = (test: (row: (typeof read)[number]) => boolean) => read.filter(test).length;
    expect(by((r) => r.locked)).toBe(1_000);
    expect([by((r) => r.role === "ADMIN"), by((r) => r.role === "USER")]).toEqual([5, 9_995]);
    expect(["ACTIVE", "INVITED", "DISABLED", "ARCHIVED"].map((state) => by((r) => r.accountState === state))).toEqual([2_500, 2_500, 2_500, 2_500]);
  });

  it("10,000 rows with one bad row at the very end still refuse the whole roster, naming row 10000", () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => goodRow(i + 1));
    rows[9_999] = goodRow(10_000, { account_revision: "9" });
    const v = verdict({ accounts: rows });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.where).toBe("row 10000, account_revision");
  });
});

/* ── BE-P23: the keyset page as the screen consumes it (L0 shape, L1 coherence, L2 request, L3 negative) ───────────────── */

describe("roster page reader: the page and the counts are as strict as the rows", () => {
  const STATES = ["INVITED", "ACTIVE", "DISABLED", "ARCHIVED"] as const;
  /** A coherent page body over `accounts`; the counts are what the rows are, `over` replaces any part. */
  const pageBody = (accounts: Record<string, unknown>[], over: { page?: Record<string, unknown>; counts?: Record<string, unknown> } = {}) => {
    const by = (state: string) => accounts.filter((a) => a.account_state === state).length;
    return {
      schema_version: "portal.account-roster.v1",
      accounts,
      page: { limit: 50, returned_count: accounts.length, has_more: false, next_cursor: null, ...over.page },
      counts: {
        total: accounts.length, matching: accounts.length,
        by_state: Object.fromEntries(STATES.map((s) => [s, by(s)])),
        by_role: { ADMIN: accounts.filter((a) => a.role === "ADMIN").length, USER: accounts.filter((a) => a.role === "USER").length },
        locked: accounts.filter((a) => a.locked === true).length, awaiting_first_password: 0, ...over.counts,
      },
    };
  };
  const refused = (body: unknown): RosterMalformed => {
    try { readRosterPage(body); } catch (error) {
      if (error instanceof RosterMalformed) return error;
      throw error;
    }
    throw new Error("expected the page to be refused");
  };
  const rows = [goodRow(1), goodRow(2, { role: "ADMIN", locked: true }), goodRow(3, { account_state: "ARCHIVED" })];

  it("reads a coherent page: rows, page info and counts, in the screen's own words", () => {
    const read = readRosterPage(pageBody(rows, { page: { has_more: true, next_cursor: "kc1.k.abc.sig" }, counts: { total: 9, matching: 5, by_state: { INVITED: 1, ACTIVE: 6, DISABLED: 1, ARCHIVED: 1 }, by_role: { ADMIN: 2, USER: 7 }, locked: 2, awaiting_first_password: 3 } }));
    expect(read.accounts.map((a) => a.userId)).toEqual(["usr_1", "usr_2", "usr_3"]);
    expect(read.page).toEqual({ limit: 50, returnedCount: 3, hasMore: true, nextCursor: "kc1.k.abc.sig" });
    expect(read.counts).toEqual({ total: 9, matching: 5, byState: { INVITED: 1, ACTIVE: 6, DISABLED: 1, ARCHIVED: 1 }, byRole: { ADMIN: 2, USER: 7 }, locked: 2, awaitingFirstPassword: 3 });
  });

  it("an honest empty page is valid: no rows, no cursor, zero counts", () => {
    const read = readRosterPage(pageBody([]));
    expect(read.accounts).toEqual([]);
    expect(read.counts.total).toBe(0);
    expect(read.page.nextCursor).toBeNull();
  });

  it("unknown extra keys on the body, the page and the counts are ignored and never read", () => {
    const body = pageBody(rows);
    const read = readRosterPage({ ...body, secret: "x", page: { ...body.page, shard: 7 }, counts: { ...body.counts, hidden: 1 } });
    expect(Object.keys(read).sort()).toEqual(["accounts", "counts", "page"]);
    expect(Object.keys(read.page).sort()).toEqual(["hasMore", "limit", "nextCursor", "returnedCount"]);
    expect(Object.keys(read.counts).sort()).toEqual(["awaitingFirstPassword", "byRole", "byState", "locked", "matching", "total"]);
  });

  it.each([
    ["the old unpaged body (no page)", () => { const b: Record<string, unknown> = pageBody(rows); delete b.page; return b; }, "the body, page"],
    ["no counts", () => { const b: Record<string, unknown> = pageBody(rows); delete b.counts; return b; }, "the body, counts"],
    ["a page that is null", () => ({ ...pageBody(rows), page: null }), "the body, page"],
    ["a page that is a list", () => ({ ...pageBody(rows), page: [] }), "the body, page"],
    ["counts that is text", () => ({ ...pageBody(rows), counts: "all" }), "the body, counts"],
    ["a limit of 0", () => pageBody(rows, { page: { limit: 0 } }), "page, limit"],
    ["a limit of 201", () => pageBody(rows, { page: { limit: 201 } }), "page, limit"],
    ["a limit that is not an integer", () => pageBody(rows, { page: { limit: 2.5 } }), "page, limit"],
    ["a limit sent as text", () => pageBody(rows, { page: { limit: "50" } }), "page, limit"],
    ["a missing limit", () => pageBody(rows, { page: { limit: undefined } }), "page, limit"],
    ["more rows than the limit", () => pageBody(rows, { page: { limit: 2, returned_count: 3 } }), "page, returned_count"],
    ["a returned count that is not the rows", () => pageBody(rows, { page: { returned_count: 2 } }), "page, returned_count"],
    ["a negative returned count", () => pageBody(rows, { page: { returned_count: -3 } }), "page, returned_count"],
    ["has_more as text", () => pageBody(rows, { page: { has_more: "yes" } }), "page, has_more"],
    ["has_more with no cursor", () => pageBody(rows, { page: { has_more: true, next_cursor: null } }), "page, has_more"],
    ["a cursor with has_more false", () => pageBody(rows, { page: { has_more: false, next_cursor: "kc1.k.abc.sig" } }), "page, has_more"],
    ["has_more over an empty page", () => pageBody([], { page: { has_more: true, next_cursor: "kc1.k.abc.sig" } }), "page, has_more"],
    ["an empty cursor", () => pageBody(rows, { page: { has_more: true, next_cursor: "" } }), "page, next_cursor"],
    ["a cursor that is a number", () => pageBody(rows, { page: { has_more: true, next_cursor: 7 } }), "page, next_cursor"],
    ["a cursor over 4096 characters", () => pageBody(rows, { page: { has_more: true, next_cursor: "c".repeat(4097) } }), "page, next_cursor"],
    ["a cursor with a control character", () => pageBody(rows, { page: { has_more: true, next_cursor: "kc1.k.a\nb.sig" } }), "page, next_cursor"],
    ["an undefined cursor", () => pageBody(rows, { page: { next_cursor: undefined } }), "page, next_cursor"],
    ["a negative total", () => pageBody(rows, { counts: { total: -1 } }), "counts, total"],
    ["a total sent as text", () => pageBody(rows, { counts: { total: "3" } }), "counts, total"],
    ["a fractional matching", () => pageBody(rows, { counts: { matching: 2.5 } }), "counts, matching"],
    ["a locked that is null", () => pageBody(rows, { counts: { locked: null } }), "counts, locked"],
    ["by_state missing", () => pageBody(rows, { counts: { by_state: undefined } }), "counts, by_state"],
    ["by_state missing a state", () => pageBody(rows, { counts: { by_state: { INVITED: 0, ACTIVE: 2, DISABLED: 0 } } }), "counts, by_state, ARCHIVED"],
    ["by_state that does not add up to the total", () => pageBody(rows, { counts: { by_state: { INVITED: 0, ACTIVE: 1, DISABLED: 0, ARCHIVED: 1 } } }), "counts, by_state"],
    ["by_role that does not add up to the total", () => pageBody(rows, { counts: { by_role: { ADMIN: 0, USER: 1 } } }), "counts, by_role"],
    ["by_role missing a role", () => pageBody(rows, { counts: { by_role: { ADMIN: 1 } } }), "counts, by_role, USER"],
    ["matching above the total", () => pageBody(rows, { counts: { total: 3, matching: 4 } }), "counts, matching"],
    ["matching below the rows it holds", () => pageBody(rows, { counts: { matching: 2 } }), "counts, matching"],
    ["locked above the total", () => pageBody(rows, { counts: { locked: 4 } }), "counts, locked"],
    ["awaiting a first password above the total", () => pageBody(rows, { counts: { awaiting_first_password: 4 } }), "counts, awaiting_first_password"],
  ])("%s is refused whole, naming %s", (_name, make, where) => {
    const error = refused(make());
    expect(error.code).toBe("ROSTER_MALFORMED");
    expect(error.where).toBe(where);
  });

  it("a malformed row still refuses the whole page before the page is read, and names the row", () => {
    expect(refused(pageBody([goodRow(1), goodRow(2, { account_revision: "9" })])).where).toBe("row 2, account_revision");
    expect(refused(pageBody([goodRow(1), goodRow(1)])).where).toBe("row 2, user_id (repeated)");
  });

  it("a refusal names a place, never a value: the cursor, the counts and the rows are not echoed", () => {
    const error = refused(pageBody(rows, { page: { has_more: true, next_cursor: `${PROBE}\u0000` } }));
    expect(`${error.message} ${error.where}`).not.toContain(PROBE);
    const counts = refused(pageBody(rows, { counts: { total: "PROBE_TOTAL_77" } }));
    expect(`${counts.message} ${counts.where}`).not.toContain("PROBE_TOTAL_77");
  });

  it("5,000-deep and non-object bodies are refused as the body, never thrown as anything else", () => {
    let deep: unknown = { page: {} };
    for (let i = 0; i < 5000; i += 1) deep = { accounts: [], page: deep };
    for (const bad of [null, "x", 7, [], undefined]) expect(refused(bad).where).toBe("the body");
    expect(refused(deep).code).toBe("ROSTER_MALFORMED");
  });

  it("the detail's account is read with the row rules, and is absent or null as null", () => {
    expect(readDetailAccount({ account: goodRow(7), history: [] })).toMatchObject({ userId: "usr_7", username: "user7" });
    expect(readDetailAccount({ history: [] })).toBeNull();
    expect(readDetailAccount({ account: null })).toBeNull();
    expect(readDetailAccount("x")).toBeNull();
    for (const bad of [{ account: "usr_7" }, { account: goodRow(7, { role: "WIZARD" }) }, { account: goodRow(7, { username: `x‮` }) }]) {
      try { readDetailAccount(bad); throw new Error("expected a refusal"); } catch (error) {
        expect(error).toBeInstanceOf(RosterMalformed);
        expect((error as RosterMalformed).code).toBe("HISTORY_MALFORMED");
        expect((error as RosterMalformed).where.startsWith("account, ")).toBe(true);
      }
    }
  });
});

describe("roster request: only what was asked for, the cursor as given", () => {
  it("always sends the limit, and nothing for an empty filter", () => {
    expect(rosterPath({ limit: 50 })).toBe("/api/admin/accounts?limit=50");
    expect(rosterPath({ limit: 10, q: "   ", role: null, state: null, cursor: null })).toBe("/api/admin/accounts?limit=10");
  });

  it("trims the search and sends role, state and the cursor untouched", () => {
    const path = rosterPath({ limit: 10, q: "  Lan Tran ", role: "ADMIN", state: "ACTIVE", cursor: "kc1.k1.e30.AbC-_9" });
    const query = new URLSearchParams(path.split("?")[1]);
    expect(Object.fromEntries(query)).toEqual({ limit: "10", q: "Lan Tran", role: "ADMIN", state: "ACTIVE", cursor: "kc1.k1.e30.AbC-_9" });
  });

  it("encodes a search that would otherwise change the query", () => {
    const path = rosterPath({ limit: 50, q: "a&role=ADMIN#x" });
    expect(new URL(path, "http://portal.test").searchParams.get("q")).toBe("a&role=ADMIN#x");
    expect(new URL(path, "http://portal.test").searchParams.get("role")).toBeNull();
  });
});

describe("the double answers the two shapes the real contract does", () => {
  const ask = (query: string) => answerUsers("GET", "/api/admin/accounts", new URLSearchParams(query))!;

  it("no query is the whole unpaged list; any query is a page", () => {
    expect((ask("").body as { accounts: unknown[] }).accounts).toHaveLength(USERS_DOUBLE_COUNT);
    expect("page" in (ask("").body as object)).toBe(false);
    expect("page" in (ask("limit=5").body as object)).toBe(true);
  });

  it("walks 123 accounts once each in username order, with a stable total", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const body = ask(`limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`).body as { accounts: { username: string }[]; page: { next_cursor: string | null }; counts: { total: number } };
      seen.push(...body.accounts.map((a) => a.username));
      expect(body.counts.total).toBe(123);
      cursor = body.page.next_cursor;
    } while (cursor);
    expect(seen).toHaveLength(123);
    expect(seen).toEqual([...seen].sort());
  });

  it("refuses what the server refuses: bad limits and keys 400, a cursor under another filter 409, a mangled cursor 400", () => {
    for (const bad of ["limit=0", "limit=201", "limit=x", "role=SUPER", "state=GONE", "sort=role", "limit=5&limit=6"]) expect(ask(bad).status, bad).toBe(400);
    const cursor = ((ask("limit=5").body as { page: { next_cursor: string } }).page.next_cursor);
    expect(ask(`limit=5&cursor=${encodeURIComponent(cursor)}`).status).toBe(200);
    expect(ask(`limit=6&cursor=${encodeURIComponent(cursor)}`).status).toBe(409);
    expect(ask(`limit=5&role=USER&cursor=${encodeURIComponent(cursor)}`).status).toBe(409);
    expect(ask("limit=5&cursor=nope").status).toBe(400);
  });
});

describe("the screen on a malformed roster: unavailable, never a table that looks real, never 'the roster is empty'", () => {
  const refusals: [string, unknown, string][] = [
    ["a non-array container", { accounts: { length: 1, 0: goodRow(1) } }, "the body"],
    ["accounts null", { accounts: null }, "the body"],
    ["no accounts key", {}, "the body"],
    ["a bare array body", [goodRow(1)], "the body"],
    ["a null body", null, "the body"],
    ["a null row", { accounts: [goodRow(1), null] }, "row 2, row"],
    ["a string row", { accounts: [goodRow(1), "usr_2"] }, "row 2, row"],
    ["a wrong-typed id", { accounts: [goodRow(1, { user_id: 7 })] }, "row 1, user_id"],
    ["a missing username", { accounts: [goodRow(1), (() => { const r: Record<string, unknown> = goodRow(2); delete r.username; return r; })()] }, "row 2, username"],
    ["a null role", { accounts: [goodRow(1, { role: null })] }, "row 1, role"],
    ["an unknown role", { accounts: [goodRow(1, { role: "SUPERADMIN" })] }, "row 1, role"],
    ["an unknown state", { accounts: [goodRow(1, { account_state: "WIZARD" })] }, "row 1, account_state"],
    ["a revision sent as text", { accounts: [goodRow(1, { account_revision: "7" })] }, "row 1, account_revision"],
    ["a revision of null", { accounts: [goodRow(1, { account_revision: null })] }, "row 1, account_revision"],
    ["a non-boolean locked", { accounts: [goodRow(1, { locked: 1 })] }, "row 1, locked"],
    ["a 70,000 character username", { accounts: [goodRow(1, { username: `${PROBE}${"x".repeat(70_000)}` })] }, "row 1, username"],
    ["a display name of the wrong type", { accounts: [goodRow(1, { display_name: { [PROBE]: 1 } })] }, "row 1, display_name"],
    ["a bidi override in a username", { accounts: [goodRow(1, { username: `${PROBE}\u202eevil` })] }, "row 1, username"],
    ["a control character in an id", { accounts: [goodRow(1, { user_id: `${PROBE}\u0000` })] }, "row 1, user_id"],
    ["duplicate ids", { accounts: [goodRow(1), goodRow(1)] }, "row 2, user_id (repeated)"],
  ];

  it.each(refusals)("%s", async (_name, body, where) => {
    await mountWith(body);
    const state = unavailable();
    expect(state, "the unavailable state is shown").not.toBeNull();
    expect(state!.textContent).toContain(`The account roster could not be read (ROSTER_MALFORMED, ${where}).`);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Accounts" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Account counts" })).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/The roster is empty|No account has been created|in the roster read/);
    // Nothing of the body is echoed: not the probe, not an id, not the name.
    expect(text).not.toContain(PROBE);
    expect(text).not.toContain("usr_1");
    expect(text).not.toContain("user1");
  });

  it("text that is not JSON (a proxy's HTML page) is unavailable, not an empty roster", async () => {
    await mountWith(null, { status: 200 }, "<html>Bad gateway</html>");
    expect(unavailable()!.textContent).toContain("ROSTER_MALFORMED, the body");
    expect(document.body.textContent).not.toContain("Bad gateway");
    expect(screen.queryByRole("table", { name: "Accounts" })).toBeNull();
  });

  it("the honest empty roster is still empty: {accounts: []} is a different claim from a refused body", async () => {
    await mountWith(pageOf([]));
    expect(screen.getByText("The roster is empty. No account has been created.")).toBeTruthy();
    expect(unavailable()).toBeNull();
  });

  it("a refused roster recovers on Try again when the server then sends a good one", async () => {
    let n = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://portal.test");
      if (url.pathname === "/api/admin/step-up") return new Response(JSON.stringify({ state: "REQUIRED", expires_at: null }), { status: 200 });
      n += 1;
      return new Response(JSON.stringify(n === 1 ? { accounts: "rows" } : goodBody()), { status: 200 });
    }) as unknown as typeof fetch;
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await loaded();
    expect(rowsOf()).toHaveLength(3);
  });

  it("a good roster shows ordinary Unicode and exact strings untouched, and the extra keys do not appear", async () => {
    await mountWith(pageOf([goodRow(1, { display_name: "Nguy\u1ec5n V\u0103n A", username: "a.b_c-d", password_hash: "sekrit-hash" })]));
    expect(rowsOf()[0]!.querySelector("td[data-l='Account']")?.textContent).toContain("Nguy\u1ec5n V\u0103n A");
    expect(rowsOf()[0]!.querySelector("td[data-l='Account']")?.textContent).toContain("a.b_c-d");
    expect(document.body.textContent).not.toContain("sekrit-hash");
  });

  it("a name that is only spaces falls back to the username instead of a blank row", async () => {
    await mountWith(pageOf([goodRow(1, { display_name: "   " }), goodRow(2, { display_name: null })]));
    expect(rowsOf()[0]!.querySelector("td[data-l='Account'] .exec-usr-display")?.textContent).toBe("user1");
    expect(rowsOf()[1]!.querySelector("td[data-l='Account'] .exec-usr-display")?.textContent).toBe("user2");
  });

  it("a roster of 10,000: one page of 50 is read, the DOM stays at 50 rows, the counts are the server's exact ones", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => goodRow(i + 1, { account_state: i % 2 === 0 ? "ACTIVE" : "DISABLED" }));
    await mountWith(pageOf(rows, {
      page: { has_more: true, next_cursor: "kc1.k1.e30.sig" },
      counts: { total: 10_000, matching: 10_000, by_state: { INVITED: 0, ACTIVE: 5_000, DISABLED: 5_000, ARCHIVED: 0 }, by_role: { ADMIN: 0, USER: 10_000 } },
    }));
    expect(rowsOf()).toHaveLength(50);
    expect(screen.getByText("Showing 50 of 10000 accounts, 10000 in the roster read")).toBeTruthy();
    const kpis = screen.getByRole("region", { name: "Account counts" });
    expect(within(kpis).getByText("Accounts").parentElement?.textContent).toContain("10000");
    expect(within(kpis).getByText("Active").parentElement?.textContent).toContain("5000");
  });

  it("a server error is still worded as its code (503) and a 403 as a denial; neither is a malformed body", async () => {
    await mountWith({ error: { code: "ACCOUNT_STORE_UNAVAILABLE", message: "down" } }, { status: 503 });
    expect(unavailable()!.textContent).toContain("(ACCOUNT_STORE_UNAVAILABLE)");
    cleanup();
    await mountWith({ error: { code: "OWNER_ACCESS_REQUIRED" } }, { status: 403 });
    expect(document.querySelector(".exec-state[data-status='denied']")).not.toBeNull();
    cleanup();
    await mountWith({ error: { code: 7, message: { x: 1 } } }, { status: 500 });
    expect(unavailable()!.textContent).toContain("(ACCOUNT_REQUEST_FAILED)");
  });
});

describe("the drawer's history read: timestamps and entries (same refusal contract)", () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    operation_id: "op_1", action: "create", outcome: "APPLIED", reason_code: null, expected_revision: 0, resulting_revision: 1,
    rollback_description: "Archive the account.", step_up_used: false, occurred_at: "2026-09-30T08:00:00.000Z", ...over,
  });
  const history = (body: unknown) => {
    try {
      return { ok: true as const, rows: readHistory(body) };
    } catch (error) {
      if (error instanceof RosterMalformed) return { ok: false as const, error };
      throw error;
    }
  };

  it.each([
    ["a non-array history", { history: "x" }, "the body"],
    ["no history key", {}, "the body"],
    ["a null entry", { history: [entry(), null] }, "entry 2, entry"],
    ["an unknown outcome", { history: [entry({ outcome: "WIZARD" })] }, "entry 1, outcome"],
    ["a missing outcome", { history: [entry({ outcome: undefined })] }, "entry 1, outcome"],
    ["a timestamp in words", { history: [entry({ occurred_at: "yesterday" })] }, "entry 1, occurred_at"],
    ["a timestamp as a number", { history: [entry({ occurred_at: 1_790_000_000_000 })] }, "entry 1, occurred_at"],
    ["a 70,000 character timestamp", { history: [entry({ occurred_at: "2026-09-30T08:00:00Z".padEnd(70_000, "0") })] }, "entry 1, occurred_at"],
    ["a date with no time", { history: [entry({ occurred_at: "2026-09-30" })] }, "entry 1, occurred_at"],
    ["a bidi override in the action", { history: [entry({ action: "disable\u202e" })] }, "entry 1, action"],
    ["an expected revision as text", { history: [entry({ expected_revision: "0" })] }, "entry 1, expected_revision"],
    ["a negative resulting revision", { history: [entry({ resulting_revision: -1 })] }, "entry 1, resulting_revision"],
    ["a reason code that is an object", { history: [entry({ reason_code: {} })] }, "entry 1, reason_code"],
    ["a month 13", { history: [entry({ occurred_at: "2026-13-45T99:99Z" })] }, "entry 1, occurred_at"],
    ["a day the month does not have", { history: [entry({ occurred_at: "2026-02-30T08:00:00Z" })] }, "entry 1, occurred_at"],
    ["29 February in a common year", { history: [entry({ occurred_at: "2026-02-29T08:00:00Z" })] }, "entry 1, occurred_at"],
    ["day 31 of a 30-day month", { history: [entry({ occurred_at: "2026-04-31T08:00:00Z" })] }, "entry 1, occurred_at"],
    ["month 00", { history: [entry({ occurred_at: "2026-00-10T08:00:00Z" })] }, "entry 1, occurred_at"],
    ["day 00", { history: [entry({ occurred_at: "2026-09-00T08:00:00Z" })] }, "entry 1, occurred_at"],
    ["hour 24", { history: [entry({ occurred_at: "2026-09-30T24:00:00Z" })] }, "entry 1, occurred_at"],
    ["minute 60", { history: [entry({ occurred_at: "2026-09-30T08:60:00Z" })] }, "entry 1, occurred_at"],
    ["second 60", { history: [entry({ occurred_at: "2026-09-30T08:00:60Z" })] }, "entry 1, occurred_at"],
    ["an offset hour 24", { history: [entry({ occurred_at: "2026-09-30T08:00:00+24:00" })] }, "entry 1, occurred_at"],
    ["an offset minute 60", { history: [entry({ occurred_at: "2026-09-30T08:00:00+07:60" })] }, "entry 1, occurred_at"],
    ["an oversize rollback text", { history: [entry({ rollback_description: "r".repeat(70_000) })] }, "entry 1, rollback_description"],
  ] as const)("%s is refused whole, naming %s", (_name, body, where) => {
    const v = history(body);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error.code).toBe("HISTORY_MALFORMED");
      expect(v.error.where).toBe(where);
    }
  });

  it("a null or absent timestamp stays a gap (empty), never a made-up instant, and null resulting revision stays null (not 0)", () => {
    const v = history({ history: [entry({ occurred_at: null, resulting_revision: null }), entry({ operation_id: "op_2", occurred_at: undefined, reason_code: "ACCOUNT_REVISION_STALE" })] });
    expect(v.ok && v.rows.map((r) => [r.occurredAt, r.resultingRevision, r.reasonCode])).toEqual([["", null, null], ["", 1, "ACCOUNT_REVISION_STALE"]]);
  });

  it("real instants are kept: a leap day, the last second of the year, fractions, and an offset", () => {
    for (const at of ["2028-02-29T23:59:59.999999999Z", "2026-12-31T23:59:59Z", "2026-09-30T08:00Z", "2026-09-30T08:00:00-11:30", "2000-02-29T00:00:00Z"]) {
      const v = history({ history: [entry({ occurred_at: at })] });
      expect(v.ok && v.rows[0]!.occurredAt, at).toBe(at);
    }
  });

  it("a rollback description with controls or bidi marks reads, with U+FFFD in their place; reason_code and action stay strict", () => {
    const v = history({ history: [entry({ rollback_description: "Undo\u202e it\u0085now\t" })] });
    expect(v.ok && v.rows[0]!.rollbackDescription).toBe("Undo\uFFFD it\uFFFDnow\uFFFD");
    expect(history({ history: [entry({ reason_code: "X\u200f" })] }).ok).toBe(false);
    expect(history({ history: [entry({ action: "a\u0085b" })] }).ok).toBe(false);
  });

  it("offset timestamps and extra keys are kept and ignored respectively", () => {
    const v = history({ history: [entry({ occurred_at: "2026-09-30T08:00:00+07:00", secret: "x" })] });
    expect(v.ok && v.rows[0]!.occurredAt).toBe("2026-09-30T08:00:00+07:00");
  });

  async function openDrawer(historyBody: unknown) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://portal.test");
      if (url.pathname === "/api/admin/step-up") return new Response(JSON.stringify({ state: "REQUIRED", expires_at: null }), { status: 200 });
      if (url.pathname === "/api/admin/accounts") return new Response(JSON.stringify(goodBody()), { status: 200 });
      return new Response(JSON.stringify(historyBody), { status: 200 });
    }) as unknown as typeof fetch;
    mount("/administration/users?sel=usr_1");
    return screen.findByRole("complementary");
  }

  it("a malformed history is the drawer's unavailable state and the account's facts from the roster stay", async () => {
    const dock = await openDrawer({ history: [entry({ occurred_at: `${PROBE} yesterday` })] });
    await waitFor(() => expect(within(dock).getByText(/The account history could not be read \(HISTORY_MALFORMED, entry 1, occurred_at\)\./)).toBeTruthy());
    expect(within(dock).queryByRole("list", { name: "Account history" })).toBeNull();
    expect(within(dock).queryByText("This account has no recorded operations.")).toBeNull();
    expect(dock.textContent).toContain("Role");
    expect(dock.textContent).toContain("Revision");
    expect(document.body.textContent).not.toContain(PROBE);
  });

  it("a history with a null timestamp prints 'not published', not 1970 and not a blank", async () => {
    const dock = await openDrawer({ history: [entry({ occurred_at: null })] });
    const list = await within(dock).findByRole("list", { name: "Account history" });
    expect(list.textContent).toContain("not published");
    expect(list.textContent).not.toMatch(/1970|Invalid Date|NaN/);
  });

  it.each([[200, null], [201, "Showing 200 of 201 history entries"], [500, "Showing 200 of 500 history entries"]] as const)(
    "caps the history at 200 rows: %i entries show 200 and the label %s",
    async (count, label) => {
      const entries = Array.from({ length: count }, (_, i) => entry({ operation_id: `op_${i}`, occurred_at: "2026-09-30T08:00:00Z" }));
      const dock = await openDrawer({ history: entries });
      const list = await within(dock).findByRole("list", { name: "Account history" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(200);
      if (label) expect(within(dock).getByText(label)).toBeTruthy();
      else expect(dock.textContent).not.toMatch(/history entries/);
    },
  );
});

describe("the screen on a hostile display name: shown with U+FFFD, the raw bidi character never reaches the DOM", () => {
  it("the roster is reachable, the name has U+FFFD in place of the mark, and nothing unsafe is in the page", async () => {
    await mountWith(pageOf([goodRow(1, { display_name: "\u05e9\u05dc\u05d5\u05dd\u200f" }), goodRow(2, { display_name: "A\u0085B" }), goodRow(3)]));
    expect(unavailable()).toBeNull();
    expect(rowsOf()).toHaveLength(3);
    expect(document.body.textContent).toContain("\u05e9\u05dc\u05d5\u05dd\uFFFD");
    expect(document.body.textContent).toContain("A\uFFFDB");
    expect(/[\u0085\u200f\u202e]/.test(document.body.textContent ?? "")).toBe(false);
  });

  it("an identity field with the same character still refuses the whole roster, without echoing it", async () => {
    await mountWith({ accounts: [goodRow(1), goodRow(2, { username: `${PROBE}\u200f` })] });
    expect(unavailable()).not.toBeNull();
    expect(document.body.textContent).toContain("row 2, username");
    expect(document.body.textContent).not.toContain(PROBE);
  });
});
