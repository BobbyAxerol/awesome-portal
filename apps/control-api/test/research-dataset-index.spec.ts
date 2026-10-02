import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchDatasetIndexClient } from "../src/research/dataset-index.client";
import { ResearchDatasetIndexController } from "../src/research/dataset-index.controller";
import { ResearchDatasetCatalogV2Schema } from "../src/research/dataset-index.contract";
import {sha256} from "../src/auth/argon";
import {sha256ResearchJson} from "../src/research/preflight.service";
import {P04_DELTA_DECLARED_CONTRACT} from "../src/research/p04-delta.binding";
import {wfoRequested} from "./research-w1-wfo.fixture";
const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = (name = "healthy") => JSON.parse(readFileSync(resolve(root, `fixtures/research-dataset-catalog.v2.${name}.valid.json`), "utf8"));
const config = { INTERNAL_PRINCIPAL_SECRET: "b7-test-principal-secret-0123456789", PORTAL_API_BASE_URL: "http://portal-api.test",
  RESEARCH_PREFLIGHT_TIMEOUT_MS: 1000, QUERY_CURSOR_ACTIVE_KEY_ID: "key", QUERY_CURSOR_KEYS_JSON: JSON.stringify({key:"x".repeat(32)}),
  QUERY_CURSOR_TTL_SECONDS: 900 } as never;
const request = { portalUser: { userId: "u1", username: "u1", role: "ADMIN", mustChangePassword: false }, portalWorkspaceId: "w1" } as never;
const make = (data = fixture(), member = true) => new ResearchDatasetIndexController({ catalog: async () => data } as never, { isMember: async () => member } as never, config, {} as never, {} as never);
afterEach(() => vi.unstubAllGlobals());
describe("B7 indexed dataset BFF", () => {
  it("requires CSRF and workspace before source I/O; resolves warmup on the server",async()=>{
    const spec=wfoRequested(), metadata=JSON.parse(readFileSync(resolve(root,"fixtures/research-declaration-estimate.v1.available.valid.json"),"utf8")).metadata;
    const estimate=vi.fn(async()=>metadata), load=vi.fn(async()=>({declaredContract:P04_DELTA_DECLARED_CONTRACT,entrypoint:P04_DELTA_DECLARED_CONTRACT.entrypoint}));
    const atlas=JSON.parse(readFileSync(resolve(root,"fixtures/research-foundation.atlas-current.valid.json"),"utf8"));
    const csrf="estimate-test-csrf";
    const req={...request as any,headers:{origin:"https://portal.test","x-portal-csrf":csrf},cookies:{"__Host-portal_csrf":csrf},portalSession:{csrfSecretHash:sha256(csrf)}};
    const makeController=(member=true)=>new ResearchDatasetIndexController({estimate} as never,{isMember:async()=>member} as never,
      {...config as any,PORTAL_PUBLIC_ORIGIN:"https://portal.test"},{loadAlphaVersionDataContract:load} as never,{atlas:async()=>atlas} as never);
    await expect(makeController().estimate({...req,headers:{}} as never,{requested_spec:spec})).rejects.toMatchObject({status:403});
    await expect(makeController(false).estimate(req as never,{requested_spec:spec})).rejects.toMatchObject({status:404});
    expect(estimate).not.toHaveBeenCalled();
    const result=await makeController().estimate(req as never,{requested_spec:spec});
    expect(result.metadata.scope).toBe("INDEX_ESTIMATE_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION");
    expect(estimate).toHaveBeenCalledWith(req.portalUser,spec,P04_DELTA_DECLARED_CONTRACT.warmup_bars);
  });
  it("binds private estimate responses to the exact requested spec digest",async()=>{
    const spec=wfoRequested(),metadata=JSON.parse(readFileSync(resolve(root,"fixtures/research-declaration-estimate.v1.available.valid.json"),"utf8")).metadata;
    metadata.requested_spec_digest=sha256ResearchJson(spec);
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(metadata))));
    const client=new ResearchDatasetIndexClient(config);
    expect(await client.estimate((request as any).portalUser,spec,300)).toEqual(metadata);
    expect((fetch as any).mock.calls[0][1].method).toBe("POST");
    metadata.requested_spec_digest="f".repeat(64);
    await expect(client.estimate((request as any).portalUser,spec,300)).rejects.toMatchObject({status:502});
  });
  it("returns the public alignment code before any private metadata request", async () => {
    const catalog = vi.fn(async () => fixture()), metadata = vi.fn();
    const controller = new ResearchDatasetIndexController({ catalog, metadata } as never,
      {isMember: async()=>true} as never, config, {} as never, {} as never);
    await expect(controller.metadata(request, "crypto-binance-1m", {
      symbol:"BTCUSDT",timeframe:"1h",start_utc_ms:1,end_exclusive_utc_ms:3600000,
    })).rejects.toMatchObject({status:400,code:"WINDOW_BOUND_NOT_ALIGNED"});
    expect(catalog).not.toHaveBeenCalled(); expect(metadata).not.toHaveBeenCalled();
  });
  it.each(["healthy", "partial-quality", "multi-dataset", "symbol-absent"])("validates canonical %s consistently with OpenAPI", name => {
    const parsed = ResearchDatasetCatalogV2Schema.safeParse(fixture(name));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
  it("checks workspace and typed inputs before fetching the private source", async () => {
    await expect(make(fixture(), false).catalog(request, {})).rejects.toMatchObject({ status: 404 });
    await expect(make().catalog(request, { private_url:"bad" })).rejects.toMatchObject({ status: 400 });
    await expect(make().symbols(request, "../private", {})).rejects.toMatchObject({ status: 400 });
    await expect(make().metadata(request, "crypto-binance-1m", { symbol:"BTCUSDT", timeframe:"1h", start_utc_ms:20, end_exclusive_utc_ms:10 })).rejects.toMatchObject({ status: 400 });
  });
  it("pages exact symbol metadata and binds cursor to workspace/query/revision/limit", async () => {
    const data = fixture(), original = data.datasets[0].symbols.items[0];
    data.datasets[0].symbols.items = ["AAA", "BBB", "CCC"].map(symbol => ({ ...original, symbol }));
    data.datasets[0].symbols.total = 3;
    const controller = make(data);
    const page = await controller.symbols(request, "crypto-binance-1m", {limit:2});
    expect(page.items.map(row => row.symbol)).toEqual(["AAA", "BBB"]);
    expect(page.total).toBe(3);
    const second = await controller.symbols(request, "crypto-binance-1m", {limit:2, cursor:page.next_cursor});
    expect(second.items.map(row => row.symbol)).toEqual(["CCC"]);
    for (const query of [{limit:1}, {limit:2,q:"A"}, {limit:2,workspace_id:"w2"}])
      await expect(controller.symbols(request, "crypto-binance-1m", {...query,cursor:page.next_cursor})).rejects.toMatchObject({status:400});
    data.datasets[0].symbols.items[0].coverage_by_timeframe[0].as_of_utc_ms++;
    await expect(controller.symbols(request, "crypto-binance-1m", {limit:2,cursor:page.next_cursor})).rejects.toMatchObject({status:400});
  });
  it("does not turn unknown coverage or a truncated list into an empty authoritative total", async () => {
    const data = fixture("symbol-absent");
    const page = await make(data).symbols(request, "crypto-binance-1m", {timeframe:"1h"});
    expect(page.total).toBeNull(); expect(page.as_of_utc_ms).toBeNull();
    expect(page.availability.reason_code).toBe("HMD_TIMEFRAME_FILTER_COVERAGE_PARTIAL");
    data.datasets[0].symbols.truncated = true;
    await expect(make(data).symbols(request, "crypto-binance-1m", {})).rejects.toMatchObject({status:503});
  });
  it("bounds streamed response and sends only a signed fixed-origin metadata request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture()))));
    const client = new ResearchDatasetIndexClient(config);
    expect((await client.catalog((request as any).portalUser)).schema_version).toBe("research.dataset-catalog.v2");
    expect(String((fetch as any).mock.calls[0][0])).toBe("http://portal-api.test/internal/research/datasets-v2");
    expect((fetch as any).mock.calls[0][1].headers["x-portal-principal"]).toBeTruthy();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(1_048_577))));
    await expect(client.catalog((request as any).portalUser)).rejects.toMatchObject({status:502});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private diagnostic", {status:401})));
    await expect(client.catalog((request as any).portalUser)).rejects.toMatchObject({status:503});
  });
  it("never proxies a response for another indexed window", async () => {
    const body = { schema_version:"research.dataset-bar-metadata.v1", catalog_revision:"a".repeat(64),as_of_utc_ms:36000000,
      dataset_id:"crypto-binance-1m",symbol:"BTCUSDT",timeframe:"1h",start_utc_ms:0,end_exclusive_utc_ms:3600000,
      scope:"INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION",availability:"AVAILABLE",reason_code:null,bars:1,
      first_bar_utc_ms:0,last_bar_utc_ms:0,warmup_bars_required:0,warmup_bars_available_before_start:0 };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));
    await expect(new ResearchDatasetIndexClient(config).metadata((request as any).portalUser, {
      dataset_id:body.dataset_id,symbol:body.symbol,timeframe:"1h",start_utc_ms:3600000,end_exclusive_utc_ms:7200000,warmup_bars:0,
    })).rejects.toMatchObject({status:502});
  });
});
