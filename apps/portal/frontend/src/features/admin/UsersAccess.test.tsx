/**
 * Users & Access tests.
 *
 * The claims worth defending are all about authority and consequence: the
 * server's own answer decides who sees the screen (A4-1 — a session role never
 * does, and loading, unavailable and denied stay three different screens);
 * every destructive action asks first and sends nothing when declined; a write
 * carries the session CSRF header; the one-time credential is shown once and
 * never persisted; and a server 403 is reported as the server's answer instead
 * of being swallowed.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "../../auth/session";
import type { AuthPrincipal } from "../../auth/authApi";
import { UsersAccess } from "./UsersAccess";

const BOBBY = {
  user_id: "u-1",
  username: "bobby",
  display_name: "Bobby",
  role: "ADMIN",
  status: "ACTIVE",
  must_change_password: false,
  locked_until: null,
  created_at: "2026-07-01T08:00:00+00:00",
  disabled_at: null,
};

const ANALYST = {
  user_id: "u-2",
  username: "analyst",
  display_name: "Quant Analyst",
  role: "USER",
  status: "ACTIVE",
  must_change_password: true,
  locked_until: null,
  created_at: "2026-08-02T08:00:00+00:00",
  disabled_at: null,
};

function principal(username: string, role: string): AuthPrincipal {
  return {
    principalId: `p-${username}`,
    username,
    role,
    sessionId: `s-${username}`,
    mustChangePassword: false,
    authnMethods: ["access", "password"],
    issuedAt: "2026-08-17T09:00:00+00:00",
    exp: 1_800_000_000,
  };
}

const ADMIN_PRINCIPAL = principal("bobby", "ADMIN");
const USER_PRINCIPAL = principal("analyst", "USER");

const originalFetch = globalThis.fetch;
const calls: { url: string; method: string; csrf: string | undefined }[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ACCESS_SELF = "/api/admin/access/self";

/** The server's answer for an owner; the only thing that opens this screen. */
const OWNER_ACCESS = {
  schema_version: "portal.owner-access.v1",
  user_id: "u-1",
  is_owner: true,
  owner_state: "OWNER",
  capabilities: ["administration.users.manage"],
};

const NOT_OWNER_ACCESS = {
  schema_version: "portal.owner-access.v1",
  user_id: "u-2",
  is_owner: false,
  owner_state: "NOT_OWNER",
  capabilities: [],
};

function mount(
  principal: AuthPrincipal | null,
  handler: (url: string, init?: RequestInit) => Response | Promise<Response> = () =>
    json({ users: [BOBBY, ANALYST] }),
  access: unknown = OWNER_ACCESS,
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(input), method: init?.method ?? "GET", csrf: headers["x-portal-csrf"] });
    // `/access/self` is answered here rather than by each test's handler: it is
    // the shell's question, not this screen's, and every test needs it.
    if (String(input) === ACCESS_SELF) {
      return access instanceof Response ? access.clone() : json(access);
    }
    return handler(String(input), init);
  }) as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider principal={principal}>
        <UsersAccess />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  // jsdom is http, so a `__Host-` cookie will not stick; the getter is stubbed.
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-portal_csrf=csrf-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("authority", () => {
  it("shows denied to a non-owner instead of an empty table", async () => {
    mount(USER_PRINCIPAL, undefined, NOT_OWNER_ACCESS);
    expect(await screen.findByText(/Account administration belongs to the Portal owner/)).toBeTruthy();
    expect(screen.queryByTestId("admin-users")).toBeNull();
    // The account list is never probed: the only request is the shell asking
    // what this caller may do.
    expect(calls.filter((call) => call.url.includes("/api/admin/users"))).toHaveLength(0);
  });

  it("denies an ADMIN role that is not the owner — a role is not ownership", async () => {
    // The regression this locks: the screen used to open for anyone whose
    // session said ADMIN. A4-F06. The principal below says ADMIN and the
    // server says not the owner; the server wins.
    mount(ADMIN_PRINCIPAL, undefined, NOT_OWNER_ACCESS);
    expect(await screen.findByText(/A role is not ownership/)).toBeTruthy();
    expect(calls.filter((call) => call.url.includes("/api/admin/users"))).toHaveLength(0);
  });

  it("names an unclaimed anchor as its own state, not as a refusal of this person", async () => {
    mount(ADMIN_PRINCIPAL, undefined, {
      user_id: "u-1",
      is_owner: false,
      owner_state: "OWNER_ANCHOR_UNCLAIMED",
      capabilities: [],
    });
    expect(await screen.findByText(/No Portal owner has been established/)).toBeTruthy();
  });

  it("says unavailable, not denied, when the access read fails", async () => {
    // The distinction that matters: "we could not ask" must never be rendered
    // as "you may not". One tells the reader to retry; the other sends them to
    // ask for access they may already have.
    mount(ADMIN_PRINCIPAL, undefined, json({ error: { request_id: "req-42" } }, 500));
    expect(await screen.findByText(/could not be read/)).toBeTruthy();
    expect(screen.queryByText(/belongs to the Portal owner/)).toBeNull();
    expect(screen.getByText("req-42")).toBeTruthy();
  });

  it("treats an absent session as not the owner", async () => {
    mount(null);
    expect(await screen.findByText(/could not be read/)).toBeTruthy();
    expect(calls.filter((call) => call.url.includes("/api/admin/users"))).toHaveLength(0);
  });

  it("never reads ownership out of a truthy-but-not-true flag", async () => {
    // A proxy that reshapes the body into `"true"` must not become permission.
    mount(ADMIN_PRINCIPAL, undefined, { user_id: "u-1", is_owner: "true", capabilities: [] });
    expect(await screen.findByText(/belongs to the Portal owner/)).toBeTruthy();
  });

  it("marks the caller's own row, the one change with no undo here", async () => {
    mount(ADMIN_PRINCIPAL);
    const own = await screen.findByTestId("admin-user-bobby");
    expect(own.getAttribute("data-self")).toBe("true");
    expect(screen.getByTestId("admin-user-analyst").getAttribute("data-self")).toBe("false");
  });
});

describe("mutations", () => {
  it("asks before disabling and sends nothing when declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount(ADMIN_PRINCIPAL);
    await screen.findByTestId("admin-users");
    calls.length = 0;

    fireEvent.click(screen.getAllByRole("button", { name: /Disable/ })[1]);

    expect(confirm).toHaveBeenCalled();
    expect(confirm.mock.calls[0][0]).toContain("analyst");
    expect(calls).toHaveLength(0);
  });

  it("posts disable with the session CSRF header once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(ADMIN_PRINCIPAL);
    await screen.findByTestId("admin-users");
    calls.length = 0;

    fireEvent.click(screen.getAllByRole("button", { name: /Disable/ })[1]);

    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    const post = calls.find((call) => call.method === "POST")!;
    expect(post.url).toBe("/api/admin/users/u-2/disable");
    expect(post.csrf).toBe("csrf-token");
  });

  it("says a role change revokes that user's sessions, before doing it", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(ADMIN_PRINCIPAL);
    await screen.findByTestId("admin-users");
    calls.length = 0;

    fireEvent.change(screen.getByLabelText("Role for analyst"), { target: { value: "ADMIN" } });

    expect(confirm.mock.calls[0][0]).toContain("revoked");
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")!.url).toBe("/api/admin/users/u-2");
  });

  it("shows a reset credential once, with the warning that it is not stored", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(ADMIN_PRINCIPAL, (url) =>
      url.endsWith("/reset-credential")
        ? json({ activation_token: "one-time-abc123" })
        : json({ users: [BOBBY, ANALYST] }),
    );
    await screen.findByTestId("admin-users");

    fireEvent.click(screen.getAllByRole("button", { name: /Reset credential/ })[1]);

    expect(await screen.findByText("one-time-abc123")).toBeTruthy();
    expect(screen.getByText(/Shown/)).toBeTruthy();
    // Never persisted anywhere a later session could read it.
    expect(window.localStorage.getItem("portal.admin.token")).toBeNull();
    expect(JSON.stringify(window.localStorage)).not.toContain("one-time-abc123");

    fireEvent.click(screen.getByRole("button", { name: "Saved — hide it" }));
    await waitFor(() => expect(screen.queryByText("one-time-abc123")).toBeNull());
  });

  it("reports a server 403 as the server's answer, with its request id", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(ADMIN_PRINCIPAL, (_url, init) =>
      init?.method === "POST"
        ? json(
            {
              error: {
                code: "FORBIDDEN",
                message: "Only an ADMIN may change an account.",
                request_id: "req-777",
              },
            },
            403,
          )
        : json({ users: [BOBBY, ANALYST] }),
    );
    await screen.findByTestId("admin-users");

    fireEvent.click(screen.getAllByRole("button", { name: /Revoke sessions/ })[1]);

    expect(await screen.findByText("Only an ADMIN may change an account.")).toBeTruthy();
    expect(screen.getByText(/req-777/)).toBeTruthy();
  });

  it("surfaces a failed read as failed, not as zero accounts", async () => {
    mount(ADMIN_PRINCIPAL, () => json({ error: { code: "BOOM" } }, 500));
    // `retry: 1` means the failure is not instant; the point is that it arrives
    // as a failure and never as "0 account".
    expect(
      await screen.findByText(/Could not read \/api\/admin\/users/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.queryByText(/0 account/)).toBeNull();
  });
});
