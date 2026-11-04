/**
 * BE-P12 - identity and stage facts on the SCOPED_V2 stage bodies.
 *
 * Real scoped readers over the in-memory TEST_ONLY authority harness (the same one
 * elp2-product-reads.spec.ts uses). Nothing here is a product receipt, a TS
 * qualification or an installed policy. The legacy composer and the named/cohort
 * paths are replaced by throwing doubles: any fallback fails the test.
 */
import { describe, expect, it, vi } from "vitest";
import { productReadFixture as fixture, FIELDS, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";
import { ProfileReadService } from "../src/profile-read/profile-read.service";
import { LiveOperationsService } from "../src/live/live-operations.service";
import { liveSourceOperationsRead } from "../src/live/live-source.contract";
import { SCOPED_LIVE_SPECS } from "../src/profile-read/scoped-live-source";
import { CanaryService } from "../src/canary/canary.service";
import { SandboxCertificationService } from "../src/sandbox/sandbox-certification.service";
import { followingParentRead } from "../src/governance/following-parent.contract";
import { IDENTITY_NOT_AUTHORIZED, IDENTITY_NOT_READ } from "../src/execution/deployment-identity";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertPublishedSchema } from "./stage-contract-validator";

const OPERATIONS = "execution-operations.v1.schema.json";
const contractFixture = (name: string) => JSON.parse(readFileSync(resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures", name), "utf8"));

type Fixture = ReturnType<typeof liveFixture>;
const LIVE_FIELDS = [...FIELDS, "price", "position_id", "fill_id", "balance_free", "balance_locked"];

/** The Live harness of elp2-product-reads, parameterised by the deployment and the viewer's field policy. */
function liveFixture(options: { deployment?: typeof PRIVATE; fields?: string[]; full?: boolean } = {}) {
  const deployment = options.deployment ?? PRIVATE;
  const f = fixture({ fields: options.fields ?? LIVE_FIELDS, full: options.full });
  f.context.actor_lease_until_ms = f.context.now_ms + 600_000;
  f.context.grants = f.context.grants.map(grant => ({ ...grant, environments: ["live"] }));
  // The shared deployment's account is the viewer's own too (the hidden peer shares only the portfolio and account rows).
  f.context.grants = f.context.grants.map(grant => grant.action === "account.read" && grant.selector.kind === "EXPLICIT_RESOURCE_SET"
    ? { ...grant, selector: { ...grant.selector, ids: [...grant.selector.ids, OWN.account_id] } } : grant);
  const base = f.context.grants[0]!;
  f.context.grants = [...f.context.grants, { ...base, grant_id: "TEST_ONLY-live-screen-gate", action: "governance.live.read",
    requires_ts_acceptance: false, ts_receipt: null,
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "DEPLOYMENT", ids: [deployment.deployment_id] } }];
  f.snapshot.document.environment = "live";
  f.snapshot.document.profile_id = "LIVE_BINANCE_USDM";
  const lineage = () => ({ workspace_id: f.principal.workspaceId, profile_id: "LIVE_BINANCE_USDM",
    source_contract_revision: f.snapshot.document.source_contract_revision, source_catalogue_sha256: f.snapshot.sourceCatalogueSha256! });
  for (const spec of SCOPED_LIVE_SPECS) {
    const key = `${spec.source}:${spec.relation}`;
    f.snapshot.document.relations[key] ??= { source_id: spec.source, relation: spec.relation, availability: "AVAILABLE", reason_code: null,
      freshness: "STALE", completeness: "PARTIAL", as_of: null, items: [] } as never;
    f.snapshot.document.relations[key].source_id = spec.source;
    for (const row of f.snapshot.document.relations[key].items) {
      if (row.fields.mode === "paper") row.fields.mode = "live";
      row.lineage = lineage();
    }
  }
  f.snapshot.document.relations["manager.deployments:strategy_deployments"].items.push({ fields: {
    ...PRIVATE, strategy_id: "strategy-own", mode: "live", venue: "VENUE" }, lineage: lineage() } as never);
  // The portfolios relation the identity reads: one portfolio only the own alpha uses, one it shares with a hidden peer.
  f.snapshot.document.relations["manager.portfolios:portfolios"] = { source_id: "manager.portfolios", relation: "portfolios",
    availability: "AVAILABLE", reason_code: null, freshness: "STALE", completeness: "COMPLETE", as_of: null, items: [
      { fields: { portfolio_id: PRIVATE.portfolio_id, name: "Own Book" }, lineage: lineage() },
      { fields: { portfolio_id: OWN.portfolio_id, name: "Shared Book SHARED_WITH_HIDDEN_PEER" }, lineage: lineage() },
    ] } as never;
  const legacy = vi.fn(async () => { throw Error("TEST_ONLY-legacy-composer-must-not-run"); });
  const service = new LiveOperationsService({ latestByDeployment: legacy, lineageFor: legacy } as never,
    new ProfileReadService(f.product), f.config, { effectiveAccess: legacy } as never, f.scopes);
  const read = (query: Record<string, unknown> = {}) => service.detail(f.principal.user, f.principal.session, f.principal.workspaceId,
    deployment.deployment_id, undefined, query);
  const reconciliation = () => f.snapshot.document.relations["manager.reconciliation:reconciliation_findings"];
  /** An open finding for the deployment's own account and strategy, in the shape the panel filter keeps. */
  const finding = (status: string, extra: Record<string, unknown> = {}) => reconciliation().items.push({ fields: {
    account_id: deployment.account_id, strategy_id: "strategy-own", mode: "live", venue: "VENUE", status,
    created_at: "2026-10-01T00:00:00.000Z", ...extra }, lineage: lineage() } as never);
  return { ...f, legacy, service, read, reconciliation, finding, deployment };
}
/** Every real body is also judged against the PUBLISHED JSON Schema, not only the producer's own Zod. */
const parse = (body: unknown) => {
  assertPublishedSchema(OPERATIONS, "LiveSourceOperationsReadV2", body);
  return liveSourceOperationsRead.parse(body);
};
const noFallback = (f: Fixture) => { expect(f.legacy).not.toHaveBeenCalled(); expect(f.named.relationPage).not.toHaveBeenCalled(); };

describe("BE-P12 Live SCOPED_V2 identity", () => {
  it("is absent unless asked for: the original v2 body is unchanged", async () => {
    const f = liveFixture(), body = parse(await f.read());
    expect(Object.keys(body)).not.toContain("identity");
    expect(Object.keys(body)).not.toContain("stage_facts");
    expect(Object.keys(body).sort()).toEqual(["commands", "coverage", "data", "deployment_id", "environment", "observed_at_ms",
      "profile_id", "realtime", "record_authority", "runtime", "runtime_activation_requested", "schema_version",
      "source_side_effect_requested", "source_verdict", "visibility", "workspace_id"]);
    noFallback(f);
  });

  it("publishes alpha_id and portfolio_name under the viewer's row and field policy; alpha_name is never invented", async () => {
    const f = liveFixture(), body = parse(await f.read({ include: "identity" }));
    expect(body.identity).toEqual({ basis: "RETAINED_PROJECTION_ROW_AND_FIELD_POLICY", alpha_id: "own", alpha_name: null,
      portfolio_name: "Own Book", alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null });
    expect(body.stage_facts).toBeUndefined();
    noFallback(f);
  });

  it("a portfolio shared with a hidden peer alpha is a typed absence, and its name never reaches the body", async () => {
    const f = liveFixture({ deployment: OWN }), raw = await f.read({ include: "identity" }), body = parse(raw);
    expect(body.identity).toMatchObject({ alpha_id: "own", portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    expect(JSON.stringify(raw)).not.toMatch(/SHARED_WITH_HIDDEN_PEER|Shared Book|peer/);
    noFallback(f);
  });

  it("a deployment of a hidden peer alpha is the same uniform 404 as before; include adds no oracle", async () => {
    const f = liveFixture({ deployment: PEER });
    await expect(f.read({ include: "identity" })).rejects.toMatchObject({ status: 404 });
    await expect(f.read()).rejects.toMatchObject({ status: 404 });
    noFallback(f);
  });

  it.each([
    ["alpha_id", { alpha_id: null, alpha_reason_code: "ALPHA_IDENTITY_NOT_AUTHORIZED", portfolio_name: "Own Book" }],
    ["name", { alpha_id: "own", portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_AUTHORIZED" }],
    ["portfolio_id", { alpha_id: "own", portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_AUTHORIZED" }],
  ] as const)("a field policy that hides %s makes that member a typed absence", async (hidden, expected) => {
    const f = liveFixture({ fields: LIVE_FIELDS.filter(field => field !== hidden) }), raw = await f.read({ include: "identity" });
    expect(parse(raw).identity).toMatchObject(expected);
    if (hidden !== "alpha_id") expect(JSON.stringify(raw)).not.toContain("Own Book");
    noFallback(f);
  });

  it("an absent, ambiguous or unnamed portfolio is its own reason, never a guess", async () => {
    const missing = liveFixture();
    delete missing.snapshot.document.relations["manager.portfolios:portfolios"];
    expect(parse(await missing.read({ include: "identity" })).identity).toMatchObject({
      portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_PUBLISHED" });
    const twice = liveFixture();
    const relation = twice.snapshot.document.relations["manager.portfolios:portfolios"];
    relation.items.push({ ...relation.items[0], fields: { portfolio_id: PRIVATE.portfolio_id, name: "Other Book" } } as never);
    expect(parse(await twice.read({ include: "identity" })).identity).toMatchObject({
      portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_AMBIGUOUS" });
    const unnamed = liveFixture();
    delete unnamed.snapshot.document.relations["manager.portfolios:portfolios"].items[0].fields.name;
    expect(parse(await unnamed.read({ include: "identity" })).identity).toMatchObject({
      portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_PUBLISHED" });
  });

  it("a served portfolio row with foreign lineage voids the read instead of naming the portfolio", async () => {
    const f = liveFixture();
    f.snapshot.document.relations["manager.portfolios:portfolios"].items[0].lineage!.profile_id = "SOME_OTHER_PROFILE";
    await expect(f.read({ include: "identity" })).rejects.toMatchObject({ status: 503, code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    // Not asked for: the same snapshot still serves the original body (the row is not consulted).
    expect(parse(await f.read()).deployment_id).toBe(PRIVATE.deployment_id);
  });

  it.each(["unknown", "identity,identity", "identity,", "", "stage_facts,unknown", "IDENTITY"])(
    "include=%j is refused (400), never ignored", async include => {
      const f = liveFixture();
      await expect(f.read({ include })).rejects.toMatchObject({ status: 400, code: "EXECUTION_READ_QUERY_INVALID" });
      noFallback(f);
    });
  it.each([["array", ["identity"]], ["object", { identity: true }], ["number", 1]])("a non-string include (%s) is refused", async (_name, include) => {
    const f = liveFixture();
    await expect(f.read({ include })).rejects.toMatchObject({ status: 400, code: "EXECUTION_READ_QUERY_INVALID" });
  });

  it("revoking the viewer's alpha scope at the final fence ends the read; no identity is returned", async () => {
    const f = liveFixture(), authorize = f.scopes.authorize.bind(f.scopes);
    let renewals = 0;
    const spy = vi.spyOn(f.scopes, "authorize").mockImplementation(async (...args) => {
      const result = await authorize(...args);
      if (args[2].dataset?.dataset_id === "relation:manager.accounts:account_balances" && ++renewals === 2) {
        f.context.grants = f.context.grants.filter(grant => grant.action !== "alpha.read");
        f.context.authority_fingerprint = "TEST_ONLY-revoked-after-identity";
      }
      return result;
    });
    try {
      await expect(f.read({ include: "identity,stage_facts" })).rejects.toMatchObject({ status: 409, code: "EXECUTION_READ_ACCESS_CHANGED" });
      noFallback(f);
    } finally { spy.mockRestore(); }
  });
});

describe("BE-P12 Live SCOPED_V2 stage facts", () => {
  const facts = async (f: Fixture) => parse(await f.read({ include: "stage_facts" })).stage_facts!;

  it("runtime and sessions stay typed absences when the source or reviewed fields are missing", async () => {
    const f = liveFixture(), body = await facts(f);
    expect(body.runtime.runtime_state.availability).toBe("NOT_PUBLISHED");
    expect(body.runtime.since.availability).toBe("NOT_PUBLISHED");
    expect(body.sessions).toEqual({ availability: "NOT_PUBLISHED", reason_code: "SCOPED_SESSION_FIELDS_NOT_AUTHORIZED",
      basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW", rows: [], returned_count: 0, omitted_count: 0, source_complete: null });
    expect(body.reconciliation.as_of).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "SOURCE_CLOCK_NOT_SCOPED" });
  });

  it("publishes observed runtime and session instants only from exact authorized source fields", async () => {
    const f = liveFixture({ fields: [...LIVE_FIELDS, "runtime_state", "runtime_state_since", "execution_session_id", "started_at", "completed_at"] });
    const deployment = f.snapshot.document.relations["manager.deployments:strategy_deployments"].items
      .find(row => row.fields.deployment_id === f.deployment.deployment_id)!;
    Object.assign(deployment.fields, { runtime_state: "RUNNING", runtime_state_since: "2026-10-01T01:02:03Z" });
    f.snapshot.document.relations["manager.sessions:execution_sessions"].items.push({ lineage: deployment.lineage, fields: {
      deployment_id: f.deployment.deployment_id, strategy_id: "strategy-own", account_id: f.deployment.account_id, mode: "live", venue: "VENUE",
      execution_session_id: "TEST_ONLY:session", started_at: "2026-10-01T01:02:03Z", completed_at: null, state: "RUNNING",
    } } as never);
    const body = parse(await f.read({ include: "stage_facts" }));
    expect(body.stage_facts!.runtime.runtime_state).toEqual({ availability: "AVAILABLE", value: "RUNNING", reason_code: null });
    expect(body.stage_facts!.runtime.since.value).toBe("2026-10-01T01:02:03.000Z");
    expect(body.stage_facts!.sessions).toMatchObject({ availability: "AVAILABLE", source_complete: false,
      rows: [{ id: "TEST_ONLY:session", started: "2026-10-01T01:02:03.000Z", ended: null }] });
    expect(body.runtime.state).toBeNull(); expect(body.commands.enabled).toBe(false);
  });

  it("does not publish source runtime behind a reduced policy or turn an active flag into runtime", async () => {
    const f = liveFixture();
    const deployment = f.snapshot.document.relations["manager.deployments:strategy_deployments"].items
      .find(row => row.fields.deployment_id === f.deployment.deployment_id)!;
    Object.assign(deployment.fields, { runtime_state: "RUNNING", runtime_state_since: Number.MAX_SAFE_INTEGER, active: true });
    const body = await facts(f);
    expect(body.runtime.runtime_state.availability).toBe("NOT_PUBLISHED");
    expect(body.runtime.since.availability).toBe("NOT_PUBLISHED");
    expect(body.sessions.source_complete).toBeNull();
  });

  it("no visible finding in an authorized population does not prove 'no open findings'", async () => {
    const f = liveFixture(), body = await facts(f);
    expect(body.reconciliation.verdict).toMatchObject({ availability: "NOT_PUBLISHED", value: null, reason_code: "AUTHORIZED_POPULATION_ONLY" });
    expect(body.reconciliation.open_finding_count.value).toBeNull();
  });

  it("an authorized open finding is stated as OPEN_FINDINGS, but the count over an authorized subset is not published", async () => {
    const f = liveFixture();
    f.finding("OPEN"); f.finding("ACKED");
    const body = await facts(f);
    expect(body.reconciliation.verdict).toEqual({ availability: "AVAILABLE", value: "OPEN_FINDINGS", reason_code: null });
    expect(body.reconciliation.open_finding_count).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "AUTHORIZED_POPULATION_COUNT_NOT_EXACT" });
    expect(body.reconciliation.unknown_order_count.availability).toBe("NOT_PUBLISHED");
  });

  it("a resolved finding is not open; an unreadable status refuses every verdict", async () => {
    const resolved = liveFixture();
    resolved.finding("RESOLVED");
    expect((await facts(resolved)).reconciliation.verdict.reason_code).toBe("AUTHORIZED_POPULATION_ONLY");
    const unreadable = liveFixture();
    unreadable.finding("MYSTERY");
    expect((await facts(unreadable)).reconciliation.verdict).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "FINDING_STATUS_UNREADABLE" });
  });

  it("a hidden status field refuses the verdict instead of reading around the policy", async () => {
    const f = liveFixture({ fields: LIVE_FIELDS.filter(field => field !== "status") });
    f.finding("OPEN");
    const raw = await f.read({ include: "stage_facts" }), body = parse(raw).stage_facts!;
    expect(body.reconciliation.verdict).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "FINDING_STATUS_NOT_AUTHORIZED" });
    expect(body.reconciliation.open_finding_count.value).toBeNull();
  });

  it("a finding of a hidden peer's strategy never changes what the viewer is told", async () => {
    const f = liveFixture();
    f.finding("OPEN", { strategy_id: "strategy-peer", account_id: PEER.account_id });
    const body = await facts(f);
    expect(body.reconciliation.verdict).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "AUTHORIZED_POPULATION_ONLY" });
    expect(JSON.stringify(body)).not.toMatch(/peer|OPEN_FINDINGS/);
  });

  it("even a business.read_all viewer on a COMPLETE window gets no 'no open findings' and no exact count: a resource-bound scope cannot prove the whole population", async () => {
    const empty = liveFixture({ full: true });
    empty.reconciliation().completeness = "COMPLETE";
    expect((await facts(empty)).reconciliation).toMatchObject({
      verdict: { availability: "NOT_PUBLISHED", value: null, reason_code: "AUTHORIZED_POPULATION_ONLY" },
      open_finding_count: { availability: "NOT_PUBLISHED", value: null }, unknown_order_count: { availability: "NOT_PUBLISHED", value: null } });
    const open = liveFixture({ full: true });
    open.reconciliation().completeness = "COMPLETE"; open.finding("OPEN");
    expect((await facts(open)).reconciliation).toMatchObject({
      verdict: { availability: "AVAILABLE", value: "OPEN_FINDINGS" },
      open_finding_count: { availability: "NOT_PUBLISHED", reason_code: "AUTHORIZED_POPULATION_COUNT_NOT_EXACT" },
      unknown_order_count: { availability: "NOT_PUBLISHED", reason_code: "FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED" } });
  });

  it("a relation the source did not capture is reported with the panel's own reason", async () => {
    const f = liveFixture();
    f.snapshot.document.relations["manager.reconciliation:reconciliation_findings"].availability = "UNAVAILABLE" as never;
    expect((await facts(f)).reconciliation.verdict).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "SOURCE_PANEL_NOT_CAPTURED" });
  });

  it("both members together, and the panels beside them are unchanged by asking", async () => {
    const f = liveFixture(), plain = parse(await f.read()), both = parse(await f.read({ include: "identity,stage_facts" }));
    expect(both.identity).toBeDefined(); expect(both.stage_facts).toBeDefined();
    expect(both.data).toEqual(plain.data);
    expect({ ...both, identity: undefined, stage_facts: undefined, observed_at_ms: 0 }).toEqual({ ...plain, identity: undefined, stage_facts: undefined, observed_at_ms: 0 });
    noFallback(f);
  });
});

describe("BE-P12 Sandbox / Canary SCOPED_V2 identity", () => {
  // The sealed parents are the published canonical fixtures, so the attached result is judged against the real schema.
  const parentBody = (family: "SANDBOX" | "CANARY") => structuredClone(contractFixture("execution-positive-parent.synthetic.valid.json")[family === "SANDBOX" ? "sandbox" : "canary"]);
  function services() {
    const forbidden = vi.fn(async () => { throw Error("TEST_ONLY-legacy-composer-must-not-run"); });
    const identity = vi.fn(async () => ({ alpha_id: "own", alpha_name: null, portfolio_name: "Own Book",
      alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null }));
    const parentOf = (family: "SANDBOX" | "CANARY") => vi.fn(async () => followingParentRead.parse(parentBody(family)));
    const parents = { mode: vi.fn(async () => "SCOPED_V2"), detail: vi.fn() };
    parents.detail.mockImplementation(async (_p: unknown, family: "SANDBOX" | "CANARY") => parentOf(family)());
    const profileReads = { deploymentIdentity: identity, snapshot: forbidden };
    const scopes = { coreSelectionMode: vi.fn(async () => "SCOPED_V2") };
    const canary = new CanaryService({ latestByDeployment: forbidden, lineageFor: forbidden } as never, profileReads as never,
      { effectiveAccess: forbidden } as never, scopes as never, parents as never);
    const sandbox = new SandboxCertificationService({ detailByDeployment: forbidden } as never, profileReads as never, scopes as never, parents as never);
    const args = [{ userId: "u" } as never, { sessionId: "s" } as never, "ws", "dep-private", undefined] as const;
    return { forbidden, identity, parents, canary, sandbox, args };
  }
  const kinds = [["canary", "CANARY", "canary"], ["sandbox", "SANDBOX", "sandbox"]] as const;

  it.each(kinds)("%s: the sealed parent is returned untouched unless identity is asked for", async (key, family) => {
    const s = services(), body = await s[key].detail(...s.args) as Record<string, unknown>;
    expect(body).toEqual(followingParentRead.parse(parentBody(family)));
    expect(Object.keys(body)).not.toContain("identity");
    expect(s.identity).not.toHaveBeenCalled(); expect(s.forbidden).not.toHaveBeenCalled();
  });

  it.each(kinds)("%s: include=identity attaches the closed identity and runs no legacy composer", async (key, family, environment) => {
    const s = services(), body = await s[key].detail(...s.args, "identity") as Record<string, unknown>;
    expect(body.identity).toEqual({ basis: "RETAINED_PROJECTION_ROW_AND_FIELD_POLICY", alpha_id: "own", alpha_name: null,
      portfolio_name: "Own Book", alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null });
    expect({ ...body, identity: undefined }).toEqual({ ...followingParentRead.parse(parentBody(family)), identity: undefined });
    assertPublishedSchema(OPERATIONS, family === "SANDBOX" ? "SandboxParentReadV2" : "CanaryParentReadV2", body);
    expect(s.identity).toHaveBeenCalledExactlyOnceWith(expect.anything(), environment, "dep-private");
    expect(s.forbidden).not.toHaveBeenCalled();
  });

  it.each(kinds)("%s: a viewer the identity source hides gets a typed absence while the parent stays readable", async (key) => {
    const s = services();
    s.identity.mockResolvedValue(IDENTITY_NOT_AUTHORIZED as never);
    const body = await s[key].detail(...s.args, "identity") as { identity: unknown };
    expect(body.identity).toEqual({ basis: "RETAINED_PROJECTION_ROW_AND_FIELD_POLICY", alpha_id: null, alpha_name: null,
      portfolio_name: null, alpha_reason_code: "ALPHA_IDENTITY_NOT_AUTHORIZED", portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    s.identity.mockResolvedValue(IDENTITY_NOT_READ as never);
    expect((await s[key].detail(...s.args, "identity") as { identity: unknown }).identity).toMatchObject({
      alpha_reason_code: "DEPLOYMENT_IDENTITY_NOT_READ", portfolio_name_reason_code: "DEPLOYMENT_IDENTITY_NOT_READ" });
  });

  it.each(kinds)("%s: a changed authority ends the request, no parent body without its identity is served", async (key) => {
    const s = services();
    s.identity.mockRejectedValue(Object.assign(new Error("changed"), { status: 409, code: "EXECUTION_READ_ACCESS_CHANGED" }));
    await expect(s[key].detail(...s.args, "identity")).rejects.toMatchObject({ status: 409 });
    expect(s.forbidden).not.toHaveBeenCalled();
  });

  it.each(kinds)("%s: a bad include is refused before any parent read", async (key) => {
    for (const include of ["stage_facts", "identity,identity", "", ["identity"], 1]) {
      const s = services();
      await expect(s[key].detail(...s.args, include)).rejects.toMatchObject({ status: 400, code: "EXECUTION_READ_QUERY_INVALID" });
      expect(s.parents.detail).not.toHaveBeenCalled(); expect(s.identity).not.toHaveBeenCalled();
    }
  });
});

describe("BE-P12 ProfileReadService.deploymentIdentity over the real scoped source", () => {
  const identityOf = (f: Fixture, id: string = f.deployment.deployment_id) =>
    new ProfileReadService(f.product).deploymentIdentity(f.principal, "canary", id);

  it("names the portfolio and alpha the viewer is allowed to see", async () => {
    const f = liveFixture();
    expect(await identityOf(f)).toEqual({ alpha_id: "own", alpha_name: null, portfolio_name: "Own Book",
      alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null });
  });
  it("hides the name of a portfolio shared with a hidden peer", async () => {
    const f = liveFixture({ deployment: OWN }), identity = await identityOf(f);
    expect(identity).toMatchObject({ alpha_id: "own", portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    expect(JSON.stringify(identity)).not.toContain("Shared Book");
  });
  it("a hidden peer's deployment is one uniform NOT_AUTHORIZED answer", async () => {
    const f = liveFixture();
    expect(await identityOf(f, PEER.deployment_id)).toEqual(IDENTITY_NOT_AUTHORIZED);
    expect(await identityOf(f, "no-such-deployment")).toEqual(IDENTITY_NOT_AUTHORIZED);
  });
  it("a viewer with no read grant at all is the same typed absence, with no source data", async () => {
    const f = liveFixture();
    f.context.grants = [];
    expect(await identityOf(f)).toEqual(IDENTITY_NOT_AUTHORIZED);
  });
  it("authority that changes before delivery ends the call (409) instead of becoming an absence", async () => {
    const f = liveFixture(), snapshot = f.repository.rawSnapshot.getMockImplementation()!;
    f.repository.rawSnapshot.mockImplementation(async () => {
      const result = await snapshot();
      f.context.authority_fingerprint = "TEST_ONLY-changed-before-delivery";
      return result;
    });
    await expect(identityOf(f)).rejects.toMatchObject({ status: 409, code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
});
