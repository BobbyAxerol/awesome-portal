/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 983abe3fa62c89f420188a9a90a2b490d85f6756571e89fababc00d51712ca17
 */
export const title = "8. MANAGER & STAKEHOLDER QUANT PLATFORM";
export const html = `<h1 id="8-manager-stakeholder-quant-platform">8. MANAGER &amp; STAKEHOLDER QUANT PLATFORM</h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Portal là “phòng điều khiển”, không phải backtest engine hoặc trading engine. Nó cho phép chọn đúng alpha/dataset, chạy job, xem report, approve và theo dõi deployment; nếu portal down, trading safety và monitoring vẫn phải hoạt động độc lập.</p>
</blockquote><h2 id="cau-truc-hien-tai-6">Cấu trúc hiện tại</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    RESEARCHER["Researcher"] --&gt; SCRIPT["Notebook / Script / Alpha Repo"]
    SCRIPT --&gt; QBT["QuantBT"]
    QBT --&gt; REPORTS["Metrics / Charts / Audit Files"]

    TRADING["Trading System"] --&gt; PERF["Performance Projections"]
    TRADING --&gt; CLI["Admin API / CLI / Logs"]
    MON["Monitoring / Reconciliation"] --&gt; CLI

    REPORTS --&gt; MANAGER["Manager / Stakeholder"]
    PERF --&gt; MANAGER
    CLI --&gt; TECH["Technical Operator"]
    TECH --&gt; MANAGER

    MANAGER -. "manual approval / coordination" .-&gt; PAPER["Paper Deployment"]
    PAPER -. "manual promotion" .-&gt; LIVE["Live Candidate"]
</div><pre class="mermaid">flowchart LR
    RESEARCHER["Researcher"] --&gt; SCRIPT["Notebook / Script / Alpha Repo"]
    SCRIPT --&gt; QBT["QuantBT"]
    QBT --&gt; REPORTS["Metrics / Charts / Audit Files"]

    TRADING["Trading System"] --&gt; PERF["Performance Projections"]
    TRADING --&gt; CLI["Admin API / CLI / Logs"]
    MON["Monitoring / Reconciliation"] --&gt; CLI

    REPORTS --&gt; MANAGER["Manager / Stakeholder"]
    PERF --&gt; MANAGER
    CLI --&gt; TECH["Technical Operator"]
    TECH --&gt; MANAGER

    MANAGER -. "manual approval / coordination" .-&gt; PAPER["Paper Deployment"]
    PAPER -. "manual promotion" .-&gt; LIVE["Live Candidate"]
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="8-1-muc-ich-can-xay-cua-manager-platform">8.1 Mục đích cần xây của manager platform</h2><ul>
<li>Cho manager/non-tech chọn alpha version và dataset phù hợp.</li>
<li>Chạy simple backtest, train/test và WFO mà không cần viết Python.</li>
<li>Xem metrics, charts, trades, costs, robustness, data quality và certification.</li>
<li>Compare nhiều runs.</li>
<li>Approve/reject bằng evidence package.</li>
<li>Promote đúng artifact/config sang paper/live.</li>
<li>Xem paper/live performance theo alpha, deployment, account và venue.</li>
<li>Theo dõi monitoring/incident/action state.</li>
<li>Audit ai đã chạy, approve, deploy hoặc thay risk/capital.</li>
</ul><h2 id="8-2-nhung-nen-tang-hien-tai-a-san-sang-e-xay-platform">8.2 Những nền tảng hiện tại đã sẵn sàng để xây platform</h2><ul>
<li>QuantBT có stable endpoint và report artifacts.</li>
<li><code>quantbt-engine</code> đang được package hóa.</li>
<li>Historical layer có unified loader và đang hướng tới Parquet.</li>
<li>Trading system có alpha/admin API, account/deployment/risk/health concepts.</li>
<li>Performance service đã có account/strategy snapshots.</li>
<li>Execution sessions và run-like identity đã xuất hiện trong live path.</li>
<li>Monitoring/reconciliation có findings và health data.</li>
</ul><p>Vì vậy không cần xây manager portal bằng cách rewrite engine. Portal chỉ cần orchestration và read models quanh core đã có.</p><h2 id="8-3-anh-gia-muc-o-hien-tai">8.3 Đánh giá mức độ hiện tại</h2><ul>
<li>Product/control-plane layer: L1.5–L2.</li>
<li>Underlying engine/data/trading capabilities: L3–L4 tùy subsystem.</li>
</ul><p>Đây là trạng thái tích cực: phần khó nhất về domain đã có; phần còn thiếu là đóng gói thành workflow dễ dùng, có governance và permission.</p><h2 id="8-4-kien-truc-backend-e-xuat">8.4 Kiến trúc backend đề xuất</h2><h3 id="khuyen-nghi-mac-inh">Khuyến nghị mặc định</h3><ul>
<li>Frontend: Next.js/React/TypeScript.</li>
<li>Control plane: NestJS/TypeScript.</li>
<li>Quant compute: Python workers + <code>quantbt-engine</code>.</li>
<li>Metadata/workflow DB: PostgreSQL.</li>
<li>Artifact/data storage: S3/MinIO.</li>
<li>Queue/orchestration: Redis Streams/RabbitMQ/Kafka-compatible tùy tải; bắt đầu đơn giản nhưng durable.</li>
<li>Operational PnL/time series: PostgreSQL/TimescaleDB hiện tại.</li>
</ul><h3 id="khi-nen-dung-c">Khi nên dùng C#</h3><p>Dùng ASP.NET Core thay TypeScript nếu:</p><ul>
<li>Private trading engine đã là .NET.</li>
<li>Team backend vận hành C# mạnh hơn rõ rệt.</li>
<li>Có sẵn security/domain contracts cần reuse.</li>
</ul><p>Không nên build cả C# và TypeScript control plane song song trong V1. Python vẫn giữ alpha/QuantBT compute.</p><h2 id="8-5-backtest-manager-flow">8.5 Backtest manager flow</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">sequenceDiagram
    actor Manager
    participant Portal
    participant API as Control Plane
    participant Alpha as Alpha Registry
    participant Data as Dataset Registry
    participant Queue
    participant Worker as QuantBT Worker
    participant Store as Artifact Store
    participant Run as Run Registry

    Manager-&gt;&gt;Portal: Chọn alpha version
    Portal-&gt;&gt;API: Create backtest request
    API-&gt;&gt;Alpha: Validate artifact + parameter schema
    API-&gt;&gt;Data: Validate compatible snapshot
    API-&gt;&gt;Run: Create immutable run spec
    API-&gt;&gt;Queue: Enqueue job
    Queue-&gt;&gt;Worker: Assign isolated worker
    Worker-&gt;&gt;Data: Load exact snapshot
    Worker-&gt;&gt;Alpha: Load exact artifact
    Worker-&gt;&gt;Worker: Run quantbt-engine
    Worker-&gt;&gt;Store: Save reports/artifacts/manifest
    Worker-&gt;&gt;Run: Normalize metrics + status
    Run--&gt;&gt;Portal: Display result
    Manager-&gt;&gt;Portal: Compare / Approve / Reject
</div><pre class="mermaid">sequenceDiagram
    actor Manager
    participant Portal
    participant API as Control Plane
    participant Alpha as Alpha Registry
    participant Data as Dataset Registry
    participant Queue
    participant Worker as QuantBT Worker
    participant Store as Artifact Store
    participant Run as Run Registry

    Manager-&gt;&gt;Portal: Chọn alpha version
    Portal-&gt;&gt;API: Create backtest request
    API-&gt;&gt;Alpha: Validate artifact + parameter schema
    API-&gt;&gt;Data: Validate compatible snapshot
    API-&gt;&gt;Run: Create immutable run spec
    API-&gt;&gt;Queue: Enqueue job
    Queue-&gt;&gt;Worker: Assign isolated worker
    Worker-&gt;&gt;Data: Load exact snapshot
    Worker-&gt;&gt;Alpha: Load exact artifact
    Worker-&gt;&gt;Worker: Run quantbt-engine
    Worker-&gt;&gt;Store: Save reports/artifacts/manifest
    Worker-&gt;&gt;Run: Normalize metrics + status
    Run--&gt;&gt;Portal: Display result
    Manager-&gt;&gt;Portal: Compare / Approve / Reject
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="8-6-manager-khong-nen-tu-chon-kernel-tuy-y">8.6 Manager không nên tự chọn kernel tùy ý</h2><p>Kernel được map từ alpha execution contract:</p><div class="table-wrap"><table>
<thead>
<tr>
<th>Alpha output/contract</th>
<th>QuantBT route</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>target_signal_v1</code></td>
<td>Native vectorized</td>
</tr>
<tr>
<td><code>intrabar_intent_v1</code></td>
<td>Intrabar engine</td>
</tr>
<tr>
<td><code>order_command_v1</code></td>
<td>Native event-driven</td>
</tr>
<tr>
<td><code>position_matrix_v1</code></td>
<td>Native portfolio</td>
</tr>
<tr>
<td><code>basket_intent_v1</code></td>
<td>Basket/event package</td>
</tr>
<tr>
<td><code>fill_tape_v1</code></td>
<td>Fill replay, accounting only</td>
</tr>
</tbody>
</table></div><p>Manager có thể chọn scenario, cost, period và parameter được expose; không được đổi execution semantics chỉ để tạo performance đẹp hơn.</p><h2 id="8-7-run-manifest-bat-buoc">8.7 Run manifest bắt buộc</h2><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">run_id
requester
alpha_id / alpha_version / git_sha / image_digest
model_artifact_digest
quantbt_engine_version
quantbt_backend + capability status
dataset_snapshot_id
instrument_master_version
calendar_version
universe_snapshot_id
parameters + seed
execution_contract
fee/slippage/funding/sizing/leverage config
train-test/WFO configuration
dependency_lock_hash
artifacts + checksums
certification level
approval records
</code></pre></div><h2 id="8-8-report-danh-cho-stakeholder">8.8 Report dành cho stakeholder</h2><h3 id="performance">Performance</h3><ul>
<li>Total/annualized return.</li>
<li>Volatility, Sharpe, Sortino, Calmar.</li>
<li>Max drawdown và duration.</li>
<li>Hit rate, profit factor, average win/loss.</li>
<li>Trade count, turnover, exposure.</li>
<li>Fees, slippage, funding.</li>
</ul><h3 id="robustness">Robustness</h3><ul>
<li>IS/OOS comparison.</li>
<li>Walk-forward fold table.</li>
<li>Parameter sensitivity.</li>
<li>Regime/market/year breakdown.</li>
<li>Capacity/liquidity scenarios.</li>
<li>Cost stress.</li>
</ul><h3 id="charts">Charts</h3><ul>
<li>Equity và drawdown.</li>
<li>Rolling Sharpe/volatility/return.</li>
<li>Monthly returns.</li>
<li>Exposure/turnover/costs.</li>
<li>Per-symbol attribution.</li>
<li>Trade distribution/duration.</li>
<li>WFO fold results.</li>
<li>Paper/live divergence.</li>
</ul><h3 id="audit">Audit</h3><ul>
<li>Orders, fills, positions, trades.</li>
<li>Data quality warnings.</li>
<li>Config/run manifest.</li>
<li>Engine/backend/certification.</li>
<li>Logs và failure reason.</li>
</ul><h2 id="8-9-e-xuat-kien-truc-sau-upgrade-v1">8.9 Đề xuất kiến trúc sau upgrade V1</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    MANAGER["Manager / Stakeholder"] --&gt; UI["Quant Portal"]
    RESEARCHER["Researcher"] --&gt; UI

    UI --&gt; CONTROL["TypeScript or C# Control Plane"]
    CONTROL --&gt; RBAC["RBAC / Audit / Quota"]
    CONTROL --&gt; ALPHAREG["Alpha Registry"]
    CONTROL --&gt; DATAREG["Dataset Snapshot Registry"]
    CONTROL --&gt; RUNREG["Run Registry"]
    CONTROL --&gt; APPROVAL["Approval Workflow"]
    CONTROL --&gt; DEPLOY["Deployment Registry"]

    CONTROL --&gt; QUEUE["Backtest Job Queue"]
    QUEUE --&gt; WORKERS["Python QuantBT Workers"]
    ALPHAREG --&gt; WORKERS
    DATAREG --&gt; WORKERS
    WORKERS --&gt; ENGINE["quantbt-engine"]
    ENGINE --&gt; ARTIFACT["Artifact Store"]
    ARTIFACT --&gt; RUNREG

    APPROVAL --&gt; DEPLOY
    DEPLOY --&gt; RUNTIME["Approved Alpha Runtime"]
    RUNTIME --&gt; TRADING["Trading System"]

    TRADING --&gt; OPSDB["Paper / Live Read Models"]
    MONITOR["Monitoring / Incidents"] --&gt; OPSDB
    OPSDB --&gt; UI
</div><pre class="mermaid">flowchart LR
    MANAGER["Manager / Stakeholder"] --&gt; UI["Quant Portal"]
    RESEARCHER["Researcher"] --&gt; UI

    UI --&gt; CONTROL["TypeScript or C# Control Plane"]
    CONTROL --&gt; RBAC["RBAC / Audit / Quota"]
    CONTROL --&gt; ALPHAREG["Alpha Registry"]
    CONTROL --&gt; DATAREG["Dataset Snapshot Registry"]
    CONTROL --&gt; RUNREG["Run Registry"]
    CONTROL --&gt; APPROVAL["Approval Workflow"]
    CONTROL --&gt; DEPLOY["Deployment Registry"]

    CONTROL --&gt; QUEUE["Backtest Job Queue"]
    QUEUE --&gt; WORKERS["Python QuantBT Workers"]
    ALPHAREG --&gt; WORKERS
    DATAREG --&gt; WORKERS
    WORKERS --&gt; ENGINE["quantbt-engine"]
    ENGINE --&gt; ARTIFACT["Artifact Store"]
    ARTIFACT --&gt; RUNREG

    APPROVAL --&gt; DEPLOY
    DEPLOY --&gt; RUNTIME["Approved Alpha Runtime"]
    RUNTIME --&gt; TRADING["Trading System"]

    TRADING --&gt; OPSDB["Paper / Live Read Models"]
    MONITOR["Monitoring / Incidents"] --&gt; OPSDB
    OPSDB --&gt; UI
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><hr class="section-divider"/>`;
