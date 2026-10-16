import { Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ExecutionReadScopeError } from "./read-scope";
import { ManagerModelService } from "./manager-model.service";
import type { ManagerSurface } from "./manager-model";

interface ManagerRequest extends FastifyRequest { portalUser: PortalUser; portalSession: AuthSession;
  portalWorkspaceId: string; portalViewerWorkspaceId?: string; }
/** Closed named BFFs; no relation/URL/SQL/projection generation selector. */
@Controller("/api/v1/execution/manager")
@UseGuards(SessionGuard)
export class ManagerModelController {
  constructor(@Inject(ManagerModelService) private readonly models: ManagerModelService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}
  @Get("/fund-overview") @Header("Cache-Control", "private, no-store")
  fund(@Req() r: ManagerRequest, @Query() q: unknown) { return this.read(r, q, "FUND"); }
  @Get("/fleet") @Header("Cache-Control", "private, no-store")
  fleet(@Req() r: ManagerRequest, @Query() q: unknown) { return this.read(r, q, "FLEET"); }
  @Get("/portfolios/:id/overview") @Header("Cache-Control", "private, no-store")
  portfolio(@Req() r: ManagerRequest, @Query() q: unknown, @Param("id") id: string) { return this.read(r, q, "PORTFOLIO", id); }
  @Get("/alphas/:id/overview") @Header("Cache-Control", "private, no-store")
  alpha(@Req() r: ManagerRequest, @Query() q: unknown, @Param("id") id: string) { return this.read(r, q, "ALPHA", id); }
  @Get("/accounts/:id/overview") @Header("Cache-Control", "private, no-store")
  account(@Req() r: ManagerRequest, @Query() q: unknown, @Param("id") id: string) { return this.read(r, q, "ACCOUNT", id); }
  @Get("/deployments/:id/overview") @Header("Cache-Control", "private, no-store")
  deployment(@Req() r: ManagerRequest, @Query() q: unknown, @Param("id") id: string) { return this.read(r, q, "DEPLOYMENT", id); }

  private async read(r: ManagerRequest, raw: unknown, surface: ManagerSurface, id?: string) {
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || id !== undefined && (!id || id.length > 256))
        throw new Error("INVALID_QUERY");
      const query: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
      for (const field of ["filters", "sort", "economic_partition"]) if (typeof query[field] === "string") {
        if ((query[field] as string).length > 4096) throw new Error("QUERY_LIMIT");
        query[field] = JSON.parse(query[field] as string);
      }
      for (const field of ["stage_filter", "group_by"]) if (typeof query[field] === "string") query[field] = (query[field] as string).split(",");
      if (typeof query.limit === "string") query.limit = /^\d{1,3}$/.test(query.limit) ? Number(query.limit) : NaN;
      const workspace = typeof query.workspace_id === "string" ? query.workspace_id : r.portalWorkspaceId;
      if (!(await this.workspaces.canReadExecution(workspace, r.portalUser.userId)))
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      return await this.models.read({ user: r.portalUser, session: r.portalSession, workspaceId: workspace,
        viewerWorkspaceId: r.portalViewerWorkspaceId ?? r.portalWorkspaceId }, surface, query, id);
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    }
  }
}
