import {RestoreIndependentCustodyCandidate} from "./restore-independent-custody-candidate";

/** UNMOUNTED candidate. Only retry a known transaction conflict; a lost or
 * ambiguous commit is deliberately not retried here. Each retry rechecks the
 * original source proof and reuses the identical custody operation ID. This
 * neither retries ENTER nor proves a source ACK or an external fence. */
const inventory=RestoreIndependentCustodyCandidate.prototype.inventory;
const append=RestoreIndependentCustodyCandidate.prototype.append;
type Kind="ISSUED_HUMAN_ASSERTION"|"SIGNED_SOURCE_ENTER"|"SIGNED_SOURCE_UNKNOWN"|"SIGNED_SOURCE_TERMINAL";
const delays=[10,30] as const;
function isKnownConflict(error:unknown):boolean {
  return error instanceof Error && (error.message==="RESTORE_CUSTODY_GENERATION_CONFLICT" ||
    ("code" in error && typeof error.code==="string" && ["40001","40P01","55P03"].includes(error.code)));
}
export async function appendCustodiedOriginal(custody:RestoreIndependentCustodyCandidate,
  kind:Kind,operationId:string,proof:string):Promise<void> {
  if(!custody||Object.getPrototypeOf(custody)!==RestoreIndependentCustodyCandidate.prototype)
    throw new Error("RESTORE_CUSTODY_CONFIG_INVALID");
  for(let attempt=0;;attempt++) {
    try {
      const snapshot=await inventory.call(custody);
      const existing=snapshot.events.find(event=>event.operation_id===operationId);
      const expected=existing?(BigInt(existing.generation)-1n).toString():snapshot.generation;
      await append.call(custody,kind,operationId,expected,proof);
      return;
    } catch(error) {
      if(attempt>=delays.length||!isKnownConflict(error))throw error;
      await new Promise<void>(resolve=>setTimeout(resolve,delays[attempt]));
    }
  }
}
