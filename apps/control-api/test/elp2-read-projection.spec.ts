/** ELP2-04 partial-grain JSON scoping. The capability is always minted by the
 * actual ExecutionReadScopes, never a cast/fabricated WeakMap entry. Pure tests
 * stub the authority snapshot; the PostgreSQL suite uses a real activated user,
 * lease and workspace plus explicitly synthetic TEST_ONLY trust facts. It
 * proves local predicate semantics, NOT TS/source/runtime qualification. */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import type { AuthSession, PortalUser, VerifiedAccessIdentity } from "../src/domain";
import type { AccessAction, AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, type AccessEvaluationContext, type AccessRelations } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { projectionRowVisible, projectionScopeSql, redactProjectionFields } from "../src/execution-v2/read-projection";
import type { ExecutionReadPublication } from "../src/execution-v2/read-publication";
import { ExecutionReadScopeError, ExecutionReadScopes, type AuthorizedExecutionReadScope,
  type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { SessionsRepository } from "../src/repos/sessions";
import { migrateTestDatabase, setupApp, teardownApp, testConfig } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const NOW = 1_800_000_000_000;
const USER = "TEST_ONLY-json-researcher", OWNER = "TEST_ONLY-json-owner", WORKSPACE = "TEST_ONLY-json-workspace";
const DATASET = { dataset_id: "TEST_ONLY-json-history", source_revision: "TEST_ONLY-json-r1", window: null };
const BINDING = { environment: "paper" as const, profileId: "TEST_ONLY-json-paper" };
const OWN = { alpha_id: "own-alpha", alpha_version_id: "own-v1", portfolio_id: "shared-portfolio",
  deployment_id: "own-deployment", account_id: "shared-account" };
const PEER = { alpha_id: "peer-alpha", alpha_version_id: "peer-v1", portfolio_id: "shared-portfolio",
  deployment_id: "peer-deployment", account_id: "shared-account" };
const PRIVATE = { alpha_id: OWN.alpha_id, alpha_version_id: OWN.alpha_version_id, portfolio_id: "own-portfolio",
  deployment_id: "own-private-deployment", account_id: "own-account" };
const TUPLES = [OWN, PEER, PRIVATE];
const OWN_STRATEGY = "str-own-alpha", PEER_STRATEGY = "str-peer-alpha";
const STRATEGY_PAIRS = [{ strategy_id: OWN_STRATEGY, alpha_id: OWN.alpha_id },
  { strategy_id: PEER_STRATEGY, alpha_id: PEER.alpha_id }];
const fields = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id", "display_name",
  "net_pnl", "equity", "timestamp_ms", "availability"];
const resourceLineage = (t: typeof OWN): AccessResource[] => [
  { kind: "ALPHA", id: t.alpha_id }, { kind: "ALPHA_VERSION", id: t.alpha_version_id },
  { kind: "PORTFOLIO", id: t.portfolio_id }, { kind: "DEPLOYMENT", id: t.deployment_id }, { kind: "ACCOUNT", id: t.account_id },
];
const resources = [...new Map(TUPLES.flatMap(resourceLineage).map(r => [JSON.stringify(r), r])).values()];
const identityRow = { role: "USER", session_version: 1, policy: {}, policy_revision: "TEST_ONLY-policy-r1",
  policy_seen: true, workspace_exists: true, member: true, owner: false, retained: [] };
const user: PortalUser = { userId: USER, username: USER, displayName: USER, role: "USER", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date(NOW), updatedAt: new Date(NOW), disabledAt: null, accountRevision: 1, archivedAt: null };
const session: AuthSession = { sessionId: "TEST_ONLY-json-session", userId: USER, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date(NOW), idleExpiresAt: new Date(NOW + 60_000), absoluteExpiresAt: new Date(NOW + 3_600_000) };

async function fixture(options: { legacy?: boolean; full?: boolean; empty?: boolean; noDataset?: boolean;
  resource?: AccessResource; pool?: Pool; principal?: ReadScopePrincipal;
  strategyPairs?: { strategy_id: string; alpha_id: string }[] | null } = {}) {
  const principal = options.principal ?? { user, session, workspaceId: WORKSPACE };
  const actorId = principal.user.userId, workspace = principal.workspaceId;
  const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: "TEST_ONLY-policy-r1",
    artifact_digest: accessDigest(["TEST_ONLY", workspace]), approval_ref: "TEST_ONLY-NOT-OWNER-APPROVAL",
    state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: OWNER,
    researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-json-fields-v1", fields: [...fields] } };
  const membership = { revision: "TEST_ONLY-membership-r1", receipt_id: "TEST_ONLY-membership-receipt", mapping_revision: "TEST_ONLY-mapping-r1" };
  const relation: AccessRelations = { qualified: true, revision: "TEST_ONLY-json-relations-r1", own_alpha_ids: [OWN.alpha_id],
    member_portfolio_ids: [OWN.portfolio_id, PRIVATE.portfolio_id], roots: { "TEST_ONLY-json-root": resources }, membership };
  const grant = (action: AccessAction, selector: ScopedAccessGrant["selector"]): ScopedAccessGrant => ({
    grant_id: `TEST_ONLY-json-${action}`, subject_user_id: actorId, workspace_id: workspace, action, effect: "ALLOW", selector,
    environments: ["paper"], valid_from_ms: NOW - 60_000, valid_until_ms: NOW + 3_600_000,
    delegable_actions: [], issued_by: OWNER, parent_grant_id: null, revision: "TEST_ONLY-grant-r1",
    policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: true,
    ts_receipt: { ...membership, membership_revision: membership.revision,
      effective_at_ms: NOW - 60_000, expires_at_ms: NOW + 3_600_000 },
    field_policy_ref: policy.researcher_fields.policy_ref,
  });
  const context: AccessEvaluationContext = { principal_id: actorId, workspace_id: workspace, now_ms: NOW,
    actor_current: true, actor_role: "USER", allow_test_only: true, authority_fingerprint: "TEST_ONLY-coherent-snapshot",
    policy, active_principals: new Set([actorId, OWNER]), relationsFor: () => relation,
    grants: options.full ? [grant("business.read_all", { kind: "ROOT_SCOPE", root_id: "TEST_ONLY-json-root" })] : [
      grant("alpha.read", { kind: "OWN_ALPHA" }),
      grant("portfolio.read_restricted", { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [OWN.portfolio_id, PRIVATE.portfolio_id] }),
    ] };
  const publication: ExecutionReadPublication = { workspace_id: workspace, environment: "paper", profile_id: BINDING.profileId,
    qualification: "TEST_ONLY", publication_revision: "TEST_ONLY-json-publication-r1", binding: structuredClone(DATASET),
    population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY-NOT-A-REAL-SOURCE",
    resources: options.empty ? [] : structuredClone(resources), tuples: options.empty ? [] : structuredClone(TUPLES),
    strategy_lineage: options.strategyPairs === null ? null : { qualification: "TEST_ONLY",
      revision: "TEST_ONLY-strategy-lineage-r1", provenance_ref: "TEST_ONLY-NOT-A-REAL-STRATEGY-SOURCE",
      pairs: structuredClone(options.strategyPairs ?? (options.empty ? [] : STRATEGY_PAIRS)) },
    current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-linkage-r1", provenance_ref: "TEST_ONLY-NOT-CURRENT-SOURCE",
      pairs: [ { alpha_id: OWN.alpha_id, portfolio_id: OWN.portfolio_id },
        { alpha_id: OWN.alpha_id, portfolio_id: PRIVATE.portfolio_id }, { alpha_id: PEER.alpha_id, portfolio_id: PEER.portfolio_id } ] } };
  // Deliberately synthetic authority callbacks. Real PostgreSQL tests below
  // validate the identity lease and predicate, not the trust-provider DB fence.
  const access = { readContext: async () => context, readPublication: async () => publication,
    confirmReadContext: async () => context } as unknown as ExecutionAccessService;
  const pool = options.pool ?? { query: vi.fn(async () => ({ rows: [{ ...identityRow,
    policy: options.legacy ? null : policy, policy_seen: !options.legacy }] })) } as unknown as Pool;
  if (options.pool && !options.legacy) await new AccessRepository(options.pool).putPolicy(policy);
  const scopes = new ExecutionReadScopes(pool, access, testConfig());
  const scope = await scopes.authorize(principal, BINDING, { action: "alpha.read",
    ...(options.noDataset ? {} : { dataset: structuredClone(DATASET) }),
    ...(options.resource ? { resource: options.resource } : {}) });
  return { scope, scopes, context, publication };
}

const CASES: readonly [string, unknown, boolean][] = [
  ["own complete economic tuple", { ...OWN }, true],
  ["owned alpha grain", { alpha_id: OWN.alpha_id }, true],
  ["qualified distinct strategy grain", { strategy_id: OWN_STRATEGY }, true],
  ["canonical alpha plus agreeing distinct strategy", { alpha_id: OWN.alpha_id, strategy_id: OWN_STRATEGY }, true],
  ["canonical alpha conflicts with qualified strategy", { alpha_id: OWN.alpha_id, strategy_id: PEER_STRATEGY }, false],
  ["null alpha with qualified distinct strategy", { alpha_id: null, strategy_id: OWN_STRATEGY }, true],
  ["private account grain", { account_id: PRIVATE.account_id }, true],
  ["private portfolio grain", { portfolio_id: PRIVATE.portfolio_id }, true],
  ["shared account aggregate", { account_id: OWN.account_id }, false],
  ["shared portfolio aggregate", { portfolio_id: OWN.portfolio_id }, false],
  ["shared portfolio/account without alpha", { portfolio_id: OWN.portfolio_id, account_id: OWN.account_id }, false],
  ["disambiguated own shared account", { alpha_id: OWN.alpha_id, account_id: OWN.account_id }, true],
  ["peer complete tuple", { ...PEER }, false],
  ["unknown alpha", { alpha_id: "unknown-alpha" }, false],
  ["unknown account", { account_id: "unknown-account" }, false],
  ["false economic cross product", { alpha_id: OWN.alpha_id, deployment_id: PEER.deployment_id }, false],
  ["unknown anchor plus own alpha", { alpha_id: OWN.alpha_id, account_id: "unknown-account" }, false],
  ["number anchor", { alpha_id: OWN.alpha_id, account_id: 123 }, false],
  ["object anchor", { alpha_id: { value: OWN.alpha_id } }, false],
  ["array anchor", { alpha_id: [OWN.alpha_id] }, false],
  ["boolean anchor", { alpha_id: true }, false],
  ["blank anchor", { alpha_id: "" }, false],
  ["null-only anchors", { alpha_id: null, strategy_id: null, account_id: null }, false],
  ["unanchored totals", { equity: "1234567.123456789123456789" }, false],
  ["SQL-like unknown alpha", { alpha_id: "own-alpha') OR TRUE; --" }, false],
  ["JSON array", [{ alpha_id: OWN.alpha_id }], false],
  ["JSON null", null, false],
  ["JSON scalar string", "own-alpha", false],
  ["JSON scalar number", 123, false],
  ["same-looking raw Alpha ID is no strategy mapping", { strategy_id: OWN.alpha_id }, false],
  ["unknown strategy cannot be ignored beside known Alpha", { alpha_id: OWN.alpha_id, strategy_id: "unknown-strategy" }, false],
  ["number strategy cannot be ignored beside known Alpha", { alpha_id: OWN.alpha_id, strategy_id: 123 }, false],
  ["object strategy cannot be ignored beside known Alpha", { alpha_id: OWN.alpha_id, strategy_id: { id: OWN_STRATEGY } }, false],
];

describe("ELP2-04 retained JSON projection pure boundaries", () => {
  let scoped: AuthorizedExecutionReadScope;
  beforeAll(async () => { scoped = (await fixture()).scope; });

  it.each(CASES)("applies exact row grain: %s", (_label, row, expected) => {
    expect(projectionRowVisible(scoped, row)).toBe(expected);
  });
  it("uses one bounded JSON parameter and correlated recordset, never source IDs in SQL", () => {
    const predicate = projectionScopeSql(scoped, "history.fields", 7);
    expect(predicate.values).toHaveLength(1);
    expect(predicate.sql).toContain("$7::jsonb");
    expect(predicate.sql).toContain('"history"."fields"');
    expect(predicate.sql).toContain("bool_or(");
    expect(predicate.sql).toContain("bool_and(");
    expect(predicate.sql).not.toMatch(/own-alpha|peer-alpha|own-account/);
    const payload = JSON.parse(predicate.values[0] as string);
    expect(payload.tuples.filter((t: { allowed: boolean }) => t.allowed)).toHaveLength(2);
    expect(payload.strategy_pairs).toEqual(STRATEGY_PAIRS);
  });
  it.each(["fields; DROP TABLE x", "a.b.fields", "fields->'alpha_id'", '"fields"', "fields --", "fields\n",
    "account_id", ".fields", "a".repeat(64) + ".fields", "a-b.fields"])("rejects unsafe column %s", column => {
    expect(() => projectionScopeSql(scoped, column, 1)).toThrow(ExecutionReadScopeError);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 65_536])("rejects invalid one-based bind offset %s", offset => {
    expect(() => projectionScopeSql(scoped, "fields", offset)).toThrow(ExecutionReadScopeError);
  });
  it("accepts the final PostgreSQL bind index and avoids recordset alias shadowing", () => {
    expect(projectionScopeSql(scoped, "fields", 65_535).sql).toContain("$65535::jsonb");
    expect(projectionScopeSql(scoped, "__elp2_scope_tuple.fields", 1).sql)
      .toContain('AS "__elp2_scope_tuple_2"(');
    expect(projectionScopeSql(scoped, "__elp2_scope_strategy.fields", 1).sql)
      .toContain('AS "__elp2_scope_strategy_2"(');
  });
  it("requires qualified strategy lineage without blocking canonical rows when that lineage is absent", async () => {
    const absent = (await fixture({ strategyPairs: null })).scope;
    expect(projectionRowVisible(absent, OWN)).toBe(true);
    expect(projectionRowVisible(absent, { strategy_id: OWN_STRATEGY })).toBe(false);
    expect(projectionRowVisible(absent, { alpha_id: OWN.alpha_id, strategy_id: OWN_STRATEGY })).toBe(false);
    expect(projectionRowVisible(absent, { strategy_id: OWN.alpha_id })).toBe(false);
  });
  it("uses exact mapping rather than namespace collision or raw strategy-to-Alpha equality", async () => {
    const collision = (await fixture({ full: true, strategyPairs: [
      ...STRATEGY_PAIRS, { strategy_id: OWN.alpha_id, alpha_id: PEER.alpha_id },
    ] })).scope;
    expect(projectionRowVisible(collision, { strategy_id: OWN.alpha_id })).toBe(true); // qualified peer Alpha
    expect(projectionRowVisible(collision, { strategy_id: OWN.alpha_id, alpha_id: PEER.alpha_id })).toBe(true);
    expect(projectionRowVisible(collision, { strategy_id: OWN.alpha_id, alpha_id: OWN.alpha_id })).toBe(false);
    expect(projectionRowVisible(collision, { strategy_id: OWN_STRATEGY, deployment_id: PEER.deployment_id })).toBe(false);
  });
  it("rejects ambiguous strategy authority instead of accepting a last-write-wins mapping", async () => {
    await expect(fixture({ strategyPairs: [
      { strategy_id: OWN_STRATEGY, alpha_id: OWN.alpha_id },
      { strategy_id: OWN_STRATEGY, alpha_id: PEER.alpha_id },
    ] })).rejects.toBeInstanceOf(ExecutionReadScopeError);
  });
  it("rejects copied, forged and JSON round-tripped capabilities in every exported adapter", () => {
    for (const forged of [{}, { ...scoped }, JSON.parse(JSON.stringify(scoped)), null]) {
      expect(() => projectionScopeSql(forged as AuthorizedExecutionReadScope, "fields", 1)).toThrow(ExecutionReadScopeError);
      expect(() => projectionRowVisible(forged as AuthorizedExecutionReadScope, OWN)).toThrow(ExecutionReadScopeError);
      expect(() => redactProjectionFields(forged as AuthorizedExecutionReadScope, OWN)).toThrow(ExecutionReadScopeError);
    }
  });
  it("preserves certified legacy SQL compatibility, but validates column and capability first", async () => {
    const legacy = (await fixture({ legacy: true })).scope;
    expect(projectionScopeSql(legacy, "fields", 1)).toEqual({ sql: "TRUE", values: [] });
    expect(projectionRowVisible(legacy, {})).toBe(true);
    expect(() => projectionScopeSql(legacy, "fields OR TRUE", 1)).toThrow(ExecutionReadScopeError);
  });
  it("limits whole-business authority to known publication tuples, allowing shared grains only when all peers are allowed", async () => {
    const full = (await fixture({ full: true })).scope;
    expect(full.wholePopulation).toBe(true);
    expect(projectionScopeSql(full, "fields", 1).sql).not.toBe("TRUE");
    expect(projectionRowVisible(full, OWN)).toBe(true);
    expect(projectionRowVisible(full, PEER)).toBe(true);
    expect(projectionRowVisible(full, { account_id: OWN.account_id })).toBe(true);
    expect(projectionRowVisible(full, { portfolio_id: OWN.portfolio_id })).toBe(true);
    expect(projectionRowVisible(full, { account_id: "unknown-later-account" })).toBe(false);
    expect(projectionRowVisible(full, { equity: "333333.000000000000000001" })).toBe(false);
  });
  it("does not broaden a whole-business reader's exact resource purpose", async () => {
    const detail = (await fixture({ full: true, resource: { kind: "ALPHA", id: OWN.alpha_id } })).scope;
    expect(projectionScopeSql(detail, "fields", 1).sql).not.toBe("TRUE");
    expect(projectionRowVisible(detail, PEER)).toBe(false);
    expect(projectionRowVisible(detail, OWN)).toBe(true);
  });
  it("returns FALSE for an authorized empty restricted collection", async () => {
    const empty = (await fixture({ empty: true, resource: { kind: "ALPHA", id: OWN.alpha_id } })).scope;
    expect(projectionScopeSql(empty, "fields", 1)).toEqual({ sql: "FALSE", values: [] });
    expect(projectionRowVisible(empty, OWN)).toBe(false);
  });
  it("does not treat a whole-business authorized empty population as an unbounded read", async () => {
    const empty = (await fixture({ empty: true, full: true, resource: { kind: "ROOT", id: "TEST_ONLY-json-root" } })).scope;
    expect(empty.wholePopulation).toBe(true);
    expect(projectionScopeSql(empty, "fields", 1)).toEqual({ sql: "FALSE", values: [] });
    expect(projectionRowVisible(empty, OWN)).toBe(false);
    expect(projectionRowVisible(empty, { equity: "999999.000000000000000001" })).toBe(false);
  });
  it("refuses V2 resource scopes with no qualified dataset binding", async () => {
    const detail = (await fixture({ noDataset: true, resource: { kind: "ALPHA", id: OWN.alpha_id } })).scope;
    expect(() => projectionScopeSql(detail, "fields", 1)).toThrow(ExecutionReadScopeError);
    expect(() => projectionRowVisible(detail, OWN)).toThrow(ExecutionReadScopeError);
  });
  it("redacts nested/technical/non-finite fields while preserving decimal bytes, null, false and zero", () => {
    const row = { alpha_id: OWN.alpha_id, display_name: "Owned", net_pnl: "-0.000000000000000000001",
      equity: "20000.123456789123456789", timestamp_ms: 0, availability: false, portfolio_id: null,
      private_key: "never", password: "never", host: "never", physical_balance: "900000",
      account_id: { secret: "never" }, alpha_version_id: ["nested"], deployment_id: Infinity,
      balance_total: "unapproved", future_field: "not a new permission" };
    expect(redactProjectionFields(scoped, row)).toEqual({ alpha_id: OWN.alpha_id, display_name: "Owned",
      net_pnl: "-0.000000000000000000001", equity: "20000.123456789123456789", timestamp_ms: 0,
      availability: false, portfolio_id: null });
    expect(row.private_key).toBe("never");
  });
  it("does not invoke getters or accept inherited anchors/fields", () => {
    const getter = vi.fn(() => OWN.alpha_id), row = Object.create({ alpha_id: OWN.alpha_id });
    Object.defineProperty(row, "account_id", { enumerable: true, get: getter });
    Object.defineProperty(row, "equity", { enumerable: true, get: getter });
    expect(projectionRowVisible(scoped, row)).toBe(false);
    expect(redactProjectionFields(scoped, row)).toEqual({});
    expect(getter).not.toHaveBeenCalled();
  });
  it("does not invoke a strategy getter or use an inherited strategy mapping", () => {
    const getter = vi.fn(() => OWN_STRATEGY), getterRow = { alpha_id: OWN.alpha_id };
    Object.defineProperty(getterRow, "strategy_id", { enumerable: true, get: getter });
    expect(projectionRowVisible(scoped, getterRow)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(projectionRowVisible(scoped, Object.create({ strategy_id: OWN_STRATEGY }))).toBe(false);
  });
});

describe.skipIf(!DATABASE_URL)("ELP2-04 exact JSON predicates on real disposable PostgreSQL", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let scoped: AuthorizedExecutionReadScope;
  let full: AuthorizedExecutionReadScope;
  let legacy: AuthorizedExecutionReadScope;
  let empty: AuthorizedExecutionReadScope;
  let detail: AuthorizedExecutionReadScope;
  let noStrategyLineage: AuthorizedExecutionReadScope;
  let strategyCollision: AuthorizedExecutionReadScope;
  const TABLE = "elp204_projection_scope_test_rows";

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: DATABASE_URL! });
    const auth = ctx.app.get(AuthService), admin = new AdminService(ctx.pool, ctx.config, auth);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`, authenticationTime: new Date(),
      tokenExpiresAt: new Date(Date.now() + 60_000),
    } satisfies VerifiedAccessIdentity));
    const created = await admin.createUser({ username: "elp204-json-reader", displayName: "TEST_ONLY JSON reader", role: "USER" });
    const token = await admin.resetCredential(created.userId);
    const initial = await auth.login({ assertion: created.username, username: created.username, credential: token.activationToken });
    await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
      currentPassword: token.activationToken, newPassword: "elp204-test-only-correct-horse-battery-2026" });
    const actor = (await auth.users.findById(created.userId))!;
    const lease: AuthSession = { sessionId: "elp204-json-read-session", userId: actor.userId, state: "ACTIVE",
      sessionVersion: actor.sessionVersion, authenticationTime: new Date(), idleExpiresAt: new Date(Date.now() + 600_000),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000) };
    const digest = (s: string) => createHash("sha256").update(s).digest("hex");
    await new SessionsRepository(ctx.pool).create({ sessionId: lease.sessionId, userId: actor.userId,
      tokenHash: digest("TEST_ONLY-json-token"), accessSubject: null, accessTokenExpiresAt: null,
      csrfSecretHash: digest("TEST_ONLY-json-csrf"), activationId: null, sessionVersion: actor.sessionVersion,
      idleExpiresAt: lease.idleExpiresAt, absoluteExpiresAt: lease.absoluteExpiresAt });
    const workspace = "elp204-json-sql-workspace";
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,$2,$3)",
      [workspace, "TEST_ONLY projection SQL", actor.userId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [workspace, actor.userId]);
    const principal = { user: actor, session: lease, workspaceId: workspace };
    legacy = (await fixture({ pool: ctx.pool, principal, legacy: true })).scope;
    scoped = (await fixture({ pool: ctx.pool, principal })).scope;
    full = (await fixture({ pool: ctx.pool, principal, full: true })).scope;
    empty = (await fixture({ pool: ctx.pool, principal, full: true, empty: true,
      resource: { kind: "ROOT", id: "TEST_ONLY-json-root" } })).scope;
    detail = (await fixture({ pool: ctx.pool, principal, full: true, resource: { kind: "ALPHA", id: OWN.alpha_id } })).scope;
    noStrategyLineage = (await fixture({ pool: ctx.pool, principal, strategyPairs: null })).scope;
    strategyCollision = (await fixture({ pool: ctx.pool, principal, full: true, strategyPairs: [
      ...STRATEGY_PAIRS, { strategy_id: OWN.alpha_id, alpha_id: PEER.alpha_id },
    ] })).scope;
    await ctx.pool.query(`CREATE UNLOGGED TABLE ${TABLE}(id integer PRIMARY KEY, fields jsonb)`);
    for (const [index, [, row]] of CASES.entries()) await ctx.pool.query(`INSERT INTO ${TABLE}(id,fields) VALUES($1,$2::jsonb)`,
      [index + 1, JSON.stringify(row)]);
  }, 30_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    if (ctx) { await ctx.pool.query(`DROP TABLE IF EXISTS ${TABLE}`); await teardownApp(ctx); }
  });

  it.each(CASES.map(([label, row, expected], index) => [label, row, expected, index + 1] as const))(
    "matches the JS predicate and real bound SQL for %s", async (_label, row, expected, id) => {
      const predicate = projectionScopeSql(scoped, "h.fields", 2);
      const result = await ctx.pool.query(`SELECT ${predicate.sql} AS visible FROM ${TABLE} h WHERE id=$1`, [id, ...predicate.values]);
      expect(result.rows).toEqual([{ visible: expected }]);
      expect(projectionRowVisible(scoped, row)).toBe(expected);
    });
  it("scopes count/page/search before filtering, sorting and LIMIT", async () => {
    const predicate = projectionScopeSql(scoped, "h.fields", 1);
    const count = await ctx.pool.query(`SELECT count(*)::integer AS count FROM ${TABLE} h WHERE ${predicate.sql}`, predicate.values);
    const expected = CASES.flatMap(([, , allowed], index) => allowed ? [index + 1] : []);
    expect(count.rows[0].count).toBe(expected.length);
    const page = await ctx.pool.query(`SELECT id FROM ${TABLE} h WHERE ${predicate.sql} ORDER BY id LIMIT 3`, predicate.values);
    expect(page.rows.map(row => row.id)).toEqual(expected.slice(0, 3));
    const search = await ctx.pool.query(`SELECT count(*)::integer AS count FROM ${TABLE} h
      WHERE ${predicate.sql} AND h.fields->>'alpha_id'=$2`, [...predicate.values, PEER.alpha_id]);
    expect(search.rows[0].count).toBe(0);
  });
  it("does not drop or round exact decimal JSON values", async () => {
    const fields = { ...OWN, net_pnl: "-0.000000000000000000001", equity: "20000.123456789123456789" };
    const predicate = projectionScopeSql(scoped, "h.fields", 2);
    const result = await ctx.pool.query(`SELECT h.fields FROM (SELECT $1::jsonb AS fields) h WHERE ${predicate.sql}`,
      [JSON.stringify(fields), ...predicate.values]);
    expect(redactProjectionFields(scoped, result.rows[0].fields)).toMatchObject(fields);
  });
  it("preserves certified legacy predicates without treating V2 full-business authority as unbounded", async () => {
    const legacyPredicate = projectionScopeSql(legacy, "fields", 1);
    expect(legacyPredicate).toEqual({ sql: "TRUE", values: [] });
    const legacyResult = await ctx.pool.query(`SELECT count(*)::integer AS count FROM ${TABLE} WHERE ${legacyPredicate.sql}`, legacyPredicate.values);
    expect(legacyResult.rows[0].count).toBe(CASES.length);
    const predicate = projectionScopeSql(full, "h.fields", 1);
    expect(predicate.sql).not.toBe("TRUE");
    const result = await ctx.pool.query(`SELECT id FROM ${TABLE} h WHERE ${predicate.sql} ORDER BY id`, predicate.values);
    expect(result.rows.map(row => row.id)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
  it("returns false rather than SQL NULL for a nullable source row", async () => {
    const predicate = projectionScopeSql(scoped, "h.fields", 1);
    const result = await ctx.pool.query(`SELECT ${predicate.sql} AS visible FROM (SELECT NULL::jsonb AS fields) h`, predicate.values);
    expect(result.rows).toEqual([{ visible: false }]);
  });
  it("keeps SQL/JS parity for absent lineage and distinct-ID namespace collisions", async () => {
    const probes: [AuthorizedExecutionReadScope, unknown, boolean][] = [
      [noStrategyLineage, OWN, true],
      [noStrategyLineage, { strategy_id: OWN_STRATEGY }, false],
      [noStrategyLineage, { alpha_id: OWN.alpha_id, strategy_id: OWN_STRATEGY }, false],
      [strategyCollision, { strategy_id: OWN.alpha_id }, true],
      [strategyCollision, { strategy_id: OWN.alpha_id, alpha_id: PEER.alpha_id }, true],
      [strategyCollision, { strategy_id: OWN.alpha_id, alpha_id: OWN.alpha_id }, false],
      [strategyCollision, { strategy_id: OWN_STRATEGY, account_id: PRIVATE.account_id }, true],
      [strategyCollision, { strategy_id: OWN_STRATEGY, deployment_id: PEER.deployment_id }, false],
    ];
    for (const [scope, row, expected] of probes) {
      const predicate = projectionScopeSql(scope, "h.fields", 2);
      const result = await ctx.pool.query(`SELECT ${predicate.sql} AS visible FROM (SELECT $1::jsonb AS fields) h`,
        [JSON.stringify(row), ...predicate.values]);
      expect(result.rows).toEqual([{ visible: expected }]);
      expect(projectionRowVisible(scope, row)).toBe(expected);
    }
  });
  it("keeps a complete empty authorized dataset empty even when the table contains other rows", async () => {
    const predicate = projectionScopeSql(empty, "h.fields", 1);
    expect(predicate).toEqual({ sql: "FALSE", values: [] });
    const result = await ctx.pool.query(`SELECT count(*)::integer AS count FROM ${TABLE} h WHERE ${predicate.sql}`, predicate.values);
    expect(result.rows).toEqual([{ count: 0 }]);
  });
  it("keeps explicit Alpha purpose on a whole-business reader and suppresses its shared totals", async () => {
    const predicate = projectionScopeSql(detail, "h.fields", 1);
    const result = await ctx.pool.query(`SELECT id FROM ${TABLE} h WHERE ${predicate.sql} ORDER BY id`, predicate.values);
    const expected = CASES.flatMap(([, row], index) => projectionRowVisible(detail, row) ? [index + 1] : []);
    expect(result.rows.map(row => row.id)).toEqual(expected);
    expect(result.rows.map(row => row.id)).not.toContain(13); // peer tuple
    expect(result.rows.map(row => row.id)).not.toContain(9); // shared-account total
  });
  it("excludes unknown tuples and unanchored rows inserted after full-business authorization from count/page", async () => {
    // `full` was minted before all source rows in beforeAll. This additional
    // table write does not update its qualified, immutable publication proof.
    const lateTuple = { alpha_id: "late-alpha", alpha_version_id: "late-version", portfolio_id: "late-portfolio",
      deployment_id: "late-deployment", account_id: "late-account", equity: "999999.123456789123456789" };
    const lateTotal = { equity: "999999.123456789123456789" };
    const connection = await ctx.pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(`INSERT INTO ${TABLE}(id,fields) VALUES(1001,$1::jsonb),(1002,$2::jsonb)`,
        [JSON.stringify(lateTuple), JSON.stringify(lateTotal)]);
      const predicate = projectionScopeSql(full, "h.fields", 1);
      const count = await connection.query(`SELECT count(*)::integer AS count FROM ${TABLE} h WHERE ${predicate.sql}`, predicate.values);
      expect(count.rows).toEqual([{ count: 12 }]);
      const page = await connection.query(`SELECT id FROM ${TABLE} h WHERE ${predicate.sql} ORDER BY id DESC LIMIT 4`, predicate.values);
      expect(page.rows.map(row => row.id)).toEqual([13, 12, 11, 10]);
      expect(projectionRowVisible(full, lateTuple)).toBe(false);
      expect(projectionRowVisible(full, lateTotal)).toBe(false);
      expect(projectionRowVisible(full, { account_id: OWN.account_id })).toBe(true);
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  });
});
