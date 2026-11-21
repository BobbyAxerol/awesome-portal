import "reflect-metadata";
import { describe,expect,it,vi } from "vitest";
import { GUARDS_METADATA,PATH_METADATA } from "@nestjs/common/constants";
import { SessionGuard } from "../src/facade/session.guard";
import { ResearchFixedReplayCompanionController } from "../src/research/fixed-replay-companion.controller";
const request=()=>({portalUser:{userId:"fixed-replay-user"},portalWorkspaceId:"fixed-replay-workspace",raw:{once:vi.fn(),off:vi.fn()}});
const reply=()=>({header:vi.fn(),send:vi.fn(v=>v)});
describe("named fixed replay observation session boundary",()=>{
  it("uses exact named GET with session/membership/finite-selector/cancellation/no-store boundary",async()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,ResearchFixedReplayCompanionController)).toContain(SessionGuard);
    expect(Reflect.getMetadata(PATH_METADATA,ResearchFixedReplayCompanionController.prototype.observations)).toBe(":runId/replay/observations");
    const service={observations:vi.fn().mockResolvedValue({okay:true})},member=vi.fn().mockResolvedValue(true);
    const c=new ResearchFixedReplayCompanionController(service as never,{isMember:member} as never),req=request(),res=reply();
    await c.observations(req as never,res as never,"fixed-replay-run",{source_ordinal:"0",limit:"200"});
    expect(member).toHaveBeenCalledWith("fixed-replay-workspace","fixed-replay-user");
    expect(service.observations).toHaveBeenCalledWith({workspaceId:"fixed-replay-workspace",actorUserId:"fixed-replay-user"},"fixed-replay-run",{source_ordinal:0,limit:200},expect.any(AbortSignal));
    expect(res.header).toHaveBeenCalledWith("cache-control","private, no-store");
    expect(req.raw.off).toHaveBeenCalledWith("aborted",expect.any(Function));
  });
  it("hides foreign tenants and rejects broad or raw-locator selectors without calling service",async()=>{
    const service={observations:vi.fn()},c=new ResearchFixedReplayCompanionController(service as never,{isMember:vi.fn().mockResolvedValue(false)} as never);
    await expect(c.observations(request() as never,reply() as never,"fixed-replay-run",{workspace_id:"foreign"})).rejects.toMatchObject({status:404});
    for(const query of [{limit:201},{table:"fills"},{path:"raw.parquet"},{source_ordinal:1,cursor:"x"}])
      await expect(c.observations(request() as never,reply() as never,"fixed-replay-run",query)).rejects.toMatchObject({status:400});
    await expect(c.observations(request() as never,reply() as never,"../../private",{})).rejects.toMatchObject({status:400});
    expect(service.observations).not.toHaveBeenCalled();
  });
});
