#!/usr/bin/env node
/** Revoke only this exact cell's ephemeral principals, preserving owner/data. */
import assert from 'node:assert/strict';
import {existsSync,unlinkSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateHome,TEST_USERS} from './cell.mjs';
import {loadSessions,savePrivate} from './api-client.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full04'),'EXACT_FULL04_HOME');
const settings=Object.fromEntries(readFileSync(join(home,'preview.env'),'utf8').split('\n').filter(s=>/^[A-Z0-9_]+=/.test(s))
  .map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
assert(settings.PORTAL_STACK_NAME==='portal-research-p23-ol12'&&settings.PORTAL_HTTP_PORT==='8096','EXACT_OWNED_CELL');
const sessions=loadSessions(home);assert.equal(sessions.identities.length,22);
for(const user of sessions.identities)assert(TEST_USERS.some(u=>u.username===user.username),'FOREIGN_PRINCIPAL');
const container='portal-research-p23-ol12-control-api-1';
const invoke=(args,input)=>execFileSync('sudo',['-n','docker',...args],{input,encoding:'utf8',maxBuffer:1024*1024});
assert.equal(invoke(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container]).trim(),'portal-research-p23-ol12');
const result=JSON.parse(invoke(['exec','-i',container,'node','-e',`
const fs=require('fs'),assert=require('node:assert/strict'),{Pool}=require('pg');
const {loadConfig}=require('./dist/config'),{AuthService}=require('./dist/auth/auth.service'),
 {Argon2CredentialService}=require('./dist/auth/argon'),{AdminService}=require('./dist/admin/admin.service');
const inputs=JSON.parse(fs.readFileSync(0,'utf8')),c=loadConfig(),p=new Pool({connectionString:c.DATABASE_URL,max:1});
(async()=>{assert(c.PORTAL_ENV==='local'&&c.AUTH_MODE==='dev');
 const busy=await p.query("SELECT count(*)::int n FROM research.runs WHERE state IN ('RUNNING','SEALING')");
 assert.equal(busy.rows[0].n,0,'OWNED_CHILD_IN_FLIGHT');
 const anchor=(await p.query('SELECT user_id FROM portal_owner_anchor LIMIT 1')).rows[0]?.user_id;
 const auth=new AuthService(p,c,new Argon2CredentialService({memoryKib:c.ARGON2_MEMORY_KIB,iterations:c.ARGON2_ITERATIONS,parallelism:c.ARGON2_PARALLELISM}));
 const admin=new AdminService(p,c,auth),out=[];
 for(const user of inputs){const row=(await p.query('SELECT username,status FROM portal_users WHERE user_id=$1',[user.id])).rows[0];
  assert.equal(row.username,user.username);assert(/^p23-(owner|approver|reader-[0-9]{2})$/.test(row.username));
  if(user.id===anchor){assert.equal(user.username,'p23-owner');await admin.revokeSessions(user.id);}
  else if(row.status!=='DISABLED')await admin.disable(user.id);
  const state=(await p.query("SELECT status,(SELECT count(*)::int FROM auth_sessions WHERE user_id=$1 AND state='ACTIVE') active_sessions FROM portal_users WHERE user_id=$1",[user.id])).rows[0];
  assert.equal(state.active_sessions,0);assert(user.id===anchor||state.status==='DISABLED');
  out.push({username:user.username,status:state.status,active_sessions:0,owner_anchor_preserved:user.id===anchor});
 }
 process.stdout.write(JSON.stringify({passed:true,principals:out}));
})().finally(()=>p.end()).catch(e=>{process.stderr.write(e.name+':'+e.message);process.exitCode=1});`],
  JSON.stringify(sessions.identities.map(({id,username})=>({id,username})))));
assert.equal(result.principals.length,22);
for(const user of sessions.identities){user.cookies={};delete user.password;}
sessions.cleanup_state='DISABLED_NON_OWNER_SESSIONS_REVOKED_OWNER_ANCHOR_PRESERVED';
sessions.cleaned_at_utc=new Date().toISOString();savePrivate(join(home,'sessions.json'),sessions);
savePrivate(join(home,'identity-cleanup.json'),{project:settings.PORTAL_STACK_NAME,...result,recorded_at_utc:sessions.cleaned_at_utc});
// Consumed one-time credentials only; never delete runs, volumes or proof files.
const activation=join(home,'activation-credentials.json');if(existsSync(activation))unlinkSync(activation);
console.log(JSON.stringify({passed:true,disabled:result.principals.filter(u=>u.status==='DISABLED').length,
  active_sessions:0,owner_anchor_preserved:true,consumed_credentials_removed:true}));
