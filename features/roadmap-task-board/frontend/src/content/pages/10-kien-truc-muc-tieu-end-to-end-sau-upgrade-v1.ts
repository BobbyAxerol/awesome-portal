/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 d9df69e9ee83a8820f2c3cdfac777919bdea99c445a1eba463b349ab98b593b8
 */
export const title = "10. KIẾN TRÚC MỤC TIÊU END-TO-END SAU UPGRADE V1";
export const html = `<h1 id="10-kien-truc-muc-tieu-end-to-end-sau-upgrade-v1">10. KIẾN TRÚC MỤC TIÊU END-TO-END SAU UPGRADE V1</h1><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    subgraph DATA_PLANE["DATA PLANE"]
        PROVIDERS["Providers"] --&gt; HISTING["Historical Ingestion"]
        PROVIDERS --&gt; LIVEING["Real-Time Ingestors"]
        HISTING --&gt; LAKE["Bronze / Silver / Gold Data Lake"]
        LAKE --&gt; SNAP["Dataset Snapshot Registry"]
        LIVEING --&gt; EVENTLOG["Durable Market Event Log"]
        LIVEING --&gt; MDCACHE["Ephemeral Latest-State Cache"]
        MASTER["Instrument Master + Calendars"] --&gt; LAKE
        MASTER --&gt; EVENTLOG
    end

    subgraph RESEARCH_PLANE["RESEARCH &amp; COMPUTE PLANE"]
        ALPHAREG["Alpha Registry"] --&gt; WORKER["Isolated Python Quant Workers"]
        SNAP --&gt; WORKER
        WORKER --&gt; QBT["quantbt-engine"]
        QBT -. "certified optional path" .-&gt; RUST["quantbt-native"]
        QBT --&gt; ART["Backtest Artifact Store"]
        ART --&gt; REPORT["Stakeholder Interpretation Worker"]
        REPORT --&gt; REPORTART["Interactive Report Artifacts"]
        ART --&gt; RUNREG["Run Registry"]
    end

    subgraph CONTROL_PLANE["CONTROL &amp; GOVERNANCE PLANE"]
        UI["Researcher / Manager Portal"] --&gt; API["Control Plane API"]
        API --&gt; RBAC["RBAC / Audit / Quota"]
        API --&gt; ALPHAREG
        API --&gt; SNAP
        API --&gt; RUNREG
        API --&gt; APPROVAL["Approval Workflow"]
        API --&gt; DEPLOY["Deployment Registry"]
        API --&gt; QUEUE["Job Queue"]
        QUEUE --&gt; WORKER
    end

    subgraph EXECUTION_PLANE["PAPER / LIVE EXECUTION PLANE"]
        DEPLOY --&gt; RUNTIME["Approved Alpha Runtime"]
        EVENTLOG --&gt; RUNTIME
        MDCACHE --&gt; RUNTIME
        RUNTIME --&gt; GATEWAY["Unified Gateway"]
        GATEWAY --&gt; RISK["Risk Engine"]
        RISK --&gt; EXEC["Execution Router"]
        EXEC --&gt; PAPER["Paper Adapter"]
        EXEC --&gt; BROKER["Live Adapter Mesh&lt;br/&gt;Binance / Bybit / US / India / DNSE"]
        PAPER --&gt; ESTORE["Immutable Trading Event Store"]
        BROKER --&gt; ESTORE
        ESTORE --&gt; PROJ["Portfolio / Account / PnL Projectors"]
        PROJ --&gt; OPSDB["Operational Read Models"]
    end

    subgraph MONITORING_PLANE["MONITORING &amp; GOVERNANCE PLANE"]
        EVENTLOG --&gt; MON["Monitoring State + Rules"]
        WORKER --&gt; MON
        RUNTIME --&gt; MON
        RISK --&gt; MON
        ESTORE --&gt; MON
        BROKER --&gt; RECON["Reconciliation"]
        OPSDB --&gt; RECON
        RECON --&gt; INCIDENT["Incident Service"]
        MON --&gt; INCIDENT
        INCIDENT --&gt; ACTION["Policy Action Executor"]
        ACTION --&gt; RISK
        ACTION --&gt; EXEC
        OPSDB --&gt; UI
        REPORTART --&gt; UI
        INCIDENT --&gt; UI
    end

    APPROVAL --&gt; DEPLOY
</div><pre class="mermaid">flowchart LR
    subgraph DATA_PLANE["DATA PLANE"]
        PROVIDERS["Providers"] --&gt; HISTING["Historical Ingestion"]
        PROVIDERS --&gt; LIVEING["Real-Time Ingestors"]
        HISTING --&gt; LAKE["Bronze / Silver / Gold Data Lake"]
        LAKE --&gt; SNAP["Dataset Snapshot Registry"]
        LIVEING --&gt; EVENTLOG["Durable Market Event Log"]
        LIVEING --&gt; MDCACHE["Ephemeral Latest-State Cache"]
        MASTER["Instrument Master + Calendars"] --&gt; LAKE
        MASTER --&gt; EVENTLOG
    end

    subgraph RESEARCH_PLANE["RESEARCH &amp; COMPUTE PLANE"]
        ALPHAREG["Alpha Registry"] --&gt; WORKER["Isolated Python Quant Workers"]
        SNAP --&gt; WORKER
        WORKER --&gt; QBT["quantbt-engine"]
        QBT -. "certified optional path" .-&gt; RUST["quantbt-native"]
        QBT --&gt; ART["Backtest Artifact Store"]
        ART --&gt; REPORT["Stakeholder Interpretation Worker"]
        REPORT --&gt; REPORTART["Interactive Report Artifacts"]
        ART --&gt; RUNREG["Run Registry"]
    end

    subgraph CONTROL_PLANE["CONTROL &amp; GOVERNANCE PLANE"]
        UI["Researcher / Manager Portal"] --&gt; API["Control Plane API"]
        API --&gt; RBAC["RBAC / Audit / Quota"]
        API --&gt; ALPHAREG
        API --&gt; SNAP
        API --&gt; RUNREG
        API --&gt; APPROVAL["Approval Workflow"]
        API --&gt; DEPLOY["Deployment Registry"]
        API --&gt; QUEUE["Job Queue"]
        QUEUE --&gt; WORKER
    end

    subgraph EXECUTION_PLANE["PAPER / LIVE EXECUTION PLANE"]
        DEPLOY --&gt; RUNTIME["Approved Alpha Runtime"]
        EVENTLOG --&gt; RUNTIME
        MDCACHE --&gt; RUNTIME
        RUNTIME --&gt; GATEWAY["Unified Gateway"]
        GATEWAY --&gt; RISK["Risk Engine"]
        RISK --&gt; EXEC["Execution Router"]
        EXEC --&gt; PAPER["Paper Adapter"]
        EXEC --&gt; BROKER["Live Adapter Mesh&lt;br/&gt;Binance / Bybit / US / India / DNSE"]
        PAPER --&gt; ESTORE["Immutable Trading Event Store"]
        BROKER --&gt; ESTORE
        ESTORE --&gt; PROJ["Portfolio / Account / PnL Projectors"]
        PROJ --&gt; OPSDB["Operational Read Models"]
    end

    subgraph MONITORING_PLANE["MONITORING &amp; GOVERNANCE PLANE"]
        EVENTLOG --&gt; MON["Monitoring State + Rules"]
        WORKER --&gt; MON
        RUNTIME --&gt; MON
        RISK --&gt; MON
        ESTORE --&gt; MON
        BROKER --&gt; RECON["Reconciliation"]
        OPSDB --&gt; RECON
        RECON --&gt; INCIDENT["Incident Service"]
        MON --&gt; INCIDENT
        INCIDENT --&gt; ACTION["Policy Action Executor"]
        ACTION --&gt; RISK
        ACTION --&gt; EXEC
        OPSDB --&gt; UI
        REPORTART --&gt; UI
        INCIDENT --&gt; UI
    end

    APPROVAL --&gt; DEPLOY
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="kien-truc-nay-giu-lai-nhung-gi-ang-co">Kiến trúc này giữ lại những gì đang có</h2><ul>
<li>Collectors và validation logic của historical repo.</li>
<li>QuantBTEndpoint và toàn bộ backtest kernels.</li>
<li>Python alpha ecosystem.</li>
<li>quant-data-layer provider adapters và latest-state cache.</li>
<li>Trading system gateway/risk/execution/portfolio/reconciliation core.</li>
<li>Existing Postgres/Timescale operational data.</li>
<li>Existing monitoring primitives và CLI.</li>
</ul><h2 id="kien-truc-nay-bo-sung-nhung-gi">Kiến trúc này bổ sung những gì</h2><ul>
<li>Dataset snapshot/catalog.</li>
<li>Alpha registry.</li>
<li>QuantBT worker/job orchestration.</li>
<li>Run registry và artifact store.</li>
<li>Manager portal/approval workflow.</li>
<li>Stakeholder interpretation/report worker và immutable report artifacts.</li>
<li>Durable market/trading event logs cho replay/audit.</li>
<li>Central monitoring state/rule/incident/action plane.</li>
<li>Promotion identity từ research tới live.</li>
</ul><hr class="section-divider"/>`;
