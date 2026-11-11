import "reflect-metadata";
import fastifyCookie from "@fastify/cookie";
import {Module} from "@nestjs/common";
import {NestFactory} from "@nestjs/core";
import {FastifyAdapter,type NestFastifyApplication} from "@nestjs/platform-fastify";
import type {FastifyInstance} from "fastify";
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {AuthService} from "../src/auth/auth.service";
import {sha256} from "../src/auth/argon";
import {CSRF_COOKIE,SESSION_COOKIE} from "../src/auth/cookies";
import {SessionGuard} from "../src/facade/session.guard";
import {HttpErrorFilter} from "../src/http-error.filter";
import {WorkspacesRepository} from "../src/repos/workspaces";
import {C2P7CandidateNoStoreGuard,C2P7EmergencyCandidateController,C2P7ReviewCandidateController} from "../src/execution-v2/c2-p7-review-candidate.controller";
import {C2P7EmergencyReviewCandidateService,C2P7ReviewCandidateService} from "../src/execution-v2/c2-p7-review-candidate.service";

/** Real Nest/Fastify + real SessionGuard and mutation security; identity/session
 * repositories and downstream services are synthetic. No source/DB/runtime. */
@Module({}) class TestOnlyP7Module {}
const ORIGIN="https://portal.test",TOKEN="TEST_ONLY_SESSION",CSRF="TEST_ONLY_CSRF",path="/api/admin/c2-p7-candidate";
const cookie=`${SESSION_COOKIE}=${TOKEN}; ${CSRF_COOKIE}=${CSRF}`;
const headers={cookie,origin:ORIGIN,"x-portal-csrf":CSRF,"x-portal-idempotency-key":"TEST_ONLY-key-123"};
describe("P7 candidate HTTP boundary, synthetic sessions/services",()=>{
  let app:NestFastifyApplication,http:FastifyInstance,enabled=false,userActive=true;
  const sessionFromToken=vi.fn(async(token:string)=>token===TOKEN?{sessionId:"TEST_ONLY-session",userId:"TEST_ONLY-owner",state:"ACTIVE",
    sessionVersion:7,csrfSecretHash:sha256(CSRF)}:null);
  const findById=vi.fn(async()=>({userId:"TEST_ONLY-owner",username:"TEST_ONLY-owner",status:userActive?"ACTIVE":"DISABLED",
    mustChangePassword:false,sessionVersion:7}));
  const review={preview:vi.fn(async()=>{if(!enabled)throw new Error("TEST_ONLY disabled");return {state:"REVIEW_ONLY_NOT_AUTHORIZED"};}),
    confirm:vi.fn(async()=>{if(!enabled)throw new Error("TEST_ONLY disabled");return {state:"REGISTRATION_RECORDED_P7_NOT_CONFIRMED",intent_id:"TEST_ONLY-id"};}),
    resume:vi.fn(async()=>{if(!enabled)throw new Error("TEST_ONLY disabled");return {state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED"};}),
    resumeByKey:vi.fn(async()=>{if(!enabled)throw new Error("TEST_ONLY disabled");return {state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED"};})};
  const emergency={revoke:vi.fn(async()=>{if(!enabled)throw new Error("TEST_ONLY disabled");return {state:"AUTHORITY_PROPAGATION_PENDING"};})};
  beforeAll(async()=>{
    app=await NestFactory.create<NestFastifyApplication>({module:TestOnlyP7Module,
      controllers:[C2P7ReviewCandidateController,C2P7EmergencyCandidateController],providers:[C2P7CandidateNoStoreGuard,SessionGuard,
        {provide:AuthService,useValue:{config:{PORTAL_PUBLIC_ORIGIN:ORIGIN},sessionFromToken,users:{findById}}},
        {provide:WorkspacesRepository,useValue:{ensurePersonal:async()=>({workspaceId:"TEST_ONLY-workspace"})}},
        {provide:C2P7ReviewCandidateService,useValue:review},{provide:C2P7EmergencyReviewCandidateService,useValue:emergency}]},
      new FastifyAdapter(),{logger:false,abortOnError:false});
    await app.register(fastifyCookie as never);app.useGlobalFilters(new HttpErrorFilter());await app.init();
    http=app.getHttpAdapter().getInstance() as FastifyInstance;await http.ready();
  });
  beforeEach(()=>{enabled=false;userActive=true;review.preview.mockClear();review.confirm.mockClear();review.resume.mockClear();review.resumeByKey.mockClear();emergency.revoke.mockClear();});
  afterAll(async()=>{if(app)await app.close();});
  it("rejects absent/invalid session or disabled user with no-store before dispatch",async()=>{
    const absent=await http.inject({method:"GET",url:`${path}/preview`});
    expect(absent.statusCode).toBe(401);expect(absent.headers["cache-control"]).toBe("private, no-store");
    const invalid=await http.inject({method:"GET",url:`${path}/preview`,headers:{cookie:`${SESSION_COOKIE}=WRONG`}});
    expect(invalid.statusCode).toBe(401);expect(invalid.headers["cache-control"]).toBe("private, no-store");
    userActive=false;const inactive=await http.inject({method:"GET",url:`${path}/preview`,headers:{cookie}});
    expect(inactive.statusCode).toBe(401);expect(inactive.headers["cache-control"]).toBe("private, no-store");
    expect(review.preview).not.toHaveBeenCalled();
  });
  it("keeps disabled service dark and does not reflect errors",async()=>{
    const response=await http.inject({method:"GET",url:`${path}/preview`,headers:{cookie}});
    expect(response.statusCode).toBe(503);expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).not.toContain("TEST_ONLY disabled");expect(response.body).not.toContain(TOKEN);
  });
  it("refuses missing origin, mismatched CSRF and caller-provided scope",async()=>{
    enabled=true;const body={confirmation_sha256:"a".repeat(64)};
    const noOrigin=await http.inject({method:"POST",url:`${path}/confirm`,headers:{cookie,"x-portal-csrf":CSRF,"x-portal-idempotency-key":"key-123456"},payload:body});
    expect(noOrigin.statusCode).toBe(403);expect(noOrigin.headers["cache-control"]).toBe("private, no-store");
    const badCsrf=await http.inject({method:"POST",url:`${path}/confirm`,headers:{...headers,"x-portal-csrf":"WRONG"},payload:body});
    expect(badCsrf.statusCode).toBe(403);expect(badCsrf.headers["cache-control"]).toBe("private, no-store");
    const widened=await http.inject({method:"POST",url:`${path}/confirm`,headers,payload:{...body,workspace_id:"other"}});
    expect(widened.statusCode).toBe(400);expect(widened.headers["cache-control"]).toBe("private, no-store");
    expect(review.confirm).not.toHaveBeenCalled();
  });
  it("refuses unsigned confirmation while keeping emergency reduction separate",async()=>{
    enabled=true;
    const confirm=await http.inject({method:"POST",url:`${path}/confirm`,headers,payload:{confirmation_sha256:"a".repeat(64)}});
    expect(confirm.statusCode).toBe(503);expect(confirm.json().error.code).toBe("C2_P7_OWNER_ATTESTATION_REQUIRED");
    expect(review.confirm).not.toHaveBeenCalled();
    expect(confirm.headers["cache-control"]).toBe("private, no-store");expect(confirm.body).not.toContain(TOKEN);expect(confirm.body).not.toContain("proof");
    const revoke=await http.inject({method:"POST",url:`${path}/emergency-revoke`,headers:{cookie,origin:ORIGIN,"x-portal-csrf":CSRF},
      payload:{intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"}});
    expect(revoke.statusCode).toBe(200);expect(revoke.json().state).toBe("AUTHORITY_PROPAGATION_PENDING");
    expect(revoke.headers["cache-control"]).toBe("private, no-store");expect(revoke.body).not.toContain(TOKEN);
  });
  it("enforces session, origin, CSRF and exact inputs on both recovery routes",async()=>{
    enabled=true;const body={confirmation_sha256:"a".repeat(64)},intent="afba55ed-e41c-4e30-a0e3-bb497a486879";
    for(const [route,payload] of [["resume",{...body,intent_id:intent}],["resume-by-key",body]] as const) {
      const absent=await http.inject({method:"POST",url:`${path}/${route}`,payload});
      expect(absent.statusCode).toBe(401);expect(absent.headers["cache-control"]).toBe("private, no-store");
      const invalid=await http.inject({method:"POST",url:`${path}/${route}`,headers:{...headers,"x-portal-csrf":"WRONG"},payload});
      expect(invalid.statusCode).toBe(403);expect(invalid.headers["cache-control"]).toBe("private, no-store");
      const widened=await http.inject({method:"POST",url:`${path}/${route}`,headers,payload:{...payload,workspace_id:"other"}});
      expect(widened.statusCode).toBe(400);
      const blocked=await http.inject({method:"POST",url:`${path}/${route}`,headers,payload});
      expect(blocked.statusCode).toBe(503);expect(blocked.headers["cache-control"]).toBe("private, no-store");
      expect(blocked.json().error.code).toBe("C2_P7_OWNER_ATTESTATION_REQUIRED");
      expect(blocked.body).not.toContain(TOKEN);expect(blocked.body).not.toContain("proof");
    }
    expect(review.resume).not.toHaveBeenCalled();expect(review.resumeByKey).not.toHaveBeenCalled();
  });
});
