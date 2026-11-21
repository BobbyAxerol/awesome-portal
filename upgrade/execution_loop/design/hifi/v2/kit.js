/* Execution V2 shell: one nav config, one context bar, one command bar, role + data-state switching. Pages supply only <main> content. */
(function(){
var NAV=[["Execution",[
 ["overview","Overview","overview.html","all",null],["portfolios","Portfolios","portfolios.html","manager operator reviewer",null],["fleet","Alpha Fleet","fleet.html","all",null],
 ["accounts","Accounts","accounts.html","manager operator",null],["operations","Operations","operations.html","manager operator","3"],["approvals","Approvals","approvals.html","manager reviewer researcher","4"]]],
 ["Administration",[["access","Profile & Access","access.html","all",null]]]];
var ROLES=[["manager","Manager"],["researcher","Researcher"],["operator","Operator"],["reviewer","Reviewer"]];
var ENT=[["Alpha","BTC-Trend v3","Live · Core","fleet.html","all"],["Alpha","SOL-Break v1","Paper · Satellite","fleet.html","all"],["Alpha","ETH-Mean v2","Canary · Core","fleet.html","manager operator reviewer"],["Alpha","AVAX-Rev v1","Live · Core","fleet.html","manager operator reviewer"],
 ["Portfolio","Core","612,040 USDT","portfolios.html","manager operator reviewer"],["Portfolio","Satellite","380,120 USDT","portfolios.html","manager operator reviewer"],["Account","Binance-02","live-0192","accounts.html","manager operator"],
 ["Operation","Portfolio Canary · ADJUST_TARGET_BUDGET","Unknown outcome","operations.html","manager operator"],["Approval","Archive request · BTC-Trend v3","Needs me","approvals.html","manager reviewer researcher"]];
var WHY={noGrant:"Needs the approver grant",notEnabled:"Not enabled for this profile",noExport:"Export is not available yet",liveClosed:"Live decisions are closed on this build",author:"You created this request",needNote:"Add a note of at least 12 characters",readOnly:"Read-only on this build",relay:"Relay is not qualified yet"};
var S={role:"manager",data:"ok",env:"real",win:"90",ccy:"USDT"};
try{S.role=sessionStorage.getItem("kit-role")||S.role;S.data=sessionStorage.getItem("kit-data")||S.data;S.win=sessionStorage.getItem("kit-win")||S.win;S.env=sessionStorage.getItem("kit-env")||S.env}catch(e){}
function has(list,v){return list==="all"||(" "+list+" ").indexOf(" "+v+" ")>=0}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;"}[c]})}
function save(){try{sessionStorage.setItem("kit-role",S.role);sessionStorage.setItem("kit-data",S.data);sessionStorage.setItem("kit-win",S.win);sessionStorage.setItem("kit-env",S.env)}catch(e){}}
function apply(){var b=document.body;b.setAttribute("data-role",S.role);b.setAttribute("data-data",S.data);
 document.querySelectorAll("[data-roles]").forEach(function(e){e.toggleAttribute("hidden-by-role",!has(e.getAttribute("data-roles"),S.role))});
 document.querySelectorAll("[data-hide-roles]").forEach(function(e){e.toggleAttribute("hidden-by-role",has(e.getAttribute("data-hide-roles"),S.role)&&e.getAttribute("data-hide-roles")!=="all")});
 document.querySelectorAll("[data-data]").forEach(function(e){if(e===b)return;e.toggleAttribute("hidden-by-role",e.getAttribute("data-data")!==S.data)});
 document.querySelectorAll(".side a[data-roles]").forEach(function(e){e.style.display=has(e.getAttribute("data-roles"),S.role)?"":"none"});
 document.querySelectorAll("[data-ctl=role] button").forEach(function(x){x.setAttribute("aria-pressed",x.getAttribute("data-v")===S.role)});
 document.querySelectorAll("[data-ctl=data] button").forEach(function(x){x.setAttribute("aria-pressed",x.getAttribute("data-v")===S.data)});
 document.querySelectorAll(".ctxbar [data-env] button").forEach(function(x){x.setAttribute("aria-pressed",x.getAttribute("data-v")===S.env)});
 document.querySelectorAll(".ctxbar [data-win] button").forEach(function(x){x.setAttribute("aria-pressed",x.getAttribute("data-v")===S.win)});
 var w={"7":"7D","30":"30D","90":"90D","all":"ALL"}[S.win];document.querySelectorAll(".win").forEach(function(e){e.textContent=w});
 var who=document.getElementById("who");if(who)who.textContent=({manager:"Bobby · Manager",researcher:"Stan · Researcher",operator:"Lan · Operator",reviewer:"Minh · Reviewer"})[S.role];
 var side=document.querySelector(".side");if(side)side.querySelectorAll("a").forEach(function(a){a.style.display=has(a.getAttribute("data-roles")||"all",S.role)?"":"none"});
 var f=document.getElementById("cmdpal");if(f)f.setAttribute("data-r",S.role)}
function emit(){save();apply();window.dispatchEvent(new CustomEvent("kit:change",{detail:S}))}
function build(){var b=document.body,page=b.getAttribute("data-page")||"",nav=b.getAttribute("data-nav")||"",crumb=b.getAttribute("data-crumb")||("Execution / "+page),lock=b.getAttribute("data-window-lock");
 var main=document.querySelector("main");if(!main)return;var strip=document.createElement("div");strip.className="strip";
 strip.innerHTML='<span>Design preview</span><span>Role</span><span class="grp" data-ctl="role">'+ROLES.map(function(r){return'<button data-v="'+r[0]+'" aria-pressed="false">'+r[1]+'</button>'}).join("")+'</span><span>Data</span><span class="grp" data-ctl="data"><button data-v="ok" aria-pressed="false">Qualified</button><button data-v="nq" aria-pressed="false">Not qualified</button></span><span>Sample values</span>';
 var app=document.createElement("div");app.className="app";
 var top=document.createElement("header");top.className="top";top.innerHTML='<button class="menu-btn" id="shellmenu" aria-label="Menu">Menu</button><span class="brand">Quant Ecosystem Portal</span><span class="crumb">'+crumb.replace(/(.*)\/ ?(.*)$/,'$1/ <b>$2</b>')+'</span><button class="cmdbtn" id="cmdopen" aria-label="Open command bar"><span>Search or jump to…</span><span style="margin-left:auto" class="kbd">⌘K</span></button><span class="who" id="who"></span>';
 var ctx=document.createElement("div");ctx.className="ctxbar";ctx.innerHTML='<span class="l">Context</span><span class="seg" data-env><button data-v="real" aria-pressed="false">Real-funded</button><button data-v="paper" aria-pressed="false">Paper</button><button data-v="sandbox" aria-pressed="false">Sandbox</button></span>'+(lock?'<span class="lock">Window fixed: '+esc(lock)+'</span>':'<span class="seg" data-win><button data-v="7" aria-pressed="false">7D</button><button data-v="30" aria-pressed="false">30D</button><button data-v="90" aria-pressed="false">90D</button><button data-v="all" aria-pressed="false">ALL</button></span>')+'<span class="chipx">'+S.ccy+' · one basis</span><span class="chipx" data-roles="manager operator reviewer">Scope: All portfolios ▾</span><span class="chipx" data-roles="researcher">Scope: Your alphas</span>';
 var side=document.createElement("nav");side.className="side";side.innerHTML=NAV.map(function(g){return'<h6>'+g[0]+'</h6>'+g[1].map(function(i){return'<a href="'+i[2]+'" data-roles="'+i[3]+'"'+(i[0]===nav?' aria-current="page"':"")+'><span>'+i[1]+'</span>'+(i[4]?'<span class="badge">'+i[4]+'</span>':"")+'</a>'}).join("")}).join("");
 main.parentNode.insertBefore(strip,main);main.parentNode.insertBefore(app,main);app.appendChild(top);app.appendChild(ctx);app.appendChild(side);app.appendChild(main);
 var ov=document.createElement("div");ov.className="ov";ov.id="ov";ov.innerHTML='<div class="pal" role="dialog" aria-label="Command bar" id="cmdpal"><input id="q" placeholder="Search alphas, portfolios, accounts, operations, approvals…" autocomplete="off"><div id="res"></div><div class="ft"><span><span class="kbd">↑↓</span> move</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">esc</span> close</span><span style="margin-left:auto">Context kept</span></div></div>';
 var toast=document.createElement("div");toast.className="toast";toast.id="toast";b.appendChild(ov);b.appendChild(toast);
 strip.addEventListener("click",function(e){var x=e.target.closest("button");if(!x)return;var k=x.parentNode.getAttribute("data-ctl");S[k]=x.getAttribute("data-v");emit()});
 ctx.addEventListener("click",function(e){var x=e.target.closest("button");if(!x)return;var g=x.parentNode;if(g.hasAttribute("data-env"))S.env=x.getAttribute("data-v");else if(g.hasAttribute("data-win"))S.win=x.getAttribute("data-v");emit()});
 document.getElementById("shellmenu").addEventListener("click",function(){side.classList.toggle("open")});
 // command bar
 var q=document.getElementById("q"),res=document.getElementById("res"),sel=0,items=[];
 function list(){var t=q.value.trim().toLowerCase(),out=[];ENT.forEach(function(e){if(has(e[4],S.role))out.push(e)});NAV.forEach(function(g){g[1].forEach(function(i){if(has(i[3],S.role))out.push(["Go to",i[1],"screen",i[2],"all"])})});
  items=out.filter(function(a){return!t||(a[0]+" "+a[1]+" "+a[2]).toLowerCase().indexOf(t)>=0}).slice(0,12)}
 function draw(){list();if(sel>=items.length)sel=0;var h="",last="";items.forEach(function(a,i){if(a[0]!==last){h+='<div class="grp">'+a[0]+'</div>';last=a[0]}h+='<div class="it'+(i===sel?" sel":"")+'" data-i="'+i+'"><span class="ty">'+a[0]+'</span><span>'+esc(a[1])+'</span><span class="r">'+esc(a[2])+'</span></div>'});res.innerHTML=h||'<div class="grp">No result</div>'}
 function open(){ov.classList.add("on");q.value="";sel=0;draw();setTimeout(function(){q.focus()},0)}function close(){ov.classList.remove("on")}
 document.getElementById("cmdopen").addEventListener("click",open);ov.addEventListener("click",function(e){if(e.target===ov)close()});
 function pick(a){close();if(a[3]&&a[0]==="Go to"){location.href=a[3];return}KIT.toast("Open: "+a[1]+" · context kept")}
 document.addEventListener("keydown",function(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();ov.classList.contains("on")?close():open()}else if(ov.classList.contains("on")){if(e.key==="Escape")close();else if(e.key==="ArrowDown"){sel=Math.min(items.length-1,sel+1);draw();e.preventDefault()}else if(e.key==="ArrowUp"){sel=Math.max(0,sel-1);draw();e.preventDefault()}else if(e.key==="Enter"&&items[sel])pick(items[sel])}});
 q.addEventListener("input",function(){sel=0;draw()});res.addEventListener("click",function(e){var it=e.target.closest(".it");if(it)pick(items[+it.getAttribute("data-i")])});
 apply();window.dispatchEvent(new CustomEvent("kit:ready",{detail:S}))}
window.KIT={state:S,WHY:WHY,toast:function(m){var t=document.getElementById("toast");if(!t)return;t.textContent=m;t.style.display="block";clearTimeout(t._t);t._t=setTimeout(function(){t.style.display="none"},2200)},
 flag:function(k,l){return'<span class="flag" data-k="'+k+'">'+esc(l)+'</span>'},
 why:function(key,link){return'<span class="why">'+esc(WHY[key]||key)+(link===false?"":' · <a href="access.html">My access</a>')+'</span>'},
 disabled:function(label,key,cls,link){return'<button class="btn '+(cls||"")+'" disabled>'+esc(label)+'</button>'+window.KIT.why(key,link)},
 on:function(fn){window.addEventListener("kit:change",function(e){fn(e.detail)});window.addEventListener("kit:ready",function(e){fn(e.detail)})},
 fmt:function(n,d){var s=Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d||0,maximumFractionDigits:d||0});return(n<0?"−":"")+s}};
if(document.readyState!=="loading")build();else document.addEventListener("DOMContentLoaded",build);
})();
