/** BE-P22 private operator CLI: argv, the ONE bounded join and its SQL. No
 * database, no key, no network: the obligation fetch is an injected double and
 * the log is a real 0700/0600 temp directory. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNativeCacheObservationArgs } from "../src/cli/execution-native-cache-observation";
import * as observation from "../src/execution-v2/native-cache-observation";
import {
  FileNativeCacheObservationSink, MemoryNativeCacheObservationSink, NATIVE_CACHE_OBLIGATION_COLUMNS,
  NATIVE_CACHE_OBLIGATION_SQL, NativeCacheObserver, joinNativeCacheObservation, type NativeCacheObservationInput,
} from "../src/execution-v2/native-cache-observation";

const sha = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const KEY = randomBytes(32);
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const input = (phase: NativeCacheObservationInput["egress_phase"] = "SERVED"): NativeCacheObservationInput => ({
  lease_id: randomUUID(), attempt_id: randomUUID(), operation_id: "portal.execution.maximum-data.deployment-page",
  capture: { cache_state: "HIT", cache_identity: sha("cache-key") }, native_epoch_digest: sha("epoch"),
  body_digest: sha(`body-${randomUUID()}`), egress_phase: phase,
});
const row = (i: NativeCacheObservationInput, extra: Record<string, unknown> = {}) => ({
  lease_id: i.lease_id, attempt_id: i.attempt_id, phase: "SERVED", body_digest: i.body_digest, receipt_digest: sha("receipt"),
  source_ack_digest: sha("ack"), source_reconciled: true, ...extra,
});

describe("argv", () => {
  const lease = randomUUID(), attempt = randomUUID();
  it("accepts exactly --dir (absolute), --lease and --attempt once each", () => {
    expect(parseNativeCacheObservationArgs(["--dir", "/var/obs", "--lease", lease, "--attempt", attempt]))
      .toEqual({ dir: "/var/obs", lease, attempt });
    expect(parseNativeCacheObservationArgs(["--attempt", attempt, "--lease", lease, "--dir", "/var/obs"]).lease).toBe(lease);
  });
  it.each([
    [[]], [["--dir", "/v", "--lease", randomUUID()]], [["--dir", "obs", "--lease", randomUUID(), "--attempt", randomUUID()]],
    [["--dir", "/v", "--lease", "not-a-uuid", "--attempt", randomUUID()]],
    [["--dir", "/v", "--lease", randomUUID().toUpperCase(), "--attempt", randomUUID()]],
    [["--dir", "/v", "--lease", randomUUID(), "--attempt", randomUUID(), "--all"]],
    [["--dir", "/v", "--lease", randomUUID(), "--lease", randomUUID(), "--attempt", randomUUID()]],
    [["--dir", "/v", "--lease", randomUUID(), "--attempt"]],
    [["--list"]], [["--dir", "/v", "--lease", randomUUID(), "--attempt", randomUUID(), "--limit", "5"]],
  ])("refuses %j as a usage error (no list, search, range or relative path)", argv => {
    expect(() => parseNativeCacheObservationArgs(argv)).toThrow("NATIVE_CACHE_OBSERVATION_USAGE");
  });
});

describe("the one bounded join", () => {
  it("SQL names exactly the 7 obligation columns with exact lease+attempt equality and nothing else", () => {
    expect(NATIVE_CACHE_OBLIGATION_COLUMNS).toEqual(["lease_id", "attempt_id", "phase", "body_digest", "receipt_digest", "source_ack_digest", "source_reconciled"]);
    expect(NATIVE_CACHE_OBLIGATION_SQL).toBe("SELECT lease_id, attempt_id, phase, body_digest, receipt_digest, source_ack_digest, source_reconciled "
      + "FROM elp210_candidate.native_read_obligations WHERE lease_id = $1 AND attempt_id = $2");
    expect(NATIVE_CACHE_OBLIGATION_SQL).not.toMatch(/\*|base_body|cookie|token|jwt|secret|LIMIT|OFFSET|ORDER|LIKE|\bOR\b|;|--/i);
    expect(NATIVE_CACHE_OBLIGATION_SQL.match(/\$\d+/g)).toEqual(["$1", "$2"]);
  });

  it("CORRELATED for a recorded observation and its durable row; the fetch gets exactly the pair", async () => {
    const sink = new MemoryNativeCacheObservationSink(), i = input("NOT_OBSERVED_IN_RETURN");
    await new NativeCacheObserver(KEY, sink).record(i);
    const fetch = vi.fn(async () => [row(i)]);
    const receipt = await joinNativeCacheObservation(sink, fetch, i.lease_id, i.attempt_id);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(i.lease_id, i.attempt_id);
    expect(receipt).toMatchObject({ verdict: "CORRELATED", durable_egress: "SERVED" });
  });

  it("reports an absent observation without touching the database (it proves nothing about the cache)", async () => {
    const fetch = vi.fn(async () => [] as unknown[]);
    expect(await joinNativeCacheObservation(new MemoryNativeCacheObservationSink(), fetch, randomUUID(), randomUUID()))
      .toEqual({ schema_version: "portal.native-cache-observation-receipt.v1", verdict: "NO_OBSERVATION" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a missing custody row as such and never synthesises one; more than one row is refused", async () => {
    const sink = new MemoryNativeCacheObservationSink(), i = input();
    await new NativeCacheObserver(KEY, sink).record(i);
    expect(await joinNativeCacheObservation(sink, async () => [], i.lease_id, i.attempt_id)).toMatchObject({ verdict: "NO_CUSTODY_ROW" });
    await expect(joinNativeCacheObservation(sink, async () => [row(i), row(i)], i.lease_id, i.attempt_id)).rejects.toThrow(/CUSTODY_REFUSED/);
  });

  it("refuses any column beyond the 7 (base_body, jwt, cookie, session) and a malformed pair", async () => {
    const sink = new MemoryNativeCacheObservationSink(), i = input();
    await new NativeCacheObserver(KEY, sink).record(i);
    for (const extra of [{ base_body: "{}" }, { terminal: "eyJ" }, { cookie: "x" }, { session_id: "s" }, { stable_core_digest: "a".repeat(64) }])
      await expect(joinNativeCacheObservation(sink, async () => [row(i, extra)], i.lease_id, i.attempt_id)).rejects.toThrow(/CUSTODY_REFUSED/);
    for (const [lease, attempt] of [["x", i.attempt_id], [i.lease_id, "y"], ["", ""]] as const)
      await expect(joinNativeCacheObservation(sink, async () => [], lease, attempt)).rejects.toThrow(/JOIN_KEY_REFUSED/);
  });

  it("another request's row, a different body or lease/attempt drift is a MISMATCH, not a silent pass", async () => {
    const sink = new MemoryNativeCacheObservationSink(), i = input("SERVED"), other = input();
    await new NativeCacheObserver(KEY, sink).record(i);
    expect(await joinNativeCacheObservation(sink, async () => [row(other)], i.lease_id, i.attempt_id)).toMatchObject({ verdict: "MISMATCH" });
    expect(await joinNativeCacheObservation(sink, async () => [row(i, { body_digest: sha("x") })], i.lease_id, i.attempt_id)).toMatchObject({ verdict: "MISMATCH" });
    expect(await joinNativeCacheObservation(sink, async () => [row(i, { phase: "ABORTED" })], i.lease_id, i.attempt_id)).toMatchObject({ verdict: "MISMATCH" });
  });

  it("works through the real private file sink in read mode: no directory is created, a loose one is refused, a lease alone finds nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "native-cache-cli-")); dirs.push(dir); chmodSync(dir, 0o700);
    const i = input();
    await new NativeCacheObserver(KEY, new FileNativeCacheObservationSink(dir)).record(i);
    const read = new FileNativeCacheObservationSink(dir, { create: false });
    expect(await joinNativeCacheObservation(read, async () => [row(i)], i.lease_id, i.attempt_id)).toMatchObject({ verdict: "CORRELATED" });
    expect(await joinNativeCacheObservation(read, async () => [row(i)], i.lease_id, randomUUID())).toMatchObject({ verdict: "NO_OBSERVATION" });
    const missing = join(dir, "does-not-exist");
    expect(() => new FileNativeCacheObservationSink(missing, { create: false })).toThrow(/DIRECTORY_REFUSED/);
    expect(existsSync(missing)).toBe(false);
    const loose = mkdtempSync(join(tmpdir(), "native-cache-cli-")); dirs.push(loose); chmodSync(loose, 0o755);
    expect(() => new FileNativeCacheObservationSink(loose, { create: false })).toThrow(/DIRECTORY_REFUSED/);
  });
});

describe("surface: no enumeration, no key, no write", () => {
  it("the CLI source reads the log and the 7-column row only: no key loader, no list API, no write, no SELECT *", () => {
    const source = readFileSync(join(__dirname, "../src/cli/execution-native-cache-observation.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/loadNativeCacheObservationKey|NativeCacheObserver\b|\.append\(|writeFile|appendFile|unlink|INSERT|UPDATE |DELETE|SELECT \*|base_body/);
    expect(code).toContain("BEGIN READ ONLY");
    expect(code).toContain("NATIVE_CACHE_OBLIGATION_SQL");
  });
  it("the module exposes no list / enumerate / all / scan function", () => {
    expect(Object.keys(observation).filter(name => /list|enumerate|all\b|scan|search|range|export/i.test(name))).toEqual([]);
    expect(Object.getOwnPropertyNames(FileNativeCacheObservationSink.prototype).sort()).toEqual(["append", "constructor", "find"]);
  });
});
