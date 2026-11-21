/* Internal / Broker / Difference triad (Reconciliation). Triad.render(host,{internal:[[label,html]],broker:[[label,html]],diff:[[label,html]],internalAsOf,brokerAsOf,diffNote})
   One component for Sandbox, Live and Account 360. Cells are plain HTML strings: callers pass "Not available" + reason for missing values and "Not computed" for shared-binding balances. */
(function(){
var CSS=".tr-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line-strong);border:1px solid var(--line-strong)}.tr-c{background:var(--panel);padding:12px 16px;min-width:0}"
+".tr-c h3{margin:0 0 2px;font:500 11px/16px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft)}.tr-c .s{font:400 11px/16px var(--font-mono);color:var(--ink-faint);margin-bottom:8px}.tr-c table td{height:30px}.tr-c table td:first-child{color:var(--ink-faint);font:500 11px/16px var(--font-mono);letter-spacing:.06em;text-transform:uppercase}"
+"@media(max-width:1100px){.tr-g{grid-template-columns:1fr}}";
function css(){if(document.getElementById("tr-css"))return;var s=document.createElement("style");s.id="tr-css";s.textContent=CSS;document.head.appendChild(s)}
function col(t,sub,rows){return '<div class="tr-c"><h3>'+t+'</h3><div class="s">'+sub+'</div><table><tbody>'+rows.map(function(r){return '<tr><td>'+r[0]+'</td><td class="n">'+r[1]+'</td></tr>'}).join("")+'</tbody></table></div>'}
window.Triad={render:function(host,o){css();host.innerHTML='<div class="tr-g">'+col("Internal","Virtual ledger · "+(o.internalAsOf||"Not available"),o.internal)+col("Broker","Venue report · "+(o.brokerAsOf||"Not available"),o.broker)+col("Difference","Derived · matching scopes only",o.diff)+'</div>'}};
})();
