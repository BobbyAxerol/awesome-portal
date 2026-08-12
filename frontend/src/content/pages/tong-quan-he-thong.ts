/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 96f7253fe75714a1138ca9721641ac10d4e6bbee35201619d86c069328369c8b
 */
export const title = "TỔNG QUAN HỆ THỐNG";
export const html = `<h1 id="tong-quan-he-thong">TỔNG QUAN HỆ THỐNG</h1><h2 id="kien-truc-end-to-end-hien-tai">Kiến trúc end-to-end hiện tại</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    subgraph SOURCES["MARKET, BROKER &amp; REFERENCE SOURCES"]
        BINANCE["Binance Spot / USD-M / Options"]
        BYBIT["Bybit Markets"]
        DNSE["DNSE / VN Market"]
        INDIAFEEDS["India Market / Broker Feeds"]
        USFEEDS["US Market / Broker Feeds"]
        VNSTOCK["VNStock / Fallback Providers"]
    end

    subgraph HIST["HISTORICAL DATA LAYER"]
        HC["Historical Collectors"]
        HVAL["Normalize / Deduplicate / Continuity Audit / Gap Repair"]
        HMAIN["main: CSV.GZIP Partitions"]
        HDEV["dev: Parquet Primary + Extended Derivatives Data"]
        HSTATE["Manifest / Heartbeat / Collector State"]
        HLOAD["Unified Historical Loader"]
    end

    subgraph RESEARCH["RESEARCH &amp; BACKTEST"]
        ALPHAREPO["Researcher / Alpha Repositories"]
        QBT["QuantBTEndpoint"]
        QKERNELS["Vectorized / Intrabar / Event / Portfolio / WFO"]
        QREPORT["Metrics / Orders / Fills / Trades / Audit Artifacts"]
    end

    subgraph REPORTING["STAKEHOLDER INTERPRETATION"]
        INTERPRET["awesome-quant-interpretation"]
        EXECREPORT["Interactive HTML / KPI Badges / AI Narrative"]
    end

    subgraph STREAM["REAL-TIME DATA LAYER"]
        QDL["quant-data-layer&lt;br/&gt;Provider Supervisors + Normalizers"]
        MDREDIS["Ephemeral redis_marketdata&lt;br/&gt;Pub/Sub + Latest-State TTL Cache"]
        MDAPI["REST Warmup / Recovery / Diagnostics"]
    end

    subgraph ALPHARUNTIME["ALPHA RUNTIME"]
        ARUNTIME["Python Alpha Runtime / Shared SDK"]
        ASESS["Execution Session / Account-Scoped State"]
    end

    subgraph TRADING["UNIFIED TRADING SYSTEM"]
        GW["Gateway API&lt;br/&gt;Auth / Idempotency / Commands"]
        RISK["Risk Engine&lt;br/&gt;Mode / Venue / Account / Kill Switch"]
        ROUTER["Execution Router"]
        PAPER["PaperExecutionClient"]
        BINAD["Binance Adapter"]
        BYBAD["Bybit Live Adapter"]
        USAD["Selected US Broker Adapters"]
        INAD["Selected India Broker Adapters"]
        DNSEAD["DNSE / Vietnam Adapter"]
        EVENTS["Canonical Order / Fill Events"]
        PORT["Portfolio &amp; Accounting"]
        DB["PostgreSQL / TimescaleDB&lt;br/&gt;Orders / Fills / Positions / PnL"]
        PERF["Performance Projection"]
    end

    subgraph OPS["MONITORING &amp; OPERATIONS"]
        RECON["Broker / Position / Open-Order Reconciliation"]
        MON["Heartbeats / Stream Lag / Dead Letters / Resource Health"]
        ALERT["Alerts / CLI / Logs / Grafana-Loki"]
    end

    subgraph MANAGEMENT["MANAGEMENT SURFACE"]
        MANUAL["Reports + CLI + Admin API + DB/Log Inspection"]
        NOPORTAL["Unified Quant Manager Portal — Upgrade V1"]
    end

    BINANCE --&gt; HC
    DNSE --&gt; HC
    VNSTOCK --&gt; HC
    HC --&gt; HVAL
    HVAL --&gt; HMAIN
    HVAL -. "in-flight modernization" .-&gt; HDEV
    HC --&gt; HSTATE
    HMAIN --&gt; HLOAD
    HDEV --&gt; HLOAD
    HLOAD --&gt; ALPHAREPO
    ALPHAREPO --&gt; QBT
    QBT --&gt; QKERNELS
    QKERNELS --&gt; QREPORT
    QREPORT --&gt; INTERPRET
    INTERPRET --&gt; EXECREPORT

    BINANCE --&gt; QDL
    DNSE --&gt; QDL
    VNSTOCK --&gt; QDL
    QDL --&gt; MDREDIS
    QDL --&gt; MDAPI
    MDREDIS --&gt; ARUNTIME
    MDAPI --&gt; ARUNTIME
    ARUNTIME --&gt; ASESS
    ASESS --&gt; GW

    MDREDIS --&gt; RISK
    MDAPI --&gt; RISK
    GW --&gt; RISK
    RISK --&gt; ROUTER
    ROUTER --&gt; PAPER
    ROUTER --&gt; BINAD
    ROUTER --&gt; BYBAD
    ROUTER --&gt; USAD
    ROUTER --&gt; INAD
    ROUTER --&gt; DNSEAD

    PAPER --&gt; EVENTS
    BINAD --&gt; EVENTS
    BYBAD --&gt; EVENTS
    USAD --&gt; EVENTS
    INAD --&gt; EVENTS
    DNSEAD --&gt; EVENTS
    EVENTS --&gt; PORT
    PORT --&gt; DB
    DB --&gt; PERF

    DB --&gt; RECON
    BINAD --&gt; RECON
    BYBAD --&gt; RECON
    USAD --&gt; RECON
    INAD --&gt; RECON
    DNSEAD --&gt; RECON
    GW --&gt; MON
    RISK --&gt; MON
    EVENTS --&gt; MON
    DB --&gt; MON
    RECON --&gt; MON
    MON --&gt; ALERT

    EXECREPORT --&gt; MANUAL
    PERF --&gt; MANUAL
    ALERT --&gt; MANUAL
    MANUAL --&gt; NOPORTAL
</div><pre class="mermaid">flowchart LR
    subgraph SOURCES["MARKET, BROKER &amp; REFERENCE SOURCES"]
        BINANCE["Binance Spot / USD-M / Options"]
        BYBIT["Bybit Markets"]
        DNSE["DNSE / VN Market"]
        INDIAFEEDS["India Market / Broker Feeds"]
        USFEEDS["US Market / Broker Feeds"]
        VNSTOCK["VNStock / Fallback Providers"]
    end

    subgraph HIST["HISTORICAL DATA LAYER"]
        HC["Historical Collectors"]
        HVAL["Normalize / Deduplicate / Continuity Audit / Gap Repair"]
        HMAIN["main: CSV.GZIP Partitions"]
        HDEV["dev: Parquet Primary + Extended Derivatives Data"]
        HSTATE["Manifest / Heartbeat / Collector State"]
        HLOAD["Unified Historical Loader"]
    end

    subgraph RESEARCH["RESEARCH &amp; BACKTEST"]
        ALPHAREPO["Researcher / Alpha Repositories"]
        QBT["QuantBTEndpoint"]
        QKERNELS["Vectorized / Intrabar / Event / Portfolio / WFO"]
        QREPORT["Metrics / Orders / Fills / Trades / Audit Artifacts"]
    end

    subgraph REPORTING["STAKEHOLDER INTERPRETATION"]
        INTERPRET["awesome-quant-interpretation"]
        EXECREPORT["Interactive HTML / KPI Badges / AI Narrative"]
    end

    subgraph STREAM["REAL-TIME DATA LAYER"]
        QDL["quant-data-layer&lt;br/&gt;Provider Supervisors + Normalizers"]
        MDREDIS["Ephemeral redis_marketdata&lt;br/&gt;Pub/Sub + Latest-State TTL Cache"]
        MDAPI["REST Warmup / Recovery / Diagnostics"]
    end

    subgraph ALPHARUNTIME["ALPHA RUNTIME"]
        ARUNTIME["Python Alpha Runtime / Shared SDK"]
        ASESS["Execution Session / Account-Scoped State"]
    end

    subgraph TRADING["UNIFIED TRADING SYSTEM"]
        GW["Gateway API&lt;br/&gt;Auth / Idempotency / Commands"]
        RISK["Risk Engine&lt;br/&gt;Mode / Venue / Account / Kill Switch"]
        ROUTER["Execution Router"]
        PAPER["PaperExecutionClient"]
        BINAD["Binance Adapter"]
        BYBAD["Bybit Live Adapter"]
        USAD["Selected US Broker Adapters"]
        INAD["Selected India Broker Adapters"]
        DNSEAD["DNSE / Vietnam Adapter"]
        EVENTS["Canonical Order / Fill Events"]
        PORT["Portfolio &amp; Accounting"]
        DB["PostgreSQL / TimescaleDB&lt;br/&gt;Orders / Fills / Positions / PnL"]
        PERF["Performance Projection"]
    end

    subgraph OPS["MONITORING &amp; OPERATIONS"]
        RECON["Broker / Position / Open-Order Reconciliation"]
        MON["Heartbeats / Stream Lag / Dead Letters / Resource Health"]
        ALERT["Alerts / CLI / Logs / Grafana-Loki"]
    end

    subgraph MANAGEMENT["MANAGEMENT SURFACE"]
        MANUAL["Reports + CLI + Admin API + DB/Log Inspection"]
        NOPORTAL["Unified Quant Manager Portal — Upgrade V1"]
    end

    BINANCE --&gt; HC
    DNSE --&gt; HC
    VNSTOCK --&gt; HC
    HC --&gt; HVAL
    HVAL --&gt; HMAIN
    HVAL -. "in-flight modernization" .-&gt; HDEV
    HC --&gt; HSTATE
    HMAIN --&gt; HLOAD
    HDEV --&gt; HLOAD
    HLOAD --&gt; ALPHAREPO
    ALPHAREPO --&gt; QBT
    QBT --&gt; QKERNELS
    QKERNELS --&gt; QREPORT
    QREPORT --&gt; INTERPRET
    INTERPRET --&gt; EXECREPORT

    BINANCE --&gt; QDL
    DNSE --&gt; QDL
    VNSTOCK --&gt; QDL
    QDL --&gt; MDREDIS
    QDL --&gt; MDAPI
    MDREDIS --&gt; ARUNTIME
    MDAPI --&gt; ARUNTIME
    ARUNTIME --&gt; ASESS
    ASESS --&gt; GW

    MDREDIS --&gt; RISK
    MDAPI --&gt; RISK
    GW --&gt; RISK
    RISK --&gt; ROUTER
    ROUTER --&gt; PAPER
    ROUTER --&gt; BINAD
    ROUTER --&gt; BYBAD
    ROUTER --&gt; USAD
    ROUTER --&gt; INAD
    ROUTER --&gt; DNSEAD

    PAPER --&gt; EVENTS
    BINAD --&gt; EVENTS
    BYBAD --&gt; EVENTS
    USAD --&gt; EVENTS
    INAD --&gt; EVENTS
    DNSEAD --&gt; EVENTS
    EVENTS --&gt; PORT
    PORT --&gt; DB
    DB --&gt; PERF

    DB --&gt; RECON
    BINAD --&gt; RECON
    BYBAD --&gt; RECON
    USAD --&gt; RECON
    INAD --&gt; RECON
    DNSEAD --&gt; RECON
    GW --&gt; MON
    RISK --&gt; MON
    EVENTS --&gt; MON
    DB --&gt; MON
    RECON --&gt; MON
    MON --&gt; ALERT

    EXECREPORT --&gt; MANUAL
    PERF --&gt; MANUAL
    ALERT --&gt; MANUAL
    MANUAL --&gt; NOPORTAL
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Toàn hệ thống có thể hiểu như một dây chuyền kiểm soát. Historical data là “bộ nhớ đã kiểm toán”; QuantBT là “phòng thí nghiệm”; alpha runtime là “bộ não chiến lược”; data layer là “hệ thần kinh giá thị trường”; trading system là “bộ phận được phép dịch chuyển vốn”; monitoring là “hệ thống an toàn”; reporting và portal là “lớp giúp con người ra quyết định”. Không subsystem nào nên tự vượt qua gateway, risk hoặc approval để gửi lệnh.</p>
</blockquote><h2 id="nhan-inh-tong-the">Nhận định tổng thể</h2><p>Hệ sinh thái hiện tại <strong>không còn ở mức một nhóm script, notebook và trading bot rời rạc</strong>. Các core quan trọng đã hình thành đúng boundary của một quant firm:</p><ul>
<li>Historical data được tách khỏi real-time data.</li>
<li>QuantBT được tách thành simulation kernel với execution contract và audit artifacts.</li>
<li>Alpha logic được giữ ở Python, không gắn broker credential trực tiếp vào strategy.</li>
<li>Trading system đang đi theo unified gateway, risk, execution adapter, event, portfolio/accounting và reconciliation.</li>
<li>Monitoring đã có detector thực tế như heartbeat, stream lag, dead letter và broker reconciliation, chứ không chỉ hiển thị chart.</li>
</ul><p>Điểm còn thiếu lớn nhất không nằm ở “core algorithm”. Khoảng trống chính nằm ở <strong>platformization và governance</strong>:</p><ul>
<li>Chưa có một control plane thống nhất cho alpha registry, dataset snapshot, backtest job, approval và deployment.</li>
<li>Manager/non-tech vẫn phải đi qua report, CLI, API hoặc người kỹ thuật.</li>
<li>Live execution đã tồn tại trên nhiều adapter thực tế; phần còn thiếu là đóng certification pipeline thống nhất cho từng venue, broker account và alpha artifact.</li>
<li>Data lineage từ dataset → alpha → backtest → approval → paper/live vẫn chưa được quản lý bằng một identity xuyên suốt.</li>
</ul><h2 id="thang-anh-gia-muc-o-truong-thanh">Thang đánh giá mức độ trưởng thành</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Level</th>
<th>Ý nghĩa</th>
</tr>
</thead>
<tbody>
<tr>
<td>L1</td>
<td>Prototype cá nhân, script/notebook, khó reproduce</td>
</tr>
<tr>
<td>L2</td>
<td>Team-grade, có service và convention nhưng còn coupling thủ công</td>
</tr>
<tr>
<td>L3</td>
<td>Core phù hợp quant firm nhỏ/trung bình, chạy được nhiều alpha có kiểm soát</td>
</tr>
<tr>
<td>L4</td>
<td>Institutional multi-strategy, governance, lineage, DR, approval và live certification đầy đủ</td>
</tr>
<tr>
<td>L5</td>
<td>Multi-region, regulated, high availability và operational automation toàn diện</td>
</tr>
</tbody>
</table></div><div class="table-wrap"><table>
<thead>
<tr>
<th>Subsystem</th>
<th style="text-align:right">Đánh giá hiện tại</th>
<th>Nhận định</th>
</tr>
</thead>
<tbody>
<tr>
<td>Historical Data Layer</td>
<td style="text-align:right">L2.5 trên <code>main</code>; L3 trên hướng <code>dev</code></td>
<td>Data engineering core tốt, cần catalog/snapshot/object storage để đạt institutional data platform</td>
</tr>
<tr>
<td>QuantBT Kernel</td>
<td style="text-align:right">L3.5–L4 cho research/backtest kernel</td>
<td>Thành phần mạnh nhất; gần đầy đủ cho nhu cầu backtest của quỹ nhỏ/trung bình</td>
</tr>
<tr>
<td>Alpha Research &amp; Runtime</td>
<td style="text-align:right">L3</td>
<td>Có shared runtime/SDK và migration pattern tốt; thiếu immutable alpha registry và promotion identity</td>
</tr>
<tr>
<td>Streaming Data Layer</td>
<td style="text-align:right">L3</td>
<td>Boundary tốt, async, recovery rõ; cần durable event log và readiness registry để scale institutionally</td>
</tr>
<tr>
<td>Trading System Core</td>
<td style="text-align:right">L3.5 cho paper/sandbox; L3–L3.5 cho multi-venue live execution</td>
<td>Kiến trúc tốt, đã vượt mức bot/executor đơn lẻ; Binance, Bybit và một số adapter Mỹ/Ấn Độ đã live-deployed theo xác nhận owner, còn chiều sâu certification/DR khác nhau theo venue</td>
</tr>
<tr>
<td>Monitoring &amp; Reconciliation</td>
<td style="text-align:right">L3</td>
<td>Có monitoring primitives thật; cần state/rule/incident/action plane thống nhất</td>
</tr>
<tr>
<td>Manager Quant Platform</td>
<td style="text-align:right">L1.5–L2</td>
<td>Core data đã có nhưng product/control plane chưa được xây</td>
</tr>
</tbody>
</table></div><h2 id="nguyen-tac-acquisition-va-modernization">Nguyên tắc acquisition và modernization</h2><ol>
<li><strong>Không rewrite core đang tốt.</strong> QuantBT, collectors, data-layer provider adapters và trading domain logic phải được giữ lại.</li>
<li><strong>Tách migration khỏi modernization.</strong> Trước tiên phải reproduce đúng hệ thống cũ trên server mới; sau đó mới dual-run từng upgrade.</li>
<li><strong>Pin exact commit và artifact.</strong> Không migrate bằng branch name hoặc Docker tag <code>latest</code>.</li>
<li><strong>Golden test trước cutover.</strong> Historical query, QuantBT run, paper order và sandbox order phải có baseline để so sánh.</li>
<li><strong>Một artifact xuyên suốt.</strong> Cùng alpha package/config được promote từ approved backtest sang paper và live.</li>
<li><strong>Mọi upgrade phải có compatibility adapter.</strong> Không buộc toàn bộ alpha và service đổi contract cùng lúc.</li>
<li><strong>Live luôn fail-closed.</strong> Missing market data, stale broker sync, unresolved position hoặc unknown order đều phải chặn mở exposure mới.</li>
</ol><hr class="section-divider"/>`;
