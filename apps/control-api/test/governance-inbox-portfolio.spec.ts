import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import type { ControlApiConfig } from "../src/config";
import type { PortalUser, AuthSession } from "../src/domain";
import type { EffectiveAccess, OwnerAccessService } from "../src/auth/owner-access.service";
import type { ControlPlaneQueryService, KeysetPage } from "../src/query";
import {
  APPROVAL_GATES, approvalInboxResource,
  type ApprovalGate, type ApprovalInboxItem, type ApprovalInboxRow,
} from "../src/governance/contracts";
import { GovernanceRepository } from "../src/governance/governance.repository";
import { GovernanceService } from "../src/governance/governance.service";

// TEST_ONLY synthetic identities. No production/provider authority is installed.
const workspace = "TEST-inbox-workspace";
const actor = { userId: "TEST-reader", username: "reader", role: "USER", sessionVersion: 7 } as PortalUser;
const session = { sessionId: "TEST-lease", userId: actor.userId, sessionVersion: 7 } as AuthSession;
const now = new Date("2026-10-19T10:00:00Z");
const config = {
  GOVERNANCE_APPLY_ACTIVE_KEY_ID: "test",
  GOVERNANCE_APPLY_KEYS_JSON: JSON.stringify({ test: "inbox-portfolio-test-only-key-material-32-bytes" }),
  QUERY_CURSOR_ACTIVE_KEY_ID: "test",
  QUERY_CURSOR_KEYS_JSON: JSON.stringify({ test: "inbox-portfolio-test-only-key-material-32-bytes" }),
  QUERY_CURSOR_TTL_SECONDS: 300,
} as ControlApiConfig;

function inboxRow(gate: ApprovalGate): ApprovalInboxRow {
  return {
    r2_parent_ready: false, r2_plan_author_user_id: null,
    approval_id: `TEST-${gate}`, workspace_id: workspace, gate,
    subject_type: "ALPHA_VERSION", subject_id: "TEST-alpha", subject_label: "PF_LABEL_IS_NOT_LINEAGE",
    release_candidate: null, environment: "PAPER", target_label: "review",
    requester_user_id: "TEST-author", requester_username: "author",
    artifact_creator_user_id: "TEST-author", artifact_creator_username: "author",
    status: "PENDING", effective_status: "PENDING", policy_version: "TEST-policy",
    quorum_required: 1, quorum_met: 0, decision_actor_ids: [], approval_version: 1,
    evidence_set_hash: `sha256:${"a".repeat(64)}`, evidence_complete: true,
    blocker_count: 0, blocker_summary: null,
    sla_due_at: new Date("2026-10-20T10:00:00Z"), expires_at: new Date("2026-10-21T10:00:00Z"),
    created_at: now, updated_at: now, sla_state: "ON_TRACK",
  };
}

function listFixture(options: { member?: boolean; policy?: boolean; restricted?: boolean } = {}) {
  const authority = { member: options.member ?? true, policy: options.policy ?? false, lease: true };
  let access: EffectiveAccess = { userId: actor.userId, isOwner: !options.restricted,
    ownerState: options.restricted ? "NOT_OWNER" : "OWNER",
    capabilities: ["governance.r2.read"], scopes: { "governance.r2.read": [workspace] } };
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("AS policy_seen")
    ? [{ policy_seen: authority.policy }] : authority.lease ? [{ member: authority.member }] : [] }));
  const repository = new GovernanceRepository({ query } as unknown as Pool);
  const counts = vi.spyOn(repository, "counts").mockResolvedValue({ pending: 12, overdue: 3, dueSoon: 4 });
  const links = vi.spyOn(repository, "inboxPortfolioIds").mockResolvedValue(new Map([["TEST-R2", "PF_CAPTURED"]]));
  const effectiveAccess = vi.fn(async () => access);
  const service = new GovernanceService(repository, config, {} as never,
    { effectiveAccess } as unknown as OwnerAccessService);
  const resource = approvalInboxResource(actor, () => false, APPROVAL_GATES, now);
  const page: KeysetPage<ApprovalInboxItem> = {
    rows: [resource.mapRow(inboxRow("R2"))], total_count: 12, filtered_count: 9,
    next_cursor: "TEST-next", prev_cursor: "TEST-prev", has_more: true, has_previous: true,
    applied_filters: [], applied_sort: [{ field: "sla_due_at", direction: "asc" }],
  };
  const list = vi.spyOn((service as unknown as { query: ControlPlaneQueryService }).query, "list")
    .mockResolvedValue(page);
  return { service, authority, counts, links, list, page,
    revokeGrant: () => { access = { ...access, isOwner: false, ownerState: "NOT_OWNER", capabilities: [], scopes: {} }; } };
}

describe("FE-045 authorized Approval Inbox portfolio metadata", () => {
  it.each(["ALPHA_VERSION", "DEPLOYMENT", "EXIT_REVIEW"] as const)(
    "publishes the persisted subject type %s, not an inference from gate or label", subject_type => {
      const resource = approvalInboxResource(actor, () => false, APPROVAL_GATES, now);
      expect(resource.selectColumns).toContain("subject_type");
      expect(resource.mapRow({ ...inboxRow("R1"), subject_type }).subject_type).toBe(subject_type);
    },
  );
  it.each(APPROVAL_GATES)("the %s mapper never infers portfolio identity from its subject", gate => {
    const item = approvalInboxResource(actor, () => false, APPROVAL_GATES, now).mapRow(inboxRow(gate));
    expect(item.portfolio_id).toBeNull();
    expect(item.subject).toBe("PF_LABEL_IS_NOT_LINEAGE");
  });

  it("adds only captured navigation metadata and preserves counts, filters and cursor boundaries", async () => {
    const f = listFixture();
    const result = await f.service.list(actor, workspace, { limit: 1 }, session);
    expect(result.counts).toEqual({ pending: 12, overdue: 3, due_soon: 4 });
    expect(result.page).toEqual({ ...f.page, rows: [{ ...f.page.rows[0], portfolio_id: "PF_CAPTURED" }] });
    expect(f.links).toHaveBeenCalledExactlyOnceWith(workspace, f.page.rows, APPROVAL_GATES);
    expect(f.page.rows[0].portfolio_id).toBeNull();
  });

  it("uses current gate-read scope before the page, aggregates and lineage query", async () => {
    const f = listFixture({ restricted: true });
    await f.service.list(actor, workspace, {}, session);
    expect(f.list.mock.calls[0]?.[0].rowVisibility?.allowedValues).toEqual(["R2"]);
    expect(f.counts).toHaveBeenCalledExactlyOnceWith(workspace, ["R2"]);
    expect(f.links).toHaveBeenCalledExactlyOnceWith(workspace, f.page.rows, ["R2"]);
  });

  it.each([
    { member: false, code: "WORKSPACE_ACCESS_DENIED" },
    { policy: true, code: "ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED" },
  ])("preserves the existing pre-read refusal $code", async options => {
    const f = listFixture(options);
    await expect(f.service.list(actor, workspace, {}, session)).rejects.toMatchObject({ code: options.code });
    expect(f.list).not.toHaveBeenCalled();
    expect(f.counts).not.toHaveBeenCalled();
    expect(f.links).not.toHaveBeenCalled();
  });

  it.each(["grant", "lease", "policy"] as const)("rechecks %s after awaiting lineage enrichment", async kind => {
    const f = listFixture();
    f.links.mockImplementationOnce(async () => {
      if (kind === "grant") f.revokeGrant();
      else if (kind === "lease") f.authority.lease = false;
      else f.authority.policy = true;
      return new Map([["TEST-R2", "PF_DO_NOT_DELIVER"]]);
    });
    await expect(f.service.list(actor, workspace, {}, session)).rejects.toMatchObject({ code: kind === "grant"
      ? "GOVERNANCE_READ_ACCESS_CHANGED" : kind === "lease" ? "SESSION_REQUIRED"
        : "ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED" });
  });

  it("keeps empty/unsupported/unreadable pages SQL-free and rejects an oversized page without truncation", async () => {
    const query = vi.fn();
    const repository = new GovernanceRepository({ query } as unknown as Pool);
    await expect(repository.inboxPortfolioIds(workspace, [], APPROVAL_GATES)).resolves.toEqual(new Map());
    await expect(repository.inboxPortfolioIds(workspace, [{ id: "TEST-R1", gate: "R1" }], APPROVAL_GATES))
      .resolves.toEqual(new Map([["TEST-R1", null]]));
    await expect(repository.inboxPortfolioIds(workspace, [{ id: "TEST-R2", gate: "R2" }], ["R1"]))
      .resolves.toEqual(new Map([["TEST-R2", null]]));
    await expect(repository.inboxPortfolioIds(workspace, Array.from({ length: 251 }, (_, index) => ({
      id: `TEST-${index}`, gate: "R2" as const,
    })), APPROVAL_GATES)).rejects.toThrow(RangeError);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("FE-045 real PostgreSQL bounded lineage join", () => {
  // SQL component lane only, not app/provider qualification. Transaction-local
  // temporary tables deliberately permit malformed/duplicate legacy fixtures;
  // the full governance suites cover actual migrations, immutable FK guards,
  // session/workspace RBAC and HTTP against the normal migrated test database.
  let pool: Pool;
  let client: PoolClient;
  let repository: GovernanceRepository;
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL
      ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test", max: 1,
    connectionTimeoutMillis: 2_000, query_timeout: 3_000 });
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE governance_approval_requests
      (approval_id text, workspace_id text, gate text);
      CREATE TEMP TABLE governance_approval_analytics_scopes
      (approval_id text, workspace_id text, gate text, portfolio_id text);
      CREATE TEMP TABLE governance_paper_exit_reviews
      (review_id text, workspace_id text, gate text, portfolio_id text)`);
    repository = new GovernanceRepository({ query: client.query.bind(client) } as unknown as Pool);
  });
  afterAll(async () => {
    if (client) {
      try { await client.query("ROLLBACK"); } finally { client.release(); }
    }
    if (pool) await pool.end();
  });
  beforeEach(async () => {
    await client.query(`TRUNCATE pg_temp.governance_approval_requests,
      pg_temp.governance_approval_analytics_scopes, pg_temp.governance_paper_exit_reviews`);
    await client.query(`INSERT INTO pg_temp.governance_approval_requests
      SELECT 'TEST-' || gate, $1, gate FROM unnest($2::text[]) gate`, [workspace, APPROVAL_GATES]);
  });

  const page = APPROVAL_GATES.map(gate => ({ id: `TEST-${gate}`, gate }));
  async function scope(id: string, gate: ApprovalGate, portfolio: string | null, targetWorkspace = workspace) {
    await client.query(`INSERT INTO pg_temp.governance_approval_analytics_scopes VALUES ($1,$2,$3,$4)`,
      [id, targetWorkspace, gate, portfolio]);
  }
  async function exit(portfolio: string | null, targetWorkspace = workspace, gate = "PAPER_EXIT") {
    await client.query(`INSERT INTO pg_temp.governance_paper_exit_reviews VALUES ('TEST-PAPER_EXIT',$1,$2,$3)`,
      [targetWorkspace, gate, portfolio]);
  }

  it("publishes each gate's own capture and does not project later R2 scope backwards onto R1", async () => {
    await scope("TEST-R2", "R2", "PF_R2_CAPTURED");
    await exit("PF_EXIT_CAPTURED");
    expect(await repository.inboxPortfolioIds(workspace, page, APPROVAL_GATES)).toEqual(new Map([
      ["TEST-R1", null], ["TEST-R2", "PF_R2_CAPTURED"], ["TEST-PAPER_EXIT", "PF_EXIT_CAPTURED"],
      ["TEST-SANDBOX_EXIT", null], ["TEST-LIVE_GATE", null],
    ]));
  });

  it("returns explicit null for every unrecorded gate", async () => {
    expect(await repository.inboxPortfolioIds(workspace, page, APPROVAL_GATES))
      .toEqual(new Map(page.map(item => [item.id, null])));
  });

  it("isolates exact workspace and gate even when opaque IDs collide in legacy fixtures", async () => {
    await scope("TEST-R2", "R2", "PF_HIDDEN", "TEST-other-workspace");
    await scope("TEST-R2", "R1", "PF_WRONG_GATE");
    await exit("PF_HIDDEN", "TEST-other-workspace");
    await exit("PF_WRONG_GATE", workspace, "SANDBOX_EXIT");
    await client.query(`INSERT INTO pg_temp.governance_approval_requests VALUES
      ('TEST-R2','TEST-other-workspace','R2'), ('TEST-PAPER_EXIT','TEST-other-workspace','PAPER_EXIT')`);
    expect(await repository.inboxPortfolioIds(workspace, page, APPROVAL_GATES))
      .toEqual(new Map(page.map(item => [item.id, null])));
  });

  it("does not read a sibling approval or gate beyond the authorized page", async () => {
    await scope("TEST-R2", "R2", "PF_R2_CAPTURED");
    await exit("PF_EXIT_CAPTURED");
    expect(await repository.inboxPortfolioIds(workspace, page, ["PAPER_EXIT"]))
      .toEqual(new Map(page.map(item => [item.id, item.gate === "PAPER_EXIT" ? "PF_EXIT_CAPTURED" : null])));
    expect(await repository.inboxPortfolioIds(workspace, [{ id: "TEST-R2", gate: "PAPER_EXIT" }], APPROVAL_GATES))
      .toEqual(new Map([["TEST-R2", null]]));
    expect(await repository.inboxPortfolioIds(workspace, [page[1]], APPROVAL_GATES))
      .toEqual(new Map([["TEST-R2", "PF_R2_CAPTURED"]]));
  });

  it("returns null instead of first/last-wins for ambiguous captured portfolios", async () => {
    await scope("TEST-R2", "R2", "PF_ONE");
    await scope("TEST-R2", "R2", "PF_TWO");
    await exit("PF_ONE"); await exit("PF_TWO");
    expect(await repository.inboxPortfolioIds(workspace, page, APPROVAL_GATES))
      .toEqual(new Map(page.map(item => [item.id, null])));
  });

  it.each([null, "", "../not-a-public-id", "x".repeat(192)])(
    "keeps malformed or missing captured identity %j explicitly null", async value => {
      await scope("TEST-R2", "R2", value); await exit(value);
      expect(await repository.inboxPortfolioIds(workspace, page, APPROVAL_GATES))
        .toEqual(new Map(page.map(item => [item.id, null])));
    });
});
