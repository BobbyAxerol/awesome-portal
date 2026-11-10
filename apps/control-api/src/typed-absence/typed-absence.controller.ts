import { Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthSession, PortalUser } from "../domain";
import { ExecutionReadScopeError } from "../execution-v2/read-scope";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";

interface Request extends FastifyRequest { portalUser: PortalUser; portalSession: AuthSession; portalWorkspaceId: string; }

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$(?![\s\S])/);
const workspaceOnly = z.object({ workspace_id: text.optional() }).strict();
const controlsQuery = z.object({ workspace_id: text.optional(), scope_type: text.optional(), scope_id: text.optional() }).strict();
const lifecycleQuery = z.object({ workspace_id: text.optional(), environment: z.enum(["paper", "sandbox", "live"]).optional() }).strict();

/**
 * Typed absence for four contract-published reads that have no Portal producer yet (execution-controls, execution-alpha-lifecycle,
 * execution-incident-children, execution-portfolio-members; each contract says "CONTRACT ONLY: no producer exists yet ... every screen
 * keeps its typed absence"). The body is the contract's own no-source answer: the envelope and the echoed ids, every section OMITTED,
 * which the contract defines as "no owning source". Nothing here reads a database or an Edge, mints a section, or states a count, a
 * state or a zero. Only a session with Execution read access to the workspace gets the answer; every other caller gets the same typed
 * 404 as a read that is not available. UNMOUNTED by default (see AppModule `typedAbsence`).
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class TypedAbsenceController {
  constructor(@Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}

  @Get("/controls") @Header("Cache-Control", "private, no-store")
  async controls(@Req() request: Request, @Query() raw: unknown) {
    const query = controlsQuery.safeParse(raw);
    if (!query.success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id);
    return envelope("portal.execution.controls.v1", workspaceId, {});
  }

  @Get("/alphas/:alpha_id/lifecycle") @Header("Cache-Control", "private, no-store")
  async lifecycle(@Req() request: Request, @Param("alpha_id") alphaId: string, @Query() raw: unknown) {
    const query = lifecycleQuery.safeParse(raw);
    // AlphaLifecycleProblem publishes only EXECUTION_READ_NOT_AVAILABLE and EXECUTION_READ_CURRENT_ONLY (no query-invalid code, although
    // the 400 response names this schema), so an unreadable id or query is answered with the published 404, never an off-contract code.
    if (!query.success || !id.safeParse(alphaId).success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const workspaceId = await this.authorize(request, query.data.workspace_id, query.data.environment);
    return envelope("portal.execution.alpha-lifecycle.v1", workspaceId, { alpha_id: alphaId });
  }

  @Get("/operations/incidents/:incident_id/children") @Header("Cache-Control", "private, no-store")
  async incidentChildren(@Req() request: Request, @Param("incident_id") incidentId: string, @Query() raw: unknown) {
    const query = workspaceOnly.safeParse(raw);
    if (!query.success || !id.safeParse(incidentId).success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id);
    return envelope("portal.execution.incident-children.v1", workspaceId, { incident_id: incidentId });
  }

  @Get("/portfolios/:portfolio_id/members") @Header("Cache-Control", "private, no-store")
  async portfolioMembers(@Req() request: Request, @Param("portfolio_id") portfolioId: string, @Query() raw: unknown) {
    const query = workspaceOnly.safeParse(raw);
    if (!query.success || !id.safeParse(portfolioId).success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id);
    return envelope("portal.execution.portfolio-members.v1", workspaceId, { portfolio_id: portfolioId });
  }

  /** The caller's own workspace unless a named one is readable; the same 404 for every refusal, so existence is never confirmed. */
  private async authorize(request: Request, named: string | undefined, environment?: string): Promise<string> {
    const workspaceId = named ?? request.portalWorkspaceId;
    if (!await this.workspaces.canReadExecution(workspaceId, request.portalUser.userId, environment))
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    return workspaceId;
  }
}

/** The contracts' required fields only; every optional section stays omitted ("no owning source"). */
function envelope(schemaVersion: string, workspaceId: string, ids: Record<string, string>) {
  return { schema_version: schemaVersion, workspace_id: workspaceId, ...ids, record_authority: "PORTAL_PROJECTION" as const, read_at_ms: Date.now() };
}
