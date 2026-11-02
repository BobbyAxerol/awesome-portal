import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Injectable, Module, type ExecutionContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";
import Ajv2020 from "ajv/dist/2020";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalEvidenceController } from "../src/approval-evidence/approval-evidence.controller";
import { ApprovalEvidenceReads } from "../src/approval-evidence/approval-evidence.service";
import type { ApprovalEvidenceFieldAuthority, ApprovalVisibility } from "../src/approval-evidence/approval-evidence.authority";
import type { ApprovalEvidencePort } from "../src/approval-evidence/approval-evidence.port";
import { AuthError } from "../src/auth/auth.service";
import { SessionGuard } from "../src/facade/session.guard";
import { GovernanceError } from "../src/governance/governance.service";
import { HttpErrorFilter } from "../src/http-error.filter";
import { WorkspacesRepository } from "../src/repos/workspaces";

// HTTP serialization/route/guard harness only. No database, native provider,
// current session authority or connected-source claim is made by this fixture.
@Module({}) class SyntheticEvidenceHttpModule {}
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-approval-evidence.published.synthetic.valid.json"), "utf8")).value;
const api = JSON.parse(readFileSync(resolve(contracts, "openapi/execution-approval-evidence.openapi.json"), "utf8"));
const validateProblem = new Ajv2020({ strict: true }).compile(api.components.schemas.ApprovalEvidenceProblem);
const route = "/api/v1/execution/governance/approvals/approval-1/evidence";

describe("approval evidence synthetic HTTP delivery", () => {
  let app: NestFastifyApplication, http: FastifyInstance;
  let workspaceMember = true, visible = true, sectionAllowed = true, revokeOnRead = false, failClosed = false;
  let visibilityCalls = 0, revokeFieldOnFinal = false, malformedSection = false;
  const fieldAuthority: ApprovalEvidenceFieldAuthority = { allows: () => sectionAllowed };
  const visibility: ApprovalVisibility = { visible: async () => {
    visibilityCalls++;
    if (failClosed) throw new GovernanceError("ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED", "Read unavailable.", 503);
    if (revokeFieldOnFinal && visibilityCalls === 2) sectionAllowed = false;
    return visible;
  } };
  const port: ApprovalEvidencePort = { read: vi.fn(async r => {
    if (revokeOnRead) visible = false;
    return { identity: r, sections: { obligations_after_approval: malformedSection
      ? { ...fixture.obligations_after_approval, working_orders: -1 }
      : fixture.obligations_after_approval } };
  }) };
  @Injectable() class SyntheticGuard { canActivate(ctx: ExecutionContext) {
    const request = ctx.switchToHttp().getRequest();
    if (request.headers["x-test-session"] !== "valid") throw new AuthError("SESSION_REQUIRED", "Authentication required.", 401);
    request.portalUser = { userId: "user-1" };
    request.portalSession = { sessionId: "session-1" };
    request.portalWorkspaceId = "ws-1";
    return true;
  } }
  let originalGuards: unknown;
  beforeAll(async () => {
    originalGuards = Reflect.getMetadata("__guards__", ApprovalEvidenceController);
    Reflect.defineMetadata("__guards__", [SyntheticGuard], ApprovalEvidenceController);
    app = await NestFactory.create<NestFastifyApplication>({ module: SyntheticEvidenceHttpModule,
      controllers: [ApprovalEvidenceController], providers: [
        SyntheticGuard,
        { provide: ApprovalEvidenceReads, useValue: new ApprovalEvidenceReads(port, visibility, fieldAuthority, visibility) },
        { provide: WorkspacesRepository, useValue: { isMember: async (ws: string) => workspaceMember && ws === "ws-1" } },
      ] }, new FastifyAdapter(), { logger: false, abortOnError: false });
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    http = app.getHttpAdapter().getInstance<FastifyInstance>();
    await http.ready();
  });
  beforeEach(() => { workspaceMember = true; visible = true; sectionAllowed = true; revokeOnRead = false; failClosed = false;
    visibilityCalls = 0; revokeFieldOnFinal = false; malformedSection = false; vi.mocked(port.read).mockClear(); });
  afterAll(async () => { if (app) await app.close(); Reflect.defineMetadata("__guards__", originalGuards ?? [SessionGuard], ApprovalEvidenceController); });
  const get = (url = route, session = true) => http.inject({ method: "GET", url, headers: session ? { "x-test-session": "valid" } : {} });
  const checkProblem = (body: unknown) => expect(validateProblem(body), JSON.stringify(validateProblem.errors)).toBe(true);

  it("returns an authorized section with a private non-cacheable response", async () => {
    const response = await get();
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().obligations_after_approval).toEqual(fixture.obligations_after_approval);
  });
  it("refuses an absent session and a foreign workspace before reading the port", async () => {
    const missing = await get(route, false);
    expect(missing.statusCode).toBe(401); checkProblem(missing.json());
    expect(missing.headers["cache-control"]).toBe("private, no-store");
    const other = await get(`${route}?workspace_id=ws-2`);
    expect(other.statusCode).toBe(404); checkProblem(other.json());
    expect(other.headers["cache-control"]).toBe("private, no-store");
    expect(port.read).not.toHaveBeenCalled();
  });
  it("does not serialize source sections when visibility is revoked while the source is read", async () => {
    revokeOnRead = true;
    const response = await get();
    expect(response.statusCode).toBe(404); checkProblem(response.json());
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().error.code).toBe("APPROVAL_NOT_FOUND");
    expect(response.body).not.toContain("open_positions");
  });
  it("preserves the dark governance 503 instead of reporting evidence", async () => {
    failClosed = true;
    const response = await get();
    expect(response.statusCode).toBe(503); checkProblem(response.json());
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().error.code).toBe("ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED");
    expect(response.body).not.toContain("obligations_after_approval");
    expect(port.read).not.toHaveBeenCalled();
  });
  it("withholds the published section over HTTP when field access is revoked during final visibility", async () => {
    revokeFieldOnFinal = true;
    const response = await get();
    expect(response.statusCode).toBe(200);
    expect(response.json().obligations_after_approval).toBeNull();
    expect(response.body).not.toContain("open_positions");
  });
  it("does not expose malformed data in a section the caller cannot read", async () => {
    sectionAllowed = false; malformedSection = true;
    const response = await get();
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().obligations_after_approval).toBeNull();
    expect(response.body).not.toContain("open_positions");
  });
  it("withholds a malformed section if field access is revoked at the final visibility check", async () => {
    malformedSection = true; revokeFieldOnFinal = true;
    const response = await get();
    expect(response.statusCode).toBe(200);
    expect(response.json().obligations_after_approval).toBeNull();
    expect(visibilityCalls).toBe(2);
  });
  it("returns not found if visibility is revoked before a malformed section is delivered", async () => {
    malformedSection = true; revokeOnRead = true;
    const response = await get();
    expect(response.statusCode).toBe(404); checkProblem(response.json());
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().error.code).toBe("APPROVAL_NOT_FOUND");
    expect(response.body).not.toContain("open_positions");
  });
  it("refuses malformed evidence when the caller still has field access", async () => {
    malformedSection = true;
    const response = await get();
    expect(response.statusCode).toBe(503); checkProblem(response.json());
    expect(response.json().error.code).toBe("OPERATIONAL_READ_PROVENANCE_INVALID");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});
