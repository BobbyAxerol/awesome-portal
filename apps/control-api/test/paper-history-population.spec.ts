/** Narrow SQL-construction/producer regression. In-memory result adapter, no
 * PostgreSQL/HTTP/runtime qualification. Real scope minting uses TEST_ONLY
 * authority callbacks; no production grants or source mapping are created. */
import { describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { loadConfig } from "../src/config";
import type { AuthSession, PortalUser } from "../src/domain";
import { ExecutionProfileProjectionRepository, type ProjectionScalar } from "../src/execution/profile-projection.repository";
import { accessDigest, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import type { AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { ExecutionReadPublication } from "../src/execution-v2/read-publication";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";

const WORKSPACE = "TEST_ONLY-history-workspace", PROFILE = "TEST_ONLY-history-paper";
const RELATION = "manager.performance:account_equity_snapshots";
const FROM = "2026-10-01T00:00:00.000Z", TO = "2026-10-02T00:00:00.000Z";
const TUPLE = { alpha_id: "alpha", alpha_version_id: "av", portfolio_id: "portfolio",
  deployment_id: "deployment", account_id: "account" };
type Stored = { row_id: string; ts: string; fields: Record<string, ProjectionScalar> };
function row(id: string, ts: string, value?: ProjectionScalar, deployment = TUPLE.deployment_id): Stored {
  return { row_id: id, ts, fields: { ...TUPLE, deployment_id: deployment, ts,
    ...(value === undefined ? {} : { equity: value }) } };
}
const CORPUS = [
  row("bad-before", "2026-09-30T23:59:59.000Z", "900"),
  row("null", FROM, null), row("missing", FROM), row("malformed", FROM, "not-a-decimal"),
  row("exponent", FROM, "1e6"), row("b", FROM, "100.125"), row("a", FROM, "0"),
  row("c", "2026-10-01T12:00:00.000Z", "-2.50"), row("end", TO, "300"),
  row("after", "2026-10-02T00:00:00.001Z", "400"), row("peer", FROM, "999", "peer-deployment"),
];

/** Deliberately small SQL-result adapter: interprets the scalar predicates
 * emitted by this reader, not PostgreSQL's window/ranking/JSONB implementation.
 * SQL text/values are asserted independently below. */
function database(initial: Stored[], appendAfterMeta: Stored[] = []) {
  const corpus = initial.slice();
  const calls: Array<{ text: string; values: unknown[] }> = [];
  return {
    calls,
    async query(text: string, values: unknown[]) {
      calls.push({ text, values: [...values] });
      const from = /ts >= \$(\d+)::timestamptz/.exec(text);
      const to = /ts (<|<=) \$(\d+)::timestamptz/.exec(text);
      const entity = /fields->>\(\$(\d+)\) = \$(\d+)/.exec(text);
      const eligible = /fields->>\(\$(\d+)\) ~ '/.exec(text);
      const selected = corpus.filter(item =>
        (!from || Date.parse(item.ts) >= Date.parse(String(values[Number(from[1]) - 1]))) &&
        (!to || (to[1] === "<"
          ? Date.parse(item.ts) < Date.parse(String(values[Number(to[2]) - 1]))
          : Date.parse(item.ts) <= Date.parse(String(values[Number(to[2]) - 1])))) &&
        (!entity || item.fields[String(values[Number(entity[1]) - 1])] === values[Number(entity[2]) - 1]) &&
        (!eligible || /^-?[0-9]+(\.[0-9]+)?$/.test(String(item.fields[String(values[Number(eligible[1]) - 1])]))))
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || a.row_id.localeCompare(b.row_id));
      if (text.includes("count(*)::text AS n")) {
        corpus.push(...appendAfterMeta);
        return { rows: [{ n: String(selected.length),
          k: String(new Set(selected.map(item => item.fields.account_id)).size),
          t0: selected[0]?.ts ?? null, t1: selected.at(-1)?.ts ?? null }] };
      }
      const limit = /LIMIT \$(\d+)/.exec(text);
      return { rows: limit ? selected.slice(0, Number(values[Number(limit[1]) - 1])) : selected };
    },
  };
}
const query = (targetPoints = 20) => ({
  from: FROM, to: TO, entity: { field: "deployment_id", value: TUPLE.deployment_id },
  seriesField: "account_id", valueField: "equity", targetPoints,
});
const where = (text: string) => /WHERE (.*?)(?:\n|$)/.exec(text)?.[1];

async function scopedWindow() {
  const now = Date.now(), userId = "TEST_ONLY-history-user", owner = "TEST_ONLY-owner";
  const user: PortalUser = { userId, username: userId, displayName: userId, role: "USER", status: "ACTIVE",
    mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
    createdAt: new Date(now), updatedAt: new Date(now), disabledAt: null };
  const session: AuthSession = { sessionId: "TEST_ONLY-history-session", userId, state: "ACTIVE", sessionVersion: 1,
    authenticationTime: new Date(now), idleExpiresAt: new Date(now + 60_000), absoluteExpiresAt: new Date(now + 60_000) };
  const resources: AccessResource[] = [
    { kind: "ALPHA", id: TUPLE.alpha_id }, { kind: "ALPHA_VERSION", id: TUPLE.alpha_version_id },
    { kind: "PORTFOLIO", id: TUPLE.portfolio_id }, { kind: "DEPLOYMENT", id: TUPLE.deployment_id },
    { kind: "ACCOUNT", id: TUPLE.account_id },
  ];
  const membership = { revision: "TEST_ONLY-membership", receipt_id: "TEST_ONLY-receipt", mapping_revision: "TEST_ONLY-mapping" };
  const policy: ReviewedAccessPolicy = { workspace_id: WORKSPACE, revision: "TEST_ONLY-policy",
    artifact_digest: accessDigest("TEST_ONLY-policy"), approval_ref: "TEST_ONLY-NOT-APPROVAL", state: "REVIEWED",
    qualification: "TEST_ONLY", protected_owner_user_id: owner,
    researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-fields", fields: ["equity", "account_id", "deployment_id"] } };
  const grant: ScopedAccessGrant = { grant_id: "TEST_ONLY-root-read", subject_user_id: userId, workspace_id: WORKSPACE,
    action: "business.read_all", effect: "ALLOW", selector: { kind: "ROOT_SCOPE", root_id: "TEST_ONLY-root" },
    environments: ["paper"], valid_from_ms: now - 60_000, valid_until_ms: now + 60_000, delegable_actions: [],
    issued_by: owner, parent_grant_id: null, revision: "TEST_ONLY-grant", policy_revision: policy.revision,
    revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: policy.researcher_fields.policy_ref,
    ts_receipt: { ...membership, membership_revision: membership.revision, effective_at_ms: now - 60_000, expires_at_ms: now + 60_000 } };
  const context: AccessEvaluationContext = { principal_id: userId, workspace_id: WORKSPACE, now_ms: now,
    actor_current: true, actor_role: "USER", allow_test_only: true, authority_fingerprint: "TEST_ONLY-snapshot",
    policy, active_principals: new Set([userId, owner]), grants: [grant],
    relationsFor: () => ({ qualified: true, revision: "TEST_ONLY-relations", own_alpha_ids: [], member_portfolio_ids: [],
      roots: { "TEST_ONLY-root": resources }, membership }) };
  const binding = { dataset_id: `history:${RELATION}`, source_revision: "TEST_ONLY-source", window: { from_ms: Date.parse(FROM), to_ms: Date.parse(TO) } };
  const publication: ExecutionReadPublication = { workspace_id: WORKSPACE, environment: "paper", profile_id: PROFILE,
    qualification: "TEST_ONLY", publication_revision: "TEST_ONLY-publication", binding,
    population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY-NOT-A-SOURCE",
    resources, tuples: [TUPLE], current_linkage: null };
  const authorityPool = { async query() { return { rows: [{ role: "USER", session_version: 1, policy,
    policy_revision: policy.revision, policy_seen: true, workspace_exists: true, member: true, owner: false, retained: [] }] }; } };
  const access = { readContext: async () => context, confirmReadContext: async () => context, readPublication: async () => publication };
  const scopes = new ExecutionReadScopes(authorityPool as unknown as Pool, access as unknown as ExecutionAccessService,
    loadConfig({ DATABASE_URL: "postgres://unused:unused@localhost/unused", PORTAL_ENV: "local", AUTH_MODE: "dev" }));
  return scopes.authorize({ user, session, workspaceId: WORKSPACE }, { environment: "paper", profileId: PROFILE },
    { action: "business.read_all", dataset: binding });
}

describe("Paper depth eligible population parity (synthetic query adapter, no PG)", () => {
  it("sparse history excludes null/malformed values consistently and keeps zero/negative/tie order/end", async () => {
    const db = database(CORPUS), repository = new ExecutionProfileProjectionRepository(db as unknown as Pool);
    const result = await repository.timeSeriesHistoryDownsampled(WORKSPACE, "paper", PROFILE, RELATION, query(4));
    expect(result.sourceRows).toBe(4);
    expect(result.rows.map(item => item.rowId)).toEqual(["a", "b", "c", "end"]);
    expect(result.rows.map(item => item.fields.equity)).toEqual(["0", "100.125", "-2.50", "300"]);
    expect(result.downsample).toBeNull();
    expect(where(db.calls[1].text)).toBe(where(db.calls[0].text));
    expect(db.calls[1].text).toContain("ORDER BY ts ASC, row_id ASC");
    expect(db.calls[1].text).not.toMatch(/\bLIMIT\b/);
    expect(db.calls[1].values).toEqual(db.calls[0].values.slice(0, -1));
  });

  it("counts the actual eligible rows after a legacy append, never an old pre-count or target cap", async () => {
    const db = database([row("a", FROM, "0")], [row("b", FROM, "1"), row("c", TO, "2"), row("bad", FROM, null)]);
    const repository = new ExecutionProfileProjectionRepository(db as unknown as Pool);
    const result = await repository.timeSeriesHistoryDownsampled(WORKSPACE, "paper", PROFILE, RELATION, query(1));
    expect(result.sourceRows).toBe(3);
    expect(result.rows.map(item => item.rowId)).toEqual(["a", "b", "c"]);
    expect(result.downsample).toBeNull();
  });

  it("uses the same numeric eligibility predicate in the dense branch", async () => {
    const db = database(CORPUS), repository = new ExecutionProfileProjectionRepository(db as unknown as Pool);
    const result = await repository.timeSeriesHistoryDownsampled(WORKSPACE, "paper", PROFILE, RELATION, query(2));
    expect(result.sourceRows).toBe(4);
    expect(result.rows.map(item => item.rowId)).toEqual(["a", "b", "c", "end"]);
    expect(result.downsample).toMatchObject({ input_rows: 4, output_rows: 4 });
    expect(where(db.calls[1].text)?.trim()).toBe(where(db.calls[0].text)?.trim());
    // The adapter above does not execute window ranking: output_rows is only
    // a supplied-result test, never a claim of actual PG downsample cardinality.
    expect(db.calls[1].text).toContain("rn_min = 1 OR rn_max = 1 OR rn_last = 1");
  });

  it("keeps the ordinary exact reader unfiltered, bounded and chronological", async () => {
    const db = database(CORPUS), repository = new ExecutionProfileProjectionRepository(db as unknown as Pool);
    const result = await repository.timeSeriesHistory(WORKSPACE, "paper", PROFILE, RELATION,
      { from: FROM, to: TO, entity: query().entity, limit: 2 });
    expect(result.rows.map(item => item.rowId)).toEqual(["a", "b"]);
    expect(result.hasMore).toBe(true);
    expect(db.calls[0].text).not.toContain(" ~ '");
    expect(db.calls[0].text).toMatch(/LIMIT \$\d+/);
    const raw = await repository.timeSeriesHistory(WORKSPACE, "paper", PROFILE, RELATION,
      { from: FROM, to: TO, entity: query().entity, limit: 20 });
    expect(raw.rows.map(item => item.rowId)).toContain("null");
    expect(raw.rows.map(item => item.rowId)).toContain("malformed");
  });

  it("returns empty only when the numeric-eligible population is empty", async () => {
    const db = database([row("null", FROM, null), row("bad", FROM, "NaN"), row("missing", FROM)]);
    const repository = new ExecutionProfileProjectionRepository(db as unknown as Pool);
    expect(await repository.timeSeriesHistoryDownsampled(WORKSPACE, "paper", PROFILE, RELATION, query()))
      .toEqual({ rows: [], sourceRows: 0, downsample: null });
    expect(db.calls).toHaveLength(1);
  });

  it("retains real scoped authorization, matching end-exclusive predicates and timestamp precision", async () => {
    const scope = await scopedWindow();
    expect(scope.mode).toBe("SCOPED_V2");
    const db = database(CORPUS), repository = new ExecutionProfileProjectionRepository(db as unknown as Pool);
    const result = await repository.timeSeriesHistoryDownsampled(WORKSPACE, "paper", PROFILE, RELATION,
      { ...query(), scope }, db as unknown as PoolClient);
    expect(result.rows.map(item => item.rowId)).toEqual(["a", "b", "c"]);
    expect(result.sourceRows).toBe(3);
    expect(where(db.calls[1].text)).toBe(where(db.calls[0].text));
    expect(db.calls[1].text).toMatch(/ts < \$\d+::timestamptz/);
    expect(db.calls[1].text).toContain('HH24:MI:SS.US"Z"');
  });
});
