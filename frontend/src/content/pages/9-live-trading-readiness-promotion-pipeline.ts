/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 622a66cd6a5a55e7096ee845eb84975c4592bb8c1ab26933c7e18ca80c638f97
 */
export const title = "9. LIVE TRADING READINESS & PROMOTION PIPELINE";
export const html = `<h1 id="9-live-trading-readiness-promotion-pipeline">9. LIVE TRADING READINESS &amp; PROMOTION PIPELINE</h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Hệ thống đã có khả năng execution live trên nhiều adapter, nhưng promotion pipeline vẫn cần chứng minh rằng đúng alpha artifact, đúng risk profile và đúng broker account được đưa lên vốn thật. Gate không phải thủ tục hành chính; nó là cơ chế giới hạn blast radius khi một giả định backtest sai ngoài thị trường.</p>
</blockquote><h2 id="cau-truc-hien-tai-7">Cấu trúc hiện tại</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    RESEARCH["Research Result"] --&gt; BACKTEST["QuantBT Backtest"]
    BACKTEST --&gt; MANUAL["Manual Review / Reports"]
    MANUAL --&gt; PAPER["Paper Deployment"]
    PAPER --&gt; SANDBOX["Sandbox / Testnet"]
    SANDBOX --&gt; LIVE["Multi-Venue Live Execution&lt;br/&gt;Binance / Bybit / selected US &amp; India brokers"]

    PAPER --&gt; DB["Internal Orders / Fills / PnL"]
    SANDBOX --&gt; RECON["Broker Sync / Reconciliation"]
    LIVE --&gt; RECON
    RECON --&gt; RISK["Fail-Closed Risk Gate"]

    MANUAL -. "artifact/config identity chưa thống nhất platform-wide" .-&gt; LIVE
</div><pre class="mermaid">flowchart LR
    RESEARCH["Research Result"] --&gt; BACKTEST["QuantBT Backtest"]
    BACKTEST --&gt; MANUAL["Manual Review / Reports"]
    MANUAL --&gt; PAPER["Paper Deployment"]
    PAPER --&gt; SANDBOX["Sandbox / Testnet"]
    SANDBOX --&gt; LIVE["Multi-Venue Live Execution&lt;br/&gt;Binance / Bybit / selected US &amp; India brokers"]

    PAPER --&gt; DB["Internal Orders / Fills / PnL"]
    SANDBOX --&gt; RECON["Broker Sync / Reconciliation"]
    LIVE --&gt; RECON
    RECON --&gt; RISK["Fail-Closed Risk Gate"]

    MANUAL -. "artifact/config identity chưa thống nhất platform-wide" .-&gt; LIVE
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="9-1-nhung-gi-hien-a-co">9.1 Những gì hiện đã có</h2><ul>
<li>Paper và sandbox execution paths.</li>
<li>Mode/venue/account permission.</li>
<li>Broker sync/reconciliation.</li>
<li>Kill switch/trading state.</li>
<li>Execution sessions.</li>
<li>Canonical orders/fills/positions/PnL.</li>
<li>Binance sandbox/testnet evidence trong tài liệu private.</li>
<li>Multi-venue live execution adapters đã deployed cho Bybit và một số broker Mỹ/Ấn Độ theo xác nhận owner; exact broker matrix được quản lý private.</li>
<li>Physical account binding và hedge/net policy.</li>
<li>Capability health và direct REST fallback.</li>
</ul><h2 id="9-2-nhung-gi-con-thieu-e-goi-la-institutional-live-production-ready">9.2 Những gì còn thiếu để gọi là institutional live production-ready</h2><ul>
<li>Một approval artifact nối đúng backtest run với deployed alpha image/config.</li>
<li>Venue-specific live certification matrix tập trung cho Binance, Bybit, US brokers, India brokers và DNSE/Vietnam.</li>
<li>Real-capital canary evidence.</li>
<li>Formal rollback/flatten policy và on-call owner.</li>
<li>DR test cho broker accepted nhưng internal DB chưa persist.</li>
<li>Direct/live DNSE payload/order/reconciliation validation.</li>
<li>Live fee/funding/cash/PnL reconciliation được đóng bằng broker statement.</li>
<li>Capacity và liquidity gate.</li>
<li>Per-alpha capital scaling policy.</li>
<li>Post-deployment review và automatic suspension criteria.</li>
</ul><h2 id="9-3-promotion-gates-e-xuat">9.3 Promotion gates đề xuất</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    DRAFT["DRAFT"] --&gt; TECH["Technical Validation"]
    TECH --&gt; QUANT["Quant Review"]
    QUANT --&gt; RISK["Risk / Capacity Review"]
    RISK --&gt; CANDIDATE["Candidate Artifact Frozen"]
    CANDIDATE --&gt; PAPER["Paper Approved"]
    PAPER --&gt; OBSERVE["Paper Observation Window"]
    OBSERVE --&gt; SHADOW["Live Shadow / No Submit"]
    SHADOW --&gt; CANARY["Live Canary"]
    CANARY --&gt; SCALE["Staged Capital Scale"]
    SCALE --&gt; LIVE["Live Approved"]

    TECH -. fail .-&gt; REWORK["Rework"]
    QUANT -. fail .-&gt; REWORK
    RISK -. fail .-&gt; REWORK
    OBSERVE -. fail .-&gt; SUSPEND["Suspend"]
    CANARY -. fail .-&gt; SUSPEND
    SCALE -. breach .-&gt; SUSPEND
</div><pre class="mermaid">flowchart LR
    DRAFT["DRAFT"] --&gt; TECH["Technical Validation"]
    TECH --&gt; QUANT["Quant Review"]
    QUANT --&gt; RISK["Risk / Capacity Review"]
    RISK --&gt; CANDIDATE["Candidate Artifact Frozen"]
    CANDIDATE --&gt; PAPER["Paper Approved"]
    PAPER --&gt; OBSERVE["Paper Observation Window"]
    OBSERVE --&gt; SHADOW["Live Shadow / No Submit"]
    SHADOW --&gt; CANARY["Live Canary"]
    CANARY --&gt; SCALE["Staged Capital Scale"]
    SCALE --&gt; LIVE["Live Approved"]

    TECH -. fail .-&gt; REWORK["Rework"]
    QUANT -. fail .-&gt; REWORK
    RISK -. fail .-&gt; REWORK
    OBSERVE -. fail .-&gt; SUSPEND["Suspend"]
    CANARY -. fail .-&gt; SUSPEND
    SCALE -. breach .-&gt; SUSPEND
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="9-4-gate-criteria">9.4 Gate criteria</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Gate</th>
<th>Evidence bắt buộc</th>
</tr>
</thead>
<tbody>
<tr>
<td>Technical</td>
<td>CI pass, immutable artifact, data contract, determinism, execution contract</td>
</tr>
<tr>
<td>Quant</td>
<td>IS/OOS/WFO, robustness, cost stress, no known leakage</td>
</tr>
<tr>
<td>Risk</td>
<td>Exposure, leverage, drawdown, liquidity, capacity, kill policy</td>
</tr>
<tr>
<td>Paper</td>
<td>Stable execution, accounting, monitoring, reconciliation, no critical incident</td>
</tr>
<tr>
<td>Shadow</td>
<td>Live market/broker constraints, intended orders, no submit or zero-risk submit</td>
</tr>
<tr>
<td>Canary</td>
<td>Small allocation, real fills, broker PnL/cash reconciliation, rollback ready</td>
</tr>
<tr>
<td>Scale</td>
<td>Repeated clean windows, no unresolved incident, capacity still valid</td>
</tr>
</tbody>
</table></div><h2 id="9-5-identity-can-khoa-khi-promote">9.5 Identity cần khóa khi promote</h2><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">alpha_artifact_digest
alpha_config_hash
model_artifact_digest
approved_backtest_run_ids
dataset_snapshot_id
quantbt_engine_version
execution_contract
risk_profile_version
account_policy_version
data_schema_version
broker_adapter_version
approval_id
deployment_id
</code></pre></div><hr class="section-divider"/>`;
