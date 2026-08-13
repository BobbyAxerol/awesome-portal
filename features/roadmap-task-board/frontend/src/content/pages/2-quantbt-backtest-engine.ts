/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 69eb070debea9dadc3505926db9b007def1e16051ebbb734afde22f90f8a279b
 */
export const title = "2. QUANTBT — BACKTEST ENGINE";
export const html = `<h1 id="2-quantbt-backtest-engine">2. QUANTBT — BACKTEST ENGINE</h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> QuantBT là bộ mô phỏng và kiểm định, không phải nơi trực tiếp gửi tiền ra thị trường. Giá trị của nó nằm ở khả năng chạy nhanh nhiều giả thuyết nhưng vẫn lưu được orders, fills, accounting, WFO và audit evidence để người phê duyệt không chỉ nhìn một đường equity đẹp.</p>
</blockquote><h2 id="cau-truc-hien-tai-2">Cấu trúc hiện tại</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    DATA["Historical Data / Dataset Loader"] --&gt; ENDPOINT["QuantBTEndpoint&lt;br/&gt;Stable Public Facade"]
    ALPHA["Signal / Strategy / Orders / Position Matrix"] --&gt; ENDPOINT

    ENDPOINT --&gt; ROUTER{"Execution Contract / Route"}

    ROUTER --&gt; VEC["Native Vectorized&lt;br/&gt;NumPy / Numba"]
    ROUTER --&gt; INTRA["Fast Intrabar&lt;br/&gt;SL / TP / Trailing / Session"]
    ROUTER --&gt; EVENTPY["Native Event-Driven&lt;br/&gt;Python Canonical"]
    EVENTPY -. "explicit capability request" .-&gt; RUST["Optional quantbt-native&lt;br/&gt;PyO3 / Rust Accelerator"]
    ROUTER --&gt; PORT["Native Portfolio"]
    ROUTER --&gt; PACKAGE["Basket / Arbitrage / Grid / Options"]
    ROUTER --&gt; REPLAY["Fill Replay / Accounting"]
    ROUTER --&gt; METH["Train-Test / Walk-Forward / Optimization"]
    ROUTER --&gt; NAUT["NautilusTrader External Validation"]

    VEC --&gt; RESULT["QuantBTResult"]
    INTRA --&gt; RESULT
    EVENTPY --&gt; RESULT
    RUST --&gt; RESULT
    PORT --&gt; RESULT
    PACKAGE --&gt; RESULT
    REPLAY --&gt; RESULT
    METH --&gt; RESULT
    NAUT --&gt; RESULT

    RESULT --&gt; REPORT["Minimal / Standard / Audit Reports"]
    REPORT --&gt; ART["Metrics / Orders / Fills / Positions / Trades / Equity / Run Manifest"]
</div><pre class="mermaid">flowchart LR
    DATA["Historical Data / Dataset Loader"] --&gt; ENDPOINT["QuantBTEndpoint&lt;br/&gt;Stable Public Facade"]
    ALPHA["Signal / Strategy / Orders / Position Matrix"] --&gt; ENDPOINT

    ENDPOINT --&gt; ROUTER{"Execution Contract / Route"}

    ROUTER --&gt; VEC["Native Vectorized&lt;br/&gt;NumPy / Numba"]
    ROUTER --&gt; INTRA["Fast Intrabar&lt;br/&gt;SL / TP / Trailing / Session"]
    ROUTER --&gt; EVENTPY["Native Event-Driven&lt;br/&gt;Python Canonical"]
    EVENTPY -. "explicit capability request" .-&gt; RUST["Optional quantbt-native&lt;br/&gt;PyO3 / Rust Accelerator"]
    ROUTER --&gt; PORT["Native Portfolio"]
    ROUTER --&gt; PACKAGE["Basket / Arbitrage / Grid / Options"]
    ROUTER --&gt; REPLAY["Fill Replay / Accounting"]
    ROUTER --&gt; METH["Train-Test / Walk-Forward / Optimization"]
    ROUTER --&gt; NAUT["NautilusTrader External Validation"]

    VEC --&gt; RESULT["QuantBTResult"]
    INTRA --&gt; RESULT
    EVENTPY --&gt; RESULT
    RUST --&gt; RESULT
    PORT --&gt; RESULT
    PACKAGE --&gt; RESULT
    REPLAY --&gt; RESULT
    METH --&gt; RESULT
    NAUT --&gt; RESULT

    RESULT --&gt; REPORT["Minimal / Standard / Audit Reports"]
    REPORT --&gt; ART["Metrics / Orders / Fills / Positions / Trades / Equity / Run Manifest"]
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="2-1-quantbt-ang-phuc-vu-cho-cac-muc-ich-sau">2.1 QuantBT đang phục vụ cho các mục đích sau</h2><ul>
<li>Fast research loop cho signal và parameter sweep.</li>
<li>Intrabar execution simulation cho SL/TP/trailing/session rules.</li>
<li>Event-driven order lifecycle cho market/limit/conditional/explicit-order strategy.</li>
<li>Multi-symbol portfolio simulation và attribution.</li>
<li>Basket, arbitrage, grid và package-style execution research.</li>
<li>Fill replay để khóa accounting/migration parity.</li>
<li>Train/test split, walk-forward optimization và robust calibration.</li>
<li>External validation bằng NautilusTrader cho selected audit runs.</li>
<li>Xuất audit artifacts có thể review bởi researcher, manager hoặc reviewer độc lập.</li>
</ul><h2 id="2-2-cac-loai-backtest-strategy-hien-ang-supported">2.2 Các loại backtest strategy hiện đang supported</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Loại backtest</th>
<th>Kernel/route hiện có</th>
<th>Đánh giá</th>
</tr>
</thead>
<tbody>
<tr>
<td>Target position / signal</td>
<td>Native vectorized</td>
<td>Nhanh, phù hợp sweep và close-to-close research</td>
</tr>
<tr>
<td>Intrabar SL/TP/trailing</td>
<td>Fast intrabar engine + readable reference/oracle</td>
<td>Có execution contract rõ, phù hợp audit intrabar</td>
</tr>
<tr>
<td>Explicit orders</td>
<td>Native event-driven, Python canonical</td>
<td>Quản lý order/fill/fees/margin/funding causally</td>
</tr>
<tr>
<td>Rust-accelerated explicit-order path</td>
<td>Optional PyO3/Rust backend</td>
<td>Hiện capability-gated cho đường certified cụ thể, không phải toàn engine</td>
</tr>
<tr>
<td>Multi-symbol portfolio</td>
<td>Native portfolio</td>
<td>Target weight/notional/units, gross/net, attribution, sizing</td>
</tr>
<tr>
<td>Basket/arbitrage</td>
<td>Event/package routes</td>
<td>Phù hợp pair/basis/stat-arb/package diagnostics</td>
</tr>
<tr>
<td>Grid/DCA/package</td>
<td>Event/package routes</td>
<td>Có route nhưng cần chọn certification level theo use case</td>
</tr>
<tr>
<td>Fill replay</td>
<td>Accounting replay</td>
<td>Khóa accounting từ external/legacy fills</td>
</tr>
<tr>
<td>Train/test split</td>
<td>Methodology/optimization</td>
<td>Tách train/test và giữ audit metadata</td>
</tr>
<tr>
<td>Walk-forward</td>
<td>WFO methodology</td>
<td>Candidate freeze và stitched OOS</td>
</tr>
<tr>
<td>Options</td>
<td>Specialized option route/package</td>
<td>Phục vụ option payoff/portfolio analysis theo scope hiện có</td>
</tr>
<tr>
<td>External validation</td>
<td>Nautilus adapter</td>
<td>Dùng cho selected high-fidelity validation, không dùng broad sweep mặc định</td>
</tr>
</tbody>
</table></div><h2 id="2-3-anh-gia-pham-vi-strategy-validation-va-calibration">2.3 Đánh giá phạm vi strategy, validation và calibration</h2><p>Về <strong>phạm vi backtest kernel</strong>, có thể đánh giá QuantBT đã cover khoảng <strong>85–90% nhu cầu phổ biến của một quant fund nhỏ/trung bình</strong>:</p><ul>
<li>Signal/vectorized research.</li>
<li>Intrabar execution.</li>
<li>Explicit-order event lifecycle.</li>
<li>Multi-symbol portfolio.</li>
<li>Walk-forward/train-test.</li>
<li>Fees, slippage, leverage, margin, funding, liquidation.</li>
<li>Audit reports và external validation path.</li>
</ul><p>Con số này chỉ áp dụng cho <strong>research/backtest/evaluation kernel</strong>, không phải 90% của toàn bộ quant firm. Một full quant platform còn cần data snapshot, job orchestration, user/RBAC, registry, approval, deployment, monitoring và live operations.</p><h2 id="2-4-output-a-co">2.4 Output đã có</h2><p>QuantBT đã xuất được:</p><ul>
<li>Account.</li>
<li>Orders.</li>
<li>Fills.</li>
<li>Positions.</li>
<li>Trades.</li>
<li>Equity.</li>
<li>Returns.</li>
<li>Metrics.</li>
<li>Config.</li>
<li>Run manifest.</li>
<li>Per-symbol attribution.</li>
<li>Exposure/margin/funding/liquidation diagnostics theo route.</li>
<li>Standard plots và optional QuantStats HTML.</li>
<li>Certification/parity artifacts cho selected external validation.</li>
</ul><p>Các report level:</p><ul>
<li><code>minimal</code>: optimization trial/scalar score, hạn chế heavy artifact.</li>
<li><code>standard</code>: research review thông thường.</li>
<li><code>audit</code>: orders, fills, lifecycle, diagnostics và evidence đầy đủ.</li>
</ul><p>Đây là thiết kế rất phù hợp cho platform: hàng nghìn trial chạy nhẹ; chỉ candidate cuối mới tạo full audit bundle.</p><h2 id="2-5-wfo-train-test-hien-tai">2.5 WFO/train-test hiện tại</h2><p>WFO hiện đã có nguyên tắc đúng:</p><ol>
<li>Train/optimize chỉ trên in-sample.</li>
<li>Candidate được freeze trước khi nhìn OOS.</li>
<li>OOS dùng để đánh giá candidate đã đóng băng.</li>
<li>Fold results được lưu và stitched thành OOS series.</li>
<li>Metadata/trial/candidate tables cho phép audit cách parameter được chọn.</li>
</ol><p>Manager portal sau này phải dùng đúng methodology này. Không được biến OOS thành leaderboard rồi tiếp tục chọn parameter trên OOS.</p><h2 id="2-6-quantbt-packaging-va-rust-iem-noi-bat-can-nhan-manh">2.6 QuantBT packaging và Rust — điểm nổi bật cần nhấn mạnh</h2><p>Nhánh <code>feat/quantbt-engine-packaging</code> cho thấy project đang chuyển từ “repo nội bộ có thể import” sang một engine có release discipline:</p><ul>
<li>Core distribution: <strong><code>quantbt-engine</code></strong>, import name là <code>quantbt</code>.</li>
<li>Version target hiện tại: <code>1.0.7</code>.</li>
<li>Python 3.11–3.13.</li>
<li>Wheel/sdist, <code>twine check</code>, clean install, <code>pip check</code>, secret scan và SHA-256 release manifest đã được đưa vào release gate.</li>
<li>TestPyPI workflow là manual/OIDC protected trước khi production PyPI release.</li>
<li>Tại thời điểm review, public PyPI listing chưa xuất hiện; nên mô tả đúng là <strong>release-ready/pending final publication</strong>, không phải đã phát hành production.</li>
</ul><h3 id="rust-highlight">Rust highlight</h3><ul>
<li><code>quantbt-native</code> là optional PyO3/Rust accelerator.</li>
<li>Python vẫn là canonical/default backend.</li>
<li><code>backend="auto"</code> vẫn chọn Python theo release policy.</li>
<li>Rust chỉ được dùng khi caller yêu cầu explicit và route nằm trong capability matrix được chứng nhận.</li>
<li>Rust hiện chứng minh được parity và tốc độ rất cao ở bounded score-kernel/static-tape path.</li>
<li>Full reactive strategy facade không mặc định nhanh hơn; repository cũng ghi nhận có workload Grid mà Rust hiện chậm hơn Python.</li>
</ul><p>Điều này không làm giảm giá trị của Rust. Ngược lại, đây là một điểm kiến trúc tốt: <strong>hot path có thể được tăng tốc bằng native backend mà không phá Python API, trong khi unsupported semantics fail-fast thay vì âm thầm đổi kết quả</strong>.</p><h2 id="2-7-co-the-verify-boi-ben-thu-ba-va-ai-theo-cach-nao">2.7 Có thể verify bởi bên thứ ba và AI theo cách nào</h2><p>QuantBT có lợi thế là public, modular và inspectable:</p><ul>
<li>Stable public endpoint.</li>
<li>Explicit execution contracts.</li>
<li>Versioned benchmark artifacts.</li>
<li>Python/Rust parity evidence.</li>
<li>External Nautilus validation route.</li>
<li>Run manifest và audit outputs.</li>
<li>Tests phân theo kernel/methodology/reporting.</li>
</ul><p>Do đó bên thứ ba hoặc AI có thể review:</p><ul>
<li>Look-ahead control.</li>
<li>Order/fill causality.</li>
<li>Fee/slippage/funding handling.</li>
<li>WFO fold isolation.</li>
<li>Cross-backend parity.</li>
<li>Reproducibility của run.</li>
</ul><p>Đây là khả năng <strong>review/verification</strong>, không tự động đồng nghĩa với formal financial certification.</p><h2 id="2-8-anh-gia-muc-o-core-hien-tai-oi-voi-quant-firm">2.8 Đánh giá mức độ core hiện tại đối với quant firm</h2><p><strong>Đánh giá rất cao:</strong> QuantBT là subsystem mạnh và có khả năng trở thành IP trung tâm của hệ sinh thái.</p><ul>
<li>Với research/backtest kernel: L3.5–L4.</li>
<li>Với distributed multi-user backtest platform: hiện L2 vì lớp platform chưa được xây.</li>
<li>Khả năng migrate rất tốt vì đã có một facade ổn định; control plane chỉ cần gọi facade thay vì phụ thuộc internals.</li>
<li>Khả năng scale tốt nhờ prepared service context, report-level separation, Numba path và optional Rust path.</li>
<li>Không cần rewrite sang C#/Rust toàn bộ. Python API + native hot path là lựa chọn hợp lý cho team quant.</li>
</ul><h2 id="2-9-quantbt-con-thieu-gi">2.9 QuantBT còn thiếu gì</h2><p>QuantBT hiện là <strong>kernel/library/package</strong>, chưa phải multi-user platform:</p><ul>
<li>Multi-tenant job queue.</li>
<li>User/RBAC.</li>
<li>Compute quota và priority.</li>
<li>Run registry tập trung.</li>
<li>Immutable alpha registry.</li>
<li>Dataset snapshot registry.</li>
<li>Approval workflow.</li>
<li>Isolated worker scheduling.</li>
<li>Object-store artifact management.</li>
<li>Portal cho manager.</li>
<li>Distributed optimization orchestration.</li>
<li>Formal release compatibility policy giữa engine version và historical run.</li>
</ul><p>Ngoài ra, Rust cần tiếp tục được quản trị đúng:</p><ul>
<li>Không quảng bá là universal backend trước khi capability coverage tăng.</li>
<li>Native wheel matrix và parity gate phải độc lập với core PyPI release.</li>
<li>Mọi unsupported contract phải fail-fast hoặc fallback theo policy được ghi trong manifest.</li>
</ul><h2 id="2-10-ke-hoach-upgrade-sau-acquire">2.10 Kế hoạch upgrade sau acquire</h2><h3 id="q0-package-va-api-freeze">Q0 — Package và API freeze</h3><ul>
<li>Hoàn tất TestPyPI/production PyPI release cho <code>quantbt-engine</code>.</li>
<li>Freeze <code>QuantBTEndpoint</code> và semantic versioning.</li>
<li>Tách rõ core package, optional validation extras và native package.</li>
<li>Mỗi run ghi exact package version, Git SHA và dependency lock hash.</li>
</ul><h3 id="q1-quantbt-worker-service">Q1 — QuantBT Worker Service</h3><ul>
<li>Containerized Python worker.</li>
<li>Input là immutable <code>BacktestRunSpec</code>.</li>
<li>Output là artifact bundle và normalized result.</li>
<li>Mỗi job chạy isolated process/container.</li>
<li>Không expose internal engine modules qua API.</li>
</ul><h3 id="q2-prepared-context-va-optimization-orchestration">Q2 — Prepared context và optimization orchestration</h3><ul>
<li>Cache normalized market tape theo dataset snapshot.</li>
<li>Dùng prepared service context cho repeated trials.</li>
<li>Trial chạy <code>minimal</code>; candidate chạy <code>standard</code>; approval run chạy <code>audit</code>.</li>
<li>Distributed queue và resource-aware worker pools.</li>
</ul><h3 id="q3-certification-policy">Q3 — Certification policy</h3><ul>
<li>Route-to-certification matrix.</li>
<li>Vectorized run không được tự nhận intrabar execution quality.</li>
<li>Selected event/intrabar run được parity/audit.</li>
<li>Nautilus chỉ chạy representative final candidates.</li>
<li>Rust chỉ chạy contract đã certified.</li>
</ul><h2 id="2-11-e-xuat-kien-truc-sau-upgrade-v1-dua-tren-he-thong-a-migration">2.11 Đề xuất kiến trúc sau upgrade V1 dựa trên hệ thống đã migration</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    PORTAL["Manager / Research Portal"] --&gt; API["Backtest Control Plane API"]
    API --&gt; REG["Alpha Registry"]
    API --&gt; DATAREG["Dataset Snapshot Registry"]
    API --&gt; RUNREG["Backtest Run Registry"]
    API --&gt; QUEUE["Job Queue / Scheduler"]

    QUEUE --&gt; WORKER["Isolated Python Quant Worker"]
    REG --&gt; WORKER
    DATAREG --&gt; WORKER

    WORKER --&gt; ENGINE["quantbt-engine&lt;br/&gt;QuantBTEndpoint"]
    ENGINE --&gt; PY["Python / NumPy / Numba Canonical"]
    ENGINE -. "certified explicit request" .-&gt; NATIVE["quantbt-native&lt;br/&gt;PyO3 / Rust"]
    ENGINE --&gt; NAUT["Selected Nautilus Validation"]

    ENGINE --&gt; ARTIFACT["Object Storage&lt;br/&gt;Metrics / Reports / Orders / Fills / Manifest"]
    ARTIFACT --&gt; RUNREG
    RUNREG --&gt; PORTAL

    APPROVAL["Approval Workflow"] --&gt; RUNREG
    PORTAL --&gt; APPROVAL
</div><pre class="mermaid">flowchart LR
    PORTAL["Manager / Research Portal"] --&gt; API["Backtest Control Plane API"]
    API --&gt; REG["Alpha Registry"]
    API --&gt; DATAREG["Dataset Snapshot Registry"]
    API --&gt; RUNREG["Backtest Run Registry"]
    API --&gt; QUEUE["Job Queue / Scheduler"]

    QUEUE --&gt; WORKER["Isolated Python Quant Worker"]
    REG --&gt; WORKER
    DATAREG --&gt; WORKER

    WORKER --&gt; ENGINE["quantbt-engine&lt;br/&gt;QuantBTEndpoint"]
    ENGINE --&gt; PY["Python / NumPy / Numba Canonical"]
    ENGINE -. "certified explicit request" .-&gt; NATIVE["quantbt-native&lt;br/&gt;PyO3 / Rust"]
    ENGINE --&gt; NAUT["Selected Nautilus Validation"]

    ENGINE --&gt; ARTIFACT["Object Storage&lt;br/&gt;Metrics / Reports / Orders / Fills / Manifest"]
    ARTIFACT --&gt; RUNREG
    RUNREG --&gt; PORTAL

    APPROVAL["Approval Workflow"] --&gt; RUNREG
    PORTAL --&gt; APPROVAL
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><hr class="section-divider"/>`;
