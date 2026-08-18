/**
 * U07 auth tests (v0.4 §21.1 Frames 01B–01D).
 *
 * The claims that matter are the ones a bug would quietly break: the backend
 * owns the state machine, an unclassifiable answer never lets the shell mount,
 * the verified email is not an editable field, errors carry a request id without
 * revealing whether an account exists, and the change-password frame does not
 * continue into the shell on success.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGate } from "./AuthGate";
import { csrfTokenFromCookie } from "./authApi";

const originalFetch = globalThis.fetch;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function mount(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
  return render(
    <AuthGate>
      <div data-testid="shell">shell</div>
    </AuthGate>,
  );
}

const context = (state: string, extra: Record<string, unknown> = {}) =>
  json({ state, principal: null, access_identity: { sub: "sub-1", email: "name@azdag.com" }, ...extra });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  document.cookie = "__Host-portal_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  vi.restoreAllMocks();
});

describe("state machine", () => {
  it("mounts the shell only when the BFF says AUTHENTICATED", async () => {
    mount(() =>
      json({
        state: "AUTHENTICATED",
        principal: { username: "bobby", role: "ADMIN", exp: 1 },
        access_identity: { sub: "s", email: "name@azdag.com" },
      }),
    );
    expect(await screen.findByTestId("shell")).toBeTruthy();
  });

  it("shows the login frame for APP_LOGIN_REQUIRED", async () => {
    mount(() => context("APP_LOGIN_REQUIRED"));
    expect(await screen.findByTestId("login-screen")).toBeTruthy();
    expect(screen.queryByTestId("shell")).toBeNull();
  });

  it("shows the password-change frame for PASSWORD_CHANGE_REQUIRED", async () => {
    mount(() => context("PASSWORD_CHANGE_REQUIRED"));
    expect(await screen.findByTestId("password-change-screen")).toBeTruthy();
    expect(screen.queryByTestId("shell")).toBeNull();
  });

  it("shows the denied frame for ACCOUNT_DISABLED", async () => {
    mount(() => context("ACCOUNT_DISABLED"));
    const frame = await screen.findByTestId("access-problem-screen");
    expect(frame.dataset.problem).toBe("ACCOUNT_DISABLED");
  });

  it("treats an unrecognised state as the most restrictive one, never as authenticated", async () => {
    // A backend that grows a state must not accidentally open the shell.
    mount(() => context("SOMETHING_NEW"));
    const frame = await screen.findByTestId("access-problem-screen");
    expect(frame.dataset.problem).toBe("ACCESS_REQUIRED");
    expect(screen.queryByTestId("shell")).toBeNull();
  });

  it("does not mount the shell while the context is still loading", () => {
    mount(() => new Promise<Response>(() => {}));
    expect(screen.queryByTestId("shell")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("gateway not in front", () => {
  it("renders the shell and says the identity BFF is absent", async () => {
    // `vite dev`, or the documented rollback upstream. A login form no backend
    // can answer would be worse than saying so.
    mount(() => json({ detail: "not found" }, 404));
    expect(await screen.findByTestId("shell")).toBeTruthy();
    expect(screen.getByText(/identity BFF is absent from this build/)).toBeTruthy();
  });

  it("distinguishes an outage from an absent gateway", async () => {
    mount(() => json({ error: { message: "boom", request_id: "req-9" } }, 503));
    const frame = await screen.findByTestId("access-problem-screen");
    expect(frame.dataset.problem).toBe("IDENTITY_UNAVAILABLE");
    expect(screen.getByText(/req-9/)).toBeTruthy();
    expect(screen.queryByTestId("shell")).toBeNull();
  });
});

describe("Frame 01B", () => {
  it("renders the verified email as output, not as an input", async () => {
    mount(() => context("APP_LOGIN_REQUIRED"));
    await screen.findByTestId("login-screen");
    // The user does not get to choose their Access identity.
    const email = screen.getByText("name@azdag.com");
    expect(email.tagName).toBe("OUTPUT");
    expect(screen.queryByDisplayValue("name@azdag.com")).toBeNull();
  });

  it("uses the credential autocomplete hints password managers need", async () => {
    mount(() => context("APP_LOGIN_REQUIRED"));
    await screen.findByTestId("login-screen");
    expect(screen.getByLabelText("Username").getAttribute("autocomplete")).toBe("username");
    expect(
      screen.getByLabelText(/Password or activation credential/).getAttribute("autocomplete"),
    ).toBe("current-password");
  });

  it("shows the server's generic message with a request id, and clears the credential", async () => {
    mount((url) =>
      url.endsWith("/login")
        ? json({ error: { code: "AUTH_FAILED", message: "Sign-in failed.", request_id: "req-42" } }, 401)
        : context("APP_LOGIN_REQUIRED"),
    );
    await screen.findByTestId("login-screen");

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bobby" } });
    const credential = screen.getByLabelText(/Password or activation credential/);
    fireEvent.change(credential, { target: { value: "one-time-code" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Sign-in failed."));
    expect(screen.getByRole("alert").textContent).toContain("req-42");
    // No hint about whether the account exists.
    expect(screen.getByRole("alert").textContent).not.toMatch(/does not exist|not found|unknown user/i);
    // The username survives a bad credential; the credential does not.
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("bobby");
    expect((credential as HTMLInputElement).value).toBe("");
  });

  it("re-reads the context after a successful login instead of assuming success", async () => {
    // Login succeeding does not mean AUTHENTICATED: the next state may be
    // PASSWORD_CHANGE_REQUIRED, and only the BFF knows.
    let contextCalls = 0;
    mount((url) => {
      if (url.endsWith("/login")) return json({ state: "AUTHENTICATED", session_id: "s" });
      contextCalls += 1;
      return context(contextCalls === 1 ? "APP_LOGIN_REQUIRED" : "PASSWORD_CHANGE_REQUIRED");
    });
    await screen.findByTestId("login-screen");

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bobby" } });
    fireEvent.change(screen.getByLabelText(/Password or activation credential/), {
      target: { value: "code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByTestId("password-change-screen")).toBeTruthy();
  });

  it("does not double-submit", async () => {
    let logins = 0;
    mount((url) => {
      if (url.endsWith("/login")) {
        logins += 1;
        return new Promise<Response>(() => {});
      }
      return context("APP_LOGIN_REQUIRED");
    });
    await screen.findByTestId("login-screen");
    const submit = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(logins).toBe(1));
  });
});

describe("Frame 01C", () => {
  it("has no skip affordance", async () => {
    mount(() => context("PASSWORD_CHANGE_REQUIRED"));
    await screen.findByTestId("password-change-screen");
    expect(screen.queryByRole("button", { name: /skip|later/i })).toBeNull();
  });

  it("blocks a short or mismatched password before calling the server", async () => {
    let posts = 0;
    mount((url) => {
      if (url.endsWith("/change-password")) {
        posts += 1;
        return json({ state: "PASSWORD_CHANGED" });
      }
      return context("PASSWORD_CHANGE_REQUIRED");
    });
    await screen.findByTestId("password-change-screen");

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    expect(screen.getByRole("alert").textContent).toContain("at least 15 characters");
    expect((screen.getByRole("button", { name: /Set password/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "a-long-enough-password" },
    });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), {
      target: { value: "different-but-long-enough" },
    });
    expect(screen.getByRole("alert").textContent).toContain("do not match");
    expect(posts).toBe(0);
  });

  it("refuses to submit without the session CSRF token", async () => {
    // The cookie is absent in this test, so the client must fail closed rather
    // than send a request the BFF will reject.
    mount((url) =>
      url.endsWith("/change-password") ? json({}, 500) : context("PASSWORD_CHANGE_REQUIRED"),
    );
    await screen.findByTestId("password-change-screen");
    expect(csrfTokenFromCookie()).toBeNull();

    fireEvent.change(screen.getByLabelText("Current credential"), { target: { value: "old" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-long-enough-password" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), {
      target: { value: "a-long-enough-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Set password/ }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/CSRF/));
  });

  it("returns to the login frame after success, because the BFF clears the session", async () => {
    // jsdom runs on http, and a `__Host-` cookie requires Secure, so assigning
    // it does not stick. The getter is stubbed instead — the parsing itself is
    // covered by the CSRF-absent test above.
    vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-portal_csrf=csrf-token");
    let contextCalls = 0;
    mount((url, init) => {
      if (url.endsWith("/change-password")) {
        expect((init?.headers as Record<string, string>)["x-portal-csrf"]).toBe("csrf-token");
        return json({ state: "PASSWORD_CHANGED" });
      }
      contextCalls += 1;
      return context(contextCalls === 1 ? "PASSWORD_CHANGE_REQUIRED" : "APP_LOGIN_REQUIRED");
    });
    await screen.findByTestId("password-change-screen");

    fireEvent.change(screen.getByLabelText("Current credential"), { target: { value: "old" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-long-enough-password" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), {
      target: { value: "a-long-enough-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Set password/ }));

    expect(await screen.findByTestId("login-screen")).toBeTruthy();
    expect(screen.queryByTestId("shell")).toBeNull();
  });
});

describe("Frame 01D", () => {
  it("shows no JWT, policy internals or account-existence detail", async () => {
    const { container } = mount(() => context("ACCESS_REQUIRED"));
    await screen.findByTestId("access-problem-screen");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/eyJ|Bearer |CF_Authorization|policy_id/);
    expect(text).not.toMatch(/account (does not exist|not found)/i);
  });
});
