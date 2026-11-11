import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preflightC2B1 } from "../src/execution-v2/c2-b1-preflight";

const sample = () => ({ schema: "ts.c2.pm-current-access-publication-input.v1", expected_version: 0,
  head: { db_login: "ts_pm_operator", db_role: "pm_scoped_writer", environment: "paper",
    user_id: "b2b70006-2373-4f10-b2d4-5e4c32af9204", version: 1 },
  acceptance: { document: { field_revision: "pma-field-policy-20261016-r1", fields: ["business_report"],
    membership_policy_revision: 1, operations: ["HISTORY", "READ"], physical_refs: [],
    scopes: [{ environment: "paper", portfolio_id: "synthetic-root" },
      { environment: "paper", portfolio_id: "synthetic-portfolio" }], visibility: "BUSINESS" }, revoked: false },
  portal_fills: ["head.acceptance_id", "head.workspace_id", "head.workload_ref", "acceptance.effective_from",
    "acceptance.expires_at", "document.human_authority_revision", "document.application_revision",
    "document.acceptance_ref", "document.delegation_ref"],
  rules: { canonical: "json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)",
    copy_verbatim: ["expected_version", "head.user_id", "head.environment", "head.db_login", "head.db_role", "head.version",
      "acceptance.revoked", "acceptance.document.membership_policy_revision", "acceptance.document.field_revision",
      "acceptance.document.visibility", "acceptance.document.fields", "acceptance.document.operations",
      "acceptance.document.physical_refs", "acceptance.document.scopes"],
    effective_from: "signing time, UTC Z, whole seconds", window_max_days: 90 } });
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const check = (value: unknown) => { const data = bytes(value); return preflightC2B1(data, hash(data)); };
const fail = (value: unknown) => expect(() => check(value)).toThrow("C2_B1_INVALID");

describe("C2 B1 offline preflight (not authorization)", () => {
  it("validates a pinned synthetic B1 without creating publication or acceptance", () => {
    const raw = bytes(sample());
    expect(preflightC2B1(raw, hash(raw))).toEqual({ state: "B1_VALIDATED_NOT_AUTHORIZED",
      input_sha256: hash(raw), scope_count: 2, operation_count: 2 });
  });
  it("rejects invalid pins, input size, BOM and invalid UTF-8", () => {
    const raw = bytes(sample());
    expect(() => preflightC2B1(raw, "a".repeat(64))).toThrow();
    expect(() => preflightC2B1(raw, "A".repeat(64))).toThrow();
    const large = Buffer.alloc(131_073, 0x20);
    expect(() => preflightC2B1(large, hash(large))).toThrow();
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), raw]);
    expect(() => preflightC2B1(bom, hash(bom))).toThrow();
    const invalid = Buffer.from([0xff]);
    expect(() => preflightC2B1(invalid, hash(invalid))).toThrow();
  });
  it("rejects duplicate keys including escaped aliases before schema evaluation", () => {
    const raw = JSON.stringify(sample()).replace('"expected_version":0',
      '"expected_version":0,"expected_\\u0076ersion":0');
    const input = Buffer.from(raw);
    expect(() => preflightC2B1(input, hash(input))).toThrow();
    const nested = Buffer.from(JSON.stringify(sample()).replace('"environment":"paper"',
      '"environment":"paper","environment":"paper"'));
    expect(() => preflightC2B1(nested, hash(nested))).toThrow();
  });
  it("rejects modified principal, environment, operations, field and duplicates", () => {
    const wrongUser = sample(); wrongUser.head.user_id = "00000000-0000-0000-0000-000000000000"; fail(wrongUser);
    const live = sample(); live.acceptance.document.scopes[0]!.environment = "live"; fail(live);
    const command = sample(); command.acceptance.document.operations.push("COMMAND"); fail(command);
    const dupe = sample(); dupe.acceptance.document.operations.push("READ"); fail(dupe);
    const scopeDupe = sample(); scopeDupe.acceptance.document.scopes.push(scopeDupe.acceptance.document.scopes[0]!); fail(scopeDupe);
    const field = sample(); field.acceptance.document.fields.push("secret"); fail(field);
  });
  it("rejects metadata and grant semantics outside the known shape", () => {
    const widened = sample(); widened.portal_fills.push("head.extra"); fail(widened);
    const extra = { ...sample(), unexpected: true }; fail(extra);
    const rule = sample(); rule.rules.copy_verbatim.pop(); fail(rule);
    const malformed = Buffer.from(JSON.stringify(sample()).replace('"expected_version":0', '"expected_version":0.0'));
    expect(() => preflightC2B1(malformed, hash(malformed))).toThrow();
  });
  it("rejects duplicate prototype keys, malformed surrogates and excessive nesting", () => {
    for (const source of [
      '{"__proto__":{},"__proto__":{}}',
      JSON.stringify(sample()).replace('"synthetic-root"', '"\\ud800"'),
      '['.repeat(20) + '0' + ']'.repeat(20),
    ]) {
      const raw = Buffer.from(source);
      expect(() => preflightC2B1(raw, hash(raw))).toThrow("C2_B1_INVALID");
    }
  });
  it("enforces an independent digest for changes even when new B1 shape is valid", () => {
    const original = bytes(sample());
    const modified = sample(); modified.acceptance.document.operations = ["READ"];
    expect(() => preflightC2B1(bytes(modified), hash(original))).toThrow();
    // A valid shape and newly supplied pin are still not an approval or publication.
    expect(check(modified).state).toBe("B1_VALIDATED_NOT_AUTHORIZED");
  });
  const actualB1 = process.env.C2_B1_PREFLIGHT_TEST_FILE;
  it.skipIf(!actualB1)("validates the separately supplied public B1 without signing", () => {
    const raw = readFileSync(actualB1!);
    const independentPin = process.env.C2_B1_PREFLIGHT_TEST_SHA256;
    expect(independentPin).toMatch(/^[a-f0-9]{64}$/);
    expect(preflightC2B1(raw, independentPin!).state).toBe("B1_VALIDATED_NOT_AUTHORIZED");
  });
});
