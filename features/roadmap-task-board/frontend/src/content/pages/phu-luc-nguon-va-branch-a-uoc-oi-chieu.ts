/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 65c0802ef00fa248057e2602acfbefe1123cb59b5b39ce44cf3861668c244724
 */
export const title = "PHỤ LỤC — NGUỒN VÀ BRANCH ĐÃ ĐƯỢC ĐỐI CHIẾU";
export const html = `<h1 id="phu-luc-nguon-va-branch-a-uoc-oi-chieu">PHỤ LỤC — NGUỒN VÀ BRANCH ĐÃ ĐƯỢC ĐỐI CHIẾU</h1><h2 id="public-repositories">Public repositories</h2><ul>
<li><a href="https://github.com/BobbyAxerol/trading-historical-data"><code>trading-historical-data</code></a>
<ul>
<li><code>main</code>: CSV.GZIP release baseline, collectors/common storage, manifests, continuity/gap workflows.</li>
<li><code>dev</code>: Parquet-primary direction, expanded derivatives, VN continuous futures/roll workflows.</li>
</ul>
</li>
<li><a href="https://github.com/BobbyAxerol/quantbt"><code>quantbt</code></a>
<ul>
<li><code>main</code>, <code>dev</code>, <code>release/1.0.7</code>.</li>
<li><code>feat/quantbt-engine-packaging</code>: <code>quantbt-engine</code>, protected TestPyPI/PyPI release gate và optional <code>quantbt-native</code> PyO3/Rust.</li>
</ul>
</li>
<li><a href="https://github.com/BobbyAxerol/quant-data-layer"><code>quant-data-layer</code></a>
<ul>
<li>Async provider gateway, REST recovery, ephemeral <code>redis_marketdata</code> và normalized market contracts.</li>
</ul>
</li>
<li><a href="https://github.com/BobbyAxerol/awesome-quant-interpretation"><code>awesome-quant-interpretation</code></a>
<ul>
<li>Automated QuantStats/QuantBT/Nautilus trade-log extraction, ECharts analytics, Train/Test reporting và optional AI interpretation.</li>
</ul>
</li>
<li><a href="https://github.com/BobbyAxerol/AlphaGateWay-SDK"><code>AlphaGateWay-SDK</code></a>
<ul>
<li>Public/legacy alpha-to-gateway integration surface; current private trading-system contract được ưu tiên theo tài liệu private.</li>
</ul>
</li>
</ul><h2 id="private-source-basis">Private source basis</h2><ul>
<li><code>TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md</code>
<ul>
<li>Unified paper/sandbox/live trading node.</li>
<li>Gateway/risk/execution/portfolio/accounting/reconciliation/monitoring.</li>
<li>Performance projection, execution sessions, physical broker binding, hedge mode, copy outbox và các implementation/test updates.</li>
</ul>
</li>
<li>Venue deployment note supplied by owner: Bybit cùng một số US/India broker adapters đã được deployed cho live execution; exact broker names/accounts/certification evidence vẫn private và phải được đưa vào acquisition service catalog.</li>
</ul><h2 id="luu-y-xac-minh">Lưu ý xác minh</h2><ul>
<li>Trước acquisition sign-off, cần đối chiếu exact production commit/image với branch documentation.</li>
<li>Các benchmark/test result trong repository hoặc private markdown là engineering evidence; team mới vẫn phải rerun trên server mới.</li>
<li>Live production readiness phải được đánh giá theo venue/account/alpha cụ thể, không suy rộng từ paper hoặc testnet.</li>
</ul>`;
