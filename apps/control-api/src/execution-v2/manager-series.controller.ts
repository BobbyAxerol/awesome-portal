import { Controller, Get, Header, Inject, Query, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyRequest, type FastifyReply } from "fastify";
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

  read(r:SeriesRequest,raw:unknown):ReturnType<ManagerSeriesService["read"]>;
  read(r:SeriesRequest,raw:unknown,reply:FastifyReply):Promise<Awaited<ReturnType<ManagerSeriesService["read"]>>|void>;
  @Get("/series") @Header("Cache-Control", "private, no-store")
  async read(@Req() r: SeriesRequest, @Query() raw: unknown, @Res({passthrough:true}) reply?:FastifyReply) {
    let nativeOwnsResponse=false;
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
      const principal={user:r.portalUser,session:r.portalSession,workspaceId:workspace,
        viewerWorkspaceId:r.portalViewerWorkspaceId??r.portalWorkspaceId};
      if(this.series.shouldUseNativeCurrent(principal,query)){
        if(!reply)throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
        const beforeDispatch=()=>{
          if(nativeOwnsResponse)return;
          if(reply.raw.headersSent||reply.raw.writableEnded||reply.raw.destroyed)
            throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
          // Called synchronously only after source ENTER and final Core COMMIT.
          reply.hijack();nativeOwnsResponse=true;
        };
        await this.series.readNative(principal,query,reply.raw,beforeDispatch);
        return;
      }
      return await this.series.read(principal,query);
    } catch (error) {
      // Never send an ordinary error DTO after the native writer has owned the
      // transport. Its real ABORTED/UNKNOWN custody must remain authoritative.
      if(reply&&(nativeOwnsResponse||reply.raw.headersSent||reply.raw.writableEnded||reply.raw.destroyed)){
        if(!reply.raw.destroyed)reply.raw.destroy();return;
      }
      if (error instanceof ExecutionReadScopeError) throw error;
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    }
  }
}
