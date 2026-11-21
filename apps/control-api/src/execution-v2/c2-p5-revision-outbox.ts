import type { Pool, PoolClient } from "pg";

const MAX=9007199254740991n;
function revision(value:unknown):string {
  if (typeof value!=="string" || !/^(0|[1-9][0-9]{0,15})$/.test(value) || BigInt(value)>MAX)
    throw new Error("C2_P5_INVALID_CURSOR");
  return value;
}
/** Internal, unmounted reader of local durable intent only. No external
 * notification, acknowledgment, source authority or publication is implied.
 * Caller must supply the separately authorized control-plane/Edge boundary. */
export class C2P5RevisionOutbox {
  constructor(private readonly pool:Pool) {
    const valid=(v:unknown)=>typeof v==="number" && Number.isSafeInteger(v) && v>0 && v<=30000;
    if (!pool?.options || !valid(pool.options.connectionTimeoutMillis) || !valid(pool.options.query_timeout))
      throw new Error("C2_P5_POOL_TIMEOUTS_REQUIRED");
  }
  async read(cursor:string,limit:number) {
    const after=revision(cursor);
    if (!Number.isSafeInteger(limit) || limit<1 || limit>200) throw new Error("C2_P5_INVALID_LIMIT");
    const db:PoolClient=await this.pool.connect();let discard=false;
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout='3000ms'; SET LOCAL lock_timeout='1000ms'");
      const summary=await db.query(`SELECT b.revision::text AS baseline,a.revision::text AS head,
        b.history_availability,o.first_previous_revision::text,o.first_revision::text,o.last_revision::text,
        o.change_count::text,o.count_saturated,o.continuity_unknown,o.disposition
        FROM elp210_c2_revision_candidate.baseline b CROSS JOIN elp210_candidate.authority a
        LEFT JOIN elp210_c2_revision_candidate.overflow o ON o.singleton
        WHERE b.singleton AND a.singleton`);
      if (summary.rowCount!==1 || !summary.rows[0]) throw new Error("C2_P5_BASELINE_NOT_AVAILABLE");
      const row=summary.rows[0], baseline=revision(row.baseline),head=revision(row.head);
      if (BigInt(baseline)>BigInt(head) || row.history_availability!=="PREINSTALL_HISTORY_NOT_RECORDED")
        throw new Error("C2_P5_BASELINE_INVALID");
      if (BigInt(after)>BigInt(head)) throw new Error("C2_P5_FUTURE_CURSOR");
      const events=await db.query(`SELECT revision::text,previous_revision::text,authority_scope,reason_availability,
        to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at
        FROM elp210_c2_revision_candidate.events WHERE revision>$1::bigint ORDER BY revision LIMIT $2`,[after,limit+1]);
      const page=events.rows.slice(0,limit).map(event=>{
        const current=revision(event.revision),previous=revision(event.previous_revision);
        if (BigInt(previous)>=BigInt(current) || BigInt(current)>BigInt(head) ||
            event.authority_scope!=="GLOBAL" || event.reason_availability!=="NOT_RECORDED" ||
            typeof event.occurred_at!=="string") throw new Error("C2_P5_EVENT_INVALID");
        return {revision:current,previous_revision:previous,authority_scope:"GLOBAL" as const,
          reason_availability:"NOT_RECORDED" as const,occurred_at:event.occurred_at};
      });
      let overflow:null|{first_previous_revision:string;first_revision:string;last_revision:string;
        change_count:string;count_saturated:boolean;continuity_unknown:boolean;disposition:"REVISION_DETAIL_OVERFLOW_NOT_DELIVERED"}=null;
      if (row.disposition!==null) {
        if(row.disposition!=="REVISION_DETAIL_OVERFLOW_NOT_DELIVERED" || typeof row.count_saturated!=="boolean" ||
          typeof row.continuity_unknown!=="boolean" || !/^[1-9][0-9]{0,18}$/.test(row.change_count))
          throw new Error("C2_P5_OVERFLOW_INVALID");
        overflow={first_previous_revision:revision(row.first_previous_revision),first_revision:revision(row.first_revision),
          last_revision:revision(row.last_revision),change_count:row.change_count,count_saturated:row.count_saturated,
          continuity_unknown:row.continuity_unknown,disposition:row.disposition};
        if(BigInt(overflow.first_previous_revision)>=BigInt(overflow.first_revision) ||
          BigInt(overflow.first_previous_revision)<BigInt(baseline) ||
          BigInt(overflow.first_revision)>BigInt(overflow.last_revision) || BigInt(overflow.last_revision)!==BigInt(head))
          throw new Error("C2_P5_OVERFLOW_INVALID");
      } else if (row.first_previous_revision!=null || row.first_revision!=null || row.last_revision!=null ||
          row.change_count!=null || row.count_saturated!=null || row.continuity_unknown!=null) {
        throw new Error("C2_P5_OVERFLOW_INVALID");
      }
      // A bounded page is not evidence of complete history merely because
      // each individual row is valid. Fail closed on missing/reordered rows,
      // a cursor inside a revision jump, or detail overlapping the overflow
      // range. Earlier-than-baseline history remains explicitly NOT_RECORDED.
      let through=BigInt(after)>BigInt(baseline)?BigInt(after):BigInt(baseline);
      for (const event of page) {
        if(BigInt(event.previous_revision)!==through ||
           (overflow!==null && BigInt(event.revision)>BigInt(overflow.first_previous_revision)))
          throw new Error("C2_P5_HISTORY_DISCONTINUITY");
        through=BigInt(event.revision);
      }
      if(events.rows.length<=limit && through<BigInt(head) &&
         (overflow===null || through<BigInt(overflow.first_previous_revision)))
        throw new Error("C2_P5_HISTORY_DISCONTINUITY");
      await db.query("COMMIT");
      return {state:"LOCAL_INTENT_NOT_DELIVERED" as const,baseline_revision:baseline,head_revision:head,
        history_availability:"PREINSTALL_HISTORY_NOT_RECORDED" as const,events:page,
        next_cursor:events.rows.length>limit?page.at(-1)!.revision:null,overflow};
    } catch(error) {try {await db.query("ROLLBACK");} catch {discard=true;} throw error;}
    finally {db.release(discard);}
  }
}
