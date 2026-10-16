/** Synthetic public refusal examples, not source/PM commissioning receipts. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import type { components, operations } from "../generated/portal-account-lifecycle";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const spec = load("openapi/portal-account-lifecycle.openapi.json");
const pending = load("fixtures/portal-account-lifecycle.current-human-pending.synthetic.valid.json");
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const error = ajv.compile(spec.components.schemas.Error);

const coordinatedWrites = [
  ["/api/admin/accounts", "post", "createInvitedAccount"],
  ["/api/admin/accounts/{user_id}", "patch", "updateAccountProfile"],
  ["/api/admin/accounts/{user_id}/activation", "post", "issueActivation"],
  ["/api/admin/accounts/{user_id}/revoke-sessions", "post", "revokeAccountSessions"],
  ["/api/admin/accounts/{user_id}/disable", "post", "disableAccount"],
  ["/api/admin/accounts/{user_id}/enable", "post", "enableAccount"],
  ["/api/admin/accounts/{user_id}/archive", "post", "archiveAccount"],
  ["/api/admin/profile-access", "post", "grantCapability"],
  ["/api/admin/profile-access/{grant_id}", "delete", "revokeCapability"],
] as const;

type CoordinatedOperationId = typeof coordinatedWrites[number][2];
// This intentionally requires regeneration before typecheck: every coordinated
// operation must expose the actual 503 envelope to generated-client consumers.
type CoordinatedUnavailable = operations[CoordinatedOperationId]["responses"][503]["content"]["application/json"];
const typedUnavailable: CoordinatedUnavailable = {
  error: { code: "CURRENT_HUMAN_MUTATION_PENDING",
    message: "The access change is not confirmed. Retry the same request and idempotency key." },
  request_id: "TEST_ONLY-current-human-pending",
};
const typedError: components["schemas"]["Error"] = typedUnavailable;

describe("ELP2-10 account/grant coordinated refusal descriptor", () => {
  it.each(coordinatedWrites)("publishes 503 without changing the existing 409 on %s %s", (path, method, operationId) => {
    const operation = spec.paths[path][method];
    expect(operation.operationId).toBe(operationId);
    expect(operation.responses["503"].content["application/json"].schema)
      .toEqual({ $ref: "#/components/schemas/Error" });
    expect(operation.responses["409"].content["application/json"].schema)
      .toEqual({ $ref: "#/components/schemas/Error" });
  });

  it("scopes coordinator 503 to all nine actual writers, not unrelated reads or owner step-up", () => {
    const delivered = Object.values(spec.paths as Record<string, Record<string, any>>)
      .flatMap(path => Object.values(path))
      .filter(operation => operation.responses?.["503"])
      .map(operation => operation.operationId).sort();
    expect(delivered).toEqual(coordinatedWrites.map(([, , id]) => id).sort());
    expect(spec.paths["/api/admin/step-up"].post.operationId).toBe("grantStepUp");
    expect(spec.paths["/api/admin/step-up"].post.responses["503"]).toBeUndefined();
  });

  it("the safe synthetic pending/UNKNOWN envelope never asserts a completed mutation", () => {
    expect(pending).toEqual(typedError);
    expect(error(pending), ajv.errorsText(error.errors)).toBe(true);
    const unknown = { ...pending, error: { ...pending.error, code: "CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN" } };
    expect(error(unknown), ajv.errorsText(error.errors)).toBe(true);
    expect(Object.keys(pending).sort()).toEqual(["error", "request_id"]);
    expect(Object.keys(pending.error).sort()).toEqual(["code", "message"]);
    expect(JSON.stringify(pending)).not.toMatch(/activation_token|password_hash|csrf_secret|session_token|source_receipt|"outcome"|"applied"/);
  });

  it("requires error/code/message while publishing optional top-level request_id", () => {
    expect(spec.components.schemas.Error.required).toContain("error");
    expect(spec.components.schemas.Error.properties.error.required).toEqual(["code", "message"]);
    expect(spec.components.schemas.Error.required).not.toContain("request_id");
    expect(error({ error: pending.error })).toBe(true);
    for (const malformed of [{}, { request_id: "TEST_ONLY" }, { error: null },
      { error: { message: "Not confirmed." } }, { error: { code: pending.error.code } },
      { ...pending, request_id: 12 }, { error: { ...pending.error, code: 12 } },
      { error: { ...pending.error, message: null } }])
      expect(error(malformed), JSON.stringify(malformed)).toBe(false);
  });

  it("retains historical nested correlation compatibility without treating it as the actual wire location", () => {
    expect(spec.components.schemas.Error.properties.error.properties.request_id.deprecated).toBe(true);
    expect(error({ error: { ...pending.error, request_id: "TEST_ONLY-historical-nested" } })).toBe(true);
    expect(error({ ...pending, error: { ...pending.error, request_id: "TEST_ONLY-historical-nested" } })).toBe(true);
  });
});
