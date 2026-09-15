import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { AuthService } from "../src/auth/auth.service";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import {
  runBootstrap,
  parseBootstrapUsers,
  BootstrapUser,
} from "../src/cli/bootstrap";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const config = testConfig();
let pool: Pool;
let auth: AuthService;
let admin: AdminService;

function deps() {
  return { auth, admin };
}

beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL);
  pool = buildPool(config.DATABASE_URL);
  await truncateAll(pool);
  auth = new AuthService(
    pool,
    config,
    new Argon2CredentialService({
      memoryKib: config.ARGON2_MEMORY_KIB,
      iterations: config.ARGON2_ITERATIONS,
      parallelism: config.ARGON2_PARALLELISM,
    }),
  );
  admin = new AdminService(pool, config, auth);
});

afterAll(async () => {
  await pool.end();
});

const USERS: BootstrapUser[] = [
  { username: "bobby", role: "ADMIN" },
  { username: "stan", role: "USER" },
];

function capture() {
  const lines: string[] = [];
  return { io: { log: (line: string) => lines.push(line) }, lines };
}

describe("bootstrap credential handover", () => {
  it("never prints a one-time token during the default (container) run", async () => {
    const { io, lines } = capture();
    await runBootstrap(USERS, io, { printOneTime: false }, deps());
    expect(lines.some((l) => l.startsWith("ONE_TIME"))).toBe(false);
    expect(lines.some((l) => l.includes("created bobby"))).toBe(true);
  });

  it("prints one-time credentials exactly on the handover run", async () => {
    const { io, lines } = capture();
    await runBootstrap(USERS, io, { printOneTime: true }, deps());
    const tokens = lines.filter((l) => l.startsWith("ONE_TIME"));
    expect(tokens).toHaveLength(2);
    for (const line of tokens) {
      const [_, username, token] = line.split(" ");
      expect(username).toMatch(/^(bobby|stan)$/);
      expect(token).toMatch(/^[0-9a-f]{48}$/);
    }
  });

  it("handover tokens are usable activation credentials", async () => {
    const { lines } = capture();
    await runBootstrap(USERS, { log: (l) => lines.push(l) }, { printOneTime: true }, deps());
    const bobbyToken = lines
      .find((l) => l.startsWith("ONE_TIME bobby"))!
      .split(" ")[2];
    const { createHash } = await import("crypto");
    const user = await auth.users.findByUsername("bobby");
    const activation = await auth.credentials.findUsableActivation(
      user!.userId,
      createHash("sha256").update(bobbyToken).digest("hex"),
    );
    expect(activation).not.toBeNull();
  });

  it("is idempotent across runs", async () => {
    const { io, lines } = capture();
    await runBootstrap(USERS, io, { printOneTime: false }, deps());
    expect(lines.some((l) => l.includes("already exists; skipped"))).toBe(true);
  });
});

describe("parseBootstrapUsers", () => {
  it("parses the committed bootstrap file", () => {
    const raw = [
      "# comment",
      "users:",
      "  - username: bobby",
      "    role: ADMIN",
      "  - username: stan",
      "    role: USER",
    ].join("\n");
    expect(parseBootstrapUsers(raw)).toEqual([
      { username: "bobby", role: "ADMIN" },
      { username: "stan", role: "USER" },
    ]);
  });

  it("refuses an entry that does not begin with username", () => {
    /*
     * A4-1 · the key name used to be ignored entirely.
     *
     * `- role: ADMIN` opened a user literally named "ADMIN" and swallowed the
     * lines meant for the next entry — including `owner: true`. Since
     * `claimOwner` refuses to move an anchor once claimed, one mis-indented
     * line permanently assigned the Portal to an account nobody meant to
     * create. Failing loudly is the difference between fixing a typo and
     * rebuilding a database.
     */
    const raw = ["users:", "  - role: ADMIN", "    username: bobby", "    owner: true"].join("\n");
    expect(() => parseBootstrapUsers(raw)).toThrow(/must begin with "username:"/);
  });

  it("claims the owner only for the entry that actually declares it", () => {
    const raw = [
      "users:",
      "  - username: bobby",
      "    role: ADMIN",
      "    owner: true",
      "  - username: stan",
      "    role: USER",
    ].join("\n");
    const parsed = parseBootstrapUsers(raw);
    expect(parsed).toEqual([
      { username: "bobby", role: "ADMIN", owner: true },
      { username: "stan", role: "USER" },
    ]);
  });
});
