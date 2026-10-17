(function(){
var NS="http://www.w3.org/2000/svg";
function rng(s){return function(){s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
function fmt(n,d){var s=Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d||0,maximumFractionDigits:d||0});return(n<0?"−":"")+s}
function sgn(n,d){return(n>0?"+":"")+fmt(n,d)}
function el(t,a,txt){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}
function series(seed,n,drift,vol,start){var r=rng(seed),v=start,o=[];for(var i=0;i<n;i++){v+=drift+(r()-.5)*vol;o.push(v)}return o}
function nice(lo,hi,k){var span=hi-lo,step=Math.pow(10,Math.floor(Math.log10(span/k))),e=span/k/step;step*=e<1.5?1:e<3?2:e<7?5:10;var a=Math.floor(lo/step)*step,t=[];for(var v=a;v<=hi+step*.001;v+=step)t.push(v);return t}
function css(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
// Equity + drawdown, shared crosshair, endpoint pill, flow markers
window.equityChart=function(host,o){
 o=o||{};var W=host.clientWidth||760,H=o.h||250,DH=72,gap=18,m={l:56,r:72,t:10,b:22},iw=W-m.l-m.r,ih=H-m.t-m.b;
 var n=o.n||31,data=o.data||series(o.seed||7,n,o.drift||420,o.vol||2600,0),start=new Date((o.endDate?Date.parse(o.endDate):Date.UTC(2026,9,17))-(n-1)*864e5);
 if(o.end!=null){var f0=data[n-1];data=data.map(function(v,i){return v+(o.end-f0)*i/(n-1)})}var mode=o.mode||"pnl",base=o.base||1000000;var Y=data.map(function(v){return mode==="eq"?base+v:mode==="ret"?v/base*100:v});
 var lo=Math.min.apply(0,Y),hi=Math.max.apply(0,Y),pad=(hi-lo)*.08||1;lo-=pad;hi+=pad;var tk=nice(lo,hi,4);lo=tk[0];hi=tk[tk.length-1];
 function x(i){return m.l+iw*i/(n-1)}function y(v){return m.t+ih*(1-(v-lo)/(hi-lo))}
 var svg=el("svg",{viewBox:"0 0 "+W+" "+(H+gap+DH),role:"img","aria-label":o.label||"Performance chart"});
 var line=css("--chart-line")||"#42a365",grid=css("--line-soft")||"#2a2a2a",faint=css("--ink-faint")||"#8d8d8d",bad=css("--bad")||"#fa4d56",acc=css("--accent")||"#78a9ff";
 var defs=el("defs",{});var pat=el("pattern",{id:"hat"+host.id,width:6,height:6,patternUnits:"userSpaceOnUse",patternTransform:"rotate(45)"});pat.appendChild(el("rect",{width:6,height:6,fill:"none"}));pat.appendChild(el("line",{x1:0,y1:0,x2:0,y2:6,stroke:faint,"stroke-width":1,opacity:.5}));defs.appendChild(pat);svg.appendChild(defs);
 tk.forEach(function(v){var yy=y(v);svg.appendChild(el("line",{x1:m.l,x2:W-m.r,y1:yy,y2:yy,stroke:grid,"stroke-dasharray":"2 4"}));
  svg.appendChild(el("text",{x:m.l-8,y:yy+4,"text-anchor":"end",fill:faint,"font-size":11,"font-family":"IBM Plex Mono, monospace"},mode==="ret"?fmt(v,1)+"%":fmt(v,0)))});
 var xt=[];for(var q=0;q<5;q++){var qi=Math.round((n-1)*q/4);if(xt.indexOf(qi)<0)xt.push(qi)}xt.forEach(function(i){var d=new Date(start.getTime()+i*864e5);svg.appendChild(el("text",{x:x(i),y:m.t+ih+16,"text-anchor":i===0?"start":i===n-1?"end":"middle",fill:faint,"font-size":11,"font-family":"IBM Plex Mono, monospace"},d.toISOString().slice(5,10)))});
 if(o.sim){var a=x(0),b=x(o.sim);svg.appendChild(el("rect",{x:a,y:m.t,width:b-a,height:ih,fill:"url(#hat"+host.id+")",opacity:.35}));svg.appendChild(el("text",{x:a+6,y:m.t+12,fill:faint,"font-size":10,"font-family":"IBM Plex Sans, sans-serif"},"SIMULATED"))}
 var pts=Y.map(function(v,i){return x(i)+","+y(v)}).join(" ");
 svg.appendChild(el("polygon",{points:x(0)+","+(m.t+ih)+" "+pts+" "+x(n-1)+","+(m.t+ih),fill:line,opacity:.07}));
 svg.appendChild(el("polyline",{points:pts,fill:"none",stroke:line,"stroke-width":1.5,"stroke-linejoin":"round"}));
 (o.flows||[]).forEach(function(f){var xx=x(f.i);svg.appendChild(el("line",{x1:xx,x2:xx,y1:m.t,y2:m.t+ih,stroke:acc,"stroke-dasharray":"3 3",opacity:.55}));svg.appendChild(el("path",{d:"M"+(xx-5)+","+(m.t+ih-2)+" L"+(xx+5)+","+(m.t+ih-2)+" L"+xx+","+(m.t+ih-10)+" Z",fill:f.v<0?css("--accent-2")||"#ff832b":acc}))});
 // endpoint
 var ex=x(n-1),ey=y(Y[n-1]);svg.appendChild(el("circle",{cx:ex,cy:ey,r:7,fill:line,opacity:.18}));svg.appendChild(el("circle",{cx:ex,cy:ey,r:3.5,fill:line}));
 var lab=mode==="ret"?sgn(Y[n-1],1)+"%":mode==="pnl"?sgn(Y[n-1],0):fmt(Y[n-1],0);var pw=lab.length*7+14;svg.appendChild(el("rect",{x:W-m.r+6,y:ey-10,width:pw,height:20,fill:css("--cell")||"#262626"}));svg.appendChild(el("text",{x:W-m.r+13,y:ey+4,fill:line,"font-size":12,"font-family":"IBM Plex Mono, monospace"},lab));
 // drawdown
 var peak=-1e18,dd=data.map(function(v){var e=base+v;peak=Math.max(peak,e);return(e/peak-1)*100}),dmin=Math.min.apply(0,dd)||-1,top=H+gap;function dy(v){return top+DH*(v/(dmin*1.15))}
 svg.appendChild(el("text",{x:m.l,y:top-5,fill:faint,"font-size":11,"font-family":"IBM Plex Sans, sans-serif"},"Drawdown"));
 svg.appendChild(el("line",{x1:m.l,x2:W-m.r,y1:top,y2:top,stroke:grid}));
 var dpts=dd.map(function(v,i){return x(i)+","+dy(v)}).join(" ");svg.appendChild(el("polygon",{points:x(0)+","+top+" "+dpts+" "+x(n-1)+","+top,fill:bad,opacity:.16}));svg.appendChild(el("polyline",{points:dpts,fill:"none",stroke:bad,"stroke-width":1.25}));
 var mi=dd.indexOf(Math.min.apply(0,dd));svg.appendChild(el("circle",{cx:x(mi),cy:dy(dd[mi]),r:3.5,fill:bad,stroke:css("--panel")||"#1d1d1d","stroke-width":2}));svg.appendChild(el("text",{x:x(mi)+8,y:dy(dd[mi])+4,fill:bad,"font-size":11,"font-family":"IBM Plex Mono, monospace"},fmt(dd[mi],1)+"%"));
 // hover
 var cross=el("line",{y1:m.t,y2:H+gap+DH,stroke:faint,"stroke-dasharray":"3 3",visibility:"hidden"}),dot=el("circle",{r:4,fill:line,stroke:css("--panel")||"#1d1d1d","stroke-width":2,visibility:"hidden"});svg.appendChild(cross);svg.appendChild(dot);
 var tip=document.createElement("div");tip.className="tip";host.innerHTML="";host.appendChild(svg);host.appendChild(tip);
 var hit=el("rect",{x:m.l,y:m.t,width:iw,height:H+gap+DH-m.t,fill:"transparent",tabindex:0});svg.appendChild(hit);
 function show(i){i=Math.max(0,Math.min(n-1,i));var d=new Date(start.getTime()+i*864e5);cross.setAttribute("x1",x(i));cross.setAttribute("x2",x(i));cross.setAttribute("visibility","visible");dot.setAttribute("cx",x(i));dot.setAttribute("cy",y(Y[i]));dot.setAttribute("visibility","visible");
  var val=mode==="ret"?sgn(Y[i],2)+"%":mode==="pnl"?sgn(Y[i],0)+" USDT":fmt(Y[i],0)+" USDT";tip.innerHTML='<div class="t">'+d.toISOString().slice(0,10)+' 00:00Z</div><b>'+val+'</b><div class="t">Drawdown '+fmt(dd[i],1)+'%</div>';tip.style.display="block";
  var sx=host.clientWidth/W;tip.style.left=Math.min(x(i)*sx+12,host.clientWidth-tip.offsetWidth-4)+"px";tip.style.top=(y(Y[i])*sx-10)+"px";return i}
 var cur=n-1;hit.addEventListener("mousemove",function(e){var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*W/r.width;cur=show(Math.round((px-m.l)/iw*(n-1)))});
 hit.addEventListener("mouseleave",function(){cross.setAttribute("visibility","hidden");dot.setAttribute("visibility","hidden");tip.style.display="none"});
 hit.addEventListener("keydown",function(e){if(e.key==="ArrowLeft")cur=show(cur-1);else if(e.key==="ArrowRight")cur=show(cur+1);else if(e.key==="Escape"){hit.dispatchEvent(new Event("mouseleave"))}});
 return {data:data,dd:dd,y:Y};
};
window.spark=function(host,data,color,w,h){w=w||72;h=h||18;var lo=Math.min.apply(0,data),hi=Math.max.apply(0,data),p=data.map(function(v,i){return(w*i/(data.length-1)).toFixed(1)+","+(h-2-(h-4)*(v-lo)/((hi-lo)||1)).toFixed(1)}).join(" ");
 host.innerHTML='<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline points="'+p+'" fill="none" stroke="'+color+'" stroke-width="1.5"/><circle cx="'+w+'" cy="'+p.split(" ").pop().split(",")[1]+'" r="2" fill="'+color+'"/></svg>'};
// diverging bars
window.divBars=function(host,rows){var W=host.clientWidth||320,rh=26,h=rows.length*rh+4,mx=Math.max.apply(0,rows.map(function(r){return Math.abs(r.v)})),mid=W*.5,good=css("--good"),bad=css("--bad"),ink=css("--ink-soft"),faint=css("--ink-faint");
 var s='<svg viewBox="0 0 '+W+' '+h+'" width="100%" role="img" aria-label="Contributors">';s+='<line x1="'+mid+'" x2="'+mid+'" y1="0" y2="'+h+'" stroke="'+css("--line")+'"/>';
 rows.forEach(function(r,i){var y=i*rh+2,len=Math.abs(r.v)/mx*(W*.5-70),x0=r.v>=0?mid:mid-len;s+='<rect x="'+x0+'" y="'+(y+6)+'" width="'+len+'" height="12" fill="'+(r.v>=0?good:bad)+'" opacity=".85"/>';
  s+='<text x="'+(r.v>=0?mid-8:mid+8)+'" y="'+(y+16)+'" text-anchor="'+(r.v>=0?"end":"start")+'" fill="'+ink+'" font-size="12" font-family="IBM Plex Sans">'+r.n+'</text>';
  s+='<text x="'+(r.v>=0?x0+len+6:x0-6)+'" y="'+(y+16)+'" text-anchor="'+(r.v>=0?"start":"end")+'" fill="'+faint+'" font-size="11" font-family="IBM Plex Mono">'+sgn(r.v,0)+'</text>'});
 host.innerHTML=s+"</svg>"};
// controls
document.querySelectorAll("[data-ctl]").forEach(function(g){g.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;var k=g.getAttribute("data-ctl"),v=b.getAttribute("data-v");document.body.setAttribute("data-"+k,v);g.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});if(window.onctl)window.onctl(k,v)})});
document.querySelectorAll(".seg[data-local] button").forEach(function(b){b.addEventListener("click",function(){b.parentNode.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});if(window.onseg)window.onseg(b.parentNode.getAttribute("data-local"),b.getAttribute("data-v"))})});
})();
