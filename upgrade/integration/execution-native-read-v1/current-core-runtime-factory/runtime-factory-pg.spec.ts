/** TEST_ONLY genuine filesystem -> loader -> composition -> AppModule factory.
 * Disposable PG only. Exact 39 stable migrations + reviewed native additions;
 * no broad harness migration, production rows, PM authority or real session.
 * An inert genuine factory is NOT connected read/stream qualification. */
import {createHash,generateKeyPairSync} from "node:crypto";
import {chmod,mkdtemp,readFile,readdir,rm,symlink,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {Pool} from "pg";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {prepareNativeCoreRuntime} from "../src/execution-v2/native-core-runtime";
import {nativeCoreManagerReadConsumer} from "../src/execution-v2/native-core-composition";
import {NativeManagerReadConsumer} from "../src/execution-v2/native-manager-consumer";
import {CoreNativeInstallation,type CoreNativeInstallationInput} from "../src/execution-v2/core-native-installation";
import {accessDigest} from "../src/execution-v2/access-digest";
import {buildPool} from "../src/db/pool";
import {createControlApiApp} from "../src/app";
import {AppModule} from "../src/app.module";
import {AuthService} from "../src/auth/auth.service";
import {ExecutionAccessService} from "../src/execution-v2/access.service";
import {MaximumDataOperationService} from "../src/execution/maximum-data-operation.service";
import {NATIVE_MANAGER_REALTIME_COORDINATOR} from "../src/execution/profile-realtime.service";
import {testConfig} from "./harness";
import {commonName,testCertificate} from "./fixtures/elp210-test-certificates";

const hash=(v:string|Buffer)=>createHash("sha256").update(v).digest("hex"),raw=(c:string)=>c.repeat(64);
const database=process.env.TEST_DATABASE_URL;
const person="TEST_ONLY-factory-owner",workspace="TEST_ONLY-factory-workspace";
const poolProfile={max:4,connectionTimeoutMillis:2000,statement_timeout:3000,query_timeout:6000,
  idle_in_transaction_session_timeout:3000};
// Non-secret release metadata; must match independently captured actual ledger.
const ledgerSha=process.env.EPG10_08_STABLE_LEDGER_SHA256;

describe("TEST_ONLY genuine runtime factory on stable39",()=>{
  let pool:Pool,temporary:string,system:string,names:string[],installation:CoreNativeInstallation;
  let keyRef:{path:string;sha256:string},caRef:typeof keyRef,certRef:typeof keyRef,tlsKeyRef:typeof keyRef;
  let baseline:string,serial=0;
  async function pin(name:string,bytes:string|Buffer,mode=0o400){
    const path=join(temporary,name);await writeFile(path,bytes,{mode,flag:"wx"});
    return{path,sha256:hash(bytes)};
  }
  async function authorityDigest(){
    const tables=["portal_users","auth_sessions","external_identity_bindings","workspaces","workspace_members",
      "portal_owner_anchor","portal_capability_grants","pgmigrations"];
    const rows:Record<string,unknown>={};
    for(const table of tables)rows[table]=(await pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) value FROM public.${table} t`)).rows[0].value;
    return accessDigest(rows);
  }
  function config(){
    const now=Date.now(),until=now+300000,issuer="TEST_ONLY-factory-human",workload="TEST_ONLY-factory-workload";
    const domain={profile_id:"TEST_ONLY-profile",catalogue_sha256:raw("a"),profile_sha256:raw("b"),field_policy_sha256:raw("c")};
    return{schema_version:"portal.native-core-runtime.v1",pool_profile:poolProfile,
      realtime_limits:{maximumClients:2,maximumEntriesPerClient:4,maximumFrameBytes:32768,
        maximumClientBytes:65536,maximumTotalBytes:131072,maximumNoticesPerRead:8,readTimeoutMs:1000},
      composition:{expected_workload_id:workload,selections:[{selector:{portal_user_id:person,human_issuer:issuer,
        subject:person,workspace_id:workspace,environment:"paper",domain},config:{issuer,audience:"TEST_ONLY-factory-pm",key_id:"TEST_ONLY-human",
        private_key_ref:keyRef,selected_source:{transport:{origin:"https://127.0.0.1:1",tls:{ca_ref:caRef,cert_ref:certRef,key_ref:tlsKeyRef},
          pm_leaf_sha256:"sha256:"+raw("f"),workload_id:workload,deadline_ms:1000,request_bytes:32768,response_bytes:32768,max_inflight:2},
          pins:{binding:{human_issuer:issuer,subject:person,workspace_id:workspace,environment:"paper",workload_id:workload},domain,
            human:{issuer,subject:person,portal_user_id:person,ts_user_id:"33333333-3333-3333-3333-333333333333",
              mapping_revision:"ts-user:33333333-3333-3333-3333-333333333333:1"},
            native:{revision:"1",receipt_id:"44444444-4444-4444-4444-444444444444",receipt_digest:"sha256:"+raw("1"),
              document_digest:"sha256:"+raw("2"),policy_revision:"1",owner_mapping_revision:"ts-user:33333333-3333-3333-3333-333333333333:1",
              semantic_revision:"sha256:"+raw("3"),effective_from:new Date(now-1000).toISOString(),expires_at:new Date(until).toISOString()},source_fingerprint:raw("e")},
          installation_expires_at_utc_ms:until},limits:{ttl_ms:10000,maximum_unresolved:4,maximum_retained:32},
        installation_scope:{workspace_id:workspace,environment:"paper",valid_until_ms:until},
        terminal:{issuer:"TEST_ONLY-terminal",audience:"TEST_ONLY-terminal",key_id:"TEST_ONLY-terminal",private_key_ref:keyRef,ttl_seconds:30},
        egress:{maximum_response_bytes:1048576,maximum_inflight:2,send_timeout_ms:1000,quiesce_timeout_ms:1000}}}],retained_recovery:[],
        owner_intakes:[{artifact_path:join(temporary,"OFFLINE-OWNER-ARTIFACT-MUST-NOT-BE-READ"),approved_sha256:raw("8"),
          target:{database_name:"native_core_read_test",database_system_identifier:system,role_name:"portal",protected_owner_user_id:person,
            workspace_id:workspace,principal_workspace_pins:[{user_id:person,workspace_id:workspace}]},
          intake_not_before_ms:now-1000,intake_not_after_ms:until}],mutation_limits:{maximum_intents:64,maximum_recoveries_per_request:8}}};
  }
  async function prepare(value=config()){
    return prepareNativeCoreRuntime(await pin(`config-${++serial}.json`,JSON.stringify(value)));
  }
  beforeAll(async()=>{
    if(!database||process.env.EPG10_08_NATIVE_READ_TEST_ONLY!=="1"||!ledgerSha||!/^[a-f0-9]{64}$/.test(ledgerSha))throw Error("TEST_ONLY_EXPLICIT_SOURCE_AND_TARGET_REQUIRED");
    const target=new URL(database);
    if(!/^control-api-test-postgres-[0-9]+$/.test(target.hostname)||target.pathname!=="/native_core_read_test")throw Error("TEST_ONLY_DISPOSABLE_INTERNAL_TARGET_REQUIRED");
    pool=buildPool(database,poolProfile);temporary=await mkdtemp(join(tmpdir(),"epg10-08-native-factory-"));
    names=(await readdir("migrations")).filter(n=>/^17236800000(?:[0-2][0-9]|3[0-6])_.*\.sql$/.test(n)).sort();
    expect(names).toHaveLength(39);expect(hash(JSON.stringify(names.map(n=>n.slice(0,-4))))).toBe(ledgerSha);
    await pool.query("CREATE TABLE public.pgmigrations(id serial PRIMARY KEY,name text NOT NULL UNIQUE,run_on timestamptz NOT NULL DEFAULT now())");
    for(const name of names){
      const source=await readFile(join("migrations",name),"utf8");
      await pool.query(source.split("\n-- Down Migration")[0]!);
      await pool.query("INSERT INTO public.pgmigrations(name) VALUES($1)",[name.slice(0,-4)]);
    }
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES($1,'test_only_factory','TEST_ONLY','ADMIN','ACTIVE',false,7)",[person]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",[workspace,person]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[workspace,person]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id,claimed_by) VALUES('PORTAL_OWNER',$1,'TEST_ONLY')",[person]);
    system=(await pool.query("SELECT (pg_control_system()).system_identifier::text id")).rows[0].id;
    baseline=await authorityDigest();
    const source={p132:await readFile("migrations/1723680000132_execution-retained-review-access.sql","utf8"),
      p134:await readFile("migrations/1723680000134_execution-access-policy-v2.sql","utf8"),
      candidate:await readFile("src/execution-v2/current-human-candidate.sql","utf8")};
    const golden=JSON.parse(await readFile("test/fixtures/runtime-native-schema-golden.json","utf8"));
    expect(golden.digest).toBe("sha256:e4923afb657e87c6abd3e7c343435875b7b3758d06cc0c06afba4b28f3f6dd1d");
    expect(accessDigest(golden.manifests)).toBe(golden.digest);
    for(const key of ["p132","p134","candidate"] as const)expect(hash(source[key])).toBe(golden.source_sha256[key]);
    const input:CoreNativeInstallationInput={source,approved_sha256:golden.source_sha256,expected_manifests:golden.manifests,
      expected_manifest_digest:golden.digest,expected_migration_names:names.map(n=>n.slice(0,-4)),baseline_maximum_rows:100,
      target:{database_name:"native_core_read_test",database_system_identifier:system,role_name:"portal"}};
    installation=new CoreNativeInstallation(pool,input);
    const signing=generateKeyPairSync("ed25519");keyRef=await pin("human.key",signing.privateKey.export({format:"pem",type:"pkcs8"}));
    const ca=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),caName=commonName("TEST_ONLY_FACTORY_CA");
    caRef=await pin("ca.crt",testCertificate(caName,ca,{name:caName,key:ca.privateKey},true));
    const tls=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
    certRef=await pin("core.crt",testCertificate(commonName("TEST_ONLY_FACTORY_CORE"),tls,{name:caName,key:ca.privateKey},false,"localhost"));
    tlsKeyRef=await pin("core.key",tls.privateKey.export({format:"pem",type:"pkcs8"}));
  },30000);
  afterAll(async()=>{try{await pool?.end();}finally{if(temporary)await rm(temporary,{recursive:true,force:true});}});

  it("adds only reviewed native schema to exact stable39 and preserves existing identities/ledger",async()=>{
    expect(await installation.status()).toEqual({state:"ABSENT"});
    expect(await installation.prepare()).toMatchObject({state:"COMPLETE_EXACT",disposition:"ADDITIVE_INSTALL_COMMITTED"});
    expect(await installation.prepare()).toMatchObject({state:"COMPLETE_EXACT",disposition:"ACKNOWLEDGED_EXISTING"});
    expect(await authorityDigest()).toBe(baseline);
    expect((await pool.query("SELECT to_regclass('research.alphas') value")).rows[0].value).toBeNull();
    expect((await pool.query("SELECT count(*)::int n FROM pgmigrations")).rows[0].n).toBe(39);
  });
  it("loads actual private files, composes genuine same-pool objects and mounts actual AppModule DI",async()=>{
    const runtime=await prepare();expect(runtime.poolProfile).toEqual(poolProfile);
    const dependencies=await runtime.compose(pool);expect(dependencies.nativeManagerRead).toBeDefined();
    expect(dependencies.currentHumanMutations!.usesPool(pool)).toBe(true);
    const app=await createControlApiApp(testConfig({DATABASE_URL:database!}),pool,undefined,dependencies);
    try{
      const native=app.get(NativeManagerReadConsumer),operations=app.get(MaximumDataOperationService);
      expect(native).toBeInstanceOf(NativeManagerReadConsumer);expect(native.uses(pool,operations)).toBe(true);
      expect(app.get(NATIVE_MANAGER_REALTIME_COORDINATOR)).toBe(native);
      expect(app.get(ExecutionAccessService).usesPool(pool)).toBe(true);expect(app.get(AuthService)).toBeDefined();
      expect((await app.inject({method:"GET",url:"/api/v1/execution/profiles/paper/realtime-snapshot"})).statusCode).toBe(401);
      // A genuine mounted object is required, not merely an accepted DTO.
      expect(()=>nativeCoreManagerReadConsumer({...dependencies.nativeManagerRead!},pool,operations,dependencies)).toThrow();
      expect(await authorityDigest()).toBe(baseline);
      expect((await pool.query("SELECT count(*)::int n FROM portal_access_policy_state")).rows[0].n).toBe(0);
      expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.native_read_obligations")).rows[0].n).toBe(0);
    }finally{await app.close();}
  });
  it.each(["database","system","role"] as const)("refuses wrong independently pinned %s against actual PG metadata",async axis=>{
    const value=config(),target=value.composition.owner_intakes[0]!.target;
    if(axis==="database")target.database_name="TEST_ONLY-wrong-db";
    if(axis==="system")target.database_system_identifier="1";
    if(axis==="role")target.role_name="TEST_ONLY-wrong-role";
    await expect((await prepare(value)).compose(pool)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
    expect(await authorityDigest()).toBe(baseline);
  });
  it("refuses actual symlink and group-readable configuration instead of selecting legacy",async()=>{
    const file=await pin("bad-mode.json",JSON.stringify(config()));await chmod(file.path,0o640);
    await expect(prepareNativeCoreRuntime(file)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
    const good=await pin("symlink-target.json",JSON.stringify(config())),link=join(temporary,"symlink.json");await symlink(good.path,link);
    await expect(prepareNativeCoreRuntime({...good,path:link})).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
    expect(await authorityDigest()).toBe(baseline);
  });
  it("refuses a second Core pool and changed pool/trust/mutation binding before app registration",async()=>{
    const dependencies=await(await prepare()).compose(pool);
    const other=new Pool({connectionString:database,max:2,connectionTimeoutMillis:2000,query_timeout:6000});
    try{expect(()=>AppModule.register(testConfig({DATABASE_URL:database!}),other,undefined,dependencies)).toThrow("CURRENT_HUMAN_MUTATION_CORE_POOL_REQUIRED");}
    finally{await other.end();}
    expect(await authorityDigest()).toBe(baseline);
  });
});
