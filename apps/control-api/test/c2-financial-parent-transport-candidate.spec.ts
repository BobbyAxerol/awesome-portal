/** TEST ONLY: mock storage and issuer; no source, database or Edge proof. */
import {randomUUID} from "node:crypto";
import {generateKeyPair,SignJWT} from "jose";
import {describe,expect,it,vi} from "vitest";
import {C2FinancialParentCandidate} from "../src/execution-v2/c2-financial-parent-candidate";
import {C2FinancialDurableInnerCandidate} from "../src/execution-v2/c2-financial-durable-inner-candidate";
import {C2FinancialParentOrchestratorCandidate} from "../src/execution-v2/c2-financial-parent-orchestrator-candidate";
import {pmHttpRequestDigest} from "../src/execution-v2/pm-http-request-binding";

const actor={user_id:"TEST_ONLY-user",session_id:"TEST_ONLY-session",session_generation:1};
const selection={workspace_id:"TEST_ONLY-workspace",environment:"paper" as const,workload_id:"TEST_ONLY-source",
  receiver_id:"TEST_ONLY-receiver",binding_digest:`sha256:${"a".repeat(64)}`,
  paths:["/test-only/a","/test-only/b","/test-only/c","/test-only/d","/test-only/e","/test-only/f"]};
const request={schema_version:"portal.execution.financial-source-assertion-request.v1",binding_digest:selection.binding_digest,
  receiver_id:selection.receiver_id,workload_id:selection.workload_id,method:"POST",path:selection.paths[0],body_utf8:"{}",
  delivery_sequence:0,previous_lease_id:null,request_digest:pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(selection.paths[0]),
    query_string:Buffer.alloc(0),body:Buffer.from("{}")},{request_bytes:1_048_576})};

describe("unmounted financial parent transport scope",()=>{
  it.each(["scope-exit","scope-reopen","release","shutdown"])("never returns an in-flight assertion after %s",async mode=>{
    const key=await generateKeyPair("EdDSA",{crv:"Ed25519"});
    let unblock!:()=>void,started!:()=>void;
    const blocked=new Promise<void>(resolve=>{unblock=resolve;}),startedPromise=new Promise<void>(resolve=>{started=resolve;});
    const parent=Object.create(C2FinancialParentCandidate.prototype) as C2FinancialParentCandidate;
    Object.defineProperty(parent,"save",{value:vi.fn(async()=>randomUUID())});
    const inner=Object.create(C2FinancialDurableInnerCandidate.prototype) as C2FinancialDurableInnerCandidate;
    Object.defineProperty(inner,"issueBoundDelivery",{value:vi.fn(async(a:typeof actor,b:Record<string,unknown>)=>{
      started();await blocked;const now=Math.floor(Date.now()/1000),lease=randomUUID();
      const token=await new SignJWT({...b,purpose:"pma.identity.v1",sub:a.user_id,sid:a.session_id,
        session_revision:a.session_generation,authority_revision:1,jti:lease,iat:now,exp:now+30})
        .setProtectedHeader({alg:"EdDSA"}).sign(key.privateKey);
      return {token,lease_id:lease,expires_at_ms:(now+30)*1000,authority_revision:1};
    })});
    Object.defineProperty(inner,"resumeBoundDelivery",{value:vi.fn(async()=>{throw Error("TEST_ONLY");})});
    Object.defineProperty(inner,"revalidateBoundDelivery",{value:vi.fn(async()=>undefined)});
    const orchestrator=new C2FinancialParentOrchestratorCandidate(parent,inner,
      {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
    const operation=randomUUID();await orchestrator.begin(operation,actor,selection);
    const transport=orchestrator.testTransportAuthority();let inFlight!:Promise<unknown>;
    const scope=orchestrator.withTestTransportContext(operation,actor,selection,async context=>{
      inFlight=transport.issue(context,request);await startedPromise;
      if(mode==="release")orchestrator.release(operation,actor,selection);
      if(mode==="shutdown")orchestrator.shutdown();
    });
    if(mode==="scope-exit"||mode==="scope-reopen")await expect(scope).resolves.toBeUndefined();
    else await expect(scope).rejects.toThrow();
    let finishReopened:(()=>void)|undefined, reopened:Promise<void>|undefined;
    if(mode==="scope-reopen") {
      const hold=new Promise<void>(resolve=>{finishReopened=resolve;});
      reopened=orchestrator.withTestTransportContext(operation,actor,selection,async()=>{await hold;});
    }
    unblock();await expect(inFlight).rejects.toThrow();
    finishReopened?.();if(reopened)await expect(reopened).resolves.toBeUndefined();
    orchestrator.shutdown();
  });
});
