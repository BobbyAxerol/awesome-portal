# P19 — Thanhvuong frontend receipt (Screen 10 Attempt Lineage)

**Trạng thái:** `P19-A S10 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · đã push lên primus-origin, chưa PR`.

- Backend P19 vẫn là `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK` ([P19 README](./README.md)): `CONTROL_API_FEATURE_RESEARCH_LINEAGE=false`, cần `RUN_LIBRARY`.
- Browser receipt chỉ dùng **API stub** dựng theo shape `lineage.contract.ts` / `lineage.service.ts`, vì chưa có fixture canonical (`CG-P19-01`).
- Receipt này chỉ ghi thay đổi frontend và evidence. Nó không đổi rule, contract hay phase gate, và **không** gọi P19 là `VERIFIED`.
- **Sau audit độc lập (2026-09-24):** code sửa A1–A3 ở `1fb29010` (tree `6b7e0419`), docs sửa A4–A6 trong commit docs sau audit. Chi tiết và số chạy lại ở [§12](#12-audit-p19-và-a-fix). Các số trước audit ở §5 được giữ làm lịch sử.
- **Vòng khớp hi-fi (Bobby 2026-09-24):** code R1 `c9dd195e` (tree `46d101c0`) khớp hi-fi 7 điểm, ledger `VD-P19-01…07`; receipt R2 trên cùng head ở [§13](#13-vòng-khớp-hi-fi-r1-c9dd195e-và-receipt-r2). **Spec ≠ hi-fi thì hi-fi thắng.** Các mô tả "chip cuộn", "thụt DFS", "6 nhóm state", "expand-all", "promotion rule viết lại" ở §4–§7 là bản trước R1, giữ làm lịch sử.

## 0. Packet và những gì đã đọc

**Packet P19 của Thanhvuong** (năm file cạnh file này):

| File | Nội dung |
|---|---|
| `thanhvuong-frontend-receipt.md` | Receipt này: đã đọc, git, file, route/link, mapping hi-fi, so hi-fi, evidence, discrepancy, Reuse report, kết luận, audit + A-fix (§12), vòng khớp hi-fi R1/R2 (§13) |
| [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md) | `CG-P19-01…14` theo template CLAUDE.md §5 (`11` WITHDRAWN sau audit, `13` thêm sau audit, `14` thêm ở R2), kèm locator/actual/expected/đề xuất/test/fallback; việc Bobby quyết B1–B6; kiểm lại ngày 2026-09-24 |
| [thanhvuong-test-results.json](./thanhvuong-test-results.json) | Evidence máy đọc được: tree SHA, từng gate (lệnh, exit, số đếm), `not_run`, SHA-256 ảnh/log (không commit) |
| [thanhvuong-debt-register.json](./thanhvuong-debt-register.json) | Nợ đã đóng (B1 ở `74f26200`; audit A1–A3 ở `1fb29010`; `VD-P19-01…07` ở `c9dd195e`); `open_debt` còn thật sau R2 (ngoại lệ spec-over-hi-fi, câu promotion rule vs mapping ACTIVE, lệch "khác"); deferred, request mở, downstream gate |
| [thanhvuong-rollback.md](./thanhvuong-rollback.md) | Revert từng commit, mới nhất trước |

Dòng trạng thái ở Unified §13 và implementation note dưới
[`#rl-p19`](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-p19) đều trỏ về packet này.

**Đã đọc (`READ`), theo CLAUDE.md §7.9.** Commit ghi trong bảng là commit cuối chạm file đó (`git log -1 --format=%h <ref> -- <file>`).
- Baseline `primus-origin/docs/research-loop-plan` lúc lập plan là `9060a7c4`.
- Lúc đóng packet (sau `git fetch`, 2026-09-24), baseline là `62d7d864` (1 commit: `feat(research): strengthen RF-03 source-backed preflight and progress`).
- Commit đó **không chạm** file lineage nào (contract, service, evidence P19), cũng không chạm file frontend S10 nào. Nó chỉ đổi `research-alpha-import.d.ts` và Unified (vùng RF-03).

| File | Nhánh (`74f26200`) | Baseline `9060a7c4` | `62d7d864` |
|---|---|---|---|
| `CLAUDE.md` (§3, §5, §7.9, §7.10, §8) | `19310912` | `8ca7bc11` | `8ca7bc11` |
| `upgrade/research_loop/CLAUDE-FOR-thanhvuong.md` | `30fb9f21` | `30fb9f21` | `30fb9f21` |
| `upgrade/research_loop/THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` | `30fb9f21` | `51b11247` | `51b11247` |
| `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` (§13, `#rl-p19`, note P18 làm mẫu) | `f37b3b75` | `9060a7c4` | `62d7d864` (chỉ thêm 2 đoạn RF-03/P08, không đổi `#rl-p19`) |
| `evidence/P19/frontend-handoff-claude.md` | `5e844a90` | `5e844a90` | `5e844a90` |
| `evidence/P19/README.md`, `evidence/P19/phase-report.md` | `5e844a90` | `5e844a90` | `5e844a90` |
| `evidence/P18/thanhvuong-*` (packet mẫu, 5 file) | `f37b3b75` | — (chưa có trên baseline) | — |
| `RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` §P19 (`P19-T01…T13`, `V11-P19-DR/BR/GX`) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `release-v1.1/docs/screens/10_attempt_lineage.md` (T01–T12, §3 data contract, §4 pitfalls, §9 CSS ledger, §11, §12 telemetry, §13 reviewer) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `release-v1.1/QuantBT 10 Attempt Lineage.dc.html`, mở trong browser ở 1280 và 660 | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `packages/contracts/openapi/research-attempt-lineage.openapi.json` + `generated/research-attempt-lineage.d.ts` | `5e844a90` | `5e844a90` | `5e844a90` |
| `apps/control-api/src/research/lineage.{contract,controller,error,repository,service}.ts` (chỉ đọc, để lấy key, reason code và thứ tự thật cho stub) | `5e844a90` | `5e844a90` | `5e844a90` |

Contract đã tiêu thụ: `research-attempt-lineage.openapi.json` `version 1.0.0`, SHA-256 `9bdfae71d1b850c6…`; `generated/research-attempt-lineage.d.ts` SHA-256 `c6e8b25f01f61b59…`.
- Chỉ có một operation, `researchAttemptLineageGetV1`.
- Không có ETag/304. Không có fixture lineage ở cả ba ref: `git ls-tree -r <ref> --name-only | grep -i "fixtures.*lineage"` exit 1 ở `HEAD`, `9060a7c4`, `62d7d864`.

### 0.1 Guide `P19-T01…T13` + `V11-P19-*` — frontend cover được gì

| ID | Nội dung Guide | Frontend hôm nay |
|---|---|---|
| T01 / T09 | Retry không tăng attempt count; draft/retry không phình total | **Có (hiển thị):** `technical_retry_count` in ở dạng "technical retries: N (not attempts)", không cộng vào counter hay counts (U15; browser G2: retries 4, attempts 16). Việc đếm là của backend |
| T02 / T03 | Seed/space mới → attempt mới; code đổi → AlphaVersion mới | Backend. Frontend in `intent_kind`, `space_signature`, band theo `alpha.versions[]`, và chip GATES RESET khi `kind=ALPHA_VERSION` / `gates_reset` (U04, U09) |
| T04 / T06 | Cycle, cross-workspace, concurrent | Backend (phase-report PASS). Frontend chỉ lồng node dưới parent **có trong tập trả về**; `OUTSIDE_RETURNED_GRAPH` → depth 0 kèm chip (U06, U07, U39) |
| T05 | Abandoned/failed vẫn còn | **Có:** ABANDONED opacity .72 + reason; FAILED + reason; không lọc bỏ (U12, U13; browser G2) |
| T07 / T11 | Không chọn theo Sharpe; pick vắng không bị thay | **Có:** pick chỉ từ `promotion_pick` PUBLISHED; NOT_PUBLISHED → PICK_ABSENT + reason; không sort/compare (U16, U17, U42 grep) |
| T08 | Toàn bộ test S10 | Một phần: xem §5.3 (spec T01–T12). T02/T04/T07/T08 theo nghĩa hi-fi không làm được vì contract thiếu field; T12 (axe) chưa chạy |
| T10 | Quan hệ audit/reproduction không suy từ thời gian/tên | **Có:** `child_runs[].relationship_kind` in nguyên văn; `child_runs_coverage=PARTIAL` → chip bounded (U14; browser G2 `AUDIT_OF_SELECTION`, `REPRODUCTION_OF_RUN`) |
| T12 | GATES RESET không gây mutation | **Có:** chip là `span`, không handler, không role; click → 0 request, selection/URL không đổi (U10; browser G7: request trước = sau, 0 POST/PUT/PATCH/DELETE cả phiên) |
| T13 | Exposure không mất; không leak | **Có (hiển thị):** exposure RECORDED → count/roles/latest; NOT_PUBLISHED → typed absence, không in 0 (U18; browser G3 `fakeZero=false`). 403/404 cùng câu trung tính, không in prose server (U31; browser G10 `leak=false`) |
| `V11-P19-DR` | Delta/dữ liệu | **PENDING**: lane này không có compute hay data thật |
| `V11-P19-BR` | Browser/visual/action | Một phần: `PRODUCT_ROUTE_BROWSER_RECEIPT` với API stub, trên preview riêng (không phải dev host) |
| `V11-P19-GX` | Protected hash, no-debt, report | Một phần: hook chạy tay, `git diff --check`, `open_debt` rỗng. Chưa có rebuild/deploy receipt |

`READ` khác `IMPLEMENTED` khác `VERIFIED` (A4.1).

## 1. Git: base, head, branch

| Mục | Giá trị |
|---|---|
| Branch | `feat/thanhvuong/research-p17-p21`; remote duy nhất là `primus-origin` |
| Base của P19 | `f37b3b757f55b5bd35f8d0623d6ea90188da5cba` (docs P18 sau vòng geometry hi-fi) |
| Commit code P19 | `3a11bfd32b25e885563c9b2bb84c3b313575b692` feat(research): S10 lineage client + hook<br>`0ec4b6afc9b5d6d1b74a13fc0a90d110e4c5c8e8` feat(research): S10 Attempt Lineage screen, route and links<br>`30dcbdfc8655d0a81f606fb9065ac87e14a44287` test(research): S10 unit lane S10-U01..S10-U42<br>`74f262005e9cf292294c5acc2b1a955d5731a9ab` fix(research): S10 stacks columns without horizontal overflow at 660 |
| Ghi chú lịch sử | Báo cáo gói A ghi commit 2–3 là `2e757c49` / `4dec3257`. Hai commit này được amend local **trước khi push**, thành `0ec4b6af` / `30dcbdfc`. Trailer của cả 4 commit nay đều là `Claude Fable 5.1`; numstat giống báo cáo gói A. Không merge, rebase hay force |
| Docs commit | `7b0dda84` docs(research): P19 S10 frontend packet, Unified row and note (packet 5 file + dòng §13 + implementation note `#rl-p19`) |
| Commit sửa sau audit | `1fb290102055b29d83eb0875f7b5cbcd51b4593b` fix(research): S10 keeps mono chips, layout on refusal and one badge for 403/404 (A1–A3; tree `6b7e041936995c307f24f04f999855f513edb821`) |
| Docs commit sau audit | docs(research): P19 packet after audit (5 file packet + note `#rl-p19`; A4–A6 và trạng thái A1–A3) |
| Tác giả | `Vuong <thanhvuong11052003@gmail.com>`, trailer `Co-Authored-By: Claude Fable 5.1` |
| Baseline | `docs/research-loop-plan`: `9060a7c4` lúc lập plan, `62d7d864` lúc đóng packet. **Chưa merge/rebase**; Bobby quyết cách tích hợp (§6, B1) |
| Push / PR | Push `f37b3b75..7b0dda84` lên `primus-origin` (pre-push chạy tay exit 0), không force; sau audit push `7b0dda84..<docs commit sau audit>` (gồm `1fb29010`), không force. Chưa có PR |

## 2. File đã sửa (`git diff --numstat f37b3b75 74f26200`)

| File | + | − | Mục đích |
|---|---:|---:|---|
| `src/research/lineageClient.ts` | 217 | 0 | Một operation đúng tên generated: `get(alphaId, {workspaceId, limit, signal})` qua `call<T>` / `PortalApiError`.<br>`toLineageRefusal`: 400 terminal, 401 denied, 403 denied, 404 empty; 403 và 404 dùng chung một câu trung tính F-04; 503 unavailable + retry.<br>`lineageState` suy từ `coverage` / `child_runs_coverage` / `source_absences` |
| `src/research/useLineage.ts` | 88 | 0 | Một lần đọc khi mount, `limit` = 128 (trần contract). Không poll, không refetch on focus, không ETag. Retry là một lần đọc mới |
| `src/research/LineageDetail.tsx` | 1460 | 0 | Màn S10 với 9 `data-panel` (`LINEAGE_PANELS`, dòng 74).<br>Tree DFS được ảo hoá khi > 40 node (`VIRTUAL_THRESHOLD`, dòng 89; hàng 34 px, detail 208 px).<br>GATES RESET là `span` trơ. `PROMOTION_RULE` viết lại theo contract (dòng 61).<br>CSS scoped; media 900 px `align-items: stretch` (dòng 217, sửa B1).<br>Diff của root ghi "diff vs parent — none, this attempt is a root" (dòng 455) |
| `src/research/LineageRoute.tsx` | 50 | 0 | Route, đọc `?av=` một lần, ghi `?attempt=` bằng `replace` |
| `src/research/lineageDetail.test.tsx` | 958 | 0 | 42 test `S10-U01…U42` |
| `src/research/RunLibrary.tsx` | 14 | 0 | Link "lineage →" ở header nhóm alpha. Chỉ hiện ở chế độ group-by-alpha (`RunGroup.alphaId` tuỳ chọn). Chỉ thêm, không đổi logic P12 |
| `src/research/AlphaImport.tsx` | 10 | 0 | Panel đăng ký S14: "lineage →" tới `registration.alpha_id` |
| `src/features/quantbt/QuantBTModule.tsx` | 5 | 1 | Mount `alphas/:alphaId/lineage` **trước** `alphas/:alphaId/:version`; thêm lineage vào regex `onReferenceRoute` (dòng 273) để caption module không bị lặp |
| `src/research/researchBoundary.test.ts` | 1 | 0 | Thêm `lineageClient.ts` vào allowlist network |
| `tsconfig.json` | 3 | 0 | Alias `@portal/contracts-research-attempt-lineage` |
| **Tổng** | **2806** | **1** | 10 file, tất cả thuộc `apps/portal/frontend/**`. Riêng `74f26200`: `LineageDetail.tsx` +2/−2 |

Sau audit, `git show --numstat 1fb29010` (A1–A3):

| File | + | − | Mục đích |
|---|---:|---:|---|
| `src/research/LineageDetail.tsx` | 101 | 2 | A1: reset `:where(.ln-page) button { font: inherit; }` (specificity 0); A2: `PendingFrame` + `Pending` giữ đủ 9 khối ở loading/refusal, nút filter disabled kèm `title` lý do |
| `src/research/lineageClient.ts` | 10 | 9 | A3: 404 → `denied` như 403 (cùng câu F-04) |
| `src/research/lineageDetail.test.tsx` | 52 | 5 | `expectPendingFrame` trong U01/U29–U32; U31 so badge 403 = 404; U33 bảng 404 → denied; U43 mới (guard reset specificity 0) |
| **Tổng** | **163** | **16** | 3 file |

Không đụng backend, `packages/contracts/**`, OpenAPI, fixture canonical, migration, `apps/portal/strategy/**`, control-plane, deploy, `package.json` hay lock file.

Không có DTO tự định nghĩa, không parse prose lỗi, không tính số. Số được in bằng `String(n)`: không `toFixed`, `Intl` hay `toLocaleString`, và không `sort(`. U42 kiểm các điều này bằng grep.

## 3. Route và link

| Hướng | Từ → tới | Điều kiện |
|---|---|---|
| Canonical | `/research/quantbt/alphas/{alphaId}/lineage[?av=&attempt=]` | `?av=` đọc lúc mount (mở band, cuộn bằng `scrollTop` của container, không dùng `scrollIntoView`); `?attempt=` ghi bằng `history.replace` |
| Vào | Run Library header nhóm alpha → S10 | Chỉ khi group-by-alpha (`?group=1`), N3 |
| Vào | Alpha Import (S14), panel đăng ký → S10 | Khi có `registration.alpha_id` (U41: router link trong router, anchor same-origin ngoài router) |
| Vào (chưa nối) | `features/imports/AlphaVersionDetail.tsx` | Feature imports legacy, namespace khác (`api.alphaVersion`); không nối |
| Ra | breadcrumb "Runs" / "runs →" | `/research/quantbt/runs?group=1&alpha={alphaId}` |
| Ra | "new run →" / "declare at New Run →" | `/research/quantbt/runs/new` |
| Ra | "import new version →" (chỉ band ACTIVE) | `/research/quantbt/alpha-import` |
| Ra | "open evidence →" / "run report" / run link trên node | `/research/quantbt/runs/{primary_run.run_id}/evidence` và `/report`; chỉ khi có `run_id` (U23) |
| Ra (refused) | "rc & publish" | `span` có `title` "Screen 11 Release Candidate & Publish has no published route yet." |

## 4. Mapping hi-fi → component / `data-panel` → field contract → state / absence → assertion

Viewport 1280 và 660. "Unit" là vitest `S10-Uxx`; "Browser" là probe gate `Gx` trên product route (§5.2). Dòng RECEIPT nào cũng `noise=0 mutations=0`, và sau `74f26200` thì `overflow=0` ở mọi state.

| Phần tử hi-fi | Component / `data-panel` | Field contract | Typed state / absence | Unit | Browser |
|---|---|---|---|---|---|
| Breadcrumb + title + subtitle | `header` | `alpha.alpha_id`, `counts.total_attempts`, `counts.returned_attempts`, `read_authority`, `as_of_utc_ms` | Mọi state. Loading/refusal: đủ khung `header · notice · root · filters · tree · selected · diff · promotion-rule · rules · counts`, mỗi khối "loading"/withheld, không số nào (A2, `1fb29010`; trước đó chỉ còn header · notice · rules) | U01, U02, U29–U32 | G1 loading: `digits_in_screen=0`; A-fix FIX-A2: 10 `data-panel`, `pending=6`, `digits=[]` ở loading và 400/401/403/404/503, 1280 + 660 |
| Root card: alpha name/id + links runs/new run/rc & publish | `root` | `alpha.name`, `alpha.alpha_id`, `active_version_state` / `active_version_availability` | `P19_ALPHA_HAS_NO_ACTIVE_VERSION` → absence | U02, U26 | G11 href đúng; rc là SPAN |
| Version band (`av · state` + digest + entry + outcome) | `root` `[data-band]` | `alpha.versions[]`: `label`, `lifecycle_state`, `code_digest` (rút gọn, bản đầy đủ ở `title`), `entrypoint`, `registered_at_utc_ms` | Outcome không có field → NOT_IN_CONTRACT | U04, U27 | G2 bands `SUPERSEDED, ACTIVE` (thứ tự server) |
| Hàng attempt chips | `[data-band-chips]` button `aria-label="attempt {id} — {state}"` | `attempts[]` lọc theo `alpha_version_id`, thứ tự server | Chip ẩn bởi filter → chọn chip sẽ nới filter (U21). Chip mono 8.5px (sau A1; trước `1fb29010` là 12px Inter) | U05, U21, U37, U43 | G2/v2: chip cuộn **trong band** (660: sw 2523 > cw 462, `docScrollX=0`); G9 Tab → Enter chọn, focus giữ |
| Hàng exercised / untried | `root` | — | NOT_IN_CONTRACT; untried vẫn giữ link "declare at New Run →" | U27 | G2 |
| PROMOTION PICK banner | `root` (mỗi band) | `alpha.versions[].promotion_pick`: attempt, run, `source_contract_rev`, `source_digest`, `source_as_of` | PUBLISHED; NOT_PUBLISHED → PICK_ABSENT + `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK` | U16, U17 | G2 2× PUBLISHED; G3 2× NOT_PUBLISHED + reason |
| Filter row + counter + toggle probes | `filters` | `attempts[].state` (6 nhóm hiển thị: draft / in-flight / ready / failed / abandoned / cancelled), `counts.returned_attempts`, `counts.total_attempts` | Counter luôn "showing {n} of {returned} attempts · {total} total"; nhóm rỗng có câu riêng. Toggle probes → expand-all (không có storied/probe). Filter chip / toggle mono 9.5px (A1). Loading/refusal: chip disabled + `title` lý do, counter "withheld" | U20, U43 | G6 mọi chip đơn và tổ hợp: counter = số row DOM = kỳ vọng |
| Cây attempt (card storied / probe row) | `tree` | `attempt_id`, `state`, `intent_kind`, `alpha_version_label`, `created_at_utc_ms`, `primary_run.effective_spec_digest`, `primary_run.run_id`, `parent_attempt_id`, `parent_state` | DFS chỉ lồng dưới parent có trong tập trả về; `OUTSIDE_RETURNED_GRAPH` → chip | U06, U07, U39 | G2 depth 0–3, 16 node; G3 chip parent outside |
| Diff chips (`k: from → to`) | `tree` detail `DiffChips` | `semantic_diff.changes[path, kind, before, after]`, `semantic_diff.state` | ROOT → "diff vs parent — none, this attempt is a root"; NOT_PUBLISHED / PARENT_OUTSIDE → reason; null → "not set" | U08, U11 | G3 `P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE_FOR_PARENT_DIFF`, `P19_PARENT_OUTSIDE_BOUNDED_GRAPH`; v2 root detail 1 dòng "root — no parent" |
| Chip đỏ GATES RESET | `[data-gates=true]` span | `kind=ALPHA_VERSION` / `semantic_diff.gates_reset` | Chỉ disclosure; không handler | U09, U10, U11 | G7 click ở tree và diff panel: request trước = sau, selection/URL giữ |
| ABANDONED card | `tree` `.ln-node[data-group="abandoned"]` | `state`, `reason` | opacity .72; null → "abandoned — reason not published" | U12, U13 | G2 opacity `0.72` + reason |
| Metrics mini (cert · OOS · decay) | `selected` | — | NOT_IN_CONTRACT | U27 | G2 |
| Child runs | `tree` detail | `child_runs[].relationship_kind/run_kind/run_id/state`, `child_runs_coverage` | PARTIAL → "+ more child runs not returned (P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT)" | U14 | G2/G3 |
| Technical retries | `tree` detail, `selected` | `primary_run.technical_retry_count` | Phụ, "(not attempts)" | U15 | G2 retries 4 ≠ attempts 16 |
| Exposure | `tree` detail, `selected` | `exposure.state/count/roles/latest` | NOT_PUBLISHED → `P19_NO_EXPOSURE_FACT_PUBLISHED_FOR_ATTEMPT`, không in count | U18 | G3 `fakeZero=false` |
| "selected attempt — att_NN" | `selected` | parent, intent, version, `primary_run.{run_id,state,engine_release_id,effective_spec_digest,dataset_binding_digest}`, `space_signature`, created/updated | Draft không có run → không có link evidence, ghi rõ run facts vắng | U22, U23 | G11 evidence/report href |
| "diff vs parent — config keys only" | `diff` | `semantic_diff` (gates row đứng đầu) | ROOT / NOT_PUBLISHED / PARENT_OUTSIDE notes | U22 | G7 |
| Promotion rule | `promotion-rule` | — | Viết lại theo contract (D12) | U26 | — |
| Rules footer | `rules` | — (text theo **spec §2.5** verbatim; hi-fi có câu khác, xem §5.4) | Mọi state | U26 | Còn ở mọi refusal |
| (không có trong hi-fi) Counts strip | `counts` | 8 số `counts.*`, `coverage.state/reason_code/oldest_returned_created_at_utc_ms`, `as_of` | PARTIAL + `P19_BOUNDED_GRAPH_LIMIT_REACHED` | U19, U26 | G2 strip 16/16/1/15/4/1/2/4; G3 "4 of 140" |
| Deep link `?av=` / `?attempt=` | `LineageRoute` | — | — | U24, U25, U36 | G8: band ở đầu scroller (8 px), reload giống hệt, back/forward giữ `?attempt=` |
| Virtual 100 attempt | `tree[data-virtual=true]` | — | > 40 node | U34–U38 | G5 120 attempt: DOM 23 → 30 sau cuộn, chip sâu (depth 38) chọn + cuộn tới, focus giữ, expand-all không chồng hàng |
| Screen state / refusal | `notice`, `ResearchPanel` | HTTP status + `error.code` `RESEARCH_LINEAGE_*` | loading, available, partial, empty, denied, unavailable, terminal | U29–U33, U40 | G10 400 terminal / 401 denied / 403 denied / 404 **denied** (A3, `1fb29010`; trước đó empty) / 503 unavailable + retry; `leak=false`; có request id; FIX-A3 badge 403 = 404 "⊘ DENIED" |

## 5. Evidence

### 5.1 Test lanes (`apps/portal/frontend`, Node v20.20.2)

| Lane | Lệnh | Exit | Kết quả |
|---|---|---:|---|
| **Typecheck (head `74f26200`)** | `npx tsc -b --noEmit` | 0 | PASS (`c-tsc.log` `bcb1a61798abda8d`) |
| **Build (head `74f26200`)** | `npm run build` | 0 | PASS, chỉ có cảnh báo chunk cũ (`c-build.log` `021b3474db7e908e`) |
| **Unit toàn bộ (head `74f26200`)** | `npx vitest run` | 0 | **171 file · 3057 pass · 1 skip** (3058), 78.8 s, pass ngay lần đầu, không flake (`c-vitest-full.log` `83143952a88afb60`) |
| **Unit S10 + boundary (head `74f26200`)** | `npx vitest run src/research/lineageDetail.test.tsx src/research/researchBoundary.test.ts` | 0 | **56/56** = S10 42 (`S10-U01…U42`) + boundary 14 (`c-vitest-s10.log` `75843967beed8882`) |
| Unit toàn bộ (gói A, `4dec3257` = `30dcbdfc` trước amend) | `npx vitest run` | 0 | 171 file · 3057 pass · 1 skip. Trước commit 2 có một lần pre-commit fail do flake `tradeReplayEvents.test.tsx` (pass khi chạy riêng và ở lần full cuối) |
| **Browser vòng 1 (tree `30dcbdfc`)** | `RESEARCH_SHOT_DIR=~/tv-shots/p19/all npx playwright test -c .tv-probe.config.ts --workers=1` | 1 | **107/117** (fixtures 8/8, product 74/74, tvp19 25/35). Cả 10 fail đều là overflow / chip-scroll @660 do B1. 1280 + dark: mọi gate G1–G13 PASS (`full-suite.log` `29bcfdacf8d47274`) |
| **Browser vòng 2 (tree `74f26200`)** | `RESEARCH_SHOT_DIR=~/tv-shots/p19/v2 V2_SHOT_DIR=~/tv-shots/p19 npx playwright test -c .tv-probe.config.ts --workers=1` | 0 | **119/119** (fixtures 8, product 74, tvp19 37 = 36 + v2 receipt), 2.7 phút. Mọi RECEIPT @660 `overflow=0 noise=0 mutations=0` (`probe2.log` `5a2ec13c49955e3b`, `v2/probe.log` `a39e96e0d0cb9e74`). Lượt đầu 118/119: probe v2 bấm expand-all làm đóng detail đã mở; đã sửa probe, không sửa src (`probe2-run1.log` `0a4c04744f7e4560`) |

Môi trường: Playwright 1.62.1, Chromium headless. Preview là `vite preview` riêng của workspace ở `127.0.0.1:4417`, dựng từ build trên, đã kill đúng các PID (kể cả tiến trình node con); `ss -ltnp | grep 4417` rỗng.
- Không đụng preview 4317–4320 của Bobby.
- Spec probe tạm và config tạm **không commit, đã xoá** trên server. Bản sao nằm ở scratchpad của phiên: vòng 1 `88055a1beaf0bfdf`, vòng 2 `9baaf8285db74f02`.

### 5.2 Browser receipt — `PRODUCT_ROUTE_BROWSER_RECEIPT` (API stub)

Route `/research/quantbt/alphas/alpha_momentum_btc/lineage`. Stub `page.route("**/api/v1/research/alphas/*/lineage*")` cộng với `stubPortalApi(page,"healthy")`.
- Body dựng theo `research-attempt-lineage.d.ts`.
- `counts`, `source_absences` và `coverage` suy theo đúng logic `lineage.service.ts` / `lineage.repository.ts` (submitted = state ≠ DRAFT; PARTIAL ⇔ `hasMore`).
- Dark: `data-theme="operations"`.

| Gate | Vòng 1 (`30dcbdfc`) | Vòng 2 (`74f26200`) |
|---|---|---|
| G1 loading | 1280 pass; 660 phần loading pass, sau khi resolve thì overflow (B1) | pass, overflow 0 |
| G2 full COMPLETE + dark | 1280 pass (light + dark): 9 panel đúng thứ tự, 16 attempt, depth 0–3, strip đúng, GATES là span, opacity .72. 660 fail: overflow 2 029 px, chip không cuộn trong band | pass; 660 chip sw 2523 > cw 462, scrollLeft 2061, `docScrollX=0`; dark 660 scrollLeft 2029 |
| G3 partial | 1280 pass; 660 overflow 87 px | pass (581 > 462, scrollLeft 119) |
| G4 empty | pass cả hai width | pass |
| G5 virtual 120 | 1280 pass; 660 ảo hoá pass, overflow 7 665 px | pass (chip 8159/7965/7192 > 462) |
| G6 filter × counter | 1280 pass; 660 filter pass, overflow | pass |
| G7 GATES RESET 0 request | pass về request; 660 overflow | pass |
| G8 deep link `?av=` + reload + back/forward | pass về hành vi; 660 overflow | pass |
| G9 keyboard | pass về phím; ring `solid 2px`, `:focus-visible`; 660 overflow | pass |
| G10 refusal 400/401/403/404/503 | pass cả 10 | pass |
| G11 link Run Library → S10 → evidence/report | pass về href; 660 overflow | pass |
| G12 overflow / console | 1280 overflow 0; 660 chỉ 0 ở empty và refusal; console S10 0 | overflow 0 mọi state; console S10 0; mutation 0 |
| G13 hi-fi | chụp + đo (§5.4) | chụp lại |
| Root detail copy (N1) | "root — no parent" in hai lần liền nhau | 1 lần; dòng diff "diff vs parent — none, this attempt is a root" |

Console: S10 có 0 error/warning. Các dòng được tách thành expected/foreign:
- Mỗi test refusal có 1 dòng `Failed to load resource … status of N` (expected).
- Test links có 1 dòng 404 của fixture evidence (`run_att_…/evidence` không có trong `stubPortalApi`), thuộc phase evidence (foreign).

Screenshot và log **không commit** (A4.1). Chúng nằm ở `~/tv-shots/p19/`, `~/tv-shots/p19/all/` (vòng 1) và `~/tv-shots/p19/v2/` (vòng 2). SHA-256 16 hex đầu:

| File | SHA-256 | File | SHA-256 |
|---|---|---|---|
| `p19-v2-full-1280.png` | `37ccd68beeeb0e0b` | `p19-v2-full-660.png` | `a60b51156e361091` |
| `p19-v2-partial-660.png` | `75bdfe8acdb5de5c` | `p19-v2-virtual-120-660.png` | `1172fa82f848af0b` |
| `p19-v2-root-detail-1280.png` | `d68e7a0f8f77c01b` | `p19-v2-root-detail-660.png` | `720ec1c6c4b9803b` |
| `v2/p19-full-dark-1280.png` | `6f365a9e72ccbc3c` | `v2/p19-full-dark-660.png` | `2caf4a857bb049f7` |
| `v2/p19-virtual-120-1280.png` | `ec086952be963023` | `v2/p19-partial-1280.png` | `03ba11caba54e0b8` |
| `v2/p19-empty-1280.png` | `a406532c2715a5c5` | `v2/p19-empty-660.png` | `5d01349de900b316` |
| `p19-full-660.png` (vòng 1, evidence B1) | `79d352d49adcd900` | `p19-fix-hypothesis-full-660.png` | `ba7e3be9780e0878` |
| `p19-hifi-10-1280.png` | `1d0d841b5185c58b` | `p19-hifi-10-660.png` | `7556ab819fd35aca` |
| `p19-compare-1280.png` (vòng 1) | `0d5132730795ad8e` | `p19-compare-660.png` (vòng 1) | `2baac764f3b8b696` |
| `v2/p19-compare-1280.png` | `8a527bb2d9c6e5d4` | `v2/p19-compare-660.png` | `6d9b041f16c2f79d` |

Danh sách đầy đủ (vòng 1 + vòng 2, hơn 200 dòng) nằm ở [thanhvuong-test-results.json](./thanhvuong-test-results.json) `evidence_store`.

### 5.3 Spec 10 test matrix (T01–T12)

| Spec | Nội dung | Trạng thái |
|---|---|---|
| T01 | 2 band (ACTIVE trước), 6 storied, probe ẩn, "showing 6 of 52" | **Một phần:** band và counter có (G2, U04, U20), nhưng band theo thứ tự server (`registered_at ASC`) chứ không đưa ACTIVE lên trước. Contract không có storied/probe (D1, D11) |
| T02 | toggle probes | **Không làm được theo hi-fi:** không có phân loại probe; thay bằng expand-all (D13, `VISUAL_DECISION_REQUIRED`) |
| T03 | filter ABANDONED | **Có** (G6, U20) |
| T04 | click chip probe đang ẩn → bật toggle + expand | **Tương đương:** chip của node bị filter ẩn sẽ nới filter và mở node (U21, U37) |
| T05 | diff av → chip đỏ GATES RESET | **Có** (U09, G7) |
| T06 | promotion pick banner + link 11 | **Một phần:** banner mỗi band theo `promotion_pick`; link 11 refused vì Screen 11 chưa có route |
| T07 | rc chip | **Không có field** (`CG-P19-04`) |
| T08 | exercised/untried, untried → 02 | **Một phần:** NOT_IN_CONTRACT; link "declare at New Run →" vẫn có (`CG-P19-06`) |
| T09 | `?av=` bằng `scrollTop` | **Có** (G8, U24, U36; U42 grep `scrollIntoView` = 0) |
| T10 | 100 attempt ảo hoá, chip band cuộn mượt | **Có** với 120 attempt (G5, U34–U38) |
| T11 | 660 không tràn | **Có** sau `74f26200` (vòng 2 overflow 0) |
| T12 | axe | **Chưa chạy:** axe-core không có trong lock. Có kiểm `aria-label` của chip (U05) |

### 5.4 So hi-fi với product (1280 / 660)

Evidence: hi-fi `p19-hifi-10-1280.png` / `-660.png`, ghép cạnh product ở `p19-compare-*.png`. Vì server không có ImageMagick/PIL, ảnh ghép được dựng bằng chính Chromium. `support.js` có trong repo, nên hi-fi render đủ.

| Khối | Hi-fi | Product | Phân loại |
|---|---|---|---|
| Khung 2 cột @1280 | trái 581 / phải 387 px, sticky | trái 571 / phải 381 px, sticky | **Khớp** (lệch ≤ 10 px do padding của shell) |
| @660 | vẫn 2 cột: cột trái bị bóp còn 8 px, overflow 13 (hi-fi không responsive) | 1 cột, panel phải xuống dưới; overflow 0 sau `74f26200` | Hi-fi không có chuẩn cho 660; product xếp chồng |
| Header | Title "Attempt lineage" + subtitle "Immutable nodes · every config change is a sibling attempt with its own hash." (câu "52 attempts, 6 worth telling…" là của **spec §2.1**, không phải hi-fi; receipt bản trước ghi nhầm, sửa theo audit A4) | Title theo spec §2.1; subtitle theo khung spec §2.1 nhưng số đếm từ `counts`, không bịa "6 worth telling" | spec ≠ hi-fi, chọn spec + field-driven (bảng dưới) |
| Band | outcome, "+24 probes", exercised, chip **wrap** | label/lifecycle/digest/entrypoint/registered; chip **nowrap, cuộn ngang trong band** | outcome/probes/exercised: field-driven; wrap → cuộn: `VISUAL_DECISION_REQUIRED` (D14, theo spec pitfall 6) |
| Promotion pick | 1 banner cuối root card, rc + "gate R1 next" | 1 banner **mỗi band** (pick theo version) | field-driven (`CG-P19-04`, `CG-P19-10`) |
| Filter row | 4 state + "show 46 probe attempts" + "showing 6 of 52" | 6 nhóm state contract + expand-all + "showing n of m attempts · total" | field-driven + `VISUAL_DECISION_REQUIRED` |
| Node | rail dọc có chấm; id · run · cert · av · rc · cfg; spec/diff/note | thụt DFS có gạch nối; id/state/intent/av/created/spec digest/run link/GATES | cert/rc/note/spec text: field-driven; rail vs thụt: `VISUAL_DECISION_REQUIRED` (D15) |
| Selected | mode×schedule / claim / OOS / cert + verdict | rows theo field contract; cert · OOS · decay = NOT_IN_CONTRACT | field-driven |
| Diff | k / a→b + note | k / a→b; gates row đứng đầu; null → "not set" | **Khớp bố cục** |
| Promotion rule | "Only the ACTIVE attempt promotes…" | Câu viết lại theo contract | quyết định nội dung (D12) |
| Rules + counts | Rules footer với câu riêng của hi-fi (bảng dưới) | Rules **verbatim theo spec §2.5** (không verbatim theo hi-fi) + counts strip 8 số | spec ≠ hi-fi, chọn spec |

**Copy: hi-fi ≠ spec (audit A4).** Text hi-fi đo từ DOM của `QuantBT 10 Attempt Lineage.dc.html` ở 1280 (probe audit `AUDIT-HIFI`). Product chọn spec 10 vì spec là tài liệu chuẩn của màn (hi-fi là ảnh minh hoạ với data giả), trừ khi spec mâu thuẫn contract P19.

| Chỗ | Hi-fi (DOM) | Spec 10 | Product chọn | Lý do |
|---|---|---|---|---|
| Title | "Attempt lineage" | §2.1 "Attempt Lineage — the idea's honest history" | Spec (`LINEAGE_TITLE`) | Spec là chuẩn copy |
| Subtitle | "Immutable nodes · every config change is a sibling attempt with its own hash." | §2.1 "52 attempts, 6 worth telling, one promotable. Every dead end stays on the record — the count itself is a multiple-testing disclosure." | Khung spec, số thật: "{total} attempts on record, {returned} returned here. Every dead end stays on the record — …" | "6 worth telling / one promotable" cần phân loại storied và pick mà contract không có (`CG-P19-03`, `CG-P19-10`); không bịa số |
| Breadcrumb | "Attempt Lineage — mom_breakout_v3 · BTCUSDT · 4h" | §2.1 "Alphas / alpha_momentum_btc / Lineage" | "Runs / Attempt Lineage — {alpha.name}" | Không có route Alphas; lối vào thật là Run Library |
| Rules footer | "Attempts are immutable — every change is a new node with parent_attempt. Engine truth (attempts.json), never reconstructed. Abandoning is a state, not an erasure." | §2.5 "Attempts are immutable and append-only; abandoning is a state, not a deletion. A code change is never an attempt — it is a new alpha_version, and both gates run again. The attempt count travels with any promotion as its multiple-testing context." | Spec §2.5 verbatim (`LINEAGE_RULES`, U26) | Spec chuẩn; câu "attempts.json" của hi-fi không đúng nguồn P19 (persisted lineage) |
| Promotion rule | "Only the ACTIVE attempt promotes. The full attempt count — probes included — is disclosed to the approver: multiple-testing information, not shame." | Không có câu riêng (§2.2 chỉ mô tả banner) | Viết lại (`PROMOTION_RULE`): pick chỉ từ fact source-attested; giữ ý câu thứ hai | Câu 1 của hi-fi suy pick từ state ACTIVE, contract/handoff cấm (D12) |
| Pick line | "att_03 · R-WFO-118 · prm_7c1a9e → rc_ (draft) · gate R1 next" | §2.2 "att_04 · R-WFO-118 is the single promotable attempt of this version — cert B · claim strict · rc_ draft composed. → open Release Candidate" | "PROMOTION PICK" + attempt · run · source rev · digest · as-of khi PUBLISHED; `PICK_ABSENT` + reason khi NOT_PUBLISHED | rc/cert/claim không có field (`CG-P19-04`, `CG-P19-05`); Screen 11 chưa có route |

## 6. Việc Bobby quyết

Chi tiết và đề xuất: [thanhvuong-backend-requests.md §3](./thanhvuong-backend-requests.md#3-việc-bobby-quyết-không-phải-backend).

- **B1** — Tích hợp baseline `9060a7c4` → `62d7d864`.
  - File S10 không trùng với baseline.
  - `62d7d864` đổi `research-alpha-import.d.ts` (thêm field required `check`/`note`/`expires_at_utc_ms`). Việc này ảnh hưởng AlphaImport khi tích hợp, không ảnh hưởng S10.
  - Xung đột `FreezeDetail.tsx` của P17 vẫn còn.
- **B2** — `VISUAL_DECISION_REQUIRED`: storied/probe (toggle → expand-all), rc/cert/OOS/decay, chip cuộn vs wrap, rail chấm vs thụt DFS, thứ tự band theo server vs ACTIVE-first.
- **B3** — ~~F-04: badge 403 ≠ 404~~ **Đã xử lý ở frontend** (audit A3, `1fb29010`): handoff dòng 29 đã trả lời chính sách, nên 403 và 404 cùng state `denied`, cùng badge "⊘ DENIED", cùng câu F-04. Còn lại cho Bobby: S09 vẫn dùng 404 → `empty` (D19), có muốn đồng bộ S09 không.
- **B4** — Cách chạy axe (không có trong lock).
- **B5** — Poll legacy `GET /api/runs` 4 s của `QuantBTModule` (dòng 231) chạy trên mọi route, kể cả S10. Có mở `fix/*` riêng không?
- **B6** — Flake `PortalShell.test.tsx` / `tradeReplayEvents.test.tsx` ngoài diff.

## 7. Discrepancy và lỗi tìm ra trong phase

| # | Mục | Hi-fi / spec | Contract | Đang làm | Loại |
|---|---|---|---|---|---|
| D0 | Astra checkpoint "do not enter P18 yet" (Unified `#rl-p13-p17-audit`) chưa gỡ, trong khi board §13 là `S10_BROWSER_HIFI_PENDING_CLAUDE` và handoff giao Claude | — | — | Xử lý như P17/P18: làm consumer trên contract đã publish, **không claim `VERIFIED`** | Bobby quyết |
| D1 | storied / probe | spec §3 `kind` do server phân loại; hi-fi 6 card + 46 row theo tuần, J metric | Không có | Mọi attempt là node cùng loại | `CG-P19-03`, `VISUAL_DECISION_REQUIRED` |
| D2 | rc chip, "gate R1 next" | có | Không có | Không vẽ | `CG-P19-04` |
| D3 | cert / OOS / decay | có | Không có | NOT_IN_CONTRACT | `CG-P19-05` |
| D4 | exercised / untried | có | Không có | NOT_IN_CONTRACT; giữ link untried | `CG-P19-06` |
| D5 | Outcome / "why superseded" | có | Có `reason` cho ABANDONED/FAILED; không có outcome | NOT_IN_CONTRACT | `CG-P19-07` |
| D6 | Spec line (mode × schedule, space) / cfg label | có | Chỉ có `effective_spec_digest`, `space_signature` | In digest rút gọn | `CG-P19-08` |
| D7 | ETag / 304 | — | Không khai | Không gửi `If-None-Match`, không giữ bản cache; SPA quay lại là GET mới | `CG-P19-02` |
| D8 | > 128 attempt | spec fixture 52 | `ORDER BY created_at ASC LIMIT 129`, không có cursor | In PARTIAL + "{returned} of {total}"; không gọi thêm. Hệ quả: history dài chỉ thấy **phần cũ nhất**, attempt mới nhất bị cắt | `CG-P19-09` |
| D9 | Fixture canonical | spec §10 52 attempt | Không có | Stub theo shape service | `CG-P19-01` |
| D10 | Filter | 4 state (ACTIVE/SUPERSEDED/ABANDONED/DRAFT) | `AttemptNode.state` là lifecycle attempt khác | 6 nhóm; `data-state` giữ enum thật | field-driven |
| D11 | Thứ tự band | T01: ACTIVE trước | `ORDER BY registered_at ASC` | Giữ thứ tự server (không sort, U42) | `VISUAL_DECISION_REQUIRED` |
| D12 | Promotion rule | "Only the ACTIVE attempt promotes" | Pick là fact source-attested theo version; handoff cấm suy từ ACTIVE | Viết lại (`PROMOTION_RULE`, dòng 61), giữ câu thứ hai | mâu thuẫn hi-fi ↔ contract |
| D13 | Toggle probes | có | Không có probe | Expand-all | `VISUAL_DECISION_REQUIRED` |
| D14 | Chip | hi-fi wrap | — | Cuộn ngang trong band (spec pitfall 6, plan §1.4) | hi-fi ≠ spec |
| D15 | Rail chấm | có | — | Thụt DFS có gạch nối (spec pitfall 1 "cây thụt cấp") | có thể làm theo hi-fi |
| D16 | 404 | handoff: không gợi ý tồn tại | 404 cả khi không phải member workspace | Trước audit: 404 → `empty` theo tiền lệ S09, badge khác 403. **Từ `1fb29010`: 404 → `denied`**, cùng badge và câu với 403 (A3) | đã sửa |
| D19 | Tiền lệ S09 | — | — | `reportClient.ts` (S09) vẫn map 404 → `empty` với câu riêng. S10 cố ý khác S09 để giữ F-04; không sửa S09 trong P19 | Bobby quyết (B3) |
| D17 | Telemetry §12 | 5 event | — | Chưa có | `not_run` |
| D18 | Promotion pick DR-03 | spec T06 banner | Source hôm nay không publish pick (`NOT_PUBLISHED`) | Nhánh PUBLISHED chỉ thử bằng stub | `CG-P19-10` |

Lỗi tìm ra và đã sửa trong phase:

| Mục | Tìm ra ở | Xử lý |
|---|---|---|
| **B1**: ở ≤ 900 px, cột trái giãn theo max-content. Trang tràn 2 029 px (full), 7 665 (120 attempt), 87 (partial); chip hết cuộn trong band | Gói B, `p19-full-660.png` `79d352d49adcd900`; jsdom không bắt được | **Sửa ở `74f26200`**: `.ln-grid { flex-direction: column; align-items: stretch; }` trong media 900 px (dòng 217). Vòng 2: overflow 0 mọi state, chip cuộn trong band |
| **N1**: detail của root in "root — no parent" hai lần | Gói B | **Sửa ở `74f26200`**: dòng diff ROOT → "diff vs parent — none, this attempt is a root" (dòng 455) |
| `tokens.test.ts` bắt `color-mix()` + hex trong comment | Pre-commit gói A | Sửa trước commit 2: `var(--accent-2-soft)` + prose |

Ghi chú nhỏ (không phải lỗi S10):
- **N2** — `QuantBTModule` poll `GET /api/runs` mỗi 4 s trên mọi route (legacy). S10 "1 read" chỉ đúng cho request lineage (B5).
- **N3** — Link "lineage →" của Run Library chỉ hiện khi group-by-alpha. Link quay lại từ S10 có mang `?group=1`.
- **N5** — Fixture partial có returned 4 < limit 128. Server thật chỉ báo PARTIAL khi đã trả đủ 128. Đây là giới hạn của stub, UI tương đương.
- **N6** — Tree không ảo hoá nằm trong `.ln-scroll max-height:72vh`, nên ảnh full-page chỉ thấy phần đầu tree. Đúng thiết kế.
- Không cache vì không có ETag (D7).

## 8. Scale refine (CLAUDE.md §8)

| Ô | S10 |
|---|---|
| **Cardinality** | Contract: attempt ≤ 128/request, child run ≤ 32/attempt, số version không giới hạn trong DTO. Probe dùng 16 (full) và 120 (virtual, chuỗi sâu 39) |
| **Break point** | Tree > 40 node → windowing (hàng 34 px, detail 208 px, overscan 6, viewport 560 px). Band chips: 120 chip trong 1 band vẫn cuộn trong band ở 660 (sw 8159) |
| **Degradation** | > 128 → PARTIAL + "{returned} of {total}", không gọi thêm (không có cursor). Child > 32 → chip bounded |
| **Server contract** | Đã có: `limit` 1–128, `coverage`, `child_runs_coverage`, `counts`. Cần: cursor/thứ tự newest-first (`CG-P19-09`), fixture (`CG-P19-01`) |
| **Invariant** | Không sort/compare; số in bằng `String(n)`; NOT_PUBLISHED không thành 0; GATES RESET không có handler |
| **Perf budget** | 1 GET lineage mỗi lần vào; load ≈ 0.76–0.99 s (preview local); click chip sâu → chọn 83–96 ms; DOM 23–30 node ở 120 attempt |

## 9. Request cho Codex

Receipt đầy đủ theo template CLAUDE.md §5: [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md). Tóm tắt:

| ID | Nội dung |
|---|---|
| `CG-P19-01` | fixture canonical |
| `02` | ETag/304 |
| `03` | storied/probe |
| `04` | release-candidate ref |
| `05` | cert/OOS/decay |
| `06` | exercised/untried |
| `07` | outcome / why superseded |
| `08` | spec line / config label |
| `09` | paging/cursor > 128 + thứ tự |
| `10` | lộ trình promotion pick DR-03 |
| `11` | chính sách badge 403/404 F-04 (chỉ hỏi) |
| `12` | telemetry §12 |

Tất cả OPEN; kiểm lại 2026-09-24 trên `9060a7c4` và `62d7d864`.

## 10. Kết luận có phạm vi

- **`P19-A S10 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · đã push, chưa PR`.**
  - Frontend bám hi-fi trong giới hạn contract; ô không có field in typed absence hoặc NOT_IN_CONTRACT. Từ `1fb29010` (A2), mọi khối hi-fi giữ chỗ **cả khi loading và khi refusal**; trước đó loading/refusal chỉ còn header · notice · rules (claim bản trước sai, audit A2).
  - B1 (660) và N1 đã sửa ở `74f26200`; audit A1–A3 sửa ở `1fb29010`; `open_debt` rỗng.
  - Sau A-fix (tree `6b7e0419`): toàn bộ probe Research **134/134** ở lượt chính thức (lượt đầu 133/134, 1 assert probe phụ thuộc cỡ chip cũ; xem §12). Unit 171 file · 3058 pass · 1 skip; S10 43/43.
  - Con số "119/119" trước audit chỉ đúng với probe của implementer; lượt đầy đủ của audit có 1 flake probe `fix-hypothesis` (timeout, pass khi chạy riêng), ghi `known_flake`.
- **Chưa `VERIFIED`.** Còn thiếu:
  - `REAL_API_E2E_RECEIPT` (feature-dark).
  - axe.
  - Spec T01/T02/T07/T08 theo nghĩa hi-fi (thiếu field).
  - Telemetry §12.
  - Tích hợp baseline (B1).
  - `CG-P19-*`.
  - `VISUAL_DECISION_REQUIRED` (B2).

## 11. Reuse report (v0.5 §11.3)

| Tái dùng | Từ đâu |
|---|---|
| `ResearchPanel` (state frame, `aria-busy`) | `research/ResearchPanel.tsx` |
| `iso()` UTC phút | `research/utcMinute.ts` (P18) |
| `PortalApiError` | `lib/api` |
| `ResearchState` / `researchState` | `research/state.ts` |
| Mẫu `call<T>` riêng trong client (mỗi client Research có một bản, theo quy ước) và copy refusal F-04 | theo `replayClient.ts` / `reportClient.ts` |
| Token màu `--ink-*`, `--accent`, `--accent-2`, `--accent-2-soft`, `--accent-soft`, `--good`, `--bad`, `--bad-bg`, `--line*`, `--role-is`; font mono cho số (`--font-mono`) | Fund Paper tokens (`tokens.test.ts` xanh). `--warn` không dùng trong S10 (bản trước ghi nhầm, audit N3) |

Mới:
- Windowing tự viết (`windowRange`, `treeOrder`), không thêm package.
- CSS scoped `ln-*`.

Import thật của `LineageDetail.tsx`: `ResearchPanel` (`./ResearchPanel`), `iso` (`./utcMinute`), type `ResearchState` (`./state`), các type + `LINEAGE_REASON` / `LINEAGE_WITHHELD_WORDS` / `absenceReason` (`./lineageClient`), `LineageController` (`./useLineage`), `Link` / `useInRouterContext` (`react-router-dom`). `lineageClient.ts` import `PortalApiError` (`../lib/api`) và type `ResearchState` (`./state`).

**Cục bộ có chủ đích và trùng lặp nhỏ (sửa theo audit A5):**
- `Absent` (`LineageDetail.tsx`) là component cục bộ, **hợp lý**, không phải trùng lặp cần gộp:
  - `AbsentPanel` là hàm **private, không export** trong `ExecuteDetail.tsx` (dòng 143), nên không import được. Bản trước ghi nhầm là "export từ `EvidenceFlow.tsx`".
  - `Withheld` (`EvidenceFlow.tsx` dòng 120) gõ theo enum Availability của evidence, khác tập state của lineage (`AVAILABLE` / `NOT_PUBLISHED` / `PARTIAL` + reason `P19_*`).
  - `Pending` (A2) cũng cục bộ, cùng lý do: nó chỉ in state màn + lý do, không có enum chung để dùng lại.
- `short()` rút gọn digest (12 ký tự + "…", bản đầy đủ ở `title`) là hàm cục bộ; chưa có util digest ngắn dùng chung (12 client Research đều có bản riêng). P18 in digest đầy đủ.
- `call<T>` riêng trong `lineageClient.ts` theo quy ước mỗi client một bản.
- Gộp `short()` / `call<T>` nên làm ở RF-04 (chuẩn hoá frontend), không làm trong S10.

Không có màu raw ngoài token. Không copy asset bên ngoài. Không thêm dependency.

## 12. Audit P19 và A-fix

Audit độc lập (Opus 5.5, mắt mới) chạy trên head `7b0dda84`, code `74f26200`. Mọi số bên dưới là số chạy lại sau khi sửa.

### 12.1 Finding → cách sửa → bằng chứng

| ID | Mức | Loại | Finding | Cách sửa | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|---|
| A1 | MAJOR | code | `.ln-page button { font: inherit }` (specificity 0,1,1) thắng `.ln-chip` / `.ln-fchip` / `.ln-toggle` / `.ln-btn` (0,1,0): chip band, filter, toggle, retry hiện 12px Inter thay vì mono 8.5–10.5px (spec §9). jsdom không bắt được | Reset đổi thành `:where(.ln-page) button { font: inherit; }` (specificity 0,0,1): chỉ thắng reset global nhờ thứ tự, thua mọi class chip | **fixed ở `1fb29010`** | Probe `FIX-A1` computed style, 1280 và 660: `ln-chip` (band) 8.5px, `ln-chip` pick 8.5px, `ln-fchip` 9.5px, `ln-toggle` 9.5px, `ln-btn` retry 10.5px, tất cả `"JetBrains Mono"` = `var(--font-mono)`. `audit css-ledger` giờ pass (`chip.fs 8.5px`). Unit U43 guard source |
| A2 | MINOR | code + docs | Loading và refusal chỉ render `header · notice · rules` | `PendingFrame`: đủ 9 khối + notice; root/filters/tree/selected/diff/counts mang `data-panel-state` = state màn và dòng `Pending` ("{khối} — {state}" + lý do); filter/toggle disabled kèm `title`; promotion rule và rules là copy nên giữ nguyên; không số nào | **fixed ở `1fb29010`** | Probe `FIX-A2` 1280 + 660: loading và 400/401/403/404/503 đều 10 `data-panel` theo thứ tự `header, notice, root, filters, tree, selected, diff, promotion-rule, rules, counts`, `pending=6`, `digits=[]`, overflow 0, mutation 0. `AUDIT-REFUSAL` ×5: `panelStates` 6 khối. Unit `expectPendingFrame` ở U01, U29, U30, U31, U32 |
| A3 | MINOR | code | 403 `denied` "⊘ DENIED" vs 404 `empty` "∅ EMPTY" cùng câu F-04 | `toLineageRefusal`: 404 → `denied` như 403 | **fixed ở `1fb29010`** | Probe `FIX-A3`: 403 và 404 cùng `{screen: denied, badge: denied, glyph: ⊘, text: "⊘ DENIED This alpha may not exist or may be outside your access — nothing here confirms either."}`. Unit U31 so tuple badge bằng nhau; U33 bảng 404 → denied. Lệch tiền lệ S09 ghi D19 |
| A4 | MINOR | docs | Receipt trích sai subtitle hi-fi; gọi rules footer là verbatim với hi-fi | §5.4 sửa subtitle hi-fi đúng: "Immutable nodes · every config change is a sibling attempt with its own hash."; rules ghi rõ verbatim **theo spec §2.5**; thêm bảng copy hi-fi ≠ spec (title, subtitle, breadcrumb, rules, promotion rule, pick line) | **docs corrected** | §4, §5.4 |
| A5 | MINOR | docs | §11 ghi `AbsentPanel` / `Withheld` export từ `EvidenceFlow.tsx` | §11 ghi đúng: `AbsentPanel` private trong `ExecuteDetail.tsx`, `Withheld` khác tập state → `Absent` cục bộ hợp lý; liệt kê import thật | **docs corrected** | §11; debt `S10-LOCAL-DUPLICATION` sửa mô tả |
| A6 | MINOR | docs/test | Unified test "counts reconcile Library definitions" không test, không liệt kê | `not_run` thêm mục này (không có bảng định nghĩa chung giữa `lineage.counts` và nhóm alpha của Run Library); thêm `CG-P19-13` | **docs corrected** | `thanhvuong-test-results.json` `not_run`; [backend requests](./thanhvuong-backend-requests.md) `CG-P19-13` |
| N1 | NOTE | code | `intent_kind` bị lowercase trong row | Giữ: row là nhãn hiển thị; enum nguyên văn nằm ở panel selected (`Row k="intent"`) | chấp nhận | — |
| N2 | NOTE | docs | "notes/fork navigation" | Partial theo P10 NEW-only: chỉ có "new run →" / "declare at New Run →" / "import new version →"; không có fork kèm parent | ghi nhận | Unified `#rl-p19` |
| N3 | NOTE | docs | `.ln-abandoned`, `--warn` | Receipt §4 → `.ln-node[data-group="abandoned"]`; §11 bỏ `--warn` | docs corrected | §4, §11 |
| N4 | NOTE | code | Không có `?attempt` → chọn `tree[0]` | Giữ: phần tử đầu theo thứ tự server, không phải "best"; U25 | chấp nhận | — |
| N5 | NOTE | receipt | "119/119" | Ghi số thật từng lượt + flake probe `fix-hypothesis` | docs corrected | §10, §12.2 |

`CG-P19-11` (badge 403/404) chuyển **WITHDRAWN**: handoff đã trả lời chính sách, frontend tự sửa ở `1fb29010`. Số thứ tự giữ nguyên.

### 12.2 Gate chạy lại (workspace, tree `6b7e0419` = working tree trước commit `1fb29010`, 2026-09-24)

| Gate | Lệnh | Exit | Kết quả | Log SHA-256 (16) |
|---|---|---:|---|---|
| Typecheck | `npx tsc -b --noEmit` | 0 | PASS (log rỗng) | `e3b0c44298fc1c14` |
| Build | `npm run build` | 0 | PASS, chỉ cảnh báo chunk cũ | `c029f52c0cbc06c4` |
| S10 | `npx vitest run src/research/lineageDetail.test.tsx` | 0 | **43/43** (`S10-U01…U43`) | `603ddb1430b10632` |
| Unit toàn bộ | `npx vitest run` | 0 | **171 file · 3058 pass · 1 skip** (3059), 82.1 s, không flake | `2c83b9be2655d513` |
| Unit toàn bộ (lượt trước, bản nháp) | `npx vitest run` | 1 | 3057 pass · 1 fail: guard `disabledReason.test.ts` bắt 2 nút disabled chưa có lý do trong bản nháp A2; thêm `title` rồi chạy lại ở dòng trên | — |
| Probe Research, lượt 1 | `RESEARCH_SHOT_DIR=~/tv-shots/p19fix/all V2_SHOT_DIR=… AUDIT_SHOT_DIR=… FIX_SHOT_DIR=~/tv-shots/p19fix npx playwright test -c .tv-probe.config.ts --workers=1` | 1 | 133/134: `v2 receipt` assert "partial@660 chips scroll inside band" phụ thuộc chip 12px cũ; sau A1 chip 8.5px vừa band (sw 462 = cw 462). Sửa probe (partial: vừa hoặc cuộn; full/virtual vẫn phải cuộn), không sửa src | `11ed20394b0d3aa0` |
| **Probe Research, lượt chính thức** | như trên | 0 | **134/134**, 4.4 phút: fixtures 8 + product 74 + tvp19fix 52 (v2 + audit + 5 test A-fix). `fix-hypothesis` pass lượt này | `ff03d6aff991180b` |

Probe tạm `e2e/_probe-research-tvp19fix.spec.ts` (SHA `109bdb10803653f4`) = probe audit + sửa: loading kỳ vọng 10 panel và 0 `[data-count]`; refusal 404 → `denied`; `audit refusal-dom` kỳ vọng khung đủ và 0 chữ số ngoài notice/header; thêm `fix A1` ×2, `fix A2` ×2, `fix A3`. Config tạm `.tv-probe.config.ts` baseURL `127.0.0.1:4417`. Preview riêng 4417, API stub. Probe, config và `test-results/` đã xoá; preview đã kill, `ss -ltnp | grep 4417` rỗng.

### 12.3 Ảnh A-fix (`~/tv-shots/p19fix/`, không commit)

| File | SHA-256 | File | SHA-256 |
|---|---|---|---|
| `p19fix-chips-1280.png` (= `p19fix-full-1280.png`) | `ac161ac16d5be74c` | `p19fix-chips-660.png` (= `p19fix-full-660.png`) | `b83971a8ba1962fd` |
| `p19fix-loading-1280.png` | `e3a6d0105c749352` | `p19fix-loading-660.png` | `879aef533c069bb5` |
| `p19fix-refusal-400-1280.png` | `8d39fbae8ac17004` | `p19fix-refusal-400-660.png` | `fe3a06f4b75d1660` |
| `p19fix-refusal-401-1280.png` | `2eebe86ec30c8cd7` | `p19fix-refusal-401-660.png` | `8d768dbbb70b7147` |
| `p19fix-refusal-403-1280.png` | `ec6971fbc2d35e7b` | `p19fix-refusal-403-660.png` | `f83aa7de0bd17ba2` |
| `p19fix-refusal-404-1280.png` | `bc8887915c6468f9` | `p19fix-refusal-404-660.png` | `40e231ce94fdb2a0` |
| `p19fix-refusal-503-1280.png` | `d8bbf8a0563bb869` | `p19fix-refusal-503-660.png` | `687080eadf194bcd` |
| `p19fix-full-dark-1280.png` | `fc48b3d78b11a640` | `p19fix-full-dark-660.png` | `7dfbe7598ade6368` |
| `p19fix-partial-660.png` | `f1b40438ce8929b5` | `p19fix-virtual-120-660.png` | `05fd5ac05404850e` |
| `p19fix-empty-660.png` | `dc046189d139d513` | `p19fix-hifi-1280.png` / `-660.png` | `1d0d841b5185c58b` / `6238fc39c4c9d064` |

Ảnh 403 và 404 khác SHA chỉ vì request id in trong notice (`req_p19_403` vs `req_p19_404`); badge, state và câu giống hệt (FIX-A3). Ảnh full/partial/dark khác SHA so với vòng 2 vì chip giờ 8.5px mono (A1). Danh sách đầy đủ (kể cả `all/`) ở [thanhvuong-test-results.json](./thanhvuong-test-results.json) `evidence_store.sha256_prefix_afix_tree_6b7e0419`.

## 13. Vòng khớp hi-fi (R1 `c9dd195e`) và receipt R2

**Quyết định Bobby 2026-09-24:** "version này chốt theo đúng khớp với HIFI; nếu có gì không hợp lý thì mở version mới để làm gọn đúng scope; 6–7 visual decision phải ghi vào Unified plan; khi làm P20 sẽ đẻ thêm debt mới nên ghi vào handoff lẫn Unified cho các phase sau."

**Nguyên tắc từ vòng này: spec ≠ hi-fi thì hi-fi thắng.** Chỗ nào vẫn giữ spec là ngoại lệ, có `VD` và chờ Bobby chốt (bảng 13.4).

### 13.1 Commit R1

- `c9dd195e2c7bb9710af8babf7b56c655ce2c6da1` `feat(research): S10 matches hi-fi filters, order, chips, rail and copy`. Parent `dacbbd75`, tree `46d101c047bfc5b8ee6b9caf18de7d2f936ff0cd`.
- `LineageDetail.tsx` +811/−613, `lineageDetail.test.tsx` +292/−41. `lineageClient.ts`, `useLineage.ts`, `LineageRoute.tsx` không đổi. Không backend, contract, package hay lock file.
- 7 điểm = ledger `VD-P19-01…07` trong [Unified note P19](../../../UNIFIED_IMPLEMENTATION_PLAN.md#p19-thanhvuong-frontend-implementation-note--screen-10-2026-09-24):
  1. 4 filter `active · draft · superseded · abandoned`, bật/tắt độc lập, counter "showing n of m attempts".
  2. Band ACTIVE trước (tách bằng `filter`, không `.sort`).
  3. Chip wrap, mono 9.5px, radius 999.
  4. Rail cha–con có chấm, 34 + min(depth, 8) × 22.
  5. Promotion rule nguyên văn hi-fi; pick chỉ từ `promotion_pick`.
  6. Title, subtitle, source chip, rules nguyên văn hi-fi; rules là panel cuối.
  7. Toggle "show probe attempts" đúng chỗ hi-fi, `disabled` + `CG-P19-03`; chip `+ probes` disabled mỗi band; bỏ expand-all; card đóng khi tải.

### 13.2 Gate R2 (head `c9dd195e`, 2026-09-24, workspace)

| Gate | Lệnh | Exit | Kết quả | SHA log |
|---|---|---|---|---|
| Typecheck | `npx tsc -b --noEmit` | 0 | 0 lỗi | `bcb1a61798abda8d` |
| Build | `npm run build` | 0 | chỉ cảnh báo chunk | `8c1bca03581fe047` |
| S10 + boundary | `npx vitest run src/research/lineageDetail.test.tsx src/research/researchBoundary.test.ts` | 0 | **66/66** (`lineageDetail` 52, `researchBoundary` 14) | `df6738425bee3d2b` |
| Unit toàn bộ | `npx vitest run` | 0 | **171 file · 3067 pass · 1 skip** (3068), 86.1 s, không flake | `e276b8a59681a6bb` |
| Probe Research toàn bộ | `RESEARCH_SHOT_DIR=~/tv-shots/p19r2 npx playwright test -c .tv-probe.config.ts --workers=1` | 0 | **119/119** lượt đầu, 2.6 phút: fixtures 8 + product 74 + r2 37 | `playwright.log` `6e2cb46e8254dddd`, `probe.log` `bd1e58114364d01d` |

- Preview riêng `npx vite preview --port 4417 --strictPort --host 127.0.0.1` (chạy nền bằng `setsid`, PID ghi ở `preview.pid`; tiến trình 3983513 / 3983552 / 3983553), API stub theo shape `lineage.service.ts` (fixture canonical vẫn chưa có, `CG-P19-01`).
- Probe tạm `e2e/_probe-research-tvp19r2.spec.ts` (SHA `4a2a5eef4bb65f7b`) = harness probe audit + assertion theo hi-fi; config tạm `.tv-probe.config.ts` (SHA `75c00c3a4819ea01`). Cả hai đã xoá khỏi repo (bản sao `~/tv-shots/p19r2/*.copy`); không còn `test-results/`; preview đã kill, `ss -ltnp | grep 4417` rỗng; `git status --short` rỗng.

### 13.3 Assertion R2 theo hi-fi (1280 và 660)

| Nhóm | Kết quả browser |
|---|---|
| Full + dark | 1280 hai cột 571/381 (dark 602/402); 660 một cột, overflow 0. Band `["ACTIVE","SUPERSEDED"]`. Chip wrap: `overflow-x` visible, over 0, 2/7 dòng (dark 660: 2/5); thử cuộn chip → scrollLeft 0, docX 0. 16 rail, 0 sai bề rộng; `::before` −13px / 12px |
| Card | 0 detail khi tải; click mở (detail 1, `aria-expanded=true`), click lần hai đóng. Không expand-all |
| Toggle probes | `disabled`, title chứa `CG-P19-03`, 0 chữ số; 2 chip `+ probes` đều disabled |
| Font | `.ln-chip` / `.ln-fchip` / `.ln-toggle` / `.ln-cfg` 9.5px `"JetBrains Mono"`; `.ln-cert` 9px. "cert not published", không "N/A" |
| Filter × counter | Nhóm ACTIVE 3, DRAFT 1, SUPERSEDED 11, ABANDONED 1. Cả 16 tổ hợp: counter = số row = `aria-pressed`. Nhãn `active, draft, superseded, abandoned` |
| Partial | "showing 4 of 4 attempts · 140 on record"; note bounded `P19_BOUNDED_GRAPH_LIMIT_REACHED`; child runs PARTIAL; pick NOT_PUBLISHED `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK`; diff PARENT_OUTSIDE / NOT_PUBLISHED; không số 0 giả |
| Empty | "showing 0 of 0 attempts" + "No attempt is recorded for this alpha yet." |
| Virtual 120 | DOM 23 → 30 sau cuộn; chip sâu `att_39` được chọn, trong khung, detail mở, focus giữ; không chồng row; "showing 120 of 120 attempts" |
| GATES RESET | SPAN, không onclick/role; click row và panel diff: 0 request mới, selection không đổi, 0 mutation |
| Deep link `?av=av_0_9_2` | bandTop 8 lúc tải và sau reload, `att_01` được chọn; chọn attempt → URL thêm `&attempt=` (replace); Back khôi phục selection (vị trí cuộn không khôi phục, chỉ ghi nhận) |
| Keyboard | 4 Tab tới chip đầu; focus ring double box-shadow; Enter chọn; Enter trên filter DRAFT → "showing 1 of 16 attempts"; Enter trên card mở detail |
| Refusal 400/401/403/404/503 | 10 panel, pending 6, có request id, không lộ, 1 GET `limit=128`; 503 retry → 2 GET. 403 và 404 cùng bộ (denied, badge denied, cùng câu, 6× denied) |
| Link | evidence `/research/quantbt/runs/run_…/evidence`, report `…/report`, runs `?group=1&alpha=`, `/runs/new`, `/alpha-import`; rc là SPAN chưa route; Run Library → lineage → evidence chạy |
| Copy | Title, subtitle, source chip, promotion rule, rules: chuỗi hi-fi = chuỗi product. Nhãn filter bằng nhau; format counter bằng nhau (hi-fi "showing 6 of 52") |
| Hi-fi | 1280 overflow 0, cao 1493; 660 overflow 13 (hi-fi không responsive) |

**Bug:** không có bug nào làm fail assertion. Probe pass lượt đầu, không sửa src.

### 13.4 Lệch còn lại, phân loại

**Field-driven** (contract thiếu field; giữ vị trí/hình dạng hi-fi + typed absence):

| Ô hi-fi | Product | Request |
|---|---|---|
| "+24 probes", "show 46 probe attempts", kiểu row storied/probe | chip `+ probes` và toggle disabled, không số | `CG-P19-03` |
| rc chip, dòng pick "→ rc_ (draft) · gate R1 next" | "rc & publish →" SPAN chưa route | `CG-P19-04` |
| cert / OOS / claim / decay / verdict | "cert not published", NotInContract | `CG-P19-05` |
| exercised / untried | NotInContract | `CG-P19-06` |
| outcome "best C · promote closed" | NotInContract | `CG-P19-07` |
| spec line và note tường thuật của card | `intent_kind` · `space_signature`, `reason` của server | `CG-P19-08` |
| "the ACTIVE attempt" (câu promotion rule) | mọi attempt của version ACTIVE hiện ACTIVE (3 trong fixture) | `CG-P19-14` (mới) |
| nhãn run `R-WFO-118` | `primary_run.run_id` | chưa có request (không có field label) |
| "BTCUSDT · 4h" trên breadcrumb | không hiện | chưa có request |
| id ngắn `att_01`, hash alpha ngắn | ULID dài: chip wrap nhiều dòng hơn, header card 2 dòng | chưa có request (hiển thị, không phải field) |
| note tường thuật của diff | chip từ `semantic_diff.changes` | không request (hi-fi minh hoạ) |
| counter hi-fi chỉ đếm attempt storied | counter đếm mọi attempt | theo `CG-P19-03` |

**Spec ≠ hi-fi — hi-fi thắng:**

| Điểm | Spec | Hi-fi | Product |
|---|---|---|---|
| Copy title/subtitle/rules/promotion rule | spec §2.5 | hi-fi | hi-fi |
| Chip | 8.5px, radius 3 | 9.5px, radius 999 | hi-fi |
| Band | card riêng, viền trái 3px | hàng trong root card | hi-fi |
| Opacity SUPERSEDED/ABANDONED | .72 | .82 | hi-fi |
| **Thứ tự band** | ACTIVE-first (T01) | SUPERSEDED trên ACTIVE | **spec — ngoại lệ, `VD-P19-02`, chờ Bobby** |
| **Bước rail** | 22px | 26px | **spec — ngoại lệ, `VD-P19-04`, chờ Bobby** |
| "import new version →" | có | không | giữ (spec), chỉ ở band ACTIVE |

**Khác:**

| Điểm | Ghi chú |
|---|---|
| "cert not published" thay "cert —" | CLAUDE.md cấm `-` thay số |
| Panel counts | Không có trong hi-fi; handoff bắt disclosure |
| Chip state thô cạnh status (READY, FAILED…) | Chỉ khi khác status suy ra |
| Source chip "attempts.json" | Nguyên văn hi-fi; `read_authority` thật là PORTAL_PERSISTED_RESEARCH (ở title và heading counts) |
| Chrome module QuantBT ("QuantBT Backtest REAL", Runs/Imports/New run) trên breadcrumb | Shell dùng chung |
| Dark và 660 | Hi-fi không có |
| Path diff dài bẻ giữa từ ("optimization.effective_sc hedule") | Hiển thị |
| Lưới dark 602/402 vs light 571/381 cùng viewport | Hiển thị |
| Ảnh fullPage có topbar/sidebar sticky nằm giữa ảnh | Artefact chụp, không phải bug |

### 13.5 Ảnh R2 (`~/tv-shots/p19r2/`, không commit)

| File | SHA-256 | File | SHA-256 |
|---|---|---|---|
| `p19r2-hifi-1280.png` (= ảnh hi-fi A-fix) | `1d0d841b5185c58b` | `p19r2-hifi-660.png` | `03b582cef17e3397` |
| `p19r2-compare-1280.png` (hi-fi ↔ product) | `4984b76cd91f44bd` | `p19r2-compare-660.png` | `fcaf727215ab4f40` |
| `p19-r2-full-1280.png` | `64b0967a4633f7c8` | `p19-r2-full-660.png` | `63b7bd6a16d09ec0` |
| `p19-r2-full-dark-1280.png` | `f6db2bbac9292853` | `p19-r2-full-dark-660.png` | `21635bcd8aac2544` |
| `p19-r2-filter-1280.png` | `5884f0320cc34130` | `p19-r2-filter-660.png` | `e6ed41d3896fab72` |
| `p19r2-loading-1280.png` | `67bcfaf11a8062b8` | `p19r2-loading-660.png` | `8f41aab881fa9a97` |
| `p19-r2-partial-1280.png` | `fecb0f56aa8479c4` | `p19-r2-partial-660.png` | `672111b81e8c8687` |
| `p19-r2-empty-1280.png` | `f2ee64ce82b48560` | `p19-r2-empty-660.png` | `f9903941f3198227` |
| `p19-r2-virtual-120-1280.png` | `4b3a4b5659dec347` | `p19-r2-virtual-120-660.png` | `0537b39f046b4b59` |
| `p19-r2-gates-1280.png` | `deda6f6f97c4927c` | `p19-r2-gates-660.png` | `cc647f7bdc060b2a` |
| `p19-r2-deep-link-av-1280.png` | `6f747f16e605784a` | `p19-r2-deep-link-av-660.png` | `5810880e171114bd` |
| `p19-r2-keyboard-1280.png` | `0dd548fb9bbf5321` | `p19-r2-keyboard-660.png` | `72647f86dfed468a` |
| `p19-r2-refusal-400-1280.png` | `5ab296593bbccb75` | `p19-r2-refusal-400-660.png` | `96cded78b72b674f` |
| `p19-r2-refusal-401-1280.png` | `5be22b9f20e5ddf3` | `p19-r2-refusal-401-660.png` | `d6966b2aac51b4d6` |
| `p19-r2-refusal-403-1280.png` | `80cc5bd94577dd25` | `p19-r2-refusal-403-660.png` | `36ad1dcc1eb43dd3` |
| `p19-r2-refusal-404-1280.png` | `7f43c30a78d3a293` | `p19-r2-refusal-404-660.png` | `de8d9de8c17ae141` |
| `p19-r2-refusal-503-1280.png` | `c140bc2ed60920d2` | `p19-r2-refusal-503-660.png` | `ae91fa7f634233db` |

`p19-r2-filter-1280.png` trùng SHA với `p19-r2-loading-resolved-1280.png`: cả hai chụp trạng thái full sau khi tải, trước khi đổi filter. Ảnh 403 và 404 khác SHA chỉ vì request id. Danh sách đầy đủ (kể cả ảnh probe product/fixtures) ở [thanhvuong-test-results.json](./thanhvuong-test-results.json) `evidence_store.sha256_prefix_r2_tree_46d101c0`.
