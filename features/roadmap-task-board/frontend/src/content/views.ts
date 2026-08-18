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
];
