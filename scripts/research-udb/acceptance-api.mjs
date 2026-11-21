/** Private real-API clients for UDB04; never a browser contract or grant. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readBoundedJson} from '../research-p23/api-client.mjs';
import {ORIGIN,PROJECT,privateWrite,readPrivate,inControl,coreQuery} from './acceptance-cell.mjs';

export async function safeReadFetch(url,options,fetchFn=fetch){
  try{return await fetchFn(url,options);}catch(error){
    // nginx's graceful reload can close a previously idle keep-alive socket.
    // One transport-only retry for reads, never HTTP refusals or mutations.
    if(!['GET','HEAD'].includes(options.method)||error?.cause?.code!=='UND_ERR_SOCKET')throw error;
    return fetchFn(url,{...options,headers:{...options.headers,connection:'close'}});
  }
}
export function client(user){
  const jar=new Map(Object.entries(user.cookies??{}));
  return {user,async call(method,path,body,statuses=[200],extra={}){
    assert(path.startsWith('/api/')&&new URL(path,ORIGIN).origin===ORIGIN);
    const r=await safeReadFetch(ORIGIN+path,{method,redirect:'manual',signal:AbortSignal.timeout(45000),headers:{
      accept:'application/json','content-type':'application/json',origin:ORIGIN,
      'x-dev-access-email':`${user.username}@azdag.com`,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),
      ...(method!=='GET'?{'x-portal-csrf':jar.get('__Host-portal_csrf')??''}:{}),...extra},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
    user.cookies=Object.fromEntries(jar);const json=await readBoundedJson(r);
    assert(statuses.includes(r.status),`API:${method}:${path}:${r.status}:${json.error?.code??'REFUSED'}`);
    return {status:r.status,body:json};
  }};
}
export const authSetup=`
const assert=require('node:assert/strict'),{Pool}=require('pg'),{loadConfig}=require('./dist/config'),
 {AuthService}=require('./dist/auth/auth.service'),{Argon2CredentialService}=require('./dist/auth/argon'),
 {AdminService}=require('./dist/admin/admin.service');
const p=new Pool({connectionString:process.env.DATABASE_URL,max:1}),cfg=loadConfig();
const auth=new AuthService(p,cfg,new Argon2CredentialService({memoryKib:cfg.ARGON2_MEMORY_KIB,
 iterations:cfg.ARGON2_ITERATIONS,parallelism:cfg.ARGON2_PARALLELISM})),admin=new AdminService(p,cfg,auth);
`;
export async function prepare(){
  const users=[{username:'udb04-operator',role:'ADMIN'},
    ...Array.from({length:20},(_,i)=>({username:'udb04-reader-'+String(i+1).padStart(2,'0'),role:'USER'})),
    {username:'udb04-disabled',role:'USER'},{username:'udb04-revoked',role:'USER'}];
  assert.equal(coreQuery("SELECT count(*)::int n FROM portal_users WHERE username LIKE 'udb04-%'").rows[0].n,0,'CREATE_TEST_NAMES_ONCE');
  const activation=inControl(authSetup+`
let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',async()=>{
 try{const entries=JSON.parse(input),out=[];for(const entry of entries){assert(entry.username.startsWith('udb04-'));
 const u=await admin.createUser({username:entry.username,displayName:'UDB04 test '+entry.username,role:entry.role});
 out.push({...u,activation:(await admin.resetCredential(u.userId)).activationToken});}console.log(JSON.stringify(out));}
 finally{await p.end();}});`,JSON.stringify(users));
  privateWrite('activations.json',activation);
  const sessions={project:PROJECT,at_utc:new Date().toISOString(),identities:[]};privateWrite('sessions.json',sessions);
  for(const created of activation){
    const u={username:created.username,id:created.userId,password:'UDB04!'+randomBytes(24).toString('hex'),cookies:{}};
    const c=client(u);await c.call('POST','/api/auth/login',{username:u.username,credential:created.activation},[201]);
    await c.call('POST','/api/auth/change-password',{current_password:created.activation,new_password:u.password},[201]);
    await c.call('POST','/api/auth/login',{username:u.username,credential:u.password},[201]);
    const ctx=(await c.call('GET','/api/auth/context')).body;assert.equal(ctx.principal.principalId,u.id);
    sessions.identities.push(u);privateWrite('sessions.json',sessions);
  }
  // Existing immutable owner/reviewer: ordinary preview sessions, NOT a
  // password reset or owner step-up. Public auto-login remains OFF in this cell.
  const operators=inControl(authSetup+`
(async()=>{try{const out=[];for(const username of ['bobby','claude-preview']){
 const a=new AuthService(p,{...cfg,PREVIEW_AUTO_LOGIN_USERNAME:username},auth.argon??new Argon2CredentialService({
 memoryKib:cfg.ARGON2_MEMORY_KIB,iterations:cfg.ARGON2_ITERATIONS,parallelism:cfg.ARGON2_PARALLELISM}));
 const s=await a.previewAutoSession(username+'@azdag.com');assert(s);
 const u=await a.users.findByUsername(username);out.push({username,id:u.userId,session_id:s.sessionId,
 cookies:{'__Host-portal_session':s.token,'__Host-portal_csrf':s.csrfToken}});}console.log(JSON.stringify(out));}
 finally{await p.end();}})();`);
  sessions.identities.push(...operators);privateWrite('sessions.json',sessions);
  console.log('UDB04:23 new isolated accounts authenticated normally; original owner/reviewer credentials unchanged.');
}
export function sessions(){const s=readPrivate('sessions.json');assert.equal(s.project,PROJECT);return s;}
export function namedClient(username){const u=sessions().identities.find(u=>u.username===username);assert(u);return client(u);}
export async function refreshSessions(){
  const s=sessions();
  for(const u of s.identities){
    if(u.username.startsWith('udb04-')){
      if(['udb04-disabled','udb04-revoked'].includes(u.username))continue;
      const c=client(u),ctx=await c.call('GET','/api/auth/context',undefined,[200,401]);
      if(ctx.status===401||ctx.body.state!=='AUTHENTICATED')
        await c.call('POST','/api/auth/login',{username:u.username,credential:u.password},[201]);
    }else{
      assert(['bobby','claude-preview'].includes(u.username));
      await client(u).call('POST','/api/auth/logout',{},[201,401]);
      const fresh=inControl(authSetup+`(async()=>{try{const a=new AuthService(p,{...cfg,PREVIEW_AUTO_LOGIN_USERNAME:'${u.username}'},
        new Argon2CredentialService({memoryKib:cfg.ARGON2_MEMORY_KIB,iterations:cfg.ARGON2_ITERATIONS,parallelism:cfg.ARGON2_PARALLELISM}));
        const s=await a.previewAutoSession('${u.username}@azdag.com');assert(s);console.log(JSON.stringify(s));}finally{await p.end();}})();`);
      u.session_id=fresh.sessionId;u.cookies={'__Host-portal_session':fresh.token,'__Host-portal_csrf':fresh.csrfToken};
    }
    privateWrite('sessions.json',s);
  }
  console.log('Owned test sessions renewed normally; no original credential reset or privilege change.');
}
