/**
 * FE-066 / S3-U5: Alpha-Portfolio identity of a deployment. Real scope/policy/product
 * reader over synthetic authority and stored rows (TEST_ONLY); no PostgreSQL.
 */
import { describe, expect, it, vi } from "vitest";
import {
  attachDeploymentIdentity, composeDeploymentIdentity, deploymentIdentityOf, IDENTITY_NOT_READ, identityFields,
} from "../src/execution/deployment-identity";
import { ProfileReadService } from "../src/profile-read/profile-read.service";
import { PaperReadService } from "../src/paper-read/paper-read.service";
import { LiveOperationsService } from "../src/live/live-operations.service";
import { CanaryService } from "../src/canary/canary.service";
import { SandboxCertificationService } from "../src/sandbox/sandbox-certification.service";
import { GovernanceError } from "../src/governance/governance.service";
import { OWN, PEER, PRIVATE, FIELDS, productReadFixture } from "./elp2-product-read.fixture";
import { testConfig } from "./harness";

const SCREEN = "EXECUTION_PAPER_WORKBENCH_SCREEN";
const row = (fields: Record<string, string | null>) => ({ fields,
  lineage: { workspace_id: "w", profile_id: "p", source_contract_revision: "r" } });
const portfolioRelation = (items: Record<string, string | null>[], availability = "AVAILABLE") => ({
  source_id: "manager.portfolios", relation: "portfolios", availability, reason_code: null, as_of: null,
  freshness: "FRESH", completeness: "COMPLETE", items: items.map(row) });

function withDeployments(options: Parameters<typeof productReadFixture>[0] = {}, portfolios?: Record<string, string | null>[]) {
  const f = productReadFixture(options);
  const relations = f.snapshot.document.relations as Record<string, any>;
  relations["manager.deployments:strategy_deployments"].items.push(
    row({ ...PRIVATE, strategy_id: "strategy-own", mode: "paper", venue: "VENUE" }));
  if (portfolios) relations["manager.portfolios:portfolios"] = portfolioRelation(portfolios);
  const resolve = (id: string) => f.product.resolveDeploymentScope(f.principal as never, "paper", SCREEN, id);
  return { ...f, relations, resolve };
}
const BOOKS = [
  { portfolio_id: PRIVATE.portfolio_id, name: "Own Book", base_currency: "USDT" },
  { portfolio_id: OWN.portfolio_id, name: "Shared Book", base_currency: "USDT" },
];

describe("composeDeploymentIdentity (pure)", () => {
  const rows = (...r: Record<string, string>[]) => ({ kind: "ROWS" as const, rows: r, nameAllowed: true });
  const qualified = (alphaIds: string[], alphaIdAllowed = true) => ({ kind: "QUALIFIED" as const, alphaIds, alphaIdAllowed });

  it("names alpha_id only from qualified membership; a name nobody publishes stays typed absent", () => {
    const id = composeDeploymentIdentity({ portfolioId: "pf", membership: qualified(["a1", "a1"]),
      portfolios: rows({ portfolio_id: "pf", name: "Core" }) });
    expect(id).toEqual({ alpha_id: "a1", alpha_name: null, portfolio_name: "Core",
      alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null });
  });

  it("never promotes a strategy id or anything else to an alpha id without qualified membership", () => {
    const id = composeDeploymentIdentity({ portfolioId: "pf", membership: { kind: "UNQUALIFIED" }, portfolios: rows() });
    expect(id.alpha_id).toBeNull();
    expect(id.alpha_reason_code).toBe("ALPHA_MEMBERSHIP_NOT_QUALIFIED");
    expect(id.portfolio_name_reason_code).toBe("PORTFOLIO_NAME_NOT_PUBLISHED");
  });

  it.each([
    [qualified([]), "ALPHA_MEMBERSHIP_NOT_PUBLISHED"],
    [qualified(["a1", "a2"]), "ALPHA_MEMBERSHIP_AMBIGUOUS"],
    [qualified(["a1"], false), "ALPHA_IDENTITY_NOT_AUTHORIZED"],
    [qualified(["bad id with spaces"]), "ALPHA_MEMBERSHIP_NOT_PUBLISHED"],
  ])("alpha reason %#", (membership, reason) => {
    const id = composeDeploymentIdentity({ portfolioId: "pf", membership, portfolios: rows() });
    expect(id.alpha_id).toBeNull();
    expect(id.alpha_reason_code).toBe(reason);
  });

  it.each([
    [{ portfolioId: null, portfolios: rows() }, "PORTFOLIO_NOT_ASSIGNED"],
    [{ portfolioId: "", portfolios: rows() }, "PORTFOLIO_NOT_ASSIGNED"],
    [{ portfolioId: "pf", portfolios: { kind: "UNAVAILABLE" as const } }, "PORTFOLIO_NAME_NOT_PUBLISHED"],
    [{ portfolioId: "pf", portfolios: { kind: "ROWS" as const, rows: [], nameAllowed: false } }, "PORTFOLIO_NAME_NOT_AUTHORIZED"],
    [{ portfolioId: "pf", portfolioIdAllowed: false, portfolios: rows() }, "PORTFOLIO_NAME_NOT_AUTHORIZED"],
    [{ portfolioId: "pf", portfolios: { kind: "ROWS" as const, rows: [], nameAllowed: true, hiddenMatch: true } }, "PORTFOLIO_NAME_NOT_AUTHORIZED"],
    [{ portfolioId: "pf", portfolios: rows({ portfolio_id: "pf", name: "A" }, { portfolio_id: "pf", name: "B" }) }, "PORTFOLIO_NAME_AMBIGUOUS"],
    [{ portfolioId: "pf", portfolios: rows({ portfolio_id: "pf" }) }, "PORTFOLIO_NAME_NOT_PUBLISHED"],
    [{ portfolioId: "pf", portfolios: rows({ portfolio_id: "pf", name: "" }) }, "PORTFOLIO_NAME_NOT_PUBLISHED"],
    [{ portfolioId: "pf", portfolios: rows({ portfolio_id: "pf", name: "evil‮name" }) }, "PORTFOLIO_NAME_NOT_PUBLISHED"],
    [{ portfolioId: "pf", portfolios: rows({ portfolio_id: "pf", name: " padded " }) }, "PORTFOLIO_NAME_NOT_PUBLISHED"],
    [{ portfolioId: "pf", portfolios: rows({ portfolio_id: "pf", name: "x".repeat(257) }) }, "PORTFOLIO_NAME_NOT_PUBLISHED"],
  ])("portfolio reason %#", (input, reason) => {
    const id = composeDeploymentIdentity({ membership: { kind: "UNQUALIFIED" }, ...input } as never);
    expect(id.portfolio_name).toBeNull();
    expect(id.portfolio_name_reason_code).toBe(reason);
  });

  it("another portfolio's row is never matched by name or position", () => {
    const id = composeDeploymentIdentity({ portfolioId: "pf", membership: { kind: "UNQUALIFIED" },
      portfolios: rows({ portfolio_id: "other", name: "Other" }) });
    expect(id.portfolio_name).toBeNull();
  });

  it("the not-read constant carries a reason on every null", () => {
    expect(IDENTITY_NOT_READ.alpha_reason_code).toBe("DEPLOYMENT_IDENTITY_NOT_READ");
    expect(IDENTITY_NOT_READ.portfolio_name_reason_code).toBe("DEPLOYMENT_IDENTITY_NOT_READ");
    expect(deploymentIdentityOf(undefined)).toBe(IDENTITY_NOT_READ);
    expect(deploymentIdentityOf({})).toBe(IDENTITY_NOT_READ);
    const body = {}; const id = composeDeploymentIdentity({ portfolioId: null, membership: { kind: "UNQUALIFIED" }, portfolios: { kind: "UNAVAILABLE" } });
    expect(deploymentIdentityOf(attachDeploymentIdentity(body, id))).toBe(id);
    expect(Object.keys(identityFields(id))).toEqual(["alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"]);
  });
});

describe("resolveDeploymentScope carries the identity inside the authority fence", () => {
  it("SCOPED_V2: alpha from the qualified tuple, portfolio name from the visible row", async () => {
    const f = withDeployments({}, BOOKS);
    const result = await f.resolve(PRIVATE.deployment_id);
    expect(result.state).toBe("FOUND");
    expect(result.state === "FOUND" && result.identity).toEqual({ alpha_id: "own", alpha_name: null, portfolio_name: "Own Book",
      alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null });
  });

  it("SCOPED_V2: a portfolio shared with a hidden peer alpha is not named to this viewer", async () => {
    const f = withDeployments({}, BOOKS);
    const result = await f.resolve(OWN.deployment_id);
    expect(result.state === "FOUND" && result.identity).toMatchObject({ alpha_id: "own", portfolio_name: null,
      portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    expect(JSON.stringify(result)).not.toContain("Shared Book");
  });

  it("SCOPED_V2: the field policy decides alpha_id and the name separately", async () => {
    const noAlpha = await withDeployments({ fields: FIELDS.filter(field => field !== "alpha_id") }, BOOKS).resolve(PRIVATE.deployment_id);
    expect(noAlpha.state === "FOUND" && noAlpha.identity).toMatchObject({ alpha_id: null,
      alpha_reason_code: "ALPHA_IDENTITY_NOT_AUTHORIZED", portfolio_name: "Own Book" });
    const noName = await withDeployments({ fields: FIELDS.filter(field => field !== "name") }, BOOKS).resolve(PRIVATE.deployment_id);
    expect(noName.state === "FOUND" && noName.identity).toMatchObject({ alpha_id: "own", portfolio_name: null,
      portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
  });

  it("SCOPED_V2 without a published portfolios relation: typed not published, not a guess", async () => {
    const result = await withDeployments({}).resolve(PRIVATE.deployment_id);
    expect(result.state === "FOUND" && result.identity).toMatchObject({ alpha_id: "own", portfolio_name: null,
      portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_PUBLISHED" });
  });

  it("LEGACY_COMPATIBILITY: no qualified alpha membership exists, the strategy id is NOT an alpha id", async () => {
    const f = withDeployments({ legacy: true }, BOOKS);
    const result = await f.resolve(OWN.deployment_id);
    expect(result.state).toBe("FOUND");
    expect(result.state === "FOUND" && result.identity).toEqual({ alpha_id: null, alpha_name: null, portfolio_name: "Shared Book",
      alpha_reason_code: "ALPHA_MEMBERSHIP_NOT_QUALIFIED", portfolio_name_reason_code: null });
    expect(result.state === "FOUND" && result.deployment.strategy_id).toBe("strategy-own");
  });

  it("the profile snapshot hands the identity to the stage composers without adding a key to the body", async () => {
    const identity = composeDeploymentIdentity({ portfolioId: "pf", membership: { kind: "QUALIFIED", alphaIds: ["alpha-9"], alphaIdAllowed: true },
      portfolios: { kind: "ROWS", nameAllowed: true, rows: [{ portfolio_id: "pf", name: "Core" }] } });
    const scope = { deploymentId: "dep_1", strategyId: "s1", accountId: "a1", mode: "sandbox", venue: "V", portfolioId: "pf", externalAccountRef: null, tupleUnique: true };
    const resolutions: Record<string, unknown> = {
      "dep_1": { state: "FOUND", reasonCode: null, scope, deployment: { deployment_id: "dep_1" }, identity },
      "dep_2": { state: "FOUND", reasonCode: null, scope, deployment: { deployment_id: "dep_2" } },
      "dep_3": { state: "EMPTY", reasonCode: "EDS03_DEPLOYMENT_NOT_FOUND" },
    };
    const source = { resolveDeploymentScope: vi.fn(async (_p: unknown, _e: string, _s: string, id: string) => resolutions[id]),
      relation: vi.fn(async () => { throw new Error("relation detail must not escape"); }) };
    const service = new ProfileReadService(source as never);
    const read = (id: string) => service.snapshot({ user: {} as never, session: {} as never, workspaceId: "w" }, "sandbox",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", id);
    const body = await read("dep_1");
    expect(deploymentIdentityOf(body)).toBe(identity);
    expect(Object.keys(body)).not.toContain("deployment_identity");
    expect(JSON.stringify(body)).not.toContain("alpha_reason_code");
    // A resolution without an identity, or without an exact scope, carries none: the composers then say NOT_READ.
    expect(deploymentIdentityOf(await read("dep_2"))).toBe(IDENTITY_NOT_READ);
    expect(deploymentIdentityOf(await read("dep_3"))).toBe(IDENTITY_NOT_READ);
  });
});

describe("producers publish the identity keys beside the deployment id", () => {
  const user = { userId: "u1", username: "u1", role: "ADMIN" } as never;
  const identity = composeDeploymentIdentity({ portfolioId: "pf", membership: { kind: "QUALIFIED", alphaIds: ["alpha-9"], alphaIdAllowed: true },
    portfolios: { kind: "ROWS", nameAllowed: true, rows: [{ portfolio_id: "pf", name: "Core" }] } });
  const KEYS = ["alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"];

  it("Paper workbench: deployment block", async () => {
    const config = testConfig();
    const deployment = { deployment_id: "dep_1", strategy_id: "s1", account_id: "a1", mode: "paper", venue: "V", portfolio_id: "pf" };
    const found = (identityValue?: unknown) => ({
      relation: vi.fn(async (_p: unknown, _e: string, _s: string, _src: string, relation: string) => ({
        schema_version: "portal.execution.local-projection-bff.v1", source: { completeness: "COMPLETE", freshness: "FRESH", as_of: "2026-10-20T00:00:00Z" },
        relation, items: relation === "strategy_deployments" ? [deployment] : [], page: { next_cursor: null } })),
      resolveDeploymentScope: vi.fn(async () => ({ state: "FOUND", reasonCode: null, deployment,
        scope: { deploymentId: "dep_1", strategyId: "s1", accountId: "a1", mode: "paper", venue: "V", portfolioId: "pf", externalAccountRef: null, tupleUnique: true },
        ...(identityValue ? { identity: identityValue } : {}) })),
    });
    const principal = { user, session: {} as never, workspaceId: "w" };
    const read = async (source: unknown) => (await new PaperReadService(source as never, config).workbench(principal as never, "dep_1", false) as any).data.deployment;
    const withIdentity = await read(found(identity));
    expect(withIdentity).toMatchObject({ deployment_id: "dep_1", strategy_id: "s1", alpha_id: "alpha-9", alpha_name: null, portfolio_name: "Core",
      alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null });
    // A source that did not compute the identity says so, by reason, never by omission.
    const notRead = await read(found());
    expect(KEYS.every(key => key in notRead)).toBe(true);
    expect(notRead).toMatchObject({ alpha_id: null, alpha_reason_code: "DEPLOYMENT_IDENTITY_NOT_READ", portfolio_name_reason_code: "DEPLOYMENT_IDENTITY_NOT_READ" });
  });

  it("Live Full Operations (source-only and Canary-backed composers)", async () => {
    const source = attachDeploymentIdentity({ state: "ready", data: { deployments: [{ deployment_id: "dep_1", portfolio_id: "pf", account_id: "a1", venue: "V" }] } }, identity);
    const service = new LiveOperationsService({} as never, {} as never, { FEATURE_EXECUTION_REALTIME_SSE: "false" } as never, {} as never);
    const body = (service as any).sourceOnlyDetail(user, "dep_1", source);
    expect(body.deployment).toMatchObject({ deployment_id: "dep_1", portfolio_id: "pf", alpha_id: "alpha-9", portfolio_name: "Core" });
    const bare = (service as any).sourceOnlyDetail(user, "dep_1", { state: "ready", data: { deployments: [{ deployment_id: "dep_1" }] } });
    expect(bare.deployment).toMatchObject({ alpha_id: null, alpha_reason_code: "DEPLOYMENT_IDENTITY_NOT_READ" });
  });

  it("Canary control room: deployment block", () => {
    const service = new CanaryService({} as never, {} as never, {} as never);
    const certification = { portfolio_id: "pf", account_id: "a1", external_account_ref: "x", venue: "V", artifact_digest: "d", r1_approval_id: "r1",
      r2_approval_id: "r2", certification_id: "c1" };
    const envelope = { envelope_id: "e1", deployment_id: "dep_1", revision: 1, previous_envelope_id: null, status: "DRAFT", currency: "USDT",
      capital_cap: "1", gross_notional_cap: "1", daily_loss_cap: "1", max_open_orders: 1, duration_days: 1, blocker_codes: [], reason: "r",
      evidence_set_hash: "h", created_by_user_id: "u", actor_user_id: "u", base_risk_profile_revision: "b", delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE", created_at: new Date("2026-10-20T00:00:00Z") };
    const lineage = { certification: { certification }, promotionPlan: { plan_id: "p1" } };
    const withSource = (service as any).publicDetail(user, envelope, lineage, false, attachDeploymentIdentity({ state: "unavailable" }, identity));
    expect(withSource.deployment).toMatchObject({ deployment_id: "dep_1", portfolio_id: "pf", alpha_id: "alpha-9", portfolio_name: "Core" });
    const created = (service as any).publicDetail(user, envelope, lineage, false);
    expect(created.deployment).toMatchObject({ alpha_id: null, alpha_reason_code: "DEPLOYMENT_IDENTITY_NOT_READ" });
  });

  it("Sandbox certification: certification record (source-only composer)", () => {
    const service = new SandboxCertificationService({} as never, {} as never);
    const source = attachDeploymentIdentity({ state: "ready", data: { deployments: [{ deployment_id: "dep_1", portfolio_id: "pf", account_id: "a1", venue: "V" }] } }, identity);
    const body = (service as any).sourceOnlyDetail(user, "dep_1", source);
    expect(body.certification).toMatchObject({ deployment_id: "dep_1", portfolio_id: "pf", alpha_id: "alpha-9", portfolio_name: "Core" });
    expect(() => (service as any).sourceOnlyDetail(user, "dep_9", { state: "ready", data: { deployments: [] } })).toThrow(GovernanceError);
  });
});
