/** BE-P10 Edge item 3. TEST_ONLY, fakes only: the offline `execution-native-session` CLI run as a real module with a fake
 * root-owned filesystem and SPIES on the pool factory, the schema check, native composition, AuthService and the credential
 * service. Proves `--dry-run` is offline: it validates the artifact fully and applies the DB-free token-path rules, and
 * can NEVER build a pool, connect, read the schema, compose, construct AuthService, mutate or issue a session. NOT PostgreSQL,
 * NOT a real session, NOT a runtime. */
import { constants } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCEPTANCE_ISSUE_SCHEMA, ACCEPTANCE_REVOKE_SCHEMA } from "../src/execution-v2/research-acceptance-session";
import { NOW, OWNER_STREAM_TEMPLATE, prepared, sha256 } from "./fixtures/core009-templates";

const h = vi.hoisted(() => ({
  target: null as any, buildPool: vi.fn(), assertSchema: vi.fn(), compose: vi.fn(), authService: vi.fn(), argon: vi.fn(), prepare: vi.fn(),
  poolEnd: vi.fn(), lstat: vi.fn(), open: vi.fn(), unlink: vi.fn(), config: null as any,
}));
// `ControlApiConfig` is a TYPE that some modules import as a value; a strict mock namespace needs the key to exist.
vi.mock("../src/config", async original => ({ ...await original<typeof import("../src/config")>(), ControlApiConfig: undefined, loadConfig: () => h.config }));
vi.mock("../src/db/pool", async original => ({ ...await original<typeof import("../src/db/pool")>(), buildPool: h.buildPool }));
vi.mock("../src/execution-v2/current-human-schema", async original => ({ ...await original<typeof import("../src/execution-v2/current-human-schema")>(), assertRegisteredResearchCurrentHumanSchema: h.assertSchema }));
vi.mock("../src/execution-v2/native-core-runtime", async original => ({ ...await original<typeof import("../src/execution-v2/native-core-runtime")>(),
  nativeCoreRuntimeReference: () => ({ path: "/root/TEST_ONLY-native.json", sha256: "a".repeat(64) }), prepareNativeCoreRuntime: h.prepare }));
vi.mock("../src/auth/auth.service", async original => ({ ...await original<typeof import("../src/auth/auth.service")>(), AuthService: h.authService }));
vi.mock("../src/auth/argon", async original => ({ ...await original<typeof import("../src/auth/argon")>(), Argon2CredentialService: h.argon }));
vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: h.lstat, open: h.open, unlink: h.unlink }));

const reviewed = prepared(OWNER_STREAM_TEMPLATE), T = reviewed.ownerValue.target, OWNER = T.protected_owner_user_id;
const ART = "/root/TEST_ONLY-session-artifact.json", TOKEN = "/root/TEST_ONLY-session/token.json", TOKEN_DIR = "/root/TEST_ONLY-session";
type Entry = { bytes?: Buffer; uid: number; mode: number; ino: number; link?: boolean; dir?: boolean };
const fsEntries = new Map<string, Entry>();
let serial = 0, out: string[], err: string[];
const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });
const stat = (e: Entry) => ({ uid: e.uid, mode: e.mode, ino: e.ino, dev: 1, size: e.bytes?.length ?? 0, isFile: () => !e.dir && !e.link, isDirectory: () => Boolean(e.dir), isSymbolicLink: () => Boolean(e.link) });
const root = (over: Partial<Entry> = {}): Entry => ({ uid: 0, mode: 0o100600, ino: ++serial, ...over });
const rootDir = (over: Partial<Entry> = {}): Entry => ({ uid: 0, mode: 0o40755, ino: ++serial, dir: true, ...over });
const issueDoc = (over: object = {}) => ({ schema_version: ACCEPTANCE_ISSUE_SCHEMA, target: T, user_id: OWNER, ttl_seconds: 3600, token_path: TOKEN,
  approval_ref: "TEST_ONLY-NOT-REAL-APPROVAL", provenance_ref: "TEST_ONLY-review", ...over });
const revokeDoc = (over: object = {}) => ({ schema_version: ACCEPTANCE_REVOKE_SCHEMA, target: T, session_id: "ses_TEST_ONLY", user_id: OWNER, token_path: TOKEN,
  approval_ref: "TEST_ONLY-NOT-REAL-APPROVAL", provenance_ref: "TEST_ONLY-review", ...over });

function mountArtifact(doc: object, over: Partial<Entry> = {}) {
  const bytes = Buffer.from(JSON.stringify(doc), "utf8");
  fsEntries.set(ART, { ...root({ bytes }), ...over });
  return sha256(bytes);
}
async function run(operation: string, args: string[]): Promise<void> {
  vi.resetModules();
  const previous = process.argv;
  process.argv = ["node", "execution-native-session", operation, ...args];
  try {
    await import("../src/cli/execution-native-session");
    for (let i = 0; i < 100 && !out.length && !err.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally { process.argv = previous; }
}
const window = (over: { before?: number; after?: number } = {}) => ["--not-before-ms", String(over.before ?? NOW - 60_000), "--not-after-ms", String(over.after ?? NOW + 3_600_000)];
const dryArgs = (hash: string, over?: { before?: number; after?: number }) => ["--artifact", ART, "--sha256", hash, ...window(over), "--dry-run"];
const stderrCode = () => (err.length ? JSON.parse(err.join("")).code : undefined);
/** The whole point of --dry-run: not one of these may have happened. */
function expectOffline() {
  expect(h.buildPool).not.toHaveBeenCalled(); expect(h.poolEnd).not.toHaveBeenCalled(); expect(h.assertSchema).not.toHaveBeenCalled();
  expect(h.compose).not.toHaveBeenCalled(); expect(h.authService).not.toHaveBeenCalled(); expect(h.argon).not.toHaveBeenCalled();
  expect(h.unlink).not.toHaveBeenCalled();
  for (const call of h.open.mock.calls) { // read-only opens of the artifact only: never a create, write or the token path
    expect(call[0]).toBe(ART);
    expect(call[1] & (constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC)).toBe(0);
  }
}

beforeEach(() => {
  fsEntries.clear(); out = []; err = []; vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  h.target = T;
  h.config = { EXECUTION_READ_PROFILE: "native_manager_review_v1", PORTAL_ENV: "local", AUTH_MODE: "dev", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: T.workspace_id,
    DATABASE_URL: "postgres://TEST_ONLY-must-never-be-used.invalid/none", ARGON2_MEMORY_KIB: 8, ARGON2_ITERATIONS: 1, ARGON2_PARALLELISM: 1 };
  h.buildPool.mockImplementation(() => ({ end: h.poolEnd }));
  h.prepare.mockImplementation(async () => ({ poolProfile: {}, researchReviewTarget: () => h.target, compose: h.compose }));
  h.compose.mockResolvedValue({ currentHumanMutations: undefined });
  h.assertSchema.mockResolvedValue(undefined); h.unlink.mockResolvedValue(undefined);
  fsEntries.set(TOKEN_DIR, rootDir());
  h.lstat.mockImplementation(async (path: unknown) => { const e = fsEntries.get(String(path)); if (!e) throw enoent(); return stat(e); });
  h.open.mockImplementation(async (path: unknown) => {
    const e = fsEntries.get(String(path)); if (!e || !e.bytes) throw enoent();
    let offset = 0;
    return { stat: async () => stat(e), close: vi.fn(async () => undefined), read: async (buffer: Buffer, start: number, length: number) => {
      const count = Math.min(length, e.bytes!.length - offset);
      if (count > 0) e.bytes!.copy(buffer, start, offset, offset + count); offset += count; return { bytesRead: count, buffer };
    } };
  });
  vi.spyOn(process.stdout, "write").mockImplementation(((t: string) => { out.push(String(t)); return true; }) as never);
  vi.spyOn(process.stderr, "write").mockImplementation(((t: string) => { err.push(String(t)); return true; }) as never);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); process.exitCode = undefined; });

describe("execution-native-session --dry-run is offline (Edge item 3)", () => {
  it("issue --dry-run verifies the artifact and the token path and prints only a secret-free verdict; zero pool / schema / compose / AuthService / write", async () => {
    await run("issue", dryArgs(mountArtifact(issueDoc())));
    expect(JSON.parse(out.join(""))).toEqual({ schema_version: "portal.native-research-acceptance-session.v1", operation: "issue", dry_run: true, verified: true });
    expect(err).toEqual([]); expect(process.exitCode).toBeUndefined();
    expect(h.prepare).toHaveBeenCalledTimes(1); // the hash-pinned manifest target is read (no DB), nothing more
    expect(out.join("")).not.toContain(TOKEN);
    expectOffline();
    expect(fsEntries.has(TOKEN)).toBe(false); // nothing was created at the token path
  });
  it("revoke --dry-run verifies the artifact for an absent token file and for a root-owned one; never opens or wipes it", async () => {
    await run("revoke", dryArgs(mountArtifact(revokeDoc())));
    expect(JSON.parse(out.join(""))).toMatchObject({ operation: "revoke", dry_run: true, verified: true }); expectOffline();
    out = []; fsEntries.set(TOKEN, root({ bytes: Buffer.from("{}") }));
    await run("revoke", dryArgs(mountArtifact(revokeDoc())));
    expect(JSON.parse(out.join(""))).toMatchObject({ operation: "revoke", dry_run: true, verified: true }); expectOffline();
    expect(fsEntries.get(TOKEN)!.bytes!.toString()).toBe("{}");
  });
  it.each([
    ["a wrong approved hash", () => { mountArtifact(issueDoc()); return "0".repeat(64); }, "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["a target that is not the manifest pin", () => mountArtifact(issueDoc({ target: { ...T, workspace_id: "ws_other" } })), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["an artifact user that is not the protected owner", () => mountArtifact(issueDoc({ user_id: "usr_someone_else" })), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["a TTL above 2 h", () => mountArtifact(issueDoc({ ttl_seconds: 7201 })), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["a TTL below 60 s", () => mountArtifact(issueDoc({ ttl_seconds: 59 })), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["an unknown key", () => mountArtifact({ ...issueDoc(), extra: 1 }), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["a relative token path", () => mountArtifact(issueDoc({ token_path: "relative/token.json" })), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["a revoke artifact for a user that is not the owner", () => mountArtifact(revokeDoc({ user_id: "usr_someone_else" })), "revoke", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["an artifact that is not root-owned", () => mountArtifact(issueDoc(), { uid: 1000 }), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["an artifact readable by group", () => mountArtifact(issueDoc(), { mode: 0o100640 }), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["an artifact that is a symlink", () => mountArtifact(issueDoc(), { link: true }), "issue", undefined, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["an operator window that has not opened", () => mountArtifact(issueDoc()), "issue", { before: NOW + 60_000, after: NOW + 3_600_000 }, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["an operator window that has closed", () => mountArtifact(issueDoc()), "issue", { before: NOW - 3_600_000, after: NOW - 1 }, "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["a token directory not owned by root", () => { fsEntries.set(TOKEN_DIR, rootDir({ uid: 1000 })); return mountArtifact(issueDoc()); }, "issue", undefined, "ACCEPTANCE_TOKEN_FILE_REFUSED"],
    ["a group-writable token directory", () => { fsEntries.set(TOKEN_DIR, rootDir({ mode: 0o40775 })); return mountArtifact(issueDoc()); }, "issue", undefined, "ACCEPTANCE_TOKEN_FILE_REFUSED"],
    ["a missing token directory", () => { fsEntries.delete(TOKEN_DIR); return mountArtifact(issueDoc()); }, "issue", undefined, "ACCEPTANCE_TOKEN_FILE_REFUSED"],
    ["a token file that already exists (issue never overwrites)", () => { fsEntries.set(TOKEN, root({ bytes: Buffer.from("{}") })); return mountArtifact(issueDoc()); }, "issue", undefined, "ACCEPTANCE_TOKEN_FILE_REFUSED"],
    ["a token file that is not root-owned (revoke)", () => { fsEntries.set(TOKEN, root({ bytes: Buffer.from("{}"), uid: 1000 })); return mountArtifact(revokeDoc()); }, "revoke", undefined, "ACCEPTANCE_TOKEN_FILE_REFUSED"],
    ["a token path that is a symlink (revoke)", () => { fsEntries.set(TOKEN, root({ bytes: Buffer.from("{}"), link: true })); return mountArtifact(revokeDoc()); }, "revoke", undefined, "ACCEPTANCE_TOKEN_FILE_REFUSED"],
  ])("refuses %s with a typed code, exit 1, and still touches no pool / schema / compose / AuthService / token file", async (_name, arrange, operation, windowOver, expected) => {
    const hash = arrange() as string;
    const token = fsEntries.get(TOKEN)?.bytes?.toString();
    await run(operation as string, dryArgs(hash, windowOver as { before?: number; after?: number } | undefined));
    expect(stderrCode()).toBe(expected); expect(process.exitCode).toBe(1); expect(out).toEqual([]);
    expect(err.join("")).not.toContain(TOKEN); expect(err.join("")).not.toContain(ART);
    expectOffline();
    expect(fsEntries.get(TOKEN)?.bytes?.toString()).toBe(token); // untouched
  });
  it("scope and usage refusals also happen before any pool/schema/compose/AuthService", async () => {
    h.config = { ...h.config, AUTH_MODE: "cloudflare" };
    await run("issue", dryArgs(mountArtifact(issueDoc())));
    expect(stderrCode()).toBe("NATIVE_RESEARCH_SESSION_SCOPE_REQUIRED"); expect(process.exitCode).toBe(1); expectOffline(); expect(h.prepare).not.toHaveBeenCalled();
    err = []; process.exitCode = undefined; h.config = { ...h.config, AUTH_MODE: "dev" };
    await run("rotate", dryArgs(mountArtifact(issueDoc())));
    expect(stderrCode()).toBe("OWNER_ARTIFACT_USAGE"); expect(process.exitCode).toBe(2); expectOffline();
    err = []; process.exitCode = undefined;
    await run("issue", ["--artifact", ART, "--dry-run"]);
    expect(stderrCode()).toBe("OWNER_ARTIFACT_USAGE"); expect(process.exitCode).toBe(2); expectOffline();
  });
  it("CONTRAST (the spies are live): the same artifact WITHOUT --dry-run does build the pool, check the schema and compose, then ends the pool", async () => {
    const hash = mountArtifact(issueDoc());
    await run("issue", ["--artifact", ART, "--sha256", hash, ...window()]);
    expect(h.buildPool).toHaveBeenCalledTimes(1); expect(h.assertSchema).toHaveBeenCalledTimes(1); expect(h.compose).toHaveBeenCalledTimes(1); expect(h.poolEnd).toHaveBeenCalledTimes(1);
    expect(stderrCode()).toBe("NATIVE_RESEARCH_SESSION_COMPOSITION_REQUIRED"); // fake composition has no coordinator: nothing was issued
    expect(h.authService).not.toHaveBeenCalled(); expect(fsEntries.has(TOKEN)).toBe(false);
  });
});
