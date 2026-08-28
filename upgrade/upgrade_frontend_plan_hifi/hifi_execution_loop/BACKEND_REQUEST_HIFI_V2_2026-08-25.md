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

## A.48 · `blotter-orders.v1` — Full Blotter v2 (WF 4c)

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `client_order_id` | string | yes | TRADING_SYSTEM | `"grid-v21-sl-0088"` |
| `order_type` | enum `LIMIT\|MARKET\|STOP_MKT\|STOP_MARKET\|TAKE_PROFIT\|TRAILING_STOP_MKT\|BRACKET` | no | TRADING_SYSTEM | |
| `tif` | enum `GTC\|IOC\|FOK\|DAY` | yes | TRADING_SYSTEM | |
| `flags[]` | enum[] `REDUCE_ONLY\|POST_ONLY\|BUY\|SELL` | no | TRADING_SYSTEM | side là flag để hiển thị chip |
| `price` / `trigger_price` | string decimal | yes | TRADING_SYSTEM | cột "price / trigger" = `price ?? "—"` + `/` + `trigger_price ?? "—"` |
| `trigger_source` | enum `mark\|last\|index` | yes | | |
| `oco_with` / `bracket_group_id` / `risk_grant_id` | string | yes | TRADING_SYSTEM / PORTAL_CONTROL | `"ord_8843"`, `"br_0088"`, `"rg_2210"` |
| `qty_filled` / `qty_total` | string decimal | no | TRADING_SYSTEM | precision theo venue lot |
| `avg_price` | string | yes | TRADING_SYSTEM | |
| `slippage_bp` | string signed | yes | DERIVED (`slippage.v1`) | `"-1.9"` |
| `fee` | `{amount:string, currency, liquidity: maker\|taker}` | yes | TRADING_SYSTEM | không quy đổi |
| `fill_count` | int | no | | |
| `status` | enum hiện tại + `ACTIVE` (bracket), `CREATED` | no | | |
| `age_seconds` | int | no | PORTAL_PROJECTION | |
| `detail` | string | yes | server | một dòng dưới hàng |
| `reject{gate_id, reason}` | object | yes | PORTAL_CONTROL | hàng REJECTED đỏ |

Legs / fills / lineage: xem BR-EX-48 trong `EXECUTION_SCALE_AND_REFINE.md`. Fixture:
`execution-blotter-orders.hifi.valid.json`. Tiêu thụ: `FullBlotter` (`leadingRows` smoke `blotter.smoke.ts`).

## A.49 · `fleet-list.v1` — Alpha Fleet (entry WF 2a)

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `summary` | `{alphas:int, deployments:int, live:int}` | no | PORTAL_PROJECTION | `6 · 8 · 2` |
| `kpis.live_exposure` | `{value:string, ccy, physical:string, account}` | yes | TRADING_SYSTEM / BROKER | `41,000 USDT vs physical 43,120 · binance_main_01` |
| `kpis.fleet_pnl_session` | `{value:string, ccy, live:bool}` | yes | DERIVED | re-prices per tick |
| `kpis.attention` | `{mismatch:int, halted:int, gate_overdue:int}` | no | PORTAL_CONTROL | |
| `counts` | `{all,live,canary,sandbox,paper,research}` | no | PORTAL_PROJECTION | chip counts |
| `rows[].stage_presence[]` | `[{stage, label, strong, dashed}]` | no | PORTAL_PROJECTION | `"⛨ CANARY d9/14"` strong |
| `rows[].net_pnl_30d` | `{value, ccy, note}` | yes | DERIVED | `note: "+1,842.00 USDC paper — not summed"` |
| `rows[].equity_30d` | `string[]` (10–30 điểm) | yes | DERIVED (`equity_projection.v1` downsample, extrema kept) | sparkline |
| `rows[].health` | `{text, tone: good\|warn\|bad\|mute, link{label,href}}` | no | PORTAL_CONTROL | `"R2 AP-352 OVERDUE 26h"` |
| `rows[].deployments[]` | xem BR-EX-49 | no | mixed | 0 với research row |

## A.50 · `replay.v1` — Trade Replay

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `candles[]` | `[{t:ISO, o,h,l,c: string}]` ≤ 2,000 | no | TRADING_SYSTEM (venue OHLC) | 1h; last bucket live |
| `markers[]` | `[{t, index, kind, price, order_id, fill_id?, bracket_group_id?}]` | no | TRADING_SYSTEM | kind enum ở BR-EX-50 |
| `round_trips[]` | `[{entry_index, entry_price, exit_index, exit_price, pnl{value,ccy}, kind}]` | no | DERIVED | |
| `legs[]` | `[{role, order_id, trigger_price, order_type, flags[], filled, total, activation_policy}]` | no | TRADING_SYSTEM | dashed levels |
| `mark` | `{price:string, at}` | yes | TRADING_SYSTEM tick (BR-EX-43) | |
| `job` | `{id, table:"execution_replay_jobs", status}` | yes | PORTAL_CONTROL | `erj_112` |
| `log[]` | `[{t, event, order_id, fill_id?, leg?, type, side, qty, price_or_trigger, fee{amount,liquidity}?, note}]` | no | TRADING_SYSTEM | keyset ≤200 |

## A.51 · `portfolio-360.v1.1` — Portfolio 360 v2 (WF 3a)

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `status` | enum `ACTIVE\|PAUSED\|CLOSED` | no | PORTAL_CONTROL | chip xanh ● ACTIVE |
| `strip.nav` | `{value:string, ccy, as_of, live:bool}` | no | DERIVED (marks) | re-price per tick |
| `strip.today` | `{value:string}` | yes | DERIVED | `+486.20` |
| `strip.return_30d` | `{value, benchmark_value, alpha}` | yes | DERIVED (`twr.v1`) | `+1.86% · bm +0.9% · α +0.96%` |
| `strip.max_dd_30d` | `{value, limit, headroom_pt}` | yes | DERIVED + PORTAL_CONTROL (limit) | `−1.6% · limit −5.0% · headroom 3.4pt` |
| `strip.attention` | `{mismatch:int, incident_id, note}` | no | PORTAL_CONTROL | `inc_44 · orders fail-closed` |
| `equity_segmented.windows[]` | `{key, label, nav[], benchmark[], eras[]}` | no | DERIVED (`twr.v1`) + PORTAL_CONTROL (revisions) | ≤ 400 điểm/window, 1d |
| `eras[]` | `{rev:int, from, to, label, tone}` | no | PORTAL_CONTROL | era = revision in force |
| `cross_portfolio[]` | xem BR-EX-51 | no | DERIVED | same window, same formulas; sleeve rows `sleeve:"VND"` |
| `cross_corr` | `{pair:[a,b], rho:string, window, note}` | yes | DERIVED (`corr.v1`) | |
| `config_log[]` | `{rev, current, retired, date, change, detail, account_id, operation_id, approval_id, actor, since_rev_pnl{value,ccy}}` | no | PORTAL_CONTROL | append-only |
| `what_if[]` | `{scenario, estimate_text, headline, formula}` | yes | DERIVED (`marginal.v1`) | labeled estimates |
| `symbol_overlap[]` | `{symbol, alphas[], same_direction_notional, tone}` | no | DERIVED | |

## A.52 · `bindings-list.v1` — Accounts & Bindings (entry WF 1g)

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `rows[].env` | enum `MAINNET\|TESTNET\|PAPER_FEED` | no | PORTAL_CONTROL (`venue_accounts`) | chip màu theo env |
| `rows[].credential` | `{alias, state: VALID\|EXPIRING\|OTP_FLOW\|REVOKED, days_to_expiry?, scopes[], withdraw:false, rotate_href?}` | no | PORTAL_CONTROL (`venue_credentials`) | secret không bao giờ trả |
| `rows[].physical_equity` | `{value,ccy}` \| `{kind: TEST_FUNDS\|SIMULATED}` | no | BROKER | test funds/simulated không có số |
| `rows[].virtual` | `{sum, ccy, headroom}` | yes | PORTAL_PROJECTION | headroom = physical − Σ virtual |
| `rows[].sync` | `{kind: ws\|rest\|md_feed\|calendar, age_seconds, policy_seconds, snapshot_minutes?, state}` | no | BROKER sync | `"ws 4.1s / 5s + 5m snap"` |
| `rows[].virtual_accounts[]` | xem BR-EX-52 | no | mixed | |

## A.53 · `binding-detail.v1` — Binding Detail

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `capital.segments[]` | `[{account_id, label, allocated}]` | no | PORTAL_PROJECTION | bar theo tỉ lệ allocated/physical |
| `credential.secret` | `{fingerprint, vaulted:true}` | no | PORTAL_CONTROL | chỉ fingerprint |
| `credential.ip_allowlist` | `{count, last_drift_check_at, state}` | yes | PORTAL_CONTROL | |
| `credential.rate_budget` | `{used_per_min, limit_per_min, order_budget_pct}` | yes | `venue_rate_limits` | |
| `sync_stream[]` | `[{t, state, digest, note, finding_id?, incident_id?}]` | no | BROKER sync snapshots | immutable evidence |
| `audit[]` | `[{t, text, operation_id, approval_id?, actor, step_up}]` | no | `audit_log` | credential & structure only |

## A.54 · `account-broker-360.v1.1` — Account/Broker 360 (WF 1g)

Additive: `masthead{env, sync{state,age_seconds}, headroom_state, facts}`, `internal.cash_free`, `internal.locked_reserved`, `broker.source`, `difference.rows[].severity`, `findings.history_href`. Còn lại contract v1 đã có.

## A.55 · `entity-names.v1` — display names for breadcrumbs / mastheads

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `[].id` | string | no | — | echo id yêu cầu |
| `[].kind` | enum `alpha\|deployment\|account\|binding\|portfolio\|incident\|approval\|exit_review` \| null | no | PORTAL_PROJECTION | null khi không tìm thấy |
| `[].label` | string \| null | no | registry/strategies/… | `"Grid v2.1"`, `"acct-live-grid-v21"` (account label = id) |
| `[].sub` | string | yes | | `"BINANCE · canary"` cho deployment |
| `[].href` | string | yes | | route canonical |
| `[].env` | enum | yes | | LIVE/MAINNET tô đỏ trên chip crumb |

## A.56 · `live-overview.v1` — Live Overview (entry WF 1f/1e)

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `kpis.live_capital` | `{value, full, canary_envelope, ccy}` | no | PORTAL_PROJECTION (allocations) | `46,000 = 41,000 + 5,000` |
| `kpis.session_pnl` | `{value:string, live:true}` | yes | DERIVED (marks per tick) | fees included |
| `kpis.fail_closed` | `{n, of, deployment_id, incident_id}` | no | PORTAL_CONTROL | pulse khi n>0 |
| `kpis.protective_ladder` | `{state: ARMED\|DEGRADED, steps: [halt, reduce, close]}` | no | PORTAL_CONTROL | "always open" |
| `rows[].health.state` | enum `READY\|FAIL_CLOSED\|DEGRADED` | no | PORTAL_CONTROL + recon | FAIL_CLOSED = MISMATCH hoặc broker STALE quá policy |
| `rows[].pulse_60m` | `string[24]` | yes | DERIVED | 60 phút, 2.5 phút/điểm |
| `tape[]` | `[{t, deployment_id, event, text, tone}]` | no | `fills` + `broker_account_sync_snapshots` + incidents | SSE `live.tape` |

## A.57 · `live-full.v1.1` — Live Full Operations (WF 1f)

Additive: `masthead`, `meta`, `lifecycle[] + current`, `kpis`, `broker_truth` (kể cả `mismatch` object), `open_exposure`, `incidents{ladder, last_operation}`, `contribution_30d` — chi tiết ở BR-EX-57. Mọi số là chuỗi decimal; `lifecycle[].decision_id` phải tồn tại trong approvals/exit reviews (test).

## A.59 · `canary-control-room.v1.1` — Canary Control Room (WF 1e)

| field | type | null? | authority | ví dụ / rule |
|---|---|---|---|---|
| `masthead.readiness` | enum `GUARDED\|DEGRADED` | no | PORTAL_CONTROL + broker sync | DEGRADED khi sync STALE > policy → scale blocked, protective open |
| `masthead.trial` / `exit_review_at` | `{day,total}` / ISO | no | PORTAL approvals (AP-311 conditions) | countdown server timestamp |
| `stage_lines` | `{backtest[{t,v}], paper[{t,v}], live[{t,v}], canary_start_at, join_digest}` | yes | DERIVED (`equity_projection.v1`) | 3 series cùng digest; normalized 1.0 |
| `envelope.rows[]` | `[{key, used, cap, pct, at_cap}]` | no | `risk_grants`/`risk_profiles` + PORTAL | `at_cap` → amber |
| `trial_timeline.checkpoints[]` | `[{day, review_id, verdict}]` | no | PORTAL exit reviews (`cr_*`) | recorded reviews, not auto-gates |
| `exit_readiness.gates[]` | `[{key, ok, text, ref}]` | no | PORTAL_CONTROL (server-enforced, mirror only) | `request_exit_review.enabled` chỉ khi done==total hoặc waiver |
| `marginal` | `{corr_portfolio{value,samples,window}, corr_benchmark, concentration_if_scaled{factor, top1_pct}, grade}` | yes | DERIVED (`marginal.v1`, `corr.v1`) | grade C khi < 30d |
| `decision.options[]` | enum | no | PORTAL_CONTROL | mỗi option = plan → apply → verify + dual approval |

---

# Phụ lục B — Definition of Ready (§5.1 backend plan) điền sẵn cho từng gói

Codex chỉ cần xác nhận/sửa từng ô; ô nào tôi không có quyền quyết ghi **[codex quyết]**.

| Gói | Owner · env | Authority & scope R/W | Schema rev · compat | Scale/cardinality/freshness/completeness | Auth/RBAC/SoD | Failure/unavailable/rollback | External/Bobby dependency | Test corpus & exit evidence |
|---|---|---|---|---|---|---|---|---|
| **42** pinned | Codex · Portal `dev` profile fixture→shadow | READ; PORTAL_PROJECTION (stage/status) + DERIVED figure | `command-center.v1` → v1.1 additive (new optional fields; old clients ignore) | ≤5 pins/user; freshness = snapshot `read_at`; completeness per pin (`target_available`) | reader: any Execution viewer; no write | pin target unavailable → row dashed (today); figure null → `—` | none | fixture `execution-command-center.pinned.valid.json`; schema test; frontend `commandCenter.test` pinned cases |
| **44** fleet | Codex · same | READ; PORTAL_PROJECTION | `command-center.v1.1` additive | 6 cells; `read_at` | any viewer | cell null → `—` | none | fixture busy/quiet updated |
| **45** pipeline | Codex · same | READ; PORTAL_PROJECTION over registry + PORTAL_CONTROL decision ids | new `promotion-pipeline.v1` (OpenAPI path below) | ≤200 versions/90d, keyset `cursor` >50; `read_at`; `completeness` PARTIAL when a decision id missing | any viewer | route unavailable → panel state; partial → `kind:none` + warning | BR-EX-30/35 for decision ids | fixture `execution-promotion-pipeline.valid.json`; server-side conversion/version-count tests; frontend `commandCenter.test` pipeline cases |
| **43** alerts+ticks | Codex (summary/SSE) · Trading System owner (market feed) · `dev` shadow first | READ; PORTAL_PROJECTION (alerts) · TRADING_SYSTEM (market) | new `alerts-summary.v1`; SSE events `alerts.summary`, `market.tick` on the existing channel (N08) | summary ≤1/30s/user; tick ≤1/1.4s/symbol ≤3/screen; freshness = `as_of`; `freshness: FRESH\|STALE` | any viewer; stream needs session (typed 401 = existing corpus) | summary absent → chip hidden; tick absent → band shows last as_of + STALE; never 0 | **N08 activation approval (Bobby)**; market feed contract (`EXTERNAL_CONTRACT_PENDING`) | fixture `execution-alerts-summary.valid.json`; SSE corpus (gap/backpressure/auth_expired) reused |
| **46** incident v2 | Codex (Portal fields) · Trading System owner (finding/snapshot routes §6.5) · `dev` | READ; PORTAL_CONTROL (incident/gates/timeline) · TRADING_SYSTEM (facts) · DERIVED (Δ money, `derived_display`) | `incident-detail.v1` → v1.1 additive | 1 incident/screen; timeline ≤500 keyset; spark ≤48 | viewer read; gates never unlock from UI; resolve = existing ADMIN workflow | routes unpublished → source panels unavailable (today); market absent → band hidden; gates fall back to blocker codes | §6.5 routes (N11), BR-EX-43 | fixtures `.open` + `.resolved`; gate-mirror consistency test (`resolution_gates[].blocker_code` ⊆ `resolution_gate.blocker_codes`); frontend `incident.test` |
| **47** queue v2 | Codex · `dev` | READ; PORTAL_PROJECTION over command journal; DERIVED priority/escalation (server rule) | `operations-queue.v1` → v1.1 additive; new `alerts.v1` | ≤200 rows/24h keyset; alerts ≤20; countdowns from ISO | viewer read; ack/resolve = existing ADMIN workflow | alerts route unpublished → rail unavailable (today); missing priority → no chip, never guessed | §6.5 ops routes (N11); BR-EX-32/33 | fixtures `execution-operations-queue.attention.valid.json`, `execution-alerts.valid.json`; server priority-rule tests; frontend `operations.test`, `operationsWorkflow.test` |
| **48** blotter v2 | Codex (Portal) · Trading System owner (orders_v2/fills_v2 routes) · `dev` | READ; TRADING_SYSTEM (orders/legs/fills) · PORTAL_CONTROL (risk grant/reject) · DERIVED (`slippage.v1`) | `blotter-orders.v1` → v1.1 additive; new `order-legs.v1`, `order-fills.v1` | 10⁵–10⁷ rows keyset ≤200/page; legs ≤8; fills ≤5,000 paged; tick ≤1/1.3s | viewer read | route unpublished → fields null "not published"; tick absent → no pill | BR-EX-24/25 (`OWNER_DECISION_PENDING`) · BR-EX-43 | fixture `execution-blotter-orders.hifi.valid.json` (+legs+fills); exact-decimal tests; frontend `analytics360.test` blotter cases, journey 4 |
| **49** fleet | Codex · `dev` | READ; PORTAL_PROJECTION over strategies ⋈ strategy_deployments ⋈ allocations ⋈ snapshots; DERIVED pnl/spark | new `fleet-list.v1` | ≤500 alphas keyset ≤50/page; deployments ≤20/alpha; spark ≤30 pts | any viewer | route absent → panel unavailable (today) | BR-EX-43 tick for session pnl/sync age | fixture `execution-fleet-list.valid.json`; sort-rule tests; frontend `alphaFleet.test` |
| **50** replay | Codex · Trading System owner (OHLC/fills) · `dev` | READ; TRADING_SYSTEM candles/markers/legs · DERIVED round trips · PORTAL_CONTROL job | new `replay.v1` | 120–2,000 candles; markers ≤500/window; log keyset ≤200 | any viewer | route absent → tab shows unavailable | BR-EX-48 legs/fills; BR-EX-43 tick | fixture `execution-replay.dep_88.valid.json`; marker↔log id consistency test; frontend `alpha360.test` replay cases |
| **51** portfolio v2 | Codex · `dev` | READ (+2 actions later); DERIVED twr/corr/marginal · PORTAL_CONTROL revisions/log/limits | `portfolio-360.v1` → v1.1 additive | 3 windows ≤400 pts; config log ≤200 keyset; cross ≤20 portfolios | viewer read; report/rebalance = ADMIN step-up (future) | route fields absent → panels unavailable; strip falls back to contract KPIs | BR-EX-43 tick (NAV live); BR-EX-30/35 approvals | fixture `execution-portfolio-360.PF-CRYPTO.v1_1.valid.json`; era/rev consistency tests; frontend `analytics360.test` portfolio cases |
| **52** bindings list | Codex · `dev` | READ; PORTAL_CONTROL (bindings/credentials) · BROKER (equity/sync) · PORTAL_PROJECTION (virtual) | new `bindings-list.v1` | ≤50 bindings; ≤20 virtual/binding; sync age per tick | viewer read; credential secrets never | route absent → panel unavailable | `venue_accounts`/`venue_credentials`; BR-EX-43 tick | fixture `execution-bindings-list.valid.json`; invariant test Σ virtual ≤ physical; frontend `accountsBindings.test` |
| **53** binding detail | Codex · `dev` | READ (+ rotate action via Drawer) | new `binding-detail.v1` | stream ≤50; audit ≤200 keyset | viewer read; rotate = ADMIN step-up | route absent → panel unavailable | `venue_credentials`, `broker_account_sync_snapshots`, `audit_log` | fixture `execution-binding-detail.binance_main_01.valid.json`; secret-leak test (no key material in payload) |
| **54** account 360 v1.1 | Codex · `dev` | READ (+ existing simulate actions) | `account-broker-360.v1` → v1.1 additive | 1 account/screen | viewer read | missing additive fields → v1 rendering | existing contract | fixture update; frontend `account360.test` |
| **55** entity names | Codex · `dev` | READ; PORTAL_PROJECTION over registry/strategies/deployments/accounts/portfolios + Portal-owned incidents/approvals | new `entity-names.v1` (batch) | ≤50 ids/call; cached ETag | any viewer | unknown id → null label (id shown raw) | none | fixture `execution-entity-names.valid.json`; frontend crumb tests | 
| **56** live overview | Codex · `dev` | READ; PORTAL_PROJECTION + PORTAL_CONTROL + BROKER sync | new `live-overview.v1` | ≤50 live deployments; tape ≤20 + SSE; per tick | viewer read | route absent → panel unavailable | BR-EX-43 tick; incidents; approvals | fixture `execution-live-overview.valid.json`; health-state rule tests; frontend `liveOverview.test` |
| **57** live full v1.1 | Codex · `dev` | READ (+ existing protective actions) | `live-full.v1` → v1.1 additive | 1 deployment/screen; positions ≤200 | viewer read; actions ADMIN step-up | missing additive → v1 rendering | existing contract; exit reviews/approvals ids | fixture update; lifecycle id consistency; frontend `liveFull.test` |
| **59** canary v1.1 | Codex · `dev` | READ (+ existing protective/scale actions) | `canary-control-room.v1` → v1.1 additive | 1 deployment; series ≤400 pts × 3 | viewer read; actions ADMIN step-up + dual | missing additive → v1 rendering; sync STALE → DEGRADED | existing contract; approvals/conditions; exit reviews; paper twin | fixture update; gate-mirror consistency; frontend `canary.test` |
| **41** stage telemetry | Codex · `dev` (source-dark schema first, N10) | READ; PORTAL_PROJECTION/TRADING_SYSTEM/BROKER/DERIVED per 41.x | new `stage-equity.v1`, `envelope-consumption.v1`, `execution-quality.v1`, `positions.v1`, `contribution.v1`; `sandbox-certification.v1.1` | ≤5,000 pts/series; caps ≤8; buckets ≤12; positions ≤500 | viewer read | per-panel honest states (today) | N06 Paper qualification for source-backed values | per-kind fixtures; exact-decimal pure-engine tests |

# Phụ lục C — OpenAPI path stubs (đề xuất; codex quyết tên cuối)

```yaml
paths:
  /api/v1/execution/command-center:            # v1.1 additive: pinned.items[].{stage,status,figure,figure_tone,venue,deployment_id}, fleet.cells[].{sub,sub_tone,tone,href}
  /api/v1/execution/promotion-pipeline:        # GET ?window=90d[&cursor]  → promotion-pipeline.v1
  /api/v1/execution/alerts/summary:            # GET → alerts-summary.v1 (ETag, Cache-Control: no-cache, must-revalidate)
  /api/v1/execution/alerts:                    # GET ?limit=20 → alerts.v1[]
  /api/v1/execution/operations:                # v1.1 additive per-row + root kpis/throughput/source
  /api/v1/execution/incidents/{incident_id}:   # v1.1 additive (subject, opened_at, owner, origin, sla_ack, resolve_budget, market, evidence_facts, operations_taken, apply_plan, resolution_gates, timeline_lines, waiting_line, resolved)
  /api/v1/execution/blotter/orders:            # v1.1 additive per-row; ?filter=ALL|WORKING|CONDITIONAL|BRACKETS|FILLED|PARTIAL|REJECTED
  /api/v1/execution/blotter/orders/{id}/legs:  # GET → order-legs.v1
  /api/v1/execution/blotter/orders/{id}/fills: # GET ?cursor → order-fills.v1 (+ lineage)
  /api/v1/execution/portfolios/{id}:           # v1.1 additive (BR-EX-51); POST …/report-pack, POST …/rebalance-plan later
  /api/v1/execution/bindings:                  # GET ?filter → bindings-list.v1 (BR-EX-52)
  /api/v1/execution/bindings/{id}:             # GET → binding-detail.v1 (BR-EX-53); POST …/rotate-credential later
  /api/v1/execution/accounts/{id}:             # v1.1 additive (BR-EX-54)
  /api/v1/execution/entities:                  # GET ?ids=… → entity-names.v1 (BR-EX-55, cross-screen)
  /api/v1/execution/live:                      # GET ?filter&venue → live-overview.v1 (BR-EX-56); SSE live.tape
  /api/v1/execution/deployments/{id}/live:     # v1.1 additive (BR-EX-57)
  /api/v1/execution/deployments/{id}/canary:   # v1.1 additive (BR-EX-59)
  /api/v1/execution/fleet:                     # GET ?stage&venue&owner[&cursor] → fleet-list.v1 (BR-EX-49)
  /api/v1/execution/deployments/{id}/replay:   # GET ?symbol&interval=1h&window=120 → replay.v1 (BR-EX-50)
  /api/v1/execution/deployments/{id}/stage-equity:            # 41.1
  /api/v1/execution/deployments/{id}/envelope-consumption:    # 41.2
  /api/v1/execution/deployments/{id}/execution-quality:       # 41.3
  /api/v1/execution/deployments/{id}/positions:               # 41.4
  /api/v1/execution/deployments/{id}/contribution:            # 41.5
# SSE (existing channel, N08): event: alerts.summary · event: market.tick
```

# Phụ lục D — typed error / state examples frontend sẽ render

| Tình huống | Response đề xuất | Frontend hiển thị |
|---|---|---|
| route chưa publish (Trading System) | `503 {"error":{"code":"SOURCE_ROUTE_UNPUBLISHED","route":"orders_v2/fills","authority":"TRADING_SYSTEM"}}` hoặc panel `panel_state:"unavailable"` | honest state "not published" — **không** 0, không "—" cho số |
| stale | `panel_state:"stale", freshness_state:"STALE", age_seconds` | chip STALE + `as_of`; countdown dừng |
| partial (thiếu decision id, thiếu leg) | `completeness:"PARTIAL", warnings:[{code:"DECISION_ID_MISSING", ref}]` | ô `kind:none`, caption warning |
| denied | `403 {"error":{"code":"EXECUTION_READ_DENIED"}}` | state denied (không lộ payload) |
| stream auth hết hạn | `event: error {"code":"AUTH_EXPIRED"}` (corpus hiện có) | chip SESSION EXPIRED, values-as-read |
| cursor lệch | `409 CURSOR_AHEAD` / `CURSOR_EXPIRED` (H-8) | reload notice |

# Phụ lục E — thứ tự giao & điều kiện đóng từng gói (Claude phía frontend)

1. **42 → 44 → 45** (một PR `command-center v1.1` + `promotion-pipeline.v1`): tôi xoá `commandCenter.smoke.ts` (trừ `CC_SMOKE_MOTION` chờ 43), re-record `el-v2-07-command-center`, đóng hàng tracker.
2. **47** (+ `alerts.v1`): xoá `operationsQueue.smoke.ts`, re-record `el-v2-07-operations-queue`.
3. **46**: xoá `incident.smoke.ts` (trừ market band chờ 43), re-record `el-v2-07-incident`.
4. **48** (+24/25): xoá `blotter.smoke.ts` + slot `leadingRows`, re-record `el-v2-08-blotter`.
5. **41**: xoá `stage.smoke.ts`, re-record `el-v2-06-*`.
6. **43** (N08, Bobby duyệt activation): xoá `CC_SMOKE_MOTION`, market band Incident, pill giá Blotter chuyển sang stream.
7. **49**: xoá `alphaFleet.smoke.ts`, re-record `el-v2-08-alpha-fleet`.
8. **50**: xoá `alphaReplay.smoke.ts`, re-record `el-v2-08-alpha-replay`.
9. **51**: xoá `portfolio360.smoke.ts`, re-record `el-v2-08-portfolio-*`.
10. **52/53**: xoá `accounts.smoke.ts`, re-record `el-v2-08-accounts-*`; **54**: bỏ smoke facts trong Account 360.
11. **56/57**: xoá `live.smoke.ts`, re-record `el-v2-06-live` + `el-v2-08-live-overview`.
12. **59**: xoá `canary.smoke.ts`, re-record `el-v2-06-canary`.
13. **34/40**: xoá `alpha360.smoke.ts`.

Mỗi bước: handoff codex kèm **Required frontend tests**; tôi regenerate `portal-api.d.ts`, nạp fixture canonical
trong test (không chép tay), ghi `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` vào ledger §3, tick grammar §8.

# Phụ lục F — cách codex nhận request này

- **Intake chính thức:** 19 hàng BR-EX-41…59 trong §7.2 của `portal-backend-plan/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`
  (đang là sửa unstaged trên `feat/execution-n04-lease-aware-consumer`). Bản patch để apply lại nếu cần:
  `BACKEND_PLAN_7_2_ROWS_2026-08-25.md` (cùng thư mục, 8 hàng nguyên văn).
- **Chi tiết field/type/enum/ví dụ:** phụ lục A; DoR: phụ lục B; path: C; error: D; thứ tự: E.
- Trả lời theo §7.1: `RECEIVED → NEEDS_CLARIFICATION | CONTRACT_PLANNED | OWNER_DECISION_PENDING | EXTERNAL_CONTRACT_PENDING | REJECTED`,
  ghi vào cột Status §7.2 và `EXECUTION_REQUEST_LEDGER.md` §3.

---

# Phụ lục G — BR-EX-49 · Alpha Fleet: đặc tả đầy đủ để codex làm không phải đoán

## G.1 Endpoint

`GET /api/v1/execution/fleet?stage=all|live|canary|sandbox|paper|research&venue=<venue|all>&owner=<user|all>&cursor=<keyset>&limit=50`
— schema `fleet-list.v1`; `ETag` + `Cache-Control: no-cache, must-revalidate`; `Vary: Authorization`.
Nguồn: `strategies` (alpha_id = strategy_id) ⋈ `strategy_deployments` ⋈ `portfolio_allocations` ⋈ `performance_snapshots` / `account_equity_snapshots` (by deployment_id) ⋈ `approvals` (next gate) ⋈ `broker_sync` (sync age) ⋈ `incidents` (attention).

## G.2 Response mẫu (khớp `alphaFleet.smoke.ts`, số là string decimal)

```json
{
  "envelope": { "authority": "EXECUTION", "as_of": "2026-08-25T04:42:49Z", "freshness": "OK" },
  "summary": { "alphas": 6, "deployments": 8, "live": 2 },
  "kpis": {
    "live_exposure": { "value": "41000", "ccy": "USDT", "physical": "43120", "account": "binance_main_01" },
    "fleet_pnl_session": { "value": "2085.00", "ccy": "USDT", "live": true, "as_of": "2026-08-25T04:42:49Z" },
    "deployments": { "total": 8, "by_stage": { "live": 2, "canary": 2, "sandbox": 2, "paper": 3 } },
    "attention": { "mismatch": 1, "halted": 1, "gate_overdue": 1 },
    "portfolios": [ { "id": "PF-CRYPTO", "href": "/deployments/portfolios/PF-CRYPTO" }, { "id": "PF-MAIN", "href": null } ]
  },
  "counts": { "all": 6, "live": 1, "canary": 2, "sandbox": 2, "paper": 3, "research": 2 },
  "rows": [
    {
      "alpha_id": "av_2041", "name": "Grid", "version": "v2.1", "artifact_digest": "sha256:41bb7d…c4", "research_status": "RESEARCH_APPROVED",
      "owner": "Stan", "portfolios": [ { "id": "PF-CRYPTO", "href": "/deployments/portfolios/PF-CRYPTO" } ],
      "stage_presence": [
        { "stage": "LIVE_FULL", "label": "LIVE", "strong": true },
        { "stage": "LIVE_CANARY", "label": "CANARY d9/14", "strong": true, "shield": true },
        { "stage": "SANDBOX_VALIDATION", "label": "SANDBOX", "paused": true },
        { "stage": "PAPER_OBSERVATION", "label": "PAPER 30/30" }
      ],
      "alloc": { "value": "93400", "ccy": "USDT" },
      "net_pnl_30d": { "value": "2066.40", "ccy": "USDT", "note": { "value": "1842.00", "ccy": "USDC", "text": "paper — not summed" } },
      "max_dd_30d": "-0.016", "equity_30d": ["20","19","16","17","13","14","10","8","9","5"],
      "health": { "text": "1 MISMATCH", "tone": "bad", "tail": "paper exit", "link": { "label": "EX-771", "href": "/governance/exit-reviews/EX-771" } },
      "note": "4 deployments (strategy_deployments)",
      "deployments": [
        { "deployment_id": "dep_live", "venue": "BINANCE", "mode": "live", "stage": "LIVE_FULL", "stage_note": "since 2026-08-01 · AP-330 · CX-08",
          "alloc": "18400", "pnl": { "value": "1954.00", "ccy": "USDT", "live": true }, "dd": "-0.012",
          "account_id": "acct-live-grid-v21", "portfolio": "PF-CRYPTO",
          "health": { "text": "sync MISMATCH", "tone": "bad", "link": { "label": "inc_44", "href": "/execution/operations/incidents/inc_44" } }, "sync_age_seconds": null },
        { "deployment_id": "dep_88", "venue": "BINANCE", "mode": "live", "stage": "LIVE_CANARY", "stage_note": "day 9/14 · AP-311",
          "alloc": "5000", "pnl": { "value": "112.40", "ccy": "USDT", "live": true }, "dd": "-0.008",
          "account_id": "acct-canary-grid", "portfolio": "PF-CRYPTO", "health": { "text": "READY · sync", "tone": "good" }, "sync_age_seconds": 2.7 },
        { "deployment_id": "dep_91", "venue": "OKX", "mode": "sandbox", "stage": "SANDBOX_VALIDATION", "stage_note": "HALTED · op_1187", "stage_note_tone": "warn",
          "alloc": "10000", "pnl": null, "dd": null, "account_id": "acct-sbx-grid-okx", "portfolio": "PF-CRYPTO", "health": { "text": "no active session", "tone": "warn" }, "sync_age_seconds": null },
        { "deployment_id": "dep_94", "venue": "DERIBIT", "mode": "paper", "stage": "PAPER_OBSERVATION", "stage_note": "30/30 gate met", "stage_note_tone": "good",
          "alloc": "60000", "pnl": { "value": "1842.00", "ccy": "USDC", "live": false }, "dd": "-0.014",
          "account_id": "acct-paper-grid-drb", "portfolio": "PF-CRYPTO", "health": { "text": "READY · exit review", "tone": "good", "link": { "label": "EX-771", "href": "/governance/exit-reviews/EX-771" } }, "sync_age_seconds": null }
      ]
    },
    { "alpha_id": "RC-52", "name": "MeanRev", "version": "v0.3", "artifact_digest": null, "research_status": "BLOCKED", "owner": "Lan", "portfolios": [],
      "stage_presence": [ { "stage": "RESEARCH", "label": "RESEARCH · BLOCKED", "dashed": true, "blocked": true } ],
      "alloc": null, "net_pnl_30d": null, "max_dd_30d": null, "equity_30d": null,
      "health": { "text": "AP-360 — audit replay failed", "tone": "bad" }, "note": "research — blocked", "deployments": [], "dim": true }
  ],
  "page": { "next_cursor": null, "total_count": 6, "filtered_count": 6 }
}
```

## G.3 Quy tắc suy ra (server làm, frontend chỉ vẽ)

| Cột | Quy tắc |
|---|---|
| Sort | `live_exposure desc` (tổng alloc các deployment LIVE_FULL+LIVE_CANARY) → `furthest_stage desc` (LIVE_FULL > LIVE_CANARY > SANDBOX_VALIDATION > PAPER_OBSERVATION > RESEARCH) → `name asc`; research rows luôn cuối, `dim:true` |
| `stage_presence[]` | một chip cho **mỗi stage** alpha đang có ≥1 deployment; label: LIVE → `LIVE`; canary → `CANARY d{day}/{total}` + `shield:true`; sandbox → `SANDBOX` + `paused:true` khi HALTED, hoặc `SANDBOX cert {done}/{total}`; paper → `PAPER {sessions}/{required}`; research → `RESEARCH` (`dashed`), `RESEARCH · BLOCKED` (`blocked`) |
| `alloc` | Σ allocation deployment **cùng tiền tệ**; khác tiền tệ → trả từng `{value,ccy}` trong `alloc_by_ccy[]`, `alloc` = ccy portfolio base |
| `net_pnl_30d` | Σ pnl 30d các deployment cùng ccy; ccy khác → `note{value,ccy,text:"paper — not summed"}`; **không FX** |
| `max_dd_30d` | min drawdown giữa các deployment (chuỗi ratio, 3 chữ số) |
| `equity_30d` | 10–30 điểm normalized từ `equity_projection.v1` (LTTB, giữ extrema; `downsample_meta` ở envelope) |
| `health` | ưu tiên: incident MISMATCH (bad) → gate OVERDUE (warn) → HALTED/no session (warn) → READY + next gate/condition (good) → research: `R1 {AP} quorum a/b · due {h}` (mute) hoặc BLOCKED reason (bad) |
| `counts` | alpha được đếm ở **mọi** stage nó có deployment (Grid đếm ở live, canary, sandbox, paper) |
| `attention.gate_overdue` | approvals có `due_at < now` và chưa quyết |
| `sync_age_seconds` | từ broker_sync heartbeat; null với paper/no binding |
| VN MARKET | `session{calendar:"HOSE", open:"09:00", close:"14:45", tz:"Asia/Ho_Chi_Minh", state: OPEN\|SUSPENDED_BY_CALENDAR, resumes_at}` — frontend không tự tính lịch |

## G.4 Trạng thái / lỗi

| Tình huống | Response | UI |
|---|---|---|
| chưa có projection | `503 {"error":{"code":"FLEET_PROJECTION_UNAVAILABLE"}}` | panel unavailable (hiện tại) |
| snapshot cũ | `envelope.freshness:"STALE"`, `age_seconds` | chip STALE, as_of dừng |
| alpha có deployment nhưng snapshot thiếu | row `completeness:"PARTIAL"`, `warnings[{code:"SNAPSHOT_MISSING", deployment_id}]` | `—` + lý do |
| filter venue/owner chưa hỗ trợ | `400 {"error":{"code":"FILTER_UNSUPPORTED","filter":"owner"}}` | chip disabled kèm lý do |
| cursor hết hạn | `409 CURSOR_EXPIRED` | reload notice |

## G.5 Live (N08)

SSE event `fleet.tick` `{as_of, fleet_pnl_session{value,ccy}, rows[{alpha_id, net_pnl_30d?, deployments[{deployment_id, pnl?, sync_age_seconds?}]}]}` ≤1/1.4s; chỉ field đổi.

## G.6 Test bắt buộc (codex) — fixture `execution-fleet-list.valid.json`

1. sort: Grid (live 23,400) trước Carry (0 live, sandbox) trước MM (canary 7,700)? **Không** — MM có live exposure 7,700 > Carry 0 → thứ tự Grid, MM, Carry, VnMomo, RSI, MeanRev. Test khoá thứ tự này.
2. counts: Grid xuất hiện trong 4 count; tổng counts ≠ số alpha (được phép).
3. per-currency: alpha có USDT + USDC → `net_pnl_30d.note` chứ không cộng.
4. BLOCKED row luôn có mặt với `stage=all` và `stage=research`.
5. `equity_30d` giữ min/max của series gốc.
6. schema round-trip + ETag 304.

---

# Phụ lục H — BR-EX-50 · Trade Replay: đặc tả đầy đủ

## H.1 Endpoint

`GET /api/v1/execution/deployments/{deployment_id}/replay?symbol=BTCUSDT&interval=1h&window=120&until=<ISO>` → `replay.v1`.
`GET /api/v1/execution/deployments/{deployment_id}/replay/log?symbol&cursor&limit=200` → `replay-log.v1` (keyset theo `t` desc).
Nguồn: `orders` ⋈ `fills` (order_id) ⋈ `order_bracket_legs` (bracket_group_id) ⋈ `execution_replay_jobs` ⋈ venue OHLC (candle store) ⋈ `market.tick` (BR-EX-43).

## H.2 Response mẫu (rút gọn, khớp `alphaReplay.smoke.ts`)

```json
{
  "envelope": { "authority": "TRADING_SYSTEM", "as_of": "2026-08-25T12:00:00Z", "freshness": "OK" },
  "deployment": { "id": "dep_88", "venue": "BINANCE" }, "symbol": "BTCUSDT", "interval": "1h",
  "pickers": { "deployments": [ { "id": "dep_88", "label": "dep_88 · BINANCE" }, { "id": "dep_94", "label": "dep_94 · DERIBIT" } ], "symbols": ["BTCUSDT"] },
  "candles": [ { "t": "2026-08-20T13:00:00Z", "o": "61230.00", "h": "61310.20", "l": "61180.00", "c": "61265.40" } ],
  "last_bucket_live": true,
  "mark": { "price": "61807.25", "at": "2026-08-25T12:00:00.412Z", "source": "mark" },
  "markers": [
    { "t": "2026-08-21T22:00:00Z", "index": 34, "kind": "ENTRY_FILL", "price": "60980.00", "order_id": "ord_8771", "fill_id": "fill_3280" },
    { "t": "2026-08-22T05:00:00Z", "index": 41, "kind": "EXIT_FILL_TP", "price": "61540.00", "order_id": "ord_8771.TP", "fill_id": "fill_3288" },
    { "t": "2026-08-25T03:00:00Z", "index": 111, "kind": "BRACKET_ARMED", "bracket_group_id": "br_0092", "activation_policy": "SUBMIT_CHILDREN_AFTER_ENTRY_FILLED" },
    { "t": "2026-08-24T16:00:00Z", "index": 100, "kind": "REJECT", "price": "60700.00", "order_id": "ord_8815", "reason": "rg_2188 max position notional" },
    { "t": "2026-08-25T08:00:00Z", "index": 116, "kind": "EXIT_PARTIAL", "price": "61900.00", "order_id": "ord_8832.TP", "fill_id": "fill_3320" }
  ],
  "round_trips": [ { "entry_index": 34, "entry_price": "60980.00", "exit_index": 41, "exit_price": "61540.00", "pnl": { "value": "4.48", "ccy": "USDT" }, "kind": "TP" } ],
  "legs": [
    { "role": "TP", "order_id": "ord_8832.TP", "trigger_price": "61900.00", "order_type": "TAKE_PROFIT", "flags": ["REDUCE_ONLY"], "filled": "0.0040", "total": "0.0080", "armed_index": 111 },
    { "role": "SL", "order_id": "ord_8832.SL", "trigger_price": "60900.00", "order_type": "STOP_MARKET", "flags": ["REDUCE_ONLY"], "filled": "0.0000", "total": "0.0080", "armed_index": 111 }
  ],
  "job": { "id": "erj_112", "table": "execution_replay_jobs", "status": "COMPLETE", "built_at": "2026-08-25T11:58:40Z" }
}
```

## H.3 Quy tắc

| Mục | Quy tắc |
|---|---|
| `index` | vị trí nến chứa `t` trong `candles[]` của **cùng response** (0-based); frontend không tự tìm |
| marker kind | `ENTRY_FILL` (fill mở/tăng vị thế) · `EXIT_FILL_TP` · `EXIT_FILL_SL` (fill do stop trigger) · `EXIT_PARTIAL` (fill một phần của TP/SL leg) · `BRACKET_ARMED` (children submit, `t` = ack của children) · `REJECT` (pre-venue, không có venue_order_id) |
| round trip | ghép entry→exit theo `bracket_group_id`/`position_id`; pnl net fee, ccy của account |
| legs | chỉ leg đang WORKING/CREATED/PARTIAL của bracket mở; `armed_index` để vẽ level từ nến đó |
| candles | venue OHLC, không downsample dưới interval; `last_bucket_live:true` → frontend gắn `mark` vào nến cuối |
| log | mỗi hàng có `event` ∈ FILL\|SUBMIT\|ACK\|REJECT\|TRIGGER, `order_id`/`fill_id` **trùng** id của marker tương ứng (marker↔row) |
| khoảng cách tới trigger | frontend hiển thị `mark − trigger_price` ghi `derived_display`; server không cần gửi |

## H.4 Lỗi / trạng thái

`503 REPLAY_SOURCE_UNPUBLISHED` (OHLC hoặc fills chưa có) → tab unavailable · `404 DEPLOYMENT_NOT_IN_SCOPE` · `409 REPLAY_JOB_PENDING {job}` → panel "replay job erj_… building" · mark absent → không vẽ đường mark.

## H.5 Live

`market.tick` (BR-EX-43) cho `mark`; `fill.event` `{deployment_id, marker}` khi có fill mới → frontend thêm marker + hàng log đầu.

## H.6 Test bắt buộc — fixture `execution-replay.dep_88.valid.json`

1. mọi `markers[].index` ∈ [0, candles.length) và `candles[index].t ≤ marker.t < candles[index+1].t`.
2. mọi marker FILL có `fill_id` tồn tại trong log; REJECT không có `fill_id`, không có venue_order_id.
3. `round_trips[].pnl` = Σ fill (exit − entry) − fee, so với fills fixture.
4. legs chỉ chứa leg chưa terminal; `armed_index` = index của marker BRACKET_ARMED cùng group.
5. `last_bucket_live` đúng khi `candles[-1].t + interval > as_of`.
6. keyset log: trang 2 không lặp hàng.

---

# Phụ lục I — BR-EX-51 · Portfolio 360 v2: đặc tả đầy đủ

## I.1 Endpoints

| Method · path | Trả về | Ghi chú |
|---|---|---|
| `GET /api/v1/execution/portfolios/{portfolio_id}?window=30d\|90d\|all&mode&venue&benchmark_id` | `portfolio-360.v1.1` (additive lên v1: giữ `kpis`, `holdings`, `correlation`, `leaders`, `ledger`, `approvals`, `incidents`) | ETag/304; `Vary: Authorization` |
| `GET /api/v1/execution/portfolios/{id}/config-log?cursor&limit=50` | `portfolio-config-log.v1` keyset (rev desc) | tab Overview + Capital Ledger đối chiếu |
| `GET /api/v1/execution/portfolios/{id}/cross?window=30d` | `cross-portfolio.v1` | có thể gộp vào 360 khi ≤20 portfolio |
| `POST /api/v1/execution/portfolios/{id}/report-pack` (sau) | `202 {job_id}` | ADMIN step-up; export PDF/CSV theo scope |
| `POST /api/v1/execution/portfolios/{id}/rebalance-plan` (sau) | `202 {operation_id}` (plan → apply → verify) | ADMIN step-up, đi qua Admin Action Drawer; expected_revision bắt buộc |

Nguồn: `portfolios` ⋈ `portfolio_allocations` ⋈ `portfolio_config_revisions` (rev, from, to, operation_id, approval_id) ⋈ `capital_ledger` ⋈ `performance_snapshots` / `account_equity_snapshots` ⋈ benchmark series (`benchmarks`, `bms_204`) ⋈ `incidents` ⋈ `risk_profiles` (dd limit) ⋈ `market.tick`.

## I.2 Response mẫu (rút gọn, khớp `portfolio360.smoke.ts`)

```json
{
  "envelope": { "authority": "EXECUTION", "as_of": "2026-08-25T10:42:01Z", "freshness": "OK" },
  "portfolio": { "id": "PF-CRYPTO", "status": "ACTIVE", "base_ccy": "USDT", "facts": { "alphas": 4, "accounts": 6 } },
  "scope": { "window": "30d", "mode": "all", "venue": "all", "benchmark": { "id": "bms_204", "label": "Crypto Core v3" } },
  "strip": {
    "nav": { "value": "131240.00", "ccy": "USDT", "as_of": "2026-08-25T10:42:01Z", "live": true },
    "today": { "value": "486.20", "ccy": "USDT" },
    "allocated": { "value": "125000", "max": "200000", "free": "57842.55" },
    "exposure": { "gross": "26100", "accounts": 6, "venues": 3 },
    "return_30d": { "value": "0.0186", "benchmark_value": "0.0090", "alpha": "0.0096", "formula": "twr.v1" },
    "max_dd_30d": { "value": "-0.016", "limit": "-0.050", "headroom_pt": "3.4", "limit_source": "risk_profile rev 12" },
    "attention": { "mismatch": 1, "incident_id": "inc_44", "note": "orders fail-closed" }
  },
  "equity_segmented": {
    "buckets": "1d", "formula": "twr.v1",
    "windows": [
      { "key": "90d", "label": "90d",
        "nav": [ { "t": "2026-05-27", "v": "1.0000" }, { "t": "2026-08-25", "v": "1.0392" } ],
        "benchmark": [ { "t": "2026-05-27", "v": "1.0000" }, { "t": "2026-08-25", "v": "1.0148" } ],
        "eras": [
          { "rev": 10, "from": "2026-07-12", "to": "2026-07-20", "label": "rev 10 · Carry +50k (07-12)", "tone": "accent" },
          { "rev": 11, "from": "2026-07-20", "to": "2026-08-01", "label": "rev 11 · MM added (07-20) · rev 12 risk (07-28)", "tone": "good", "merged_revs": [11, 12] },
          { "rev": 13, "from": "2026-08-01", "to": "2026-08-13", "label": "rev 13 · Grid paper 60k (08-01)", "tone": "paper" },
          { "rev": 14, "from": "2026-08-13", "to": null, "label": "rev 14 · canary", "tone": "bad" }
        ] }
    ]
  },
  "cross_portfolio": {
    "rows": [
      { "portfolio_id": "PF-CRYPTO", "this": true, "nav": { "value": "131240.00", "ccy": "USDT" }, "ret_30d": "0.0186", "max_dd": "-0.016", "alphas": 3, "live_exposure": "41000", "spark": ["16","15","16","12","10","8","5"] },
      { "portfolio_id": "PF-MAIN", "nav": { "value": "62410.00", "ccy": "USDT" }, "ret_30d": "0.0064", "max_dd": "-0.004", "alphas": 1, "live_exposure": "0", "spark": ["13","13","12","12","11","11","10"] },
      { "portfolio_id": "PF-MAIN", "sleeve": "VND", "nav": { "value": "502100000", "ccy": "VND" }, "ret_30d": "0.0043", "max_dd": "-0.006", "alphas": 1, "live_exposure": "0", "spark": ["14","13","14","11","12","10","9"] }
    ],
    "cross_corr": { "pair": ["PF-CRYPTO", "PF-MAIN"], "rho": "0.21", "window": "30d daily", "note": "low — sleeves diversify at fund level", "formula": "corr.v1" }
  },
  "config_log": [
    { "rev": 14, "current": true, "date": "2026-08-13", "change": "CANARY_JOIN", "detail": "Grid v2.1 → LIVE·CANARY · +5,000", "account_id": "acct-canary-grid", "operation_id": "op_1201", "approval_id": "AP-311", "actor": "Stan", "since_rev_pnl": { "value": "112.40", "ccy": "USDT" } },
    { "rev": 9, "retired": true, "date": "2026-06-30", "change": "ALPHA_REMOVED", "detail": "RSI v0.9 retired — failed R2 re-review · allocation −8,000 returned to free", "operation_id": "op_1044", "approval_id": "AP-198", "approval_decision": "REJECTED", "actor": "Lan", "since_rev_pnl": { "value": "-96.40", "ccy": "USDT", "final": true } }
  ],
  "structure": {
    "kpis": { "equity": "127842.55", "net_pnl_30d": "3754.20", "drawdown": "-0.028", "gross_exposure": "37400", "net_exposure": "24600", "allocated": "125000", "max": "200000" },
    "what_if": [ { "scenario": "halve Grid alloc", "estimate_text": "est. portfolio vol −18% · net PnL −9%", "headline": "-18%", "formula": "marginal.v1" } ],
    "symbol_overlap": [ { "symbol": "BTCUSDT", "alphas": ["Grid v2.1", "Carry v3.2"], "same_direction_notional": "9100.00", "tone": "warn", "note": "duplicate edge risk" }, { "symbol": "ETHUSDT", "alphas": ["Carry v3.2"], "same_direction_notional": "0", "tone": "good", "note": "no overlap" } ],
    "links": { "incidents_open": 0, "recon_findings": 0, "approvals": ["AP-207", "AP-311"] }
  }
}
```

## I.3 Quy tắc suy ra

| Mục | Quy tắc |
|---|---|
| `strip.nav` | NAV theo mark hiện tại (per tick); `today` = NAV − NAV lúc 00:00 UTC; ccy = base_ccy; **không** cộng sleeve ccy khác |
| `return_30d.alpha` | `value − benchmark_value` cùng window, cùng TWR 1d; đơn vị ratio (frontend in %) |
| `max_dd_30d.headroom_pt` | `(limit − value) × 100` theo điểm phần trăm; `limit` từ risk profile đang hiệu lực (ghi `limit_source`) |
| `eras[]` | một era cho mỗi `portfolio_config_revisions` giao với window; rev không đủ ≥2 bucket được **merge** vào era trước (`merged_revs`), label vẫn kể cả hai; era cuối `to:null` = current |
| `eras[].tone` | CANARY_JOIN → bad · ALLOC_UP/ALLOC_DOWN → accent · ALPHA_ADDED → good · RISK_PROFILE → warn · paper alloc → paper · build-up (rev 1–9) → mute |
| `nav[]`/`benchmark[]` | normalized 1.0 tại đầu window; 1d bucket; ≤400 điểm (LTTB, giữ extrema, `downsample_meta`) |
| `cross_portfolio` | cùng window/công thức; rank chỉ trong cùng base ccy; sleeve ccy khác là hàng riêng `sleeve`; `this:true` cho portfolio đang xem |
| `config_log` | append-only; mỗi rev ↔ đúng 1 `operation_id` (VERIFIED) + `approval_id`; `since_rev_pnl` = pnl tích luỹ từ `from` của rev (đến rev kế tiếp hoặc now); `retired:true` khi ALPHA_REMOVED; `current:true` cho rev cuối |
| `what_if` | `marginal.v1`: ước lượng cục bộ (halve/remove/double top leader) — **luôn** kèm `formula`, frontend in "labeled estimates" |
| `symbol_overlap` | cùng symbol, cùng chiều, ≥2 alpha → `warn` + notional trùng |
| VND | không bao giờ quy đổi vào USDT ở màn này; chỉ liệt kê |

## I.4 Lỗi / trạng thái

`503 PORTFOLIO_PROJECTION_UNAVAILABLE` → màn giữ KPI contract (v1) + panel unavailable · `equity_segmented` thiếu window → chip window disabled kèm lý do · `attention.incident_id` không tồn tại → chỉ đếm · `409 CURSOR_EXPIRED` cho config-log · `403 PORTFOLIO_READ_DENIED`.

## I.5 Live

`market.tick` (BR-EX-43) → `strip.nav`, `today`, `exposure` re-price; `portfolio.revision` event `{portfolio_id, rev, operation_id}` → thêm era + hàng log đầu bảng.

## I.6 Test bắt buộc — fixture `execution-portfolio-360.PF-CRYPTO.v1_1.valid.json`

1. eras phủ kín window không chồng, era cuối `to:null`; mỗi era.rev tồn tại trong config_log.
2. `config_log[].operation_id` đều VERIFIED trong command journal fixture; rev tăng đơn điệu; đúng 1 `current`.
3. `return_30d.alpha == value − benchmark_value` (decimal string exact).
4. `headroom_pt` khớp limit − value.
5. cross_portfolio: rank không trộn ccy; sleeve VND không cộng vào bất kỳ tổng nào.
6. `nav[]` downsample giữ min/max gốc; ≤400 điểm.
7. schema round-trip + ETag 304; v1 client đọc được v1.1 (additive).

## I.7 Bổ sung (2026-08-26) — các tab con của Portfolio 360 theo hi-fi 3a

Owner xác nhận: mọi tab con phải đủ hi-fi. Bổ sung vào `portfolio-360.v1.1` (hoặc route riêng theo tab, codex quyết):

### I.7.1 Structure & Correlation

| field | type | authority | rule |
|---|---|---|---|
| `correlation.matrix` | `{labels[], rows[{label, cells[string\|null], bm{value\|null, hot:bool}}], meta{buckets:"1h", samples, coverage, formula:"corr.v1"}, insufficient[{alpha, days_observed}]}` | DERIVED (`corr.v1`) | `null` = INSUFFICIENT_DATA (giữ ô, in `—`); `bm.hot` khi \|ρ\| ≥ 0.5; BM cột ghim trong ma trận |
| `market_corr` | `{series[{t, rho}], threshold{value:"0.60", label:"beta-proxy threshold"}, crossings[{from,to}], now, high_30d, tail_rho{value, note:"worst-decile BM days"}, meta}` | DERIVED (`corr.v1`, `tail.v1`) | ρ(NAV, benchmark) rolling 30d; ≤ 400 điểm |
| `leadership` | `{exposure_share{alpha, deployments, pct}, risk_contribution{alpha, pct, formula:"riskcontrib.v1", covariance:"cov_30d_v2"}, corr_influence{alpha, avg_abs_rho_others, rho_bm}, insight{code, grade, window, text, evidence_refs[]}}` | DERIVED | **ba danh sách riêng, không gộp điểm** (tests khoá) |
| `influence_map` | `{nodes[{alpha, exposure_pct, insufficient:bool}], edges[{a, b, rho}], bm{rho_by_alpha{}}, edge_threshold:"0.15"}` | DERIVED | frontend tự bố cục; dashed khi insufficient |
| `drawdown_overlap` | `{episodes[{alpha, from, to, depth}], joint[{from, to, alphas[], regime{label, formula:"regime.v2"}}], insufficient[{alpha, days_observed}]}` | DERIVED | episode = peak-to-recovery; joint = ≥2 alpha cùng DD |
| `leader_lens` | frontend-only (tô hàng của alpha dẫn) | — | không cần backend |

### I.7.2 Capital Ledger (`capital-ledger.v1` → v1.1)

Thêm `type` enum `SEED\|ALLOCATE\|REBALANCE\|CANARY_ALLOCATE\|RELEASE`, `allocated_before`, `allocated_after` (chuỗi decimal), `approval_id`, `actor`; header `{allocated, max, free, ccy}`. Invariant: `after − before == amount`, chuỗi rev liên tục; FX-normalized entry gắn `fx_policy`.

### I.7.3 Approvals (`portfolio-approvals.v1`)

`rows[{id, kind: R1\|R2\|LIVE_CANARY\|PAPER_EXIT\|CANARY_EXIT, subject, decision: APPROVED\|APPROVED_WITH_CONDITIONS\|REJECTED\|PENDING, approvers[], decided_at, conditions{active:int, expires_at?}, href}]` — nguồn approvals ⋈ portfolio scope; "expiring conditions surface in Incidents 7 days ahead" là rule của Incidents feed.

### I.7.4 Incidents (`portfolio-incidents.v1`)

`{open:int, accounts:int, last_rollback{id, at}, rows[{id, type: BROKER_STALE\|REJECT_SPIKE\|MISMATCH\|…, scope, opened_at, resolved_at, resolution_note, closed_by{approval_id\|condition_id\|operation_id}, duration_seconds}]}` — `open` là số đếm server, không suy từ rows.

### I.7.5 Audit (`portfolio-audit.v1`, keyset)

`rows[{t, actor, step_up:bool, action, resource, evidence{operation_id?, approval_id?, digest?}, state: VERIFIED\|RECORDED\|PARTIAL}]` từ `portfolio_audit_log` ⋈ command journal; PARTIAL không bao giờ hiển thị xanh.

### I.7.6 Test bổ sung

8. matrix: mọi ô `null` có bản ghi trong `insufficient[]`; đối xứng ρ(a,b)=ρ(b,a).
9. leadership: ba danh sách có thể xếp hạng khác nhau (fixture cố tình khác) — không có trường `score`.
10. ledger: `after − before == amount` cho mọi hàng; header.allocated == after của hàng mới nhất.
11. incidents: `open` == count(rows where resolved_at null).
12. audit: mọi `evidence.operation_id` là VERIFIED/PARTIAL trong journal; không có RECORDED cho hành động mutation.

---

# Phụ lục J — Nguồn dữ liệu & domain logic cho BR-EX-49/50/51 (theo `DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md` và Trading System routes §6.5)

Ký hiệu: **DB** = bảng trong trading DB (88 bảng/2 view); **TS route** = route Trading System publish (contract pack); **PORTAL** = bảng/projection Portal sở hữu (N09); **DERIVED** = tính trong Portal projection theo formula version; **MISSING** = chưa có nguồn — codex quyết (tạo bảng Portal-owned, hoặc `EXTERNAL_CONTRACT_PENDING`).

## J.1 BR-EX-49 · Alpha Fleet

| field | nguồn | logic |
|---|---|---|
| `rows[].alpha_id, name, version, artifact_digest, research_status, owner` | DB `strategies` (alpha_id = strategy_id) ⋈ `alphas` ⋈ `alpha_ledger` (research status/approval refs) ⋈ `traders` (owner) | research_status = trạng thái R1/R2 gần nhất trong `alpha_ledger`; research-only alpha = có trong `strategies` nhưng 0 hàng `strategy_deployments` |
| `rows[].deployments[]` | DB `strategy_deployments` (deployment_id, venue, mode, stage, account_id, portfolio_id) ⋈ `accounts` ⋈ `venue_accounts` | stage từ `strategy_deployments.stage`; `stage_note` = ngày vào stage + approval id (PORTAL approvals) |
| `alloc` | DB `portfolio_allocations` (per deployment/account, ccy) | Σ theo ccy; không FX |
| `net_pnl_30d`, `max_dd_30d`, `equity_30d` | DB `performance_snapshots` + `account_equity_snapshots` (by deployment_id/account_id, 1h/1d) | DERIVED `twr.v1`; sparkline LTTB giữ extrema |
| `fleet_pnl_session` | DB `execution_sessions` (session hiện tại) + marks từ TS route positions/market tick | DERIVED, re-price per tick |
| `live_exposure.physical` | DB `broker_account_sync_snapshots` / `account_sync_snapshots` (binance_main_01) | so với `account_balances` + `positions_v2` |
| `health` | PORTAL incidents (MISMATCH) + `reconciliation_findings` (DB) + PORTAL approvals (OVERDUE) + `execution_sessions.state` (no active session) + `service_heartbeats`/`broker_account_sync_snapshots` (sync age) | ưu tiên như G.3 |
| `attention` | như trên, đếm server | |
| VN MARKET session | DB `venues.trading_sessions` (JSONB) + `settlement_calendars` | server trả `session{state, resumes_at}` |
| `counts` | DB `strategy_deployments` group by stage | alpha đếm ở mọi stage nó có |

## J.2 BR-EX-50 · Trade Replay

| field | nguồn | logic |
|---|---|---|
| `candles[]` | **MISSING trong DB** — Trading System market-data (venue OHLC 1h) hoặc `funding_rates`-style store mới | codex quyết: TS route `market/candles` (EXTERNAL_CONTRACT_PENDING) hay Portal cache |
| `markers[]` | DB `fills` (fill_id, trade_time, price, quantity, client_order_id, venue_order_id) ⋈ `orders` (order_type, side, trigger_price, status, risk_grant_id) ⋈ `order_brackets` / `order_bracket_legs` (bracket_group_id, role, activation_policy) | kind: ENTRY_FILL = fill mở/tăng vị thế (`positions_v2` delta cùng chiều); EXIT_FILL_TP/SL theo leg role; BRACKET_ARMED = ack children; REJECT = `orders.status` REJECTED pre-venue (`venue_order_id` null) hoặc `risk_grants.rejected_orders` |
| `round_trips[]` | DERIVED từ fills ghép theo bracket_group_id / `alpha_positions` open→close | pnl net fee (`fills.fee`) |
| `legs[]` | DB `order_bracket_legs` ⋈ `orders` (WORKING/CREATED/PARTIAL) | `armed_index` = nến của ack children |
| `mark` | TS market tick (BR-EX-43) | |
| `job` | **MISSING** `execution_replay_jobs` — Portal-owned bảng mới (N09) | id, status, built_at, window |
| `log[]` | DB `orders` (SUBMIT/ACK/REJECT theo `status` + timestamps) + `fills` (FILL) + `order_bracket_legs` (TRIGGER) ⋈ `execution_sessions` | keyset theo `t` desc; id trùng marker |
| `pickers` | DB `strategy_deployments` trong scope alpha; `instruments` cho symbol | |

## J.3 BR-EX-51 · Portfolio 360

| field | nguồn | logic |
|---|---|---|
| `portfolio.status, facts` | DB `portfolios` (status, base_ccy) ⋈ `portfolio_allocations` (alphas/accounts count) | |
| `strip.nav, today` | DB `portfolio_equity_snapshots` (1d) + marks per tick (TS) | NAV live = snapshot cuối + Δ mark trên `positions_v2` |
| `strip.allocated/max/free` | DB `portfolio_capital_ledger` (append-only) + `portfolios.max_capital` | free = max − allocated − `account_reservations` |
| `strip.exposure` | DB `positions_v2` ⋈ `accounts` (6 accounts · 3 venues) | gross Σ \|notional\| theo base ccy; ccy khác → FX policy `fx_usdc_usdt.v1` chỉ cho total |
| `return_30d`, `alpha` | DB `portfolio_equity_snapshots` + benchmark series (**MISSING**: bảng `benchmarks`/`bms_204` chưa có trong DB → Portal-owned hoặc external) | TWR 1d |
| `max_dd_30d.limit` | DB `risk_profiles` (rev đang hiệu lực, `account_policies`) | |
| `attention` | PORTAL incidents + DB `reconciliation_findings` | |
| `equity_segmented.eras` | **`portfolio_config_revisions` MISSING** → derive từ `portfolio_capital_ledger` + `portfolio_audit_log` (mỗi entry có `operation_id`, approval) — codex quyết tạo view/bảng revision | rev tăng theo thời gian; label từ change type + số tiền |
| `cross_portfolio` | DB `portfolios` ⋈ `portfolio_equity_snapshots` (mọi portfolio, cùng window) | sleeve ccy khác = hàng riêng |
| `config_log` | DB `portfolio_audit_log` ⋈ `portfolio_capital_ledger` ⋈ `operator_operations` (VERIFIED) ⋈ PORTAL approvals | since_rev_pnl từ `portfolio_equity_snapshots` |
| Structure `correlation.*`, `market_corr`, `leadership`, `influence_map`, `drawdown_overlap` | DERIVED từ `performance_snapshots` (per deployment 1h) + benchmark series; `sizing_decisions` cho exposure share; `positions_v2` cho symbol overlap | formula versions corr.v1/tail.v1/riskcontrib.v1/marginal.v1/regime.v2 do Portal derive (N10) |
| `what_if` | DERIVED `marginal.v1` trên covariance `cov_30d_v2` | luôn gắn `formula`; không ghi DB |
| Capital Ledger tab | DB `portfolio_capital_ledger` (+ `cash_ledger`/`margin_ledger` cho FX-normalized) ⋈ `operator_operations` | invariant after−before |
| Approvals tab | PORTAL approvals (N09) filter portfolio scope | |
| Incidents tab | PORTAL incidents ⋈ `reconciliation_findings` ⋈ `operator_operations` (rollback rb_31) | |
| Audit tab | DB `portfolio_audit_log` + `audit_log` + command journal (`operator_operations`) | state VERIFIED/RECORDED/PARTIAL |

## J.4 Việc codex cần chốt (không đoán)

1. **Candles**: nguồn OHLC — TS route hay Portal cache (ảnh hưởng N08/N11).
2. **Benchmarks**: nơi lưu `bms_204` series và version.
3. **Config revisions**: view derive từ ledger/audit hay bảng mới `portfolio_config_revisions`.
4. **Replay jobs**: bảng Portal-owned `execution_replay_jobs` + retention (N05).
5. **Incidents/approvals**: đã Portal-owned theo N09 — xác nhận schema id (`inc_*`, `AP-*`, `PX-*`, `EX-*`).
6. Formula versions (`twr.v1`, `corr.v1`, `tail.v1`, `riskcontrib.v1`, `marginal.v1`, `regime.v2`) đăng ký trong `compatibility_surface_registry`.

---

# Phụ lục K — BR-EX-52/53/54 · Accounts & Bindings, Binding Detail, Account/Broker 360: đặc tả đầy đủ

## K.1 Domain (từ DB guide + hi-fi 1g)

- **Binding** = một external account có credential tại một venue: DB `venue_accounts` (`external_account_ref`, `venue`, `env: MAINNET|TESTNET|PAPER_FEED`, `position_mode`) ⋈ `venue_credentials` (alias, scopes, state, fingerprint, rotation, **secret ở vault — không có cột nào đi qua API**) ⋈ `venue_rate_limits`.
- **Virtual account** = `accounts` (portal allocation ledger, `mode`, `external_account_ref`) ⋈ `strategy_deployments` ⋈ `portfolio_allocations`; equity từ `account_equity_snapshots`/`account_balances`/`margin_balances`; exposure từ `positions_v2`.
- **Physical truth** = `broker_account_sync_snapshots` (digest = content hash, source ws/REST, age) — "broker is truth"; paper/testnet không có broker truth (`TEST_FUNDS` / `SIMULATED`).
- **Invariant** Σ virtual ≤ physical: kiểm tra ở allocation time (`account_reservations`, `portfolio_capital_ledger`); màn chỉ hiển thị `headroom = physical − Σ virtual` và verdict server.
- **Recon**: `reconciliation_findings` (MISMATCH/BROKER_STALE/…) ⋈ PORTAL incidents; MISMATCH → orders fail closed, protective stays open (rule của Trading System).

## K.2 Endpoints

| Method · path | Trả về |
|---|---|
| `GET /api/v1/execution/bindings?filter=all\|live\|testnet\|paper\|issues` | `bindings-list.v1` |
| `GET /api/v1/execution/bindings/{binding_id}` | `binding-detail.v1` (+ SSE `binding.snapshot` khi N08) |
| `POST /api/v1/execution/bindings/{binding_id}/rotate-credential` (sau) | `202 {operation_id}` — plan → apply → verify, step-up, dual-key window |
| `GET /api/v1/execution/accounts/{account_id}` | `account-broker-360.v1.1` (additive) |

## K.3 `bindings-list.v1` — response mẫu (khớp `accounts.smoke.ts`)

```json
{
  "envelope": { "authority": "BROKER", "as_of": "2026-08-26T06:50:43Z", "freshness": "OK" },
  "summary": { "bindings": 5, "venues": 4, "virtual_accounts": 8 },
  "kpis": {
    "physical_equity": { "value": "43120.00", "ccy": "USDT", "binding_id": "binance_main_01", "live": true },
    "virtual_allocated": { "value": "41000", "ccy": "USDT", "headroom": "2120.00", "invariant_ok": true },
    "credentials": { "valid": 3, "expiring": [ { "alias": "DRB-01", "days": 6 } ], "otp": 1 },
    "findings": { "mismatch": 1, "incident_id": "inc_44", "account_id": "acct-live-grid-v21" },
    "sync_health": { "ok": 4, "total": 5, "na": [ { "binding_id": "dnse_main_01", "reason": "calendar" } ] }
  },
  "counts": { "all": 5, "live": 1, "testnet": 2, "paper": 2, "issues": 2 },
  "rows": [
    { "binding_id": "binance_main_01", "venue": "BINANCE", "env": "MAINNET", "purpose_note": null,
      "credential": { "alias": "BIN-01", "state": "VALID", "scopes": ["trade", "read"], "withdraw": false },
      "physical_equity": { "value": "43120.00", "ccy": "USDT" },
      "virtual": { "sum": "41000", "ccy": "USDT", "headroom": "2120.00" }, "accounts": 3,
      "sync": { "kind": "ws", "age_seconds": 4.1, "policy_seconds": 5, "snapshot_minutes": 5, "state": "OK" },
      "health": { "text": "1 MISMATCH", "tone": "bad", "link": { "label": "inc_44", "href": "/execution/operations/incidents/inc_44" } },
      "virtual_accounts": [
        { "account_id": "acct-live-grid-v21", "stage": "LIVE_FULL", "alpha": "Grid v2.1", "deployment_id": "dep_live", "portfolio": "PF-CRYPTO", "equity": "20354", "alloc": "18400", "sync": { "state": "HALTED", "text": "recon HALTED" }, "health": { "text": "MISMATCH Δ 0.0200 BTC", "tone": "bad" } }
      ] },
    { "binding_id": "deribit_main_01", "venue": "DERIBIT", "env": "PAPER_FEED", "purpose_note": "market-data feed only — no live binding yet",
      "credential": { "alias": "DRB-01", "state": "EXPIRING", "days_to_expiry": 6, "rotate_href": "/administration/actions?action=rotate_credential&binding=deribit_main_01" },
      "physical_equity": { "kind": "SIMULATED" }, "virtual": { "sum": "60000", "ccy": "USDC", "headroom": null, "simulated": true }, "accounts": 1,
      "sync": { "kind": "md_feed", "state": "OK" }, "health": { "text": "paper — no recon", "tone": "good" } }
  ]
}
```

## K.4 `binding-detail.v1` — response mẫu (rút gọn)

```json
{
  "binding": { "id": "binance_main_01", "venue": "BINANCE", "env": "MAINNET", "settle_ccy": "USDT", "position_mode": "NET", "open_findings": 1 },
  "capital": { "physical": "43120.00", "virtual_sum": "41000", "headroom": "2120.00", "segments": [ { "account_id": "acct-live-grid-v21", "label": "grid-v21", "allocated": "18400" }, { "account_id": "acct-live-carry-v32", "label": "carry-v32", "allocated": "14900" }, { "account_id": "acct-canary-mm-v11", "label": "mm-v11", "allocated": "7700" } ] },
  "credential": { "alias": "BIN-01", "state": "VALID", "scopes": ["trade", "read"], "withdraw_granted": false, "scope_verified_at": "2026-08-26T06:49:00Z",
    "secret": { "fingerprint": "9c41…e2", "vaulted": true }, "ip_allowlist": { "count": 2, "last_drift_check_at": "2026-08-26T06:50:02Z", "state": "OK" },
    "rotation": { "created_at": "2026-05-02", "rotated_at": "2026-07-15", "operation_id": "op_1160", "next_due_at": "2026-10-15", "policy_days": 90 },
    "rate_budget": { "used_per_min": 118, "limit_per_min": 1200, "order_budget_pct": 8 } },
  "sync_stream": [ { "t": "2026-08-26T10:41:52Z", "state": "MISMATCH", "digest": "4f2a…c1", "note": "BTCUSDT Δ 0.0200", "finding_id": "rf_2101", "incident_id": "inc_44" } ],
  "virtual_accounts": [ { "account_id": "acct-live-grid-v21", "stage": "LIVE_FULL", "alpha": "Grid v2.1", "deployment_id": "dep_live", "portfolio": "PF-CRYPTO", "allocated": "18400", "equity": "20354", "exposure": "12220", "recon": { "state": "MISMATCH", "delta": "0.0200 BTC", "incident_id": "inc_44" } } ],
  "audit": [ { "t": "2026-07-15T10:02:00Z", "text": "credential rotated (dual-key window 18m, zero downtime)", "operation_id": "op_1160", "actor": "Stan", "step_up": true } ]
}
```

## K.5 Quy tắc

| Mục | Quy tắc |
|---|---|
| `physical_equity` | chỉ có số khi env = MAINNET và có broker snapshot; TESTNET → `{kind: TEST_FUNDS}`, PAPER_FEED → `{kind: SIMULATED}` — frontend in chữ, không in số |
| `virtual.headroom` | `physical − Σ virtual` cùng ccy; null khi physical không có; ccy khác (USDC/VND) không quy đổi, `simulated:true` |
| `sync.state` | so `age_seconds` với `policy_seconds` của venue (`venue_rate_limits`/policy table): OK nếu ≤ policy, STALE nếu >, HALTED khi recon halted; `calendar` → `PAUSED_BY_CALENDAR` ngoài phiên (`venues.trading_sessions`) |
| `credential.state` | VALID / EXPIRING (≤14d) / OTP_FLOW (session token, manual re-auth) / REVOKED; **không bao giờ trả key material**; test `secret-leak`: payload không chứa chuỗi khớp key format |
| `health` | ưu tiên MISMATCH (incident) → HALTED → EXPIRING → calendar/N/A → READY |
| `counts.issues` | binding có ≥1 trong: MISMATCH, HALTED, EXPIRING, OTP_FLOW |
| `capital.segments` | theo `allocated` (ledger), không theo equity; bar re-prices với physical, allocation không đổi |
| `sync_stream` | immutable; `digest` = content hash snapshot; MISMATCH gắn `finding_id` + `incident_id`; SSE `binding.snapshot` prepend |
| `audit` | chỉ credential & structure (`audit_log` binding scope); tiền đi qua Capital Ledger |
| Account 360 `difference` | `diff.v1`: MATCH / DELTA với severity INFO\|WARN\|CRITICAL; balance Δ do funding accrual → INFO |
| Account 360 `masthead.headroom_state` | từ aggregate verdict (headroom.v1): EXCEEDED → chip HEADROOM BREACH + banner đỏ, orders fail closed trên **mọi** account của binding |

## K.6 Lỗi / trạng thái

`503 BINDINGS_PROJECTION_UNAVAILABLE` · `404 BINDING_NOT_FOUND` · `403 BINDING_READ_DENIED` · rotate: `409 ROTATION_IN_PROGRESS`, `428 STEP_UP_REQUIRED` · sync snapshot vắng → `sync.state: UNKNOWN` (không bao giờ OK).

## K.7 Test bắt buộc

1. invariant: mọi row MAINNET có `headroom == physical − virtual.sum` (decimal exact) và `invariant_ok == headroom ≥ 0`.
2. TEST_FUNDS/SIMULATED không có `value`.
3. secret-leak: serialize payload, regex key/secret/token → 0 match ngoài `fingerprint`.
4. `sync.state` khớp bảng policy cho fixture (OK/STALE/HALTED/PAUSED_BY_CALENDAR).
5. `counts` khớp filter rows; `issues` đúng định nghĩa.
6. binding-detail: Σ `segments.allocated == virtual_sum`; stream sorted desc; audit chỉ có action credential/structure.
7. account 360 v1.1: additive — client v1 vẫn đọc được.

---

# Phụ lục L — BR-EX-56/57 · Live Overview & Live Full Operations: đặc tả đầy đủ

## L.1 Domain (DB guide + hi-fi 1f/1e)

- **Live deployment** = `strategy_deployments` với `stage ∈ {LIVE_FULL, LIVE_CANARY}` và `mode = live`; canary mang `canary{day,total}` từ approval điều kiện (`AP-311`, `AP-259`) và envelope (max order 500, scale-up rule).
- **Session pnl** = pnl trong `execution_sessions` hiện tại, re-price theo mark (`positions_v2` × tick) net fee (`fills.fee`). **Exposure** = Σ|notional| `positions_v2` per deployment.
- **Health**: `FAIL_CLOSED` khi `reconciliation_findings` MISMATCH mở (PORTAL incident) hoặc broker sync STALE quá policy; `DEGRADED` khi realtime gap; `READY` còn lại. Rule Trading System: MISMATCH → new orders blocked, protective open; **canary scale-up blocked while any sibling account is fail-closed** (server rule, hiển thị trong note).
- **Protective ladder** = halt → reduce → emergency close (command policy v1 đã có), rollback plan `rb_31` (`operator_operations`) tested_at.
- **Lifecycle** = R1/R2 approvals (`alpha_ledger`/PORTAL approvals) → PAPER exit (PX) → SANDBOX exit (SX) → CANARY exit (CX) → LIVE since; mỗi bước link decision id.
- **Tape** = `fills` (FILL), quote refresh (market data heartbeat), incidents (MISMATCH) — ≤20, SSE `live.tape`.

## L.2 `live-overview.v1` — response mẫu (khớp `live.smoke.ts`)

```json
{
  "envelope": { "authority": "EXECUTION", "as_of": "2026-08-26T07:54:23Z", "freshness": "OK", "broker_as_of": "2026-08-26T07:54:22Z" },
  "summary": { "deployments": 4, "full": 2, "canary": 2, "venues_today": 1 },
  "kpis": {
    "live_capital": { "value": "46000", "full": "41000", "canary_envelope": "5000", "ccy": "USDT" },
    "session_pnl": { "value": "494.15", "ccy": "USDT", "live": true, "fees_included": true },
    "gross_exposure": { "value": "27819", "pct_of_capital": "0.605" },
    "fail_closed": { "n": 1, "of": 4, "deployment_id": "dep_live", "reason": "MISMATCH", "incident_id": "inc_44" },
    "protective_ladder": { "state": "ARMED", "steps": ["halt", "reduce", "close"] },
    "broker_sync": { "kind": "ws", "age_seconds": 1.4, "binding_id": "binance_main_01", "policy_seconds": 5 }
  },
  "counts": { "all": 4, "full": 2, "canary": 2, "issues": 1 },
  "venues": [ { "venue": "BINANCE", "live": true }, { "venue": "OKX", "live": false }, { "venue": "DERIBIT", "live": false }, { "venue": "VNM", "live": false } ],
  "rows": [
    { "deployment_id": "dep_live", "alpha": "Grid v2.1", "alpha_id": "av_2041", "stage": "LIVE_FULL", "since": "2026-08-01", "gate_id": "AP-330",
      "venue": "BINANCE", "account_id": "acct-live-grid-v21", "portfolio": "PF-CRYPTO", "alloc": "18400", "exposure": "12220",
      "session_pnl": { "value": "326.74", "live": true }, "dd": "-0.012", "pulse_60m": ["0","0.4","-0.2","1.1"],
      "health": { "state": "FAIL_CLOSED", "incident_id": "inc_44" },
      "note": "MISMATCH Δ 0.0200 BTC · new orders blocked, protective open · inc_44 open 16m · recon op_1253 AWAITING_APPLY",
      "note_links": [ { "label": "inc_44", "href": "/execution/operations/incidents/inc_44" }, { "label": "op_1253 AWAITING_APPLY", "href": "/execution/operations?operation=op_1253" } ] },
    { "deployment_id": "dep_63", "alpha": "MM v1.1", "stage": "LIVE_CANARY", "canary": { "day": 2, "total": 14 }, "gate_id": "AP-259",
      "venue": "BINANCE", "account_id": "acct-canary-mm-v11", "portfolio": "PF-CRYPTO", "alloc": "7700", "exposure": "4940", "session_pnl": { "value": "20.05", "live": true }, "dd": "-0.003",
      "health": { "state": "READY" }, "note": "condition: capacity cap 10,000 until 2026-09-02 (expires in 7d, owner Lan)", "note_links": [ { "label": "waivers & conditions", "href": "/governance/waivers" } ] }
  ],
  "tape": [ { "t": "2026-08-26T07:54:14Z", "deployment_id": "dep_live_c32", "event": "FILL", "text": "FILL BTCUSDT 0.0080 @ 61,452.74", "tone": "mute" }, { "t": "2026-08-26T10:41:52Z", "deployment_id": "dep_live", "event": "MISMATCH", "text": "MISMATCH — fail-closed", "tone": "bad" } ]
}
```

## L.3 `live-full.v1.1` — bổ sung (rút gọn)

```json
{
  "masthead": { "alpha": "Grid v2.1", "portfolio": "PF-CRYPTO", "venue": "BINANCE", "active": true, "readiness": "READY", "stage": "LIVE_FULL", "promoted_from": "LIVE_CANARY", "promoted_at": "2026-08-01" },
  "meta": { "artifact_digest": "sha256:41bb7d…c4", "canary_exit_id": "CX-08", "live_approval_id": "AP-330", "portfolio_id": "PF-CRYPTO", "deployment_id": "dep_88", "account_id": "acct-live-grid-v21", "venue": "BINANCE" },
  "lifecycle": [ { "stage": "R1", "decision_id": "AP-118" }, { "stage": "R2", "decision_id": "AP-152" }, { "stage": "PAPER", "decision_id": "PX-22" }, { "stage": "SANDBOX", "decision_id": "SX-14" }, { "stage": "CANARY", "decision_id": "CX-08" } ], "current": { "stage": "LIVE", "since": "2026-08-01" },
  "kpis": { "capital": { "value": "60000.00", "ccy": "USDT" }, "gross_exposure": "41080", "net_exposure": "12140", "risk_envelope_used_pct": "0.58", "daily_loss": { "value": "-0.004", "limit": "-0.02" }, "broker_freshness_seconds": 1.1 },
  "broker_truth": { "sync": { "state": "OK", "age_seconds": 1.1, "digest": "4f2a…" }, "last_recon": { "verdict": "clean", "at": "2026-08-26T09:58:00Z", "id": "rec_902" }, "positions_match": { "n": 4, "of": 4 }, "open_orders_match": { "n": 2, "of": 2 }, "balance_delta": { "value": "0.00", "ccy": "USDT" }, "mismatch": null },
  "open_exposure": { "positions": [ { "symbol": "BTCUSDT", "side": "LONG", "qty": "0.4000", "upnl": "2140.20", "leverage": "1.3" } ], "open_orders": { "count": 2, "type": "LIMIT", "pending_exposure": "3240.00" }, "reservations": 3 },
  "incidents": { "active": [], "ladder": { "steps": ["halt", "reduce", "emergency_close"], "rollback_plan": { "id": "rb_31", "tested_at": "2026-07-28" } }, "last_operation": { "id": "op_1240", "kind": "allocation scale", "verdict": "VERIFIED", "at": "2026-08-01" } },
  "contribution_30d": { "bars": [ { "day": "2026-07-28", "value": "32.10" } ], "total": "3102.44", "cost_drag": "-212.08", "formula": "contrib.v1" }
}
```

## L.4 Quy tắc

| Mục | Quy tắc |
|---|---|
| `health.state` | FAIL_CLOSED > DEGRADED > READY; FAIL_CLOSED ⇔ có incident MISMATCH mở hoặc sync STALE > policy; **không bao giờ** READY khi sync vắng |
| `fail_closed.n` | đếm rows FAIL_CLOSED; `of` = tổng live rows |
| `session_pnl` | per tick khi `live:true`; đóng phiên → `live:false`, giá trị cuối |
| `pulse_60m` | 24 điểm, 2.5 phút/điểm, pnl delta chuẩn hoá; thiếu → null (frontend vẽ đường phẳng mờ) |
| canary note | server soạn từ envelope + sibling state: "scale-up blocked while any sibling account is fail-closed" chỉ khi thực sự có sibling FAIL_CLOSED |
| condition note | từ approval conditions: `expires_in` tính server; owner |
| `lifecycle[].decision_id` | phải tồn tại (approvals/exit reviews); thiếu → `null` + frontend in stage không link |
| `broker_truth.mismatch` | object khi MISMATCH: `{symbol, local, broker, delta, detected_at, finding_id}` → frontend đổi panel sang banner đỏ (đã có `.exec-mismatch-slot`) |
| `open_exposure.positions[].upnl` | string signed; leverage string |
| `contribution_30d.bars` | 30 ngày, net fees; `cost_drag` âm |
| Actions | halt/reduce/emergency_close = command policy v1; `step_up_required:true`; PARTIAL không render xanh |

## L.5 Lỗi / trạng thái
`503 LIVE_PROJECTION_UNAVAILABLE` · tape SSE vắng → tape tĩnh từ GET · `mismatch` + `sync.state` mâu thuẫn → server trả `completeness:"PARTIAL"` + warning.

## L.6 Test bắt buộc
1. health rule: fixture có 1 MISMATCH → đúng 1 FAIL_CLOSED, `fail_closed.n == 1`.
2. `counts` khớp rows theo filter; `issues` == FAIL_CLOSED + DEGRADED.
3. `live_capital.value == full + canary_envelope`.
4. lifecycle decision ids tồn tại; `current.since == promoted_at`.
5. `positions_match.n ≤ of`; mismatch object ⇔ readiness BLOCKED.
6. tape sorted desc, ≤20; SSE event schema = GET item.
7. v1.1 additive — client v1 đọc được.

## L.7 Bổ sung — rail "Guard" trên các stage workbench (BR-EX-58 · blocker catalog)

- **Vấn đề:** rail hiển thị mã blocker thô (`PRODUCTION_COMMAND_INACTIVE`, `LIVE_SOURCE_UNAVAILABLE`, …) từ 3–4 nguồn; operator không biết ai sở hữu, từ khi nào, mở ở đâu. Frontend đã gộp trùng theo mã và nhóm nguồn (`lifecycle · broker consistency · realtime`), nhưng nhãn người đọc, owner, `since`, link xử lý và thứ tự ưu tiên phải là **catalog server**.
- **Cần:** `GET /api/v1/execution/blockers/catalog` → `blocker-catalog.v1`: `[{code, label, severity: BLOCKING|WATCH, owner: TRADING_SYSTEM|PORTAL|BROKER|OPERATOR, resolves_via: {kind: activation|approval|source|operation|incident, href_template}, doc_href, rank}]` (ETag, đổi theo release). Và trong mọi contract stage (`paper/sandbox/canary/live-*.v1`): `blockers[{code, since, source: lifecycle|broker_consistency|projection_continuity|realtime, ref?: {kind, id, href}}]` thay cho `blockerCodes: string[]`.
- **Hiển thị:** rail = panel "GUARD" mono: dòng 1 = protective ladder + policy; danh sách blocker = `severity edge · code (mono 11) · label · owner chip · since · →` sắp theo `rank`; mã không có trong catalog → in thô (không bịa).
- **Fixture:** `execution-blocker-catalog.valid.json`. Test: mọi `blockerCodes` trong các fixture stage tồn tại trong catalog (hoặc test ghi nhận thiếu).

## L.8 Nguồn dữ liệu theo cột thật (DB guide 88 bảng) — BR-EX-56 Live Overview

| field | bảng · cột | logic |
|---|---|---|
| `rows[]` (tập live) | `strategy_deployments(deployment_id, strategy_id, account_id, mode, venue, currency, active, portfolio_id, state, risk_profile_id, account_policy_id)` | `mode='live' AND active` ; stage từ `state` (LIVE_FULL/LIVE_CANARY) hoặc `metadata_v2.stage` — codex chốt cột |
| `rows[].alpha`, `alpha_id` | `strategies` (name, version) qua `strategy_id` | label theo BR-EX-55 |
| `rows[].since`, `gate_id` | PORTAL approvals (AP-*) + `operator_operations(operation_type='deployment.activate_*', scope_id=deployment_id, status='VERIFIED', updated_at)` | since = updated_at của op VERIFIED cuối |
| `rows[].canary{day,total}` | PORTAL approval conditions (AP-311 review day 9/14) hoặc `strategy_deployments.metadata_v2.canary` | total = review window |
| `rows[].alloc` | `portfolio_allocations(allocated_capital, max_capital, currency, state)` by `deployment_id` | state ACTIVE |
| `rows[].exposure` | `positions_v2(notional, signed_qty, mark_price)` by `strategy_id, account_id, mode='live', venue`, `closed_at IS NULL` | Σ\|notional\| |
| `rows[].session_pnl` | `execution_sessions` (session hiện tại: `state`, `started_at`) + `positions_v2.realized_pnl + unrealized_pnl` + `account_equity_snapshots.fee_total/net_pnl` (delta từ `started_at`) | live = re-price `unrealized_pnl` với `mark_price` mới nhất (tick) |
| `rows[].dd` | `account_equity_snapshots.drawdown` (mới nhất theo deployment_id) | ratio string |
| `rows[].pulse_60m` | `account_equity_snapshots(ts, net_pnl)` 60 phút gần nhất / 2.5 phút | 24 điểm |
| `rows[].health` | `reconciliation_findings(finding_type='MISMATCH', status='OPEN', severity)` + `broker_account_sync_snapshots(status, synced_at)` vs policy + `service_heartbeats(status, last_seen_at)` | FAIL_CLOSED / DEGRADED / READY như L.4 |
| `rows[].note` | session counters `execution_sessions(submitted_count, sent_count, filled_count, partial_fill_count, broker_rejected_count)` ("14 orders · 12 fills"), `sizing_decisions.leverage/risk_percent` ("risk utilization 52%"), `risk_profiles(max_notional_order)` ("max order 500"), conditions (PORTAL) | server soạn; links = ids |
| `kpis.live_capital` | Σ `portfolio_allocations.allocated_capital` (live deployments); `canary_envelope` = Σ của LIVE_CANARY | ccy base |
| `kpis.session_pnl` | Σ rows session_pnl | |
| `kpis.gross_exposure` | Σ rows exposure; `pct_of_capital` = / live_capital | |
| `kpis.fail_closed` | count health FAIL_CLOSED; `incident_id` từ PORTAL incidents gắn `finding_id` | |
| `kpis.protective_ladder` | PORTAL command policy (halt/reduce/close available) + `operator_operations(operation_type='rollback.test', status)` | ARMED khi cả 3 bước khả dụng |
| `kpis.broker_sync` | `broker_account_sync_snapshots(source='ws'\|'rest', synced_at)` mới nhất theo `external_account_ref`; policy từ venue policy | age = now − synced_at |
| `tape[]` | `domain_events(event_ts, event_type ∈ {FILL, QUOTE_REFRESH, RECON_MISMATCH}, strategy_id, account_id, payload)` ⋈ `fills` | ≤20 desc; SSE `live.tape` từ cùng stream |
| `venues[]` | `venues` ⋈ live deployments | `live` = có ≥1 deployment live |

## L.9 Nguồn dữ liệu theo cột thật — BR-EX-57 Live Full v1.1

| field | bảng · cột |
|---|---|
| `masthead.alpha/portfolio/venue/stage/promoted_*` | `strategies`, `strategy_deployments(portfolio_id, venue, state)`, `operator_operations` (activate op VERIFIED) |
| `meta.artifact_digest, canary_exit_id, live_approval_id` | `alpha_ledger` (artifact digest) · PORTAL exit reviews (CX) · PORTAL approvals (AP) |
| `lifecycle[]` | `alpha_ledger` (R1/R2 refs) + PORTAL exit reviews PX/SX/CX + `operator_operations` |
| `kpis.capital` | `portfolio_allocations.allocated_capital` |
| `kpis.gross_exposure / net_exposure` | `performance_snapshots(exposure_long, exposure_short)` mới nhất per deployment: gross = long + short, net = long − short |
| `kpis.risk_envelope_used_pct` | gross_notional / `risk_grants.max_gross_notional` (grant còn hiệu lực) hoặc `risk_profiles.max_notional_position` |
| `kpis.daily_loss{value, limit}` | `account_equity_snapshots.net_pnl` hôm nay / equity; limit = `risk_profiles.max_daily_loss` |
| `kpis.broker_freshness_seconds` | now − `broker_account_sync_snapshots.synced_at` |
| `broker_truth.sync{state, age, digest}` | `broker_account_sync_snapshots(status, synced_at, execution_state_digest)` |
| `broker_truth.last_recon` | `reconciliation_findings` (rec id, `created_at`, verdict clean khi 0 finding actionable) hoặc `operator_operations(operation_type='reconcile.dry_run')` |
| `broker_truth.positions_match{n,of}` | so `positions_v2` với `broker_account_sync_snapshots.positions` (JSON) theo instrument |
| `broker_truth.open_orders_match` | `orders(status ∈ working)` vs `broker_account_sync_snapshots.open_orders` |
| `broker_truth.balance_delta` | `account_balances` vs `broker_account_sync_snapshots.balances` |
| `broker_truth.mismatch` | `reconciliation_findings(details{symbol, local, broker, delta}, created_at, finding_id)` |
| `open_exposure.positions[]` | `positions_v2(instrument_id→instruments.symbol, side, quantity, unrealized_pnl)`; leverage = notional / (equity share) hoặc `sizing_decisions.leverage` |
| `open_exposure.open_orders` | `orders(status working)` count + `order_pending_exposure` Σ |
| `open_exposure.reservations` | `account_reservations` count |
| `incidents.active[]` | PORTAL incidents ⋈ `reconciliation_findings` |
| `incidents.ladder.rollback_plan` | `operator_operations(operation_type='rollback.plan', scope_id, status, updated_at)` |
| `incidents.last_operation` | `operator_operations` mới nhất theo scope deployment (`operation_type`, `status`, `updated_at`) |
| `contribution_30d.bars` | `account_equity_snapshots(ts, net_pnl)` nhóm theo ngày 30d; `cost_drag` = Σ `fee_total` + `funding_pnl` âm; formula `contrib.v1` |

## L.10 Quyết định codex phải chốt (không đoán)

1. Cột stage LIVE_FULL/LIVE_CANARY: `strategy_deployments.state` hay `metadata_v2.stage` — chọn một và ghi vào contract.
2. Session pnl: dùng `execution_sessions` boundary hay "ngày giao dịch UTC"; frontend chỉ hiển thị `session_pnl.window`.
3. Risk envelope used: mẫu số là `risk_grants.max_gross_notional` (grant động) hay `risk_profiles.max_notional_position` (tĩnh) — hi-fi ghi "58%".
4. Tape: `domain_events` có `QUOTE_REFRESH`? nếu không → chỉ FILL/MISMATCH.
5. Canary review day/total: nguồn conditions của approval hay `metadata_v2` — BR-EX-35 đã hỏi, chưa chốt.
6. Sibling fail-closed rule (scale-up blocked): server đánh dấu `rows[].canary.scale_up_blocked_by` để note không suy diễn.

---

# Phụ lục M — BR-EX-59 · Canary Control Room v1.1: đặc tả đầy đủ

## M.1 Domain (hi-fi 1e + DB guide)

- Canary = `strategy_deployments` với stage LIVE_CANARY, capital envelope nhỏ (5,000) do **canary dual approval AP-311** đặt (PORTAL approvals + conditions: day/total, checkpoints d3/d7, exit d14). Envelope caps từ `risk_grants(max_gross_notional, max_net_notional, expires_at)` + `risk_profiles(max_notional_order, max_notional_position, max_daily_loss, max_order_per_minute)`; breach ⇒ auto-halt (Trading System rule).
- **Readiness** GUARDED bình thường; DEGRADED khi `broker_account_sync_snapshots.synced_at` cũ hơn policy → scale blocked, protective open, runtime vẫn ACTIVE.
- **Exit readiness gates** (server-enforced, màn chỉ mirror): min duration (day ≥ total), drift vs paper twin (`dep_94`, so `performance_snapshots` live vs paper: fill Δ, slip Δ ≤ tol), envelope discipline (0 breach = 0 `reconciliation_findings`/`operator_operations` halt do envelope), reconciliation clean streak, incidents 0 critical. "Elapsed time alone never promotes."
- **Promotion decision** = Canary Exit Review (PORTAL exit review CX-*) + dual approval → LIVE_FULL; options HOLD/REDUCE/ROLLBACK/REQUEST_SCALE đi qua plan → apply → verify.

## M.2 Response mẫu (rút gọn, khớp `canary.smoke.ts`)

```json
{
  "masthead": { "alpha": "Grid v2.1", "portfolio": "PF-CRYPTO", "venue": "BINANCE", "active": true, "readiness": "GUARDED", "trial": { "day": 9, "total": 14 }, "exit_review_at": "2026-08-31T08:00:00Z", "real_capital": true },
  "meta": { "artifact_digest": "sha256:41bb7d…c4", "r1_id": "AP-118", "r2_id": "AP-152", "sandbox_exit_id": "SX-14", "canary_approval_id": "AP-311", "portfolio_id": "PF-CRYPTO", "deployment_id": "dep_88", "account_id": "acct-canary-grid", "venue": "BINANCE", "envelope_rev": 3 },
  "lifecycle": [ { "stage": "R1", "decision_id": "AP-118" }, { "stage": "R2", "decision_id": "AP-152" }, { "stage": "PAPER", "decision_id": "PX-22" }, { "stage": "SANDBOX", "decision_id": "SX-14" } ], "current": { "stage": "CANARY", "day": 9, "total": 14 }, "next": { "stage": "LIVE" },
  "kpis": { "canary_capital": { "value": "5000.00", "ccy": "USDT" }, "net_pnl_trial": { "value": "110.79", "live": true, "window_days": 9 }, "drawdown": "-0.008", "risk_envelope_used_pct": "0.34", "broker_freshness": { "seconds": 3.4, "state": "OK" } },
  "stage_lines": { "join_digest": "sha256:41bb7d…c4", "canary_start_at": "2026-08-13T00:00:00Z", "backtest": [ { "t": "…", "v": "1.000" } ], "paper": [], "live": [], "formula": "equity_projection.v1", "buckets": "1h" },
  "envelope": { "approval_id": "AP-311", "rows": [ { "key": "capital", "used": "5000", "cap": "5000", "pct": "1.00", "at_cap": true }, { "key": "max_drawdown", "used": "0.008", "cap": "0.02", "pct": "0.40" }, { "key": "orders_today", "used": "12", "cap": "40", "pct": "0.30" }, { "key": "observation_duration", "used": "9", "cap": "14", "pct": "0.64" } ], "limits": { "max_order": "500", "max_position": "2500", "daily_loss_pct": "0.01", "rate_per_min": 5 }, "breach_policy": "auto_halt" },
  "positions": [ { "symbol": "BTCUSDT", "side": "LONG", "qty": "0.0080", "entry": "61120.00", "upnl": "36.99", "ack_p50_ms": 240 } ], "orders_today": { "open": 1, "fills": 12, "rejects": 0 },
  "incidents": { "critical_open": 0, "last_recon": { "verdict": "clean", "at": "2026-08-26T09:44:00Z", "id": "rec_881" }, "partial_operations": 0, "scale_blockers": [] },
  "trial_timeline": { "days": 14, "today": 9, "checkpoints": [ { "day": 3, "review_id": "cr_301", "verdict": "envelope clean" }, { "day": 7, "review_id": "cr_307", "verdict": "drift within tolerance" } ], "exit_day": 14 },
  "exit_readiness": { "done": 4, "total": 5, "gates": [ { "key": "min_duration", "ok": false, "text": "day 9/14" }, { "key": "drift", "ok": true, "text": "fill Δ +0.3bp · slip Δ +0.8bp · tol 5bp", "ref": { "kind": "deployment", "id": "dep_94" } }, { "key": "envelope", "ok": true, "text": "0 breaches in 9d" }, { "key": "reconciliation", "ok": true, "text": "clean streak 9d", "ref": { "kind": "recon", "id": "rec_881" } }, { "key": "incidents", "ok": true, "text": "0 critical in trial window" } ], "request_exit_review": { "enabled": false, "unlock_rule": "5/5 (d14, or earlier by waiver)" } },
  "marginal": { "corr_portfolio": { "value": "0.42", "samples": 216, "window": "9d live" }, "corr_benchmark": "0.55", "concentration_if_scaled": { "factor": 5, "top1_pct": "0.74" }, "grade": "C", "formula": "marginal.v1" },
  "decision": { "options": ["HOLD", "REDUCE", "ROLLBACK", "REQUEST_SCALE"], "evidence_pack_href": "/governance/exit-reviews/EX-771" }
}
```

## M.3 Nguồn theo cột thật

| field | bảng · cột |
|---|---|
| `masthead.trial`, `exit_review_at`, `trial_timeline.checkpoints` | PORTAL approvals `AP-311` conditions (review window, checkpoint days) + PORTAL exit reviews `cr_*`; `since` = `operator_operations(operation_type='deployment.activate_canary', status='VERIFIED', updated_at)` |
| `masthead.readiness` | `broker_account_sync_snapshots(synced_at)` vs venue policy; `service_heartbeats` |
| `kpis.canary_capital` | `portfolio_allocations(allocated_capital)` |
| `kpis.net_pnl_trial` | `account_equity_snapshots(net_pnl, ts ≥ canary_start)` + `positions_v2.unrealized_pnl` re-priced |
| `kpis.drawdown` | `account_equity_snapshots.drawdown` |
| `kpis.risk_envelope_used_pct` | `positions_v2.notional` Σ / `risk_grants.max_gross_notional` |
| `stage_lines` | `performance_snapshots`/`account_equity_snapshots.equity` cho dep_88 (live) và dep_94 (paper twin, `mode='paper'`), backtest từ `alpha_ledger` run cùng `artifact_digest` |
| `envelope.rows` | capital: allocations; max_drawdown: snapshots vs `risk_profiles.max_drawdown`; orders_today: `execution_sessions.submitted_count` hoặc `orders` count hôm nay vs cap (approval condition); observation: day/total |
| `envelope.limits` | `risk_profiles(max_notional_order, max_notional_position, max_daily_loss, max_order_per_minute)` |
| `positions[]` | `positions_v2` ⋈ `instruments.symbol`; `ack_p50_ms` từ `domain_events` (ACK − SUBMIT) |
| `orders_today` | `orders`/`fills` hôm nay; rejects = `execution_sessions.broker_rejected_count` |
| `incidents` | `reconciliation_findings(severity='CRITICAL', status='OPEN')`, last recon `rec_*`, `operator_operations(status='PARTIAL')`, scale blockers = command policy blockerCodes |
| `exit_readiness.gates` | server rule engine (PORTAL_CONTROL) — inputs như trên |
| `marginal` | DERIVED corr.v1/marginal.v1 trên `performance_snapshots` (9d) |

## M.4 Lỗi / test bắt buộc
- `409 SCALE_BLOCKED {reason: BROKER_STALE|SIBLING_FAIL_CLOSED|ENVELOPE_AT_CAP}` cho REQUEST_SCALE; `428 STEP_UP_REQUIRED`.
- Tests: (1) gates.done == count(ok) và `request_exit_review.enabled ⇔ done==total || waiver`; (2) `trial.day` khớp `today` của timeline và `current.day`; (3) `envelope.rows[].pct == used/cap` (decimal exact), `at_cap ⇔ pct ≥ 1`; (4) 3 series chung `join_digest`; (5) readiness DEGRADED ⇔ sync age > policy; (6) v1.1 additive.

---

# Phụ lục N — Ma trận màn ↔ request (rà 2026-08-26) và các lỗ còn lại

| Màn (route) | Hi-fi | Frontend | Request (§7.2) | Smoke xoá khi | Lỗ / ghi chú |
|---|---|---|---|---|---|
| Command Center `/execution/command-center` | 5a | done | 42 · 44 · 45 · 43 (stream) | 42/44/45 · 43 | — |
| Operations Queue `/execution/operations` | 4e | done | 47 · 43 (alerts) · 32 · 33 | 47 | — |
| Incident Detail `/execution/operations/incidents/:id` | 4d | done | 46 · 43 (market band) | 46 | — |
| Full Blotter `/deployments/blotter` | 4c | done | 48 · 24 · 25 · 43 | 48 | — |
| Alpha Fleet `/deployments/alphas` | list | done | 49 · 43 · 55 | 49 | feature registry vẫn COMMISSIONED → codex đổi `data_mode` khi 49 giao |
| Alpha 360 `/deployments/alphas/:id` (Overview/Insight/Replay) | 2a/2b | done | 34 · 40 (tiles) · 50 (replay) · 55 | 34/40 · 50 | tab Positions/Orders/Risk/Sessions/Accounting/Recon/Audit dùng contract v1 hiện có — chưa restyle theo hi-fi (đợt sau) |
| Portfolio 360 `/deployments/portfolios/:id` (6 tab) | 3a | done | 51 (+I.7) · 43 | 51 | Report pack / Rebalance plan = action sau (I.1) |
| Accounts & Bindings `/deployments/accounts` | list | done | 52 · 43 | 52 | registry chưa có screen riêng — dùng feature canonical route |
| Binding Detail `/deployments/accounts?binding=` | detail | done | 53 (+ rotate action) | 53 | route dùng query param vì registry chưa có `/bindings/:id` → codex/Bobby chốt route |
| Account/Broker 360 `/deployments/accounts/:id` | 1g | done | 54 · 55 | — | — |
| Live Overview `/deployments/live` | entry | done | 56 · 43 | 56 | — |
| Live Full `/deployments/live/:id` | 1f | done | 57 · 41 · 58 (rail) | 57 · 41 | — |
| Canary Control Room `/deployments/live/:id/canary` | 1e | done | 59 · 41 · 58 | 59 · 41 | — |
| Paper Workbench `/deployments/paper/:id` | 1c | grammar v3 + visuals 41 | 41 · (hi-fi pass chưa làm) | 41 | **chờ hi-fi từ Bobby** để restyle như Live/Canary |
| Sandbox Overview `/deployments/sandbox` | entry 1d | done (2026-08-28) | 60 · 43 | 60 | registry `SANDBOX_TRADING_SCREEN` vẫn `data_mode: NONE` → codex đổi khi 60 giao (O.5.1) |
| Sandbox Certification `/deployments/sandbox/:id` | 1d | done (2026-08-28) | 61 · 41 · 58 | 61 · 41 | command routes `sandbox.*` đi cùng 61 (O.3.3) |
| Approval Inbox `/governance/approvals` | 2c | grammar v3 | BR-EX-30 (cũ) | — | hi-fi pass chưa làm |
| Gate R1/R2 review `/governance/approvals/:id/r1|r2` | 2d/2e | grammar v3 | 30 · 35 | — | như trên |
| Paper Exit Review `/governance/exit-reviews/:id` | 1c' | grammar v3 | 36 (cũ) | — | như trên |
| Admin Action Drawer `/administration/actions` | 5b | grammar v3 | 37 (cũ) | — | rotate credential / rebalance plan / decision options sẽ đi qua đây (53, 51, 59) |
| Alerts (sidebar hi-fi) | — | **không có màn** | 43 (summary) | — | hi-fi có mục "Alerts" — cần hi-fi + registry screen |
| Promotion Timeline, Waivers & Conditions (sidebar hi-fi) | — | **không có màn** | — | — | cần hi-fi + registry screen; link `waivers & conditions` tạm trỏ Approval Inbox |
| Reconciliation (sidebar hi-fi) | — | **không có màn** | — | — | link `rec_*` tạm trỏ Account 360; cần hi-fi |
| Cross-screen | — | breadcrumb theo route | 55 (entity names) · 58 (blocker catalog) | 55 | — |

**Việc frontend đã tự sửa trong đợt rà (không cần backend):** breadcrumb list-route không mang entity fixture; incident h1 = id trên route; canary rows → Canary room; link approvals mang `/r1|/r2`; passport/evidence anchor → tab Audit; rail/strip/telemetry một grammar trên mọi surface.


---

# Phụ lục O — BR-EX-60 · Sandbox Overview v1 và BR-EX-61 · Sandbox Certification v1.1

> Viết 2026-08-28 sau khi dựng hai màn theo hi-fi WF 1d
> (`HiFi Sandbox Overview.dc.html`, `HiFi Sandbox Certification.dc.html`).
> Frontend đang chạy bằng `apps/portal/frontend/src/execution/sandbox.smoke.ts`;
> **xoá module đó khi hai contract dưới đây giao**. Contract `sandbox-certification.v1`
> hiện có vẫn giữ nguyên và **không được đổi kiểu trường nào** — O.3 chỉ thêm
> (additive), như cách BR-EX-57 làm với `live-full.v1.1`.

## O.1 Domain — certification là gì (hi-fi 1d + DB guide)

Sandbox **không phải** "paper có thật hơn". Nó là **cổng chứng nhận tích hợp
venue**: chứng minh rằng đúng cặp `(alpha artifact, venue, credential,
account binding)` đặt được lệnh thật trên testnet, khớp, huỷ, và trạng thái nội
bộ khớp trạng thái broker — trước khi bất kỳ đồng vốn thật nào được cấp.

Bảy bước, thứ tự do server quyết (frontend **không** tự suy ra bước hiện tại):

| # | step_key | Ý nghĩa | Nguồn sự thật |
|---|---|---|---|
| 1 | `account` | virtual account tồn tại đúng `(strategy_id, account_id, mode='sandbox', venue)` | `accounts` ⋈ `strategy_deployments` |
| 2 | `binding` | binding tới physical account đã verify | `venue_accounts(external_account_ref)` + `venue_credentials(status)` |
| 3 | `broker_sync` | snapshot REST/ws còn tươi so với policy venue | `broker_account_sync_current_state(synced_at, status)` |
| 4 | `recon_dry_run` | dry-run reconcile sạch — **fail-closed** nếu có finding CRITICAL đang OPEN | `reconciliation_findings(mode='sandbox', status='OPEN')` |
| 5 | `smoke` | smoke plan bounded được duyệt và đã apply | PORTAL smoke plan `sp_*` + `operator_operations` |
| 6 | `cleanup` | không còn open order / residual position / reservation, đã final sync | `orders(status IN ACCEPTED/PARTIALLY_FILLED)`, `positions_v2`, `order_pending_exposure` |
| 7 | `exit_review` | Sandbox Exit Review `SX-*` được yêu cầu và duyệt | PORTAL exit reviews |

Hai luật miền phải hiện trên UI và **không được suy diễn ở frontend**:

1. **Test funds không bao giờ vào NAV portfolio.** Equity testnet là bằng chứng
   chứng nhận, không phải vốn. Server phải trả nó ở nhánh riêng
   (`test_fund_equity`), không nằm trong bất kỳ tổng NAV nào.
2. **Certification đứng im không tự hết hạn.** `in_stage_days` lớn (36d) là một
   *tín hiệu*, không phải lỗi hiển thị; server trả `stalled: true` theo ngưỡng
   của nó, frontend chỉ tô. Không có timeout ngầm nào ở phía UI.

Và một luật thứ ba mà hi-fi nói bằng chữ nhỏ nhưng là điều kiện đóng của bước 5:
**chứng nhận đòi mọi order type mà alpha dùng trong production.** Một alpha dùng
`REDUCE_ONLY` ở nhánh thoát mà chưa từng gửi `REDUCE_ONLY` trên testnet thì chưa
được chứng nhận, dù 100% lệnh khác đều khớp.

## O.2 BR-EX-60 · `sandbox-overview.v1` — màn entry

`GET /api/v1/execution/sandbox/overview` → `sandbox-overview.v1`

### O.2.1 Response mẫu (khớp `sandbox.smoke.ts`, rút gọn)

```json
{
  "as_of": "2026-08-28T04:54:32Z",
  "summary": { "in_certification": 2, "venues": 2, "test_funds_only": true },
  "kpis": {
    "in_certification": { "value": 2, "note": "certification = 7-step gate to canary" },
    "halted": { "value": 2, "by_finding": 1, "by_operator": 1 },
    "open_findings": { "value": 1, "worst_severity": "CRITICAL", "ref": { "kind": "deployment", "id": "dep_91" } },
    "test_fund_equity": { "value": "20000", "ccy": "USDT", "enters_portfolio_nav": false },
    "broker_sync": { "age_seconds": 10, "policy_seconds": 60, "state": "OK", "detail": "OKX rest · BIN-T1 ws OK" }
  },
  "rows": [
    {
      "deployment_id": "dep_77", "alpha": "Carry v3.2", "alpha_version_id": "av_2103",
      "venue": "OKX_TESTNET", "account_id": "acct-sbx-carry-okx",
      "portfolio_id": "PF-CRYPTO", "target_portfolio_id": "PF-MAIN",
      "target_approval": { "id": "AP-352", "status": "PENDING" },
      "certification": {
        "passed": 5, "total": 7, "current_step": "smoke",
        "steps": [
          { "key": "account", "state": "PASS" }, { "key": "binding", "state": "PASS" },
          { "key": "broker_sync", "state": "PASS" }, { "key": "recon_dry_run", "state": "PASS" },
          { "key": "smoke", "state": "PENDING" }, { "key": "cleanup", "state": "NOT_STARTED" },
          { "key": "exit_review", "state": "NOT_STARTED" }
        ]
      },
      "runtime_state": "HALTED", "halt_reason": "OPERATOR",
      "in_stage_days": 9, "stalled": false,
      "next_step": { "label": "run smoke activation", "action_key": "sandbox.smoke_open", "enabled": false, "blocker_codes": [] },
      "lineage": { "r1_id": "AP-101", "r2_id": "AP-207", "paper_exit_id": "PX-29" },
      "note": "smoke plan approved, awaiting apply · cleanup + exit review remain"
    },
    {
      "deployment_id": "dep_91", "alpha": "Grid v2.1", "alpha_version_id": "av_2041",
      "venue": "OKX_TESTNET", "account_id": "acct-sbx-grid-okx",
      "portfolio_id": "PF-CRYPTO", "target_portfolio_id": null, "target_approval": null,
      "certification": { "passed": 3, "total": 7, "current_step": "recon_dry_run",
        "steps": [ { "key": "account", "state": "PASS" }, { "key": "binding", "state": "PASS" }, { "key": "broker_sync", "state": "PASS" }, { "key": "recon_dry_run", "state": "FAIL" }, { "key": "smoke", "state": "BLOCKED" }, { "key": "cleanup", "state": "NOT_STARTED" }, { "key": "exit_review", "state": "NOT_STARTED" } ] },
      "runtime_state": "HALTED", "halt_reason": "FINDING",
      "in_stage_days": 36, "stalled": true,
      "next_step": { "label": "resolve finding → re-run dry-run", "action_key": "sandbox.reconcile_dry_run", "enabled": false, "blocker_codes": ["CRITICAL_FINDING_OPEN"] },
      "lineage": { "r1_id": "AP-118", "r2_id": "AP-152", "paper_exit_id": "PX-22" },
      "note": "CRITICAL: position mismatch BTC-USDT-SWAP local 0.0000 vs broker 0.0300 · certification fail-closed at step 4"
    }
  ],
  "order_journal": {
    "window_days": 7, "exact": true,
    "rows": [
      { "deployment_id": "dep_77", "alpha": "Carry", "orders": 151, "filled": 142, "rejected": 6, "expired": 3, "success_pct": "0.940" },
      { "deployment_id": "dep_91", "alpha": "Grid", "orders": 96, "filled": 81, "rejected": 14, "expired": 1, "success_pct": "0.844" }
    ],
    "order_types": [
      { "type": "LIMIT", "count": 148, "certified": true }, { "type": "MARKET", "count": 42, "certified": true },
      { "type": "STOP_MARKET", "count": 21, "certified": true }, { "type": "POST_ONLY", "count": 30, "certified": true },
      { "type": "OCO", "count": 4, "certified": false, "required_min": 10 },
      { "type": "REDUCE_ONLY", "count": 0, "certified": false, "required": true }
    ],
    "reject_reasons": [ { "code": "POST_ONLY_CROSS", "count": 11 }, { "code": "MIN_NOTIONAL", "count": 5 }, { "code": "RATE_LIMIT", "count": 4 } ]
  },
  "connectivity": {
    "window_hours": 24,
    "ack_latency_ms": { "p50": 40, "p95": 125 },
    "fill_latency_ms": { "p50": 123, "p95": 321 },
    "ws_reconnects": 3, "rate_limit_hits": 4,
    "baseline_note": "testnet sets the baseline expectation, not the production SLO",
    "finding_rule": "sustained p95 > 2× baseline raises a finding"
  },
  "recently_certified": [
    { "at": "2026-07-30", "alpha": "Grid v2.1", "venue": "BINANCE", "verdict": "certified", "passed": 7, "total": 7, "exit_review_id": "SX-14", "promoted_to": { "stage": "CANARY", "deployment_id": "dep_88" } },
    { "at": "2026-07-18", "alpha": "MM v1.1", "venue": "BINANCE", "verdict": "certified", "passed": 7, "total": 7, "exit_review_id": "SX-11", "promoted_to": { "stage": "CANARY", "deployment_id": "dep_63", "day": 2, "total_days": 14 } }
  ]
}
```

### O.2.2 Nguồn theo cột thật (DB guide 88 bảng)

| field | bảng · cột |
|---|---|
| `rows[]` | `strategy_deployments` WHERE `mode='sandbox'` AND stage `SANDBOX_VALIDATION` — **danh sách sinh từ registry**, không hardcode |
| `rows[].alpha`, `alpha_version_id` | `strategies` ⋈ `alpha_ledger(artifact_digest)` |
| `rows[].venue`, `account_id` | `accounts(account_id, mode, venue)` ⋈ `venue_accounts(external_account_ref)` |
| `rows[].portfolio_id`, `target_portfolio_id` | `portfolio_allocations` (hiện tại) + PORTAL approval `AP-352` (đích đề nghị) |
| `rows[].certification.steps[]` | PORTAL certification state machine (đã có ở `sandbox-certification.v1`) — overview **đọc lại**, không tính lại |
| `rows[].runtime_state`, `halt_reason` | `strategy_deployments(runtime_state)` + `operator_operations(operation_type='deployment.halt', reason)`; `FINDING` khi có `reconciliation_findings(severity='CRITICAL', status='OPEN')` |
| `rows[].in_stage_days`, `stalled` | now − `strategy_deployments(stage_entered_at)`; `stalled` theo ngưỡng server (đề nghị: > 14d và không có `operator_operations` VERIFIED trong 7d) |
| `kpis.test_fund_equity` | Σ `account_equity_snapshots(equity)` của các account `mode='sandbox'` — **cờ `enters_portfolio_nav: false` là bắt buộc** |
| `kpis.broker_sync` | `broker_account_sync_current_state(synced_at, status)` vs `account_policies`/venue policy |
| `order_journal.rows[]` | `orders` WHERE `mode='sandbox'` AND `submitted_at ≥ now()-7d`, group theo `strategy_id`; `filled` = `status='FILLED'`; `rejected` = `status IN ('REJECTED','RISK_REJECTED')`; `expired` = `status='EXPIRED'` |
| `order_journal.order_types[]` | `orders(order_type, post_only, reduce_only)` — `POST_ONLY`/`REDUCE_ONLY` là **cờ**, không phải `order_type`, nên server phải chuẩn hoá về một danh sách "loại đã thực thi"; `required` lấy từ manifest của alpha (loại nó dùng trong production) |
| `order_journal.reject_reasons[]` | `orders(error_code)` + `raw_response` |
| `connectivity.ack_latency_ms` | `domain_events` ACK − SUBMIT theo `client_order_id` (gateway timestamps) |
| `connectivity.fill_latency_ms` | first `fills(trade_time)` − `orders(submitted_at)` |
| `connectivity.ws_reconnects`, `rate_limit_hits` | `service_heartbeats` / `venue_rate_limits` 24h |
| `recently_certified[]` | PORTAL exit reviews `SX-*` verdict CERTIFIED trong 90d ⋈ `strategy_deployments` sau khi promote |

### O.2.3 Quy tắc (server phải giữ, frontend không được suy diễn)

1. `certification.passed == count(steps[].state == 'PASS')`, và `current_step` là
   bước không-PASS đầu tiên. Nếu hai giá trị lệch nhau, đó là bug server, không
   phải chuyện frontend "sửa mềm".
2. `runtime_state` là giá trị publish được hoặc `null`. **Không** dịch một absence
   thành `HALTED` — frontend đang render "runtime not stated" và sẽ giữ như vậy.
3. `success_pct` là decimal exact (`filled / orders`), không làm tròn ở server rồi
   lại làm tròn ở client.
4. `order_types[].certified` là quyết định của server (đủ số mẫu tối thiểu +
   không có reject chưa giải thích), không phải `count > 0`.
5. `stalled` phải kèm ngưỡng đã dùng trong `meta.stalled_rule` để UI in được lý do.
6. Rỗng ≠ sạch: khi không đọc được nguồn nào, trả `panel_state: "unavailable"`
   cho nhánh đó thay vì mảng rỗng.

## O.3 BR-EX-61 · `sandbox-certification.v1.1` — bổ sung cho workbench

Contract v1 đã có: `steps[]`, `findings`, `source_panels[]`, `promotion_plans[]`,
`timeline`, `progress`, `lineage`, `actor_roles`. Hi-fi 1d cần thêm **sáu nhánh**,
tất cả additive:

```json
{
  "identity": { "alpha": "Carry v3.2", "venue": "OKX TESTNET", "credential": { "id": "OKX-01", "status": "VALID" }, "external_account_ref": "okx_main_01" },
  "broker_freshness": { "source": "REST", "age_seconds": 40, "policy_seconds": 60, "state": "FRESH", "as_of": "2026-08-28T04:55:02Z" },
  "reconciliation_view": {
    "internal": { "positions": 0, "open_orders": 0, "equity": "10000.00", "reservations": 0, "authority": "EXECUTION" },
    "broker": { "positions": 0, "open_orders": 0, "balance": "10000.84", "source": "REST snapshot", "as_of": "2026-08-28T10:41:20Z", "digest": "8c1a…" },
    "difference": { "positions": "MATCH", "open_orders": "MATCH", "balance": { "state": "DELTA", "value": "0.84", "severity": "INFO", "explanation": "testnet faucet interest" }, "formula": "diff.v1" }
  },
  "findings_rows": [
    { "finding_id": "…", "status": "OPEN", "severity": "INFO", "identity": "balance USDT", "local": "10000.00", "broker": "10000.84", "action": { "kind": "ACCEPT", "label": "accept — testnet faucet interest", "href": null } }
  ],
  "order_type_certification": {
    "venue_scope": "OKX perp",
    "rows": [
      { "type": "MARKET", "state": "CERTIFIED", "evidence": "4/4 smoke fills" },
      { "type": "LIMIT", "state": "CERTIFIED", "evidence": "place/amend/cancel" },
      { "type": "STOP", "state": "PENDING", "evidence": "venue trigger semantics unverified" },
      { "type": "TAKE_PROFIT", "state": "UNTESTED", "evidence": null },
      { "type": "TIF", "state": "CERTIFIED", "evidence": "GTC · IOC" }
    ],
    "blocking": false,
    "blocking_rule": "strategy uses MARKET + LIMIT only — STOP/TP certification not blocking for this deployment"
  },
  "execution_quality": {
    "ack_latency_ms": { "p50": 210, "p95": 480, "samples": 9 },
    "fill_latency_ms": { "p50": 340, "samples": 4 },
    "slippage": { "state": "INSUFFICIENT_DATA", "min_samples": 30, "samples": 4 },
    "reject_rate": { "rejected": 0, "total": 9 },
    "formula": "execution_quality.v1", "source": "command journal decision→ACK→fill"
  },
  "smoke_plan": {
    "plan_id": "sp_07", "bounded": true,
    "quantity": "0.0010", "instrument": "BTC-USDT-SWAP",
    "capital_cap": { "value": "50.00", "ccy": "USDT" },
    "timebox_minutes": 30, "on_expiry": "AUTO_HALT",
    "operator": "Stan", "approved_by": "AP-207",
    "state": "APPROVED_AWAITING_APPLY"
  },
  "cleanup": {
    "rows": [
      { "key": "no_open_order", "ok": true }, { "key": "no_residual_position", "ok": true },
      { "key": "reservations_released", "ok": true }, { "key": "final_sync_and_clean_recon", "ok": false }
    ],
    "exit_rule": "clean exposure → final sync → clean dry-run → return HALTED"
  },
  "actions": [
    { "key": "sandbox.broker_sync", "label": "Sync broker", "enabled": true, "risk_tier": "T1", "blocker_codes": [] },
    { "key": "sandbox.reconcile_dry_run", "label": "Dry-run reconcile", "enabled": true, "risk_tier": "T1", "blocker_codes": [] },
    { "key": "sandbox.smoke_open", "label": "Open smoke window", "enabled": true, "risk_tier": "T2", "blocker_codes": [] },
    { "key": "sandbox.request_exit_review", "label": "Request Sandbox Exit Review", "enabled": false, "risk_tier": "T2", "blocker_codes": ["CLEANUP_PENDING"] }
  ],
  "peers": [ { "deployment_id": "dep_91", "alpha": "Grid v2.1", "venue": "OKX TESTNET", "passed": 3, "total": 7, "halt_reason": "FINDING" } ]
}
```

### O.3.1 Nguồn theo cột thật

| field | bảng · cột |
|---|---|
| `identity.credential` | `venue_credentials(status, rotated_at)` — chỉ status, **không bao giờ** trả key material |
| `broker_freshness` | `broker_account_sync_current_state(synced_at, status, source)` vs venue policy |
| `reconciliation_view.internal` | `positions_v2`, `orders(status ACCEPTED/PARTIALLY_FILLED)`, `account_equity_snapshots(equity)`, `order_pending_exposure` |
| `reconciliation_view.broker` | `broker_account_sync_current_state(positions, open_orders, balances, execution_state_digest)` |
| `reconciliation_view.difference` | DERIVED `diff.v1` — **server tính**, frontend chỉ tô màu |
| `findings_rows[]` | `reconciliation_findings(mode='sandbox', account_id)` ⋈ `details` (local/broker value) |
| `order_type_certification` | `orders(order_type, post_only, reduce_only, status)` mode='sandbox' + manifest loại alpha dùng |
| `execution_quality` | `domain_events` (decision→ACK), `fills(trade_time)`, `orders(status)` |
| `smoke_plan` | PORTAL smoke plan `sp_*` + approval scope `AP-207` + `operator_operations(status)` |
| `cleanup.rows[]` | `orders`, `positions_v2`, `order_pending_exposure`, `broker_account_sync_current_state` |
| `actions[].enabled` | PORTAL command policy — **fail-closed mặc định**, `enabled:true` phải là quyết định có chủ đích |
| `peers[]` | cùng truy vấn `rows[]` của BR-EX-60, giới hạn các deployment đang certification |

### O.3.2 Quy tắc

1. **Fail-closed là bất biến, không phải style**: `actions[].enabled` cho
   `sandbox.smoke_open` và `sandbox.request_exit_review` phải `false` khi
   `broker_freshness.state != FRESH` **hoặc** có finding CRITICAL OPEN **hoặc**
   `cleanup.rows` còn `ok:false`. Frontend đang ẩn nút (không phải disable) khi
   server nói blocked — nút vắng mặt là câu trả lời đúng cho "không thể".
2. `slippage.state = INSUFFICIENT_DATA` khi `samples < min_samples`. **Không trả
   0**, không trả giá trị "tạm" — luật `INSUFFICIENT_DATA` của EL-V2 áp ở đây.
3. `difference` không được là ba từ do client suy ra. `MATCH`/`DELTA`/`MISMATCH`
   là kết luận có thẩm quyền, kèm `severity`, và nếu nguồn nào không đọc được thì
   nhánh đó là `unavailable` chứ không phải `MATCH`.
4. `order_type_certification.blocking` phải nói rõ *vì sao không chặn* khi
   `false` — hi-fi in đúng câu đó, và một cờ không lý do là một cờ không kiểm được.
5. `peers[]` **không** mang `runtime_state` nếu server không publish nó; frontend
   đã bỏ chữ HALTED khỏi switcher vì lý do này.
6. v1.1 additive: mọi field cũ giữ nguyên tên và kiểu.

### O.3.3 Command routes (đi sau, cùng BR-EX-61)

Ba action đầu là plan → apply → verify như mọi mutation khác:

```
POST /api/v1/execution/sandbox/{deployment_id}/plan   { action_key }  → plan.v1
POST /api/v1/execution/sandbox/{deployment_id}/apply  { plan_id, idempotency_key } → operation.v1
GET  /api/v1/execution/operations/{operation_id}      → verify state
```

Lỗi bắt buộc: `409 CERTIFICATION_BLOCKED {blocker_codes[]}`,
`409 BROKER_STALE {age_seconds, policy_seconds}`, `428 STEP_UP_REQUIRED`,
`409 SMOKE_WINDOW_OPEN` (không mở hai cửa sổ cùng lúc).
`PARTIAL` không bao giờ render xanh — verify phải phân biệt
`VERIFIED` / `PARTIAL` / `FAILED`.

## O.4 Test bắt buộc

Fixtures: `execution-sandbox-overview.valid.json`,
`execution-sandbox-certification.dep_77.v1_1.valid.json`,
`execution-sandbox-certification.dep_91.v1_1.valid.json` (nhánh CRITICAL).

1. `passed == count(state=='PASS')` và `current_step` = bước không-PASS đầu tiên,
   trên cả hai fixture.
2. `test_fund_equity.enters_portfolio_nav == false` và giá trị đó **không** xuất
   hiện trong bất kỳ tổng NAV nào của `portfolio-360`.
3. `success_pct == filled / orders` (decimal exact) cho từng dòng journal.
4. Fixture dep_91: có `reconciliation_findings` CRITICAL OPEN ⇒
   `steps.recon_dry_run.state == 'FAIL'`, `smoke.state == 'BLOCKED'`,
   `actions[smoke_open].enabled == false` với `blocker_codes` không rỗng.
5. `slippage.state == 'INSUFFICIENT_DATA'` khi `samples < min_samples`, và
   không có trường `value` nào đi kèm.
6. `order_type_certification` có ít nhất một loại `required: true` chưa
   `CERTIFIED` ⇒ `progress.eligible == false`.
7. v1.1 additive: chạy lại toàn bộ test của `sandbox-certification.v1` không sửa.
8. `stalled == true` ⇒ `meta.stalled_rule` không null.

## O.5 Việc codex phải chốt (không đoán)

1. **Route của màn entry.** Registry đang có `SANDBOX_TRADING_SCREEN` ở
   `/deployments/sandbox` (COMMISSIONED, `data_mode: NONE`) và
   `EXECUTION_SANDBOX_CERTIFICATION_SCREEN` ở `/deployments/sandbox/:deploymentId`.
   Frontend đang mount overview ở canonical route của feature. Khi BR-EX-60 giao,
   codex đổi `data_mode` của `SANDBOX_TRADING_SCREEN` và trỏ nó vào contract mới.
2. **`POST_ONLY` / `REDUCE_ONLY` là cờ, không phải `order_type`.** Cần chốt danh
   sách chuẩn hoá "loại lệnh đã thực thi" mà UI hiển thị, và nguồn của
   `required` (manifest alpha hay cấu hình deployment).
3. **Ngưỡng `stalled`.** Đề nghị > 14d không tiến triển; codex chốt và trả trong
   `meta.stalled_rule`.
4. **Testnet venue naming.** `OKX_TESTNET` vs `OKX` + cờ `testnet: true` — hai
   cách đều được, nhưng phải một cách, vì Account/Broker 360 và Blotter cũng đọc.
5. **Smoke plan ở đâu.** `sp_*` là bảng PORTAL mới hay `operator_operations` với
   `operation_type='sandbox.smoke'`? Ảnh hưởng cả Admin Action Drawer.
