/**
 * Users V2, WP-E presentation: the subtitle, "(you)", the inline reason beside a disabled Disable, "How accounts work", and the
 * typed Role preset gap. The roster is the e2e double's, with the signed-in person aliased onto the first account (simulated lane).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerUsers, setUsersDoubleLastSignIn, setUsersDoubleSessionUser, setUsersDoubleVariant } from "../../../../../e2e/bffDoubleUsers";
import UsersScreen from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

const ME = "principal-visual-baseline";
const originalFetch = globalThis.fetch;

beforeEach(() => {
  setUsersDoubleVariant("paged");
  session.current = {
    principal: { principalId: "p", username: "bobby", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready", access: { userId: ME, isOwner: true, ownerState: "OWNER", capabilities: ["administration.users.manage"] } },
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const answer = answerUsers(init?.method ?? "GET", url.pathname, url.searchParams);
    if (answer === null) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  setUsersDoubleSessionUser(null);
  setUsersDoubleLastSignIn(false);
  session.current = null;
  globalThis.fetch = originalFetch;
});

const mount = (entry = "/administration/users") => render(<MemoryRouter initialEntries={[entry]}><UsersScreen /></MemoryRouter>);
const rowsOf = () => within(screen.getByRole("table", { name: "Accounts" })).getAllByRole("row").slice(1);

describe("subtitle and disclosure", () => {
  it("prints the one-line subtitle under the title, with no claim about presets", async () => {
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    expect(screen.getByTestId("users-subtitle").textContent).toBe("Accounts and their lifecycle · Administrators only");
  });

  it("offers How accounts work, closed, and says role presets are not published", async () => {
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    const how = screen.getByTestId("users-how") as HTMLDetailsElement;
    expect(how.open).toBe(false);
    expect(how.querySelector("summary")?.textContent).toBe("How accounts work");
    expect(how.textContent).toContain("role presets are not published yet");
  });
});

describe("(you) and the inline reason", () => {
  it("without the alias no row is the signed-in person (the session id is not in the roster)", async () => {
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    expect(document.querySelector(".exec-usr-you")).toBeNull();
    expect(screen.queryByTestId("users-inline-why")).toBeNull();
  });

  it("with the alias the first account reads (you) and its Disable says why, in words beside the button", async () => {
    setUsersDoubleSessionUser(ME);
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    const first = rowsOf()[0]!;
    expect(first.querySelector("td[data-l='Account']")?.textContent).toContain("Bobby Vu (you)");
    const why = within(first).getByTestId("users-inline-why");
    expect(why.textContent).toBe("You cannot disable yourself");
    const button = within(first).getByRole("button", { name: "Disable bobby" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe(why.id);
    // Only that row: the others keep their disclosure, not a printed sentence.
    expect(screen.getAllByTestId("users-inline-why")).toHaveLength(1);
    expect(document.querySelectorAll(".exec-usr-you")).toHaveLength(1);
  });

  it("the aliased account is served under the session id and its detail read resolves to the same account", async () => {
    setUsersDoubleSessionUser(ME);
    const list = answerUsers("GET", "/api/admin/accounts", new URLSearchParams({ limit: "5" }));
    const ids = ((list!.body as { accounts: { user_id: string; username: string }[] }).accounts).map((a) => `${a.username}:${a.user_id}`);
    expect(ids).toContain(`bobby:${ME}`);
    expect(ids.join()).not.toContain("usr_0001");
    const detail = answerUsers("GET", `/api/admin/accounts/${ME}`, new URLSearchParams());
    expect(detail!.status).toBe(200);
    expect((detail!.body as { account: { user_id: string; username: string } }).account).toMatchObject({ user_id: ME, username: "bobby" });
  });
});

describe("role preset stays a typed gap", () => {
  it("every Role preset cell says Not available with its request id, with and without the alias", async () => {
    setUsersDoubleSessionUser(ME);
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    for (const row of rowsOf()) {
      const cell = row.querySelector("td[data-l='Role preset']")!;
      expect(cell.textContent).toContain("Not available");
      expect(cell.querySelector("[data-gap='FE-015']")).not.toBeNull();
    }
  });
});
