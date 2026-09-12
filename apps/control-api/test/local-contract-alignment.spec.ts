import { describe, expect, it, vi } from "vitest";
import { testConfig } from "./harness";
import { assertLocalPortfolioContract } from "./contract-validator";
import { LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
import { Portfolio360LocalService } from "../src/execution/portfolio360-local.service";
import { ExecutionProfileReadAdapterService } from "../src/execution/profile-read-adapter.service";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";

const config = { ...testConfig(), EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws",
  EXECUTION_EDGE_PAPER_PROFILE_ID: "paper-profile" };

describe("BE-R2-8 exact retained read contracts", () => {
  it("isolates same-id Paper/Sandbox/Live, shared-account alphas and a selected account", async () => {
    const cfg = {...config,FEATURE_EXECUTION_LOCAL_PROJECTION:"true",FEATURE_EXECUTION_CURRENT_SOURCE_PAPER:"true",
      FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX:"true",FEATURE_EXECUTION_CURRENT_SOURCE_LIVE:"true",
      EXECUTION_EDGE_SANDBOX_PROFILE_ID:"sandbox-profile",EXECUTION_EDGE_LIVE_PROFILE_ID:"live-profile" };
    const group = (items:Record<string,string>[])=>({availability:"AVAILABLE",freshness:"FRESH",completeness:"COMPLETE",items:items.map(fields=>({fields}))});
    const snapshot = vi.fn().mockImplementation(async (_ws:string,env:string,profile:string)=>({
      projectionEpoch:"epoch",projectionSequence:1,payloadDigest:`sha256:${"a".repeat(64)}`,completeness:"COMPLETE",
      sourceAsOf:new Date("2026-09-01T00:00:00Z"),lastSuccessfulRefreshAt:new Date(),document:{workspace_id:"ws",environment:env,profile_id:profile,relations:{
        "manager.strategies:strategies":group([{strategy_id:"alpha-a"},{strategy_id:"alpha-b"}]),
        "manager.deployments:strategy_deployments":group([
          {deployment_id:"d-a",strategy_id:"alpha-a",account_id:"shared",portfolio_id:"pf"},
          {deployment_id:"d-b",strategy_id:"alpha-b",account_id:"shared",portfolio_id:"pf"},
          {deployment_id:"d-c",strategy_id:"alpha-a",account_id:"other",portfolio_id:"pf"}]),
        "manager.accounts:accounts":group([{account_id:"shared"},{account_id:"other"}]),
        "manager.orders:orders":group([
          {order_id:`${env}-a`,strategy_id:"alpha-a",deployment_id:"d-a",account_id:"shared",status:"FILLED"},
          {order_id:`${env}-b`,strategy_id:"alpha-b",deployment_id:"d-b",account_id:"shared",status:"FILLED"},
          {order_id:`${env}-c`,strategy_id:"alpha-a",deployment_id:"d-c",account_id:"other",status:"FILLED"}]),
        "manager.fills:fills":{...group([{fill_id:"must-not-leak",strategy_id:"alpha-a"}]),availability:"UNAVAILABLE",reason_code:"SOURCE_REFUSED"},
      }} }));
    const service = new LocalQueryAnalyticsService(cfg as never,{snapshot} as never);
    for (const environment of ["paper","sandbox","live"] as const) {
      const result:any = await service.query({workspaceId:"ws"} as never,"alpha","alpha-a",{environment,accountId:"shared"});
      expect(result.analytics.source_facts.orders.map((r:any)=>r.order_id)).toEqual([`${environment}-a`]);
      expect(result.analytics.source_facts.fills).toEqual([]);
      expect(result.analytics.capabilities.find((c:any)=>c.capability_id==="contribution").state).toBe("UNAVAILABLE");
      expect(result.analytics.environment).toBe(environment);
      expect(result.analytics.correlation.pairs).toEqual([]);
    }
    await expect(service.query({workspaceId:"ws"} as never,"alpha","alpha-a",{accountId:"unknown"})).rejects.toMatchObject({code:"ANALYTICS_ACCOUNT_SCOPE_NOT_FOUND"});
    expect(snapshot.mock.calls.map(args=>args[1])).toEqual(["paper","sandbox","live","paper"]);
  });

  it("bounds legacy history bytes and resumes after the last row actually returned", async () => {
    const {ExecutionProfileHistoryService} = await import("../src/execution/profile-history.service");
    const rows = [1,2].map(n=>({rowId:`r${n}`,ts:`2026-09-0${n}T00:00:00.000Z`,fields:{note:"x".repeat(600_000)}}));
    const repo = {timeSeriesHistory:vi.fn().mockResolvedValue({rows,hasMore:false}),
      timeSeriesHistoryCoverage:vi.fn().mockResolvedValue({rowCount:2,oldestTs:rows[0].ts,newestTs:rows[1].ts})};
    const service = new ExecutionProfileHistoryService(config,repo as never);
    const response = await service.read("paper","manager.performance:account_equity_snapshots",{});
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(1024*1024);
    expect(response.page).toMatchObject({returned_count:1,has_more:true,next_after_id:"r1"});
    expect(response.coverage.row_count).toBe(2);
    for (const query of [{from:"2026-09-01"},{from:"2026-09-02T00:00:00Z",to:"2026-09-01T00:00:00Z"},{unknown:"x"},{after_id:"orphan"}])
      await expect(service.read("paper","manager.performance:account_equity_snapshots",query)).rejects.toMatchObject({status:400});
  });

  it("compares high magnitude, sub-cent, negative and scaled-equal capital without floats", async () => {
    const portfolioView = vi.fn().mockResolvedValue({ version: "epoch:2", strategies: [], statistics: null,
      inputAsOf: "2026-09-01T00:00:00.000Z", inputFreshness: "STALE", inputCompleteness: "COMPLETE" });
    const raw = [
      ["9007199254740993.001", "9007199254740993.002", "USD", "0.001"],
      ["-0.000000000000000001", "-0.000000000000000002", "USD", "0.000000000000000001"],
      ["1.0000", "1", "USD", "0"],
      ["0", "10000000000000000000.00001", "VND", "10000000000000000000.00001"],
    ];
    const relationPage = vi.fn().mockResolvedValue({
      records: raw.map(([before,after,currency,amount],i) => ({ values: { portfolio_id:"p", capital_ledger_id:`l${i}`,
        account_id:"a", movement_type:"ADJUST", before_allocated:before, after_allocated:after, amount,currency } })),
      source_health: { freshness:"STALE",completeness:"PARTIAL",as_of_ms:Date.parse("2026-08-30T00:00:00Z") },
      page: { has_more:false },
    });
    const service = new Portfolio360LocalService({ enabled:()=>true,portfolioView } as never,config,
      {} as never,{ relationPage } as never);
    const response = await service.capitalLedger({ workspaceId:"ws" } as never,"p","sandbox");
    const analytics = response.analytics as any;
    assertLocalPortfolioContract(response,"LocalCapitalLedgerResponse");
    const usd = analytics.data.buckets.find((bucket: any)=>bucket.currency==="USD");
    const vnd = analytics.data.buckets.find((bucket: any)=>bucket.currency==="VND");
    expect(usd.entries.map((entry: any)=>entry.direction)).toEqual(["INCREASE","DECREASE","UNCHANGED"]);
    expect(usd.gross_increase).toBe("0.001");
    expect(usd.gross_decrease).toBe("0.000000000000000001");
    expect(vnd.gross_increase).toBe("10000000000000000000.00001");
    expect(analytics).toMatchObject({ input_freshness_floor:"STALE", input_completeness:"PARTIAL", input_as_of:"2026-08-30T00:00:00.000Z" });
    expect(response.environment).toBe("sandbox");
    expect(relationPage.mock.calls[0][2].environment).toBe("sandbox");
  });

  it("retains unavailable and partial even when there are no returned records", async () => {
    const snapshot = vi.fn().mockResolvedValue({ lastSuccessfulRefreshAt:new Date(),document:{ relations:{
      "manager.strategies:strategies": { availability:"UNAVAILABLE",freshness:"UNKNOWN",completeness:"UNKNOWN",as_of:null,
        reason_code:"SOURCE_REFUSED",items:[{ fields:{ strategy_id:"must-not-leak" } }] },
      "manager.accounts:accounts": { availability:"AVAILABLE",freshness:"STALE",completeness:"PARTIAL",as_of:null,items:[] },
    } } });
    const service = new ExecutionProfileReadAdapterService(config,{ snapshot } as never);
    const result = await service.read("ws","paper","admin.inspect");
    expect(result.state).toBe("PARTIAL");
    expect(result.relations.strategies).toMatchObject({ state:"UNAVAILABLE",items:[],returned_count:0,reason_code:"SOURCE_REFUSED" });
    expect(result.relations.accounts.state).toBe("PARTIAL");
    for (const limit of [0,-1,201,1.5,Infinity,"20"]) {
      await expect(service.read("ws","paper","admin.inspect",{ limit })).rejects.toMatchObject({ code:"N32_ADAPTER_LIMIT_INVALID" });
    }
    await expect(service.read("ws","paper","constructor")).rejects.toMatchObject({ code:"N32_ADAPTER_NOT_ACCEPTED" });
  });

  it("counts exactly the requested entity/range, not the whole retained table or cursor page", async () => {
    const query = vi.fn().mockResolvedValue({ rows:[{ row_count:"2",oldest_ts:"a",newest_ts:"b" }] });
    const repository = new ExecutionProfileProjectionRepository({ query } as never);
    await repository.timeSeriesHistoryCoverage("ws","paper","profile","relation",{ field:"account_id",value:"a" },
      { from:"2026-09-01T00:00:00Z",to:"2026-09-02T00:00:00Z" });
    const [sql,bindings] = query.mock.calls[0];
    expect(sql).toMatch(/ts\s*>=/);
    expect(sql).toMatch(/ts\s*<=/);
    expect(bindings).toContain("2026-09-01T00:00:00Z");
    expect(bindings).toContain("2026-09-02T00:00:00Z");
    expect(bindings).toContain("a");
  });
});
