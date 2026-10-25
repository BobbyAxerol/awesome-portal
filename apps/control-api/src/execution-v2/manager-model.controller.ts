import { Controller, Get, Header, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyRequest, type FastifyReply } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ExecutionReadScopeError } from "./read-scope";
import { ManagerModelService } from "./manager-model.service";
import type { ManagerSurface } from "./manager-model";
import { rejectManagerAsOf } from "./manager-query-p1";

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
  account(@Req() r: ManagerRequest, @Query() q: unknown, @Param("id") id: string,
    @Res({ passthrough: true }) reply?: FastifyReply) { return this.read(r, q, "ACCOUNT", id, reply); }
  @Get("/deployments/:id/overview") @Header("Cache-Control", "private, no-store")
  deployment(@Req() r: ManagerRequest, @Query() q: unknown, @Param("id") id: string) { return this.read(r, q, "DEPLOYMENT", id); }

  private async read(r: ManagerRequest, raw: unknown, surface: ManagerSurface, id?: string, reply?: FastifyReply) {
    let nativeOwnsResponse = false;
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || id !== undefined && (!id || id.length > 256))
        throw new Error("INVALID_QUERY");
      const query: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
      rejectManagerAsOf(query);
      if (typeof query.window === "string" && !["7D", "30D", "90D", "ALL"].includes(query.window)) {
        if (query.window.length > 256) throw new Error("QUERY_LIMIT");
        query.window = JSON.parse(query.window);
      }
      for (const field of ["filters", "sort", "economic_partition", "group_sort", "group_filters"]) if (typeof query[field] === "string") {
        if ((query[field] as string).length > 4096) throw new Error("QUERY_LIMIT");
        query[field] = JSON.parse(query[field] as string);
      }
      for (const field of ["stage_filter", "group_by"]) if (typeof query[field] === "string") query[field] = (query[field] as string).split(",");
      for (const field of ["limit", "group_limit"]) if (typeof query[field] === "string")
        query[field] = /^\d{1,3}$/.test(query[field] as string) ? Number(query[field]) : NaN;
      const workspace = typeof query.workspace_id === "string" ? query.workspace_id : r.portalWorkspaceId;
      if (!(await this.workspaces.canReadExecution(workspace, r.portalUser.userId)))
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const principal = { user: r.portalUser, session: r.portalSession, workspaceId: workspace,
        viewerWorkspaceId: r.portalViewerWorkspaceId ?? r.portalWorkspaceId };
      if (surface === "ACCOUNT" && (query.environment === undefined || query.environment === "paper") && this.models.hasNativeCurrentRelations?.()) {
        // Only this exact finite Paper route selects the private native
        // composition. Its failures never fall back to a detached DTO; other
        // surfaces keep their independent ordinary scopes unchanged.
        if (!id || !reply)
          throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        await this.models.readNativeAccount(principal, query, id, reply.raw, () => {
          if (nativeOwnsResponse) return;
          if (reply.raw.headersSent || reply.raw.writableEnded || reply.raw.destroyed)
            throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
          // This callback runs only after reservation, source ENTER and the
          // final Core COMMIT. No bytes or Fastify writer precede that boundary.
          reply.hijack();
          nativeOwnsResponse = true;
        });
        return;
      }
      return await this.models.read(principal, surface, query, id);
    } catch (error) {
      // Once the native egress owns the response, a later source ACK failure
      // cannot trigger a second framework response or a fallback body.
      if (reply && (nativeOwnsResponse || reply.raw.headersSent || reply.raw.destroyed || reply.sent)) {
        reply.raw.destroy();
        return;
      }
      if (error instanceof ExecutionReadScopeError) throw error;
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    }
  }
}
