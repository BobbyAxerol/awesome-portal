/** The Users screen mounts the DR-30 execution grants panel only when the server publishes it (404 = feature off = hidden). */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerUsers, setUsersDoubleVariant } from "../../../../../e2e/bffDoubleUsers";
import { AuthRequestError } from "../../../../auth/authApi";
import type { GrantsClient } from "../../../../features/admin/executionGrantsApi";
import UsersScreen from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));
const originalFetch = globalThis.fetch;

beforeEach(() => {
  setUsersDoubleVariant("paged");
  session.current = {
    principal: { principalId: "p", username: "bobby", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready", access: { userId: "owner", isOwner: true, ownerState: "OWNER", capabilities: ["administration.users.manage"] } },
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const answer = answerUsers(init?.method ?? "GET", url.pathname, url.searchParams);
    if (answer === null) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); session.current = null; globalThis.fetch = originalFetch; });

const mount = (grantsClient?: GrantsClient | false) => render(<MemoryRouter initialEntries={["/administration/users"]}><UsersScreen grantsClient={grantsClient} /></MemoryRouter>);
const client = (list: GrantsClient["list"]): GrantsClient => ({ list, grant: vi.fn(), renew: vi.fn(), revoke: vi.fn(), confirmPassword: vi.fn() });

describe("Users screen and the execution grants panel", () => {
  it("shows the panel when the server publishes the grants", async () => {
    mount(client(async () => ({ workspaceId: "ws", maxTermDays: 365, grants: [], candidates: [] })));
    await screen.findByRole("table", { name: "Accounts" });
    expect(await screen.findByText("Execution access")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Grant access" })).toBeTruthy();
  });
  it("hides it when the server answers 404 (feature off)", async () => {
    const list = vi.fn(async () => { throw new AuthRequestError(404, "NOT_FOUND", "x", null); });
    mount(client(list));
    await screen.findByRole("table", { name: "Accounts" });
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByText("Execution access")).toBeNull();
  });
  it("the default network client reads the real path and a 404 there also hides it", async () => {
    mount();
    await screen.findByRole("table", { name: "Accounts" });
    await vi.waitFor(() => expect(screen.queryByLabelText("Loading execution access")).toBeNull());
    expect(screen.queryByText("Execution access")).toBeNull();
  });
});
