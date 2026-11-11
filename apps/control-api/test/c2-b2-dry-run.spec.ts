import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// The byte-parity test shells out to python3, which the Docker node cell does not have; it runs wherever python3 exists.
const hasPython3 = spawnSync("python3", ["--version"]).error === undefined;
import { describe, expect, it } from "vitest";
import { assembleC2B2DryRun } from "../src/execution-v2/c2-b2-dry-run";

const sample = () => ({ schema: "ts.c2.pm-current-access-publication-input.v1", expected_version: 0,
  head: { db_login: "ts_pm_operator", db_role: "pm_scoped_writer", environment: "paper",
    user_id: "b2b70006-2373-4f10-b2d4-5e4c32af9204", version: 1 },
  acceptance: { document: { field_revision: "pma-field-policy-20261016-r1", fields: ["business_report"],
    membership_policy_revision: 1, operations: ["HISTORY", "READ"], physical_refs: [],
    scopes: [{ environment: "paper", portfolio_id: "paper-portfolio-α😀" },
      { environment: "paper", portfolio_id: "paper-root-1" }], visibility: "BUSINESS" }, revoked: false },
  portal_fills: ["head.acceptance_id", "head.workspace_id", "head.workload_ref", "acceptance.effective_from",
    "acceptance.expires_at", "document.human_authority_revision", "document.application_revision",
    "document.acceptance_ref", "document.delegation_ref"],
  rules: { canonical: "json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)",
    copy_verbatim: ["expected_version", "head.user_id", "head.environment", "head.db_login", "head.db_role", "head.version",
      "acceptance.revoked", "acceptance.document.membership_policy_revision", "acceptance.document.field_revision",
      "acceptance.document.visibility", "acceptance.document.fields", "acceptance.document.operations",
      "acceptance.document.physical_refs", "acceptance.document.scopes"],
    effective_from: "signing time, UTC Z, whole seconds", window_max_days: 90 } });
const fields = () => ({ acceptance_id: "acc-α", workspace_id: "ws-研究", workload_ref: "wl-😀",
  effective_from: "2026-11-05T00:00:00Z", expires_at: "2027-02-03T00:00:00Z",
  human_authority_revision: 42, application_revision: "revision-6", acceptance_ref: "acc-α:sha256:ab1",
  delegation_ref: "del-1" });
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("C2 B2 unsigned, unauthorized dry-run", () => {
  it.skipIf(!hasPython3)("copies TS arrays exactly and produces Python ensure_ascii/sort_keys bytes", () => {
    const input = sample(), raw = bytes(input);
    const output = assembleC2B2DryRun(raw, hash(raw), fields());
    expect(output.state).toBe("DRY_RUN_NOT_AUTHORIZED");
    expect(output.b1_sha256).toBe(hash(raw));
    expect(output.canonical_payload_ascii).toMatch(/\\u03b1/);
    expect(output.canonical_payload_ascii).toMatch(/\\ud83d\\ude00/);
    const parsed = JSON.parse(output.canonical_payload_ascii);
    expect(parsed.acceptance.document.scopes).toEqual(input.acceptance.document.scopes);
    expect(parsed.acceptance.document.operations).toEqual(["HISTORY", "READ"]);
    expect(parsed.acceptance.document.fields).toEqual(input.acceptance.document.fields);
    expect(parsed.acceptance.document.physical_refs).toEqual(input.acceptance.document.physical_refs);
    // This is a small synthetic fixture, not secret material. Passing it as an
    // argument avoids sandboxed spawnSync stdin pipes waiting indefinitely.
    const python = spawnSync("python3", ["-c", "import json,sys;sys.stdout.write(json.dumps(json.loads(sys.argv[1]),sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False))", output.canonical_payload_ascii],
      { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "pipe"] });
    expect(python.error).toBeUndefined();
    expect(python.status).toBe(0);
    expect(python.stdout).toBe(output.canonical_payload_ascii);
  });
  it("rejects tampered B1 even if a new scope or operation is structurally valid", () => {
    const input = sample(), original = bytes(input), pin = hash(original);
    input.acceptance.document.operations.push("STREAM");
    expect(() => assembleC2B2DryRun(bytes(input), pin, fields())).toThrow();
    input.acceptance.document.operations.pop();
    input.acceptance.document.scopes.push({ environment: "paper", portfolio_id: "paper-new" });
    expect(() => assembleC2B2DryRun(bytes(input), pin, fields())).toThrow();
  });
  it("rejects additional Portal fields, missing fields, unknown scopes and unsafe revisions", () => {
    const raw = bytes(sample()), pin = hash(raw);
    expect(() => assembleC2B2DryRun(raw, pin, { ...fields(), scopes: [] })).toThrow();
    const { acceptance_ref: _removed, ...missing } = fields();
    expect(() => assembleC2B2DryRun(raw, pin, missing)).toThrow();
    expect(() => assembleC2B2DryRun(raw, pin, { ...fields(), human_authority_revision: 2 ** 53 })).toThrow();
    expect(() => assembleC2B2DryRun(raw, pin, { ...fields(), workload_ref: "fixture-value" })).toThrow();
    expect(() => assembleC2B2DryRun(raw, pin, { ...fields(), acceptance_id: "b922c105-4e99-4830-8be2-bb2e1f41b5d9" })).toThrow();
  });
  it("rejects impossible dates, non-UTC, zero or over-90-day window", () => {
    const raw = bytes(sample()), pin = hash(raw);
    for (const overrides of [
      { effective_from: "2026-02-30T00:00:00Z" },
      { effective_from: "0000-01-01T00:00:00Z" },
      { effective_from: "2026-11-05T00:00:00+07:00" },
      { expires_at: "2026-11-05T00:00:00Z" },
      { expires_at: "2027-02-03T00:00:01Z" },
    ]) expect(() => assembleC2B2DryRun(raw, pin, { ...fields(), ...overrides })).toThrow();
    expect(assembleC2B2DryRun(raw, pin, { ...fields(), effective_from: "2026-11-05T00:00:00+00:00" }).state)
      .toBe("DRY_RUN_NOT_AUTHORIZED");
  });
  const actualB1 = process.env.C2_B1_PREFLIGHT_TEST_FILE;
  it.skipIf(!actualB1)("can rehearse the pinned public B1 without treating it as approved", () => {
    const raw = readFileSync(actualB1!);
    const pin = process.env.C2_B1_PREFLIGHT_TEST_SHA256!;
    const result = assembleC2B2DryRun(raw, pin, fields());
    expect(result.state).toBe("DRY_RUN_NOT_AUTHORIZED");
    expect(JSON.parse(result.canonical_payload_ascii).acceptance.document.operations).toEqual(["HISTORY", "READ"]);
  });
});
