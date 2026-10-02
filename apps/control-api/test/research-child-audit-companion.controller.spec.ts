import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { SessionGuard } from "../src/facade/session.guard";
import { ResearchChildAuditCompanionController } from "../src/research/child-audit-companion.controller";
const request=()=>({portalUser:{userId:"audit-user"},portalWorkspaceId:"audit-workspace",raw:{once:vi.fn(),off:vi.fn()}});
const reply=()=>({header:vi.fn(),send:vi.fn(v=>v)});
describe("named audit companion session boundary",()=>{
  it("retains SessionGuard, membership, finite selectors, cancellation and renewable no-store semantics",async()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,ResearchChildAuditCompanionController)).toContain(SessionGuard);
    const service={page:vi.fn().mockResolvedValue({okay:true})}, member=vi.fn().mockResolvedValue(true);
    const c=new ResearchChildAuditCompanionController(service as never,{isMember:member} as never),req=request(),res=reply();
    await c.page(req as never,res as never,"audit-run",{fold_id:"fold_000",limit:"200"});
    expect(member).toHaveBeenCalledWith("audit-workspace","audit-user");
    expect(service.page).toHaveBeenCalledWith({workspaceId:"audit-workspace",actorUserId:"audit-user"},"audit-run",{fold_id:"fold_000",limit:200},expect.any(AbortSignal));
    expect(res.header).toHaveBeenCalledWith("cache-control","private, no-store");
    expect(res.header).not.toHaveBeenCalledWith("etag",expect.anything());
    expect(req.raw.off).toHaveBeenCalledWith("aborted",expect.any(Function));
  });
  it("hides foreign workspace and refuses invalid selectors before any read",async()=>{
    const service={page:vi.fn()}, c=new ResearchChildAuditCompanionController(service as never,{isMember:vi.fn().mockResolvedValue(false)} as never);
    await expect(c.page(request() as never,reply() as never,"audit-run",{workspace_id:"foreign"})).rejects.toMatchObject({status:404});
    for(const query of [{limit:201},{table:"TRIAL"},{context:"anything"}])
      await expect(c.page(request() as never,reply() as never,"audit-run",query)).rejects.toMatchObject({status:400});
    await expect(c.page(request() as never,reply() as never,"../../private",{})).rejects.toMatchObject({status:400});
    expect(service.page).not.toHaveBeenCalled();
  });
});
