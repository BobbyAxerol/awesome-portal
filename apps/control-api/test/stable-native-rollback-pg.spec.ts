/** TEST_ONLY / NOT_RUN.
 * Run only on the disposable native-core-read-db/native_core_read_test target.
 * ACK faults are injected at the pg query-result boundary AFTER real PostgreSQL
 * executes ROLLBACK/COMMIT; a separate case actually terminates the victim
 * PostgreSQL backend. These are not production/network-failure acceptance.
 * No authority state is installed, settled, replayed or inferred by this spec.
 */
import { Pool, type PoolClient, type QueryResult } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withTransaction } from "../src/db/pool";

const database=process.env.TEST_DATABASE_URL;
const enabled=process.env.EPG10_08_NATIVE_READ_TEST_ONLY==="1" && Boolean(database);
type QueryPort={query:(text:string,values?:unknown[])=>Promise<QueryResult>};
type ConnectPort={connect:()=>Promise<PoolClient>};
describe.skipIf(!enabled)("TEST_ONLY actual PG stable transaction rollback custody",()=>{
  let pool:Pool, created=false;
  function guardedUrl():string{
    if(!database || process.env.EPG10_08_NATIVE_READ_TEST_ONLY!=="1")
      throw new Error("TEST_ONLY_NATIVE_DATABASE_REQUIRED");
    const url=new URL(database);
    if(!["postgres:","postgresql:"].includes(url.protocol) ||
       url.hostname!=="native-core-read-db" || url.pathname!=="/native_core_read_test")
      throw new Error("TEST_ONLY_NATIVE_DATABASE_TARGET_REFUSED");
    return database;
  }
  beforeAll(async()=>{
    pool=new Pool({connectionString:guardedUrl(),max:3,connectionTimeoutMillis:2000,
      statement_timeout:3000,query_timeout:5000,idle_in_transaction_session_timeout:6000});
    pool.on("error",()=>{});
    const identity=(await pool.query("SELECT current_database() name")).rows[0];
    if(identity.name!=="native_core_read_test")throw new Error("TEST_ONLY_NATIVE_DATABASE_TARGET_REFUSED");
    await pool.query("CREATE TABLE public.test_only_stable_native_rollback (id text PRIMARY KEY)");
    created=true;
  });
  afterEach(()=>{vi.restoreAllMocks();});
  afterAll(async()=>{
    if(pool){if(created)await pool.query("DROP TABLE public.test_only_stable_native_rollback");await pool.end();}
  });
  async function prepare(){
    const client=await pool.connect(), keeper=await pool.connect();
    client.on("error",()=>{});
    const pid=Number((await client.query("SELECT pg_backend_pid() pid")).rows[0].pid);
    const keeperPid=Number((await keeper.query("SELECT pg_backend_pid() pid")).rows[0].pid);
    return {client,keeper,pid,keeperPid};
  }
  function routeOnce(client:PoolClient){
    vi.spyOn(pool as unknown as ConnectPort,"connect").mockImplementationOnce(async()=>client);
  }
  async function rows(id:string):Promise<number>{
    return Number((await pool.query("SELECT count(*) n FROM public.test_only_stable_native_rollback WHERE id=$1",[id])).rows[0].n);
  }
  async function assertKeeper(keeper:PoolClient,pid:number){
    expect(Number((await keeper.query("SELECT pg_backend_pid() pid")).rows[0].pid)).toBe(pid);
  }
  it("physical ROLLBACK followed by lost ACK discards the victim, preserves original error and keeps another borrower",async()=>{
    const f=await prepare(), original=new Error("TEST_ONLY_BODY_FAILURE"), lost=new Error("TEST_ONLY_ROLLBACK_ACK_LOST");
    const query=f.client.query.bind(f.client) as QueryPort["query"], release=vi.spyOn(f.client,"release");
    let handed=false;
    try{
      vi.spyOn(f.client as unknown as QueryPort,"query").mockImplementation(async(text,values)=>{
        const result=await query(text,values);
        if(text==="ROLLBACK")throw lost;
        return result;
      });
      routeOnce(f.client);handed=true;
      await expect(withTransaction(pool,async db=>{
        await db.query("INSERT INTO public.test_only_stable_native_rollback(id) VALUES($1)",["TEST_ONLY-rollback-ack"]);
        throw original;
      })).rejects.toBe(original);
      expect(release).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledWith(true);
      vi.restoreAllMocks();
      await assertKeeper(f.keeper,f.keeperPid);expect(await rows("TEST_ONLY-rollback-ack")).toBe(0);
      const replacement=await pool.connect();
      try{expect(Number((await replacement.query("SELECT pg_backend_pid() pid")).rows[0].pid)).not.toBe(f.pid);}
      finally{replacement.release();}
    }finally{if(!handed)f.client.release(true);f.keeper.release();}
  });
  it("failed ROLLBACK before execution destroys the open transaction instead of returning it to the pool",async()=>{
    const f=await prepare(), original=new Error("TEST_ONLY_BODY_FAILURE");
    const query=f.client.query.bind(f.client) as QueryPort["query"], release=vi.spyOn(f.client,"release");
    let handed=false;
    try{
      vi.spyOn(f.client as unknown as QueryPort,"query").mockImplementation(async(text,values)=>{
        if(text==="ROLLBACK")throw new Error("TEST_ONLY_ROLLBACK_NOT_ACKNOWLEDGED");
        return query(text,values);
      });
      routeOnce(f.client);handed=true;
      await expect(withTransaction(pool,async db=>{
        await db.query("INSERT INTO public.test_only_stable_native_rollback(id) VALUES($1)",["TEST_ONLY-unexecuted-rollback"]);
        throw original;
      })).rejects.toBe(original);
      expect(release).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledWith(true);
      vi.restoreAllMocks();
      await assertKeeper(f.keeper,f.keeperPid);expect(await rows("TEST_ONLY-unexecuted-rollback")).toBe(0);
      const replacement=await pool.connect();
      try{
        expect(Number((await replacement.query("SELECT pg_backend_pid() pid")).rows[0].pid)).not.toBe(f.pid);
        expect((await replacement.query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe("off");
        expect((await replacement.query("SELECT 1 ready")).rows[0].ready).toBe(1);
      }finally{replacement.release();}
    }finally{if(!handed)f.client.release(true);f.keeper.release();}
  });
  it("actual backend termination makes rollback fail without replacing the callback failure or flushing a healthy borrower",async()=>{
    const f=await prepare(), original=new Error("TEST_ONLY_BODY_FAILURE"), release=vi.spyOn(f.client,"release");
    let handed=false;
    try{
      routeOnce(f.client);handed=true;
      await expect(withTransaction(pool,async db=>{
        await db.query("INSERT INTO public.test_only_stable_native_rollback(id) VALUES($1)",["TEST_ONLY-terminated"]);
        expect((await f.keeper.query("SELECT pg_terminate_backend($1) terminated",[f.pid])).rows[0].terminated).toBe(true);
        throw original;
      })).rejects.toBe(original);
      expect(release).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledWith(true);
      vi.restoreAllMocks();
      await assertKeeper(f.keeper,f.keeperPid);expect(await rows("TEST_ONLY-terminated")).toBe(0);
    }finally{if(!handed)f.client.release(true);f.keeper.release();}
  });
  it("physical COMMIT followed by lost ACK remains the original ambiguous failure, with no retry or fabricated rollback absence",async()=>{
    const f=await prepare(), original=new Error("TEST_ONLY_COMMIT_ACK_LOST");
    const query=f.client.query.bind(f.client) as QueryPort["query"], release=vi.spyOn(f.client,"release");
    const body=vi.fn(async(db:PoolClient)=>{
      await db.query("INSERT INTO public.test_only_stable_native_rollback(id) VALUES($1)",["TEST_ONLY-commit-ack"]);
      return 1;
    });
    let handed=false;
    try{
      vi.spyOn(f.client as unknown as QueryPort,"query").mockImplementation(async(text,values)=>{
        const result=await query(text,values);
        if(text==="COMMIT")throw original;
        return result;
      });
      routeOnce(f.client);handed=true;
      await expect(withTransaction(pool,body)).rejects.toBe(original);
      expect(body).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledWith();
      vi.restoreAllMocks();
      await assertKeeper(f.keeper,f.keeperPid);expect(await rows("TEST_ONLY-commit-ack")).toBe(1);
      // Actual committed rows are NOT proof that an authority terminal was
      // acknowledged. This helper must not settle/retry any native obligation.
    }finally{if(!handed)f.client.release(true);f.keeper.release();}
  });
});
