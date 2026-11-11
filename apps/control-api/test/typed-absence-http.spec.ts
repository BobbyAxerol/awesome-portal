import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Injectable, Module, type ExecutionContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";
import Ajv2020 from "ajv/dist/2020";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "../src/auth/auth.service";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { TypedAbsenceController } from "../src/typed-absence/typed-absence.controller";
import { typedAbsenceDependency } from "../src/typed-absence/typed-absence.bootstrap";

// B3: route serialization, workspace refusals and the contract's own no-source body. A synthetic guard stands in for the session.
@Module({}) class SyntheticTypedAbsenceModule {}
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const routes = [
  { name: "execution-controls", schema: "Controls", fixture: "execution-controls.no-source", path: "/api/v1/execution/controls", extra: { }, id: null, invalid: 400 as number },
  { name: "execution-alpha-lifecycle", schema: "AlphaLifecycle", fixture: "execution-alpha-lifecycle.no-source", path: "/api/v1/execution/alphas/alpha-1/lifecycle", extra: { alpha_id: "alpha-1" }, id: "alpha_id", invalid: 404 as number },
  { name: "execution-incident-children", schema: "IncidentChildren", fixture: "execution-incident-children.no-source", path: "/api/v1/execution/operations/incidents/inc-1/children", extra: { incident_id: "inc-1" }, id: "incident_id", invalid: 400 as number },
  { name: "execution-portfolio-members", schema: "PortfolioMembers", fixture: "execution-portfolio-members.no-source", path: "/api/v1/execution/portfolios/pf-1/members", extra: { portfolio_id: "pf-1" }, id: "portfolio_id", invalid: 400 as number },
];
// The six scoped reads: the body names the scope the request itself named (environment, or subject); the lists, buckets and totals stay omitted.
const subject = { type: "DEPLOYMENT", id: "dep-1" };
const scoped = [
  { name: "execution-blotter-summary", schema: "BlotterSummary", path: "/api/v1/execution/blotter/summary", scope: "environment=live&deployment_id=dep-1", bare: "", version: "portal.execution.blotter-summary.v1", extra: { environment: "live" }, badValue: "environment=paper2" },
  { name: "execution-alpha-readiness", schema: "AlphaReadiness", path: "/api/v1/execution/readiness", scope: "environment=paper", bare: "", version: "portal.execution.alpha-readiness.v1", extra: { environment: "paper" }, badValue: "environment=PAPER" },
  { name: "execution-cost-events", schema: "CostEvents", path: "/api/v1/execution/cost-events", scope: "subject_type=DEPLOYMENT&subject_id=dep-1&window=7d", bare: "", version: "portal.execution.cost-events.v1", extra: { subject }, badValue: "subject_type=deployment&subject_id=dep-1" },
  { name: "execution-grants", schema: "Grants", path: "/api/v1/execution/grants", scope: "subject_type=DEPLOYMENT&subject_id=dep-1", bare: "", version: "portal.execution.grants.v1", extra: { subject }, badValue: "subject_type=DEPLOYMENT&subject_id=bad%20id" },
  { name: "execution-limits", schema: "Limits", path: "/api/v1/execution/limits", scope: "subject_type=DEPLOYMENT&subject_id=dep-1", bare: "", version: "portal.execution.limits.v1", extra: { subject }, badValue: "subject_type=NOPE&subject_id=dep-1" },
  { name: "execution-recovery-events", schema: "RecoveryEvents", path: "/api/v1/execution/recovery-events", scope: "subject_type=DEPLOYMENT&subject_id=dep-1", bare: "", version: "portal.execution.recovery-events.v1", extra: { subject }, badValue: "subject_type=DEPLOYMENT&subject_id=a%2Fb" },
  { name: "execution-report-snapshots", schema: "ReportSnapshots", path: "/api/v1/execution/reports", scope: "subject_type=DEPLOYMENT&subject_id=dep-1", bare: "", version: "portal.execution.report-snapshots.v1", extra: { subject }, badValue: "subject_type=DEPLOYMENT&subject_id=" },
];
const load = (name: string) => JSON.parse(readFileSync(resolve(contracts, name), "utf8"));

describe("typed-absence HTTP routes (B3)", () => {
  let app: NestFastifyApplication, http: FastifyInstance, readable = true;
  const canRead = vi.fn(async (workspace: string) => readable && workspace === "ws-1");
  @Injectable() class SyntheticGuard { canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getResponse().header("Cache-Control", "private, no-store");
    const request = ctx.switchToHttp().getRequest();
    if (request.headers["x-test-session"] !== "valid") throw new AuthError("SESSION_REQUIRED", "Authentication required.", 401);
    request.portalUser = { userId: "user-1" }; request.portalSession = { sessionId: "session-1" }; request.portalWorkspaceId = "ws-1"; return true;
  } }
  let originalGuards: unknown;
  beforeAll(async () => {
    originalGuards = Reflect.getMetadata("__guards__", TypedAbsenceController);
    Reflect.defineMetadata("__guards__", [SyntheticGuard], TypedAbsenceController);
    app = await NestFactory.create<NestFastifyApplication>({ module: SyntheticTypedAbsenceModule, controllers: [TypedAbsenceController],
      providers: [SyntheticGuard, { provide: WorkspacesRepository, useValue: { canReadExecution: canRead } }] },
    new FastifyAdapter(), { logger: false, abortOnError: false });
    app.useGlobalFilters(new HttpErrorFilter()); await app.init();
    http = app.getHttpAdapter().getInstance() as FastifyInstance; await http.ready();
  });
  beforeEach(() => { readable = true; canRead.mockClear(); });
  afterAll(async () => { if (app) await app.close(); Reflect.defineMetadata("__guards__", originalGuards ?? [SessionGuard], TypedAbsenceController); });
  const get = (url: string, session = true) => http.inject({ method: "GET", url, headers: session ? { "x-test-session": "valid" } : {} });

  for (const route of routes) {
    describe(route.name, () => {
      const api = load(`openapi/${route.name}.openapi.json`);
      const validate = new Ajv2020({ strict: true }).compile(api.components.schemas[route.schema]);
      const problem = new Ajv2020({ strict: true }).compile(api.components.schemas[`${route.schema}Problem`]);

      it("answers the contract's no-source body: valid, private, and inside the published fixture's shape", async () => {
        const response = await get(route.path);
        expect(response.statusCode, response.body).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        const body = response.json();
        expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
        const fixture = load(`fixtures/${route.fixture}.synthetic.valid.json`).value;
        // the fixture may also carry optional identity fields (alpha_version_id); nothing outside its shape may appear
        for (const key of Object.keys(body)) expect(Object.keys(fixture), key).toContain(key);
        expect(body).toMatchObject({ schema_version: fixture.schema_version, workspace_id: "ws-1", record_authority: "PORTAL_PROJECTION", ...route.extra });
        expect(Number.isInteger(body.read_at_ms)).toBe(true);
        expect(canRead).toHaveBeenCalledWith("ws-1", "user-1", undefined);
      });
      it("is typed on every refusal: 401 without a session, 404 for an unreadable workspace, 400 for an unknown key (404 on the lifecycle: its published problem has no query-invalid code)", async () => {
        for (const [url, session, status] of [[route.path, false, 401], [`${route.path}?workspace_id=ws-2`, true, 404], [`${route.path}?extra=1`, true, route.invalid]] as const) {
          const response = await get(url, session);
          expect(response.statusCode, response.body).toBe(status);
          expect(response.headers["cache-control"]).toBe("private, no-store");
          if (status !== 401) expect(problem(response.json()), JSON.stringify(problem.errors)).toBe(true);
        }
        readable = false;
        const refused = await get(route.path);
        expect(refused.statusCode).toBe(404);
        expect(refused.json().error.code).toBe("EXECUTION_READ_NOT_AVAILABLE");
        expect(refused.body).not.toContain("workspace_id\":\"ws");
      });
      if (route.id !== null) it("refuses an id outside the contract's grammar", async () => {
        const response = await get(route.path.replace(/\/[^/]+(\/(?:lifecycle|children|members))$/, "/bad%20id$1"));
        expect(response.statusCode).toBe(route.invalid);
        expect(problem(response.json())).toBe(true);
      });
    });
  }

  for (const route of scoped) {
    describe(`${route.name} (scoped)`, () => {
      const api = load(`openapi/${route.name}.openapi.json`);
      const validate = new Ajv2020({ strict: true }).compile(api.components.schemas[route.schema]);
      const problem = new Ajv2020({ strict: true }).compile(api.components.schemas[`${route.schema}Problem`]);
      const url = `${route.path}?${route.scope}`;
      it("answers the no-source body for the scope the request named: valid, private, every list or total omitted", async () => {
        const response = await get(url);
        expect(response.statusCode, response.body).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        const body = response.json();
        expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
        expect(body).toMatchObject({ schema_version: route.version, workspace_id: "ws-1", record_authority: "PORTAL_PROJECTION", ...route.extra });
        // nothing beyond the envelope and the echoed scope: no section, count, state or zero
        expect(Object.keys(body).sort()).toEqual(["read_at_ms", "record_authority", "schema_version", "workspace_id", ...Object.keys(route.extra)].sort());
        expect(Number.isInteger(body.read_at_ms)).toBe(true);
        expect(canRead).toHaveBeenCalledWith("ws-1", "user-1", route.name === "execution-blotter-summary" ? "live" : route.name === "execution-alpha-readiness" ? "paper" : undefined);
      });
      it("is typed on every refusal: 401 without a session, 404 for an unreadable or unnamed scope, 400 for an unknown or malformed key", async () => {
        for (const [target, session, status] of [
          [url, false, 401], [`${url}&workspace_id=ws-2`, true, 404], [route.path, true, 404], [`${url}&extra=1`, true, 400], [`${route.path}?${route.badValue}`, true, 400],
          [`${url}&${route.scope.split("&")[0]}`, true, 400],
        ] as const) {
          const response = await get(target, session);
          expect(response.statusCode, `${target}: ${response.body}`).toBe(status);
          expect(response.headers["cache-control"]).toBe("private, no-store");
          if (status !== 401) {
            expect(problem(response.json()), JSON.stringify(problem.errors)).toBe(true);
            expect(response.json().error.code).toBe(status === 400 ? "EXECUTION_READ_QUERY_INVALID" : "EXECUTION_READ_NOT_AVAILABLE");
          }
        }
        readable = false;
        const refused = await get(url);
        expect(refused.statusCode).toBe(404);
        expect(refused.json().error.code).toBe("EXECUTION_READ_NOT_AVAILABLE");
        expect(refused.body).not.toContain("dep-1");
      });
      it("answers an unnamed scope after the workspace check, so an unreadable workspace is never told what was missing", async () => {
        readable = false;
        const response = await get(route.path);
        expect(response.statusCode).toBe(404);
        expect(canRead).toHaveBeenCalled();
      });
    });
  }

  describe("execution-entity-search (command-bar search)", () => {
    const api = load("openapi/execution-entity-search.openapi.json");
    const validate = new Ajv2020({ strict: true }).compile(api.components.schemas.EntitySearch);
    const problem = new Ajv2020({ strict: true }).compile(api.components.schemas.EntitySearchProblem);
    const ALL = ["alpha", "portfolio", "account", "operation", "incident", "approval"];
    const path = "/api/v1/execution/search";
    it("answers every asked kind NOT_COMMISSIONED: valid, private, no row, no count, and the published fixture's shape", async () => {
      const response = await get(`${path}?q=carry`);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      const body = response.json();
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      expect(body).toMatchObject({ schema_version: "portal.execution.entity-search.v1", workspace_id: "ws-1", record_authority: "PORTAL_PROJECTION", query: { q: "carry", kinds: ALL, limit: 8 } });
      expect(body.groups).toEqual(ALL.map((kind) => ({ kind, total_matched: null, rows: [], state: "NOT_COMMISSIONED" })));
      const fixture = load("fixtures/execution-entity-search.not-commissioned.synthetic.valid.json").value;
      expect(Object.keys(body).sort()).toEqual(Object.keys(fixture).sort());
      expect(canRead).toHaveBeenCalledWith("ws-1", "user-1", undefined);
    });
    it("answers only the kinds asked, in the order asked, and echoes the limit", async () => {
      const body = (await get(`${path}?q=zz&kinds=approval,alpha&limit=3`)).json();
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      expect(body.query).toEqual({ q: "zz", kinds: ["approval", "alpha"], limit: 3 });
      expect(body.groups.map((g: { kind: string }) => g.kind)).toEqual(["approval", "alpha"]);
    });
    it("is typed on every refusal: 401 without a session, 404 for an unreadable workspace, 400 for any malformed key", async () => {
      for (const [target, session, status] of [
        [`${path}?q=carry`, false, 401], [`${path}?q=carry&workspace_id=ws-2`, true, 404],
        [path, true, 400], [`${path}?q=`, true, 400], [`${path}?q=a&q=b`, true, 400], [`${path}?q=%01bad`, true, 400], [`${path}?q=${"x".repeat(129)}`, true, 400],
        [`${path}?q=a&kinds=user`, true, 400], [`${path}?q=a&kinds=alpha,alpha`, true, 400], [`${path}?q=a&kinds=`, true, 400],
        [`${path}?q=a&limit=0`, true, 400], [`${path}?q=a&limit=51`, true, 400], [`${path}?q=a&limit=abc`, true, 400], [`${path}?q=a&extra=1`, true, 400],
      ] as const) {
        const response = await get(target, session);
        expect(response.statusCode, `${target}: ${response.body}`).toBe(status);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        if (status !== 401) {
          expect(problem(response.json()), JSON.stringify(problem.errors)).toBe(true);
          expect(response.json().error.code).toBe(status === 400 ? "EXECUTION_READ_QUERY_INVALID" : "EXECUTION_READ_NOT_AVAILABLE");
        }
      }
      readable = false;
      const refused = await get(`${path}?q=secretword`);
      expect(refused.statusCode).toBe(404);
      expect(refused.json().error.code).toBe("EXECUTION_READ_NOT_AVAILABLE");
      expect(refused.body).not.toContain("secretword");
    });
    it("gives an unreadable workspace the same 404 and never confirms the query was accepted", async () => {
      readable = false;
      const response = await get(`${path}?q=ok`);
      expect(response.statusCode).toBe(404);
      expect(canRead).toHaveBeenCalled();
    });
  });

  it("states no section, no count and no zero: only the envelope and the echoed ids are present", async () => {
    for (const route of routes) {
      const keys = Object.keys((await get(route.path)).json()).sort();
      expect(keys).toEqual(["read_at_ms", "record_authority", "schema_version", "workspace_id", ...Object.keys(route.extra)].sort());
    }
  });

  it("mounts only on the retained-review profile and adds no flag", () => {
    expect(typedAbsenceDependency({ EXECUTION_READ_PROFILE: "retained_review_v1" })).toEqual({ typedAbsence: "SOURCE_DARK" });
    expect(typedAbsenceDependency({})).toEqual({});
    expect(typedAbsenceDependency({ EXECUTION_READ_PROFILE: "native_manager_review_v1" })).toEqual({});
  });
});
