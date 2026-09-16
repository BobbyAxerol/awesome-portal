import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { AuthService } from "../src/auth/auth.service";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { OwnerAccessRepository } from "../src/repos/owner-access";
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
  return { auth, admin, ownerAccess: new OwnerAccessRepository(pool) };
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

  it("strict production bootstrap refuses before creating or claiming anything", async () => {
    const existing = await admin.createUser({
      username: `strict-existing-${Date.now()}`,
      displayName: "Strict Existing",
      role: "ADMIN",
    });
    const missingUsername = `strict-missing-${Date.now()}`;
    const beforeUsers = await auth.users.list();
    const beforeAnchor = await new OwnerAccessRepository(pool).ownerAnchor();
    await expect(
      runBootstrap(
        [
          { username: existing.username, role: "ADMIN", owner: true },
          { username: missingUsername, role: "USER" },
        ],
        capture().io,
        { printOneTime: false, requireExistingUsers: true },
        deps(),
      ),
    ).rejects.toThrow(/strict bootstrap refuses to create production users/);
    expect(await auth.users.findByUsername(missingUsername)).toBeNull();
    expect((await auth.users.list()).map((user) => user.userId)).toEqual(
      beforeUsers.map((user) => user.userId),
    );
    expect(await new OwnerAccessRepository(pool).ownerAnchor()).toEqual(beforeAnchor);
  });

  it("never lets a strict production bootstrap reset existing credentials", async () => {
    const userId = (await auth.users.findByUsername("bobby"))!.userId;
    const before = await pool.query<{ activation_id: string; token_hash: string; revoked_at: Date | null }>(
      `SELECT activation_id, token_hash, revoked_at
         FROM activation_credentials
        WHERE user_id = $1
        ORDER BY activation_id`,
      [userId],
    );
    await expect(
      runBootstrap(
        [{ username: "bobby", role: "ADMIN", owner: true }],
        capture().io,
        { printOneTime: true, requireExistingUsers: true },
        deps(),
      ),
    ).rejects.toThrow(/strict bootstrap forbids one-time credential output/);
    const after = await pool.query<{ activation_id: string; token_hash: string; revoked_at: Date | null }>(
      `SELECT activation_id, token_hash, revoked_at
         FROM activation_credentials
        WHERE user_id = $1
        ORDER BY activation_id`,
      [userId],
    );
    expect(after.rows).toEqual(before.rows);
  });
});

describe("parseBootstrapUsers", () => {
  /**
   * A4-D15 · the file the deployment actually reads, not a copy of it.
   *
   * The case below this one is named "parses the committed bootstrap file" and
   * does no such thing: it builds the YAML inline. That is why nobody noticed
   * that `deploy/control-api/bootstrap-users.yaml` carried no `owner:` marker
   * at all — `runBootstrap` filters `owner === true` to an empty list, skips
   * the claim, and every deployment came up with an UNCLAIMED anchor, which
   * fails closed and shuts Users & Access and Profile & Access to everyone.
   *
   * CLAUDE.md §7.8: when a canonical file exists, the test LOADS it.
   */
  it("the shipped bootstrap input names exactly one owner, and that owner is an ADMIN", () => {
    /*
     * Two locations, one file. The gate copies `deploy/control-api` into the
     * isolated test cell (which mounts only this package), so inside the cell
     * it sits one level up; in the repo it is three. Resolved rather than
     * duplicated — a second copy is the defect this test exists to catch.
     */
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, "../deploy/control-api/bootstrap-users.yaml"),
      join(here, "../../../deploy/control-api/bootstrap-users.yaml"),
      // The disposable package test cell mounts deployment input alongside the
      // package, while a monorepo checkout resolves one of the two paths
      // above.  All candidates name the same canonical file; none is a copied
      // inline fixture that can drift from the release artifact.
      join(process.cwd(), "../deploy/control-api/bootstrap-users.yaml"),
      join(process.cwd(), "../../deploy/control-api/bootstrap-users.yaml"),
    ];
    const file = candidates.find((path) => existsSync(path));
    expect(file, `bootstrap input not found at any of ${candidates.join(", ")}`).toBeTruthy();
    const users = parseBootstrapUsers(readFileSync(file!, "utf8"));
    const owners = users.filter((entry) => entry.owner === true);

    // Exactly one: `runBootstrap` throws on more than one, and claims nothing
    // on none. Both failures are silent in different ways, so pin the number.
    expect(owners).toHaveLength(1);
    // An owner who is not an ADMIN would hold the anchor while the coarse role
    // still gates the Planning facade — two authorities disagreeing about the
    // same person.
    expect(owners[0].role).toBe("ADMIN");
    // The anchor binds to a user the same file creates, or the claim throws
    // "bootstrap owner <name> was not created" at deploy time.
    expect(users.map((entry) => entry.username)).toContain(owners[0].username);
  });

  it("parses an inline document, including the owner marker", () => {
    expect(
      parseBootstrapUsers(
        ["# comment", "users:", "  - username: bobby", "    role: ADMIN", "    owner: true"].join("\n"),
      ),
    ).toEqual([{ username: "bobby", role: "ADMIN", owner: true }]);
  });

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
