/* Capital flow module (Sankey) for Portfolio 360 > Allocations. Real-funded and Simulated are drawn as separate blocks and never summed.
   Band height = amount on its own basis. Budget is a limit, not cash: it is joined to NAV by a dashed connector that is not traversed on hover. Tokens only. */
(function(){
var NS="http://www.w3.org/2000/svg";
function E(t,a,txt){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}
function fmt(n,d){var s=Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});return(n<0?"−":"")+s}
function sg(n,d){return(n>0?"+":"")+fmt(n,d)}
var K=.00043,NW=12,N,L;
var st=document.createElement("style");st.textContent=".cap-sk text{font-family:var(--font-mono);font-size:11px;fill:var(--ink-soft);paint-order:stroke;stroke:var(--panel);stroke-width:4px;stroke-linejoin:round}.cap-sk text.b{fill:var(--ink)}.cap-sk text.h{font-size:10px;letter-spacing:.1em;fill:var(--ink-faint);stroke:none}.cap-sk text.na{fill:var(--ink-faint);font-family:var(--font-sans);font-size:11px}.cap-sk text.ln{fill:var(--accent);cursor:pointer}.cap-sk text.ln:hover{text-decoration:underline}.cap-sk .nd,.cap-sk .lk{transition:opacity .12s}.cap-sk.dim .nd:not(.hi),.cap-sk.dim .lk:not(.hi){opacity:.14}.cap-sk .lk path.l{opacity:.34}.cap-sk .lk.hi path.l{opacity:.8}.cap-sk .nd:focus{outline:none}.cap-sk .nd:focus rect.n,.cap-sk .lk:focus path{stroke:var(--accent);stroke-width:2}.cap-tip{position:absolute;pointer-events:none;background:var(--cell);border:1px solid var(--line-strong);padding:6px 8px;font:400 12px/16px var(--font-mono);color:var(--ink-soft);display:none;z-index:5;max-width:340px;white-space:normal}.cap-tip .t{color:var(--ink);margin-bottom:4px}";document.head.appendChild(st);
function nd(id,x,y,h,o){N[id]=Object.assign({id:id,x:x,y:y,h:h,w:NW},o||{})}
function lk(id,a,b,v,y0,y1,h,col,o){L.push(Object.assign({id:id,a:a,b:b,v:v,y0:y0,y1:y1,h:h,col:col},o||{}))}
var C={fund:"--series-2",pnl:"--series-3",bud:"--series",sim:"--series-sim"};
var DEP=[["d0192","live-0192 · Binance-02","btc",120000,44,51.6,114100,38030,3300],["d0193","live-0193 · OKX-01","btc",80000,95.6,34.4,73500,24500,2120.1],["d0210","live-0210 · Binance-02","eth",160000,142,68.8,132200,null,3890.12],["d0215","live-0215 · Bybit-01","sol",100000,222.8,43,61000,null,410],["d0221","live-0221 · OKX-01","car",80000,277.8,34.4,78400,null,-410]];
function build(block,o){N={};L=[];var pn=o.pnl||{};
 if(block==="sim"){
  nd("sv",300,36,107.5,{lab:"Virtual funds",val:"250,000.00",col:C.sim,sim:true,head:true,tip:["Virtual funds · Paper twin","250,000.00 USDT simulated","Never added to Real-funded"]});
  nd("sbtc",610,36,51.6,{lab:"BTC-Trend v3 paper",val:"120,000.00",col:C.sim,sim:true,href:"alpha.html",tip:["BTC-Trend v3 paper","120,000.00 USDT simulated"]});
  nd("seth",610,99.6,34.4,{lab:"ETH-Mean v2 paper",val:"80,000.00",col:C.sim,sim:true,href:"alpha.html",tip:["ETH-Mean v2 paper","80,000.00 USDT simulated"]});
  nd("shead",610,146,21.5,{lab:"Unallocated virtual",val:"50,000.00",na:"Not deployed",hatch:true,sim:true,tip:["Unallocated virtual","50,000.00 USDT simulated"]});
  lk("l_sbtc","sv","sbtc",120000,36,36,51.6,C.sim,{tip:["Virtual funds → BTC-Trend v3 paper","120,000.00 USDT simulated"]});
  lk("l_seth","sv","seth",80000,87.6,99.6,34.4,C.sim,{tip:["Virtual funds → ETH-Mean v2 paper","80,000.00 USDT simulated"]});
  lk("l_shead","sv","shead",50000,122,146,21.5,C.sim,{hatch:true,tip:["Virtual funds → Unallocated","50,000.00 USDT simulated"]});return}
 nd("init",130,56,215,{lab:"Initial funds",val:"500,000.00",col:C.fund,tip:["Initial funds","500,000.00 USDT","81.6% of NAV"]});
 nd("add",130,285,43,{lab:"Added funds",val:"100,000.00",col:C.fund,tip:["Added funds","100,000.00 USDT","16.3% of NAV"]});
 nd("pnl",130,342,6,{lab:"Net PnL since start",val:"+12,480.40",col:C.pnl,tip:["Net PnL since start","+12,480.40 USDT","After fees and funding","2.0% of NAV"]});
 nd("fund",130,376,26,{lab:"By funding source",na:"Not available",hatch:true,tip:["By funding source","Not available","No approved per-source attribution"]});
 nd("cap",300,84,263.4,{lab:"NAV",val:"612,480.40",col:C.fund,head:true,tip:["NAV","612,480.40 USDT","Initial 500,000.00 + Added 100,000.00","+ Net PnL 12,480.40"]});
 nd("ret",300,358,6,{lab:"Returned",val:"0.00",hollow:true,tip:["Returned capital","0.00 USDT"]});
 lk("l_init","init","cap",500000,56,84,215,C.fund,{tip:["Initial funds → NAV","500,000.00 USDT"]});
 lk("l_add","add","cap",100000,285,299,43,C.fund,{tip:["Added funds → NAV","100,000.00 USDT"]});
 lk("l_pnl","pnl","cap",12480.4,342,342,5.4,C.pnl,{tip:["Net PnL → NAV","+12,480.40 USDT"]});
 nd("bud",455,70,301,{lab:"Approved budget",val:"700,000.00",col:C.bud,head:true,tip:["Approved budget","700,000.00 USDT","540,000.00 allocated · 160,000.00 headroom","A limit set by the manager, not cash"]});
 var A=[["btc","BTC-Trend v3",200000,44,86],["eth","ETH-Mean v2",160000,142,68.8],["sol","SOL-Breakout v1",100000,222.8,43],["car","Funding-Carry v4",80000,277.8,34.4]],cur=70;
 A.forEach(function(a){nd(a[0],610,a[3],a[4],{lab:a[1],val:fmt(a[2],2),col:C.bud,href:"alpha.html",tip:[a[1],"Budget "+fmt(a[2],2)+" USDT"]});lk("l_"+a[0],"bud",a[0],a[2],cur,a[3],a[4],C.bud,{tip:["Approved budget → "+a[1],fmt(a[2],2)+" USDT"]});cur+=a[4]});
 nd("head",610,324.2,68.8,{lab:"Headroom",val:"160,000.00",na:"Not deployed",hatch:true,tip:["Headroom","160,000.00 USDT","Approved, not allocated"]});
 DEP.forEach(function(d){var bu=d[3],ex=d[6],p=pn[d[0]]!=null?pn[d[0]]:d[8];nd(d[0],775,d[4],d[5],{lab:d[1],val:fmt(bu,2),col:C.bud,exp:ex,mar:d[7],pl:p,dep:true,href:"deployment.html",tip:[d[1],"Budget "+fmt(bu,2)+" USDT","Exposure "+fmt(ex,2)+" ("+(ex/bu*100).toFixed(1)+"% of budget)",d[7]!=null?"Margin used "+fmt(d[7],2)+" (venue)":"Margin used: Not available",(o.winLabel||"90D")+" Net PnL "+sg(p,2)]});
  lk("l_"+d[0],d[2],d[0],bu,d[4],d[4],d[5],C.bud,{tip:[d[1],"Budget "+fmt(bu,2)+" USDT"]})})}
function adj(id,dir){var seen={},q=[id];seen[id]=1;while(q.length){var c=q.pop();L.forEach(function(l){if(l.lim)return;if(dir>=0&&l.a===c&&!seen[l.b]){seen[l.b]=1;q.push(l.b)}if(dir<=0&&l.b===c&&!seen[l.a]){seen[l.a]=1;q.push(l.a)}})}return seen}
function flagSvg(x,y,w,txt,k,glyph){var g=E("g",{});g.appendChild(E("rect",{x:x,y:y,width:w,height:16,style:"fill:var(--f-"+k+"-bg);stroke:var(--f-"+k+")"}));g.appendChild(E("rect",{x:x,y:y,width:3,height:16,style:"fill:var(--f-"+k+")"}));g.appendChild(E("text",{x:x+9,y:y+12,style:"fill:var(--f-"+k+");font-size:10.5px;letter-spacing:.06em;stroke:none"},glyph+" "+txt));return g}
function draw(host,o){o=o||{};var block=o.block||"real",nq=!!o.nq;host._redraw=function(){draw(host,o)};build(block,o);
 var W=1200,H=block==="sim"?184:436,svg=E("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":block==="sim"?"Capital flow, Simulated block":"Capital flow, Real-funded block",class:"cap-sk"});
 var defs=E("defs",{});[["pH","--ink-faint"],["pS","--series-sim"],["pR","--f-recall"]].forEach(function(p){var pt=E("pattern",{id:p[0]+host.id,width:6,height:6,patternUnits:"userSpaceOnUse",patternTransform:"rotate(45)"});pt.appendChild(E("line",{x1:0,y1:0,x2:0,y2:6,style:"stroke:var("+p[1]+");stroke-width:1.4"}));defs.appendChild(pt)});svg.appendChild(defs);
 var heads=block==="sim"?[["VIRTUAL FUNDS",300,"start"],["ALPHA PAPER TWIN",610,"start"]]:[["FUNDS IN",0,"start"],["NAV",300,"start"],["APPROVED BUDGET",455,"start"],["ALPHA",610,"start"],["DEPLOYMENT",775,"start"],["EXPOSURE",1040,"end"],["MARGIN",1118,"end"],["PNL · "+(o.winLabel||"90D"),1198,"end"]];
 heads.forEach(function(h){svg.appendChild(E("text",{x:h[1],y:14,"text-anchor":h[2],class:"h"},h[0]))});svg.appendChild(E("line",{x1:0,x2:W,y1:22,y2:22,style:"stroke:var(--line)"}));
 var patId=function(sim){return"url(#"+(sim?"pS":"pH")+host.id+")"};
 if(nq){ // structure only: hatched outline nodes, no links, no values
  Object.keys(N).forEach(function(id){var n=N[id];svg.appendChild(E("rect",{x:n.x,y:n.y,width:n.w,height:Math.max(n.h,8),style:"fill:"+patId(n.sim)+";stroke:"+(n.sim?"var(--series-sim)":"var(--ink-faint)")+";stroke-dasharray:3 2"}));
   var cy=n.y+n.h/2,left=(id==="init"||id==="add"||id==="pnl"||id==="fund"||id==="sv"&&false);
   svg.appendChild(E("text",left?{x:120,y:cy+3,"text-anchor":"end"}:{x:n.x+n.w+8,y:cy-1,class:"b"},n.lab));svg.appendChild(E("text",left?{x:120,y:cy+16,"text-anchor":"end",class:"na"}:{x:n.x+n.w+8,y:cy+12,class:"na"},"Not available · Source not qualified"))});
  host.innerHTML="";host.classList.add("chart");host.style.position="relative";host.appendChild(svg);return}
 // limit connector (real only)
 if(block==="real"){var lim={id:"lim",a:"cap",b:"bud",lim:true,tip:["Budget limit","Approved 700,000.00 vs NAV 612,480.40","A limit set by the manager. Not funded by specific cash flows."]};L.push(lim);
  var gl=E("g",{"data-id":"lim",class:"lk",tabindex:0,role:"img","aria-label":lim.tip.join(". ")});gl.appendChild(E("path",{d:"M312,215 L455,215",style:"stroke:var(--ink-soft);stroke-width:1.5;stroke-dasharray:6 4;fill:none"}));
  gl.appendChild(E("rect",{x:338,y:205,width:92,height:20,style:"fill:var(--paper);stroke:var(--line-strong)"}));gl.appendChild(E("text",{x:384,y:219,"text-anchor":"middle",style:"fill:var(--ink-soft);font-size:10px;letter-spacing:.06em;stroke:none"},"LIMIT · NOT CASH"));svg.appendChild(gl)}
 var gLinks=E("g",{});svg.appendChild(gLinks);
 L.forEach(function(l){if(l.lim)return;var a=N[l.a],b=N[l.b],x0=a.x+a.w,x1=b.x,xm=(x0+x1)/2,y0=l.y0,y1=l.y1,h=Math.max(l.h,1);
  function band(hh){return"M"+x0+","+y0+" C"+xm+","+y0+" "+xm+","+y1+" "+x1+","+y1+" L"+x1+","+(y1+hh)+" C"+xm+","+(y1+hh)+" "+xm+","+(y0+hh)+" "+x0+","+(y0+hh)+" Z"}
  var g=E("g",{"data-id":l.id,class:"lk",tabindex:0,role:"img","aria-label":l.tip.join(". ")});g.appendChild(E("path",{d:band(h),class:"l",style:"fill:var("+l.col+")"}));
  if(l.hatch)g.appendChild(E("path",{d:band(h),style:"fill:"+patId(true)}));
  if(l.id==="l_d0192"){g.appendChild(E("path",{d:band(20000*K),style:"fill:url(#pR"+host.id+")"}));g.appendChild(E("path",{d:band(20000*K),style:"fill:none;stroke:var(--f-recall);stroke-width:1"}))}
  gLinks.appendChild(g)});
 var gN=E("g",{});svg.appendChild(gN);
 Object.keys(N).forEach(function(id){var n=N[id],g=E("g",{"data-id":id,class:"nd",tabindex:0,role:"img","aria-label":n.tip.join(". ")});
  if(n.hatch)g.appendChild(E("rect",{x:n.x,y:n.y,width:n.w,height:n.h,class:"n",style:"fill:"+patId(n.sim)+";stroke:"+(n.sim?"var(--series-sim)":"var(--ink-faint)")+";stroke-dasharray:3 2"}));
  else if(n.hollow)g.appendChild(E("rect",{x:n.x,y:n.y,width:n.w,height:n.h,class:"n",style:"fill:var(--paper);stroke:var(--ink-soft)"}));
  else g.appendChild(E("rect",{x:n.x,y:n.y,width:n.w,height:n.h,class:"n",style:"fill:var("+(n.col||"--ink-faint")+");stroke:var("+(n.col||"--ink-faint")+")"}));
  var cy=n.y+n.h/2;
  function nameText(x,y,txt,anchor){var t=E("text",{x:x,y:y,class:n.href?"ln":"b","text-anchor":anchor||"start"},txt);if(n.href)t.addEventListener("click",function(){location.href=n.href});return t}
  if(id==="init"||id==="add"||id==="pnl"||id==="fund"){g.appendChild(E("text",{x:120,y:cy-2,"text-anchor":"end"},n.lab));g.appendChild(E("text",{x:120,y:cy+11,"text-anchor":"end",class:n.na?"na":"b"},n.na||n.val))}
  else if(n.head){g.appendChild(E("text",{x:n.x+n.w+8,y:n.y-6,class:"b"},n.val));g.appendChild(E("text",{x:n.x+n.w+8,y:n.y+8,style:"font-family:var(--font-sans)"},n.lab))}
  else if(id==="ret")g.appendChild(E("text",{x:n.x+n.w+8,y:n.y+6,style:"font-family:var(--font-sans)"},n.lab+" "+n.val));
  else if(n.dep){var up=id==="d0192"?10:0;g.appendChild(nameText(n.x+n.w+8,cy-3-up,n.lab));g.appendChild(E("text",{x:n.x+n.w+8,y:cy+11-up},"Budget "+n.val))}
  else{g.appendChild(nameText(n.x+n.w+8,cy-2,n.lab));g.appendChild(E("text",{x:n.x+n.w+8,y:cy+11,class:n.na?"na":""},n.na?n.val+" · "+n.na:n.val))}
  gN.appendChild(g);
  if(n.dep){var ex=n.exp,r=ex/parseFloat(n.val.replace(/,/g,""));
   g.appendChild(E("text",{x:1040,y:cy-1,"text-anchor":"end",class:"b"},fmt(ex,2)));g.appendChild(E("rect",{x:974,y:cy+5,width:66,height:3,style:"fill:var(--line)"}));g.appendChild(E("rect",{x:974,y:cy+5,width:66*r,height:3,style:"fill:var(--series)"}));
   if(n.mar!=null)g.appendChild(E("text",{x:1118,y:cy+4,"text-anchor":"end",class:"b"},fmt(n.mar,2)));else{g.appendChild(E("text",{x:1118,y:cy-1,"text-anchor":"end",class:"na"},"Not available"));g.appendChild(E("text",{x:1118,y:cy+11,"text-anchor":"end",class:"na",style:"font-size:10px"},"Not published"))}
   g.appendChild(E("text",{x:1198,y:cy+4,"text-anchor":"end",style:"fill:var("+(n.pl>=0?"--ink":"--series-dd")+");font-weight:500"},sg(n.pl,2)))}});
 if(block==="real"){
  svg.appendChild(flagSvg(791,N.d0192.y+N.d0192.h/2+7,112,"RECALL","recall","↩"));svg.appendChild(flagSvg(909,N.d0192.y+N.d0192.h/2+7,64,"SHARED","na","⇄"));
  svg.appendChild(flagSvg(791,N.d0210.y+N.d0210.h/2+16,96,"LOCKED","paused","❚❚"));svg.appendChild(flagSvg(893,N.d0210.y+N.d0210.h/2+16,64,"SHARED","na","⇄"));
  var tot=0;DEP.forEach(function(d){tot+=(o.pnl&&o.pnl[d[0]]!=null)?o.pnl[d[0]]:d[8]});
  svg.appendChild(E("line",{x1:900,x2:W,y1:402,y2:402,style:"stroke:var(--line-strong)"}));svg.appendChild(E("text",{x:900,y:420,class:"h"},"TOTAL"));svg.appendChild(E("text",{x:1040,y:420,"text-anchor":"end",class:"b"},"459,200.00"));svg.appendChild(E("text",{x:1118,y:420,"text-anchor":"end",class:"na"},"Per account"));svg.appendChild(E("text",{x:1198,y:420,"text-anchor":"end",class:"b",style:"font-weight:500"},sg(tot,2)))}
 host.innerHTML="";host.classList.add("chart");host.style.position="relative";host.appendChild(svg);
 var tip=document.createElement("div");tip.className="cap-tip";host.appendChild(tip);
 function hi(id,isLink){var set={},s1=adj(id,-1),s2=adj(id,1);Object.keys(s1).concat(Object.keys(s2)).forEach(function(k){set[k]=1});svg.classList.add("dim");svg.querySelectorAll(".nd,.lk").forEach(function(e){e.classList.remove("hi")});
  if(isLink){var l=L.filter(function(x){return x.id===id})[0];if(l&&!l.lim){set={};var u=adj(l.a,-1),d=adj(l.b,1);Object.keys(u).concat(Object.keys(d)).forEach(function(k){set[k]=1})}else set={cap:1,bud:1,lim:1}}
  Object.keys(set).forEach(function(k){var e=svg.querySelector('[data-id="'+k+'"]');if(e)e.classList.add("hi")});
  L.forEach(function(l){if(l.lim)return;if(set[l.a]&&set[l.b]){var e=svg.querySelector('[data-id="'+l.id+'"]');if(e)e.classList.add("hi")}});
  if(isLink||id==="lim"){var e2=svg.querySelector('[data-id="'+id+'"]');if(e2)e2.classList.add("hi")}if(id==="cap"||id==="bud"){var li=svg.querySelector('[data-id="lim"]');if(li)li.classList.add("hi")}}
 function tipFor(id,x,y){var o2=N[id]||L.filter(function(l){return l.id===id})[0];if(!o2||!o2.tip)return;tip.innerHTML='<div class="t">'+o2.tip[0]+'</div>'+o2.tip.slice(1).map(function(t){return"<div>"+t+"</div>"}).join("");tip.style.display="block";var hr=host.getBoundingClientRect(),lx=x-hr.left+14;lx=Math.min(lx,host.clientWidth-tip.offsetWidth-4);tip.style.left=Math.max(4,lx)+"px";tip.style.top=(y-hr.top+14)+"px"}
 function clear(){svg.classList.remove("dim");svg.querySelectorAll(".hi").forEach(function(e){e.classList.remove("hi")});tip.style.display="none"}
 svg.querySelectorAll(".nd,.lk").forEach(function(e){var id=e.getAttribute("data-id"),isL=e.classList.contains("lk");
  e.addEventListener("mouseenter",function(ev){hi(id,isL);tipFor(id,ev.clientX,ev.clientY)});e.addEventListener("mousemove",function(ev){tipFor(id,ev.clientX,ev.clientY)});e.addEventListener("mouseleave",clear);
  e.addEventListener("focus",function(){hi(id,isL);var r=e.getBoundingClientRect();tipFor(id,r.right,r.top)});e.addEventListener("blur",clear)})}
/* table view of the same hierarchy: accessibility alternative */
function tableHTML(nq,pnl,wl){var C=function(v,r){return nq?'<span class="na">Not available</span><span class="why">'+r+'</span>':v},sgn=function(v){return'<span class="'+(v<0?"neg":"")+'">'+sg(v,2)+'</span>'};
 var rows=[["grp","Core","700,000.00","Recall 20,000.00","459,200.00","Per account"],["","BTC-Trend v3","200,000.00","","187,600.00",""],["kid","live-0192 · Binance-02","120,000.00","Recall pending","114,100.00","38,030.00"],["kid","live-0193 · OKX-01","80,000.00","","73,500.00","24,500.00"],["","ETH-Mean v2","160,000.00","Locked","132,200.00",""],["","SOL-Breakout v1","100,000.00","","61,000.00",""],["","Funding-Carry v4","80,000.00","","78,400.00",""]];
 return'<thead><tr><th>Node</th><th class="n">Budget</th><th>Pending / lock</th><th class="n">Exposure</th><th class="n">Margin used</th></tr></thead><tbody>'+rows.map(function(r){return'<tr class="'+r[0]+'"><td>'+r[1]+'</td><td class="n">'+C(r[2],"Source not qualified")+'</td><td>'+(r[3]&&!nq?'<span class="flag" data-k="'+(r[3].indexOf("Lock")>=0?"paused":"recall")+'">'+r[3]+'</span>':"")+'</td><td class="n">'+C(r[4],"Source not qualified")+'</td><td class="n">'+(r[5]===""?"":C(r[5],"Source not qualified"))+'</td></tr>'}).join("")+'</tbody>'}
window.CapitalFlow={draw:draw,tableHTML:tableHTML,DEP:DEP};
})();
