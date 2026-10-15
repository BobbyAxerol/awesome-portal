/** Mechanical, additive projection of the reviewed Governance contexts. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const save = (path, value) => writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
const id = { type: "string", pattern: "^[A-Za-z0-9._:-]{1,192}$" };
const hash = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const nullable = schema => ({ oneOf: [schema, { type: "null" }] });
const object = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const reasons = ["GOVERNANCE_CAPABILITY_REQUIRED", "ADMIN_ROLE_REQUIRED", "APPROVAL_NOT_PENDING", "APPROVAL_EXPIRED",
  "EVIDENCE_HASH_LIMIT_EXCEEDED", "R2_EXECUTION_DECISION_NOT_COMMISSIONED", "R1_APPROVAL_REQUIRED", "R1_EVIDENCE_INCOMPLETE",
  "R2_ACCEPTED_LINEAGE_UNAVAILABLE", "R2_REVIEW_CLOSED", "CAPTURE_RETAINED_REVIEW_READ_ONLY", "CAPTURE_PROJECTION_NOT_AUTHORIZED",
  "CAPTURE_PROJECTION_UNAVAILABLE", "CAPTURE_PROJECTION_SCOPE_MISMATCH", "CAPTURE_PROJECTION_STALE",
  "CAPTURE_DEPLOYMENT_SOURCE_UNAVAILABLE", "R2_RISK_GRANT_SOURCE_UNAVAILABLE", "R2_PORTFOLIO_SCOPE_NOT_FOUND",
  "CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND", "PAPER_VENUE_UNAVAILABLE", "R2_APPROVAL_REQUIRED", "LIVE_PARENT_NOT_PUBLISHED",
  "R1_LINEAGE_UNPUBLISHED", "R1_NOT_APPROVED", "R1_EXPIRED", "R1_EVIDENCE_MANIFEST_INTEGRITY_FAILED"];
const availability = object({ state: { enum: ["AVAILABLE", "BLOCKED"] }, reason_code: { enum: [null, ...reasons] } });
availability.allOf = [{ if: { properties: { state: { const: "AVAILABLE" } }, required: ["state"] },
  then: { properties: { reason_code: { type: "null" } } }, else: { properties: { reason_code: { type: "string" } } } }];
const decision = object({ gate: { enum: ["R1", "R2", "LIVE_GATE"] }, workspace_id: id, approval_id: id,
  expected_approval_version: { type: "integer", minimum: 1 }, evidence_set_hash: hash,
  evidence_hashes: nullable({ type: "array", maxItems: 128, uniqueItems: true, items: hash }),
  command_type: { enum: ["GOVERNANCE_R1_DECISION", "GOVERNANCE_R2_DECISION", "GOVERNANCE_LIVE_DECISION"] },
  request_schema_version: { enum: ["governance.r1-decision-plan-request.v1", "governance.r2-decision-plan-request.v1", "governance.live-decision-plan-request.v1"] },
  plan_path: { const: "/api/v1/execution/commands/plans" }, availability,
  source_side_effect_requested: { const: false } });
decision.description = "Same-read immutable child manifest pins, with distinct named Portal-only R1/R2/Live commands. AVAILABLE permits planning, not a per-verb policy bypass. Live remains blocked until an explicit immutable predecessor policy is published. Never Trading System execution authority.";
decision.allOf = [["R1", "r1", "GOVERNANCE_R1_DECISION"], ["R2", "r2", "GOVERNANCE_R2_DECISION"],
  ["LIVE_GATE", "live", "GOVERNANCE_LIVE_DECISION"]].map(([gate, route, command]) => ({
    if: { properties: { gate: { const: gate } }, required: ["gate"] },
    then: { properties: { command_type: { const: command }, request_schema_version: { const: `governance.${route}-decision-plan-request.v1` },
      ...(gate === "LIVE_GATE" ? { availability: { type: "object", properties: { state: { const: "BLOCKED" }, reason_code: { const: "LIVE_PARENT_NOT_PUBLISHED" } } } } : {}) } },
  }));
decision.allOf.push({ if: { properties: { availability: { type: "object", properties: { state: { const: "AVAILABLE" } }, required: ["state"] } }, required: ["availability"] },
  then: { properties: { evidence_hashes: { type: "array" } } } });
const paperExitDecision = object({ gate: { const: "PAPER_EXIT" },
  workspace_id: { type: "string", minLength: 3, maxLength: 96 },
  review_id: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$" },
  expected_review_version: { type: "integer", minimum: 1 }, evidence_set_hash: hash,
  source_snapshot_hash: hash,
  evidence_hashes: nullable({ type: "array", maxItems: 128, uniqueItems: true, items: hash }),
  command_type: { const: "GOVERNANCE_PAPER_EXIT_DECISION" },
  request_schema_version: { const: "governance.paper-exit-decision-plan-request.v1" },
  plan_path: { const: "/api/v1/execution/commands/plans" },
  availability: object({ state: { enum: ["AVAILABLE", "BLOCKED"] }, reason_code: { enum: [null,
    "APPROVER_ROLE_REQUIRED", "EXIT_REVIEW_NOT_PENDING", "EXIT_REVIEW_EXPIRED", "ACTOR_ALREADY_DECIDED",
    "PAPER_EXIT_QUORUM_UNSUPPORTED", "EVIDENCE_HASH_LIMIT_EXCEEDED"] } }),
  source_side_effect_requested: { const: false } });
paperExitDecision.description = "Verified same-read Paper Exit manifest pins, not lineage/finding digests. AVAILABLE allows planning only in intersection with existing per-verb eligibility; self-promotion and unmet evidence remain blocked by PROMOTE policy, while safe extend/reject retain their policy. This records a Portal decision/grant only, never TS activation.";
paperExitDecision.properties.availability.allOf = availability.allOf;
paperExitDecision.allOf = [{ if: { properties: { availability: { type: "object", properties: { state: { const: "AVAILABLE" } }, required: ["state"] } }, required: ["availability"] },
  then: { properties: { evidence_hashes: { type: "array" } } } }];
const candidate = object({ deployment_id: id, portfolio_id: id, risk_grant_id: nullable(id),
  currency: nullable({ type: "string", pattern: "^[A-Z0-9]{2,12}$" }) });
const capture = object({ action: { enum: ["R2_CREATE", "PAPER_EXIT_CREATE"] }, workspace_id: id,
  parent_approval_id: id, expected_parent_version: { type: "integer", minimum: 1 },
  expected_projection_digest: nullable(hash), availability,
  candidates: { type: "array", maxItems: 50, items: candidate }, candidates_truncated: { type: "boolean" },
  currency_semantics: { const: "REVIEWER_REQUESTED_NOT_FX_CONVERSION" }, source_side_effect_requested: { const: false } });
capture.description = "At most 50 accepted, parent/workspace/profile-bound capture choices; no Manager relations/cursors. Null currency is unrecorded, never USDT by default. Capture creates a Portal review, not execution authorization. Retained/source-off/stale/outage profiles are blocked.";
capture.allOf = [{ if: { properties: { availability: { type: "object", properties: { state: { const: "AVAILABLE" } }, required: ["state"] } }, required: ["availability"] },
  then: { properties: { expected_projection_digest: hash, candidates: { type: "array", minItems: 1 } } },
  else: { properties: { expected_projection_digest: { type: "null" }, candidates: { type: "array", maxItems: 0 } } } },
  { if: { properties: { action: { const: "R2_CREATE" } }, required: ["action"] }, then: {
    properties: { candidates: { type: "array", items: { type: "object", properties: { risk_grant_id: id } } } } } }];
const schemaPath = "schemas/execution-governance-review-context.v1.schema.json";
save(schemaPath, { $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.primusspark.com/portal/execution-governance-review-context.v1.schema.json",
  title: "Portal Governance review action context v1", $defs: { DecisionContext: decision, CaptureContext: capture,
    PaperExitDecisionContext: paperExitDecision } });
const reference = name => ({ $ref: `../schemas/execution-governance-review-context.v1.schema.json#/$defs/${name}` });
// Relative refs resolve both offline OpenAPI files and the canonical AJV $id registry.
const schemaRef = name => ({ $ref: `execution-governance-review-context.v1.schema.json#/$defs/${name}` });
function insert(path, exists, anchor, addition) {
  const target = resolve(root, path);
  const text = readFileSync(target, "utf8");
  if (exists(load(path))) return;
  if (!text.includes(anchor)) throw new Error(`Missing contract insertion anchor: ${path}`);
  const updated = text.replace(anchor, anchor + addition);
  JSON.parse(updated);
  writeFileSync(target, updated);
}
const workflowPath = "schemas/execution-governance-approval-workflow.v1.schema.json";
insert(workflowPath, value => !!value.$defs.R1ReviewResponse.properties.workspace_id,
  '"schema_version": { "const": "governance.r1-review.v1" },', `\n        "workspace_id": ${JSON.stringify(id)},`);
insert(workflowPath, value => !!value.$defs.R1ReviewResponse.properties.data.properties.decision_context,
  '"approval": { "$ref": "#/$defs/Approval" },',
  `\n            "decision_context": ${JSON.stringify(schemaRef("DecisionContext"))},\n            "capture_context": ${JSON.stringify(schemaRef("CaptureContext"))},`);
const r2Path = "schemas/execution-governance-r2-review.v1.schema.json";
insert(r2Path, value => !!value.properties.workspace_id,
  '"schema_version": { "const": "governance.r2-review.v1" },', `\n    "workspace_id": ${JSON.stringify(id)},`);
insert(r2Path, value => !!value.$defs.review_data.properties.decision_context,
  '"approval": { "$ref": "#/$defs/approval" },',
  `\n        "decision_context": ${JSON.stringify(schemaRef("DecisionContext"))},\n        "capture_context": ${JSON.stringify(schemaRef("CaptureContext"))},`);
const r2Text = readFileSync(resolve(root, r2Path), "utf8");
const oldHref = '^/governance/approvals/[A-Za-z0-9._-]+/r1$';
const scopedHref = '^/governance/approvals/[A-Za-z0-9._-]+/r1(?:\\?workspace_id=(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2}){1,576})?$';
if (load(r2Path).$defs.r1_reference.properties.href.pattern === oldHref) {
  writeFileSync(resolve(root, r2Path), r2Text.replace(JSON.stringify(oldHref), JSON.stringify(scopedHref)));
}
insert("openapi/execution-governance.openapi.json", value => !!value.components.schemas.DecisionContext,
  '"schemas": {', `\n      "DecisionContext": ${JSON.stringify(reference("DecisionContext"))},\n      "CaptureContext": ${JSON.stringify(reference("CaptureContext"))},`);
insert("schemas/execution-governance-paper-exit.v1.schema.json",
  value => !!value.$defs.PaperExitReviewResponse.properties.data.properties.decision_context,
  '"eligibility": { "$ref": "#/$defs/Eligibility" },',
  `\n            "decision_context": ${JSON.stringify(schemaRef("PaperExitDecisionContext"))},`);
insert("openapi/execution-governance.openapi.json", value => !!value.components.schemas.PaperExitDecisionContext,
  '"schemas": {', `\n      "PaperExitDecisionContext": ${JSON.stringify(reference("PaperExitDecisionContext"))},`);
const sha = `sha256:${"a".repeat(64)}`;
const base = { workspace_id: "ws_example", approval_id: "apr_example", expected_approval_version: 2,
  evidence_set_hash: sha, source_side_effect_requested: false };
save("fixtures/governance-review-context.synthetic.valid.json", {
  lane: "SYNTHETIC_CONTRACT_EXAMPLE_NOT_PRODUCT_RECEIPT",
  r1: { ...base, gate: "R1", evidence_hashes: [sha], command_type: "GOVERNANCE_R1_DECISION",
    request_schema_version: "governance.r1-decision-plan-request.v1", plan_path: "/api/v1/execution/commands/plans",
    availability: { state: "AVAILABLE", reason_code: null } },
  r2: { ...base, gate: "R2", evidence_hashes: [sha], command_type: "GOVERNANCE_R2_DECISION",
    request_schema_version: "governance.r2-decision-plan-request.v1", plan_path: "/api/v1/execution/commands/plans",
    availability: { state: "AVAILABLE", reason_code: null } },
  live: { ...base, gate: "LIVE_GATE", evidence_hashes: [sha], command_type: "GOVERNANCE_LIVE_DECISION",
    request_schema_version: "governance.live-decision-plan-request.v1", plan_path: "/api/v1/execution/commands/plans",
    availability: { state: "BLOCKED", reason_code: "LIVE_PARENT_NOT_PUBLISHED" } },
  paper_exit: { gate: "PAPER_EXIT", workspace_id: "ws_example", review_id: "exit_example", expected_review_version: 3,
    evidence_set_hash: sha, source_snapshot_hash: `sha256:${"b".repeat(64)}`,
    evidence_hashes: [sha, `sha256:${"c".repeat(64)}`], command_type: "GOVERNANCE_PAPER_EXIT_DECISION",
    request_schema_version: "governance.paper-exit-decision-plan-request.v1", plan_path: "/api/v1/execution/commands/plans",
    availability: { state: "AVAILABLE", reason_code: null }, source_side_effect_requested: false },
  capture: { action: "R2_CREATE", workspace_id: "ws_example", parent_approval_id: "apr_example", expected_parent_version: 2,
    expected_projection_digest: sha, availability: { state: "AVAILABLE", reason_code: null },
    candidates: [{ deployment_id: "dep_example", portfolio_id: "pf_example", risk_grant_id: "risk_example", currency: null }],
    candidates_truncated: false, currency_semantics: "REVIEWER_REQUESTED_NOT_FX_CONVERSION", source_side_effect_requested: false },
});

// Own commands share policy mechanics, never an R1 wire alias. Keep all response
// unions published as well as requests: a 202 ACK is not terminal settlement.
const workflow = load(workflowPath);
const ref = name => ({ $ref: `#/$defs/${name}` });
const externalWorkflowRefs = value => JSON.parse(JSON.stringify(value).replaceAll(
  '"#/$defs/', '"execution-governance-approval-workflow.v1.schema.json#/$defs/'));
function explicitArrayTypes(schema) {
  if (!schema || typeof schema !== "object") return;
  if (!Array.isArray(schema) && ("minItems" in schema || "maxItems" in schema || "uniqueItems" in schema) && !schema.type) schema.type = "array";
  for (const value of Object.values(schema)) explicitArrayTypes(value);
}
const codeItems = { type: "array", items: object({ code: { type: "string", minLength: 1 } }) };
const stamp = { type: "string", format: "date-time" };
const operationId = { type: "string", minLength: 3, maxLength: 96 };
const defs = {};
for (const [route, gate, command] of [["r1", "R1", "GOVERNANCE_R1_DECISION"],
  ["r2", "R2", "GOVERNANCE_R2_DECISION"], ["live", "LIVE_GATE", "GOVERNANCE_LIVE_DECISION"]]) {
  const prefix = route === "live" ? "Live" : route.toUpperCase();
  const request = externalWorkflowRefs(workflow.$defs.R1DecisionPlanRequest);
  explicitArrayTypes(request);
  request.properties.schema_version = { const: `governance.${route}-decision-plan-request.v1` };
  request.properties.command_type = { const: command };
  defs[`${prefix}DecisionPlanRequest`] = request;
  const localOnly = route === "r1" ? {} : { decision_authority: { const: "PORTAL_ONLY" }, source_side_effect_requested: { const: false } };
  defs[`${prefix}DecisionPlan`] = object({ schema_version: { const: `governance.${route}-decision-plan.v1` },
    operation_id: operationId, command_type: { const: command }, command_version: { const: 1 },
    approval_id: id, expected_approval_version: { type: "integer", minimum: 1 }, payload_hash: hash,
    evidence_set_hash: hash, risk_tier: { const: gate }, blockers: codeItems, warnings: codeItems,
    required_approvers: { type: "array", items: object({ role: { const: "ADMIN" }, count: { type: "integer", minimum: 1, maximum: 8 } }) },
    authority_requirements: object({ capability: { const: `governance.${route}.decide` },
      role_constraint: route === "r2" ? { const: "ADMIN" } : { type: "null" },
      workspace_membership_required: { const: true }, separation_of_duties_required: { const: true } }),
    fresh_auth_required: { const: false }, expires_at: stamp, apply_token: nullable({ type: "string" }),
    status: { enum: ["PLANNED", "APPLIED", "EXPIRED"] }, replayed: { type: "boolean" }, ...localOnly });
  defs[`${prefix}ApplyRequest`] = object({ schema_version: { const: `governance.${route}-decision-apply-request.v1` },
    workspace_id: { type: "string", minLength: 3, maxLength: 96 },
    apply_token: { type: "string", pattern: "^gat1\\.[A-Za-z0-9_-]{1,32}\\.[A-Za-z0-9_-]{3,96}\\.[A-Za-z0-9_-]{43}$" } });
  defs[`${prefix}ApplyResponse`] = object({ schema_version: { const: `governance.${route}-decision-apply.v1` },
    operation_id: operationId, receipt_id: nullable(id), status: { const: "PENDING" }, replayed: { type: "boolean" }, ...localOnly });
  defs[`${prefix}DecisionOperation`] = object({ schema_version: { const: `governance.${route}-decision-operation.v1` },
    operation_id: operationId, approval_id: id, command_type: { const: command },
    status: { enum: ["SUCCEEDED", "EXPIRED", "PENDING"] }, verification_result: { enum: ["SUCCEEDED", "EXPIRED", "PENDING"] },
    blockers: codeItems, warnings: codeItems, expected_approval_version: { type: "integer", minimum: 1 },
    evidence_set_hash: hash, planned_at: stamp, expires_at: stamp, applied_at: nullable(stamp),
    receipt: nullable({ type: "object", additionalProperties: true }), ...localOnly });
}
for (const name of ["R1DecisionPlan", "R2DecisionPlan", "LiveDecisionPlan"]) {
  defs[name].properties.required_approvers.description = "Legacy reviewer display/quorum summary, not an authorization rule. Use authority_requirements for exact capability/role and server per-verb eligibility; an ADMIN label does not grant access.";
}
const decisionsPath = "schemas/execution-governance-portal-decisions.v1.schema.json";
save(decisionsPath, { $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.primusspark.com/portal/execution-governance-portal-decisions.v1.schema.json",
  description: "Distinct Portal-only gate decision commands. No risk grant issuance, trading activation, broker or upstream side effects. LIVE_PARENT_NOT_PUBLISHED is not waived by owner role.", $defs: defs });
const api = load("openapi/execution-governance.openapi.json");
const decisionRef = name => ({ $ref: `../${decisionsPath}#/$defs/${name}` });
const union = suffix => ({ oneOf: ["R1", "R2", "Live"].map(prefix => decisionRef(`${prefix}${suffix}`)) });
for (const name of Object.keys(defs)) api.components.schemas[name] = decisionRef(name);
const plans = api.paths["/api/v1/execution/commands/plans"].post;
plans.description = "Plans a named Portal-only R1, R2, Live or Paper Exit decision. Live remains typed blocked without an immutable commissioned parent policy. Never execution authorization.";
plans.requestBody.content["application/json"].schema = { oneOf: [...union("DecisionPlanRequest").oneOf,
  { $ref: "../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitDecisionPlanRequest" }] };
plans.responses["201"].content["application/json"].schema = { oneOf: [...union("DecisionPlan").oneOf,
  { $ref: "../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitDecisionPlan" }] };
const apply = api.paths["/api/v1/execution/operations/{operation_id}/apply"].post;
apply.requestBody.content["application/json"].schema = { oneOf: [...union("ApplyRequest").oneOf,
  { $ref: "../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitApplyRequest" }] };
apply.responses["202"].content["application/json"].schema = { oneOf: [...union("ApplyResponse").oneOf,
  { $ref: "../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitApplyResponse" }] };
const operation = api.paths["/api/v1/execution/operations/{operation_id}"].get;
operation.description = "Reads an actor/workspace-bound Portal decision operation after fresh gate authorization. Poll settlement; an ACK is not terminal success.";
operation.responses["200"].content["application/json"].schema = { oneOf: [...union("DecisionOperation").oneOf,
  { $ref: "../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitDecisionOperation" }] };
save("openapi/execution-governance.openapi.json", api);
const r2 = load(r2Path);
r2.$defs.review_data.properties.decision_evidence_manifest = { $ref: "#/$defs/evidence_manifest" };
// Terminal records remain inspectable; only eligibility controls new decisions.
r2.$defs.approval.properties.status = { enum: ["PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"] };
for (const property of ["portfolio_id", "currency"]) {
  const schema = r2.$defs.approval.properties[property];
  if (!schema.oneOf?.some(item => item.type === "null")) r2.$defs.approval.properties[property] = nullable(schema);
}
save(r2Path, r2);
const live = structuredClone(r2);
live.$id = "https://schemas.primusspark.com/portal/governance-live-decision-review.v1.schema.json";
live.properties.schema_version = { const: "governance.live-decision-review.v1" };
live.$defs.approval.properties.gate = { const: "LIVE_GATE" };
save("schemas/governance-live-decision-review.v1.schema.json", live);
const liveEnvelopePath = "schemas/governance-live-review.v1.schema.json";
const liveEnvelope = load(liveEnvelopePath);
liveEnvelope.properties.governance_backbone = { $ref: "governance-live-decision-review.v1.schema.json" };
liveEnvelope.properties.workspace_id = id;
save(liveEnvelopePath, liveEnvelope);
const liveFixturePath = "fixtures/governance-live-review.valid.json";
const liveFixture = load(liveFixturePath);
const backbone = liveFixture.governance_backbone;
backbone.schema_version = "governance.live-decision-review.v1";
backbone.data.approval.gate = "LIVE_GATE";
backbone.data.approval.approval_id = "apr_live_gate_fixture";
liveFixture.approval_id = "apr_live_gate_fixture";
backbone.data.decision_evidence_manifest ??= backbone.data.evidence_manifest;
backbone.data.evidence_manifest = null;
for (const field of ["r1_reference", "r1_id", "grant_id", "grant_name", "approver_role", "plan_author"]) backbone.data[field] = null;
backbone.data.r1_state = "MISSING";
delete backbone.data.capture_context;
backbone.data.decision_context = { ...base, workspace_id: backbone.workspace_id ?? "ws_example",
  approval_id: "apr_live_gate_fixture", gate: "LIVE_GATE", evidence_set_hash: backbone.data.approval.evidence_set_hash,
  expected_approval_version: backbone.data.approval.approval_version,
  evidence_hashes: [...new Set(backbone.data.decision_evidence_manifest?.entries.map(item => item.sha256) ?? [])].sort(),
  command_type: "GOVERNANCE_LIVE_DECISION", request_schema_version: "governance.live-decision-plan-request.v1",
  plan_path: "/api/v1/execution/commands/plans", availability: { state: "BLOCKED", reason_code: "LIVE_PARENT_NOT_PUBLISHED" } };
backbone.data.eligibility = { can_approve: false, can_approve_with_condition: false, can_deny: false,
  can_request_changes: false, locks: ["LIVE_PARENT_NOT_PUBLISHED"], separation_of_duties: "OK" };
save(liveFixturePath, liveFixture);
