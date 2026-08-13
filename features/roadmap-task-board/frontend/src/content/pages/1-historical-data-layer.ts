/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 a9d5fc8aa993c7e8b2a688913de303ef6b2600a56159857b828501af228d912b
 */
export const title = "1. HISTORICAL DATA LAYER";
export const html = `<h1 id="1-historical-data-layer">1. HISTORICAL DATA LAYER</h1><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Historical layer quyết định liệu một kết quả backtest có thể được tin cậy và chạy lại hay không. Nếu dữ liệu thay đổi âm thầm, thiếu provenance hoặc không khóa snapshot, cùng một alpha có thể cho hai kết quả khác nhau và approval mất ý nghĩa.</p>
</blockquote><h2 id="cau-truc-hien-tai">Cấu trúc hiện tại</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    subgraph PROVIDERS["PROVIDERS"]
        B1["Binance Archives / REST"]
        B2["Binance Spot / USD-M / Quarterly / Options"]
        V1["DNSE / VNStock / VN Market Sources"]
    end

    subgraph COLLECTORS["COLLECTOR LAYER"]
        C1["Crypto 1m Collectors"]
        C2["Spot / Quarterly / Futures Metrics"]
        C3["Orderbook / Options Snapshots"]
        C4["VN Daily / Intraday / Futures"]
        C5["Daily Matrix / Continuous Futures Builders"]
    end

    subgraph COMMON["COMMON DATA ENGINEERING"]
        NORMALIZE["Normalize Schema"]
        DEDUP["Deduplicate + Sort"]
        LOCK["File Lock"]
        ATOMIC["Temp Write + os.replace"]
        AUDIT["OHLC / Duplicate / Continuity Audit"]
        GAP["Gap Detection / Repair"]
        MANIFEST["Manifest / Resume / Heartbeat"]
    end

    subgraph STORAGE["STORAGE BASELINES"]
        MAIN["main&lt;br/&gt;CSV.GZIP Partitions&lt;br/&gt;asset/timeframe/symbol/year/month"]
        DEV["dev&lt;br/&gt;Parquet Primary&lt;br/&gt;Extended Derivatives + Roll/Continuous Series"]
    end

    LOADER["Unified data_loader / Dataset Access"]
    ALPHA["Alpha Research"]
    QBT["QuantBT Backtest"]

    B1 --&gt; C1
    B2 --&gt; C2
    B2 --&gt; C3
    V1 --&gt; C4
    C1 --&gt; NORMALIZE
    C2 --&gt; NORMALIZE
    C3 --&gt; NORMALIZE
    C4 --&gt; NORMALIZE
    NORMALIZE --&gt; DEDUP
    DEDUP --&gt; LOCK
    LOCK --&gt; ATOMIC
    ATOMIC --&gt; MAIN
    ATOMIC -. "dev modernization" .-&gt; DEV
    C1 --&gt; MANIFEST
    C2 --&gt; MANIFEST
    C3 --&gt; MANIFEST
    C4 --&gt; MANIFEST
    MAIN --&gt; AUDIT
    DEV --&gt; AUDIT
    AUDIT --&gt; GAP
    C5 --&gt; DEV
    MAIN --&gt; LOADER
    DEV --&gt; LOADER
    LOADER --&gt; ALPHA
    LOADER --&gt; QBT
</div><pre class="mermaid">flowchart LR
    subgraph PROVIDERS["PROVIDERS"]
        B1["Binance Archives / REST"]
        B2["Binance Spot / USD-M / Quarterly / Options"]
        V1["DNSE / VNStock / VN Market Sources"]
    end

    subgraph COLLECTORS["COLLECTOR LAYER"]
        C1["Crypto 1m Collectors"]
        C2["Spot / Quarterly / Futures Metrics"]
        C3["Orderbook / Options Snapshots"]
        C4["VN Daily / Intraday / Futures"]
        C5["Daily Matrix / Continuous Futures Builders"]
    end

    subgraph COMMON["COMMON DATA ENGINEERING"]
        NORMALIZE["Normalize Schema"]
        DEDUP["Deduplicate + Sort"]
        LOCK["File Lock"]
        ATOMIC["Temp Write + os.replace"]
        AUDIT["OHLC / Duplicate / Continuity Audit"]
        GAP["Gap Detection / Repair"]
        MANIFEST["Manifest / Resume / Heartbeat"]
    end

    subgraph STORAGE["STORAGE BASELINES"]
        MAIN["main&lt;br/&gt;CSV.GZIP Partitions&lt;br/&gt;asset/timeframe/symbol/year/month"]
        DEV["dev&lt;br/&gt;Parquet Primary&lt;br/&gt;Extended Derivatives + Roll/Continuous Series"]
    end

    LOADER["Unified data_loader / Dataset Access"]
    ALPHA["Alpha Research"]
    QBT["QuantBT Backtest"]

    B1 --&gt; C1
    B2 --&gt; C2
    B2 --&gt; C3
    V1 --&gt; C4
    C1 --&gt; NORMALIZE
    C2 --&gt; NORMALIZE
    C3 --&gt; NORMALIZE
    C4 --&gt; NORMALIZE
    NORMALIZE --&gt; DEDUP
    DEDUP --&gt; LOCK
    LOCK --&gt; ATOMIC
    ATOMIC --&gt; MAIN
    ATOMIC -. "dev modernization" .-&gt; DEV
    C1 --&gt; MANIFEST
    C2 --&gt; MANIFEST
    C3 --&gt; MANIFEST
    C4 --&gt; MANIFEST
    MAIN --&gt; AUDIT
    DEV --&gt; AUDIT
    AUDIT --&gt; GAP
    C5 --&gt; DEV
    MAIN --&gt; LOADER
    DEV --&gt; LOADER
    LOADER --&gt; ALPHA
    LOADER --&gt; QBT
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><h2 id="1-1-historical-layer-ang-uoc-phat-trien-va-phuc-vu-cho-cac-muc-ich-sau">1.1 Historical layer đang được phát triển và phục vụ cho các mục đích sau</h2><ul>
<li>Cung cấp closed-bar, snapshot và derived data đã được kiểm tra cho research/backtest.</li>
<li>Tạo một nguồn dữ liệu nội bộ để alpha không phải query provider mỗi lần chạy.</li>
<li>Hỗ trợ crypto spot, futures/perpetual, quarterly contracts, options, order-book snapshot, VN stocks và VN derivatives.</li>
<li>Hỗ trợ daily/intraday matrices cho multi-symbol portfolio research.</li>
<li>Resume collector sau restart bằng manifest và watermark thay vì tải lại toàn bộ.</li>
<li>Kiểm tra duplicate, OHLC validity, continuity và gap.</li>
<li>Giữ provenance/source trên dữ liệu để phân biệt official, archive, REST backfill hoặc proxy/fallback.</li>
<li>Ở hướng <code>dev</code>, mở rộng sang Parquet primary, VN futures concrete contracts, roll table và continuous futures series.</li>
</ul><h2 id="1-2-cau-truc-hien-tai-va-ranh-gioi-giua-main-voi-dev">1.2 Cấu trúc hiện tại và ranh giới giữa <code>main</code> với <code>dev</code></h2><h3 id="main-baseline-release-public-on-inh"><code>main</code> — baseline release/public ổn định</h3><ul>
<li>Storage chính là partitioned <code>CSV.GZIP</code>.</li>
<li>Partition theo asset class, market, timeframe, symbol, year và month.</li>
<li>Collector dùng common storage, lock, atomic replace, manifest và heartbeat.</li>
<li><code>data_loader.py</code> là shared access layer cho alpha và QuantBT.</li>
<li>Có Docker Compose để chạy các collector độc lập nhưng cùng dùng shared filesystem.</li>
</ul><h3 id="dev-huong-modernization-ang-phat-trien"><code>dev</code> — hướng modernization đang phát triển</h3><ul>
<li>Parquet được đưa lên làm primary storage.</li>
<li>Mở rộng futures metrics, contract-level VN derivatives và continuous futures.</li>
<li>Có roll table, calendar-front-month và liquidity-aware tradable series.</li>
<li>Tăng mức validation và production flow cho dữ liệu phái sinh.</li>
</ul><p><strong>Quy tắc acquire:</strong> phải xác nhận server cũ đang chạy commit nào. Không được mô tả <code>dev</code> là production nếu collector production vẫn chạy <code>main</code>; cũng không được bỏ qua <code>dev</code> vì đây là phần modernization có giá trị cao và nên được đưa vào migration backlog ngay sau parity.</p><h2 id="1-3-iem-manh-can-giu-nguyen-trong-giai-oan-acquire">1.3 Điểm mạnh cần giữ nguyên trong giai đoạn acquire</h2><ul>
<li>Partition theo asset/timeframe/symbol/year/month.</li>
<li>Deduplication trước khi ghi.</li>
<li>File lock và atomic write bằng file tạm rồi <code>os.replace</code>.</li>
<li>Resume từ manifest/tail watermark.</li>
<li>Continuity audit và gap repair.</li>
<li>Source provenance trên từng row hoặc partition.</li>
<li>Unified loader cho crypto, VN stocks, futures, options và matrices.</li>
<li>Collector tách theo workload, dễ migrate từng service thay vì big-bang.</li>
<li>Derived matrices và continuous futures được đặt sau source data thay vì trộn vào collector raw.</li>
<li>Có test/smoke path và Docker deployment baseline.</li>
</ul><h2 id="1-4-historical-layer-hien-a-serve-cho-nhung-he-thong-va-muc-ich-nao">1.4 Historical layer hiện đã serve cho những hệ thống và mục đích nào</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Consumer</th>
<th>Dữ liệu/giá trị nhận được</th>
</tr>
</thead>
<tbody>
<tr>
<td>QuantBT</td>
<td>OHLCV, position matrices, futures/options snapshots và input cho vectorized/event/portfolio backtest</td>
</tr>
<tr>
<td>Researcher</td>
<td>Dataset dùng lại cho feature engineering, signal discovery, model training và calibration</td>
</tr>
<tr>
<td>Alpha repositories</td>
<td>Warmup/history để tính indicator và khởi tạo state</td>
</tr>
<tr>
<td>WFO/train-test</td>
<td>Fold data ổn định theo time range và universe</td>
</tr>
<tr>
<td>Data-quality operation</td>
<td>Continuity reports, gap inventory, collector heartbeat và repair workflow</td>
</tr>
<tr>
<td>VN derivatives research</td>
<td>Concrete contracts, roll mapping và continuous series trong hướng <code>dev</code></td>
</tr>
</tbody>
</table></div><h2 id="1-5-anh-gia-muc-o-core-hien-tai-oi-voi-mot-quant-firm">1.5 Đánh giá mức độ core hiện tại đối với một quant firm</h2><p><strong>Đánh giá cao:</strong> core hiện tại đã vượt xa một data downloader thông thường. Việc có partitioning, atomic write, lock, manifest, continuity audit, gap repair, unified loader và multi-asset collectors cho thấy kiến trúc đã được thiết kế với tư duy vận hành dài hạn.</p><ul>
<li>Với quỹ nhỏ/trung bình tập trung vào bar-based research, current core đủ để vận hành research có kỷ luật.</li>
<li>Hướng <code>dev</code> với Parquet, continuous futures và roll table đưa hệ thống gần hơn đáng kể tới data foundation của một quant firm thực thụ.</li>
<li>Khả năng migrate tốt vì workload đã được tách collector và state có thể kiểm tra bằng watermark/checksum.</li>
<li>Khả năng scale theo chiều dọc tốt; scale phân tán cần thay đổi storage/lock/catalog nhưng không cần viết lại logic collector.</li>
</ul><p><strong>Mức hiện tại:</strong> L2.5 trên release baseline, L3 nếu nhánh Parquet/derivatives được verify và promote ổn định.</p><h2 id="1-6-nhung-phan-chua-nen-coi-la-institutional-grade-hoan-chinh">1.6 Những phần chưa nên coi là institutional-grade hoàn chỉnh</h2><ul>
<li>Filesystem và relative path vẫn là integration boundary chính.</li>
<li>Chưa có immutable <code>dataset_snapshot_id</code> dùng xuyên suốt backtest.</li>
<li>Chưa có centralized data catalog và schema registry.</li>
<li>Chưa có instrument master effective-dated chung với streaming/trading.</li>
<li>Chưa có point-in-time corporate actions/universe đầy đủ cho equity research.</li>
<li>Chưa có object-store namespace, checksum manifest và lifecycle policy cấp platform.</li>
<li>Timezone convention vẫn cần được chuẩn hóa rõ thành event time, available time và ingestion time.</li>
<li>Chưa có data entitlement/access policy theo user/team.</li>
<li>Một số gap/fallback/proxy data cần quality flag bắt buộc khi chạy backtest.</li>
</ul><h2 id="1-7-ke-hoach-migration-khi-acquire">1.7 Kế hoạch migration khi acquire</h2><h3 id="buoc-h0-freeze-va-mirror-current-state">Bước H0 — Freeze và mirror current state</h3><ol>
<li>Ghi exact Git SHA, Docker image digest và config của từng collector.</li>
<li>Backup <code>storage</code>, <code>state</code>, manifests, logs và environment inventory.</li>
<li>Tạo inventory theo dataset/symbol/timeframe/min-time/max-time/row-count/source.</li>
<li>Copy dữ liệu lên server mới ở read-only mode.</li>
<li>Chạy checksum, duplicate, continuity và sample query parity.</li>
<li>Mount read-only mirror cho QuantBT để chạy golden backtests.</li>
</ol><h3 id="buoc-h1-cutover-collector-tung-workload">Bước H1 — Cutover collector từng workload</h3><ul>
<li>Cutover từ workload dễ replay trước: crypto 1m → snapshot collectors → spot hybrid → VN daily → VN intraday → DNSE-authenticated futures → derived matrices.</li>
<li>Với mỗi collector: stop old writer → final sync → start new writer với overlap → dedup/audit → xác nhận watermark → chỉ sau đó retire old writer.</li>
<li>Không chạy hai writer dài hạn trên cùng partition nếu chưa có formal dual-write design.</li>
</ul><h3 id="buoc-h2-promote-verified-dev-capabilities">Bước H2 — Promote verified <code>dev</code> capabilities</h3><ul>
<li>Chạy CSV-versus-Parquet parity.</li>
<li>So sánh row count, min/max time, null count, source distribution, duplicate và canonical row hash.</li>
<li>Promote Parquet từng dataset; giữ legacy reader trong deprecation window.</li>
<li>Verify roll table và continuous futures bằng independent provider/sample contract tests.</li>
</ul><h2 id="1-8-nhung-y-tuong-va-ke-hoach-nang-cap-sau-acquire-theo-muc-o-can-thiet">1.8 Những ý tưởng và kế hoạch nâng cấp sau acquire theo mức độ cần thiết</h2><div class="table-wrap"><table>
<thead>
<tr>
<th style="text-align:right">Priority</th>
<th>Upgrade</th>
<th>Mục tiêu</th>
</tr>
</thead>
<tbody>
<tr>
<td style="text-align:right">P0</td>
<td>Exact-commit deployment, backup/restore, checksum inventory</td>
<td>Không mất dữ liệu và reproduce current system</td>
</tr>
<tr>
<td style="text-align:right">P0</td>
<td><code>DatasetClient</code> abstraction</td>
<td>Tách alpha/QuantBT khỏi filesystem path</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Immutable dataset snapshot registry</td>
<td>Mỗi backtest dùng đúng data version</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Instrument master + exchange calendar version</td>
<td>Một identity dùng chung historical/stream/trading</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Dual-write Parquet + object storage</td>
<td>Giảm I/O, mở rộng nhiều worker/server</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Data quality report và quarantine state</td>
<td>Block run khi dataset không đạt quality gate</td>
</tr>
<tr>
<td style="text-align:right">P2</td>
<td>Bronze/Silver/Gold data zones</td>
<td>Tách raw, canonical và research-ready data</td>
</tr>
<tr>
<td style="text-align:right">P2</td>
<td>Point-in-time universe/corporate actions</td>
<td>Tránh survivorship/look-ahead cho equity</td>
</tr>
<tr>
<td style="text-align:right">P2</td>
<td>Snapshot-aware Dataset API/SDK</td>
<td>Research service không biết storage implementation</td>
</tr>
<tr>
<td style="text-align:right">P3</td>
<td>Distributed query/lakehouse nếu tải chứng minh cần</td>
<td>Scale hàng chục TB/nhiều team, không over-engineer sớm</td>
</tr>
</tbody>
</table></div><h2 id="1-9-e-xuat-kien-truc-sau-upgrade-v1">1.9 Đề xuất kiến trúc sau upgrade V1</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    PROVIDERS["Providers / Exchange Archives / REST"] --&gt; INGEST["Collectors + Ingestion Adapters"]
    INGEST --&gt; BRONZE["Bronze Raw Append-Only&lt;br/&gt;Object Storage"]
    INGEST --&gt; PROV["Source / Checksum / Ingestion Metadata"]

    BRONZE --&gt; VALIDATE["Schema + OHLC + Duplicate + Continuity + Gap Validation"]
    VALIDATE --&gt; SILVER["Silver Canonical Parquet"]
    VALIDATE --&gt; QUARANTINE["Quarantine / Known Warnings"]

    INSTRUMENT["Instrument Master"] --&gt; SILVER
    CALENDAR["Versioned Calendars"] --&gt; SILVER
    SILVER --&gt; GOLD["Gold Research Data&lt;br/&gt;Matrices / Continuous Futures / Features"]

    SILVER --&gt; SNAPSHOT["Dataset Snapshot Registry"]
    GOLD --&gt; SNAPSHOT
    PROV --&gt; SNAPSHOT
    QUARANTINE --&gt; SNAPSHOT

    SNAPSHOT --&gt; API["Historical Dataset API / Python SDK"]
    API --&gt; QBT["QuantBT Workers"]
    API --&gt; RESEARCH["Research / Training"]
    API --&gt; REPLAY["Replay / Paper Calibration"]

    CATALOG["Data Catalog + Lineage + Quality UI"] --&gt; SNAPSHOT
</div><pre class="mermaid">flowchart LR
    PROVIDERS["Providers / Exchange Archives / REST"] --&gt; INGEST["Collectors + Ingestion Adapters"]
    INGEST --&gt; BRONZE["Bronze Raw Append-Only&lt;br/&gt;Object Storage"]
    INGEST --&gt; PROV["Source / Checksum / Ingestion Metadata"]

    BRONZE --&gt; VALIDATE["Schema + OHLC + Duplicate + Continuity + Gap Validation"]
    VALIDATE --&gt; SILVER["Silver Canonical Parquet"]
    VALIDATE --&gt; QUARANTINE["Quarantine / Known Warnings"]

    INSTRUMENT["Instrument Master"] --&gt; SILVER
    CALENDAR["Versioned Calendars"] --&gt; SILVER
    SILVER --&gt; GOLD["Gold Research Data&lt;br/&gt;Matrices / Continuous Futures / Features"]

    SILVER --&gt; SNAPSHOT["Dataset Snapshot Registry"]
    GOLD --&gt; SNAPSHOT
    PROV --&gt; SNAPSHOT
    QUARANTINE --&gt; SNAPSHOT

    SNAPSHOT --&gt; API["Historical Dataset API / Python SDK"]
    API --&gt; QBT["QuantBT Workers"]
    API --&gt; RESEARCH["Research / Training"]
    API --&gt; REPLAY["Replay / Paper Calibration"]

    CATALOG["Data Catalog + Lineage + Quality UI"] --&gt; SNAPSHOT
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><hr class="section-divider"/>`;
