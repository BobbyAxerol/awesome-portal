/** Real scoped product adapters; fixture authority is explicitly TEST_ONLY. */
import { describe, expect, it, vi } from "vitest";
import { retainedOperationPage, NAMED_RETAINED_PURPOSES } from "../src/execution/retained-operation-page";
import { EDS11R_MANAGER_RELATION_REGISTRY_SOURCE } from "../src/execution/eds11r-manager-relation-registry.generated";
import { managerRelationOperationByRoute } from "../src/execution/eds11r-manager-relation.registry";
import { productReadFixture as fixture, OWN, PEER, PRIVATE, FIELDS } from "./elp2-product-read.fixture";
import {ProfileReadService} from "../src/profile-read/profile-read.service";
import {LiveOperationsService} from "../src/live/live-operations.service";
import {liveSourceOperationsRead} from "../src/live/live-source.contract";
import {SCOPED_LIVE_SPECS} from "../src/profile-read/scoped-live-source";

describe("ELP2-04 product reads before filtering, counts and pages", () => {
  // Existing pure adapter harness only. Real Core/HTTP/installed TS-acceptance
  // cases remain required in elp204-positive-parent.spec.ts before landing.
  function liveFixture(){
    const f=fixture({fields:[...FIELDS,"price","position_id","fill_id","balance_free","balance_locked"]});
    f.context.actor_lease_until_ms=f.context.now_ms+600_000;
    f.context.grants=f.context.grants.map(grant=>({...grant,environments:["live"]}));
    const base=f.context.grants[0]!;
    f.context.grants=[...f.context.grants,{...base,grant_id:"TEST_ONLY-live-screen-gate",action:"governance.live.read",
      requires_ts_acceptance:false,ts_receipt:null,
      selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"DEPLOYMENT",ids:[PRIVATE.deployment_id]}}];
    f.snapshot.document.environment="live";f.snapshot.document.profile_id="LIVE_BINANCE_USDM";
    for(const spec of SCOPED_LIVE_SPECS){
      const key=`${spec.source}:${spec.relation}`;
      f.snapshot.document.relations[key]??={source_id:spec.source,relation:spec.relation,availability:"AVAILABLE",reason_code:null,
        freshness:"STALE",completeness:"PARTIAL",as_of:null,items:[]};
      f.snapshot.document.relations[key].source_id=spec.source;
      for(const row of f.snapshot.document.relations[key].items){
        if(row.fields.mode==="paper")row.fields.mode="live";
        row.lineage={workspace_id:f.principal.workspaceId,profile_id:"LIVE_BINANCE_USDM",
          source_contract_revision:f.snapshot.document.source_contract_revision,source_catalogue_sha256:f.snapshot.sourceCatalogueSha256!};
      }
    }
    f.snapshot.document.relations["manager.deployments:strategy_deployments"].items.push({fields:{
      ...PRIVATE,strategy_id:"strategy-own",mode:"live",venue:"VENUE"},lineage:{workspace_id:f.principal.workspaceId,
      profile_id:"LIVE_BINANCE_USDM",source_contract_revision:f.snapshot.document.source_contract_revision,
      source_catalogue_sha256:f.snapshot.sourceCatalogueSha256!}} as never);
    const legacy=vi.fn(async()=>{throw Error("TEST_ONLY-private-must-not-run");});
    const service=new LiveOperationsService({latestByDeployment:legacy,lineageFor:legacy} as never,
      new ProfileReadService(f.product),f.config,{effectiveAccess:legacy} as never,f.scopes);
    const read=()=>service.detail(f.principal.user,f.principal.session,f.principal.workspaceId,PRIVATE.deployment_id,
      (f.principal as typeof f.principal&{viewerWorkspaceId?:string}).viewerWorkspaceId);
    return {...f,legacy,service,read};
  }
  const liveQuery=(f:ReturnType<typeof liveFixture>,query:import("../src/live/live-source.contract").LiveSourceReadQuery)=>
    f.service.detail(f.principal.user,f.principal.session,f.principal.workspaceId,PRIVATE.deployment_id,
      (f.principal as typeof f.principal&{viewerWorkspaceId?:string}).viewerWorkspaceId,query);
  function livePages(){
    const f=liveFixture(),orders=f.snapshot.document.relations["manager.orders:orders"],
      first=orders.items.find(row=>row.fields.deployment_id===PRIVATE.deployment_id)!;
    orders.items=Array.from({length:401},(_,i)=>({lineage:structuredClone(first.lineage),
      fields:{...first.fields,order_id:String(i+1),quantity:i===400?"0":"1.000000000000000001"}}));
    return f;
  }
  it("SAME Live route projection traverses401 retained observations200/200/1 and backwards without duplication",async()=>{
    const f=livePages(),first=liveSourceOperationsRead.parse(await f.read()),
      middle=liveSourceOperationsRead.parse(await liveQuery(f,{panel:"orders",cursor:first.data.orders.next_cursor!})),
      last=liveSourceOperationsRead.parse(await liveQuery(f,{panel:"orders",cursor:middle.data.orders.next_cursor!})),
      back=liveSourceOperationsRead.parse(await liveQuery(f,{panel:"orders",cursor:middle.data.orders.previous_cursor!}));
    expect([first,middle,last].map(b=>b.data.orders.returned_count)).toEqual([200,200,1]);
    expect([first,middle,last].map(b=>b.data.orders.has_more)).toEqual([true,true,false]);
    expect(first.data.orders.previous_cursor).toBeNull();expect(last.data.orders.next_cursor).toBeNull();
    expect(last.data.orders.records[0].values.quantity).toBe("0");
    const ids=[first,middle,last].flatMap(b=>b.data.orders.records.map(row=>row.observation_id));
    expect(new Set(ids).size).toBe(401);expect(back.data.orders.records).toEqual(first.data.orders.records);
    expect(middle.data.account_balances.records).toEqual(first.data.account_balances.records);
    for(const body of [first,middle,last,back])for(const panel of Object.values(body.data)){
      expect(panel.exact_total).toBeNull();expect(panel.provenance.source_cursor).toBeNull();
    }
    expect(f.legacy).not.toHaveBeenCalled();expect(f.named.relationPage).not.toHaveBeenCalled();
  });
  it.each(["panel","session","viewer","authority","epoch","digest","catalogue","active-key","removed-key","expiry"] as const)(
    "Live continuation refuses %s binding changes, never takes a named/cohort fallback",async change=>{
    const f=livePages(),first=liveSourceOperationsRead.parse(await f.read());
    const query:{panel:string;cursor:string}={panel:"orders",cursor:first.data.orders.next_cursor!};
    let clock:ReturnType<typeof vi.spyOn>|undefined;
    try{
      if(change==="panel")query.panel="fills";
      if(change==="session")f.principal.session.sessionId="TEST_ONLY-next-session";
      if(change==="viewer")(f.principal as typeof f.principal&{viewerWorkspaceId?:string}).viewerWorkspaceId="TEST_ONLY-next-viewer";
      if(change==="authority")f.context.authority_fingerprint="TEST_ONLY-new-authority";
      if(change==="epoch")f.snapshot.projectionEpoch="TEST_ONLY-next-epoch";
      if(change==="digest")f.snapshot.payloadDigest="sha256:"+"c".repeat(64);
      if(change==="catalogue"){
        // A valid replacement publication changes the row witnesses too. A
        // metadata-only edit is corrupt lineage, not a valid cursor change.
        f.snapshot.sourceCatalogueSha256="sha256:"+"c".repeat(64);
        f.snapshot.document.source_catalogue_sha256=f.snapshot.sourceCatalogueSha256;
        for(const relation of Object.values(f.snapshot.document.relations)){
          relation.source_catalogue_sha256=f.snapshot.sourceCatalogueSha256;
          for(const row of relation.items)if(row.lineage)row.lineage.source_catalogue_sha256=f.snapshot.sourceCatalogueSha256;
        }
      }
      if(change==="active-key"||change==="removed-key"){
        const old=f.config.QUERY_CURSOR_KEYS_JSON?JSON.parse(f.config.QUERY_CURSOR_KEYS_JSON):{};
        f.config.QUERY_CURSOR_KEYS_JSON=JSON.stringify({...old,"TEST_ONLY-next-key":"TEST_ONLY-new-signing-secret-at-least32-characters"});
        f.config.QUERY_CURSOR_ACTIVE_KEY_ID="TEST_ONLY-next-key";
        if(change==="removed-key")f.config.QUERY_CURSOR_KEYS_JSON=JSON.stringify({"TEST_ONLY-next-key":"TEST_ONLY-new-signing-secret-at-least32-characters"});
      }
      if(change==="expiry"){
        const until=Number(query.cursor.split(".")[3])*1000;
        f.context.actor_lease_until_ms=Math.max(f.context.now_ms,until)+600_000;
        clock=vi.spyOn(Date,"now").mockReturnValue(until);
      }
      await expect(liveQuery(f,query)).rejects.toMatchObject({status:400,code:"EXECUTION_READ_CURSOR_INVALID"});
      expect(f.legacy).not.toHaveBeenCalled();expect(f.named.relationPage).not.toHaveBeenCalled();
    }finally{clock?.mockRestore();}
  });
  it("inconsistent Live catalogue lineage is unavailable, not a usable changed-cursor publication",async()=>{
    const f=livePages(),first=liveSourceOperationsRead.parse(await f.read());
    f.snapshot.sourceCatalogueSha256="sha256:"+"c".repeat(64);
    await expect(liveQuery(f,{panel:"orders",cursor:first.data.orders.next_cursor!})).rejects.toMatchObject({
      status:503,code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED"});
    expect(f.legacy).not.toHaveBeenCalled();expect(f.named.relationPage).not.toHaveBeenCalled();
  });
  it.each([{cursor:"not-a-token"},{panel:"broker_sync"},{panel:"orders",cursor:""},
    {panel:["orders"]},{panel:"orders",cursor:["not-a-token"]},{panel:"manager.orders"}])(
    "malformed finite Live query%j still reaches shared terminal Core",async query=>{
    const f=livePages(),confirm=f.access.confirmReadContext.getMockImplementation()!;
    let last=false,observed=false,renewals=0;
    const authorize=f.scopes.authorize.bind(f.scopes),spy=vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      const result=await authorize(...args);
      if(args[2].dataset?.dataset_id==="relation:manager.reconciliation:reconciliation_findings"&&++renewals===2)last=true;
      return result;
    });
    const final=vi.spyOn(f.access,"confirmReadContext").mockImplementation(async()=>{const result=await confirm();
      if(last)observed=true;return result;});
    try{
      await expect(liveQuery(f,query)).rejects.toMatchObject({status:400,code:"EXECUTION_READ_QUERY_INVALID"});
      expect(observed).toBe(true);expect(final).toHaveBeenCalled();expect(f.legacy).not.toHaveBeenCalled();
    }finally{spy.mockRestore();final.mockRestore();}
  });
  it.each(["grant","unavailable"] as const)("shared final current %s failure outranks a held malformed-cursor error",async variant=>{
    const f=livePages(),authorize=f.scopes.authorize.bind(f.scopes);let renewals=0,changed=false;
    const spy=vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      const result=await authorize(...args);
      if(args[2].dataset?.dataset_id==="relation:manager.accounts:account_balances"&&++renewals===2){
        changed=true;
        if(variant==="grant"){
          f.context.grants=f.context.grants.filter(g=>g.action!=="alpha.read");
          f.context.authority_fingerprint="TEST_ONLY-revoked-after-held-cursor";
        }else f.access.readPublication.mockRejectedValue(Error("TEST_ONLY-private-source-unavailable"));
      }return result;
    });
    try{await expect(liveQuery(f,{panel:"orders",cursor:"malformed"})).rejects.toMatchObject(variant==="grant"?
      {status:409,code:"EXECUTION_READ_ACCESS_CHANGED"}:{status:503,code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE"});
      expect(changed).toBe(true);}finally{spy.mockRestore();}
  });
  it.each(["body","held-error"] as const)("cursor expiry at LAST Core hides %s without an await afterwards",async variant=>{
    const f=livePages(),first=liveSourceOperationsRead.parse(await f.read()),token=first.data.orders.next_cursor!,
      until=Number(token.split(".")[3])*1000,authorize=f.scopes.authorize.bind(f.scopes),
      confirm=f.access.confirmReadContext.getMockImplementation()!;
    if(variant==="held-error")f.snapshot.document.relations["manager.orders:orders"].items[200].fields.quantity={PRIVATE:"bad"} as never;
    f.context.actor_lease_until_ms=Math.max(f.context.now_ms,until)+600_000;
    let last=false,renewals=0,clock:ReturnType<typeof vi.spyOn>|undefined;
    const authSpy=vi.spyOn(f.scopes,"authorize").mockImplementation(async(...args)=>{
      const result=await authorize(...args);
      if(args[2].dataset?.dataset_id==="relation:manager.reconciliation:reconciliation_findings"&&++renewals===2)last=true;
      return result;
    });
    const coreSpy=vi.spyOn(f.access,"confirmReadContext").mockImplementation(async()=>{
      const current=await confirm();if(last)clock=vi.spyOn(Date,"now").mockReturnValue(until);return current;});
    try{
      await expect(liveQuery(f,{panel:"orders",cursor:token})).rejects.toMatchObject({status:400,code:"EXECUTION_READ_CURSOR_INVALID"});
      expect(last).toBe(true);
    }finally{clock?.mockRestore();authSpy.mockRestore();coreSpy.mockRestore();}
  });
  it("account-grain panel keeps exact ACCOUNT authority even if a row carries an incidental other deployment id",async()=>{
    const f=livePages(),balances=f.snapshot.document.relations["manager.accounts:account_balances"],
      original=balances.items.find(row=>row.fields.account_id===PRIVATE.account_id)!;
    const otherDeployment="TEST_ONLY-other-deployment-same-account",
      publication=f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request=>{
      const result=await publication(request);return {...result,
        resources:[...result.resources,{kind:"DEPLOYMENT" as const,id:otherDeployment}],
        tuples:[...result.tuples,{...PRIVATE,deployment_id:otherDeployment}]};
    });
    balances.items=Array.from({length:201},(_,index)=>({lineage:structuredClone(original.lineage),fields:{
      ...original.fields,deployment_id:otherDeployment,currency:String(index),total:"0"}}));
    // A qualified second tuple has the SAME account. Current account.read
    // authorizes both account observations, NOT allocation to this deployment.
    const first=liveSourceOperationsRead.parse(await f.read()),last=liveSourceOperationsRead.parse(await liveQuery(f,
      {panel:"account_balances",cursor:first.data.account_balances.next_cursor!}));
    expect(first.data.account_balances.grain).toBe("ACCOUNT");expect(first.data.orders.grain).toBe("DEPLOYMENT");
    expect([first.data.account_balances.returned_count,last.data.account_balances.returned_count]).toEqual([200,1]);
    expect(last.data.account_balances.records[0].values.total).toBe("0");
    await expect(liveQuery(f,{panel:"orders",cursor:first.data.account_balances.next_cursor!}))
      .rejects.toMatchObject({status:400,code:"EXECUTION_READ_CURSOR_INVALID"});
  });
  it("Live source-only positive uses genuine scopes and no Canary/owner legacy lookup; zero and decimals remain exact",async()=>{
    const f=liveFixture(),result=liveSourceOperationsRead.parse(await f.read());
    expect(result).toMatchObject({schema_version:"portal.execution.live-source-operations.v2",coverage:"AUTHORIZED_ONLY",
      environment:"live",deployment_id:PRIVATE.deployment_id,commands:{enabled:false},realtime:{active:false}});
    expect(result.data.account_balances.records[0].values.total).toBe("0");
    expect(result.data.orders.records[0].values.quantity).toBe("12345678901234567890.123456789");
    expect(result.data.orders.exact_total).toBeNull();expect(f.legacy).not.toHaveBeenCalled();
    expect(f.named.relationPage).not.toHaveBeenCalled();expect(f.upstream.relationForNamedOperation).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/order-peer|NEVER_RETURN|TEST_ONLY-private|UNIT/);
    // The schema requires source_cursor:null, never a raw cursor. Check values
    // rather than banning the intentionally published null field name.
    for(const panel of Object.values(result.data)){expect(panel.provenance.source_cursor).toBeNull();expect(panel.source_as_of_ms).toBeNull();}
  });
  it("Live without its independent exact app gate refuses before private projection loading",async()=>{
    const f=liveFixture();f.context.grants=f.context.grants.filter(grant=>grant.action!=="governance.live.read");
    await expect(f.read()).rejects.toMatchObject({status:404});expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("Live gate alone cannot read Alpha/account data",async()=>{
    const f=liveFixture();f.context.grants=f.context.grants.filter(grant=>grant.action==="governance.live.read");
    await expect(f.read()).rejects.toMatchObject({status:404});expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("a missing account purpose is an authorization refusal, not a successful unavailable account panel",async()=>{
    const f=liveFixture();f.context.grants=f.context.grants.filter(grant=>grant.action!=="account.read");
    await expect(f.read()).rejects.toMatchObject({status:404});expect(f.legacy).not.toHaveBeenCalled();
  });
  it("hidden corruption cannot become a source-row oracle, and denied field values are not decoded",async()=>{
    const f=liveFixture(),orders=f.snapshot.document.relations["manager.orders:orders"];
    orders.items.find(row=>row.fields.deployment_id===PEER.deployment_id)!.fields.quantity={PRIVATE:"bad"} as never;
    orders.items.push(null as never); // no private grain -> no body or error oracle
    expect(liveSourceOperationsRead.parse(await f.read()).data.orders.records).toHaveLength(1);
    f.context.policy!.researcher_fields.fields=f.context.policy!.researcher_fields.fields.filter(field=>field!=="quantity");
    orders.items.find(row=>row.fields.deployment_id===PRIVATE.deployment_id)!.fields.quantity={PRIVATE:"bad"} as never;
    const result=liveSourceOperationsRead.parse(await f.read());expect(result.data.orders.records[0].values).not.toHaveProperty("quantity");
  });
  it("no authorized retained observations is not an exact empty economic population, and unavailable does not become zero",async()=>{
    const f=liveFixture();f.snapshot.document.relations["manager.orders:orders"].items=[];
    f.snapshot.document.relations["manager.accounts:margin_balances"].availability="UNAVAILABLE";
    const result=liveSourceOperationsRead.parse(await f.read());
    expect(result.data.orders).toMatchObject({state:"PARTIAL",reason_code:"NO_AUTHORIZED_RETAINED_OBSERVATION",exact_total:null,returned_count:0});
    expect(result.data.margin_balances).toMatchObject({state:"NOT_PUBLISHED",exact_total:null,records:[]});
  });
  it("visible row window is bounded after authorization; has_more is not source total/history",async()=>{
    const f=liveFixture(),orders=f.snapshot.document.relations["manager.orders:orders"];
    const lineage=f.snapshot.document.relations["manager.deployments:strategy_deployments"].items.at(-1)!.lineage;
    orders.items=Array.from({length:201},(_,index)=>({fields:{...PRIVATE,order_id:String(index+1),quantity:"0"},lineage} as never));
    const result=liveSourceOperationsRead.parse(await f.read());expect(result.data.orders.records).toHaveLength(200);
    expect(result.data.orders.has_more).toBe(true);expect(result.data.orders.exact_total).toBeNull();
    expect(result.data.orders.provenance.history_semantics).toBe("BOUNDED_RETAINED_NOT_FULL_HISTORY");
  });
  it("projection replacement during the full screen flight prevents its body",async()=>{
    const f=liveFixture(),original=f.repository.snapshotMetadata.getMockImplementation()!;let calls=0;
    f.repository.snapshotMetadata.mockImplementation(async()=>{const value=await original();return ++calls>1?{...value,projectionEpoch:"TEST_ONLY-replaced"}:value;});
    await expect(f.read()).rejects.toMatchObject({status:409,code:"EXECUTION_READ_ACCESS_CHANGED"});
  });
  it("whole-result parsing errors still reach final Core; session loss beats the held private error",async()=>{
    const f=liveFixture(),original=f.access.confirmReadContext.getMockImplementation()!,trace:string[]=[];
    let assembled=false;
    f.access.confirmReadContext.mockImplementation(async()=>{const value=await original();if(assembled){trace.push("FINAL_CORE");
      return {...value,actor_lease_until_ms:value.now_ms-1};}return value;});
    const run=f.product.scopedLiveOperations(f.principal,PRIVATE.deployment_id,()=>{assembled=true;throw Error("TEST_ONLY-private-projection-prose");});
    await expect(run).rejects.toMatchObject({status:404});expect(trace.at(-1)).toBe("FINAL_CORE");
  });
  it("a renewed synthetic adapter lease is not compared to an obsolete initial lease",async()=>{
    const f=liveFixture(),original=f.repository.rawSnapshot.getMockImplementation()!;
    f.repository.rawSnapshot.mockImplementation(async()=>{const result=await original();f.context.now_ms+=1000;
      f.context.actor_lease_until_ms=f.context.now_ms+600_000;return result;});
    await expect(f.read()).resolves.toMatchObject({schema_version:"portal.execution.live-source-operations.v2"});
  });
  it("private/unknown fields, source totals and forged readiness flags are not valid public contract additions",async()=>{
    const f=liveFixture(),body=await f.read();
    for(const extra of [{actor_user_id:"PRIVATE"},{source_cursor:"PRIVATE"},{runtime_activation_requested:true}])
      expect(liveSourceOperationsRead.safeParse({...body,...extra}).success).toBe(false);
  });
  it.each(["deployments", "orders"])("current legacy %s retains the exact dark-profile refusal without local workspace", async route => {
    const f = fixture({ legacy: true });
    f.config.EXECUTION_READ_PROFILE = "source_current_v1";
    f.config.FEATURE_EXECUTION_LOCAL_PROJECTION = "false";
    f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID = undefined;
    const error = Object.assign(new Error("Profile is not activated."), { code: "N13B_PROFILE_NOT_ACTIVATED", status: 503 });
    f.upstream.relationForNamedOperation.mockRejectedValue(error);
    f.upstream.relationForCataloguedOperation.mockRejectedValue(error);
    const read = route === "deployments" ? f.maximum.deploymentPage(f.principal, { environment: "paper", limit: 20 })
      : f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 20 });
    await expect(read).rejects.toBe(error);
    expect(f.repository.snapshotMetadata).not.toHaveBeenCalled(); expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("V2 without a local qualified dataset cannot take the current-source legacy path", async () => {
    const f = fixture({ full: true });
    f.config.EXECUTION_READ_PROFILE = "source_current_v1";
    f.config.FEATURE_EXECUTION_LOCAL_PROJECTION = "false";
    f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID = undefined;
    await expect(f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 20 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("sticky activation after legacy source await prevents delivery even when the policy row was deleted", async () => {
    const f = fixture({ legacy: true });
    f.config.EXECUTION_READ_PROFILE = "source_current_v1";
    f.config.FEATURE_EXECUTION_LOCAL_PROJECTION = "false";
    f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID = undefined;
    // The real scope service consumes mocked identity rows, as in the fixture.
    const identity = (f.scopes as any).pool.query;
    const original = identity.getMockImplementation(); let policySeen = false;
    identity.mockImplementation(async (...args: unknown[]) => {
      const value = await original(...args);
      return { ...value, rows: value.rows.map((row: object) => ({ ...row, policy: null, policy_seen: policySeen })) };
    });
    f.upstream.relationForCataloguedOperation.mockImplementation(async () => { policySeen = true; return {}; });
    vi.spyOn(f.maximum as any, "translateRelationPage").mockResolvedValue({ records: ["MUST_NOT_DELIVER"] });
    await expect(f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 20 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.upstream.relationForCataloguedOperation).toHaveBeenCalledOnce();
  });
  it("local and retained named reads still enforce exact configured source workspace", async () => {
    const f = fixture({ legacy: true });
    f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID = "TEST_ONLY-other-source";
    await expect(f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 20 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("classifies every named alias explicitly, without a default Alpha purpose", () => {
    const aliases = EDS11R_MANAGER_RELATION_REGISTRY_SOURCE.operations;
    expect(aliases).toHaveLength(54);
    expect(Object.keys(NAMED_RETAINED_PURPOSES).sort()).toEqual(aliases.map(row => row.relation).sort());
  });
  it.each(EDS11R_MANAGER_RELATION_REGISTRY_SOURCE.operations.filter(operation =>
    NAMED_RETAINED_PURPOSES[operation.relation as keyof typeof NAMED_RETAINED_PURPOSES] === null))(
    "full business cannot claim uncommissioned named purpose $route_id", async operation => {
      const f = fixture({ full: true });
      await expect(f.maximum.relationPage(f.principal, operation.route_id, { environment: "paper", limit: 20 }))
        .rejects.toMatchObject({ code: "EXECUTION_NAMED_PURPOSE_NOT_COMMISSIONED", status: 503 });
      expect(f.repository.rawSnapshot).not.toHaveBeenCalled(); expect(f.repository.snapshot).not.toHaveBeenCalled();
      expect(f.access.readPublication).not.toHaveBeenCalled();
      expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    });
  it("named unsupported purpose remains an explicit legacy no-data observation, not a V2 grant", async () => {
    const f = fixture({ legacy: true });
    const page = await f.maximum.relationPage(f.principal, "service-heartbeats", { environment: "paper", limit: 20 });
    expect(page.state).toBe("UNAVAILABLE"); expect(page.records).toEqual([]);
    expect(page).not.toHaveProperty("read_scope");
  });
  it("scopes raw rows before sort/page/count/facets; exact zero and decimal survive", async () => {
    const f = fixture(); const first = await f.orders();
    expect(first.source.data.items).toHaveLength(1);
    expect(first.source.data.items[0].fields.order_id.value).toBe("order-own-2");
    expect(first.source.data.items[0].fields.quantity.value).toBe("12345678901234567890.123456789");
    expect(first.source.data.projected_total_items).toBe(2);
    expect(first.source.data.window_aggregates.status).toEqual({ OPEN: 2 });
    expect(JSON.stringify(first)).not.toMatch(/PEER_ONLY_STATUS|HIDDEN_VENUE|NEVER_RETURN|order-peer|epoch-1/);
    const second = await f.orders({ cursor: first.source.data.next_cursor });
    expect(second.source.data.items[0].fields.quantity.value).toBe("0");
    expect(first.projection.sequence).toBeNull(); expect(first.projection.received_at).toBeNull();
  });
  it("hidden value search equals unknown value search", async () => {
    const f = fixture();
    const hidden = await f.orders({ status: "PEER_ONLY_STATUS" });
    const unknown = await f.orders({ status: "NEVER_EXISTS" });
    expect(hidden).toEqual(unknown);
    expect(hidden.source.data.filtered_total_items).toBe(0);
  });
  it("forbidden field cannot be a filter or sorting oracle", async () => {
    const f = fixture({ fields: FIELDS.filter(value => value !== "venue") });
    await expect(f.orders({ venue: "HIDDEN_VENUE" })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("shared account total is excluded before any downstream composition", async () => {
    const f = fixture();
    const page = await retainedOperationPage(f.config, f.repository as never, f.principal,
      managerRelationOperationByRoute("account-balances")!, { environment: "paper", limit: 20 }, f.scopes);
    expect(JSON.stringify(page)).not.toContain("1000000");
    expect(page.records).toHaveLength(1);
    expect(page.records[0].values.total).toBe("0");
  });
  it("current full-business authority reads peer rows but never technical fields", async () => {
    const f = fixture({ full: true }); const page = await f.orders({ limit: 20 });
    expect(page.source.data.items).toHaveLength(3);
    expect(JSON.stringify(page)).toContain("order-peer");
    expect(JSON.stringify(page)).not.toContain("NEVER_RETURN");
  });
  it.each(["size", "query", "session", "epoch", "policy"])("opaque cursor refuses %s changes", async change => {
    const f = fixture(); const first = await f.orders(); const query: Record<string, unknown> = { cursor: first.source.data.next_cursor };
    if (change === "size") query.limit = 2;
    if (change === "query") query.status = "OPEN";
    if (change === "session") f.principal.session.sessionId = "TEST_ONLY-new-session";
    if (change === "epoch") f.snapshot.projectionEpoch = "epoch-2";
    if (change === "policy") f.context.authority_fingerprint = "TEST_ONLY-db-r2";
    await expect(f.orders(query)).rejects.toMatchObject({ code: "N31_PROJECTION_CURSOR_INVALID", status: 400 });
  });
  it("hidden deployment and nonexistent deployment share public refusal", async () => {
    const f = fixture();
    for (const id of [PEER.deployment_id, "missing"])
      await expect(f.product.resolveDeploymentScope(f.principal, "paper", "EXECUTION_PAPER_WORKBENCH_SCREEN", id))
        .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("own deployment resolves through qualified Alpha lineage without revealing account credentials", async () => {
    const f = fixture(); const result = await f.product.resolveDeploymentScope(f.principal, "paper", "EXECUTION_PAPER_WORKBENCH_SCREEN", OWN.deployment_id);
    expect(result.state).toBe("FOUND");
    expect(result.scope?.deploymentId).toBe(OWN.deployment_id);
    expect(result.scope?.externalAccountRef).toBeNull();
    expect(JSON.stringify(result)).not.toContain("peer");
  });
  it("epoch changes after projection produce a typed conflict", async () => {
    const f = fixture(); f.repository.snapshotMetadata.mockResolvedValue({ ...f.snapshot, projectionEpoch: "epoch-changed" });
    await expect(f.orders()).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("revoke during the final source check prevents returned rows", async () => {
    const f = fixture(); let calls = 0; f.repository.snapshotMetadata.mockImplementation(async () => {
      if (++calls === 2) { f.context.grants = []; f.context.authority_fingerprint = "TEST_ONLY-revoked"; } return f.snapshot;
    });
    await expect(f.orders()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("named V2 operations use retained scoped rows without upstream or continuation writes", async () => {
    const f = fixture();
    // Manager's named Orders catalogue declares the source PK as INTEGER.
    f.snapshot.document.relations["manager.orders:orders"].items.forEach((row, i) => { row.fields.order_id = String(i + 1); });
    const page = await f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 1 });
    expect(page.records).toHaveLength(1); expect(page.page.next_cursor).toBeTruthy();
    expect(page.source_health.availability).toBe("AVAILABLE");
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    expect(JSON.stringify(page)).not.toMatch(/order-peer|NEVER_RETURN/);
  });
  it("named source health cannot distinguish peer-only retained data from an empty relation", async () => {
    const f = fixture();
    const relation = f.snapshot.document.relations["manager.orders:orders"];
    relation.items = relation.items.filter(row => row.fields.alpha_id === "peer");
    relation.items[0].fields.order_id = "2";
    const peerOnly = await f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 1 }) as any;
    expect(peerOnly.records).toEqual([]); expect(peerOnly.source_health.availability).toBe("UNAVAILABLE");
    expect(peerOnly.source_health.as_of_ms).toBeNull(); expect(peerOnly.source_health.global_sequence).toBeNull();
    relation.items = [];
    const empty = await f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 1 }) as any;
    expect(empty.source_health).toEqual(peerOnly.source_health);
    expect(empty.records).toEqual(peerOnly.records); expect(empty.reason_code).toBe(peerOnly.reason_code);
    expect(empty.page).toEqual(peerOnly.page);
  });
  it("missing qualified local publication never falls through to upstream", async () => {
    const f = fixture(); f.access.readPublication.mockResolvedValue(null as never);
    await expect(f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 1 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("qualified retained path reads persisted bytes, not an augmented compatibility digest", async () => {
    const f = fixture(); f.repository.snapshot.mockResolvedValue({ ...f.snapshot, payloadDigest: "AUGMENTED_COMPATIBILITY_DIGEST" });
    await expect(f.orders()).resolves.toHaveProperty("visibility", "SCOPED");
    expect(f.repository.snapshot).not.toHaveBeenCalled();
    expect(f.repository.rawSnapshot).toHaveBeenCalled();
  });
  it("legacy explicit mode keeps its established internal envelope", async () => {
    const f = fixture({ legacy: true }); const page = await f.orders({ limit: 20 });
    expect(page.source.data.items).toHaveLength(3); expect(page.projection.epoch).toBe("epoch-1");
    expect(page.visibility).toBeUndefined();
  });
});
