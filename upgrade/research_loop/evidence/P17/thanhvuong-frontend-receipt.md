# P17 — Thanhvuong frontend receipt (Screen 08 S4 Execute Replay)

**Trạng thái:** `P17-A S08 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · chưa push`.
**P17-B không done**: vẫn `SOURCE_CAPABILITY_BLOCKED` theo
[capability matrix](./source-capability-matrix.md). Receipt này chỉ ghi lại
thay đổi và evidence. Nó không đổi rule, không đổi contract, không đổi phase
gate, và không gọi P17 là `VERIFIED`.

Đã đọc (`READ`) trước khi làm: `CLAUDE-FOR-thanhvuong.md` A4/A4.1/A5/A13,
[frontend handoff P17](./frontend-handoff-claude.md) (kể cả amendment RS-01 và
RS-02), [capability matrix](./source-capability-matrix.md), Guide §P17
(`P17-T01…T14`), spec `release-v1.1/docs/screens/08_s4_execute.md`, hi-fi
`QuantBT 08 S4 Execute Replay.dc.html` mở trong trình duyệt ở 1280/660,
`research-replay.openapi.json` + `generated/research-replay.d.ts`. Theo
CLAUDE.md: tận dụng QuantBT v1.1 hiện có và bám hi-fi.

## 1. Git: base, head, branch

| Mục | Giá trị |
|---|---|
| Branch | `feat/thanhvuong/research-p17-p21`, remote duy nhất là `primus-origin` |
| Base campaign (provisioned) | `30fb9f21473bfa4cd1bd6baecb4b927f2ad8d196` |
| Base của P17 | `21f9a98b39994f99b2f1366be9227617ecd55011` (docs P16 addendum) |
| Commit P17 (chưa push) | `b55aed4cff62ec69ce9f3dec51e9779f6d22726b` feat S08 screen · `737d279da27a2a98797cbfdf5fafb8f4e13ec7ad` route + link · `9ee852414a83c7ab5904d42dbf249e7c5e25c6e6` đổi nhãn test · `3cf70794c04c3a7459afdd4399e62cfb83381cef` thêm panel PnL distribution của hi-fi (sửa sau khi so ảnh, §4.1) |
| Docs commit | `a4c375f5` (bản đầu) và commit cập nhật file này sau `3cf70794`, cùng một dòng P17 trong Unified §13 |
| Baseline mới | `docs/research-loop-plan` đã tiến `30fb9f21` → `952ad48f75d6bd6757d3359fd127a889a92e28f4` (12 commit, không phải con của `21f9a98b`). **Chưa merge/rebase**. Bobby quyết cách tích hợp (§6) |
| Push / PR | chưa. Chỉ push khi Bobby yêu cầu; PR vào `docs/research-loop-plan`, không merge/rebase/force-push |

## 2. File đã sửa (`git diff --numstat 21f9a98b 3cf70794 -- apps/portal/frontend`)

| File | + | − | Mục đích |
|---|---:|---:|---|
| `src/research/replayClient.ts` | 298 | 0 | Hai operation: `researchReplayDetailGetV1` và `researchCurrentSourceReplayGetV1`. Type lấy từ generated. Word maps, 13 capability keys, copy cố định cho refusal, `toReplayRefusal`, `replayState` |
| `src/research/replayTransport.ts` | 183 | 0 | Transport store ngoài React (`useSyncExternalStore`): play/pause/step/seek/speed chỉ chạy trên sample đã tải, rAF có scheduler inject được, dừng ở cuối window, tự pause khi tab ẩn |
| `src/research/useReplay.ts` | 180 | 0 | Đọc window: một GET khi vào, một token điều hướng mỗi lần đọc, 409 → bỏ token và hồi phục **đúng một lần**, lane retained chỉ đọc khi người dùng bấm |
| `src/research/ExecuteDetail.tsx` | 878 | 0 | Bố cục Screen 08 theo hi-fi (§4) |
| `src/research/ExecuteRoute.tsx` | 40 | 0 | Route trên cursor chung; `seq` trong hash = ordinal + 1, chỉ ghi khi playhead dừng |
| `src/research/executeReplay.test.tsx` | 553 | 0 | 34 test, nhóm `S08-U01…U08` |
| `src/features/quantbt/QuantBTModule.tsx` | 5 | 1 | Mount `runs/:runId/execute`; loại `execute` khỏi lookup `/api/runs/:id` cũ (lookup này trả 501) |
| `src/research/EvidenceFlow.tsx` | 1 | 1 | Stage 4 deep dive trỏ tới `execute` |
| `src/research/FreezeDetail.tsx` | 10 | 0 | Breadcrumb S07 thêm link `next: S4 Execute →` (spec 07 dòng 18) |
| `src/research/evidenceFlow.test.tsx` | 3 | 8 | Test hub: đủ bốn stage có link, tính cả Execute |
| `src/research/researchBoundary.test.ts` | 1 | 0 | Thêm `replayClient.ts` vào danh sách module được gọi mạng |
| `tsconfig.json` | 3 | 0 | Alias `@portal/contracts-research-replay` |
| **Tổng** | **2155** | **10** | 12 file, tất cả thuộc `apps/portal/frontend/**` |

Không đụng backend, `packages/contracts/**`, OpenAPI, fixture canonical,
migration, `apps/portal/strategy/**`, control-plane, `package.json` hay lock
file.

## 3. Contract đã tiêu thụ

| Mục | Giá trị |
|---|---|
| OpenAPI | `packages/contracts/openapi/research-replay.openapi.json` `version 1.0.0`, SHA-256 `fa9d9a57b50f2463…`. Giống hệt ở `952ad48f` |
| Generated | `generated/research-replay.d.ts` SHA-256 `d0da49a0d01dc4c6…`. `npm --prefix packages/contracts run generate:research-replay` (openapi-typescript 7.13.0) exit 0, `git status packages/contracts` sạch |
| Operation chính | `GET /api/v1/quantbt/runs/{runId}/execute/replay`, query `workspace_id`, `limit` ≤ 100, **một** trong `cursor`/`before`/`at`/`at_ordinal` |
| Operation phụ (RS-02) | `GET …/current-source/replay`, chỉ window đầu, không có `at_ordinal` |
| Cache | `private, no-store`: không gửi `If-None-Match`, không có nhánh 304 |
| DTO tự định nghĩa | không có. Không parse chuỗi lỗi, không tự tính sequence/digest/ngày |

## 4. Mapping hi-fi → component → field → state → assertion

Viewport 1280 và 660. "Browser" = probe trên product route; "Unit" = vitest.

| Phần tử hi-fi / tương tác | Component | Field / operation | Typed state | Assertion |
|---|---|---|---|---|
| Tiêu đề + subtitle | `ExecuteScreen` h1 | — | — | `VISUAL_DECISION_REQUIRED` (§7). Luôn còn dưới mọi refusal (Unit U06) |
| Breadcrumb Evidence Flow / run / Stage 4 / ← S3 Freeze / next: Run Report | breadcrumb | — | next bị disable kèm `title` lý do (S09 chưa có route) | Guard test `disabledReason` pass |
| Provenance strip | `ProvenanceStrip` (tái dùng) | `provenance.*`, `revision` | — | Browser: in đủ digest, không tràn ở 660 |
| Execution contract | `Card` | `route.state`, `route.replay_contract` | `RETROSPECTIVE_EQUITY_ONLY` | Câu "sample, not an execution state" (Unit U02) |
| Stitched account (equity + drawdown) | `SampleChart` = `EChart` + `baseOption` + `roleColorsNow` (tái dùng) | `equity_replay.items[].{equity,drawdown_fraction,at_utc_ms}` | `partial` | 2 canvas + bảng sr-only; số là chuỗi decimal của server (Unit U02) |
| Playhead | overlay DOM trên chart | `items[index]` | nhãn "sample N of M", không bao giờ là "position/account" | Unit U02; Browser DEEPLINK |
| Sampling | chip + note | `equity_replay.sampling` | `FULL` / `EXTREMA_BUCKET_V1` | Browser sampled; Unit U03: "not interpolated", không vẽ bar giữa sample |
| Transport (play/pause/step/jump/speed 1–64×/seek) | `TransportBar` + `ReplayTransport` | chỉ window đã tải | — | Browser PLAYBACK: `requests_during=0`; SEEK 0 request; Unit U01 |
| Phím Space / ←/→ / Shift+←/→ | `useTransportInput` | — | bỏ qua khi đang gõ vào ô nhập | Browser KEYS/SPACE; Unit U01 |
| Tab ẩn | `visibilitychange` | — | pause + badge "paused (tab hidden)", không tự chạy lại | Browser HIDDEN `badge=1 playing=false` |
| Window trước/sau | nút previous/next window | `page.prev_cursor` / `page.next_cursor` → `before` / `cursor` | — | Browser PIN tail: đúng một token mỗi request |
| Read state at playhead | nút pin | `playback_cursor` → `at` | `state_at_cursor` | Browser PIN: `at` hết hạn → 409 → một lần `at_ordinal=20` → `AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE` |
| Event ledger | `SampleLedger` (14 dòng quanh playhead) | `items[]` | gọi là "samples", không phải events | Unit U04; click dòng = seek, 0 request |
| Trade anatomy / blotter / MAE×MFE / trade PnL distribution / cost timeline (+ route-aware facts, không có trong hi-fi) | `AbsentPanel` ×6, cùng thứ tự cột với hi-fi | `route_capabilities.*` | `NOT_PUBLISHED` + reason code | Browser `absent-panels=6` ở 1280/660; Unit U04 assert đúng thứ tự, không có dòng order/fill/trade/candle, PnL distribution không có histogram |
| 13 route capability | `CapabilityGap` | `route_capabilities` (13 khoá) | `NOT_PUBLISHED` + reason code P04 | Browser `CAPS 13` ở 1280/660; Unit U04 |
| State at playhead | `StateAtCursor` | `state_at_cursor.*`, `.execution_state` | `NOT_SELECTED` nếu không gửi `at`/`at_ordinal` | Unit U02: execution state in là "not published" |
| Source absences | `SourceAbsences` | `source_absences.execution_state`, `.cross_stream_order` | `NOT_PUBLISHED`, `NOT_ASSERTED` | Unit U04 |
| Retained model replay (RS-02) | `RetainedReplayPanel` | `researchCurrentSourceReplayGetV1` | chỉ đọc khi bấm; 404/409 → `RETAINED_NOT_ADMITTED` | Browser RETAINED; Unit U07 (lazy) |
| Route state khác | `ResearchPanel` | `route.state` | pending / legacy / not published → `unavailable`, giữ shell | Browser 3 state ×2 viewport; Unit U05 |
| Loading | `ResearchPanel aria-busy` | — | `loading` | Browser LOADING `busy=1 windows=0 zero=false` ở 1280/660; Unit U06 |
| Refusal 400/401/403/404/409/503 | `toReplayRefusal` | status + `error.code` | terminal / denied / denied / empty / stale / unavailable | Browser 5 status ×2 viewport; Unit U06: không in prose của server |
| Deep link / hard refresh | `ExecuteRoute` | hash `seq` → `at_ordinal = seq − 1` | — | Browser DEEPLINK `at_ordinal=45`; RELOAD giữ `seq=21` → `at_ordinal=20` |
| Hub S4 và S07 "next" | `EvidenceFlow`, `FreezeDetail` | — | — | Browser HUB, S07 next href đúng |
| Hi-fi "Reveal" / "COPY" / nút chứng chỉ | — | không có field | — | Không vẽ. Không có certificate badge nào trên S08 (Guide P17-T08) |

### 4.1 So hi-fi với product — phần tử hi-fi không vẽ hoặc vẽ khác

Evidence: ảnh hi-fi `p17-hifi-08-1280.png` (`959b04f135ac70b3`) đặt cạnh
product `p17-full-1280.png` (`a6063745decbc1f9`), cùng viewport 1280. Lần so
này tìm ra một panel bị thiếu: **trade PnL distribution**. Panel đó đã được
thêm lại ở `3cf70794`. Các phần tử còn lại dưới đây được bỏ có chủ đích:
không có field nào để vẽ, và vẽ ra sẽ là dữ liệu bịa.

| Phần tử hi-fi | Lý do không vẽ / vẽ khác | Field / fact còn thiếu | Loại |
|---|---|---|---|
| Hàng chọn route (`close_target_v2`, `intrabar_bracket_v1`, `event_lifecycle_v2`, `reactive_r2`, `dca_ladder`) | Contract trả **một** route cho run (`route.id=signal_notional`). Product in route đó thành một chip, không có control chọn route | không có danh sách route | source (P17-B) |
| LENS manager / quant / audit | Không có field nào khác nhau giữa các lens | — | `VISUAL_DECISION_REQUIRED` |
| FOLD selector, fold chain f1…f5, "play across folds", SCALE DEMO 5/32 folds | Contract không có fold scope; `fold_capital` `NOT_PUBLISHED` | `fold_capital` + fold scope của replay | source (P17-B hàng 7) |
| Dải IS / OOS / HOLDOUT phía trên chart | Replay không trả ranh giới window | window bounds trên replay | source; có thể lấy từ S07 nếu Codex cho phép dùng chung |
| Nến + marker S/T/O/F + "causal reveal" | `candle_windows`, `execution_events` `NOT_PUBLISHED`. Product vẽ đường equity và drawdown, gọi là sample | candle window, event stream | source (P17-B hàng 4, 6) |
| Trade tape (span xanh/đỏ theo trade, "1 / 18 events") | `trades` `NOT_PUBLISHED`. Seek range thay chỗ tape, readout là "sample N of M" | trade ledger | source (P17-B hàng 3) |
| Readout `bar · event_seq · position` | Chỉ có `t · equity · drawdown`; position không được suy ra | position snapshot | source (P17-B hàng 2) |
| Event ledger dạng event (`signal_eval`, `target_set`, `acct_post`) | Ledger giữ chỗ nhưng in sample và ghi rõ "samples, not events" | `execution_events` | source |
| Blotter (bộ lọc long/short/win/loss, sort), anatomy, MAE×MFE scatter, PnL histogram | Panel giữ chỗ, kèm reason code; không có dòng hay điểm nào | `trades`, `mae_mfe`, `orders`, `fills` | source |
| Cost timeline "ABSENT" | Có, cùng ý nghĩa. Hi-fi viết "portal gap, không phải engine gap"; product chỉ in reason code nguồn trả về, không kết luận thay | `funding` | khớp |
| Dòng artifact `bars.parquet · events.parquet · ds_…@sha256` và COPY EVIDENCE LINK | Không có field artifact; không có operation copy link (giống quyết định P16) | artifact refs | `VISUAL_DECISION_REQUIRED` |
| Breadcrumb trong topbar | Product đặt breadcrumb trong trang, dưới header module QuantBT (shell chung, giống P16) | — | ngoài S08, đề xuất task shell riêng |
| Tiêu đề | §7 | — | `VISUAL_DECISION_REQUIRED` |

## 5. Receipt thực tế — 2026-09-23 trên workspace Linux

### 5.1 Workspace và verifier (A1.1/A1.2)

| Kiểm tra | Kết quả |
|---|---|
| `id -un` / `id -u` | `thanhvuong` / `1001` |
| Branch / remote | `feat/thanhvuong/research-p17-p21` / chỉ `primus-origin` |
| `./scripts/verify-contributor-workspace.sh` | exit 0 |
| Hook active | **Không** (`core.hooksPath` không đặt, như đã ghi ở P16 addendum §3.1). Bù bằng chạy tay, xem §5.5 |

### 5.2 Test lanes (`apps/portal/frontend`, Node v20.20.2, tree = `3cf70794`)

| Lane | Lệnh | Exit | Kết quả |
|---|---|---:|---|
| Typecheck | `npx tsc -b --noEmit` | 0 | PASS |
| Build | `npm run build` | 0 | PASS (chỉ có cảnh báo chunk size, đã có từ trước) |
| Unit toàn bộ | `npx vitest run` | 0 | **169 file · 2969 pass · 1 skip**, chạy trên cả `9ee85241` và `3cf70794`. Flake `PortalShell` ghi ở P16 §3.3 không tái hiện lần này |
| Unit S08 | `npx vitest run src/research/executeReplay.test.tsx` | 0 | 34/34 |
| Browser toàn Research, 1 worker | `playwright test -c <probe config 127.0.0.1:4417> --workers=1` | 0 | **104/104 PASS** (82 test có sẵn + 22 test probe S08), chạy lại trên `3cf70794` |
| Browser toàn Research, 2 worker | cùng lệnh, `--workers=2` | 1 | 102 pass, 2 fail: `S01 keeps its filters…` (timeout 1.0m) và `S06 points at no trial`. Hai test này nằm ngoài diff P17. Chạy riêng thì pass 2/2. Ghi lại, không vá |

Playwright 1.62.1, Chromium headless. Preview là `vite preview` riêng của
workspace ở `127.0.0.1:4417`, dựng từ build trên, đã tắt đúng PID sau khi
chạy. Không đụng preview 4317–4320 của Bobby. Spec probe tạm và config probe
**không commit, đã xoá** (bản sao ở scratchpad của phiên).

### 5.3 Browser receipt — `PRODUCT_ROUTE_BROWSER_RECEIPT` (API stub)

Route `/research/quantbt/runs/R-WFO-118/execute`. Response replay được stub
theo shape trong `apps/control-api/test/research-replay.contract.spec.ts` và
`replay.service.ts`, vì chưa có fixture canonical cho frontend (`CG-P17-01`).

| State / tương tác | Kết quả ở 1280 và 660 |
|---|---|
| full, sampled | `partial`, overflow 0, noise 0, đúng 1 GET khi vào |
| pending_source_callback, legacy_metadata_only, not_published | `unavailable`, giữ shell, overflow 0, noise 0, 1 GET |
| 400 / 401 / 403 / 404 / 503 | terminal / denied / denied / empty / unavailable, overflow 0, noise 0, 1 GET, **không in prose của server** (stub gửi `/private/x`, không lên màn) |
| loading | `aria-busy`, 0 window, không có số 0, overflow 0 |
| Deep link `#…seq=46` | request đầu `at_ordinal=45`; readout "sample 46 of 240" |
| Playback 4× | 0 request khi đang chạy; hash giữ `seq=46` khi chạy, thành `seq=65` sau khi pause |
| Phím, tab ẩn, seek | đúng như §4; seek 0 request |
| Window sau/trước, pin | `cursor=…`, `before=…`, `at=…` (409) → `at_ordinal=20` (1 lần) |
| Reload | giữ `seq=21`, gửi `at_ordinal=20` |
| Console | màn S08: 0. Tương tác: 2 dòng "Failed to load resource 409". Đây là 409 cố ý của stub để thử hồi phục, không phải lỗi của app. Route S07 vẫn có 404 `current-source/freeze` đã có từ trước (P16) |
| Network | chỉ same-origin: `…/execute/replay`, `…/current-source/replay` (khi bấm) và các request shell. Không còn 501 `/api/runs/R-WFO-118` |

Screenshot và log **không commit** (A4.1). Nằm ở `~/tv-shots/p17/` và
`~/tv-shots/p17-receipt/` trong workspace. SHA-256 (16 ký tự đầu):

| File | SHA-256 | File | SHA-256 |
|---|---|---|---|
| `p17-full-1280.png` | `a6063745decbc1f9` | `p17-full-660.png` | `9200ecf757ba26bb` |
| `p17-sampled-1280.png` | `6ce7f572d5dfef81` | `p17-sampled-660.png` | `8c88b1cb2f803d03` |
| `p17-pending_source_callback-1280.png` | `20dc90c398b036b6` | `…-660.png` | `5e884c9a88ccd585` |
| `p17-legacy_metadata_only-1280.png` | `e140be028c3e3cc8` | `…-660.png` | `80f140ccc1927f63` |
| `p17-not_published-1280.png` | `1a8520047447fe3c` | `…-660.png` | `198a52415d095a80` |
| `p17-refusal-400-1280.png` | `1261abe14f0ddc33` | `…-660.png` | `6a729fb4c63cec54` |
| `p17-refusal-401-1280.png` | `269cb2d887534871` | `…-660.png` | `3af7e2facab05abb` |
| `p17-refusal-403-1280.png` | `13656a437d9f17b7` | `…-660.png` | `ba7a187afa1b02d5` |
| `p17-refusal-404-1280.png` | `f6e8d40916a33241` | `…-660.png` | `6eaf69dc7b8733a5` |
| `p17-refusal-503-1280.png` | `6f2e57439739374b` | `…-660.png` | `be40113bb4a139e2` |
| `p17-loading-1280.png` | `a4be160e70bd593f` | `p17-loading-660.png` | `8cef24904e93b1dc` |
| `p17-interaction-1280.png` | `52991788afbba4ac` | `probe.log` (41 dòng) | `033d10f3b0762c91` |
| hi-fi `p17-hifi-08-1280.png` | `959b04f135ac70b3` | hi-fi `p17-hifi-08-660.png` | `073177f46e8bba0b` |
| `p17-product-execute-1280.png` (trước `3cf70794`) | `d0d6ebe8bebc6bd3` | `p17-product-execute-660.png` (trước `3cf70794`) | `9ac4ff35e74d8db9` |

### 5.4 Loại receipt

| Loại | Có? | Ghi chú |
|---|---|---|
| `COMPONENT_FIXTURE_BROWSER_RECEIPT` | không | Không có harness component trong browser. Unit RTL không được tính là loại này |
| `PRODUCT_ROUTE_BROWSER_RECEIPT` | **có** | §5.3 |
| `REAL_API_E2E_RECEIPT` | **không** | P17 backend feature-dark |
| axe (a11y scan) | không | Cùng lý do P16: axe-core không có trong lock file (Bobby quyết cách chạy) |

### 5.5 Hook chạy tay

| Đối tượng | Kiểm tra | Kết quả |
|---|---|---|
| `b55aed4c`, `737d279d`, `9ee85241` | `bash .githooks/pre-commit` trên index trước mỗi commit | exit 0 cả ba lần |
| Range `21f9a98b..9ee85241` | `git diff --check` | exit 0 |
| Docs commit này | `bash .githooks/pre-commit` trên index | exit 0 |
| pre-push | chưa chạy, vì chưa push. Sẽ chạy tay trước khi push theo lệnh Bobby |

## 6. Baseline mới và xung đột (Bobby quyết)

Kiểm bằng `git merge-file` từng file trên ba bản `30fb9f21` / `HEAD` /
`952ad48f`, không merge thật:

| File | Kết quả |
|---|---|
| `FreezeDetail.tsx` | **1 xung đột**: baseline đổi refusal sang `RefusalNote` và đổi `actions` → `recovery` trên `ResearchPanel`; nhánh này thêm link `next: S4 Execute →` ở breadcrumb |
| `QuantBTModule.tsx`, `EvidenceFlow.tsx`, `evidenceFlow.test.tsx`, `researchBoundary.test.ts`, `tsconfig.json` | không xung đột |
| 6 file mới của S08 | baseline không có file trùng tên |

Việc phải làm khi tích hợp, sau khi Bobby chọn cách (merge/rebase do Bobby làm
hoặc cho phép):

1. `toReplayRefusal` → `toResearchRefusal` + `RefusalNote` của baseline
   (`researchRefusal.ts:127`). Copy S08 đã gom vào một hàm để đổi một chỗ.
2. Nút `reread replay` của S08 chuyển từ prop `actions` sang `recovery`.
   Ở baseline, `actions` chỉ hiện ở state có nội dung, nên nếu giữ nguyên thì
   nút đọc lại sẽ mất ở `unavailable`.
3. Chạy lại toàn bộ §5.2 sau khi tích hợp.

## 7. Quyết định hình ảnh và discrepancy

| Mục | Hi-fi | Spec / contract | Đang làm | Loại |
|---|---|---|---|---|
| Tiêu đề | "Execute — the frozen params trading the tape" | spec 08 dòng 26: "S4 · Execute Replay — how orders came to exist" | "S4 · Execute Replay — what this source can replay" | `VISUAL_DECISION_REQUIRED`. Cả hai tiêu đề gốc đều nói có order/giao dịch, trong khi route chỉ có equity sample |
| ETag | — | Handoff "One named operation" nói giữ ETag và thử "ETag refresh"; amendment RS-01 nói `no-store`, không 304 | Theo RS-01: in `revision`, không gửi `If-None-Match` (Unit U07) | Discrepancy trong handoff; theo amendment mới hơn |
| Input điều hướng | — | Handoff chỉ ghi `cursor`/`before`/`at`; RS-01 cho thêm `at_ordinal` cho deep link | `at_ordinal` chỉ dùng cho deep link và một lần hồi phục | Theo amendment |
| Nhãn test | — | Guide định nghĩa `P17-T01…T14` với nghĩa khác | Nhóm test cục bộ đổi thành `S08-U01…U08` (`9ee85241`) | Tránh nhầm với ID nghiệm thu |
| Reveal mode | có | handoff: "if added", chỉ để trình bày | Chưa làm | Tuỳ chọn. Không có state nào để che vì chưa có outcome tương lai ngoài equity |
| Panel trade PnL distribution | có | — | Bản đầu bỏ sót; đã thêm lại ở `3cf70794`, kèm reason code | Lỗi đã sửa, tìm ra khi so ảnh (§4.1) |

## 8. Guide `P17-T01…T14` — phần frontend chứng minh được

| ID | Nội dung Guide | Frontend hôm nay |
|---|---|---|
| T04 | Checkpoint/seek và gap refusal | Một phần: seek trong window 0 request, 409 hồi phục một lần, lần 409 thứ hai là refusal (Unit U07) |
| T06 | DOM/bộ nhớ có giới hạn | Window ≤ 100 sample, ledger 14 dòng |
| T07 | Seek/playback không tạo compute | Có: 0 request khi play/seek/step, surface chỉ đọc (Unit U01/U08, Browser) |
| T08 | Certificate chỉ từ evidence thật | Có: S08 không vẽ certificate nào |
| T12 | Deep link fresh tab | Một phần: `seq` → `at_ordinal` (Browser RELOAD). Deep link theo trade/event_seq chờ P17-B |
| T13 | Reveal | Chưa làm (§7) |
| T01–T03, T05, T09–T11, T14 | fill/OCO/funding/fold/event order | `SOURCE_CAPABILITY_BLOCKED` (P17-B). Frontend chỉ giữ panel với reason code |

## 9. Request cho Codex

Mục P17-B giữ đúng tên hàng trong
[source-capability-matrix.md](./source-capability-matrix.md), không cấp ID mới.
Chỉ khoảng trống phía frontend mới dùng `CG-P17-*`.

| # | Mục | Actual | Expected | Locator | Fallback đang render | Test khi có fact |
|---|---|---|---|---|---|---|
| 1 | **`CG-P17-01`** fixture canonical | Không có fixture replay trong `apps/portal/registry/fixtures/` hay evidence P17; test frontend dựng shape từ contract spec | Fixture versioned cho `full`, `EXTREMA_BUCKET_V1`, `PENDING_SOURCE_CALLBACK`, `LEGACY_METADATA_ONLY`, `NOT_PUBLISHED`, selected/`NOT_SELECTED`, và các Problem 400/403/404/409/503 | `apps/control-api/test/research-replay.contract.spec.ts`, `replay.service.ts` | Stub theo shape của spec | Test frontend đọc fixture thay cho stub |
| 2 | **`CG-P17-02`** chọn lane theo run | Frontend không biết run có thuộc profile retained RS-02 hay không, nên phải đợi người dùng bấm; run ngoài profile trả 404/409, code không có trong generated contract của lane | Một fact typed trên replay (hoặc run) cho biết lane retained có được admit không, cộng mã refusal có tên trong generated contract | `research-current-source` contract; `replayClient.ts` `RETAINED_NOT_ADMITTED` | Nút "read retained replay"; 404/409 → câu cố định | Không bấm vẫn biết trạng thái; không còn request thử |
| 3 | **`CG-P17-03`** ngữ nghĩa số đếm (A09) | Có `source_observation_count` và `emitted_point_count`; "sample N of M" đang dùng `emitted_point_count` | Codex xác nhận M đúng là `emitted_point_count`, và `source_observation_count` là số quan sát trước khi bucket | `EquityReplay` schema | In cả hai số, có nhãn | Unit assert nhãn theo xác nhận |
| 4 | **P17-B · account/position state at playhead** | `state_at_cursor.execution_state=NOT_PUBLISHED` | Snapshot position/account có revision theo event/checkpoint gốc | matrix hàng 2 | "execution state — not published" | T12/T14 |
| 5 | **P17-B · orders/fills/trades** | 3 capability `NOT_PUBLISHED` | Ledger có ID gốc, scope route/fold, số lượng/giá/phí chính xác | matrix hàng 3 | Blotter/anatomy không có dòng | T01, T10 |
| 6 | **P17-B · event order / same timestamp** | `cross_stream_order=NOT_ASSERTED` | Event stream identity, sequence scope, tie-break | matrix hàng 4 | "not asserted" | T05, T11 |
| 7 | **P17-B · OCO / partial fill / multi-leg** | `NOT_PUBLISHED` | ID parent/child/leg, chuyển trạng thái | matrix hàng 5 | Capability gap | T02 |
| 8 | **P17-B · candles / SL-TP / MAE-MFE** | `NOT_PUBLISHED` | Candle/trade window, quy ước intrabar, công thức MAE/MFE | matrix hàng 6 | Panel MAE×MFE không có điểm | T02 |
| 9 | **P17-B · funding / capital / fold reset** | `NOT_PUBLISHED` | Funding rows, quy ước vốn theo fold | matrix hàng 7 | Cost timeline không có dòng; không compound equity | T03, T14 |
| 10 | **P17-B · child audit** | `NOT_PUBLISHED` | ID gốc/con bất biến | matrix hàng 8 | Capability gap | T14 |
| 11 | **P17-B · certificate** | Không có certificate cho Screen 08 | Certificate/evidence versioned | matrix hàng 9 | Không vẽ badge | T08 |

Không mục nào được frontend tự map, đọc thẳng DB/artifact/Parquet, hay lấy
fixture để lấp.

## 10. Reuse report (v0.5 §11.3)

| Tái dùng | Từ đâu |
|---|---|
| `EChart`, `baseOption`, `roleColorsNow` | chart QuantBT v1.1 hiện có |
| `ResearchPanel` (state frame, `aria-busy`) | Research shell |
| `ProvenanceStrip` | S05–S07 |
| `useEvidenceCursor` / hash `seq` | cursor chung của Research |
| `PortalApiError` | `lib/api` |
| Token màu `--ink-*`, `--warn`, `--bad`; font mono cho số | Fund Paper tokens |

Mới: `ReplayTransport` (chưa có transport nào trong repo), `SampleLedger`,
`AbsentPanel`, `CapabilityGap`. **Trùng lặp cục bộ:** `Chip` và `Card` nhỏ
định nghĩa lại trong `ExecuteDetail.tsx`, giống bản trong các màn S05–S07.
Đề xuất gom vào một module chung trong một `chore/*` riêng, không làm trong P17.
Không có màu raw ngoài token, không copy asset bên ngoài.

## 11. Phân loại quyết định (A4.1)

- **(a) Bobby quyết:** LENS, dòng artifact + COPY EVIDENCE LINK (§4.1); cách tích hợp baseline `952ad48f` và xung đột
  `FreezeDetail.tsx` (§6); tiêu đề S08 (`VISUAL_DECISION_REQUIRED`); có làm
  Reveal mode không; nối hook cho workspace; cách chạy axe; hai test S01/S06
  flake khi chạy 2 worker có cần `fix/*` riêng không; gom `Chip`/`Card`.
- **(b) Frontend làm được trong scope, sau khi (a)/(c) trả lời:** đổi sang
  `toResearchRefusal` + `recovery` khi tích hợp; render fact mới khi Codex
  publish (§9); đo focus ring của transport trong browser (hiện mới assert
  bằng phím và unit, chưa đo style focus).
- **(c) Source/backend (Codex):** `CG-P17-01…03` và các hàng P17-B.

## 12. Kết luận có phạm vi

- P17-A S08: frontend bám hi-fi trong giới hạn contract, có
  `PRODUCT_ROUTE_BROWSER_RECEIPT` ở 1280/660. Không còn lỗi đã biết trong
  scope S08 ngoài các mục mở ghi ở §11.
- Chưa `VERIFIED`: thiếu `REAL_API_E2E_RECEIPT` (feature-dark), axe, tích hợp
  baseline mới (§6), và các quyết định ở §11(a).
- **P17-B: `SOURCE_CAPABILITY_BLOCKED`, không done.**
