# Backend request → @codex — 2026-08-25 · hi-fi V2 (Command Center 5a · Incident 4d · stage workbenches)

**Từ:** Claude (frontend lead). **Duyệt:** Bobby 2026-08-25 (*"viết request backend chi tiết cho codex"*).
**Địa chỉ theo luật (backend plan §7):** intake chính thức là **các hàng BR-EX-41…46 trong bảng §7.2 của
`portal-backend-plan/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`** (17 cột, `RECEIVED`,
đã ghi 2026-08-25). File này **không phải request file** — nó là **phụ lục schema đề xuất** cho các hàng đó;
`EXECUTION_SCALE_AND_REFINE.md` giữ spec gốc; `EXECUTION_REQUEST_LEDGER.md` §3 và `ROADMAP_FRONTEND.md`
§E.2 chỉ là gương trạng thái phía frontend. Mọi request theo template CLAUDE.md §5; schema chỉ là
**đề xuất** — codex quyết; frontend không tính số, không bịa state.

**Bối cảnh:** Bobby chốt hi-fi từng màn là chuẩn 100% (owner override 2026-08-25). Frontend đã dựng
đủ component cho 3 nhóm màn và đang chạy **smoke data có khai báo** (`*.smoke.ts`, cờ duy nhất, hợp
đồng xoá ở đầu file). Mỗi request dưới đây ghi rõ component tiêu thụ và file smoke sẽ **xoá** khi
codex giao fixture canonical vào `packages/contracts/fixtures/` (tên đề xuất theo quy ước hiện có
`execution-<area>.<variant>.valid.json`).

**Thứ tự ưu tiên (Claude đề xuất):** BR-EX-42 → 45 → 46 → 41 → 43 → 44 → 34/40.
Lý do: 42/45 mở khoá Command Center (màn đầu tiên Bobby duyệt); 46 mở khoá Incident (màn thứ hai);
41 mở 4 màn stage; 43 là stream dùng chung; 44 và 34/40 là hoàn thiện.

---

## BR-EX-42 · Pinned watchlist: stage · status · figure (Command Center 5a)

- **Endpoint/field cần:** `command-center.v1` → `pinned.items[]` thêm:
  `stage` (`PAPER|SANDBOX|LIVE_CANARY|LIVE_FULL`), `status` (`READY|HALTED|BLOCKED|DEGRADED`),
  `figure` (chuỗi đã format: `"+112"`, `"12/30d"`, `"cert 5/7"`), `figure_tone` (`good|warn|bad|mute`),
  `venue`, `deployment_id`. Giữ `label`, `target_label`, `target_authority`, `target_freshness`.
- **Lý do UI:** hàng pinned hi-fi = chip stage · `Grid v2.1 · BINANCE · dep_88` · figure · chip status.
  Model hiện chỉ có label/target_label → hàng in trùng "Carry v3.2 · Carry v3.2".
- **Ảnh hưởng hiện tại:** `/execution` panel Pinned — đang hiển thị bằng `commandCenter.smoke.ts`
  (`CC_PIN_EXTRA`). Frontend **không** suy stage từ id (rule §3.5).
- **Đề xuất schema:**
  ```json
  { "slot": 1, "entity_id": "dep_88", "label": "Grid v2.1", "stage": "LIVE_CANARY", "status": "READY",
    "figure": "+112", "figure_tone": "good", "venue": "BINANCE", "deployment_id": "dep_88",
    "href": "/deployments/live/dep_88/canary", "target_authority": "EXECUTION", "target_freshness": "FRESH" }
  ```
- **Fixture:** `execution-command-center.pinned.valid.json` — 3 dòng đúng hi-fi (dep_88 CANARY READY
  +112 · dep_74 PAPER READY 12/30d · dep_77 SANDBOX HALTED cert 5/7).
- **Tiêu thụ:** `PinnedWatchlist` (`screens/CommandCenter.tsx`). **Xoá smoke:** `CC_PIN_EXTRA`.

## BR-EX-45 · Promotion pipeline: funnel + ma trận alpha × stage (Command Center 5a)

- **Endpoint/field cần:** `GET /api/v1/execution/promotion-pipeline?window=90d` (hoặc panel `pipeline`
  trong `command-center.v1`).
- **Lý do UI:** panel "Promotion pipeline — alpha versions, all modes": funnel 4 cột (số version vào
  stage, tỉ lệ chuyển, "in stage now") + ma trận một hàng = một alpha version, ô = deployment ở stage
  (✓ link quyết định exit · ● đang ở stage · venue · ⏸ paused).
- **Ảnh hưởng hiện tại:** panel render bằng `CC_PIPELINE` smoke; **funnel đếm version, không đếm
  deployment** — server tính, frontend chỉ vẽ.
- **Đề xuất schema:**
  ```json
  { "window": "90d", "authority": "EXECUTION", "as_of": "2026-08-22T10:42:01Z", "source": "registry",
    "stages": [
      { "key": "PAPER", "entered": 8, "in_stage_now": 3, "halted": 0, "conversion": null, "notes": [] },
      { "key": "SANDBOX", "entered": 5, "in_stage_now": 2, "halted": 1, "conversion": { "num": 5, "den": 8 }, "notes": ["1 HALTED"] },
      { "key": "CANARY", "entered": 3, "in_stage_now": 2, "halted": 0, "conversion": { "num": 3, "den": 5 }, "notes": ["d9/14", "d2/14"] },
      { "key": "LIVE", "entered": 2, "in_stage_now": 2, "halted": 0, "conversion": { "num": 2, "den": 3 }, "notes": [] } ],
    "rows": [ { "alpha_version_id": "av_2041", "alpha_label": "Grid v2.1", "href": "/deployments/alphas/av_2041",
      "cells": { "PAPER": { "kind": "done", "decision_id": "PX-22", "progress_label": "30/30 gate met", "venue": "DERIBIT", "ref": "EX-771" },
                 "SANDBOX": { "kind": "done", "decision_id": "SX-14", "venue": "OKX", "paused": true },
                 "CANARY": { "kind": "current", "progress_label": "d9/14", "venue": "BINANCE", "href": "/deployments/live/dep_88/canary" },
                 "LIVE": { "kind": "done", "decision_id": "CX-08", "progress_label": "08-01" } } } ] }
  ```
- **Fixture:** `execution-promotion-pipeline.valid.json` (4 hàng như hi-fi). **Tiêu thụ:**
  `PromotionPipeline`. **Xoá smoke:** `CC_PIPELINE`.

## BR-EX-46 · Incident Detail v2 (WF 4d): market band · evidence facts · resolve budget · gate rows

- **Endpoint/field cần:** mở rộng `incident-detail.v1`:
  - `subject`, `opened_at`, `owner`, `origin` (`alert|manual`), `sla_ack { minutes, met }`;
  - `resolve_budget { seconds, started_at }`;
  - `market { symbol, last_price, prev_price, spark[≤48], unreconciled { qty, unit }, as_of }` — **stream**
    (SSE `market.tick`, xem BR-EX-43) hoặc poll ≤1.4s; Δ tiền = qty × last_price ghi rõ
    `derived_display: true` nếu server không tính;
  - `evidence_facts[ { key: finding|sync_snapshots|blast_radius|probable_cause, text, link { label, href }, emphasis } ]`;
  - `operations_taken[ { at, operation_id, command, status: VERIFIED|AWAITING_APPLY, note, href } ]`,
    `apply_plan { label, href }`;
  - `resolution_gates[ { key, state: done|open|waiting, text, link } ]` — bản "lời" của
    `resolution_gate.blocker_codes`, vẫn server-enforced;
  - `timeline_lines[ { at, text } ]`, `waiting_line`,
    `resolved { resolved_in, resolved_at, timeline_tail, footer_note }`.
- **Lý do UI:** màn "sửa trong lúc thị trường chạy" — dải Market live (giá tick, sparkline, Δ re-price),
  Evidence 4 dòng, Operations taken có chip trạng thái, 5 gate bằng lời, Timeline. Contract hiện chỉ có
  state/gate code/hash/op id.
- **Ảnh hưởng hiện tại:** `/execution/operations/incidents/:id` chạy bằng `incident.smoke.ts`
  (`INCIDENT_SMOKE`), motion theo hi-fi (clock 1s, price 1.4s).
- **Fixture:** `execution-incident-detail.open.valid.json` và `.resolved.valid.json` (hai demo state
  của hi-fi). **Tiêu thụ:** `IncidentDetailScreen`. **Xoá smoke:** `incident.smoke.ts`.

## BR-EX-41 · Stage telemetry (Paper · Sandbox · Canary · Live)

7 mục (41.1–41.7) đã ghi chi tiết ở `EXECUTION_SCALE_AND_REFINE.md`. Tóm tắt endpoint:
`GET /deployments/{id}/stage-equity` · `/envelope-consumption` · `/execution-quality` · `/positions` ·
`/contribution` · `sandbox-certification.v1.order_types[]` · KPI null-fill.
**Tiêu thụ:** `StageLinesChart`, `CapGauges`, `HistogramChart`, `SparkTile`, `PositionsTable`,
`DailyBarsChart`, `OrderTypeMatrix`. **Xoá smoke:** `stage.smoke.ts` (`STAGE_SMOKE`).

## BR-EX-43 · Alerts summary + market stream (shell)

- `GET /api/v1/execution/alerts/summary` → `{ critical, high, as_of, href }` (ETag, `no-cache,
  must-revalidate`) cho chip `⚑ Alerts · n critical` ở topbar, và sidebar badge đỏ trên mục Alerts.
- SSE `alerts.summary` + `market.tick` khi realtime bật — dùng chung cho Incident (BR-EX-46) và
  Command Center (đồng hồ `as_of`, tuổi hàng triage). **Xoá smoke:** `CC_SMOKE_MOTION`.

## BR-EX-44 · Fleet health cells: sub-note · tone · href

`fleet.cells[]` thêm `sub` (`"d9/14"`, `"1 HALTED"`), `sub_tone`, `tone` (`bad` khi Live có DEGRADED),
`href` tới danh sách stage. **Xoá smoke:** `CC_FLEET_EXTRA`.

## BR-EX-34 / BR-EX-40 · Series theo tile + kiểu chart (Alpha 360 Insight)

Đã ghi trước; nhắc lại vì 9/12 tile đang là smoke (`alpha360.smoke.ts`). 40 cần `tile_kind`
(`line|histogram|funnel|waterfall|heatmap|bar`) — frontend hiện chỉ có line.

---

## Yêu cầu chung cho mọi gói

1. **Fixture canonical** vào `packages/contracts/fixtures/` + schema; frontend regenerate
   `packages/contracts/generated/portal-api.d.ts` (`cd packages/contracts && npm run generate`).
2. **Giá trị = chuỗi decimal đã format** (rule §3.3); `null` giữ `null`, không 0; `figure`/`progress_label`
   là chuỗi hiển thị do server quyết.
3. **Envelope §16.2** cho mọi series (authority, as_of, window, interval, rows, coverage, warnings).
4. **Handoff kèm "Required frontend tests"** như F0–F4 để tôi đối chiếu từng dòng (CLAUDE.md §7.8).
5. Khi giao: ghi `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` vào `EXECUTION_REQUEST_LEDGER.md` §3;
   tôi xoá file smoke tương ứng **trong một commit**, re-record baseline màn đó, tick
   `DESIGN_GRAMMAR_V3.md` §8.

---

# Phụ lục A — bảng field chi tiết (để codex không phải đoán)

Quy ước: `type` theo JSON; `null?` = có được null không (null luôn giữ null, frontend in "not published");
`authority` theo §7.1 bước 3 của backend plan; `ví dụ` lấy từ hi-fi. Enum viết đúng chữ hoa như hi-fi.

## A.42 · `command-center.v1` → `pinned.items[]`

| field | type | null? | authority | ví dụ | ghi chú |
|---|---|---|---|---|---|
| `slot` | int 1–5 | no | PORTAL_CONTROL | `1` | thứ tự user-owned |
| `entity_id` | string | no | PORTAL_CONTROL | `"dep_88"` | |
| `label` | string | no | PORTAL_PROJECTION | `"Grid v2.1"` | tên alpha version |
| `stage` | enum `PAPER\|SANDBOX\|LIVE_CANARY\|LIVE_FULL` | no | PORTAL_PROJECTION | `"LIVE_CANARY"` | frontend hiển thị `CANARY` cho `LIVE_CANARY`, `LIVE` cho `LIVE_FULL` |
| `status` | enum `READY\|HALTED\|BLOCKED\|DEGRADED` | no | PORTAL_PROJECTION | `"READY"` | chip phải; HALTED vàng, BLOCKED/DEGRADED đỏ |
| `figure` | string | yes | DERIVED | `"+112"`, `"12/30d"`, `"cert 5/7"` | đã format; **không** là số để frontend không format lại |
| `figure_tone` | enum `good\|warn\|bad\|mute` | yes | DERIVED | `"good"` | null → mute |
| `figure_formula_version` | string | yes | DERIVED | `"pnl_6d.v1"` | bắt buộc nếu figure là số tiền/PnL |
| `venue` | string | yes | TRADING_SYSTEM | `"BINANCE"` | |
| `deployment_id` | string | yes | PORTAL_CONTROL | `"dep_88"` | |
| `href` | string (route Portal) | no | PORTAL_CONTROL | `"/deployments/live/dep_88/canary"` | route theo stage |
| `target_authority` / `target_freshness` | như hiện tại | — | — | — | giữ |

Hi-fi 3 dòng: (1) `LIVE_CANARY · Grid v2.1 · BINANCE · dep_88 · "+112" good · READY`; (2) `PAPER · Carry v3.2 ·
BINANCE · dep_74 · "12/30d" mute · READY`; (3) `SANDBOX · Carry v3.2 · OKX TESTNET · dep_77 · "cert 5/7" mute · HALTED`.

## A.44 · `command-center.v1` → `fleet.cells[]`

| field | type | null? | authority | ví dụ |
|---|---|---|---|---|
| `code` / `label` / `value` / `href` | như hiện tại | — | — | `"Canary"`, `1` |
| `sub` | string | yes | PORTAL_PROJECTION | `"d9/14"` (Canary), `"1 HALTED"` (Sandbox), `"7/8"` (Broker sync = OK/total) |
| `sub_tone` | enum good\|warn\|bad\|mute | yes | PORTAL_PROJECTION | `"warn"` |
| `tone` | enum good\|warn\|bad\|mute | yes | PORTAL_PROJECTION | `"bad"` khi Live có ≥1 DEGRADED; `"warn"` khi Broker sync < total |

Hi-fi: `LIVE 2 (bad)`, `CANARY 1 d9/14`, `SANDBOX 2 · 1 HALTED (warn)`, `PAPER 3`, `BROKER SYNC 7/8 (warn)`, `FINDINGS 1 (bad)`.

## A.45 · `GET /api/v1/execution/promotion-pipeline?window=90d`

Response root:

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `window` | string | no | — | `"90d"` (cho phép 30d/90d/180d) |
| `authority` | `EXECUTION` | no | PORTAL_PROJECTION | |
| `as_of` | ISO-8601 Z | no | | |
| `source` | string | no | | `"registry"` |
| `completeness` | enum `COMPLETE\|PARTIAL` | no | | PARTIAL khi thiếu decision id cho ≥1 ô |
| `stages[]` | 4 phần tử, thứ tự `PAPER,SANDBOX,CANARY,LIVE` | no | | |
| `stages[].key` | enum | no | | |
| `stages[].entered` | int | no | PORTAL_PROJECTION | **đếm alpha version** vào stage trong window; 1 version trên 2 venue = 1 |
| `stages[].in_stage_now` | int | no | | `3` |
| `stages[].halted` | int | no | | `1` |
| `stages[].conversion` | `{num:int, den:int}` | yes (null ở PAPER) | DERIVED | `{5,8}` → frontend in `5/8 ↗ 63%`; server không cần gửi % |
| `stages[].notes[]` | string[] | no | | `["1 HALTED"]`, `["d9/14","d2/14"]` |
| `rows[]` | ≤200 (keyset `cursor` nếu hơn) | no | | một hàng = một alpha version |
| `rows[].alpha_version_id` / `alpha_label` / `href` | string | no | PORTAL_CONTROL | `"av_2041"`, `"Grid v2.1"`, `"/deployments/alphas/av_2041"` |
| `rows[].cells.{PAPER,SANDBOX,CANARY,LIVE}` | object | no | | luôn đủ 4 key |
| `cells[].kind` | enum `done\|current\|none` | no | PORTAL_PROJECTION | |
| `cells[].decision_id` | string | yes | PORTAL_CONTROL | `"PX-22"`, `"SX-14"`, `"CX-08"` — ✓ link quyết định exit (done) |
| `cells[].progress_label` | string | yes | DERIVED | `"30/30 gate met"`, `"d9/14"`, `"cert 5/7"`, `"12/30"`, `"08-01"` |
| `cells[].venue` | string | yes | TRADING_SYSTEM | `"DERIBIT"`, `"OKX-T"` |
| `cells[].ref` | string | yes | PORTAL_CONTROL | `"EX-771"` (exit review id) |
| `cells[].paused` | bool | no | PORTAL_PROJECTION | `true` → ⏸ |
| `cells[].href` | string | yes | | route tới deployment/decision |

Hi-fi 4 hàng: Grid v2.1 (PAPER done PX-22 · SANDBOX done SX-14 OKX ⏸ · CANARY current d9/14 BINANCE · LIVE done 08-01 CX-08);
Carry v3.2 (PAPER current 12/30 BINANCE · SANDBOX current cert 5/7 OKX-T · none · none); MM v1.1 (done PX-31 · done 07-22 ·
current d2/14 BINANCE · none); VnMomo v0.9 (current 6/30 VN MARKET · none · none · none).

## A.46 · `incident-detail.v1` — trường bổ sung

| field | type | null? | authority | ví dụ |
|---|---|---|---|---|
| `subject` | string | yes | PORTAL_CONTROL | `"position MISMATCH · acct-live-grid-v21 · BINANCE"` |
| `opened_at` | ISO Z | no | PORTAL_CONTROL | `"2026-08-22T10:41:52Z"` (frontend in `10:41:52Z`) |
| `owner` | string | yes | PORTAL_CONTROL | `"Stan"` |
| `origin` | enum `alert\|manual\|system` | no | PORTAL_CONTROL | `"alert"` |
| `sla_ack` | `{minutes:int, met:bool, at:ISO?}` | yes | PORTAL_CONTROL | `{5,true}` → `SLA ack 5m ✓` |
| `resolve_budget` | `{seconds:int, started_at:ISO}` | yes | PORTAL_CONTROL | `{14400, opened_at}` → `resolve budget 4h — 3h 17m left` + thanh |
| `market` | object | yes | TRADING_SYSTEM | xem A.43 `market.tick`; snapshot tại read_at nếu không stream |
| `market.unreconciled` | `{qty:string decimal, unit:string}` | yes | TRADING_SYSTEM | `{"0.0200","BTC"}` |
| `market.delta_value` | `{value:string decimal, currency:string, derived_display:bool}` | yes | DERIVED | `{"1229.71","USD",true}` — nếu server không tính, frontend nhân qty×price và **ghi rõ derived** |
| `evidence_facts[]` | ≤6 | no | | |
| `evidence_facts[].key` | enum `finding\|sync_snapshots\|blast_radius\|probable_cause\|other` | no | | |
| `evidence_facts[].text` | string | no | TRADING_SYSTEM/PORTAL_PROJECTION | `"BTCUSDT local 0.4000 vs broker 0.3800 · Δ 0.0200"` |
| `evidence_facts[].link` | `{label, href}` | yes | | `{"rf_2101","/deployments/blotter?finding=rf_2101"}` |
| `evidence_facts[].emphasis` | enum `bad\|warn\|none` | no | | `MISMATCH` đỏ |
| `operations_taken[]` | ≤20 | no | PORTAL_CONTROL | |
| `operations_taken[].at` / `operation_id` / `command` / `href` | | | | `"10:42:10"`, `"op_1252"`, `"deployment.halt dep_88"` |
| `operations_taken[].status` | enum `VERIFIED\|AWAITING_APPLY\|APPLYING\|FAILED\|PARTIAL` | no | | `AWAITING_APPLY` nhấp nháy |
| `operations_taken[].note` | string | yes | | `"positions_v2 → broker · sync → OK"` |
| `apply_plan` | `{label, href, operation_id}` | yes | PORTAL_CONTROL | `{"Open apply plan — reconcile from broker","/administration/actions?operation=op_1253"}` — null khi không có plan chờ |
| `resolution_gates[]` | đúng 5, thứ tự cố định | no | PORTAL_CONTROL | key: `halted`, `fresh_sync`, `dry_run_clean`, `apply_verified`, `reason_recorded` |
| `resolution_gates[].state` | enum `done\|open\|waiting` | no | | `waiting` = chờ gate trước |
| `resolution_gates[].text` | string | no | | `"deployment halted — no new exposure"` |
| `resolution_gates[].link` | `{label, href}` | yes | | `{"op_1252", ...}` |
| `resolution_gates[].blocker_code` | string | yes | | ánh xạ 1-1 với `resolution_gate.blocker_codes` — **gương, không phải nguồn** |
| `timeline_lines[]` | ≤50 | no | PORTAL_CONTROL | `{at:"10:41:52", text:"alert raised — sync snapshot flagged MISMATCH · risk fail-closed for dep_88"}` |
| `waiting_line` | string | yes | | `"waiting on apply — every minute here is a minute of frozen live capital"` (chỉ khi OPEN) |
| `resolved` | object | yes (null khi chưa RESOLVED) | PORTAL_CONTROL | `{resolved_in:"21m 20s", resolved_at:"11:03", timeline_tail:"…", footer_note:"dep_88 still HALTED — resume deliberately left to the operator (fresh sync required)"}` |

Hai fixture: `execution-incident-detail.open.valid.json` (2/5 gates, op_1253 AWAITING_APPLY) và
`.resolved.valid.json` (5/5, op_1254 VERIFIED, resolved 11:03:12).

## A.43 · alerts summary + SSE

`GET /api/v1/execution/alerts/summary` → `{ "critical": 1, "high": 2, "open": 3, "as_of": ISO, "href": "/execution/operations?view=alerts", "freshness": "FRESH|STALE" }`.
SSE (khi realtime bật): `event: alerts.summary` cùng body; `event: market.tick`
`{ "symbol":"BTCUSDT", "last_price":"61485.74", "prev_price":"61463.10", "as_of":ISO, "source":"TRADING_SYSTEM_MARKET_FEED" }`
(decimal string, ≤1 tick/1.4s/symbol, ≤3 symbol/màn). Frontend không bao giờ dựng giá; thiếu stream → không có chip/không có dải market.

## A.41 · stage telemetry (7 endpoint) — shape từng response

- **41.1** `GET /deployments/{id}/stage-equity?window=30d&bucket=1h` → `{ lines:[{stage:"live|paper|sandbox|backtest", label, style_hint:"solid|dashed|dotted", points:[{bucket_start, value:string}]}], joined_by:{artifact_digest, run_id}, envelope }` — `value` chuẩn hoá 100 tại điểm đầu; gap = điểm thiếu, không nội suy.
- **41.2** `GET /deployments/{id}/envelope-consumption` → `{ caps:[{key, label, used:string, cap:string, unit, kind:"cap|target", warn_at:number, as_of}], envelope }` — `kind:target` (30/30 days) không phải breach.
- **41.3** `GET /deployments/{id}/execution-quality?window=30d` → `{ ack_latency:{buckets:[{from_ms,to_ms,count}], p50_ms, p95_ms}, fill_latency_p50_ms, slippage_bp:[{day,value:string}], reject_rate:[{day,value:string}], ceilings:{slippage_bp:string, reject_rate:string}, envelope }`.
- **41.4** `GET /deployments/{id}/positions` → `{ rows:[{symbol, side:"LONG|SHORT", qty:string, entry:string, upnl:string, leverage:string?, ack_latency_p50_ms:int?}], open_orders:int, fills_today:int, rejects:int, as_of, digest, authority:"BROKER" }` keyset ≤500.
- **41.5** `GET /deployments/{id}/contribution?window=30d` → `{ bars:[{day, value:string, currency}], total:string, formula_version:"contrib.v1", envelope }`.
- **41.6** `sandbox-certification.v1.order_types[]` → `[{type:"MARKET|LIMIT|STOP|TAKE_PROFIT|TIF", state:"certified|pending|untested", note}]`.
- **41.7** KPI null-fill: `capital_consumed`, `gross_notional`, `daily_pnl`, `open_orders`, `broker_equity` publish `value:string` + `unit`; `suppressed:true` giữ nguyên nghĩa (không fill).

## A.47 · `operations-queue.v1` — Operations Queue v2 (WF 4e)

Row (mỗi `operation_id`):

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `priority` | enum `P1\|P2\|P3` | no | DERIVED (server) | `= f(severity, age, blast_radius)`; frontend không tính |
| `phases[]` | `[{phase: plan\|apply\|verify, mark: done\|active\|pending\|failed}]` | no | PORTAL_PROJECTION | luôn 3 phần tử |
| `state_chip` | `{label, tone: warn\|accent\|good\|mute, pulse: bool}` | no | PORTAL_PROJECTION | `"PARTIAL 1/2"` warn pulse · `"AWAITING_APPLY"` warn · `"RUNNING · 2/3"` accent · `"VERIFIED"` good |
| `age_seconds` | int | no | PORTAL_PROJECTION | frontend +1/s |
| `age_tone` | enum warn\|mute | no | | warn khi PARTIAL |
| `next_step` | `{label, href}` | no (href null = watch) | PORTAL_CONTROL | `{"review in incident inc_44 →","/execution/operations/incidents/inc_44"}` |
| `detail_parts[]` | `[{text, tone: warn\|bad\|link\|null, href, live: escalate\|plan_expiry\|null}]` | no | mixed | `"✗ close ETHUSDT — venue reject (post-only)"` warn |
| `sub_intents` | `{done:int, total:int, progress_pct:int}` | yes | TRADING_SYSTEM | `{2,3,66}` |
| `escalate_at` | ISO | yes | PORTAL_CONTROL | PARTIAL >15m → CRITICAL alert |
| `plan_expires_at` | ISO | yes | PORTAL_CONTROL | expired plans regenerate, never auto-apply |
| `incident_id` | string | yes | PORTAL_CONTROL | BR-EX-33 |

Root: `kpis[]` (`partial`, `awaiting_apply`, `running`, `verified_24h` + `failed_24h`, `dead_letters_24h`),
`throughput_verified_per_hour[24]` (int[]), `source{authority, journal, live, as_of}`, `attention_count`.
Alerts: `GET /api/v1/execution/alerts?limit=20` như trên. Fixtures: `execution-operations-queue.attention.valid.json`,
`execution-alerts.valid.json`. Tiêu thụ: `OperationsQueueScreen` (smoke `operationsQueue.smoke.ts`).

