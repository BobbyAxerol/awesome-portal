/** ELP2-03 canonical contract tests. All fixtures are TEST_ONLY, not TS/runtime acceptance. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { ACCESS_ACTIONS, accessAction, accessPreview, accessProposal, accessRevoke,
  grantChange, resourceSelector } from "../../../apps/control-api/src/execution-v2/access.contract";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const spec = load("openapi/execution-access.openapi.json");
const fixtures = load("fixtures/execution-access.synthetic.valid.json");
// OpenAPI 3.1 schemas use draft-2020-12; discriminator/writeOnly are annotations.
// Normalize only local component references, not arbitrary strings or payloads.
const schemas = JSON.parse(JSON.stringify(spec.components.schemas)
  .replaceAll("#/components/schemas/", "#/$defs/"));
const schemaId = "https://test-only.invalid/contracts/execution-access.v1";
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: schemaId, $defs: schemas });
function validates(name: string, value: unknown): boolean {
  const validate = ajv.getSchema(`${schemaId}#/$defs/${name}`);
  if (!validate) throw new Error(`Unknown execution-access fixture schema: ${name}`);
  return Boolean(validate(value));
}
function fixture(name: string) {
  const entry = fixtures.cases.find((item: { type: string }) => item.type === name);
  if (!entry) throw new Error(`Missing TEST_ONLY execution-access fixture: ${name}`);
  return structuredClone(entry.value);
}
const previewRequest = () => fixture("AccessPreviewRequest");
const change = () => previewRequest().change;
const digest = `sha256:${"0".repeat(64)}`;
const proposalRequest = () => ({ ...previewRequest(), preview_digest: digest });
const revokeRequest = () => ({ workspace_id: "ws_TEST_ONLY", expected_policy_revision: "p1_TEST_ONLY",
  expected_grant_revision: "r1_TEST_ONLY", reason: "TEST_ONLY synthetic revoke" });
const prefix = "/api/admin/profile-access/v2";
const routes = [
  { path: `${prefix}/effective`, method: "get", operation: "portalScopedAccessEffectiveGetV1", output: "AccessEffective", status: "200" },
  { path: `${prefix}/preview`, method: "post", operation: "portalScopedAccessPreviewPostV1", input: "AccessPreviewRequest", output: "AccessPreview", status: "200" },
  { path: `${prefix}/proposals`, method: "post", operation: "portalScopedAccessProposalPostV1", input: "AccessProposalRequest", output: "AccessResult", status: "201" },
  { path: `${prefix}/proposals/{id}`, method: "get", operation: "portalScopedAccessProposalGetV1", output: "AccessProposal", status: "200" },
  { path: `${prefix}/grants/{id}/revoke`, method: "post", operation: "portalScopedAccessRevokePostV1", input: "AccessRevokeRequest", output: "AccessResult", status: "200" },
  { path: `${prefix}/grants/{id}/preview-revoke`, method: "post", operation: "portalScopedAccessRevokePreviewPostV1", input: "AccessRevokeRequest", output: "AccessRevokePreview", status: "200" },
  { path: `${prefix}/step-up`, method: "post", operation: "portalScopedAccessStepUpPostV1", input: "AccessStepUpRequest", output: "AccessStepUp", status: "200" },
  { path: `${prefix}/audit`, method: "get", operation: "portalScopedAccessAuditGetV1", output: "AccessAudit", status: "200" },
] as const;

describe("ELP2-03 canonical TEST_ONLY access fixtures", () => {
  it.each(fixtures.cases)("valid canonical $type fixture — never a producer receipt", (entry: { type: string; value: unknown }) => {
    expect(fixtures.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    const valid = validates(entry.type, entry.value);
    const errors = ajv.getSchema(`${schemaId}#/$defs/${entry.type}`)!.errors;
    expect(valid, `${entry.type}: ${ajv.errorsText(errors)}`).toBe(true);
  });

  it("covers pending policy, pending researcher disclosure and every immutable operation outcome", () => {
    expect(new Set(fixtures.cases.map((entry: { type: string }) => entry.type)))
      .toEqual(new Set(["AccessEffective", "AccessPreviewRequest", "AccessPreview", "AccessRevokePreview", "AccessReceipt"]));
    const effective = fixture("AccessEffective");
    expect(effective).toMatchObject({ availability: "POLICY_PENDING", policy_revision: null, grants: [],
      researcher_field_policy: { state: "PENDING", policy_ref: null },
      owner_recovery: { enabled: false, reason_code: "OWNER_RECOVERY_NOT_APPROVED" } });
    expect(fixture("AccessPreview")).toMatchObject({ allowed: false, reason_code: "RESEARCHER_FIELD_POLICY_PENDING",
      app_outcome: "DENIED", ts_authority: "PENDING", effective_business_right: false });
    const outcomes = fixtures.cases.filter((entry: { type: string }) => entry.type === "AccessReceipt")
      .map((entry: { value: { outcome: string } }) => entry.value.outcome);
    expect(outcomes.sort()).toEqual(["APP_APPLIED", "TS_PENDING", "TS_APPLIED", "TS_REJECTED", "TS_UNKNOWN", "REVOKED", "DENIED"].sort());
  });

  it("publishes distinct app, TS pending, accepted, rejected and unknown authority on effective grants", () => {
    const sample = fixture("AccessEffective");
    const source = change();
    const row = { grant_id: "grant_TEST_ONLY", action: source.action, effect: source.effect, selector: source.selector,
      environments: source.environments, valid_from_ms: source.valid_from_ms, valid_until_ms: source.valid_until_ms,
      revision: "r1_TEST_ONLY", current: false, ts_authority: "PENDING" };
    for (const ts_authority of ["NOT_REQUIRED", "PENDING", "ACCEPTED", "REJECTED", "UNKNOWN"])
      expect(validates("AccessEffective", { ...sample, grants: [{ ...row, ts_authority }] }), ts_authority).toBe(true);
    for (const ts_authority of ["APPLIED", "ACK", "TS_PENDING", "VERIFIED"])
      expect(validates("AccessEffective", { ...sample, grants: [{ ...row, ts_authority }] }), ts_authority).toBe(false);
    expect(validates("AccessEffective", { ...sample, owner_recovery: { enabled: true, reason_code: "OWNER_RECOVERY_NOT_APPROVED" } })).toBe(false);
  });

  it("preview never asserts that a business right is effective or TS acceptance has occurred", () => {
    const preview = fixture("AccessPreview");
    expect(validates("AccessPreview", { ...preview, allowed: true, reason_code: null, app_outcome: "ELIGIBLE" })).toBe(true);
    expect(validates("AccessPreview", { ...preview, effective_business_right: true })).toBe(false);
    for (const ts_authority of ["ACCEPTED", "REJECTED", "UNKNOWN", "ACK"])
      expect(validates("AccessPreview", { ...preview, ts_authority })).toBe(false);
  });

  it("revoke preview distinguishes ALLOW/DENY and withdraws a grant without promising the effective access outcome",()=>{
    const cases=fixtures.cases.filter((entry:{type:string})=>entry.type==="AccessRevokePreview");
    expect(cases.map((entry:{value:{before:{effect:string}}})=>entry.value.before.effect)).toEqual(["ALLOW","DENY"]);
    for(const {value} of cases){
      expect(value.after).toMatchObject({grant_state:"REVOKED_ON_COMMIT",effective_access:"CURRENT_POLICY_REEVALUATED"});
      expect(validates("AccessRevokePreview",{...value,after:{...value.after,app_access:"WITHDRAWN_ON_COMMIT"}})).toBe(false);
    }
  });

  it("replayed operations preserve the original typed receipt/status rather than invent a replay outcome", () => {
    const original = fixtures.cases.find((entry: { type: string; value: { outcome: string } }) =>
      entry.type === "AccessReceipt" && entry.value.outcome === "DENIED").value;
    const result = { schema_version: "portal.access-result.v1", receipt: original, replayed: true };
    expect(original.http_status).toBe(409);
    expect(validates("AccessResult", result)).toBe(true);
    expect(validates("AccessResult", { ...result, receipt: { ...original, outcome: "REPLAYED" } })).toBe(false);
    expect(validates("AccessResult", { ...result, receipt: { ...original, http_status: "409" } })).toBe(false);
    expect(validates("AccessResult", { ...result, original_receipt: original })).toBe(false);
  });
});

describe("ELP2-03 finite vocabulary and server/schema structural parity", () => {
  it("has exactly the same finite action vocabulary as the server, including unchanged legacy actions", () => {
    const actions: string[] = spec.components.schemas.AccessAction.enum;
    expect(actions).toEqual([...ACCESS_ACTIONS]);
    expect(new Set(actions).size).toBe(actions.length);
    for (const action of ACCESS_ACTIONS) {
      expect(validates("AccessAction", action), action).toBe(true);
      expect(accessAction.safeParse(action).success, action).toBe(true);
    }
    for (const action of ["*", "capital.*", "maintenance.*", "ADMIN", "secrets.read", "portfolio.read_full", "access.install"]) {
      expect(validates("AccessAction", action), action).toBe(false);
      expect(accessAction.safeParse(action).success, action).toBe(false);
    }
  });

  it("valid fixture browser requests parse on the server as well as in the canonical schemas", () => {
    expect(accessPreview.safeParse(previewRequest()).success).toBe(true);
    expect(accessProposal.safeParse(proposalRequest()).success).toBe(true);
    expect(accessRevoke.safeParse(revokeRequest()).success).toBe(true);
    expect(validates("AccessPreviewRequest", previewRequest())).toBe(true);
    expect(validates("AccessProposalRequest", proposalRequest())).toBe(true);
    expect(validates("AccessRevokeRequest", revokeRequest())).toBe(true);
  });

  it("all intent fields remain required, including explicit nullable revision and interval fields", () => {
    const source = change();
    for (const key of Object.keys(source)) {
      const missing = Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));
      expect(validates("AccessChange", missing), key).toBe(false);
      expect(grantChange.safeParse(missing).success, key).toBe(false);
    }
    for (const body of [{ workspace_id: "ws_TEST_ONLY" }, { change: source }, {}]) {
      expect(validates("AccessPreviewRequest", body)).toBe(false);
      expect(accessPreview.safeParse(body).success).toBe(false);
    }
  });

  it("supports only the four typed finite selector forms, not prefixes or arbitrary relations", () => {
    const selectors = [
      { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: ["portfolio_TEST_ONLY"] },
      { kind: "OWN_ALPHA" },
      { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: ["portfolio_TEST_ONLY"] },
      { kind: "ROOT_SCOPE", root_id: "root_TEST_ONLY" },
    ];
    for (const selector of selectors) {
      expect(validates("AccessSelector", selector)).toBe(true);
      expect(resourceSelector.safeParse(selector).success).toBe(true);
    }
    for (const selector of [{ kind: "ALL" }, { kind: "*" }, { ...selectors[0], resource_kind: "PORTFOLIOS" }, { ...selectors[0], prefix: "portfolio" },
      { kind: "OWN_ALPHA", owner_user_id: "usr_TEST_ONLY" }, { ...selectors[2], membership: "ACCEPTED" },
      { ...selectors[3], resources: ["portfolio_TEST_ONLY"] }, { ...selectors[0], sql: "TEST_ONLY SQL" }]) {
      expect(validates("AccessSelector", selector)).toBe(false);
      expect(resourceSelector.safeParse(selector).success).toBe(false);
    }
  });

  it("resource and environment sets reject duplicates, empty sets and unbounded ID lists", () => {
    const source = change();
    for (const selector of [{ ...source.selector, ids: [] }, { ...source.selector, ids: ["same_TEST_ONLY", "same_TEST_ONLY"] },
      { ...source.selector, ids: Array.from({ length: 201 }, (_, index) => `portfolio_TEST_ONLY_${index}`) },
      { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [] },
      { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: ["same_TEST_ONLY", "same_TEST_ONLY"] }]) {
      expect(validates("AccessSelector", selector)).toBe(false);
      expect(resourceSelector.safeParse(selector).success).toBe(false);
    }
    for (const environments of [[], ["paper", "paper"], ["CANARY"], ["ALL"], ["LIVE"]]) {
      const invalid = { ...source, environments };
      expect(validates("AccessChange", invalid)).toBe(false);
      expect(grantChange.safeParse(invalid).success).toBe(false);
    }
  });

  it("only access.grant may carry explicit unique onward actions", () => {
    const source = change();
    const onward = { ...source, action: "access.grant", delegable_actions: ["portfolio.read", "users.read"] };
    expect(validates("AccessChange", onward)).toBe(true);
    expect(grantChange.safeParse(onward).success).toBe(true);
    for (const invalid of [{ ...source, delegable_actions: ["portfolio.read"] },
      { ...onward, delegable_actions: ["portfolio.read", "portfolio.read"] },
      { ...onward, delegable_actions: ["*"] }]) {
      expect(validates("AccessChange", invalid)).toBe(false);
      expect(grantChange.safeParse(invalid).success).toBe(false);
    }
  });

  it("IDs use matching Unicode-codepoint lengths and reject control characters", () => {
    for (const subject_user_id of ["a".repeat(256), "😀".repeat(256), "opaque_TEST_ONLY:/@with space"]) {
      const body = { ...change(), subject_user_id };
      expect(validates("AccessChange", body)).toBe(true);
      expect(grantChange.safeParse(body).success).toBe(true);
    }
    for (const subject_user_id of ["", "a".repeat(257), "😀".repeat(257), "bad\u0000id", "bad\nid", "bad\u007fid"]) {
      const body = { ...change(), subject_user_id };
      expect(validates("AccessChange", body)).toBe(false);
      expect(grantChange.safeParse(body).success).toBe(false);
    }
  });

  it("grant and revoke reasons have the same Unicode-codepoint and control-character boundaries", () => {
    for (const [reason, expected] of [["TEST_ONLY lý do", true], ["a".repeat(512), true], ["😀".repeat(512), true],
      ["", false], ["a".repeat(513), false], ["😀".repeat(513), false], ["bad\nreason", false],
      ["bad\u0000reason", false], ["bad\u007freason", false]] as const) {
      const grant = { ...change(), reason };
      const revoke = { ...revokeRequest(), reason };
      expect(validates("AccessChange", grant), JSON.stringify(reason)).toBe(expected);
      expect(grantChange.safeParse(grant).success, JSON.stringify(reason)).toBe(expected);
      expect(validates("AccessRevokeRequest", revoke), JSON.stringify(reason)).toBe(expected);
      expect(accessRevoke.safeParse(revoke).success, JSON.stringify(reason)).toBe(expected);
    }
  });

  it("primitive timestamp/revision bounds are explicit and reject coerced, unsafe or empty values", () => {
    const source = change();
    for (const valid_from_ms of [0, Number.MAX_SAFE_INTEGER]) {
      const body = { ...source, valid_from_ms, valid_until_ms: null };
      expect(validates("AccessChange", body)).toBe(true);
      expect(grantChange.safeParse(body).success).toBe(true);
    }
    for (const patch of [{ valid_from_ms: -1 }, { valid_from_ms: 0.1 }, { valid_from_ms: "1792094400000" },
      { valid_from_ms: Number.MAX_SAFE_INTEGER + 1 }, { expected_policy_revision: "" },
      { expected_ceiling_revision: "x".repeat(257) }, { expected_ts_membership_revision: 1 }]) {
      const body = { ...source, ...patch };
      expect(validates("AccessChange", body)).toBe(false);
      expect(grantChange.safeParse(body).success).toBe(false);
    }
    for (const key of ["expected_policy_revision", "expected_ceiling_revision", "expected_ts_membership_revision"]) {
      const unicodeBoundary = { ...source, [key]: "😀".repeat(256) };
      expect(validates("AccessChange", unicodeBoundary), key).toBe(true);
      expect(grantChange.safeParse(unicodeBoundary).success, key).toBe(true);
      const beyondBoundary = { ...source, [key]: "😀".repeat(257) };
      expect(validates("AccessChange", beyondBoundary), key).toBe(false);
      expect(grantChange.safeParse(beyondBoundary).success, key).toBe(false);
    }
  });

  it("documents the end-exclusive interval; the server enforces the relative bound beyond JSON Schema primitives", () => {
    const source = change();
    expect(spec.components.schemas.AccessChange.description).toContain("valid_until_ms must be greater than valid_from_ms or null");
    for (const valid_until_ms of [source.valid_from_ms, source.valid_from_ms - 1]) {
      const body = { ...source, valid_until_ms };
      // Standard JSON Schema has no sibling-value comparison; do not mislabel
      // schema shape validation as a transactional/current-policy guarantee.
      expect(validates("AccessChange", body)).toBe(true);
      expect(grantChange.safeParse(body).success).toBe(false);
    }
  });
});

describe("ELP2-03 browser intents have no policy, actor or TS authority input", () => {
  it("preview and proposal envelopes reject all structural actor/role/policy/transport injection", () => {
    for (const key of ["actor", "human_requester_user_id", "principal_id", "role", "session_id", "session_generation",
      "protected_owner_user_id", "policy", "approval_ref", "qualification", "allow_test_only", "verifier", "url", "sql", "jwt", "mtls"]) {
      const preview = { ...previewRequest(), [key]: "TEST_ONLY_SPOOF" };
      const proposal = { ...proposalRequest(), [key]: "TEST_ONLY_SPOOF" };
      expect(validates("AccessPreviewRequest", preview), key).toBe(false);
      expect(accessPreview.safeParse(preview).success, key).toBe(false);
      expect(validates("AccessProposalRequest", proposal), key).toBe(false);
      expect(accessProposal.safeParse(proposal).success, key).toBe(false);
    }
  });

  it("nested changes reject persisted grant state, parent lineage, owner facts and TS acceptance", () => {
    for (const key of ["grant_id", "workspace_id", "issued_by", "parent_grant_id", "revision", "policy_revision",
      "revoked_at_ms", "requires_ts_acceptance", "ts_receipt", "field_policy_ref", "owner_user_id", "preset",
      "membership", "active_principals", "researcher_fields", "source", "trust_profile", "provenance_ref", "outcome"]) {
      const body = { ...change(), [key]: "TEST_ONLY_SPOOF" };
      expect(validates("AccessChange", body), key).toBe(false);
      expect(grantChange.safeParse(body).success, key).toBe(false);
    }
  });

  it("proposal digest is mandatory lowercase SHA-256, not a browser-supplied acceptance receipt", () => {
    for (const preview_digest of [undefined, "sha256:abc", `sha256:${"A".repeat(64)}`, "TEST_ONLY_UNHASHED", 123]) {
      const body = { ...proposalRequest(), preview_digest };
      expect(validates("AccessProposalRequest", body)).toBe(false);
      expect(accessProposal.safeParse(body).success).toBe(false);
    }
    for (const key of ["ts_receipt", "receipt", "ts_authority", "outcome", "membership_revision", "mapping_revision", "verifier"]) {
      const body = { ...proposalRequest(), [key]: "TEST_ONLY_ACCEPTED" };
      expect(validates("AccessProposalRequest", body), key).toBe(false);
      expect(accessProposal.safeParse(body).success, key).toBe(false);
    }
  });

  it("revoke and step-up accept only their exact intents and never policy-install or acceptance fields", () => {
    const stepUp = { workspace_id: "ws_TEST_ONLY", password: "TEST_ONLY_not_a_production_credential" };
    expect(validates("AccessStepUpRequest", stepUp)).toBe(true);
    expect(spec.components.schemas.AccessStepUpRequest.properties.password.writeOnly).toBe(true);
    for (const key of ["actor", "policy", "approval_ref", "owner_user_id", "ts_receipt", "membership_revision", "allow_test_only", "verifier"]) {
      expect(validates("AccessStepUpRequest", { ...stepUp, [key]: "TEST_ONLY_SPOOF" }), key).toBe(false);
      const revoke = { ...revokeRequest(), [key]: "TEST_ONLY_SPOOF" };
      expect(validates("AccessRevokeRequest", revoke), key).toBe(false);
      expect(accessRevoke.safeParse(revoke).success, key).toBe(false);
    }
    expect(validates("AccessStepUp", { schema_version: "portal.access-step-up.v1", state: "ACTIVE", expires_at_ms: 1792094400000 })).toBe(true);
    expect(validates("AccessStepUp", { schema_version: "portal.access-step-up.v1", state: "ACTIVE", expires_at_ms: 1792094400000,
      password: stepUp.password })).toBe(false);
  });
});

describe("ELP2-03 eight named public operations and generated mapping", () => {
  it("publishes exactly eight paths and eight unique operationIds, with no public install/TS receipt route", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths).sort()).toEqual(routes.map(route => route.path).sort());
    const operations = routes.map(route => spec.paths[route.path][route.method].operationId);
    expect(operations).toEqual(routes.map(route => route.operation));
    expect(new Set(operations).size).toBe(8);
    for (const route of routes) expect(Object.keys(spec.paths[route.path])).toEqual([route.method]);
    expect(Object.keys(spec.paths).join("\n")).not.toMatch(/install|bootstrap|acceptance|ts[-_/]?receipt|trust-profile/iu);
    for (const internal of ["ReviewedAccessPolicy", "TsMembershipAcceptance", "AccessPolicyInstallRequest", "AccessReceiptAcceptRequest"])
      expect(spec.components.schemas).not.toHaveProperty(internal);
  });

  it("maps every named request/success/error schema and requires cookie authentication", () => {
    expect(spec.components.securitySchemes.PortalSession)
      .toEqual({ type: "apiKey", in: "cookie", name: "__Host-portal_session" });
    for (const route of routes) {
      const operation = spec.paths[route.path][route.method];
      expect(operation.security).toEqual([{ PortalSession: [] }]);
      expect(operation.responses[route.status].content["application/json"].schema)
        .toEqual({ $ref: `#/components/schemas/${route.output}` });
      if ("input" in route) {
        expect(operation.requestBody.required).toBe(true);
        expect(operation.requestBody.content["application/json"].schema).toEqual({ $ref: `#/components/schemas/${route.input}` });
      } else expect(operation).not.toHaveProperty("requestBody");
      for (const status of ["400", "401", "403", "404", "409", "503"])
        expect(operation.responses[status].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/AccessProblem" });
    }
    expect(validates("AccessProblem", { error: { code: "ACCESS_DENIED", message: "The requested access is not available." }, request_id: "TEST_ONLY_request" })).toBe(true);
  });

  it("every mutation requires existing idempotency/CSRF/Origin headers, with no actor or trust headers", () => {
    for (const route of routes.filter(route => route.method === "post")) {
      const parameters = spec.paths[route.path].post.parameters;
      const headers = parameters.filter((parameter: { in: string }) => parameter.in === "header");
      expect(headers.map((parameter: { name: string }) => parameter.name))
        .toEqual(["x-portal-idempotency-key", "x-portal-csrf", "Origin"]);
      expect(headers.every((parameter: { required: boolean }) => parameter.required)).toBe(true);
      expect(headers[0].schema.pattern).toBe("^[A-Za-z0-9._:-]{8,128}$");
    }
  });

  it("read queries preserve exact workspace/subject IDs and bounded opaque audit pagination", () => {
    for (const route of routes.filter(route => route.method === "get")) {
      const parameters = spec.paths[route.path].get.parameters;
      expect(parameters.find((parameter: { name: string }) => parameter.name === "workspace_id"))
        .toMatchObject({ in: "query", required: true, schema: { type: "string", minLength: 1, maxLength: 256 } });
    }
    const audit = spec.paths[`${prefix}/audit`].get.parameters;
    expect(audit.map((parameter: { name: string }) => parameter.name)).toEqual(["workspace_id", "subject_user_id", "limit", "after"]);
    expect(audit.find((parameter: { name: string }) => parameter.name === "limit").schema)
      .toEqual({ type: "integer", minimum: 1, maximum: 100, default: 25 });
    expect(audit.find((parameter: { name: string }) => parameter.name === "after").schema)
      .toEqual({ type: "string", minLength: 1, maxLength: 2048 });
    expect(spec.components.schemas.AccessAudit.properties.max_items.const).toBe(100);
    expect(spec.components.schemas.AccessAudit.properties.next_cursor.anyOf)
      .toContainEqual({ type: "string", maxLength: 2048 });
  });

  it("keeps canonical source-script outputs, generation command and drift verification connected", () => {
    const generator = readFileSync(resolve(root, "tooling/generate-execution-access.mjs"), "utf8");
    const manifest = load("package.json");
    const verifier = readFileSync(resolve(root, "tooling/verify-generated.sh"), "utf8");
    expect(generator).toContain("openapi/execution-access.openapi.json");
    expect(generator).toContain("fixtures/execution-access.synthetic.valid.json");
    expect(generator).toContain("--check");
    expect(generator).toContain("Generated drift:");
    const command = manifest.scripts["generate:execution-access"];
    expect(command).toContain("node tooling/generate-execution-access.mjs");
    expect(command).toContain("openapi-typescript openapi/execution-access.openapi.json -o generated/execution-access.d.ts");
    expect(manifest.scripts.postgenerate).toContain("generate:execution-access");
    expect(verifier).toContain("node tooling/generate-execution-access.mjs --check");
    expect(verifier).toContain("generate_and_compare openapi/execution-access.openapi.json generated/execution-access.d.ts");
  });

  it("generated declarations expose all eight operationIds, paths and canonical component names", () => {
    const generated = readFileSync(resolve(root, "generated/execution-access.d.ts"), "utf8");
    for (const route of routes) {
      expect(generated).toContain(`"${route.path}"`);
      expect(generated).toContain(`${route.operation}:`);
    }
    for (const name of Object.keys(spec.components.schemas)) expect(generated).toContain(`${name}:`);
  });
});
