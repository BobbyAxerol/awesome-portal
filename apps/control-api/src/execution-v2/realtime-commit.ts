import type { Pool } from "pg";
import { persistManagerProjection,type PreparedManagerProjection } from "./manager-model.store";

/** Reuse the existing immutable revision+head transaction. This is a LOCAL
 * projection commit acknowledgement, not a Trading System event/retention ACK.
 * ACK failure/lost response never rolls back the already committed projection;
 * a duplicate CURRENT revision may safely acknowledge the same receipt again. */
export async function commitManagerProjectionThenAcknowledge(pool:Pool,input:PreparedManagerProjection,
  acknowledge:(receipt:{revision:string;digest:string})=>Promise<void>){
  const client=await pool.connect();let committed=false;
  let result:Awaited<ReturnType<typeof persistManagerProjection>>;
  try{
    await client.query("BEGIN");
    result=await persistManagerProjection(client,input);
    await client.query("COMMIT");committed=true;
  }catch(error){if(!committed)await client.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{client.release();}
  // Never hold a read-pool connection while an external ACK is pending.
  await acknowledge({revision:result.revision,digest:result.digest});
  return{...result,acknowledged:true as const};
}
