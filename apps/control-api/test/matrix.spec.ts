import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { createServer, Server } from "http";
import { generateKeyPair, exportJWK, SignJWT, KeyLike } from "jose";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";
import { PrincipalService } from "../src/auth/principal";
import { AuthService } from "../src/auth/auth.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AdminService } from "../src/admin/admin.service";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

const ISSUER = "https://primussparkquant.cloudflareaccess.com";
const AUDIENCE = "test-audience";

class MockCloudflare {
  private server: Server | null = null;
  private jwks: { keys: object[] } = { keys: [] };
  private privateKey: KeyLike | null = null;
  private kid = "key-1";

  async start(): Promise<void> {
    await this.rotate("key-1");
    this.server = createServer((request, response) => {
      if (request.url === "/cdn-cgi/access/certs") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(this.jwks));
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
  }

  async rotate(kid: string): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    this.jwks = {
      keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }],
    };
    this.privateKey = privateKey;
    this.kid = kid;
  }

  async sign(claims: {
    email: string;
    sub?: string;
    expiresIn?: string;
    expired?: boolean;
    wrongAudience?: boolean;
    wrongIssuer?: boolean;
  }): Promise<string> {
    let builder = new SignJWT({ email: claims.email, auth_time: Math.floor(Date.now() / 1000) })
      .setProtectedHeader({ alg: "RS256", kid: this.kid })
      .setSubject(claims.sub ?? "subject-1")
      .setIssuer(claims.wrongIssuer ? "https://evil.example" : ISSUER)
      .setAudience(claims.wrongAudience ? "wrong-audience" : AUDIENCE)
      .setIssuedAt();
    if (claims.expired) {
      builder = builder.setExpirationTime(new Date(Date.now() - 45_000));
    } else {
      builder = builder.setExpirationTime(claims.expiresIn ?? "10 minutes");
    }
    return builder.sign(this.privateKey!);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
  }

  url(): string {
    const address = this.server?.address();
    if (!address || typeof address === "string") {
      throw new Error("mock cloudflare not listening");
    }
    return `http://127.0.0.1:${address.port}/cdn-cgi/access/certs`;
  }
}

describe("cloudflare access security matrix", () => {
  const mock = new MockCloudflare();

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    await mock.start();
  });
  afterAll(async () => {
    await mock.stop();
  });

  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;

  beforeAll(async () => {
    ctx = await setupApp({
      CLOUDFLARE_ACCESS_JWKS_URI: mock.url(),
      CLOUDFLARE_ACCESS_AUD: AUDIENCE,
      JWKS_CACHE_TTL_SECONDS: "1",
    });
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

  afterEach(async () => {
    await ctx.pool.query(
      `TRUNCATE auth_audit_events, auth_sessions, activation_credentials,
        password_credentials, external_identity_bindings, portal_users CASCADE`,
    );
  });

  const inject = (path: string, options: Record<string, unknown> = {}) =>
    ctx.app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: path,
      ...options,
    });

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

  async function seedActiveUser(username: string, role: "ADMIN" | "USER"): Promise<{
    userId: string;
    password: string;
  }> {
    await admin.createUser({ username, displayName: username, role });
    const user = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(user!.userId);
    const response = await inject("/api/auth/login", {
      method: "POST",
      headers: { "cf-access-jwt-assertion": await mock.sign({ email: `${username}@azdag.com`, sub: `${username}-subject` }) },
      payload: { username, credential: activationToken },
    });
    expect(response.statusCode).toBe(201);
    const sessionCookie = cookies(response);
    const csrf = csrfFrom(response);
    const password = `${username}-secure-phrase-2026-ok`;
    const changed = await inject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: sessionCookie, "x-portal-csrf": csrf },
      payload: { current_password: activationToken, new_password: password },
    });
    expect(changed.statusCode).toBe(201);
    return { userId: user!.userId, password };
  }

  async function loginSession(
    username: string,
    password: string,
  ): Promise<{ cookie: string; csrf: string }> {
    const assertion = await mock.sign({ email: `${username}@azdag.com`, sub: `${username}-subject` });
    const response = await inject("/api/auth/login", {
      method: "POST",
      headers: { "cf-access-jwt-assertion": assertion },
      payload: { username, credential: password },
    });
    expect(response.statusCode).toBe(201);
    return { cookie: cookies(response), csrf: csrfFrom(response) };
  }

  it("rejects spoofed email headers without a valid Access JWT", async () => {
    const response = await inject("/api/auth/context", {
      headers: {
        "cf-access-authenticated-user-email": "bobby@azdag.com",
        "x-auth-user-email": "bobby@azdag.com",
      },
    });
    expect(response.json().state).toBe("ACCESS_REQUIRED");
  });

  it("rejects invalid signature, wrong audience, wrong issuer and disallowed domain", async () => {
    for (const assertion of [
      "not-a-jwt",
      await mock.sign({ email: "bobby@azdag.com", wrongAudience: true }),
      await mock.sign({ email: "bobby@azdag.com", wrongIssuer: true }),
      await mock.sign({ email: "intruder@example.com" }),
    ]) {
      const response = await inject("/api/auth/context", {
        headers: { "cf-access-jwt-assertion": assertion },
      });
      expect(response.json().state).toBe("ACCESS_REQUIRED");
    }
  });

  it("rejects expired Access JWTs", async () => {
    const expired = await mock.sign({ email: "bobby@azdag.com", expired: true });
    const response = await inject("/api/auth/context", {
      headers: { "cf-access-jwt-assertion": expired },
    });
    expect(response.json().state).toBe("ACCESS_REQUIRED");
  });

  it("accepts JWKS key rotation and unknown kid refetch", async () => {
    await admin.createUser({ username: "bobby", displayName: "Bobby", role: "ADMIN" });
    const user = await auth.users.findByUsername("bobby");
    const { activationToken } = await admin.resetCredential(user!.userId);

    const first = await inject("/api/auth/login", {
      method: "POST",
      headers: { "cf-access-jwt-assertion": await mock.sign({ email: "bobby@azdag.com" }) },
      payload: { username: "bobby", credential: activationToken },
    });
    expect(first.statusCode).toBe(201);

    await mock.rotate("key-2");
    // The verifier honors a small JWKS refetch cooldown before resolving the
    // unknown kid; production behaves the same with the configured TTL.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const context = await inject("/api/auth/context", {
      headers: { "cf-access-jwt-assertion": await mock.sign({ email: "bobby@azdag.com" }) },
    });
    expect(context.json().state).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("binds access identity on first login and blocks cross-identity reuse", async () => {
    await admin.createUser({ username: "stan", displayName: "Stan", role: "USER" });
    const user = await auth.users.findByUsername("stan");
    const { activationToken } = await admin.resetCredential(user!.userId);

    const first = await inject("/api/auth/login", {
      method: "POST",
      headers: { "cf-access-jwt-assertion": await mock.sign({ email: "stan@azdag.com" }) },
      payload: { username: "stan", credential: activationToken },
    });
    expect(first.statusCode).toBe(201);

    // Another Access identity presenting the same username must not reuse it.
    const otherIdentity = await mock.sign({
      email: "intruder@azdag.com",
      sub: "intruder-subject",
    });
    const conflict = await inject("/api/auth/login", {
      method: "POST",
      headers: { "cf-access-jwt-assertion": otherIdentity },
      payload: { username: "stan", credential: "irrelevant-secret-1" },
    });
    expect(conflict.statusCode).toBe(401);
  });

  it("USER sessions cannot access admin APIs (cross-user denied without leak)", async () => {
    await seedActiveUser("bobby", "ADMIN");
    const stan = await seedActiveUser("stan", "USER");
    const session = await loginSession("stan", stan.password);

    const users = await inject("/api/admin/users", {
      headers: { cookie: session.cookie },
    });
    expect(users.statusCode).toBe(401);
    expect(JSON.stringify(users.json())).not.toContain("bobby");

    const disable = await inject(`/api/admin/users/${stan.userId}/disable`, {
      method: "POST",
      headers: { cookie: session.cookie },
    });
    expect(disable.statusCode).toBe(401);
  });

  it("ADMIN sessions can administer users and audit events are recorded", async () => {
    const bobby = await seedActiveUser("bobby", "ADMIN");
    const session = await loginSession("bobby", bobby.password);

    const created = await inject("/api/admin/users", {
      method: "POST",
      headers: { cookie: session.cookie },
      payload: { username: "erin", display_name: "Erin", role: "USER" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().username).toBe("erin");

    const users = await inject("/api/admin/users", {
      headers: { cookie: session.cookie },
    });
    expect(users.statusCode).toBe(200);
    expect(users.json().users.map((u: { username: string }) => u.username)).toContain("erin");
    expect(JSON.stringify(users.json())).not.toContain("password_hash");
    expect(JSON.stringify(users.json())).not.toContain("token_hash");

    const events = await ctx.pool.query(
      `SELECT event_type FROM auth_audit_events ORDER BY occurred_at`,
    );
    expect(events.rows.map((r: { event_type: string }) => r.event_type)).toContain(
      "user_created",
    );
  });

  it("expired or expired-TTL sessions fail closed", async () => {
    await admin.createUser({ username: "frank", displayName: "Frank", role: "USER" });
    const user = await auth.users.findByUsername("frank");
    await auth.credentials.upsertPassword({
      credentialId: "pwd-frank",
      userId: user!.userId,
      passwordHash: "not-a-real-hash",
      parametersJson: {},
    });
    await auth.users.update({
      userId: user!.userId,
      status: "ACTIVE",
      mustChangePassword: false,
    });
    await ctx.pool.query(
      `INSERT INTO auth_sessions
         (session_id, session_token_hash, user_id, state, csrf_secret_hash,
          session_version, idle_expires_at, absolute_expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4, 0,
               now() - interval '1 minute', now() + interval '1 hour')`,
      ["ses-expired", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", user!.userId, "csrf"],
    );
    const context = await inject("/api/auth/context", {
      headers: { "cf-access-jwt-assertion": await mock.sign({ email: "frank@azdag.com" }) },
    });
    expect(context.json().state).toBe("APP_LOGIN_REQUIRED");
  });

  it("signed principal verifies and rejects tampering or expiry", () => {
    const service = new PrincipalService("test-principal-secret-0123456789");
    const token = service.sign({
      principalId: "usr_x",
      username: "bobby",
      accessSubject: "subject-1",
      accessEmail: "bobby@azdag.com",
      role: "ADMIN",
      authnMethods: ["cloudflare_access", "local_password"],
      sessionId: "ses_y",
      mustChangePassword: false,
      issuedAt: new Date().toISOString(),
    });
    const principal = service.verify(token);
    expect(principal).not.toBeNull();
    expect(principal!.username).toBe("bobby");
    expect(principal!.policyVersion).toBe("auth-policy-v1");

    expect(service.verify(`${token}x`)).toBeNull();
    const [encoded, signature] = token.split(".");
    expect(service.verify(`${encoded}.deadbeef`)).toBeNull();
    expect(service.verify("garbage")).toBeNull();
  });

  it("never leaks raw credentials or assertions in responses", async () => {
    const bobby = await seedActiveUser("bobby", "ADMIN");
    const session = await loginSession("bobby", bobby.password);
    const responses = [
      await inject("/api/auth/context", {
        headers: { cookie: session.cookie, "cf-access-jwt-assertion": await mock.sign({ email: "bobby@azdag.com" }) },
      }),
      await inject("/api/auth/context"),
      await inject("/api/auth/csrf", { headers: { cookie: session.cookie } }),
    ];
    for (const response of responses) {
      const body = response.body;
      expect(body).not.toContain(bobby.password);
      expect(body).not.toContain("password_hash");
      expect(body).not.toContain("token_hash");
      expect(body).not.toContain("Cf-Access-Jwt-Assertion");
    }
  });
});
