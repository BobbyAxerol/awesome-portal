/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 045082b02c479b5dd4a467f75daebce09b46e760cdf5759b321da31339c41f1e
 */
export const title = "3. RESEARCH & ALPHA DEVELOPMENT/RUNTIME LAYER";
export const html = `<h1 id="3-research-alpha-development-runtime-layer">3. RESEARCH &amp; ALPHA DEVELOPMENT/RUNTIME LAYER</h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Alpha là tài sản trí tuệ tạo ra quyết định mua/bán. Điều quan trọng sau acquire không phải ép researcher đổi công cụ, mà là đảm bảo đúng phiên bản alpha đã được kiểm định sẽ được promote nguyên vẹn sang paper và live.</p>
</blockquote><h2 id="cau-truc-hien-tai-3">Cấu trúc hiện tại</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    HIST["Historical Loader / Matrices"] --&gt; RESEARCH["Researcher Repository&lt;br/&gt;Python / Indicators / ML / Portfolio Logic"]
    RESEARCH --&gt; QBT["QuantBTEndpoint"]
    QBT --&gt; REPORT["Backtest / WFO / Audit Result"]

    STREAM["data_layer Warmup + Live Stream"] --&gt; RUNTIME["Shared Alpha Runtime"]
    RESEARCH --&gt; RUNTIME
    RUNTIME --&gt; SDK["Trading System Alpha SDK"]
    SDK --&gt; SESSION["Execution Session / Account Context"]
    SESSION --&gt; GW["Trading Gateway"]

    STATE["Local Account-Scoped Cache/State"] -. "cache only" .-&gt; RUNTIME
    DBSTATE["Trading System Orders / Positions / Balances"] --&gt; SDK
</div><pre class="mermaid">flowchart LR
    HIST["Historical Loader / Matrices"] --&gt; RESEARCH["Researcher Repository&lt;br/&gt;Python / Indicators / ML / Portfolio Logic"]
    RESEARCH --&gt; QBT["QuantBTEndpoint"]
    QBT --&gt; REPORT["Backtest / WFO / Audit Result"]

    STREAM["data_layer Warmup + Live Stream"] --&gt; RUNTIME["Shared Alpha Runtime"]
    RESEARCH --&gt; RUNTIME
    RUNTIME --&gt; SDK["Trading System Alpha SDK"]
    SDK --&gt; SESSION["Execution Session / Account Context"]
    SESSION --&gt; GW["Trading Gateway"]

    STATE["Local Account-Scoped Cache/State"] -. "cache only" .-&gt; RUNTIME
    DBSTATE["Trading System Orders / Positions / Balances"] --&gt; SDK
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="3-1-alpha-layer-ang-phuc-vu-cho-cac-muc-ich-sau">3.1 Alpha layer đang phục vụ cho các mục đích sau</h2><ul>
<li>Research signal/portfolio logic song song với platform development.</li>
<li>Backtest và calibrate bằng QuantBT.</li>
<li>Warmup từ historical/data-layer.</li>
<li>Chạy paper/sandbox/live thông qua shared SDK thay vì gọi broker trực tiếp.</li>
<li>Giữ strategy math tách khỏi gateway, risk, broker và accounting.</li>
<li>Tái sử dụng runtime cho nhiều family: portfolio rebalance, single-order, grid, fib, signal-combine và bracket-style strategies.</li>
</ul><h2 id="3-2-iem-manh-can-giu-nguyen">3.2 Điểm mạnh cần giữ nguyên</h2><ul>
<li>Python là ngôn ngữ alpha chính, phù hợp researcher và ecosystem khoa học dữ liệu.</li>
<li>Strategy logic được tách khỏi execution/trading credentials.</li>
<li>Shared SDK/runtime giảm việc mỗi alpha tự viết order API và state handling.</li>
<li>Account/mode/venue scope đã rõ hơn so với bot truyền thống.</li>
<li>Execution session đã được đưa vào để trace một rebalance/candle cycle.</li>
<li>Migration pattern ưu tiên giữ nguyên strategy math và chỉ thay wiring.</li>
<li>Paper/sandbox/live dùng cùng command schema ở trading boundary.</li>
<li>Local JSON/state được định hướng là cache/debug, không phải source of truth.</li>
</ul><h2 id="3-3-alpha-layer-hien-serve-cho-nhung-he-thong-nao">3.3 Alpha layer hiện serve cho những hệ thống nào</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Consumer/Flow</th>
<th>Vai trò alpha layer</th>
</tr>
</thead>
<tbody>
<tr>
<td>QuantBT</td>
<td>Phát signal, order intent, position matrix hoặc strategy callback</td>
</tr>
<tr>
<td>Paper mode</td>
<td>Chạy cùng strategy artifact trên live market data nhưng fill nội bộ</td>
</tr>
<tr>
<td>Sandbox</td>
<td>Gửi lệnh testnet qua gateway/risk/adapters</td>
</tr>
<tr>
<td>Live tương lai</td>
<td>Promote cùng artifact/config đã approved</td>
</tr>
<tr>
<td>Manager platform tương lai</td>
<td>Cung cấp manifest, parameter schema, owner, data requirement và evidence</td>
</tr>
<tr>
<td>Copy/outbox</td>
<td>Order/fill lifecycle có thể được publish theo policy, không expose strategy internals</td>
</tr>
</tbody>
</table></div><h2 id="3-4-anh-gia-muc-o-core-hien-tai-oi-voi-quant-firm">3.4 Đánh giá mức độ core hiện tại đối với quant firm</h2><p>Alpha/runtime layer hiện ở mức <strong>L3</strong>:</p><ul>
<li>Đủ mạnh để migrate nhiều alpha family vào cùng execution platform.</li>
<li>Có separation of concerns tốt hơn nhiều hệ thống quant nhỏ, nơi mỗi strategy tự nối data, broker và database.</li>
<li>Có khả năng scale theo số alpha bằng container/runtime pattern.</li>
<li>Có nền tảng để đạt “backtest-to-paper/live parity” vì strategy không cần viết lại toàn bộ execution path.</li>
</ul><p>Điểm chưa institutional nằm ở quản trị artifact và lifecycle, không phải ở khả năng viết alpha.</p><h2 id="3-5-khoang-trong-hien-tai">3.5 Khoảng trống hiện tại</h2><ul>
<li>Chưa có alpha manifest bắt buộc và schema thống nhất giữa tất cả repositories.</li>
<li>Chưa có immutable alpha package/image registry gắn với approval.</li>
<li>Dependency/environment vẫn có thể khác giữa researcher và runtime.</li>
<li>Chưa có standardized manager-exposed parameters.</li>
<li>Chưa có CI gate bắt buộc cho data contract, determinism, leakage và backtest parity.</li>
<li>Chưa có formal lifecycle <code>DRAFT → REVIEW → PAPER → LIVE</code> cấp platform.</li>
<li>Feature/model/data lineage chưa được nối xuyên suốt.</li>
<li>Chưa có resource quota và sandboxing cho untrusted alpha code.</li>
<li>Một số alpha có thể còn local-state assumptions hoặc legacy wrapper semantics cần migrate dần.</li>
</ul><h2 id="3-6-ke-hoach-nang-cap-sau-acquire">3.6 Kế hoạch nâng cấp sau acquire</h2><h3 id="a0-alpha-inventory">A0 — Alpha inventory</h3><ul>
<li>Liệt kê repo, owner, strategy family, timeframe, universe, dependencies và current mode.</li>
<li>Xác định exact commit/image đang chạy.</li>
<li>Chọn golden alpha cho từng contract: signal, intrabar, explicit order, portfolio, WFO và bracket.</li>
</ul><h3 id="a1-alpha-manifest-chuan">A1 — Alpha manifest chuẩn</h3><div class="code-card"><div class="artifact-toolbar"><span>YAML</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-yaml">alpha_id: crypto.cross_sectional_momentum
version: 1.4.0
git_sha: 9f1c...
image_digest: sha256:...
owner_team: quant-research
entrypoint: alpha.main:Alpha

output_contract: position_matrix_v1
quantbt_route: portfolio
execution_contract: close_target_v2

data_requirements:
  dataset_id: binance_usdm_daily_matrix
  schema_version: 2
  minimum_history_days: 1095

manager_exposed_parameters:
  - lookback
  - top_n
  - rebalance_frequency

risk_profile_id: crypto_market_neutral_v1
deterministic: true
default_seed: 42
</code></pre></div><h3 id="a2-build-once-promote-same-artifact">A2 — Build once, promote same artifact</h3><ul>
<li>CI build immutable container/wheel.</li>
<li>Backtest worker và runtime dùng cùng digest.</li>
<li>Model artifact có checksum/version riêng.</li>
<li>Config thay đổi tạo một immutable config version.</li>
<li>Không copy code từ notebook sang live bot.</li>
</ul><h3 id="a3-alpha-lifecycle">A3 — Alpha lifecycle</h3><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">DRAFT
  -&gt; TECHNICAL_VALIDATION
  -&gt; QUANT_REVIEW
  -&gt; CANDIDATE
  -&gt; APPROVED_FOR_PAPER
  -&gt; PAPER_RUNNING
  -&gt; LIVE_CANDIDATE
  -&gt; LIVE_CANARY
  -&gt; LIVE_APPROVED
  -&gt; SUSPENDED / RETIRED
</code></pre></div><h3 id="a4-research-governance">A4 — Research governance</h3><ul>
<li>Deterministic seed và dependency lock.</li>
<li>Data snapshot bắt buộc.</li>
<li>Leakage/look-ahead test.</li>
<li>WFO methodology gate.</li>
<li>Risk/capacity report.</li>
<li>Manager chỉ thay parameter được whitelist.</li>
</ul><h2 id="3-7-e-xuat-kien-truc-sau-upgrade-v1">3.7 Đề xuất kiến trúc sau upgrade V1</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    DEV["Researcher"] --&gt; GIT["Alpha Repository"]
    GIT --&gt; CI["CI Validation&lt;br/&gt;Tests / Contract / Leakage / Build"]
    CI --&gt; PACKAGE["Immutable Alpha Artifact"]
    CI --&gt; MANIFEST["Alpha Manifest + Parameter Schema"]

    PACKAGE --&gt; REGISTRY["Alpha Registry"]
    MANIFEST --&gt; REGISTRY

    REGISTRY --&gt; BTW["QuantBT Worker"]
    DATASET["Dataset Snapshot"] --&gt; BTW
    BTW --&gt; EVIDENCE["Backtest Evidence Bundle"]

    EVIDENCE --&gt; REVIEW["Quant / Risk / Manager Review"]
    REVIEW --&gt; APPROVAL["Approval Record"]

    REGISTRY --&gt; RUNTIME["Approved Alpha Runtime"]
    APPROVAL --&gt; RUNTIME
    STREAM["Live Market Data"] --&gt; RUNTIME
    RUNTIME --&gt; TRADING["Trading System Gateway"]

    OBS["Runtime / Paper / Live Metrics"] --&gt; REVIEW
</div><pre class="mermaid">flowchart LR
    DEV["Researcher"] --&gt; GIT["Alpha Repository"]
    GIT --&gt; CI["CI Validation&lt;br/&gt;Tests / Contract / Leakage / Build"]
    CI --&gt; PACKAGE["Immutable Alpha Artifact"]
    CI --&gt; MANIFEST["Alpha Manifest + Parameter Schema"]

    PACKAGE --&gt; REGISTRY["Alpha Registry"]
    MANIFEST --&gt; REGISTRY

    REGISTRY --&gt; BTW["QuantBT Worker"]
    DATASET["Dataset Snapshot"] --&gt; BTW
    BTW --&gt; EVIDENCE["Backtest Evidence Bundle"]

    EVIDENCE --&gt; REVIEW["Quant / Risk / Manager Review"]
    REVIEW --&gt; APPROVAL["Approval Record"]

    REGISTRY --&gt; RUNTIME["Approved Alpha Runtime"]
    APPROVAL --&gt; RUNTIME
    STREAM["Live Market Data"] --&gt; RUNTIME
    RUNTIME --&gt; TRADING["Trading System Gateway"]

    OBS["Runtime / Paper / Live Metrics"] --&gt; REVIEW
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><hr class="section-divider"/>`;
