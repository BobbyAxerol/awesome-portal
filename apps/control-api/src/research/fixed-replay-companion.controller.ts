/** Named fresh fixed OOS companion; old replay/report responses stay intact. */
import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { FixedReplayCompanionQuerySchema } from "./fixed-replay-companion.contract";
import { ResearchReplayError } from "./replay.error";
import { ResearchFixedReplayCompanionService } from "./fixed-replay-companion.service";

interface ReplayRequest extends FastifyRequest {portalUser:{userId:string};portalWorkspaceId:string;}
@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchFixedReplayCompanionController {
  constructor(@Inject(ResearchFixedReplayCompanionService) private readonly service:ResearchFixedReplayCompanionService,
    @Inject(WorkspacesRepository) private readonly workspaces:WorkspacesRepository) {}
  @Get(":runId/replay/observations")
  async observations(@Req() request:ReplayRequest,@Res() reply:FastifyReply,@Param("runId") runId:string,@Query() raw:unknown) {
    const query=FixedReplayCompanionQuerySchema.safeParse(raw);
    if(!query.success || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId))
      throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Invalid fixed OOS observation query.",400);
    const workspaceId=query.data.workspace_id ?? request.portalWorkspaceId;
    if(!(await this.workspaces.isMember(workspaceId,request.portalUser.userId)))
      throw new ResearchReplayError("RESEARCH_REPLAY_NOT_FOUND","Research workspace was not found.",404);
    const abort=new AbortController(),onAborted=()=>abort.abort();
    request.raw.once("aborted",onAborted);
    try {
      reply.header("cache-control","private, no-store");
      return reply.send(await this.service.observations({workspaceId,actorUserId:request.portalUser.userId},runId,query.data,abort.signal));
    } finally {request.raw.off("aborted",onAborted);}
  }
}
