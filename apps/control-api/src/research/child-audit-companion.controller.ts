/** Named companion GET; legacy replay/child-audit remains unchanged. */
import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ChildAuditCompanionQuerySchema } from "./child-audit-companion.contract";
import { ResearchCurrentSourceRunIdSchema } from "./current-source.contract";
import { ResearchCurrentSourceError } from "./current-source.error";
import { ResearchChildAuditCompanionService } from "./child-audit-companion.service";

interface AuditRequest extends FastifyRequest {
  portalUser: { userId: string }; portalWorkspaceId: string;
}
@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchChildAuditCompanionController {
  constructor(@Inject(ResearchChildAuditCompanionService) private readonly service: ResearchChildAuditCompanionService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}

  @Get(":runId/current-source/child-audit-companion")
  async page(@Req() request: AuditRequest, @Res() reply: FastifyReply,
    @Param("runId") runId: string, @Query() raw: unknown) {
    const query = ChildAuditCompanionQuerySchema.safeParse(raw);
    if (!query.success || !ResearchCurrentSourceRunIdSchema.safeParse(runId).success)
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID","Invalid audit companion query.",400);
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId,request.portalUser.userId)))
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_NOT_FOUND","Research workspace was not found.",404);
    const abort = new AbortController(), onAborted = () => abort.abort();
    request.raw.once("aborted",onAborted);
    try {
      reply.header("cache-control","private, no-store");
      return reply.send(await this.service.page({workspaceId,actorUserId:request.portalUser.userId},runId,query.data,abort.signal));
    } finally { request.raw.off("aborted",onAborted); }
  }
}
