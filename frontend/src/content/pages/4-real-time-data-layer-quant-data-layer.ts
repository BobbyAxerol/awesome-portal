/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 bf27e3d4b1159fdb36520740db9c5976f976ee2216a95cf9d64458830b37d7c0
 */
export const title = "4. REAL-TIME DATA LAYER — quant-data-layer";
export const html = `<h1 id="4-real-time-data-layer-quant-data-layer">4. REAL-TIME DATA LAYER — <code>quant-data-layer</code></h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Data layer là đường cấp giá và trạng thái thị trường cho alpha/risk. Nó không quyết định mua bán và không giữ sổ kế toán. Khi data layer stale hoặc sai market namespace, live order phải bị chặn thay vì hệ thống tự đoán giá.</p>
</blockquote><h2 id="cau-truc-hien-tai-4">Cấu trúc hiện tại</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    subgraph PROVIDERS["PROVIDERS"]
        BSPOT["Binance Spot WS/REST"]
        BUSDM["Binance USD-M WS/REST"]
        DNSE["DNSE WS/REST"]
        VN["VNStock Fallback"]
    end

    subgraph QDL["quant-data-layer"]
        SUP["Async Provider Supervisors"]
        PARSER["Normalized Feed Parsers"]
        FAIL["Retry / Failover / Freshness"]
        PRELOAD["Parquet Preload / Warmup"]
        API["FastAPI REST&lt;br/&gt;Health / Latest / Warmup / Recovery"]
        PUB["Publisher / Cache Projector"]
    end

    REDIS["redis_marketdata&lt;br/&gt;Ephemeral / No AOF-RDB&lt;br/&gt;Pub/Sub + TTL Latest State"]
    ALPHA["Alpha Runtime"]
    TS["Trading System Market Bridge / Risk"]

    BSPOT --&gt; SUP
    BUSDM --&gt; SUP
    DNSE --&gt; SUP
    VN --&gt; SUP
    SUP --&gt; PARSER
    PARSER --&gt; FAIL
    FAIL --&gt; PUB
    PUB --&gt; REDIS
    PRELOAD --&gt; API
    PARSER --&gt; API
    REDIS --&gt; ALPHA
    REDIS --&gt; TS
    API --&gt; ALPHA
    API --&gt; TS
</div><pre class="mermaid">flowchart LR
    subgraph PROVIDERS["PROVIDERS"]
        BSPOT["Binance Spot WS/REST"]
        BUSDM["Binance USD-M WS/REST"]
        DNSE["DNSE WS/REST"]
        VN["VNStock Fallback"]
    end

    subgraph QDL["quant-data-layer"]
        SUP["Async Provider Supervisors"]
        PARSER["Normalized Feed Parsers"]
        FAIL["Retry / Failover / Freshness"]
        PRELOAD["Parquet Preload / Warmup"]
        API["FastAPI REST&lt;br/&gt;Health / Latest / Warmup / Recovery"]
        PUB["Publisher / Cache Projector"]
    end

    REDIS["redis_marketdata&lt;br/&gt;Ephemeral / No AOF-RDB&lt;br/&gt;Pub/Sub + TTL Latest State"]
    ALPHA["Alpha Runtime"]
    TS["Trading System Market Bridge / Risk"]

    BSPOT --&gt; SUP
    BUSDM --&gt; SUP
    DNSE --&gt; SUP
    VN --&gt; SUP
    SUP --&gt; PARSER
    PARSER --&gt; FAIL
    FAIL --&gt; PUB
    PUB --&gt; REDIS
    PRELOAD --&gt; API
    PARSER --&gt; API
    REDIS --&gt; ALPHA
    REDIS --&gt; TS
    API --&gt; ALPHA
    API --&gt; TS
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="4-1-data-layer-ang-phuc-vu-cho-cac-muc-ich-sau">4.1 Data layer đang phục vụ cho các mục đích sau</h2><ul>
<li>Là market-data gateway duy nhất cho service nội bộ.</li>
<li>Quản lý provider connection, reconnect, failover và normalized payload.</li>
<li>Phân tách Binance Spot và USD-M market namespace.</li>
<li>Publish live trade/kline/VN quote qua Redis Pub/Sub.</li>
<li>Giữ latest-state cache TTL cho low-latency consumers.</li>
<li>Cung cấp REST warmup, latest-state recovery, health và diagnostics.</li>
<li>Cho phép alpha/trading system không tự mở thêm external WebSocket.</li>
<li>Tách ephemeral market-data workload khỏi durable trading Redis.</li>
</ul><h2 id="4-2-iem-manh-can-giu-nguyen">4.2 Điểm mạnh cần giữ nguyên</h2><ul>
<li>Boundary rõ: data layer sở hữu provider connectivity; trading system không sở hữu market provider connection.</li>
<li>Async architecture và supervisor/retry pattern.</li>
<li>Normalized feed parser thay vì để consumer phụ thuộc raw provider shape.</li>
<li>REST + Redis kết hợp đúng vai trò:
<ul>
<li>REST cho warmup/recovery/diagnostics.</li>
<li>Pub/Sub cho live updates.</li>
</ul>
</li>
<li>Dedicated <code>redis_marketdata</code> không persistence, tránh raw tick làm nặng trading event store.</li>
<li>Source/freshness/authoritative metadata để risk có thể fail-closed.</li>
<li>DNSE primary và fallback provider được quản trị trong cùng service.</li>
<li>Có market-specific namespace để tránh Spot/USDM ambiguity.</li>
</ul><h2 id="4-3-data-layer-hien-a-serve-cho-nhung-he-thong-nao">4.3 Data layer hiện đã serve cho những hệ thống nào</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Consumer</th>
<th>Cách sử dụng</th>
</tr>
</thead>
<tbody>
<tr>
<td>Alpha runtime</td>
<td>Warmup OHLCV qua REST, live trade/kline/quote qua Redis</td>
</tr>
<tr>
<td>Trading risk</td>
<td>Latest authoritative trade/quote, freshness và market namespace</td>
</tr>
<tr>
<td>Paper matcher</td>
<td>Latest tick hoặc controlled recovery</td>
</tr>
<tr>
<td>Performance/PnL</td>
<td>Mark-price projection và read-through recovery</td>
</tr>
<tr>
<td>Historical bridge</td>
<td>VN Parquet preload và latest snapshot recovery</td>
</tr>
<tr>
<td>Monitoring</td>
<td>Stream health, stale feed, queue drops và provider diagnostics</td>
</tr>
</tbody>
</table></div><h2 id="4-4-anh-gia-muc-o-core-hien-tai-oi-voi-quant-firm">4.4 Đánh giá mức độ core hiện tại đối với quant firm</h2><p><strong>Đánh giá cao:</strong> đây là một market-data gateway đúng nghĩa, không chỉ là WebSocket client.</p><ul>
<li>Với quant firm nhỏ/trung bình chạy bar/tick strategies không yêu cầu colocated HFT, core hiện tại đạt L3.</li>
<li>Separation giữa ephemeral market Redis và durable trading Redis là một quyết định kiến trúc tốt.</li>
<li>Việc bắt consumer dùng data-layer contract làm cho migration và thay provider dễ hơn.</li>
<li>Khả năng scale tốt vì provider adapters và consumers đã tách logic; cần bổ sung ownership/readiness để scale nhiều replica an toàn.</li>
</ul><h2 id="4-5-gioi-han-hien-tai">4.5 Giới hạn hiện tại</h2><ul>
<li>Redis Pub/Sub là ephemeral: consumer lag/restart có thể mất message.</li>
<li>Không có consumer offset/replay log dùng cho exact event audit.</li>
<li>API lifecycle và ingestion supervisor có thể cùng process; scale API replica có nguy cơ duplicate provider connections nếu không có leader/partition ownership.</li>
<li>Chưa có active requirement registry đầy đủ từ deployment/account/open orders.</li>
<li>Chưa có unified schema registry và compatibility policy.</li>
<li>Chưa có durable tick archive cho forensic replay.</li>
<li>HA/failover giữa nhiều data-layer instances chưa được mô tả như một production topology hoàn chỉnh.</li>
<li>Data quality state chưa được publish thành first-class event cho mọi downstream system.</li>
<li>Latest-state cache không thay thế được historical truth hoặc audit event log.</li>
</ul><h2 id="4-6-ke-hoach-nang-cap-sau-acquire">4.6 Kế hoạch nâng cấp sau acquire</h2><h3 id="d0-lift-and-shift-current-gateway">D0 — Lift-and-shift current gateway</h3><ul>
<li>Pin exact commit/config/provider credentials.</li>
<li>Deploy shadow data layer và separate Redis.</li>
<li>So sánh symbol coverage, payload schema, event timestamp, freshness, duplicate và reconnect behavior.</li>
<li>Không kết nối alpha trading production trong giai đoạn shadow.</li>
</ul><h3 id="d1-event-envelope-va-schema-version">D1 — Event envelope và schema version</h3><div class="code-card"><div class="artifact-toolbar"><span>JSON</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-json">{
  "event_id": "uuid",
  "schema_version": 1,
  "event_type": "market.trade",
  "venue": "BINANCE",
  "market": "USDM",
  "instrument_id": "BINANCE_USDM:BTCUSDT",
  "event_time": "2026-08-04T05:31:00Z",
  "received_at": "2026-08-04T05:31:00.124Z",
  "sequence": 18723881,
  "source": "binance_futures_trade",
  "authoritative": true,
  "payload": {}
}
</code></pre></div><h3 id="d2-split-ingress-khoi-query-api">D2 — Split ingress khỏi query API</h3><ul>
<li><code>market-ingestor</code>: provider connection, normalization, gap detection, publication.</li>
<li><code>market-data-api</code>: warmup, latest, diagnostics, history facade.</li>
<li>API có thể scale ngang mà không nhân đôi provider sessions.</li>
</ul><h3 id="d3-durable-event-log-cho-critical-flows">D3 — Durable event log cho critical flows</h3><p>Giữ Redis cho latest state; bổ sung Kafka-compatible/Redpanda/Redis Streams tùy tải cho:</p><ul>
<li>Replay.</li>
<li>Consumer offsets.</li>
<li>Audit event tape.</li>
<li>Monitoring consumers.</li>
<li>Archive consumer.</li>
<li>Dead-letter handling.</li>
</ul><p>Không cần chuyển toàn bộ low-latency latest cache sang durable log.</p><h3 id="d4-active-requirement-readiness-registry">D4 — Active requirement/readiness registry</h3><ul>
<li>Deployment đăng ký symbol/venue/market/timeframe cần dùng.</li>
<li>Data layer prewarm và báo trạng thái <code>READY/WARMING/STALE/MISSING/WRONG_MARKET</code>.</li>
<li>Gateway/risk block sandbox/live activation nếu requirement chưa ready.</li>
<li>Open orders tự động giữ requirement active.</li>
</ul><h2 id="4-7-e-xuat-kien-truc-sau-upgrade-v1">4.7 Đề xuất kiến trúc sau upgrade V1</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    PROVIDERS["Exchange / Broker / Vendor Feeds"] --&gt; INGEST["Dedicated Market Ingestors"]
    REQUIRE["Active Market Requirements&lt;br/&gt;Deployment + Open Orders"] --&gt; INGEST

    INGEST --&gt; NORMAL["Canonical Normalizer + Schema Registry"]
    NORMAL --&gt; QUALITY["Freshness / Sequence / Gap / Source Quality Gate"]

    QUALITY --&gt; BUS["Durable Market Event Log"]
    QUALITY --&gt; CACHE["Ephemeral Redis Latest-State Cache"]
    QUALITY --&gt; ARCHIVE["Tick/Bar Archive Consumer"]

    BUS --&gt; ALPHA["Alpha Consumer Groups"]
    BUS --&gt; MON["Monitoring / Replay / Forensics"]
    BUS --&gt; PAPER["Paper Matcher if event replay is required"]

    CACHE --&gt; RISK["Low-Latency Risk / Execution Mark"]
    CACHE --&gt; PERF["Performance Mark Projection"]

    API["Market Data REST API"] --&gt; CACHE
    API --&gt; HIST["Historical / Warmup Store"]
    ALPHA --&gt; API
    RISK --&gt; API

    READY["Readiness Registry"] --&gt; REQUIRE
    QUALITY --&gt; READY
    READY --&gt; CONTROL["Control Plane / Deployment Gate"]
</div><pre class="mermaid">flowchart LR
    PROVIDERS["Exchange / Broker / Vendor Feeds"] --&gt; INGEST["Dedicated Market Ingestors"]
    REQUIRE["Active Market Requirements&lt;br/&gt;Deployment + Open Orders"] --&gt; INGEST

    INGEST --&gt; NORMAL["Canonical Normalizer + Schema Registry"]
    NORMAL --&gt; QUALITY["Freshness / Sequence / Gap / Source Quality Gate"]

    QUALITY --&gt; BUS["Durable Market Event Log"]
    QUALITY --&gt; CACHE["Ephemeral Redis Latest-State Cache"]
    QUALITY --&gt; ARCHIVE["Tick/Bar Archive Consumer"]

    BUS --&gt; ALPHA["Alpha Consumer Groups"]
    BUS --&gt; MON["Monitoring / Replay / Forensics"]
    BUS --&gt; PAPER["Paper Matcher if event replay is required"]

    CACHE --&gt; RISK["Low-Latency Risk / Execution Mark"]
    CACHE --&gt; PERF["Performance Mark Projection"]

    API["Market Data REST API"] --&gt; CACHE
    API --&gt; HIST["Historical / Warmup Store"]
    ALPHA --&gt; API
    RISK --&gt; API

    READY["Readiness Registry"] --&gt; REQUIRE
    QUALITY --&gt; READY
    READY --&gt; CONTROL["Control Plane / Deployment Gate"]
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><hr class="section-divider"/>`;
