import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";
import { AuthService } from "../src/auth/auth.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AdminService } from "../src/admin/admin.service";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

function cookies(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.split(";")[0])
    .join("; ");
}

function csrfFrom(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const value of values) {
    if (typeof value === "string" && value.startsWith("__Host-portal_csrf=")) {
      return value.split(";")[0].split("=")[1];
    }
  }
  throw new Error("csrf cookie missing");
}

describe("auth flows (dev mode)", () => {
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
  });

  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;

  beforeAll(async () => {
    ctx = await setupApp({ AUTH_MODE: "dev" });
    auth = new AuthService(
      ctx.pool,
      ctx.config,
      new Argon2CredentialService({
        memoryKib: ctx.config.ARGON2_MEMORY_KIB,
        iterations: ctx.config.ARGON2_ITERATIONS,
        parallelism: ctx.config.ARGON2_PARALLELISM,
      }),
    );
    admin = new AdminService(ctx.pool, ctx.config, auth);
  });

  afterAll(async () => {
    await teardownApp(ctx);
  });

  const inject = (path: string, options: Record<string, unknown> = {}) => {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) {
      headers["x-dev-access-email"] = "dev@azdag.com";
    }
    return ctx.app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: path,
      ...options,
      headers,
    });
  };

  it("context without session is APP_LOGIN_REQUIRED in dev mode", async () => {
    const response = await inject("/api/auth/context");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ state: "APP_LOGIN_REQUIRED" });
  });

  it("a bound user with pending password change and NO session gets APP_LOGIN_REQUIRED, not 01C", async () => {
    // Regression (2026-08-25): context used to report
    // PASSWORD_CHANGE_REQUIRED for a bound INVITED user without a session,
    // stranding them on frame 01C with no CSRF token. Without a session the
    // user must complete 01B first; 01C is only reachable after login.
    const unique = `stan-ctx-${Date.now()}`;
    await admin.createUser({
      username: unique,
      displayName: "Stan",
      role: "USER",
    });
    const user = await auth.users.findByUsername(unique);
    await admin.resetCredential(user!.userId);

    // Bind the Cloudflare identity without any portal session (simulates a
    // returning visitor whose session was revoked by credential rotation).
    await auth.bindings.create({
      bindingId: `bnd_${user!.userId.slice(-8)}`,
      userId: user!.userId,
      issuer: "https://primussparkquant.cloudflareaccess.com",
      subject: `test-subject-${unique}`,
      email: `${unique}@azdag.com`,
    });

    const response = await inject("/api/auth/context", {
      headers: { "x-dev-access-email": `${unique}@azdag.com` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ state: "APP_LOGIN_REQUIRED" });
  });

  it("full activation flow: login → change password → authenticated", async () => {
    await admin.createUser({
      username: "bobby",
      displayName: "Bobby",
      role: "ADMIN",
    });
    const user = await auth.users.findByUsername("bobby");
    expect(user).not.toBeNull();
    const { activationToken } = await admin.resetCredential(user!.userId);

    const login = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "bobby@azdag.com" },
      payload: { username: "bobby", credential: activationToken },
    });
    expect(login.statusCode).toBe(201);
    expect(login.json().state).toBe("AUTHENTICATED");
    const sessionCookie = cookies(login);
    const csrf = csrfFrom(login);

    const pending = await inject("/api/auth/context", {
      headers: { cookie: sessionCookie },
    });
    expect(pending.json().state).toBe("PASSWORD_CHANGE_REQUIRED");

    const wrongCurrent = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie, "x-portal-csrf": csrf },
      payload: {
        current_password: "not-the-activation-credential",
        new_password: "a-correct-horse-battery-staple-42",
      },
    });
    expect(wrongCurrent.statusCode).toBe(401);
    expect(wrongCurrent.json().error.code).toBe("INVALID_CREDENTIALS");

    const changed = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie, "x-portal-csrf": csrf },
      payload: {
        current_password: activationToken,
        new_password: "a-correct-horse-battery-staple-42",
      },
    });
    expect(changed.statusCode).toBe(201);
    expect(changed.json().state).toBe("PASSWORD_CHANGED");

    const login2 = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "bobby@azdag.com" },
      payload: { username: "bobby", credential: "a-correct-horse-battery-staple-42" },
    });
    expect(login2.statusCode).toBe(201);
    const context = await inject("/api/auth/context", {
      headers: { cookie: cookies(login2) },
    });
    expect(context.json().state).toBe("AUTHENTICATED");
    expect(context.json().principal).toMatchObject({
      username: "bobby",
      role: "ADMIN",
      mustChangePassword: false,
    });
  });

  it("an active account reset uses only the new activation proof", async () => {
    const username = `reset-user-${Date.now()}`;
    const email = `${username}@azdag.com`;
    await admin.createUser({
      username,
      displayName: "Reset User",
      role: "USER",
    });
    const user = await auth.users.findByUsername(username);
    const firstActivation = await admin.resetCredential(user!.userId);
    const firstLogin = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": email },
      payload: { username, credential: firstActivation.activationToken },
    });
    const firstChange = await inject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(firstLogin),
        "x-portal-csrf": csrfFrom(firstLogin),
      },
      payload: {
        current_password: firstActivation.activationToken,
        new_password: "violet-harbor-correct-staple-2026",
      },
    });
    expect(firstChange.statusCode).toBe(201);

    const reset = await admin.resetCredential(user!.userId);
    const oldPassword = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": email },
      payload: { username, credential: "violet-harbor-correct-staple-2026" },
    });
    expect(oldPassword.statusCode).toBe(401);

    const activationLogin = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": email },
      payload: { username, credential: reset.activationToken },
    });
    expect(activationLogin.statusCode).toBe(201);
    const changed = await inject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(activationLogin),
        "x-portal-csrf": csrfFrom(activationLogin),
      },
      payload: {
        current_password: reset.activationToken,
        new_password: "granite-orbit-secure-phrase-2027",
      },
    });
    expect(changed.statusCode).toBe(201);

    const finalLogin = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": email },
      payload: { username, credential: "granite-orbit-secure-phrase-2027" },
    });
    expect(finalLogin.statusCode).toBe(201);
  });

  it("activation credential is single use", async () => {
    await admin.createUser({
      username: "stan",
      displayName: "Stan",
      role: "USER",
    });
    const user = await auth.users.findByUsername("stan");
    const { activationToken } = await admin.resetCredential(user!.userId);

    const first = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "stan@azdag.com" },
      payload: { username: "stan", credential: activationToken },
    });
    expect(first.statusCode).toBe(201);

    const second = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "stan@azdag.com" },
      payload: { username: "stan", credential: activationToken },
    });
    expect(second.statusCode).toBe(401);
    expect(second.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("never enumerates accounts: identical generic errors", async () => {
    const unknown = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "nobody@azdag.com" },
      payload: { username: "nobody", credential: "whatever-secret-1" },
    });
    await admin.createUser({
      username: "thanhvuong",
      displayName: "Thanh",
      role: "USER",
    });
    const user = await auth.users.findByUsername("thanhvuong");
    await admin.resetCredential(user!.userId);
    const wrong = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "thanhvuong@azdag.com" },
      payload: { username: "thanhvuong", credential: "wrong-secret-value-1" },
    });

    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
    expect(unknown.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("locks an account after ten failed attempts", async () => {
    const user = await auth.users.findByUsername("thanhvuong");
    await auth.users.resetLoginCounters(user!.userId);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await inject("/api/auth/login", {
        method: "POST",
        headers: { "x-dev-access-email": "thanhvuong@azdag.com" },
        payload: { username: "thanhvuong", credential: `wrong-secret-${attempt}` },
      });
      expect(response.statusCode).toBe(401);
    }
    const locked = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "thanhvuong@azdag.com" },
      payload: { username: "thanhvuong", credential: "anything-at-all-1" },
    });
    expect(locked.statusCode).toBe(401);
    expect(locked.json().error.code).toBe("ACCOUNT_LOCKED");
  });

  it("requires CSRF on mutations and rejects mismatches", async () => {
    await admin.createUser({ username: "alice", displayName: "Alice", role: "USER" });
    const user = await auth.users.findByUsername("alice");
    const { activationToken } = await admin.resetCredential(user!.userId);
    const login = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "alice@azdag.com" },
      payload: { username: "alice", credential: activationToken },
    });
    const sessionCookie = cookies(login);
    const csrf = csrfFrom(login);

    const missing = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie },
      payload: { current_password: activationToken, new_password: "a-valid-password-abc-1" },
    });
    expect(missing.statusCode).toBe(403);

    const wrongCsrf = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie, "x-portal-csrf": "not-the-right-token" },
      payload: { current_password: activationToken, new_password: "a-valid-password-abc-1" },
    });
    expect(wrongCsrf.statusCode).toBe(403);

    const foreignOrigin = await inject("/api/auth/logout", {
      method: "POST",
      headers: { cookie: sessionCookie, origin: "https://evil.example" },
    });
    expect(foreignOrigin.statusCode).toBe(403);
  });

  it("enforces password policy and blocklist", async () => {
    await admin.createUser({ username: "carol", displayName: "Carol", role: "USER" });
    const user = await auth.users.findByUsername("carol");
    const { activationToken } = await admin.resetCredential(user!.userId);
    const login = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "carol@azdag.com" },
      payload: { username: "carol", credential: activationToken },
    });
    const sessionCookie = cookies(login);
    const csrf = csrfFrom(login);

    const tooShort = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie, "x-portal-csrf": csrf },
      payload: { current_password: activationToken, new_password: "short" },
    });
    expect(tooShort.statusCode).toBe(422);
    expect(tooShort.json().error.code).toBe("PASSWORD_TOO_SHORT");

    const blocklisted = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie, "x-portal-csrf": csrf },
      payload: {
        current_password: activationToken,
        new_password: "primussparkquant-password-99",
      },
    });
    expect(blocklisted.statusCode).toBe(422);
    expect(blocklisted.json().error.code).toBe("PASSWORD_BLOCKLISTED");
  });

  it("logout revokes the session server-side", async () => {
    await admin.createUser({ username: "dave", displayName: "Dave", role: "USER" });
    const user = await auth.users.findByUsername("dave");
    const { activationToken } = await admin.resetCredential(user!.userId);
    const login = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "dave@azdag.com" },
      payload: { username: "dave", credential: activationToken },
    });
    const sessionCookie = cookies(login);
    const csrf = csrfFrom(login);

    const changed = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie, "x-portal-csrf": csrf },
      payload: {
        current_password: activationToken,
        new_password: "dave-secure-phrase-2026-abc",
      },
    });
    expect(changed.statusCode).toBe(201);
    expect(changed.json().state).toBe("PASSWORD_CHANGED");
    const login2 = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "dave@azdag.com" },
      payload: { username: "dave", credential: "dave-secure-phrase-2026-abc" },
    });
    const session2 = cookies(login2);

    const logout = await inject("/api/auth/logout", {
      method: "POST",
      headers: { cookie: session2 },
    });
    expect(logout.statusCode).toBe(201);

    const afterLogout = await inject("/api/auth/context", {
      headers: { cookie: session2 },
    });
    expect(afterLogout.json().state).toBe("APP_LOGIN_REQUIRED");
  });

  it("admin session revocation invalidates active sessions", async () => {
    await admin.createUser({ username: "erin", displayName: "Erin", role: "USER" });
    const user = await auth.users.findByUsername("erin");
    const { activationToken } = await admin.resetCredential(user!.userId);
    const login = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "erin@azdag.com" },
      payload: { username: "erin", credential: activationToken },
    });
    const sessionCookie = cookies(login);
    const csrf = csrfFrom(login);
    const changed = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie, "x-portal-csrf": csrf },
      payload: {
        current_password: activationToken,
        new_password: "erin-secure-phrase-2026-abc",
      },
    });
    expect(changed.statusCode).toBe(201);
    expect(changed.json().state).toBe("PASSWORD_CHANGED");
    const login2 = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": "erin@azdag.com" },
      payload: { username: "erin", credential: "erin-secure-phrase-2026-abc" },
    });
    const activeSession = cookies(login2);
    expect(
      (await inject("/api/auth/context", { headers: { cookie: activeSession } })).json()
        .state,
    ).toBe("AUTHENTICATED");

    await admin.revokeSessions(user!.userId);

    expect(
      (await inject("/api/auth/context", { headers: { cookie: activeSession } })).json()
        .state,
    ).toBe("APP_LOGIN_REQUIRED");
  });
});
