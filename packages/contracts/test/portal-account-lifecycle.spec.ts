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

describe("BE-P23 owner roster keyset page", () => {
  const rosterPage = load("fixtures/portal-account-lifecycle.roster-page.synthetic.valid.json");
  const operation = spec.paths["/api/admin/accounts"].get;
  const resolve$ = (ref: string) => ref.split("/").slice(1).reduce((node: any, key: string) => node[key], spec);
  const response = operation.responses["200"].content["application/json"].schema;
  const body = resolve$(response.$ref);
  const schemaFor = (name: string) => ajv.compile(spec.components.schemas[name]);

  it("publishes the five optional query parameters with the bounded limit", () => {
    const params = Object.fromEntries(operation.parameters.map((p: any) => [p.name, p]));
    expect(Object.keys(params).sort()).toEqual(["cursor", "limit", "q", "role", "state"]);
    expect(Object.values(params).every((p: any) => p.in === "query" && p.required === false)).toBe(true);
    expect(params.limit.schema).toEqual({ type: "integer", minimum: 1, maximum: 200, default: 50 });
    expect(params.role.schema.enum).toEqual(["ADMIN", "USER"]);
    expect(params.state.schema.enum).toEqual(["INVITED", "ACTIVE", "DISABLED", "ARCHIVED"]);
  });

  it("adds page and counts without changing the old required keys, so the unpaged shape still validates", () => {
    expect(response).toEqual({ $ref: "#/components/schemas/AccountRoster" });
    expect(body.required).toEqual(["schema_version", "accounts"]);
    expect(body.properties.page).toEqual({ $ref: "#/components/schemas/RosterPage" });
    expect(body.properties.counts).toEqual({ $ref: "#/components/schemas/RosterCounts" });
    expect(resolve$("#/components/schemas/RosterPage").additionalProperties).toBe(false);
    expect(resolve$("#/components/schemas/RosterCounts").additionalProperties).toBe(false);
    for (const code of ["400", "409"])
      expect(operation.responses[code].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Error" });
  });

  it("the synthetic page validates against its page and counts schemas and states its own invariants", () => {
    const page = schemaFor("RosterPage");
    const counts = schemaFor("RosterCounts");
    const account = schemaFor("AccountSummary");
    expect(page(rosterPage.page), ajv.errorsText(page.errors)).toBe(true);
    expect(counts(rosterPage.counts), ajv.errorsText(counts.errors)).toBe(true);
    for (const row of rosterPage.accounts) expect(account(row), ajv.errorsText(account.errors)).toBe(true);
    expect(rosterPage.page.returned_count).toBe(rosterPage.accounts.length);
    expect(rosterPage.page.returned_count).toBeLessThanOrEqual(rosterPage.page.limit);
    expect(rosterPage.page.has_more).toBe(rosterPage.page.next_cursor !== null);
    const states = Object.values(rosterPage.counts.by_state) as number[];
    const roles = Object.values(rosterPage.counts.by_role) as number[];
    expect(states.reduce((a, b) => a + b, 0)).toBe(rosterPage.counts.total);
    expect(roles.reduce((a, b) => a + b, 0)).toBe(rosterPage.counts.total);
    expect(JSON.stringify(rosterPage)).not.toMatch(/password_hash|activation_token|csrf_secret|session_token|cloudflare|email/i);
  });

  it("refuses a page that is unbounded, open, or carries an extra key", () => {
    const page = schemaFor("RosterPage");
    const counts = schemaFor("RosterCounts");
    for (const bad of [
      { ...rosterPage.page, limit: 201 }, { ...rosterPage.page, limit: 0 }, { ...rosterPage.page, returned_count: 201 },
      { ...rosterPage.page, next_cursor: "" }, { ...rosterPage.page, extra: 1 }, { ...rosterPage.page, has_more: "yes" },
      { limit: 2, returned_count: 2, has_more: false },
    ]) expect(page(bad), JSON.stringify(bad)).toBe(false);
    expect(page({ ...rosterPage.page, has_more: false, next_cursor: null })).toBe(true);
    for (const bad of [
      { ...rosterPage.counts, total: -1 }, { ...rosterPage.counts, extra: 1 }, { ...rosterPage.counts, by_role: { ADMIN: 1 } },
      { ...rosterPage.counts, by_state: { ...rosterPage.counts.by_state, GONE: 1 } },
    ]) expect(counts(bad), JSON.stringify(bad)).toBe(false);
  });
});

describe("DR-30 owner execution grants contract", () => {
  const grantOps = [
    ["/api/admin/execution-grants", "get", "listExecutionDefaultGrants"],
    ["/api/admin/execution-grants", "post", "grantExecutionDefault"],
    ["/api/admin/execution-grants/{username}/renew", "post", "renewExecutionDefaultGrant"],
    ["/api/admin/execution-grants/{username}", "delete", "revokeExecutionDefaultGrant"],
  ] as const;
  it("publishes exactly the four operations; every mutation needs an idempotency key and fails with the shared Error", () => {
    for (const [path, method, id] of grantOps) {
      const op = spec.paths[path][method];
      expect(op.operationId).toBe(id);
      if (method !== "get") expect(op.parameters.some((p: { name: string; required: boolean }) => p.name === "x-portal-idempotency-key" && p.required)).toBe(true);
      expect(op.responses["404"].content["application/json"].schema.$ref).toBe("#/components/schemas/Error");
    }
    expect(Object.keys(spec.paths).filter((p) => p.startsWith("/api/admin/execution-grants")).length).toBe(3);
  });
  it("environments are explicit and closed, the term is at most 365 days, unknown fields are refused, a grant is read-only", () => {
    const schemas = spec.components.schemas;
    const req = ajv.compile(schemas.ExecutionDefaultGrantRequest);
    expect(req({ username: "stan", environments: ["paper", "live"], term_days: 365 })).toBe(true);
    for (const bad of [{ username: "stan" }, { username: "stan", environments: [] }, { username: "stan", environments: ["prod"] },
      { username: "stan", environments: ["paper"], term_days: 366 }, { username: "stan", environments: ["paper"], term_days: 0 },
      { username: "stan", environments: ["paper"], extra: true }, { username: "bad name", environments: ["paper"] }]) expect(req(bad), JSON.stringify(bad)).toBe(false);
    const change = ajv.compile(schemas.ExecutionDefaultGrantChange);
    const ok = { schema_version: "portal.execution-default-grant-change.v1", record_authority: "PORTAL_CONTROL", outcome: "REVOKED", workspace_id: "ws", user_id: "u", environments: ["paper"], scope: "DEFAULT_EXECUTION_READ_ONLY", writes: false, membership_changes: 0 };
    expect(change(ok)).toBe(true);
    expect(change({ ...ok, writes: true })).toBe(false);
    expect(change({ ...ok, membership_changes: 1 })).toBe(false);
  });
});
