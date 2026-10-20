/** Shared TEST_ONLY synthetic grant graph for the self-eligibility / step-up specs. Pure data, no DB, adapter or
 * provider. Not installed authority. */
import { tsBusinessAction, type AccessResource, type ScopedAccessGrant, type TsMembershipAcceptance } from "../../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessEvaluationContext, unqualifiedAccessRelations,
  type AccessRelations } from "../../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest, type CurrentAccessRelations } from "../../src/execution-v2/access-current-relations";

export const NOW = 1_800_000_000_000;
export const U = "TEST_ONLY:manager", OWNER = "TEST_ONLY:owner", WS = "TEST_ONLY:workspace", MAP = "TEST_ONLY:mapping";
export const P: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY:P" };
export const Q: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY:Q" };
export const A: AccessResource = { kind: "ALPHA", id: "TEST_ONLY:A" };
export const ENV = ["paper", "sandbox", "live"] as const;
function fact(g: ScopedAccessGrant): TsMembershipAcceptance {
  const r = g.ts_receipt!;
  return { source: "TEST_ONLY:PM", source_contract: "TEST_ONLY:contract", trust_profile: "TEST_ONLY:profile",
    receipt_id: r.receipt_id, proposal_id: g.grant_id + ":proposal", proposal_digest: accessDigest([g.grant_id, "proposal"]),
    portal_user_id: g.subject_user_id, ts_user_id: "TEST_ONLY:ts:" + g.subject_user_id, mapping_revision: MAP,
    human_requester_user_id: g.issued_by, workspace_id: g.workspace_id, action: g.action,
    selector_digest: accessDigest(canonicalSelector(g.selector)), environments: [...g.environments],
    previous_membership_revision: null, membership_revision: r.membership_revision,
    effective_at_ms: r.effective_at_ms, expires_at_ms: r.expires_at_ms, outcome: "ACCEPTED",
    payload_digest: accessDigest([g.grant_id, "payload"]), provenance_ref: "TEST_ONLY:NOT_NATIVE_INSTALLED" };
}
export function grant(id: string, changes: Partial<ScopedAccessGrant> = {}): ScopedAccessGrant {
  const action = changes.action ?? "portfolio.read";
  const required = changes.requires_ts_acceptance ?? tsBusinessAction(action);
  const value: ScopedAccessGrant = { grant_id: id, subject_user_id: U, workspace_id: WS, action, effect: "ALLOW",
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [P.id, Q.id] },
    environments: [...ENV], valid_from_ms: NOW - 200, valid_until_ms: NOW + 10000,
    delegable_actions: [], issued_by: OWNER, parent_grant_id: null, revision: "TEST_ONLY:grant:r1",
    policy_revision: "TEST_ONLY:policy:r1", revoked_at_ms: null, requires_ts_acceptance: required,
    ts_receipt: required ? { receipt_id: id + ":receipt", membership_revision: id + ":membership",
      mapping_revision: MAP, effective_at_ms: NOW - 100, expires_at_ms: NOW + 10000 } : null,
    field_policy_ref: null, ...changes };
  return value.ts_receipt ? { ...value, ts_acceptance_digest: accessDigest(fact(value)) } : value;
}
export function fixture(gs: ScopedAccessGrant[]) {
  const subjects = new Set([U, OWNER, ...gs.flatMap(g => [g.subject_user_id, g.issued_by])]);
  const relationMap = new Map<string, AccessRelations>();
  for (const subject of subjects) {
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1", subject_user_id: subject,
      workspace_id: WS, ts_user_id: "TEST_ONLY:ts:" + subject, mapping_revision: MAP,
      resources: ENV.map(environment => ({ environment, revision: "TEST_ONLY:cut", own_alpha_ids: [A.id],
        member_portfolio_ids: [P.id, Q.id], roots: [{ root_id: "TEST_ONLY:R", revision: "TEST_ONLY:root", complete: true, resources: [P, Q] }] })),
      grants: gs.filter(g => g.subject_user_id === subject && g.ts_receipt).map(g => ({ grant_id: g.grant_id,
        binding_digest: grantBindingDigest(g), accepted: fact(g),
        targets: g.environments.flatMap(environment => [P, Q].map(resource => ({ environment, resource,
          revision: "TEST_ONLY:target", native_reference_digest: accessDigest([g.grant_id, environment, resource]),
          valid_from_ms: NOW - 50, valid_until_ms: NOW + 5000 }))) })) };
    relationMap.set(subject, { qualified: true, revision: "TEST_ONLY:observation", own_alpha_ids: [], member_portfolio_ids: [],
      roots: {}, membership: null, current_authority: currentAccessRelations.parse(source) });
  }
  const context: AccessEvaluationContext = { principal_id: U, workspace_id: WS, now_ms: NOW, actor_current: true,
    actor_member: true, actor_role: "USER", actor_lease_until_ms: NOW + 20000, allow_test_only: true,
    policy: { workspace_id: WS, revision: "TEST_ONLY:policy:r1", artifact_digest: accessDigest("TEST_ONLY:policy"),
      approval_ref: "TEST_ONLY:NOT_OWNER_APPROVAL", state: "REVIEWED", qualification: "TEST_ONLY",
      protected_owner_user_id: OWNER, researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY:fields", fields: [] } },
    grants: gs, active_principals: subjects, relationsFor: id => relationMap.get(id) ?? unqualifiedAccessRelations() };
  return { context, gs };
}
