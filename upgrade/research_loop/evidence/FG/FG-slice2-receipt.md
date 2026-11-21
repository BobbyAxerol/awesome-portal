# FG slice 2 — receipt (Thanhvuong, 2026-09-29)

**Branch:** `feat/gap_frontend_thanhvuong` · **Base slice 2:** `96ac0f46` (head đã push của slice 1) · **Baseline:** `primus-origin/docs/research-loop-plan` = `a00df203` · **Người quyết:** Bobby.
**Lane:** chỉ `COMPONENT_FIXTURE_BROWSER_RECEIPT` / `PRODUCT_ROUTE_BROWSER_RECEIPT` (API stub bằng fixture có type) và unit (vitest/jsdom). **Không có `REAL_API_E2E_RECEIPT` nào trong slice này.** Ba lane không bị trộn: mọi con số dưới đây ghi rõ lane.
Log, PNG, JSON mẫu nằm ngoài repo dưới `~/tv-shots/fg2/<gói>/`, trích bằng sha256/16 (`sha256sum <file> | cut -c1-16`).

## 1. Phạm vi và chỉ đạo của Bobby

- Chỉ đạo của Bobby cho slice 2 (2026-09-29): sửa chip rc S01 (effective `EXPIRED` bị tô xanh; loading và denied không phân biệt được), dòng outcome tĩnh S11 nằm cạnh decision thật, ba defect refusal P1 ở S02, xác minh hai fail của full suite, rồi FG-07.
- Slice 1 **không** được chấp nhận là đóng gap: FG-02/03 chưa có receipt real-API, FG-06 mới là request, FG-07 chưa chạy visual gate, full suite chưa xanh. Slice 2 không thay đổi kết luận đó cho FG-02/03/06.
- Phạm vi file: chỉ `apps/portal/frontend/src/research/`, `apps/portal/frontend/e2e/research-qualification/`, `upgrade/research_loop/evidence/FG/` và một note ở Unified §13. Không backend, contract, registry, router/shell, token toàn cục, snapshot, `e2e/fixtures.ts`, Execution UI.
- Gói: A1 (S01/S11), A2 + A2b (S02), A3 (hai fail + S14), A4 (runner FG-07), B (browser receipt G0–G6), V (A/B visual trên `96ac0f46`), C (commit, evidence, push). Chỉ C commit.

## 2. Git

| Commit | Tiêu đề | File (numstat +/−) |
|---|---|---|
| `ad404196` | fix(research): S01 rc chip follows the effective status; S11 shows real decisions, not the legend | `RunLibrary.tsx` 55/12 · `runLibrary.rf06c.test.tsx` 77/3 · `ReleaseCandidateDetail.tsx` 38/15 · `releaseCandidateDetail.test.tsx` 50/0 |
| `a1d7bf3f` | fix(research): S02 refusals print client copy, never the server message | `NewRun.tsx` 37/11 · `newRun.test.tsx` 222/0 · `datasetClient.ts` 53/6 · `datasetClient.test.ts` 92/0 (mới) · `preflightClient.ts` 42/24 · `preflightClient.test.ts` 51/0 (mới) · `runCreateClient.ts` 113/15 · `runCreateClient.test.ts` 82/0 (mới) · `runCloneClient.ts` 14/6 · `runCloneClient.test.ts` 29/0 (mới) · `useNewRun.ts` 5/1 · `usePreflight.ts` 3/1 |
| `602e8410` | fix(research): S14 card shadow uses the shadow-e1 token | `AlphaImport.tsx` 8/7 |
| `0607e7a7` | test(research): qualification runner reads journey v3 and covers the seven states | `e2e/research-qualification/_probe-p23-matrix.spec.ts` 255/123 · `harness.ts` 2/1 · `states.ts` 508/0 (mới) · `stubs.ts` 181/8 |
| (commit tài liệu này) | docs(research): FG slice 2 evidence | xem `git log` |
| (commit Unified) | docs(plan): Unified §13 FG slice 2 note | xem `git log` |

Mọi commit: author `Vuong <thanhvuong11052003@gmail.com>`, trailer duy nhất `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Không amend, rebase, force, merge; không PR. Lệch trailer của slice 1 (trailer Opus 5.5) vẫn được công bố, không sửa lịch sử.

## 3. Từng sửa đổi (file:line trước @`96ac0f46` → sau @HEAD slice 2)

Viết tắt: `R/` = `apps/portal/frontend/src/research/`.

### 3.1 S01 chip rc — `VD-FG-05-06` / `VD-FG-05-07` (option B, Bobby)

| Trước | Sau |
|---|---|
| `R/RunLibrary.tsx:988` `rcChipFace` in `<id> · <raw>`; `:1040` màu `RC_TONE[face.state]` = raw → raw `APPROVED` + effective `EXPIRED` tô `var(--good)`, "effective expired" chỉ ở `title` | `:1037–1043` `shownEffective` (effective khác raw và không null) → mặt chip `<id> · <RAW> · effective <X>` (+ ` · SUPERSEDED`); `toneState`/`toneSource`; `:1078` màu `RC_TONE[face.toneState]` → `EXPIRED` = `var(--ink-faint)`; `:1091` `data-rc-tone-source` mới; `data-rc-state` giữ raw |
| lookup đang bay, 403, 404 cùng một mặt chip P21 | `:977` `LOOKUP_FACE`: ` · reading…` (đang bay) · ` · publication not readable` (403 và 404, giống hệt) · ` · publication unavailable` (408/429/5xx/transport); `:1104–1107` chip `maxWidth 100%` + ellipsis, `title` giữ đủ fact |

`session` (401) và `terminal` lookup không có hậu tố riêng (brief chỉ nêu ba state; không bịa copy).

### 3.2 S11 mirror — `VD-FG-05-02` (option B), `VD-FG-05-11`, `FE-FG2-04`

| Trước | Sau |
|---|---|
| `R/ReleaseCandidateDetail.tsx:209` `MIRROR_OUTCOMES` = "decision outcomes: …", in ở ghost `:1707` và mirror `:1818` kể cả khi đã có `decision_outcomes` thật | `:213` đọc "possible outcomes: APPROVED · APPROVED_WITH_CONDITION · CHANGES_REQUESTED · DENIED · EXPIRED" (enum giữ nguyên, VD-FG-05-09 A); `:1829–1839` khi approval AVAILABLE và `decision_outcomes` có phần tử thì không in legend, chỉ in dòng decision; ngược lại legend giữ, `data-mirror-outcomes="legend"` (`:1717`, `:1839`) |
| `:1743` `decisionLine` với `[]` in `decisions recorded: · condition_count 2` (B D-B1; blame `f0f7cc3d`, slice 1) | `:1754` `decisions recorded: none` — **FE-FG2-04, Fable sửa sau lượt browser của B: `UNIT_ONLY`, browser receipt pending** |
| dòng meta là các flex item rời `pool`, `·`, `conditions`, `·`, `outcomes` → "·" có thể đứng đầu dòng | `:429` `.rc-mirrormeta .rc-mseg { display: inline-flex; gap: 10px; }`, mỗi "·" đi cùng item trước nó (`:1709`, `:1713`, `:1826`, `:1835`); `textContent` không đổi. Residual P3: " · " bên trong text `PoolLine` vẫn có thể xuống dòng |

### 3.3 S02 — `FG-08-SERVER-PROSE` (chỉ S02)

| Id | Trước | Sau |
|---|---|---|
| FE-A1-01 | `R/datasetClient.ts:49`, `:62` `reason: error.message`; `R/NewRun.tsx:724` in "Dataset catalog not read: {catalogReason}" | `:48` `CATALOG_FAILURE_COPY` (denied / unavailable / terminal); `:80` `catalogFailureState`: 401, 403 và 404 có code `RESEARCH_` → denied (`:90–91`); 404 không code giữ note server cũ (`:96–103`, `VD-FG-08-02`); 5xx unavailable; 4xx khác terminal; facts mono ở `NewRun.tsx:730` `[data-catalog-facts]` |
| FE-FG2-05 | (cây slice 2 trước bản sửa) denial in `CODE · request <id>` → 403 `REQUEST_REJECTED` ≠ 404 `RESEARCH_*` (B F-B2) | `:55` `catalogFailureFacts(error, withCode)`; denial chỉ in `request <id>` — **Fable sửa sau lượt browser của B: `UNIT_ONLY`, browser receipt pending** |
| FE-A1-03 | `R/preflightClient.ts:240` `message: error.message`; `R/NewRun.tsx:2014` alert in `{preflightRefusal.message}` | `:148` field `copy`; `:164` `REFUSAL` một câu cố định cho mỗi code trong 20 code (exhaustive theo union sinh ra); `:152` câu generic, `:155` câu transport; `NewRun.tsx:2032` `[data-refusal-copy]`, field path mono, `:2037` `request <id>` mono; `message` giữ trên object chỉ để chẩn đoán |
| FE-A1-04 | `R/NewRun.tsx:2006` alert chỉ khi có `refusalStep`; `:2043` preview gập "…none read yet" | alert với mọi `preflightRefusal` ở Review, nút "fix in …" chỉ khi `refusalStep && refusalStep !== "review"` (`:2039`); `<details data-preflight-preview>` mở, summary "what preflight checks — 6 panels, preflight refused this request" (`:2068`); `previewState` (`:1758`) cho hai `PreflightPanel` (`:2072`, `:2076`) |
| FE-FG2-01 | `R/runCreateClient.ts:189` `message: error.message` → `R/useNewRun.ts:177` `reason: createRefusal.message` | `runCreateClient.ts:140` `REFUSAL` một câu cho mỗi code trong 13 code; `:112` generic, `:118` uncoded ("outcome unknown", `VD-FG-08-04`), `:124` transport, `:131` not-available (403 = 404 cùng câu, cùng state); `:289` `runCreateRefusalFacts`; `useNewRun.ts:180–181` `reason: copy`, `detail: CODE · request <id>` |
| FE-FG2-02 | `R/usePreflight.ts:131` `reason: refusal.message` | `:133` `reason: refusal.copy` |
| FE-FG2-03 | `R/runCloneClient.ts:34` denied "You cannot read…", `:37` terminal "was not found…" (403 ≠ 404), `:44` `reason: error.message` | `:33–41` một câu denied cho 401/403/404; `:47–52` copy client cho 5xx / 4xx khác; `detail` chỉ code + request id |

Sentinel `zq_SERVER_PROSE_SENTINEL alice@example.invalid` không xuất hiện trong `innerText` lẫn `textContent` ở mọi ô B G3.

### 3.4 S14 — `S14-ALPHAIMPORT-RAW-COLOR`

| Trước | Sau |
|---|---|
| `R/AlphaImport.tsx:178` `.ai-stepper … box-shadow: 0 1px 2px rgba(28,37,50,.05)`; `:191` `.ai-card[data-shadow]` cùng literal; `:152–155` comment có hex | `:179`, `:192` `box-shadow: var(--shadow-e1)` (giá trị `:root` giống hệt; pattern đã dùng ở CompareDetail, ReleaseCandidateDetail, LineageDetail); comment gọi tên token, không hex |

Literal do `4550f4ba` (BobbyAxerol, 2026-09-26) đưa vào — tổ tiên của base và của baseline → `INHERITED_FROM_BASE` (A3 `~/tv-shots/fg2/a3/A3-report.md` `2f745a065fca04b1`).

### 3.5 Runner qualification FG-07 (`e2e/research-qualification/`)

- `stubs.ts`: journey đọc từ contract fixture `research-foundation.journey-v3` (trước: `e2e/fixtures.ts:262` journey-v2 đã bị xoá → 64/78 ENOENT); mọi stub body có type theo `packages/contracts/generated/*.d.ts`; read không áp dụng lane trả `LaneNotApplicable` 200; stub mới cho alpha-version publication, run library, dataset catalog; helper `serve()`, `hold()`, `refusePrimary()`; regex `watchConsole` thêm 422.
- `harness.ts`: `location()` = `pathname + search + hash`.
- `states.ts` (mới): kế hoạch 9 state có type cho 15 màn, mỗi N/A có lý do file:line.
- `_probe-p23-matrix.spec.ts`: test bảng applicability + một test cho mỗi ô RUN ở 1280/660/1440 (marker của state là marker duy nhất hiện, 403 copy = 404 copy, không sentinel trong `document.body.textContent`).
- Diff 1 dòng `e2e/fixtures.ts:262` (journey-v2 → v3) **vẫn chỉ là đề xuất** cho Bobby; runner không cần nó.

## 4. Test theo lane

### 4.1 Unit (vitest/jsdom)

| Gói | Lệnh (tóm tắt) | Kết quả | Log sha256/16 |
|---|---|---|---|
| A1 | rf06c + releaseCandidateDetail + runLibrary* | 5 file, 204/204 | `~/tv-shots/fg2/a1/vitest.log` `77471054e78e733b` |
| A2 | newRun + datasetClient + preflightClient | 3 file, 91/91 | `~/tv-shots/fg2/a2/vitest.log` `a0fa93a25b8b9d4c` |
| A2b | newRun + runCreateClient + preflight + w4 | 4 file, 145/145; mutation 3/4 test A2b fail khi đảo lại `reason: …message` | `~/tv-shots/fg2/a2b/vitest.log` `380f5c1583338e41`; `mutation.log` `0a75912abae8b857` |
| A3 | tokens + alphaImport + alphaImport.e6 (sau sửa) | 3 file, 82/82 | `~/tv-shots/fg2/a3/vitest-after-fix.log` `94ca7d782ba120bb` |
| Fable (audit) | full suite trên tree slice 2 | 201 file: 200 pass / 1 fail; 3930 test: 3928 pass / 1 fail / 1 skip. Fail duy nhất: `src/execution/r2Ledger.test.ts` (kế thừa, `CG-FG-R2-01`) → **gate NOT GREEN** | `~/tv-shots/fg2/audit/vitest-full-2.log` `a12c4e9d392aa55d` |
| Fable (audit) | `tsc -b --noEmit` | exit 0 | `~/tv-shots/fg2/audit/tsc.log` (rỗng) `e3b0c44298fc1c14` |

Test mới đáng chú ý: rf06c "prints an APPROVED candidate whose effective status is EXPIRED as effective EXPIRED in faint ink, not the approved green", "tells a pending lookup, a 403 or 404 refusal and a 503 apart on the chip face; 403 and 404 read the same"; S11-U61…U63; newRun "FG-08 — Screen 02 never renders the server's refusal prose" (7) và "FG-08 (A2b) …" (4); `datasetClient.test.ts` (8), `preflightClient.test.ts` (4), `runCreateClient.test.ts` (7), `runCloneClient.test.ts` (3).

### 4.2 Fixture browser (gói B, 127.0.0.1:4417, build slice 2 trước FE-FG2-04/05)

B report `~/tv-shots/fg2/final/B-report.md` `b6c316d3135c5e5b`; bảng digest đủ: `~/tv-shots/fg2/final/hashes.txt` `c4f79888e6495a0b`.

| Gate | Lane | Kết quả | Số đếm | Log sha256/16 |
|---|---|---|---|---|
| G0 build + preview | — | PASS | `npm run build` exit 0; dist 438 file, digest `26f98b96ad6a006f` (build lại trong container G6 ra cùng digest) | `g0-build.log` `d50080dcec56ea76` |
| G1 S01 chip (1280/660/1440) | `PRODUCT_ROUTE_BROWSER_RECEIPT` | PASS | 27/27; chỉ ô raw APPROVED + effective APPROVED là `--good`; d ≠ e, e = f, g ≠ e; 0 "reading…" sau khi settle; overflow 0 ở 660 | `g1-s01-run.log` `4c4a7e71d2caf79d` |
| G2 S11 mirror (run + pack route) | `PRODUCT_ROUTE_BROWSER_RECEIPT` | PASS (+ phát hiện D-B1 → FE-FG2-04) | 26/26; 0 dòng bắt đầu bằng "·" | `g2-s11-run.log` `0de69e3eac3db6fb` |
| G3 S02 refusals | `PRODUCT_ROUTE_BROWSER_RECEIPT` | PASS mọi assertion brief trừ một cách đọc chặt (F-B2 → FE-FG2-05) | 40/40 (13 ô × 3 width + summary); sentinel không có trong innerText/textContent | `g3-s02-run.log` `a91de90fd5cd394d` |
| G4 S14 shadow, cây hiện tại vs HEAD `96ac0f46` | `COMPONENT_FIXTURE_BROWSER_RECEIPT` | PASS | 48/48 lượt đọc giống hệt (`rgba(28, 37, 50, 0.05) 0px 1px 2px 0px`); PNG full-page 1280 byte-identical `d1d5a14b18bc7e3f` | current `0e67d6c1c65f79e1`, head `717f994942fea3a6`, head build `3755783db10a6500` |
| G5 runner qualification | `COMPONENT_FIXTURE_BROWSER_RECEIPT` | như dự kiến | 134 test: 119 pass / 15 fail, cả 15 = D1 (`VD-FG-01-01`) | `g5-runner.log` `46630124861d0ee8` |
| G5 fg04 probe | `COMPONENT_FIXTURE_BROWSER_RECEIPT` | PASS | 11/11 | `g5-fg04.log` `c165b1035613d091` |
| G6 visual gate pinned | visual (image ghim, compare only) | **FAIL (exit 1)** | 324 pass / 8 fail / 16 skipped | `visual.log` `37cab119e1adfc3a` |

FE-FG2-04 và FE-FG2-05 được Fable sửa **sau** lượt browser của B: chỉ có unit (`UNIT_ONLY`), browser receipt pending.

### 4.3 Real API

`REAL_API_E2E_RECEIPT`: **NOT_RUN** cho mọi màn — `BLOCKED_BY_RUNTIME` (grant G1–G6, [FG-runtime-activation-request.md](./FG-runtime-activation-request.md)). Không dòng nào trong receipt này là receipt real-API.

## 5. State applicability — 15 màn × 9 state (runner FG-07, A4 §3)

| Screen | healthy | loading | empty | partial | stale | denied | unavailable | terminal | expired |
|---|---|---|---|---|---|---|---|---|---|
| S00 journey map | RUN | RUN | RUN | N/A | RUN | RUN | N/A | RUN | RUN |
| S12 engine atlas | RUN | RUN | RUN | N/A | RUN | RUN | RUN | RUN | RUN |
| S02 new run | RUN | RUN | RUN | N/A | N/A | RUN | RUN | RUN | RUN |
| S14 alpha import | RUN | RUN | RUN | N/A | N/A | RUN | RUN | RUN | RUN |
| S01 run library | RUN | RUN | RUN | N/A | N/A | RUN | RUN | RUN | RUN |
| S03 run progress | RUN | RUN | RUN | RUN | N/A | RUN | RUN | RUN | RUN |
| S04 evidence hub | RUN | RUN | RUN | N/A | N/A | RUN | RUN | RUN | RUN |
| S05 split | RUN | RUN | N/A | RUN | RUN | RUN | RUN | RUN | RUN |
| S06 search | RUN | RUN | N/A | RUN | RUN | RUN | RUN | RUN | RUN |
| S07 freeze | RUN | RUN | RUN | N/A | N/A | RUN | RUN | RUN | RUN |
| S08 execute replay | RUN | RUN | RUN | RUN | RUN | RUN | RUN | RUN | RUN |
| S09 run report | RUN | RUN | N/A | RUN | N/A | RUN | RUN | RUN | RUN |
| S10 attempt lineage | RUN | RUN | RUN | RUN | N/A | RUN | RUN | RUN | RUN |
| S11 release candidate | RUN | RUN | N/A | RUN | RUN | RUN | RUN | RUN | RUN |
| S13 compare | RUN | RUN | RUN | RUN | RUN | RUN | RUN | RUN | RUN |

Tổng: **115 RUN / 20 NOT_APPLICABLE** (N/A = NOT_APPLICABLE). Bảng JSON: `~/tv-shots/fg2/a4/shots/state-applicability.json` `43e0506e4b52592c`; A4 report `~/tv-shots/fg2/a4/A4-report.md` `5289623ee0063ed2`.

Lý do NOT_APPLICABLE (file:line dưới `R/` trừ khi ghi khác):

| Màn | State | Lý do |
|---|---|---|
| S00 | partial | `foundationRoutes.tsx:83` — read journey OK luôn ra rowCount 1, không declaredUnavailable |
| S00 | unavailable | `foundationRoutes.tsx:134-141` — 503 trên journey vẽ map đóng gói ở dạng stale, `unavailable` không bao giờ hiện |
| S12 | partial | `foundationRoutes.tsx:83` — read atlas OK luôn ra rowCount 1 |
| S02 | partial | `NewRunRoute.tsx:125,155` · `usePreflight.ts:138` — đường OK của atlas, registry, preflight chỉ mang rowCount |
| S02 | stale | `NewRunRoute.tsx:117-141,148-170` — atlas và registry đọc một lần (deps `[]`); `usePreflight.ts:127`, `useNewRun.ts:173` dùng `hasAcceptedResponse:false` |
| S14 | partial | `useAlphaImport.ts:102` — read registry OK chỉ mang rowCount |
| S14 | stale | `useAlphaImport.ts:97-113,252` — `loadRegistry` đọc lại không có state đang bay; ghi theo bước dùng `hasAcceptedResponse:false` |
| S01 | partial | `useRunLibrary.ts:585` — read list OK chỉ mang rowCount |
| S01 | stale | `useRunLibrary.ts:579-585` — stale cần 409 trên hàng đã nhận, list read không publish 409 (`research-run-library.d.ts`: 400/401/403/404/503) |
| S03 | stale | `useRunProgress.ts:620-643` — không có đọc lại khi đang giữ snapshot, `isStale` không bao giờ bật; `progressClient.ts:294-297` ép 409 thành terminal |
| S04 | partial | `useEvidence.ts:258-264` — không truyền `declaredUnavailable` vào `researchState` |
| S04 | stale | `EvidenceFlow.tsx:4196-4207` · `useEvidence.ts:109-127` — control đọc lại chỉ hiện ở state recoverable |
| S05 | empty | `useSplit.ts:183,203` — rowCount cố định 1 |
| S06 | empty | `useSearch.ts:199` — rowCount là max(1, …) |
| S07 | partial | `useFreeze.ts:260-279` — không đường nào ra partial |
| S07 | stale | `research-freeze.d.ts` không publish 409 trên freeze GET (`researchRefusal.ts:83-86` không có `RESEARCH_FREEZE_CONFLICT`) |
| S09 | empty | `reportClient.ts:379-390` · `useReport.ts:113-119` — `reportState` chỉ trả partial hoặc available |
| S09 | stale | `useReport.ts:112-118` · `ReportDetail.tsx:1307` — retry chỉ hiện khi không giữ report; `reportClient.ts:345-349` map 409 thành terminal |
| S10 | stale | `useLineage.ts:94,111-118` · `LineageDetail.tsx:1948` — retry không hiện khi giữ lineage; `loadOlder` có inFlight riêng |
| S11 | empty | `releaseCandidateClient.ts:499-513` — `composeState` chỉ trả partial hoặc available |

## 6. Runner FG-07 — kết quả

- Trước (slice 1, B G7a): 78 test, 14 pass / 64 fail (cả 64 ENOENT journey-v2). Sau (slice 2, B G5 trên build slice 2): **134 test, 119 pass / 15 fail**; A4 lượt cuối trên build 20:18 cũng 119/15 (`~/tv-shots/fg2/a4/logs/final.log` `8e1c79fc1248305d`).
- Theo spec: matrix 101/15 · stale 9/0 · interaction 7/0 · cycles 1/0 · load 1/0.
- Cả 15 fail = **D1 = `VD-FG-01-01`**: `researchRefusal.ts:231` `detail: error.message` → `ResearchPanel.tsx:102-110` in trong `<details data-research-detail>` đóng; sentinel có trong `textContent`, không có trong `innerText`. Ô: S01 denied/unavailable/terminal; S04 unavailable/terminal; S05 và S06 stale/denied/unavailable/terminal; S07 unavailable/terminal. 0 fail harness; 403 copy = 404 copy ở mọi ô denied.
- Cô lập: spec runner không nằm trong list của config chính, research-probe hay fg04 (A4 §6).
- **Trạng thái FG-07 runner: `PARTIAL — harness green, 15 cells red on an open owner decision`.**

## 7. Xác minh hai failure của full suite (A3)

| Failure | Head `96ac0f46` | Base `8783461e` | Baseline `a00df203` | Commit đưa vào (author, ngày) | Tổ tiên của base / baseline | Phân loại |
|---|---|---|---|---|---|---|
| `src/styles/tokens.test.ts` > U02 token gate > keeps every raw color literal inside the declared token files | FAIL (6 dòng, đều ở `AlphaImport.tsx`) | FAIL, giống hệt | FAIL, giống hệt | `4550f4ba` (BobbyAxerol, 2026-09-26) | có / có | `INHERITED_FROM_BASE` (có cả ở baseline) — **đã sửa ở slice 2** (`602e8410`) |
| `src/execution/r2Ledger.test.ts` > R2-0 · capability inventory > makes every INTENTIONALLY_UNEXPOSED route say why | FAIL | FAIL, giống hệt | **PASS** (22/22) | `5a5c79b7` (BobbyAxerol, 2026-09-27) | có / **không** | `INHERITED_FROM_BASE` (không có ở baseline) — owner codex/Bobby, packet `CG-FG-R2-01`; FE không được sửa ledger |

- Log: head `~/tv-shots/fg2/a3/vitest-head.log` `c019014538761fd4`, base `vitest-base.log` `65452be367015505`, baseline `vitest-baseline.log` `2d13f5f850746d94`. Phần "Failed Tests" của head và base giống byte (bỏ dòng `Start at`/`Duration`).
- **Đính chính slice 1:** fail `r2Ledger` **không** phải "inventory thiếu route P22" (`CG-P22-C`). Test "covers exactly the routes the controllers publish" pass ở cả ba revision. Assertion fail là rule câu chữ evidence của route `INTENTIONALLY_UNEXPOSED` `POST /internal/research/progress/sources/imported` (`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/r2_ledger/capability-inventory.v1.json:1628–1637`). Câu cũ giữ gạch ngang trong [FG-debt-register.json](./FG-debt-register.json); packet mới ở [FG-backend-requests.md §7](./FG-backend-requests.md).

## 8. Visual gate pinned (FG-07) — kết quả và quy trách nhiệm

- **Đã chạy** (gói B, G6): `/usr/bin/time -v ./scripts/portal-web-visual.sh` từ root repo trên tree slice 2 (chưa commit lúc chạy); image ghim `mcr.microsoft.com/playwright:v1.62.1-noble` (pull lần đầu thành công, digest `sha256:dcc5531e9784…`), docker rootless, chỉ compare, **không `--update`**, không `npm ci`, không publish host port. Kết quả: **324 passed / 8 failed / 16 skipped, exit 1** (16 skipped là test có điều kiện `el-v2-evidence-shots`). Log `~/tv-shots/fg2/final/visual.log` `37cab119e1adfc3a`.
- **Trạng thái: `FAIL — 8 snapshots`.** Không update baseline; không snapshot nào bị ghi.
- **A/B trên `96ac0f46` (gói V, worktree sạch, `node_modules` copy, cùng script):** 324 passed / 8 failed / 16 skipped, exit 1, log `~/tv-shots/fg2/v/visual-head.log` `00d19f7d95499aa4`; V report `~/tv-shots/fg2/v/V-report.md` `1d6d06eae1e030f8`. Danh sách fail giống hệt (`fail-head.txt` = `fail-slice2.txt` = `ac3760f665f3f691`), danh sách pass/skip giống hệt (452 dòng, `a22723111308aa8b`), 24/24 PNG actual/expected/diff trùng sha256 (`head-drift-hashes.txt` `86a03eab61a5d1fb`). → cả 8 là **`PRE_EXISTING_ON_96ac0f46`**; `INTRODUCED_BY_SLICE_2` 0; `FIXED_BY_SLICE_2` 0. Slice 2 không đổi pixel nào trên màn nào suite phủ.

| # | Snapshot (`e2e/visual.spec.ts-snapshots/*-chromium-linux.png`) | Màn | Diff slice 2 = diff `96ac0f46` (px / tỉ lệ / chiều cao) | Phân loại |
|---|---|---|---|---|
| 1 | run-progress-research-laptop | Run Progress | 106792 / 0.05 / 1686→1695 | PRE_EXISTING_ON_96ac0f46 |
| 2 | run-audit-research-laptop | Run Audit | 5022 / 0.01 / không đổi | PRE_EXISTING_ON_96ac0f46 |
| 3 | run-overview-operations-laptop | Run Overview | 33303 / 0.02 / 2237→2238 | PRE_EXISTING_ON_96ac0f46 |
| 4 | run-optimization-operations-laptop | Run Optimization | 115689 / 0.03 / 4314→4315 | PRE_EXISTING_ON_96ac0f46 |
| 5 | run-parameters-operations-laptop | Run Parameters | 38023 / 0.02 / 2152→2154 | PRE_EXISTING_ON_96ac0f46 |
| 6 | run-execution-operations-laptop | Run Execution | 49275 / 0.02 / 2841→2842 | PRE_EXISTING_ON_96ac0f46 |
| 7 | run-progress-operations-laptop | Run Progress | 216606 / 0.10 / 1682→1695 | PRE_EXISTING_ON_96ac0f46 |
| 8 | run-audit-operations-laptop | Run Audit | 31410 / 0.02 / 1257→1259 | PRE_EXISTING_ON_96ac0f46 |

- **Quy trách nhiệm:** cả 8 file snapshot được ghi lần cuối bởi `0ddda3d0` (BobbyAxerol, 2026-09-07, "fix(release): qualify production-active portal browser gates"). Nguồn drift B chỉ ra: `src/app/TopBar.tsx:44-46` (crumb run + `crumbTail = entityLabel ?? runCrumb?.screen ?? null`), blame `c81e8dc2` (BobbyAxerol, 2026-09-27, merge "E4/E11/E12/E15 screens 00-04, D1 run label, E13 lineage parent"; thay đổi nằm trong chính nội dung merge). `c81e8dc2` và `0ddda3d0` đều là tổ tiên của base `8783461e`, baseline `a00df203` và `96ac0f46` → drift kế thừa qua base và baseline, không phải việc của slice 2 hay của branch này. Việc crumb làm topbar xuống dòng và đẩy trang 1–13 px là cách đọc ảnh diff của B; V chỉ so byte, không xem lại ảnh.
- Không snapshot nào của S01/S02/S11/S14 drift; `new-run` (route S02, state mặc định) pass ở cả hai theme; `alpha-imports` (danh sách, không phải wizard S14) pass. Suite **không phủ** S01 Run Library, S11 RC detail, S14 alpha-import wizard.
- Re-record 8 baseline hay revert thay đổi shell: **`VD-FG-07-01`, chỉ Bobby quyết.**

## 9. Reuse report

- **Tái dùng:** `RC_TONE` và ánh xạ sẵn `EXPIRED → var(--ink-faint)`; format mặt chip và các state `lookupNote`; `data-rc-publication`; hằng `MIRROR_OUTCOMES` (giữ tên export), `decisionLine`, `conditionLine`, hàng flex `.rc-mirrormeta`; phần tử `role=alert`, class và token có sẵn (`var(--bad)`, `var(--bad-bg-soft)`), class `mono text-[9.5px]`, `<details>/<summary>` preview; `ResearchPanel` và disclosure `detail` mono có sẵn; dạng `request {id}` của CompareDetail/LineageDetail/ReleaseCandidateDetail/AlphaImport; câu denied F-04 `REFUSAL_COPY.denied` cho run-create; bảng copy nằm trong bảng `REFUSAL` có sẵn của từng client (pattern `FOUNDATION_REFUSAL_SENTENCE` / `IMPORT_REFUSAL_SENTENCE`); token `--shadow-e1` và pattern `box-shadow: var(--shadow-e1)` của các màn research anh em; `installLane` / `stubPortalApi` / `contractFixture` của runner.
- **Mới (không component, không token, không màu thô):** hằng private `LOOKUP_FACE`; hai field `RcChipFace` (`toneState`, `toneSource`); attribute `data-rc-tone-source`, `data-mirror-outcomes="legend"`, `data-catalog-facts`, `data-refusal-copy`; một rule CSS `.rc-mseg` trong stylesheet sẵn có của màn; các hằng copy (`CATALOG_FAILURE_COPY`, `PREFLIGHT_*_COPY`, `RUN_CREATE_*_COPY`) và helper facts; file test mới cho bốn client; `states.ts` cho runner (không có kế hoạch state nào để tái dùng).
- Shared `RefusalNote`, `ResearchPanel`, `researchRefusal.ts` **không** bị sửa (`VD-FG-01-01` vẫn thuộc Bobby).

## 10. Phát hiện còn mở

- **D1 / `VD-FG-01-01`** — prose server trong `<details data-research-detail>` (component dùng chung); chặn 15 ô runner. Biến thể nhìn thấy không cần click: `RefusalNote` `ResearchPanel.tsx:242-255` (phát hiện tĩnh, matrix không chạm tới).
- **D2 (A4)** — `ReportFailedSheet.tsx:58` in `outcome.failure_message` (prose server trong payload thành công) → gộp vào `VD-FG-08-03`.
- **Residual `VD-FG-05-11`** — " · " trong text `PoolLine` vẫn có thể xuống dòng (P3, open).
- **`MIRROR_PUBLISHED_NOTE`** ("records one of the outcomes above") giữ nguyên chữ HiFi; khi đã có decision, "above" chỉ dòng decision thay vì legend (A1, để Bobby xem).
- **Quan sát contract (ứng viên CG, chưa mở packet):** foundation reads (journey, atlas, alphas registry) không khai báo 403 trong d.ts; run library và freeze GET không khai báo 409 → S01/S07 stale không tới được.

## 11. Lệch HiFi

Cặp ảnh HiFi (B, ngoài repo): S01 `pair-s01-a-vs-hifi-{1280,660,1440}` `15420fa34c589b3c` / `0333ee0e59d2554d` / `c96311fddc23a728`; S11 `pair-s11-run-decisions-vs-hifi-published-{1280,660,1440}` `f2084a037ccbb83f` / `45d4820a2b7477c2` / `a04abe946069e59c`, `pair-s11-run-ghost-vs-hifi-draft-*` `b34027d86f35f2ea` / `8844b9262397db3e` / `1ce9611c59793956`. S02 và S14 không có cặp HiFi (brief không yêu cầu).

| Màn | Lệch | Ghi chú |
|---|---|---|
| S01 | mặt chip thêm hậu tố raw/effective và reading/refusal, HiFi không có | mới ở slice 2, theo `VD-FG-05-06`/`-07` B |
| S01 | id chip là ULID thật cắt 14 ký tự + "…"; HiFi id ngắn (`rc_2026_08_c · APPROVED`) | có từ trước |
| S01 | HiFi 7 run, fixture 4; product thêm hàng claim-ledger strip; timestamp ở hàng 2; shell registry; hàng R-WFO-120 SUPERSEDED att_08 | có từ trước / do fixture |
| S01 | ở 660 HiFi tự tràn 36 px, product 0 | product không lệch mục tiêu |
| S01 | màu APPROVED giống hệt: `rgb(30,123,79)` cả hai | khớp |
| S11 | HiFi in tĩnh `decision outcomes: APPROVED · APPROVED_WITH_CONDITIONS · CHANGES_REQUESTED · REJECTED · SUPERSEDED · EXPIRED` và không bao giờ ẩn; product in legend `possible outcomes:` (enum contract) và ẩn khi đã có decision | mới ở slice 2 theo `VD-FG-05-02` B; enum = `VD-FG-05-09` A |
| S11 | HiFi "records one of six outcomes", product "one of the outcomes above" | có từ trước |
| S11 | pool HiFi là tên team, product là reason contract (`VD-FG-05-08`); SLA tương đối vs ISO tuyệt đối (`VD-FG-05-04`) | có từ trước |
| S11 | HiFi để "·" đầu/cuối dòng; product không bao giờ để "·" đầu dòng | mới ở slice 2 (`VD-FG-05-11`) |

## 12. Việc Bobby quyết

- `VD-FG-01-01` (OPEN) — prose server trong component refusal dùng chung; chặn 15 ô runner.
- `VD-FG-08-01` wording 20 câu preflight + 13 câu run-create; `VD-FG-08-02` 404 không code trên dataset catalog giữ note server cũ; `VD-FG-08-03` `run_admission.message` / `gate.message` / `failure_message` (prose server trong payload thành công) có thuộc rule không; `VD-FG-08-04` refusal run-create không code nói outcome unknown; `VD-FG-08-05` 403 CSRF đọc như denial trung tính.
- `VD-FG-07-01` — 8 baseline visual drift: re-record hay revert thay đổi shell (chỉ Bobby).
- Nhập slice 1 + slice 2 (branch riêng, chưa PR vì Primus base còn `a00df203`); diff 1 dòng `e2e/fixtures.ts:262` (journey-v2 → v3); grant G1–G6.
- Chi tiết: [FG-owner-decisions.md](./FG-owner-decisions.md).

## 13. BLOCKED / NOT_RUN

- `BLOCKED_BY_RUNTIME`: FG-02, FG-03, OL-24, mọi lane real-API (grant G1–G6). G7 (visual gate) **không còn blocked**: đã chạy.
- FG-06: không đổi, chỉ có packet `CG-FG-D1-O1`.
- Browser receipt cho FE-FG2-04 và FE-FG2-05: pending (sửa sau lượt B; `UNIT_ONLY`).
- Chip S01 ở 660 được B đo (overflow 0); A1 không có PNG riêng (không port).
- `session`/`terminal` lookup S01 không có hậu tố chip riêng (không có copy trong brief).
- axe: vẫn NOT_RUN (grant G6).
- Suite visual không phủ Run Library (S01), RC detail (S11), alpha-import wizard (S14).

## 14. Kết luận có phạm vi

- Trong phạm vi slice 2 và **chỉ trên lane fixture + unit**: chip rc S01 (`VD-FG-05-06`/`-07`), legend outcome S11 (`VD-FG-05-02`) và separator (`VD-FG-05-11`) đã implement và VERIFIED fixture lane; ba defect P1 S02 (FE-A1-01/03/04) FIXED · VERIFIED fixture lane; FE-FG2-01…03 FIXED (unit + ô B G3); FE-FG2-04/05 FIXED `UNIT_ONLY`; `S14-ALPHAIMPORT-RAW-COLOR` FIXED (kế thừa từ base).
- Full suite **NOT GREEN**: 1 fail kế thừa do Codex sở hữu (`CG-FG-R2-01`). `tsc -b --noEmit` exit 0.
- FG-07: runner `PARTIAL — harness green, 15 cells red on an open owner decision`; visual gate `FAIL — 8 snapshots` (không update baseline).
- Gap frontend **chưa đóng**: không có receipt real-API; FG-02/03/OL-24 `BLOCKED_BY_RUNTIME`; FG-06 chỉ là packet; `VD-FG-01-01` và các VD mới còn chờ Bobby. Không dòng nào ở Unified §13.4.1 được nâng thành DONE/CLOSED.
