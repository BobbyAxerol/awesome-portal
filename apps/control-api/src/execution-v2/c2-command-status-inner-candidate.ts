import {createHash,createPublicKey} from "node:crypto";
import {exportJWK} from "jose";
import type {Pool} from "pg";
import {ExecutionAccessService} from "./access.service";
import {CurrentHumanCandidate,type CurrentHumanCandidateConfig} from "./current-human-candidate";
import {RestoreIndependentCustodyCandidate} from "./restore-independent-custody-candidate";
import {C2P7IssuerFenceCandidate} from "./c2-p7-issuer-fence-candidate";
import {C2CustodiedIssuerCandidate} from "./c2-custodied-issuer-candidate";
import {C2CustodiedTerminalCandidate} from "./c2-custodied-terminal-candidate";
import {C2CommandStatusAuthorityAdapter} from "./c2-command-status-authority-adapter";
import {CommandSourceAssertionAuthority,type CommandStatusAuthorityConfig} from "./command-source-assertion";

/** Unmounted inner assembly only. It binds the actual STATUS authority and
 * terminal to one candidate, P7 fence and authenticated custody selection.
 * It deliberately provides no listener, HTTP-delivery fence, source
 * registration qualification, restore authority or runtime activation. */
export async function createC2CommandStatusInnerCandidate(pool:Pool,access:ExecutionAccessService,
  untrusted:CurrentHumanCandidateConfig,untrustedAuthority:CommandStatusAuthorityConfig,
  owner:string,custody:RestoreIndependentCustodyCandidate,p7:C2P7IssuerFenceCandidate) {
  const fail=():never=>{throw new Error("C2_STATUS_INNER_CONFIG_INVALID");};
  // The STATUS authority calls both methods through CurrentOperationalReads.
  // A duck-typed usesPool alone does not establish the Core access boundary.
  // This assembly check does not qualify the installed trust provider or
  // protect a mutable service against later in-process tampering.
  const hasCoreAccess=()=>!!access&&Object.getPrototypeOf(access)===ExecutionAccessService.prototype&&
    access.usesPool===ExecutionAccessService.prototype.usesPool&&
    access.readContext===ExecutionAccessService.prototype.readContext&&
    access.confirmReadContext===ExecutionAccessService.prototype.confirmReadContext&&
    ExecutionAccessService.prototype.usesPool.call(access,pool);
  if(!untrusted?.installation_scope||!untrusted.source||!untrusted.limits||!untrustedAuthority||
    typeof owner!=="string"||!owner||owner.length>128||owner.trim()!==owner||/[\u0000-\u001f\u007f-\u009f]/u.test(owner)||
    untrusted.installation_scope.environment!=="paper"||untrusted.c2_delivery_schema_required!==true||
    untrusted.native_read_custody!==undefined||!Number.isSafeInteger(untrusted.installation_scope.valid_until_ms)||
    untrusted.installation_scope.valid_until_ms<=Date.now()||untrustedAuthority.workload_id!==untrusted.source.workload_id||
    !hasCoreAccess()||!custody||Object.getPrototypeOf(custody)!==RestoreIndependentCustodyCandidate.prototype||
    !RestoreIndependentCustodyCandidate.prototype.usesSourcePool.call(custody,pool)||
    !RestoreIndependentCustodyCandidate.prototype.hasSourceProofVault.call(custody)||
    !RestoreIndependentCustodyCandidate.prototype.hasAuthenticatedJournal.call(custody)||
    !p7||Object.getPrototypeOf(p7)!==C2P7IssuerFenceCandidate.prototype||
    p7.checkLocked!==C2P7IssuerFenceCandidate.prototype.checkLocked||
    p7.checkAuthenticatedLocked!==C2P7IssuerFenceCandidate.prototype.checkAuthenticatedLocked||
    p7.confirmationKeySha256!==C2P7IssuerFenceCandidate.prototype.confirmationKeySha256||
    !untrusted.c2_owner_confirmation_spki_sha256||
    C2P7IssuerFenceCandidate.prototype.confirmationKeySha256.call(p7)!==untrusted.c2_owner_confirmation_spki_sha256)
    return fail();
  // Capture everything mutable before asynchronous key export/candidate setup.
  const selected:CurrentHumanCandidateConfig={...untrusted,source:{...untrusted.source},limits:{...untrusted.limits},
    installation_scope:{...untrusted.installation_scope}};
  const authorityConfig={...untrustedAuthority};
  const [own,source]=await Promise.all([exportJWK(selected.private_key),exportJWK(selected.source.public_key)]);
  if(own.kty!=="OKP"||own.crv!=="Ed25519"||typeof own.d!=="string"||typeof own.x!=="string"||
    source.kty!=="OKP"||source.crv!=="Ed25519"||source.d!==undefined||typeof source.x!=="string"||own.x===source.x)
    return fail();
  const spki=(x:string)=>createHash("sha256").update(createPublicKey({key:{kty:"OKP",crv:"Ed25519",x},format:"jwk"})
    .export({type:"spki",format:"der"})).digest("hex");
  const matches=()=>RestoreIndependentCustodyCandidate.prototype.matchesSelection.call(custody,{
    workspace_id:selected.installation_scope!.workspace_id,workload_id:selected.source.workload_id,owner,
    original:{issuer:selected.issuer,audience:selected.audience,key_id:selected.key_id,spki_sha256:spki(own.x!)},
    source:{issuer:selected.source.issuer,audience:selected.source.audience,key_id:selected.source.key_id,spki_sha256:spki(source.x!)} });
  if(!matches())return fail();
  const candidate=await CurrentHumanCandidate.create(pool,selected);
  if(selected.installation_scope!.valid_until_ms<=Date.now()||!hasCoreAccess()||!matches()||
    p7.checkLocked!==C2P7IssuerFenceCandidate.prototype.checkLocked||
    p7.checkAuthenticatedLocked!==C2P7IssuerFenceCandidate.prototype.checkAuthenticatedLocked||
    p7.confirmationKeySha256!==C2P7IssuerFenceCandidate.prototype.confirmationKeySha256||
    C2P7IssuerFenceCandidate.prototype.confirmationKeySha256.call(p7)!==selected.c2_owner_confirmation_spki_sha256)return fail();
  const writer=new C2CustodiedIssuerCandidate(candidate,custody,p7);
  const adapter=new C2CommandStatusAuthorityAdapter(candidate,writer,{owner,workspace:selected.installation_scope!.workspace_id,
    workload:selected.source.workload_id});
  const terminal=new C2CustodiedTerminalCandidate(pool,candidate,custody,p7);
  const authority=new CommandSourceAssertionAuthority(pool,access,adapter,authorityConfig);
  return Object.freeze({candidate,adapter,terminal,authority});
}
