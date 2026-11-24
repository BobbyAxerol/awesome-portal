/** Synthetic filesystem only; never opens a real owner artifact or credential. */
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessProfileError, buildAccessProfileArtifact } from "../src/execution-v2/access-profile-artifact";
import { accessProfileBuildFailure, runAccessProfileBuild, ACCESS_PROFILE_BUILD_INPUT_MAX_BYTES } from "../src/execution-v2/access-profile-build-operator";
import { readAccessProfileInputFile } from "../src/execution-v2/access-profile-files";
import { accessProfileInstallFailure, parseAccessProfileInstallArgs, runAccessProfileInstallDryRun } from "../src/execution-v2/ordinary-access-install-dry-run";
import { profileInput, PROFILE_FROM, profileTarget } from "./access-profile-fixture";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(),
  lstat: vi.fn(), open: vi.fn(), writeFile: vi.fn() }));
type File = { bytes: Buffer; uid: number; mode: number; ino: number; kind: "file" | "symlink" | "directory" | "fifo" | "device";
  size?: number; swapped?: boolean; openedKind?: File["kind"]; growing?: boolean };
const files = new Map<string, File>();
const reads: number[] = [];
const close = vi.fn(async () => undefined);
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const stat = (f: File, opened = false) => ({ uid: f.uid, mode: f.mode, ino: f.ino + (opened && f.swapped ? 1 : 0), dev: 1,
  size: f.size ?? f.bytes.length, mtimeMs: 1, ctimeMs: 1,
  isFile: () => (opened ? f.openedKind ?? f.kind : f.kind) === "file", isSymbolicLink: () => f.kind === "symlink" });
function mount(path: string, bytes: string | Buffer, over: Partial<File> = {}) {
  const file: File = { bytes: typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes),
    uid: 0, mode: 0o100600, ino: files.size + 1, kind: "file", ...over };
  files.set(path, file); return file;
}
beforeEach(() => {
  files.clear(); reads.length = 0; vi.clearAllMocks();
  vi.mocked(lstat).mockImplementation((async (path: unknown) => {
    const f = files.get(String(path)); if (!f) throw Error("PRIVATE_PATH_SENTINEL"); return stat(f);
  }) as never);
  vi.mocked(open).mockImplementation((async (path: unknown) => {
    const f = files.get(String(path)); if (!f) throw Error("PRIVATE_PATH_SENTINEL"); let offset = 0;
    return { stat: async () => stat(f, true), close, read: async (buffer: Buffer, start: number, length: number) => {
      reads.push(length);
      const count = f.growing ? length : Math.min(length, f.bytes.length - offset);
      if (f.growing) buffer.fill(32, start, start + count); else f.bytes.copy(buffer, start, offset, offset + count);
      offset += count; return { bytesRead: count, buffer };
    } };
  }) as never);
  vi.mocked(writeFile).mockResolvedValue(undefined);
});

describe("G2-A2 bounded authoring operator and opaque failures", () => {
  it("writes one new 0600 artifact and reports only the reviewed summary", async () => {
    mount("/TEST_ONLY/input.json", JSON.stringify(profileInput()));
    const result = await runAccessProfileBuild(["--input", "/TEST_ONLY/input.json", "--out", "/TEST_ONLY/new.json"]);
    const built = buildAccessProfileArtifact(profileInput());
    expect(writeFile).toHaveBeenCalledWith("/TEST_ONLY/new.json", built.bytes, { flag: "wx", mode: 0o600 });
    expect(result).toMatchObject({ installed: false, artifact_sha256: built.sha256 });
    expect(JSON.stringify(result)).not.toContain("/TEST_ONLY/");
  });
  it.each(["namespace", "action"])("does not echo an invalid %s sentinel or private path", async field => {
    const input = profileInput(), sentinel = "/PRIVATE_PATH_SECRET_SENTINEL";
    if (field === "action") input.users[1]!.actions = [sentinel];
    else input.profiles = [{ profile_key: "example", version: 1, namespace: sentinel, environment: "paper", profile_id: "EXAMPLE",
      catalogue_sha256: "a".repeat(64), profile_sha256: "b".repeat(64), field_policy_sha256: "c".repeat(64), field_policy_dir: "TEST_ONLY" }];
    mount("/TEST_ONLY/input.json", JSON.stringify(input));
    let failure: unknown;
    try { await runAccessProfileBuild(["--input", "/TEST_ONLY/input.json", "--out", "/TEST_ONLY/new.json"]); }
    catch (error) { failure = accessProfileBuildFailure(error); }
    expect(JSON.stringify(failure)).not.toContain(sentinel);
    expect(failure).toMatchObject({ exitCode: 1 }); expect(writeFile).not.toHaveBeenCalled();
    expect(accessProfileBuildFailure(new AccessProfileError("ACCESS_PROFILE_INPUT_INVALID", sentinel)))
      .toEqual({ code: "ACCESS_PROFILE_INPUT_INVALID", exitCode: 1 });
  });
  it("refuses overwrite and never returns the filesystem error text", async () => {
    mount("/TEST_ONLY/input.json", JSON.stringify(profileInput()));
    vi.mocked(writeFile).mockRejectedValue(new Error("PRIVATE_PATH_SECRET_SENTINEL"));
    await expect(runAccessProfileBuild(["--input", "/TEST_ONLY/input.json", "--out", "/TEST_ONLY/existing.json"]))
      .rejects.toMatchObject({ code: "ACCESS_PROFILE_BUILD_IO" });
    expect(accessProfileBuildFailure(new Error("PRIVATE_PATH_SECRET_SENTINEL"))).toEqual({ code: "ACCESS_PROFILE_BUILD_FAILED", exitCode: 1 });
  });
});

describe("G2-A3 bounded regular-file authoring input", () => {
  it.each(["symlink", "directory", "fifo", "device"] as const)("rejects %s before open/read", async kind => {
    mount("/TEST_ONLY/input", "{}", { kind });
    await expect(readAccessProfileInputFile("/TEST_ONLY/input", 16)).rejects.toThrow();
    expect(open).not.toHaveBeenCalled(); expect(reads).toEqual([]);
  });
  it("rejects oversized metadata before opening", async () => {
    mount("/TEST_ONLY/input", "{}", { size: ACCESS_PROFILE_BUILD_INPUT_MAX_BYTES + 1 });
    await expect(readAccessProfileInputFile("/TEST_ONLY/input", ACCESS_PROFILE_BUILD_INPUT_MAX_BYTES)).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
  it("uses no-follow/nonblocking open and rejects replacement and nonregular races without reads", async () => {
    for (const over of [{ swapped: true }, { openedKind: "fifo" as const }]) {
      mount("/TEST_ONLY/input", "{}", over);
      await expect(readAccessProfileInputFile("/TEST_ONLY/input", 16)).rejects.toThrow();
    }
    expect(open).toHaveBeenCalledWith("/TEST_ONLY/input", constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    expect(reads).toEqual([]); expect(close).toHaveBeenCalledTimes(2);
  });
  it("reads at most cap+1 even if a regular file grows, then closes it", async () => {
    mount("/TEST_ONLY/input", "{}", { growing: true });
    await expect(readAccessProfileInputFile("/TEST_ONLY/input", 16)).rejects.toThrow();
    expect(reads.reduce((a, b) => a + b, 0)).toBe(17); expect(close).toHaveBeenCalledOnce();
  });
  it("refuses invalid UTF-8 rather than replacing bytes", async () => {
    mount("/TEST_ONLY/input", Buffer.from([0xff, 0xfe]));
    await expect(readAccessProfileInputFile("/TEST_ONLY/input", 16)).rejects.toThrow();
  });
});

function dryRunFixture() {
  const built = buildAccessProfileArtifact(profileInput()), target = JSON.stringify(profileTarget);
  mount("/TEST_ONLY/artifact", built.bytes); mount("/TEST_ONLY/target", target);
  const args = ["--dry-run", "--artifact", "/TEST_ONLY/artifact", "--sha256", built.sha256,
    "--not-before-ms", String(PROFILE_FROM), "--not-after-ms", String(PROFILE_FROM + 60_000),
    "--target-file", "/TEST_ONLY/target", "--target-sha256", hash(target)];
  return { built, args, run: () => runAccessProfileInstallDryRun(args, { now: () => PROFILE_FROM + 1 }) };
}
describe("G2-A4 independent target provenance and dry-run only", () => {
  it("validates both pinned private files but never claims live target qualification or install", async () => {
    const result = await dryRunFixture().run();
    expect(result).toMatchObject({ state: "DRY_RUN_VALIDATED", writes: false, runtime_target: "NOT_VERIFIED",
      target_provenance: "ROOT_OWNED_0600_SHA256_PINNED", install: { available: false } });
    expect(writeFile).not.toHaveBeenCalled();
  });
  it("requires a separate target hash, dry-run, finite intake, absolute paths and no unknown flags", () => {
    const { args } = dryRunFixture();
    for (const bad of [args.slice(0, -2), args.filter(v => v !== "--dry-run"), [...args, "--install"],
      [...args, "--target-sha256", "a".repeat(64)]])
      expect(() => parseAccessProfileInstallArgs(bad)).toThrow();
    expect(open).not.toHaveBeenCalled();
  });
  it.each(["target", "artifact"])("rejects substituted %s bytes against its independent hash", async name => {
    const x = dryRunFixture(); files.get(`/TEST_ONLY/${name}`)!.bytes = Buffer.from("{}");
    await expect(x.run()).rejects.toMatchObject({ code: "ACCESS_PROFILE_INSTALL_REFUSED" });
  });
  it.each(["target", "artifact"])("enforces %s file owner/mode/type and inode protections", async name => {
    for (const over of [{ uid: 1000 }, { mode: 0o100640 }, { kind: "symlink" as const }, { kind: "fifo" as const }, { swapped: true }]) {
      const x = dryRunFixture(); Object.assign(files.get(`/TEST_ONLY/${name}`)!, over);
      await expect(x.run()).rejects.toMatchObject({ code: "ACCESS_PROFILE_INSTALL_REFUSED" });
    }
  });
  it("rejects a hash-correct but different target and a closed intake window", async () => {
    const x = dryRunFixture(), other = JSON.stringify({ ...profileTarget, database_system_identifier: "1" });
    mount("/TEST_ONLY/target", other); x.args[x.args.length - 1] = hash(other);
    await expect(x.run()).rejects.toMatchObject({ code: "ACCESS_PROFILE_INSTALL_REFUSED" });
    const y = dryRunFixture();
    await expect(runAccessProfileInstallDryRun(y.args, { now: () => PROFILE_FROM + 60_000 }))
      .rejects.toMatchObject({ code: "ACCESS_PROFILE_INSTALL_REFUSED" });
    expect(JSON.stringify({ code: accessProfileInstallFailure(new Error("PRIVATE_PATH_SECRET_SENTINEL")).code }))
      .not.toContain("SECRET_SENTINEL");
  });
});
