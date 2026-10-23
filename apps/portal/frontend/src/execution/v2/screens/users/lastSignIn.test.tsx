/**
 * Users V2: the optional roster `last_sign_in_at` (FE-CAT-8), through the real client against the e2e double.
 * A published instant prints as received, null is "Never signed in", an omitted field keeps the typed gap, a malformed value
 * refuses the roster, and the field changes nothing about authority (the role preset stays an unpublished gap).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { answerUsers, setUsersDoubleLastSignIn, setUsersDoubleVariant } from "../../../../../e2e/bffDoubleUsers";
import UsersScreen from "./index";
import { readRoster, RosterMalformed } from "./rosterReader";

const originalFetch = globalThis.fetch;
beforeEach(() => {
  setUsersDoubleVariant("paged");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const answer = answerUsers(init?.method ?? "GET", url.pathname, url.searchParams);
    if (answer === null) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  setUsersDoubleLastSignIn(false);
  globalThis.fetch = originalFetch;
});

const row = (extra: Record<string, unknown> = {}) => ({
  user_id: "u1", username: "x", display_name: "X", role: "USER", account_state: "ACTIVE", must_change_password: false,
  locked: false, account_revision: 1, ...extra,
});
const page = (accounts: unknown[]) => ({ accounts });

describe("the reader", () => {
  it("keeps omitted omitted, null as never, and a UTC instant as received", () => {
    const [omitted] = readRoster(page([row()]));
    expect(Object.hasOwn(omitted!, "lastSignInAt")).toBe(false);
    expect(readRoster(page([row({ last_sign_in_at: null })]))[0]!.lastSignInAt).toBeNull();
    expect(readRoster(page([row({ last_sign_in_at: "2026-10-17T09:14:00Z" })]))[0]!.lastSignInAt).toBe("2026-10-17T09:14:00Z");
  });

  it("refuses a number, an epoch, a non-instant and an impossible date; a role preset key is still ignored", () => {
    for (const bad of [1760692440000, "yesterday", "", "2026-13-40T00:00:00Z", true, {}]) {
      expect(() => readRoster(page([row({ last_sign_in_at: bad })])), String(bad)).toThrow(RosterMalformed);
    }
    const [account] = readRoster(page([row({ role_preset: "ROOT" })]));
    expect(Object.keys(account!)).not.toContain("rolePreset");
    expect(account!.role).toBe("USER");
  });
});

describe("the Last seen column", () => {
  const rowsOf = () => within(screen.getByRole("table", { name: "Accounts" })).getAllByRole("row").slice(1);
  const cell = (r: HTMLElement, label: string) => r.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
  const mount = () => render(<MemoryRouter initialEntries={["/administration/users"]}><UsersScreen /></MemoryRouter>);

  it("without the published field every row keeps the typed gap (never a time, never a dash)", async () => {
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    for (const r of rowsOf()) {
      expect(cell(r, "Last seen (UTC)")).toContain("Not available");
      expect(cell(r, "Last seen (UTC)")).not.toMatch(/\d{1,2} \w{3}/);
    }
  });

  it("with it, a published instant prints, an account that never signed in says so, and Role preset stays a gap", async () => {
    setUsersDoubleLastSignIn(true);
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    const texts = rowsOf().map((r) => cell(r, "Last seen (UTC)"));
    expect(texts.some((t) => t.includes("Never signed in"))).toBe(true); // the INVITED accounts
    expect(texts.some((t) => /\b\d{1,2} Oct\b/.test(t) || t.includes("2026"))).toBe(true);
    expect(texts.every((t) => !t.includes("Not available"))).toBe(true);
    for (const r of rowsOf()) expect(cell(r, "Role preset")).toContain("Not available");
  });
});
