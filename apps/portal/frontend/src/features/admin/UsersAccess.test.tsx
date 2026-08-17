/**
 * Users & Access tests.
 *
 * The claims worth defending are all about authority and consequence:
 * a non-ADMIN session sees denied rather than an empty table; every destructive
 * action asks first and sends nothing when declined; a write carries the session
 * CSRF header; the one-time credential is shown once and never persisted; and a
 * server 403 is reported as the server's answer instead of being swallowed.
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

function mount(
  principal: AuthPrincipal | null,
  handler: (url: string, init?: RequestInit) => Response | Promise<Response> = () =>
    json({ users: [BOBBY, ANALYST] }),
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(input), method: init?.method ?? "GET", csrf: headers["x-portal-csrf"] });
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
  it("shows denied to a USER session instead of an empty table", async () => {
    mount(USER_PRINCIPAL);
    expect(await screen.findByText(/Chỉ ADMIN xem được màn này/)).toBeTruthy();
    expect(screen.queryByTestId("admin-users")).toBeNull();
    // Nothing is even asked for: an unauthorised reader does not probe the route.
    expect(calls).toHaveLength(0);
  });

  it("treats an absent session as not ADMIN", async () => {
    mount(null);
    expect(await screen.findByText(/Chỉ ADMIN xem được màn này/)).toBeTruthy();
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

    fireEvent.change(screen.getByLabelText("Role của analyst"), { target: { value: "ADMIN" } });

    expect(confirm.mock.calls[0][0]).toContain("thu hồi");
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
    expect(screen.getByText(/Chỉ hiện/)).toBeTruthy();
    // Never persisted anywhere a later session could read it.
    expect(window.localStorage.getItem("portal.admin.token")).toBeNull();
    expect(JSON.stringify(window.localStorage)).not.toContain("one-time-abc123");

    fireEvent.click(screen.getByRole("button", { name: "Đã lưu, ẩn đi" }));
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
                message: "Chỉ ADMIN được đổi account.",
                request_id: "req-777",
              },
            },
            403,
          )
        : json({ users: [BOBBY, ANALYST] }),
    );
    await screen.findByTestId("admin-users");

    fireEvent.click(screen.getAllByRole("button", { name: /Revoke sessions/ })[1]);

    expect(await screen.findByText("Chỉ ADMIN được đổi account.")).toBeTruthy();
    expect(screen.getByText(/req-777/)).toBeTruthy();
  });

  it("surfaces a failed read as failed, not as zero accounts", async () => {
    mount(ADMIN_PRINCIPAL, () => json({ error: { code: "BOOM" } }, 500));
    // `retry: 1` means the failure is not instant; the point is that it arrives
    // as a failure and never as "0 account".
    expect(
      await screen.findByText(/Không đọc được \/api\/admin\/users/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.queryByText(/0 account/)).toBeNull();
  });
});
