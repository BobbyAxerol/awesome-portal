import {createHmac, timingSafeEqual} from "node:crypto";

/** SOURCE/TEST ONLY. This authenticates a journal event against a key held
 * outside the authority database. The caller must still independently pin
 * and protect that key. A valid MAC does not prevent rollback to an older
 * valid chain, establish an independent operator, or authorize restore. */
export type C2JournalEventBinding=Readonly<{custody_id:string;source_system_identifier:string;
  authority_system_identifier:string;operation_id:string;generation:string;event_hash:string}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const cluster=/^[0-9]{1,20}$/;
const generation=/^[1-9][0-9]{0,18}$/;
const hex=/^[a-f0-9]{64}$/;
const keyId=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fail=():never=>{throw new Error("RESTORE_CUSTODY_EVENT_AUTH_INVALID");};

export class C2JournalAuthenticatorCandidate {
  readonly #key:Buffer;
  readonly #keyId:string;
  constructor(key:Uint8Array,id:string) {
    if(!(key instanceof Uint8Array)||key.byteLength!==32||key.every(v=>v===0)||typeof id!=="string"||!keyId.test(id))
      throw new Error("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    this.#key=Buffer.from(key);this.#keyId=id;
  }
  keyId():string{return this.#keyId;}
  /** Public commitment to a high-entropy key, not the key itself. Pinning a
   * key identifier alone would permit a different key under the same name. */
  keyCommitment():string {
    return createHmac("sha256",this.#key).update("portal.c2-custody-event-auth.key-commitment.v1","utf8").digest("hex");
  }
  mac(binding:C2JournalEventBinding):string {return this.#calculate(binding);}
  #calculate(binding:C2JournalEventBinding):string {
    if(!binding||!uuid.test(binding.custody_id)||!cluster.test(binding.source_system_identifier)||
      !cluster.test(binding.authority_system_identifier)||binding.source_system_identifier===binding.authority_system_identifier||
      !uuid.test(binding.operation_id)||!generation.test(binding.generation)||
      BigInt(binding.generation)>9223372036854775807n||!hex.test(binding.event_hash))return fail();
    return createHmac("sha256",this.#key).update(JSON.stringify(["portal.c2-custody-event-auth.candidate.v1",this.#keyId,
      binding.custody_id,binding.source_system_identifier,binding.authority_system_identifier,
      binding.operation_id,binding.generation,binding.event_hash]),"utf8").digest("hex");
  }
  verify(binding:C2JournalEventBinding,id:unknown,untrusted:unknown):void {
    if(id!==this.#keyId||typeof untrusted!=="string"||!hex.test(untrusted))return fail();
    const actual=Buffer.from(untrusted,"hex"),expected=Buffer.from(this.#calculate(binding),"hex");
    try {if(!timingSafeEqual(actual,expected))return fail();}finally {actual.fill(0);expected.fill(0);}
  }
}
