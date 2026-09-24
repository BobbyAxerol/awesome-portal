# P20 — Thanhvuong frontend receipt (Screen 13 Compare)

**Trạng thái:** `P20-A S13 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · đã push lên primus-origin, chưa PR`. Head code sau audit độc lập: **`eeeae14f`** ([§12](#12-audit-độc-lập-p20-và-commit-eeeae14f)).

- Backend P20 vẫn là `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK` ([P20 README](./README.md)): `CONTROL_API_FEATURE_RESEARCH_COMPARE=false`.
- Browser receipt chỉ dùng **API stub** dựng theo shape `compare.contract.ts` / `compare.service.ts`, vì chưa có fixture compare canonical ở đâu cả (`CG-P20-01`).
- Receipt này chỉ ghi thay đổi frontend và evidence. Nó không đổi rule, contract hay phase gate, và **không** gọi P20 là `VERIFIED`.
- Rule Bobby 2026-09-24 (note P19 "Rule cho các phase sau (P20+)") áp dụng: màn khớp hi-fi + spec, hi-fi thắng khi hai nguồn lệch; FE không tự chọn lệch — mọi lệch ghi `VD-P20-NN` ở [§6](#6-visual-decision-ledger-vd-p20-0129), ở [handoff addendum](./frontend-handoff-claude.md#thanhvuong-addendum--nợ-mới-p20-cho-các-phase-sau-2026-09-24) và ở Unified. Hard rule hiển thị trung thực (CLAUDE.md §3.3) đứng trên hi-fi: copy hi-fi mâu thuẫn contract thì render đúng contract và ghi `REQUIRES_BOBBY_DECISION`.

## 0. Packet và những gì đã đọc

**Packet P20 của Thanhvuong** (năm file cạnh file này):

| File | Nội dung |
|---|---|
| `thanhvuong-frontend-receipt.md` | Receipt này: đã đọc, git, file, route/link, mapping hi-fi, evidence, so hi-fi, ledger VD, discrepancy, Reuse report, kết luận, audit độc lập (§12) |
| [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md) | `CG-P20-01…11` theo template CLAUDE.md §5, kèm locator/actual/expected/đề xuất/test/fallback; việc Bobby quyết B1–B6; ngày kiểm lại + baseline |
| [thanhvuong-test-results.json](./thanhvuong-test-results.json) | Evidence máy đọc được: tree SHA, từng gate (lệnh, exit, số đếm), `not_run`, SHA-256 ảnh/log (không commit) |
| [thanhvuong-debt-register.json](./thanhvuong-debt-register.json) | Nợ đã đóng trong phase, `open_debt` thật, VD chờ Bobby, request mở, downstream gate |
| [thanhvuong-rollback.md](./thanhvuong-rollback.md) | Revert từng commit, mới nhất trước |

Dòng trạng thái ở Unified §13 và implementation note dưới
[`#rl-p20`](../../../UNIFIED_IMPLEMENTATION_PLAN.md#p20-thanhvuong-frontend-implementation-note--screen-13-2026-09-24) đều trỏ về packet này.

**Đã đọc (`READ`), theo CLAUDE.md §7.9.** Commit ghi trong bảng là commit cuối chạm file đó (`git log -1 --format=%h <ref> -- <file>`).
- Baseline `primus-origin/docs/research-loop-plan` lúc R2/R3 của P19 (và lúc lập plan P20) là `bb25bf39`.
- Lúc đóng packet (sau `git fetch primus-origin`, 2026-09-24) baseline là **`72d2638b`** (7 commit mới, `bb25bf39..72d2638b`, xem [§1](#1-git-base-head-branch) và B1).
- Không commit mới nào chạm contract compare (OpenAPI, d.ts), `apps/control-api/src/research/compare*` hay `evidence/P20`: `git diff --stat bb25bf39 72d2638b -- <4 nhóm đó>` rỗng.

| File | Nhánh (`034aef11`) | Baseline `bb25bf39` | Baseline `72d2638b` |
|---|---|---|---|
| `CLAUDE.md` (§3, §5, §7.9, §7.10, §8) | `19310912` | `8ca7bc11` | `8ca7bc11` |
| `upgrade/research_loop/CLAUDE-FOR-thanhvuong.md` | `30fb9f21` | `30fb9f21` | `30fb9f21` |
| `upgrade/research_loop/THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` | `30fb9f21` | `51b11247` | `51b11247` |
| `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` (§13, `#rl-p20`, note P19 làm mẫu + "Rule cho các phase sau (P20+)") | `295901b7` | `bb25bf39` | `fde7554d` (RF-04 checkpoint; không chạm `#rl-p20`) |
| `evidence/P20/frontend-handoff-claude.md` | `a4acd5e2` | `a4acd5e2` | `a4acd5e2` |
| `evidence/P20/README.md`, `evidence/P20/phase-report.md` | `a4acd5e2` | `a4acd5e2` | `a4acd5e2` |
| `evidence/P19/thanhvuong-*` (packet mẫu, 5 file) | `295901b7` | — (chưa có trên baseline) | — |
| `RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` §P20 (`P20-T01…T12`, `V11-P20-DR/BR/GX`) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `release-v1.1/docs/screens/13_compare.md` (T01–T11, §7 CSS ledger, §8 copy verbatim, §9 claim rank map, §10 fixture guide) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `release-v1.1/QuantBT 13 Compare.dc.html`, mở trong browser ở 1280 và 660 (3 mode + mismatch) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `packages/contracts/openapi/research-compare.openapi.json` + `generated/research-compare.d.ts` | `a4acd5e2` | `a4acd5e2` | `a4acd5e2` |
| `apps/control-api/src/research/compare.{contract,service,controller}.ts` (chỉ đọc, để lấy key, reason code và thứ tự thật cho stub) | `a4acd5e2` | `a4acd5e2` | `a4acd5e2` |
| `apps/portal/frontend/src/research/evidenceClient.ts` (`Fresh<T>`, `NOT_MODIFIED`) | `f8e2d8cf` | `c9fcc7ba` | `c9fcc7ba` |
| `apps/portal/frontend/src/research/{lineageClient,reportEquity}.ts` | `1fb29010` / `548e8d29` | — | — |
| `apps/portal/frontend/src/research/RunLibrary.tsx` | `0910ecc3` | `b0b1a120` | `3e7055d5` (viết lại S01, xem B1) |
| `apps/portal/frontend/src/features/quantbt/QuantBTModule.tsx` | `0910ecc3` | `d84227b7` | `8bd81b01` (DQ-01 bỏ module header, xem B1) |

Contract đã tiêu thụ: `research-compare.openapi.json` `version 1.0.0`, SHA-256 `cd393d5664637adc…`; `generated/research-compare.d.ts` SHA-256 `6d7b51a94e8adb53…`.
- Một operation `researchCompareGetV1` `GET /api/v1/research/alphas/{alphaId}/compare?workspace_id&mode&runs`.
- **Có** `etag` + 304 (`If-None-Match`; `cache-control: private, no-store`); Problem 400/401/403/404/503.
- Không có fixture compare ở cả ba ref: `git ls-tree -r <ref> --name-only | grep -i "fixtures.*compare"` exit 1 ở `HEAD`, `bb25bf39`, `72d2638b`.

### 0.1 Guide `P20-T01…T12` + `V11-P20-*` — frontend cover được gì

| ID | Nội dung Guide | Frontend hôm nay |
|---|---|---|
| T01 | Same-alpha enforce ở server | Backend. FE chỉ đọc trong một Alpha: route canonical có `alphaId` trong path; resolver `/research/quantbt/compare` không có `alpha=` thì không gửi request (U19; browser resolver 0 GET) |
| T02 | Mismatch không render chart/metrics ẩn | **Có:** REFUSED → 0 node overlay/delta/correlation/weaker/differences/svg, kể cả node ẩn (U10; browser refused 1280/660, không có chữ "ρ") |
| T03 | Khác key → small multiples, không overlay | **Có:** caption server verbatim, `[data-pair-overlay]` = 0 (U06; browser markets) |
| T04 | Claim rank trước metric | **Hiển thị:** in thứ tự server (rank asc → NET_RETURN desc…), bày ngược để đọc weak→strong như hi-fi (`VD-P20-14`); không `.sort` (U02, U22 grep) |
| T05 | Common-window / zero-variance / missing | **Hiển thị:** TRADE_COUNT `NOT_APPLICABLE` + reason; zero-variance → absent + `P20_ZERO_VARIANCE_RAW_RETURNS`; PARTIAL pair in reason (U08, U09; browser corr-zero, pair-partial) |
| T06 | Correlation đối chiếu numeric reference | Backend. FE in `value` nguyên chuỗi + formula/version/n/window/missing policy |
| T07 / T12 | Không phát sinh publish/pair-promotion/job/approval/deploy | **Có:** chỉ GET; mutations 0 ở mọi RECEIPT; weaker claim chỉ là dòng hiển thị |
| T08 | Toàn bộ test S13 | Một phần: [§5.3](#53-spec-13-test-matrix-t01t11); T10 (axe) chưa chạy, T11 copy diff ≠ 0 (VD chờ Bobby) |
| T09 | Đổi order/rank/inspection không đổi selected/promotion/RC | **Có (theo cấu trúc):** S13 không có control chọn/promote; đổi mode/pair chỉ đổi URL + 1 GET |
| T10 | Full-sample không vào slot OOS không scope | **Hiển thị:** `original_metrics` in kèm `scope`/`definition_id`, `common_window` in `definition_id` riêng; OOS Sharpe không có Δ (FE không trừ) |
| T11 | Zero variance / no overlap không thành 0 | **Có** (U09; browser corr-zero `no number ρ, no 0`) |
| `V11-P20-DR` | Delta thật | **NOT_RUN**: lane này không có compute hay data thật; backend feature-dark |
| `V11-P20-BR` | Browser/visual/action | Một phần: `PRODUCT_ROUTE_BROWSER_RECEIPT` với API stub, preview riêng 4417 (không phải dev host) |
| `V11-P20-GX` | Protected hash, no-debt, report | Một phần: hook chạy tay, `git diff --check`; `open_debt` **không rỗng**; chưa có rebuild/deploy receipt |

`READ` khác `IMPLEMENTED` khác `VERIFIED` (A4.1).

## 1. Git: base, head, branch

| Mục | Giá trị |
|---|---|
| Branch | `feat/thanhvuong/research-p17-p21`; remote duy nhất `primus-origin` |
| Base của P20 | `295901b7361d31dfa4418a31abc970906dfae4dc` (docs P19 R3) |
| Commit code P20 (tree) | `92cdc844a6d82b491e47ff234a739119883c66f2` feat(research): S13 compare client + hook (tree `4a3caffc`)<br>`0910ecc31da05609e773c1a192cdf31bcfa266fb` feat(research): S13 Compare screen, routes and links (tree `b3241d95`)<br>`f3d6169dd2e82954b9b8733783ba4d55235acb84` test(research): S13 unit lane S13-U01..U23 (tree `8252a329`)<br>`009cedb87dd96a0ce4670580a818111833b68f66` fix(research): S13 ladder reads weak to strong as the hi-fi draws (tree `686ad2df`)<br>`034aef11fa1251226e74866ac2a4350f5a6c082f` fix(research): S13 mini chart day labels and markets rule copy (tree `e2d7d388`)<br>`eeeae14fb5e1205b68838d9696550792d85b5eab` fix(research): S13 audit fixes — Δ direction label, zero sign, absent counts, resolver mode (tree `58f27644`; audit A1–A5, A8, A10, xem §12) |
| Ghi chú lịch sử | Báo cáo gói A ghi 3 commit đầu là `919e55b7` / `22c6294e` / `7dfb8d0f` với trailer Opus. Trước khi push, 3 commit được dựng lại local chỉ để đổi trailer thành `Claude Fable 5.1` — tree giữ nguyên (`4a3caffc`, `b3241d95`, `8252a329`). Không merge, rebase baseline hay force |
| Docs commit | Lần 1 (trước audit): `e731cfa6` `docs(research): P20 Thanhvuong packet — S13 Compare receipt, requests, debt, rollback` (5 file packet) · `7800e8e2` `docs(research): P20 §13 row, implementation note and handoff addendum`<br>Lần 2 (sau audit, gói C-2): `docs(research): P20 packet after audit — receipt §12, VD-P20-21…29, CG-P20-09…11` (5 file packet, commit chứa file này) · `docs(research): P20 §13 note + handoff after audit` (Unified + handoff addendum). Commit không tự ghi được SHA của chính nó; SHA lần 2 xem `git log` |
| Tác giả | `Vuong <thanhvuong11052003@gmail.com>`, trailer `Co-Authored-By: Claude Fable 5.1` |
| Baseline | `docs/research-loop-plan`: `bb25bf39` lúc lập plan, `72d2638b` lúc đóng packet. **Chưa merge/rebase**; Bobby quyết (B1) |
| Push / PR | Lần 1: `295901b7..7800e8e2`. Lần 2 (gói C-2): `7800e8e2..` docs commit thứ hai sau audit, mang theo `eeeae14f` + 2 docs commit. Cả hai lên `primus-origin`, pre-push chạy tay exit 0, không force. Chưa có PR |

`bb25bf39..72d2638b` (7 commit, chỉ ghi, không merge):

| Commit | Nội dung | Chạm S13? |
|---|---|---|
| `8bd81b01` | fix(research): shared state rule, number format and no module header — 404 → terminal `notFound` (không còn `empty`); `researchFormat.ts` (DQ-08, hiển thị theo đơn vị, giữ giá trị server ở `title`); màn Research Loop bỏ module header (DQ-01) | Gián tiếp: sửa `QuantBTModule.tsx` (cùng file S13 sửa, khác vùng); DQ-01 xoá đúng header thừa ở G1; DQ-08 và state rule 404 mâu thuẫn cách S13 in chuỗi nguyên + 403=404 `denied` (B1) |
| `3e7055d5` | fix(research): S01 Run Library requests, selection, states and HiFi layout — `RunLibrary.tsx` +968/−463 dòng; CompareBar thành nút **disabled** "Screen 13 Compare is not built yet — phase P20 delivers it" | **Có:** xung đột chắc chắn với thay đổi CompareBar của S13 (`alpha=`) |
| `67d041f5`, `fde7554d` | RF-04 consumer/probe + checkpoint docs (Unified vùng RF-04) | Không chạm file S13; Unified khác vùng |
| `a99cbd8f` | fix(research): S04 Evidence Flow | Không chạm `evidenceClient.ts` S13 dùng (commit cuối vẫn `c9fcc7ba` ở baseline) |
| `6dab271d` | fix(research): S05/S06 | Không |
| `72d2638b` | docs(research): RF-06 status | Không |

## 2. File đã sửa (`git diff --numstat 295901b7 eeeae14f`)

| File | + | − | Mục đích |
|---|---:|---:|---|
| `src/research/compareClient.ts` | 335 | 0 | Một operation generated `researchCompareGetV1` qua `call<T>` / `PortalApiError`; ETag `Fresh<T>` / `NOT_MODIFIED` (mẫu S04); `comparePath` (gắn `runs` chỉ khi mode=pair và đúng 2 id), `compareHref`, `compareEntryHref`; `COMPARE_REASON` (25 code service), `CLAIM_RANK_MAP` (5 family), copy spec §8; `toCompareRefusal` dùng lại `toLineageRefusal` (403 = 404 `denied`) |
| `src/research/useCompare.ts` | 141 | 0 | 1 read / `(alphaId, mode, runs)`; AbortController + sequence guard (bỏ response cũ); giữ validator ETag, 304 giữ bản đang có; không poll, không refetch on focus |
| `src/research/CompareDetail.tsx` | 1586 | 0 | Màn S13, `COMPARE_PANELS` theo mode; CSS scoped `:where(.cp-page)`; ledger VD ở header file; `009cedb8` +14/−10 (ladder server-reversed + mũi tên "claim ↑ →"); `034aef11` +11/−3 (mini chart chỉ nhãn ngày đầu/cuối; banner markets bỏ cụm lặp); `eeeae14f` +50/−15 (audit A1–A5, A8) |
| `src/research/CompareRoute.tsx` | 84 | 0 | `CompareRoute` (URL state `?mode=&runs=`, `setSearchParams` push) + `CompareResolverRoute` (route spec); `eeeae14f` +6/−6 (A10: mode lạ đi thẳng tới server) |
| `src/research/compareDetail.test.tsx` | 730 | 0 | 26 ID `S13-U01…U26` (U15 `each` 403/404 → 27 test); `009cedb8` +6/−3; `eeeae14f` +58 (U24–U26) |
| `src/features/quantbt/QuantBTModule.tsx` | 7 | 1 | Mount `alphas/:alphaId/compare` + `compare` **trước** `alphas/:alphaId/:version`; thêm vào regex `onReferenceRoute` |
| `src/research/LineageDetail.tsx` | 8 | 0 | Link "compare →" (`data-action="open-compare"`) cạnh `.ln-links` (VD-P20-18) + 1 dòng CSS `.ln-compare` |
| `src/research/RunLibrary.tsx` | 5 | 1 | CompareBar: `compareEntryHref(selected, sharedAlpha)` — thêm `alpha=` khi 2 run cùng `binding.alpha_id` |
| `src/research/researchBoundary.test.ts` | 1 | 0 | Thêm `compareClient.ts` vào allowlist network |
| `tsconfig.json` | 3 | 0 | Alias `@portal/contracts-research-compare` |
| **Tổng** | **2900** | **2** | 10 file, tất cả thuộc `apps/portal/frontend/**` |

Theo commit: `92cdc844` 4 file +480/−0 · `0910ecc3` 5 file +1643/−2 · `f3d6169d` 1 file +669/−0 · `009cedb8` 2 file +20/−13 · `034aef11` 1 file +11/−3 · `eeeae14f` 3 file +114/−21.

Không đụng backend, `packages/contracts/**`, OpenAPI, fixture canonical, migration, `apps/portal/strategy/**`, control-plane, deploy, `package.json` hay lock file.

Không có DTO tự định nghĩa, không parse prose lỗi, không tính số. Decimal in nguyên chuỗi; U22 grep `toFixed|Intl|parseFloat|Number(|toLocaleString|scrollIntoView|.sort(` trên 4 file S13 = 0 (chỉ `reportEquity.ts` đã có parse để vẽ SVG).

## 3. Route và link

| Hướng | Từ → tới | Điều kiện |
|---|---|---|
| Canonical | `/research/quantbt/alphas/{alphaId}/compare?mode=attempts\|markets\|pair&runs=a,b` | `mode` mặc định `attempts` (không có mode mà có 2 `runs` → pair, như server); đổi mode = push history; `runs` chỉ giữ ở pair (U17, U18; browser mode-switch Back×3) |
| Resolver (route spec §1) | `/research/quantbt/compare?alpha=&runs=&mode=` | Có `alpha=` → `Navigate` sang canonical; chỉ có `runs=` → trang designed + panel-local `RESOLVER_NEEDS_ALPHA`, 0 request (VD-P20-09; U19; browser resolver) |
| Vào | Run Library CompareBar → S13 | `compareEntryHref`: thêm `&alpha=<id>` khi 2 run cùng `binding.alpha_id`; khác alpha → không `alpha=` → resolver refusal (browser entry-links / entry-no-alpha) |
| Vào | Lineage (S10) root card "compare →" | `/research/quantbt/alphas/{alphaId}/compare` (browser entry-links) |
| Vào (không nối) | Evidence Flow (S04) | DTO S04 không có `alpha_id` → không thêm link (spec §1 inbound 04) |
| Ra | breadcrumb "Runs" | `/research/quantbt/runs?group=1&alpha={alphaId}` |
| Ra | "attempt lineage →" (meta + diff card) | `lineageHref(alphaId)` (S10) |
| Ra | run id trên card | `evidenceHref(run_id)` (S04) |
| Ra (không có) | 11 Release Candidate | Screen 11 chưa có route; không vẽ link |

## 4. Mapping hi-fi → component / `data-panel` → field contract → typed state → assertion

"Unit" là vitest `S13-Uxx`; "Browser" là gate probe trên product route (§5.2), 1280 và 660. Dòng RECEIPT nào cũng `overflow=0 noise=0 mutations=0 foreign=0`.

| Phần tử hi-fi | Component / `data-panel` | Field / operation | Typed state / absence | Unit | Browser |
|---|---|---|---|---|---|
| Breadcrumb + title + subtitle | `Header` / `header` | `alpha.name`; const `COMPARE_TITLE`, `COMPARE_SUBTITLE` (VD-11) | Mọi state; loading/refusal giữ đủ khối (`PendingBody`, "loading"/"withheld", 0 chữ số) | U01, U15, U16 | loading: 9 panel skeleton, `aria-busy`, 1 GET |
| Segment 3 mode | `.cp-segbtn[aria-pressed]` | URL `mode` → `researchCompareGetV1?mode=` | mode lạ: không nút nào pressed, server trả 400 → terminal | U17, U18 | mode-switch trail + Back×3; keyboard Tab/Enter, ring `:focus-visible` |
| (không có trong hi-fi) Dòng meta | `Meta` / `meta` | `read_authority`, `revision`, `as_of_utc_ms`, `result.coverage` / `pair.state`, `source_absences.*` | Pending khi chưa có response (VD-08) | U05, U21 | mọi mode |
| Banner "rule of this mode" attempts | `Rule` / `rule` (gold) | const `ATTEMPTS_RULE` (hi-fi verbatim) | — | U04 | attempts: `Read the ladder left to right` |
| Ladder header | `Ladder` / `ladder` | const `LADDER_HEADER` (spec §8) | — | U04 | attempts |
| Thẻ attempt (4 thẻ + mũi tên) | `LadderStep` / `LadderCard` `[data-ladder-order=server-reversed]` | `attempts[]` (thứ tự server, bày ngược), `attempt_id`, `run_state`, `run_id`, `alpha_version_label`, `claim.{family,rank,origin,text}` | claim NOT_PUBLISHED → absent + `P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED`; mũi tên "claim ↑ →" giữa thẻ (VD-14) | U02, U03 | DOM `[run_att_c, run_att_a, run_att_b]` = server `[b, a, c]` đảo; 2 mũi tên; 660 xếp cột, mũi tên xoay |
| Số OOS Sharpe lớn | `LadderCard` | `original_metrics[OOS_SHARPE].value` (chuỗi nguyên) + `scope` | NOT_PUBLISHED + `P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE` | U04 | attempts |
| cert chip / sched / status pill / note | `CertAbsent` / `RunLine` / `.cp-st` / note | pill = `run_state`; note = `claim.text` | cert → "not a field of the compare contract (CG-P20-03)"; sched → `CG-P20-02`; pill không phải ACTIVE/SUPERSEDED (`CG-P20-08`); note null → absent (VD-03) | U04 | attempts, markets |
| Coverage PARTIAL | chip `[data-coverage-partial]` | `coverage.{state,total_attempts,reason_code}` | `P20_BOUNDED_ATTEMPT_LIMIT_REACHED` + "140 attempts in total"; screen `partial` | U05 | attempts-partial |
| EChart 1 per-fold + toggle 5/32 | `FoldChart` / `fold-chart` | — | khung + caption hi-fi + absent `CG-P20-04`; không có toggle (VD-04) | U04 | attempts |
| Config diff table | `DiffCard` / `diff` | — | khung + header hi-fi, thân absent `CG-P20-05`; footer đổi "attempts.json" → `read_authority` (VD-05) | U04 | attempts |
| "what this trajectory says" | `TrajectoryCard` / `trajectory` | `trajectory.{template_id,text,availability}` | availability ≠ AVAILABLE → absent + reason | U04 | attempts |
| Banner rule markets (đỏ) | `Rule` (bad) | `result.caption` (server, = spec §8) + `MARKETS_RULE_TAIL` (VD-20) | — | U06 | markets: caption verbatim; không lặp "small multiples only" |
| Thẻ market (grid) | `MarketTile` / `markets` `[data-market-run]` | `run.comparison_contract_key.*`, `run_state`, `OOS_SHARPE`, `MAX_DRAWDOWN_FRACTION`, `claim` | key part null → "not published"; OOS absent + reason | U06 | 3 card: btc AVAILABLE, eth NOT_PUBLISHED, sol QUEUED; 1280 315×427 (C 457), 660 596 rộng |
| Mini equity | `MiniChart` (dùng lại `equitySvg`) | `chart.{state,sampling,source_observation_count,emitted_point_count,points[]}` | NOT_PUBLISHED → khung + `P20_P13_EQUITY_SERIES_NOT_AVAILABLE`; nhãn trục X chỉ đầu/cuối (`034aef11`) | U06 | receipt C: `[data-x-label]` ≤ 2 mỗi mini, không chồng (1280 và 660) |
| Pair selector demo | chip `A run / B run` | URL `runs` | read-only (VD-07) | U17 | pair |
| Guard key match / mismatch | `ComparableGuard` / `RefusedGuard` + `KeyParts` / `guard` | `pair.key` hoặc `refusal.left_key` / `right_key` (4 phần) | phần lệch `data-mismatch=true` tô đỏ bằng so sánh chỉ để hiển thị (VD-16); PARTIAL → `data-pair-partial-reason` | U07, U09, U10 | refused: mismatch rgb(180,58,58); pair-partial reason |
| Refusal card | `RefusalCard` / `refusal` | `refusal.{code,message}` (message in nguyên chuỗi server = spec §8) | 0 node chart/Δ/ρ/weaker/differences | U10 | refused: 0 node kể cả ẩn, không "ρ" |
| EChart 2 overlay | `OverlayFigure` / `overlay` `[data-pair-overlay]` | `overlay.{state,sampling,source_observation_count,emitted_point_count,points[{left_equity,right_equity}]}` | NOT_PUBLISHED hoặc điểm không parse được → khung absent; legend `run_id · label (claim.family)` | U07, U12 | lineA `#0f4c5c` liền, lineB `#9a6a1f` dash `6px, 4px` |
| Bảng delta 6 hàng | `DeltaTable` / `delta` `[data-delta-table]` | `common_window.metrics[]` (`left_value`, `right_value`, `delta`, `definition_id`); `original_metrics` cho hàng không có common window | Δ chỉ khi server có; header `Δ` + `B − A · as published` (VD-21); `data-sign` theo dấu, Δ bằng 0 không tô (`deltaSign`, VD-28); OOS Δ absent; TRADE_COUNT `NOT_APPLICABLE` + `P20_COMMON_WINDOW_DOES_NOT_DEFINE_TRADE_COUNT`; win rate absent `CG-P20-06` (VD-06, VD-13) | U07, U08, U24 | pair; TRADE_COUNT "Δ — not applicable"; zero-delta |
| Correlation card | `CorrelationCard` / `correlation` `[data-correlation]` | `correlation.{source_label,formula_id,formula_version,value,n,common_window_start/end,missing_policy,availability}` | NOT_PUBLISHED → "correlation not derived — {reason}" (VD-02) | U07, U09 | pair ρ = chuỗi server; corr-zero: `data-correlation-absent` + reason, không 0 |
| (spec §8) "the pair promotes under its weaker claim" | `WeakerClaim` / `weaker` | `weaker_claim.{family,rank,availability}` | absent + reason | U07 | pair |
| (handoff) Intentional differences | `Differences` / `differences` | `intentional_differences[]{path,before,after}` | rỗng → "no intentional specification difference published" | U07 | pair |
| Footer "rules of this screen" | `Rules` / `rules` | const `COMPARE_RULES` (VD-10) | mọi state | U04 | mọi gate |
| Refusal HTTP | `Notice` + `ResearchPanel` | HTTP status + `error.code` `RESEARCH_COMPARE_*` | 400 terminal · 401 denied · 403 = 404 denied (cùng câu F-04) · 503 unavailable + "read again" | U13, U15, U16 | 400/401/403/404/503: request id, không in prose server |
| ETag / 304 | `useCompare` | `etag` → `If-None-Match` | 304 giữ revision | U14 | etag-304: `If-None-Match "p20r1_aaa…"` → 304 |
| Stale response | `useCompare` sequence guard | — | response cũ về sau bị bỏ | U17 | stale: chỉ `run_new_*`, revision `p20r1_888…` |
| Pair thiếu 2 run | `PAIR_NEEDS_TWO` | — | idle, 0 request (VD-12) | U11 | pair-needs-two: 0 GET |

## 5. Evidence

### 5.1 Test lanes (`apps/portal/frontend`, Node v20.20.2, head `eeeae14f`, receipt gói C-2 2026-09-24)

| Lane | Lệnh | Exit | Kết quả |
|---|---|---:|---|
| Typecheck | `npx tsc -b --noEmit` | 0 | PASS (log rỗng `e3b0c44298fc1c14`) |
| Build | `npm run build` | 0 | PASS, built 8.92 s; chỉ cảnh báo chunk > 500 kB có từ trước (`build.log` `569dbfc7f20e563b`) |
| Unit toàn bộ | `npx vitest run` | 0 | **172 file · 3094 pass · 1 skip** (3095), 98.85 s, pass lượt đầu, không flake PortalShell (`vitest-full.log` `efddb2da599ef1e1`) |
| Unit S13 + boundary | `npx vitest run src/research/compareDetail.test.tsx src/research/researchBoundary.test.ts` | 0 | **41/41** = S13 27 (`S13-U01…U26`, U15 × 2) + boundary 14 (`vitest-s13.log` `38bbc27ad19da8d6`) |
| Browser toàn Research | `RESEARCH_SHOT_DIR=… P20_SHOT_DIR=… npx playwright test -c .tv-probe.config.ts --workers=1` | 0 | **162/162** lượt đầu (fixtures 8, product 74, tvp20 80), 4.4 phút, 0 fail / 0 flaky (`playwright.log` `fe151f443fd274a5`, `probe-final2.log` `35e3038508ed11ad`) |

Receipt gói C trên `034aef11` (thay bởi bảng trên): tsc 0, build 0 (7.42 s, `1241fc832ec41153`), vitest 172 file · 3091 pass · 1 skip (`930b33c9aaf5b2af`), S13 + boundary 38/38 (`0fbf78d732eee597`), probe Research 128/128 (tvp20 46, `53a7fafab986e143` / `bca957cdd7e225b5`), chỉ theme sáng.

Lịch sử (gói A/B, không phải receipt cuối):
- Gói A trên `7dfb8d0f` (= `f3d6169d` trước khi đổi trailer): tsc 0, build 0, vitest 172 file · 3091 pass · 1 skip; S13 38/38. Lượt full đầu có 2 fail do code S13 (token gate `color-mix`/hex trong comment → VD-19; S10-U49 link nằm trong `.ln-links` → VD-18), sửa trước commit.
- Gói B trên `009cedb8`: probe toàn Research 128/128 (`playwright.log` `88821e5770640add`, `probe.log` `efe31217803b55eb`); vòng 1 probe P20 44/46 do stub của probe (entry-links), sửa probe, không sửa src.

Môi trường browser: Playwright 1.62.1, Chromium headless. Preview `vite preview --port 4417 --strictPort --host 127.0.0.1` riêng của workspace, dựng từ build trên; gói C-2 PID `1227101 1227159 1227160` (npm exec, sh, node vite) đã kill theo PID cụ thể (gói C: `473200 473232 473233`); `ss -ltnp | grep 4417` rỗng. Không đụng preview 4317–4320 (vẫn listen sau khi dọn).
- Spec probe tạm + config tạm, **không commit, đã xoá**; `git status --short` rỗng, HEAD vẫn `eeeae14f`.
- Gói C-2 sửa spec tạm cho code sau audit và thêm gate: (a) `[data-delta-direction]` = `B − A · as published`, hàng OOS không có "stitched", số trong foot đều mono; (b) Δ `"0"` / `"-0.0000"` không có `data-sign`; (c) pair-partial foot = `definition_id · common window not published · <reason>`, không "matched", không `[data-overlay-meta]`; (d) markets `[data-mini-meta]` chỉ ở card AVAILABLE (btc 1 · eth 0 · sol 0), không "emitted 0"; (e) resolver `mode=foo` → canonical `?mode=foo` + 400 terminal; và 15 case theme tối (`data-theme=operations`) × 2 viewport. Mọi RECEIPT quét leaf chữ số trần (`bare`) ngoài `.num`/mono.
- Probe vòng 1 của gói C-2: 76 pass / 4 fail (zero-delta 1280/660 sáng + tối) vì phép quét `bare` bắt chính ô Δ `"0"` server công bố — lỗi của probe, không phải code; bỏ `[data-delta-value]` khỏi phép quét, vòng 2 8/8, rồi chạy toàn bộ 162/162. Spec dùng cho C-2: `1741ddd61264b05d`; config `2a7e46a01bf64f1c`.

### 5.2 Browser receipt — `PRODUCT_ROUTE_BROWSER_RECEIPT` (API stub)

Route `/research/quantbt/alphas/alpha-momentum-btc/compare`. Stub `page.route("**/api/v1/research/alphas/*/compare*")` + `stubPortalApi(page,"healthy")`. Body dựng theo `research-compare.d.ts`; reason code, câu `caption`/`refusal.message`/`trajectory.text` lấy từ `compare.service.ts`.

Đếm (gói C-2, sửa audit C2): spec tvp20 có **80 test** = 25 test sáng × 2 viewport (23 gate có dòng RECEIPT + 2 test đo: hi-fi capture, product geometry) + 15 gate tối × 2. Log có **76 RECEIPT** = 23 × 2 (`theme=research`) + 15 × 2 (`theme=operations`). Bảng dưới có đúng 23 hàng gate sáng + 1 hàng test đo; cột "Tối" đánh dấu 15 gate chạy thêm ở theme tối. (Receipt C cũ ghi "42 RECEIPT, 21 gate × 2" trong khi bảng có 19 hàng và spec có 46 test — sai đếm, đã sửa ở đây.)

Tổng 76 RECEIPT: overflow > 0: **0** · console noise > 0: **0** · mutations > 0: **0** · foreign > 0: **0** · bare > 0: **0** · `OVERFLOW-CULPRIT`: 0. `document.documentElement.scrollWidth − innerWidth ≤ 0` ở mọi RECEIPT. Console chỉ có lỗi mạng đã khai báo của chính request bị stub (1 ở mỗi refusal, 2 ở etag-304 và resolver-badmode). Poll legacy `GET /api/runs` bị loại khỏi đếm (1–3 lần mỗi test, B5 P19).

| # | Gate | 1280 | 660 | Tối | Assertion chính |
|---|---|---|---|---|---|
| 1 | loading | PASS | PASS | PASS | `data-compare-state=loading`, `aria-busy`, 9 panel skeleton, 1 GET |
| 2 | attempts COMPLETE | PASS | PASS | PASS | rank 3, 3, null; DOM = server đảo; 2 mũi tên, aria "claim strengthens along the ladder" (A8); banner hi-fi verbatim |
| 3 | attempts PARTIAL | PASS | PASS | PASS | `partial` + coverage reason, không 0 |
| 4 | markets 3 card | PASS | PASS | PASS | 3 `data-market-run`; caption verbatim; không overlay/Δ; mini `[data-x-label]` = 2 / 0 / 0, overlap false; **`[data-mini-meta]` btc 1 · eth 0 · sol 0, không "emitted 0"** (gate d) |
| 5 | pair AVAILABLE | PASS | PASS | PASS | 2 màu `rgb(15,76,92)` / `rgb(154,106,31)` dash (tối: `rgb(127,179,196)` / `rgb(212,167,94)`, token theo theme); delta 6 hàng; **`[data-delta-direction]` = `B − A · as published`, hàng OOS không "stitched", nonMono 0** (gate a); foot `matched 398 · A source 400 · B source 410 · …` mono; ρ chuỗi server; weaker claim; TRADE_COUNT NOT_APPLICABLE |
| 6 | pair PARTIAL | PASS | PASS | PASS | `data-pair-partial-reason`; **foot = `research.compare-common-window.v1 · common window not published · P20_CURRENT_SOURCE_SEAL_DOES_NOT_MATCH_P14_AND_RUN_BINDINGS`, không "matched"; correlation meta chỉ `missing_policy`; không `[data-overlay-meta]`** (gate c) |
| 7 | pair REFUSED | PASS | PASS | PASS | 0 node overlay/delta/correlation/svg (kể cả ẩn); keypart lệch rgb(180,58,58); `data-compare-state=available` (debt `S13-REFUSED-STATE-ATTR`) |
| 8 | correlation zero-variance | PASS | PASS | PASS | `data-correlation-absent` + reason; không số ρ, không 0 |
| 9 | **zero delta** (mới) | PASS | PASS | PASS | NET_RETURN Δ `"0"` và MAX_DD Δ `"-0.0000"`: `data-sign` null, màu ink thường (gate b, A2) |
| 10 | etag 304 | PASS | PASS | — | GET thứ ba gửi `If-None-Match` → 304 giữ revision; 503 → "read again" phục hồi; 5 GET |
| 11–15 | 400 / 401 / 403 / 404 / 503 | PASS | PASS | PASS | terminal / denied / denied / denied (câu = 403) / unavailable + retry; request id; không in prose server |
| 16 | deep link + hard refresh | PASS | PASS | — | `?runs=` sống qua reload, 2 GET |
| 17 | mode switch | PASS | PASS | — | trail pair → attempts → pair (idle, `PAIR_NEEDS_TWO`, 0 request) → markets → Back → pair&runs; **5 GET ở cả 1280 và 660** (attempts đọc lại 200 không `If-None-Match`, debt `S13-BACK-REFETCH`) |
| 18 | stale response | PASS | PASS | — | response cũ về sau bị bỏ |
| 19 | resolver runs-only | PASS | PASS | — | `alpha=` → canonical; chỉ `runs=` → empty + lý do, 0 GET compare |
| 20 | **resolver bad mode** (mới) | PASS | PASS | PASS | `?alpha=…&mode=foo` → `?mode=foo`; có `runs` → `?runs=run_pair_a,run_pair_b&mode=foo`; server 400 → terminal, request id `req_p20_400` (gate e, A10) |
| 21 | keyboard | PASS | PASS | — | Tab: 3 segment → "attempt lineage →" → run; ring 2px paper + 4px `#0f4c5c`; Enter đổi mode |
| 22 | reduced motion | PASS | PASS | — | `getAnimations` running 0 |
| 23 | entry links | PASS | PASS | — | CompareBar href có `alpha=`; 2 alpha → không `alpha=`; Lineage "compare →" = canonical |
| — | hi-fi capture + product geometry (2 test, không RECEIPT) | PASS | PASS | — | đo §5.4 |

Ảnh và log **không commit** (A4.1); ở `~/tv-shots/p20/final2/` (receipt C-2, 90 ảnh P20 + 2 jsonl refusal + 40 ảnh Research khác), `~/tv-shots/p20/final/` (receipt C) và `~/tv-shots/p20/` (gói B). SHA-256 16 hex đầu (receipt C-2):

| File | SHA-256 | File | SHA-256 |
|---|---|---|---|
| `p20-attempts-1280.png` | `35ad99e226e1b703` | `p20-attempts-660.png` | `351f61018572b762` |
| `p20-markets-1280.png` | `b3f302663293a836` (C `45fc7c0bfd3d4e17`; gói B `575e025b89d9cd86`) | `p20-markets-660.png` | `7aeb60f13a2bdfba` (C `7eed8cfcfe2c5734`) |
| `p20-pair-1280.png` | `e15641b5be08dd36` (C `60131ffb36e9b7c0`) | `p20-pair-660.png` | `af6d612599a22561` (C `fff3a3a4d4e4d3c3`) |
| `p20-pair-partial-1280.png` | `3809e2e1fe99c44c` | `p20-pair-partial-660.png` | `41952b202bcf0e0b` |
| `p20-zero-delta-1280.png` | `06f1c0666143f236` | `p20-zero-delta-660.png` | `d1851900f8bf3ecd` |
| `p20-resolver-badmode-1280.png` | `48ccc0645040f00a` | `p20-resolver-badmode-660.png` | `0c36d569db77857e` |
| `p20-refused-1280.png` | `bc4f2e64b18ef917` | `p20-refused-660.png` | `c5e19439efcc6d83` |
| `p20-corr-zero-1280.png` | `07ca0235ae1d81e2` | `p20-corr-zero-660.png` | `b77e51f6364d7641` |
| `p20-loading-1280.png` | `97b3e40bde919ea4` | `p20-loading-660.png` | `3a7e2b479ac3798c` |
| `p20-dark-pair-1280.png` | `7201ec666b2e8ab2` | `p20-dark-pair-660.png` | `599dd588cf73dbcc` |
| `p20-dark-pair-partial-1280.png` | `5029acff9e4c5a4b` | `p20-dark-pair-partial-660.png` | `8ec2e642613ecbf5` |
| `p20-dark-markets-1280.png` | `3bbeb2fbb86ce04b` | `p20-dark-markets-660.png` | `f90c843f55692c2c` |
| `p20-dark-attempts-1280.png` | `1128a328a9423c67` | `p20-dark-attempts-660.png` | `bbc82956ba674db4` |
| `p20-dark-refused-1280.png` | `cab0aeb46adc9508` | `p20-dark-refused-660.png` | `8abd430e6caca28c` |
| `p20-dark-zero-delta-1280.png` | `a941e31fed2bc843` | `p20-dark-zero-delta-660.png` | `29c4349272802d02` |

Danh sách đầy đủ (90 ảnh P20 + log) ở [thanhvuong-test-results.json](./thanhvuong-test-results.json) `evidence_store`.

### 5.3 Spec 13 test matrix (T01–T11)

| Spec | Nội dung | Trạng thái |
|---|---|---|
| T01 | attempts ladder sort đúng bậc | **Một phần:** thứ tự là của server (rank asc → NET_RETURN desc → created → run_id), spec §5 ghi "rank asc → OOS desc" — khoá thứ hai lệch, hỏi `CG-P20-11`; FE không sort; bày ngược để đọc weak→strong như hi-fi (VD-14, Bobby quyết). Contract hôm nay chỉ phát `WALK_FORWARD_OOS_COMPATIBILITY` (rank 3) hoặc `NOT_PUBLISHED`, nên fixture spec §10 (rank 1,1,2,3,4) không dựng được từ source thật; `CLAIM_RANK_MAP` đủ 5 family (U03) |
| T02 | trajectory card verbatim | **Có:** `trajectory.text` server in nguyên (U04) |
| T03 | markets không overlay + caption | **Có** (U06; browser markets) |
| T04 | pair match → overlay + delta | **Có** (U07; browser pair) |
| T05 | mismatch → refusal verbatim, không chart | **Có** (U10; browser refused) |
| T06 | correlation absent note | **Có về hành vi**, copy khác spec (VD-02: "correlation not derived — {reason}") |
| T07 | "promotes under weaker claim" đúng | **Có** (U07) |
| T08 | deep-link `?runs=` từ 01 | **Có** khi 2 run cùng alpha (CompareBar thêm `alpha=`); khác alpha → resolver refusal (VD-09) |
| T09 | 660 px | **Có:** overflow 0 mọi state |
| T10 | axe | **Chưa chạy** (axe-core không có trong lock, B4) |
| T11 | copy diff 0 | **Không đạt 0:** các lệch copy có chủ đích VD-01/02/10/11/13/20/21/25/26/29 chờ Bobby (B2); banner attempts và footer còn giữ copy hi-fi verbatim mà audit A6/A7 thấy sai với dữ liệu (§12) |

### 5.4 So hi-fi với product (1280 / 660)

Hi-fi `upgrade/research_loop/release-v1.1/QuantBT 13 Compare.dc.html` mở `file://` (ECharts từ CDN, canvas render). So ở mức bố cục + copy, không pixel-diff.

| View | Hi-fi 1280 | Hi-fi 660 |
|---|---|---|
| attempts | `p20-hifi-attempts-1280.png` `1c5738b9461de0d9` | `8712c51178e09428` |
| markets | `p20-hifi-markets-1280.png` `46d95ea9d38f9a22` (gói B; lượt C `1a50dc5bc45e5cb4`, canvas ECharts không tất định) | `dac9c9441b31a71a` |
| pair legal | `p20-hifi-pair-legal-1280.png` `d298726fe3d42ab5` | `1f93babdce9adc2f` |
| pair refused | `p20-hifi-pair-refused-1280.png` `a5619a73dfaf3555` | `e06fe613bdb35fa3` |

Bảng lệch (gói B, G1–G18; G19 thêm sau audit; cột ledger đã đối chiếu lại với §6 sau audit):

| # | Vùng | Hi-fi | Product | Ảnh hi-fi / product | Ledger |
|---|---|---|---|---|---|
| G1 | Header | Title 1 dòng; segmented control **dưới** subtitle | Title 2 dòng; segmented control **bên phải**, cùng hàng subtitle; phía trên có module header "QuantBT Backtest" | hifi-attempts-1280 / attempts-1280 | **VD-P20-22** (sau audit; trước là debt `S13-G1-HEADER-LAYOUT`); module header thừa do nhánh chưa có DQ-01 (`8bd81b01`, B1) |
| G2 | Meta strip | Không có | Dòng meta mono | — / attempts-1280 | VD-P20-08 |
| G3 | Ladder | 4 thẻ (3 SUPERSEDED + ACTIVE full-width), 3 mũi tên, số lớn 1.31/1.24/1.19, cert chip | 3 thẻ (số thẻ = dữ liệu), 2 mũi tên; OOS absent + reason; cert absent `CG-P20-03` | hifi-attempts-1280 / attempts-1280 | VD-P20-03, VD-P20-14; field-driven |
| G4 | Ladder label | Không có | "SERVER ORDER, READ RIGHT TO LEFT · 3 RETURNED" | — / attempts-1280 | VD-P20-14 |
| G5 | Fold chart | Bar 4 series, toggle 5/32 folds | Khung absent `CG-P20-04`, không toggle | hifi-attempts-1280 / attempts-1280 | VD-P20-04 |
| G6 | Config diff / trajectory | Bảng KEY; trajectory tường thuật có số | Absent `CG-P20-05`; trajectory = `trajectory.text` server | hifi-attempts-1280 / attempts-1280 | VD-P20-05, VD-P20-15 |
| G7 | Markets card | ~320×258, mini chart 3 màu, sharpe/maxdd/cert một hàng | 315×427 (C 457): 1 màu accent, ETH/SOL khung absent, dòng sampling, sharpe absent + reason, cert absent, claim | hifi-markets-1280 / markets-1280 | VD-P20-03 (field-driven); chiều cao là hệ quả của absence có lý do |
| G8 | Markets banner | "Three different ComparisonContractKeys — …" | caption server + đuôi hi-fi, **đã bỏ cụm lặp** ở `034aef11` | hifi-markets-1280 / markets-1280 | VD-P20-20, VD-P20-25 (bỏ cả câu "Three different ComparisonContractKeys…") |
| G9 | Mode label 3 | "two alphas, one key" | "two runs, one key" | tất cả | VD-P20-01 |
| G10 | Pair selector | Toggle demo 2 cặp | Chip A/B từ URL | hifi-pair-legal-1280 / pair-1280 | VD-P20-07 |
| G11 | Guard legal | Key inline trong câu, "AND the same claim class (STRICT, B)" | 4 chip key (spec §4/§7 `.cp-keypart`); câu bỏ "both alphas" + claim class demo | hifi-pair-legal-1280 / pair-1280 | VD-P20-01 (câu); chip = spec §4 |
| G12 | Overlay | Rebased 100, trục 90–115, 2 series STRICT (B) | Điểm retained server (không rebase: FE không tính), legend kèm claim; dòng sampling | hifi-pair-legal-1280 / pair-1280 | VD-P20-01 (caption), VD-P20-27 (trục y 2 nhãn); không rebase = rule "FE không tính" |
| G13 | Delta table | Tiêu đề "ENGINE-PUBLISHED" | 6 hàng, "SERVER-PUBLISHED", OOS/win rate absent, trades Δ NOT_APPLICABLE | hifi-pair-legal-1280 / pair-1280 | VD-P20-06, VD-P20-13, VD-P20-21 (hướng Δ), VD-P20-28 (màu theo dấu), VD-P20-29 ("(stitched)") |
| G14 | Correlation card | "ρ = 0.18", engine-published, đoạn diễn giải | "ρ = 0.1834" (chuỗi server), PORTAL_DERIVED + method + window; card cao bằng bảng delta (grid stretch) | hifi-pair-legal-1280 / pair-1280 | VD-P20-02, VD-P20-26 (caption → meta); không làm tròn = rule chuỗi nguyên |
| G15 | Weaker claim / differences | Không có | Banner WEAKER CLAIM + bảng intentional differences | — / pair-1280 | VD-P20-23 (handoff "Required rich composition" + spec §8 promotes-under) |
| G16 | Refused | Mismatch chỉ trong câu; 2 đoạn | Hàng key A/B (phần lệch đỏ) + reason code; 4 đoạn | hifi-pair-refused-1280 / refused-1280 | VD-P20-16; key parts = spec §4 + handoff "four returned key parts" |
| G17 | Footer rules | "correlation is engine-published… the UI checks equality" | "Portal-derived from sealed raw returns… the UI never constructs or compares one; the server refuses" | tất cả | VD-P20-10 |
| G19 | Dòng phụ | Không có | route·protocol dưới header, dòng sampling ở card markets, figcaption sampling overlay, foot common-window dưới bảng delta | hifi-markets-1280 / markets-1280; hifi-pair-legal-1280 / pair-1280 | VD-P20-24 |
| G18 | 660 | Hi-fi **không responsive**: tràn ngang 72 px (attempts) / 55 px (markets, pair legal, refused); rộng tài liệu 715–732 | Product xếp 1 cột, overflow 0 | hifi-*-660 / *-660 | hi-fi không có chuẩn 660; product theo §26 |

Chiều cao tài liệu (px), receipt C-2 trên `eeeae14f` (markets thấp hơn vì card NOT_PUBLISHED không còn dòng meta; pair cao hơn vì nhãn hướng Δ và foot mono):

| Viewport | Nguồn | attempts | markets | pair legal | refused |
|---|---|---|---|---|---|
| 1280 | hi-fi | 1207 | 900 | 962 | 900 |
| 1280 | product | 1343 | 1010 (C 1040) | 1703 (C 1682) | 900 |
| 660 | hi-fi | 2026 | 1455 | 1370 | 900 |
| 660 | product | 2035 | 1724 (C 1762) | 1955 (C 1946) | 1034 |

## 6. Visual decision ledger `VD-P20-01…29`

Nguồn: 01–10 từ plan P20 §0.2; 11–19 phát hiện ở gói A; 20 từ commit `034aef11`; 21–29 từ audit độc lập (mục B của audit + A1/A2/A5, xem §12). Mỗi VD cũng có ở comment đầu `CompareDetail.tsx`, ở [handoff addendum](./frontend-handoff-claude.md#thanhvuong-addendum--nợ-mới-p20-cho-các-phase-sau-2026-09-24) và ở note Unified.

| VD | Hi-fi | Contract / spec | Quyết định trong code | State |
|---|---|---|---|---|
| `VD-P20-01` | Mode 3 "two alphas, one key"; EChart 2 "Two alphas, one key — … both claims STRICT (B)"; guard "both alphas…"; footer "Two alphas on one key" | Pair = 2 run **cùng Alpha** (spec §1/§6 cross-alpha ngoài scope) | Giữ vị trí/hình hi-fi; copy "two runs, one key", `OVERLAY_TITLE` "Two runs, one key — overlay from retained points", `GUARD_MATCH` bỏ "both alphas" + key demo | `REQUIRES_BOBBY_DECISION` (đề xuất sửa hi-fi ở version mới) |
| `VD-P20-02` | Correlation "comparison.json · engine-published"; spec §8 "correlation artifact absent — the engine did not publish one for this pair." | `source_label=PORTAL_DERIVED` + formula/version/n/window/missing policy; handoff: "not engine-published" | Card giữ hình hi-fi; meta in `PORTAL_DERIVED · formula · version · n · window · missing_policy`; absent → "correlation not derived — {reason_code}" | `REQUIRES_BOBBY_DECISION` (spec copy sai với contract) |
| `VD-P20-03` | Ladder/market card: cert B/C chip, sched "mode_1 × global", pill ACTIVE/SUPERSEDED, note tự do | Run không có cert, schedule, lifecycle ACTIVE/SUPERSEDED; `claim.text` nullable | cert → absent `CG-P20-03`; sched → absent `CG-P20-02`; pill = `run_state` (`CG-P20-08`); note = `claim.text` hoặc absent; không viền ACTIVE (không suy diễn) | field-driven (`CG-P20-02/03/08`) |
| `VD-P20-04` | EChart 1 "OOS Sharpe per fold, per attempt" + toggle 5/32 folds | Không có per-fold | Khung + caption hi-fi + absent `CG-P20-04`; không dựng toggle demo | field-driven (`CG-P20-04`) |
| `VD-P20-05` | Config diff ở attempts ("gold = differs from ACTIVE att_03", footer "…from attempts.json") | `intentional_differences` chỉ có ở pair | Khung + header hi-fi, thân absent `CG-P20-05`; footer "attempts.json" → `PORTAL_PERSISTED_RESEARCH` | field-driven (`CG-P20-05`) |
| `VD-P20-06` | Delta 6 hàng (OOS stitched, total return, max dd, trades, win rate, claim class) "engine-published" | `common_window.metrics` 3 key; `original_metrics` 5 key theo run (scope P13, không Δ); không có win rate | Giữ 6 hàng + cột A/B/Δ; Δ chỉ từ `common_window`; hàng chỉ có original → A/B + scope, Δ absent; win rate absent `CG-P20-06`; claim class = `family (rank)` mỗi bên, Δ = `weaker_claim` | field-driven (`CG-P20-06`) |
| `VD-P20-07` | Pair sub-toggle "vs delta_rsi_v2 · same key / vs R-TT-002 · mismatched" | Cặp chọn bằng URL `runs=` | Không dựng toggle demo; chip 2 run id đọc từ URL | demo control |
| `VD-P20-08` | Không có dòng disclosure | Handoff "comparison state faithful"; S10 có panel counts (debt `S10-COUNTS-PANEL` chờ Bobby) | Một dòng meta mono dưới header (`read_authority · revision · as_of · coverage · source_absences`) | `AWAITING_DECISION` (cùng nhóm S10-COUNTS-PANEL, B3) |
| `VD-P20-09` | Route `/research/quantbt/compare?runs=a,b` hoặc `?alpha=&mode=` | Contract cần `alphaId` trong path | Canonical `/research/quantbt/alphas/:alphaId/compare?mode=&runs=`; route spec giữ làm resolver | route |
| `VD-P20-10` | Footer "rules of this screen" verbatim ("Two alphas", "engine-published", "the UI checks equality, it never constructs one") | Portal-derived; key do server so | Giữ verbatim trừ: "Two runs on one key", "correlation is Portal-derived from sealed raw returns", "the UI never constructs or compares one; the server refuses". **Chưa phủ (audit A7):** cụm "only the ACTIVE node may promote" vẫn in, dù màn không có node ACTIVE (`VD-P20-03`, `CG-P20-08`); giữ verbatim theo rule 2026-09-24 (`COMPARE_RULES` `CompareDetail.tsx:151`), Bobby quyết | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-11` | Subtitle "Two ideas on one key overlay…" | Như VD-01 | "Two runs on one key overlay…" (plan yêu cầu subtitle verbatim) | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-12` | Không có state pair thiếu run | Pair cần đúng 2 id | Không gửi request; panel-local `PAIR_NEEDS_TWO` + link Runs, khung giữ nguyên | rule over hi-fi |
| `VD-P20-13` | Delta header "engine-published; the UI subtracts nothing else" | Common window do Portal tính | "metric deltas — server-published; the UI subtracts nothing" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-14` | Ladder weak → strong trái sang phải, mũi tên "claim ↑ →", rule "Read the ladder left to right: the number falls as the claim strengthens" | Server trả strong → weak (rank asc) | `009cedb8`: bày mảng server **đảo ngược** (`data-ladder-order=server-reversed`, không sort theo số), mũi tên + rule hi-fi verbatim, nhãn "server order, read right to left · N returned" | `REQUIRES_BOBBY_DECISION` (spec T01 "sort đúng bậc" + contract order vs hướng đọc hi-fi) |
| `VD-P20-15` | Tag "EChart N" và đoạn tường thuật demo có số | Không có field tường thuật (chỉ `trajectory.text`) | Không in tag và narrative demo. **Chưa phủ (audit A6):** banner attempts vẫn in câu demo có số "a retrospective 1.31 does not beat a strict 1.19" (`ATTEMPTS_RULE` `CompareDetail.tsx:104`) trên dữ liệu không có hai số đó; giữ verbatim theo rule 2026-09-24, Bobby quyết | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-16` | Mismatch chỉ nằm trong câu | Spec §4/§7: chip 4 phần, phần lệch đỏ; handoff: không so key ở browser | Tô đỏ bằng so sánh `===` từng phần **chỉ để hiển thị**; từ chối là của server (`state=REFUSED`) | rule over hi-fi |
| `VD-P20-17` | Claim chip không có origin | `claim.origin` (`PORTAL_DERIVED_FROM_SOURCE_PROTOCOL`) | Dòng mờ `origin {claim.origin}` dưới chip | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-18` | S10 root card có đúng 3 link hi-fi | S13 cần lối vào từ S10 | "compare →" đặt **cạnh** `.ln-links` (span `.ln-compare`), không nằm trong; S10-U49 khoá 3 link | route |
| `VD-P20-19` | Chip rank 3 amber nhạt; nền card correlation tint | Token gate U02 cấm `color-mix()` / raw color ngoài file token | Rank 3 `var(--warn)`; nền correlation `var(--accent-soft)` | rule over hi-fi |
| `VD-P20-20` | Banner markets "…Small multiples only: read shapes and claims side by side…" | Caption server (spec §8) đã có "small multiples only" | `034aef11`: đuôi banner bỏ cụm "Small multiples only:" lặp | `REQUIRES_BOBBY_DECISION` (copy hi-fi) |
| `VD-P20-21` | Bảng delta đọc **A − B** (1.19 / 1.12 → `+0.07`; 214 / 342 → `−128`), header chỉ "Δ" | Server `compare.service.ts:393` `subtractDecimal(left, right)` trả `right − left` = **B − A** (comment :395 ghi `right - left`); d.ts không có field hướng | `eeeae14f` (A1): header `Δ` + nhãn phụ `B − A · as published` (`[data-delta-direction]`, `CompareDetail.tsx:1253`); in chuỗi server, **không** tính lại theo A − B. Hướng chờ `CG-P20-09` | `REQUIRES_BOBBY_DECISION` (hướng hi-fi vs contract). Ảnh: `p20-hifi-pair-legal-1280.png` `d298726fe3d42ab5` vs `p20-pair-1280.png` `e15641b5be08dd36` |
| `VD-P20-22` | Title 1 dòng (h 22 px ở 1280); segmented control **dưới** subtitle | Không có field; bố cục | Seg cùng hàng subtitle (bên phải), title co và xuống 2 dòng ở 1280. Trước audit là debt `S13-G1-HEADER-LAYOUT` chưa có VD | `REQUIRES_BOBBY_DECISION` (layout). Ảnh: `p20-hifi-attempts-1280.png` `1c5738b9461de0d9` vs `p20-attempts-1280.png` `35ad99e226e1b703` |
| `VD-P20-23` | Không có khối "weaker claim" và bảng "intentional specification differences" | Handoff "Required rich composition"; spec §8 "the pair promotes under its weaker claim"; `pair.weaker_claim`, `pair.intentional_differences` | Hai khối render ở pair (G15) | `REQUIRES_BOBBY_DECISION` (khối không có trong hi-fi). Ảnh: `p20-hifi-pair-legal-1280.png` `d298726fe3d42ab5` vs `p20-pair-1280.png` `e15641b5be08dd36` |
| `VD-P20-24` | Không có dòng phụ | Disclosure sampling/count/route theo contract | Dòng route·protocol dưới header; dòng `sampling … emitted … of … source observations` ở card markets (chỉ khi chart AVAILABLE, sau A4); figcaption sampling ở overlay; foot common-window dưới bảng delta (G19) | `REQUIRES_BOBBY_DECISION` (copy/layout). Ảnh: `p20-hifi-markets-1280.png` `1a50dc5bc45e5cb4` vs `p20-markets-1280.png` `b3f302663293a836`; pair như trên |
| `VD-P20-25` | Banner markets có câu "Three different ComparisonContractKeys — overlay and Δ columns are REFUSED by design." | Caption server (spec §8) nói no-overlay; số key khác nhau là dữ liệu, không phải hằng | `MARKETS_RULE_TAIL` (`CompareDetail.tsx:112`) bỏ cả câu này (VD-20 chỉ ghi bỏ "Small multiples only:") | `REQUIRES_BOBBY_DECISION` (copy). Ảnh: `p20-hifi-markets-1280.png` `1a50dc5bc45e5cb4` vs `p20-markets-1280.png` `b3f302663293a836` |
| `VD-P20-26` | Correlation có sub-caption "daily OOS returns · overlapping window only" cạnh ρ | Contract cho `formula_id`, `n`, window, `missing_policy` (raw return, không phải daily OOS) | Sub-caption thay bằng dòng meta `n · window · missing_policy` (mono, A3); NOT_PUBLISHED chỉ in `missing_policy` (A4) | `REQUIRES_BOBBY_DECISION` (copy). Ảnh: `p20-hifi-pair-legal-1280.png` vs `p20-pair-1280.png` |
| `VD-P20-27` | Overlay có 5 gridline có nhãn (90…115) | FE không rebase/tính; dùng lại `equitySvg` (S09) | Trục y chỉ 2 nhãn max/min từ điểm server | `REQUIRES_BOBBY_DECISION` (chart). Ảnh: `p20-hifi-pair-legal-1280.png` vs `p20-pair-1280.png` |
| `VD-P20-28` | Δ tô theo **tốt/xấu** (`good`) | FE không suy diễn "tốt hơn" (CLAUDE.md §3.5) | Δ tô theo **dấu** (`data-sign` pos/neg); `eeeae14f` (A2, `deltaSign` `CompareDetail.tsx:1168`): Δ bằng 0 (`"0"`, `"-0.0000"`) không tô | `REQUIRES_BOBBY_DECISION`. Ảnh: `p20-zero-delta-1280.png` `06f1c0666143f236`, `p20-pair-1280.png` `e15641b5be08dd36` |
| `VD-P20-29` | Hàng "OOS sharpe (stitched)" | Giá trị là `original_metrics.OOS_SHARPE` theo scope P13, không phải stitched common-window (`CG-P20-06`) | `eeeae14f` (A5, `CompareDetail.tsx:1185`): nhãn "OOS sharpe" | `REQUIRES_BOBBY_DECISION` (copy). Ảnh: `p20-hifi-pair-legal-1280.png` vs `p20-pair-1280.png` |

## 7. Discrepancy

| # | Mục | Nguồn A | Nguồn B | Đang làm | Loại |
|---|---|---|---|---|---|
| D1 | Route | Spec §1 `/research/quantbt/compare?runs=a,b` hoặc `?alpha=&mode=` | Contract `GET /alphas/{alphaId}/compare` | Canonical trong Alpha + resolver (VD-09) | route |
| D2 | Pair cùng alpha | Hi-fi "two alphas" (mode, chart, guard, footer, subtitle) | Contract + spec §6: 2 run cùng Alpha | Copy theo contract (VD-01/11) | `REQUIRES_BOBBY_DECISION` |
| D3 | Correlation | Spec §4/§8 "engine-published", "the engine did not publish one" | `PORTAL_DERIVED`; handoff "not engine-published" | Copy theo contract (VD-02/10/13) | `REQUIRES_BOBBY_DECISION` |
| D4 | Fixture alpha id | Fixture frontend `e2e/research-foundation/run-library.json` dùng `alpha_momentum_btc` (gạch dưới) | Regex compare `^[a-z][a-z0-9-]{2,63}$` | CompareBar tạo `alpha=alpha_momentum_btc` → server thật sẽ 400; S13 không sửa fixture | `CG-P20-07` |
| D5 | Hi-fi ECharts | Hi-fi dùng echarts (CDN) | Plan: SVG tĩnh, không thêm dependency | Dùng lại `equitySvg` (S09); không có tooltip ECharts | ghi, không phải VD mới (chart production contract v0.5 §12 giữ) |
| D6 | Claim family | Spec §9/§10 fixture rank 1,1,2,3,4 | Source hôm nay chỉ `WALK_FORWARD_OOS_COMPATIBILITY` (rank 3) / `NOT_PUBLISHED` | `CLAIM_RANK_MAP` đủ 5 family; stub chỉ dùng family thật | ghi |
| D7 | Thứ tự ladder | Spec T01 sort theo bậc; hi-fi đọc weak→strong | Server sort rank asc | Bày ngược mảng server (VD-14) | `REQUIRES_BOBBY_DECISION` |
| D8 | State 404 | S13 (như S10 sau A3): 403 = 404 `denied`, câu F-04 | Baseline `8bd81b01`: 404 → terminal `notFound` + trang run-not-found | Giữ như S10 trên nhánh; khi tích hợp baseline phải chọn một | Bobby (B1) |
| D9 | Định dạng số | S13 in Decimal nguyên chuỗi (rule P19/plan) | Baseline `8bd81b01` DQ-08 `researchFormat.ts`: hiển thị theo đơn vị, giá trị gốc ở `title` | Giữ chuỗi nguyên; tích hợp baseline sẽ phải áp DQ-08 | Bobby (B1) |
| D10 | Sort attempts (audit C5) | Spec `13_compare.md:67` "rank asc → rồi OOS desc trong cùng rank" | `compare.service.ts:310` `sortCandidates`: rank asc → **NET_RETURN desc** → created → run_id | FE in thứ tự server (bày ngược, VD-14), không sort lại | `CG-P20-11` |
| D11 | Hướng Δ (audit A1) | Hi-fi A − B | Server `right − left` = B − A | Nhãn `B − A · as published`, không tính lại (VD-21) | `CG-P20-09` |
| D12 | Count khi block NOT_PUBLISHED (audit A4) | CLAUDE.md §3.3 không in số thay cho vắng | Server gửi `matched_observation_count: 0`, `emitted_point_count: 0`, `n` = số khớp khi block NOT_PUBLISHED; d.ts khai `number` không null | `eeeae14f`: không in count trong block NOT_PUBLISHED (foot in reason; mini/overlay meta chỉ khi AVAILABLE; correlation meta chỉ `missing_policy`) | `CG-P20-10` |

Lỗi tìm ra và đã sửa trong phase:

| Mục | Tìm ra ở | Xử lý |
|---|---|---|
| Token gate `color-mix()` + hex trong comment | Gói A, vitest full | Sửa trước commit 2 (VD-19) |
| S10-U49: link compare nằm trong `.ln-links` | Gói A, vitest full | Đặt cạnh (VD-18) |
| Ladder ngược hướng đọc hi-fi; mũi tên trơn | Plan review sau gói A | `009cedb8` (VD-14) |
| **Mini chart markets 1280: nhãn trục X chồng nhau** (~6 nhãn trong thẻ 315 px) | Gói B finding 1, `575e025b89d9cd86` | `034aef11`: chỉ nhãn đầu/cuối; receipt C `[data-x-label]` = 2, overlap false (`45fc7c0bfd3d4e17`) |
| Banner markets lặp "small multiples only" | Gói B finding 5 (G8) | `034aef11` (VD-20) |
| Δ không ghi hướng; Δ 0 tô xanh; số trong foot/meta không mono; count 0 cạnh lý do vắng; nhãn "(stitched)"; aria mũi tên sai hướng ở 660; resolver nuốt mode lạ | Audit độc lập A1–A5, A8, A10 | `eeeae14f` + unit S13-U24…U26 + probe C-2 gate a–e (§12) |

Còn mở (không sửa trong phase, xem [debt register](./thanhvuong-debt-register.json) `open_implementation_debt`):
- **`S13-REFUSED-STATE-ATTR`** (B finding 3, audit A9) — `data-compare-state=available` cho cả pair REFUSED và pair zero-variance (`CompareDetail.tsx:1558`); refusal/absent chỉ thể hiện ở `data-pair-state` / `data-correlation-absent`. Chờ B6.
- **`S13-BACK-REFETCH`** (B finding 4, audit C4) — validator ETag một slot: chỉ gửi `If-None-Match` khi quay lại đúng key vừa đọc; back/forward qua key khác đọc lại 200. Receipt C-2: mode-switch 5 GET ở cả 1280 và 660; etag-304 chỉ GET quay lại ngay key vừa đọc mang validator. Không sai dữ liệu, thừa băng thông.
- **`S13-DELTA-DIRECTION-LABEL`** (audit A1) — nhãn `B − A · as published` dựa trên code server hiện hành, chưa có field/cam kết contract; chờ `CG-P20-09`.
- Unit lane chưa khoá nhãn mini chart (`034aef11` không kèm unit test; chỉ probe browser khoá) — `S13-MINI-LABELS-UNIT`.
- Copy hi-fi verbatim audit A6 (`ATTEMPTS_RULE` số demo) và A7 (`COMPARE_RULES` "ACTIVE node") — ghi ở VD-15 / VD-10, Bobby quyết.

## 8. Scale refine (CLAUDE.md §8)

| Ô | S13 |
|---|---|
| Cardinality | Contract: attempts ≤ 128, markets ≤ 24, pair = 2 id, overlay ≤ 192 điểm. Probe: 3 attempt (+ PARTIAL 140 total), 3 market, pair 2 |
| Break point | Ladder flex-wrap (min 200 px); markets grid `minmax(300px,1fr)`; ≤ 900 px xếp 1 cột |
| Degradation | > 128 attempts → PARTIAL + total + reason; không gọi thêm (không có cursor) |
| Server contract | Đã có: bound, `coverage`, ETag/304, union REFUSED. Cần: fixture (`CG-P20-01`) và các field `CG-P20-02…08` |
| Invariant | Không sort/compare metric; Decimal chuỗi nguyên; NOT_PUBLISHED không thành 0; REFUSED không mount số |
| Perf budget | 1 GET compare mỗi `(alpha, mode, runs)`; validator ETag một slot: chỉ gửi `If-None-Match` khi quay lại đúng key vừa đọc; back/forward qua key khác đọc lại 200 (debt `S13-BACK-REFETCH`); response cũ bị bỏ |

## 9. Request cho Codex

Receipt đầy đủ: [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md). Tất cả OPEN, kiểm lại 2026-09-24 trên `bb25bf39` và `72d2638b`; `09…11` thêm sau audit, kiểm trên `eeeae14f` (contract không đổi).

| ID | Nội dung |
|---|---|
| `CG-P20-01` | Fixture canonical compare (5 case spec §10) + Problem |
| `02` | Schedule / mode per run |
| `03` | Cert / certification per run |
| `04` | OOS Sharpe per fold |
| `05` | Intentional differences ở attempts mode |
| `06` | Win rate + OOS Sharpe common-window (stitched) |
| `07` | Alpha id fixture run-library vs regex compare |
| `08` | Lifecycle ACTIVE/SUPERSEDED per run |
| `09` | Hướng Δ common-window: field `delta_definition: RIGHT_MINUS_LEFT` hoặc xác nhận bất biến (audit A1) |
| `10` | Count khi block NOT_PUBLISHED: `null` hay rule UI (audit A4) |
| `11` | Khoá sort thứ hai của attempts: OOS (spec) hay NET_RETURN (code) (audit C5) |

## 10. Kết luận có phạm vi

- **`P20-A S13 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · đã push, chưa PR`.**
  - Ba mode + mismatch + refusal HTTP dựng theo hi-fi trong giới hạn contract; ô không có field giữ vị trí hi-fi + typed absence + `CG`.
  - Head `eeeae14f` (sau audit độc lập, §12): tsc 0, build 0, vitest 172 file · 3094 pass · 1 skip, S13 + boundary 41/41, probe Research 162/162 (`--workers=1`), 76 RECEIPT (1280/660, sáng 23 gate + tối 15 gate) overflow 0 / console 0 / mutation 0 / foreign 0 / bare 0, mini chart ≤ 2 nhãn không chồng.
  - Theme tối chỉ có evidence từ receipt C-2 (`~/tv-shots/p20/final2/`); receipt C trước đó chỉ chạy theme sáng.
- **Chưa `VERIFIED`.** Còn thiếu: `REAL_API_E2E_RECEIPT` (feature-dark), axe (T10), `V11-P20-DR`, telemetry, tích hợp baseline (B1), `CG-P20-01…11`, VD `REQUIRES_BOBBY_DECISION` (B2, gồm 21–29), `open_implementation_debt` (`S13-REFUSED-STATE-ATTR`, `S13-BACK-REFETCH`, `S13-DELTA-DIRECTION-LABEL`).

## 11. Reuse report (v0.5 §11.3)

| Tái dùng | Từ đâu |
|---|---|
| `equitySvg`, `AxisLabel` (mini chart + overlay, nối left/right rồi cắt ở seam) | `research/reportEquity.ts` (S09) |
| `toLineageRefusal` / `LineageRefusal` (mapper refusal, 403 = 404 `denied`, câu F-04) | `research/lineageClient.ts` (S10); chưa có mapper chung trên nhánh (baseline có `researchRefusal.ts`, B1) |
| `LineageLink`, `lineageHref` | `research/LineageDetail.tsx` (S10) |
| `Fresh<T>`, `NOT_MODIFIED` (ETag) | `research/evidenceClient.ts` (S04) |
| `iso()` UTC phút | `research/utcMinute.ts` (P18) |
| `ResearchPanel`, `ResearchState` / `researchState` | `research/ResearchPanel.tsx`, `research/state.ts` |
| `PortalApiError` | `lib/api` |
| CSS scoped `:where(.cp-page)` + `button{font:inherit}` specificity 0 | mẫu `.ln-page` sau audit A1 P19 |
| Token Fund Paper (`--accent`, `--warn`, `--bad`, `--good`, `--ink-*`, `--line*`, `--accent-soft`, `--font-mono`) | `tokens.test.ts` xanh |

Mới / cục bộ có chủ đích: `AvailabilityAbsent`, `CertAbsent`, `KeyParts`, `PendingBody` (tập state compare `P20_*` khác enum S04/S10); `call<T>` riêng trong `compareClient.ts` theo quy ước mỗi client một bản. Gộp nên làm ở RF-04. Không màu raw ngoài token, không asset ngoài, không thêm dependency, không ECharts.

## 12. Audit độc lập P20 và commit `eeeae14f`

Audit độc lập chạy trên head `7800e8e2` (code `034aef11`), không sửa repo; probe riêng 54 test (sáng 13 state × 2, tối 5 × 2, flow 9 × 2). Kết quả: 10 lỗi (A1–A10), 7 lệch hi-fi chưa có VD (→ VD-P20-21…27), 6 điểm docs (C1–C6), 3 backend request thiếu (→ `CG-P20-09…11`). Commit `eeeae14f` sửa A1–A5, A8, A10; A6, A7, A9 chỉ ghi docs.

### 12.1 Finding → cách xử lý → bằng chứng

Dòng code tính ở `eeeae14f`.

| Mã | File:dòng | Vấn đề | Xử lý | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| A1 | `CompareDetail.tsx:1253` | Header chỉ "Δ", không nói hướng; server B − A, hi-fi A − B | `Δ` + `[data-delta-direction]` "B − A · as published"; không tính lại | FIXED @ `eeeae14f`; hướng chờ `CG-P20-09` (VD-21, debt `S13-DELTA-DIRECTION-LABEL`) | U24; probe pair `deltaDir="B − A · as published"` |
| A2 | `CompareDetail.tsx:1168` (`deltaSign`) | Δ `"0"` bị `data-sign=pos`, tô xanh | Δ bằng 0 (kể cả `-0.0000`) → không `data-sign` | FIXED @ `eeeae14f` (VD-28 cho tô theo dấu) | U24; probe zero-delta `sign:null`, ink `rgb(28,37,50)` |
| A3 | `CompareDetail.tsx:257` | Số ở foot common-window + meta correlation render sans | `.cp-tcard > .foot .num, .cp-corr .num` mono tabular | FIXED @ `eeeae14f` | probe pair `nonMono=0` (sáng + tối), `bare=0` ở 76 RECEIPT |
| A4 | `CompareDetail.tsx:919`, `:1075`, `:1288`, `:1310/:1320` | Block NOT_PUBLISHED vẫn in `matched 0`, `emitted 0 of …`, `n 0` cạnh lý do | Foot in `definition_id · common window not published · reason`; `[data-mini-meta]`/`[data-overlay-meta]` chỉ khi AVAILABLE; correlation meta chỉ `missing_policy` khi chưa derive | FIXED @ `eeeae14f`; field-level hỏi `CG-P20-10` | U25; probe pair-partial foot, markets MINI-META btc 1 · eth 0 · sol 0 |
| A5 | `CompareDetail.tsx:1185` | Nhãn "OOS sharpe (stitched)" khẳng định phương pháp contract không nói | "OOS sharpe" | FIXED @ `eeeae14f` (VD-29) | U24; probe pair OOS row không "stitched" |
| A6 | `CompareDetail.tsx:104` (`ATTEMPTS_RULE`) | Banner attempts in số demo 1.31 / 1.19 | Giữ verbatim theo rule Bobby 2026-09-24 (hi-fi thắng, FE không tự bỏ copy) | RECORDED → VD-P20-15, Bobby quyết (B2) | `p20-attempts-1280.png` `35ad99e226e1b703` |
| A7 | `CompareDetail.tsx:151` (`COMPARE_RULES`) | Footer "only the ACTIVE node may promote" khi màn không có node ACTIVE | Giữ verbatim như A6 | RECORDED → VD-P20-10, Bobby quyết (B2) | mọi ảnh (footer) |
| A8 | `CompareDetail.tsx:818` | aria mũi tên "claim strengthens to the right" sai ở 660 (xếp dọc) | aria "claim strengthens along the ladder"; copy banner "left to right" là A6 (verbatim) | FIXED @ `eeeae14f` (aria); copy banner theo A6 | probe attempts assert aria ở 1280/660 |
| A9 | `CompareDetail.tsx:1558` | `data-compare-state=available` khi pair REFUSED | Giữ theo B6 | RECORDED → debt `S13-REFUSED-STATE-ATTR` (`open_implementation_debt`), Bobby quyết (B6) | probe refused `state=available` |
| A10 | `CompareRoute.tsx:77–78` | Resolver đổi im lặng `mode=foo` thành pair/attempts | Mode lạ đi thẳng tới canonical `?mode=foo`, server trả 400 | FIXED @ `eeeae14f` | U26; probe resolver-badmode `url1=?mode=foo`, `url2=?runs=…&mode=foo`, terminal `req_p20_400` |

Lệch hi-fi chưa có VD (audit B) → ghi ở [§6](#6-visual-decision-ledger-vd-p20-0129): hướng Δ → VD-21; header → VD-22; weaker claim + intentional differences → VD-23; dòng phụ → VD-24; câu "Three different ComparisonContractKeys" → VD-25; caption correlation → VD-26; trục y overlay → VD-27; thêm VD-28 (tô Δ theo dấu, từ A2) và VD-29 (bỏ "(stitched)", từ A5). Ghi chú dark: overlay đổi sang `rgb(127,179,196)` / `rgb(212,167,94)` ở theme tối là token theo theme, không phải raw color (handoff codex chỉ nêu màu theme sáng).

Docs (audit C):

| Mã | Vấn đề | Sửa ở |
|---|---|---|
| C1 | Unified note ghi "42 RECEIPT ở 1280/660 (sáng/tối)" nhưng receipt C không chạy theme tối | Unified note + §10: theme tối chỉ có từ receipt C-2 (`final2`) |
| C2 | "21 gate × 2 = 42" vs bảng 19 hàng vs 46 test | §5.2: 23 gate sáng + 15 gate tối → 76 RECEIPT; 80 test tvp20; bảng 23 hàng + 1 hàng đo |
| C3 | `open_implementation_debt: []` dù còn debt | debt register: 3 mục |
| C4 | §8 "304 khi quay lại cùng key" mâu thuẫn validator một slot | §8 + debt `S13-BACK-REFETCH` |
| C5 | Sort attempts lệch spec, chưa có VD/request | §5.3 T01, §7 D10, `CG-P20-11` |
| C6 | VD-10/VD-15 chưa phủ A7/A6 | §6 VD-10, VD-15 |

### 12.2 Gate chạy lại trên `eeeae14f` (receipt C-2, 2026-09-24)

| Gate | Kết quả |
|---|---|
| `npx tsc -b --noEmit` | exit 0 (log rỗng `e3b0c44298fc1c14`) |
| `npm run build` | exit 0, 8.92 s (`569dbfc7f20e563b`) |
| vitest S13 + boundary | 2 file **41/41** (S13 27 + boundary 14; `38bbc27ad19da8d6`) |
| vitest toàn bộ | **172 file · 3094 pass · 1 skip**, 98.85 s (`efddb2da599ef1e1`) |
| probe Research toàn bộ `--workers=1` | **162/162** (fixtures 8, product 74, tvp20 80), 4.4 phút (`fe151f443fd274a5`, `probe-final2.log` `35e3038508ed11ad`) |
| 76 RECEIPT | overflow 0 · console noise 0 · mutation 0 · foreign 0 · bare 0 |

Không phát hiện lỗi code mới trong receipt C-2. Lỗi duy nhất trong lúc chạy là của probe (quét `bare` bắt ô Δ `"0"`), sửa ở probe, xem §5.1.

