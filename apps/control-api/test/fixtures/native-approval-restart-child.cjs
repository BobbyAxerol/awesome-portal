/** TEST_ONLY child for a disposable PostgreSQL + loopback mTLS component test.
 * Source facts and field policy are synthetic; no
 * installed Edge or real permission is used. Inputs travel through private IPC. */
const { createPrivateKey } = require("node:crypto");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Pool } = require("pg");
const { NativeReadEgress } = require(join(process.cwd(), "dist/execution-v2/native-read-egress"));
const { NativeCurrentRelationsSourceClient } = require(join(process.cwd(), "dist/execution-v2/native-current-relations-source-client"));
const { NativeCurrentRelationsProvider } = require(join(process.cwd(), "dist/execution-v2/native-current-relations-provider"));
const { ApprovalEvidenceNativeDelivery } = require(join(process.cwd(), "dist/approval-evidence/approval-evidence-native-delivery"));
const { AuthService } = require(join(process.cwd(), "dist/auth/auth.service"));
const { ExecutionAccessService } = require(join(process.cwd(), "dist/execution-v2/access.service"));
const { unqualifiedAccessTrust } = require(join(process.cwd(), "dist/execution-v2/access-trust"));
const { ExecutionReadScopes } = require(join(process.cwd(), "dist/execution-v2/read-scope"));
const { CurrentViewCoreComposition } = require(join(process.cwd(), "dist/execution-v2/current-view-composition"));
const { loadManagerCurrentCommissioning, withManagerCurrentPublications } = require(join(process.cwd(), "dist/execution-v2/manager-current-publication"));

process.once("message", async input => {
 const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 3 });
 try {
  const tls = Object.fromEntries(Object.entries(input.transport.tls).map(([k,v])=>[k,Buffer.from(v,"base64")]));
  const client = new NativeCurrentRelationsSourceClient({ ...input.transport, tls });
  const config = { ...input.config, terminal: { ...input.config.terminal, private_key: createPrivateKey(input.terminalPem) } };
  const egress = new NativeReadEgress({ maximum_response_bytes:65536, maximum_inflight:2, send_timeout_ms:5000, quiesce_timeout_ms:50 });
  const provider = new NativeCurrentRelationsProvider(pool, client, egress, config);
  if (input.mode === "recover") {
   await provider.recover();
   process.send?.({ type:"recovered", pid:process.pid, digest:provider.source_config_digest });
   await pool.end(); process.disconnect?.(); return;
  }
  // Use the same actual Core composition and native custody as the parent;
  // metadata, field permits and upstream publication remain TEST_ONLY.
  const { principal, selection, account, workspace, entity, currentView } = input;
  const auth = new AuthService(pool,currentView.controlConfig,{});
  const commissioning = loadManagerCurrentCommissioning(currentView.artifact,currentView.approval,Date.now());
  const trust = withManagerCurrentPublications(provider.compose(unqualifiedAccessTrust),
   async()=>structuredClone(currentView.metadata),{commissioning});
  const access = new ExecutionAccessService(pool,auth,trust,true);
  const scopes = new ExecutionReadScopes(pool,access,currentView.controlConfig);
  const core = new CurrentViewCoreComposition(auth,scopes,currentView.config);
  const currentAddress = await core.start({host:"127.0.0.1",port:0});
  const paths=["receipt_preview.what_changes","receipt_preview.counts_as.met_after","receipt_preview.counts_as.required",
   "obligations_after_approval.open_positions","obligations_after_approval.working_orders","obligations_after_approval.reservations",
   "obligations_after_approval.unknown_outcomes","obligations_after_approval.settlement_pending"];
  const proofs=Object.fromEntries(paths.map(path=>[path,{selection:0,field:"account_id",detail:false}]));
  const policy=Object.fromEntries(["receipt_preview","obligations_after_approval"].map(section=>[section,
   Object.fromEntries(paths.filter(path=>path.startsWith(`${section}.`)).map(path=>[path,{field:"account_id",detail:false}]))]));
  const qualifier={prepare:async scope=>({scope,selections:[selection],sections:["receipt_preview","obligations_after_approval"],
   fieldProofs:proofs,read:async read=>{
    const result=await read({authority:selection,resource:"accounts",query:{limit:1,max_bytes:8192,entity_id:entity}});
    const rows=JSON.parse(result.body.toString()).rows,count=rows.length;
    return {identity:{workspaceId:scope.workspaceId,approvalId:scope.approvalId},sections:{
     receipt_preview:{what_changes:rows[0].payload.account_id.value,counts_as:{met_after:count,required:count}},
     obligations_after_approval:{open_positions:count,working_orders:count,reservations:count,unknown_outcomes:count,settlement_pending:count}}};
   }}),revalidate:async()=>{},revalidateBeforeDispatch:()=>{}};
  const delivery=new ApprovalEvidenceNativeDelivery(core,qualifier,{visible:async()=>true},policy);
  const server=createServer((_req,res)=>{res.on("error",()=>{});void delivery.deliver(principal,"TEST_ONLY-approval",{workspace_id:workspace},res,()=>{})
   .catch(()=>{if(!res.destroyed)res.destroy();});});
  server.listen(0,"127.0.0.1",()=>{const address=server.address();
   if(!address||typeof address==="string")process.exit(1);
   process.send?.({type:"listening",pid:process.pid,port:address.port,currentPort:currentAddress.port,digest:provider.source_config_digest});});
 } catch (error) {
  process.send?.({type:"error",code:typeof error?.code==="string"?error.code:"TEST_ONLY_CHILD_FAILED"});
  await pool.end(); process.exitCode=1; process.disconnect?.();
 }
});
