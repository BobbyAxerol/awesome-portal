/** Drives the REAL ScopedManagerReader (real ExecutionReadScopes, real cursor codec, real access evaluation) from a plain TEST_ONLY source
 * world. Only the I/O edges are doubles: the identity SQL row, the access context/publication readers and the profile snapshot store.
 * No database, no source, no network. Used by the RV-12 scenario spec; it does not qualify any production publication or policy. */
import { vi } from "vitest";
import type { Pool } from "pg";
import type { AuthSession, PortalUser } from "../src/domain";
import { type AccessEvaluationContext, type AccessRelations } from "../src/execution-v2/access-policy";
import { accessDigest } from "../src/execution-v2/access-policy";
import { AccessPolicyError, type AccessResource, type ReviewedAccessPolicy, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import type { ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import type { ExecutionProfileProjectionRepository, ProfileProjectionSnapshot } from "../src/execution/profile-projection.repository";
import { ScopedManagerReader } from "../src/manager-lists/scoped-manager.reader";
import { testConfig } from "./harness";

export type Env = "paper" | "sandbox" | "live";
export type World = any;
export interface Options {
  principal: "OWNER" | "RESEARCHER";
  /** Environments where the actor holds a grant. Default: all three. */
  granted?: Env[];
  /** Environments with no recorded profile snapshot. */
  unrecorded?: Env[];
  /** Environments whose reviewed policy is still PENDING when the actor is authorized (a typed 403 EXECUTION_READ_POLICY_PENDING). */
  policyPending?: Env[];
  /** Environments where the access layer fails (not a typed policy answer). */
  accessFails?: Env[];
  /** Researcher field whitelist override (default: every business read field). */
  researcherFields?: string[];
  /** After this many publication reads the actor's authority changes (a revoke between the read and the fence). */
  revokeAfterPublicationReads?: number;
  /** Replace the snapshot digest after this many metadata reads (the source moved while paging). */
  moveSourceAfterMetadataReads?: number;
  /** Source revision letter used in every recorded snapshot digest (default: the environment's first letter). A new letter is a new source. */
  sourceRevision?: string;
}

const NOW = 1_790_812_800_000, USER = "TEST_ONLY-actor", OWNER = "TEST_ONLY-owner";
const POLICY_REVISION = "TEST_ONLY-policy";

export function makeReader(world: World, options: Options, workspaceId = world.workspace_id) {
  const config = testConfig({ FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
    EXECUTION_READ_PROFILE: "retained_review_v1", AUTH_MODE: "dev", EXECUTION_DATABASE_URL: "postgres://portal:portal@127.0.0.1:5432/execution_test_only",
    EXECUTION_EDGE_PAPER_PROFILE_ID: world.profiles.paper, EXECUTION_EDGE_SANDBOX_PROFILE_ID: world.profiles.sandbox,
    EXECUTION_EDGE_LIVE_PROFILE_ID: world.profiles.live,
    QUERY_CURSOR_ACTIVE_KEY_ID: "testonly-k1", QUERY_CURSOR_KEYS_JSON: JSON.stringify({ "testonly-k1": "TEST_ONLY-cursor-key-0123456789abcdef-0123456789" }) });
  const user = { userId: USER, username: USER, displayName: USER, role: "USER", status: "ACTIVE", sessionVersion: 1, mustChangePassword: false,
    failedLoginCount: 0, lockedUntil: null, createdAt: new Date(NOW), updatedAt: new Date(NOW), disabledAt: null, archivedAt: null, accountRevision: 1 } as PortalUser;
  const session: AuthSession = { sessionId: "TEST_ONLY-session", userId: USER, state: "ACTIVE", sessionVersion: 1,
    authenticationTime: new Date(NOW), idleExpiresAt: new Date(NOW + 60_000), absoluteExpiresAt: new Date(NOW + 3_600_000) };
  const principal = { user, session, workspaceId: world.workspace_id };

  const lineage = (t: any): AccessResource[] => [{ kind: "ALPHA", id: t.alpha_id }, { kind: "ALPHA_VERSION", id: t.alpha_version_id },
    { kind: "PORTFOLIO", id: t.portfolio_id }, { kind: "DEPLOYMENT", id: t.deployment_id }, { kind: "ACCOUNT", id: t.account_id }];
  const resources: AccessResource[] = [...new Map([...world.tuples.flatMap(lineage),
    ...world.bindings.map((b: any) => ({ kind: "BINDING" as const, id: b.binding_id }))].map((r: AccessResource) => [JSON.stringify(r), r])).values()];
  const policyFields = options.researcherFields ?? [...BUSINESS_READ_FIELDS];
  const policy: ReviewedAccessPolicy = { workspace_id: world.workspace_id, revision: POLICY_REVISION, artifact_digest: accessDigest(["scoped-fixtures"]),
    approval_ref: "TEST_ONLY-NOT-OWNER-APPROVAL", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: OWNER,
    researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-fields-r1", fields: policyFields } };
  const membership = { revision: "TEST_ONLY-membership", receipt_id: "TEST_ONLY-receipt", mapping_revision: "TEST_ONLY-mapping" };
  const relations: AccessRelations = { qualified: true, revision: "TEST_ONLY-relations", own_alpha_ids: world.researcher.own_alpha_ids,
    member_portfolio_ids: world.researcher.member_portfolio_ids, roots: { root: resources }, membership };
  const granted = options.granted ?? ["paper", "sandbox", "live"];
  const grant = (action: ScopedAccessGrant["action"], selector: ScopedAccessGrant["selector"]): ScopedAccessGrant => ({
    grant_id: `TEST_ONLY-${action}`, subject_user_id: USER, workspace_id: world.workspace_id, action, effect: "ALLOW", selector, environments: granted,
    valid_from_ms: NOW - 1000, valid_until_ms: NOW + 3_600_000, delegable_actions: [], issued_by: OWNER, parent_grant_id: null, revision: "TEST_ONLY-grant-r1",
    policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: policy.researcher_fields.policy_ref,
    ts_receipt: { ...membership, membership_revision: membership.revision, effective_at_ms: NOW - 1000, expires_at_ms: NOW + 3_600_000 } });
  // authorize() reads the context once per environment right after that environment's snapshot metadata; the first compose-phase snapshot
  // read ends that phase, so a PENDING policy applies to the authorization of exactly one environment.
  let authorizing: Env | null = null, composing = false;
  const pendingPolicy = { ...policy, state: "PENDING" as const };
  const context = (): AccessEvaluationContext => ({ principal_id: USER, workspace_id: world.workspace_id, now_ms: NOW, actor_current: true, actor_role: "USER",
    allow_test_only: true, authority_fingerprint: "TEST_ONLY-db-r1",
    policy: authorizing && options.policyPending?.includes(authorizing) ? pendingPolicy : policy, active_principals: new Set([USER, OWNER]), relationsFor: () => relations,
    grants: options.principal === "OWNER" ? [grant("business.read_all", { kind: "ROOT_SCOPE", root_id: "root" })] : [
      grant("alpha.read", { kind: "OWN_ALPHA" }),
      grant("portfolio.read_restricted", { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [...relations.member_portfolio_ids] }),
      grant("binding.read", { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "BINDING", ids: world.bindings.map((b: any) => b.binding_id) })] });

  let publicationReads = 0;
  const publish = (request: ExecutionReadPublicationRequest) => {
    const environment = request.environment as Env;
    if (options.policyPending?.includes(environment)) throw new AccessPolicyError("POLICY_PENDING");
    if (options.accessFails?.includes(environment)) throw new Error("TEST_ONLY access layer failure");
    publicationReads++;
    const revoked = options.revokeAfterPublicationReads !== undefined && publicationReads > options.revokeAfterPublicationReads;
    return { ...request, qualification: "TEST_ONLY", publication_revision: revoked ? "TEST_ONLY-publication-r2" : "TEST_ONLY-publication",
      population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY-no-source-proof", resources, tuples: world.tuples,
      current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-links", provenance_ref: "TEST_ONLY-links",
        pairs: world.tuples.map((t: any) => ({ alpha_id: t.alpha_id, portfolio_id: t.portfolio_id })) },
      strategy_lineage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-strategies", provenance_ref: "TEST_ONLY-strategies", pairs: world.strategy_pairs },
      binding_lineage: world.bindings.length ? { qualification: "TEST_ONLY", revision: "TEST_ONLY-bindings", provenance_ref: "TEST_ONLY-bindings", bindings: world.bindings } : null };
  };
  const access = { hasNativeCurrentRelations: () => false,
    readContext: vi.fn(async () => context()), confirmReadContext: vi.fn(async () => context()), readPublication: vi.fn(async (request: ExecutionReadPublicationRequest) => publish(request)) };
  const pool = { query: vi.fn(async () => ({ rows: [{ role: "USER", session_version: 1, policy, policy_revision: policy.revision, policy_seen: true,
    workspace_exists: true, member: true, owner: false, retained: [] }] })) };
  const scopes = new ExecutionReadScopes(pool as unknown as Pool, access as unknown as ExecutionAccessService, config);

  const snapshots = new Map<string, ProfileProjectionSnapshot>();
  for (const environment of ["paper", "sandbox", "live"] as Env[]) {
    const rows = world.relations[environment];
    if (!rows || options.unrecorded?.includes(environment)) continue;
    const profileId = world.profiles[environment];
    const relation = (name: string, items: Record<string, unknown>[]) => ({ relation: name, availability: "AVAILABLE", completeness: "COMPLETE", reason_code: null,
      as_of: new Date(NOW).toISOString(), items: items.map(fields => ({ lineage: { workspace_id: world.workspace_id, profile_id: profileId, source_contract_revision: "TEST_ONLY" }, fields })) });
    snapshots.set(environment, { workspaceId: world.workspace_id, environment, profileId, payloadDigest: `sha256:${(options.sourceRevision ?? environment.charAt(0)).repeat(64)}`,
      projectionEpoch: "epoch-1", projectionSequence: 1, sourceCatalogueSha256: `sha256:${"b".repeat(64)}`, receivedAt: new Date(NOW), lastSuccessfulRefreshAt: new Date(NOW),
      document: { workspace_id: world.workspace_id, environment, profile_id: profileId, source_contract_revision: "TEST_ONLY-contract", relations: Object.fromEntries(
        Object.entries(rows).map(([name, items]) => [`manager.${name}:${name}`, relation(name, items as Record<string, unknown>[])])) } } as unknown as ProfileProjectionSnapshot);
  }
  const profileEnvironment = (profile: string) => (Object.entries(world.profiles).find(([, id]) => id === profile)?.[0]) as Env;
  let metadataReads = 0;
  const metadata = (snapshot: ProfileProjectionSnapshot | undefined) => {
    if (!snapshot) return null;
    metadataReads++;
    const moved = options.moveSourceAfterMetadataReads !== undefined && metadataReads > options.moveSourceAfterMetadataReads;
    return moved ? { ...snapshot, payloadDigest: `sha256:${"e".repeat(64)}` } : snapshot;
  };
  const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  const repository = {
    snapshotMetadata: vi.fn(async (_workspace: string, _env: string, profile: string) => {
      const environment = profileEnvironment(profile);
      if (!composing) authorizing = environment;
      return metadata(snapshots.get(environment));
    }),
    snapshot: vi.fn(async (_workspace: string, _env: string, profile: string) => {
      composing = true; authorizing = null; return snapshots.get(profileEnvironment(profile)) ?? null;
    }),
    pool: { connect: vi.fn(async () => client) },
  };
  const reader = new ScopedManagerReader(repository as unknown as ExecutionProfileProjectionRepository, scopes, config);
  return { reader, principal, config, access, scopes };
}
