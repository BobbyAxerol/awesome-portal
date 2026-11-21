/* TEST_ONLY: reconstruct C2 STATUS in a distinct process against exactly the
 * dedicated two-PG cell. Synthetic keys/facts arrive only over private IPC.
 * No listener, upstream command, real source grant, or ACK is created. */
require("reflect-metadata");
const { createJiti } = require("jiti");
const { Pool } = require("pg");
const jiti = createJiti(__filename, { fsCache: false });
const { AuthService } = jiti("../../src/auth/auth.service.ts");
const { loadConfig } = jiti("../../src/config.ts");
const { ExecutionAccessService } = jiti("../../src/execution-v2/access.service.ts");
const { createC2P7RegisteredSourceCandidate } = jiti("../../src/execution-v2/c2-p7-registered-source-candidate.ts");
const { C2P7OwnerConfirmationVerifier } = jiti("../../src/execution-v2/c2-p7-owner-confirmation-proof.ts");
const { C2P7IssuerFenceCandidate } = jiti("../../src/execution-v2/c2-p7-issuer-fence-candidate.ts");
const { RestoreIndependentCustodyCandidate } = jiti("../../src/execution-v2/restore-independent-custody-candidate.ts");
const { C2SourceProofVault } = jiti("../../src/execution-v2/restore-c2-source-proof-vault.ts");
const { C2JournalAuthenticatorCandidate } = jiti("../../src/execution-v2/restore-c2-journal-authenticator-candidate.ts");
const { createC2CommandStatusInnerCandidate } = jiti("../../src/execution-v2/c2-command-status-inner-candidate.ts");
const { CurrentHumanCandidate } = jiti("../../src/execution-v2/current-human-candidate.ts");
const { C2FinancialOriginalCandidate } = jiti("../../src/execution-v2/c2-financial-original-candidate.ts");
const { C2CustodiedIssuerCandidate } = jiti("../../src/execution-v2/c2-custodied-issuer-candidate.ts");
const { C2FinancialOriginalRecoveryCandidate } = jiti("../../src/execution-v2/c2-financial-original-recovery-candidate.ts");
const { C2FinancialAuthorityAdapter } = jiti("../../src/execution-v2/c2-financial-authority-adapter.ts");
const { C2FinancialDurableInnerCandidate } = jiti("../../src/execution-v2/c2-financial-durable-inner-candidate.ts");
const { C2FinancialParentCandidate } = jiti("../../src/execution-v2/c2-financial-parent-candidate.ts");
const { C2FinancialParentOrchestratorCandidate } = jiti("../../src/execution-v2/c2-financial-parent-orchestrator-candidate.ts");
const { accessDigest } = jiti("../../src/execution-v2/access-digest.ts");
let started = false;
process.on("message", async message => {
  if (started) return;
  started = true;
  let pool, authority, assembly, financialAuthority;
  try {
    if (!["RECOVER","RECOVER_FINANCIAL","ISSUE_FINANCIAL_AUTHORITY"].includes(message?.type) ||
        process.env.C2_P7_TEST_DISPOSABLE !== "TEST_ONLY_C2_P7_DEDICATED_DATABASE")
      throw Error("TEST_ONLY_GUARD");
    const source = new URL(message.database), independent = new URL(message.authorityDatabase);
    const match = /^elp2-c2-p7-pg-([a-f0-9]{8})$/.exec(source.hostname);
    if (!match || independent.hostname !== `elp2-c2-p7-authority-${match[1]}` ||
        source.pathname !== `/portal_c2_p7_${match[1]}` || independent.pathname !== source.pathname ||
        [source,independent].some(u => u.protocol !== "postgres:" || u.username !== "portal" || u.search || u.hash))
      throw Error("TEST_ONLY_GUARD");
    const { importPKCS8, importSPKI } = await import("jose");
    const privateKey = await importPKCS8(message.humanPrivate, "EdDSA");
    const humanPublic = await importSPKI(message.humanPublic, "EdDSA");
    const sourcePublic = await importSPKI(message.sourcePublic, "EdDSA");
    const options = {max:3,connectionTimeoutMillis:5000,query_timeout:10000};
    pool = new Pool({...options,connectionString:message.database});
    authority = new Pool({...options,connectionString:message.authorityDatabase});
    const auth = new AuthService(pool,loadConfig({PORTAL_ENV:"local",AUTH_MODE:"dev",DATABASE_URL:"postgres://TEST_ONLY/TEST_ONLY_core"}),{});
    const relation = message.relation;
    const trust = {verifyPolicy:async()=>null,verifyReceipt:async()=>null,
      relations:async()=>({qualified:true,revision:"TEST_ONLY:current-observation",own_alpha_ids:[],
        member_portfolio_ids:["paper-portfolio-g1"],roots:{},membership:null,current_authority:relation}),
      verifiedHumanMapping:async()=>({ts_user_id:relation.ts_user_id,revision:relation.mapping_revision})};
    const access = new ExecutionAccessService(pool,auth,trust,true);
    const registered = createC2P7RegisteredSourceCandidate(message.registration,message.registrationPublic,message.registrationPin);
    const verifier = new C2P7OwnerConfirmationVerifier(message.witnessPublic,message.witnessPin);
    const fence = new C2P7IssuerFenceCandidate(registered,"TEST_ONLY-key",message.cycle,message.b1,
      Buffer.from(message.sourceProof,"base64"),{verifier,proof:Buffer.from(message.witnessProof,"base64"),
        issued_at_ms:message.witnessIssued,expires_at_ms:message.witnessExpires});
    const custody = new RestoreIndependentCustodyCandidate(pool,authority,{...message.custody,
      source_proof_vault:new C2SourceProofVault(Buffer.from(message.vaultKey,"base64"),"TEST_ONLY-key"),
      journal_authenticator:new C2JournalAuthenticatorCandidate(Buffer.from(message.journalKey,"base64"),"TEST_ONLY-journal-key"),
      original:{...message.custody.original,public_key:humanPublic},source:{...message.custody.source,public_key:sourcePublic}});
    if(message.type==="ISSUE_FINANCIAL_AUTHORITY") {
      const issuer=await CurrentHumanCandidate.create(pool,
        {...message.issuer,private_key:privateKey,source:{...message.issuer.source,public_key:sourcePublic}});
      const writer=new C2CustodiedIssuerCandidate(issuer,custody,fence);
      const adapter=new C2FinancialAuthorityAdapter(issuer,writer,{owner:message.owner,
        workspace:message.selection.workspace_id,workload:message.selection.workload_id,paths:message.selection.paths});
      const recovery=new C2FinancialOriginalRecoveryCandidate(new C2FinancialOriginalCandidate(pool,8),writer);
      const inner=new C2FinancialDurableInnerCandidate(adapter,recovery,writer,{owner:message.owner,
        receiver_id:message.selection.receiver_id,binding_digest:message.selection.binding_digest});
      const parentStore=new C2FinancialParentCandidate(authority,Buffer.from(message.parentKey,"base64"),"TEST_ONLY-parent-key",8);
      financialAuthority=new C2FinancialParentOrchestratorCandidate(parentStore,inner,
        {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
      await financialAuthority.begin(message.parentRef,message.actor,message.selection);
      const result=await financialAuthority.issue(message.parentRef,message.actor,message.selection,message.request);
      // TEST_ONLY IPC: send neither private context, lease nor assertion.
      process.send?.({type:"FINANCIAL_AUTHORITY_ISSUED",parent_ref:message.parentRef,
        assertion_digest:accessDigest(result.assertion)});
      // Parent deliberately terminates this TEST_ONLY issuer after receiving
      // its private locator. Keep the process and DB pools alive until then.
      if(message.hold_after_issued===true)await new Promise(()=>{});
      return;
    }
    if(message.type==="RECOVER_FINANCIAL") {
      const issuer=await CurrentHumanCandidate.create(pool,
        {...message.issuer,private_key:privateKey,source:{...message.issuer.source,public_key:sourcePublic}});
      const recovery=new C2FinancialOriginalRecoveryCandidate(new C2FinancialOriginalCandidate(pool,4),
        new C2CustodiedIssuerCandidate(issuer,custody,fence));
      const request={method:"POST",raw_path:Buffer.from(message.path,"utf8"),query_string:Buffer.alloc(0),body:Buffer.from(message.body,"utf8")};
      const result=await recovery.recover(message.actor,message.owner,request,{request_bytes:1048576},message.context,message.input);
      process.send?.({type:"FINANCIAL_RECOVERED",lease_id:result.lease_id,assertion_digest:accessDigest(result.token)});
      return;
    }
    assembly = await createC2CommandStatusInnerCandidate(pool,access,
      {...message.issuer,private_key:privateKey,source:{...message.issuer.source,public_key:sourcePublic}},
      {...message.statusAuthority,key:privateKey},message.owner,custody,fence);
    assembly.authority.bindRecoverySource({original:async()=>structuredClone(message.original)},message.contract);
    const result=await assembly.authority.issue(message.context,message.request);
    process.send?.({type:"RECOVERED",result});
  } catch (error) {
    // Do not print input, assertion, token or synthetic key material.
    process.send?.({type:"REFUSED",code:typeof error?.code==="string"?error.code:"TEST_ONLY_RECOVERY_FAILED"});
  } finally {
    assembly?.authority.shutdown();
    financialAuthority?.shutdown();
    await Promise.allSettled([pool?.end(),authority?.end()]);
    process.disconnect?.();
  }
});
