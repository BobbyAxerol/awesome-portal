/**
 * A4-FE-BE-GAP-02 · a login refusal costs what a login costs.
 *
 * Argon2 is deliberately expensive, and that expense is observable from
 * outside. Login reached it only for a user who exists, is ACTIVE and holds a
 * password; every other outcome returned in microseconds. One timed request
 * therefore separated three facts a stranger has no right to — whether the
 * username exists, whether the account is still awaiting its first password,
 * and whether it is currently locked — no matter how carefully the response
 * body and error code were made identical.
 *
 * These assert the WORK, not the clock. A wall-time assertion on a hashing
 * function is a flaky test on a loaded machine, and a flaky security test is
 * one that gets deleted. Counting the verifies is exact.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthError, AuthService } from "../src/auth/auth.service";

import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

/**
 * Counts argon2 verifies without changing what any of them return.
 *
 * Only `verify` is counted, deliberately: `verifyAgainstDecoy` reaches the
 * same primitive, so counting both would score the decoy path 2 and the real
 * path 1 and the test would measure the instrument instead of the code. One
 * verify is one unit of the cost an attacker can time.
 */
class CountingArgon2 extends Argon2CredentialService {
  verifies = 0;

  async verify(hash: string, password: string): Promise<boolean> {
    this.verifies += 1;
    return super.verify(hash, password);
  }
}

describe("A4-FE-BE-GAP-02 · every login path pays the same argon2", () => {
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
  });

  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let argon2: CountingArgon2;
  let auth: AuthService;
  let admin: AdminService;

  beforeAll(async () => {
    ctx = await setupApp({ AUTH_MODE: "dev" });
    argon2 = new CountingArgon2({
      memoryKib: ctx.config.ARGON2_MEMORY_KIB,
      iterations: ctx.config.ARGON2_ITERATIONS,
      parallelism: ctx.config.ARGON2_PARALLELISM,
    });
    auth = new AuthService(ctx.pool, ctx.config, argon2);
    admin = new AdminService(ctx.pool, ctx.config, auth);
  });

  afterAll(async () => {
    await teardownApp(ctx);
  });

  async function attempt(username: string, credential: string): Promise<number> {
    argon2.verifies = 0;
    const email = `${username}@azdag.com`;
    await expect(
      auth.login({ assertion: undefined, devEmail: email, username, credential }),
    ).rejects.toBeInstanceOf(AuthError);
    return argon2.verifies;
  }

  async function activeUserWithPassword(username: string): Promise<void> {
    await admin.createUser({ username, displayName: username, role: "USER" });
    const user = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(user!.userId);
    const session = await auth.login({
      assertion: undefined,
      devEmail: `${username}@azdag.com`,
      username,
      credential: activationToken,
    });
    await auth.changePassword({
      sessionToken: session.token,
      csrfToken: session.csrfToken,
      currentPassword: activationToken,
      newPassword: `${username}-correct-horse-battery-2026`,
    });
  }

  it("spends one verify on a wrong password — the reference cost", async () => {
    await activeUserWithPassword("timing-real");
    expect(await attempt("timing-real", "definitely-not-the-password")).toBe(1);
  });

  it("spends the same on a username that does not exist", async () => {
    // The oracle this closes: "no such user" used to return before any
    // hashing, so it answered measurably faster than a wrong password.
    expect(await attempt("no-such-account-anywhere", "anything")).toBe(1);
  });

  it("spends the same on a disabled account", async () => {
    await activeUserWithPassword("timing-disabled");
    const user = await auth.users.findByUsername("timing-disabled");
    await auth.users.update({ userId: user!.userId, status: "DISABLED" });
    expect(await attempt("timing-disabled", "anything")).toBe(1);
  });

  it("spends the same on a locked account", async () => {
    // Otherwise the response time told an attacker their lockout campaign was
    // working, even after the error code stopped saying so (A4-F12).
    await activeUserWithPassword("timing-locked");
    const user = await auth.users.findByUsername("timing-locked");
    await auth.users.recordFailedLogin(user!.userId, 1, 900);
    expect(await attempt("timing-locked", "anything")).toBe(1);
  });

  it("spends the same on an account still awaiting its first password", async () => {
    // The activation path is a sha256 compare — microseconds — so it used to
    // be the fastest answer of all, and it is the one that says "this account
    // has never been signed into".
    await admin.createUser({
      username: "timing-invited",
      displayName: "Invited",
      role: "USER",
    });
    const user = await auth.users.findByUsername("timing-invited");
    await admin.resetCredential(user!.userId);
    expect(await attempt("timing-invited", "not-the-activation-token")).toBe(1);
  });

  it("spends the same on a successful activation login as on a failed one", async () => {
    // Spending it only on failure would simply invert the oracle.
    await admin.createUser({
      username: "timing-success",
      displayName: "Success",
      role: "USER",
    });
    const user = await auth.users.findByUsername("timing-success");
    const { activationToken } = await admin.resetCredential(user!.userId);
    argon2.verifies = 0;
    await auth.login({
      assertion: undefined,
      devEmail: "timing-success@azdag.com",
      username: "timing-success",
      credential: activationToken,
    });
    expect(argon2.verifies).toBe(1);
  });
});
