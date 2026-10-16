/** Real disposable PostgreSQL rollback, with an explicitly synthetic guard
 * refusal at a repository seam. This does not activate the candidate schema. */
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { SessionsRepository } from "../src/repos/sessions";
import { UsersRepository } from "../src/repos/users";
import { migrateTestDatabase,setupApp,teardownApp } from "./harness";

const DATABASE_URL=process.env.TEST_DATABASE_URL;
describe.skipIf(!DATABASE_URL)("ELP2-10 legacy credential reset is one atomic write",()=>{
  let ctx:Awaited<ReturnType<typeof setupApp>>,auth:AuthService,admin:AdminService,sequence=0;
  beforeAll(async()=>{
    await migrateTestDatabase(DATABASE_URL!);
    // Local identities are explicit test inputs, not Cloudflare assertions.
    ctx=await setupApp({DATABASE_URL:DATABASE_URL!,AUTH_MODE:"dev"});auth=ctx.app.get(AuthService);
    admin=new AdminService(ctx.pool,ctx.config,auth);
  });
  afterAll(async()=>{vi.restoreAllMocks();if(ctx)await teardownApp(ctx);});

  async function state(userId:string) {
    return {
      user:await auth.users.findById(userId),
      activations:(await ctx.pool.query("SELECT * FROM activation_credentials WHERE user_id=$1 ORDER BY activation_id",[userId])).rows,
      sessions:(await ctx.pool.query("SELECT * FROM auth_sessions WHERE user_id=$1 ORDER BY session_id",[userId])).rows,
      audit:(await ctx.pool.query("SELECT * FROM auth_audit_events WHERE target_user_id=$1 ORDER BY event_id",[userId])).rows,
    };
  }
  async function fixture() {
    const username=`elp210-atomic-reset-${++sequence}`;
    const user=await admin.createUser({username,displayName:"TEST_ONLY atomic reset",role:"USER"});
    const {activationToken}=await admin.resetCredential(user.userId);
    await ctx.pool.query("UPDATE portal_users SET failed_login_count=3,locked_until=clock_timestamp()+interval '1 minute' WHERE user_id=$1",[user.userId]);
    return {userId:user.userId,username,activationToken,before:await state(user.userId)};
  }

  it("a user-guard refusal cannot revoke the old activation or strand a new one",async()=>{
    const f=await fixture(),refusal=Object.assign(new Error("CURRENT_HUMAN_DRAIN_REQUIRED"),{code:"P0001"});
    const spy=vi.spyOn(UsersRepository.prototype,"update").mockRejectedValueOnce(refusal);
    try {await expect(admin.resetCredential(f.userId)).rejects.toBe(refusal);}
    finally {spy.mockRestore();}
    expect(await state(f.userId)).toEqual(f.before);
  });

  it("a later session-guard refusal rolls back activation, generation, counters and audit together",async()=>{
    const f=await fixture(),refusal=Object.assign(new Error("CURRENT_HUMAN_DRAIN_REQUIRED"),{code:"P0001"});
    const spy=vi.spyOn(SessionsRepository.prototype,"revokeAllForUser").mockRejectedValueOnce(refusal);
    try {await expect(admin.resetCredential(f.userId)).rejects.toBe(refusal);}
    finally {spy.mockRestore();}
    expect(await state(f.userId)).toEqual(f.before);
  });

  it("a successful reset returns a secret only after all durable reset facts commit",async()=>{
    const f=await fixture(),result=await admin.resetCredential(f.userId),after=await state(f.userId);
    expect(result.activationToken).toEqual(expect.any(String));
    expect(after.user).toMatchObject({mustChangePassword:true,failedLoginCount:0,lockedUntil:null,
      sessionVersion:f.before.user!.sessionVersion+1});
    expect(after.activations).toHaveLength(f.before.activations.length+1);
    expect(after.activations.filter(a=>a.revoked_at===null)).toHaveLength(1);
    expect(after.audit.filter(a=>a.event_type==="account_lock_cleared")).toHaveLength(1);
    expect(after.audit.filter(a=>a.event_type==="activation_credential_reset")).toHaveLength(2);
    expect(JSON.stringify(after)).not.toContain(result.activationToken);
  });

  it("a late login/session guard refusal cannot consume an activation before delivering a session",async()=>{
    const f=await fixture(),before=await state(f.userId);
    const refusal=Object.assign(new Error("CURRENT_HUMAN_DRAIN_REQUIRED"),{code:"P0001"});
    const spy=vi.spyOn(SessionsRepository.prototype,"create").mockRejectedValueOnce(refusal);
    const input={assertion:undefined,devEmail:`${f.username}@azdag.com`,username:f.username,credential:f.activationToken};
    try {await expect(auth.login(input)).rejects.toBe(refusal);}
    finally {spy.mockRestore();}
    expect(await state(f.userId)).toEqual(before);
    expect(await auth.bindings.findByUser(f.userId)).toEqual([]);
    const retry=await auth.login(input);
    expect(retry.sessionId).toEqual(expect.any(String));
    const after=await state(f.userId);
    expect(after.activations.filter(a=>a.used_at!==null)).toHaveLength(1);
    expect(after.sessions).toHaveLength(1);
    expect(await auth.bindings.findByUser(f.userId)).toHaveLength(1);
    expect(JSON.stringify(after)).not.toContain(retry.token);
  });

  it("two concurrent activation logins deliver exactly one session and one consumed activation",async()=>{
    const f=await fixture();
    const input={assertion:undefined,devEmail:`${f.username}@azdag.com`,username:f.username,credential:f.activationToken};
    const results=await Promise.allSettled([auth.login(input),auth.login(input)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
    const after=await state(f.userId);
    expect(after.activations.filter(a=>a.used_at!==null)).toHaveLength(1);
    expect(after.sessions).toHaveLength(1);
    expect(await auth.bindings.findByUser(f.userId)).toHaveLength(1);
  });
});
