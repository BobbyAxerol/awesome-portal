#!/usr/bin/env node
/** Real P23 R1/selection/publication graph through supported APIs only. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, privateJson, readBoundedJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { dbQuery } from './runtime-tools.mjs';

const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const CANDIDATE = 'rc_06GE8RZMKKJKK9WD166GZZ1EN0';
const APPROVAL = 'apr_06GE8S4Q2321P4DY2PPMNNMAK4';
const GRANTEE = 'p23-reader-01';
const CAPABILITY = 'governance.r1.decide';
const approvalPath = `/api/v1/execution/governance/approvals/${APPROVAL}/r1?workspace_id=${WORKSPACE}`;
const publicationPath = `/api/v1/research/release-candidates/${CANDIDATE}/publication?workspace_id=${WORKSPACE}`;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows = (sql, params = []) => dbQuery(sql, params).rows;

export function graphCounts(graph) {
  const settlement = graph.settlements.find(x => x.approval_version === 2 && x.approval_status === 'APPROVED');
  return { receipt: graph.publication.length, pack: graph.packs.length,
    permanent_refs: graph.references.filter(x => x.reference_kind === 'RELEASE_CANDIDATE').length,
    settlements: graph.settlements.length, approved_settlement: settlement ? 1 : 0,
    promotion_picks: graph.promotion.length, exposures: graph.exposures.length,
    audit_children: graph.audit_children.length, selections: graph.selections.length,
    null_trial: graph.publication[0]?.selected_trial_id === null };
}
export function assessGraph(before, after) {
  const prior = graphCounts(before), current = graphCounts(after);
  return { immutable_source_pins: hash(before.publication) === hash(after.publication)
      && hash(before.packs) === hash(after.packs)
      && hash(before.references) === hash(after.references),
    exact_existing_publication: prior.receipt === 1 && current.receipt === 1
      && prior.pack === 1 && current.pack === 1 && current.permanent_refs >= 1,
    approval_settled_once: prior.settlements === 1 && prior.promotion_picks === 0
      && current.settlements === 2 && current.approved_settlement === 1 && current.promotion_picks === 1,
    null_trial_preserved: prior.null_trial && current.null_trial,
    actual_exposure_case: current.exposures > 0,
    actual_audit_child_case: current.audit_children > 0,
    full_t14_passed: false }; // Restore + source cases are separate gates.
}
function graph() {
  const parameters = [WORKSPACE, CANDIDATE];
  return {
    publication: rows(`SELECT row_to_json(p) AS value FROM research.p22_promotion_pick_receipts_v1 p
      WHERE workspace_id=$1 AND release_candidate_id=$2`, parameters).map(x => x.value),
    packs: rows(`SELECT row_to_json(p) AS value FROM research.release_candidate_packs_v1 p
      WHERE workspace_id=$1 AND release_candidate_id=$2`, parameters).map(x => x.value),
    references: rows(`SELECT row_to_json(r) AS value FROM research.artifact_references r
      WHERE workspace_id=$1 ORDER BY artifact_id,reference_kind,reference_id`, [WORKSPACE]).map(x => x.value),
    settlements: rows(`SELECT approval_status,approval_version,quorum_met FROM research.p22_approval_settlements_v1
      WHERE workspace_id=$1 AND release_candidate_id=$2 ORDER BY approval_version`, parameters),
    promotion: rows(`SELECT row_to_json(p) AS value FROM research.attempt_promotion_pick_facts_v1 p
      WHERE workspace_id=$1 ORDER BY recorded_at,attempt_id`, [WORKSPACE]).map(x => x.value),
    exposures: rows(`SELECT exposure_id FROM research.exposure_facts WHERE workspace_id=$1 ORDER BY exposure_id`, [WORKSPACE]),
    audit_children: rows(`SELECT run_id,parent_run_id,target_selection_id FROM research.runs
      WHERE workspace_id=$1 AND relationship_kind='AUDIT_OF_SELECTION' ORDER BY run_id`, [WORKSPACE]),
    selections: rows(`SELECT selection_id,selected_trial_id FROM research.selection_records
      WHERE workspace_id=$1 ORDER BY selection_id`, [WORKSPACE]),
  };
}
function preservation() {
  return {
    users: hash(rows('SELECT row_to_json(u) AS value FROM public.portal_users u ORDER BY user_id')),
    members: hash(rows('SELECT row_to_json(m) AS value FROM public.workspace_members m ORDER BY workspace_id,user_id')),
    artifacts: hash(rows('SELECT row_to_json(a) AS value FROM research.artifacts a ORDER BY workspace_id,artifact_id')),
    parts: hash(rows('SELECT row_to_json(p) AS value FROM research.artifact_parts p ORDER BY workspace_id,artifact_id,table_kind,part_ordinal')),
  };
}
async function ownerAccessChange(client, method, path, body, key) {
  assert(client.user.username === 'p23-owner' && /^[A-Za-z0-9._:-]{8,100}$/.test(key), 'NAMED_OWNER_CHANGE_REQUIRED');
  assert((method === 'POST' && path === '/api/admin/profile-access')
    || (method === 'DELETE' && /^\/api\/admin\/profile-access\/grn_[A-Za-z0-9_-]+$/.test(path)),
  'FINITE_PROFILE_ACCESS_ROUTE_REQUIRED');
  const response = await fetch(new URL(path, BASE_URL), {
    method, redirect: 'manual', signal: AbortSignal.timeout(45000),
    headers: { origin: BASE_URL, accept: 'application/json', 'content-type': 'application/json',
      'x-dev-access-email': 'p23-owner@azdag.com',
      cookie: [...client.jar].map(([name, value]) => `${name}=${value}`).join('; '),
      'x-portal-csrf': client.jar.get('__Host-portal_csrf') ?? '',
      'x-portal-idempotency-key': key }, body: JSON.stringify(body),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0], boundary = pair.indexOf('=');
    client.jar.set(pair.slice(0, boundary), pair.slice(boundary + 1));
  }
  client.user.cookies = Object.fromEntries(client.jar);
  const result = await readBoundedJson(response);
  assert(response.status === (method === 'POST' ? 201 : 200),
    `P23_OWNER_CHANGE_REFUSED:${response.status}:${result.error?.code ?? 'UNEXPECTED'}`);
  return result;
}
function requiredGrant(value, readerId) {
  assert(['APPLIED', 'REPLAYED'].includes(value.outcome) && value.external_effect === 'NONE');
  const grant = value.grant;
  assert(grant?.grant_id && grant.state === 'ACTIVE' && grant.grant_revision === 1
    && grant.grantee_user_id === readerId && grant.workspace_id === WORKSPACE
    && grant.capability === CAPABILITY, 'EXACT_SCOPED_GRANT_REQUIRED');
  return grant;
}
async function main() {
  const home = validateHome(process.argv.find(x => x.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME);
  const label = process.argv.find(x => x.startsWith('--label='))?.slice(8) ?? 'r1-graph-19a8e813';
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_RECEIPT_LABEL_REQUIRED');
  const target = join(home, `approval-graph-${label}.json`);
  assert(!existsSync(target), 'EXISTING_APPROVAL_RECEIPT_REQUIRES_MANUAL_RECOVERY');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false,
    'CLEAN_OWNED_CELL_REQUIRED');
  const sessions = loadSessions(home);
  const owner = makeClient(sessions.identities.find(x => x.username === 'p23-owner'));
  const reader = makeClient(sessions.identities.find(x => x.username === GRANTEE));
  const readerId = reader.user.id;
  assert(readerId && rows('SELECT 1 FROM public.workspace_members WHERE workspace_id=$1 AND user_id=$2',
    [WORKSPACE, readerId]).length === 1, 'EXISTING_MEMBER_REQUIRED');
  const ownerContext = await owner.call('GET', '/api/auth/context');
  const readerContext = await reader.call('GET', '/api/auth/context');
  assert(ownerContext.body.principal.principalId === owner.user.id
    && readerContext.body.principal.principalId === readerId, 'ACTUAL_TEST_IDENTITIES_REQUIRED');
  const ownerAccess = await owner.call('GET', '/api/admin/access/self');
  const readerAccess = await reader.call('GET', '/api/admin/access/self');
  assert(ownerAccess.body.is_owner === true && readerAccess.body.is_owner === false
    && !readerAccess.body.capabilities.includes(CAPABILITY), 'UNPRIVILEGED_MEMBER_PRECONDITION_REQUIRED');
  const baseline = await owner.call('GET', approvalPath);
  const approval = baseline.body.data.approval;
  assert(approval.approval_id === APPROVAL && approval.status === 'PENDING'
    && approval.approval_version === 1 && approval.quorum_required === 1
    && approval.quorum_met === 0 && approval.evidence_complete && approval.blocker_count === 0
    && approval.requester.user_id === owner.user.id && approval.creator.user_id === owner.user.id
    && new Date(approval.expires_at).getTime() > Date.now(), 'EXACT_PENDING_R1_REQUIRED');
  const pub = await owner.call('GET', publicationPath);
  assert(pub.body.state === 'DELIVERED' && pub.body.promotion_pick?.state === 'PENDING_APPROVAL',
    'EXACT_CURRENT_PUBLICATION_REQUIRED');
  const original = graph(), originalPreservation = preservation();
  assert(graphCounts(original).receipt === 1 && graphCounts(original).permanent_refs >= 1
    && graphCounts(original).promotion_picks === 0 && graphCounts(original).null_trial,
  'NONEMPTY_NULL_TRIAL_PUBLICATION_PRECONDITION_REQUIRED');
  const prefix = `p23_${randomBytes(8).toString('hex')}`;
  const receipt = { schema_version: 'research.p23-approval-graph.v1', project: PROJECT,
    base_url: BASE_URL, candidate_source_sha: identity.candidate_source_sha,
    candidate_image_ids: Object.fromEntries(Object.entries(identity.images).map(([k,v]) => [k,v.image_id])),
    started_at_utc: new Date().toISOString(), candidate: CANDIDATE, approval: APPROVAL,
    workspace: WORKSPACE, reader_id: readerId,
    keys: { grant: `${prefix}_grant`, decision: `${prefix}_decision`, revoke: `${prefix}_revoke` },
    before: { approval: { status: approval.status, version: approval.approval_version }, graph: original,
      preservation: originalPreservation }, grant_attempted: false, grant: null, revoked: false, passed: false };
  savePrivate(target, receipt);
  const persist = () => savePrivate(target, receipt);
  let failure;
  try {
    await owner.call('POST', '/api/admin/step-up', { password: owner.user.password }, [201]);
    receipt.grant_attempted = true; persist();
    const granted = await ownerAccessChange(owner, 'POST', '/api/admin/profile-access',
      { grantee_user_id: readerId, capability: CAPABILITY, workspace_id: WORKSPACE }, receipt.keys.grant);
    receipt.grant = requiredGrant(granted, readerId); persist();
    const effective = await reader.call('GET', '/api/admin/access/self');
    assert(effective.body.is_owner === false && effective.body.capabilities.includes(CAPABILITY)
      && effective.body.capability_scopes[CAPABILITY].includes(WORKSPACE), 'SCOPED_READER_AUTHORITY_REQUIRED');
    const detail = await reader.call('GET', approvalPath);
    assert(detail.body.data.eligibility.can_approve === true
      && detail.body.data.eligibility.separation_of_duties !== 'VIOLATION', 'INDEPENDENT_R1_DECIDER_REQUIRED');
    const hashes = detail.body.data.evidence_manifest.entries.map(x => x.sha256).sort();
    assert(hashes.length > 0 && hashes.every(x => /^sha256:[0-9a-f]{64}$/.test(x))
      && new Set(hashes).size === hashes.length, 'REAL_EVIDENCE_HASHES_REQUIRED');
    const plan = await reader.call('POST', '/api/v1/execution/commands/plans', {
      schema_version: 'governance.r1-decision-plan-request.v1', workspace_id: WORKSPACE,
      request_key: receipt.keys.decision, command_type: 'GOVERNANCE_R1_DECISION', command_version: 1,
      target: { approval_id: APPROVAL }, expected_approval_version: 1,
      payload: { decision: 'APPROVE', reason: 'P23 isolated nonempty restore graph acceptance',
        conditions: [], evidence_hashes: hashes },
    }, [201]);
    assert(plan.body.status === 'PLANNED' && plan.body.blockers.length === 0
      && typeof plan.body.apply_token === 'string' && plan.body.apply_token.length > 0,
    'REAL_UNBLOCKED_R1_PLAN_REQUIRED');
    receipt.operation_id = plan.body.operation_id; persist(); // Never persist apply_token.
    const applyBody = { schema_version: 'governance.r1-decision-apply-request.v1', workspace_id: WORKSPACE,
      apply_token: plan.body.apply_token };
    const applied = await reader.call('POST', `/api/v1/execution/operations/${plan.body.operation_id}/apply`, applyBody, [202]);
    const replay = await reader.call('POST', `/api/v1/execution/operations/${plan.body.operation_id}/apply`, applyBody, [202]);
    assert(applied.body.replayed === false && replay.body.replayed === true
      && applied.body.operation_id === replay.body.operation_id, 'ONE_R1_DECISION_REPLAY_REQUIRED');
    const afterApproval = await reader.call('GET', approvalPath);
    assert(afterApproval.body.data.approval.status === 'APPROVED'
      && afterApproval.body.data.approval.approval_version === 2
      && afterApproval.body.data.approval.quorum_met === 1, 'R1_ACTUAL_APPROVAL_REQUIRED');
    const afterPublication = await owner.call('GET', publicationPath);
    receipt.after = { graph: graph(), preservation: preservation(),
      approval: { status: afterApproval.body.data.approval.status,
        version: afterApproval.body.data.approval.approval_version,
        quorum_met: afterApproval.body.data.approval.quorum_met },
      promotion_pick_state: afterPublication.body.promotion_pick?.state,
      decision_rows: rows('SELECT decision_id,actor_user_id,approval_version_after FROM public.governance_approval_decisions WHERE workspace_id=$1 AND approval_id=$2', [WORKSPACE, APPROVAL]) };
    receipt.checks = assessGraph(original, receipt.after.graph); persist();
    assert(receipt.after.decision_rows.length === 1 && receipt.after.decision_rows[0].actor_user_id === readerId
      && receipt.after.decision_rows[0].approval_version_after === 2
      && receipt.checks.immutable_source_pins && receipt.checks.exact_existing_publication
      && receipt.checks.approval_settled_once && receipt.checks.null_trial_preserved
      && receipt.after.promotion_pick_state !== 'PENDING_APPROVAL'
      && JSON.stringify(originalPreservation) === JSON.stringify(receipt.after.preservation),
    'NONEMPTY_R1_GRAPH_INTEGRITY_REQUIRED');
  } catch (error) { failure = error; receipt.failure = error.message; persist(); }
  finally {
    // If an ACK was lost after commit, recover the exact active grant through
    // the owner policy GET. Never replay an uncertain request just to learn its ID.
    if (receipt.grant_attempted && !receipt.grant) {
      try {
        const policy = await owner.call('GET', '/api/admin/profile-access');
        const matches = policy.body.accounts.find(x => x.user_id === readerId)?.capabilities
          .filter(x => x.capability === CAPABILITY && x.workspace_id === WORKSPACE) ?? [];
        assert(matches.length <= 1, 'EXACT_GRANT_RECOVERY_REQUIRED');
        if (matches.length === 1) receipt.grant = { grant_id: matches[0].grant_id,
          grant_revision: matches[0].grant_revision };
      } catch (error) { receipt.cleanup_failure = error.message; if (!failure) failure = error; }
      persist();
    }
    if (receipt.grant) {
      try {
        await owner.call('POST', '/api/admin/step-up', { password: owner.user.password }, [201]);
        const revoked = await ownerAccessChange(owner, 'DELETE',
          `/api/admin/profile-access/${receipt.grant.grant_id}`,
          { expected_revision: receipt.grant.grant_revision }, receipt.keys.revoke);
        assert(revoked.outcome === 'APPLIED' && revoked.grant?.state === 'REVOKED', 'GRANT_REVOKE_REQUIRED');
        receipt.revoked = true;
        const refused = await reader.call('GET', approvalPath, undefined, [403]);
        assert(refused.status === 403, 'DECISION_SCOPE_WITHDRAWAL_REQUIRED');
        const access = await reader.call('GET', '/api/admin/access/self');
        assert(access.body.is_owner === false && !access.body.capabilities.includes(CAPABILITY),
          'TEMPORARY_GRANT_MUST_NOT_SURVIVE');
      } catch (error) { receipt.cleanup_failure = error.message; if (!failure) failure = error; }
      persist();
    }
    savePrivate(join(home, 'sessions.json'), sessions);
  }
  if (failure) throw failure;
  receipt.passed = true; receipt.completed_at_utc = new Date().toISOString(); persist();
  console.log(JSON.stringify({ scoped_passed: true, full_t14_passed: false,
    approval: receipt.after.approval.status, decision_count: receipt.after.decision_rows.length,
    settlements: graphCounts(receipt.after.graph).settlements,
    promotion_picks: graphCounts(receipt.after.graph).promotion_picks,
    null_trial: receipt.checks.null_trial_preserved, temporary_grant_revoked: receipt.revoked,
    actual_exposure_case: receipt.checks.actual_exposure_case,
    actual_audit_child_case: receipt.checks.actual_audit_child_case }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('P23 approval graph refused:', error.message); process.exitCode = 1; });
}
