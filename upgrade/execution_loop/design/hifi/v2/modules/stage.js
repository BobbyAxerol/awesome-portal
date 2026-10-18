/* modules/stage.js — shared by sandbox.html, canary.html, live.html.
   Owns: deployment header (crumb, tag, 3 chips, mini journey strip), URL tabs (?tab=slug), page-state switch in the preview strip,
   Internal / Broker / Difference triad, cap gauge, skeleton, Live-vs-Paper-vs-Backtest line chart. Token colours only. */
(function(){
var CSS=[
".crumbs{display:flex;gap:6px;flex-wrap:wrap;font:400 12px/16px var(--font-sans);color:var(--ink-faint);margin-bottom:6px}.crumbs a{color:var(--ink-soft)}",
".idc{display:inline-block;font:400 12px/18px var(--font-mono);border:1px solid var(--line-strong);padding:0 6px;color:var(--accent);background:var(--paper)}.idc:hover{text-decoration:none;background:var(--cell)}",
".head{display:grid;gap:12px}.head .chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.cl{font:500 10.5px/16px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint)}",
".guard{border:4px double var(--stage-live);background:var(--panel);padding:16px}.guard.sandbox{border:1px solid var(--line-strong);border-left:4px solid var(--stage-sandbox)}",
".tg{display:inline-flex;gap:8px;align-items:center;font:600 12px/16px var(--font-mono);letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}.tg i{width:12px;height:12px;display:inline-block}",
".tg.sbx i{background:var(--stage-sandbox)}.tg.liv i{background:var(--stage-live)}.tg.can i{border:2px solid var(--stage-live)}.tg em{font:400 12px/16px var(--font-sans);letter-spacing:0;text-transform:none;color:var(--ink-soft);font-style:normal}",
".sp{display:flex;flex-wrap:wrap;align-items:center}.sp a{display:inline-flex;gap:6px;align-items:center;padding:2px 10px 2px 8px;border:1px solid var(--line-strong);margin:0 -1px -1px 0;font:500 11px/16px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);background:var(--paper)}",
".sp a:hover{text-decoration:none;color:var(--ink)}.sp a i{width:10px;height:10px;display:inline-block;border:2px dashed var(--line-strong)}.sp a.done{color:var(--ink-soft)}.sp a.done i{background:var(--f-ok);border:2px solid var(--f-ok)}",
".sp a.cur{color:var(--ink);border-color:var(--accent);background:var(--accent-soft);position:relative;z-index:1}.sp a.cur i{background:var(--accent);border:2px solid var(--accent)}.sp a.cur.blk i{background:var(--bad);border:2px solid var(--bad)}",
".trial{display:flex;gap:10px;align-items:center;margin-top:10px;font:400 12px/16px var(--font-mono);color:var(--ink-soft);flex-wrap:wrap}.trial .tk{display:flex;gap:2px}.trial .tk i{width:14px;height:8px;background:var(--cell);border:1px solid var(--line)}.trial .tk i.on{background:var(--ink-faint);border-color:var(--ink-faint)}.trial .tk i.now{background:var(--accent);border-color:var(--accent)}",
".sk{display:inline-block;height:14px;vertical-align:middle;background:repeating-linear-gradient(90deg,var(--cell) 0 8px,var(--line) 8px 16px)}.sk.b{display:block;height:20px;margin:10px 0}",
".tri{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line-strong);border:1px solid var(--line-strong)}.tri>section{background:var(--panel);padding:12px 16px;min-width:0}.tri>section:last-child{background:var(--sunken)}",
".tri .tl{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.tri .tl b{font-weight:500}.tri .tl span{font:500 10.5px/16px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint)}",
".tri .tr{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-top:1px solid var(--line-soft);font-size:12px;color:var(--ink-soft)}.tri .tr b{font:400 13px/20px var(--font-mono);color:var(--ink)}.tri .ft{margin-top:8px;font:400 11px/16px var(--font-mono);color:var(--ink-faint)}.tri p{margin:6px 0;color:var(--ink-soft)}",
"@media(max-width:900px){.tri{grid-template-columns:1fr}}",
".gg{position:relative;height:10px;min-width:120px;background:var(--cell);border:1px solid var(--line-strong)}.gg i{position:absolute;left:0;top:0;bottom:0;background:var(--accent)}.gg i.w{background:var(--warn)}.gg i.x{background:var(--bad)}.gg b{position:absolute;top:-3px;bottom:-3px;width:0;border-left:1px dashed var(--ink-faint)}",
".lgd i.h{height:8px;width:14px;border:0;background:repeating-linear-gradient(135deg,var(--series-sim) 0 2px,transparent 2px 5px)}",
".idc.mut{color:var(--ink-faint)}.prov{font:400 12px/18px var(--font-mono);color:var(--ink-soft);padding:6px 0;word-break:break-word}.prov div{padding:1px 0}"
].join("\n");
var st=document.createElement("style");st.textContent=CSS;document.head.appendChild(st);
var NS="http://www.w3.org/2000/svg";
function esc(s){return String(s).replace(/[&<>]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;"}[c]})}
function el(t,a,x){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(x!=null)e.textContent=x;return e}
function pct(v){return(v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(2)+"%"}
var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var G=window.STG={esc:esc,pct:pct};
G.sk=function(w){return'<span class="sk" style="width:'+(w||80)+'px"></span>'};
G.chip=function(href,t,mut){return'<a class="idc'+(mut?" mut":"")+'" href="'+href+'">'+esc(t)+'</a>'};
var NODES=[["R1","approvals.html"],["R2","approvals.html"],["Paper","alpha.html"],["Sandbox","sandbox.html"],["Canary","canary.html"],["Live","live.html"]];
G.spine=function(cur,blk){return'<nav class="sp" aria-label="Journey">'+NODES.map(function(n,i){return'<a class="'+(i<cur?"done":i===cur?"cur"+(blk?" blk":""):"")+'" href="'+n[1]+'"'+(i===cur?' aria-current="step"':"")+"><i></i>"+n[0]+"</a>"}).join("")+"</nav>"};
G.chips=function(c){var b=function(l,h){return'<span class="chipx"><span class="cl">'+l+"</span>"+h+"</span>"};
 if(c.loading)return b("Runtime",G.sk(50))+b("Display freshness",G.sk(60))+b("Reconciliation",G.sk(50));
 var f=c.fr,dot=f.k==="fresh"?'<span class="dot"></span>':f.k==="na"?'<span class="dot mute"></span>':'<span class="dot warn"></span>';
 return b("Runtime",KIT.flag(c.rt[0],c.rt[1]))+b("Display freshness",dot+esc(f.t))+b("Reconciliation",KIT.flag(c.rc[0],c.rc[1]))};
/* c: {stage:'sandbox'|'canary'|'live', crumb:[[label,href]], title, sub, note, chips:{...}, spine:{cur,blk}, extra:html} */
G.head=function(c){var tg={sandbox:'<span class="tg sbx"><i></i>Sandbox</span>',canary:'<span class="tg can"><i></i>Live · Canary <em>Real capital at risk</em></span>',live:'<span class="tg liv"><i></i>Live <em>Real capital at risk</em></span>'}[c.stage];
 var cr=c.crumb.map(function(x,i){return x[1]?'<a href="'+x[1]+'">'+esc(x[0])+"</a>":"<span>"+esc(x[0])+"</span>"}).join(" / ");
 return'<div class="guard '+c.stage+'"><div class="head"><div><div class="crumbs">'+cr+"</div>"+tg+'<div class="mast"><div><h1>'+esc(c.title)+'</h1><div class="sub">'+esc(c.sub)+'</div></div><div class="chips">'+G.chips(c.chips)+"</div></div></div>"+G.spine(c.spine.cur,c.spine.blk)+(c.extra||"")+"</div></div>"};
/* URL tabs: ?tab=slug (V1 labels such as "Promotion plans" also resolve) */
function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
G.tab=function(defs){var t=norm(new URLSearchParams(location.search).get("tab"));if(G._tab)t=G._tab;for(var i=0;i<defs.length;i++)if(defs[i][0]===t)return t;return defs[0][0]};
G.tabs=function(defs,cur){return'<div class="tabs" role="tablist" data-url>'+defs.map(function(d){return'<button role="tab" data-t="'+d[0]+'" aria-selected="'+(d[0]===cur)+'" tabindex="'+(d[0]===cur?0:-1)+'">'+esc(d[1])+"</button>"}).join("")+"</div>"};
document.addEventListener("click",function(e){var b=e.target.closest(".tabs[data-url] button");if(!b)return;G._tab=b.getAttribute("data-t");try{var u=new URL(location.href);u.searchParams.set("tab",G._tab);history.replaceState(null,"",u)}catch(x){}window.dispatchEvent(new Event("stg:tab"))});
document.addEventListener("keydown",function(e){var b=e.target.closest&&e.target.closest(".tabs[data-url] button");if(!b||(e.key!=="ArrowRight"&&e.key!=="ArrowLeft"))return;var l=[].slice.call(b.parentNode.children),n=l[(l.indexOf(b)+(e.key==="ArrowRight"?1:l.length-1))%l.length];n.click();setTimeout(function(){var f=document.querySelector('.tabs[data-url] button[data-t="'+n.getAttribute("data-t")+'"]');if(f)f.focus()},0)});
/* page-state switch lives in the design-preview strip, value in ?state= */
G.states=function(list){var s=document.querySelector(".strip");if(!s||s.querySelector("[data-ctl=pstate]"))return;var a=document.createElement("span");a.textContent="Page state";var g=document.createElement("span");g.className="grp";g.setAttribute("data-ctl","pstate");g.innerHTML=list.map(function(x){return'<button data-v="'+x[0]+'" aria-pressed="false">'+x[1]+"</button>"}).join("");s.appendChild(a);s.appendChild(g)};
G.ps=function(){var v=KIT.state.pstate||new URLSearchParams(location.search).get("state")||"normal";document.querySelectorAll("[data-ctl=pstate] button").forEach(function(x){x.setAttribute("aria-pressed",x.getAttribute("data-v")===v)});
 if(KIT.state.pstate){try{var u=new URL(location.href);if(u.searchParams.get("state")!==v){u.searchParams.set("state",v);history.replaceState(null,"",u)}}catch(x){}}return v};
/* triad: o={rows:[[label,internal,broker,diff]], hide:bool, na:['broker','diff']|'all', why, asof} — hidden = not drawn at all (policy: hide, not grey) */
G.triad=function(o){var na=function(k){return o.na==="all"||(o.na||[]).indexOf(k)>=0};
 function tile(i,t,tag,k){var body;if(k!=="int"&&o.hide)body="<p>Hidden while the figures disagree.</p>";else if(na(k))body='<p class="na">Not available. '+esc(o.why||"")+"</p>";else body=o.rows.map(function(r){var v=r[k==="int"?1:k==="brk"?2:3],c=k==="dif"&&v!==0&&!/^[-−+]?0([.,]0+)?$/.test(v)?(/^−/.test(v)?" neg":" pos"):"";return'<div class="tr"><span>'+esc(r[0])+'</span><b class="'+c.trim()+'">'+esc(v)+"</b></div>"}).join("");
  return"<section><div class=\"tl\"><b>"+t+"</b><span>"+tag+"</span></div>"+body+(o.hide&&k!=="int"||na(k)?"":'<div class="ft">As of '+esc(o.asof||"12:04Z")+"</div>")+"</section>"}
 return'<div class="tri">'+tile(0,"Internal","Execution","int")+tile(1,"Broker","Broker","brk")+tile(2,"Difference","Derived","dif")+"</div>"};
G.gauge=function(f,lbl){var c=f>=.95?"x":f>=.8?"w":"";return'<div class="gg" role="img" aria-label="'+esc(lbl||"")+" "+Math.round(f*100)+' percent used"><i class="'+c+'" style="width:'+Math.min(100,f*100)+'%"></i><b style="left:80%"></b></div>'};
/* demo series (index return %, hourly) */
G.demo=function(n){var s=41,r=function(){s=(s*1664525+1013904223)%4294967296;return s/4294967296},b=0,p=0,l=0,B=[],P=[],L=[];for(var i=0;i<n;i++){b+=.021+(r()-.5)*.1;p+=(b-p)*.12+(r()-.5)*.03;l+=(p-l)*.1+(r()-.5)*.035;B.push(b);P.push(p);L.push(l)}return{bt:B,paper:P,live:L}};
/* o={live,paper,bt,start:Date.UTC,h,label} */
G.lines=function(host,o){o=o||{};host._redraw=function(){G.lines(host,o)};var W=host.clientWidth||760,H=o.h||250,m={l:56,r:126,t:14,b:26},iw=W-m.l-m.r,ih=H-m.t-m.b,n=o.live.length,cs=getComputedStyle(document.documentElement),c=function(k){return cs.getPropertyValue(k).trim()};
 var A=[o.live,o.paper,o.bt],all=[].concat.apply([],A),lo=Math.min.apply(0,all),hi=Math.max.apply(0,all),pd=(hi-lo)*.12||.1;lo-=pd;hi+=pd;
 var step=Math.pow(10,Math.floor(Math.log10((hi-lo)/6))),e=(hi-lo)/6/step;step*=e<1.5?1:e<3?2:e<7?5:10;var t0=Math.floor(lo/step)*step,tk=[];for(var v=t0;v<=hi+step*.01;v+=step)tk.push(v);lo=tk[0];hi=tk[tk.length-1];
 function x(i){return m.l+iw*i/(n-1)}function y(v){return m.t+ih*(1-(v-lo)/(hi-lo))}function pts(a){return a.map(function(v,i){return x(i)+","+y(v)}).join(" ")}
 var svg=el("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":o.label||"Live vs Paper vs Backtest"}),defs=el("defs",{}),pat=el("pattern",{id:"hz"+host.id,width:6,height:6,patternUnits:"userSpaceOnUse",patternTransform:"rotate(45)"});pat.appendChild(el("line",{x1:0,y1:0,x2:0,y2:6,stroke:c("--series-sim"),"stroke-width":1.3,opacity:.75}));defs.appendChild(pat);svg.appendChild(defs);
 tk.forEach(function(v){var yy=y(v);svg.appendChild(el("line",{x1:m.l,x2:W-m.r,y1:yy,y2:yy,stroke:c("--line"),opacity:Math.abs(v)<1e-9?1:.55}));svg.appendChild(el("text",{x:m.l-8,y:yy+4,"text-anchor":"end",fill:c("--ink-faint"),"font-size":11},pct(v)))});
 for(var d=0;d*24<n;d++){var i=d*24,dt=new Date(o.start+i*36e5);svg.appendChild(el("line",{x1:x(i),x2:x(i),y1:m.t+ih,y2:m.t+ih+4,stroke:c("--ink-faint")}));svg.appendChild(el("text",{x:x(i),y:m.t+ih+18,"text-anchor":d?"middle":"start",fill:c("--ink-faint"),"font-size":11},dt.getUTCDate()+" "+MON[dt.getUTCMonth()]))}
 svg.appendChild(el("polygon",{points:pts(o.live)+" "+o.paper.map(function(v,i){return x(n-1-i)+","+y(o.paper[n-1-i])}).join(" "),fill:"url(#hz"+host.id+")",opacity:.55}));
 svg.appendChild(el("polyline",{points:pts(o.bt),fill:"none",stroke:c("--series-sim"),"stroke-width":1.6,"stroke-dasharray":"2 3",opacity:.9}));
 svg.appendChild(el("polyline",{points:pts(o.paper),fill:"none",stroke:c("--series-sim"),"stroke-width":1.8,"stroke-dasharray":"6 4"}));
 svg.appendChild(el("polyline",{points:pts(o.live),fill:"none",stroke:c("--series"),"stroke-width":2.6,"stroke-linejoin":"round"}));
 var ends=[[o.live[n-1],"Live","--series",1],[o.paper[n-1],"Paper","--series-sim",0],[o.bt[n-1],"Backtest","--series-sim",0]].sort(function(a,b){return y(a[0])-y(b[0])}),last=-99;
 ends.forEach(function(q){var yy=Math.max(y(q[0]),last+15);last=yy;svg.appendChild(el("rect",{x:W-m.r+8,y:yy-8,width:112,height:16,fill:q[3]?c("--series"):c("--cell"),stroke:q[3]?"none":c("--series-sim")}));svg.appendChild(el("text",{x:W-m.r+14,y:yy+4,fill:q[3]?"#0b0b0c":c("--ink"),"font-size":11,"font-weight":q[3]?600:400},q[1]+" "+pct(q[0])))});
 svg.appendChild(el("circle",{cx:x(n-1),cy:y(o.live[n-1]),r:4.5,fill:c("--series"),stroke:c("--panel"),"stroke-width":2}));
 var cross=el("line",{y1:m.t,y2:m.t+ih,stroke:c("--ink"),opacity:.7,visibility:"hidden"});svg.appendChild(cross);
 var rd=document.createElement("div");rd.className="rd";var lg=document.createElement("div");lg.className="lgd";lg.innerHTML='<span><i></i>Live</span><span><i class="d" style="border-color:var(--series-sim)"></i>Paper (simulated)</span><span><i class="d" style="border-color:var(--series-sim);border-top-style:dotted"></i>Backtest (simulated)</span><span><i class="h"></i>Gap, Live vs Paper</span>';
 host.innerHTML="";host.appendChild(lg);host.appendChild(rd);host.appendChild(svg);
 function show(i){i=Math.max(0,Math.min(n-1,i));var dt=new Date(o.start+i*36e5),g=o.live[i]-o.paper[i];cross.setAttribute("x1",x(i));cross.setAttribute("x2",x(i));cross.setAttribute("visibility",i===n-1?"hidden":"visible");
  var U=function(l,v,b){return'<span><span class="u">'+l+"</span>"+(b?"<b>"+v+"</b>":v)+"</span>"};
  rd.innerHTML=U(dt.getUTCDate()+" "+MON[dt.getUTCMonth()]+" "+("0"+dt.getUTCHours()).slice(-2)+":00Z","")+U("Live",pct(o.live[i]),1)+U("Paper",pct(o.paper[i]))+U("Backtest",pct(o.bt[i]))+U("Live vs Paper",(g>0?"+":"\u2212")+Math.abs(g).toFixed(2)+" pts");return i}
 var cur=show(n-1),hit=el("rect",{x:m.l,y:m.t,width:iw,height:ih,fill:"transparent",tabindex:0});svg.appendChild(hit);
 hit.addEventListener("mousemove",function(ev){var r=svg.getBoundingClientRect();cur=show(Math.round(((ev.clientX-r.left)*W/r.width-m.l)/iw*(n-1)))});hit.addEventListener("mouseleave",function(){cur=show(n-1)});
 hit.addEventListener("keydown",function(ev){if(ev.key==="ArrowLeft")cur=show(cur-1);else if(ev.key==="ArrowRight")cur=show(cur+1);else if(ev.key==="Escape")cur=show(n-1)})};
/* small builders: KPI cell (kind: ok|na|ld), card-ready table */
G.kpi=function(l,v,n,k,c,nn){return'<div class="kpi"><div class="l">'+l+"</div>"+(k==="ld"?'<div class="v">'+G.sk(90)+"</div>":k==="na"?'<div class="v na">Not available</div>':'<div class="v '+(c||"")+'">'+v+"</div>")+'<div class="n">'+(k==="ld"?"&nbsp;":k==="na"?(nn||"Source not qualified"):n)+"</div></div>"};
G.tbl=function(h,rows){return'<div class="tw"><table class="cards"><thead><tr>'+h.map(function(x){return"<th"+(x[1]?' class="n"':"")+">"+x[0]+"</th>"}).join("")+"</tr></thead><tbody>"+rows.map(function(r){return"<tr>"+r.map(function(c,i){return'<td data-l="'+h[i][0]+'"'+(h[i][1]?' class="n"':"")+">"+c+"</td>"}).join("")+"</tr>"}).join("")+"</tbody></table></div>"};
window.addEventListener("resize",function(){document.querySelectorAll(".chart").forEach(function(h){if(h._redraw&&h.offsetParent)h._redraw()})});
})();
