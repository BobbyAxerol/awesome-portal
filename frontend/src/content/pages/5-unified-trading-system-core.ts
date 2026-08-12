/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 a60b3cb3d19fb25beb4ef0991171a85569567864690f0c9d2535f8bb16d1597f
 */
export const title = "5. UNIFIED TRADING SYSTEM CORE";
export const html = `<h1 id="5-unified-trading-system-core">5. UNIFIED TRADING SYSTEM CORE</h1><h2 id="cau-truc-hien-tai-theo-tai-lieu-private">Cấu trúc hiện tại theo tài liệu private</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    ALPHA["Alpha Runtime / Shared SDK"] --&gt; GW["Gateway API"]
    GW --&gt; AUTH["Auth / Rate Limit / Idempotency / Schema"]
    AUTH --&gt; CMD["Order Command Stream"]

    DATA["data_layer&lt;br/&gt;Latest / Warmup / Readiness"] --&gt; RISK
    CMD --&gt; RISK["Risk Engine"]
    RISK --&gt; RCONTROL["Mode / Venue / Account Permission&lt;br/&gt;Market Freshness / Exposure / Capital&lt;br/&gt;Risk Grant / Kill Switch"]

    RCONTROL --&gt; ROUTER["Execution Router"]
    ROUTER --&gt; PAPER["PaperExecutionClient&lt;br/&gt;Persisted Open Orders + Matcher"]
    ROUTER --&gt; BIN["Binance Futures&lt;br/&gt;Sandbox + Live Execution"]
    ROUTER --&gt; BYBIT["Bybit Adapter&lt;br/&gt;Live Deployed — Owner Confirmed"]
    ROUTER --&gt; US["Selected US Broker Adapters&lt;br/&gt;Live Deployed — Owner Confirmed"]
    ROUTER --&gt; INDIA["Selected India Broker Adapters&lt;br/&gt;Live Deployed — Owner Confirmed"]
    ROUTER --&gt; DNSE["DNSE / Vietnam Adapter&lt;br/&gt;Venue-Specific Certification"]

    PAPER --&gt; OE["Canonical Order Events"]
    BIN --&gt; OE
    BYBIT --&gt; OE
    US --&gt; OE
    INDIA --&gt; OE
    DNSE --&gt; OE
    PAPER --&gt; FE["Canonical Fill Events"]
    BIN --&gt; FE
    BYBIT --&gt; FE
    US --&gt; FE
    INDIA --&gt; FE
    DNSE --&gt; FE

    OE --&gt; PORT["Portfolio / Accounting Single Owner"]
    FE --&gt; PORT
    PORT --&gt; DB["PostgreSQL / TimescaleDB"]
    DB --&gt; PERF["Performance / Account Equity / PnL Projection"]

    DB --&gt; SYNC["Broker Account Sync"]
    BIN --&gt; SYNC
    BYBIT --&gt; SYNC
    US --&gt; SYNC
    INDIA --&gt; SYNC
    DNSE --&gt; SYNC
    SYNC --&gt; RECON["Position / Open-Order / Physical Account Reconciliation"]
    RECON --&gt; RCONTROL

    SESSION["Execution Sessions / Risk Grants"] --&gt; GW
    SESSION --&gt; RISK
    SESSION --&gt; OE
    SESSION --&gt; FE

    DB --&gt; OUTBOX["Policy-Gated Copy Event Outbox"]
    OUTBOX --&gt; COPY["External Copy/Event Consumers"]

    MON["Monitoring / Heartbeat / Dead Letter / Stream Lag"] --&gt; RCONTROL
    GW --&gt; MON
    RISK --&gt; MON
    ROUTER --&gt; MON
    PORT --&gt; MON
    RECON --&gt; MON
</div><pre class="mermaid">flowchart LR
    ALPHA["Alpha Runtime / Shared SDK"] --&gt; GW["Gateway API"]
    GW --&gt; AUTH["Auth / Rate Limit / Idempotency / Schema"]
    AUTH --&gt; CMD["Order Command Stream"]

    DATA["data_layer&lt;br/&gt;Latest / Warmup / Readiness"] --&gt; RISK
    CMD --&gt; RISK["Risk Engine"]
    RISK --&gt; RCONTROL["Mode / Venue / Account Permission&lt;br/&gt;Market Freshness / Exposure / Capital&lt;br/&gt;Risk Grant / Kill Switch"]

    RCONTROL --&gt; ROUTER["Execution Router"]
    ROUTER --&gt; PAPER["PaperExecutionClient&lt;br/&gt;Persisted Open Orders + Matcher"]
    ROUTER --&gt; BIN["Binance Futures&lt;br/&gt;Sandbox + Live Execution"]
    ROUTER --&gt; BYBIT["Bybit Adapter&lt;br/&gt;Live Deployed — Owner Confirmed"]
    ROUTER --&gt; US["Selected US Broker Adapters&lt;br/&gt;Live Deployed — Owner Confirmed"]
    ROUTER --&gt; INDIA["Selected India Broker Adapters&lt;br/&gt;Live Deployed — Owner Confirmed"]
    ROUTER --&gt; DNSE["DNSE / Vietnam Adapter&lt;br/&gt;Venue-Specific Certification"]

    PAPER --&gt; OE["Canonical Order Events"]
    BIN --&gt; OE
    BYBIT --&gt; OE
    US --&gt; OE
    INDIA --&gt; OE
    DNSE --&gt; OE
    PAPER --&gt; FE["Canonical Fill Events"]
    BIN --&gt; FE
    BYBIT --&gt; FE
    US --&gt; FE
    INDIA --&gt; FE
    DNSE --&gt; FE

    OE --&gt; PORT["Portfolio / Accounting Single Owner"]
    FE --&gt; PORT
    PORT --&gt; DB["PostgreSQL / TimescaleDB"]
    DB --&gt; PERF["Performance / Account Equity / PnL Projection"]

    DB --&gt; SYNC["Broker Account Sync"]
    BIN --&gt; SYNC
    BYBIT --&gt; SYNC
    US --&gt; SYNC
    INDIA --&gt; SYNC
    DNSE --&gt; SYNC
    SYNC --&gt; RECON["Position / Open-Order / Physical Account Reconciliation"]
    RECON --&gt; RCONTROL

    SESSION["Execution Sessions / Risk Grants"] --&gt; GW
    SESSION --&gt; RISK
    SESSION --&gt; OE
    SESSION --&gt; FE

    DB --&gt; OUTBOX["Policy-Gated Copy Event Outbox"]
    OUTBOX --&gt; COPY["External Copy/Event Consumers"]

    MON["Monitoring / Heartbeat / Dead Letter / Stream Lag"] --&gt; RCONTROL
    GW --&gt; MON
    RISK --&gt; MON
    ROUTER --&gt; MON
    PORT --&gt; MON
    RECON --&gt; MON
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><blockquote class="manager-lens">
<p><strong>Dành cho manager/non-tech:</strong> Đây là phần duy nhất trong hệ sinh thái được phép biến một quyết định của alpha thành order thật. Live execution không còn chỉ là roadmap: Binance, Bybit và một số broker Mỹ/Ấn Độ đã có adapter live deployed theo xác nhận owner. Tuy vậy, “đã gửi được lệnh live” và “đã institutional-certified” là hai mức khác nhau; từng venue vẫn cần evidence về reconciliation, incident response, DR và capital canary.</p>
</blockquote><h2 id="5-1-trading-system-ang-phuc-vu-cho-cac-muc-ich-sau">5.1 Trading system đang phục vụ cho các mục đích sau</h2><ul>
<li>Một gateway duy nhất cho alpha command.</li>
<li>Mode-aware routing: <code>paper</code>, <code>sandbox</code>, <code>live</code>, <code>replay/backtest</code> theo model mục tiêu.</li>
<li>Pre-trade risk theo strategy/account/mode/venue/instrument.</li>
<li>Paper execution dùng cùng order/fill/accounting pipeline với live.</li>
<li>Multi-venue execution adapters: Binance, Bybit, DNSE/Vietnam và các broker integrations tại Mỹ/Ấn Độ; live depth/certification được quản lý theo từng venue.</li>
<li>Canonical orders, fills, positions, balances, margin, settlement và PnL.</li>
<li>Broker sync và reconciliation trước khi cho phép sandbox/live tiếp tục trade.</li>
<li>Execution-session trace cho rebalance/batch order cycle.</li>
<li>Physical broker account binding cho nhiều virtual alpha accounts.</li>
<li>Operator CLI/admin API, kill switch và audit.</li>
<li>Optional copy-event outbox theo policy.</li>
</ul><h2 id="5-2-cac-service-domain-chinh-hien-tai">5.2 Các service/domain chính hiện tại</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Thành phần</th>
<th>Trách nhiệm</th>
</tr>
</thead>
<tbody>
<tr>
<td>Gateway</td>
<td>Public alpha/admin API, auth, schema, idempotency, rate limit, command creation</td>
</tr>
<tr>
<td>Market-data bridge</td>
<td>Chỉ consume <code>data_layer</code>, không tự mở exchange market WebSocket</td>
</tr>
<tr>
<td>Risk engine</td>
<td>Market freshness, account/portfolio state, lot/tick, exposure, leverage, drawdown, mode/venue permission, kill switch</td>
</tr>
<tr>
<td>Execution router</td>
<td>Chọn adapter theo mode/venue/account policy</td>
</tr>
<tr>
<td>Paper execution</td>
<td>Persist open orders, matcher, cancel/amend, STOP/TP/TIF, fee/slippage model</td>
</tr>
<tr>
<td>Binance Futures adapter</td>
<td>Submit/amend/cancel, user-stream events, direct REST fallback, sandbox/live execution</td>
</tr>
<tr>
<td>Bybit adapter</td>
<td>Live execution adapter đã deployed theo xác nhận owner; cần nhập exact account/capability/certification matrix trong acquisition</td>
</tr>
<tr>
<td>US broker adapters</td>
<td>Một số adapter live đã deployed theo xác nhận owner; exact broker names và asset-class matrix được giữ private và cần đưa vào service catalog</td>
</tr>
<tr>
<td>India broker adapters</td>
<td>Một số adapter live đã deployed theo xác nhận owner; cần khóa exchange session, lot/tick, settlement, margin và broker reconciliation contract</td>
</tr>
<tr>
<td>DNSE adapter</td>
<td>Mapping order/account/token/OTP boundary; mức live certification được đánh giá riêng theo account/venue</td>
</tr>
<tr>
<td>Portfolio/accounting</td>
<td>Single owner của balances, positions, realized/unrealized PnL, fees, funding, settlement</td>
</tr>
<tr>
<td>Performance</td>
<td>Strategy/account equity và instrument performance snapshots</td>
</tr>
<tr>
<td>Reconciliation</td>
<td>Paper state, broker order, fill, position, balance, physical binding reconciliation</td>
</tr>
<tr>
<td>Monitor</td>
<td>Heartbeat, stream lag, dead letter, Redis/resource health, alerts</td>
</tr>
<tr>
<td>Alpha SDK</td>
<td>Alpha-facing order/state/portfolio/session API; không giữ broker secret</td>
</tr>
</tbody>
</table></div><h2 id="5-3-muc-o-support-theo-mode">5.3 Mức độ support theo mode</h2><div class="table-wrap"><table>
<thead>
<tr>
<th>Mode / Venue</th>
<th>Hiện trạng</th>
<th>Đánh giá</th>
</tr>
</thead>
<tbody>
<tr>
<td>Paper — multi-venue</td>
<td>Persistent open orders, matcher, cancel/amend, STOP/TP, TIF, account/position/PnL dùng chung canonical pipeline</td>
<td>Mạnh; phù hợp controlled multi-alpha paper, cần depth/latency realism cao hơn theo venue</td>
</tr>
<tr>
<td>Sandbox Binance</td>
<td>Testnet flow, broker sync, reconciliation, hedge/physical binding, native amend và advanced order tests</td>
<td>Mạnh cho pre-live validation</td>
</tr>
<tr>
<td>Live Binance</td>
<td>Adapter có live execution path và fail-closed controls; mức capital certification phải khóa theo account</td>
<td>Live-capable; cần canary/DR evidence để nâng lên institutional production</td>
</tr>
<tr>
<td>Live Bybit</td>
<td>Adapter live đã deployed — owner-confirmed</td>
<td>Live-capable; cần nhập exact supported products, broker sync và incident evidence trong acquisition</td>
</tr>
<tr>
<td>Live US brokers</td>
<td>Một số broker adapters đã deployed live — owner-confirmed; exact list private</td>
<td>Live-capable theo adapter; cần service catalog về asset class, session, shorting, margin, corporate action và settlement</td>
</tr>
<tr>
<td>Live India brokers</td>
<td>Một số broker adapters đã deployed live — owner-confirmed; exact list private</td>
<td>Live-capable theo adapter; cần venue calendar, lot/tick, margin, RMS/rejection và reconciliation certification</td>
</tr>
<tr>
<td>Paper DNSE/VN</td>
<td>Market/data integration, lot/tick/session và settlement modeling</td>
<td>Phù hợp paper validation</td>
</tr>
<tr>
<td>Live DNSE/VN</td>
<td>Adapter boundary và operation model có; certification phải đánh giá theo credential/account thực tế</td>
<td>Không suy rộng từ paper; yêu cầu tiny-order, broker payload và reconciliation evidence</td>
</tr>
<tr>
<td>Replay/backtest service mode</td>
<td>Domain model đã hướng tới; full immutable event replay chưa hoàn chỉnh</td>
<td>Cần hoàn thiện event store/replay engine</td>
</tr>
</tbody>
</table></div><h2 id="5-4-iem-manh-can-giu-nguyen-trong-giai-oan-acquire">5.4 Điểm mạnh cần giữ nguyên trong giai đoạn acquire</h2><ul>
<li>Paper không bị tách thành một hệ thống giả lập rời rạc; nó là execution mode của cùng trading node.</li>
<li>Data market đi qua <code>data_layer</code>, tránh duplicate provider connections.</li>
<li>Gateway, risk, execution và accounting có service boundary rõ.</li>
<li>Domain đi theo provider-neutral value objects và adapter pattern.</li>
<li>Decimal/value-object direction cho money/price/qty thay vì float trong core.</li>
<li>Canonical order/fill/event projection và single-owner accounting.</li>
<li>Mode, venue, account và deployment identity được giữ xuyên suốt.</li>
<li>Kill switch và fail-closed broker sync.</li>
<li>Persisted paper open order và crash recovery.</li>
<li>Reconciliation được xem là first-class behavior, không phải manual SQL cleanup.</li>
<li>Physical broker account và virtual alpha account được tách khái niệm.</li>
<li>Hedge/NET position-accounting policy được mô hình hóa.</li>
<li>Execution sessions, risk grants và batch/concurrency direction giúp scale rebalance burst.</li>
<li>Direct Binance USD-M REST fallback giảm phụ thuộc vào một SDK initialization path.</li>
<li>Copy outbox dùng durable DB outbox trước Redis stream, là pattern đúng cho publication.</li>
</ul><h2 id="5-5-anh-gia-muc-o-core-hien-tai-oi-voi-quant-firm">5.5 Đánh giá mức độ core hiện tại đối với quant firm</h2><p><strong>Đánh giá cao:</strong> trading system hiện tại đã có hình dạng của một <code>TradingNode</code>, không còn là executor bot.</p><ul>
<li>Với paper/sandbox systematic trading: L3.5.</li>
<li>Với multi-venue live execution: L3–L3.5. Hệ thống đã có live adapters thực tế, nhưng mức institutional certification vẫn khác nhau theo broker/account/asset class.</li>
<li>Kiến trúc phù hợp quant firm nhỏ/trung bình chạy low/medium-frequency systematic strategies.</li>
<li>Không phải HFT colocated engine; Redis/Postgres/service architecture ưu tiên reliability, audit và modularity hơn microsecond latency.</li>
<li>Khả năng migrate tốt vì service boundary và compatibility bridge đã tồn tại.</li>
<li>Khả năng scale tốt theo alpha/account/workload, đặc biệt khi physical broker binding, execution sessions và controlled concurrency được sử dụng đúng.</li>
</ul><p>Tài liệu private ghi nhận nhiều smoke/recovery/burst tests. Đây là bằng chứng engineering nội bộ tích cực, nhưng khi acquire vẫn phải rerun trên môi trường mới thay vì coi test history là production certification tự động.</p><h2 id="5-6-nhung-phan-con-thieu-hoac-chua-nen-quang-ba-la-hoan-tat">5.6 Những phần còn thiếu hoặc chưa nên quảng bá là hoàn tất</h2><ul>
<li>Full event-store replay chưa hoàn chỉnh.</li>
<li>Risk engine vẫn có compatibility/legacy debt theo tài liệu ở một số phase.</li>
<li>Advanced paper partial fill dựa trên depth/volume và realistic latency/slippage chưa đầy đủ cho mọi venue.</li>
<li>Exact live certification matrix cho Bybit, US brokers, India brokers và DNSE chưa được tập trung thành một service catalog/evidence registry trong tài liệu public.</li>
<li>Live execution availability không tự động thay thế approved real-capital canary, DR và reconciliation evidence cho từng account.</li>
<li>Direct private user-data WebSocket fallback còn là production follow-up.</li>
<li>Multi-region HA, database failover và disaster recovery chưa được đóng thành SLO.</li>
<li>Formal deployment artifact registry và approval identity chưa nằm trong trading core.</li>
<li>Operator action engine chưa được tách thành một policy-driven automated action plane thống nhất.</li>
<li>Control plane và manager portal chưa có.</li>
<li>Một số compatibility tables/bridges cần được retire theo measured dependency, không xóa vội.</li>
</ul><h2 id="5-7-ke-hoach-migration-khi-acquire">5.7 Kế hoạch migration khi acquire</h2><h3 id="t0-non-production-restore-truoc">T0 — Non-production restore trước</h3><ol>
<li>Lấy source private, submodule, exact commit, image digest và deployment manifests.</li>
<li>Backup Postgres/Timescale, Redis state, migration history và secrets inventory.</li>
<li>Dựng <code>trading-stg</code> với network-level block tới live broker endpoints.</li>
<li>Restore DB sang non-production.</li>
<li>Deploy data bridge, gateway, risk, paper, portfolio, performance, reconciliation và monitor.</li>
<li>Chạy trace:</li>
</ol><div class="code-card"><div class="artifact-toolbar"><span>TEXT</span><button class="mini-btn copy-code" type="button">Copy</button></div><pre><code class="language-text">market event
  -&gt; alpha signal
  -&gt; gateway command
  -&gt; risk decision
  -&gt; paper order
  -&gt; fill
  -&gt; position/accounting
  -&gt; performance snapshot
  -&gt; reconciliation/monitoring
</code></pre></div><h3 id="t1-golden-execution-matrix">T1 — Golden execution matrix</h3><ul>
<li>MARKET, LIMIT, STOP, TAKE_PROFIT.</li>
<li>Cancel và native amend/cancel-replace.</li>
<li>Partial fill và duplicate event.</li>
<li>IOC/FOK/GTD.</li>
<li>Long, short, reduce-only và hedge mode.</li>
<li>Paper Binance/DNSE, sandbox Binance và contract/smoke matrix cho các live adapters Bybit, US, India theo môi trường được phép.</li>
<li>Crash gateway/risk/executor/listener/portfolio trong từng stage.</li>
</ul><h3 id="t2-cutover-paper-truoc-sandbox-live">T2 — Cutover paper trước sandbox/live</h3><ul>
<li>Paper trên server mới trở thành source of truth.</li>
<li>Alpha cũ đi qua compatibility SDK.</li>
<li>So sánh order/fill/position/PnL với server cũ.</li>
<li>Sau observation window mới cutover sandbox.</li>
</ul><h3 id="t3-shadow-live">T3 — Shadow live</h3><ul>
<li>Nhận live market data.</li>
<li>Tạo signal/risk/order intent.</li>
<li>Không submit hoặc submit vào broker shadow/test account.</li>
<li>So sánh intended vs broker constraints và reconciliation.</li>
</ul><h3 id="t4-live-canary">T4 — Live canary</h3><ul>
<li>Một alpha, một account, một venue, allocation nhỏ.</li>
<li>Kill switch, rollback và operator on-call bắt buộc.</li>
<li>Tăng capital theo stage, không bật toàn bộ alpha cùng lúc.</li>
</ul><h2 id="5-8-ke-hoach-upgrade-sau-acquire">5.8 Kế hoạch upgrade sau acquire</h2><div class="table-wrap"><table>
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
<td>Exact deployment reproducibility + secret rotation</td>
<td>An toàn acquire</td>
</tr>
<tr>
<td style="text-align:right">P0</td>
<td>Complete canonical order/fill/accounting ownership</td>
<td>Không double count hoặc split truth</td>
</tr>
<tr>
<td style="text-align:right">P0</td>
<td>Venue capability/certification matrix</td>
<td>Không quảng bá unsupported live behavior</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Immutable event store + replay checkpoint</td>
<td>Crash recovery và forensic replay</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Complete risk-engine pure-domain path</td>
<td>Dễ test, deterministic và giảm legacy coupling</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Paper depth/volume/latency models</td>
<td>Tăng backtest-paper-live realism</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Broker credential/binding registry</td>
<td>Scale nhiều physical accounts/venues an toàn</td>
</tr>
<tr>
<td style="text-align:right">P1</td>
<td>Automated recovery runbooks/game days</td>
<td>Chứng minh system chịu lỗi</td>
</tr>
<tr>
<td style="text-align:right">P2</td>
<td>Multi-instance consumers + leader/partition ownership</td>
<td>Horizontal scale</td>
</tr>
<tr>
<td style="text-align:right">P2</td>
<td>Database HA/backup restore RTO-RPO</td>
<td>Production continuity</td>
</tr>
<tr>
<td style="text-align:right">P2</td>
<td>Real DNSE/Binance live certification</td>
<td>Mở live có evidence</td>
</tr>
<tr>
<td style="text-align:right">P3</td>
<td>Low-latency native components nếu profiling chứng minh</td>
<td>Không premature rewrite</td>
</tr>
</tbody>
</table></div><h2 id="5-9-e-xuat-kien-truc-sau-upgrade-v1">5.9 Đề xuất kiến trúc sau upgrade V1</h2><div class="diagram-card"><div class="artifact-toolbar"><span>Architecture diagram</span><button class="mini-btn copy-source" type="button">Copy Mermaid</button></div><div class="mermaid-source" hidden="">flowchart LR
    ALPHA["Approved Alpha Runtime"] --&gt; GATEWAY["Unified Gateway"]
    GATEWAY --&gt; COMMAND["Durable Command Bus"]
    COMMAND --&gt; RISK["Pure-Domain Risk Engine"]

    MARKET["Market Readiness + Latest State"] --&gt; RISK
    ACCOUNT["Account / Allocation / Broker Sync"] --&gt; RISK
    POLICY["Kill / Reduce / Venue Capability Policy"] --&gt; RISK

    RISK --&gt; EXEC["Execution Engine"]
    EXEC --&gt; REGISTRY["Adapter Registry"]
    REGISTRY --&gt; PAPER["Paper Adapter"]
    REGISTRY --&gt; BINANCE["Binance Futures Adapter"]
    REGISTRY --&gt; DNSE["DNSE Adapter"]
    REGISTRY --&gt; FUTURE["Future Broker Adapters"]

    PAPER --&gt; EVENTSTORE["Immutable Event Store"]
    BINANCE --&gt; EVENTSTORE
    DNSE --&gt; EVENTSTORE
    FUTURE --&gt; EVENTSTORE

    EVENTSTORE --&gt; PROJECTOR["Portfolio / Account / Settlement Projectors"]
    PROJECTOR --&gt; READDB["Operational Read Models"]
    EVENTSTORE --&gt; REPLAY["Replay / Recovery"]

    BROKER["Broker Authoritative State"] --&gt; RECON["Reconciliation Engine"]
    READDB --&gt; RECON
    RECON --&gt; INCIDENT["Incident + Action Policy"]
    INCIDENT --&gt; RISK
    INCIDENT --&gt; EXEC

    READDB --&gt; PERFORMANCE["PnL / Performance / Attribution"]
    READDB --&gt; CONTROL["Manager Control Plane"]
</div><pre class="mermaid">flowchart LR
    ALPHA["Approved Alpha Runtime"] --&gt; GATEWAY["Unified Gateway"]
    GATEWAY --&gt; COMMAND["Durable Command Bus"]
    COMMAND --&gt; RISK["Pure-Domain Risk Engine"]

    MARKET["Market Readiness + Latest State"] --&gt; RISK
    ACCOUNT["Account / Allocation / Broker Sync"] --&gt; RISK
    POLICY["Kill / Reduce / Venue Capability Policy"] --&gt; RISK

    RISK --&gt; EXEC["Execution Engine"]
    EXEC --&gt; REGISTRY["Adapter Registry"]
    REGISTRY --&gt; PAPER["Paper Adapter"]
    REGISTRY --&gt; BINANCE["Binance Futures Adapter"]
    REGISTRY --&gt; DNSE["DNSE Adapter"]
    REGISTRY --&gt; FUTURE["Future Broker Adapters"]

    PAPER --&gt; EVENTSTORE["Immutable Event Store"]
    BINANCE --&gt; EVENTSTORE
    DNSE --&gt; EVENTSTORE
    FUTURE --&gt; EVENTSTORE

    EVENTSTORE --&gt; PROJECTOR["Portfolio / Account / Settlement Projectors"]
    PROJECTOR --&gt; READDB["Operational Read Models"]
    EVENTSTORE --&gt; REPLAY["Replay / Recovery"]

    BROKER["Broker Authoritative State"] --&gt; RECON["Reconciliation Engine"]
    READDB --&gt; RECON
    RECON --&gt; INCIDENT["Incident + Action Policy"]
    INCIDENT --&gt; RISK
    INCIDENT --&gt; EXEC

    READDB --&gt; PERFORMANCE["PnL / Performance / Attribution"]
    READDB --&gt; CONTROL["Manager Control Plane"]
</pre><div class="diagram-error" hidden="">Không thể render Mermaid. Source vẫn có thể copy bằng nút phía trên.</div></div><hr class="section-divider"/>`;
