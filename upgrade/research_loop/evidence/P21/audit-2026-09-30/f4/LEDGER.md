# F5a · GROUP LEDGER — đối chiếu sổ §13.4.1 với code hiện tại (2026-10-01)

Cây kiểm: `71aed3e6` (F1–F4 + các sửa sau đó). Cách kiểm: đọc/grep code `apps/portal/frontend/src/research/**`, test và record; không chạy test, không build, không mở trình duyệt (không cần: mọi dòng có locator hoặc tên test). Không dòng nào được nâng thành DONE chỉ vì sổ cũ ghi "đóng". Trạng thái: DONE / PARTIAL / OPEN / WONT_DO(decision) / BLOCKED_BY_CODEX(id). Không động vào dòng do Codex làm (backend: OL-*, CG-*, E10–E17 phần BE, F4, F6, F7, F8, F10, F11, F14).

Tổng: **50 dòng kiểm, 17 dòng đính chính.** Cột "Đính chính" = sổ ghi sai hoặc cũ so với code hôm nay.

## E-FE

| Id | Trạng thái | Bằng chứng | Đính chính |
|---|---|---|---|
| E1 | **PARTIAL** | DONE: `ShortId`/`shortId` (`ShortId.tsx`, 20 màn dùng), `groupDecimalString` (`researchFormat.ts`; dùng ở S06/S07/S14), `REFUSAL_COPY.denied` cho S03 (`RunProgress.tsx:2137`), S04 (`EvidenceFlow.tsx:4312`), S05 (`SplitDetail.tsx:437`), S10 `LINEAGE_NEUTRAL_REFUSAL`, S11 `RC_NEUTRAL_REFUSAL`, S13 `COMPARE_NEUTRAL_REFUSAL`; S11 `.rc-pack` chỉ `thead th` viết hoa (`ReleaseCandidateDetail.tsx:363`), `tbody th` không. Link "not built yet" ở S04 đã bỏ (chỉ còn hằng chết `COMPARE_PICK_ONE_MORE`, `runLibraryClient.ts:160-170`, không ai dùng). OPEN: (1) **bảng dữ liệu a11y của chart KHÔNG làm tròn** — `EvidenceCharts.tsx:152` `ExactTable` + 638/644/685/704/727/728 in `toISOString()` (ms) và chuỗi float đầy đủ; S08 cùng kiểu (`ExecuteDetail.tsx:404,827`, `ExecuteCandleReplay.tsx:559`); caption ghi "exact values" nên đây là cố ý cho người đọc màn hình, nhưng sổ ghi "làm tròn" là sai; (2) timestamp ISO-mili-giây còn hiện chữ thường ở S11 (`ReleaseCandidateDetail.tsx:1815` "updated …", `:1980` "mirror as of …") và S01 (`RunLibrary.tsx:1181`). | **Có.** Sổ ghi "ĐÃ LÀM … bảng dữ liệu a11y làm tròn" cho S04 → sai: chưa làm. "Timestamp không ISO mili-giây … ĐÃ LÀM cho S01–S04, S11" → sai ở S01 (1181) và S11 (1815, 1980). |
| E2 | **DONE** | `OWN_FRAME_SCREEN` có freeze/execute (`QuantBTModule.tsx:248`); nút copy evidence link `CopyEvidenceLink` (`FreezeDetail.tsx:1679`, `ExecuteDetail.tsx:1391`); `propose new attempt →` (`FreezeDetail.tsx:1686`, `data-action="propose-new-attempt"`); `foldLabel` (`researchFormat.ts:165`, dùng ở S05–S09); nút `\|◀`/`▶\|` (`ExecuteCandleReplay.tsx:1110,1128`); reveal không co và không lộ nến tương lai (`executeCandleReplay.test.tsx:85,91,100,291`); dải IS/OOS/HOLDOUT (`ExecuteDetail.tsx:1288-1299`); `DigestChain.tsx`; `StageDenied.tsx` dùng ở `FreezeRoute.tsx`/`ExecuteRoute.tsx`. Chưa thấy test riêng cho `propose-new-attempt` và `StageDenied` (grep tên: 0). Tràn 660 đo ở lane OL-23 (54 ô, overflow 0, 2026-09-27) và chưa đo lại sau F1–F4. | **Có (nhỏ).** "slider what-if dùng `rvol`/`slpercent`": F1b đã bỏ tên cố định — card không có slider server thì không in tên tham số (`WhatIfCard.tsx:155-156`); tên lấy từ tham số server publish. |
| E3 | **PARTIAL** | Notice PARTIAL đếm đúng (`reportClient.ts:379`, `reportDetail.f3.test.tsx`); không `break-all` (`ReportDetail.tsx:156` `.rr-long`); headline theo dấu (`:654`); "deepest" dời khỏi đường (`:904-906`); lưới equity 6 vạch (`reportEquity.ts:59-65` `yRulePcts`, hai đầu có nhãn, VD-P20-27); ô `NET_RETURN` + qualifier "declared, not executed" (`ReportDetail.tsx:635-642`). Còn: chạy lại in Letter/A4 trên dữ liệu thật (G5). | **Có.** Dòng "Còn: trục equity 6 tick; ô OOS return; qualifier P04; evidence link provenance" cũ — bốn mục đầu đã xong (E14 + F1/F3). |
| E4 | **PARTIAL** | S01: ô null-AVAILABLE in "not published", không in "available" (`RunLibrary.tsx:296-298`). S02: chip `NO VERSION CHOSEN` (`newRun.test.tsx:698-712`), warmup/required columns (record `P13/E4_…`), tới được bước tham số. S04: bỏ đoạn phẳng trước OOS (`EvidenceCharts.tsx` `preOosSplit`, `evidenceCharts.test.tsx:239,261`). **S03: KHÔNG làm.** `ClaimPassport` (`RunProgress.tsx:1474`) chỉ có claim, certification, seal, hand-off, cursor, failure — không có 4 methodology claim (validation, chronological, oos_used_for_selection, holdout_state) và run QUEUED chỉ có một câu "queued — waiting for a worker" (`RunProgress.tsx:2150-2185`), không có passport forecast. `ClaimPassport` có từ `6c3dc67a` (2026-09-24), trước E4. | **Có — đúng lỗi Bobby nêu.** Sổ ghi "ĐÓNG … S03 claim passport + forecast" → sai; phần S03 không có code. Nay: **BLOCKED_BY_CODEX(CG-FG-S03-02)** (progress read chưa có `claims[]`); FE không tự dựng claim. |
| E5 | **DONE** (FE) | B1/B2/B3 + `searchStageB.e5.test.tsx`, `SearchStageB.tsx:4-17`. E5-O1/O2 (max_dd từng candidate; K thật + id pool cho mode 3/4/5) vẫn là request engine: **BLOCKED_BY_CODEX(E5-O1, E5-O2)**. | — |
| E6 | **DONE** (FE) | `alphaImport.e6.test.tsx`; stepper `role=tablist` (`AlphaImport.tsx:1107`); chip lifecycle (`:910`); registry strip "top N / total" + load-more (`:848,1497`; `alphaImport.misc.test.tsx`). OPEN nhỏ: stepper chưa có phím mũi tên/roving tabindex (`AlphaImport.tsx`, grep `onKeyDown` = 0; B1 14-04). E6-BR-01 chữ ký/SBOM: **BLOCKED_BY_CODEX(E6-BR-01)**. | **Có (nhỏ).** "Còn: cap cho registry strip" → đã xong (G9, `next_cursor`). |
| E7 | **DONE** (FE) | S12 thẻ 3 cột + "← this run" (`engineAtlas.rf02.test.tsx:302-306`, `EngineAtlas.tsx:890`); S13 gộp attempt không claim; S10 theo D8 (`lineageDetail.test.tsx:672-674`). Mật độ S12 còn cao hơn HiFi: xem VD-RF04-01. | **Có.** "Còn: ladder S13 mũi tên cuối hàng" → đã sửa (VD-F1-03, FG-04a): xem G4. |

## D (quyết định thiết kế đã chốt)

| Id | Trạng thái | Bằng chứng |
|---|---|---|
| D1 | **DONE** | `runLabels.ts` + `rememberRunLabel(s)` ở library (`runLibraryClient.ts:135`), progress, evidence (`evidenceClient.ts:188`), lineage (`lineageClient.ts:174`), report (`reportClient.ts:164`), RC (`releaseCandidateClient.ts:202,217`), compare (`compareClient.ts:264-268`); `runLabels.test.tsx`, `runLabels.clientBindings.test.ts`; nhãn `null` → id ngắn, không bịa. |
| D2 | **DONE** | `JourneyMap.tsx:199` "pick a run →"; `foundation.test.tsx`, `journeyScope.f1.test.tsx`. |
| D3 | **DONE** | `RunLibrary.tsx:2156-2439` `status_counts` dòng 1; `runLibrary.rf06.test.tsx:551`. |
| D4 | **DONE** | `NewRun.tsx:912-935` prefill từ coverage, nhãn "prefilled from … coverage"; `coveragePrefill.test.tsx`, `dataDeclaration.test.tsx`; record `f4/S02_DATA.md` (ghi PARTIAL ở dòng chữ của bước windows). Không dataset → để trống. |
| D5 | **WONT_DO(decision)** | Hoãn — không có "ARCHIVE RUN" trong code (grep 0), không có endpoint. |
| D6 | **WONT_DO(decision)** | Không dựng search cinema; chỉ một dòng typed giữ chỗ (`SearchDetail.tsx:2195-2204`). |
| D7 | **DONE** | `usePlayAcrossFolds.ts`, `ExecuteCandleReplay.tsx:1097,1173`; `executePlayAcrossFolds.test.tsx` (bật tắt cục bộ không request, deep link mở ở trạng thái tắt, một fold thì công tắc tắt). Chưa có receipt real-API (xem G1). |
| D8 | **DONE** | `lineageDetail.test.tsx:672-674`, VD-F1-02 (F1b `f1b/S10_S14.md`). |
| D9 | **PARTIAL** | Làm theo HiFi (3 cột, Routes gọn); chiều cao còn lệch HiFi: chờ Bobby VD-RF04-01. |
| D10 | **DONE** | Gộp attempt không claim; "N attempts · one claim: <family>" (`CompareDetail.tsx:1088`); markets nhóm theo market (BE P20). |

## F (chỉ dòng chạm frontend)

| Id | Trạng thái | Bằng chứng | Đính chính |
|---|---|---|---|
| F1 | **PARTIAL** | RF-04 code xong từ `56439458`; S12 1440 = 2.478 px khi đo 2026-09-27 (HiFi 2.273); chưa đo lại sau khung 272 (F3). Chờ Bobby VD-RF04-01. | — |
| F2 | **DONE** | S08 P04 vẽ `candle_overview` (`ExecuteCandleReplay.tsx`; `f2b/S08.md`: R-P04-018 744 bar / 47 bucket). Run cũ giữ `P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW`. | — |
| F3 | **OPEN** | Lane real-API chưa chạy lại: B1 ghi 50/54 (hai ô S00 chờ **BLOCKED_BY_CODEX(CG-S00-AV-01)**; hai ô stub P22 do FE dựng lại). Cần preview rebuild + chạy ~15 phút. | — |
| F5 | **PARTIAL** | Refusal browser-visible ở S02/S14 có unit/fixture (`researchPanel.refusal.test.tsx`, slice 2 `a1d7bf3f`, `f4/REFUSAL.md`); không có receipt real-browser; 502 trung thực chờ Codex. | — |
| F9 | **PARTIAL** | Token **đã đổi trong phạm vi Research**: `.research-screen { --ink-faint: #626d85 }` (`styles/tokens.css:654-662`, `fedfac44`); tương phản đo lại: 4.93:1 trên `#faf9f5`, 4.64:1 trên `#f4f2ec` (cũ `#939db0` = 2.59:1). Execution giữ nguyên. Chưa chạy axe sau đổi; baseline visual chưa duyệt. | **Có.** Sổ ghi "ngoại lệ axe duy nhất còn lại, đổi token là đụng baseline" → token đã đổi (scoped), chờ axe + Bobby duyệt baseline. |
| F12 | **PARTIAL** | Ladder S13: mũi tên cuối hàng đã bỏ (`CompareDetail.tsx:1088`, `compareDetail.f1.test.tsx:100,130`); hai lane S08 độ phân giải khác nhau vẫn đúng caption (trung thực); S09 in Letter/A4 chỉ có fixture lane PASS. | **Có.** "ladder S13 còn mũi tên `claim ↑ →` treo" → đã xử lý. |
| F13 | **OPEN** | Visual baseline chưa chạy lại (S08, S12, khung 272 ở S00/S02/S09–S13, màu `--ink-faint`, VD-F1-02/03); chỉ qua `./scripts/portal-web-visual.sh`; Bobby duyệt từng ô. | — |

## G

| Id | Trạng thái | Bằng chứng | Đính chính |
|---|---|---|---|
| G1 | **PARTIAL** | Đã dựng (D7). Còn thiếu receipt real-API. | **Có.** "chưa ai build" → đã build. |
| G2 | **DONE** | D4. | **Có.** "chưa ai build" → đã build. |
| G3 | **DONE** | 3 read đã trả `display_label` và FE nhớ (xem D1); record `evidence/FG/D1_O1_CLIENT_BINDING_2026-09-29.md`. | **Có.** "backend ≤P21 nhỏ, chưa trả" → đã trả. |
| G4 | **DONE** | Xem F12. | **Có.** |
| G5 | **PARTIAL** | In Letter/A4: fixture lane PASS (FG-04c); chưa chạy lại trên dữ liệu thật sau F1–F4. | — |
| G6 | **OPEN** | Xem F13. Có 8 ô lệch sẵn từ `c81e8dc2` (VD-FG-07-01). | — |
| G7 | **PARTIAL** | Harness đã viết lại (`ac0b3101`, `e2e/_probe-research-rf04-a11y.spec.ts` đợi root `[data-screen]` bằng locator có retry, đi qua 15 màn). Chưa chạy lần nào trên cây hiện tại → chưa có receipt axe. | **Có.** "lỗi harness, chưa sửa" → đã sửa, chưa chạy. |
| G8 | **DONE** | `SearchFoldStrip.tsx:2-8`, `searchFoldStrip.g8.test.tsx`. | **Có.** "chưa làm" → đã làm. |
| G9 | **DONE** | `AlphaImport.tsx:848,1497` (`data-registry-total`) + load-more theo `next_cursor` (`alphaImport.misc.test.tsx`, `f4/MISC.md` (b)). | **Có.** "chưa cần" → đã làm. |
| G10 | **OPEN** | Cần Bobby gật (phương án ở file trạng thái §4a). | — |
| G11 | **OPEN** | Phụ thuộc G10; không có việc FE. | — |
| G12 | **BLOCKED_BY_CODEX(OL-24)** | research-dev + receipt do Codex P23. | — |

## VD

| Id | Trạng thái | Bằng chứng |
|---|---|---|
| VD-RF04-01 | **OPEN** | S12 cao hơn HiFi (205 px đo 2026-09-27); Bobby chưa duyệt; chưa đo lại sau F3. |
| VD-RF04-02 | **OPEN** | Chờ Bobby duyệt. |
| VD-F1-01 | **DONE** | `alphaImportClient.ts:269` "Request refused — reload the page and try again."; `alphaImport.f1.test.tsx`. |
| VD-F1-02 | **DONE** | `LineageDetail.tsx:191-197`; `lineageDetail.f1.test.tsx`. |
| VD-F1-03 | **DONE** | `CompareDetail.tsx:51,1088`; `compareDetail.f1.test.tsx`. |
| VD-TEXT-01 | **PARTIAL** | F1b làm; còn: `codeAnatomy.ts` (S14 ~110 chữ), câu vắng dùng chung `researchRefusal.ts`/`splitClient.ts`/`replayClient.ts`. |
| VD-FG-01-01 | **DONE** | Bobby 2026-10-01: câu server chỉ ở `title` + tên truy cập, chip mã + request id trên màn (`researchRefusal.ts:240-275`, `ResearchPanel.tsx` `RefusalNote`, `researchPanel.refusal.test.tsx` 9 test; `f4/REFUSAL.md`). Còn `EvidenceFlow.tsx` ~2299 (S04 passport) và `AlphaImport.tsx` `<details>` chưa chuyển. Sổ ghi OPEN → đính chính. |
| VD-FG-07-01 | **OPEN** | 8 baseline visual: chỉ Bobby quyết re-record hay revert shell. |
| VD-FG-08-01…05 | **OPEN** | Wording S02 đã cài ở slice 2 (`a1d7bf3f`); chờ Bobby xác nhận câu chữ. |
| VD-FG-04-01 / -04 / -05 | **PARTIAL** | -01 connector ladder đã thay bằng VD-F1-03; -04/-05 (in một tờ hay nhiều trang) chờ Bobby. |
| VD-FG-05-02/-06/-07/-11 | **DONE** (FE) | Chip rc S01 + dòng outcome S11 (`ad404196`); P3 còn lại của -11 ghi trong slice 2. |
| VD-FG-01-17 | **OPEN** | Độ sâu crumb S10–S14: router shell, chờ Bobby. |
| VD-FG-01-18/-21/-26 | **OPEN** | Có điều kiện: **BLOCKED_BY_CODEX(CG-FG-S10-04, CG-FG-S11-03)** sau quyết định Bobby. |

## Đếm
50 dòng kiểm. Đính chính 17: E1, E2, E3, E4, E6, E7, E15 (xem dưới), F9, F12, G1, G2, G3, G4, G7, G8, G9, VD-FG-01-01.

Dòng E15 (Claude BE + consumer, đã kiểm phần S03): **DONE** cho consumer — `ArtifactsTable` + `denied_artifacts` (`RunProgress.tsx:1150,2377`) có từ `6c3dc67a`/`8df45ab6` (2026-09-24), tức trước E15; E15 không thêm code S03, nhưng cũng không thiếu gì ở FE ngoài request `CG-FG-S03-04` (manifest bảy dòng, holdout DENIED). Đính chính nhỏ: sổ ghi "S03 manifest + journal" như một sản phẩm của E15 → không đúng; đây là consumer sẵn có.

(Cách đếm: E-FE 7 + E15 1 + D 10 + F 7 + G 12 + VD 13 nhóm như bảng = 50.)

## Không kiểm trong gói này
E10–E14, E16, E17 (backend Claude) và mọi dòng Codex. VD-P19-*, VD-P20-* (ledger phase, không nằm ở §13.4.1) và 59 id `VD-FG-*` của `FG-owner-decisions.md` ngoài các id nêu ở trên. Không có ảnh chụp mới; không chạy test.
