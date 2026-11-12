import { describe, expect, it } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { managerDomainGrant, reviewedAccessPolicy, type ManagerDomainGrant,
  type ReviewedAccessPolicy, type ScopedAccessGrant, type StoredAccessGrant } from "../src/execution-v2/access.contract";
import { assertSuccessorWindow, MANAGER_SUCCESSOR_MAX_MS, MANAGER_SUCCESSOR_SCHEMA,
  managerSuccessorDigest, managerSuccessorDocument, managerSuccessorKey, managerSuccessorPin,
  planManagerSuccessor, verifiedManagerSuccessor, type ManagerSuccessorCode,
  type ManagerSuccessorDocument } from "../src/execution-v2/manager-domain-successor";

// Pure, synthetic app-authority facts. No filesystem, database, private artifact,
// native source, session, current-human mutation or runtime commissioning proof.
const NOW = 1_800_000_000_000;
const DOMAIN = { profile_id: "TEST_ONLY-successor-profile", catalogue_sha256: "1".repeat(64),
  profile_sha256: "2".repeat(64), field_policy_sha256: "3".repeat(64) };
type Fixture = ReturnType<typeof fixture>;
function fixture(mode: "KEEP" | "ADVANCE" = "KEEP", predecessor: "expired" | "revoked" = "expired") {
  const target = { database_name: "TEST_ONLY-research", database_system_identifier: "123456789",
    role_name: "TEST_ONLY-role", workspace_id: "TEST_ONLY-workspace", protected_owner_user_id: "TEST_ONLY-owner",
    principal_workspace_pins: [{ user_id: "TEST_ONLY-reader", workspace_id: "TEST_ONLY-workspace" }] };
  const current: ReviewedAccessPolicy = reviewedAccessPolicy.parse({ workspace_id: target.workspace_id,
    revision: "TEST_ONLY-policy-r1", artifact_digest: accessDigest(["TEST_ONLY-policy-r1"]),
    approval_ref: "TEST_ONLY-not-real-approval", state: "REVIEWED", qualification: "OWNER_VERIFIED",
    protected_owner_user_id: target.protected_owner_user_id,
    researcher_fields: { state: "PENDING", policy_ref: null, fields: [] },
    manager_read_domains: [{ environment: "paper", domain: DOMAIN, field_policy_ref: "TEST_ONLY-fields",
      valid_from_ms: NOW - 60_000, valid_until_ms: NOW + 120_000 }] });
  const before: ManagerDomainGrant = managerDomainGrant.parse({ schema_version: "portal.manager-domain-grant.v1",
    grant_id: "TEST_ONLY-predecessor-read", workspace_id: target.workspace_id, subject_user_id: "TEST_ONLY-reader",
    issued_by: target.protected_owner_user_id, parent_grant_id: null, revision: "TEST_ONLY-grant-r1",
    policy_revision: current.revision, action: "business.read_all", effect: "ALLOW", environment: "paper",
    domain: DOMAIN, field_policy_ref: "TEST_ONLY-fields", valid_from_ms: NOW - 10_000,
    valid_until_ms: predecessor === "expired" ? NOW : NOW + 100_000,
    revoked_at_ms: predecessor === "revoked" ? NOW - 1 : null });
  const policy = structuredClone(current);
  if (mode === "ADVANCE") {
    policy.revision = "TEST_ONLY-policy-r2";
    policy.artifact_digest = accessDigest(["TEST_ONLY-policy-r2"]);
    policy.approval_ref = "TEST_ONLY-not-real-successor-approval";
    policy.manager_read_domains![0]!.valid_from_ms = NOW;
    policy.manager_read_domains![0]!.valid_until_ms = NOW + 60_000;
  }
  const grant: ManagerDomainGrant = { ...structuredClone(before), grant_id: "TEST_ONLY-successor-read",
    revision: "TEST_ONLY-grant-r2", policy_revision: policy.revision, valid_from_ms: NOW,
    valid_until_ms: NOW + 60_000, revoked_at_ms: null };
  const document = managerSuccessorDocument.parse({ schema_version: MANAGER_SUCCESSOR_SCHEMA,
    successor_id: "TEST_ONLY-successor-intent", target, approval_ref: "TEST_ONLY-no-real-owner-approval",
    provenance_ref: "TEST_ONLY-synthetic", expected_policy: { revision: current.revision, digest: accessDigest(current) },
    policy, grants: [{ predecessor_grant_id: before.grant_id, expected_revision: before.revision,
      expected_digest: accessDigest(before), grant }] });
  const pin = managerSuccessorPin.parse({ artifact_path: "/TEST_ONLY/not-read.json", approved_sha256: "4".repeat(64),
    target, not_before_ms: NOW, not_after_ms: NOW + 60_000, source_expires_at_ms: NOW + 90_000,
    maximum_grant_ms: 60_000 });
  return { current, before, document, pin, stored: [before] as StoredAccessGrant[] };
}
const run = (f: Fixture, now = NOW) => planManagerSuccessor(f.document, f.current, f.stored, now, f.pin);
function refused(f: Fixture, code: ManagerSuccessorCode = "MANAGER_SUCCESSOR_SCOPE_REFUSED") {
  expect(() => run(f)).toThrowError(expect.objectContaining({ code }));
}
function resealPredecessor(f: Fixture) {
  f.document.grants[0]!.expected_revision = f.before.revision;
  f.document.grants[0]!.expected_digest = accessDigest(f.before);
}
function legacy(f: Fixture): ScopedAccessGrant {
  return { grant_id: "TEST_ONLY-legacy-deny", workspace_id: f.current.workspace_id,
    subject_user_id: f.before.subject_user_id, action: "alpha.read", effect: "DENY",
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ALPHA", ids: ["TEST_ONLY-alpha"] },
    environments: ["paper"], valid_from_ms: NOW - 10_000, valid_until_ms: NOW - 1,
    delegable_actions: [], issued_by: f.before.issued_by, parent_grant_id: null,
    revision: "TEST_ONLY-legacy-r1", policy_revision: f.current.revision, revoked_at_ms: NOW - 1,
    requires_ts_acceptance: false, ts_receipt: null, field_policy_ref: null };
}

describe("Manager successor pure SYNTHETIC CAS and append-only planning", () => {
  it.each(["KEEP", "ADVANCE"] as const)("%s renews an expired predecessor without changing stored history", mode => {
    const f = fixture(mode), snapshot = structuredClone(f), result = run(f);
    expect(result.policyChanged).toBe(mode === "ADVANCE");
    expect(result.grants).toEqual([f.document.grants[0]!.grant]);
    expect(result.grants[0]!.grant_id).not.toBe(f.before.grant_id);
    expect(result.grants[0]!.revision).not.toBe(f.before.revision);
    expect(f).toEqual(snapshot);
  });
  it.each(["KEEP", "ADVANCE"] as const)("%s renews a revoked, unexpired predecessor under a fresh identity", mode => {
    const f = fixture(mode, "revoked");
    expect(run(f).grants[0]!.revoked_at_ms).toBeNull();
    expect(f.before.revoked_at_ms).toBe(NOW - 1);
    expect(f.before.valid_until_ms).toBe(NOW + 100_000);
  });
  it("READ-only produces one explicit READ grant, never an implicit STREAM permission", () => {
    const f = fixture();
    expect(run(f).grants.map(g => g.action)).toEqual(["business.read_all"]);
    f.document.grants[0]!.grant.action = "stream.subscribe";
    refused(f);
  });
  it("can independently renew STREAM only when an exact STREAM predecessor is pinned", () => {
    const f = fixture();
    f.before.action = "stream.subscribe";
    f.document.grants[0]!.grant.action = "stream.subscribe";
    resealPredecessor(f);
    expect(run(f).grants.map(g => g.action)).toEqual(["stream.subscribe"]);
  });
  it("READ-only ADVANCE does not prevent later explicit STREAM KEEP from an older-policy predecessor", () => {
    const f = fixture("ADVANCE");
    const streamBefore: ManagerDomainGrant = { ...structuredClone(f.before), grant_id: "TEST_ONLY-predecessor-stream", action: "stream.subscribe" };
    f.stored.push(streamBefore);
    const readAfter = run(f).grants[0]!;
    const current = structuredClone(f.document.policy), stored = [...f.stored, readAfter];
    const document: ManagerSuccessorDocument = { ...structuredClone(f.document), successor_id: "TEST_ONLY-stream-later",
      expected_policy: { revision: current.revision, digest: accessDigest(current) }, policy: current,
      grants: [{ predecessor_grant_id: streamBefore.grant_id, expected_revision: streamBefore.revision, expected_digest: accessDigest(streamBefore),
        grant: { ...structuredClone(streamBefore), grant_id: "TEST_ONLY-successor-stream", revision: "TEST_ONLY-stream-r2",
          policy_revision: current.revision, valid_from_ms: NOW, valid_until_ms: NOW + 60_000 } }] };
    const history = structuredClone(stored);
    const result = planManagerSuccessor(document, current, stored, NOW, f.pin);
    expect(result.policyChanged).toBe(false);
    expect(result.grants.map(g => g.action)).toEqual(["stream.subscribe"]);
    expect(stored).toEqual(history); // active READ and historical STREAM remain byte-identical
    document.grants[0]!.expected_digest = accessDigest("TEST_ONLY-wrong-history");
    expect(() => planManagerSuccessor(document, current, stored, NOW, f.pin))
      .toThrowError(expect.objectContaining({ code: "MANAGER_SUCCESSOR_REVISION_CONFLICT" }));
  });
  it.each(["revision", "digest"] as const)("rejects stale policy %s CAS", field => {
    const f = fixture();
    f.document.expected_policy[field] = field === "revision" ? "TEST_ONLY-stale" : accessDigest(["TEST_ONLY-stale"]);
    refused(f, "MANAGER_SUCCESSOR_REVISION_CONFLICT");
  });
  it("rejects missing current policy", () => {
    const f = fixture();
    expect(() => planManagerSuccessor(f.document, null, f.stored, NOW, f.pin))
      .toThrowError(expect.objectContaining({ code: "MANAGER_SUCCESSOR_REVISION_CONFLICT" }));
  });
  it.each(["revision", "digest", "missing", "legacy"] as const)("rejects %s predecessor CAS", variant => {
    const f = fixture();
    if (variant === "revision") f.document.grants[0]!.expected_revision = "TEST_ONLY-stale";
    if (variant === "digest") f.document.grants[0]!.expected_digest = accessDigest(["TEST_ONLY-stale"]);
    if (variant === "missing") f.stored = [];
    if (variant === "legacy") f.stored = [{ ...legacy(f), grant_id: f.before.grant_id }];
    refused(f, "MANAGER_SUCCESSOR_REVISION_CONFLICT");
  });
  it.each(["predecessor-id", "other-stored-id", "revision"] as const)("requires fresh successor %s", variant => {
    const f = fixture(), grant = f.document.grants[0]!.grant;
    if (variant === "predecessor-id") grant.grant_id = f.before.grant_id;
    if (variant === "other-stored-id") f.stored.push({ ...f.before, grant_id: grant.grant_id });
    if (variant === "revision") grant.revision = f.before.revision;
    refused(f, "MANAGER_SUCCESSOR_REVISION_CONFLICT");
  });
  it.each(["approval_ref", "artifact_digest", "seal-interval"] as const)("KEEP requires byte-equivalent policy, including %s", field => {
    const f = fixture();
    if (field === "approval_ref") f.document.policy.approval_ref = "TEST_ONLY-other-approval";
    if (field === "artifact_digest") f.document.policy.artifact_digest = accessDigest(["TEST_ONLY-other"]);
    if (field === "seal-interval") f.document.policy.manager_read_domains![0]!.valid_until_ms += 1;
    refused(f, "MANAGER_SUCCESSOR_REVISION_CONFLICT");
  });
  it("returns detached grant values; callers cannot mutate the verified plan's document", () => {
    const f = fixture(), result = run(f);
    result.grants[0]!.domain.profile_id = "TEST_ONLY-mutated-output";
    expect(f.document.grants[0]!.grant.domain.profile_id).toBe(DOMAIN.profile_id);
  });
});

describe("Manager successor exact identity/scope and constraint preservation", () => {
  const scopeVariants = ["subject", "workspace", "issuer", "action", "effect", "environment", "profile",
    "catalogue", "profile-hash", "field-hash", "field-ref", "policy", "revoked", "unlisted-subject"] as const;
  it.each(scopeVariants)("refuses successor %s widening or identity substitution", variant => {
    const f = fixture(), g = f.document.grants[0]!.grant;
    if (variant === "subject") g.subject_user_id = "TEST_ONLY-other-reader";
    if (variant === "workspace") g.workspace_id = "TEST_ONLY-other-workspace";
    if (variant === "issuer") g.issued_by = "TEST_ONLY-other-issuer";
    if (variant === "action") g.action = "stream.subscribe";
    if (variant === "effect") g.effect = "DENY";
    if (variant === "environment") g.environment = "live";
    if (variant === "profile") g.domain.profile_id = "TEST_ONLY-other-profile";
    if (variant === "catalogue") g.domain.catalogue_sha256 = "a".repeat(64);
    if (variant === "profile-hash") g.domain.profile_sha256 = "b".repeat(64);
    if (variant === "field-hash") g.domain.field_policy_sha256 = "c".repeat(64);
    if (variant === "field-ref") g.field_policy_ref = "TEST_ONLY-other-fields";
    if (variant === "policy") g.policy_revision = "TEST_ONLY-other-policy";
    if (variant === "revoked") g.revoked_at_ms = NOW;
    if (variant === "unlisted-subject") f.document.target.principal_workspace_pins[0]!.user_id = "TEST_ONLY-other-reader";
    refused(f);
  });
  it.each(["active", "deny", "owner", "workspace"] as const)("refuses ineligible %s predecessor even with correct CAS", variant => {
    const f = fixture();
    if (variant === "active") f.before.valid_until_ms = NOW + 1;
    if (variant === "deny") f.before.effect = "DENY";
    if (variant === "owner") f.before.issued_by = "TEST_ONLY-other-owner";
    if (variant === "workspace") f.before.workspace_id = "TEST_ONLY-other-workspace";
    resealPredecessor(f);
    refused(f);
  });
  it.each(["owner", "workspace", "duplicate-principal", "principal-workspace", "state", "qualification",
    "researcher-fields", "missing-seal", "added-seal", "seal-domain", "seal-environment", "seal-field-ref"] as const)(
    "ADVANCE cannot change policy %s scope", variant => {
      const f = fixture("ADVANCE"), p = f.document.policy;
      if (variant === "owner") p.protected_owner_user_id = "TEST_ONLY-other-owner";
      if (variant === "workspace") p.workspace_id = "TEST_ONLY-other-workspace";
      if (variant === "duplicate-principal") f.document.target.principal_workspace_pins.push({ ...f.document.target.principal_workspace_pins[0]! });
      if (variant === "principal-workspace") f.document.target.principal_workspace_pins[0]!.workspace_id = "TEST_ONLY-other-workspace";
      if (variant === "state") p.state = "PENDING";
      if (variant === "qualification") p.qualification = "TEST_ONLY";
      if (variant === "researcher-fields") p.researcher_fields.fields = ["TEST_ONLY-extra-field"];
      if (variant === "missing-seal") p.manager_read_domains = [];
      if (variant === "added-seal") p.manager_read_domains!.push({ ...structuredClone(p.manager_read_domains![0]!), domain: { ...DOMAIN, profile_id: "TEST_ONLY-extra-profile" } });
      if (variant === "seal-domain") p.manager_read_domains![0]!.domain.catalogue_sha256 = "e".repeat(64);
      if (variant === "seal-environment") p.manager_read_domains![0]!.environment = "live";
      if (variant === "seal-field-ref") p.manager_read_domains![0]!.field_policy_ref = "TEST_ONLY-other-fields";
      refused(f);
    });
  it.each(["ALLOW", "DENY"] as const)("ADVANCE does not invalidate a still-active native %s constraint", effect => {
    const f = fixture("ADVANCE");
    f.stored.push({ ...structuredClone(f.before), grant_id: "TEST_ONLY-unrelated-active", effect,
      valid_until_ms: NOW + 1, revoked_at_ms: null });
    refused(f);
  });
  it("ADVANCE refuses even historical legacy constraints instead of silently rewriting their policy", () => {
    const f = fixture("ADVANCE");
    f.stored.push(legacy(f));
    refused(f);
  });
  it("KEEP leaves unrelated active/native and legacy DENY facts unchanged", () => {
    const f = fixture();
    f.stored.push(legacy(f), { ...structuredClone(f.before), grant_id: "TEST_ONLY-unrelated-active-deny",
      effect: "DENY", valid_until_ms: NOW + 1, revoked_at_ms: null });
    const before = structuredClone(f.stored);
    expect(run(f).policyChanged).toBe(false);
    expect(f.stored).toEqual(before);
  });
});

describe("Manager successor finite window and pure document guards", () => {
  it.each([NOW - 1, NOW + 60_000, Number.NaN, NOW + 0.5])("refuses invalid/out-of-window now=%s", now => {
    const f = fixture();
    expect(() => run(f, now)).toThrowError(expect.objectContaining({ code: "MANAGER_SUCCESSOR_WINDOW_EXPIRED" }));
  });
  it("includes not-before and excludes source expiry exactly", () => {
    const f = fixture();
    expect(() => assertSuccessorWindow(f.pin, NOW)).not.toThrow();
    f.pin.source_expires_at_ms = NOW + 10;
    expect(() => assertSuccessorWindow(f.pin, NOW + 9)).not.toThrow();
    expect(() => assertSuccessorWindow(f.pin, NOW + 10))
      .toThrowError(expect.objectContaining({ code: "MANAGER_SUCCESSOR_WINDOW_EXPIRED" }));
  });
  it.each(["start", "end", "expired", "independent-cap", "seal-start", "seal-end"] as const)("rejects grant %s outside a pinned ceiling", variant => {
    const f = fixture(), g = f.document.grants[0]!.grant;
    if (variant === "start") g.valid_from_ms = NOW - 1;
    if (variant === "end") g.valid_until_ms = f.pin.not_after_ms + 1;
    if (variant === "expired") g.valid_until_ms = NOW;
    if (variant === "independent-cap") f.pin.maximum_grant_ms = 59_999;
    if (variant === "seal-start") {
      f.document.policy.manager_read_domains![0]!.valid_from_ms = NOW + 1;
      f.document.policy.revision = "TEST_ONLY-policy-r2";
      g.policy_revision = f.document.policy.revision;
    }
    if (variant === "seal-end") {
      f.document.policy.manager_read_domains![0]!.valid_until_ms = NOW + 59_999;
      f.document.policy.revision = "TEST_ONLY-policy-r2";
      g.policy_revision = f.document.policy.revision;
    }
    refused(f);
  });
  it("admits an exact two-hour bound, but rejects longer/source-expired and independently oversized caps", () => {
    const f = fixture();
    const exact = { ...f.pin, not_after_ms: NOW + MANAGER_SUCCESSOR_MAX_MS,
      source_expires_at_ms: NOW + MANAGER_SUCCESSOR_MAX_MS, maximum_grant_ms: MANAGER_SUCCESSOR_MAX_MS };
    expect(managerSuccessorPin.safeParse(exact).success).toBe(true);
    for (const value of [{ ...exact, not_after_ms: exact.not_after_ms + 1, source_expires_at_ms: exact.source_expires_at_ms + 1 },
      { ...exact, source_expires_at_ms: exact.not_after_ms - 1 }, { ...exact, maximum_grant_ms: MANAGER_SUCCESSOR_MAX_MS + 1 },
      { ...exact, maximum_grant_ms: 0 }, { ...exact, not_after_ms: exact.not_before_ms }])
      expect(managerSuccessorPin.safeParse(value).success).toBe(false);
  });
  it("plans an exact two-hour grant only when the policy seal and independently pinned source/window all cover it", () => {
    const f = fixture(), end = NOW + MANAGER_SUCCESSOR_MAX_MS;
    f.current.manager_read_domains![0]!.valid_until_ms = end;
    f.document.policy = structuredClone(f.current);
    f.document.expected_policy.digest = accessDigest(f.current);
    f.document.grants[0]!.grant.valid_until_ms = end;
    f.pin = managerSuccessorPin.parse({ ...f.pin, not_after_ms: end, source_expires_at_ms: end,
      maximum_grant_ms: MANAGER_SUCCESSOR_MAX_MS });
    expect(run(f).grants[0]!.valid_until_ms).toBe(end);
  });
  it.each(["predecessor", "successor"] as const)("rejects duplicate %s identities before planning", duplicate => {
    const f = fixture(), second = structuredClone(f.document.grants[0]!);
    if (duplicate === "predecessor") second.grant.grant_id = "TEST_ONLY-unique-successor";
    else second.predecessor_grant_id = "TEST_ONLY-unique-predecessor";
    f.document.grants.push(second);
    expect(managerSuccessorDocument.safeParse(f.document).success).toBe(false);
  });
  it("refuses excess/unknown schema fields, delegated grants and empty grant lists", () => {
    const f = fixture();
    for (const value of [{ ...f.document, schema_version: "portal.private-owner-manager-successor.v2" },
      { ...f.document, implicit_stream: true }, { ...f.document, grants: [] },
      { ...f.document, grants: Array.from({ length: 9 }, (_, i) => ({ ...f.document.grants[0]!,
        predecessor_grant_id: `TEST_ONLY-before-${i}`, grant: { ...f.document.grants[0]!.grant, grant_id: `TEST_ONLY-after-${i}` } })) },
      { ...f.document, grants: [{ ...f.document.grants[0]!, grant: { ...f.document.grants[0]!.grant, parent_grant_id: "TEST_ONLY-parent" } }] }])
      expect(managerSuccessorDocument.safeParse(value).success).toBe(false);
  });
  it("never accepts a caller-forged verified token", () => {
    for (const token of [null, undefined, {}, { kind: "VERIFIED_MANAGER_SUCCESSOR" }])
      expect(verifiedManagerSuccessor(token)).toBeNull();
  });
  it("binds the stable intent to workspace, and request digest to both document and actual artifact bytes", () => {
    const f = fixture(), key = managerSuccessorKey(f.document.target.workspace_id, f.document.successor_id);
    expect(managerSuccessorKey(f.document.target.workspace_id, f.document.successor_id)).toBe(key);
    expect(managerSuccessorKey("TEST_ONLY-other-workspace", f.document.successor_id)).not.toBe(key);
    expect(managerSuccessorKey(f.document.target.workspace_id, "TEST_ONLY-other-intent")).not.toBe(key);
    const digest = managerSuccessorDigest(f.document, "4".repeat(64));
    expect(managerSuccessorDigest(f.document, "5".repeat(64))).not.toBe(digest);
    const changed: ManagerSuccessorDocument = { ...f.document, approval_ref: "TEST_ONLY-other-approval" };
    expect(managerSuccessorDigest(changed, "4".repeat(64))).not.toBe(digest);
  });
});

// Domain renewal (Bobby, 2026-11-12): a successor may change the domain ONLY to the one the hash-pinned runtime
// manifest selects (`pin.renewed_domain`), keeping the profile id; every other policy or grant fact stays bound.
const NEW_DOMAIN = { ...DOMAIN, catalogue_sha256: "a".repeat(64), profile_sha256: "b".repeat(64), field_policy_sha256: "c".repeat(64) };
function renewalFixture() {
  const f = fixture("ADVANCE");
  const policy = f.document.policy, grant = f.document.grants[0]!.grant;
  policy.manager_read_domains![0]!.domain = structuredClone(NEW_DOMAIN);
  policy.manager_read_domains![0]!.field_policy_ref = "TEST_ONLY-fields-2";
  grant.domain = structuredClone(NEW_DOMAIN);
  grant.field_policy_ref = "TEST_ONLY-fields-2";
  f.pin = managerSuccessorPin.parse({ ...f.pin, renewed_domain: structuredClone(NEW_DOMAIN) });
  return f;
}
describe("Manager successor domain renewal to the manifest-pinned domain", () => {
  it("renews the same identity onto the pinned new seals, still one finite READ grant", () => {
    const f = renewalFixture(), result = run(f);
    expect(result.policyChanged).toBe(true);
    expect(result.grants.map(g => g.action)).toEqual(["business.read_all"]);
    expect(result.grants[0]!.domain).toEqual(NEW_DOMAIN);
  });
  it("without a pinned renewed domain the old same-domain rule still refuses a new domain", () => {
    const f = renewalFixture();
    f.pin = managerSuccessorPin.parse({ ...f.pin, renewed_domain: undefined });
    refused(f);
  });
  it("refuses a domain the manifest does not pin, even if the artifact seals it consistently", () => {
    const f = renewalFixture();
    f.pin = managerSuccessorPin.parse({ ...f.pin, renewed_domain: { ...NEW_DOMAIN, catalogue_sha256: "d".repeat(64) } });
    refused(f);
  });
  it("refuses a renewed domain with another profile id", () => {
    const f = renewalFixture();
    const other = { ...NEW_DOMAIN, profile_id: "TEST_ONLY-other-profile" };
    f.document.policy.manager_read_domains![0]!.domain = structuredClone(other);
    f.document.grants[0]!.grant.domain = structuredClone(other);
    f.pin = managerSuccessorPin.parse({ ...f.pin, renewed_domain: other });
    refused(f);
  });
  it("needs a policy revision advance: KEEP with a changed domain is a revision conflict", () => {
    const f = renewalFixture();
    f.document.policy.revision = f.current.revision;
    f.document.policy.artifact_digest = f.current.artifact_digest;
    f.document.policy.approval_ref = f.current.approval_ref;
    f.document.grants[0]!.grant.policy_revision = f.current.revision;
    refused(f, "MANAGER_SUCCESSOR_REVISION_CONFLICT");
  });
  it("refuses any other policy change smuggled with the renewal", () => {
    const f = renewalFixture();
    f.document.policy.researcher_fields = { state: "PENDING", policy_ref: "TEST_ONLY-other-ref", fields: [] };
    refused(f);
  });
  it("refuses a grant that keeps the old domain while the policy moved, a changed action, and a STREAM smuggle", () => {
    const old = renewalFixture();
    old.document.grants[0]!.grant.domain = structuredClone(DOMAIN);
    old.document.grants[0]!.grant.field_policy_ref = "TEST_ONLY-fields";
    refused(old);
    const action = renewalFixture();
    action.document.grants[0]!.grant.action = "stream.subscribe";
    refused(action);
  });
  it("keeps the 2 h ceiling, the source-expiry ceiling and the window rules under renewal", () => {
    const f = renewalFixture();
    f.document.grants[0]!.grant.valid_until_ms = NOW + 61_000;
    f.document.policy.manager_read_domains![0]!.valid_until_ms = NOW + 61_000;
    refused(f);
  });
});
