import {Controller,Get,Header,Inject,Query,Req,UseGuards} from "@nestjs/common";
import type {FastifyRequest} from "fastify";
import type {AuthSession,PortalUser} from "../domain";
import {SessionGuard} from "../facade/session.guard";
import {WorkspacesRepository} from "../repos/workspaces";
import {ExecutionReadScopeError} from "./read-scope";
import {ManagerScoreRevisionService} from "./manager-score-revision.service";
interface Request extends FastifyRequest{portalUser:PortalUser;portalSession:AuthSession;portalWorkspaceId:string;portalViewerWorkspaceId?:string}
/** Separate named historical reads; no current Manager route/DTO changes. */
@Controller("/api/v1/execution/manager") @UseGuards(SessionGuard)
export class ManagerScoreRevisionController{
  constructor(@Inject(ManagerScoreRevisionService) private readonly service:ManagerScoreRevisionService,
    @Inject(WorkspacesRepository) private readonly workspaces:WorkspacesRepository){}
  @Get("/score-view") @Header("Cache-Control","private, no-store")
  view(@Req() request:Request,@Query() query:unknown){return this.read(request,query,false);}
  @Get("/score-revisions") @Header("Cache-Control","private, no-store")
  revisions(@Req() request:Request,@Query() query:unknown){return this.read(request,query,true);}
  private async read(request:Request,raw:unknown,history:boolean){
    try{
      if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))
        throw new Error("QUERY_INVALID");
      const descriptors=Object.getOwnPropertyDescriptors(raw);
      if(Reflect.ownKeys(raw).length>13||Reflect.ownKeys(raw).some(k=>typeof k!=="string")||
        Object.values(descriptors).some(d=>!d.enumerable||!Object.hasOwn(d,"value")))throw new Error("QUERY_INVALID");
      const query=Object.fromEntries(Object.entries(descriptors).map(([key,value])=>[key,value.value]));
      // HTTP query values are strings (or a finite repeated-string array), not
      // caller objects with getters/toJSON hooks. Parse nested JSON only here.
      if(Object.values(query).some(value=>typeof value!=="string"&&!(Array.isArray(value)&&value.length<=4&&
        Object.getPrototypeOf(value)===Array.prototype&&Reflect.ownKeys(value).length===value.length+1&&
        Object.getOwnPropertyDescriptors(value)&&Object.keys(value).every((key,index)=>key===String(index)&&
          Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,"value")&&typeof Object.getOwnPropertyDescriptor(value,key)!.value==="string"))))
        throw new Error("QUERY_INVALID");
      if(Buffer.byteLength(JSON.stringify(query))>8192)throw new Error("QUERY_BOUND");
      if(typeof query.economic_partition==="string"){
        if(query.economic_partition.length>4096)throw new Error("QUERY_BOUND");query.economic_partition=JSON.parse(query.economic_partition);
      }
      if(typeof query.stage_filter==="string")query.stage_filter=query.stage_filter?query.stage_filter.split(","):[];
      if(typeof query.limit==="string")query.limit=/^[0-9]{1,2}$(?![\s\S])/.test(query.limit)?Number(query.limit):NaN;
      const workspace=typeof query.workspace_id==="string"?query.workspace_id:request.portalWorkspaceId;
      let allowed:boolean;
      try{allowed=await this.workspaces.canReadExecution(workspace,request.portalUser.userId);}
      catch(error){if(error instanceof ExecutionReadScopeError)throw error;
        throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);}
      if(!allowed)
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",404);
      const principal={user:request.portalUser,session:request.portalSession,workspaceId:workspace,
        viewerWorkspaceId:request.portalViewerWorkspaceId??request.portalWorkspaceId};
      return history?await this.service.history(principal,query):await this.service.read(principal,query);
    }catch(error){if(error instanceof ExecutionReadScopeError)throw error;throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",400);}
  }
}
