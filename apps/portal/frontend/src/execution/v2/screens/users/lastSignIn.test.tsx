/**
 * Users V2: the optional roster `last_sign_in_at` (FE-CAT-8), through the real client against the e2e double.
 * A published instant prints as received, an omitted field or a bare null keeps the typed gap (no "Never signed in": no coverage statement is published), a malformed value
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
  it("keeps omitted omitted, reads a bare null as unknown too (never 'never signed in'), and a UTC instant as received", () => {
    const [omitted] = readRoster(page([row()]));
    expect(Object.hasOwn(omitted!, "lastSignInAt")).toBe(false);
    expect(Object.hasOwn(readRoster(page([row({ last_sign_in_at: null })]))[0]!, "lastSignInAt")).toBe(false);
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

  it("with it, most rows print the instant, the rows whose history is unknown keep the typed gap (never 'Never signed in'), and Role preset stays a gap", async () => {
    setUsersDoubleLastSignIn(true);
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    const texts = rowsOf().map((r) => cell(r, "Last seen (UTC)"));
    expect(texts.every((t) => !t.includes("Never signed in"))).toBe(true);
    expect(texts.some((t) => /\b\d{1,2} Aug\b/.test(t) || t.includes("2026"))).toBe(true);
    // The INVITED accounts and every seventh one are omitted by the double, and read as unknown.
    const unknown = texts.filter((t) => t.includes("Not available"));
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown.length).toBeLessThan(texts.length / 2);
  });

  it("a bare null from the producer reads as unknown, not as never", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://portal.test");
      const answer = answerUsers(init?.method ?? "GET", url.pathname, url.searchParams)!;
      const body = answer.body as { accounts?: Record<string, unknown>[] };
      // Every roster row carries a bare null, as a producer that wrote null for unknown history would.
      if (Array.isArray(body.accounts)) body.accounts = body.accounts.map((a) => ({ ...a, last_sign_in_at: null }));
      return new Response(JSON.stringify(body), { status: answer.status, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    try {
      mount();
      await screen.findByRole("table", { name: "Accounts" });
      for (const r of rowsOf()) expect(cell(r, "Last seen (UTC)")).toContain("Not available");
      expect(document.body.textContent).not.toContain("Never signed in");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("the double never serves null: every row either carries an instant or omits the key", () => {
    setUsersDoubleLastSignIn(true);
    const body = answerUsers("GET", "/api/admin/accounts", new URLSearchParams({ limit: "50" }))!.body as { accounts: Record<string, unknown>[] };
    for (const a of body.accounts) expect("last_sign_in_at" in a ? typeof a.last_sign_in_at : "omitted").toMatch(/^(string|omitted)$/);
    expect(body.accounts.some((a) => !("last_sign_in_at" in a))).toBe(true);
    expect(body.accounts.some((a) => "last_sign_in_at" in a)).toBe(true);
  });

  it("Role preset stays a gap beside the instants", async () => {
    setUsersDoubleLastSignIn(true);
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    for (const r of rowsOf()) expect(cell(r, "Role preset")).toContain("Not available");
  });
});
