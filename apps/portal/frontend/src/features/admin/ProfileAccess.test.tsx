/**
 * Profile & Access — the Governance matrix (A4-3/A4-4).
 *
 * The claims worth defending: the server's answer decides who sees the page;
 * the owner is not a row anybody could clear; See and Decide are separate
 * grants and the grid says so; a `.decide` grant shows its implied `.read` as
 * covered but NOT independently revocable; nothing is sent until the owner
 * confirms, and not then without a step-up; and every response says the change
 * has no effect outside the Portal.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "../../auth/session";
import type { AuthPrincipal } from "../../auth/authApi";
import { ProfileAccess } from "./ProfileAccess";

const ACCESS_SELF = "/api/admin/access/self";
const POLICY = "/api/admin/profile-access";
const STEP_UP = "/api/admin/step-up";

const OWNER_ACCESS = {
  user_id: "p-bobby",
  is_owner: true,
  owner_state: "OWNER",
  capabilities: ["administration.profile_access.manage"],
};

const account = (over: Record<string, unknown> = {}) => ({
  user_id: "u-stan",
  username: "stan",
  display_name: "Stan",
  is_owner: false,
  account_state: "ACTIVE",
  capabilities: [],
  ...over,
});

const OWNER_ROW = account({
  user_id: "u-bobby",
  username: "bobby",
  display_name: "Bobby",
  is_owner: true,
});

function principal(): AuthPrincipal {
  return {
    principalId: "p-bobby", username: "bobby", role: "ADMIN", sessionId: "s-bobby",
    mustChangePassword: false, authnMethods: ["access", "password"],
    issuedAt: "2026-09-16T09:00:00+00:00", exp: 1_800_000_000,
  };
}

const originalFetch = globalThis.fetch;
const calls: { url: string; method: string; body: unknown; headers: Record<string, string> }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mount(options: {
  accounts?: unknown[];
  stepUp?: "ACTIVE" | "REQUIRED";
  access?: unknown;
  onWrite?: () => Response;
} = {}) {
  const rows = options.accounts ?? [OWNER_ROW, account()];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({
      url, method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    if (url === ACCESS_SELF) return json(options.access ?? OWNER_ACCESS);
    if (url.startsWith(STEP_UP)) {
      return json({ state: options.stepUp ?? "ACTIVE", expires_at: "2026-09-16T10:00:00Z" });
    }
    if (url.startsWith(`${POLICY}/activity`)) return json({ activity: [] });
    if (url === POLICY && method === "GET") return json({ accounts: rows });
    if (method !== "GET") return options.onWrite ? options.onWrite() : json({ outcome: "APPLIED", event_id: "e1", external_effect: "NONE" }, 201);
    return json({});
  }) as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider principal={principal()}>
        <ProfileAccess />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-portal_csrf=csrf-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("authority", () => {
  it("denies a non-owner and never asks for the policy", async () => {
    mount({ access: { user_id: "u-x", is_owner: false, owner_state: "NOT_OWNER", capabilities: [] } });
    expect(await screen.findByText(/belongs to the Portal owner/)).toBeTruthy();
    expect(calls.filter((c) => c.url === POLICY)).toHaveLength(0);
  });
});

describe("the matrix", () => {
  it("keeps the owner out of the grid and says why", async () => {
    // The owner's authority is the anchor, so there is no cell that could
    // clear it. A Portal whose owner can be un-granted has no way back.
    mount();
    await screen.findByTestId("access-matrix");
    expect(screen.queryByTestId("access-row-bobby")).toBeNull();
    expect(screen.getByTestId("access-row-stan")).toBeTruthy();
    expect(screen.getByText(/not in this grid/)).toBeTruthy();
  });

  it("shows See and Decide as separate grants", async () => {
    mount({
      accounts: [
        OWNER_ROW,
        account({
          capabilities: [
            { capability: "governance.r1.read", grant_id: "g1", workspace_id: null, grant_revision: 1 },
          ],
        }),
      ],
    });
    await screen.findByTestId("access-matrix");
    expect(screen.getByTestId("access-cell-stan-r1-read").getAttribute("data-held")).toBe("true");
    expect(screen.getByTestId("access-cell-stan-r1-decide").getAttribute("data-held")).toBe("false");
  });

  it("shows the read implied by a decide as covered but not revocable on its own", async () => {
    /*
     * `*.decide` implies `*.read` on the server. Rendering the See cell as
     * empty would be a lie; rendering it as an ordinary grant would make a
     * click that cannot work look like a broken control. It is a third state,
     * and it says so.
     */
    mount({
      accounts: [
        OWNER_ROW,
        account({
          capabilities: [
            { capability: "governance.r2.decide", grant_id: "g2", workspace_id: null, grant_revision: 3 },
          ],
        }),
      ],
    });
    await screen.findByTestId("access-matrix");
    const implied = screen.getByTestId("access-cell-stan-r2-read") as HTMLButtonElement;
    expect(implied.getAttribute("data-held")).toBe("implied");
    expect(implied.disabled).toBe(true);
    expect(implied.title).toContain("Revoke Decide");
  });

  it("offers nothing to an account with no Portal access", async () => {
    mount({ accounts: [OWNER_ROW, account({ account_state: "ARCHIVED" })] });
    await screen.findByTestId("access-matrix");
    const cell = screen.getByTestId("access-cell-stan-live-decide") as HTMLButtonElement;
    expect(cell.disabled).toBe(true);
    expect(cell.title).toContain("no access to the Portal");
  });
});

describe("granting", () => {
  it("sends nothing until the owner confirms", async () => {
    mount();
    await screen.findByTestId("access-matrix");
    fireEvent.click(screen.getByTestId("access-cell-stan-canary-decide"));
    await screen.findByTestId("access-confirm");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("names the capability, the consequence and that nothing leaves the Portal", async () => {
    mount();
    await screen.findByTestId("access-matrix");
    fireEvent.click(screen.getByTestId("access-cell-stan-canary-decide"));
    const dialog = await screen.findByTestId("access-confirm");
    expect(dialog.textContent).toContain("governance.canary.decide");
    expect(dialog.textContent).toContain("NONE");
    // A grant never bypasses the gate's own rules, and the copy says so.
    expect(dialog.textContent).toContain("Evidence, quorum, expiry and self-approval");
  });

  it("blocks the change until the owner has stepped up", async () => {
    mount({ stepUp: "REQUIRED" });
    await screen.findByTestId("access-matrix");
    fireEvent.click(screen.getByTestId("access-cell-stan-r1-read"));
    await screen.findByTestId("access-confirm");
    const submit = screen.getByTestId("access-confirm-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.title).toContain("Re-enter your password");
  });

  it("posts the capability with CSRF and an idempotency key", async () => {
    mount();
    await screen.findByTestId("access-matrix");
    fireEvent.click(screen.getByTestId("access-cell-stan-r2-decide"));
    await screen.findByTestId("access-confirm");
    fireEvent.click(screen.getByTestId("access-confirm-submit"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const write = calls.find((c) => c.method === "POST")!;
    expect(write.body).toMatchObject({
      grantee_user_id: "u-stan",
      capability: "governance.r2.decide",
    });
    expect(write.headers["x-portal-csrf"]).toBe("csrf-token");
    expect(write.headers["x-portal-idempotency-key"]).toBeTruthy();
  });

  it("revokes a held grant by its id and revision, not by capability name", async () => {
    // The revision is what stops two owners interleaving; sending the
    // capability alone would make "revoke" mean "revoke whatever is there now".
    mount({
      accounts: [
        OWNER_ROW,
        account({
          capabilities: [
            { capability: "governance.live.read", grant_id: "g9", workspace_id: null, grant_revision: 4 },
          ],
        }),
      ],
    });
    await screen.findByTestId("access-matrix");
    fireEvent.click(screen.getByTestId("access-cell-stan-live-read"));
    await screen.findByTestId("access-confirm");
    fireEvent.click(screen.getByTestId("access-confirm-submit"));

    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    const write = calls.find((c) => c.method === "DELETE")!;
    expect(write.url).toContain("/g9");
    expect(write.body).toMatchObject({ expected_revision: 4 });
  });

  it("repeats the server's refusal in the server's own words", async () => {
    mount({
      onWrite: () =>
        json(
          {
            error: {
              code: "GRANTEE_NOT_IN_WORKSPACE",
              message: "stan is not a member of that workspace. A grant says what somebody may do, never where they may go.",
            },
          },
          409,
        ),
    });
    await screen.findByTestId("access-matrix");
    fireEvent.click(screen.getByTestId("access-cell-stan-r1-decide"));
    await screen.findByTestId("access-confirm");
    fireEvent.click(screen.getByTestId("access-confirm-submit"));

    expect(await screen.findByText(/never where they may go/)).toBeTruthy();
    expect(screen.getByText("GRANTEE_NOT_IN_WORKSPACE")).toBeTruthy();
  });
});
