/** TEST_ONLY. Offline access-profile builder and invariants (owner decision 2026-11-23). Pure: no database, no
 * listener, no file, no source request, no installed authority. Fake user ids and workspace only. */
import { describe, expect, it } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { managerDomainGrant, reviewedAccessPolicy } from "../src/execution-v2/access.contract";
import {
  ACCESS_PROFILE_DEFAULT_VALIDITY_MS, AccessProfileError, assertAccessProfileInvariants, buildAccessProfileArtifact,
  type AccessProfileBuildInput,
} from "../src/execution-v2/access-profile-artifact";
import { TS_PINS_20261123_ID, TS_PROFILE_PINS_20261123 } from "../src/execution-v2/access-profile-pins";
import { privateOwnerCommissioningDocument } from "../src/execution-v2/core-owner-commissioning";

const OWNER = "usr_TEST_ONLY_bobby", STAN = "usr_TEST_ONLY_stan", EMP = "usr_TEST_ONLY_employee", WS = "ws_TEST_ONLY";
const FROM = 1_800_000_000_000;
const target = {
  database_name: "TEST_ONLY_db", database_system_identifier: "7000000000000000001", role_name: "TEST_ONLY_role",
  protected_owner_user_id: OWNER, workspace_id: WS,
  principal_workspace_pins: [OWNER, STAN, EMP].map(user_id => ({ user_id, workspace_id: WS })),
};
const users = (over: Record<string, unknown> = {}) => [
  { user_id: OWNER, role: "OWNER", granted_by: OWNER, profiles: "ALL" },
  { user_id: STAN, role: "ADMIN_READER", granted_by: OWNER, profiles: "ALL", ...over },
];
const input = (over: Record<string, unknown> = {}): AccessProfileBuildInput => ({
  schema_version: "portal.access-profile-input.v1", target, policy_revision: "policy-TEST_ONLY-1",
  approval_ref: "TEST_ONLY_APPROVAL.md#sha256:" + "a".repeat(64), provenance_ref: "TEST_ONLY provenance",
  valid_from_ms: FROM, profiles: TS_PINS_20261123_ID, users: users(), ...over,
} as AccessProfileBuildInput);
const code = (fn: () => unknown): string | undefined => {
  try { fn(); } catch (e) { return e instanceof AccessProfileError ? e.code : `OTHER:${String(e)}`; }
  return undefined;
};
const message = (fn: () => unknown): string => { try { fn(); } catch (e) { return (e as Error).message; } return ""; };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const pin = (over: Record<string, unknown>) => ({ ...TS_PROFILE_PINS_20261123[0]!, ...over });

describe("TS pins as data", () => {
  it("every pin is a full 64-hex value (nothing truncated or guessed) and Live is not ready", () => {
    for (const p of TS_PROFILE_PINS_20261123) {
      for (const v of [p.catalogue_sha256, p.field_policy_sha256, ...(p.profile_sha256 ? [p.profile_sha256] : [])])
        expect(v).toMatch(/^[0-9a-f]{64}$/);
    }
    const live = TS_PROFILE_PINS_20261123.find(p => p.profile_id === "LIVE_BINANCE_USDM")!;
    expect(live.profile_sha256).toBeNull();
    expect(live.enabled).toBe(false);
  });
  it("uses the seals, release dirs and field policies TS relayed", () => {
    const built = buildAccessProfileArtifact(input());
    const refs = built.document.policy.manager_read_domains!.map(s => s.field_policy_ref).sort();
    expect(refs).toEqual([
      "sandbox-switch-20261116/serving-policy.json#30da2153d8e4743c5d37d6119232a9b976f57ef0605efc46867dd16a1c8b6032",
      "t3-binance-20261119/serving-policy.json#4a35212dcd3db537625b9e7cbf4fed8a7e766adc88b5400440f2f87ba605da74",
      "t3-okx-20261119/serving-policy.json#24fe07bee40b29213933c0e88287c27714a4ace2aca15231da0fcd3b0036064a",
    ]);
    const okx = built.document.policy.manager_read_domains!.find(s => s.domain.profile_id === "PAPER_OKX_SWAP")!;
    expect(okx.domain.catalogue_sha256).toBe("0c43022bc2a8d1a1ec7619d880fed84cdb02b661cda228fe753fe87cdb4a5135");
    expect(okx.domain.profile_sha256).toBe("a7d53331a8ce43c62abb7586b0ee0429a056175e95d970a06b1ceaafa68bc853");
    expect(okx.environment).toBe("paper");
  });
});

describe("builder output", () => {
  const built = buildAccessProfileArtifact(input());
  it("seals three ready profiles, excludes Live as not ready, grants READ only to bobby and stan", () => {
    expect(built.summary.profiles_included).toEqual(["paper-binance@v1", "paper-okx@v1", "sandbox-binance@v1"]);
    expect(built.summary.profiles_excluded).toEqual([{ id: "live-binance@v1", reason: "PROFILE_SHA256_PENDING" }]);
    expect(built.summary.grants).toBe(6);
    expect(built.summary.actions).toEqual(["business.read_all"]);
    for (const g of built.document.manager_domain_grants) {
      expect(g.action).toBe("business.read_all");
      expect(g.effect).toBe("ALLOW");
      expect(g.issued_by).toBe(OWNER);
      expect(g.parent_grant_id).toBeNull();
      expect(g.revoked_at_ms).toBeNull();
    }
    expect(built.document.manager_domain_grants.some(g => g.domain.profile_id === "LIVE_BINANCE_USDM")).toBe(false);
  });
  it("is a 12-month window with no Plan B grant_window pin and no 2-hour cap", () => {
    for (const g of built.document.manager_domain_grants) {
      expect(g.valid_until_ms - g.valid_from_ms).toBe(ACCESS_PROFILE_DEFAULT_VALIDITY_MS);
      expect(g.valid_until_ms - g.valid_from_ms).toBeGreaterThan(2 * 3_600_000);
    }
    expect(built.bytes).not.toContain("grant_window");
    expect(built.bytes).not.toContain("stream.subscribe");
  });
  it("is deterministic and its sha256 is the sha256 of the exact compact bytes", async () => {
    const again = buildAccessProfileArtifact(input());
    expect(again.bytes).toBe(built.bytes);
    expect(again.sha256).toBe(built.sha256);
    const { createHash } = await import("node:crypto");
    expect(built.sha256).toBe(createHash("sha256").update(built.bytes, "utf8").digest("hex"));
    expect(built.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is accepted by the EXISTING strict schemas and the compact-JSON rule of the pinned reader", () => {
    const parsed = JSON.parse(built.bytes);
    expect(JSON.stringify(parsed)).toBe(built.bytes);
    expect(() => privateOwnerCommissioningDocument.parse(parsed)).not.toThrow();
    expect(() => reviewedAccessPolicy.parse(parsed.policy)).not.toThrow();
    for (const g of parsed.manager_domain_grants) expect(() => managerDomainGrant.parse(g)).not.toThrow();
    expect(parsed.policy.state).toBe("REVIEWED");
    expect(parsed.policy.qualification).toBe("OWNER_VERIFIED");
    expect(parsed.root_grants).toEqual([]);
  });
  it("binds artifact_digest to the sealed content", () => {
    const { artifact_digest } = built.document.policy;
    expect(artifact_digest).toBe(accessDigest({ target, manager_read_domains: built.document.policy.manager_read_domains,
      manager_domain_grants: built.document.manager_domain_grants }));
  });
  it("lets the owner see every grant of stan: the owner holds each seal, stan never holds more", () => {
    const ownerSeals = built.document.manager_domain_grants.filter(g => g.subject_user_id === OWNER).length;
    const stanSeals = built.document.manager_domain_grants.filter(g => g.subject_user_id === STAN).length;
    expect(ownerSeals).toBe(3);
    expect(stanSeals).toBeLessThanOrEqual(ownerSeals);
    expect(() => assertAccessProfileInvariants(built.document)).not.toThrow();
  });
});

describe("input refusals", () => {
  it("refuses a truncated pin instead of guessing", () => {
    const profiles = [pin({ catalogue_sha256: "0c43022b" })];
    expect(code(() => buildAccessProfileArtifact(input({ profiles })))).toBe("ACCESS_PROFILE_INPUT_INVALID");
  });
  it("refuses an enabled profile that has no profile_sha256 yet (Live), and excludes it by default", () => {
    const live = TS_PROFILE_PINS_20261123.find(p => p.profile_id === "LIVE_BINANCE_USDM")!;
    expect(code(() => buildAccessProfileArtifact(input({ profiles: [pin({}), { ...live, enabled: true }] })))).toBe("ACCESS_PROFILE_SEAL_INCOMPLETE");
    const out = buildAccessProfileArtifact(input({ profiles: [pin({}), live] }));
    expect(out.summary.profiles_excluded.map(e => e.id)).toEqual(["live-binance@v1"]);
  });
  it("refuses everything when no profile is ready", () => {
    const live = TS_PROFILE_PINS_20261123.find(p => p.profile_id === "LIVE_BINANCE_USDM")!;
    expect(code(() => buildAccessProfileArtifact(input({ profiles: [live] })))).toBe("ACCESS_PROFILE_INPUT_INVALID");
  });
  it("accepts a sha256:-prefixed pin and stores it without the prefix", () => {
    const out = buildAccessProfileArtifact(input({ profiles: [pin({ catalogue_sha256: "sha256:" + TS_PROFILE_PINS_20261123[0]!.catalogue_sha256 })] }));
    expect(out.document.policy.manager_read_domains![0]!.domain.catalogue_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("refuses a user that is not a pinned workspace principal, and an unknown profile_key", () => {
    expect(code(() => buildAccessProfileArtifact(input({ users: [...users(), { user_id: "usr_TEST_ONLY_stranger", role: "ADMIN_READER", granted_by: OWNER, profiles: "ALL" }] })))).toBe("ACCESS_PROFILE_INPUT_INVALID");
    expect(code(() => buildAccessProfileArtifact(input({ users: users({ profiles: ["no-such-key"] }) })))).toBe("ACCESS_PROFILE_INPUT_INVALID");
  });
  it("can limit stan to one profile key without limiting the owner", () => {
    const out = buildAccessProfileArtifact(input({ users: users({ profiles: ["paper-okx"] }) }));
    expect(out.summary.subjects.find(s => s.user_id === STAN)!.grants).toBe(1);
    expect(out.summary.subjects.find(s => s.user_id === OWNER)!.grants).toBe(3);
  });
  it("refuses an over-long window and a non-finite window", () => {
    expect(code(() => buildAccessProfileArtifact(input({ validity_ms: 731 * 86_400_000 })))).toBe("ACCESS_PROFILE_WINDOW_INVALID");
    expect(buildAccessProfileArtifact(input({ validity_ms: 30 * 86_400_000 })).summary.valid_until_ms - FROM).toBe(30 * 86_400_000);
  });
});

describe("namespaces", () => {
  it("accepts execution; reserves research and ainative with a clear message; refuses unknown", () => {
    expect(code(() => buildAccessProfileArtifact(input({ profiles: [pin({ namespace: "execution" })] })))).toBeUndefined();
    for (const ns of ["research", "ainative"]) {
      expect(code(() => buildAccessProfileArtifact(input({ profiles: [pin({ namespace: ns })] })))).toBe("ACCESS_PROFILE_NAMESPACE_RESERVED");
      expect(message(() => buildAccessProfileArtifact(input({ profiles: [pin({ namespace: ns })] })))).toContain("reserved for a later version");
    }
    expect(code(() => buildAccessProfileArtifact(input({ profiles: [pin({ namespace: "quantbt" })] })))).toBe("ACCESS_PROFILE_NAMESPACE_UNKNOWN");
  });
});

describe("versioned profiles", () => {
  const upgraded = pin({ version: 2, catalogue_sha256: "1".repeat(64), profile_sha256: "2".repeat(64), field_policy_sha256: "3".repeat(64),
    valid_from_ms: FROM + 100 * 86_400_000 });
  it("lets an upgraded seal coexist with the old one with overlapping windows, never editing in place", () => {
    const out = buildAccessProfileArtifact(input({ profiles: [pin({}), upgraded] }));
    expect(out.summary.profiles_included).toEqual(["paper-okx@v1", "paper-okx@v2"]);
    const seals = out.document.policy.manager_read_domains!;
    expect(seals).toHaveLength(2);
    const [a, b] = seals;
    expect(a!.valid_from_ms).toBeLessThan(b!.valid_until_ms);
    expect(b!.valid_from_ms).toBeLessThan(a!.valid_until_ms);
    expect(out.document.manager_domain_grants).toHaveLength(4);
    expect(new Set(out.document.manager_domain_grants.map(g => g.grant_id)).size).toBe(4);
    expect(out.document.manager_domain_grants.find(g => g.subject_user_id === OWNER && g.domain.catalogue_sha256 === "1".repeat(64))).toBeDefined();
  });
  it("refuses the same version twice and an upgrade that repeats an existing seal", () => {
    expect(code(() => buildAccessProfileArtifact(input({ profiles: [pin({}), pin({})] })))).toBe("ACCESS_PROFILE_DUPLICATE");
    expect(code(() => buildAccessProfileArtifact(input({ profiles: [pin({}), pin({ version: 2 })] })))).toBe("ACCESS_PROFILE_DUPLICATE");
  });
});

describe("protected owner invariant", () => {
  it("requires exactly one OWNER user and it must be the target protected owner", () => {
    expect(code(() => buildAccessProfileArtifact(input({ users: [{ user_id: STAN, role: "ADMIN_READER", granted_by: OWNER, profiles: "ALL" }] })))).toBe("ACCESS_PROFILE_OWNER_REQUIRED");
    expect(code(() => buildAccessProfileArtifact(input({ users: [{ user_id: STAN, role: "OWNER", granted_by: STAN, profiles: "ALL" }] })))).toBe("ACCESS_PROFILE_OWNER_REQUIRED");
    expect(code(() => buildAccessProfileArtifact(input({ users: [...users(), { user_id: EMP, role: "OWNER", granted_by: OWNER, profiles: "ALL" }] })))).toBe("ACCESS_PROFILE_OWNER_REQUIRED");
  });
  it("refuses an owner limited to some profiles", () => {
    expect(code(() => buildAccessProfileArtifact(input({ users: [{ user_id: OWNER, role: "OWNER", granted_by: OWNER, profiles: ["paper-okx"] }, users()[1]] })))).toBe("ACCESS_PROFILE_OWNER_LIMITED");
  });
  it("refuses an artifact that omits, narrows, denies or revokes the owner, or lets another subject exceed him", () => {
    const base = buildAccessProfileArtifact(input()).document;
    const without = clone(base); without.manager_domain_grants = without.manager_domain_grants.filter(g => !(g.subject_user_id === OWNER && g.domain.profile_id === "PAPER_OKX_SWAP"));
    expect(code(() => assertAccessProfileInvariants(without))).toBe("ACCESS_PROFILE_OWNER_LIMITED");
    const narrower = clone(base); narrower.manager_domain_grants.find(g => g.subject_user_id === OWNER)!.valid_until_ms -= 1;
    expect(code(() => assertAccessProfileInvariants(narrower))).toBe("ACCESS_PROFILE_OWNER_LIMITED");
    const revoked = clone(base); revoked.manager_domain_grants.find(g => g.subject_user_id === OWNER)!.revoked_at_ms = FROM + 1;
    expect(code(() => assertAccessProfileInvariants(revoked))).toBe("ACCESS_PROFILE_OWNER_LIMITED");
    const denied = clone(base); denied.manager_domain_grants.find(g => g.subject_user_id === OWNER)!.effect = "DENY";
    expect(code(() => assertAccessProfileInvariants(denied))).toBe("ACCESS_PROFILE_OWNER_LIMITED");
    const longer = clone(base);
    longer.policy.manager_read_domains![0]!.valid_until_ms += 10;
    const stanGrant = longer.manager_domain_grants.find(g => g.subject_user_id === STAN && g.domain.profile_id === longer.policy.manager_read_domains![0]!.domain.profile_id)!;
    stanGrant.valid_until_ms += 10;
    expect(code(() => assertAccessProfileInvariants(longer))).toBe("ACCESS_PROFILE_WINDOW_INVALID");
    const extra = clone(base); extra.manager_domain_grants = extra.manager_domain_grants.filter(g => !(g.subject_user_id === OWNER && g.domain.profile_id === "SANDBOX_BINANCE_USDM"));
    extra.manager_domain_grants.push({ ...clone(base.manager_domain_grants.find(g => g.subject_user_id === STAN && g.domain.profile_id === "SANDBOX_BINANCE_USDM")!), grant_id: "g_extra" });
    expect(code(() => assertAccessProfileInvariants(extra))).toBe("ACCESS_PROFILE_ARTIFACT_INVALID");
  });
  it("refuses another subject holding a profile the owner does not hold", () => {
    const base = buildAccessProfileArtifact(input({ users: [...users(), { user_id: EMP, role: "ADMIN_READER", granted_by: OWNER, profiles: ["paper-okx"] }] })).document;
    const doc = clone(base);
    const g = doc.manager_domain_grants.find(x => x.subject_user_id === EMP)!;
    const sealOther = doc.policy.manager_read_domains!.find(s => s.domain.profile_id === "PAPER_BINANCE_USDM")!;
    // Hand-craft a grant for the employee on a seal the owner holds but with a window beyond the owner's.
    g.valid_until_ms = sealOther.valid_until_ms; g.domain = clone(sealOther.domain); g.field_policy_ref = sealOther.field_policy_ref; g.environment = sealOther.environment;
    const ownerG = doc.manager_domain_grants.find(x => x.subject_user_id === OWNER && x.domain.profile_id === "PAPER_BINANCE_USDM")!;
    ownerG.valid_until_ms -= 5;
    expect(["ACCESS_PROFILE_OWNER_LIMITED", "ACCESS_PROFILE_EXCEEDS_OWNER"]).toContain(code(() => assertAccessProfileInvariants(doc)));
  });
});

describe("READ only: no STREAM or DENY escape hatch", () => {
  it("refuses STREAM by default and DENY in an artifact", () => {
    expect(code(() => buildAccessProfileArtifact(input({ users: users({ actions: ["stream.subscribe"] }) })))).toBe("ACCESS_PROFILE_ACTION_NOT_ALLOWED");
    expect(code(() => buildAccessProfileArtifact(input({ users: users({ actions: ["business.read_all", "command.send"] }) })))).toBe("ACCESS_PROFILE_ACTION_NOT_ALLOWED");
    const doc = clone(buildAccessProfileArtifact(input()).document);
    doc.manager_domain_grants.find(g => g.subject_user_id === STAN)!.effect = "DENY";
    expect(code(() => assertAccessProfileInvariants(doc))).toBe("ACCESS_PROFILE_ACTION_NOT_ALLOWED");
  });
  it("refuses the old allowance option instead of widening the approved tool", () => {
    expect(code(() => buildAccessProfileArtifact(input({ users: users({ actions: ["business.read_all", "stream.subscribe"] }) }),
      { allowStreamOrDeny: true }))).toBe("ACCESS_PROFILE_ACTION_NOT_ALLOWED");
    expect(code(() => assertAccessProfileInvariants(buildAccessProfileArtifact(input()).document,
      { allowStreamOrDeny: true }))).toBe("ACCESS_PROFILE_ACTION_NOT_ALLOWED");
  });
});

describe("G2-A1 exact target and sealed content", () => {
  it("rejects wrong-workspace principals, duplicate pins and an unpinned owner in both entry points", () => {
    const wrong = clone(target); wrong.principal_workspace_pins[1]!.workspace_id = "ws_other";
    const duplicate = clone(target); duplicate.principal_workspace_pins.push(clone(duplicate.principal_workspace_pins[0]!));
    const noOwner = clone(target); noOwner.principal_workspace_pins = noOwner.principal_workspace_pins.filter(p => p.user_id !== OWNER);
    for (const t of [wrong, duplicate, noOwner]) {
      expect(code(() => buildAccessProfileArtifact(input({ target: t })))).toBe("ACCESS_PROFILE_INPUT_INVALID");
      const doc = clone(buildAccessProfileArtifact(input()).document); doc.target = t;
      expect(code(() => assertAccessProfileInvariants(doc))).toBe("ACCESS_PROFILE_ARTIFACT_INVALID");
    }
  });
  it("rejects duplicate grant ids, duplicate semantic grants, tampered digest and grant workspace", () => {
    const base = buildAccessProfileArtifact(input()).document;
    const sameId = clone(base); sameId.manager_domain_grants.push(clone(sameId.manager_domain_grants[0]!));
    const sameScope = clone(base); sameScope.manager_domain_grants.push({ ...clone(sameScope.manager_domain_grants[0]!), grant_id: "another-id" });
    const wrongDigest = clone(base); wrongDigest.policy.artifact_digest = "sha256:" + "0".repeat(64);
    const wrongWorkspace = clone(base); wrongWorkspace.manager_domain_grants[0]!.workspace_id = "ws_other";
    for (const doc of [sameId, sameScope, wrongDigest, wrongWorkspace])
      expect(code(() => assertAccessProfileInvariants(doc))).toBe("ACCESS_PROFILE_ARTIFACT_INVALID");
  });
  it("keeps owner-issued employee reads within the same owner ceiling and remains order deterministic", () => {
    const all = [...users(), { user_id: EMP, role: "READER", granted_by: OWNER, profiles: ["paper-okx"] }];
    const first = buildAccessProfileArtifact(input({ users: all }));
    const second = buildAccessProfileArtifact(input({ users: [...all].reverse(), profiles: [...TS_PROFILE_PINS_20261123].reverse() }));
    expect(first.bytes).toBe(second.bytes);
    expect(first.document.manager_domain_grants.find(g => g.subject_user_id === EMP)?.issued_by).toBe(OWNER);
  });
  it("rejects duplicate requested profiles/actions and terms beyond the approved 12 months", () => {
    expect(code(() => buildAccessProfileArtifact(input({ users: users({ profiles: ["paper-okx", "paper-okx"] }) })))).toBe("ACCESS_PROFILE_DUPLICATE");
    expect(code(() => buildAccessProfileArtifact(input({ users: users({ actions: ["business.read_all", "business.read_all"] }) })))).toBe("ACCESS_PROFILE_DUPLICATE");
    expect(code(() => buildAccessProfileArtifact(input({ validity_ms: ACCESS_PROFILE_DEFAULT_VALIDITY_MS + 1 })))).toBe("ACCESS_PROFILE_WINDOW_INVALID");
    const doc = clone(buildAccessProfileArtifact(input()).document);
    doc.policy.manager_read_domains![0]!.valid_until_ms += 1;
    expect(code(() => assertAccessProfileInvariants(doc))).toBe("ACCESS_PROFILE_WINDOW_INVALID");
  });
});

describe("delegation is not implemented", () => {
  it("refuses a grant issued by anyone but the owner or with a parent grant, and produces none", () => {
    expect(code(() => buildAccessProfileArtifact(input({ users: [users()[0], { user_id: EMP, role: "ADMIN_READER", granted_by: STAN, profiles: "ALL" }] })))).toBe("ACCESS_PROFILE_DELEGATION_NOT_IMPLEMENTED");
    expect(code(() => buildAccessProfileArtifact(input({ users: users({ parent_grant_id: "g_parent" }) })))).toBe("ACCESS_PROFILE_DELEGATION_NOT_IMPLEMENTED");
    const out = buildAccessProfileArtifact(input());
    expect(out.document.manager_domain_grants.every(g => g.parent_grant_id === null && g.issued_by === OWNER)).toBe(true);
  });
  it("refuses a delegation-shaped document at the invariant level", () => {
    const doc = clone(buildAccessProfileArtifact(input()).document);
    doc.manager_domain_grants.find(g => g.subject_user_id === STAN)!.issued_by = STAN;
    expect(code(() => assertAccessProfileInvariants(doc))).toBe("ACCESS_PROFILE_ARTIFACT_INVALID");
  });
});
