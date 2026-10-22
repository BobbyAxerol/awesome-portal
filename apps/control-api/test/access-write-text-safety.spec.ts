/** DEBT-UXM07-043. Synthetic input-only boundary tests, no DB or installed
 * authority. The real controller/security/schema path runs; the downstream
 * service is a spy so a refusal proves no write is dispatched. */
import { describe, expect, it, vi } from "vitest";
import { sha256 } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { CSRF_COOKIE } from "../src/auth/cookies";
import { ExecutionAccessController } from "../src/execution-v2/access.controller";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { accessPreview, accessProposal, accessRevoke, accessText, accessWriteText,
  classifyStoredAccessGrant, grantChange, resourceSelector, scopedAccessGrant,
  type GrantChange } from "../src/execution-v2/access.contract";
import { grant } from "./support/access-fixture";

const WORKSPACE="TEST_ONLY:workspace", TARGET="TEST_ONLY:target", KEY="TEST_ONLY:key:1234";
const DIGEST=`sha256:${"a".repeat(64)}`;
const CSRF="TEST_ONLY:csrf-input-only", ORIGIN="https://portal.test";
const change=():GrantChange=>({subject_user_id:TARGET,action:"users.read",effect:"ALLOW",
  selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"USER",ids:[TARGET]},environments:["paper"],
  valid_from_ms:1_800_000_000_000,valid_until_ms:1_800_000_100_000,delegable_actions:[],
  ceiling_grant_id:"TEST_ONLY:ceiling",expected_ceiling_revision:"TEST_ONLY:grant:r1",
  expected_policy_revision:"TEST_ONLY:policy:r1",expected_ts_membership_revision:null,
  reason:"TEST_ONLY:reviewed access"});
const revoke=()=>({workspace_id:WORKSPACE,expected_policy_revision:"TEST_ONLY:policy:r1",
  expected_grant_revision:"TEST_ONLY:grant:r1",reason:"TEST_ONLY:withdraw access"});

// This is the exact character set rejected by the existing strict FE readers.
const unsafeCodePoints=[
  ...Array.from({length:32},(_,i)=>i),
  ...Array.from({length:33},(_,i)=>0x7f+i),
  0x61c,0x180e,...Array.from({length:5},(_,i)=>0x200b+i),
  ...Array.from({length:5},(_,i)=>0x202a+i),
  ...Array.from({length:5},(_,i)=>0x2060+i),
  ...Array.from({length:4},(_,i)=>0x2066+i),0xfeff,
];
const invalidTexts=[...unsafeCodePoints.map(cp=>`TEST_ONLY:${String.fromCodePoint(cp)}:hidden`),
  " ","\u00a0\u3000","TEST_ONLY:\ud800","TEST_ONLY:\udfff","TEST_ONLY:\udfff\ud800"];

describe("access write-only text policy",()=>{
  it("rejects the full FE unsafe set, whitespace-only and malformed Unicode at every nested grant input",()=>{
    for(const value of invalidTexts){
      const mutations:GrantChange[]=[
        {...change(),subject_user_id:value},{...change(),ceiling_grant_id:value},{...change(),reason:value},
        {...change(),selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"USER",ids:[TARGET,value]}},
        {...change(),selector:{kind:"PORTFOLIO_MEMBERSHIP",portfolio_ids:[value]}},
        {...change(),selector:{kind:"ROOT_SCOPE",root_id:value}},
      ];
      expect(accessWriteText.safeParse(value).success,JSON.stringify(value)).toBe(false);
      for(const mutation of mutations){
        expect(grantChange.safeParse(mutation).success,JSON.stringify(mutation)).toBe(false);
        expect(accessPreview.safeParse({workspace_id:WORKSPACE,change:mutation}).success).toBe(false);
        expect(accessProposal.safeParse({workspace_id:WORKSPACE,change:mutation,preview_digest:DIGEST}).success).toBe(false);
      }
      expect(accessPreview.safeParse({workspace_id:value,change:change()}).success).toBe(false);
      expect(accessProposal.safeParse({workspace_id:value,change:change(),preview_digest:DIGEST}).success).toBe(false);
      expect(accessRevoke.safeParse({...revoke(),workspace_id:value}).success).toBe(false);
      expect(accessRevoke.safeParse({...revoke(),reason:value}).success).toBe(false);
    }
  });

  it("keeps code-point limits, exact bytes, printable Unicode and opaque revisions unchanged",()=>{
    const text="  TEST_ONLY:Cafe\u0301 日本語 😀  ";
    const revision="TEST_ONLY:opaque:\u0085\u200d\ud800";
    const input={workspace_id:text,change:{...change(),subject_user_id:text,ceiling_grant_id:text,
      selector:{kind:"ROOT_SCOPE" as const,root_id:text},reason:text,
      expected_ceiling_revision:revision,expected_policy_revision:revision,expected_ts_membership_revision:revision}};
    const before=JSON.stringify(input);
    expect(accessPreview.parse(input)).toEqual(input);
    expect(accessProposal.parse({...input,preview_digest:DIGEST})).toEqual({...input,preview_digest:DIGEST});
    expect(accessRevoke.parse({workspace_id:text,reason:text,expected_policy_revision:revision,expected_grant_revision:revision}))
      .toEqual({workspace_id:text,reason:text,expected_policy_revision:revision,expected_grant_revision:revision});
    expect(JSON.stringify(input)).toBe(before);
    expect(accessWriteText.parse("😀".repeat(256))).toBe("😀".repeat(256));
    expect(accessWriteText.safeParse("😀".repeat(257)).success).toBe(false);
    expect(grantChange.parse({...change(),reason:"😀".repeat(512)}).reason).toBe("😀".repeat(512));
    expect(grantChange.safeParse({...change(),reason:"😀".repeat(513)}).success).toBe(false);
    expect(accessRevoke.safeParse({...revoke(),reason:"😀".repeat(513)}).success).toBe(false);
    expect(grantChange.parse({...change(),selector:{kind:"OWN_ALPHA"}}).selector).toEqual({kind:"OWN_ALPHA"});
  });

  it("keeps legacy stored fact and selector decoding readable without rewriting their bytes",()=>{
    // All were accepted by the pre-existing accessText parser. They remain so:
    // write safety is not a retroactive migration or normalization policy.
    for(const value of ["TEST_ONLY:\u0085","TEST_ONLY:\u200d","TEST_ONLY:\u202e"," ","TEST_ONLY:\ud800"]){
      expect(accessText.parse(value)).toBe(value);
      const selector={kind:"EXPLICIT_RESOURCE_SET" as const,resource_kind:"PORTFOLIO" as const,ids:[value]};
      expect(resourceSelector.parse(selector)).toEqual(selector);
      const stored=grant("TEST_ONLY:legacy",{subject_user_id:value,workspace_id:value,issued_by:value,
        selector,action:"users.read",requires_ts_acceptance:false,ts_receipt:null});
      expect(scopedAccessGrant.parse(stored)).toEqual(stored);
      expect(classifyStoredAccessGrant(stored)).toEqual({kind:"LEGACY",fact:stored});
      expect(grantChange.safeParse({...change(),subject_user_id:value}).success).toBe(false);
    }
  });
});

function setup(){
  const service={
    preview:vi.fn(async(..._args:unknown[])=>({allowed:true})),
    propose:vi.fn(async(..._args:unknown[])=>({receipt:{http_status:201},replayed:false})),
    revoke:vi.fn(async(..._args:unknown[])=>({receipt:{http_status:200},replayed:false})),
    previewRevoke:vi.fn(async(..._args:unknown[])=>({advisory_only:true})),
    stepUp:vi.fn(async(..._args:unknown[])=>({})),
  };
  const controller=new ExecutionAccessController(service as unknown as ExecutionAccessService,
    {config:{PORTAL_PUBLIC_ORIGIN:ORIGIN}} as AuthService);
  const request={method:"POST",headers:{origin:ORIGIN,"x-portal-csrf":CSRF,"x-portal-idempotency-key":KEY},
    cookies:{[CSRF_COOKIE]:CSRF},portalUser:{userId:"TEST_ONLY:actor",sessionVersion:1},
    portalSession:{sessionId:"TEST_ONLY:session",csrfSecretHash:sha256(CSRF)}} as Parameters<ExecutionAccessController["preview"]>[0];
  const reply={code:vi.fn()};
  return {service,controller,request,reply:reply as unknown as Parameters<ExecutionAccessController["preview"]>[2]};
}
type WriteRoute="preview"|"propose"|"revoke"|"previewRevoke";
function invoke(f:ReturnType<typeof setup>,route:WriteRoute,body:unknown,id="TEST_ONLY:grant"){
  return route==="preview"?f.controller.preview(f.request,body,f.reply):
    route==="propose"?f.controller.propose(f.request,body,f.reply):
    route==="revoke"?f.controller.revoke(f.request,body,id,f.reply):
    f.controller.previewRevoke(f.request,body,id,f.reply);
}

describe("real Access controller write boundary (synthetic service spy, no DB)",()=>{
  it.each(["preview","propose"] as const)("%s rejects unsafe nested text before dispatch",async route=>{
    const f=setup();
    for(const value of ["TEST_ONLY:\u0085","TEST_ONLY:\u200d","TEST_ONLY:\u202e"," ","TEST_ONLY:\ud800"]){
      for(const mutation of [{...change(),reason:value},{...change(),subject_user_id:value},
        {...change(),selector:{kind:"PORTFOLIO_MEMBERSHIP" as const,portfolio_ids:[value]}},
        {...change(),selector:{kind:"ROOT_SCOPE" as const,root_id:value}}]){
        const body={workspace_id:WORKSPACE,change:mutation,...(route==="propose"?{preview_digest:DIGEST}:{})};
        await expect(invoke(f,route,body)).rejects.toMatchObject({code:"ACCESS_INPUT_INVALID",status:400});
      }
    }
    expect(f.service[route]).not.toHaveBeenCalled();
    const valid={workspace_id:WORKSPACE,change:change(),...(route==="propose"?{preview_digest:DIGEST}:{})};
    await invoke(f,route,valid);
    expect(f.service[route]).toHaveBeenCalledTimes(1);
    expect(f.service[route].mock.calls[0].slice(0,3)).toEqual([
      {user_id:"TEST_ONLY:actor",session_id:"TEST_ONLY:session",session_generation:1},WORKSPACE,change()]);
  });

  it.each(["revoke","previewRevoke"] as const)("%s rejects unsafe workspace, reason and path ID before dispatch",async route=>{
    const f=setup();
    for(const value of ["TEST_ONLY:\u009f","TEST_ONLY:\u2066","TEST_ONLY:\ufeff"," ","TEST_ONLY:\udfff"]){
      await expect(invoke(f,route,{...revoke(),reason:value})).rejects.toMatchObject({code:"ACCESS_INPUT_INVALID",status:400});
      await expect(invoke(f,route,{...revoke(),workspace_id:value})).rejects.toMatchObject({code:"ACCESS_INPUT_INVALID",status:400});
      await expect(invoke(f,route,revoke(),value)).rejects.toMatchObject({code:"ACCESS_INPUT_INVALID",status:400});
    }
    expect(f.service[route]).not.toHaveBeenCalled();
    const reason="  TEST_ONLY:Cafe\u0301 日本語 😀  ";
    await invoke(f,route,{...revoke(),reason});
    expect(f.service[route]).toHaveBeenCalledTimes(1);
    expect(f.service[route].mock.calls[0].at(-1)).toBe(reason);
  });

  it("validates the step-up workspace but treats password bytes as a credential, not display text",async()=>{
    const f=setup(),password="TEST_ONLY:\u200d password bytes";
    await expect(f.controller.stepUp(f.request,{workspace_id:"\u200d",password},f.reply))
      .rejects.toMatchObject({code:"ACCESS_INPUT_INVALID",status:400});
    expect(f.service.stepUp).not.toHaveBeenCalled();
    await f.controller.stepUp(f.request,{workspace_id:WORKSPACE,password},f.reply);
    expect(f.service.stepUp.mock.calls[0][2]).toBe(password);
  });

  it("keeps Origin/CSRF/idempotency enforcement ahead of input validation",async()=>{
    const f=setup();
    await expect(f.controller.preview({...f.request,headers:{...f.request.headers,origin:"https://other.test"}},
      {workspace_id:WORKSPACE,change:change()},f.reply)).rejects.toMatchObject({code:"ORIGIN_DENIED",status:403});
    await expect(f.controller.preview({...f.request,cookies:{}},{workspace_id:WORKSPACE,change:change()},f.reply))
      .rejects.toMatchObject({code:"CSRF_MISSING",status:403});
    const headers={...f.request.headers};delete headers["x-portal-idempotency-key"];
    await expect(f.controller.preview({...f.request,headers},{workspace_id:WORKSPACE,change:change()},f.reply))
      .rejects.toMatchObject({code:"IDEMPOTENCY_KEY_REQUIRED",status:400});
    expect(f.service.preview).not.toHaveBeenCalled();
  });
});
