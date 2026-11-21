/* Decision cockpit module (from concept C4). Tokens only: no hex, no color-mix, no serif. One lane per decision kind. */
(function(){
var CSS=".ck{display:grid;grid-template-columns:268px minmax(0,1fr) 316px;gap:16px;align-items:start}"
+"@media(max-width:1360px){.ck{grid-template-columns:268px minmax(0,1fr)}.ck .rail{grid-column:1/3;position:static;grid-template-columns:1fr 1fr}}"
+"@media(max-width:900px){.ck{grid-template-columns:1fr}.ck .rail{grid-column:1;grid-template-columns:1fr}}"
+".ck .q{padding:0}.ck .q .ph{margin:0}.lanes{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-bottom:1px solid var(--line)}"
+".lanes button{background:var(--paper);color:var(--ink-soft);border:1px solid var(--line-strong);padding:1px 7px;font:500 10.5px/16px var(--font-mono);letter-spacing:.04em;cursor:pointer}.lanes button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent);border-color:var(--accent)}"
+".qi{display:block;width:100%;text-align:left;background:var(--panel);border:0;border-bottom:1px solid var(--line);border-left:3px solid transparent;padding:10px 12px;cursor:pointer;font:inherit;color:inherit}.qi:hover{background:var(--cell)}.qi[aria-selected=true]{background:var(--accent-soft);border-left-color:var(--accent)}.qi.done{opacity:.6}"
+".qt{display:flex;gap:8px;align-items:center}.qt b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kd{font:500 10px/16px var(--font-mono);letter-spacing:.08em;border:1px solid var(--ink-soft);padding:0 5px;color:var(--ink);white-space:nowrap}"
+".qm{font:400 11px/16px var(--font-mono);color:var(--ink-faint);margin-top:2px}.qf{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 2px}"
+".keys{display:flex;gap:4px 12px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid var(--line-strong);background:var(--sunken);font:400 11px/16px var(--font-mono);color:var(--ink-soft)}"
+".idc{font:500 11px/16px var(--font-mono);border:1px solid var(--line-strong);padding:0 5px;background:var(--paper);white-space:nowrap}"
+".ladder{display:flex;flex-wrap:wrap;gap:2px 10px;font:400 12px/18px var(--font-mono);color:var(--ink-faint);margin:6px 0 4px}.ladder .on{color:var(--ink);border-bottom:2px solid var(--accent)}.ladder .ok{color:var(--ink-soft)}"
+".meta{font:400 12px/16px var(--font-mono);color:var(--ink-soft);display:flex;gap:4px 14px;flex-wrap:wrap;align-items:center}"
+".vd{--c:var(--accent);border:1px solid var(--line-strong);border-left:4px solid var(--c);background:var(--panel);padding:12px 16px}.vd.warn{--c:var(--warn)}.vd.bad{--c:var(--bad)}.vd.mute{--c:var(--ink-faint)}.vd h2{margin:0 0 4px;font:500 18px/26px var(--font-sans)}"
+".meter{display:flex;gap:3px;margin-top:8px;align-items:center}.meter i{height:8px;width:30px;background:var(--accent)}.meter i.w{background:var(--warn)}.meter i.x{background:var(--bad)}.meter span{font:500 12px/16px var(--font-mono);margin-right:6px}"
+".evg{display:grid;gap:16px}.ck .panel.flush{padding:0}.ck .panel.flush .ph{margin:0}.ck .pad{padding:12px 16px}"
+"details.d{border:1px solid var(--line-strong);background:var(--panel)}details.d>summary{padding:9px 16px;background:var(--sunken);font:500 11px/16px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft);list-style:none}details.d>div{padding:8px 16px 12px}"
+".cl{margin:0;padding:0;list-style:none}.cl li{padding:6px 0;border-bottom:1px solid var(--line);display:flex;gap:10px}.cl b{font-family:var(--font-mono);width:14px}.cl .w b{color:var(--warn)}"
+".rail{position:sticky;top:96px;display:grid;gap:12px}.rail .panel{padding:0}.rail .ph{margin:0}.rail .bd{padding:12px 14px;display:grid;gap:10px}"
+".sod{font-size:12px;line-height:18px}.sod.no{color:var(--bad)}.quo{display:flex;align-items:center;gap:8px;font:400 12px/16px var(--font-mono);color:var(--ink-soft)}.quo i{width:18px;height:10px;border:1px solid var(--ink-soft);display:inline-block}.quo i.f{background:var(--ink-soft)}"
+".lb{font:500 11px/16px var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}"
+".ck textarea{width:100%;font:400 13px/18px var(--font-sans);color:var(--ink);background:var(--paper);border:1px solid var(--line-strong);padding:8px 10px;resize:vertical;min-height:56px}.ck textarea:focus-visible{outline:2px solid var(--accent);outline-offset:1px}"
+".acts{display:flex;gap:8px;flex-wrap:wrap;position:relative}.acts .pri{flex:1;min-width:120px}"
+".menu{position:absolute;right:0;top:100%;margin-top:4px;background:var(--panel);border:1px solid var(--line-strong);z-index:8;min-width:230px;display:none}.menu.on{display:block}.menu button{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);padding:8px 12px;color:var(--ink);font:400 13px/18px var(--font-sans);cursor:pointer}.menu button:hover{background:var(--cell)}"
+".stp{border:1px solid var(--line-strong);border-left:3px solid var(--f-approval);padding:8px 10px;display:grid;gap:6px;font-size:12px}.stp.passed{border-left-color:var(--f-ok)}.stp.failed,.stp.expired{border-left-color:var(--bad)}"
+".rc{border:1px dashed var(--ink-soft);background:var(--panel)}.rc.rec{border:1px solid var(--f-applied);border-left:4px solid var(--f-applied)}.rc.dim{opacity:.6}.rc .rh{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line);font:500 11px/16px var(--font-mono);letter-spacing:.12em;text-transform:uppercase}"
+".rc td{height:26px;padding:3px 12px;border-bottom:1px solid var(--line);white-space:normal}.rc td:first-child{color:var(--ink-faint);font:400 11px/16px var(--font-mono);text-transform:uppercase;letter-spacing:.06em;width:34%}"
+".help{position:fixed;inset:0;background:var(--paper);opacity:.96;display:none;place-items:center;z-index:45}.help.on{display:grid}.help .panel{width:360px;padding:0}.help .ph{margin:0}"
+".kbd2{font:500 11px/16px var(--font-mono);border:1px solid var(--line-strong);padding:0 5px;background:var(--paper)}"
+".ck .chart .rd{padding-bottom:22px}";
var st=document.createElement("style");st.textContent=CSS;document.head.appendChild(st);
function esc(s){return String(s).replace(/[&<>]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;"}[c]})}
var ME={manager:"Bobby",reviewer:"Minh",operator:"Lan",researcher:"Stan"};
var MORE={cond:"Approve with a condition",changes:"Request changes",deny:"Deny",extend:"Extend",close:"Close",withdraw:"Withdraw",approve:"Approve"};
var STD=[["cond","Approve with a condition"],["changes","Request changes"],["deny","Deny"]];
var K={
 r1:{lane:"R1 gate",tag:"R1",need:2,prim:["approve","Approve"],menu:STD,effect:"Creates the research approval for this release candidate",ladder:"R1"},
 r2:{lane:"R2 gate",tag:"R2",need:2,step:1,prim:["approve","Approve"],menu:STD,effect:"Grants Paper activation only · nothing is executed",ladder:"R2"},
 exit:{lane:"Exit review",tag:"EXIT",need:1,prim:["approve","Approve promotion"],menu:[["extend","Extend observation 14 days"],["deny","Hold at current stage"]],effect:"Promotes to the next stage · no external effect",extend:"Observation extended by 14 days",ladder:"Paper"},
 live:{lane:"Live gate",tag:"LIVE",need:2,step:1,closed:1,prim:["approve","Approve"],menu:[],effect:"Promotes to Live",ladder:"Live"},
 archive:{lane:"Archive request",tag:"ARCHIVE",need:1,prim:["approve","Approve archive"],menu:[["changes","Request changes"],["deny","Deny"]],effect:"Archives the alpha · open obligations stay until drained"},
 react:{lane:"Reactivation review",tag:"REVIEW",need:1,prim:["approve","Approve review"],menu:[["changes","Request changes"],["deny","Deny"]],effect:"Opens a Paper review · never goes live by itself"},
 cap:{lane:"Capital approval",tag:"CAPITAL",need:2,step:1,prim:["approve","Approve command"],menu:STD,effect:"Releases the command for sending · no money moves here"},
 waiver:{lane:"Waiver",tag:"WAIVER",need:1,prim:["extend","Extend 14 days"],menu:[["close","Close · condition met"],["deny","Let it lapse"]],effect:"Extends the waiver by 14 days",extend:"Waiver extended by 14 days"}
};
var LANES=[["all","All"],["r1","R1"],["r2","R2"],["exit","Exit"],["live","Live"],["archive","Archive"],["react","Reactivation"],["cap","Capital"],["waiver","Waiver"]];
var RQ=[
 {id:"AP-352",k:"r2",short:"Carry v3.2 → PF-MAIN",title:"Operational readiness · Carry v3.2 → PF-MAIN",ctx:"Sandbox · OKX testnet",slaMin:-120,sla:"overdue 2h",pct:100,have:0,author:"Lan",blocker:"Broker sync is stale (14 m)",vt:"Blocked · broker sync is stale",vk:"bad",sc:"4/5",mt:"oooox",links:[["Carry v3.2","alpha.html"],["PF-MAIN","portfolio.html"]]},
 {id:"AP-410",k:"live",short:"Carry v3.2 → PF-MAIN",title:"Live promotion · Carry v3.2 → PF-MAIN",ctx:"Canary → Live",slaMin:360,sla:"6h left",pct:60,have:1,author:"Bobby",vt:"Evidence ready · Live decisions are closed",vk:"mute",sc:"4/5",mt:"ooooow",links:[["Carry v3.2","alpha.html"],["live-0192","deployment.html"]]},
 {id:"AR-77",k:"archive",short:"BTC-Trend v3",title:"Archive request · BTC-Trend v3",ctx:"Requested by Stan · was Live",slaMin:600,sla:"10h left",pct:35,have:0,author:"Stan",vt:"Can be approved · 2 obligations stay open",vk:"warn",sc:"3/4",mt:"oooow",links:[["BTC-Trend v3","alpha.html"]]},
 {id:"AP-201",k:"r1",short:"RSI v1.7 · RC-41",title:"Research evidence approval · RSI v1.7",ctx:"Release candidate RC-41",slaMin:1320,sla:"22h left",pct:8,have:0,author:"Minh",vt:"Can be approved · 1 warning suggests a condition",vk:"warn",sc:"5/6",mt:"oooooow",links:[["RSI v1.7","alpha.html"]]},
 {id:"CP-31",k:"cap",short:"Core · top up",title:"Top up · Portfolio Core",ctx:"Command from Lan",slaMin:1800,sla:"30h left",pct:20,have:0,author:"Lan",vt:"Can be approved · capacity proof not published",vk:"warn",sc:"3/4",mt:"oooow",links:[["Core","portfolio.html"]]},
 {id:"RA-12",k:"react",short:"SOL-Break v1",title:"Reactivation review · SOL-Break v1",ctx:"Target stage Paper · started by Bobby",slaMin:2400,sla:"40h left",pct:10,have:0,author:"Bobby",vt:"Evidence ready · 48 d of paper monitor",vk:"",sc:"4/4",mt:"oooo",links:[["SOL-Break v1","alpha.html"]]},
 {id:"EX-771",k:"exit",short:"Grid v2.1 · Paper exit",title:"Paper exit · Grid v2.1 · Deribit",ctx:"Deribit · Paper → Sandbox",slaMin:2640,sla:"44h left",pct:8,have:0,author:"Lan",vt:"Gate met · ready to promote to Sandbox",vk:"",sc:"6/7",mt:"ooooooow",links:[["Grid v2.1","alpha.html"],["dep_94","deployment.html"]]},
 {id:"WV-9",k:"waiver",short:"Grid v2.1 · daily-loss cap",title:"Waiver · daily-loss cap −3.0% while canary runs",ctx:"Grid v2.1 · risk profile rev 12",slaMin:2700,sla:"lapses in 1d 21h",pct:96,have:0,author:"Minh",vt:"Expiring · decide before it lapses",vk:"warn",sc:"",mt:"",links:[["Grid v2.1","alpha.html"]]}
];
RQ.sort(function(a,b){return a.slaMin-b.slaMin});
var MY=[["AR-77","Archive request","BTC-Trend v3","Awaiting approval","pending","0 of 1","10h left",1],["AP-201","R1 gate","RSI v1.7","Awaiting approval","pending","0 of 2","22h left",1],["RA-12","Reactivation suggestion","SOL-Break v1","Suggested to a manager","approval","Not applicable","No clock",0],["AP-188","R1 gate","Grid v2.1","Approved","applied","2 of 2","Decided 17 Oct 09:12Z",0]];
var S={sel:"AP-201",lane:"all",mode:null,rec:{},wd:{},step:"required",menu:0,my:{}};
function me(){return ME[KIT.state.role]}function nq(){return KIT.state.data==="nq"}
function idc(t,h){return'<a class="idc" href="'+(h||"approvals.html")+'">'+esc(t)+'</a>'}
function fl(k,t){return KIT.flag(k,t)}
function dis(label,key,cls){return KIT.WHY[key]?KIT.disabled(label,key,cls):'<button class="btn '+(cls||"")+'" disabled>'+esc(label)+'</button>'+KIT.why(key,false)}
function list(){return RQ.filter(function(r){return S.lane==="all"||r.k===S.lane})}
function cur(){var l=list();return RQ.filter(function(r){return r.id===S.sel})[0]||l[0]}
function ver(r){var d=S.rec[r.id];return d?d:null}
function can(r){var k=K[r.k],o={ap:{ok:1},vb:{ok:1},wd:0};
 if(S.rec[r.id]||S.wd[r.id]){o.ap={ok:0,why:"Decision recorded"};o.vb=o.ap;return o}
 if(nq()){o.ap={ok:0,why:"Evidence source is not qualified"};o.vb=o.ap;return o}
 if(k.closed){o.ap={ok:0,why:"liveClosed"};o.vb=o.ap;if(r.author===me())o.wd=1;return o}
 if(r.author===me()){o.ap={ok:0,why:"author"};o.vb=o.ap;o.wd=1;return o}
 if(r.blocker)o.ap={ok:0,why:r.blocker+" · decide on the evidence below"};
 return o}
/* evidence ----------------------------------------------------------- */
function flag(v){return v==="ok"?fl("ok","Within"):v==="warn"?fl("partial","Warn"):v==="bad"?fl("rejected","Blocker"):fl("na","Not available")}
function na(t){return'<span class="na">'+esc(t||"Not available")+'</span>'}
function drift(rows){return'<div class="tw"><table><thead><tr><th>Metric</th><th class="n">Observed</th><th class="n">Limit</th><th>Verdict</th></tr></thead><tbody>'+rows.map(function(r){return"<tr><td>"+r[0]+'</td><td class="n">'+r[1]+'</td><td class="n">'+r[2]+"</td><td>"+flag(r[3])+"</td></tr>"}).join("")+"</tbody></table></div>"}
function check(sum,items){return'<details class="d"><summary>'+sum+'</summary><div><ul class="cl">'+items.map(function(i){return'<li class="'+(i[0]==="w"?"w":"")+'"><b>'+(i[0]==="w"?"!":"✓")+"</b>"+i[1]+"</li>"}).join("")+"</ul></div></details>"}
function chartPanel(title,right,id,cap){return'<div class="panel flush"><div class="ph">'+title+' <span class="r">'+right+'</span></div><div class="pad"><div class="chart" id="'+id+'"></div><div class="cap">'+cap.map(function(c){return"<span>"+c+"</span>"}).join("")+"</div></div></div>"}
function gh(n,e){var a=[];for(var i=0;i<n;i++)a.push(e*i/(n-1)+Math.sin(i/4)*320);return a}
var DT={
 r1:[["OOS Sharpe","1.42","≥ 1.00","ok"],["Max drawdown","−6.1%","≥ −8.0%","ok"],["Parameter stability","0.86","≥ 0.80","ok"],["Audit replay","Match","Match","ok"],["Capacity coverage","Top 3 symbols","All symbols","warn"]],
 r2:[["Allocation after","550.00","≤ 600.00","ok"],["Max order","5,000.00","≤ 10,000.00","ok"],["Daily loss cap","3.0%","≤ 5.0%","ok"],["Broker sync age","14 m","≤ 5 m","bad"],["Portfolio fit",na(),na(),"na"]],
 exit:[["Hit rate vs run","−1.1 pt","± 3.0 pt","ok"],["Average trade net","−0.04 pt","± 0.10 pt","ok"],["Fee drag","+0.006 pt","≤ +0.005 pt","warn"],["Slippage",na(),"≤ 0.02 pt","na"],["Max drawdown","−1.4%","≥ −6.0%","ok"],["Reject rate","0.2%","≤ 0.5%","ok"]],
 live:[["PnL vs paper twin","+0.4%","± 1.0%","ok"],["Fill rate","98.2%","≥ 97.0%","ok"],["Slippage","1.9 bp","≤ 2.0 bp","ok"],["Latency p95","142 ms","≤ 120 ms","warn"],["Reconciliation breaks","None","None","ok"]],
 cap:[["Parent has room","1,190.00","≥ 50.00","ok"],["Allocation after","550.00","≤ 600.00","ok"],["Daily loss cap","3.0%","≤ 5.0%","ok"],["Capacity proof",na(),"Published","na"]]};
var CL={r1:["Checklist · 4 of 5 · 1 warning",[["o","Engine, data and version pinned by digest"],["o","Final audit replay reproducible"],["o","Outer OOS policy satisfied"],["o","Parameter stability across folds"],["w","Capacity evidence covers the top 3 symbols only"]]],
 r2:["Checklist · 3 of 4 · 1 blocker",[["o","Account and risk plan pinned"],["o","Plan author cannot be the only approver"],["o","Capital preview derived, not applied"],["w","Broker sync is stale (14 m)"]]],
 exit:["Checklist · 6 of 7 · 1 warning",[["o","30 of 30 days · 312 of 300 trades"],["o","2 of 2 restart cycles"],["o","Data freshness violations: none · coverage 99.6%"],["o","Portfolio fit within band"],["o","Max drawdown within limit"],["o","Rejects and dead letters within limit"],["w","Fee drag above limit · carried to the next stage"]]],
 live:["Checklist · 4 of 5 · 1 warning",[["o","Canary window complete"],["o","Paper twin comparison within band"],["o","No open incidents"],["o","Reconciliation clean"],["w","Latency p95 above limit"]]],
 archive:["Checklist · 3 of 4 · 1 note",[["o","Requester is not the approver"],["o","Reason and previous stage recorded"],["o","Paper monitor will start after approval"],["w","Two obligations stay open until drained"]]],
 react:["Checklist · 4 of 4",[["o","Version and parameters bound"],["o","New evidence attached · 48 d"],["o","Remaining obligations: none"],["o","Target stage is Paper"]]],
 cap:["Checklist · 3 of 4 · 1 note",[["o","Command preview matches the request"],["o","Parent budget has room"],["o","Same currency and partition"],["w","Capacity proof is not published"]]]};
function runway(host,sel){var W=host.clientWidth||520,L=206,R=16,iw=W-L-R,rows=[["Grid v2.1 · Daily-loss cap",1.9,"WV-9"],["Carry v3.2 · Capacity ×2.4",10],["Carry v3.2 · WFO fold-6",39],["Carry v3.2 · Slippage carries",null],["Shared binding · Flatten check",null]],H=rows.length*34+34,
 cs=getComputedStyle(document.documentElement),c=function(k){return cs.getPropertyValue(k).trim()};function x(d){return L+iw*d/45}
 var s='<svg viewBox="0 0 '+W+" "+H+'" role="img" aria-label="Waiver runway: days until each waiver lapses">';
 [0,7,14,30,45].forEach(function(d){s+='<line x1="'+x(d)+'" x2="'+x(d)+'" y1="14" y2="'+(H-22)+'" stroke="'+c("--line")+'" stroke-dasharray="2 4"/><text x="'+x(d)+'" y="'+(H-6)+'" text-anchor="'+(d===45?"end":d===0?"start":"middle")+'" fill="'+c("--ink-faint")+'" font-size="11">'+(d===0?"Lapse":d+" d")+"</text>"});
 rows.forEach(function(r,i){var y=22+i*34,on=r[2]===sel,col=r[1]!=null&&r[1]<=3?c("--warn"):c("--series");
  s+='<text x="0" y="'+(y+4)+'" fill="'+(on?c("--ink"):c("--ink-soft"))+'" font-size="12" font-family="IBM Plex Sans">'+r[0]+"</text>";
  if(r[1]!=null){s+='<rect x="'+x(0)+'" y="'+(y-4)+'" width="'+(x(r[1])-x(0))+'" height="8" fill="'+col+'" opacity="'+(on?1:.55)+'"/><path d="M'+x(r[1])+","+(y-8)+" l7 8 l-7 8 l-7 -8 Z\" fill=\""+col+'"/><text x="'+(x(r[1])+14)+'" y="'+(y+4)+'" fill="'+c("--ink-soft")+'" font-size="11" font-family="IBM Plex Mono">'+(r[1]<2?"1 d 21 h":r[1]+" d")+"</text>"}
  else s+='<rect x="'+x(0)+'" y="'+(y-4)+'" width="'+(x(45)-x(0))+'" height="8" fill="none" stroke="'+c("--ink-faint")+'" stroke-dasharray="3 3"/><text x="'+(x(45)-6)+'" y="'+(y-9)+'" text-anchor="end" fill="'+c("--ink-faint")+'" font-size="11" font-family="IBM Plex Mono">No clock · closes by event</text>'});
 host.innerHTML=s+"</svg>"}
function evidence(r){var k=r.k,h="",draws=[];
 if(nq())return{html:'<div class="panel flush"><div class="ph">Evidence <span class="r">Source not qualified</span></div><div class="pad"><div class="na" style="font-size:15px">Not available</div><div class="na">Evidence source is not qualified for this request</div></div></div>',draw:function(){}};
 var id="ch-"+r.id;
 if(k==="r1"){h+=chartPanel("Evidence diff · observed vs approved","Out of sample · 60 d",id,["Band: approved return range","Dashed: approved in-sample path"]);draws.push(function(){var e=document.getElementById(id);if(e&&e.offsetParent)equityChart(e,{h:220,n:60,seed:21,drift:110,vol:1300,mode:"ret",base:100000,end:6400,drawdown:false,band:{lo:2,hi:6.8},ghost:gh(60,5600),ghostName:"Approved in-sample",seriesName:"Observed out-of-sample return",label:"R1 evidence diff"})})}
 if(k==="exit"||k==="live"){var live=k==="live";h+=chartPanel(live?"Evidence diff · canary vs paper twin":"Evidence diff · observed vs approved","30 d",id,["Band: approved return range",live?"Dashed: paper twin":"Dashed: approved backtest path"].concat(live?[]:["Squares: restart cycles"]));draws.push(function(){var e=document.getElementById(id);if(e&&e.offsetParent)equityChart(e,{h:220,n:30,seed:live?44:33,drift:100,vol:1000,mode:"ret",base:100000,end:live?2100:3100,drawdown:false,band:live?{lo:.5,hi:3.2}:{lo:1,hi:3.6},ghost:gh(30,live?1700:3300),ghostName:live?"Paper twin":"Approved backtest",seriesName:live?"Canary return":"Observed paper return",events:live?[]:[{ago:9},{ago:22}],label:"Evidence diff"})})}
 if(k==="r2"||k==="cap"){h+='<div class="panel flush"><div class="ph">'+(k==="r2"?"Capital change preview":"Command preview")+' <span class="r">Derived · not applied · USDT · Real-funded</span></div><div class="tw"><table><thead><tr><th>Item</th><th class="n">Before</th><th class="n">After approval</th></tr></thead><tbody>'+(k==="r2"?"<tr><td>Allocated</td><td class=n>500.00</td><td class=n>550.00</td></tr><tr><td>Used</td><td class=n>100.00</td><td class=n>100.00</td></tr><tr><td>Reserved</td><td class=n>25.00</td><td class=n>25.00</td></tr>":"<tr><td>Allocated · Core</td><td class=n>500.00</td><td class=n>550.00</td></tr><tr><td>Parent available</td><td class=n>1,240.00</td><td class=n>1,190.00</td></tr><tr><td>Used</td><td class=n>100.00</td><td class=n>100.00</td></tr>")+"</tbody></table></div></div>"}
 if(k==="archive"){h+=chartPanel("Prior economic history","Real-funded · USDT · to 18 Sep",id,["Archive does not close anything by itself"]);draws.push(function(){var e=document.getElementById(id);if(e&&e.offsetParent)equityChart(e,{h:170,n:60,seed:7,drift:60,vol:900,mode:"ret",base:100000,end:9200,drawdown:false,label:"Prior history"})});
  h+='<div class="panel flush"><div class="ph">Still open after approval</div><div class="tw"><table><tbody><tr><td>Open positions</td><td class="n">None</td></tr><tr><td>Working orders</td><td class="n">1</td></tr><tr><td>Reservations</td><td class="n">None</td></tr><tr><td>Unknown outcomes</td><td class="n">None</td></tr><tr><td>Settlement pending</td><td class="n">1</td></tr></tbody></table></div></div>'}
 if(k==="react"){h+=chartPanel("Forward paper monitor","Simulated · since 30 Aug",id,["Hatched: simulated, never backfilled"]);draws.push(function(){var e=document.getElementById(id);if(e&&e.offsetParent)equityChart(e,{h:190,n:48,seed:5,drift:50,vol:700,mode:"ret",base:100000,end:1800,sim:47,drawdown:false,seriesName:"Paper monitor",label:"Reactivation evidence"})});
  h+='<div class="panel flush"><div class="ph">Evidence since the monitor started</div><div class="tw"><table><tbody><tr><td>Net return · 48 d</td><td class="n pos">+1.80%</td></tr><tr><td>Max drawdown</td><td class="n neg">−0.90%</td></tr><tr><td>Score</td><td class="n">'+na("Not scored")+'</td></tr><tr><td>Regime support</td><td class="n">'+na("Insufficient data")+'</td></tr><tr><td>Virtual allocation</td><td class="n">100,000.00 USDT sim</td></tr></tbody></table></div></div>'}
 if(k==="waiver"){h+='<div class="panel flush"><div class="ph">Runway · what lapses when <span class="r">Shared axis 0 → 45 d</span></div><div class="pad"><div class="chart" id="'+id+'"></div></div></div>';draws.push(function(){var e=document.getElementById(id);if(e&&e.offsetParent)runway(e,"WV-9")});
  h+='<div class="panel flush"><div class="ph">Condition</div><div class="tw"><table><tbody><tr><td>Condition</td><td style="white-space:normal">Daily-loss cap −3.0% while canary runs</td></tr><tr><td>Source decision</td><td>'+idc("AP-259")+' R2 gate</td></tr><tr><td>Subject</td><td><a href="alpha.html">Grid v2.1</a></td></tr><tr><td>Owner</td><td>Lan</td></tr><tr><td>Lapses</td><td class="mono">19 Oct 07:14Z</td></tr></tbody></table></div></div>'}
 if(DT[k])h+='<div class="panel flush"><div class="ph">Drift verdict <span class="r">Metric · observed · limit</span></div>'+drift(DT[k])+"</div>";
 if(CL[k])h+=check(CL[k][0],CL[k][1]);
 return{html:h,draw:function(){draws.forEach(function(f){f()})}}}
/* queue --------------------------------------------------------------- */
function qflags(r){var rec=S.rec[r.id],o="";if(S.wd[r.id])return fl("paused","Withdrawn");if(rec)return fl(rec.mode==="deny"||rec.mode==="changes"?"rejected":"applied",rec.label);
 o+=r.slaMin<0?fl("rejected","Overdue"):fl("pending","Pending "+r.have+"/"+K[r.k].need);
 if(K[r.k].closed)o+=fl("paused","Closed");else if(r.author===me())o+=fl("na","Yours");else if(r.blocker)o+=fl("incident","Blocker");else o+=fl("approval","Needs you");return o}
function renderQ(){var q=document.getElementById("ck-q"),l=list(),h="";
 var cnt={all:RQ.length};RQ.forEach(function(r){cnt[r.k]=(cnt[r.k]||0)+1});
 document.getElementById("ck-lanes").innerHTML=LANES.map(function(x){return'<button data-lane="'+x[0]+'" aria-pressed="'+(S.lane===x[0])+'">'+x[1]+" "+(cnt[x[0]]||0)+"</button>"}).join("");
 l.forEach(function(r){var rec=S.rec[r.id]||S.wd[r.id];h+='<button class="qi'+(rec?" done":"")+'" data-id="'+r.id+'" aria-selected="'+(r.id===S.sel)+'"><div class="qt"><span class="kd">'+K[r.k].tag+"</span><b>"+esc(r.short)+'</b></div><div class="qm">'+esc(r.ctx)+'</div><div class="qf">'+qflags(r)+'</div><div class="sla'+(r.slaMin<0?" bad":"")+'"><i style="width:'+r.pct+'%"></i></div><div class="qm">'+r.sla+" · "+r.have+" of "+K[r.k].need+" approvers</div></button>"});
 q.innerHTML=h||'<div class="pad na">Nothing in this lane</div>'}
function ladder(r){var k=K[r.k];if(!k.ladder)return"";var seq=["Report","RC","R1","R2","Paper","Sandbox","Canary","Live"],ix=seq.indexOf(k.ladder);return'<div class="ladder">'+seq.map(function(s,i){return'<span class="'+(i<ix?"ok":i===ix?"on":"")+'">'+(i<ix?"✓ ":"")+s+"</span>"}).join("")+"</div>"}
function renderMain(){var r=cur(),k=K[r.k],e=evidence(r),vt=nq()?"Evidence not available":r.vt,vk=nq()?"mute":r.vk;
 var m="";if(!nq()&&r.mt)r.mt.split("").forEach(function(c){m+="<i class='"+(c==="o"?"":c==="w"?"w":"x")+"'></i>"});
 var main=document.getElementById("ck-main");
 main.innerHTML='<div><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="kd">'+k.tag+'</span><h1 style="font-size:20px;line-height:28px">'+esc(r.title)+"</h1></div>"+ladder(r)+'<div class="meta">'+idc(r.id)+"<span>"+esc(r.ctx)+"</span>"+r.links.map(function(x){return idc(x[0],x[1])}).join("")+"</div></div>"
 +'<div class="vd '+vk+'"><h2>'+esc(vt)+'</h2><div class="meta"><span>'+(nq()?"Not available":(!r.sc?"Runway below":"Checklist "+r.sc))+"</span><span>Quorum "+r.have+" of "+k.need+"</span><span>"+r.sla+"</span></div>"+(m?'<div class="meter"><span>'+r.sc+"</span>"+m+"</div>":"")+"</div>"
 +'<div class="evg">'+e.html+'</div><details class="d"><summary>Provenance</summary><div class="mono" style="font-size:12px">Request '+r.id+" · policy approval.v3 · digest sha256:9f3c1a…e2 · source projection sha256:dddd…dddd</div></details>";
 setTimeout(e.draw,0)}
/* rail ---------------------------------------------------------------- */
var STEPTXT={required:["Confirm it's you before sending.","Confirm it's you"],verifying:["Waiting for your security key…",""],passed:["Confirmed for 5 min.",""],failed:["Confirmation failed. Nothing was sent.","Try again"],expired:["Confirmation expired. Confirm again.","Confirm it's you"]};
function needNote(m){return m&&m!=="approve"&&m!=="withdraw"}
function effectOf(r,m){var k=K[r.k];return m==="approve"?k.effect:m==="cond"?"Approved with a condition you write below":m==="changes"?"Returns to the author · nothing changes":m==="deny"?(r.k==="waiver"?"Lets the waiver lapse":"Rejected · the author is told"):m==="extend"?k.extend:m==="close"?"Closes the waiver · the event is asserted":m==="withdraw"?"Request withdrawn · nothing is sent":"None chosen"}
function counts(m){return m==="approve"||m==="cond"||m==="extend"||m==="close"}
function renderRail(){var r=cur(),k=K[r.k],c=can(r),rec=S.rec[r.id],wd=S.wd[r.id],me_=me(),note=(document.getElementById("ck-note")||{}).value||"",ok12=note.trim().length>=12,m=S.mode,need=k.step&&counts(m||k.prim[0]);
 var rail=document.getElementById("ck-rail"),h="";
 var sod=wd?"":r.author===me_?'<div class="sod no">✕ Separation of duty: you created this request</div>':'<div class="sod">✓ Separation of duty OK · created by '+esc(r.author)+", you are "+esc(me_)+"</div>";
 var q='<div class="quo">Quorum ';for(var i=0;i<k.need;i++)q+='<i class="'+(i<r.have?"f":"")+'"></i>';q+=" "+r.have+" of "+k.need+" so far</div>";
 var stp="";if(k.step&&!rec&&!wd&&c.ap.why!=="liveClosed"&&!nq()){var T=STEPTXT[S.step];stp='<div class="stp '+S.step+'" id="ck-stp"><div>'+fl(S.step==="passed"?"ok":S.step==="verifying"?"pending":S.step==="required"?"approval":"rejected","Step-up · "+S.step)+"</div><div>"+T[0]+"</div>"+(T[1]?'<div><button class="btn" id="ck-stbtn">'+T[1]+"</button></div>":"")+'<details><summary>Preview the five states</summary><div class="acts">'+["required","verifying","passed","failed","expired"].map(function(s){return'<button class="btn" data-step="'+s+'">'+s+"</button>"}).join("")+"</div></details></div>"}
 var pri,more="",wdb="";
 if(rec||wd)pri=dis("Decision recorded","Decision recorded","pri");
 else if(m){var lab="Confirm "+(MORE[m]||m).toLowerCase(),can2=(m==="withdraw"||(!need||S.step==="passed"))&&(!needNote(m)||ok12);pri='<button class="btn pri" id="ck-go"'+(can2?"":" disabled")+">"+lab+'</button>'}
 else if(!c.ap.ok)pri=dis(k.prim[1],c.ap.why,"pri");else pri='<button class="btn pri" id="ck-ap">'+k.prim[1]+' <span class="kbd2">A</span></button>';
 if(!rec&&!wd&&c.vb.ok&&k.menu.length)more='<button class="btn" id="ck-more">Other decisions ▾</button><div class="menu" id="ck-menu">'+k.menu.map(function(x){return'<button data-mode="'+x[0]+'">'+x[1]+"</button>"}).join("")+"</div>";
 if(!rec&&!wd&&c.wd)wdb='<button class="btn" id="ck-wd">Withdraw</button>';
 var why="";if(!rec&&!wd){if(m&&need&&S.step!=="passed")why="Confirm it's you first.";else if(m&&needNote(m)&&!ok12)why=KIT.WHY.needNote}

 h='<div class="panel"><div class="ph">Decision <span class="r">Policy approval.v3</span></div><div class="bd">'+sod+q+stp+'<div><label class="lb" for="ck-note">Note'+(m&&needNote(m)?" · required":"")+'</label><textarea id="ck-note" rows="2" placeholder="Recorded with the decision"'+(rec||wd?" disabled":"")+'></textarea></div><div>'+pri+'</div><div class="acts">'+more+wdb+"</div>"+(why?'<div class="why" style="margin:0">'+why+"</div>":"")+"</div></div>";
 /* receipt */
 var dm=rec?rec.mode:m||k.prim[0],rows="";
 if(wd){rows="<tr><td>Decision</td><td>Withdrawn · "+wd.t+"</td></tr>"}
 else rows="<tr><td>Decision</td><td>"+(rec?rec.label+" · "+rec.t:m?(MORE[m]||m):"None chosen")+"</td></tr>";
 rows+="<tr><td>Request</td><td>"+idc(r.id)+" · "+k.lane+"</td></tr><tr><td>You</td><td>"+esc(me_)+" · "+({manager:"Manager",reviewer:"Reviewer"})[KIT.state.role]+"</td></tr>";
 if(!rec&&!wd&&!c.ap.ok&&!c.vb.ok&&!c.wd)rows+="<tr><td>What changes</td><td>Nothing to record</td></tr>";
 else{rows+="<tr><td>Counts as</td><td>"+(counts(dm)?Math.min(k.need,r.have+(rec?1:1))+" of "+k.need+" approvals":"No approval")+"</td></tr><tr><td>What changes</td><td>"+effectOf(r,wd?"withdraw":dm)+"</td></tr>";
  if(rec&&rec.note)rows+="<tr><td>Note</td><td>"+esc(rec.note)+"</td></tr>"}
 var dim=!rec&&!wd&&(!m||(!c.ap.ok&&!c.vb.ok&&!c.wd));
 h+='<div class="rc'+(rec||wd?" rec":dim?" dim":"")+'"><div class="rh"><span>'+(rec||wd?"Recorded":"Preview · not recorded")+'</span><span class="mono">'+(rec?rec.rcpt:wd?wd.rcpt:"")+"</span></div><table><tbody>"+rows+"</tbody></table></div>";
 var keep=(document.getElementById("ck-note")||{}).value;rail.innerHTML=h;var nn=document.getElementById("ck-note");if(nn&&keep)nn.value=keep;
 if(nn)nn.addEventListener("input",renderRailKeep)}
function renderRailKeep(){var v=document.getElementById("ck-note").value,p=document.getElementById("ck-note").selectionStart;renderRail();var n=document.getElementById("ck-note");n.value=v;n.focus();n.setSelectionRange(p,p)}
function pick(id){var nn=document.getElementById("ck-note");if(nn)nn.value="";S.sel=id;S.mode=null;S.step="required";S.menu=0;draw()}
function arm(m){var r=cur(),c=can(r);if(m==="approve"?!c.ap.ok:!c.vb.ok&&m!=="withdraw")return;if(m==="withdraw"&&!c.wd)return;S.mode=m;renderRail();var n=document.getElementById("ck-note");if(n)n.focus()}
function confirmIt(){var r=cur(),m=S.mode,n=document.getElementById("ck-note").value.trim(),k=K[r.k];if(!m)return;if(needNote(m)&&n.length<12)return;if(k.step&&counts(m)&&S.step!=="passed")return;
 var t="12:04Z",rc="rcpt_"+r.id.toLowerCase().replace("-","")+"_a1";
 if(m==="withdraw")S.wd[r.id]={t:t,rcpt:rc};else S.rec[r.id]={mode:m,label:m==="approve"?(k.prim[1]):(MORE[m]==="Extend"?"Extended":MORE[m]),note:n,t:t,rcpt:rc};S.mode=null;draw()}
function drawCk(){renderQ();renderMain();renderRail()}
var lastRole="";
function draw(){var root=document.getElementById("cockpit");if(!root)return;var role=KIT.state.role;
 if(role!==lastRole){lastRole=role;var f=RQ.filter(function(r){return r.author!==ME[role]&&!K[r.k].closed&&!r.blocker})[0];if(f){S.sel=f.id;S.lane="all";S.mode=null}}
 root.querySelectorAll("[data-view]").forEach(function(e){e.hidden=e.getAttribute("data-view").split(" ").indexOf(role)<0});
 if(role==="manager"||role==="reviewer")drawCk();else if(role==="researcher")drawMy()}
/* researcher: my requests, read only, withdraw ------------------------- */
function drawMy(){var t=document.getElementById("my-body"),h="";
 MY.forEach(function(r,i){var w=S.my[r[0]],st=w?fl("paused","Withdrawn"):nq()?na("Not available"):fl(r[4],r[3]);
  h+='<tr><td data-l="Request">'+idc(r[0])+' <b>'+r[2]+'</b><div class="sub">'+r[1]+'</div></td><td data-l="Status">'+st+(nq()?'<div class="sub">Status source not qualified</div>':"")+'</td><td data-l="Approvers" class="n">'+(nq()?na():r[5])+'</td><td data-l="Clock">'+r[6]+'</td><td data-l="">'+(r[7]&&!w?'<button class="btn" data-wd="'+r[0]+'">Withdraw</button>':w?'<span class="sub">'+esc(w)+"</span>":"")+"</td></tr>"});
 t.innerHTML=h}
document.addEventListener("click",function(e){var t=e.target,b;
 if(b=t.closest(".qi")){pick(b.getAttribute("data-id"));return}
 if(b=t.closest("#ck-lanes button")){S.lane=b.getAttribute("data-lane");var l=list();if(l.length&&l.map(function(x){return x.id}).indexOf(S.sel)<0)S.sel=l[0].id;S.mode=null;drawCk();return}
 if(b=t.closest("#ck-ap")){arm("approve");return}if(t.closest("#ck-go")){confirmIt();return}
 if(t.closest("#ck-more")){var mn=document.getElementById("ck-menu");mn.classList.toggle("on");return}
 if(b=t.closest("#ck-menu button")){arm(b.getAttribute("data-mode"));return}
 if(t.closest("#ck-wd")){arm("withdraw");return}
 if(b=t.closest("[data-step]")){S.step=b.getAttribute("data-step");renderRail();return}
 if(t.closest("#ck-stbtn")){S.step="verifying";renderRail();setTimeout(function(){if(S.step==="verifying"){S.step="passed";renderRail()}},900);return}
 if(b=t.closest("[data-wd]")){S.my[b.getAttribute("data-wd")]="Withdrawn 12:04Z · nothing is sent";drawMy();KIT.toast("Request withdrawn");return}
 if(t.closest("#ck-help")){help();return}
 var mn2=document.getElementById("ck-menu");if(mn2&&!t.closest(".acts"))mn2.classList.remove("on")});
var hp;function help(on){hp=hp||document.getElementById("ck-helpbox");if(hp)hp.classList.toggle("on",on===undefined?!hp.classList.contains("on"):on)}
document.addEventListener("keydown",function(e){var root=document.getElementById("cockpit");if(!root||!(KIT.state.role==="manager"||KIT.state.role==="reviewer"))return;var t=e.target,typing=t&&(t.tagName==="TEXTAREA"||t.tagName==="INPUT");
 if(document.getElementById("ov")&&document.getElementById("ov").classList.contains("on"))return;
 if(e.key==="Escape"){if(hp&&hp.classList.contains("on"))help(false);else{S.mode=null;S.menu=0;renderRail();if(typing)t.blur()}return}
 if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){confirmIt();return}
 if(typing||e.ctrlKey||e.metaKey||e.altKey)return;var k=e.key.toLowerCase(),l=list(),i=l.map(function(x){return x.id}).indexOf(S.sel);
 if(k==="j"||e.key==="ArrowDown"){e.preventDefault();if(i<l.length-1)pick(l[i+1].id)}
 else if(k==="k"||e.key==="ArrowUp"){e.preventDefault();if(i>0)pick(l[i-1].id)}
 else if(k==="a"){e.preventDefault();arm(K[cur().k].prim[0])}
 else if(k==="r"){e.preventDefault();var mm=K[cur().k].menu.filter(function(x){return x[0]==="deny"})[0];arm(mm?"deny":"changes")}
 else if(k==="n"){e.preventDefault();var n=document.getElementById("ck-note");if(n)n.focus()}
 else if(e.key==="?"){help()}});
window.Cockpit={mount:function(){KIT.on(function(){setTimeout(draw,0)});window.addEventListener("resize",function(){var r=cur();if(r&&(KIT.state.role==="manager"||KIT.state.role==="reviewer")){var e=evidence(r);setTimeout(e.draw,0)}})}}
})();
