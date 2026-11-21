import {describe,expect,it,vi} from "vitest";
import {MarketContextService} from "../src/execution/market-context.service";
import {ExecutionCurrentSourceController} from "../src/execution/current-source.controller";
describe("ELP2-04 named market transport and retired raw routes",()=>{
  it.each(["latest","candles"] as const)("refuses unqualified V2 private %s transport before upstream",async method=>{
    const upstream={fixedPathForNamedOperation:vi.fn()};
    const scopes={selectionMode:vi.fn().mockResolvedValue("SCOPED_V2")};
    const service=new MarketContextService(upstream as never,{FEATURE_EXECUTION_MARKET_CONTEXT:"true"} as never,scopes as never);
    const principal={user:{userId:"TEST_ONLY"},session:{sessionId:"TEST_ONLY"},workspaceId:"TEST_ONLY",viewerWorkspaceId:"TEST_ONLY-viewer"};
    await expect(service[method](principal as never,{environment:"paper"} as never)).rejects.toMatchObject({code:"MARKET_CONTEXT_SCOPED_TRANSPORT_NOT_COMMISSIONED",status:503});
    expect(upstream.fixedPathForNamedOperation).not.toHaveBeenCalled();expect(scopes.selectionMode).toHaveBeenCalledWith(principal);
  });
  it.each(["screen","relation"] as const)("keeps arbitrary source %s route retired",method=>{
    const controller=new ExecutionCurrentSourceController();
    expect(()=>method==="screen"?controller.screen("paper","anything"):controller.relation()).toThrowError(expect.objectContaining({code:"N20_RAW_SOURCE_BROWSER_FORBIDDEN",status:410}));
  });
});
