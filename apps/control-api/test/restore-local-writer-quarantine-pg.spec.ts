/** Dedicated disposable cluster only; no runtime or source acceptance. */
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {quarantineLocalWriterForRestore} from "../src/execution-v2/restore-local-writer-quarantine-candidate";

const database=process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("TEST_ONLY pinned PostgreSQL writer quarantine",()=>{
  let admin:Pool,writer:Pool,other:Pool,writerName:string,otherName:string,otherDb:string;
  let pin:{system_identifier:string;database_name:string;operator_role:string;writer_role:string;writer_oid:string;maximum_sessions:number};
  const password="TEST_ONLY_LOCAL_QUARANTINE";
  beforeAll(async()=>{
    const url=new URL(database!);
    if(process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS"||
      !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(url.pathname))throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    admin=new Pool({connectionString:database,max:3,connectionTimeoutMillis:2000,query_timeout:10000});
    const suffix=randomBytes(6).toString("hex");writerName=`test_qwriter_${suffix}`;otherName=`test_qother_${suffix}`;
    otherDb=`test_qdb_${suffix}`;
    await admin.query(`CREATE ROLE ${writerName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS`);
    await admin.query(`CREATE ROLE ${otherName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS`);
    await admin.query(`CREATE DATABASE ${otherDb}`);
    await admin.query(`CREATE TABLE public.test_quarantine_${suffix}(id integer PRIMARY KEY)`);
    await admin.query(`GRANT INSERT ON public.test_quarantine_${suffix} TO ${writerName}`);
    const values=(await admin.query(`SELECT (pg_control_system()).system_identifier::text AS system_identifier,
      current_database() AS database_name,current_user AS operator_role,r.rolname AS writer_role,r.oid::text AS writer_oid
      FROM pg_roles r WHERE r.rolname=$1`,[writerName])).rows[0];
    pin={...values,maximum_sessions:4};
    const connect=(role:string,db?:string)=>{const u=new URL(database!);u.username=role;u.password=password;if(db)u.pathname=`/${db}`;
      const p=new Pool({connectionString:u.toString(),max:4,connectionTimeoutMillis:2000,query_timeout:10000});
      p.on("error",()=>undefined);return p;};
    writer=connect(writerName);other=connect(otherName);
  },30000);
  afterAll(async()=>{await writer?.end();await other?.end();await admin?.end();});

  it("refuses wrong pins, capacity overflow and cross-database use without changing login",async()=>{
    const active=await writer.connect();const url=new URL(database!);url.username=writerName;url.password=password;url.pathname=`/${otherDb}`;
    const elsewhere=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:10000});
    try {
      await expect(quarantineLocalWriterForRestore(admin,{...pin,writer_oid:"999999999"})).rejects.toThrow("V2_LOCAL_QUARANTINE_REFUSED");
      await expect(quarantineLocalWriterForRestore(admin,{...pin,system_identifier:"0"})).rejects.toThrow("V2_LOCAL_QUARANTINE_REFUSED");
      // NOLOGIN does not prevent another login from SET ROLE to the target.
      await admin.query(`GRANT ${writerName} TO ${otherName} WITH INHERIT FALSE`);
      try {await expect(quarantineLocalWriterForRestore(admin,pin)).rejects.toThrow("V2_LOCAL_QUARANTINE_REFUSED");}
      finally {await admin.query(`REVOKE ${writerName} FROM ${otherName}`);}
      await admin.query(`GRANT ${otherName} TO ${writerName} WITH INHERIT FALSE`);
      try {await expect(quarantineLocalWriterForRestore(admin,pin)).rejects.toThrow("V2_LOCAL_QUARANTINE_REFUSED");}
      finally {await admin.query(`REVOKE ${otherName} FROM ${writerName}`);}
      const second=await writer.connect();
      try {await expect(quarantineLocalWriterForRestore(admin,{...pin,maximum_sessions:1})).rejects.toThrow("V2_LOCAL_QUARANTINE_REFUSED");}
      finally {second.release();}
      await elsewhere.query("SELECT 1");
      await expect(quarantineLocalWriterForRestore(admin,pin)).rejects.toThrow("V2_LOCAL_QUARANTINE_REFUSED");
      expect((await admin.query("SELECT rolcanlogin FROM pg_roles WHERE oid=$1::oid",[pin.writer_oid])).rows[0].rolcanlogin).toBe(true);
      expect((await active.query("SELECT 1 AS n")).rows[0].n).toBe(1);
    } finally {active.release();await elsewhere.end();}
  },30000);

  it("refuses a real prepared transaction owned by a different role in the selected database",async()=>{
    const preparedId=`test_qprepared_${randomBytes(6).toString("hex")}`;
    const client=await other.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT 1");
      await client.query(`PREPARE TRANSACTION '${preparedId}'`);
      const row=(await admin.query("SELECT owner,database FROM pg_prepared_xacts WHERE gid=$1",[preparedId])).rows[0];
      expect(row).toMatchObject({owner:otherName,database:pin.database_name});
      await expect(quarantineLocalWriterForRestore(admin,pin)).rejects.toThrow("V2_LOCAL_QUARANTINE_REFUSED");
      expect((await admin.query("SELECT rolcanlogin FROM pg_roles WHERE oid=$1::oid",[pin.writer_oid])).rows[0].rolcanlogin).toBe(true);
    } finally {
      await admin.query(`ROLLBACK PREPARED '${preparedId}'`).catch(()=>{});
      client.release();
    }
  },30000);

  it("disables only the pinned login, terminates its old session and rolls back its transaction; replay remains local only",async()=>{
    const old=await writer.connect();old.on("error",()=>undefined);
    const table=(await admin.query<{table_name:string}>("SELECT tablename AS table_name FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'test_quarantine_%'" )).rows[0].table_name;
    await old.query("BEGIN");await old.query(`INSERT INTO public.${table} VALUES(42)`);
    const unaffected=await other.connect();
    try {
      const result=await quarantineLocalWriterForRestore(admin,pin);
      expect(result.state).toBe("LOCAL_QUARANTINE_NOT_CUTOVER");expect(result.terminated_sessions).toBeGreaterThanOrEqual(1);
      expect((await admin.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n).toBe(0);
      await expect(old.query("SELECT 1")).rejects.toThrow();
      expect((await unaffected.query("SELECT 1 AS n")).rows[0].n).toBe(1);
      const retryUrl=new URL(database!);retryUrl.username=writerName;retryUrl.password=password;
      const fresh=new Pool({connectionString:retryUrl.toString(),connectionTimeoutMillis:2000,query_timeout:10000});
      try {await expect(fresh.query("SELECT 1")).rejects.toThrow(/not permitted to log in/i);}
      finally {await fresh.end();}
      await expect(quarantineLocalWriterForRestore(admin,pin)).resolves.toMatchObject({state:"LOCAL_QUARANTINE_NOT_CUTOVER",terminated_sessions:0});
    } finally {old.release(true);unaffected.release();}
  },30000);
});
