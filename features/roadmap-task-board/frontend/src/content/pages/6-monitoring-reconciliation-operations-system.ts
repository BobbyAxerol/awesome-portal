/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 6b6a4cfe894e3feb66dfb2a326f3c3f3300e03e488faaa1935782082432f06ae
 */
export const title = "6. MONITORING, RECONCILIATION & OPERATIONS SYSTEM";
export const html = `<h1 id="6-monitoring-reconciliation-operations-system">6. MONITORING, RECONCILIATION &amp; OPERATIONS SYSTEM</h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Monitoring ở đây không đồng nghĩa với một dashboard. Hệ thống phải phát hiện sai lệch, mở incident và có khả năng block/pause/halt ngay cả khi giao diện quản trị bị tắt. Dashboard chỉ là nơi nhìn thấy quyết định của safety system.</p>
</blockquote><h2 id="cau-truc-hien-tai-5">Cấu trúc hiện tại</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    GW["Gateway"] --&gt; HB["Service Heartbeats"]
    RISK["Risk"] --&gt; HB
    EXEC["Execution"] --&gt; HB
    PAPER["Paper"] --&gt; HB
    PORT["Portfolio"] --&gt; HB
    PERF["Performance"] --&gt; HB

    STREAMS["Redis Command/Event Streams"] --&gt; LAG["Stream Lag / Pending Scanner"]
    STREAMS --&gt; DLQ["Dead-Letter Scanner"]
    REDIS["Redis Resources"] --&gt; RES["Redis Memory / Connectivity Health"]
    DB["PostgreSQL / Timescale"] --&gt; RES

    BROKER["Broker Orders / Positions / Balances"] --&gt; RECON["Reconciliation Service"]
    DB --&gt; RECON

    HB --&gt; MON["Monitor Service"]
    LAG --&gt; MON
    DLQ --&gt; MON
    RES --&gt; MON
    RECON --&gt; MON

    MON --&gt; ALERTS["Alerts / Logs / Loki-Grafana / CLI"]
    MON --&gt; HEALTH["/v1/health + Capability Health"]
    RECON --&gt; RISK["Fail-Closed Trading Gate"]
    ALERTS --&gt; OP["Operator"]
    OP --&gt; STATE["ACTIVE / REDUCING / HALTED"]
    STATE --&gt; RISK
</div><pre class="mermaid">flowchart LR
    GW["Gateway"] --&gt; HB["Service Heartbeats"]
    RISK["Risk"] --&gt; HB
    EXEC["Execution"] --&gt; HB
    PAPER["Paper"] --&gt; HB
    PORT["Portfolio"] --&gt; HB
    PERF["Performance"] --&gt; HB

    STREAMS["Redis Command/Event Streams"] --&gt; LAG["Stream Lag / Pending Scanner"]
    STREAMS --&gt; DLQ["Dead-Letter Scanner"]
    REDIS["Redis Resources"] --&gt; RES["Redis Memory / Connectivity Health"]
    DB["PostgreSQL / Timescale"] --&gt; RES

    BROKER["Broker Orders / Positions / Balances"] --&gt; RECON["Reconciliation Service"]
    DB --&gt; RECON

    HB --&gt; MON["Monitor Service"]
    LAG --&gt; MON
    DLQ --&gt; MON
    RES --&gt; MON
    RECON --&gt; MON

    MON --&gt; ALERTS["Alerts / Logs / Loki-Grafana / CLI"]
    MON --&gt; HEALTH["/v1/health + Capability Health"]
    RECON --&gt; RISK["Fail-Closed Trading Gate"]
    ALERTS --&gt; OP["Operator"]
    OP --&gt; STATE["ACTIVE / REDUCING / HALTED"]
    STATE --&gt; RISK
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="6-1-monitoring-system-hien-ang-phuc-vu-cho-cac-muc-ich-sau">6.1 Monitoring system hiện đang phục vụ cho các mục đích sau</h2><ul>
<li>Xác định service còn sống và ready hay không.</li>
<li>Phát hiện stale/missing heartbeat.</li>
<li>Kiểm tra Redis stream lag và pending messages.</li>
<li>Quản lý poison message/dead letter.</li>
<li>Kiểm tra Redis/Postgres resource health.</li>
<li>Reconcile paper, sandbox/live orders, positions và account state.</li>
<li>Gating risk khi broker sync missing/stale/error/mismatch.</li>
<li>Expose capability health cho broker adapter/user stream.</li>
<li>Cung cấp operator CLI, logs và alert path.</li>
<li>Giữ operation state <code>ACTIVE</code>, <code>REDUCING</code>, <code>HALTED</code>.</li>
</ul><h2 id="6-2-iem-manh-can-giu-nguyen">6.2 Điểm mạnh cần giữ nguyên</h2><ul>
<li>Monitoring đã có detector và reconciliation, không chỉ dashboard.</li>
<li>Health state kết hợp Redis heartbeat và database projection.</li>
<li>Consumer pending/dead-letter được xem là first-class signal.</li>
<li>Broker-authoritative reconciliation gắn trực tiếp với risk gate.</li>
<li>Capability health tách broker client/user stream khỏi core service health.</li>
<li>CLI/runbook được sử dụng cho operation, phù hợp giai đoạn trước dashboard.</li>
<li>Fail-closed policy cho sandbox/live.</li>
<li>Reconciliation có dry-run/apply và audit thay vì âm thầm sửa state.</li>
<li>Physical broker account reconciliation được tách khỏi virtual alpha ledger.</li>
</ul><h2 id="6-3-anh-gia-muc-o-core-hien-tai-oi-voi-quant-firm">6.3 Đánh giá mức độ core hiện tại đối với quant firm</h2><p>Monitoring/reconciliation hiện đạt <strong>L3 operational foundation</strong>:</p><ul>
<li>Đủ cho một quant firm nhỏ/trung bình chạy controlled paper/sandbox với kỷ luật.</li>
<li>Có nhiều primitive mà các dashboard-centric project thường thiếu: pending recovery, dead letters, broker sync, findings, kill state và capability health.</li>
<li>Đây là nền tảng rất tốt để xây end-to-end monitoring system mà không cần thay core.</li>
</ul><p>Điểm chưa L4 là monitoring logic còn phân tán, incident/action lifecycle chưa thành một control plane thống nhất và chưa bao phủ research/backtest/data lineage đầy đủ.</p><h2 id="6-4-khoang-trong-hien-tai">6.4 Khoảng trống hiện tại</h2><ul>
<li>Chưa có central health-state builder cho toàn ecosystem.</li>
<li>Chưa có stateful rule engine thống nhất.</li>
<li>Incident lifecycle, owner, severity, timeline, RCA và preventive task chưa thành first-class domain.</li>
<li>Action execution chưa được quản trị bởi policy/approval/audit thống nhất.</li>
<li>Chưa nối trace end-to-end từ dataset/run/alpha session tới broker fill.</li>
<li>Data quality, backtest job và alpha runtime monitoring chưa cùng một incident model.</li>
<li>SLO/SLI, error budget và escalation routing chưa hoàn chỉnh.</li>
<li>Chưa có DR/game-day certification định kỳ.</li>
<li>Dashboard/read model chưa tối ưu cho manager/non-tech.</li>
<li>Portal outage independence cần được chứng minh: monitoring/action phải hoạt động khi UI down.</li>
</ul><h2 id="6-5-ke-hoach-nang-cap-sau-acquire">6.5 Kế hoạch nâng cấp sau acquire</h2><h3 id="m0-chuan-hoa-telemetry-va-identity">M0 — Chuẩn hóa telemetry và identity</h3><p>Mọi event/log/metric cần:</p><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">trace_id
correlation_id
causation_id
execution_session_id
alpha_version_id
deployment_id
account_id
venue
mode
client_order_id
venue_order_id
dataset_snapshot_id / backtest_run_id nếu liên quan
</code></pre></div><h3 id="m1-health-state-builder">M1 — Health state builder</h3><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">HEALTHY
DEGRADED
AT_RISK
PAUSED
HALTED
UNKNOWN
</code></pre></div><p>State được tính từ:</p><ul>
<li>Service heartbeat.</li>
<li>Market-data readiness.</li>
<li>Stream lag.</li>
<li>Data quality.</li>
<li>Risk state.</li>
<li>Broker sync/reconciliation.</li>
<li>Performance divergence.</li>
</ul><h3 id="m2-stateful-rule-engine">M2 — Stateful rule engine</h3><p>Ví dụ:</p><ul>
<li>Stale market data 3 lần liên tiếp → pause deployment.</li>
<li>Position mismatch + open order uncertainty → halt account.</li>
<li>Backtest dataset quality fail → block approval.</li>
<li>Drawdown breach → reducing-only.</li>
<li>Redis lag vượt SLO → block new order but allow cancel/close.</li>
</ul><h3 id="m3-incident-va-action-plane">M3 — Incident và action plane</h3><p>Action levels:</p><ol>
<li>Alert only.</li>
<li>Block new orders.</li>
<li>Pause deployment.</li>
<li>Cancel open orders.</li>
<li>Flatten theo approved policy.</li>
</ol><p>Flatten không được mặc định tự động cho mọi incident.</p><h3 id="m4-game-day-tests">M4 — Game-day tests</h3><ul>
<li>Data stream stale/sequence gap.</li>
<li>Redis restart.</li>
<li>DB failover.</li>
<li>Alpha crash.</li>
<li>Risk crash.</li>
<li>Executor timeout after broker accepted order.</li>
<li>Listener missing fill.</li>
<li>Position/balance mismatch.</li>
<li>Portal outage.</li>
<li>Kill switch activation.</li>
</ul><h2 id="6-6-e-xuat-kien-truc-sau-upgrade-v1">6.6 Đề xuất kiến trúc sau upgrade V1</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    DATA["Historical + Streaming Data Services"] --&gt; INGEST["Telemetry &amp; Business Event Ingest"]
    BACKTEST["QuantBT Workers"] --&gt; INGEST
    ALPHA["Alpha Runtime"] --&gt; INGEST
    RISK["Risk / Gateway"] --&gt; INGEST
    EXEC["Paper / Live Execution"] --&gt; INGEST
    DB["Operational DB"] --&gt; RECON["Reconciliation Engine"]
    BROKER["Broker Authoritative State"] --&gt; RECON

    INGEST --&gt; STATE["Health State Builder"]
    INGEST --&gt; RULE["Stateful Rule Engine"]
    RECON --&gt; RULE

    STATE --&gt; INCIDENT["Incident Service"]
    RULE --&gt; INCIDENT
    INCIDENT --&gt; ACTION["Policy-Gated Action Executor"]

    ACTION --&gt; RISK
    ACTION --&gt; EXEC
    ACTION --&gt; ALPHA

    INCIDENT --&gt; READ["Monitoring Read Model"]
    READ --&gt; PORTAL["Manager / Operator Portal"]
    READ --&gt; ALERT["Pager / Email / Discord / Chat"]

    AUDIT["Immutable Action + Incident Audit"] --&gt; INCIDENT
    ACTION --&gt; AUDIT
</div><pre class="mermaid">flowchart LR
    DATA["Historical + Streaming Data Services"] --&gt; INGEST["Telemetry &amp; Business Event Ingest"]
    BACKTEST["QuantBT Workers"] --&gt; INGEST
    ALPHA["Alpha Runtime"] --&gt; INGEST
    RISK["Risk / Gateway"] --&gt; INGEST
    EXEC["Paper / Live Execution"] --&gt; INGEST
    DB["Operational DB"] --&gt; RECON["Reconciliation Engine"]
    BROKER["Broker Authoritative State"] --&gt; RECON

    INGEST --&gt; STATE["Health State Builder"]
    INGEST --&gt; RULE["Stateful Rule Engine"]
    RECON --&gt; RULE

    STATE --&gt; INCIDENT["Incident Service"]
    RULE --&gt; INCIDENT
    INCIDENT --&gt; ACTION["Policy-Gated Action Executor"]

    ACTION --&gt; RISK
    ACTION --&gt; EXEC
    ACTION --&gt; ALPHA

    INCIDENT --&gt; READ["Monitoring Read Model"]
    READ --&gt; PORTAL["Manager / Operator Portal"]
    READ --&gt; ALERT["Pager / Email / Discord / Chat"]

    AUDIT["Immutable Action + Incident Audit"] --&gt; INCIDENT
    ACTION --&gt; AUDIT
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><hr class="section-divider"/>`;
