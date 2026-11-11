/** TEST_ONLY disposable cluster; never point this at any real database. */
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {quarantineLocalDatabaseForRestore} from "../src/execution-v2/restore-local-database-quarantine-candidate";

const sourceUrl=process.env.TEST_DATABASE_URL;
describe.skipIf(!sourceUrl)("TEST_ONLY exact database quarantine",()=>{
  let admin:Pool,application:Pool,pin:{system_identifier:string;operator_database:string;operator_role:string;
    target_database:string;target_oid:string;maximum_sessions:number};
  let role:string,table:string;const password="TEST_ONLY_DATABASE_QUARANTINE";
  beforeAll(async()=>{
    const url=new URL(sourceUrl!);
    if(process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS"||
      !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(url.pathname))throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    const target=url.pathname.slice(1);url.pathname="/postgres";
    admin=new Pool({connectionString:url.toString(),max:3,connectionTimeoutMillis:2000,query_timeout:10000});
    const suffix=randomBytes(6).toString("hex");role=`test_dbq_${suffix}`;table=`test_dbq_${suffix}`;
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS`);
    const testDb=new Pool({connectionString:sourceUrl,max:1,connectionTimeoutMillis:2000,query_timeout:10000});
    try {await testDb.query(`CREATE TABLE public.${table}(id integer PRIMARY KEY); GRANT INSERT ON public.${table} TO ${role}`);}
    finally {await testDb.end();}
    const details=(await admin.query(`SELECT (pg_control_system()).system_identifier::text AS system_identifier,
      current_database() AS operator_database,current_user AS operator_role,d.datname AS target_database,d.oid::text AS target_oid
      FROM pg_database d WHERE d.datname=$1`,[target])).rows[0];
    pin={...details,maximum_sessions:4};
    const userUrl=new URL(sourceUrl!);userUrl.username=role;userUrl.password=password;
    application=new Pool({connectionString:userUrl.toString(),max:4,connectionTimeoutMillis:2000,query_timeout:10000});
    application.on("error",()=>undefined);
  },30000);
  afterAll(async()=>{
    await application?.end();
    // Cleanup operates solely on the name validated from the disposable cell.
    if(admin&&pin)await admin.query(`ALTER DATABASE "${pin.target_database}" ALLOW_CONNECTIONS true`);
    await admin?.end();
  });
  it("refuses wrong pins, unbounded sessions and prepared work before disabling access",async()=>{
    await expect(quarantineLocalDatabaseForRestore(admin,{...pin,target_oid:"999999999"})).rejects.toThrow("V2_LOCAL_DATABASE_QUARANTINE_REFUSED");
    await expect(quarantineLocalDatabaseForRestore(admin,{...pin,system_identifier:"1"})).rejects.toThrow("V2_LOCAL_DATABASE_QUARANTINE_REFUSED");
    await expect(quarantineLocalDatabaseForRestore(admin,{...pin,target_database:pin.operator_database})).rejects.toThrow("V2_LOCAL_DATABASE_QUARANTINE_REFUSED");
    await admin.query(`ALTER DATABASE "${pin.target_database}" OWNER TO ${role}`);
    try {await expect(quarantineLocalDatabaseForRestore(admin,pin)).rejects.toThrow("V2_LOCAL_DATABASE_QUARANTINE_REFUSED");}
    finally {await admin.query(`ALTER DATABASE "${pin.target_database}" OWNER TO "${pin.operator_role}"`);}
    const a=await application.connect(),b=await application.connect();
    try {await expect(quarantineLocalDatabaseForRestore(admin,{...pin,maximum_sessions:1})).rejects.toThrow("V2_LOCAL_DATABASE_QUARANTINE_REFUSED");}
    finally {a.release();b.release();}
    const client=await application.connect(),gid=`test_dbq_${randomBytes(6).toString("hex")}`;
    try {
      await client.query("BEGIN");await client.query(`INSERT INTO public.${table} VALUES(1)`);
      await client.query(`PREPARE TRANSACTION '${gid}'`);
      await expect(quarantineLocalDatabaseForRestore(admin,pin)).rejects.toThrow("V2_LOCAL_DATABASE_QUARANTINE_REFUSED");
      expect((await admin.query("SELECT datallowconn FROM pg_database WHERE oid=$1::oid",[pin.target_oid])).rows[0].datallowconn).toBe(true);
    } finally {await client.query(`ROLLBACK PREPARED '${gid}'`).catch(()=>{});client.release();}
  },30000);
  it("drains all target sessions without touching the operator DB, and retries with the same pin",async()=>{
    const old=await application.connect();old.on("error",()=>undefined);
    await old.query("BEGIN");await old.query(`INSERT INTO public.${table} VALUES(42)`);
    try {
      // Server really applies ALTER before the caller loses its response. The
      // target must remain closed and a same-pin retry drains that original.
      let inject=true;
      const lost={options:admin.options,connect:async()=>{
        const db=await admin.connect();
        return new Proxy(db,{get(target,property){
          if(property==="query")return async(...args:unknown[])=>{
            const result=await Reflect.apply(target.query,target,args) as unknown;
            if(inject&&typeof args[0]==="string"&&args[0].startsWith("ALTER DATABASE ")){
              inject=false;throw new Error("TEST_ONLY_ALTER_RESPONSE_LOST");
            }
            return result;
          };
          const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
        }});
      }} as unknown as Pool;
      await expect(quarantineLocalDatabaseForRestore(lost,pin)).rejects.toThrow("TEST_ONLY_ALTER_RESPONSE_LOST");
      expect((await admin.query("SELECT datallowconn FROM pg_database WHERE oid=$1::oid",[pin.target_oid])).rows[0].datallowconn).toBe(false);
      expect((await old.query("SELECT 1 AS n")).rows[0].n).toBe(1);
      const result=await quarantineLocalDatabaseForRestore(admin,pin);
      expect(result.state).toBe("LOCAL_DATABASE_QUARANTINE_NOT_CUTOVER");expect(result.terminated_sessions).toBeGreaterThanOrEqual(1);
      await expect(old.query("SELECT 1")).rejects.toThrow();
      expect((await admin.query("SELECT 1 AS n")).rows[0].n).toBe(1);
      const retry=new Pool({connectionString:sourceUrl,connectionTimeoutMillis:2000,query_timeout:10000});
      try {await expect(retry.query("SELECT 1")).rejects.toThrow(/not currently accepting connections/i);}
      finally {await retry.end();}
      await expect(quarantineLocalDatabaseForRestore(admin,pin)).resolves.toMatchObject({state:"LOCAL_DATABASE_QUARANTINE_NOT_CUTOVER",terminated_sessions:0});
      // Explicit test-only reopen; the candidate itself never re-enables.
      await admin.query(`ALTER DATABASE "${pin.target_database}" ALLOW_CONNECTIONS true`);
      const reopened=new Pool({connectionString:sourceUrl,connectionTimeoutMillis:2000,query_timeout:10000});
      try {expect((await reopened.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n).toBe(0);}
      finally {await reopened.end();}
    } finally {old.release(true);}
  },30000);
});
