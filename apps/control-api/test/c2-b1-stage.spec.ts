import { createHash } from "node:crypto";
import { chmod, link, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stagePinnedC2B1PublicInput } from "../src/execution-v2/c2-b1-stage";

const sample = () => ({ schema: "ts.c2.pm-current-access-publication-input.v1", expected_version: 0,
  head: { db_login: "ts_pm_operator", db_role: "pm_scoped_writer", environment: "paper",
    user_id: "b2b70006-2373-4f10-b2d4-5e4c32af9204", version: 1 },
  acceptance: { document: { field_revision: "pma-field-policy-20261016-r1", fields: ["business_report"],
    membership_policy_revision: 1, operations: ["HISTORY", "READ"], physical_refs: [],
    scopes: [{ environment: "paper", portfolio_id: "synthetic-root" }], visibility: "BUSINESS" }, revoked: false },
  portal_fills: ["head.acceptance_id", "head.workspace_id", "head.workload_ref", "acceptance.effective_from",
    "acceptance.expires_at", "document.human_authority_revision", "document.application_revision",
    "document.acceptance_ref", "document.delegation_ref"],
  rules: { canonical: "json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)",
    copy_verbatim: ["expected_version", "head.user_id", "head.environment", "head.db_login", "head.db_role", "head.version",
      "acceptance.revoked", "acceptance.document.membership_policy_revision", "acceptance.document.field_revision",
      "acceptance.document.visibility", "acceptance.document.fields", "acceptance.document.operations",
      "acceptance.document.physical_refs", "acceptance.document.scopes"],
    effective_from: "signing time, UTC Z, whole seconds", window_max_days: 90 } });
const raw = () => Buffer.from(JSON.stringify(sample()));
const pin = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const dirs: string[] = [];
async function cell() { const dir = await mkdtemp(join(tmpdir(), "c2-b1-stage-test-")); dirs.push(dir); return dir; }
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe("C2 public B1 staging, not signing custody", () => {
  it("persists exact pinned bytes privately and safely reopens in a later call", async () => {
    const dir = await cell(), data = raw(), hash = pin(data), path = join(dir, `b1-${hash}.json`);
    expect(await stagePinnedC2B1PublicInput(dir, data, hash)).toEqual({ state: "STAGED_NOT_AUTHORIZED", input_sha256: hash });
    expect(await readFile(path)).toEqual(data);
    expect((await lstat(path)).mode & 0o7777).toBe(0o600);
    expect(await stagePinnedC2B1PublicInput(dir, data, hash)).toEqual({ state: "ALREADY_STAGED_NOT_AUTHORIZED", input_sha256: hash });
  });
  it("preserves an incomplete prior attempt and never calls it staged", async () => {
    const dir = await cell(), data = raw(), hash = pin(data), path = join(dir, `b1-${hash}.json`);
    await writeFile(path, data.subarray(0, 8), { mode: 0o600 });
    await expect(stagePinnedC2B1PublicInput(dir, data, hash)).rejects.toThrow("C2_B1_STAGE_CONFLICT_OR_INCOMPLETE");
    expect(await readFile(path)).toEqual(data.subarray(0, 8));
  });
  it("rejects symlink and hardlink targets without changing them", async () => {
    const dir = await cell(), data = raw(), hash = pin(data), path = join(dir, `b1-${hash}.json`);
    const victim = join(dir, "other"); await writeFile(victim, data, { mode: 0o600 });
    await symlink(victim, path);
    await expect(stagePinnedC2B1PublicInput(dir, data, hash)).rejects.toThrow();
    expect(await readFile(victim)).toEqual(data);
    await rm(path); await link(victim, path);
    await expect(stagePinnedC2B1PublicInput(dir, data, hash)).rejects.toThrow("C2_B1_STAGE_CONFLICT_OR_INCOMPLETE");
  });
  it("rejects incorrect pin, nonprivate directory and bad mode without authorizing", async () => {
    const dir = await cell(), data = raw(), hash = pin(data);
    await expect(stagePinnedC2B1PublicInput(dir, data, "a".repeat(64))).rejects.toThrow();
    await chmod(dir, 0o755);
    await expect(stagePinnedC2B1PublicInput(dir, data, hash)).rejects.toThrow("C2_B1_STAGE_DIRECTORY_INVALID");
    await chmod(dir, 0o700);
    const path = join(dir, `b1-${hash}.json`);
    await writeFile(path, data, { mode: 0o600 }); await chmod(path, 0o644);
    await expect(stagePinnedC2B1PublicInput(dir, data, hash)).rejects.toThrow("C2_B1_STAGE_CONFLICT_OR_INCOMPLETE");
  });
  it("concurrent same input cannot overwrite and can be retried after completion", async () => {
    const dir = await cell(), data = raw(), hash = pin(data);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => stagePinnedC2B1PublicInput(dir, data, hash)));
    expect(results.filter(x => x.status === "fulfilled" && x.value.state === "STAGED_NOT_AUTHORIZED")).toHaveLength(1);
    expect(await stagePinnedC2B1PublicInput(dir, data, hash)).toEqual({ state: "ALREADY_STAGED_NOT_AUTHORIZED", input_sha256: hash });
    expect(await readFile(join(dir, `b1-${hash}.json`))).toEqual(data);
  });
});
