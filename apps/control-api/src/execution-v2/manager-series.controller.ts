import { Controller, Get, Header, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ExecutionReadScopeError } from "./read-scope";
import { ManagerSeriesService } from "./manager-series.service";
import { rejectManagerAsOf } from "./manager-query-p1";

interface SeriesRequest extends FastifyRequest { portalUser: PortalUser; portalSession: AuthSession;
  portalWorkspaceId: string; portalViewerWorkspaceId?: string; }
/** FE-013 / FE-033: one closed named read; no relation, SQL, URL or source selector. */
@Controller("/api/v1/execution/manager")
@UseGuards(SessionGuard)
export class ManagerSeriesController {
  constructor(@Inject(ManagerSeriesService) private readonly series: ManagerSeriesService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}

  @Get("/series") @Header("Cache-Control", "private, no-store")
  async read(@Req() r: SeriesRequest, @Query() raw: unknown) {
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_QUERY");
      const query: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
      rejectManagerAsOf(query);
      if (Buffer.byteLength(JSON.stringify(query)) > 8192) throw new Error("QUERY_LIMIT");
      // `subjects`, `economic_partition` and an exact `window` travel as JSON; the 7D/30D/90D/ALL presets as plain text.
      if (typeof query.window === "string" && !["7D", "30D", "90D", "ALL"].includes(query.window)) query.window = JSON.parse(query.window);
      for (const field of ["subjects", "economic_partition"]) if (typeof query[field] === "string") query[field] = JSON.parse(query[field] as string);
      const workspace = typeof query.workspace_id === "string" ? query.workspace_id : r.portalWorkspaceId;
      if (!(await this.workspaces.canReadExecution(workspace, r.portalUser.userId)))
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      return await this.series.read({ user: r.portalUser, session: r.portalSession, workspaceId: workspace,
        viewerWorkspaceId: r.portalViewerWorkspaceId ?? r.portalWorkspaceId }, query);
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    }
  }
}
