import "reflect-metadata";
import { readFileSync } from "fs";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { AdminService } from "../admin/admin.service";
import { AuthService } from "../auth/auth.service";
import { Argon2CredentialService } from "../auth/argon";
import { OwnerAccessRepository } from "../repos/owner-access";

export interface BootstrapUser {
  username: string;
  role: "ADMIN" | "USER";
  /**
   * A4-1 · claim this user as the single Portal owner.
   *
   * §20.3 requires the owner to be established from protected bootstrap input
   * and never inferred from anything a browser supplies, so this flag is the
   * only way an anchor is ever written. It is idempotent: re-running bootstrap
   * with the same owner does nothing, and naming a DIFFERENT user fails loudly
   * rather than moving ownership, because a silent reassignment is how a
   * Portal is lost to a typo.
   */
  owner?: boolean;
}

export interface BootstrapIO {
  log: (line: string) => void;
}

export interface BootstrapDeps {
  auth: AuthService;
  admin: AdminService;
  ownerAccess: OwnerAccessRepository;
}

/**
 * Idempotent bootstrap CLI (guide P0.25A.5):
 *
 *   node dist/cli/bootstrap.js --file bootstrap-users.yaml
 *   node dist/cli/bootstrap.js --file bootstrap-users.yaml --print-one-time-credentials
 *
 * Default run seeds the users as INVITED and prints **no credentials** — a
 * one-time token is a secret and must never land in container logs or the
 * on-disk JSON log. Handover runs the second form once (manual, stdout only)
 * to print fresh one-time activation credentials exactly once.
 */
export async function runBootstrap(
  users: BootstrapUser[],
  io: BootstrapIO,
  options: { printOneTime: boolean; requireExistingUsers?: boolean },
  deps: BootstrapDeps,
): Promise<void> {
  const owners = users.filter((entry) => entry.owner === true);
  if (owners.length > 1) {
    throw new Error("bootstrap names more than one owner; there is exactly one Portal owner");
  }

  /*
   * `--print-one-time-credentials` is an explicit local handover mechanism,
   * not a production recovery channel.  In strict production mode it would
   * reset every configured account merely because a one-shot deployment job
   * was invoked with the wrong flag, bypassing the audited owner control
   * plane.  Production recovery therefore goes only through the named owner
   * API; fresh/local cells retain the deliberate handover option.
   */
  if (options.requireExistingUsers && options.printOneTime) {
    throw new Error(
      "strict bootstrap forbids one-time credential output; use the owner account lifecycle API",
    );
  }

  /*
   * Production never treats a release bootstrap file as a provisioning
   * request.  The stable database is authoritative for Bobby/Stan/Thanh and
   * an omitted/misspelled row must fail the one-shot job before it creates a
   * look-alike account or claims the owner anchor for it.  Local/fresh test
   * cells retain the useful permissive bootstrap behavior.
   */
  if (options.requireExistingUsers) {
    if (owners.length !== 1) {
      throw new Error("strict bootstrap must name exactly one existing Portal owner");
    }
    const missing: string[] = [];
    for (const entry of users) {
      if (!(await deps.auth.users.findByUsername(entry.username))) missing.push(entry.username);
    }
    if (missing.length > 0) {
      throw new Error(
        `strict bootstrap refuses to create production users: ${missing.join(", ")}`,
      );
    }
  }

  for (const entry of users) {
    const existing = await deps.auth.users.findByUsername(entry.username);
    if (existing) {
      if (options.printOneTime) {
        const { activationToken } = await deps.admin.resetCredential(existing.userId);
        io.log(`ONE_TIME ${entry.username} ${activationToken}`);
      } else {
        io.log(`user ${entry.username} already exists; skipped`);
      }
      continue;
    }
    const user = await deps.admin.createUser({
      username: entry.username,
      displayName: entry.username,
      role: entry.role,
    });
    if (options.printOneTime) {
      const { activationToken } = await deps.admin.resetCredential(user.userId);
      io.log(`ONE_TIME ${entry.username} ${activationToken}`);
    } else {
      io.log(`created ${entry.username} (${entry.role})`);
    }
  }

  /*
   * The owner claim runs last, after every named user exists, so the anchor
   * can reference a real row. It writes no credential and changes no existing
   * user: §20.2 rule 8 forbids a bootstrap that alters a password, binding,
   * role or status to make administration convenient.
   */
  const owner = owners[0];
  if (owner) {
    const user = await deps.auth.users.findByUsername(owner.username);
    if (!user) throw new Error(`bootstrap owner ${owner.username} was not created`);
    const claim = await deps.ownerAccess.claimOwner({
      userId: user.userId,
      claimedBy: "bootstrap",
    });
    io.log(
      claim.outcome === "CLAIMED"
        ? `owner anchor claimed for ${owner.username}`
        : `owner anchor already held by ${owner.username}; unchanged`,
    );
  }
}

export function parseBootstrapUsers(raw: string): BootstrapUser[] {
  const users: BootstrapUser[] = [];
  let current: Partial<BootstrapUser> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^-\s+(\w+):\s*(.*)$/);
    if (match) {
      /*
       * A4-1 · the key name is checked, not just its shape.
       *
       * This ignored `match[1]` entirely, so `- role: ADMIN` opened a user
       * literally named "ADMIN" and the entry that was meant to follow became
       * its attributes. With `owner: true` among them the anchor is claimed
       * for the wrong principal — and `claimOwner` refuses to move an anchor
       * once claimed, so a single mis-indented line permanently assigns the
       * Portal to an account nobody meant to create. Refusing an entry that
       * does not begin with `username` is the difference between an operator
       * fixing a typo and an operator rebuilding a database.
       */
      if (match[1] !== "username") {
        throw new Error(
          `bootstrap entry must begin with "username:", found "${match[1]}:"`,
        );
      }
      if (current.username) users.push(current as BootstrapUser);
      current = { username: match[2].trim() };
      continue;
    }
    const keyValue = trimmed.match(/^(\w+):\s*(.+)$/);
    if (keyValue && keyValue[1] === "role" && current.username) {
      current.role = keyValue[2].toUpperCase() as "ADMIN" | "USER";
    }
    // `owner: true` only. Any other value is not an owner claim, so a typo
    // fails to claim rather than claiming by accident.
    if (keyValue && keyValue[1] === "owner" && current.username) {
      current.owner = keyValue[2].trim().toLowerCase() === "true";
    }
  }
  if (current.username && current.role) users.push(current as BootstrapUser);
  if (users.length === 0 || users.some((u) => !u.role)) {
    throw new Error("invalid bootstrap users file");
  }
  return users;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  if (fileIndex === -1) {
    throw new Error("--file <bootstrap-users.yaml> is required");
  }
  const config = loadConfig();
  const pool = buildPool(config.DATABASE_URL);
  const auth = new AuthService(
    pool,
    config,
    new Argon2CredentialService({
      memoryKib: config.ARGON2_MEMORY_KIB,
      iterations: config.ARGON2_ITERATIONS,
      parallelism: config.ARGON2_PARALLELISM,
    }),
  );
  const admin = new AdminService(pool, config, auth);
  const ownerAccess = new OwnerAccessRepository(pool);

  const raw = readFileSync(args[fileIndex + 1], "utf8");
  const users = parseBootstrapUsers(raw);
  await runBootstrap(
    users,
    { log: (line) => console.log(line) },
    {
      printOneTime: args.includes("--print-one-time-credentials"),
      requireExistingUsers: args.includes("--require-existing-users"),
    },
    { auth, admin, ownerAccess },
  );
  await pool.end();
}

// Only run as the CLI entrypoint; importing the module (tests, other CLIs)
// must not trigger a side-effectful bootstrap.
if (require.main === module) {
  void main();
}
