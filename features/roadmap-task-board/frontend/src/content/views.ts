/* Auto-generated view panels from legacy/portal.html — DO NOT EDIT. */
export interface ViewPanel {
  id: string;
  sha256: string;
  html: string;
}
export const VIEW_PANELS: ViewPanel[] = [
  { id: "view-roadmap", sha256: "d4101d0bdb68a90774c09450ea772d524e1cb87652b25f11b78cc68e9def975c", html: `
      <div class="panel-shell">
        <div class="panel-header"><div><h1>Migration & Upgrade Roadmap</h1><p>Roadmap 24 tuần tách rõ acquisition baseline, current-service cutover, platformization và multi-venue live certification. Các mốc có thể co giãn theo team size nhưng dependency không nên đảo ngược. Click nút <strong>Edit</strong> trên mỗi phase để chỉnh tuần/owner/outcome.</p></div><div style="display:flex;gap:8px"><button class="action-btn" id="addPhaseBtn">+ Add phase</button><button class="action-btn" onclick="window.print()">Print roadmap</button></div></div>
        <div class="roadmap-toolbar">
          <button class="action-btn" id="exportPhases">Export JSON</button>
          <button class="action-btn" id="importPhases">Import JSON</button>
          <button class="action-btn danger" id="resetPhases">Reset</button>
          <input type="file" id="importPhasesFile" accept=".json" hidden />
          <span class="mermaid-hint">Dữ liệu phase được lưu tự động (backend API nếu có, ngược lại localStorage).</span>
        </div>
        <div class="roadmap-card">
          <div class="week-header"><strong>Workstream phase</strong><div class="weeks"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span><span>13</span><span>14</span><span>15</span><span>16</span><span>17</span><span>18</span><span>19</span><span>20</span><span>21</span><span>22</span><span>23</span><span>24</span></div><strong>Exit outcome</strong></div>
          <div id="roadmapRows"></div>
        </div>
        <div class="diagram-card dependency-card"><div class="artifact-toolbar"><span>Program dependency map</span><button class="mini-btn copy-source">Copy Mermaid</button></div><div class="mermaid-source" hidden>flowchart LR
A[Freeze & Backup] --> B[Historical Mirror]
B --> C[QuantBT Golden Runs]
C --> D[Alpha Runtime Restore]
D --> E[Streaming Shadow]
E --> F[Paper Cutover]
F --> G[Dataset + Alpha + Run Registries]
G --> H[Manager Backtest Platform]
H --> I[Stakeholder Report Worker]
F --> J[Monitoring State + Incident + Action]
I --> K[Approval Artifact]
J --> K
K --> L[Multi-Venue Shadow]
L --> M[Canary: Binance / Bybit / US / India / DNSE]
M --> N[Staged Capital Scale]</div><pre class="mermaid">flowchart LR
A[Freeze & Backup] --> B[Historical Mirror]
B --> C[QuantBT Golden Runs]
C --> D[Alpha Runtime Restore]
D --> E[Streaming Shadow]
E --> F[Paper Cutover]
F --> G[Dataset + Alpha + Run Registries]
G --> H[Manager Backtest Platform]
H --> I[Stakeholder Report Worker]
F --> J[Monitoring State + Incident + Action]
I --> K[Approval Artifact]
J --> K
K --> L[Multi-Venue Shadow]
L --> M[Canary: Binance / Bybit / US / India / DNSE]
M --> N[Staged Capital Scale]</pre></div>
      </div>
    ` },
  { id: "view-board", sha256: "93014943bd9c16372b389ab1cfae7ae77c223f5530c3c1a4427a78e230bf46da", html: `
      <div class="panel-shell">
        <div class="panel-header"><div><h1>Migration Task Board</h1><p>Kanban mô phỏng Jira để lập kế hoạch ban đầu. Trạng thái kéo-thả được lưu trong trình duyệt bằng localStorage; đây là planning snapshot, còn source of truth vận hành sau đó có thể chuyển sang Notion/Jira.</p></div></div>
        <div class="board-toolbar">
          <button class="action-btn primary" id="addTaskBtn">+ New task</button>
          <span class="view-toggle" id="boardViewToggle"><button class="active" data-bview="board">Board</button><button data-bview="table">Table</button></span>
          <input id="taskSearch" placeholder="Tìm task, ID, owner..." />
          <select id="workstreamFilter"><option value="">All workstreams</option></select>
          <select id="priorityFilter"><option value="">All priorities</option><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select>
          <select id="phaseFilter"><option value="">All phases</option></select>
          <select id="ownerFilter"><option value="">All owners</option></select>
          <button class="action-btn" id="exportTasks">Export JSON</button>
          <button class="action-btn" id="importTasks">Import JSON</button>
          <button class="action-btn danger" id="resetTasks">Reset board</button>
          <input type="file" id="importTasksFile" accept=".json" hidden />
        </div>
        <div class="kanban" id="kanban"></div>
        <div class="task-table-wrap" id="taskTableWrap" hidden></div>
      </div>
    ` },
  { id: "view-reports", sha256: "3afa2f02d74eb7d51bfa62eb527db0c2b70b3a7262fe6d6cef2cbc15856c1cf3", html: `
      <div class="panel-shell">
        <div class="panel-header"><div><h1>Stakeholder Interpretation & Reporting</h1><p><code>awesome-quant-interpretation</code> là lớp chuyển QuantBT/QuantStats/Nautilus artifacts thành report tương tác, giúp manager đọc performance, robustness và execution evidence mà không cần đọc notebook hoặc raw logs.</p></div><a class="action-btn primary" href="https://github.com/BobbyAxerol/awesome-quant-interpretation" target="_blank" rel="noopener">Open repository</a></div>
        <div class="status-banner"><span class="status-dot"></span><div><strong>Recommended role: report-generation worker</strong><div style="color:var(--muted);font-size:13px">Giữ HTML report độc lập, đồng thời đăng ký report hash/artifact vào Run Registry và Approval Inbox.</div></div></div>
        <div class="report-grid">
          <div class="report-grid-card"><div class="eyebrow" style="color:var(--primary)">Inputs</div><h3>Backtest evidence</h3><p>QuantBT metrics, orders, fills, trades, equity, WFO folds; QuantStats HTML và Nautilus-style logs.</p></div>
          <div class="report-grid-card"><div class="eyebrow" style="color:var(--primary)">Analysis</div><h3>Risk & robustness</h3><p>IS/OOS, drawdown, Sharpe, MAE/MFE, long/short, margin utilization, distribution và overfitting diagnosis.</p></div>
          <div class="report-grid-card"><div class="eyebrow" style="color:var(--primary)">Outputs</div><h3>Decision artifacts</h3><p>Interactive ECharts, KPI badges, executive summary, HTML artifact, preview và approval evidence package.</p></div>
          <div class="report-grid-card report-flow diagram-card"><div class="artifact-toolbar"><span>Reporting target flow</span><button class="mini-btn copy-source">Copy Mermaid</button></div><div class="mermaid-source" hidden>flowchart LR
A[QuantBT Run] --> B[Artifact Store]
B --> C[Interpretation Worker]
C --> D[Interactive HTML]
C --> E[Executive Summary JSON]
D --> F[Manager Portal]
E --> F
F --> G[Approve / Reject / Request Rerun]
H[Paper and Live Read Models] --> C
I[Monitoring Incidents] --> C</div><pre class="mermaid">flowchart LR
A[QuantBT Run] --> B[Artifact Store]
B --> C[Interpretation Worker]
C --> D[Interactive HTML]
C --> E[Executive Summary JSON]
D --> F[Manager Portal]
E --> F
F --> G[Approve / Reject / Request Rerun]
H[Paper and Live Read Models] --> C
I[Monitoring Incidents] --> C</pre></div>
        </div>
      </div>
    ` },
  { id: "view-evidence", sha256: "28f61e075e994c23d80aaf88bf550fe16bd1d5e253f9578dbc4ed9b900502c86", html: `
      <div class="panel-shell">
        <div class="panel-header"><div><h1>Evidence & Source Map</h1><p>Tài liệu phân biệt ba loại bằng chứng để tránh biến proposal thành claim production: public repository evidence, private implementation-plan evidence và owner-confirmed live deployment status.</p></div></div>
        <div class="evidence-grid">
          <div class="evidence-card"><span class="status-pill repo">Public repo</span><h3>Historical Data</h3><p>\`main\` là CSV.GZIP baseline; \`dev\` là Parquet/derivatives modernization direction.</p><a href="https://github.com/BobbyAxerol/trading-historical-data" target="_blank" rel="noopener">Open repository →</a></div>
          <div class="evidence-card"><span class="status-pill repo">Public repo</span><h3>QuantBT</h3><p>\`quantbt-engine==1.0.7\` release-ready gate, stable \`QuantBTEndpoint\`, Python canonical backend và explicit experimental PyO3/Rust paths.</p><a href="https://github.com/BobbyAxerol/quantbt/tree/feat/quantbt-engine-packaging" target="_blank" rel="noopener">Open packaging branch →</a></div>
          <div class="evidence-card"><span class="status-pill repo">Public repo</span><h3>Real-Time Data Layer</h3><p>Async market-data gateway, Redis latest-state cache, REST warmup/recovery và provider ownership boundary.</p><a href="https://github.com/BobbyAxerol/quant-data-layer" target="_blank" rel="noopener">Open repository →</a></div>
          <div class="evidence-card"><span class="status-pill repo">Public repo</span><h3>Stakeholder Reporting</h3><p>QuantStats/QuantBT/Nautilus extractors, analyzers, ECharts, KPI badges, rule/AI interpretation và HTML renderer.</p><a href="https://github.com/BobbyAxerol/awesome-quant-interpretation" target="_blank" rel="noopener">Open repository →</a></div>
          <div class="evidence-card"><span class="status-pill private">Private plan</span><h3>Unified Trading System</h3><p>Gateway, risk, multi-mode execution, canonical accounting, reconciliation, monitoring, physical broker binding, sessions, risk grants và copy outbox.</p></div>
          <div class="evidence-card"><span class="status-pill owner">Owner-confirmed</span><h3>Live venue adapters</h3><p>Bybit và selected US/India broker adapters đã deployed cho live execution. Exact broker/account/certification matrix là private và phải được nhập vào acquisition service catalog.</p></div>
        </div>
      </div>
    ` },
  { id: "view-portal", sha256: "5a8d61ad45115891e93516c50536703be754c99f4327a519daa5361221d1cb52", html: `
      <div class="panel-shell">
        <div class="panel-header"><div><h1>Manager &amp; Stakeholder Quant Platform</h1><p>Portal là “phòng điều khiển” của domain nội bộ: Alpha Pool → Backtest Engine (quantbt) → Paper Trading → Live Trading. Mọi hành động đều để lại dấu vết bất biến (manifest + SHA); khi portal down, trading safety và monitoring vẫn hoạt động độc lập. Chi tiết kiến trúc domain xem trang <strong>Architecture → 13. Manager Platform — Domain nội bộ (Target)</strong>.</p></div><button class="action-btn" onclick="window.print()">Print view</button></div>
        <div class="status-banner"><span class="status-dot"></span><div><strong>V2 prototype — interactive mockup</strong><div style="color:var(--muted);font-size:13px">Backtest chạy trên engine mô phỏng dữ liệu để minh họa luồng nghiên cứu → phê duyệt → paper → live. Dữ liệu alpha/run là mô phỏng theo cấu trúc domain thật; chưa nối control-plane thật.</div></div></div>
        <div class="portal-layout">
          <nav class="portal-rail" id="portalRail" aria-label="Portal modules">
            <div class="pr-label">Modules</div>
            <button class="pr-item active" data-ps="overview"><span class="pr-ico">◈</span><span>Overview</span></button>
            <button class="pr-item" data-ps="alphas"><span class="pr-ico">▦</span><span>Alpha Pool</span></button>
            <button class="pr-item" data-ps="backtest"><span class="pr-ico">⚙</span><span>Backtest Engine</span></button>
            <button class="pr-item" data-ps="paper"><span class="pr-ico">▤</span><span>Paper Trading</span></button>
            <button class="pr-item" data-ps="live"><span class="pr-ico">◆</span><span>Live Trading</span></button>
            <div class="pr-foot">quantbt engine 1.0.7<br>prototype · chưa nối control plane</div>
          </nav>
          <div class="portal-stage">
            <div class="portal-screen active" id="ps-overview">
              <div class="health-strip">
                <span class="health-item ok"><i></i>Market data — fresh</span>
                <span class="health-item ok"><i></i>QuantBT workers — 4/4</span>
                <span class="health-item ok"><i></i>Paper execution — healthy</span>
                <span class="health-item warn"><i></i>Reconciliation — 1 finding</span>
                <span class="health-item err"><i></i>Incident open — BRK-102</span>
              </div>
              <div class="portal-kpis">
                <div class="portal-kpi"><div class="pk-label">Alpha registry</div><div class="pk-value">12</div><div class="pk-sub">8 live · 3 paper · 1 draft</div></div>
                <div class="portal-kpi"><div class="pk-label">Backtest runs / 7d</div><div class="pk-value">247</div><div class="pk-sub">18 audit runs · 4 WFO</div></div>
                <div class="portal-kpi"><div class="pk-label">Approval inbox</div><div class="pk-value">4</div><div class="pk-sub">1 canary · 3 paper</div></div>
                <div class="portal-kpi"><div class="pk-label">Live deployments</div><div class="pk-value">9</div><div class="pk-sub">5 venues · 7 accounts</div></div>
                <div class="portal-kpi"><div class="pk-label">System state</div><div class="pk-value" style="color:#b65c02">DEGRADED</div><div class="pk-sub">1 incident · fail-closed active</div></div>
              </div>
              <div class="portal-grid">
<div class="pcard-head"><h3>Approval Inbox</h3><span class="tag">evidence packages gated</span></div>
<div class="pcard-head"><h3>Incident & Actions</h3><span class="tag">policy-gated action executor</span></div>
<div class="pcard-head"><h3>System Health State</h3><span class="tag">health state builder</span></div>
              </div>
            </div>
            <div class="portal-screen" id="ps-alphas">
              <div class="ps-head">
                <div class="ps-title"><h2>Alpha Pool</h2><p>Toàn bộ alpha trong pool — logic nghiên cứu của researcher, lịch sử phiên bản và metadata từng lần backtest / walk-forward. Artifact bất biến (immutable, có SHA manifest).</p></div>
                <div class="ps-tools"><input class="ps-input" id="alphaSearch" placeholder="Tìm alpha…" style="width:190px"><select class="ps-input" id="alphaLifeFilter" style="width:150px"><option value="">All lifecycles</option><option>Draft</option><option>Review</option><option>Paper</option><option>Live</option></select><span class="tag" id="alphaCount"></span></div>
              </div>
              <div class="alpha-grid" id="alphaGrid"></div>
              <div class="ps-backdrop" id="alphaBackdrop" hidden></div>
              <aside class="ps-drawer" id="alphaDrawer" aria-label="Alpha detail">
                <div class="drawer-head"><h3 id="adTitle"></h3><button class="icon-btn" id="adClose" title="Close">✕</button></div>
                <div class="drawer-body">
                  <div class="ad-chips" id="adChips"></div>
                  <div class="ad-logic" id="adLogic"></div>
                  <h4>Phiên bản</h4>
                  <div class="ad-list" id="adVersions"></div>
                  <h4>Backtest &amp; Walk-Forward history</h4>
                  <div class="table-wrap" style="margin:8px 0 18px"><table class="portal-table"><thead><tr><th>Run ID</th><th>Route</th><th>Dataset snapshot</th><th>Date</th><th>Duration</th><th>Sharpe</th><th>Max DD</th><th>Win rate</th><th>Status</th><th></th></tr></thead><tbody id="adRunsBody"></tbody></table></div>
                  <h4>Equity curves theo route</h4>
                  <div class="ad-charts" id="adCharts"></div>
                </div>
              </aside>
            </div>
            <div class="portal-screen" id="ps-backtest">
              <div class="ps-head">
                <div class="ps-title"><h2>Backtest Engine — Event-Driven Simulation</h2><p>Gọi alpha id từ pool, chọn route engine theo repo <code style="font-family:JetBrains Mono,monospace;background:var(--surface-2);padding:1px 6px;border-radius:5px">quantbt</code> (vectorized · intrabar · event · portfolio · walk-forward), chạy và xem kết quả kiểu TradingView.</p></div>
                <div class="ps-tools"><span class="tag">quantbt@1.0.7 · audit-run bắt buộc</span></div>
              </div>
              <div class="bt-layout">
                <div class="pcard bt-config">
                  <div class="pcard-head"><h3>Run configuration</h3><span class="tag">manifest · immutable</span></div>
                  <div class="pcard-body">
                    <label>Alpha (từ pool)<select class="ps-input" id="btAlpha"></select></label>
                    <label>Version<select class="ps-input" id="btVersion"></select></label>
                    <label>Route<select class="ps-input" id="btRoute"><option>Vectorized</option><option>Intrabar</option><option>Event</option><option>Portfolio</option><option>Walk-Forward</option></select></label>
                    <label>Dataset snapshot<select class="ps-input" id="btDataset"><option>binance_usdm_daily_matrix@v2</option><option>binance_usdm_1m@v2</option><option>vn_futures_roll@v1</option><option>us_equity_daily@v1</option><option>india_futures_daily@v1</option><option>bybit_usdt_1m@v1</option></select></label>
                    <label>Period<select class="ps-input" id="btPeriod"><option>3Y</option><option>2Y</option><option>1Y</option><option>6M</option></select></label>
                    <label>Initial capital<input class="ps-input" id="btCapital" value="100000"></label>
                    <label class="wf-row" id="btWfRow" hidden>WFO folds<select class="ps-input" id="btFolds"><option>3</option><option>4</option><option selected>5</option></select></label>
                    <button class="action-btn primary bt-run" id="btRun">▶ Run backtest</button>
                    <div id="btProgress" hidden><div class="bt-progress"><div class="bar"><div class="fill" id="btFill"></div></div><div class="bt-status" id="btStatus">Đang khởi tạo…</div></div></div>
                  </div>
                </div>
                <div class="pcard bt-results">
                  <div class="pcard-head"><h3>Results — <span id="btResTitle">chưa có run</span></h3><span class="tag" id="btResId"></span></div>
                  <div class="pcard-body" id="btResBody">
                    <div class="metrics-grid" id="btMetrics"></div>
                    <div class="chart-row">
                      <div class="chart-card"><div class="cc-head">Equity curve</div><canvas class="ps-canvas" id="btEquity"></canvas></div>
                      <div class="chart-card"><div class="cc-head">Price action &amp; trade markers</div><canvas class="ps-canvas" id="btCandles"></canvas></div>
                    </div>
                    <div class="bt-manifest" id="btManifest"></div>
                    <div class="bt-compare" id="btCompare"></div>
                  </div>
                </div>
              </div>
              <div class="pcard">
                <div class="pcard-head"><h3>Run Registry</h3><span class="tag">immutable run spec · manifest bắt buộc</span></div>
                <div class="pcard-body" style="padding:0"><div class="table-wrap" style="border:0;border-radius:0;margin:0"><table class="portal-table"><thead><tr><th>Run ID</th><th>Alpha</th><th>Route</th><th>Status</th><th>Engine</th><th>Duration</th><th>Sharpe</th><th>Max DD</th><th>Actions</th></tr></thead><tbody id="btRegistryBody"></tbody></table></div></div>
              </div>
            </div>
            <div class="portal-screen" id="ps-paper">
              <div class="ps-head">
                <div class="ps-title"><h2>Paper Trading</h2><p>Theo dõi các alpha đang paper trade — chart từng alpha, metrics và các hành động (pause / resume / stop / promote lên canary live).</p></div>
                <div class="ps-tools"><span class="tag" id="paperCount"></span></div>
              </div>
              <div class="paper-grid" id="paperGrid"></div>
              <div class="pcard" style="margin-top:16px">
                <div class="pcard-head"><h3>Paper order flow</h3><span class="tag">execution events gần nhất</span></div>
                <div class="pcard-body" style="padding:0"><div class="table-wrap" style="border:0;border-radius:0;margin:0"><table class="portal-table"><thead><tr><th>Time</th><th>Alpha</th><th>Side</th><th>Qty</th><th>Price</th><th>Venue (paper)</th><th>Status</th></tr></thead><tbody id="paperOrdersBody"></tbody></table></div></div>
              </div>
            </div>
            <div class="portal-screen" id="ps-live">
              <div class="ps-head">
                <div class="ps-title"><h2>Live Trading</h2><p>Trạng thái hệ thống, từng alpha và toàn bộ danh mục live. Fail-closed: mọi lỗi reconcile đều dừng khởi tạo lệnh mới.</p></div>
                <div class="ps-tools"><span class="live-ticker" id="liveTicker"></span><button class="action-btn danger" id="killSwitch">■ Emergency fail-closed</button></div>
              </div>
              <div class="live-tabs" id="liveTabs">
                <button class="ltab active" data-lt="all">All</button>
                <button class="ltab" data-lt="system">System</button>
                <button class="ltab" data-lt="alpha">Alpha</button>
              </div>
              <div id="liveAll"></div>
              <div id="liveSystem" hidden></div>
              <div id="liveAlpha" hidden></div>
            </div>
          </div>
        </div>
      </div>
    ` },
];
