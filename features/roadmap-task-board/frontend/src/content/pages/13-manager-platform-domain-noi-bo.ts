/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 aa7eb6dc6c441ca3e2044d1b9c7f121870351f24b38a787f421be1bf6d2ca5b9
 */
export const title = "13. MANAGER PLATFORM — DOMAIN NỘI BỘ (TARGET)";
export const html = `<h1 id="13-manager-platform-domain-noi-bo">13. MANAGER PLATFORM — DOMAIN NỘI BỘ (TARGET)</h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Biến manager platform thành một domain nội bộ nghĩa là quỹ tách hẳn một nhóm người, một bộ quy trình và một tài sản phần mềm chịu trách nhiệm “đưa alpha từ ý tưởng lên vốn thật một cách có kiểm soát”. Domain này không viết chiến lược giao dịch và không giữ tiền; nó làm cho research, backtest, duyệt duyệt, triển khai và giám sát trở nên lặp lại được và kiểm toán được.</p>
</blockquote><h2 id="13-1-domain-statement-va-ranh-gioi">13.1 Domain statement và ranh giới</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Khía cạnh</th>
<th>Thuộc domain (domain sẽ làm)</th>
<th>Không thuộc domain (domain không làm)</th>
</tr>
</thead>
<tbody>
<tr>
<td>Alpha</td>
<td>Đăng ký artifact, manifest, version, promotion lifecycle</td>
<td>Viết signal/model hay quyết định math của strategy</td>
</tr>
<tr>
<td>Backtest</td>
<td>Job orchestration, run registry, snapshot gating, artifact store</td>
<td>Phát minh kernel mới; QuantBT core giữ nguyên là engine riêng</td>
</tr>
<tr>
<td>Approval &amp; deployment</td>
<td>Evidence package, approval workflow, promotion gate, deployment registry</td>
<td>Tự ý bật tắt live; phải qua gate và fail-closed risk</td>
</tr>
<tr>
<td>Dữ liệu</td>
<td>Dataset snapshot registry, catalog, lineage tới run</td>
<td>Chạy collector hay sở hữu raw storage</td>
</tr>
<tr>
<td>Execution</td>
<td>Đọc trạng thái paper/live qua read models, khởi tạo deployment</td>
<td>Gửi lệnh trực tiếp; mọi lệnh đi qua gateway/risk của trading system</td>
</tr>
<tr>
<td>An toàn</td>
<td>Hiển thị health/incident/action, hỗ trợ operator decision</td>
<td>Là nơi duy nhất phát hiện lỗi; monitoring/action vẫn phải chạy độc lập khi portal down</td>
</tr>
</tbody>
</table></div><h2 id="13-2-capabilities-va-services">13.2 Capabilities và services</h2><ul>
<li><strong>Alpha Registry</strong>: immutable artifact + manifest + parameter schema + owner + data requirement.</li>
<li><strong>Dataset Snapshot Registry</strong>: immutable dataset snapshot + schema version + quality/lineage + retention.</li>
<li><strong>Backtest Control Plane</strong>: run spec, job queue, isolated workers, run registry, artifact store, quota/priority.</li>
<li><strong>Report &amp; Interpretation Service</strong>: sinh report từ run (dựa trên <code>awesome-quant-interpretation</code>), artifact immutable, preview, summary JSON.</li>
<li><strong>Approval &amp; Promotion</strong>: evidence package, review steps, sign-off, promotion identity, deployment record.</li>
<li><strong>Operations Read Models</strong>: paper/live performance, health state, incidents, reconciliation findings, audit trail.</li>
<li><strong>RBAC &amp; Audit</strong>: phân quyền theo vai trò; mọi hành động (chạy, approve, deploy, đổi capital) đều ghi audit.</li>
</ul><h2 id="13-3-raci-cac-quy-trinh-chinh">13.3 RACI các quy trình chính</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Quy trình</th>
<th>Researcher</th>
<th>Quant review</th>
<th>Risk</th>
<th>Manager</th>
<th>Operator/SRE</th>
</tr>
</thead>
<tbody>
<tr>
<td>Đăng ký alpha version</td>
<td>R</td>
<td>A</td>
<td>C</td>
<td>I</td>
<td>I</td>
</tr>
<tr>
<td>Chạy backtest / WFO</td>
<td>R</td>
<td>A</td>
<td>I</td>
<td>I</td>
<td>C (quota)</td>
</tr>
<tr>
<td>Technical validation</td>
<td>R</td>
<td>C</td>
<td>I</td>
<td>I</td>
<td>A (CI gate)</td>
</tr>
<tr>
<td>Approve → Paper</td>
<td>R</td>
<td>A</td>
<td>C</td>
<td>A</td>
<td>I</td>
</tr>
<tr>
<td>Approve → Live canary</td>
<td>I</td>
<td>C</td>
<td>A</td>
<td>R/A</td>
<td>C</td>
</tr>
<tr>
<td>Staged capital scale</td>
<td>I</td>
<td>C</td>
<td>A</td>
<td>R/A</td>
<td>I</td>
</tr>
<tr>
<td>Incident action (halt/flatten)</td>
<td>I</td>
<td>I</td>
<td>C</td>
<td>I</td>
<td>R/A</td>
</tr>
<tr>
<td>Audit &amp; compliance report</td>
<td>I</td>
<td>C</td>
<td>C</td>
<td>A</td>
<td>R</td>
</tr>
</tbody>
</table></div><p><strong>Quy tắc:</strong> không ai đơn độc có quyền promote thẳng từ research sang live. Promotion luôn đi qua ít nhất hai vai trò phê duyệt độc lập và mọi quyết định đều bám theo một identity bất biến.</p><h2 id="13-4-data-contracts-va-identity-xuyen-suot">13.4 Data contracts và identity xuyên suốt</h2><div class="code-card"><div class="artifact-toolbar"><span>JSON</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-json">{
  "deployment_id": "DEP-244",
  "alpha_version_id": "vn.derivatives_carry@0.9.2",
  "alpha_artifact_digest": "sha256:...",
  "alpha_config_hash": "sha256:...",
  "approved_backtest_run_ids": ["QBT-2026-0802-118"],
  "dataset_snapshot_id": "vn_futures_roll@v1",
  "quantbt_engine_version": "1.0.7",
  "execution_contract": "intrabar_intent_v1",
  "risk_profile_version": "vn_derivatives_carry_risk_v1",
  "account_policy_version": "dnse_account_policy_v2",
  "broker_adapter_version": "dnse-adapter@0.4.1",
  "approval_id": "APR-2026-051",
  "mode": "paper"
}
</code></pre></div><p>Một deployment bất kỳ đều trace ngược về được: dataset → alpha → backtest evidence → approval → risk profile → broker account. Đây là điều kiện để báo cáo, incident và audit không bị “mất gốc”.</p><h2 id="13-5-rbac-va-phan-quyen">13.5 RBAC và phân quyền</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Vai trò</th>
<th>Quyền điển hình</th>
</tr>
</thead>
<tbody>
<tr>
<td>Researcher</td>
<td>Đăng ký alpha, chạy backtest trên snapshot được cấp, xem run của mình</td>
</tr>
<tr>
<td>Quant reviewer</td>
<td>Review evidence, đánh giá WFO/robustness, yêu cầu rerun</td>
</tr>
<tr>
<td>Risk</td>
<td>Đánh giá capacity/liquidity, đặt risk profile, veto promotion</td>
</tr>
<tr>
<td>Manager</td>
<td>Approve/reject, thay parameter whitelist, đặt capital allocation</td>
</tr>
<tr>
<td>Operator/SRE</td>
<td>Quản lý workers, incident, action policy, runbook, game-day</td>
</tr>
<tr>
<td>Auditor</td>
<td>Đọc toàn bộ audit log, manifest và artifact; không ghi</td>
</tr>
</tbody>
</table></div><p>Mọi thao tác ghi đều cần <code>deployment_id</code>/<code>run_id</code>/<code>approval_id</code> đi kèm để audit log có ngữ cảnh đầy đủ.</p><h2 id="13-6-quy-trinh-van-hanh-co-ban">13.6 Quy trình vận hành cơ bản</h2><ol>
<li><strong>Research → Registry:</strong> researcher build immutable artifact qua CI (contract test, leakage test, determinism).</li>
<li><strong>Backtest có gating:</strong> run bắt buộc gắn dataset snapshot + engine version; trial chạy <code>minimal</code>, candidate chạy <code>standard</code>, approval chạy <code>audit</code>.</li>
<li><strong>Evidence → Approval inbox:</strong> hệ thống tự sinh report và evidence package; manager chỉ duyệt hoặc yêu cầu rerun.</li>
<li><strong>Promote đúng artifact:</strong> cùng digest/version/config được promote paper → shadow → canary → scale; không copy code từ notebook.</li>
<li><strong>Theo dõi bằng deployment identity:</strong> paper/live performance, incident và reconciliation đều quy về cùng <code>deployment_id</code>.</li>
<li><strong>Suspension tự động:</strong> vượt drawdown, breach capacity, recon fail → fail-closed theo policy; không chờ con người.</li>
</ol><h2 id="13-7-tich-hop-voi-cac-subsystem">13.7 Tích hợp với các subsystem</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    MGR["Manager / Stakeholder"] --> UI["Quant Portal UI"]
    RSR["Researcher"] --> UI
    UI --> API["Control Plane API (domain boundary)"]
    API --> RBAC["RBAC / Audit / Quota"]
    API --> AL["Alpha Registry"]
    API --> DS["Dataset Snapshot Registry"]
    API --> RR["Run Registry"]
    API --> AP["Approval Workflow"]
    API --> DP["Deployment Registry"]

    API --> Q["Backtest Job Queue"]
    Q --> W["Isolated Python Workers"]
    AL --> W
    DS --> W
    W --> E["quantbt-engine"]
    E --> A["Artifact Store"]
    A --> RR
    A --> RPT["Report Worker"]

    AP --> DP
    DP --> RT["Approved Alpha Runtime"]
    RT --> TS["Trading System Gateway"]

    TS --> OM["Operational Read Models"]
    MON["Monitoring / Incidents / Recon"] --> OM
    OM --> UI

    TRADING_CORE["Trading system core: gateway/risk/execution/accounting"] -. "giữ nguyên, không rewrite" .- TS
</div><pre class="mermaid">flowchart LR
    MGR["Manager / Stakeholder"] --> UI["Quant Portal UI"]
    RSR["Researcher"] --> UI
    UI --> API["Control Plane API (domain boundary)"]
    API --> RBAC["RBAC / Audit / Quota"]
    API --> AL["Alpha Registry"]
    API --> DS["Dataset Snapshot Registry"]
    API --> RR["Run Registry"]
    API --> AP["Approval Workflow"]
    API --> DP["Deployment Registry"]

    API --> Q["Backtest Job Queue"]
    Q --> W["Isolated Python Workers"]
    AL --> W
    DS --> W
    W --> E["quantbt-engine"]
    E --> A["Artifact Store"]
    A --> RR
    A --> RPT["Report Worker"]

    AP --> DP
    DP --> RT["Approved Alpha Runtime"]
    RT --> TS["Trading System Gateway"]

    TS --> OM["Operational Read Models"]
    MON["Monitoring / Incidents / Recon"] --> OM
    OM --> UI

    TRADING_CORE["Trading system core: gateway/risk/execution/accounting"] -. "giữ nguyên, không rewrite" .- TS
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="13-8-sla-va-observability-cua-domain">13.8 SLA và observability của domain</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Chỉ số</th>
<th>Target V1</th>
</tr>
</thead>
<tbody>
<tr>
<td>Job queue → worker start (P95)</td>
<td>&lt; 2 phút cho priority; &lt; 10 phút batch</td>
</tr>
<tr>
<td>Report generation sau run hoàn tất</td>
<td>&lt; 5 phút</td>
</tr>
<tr>
<td>Run registry/artifact availability</td>
<td>99.9% trong giờ làm việc</td>
</tr>
<tr>
<td>Approval inbox stale (evidence &gt; 7d chưa review)</td>
<td>0 tồn đọng bắt buộc cho canary/live</td>
</tr>
<tr>
<td>Audit trail consistency</td>
<td>100% action có actor + timestamp + identity</td>
</tr>
<tr>
<td>Portal outage independence</td>
<td>Monitoring/action vẫn hoạt động khi UI down (game-day chứng minh)</td>
</tr>
</tbody>
</table></div><h2 id="13-9-lotrinh-chuyen-doi-thanh-domain">13.9 Lộ trình chuyển đổi thành domain</h2><ol>
<li><strong>Phase 0 — Khảo sát (W1):</strong> đối chiếu repo/commit thật, lập inventory alpha và dataset đang chạy.</li>
<li><strong>Phase 1 — Contract hóa (W5–W9):</strong> alpha manifest, dataset snapshot, run manifest; chuẩn hóa identity; đóng gói <code>quantbt-engine</code>.</li>
<li><strong>Phase 2 — Control plane (W8–W14):</strong> worker service, run registry, approval inbox, portal v1 (bản demo trong portal này là wireframe mục tiêu).</li>
<li><strong>Phase 3 — Vận hành (W12–W18):</strong> report worker, monitoring state/incident/action, game-day; quy trình RACI đi vào thực tế.</li>
<li><strong>Phase 4 — Live domain (W16–W24):</strong> certification evidence theo venue/account, canary và staged capital; domain chính thức nhận ownership.</li>
</ol><p><strong>Điều kiện success của domain:</strong> một alpha mới đi từ research → approved → paper → live với toàn bộ evidence tự động đính kèm, không cần ai hỏi “nó đang chạy bản nào, dữ liệu nào, ai duyệt”.</p><hr class="section-divider"/>`;
