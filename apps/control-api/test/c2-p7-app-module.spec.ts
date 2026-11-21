import "reflect-metadata";
import {createHash} from "node:crypto";
import type {Pool} from "pg";
import {describe,expect,it} from "vitest";
import {AppModule,type ControlApiDependencies} from "../src/app.module";
import {loadConfig,type ControlApiConfig} from "../src/config";
import {C2P7ReviewCandidateService,C2P7EmergencyReviewCandidateService} from "../src/execution-v2/c2-p7-review-candidate.service";
import {C2P7EmergencyReductionCandidate} from "../src/execution-v2/c2-p7-emergency-reduction-candidate";
import {C2P7OwnerIntentCandidate} from "../src/execution-v2/c2-p7-owner-intent-candidate";
import {C2P7RegistrationWriterCandidate} from "../src/execution-v2/c2-p7-registration-writer-candidate";
import {C2P7RecordCandidate,type C2P7SourceVerifier} from "../src/execution-v2/c2-p7-acceptance";
import {C2P7ReviewCandidateController,C2P7EmergencyCandidateController} from "../src/execution-v2/c2-p7-review-candidate.controller";

// Composition test only. Synthetic services and no DB, source, owner session,
// accepted delegation, listener or issuance are claimed.
const workspace="TEST_ONLY-workspace";
const pool=()=>({options:{connectionTimeoutMillis:1000,query_timeout:1000}} as Pool);
const syntheticB1=()=>Buffer.from(JSON.stringify({schema:"ts.c2.pm-current-access-publication-input.v1",expected_version:0,
  head:{db_login:"ts_pm_operator",db_role:"pm_scoped_writer",environment:"paper",user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",version:1},
  acceptance:{document:{field_revision:"pma-field-policy-20261016-r1",fields:["business_report"],membership_policy_revision:1,
    operations:["HISTORY","READ"],physical_refs:[],scopes:[{environment:"paper",portfolio_id:"paper-portfolio-g1"},
      {environment:"paper",portfolio_id:"paper-root-g1"}],visibility:"BUSINESS"},revoked:false},
  portal_fills:["head.acceptance_id","head.workspace_id","head.workload_ref","acceptance.effective_from","acceptance.expires_at",
    "document.human_authority_revision","document.application_revision","document.acceptance_ref","document.delegation_ref"],
  rules:{canonical:"json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)",
    copy_verbatim:["expected_version","head.user_id","head.environment","head.db_login","head.db_role","head.version",
      "acceptance.revoked","acceptance.document.membership_policy_revision","acceptance.document.field_revision",
      "acceptance.document.visibility","acceptance.document.fields","acceptance.document.operations",
      "acceptance.document.physical_refs","acceptance.document.scopes"],
    effective_from:"signing time, UTC Z, whole seconds",window_max_days:90}}));
function fixture(db:Pool,enabled=true,variant?:"intent-pool"|"writer-pool"|"record-pool"|"intent-source"|"writer-source"|"record-source"|"writer-intent"|"intent-key"|"record-key") {
  const b1=syntheticB1(),pin=createHash("sha256").update(b1).digest("hex");
  const source:C2P7SourceVerifier={verify:()=>({})},otherSource:C2P7SourceVerifier={verify:()=>({})};
  const otherPool=pool(),key="test-key",otherKey="other-test-key";
  const intents=new C2P7OwnerIntentCandidate(variant==="intent-pool"?otherPool:db,variant==="intent-source"?otherSource:source,
    variant==="intent-key"?otherKey:key);
  const writerIntent=variant==="writer-intent"?new C2P7OwnerIntentCandidate(db,source,key):intents;
  const registrations=new C2P7RegistrationWriterCandidate(variant==="writer-pool"?otherPool:db,
    variant==="writer-source"?otherSource:source,writerIntent,key);
  const records=new C2P7RecordCandidate(variant==="record-pool"?otherPool:db,
    variant==="record-source"?otherSource:source,variant==="record-key"?otherKey:key);
  const review=new C2P7ReviewCandidateService(db,source,intents,registrations,records,
    {enabled,environment:"RESEARCH",workspace_id:workspace,cycle_sha256:"a".repeat(64),b1_sha256:pin,b1_bytes:b1,source_proof:Buffer.from("test")});
  const emergency=new C2P7EmergencyReviewCandidateService(new C2P7EmergencyReductionCandidate(db,"test-key"),
    {enabled,environment:"RESEARCH",workspace_id:workspace});
  return {review,emergency};
}
const config=()=>({...loadConfig({PORTAL_ENV:"local",AUTH_MODE:"dev",DATABASE_URL:"postgres://TEST_ONLY/TEST_ONLY_core"}),
  EXECUTION_READ_PROFILE:"native_manager_review_v1",EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:workspace} as ControlApiConfig);
function deps(db:Pool):ControlApiDependencies {return {nativeManagerRead:{} as never,
  nativeManagerRealtimeLimits:{maximumClients:2,maximumEntriesPerClient:8,maximumFrameBytes:65536,
    maximumClientBytes:131072,maximumTotalBytes:262144,maximumNoticesPerRead:20,readTimeoutMs:1000},
  executionAccessTrust:{} as never,currentHumanMutations:{usesPool:(p:Pool)=>p===db} as never};}

describe("P7 candidate AppModule composition",()=>{
  it("leaves both routes unmounted by default",()=>{
    const module=AppModule.register({NODE_ENV:"test"} as ControlApiConfig,pool());
    expect(module.controllers).not.toContain(C2P7ReviewCandidateController);
    expect(module.controllers).not.toContain(C2P7EmergencyCandidateController);
  });
  it("mounts only explicitly supplied same-pool Research candidates",()=>{
    const db=pool(),f=fixture(db),base=deps(db);
    const review=AppModule.register(config(),db,undefined,{...base,c2P7ReviewCandidate:f.review});
    expect(review.controllers).toContain(C2P7ReviewCandidateController);
    expect(review.controllers).not.toContain(C2P7EmergencyCandidateController);
    const both=AppModule.register(config(),db,undefined,{...base,c2P7ReviewCandidate:f.review,c2P7EmergencyCandidate:f.emergency});
    expect(both.controllers).toContain(C2P7ReviewCandidateController);
    expect(both.controllers).toContain(C2P7EmergencyCandidateController);
    const emergency=AppModule.register(config(),db,undefined,{...base,c2P7EmergencyCandidate:f.emergency});
    expect(emergency.controllers).not.toContain(C2P7ReviewCandidateController);
    expect(emergency.controllers).toContain(C2P7EmergencyCandidateController);
  });
  it("refuses wrong environment, workspace, pool, disabled instance and spoof",()=>{
    const db=pool(),other=pool(),f=fixture(db),base=deps(db);
    expect(()=>AppModule.register({NODE_ENV:"test"} as ControlApiConfig,db,undefined,{c2P7ReviewCandidate:f.review}))
      .toThrow("C2_P7_RESEARCH_COMPOSITION_REQUIRED");
    expect(()=>AppModule.register({...config(),EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:"other"},db,undefined,{...base,c2P7ReviewCandidate:f.review}))
      .toThrow("C2_P7_RESEARCH_COMPOSITION_REQUIRED");
    expect(()=>AppModule.register(config(),other,undefined,{...deps(other),c2P7EmergencyCandidate:f.emergency}))
      .toThrow("C2_P7_RESEARCH_COMPOSITION_REQUIRED");
    expect(()=>AppModule.register(config(),db,undefined,{...base,c2P7ReviewCandidate:fixture(db,false).review}))
      .toThrow("C2_P7_RESEARCH_COMPOSITION_REQUIRED");
    expect(()=>AppModule.register(config(),db,undefined,{...base,c2P7ReviewCandidate:{usesInstallation:()=>true} as never}))
      .toThrow("C2_P7_RESEARCH_COMPOSITION_REQUIRED");
  });
  it.each(["intent-pool","writer-pool","record-pool","intent-source","writer-source","record-source",
    "writer-intent","intent-key","record-key"] as const)("refuses mixed authority composition: %s",variant=>{
    const db=pool(),f=fixture(db,true,variant);
    expect(()=>AppModule.register(config(),db,undefined,{...deps(db),c2P7ReviewCandidate:f.review}))
      .toThrow("C2_P7_RESEARCH_COMPOSITION_REQUIRED");
  });
});
