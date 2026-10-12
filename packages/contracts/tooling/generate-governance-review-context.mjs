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
  "CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND", "PAPER_VENUE_UNAVAILABLE"];
const availability = object({ state: { enum: ["AVAILABLE", "BLOCKED"] }, reason_code: { enum: [null, ...reasons] } });
availability.allOf = [{ if: { properties: { state: { const: "AVAILABLE" } }, required: ["state"] },
  then: { properties: { reason_code: { type: "null" } } }, else: { properties: { reason_code: { type: "string" } } } }];
const decision = object({ gate: { enum: ["R1", "R2"] }, workspace_id: id, approval_id: id,
  expected_approval_version: { type: "integer", minimum: 1 }, evidence_set_hash: hash,
  evidence_hashes: nullable({ type: "array", maxItems: 128, uniqueItems: true, items: hash }),
  command_type: { enum: ["GOVERNANCE_R1_DECISION", null] },
  request_schema_version: { enum: ["governance.r1-decision-plan-request.v1", null] },
  plan_path: { enum: ["/api/v1/execution/commands/plans", null] }, availability,
  source_side_effect_requested: { const: false } });
decision.description = "Immutable evidence pins for the existing R1 command. Executor availability is not permission to bypass per-verb eligibility. R2 has no commissioned executor: null command/path and typed refusal, never an R1 alias.";
decision.allOf = [{ if: { properties: { gate: { const: "R1" } }, required: ["gate"] },
  then: { properties: { command_type: { const: "GOVERNANCE_R1_DECISION" }, request_schema_version: { const: "governance.r1-decision-plan-request.v1" }, plan_path: { const: "/api/v1/execution/commands/plans" } } },
  else: { properties: { command_type: { type: "null" }, request_schema_version: { type: "null" }, plan_path: { type: "null" },
    evidence_hashes: { type: "null" }, availability: { type: "object", properties: { state: { const: "BLOCKED" }, reason_code: { const: "R2_EXECUTION_DECISION_NOT_COMMISSIONED" } } } } } },
  { if: { properties: { availability: { type: "object", properties: { state: { const: "AVAILABLE" } }, required: ["state"] } }, required: ["availability"] },
    then: { properties: { evidence_hashes: { type: "array" } } } }];
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
  r2: { ...base, gate: "R2", evidence_hashes: null, command_type: null, request_schema_version: null, plan_path: null,
    availability: { state: "BLOCKED", reason_code: "R2_EXECUTION_DECISION_NOT_COMMISSIONED" } },
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
