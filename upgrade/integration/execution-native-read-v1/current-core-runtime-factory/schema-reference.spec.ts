/** TEST_ONLY independent disposable specimen; schema definitions ONLY.
 * Never run on production or learn an installed target as its expected shape. */
import {createHash} from "node:crypto";
import {readFile,readdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool} from "pg";
import {it,expect} from "vitest";
import {nativeMigrationUp,nativeCandidateBody,readCoreNativeManifest} from "../src/execution-v2/core-native-installation";
import {accessDigest} from "../src/execution-v2/access-digest";
const hash=(bytes:string)=>createHash("sha256").update(bytes).digest("hex");
it("exports schema-only reference from a fresh stable39 specimen, never the actual target",async()=>{
  const url=process.env.TEST_DATABASE_URL;
  if(!url||process.env.EPG10_08_NATIVE_READ_TEST_ONLY!=="1")throw Error("TEST_ONLY_TARGET_REQUIRED");
  const target=new URL(url);
  if(!/^control-api-test-postgres-[0-9]+$/.test(target.hostname)||target.pathname!=="/native_core_read_test")throw Error("TEST_ONLY_DISPOSABLE_TARGET_REQUIRED");
  const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:2000,query_timeout:6000});
  const conn=await pool.connect();
  try{
    expect((await conn.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n).toBe(0);
    const system=(await conn.query("SELECT (pg_control_system()).system_identifier::text value")).rows[0].value;
    expect(["7675333655652302882","7674585245102796834"]).not.toContain(system);
    const names=(await readdir("migrations")).filter(n=>/^17236800000(?:[0-2][0-9]|3[0-6])_.*\.sql$/.test(n)).sort();
    expect(names).toHaveLength(39);
    expect(hash(JSON.stringify(names.map(n=>n.slice(0,-4))))).toBe("758c9056103f8a40714a0084e566731dafba7848ee7c8232e374da6dde4b2531");
    const source={p132:await readFile("migrations/1723680000132_execution-retained-review-access.sql","utf8"),
      p134:await readFile("migrations/1723680000134_execution-access-policy-v2.sql","utf8"),
      candidate:await readFile("src/execution-v2/current-human-candidate.sql","utf8")};
    expect(hash(source.p132)).toBe("84f14101ed46612a2e210d985dba4ac03b1a2ca3bc6611d02dbf49571543cd1a");
    expect(hash(source.p134)).toBe("279a15abf0bf03058e9c06dbf2d4d01516cb4d7f4eb233eab260e5ec8437862c");
    expect(hash(source.candidate)).toBe("826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728");
    await conn.query("BEGIN");
    await conn.query("SET LOCAL search_path=public; SET LOCAL statement_timeout='3000ms'; SET LOCAL lock_timeout='1000ms'");
    for(const name of names)await conn.query((await readFile(join("migrations",name),"utf8")).split("\n-- Down Migration")[0]!);
    await conn.query(nativeMigrationUp(source.p132));await conn.query(nativeMigrationUp(source.p134));
    await conn.query(nativeCandidateBody(source.candidate));await conn.query("SET LOCAL search_path=pg_catalog,public");
    const manifests={p132:await readCoreNativeManifest(conn,"p132"),p134:await readCoreNativeManifest(conn,"p134"),candidate:await readCoreNativeManifest(conn,"candidate")};
    for(const table of ["portal_users","auth_sessions","portal_access_policy_state","elp210_candidate.native_read_obligations"])
      expect((await conn.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
    const golden={schema_version:"TEST_ONLY.native-schema-golden.v1",manifests,digest:accessDigest(manifests),
      source_sha256:{p132:hash(source.p132),p134:hash(source.p134),candidate:hash(source.candidate)}};
    const bytes=JSON.stringify(golden);expect(Buffer.byteLength(bytes)).toBeLessThan(1048576);
    await conn.query("ROLLBACK");
    await writeFile("/evidence/schema-reference.json",bytes,{flag:"wx",mode:0o600});
    console.log(JSON.stringify({schema_reference_digest:golden.digest,artifact_sha256:hash(bytes),source_sha256:golden.source_sha256,
      fresh_specimen:true,reference_transaction_rolled_back:true,identities_or_authority_installed:false}));
  }finally{
    try{await conn.query("ROLLBACK");}finally{conn.release();await pool.end();}
  }
},20000);
