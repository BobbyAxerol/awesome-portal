/** Finite account-policy authorization regressions.
 * Actual scope issuer + product reader, synthetic authority/publication/stored
 * snapshot via shared fixture. No spec imports, PostgreSQL/runtime/source claim. */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";
import { querySigningKeys } from "../src/config";
import { accessDigest, canonicalSelector } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest } from "../src/execution-v2/access-current-relations";
import { tsMembershipAcceptance, type AccessResource, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { scopeReadPopulation, scopeResources } from "../src/execution-v2/read-scope";
import { NAMED_RETAINED_PURPOSES, retainedRelationAction } from "../src/execution/retained-operation-page";
import { namedRetainedBusinessFields, namedRetainedBusinessResourceId } from "../src/execution/retained-business-aliases";
import type { ProjectionScalar } from "../src/execution/profile-projection.repository";

type F = ReturnType<typeof productReadFixture>;
type Env = "paper" | "sandbox" | "live";
const ENV = ["paper", "sandbox", "live"] as const;
const SOURCE = "manager.current.account-policies", RELATION = "account_policies", KEY = `${SOURCE}:${RELATION}`;
const TIME = "2026-10-17T00:00:00.000Z", PK = "TEST_ONLY-PRIVATE-policy-id";
const PUBLIC = ["account_id", "mode", "venue", "created_at", "updated_at"];
const FIELDS = ["account_id", "environment", "venue", "created_at", "updated_at"];
const profile = (f: F, env: Env) => (env === "paper" ? f.config.EXECUTION_EDGE_PAPER_PROFILE_ID :
  env === "sandbox" ? f.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : f.config.EXECUTION_EDGE_LIVE_PROFILE_ID)!;
const accountGrant = (f: F) => f.context.grants.find(g => g.action === "account.read" && g.effect === "ALLOW")!;
const row = (id = PK, account = PRIVATE.account_id, mode: ProjectionScalar = "paper") => ({
  account_policy_id: id, account_id: account, mode, venue: "BINANCE_USDM", created_at: TIME, updated_at: TIME,
  maker_fee_bps: "123", default_leverage: "99", maintenance_margin_rate: "0.7", allow_borrowing: true,
  loan_package_id: "TEST_ONLY-PRIVATE-loan", raw_secret_token: "TEST_ONLY-NEVER-PUBLISH",
});
function set(f: F, rows: Record<string, ProjectionScalar>[], env: Env = "paper") {
  f.snapshot.environment = env; f.snapshot.profileId = profile(f, env);
  f.snapshot.document.environment = env; f.snapshot.document.profile_id = profile(f, env);
  f.snapshot.document.relations[KEY] = { source_id: SOURCE, relation: RELATION,
    availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", reason_code: null, as_of: TIME,
    items: rows.map(fields => ({ fields, lineage: { workspace_id: f.principal.workspaceId,
      profile_id: profile(f, env), source_contract_revision: "TEST_ONLY-contract" } })),
  };
}
function fixture(env: Env = "paper", options: { fields?: string[]; legacy?: boolean; linked?: boolean } = {}) {
  const f = productReadFixture({ fields: options.fields ?? FIELDS, legacy: options.legacy });
  const g = { ...accountGrant(f), environments: [env] };
  f.context.grants = [g];
  const relations = f.context.relationsFor(f.principal.user.userId);
  f.context.relationsFor = () => ({ ...relations, own_alpha_ids: [], member_portfolio_ids: [] });
  const original = f.access.readPublication.getMockImplementation()!;
  // The shared fixture's mock infers non-null lineage; its production input
  // schema explicitly permits null. Only the synthetic mock needs this cast.
  f.access.readPublication.mockImplementation(async request => ({ ...await original(request),
    ...(options.linked ? {} : { current_linkage: null as never }), strategy_lineage: null as never }));
  set(f, [row(PK, PRIVATE.account_id, env)], env); return f;
}
function run(f: F, query: { limit?: number; cursor?: string; environment?: Env } = {}) {
  return f.maximum.relationPage(f.principal, "account-policies", { environment: "paper", limit: 20, ...query });
}
function scope(f: F, env: Env = "paper", resource?: AccessResource) {
  return f.scopes.authorize(f.principal, { environment: env, profileId: profile(f, env) }, {
    action: "account.read", ...(resource ? { resource } : {}), dataset: { dataset_id: `relation:${KEY}`,
      source_revision: f.snapshot.payloadDigest, projection_generation: f.snapshot.projectionEpoch,
      catalogue_revision: f.snapshot.sourceCatalogueSha256, window: null },
  });
}
/** Synthetic versioned accepted fact + exact per-resource/environment leg.
 * Never installed as a current provider, real receipt or owner field policy. */
function versioned(f: F) {
  const g = accountGrant(f), receipt = g.ts_receipt!;
  const fact = tsMembershipAcceptance.parse({ source: "TEST_ONLY-PM", source_contract: "TEST_ONLY-contract",
    trust_profile: "TEST_ONLY-profile", receipt_id: receipt.receipt_id, proposal_id: "TEST_ONLY-proposal",
    proposal_digest: accessDigest("TEST_ONLY-proposal"), portal_user_id: g.subject_user_id, ts_user_id: "TEST_ONLY-ts-user",
    mapping_revision: receipt.mapping_revision, human_requester_user_id: g.issued_by, workspace_id: g.workspace_id,
    action: g.action, selector_digest: accessDigest(canonicalSelector(g.selector)), environments: g.environments,
    previous_membership_revision: null, membership_revision: receipt.membership_revision,
    effective_at_ms: receipt.effective_at_ms, expires_at_ms: receipt.expires_at_ms, outcome: "ACCEPTED",
    payload_digest: accessDigest("TEST_ONLY-payload"), provenance_ref: "TEST_ONLY-NOT-SOURCE-AUTHORITY" });
  g.ts_acceptance_digest = accessDigest(fact);
  const authority = currentAccessRelations.parse({ schema_version: "pma.core-current-relations.v1",
    subject_user_id: g.subject_user_id, workspace_id: g.workspace_id, ts_user_id: fact.ts_user_id,
    mapping_revision: receipt.mapping_revision, resources: ENV.map(environment => ({ environment,
      revision: "TEST_ONLY-cut", own_alpha_ids: [], member_portfolio_ids: [], roots: [] })),
    grants: [{ grant_id: g.grant_id, binding_digest: grantBindingDigest(g), accepted: fact,
      targets: g.environments.map(environment => ({ environment, resource: { kind: "ACCOUNT", id: PRIVATE.account_id },
        revision: "TEST_ONLY-account-leg", native_reference_digest: accessDigest(["TEST_ONLY-native", environment]),
        valid_from_ms: f.context.now_ms - 100, valid_until_ms: f.context.now_ms + 5000 })) }],
  });
  const previous = f.context.relationsFor(g.subject_user_id);
  f.context.relationsFor = () => ({ ...previous, current_authority: authority }); return authority;
}
function deny(f: F, resource: AccessResource) {
  const { ts_acceptance_digest: _digest, ...g } = accountGrant(f);
  const action = resource.kind === "ACCOUNT" ? "account.read" : "alpha.read";
  f.context.grants = [...f.context.grants, { ...g, grant_id: `TEST_ONLY-deny-${resource.kind}`, action, effect: "DENY",
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: resource.kind, ids: [resource.id] },
    requires_ts_acceptance: false, ts_receipt: null }];
}
async function refusal(promise: Promise<unknown>, status: number, code: string) {
  let caught: unknown; try { await promise; } catch (error) { caught = error; }
  expect(caught).toMatchObject({ status, code });
  expect(String((caught as Error | undefined)?.message)).not.toMatch(/PRIVATE-policy|PRIVATE-loan|NEVER-PUBLISH|maker_fee|SECRET/);
}

describe("ELP2-04 finite account-policy reader / synthetic authority", () => {
  it("commissions only account.read and five public metadata fields, never the private source PK", () => {
    expect(NAMED_RETAINED_PURPOSES.account_policies).toBe("account.read");
    expect(retainedRelationAction(RELATION)).toBe("account.read");
    expect(namedRetainedBusinessFields(RELATION)).toEqual(PUBLIC);
    expect(Object.values(NAMED_RETAINED_PURPOSES).filter(purpose => purpose === null)).toHaveLength(26);
  });
  it.each(ENV)("exact standalone account authority serves %s without own/member/current-linkage", async env => {
    const f = fixture(env), authority = versioned(f);
    const collection = await scope(f, env), detail = await scope(f, env, { kind: "ACCOUNT", id: PRIVATE.account_id });
    for (const minted of [collection, detail]) {
      expect(minted).toMatchObject({ mode: "SCOPED_V2", wholePopulation: false, fieldPolicyRef: "TEST_ONLY-fields-r1" });
      expect(scopeReadPopulation(minted).allowedTuples).toEqual([PRIVATE]);
      expect(scopeResources(minted)).toEqual([{ kind: "ACCOUNT", id: PRIVATE.account_id }]);
    }
    const value = await run(f, { environment: env });
    expect(value.records).toHaveLength(1); expect(value.records[0].values).toEqual({ account_id: PRIVATE.account_id,
      mode: env, venue: "BINANCE_USDM", created_at: Date.parse(TIME), updated_at: Date.parse(TIME) });
    expect(value).toMatchObject({ environment: env, profile_id: profile(f, env), state: "PARTIAL", coverage: "AUTHORIZED_ONLY",
      source_health: { freshness: "STALE", completeness: "PARTIAL", as_of_ms: null, replay_eligible: false },
      page: { maximum_page_rows: 200, maximum_response_bytes: 1048576, total_unknown: true, truncated: false } });
    authority.grants[0].targets = []; // original receipt remains; current native leg does not.
    await refusal(scope(f, env, { kind: "ACCOUNT", id: PRIVATE.account_id }), 404, "EXECUTION_READ_NOT_AVAILABLE");
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    expect(f.upstream.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it.each(ENV)("accepts source-preserved uppercase %s mode, without normalizing the public value", async env => {
    const f = fixture(env); set(f, [row(PK, PRIVATE.account_id, env.toUpperCase())], env);
    expect((await run(f, { environment: env })).records[0].values.mode).toBe(env.toUpperCase());
  });
  it("account permission selects its exact tuple, not a peer's account or a physical/economic census", async () => {
    const f = fixture(); set(f, [row(), row("TEST_ONLY-SECRET-peer", OWN.account_id)]);
    expect((await run(f)).records.map(record => record.values.account_id)).toEqual([PRIVATE.account_id]);
    await refusal(scope(f, "paper", { kind: "ACCOUNT", id: OWN.account_id }), 404, "EXECUTION_READ_NOT_AVAILABLE");
    expect(JSON.stringify(await run(f))).not.toMatch(/SECRET|PRIVATE-policy|PRIVATE-loan|NEVER-PUBLISH|maker_fee|leverage|margin|borrowing/);
  });
  it("the shared scope correction also serves an existing finite account-sync reader without Alpha/Portfolio grants", async () => {
    const f = fixture("paper", { fields: ["account_id", "environment", "currency", "status", "updated_at"] });
    f.snapshot.document.relations["manager.current.account-sync-current-state:account_sync_current_state"] = {
      source_id: "manager.current.account-sync-current-state", relation: "account_sync_current_state",
      availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", reason_code: null, as_of: TIME,
      items: [{ fields: { account_id: PRIVATE.account_id, mode: "paper", currency: "USDT", status: "READY",
        updated_at: TIME, buying_power: "TEST_ONLY-NEVER-PUBLISH" } }],
    } as typeof f.snapshot.document.relations[string];
    const value = await f.maximum.relationPage(f.principal, "account-sync-current-state", { environment: "paper", limit: 20 });
    expect(value.records).toHaveLength(1);
    expect(value.records[0].values).toEqual({ account_id: PRIVATE.account_id, mode: "paper", currency: "USDT",
      status: "READY", updated_at: Date.parse(TIME) });
    expect(JSON.stringify(value)).not.toContain("buying_power");
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("preserves genuine full-business positive while retaining the new finite metadata ceiling", async () => {
    const f = productReadFixture({ full: true }); set(f, [row(), row("TEST_ONLY-shared", OWN.account_id)]);
    expect((await scope(f)).wholePopulation).toBe(true);
    const value = await run(f); expect(value.records).toHaveLength(2);
    for (const record of value.records) expect(Object.keys(record.values).sort()).toEqual([...PUBLIC].sort());
    expect(JSON.stringify(value)).not.toMatch(/maker_fee|PRIVATE-policy|leverage|margin|borrowing/);
  });
  it.each(["none", "ownership-only", "deny", "wrong-account", "wrong-env", "stale-receipt", "app-only", "revoked", "expired", "suspended"] as const)(
    "does not turn %s into account authority", async fault => {
      const f = fixture("paper", { linked: true }), g = accountGrant(f);
      if (fault === "none") f.context.grants = [];
      if (fault === "ownership-only") { const old = productReadFixture(); f.context.grants = old.context.grants.filter(x => x.action !== "account.read"); }
      if (fault === "deny") deny(f, { kind: "ACCOUNT", id: PRIVATE.account_id });
      if (fault === "wrong-account") g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [OWN.account_id] };
      if (fault === "wrong-env") g.environments = ["live"];
      if (fault === "stale-receipt") g.ts_receipt = { ...g.ts_receipt!, membership_revision: "TEST_ONLY-stale" };
      if (fault === "app-only") { g.requires_ts_acceptance = false; g.ts_receipt = null; }
      if (fault === "revoked") g.revoked_at_ms = f.context.now_ms - 1;
      if (fault === "expired") g.valid_until_ms = f.context.now_ms;
      if (fault === "suspended") f.context.active_principals = new Set([f.context.policy!.protected_owner_user_id]);
      // An existing qualified linkage avoids conflating missing current link
      // proof (503) with an actual current authority denial (404).
      if (fault === "wrong-account") await refusal(scope(f, "paper", { kind: "ACCOUNT", id: PRIVATE.account_id }), 404, "EXECUTION_READ_NOT_AVAILABLE");
      else await refusal(run(f), 404, "EXECUTION_READ_NOT_AVAILABLE");
    });
  it.each(["revoked-parent", "suspended-issuer", "ancestor-deny"] as const)("rechecks delegated %s", async fault => {
    const f = fixture("paper", { linked: true }), g = accountGrant(f), issuer = "TEST_ONLY-delegator";
    const parent: ScopedAccessGrant = { ...g, grant_id: "TEST_ONLY-account-ceiling", subject_user_id: issuer,
      action: "access.grant", delegable_actions: ["account.read"], requires_ts_acceptance: false, ts_receipt: null };
    const child = { ...g, issued_by: issuer, parent_grant_id: parent.grant_id };
    f.context.active_principals = new Set([...f.context.active_principals, issuer]);
    f.context.grants = [parent, child]; expect((await run(f)).records).toHaveLength(1);
    if (fault === "revoked-parent") parent.revoked_at_ms = f.context.now_ms;
    if (fault === "suspended-issuer") f.context.active_principals = new Set([...f.context.active_principals].filter(id => id !== issuer));
    if (fault === "ancestor-deny") f.context.grants = [...f.context.grants, { ...parent,
      grant_id: "TEST_ONLY-delegation-deny", effect: "DENY", delegable_actions: [] }];
    await refusal(run(f), 404, "EXECUTION_READ_NOT_AVAILABLE");
  });
  it.each(["ALPHA", "ALPHA_VERSION", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT"] as const)(
    "one current denied matching %s withholds the entire shared-account row", async kind => {
      const f = fixture("paper", { linked: true }), g = accountGrant(f);
      g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [OWN.account_id, PRIVATE.account_id] };
      set(f, [row(), row("TEST_ONLY-SECRET-shared", OWN.account_id)]);
      expect((await run(f)).records).toHaveLength(2);
      const id = ({ ALPHA: PEER.alpha_id, ALPHA_VERSION: PEER.alpha_version_id, PORTFOLIO: PEER.portfolio_id,
        DEPLOYMENT: PEER.deployment_id, ACCOUNT: PEER.account_id })[kind];
      deny(f, { kind, id }); const hidden = await run(f);
      set(f, [row()]); expect(hidden).toEqual(await run(f)); expect(hidden.records).toHaveLength(1);
    });
  it("reviewed fields are intersected; policy pending never means grant every metadata field", async () => {
    const f = fixture("paper", { fields: ["account_id", "created_at"] });
    expect((await run(f)).records[0].values).toEqual({ account_id: PRIVATE.account_id, created_at: Date.parse(TIME) });
    f.context.policy!.researcher_fields.state = "PENDING";
    await refusal(run(f), 503, "EXECUTION_READ_FIELD_POLICY_PENDING");
  });
  it.each(["empty", "account-only"] as const)("does not invent correlated tuples for a %s publication", async shape => {
    const f = fixture(), original = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => ({ ...await original(request), tuples: [],
      resources: shape === "empty" ? [] : [{ kind: "ACCOUNT" as const, id: PRIVATE.account_id }] }));
    await refusal(run(f), shape === "empty" ? 404 : 503,
      shape === "empty" ? "EXECUTION_READ_NOT_AVAILABLE" : "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
  });
  it.each(["mode", "venue"] as const)("missing/null %s remains source absence, not a request-derived default", async field => {
    const f = fixture(); const explicit = { ...row(), [field]: null }; set(f, [explicit]);
    expect((await run(f)).records[0].values[field]).toBeNull();
    const missing: Record<string, ProjectionScalar> = row(); delete missing[field]; set(f, [missing]);
    expect((await run(f)).records[0].values).not.toHaveProperty(field);
  });
  it.each(["missing", "unavailable"] as const)("%s retained source stays empty/partial without old payload or a new source call", async absence => {
    const f = fixture(); expect((await run(f)).records).toHaveLength(1);
    if (absence === "missing") delete f.snapshot.document.relations[KEY];
    else f.snapshot.document.relations[KEY].availability = "UNAVAILABLE";
    expect(await run(f)).toMatchObject({ records: [], state: "PARTIAL",
      source_health: { availability: "UNAVAILABLE", freshness: "STALE", completeness: "PARTIAL", as_of_ms: null } });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it.each(["mode-empty", "mode-number", "mode-wrong-env", "timestamp", "venue-object", "pk-null", "pk-control", "duplicate"] as const)(
    "refuses visible %s safely while the same hidden corruption is indistinguishable from empty", async fault => {
      const f = fixture(), malformed: Record<string, ProjectionScalar> = row();
      if (fault === "mode-empty") malformed.mode = "";
      if (fault === "mode-number") malformed.mode = 7;
      if (fault === "mode-wrong-env") malformed.mode = "live";
      if (fault === "timestamp") malformed.created_at = "TEST_ONLY-SECRET-not-a-clock";
      if (fault === "venue-object") malformed.venue = { nested: "TEST_ONLY-SECRET" } as never;
      if (fault === "pk-null") malformed.account_policy_id = null;
      if (fault === "pk-control") malformed.account_policy_id = "TEST_ONLY-SECRET\u0000";
      set(f, fault === "duplicate" ? [malformed, { ...malformed, venue: "OTHER" }] : [malformed]);
      const code = fault.startsWith("mode-") || fault === "duplicate" ? "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED"
        : fault === "pk-null" ? "EXECUTION_READ_FIELD_POLICY_PENDING" : "UDB_RETAINED_SCALAR_CONTRACT_REJECTED";
      await refusal(run(f), 503, code);
      set(f, fault === "duplicate" ? [{ ...malformed, account_id: OWN.account_id }, { ...malformed, account_id: OWN.account_id }]
        : [{ ...malformed, account_id: OWN.account_id }]);
      const hidden = await run(f); set(f, []); expect(hidden).toEqual(await run(f));
    });
  it.each([false, true])("only the exact registered source is accepted (legacy=%s)", async legacy => {
    const f = fixture("paper", { legacy });
    f.snapshot.document.relations[KEY].source_id = "manager.accounts";
    await refusal(run(f), 503, "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    f.snapshot.document.relations[KEY].source_id = SOURCE;
    if (!legacy) { f.snapshot.document.relations["forged:account_policies"] = f.snapshot.document.relations[KEY];
      await refusal(run(f), 503, "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED"); }
  });
  it.each([false, true])("uses keyed private PK and the same finite ceiling in retained legacy=%s", async legacy => {
    const f = fixture("paper", { legacy }), value = await run(f), record = value.records[0];
    expect(Object.keys(record.values).sort()).toEqual([...PUBLIC].sort());
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE-policy|PRIVATE-loan|NEVER-PUBLISH|maker_fee|leverage|margin|borrowing/);
    const identity = [`account_policy_id\u0000${PK}`];
    expect(record.resource_id).toBe(namedRetainedBusinessResourceId(querySigningKeys(f.config)[f.config.QUERY_CURSOR_ACTIVE_KEY_ID],
      f.principal.workspaceId, "paper", profile(f, "paper"), value.logical_operation_id, identity));
    expect(record.resource_id).not.toBe(`por1_${createHash("sha256")
      .update(`${value.logical_operation_id}\u0000${identity.join("\u0001")}`).digest("hex")}`);
    if (legacy) expect(value).not.toHaveProperty("read_scope");
  });
  it.each([false, true])("key rotation changes IDs and invalidates old cursors in retained legacy=%s", async legacy => {
    const f = fixture("paper", { legacy }); set(f, [row("one"), row("two")]);
    const oldKey = f.config.QUERY_CURSOR_ACTIVE_KEY_ID, old = await run(f, { limit: 1 });
    f.config.QUERY_CURSOR_KEYS_JSON = JSON.stringify({ ...querySigningKeys(f.config),
      "TEST_ONLY-rotated": "TEST_ONLY-rotated-query-signing-key-32-bytes-minimum" });
    f.config.QUERY_CURSOR_ACTIVE_KEY_ID = "TEST_ONLY-rotated";
    expect(querySigningKeys(f.config)[oldKey]).toEqual(expect.any(String));
    expect((await run(f, { limit: 1 })).records[0].resource_id).not.toBe(old.records[0].resource_id);
    await refusal(run(f, { limit: 1, cursor: old.page.next_cursor! }), 400, "UDB_RETAINED_CURSOR_INVALID_OR_STALE");
  });
  it.each(["actor", "session", "limit", "epoch", "catalogue", "publication"] as const)("cursor is bound to %s", async dimension => {
    const f = fixture(); set(f, [row("one"), row("two")]); const first = await run(f, { limit: 1 });
    if (dimension === "actor") { const id = "TEST_ONLY-other-reader";
      f.principal.user.userId = id; f.principal.session.userId = id; f.context.principal_id = id;
      accountGrant(f).subject_user_id = id; f.context.active_principals = new Set([...f.context.active_principals, id]); }
    if (dimension === "session") f.principal.session.sessionId = "TEST_ONLY-other-session";
    if (dimension === "epoch") f.snapshot.projectionEpoch = "TEST_ONLY-other-epoch";
    if (dimension === "catalogue") f.snapshot.sourceCatalogueSha256 = `sha256:${"f".repeat(64)}`;
    if (dimension === "publication") { const previous = f.access.readPublication.getMockImplementation()!;
      f.access.readPublication.mockImplementation(async request => ({ ...await previous(request), publication_revision: "TEST_ONLY-r2" })); }
    await refusal(run(f, { limit: dimension === "limit" ? 2 : 1, cursor: first.page.next_cursor! }),
      400, "UDB_RETAINED_CURSOR_INVALID_OR_STALE");
  });
  it("revoked cursor and final metadata-await revoke cannot return rows or use upstream fallback", async () => {
    const f = fixture("paper", { linked: true }); set(f, [row("one"), row("two")]);
    const first = await run(f, { limit: 1 }); f.context.grants = [];
    await refusal(run(f, { limit: 1, cursor: first.page.next_cursor! }), 404, "EXECUTION_READ_NOT_AVAILABLE");
    const active = fixture("paper", { linked: true }); let reads = 0;
    active.repository.snapshotMetadata.mockImplementation(async () => {
      if (++reads === 3) { active.context.grants = []; active.context.authority_fingerprint = "TEST_ONLY-revoked"; }
      return active.snapshot;
    });
    await refusal(run(active), 404, "EXECUTION_READ_NOT_AVAILABLE");
    expect(active.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    expect(active.upstream.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("does not borrow a different workspace's retained snapshot", async () => {
    const f = fixture(); f.principal.workspaceId = "TEST_ONLY-other-workspace";
    await refusal(run(f), 404, "EXECUTION_READ_NOT_AVAILABLE"); expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
});
