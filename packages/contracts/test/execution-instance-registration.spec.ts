// Shared generated-contract fixtures; never installed-source acceptance.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { instanceRegistrationIntent, instanceRegistrationPreview, instanceRegistrationStatus }
  from "../../../apps/control-api/src/execution-v2/instance-registration.contract";

const root = resolve(__dirname, ".."), load = (name: string) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const api = load("openapi/execution-instance-registration.openapi.json");
const fixture = load("fixtures/execution-instance-registration.synthetic.valid.json");
const ajv = new Ajv2020({ strict: false });
const compile = (name: string) => ajv.compile({ $ref: "#/components/schemas/" + name,
  components: { schemas: api.components.schemas } });
describe("ELP2-07 separate registration family contract", () => {
  it("publishes four guarded named operations, no generic command proxy", () => {
    expect(api.components.securitySchemes.PortalSession).toEqual({ type: "apiKey", in: "cookie", name: "__Host-portal_session" });
    expect(Object.keys(api.paths)).toHaveLength(4);
    const operations = Object.values(api.paths).flatMap(path => Object.values(path as Record<string, any>));
    expect(operations.map((op: any) => op.operationId).sort()).toEqual([
      "Preview", "Submit", "Status", "Reconcile",
    ].map(suffix => "executionInstanceRegistration" + suffix + "V1").sort());
    for (const operation of operations as any[]) {
      expect(operation.security).toEqual([{ PortalSession: [] }]);
      for (const status of [200, 400, 401, 403, 404, 409, 503])
        expect(operation.responses[status].headers["Cache-Control"].schema.const).toBe("private, no-store");
      expect(operation.responses[502]).toBeUndefined(); // unverified source receipt is the served fixed503
    }
    expect(api.paths["/api/v1/execution/instance-registrations/{id}"].get.requestBody).toBeUndefined();
    expect(api.paths["/api/v1/execution/instance-registrations/{id}"].post).toBeUndefined();
  });
  it.each([
    ["InstanceRegistrationIntent", "intent", instanceRegistrationIntent],
    ["InstanceRegistrationPreview", "preview_blocked", instanceRegistrationPreview],
    ["InstanceRegistrationStatus", "unknown", instanceRegistrationStatus],
    ["InstanceRegistrationStatus", "registry_applied", instanceRegistrationStatus],
  ] as const)("%s/%s is strict fixture/runtime parity, not product authority", (name, key, schema) => {
    const validate = compile(name);
    expect(validate(fixture[key]), JSON.stringify(validate.errors)).toBe(true);
    expect(schema.safeParse(fixture[key]).success).toBe(true);
    expect(validate({ ...fixture[key], workload_ref: "forbidden" })).toBe(false);
    expect(schema.safeParse({ ...fixture[key], workload_ref: "forbidden" }).success).toBe(false);
    expect(fixture.runtime_qualified).toBe(false);
  });
  it("keeps independent Portal opaque policy and PM exact counter CAS", () => {
    const validate = compile("InstanceRegistrationIntent"), intent = fixture.intent;
    expect(intent.expected_policy_revision).toBe("TEST_ONLY:portal-policy");
    expect(intent.business_payload.expected_policy_revision).toBe("9007199254740993");
    for (const bad of [1, "01", "-1", "9223372036854775808", "9223372036854775807\n"]){
      expect(instanceRegistrationIntent.safeParse({ ...intent,
        business_payload: { ...intent.business_payload, expected_policy_revision: bad } }).success).toBe(false);
      expect(validate({ ...intent, business_payload: { ...intent.business_payload, expected_policy_revision: bad } })).toBe(false);
    }
    expect(validate({ ...intent, business_payload: { ...intent.business_payload, expected_policy_revision: "9223372036854775807" } })).toBe(true);
    expect(validate({ ...intent, business_payload: { ...intent.business_payload, expected_version: "1" } })).toBe(false);
    for (const forbidden of ["actor_id", "target_ref", "source_url", "human_context"])
      expect(validate({ ...intent, business_payload: { ...intent.business_payload, [forbidden]: "forbidden" } })).toBe(false);
    expect(instanceRegistrationIntent.safeParse({ ...intent, resource: { kind: "DEPLOYMENT", id: "spoof" } }).success).toBe(false);
  });
  it("never fabricates canonical account/deployment, funding or activation from registry APPLIED", () => {
    const value = fixture.registry_applied, validate = compile("InstanceRegistrationStatus");
    expect(value.business.receipt.key).not.toBe(fixture.intent.business_payload.idempotency_key);
    expect(value.canonical_identity).toEqual({ availability: "NOT_PUBLISHED",
      reason_code: "SOURCE_CANONICAL_ACCOUNT_DEPLOYMENT_PAIR_NOT_PUBLISHED", account_id: null, deployment_id: null });
    for (const extra of [{ funded: true }, { active: true }, { business: { ...value.business, amount: "0" } },
      { canonical_identity: { ...value.canonical_identity, account_id: value.business.source_instance_ref } }])
      expect(validate({ ...value, ...extra })).toBe(false);
    expect(instanceRegistrationStatus.safeParse({ ...value, business: { ...value.business, receipt: null } }).success).toBe(false);
    expect(validate({ ...value, business: { ...value.business, receipt: null } })).toBe(false);
    expect(instanceRegistrationStatus.safeParse({ ...fixture.unknown,
      business: { ...fixture.unknown.business, business_applied: false } }).success).toBe(false);
    expect(instanceRegistrationStatus.safeParse({ ...value, delivery: "SENDING" }).success).toBe(false);
    expect(instanceRegistrationStatus.safeParse({ ...value, updated_at_ms: value.created_at_ms - 1 }).success).toBe(false);
  });
  it("denied preview has typed reason and no reserved or usable send context", () => {
    const value = fixture.preview_blocked;
    for (const extra of [{ reason_code: null }, { preview_digest: "sha256:" + "a".repeat(64) },
      { profile_ref: "invented" }, { reserved: true }, { business_applied: true }])
      expect(instanceRegistrationPreview.safeParse({ ...value, ...extra }).success).toBe(false);
    const validate = compile("InstanceRegistrationPreview");
    expect(validate({ ...value, reason_code: null })).toBe(false);
    expect(validate({ ...value, profile_ref: "invented" })).toBe(false);
  });
  it("does not widen the financial capital operations union", () => {
    const capital = load("openapi/execution-trusted-commands.openapi.json");
    expect(capital.components.schemas.CommandStatus.properties.operation.enum).not.toContain("REGISTER_INSTANCE");
    expect(api.components.schemas.InstanceRegistrationStatus.properties.family.const).toBe("INSTANCE_REGISTRATION");
  });
});
