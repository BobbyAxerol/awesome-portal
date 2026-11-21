/** SYNTHETIC source payload over real local TLS; no actual source authority. */
import { afterEach,describe,expect,it } from "vitest";
import { prepareNativeRootSourceRequest,parseNativeRootSourceResult } from "../src/execution-v2/native-root-codec";
import { NativeRootSourceClient,nativeRootSourceAuthenticatedResult } from "../src/execution-v2/native-root-source-client";
import { rootWireBase,rootWireReply } from "./fixtures/elp210-native-root-wire";
import { rootTestEndpoint } from "./fixtures/elp210-native-root-server";

describe("private ROOT transport actual mTLS/provenance",()=>{
  const allocations:Array<Awaited<ReturnType<typeof rootTestEndpoint>>>=[];
  afterEach(async()=>{for(const item of allocations.splice(0))await item.close();});
  it.each(["issue","enter","unknown","status","cancel-unentered","resolve"] as const)("authenticates exact %s without substituting READ authority",async action=>{
    const endpoint=await rootTestEndpoint((base,method)=>rootWireReply(base,method));allocations.push(endpoint);
    const base=rootWireBase("COMMIT"),request=prepareNativeRootSourceRequest(base,action,action==="resolve"?"YQ.Yg.Yw":undefined);
    const result=await endpoint.client.call(request),proof=nativeRootSourceAuthenticatedResult(endpoint.client,result);
    expect(proof.action).toBe(action);expect(JSON.parse(proof.base_body)).toEqual(base);expect(proof.result).toBe(result);
    expect(endpoint.requests).toHaveLength(1);expect(endpoint.requests[0].base).toEqual(base);
    expect(endpoint.client.snapshot().in_flight).toBe(0);
    const untrusted=parseNativeRootSourceResult(request,Buffer.from(JSON.stringify(rootWireReply(base,action))));
    for(const forged of [untrusted,{...result},structuredClone(result)])
      expect(()=>nativeRootSourceAuthenticatedResult(endpoint.client,forged)).toThrow();
  });
  it("writes no application request for a wrong Edge leaf pin",async()=>{
    const endpoint=await rootTestEndpoint((base,action)=>rootWireReply(base,action));allocations.push(endpoint);
    const client=new NativeRootSourceClient({...endpoint.config,edge_leaf_sha256:`sha256:${"0".repeat(64)}`});
    await expect(client.call(prepareNativeRootSourceRequest(rootWireBase(),"issue"))).rejects.toMatchObject({http_delivery:"NOT_ATTEMPTED"});
    expect(endpoint.requests).toHaveLength(0);await expect.poll(()=>client.snapshot().in_flight).toBe(0);
  });
  it("a lost ISSUE response is MAY_HAVE_OCCURRED; same frozen status is not another ISSUE or an ACK",async()=>{
    const endpoint=await rootTestEndpoint((base,action,res)=>{if(action==="issue"){res.destroy();return null;}return rootWireReply(base,action);});allocations.push(endpoint);
    const base=rootWireBase();await expect(endpoint.client.call(prepareNativeRootSourceRequest(base,"issue")))
      .rejects.toMatchObject({http_delivery:"MAY_HAVE_OCCURRED"});
    await expect.poll(()=>endpoint.client.snapshot().in_flight).toBe(0);
    const result=await endpoint.client.call(prepareNativeRootSourceRequest(base,"status"));
    expect(result.state).toBe("OBSERVATION");expect(endpoint.requests.map(r=>r.action)).toEqual(["issue","status"]);
    expect(endpoint.requests[0].base).toEqual(endpoint.requests[1].base);
  });
  it("shutdown refuses new sends and waits for the admitted physical request to close",async()=>{
    let entered!:()=>void,finish!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{finish=resolve;});
    const endpoint=await rootTestEndpoint(async(base,action)=>{entered();await gate;return rootWireReply(base,action);});allocations.push(endpoint);
    const request=prepareNativeRootSourceRequest(rootWireBase(),"issue"),sending=endpoint.client.call(request);
    await started;expect(endpoint.client.snapshot().in_flight).toBe(1);
    const closing=endpoint.client.shutdown();expect(endpoint.client.shutdown()).toBe(closing);
    let closed=false;void closing.then(()=>{closed=true;});await Promise.resolve();expect(closed).toBe(false);
    await expect(endpoint.client.call(request)).rejects.toMatchObject({code:"NATIVE_ROOT_SOURCE_UNAVAILABLE",http_delivery:"NOT_ATTEMPTED"});
    expect(endpoint.requests).toHaveLength(1);finish();await sending;await closing;
    expect(closed).toBe(true);expect(endpoint.client.snapshot().in_flight).toBe(0);
  });
  it("idle shutdown is repeatable and never opens an application request",async()=>{
    const endpoint=await rootTestEndpoint((base,action)=>rootWireReply(base,action));allocations.push(endpoint);
    const closing=endpoint.client.shutdown();expect(endpoint.client.shutdown()).toBe(closing);await closing;
    await expect(endpoint.client.call(prepareNativeRootSourceRequest(rootWireBase(),"issue")))
      .rejects.toMatchObject({http_delivery:"NOT_ATTEMPTED"});expect(endpoint.requests).toEqual([]);
  });
});
