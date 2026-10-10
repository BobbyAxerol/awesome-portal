#!/usr/bin/env node
/** Diagnostic only, never an SLO receipt; profiler stays inside the owned cell. */
import {spawn} from 'node:child_process';
import {readPrivate,privateWrite,owned} from './acceptance-cell.mjs';
import {sessions} from './acceptance-api.mjs';
import {readLoad} from './acceptance-load.mjs';
const remote=`(async()=>{const target=(await(await fetch('http://127.0.0.1:9229/json')).json())[0];
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let seq=0;const pending=new Map();ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id){pending.get(v.id)?.(v);pending.delete(v.id);}});
const send=method=>new Promise(r=>{const id=++seq;pending.set(id,r);ws.send(JSON.stringify({id,method}));});
await send('Profiler.enable');await send('Profiler.start');console.error('READY');
process.stdin.resume();await new Promise(r=>process.stdin.once('data',r));
const result=await send('Profiler.stop');await send('Profiler.disable');ws.close();console.log(JSON.stringify(result.result.profile));})();`;
const child=spawn('sudo',['-n','docker','exec','-i',owned('control-api'),'node','-e',remote]);
let output='';child.stdout.on('data',b=>output+=b);const ready=new Promise((resolve,reject)=>{
child.stderr.on('data',b=>{if(String(b).includes('READY'))resolve();});child.on('error',reject);});
const end=new Promise((resolve,reject)=>{child.on('close',c=>c===0?resolve():reject(new Error('OWNED_PROFILE_FAILED')));});
await ready;const input=readPrivate('mixed-load.json'),paths=Object.keys(input.load.by_path);
let load;try{load=await readLoad(paths,sessions().identities.filter(u=>/^udb04-reader-/.test(u.username)),2);}
finally{child.stdin.end('stop');await end;}
const profile=JSON.parse(output);privateWrite('control-cpu-profile.json',profile);
const weights=new Map();for(let i=0;i<profile.samples.length;i++){const id=profile.samples[i];weights.set(id,(weights.get(id)??0)+profile.timeDeltas[i]);}
const top=profile.nodes.map(n=>({name:n.callFrame.functionName,file:n.callFrame.url,line:n.callFrame.lineNumber+1,
milliseconds:Math.round((weights.get(n.id)??0)/1000)})).sort((a,b)=>b.milliseconds-a.milliseconds).slice(0,30);
privateWrite('cpu-diagnostic.json',{top,load,qualification:false});console.log(JSON.stringify({top,paths:load.by_path}));
