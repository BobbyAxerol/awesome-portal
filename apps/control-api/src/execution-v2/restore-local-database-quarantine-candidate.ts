import type {Pool,PoolClient} from "pg";

/** UNMOUNTED operator candidate, not an external old-clone/source/HTTP fence
 * or permission to restore. Only a separately authorized operator may select
 * a dedicated database; an incorrect pin can interrupt every one of its users.
 * A privileged actor can reverse the change. Never use on a shared target. */
type Pin=Readonly<{system_identifier:string;operator_database:string;operator_role:string;
  target_database:string;target_oid:string;maximum_sessions:number}>;
type Observer=Readonly<{pid:number;backend_start:string;application_name:string}>;
const name=/^[a-z][a-z0-9_]{0,62}$/;
const number=/^[1-9][0-9]{0,19}$/;
const fail=():never=>{throw new Error("V2_LOCAL_DATABASE_QUARANTINE_REFUSED");};
type State={system_id:string;operator_database:string;operator_role:string;session_role:string;operator_super:boolean;
  target_database:string|null;target_oid:string|null;allow_connections:boolean|null;is_template:boolean|null;
  owned_by_operator:boolean|null;prepared:boolean};
async function inspect(db:PoolClient,pin:Pin):Promise<State> {
  const result=await db.query<State>(`SELECT (pg_control_system()).system_identifier::text AS system_id,
    current_database() AS operator_database,current_user AS operator_role,session_user AS session_role,
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS operator_super,
    d.datname AS target_database,d.oid::text AS target_oid,d.datallowconn AS allow_connections,d.datistemplate AS is_template,
    d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned_by_operator,
    EXISTS(SELECT 1 FROM pg_prepared_xacts p WHERE p.database=$2) AS prepared
    FROM (SELECT 1) q LEFT JOIN pg_database d ON d.oid=$1::oid`,[pin.target_oid,pin.target_database]);
  const v=result.rows[0];
  if(result.rowCount!==1||!v||v.system_id!==pin.system_identifier||v.operator_database!==pin.operator_database||
    v.operator_role!==pin.operator_role||v.session_role!==pin.operator_role||v.operator_super!==true||
    v.target_database!==pin.target_database||v.target_oid!==pin.target_oid||v.is_template!==false||v.owned_by_operator!==true||
    v.prepared!==false||typeof v.allow_connections!=="boolean")return fail();
  return v;
}
async function sessions(db:PoolClient,pin:Pin,observer?:Observer):Promise<number[]> {
  const found=await db.query<{pid:number;backend_type:string;backend_start:string;application_name:string;
    usename:string;state:string|null;in_transaction:boolean}>(`SELECT pid,backend_type,backend_start::text,application_name,usename,state,
    xact_start IS NOT NULL AS in_transaction FROM pg_stat_activity WHERE datid=$1::oid AND pid<>pg_backend_pid()
    ORDER BY pid LIMIT $2`,[pin.target_oid,pin.maximum_sessions+(observer?2:1)]);
  if(found.rows.some(v=>!Number.isSafeInteger(v.pid)||v.pid<1||v.backend_type!=="client backend"))return fail();
  if(observer) {
    const selected=found.rows.filter(v=>v.pid===observer.pid);
    if(selected.length!==1||selected[0]?.backend_start!==observer.backend_start||
      selected[0]?.application_name!==observer.application_name||selected[0]?.usename!==pin.operator_role||
      selected[0]?.state!=="idle"||selected[0]?.in_transaction!==false)return fail();
  }
  const victims=found.rows.filter(v=>v.pid!==observer?.pid);
  if(victims.length>pin.maximum_sessions)return fail();
  return victims.map(v=>v.pid);
}

/** Disable connections and drain the exact target DB. Refuse prepared xacts,
 * unknown/excess backends and invalid pins. On any later failure leave the DB
 * disabled; retry only the same pin. This cannot fence privileged re-enabling,
 * prepared transactions already on another cluster, old clones, or upstream
 * and HTTP work. A separately qualified external fence remains required. */
export async function quarantineLocalDatabaseForRestore(pool:Pool,input:Pin):Promise<{
  state:"LOCAL_DATABASE_QUARANTINE_NOT_CUTOVER";target_oid:string;terminated_sessions:number}> {
  return quarantine(pool,input);
}

/** Test/preparation path that retains one explicitly pinned, idle, privileged
 * observer session. It does NOT authenticate that observer independently or
 * bind its later checkpoint to this observation. Never expose to clients. */
export async function quarantineLocalDatabaseKeepingObserver(pool:Pool,input:Pin,observer:Observer):Promise<{
  state:"LOCAL_DATABASE_QUARANTINE_NOT_CUTOVER";target_oid:string;terminated_sessions:number}> {
  if(!observer||typeof observer!=="object"||Array.isArray(observer)||
    JSON.stringify(Object.keys(observer).sort())!==JSON.stringify(["application_name","backend_start","pid"])||
    !Number.isSafeInteger(observer.pid)||observer.pid<1||typeof observer.backend_start!=="string"||
    observer.backend_start.length<10||observer.backend_start.length>80||typeof observer.application_name!=="string"||
    !/^portal\.restore\.observer\.[a-f0-9]{32}$/.test(observer.application_name))return fail();
  return quarantine(pool,input,Object.freeze({...observer}));
}

async function quarantine(pool:Pool,input:Pin,observer?:Observer):Promise<{
  state:"LOCAL_DATABASE_QUARANTINE_NOT_CUTOVER";target_oid:string;terminated_sessions:number}> {
  if(!pool||!input||typeof input!=="object"||Array.isArray(input)||
    JSON.stringify(Object.keys(input).sort())!==JSON.stringify(["maximum_sessions","operator_database","operator_role","system_identifier","target_database","target_oid"]))return fail();
  const pin=Object.freeze({...input});
  if(typeof pin.system_identifier!=="string"||!number.test(pin.system_identifier)||
    typeof pin.target_oid!=="string"||!number.test(pin.target_oid)||BigInt(pin.target_oid)>4294967295n||
    typeof pin.operator_database!=="string"||!name.test(pin.operator_database)||typeof pin.target_database!=="string"||
    !name.test(pin.target_database)||["postgres","template0","template1"].includes(pin.target_database)||
    pin.operator_database===pin.target_database||typeof pin.operator_role!=="string"||!name.test(pin.operator_role)||
    !Number.isSafeInteger(pin.maximum_sessions)||pin.maximum_sessions<1||pin.maximum_sessions>64||!pool.options||
    [pool.options.connectionTimeoutMillis,pool.options.query_timeout].some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>10000))return fail();
  const db=await pool.connect();let discard=false;
  try {
    await inspect(db,pin);await sessions(db,pin,observer);
    // Strictly validated ASCII identifier. ALTER DATABASE cannot be run in a
    // transaction; after it succeeds, failure leaves the target closed.
    await db.query(`ALTER DATABASE "${pin.target_database}" ALLOW_CONNECTIONS false`);
    if((await inspect(db,pin)).allow_connections!==false)return fail();
    let terminated=0;
    for(const pid of await sessions(db,pin,observer)) {
      const result=await db.query<{ended:boolean}>(`SELECT pg_terminate_backend(a.pid,5000) AS ended FROM pg_stat_activity a
        WHERE a.pid=$1 AND a.datid=$2::oid AND a.backend_type='client backend'`,[pid,pin.target_oid]);
      if(result.rows.length===1&&result.rows[0]?.ended===true)terminated++;
      else if(result.rows.length!==0)return fail();
    }
    if((await inspect(db,pin)).allow_connections!==false||(await sessions(db,pin,observer)).length!==0)return fail();
    return {state:"LOCAL_DATABASE_QUARANTINE_NOT_CUTOVER",target_oid:pin.target_oid,terminated_sessions:terminated};
  }catch(error){discard=true;throw error;}finally{db.release(discard);}
}
