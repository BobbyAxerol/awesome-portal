/** SYNTHETIC source payload over real local TLS; no actual source authority. */
import { afterEach,describe,expect,it } from "vitest";
import { prepareNativeCurrentRelationsSourceRequest,parseNativeCurrentRelationsSourceResult } from "../src/execution-v2/native-current-relations-codec";
import { NativeCurrentRelationsSourceClient,nativeCurrentRelationsSourceAuthenticatedResult } from "../src/execution-v2/native-current-relations-source-client";
import { currentRelationsWireBase,currentRelationsWireReply } from "./fixtures/elp210-native-current-relations-wire";
import { currentRelationsTestEndpoint } from "./fixtures/elp210-native-current-relations-server";

describe("private CURRENT READ transport actual mTLS/provenance",()=>{
  const allocations:Array<Awaited<ReturnType<typeof currentRelationsTestEndpoint>>>=[];
  afterEach(async()=>{for(const item of allocations.splice(0))await item.close();});
  it.each(["issue","enter","unknown","status","cancel-unentered","resolve"] as const)("authenticates exact %s without substituting ROOT/STREAM authority",async action=>{
    const endpoint=await currentRelationsTestEndpoint((base,method)=>currentRelationsWireReply(base,method));allocations.push(endpoint);
    const base=currentRelationsWireBase(),request=prepareNativeCurrentRelationsSourceRequest(base,action,action==="resolve"?"YQ.Yg.Yw":undefined);
    const result=await endpoint.client.call(request),proof=nativeCurrentRelationsSourceAuthenticatedResult(endpoint.client,result);
    expect(proof.action).toBe(action);expect(JSON.parse(proof.base_body)).toEqual(base);expect(proof.result).toBe(result);
    expect(endpoint.requests).toHaveLength(1);expect(endpoint.requests[0].base).toEqual(base);
    expect(endpoint.client.snapshot().in_flight).toBe(0);
    const untrusted=parseNativeCurrentRelationsSourceResult(request,Buffer.from(JSON.stringify(currentRelationsWireReply(base,action))));
    for(const forged of [untrusted,{...result},structuredClone(result)])
      expect(()=>nativeCurrentRelationsSourceAuthenticatedResult(endpoint.client,forged)).toThrow();
  });
  it("writes no application request for a wrong Edge leaf pin",async()=>{
    const endpoint=await currentRelationsTestEndpoint((base,action)=>currentRelationsWireReply(base,action));allocations.push(endpoint);
    const client=new NativeCurrentRelationsSourceClient({...endpoint.config,edge_leaf_sha256:`sha256:${"0".repeat(64)}`});
    await expect(client.call(prepareNativeCurrentRelationsSourceRequest(currentRelationsWireBase(),"issue"))).rejects.toMatchObject({http_delivery:"NOT_ATTEMPTED"});
    expect(endpoint.requests).toHaveLength(0);await expect.poll(()=>client.snapshot().in_flight).toBe(0);
  });
  it("a lost ISSUE response is MAY_HAVE_OCCURRED; same frozen status is not another ISSUE or an ACK",async()=>{
    const endpoint=await currentRelationsTestEndpoint((base,action,res)=>{if(action==="issue"){res.destroy();return null;}return currentRelationsWireReply(base,action);});allocations.push(endpoint);
    const base=currentRelationsWireBase();await expect(endpoint.client.call(prepareNativeCurrentRelationsSourceRequest(base,"issue")))
      .rejects.toMatchObject({http_delivery:"MAY_HAVE_OCCURRED"});
    await expect.poll(()=>endpoint.client.snapshot().in_flight).toBe(0);
    const result=await endpoint.client.call(prepareNativeCurrentRelationsSourceRequest(base,"status"));
    expect(result.state).toBe("OBSERVATION");expect(endpoint.requests.map(r=>r.action)).toEqual(["issue","status"]);
    expect(endpoint.requests[0].base).toEqual(endpoint.requests[1].base);
  });
});
