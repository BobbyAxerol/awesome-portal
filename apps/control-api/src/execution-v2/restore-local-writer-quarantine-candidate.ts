import type {Pool, PoolClient} from "pg";

/** UNMOUNTED operator-only candidate. This is a local PostgreSQL quarantine,
 * not an independent control plane, old-clone/HTTP fence, source/ACK census,
 * or restore/cutover permit. Caller must independently establish exclusive
 * ownership of the exact dedicated writer and authorization for its cluster.
 * Never use it on a shared login. A privileged administrator can undo it. */
type Pin = Readonly<{system_identifier:string;database_name:string;operator_role:string;
  writer_role:string;writer_oid:string;maximum_sessions:number}>;
const name=/^[a-z][a-z0-9_]{0,62}$/;
const oid=/^[1-9][0-9]{0,9}$/;
const system=/^(?:0|[1-9][0-9]{0,19})$/;
const fail=():never=>{throw new Error("V2_LOCAL_QUARANTINE_REFUSED");};

type State={system_id:string;db_name:string;operator_role:string;session_role:string;writer_name:string|null;
  writer_oid:string|null;login:boolean|null;unsafe:boolean;prepared:boolean;shared:boolean};
async function inspect(db:PoolClient,pin:Pin):Promise<State> {
  const found=await db.query<State>(`SELECT (pg_control_system()).system_identifier::text AS system_id,
    current_database() AS db_name,current_user AS operator_role,session_user AS session_role,
    r.rolname AS writer_name,r.oid::text AS writer_oid,r.rolcanlogin AS login,
    COALESCE((r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR
      pg_has_role(r.oid,current_user,'MEMBER') OR EXISTS(SELECT 1 FROM pg_database d
        WHERE pg_has_role(r.oid,d.datdba,'MEMBER')) OR EXISTS(SELECT 1 FROM pg_roles parent
          WHERE parent.oid<>r.oid AND pg_has_role(r.oid,parent.oid,'MEMBER'))),true) AS unsafe,
    EXISTS(SELECT 1 FROM pg_prepared_xacts p WHERE p.owner=$2 OR p.database=current_database()) AS prepared,
    COALESCE(EXISTS(SELECT 1 FROM pg_roles other WHERE other.oid<>r.oid AND other.rolcanlogin AND NOT other.rolsuper
      AND pg_has_role(other.oid,r.oid,'MEMBER')),true) AS shared
    FROM (SELECT 1) q LEFT JOIN pg_roles r ON r.oid=$1::oid`,[pin.writer_oid,pin.writer_role]);
  const v=found.rows[0];
  if(found.rows.length!==1||!v||v.system_id!==pin.system_identifier||v.db_name!==pin.database_name||
    v.operator_role!==pin.operator_role||v.session_role!==pin.operator_role||v.writer_name!==pin.writer_role||
    v.writer_oid!==pin.writer_oid||v.unsafe!==false||v.prepared!==false||v.shared!==false||typeof v.login!=="boolean")return fail();
  return v;
}

async function sessions(db:PoolClient,pin:Pin):Promise<number[]> {
  const rows=await db.query<{pid:number;db_name:string|null;backend_type:string}>(`SELECT pid,datname AS db_name,backend_type
    FROM pg_stat_activity WHERE usesysid=$1::oid AND pid<>pg_backend_pid() ORDER BY pid LIMIT $2`,
    [pin.writer_oid,pin.maximum_sessions+1]);
  if(rows.rows.length>pin.maximum_sessions||rows.rows.some(r=>!Number.isSafeInteger(r.pid)||r.pid<1||
    r.db_name!==pin.database_name||r.backend_type!=="client backend"))return fail();
  return rows.rows.map(r=>r.pid);
}

/** Disable one explicitly pinned writer login, terminate only its observed
 * client sessions in the pinned DB, and verify local absence. NOLOGIN commits
 * before termination so reconnect cannot race a successful return. A failed
 * or lost response leaves NOLOGIN in place; retry the SAME pin. No automatic
 * rollback/reenable is offered. Prepared transactions, cross-database or
 * excessive sessions, role memberships, or another non-superuser login able
 * to assume the role cause refusal. Any prepared transaction in the selected
 * database is rejected even if it belongs to a different or former role; a
 * complete cross-cluster census is still required. Only a separately controlled
 * operator may use this code after a complete writer/role census. */
export async function quarantineLocalWriterForRestore(pool:Pool,input:Pin):Promise<{
  state:"LOCAL_QUARANTINE_NOT_CUTOVER";writer_oid:string;terminated_sessions:number}> {
  if(!pool||!input||typeof input!=="object"||Array.isArray(input)||
    JSON.stringify(Object.keys(input).sort())!==JSON.stringify(["database_name","maximum_sessions","operator_role","system_identifier","writer_oid","writer_role"]))return fail();
  const pin=Object.freeze({...input});
  if(typeof pin.system_identifier!=="string"||typeof pin.database_name!=="string"||typeof pin.operator_role!=="string"||
    typeof pin.writer_role!=="string"||typeof pin.writer_oid!=="string"||
    !system.test(pin.system_identifier)||!name.test(pin.database_name)||!name.test(pin.operator_role)||
    !name.test(pin.writer_role)||pin.writer_role.startsWith("pg_")||pin.writer_role===pin.operator_role||
    !oid.test(pin.writer_oid)||BigInt(pin.writer_oid)>4294967295n||!Number.isSafeInteger(pin.maximum_sessions)||
    pin.maximum_sessions<1||pin.maximum_sessions>64||!pool.options||
    [pool.options.connectionTimeoutMillis,pool.options.query_timeout].some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>10000))return fail();
  const db=await pool.connect();let discard=false;
  try {
    await inspect(db,pin);
    // Refuse before modifying a role whose live use already exceeds the
    // selected scope. Repeat after disabling login to detect concurrent use.
    await sessions(db,pin);
    // The validated identifier is a strict ASCII PostgreSQL identifier; it
    // cannot contain a quote, NUL, SQL operator, or case-folding ambiguity.
    await db.query(`ALTER ROLE "${pin.writer_role}" NOLOGIN`);
    if((await inspect(db,pin)).login!==false)return fail();
    const active=await sessions(db,pin);let terminated=0;
    for(const pid of active) {
      // Recheck role, database and backend in the same query, so a reused PID
      // cannot select an unrelated user's session.
      const result=await db.query<{ended:boolean}>(`SELECT pg_terminate_backend(a.pid,5000) AS ended FROM pg_stat_activity a
        WHERE a.pid=$1 AND a.usesysid=$2::oid AND a.datname=$3 AND a.backend_type='client backend'`,
        [pid,pin.writer_oid,pin.database_name]);
      if(result.rows.length===1&&result.rows[0]?.ended===true)terminated++;
      else if(result.rows.length!==0)return fail();
    }
    if((await inspect(db,pin)).login!==false||(await sessions(db,pin)).length!==0)return fail();
    return {state:"LOCAL_QUARANTINE_NOT_CUTOVER",writer_oid:pin.writer_oid,terminated_sessions:terminated};
  } catch(error) {discard=true;throw error;} finally {db.release(discard);}
}
