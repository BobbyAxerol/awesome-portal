/** TEST_ONLY disposable PostgreSQL; never points at a shared database. */
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,describe,expect,it} from "vitest";

const url=process.env.TEST_DATABASE_URL;
const enabled=process.env.C2_P7_TEST_DISPOSABLE==="TEST_ONLY_C2_P7_DEDICATED_DATABASE"&&!!url;
describe.skipIf(!enabled)("TEST_ONLY P7 old-schema forward upgrade",()=>{
  let pool:Pool;
  afterAll(async()=>{await pool?.end();});
  it("preserves old rows, ACL and guards, rejects bad guards and permits old-writer rollback without inventing links",async()=>{
    if(!/^\/portal_c2_p7_[a-f0-9]{8}$/.test(new URL(url!).pathname))throw new Error("TEST_ONLY_DATABASE_REQUIRED");
    pool=new Pool({connectionString:url,max:2,connectionTimeoutMillis:2000,query_timeout:6000});
    const read=(name:string)=>readFile(join(process.cwd(),"src/execution-v2",name),"utf8");
    const [newRecords,newIntent,upgrade]=await Promise.all([
      read("c2-p7-acceptance.sql"),read("c2-p7-owner-intent-candidate.sql"),read("c2-p7-record-link-upgrade-candidate.sql")]);
    const addedColumns=`  -- NULL is an older/direct diagnostic, never evidence of owner approval.\n  owner_intent_id uuid UNIQUE,\n  confirmation_sha256 text CHECK (confirmation_sha256 ~ '^[0-9a-f]{64}$'),\n  CHECK ((owner_intent_id IS NULL) = (confirmation_sha256 IS NULL)),\n`;
    const addedFk=`-- The link identifies the original review; it is not a grant or an authority\n-- proof. The writer also checks its exact contents and current revocation\n-- while holding the same authority and intent locks before writing a record.\nALTER TABLE elp210_c2_p7_candidate.records ADD CONSTRAINT p7_record_owner_intent_fk\n  FOREIGN KEY (owner_intent_id) REFERENCES elp210_c2_p7_candidate.owner_intents(intent_id);\n`;
    if(!newRecords.includes(addedColumns)||!newIntent.includes(addedFk))throw new Error("TEST_ONLY_BASELINE_SHAPE_CHANGED");
    await pool.query(newRecords.replace(addedColumns,""));
    await pool.query(newIntent.replace(addedFk,""));
    const oldId=randomUUID(),oldDelegate=randomUUID(),cycle="1".repeat(64);
    const oldInsert=`INSERT INTO elp210_c2_p7_candidate.records
      (cycle_sha256,binding_sha256,b1_sha256,acceptance_id,delegation_id,acceptance_json,acceptance_sha256,delegation_json,delegation_sha256)
      VALUES($1,$2,$3,$4,$5,'{}',$6,'{}',$7)`;
    await pool.query(oldInsert,[cycle,"2".repeat(64),"3".repeat(64),oldId,oldDelegate,"4".repeat(64),"5".repeat(64)]);
    const before=(await pool.query(`SELECT row_to_json(r)::text AS row,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl
      FROM elp210_c2_p7_candidate.records r JOIN pg_class c ON c.oid='elp210_c2_p7_candidate.records'::regclass`)).rows[0];
    const client=await pool.connect();
    try {
      await client.query("ALTER TABLE elp210_c2_p7_candidate.records DISABLE TRIGGER p7_immutable_rows");
      await expect(client.query(upgrade)).rejects.toThrow("C2_P7_LINK_UPGRADE_GUARD_MISSING");
      await client.query("ROLLBACK");
      expect((await client.query(`SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='elp210_c2_p7_candidate.records'::regclass
        AND attname='owner_intent_id' AND attnum>0 AND NOT attisdropped`)).rows[0].n).toBe(0);
      await client.query("ALTER TABLE elp210_c2_p7_candidate.records ENABLE TRIGGER p7_immutable_rows");
      const locker=await pool.connect();
      try {
        await locker.query("BEGIN");await locker.query("LOCK TABLE elp210_c2_p7_candidate.records IN ACCESS SHARE MODE");
        await expect(client.query(upgrade)).rejects.toThrow(/lock timeout/i);
        await client.query("ROLLBACK");
      } finally {await locker.query("ROLLBACK");locker.release();}
      expect((await client.query(`SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='elp210_c2_p7_candidate.records'::regclass
        AND attname='owner_intent_id' AND attnum>0 AND NOT attisdropped`)).rows[0].n).toBe(0);
      await client.query(upgrade);
      const after=(await client.query(`SELECT to_jsonb(r)-'owner_intent_id'-'confirmation_sha256' AS row,
        r.owner_intent_id,r.confirmation_sha256,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl
        FROM elp210_c2_p7_candidate.records r JOIN pg_class c ON c.oid='elp210_c2_p7_candidate.records'::regclass`)).rows[0];
      expect(after.row).toEqual(JSON.parse(before.row));expect(after.owner).toBe(before.owner);expect(after.acl).toBe(before.acl);
      expect(after.owner_intent_id).toBeNull();expect(after.confirmation_sha256).toBeNull();
      await expect(client.query("UPDATE elp210_c2_p7_candidate.records SET binding_sha256=$1 WHERE cycle_sha256=$2",["6".repeat(64),cycle])).rejects.toThrow();
      // Previous code specifies the old columns; leaving the additive schema
      // in place is the safe application rollback, not DROP COLUMN.
      await client.query(oldInsert,["7".repeat(64),"2".repeat(64),"3".repeat(64),randomUUID(),randomUUID(),"4".repeat(64),"5".repeat(64)]);
      expect((await client.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records WHERE owner_intent_id IS NULL AND confirmation_sha256 IS NULL")).rows[0].n).toBe(2);
      const intent=randomUUID();
      await client.query(`INSERT INTO elp210_c2_p7_candidate.owner_intents
        (intent_id,proof_sha256,idempotency_sha256,action,workspace_id,owner_user_id,session_id,session_generation,
         registration_key,registration_sha256,source_evidence_sha256,b1_sha256,decision_json,authority_revision,expires_at_ms)
        VALUES($1,$2,$3,'REGISTER','TEST_ONLY','TEST_ONLY','TEST_ONLY',1,'TEST_ONLY',$4,$5,$6,'{}',1,2000000000000)`,
      [intent,"8".repeat(64),"9".repeat(64),"a".repeat(64),"b".repeat(64),"c".repeat(64)]);
      const linkedInsert=`INSERT INTO elp210_c2_p7_candidate.records
        (cycle_sha256,binding_sha256,b1_sha256,acceptance_id,delegation_id,acceptance_json,acceptance_sha256,
         delegation_json,delegation_sha256,owner_intent_id,confirmation_sha256)
        VALUES($1,$2,$3,$4,$5,'{}',$6,'{}',$7,$8,$9)`;
      const linked=(whichCycle:string,whichIntent:string|null,confirmation:string|null)=>
        [whichCycle,"2".repeat(64),"3".repeat(64),randomUUID(),randomUUID(),"4".repeat(64),"5".repeat(64),whichIntent,confirmation];
      await client.query(linkedInsert,linked("a".repeat(64),intent,"d".repeat(64)));
      await expect(client.query(linkedInsert,linked("b".repeat(64),intent,"d".repeat(64)))).rejects.toThrow(/unique constraint/i);
      await expect(client.query(linkedInsert,linked("c".repeat(64),randomUUID(),"d".repeat(64)))).rejects.toThrow(/foreign key constraint/i);
      await expect(client.query(linkedInsert,linked("d".repeat(64),null,"d".repeat(64)))).rejects.toThrow(/check constraint/i);
      await expect(client.query(upgrade)).rejects.toThrow("C2_P7_LINK_UPGRADE_SCHEMA_MISMATCH");
      await client.query("ROLLBACK");
      expect((await client.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records")).rows[0].n).toBe(3);
    } finally {client.release();}
  },30000);
});
