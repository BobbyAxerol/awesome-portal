/**
 * Users V2: the roster, the filters, the drawer and every state, through the
 * real `accountApi` client against the Playwright double's routes.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { answerUsers, setUsersDoubleVariant, USERS_DOUBLE_COUNT, type UsersDoubleVariant } from "../../../../../e2e/bffDoubleUsers";
import type { AccountSummary } from "../../../../features/admin/accountApi";
import UsersScreen, { USERS_SCREEN_KEY, type UsersClient } from "./index";
import {
  failureOf, filterAccounts, matchesQuery, NO_FILTERS, ROW_CAP, rosterCounts, stepUpView, STATE_VIEW,
} from "./usersModel";

const originalFetch = globalThis.fetch;
const calls: { method: string; path: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  setUsersDoubleVariant("paged");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname });
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

  it("names role presets and last sign-in as not published, with their request ids", async () => {
    mount("/administration/users?sel=usr_0001");
    await loaded();
    const note = document.querySelector(".exec-usr-unpub")!;
    expect(note.textContent).toContain("Not published (FE-015, FE-026, FE-037, FE-038) Role presets");
    expect(note.textContent).toContain("Not published (FE-053) Last sign-in");
    expect(note.querySelectorAll("li").length).toBe(3);
    expect(note.textContent).not.toMatch(/no request/i);
    const dock = await screen.findByRole("complementary");
    expect(dock.textContent).toContain("Not published (FE-015, FE-026, FE-037, FE-038)");
    expect(dock.textContent).toContain("Not published (FE-053)");
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

describe("paging, search and filters (in memory, over the roster read)", () => {
  it("adds 50 rows per Load more and says how many of how many", async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(rowsOf()).toHaveLength(100);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(rowsOf()).toHaveLength(ROW_CAP > USERS_DOUBLE_COUNT ? USERS_DOUBLE_COUNT : ROW_CAP);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText(/Showing 123 of 123 accounts/)).toBeTruthy();
  });

  it("filters by name or username and writes the search to the URL after a pause", async () => {
    mount();
    await loaded();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "lan" } });
    expect(rowsOf()).toHaveLength(1);
    expect(rowsOf()[0]!.textContent).toContain("Lan Tran");
    expect(screen.getByText(/Showing 1 of 1 matching accounts, 123 in the roster read/)).toBeTruthy();
    await waitFor(() => expect(search().get("q")).toBe("lan"));
  });

  it("filters by V1 role and by lifecycle state from the URL, and counts each option", async () => {
    mount("/administration/users?role=ADMIN&state=ACTIVE");
    await loaded();
    expect(rowsOf().map((r) => r.querySelector("td[data-l='Role']")?.textContent)).toEqual(["Administrator", "Administrator", "Administrator"]);
    expect(screen.getByRole("option", { name: "Administrator (3)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Archived (12)" })).toBeTruthy();
  });

  it("an unknown role or state in the URL is ignored, not applied", async () => {
    mount("/administration/users?role=SUPER&state=GONE");
    await loaded();
    expect(rowsOf()).toHaveLength(50);
  });

  it("says so, with a way out, when nothing matches", async () => {
    mount();
    await loaded();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "no-such-person" } });
    expect(screen.getByText("No accounts match these filters.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    await waitFor(() => expect(rowsOf()).toHaveLength(50));
  });
});

describe("scale and keyboard", () => {
  const many = (n: number): AccountSummary[] =>
    Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, username: `user${i}`, displayName: `User ${i}`, role: "USER", accountState: "ACTIVE", mustChangePassword: false, accountRevision: 1, locked: false }));

  it("never puts more than 200 rows in the DOM, says so, and tells the reader to narrow the search", async () => {
    const client: UsersClient = { roster: async () => many(300), detail: async () => { throw new Error("n/a"); }, stepUp: async () => ({ state: "REQUIRED", expiresAt: null }) };
    mount("/administration/users", { client });
    await loaded();
    for (let i = 0; i < 6; i += 1) {
      const more = screen.queryByRole("button", { name: "Load more" });
      if (more) fireEvent.click(more);
    }
    expect(rowsOf()).toHaveLength(ROW_CAP);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText(/Showing the first 200 rows\. Narrow the search to see the rest\./)).toBeTruthy();
    expect(screen.getByText(/Showing 200 of 300 accounts, 300 in the roster read/)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "user299" } });
    expect(rowsOf()).toHaveLength(1);
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
    expect(screen.getByText(/until 2026-10-17 12:11:00 UTC/)).toBeTruthy();
  });

  it("says it was not read, rather than required, when that read fails", async () => {
    const client: UsersClient = {
      roster: async () => [],
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
    expect(within(dock).getAllByText(/Account changes are made on the current Users screen/).length).toBeGreaterThan(0);
    expect(within(dock).getByRole("link", { name: "Current Users screen" }).getAttribute("href")).toContain("legacy=1");
    expect((screen.getByRole("button", { name: "Invite account" }) as HTMLButtonElement).disabled).toBe(true);
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
    expect(dock.textContent).toContain("Account not in the roster read");
    await waitFor(() => expect(dock.textContent).toMatch(/The account roster could not be read|ACCOUNT_NOT_FOUND/));
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

const account = (over: Partial<AccountSummary>): AccountSummary => ({
  userId: "u1", username: "alice", displayName: "Alice Nguyen", role: "USER", accountState: "ACTIVE",
  mustChangePassword: false, accountRevision: 1, locked: false, ...over,
});

describe("usersModel", () => {
  it("matches name or username, ignoring case and surrounding space", () => {
    expect(matchesQuery(account({}), "  ALI ")).toBe(true);
    expect(matchesQuery(account({}), "nguyen")).toBe(true);
    expect(matchesQuery(account({}), "bob")).toBe(false);
    expect(matchesQuery(account({}), "")).toBe(true);
  });

  it("filters on all three axes together", () => {
    const list = [
      account({ userId: "a", role: "ADMIN" }),
      account({ userId: "b", accountState: "DISABLED" }),
      account({ userId: "c", role: "ADMIN", accountState: "DISABLED" }),
    ];
    expect(filterAccounts(list, { ...NO_FILTERS, role: "ADMIN", state: "DISABLED" }).map((a) => a.userId)).toEqual(["c"]);
    expect(filterAccounts(list, NO_FILTERS)).toHaveLength(3);
  });

  it("counts every state and role, locked, and awaiting a first password except when archived", () => {
    const counts = rosterCounts([
      account({ accountState: "INVITED", mustChangePassword: true }),
      account({ accountState: "ARCHIVED", mustChangePassword: true }),
      account({ locked: true, role: "ADMIN" }),
    ]);
    expect(counts).toMatchObject({ total: 3, locked: 1, awaitingFirstPassword: 1 });
    expect(counts.byState).toEqual({ ACTIVE: 1, INVITED: 1, DISABLED: 0, ARCHIVED: 1 });
    expect(counts.byRole).toEqual({ ADMIN: 1, USER: 2 });
  });

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

describe("roster reader (V1 accountApi) on hostile bodies", () => {
  it("an unknown role reads as USER and an unknown state as DISABLED, never ADMIN or ACTIVE", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      accounts: [{ user_id: "u", username: "x", display_name: "X", role: "SUPERADMIN", account_state: "WIZARD", must_change_password: "yes", account_revision: "7", locked: 1 }],
    }), { status: 200 })) as unknown as typeof fetch;
    mount();
    await loaded();
    const row = rowsOf()[0]!;
    expect(row.querySelector("td[data-l='Role']")?.textContent).toBe("User");
    expect(row.querySelector("td[data-l='State']")?.textContent).toContain("Disabled");
    expect(row.querySelector("td[data-l='Revision']")?.textContent).toBe("0");
  });
});
