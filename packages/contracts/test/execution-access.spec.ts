/** ELP2-03 canonical contract tests. All fixtures are TEST_ONLY, not TS/runtime acceptance. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { ACCESS_ACTIONS, accessAction, accessText, accessPreview, accessProposal, accessRevoke,
  grantChange, resourceSelector } from "../../../apps/control-api/src/execution-v2/access.contract";
import { ROW_ACTIONS, RULES, eligibilityQuery, eligibilityResult, navigationInput, navigationResult,
  scopedText } from "../../../apps/control-api/src/execution-v2/self-eligibility";

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
  { path: prefix + "/eligibility", method: "get", operation: "portalScopedAccessEligibilityGetV1", output: "AccessEligibility", status: "200" },
  { path: prefix + "/self-navigation", method: "get", operation: "portalScopedAccessSelfNavigationGetV1", output: "AccessSelfNavigation", status: "200" },
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
      .toEqual(new Set(["AccessEffective", "AccessPreviewRequest", "AccessPreview", "AccessRevokePreview", "AccessReceipt", "AccessEligibility", "AccessSelfNavigation"]));
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

describe("ELP2-03 eight unchanged legacy operations plus two C3 self reads and generated mapping", () => {
  it("publishes exactly ten paths and ten unique operationIds, with no public install/TS receipt route", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths).sort()).toEqual(routes.map(route => route.path).sort());
    const operations = routes.map(route => spec.paths[route.path][route.method].operationId);
    expect(operations).toEqual(routes.map(route => route.operation));
    expect(new Set(operations).size).toBe(10);
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

  it("generated declarations expose all ten operationIds, paths and canonical component names", () => {
    const generated = readFileSync(resolve(root, "generated/execution-access.d.ts"), "utf8");
    for (const route of routes) {
      expect(generated).toContain(`"${route.path}"`);
      expect(generated).toContain(`${route.operation}:`);
    }
    for (const name of Object.keys(spec.components.schemas)) expect(generated).toContain(`${name}:`);
  });
});


describe("C3 current self projection — canonical TEST_ONLY schemas, never installed authority", () => {
  const pairs = [
    ["AccessEligibility", eligibilityResult],
    ["AccessSelfNavigation", navigationResult],
  ] as const;
  function parity(name: typeof pairs[number][0], value: unknown, expected: boolean) {
    const zod = name === "AccessEligibility" ? eligibilityResult : navigationResult;
    expect(validates(name, value), name + " AJV").toBe(expected);
    expect(zod.safeParse(value).success, name + " Zod").toBe(expected);
  }
  const ownQuery = () => ({ workspace_id: "ws_TEST_ONLY", environment: "paper",
    resource_kind: "PORTFOLIO", resource_id: "portfolio_TEST_ONLY", actions: "portfolio.read,capital.top_up" });
  const featureIds = ["EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_OPERATIONS", "EXECUTION_BLOTTER"];

  it("both positive and absent synthetic output types have canonical examples and exact Zod parity", () => {
    for (const [name, zod] of pairs) {
      const cases = fixtures.cases.filter((entry: { type: string }) => entry.type === name);
      const expected = name === "AccessEligibility"
        ? ["POSITIVE_SHAPE_NOT_INSTALLED_AUTHORITY", "ABSENT_PERMISSION"]
        : ["APP_ONLY_NOT_SOURCE_AUTHORITY", "ABSENT_PERMISSION",
          "ROUTING_LEGACY_COMPATIBILITY_NOT_A_GRANT", "ROUTING_SCOPED_V2_NOT_A_GRANT"];
      expect(cases.map((entry: { case_name: string }) => entry.case_name)).toEqual(expected);
      expect(spec.components.schemas[name].examples).toEqual(cases.map((entry: { value: unknown }) => entry.value));
      for (const entry of cases) {
        expect(fixtures.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
        expect(zod.safeParse(entry.value).success).toBe(true);
        parity(name, entry.value, true);
        parity(name, { ...entry.value, installed_authority: true }, false);
        expect(JSON.stringify(entry.value)).not.toMatch(/manager_domain_grants|catalogue_sha256|profile_sha256|field_policy_sha256/);
      }
    }
    expect(fixtures.cases.filter((entry: { type: string; case_name?: string }) =>
      entry.type === "AccessEligibility").map((entry: { case_name: string }) => entry.case_name))
      .toEqual(["POSITIVE_SHAPE_NOT_INSTALLED_AUTHORITY", "ABSENT_PERMISSION"]);
    const nav = fixture("AccessSelfNavigation");
    expect(nav.features.map((row: { feature: string }) => row.feature)).toEqual(featureIds);
    expect(nav.features.find((row: { feature: string }) => row.feature === "EXECUTION_OPERATIONS"))
      .toMatchObject({ state: "HIDDEN", authority_mode: "NOT_ESTABLISHED" });
    for (const row of nav.features) expect(row).toMatchObject({
      family_check: "NOT_CHECKED", source_readiness: "NOT_CHECKED",
      field_readiness: "NOT_CHECKED", command_readiness: "NOT_CHECKED",
    });
  });

  it("publishes the exact finite row whitelist without widening the existing global action grammar", () => {
    expect(spec.components.schemas.AccessEligibilityAction.enum).toEqual([...ROW_ACTIONS]);
    expect(spec.components.schemas.AccessAction.enum).toEqual([...ACCESS_ACTIONS]);
    const good = fixture("AccessEligibility");
    for (const action of ROW_ACTIONS)
      parity("AccessEligibility", { ...good, actions: [{ ...good.actions[0], action,
        family_check: RULES[action].family, step_up_required: RULES[action].stepUp }] }, true);
    for (const action of ["*", "capital.*", "owner.recovery", "capital.return_capital", "report.export", "execution.accounts.read"])
      parity("AccessEligibility", { ...good, actions: [{ ...good.actions[0], action }] }, false);
    for (const actions of [[], Array.from({ length: 17 }, () => good.actions[0])])
      parity("AccessEligibility", { ...good, actions }, false);
  });

  it("each action publishes exactly its existing family and step-up prerequisite, never a generic family alias", () => {
    const good = fixture("AccessEligibility");
    for (const action of ROW_ACTIONS) {
      const rule = RULES[action];
      const row = { ...good.actions[0], action, family_check: rule.family, step_up_required: rule.stepUp };
      parity("AccessEligibility", { ...good, actions: [row] }, true);
      const otherFamily = rule.family === "BUSINESS_READ_SCOPE" ? "CURRENT_AUDIT_READ" : "BUSINESS_READ_SCOPE";
      parity("AccessEligibility", { ...good, actions: [{ ...row, family_check: otherFamily }] }, false);
      for (const step_up_required of [true, false, null]) if (step_up_required !== rule.stepUp)
        parity("AccessEligibility", { ...good, actions: [{ ...row, step_up_required }] }, false);
    }
  });

  it("rejects repeated output actions even when their advisory rows differ", () => {
    const good = fixture("AccessEligibility");
    const first = good.actions[0];
    const other = { ...first, permission: "UNAVAILABLE", reason_class: "NO_CURRENT_PERMISSION",
      public_copy_key: "NO_CURRENT_PERMISSION", grant_ref: null, authority_mode: "NOT_ESTABLISHED" };
    parity("AccessEligibility", { ...good, actions: [first, first] }, false);
    parity("AccessEligibility", { ...good, actions: [first, other] }, false);
  });

  it("JSON and Zod enforce the complete permission/reason/copy/grant/mode truth table", () => {
    const good = fixture("AccessEligibility");
    const reasons = ["FAMILY_CHECK_REQUIRED", "NO_CURRENT_PERMISSION", "POLICY_PENDING",
      "FIELD_POLICY_PENDING", "ACTION_TARGET_UNSUPPORTED"];
    for (const permission of ["ALLOWED", "UNAVAILABLE"])
      for (const reason_class of reasons)
        for (const public_copy_key of reasons)
          for (const authority_mode of ["VERSIONED_CURRENT", "LEGACY_COMPATIBILITY", "APP_ONLY", "NOT_ESTABLISHED"])
            for (const grant_ref of [null, "acg_TEST_ONLY_OWN"]) {
              const expected = public_copy_key === reason_class && (permission === "ALLOWED" ?
                reason_class === "FAMILY_CHECK_REQUIRED" && grant_ref !== null && authority_mode !== "NOT_ESTABLISHED" :
                reason_class !== "FAMILY_CHECK_REQUIRED" && grant_ref === null && authority_mode === "NOT_ESTABLISHED");
              parity("AccessEligibility", { ...good, actions: [{ ...good.actions[0], permission, reason_class,
                public_copy_key, authority_mode, grant_ref }] }, expected);
            }
  });

  it("opaque own grant refs preserve canonical codepoints rather than caller-selector UTF8 bytes", () => {
    const good = fixture("AccessEligibility");
    for (const id of ["界".repeat(86), "😀".repeat(256)]) {
      expect(accessText.safeParse(id).success).toBe(true);
      expect(scopedText.safeParse(id).success).toBe(false);
      const value = { ...good, actions: [{ ...good.actions[0], grant_ref: id }] };
      parity("AccessEligibility", value, true);
      expect(eligibilityResult.parse(value).actions[0].grant_ref).toBe(id);
      // These are still NEW caller selectors, not existing opaque grant IDs.
      expect(eligibilityQuery.safeParse({ ...ownQuery(), resource_id: id }).success).toBe(false);
    }
    for (const id of ["界".repeat(257), "😀".repeat(257)]) {
      expect(accessText.safeParse(id).success).toBe(false);
      parity("AccessEligibility", { ...good, actions: [{ ...good.actions[0], grant_ref: id }] }, false);
    }
    const description = spec.components.schemas.AccessEligibilityRow.properties.grant_ref.description;
    expect(description).toContain("256 Unicode codepoints");
    expect(description).toContain("Returned unchanged without normalization");
  });

  it("output objects are strict at every public nesting level and never accept source/actor readiness injection", () => {
    const row = fixture("AccessEligibility");
    const nav = fixture("AccessSelfNavigation");
    for (const key of ["actor", "subject_user_id", "role", "allow_test_only", "as_of_ms", "source_url", "manager_domain_grants", "qualified"]) {
      parity("AccessEligibility", { ...row, [key]: "TEST_ONLY_SPOOF" }, false);
      parity("AccessEligibility", { ...row, resource: { ...row.resource, [key]: "TEST_ONLY_SPOOF" } }, false);
      parity("AccessEligibility", { ...row, actions: [{ ...row.actions[0], [key]: "TEST_ONLY_SPOOF" }] }, false);
      parity("AccessSelfNavigation", { ...nav, [key]: "TEST_ONLY_SPOOF" }, false);
      parity("AccessSelfNavigation", { ...nav, self_entry: { ...nav.self_entry, [key]: "TEST_ONLY_SPOOF" } }, false);
      parity("AccessSelfNavigation", { ...nav, features: nav.features.map((item: object, i: number) =>
        i ? item : { ...item, [key]: "TEST_ONLY_SPOOF" }) }, false);
    }
    for (const patch of [{ schema_version: "portal.self-eligibility.v2" }, { current_only: false }, { advisory_only: false }])
      parity("AccessEligibility", { ...row, ...patch }, false);
    for (const patch of [{ schema_version: "portal.self-navigation.v2" }, { current_only: false }, { advisory_only: false }])
      parity("AccessSelfNavigation", { ...nav, ...patch }, false);
    parity("AccessSelfNavigation", { ...nav, self_entry: { ...nav.self_entry, route: "/admin/profile-access" } }, false);
    for (const key of ["source_readiness", "field_readiness", "command_readiness", "family_check"])
      parity("AccessSelfNavigation", { ...nav, features: nav.features.map((item: object, i: number) =>
        i ? item : { ...item, [key]: "AVAILABLE" }) }, false);
  });

  it("publishes finite current routing independently of feature permission", () => {
    const good = fixture("AccessSelfNavigation");
    for (const mode of ["LEGACY_COMPATIBILITY", "SCOPED_V2", "NOT_ESTABLISHED"])
      parity("AccessSelfNavigation", { ...good, current_read_mode: mode }, true);
    for (const mode of [undefined, null, "SCOPED_CURRENT", "AVAILABLE", true])
      parity("AccessSelfNavigation", { ...good, current_read_mode: mode }, false);
    expect(spec.components.schemas.AccessSelfNavigation.required).toContain("current_read_mode");
    expect(spec.components.schemas.AccessSelfNavigation.properties.current_read_mode.description).toContain("not a grant");
    expect(navigationInput.safeParse({ workspace_id: "ws_TEST_ONLY", environment: "paper", current_read_mode: "SCOPED_V2" }).success).toBe(false);
  });

  it("has exactly four ordered feature slots with correct state/authority semantics", () => {
    const good = fixture("AccessSelfNavigation");
    parity("AccessSelfNavigation", { ...good, features: [...good.features].reverse() }, false);
    parity("AccessSelfNavigation", { ...good, features: [...good.features.slice(1), good.features[0]] }, false);
    parity("AccessSelfNavigation", { ...good, features: [good.features[0], ...good.features.slice(0, 3)] }, false);
    parity("AccessSelfNavigation", { ...good, features: good.features.slice(0, 3) }, false);
    parity("AccessSelfNavigation", { ...good, features: [...good.features, good.features[0]] }, false);
    for (const state of ["ENTERABLE", "HIDDEN"])
      for (const authority_mode of ["SCOPED_CURRENT", "APP_ONLY", "NOT_ESTABLISHED"]) {
        const allowed = state === "HIDDEN" ? authority_mode === "NOT_ESTABLISHED" : authority_mode !== "NOT_ESTABLISHED";
        parity("AccessSelfNavigation", { ...good, features: good.features.map((item: object, index: number) =>
          index ? item : { ...item, state, authority_mode }) }, allowed);
        const operationsAllowed = allowed && authority_mode !== "APP_ONLY";
        parity("AccessSelfNavigation", { ...good, features: good.features.map((item: object, index: number) =>
          index === 2 ? { ...item, state, authority_mode } : item) }, operationsAllowed);
      }
  });

  it("publishes only finite raw CSV eligibility and own navigation query grammars", () => {
    const good = ownQuery();
    expect(validates("AccessEligibilityQuery", good)).toBe(true);
    expect(eligibilityQuery.safeParse(good).success).toBe(true);
    const normalized = eligibilityQuery.parse(good);
    expect(normalized.actions).toEqual(["portfolio.read", "capital.top_up"]);
    for (const actions of ["", "*", "portfolio.read,", "portfolio.read,portfolio.read",
      "portfolio.read,capital.top_up,portfolio.read", "portfolio.read, capital.top_up", "portfolio.read\n",
      "capital.return_capital", "execution.accounts.read", ROW_ACTIONS.slice(0, 17).join(","),
      ["portfolio.read", "capital.top_up"]]) {
      const value = { ...good, actions };
      expect(validates("AccessEligibilityQuery", value), JSON.stringify(actions)).toBe(false);
      expect(eligibilityQuery.safeParse(value).success, JSON.stringify(actions)).toBe(false);
    }
    for (const action of ROW_ACTIONS) {
      expect(validates("AccessEligibilityQuery", { ...good, actions: action }), action).toBe(true);
      expect(eligibilityQuery.safeParse({ ...good, actions: action }).success, action).toBe(true);
    }
    const ownNav = { workspace_id: good.workspace_id, environment: good.environment };
    expect(validates("AccessSelfNavigationQuery", ownNav)).toBe(true);
    expect(navigationInput.safeParse(ownNav).success).toBe(true);
    for (const key of ["as_of_ms", "subject_user_id", "actor", "role", "profile_id", "catalogue_sha256"]) {
      expect(validates("AccessEligibilityQuery", { ...good, [key]: "TEST_ONLY_SPOOF" }), key).toBe(false);
      expect(eligibilityQuery.safeParse({ ...good, [key]: "TEST_ONLY_SPOOF" }).success, key).toBe(false);
      expect(validates("AccessSelfNavigationQuery", { ...ownNav, [key]: "TEST_ONLY_SPOOF" }), key).toBe(false);
      expect(navigationInput.safeParse({ ...ownNav, [key]: "TEST_ONLY_SPOOF" }).success, key).toBe(false);
    }
    for (const environment of ["all", "CANARY", "LIVE", null]) {
      expect(validates("AccessEligibilityQuery", { ...good, environment })).toBe(false);
      expect(eligibilityQuery.safeParse({ ...good, environment }).success).toBe(false);
      expect(validates("AccessSelfNavigationQuery", { ...ownNav, environment })).toBe(false);
      expect(navigationInput.safeParse({ ...ownNav, environment }).success).toBe(false);
    }
  });

  it("C3 scoped text matches representable controls/ASCII length while documenting extra runtime UTF8 checks", () => {
    for (const resource_id of ["a".repeat(256), "TEST_ONLY:/@ id", "😀".repeat(64)]) {
      const value = { ...ownQuery(), resource_id };
      expect(validates("AccessEligibilityQuery", value)).toBe(true);
      expect(eligibilityQuery.safeParse(value).success).toBe(true);
    }
    for (const resource_id of ["", "a".repeat(257), "TEST_ONLY\n", "bad\u0000id", "bad\u007fid"]) {
      const value = { ...ownQuery(), resource_id };
      expect(validates("AccessEligibilityQuery", value)).toBe(false);
      expect(eligibilityQuery.safeParse(value).success).toBe(false);
    }
    const description = spec.components.schemas.AccessEligibilityQuery.properties.resource_id.description;
    expect(description).toContain("UTF8 byte length");
    expect(description).toContain("malformed UTF-16");
    // Standard JSON Schema maxLength is codepoint-based; this extra runtime
    // boundary is stated, not a claim of identical byte validation in AJV.
    const multibyte = "界".repeat(86);
    expect(validates("AccessEligibilityQuery", { ...ownQuery(), resource_id: multibyte })).toBe(true);
    expect(eligibilityQuery.safeParse({ ...ownQuery(), resource_id: multibyte }).success).toBe(false);
    expect(scopedText.safeParse("\ud800").success).toBe(false);
  });

  it("C3 paths publish exact query parameters and private no-store on success and finite refusals", () => {
    const eligibility = spec.paths[prefix + "/eligibility"].get;
    const nav = spec.paths[prefix + "/self-navigation"].get;
    expect(eligibility.parameters.map((item: { name: string }) => item.name))
      .toEqual(["workspace_id", "environment", "resource_kind", "resource_id", "actions"]);
    expect(nav.parameters.map((item: { name: string }) => item.name)).toEqual(["workspace_id", "environment"]);
    const csv = eligibility.parameters.find((item: { name: string }) => item.name === "actions");
    expect(csv).toMatchObject({ in: "query", required: true, style: "form", explode: false });
    expect(csv.schema).toEqual(spec.components.schemas.AccessEligibilityQuery.properties.actions);
    for (const operation of [eligibility, nav]) {
      expect(operation.description).toContain("Current-only");
      expect(operation.description).toContain("reject unknown query keys");
      for (const status of ["200", "400", "401", "403", "404", "409", "503"])
        expect(operation.responses[status].headers["Cache-Control"])
          .toEqual({ required: true, schema: { type: "string", const: "private, no-store" } });
      expect(operation).not.toHaveProperty("requestBody");
      expect(operation.parameters.every((item: { in: string }) => item.in === "query")).toBe(true);
    }
  });
});
