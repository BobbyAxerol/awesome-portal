/* Compare module: sample data model + overlay chart + metric table. Tokens only (--series, --series-2/3/4). No green/red series. */
(function(){
var NS="http://www.w3.org/2000/svg";
function E(t,a,txt){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}
function fmt(n,d){var s=Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});return(n<0?"−":"")+s}
function sg(n,d){return(n>0?"+":"")+fmt(n,d)}
function rng(s){return function(){s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
var PF=[
 {id:"core",n:"Core",sub:"pf_0001",mgr:"M. Tran",base:612480.4,pnl:9310.22,ret:1.6,vol:.28,seed:11,alpha:4,dep:5,al:5,ac:540000,hhi:.28,h:["ok","OK"]},
 {id:"sat",n:"Satellite",sub:"pf_0002",mgr:"L. Nguyen",base:380205,pnl:33420.1,ret:9.7,vol:.7,seed:23,alpha:6,dep:8,al:8,ac:350000,hhi:.31,h:["recall","Recall"]},
 {id:"can",n:"Canary",sub:"pf_0003",mgr:"L. Nguyen",base:256000,pnl:-1540,ret:-.6,vol:.42,seed:37,alpha:3,dep:3,al:3,ac:240000,hhi:.52,h:["ok","OK"]},
 {id:"hed",n:"Hedge",sub:"pf_0004",mgr:"P. Okafor",base:188640.75,pnl:2310.4,ret:1.2,vol:.2,seed:41,alpha:4,dep:6,al:6,ac:170000,hhi:.24,h:["stale","Stale"]},
 {id:"pil",n:"Pilot",sub:"pf_0006",mgr:"M. Tran",base:40000,pnl:610,ret:1.5,vol:.16,seed:53,alpha:1,dep:1,al:1,ac:35000,hhi:1,h:["ok","OK"]},
 {id:"bas",n:"Basis-Arb",sub:"pf_0005",mgr:"P. Okafor",base:96000,alpha:2,dep:2,al:2,ac:90000,hhi:null,h:["partial","Partial"],dis:"Return not available"},
 {id:"jpy",n:"Yen-Carry",cur:"JPY",dis:"Other currency"},{id:"vnd",n:"Asia-Pool",cur:"VND",dis:"Other currency"}];
var AL=[
 {id:"btc",n:"BTC-Trend v3",sub:"Live",base:200000,pnl:5420.1,ret:2.7,vol:.45,seed:61},{id:"eth",n:"ETH-Mean v2",sub:"Live",base:160000,pnl:3890.12,ret:2.4,vol:.4,seed:71},
 {id:"sol",n:"SOL-Breakout v1",sub:"Live",base:100000,pnl:410,ret:.4,vol:.5,seed:83},{id:"car",n:"Funding-Carry v4",sub:"Live",base:80000,pnl:-410,ret:-.5,vol:.3,seed:97},{id:"avx",n:"AVAX-Rev v1",dis:"No allocation"}];
var COL=["--series","--series-2","--series-3","--series-4"],DASH=["","","7 4","2 4"];
function win(){return(window.KIT&&KIT.state.win)||"90"}
function winN(w){w=w||win();return w==="7"?8:w==="30"?31:w==="90"?91:241}
function winL(w){return{"7":"7D","30":"30D","90":"90D","all":"ALL"}[w||win()]}
function raw(e){if(e._raw)return e._raw;var r=rng(e.seed),P=[0];for(var i=1;i<241;i++)P.push(P[i-1]+(r()-.5)*e.vol*3.46);var d=P[240]-P[210],ramp=e.ret-d;for(var j=211;j<241;j++)P[j]+=ramp*(j-210)/30;e._raw=P;return P}
function ser(e,w){var n=winN(w),P=raw(e),s=241-n,R=[];for(var i=0;i<n;i++)R.push(P[s+i]-P[s]);var f=e.pnl/e.ret;return{R:R,Pn:R.map(function(v){return v*f})}}
function metrics(e,w){var s=ser(e,w),n=s.R.length,end=s.Pn[n-1],b0=e.base-end,pk=-1e18,dd=0,cur=0;s.Pn.forEach(function(v){var nav=b0+v;pk=Math.max(pk,nav);cur=(nav/pk-1)*100;dd=Math.min(dd,cur)});return{ret:s.R[n-1],pnl:end,dd:dd,ddNow:cur,b0:b0}}
function by(kind,id){return(kind==="al"?AL:PF).filter(function(e){return e.id===id})[0]}
function list(kind){return kind==="al"?AL:PF}
function nice(lo,hi,k){var span=hi-lo,step=Math.pow(10,Math.floor(Math.log10(span/k))),e=span/k/step;step*=e<1.5?1:e<3?2:e<7?5:10;var a=Math.floor(lo/step)*step,t=[];for(var v=a;v<=hi+step*.001;v+=step)t.push(v);return t}
var st=document.createElement("style");st.textContent=".cmp .rd .sw{display:inline-block;width:10px;height:10px;margin-right:6px}.cmp svg{display:block;width:100%;height:auto;overflow:visible}.cmp-hat{background:repeating-linear-gradient(135deg,transparent 0 5px,var(--line) 5px 6px);border:1px dashed var(--line-strong);min-height:300px;display:grid;place-items:center;color:var(--ink-faint)}";document.head.appendChild(st);

function draw(host,es,o){o=o||{};var mode=o.mode||"ret";host._redraw=function(){draw(host,es,o)};
 if(o.nq){host.innerHTML='<div class="cmp-hat">Not available · Source not qualified</div>';return}
 var n=winN(),W=host.clientWidth||900,H=o.h||330,m={l:62,r:150,t:16,b:28},iw=W-m.l-m.r,ih=H-m.t-m.b;
 var S=es.map(function(e){var s=ser(e);return mode==="ret"?s.R:s.Pn});var all=[].concat.apply([],S),lo=Math.min.apply(0,all.concat([0])),hi=Math.max.apply(0,all.concat([0])),pad=(hi-lo)*.1||1;lo-=pad;hi+=pad;var tk=nice(lo,hi,6);lo=tk[0];hi=tk[tk.length-1];
 function x(i){return m.l+iw*i/(n-1)}function y(v){return m.t+ih*(1-(v-lo)/(hi-lo))}
 var lab=function(v,d){return mode==="ret"?sg(v,d==null?2:d)+"%":sg(v,0)};
 var start=new Date(Date.UTC(2026,9,17)-(n-1)*864e5),mono="IBM Plex Mono, monospace";
 var svg=E("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":"Comparison of "+es.map(function(e){return e.n}).join(", ")});
 tk.forEach(function(v){var yy=y(v);svg.appendChild(E("line",{x1:m.l,x2:W-m.r,y1:yy,y2:yy,style:"stroke:var(--line);opacity:"+(Math.abs(v)<1e-9?1:.55)}));svg.appendChild(E("text",{x:m.l-8,y:yy+4,"text-anchor":"end",style:"fill:var(--ink-faint);font-size:11px;font-family:"+mono},mode==="ret"?fmt(v,1)+"%":fmt(v,0)))});
 var xt=[];for(var q=0;q<6;q++){var qi=Math.round((n-1)*q/5);if(xt.indexOf(qi)<0)xt.push(qi)}
 xt.forEach(function(i){var d=new Date(start.getTime()+i*864e5);svg.appendChild(E("line",{x1:x(i),x2:x(i),y1:m.t+ih,y2:m.t+ih+4,style:"stroke:var(--ink-faint)"}));svg.appendChild(E("text",{x:x(i),y:m.t+ih+19,"text-anchor":i===0?"start":i===n-1?"end":"middle",style:"fill:var(--ink-faint);font-size:11px;font-family:"+mono},n>120?d.toISOString().slice(0,7):d.toISOString().slice(5,10)))});
 es.forEach(function(e,k){var pts=S[k].map(function(v,i){return x(i)+","+y(v)}).join(" ");svg.appendChild(E("polyline",{points:pts,fill:"none",style:"stroke:var("+COL[k]+");stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round","stroke-dasharray":DASH[k]}))});
 var ends=es.map(function(e,k){return{k:k,y:y(S[k][n-1]),v:S[k][n-1],n:e.n}}).sort(function(a,b){return a.y-b.y});for(var i=1;i<ends.length;i++)if(ends[i].y-ends[i-1].y<24)ends[i].y=ends[i-1].y+24;
 ends.forEach(function(p){var yy=y(S[p.k][n-1]);svg.appendChild(E("circle",{cx:x(n-1),cy:yy,r:4.5,style:"fill:var("+COL[p.k]+");stroke:var(--panel);stroke-width:2"}));var t=p.n+"  "+lab(p.v,mode==="ret"?1:0),w=t.length*6.8+16;
  svg.appendChild(E("line",{x1:x(n-1)+5,x2:W-m.r+8,y1:yy,y2:p.y,style:"stroke:var("+COL[p.k]+")"}));svg.appendChild(E("rect",{x:W-m.r+8,y:p.y-11,width:w,height:22,style:"fill:var("+COL[p.k]+")"}));svg.appendChild(E("text",{x:W-m.r+16,y:p.y+4,style:"fill:#0b0b0c;font-size:11.5px;font-weight:600;font-family:"+mono},t))});
 var cross=E("line",{y1:m.t,y2:m.t+ih,style:"stroke:var(--ink);opacity:.7",visibility:"hidden"});svg.appendChild(cross);
 var dots=es.map(function(e,k){var c=E("circle",{r:5,style:"fill:var("+COL[k]+");stroke:var(--ink);stroke-width:2",visibility:"hidden"});svg.appendChild(c);return c});
 var hit=E("rect",{x:m.l,y:m.t,width:iw,height:ih,fill:"transparent",tabindex:0,"aria-label":"Chart. Use left and right arrows."});svg.appendChild(hit);
 var rd=document.createElement("div");rd.className="rd";host.classList.add("cmp");host.innerHTML="";host.appendChild(rd);host.appendChild(svg);
 function rdFor(i){var d=new Date(start.getTime()+i*864e5);rd.innerHTML='<span><span class="u">'+d.toISOString().slice(0,10)+' UTC</span></span>'+es.map(function(e,k){return'<span><span class="sw" style="background:var('+COL[k]+')"></span><span class="u">'+e.n+'</span><b>'+lab(S[k][i])+'</b></span>'}).join("")}
 rdFor(n-1);
 function show(i){i=Math.max(0,Math.min(n-1,i));cross.setAttribute("x1",x(i));cross.setAttribute("x2",x(i));cross.setAttribute("visibility","visible");dots.forEach(function(c,k){c.setAttribute("cx",x(i));c.setAttribute("cy",y(S[k][i]));c.setAttribute("visibility","visible")});rdFor(i);return i}
 var cur=n-1;hit.addEventListener("mousemove",function(ev){var r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)*W/r.width;cur=show(Math.round((px-m.l)/iw*(n-1)))});
 hit.addEventListener("mouseleave",function(){cross.setAttribute("visibility","hidden");dots.forEach(function(c){c.setAttribute("visibility","hidden")});rdFor(n-1)});
 hit.addEventListener("keydown",function(ev){if(ev.key==="ArrowLeft")cur=show(cur-1);else if(ev.key==="ArrowRight")cur=show(cur+1);else if(ev.key==="Escape")hit.dispatchEvent(new Event("mouseleave"))})}

function table(t,es,o){o=o||{};var kind=o.kind||"pf",wl=winL(),nq=o.nq,M=nq?[]:es.map(function(e){return metrics(e)});
 function best(vals){return vals.reduce(function(a,v,i){return v>vals[a]?i:a},0)}
 var bp=nq?-1:best(M.map(function(m){return m.pnl})),br=nq?-1:best(M.map(function(m){return m.ret})),bd=nq?-1:best(M.map(function(m){return m.dd}));
 var NA=function(r){return'<span class="na">Not available</span><span class="why" style="text-align:right">'+r+'</span>'};
 var head='<thead><tr><th>Metric</th>'+es.map(function(e,k){return'<th class="n"><span style="display:inline-block;width:10px;height:10px;margin-right:6px;background:var('+COL[k]+')"></span>'+e.n+'</th>'}).join("")+'</tr></thead>';
 function row(l,cells,bi,wl2){return'<tr><td data-l="Metric">'+l+'</td>'+cells.map(function(c,i){return'<td class="n" data-l="'+es[i].n+'">'+(bi>=0?(i===bi?'<span title="Best in row" style="display:inline-block;width:8px;height:8px;background:var(--ink);margin-right:8px"></span>':'<span style="display:inline-block;width:8px;height:8px;margin-right:8px"></span>'):"")+c+'</td>'}).join("")+'</tr>'}
 var P=function(v,cls){return'<span class="'+(cls||"")+'">'+v+'</span>'},sc=function(v){return v>=0?"pos":"neg"};
 t.className="cards";
 t.innerHTML=head+'<tbody>'+row(kind==="pf"?"NAV · USDT":"Allocation · USDT",es.map(function(e){return nq?NA("Source not qualified"):fmt(e.base,2)}),-1)
  +row("Net PnL · "+wl+" · USDT",es.map(function(e,i){return nq?NA("Fees incomplete"):P(sg(M[i].pnl,2),sc(M[i].pnl))}),bp)
  +row("Return · "+wl+" · Modified Dietz",es.map(function(e,i){return nq?NA("Method not certified"):P(sg(M[i].ret,1)+"%",sc(M[i].ret))}),br)
  +row("Max drawdown · "+wl,es.map(function(e,i){return nq?NA("Needs a NAV series"):P(fmt(M[i].dd,1)+"%","")}),bd)
  +row("Score",es.map(function(){return'<span class="na">Not scored</span>'}),-1)+'</tbody>'}
window.Compare={PF:PF,AL:AL,COL:COL,list:list,by:by,ser:ser,metrics:metrics,winN:winN,winL:winL,draw:draw,table:table,fmt:fmt,sg:sg};
})();
