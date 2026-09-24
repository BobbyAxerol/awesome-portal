# P20 frontend handoff — Screen 13 Compare

**Backend state:** `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK`.
Claude owns Screen 13 rich composition and real browser/HiFi acceptance. Do
not edit P20 backend/migration/feature/deploy files to make a visual fixture
look live. Do not alter existing P12 WIP while consuming this contract.

## Read and record `READ`

1. `CLAUDE-FOR-thanhvuong.md`, P20 in the unified plan, Screen 13 spec and its
   HiFi HTML at 1280px and 660px.
2. [P20 phase report](./phase-report.md) and [backend packet](./README.md).
3. Generated sources only:
   `packages/contracts/openapi/research-compare.openapi.json` and
   `packages/contracts/generated/research-compare.d.ts`.

Regenerate before consuming:

```bash
npm --prefix packages/contracts run generate:research-compare
```

## Exact consumer boundary

```text
GET /api/v1/research/alphas/{alphaId}/compare?workspace_id=&mode=&runs=
```

- Omit `workspace_id` to use the authenticated workspace.
- `attempts` is the default and accepts no `runs`.
- `markets` accepts no `runs`.
- `pair` requires exactly `runs=runA,runB`; no more, no duplicate. The two
  values are opaque run IDs, not a relation/cursor/source selector.
- Treat `400/401/403/404/503` as typed panel-local states. Never retry a
  dead auth session in a loop or ask any direct source/worker/artifact route.

## Mandatory typed handling

`PairResult` is a generated discriminated union:

- `state === "REFUSED"` guarantees `pair === null`. Render the exact refusal
  card and four returned key parts; do **not** mount chart, delta table,
  weaker-claim, correlation or hidden pair metrics anywhere in the DOM.
- `state === "AVAILABLE" | "PARTIAL"` guarantees `refusal === null` and
  `pair` exists. A `PARTIAL` pair retains its designed context but its
  `availability.reason_code` must be visible.

Do not calculate correlation, deltas, ranks, key comparison, missing-value
fills or config diffs in the browser. Preserve UTC milliseconds and decimal
strings as supplied. `common_window` is a new Portal-derived scope; never
overwrite a run's `original_metrics` with it.

## Required rich composition

- Keep Screen 13's attempts ladder, market small-multiple grid, pair guard,
  distinct `#0f4c5c` / `#9a6a1f` lines and mandatory legend, delta table,
  config-difference disclosure, rules footer and URL state. Replace only the
  affected panel state, never the whole route with a generic unavailable page.
- Attempts sort by returned order/claim rank. Do not promote/select/publish a
  run from rank or a metric. `weaker_claim` is display-only explanation.
- Markets use only server-provided cards. Do not overlay different keys,
  request raw returns or fabricate an unavailable chart.
- Pair correlation with `source_label=PORTAL_DERIVED` must show formula,
  version, `n`, exact window and missing policy. It is not engine-published.
  For `NOT_PUBLISHED`, show the returned typed reason in the designed card;
  do not turn it into `0`, `NaN`, an engine-artifact claim or a client retry.
- Current claim origin can be conservative
  `PORTAL_DERIVED_FROM_SOURCE_PROTOCOL`; strict/selection categories absent
  from source remain typed absence. Preserve the HIFI hierarchy without
  inventing a certification chip.

## Mandatory browser / HiFi receipt

Use a real browser and compare the product route with the HiFi at **1280px**
and **660px**. Record:

`HiFi element / interaction → product component → generated field/operation → typed state → browser assertion`.

Cover S13 T01–T11: claim-order ladder, exact trajectory copy, no-overlay
markets caption, comparable pair overlay/deltas, mismatch no-hidden-DOM
refusal, absent correlation, weaker-claim display, deep-link `runs`, 660px,
axe/focus, zero warnings/errors and stale-response prevention when switching
pairs. Keep fixture/API/browser/visual evidence separate; never re-record a
global baseline to hide unrelated drift.

Return one receipt with commits, files/counts, generated revision, browser
commands/viewports, console/network evidence, HiFi delta decisions and only
genuine `CG-P20-*` source/contract requests.

## Thanhvuong addendum — nợ mới P20 cho các phase sau (2026-09-24)

Phần trên của codex giữ nguyên; mục này chỉ bổ sung, theo rule Bobby 2026-09-24 ([Unified note P19](../../../UNIFIED_IMPLEMENTATION_PLAN.md#p19-thanhvuong-frontend-implementation-note--screen-10-2026-09-24)): mọi lệch hi-fi ghi `VD-P20-NN` vào cả handoff lẫn Unified.

- **Trạng thái S13:** `P20-A S13 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · NOT_VERIFIED`. Code `92cdc844 → 0910ecc3 → f3d6169d → 009cedb8 → 034aef11` (tree `e2d7d388`, 10 file +2807/−2 trên base `295901b7`). Backend vẫn `CONTROL_API_FEATURE_RESEARCH_COMPARE=false`; browser receipt dùng API stub theo shape `compare.contract.ts` / `compare.service.ts` vì chưa có fixture compare canonical (`CG-P20-01`).
- **Receipt trên head `034aef11`:** tsc 0, build 0, vitest 172 file · 3091 pass · 1 skip, S13 + boundary 38/38, probe Research toàn bộ 128/128 (`--workers=1`), 42 RECEIPT overflow 0 / console 0 / mutation 0, mini chart markets ≤ 2 nhãn trục X không chồng ở 1280/660. Chi tiết ở [receipt](./thanhvuong-frontend-receipt.md).
- **Route:** canonical `/research/quantbt/alphas/{alphaId}/compare?mode=attempts|markets|pair&runs=a,b`; route spec `/research/quantbt/compare?alpha=&runs=` chỉ còn là resolver.

**Visual decision ledger rút gọn** (bản đầy đủ: [receipt §6](./thanhvuong-frontend-receipt.md#6-visual-decision-ledger-vd-p2001-20) và [Unified note P20](../../../UNIFIED_IMPLEMENTATION_PLAN.md#p20-thanhvuong-frontend-implementation-note--screen-13-2026-09-24)):

| VD | Điểm lệch hi-fi | Product | State |
|---|---|---|---|
| `VD-P20-01` | "two alphas, one key" | "two runs, one key" (pair cùng Alpha theo contract) | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-02` | Correlation "engine-published" | `PORTAL_DERIVED` + formula/version/n/window/missing policy; absent → "correlation not derived — {reason}" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-03` | cert / sched / pill ACTIVE / note | typed absence `CG-P20-02/03`; pill = `run_state` (`CG-P20-08`); note = `claim.text` | field-driven |
| `VD-P20-04` | OOS Sharpe per fold | khung + caption hi-fi, absent `CG-P20-04` | field-driven |
| `VD-P20-05` | Config diff ở attempts | khung hi-fi, thân absent `CG-P20-05` | field-driven |
| `VD-P20-06` | Delta 6 hàng engine-published | Δ chỉ từ `common_window`; win rate absent `CG-P20-06` | field-driven |
| `VD-P20-07` | Pair sub-toggle demo | chip 2 run đọc từ URL `runs=` | demo control |
| `VD-P20-08` | (không có) | dòng meta disclosure dưới header | `AWAITING_DECISION` (nhóm `S10-COUNTS-PANEL`) |
| `VD-P20-09` | Route `/compare?runs=` | canonical trong Alpha + resolver | route |
| `VD-P20-10` | Footer rules verbatim | đổi 3 cụm (two runs, Portal-derived, server refuses) | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-11` | Subtitle "Two ideas…" | "Two runs…" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-12` | (không có state thiếu run) | `PAIR_NEEDS_TWO`, 0 request | rule over hi-fi |
| `VD-P20-13` | Delta header "engine-published" | "server-published" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-14` | Ladder weak → strong, "claim ↑ →" | bày mảng server đảo ngược, không sort theo số (`009cedb8`) | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-15` | Tag "EChart N" + narrative demo có số | không in | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-16` | Mismatch chỉ trong câu | chip key 4 phần, phần lệch đỏ chỉ để hiển thị; từ chối là của server | rule over hi-fi |
| `VD-P20-17` | Claim chip không có origin | dòng mờ `origin {claim.origin}` | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-18` | S10 root card 3 link | "compare →" đặt cạnh `.ln-links` | route |
| `VD-P20-19` | Rank 3 amber nhạt, nền correlation tint | `var(--warn)` / `var(--accent-soft)` (token gate) | rule over hi-fi |
| `VD-P20-20` | Banner markets lặp "Small multiples only" | bỏ cụm lặp (`034aef11`) | `REQUIRES_BOBBY_DECISION` |

**Backend request `CG-P20-01…08`** (@codex, tất cả OPEN, kiểm lại trên `bb25bf39` và `72d2638b`; chi tiết ở [backend requests](./thanhvuong-backend-requests.md)): `01` fixture canonical compare 5 case spec §10 + Problem · `02` schedule/mode per run · `03` cert per run · `04` OOS Sharpe per fold · `05` intentional differences ở attempts mode · `06` win rate + OOS Sharpe stitched common-window · `07` alpha id fixture `run-library.json` (`alpha_momentum_btc`) không qua regex compare · `08` lifecycle ACTIVE/SUPERSEDED per run.

**Nợ mở cho phase sau (P21+)** — [debt register](./thanhvuong-debt-register.json):
- `S13-COMPARE-STATE-REFUSED`: `data-compare-state=available` cả khi pair REFUSED / zero-variance; refusal chỉ nằm ở `data-pair-state` (Bobby B6).
- `S13-BACK-ETAG-660`: Back ở 660 gửi thêm 1 GET attempts không có `If-None-Match` (validator ETag một slot); không sai dữ liệu.
- `S13-G1-HEADER-LAYOUT`: header lệch hi-fi, chưa có VD; DQ-01 ở baseline `8bd81b01` bỏ module header.
- `S13-MINI-LABELS-UNIT`: nhãn mini chart chỉ khoá bằng probe browser, chưa có unit.
- `S13-FIELD-DRIVEN-CELLS` (`VD-P20-03…06`) chờ `CG-P20-02…06/08`; copy `VD-P20-01/02/10/11/13/14/15/17/20` chờ Bobby (B2, đề xuất mở version hi-fi mới); `VD-P20-08` chờ B3.
- Deferred: axe (B4, axe-core không có trong lock), `REAL_API_E2E_RECEIPT` + `V11-P20-DR` (B5, cờ tắt), gộp `call<T>` / refusal mapper vào RF-04.
- Tích hợp baseline `72d2638b` (B1): `3e7055d5` viết lại `RunLibrary.tsx` (CompareBar disabled "not built yet") xung đột chắc chắn với entry `alpha=` của S13; `8bd81b01` 404 → terminal `notFound` và DQ-08 `researchFormat.ts` khác cách S13 (403 = 404 `denied`, in Decimal nguyên chuỗi).

**Handoff cho P21 (S11):** S13 chỉ GET, không publish fact, không chọn/promote run; link sang Screen 11 chưa vẽ vì S11 chưa có route. Packet: [receipt](./thanhvuong-frontend-receipt.md) · [backend requests](./thanhvuong-backend-requests.md) · [test results](./thanhvuong-test-results.json) · [debt register](./thanhvuong-debt-register.json) · [rollback](./thanhvuong-rollback.md).
