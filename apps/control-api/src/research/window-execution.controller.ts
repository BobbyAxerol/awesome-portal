import {Controller,Get,Inject,Param,Query,Req,Res,UseGuards} from "@nestjs/common";
import type {FastifyReply,FastifyRequest} from "fastify";
import {SessionGuard} from "../facade/session.guard";
import {WorkspacesRepository} from "../repos/workspaces";
import {ResearchWindowExecutionService} from "./window-execution.service";
import {WindowExecutionQuerySchema} from "./window-execution.contract";
import {ResearchReplayError} from "./replay.error";
interface Request extends FastifyRequest{portalUser:{userId:string};portalWorkspaceId:string;}
@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt")
export class ResearchWindowExecutionController {
  constructor(@Inject(ResearchWindowExecutionService)private readonly service:ResearchWindowExecutionService,
    @Inject(WorkspacesRepository)private readonly workspaces:WorkspacesRepository){}
  @Get("runs/:runId/windows/analytics")
  async analytics(@Req()r:Request,@Res()reply:FastifyReply,@Param("runId")id:string,@Query()q:unknown){return this.read(r,reply,id,q,"ANALYTICS");}
  @Get("runs/:runId/windows/observations")
  async observations(@Req()r:Request,@Res()reply:FastifyReply,@Param("runId")id:string,@Query()q:unknown){return this.read(r,reply,id,q,"OBSERVATION");}
  @Get("runs/:runId/execution/records")
  async records(@Req()r:Request,@Res()reply:FastifyReply,@Param("runId")id:string,@Query()q:unknown){return this.read(r,reply,id,q,"EXECUTION");}
  @Get("windows/compare")
  async compare(@Req()r:Request,@Res()reply:FastifyReply,@Query()raw:unknown){
    if(!raw||typeof raw!=="object")throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Invalid window comparison query.",400);
    const {runs,...rest}=raw as Record<string,unknown>;
    if(Object.keys(rest).some(k=>!["workspace_id","window","fold_id"].includes(k)))
      throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Unsupported comparison filter.",400);
    if(typeof runs!=="string"||!/^rrun_[a-f0-9]{32},rrun_[a-f0-9]{32}$/.test(runs))throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Two exact run IDs are required.",400);
    const {scope,query}=await this.scope(r,rest);
    const abort=new AbortController(),onAbort=()=>abort.abort();r.raw.once("aborted",onAbort);
    try{reply.header("cache-control","private, no-store");
      return reply.send(await this.service.compare(scope,runs.split(",") as [string,string],query,abort.signal));}
    finally{r.raw.off("aborted",onAbort);}
  }
  private async scope(r:Request,raw:unknown){
    const parsed=WindowExecutionQuerySchema.safeParse(raw);
    if(!parsed.success)throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Invalid named window query.",400);
    const workspaceId=parsed.data.workspace_id??r.portalWorkspaceId;
    if(!await this.workspaces.isMember(workspaceId,r.portalUser.userId))throw new ResearchReplayError("RESEARCH_REPLAY_NOT_FOUND","Research workspace was not found.",404);
    return {scope:{workspaceId,actorUserId:r.portalUser.userId},query:parsed.data};
  }
  private async read(r:Request,reply:FastifyReply,id:string,raw:unknown,kind:"OBSERVATION"|"ANALYTICS"|"EXECUTION"){
    const {scope,query}=await this.scope(r,raw),abort=new AbortController(),onAbort=()=>abort.abort();r.raw.once("aborted",onAbort);
    try{reply.header("cache-control","private, no-store");return reply.send(await this.service.read(scope,id,query,kind,abort.signal));}
    finally{r.raw.off("aborted",onAbort);}
  }
}
