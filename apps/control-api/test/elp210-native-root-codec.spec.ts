/** SYNTHETIC structural/provenance negatives, never native source qualification. */
import { describe,expect,it } from "vitest";
import { nativeRootBase,nativeRootCanonical,nativeRootDecode,nativeRootSourceTransportRequest,
  prepareNativeRootSourceRequest,parseNativeRootSourceResult } from "../src/execution-v2/native-root-codec";
import { nativeRootSourceAuthenticatedResult,NativeRootSourceClient } from "../src/execution-v2/native-root-source-client";
import { currentAcceptanceMatches,currentGrantProof } from "../src/execution-v2/access-current-relations";
import { accessDigest } from "../src/execution-v2/access-digest";
import { rootWireBase,rootWireFacts,rootWireReply } from "./fixtures/elp210-native-root-wire";

describe("private registered native ROOT exact wire",()=>{
  it.each(["issue","status","cancel-unentered"] as const)("QUALIFY %s never enters or invents a terminal",action=>{
    const base=rootWireBase(),prepared=prepareNativeRootSourceRequest(base,action),wire=nativeRootSourceTransportRequest(prepared);
    expect(wire.path).toBe(`/internal/elp210/native-relations/${action}`);expect(JSON.parse(wire.body)).toEqual(base);
    expect(base.registration.expected_version).toBe("9007199254741001");
    const result=parseNativeRootSourceResult(prepared,Buffer.from(JSON.stringify(rootWireReply(base,action))));
    expect(Object.isFrozen(result)).toBe(true);expect(result).not.toHaveProperty("human_token");
  });
  it.each(["enter","unknown","resolve"] as const)("QUALIFY rejects %s before any transport",action=>{
    expect(()=>prepareNativeRootSourceRequest(rootWireBase(),action,"YQ.Yg.Yw")).toThrow();
  });
  it.each(["issue","enter","unknown","status","cancel-unentered","resolve"] as const)("COMMIT %s uses same original and exact persisted mutation",action=>{
    const base=rootWireBase("COMMIT"),prepared=prepareNativeRootSourceRequest(base,action,action==="resolve"?"YQ.Yg.Yw":undefined);
    const wire=nativeRootSourceTransportRequest(prepared);expect(JSON.parse(wire.base_body)).toEqual(base);
    expect(parseNativeRootSourceResult(prepared,Buffer.from(JSON.stringify(rootWireReply(base,action)))).binding).toEqual(base.binding);
  });
  it("snapshots caller data and rejects mutation/digest/purpose confusion",()=>{
    const base=structuredClone(rootWireBase("COMMIT")),prepared=prepareNativeRootSourceRequest(base,"issue"),before=nativeRootSourceTransportRequest(prepared);
    base.original.grant_id="TEST_ONLY-changed";base.mutation!.mutation_id="00000000-0000-0000-0000-000000000000";
    expect(nativeRootSourceTransportRequest(prepared)).toEqual(before);expect(()=>nativeRootBase(base)).toThrow();
    for(const operation of ["READ","STREAM","HISTORY","REPLAY"])expect(()=>nativeRootBase({...rootWireBase(),binding:{...rootWireBase().binding,operation}})).toThrow();
    expect(()=>nativeRootSourceTransportRequest({...prepared})).toThrow();
  });
  it("rejects duplicate decoded keys, arrays/null ambiguity, unsafe numbers and invalid UTF8",()=>{
    for(const wire of ['{"phase":1,"phase":2}','{"a":{"x":1,"\\u0078":2}}','{"x":9007199254740993}','{"x":NaN}','{"x":1e999}','{"x":"\\ud800"}'])
      expect(()=>nativeRootDecode(Buffer.from(wire))).toThrow();
    expect(()=>nativeRootDecode(Buffer.from([0xc0,0xaf]))).toThrow();
    expect(nativeRootDecode(Buffer.from('{"a":[true,false,null,1]}'))).toEqual({a:[true,false,null,1]});
  });
  it("carries full ORIGINAL digest distinct from semantic binding; ROOT+each census proof conforms",()=>{
    const now=Date.now(),{grant,fact,relations}=rootWireFacts(now);
    expect(relations.grants[0].binding_digest).not.toBe(fact.grant_digest);
    expect(currentAcceptanceMatches(fact,grant,relations,now)).toBe(true);
    const attached={...grant,ts_acceptance_digest:accessDigest(fact),ts_receipt:{receipt_id:fact.receipt_id,
      membership_revision:fact.membership_revision,mapping_revision:fact.mapping_revision,effective_at_ms:fact.effective_at_ms,expires_at_ms:fact.expires_at_ms}};
    for(const proof of relations.grants[0].targets)expect(currentGrantProof(attached,relations,proof.resource,"paper",now)).not.toBeNull();
    const base=rootWireBase("QUALIFY",{original:{grant_id:grant.grant_id,accepted_fact_digest:accessDigest(fact)}});
    const result=parseNativeRootSourceResult(prepareNativeRootSourceRequest(base,"issue"),Buffer.from(JSON.stringify(rootWireReply(base,"issue",relations))));
    expect(result.state).toBe("ISSUED");
    // Even correctly parsed JSON never becomes an authenticated transport witness.
    expect(()=>nativeRootSourceAuthenticatedResult({} as NativeRootSourceClient,result)).toThrow();
  });
  it("rejects a different original binding and transport action's result shape",()=>{
    const base=rootWireBase(),prepared=prepareNativeRootSourceRequest(base,"issue"),reply=rootWireReply(base,"issue");
    expect(()=>parseNativeRootSourceResult(prepared,Buffer.from(JSON.stringify({...reply,binding:{...base.binding,attempt_id:"00000000-0000-0000-0000-000000000000"}})))).toThrow();
    expect(()=>parseNativeRootSourceResult(prepared,Buffer.from(JSON.stringify(rootWireReply(base,"enter"))))).toThrow();
    expect(nativeRootCanonical({z:[null,true],a:{y:2,x:1}})).toBe('{"a":{"x":1,"y":2},"z":[null,true]}');
  });
});
