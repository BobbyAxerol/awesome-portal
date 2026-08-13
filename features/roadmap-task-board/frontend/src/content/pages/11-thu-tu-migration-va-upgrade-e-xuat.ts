/* Auto-generated from legacy/portal.html — DO NOT EDIT.
 * sha256 83b1500108614f4dbf6ceb1878d6aff7f17f0764afe8e5a2d6c0449961fc4044
 */
export const title = "11. THỨ TỰ MIGRATION VÀ UPGRADE ĐỀ XUẤT";
export const html = `<h1 id="11-thu-tu-migration-va-upgrade-e-xuat">11. THỨ TỰ MIGRATION VÀ UPGRADE ĐỀ XUẤT</h1><h2 id="giai-oan-0-tuan-1-reproduce-current-system-khong-redesign">Giai đoạn 0 — Tuần 1: Reproduce current system, không redesign</h2><div class="table-wrap"><table>
<thead>
<tr>
<th style="text-align:right">Thứ tự</th>
<th>Việc làm</th>
<th>Exit criteria</th>
</tr>
</thead>
<tbody>
<tr>
<td style="text-align:right">1</td>
<td>Freeze Git SHA, images, configs, secrets inventory</td>
<td>Có asset inventory và rollback point</td>
</tr>
<tr>
<td style="text-align:right">2</td>
<td>Mirror historical data read-only</td>
<td>Checksum/query/continuity parity</td>
</tr>
<tr>
<td style="text-align:right">3</td>
<td>Restore QuantBT + golden runs</td>
<td>Metrics/orders/fills/WFO candidate parity</td>
</tr>
<tr>
<td style="text-align:right">4</td>
<td>Restore representative alpha runtime</td>
<td>Warmup, signal và QuantBT integration chạy được</td>
</tr>
<tr>
<td style="text-align:right">5</td>
<td>Deploy streaming data shadow</td>
<td>Payload/freshness/symbol/reconnect parity</td>
</tr>
<tr>
<td style="text-align:right">6</td>
<td>Restore trading system non-prod</td>
<td>Paper E2E trace chạy, live endpoints bị network-block</td>
</tr>
<tr>
<td style="text-align:right">7</td>
<td>Restore monitoring/reconciliation</td>
<td>Heartbeat/lag/dead-letter/reconciliation visible</td>
</tr>
</tbody>
</table></div><h2 id="giai-oan-1-tuan-2-4-cutover-current-services">Giai đoạn 1 — Tuần 2–4: Cutover current services</h2><ul>
<li>Historical collectors từng workload.</li>
<li>Quant/research environment.</li>
<li>Streaming data layer.</li>
<li>Paper trading.</li>
<li>Sandbox chỉ sau broker sync/reconciliation clean.</li>
<li>Viết current-state runbooks và owner map.</li>
</ul><h2 id="giai-oan-2-tuan-5-9-standardize-contracts-va-reproducibility">Giai đoạn 2 — Tuần 5–9: Standardize contracts và reproducibility</h2><ul>
<li>DatasetClient và snapshot registry.</li>
<li>Instrument master/calendar.</li>
<li>Alpha manifest/registry.</li>
<li><code>quantbt-engine</code> package release.</li>
<li>Backtest run manifest.</li>
<li>Trading/market event envelopes.</li>
<li>Immutable artifact storage.</li>
</ul><h2 id="giai-oan-3-tuan-8-14-backtest-platform-va-manager-workflow">Giai đoạn 3 — Tuần 8–14: Backtest platform và manager workflow</h2><ul>
<li>QuantBT worker service.</li>
<li>Job queue/run registry.</li>
<li>Portal Backtest Wizard.</li>
<li><code>awesome-quant-interpretation</code> report worker, report registry và backtest/paper/live comparison.</li>
<li>Reports/comparison thông qua immutable report artifacts.</li>
<li>WFO/train-test workflow.</li>
<li>Approval inbox.</li>
</ul><h2 id="giai-oan-4-tuan-12-18-monitoring-core-va-paper-hardening">Giai đoạn 4 — Tuần 12–18: Monitoring core và paper hardening</h2><ul>
<li>Central state/rule/incident/action.</li>
<li>Depth/volume paper fill model.</li>
<li>Data/backtest/alpha/trading monitoring integration.</li>
<li>Game-day tests.</li>
<li>Paper observation cho selected alpha.</li>
</ul><h2 id="giai-oan-5-tuan-16-24-live-shadow-va-canary">Giai đoạn 5 — Tuần 16–24: Live shadow và canary</h2><ul>
<li>Import live adapter inventory/evidence cho Binance, Bybit, selected US/India brokers và DNSE.</li>
<li>Broker/venue/account certification.</li>
<li>Shadow live cho adapter/account chưa có đủ certification evidence.</li>
<li>Tiny canary.</li>
<li>Reconciliation/PnL/cash evidence.</li>
<li>Staged capital scale.</li>
<li>DR/rollback sign-off.</li>
</ul><hr class="section-divider"/>`;
