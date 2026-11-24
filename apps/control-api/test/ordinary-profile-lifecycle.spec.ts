/** TEST_ONLY pure/offline candidate proof. No DB, source, installation or delegation. */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { assertAccessProfileInvariants, buildAccessProfileArtifact, type AccessProfileBuildInput,
  type AccessProfileInput, ACCESS_PROFILE_DEFAULT_VALIDITY_MS } from "../src/execution-v2/access-profile-artifact";
import { buildOrdinaryProfileLifecycle, OrdinaryProfileLifecycleError } from "../src/execution-v2/ordinary-profile-lifecycle";
import { ordinaryProfileLifecycleFailure, parseOrdinaryProfileLifecycleArgs, runOrdinaryProfileLifecycle,
  type OrdinaryProfileLifecycleIo } from "../src/execution-v2/ordinary-profile-lifecycle-operator";

const OWNER = "TEST_ONLY_owner", STAN = "TEST_ONLY_stan", EMP = "TEST_ONLY_employee", WS = "TEST_ONLY_ws";
const FROM = 1_800_000_000_000, TERM = ACCESS_PROFILE_DEFAULT_VALIDITY_MS, DAY = 86_400_000;
const target = { database_name: "TEST_ONLY_db", database_system_identifier: "7000000000000000001",
  role_name: "TEST_ONLY_role", protected_owner_user_id: OWNER, workspace_id: WS,
  principal_workspace_pins: [OWNER, STAN, EMP].map(user_id => ({ user_id, workspace_id: WS })) };
const profile = (over: Partial<AccessProfileInput> = {}): AccessProfileInput => ({
  profile_key: "paper-test", version: 1, namespace: "execution", environment: "paper", profile_id: "TEST_ONLY_PAPER",
  catalogue_sha256: "a".repeat(64), profile_sha256: "b".repeat(64), field_policy_sha256: "c".repeat(64),
  field_policy_dir: "TEST_ONLY_policy", ...over });
function input(over: Partial<AccessProfileBuildInput> = {}): AccessProfileBuildInput {
  return { schema_version: "portal.access-profile-input.v1", target, policy_revision: "TEST_ONLY-r1",
    approval_ref: "TEST_ONLY-approval", provenance_ref: "TEST_ONLY-origin", valid_from_ms: FROM,
    profiles: [profile()], users: [{ user_id: OWNER, role: "OWNER", granted_by: OWNER, profiles: "ALL" },
      { user_id: STAN, role: "ADMIN_READER", granted_by: OWNER, profiles: "ALL" }], ...over };
}
const current = () => buildAccessProfileArtifact(input());
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
function request(operation: "BOOTSTRAP" | "RENEW" | "HOT_ADD", next = input(), expected: string | null = null) {
  return { schema_version: "portal.ordinary-profile-lifecycle.v1", operation, expected_current_sha256: expected, next };
}
function hotInput(): AccessProfileBuildInput {
  return input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + DAY, profiles: [
    profile({ valid_from_ms: FROM, valid_until_ms: FROM + TERM }),
    profile({ profile_key: "sandbox-test", profile_id: "TEST_ONLY_SANDBOX", environment: "sandbox",
      catalogue_sha256: "d".repeat(64), profile_sha256: "e".repeat(64), field_policy_sha256: "f".repeat(64) }),
  ] });
}

describe("ordinary offline lifecycle candidates", () => {
  it("bootstraps deterministically using the existing builder, with no applied authority", () => {
    const a = buildOrdinaryProfileLifecycle(request("BOOTSTRAP")), b = buildOrdinaryProfileLifecycle(request("BOOTSTRAP"));
    expect(a).toEqual(b);
    expect(a.artifact).toEqual(current());
    expect(a).toMatchObject({ state: "OFFLINE_ARTIFACT_PREPARED", installed: false, database_checked: false,
      source_checked: false, delegation_performed: false, predecessor: null, application_requires: "G3_ORDINARY_AUTHORITY_WRITER" });
  });
  it("renewal preserves owner/workspace/principal pins and every scope, appending fresh identities", () => {
    const before = current(), immutable = before.bytes;
    const next = input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + TERM });
    const result = buildOrdinaryProfileLifecycle(request("RENEW", next, before.sha256), before.bytes);
    expect(result.artifact.document.target).toEqual(before.document.target);
    expect(result.artifact.document.manager_domain_grants.map(g => g.grant_id))
      .not.toEqual(before.document.manager_domain_grants.map(g => g.grant_id));
    for (const g of result.artifact.document.manager_domain_grants) {
      expect(before.document.manager_domain_grants.some(old => old.grant_id === g.grant_id)).toBe(false);
      expect(g.valid_until_ms - g.valid_from_ms).toBe(365 * DAY);
      expect(g.valid_from_ms).toBe(FROM + TERM);
    }
    expect(result.predecessor).toMatchObject({ artifact_sha256: before.sha256, artifact_bytes: immutable,
      grants: before.document.manager_domain_grants.map(g => ({ grant_id: g.grant_id, revision: g.revision, digest: accessDigest(g) })) });
    expect(before.bytes).toBe(immutable);
    expect(() => assertAccessProfileInvariants(result.artifact.document)).not.toThrow();
  });
  it("hot-add keeps all existing sealed windows and owner coverage, without renewing implicitly", () => {
    const before = current();
    const result = buildOrdinaryProfileLifecycle(request("HOT_ADD", hotInput(), before.sha256), before.bytes);
    const after = result.artifact.document;
    expect(after.policy.manager_read_domains).toHaveLength(2);
    expect(after.policy.manager_read_domains!.find(s => s.domain.profile_id === "TEST_ONLY_PAPER"))
      .toEqual(before.document.policy.manager_read_domains![0]);
    expect(after.manager_domain_grants).toHaveLength(4);
    expect(after.manager_domain_grants.every(g => g.issued_by === OWNER && g.parent_grant_id === null &&
      g.action === "business.read_all" && g.effect === "ALLOW")).toBe(true);
    expect(() => assertAccessProfileInvariants(after)).not.toThrow();
  });
  it("supports bootstrap -> renew -> hot-add as checked artifact transformations", () => {
    const first = buildOrdinaryProfileLifecycle(request("BOOTSTRAP"));
    const renewedInput = input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + TERM });
    const second = buildOrdinaryProfileLifecycle(request("RENEW", renewedInput, first.artifact.sha256), first.artifact.bytes);
    const profiles = [profile({ valid_from_ms: FROM + TERM, valid_until_ms: FROM + 2 * TERM }),
      profile({ profile_key: "new-test", profile_id: "TEST_ONLY_NEW", catalogue_sha256: "d".repeat(64) })];
    const third = buildOrdinaryProfileLifecycle(request("HOT_ADD", input({ policy_revision: "TEST_ONLY-r3",
      valid_from_ms: FROM + TERM + DAY, profiles }), second.artifact.sha256), second.artifact.bytes);
    expect(third.predecessor!.artifact_sha256).toBe(second.artifact.sha256);
    expect(third.installed).toBe(false);
  });
  it("rejects a stale/wrong SHA and even valid JSON whose exact bytes differ from the pin", () => {
    const before = current(), next = input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + TERM });
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", next, "0".repeat(64)), before.bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_CURRENT_MISMATCH"));
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", next, before.sha256), before.bytes + "\n"))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_CURRENT_MISMATCH"));
  });
  it.each(["RENEW", "HOT_ADD"] as const)("%s needs a current pin; bootstrap refuses an existing input", operation => {
    expect(() => buildOrdinaryProfileLifecycle(request(operation))).toThrowError(OrdinaryProfileLifecycleError);
    expect(() => buildOrdinaryProfileLifecycle(request("BOOTSTRAP"), current().bytes)).toThrowError(OrdinaryProfileLifecycleError);
  });
  it("refuses policy revision/identity reuse and moving the physical/owner/principal target", () => {
    const before = current();
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", input({ valid_from_ms: FROM + TERM }), before.sha256), before.bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_REVISION_REUSED"));
    const next = input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + TERM,
      target: { ...target, role_name: "TEST_ONLY_other" } });
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", next, before.sha256), before.bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_TARGET_CHANGED"));
  });
  it("rejects an otherwise valid predecessor whose grant identity would be reused", () => {
    const next = input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + TERM });
    const reusedId = buildAccessProfileArtifact(next).document.manager_domain_grants[0]!.grant_id;
    const doc = structuredClone(current().document);
    doc.manager_domain_grants[0]!.grant_id = reusedId;
    doc.policy.artifact_digest = accessDigest({ target: doc.target, manager_read_domains: doc.policy.manager_read_domains,
      manager_domain_grants: doc.manager_domain_grants });
    const bytes = JSON.stringify(doc);
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", next, sha(bytes)), bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_ID_REUSED"));
  });
  it("refuses removal of a subject scope or replacement of an included seal", () => {
    const before = current();
    const noStan = input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + TERM, users: input().users.slice(0, 1) });
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", noStan, before.sha256), before.bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_SCOPE_REMOVED"));
    const replaced = input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + TERM,
      profiles: [profile({ catalogue_sha256: "d".repeat(64) })] });
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", replaced, before.sha256), before.bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_SCOPE_REMOVED"));
  });
  it("requires exactly365d, not shorter authoring terms or a hot-add that changes an old window", () => {
    expect(() => buildOrdinaryProfileLifecycle(request("BOOTSTRAP", input({ validity_ms: 30 * DAY }))))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_TERM_INVALID"));
    const before = current(), bad = hotInput();
    bad.profiles = [profile(), ...(hotInput().profiles as AccessProfileInput[]).slice(1)];
    expect(() => buildOrdinaryProfileLifecycle(request("HOT_ADD", bad, before.sha256), before.bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_OPERATION_MISMATCH"));
  });
  it("refuses no-op hot-add, renewal scope expansion and backwards renewal", () => {
    const before = current();
    expect(() => buildOrdinaryProfileLifecycle(request("HOT_ADD", input({ policy_revision: "TEST_ONLY-r2" }), before.sha256), before.bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_OPERATION_MISMATCH"));
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", hotInput(), before.sha256), before.bytes)).toThrowError(OrdinaryProfileLifecycleError);
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", input({ policy_revision: "TEST_ONLY-r2",
      valid_from_ms: FROM - DAY }), before.sha256), before.bytes)).toThrowError(OrdinaryProfileLifecycleError);
  });
  it.each(["DENY", "LEGACY", "DIGEST"])("refuses an unsupported %s predecessor, never silently dropping it", kind => {
    const before = current(), doc = structuredClone(before.document) as unknown as Record<string, any>;
    if (kind === "DENY") doc.manager_domain_grants[1].effect = "DENY";
    else if (kind === "LEGACY") doc.root_grants.push({ grant_id: "TEST_ONLY_legacy" });
    else doc.policy.artifact_digest = "sha256:" + "0".repeat(64);
    const bytes = JSON.stringify(doc);
    expect(() => buildOrdinaryProfileLifecycle(request("RENEW", input({ policy_revision: "TEST_ONLY-r2",
      valid_from_ms: FROM + TERM }), sha(bytes)), bytes))
      .toThrowError(new OrdinaryProfileLifecycleError("ORDINARY_PROFILE_CURRENT_INVALID"));
  });
});

describe("offline lifecycle CLI/operator", () => {
  function ioFor(next: AccessProfileBuildInput = input(), old = current()) {
    const read = vi.fn(async (path: string) => path === "/input.json" ? JSON.stringify(next) : old.bytes);
    const writeNew = vi.fn(async (_path: string, _bytes: string) => undefined);
    const io: OrdinaryProfileLifecycleIo = { read, writeNew };
    return { io, read, writeNew, old };
  }
  it("writes one deterministic existing-format artifact, with no apply/DB/source claims", async () => {
    const x = ioFor();
    const result = await runOrdinaryProfileLifecycle(["--operation", "BOOTSTRAP", "--input", "/input.json", "--out", "/new.json"], x.io);
    expect(x.writeNew).toHaveBeenCalledExactlyOnceWith("/new.json", current().bytes);
    expect(result).toMatchObject({ installed: false, database_checked: false, source_checked: false,
      delegation_performed: false, predecessor_sha256: null, artifact_sha256: current().sha256 });
  });
  it("checks current bytes and the independent SHA before writing a renewal", async () => {
    const x = ioFor(input({ policy_revision: "TEST_ONLY-r2", valid_from_ms: FROM + TERM }));
    const args = ["--operation", "RENEW", "--input", "/input.json", "--out", "/new.json", "--current", "/old.json", "--current-sha256", x.old.sha256];
    const result = await runOrdinaryProfileLifecycle(args, x.io);
    expect(result.predecessor_sha256).toBe(x.old.sha256);
    expect(x.writeNew).toHaveBeenCalledTimes(1);
    x.writeNew.mockClear();
    await expect(runOrdinaryProfileLifecycle([...args.slice(0, -1), "0".repeat(64)], x.io)).rejects.toThrowError(OrdinaryProfileLifecycleError);
    expect(x.writeNew).not.toHaveBeenCalled();
  });
  it.each([
    ["--operation", "RENEW", "--input", "/input.json", "--out", "/new.json"],
    ["--operation", "BOOTSTRAP", "--input", "/input.json", "--out", "/input.json"],
    ["--operation", "BOOTSTRAP", "--input", "relative.json", "--out", "/new.json"],
    ["--operation", "BOOTSTRAP", "--input", "/input.json", "--out", "/new.json", "--apply", "true"],
  ].map(argv => ({ argv })))("refuses malformed/apply/path-alias arguments $argv", ({ argv }) => {
    expect(() => parseOrdinaryProfileLifecycleArgs(argv)).toThrow();
  });
  it("does not overwrite on write refusal and only exposes fixed failure codes", async () => {
    const x = ioFor();
    x.writeNew.mockRejectedValue(new Error("PRIVATE_PATH_SECRET"));
    const error = await runOrdinaryProfileLifecycle(["--operation", "BOOTSTRAP", "--input", "/input.json", "--out", "/new.json"], x.io)
      .then(() => null, error => error);
    expect(ordinaryProfileLifecycleFailure(error)).toEqual({ code: "ORDINARY_PROFILE_IO", exitCode: 1 });
    expect(ordinaryProfileLifecycleFailure(new Error("SECRET"))).toEqual({ code: "ORDINARY_PROFILE_FAILED", exitCode: 1 });
  });
  it("rechecks bounds even for injected IO and never writes oversized authoring input", async () => {
    const x = ioFor(); x.read.mockResolvedValue(" ".repeat(65_537));
    await expect(runOrdinaryProfileLifecycle(["--operation", "BOOTSTRAP", "--input", "/input.json", "--out", "/new.json"], x.io)).rejects.toThrow();
    expect(x.writeNew).not.toHaveBeenCalled();
  });
});
