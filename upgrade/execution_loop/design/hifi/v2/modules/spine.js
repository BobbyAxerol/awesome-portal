/* JourneySpine — R1 > R2 > Paper > Sandbox > Canary > Live for one alpha.
   API:  Spine.render(host,{variant:"full"|"compact"|"mini", stages:[...], sel:2, nq:false, onSelect:function(i,stage){}})
         Spine.fromStage("sandbox",{days:12,met:5,blocked:false,who:"Manager"})  -> stages array (R1,R2 done; earlier stages done; current "cur"; later "nos")
         Spine.strip(host,{segments:[{k:"p|s|c|l|g",f:40,label:"Paper"}],brackets:[{f:60,label:"Simulated",actual:false}]})  -> proportional stage bar (hatched = simulated, solid = actual)
   stage item: {s:"done|cur|blk|nos", days, met, total, who, line, by, why, gate}.  Token-based CSS only (no hex, no color-mix). */
(function(){
var NAMES=[["r1","R1 gate","gate"],["r2","R2 gate","gate"],["paper","Paper","paper"],["sandbox","Sandbox","sandbox"],["canary","Canary","canary"],["live","Live","live"]];
var LBL={done:"Done",cur:"Now",blk:"Blocked",nos:"Todo"},FK={done:"ok",cur:"operation",blk:"attention",nos:"na"};
var CSS=".sp-nds{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));padding-right:1px}"
+".sp-nd{position:relative;text-align:left;background:var(--panel);border:1px solid var(--line-strong);margin:0 -1px 0 0;padding:10px 12px;color:var(--ink);font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:6px;min-height:168px;min-width:0}"
+".sp-nd:hover{background:var(--cell)}.sp-nd:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;z-index:2}"
+".sp-nd.cur{border:2px solid var(--accent);background:var(--accent-soft);z-index:1}.sp-nd.blk{border:2px solid var(--f-rejected);background:var(--f-rejected-bg);z-index:1}.sp-nd.nos{border-style:dashed;background:var(--paper)}.sp-nd.sel{box-shadow:inset 0 -3px 0 var(--ink)}"
+".sp-nd .h{display:flex;justify-content:space-between;gap:6px;align-items:center;flex-wrap:wrap}.sp-nd .g{font:500 11px/16px var(--font-mono);letter-spacing:.1em;text-transform:uppercase}"
+".sp-nd .m{font:400 24px/28px var(--font-mono)}.sp-nd .m small{font-size:11px;color:var(--ink-faint);letter-spacing:.08em;margin-left:4px}.sp-nd .m.t{font:400 16px/28px var(--font-sans);color:var(--ink-faint)}"
+".sp-nd .l{font:400 11px/14px var(--font-mono);color:var(--ink-faint)}.sp-nd .x{margin-top:auto;font:400 11px/14px var(--font-mono);color:var(--ink-soft);border-top:1px solid var(--line);padding-top:6px}"
+".sp-mt{display:flex;gap:2px}.sp-mt i{flex:1;height:8px;background:var(--cell);border:1px solid var(--line)}.sp-mt i.on{background:var(--f-ok);border-color:var(--f-ok)}.cur .sp-mt i.on{background:var(--accent);border-color:var(--accent)}.blk .sp-mt i.on{background:var(--f-recall);border-color:var(--f-recall)}"
+".sp-nd::after{content:'';position:absolute;right:-7px;top:50%;width:12px;height:12px;background:var(--paper);border-top:1px solid var(--line-strong);border-right:1px solid var(--line-strong);transform:translateY(-50%) rotate(45deg);z-index:3}.sp-nd:last-child::after{display:none}.sp-nd.cur::after{border-color:var(--accent);border-width:2px}"
+"@media(max-width:1100px){.sp-nds{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:8px}.sp-nd::after{display:none}}@media(max-width:660px){.sp-nds{grid-template-columns:repeat(2,minmax(0,1fr))}}"
+".sp-cmp{display:flex;align-items:flex-start;min-width:400px}.sp-cmp .it{flex:1;text-align:center;position:relative;font:500 10.5px/14px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);background:none;border:0;padding:0;cursor:pointer}"
+".sp-cmp .it::before{content:'';position:absolute;left:-50%;right:50%;top:10px;border-top:2px solid var(--line-strong);z-index:0}.sp-cmp .it:first-child::before{display:none}.sp-cmp .it.done::before,.sp-cmp .it.cur::before{border-top-color:var(--f-ok)}"
+".sp-cmp .q{position:relative;z-index:1;display:grid;place-items:center;width:22px;height:22px;margin:0 auto 4px;border:2px solid var(--line-strong);background:var(--paper);font:600 11px/1 var(--font-mono);color:var(--ink-faint)}"
+".sp-cmp .done .q{background:var(--f-ok);border-color:var(--f-ok);color:var(--paper)}.sp-cmp .cur .q{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}.sp-cmp .blk .q{border-color:var(--f-rejected);background:var(--f-rejected-bg);color:var(--f-rejected)}.sp-cmp .nos .q{border-style:dashed}.sp-cmp .cur,.sp-cmp .blk{color:var(--ink)}"
+".sp-cw{overflow-x:auto}.sp-mini{display:inline-flex;gap:2px;vertical-align:middle}.sp-mini i{width:9px;height:9px;border:1px solid var(--line-strong);background:var(--paper)}.sp-mini i.done{background:var(--f-ok);border-color:var(--f-ok)}.sp-mini i.cur{background:var(--accent);border-color:var(--accent)}.sp-mini i.blk{background:var(--f-rejected);border-color:var(--f-rejected)}.sp-mini i.nos{border-style:dashed}"
+".sp-strip{display:flex;gap:2px;height:14px}.sp-strip i{display:block;min-width:0}.sp-strip .p{background:repeating-linear-gradient(135deg,var(--stage-paper) 0 2px,transparent 2px 6px);box-shadow:inset 0 0 0 1px var(--stage-paper)}"
+".sp-strip .s{background:repeating-linear-gradient(45deg,var(--stage-sandbox) 0 2px,transparent 2px 6px);box-shadow:inset 0 0 0 1px var(--stage-sandbox)}.sp-strip .c{box-shadow:inset 0 0 0 2px var(--stage-live)}.sp-strip .l{background:var(--stage-live)}.sp-strip .g{background:var(--line)}"
+".sp-br{display:flex;gap:2px;margin-top:6px;font:400 11px/14px var(--font-mono);color:var(--ink-faint)}.sp-br span{border-top:1px solid var(--line-strong);padding-top:3px;overflow:hidden;white-space:nowrap}.sp-br .a{border-top-color:var(--ink);color:var(--ink-soft)}";
function css(){if(document.getElementById("sp-css"))return;var s=document.createElement("style");s.id="sp-css";s.textContent=CSS;document.head.appendChild(s)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function flag(s){return '<span class="flag" data-k="'+FK[s]+'">'+LBL[s]+'</span>'}
function meter(met,tot){var h='<div class="sp-mt" title="'+met+' of '+tot+' criteria met">';for(var i=0;i<tot;i++)h+='<i'+(i<met?' class="on"':'')+'></i>';return h+'</div>'}
function stg(k,gate){return gate?'<i style="width:8px;height:8px;display:inline-block;background:var(--ink-faint)"></i>':'<span class="stage '+k+'" style="margin:0"><i></i></span>'}
function node(n,i,sel,nq){var N=NAMES[i],gate=N[2]==="gate",h='<button class="sp-nd '+n.s+(sel?' sel':'')+'" data-i="'+i+'" aria-label="'+N[1]+', '+LBL[n.s]+'"><div class="h"><span class="g">'+stg(N[2],gate)+' '+N[1].toUpperCase()+'</span>'+flag(n.s)+'</div>';
 if(gate)h+='<div class="m">&#10003;</div><div class="l">Approved</div><div class="l">'+esc(n.line||"")+'</div><div class="x">'+(n.by?'By '+esc(n.by):'Not available')+'</div>';
 else if(n.s==="nos")h+='<div class="m t">Locked</div><div class="l">'+esc(n.gate||"Needs earlier exit")+'</div><div class="x">Decides: '+esc(n.who||"Manager")+'</div>';
 else{h+=(nq||n.days==null)?'<div class="m t">Not available</div><div class="l">Days not published</div>':'<div class="m">'+n.days+'<small>D IN STAGE</small></div>';
  if(n.met!=null&&i!==5)h+=meter(n.met,n.total||7)+'<div class="l">'+n.met+' / '+(n.total||7)+' criteria'+(n.why?' · '+esc(n.why):'')+'</div>';else if(i===5)h+='<div class="l">No exit gate</div>';
  h+='<div class="x">'+(n.s==="done"?esc((n.line||"")+(n.by?' · '+n.by:'')):'Decides: '+esc(n.who||"Manager"))+'</div>'}
 return h+'</button>'}
window.Spine={
 fromStage:function(cur,o){o=o||{};var idx={r1:0,r2:1,paper:2,sandbox:3,canary:4,live:5}[cur];if(idx==null)idx=2;var out=[];
  for(var i=0;i<6;i++){var N=NAMES[i],it={s:i<idx?"done":i===idx?(o.blocked?"blk":"cur"):"nos",by:(i<idx?"bjones":null),line:(o.dates&&o.dates[i])||null,days:(o.days&&o.days[i])!=null?o.days[i]:null,met:(i<idx&&i>=2)?7:null,who:"Manager",gate:i>idx?"Needs "+NAMES[i-1][1]+" exit":null};
   if(i===idx){it.days=o.days&&o.days[i]!=null?o.days[i]:o.cd;it.met=o.met;it.who=o.who||"Manager";it.why=o.why}out.push(it)}return out},
 render:function(host,o){css();o=o||{};var v=o.variant||"full",st=o.stages||Spine.fromStage("paper"),h;
  if(v==="mini"){h='<span class="sp-mini" role="img" aria-label="'+st.map(function(n,i){return NAMES[i][1]+' '+LBL[n.s]}).join(', ')+'">'+st.map(function(n,i){return '<i class="'+n.s+'" title="'+NAMES[i][1]+': '+LBL[n.s]+'"></i>'}).join("")+'</span>';host.innerHTML=h;return}
  if(v==="compact"){h='<div class="sp-cw"><div class="sp-cmp" role="group" aria-label="Lifecycle">'+st.map(function(n,i){var G={done:"&#10003;",cur:"&#9679;",blk:"&#10005;",nos:""};return '<button class="it '+n.s+'" data-i="'+i+'" aria-label="'+NAMES[i][1]+', '+LBL[n.s]+'"><div class="q">'+G[n.s]+'</div>'+NAMES[i][0].toUpperCase()+'</button>'}).join("")+'</div></div>'}
  else h='<div class="sp-nds" role="group" aria-label="Lifecycle">'+st.map(function(n,i){return node(n,i,i===o.sel,o.nq)}).join("")+'</div>';
  host.innerHTML=h;host._sp=o;if(!host._spw){host._spw=1;host.addEventListener("click",function(e){var b=e.target.closest("[data-i]");if(!b||!host.contains(b))return;var i=+b.getAttribute("data-i");if(host._sp.onSelect)host._sp.onSelect(i,host._sp.stages[i])})}},
 strip:function(host,o){css();o=o||{};host.innerHTML='<div class="sp-strip" role="img" aria-label="'+esc(o.label||"Stage durations")+'">'+(o.segments||[]).map(function(s){return '<i class="'+s.k+'" style="flex:'+s.f+'" title="'+esc(s.label||"")+'"></i>'}).join("")+'</div>'+(o.brackets?'<div class="sp-br">'+o.brackets.map(function(b){return '<span class="'+(b.actual?"a":"")+'" style="flex:'+b.f+'">'+esc(b.label)+'</span>'}).join("")+'</div>':"")},
 names:NAMES
};
})();
