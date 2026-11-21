/** TEST_ONLY cross-language codec vectors; no grant/receipt/source installation.
 * Export canonical Core inputs via NATIVE_CORE_VECTOR_EXPORT; verify the PM
 * codec echo via NATIVE_PM_VECTOR_RETURN. Echo is NOT held/native authority. */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scopedAccessGrant, tsRootMembershipAcceptance } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector } from "../src/execution-v2/access-digest";
import { currentAcceptanceMatches, currentAccessRelations, currentGrantProof, grantBindingDigest } from "../src/execution-v2/access-current-relations";

const NOW = Date.UTC(2026, 9, 24, 12);
const grant = scopedAccessGrant.parse({ grant_id: "TEST_ONLY-grant", subject_user_id: "TEST_ONLY-user",
  workspace_id: "TEST_ONLY-workspace", action: "business.read_all", effect: "ALLOW",
  selector: { kind: "ROOT_SCOPE", root_id: "TEST_ONLY-account-root" }, environments: ["paper"],
  valid_from_ms: NOW - 3_600_000, valid_until_ms: NOW + 3_600_000, delegable_actions: [],
  issued_by: "TEST_ONLY-owner", parent_grant_id: null, revision: "TEST_ONLY-grant-1",
  policy_revision: "TEST_ONLY-policy-1", revoked_at_ms: null, requires_ts_acceptance: true,
  ts_receipt: null, field_policy_ref: null });
const fact = tsRootMembershipAcceptance.parse({ context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY-native",
  source_contract: "TEST_ONLY-contract", trust_profile: "TEST_ONLY", receipt_id: "TEST_ONLY-ORIGINAL",
  portal_user_id: grant.subject_user_id, ts_user_id: "00000000-0000-0000-0000-000000000002",
  mapping_revision: "ts-user:00000000-0000-0000-0000-000000000002:1", human_requester_user_id: grant.issued_by,
  workspace_id: grant.workspace_id, action: grant.action, selector_digest: accessDigest(canonicalSelector(grant.selector)),
  environments: [...grant.environments], previous_membership_revision: null, membership_revision: "TEST_ONLY-membership-1",
  effective_at_ms: grant.valid_from_ms, expires_at_ms: grant.valid_until_ms, outcome: "ACCEPTED",
  payload_digest: accessDigest(["TEST_ONLY", "original-payload"]), provenance_ref: "TEST_ONLY-ORIGINAL-provenance",
  policy_revision: grant.policy_revision, policy_artifact_digest: "sha256:" + "1".repeat(64),
  policy_install_digest: "sha256:" + "2".repeat(64), approval_ref: "TEST_ONLY-Core-policy-approval",
  grant_id: grant.grant_id, grant_digest: accessDigest(grant), expected_grant_revision: grant.revision });
const vector = { schema_version: "TEST_ONLY.native-correspondence.cross-language.v1", now_ms: NOW,
  grant, fact, semantic_binding_digest: grantBindingDigest(grant) };
const root = { kind: "ROOT" as const, id: "TEST_ONLY-account-root" };
const account = { kind: "ACCOUNT" as const, id: "TEST_ONLY-account" };
function current() {
  return currentAccessRelations.parse({ schema_version: "pma.core-current-relations.v1",
    subject_user_id: grant.subject_user_id, workspace_id: grant.workspace_id, ts_user_id: fact.ts_user_id,
    mapping_revision: fact.mapping_revision, resources: [{ environment: "paper", revision: "TEST_ONLY-cut-1",
      own_alpha_ids: [], member_portfolio_ids: [], roots: [{ root_id: root.id, revision: "TEST_ONLY-census-1",
        complete: true, resources: [account] }] }], grants: [{ grant_id: grant.grant_id,
      binding_digest: vector.semantic_binding_digest, accepted: fact, targets: [root, account].map(resource => ({
        resource, environment: "paper", revision: "TEST_ONLY-native-current", native_reference_digest: accessDigest(resource),
        valid_from_ms: fact.effective_at_ms, valid_until_ms: fact.expires_at_ms })) }] });
}

describe("registered native correspondence matches actual Core grant semantics", () => {
  it("exports distinct full-original and semantic digests from canonical Core code", () => {
    expect(fact.grant_digest).toBe(accessDigest(grant));
    expect(vector.semantic_binding_digest).toBe(grantBindingDigest(grant));
    expect(vector.semantic_binding_digest).not.toBe(fact.grant_digest);
    if (process.env.NATIVE_CORE_VECTOR_EXPORT)
      writeFileSync(process.env.NATIVE_CORE_VECTOR_EXPORT, JSON.stringify(vector));
  });
  it("requires ROOT and every exact child, never implicit child permission", () => {
    const source = current();
    expect(currentAcceptanceMatches(fact, grant, source, NOW)).toBe(true);
    const attached = { ...grant, ts_acceptance_digest: accessDigest(fact), ts_receipt: {
      receipt_id: fact.receipt_id, membership_revision: fact.membership_revision, mapping_revision: fact.mapping_revision,
      effective_at_ms: fact.effective_at_ms, expires_at_ms: fact.expires_at_ms } };
    expect(currentGrantProof(attached, source, root, "paper", NOW)).not.toBeNull();
    expect(currentGrantProof(attached, source, account, "paper", NOW)).not.toBeNull();
    source.grants[0]!.targets.pop();
    expect(currentAcceptanceMatches(fact, grant, source, NOW)).toBe(false);
  });
  it("rejects wrong semantic binding, changed original and stale child", () => {
    const wrong = current(); wrong.grants[0]!.binding_digest = fact.grant_digest;
    expect(currentAcceptanceMatches(fact, grant, wrong, NOW)).toBe(false);
    const changed = current(); changed.grants[0]!.accepted.payload_digest = accessDigest("TEST_ONLY-changed");
    expect(currentAcceptanceMatches(fact, grant, changed, NOW)).toBe(false);
    const stale = current(); stale.grants[0]!.targets[1]!.valid_until_ms = NOW;
    expect(currentAcceptanceMatches(fact, grant, stale, NOW)).toBe(false);
  });
  it.skipIf(!process.env.NATIVE_PM_VECTOR_RETURN)("validates actual PM codec echo without rewriting original", () => {
    const echoed = JSON.parse(readFileSync(process.env.NATIVE_PM_VECTOR_RETURN!, "utf8"));
    expect(echoed.schema_version).toBe("TEST_ONLY.native-correspondence.codec-echo.v1");
    expect(echoed.native_authority_qualified).toBe(false);
    expect(echoed.accepted).toEqual(fact);
    expect(echoed.accepted_digest).toBe(accessDigest(fact));
    expect(echoed.binding_digest).toBe(vector.semantic_binding_digest);
    expect(echoed.target_resources).toEqual([root, account]);
    const source = current();
    source.grants[0]!.accepted = tsRootMembershipAcceptance.parse(echoed.accepted);
    source.grants[0]!.binding_digest = echoed.binding_digest;
    source.grants[0]!.targets = source.grants[0]!.targets.filter(target =>
      echoed.target_resources.some((resource: unknown) => accessDigest(resource) === accessDigest(target.resource)));
    expect(currentAcceptanceMatches(fact, grant, source, NOW)).toBe(true);
  });
});
