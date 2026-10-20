// FE-068 stage-action eligibility + FE-069 approval-request lookup + RV-10 Paper exit parent. Additive, idempotent patch of the
// governance OpenAPI plus a canonical synthetic fixture built through the SAME runtime code the
// control-api serves with. Synthetic examples are not product receipts and not installed authority.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Resolve runtime deps (zod) the way the control-api sources themselves do, not from this tooling directory.
const require = createRequire(resolve(root, '../../apps/control-api/src/governance/stage-action-eligibility.ts')), cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name =>
    name.startsWith('.') ? load(resolve(dirname(path), name + '.ts')) : require(name), module, module.exports);
  return module.exports;
}
const src = '../../apps/control-api/src/governance/';
const stage = load(resolve(root, src + 'stage-action-eligibility.ts'));
const lookup = load(resolve(root, src + 'approval-request-lookup.ts'));
const exitParent = load(resolve(root, src + 'paper-exit-parent.ts'));
const reviewContext = load(resolve(root, src + 'review-context.ts'));

const obj = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const ms = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const ref = name => ({ $ref: '#/components/schemas/' + name });
const workspaceId = { type: 'string', minLength: 3, maxLength: 96 };
const requestKey = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$' };
const payloadFields = { alpha_id: { type: 'string', minLength: 1, maxLength: 191 },
  evidence_run_id: { type: 'string', minLength: 1, maxLength: 191 },
  methodology_claim_id: { type: 'string', minLength: 1, maxLength: 191 },
  summary: { type: 'string', minLength: 8, maxLength: 2000 } };

// ---- FE-068 -------------------------------------------------------------------------------------------------
const reasons = [...stage.STAGE_REASONS], notEligible = reasons.filter(r => !['SUBMIT_CHECKS_REQUIRED', 'COMMAND_FAMILY_NOT_COMMISSIONED'].includes(r));
const row = {
  ...obj({ stage_action: { enum: [...stage.STAGE_ACTIONS] }, verdict: { enum: ['ELIGIBLE', 'NOT_ELIGIBLE', 'NOT_COMMISSIONED'] },
    eligible: { type: 'boolean' }, reason_class: { enum: reasons }, public_copy_key: { enum: reasons },
    basis: { enum: [...stage.STAGE_BASES] }, step_up_required: nullable({ type: 'boolean' }),
    step_up_state: { enum: [...stage.STAGE_STEP_UP_STATES] }, alpha_scope: nullable({ enum: [...stage.ALPHA_SCOPES] }) }),
  allOf: [
    ...stage.STAGE_ACTIONS.map(action => {
      const rule = stage.STAGE_RULES[action], none = rule.basis === 'NONE_PUBLISHED';
      return { if: { properties: { stage_action: { const: action } }, required: ['stage_action'] },
        then: { properties: { basis: { const: rule.basis }, step_up_required: { const: rule.stepUp },
          step_up_state: { const: rule.stepUp === null ? 'NOT_DETERMINED' : 'NOT_REQUIRED' },
          alpha_scope: action === 'approval.create' ? { const: stage.ALPHA_SCOPES[0] } : { type: 'null' },
          verdict: none ? { const: 'NOT_COMMISSIONED' } : { enum: ['ELIGIBLE', 'NOT_ELIGIBLE'] } } } };
    }),
    ...reasons.map(code => ({ if: { properties: { reason_class: { const: code } }, required: ['reason_class'] },
      then: { properties: { public_copy_key: { const: code } } } })),
    { if: { properties: { verdict: { const: 'ELIGIBLE' } }, required: ['verdict'] },
      then: { properties: { eligible: { const: true }, reason_class: { const: 'SUBMIT_CHECKS_REQUIRED' } } },
      else: { properties: { eligible: { const: false } } } },
    { if: { properties: { verdict: { const: 'NOT_COMMISSIONED' } }, required: ['verdict'] },
      then: { properties: { reason_class: { const: 'COMMAND_FAMILY_NOT_COMMISSIONED' } } } },
    { if: { properties: { verdict: { const: 'NOT_ELIGIBLE' } }, required: ['verdict'] },
      then: { properties: { reason_class: { enum: notEligible } } } },
  ],
  description: 'One stage action. `stage_action` is a display identifier for a button, NOT a capability name and never accepted as authority. verdict ELIGIBLE means the route\'s own knowable preconditions did not refuse the caller; the row-level checks (run completeness, parent approval, versions, projection freshness, idempotency) still run at submit and every route rechecks current authority. NOT_COMMISSIONED means no Portal route exists for the action, whatever grants the caller holds. basis names the rule the producing route enforces today. step_up_required is false for the three Portal routes that exist today (approval create, sandbox review note, paper-exit request; they demand none) and null (not determined, never false) where no route exists. For sandbox.review_note and paper.exit_review_request the verdict is computed by the SAME predicate as the review-capture-capabilities read (one authority, so the two cannot disagree about one control).',
};
const stageEligibility = {
  ...obj({ schema_version: { const: 'portal.stage-action-eligibility.v1' }, workspace_id: workspaceId,
    current_only: { const: true }, advisory_only: { const: true },
    observed_at_ms: { ...ms, description: 'Portal evaluation time (UTC epoch ms), not a source observation time and not a permission lease. Re-ask on mount, workspace switch and focus; do not cache across sessions.' },
    session_step_up: { ...obj({ state: { enum: ['ACTIVE', 'NOT_ACTIVE'] }, valid_until_ms: nullable(ms) }),
      description: 'This session\'s step-up fact (the one the access/capital mutations recheck), scoped to this session only. ACTIVE requires valid_until_ms greater than observed_at_ms; NOT_ACTIVE has null. It changes no verdict above.',
      allOf: [{ if: { properties: { state: { const: 'ACTIVE' } }, required: ['state'] },
        then: { properties: { valid_until_ms: ms } }, else: { properties: { valid_until_ms: { type: 'null' } } } }] },
    actions: { type: 'array', minItems: stage.STAGE_ACTIONS.length, maxItems: stage.STAGE_ACTIONS.length, items: false,
      prefixItems: stage.STAGE_ACTIONS.map(action => ({ allOf: [ref('StageActionEligibilityRow'),
        { properties: { stage_action: { const: action } }, required: ['stage_action'] }] })) } }),
  description: 'FE-068. Own advisory per-action eligibility for exactly ten stage actions in a fixed order, before the click. Authorization: session + workspace membership + a fresh database recheck of session and role before and after the reads. Grants nothing and consults no related capability for the commands without a route. Valid_until semantics are deliberately absent: this is a snapshot, not a lease.',
};

// ---- FE-069 -------------------------------------------------------------------------------------------------
const lookupBody = obj({ schema_version: { const: 'governance.approval-request-lookup.v1' }, workspace_id: workspaceId,
  request_key: requestKey, state: { enum: ['NONE', 'FOUND', 'KEY_PAYLOAD_CONFLICT'] },
  payload_check: { enum: ['NOT_COMPARED', 'MATCH', 'MISMATCH'] },
  result: nullable({ ...obj({ schema_version: { const: 'governance.approval-create.v1' }, replayed: { const: true },
    approval: { $ref: '../schemas/execution-governance-approval-workflow.v1.schema.json#/$defs/Approval' } }) }) });
const approvalRequestLookup = { ...lookupBody, allOf: [
  { if: { properties: { state: { const: 'FOUND' } }, required: ['state'] },
    then: { properties: { payload_check: { enum: ['NOT_COMPARED', 'MATCH'] }, result: { type: 'object' } } } },
  { if: { properties: { state: { const: 'KEY_PAYLOAD_CONFLICT' } }, required: ['state'] },
    then: { properties: { payload_check: { const: 'MISMATCH' }, result: { type: 'null' } } } },
  { if: { properties: { state: { const: 'NONE' } }, required: ['state'] },
    then: { properties: { payload_check: { const: 'NOT_COMPARED' }, result: { type: 'null' } } } },
], description: 'FE-069. Read-only answer to "what would replaying this request_key do?" for the CALLER\'S OWN requests (keyed by requester: another actor\'s request under the same key is indistinguishable from NONE). NONE: a replay would create. FOUND: result is exactly the governance.approval-create.v1 body a replay returns (replayed=true). KEY_PAYLOAD_CONFLICT: only when all four payload fields were supplied and differ from the stored request; a replay would answer 409 REQUEST_KEY_PAYLOAD_CONFLICT and no approval body. Without payload fields the stored payload is NOT compared (payload_check NOT_COMPARED): FOUND then only says a request exists under this key. Same authority as the replay it mirrors (current session + workspace membership, no gate capability). Writes nothing.' };

// ---- RV-10 --------------------------------------------------------------------------------------------------
const identifier = { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,192}$' };
const paperExitParent = { ...obj({ schema_version: { const: 'governance.paper-exit-parent.v1' }, record_authority: { const: 'PORTAL' },
  workspace_id: workspaceId, deployment_id: identifier, state: { enum: ['NONE', 'FOUND'] },
  capture_context: nullable(ref('CaptureContext')), source_side_effect_requested: { const: false } }),
  allOf: [
    { if: { properties: { state: { const: 'FOUND' } }, required: ['state'] },
      then: { properties: { capture_context: { type: 'object', properties: { action: { const: 'PAPER_EXIT_CREATE' } } } } },
      else: { properties: { capture_context: { type: 'null' } } } },
  ],
  description: 'RV-10. The R2 parent of one deployment, as the SAME CaptureContext the R2 review publishes for the PAPER_EXIT_CREATE capture (parent approval id and version, Paper projection digest, the accepted deployment choice): the pins POST /governance/paper-exit/create is bound to. The R2 is the approval whose subject is the deployment: the newest approved and unexpired one, else the newest of any status (its context is then BLOCKED with the reason, e.g. R2_APPROVAL_REQUIRED or APPROVAL_EXPIRED). NONE: the deployment has no R2 and capture_context is null. FOUND: capture_context is for this workspace, is a PAPER_EXIT_CREATE context and lists only this deployment; a BLOCKED context carries no digest and no candidates. Authority is the R2 review read (governance.r2.read) plus exact session and workspace membership; the ADMIN role and the capture checks are the context\'s own typed availability. Grants nothing, writes nothing, calls no source; the route rechecks everything at submit.' };

const payloadParams = Object.entries(payloadFields).map(([name, schema]) => ({ name, in: 'query', required: false, schema,
  description: 'Optional replay payload; supply all four or none.' }));
const noStore = { 'Cache-Control': { schema: { type: 'string', const: 'private, no-store' } } };
const read = (operationId, description, parameters, schema) => ({ operationId, description, parameters,
  responses: { 200: { description: 'Private, no-store.', headers: noStore, content: { 'application/json': { schema: ref(schema) } } },
    default: { $ref: '#/components/responses/Problem' } } });

const path = 'openapi/execution-governance.openapi.json', file = resolve(root, path);
const api = JSON.parse(readFileSync(file, 'utf8'));
api.components.schemas.StageActionEligibilityRow = row;
api.components.schemas.StageActionEligibility = stageEligibility;
api.components.schemas.ApprovalRequestLookup = approvalRequestLookup;
api.components.schemas.PaperExitParent = paperExitParent;
const base = '/api/v1/execution/governance';
api.paths[base + '/stage-action-eligibility'] = { get: read('executionStageActionEligibilityV1',
  'FE-068. Advisory own eligibility for the ten stage actions; see StageActionEligibility.', [{ $ref: '#/components/parameters/WorkspaceId' }],
  'StageActionEligibility') };
api.paths[base + '/approvals/request-lookup'] = { get: read('executionApprovalRequestLookupV1',
  'FE-069. Look up the caller\'s own approval request by request_key without replaying it; see ApprovalRequestLookup.',
  [{ $ref: '#/components/parameters/WorkspaceId' }, { name: 'request_key', in: 'query', required: true, schema: requestKey }, ...payloadParams],
  'ApprovalRequestLookup') };
api.paths[base + '/paper-exit/parent'] = { get: read('executionPaperExitParentV1',
  'RV-10. The R2 parent of a deployment as the PAPER_EXIT_CREATE capture context the Paper exit request is bound to; see PaperExitParent.',
  [{ $ref: '#/components/parameters/WorkspaceId' }, { name: 'deployment_id', in: 'query', required: true, schema: identifier }],
  'PaperExitParent') };
if (api.info.version === '1.5.0') api.info.version = '1.6.0';
if (api.info.version === '1.6.0') api.info.version = '1.7.0';

// ---- fixtures -----------------------------------------------------------------------------------------------
const NOW = 1792300000000, WS = 'ws_TEST_ONLY';
const access = (capabilities, scopes = {}, isOwner = false) => ({ userId: 'usr_TEST_ONLY', isOwner, capabilities, scopes,
  ownerState: isOwner ? 'OWNER' : 'NOT_OWNER' });
const facts = (patch = {}) => ({ workspace_id: WS, role: 'ADMIN', access: access(['governance.r2.read'], { 'governance.r2.read': [null] }),
  retained_review: false, paper_projection_authorized: true, step_up_until_ms: null, observed_at_ms: NOW, ...patch });
const approval = JSON.parse(readFileSync(resolve(root, 'fixtures/execution-governance.approval-create.valid.json'), 'utf8')).approval;
const payload = { alpha_id: approval.subject_id, evidence_run_id: 'run_TEST_ONLY', methodology_claim_id: 'claim_TEST_ONLY', summary: 'Synthetic summary' };
const base_ = { workspace_id: WS, request_key: 'req-TEST_ONLY-0001' };
const found = lookup.approvalRequestLookupOutcome({ ...base_, payloadHash: null, stored: { payloadHash: 'sha256:' + 'a'.repeat(64), approval } });
const fixture = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', runtime_qualified: false,
  stage_action_eligibility: {
    admin_with_r2_read: stage.projectStageActionEligibility(facts()),
    plain_user: stage.projectStageActionEligibility(facts({ role: 'USER', access: access([]) })),
    admin_without_r2_grant: stage.projectStageActionEligibility(facts({ access: access([]) })),
    admin_other_workspace_grant: stage.projectStageActionEligibility(facts({ access: access(['governance.r2.read'], { 'governance.r2.read': ['ws_OTHER'] }) })),
    projection_not_authorized: stage.projectStageActionEligibility(facts({ paper_projection_authorized: false })),
    retained_review_read_only: stage.projectStageActionEligibility(facts({ retained_review: true })),
    session_step_up_active: stage.projectStageActionEligibility(facts({ step_up_until_ms: NOW + 120000 })),
  },
  approval_request_lookup: {
    none: lookup.approvalRequestLookupOutcome({ ...base_, payloadHash: null, stored: null }),
    found_not_compared: found,
    found_payload_match: lookup.approvalRequestLookupOutcome({ ...base_, payloadHash: 'sha256:' + 'a'.repeat(64),
      stored: { payloadHash: 'sha256:' + 'a'.repeat(64), approval } }),
    key_payload_conflict: lookup.approvalRequestLookupOutcome({ ...base_, payloadHash: 'sha256:' + 'b'.repeat(64),
      stored: { payloadHash: 'sha256:' + 'a'.repeat(64), approval } }),
  },
  approval_request_lookup_payload_example: { request_key: base_.request_key, ...payload },
  paper_exit_parent: (() => {
    const DEPLOYMENT = 'deployment_TEST_ONLY', parent = { approvalId: 'apr_TEST_ONLY_r2', workspaceId: WS, approvalVersion: 3 };
    const blocked = code => reviewContext.blockedCapture(parent, 'PAPER_EXIT_CREATE', code);
    const available = reviewContext.CaptureContextSchema.parse({ ...blocked('CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND'),
      availability: { state: 'AVAILABLE', reason_code: null }, expected_projection_digest: 'sha256:' + 'c'.repeat(64),
      candidates: [{ deployment_id: DEPLOYMENT, portfolio_id: 'portfolio_TEST_ONLY', risk_grant_id: null, currency: 'USDT' }] });
    const outcome = context => exitParent.paperExitParentOutcome({ workspaceId: WS, deploymentId: DEPLOYMENT, context });
    return {
      none: outcome(null),
      found_available: outcome(available),
      found_blocked_r2_not_approved: outcome(blocked('R2_APPROVAL_REQUIRED')),
      found_blocked_not_admin: outcome(blocked('ADMIN_ROLE_REQUIRED')),
      found_blocked_expired: outcome(blocked('APPROVAL_EXPIRED')),
    };
  })(),
};
const outputs = { [path]: api, 'fixtures/governance-requester-reads.synthetic.valid.json': fixture };
for (const [name, value] of Object.entries(outputs)) {
  const bytes = JSON.stringify(value, null, 2) + '\n', target = resolve(root, name);
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== bytes) throw Error('Governance requester-reads drift ' + name);
  } else writeFileSync(target, bytes);
}
