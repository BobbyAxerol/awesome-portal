(function(){
var NS="http://www.w3.org/2000/svg";
function rng(s){return function(){s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
function fmt(n,d){var s=Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d||0,maximumFractionDigits:d||0});return(n<0?"−":"")+s}
function sgn(n,d){return(n>0?"+":"")+fmt(n,d)}
function el(t,a,txt){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}
function series(seed,n,drift,vol,start){var r=rng(seed),v=start,o=[];for(var i=0;i<n;i++){v+=drift+(r()-.5)*vol;o.push(v)}return o}
function nice(lo,hi,k){var span=hi-lo,step=Math.pow(10,Math.floor(Math.log10(span/k))),e=span/k/step;step*=e<1.5?1:e<3?2:e<7?5:10;var a=Math.floor(lo/step)*step,t=[];for(var v=a;v<=hi+step*.001;v+=step)t.push(v);return t}
function css(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
// Equity + drawdown: heavy line, gradient area, readout bar, high/low flags, flow pins, event strip, ghost + band

function winN(w){return w==="7"?8:w==="30"?31:w==="90"?91:241}
window.equityChart=function(host,o){
 o=o||{};host._o=o;host._redraw=function(){window.equityChart(host,o)};
 var W=host.clientWidth||760,H=o.h||280,DH=o.drawdown===false?0:84,gap=DH?22:0,RB=0,m={l:60,r:78,t:28,b:26},iw=W-m.l-m.r,ih=H-m.t-m.b;
 var n=o.n||winN((window.KIT&&KIT.state.win)||"90"),data=o.data&&o.data.length===n?o.data:series(o.seed||7,n,(o.drift||420)*(91/n)*(n>91?.5:1),o.vol||2600,0),start=new Date((o.endDate?Date.parse(o.endDate):Date.UTC(2026,9,17))-(n-1)*864e5);
 if(o.end!=null){var f0=data[n-1];data=data.map(function(v,i){return v+(o.end-f0)*i/(n-1)})}
 var mode=o.mode||"pnl",base=o.base||1000000;var Y=data.map(function(v){return mode==="eq"?base+v:mode==="ret"?v/base*100:v});
 var lo=Math.min.apply(0,Y),hi=Math.max.apply(0,Y);if(o.band){lo=Math.min(lo,o.band.lo);hi=Math.max(hi,o.band.hi)}var pad=(hi-lo)*.1||1;lo-=pad;hi+=pad;var tk=nice(lo,hi,4);lo=tk[0];hi=tk[tk.length-1];
 function x(i){return m.l+iw*i/(n-1)}function y(v){return m.t+ih*(1-(v-lo)/(hi-lo))}
 var svg=el("svg",{viewBox:"0 0 "+W+" "+(H+gap+DH),role:"img","aria-label":o.label||"Performance chart"});
 var cs=getComputedStyle(document.documentElement),c=function(k,d){return cs.getPropertyValue(k).trim()||d},line=c("--series","#78a9ff"),dd=c("--series-dd","#ff832b"),sim=c("--series-sim","#be95ff"),faint=c("--ink-faint","#8d8d8d"),ink=c("--ink","#f4f4f4"),grid=c("--line","#393939"),panel=c("--panel","#1d1d1d"),cell=c("--cell","#262626"),teal=c("--series-2","#08bdba"),mono="IBM Plex Mono, monospace";
 var defs=el("defs",{});var gid="g"+host.id;var lg=el("linearGradient",{id:gid,x1:0,y1:0,x2:0,y2:1});lg.appendChild(el("stop",{offset:"0%","stop-color":line,"stop-opacity":.34}));lg.appendChild(el("stop",{offset:"100%","stop-color":line,"stop-opacity":.02}));defs.appendChild(lg);
 var pat=el("pattern",{id:"hat"+host.id,width:7,height:7,patternUnits:"userSpaceOnUse",patternTransform:"rotate(45)"});pat.appendChild(el("line",{x1:0,y1:0,x2:0,y2:7,stroke:sim,"stroke-width":1.4,opacity:.7}));defs.appendChild(pat);svg.appendChild(defs);
 tk.forEach(function(v){var yy=y(v);svg.appendChild(el("line",{x1:m.l,x2:W-m.r,y1:yy,y2:yy,stroke:grid,"stroke-width":1,opacity:v===0?1:.55}));svg.appendChild(el("text",{x:m.l-8,y:yy+4,"text-anchor":"end",fill:faint,"font-size":11,"font-family":mono},mode==="ret"?fmt(v,1)+"%":fmt(v,0)))});
 var xt=[];var nt=Math.max(2,Math.min(6,Math.floor(iw/110)+1));for(var q=0;q<nt;q++){var qi=Math.round((n-1)*q/(nt-1));if(xt.indexOf(qi)<0)xt.push(qi)}
 xt.forEach(function(i){var d=new Date(start.getTime()+i*864e5);svg.appendChild(el("line",{x1:x(i),x2:x(i),y1:m.t+ih,y2:m.t+ih+4,stroke:faint}));svg.appendChild(el("text",{x:x(i),y:m.t+ih+18,"text-anchor":i===0?"start":i===n-1?"end":"middle",fill:faint,"font-size":11,"font-family":mono},n>120?d.toISOString().slice(0,7):d.toISOString().slice(5,10))) });
 if(o.sim){var a=x(0),b2=x(Math.min(n-1,o.sim));svg.appendChild(el("rect",{x:a,y:m.t,width:b2-a,height:ih,fill:"url(#hat"+host.id+")",opacity:.28}));svg.appendChild(el("text",{x:a+8,y:m.t+14,fill:sim,"font-size":10,"font-family":mono,"letter-spacing":".1em"},"SIMULATED"))}
 if(o.band){var by1=y(o.band.hi),by2=y(o.band.lo);svg.appendChild(el("rect",{x:m.l,y:by1,width:iw,height:by2-by1,fill:c("--chart-band","#d4a75e"),opacity:.12}));[by1,by2].forEach(function(yy){svg.appendChild(el("line",{x1:m.l,x2:W-m.r,y1:yy,y2:yy,stroke:c("--chart-band","#d4a75e"),"stroke-dasharray":"4 3","stroke-width":1}))})}
 var pts=Y.map(function(v,i){return x(i)+","+y(v)}).join(" ");
 svg.appendChild(el("polygon",{points:x(0)+","+(m.t+ih)+" "+pts+" "+x(n-1)+","+(m.t+ih),fill:"url(#"+gid+")"}));
 if(o.ghost){var G=o.ghost.map(function(v,i){return x(i)+","+y(mode==="eq"?base+v:mode==="ret"?v/base*100:v)}).join(" ");svg.appendChild(el("polyline",{points:G,fill:"none",stroke:sim,"stroke-width":1.5,"stroke-dasharray":"5 4"}))}
 svg.appendChild(el("polyline",{points:pts,fill:"none",stroke:line,"stroke-width":2.4,"stroke-linejoin":"round","stroke-linecap":"round"}));
 // high / low flags
 var iHi=Y.indexOf(Math.max.apply(0,Y)),iLo=Y.indexOf(Math.min.apply(0,Y));
 function flag(i,txt,up){var xx=x(i),yy=y(Y[i]),ty=up?yy-22:yy+22,w=txt.length*7+12;var gx=Math.max(m.l,Math.min(W-m.r-w,xx-w/2));svg.appendChild(el("line",{x1:xx,x2:xx,y1:yy,y2:ty+(up?14:-14),stroke:faint,"stroke-width":1}));svg.appendChild(el("rect",{x:gx,y:ty-(up?0:14),width:w,height:14,fill:cell,stroke:grid}));svg.appendChild(el("text",{x:gx+6,y:ty-(up?0:14)+11,fill:ink,"font-size":10.5,"font-family":mono},txt));svg.appendChild(el("circle",{cx:xx,cy:yy,r:3,fill:panel,stroke:ink,"stroke-width":1.5}))}
 function lab(v){return mode==="ret"?sgn(v,1)+"%":mode==="pnl"?sgn(v,2):fmt(v,2)}
 if(iHi!==n-1)flag(iHi,"HIGH "+lab(Y[iHi]),true);if(iLo!==0&&iLo!==iHi)flag(iLo,"LOW "+lab(Y[iLo]),false);
 // flow pins
 (o.flows||[]).forEach(function(f){var fi=f.ago!=null?n-1-f.ago:f.i;if(fi<0||fi>=n)return;var xx=x(fi),neg=f.v<0,cc=neg?c("--accent-2","#ff832b"):teal,t=(neg?"\u2212":"+")+fmt(Math.abs(f.v),0);svg.appendChild(el("line",{x1:xx,x2:xx,y1:m.t+ih-26,y2:m.t+ih,stroke:cc,"stroke-width":1.5}));var pwid=t.length*6.6+12;svg.appendChild(el("rect",{x:xx-pwid/2,y:m.t+ih-40,width:pwid,height:14,fill:cc}));svg.appendChild(el("text",{x:xx,y:m.t+ih-29,"text-anchor":"middle",fill:"#0b0b0c","font-size":10,"font-weight":600,"font-family":mono},t))});
 // event strip
 (o.events||[]).forEach(function(ev){var ei=ev.ago!=null?n-1-ev.ago:ev.i;if(ei<0||ei>=n)return;var xx=x(ei),cc=ev.k==="incident"?c("--bad","#fa4d56"):ev.k==="decision"?c("--flag-approval","#a56eff"):c("--accent-2","#ff832b");svg.appendChild(el("rect",{x:xx-4,y:m.t-10,width:8,height:8,fill:cc}));svg.appendChild(el("line",{x1:xx,x2:xx,y1:m.t-2,y2:m.t+ih,stroke:cc,"stroke-dasharray":"2 4",opacity:.6}))});
 // endpoint
 var ex=x(n-1),ey=y(Y[n-1]);svg.appendChild(el("circle",{cx:ex,cy:ey,r:9,fill:line,opacity:.2}));svg.appendChild(el("circle",{cx:ex,cy:ey,r:4.5,fill:line,stroke:panel,"stroke-width":2}));
 var el0=lab(Y[n-1]),pw=el0.length*7.4+16;svg.appendChild(el("rect",{x:W-m.r+8,y:ey-11,width:pw,height:22,fill:line}));svg.appendChild(el("text",{x:W-m.r+16,y:ey+4,fill:"#0b0b0c","font-size":12,"font-weight":600,"font-family":mono},el0));
 // drawdown
 var peak=-1e18,ddv=data.map(function(v){var e=base+v;peak=Math.max(peak,e);return(e/peak-1)*100}),dmin=Math.min.apply(0,ddv)||-1,top=H+gap;
 if(DH){function dy(v){return top+DH*(v/(dmin*1.12))}
  svg.appendChild(el("text",{x:m.l,y:top-7,fill:faint,"font-size":10.5,"font-family":mono,"letter-spacing":".1em"},"DRAWDOWN"));svg.appendChild(el("line",{x1:m.l,x2:W-m.r,y1:top,y2:top,stroke:grid}));
  var dpts=ddv.map(function(v,i){return x(i)+","+dy(v)}).join(" ");svg.appendChild(el("polygon",{points:x(0)+","+top+" "+dpts+" "+x(n-1)+","+top,fill:dd,opacity:.28}));svg.appendChild(el("polyline",{points:dpts,fill:"none",stroke:dd,"stroke-width":1.8}));
  var mi=ddv.indexOf(Math.min.apply(0,ddv));svg.appendChild(el("circle",{cx:x(mi),cy:dy(ddv[mi]),r:4,fill:dd,stroke:panel,"stroke-width":2}));svg.appendChild(el("text",{x:Math.min(x(mi)+9,W-m.r-34),y:dy(ddv[mi])+4,fill:dd,"font-size":11,"font-family":mono},fmt(ddv[mi],1)+"%"))}
 // readout bar + hover
 var rd=document.createElement("div");rd.className="rd";var lgd=document.createElement("div");lgd.className="lgd";
 lgd.innerHTML='<span><i></i>'+(o.seriesName||(mode==="eq"?"Equity":mode==="ret"?"Return":"Net PnL"))+'</span>'+(o.ghost?'<span><i class="d" style="border-color:'+sim+'"></i>'+(o.ghostName||"Paper twin")+'</span>':"")+(o.sim?'<span><i class="h"></i>Simulated</span>':"")+(o.band?'<span><i class="d" style="border-color:'+c("--chart-band","#d4a75e")+'"></i>Approved band</span>':"");
 var cross=el("line",{y1:m.t,y2:H+gap+DH,stroke:ink,"stroke-width":1,opacity:.7,visibility:"hidden"}),dot=el("circle",{r:5,fill:line,stroke:ink,"stroke-width":2,visibility:"hidden"});svg.appendChild(cross);svg.appendChild(dot);
 host.innerHTML="";host.appendChild(lgd);host.appendChild(rd);host.appendChild(svg);
 var hit=el("rect",{x:m.l,y:m.t,width:iw,height:H+gap+DH-m.t,fill:"transparent",tabindex:0});svg.appendChild(hit);
 function rdFor(i){var d=new Date(start.getTime()+i*864e5),dl=Y[i]-Y[0];rd.innerHTML='<span><span class="u">'+d.toISOString().slice(0,10)+' UTC</span><b>'+lab(Y[i])+'</b></span><span><span class="u">\u0394 window</span>'+(mode==="ret"?sgn(dl,2)+"%":sgn(dl,0))+'</span><span><span class="u">Drawdown</span>'+fmt(ddv[i],1)+'%</span>'}
 rdFor(n-1);
 function show(i){i=Math.max(0,Math.min(n-1,i));cross.setAttribute("x1",x(i));cross.setAttribute("x2",x(i));cross.setAttribute("visibility","visible");dot.setAttribute("cx",x(i));dot.setAttribute("cy",y(Y[i]));dot.setAttribute("visibility","visible");rdFor(i);return i}
 var cur=n-1;hit.addEventListener("mousemove",function(e){var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*W/r.width;cur=show(Math.round((px-m.l)/iw*(n-1)))});
 hit.addEventListener("mouseleave",function(){cross.setAttribute("visibility","hidden");dot.setAttribute("visibility","hidden");rdFor(n-1)});
 hit.addEventListener("keydown",function(e){if(e.key==="ArrowLeft")cur=show(cur-1);else if(e.key==="ArrowRight")cur=show(cur+1);else if(e.key==="Escape")hit.dispatchEvent(new Event("mouseleave"))});
 return {data:data,dd:ddv,y:Y};
};
window.spark=function(host,data,color,w,h){w=w||72;h=h||18;var lo=Math.min.apply(0,data),hi=Math.max.apply(0,data),p=data.map(function(v,i){return(w*i/(data.length-1)).toFixed(1)+","+(h-2-(h-4)*(v-lo)/((hi-lo)||1)).toFixed(1)}).join(" ");
 host.innerHTML='<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline points="'+p+'" fill="none" stroke="'+color+'" stroke-width="1.5"/><circle cx="'+w+'" cy="'+p.split(" ").pop().split(",")[1]+'" r="2" fill="'+color+'"/></svg>'};
// diverging bars
window.divBars=function(host,rows){var W=host.clientWidth||320,rh=26,h=rows.length*rh+4,mx=Math.max.apply(0,rows.map(function(r){return Math.abs(r.v)})),mid=W*.5,good=css("--series")||"#78a9ff",bad=css("--series-dd")||"#ff832b",ink=css("--ink-soft"),faint=css("--ink-faint");
 var s='<svg viewBox="0 0 '+W+' '+h+'" width="100%" role="img" aria-label="Contributors">';s+='<line x1="'+mid+'" x2="'+mid+'" y1="0" y2="'+h+'" stroke="'+css("--line")+'"/>';
 rows.forEach(function(r,i){var y=i*rh+2,len=Math.abs(r.v)/mx*(W*.5-70),x0=r.v>=0?mid:mid-len;s+='<rect x="'+x0+'" y="'+(y+6)+'" width="'+len+'" height="12" fill="'+(r.v>=0?good:bad)+'" opacity=".85"/>';
  s+='<text x="'+(r.v>=0?mid-8:mid+8)+'" y="'+(y+16)+'" text-anchor="'+(r.v>=0?"end":"start")+'" fill="'+ink+'" font-size="12" font-family="IBM Plex Sans">'+r.n+'</text>';
  s+='<text x="'+(r.v>=0?x0+len+6:x0-6)+'" y="'+(y+16)+'" text-anchor="'+(r.v>=0?"start":"end")+'" fill="'+faint+'" font-size="11" font-family="IBM Plex Mono">'+sgn(r.v,0)+'</text>'});
 host.innerHTML=s+"</svg>"};
})();

// redraw charts when the shell context changes
window.addEventListener("kit:change",function(){document.querySelectorAll(".chart").forEach(function(h){if(h._redraw&&h.offsetParent)h._redraw()})});
