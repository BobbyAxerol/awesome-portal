/**
 * Users & Access — the owner account control desk (A4-2).
 *
 * The claims worth defending are the ones a working screen would not reveal:
 * the server's own answer decides who sees the page (A4-1 — a session role
 * never does); no destructive action happens from a row button; every
 * confirmation names the target, the consequence and the step-up state; a
 * refusal is repeated in the server's words rather than reworded; and the
 * activation credential is shown once and survives in no storage, no log and
 * no component that outlives the acknowledgement.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "../../auth/session";
import type { AuthPrincipal } from "../../auth/authApi";
import { UsersAccess } from "./UsersAccess";

const ACCESS_SELF = "/api/admin/access/self";
const ROSTER = "/api/admin/accounts";
const STEP_UP = "/api/admin/step-up";

const OWNER_ACCESS = {
  schema_version: "portal.owner-access.v1",
  user_id: "p-bobby",
  is_owner: true,
  owner_state: "OWNER",
  capabilities: ["administration.users.manage"],
};

const account = (over: Record<string, unknown> = {}) => ({
  user_id: "u-stan",
  username: "stan",
  display_name: "Stan",
  role: "USER",
  account_state: "ACTIVE",
  must_change_password: false,
  account_revision: 4,
  locked: false,
  ...over,
});

function principal(): AuthPrincipal {
  return {
    principalId: "p-bobby",
    username: "bobby",
    role: "ADMIN",
    sessionId: "s-bobby",
    mustChangePassword: false,
    authnMethods: ["access", "password"],
    issuedAt: "2026-09-16T09:00:00+00:00",
    exp: 1_800_000_000,
  };
}

const originalFetch = globalThis.fetch;
const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mount(options: {
  accounts?: unknown[];
  stepUp?: "ACTIVE" | "REQUIRED";
  access?: unknown;
  onWrite?: (url: string, method: string, body: unknown) => Response;
} = {}) {
  const rows = options.accounts ?? [account()];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({
      url,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url === ACCESS_SELF) return json(options.access ?? OWNER_ACCESS);
    if (url === STEP_UP && method === "GET") {
      return json({ state: options.stepUp ?? "REQUIRED", expires_at: options.stepUp === "ACTIVE" ? "2026-09-16T10:00:00Z" : null });
    }
    if (url === STEP_UP && method === "POST") {
      return json({ state: "ACTIVE", expires_at: "2026-09-16T10:00:00Z" }, 201);
    }
    if (url === ROSTER && method === "GET") {
      return json({ schema_version: "portal.account-roster.v1", accounts: rows });
    }
    if (method !== "GET" && options.onWrite) return options.onWrite(url, method, calls.at(-1)?.body);
    return json({ outcome: "APPLIED", operation_id: "alo_1", account: { user_id: "u-stan", username: "stan", account_revision: 5 }, rollback_description: "…" }, 201);
  }) as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider principal={principal()}>
        <UsersAccess />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-portal_csrf=csrf-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("authority", () => {
  it("denies a non-owner, whatever their role says", async () => {
    mount({ access: { user_id: "u-x", is_owner: false, owner_state: "NOT_OWNER", capabilities: [] } });
    expect(await screen.findByText(/A role is not ownership/)).toBeTruthy();
    expect(calls.filter((c) => c.url.startsWith(ROSTER))).toHaveLength(0);
  });

  it("says unavailable, not denied, when access cannot be read", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      String(input) === ACCESS_SELF ? json({ error: {} }, 500) : json({})) as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionProvider principal={principal()}>
          <UsersAccess />
        </SessionProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/could not be read/)).toBeTruthy();
  });
});

describe("the roster", () => {
  it("lists accounts with their state and the revision an action will pin to", async () => {
    mount({ accounts: [account(), account({ user_id: "u-old", username: "archived-one", account_state: "ARCHIVED", account_revision: 9 })] });
    await screen.findByTestId("account-roster");
    expect(screen.getByTestId("account-stan").getAttribute("data-state")).toBe("ACTIVE");
    expect(screen.getByTestId("account-archived-one").getAttribute("data-state")).toBe("ARCHIVED");
  });

  it("filters by username or display name", async () => {
    mount({ accounts: [account(), account({ user_id: "u-t", username: "thanhvuong", display_name: "Thanh" })] });
    await screen.findByTestId("account-roster");
    fireEvent.change(screen.getByTestId("account-search"), { target: { value: "thanh" } });
    expect(screen.queryByTestId("account-stan")).toBeNull();
    expect(screen.getByTestId("account-thanhvuong")).toBeTruthy();
  });
});

describe("nothing destructive happens from a row button", () => {
  it("never calls window.confirm", async () => {
    // §20.5: `window.confirm` is forbidden as the final product interaction. It
    // can show one string — not the target, not the consequence, not whether
    // the step-up is live — so people click through it.
    const confirmSpy = vi.spyOn(window, "confirm");
    mount({ stepUp: "ACTIVE" });
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await screen.findByTestId("account-action-confirm");
    fireEvent.click(screen.getByTestId("account-action-submit"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/disable"))).toBe(true));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("opens a confirmation that names the target, the consequence and the step-up state", async () => {
    mount({ stepUp: "ACTIVE" });
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    const dialog = await screen.findByTestId("account-action-confirm");
    expect(dialog.textContent).toContain("stan");
    expect(dialog.textContent).toContain("can no longer sign in");
    expect(screen.getByTestId("confirm-step-up-state").textContent).toContain("ACTIVE");
    // Nothing has been sent yet.
    expect(calls.filter((c) => c.method === "POST" && c.url.includes("/disable"))).toHaveLength(0);
  });

  it("blocks the action, with a reason, until the owner has stepped up", async () => {
    mount({ stepUp: "REQUIRED" });
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "End sessions" }));
    await screen.findByTestId("account-action-confirm");

    const submit = screen.getByTestId("account-action-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByTestId("account-action-blocked").textContent).toContain("password");
  });

  it("requires the username to be typed before archiving", async () => {
    // Archive is the one that reads as deletion. Typing the name is what makes
    // it a deliberate sentence rather than a reflex on whichever row the
    // cursor was over.
    mount({ stepUp: "ACTIVE" });
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await screen.findByTestId("account-action-confirm");

    const submit = screen.getByTestId("account-action-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("account-typed-confirmation"), { target: { value: "not-stan" } });
    expect((screen.getByTestId("account-action-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("account-typed-confirmation"), { target: { value: "stan" } });
    expect((screen.getByTestId("account-action-submit") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("the request the screen actually sends", () => {
  it("pins the revision it displayed and carries one idempotency key per confirmation", async () => {
    mount({ stepUp: "ACTIVE" });
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "End sessions" }));
    await screen.findByTestId("account-action-confirm");
    fireEvent.click(screen.getByTestId("account-action-submit"));

    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/revoke-sessions"))).toBe(true));
    const write = calls.find((c) => c.url.endsWith("/revoke-sessions"))!;
    expect((write.body as { expected_revision: number }).expected_revision).toBe(4);
    expect(write.headers["x-portal-idempotency-key"]).toBeTruthy();
    expect(write.headers["x-portal-csrf"]).toBe("csrf-token");
  });

  it("repeats the server's refusal in the server's own words", async () => {
    // A stale revision is the one failure where a generic message is useless:
    // the owner needs to know somebody else changed the account, not that
    // "something went wrong".
    mount({
      stepUp: "ACTIVE",
      onWrite: () =>
        json(
          {
            error: {
              code: "STALE_ACCOUNT_REVISION",
              message: "This account has changed since you loaded it (now revision 7). Refresh and try again.",
              request_id: "req-42",
            },
          },
          409,
        ),
    });
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "End sessions" }));
    await screen.findByTestId("account-action-confirm");
    fireEvent.click(screen.getByTestId("account-action-submit"));

    expect(await screen.findByText(/now revision 7/)).toBeTruthy();
    expect(screen.getByText("STALE_ACCOUNT_REVISION")).toBeTruthy();
    expect(screen.getByText(/req-42/)).toBeTruthy();
  });
});

describe("the credential is seen once and kept nowhere", () => {
  const issuing = () =>
    mount({
      stepUp: "ACTIVE",
      onWrite: (url) =>
        url.endsWith("/activation")
          ? json(
              {
                outcome: "APPLIED",
                operation_id: "alo_2",
                account: { user_id: "u-stan", username: "stan", account_revision: 5 },
                rollback_description: "Issue a fresh activation, which revokes this one.",
                activation: { token: "one-time-abc123", acknowledgement_required: true, note: "Shown once." },
              },
              201,
            )
          : json({}, 500),
    });

  it("shows it once, then removes it on an explicit acknowledgement", async () => {
    issuing();
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    await screen.findByTestId("account-action-confirm");
    fireEvent.click(screen.getByTestId("account-action-submit"));

    expect(await screen.findByTestId("activation-token")).toBeTruthy();
    expect(screen.getByTestId("activation-token").textContent).toBe("one-time-abc123");

    fireEvent.click(screen.getByTestId("activation-acknowledge"));
    await waitFor(() => expect(screen.queryByTestId("activation-token")).toBeNull());
    // And it does not come back on a re-render of the same roster.
    expect(document.body.textContent).not.toContain("one-time-abc123");
  });

  it("never writes it to storage, a log or the URL", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    issuing();
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    await screen.findByTestId("account-action-confirm");
    fireEvent.click(screen.getByTestId("account-action-submit"));
    await screen.findByTestId("activation-token");

    expect(JSON.stringify(window.localStorage)).not.toContain("one-time-abc123");
    expect(JSON.stringify(window.sessionStorage)).not.toContain("one-time-abc123");
    expect(window.location.href).not.toContain("one-time-abc123");
    for (const spy of [log, warn, error]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain("one-time-abc123");
      }
    }
  });

  it("does not open the handoff for a replay, which carries no credential", async () => {
    // The idempotency record exists so a retry can be ANSWERED. Re-revealing
    // on every retry would make "one view" mean "as many as the network felt
    // like", and rendering an empty panel would claim a credential exists.
    mount({
      stepUp: "ACTIVE",
      onWrite: () =>
        json(
          {
            outcome: "REPLAYED",
            operation_id: "alo_2",
            account: { user_id: "u-stan", username: "stan", account_revision: 5 },
            rollback_description: "Issue a fresh activation, which revokes this one.",
          },
          201,
        ),
    });
    await screen.findByTestId("account-roster");
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    await screen.findByTestId("account-action-confirm");
    fireEvent.click(screen.getByTestId("account-action-submit"));

    await waitFor(() => expect(screen.queryByTestId("account-action-confirm")).toBeNull());
    expect(screen.queryByTestId("activation-handoff")).toBeNull();
  });
});
