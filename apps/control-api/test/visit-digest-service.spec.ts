import { describe, it, expect, vi } from "vitest";
import { VisitDigestService } from "../src/command-center/visit-digest.service";
import { VisitDigestStore } from "../src/command-center/visit-digest.store";
import { digestSnapshot, makeBaseline, type DigestBaseline } from "../src/command-center/visit-digest";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { coreExecutionRead } from "../src/execution/retained-read-profile";

const principal = { user: { userId: "user-a" }, workspaceId: "workspace-a", session: {} } as any;
const inputs = { workspaceId: "workspace-a", actor: principal.user, readAt: new Date("2026-10-23T00:00:00Z"),
  triageSources: [], todaySources: [], fleet: { status: { source: "EXECUTION", availability: "UNAVAILABLE", freshness_state: "UNKNOWN", reason: "SOURCE_DARK", as_of: null }, items: [] } } as any;
function fixture() {
  let baseline: DigestBaseline | null = null;
  const read = vi.fn(async () => baseline);
  const write = vi.fn(async (value: DigestBaseline) => { baseline = value; });
  const transaction = vi.fn(async (_u, _w, fn) => { const before = baseline; try { return await fn({ read, write }); } catch (e) { baseline = before; throw e; } });
  const repository = { readAuthorized: vi.fn(async (_p, _date, fn) => fn(inputs)) };
  const service = new VisitDigestService(repository as any, { read, transaction } as any, { FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT: "true" } as any);
  return { service, repository, read, write, transaction, baseline: () => baseline, set: (b: DigestBaseline) => { baseline = b; } };
}
describe("visit digest authorized baseline", () => {
  it("GET is read-only and keyed to actor/workspace", async () => {
    const f = fixture(); expect((await f.service.read(principal)).state).toBe("NO_BASELINE");
    expect(f.read).toHaveBeenCalledWith("user-a", "workspace-a"); expect(f.transaction).not.toHaveBeenCalled();
  });
  it("acknowledges current snapshot, retries without advancing seen time/version", async () => {
    const f = fixture(), read = await f.service.read(principal);
    const first = await f.service.seen(principal, read.mark_seen), retry = await f.service.seen(principal, read.mark_seen);
    expect(first.baseline?.version).toBe(1); expect(retry.baseline).toEqual(first.baseline); expect(f.write).toHaveBeenCalledTimes(1);
    expect(first.state).toBe("EMPTY");
  });
  it("rejects stale snapshot before any write", async () => {
    const f = fixture(); await expect(f.service.seen(principal, { snapshot_revision: "old", expected_baseline_version: 0 })).rejects.toMatchObject({ code: "VISIT_DIGEST_SNAPSHOT_CHANGED", status: 409 });
    expect(f.write).not.toHaveBeenCalled();
  });
  it("rejects stale baseline without clobbering another tab", async () => {
    const f = fixture(); f.set({ ...makeBaseline(digestSnapshot(inputs), 2, "2026-10-22T00:00:00Z"), snapshot_revision: "old" });
    await expect(f.service.seen(principal, { snapshot_revision: digestSnapshot(inputs).revision, expected_baseline_version: 0 })).rejects.toMatchObject({ code: "VISIT_DIGEST_BASELINE_CHANGED" });
    expect(f.write).not.toHaveBeenCalled(); expect(f.baseline()?.version).toBe(2);
  });
  it("refuses terminal version rather than returning a value outside the published contract",async()=>{
    const f=fixture();f.set({...makeBaseline(digestSnapshot(inputs),2147483646,inputs.readAt.toISOString()),snapshot_revision:'old'});
    await expect(f.service.seen(principal,{snapshot_revision:digestSnapshot(inputs).revision,expected_baseline_version:2147483646}))
      .rejects.toMatchObject({code:'VISIT_DIGEST_VERSION_LIMIT',status:503});
    expect(f.write).not.toHaveBeenCalled();
  });
  it("rolls back seen when final current-authority fence rejects", async () => {
    const f = fixture(); f.repository.readAuthorized.mockImplementationOnce(async (_p, _date, fn) => { await fn(inputs); throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409); });
    await expect(f.service.seen(principal, { snapshot_revision: digestSnapshot(inputs).revision, expected_baseline_version: 0 })).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(f.baseline()).toBeNull();
  });
});
describe("visit digest store transaction", () => {
  it("does not acquire a transaction client from a one-connection Core profile",async()=>{
    const connect=vi.fn();const store=new VisitDigestStore({options:{max:1},connect} as any);
    await expect(store.transaction('u','w',async()=>1)).rejects.toMatchObject({code:'VISIT_DIGEST_BUSY'});
    expect(connect).not.toHaveBeenCalled();
  });
  it("keeps retained GET in Core workspace and refuses seen without touching the store",async()=>{
    expect(coreExecutionRead('/api/v1/execution/visit-digest')).toBe(true);
    const store={read:vi.fn(async()=>null),transaction:vi.fn()};
    const repo={readAuthorized:vi.fn(async(_p,_date,fn)=>fn(inputs))};
    const service=new VisitDigestService(repo as any,store as any,{FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT:'true',EXECUTION_READ_PROFILE:'retained_review_v1'} as any);
    const read=await service.read(principal);expect(read.may_mark_seen).toBe(false);expect(read.mark_seen_reason).toBe('READ_ONLY_PROFILE');
    await expect(service.seen(principal,read.mark_seen)).rejects.toMatchObject({status:403});expect(store.transaction).not.toHaveBeenCalled();
  });
  it("holds per-user workspace lock and commits only after caller's final fence", async () => {
    const query = vi.fn(async (...args: any[]) => ({ rows: String(args[0]).includes("pg_try_advisory") ? [{locked:true}] : [] })), release = vi.fn();
    const store = new VisitDigestStore({ connect: async () => ({ query, release }) } as any);
    await store.transaction("u", "w", async tx => { await tx.read(); await tx.write(makeBaseline(digestSnapshot(inputs), 1, inputs.readAt.toISOString())); expect(query.mock.calls.some(c => c[0] === "COMMIT")).toBe(false); });
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT"); expect(release).toHaveBeenCalledOnce();
    expect(query.mock.calls[2][1]).toEqual([JSON.stringify(["visit-digest", "u", "w"])]);
  });
  it("rolls back and releases connection on final failure", async () => {
    const query = vi.fn(async (...args: any[]) => ({ rows: String(args[0]).includes("pg_try_advisory") ? [{locked:true}] : [] })), release = vi.fn();
    const store = new VisitDigestStore({ connect: async () => ({ query, release }) } as any);
    await expect(store.transaction("u", "w", async () => { throw new Error("revoked"); })).rejects.toThrow("revoked");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK"); expect(release).toHaveBeenCalledOnce();
  });
  it("rejects contention without waiting and releases admission after connect failure", async () => {
    const query = vi.fn(async (..._args: any[]) => ({ rows: [{locked:false}] })), release = vi.fn();
    const connect = vi.fn(async () => ({ query, release }));
    const store = new VisitDigestStore({ connect } as any);
    await expect(store.transaction("u","w", async () => 1)).rejects.toMatchObject({code:"VISIT_DIGEST_BUSY"});
    expect(release).toHaveBeenCalledOnce();
    connect.mockRejectedValueOnce(new Error("connect failed"));
    await expect(store.transaction("u","w",async () => 1)).rejects.toThrow("connect failed");
    await expect(store.transaction("u","w",async () => 1)).rejects.toMatchObject({code:"VISIT_DIGEST_BUSY"});
    expect(connect).toHaveBeenCalledTimes(3);
  });
  it("bounds simultaneous transactions before acquiring a pool connection", async () => {
    const query = vi.fn(async (...args:any[]) => ({rows:String(args[0]).includes("pg_try_advisory")?[{locked:true}]:[]}));
    const connect = vi.fn(async () => ({query,release:vi.fn()}));
    const store = new VisitDigestStore({connect} as any);
    let unblock!:()=>void; const barrier=new Promise<void>(resolve => {unblock=resolve;});
    const first=store.transaction("a","w",async()=>barrier), second=store.transaction("b","w",async()=>barrier);
    await expect(store.transaction("c","w",async()=>1)).rejects.toMatchObject({code:"VISIT_DIGEST_BUSY"});
    expect(connect).toHaveBeenCalledTimes(2); unblock(); await Promise.all([first,second]);
    await store.transaction("c","w",async()=>1); expect(connect).toHaveBeenCalledTimes(3);
  });
});
