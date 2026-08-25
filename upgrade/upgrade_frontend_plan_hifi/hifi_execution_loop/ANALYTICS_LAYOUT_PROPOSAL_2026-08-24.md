# Entity 360 · analytical surfaces · Full Blotter — layout proposal (EL-V2-08, §14.5)

| Màn | Canvas (780 main @1440) | Tabs | Rail | Chart contract |
|---|---|---|---|---|
| Alpha 360 (2a·2b) | scope bar → deployment map (registry) → KPI 6 (theo scope) → **equity by stage** (`EquityChart`, tiêu đề mang scope) + **contribution per venue** (một chart/tiền tệ, không FX mix) → deployments in scope | 9 tab; **Insight Charts = 12 tile** mỗi tile `EquityChart` hoặc trạng thái INSUFFICIENT/UNAVAILABLE + envelope caption | (V2-09 sẽ đồng bộ rail chung cho 360) | tooltip · zoom · reset · expand · table · **export JSON** · **cross-filter từ table view** |
| Portfolio 360 (3a) | KPI 5 → holdings 4 tầng | Structure & Correlation: **heatmap** (tint theo \|ρ\| = swatch cạnh ô, số giữ nguyên chuỗi server, click ô → lens) + **influence map SVG** (node = alpha, cạnh = \|ρ\| ≥ 0.5 từ ma trận publish) + ρ timeline / drawdown overlap = honest state (BR-EX-34 §portfolio) + leaders | — | cell budget 4096, packed 150 giữ nguyên |
| Account & Broker 360 (1g) | guard band LIVE (1) → masthead (stage · sync · credential · headroom) → **triptych internal / physical / difference** (decision panel mặc định) → headroom banner | Binding & linked · Sync history · Findings | Next = headroom verdict + Sync now / Dry-run · Blockers = Δ ≠ MATCH, findings, credential · Provenance = external ref, digests | — |
| Full Blotter (4c) | scope → status chips → **Columns ▾ / Export loaded rows** → bảng (virtualized, keyset) → **footer tổng theo tiền tệ** (M7: rows · qty rows · notional rows tách, decimal string nguyên, invalid > 0 đỏ) → funnel dải ngang | — | — | cross-filter chip + reset giữ |

**Không tính tiền phía FE:** aggregates đọc từ fixture contract `execution-projection-page.valid.json` nguyên văn; heatmap/influence chỉ dùng `Number()` cho màu/hình học; contribution bars đặt bằng Number, nhãn = chuỗi server.

**Perf:** 10⁵ dòng → 41 `<tr>` resident (RESIDENCY_CAP 2000), render 8ms trong jsdom (test ghi log).
