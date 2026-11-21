(function(){var b=document.body;function set(k,v){b.setAttribute("data-"+k,v);document.querySelectorAll('[data-ctl="'+k+'"] button').forEach(function(x){x.setAttribute("aria-pressed",x.getAttribute("data-v")===v?"true":"false")});try{localStorage.setItem("wf-"+k,v)}catch(e){}}
document.querySelectorAll("[data-ctl] button").forEach(function(x){x.addEventListener("click",function(){set(x.parentNode.getAttribute("data-ctl"),x.getAttribute("data-v"))})});
var s="healthy",n="on";try{s=localStorage.getItem("wf-state")||s;n=localStorage.getItem("wf-notes")||n}catch(e){}set("state",s);set("notes",n);if(document.querySelector('[data-ctl="peek"]')){var pk=b.getAttribute("data-peek")||"off";set("peek",pk);}
document.querySelectorAll("[data-seg]").forEach(function(g){g.addEventListener("click",function(e){var t=e.target.closest("button");if(!t)return;g.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",x===t?"true":"false")})})});})();

(function(){var bar=document.querySelector(".bar");if(!bar||bar.querySelector('[data-ctl="view"]'))return;
var h='<span class="seg" data-ctl="view"><button data-v="changes">What changes</button><button data-v="proposed">Proposed</button><button data-v="v1">Current (V1)</button></span>'+
'<span class="seg" data-ctl="skin"><button data-v="wire">Wireframe</button><button data-v="app">App look</button></span>'+
'<span class="legend"><i style="background:#1a7f4b">NEW</i><i style="background:#b7791f">CHANGED</i><i style="background:#6b6b66">KEPT</i><i style="background:#b83232">REMOVED</i></span>';
var d=document.createElement("span");d.innerHTML=h;while(d.firstChild)bar.appendChild(d.firstChild);
var b=document.body;function set(k,v){b.setAttribute("data-"+k,v);bar.querySelectorAll('[data-ctl="'+k+'"] button').forEach(function(x){x.setAttribute("aria-pressed",x.getAttribute("data-v")===v?"true":"false")});try{localStorage.setItem("wf-"+k,v)}catch(e){}}
bar.querySelectorAll('[data-ctl="view"] button,[data-ctl="skin"] button').forEach(function(x){x.addEventListener("click",function(){set(x.parentNode.getAttribute("data-ctl"),x.getAttribute("data-v"))})});
var v="changes",s="wire";try{v=localStorage.getItem("wf-view")||v;s=localStorage.getItem("wf-skin")||s}catch(e){}set("view",v);set("skin",s);})();
