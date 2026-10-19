/** Explicit offline installer only: real fresh disposable PostgreSQL and
 * TEST_ONLY existing identities. No source grant, session issuance, listener,
 * Research runtime installation or financial/calibration qualification. */
import {randomUUID} from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from "vitest";
import {
  installResearchCurrentHumanSchema,
  assertRegisteredResearchCurrentHumanSchema,
  CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256,
  CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION,
  type NativeCoreSchemaTarget,
} from "../src/execution-v2/current-human-schema";
import {migrateTestDatabase} from "./harness";

const sourcePath=join(__dirname,"../src/execution-v2/current-human-candidate.sql");
const sqlSha="826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728";
const dependencies=["auth_sessions","execution_retained_review_access","external_identity_bindings",
  "portal_access_grants_v2","portal_access_policy_events","portal_access_policy_state","portal_capability_grants",
  "portal_owner_anchor","portal_users","workspace_members","workspaces"];

describe("Research current-human schema input validation, no PostgreSQL",()=>{
  it("rejects changed frozen SQL before requesting a connection",async()=>{
    const directory=await mkdtemp(join(tmpdir(),"TEST_ONLY-current-human-schema-"));
    const altered=join(directory,"current-human-candidate.sql");
    const pool=new Pool({host:"127.0.0.1",port:1,max:1,connectionTimeoutMillis:20});
    const connect=vi.spyOn(pool,"connect");
    try{
      await writeFile(altered,(await readFile(sourcePath,"utf8"))+"\n-- TEST_ONLY changed registry input\n",{mode:0o600});
      const target:NativeCoreSchemaTarget={database_name:"TEST_ONLY",database_system_identifier:"1",
        role_name:"TEST_ONLY",protected_owner_user_id:"TEST_ONLY-owner",workspace_id:"TEST_ONLY-workspace",
        principal_workspace_pins:[{user_id:"TEST_ONLY-owner",workspace_id:"TEST_ONLY-workspace"}]};
      await expect(installResearchCurrentHumanSchema(pool,target,altered))
        .rejects.toThrow("CURRENT_HUMAN_SCHEMA_INPUT_CHANGED");
      expect(connect).not.toHaveBeenCalled();
      expect(CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256).toBe(sqlSha);
    }finally{
      connect.mockRestore();
      await pool.end();
      await rm(directory,{recursive:true,force:true});
    }
  });
});

const configuredDatabase=process.env.TEST_DATABASE_URL;
describe.skipIf(!configuredDatabase)("Research current-human schema registered offline installer, disposable PostgreSQL",()=>{
  const databaseName=`elp210_schema_${randomUUID().replaceAll("-","")}`;
  const ownerId=`TEST_ONLY-schema-owner-${randomUUID()}`;
  const workspaceId=`TEST_ONLY-schema-workspace-${randomUUID()}`;
  const sessionId=`TEST_ONLY-schema-session-${randomUUID()}`;
  let pool:Pool;
  let created=false;
  let target:NativeCoreSchemaTarget;
  const databaseUrl=(database:string)=>{
    const value=new URL(configuredDatabase!);
    value.pathname=`/${database}`;
    return value.toString();
  };
  const install=()=>installResearchCurrentHumanSchema(pool,target,sourcePath);
  const installedObjects=async()=>{
    const result=await pool.query(`SELECT to_regnamespace('elp210_candidate')::text AS schema,
      to_regclass('public.portal_native_review_schema')::text AS ledger,
      (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
       AND t.tgname IN('elp210_authority_guard','elp210_no_truncate')) AS public_guards`);
    return result.rows[0];
  };
  const identitySnapshot=async()=>{
    // Exact fresh TEST_ONLY database. Compare values, not counts alone: schema
    // installation must not reset an account/session or seed a policy/grant.
    const relations=["portal_users","auth_sessions","external_identity_bindings","password_credentials",
      "activation_credentials","workspaces","workspace_members","portal_owner_anchor",
      "portal_access_policy_state","portal_access_grants_v2","portal_access_policy_events"];
    const snapshots:Record<string,unknown>={};
    for(const relation of relations){
      snapshots[relation]=(await pool.query(`SELECT to_jsonb(r) AS row FROM public.${relation} r ORDER BY to_jsonb(r)::text COLLATE "C"`))
        .rows.map(row=>row.row);
    }
    return snapshots;
  };

  beforeAll(async()=>{
    const admin=new Pool({connectionString:databaseUrl("postgres"),max:1,connectionTimeoutMillis:2000});
    try{
      if(!/^elp210_schema_[a-f0-9]{32}$/.test(databaseName))throw new Error("TEST_ONLY_DATABASE_NAME_INVALID");
      await admin.query(`CREATE DATABASE ${databaseName}`);
      created=true;
    }finally{await admin.end();}
    await migrateTestDatabase(databaseUrl(databaseName));
    pool=new Pool({connectionString:databaseUrl(databaseName),max:2,connectionTimeoutMillis:2000,query_timeout:20000});
    // The protected anchor, not ADMIN/username inference, identifies this owner.
    // Existing credentials are synthetic inert test data, never issued tokens.
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY existing owner','USER','ACTIVE',false,7)`,[ownerId]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at)
      VALUES($1,$1,$2,'ACTIVE','TEST_ONLY_NOT_CREDENTIAL',7,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,
    [sessionId,ownerId]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY existing workspace',$2)",[workspaceId,ownerId]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[workspaceId,ownerId]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id,claimed_by) VALUES('PORTAL_OWNER',$1,'TEST_ONLY schema installer fixture')",[ownerId]);
    const observed=(await pool.query(`SELECT current_database() AS database_name,current_user AS role_name,
      (pg_control_system()).system_identifier::text AS database_system_identifier`)).rows[0];
    target={database_name:observed.database_name,database_system_identifier:observed.database_system_identifier,
      role_name:observed.role_name,protected_owner_user_id:ownerId,workspace_id:workspaceId,
      principal_workspace_pins:[{user_id:ownerId,workspace_id:workspaceId}]};
  },120000);

  afterEach(async()=>{
    if(!pool)return;
    // Only this test suite's newly CREATED disposable database. Drop the
    // installer-owned ledger first, then its custody schema/dependent guards;
    // never clear or truncate the public identity tables or a shared preview.
    await pool.query("DROP TABLE IF EXISTS public.portal_native_review_schema");
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
  });
  afterAll(async()=>{
    await pool?.end();
    if(!created)return;
    const admin=new Pool({connectionString:databaseUrl("postgres"),max:1,connectionTimeoutMillis:2000});
    try{
      if(!/^elp210_schema_[a-f0-9]{32}$/.test(databaseName))throw new Error("TEST_ONLY_DATABASE_NAME_INVALID");
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    }finally{await admin.end();}
  },60000);

  it("installs the complete frozen schema and all public guards without changing users, sessions or access facts",async()=>{
    const before=await identitySnapshot();
    expect(await installedObjects()).toEqual({schema:null,ledger:null,public_guards:0});
    const result=await install();
    expect(result).toEqual({schema_version:CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION,
      schema_sha256:sqlSha,catalogue_sha256:expect.stringMatching(/^[a-f0-9]{64}$/),installed:true});
    expect(await installedObjects()).toEqual({schema:"elp210_candidate",ledger:"portal_native_review_schema",public_guards:22});
    const guarded=(await pool.query(`SELECT c.relname,count(*)::int AS count,bool_and(t.tgenabled<>'D') AS enabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname IN('elp210_authority_guard','elp210_no_truncate')
      GROUP BY c.relname ORDER BY c.relname COLLATE "C"`)).rows;
    expect(guarded).toEqual(dependencies.map(relname=>({relname,count:2,enabled:true})));
    expect((await pool.query("SELECT revision,lease_epoch,drain_id FROM elp210_candidate.authority WHERE singleton")).rows)
      .toEqual([{revision:"0",lease_epoch:"0",drain_id:null}]);
    expect(await identitySnapshot()).toEqual(before);
  });

  it("returns an exact restart ACK without resetting authority history or changing the catalogue seal",async()=>{
    const before=await identitySnapshot();
    const first=await install();
    await pool.query("UPDATE elp210_candidate.authority SET revision=9,lease_epoch=12 WHERE singleton");
    const second=await install();
    expect(second).toEqual({...first,installed:false});
    expect((await pool.query("SELECT revision,lease_epoch FROM elp210_candidate.authority WHERE singleton")).rows)
      .toEqual([{revision:"9",lease_epoch:"12"}]);
    expect((await pool.query("SELECT count(*)::int AS count FROM public.portal_native_review_schema")).rows[0].count).toBe(1);
    expect(await identitySnapshot()).toEqual(before);
  });

  it("read-only startup inspection refuses an absent installation without creating authority or schema",async()=>{
    const before=await identitySnapshot();
    await expect(assertRegisteredResearchCurrentHumanSchema(pool,target,sourcePath))
      .rejects.toThrow("CURRENT_HUMAN_SCHEMA_UNREGISTERED");
    expect(await installedObjects()).toEqual({schema:null,ledger:null,public_guards:0});
    expect(await identitySnapshot()).toEqual(before);
  });

  it("read-only startup inspection verifies the registered installation without changing identity, custody or ledger rows",async()=>{
    const installed=await install();
    const beforeIdentity=await identitySnapshot();
    const beforeAuthority=(await pool.query("SELECT * FROM elp210_candidate.authority ORDER BY singleton")).rows;
    const beforeLedger=(await pool.query("SELECT * FROM public.portal_native_review_schema ORDER BY version")).rows;
    expect(await assertRegisteredResearchCurrentHumanSchema(pool,target,sourcePath)).toEqual({...installed,installed:false});
    expect(await identitySnapshot()).toEqual(beforeIdentity);
    expect((await pool.query("SELECT * FROM elp210_candidate.authority ORDER BY singleton")).rows).toEqual(beforeAuthority);
    expect((await pool.query("SELECT * FROM public.portal_native_review_schema ORDER BY version")).rows).toEqual(beforeLedger);
    expect((await pool.query("SELECT count(*)::int AS count FROM elp210_candidate.mutations")).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM elp210_candidate.obligations")).rows[0].count).toBe(0);
  });

  it.each(["database_name","database_system_identifier","role_name","protected_owner_user_id","workspace_id"] as const)
  ("refuses a mismatched %s before creating schema, ledger or identity guards",async field=>{
    const before=await identitySnapshot();
    const wrong={...target,[field]:field==="database_system_identifier"?"0":`TEST_ONLY-wrong-${field}`};
    await expect(installResearchCurrentHumanSchema(pool,wrong,sourcePath))
      .rejects.toThrow("CURRENT_HUMAN_SCHEMA_TARGET_MISMATCH");
    expect(await installedObjects()).toEqual({schema:null,ledger:null,public_guards:0});
    expect(await identitySnapshot()).toEqual(before);
  });

  it("requires the existing exact principal workspace membership, not a copied owner target",async()=>{
    const wrong={...target,principal_workspace_pins:[{user_id:"TEST_ONLY-not-a-member",workspace_id:workspaceId}]};
    await expect(installResearchCurrentHumanSchema(pool,wrong,sourcePath))
      .rejects.toThrow("CURRENT_HUMAN_SCHEMA_TARGET_MISMATCH");
    expect(await installedObjects()).toEqual({schema:null,ledger:null,public_guards:0});
  });

  it("refuses a missing dependency before any schema or ledger write",async()=>{
    const before=await identitySnapshot();
    await pool.query("ALTER TABLE public.execution_retained_review_access RENAME TO test_only_hidden_retained_review_access");
    try{
      await expect(install()).rejects.toThrow("CURRENT_HUMAN_SCHEMA_DEPENDENCY_MISSING");
      expect(await installedObjects()).toEqual({schema:null,ledger:null,public_guards:0});
      expect(await identitySnapshot()).toEqual(before);
    }finally{
      await pool.query("ALTER TABLE public.test_only_hidden_retained_review_access RENAME TO execution_retained_review_access");
    }
  });

  it("does not adopt or replace an existing unregistered partial schema",async()=>{
    const before=await identitySnapshot();
    await pool.query("CREATE SCHEMA elp210_candidate; CREATE TABLE elp210_candidate.test_only_preserved(value text); INSERT INTO elp210_candidate.test_only_preserved VALUES('TEST_ONLY retained')");
    await expect(install()).rejects.toThrow("CURRENT_HUMAN_SCHEMA_UNREGISTERED");
    expect(await installedObjects()).toEqual({schema:"elp210_candidate",ledger:null,public_guards:0});
    expect((await pool.query("SELECT value FROM elp210_candidate.test_only_preserved")).rows)
      .toEqual([{value:"TEST_ONLY retained"}]);
    expect(await identitySnapshot()).toEqual(before);
  });

  it.each(["missing_guard","disabled_guard","missing_function","ledger_guard","function_acl"] as const)
  ("refuses %s despite an otherwise matching immutable install ledger",async corruption=>{
    await install();
    const before=await identitySnapshot();
    if(corruption==="missing_guard")await pool.query("DROP TRIGGER elp210_authority_guard ON public.auth_sessions");
    else if(corruption==="disabled_guard")await pool.query("ALTER TABLE public.auth_sessions DISABLE TRIGGER elp210_authority_guard");
    else if(corruption==="missing_function")await pool.query("DROP FUNCTION elp210_candidate.immutable() CASCADE");
    else if(corruption==="ledger_guard")await pool.query("ALTER TABLE public.portal_native_review_schema DISABLE TRIGGER preserve_native_schema_ledger");
    else await pool.query("GRANT EXECUTE ON FUNCTION elp210_candidate.immutable() TO PUBLIC");
    await expect(install()).rejects.toThrow("CURRENT_HUMAN_SCHEMA_DRIFT");
    expect((await pool.query("SELECT count(*)::int AS count FROM public.portal_native_review_schema")).rows[0].count).toBe(1);
    expect(await identitySnapshot()).toEqual(before);
  });
});
