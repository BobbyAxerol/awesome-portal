/* Trade Replay component (shared by Alpha, Account and the Blotter "open on chart" link).
   TradeReplay.mount({chart:el, log:el}, opts) -> controller. opts: symbol, interval (15m|1h|4h), candles (bool), focus (order id), partial (bool), onSelect.
   TradeReplay.sample() -> the sample orders (the Blotter reuses them so both screens agree). Candles: up = hollow blue, down = filled grey; fills use --series-2 (long) and --series-dd (short), never green/red. */
(function(){
var NS="http://www.w3.org/2000/svg",END=Date.UTC(2026,9,17,12,0),M5=300000,NB=4400,IV={"15m":3,"1h":12,"4h":48},MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function rng(s){return function(){s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
function p2(n){return(n<10?"0":"")+n}
function fx(n,d){var s=Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});return(n<0?"−":"")+s}
function fd(t,sec){var d=new Date(t);return p2(d.getUTCDate())+" "+MON[d.getUTCMonth()]+" "+p2(d.getUTCHours())+":"+p2(d.getUTCMinutes())+(sec?":"+p2(d.getUTCSeconds()):"")+"Z"}
function r2(n){return Math.round(n*100)/100}function r4(n){return Math.round(n*1e4)/1e4}
function el(t,a,txt){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
var SYM={BTCUSDT:{b:67200,v:42,s:11},ETHUSDT:{b:2480,v:2.6,s:23},SOLUSDT:{b:151.4,v:.19,s:37}},cache={};
function path(sym){if(cache[sym])return cache[sym];var c=SYM[sym],r=rng(c.s),v=c.b,o=[];for(var i=0;i<NB;i++){v+=(r()-.5)*c.v*2+Math.sin(i/260)*c.v*.18;o.push(v)}cache[sym]=o;return o}
function bi(m){return NB-1-Math.round(m/5)}
var TR=[{e:4000,x:3400,how:"tp",q:.05},{e:2900,x:2500,how:"sl",q:.04},{e:1900,x:1400,how:"tp",q:.06},{e:640,x:300,how:"manual",q:.05},{e:120,x:null,how:"open",q:.04}];
var EV=[{k:"decision",ago:5100,t:"Live approved",a:"Bobby",h:"approvals.html"},{k:"stage",ago:5000,t:"Moved to Live",a:"System",h:"alpha.html"},{k:"incident",ago:2200,t:"Broker sync diverged",a:"System",h:"incident.html"},{k:"decision",ago:800,t:"Position limit raised",a:"Bobby",h:"approvals.html"},{k:"incident",ago:260,t:"Venue feed gap, 6 min",a:"System",h:"incident.html"}];
var OBJ=null;
function sample(){if(OBJ)return OBJ;var P=path("BTCUSDT"),out=[],k=0,f=0;
 function oid(){return"ord-b7"+(0xa201+(k++)*13).toString(16)}function fid(){return"fil-b7"+(0xc310+(f++)*17).toString(16)}
 function fee(q,p){return r2(q*p*.0004)}
 TR.forEach(function(T,ti){var ie=bi(T.e),pe=r2(P[ie]),ix=T.x!=null?bi(T.x):null,pxv=ix!=null?r2(P[ix]):null,dir,tp,sl,tE=END-T.e*6e4,tX=T.x!=null?END-T.x*6e4:null;
  if(T.how==="tp")dir=pxv>pe?1:-1;else if(T.how==="sl")dir=pxv<pe?1:-1;else dir=ti===3?1:-1;
  if(T.how==="tp"){tp=pxv;sl=r2(pe-dir*Math.abs(pxv-pe)*.6)}else if(T.how==="sl"){sl=pxv;tp=r2(pe+dir*Math.abs(pxv-pe)*1.7)}else{tp=r2(pe*(1+dir*.011));sl=r2(pe*(1-dir*.006))}
  var q1=r4(T.q*.6),q2=r4(T.q-q1),p2n=r2(P[ie+1]),opp=dir>0?"sell":"buy",me=dir>0?"buy":"sell";
  var E={id:oid(),t:tE-12e4,side:me,type:"Limit",leg:"Entry",qty:T.q,price:pe,status:"Filled",trade:ti+1,dir:dir,symbol:"BTCUSDT",fills:[{id:fid(),t:tE,q:q1,p:pe,fee:fee(q1,pe)},{id:fid(),t:tE+M5,q:q2,p:p2n,fee:fee(q2,p2n)}]};
  function leg(name,px,hit){var o={id:oid(),t:tE+M5,side:opp,type:name,leg:name,qty:T.q,price:null,trigger:px,status:T.how==="open"?"Conditional":hit?"Filled":"Cancelled",trade:ti+1,dir:dir,symbol:"BTCUSDT",parent:E.id,fills:[],cancelAt:(T.how==="open"||hit)?null:tX};if(hit)o.fills=[{id:fid(),t:tX,q:T.q,p:px,fee:fee(T.q,px)}];return o}
  var L1=leg("Take profit",tp,T.how==="tp"),L2=leg("Stop loss",sl,T.how==="sl");out.push(E,L1,L2);
  if(T.how==="manual"){var cp=pxv;out.push({id:oid(),t:tX-6e4,side:opp,type:"Market",leg:"Close",qty:T.q,price:null,status:"Filled",trade:ti+1,dir:dir,symbol:"BTCUSDT",parent:E.id,fills:[{id:fid(),t:tX,q:T.q,p:cp,fee:fee(T.q,cp)}]})}});
 out.sort(function(a,b){return b.t-a.t});OBJ=out;return out}
function mount(hosts,opt){opt=opt||{};
 var C={opt:opt,sel:null,all:false,found:true},sym,k,cs=getComputedStyle(document.documentElement);
 function col(n,d){return cs.getPropertyValue(n).trim()||d}
 function visibleOrders(){return opt.symbol&&opt.symbol!=="BTCUSDT"?[]:sample()}
 function draw(){sym=opt.symbol||"BTCUSDT";k=IV[opt.interval||"1h"];drawChart();drawLog()}
 function posKind(o,fl){var pos=o.dir>0?"long":"short",role=o.leg==="Entry"?"entry":"exit";return{pos:pos,role:role,name:(pos==="long"?"Long ":"Short ")+role}}
 function drawChart(){var h=hosts.chart;h.innerHTML="";
  if(opt.candles===false){h.innerHTML='<div class="na" style="padding:12px 0">Price candles are not available yet</div>';return}
  var P=path(sym),W=h.clientWidth||900,H=330,m={l:64,r:70,t:14,b:26},iw=W-m.l-m.r,ih=H-m.t-m.b,t0=END-90*k*M5,Cd=[];
  for(var i=0;i<90;i++){var a=NB-90*k+i*k,sl=P.slice(a,a+k);Cd.push({t:t0+i*k*M5,o:sl[0],h:Math.max.apply(0,sl),l:Math.min.apply(0,sl),c:sl[k-1]})}
  var ords=visibleOrders(),fills=[],trades={};ords.forEach(function(o){var T=trades[o.trade]||(trades[o.trade]={n:o.trade,dir:o.dir,legs:{},t:null,x:null});if(o.leg==="Entry"){T.entry=o;T.t=o.fills[0].t;T.ep=o.price}else if(o.leg==="Take profit"||o.leg==="Stop loss"){T.legs[o.leg]=o;if(o.status==="Filled")T.x=o.fills[0].t}else if(o.leg==="Close")T.x=o.fills[0].t;
   o.fills.forEach(function(fl){if(fl.t>=t0&&fl.t<=END)fills.push({f:fl,o:o,k:posKind(o)})})});
  fills.sort(function(a,b){return a.f.t-b.f.t});var inV=fills.length,allN=ords.reduce(function(n,o){return n+o.fills.length},0);
  var lo=Math.min.apply(0,Cd.map(function(c){return c.l})),hi=Math.max.apply(0,Cd.map(function(c){return c.h})),pad=(hi-lo)*.12;lo-=pad;hi+=pad;
  function x(t){return m.l+iw*(t-t0)/(90*k*M5)}function y(v){return m.t+ih*(1-(v-lo)/(hi-lo))}
  var svg=el("svg",{viewBox:"0 0 "+W+" "+H,role:"img",style:"display:block;width:100%;height:auto;overflow:visible","aria-label":"Candles with fills for "+sym}),ink=col("--ink","#f4f4f4"),faint=col("--ink-faint","#8d8d8d"),soft=col("--ink-soft","#c6c6c6"),grid=col("--line","#393939"),panel=col("--panel","#1d1d1d"),cb=col("--series","#78a9ff"),s2=col("--series-2","#08bdba"),sd=col("--series-dd","#ff832b"),mono="IBM Plex Mono, monospace";
  var step=(hi-lo)/5,mag=Math.pow(10,Math.floor(Math.log10(step))),st=[1,2,2.5,5,10].map(function(z){return z*mag}).filter(function(z){return z>=step})[0]||step,tk=[];for(var v=Math.ceil(lo/st)*st;v<=hi;v+=st)tk.push(v);
  tk.forEach(function(v){var yy=y(v);svg.appendChild(el("line",{x1:m.l,x2:W-m.r,y1:yy,y2:yy,stroke:grid,opacity:.55}));svg.appendChild(el("text",{x:m.l-8,y:yy+4,"text-anchor":"end",fill:faint,"font-size":11,"font-family":mono},fx(v,sym==="BTCUSDT"?0:2)))});
  var NT=W<720?2:5;for(var q=0;q<=NT;q++){var ci=Math.round(89*q/NT),tt=Cd[ci].t;svg.appendChild(el("line",{x1:x(tt),x2:x(tt),y1:m.t+ih,y2:m.t+ih+4,stroke:faint}));svg.appendChild(el("text",{x:x(tt),y:m.t+ih+18,"text-anchor":q===0?"start":q===NT?"end":"middle",fill:faint,"font-size":11,"font-family":mono},fd(tt).slice(0,W<720?6:12)))}
  var cw=Math.max(2,iw/90*.6);
  // bracket legs (position boxes) under the candles
  var selT=C.sel?(ords.filter(function(o){return o.id===C.sel.o})[0]||{}).trade:null;
  Object.keys(trades).forEach(function(n){var T=trades[n];if(!T.entry||T.t==null)return;var xa=Math.max(m.l,x(T.t)),xb=T.x!=null?Math.min(W-m.r,x(T.x)):W-m.r;if(xb<=m.l||x(T.t)>W-m.r)return;
   var tp=T.legs["Take profit"],sl=T.legs["Stop loss"];if(!tp||!sl)return;var ye=y(T.ep),yt=y(tp.trigger),ys=y(sl.trigger),open=T.x==null,lab=open||+n===selT;
   svg.appendChild(el("rect",{x:xa,y:Math.min(ye,yt),width:Math.max(1,xb-xa),height:Math.abs(yt-ye),fill:s2,opacity:.13}));svg.appendChild(el("rect",{x:xa,y:Math.min(ye,ys),width:Math.max(1,xb-xa),height:Math.abs(ys-ye),fill:sd,opacity:.13}));
   [[tp,yt,s2,"Take profit"],[sl,ys,sd,"Stop loss"]].forEach(function(z){var used=z[0].status!=="Cancelled";svg.appendChild(el("line",{x1:xa,x2:xb,y1:z[1],y2:z[1],stroke:z[2],"stroke-width":1.4,"stroke-dasharray":used?"6 3":"1 3"}));
    if(lab){var tx=z[3]+" "+fx(z[0].trigger,2)+(z[0].status==="Cancelled"?" (cancelled)":""),ty=z[1]+(z[1]<ye?-5:13),tw=tx.length*6.5+8;svg.appendChild(el("rect",{x:xb-4-tw+4,y:ty-11,width:tw,height:15,fill:panel,opacity:.9}));svg.appendChild(el("text",{x:xb-4,y:ty,"text-anchor":"end",fill:z[2],"font-size":10.5,"font-family":mono},tx))}})});
  Cd.forEach(function(c){var xx=x(c.t+k*M5/2),up=c.c>=c.o;svg.appendChild(el("line",{x1:xx,x2:xx,y1:y(c.h),y2:y(c.l),stroke:up?cb:faint}));svg.appendChild(el("rect",{x:xx-cw/2,y:y(Math.max(c.o,c.c)),width:cw,height:Math.max(1,Math.abs(y(c.o)-y(c.c))),fill:up?panel:faint,stroke:up?cb:faint,"stroke-width":1.2}))});
  // fill markers
  var mk=[];fills.forEach(function(F){var xx=x(F.f.t),yy=y(F.f.p),entry=F.k.role==="entry",longp=F.k.pos==="long",up=(longp&&entry)||(!longp&&!entry),cy=up?yy+11:yy-11,cc=longp?s2:sd,pts=up?[[xx,cy-6],[xx-6,cy+5],[xx+6,cy+5]]:[[xx,cy+6],[xx-6,cy-5],[xx+6,cy-5]],isSel=C.sel&&C.sel.f===F.f.id;
   var g=el("g",{"data-fill":F.f.id,style:"cursor:pointer"});if(isSel){g.appendChild(el("line",{x1:xx,x2:xx,y1:m.t,y2:m.t+ih,stroke:ink,"stroke-dasharray":"2 3",opacity:.7}));g.appendChild(el("circle",{cx:xx,cy:cy,r:11,fill:"none",stroke:ink,"stroke-width":2}))}
   g.appendChild(el("polygon",{points:pts.map(function(p){return p.join(",")}).join(" "),fill:entry?cc:panel,stroke:cc,"stroke-width":1.8}));g.appendChild(el("title",{},F.k.name+" · "+fx(F.f.q,4)+" at "+fx(F.f.p,2)));
   g.addEventListener("click",function(){C.select(F.o.id,F.f.id,true)});svg.appendChild(g);mk.push(g)});
  var cross=el("line",{y1:m.t,y2:m.t+ih,stroke:ink,"stroke-width":1,opacity:.6,visibility:"hidden"});svg.appendChild(cross);
  var hit=el("rect",{x:m.l,y:m.t,width:iw,height:ih,fill:"transparent"});svg.insertBefore(hit,svg.querySelector("g[data-fill]"));
  // readout, legend, wrap
  var lgd=document.createElement("div");lgd.className="lgd";function lg(c,sh,t){return'<span><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style="vertical-align:-1px;margin-right:6px"><polygon points="'+sh+'" fill="'+(t.indexOf("exit")>0?"none":c)+'" stroke="'+c+'" stroke-width="1.6"/></svg>'+t+'</span>'}
  lgd.innerHTML=lg(s2,"6,1 1,10 11,10","Long entry")+lg(s2,"6,11 1,2 11,2","Long exit")+lg(sd,"6,11 1,2 11,2","Short entry")+lg(sd,"6,1 1,10 11,10","Short exit")+'<span><i style="border-color:'+s2+'"></i>Take-profit line</span><span><i style="border-color:'+sd+'"></i>Stop-loss line</span>';
  var rd=document.createElement("div");rd.className="rd";
  function rdIdle(){var c=Cd[89];rd.innerHTML='<span><span class="u">Last candle</span><b>'+fx(c.c,2)+'</b></span><span><span class="u">Fills in view</span>'+inV+(allN>inV?" of "+allN:"")+'</span><span><span class="u">Step</span>&larr; &rarr; between fills</span>'}
  function rdSel(F){rd.innerHTML='<span><span class="u">'+fd(F.f.t,true)+'</span><b>'+F.k.name+'</b></span><span><span class="u">Quantity</span>'+fx(F.f.q,4)+'</span><span><span class="u">Price</span>'+fx(F.f.p,2)+'</span><span><span class="u">Fee</span>'+(opt.partial&&F.o.leg!=="Entry"?'Not published':fx(F.f.fee,2)+' USDT')+'</span><span><a class="chipx mono" href="blotter.html?order='+F.o.id+'">'+F.o.id+'</a></span>'}
  var wrap=document.createElement("div");wrap.className="trw";wrap.tabIndex=0;wrap.setAttribute("aria-label","Chart. Left and right arrows step through fills.");var card=document.createElement("div");card.className="trc";
  h.appendChild(lgd);h.appendChild(rd);h.appendChild(wrap);wrap.appendChild(svg);wrap.appendChild(card);
  var selF=C.sel&&fills.filter(function(F){return F.f.id===C.sel.f})[0];if(selF)rdSel(selF);else rdIdle();
  hit.addEventListener("mousemove",function(e){var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*W/r.width,i=Math.max(0,Math.min(89,Math.floor((px-m.l)/iw*90))),c=Cd[i],xx=x(c.t+k*M5/2);cross.setAttribute("x1",xx);cross.setAttribute("x2",xx);cross.setAttribute("visibility","visible");
   var near=fills.filter(function(F){return F.f.t>=c.t&&F.f.t<c.t+k*M5});card.innerHTML='<div class="k">'+fd(c.t)+'</div><div class="m">Open '+fx(c.o,2)+' · High '+fx(c.h,2)+'<br>Low '+fx(c.l,2)+' · Close '+fx(c.c,2)+'</div>'+near.map(function(F){return'<b>'+F.k.name+'</b><div class="m">'+fx(F.f.q,4)+' at '+fx(F.f.p,2)+'</div>'}).join("");
   card.style.display="block";var left=xx*r.width/W+14;if(left+card.offsetWidth>r.width-4)left=xx*r.width/W-card.offsetWidth-14;card.style.left=Math.max(4,left)+"px";card.style.top="24px"});
  hit.addEventListener("mouseleave",function(){cross.setAttribute("visibility","hidden");card.style.display="none"});
  hit.addEventListener("click",function(){wrap.focus()});
  wrap.addEventListener("keydown",function(e){var key=e.key;if(key==="Escape"){C.select(null,null,true);return}if(key!=="ArrowLeft"&&key!=="ArrowRight")return;e.preventDefault();if(!fills.length)return;var i=C.sel?fills.map(function(F){return F.f.id}).indexOf(C.sel.f):-1;i=key==="ArrowRight"?(i<0?0:Math.min(fills.length-1,i+1)):(i<0?fills.length-1:Math.max(0,i-1));C.select(fills[i].o.id,fills[i].f.id,true,true)});
  if(C.refocus){wrap.focus();C.refocus=false}
  // event ribbon, same x scale
  var LN=[["stage","STAGE","→",col("--accent","#78a9ff")],["decision","DECISION","◈",col("--f-approval","#a56eff")],["incident","INCIDENT","▲",col("--f-incident","#fa4d56")]],RH=LN.length*18+6,rb=el("svg",{viewBox:"0 0 "+W+" "+RH,role:"group","aria-label":"Event ribbon",style:"display:block;width:100%;height:auto;margin-top:4px"});
  LN.forEach(function(L,j){rb.appendChild(el("text",{x:m.l-8,y:j*18+15,"text-anchor":"end",fill:faint,"font-size":9,"font-family":mono,"letter-spacing":".08em"},L[1]));rb.appendChild(el("line",{x1:m.l,x2:W-m.r,y1:j*18+17,y2:j*18+17,stroke:grid}))});
  var shown=0;EV.forEach(function(E){var t=END-E.ago*6e4;if(t<t0)return;shown++;var j=[0,1,2][["stage","decision","incident"].indexOf(E.k)],L=LN[j],xx=x(t),a=el("a",{href:E.h,tabindex:0,"aria-label":E.t+", "+fd(t)});a.appendChild(el("rect",{x:xx-7,y:j*18+3,width:14,height:14,fill:L[3]}));a.appendChild(el("text",{x:xx,y:j*18+13.5,"text-anchor":"middle",fill:"#0b0b0c","font-size":9,"font-weight":700,"font-family":mono},L[2]));
   function show(){card.innerHTML='<div class="k">'+LN[j][1]+'</div><b>'+esc(E.t)+'</b><div class="m">'+fd(t)+' · '+E.a+'</div>';card.style.display="block";var r=svg.getBoundingClientRect(),left=xx*r.width/W+14;if(left+card.offsetWidth>r.width-4)left=xx*r.width/W-card.offsetWidth-14;card.style.left=Math.max(4,left)+"px";card.style.top=(H*r.width/W+j*18-card.offsetHeight/2)+"px"}
   a.addEventListener("mouseenter",show);a.addEventListener("focus",show);a.addEventListener("mouseleave",function(){card.style.display="none"});a.addEventListener("blur",function(){card.style.display="none"});rb.appendChild(a)});
  wrap.appendChild(rb);
  var cap=document.createElement("div");cap.className="cap";cap.innerHTML='<span>'+(opt.interval||"1h")+' candles · 90 shown</span><span>'+inV+' of '+allN+' fills in this window</span><span>'+shown+' events in this window</span>';h.appendChild(cap);
  C.fills=fills}
 function rows(){var out=[];visibleOrders().forEach(function(o){var T=o.leg==="Entry"?"Entry":o.leg;out.push({t:o.t,ev:o.status==="Conditional"?"Armed":"Submit",o:o,f:null});o.fills.forEach(function(f){out.push({t:f.t,ev:"Fill",o:o,f:f})});if(o.status==="Cancelled")out.push({t:o.cancelAt||o.t,ev:"Cancel",o:o,f:null})});out.sort(function(a,b){return b.t-a.t});return out}
 function drawLog(){var h=hosts.log,R=rows(),n=R.length,lim=C.all||C.found===false||(C.sel&&C.sel.f)?n:Math.min(10,n);
  if(!n){h.innerHTML='<div class="empty" style="min-height:120px">No fills for '+esc(sym)+' in this window</div>';return}
  var selRel=C.sel?C.sel.o:null,html='<div class="tw"><table><thead><tr><th>Time (UTC)</th><th>Event</th><th>Order</th><th>Leg</th><th>Type · Side</th><th class="n">Qty</th><th class="n">Price / Trigger</th><th class="n">Fee</th><th>Result</th></tr></thead><tbody>';
  R.slice(0,lim).forEach(function(r,i){var o=r.o,isSel=C.sel&&((r.f&&C.sel.f===r.f.id)||(!r.f&&!C.sel.f&&selRel===o.id&&r.ev!=="Cancel")),rel=selRel===o.id&&!isSel;
   var px=r.f?fx(r.f.p,2):o.price!=null?fx(o.price,2):o.trigger!=null?fx(o.trigger,2):'<span class="na">At market</span>',q=r.f?r.f.q:o.qty,fee=r.f?(opt.partial&&o.leg!=="Entry"?'<span class="na">Not published</span>':fx(r.f.fee,2)+' USDT'):(r.ev==='Cancel'?'<span class="na">No fill</span>':'<span class="na">No fill yet</span>');
   var res=r.ev==="Fill"?(o.status==="Filled"&&o.leg!=="Entry"?o.leg==="Close"?"Closed by hand":o.leg+" reached":"Entry filled"):r.ev==="Cancel"?"Cancelled with its pair":r.ev==="Armed"?"Waiting for the price":"Sent to venue";
   html+='<tr tabindex="0" data-o="'+o.id+'"'+(r.f?' data-f="'+r.f.id+'"':"")+' class="'+(isSel?"sel":"")+'" style="cursor:pointer;'+(rel?"box-shadow:inset 3px 0 0 var(--accent)":"")+'"><td class="mono">'+fd(r.t,true)+'</td><td>'+r.ev+'</td><td><a class="chipx mono" href="blotter.html?order='+o.id+'">'+o.id+'</a></td><td>'+o.leg+'</td><td>'+o.type+' · '+(o.side==="buy"?"Buy":"Sell")+'</td><td class="n">'+fx(q,4)+'</td><td class="n">'+px+'</td><td class="n">'+fee+'</td><td>'+res+'</td></tr>'});
  html+='</tbody></table></div>';if(lim<n)html+='<div style="padding-top:10px"><button class="btn" data-all>Show all '+n+' events</button> <span class="na">Showing newest '+lim+'</span></div>';
  h.innerHTML=html;var tb=h.querySelector("tbody");
  tb.addEventListener("click",function(e){if(e.target.closest("a"))return;var tr=e.target.closest("tr");if(!tr)return;C.select(tr.getAttribute("data-o"),tr.getAttribute("data-f"),false)});
  tb.addEventListener("keydown",function(e){if(e.key==="Enter"){var tr=e.target.closest("tr");if(tr)C.select(tr.getAttribute("data-o"),tr.getAttribute("data-f"),false)}});
  var b=h.querySelector("[data-all]");if(b)b.addEventListener("click",function(){C.all=true;drawLog()});
  var s=h.querySelector("tr.sel");if(s&&C.scroll){s.scrollIntoView({block:"nearest"});C.scroll=false}}
 C.select=function(o,f,fromChart,refocus){C.sel=o?{o:o,f:f||null}:null;C.refocus=!!refocus;C.scroll=!!fromChart;drawChart();drawLog();if(opt.onSelect)opt.onSelect(C.sel)};
 C.redraw=function(){draw()};C.set=function(p){for(var k2 in p)opt[k2]=p[k2];draw()};
 if(opt.focus){var found=sample().filter(function(o){return o.id===opt.focus})[0];C.found=!!found;if(found){C.sel={o:found.id,f:found.fills.length?found.fills[0].id:null};C.scroll=true}}
 draw();return C}
var css=document.createElement("style");css.textContent=".trw{position:relative;outline-offset:2px}.trc{position:absolute;display:none;z-index:6;background:var(--cell);border:1px solid var(--line-strong);padding:8px 10px;min-width:210px;pointer-events:none;font-size:12px}.trc .k{font:500 10.5px/16px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)}.trc b{display:block;font-weight:500;margin-top:4px}.trc .m{font:400 11px/16px var(--font-mono);color:var(--ink-faint)}.trw svg a:focus-visible rect{stroke:var(--ink);stroke-width:2}.lgd svg{display:inline-block}";document.head.appendChild(css);
window.TradeReplay={mount:mount,sample:sample,fd:fd,fx:fx};
})();
