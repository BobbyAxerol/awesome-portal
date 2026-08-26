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
10. **34/40**: xoá `alpha360.smoke.ts`.

Mỗi bước: handoff codex kèm **Required frontend tests**; tôi regenerate `portal-api.d.ts`, nạp fixture canonical
trong test (không chép tay), ghi `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` vào ledger §3, tick grammar §8.

# Phụ lục F — cách codex nhận request này

- **Intake chính thức:** 11 hàng BR-EX-41…51 trong §7.2 của `portal-backend-plan/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`
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

