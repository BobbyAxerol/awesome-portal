import "reflect-metadata";
import { readFileSync } from "fs";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { AdminService } from "../admin/admin.service";
import { AuthService } from "../auth/auth.service";
import { Argon2CredentialService } from "../auth/argon";

interface BootstrapUser {
  username: string;
  role: "ADMIN" | "USER";
}

/**
 * Idempotent bootstrap CLI (guide P0.25A.5):
 *
 *   node dist/cli/bootstrap.js --file bootstrap-users.yaml \
 *     [--generate-one-time-credentials]
 *
 * Seeds bobby/ADMIN, stan/USER, thanhvuong/USER as INVITED users and, when
 * requested, prints one-time activation credentials exactly once. Credentials
 * are never written to any file, log or database row in plaintext.
 */
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
  const generated = args.includes("--generate-one-time-credentials");

  for (const entry of users) {
    const existing = await auth.users.findByUsername(entry.username);
    if (existing) {
      console.log(`user ${entry.username} already exists; skipped`);
      continue;
    }
    const user = await admin.createUser({
      username: entry.username,
      displayName: entry.username,
      role: entry.role,
    });
    if (generated) {
      const { activationToken } = await admin.resetCredential(user.userId);
      console.log(`ONE_TIME ${entry.username} ${activationToken}`);
    } else {
      console.log(`created ${entry.username} (${entry.role})`);
    }
  }
  await pool.end();
}

function parseBootstrapUsers(raw: string): BootstrapUser[] {
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

void main();
