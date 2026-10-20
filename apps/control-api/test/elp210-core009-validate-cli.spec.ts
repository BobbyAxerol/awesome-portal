/** TEST_ONLY. The offline `core009-validate` CLI on real temporary files holding
 * SYNTHETIC values, plus a static lint of the operator readback SQL. Proves the
 * CLI opens exactly the two files it is given (never a referenced key/cert),
 * prints no reference path, and exits non-zero on any error. Nothing connects to
 * a database, Docker, SSH or a source. */
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_READ_TEMPLATE, OWNER_STREAM_TEMPLATE, TEMPLATE_DIR, prepared, sha256 } from "./fixtures/core009-templates";

const opened: string[] = [];
vi.mock("node:fs", async original => {
  const real = await original<typeof import("node:fs")>();
  return { ...real, openSync: ((path: string, ...rest: unknown[]) => { opened.push(String(path)); return (real.openSync as any)(path, ...rest); }) as typeof real.openSync };
});

let dir: string, out: string[], err: string[], codes: unknown[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "core009-cli-")); out = []; err = []; codes = []; opened.length = 0;
  vi.spyOn(process.stdout, "write").mockImplementation(((t: string) => { out.push(String(t)); return true; }) as never);
  vi.spyOn(process.stderr, "write").mockImplementation(((t: string) => { err.push(String(t)); return true; }) as never);
  vi.spyOn(process, "exit").mockImplementation(((c?: number) => { codes.push(c); throw new Error("EXIT"); }) as never);
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; rmSync(dir, { recursive: true, force: true }); });

function files(p = prepared()) {
  const runtime = join(dir, "runtime.json"), owner = join(dir, "owner.json");
  writeFileSync(runtime, p.runtime, { mode: 0o600 }); writeFileSync(owner, p.owner, { mode: 0o600 });
  return { runtime, owner, p };
}
async function run(...args: string[]): Promise<any> {
  vi.resetModules();
  const previous = process.argv;
  process.argv = ["node", "core009-validate", ...args];
  try { await import("../src/cli/core009-validate"); await new Promise(resolve => setTimeout(resolve, 150)); }
  finally { process.argv = previous; }
  return out.length ? JSON.parse(out.join("")) : undefined;
}
const GOOD = ["--now", "2026-10-20T06:30:00Z", "--trust-expires-at", "2026-10-20T08:00:59Z"];

describe("TEST_ONLY core009-validate CLI", () => {
  it("passes a coherent pair, opens only the two given files and prints no reference path", async () => {
    const { runtime, owner, p } = files();
    const report = await run("--runtime", runtime, "--owner", owner, "--expect-runtime-sha256", sha256(p.runtime), ...GOOD);
    expect(report).toMatchObject({ schema_version: "portal.core009-preparation-report.v1", ok: true, stat_refs: false });
    expect(process.exitCode).toBe(0);
    expect(opened.filter(path => path.startsWith(dir)).sort()).toEqual([owner, runtime].sort());
    expect(opened.some(path => path.includes("/run/secrets") || path.includes("TEST_ONLY-owner"))).toBe(false);
    expect(out.join("")).not.toContain("/run/secrets");
  });
  it("exits 1 with stable codes on any error, including a wrong plan and a wrong pin", async () => {
    const { runtime, owner } = files();
    let report = await run("--runtime", runtime, "--owner", owner, "--plan", "read-and-stream", ...GOOD);
    expect(process.exitCode).toBe(1);
    expect(report.errors.map((e: any) => e.code)).toContain("STREAM_GRANT_MISSING_FROM_READ_AND_STREAM_PLAN");
    out.length = 0;
    report = await run("--runtime", runtime, "--owner", owner, "--expect-runtime-sha256", "0".repeat(64), ...GOOD);
    expect(process.exitCode).toBe(1);
    expect(report.errors.map((e: any) => e.code)).toContain("RUNTIME_SHA256_PIN_MISMATCH");
  });
  it("accepts a STREAM artifact only under the explicit read-and-stream plan", async () => {
    const s = prepared(OWNER_STREAM_TEMPLATE), { runtime, owner } = files(s);
    expect((await run("--runtime", runtime, "--owner", owner, ...GOOD)).ok).toBe(false);
    out.length = 0;
    expect((await run("--runtime", runtime, "--owner", owner, "--plan", "read-and-stream", ...GOOD)).ok).toBe(true);
  });
  it("finite validity is judged at --now and bounded by --trust-expires-at", async () => {
    const { runtime, owner } = files();
    const late = await run("--runtime", runtime, "--owner", owner, "--now", "2026-10-20T07:50:00Z", "--trust-expires-at", "2026-10-20T08:00:59Z");
    expect(late.errors.map((e: any) => e.code)).toEqual(expect.arrayContaining(["INSTALLATION_WINDOW_EXPIRED_OR_TOO_SHORT", "OWNER_INTAKE_EXPIRED_OR_TOO_SHORT"]));
    out.length = 0;
    const early = await run("--runtime", runtime, "--owner", owner, "--now", "2026-10-20T06:30:00Z", "--trust-expires-at", "2026-10-20T07:00:00Z");
    expect(early.errors.map((e: any) => e.code)).toContain("INSTALLATION_OUTLIVES_TRUST");
  });
  it("--policy-install-only turns a stale source window into a warning and leaves the owner side strict", async () => {
    const { runtime, owner } = files();
    const stale = ["--now", "2026-10-20T07:50:00Z"];
    expect((await run("--runtime", runtime, "--owner", owner, ...stale)).ok).toBe(false);
    out.length = 0;
    const late = await run("--runtime", runtime, "--owner", owner, "--policy-install-only", ...stale);
    expect(late.errors.map((e: any) => e.code).sort()).toEqual(["GRANT_EXPIRED_OR_TOO_SHORT", "OWNER_INTAKE_EXPIRED_OR_TOO_SHORT"]);
    expect(late.warnings.map((e: any) => e.code)).toContain("INSTALLATION_WINDOW_EXPIRED_OR_TOO_SHORT");
    out.length = 0;
    const early = await run("--runtime", runtime, "--owner", owner, "--policy-install-only", ...GOOD);
    expect(early.ok).toBe(true);
  });
  it("--stat-refs uses lstat only: absent referenced files are reported, never opened", async () => {
    const { runtime, owner } = files();
    const report = await run("--runtime", runtime, "--owner", owner, "--stat-refs", "--runtime-uid", "1000", ...GOOD);
    expect(report.stat_refs).toBe(true);
    expect(report.errors.map((e: any) => e.code)).toEqual(expect.arrayContaining(["TLS_REF_UNAVAILABLE", "SIGNING_REF_UNAVAILABLE", "OWNER_ARTIFACT_UNAVAILABLE"]));
    expect(opened.filter(path => path.startsWith(dir)).sort()).toEqual([owner, runtime].sort());
    expect(process.exitCode).toBe(1);
  });
  it("refuses a symlinked, oversized or missing input with one fixed code and no detail", async () => {
    const { owner } = files(), link = join(dir, "link.json");
    symlinkSync(join(dir, "runtime.json"), link);
    await run("--runtime", link, "--owner", owner);
    expect(err.join("")).toBe(JSON.stringify({ code: "CORE009_VALIDATE_FAILED" }) + "\n"); expect(process.exitCode).toBe(1);
    err.length = 0; out.length = 0;
    const big = join(dir, "big.json"); writeFileSync(big, Buffer.alloc(131073, 0x20), { mode: 0o600 });
    await run("--runtime", big, "--owner", owner);
    expect(err.join("")).toContain("CORE009_VALIDATE_FAILED");
    err.length = 0;
    await run("--runtime", join(dir, "absent.json"), "--owner", owner);
    expect(err.join("")).toBe(JSON.stringify({ code: "CORE009_VALIDATE_FAILED" }) + "\n"); expect(out).toEqual([]);
  });
  it.each([
    [["--runtime", "a"]], [["--owner", "a"]],
    [["--runtime", "a", "--owner", "b", "--plan", "everything"]],
    [["--runtime", "a", "--owner", "b", "--unknown", "x"]],
    [["--runtime", "a", "--owner", "b", "--expect-runtime-sha256", "xyz"]],
    [["--runtime", "a", "--owner", "b", "--now", "yesterday"]],
    [["--runtime", "a", "--owner", "b", "--max-grant-hours", "-1"]],
    [["--runtime", "a", "--owner"]],
  ])("usage error %j exits 2 before touching any file", async args => {
    await run(...args);
    expect(codes).toContain(2); expect(opened.filter(path => path.startsWith(dir))).toEqual([]);
  });
});

describe("TEST_ONLY operator readback SQL is read-only and names real relations", () => {
  const sql = readFileSync(join(TEMPLATE_DIR, "core009-readonly-readback.sql"), "utf8");
  const statements = sql.split("\n").filter(line => !line.trim().startsWith("--")).join("\n").split(";").map(s => s.trim()).filter(Boolean);
  it("is one READ ONLY transaction that is always rolled back", () => {
    expect(statements[0]).toBe("BEGIN READ ONLY");
    expect(statements[statements.length - 1]).toBe("ROLLBACK");
    expect(statements.every(s => /^(BEGIN READ ONLY|SET LOCAL (statement|lock)_timeout|SELECT\b|ROLLBACK)/.test(s))).toBe(true);
    const code = statements.join(";\n");
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|COPY|CALL|DO|COMMIT|VACUUM|LOCK|set_config|nextval|pg_terminate|pg_cancel|lo_\w+|dblink|FOR UPDATE|FOR SHARE)\b/i);
    // REVOKE is banned as a statement (the first-token check above already makes one impossible); BE-P10 block E only
    // filters audit rows by the literal operation name 'REVOKE'.
    expect(statements.some(s => /^REVOKE\b/i.test(s))).toBe(false);
    // Secrets and token hashes are never selected. A session's PUBLIC id (block F, BE-P10) is allowed; its token hash is not.
    expect(code).not.toMatch(/password_hash|secret|token|cookie|\bdsn\b|private_key|csrf/i);
  });
  it("only references relations that exist in the shipped schema", () => {
    const candidate = readFileSync(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8");
    for (const relation of ["authority", "leases", "obligations", "native_read_obligations", "mutations"])
      expect(candidate).toMatch(new RegExp(`(TABLE|VIEW) elp210_candidate\\.${relation}\\b`));
    const migrations = readdirSync(join(__dirname, "../migrations")).map(f => readFileSync(join(__dirname, "../migrations", f), "utf8")).join("\n");
    for (const table of ["portal_access_policy_state", "portal_access_grants_v2", "portal_access_policy_events", "portal_users", "workspace_members"])
      expect(migrations, table).toContain(table);
  });
});
