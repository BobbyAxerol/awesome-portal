/** Canonical TEST_ONLY retained metadata examples, not source commissioning. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8"));
const schema = read("schemas/execution-retained-operation-page.v1.schema.json");
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const fixture = () => read("fixtures/execution-account-policy-metadata.synthetic.valid.json");

describe("ELP2-04 account policy finite retained metadata", () => {
  it("publishes a canonical synthetic five-field example through the existing DTO", () => {
    const value = fixture();
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    expect(value.source_contract_revision).toBe("TEST_ONLY_SYNTHETIC_NOT_SOURCE_ACCEPTANCE");
    expect(value.records[0].values).toEqual({ account_id: "TEST_ONLY-account", mode: "PAPER",
      venue: "TEST_ONLY_RETAINED_VENUE_NOT_CUSTODY_AUTHORITY", created_at: 0, updated_at: null });
    expect(value).toMatchObject({ state: "PARTIAL", coverage: "AUTHORIZED_ONLY",
      source_health: { as_of_ms: null, completeness: "PARTIAL", freshness: "STALE", replay_eligible: false } });
  });
  it.each(["account_policy_id", "maker_fee_bps", "default_leverage", "allow_borrowing", "loan_package_id",
    "maintenance_margin_rate", "external_account_ref", "raw_secret_token"])("refuses private/economic field %s", field => {
    const value = fixture(); value.records[0].values[field] = "MUST_NOT_PUBLISH";
    expect(validate(value)).toBe(false);
  });
  it("keeps null and omitted source metadata separate from default/zero", () => {
    const value = fixture(); value.records[0].values = {};
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    value.records[0].values = { mode: null, venue: null, created_at: null, updated_at: null };
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    const legacy = fixture(); delete legacy.visibility; delete legacy.coverage; delete legacy.read_scope;
    legacy.reason_code = "UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE";
    expect(validate(legacy), JSON.stringify(validate.errors)).toBe(true);
    legacy.records[0].values.account_policy_id = "PRIVATE"; expect(validate(legacy)).toBe(false);
  });
  it.each(["paper", "PAPER", "Sandbox", "LIVE"])("preserves source mode case %s", mode => {
    const value = fixture(); value.records[0].values.mode = mode;
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });
  it.each(["future", " paper", "paper\n", 1, true, {}, []])("rejects malformed mode %j", mode => {
    const value = fixture(); value.records[0].values.mode = mode; expect(validate(value)).toBe(false);
  });
  it.each(["created_at", "updated_at"])("requires UTC-ms or null for %s", field => {
    for (const invalid of ["2026-10-17T00:00:00Z", "0", 1.5, true, {}, []]) {
      const value = fixture(); value.records[0].values[field] = invalid; expect(validate(value)).toBe(false);
    }
  });
  it("does not narrow unrelated retained aliases or add routes", () => {
    const old = read("fixtures/execution-retained-operation-page.valid.json");
    expect(validate(old), JSON.stringify(validate.errors)).toBe(true);
    const document = read("openapi/execution-retained-review.openapi.json");
    const branches = schema.allOf.filter((branch: any) =>
      branch.if?.properties?.logical_operation_id?.const === "managerAccountPoliciesPageV1");
    expect(branches).toHaveLength(1);
    expect(document.components.schemas.AccountPolicyMetadataValues).toEqual(branches[0].then.properties.records.items.properties.values);
    expect(Object.keys(document.paths)).toEqual(["/api/v1/execution/retained-review",
      "/api/v1/execution/profiles/{environment}/realtime-snapshot", "/api/v1/execution/manager/current/{operation_id}"]);
    const generated = readFileSync(join(root, "generated/execution-retained-review.d.ts"), "utf8");
    expect(generated).toContain("AccountPolicyMetadataValues:");
    expect(schema).not.toHaveProperty("$defs");
    const operationType = generated.split('        "execution-retained-operation-page.v1.schema": ')[1]?.split("\n    };")[0];
    expect(operationType).toBeDefined();
    expect(operationType).not.toContain("$defs:");
  });
});
