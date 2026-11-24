import { accessDigest } from "../src/execution-v2/access-digest";
import { ORDINARY_AUTHORITY_SCHEMA, type OrdinaryAuthorityHead, type OrdinaryProfileGrant }
  from "../src/execution-v2/ordinary-profile-authority.contract";
import { ordinaryAuthorityStateDigest, selectOrdinaryProfileGrant } from "../src/execution-v2/ordinary-profile-authority";

export const OWNER = "TEST_ONLY-ordinary-owner", STAN = "TEST_ONLY-ordinary-stan", CHILD = "TEST_ONLY-ordinary-child";
export const WS = "TEST_ONLY-ordinary-workspace", NOW = 1_800_000_000_000;
export const DOMAIN = { profile_id: "TEST_ONLY_PAPER", catalogue_sha256: "a".repeat(64),
  profile_sha256: "b".repeat(64), field_policy_sha256: "c".repeat(64) };
export function ordinaryFixture(now = NOW) {
  const seal = { environment: "paper" as const, domain: DOMAIN, field_policy_ref: "TEST_ONLY-fields",
    valid_from_ms: now - 1000, valid_until_ms: now + 86_400_000 };
  const head: OrdinaryAuthorityHead = { schema_version: ORDINARY_AUTHORITY_SCHEMA, workspace_id: WS, revision: "TEST_ONLY-head-r1",
    artifact_sha256: "d".repeat(64), artifact_policy_revision: "TEST_ONLY-artifact-r1",
    target: { database_name: "TEST_ONLY-db", database_system_identifier: "7000000000000000001", role_name: "TEST_ONLY-role",
      protected_owner_user_id: OWNER, workspace_id: WS,
      principal_workspace_pins: [OWNER, STAN].map(user_id => ({ user_id, workspace_id: WS })) }, profile_seals: [seal] };
  const root = (subject: string): OrdinaryProfileGrant => ({ schema_version: "portal.ordinary-profile-grant.v1",
    grant_id: `TEST_ONLY-root-${subject}`, workspace_id: WS, subject_user_id: subject, issued_by: OWNER, parent_grant_id: null,
    revision: `TEST_ONLY-grant-${subject}-r1`, action: "business.read_all", delegable_actions: ["business.read_all"], ...seal });
  const owner = root(OWNER), stan = root(STAN);
  const child: OrdinaryProfileGrant = { ...stan, grant_id: "TEST_ONLY-child-grant", revision: "TEST_ONLY-child-r1",
    subject_user_id: CHILD, issued_by: STAN, parent_grant_id: stan.grant_id, delegable_actions: [],
    valid_from_ms: now - 500, valid_until_ms: now + 60_000 };
  const grants = [owner, stan, child], revocations: { grant_id: string; revision: string; digest: string }[] = [];
  const c = { state: { head, grants, revocations, digest: ordinaryAuthorityStateDigest(head, grants, revocations) },
    active: new Set([OWNER, STAN, CHILD]), now, fingerprint: accessDigest("TEST_ONLY-authority"),
    current: { policy: null, grants: [], manager_domain_grants: [], anchor: OWNER, now,
      ids: [OWNER, STAN, CHILD], active: [OWNER, STAN, CHILD], actor_member: true, actor_role: "USER", lease_until_ms: now + 60_000,
      authority_fingerprint: accessDigest("TEST_ONLY-legacy") } } as Parameters<typeof selectOrdinaryProfileGrant>[0];
  return { c, head, owner, stan, child, seal };
}
