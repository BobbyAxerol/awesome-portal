import "reflect-metadata";
import { readFileSync } from "fs";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { AdminService } from "../admin/admin.service";
import { AuthService } from "../auth/auth.service";
import { Argon2CredentialService } from "../auth/argon";

export interface BootstrapUser {
  username: string;
  role: "ADMIN" | "USER";
}

export interface BootstrapIO {
  log: (line: string) => void;
}

export interface BootstrapDeps {
  auth: AuthService;
  admin: AdminService;
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
  options: { printOneTime: boolean },
  deps: BootstrapDeps,
): Promise<void> {
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
}

export function parseBootstrapUsers(raw: string): BootstrapUser[] {
  const users: BootstrapUser[] = [];
  let current: Partial<BootstrapUser> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^-\s+(\w+):\s*(.*)$/);
    if (match) {
      if (current.username) users.push(current as BootstrapUser);
      current = { username: match[2] };
      continue;
    }
    const keyValue = trimmed.match(/^(\w+):\s*(.+)$/);
    if (keyValue && keyValue[1] === "role" && current.username) {
      current.role = keyValue[2].toUpperCase() as "ADMIN" | "USER";
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

  const raw = readFileSync(args[fileIndex + 1], "utf8");
  const users = parseBootstrapUsers(raw);
  await runBootstrap(
    users,
    { log: (line) => console.log(line) },
    { printOneTime: args.includes("--print-one-time-credentials") },
    { auth, admin },
  );
  await pool.end();
}

// Only run as the CLI entrypoint; importing the module (tests, other CLIs)
// must not trigger a side-effectful bootstrap.
if (require.main === module) {
  void main();
}
