/** Synthetic conformance/provenance, NOT connected source acceptance. */
import {describe,expect,it} from "vitest";
import {nativeCurrentRelationsBase,nativeCurrentRelationsDecode,nativeCurrentRelationsSourceTransportRequest,
 prepareNativeCurrentRelationsSourceRequest,parseNativeCurrentRelationsSourceResult} from "../src/execution-v2/native-current-relations-codec";
import {nativeCurrentRelationsSourceAuthenticatedResult,NativeCurrentRelationsSourceClient} from "../src/execution-v2/native-current-relations-source-client";
import {nativeRootSourceTransportRequest,prepareNativeRootSourceRequest} from "../src/execution-v2/native-root-codec";
import {currentRelationsWireBase,currentRelationsWireReply} from "./fixtures/elp210-native-current-relations-wire";
import {rootWireBase} from "./fixtures/elp210-native-root-wire";
describe("ordinary native CURRENT exact private wire",()=>{
 it.each(["issue","enter","unknown","status","cancel-unentered","resolve"] as const)("%s preserves exact actual caller/registered principal",action=>{
  const base=currentRelationsWireBase(),prepared=prepareNativeCurrentRelationsSourceRequest(base,action,action==="resolve"?"YQ.Yg.Yw":undefined),
   wire=nativeCurrentRelationsSourceTransportRequest(prepared);
  expect(wire.path).toBe(`/internal/elp210/native-current-relations/${action}`);expect(JSON.parse(wire.base_body)).toEqual(base);
  expect(base.registration.expected_version).toBe("9007199254741001");expect(base.binding.subject).not.toBe(base.purpose.principal_id);
  const parsed=parseNativeCurrentRelationsSourceResult(prepared,Buffer.from(JSON.stringify(currentRelationsWireReply(base,action))));
  expect(Object.isFrozen(parsed)).toBe(true);expect(()=>nativeCurrentRelationsSourceAuthenticatedResult({} as NativeCurrentRelationsSourceClient,parsed)).toThrow();
 });
 it("rejects ROOT/MUTATION/STREAM/HISTORY and impersonated actor after freeze",()=>{
  const base=structuredClone(currentRelationsWireBase()),prepared=prepareNativeCurrentRelationsSourceRequest(base,"issue"),wire=nativeCurrentRelationsSourceTransportRequest(prepared);
  base.purpose.actor_id="TEST_ONLY-other";base.original.grant_id="TEST_ONLY-other";
  expect(nativeCurrentRelationsSourceTransportRequest(prepared)).toEqual(wire);expect(()=>nativeCurrentRelationsBase(base)).toThrow();
  for(const operation of ["MUTATION","STREAM","HISTORY","REPLAY"])expect(()=>nativeCurrentRelationsBase({...currentRelationsWireBase(),binding:{...currentRelationsWireBase().binding,operation}})).toThrow();
  expect(()=>nativeCurrentRelationsSourceTransportRequest(prepareNativeRootSourceRequest(rootWireBase(),"issue") as never)).toThrow();
  expect(()=>nativeRootSourceTransportRequest(prepared as never)).toThrow();
  expect(()=>nativeCurrentRelationsSourceTransportRequest({...prepared})).toThrow();
 });
 it("rejects duplicate keys, invalid UTF8, BIGINT Number normalization and caller getters",()=>{
  for(const json of ['{"a":1,"a":2}','{"a":{"x":1,"\\u0078":2}}','{"x":9007199254740993}','{"x":"\\ud800"}'])
   expect(()=>nativeCurrentRelationsDecode(Buffer.from(json))).toThrow();
  expect(()=>nativeCurrentRelationsDecode(Buffer.from([0xc0,0xaf]))).toThrow();let invoked=false;
  expect(()=>nativeCurrentRelationsBase({...currentRelationsWireBase(),get purpose(){invoked=true;throw Error();}})).toThrow();expect(invoked).toBe(false);
 });
 it("refuses different principal/current cut and MUTATION terminal phases",()=>{
  const base=currentRelationsWireBase(),issue=prepareNativeCurrentRelationsSourceRequest(base,"issue"),reply=currentRelationsWireReply(base,"issue") as any;
  expect(()=>parseNativeCurrentRelationsSourceResult(issue,Buffer.from(JSON.stringify({...reply,relations:{...reply.relations,subject_user_id:"TEST_ONLY-another"}})))).toThrow();
  const resolve=prepareNativeCurrentRelationsSourceRequest(base,"resolve","YQ.Yg.Yw");
  for(const phase of ["COMMITTED","ROLLED_BACK"])expect(()=>parseNativeCurrentRelationsSourceResult(resolve,Buffer.from(JSON.stringify({
   ...currentRelationsWireReply(base,"resolve"),recovery:{state:"SETTLED",phase,terminal_authority:true,release_permitted:true}})))).toThrow();
 });
});
