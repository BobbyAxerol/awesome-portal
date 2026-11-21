import { createHash } from "node:crypto";
import { z } from "zod";
import { inspectPinnedC2B1NotAuthorized } from "./c2-b1-preflight";
import { assembleC2B2DryRun, type C2B2DryRunPortalFields } from "./c2-b2-dry-run";
import { C2B2PreparationCustody, type C2B2Plan } from "./c2-b2-custody";
import { inspectC2P8PublicKey, type C2P8PublicPins } from "./c2-p8-public-key";

const hex=z.string().regex(/^[0-9a-f]{64}$/);
const approvedScope=["paper-portfolio-g1","paper-root-g1"];
const sha=(input:Uint8Array)=>createHash("sha256").update(input).digest("hex");
const refuse=():never=>{throw new Error("C2_B2_PREFLIGHT_REFUSED");};

/**
 * Unmounted offline preparation only. No source/A2/P7 proof is accepted here,
 * and no method of this wrapper can reserve, sign, or make a publication.
 * The bytes are a preview, not a genuine public publication: portal fields,
 * signer ownership and release authority remain unverified. Only planning
 * custody is written; never pass its PREPARED state to a signer.
 *
 * Before any future release, an independently verified and held source fence,
 * current owner/P7 delegation, A2 acceptance, actual C2_SEALED, P8 ownership,
 * and a cancel-safe one-shot signer must be commissioned. The underlying
 * custody verifier is also unmounted and cannot yet guarantee that fence.
 */
export class C2B2PublicationPreflight {
  constructor(private readonly custody:C2B2PreparationCustody) {
    if (!(custody instanceof C2B2PreparationCustody)) refuse();
  }
  /** Optional stronger offline preparation: require exact selected public
   * bytes and a matching SPKI before recording the preview plan. It does not
   * authorize the signer, validate A2, or release/sign a publication. */
  async prepareWithPublicSigner(input:{b1_bytes:Uint8Array;b1_sha256:string;cycle_sha256:string;
    signer_owner_ref_sha256:string;portal_fields:C2B2DryRunPortalFields;
    signer_jwk_bytes:Uint8Array;signer_pins:C2P8PublicPins}) {
    const key=inspectC2P8PublicKey(input.signer_jwk_bytes,input.signer_pins);
    const result=await this.prepare({b1_bytes:input.b1_bytes,b1_sha256:input.b1_sha256,
      cycle_sha256:input.cycle_sha256,signer_spki_sha256:key.signer_spki_sha256,
      signer_owner_ref_sha256:input.signer_owner_ref_sha256,portal_fields:input.portal_fields});
    return Object.freeze({...result,public_signer:key});
  }
  async prepare(input:{b1_bytes:Uint8Array;b1_sha256:string;cycle_sha256:string;
    signer_spki_sha256:string;signer_owner_ref_sha256:string;portal_fields:C2B2DryRunPortalFields}):Promise<{
      state:"PREPARED_NOT_AUTHORIZED"; b1_sha256:string; payload_sha256:string; preview_ascii:string }> {
    if (!hex.safeParse(input.cycle_sha256).success || !hex.safeParse(input.signer_spki_sha256).success ||
        !hex.safeParse(input.signer_owner_ref_sha256).success) return refuse();
    // B1 is checked and copied before the first await. Only the separately
    // approved two Paper scopes and READ/HISTORY are eligible even for preview.
    if (!(input.b1_bytes instanceof Uint8Array) || input.b1_bytes.byteLength>131072) return refuse();
    const b1Bytes=Buffer.from(input.b1_bytes),pin=input.b1_sha256;
    const b1=inspectPinnedC2B1NotAuthorized(b1Bytes,pin), d=b1.acceptance.document;
    if (JSON.stringify([...d.operations].sort())!==JSON.stringify(["HISTORY","READ"]) ||
        JSON.stringify(d.scopes.map(s=>s.portfolio_id).sort())!==JSON.stringify(approvedScope)) return refuse();
    const assembled=assembleC2B2DryRun(b1Bytes,pin,input.portal_fields);
    const bytes=Buffer.from(assembled.canonical_payload_ascii,"ascii"),payloadSha=sha(bytes);
    const plan:C2B2Plan={cycle_sha256:input.cycle_sha256,b1_sha256:pin,payload_sha256:payloadSha,
      signer_spki_sha256:input.signer_spki_sha256,signer_owner_ref_sha256:input.signer_owner_ref_sha256};
    const result=await this.custody.prepare(plan);
    if (result.state!=="PREPARED_NOT_AUTHORIZED") return refuse();
    return {state:"PREPARED_NOT_AUTHORIZED",b1_sha256:pin,payload_sha256:payloadSha,
      preview_ascii:assembled.canonical_payload_ascii};
  }
}
