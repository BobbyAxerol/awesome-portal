import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { restoreCheckpointEventHash, type RestoreCheckpointCaptureKind, type RestoreCheckpointPin } from "./restore-checkpoint-authority";

/** UNMOUNTED observation reader. It needs the independent authority only,
 * never the source DB. A caller-supplied expected head must come from a
 * separately qualified trust channel; a matching hash is not an operator
 * identity, an old-holder fence, a source ACK census or a restore permit. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const digits=/^(?:0|[1-9][0-9]{0,18})$/;
const cluster=/^(?:0|[1-9][0-9]{0,19})$/;
const drain=/^restore_v2:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maximum=9_223_372_036_854_775_807n;
const decimal=(value:unknown):value is string=>typeof value==="string"&&digits.test(value)&&BigInt(value)<=maximum;
const validUuid=(value:unknown):value is string=>typeof value==="string"&&uuid.test(value);
const validHash=(value:unknown):value is string=>typeof value==="string"&&hash.test(value);
const kinds=new Set(["CALLER_CLAIM","DRAIN_BOUND_CLAIM","LOCKED_SOURCE_CAPTURE","FROZEN_SOURCE_CAPTURE",
  "FROZEN_NOLOGIN_SOURCE_OBSERVATION","FROZEN_CLOSED_DB_OBSERVATION"]);
const fail=():never=>{throw new Error("V2_CHECKPOINT_READ_INVALID");};
type Head={source_system_identifier:string;authority_system_identifier:string;generation:string;source_revision:string;event_hash:string;event_count:string};
type Event={operation_id:string;expected_generation:string;generation:string;source_revision:string;inventory_digest:string;
  capture_kind:RestoreCheckpointCaptureKind;predecessor_hash:string;event_hash:string};
type ClosedPin={target_oid:string;operator_role:string;observer_pid:number;observer_start:string;application_name:string};
export type VerifiedClosedObservation=Readonly<{state:"VERIFIED_JOURNAL_NOT_CUTOVER";generation:string;event_hash:string;
  source_revision:string;operation_id:string;drain_id:string;freeze_operation_id:string;prior_generation:string;
  prior_writer_oid:string;frozen_generation:string;inventory_digest:string;closed_pin:Readonly<ClosedPin>}>;

function decodeObservation(raw:unknown,pin:RestoreCheckpointPin,event:Event):VerifiedClosedObservation {
  if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")>8192||createHash("sha256").update(raw,"utf8").digest("hex")!==event.inventory_digest)return fail();
  let v:unknown;try {v=JSON.parse(raw);}catch{return fail();}
  if(!Array.isArray(v)||v.length!==11||JSON.stringify(v)!==raw||v[0]!=="portal.restore-frozen-closed-db-observation.v1"||
    v[1]!==pin.checkpoint_id||v[2]!==pin.source_system_identifier||typeof v[3]!=="string"||!drain.test(v[3])||
    v[4]!==event.source_revision||!validUuid(v[5])||!decimal(v[6])||!decimal(v[7])||BigInt(v[7])<1n||BigInt(v[7])>4294967295n||
    !decimal(v[8])||BigInt(v[8])!==BigInt(v[6])+1n||!validHash(v[10]))return fail();
  const p=v[9] as Record<string,unknown>|null;
  if(!p||typeof p!=="object"||Array.isArray(p)||JSON.stringify(Object.keys(p).sort())!==
    JSON.stringify(["application_name","observer_pid","observer_start","operator_role","target_oid"])||
    !decimal(p.target_oid)||BigInt(p.target_oid)<1n||BigInt(p.target_oid)>4294967295n||
    !Number.isSafeInteger(p.observer_pid)||Number(p.observer_pid)<1||typeof p.observer_start!=="string"||
    p.observer_start.length<10||p.observer_start.length>80||typeof p.operator_role!=="string"||
    !/^[a-z][a-z0-9_]{0,62}$/.test(p.operator_role)||typeof p.application_name!=="string"||
    !/^portal\.restore\.observer\.[a-f0-9]{32}$/.test(p.application_name))return fail();
  return Object.freeze({state:"VERIFIED_JOURNAL_NOT_CUTOVER",generation:event.generation,event_hash:event.event_hash,
    source_revision:event.source_revision,operation_id:event.operation_id,drain_id:v[3],freeze_operation_id:v[5],
    prior_generation:v[6],prior_writer_oid:v[7],frozen_generation:v[8],inventory_digest:v[10],
    closed_pin:Object.freeze({target_oid:p.target_oid,operator_role:p.operator_role,observer_pid:Number(p.observer_pid),
      observer_start:p.observer_start,application_name:p.application_name})});
}

export class RestoreCheckpointAuthorityReader {
  readonly #pool:Pool;readonly #pin:RestoreCheckpointPin;readonly #maximumEvents:number;
  constructor(pool:Pool,pin:RestoreCheckpointPin,maximumEvents:number) {
    if(!pool?.options||[pool.options.connectionTimeoutMillis,pool.options.query_timeout].some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>10000)||
      !pin||!validUuid(pin.checkpoint_id)||typeof pin.source_system_identifier!=="string"||typeof pin.authority_system_identifier!=="string"||
      !cluster.test(pin.source_system_identifier)||!cluster.test(pin.authority_system_identifier)||
      pin.source_system_identifier===pin.authority_system_identifier||!Number.isSafeInteger(maximumEvents)||maximumEvents<1||maximumEvents>10000)
      throw new Error("V2_CHECKPOINT_READ_INVALID");
    this.#pool=pool;this.#pin=Object.freeze({...pin});this.#maximumEvents=maximumEvents;
  }
  /** Selection check only: distinct PG identifiers and a matching pin do not
   * establish an independently operated authority or authorize cutover. */
  matchesPin(pin:RestoreCheckpointPin):boolean {
    return !!pin&&pin.checkpoint_id===this.#pin.checkpoint_id&&
      pin.source_system_identifier===this.#pin.source_system_identifier&&
      pin.authority_system_identifier===this.#pin.authority_system_identifier;
  }
  async readLatestClosed(expected:{generation:string;event_hash:string;operation_id:string},
    requiredAncestor?:{generation:string;event_hash:string;operation_id:string}):Promise<VerifiedClosedObservation> {
    if(!expected||!decimal(expected.generation)||BigInt(expected.generation)<1n||!validHash(expected.event_hash)||!validUuid(expected.operation_id))return fail();
    if(requiredAncestor&&(!decimal(requiredAncestor.generation)||BigInt(requiredAncestor.generation)<1n||
      !validHash(requiredAncestor.event_hash)||!validUuid(requiredAncestor.operation_id)))return fail();
    const selected=Object.freeze({generation:expected.generation,event_hash:expected.event_hash,operation_id:expected.operation_id});
    const ancestor=requiredAncestor&&Object.freeze({generation:requiredAncestor.generation,event_hash:requiredAncestor.event_hash,
      operation_id:requiredAncestor.operation_id});
    const db=await this.#pool.connect();let discard=false;
    try {
      // READ COMMITTED is intentional: the first SELECT can wait for DDL
      // before it takes the locks, so a repeatable-read snapshot established
      // before that wait could see pre-DDL guard state. The verifier role
      // has no writes; its only elevated operation is the fixed lock helper.
      await db.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      // A crashed or stalled verifier must not indefinitely block authority
      // writers while it holds SHARE locks between statements. This is an
      // operational bound for this client, not a defense against a privileged
      // or otherwise uncooperative role that changes its own settings.
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms'; SET LOCAL row_security=off");
      // ACCESS SHARE does not conflict with DISABLE TRIGGER. SHARE on the
      // journal relations blocks writers and trigger DDL; SHARE on pg_proc
      // also fences CREATE OR REPLACE of the guard function for this bounded
      // transaction. The catalog lock impacts function DDL across this DB.
      // Require the actual locks, not merely a successful function response.
      await db.query("SELECT portal_restore_authority.lock_journal_for_read()");
      const locks=await db.query<{n:string}>(`SELECT count(DISTINCT relation)::text AS n FROM pg_catalog.pg_locks
        WHERE pid=pg_backend_pid() AND granted AND mode='ShareLock' AND relation IN
          (to_regclass('portal_restore_authority.checkpoints'),to_regclass('portal_restore_authority.events'),
           to_regclass('portal_restore_authority.closed_observations'),to_regclass('pg_catalog.pg_proc'))`);
      if(locks.rows.length!==1||locks.rows[0]?.n!=="4")return fail();
      const id=await db.query<{id:string}>("SELECT system_identifier::text AS id FROM pg_control_system()");
      if(id.rows.length!==1||id.rows[0]?.id!==this.#pin.authority_system_identifier)return fail();
      const guards=await db.query<{n:string}>(`SELECT count(*)::text AS n FROM pg_catalog.pg_trigger t
        WHERE ((t.tgrelid=to_regclass('portal_restore_authority.events') AND t.tgname='events_immutable') OR
          (t.tgrelid=to_regclass('portal_restore_authority.closed_observations') AND t.tgname='closed_observations_immutable'))
        AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=58 AND t.tgqual IS NULL
        AND t.tgfoid=to_regprocedure('portal_restore_authority.immutable_event()')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
          WHERE p.oid=t.tgfoid AND l.lanname='plpgsql' AND p.prokind='f' AND p.pronargs=0
            AND p.prorettype='pg_catalog.trigger'::regtype AND NOT p.prosecdef AND NOT p.proleakproof
            AND p.provolatile='v' AND p.proconfig IS NULL AND pg_catalog.btrim(p.prosrc,$2)=$1)`,
        ["BEGIN RAISE EXCEPTION 'V2_CHECKPOINT_EVENT_IMMUTABLE'; END"," \t\n\r"]);
      if(guards.rows.length!==1||guards.rows[0]?.n!=="2")return fail();
      const heads=await db.query<Head>(`SELECT source_system_identifier,authority_system_identifier,generation::text,source_revision::text,
        event_hash,event_count::text FROM portal_restore_authority.checkpoints WHERE checkpoint_id=$1`,[this.#pin.checkpoint_id]);
      const h=heads.rows[0];
      if(heads.rows.length!==1||!h||h.source_system_identifier!==this.#pin.source_system_identifier||
        h.authority_system_identifier!==this.#pin.authority_system_identifier||!decimal(h.generation)||!decimal(h.event_count)||
        !decimal(h.source_revision)||!validHash(h.event_hash)||h.event_count!==h.generation||BigInt(h.generation)>BigInt(this.#maximumEvents)||
        h.generation!==selected.generation||h.event_hash!==selected.event_hash)return fail();
      const rows=await db.query<Event>(`SELECT operation_id::text,expected_generation::text,generation::text,source_revision::text,
        inventory_digest,capture_kind,predecessor_hash,event_hash FROM portal_restore_authority.events e
        WHERE e.checkpoint_id=$1 ORDER BY e.generation LIMIT $2`,[this.#pin.checkpoint_id,this.#maximumEvents+1]);
      if(BigInt(rows.rows.length)!==BigInt(h.generation))return fail();
      let prior="0".repeat(64),revision=0n;const operations=new Set<string>();
      for(let i=0;i<rows.rows.length;i++) {
        const e=rows.rows[i];
        if(!e||!validUuid(e.operation_id)||operations.has(e.operation_id)||e.expected_generation!==String(i)||e.generation!==String(i+1)||
          !decimal(e.source_revision)||BigInt(e.source_revision)<revision||!validHash(e.inventory_digest)||!kinds.has(e.capture_kind)||
          e.predecessor_hash!==prior||!validHash(e.event_hash)||
          restoreCheckpointEventHash(this.#pin.checkpoint_id,e,e.generation,e.predecessor_hash,e.capture_kind)!==e.event_hash)return fail();
        operations.add(e.operation_id);prior=e.event_hash;revision=BigInt(e.source_revision);
      }
      const last=rows.rows.at(-1);
      if(!last||last.operation_id!==selected.operation_id||last.capture_kind!=="FROZEN_CLOSED_DB_OBSERVATION"||
        prior!==h.event_hash||revision!==BigInt(h.source_revision))return fail();
      if(ancestor) {
        if(BigInt(ancestor.generation)>BigInt(rows.rows.length))return fail();
        const event=rows.rows[Number(BigInt(ancestor.generation)-1n)];
        if(!event||event.generation!==ancestor.generation||event.event_hash!==ancestor.event_hash||event.operation_id!==ancestor.operation_id)return fail();
      }
      const closed=new Map(rows.rows.filter(e=>e.capture_kind==="FROZEN_CLOSED_DB_OBSERVATION").map(e=>[e.operation_id,e]));
      const evidence=await db.query<{operation_id:string;observation:string}>(`SELECT operation_id::text,observation
        FROM portal_restore_authority.closed_observations WHERE checkpoint_id=$1 ORDER BY operation_id LIMIT $2`,
        [this.#pin.checkpoint_id,this.#maximumEvents+1]);
      if(evidence.rows.length!==closed.size)return fail();
      let result:VerifiedClosedObservation|undefined;
      for(const item of evidence.rows) {
        const event=closed.get(item.operation_id);if(!event)return fail();
        const decoded=decodeObservation(item.observation,this.#pin,event);
        if(item.operation_id===selected.operation_id)result=decoded;
      }
      if(!result)return fail();
      await db.query("COMMIT");return result;
    }catch(error){try{await db.query("ROLLBACK");}catch{discard=true;}throw error;}finally{db.release(discard);}
  }
}
