#!/usr/bin/env node
'use strict';
// PRIVATE Research-only operator harness. Parent MUST review descriptor/image,
// offline schema receipt, old-writer retirement and exact WG port publishing.
// Never run with a public IPC mount, production config, TEST_ONLY keys or logger.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
process.umask(0o077);
const fail = code => { const e = new Error(code); e.safeCode = code; throw e; };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = bytes => `sha256:${sha(bytes)}`;
const bounded = (n, low, high) => Number.isSafeInteger(n) && n >= low && n <= high;
let startupCleanup = async()=>false;
function privateDir(name) {
  if (!path.isAbsolute(name) || fs.realpathSync(name) !== name) fail('PRIVATE_DIRECTORY_REQUIRED');
  const s = fs.lstatSync(name);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.geteuid() || s.mode & 0o077) fail('PRIVATE_DIRECTORY_REQUIRED');
}
function privateBytes(name, max = 32768) {
  privateDir(path.dirname(name));
  const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const s = fs.fstatSync(fd);
    if (!s.isFile() || s.nlink !== 1 || s.uid !== process.geteuid() || s.mode & 0o077 || s.size < 1 || s.size > max) fail('PRIVATE_FILE_REQUIRED');
    const out = Buffer.alloc(s.size + 1), n = fs.readSync(fd, out, 0, out.length, 0), after = fs.fstatSync(fd);
    if (n !== s.size || after.size !== s.size || after.mtimeMs !== s.mtimeMs || after.ctimeMs !== s.ctimeMs) fail('PRIVATE_FILE_CHANGED');
    return out.subarray(0, n);
  } finally { fs.closeSync(fd); }
}
async function main() {
  if (process.argv.length !== 4 || !/^[a-f0-9]{64}$/.test(process.argv[3])) fail('DESCRIPTOR_ARGUMENT_REQUIRED');
  const raw = privateBytes(process.argv[2], 65536);
  if (sha(raw) !== process.argv[3]) fail('DESCRIPTOR_PIN_MISMATCH');
  const d = JSON.parse(raw.toString('utf8')); raw.fill(0);
  if (!exact(d, ['schema_version','module_root','target','pool_profile','trust','human_issuer',
    'installation_expires_at_ms','candidate_limits','mutation_limits','callback','recovery','ipc_path','state_path','app']) ||
    d.schema_version !== 'portal.research-reverse-bootstrap.v1' || d.human_issuer !== 'portal-control-api.native-manager-read' ||
    !path.isAbsolute(d.module_root) || fs.realpathSync(d.module_root) !== d.module_root ||
    !exact(d.trust, ['directory','sha256','candidate_id']) || !/^[a-f0-9]{64}$/.test(d.trust.sha256) ||
    !exact(d.callback, ['bind','port','maximum_in_flight','request_bytes','deadline_ms','wireguard_publish_host']) ||
    d.callback.wireguard_publish_host !== '10.70.0.1' || !['0.0.0.0','10.70.0.1'].includes(d.callback.bind) ||
    !bounded(d.callback.port,1024,65535) || !exact(d.app,['bind','port']) ||
    !['127.0.0.1','0.0.0.0'].includes(d.app.bind) || !bounded(d.app.port,1024,65535) ||
    !exact(d.recovery,['origin','deadline_ms','response_bytes'])) fail('DESCRIPTOR_INVALID');
  privateDir(path.dirname(d.ipc_path)); privateDir(path.dirname(d.state_path));
  if (fs.existsSync(d.ipc_path) || !path.isAbsolute(d.ipc_path) || d.ipc_path.length > 100 ||
    !path.isAbsolute(d.state_path) || d.state_path === d.ipc_path) fail('IPC_PATH_NOT_EXCLUSIVE');
  let record = fs.existsSync(d.state_path) ? JSON.parse(privateBytes(d.state_path,4096).toString('utf8')) : {state:'READY'};
  if (!['READY','ISSUING','SESSION','ISSUED','LOGOUT','FINISHED'].includes(record.state) ||
    record.descriptor_sha256 && record.descriptor_sha256 !== process.argv[3]) fail('STATE_REVIEW_REQUIRED');
  let session, app, callback, ipc, registered=false, constructionStarted=false, busy=false, closing=false, shutdownDrain;
  const req = createRequire(path.join(d.module_root, 'app.js'));
  req('reflect-metadata');
  req('@nestjs/common').Logger.overrideLogger(false); // no raw dependency errors/route logs
  const { loadConfig } = req('./config.js');
  const config = loadConfig();
  if (config.AUTH_MODE !== 'dev' || config.PORTAL_ENV !== 'local' ||
    config.EXECUTION_READ_PROFILE !== 'retained_review_v1' || config.PREVIEW_AUTO_LOGIN_USERNAME !== 'claude-preview' ||
    !config.EXECUTION_DATABASE_URL || config.EXECUTION_DATABASE_URL === config.DATABASE_URL) fail('RESEARCH_CONFIG_REQUIRED');
  const { nativeCoreSchemaTarget, assertRegisteredResearchCurrentHumanSchema } = req('./execution-v2/current-human-schema.js');
  const target = nativeCoreSchemaTarget.parse(d.target);
  if (target.database_system_identifier !== '7688673963308855330' ||
    target.protected_owner_user_id !== 'usr_5a38d5dfb08b44748f5776fbe04a1434' ||
    target.workspace_id !== 'ws_06G19F61YB8CFR7TEWMS7HQ660' ||
    target.principal_workspace_pins[0].user_id !== target.protected_owner_user_id ||
    config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID !== target.workspace_id) fail('RESEARCH_TARGET_REQUIRED');
  privateDir(d.trust.directory);
  const trustRaw = privateBytes(path.join(d.trust.directory, 'trust.json'));
  if (sha(trustRaw) !== d.trust.sha256) fail('TRUST_PIN_MISMATCH');
  const { candidateTrustManifest } = req('./execution-v2/current-human-installation.js');
  const trust = candidateTrustManifest.parse(JSON.parse(trustRaw.toString('utf8'))); trustRaw.fill(0);
  const now = Date.now();
  if (trust.candidate_id !== d.trust.candidate_id || trust.workspace_id !== target.workspace_id ||
    trust.created_at_ms > now || trust.expires_at_ms <= now ||
    !bounded(d.installation_expires_at_ms,now + 1000,trust.expires_at_ms) ||
    d.installation_expires_at_ms > now + 86400000) fail('TRUST_SCOPE_INVALID');
  const read = name => privateBytes(path.join(d.trust.directory,name));
  const caRaw = read('ca.pem'), certRaw = read('tls.crt.pem'), tlsKeyRaw = read('tls.key.pem');
  const ownRaw = read('signer.key.pem'), ownPubRaw = read('signer.pub.pem');
  const peerRaw = read('peer-tls.crt.pem'), peerPubRaw = read('peer-signer.pub.pem');
  const ca = new crypto.X509Certificate(caRaw), cert = new crypto.X509Certificate(certRaw), peer = new crypto.X509Certificate(peerRaw);
  const pub = k => crypto.createPublicKey(k).export({type:'spki',format:'der'});
  const directPub = k => k.export({type:'spki',format:'der'});
  const ownKey = crypto.createPrivateKey(ownRaw), tlsKey = crypto.createPrivateKey(tlsKeyRaw);
  const ownPub = crypto.createPublicKey(ownPubRaw), peerPub = crypto.createPublicKey(peerPubRaw);
  if (!ca.ca || !ca.verify(ca.publicKey) || cert.ca || peer.ca || !cert.checkIssued(ca) || !peer.checkIssued(ca) ||
    !cert.verify(ca.publicKey) || !peer.verify(ca.publicKey) || digest(ca.raw) !== trust.ca_certificate_sha256 ||
    digest(cert.raw) !== trust.core.certificate_sha256 || digest(peer.raw) !== trust.pm.certificate_sha256 ||
    cert.checkHost(trust.core.hostname) !== trust.core.hostname || peer.checkHost(trust.pm.hostname) !== trust.pm.hostname ||
    !pub(tlsKey).equals(directPub(cert.publicKey)) || !pub(ownKey).equals(directPub(ownPub)) ||
    digest(directPub(ownPub)) !== trust.core.signer_spki_sha256 || digest(directPub(peerPub)) !== trust.pm.signer_spki_sha256 ||
    [ownKey,tlsKey,peerPub].some(k=>k.asymmetricKeyType !== 'ed25519')) fail('TRUST_CRYPTO_INVALID');
  for (const c of [ca,cert,peer]) if (Date.parse(c.validFrom) > now || Date.parse(c.validTo) < d.installation_expires_at_ms) fail('TRUST_EXPIRED');
  for (const c of [cert,peer]) if (!c.keyUsage?.includes('1.3.6.1.5.5.7.3.1') || !c.keyUsage.includes('1.3.6.1.5.5.7.3.2')) fail('TRUST_USAGE_INVALID');
  if (new Set([ca.publicKey,cert.publicKey,peer.publicKey,ownPub,peerPub].map(k=>directPub(k).toString('hex'))).size !== 5) fail('TRUST_KEYS_NOT_DISTINCT');
  const origin = new URL(d.recovery.origin);
  if (origin.hostname !== trust.pm.hostname) fail('RECOVERY_HOSTNAME_REQUIRED');
  const { importPKCS8, importSPKI } = req('jose');
  const private_key = await importPKCS8(ownRaw.toString('utf8'),'EdDSA'); ownRaw.fill(0);
  const sourceKey = await importSPKI(peerPubRaw.toString('utf8'),'EdDSA');
  const { buildPool } = req('./db/pool.js');
  const pool = buildPool(config.DATABASE_URL,d.pool_profile);
  startupCleanup = async()=>{
    if (session || !['READY','FINISHED'].includes(record.state) || constructionStarted && !app || callback?.snapshot().in_flight) return false;
    if (registered && Number((await pool.query('SELECT count(*)::int AS n FROM elp210_candidate.obligations WHERE unresolved')).rows[0].n)) return false;
    for (const server of [ipc,callback?.server]) if (server?.listening) await new Promise((ok,bad)=>server.close(e=>e?bad(e):ok()));
    if (app) await app.close(); // module closes its OWN Execution pool, never injected Core
    await pool.end(); return true; // caller-owned Core last, only after successful app close
  };
  // Constructor/target validation precedes listeners; NO DDL or SQL user/session seeds.
  await assertRegisteredResearchCurrentHumanSchema(pool,target); registered=true;
  const { CurrentHumanCandidate } = req('./execution-v2/current-human-candidate.js');
  const candidate = await CurrentHumanCandidate.create(pool,{issuer:d.human_issuer,audience:trust.pm.issuer,
    key_id:trust.core.key_id,private_key,source:{issuer:trust.pm.issuer,audience:d.human_issuer,
      key_id:trust.pm.key_id,public_key:sourceKey,workload_id:trust.pm.workload_id},limits:d.candidate_limits,
    installation_scope:{workspace_id:target.workspace_id,environment:'paper',valid_until_ms:d.installation_expires_at_ms}});
  if (typeof candidate.finishUnusedIdentityDrain!=='function') fail('UNUSED_IDENTITY_FINISH_MODULE_REQUIRED');
  const tls = {ca:caRaw,cert:certRaw,key:tlsKeyRaw};
  const { CurrentHumanRecoveryClient } = req('./execution-v2/current-human-recovery-client.js');
  const recovery = new CurrentHumanRecoveryClient({...d.recovery,tls,source_certificate_sha256:trust.pm.certificate_sha256});
  const { CurrentHumanMutations } = req('./execution-v2/current-human-mutations.js');
  const mutations = new CurrentHumanMutations(pool,candidate,recovery,d.mutation_limits);
  const { createCurrentHumanTransport } = req('./execution-v2/current-human-transport.js');
  callback = createCurrentHumanTransport(candidate,{tls,source_certificate_sha256:trust.pm.certificate_sha256,
    limits:{maximum_in_flight:d.callback.maximum_in_flight,request_bytes:d.callback.request_bytes,deadline_ms:d.callback.deadline_ms}});
  // Same app.ts wiring, but retain actual handle BEFORE init/plugin awaits;
  // private abortOnError:false avoids Nest exiting before owner cleanup.
  const {NestFactory}=req('@nestjs/core'), {FastifyAdapter}=req('@nestjs/platform-fastify');
  const {AppModule}=req('./app.module.js'), {HttpErrorFilter}=req('./http-error.filter.js');
  constructionStarted=true;
  app=await NestFactory.create(AppModule.register(config,pool,undefined,{currentHumanMutations:mutations}),
    new FastifyAdapter({trustProxy:true}),{logger:false,abortOnError:false});
  app.useGlobalFilters(new HttpErrorFilter());
  app.getHttpAdapter().getInstance().addContentTypeParser('multipart/form-data',{parseAs:'buffer'},(_,body,done)=>done(null,body));
  const cookie=req('@fastify/cookie'), rateLimit=req('@fastify/rate-limit');
  await app.register(cookie.default??cookie);
  await app.register(rateLimit.default??rateLimit,{max:20,timeWindow:'1 minute',global:false});
  await app.init(); await app.getHttpAdapter().getInstance().ready();
  const { AuthService } = req('./auth/auth.service.js'), { Argon2CredentialService } = req('./auth/argon.js');
  const auth = new AuthService(pool,{...config,PREVIEW_AUTO_LOGIN_USERNAME:'bobby',SESSION_IDLE_SECONDS:180,SESSION_ABSOLUTE_SECONDS:300},
    new Argon2CredentialService({memoryKib:config.ARGON2_MEMORY_KIB,iterations:config.ARGON2_ITERATIONS,parallelism:config.ARGON2_PARALLELISM}),mutations);
  const save = next => {
    const tmp = `${d.state_path}.new-${crypto.randomUUID()}`;
    const fd = fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    try { fs.writeFileSync(fd,JSON.stringify({...next,descriptor_sha256:process.argv[3]})); fs.fsyncSync(fd); } finally {fs.closeSync(fd);}
    fs.renameSync(tmp,d.state_path);
    const directoryFd = fs.openSync(path.dirname(d.state_path),fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
    try {fs.fsyncSync(directoryFd);} finally {fs.closeSync(directoryFd);} record = next;
  };
  const unresolved = async()=>Number((await pool.query('SELECT count(*)::int AS n FROM elp210_candidate.obligations WHERE unresolved')).rows[0].n);
  const ownedTerminal = async()=>{
    if (!record.lease_id) return null;
    const r = (await pool.query(`SELECT phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.leases
      WHERE lease_id=$1 AND subject_id=$2 AND session_id=$3 AND session_revision=$4 AND workspace_id=$5
      AND environment='paper' AND workload_id=$6 AND request_digest=$7`,[record.lease_id,target.protected_owner_user_id,
      record.session_id,record.session_revision,target.workspace_id,trust.pm.workload_id,record.request_digest])).rows[0];
    if (!r) return null;
    if (['COMMITTED','ROLLED_BACK'].includes(r.phase) && /^sha256:[a-f0-9]{64}$/.test(r.terminal_receipt_digest)) return r.phase;
    if (r.phase !== 'RETIRED' || r.attempt_id !== null || r.terminal_receipt_digest !== null) return null;
    const facts=(await pool.query(`SELECT attempt_id,terminal_receipt_digest FROM elp210_candidate.events
      WHERE lease_id=$1 AND phase='SOURCE_ROLLED_BACK_UNENTERED' ORDER BY event_id LIMIT 2`,[record.lease_id])).rows;
    return facts.length===1 && typeof facts[0].attempt_id==='string' && facts[0].attempt_id.length>0 &&
      /^sha256:[a-f0-9]{64}$/.test(facts[0].terminal_receipt_digest) ? 'SOURCE_ROLLED_BACK_UNENTERED' : null;
  };
  // Trusted local witness only, sampled synchronously by the candidate while
  // its committed all-family drain/authority fence is held. This is not a
  // claim that a listener can never receive another denied callback.
  const assertUnusedCallbacks = () => {
    const counters=callback.snapshot(), names=['in_flight','accepted','denied','timed_out'];
    if (!exact(counters,names) || names.some(name=>!bounded(counters[name],0,0))) fail('UNUSED_CALLBACK_WITNESS_REQUIRED');
  };
  const { pmHttpRequestDigest } = req('./execution-v2/pm-http-request-binding.js');
  async function command(input) {
    if (!exact(input,['command']) || !['status','issue-identity','finish','shutdown'].includes(input.command)) fail('IPC_COMMAND_INVALID');
    if (input.command === 'status') return {state:record.state,cookie_lost:!session && !['READY','FINISHED'].includes(record.state),
      unresolved:await unresolved(),terminal:await ownedTerminal(),callback:callback.snapshot()};
    if (input.command === 'issue-identity') {
      if (record.state !== 'READY' || record.shutdown_drain_id || session || closing || await unresolved()) fail('ISSUANCE_NOT_AVAILABLE');
      const user = await auth.users.findByUsername('bobby');
      if (!user || user.userId !== target.protected_owner_user_id || user.status !== 'ACTIVE' || user.archivedAt || user.mustChangePassword) fail('BOBBY_CURRENT_REQUIRED');
      save({state:'ISSUING'}); session = await auth.previewAutoSession(undefined);
      if (!session) fail('BOBBY_PREVIEW_UNAVAILABLE');
      save({state:'SESSION',session_id:session.sessionId,identity_issue_started:false});
      const stored = await auth.sessionFromToken(session.token);
      if (!stored || stored.state !== 'ACTIVE' || stored.userId !== user.userId || stored.sessionId !== session.sessionId || stored.sessionVersion !== user.sessionVersion) fail('SESSION_CHANGED');
      const body = Buffer.from(JSON.stringify({schema_version:'pma.current-human-identity-request.v1',request_id:crypto.randomUUID()}));
      const request_digest = pmHttpRequestDigest({method:'POST',raw_path:Buffer.from('/internal/elp210/current-human/identity'),query_string:Buffer.alloc(0),body},{request_bytes:4096});
      // The actual issue() transaction captures current user/session/workspace,
      // generation and membership/owner before persisting/signing the lease.
      // Persist BEFORE issue can commit. A lost internal issue ACK or failed
      // original-record save must never look like a known pre-issue session.
      save({...record,identity_issue_started:true});
      const proof = await candidate.issue({user_id:stored.userId,session_id:stored.sessionId,session_generation:stored.sessionVersion},
        {workspace_id:target.workspace_id,environment:'paper',workload_id:trust.pm.workload_id,request_digest});
      // Capture the revision returned by the original committed issue, never
      // reconstruct it from the current authority or parse/reissue a token.
      if (!bounded(proof.authority_revision,0,Number.MAX_SAFE_INTEGER)) fail('ISSUED_ORIGINAL_REVISION_REQUIRED');
      save({state:'ISSUED',session_id:session.sessionId,session_revision:stored.sessionVersion,lease_id:proof.lease_id,
        authority_revision:proof.authority_revision,request_digest});
      return {state:'ISSUED',human_token:proof.token,raw_request_base64:body.toString('base64'),lease_id:proof.lease_id,expires_at_ms:proof.expires_at_ms};
    }
    if (input.command === 'finish') {
      if (record.state === 'FINISHED') return {state:'FINISHED'};
      if (!session) fail(record.state === 'READY' ? 'NO_SESSION_ISSUED' : 'COOKIE_LOST_ONE_VIEW_REVIEW_REQUIRED');
      if (record.state !== 'LOGOUT') {
        // Missing original identity facts are not an unused lease proof.
        // Only an explicitly persisted never-started SESSION may skip it.
        if (!record.lease_id && (record.state!=='SESSION' || record.identity_issue_started!==false))
          fail('UNUSED_IDENTITY_ORIGINAL_REQUIRED');
        if (!record.finish_drain_id) save({...record,finish_drain_id:crypto.randomUUID()});
        const drain=await candidate.beginDrain(record.finish_drain_id);
        // Unused ISSUED is retired by genuine Core API, NOT accepted as source proof.
        for (const a of (await candidate.recoverableAttempts()).slice(0,d.mutation_limits.maximum_recoveries_per_request)) await recovery.recover(a);
        if (await unresolved()) fail('SOURCE_TERMINAL_REQUIRED');
        const terminal=await ownedTerminal();
        if (record.lease_id && !terminal) {
          // Old ISSUED records lacking original revision remain custody for
          // review; no SQL reconstruction, new identity or source rollback.
          if (record.state!=='ISSUED' || record.session_id!==session.sessionId ||
            !bounded(record.session_revision,0,Number.MAX_SAFE_INTEGER) ||
            !bounded(record.authority_revision,0,Number.MAX_SAFE_INTEGER)) fail('UNUSED_IDENTITY_ORIGINAL_REQUIRED');
          await candidate.finishUnusedIdentityDrain(record.finish_drain_id,drain.authority_revision,{
            lease_id:record.lease_id,authority_revision:record.authority_revision,
            actor:{user_id:target.protected_owner_user_id,session_id:record.session_id,session_generation:record.session_revision},
            binding:{workspace_id:target.workspace_id,environment:'paper',workload_id:trust.pm.workload_id,
              request_digest:record.request_digest}
          },assertUnusedCallbacks);
        } else {
          await candidate.endDrain(record.finish_drain_id,drain.authority_revision);
        }
        save({...record,state:'LOGOUT'}); // exact logout owns its own durable drain/retry
      }
      await auth.logout(session.token);
      const row = await auth.sessionFromToken(session.token);
      if (!row || row.state !== 'REVOKED' || row.sessionId !== session.sessionId) fail('EXACT_REVOCATION_NOT_PROVEN');
      save({...record,state:'FINISHED'}); session = undefined;
      return {state:'FINISHED'};
    }
    if (!['READY','FINISHED'].includes(record.state) || session || await unresolved() || callback.snapshot().in_flight) fail('CUSTODY_NOT_SETTLED');
    if (!record.shutdown_drain_id) save({...record,shutdown_drain_id:crypto.randomUUID()});
    shutdownDrain=await candidate.beginDrain(record.shutdown_drain_id);
    if (shutdownDrain.status!=='DRAIN_READY' || callback.snapshot().in_flight) fail('CUSTODY_NOT_SETTLED');
    closing = true; return {state:'SHUTDOWN_READY'};
  }
  const sockets = new Set();
  ipc = net.createServer(socket=>{
    sockets.add(socket); socket.once('close',()=>sockets.delete(socket)); socket.setTimeout(3000,()=>socket.destroy());
    let bytes = 0, chunks = [], dispatched = false;
    socket.on('error',()=>{});
    socket.on('data',chunk=>{
      bytes += chunk.length;
      if (dispatched || bytes > 1024) {socket.destroy();return;}
      chunks.push(chunk); const data = Buffer.concat(chunks), newline = data.indexOf(10);
      if (newline < 0) return;
      dispatched = true;
      if (newline !== data.length-1 || busy || closing) {socket.end('{"error":"IPC_BUSY_OR_INVALID"}\n');return;}
      busy = true; socket.setTimeout(30000,()=>socket.destroy());
      void (async()=>{
        try {const value = await command(JSON.parse(data.subarray(0,newline).toString('utf8')));
          socket.end(`${JSON.stringify(value)}\n`);
          if (value.state === 'SHUTDOWN_READY') socket.once('close',()=>void stop());
        } catch(e) {socket.end(`${JSON.stringify({error:e.safeCode || 'BOOTSTRAP_OPERATION_REFUSED'})}\n`);}
        finally {busy=false; chunks=[];}
      })();
    });
  });
  ipc.maxConnections=2; // private operator transport remains bounded while busy
  async function stop() {
    try {
      if (!closing || session || await unresolved() || callback.snapshot().in_flight) fail('CUSTODY_NOT_SETTLED');
      await new Promise((ok,bad)=>callback.server.close(e=>e?bad(e):ok()));
      await new Promise((ok,bad)=>ipc.close(e=>e?bad(e):ok()));
      await app.close(); // closes owned domain pool; injected Core remains caller-owned
      await candidate.endDrain(shutdownDrain.drain_id,shutdownDrain.authority_revision);
      await pool.end(); tlsKeyRaw.fill(0);
      // Node unlinks its own Unix listener; never remove an unverified stale path.
    } catch {process.stderr.write('BOOTSTRAP_SHUTDOWN_NOT_SETTLED\n');}
  }
  await new Promise((ok,bad)=>{callback.server.once('error',bad);callback.server.listen(d.callback.port,d.callback.bind,ok);});
  await app.listen(d.app.port,d.app.bind);
  await new Promise((ok,bad)=>{ipc.once('error',bad);ipc.listen(d.ipc_path,ok);}); await fsp.chmod(d.ipc_path,0o600);
  // Signals do not forge logout or discard UNKNOWN source custody.
  for (const sig of ['SIGINT','SIGTERM']) process.on(sig,()=>{process.stderr.write('BOOTSTRAP_USE_PRIVATE_FINISH_THEN_SHUTDOWN\n');});
  process.stderr.write('BOOTSTRAP_READY_PRIVATE_IPC\n');
}
main().catch(async()=>{
  let cleaned=false; try {cleaned=await startupCleanup();} catch { /* preserve unknown custody */ }
  process.stderr.write(cleaned?'BOOTSTRAP_STARTUP_REFUSED_OWNED_RESOURCES_CLOSED\n':'BOOTSTRAP_STARTUP_REFUSED_REVIEW_CUSTODY\n');
  process.exitCode=1;
});
