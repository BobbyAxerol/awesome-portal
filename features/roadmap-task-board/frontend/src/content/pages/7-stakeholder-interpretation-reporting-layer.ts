/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 a4952576a257766811cc22bac42e44a1620e674eb78a0a7fa6c2643aaca54334
 */
export const title = "7. STAKEHOLDER INTERPRETATION & REPORTING LAYER";
export const html = `<h1 id="7-stakeholder-interpretation-reporting-layer">7. STAKEHOLDER INTERPRETATION &amp; REPORTING LAYER</h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Reporting layer không thay đổi kết quả backtest. Nhiệm vụ của nó là biến hàng nghìn dòng orders, fills, metrics và WFO evidence thành một bản trình bày có thể trả lời bốn câu hỏi: chiến lược kiếm tiền như thế nào, rủi ro nằm ở đâu, kết quả có bền ngoài mẫu hay không, và có đủ bằng chứng để approve sang paper/live hay chưa.</p>
</blockquote><h2 id="cau-truc-hien-tai-awesome-quant-interpretation">Cấu trúc hiện tại — <code>awesome-quant-interpretation</code></h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    QBT["QuantBT Artifacts"] --&gt; EXTRACT["Extractors"]
    QS["QuantStats HTML"] --&gt; EXTRACT
    NT["Nautilus / Trade Logs"] --&gt; EXTRACT
    PAPER["Paper / Live Orders, Fills, PnL"] -. "upgrade input" .-&gt; EXTRACT

    EXTRACT --&gt; DOMAIN["ReportDataset / Trade / Fill / Equity Domain"]
    DOMAIN --&gt; ANALYZE["Performance &amp; Risk Analyzers"]
    ANALYZE --&gt; ECHARTS["Interactive Apache ECharts"]
    ANALYZE --&gt; BADGES["KPI Threshold Badges"]
    ANALYZE --&gt; INTERPRET["Rule + AI Interpretation"]
    QS --&gt; SVG["QuantStats Vector Charts"]

    ECHARTS --&gt; HTML["Publication-Grade HTML Report"]
    BADGES --&gt; HTML
    INTERPRET --&gt; HTML
    SVG --&gt; HTML

    HTML --&gt; MANAGER["Manager / Investment Committee"]
    HTML --&gt; APPROVAL["Approval Evidence Package"]
    HTML --&gt; PORTAL["Quant Manager Portal"]
</div><pre class="mermaid">flowchart LR
    QBT["QuantBT Artifacts"] --&gt; EXTRACT["Extractors"]
    QS["QuantStats HTML"] --&gt; EXTRACT
    NT["Nautilus / Trade Logs"] --&gt; EXTRACT
    PAPER["Paper / Live Orders, Fills, PnL"] -. "upgrade input" .-&gt; EXTRACT

    EXTRACT --&gt; DOMAIN["ReportDataset / Trade / Fill / Equity Domain"]
    DOMAIN --&gt; ANALYZE["Performance &amp; Risk Analyzers"]
    ANALYZE --&gt; ECHARTS["Interactive Apache ECharts"]
    ANALYZE --&gt; BADGES["KPI Threshold Badges"]
    ANALYZE --&gt; INTERPRET["Rule + AI Interpretation"]
    QS --&gt; SVG["QuantStats Vector Charts"]

    ECHARTS --&gt; HTML["Publication-Grade HTML Report"]
    BADGES --&gt; HTML
    INTERPRET --&gt; HTML
    SVG --&gt; HTML

    HTML --&gt; MANAGER["Manager / Investment Committee"]
    HTML --&gt; APPROVAL["Approval Evidence Package"]
    HTML --&gt; PORTAL["Quant Manager Portal"]
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="7-1-reporting-layer-ang-phuc-vu-cho-cac-muc-ich-sau">7.1 Reporting layer đang phục vụ cho các mục đích sau</h2><ul>
<li>Chuyển raw backtest artifacts thành báo cáo HTML có cấu trúc.</li>
<li>Trình bày riêng In-Sample và Out-of-Sample để stakeholder không nhầm train performance với test performance.</li>
<li>Kết hợp headline KPIs, risk metrics, trade diagnostics và interactive charts.</li>
<li>Hiển thị KPI badges theo threshold để đọc nhanh trạng thái đạt/chưa đạt.</li>
<li>Phân tích MAE/MFE, long/short, rolling win rate, return distribution, margin utilization và drawdown.</li>
<li>Tạo executive summary, regime vulnerability và overfitting diagnosis bằng rule/AI interpreter.</li>
<li>Xuất một artifact có thể gửi, lưu và gắn vào approval record.</li>
</ul><h2 id="7-2-cau-truc-va-capability-hien-tai">7.2 Cấu trúc và capability hiện tại</h2><p>Repository đã có cấu trúc module rõ:</p><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">quant_bot/
├── domain/          # Trade, Fill, EquityPoint, ReportDataset
├── extractors/      # QuantStats, trade log, account history
├── analyzers/       # Metrics, badges, win rate, MAE/MFE
├── charts/          # ECharts và SVG generators
├── interpreters/    # Rule + Gemini/Groq interpretation
└── renderers/       # HTML renderer và sanity checker
</code></pre></div><p>Capability nổi bật:</p><ul>
<li>TradingView-style interactive ECharts.</li>
<li>Equity/drawdown, execution overlay, MAE/MFE, margin utilization, long/short breakdown.</li>
<li>Dual-set Train/Test report.</li>
<li>Full QuantStats vector charts trong collapsible sections.</li>
<li>Publication-grade paper theme.</li>
<li>CLI generation và sanity-check image.</li>
<li>AI interpretation là enrichment; raw metrics và charts vẫn tồn tại độc lập nếu AI provider unavailable.</li>
</ul><h2 id="7-3-a-serve-cho-he-thong-va-muc-ich-nao">7.3 Đã serve cho hệ thống và mục đích nào</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Input</th>
<th>Mục đích hiện tại</th>
<th>Hướng mở rộng</th>
</tr>
</thead>
<tbody>
<tr>
<td>QuantBT orders/fills/metrics</td>
<td>Backtest performance và audit report</td>
<td>Tự động generate sau mỗi approved candidate run</td>
</tr>
<tr>
<td>QuantStats HTML</td>
<td>Rich risk/performance chart extraction</td>
<td>Giữ làm secondary evidence, không là source of truth duy nhất</td>
</tr>
<tr>
<td>Nautilus-style trade logs</td>
<td>Third-party execution/accounting interpretation</td>
<td>Gắn vào certification report</td>
</tr>
<tr>
<td>Paper/live operational data</td>
<td>Chưa phải integration chính trong public repo</td>
<td>So sánh backtest → paper → live và divergence report</td>
</tr>
</tbody>
</table></div><h2 id="7-4-anh-gia-muc-o-core-hien-tai-oi-voi-quant-firm">7.4 Đánh giá mức độ core hiện tại đối với quant firm</h2><p><strong>Đánh giá cao:</strong> đây không chỉ là template HTML. Repository đã tách domain, extractor, analyzer, chart, interpreter và renderer đủ rõ để nâng thành report-generation service.</p><ul>
<li>L2.5–L3 cho automated stakeholder reporting.</li>
<li>Phù hợp quant firm nhỏ/trung bình cần trình bày evidence cho manager, IC hoặc khách hàng nội bộ.</li>
<li>Điểm mạnh nhất là giảm khoảng cách giữa raw quant output và quyết định kinh doanh mà không giấu audit data.</li>
<li>Chưa L4 vì report artifact chưa được quản lý tập trung bằng run/deployment identity, access control, scheduling và approval workflow.</li>
</ul><h2 id="7-5-iem-manh-can-giu-nguyen-trong-giai-oan-acquire">7.5 Điểm mạnh cần giữ nguyên trong giai đoạn acquire</h2><ul>
<li>Train/Test separation.</li>
<li>Interactive charts cùng raw/secondary QuantStats charts.</li>
<li>Threshold badging.</li>
<li>Rule interpretation độc lập với AI provider.</li>
<li>AI summary là optional enrichment, không thay đổi số liệu gốc.</li>
<li>CLI và HTML artifact đơn giản để migrate.</li>
<li>Modular OOP package phù hợp đóng gói worker/service.</li>
<li>Report có thể mở độc lập ngoài manager portal.</li>
</ul><h2 id="7-6-ke-hoach-migration-va-upgrade-sau-acquire">7.6 Kế hoạch migration và upgrade sau acquire</h2><h3 id="r0-reproduce-current-report">R0 — Reproduce current report</h3><ul>
<li>Pin exact commit/dependencies/template.</li>
<li>Chạy một QuantBT golden run và regenerate đúng report hiện tại.</li>
<li>Lưu input hashes, output HTML hash và sanity-check evidence.</li>
</ul><h3 id="r1-normalized-report-contract">R1 — Normalized report contract</h3><p>Chuẩn hóa input:</p><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">backtest_run_id
alpha_version_id
dataset_snapshot_id
execution_contract
metrics.json
orders.parquet / fills.parquet / trades.parquet
equity.parquet
wfo_folds.parquet
certification.json
</code></pre></div><h3 id="r2-report-generation-worker">R2 — Report generation worker</h3><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">Run Registry
  -&gt; Report Job Queue
  -&gt; awesome-quant-interpretation Worker
  -&gt; HTML + JSON Summary + Preview
  -&gt; Artifact Store
  -&gt; Portal / Approval Inbox
</code></pre></div><h3 id="r3-backtest-paper-live-comparison">R3 — Backtest / paper / live comparison</h3><ul>
<li>Cùng một alpha/deployment identity.</li>
<li>So sánh slippage, fill ratio, turnover, cost, drawdown, exposure và PnL divergence.</li>
<li>Gắn incident và data-quality warnings vào report.</li>
<li>Không cho report “đẹp” che giấu missing data hoặc unresolved reconciliation.</li>
</ul><h3 id="r4-governance-va-distribution">R4 — Governance và distribution</h3><ul>
<li>Immutable artifact hash.</li>
<li>Role-based access.</li>
<li>Watermark/version/date.</li>
<li>Scheduled weekly/monthly stakeholder reports.</li>
<li>Approval comment và sign-off link.</li>
<li>Redaction policy cho alpha IP, broker account và live capital.</li>
</ul><h2 id="7-7-e-xuat-kien-truc-sau-upgrade-v1">7.7 Đề xuất kiến trúc sau upgrade V1</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    RUN["Run Registry"] --&gt; Q["Report Job Queue"]
    ART["Backtest / Paper / Live Artifacts"] --&gt; WORKER["Interpretation Worker"]
    Q --&gt; WORKER
    WORKER --&gt; ANALYTICS["Analyzer + ECharts + Rule/AI Interpreter"]
    ANALYTICS --&gt; HTML["Immutable Stakeholder HTML"]
    ANALYTICS --&gt; JSON["Executive Summary JSON"]
    HTML --&gt; STORE["Artifact Store"]
    JSON --&gt; STORE
    STORE --&gt; PORTAL["Manager Portal"]
    STORE --&gt; APPROVAL["Approval Evidence Package"]
    STORE --&gt; SCHEDULE["Scheduled Distribution"]
    MON["Data Quality / Incidents / Reconciliation"] --&gt; ANALYTICS
</div><pre class="mermaid">flowchart LR
    RUN["Run Registry"] --&gt; Q["Report Job Queue"]
    ART["Backtest / Paper / Live Artifacts"] --&gt; WORKER["Interpretation Worker"]
    Q --&gt; WORKER
    WORKER --&gt; ANALYTICS["Analyzer + ECharts + Rule/AI Interpreter"]
    ANALYTICS --&gt; HTML["Immutable Stakeholder HTML"]
    ANALYTICS --&gt; JSON["Executive Summary JSON"]
    HTML --&gt; STORE["Artifact Store"]
    JSON --&gt; STORE
    STORE --&gt; PORTAL["Manager Portal"]
    STORE --&gt; APPROVAL["Approval Evidence Package"]
    STORE --&gt; SCHEDULE["Scheduled Distribution"]
    MON["Data Quality / Incidents / Reconciliation"] --&gt; ANALYTICS
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><hr class="section-divider"/>`;
