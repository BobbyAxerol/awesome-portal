# P21 — Thanhvuong frontend receipt (Screen 11 Release Candidate)

**Trạng thái:** `P21-A S11 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · đã push lên primus-origin, chưa PR · NOT_VERIFIED`. Head code cuối **`3af31923`** (tree `78bb9370`), sau hai vòng sửa theo audit Fable ([§12](#12-audit-fable-p21-và-ba-lượt-receipt)).

- Backend P21 vẫn là `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK` ([P21 README](./README.md)): `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=false` (khi tắt, server trả 503 `RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE`).
- Browser receipt chỉ dùng **API stub same-origin**, dựng theo shape `release-candidate.contract.ts` / `release-candidate.service.ts`. Lý do: chưa có fixture release-candidate canonical ở đâu cả (`CG-P21-01`).
- Receipt này chỉ ghi thay đổi frontend và evidence. Nó không đổi rule, contract hay phase gate, và **không** gọi P21 là `VERIFIED`.
- P21 chỉ giao **nửa local**: local seal ≠ publish ≠ delivery ≠ approval ≠ Paper/Execution start (handoff codex). Publish và Approval mirror là ghost "P22 not commissioned".
- Rule Bobby 2026-09-24 (note P19 "Rule cho các phase sau (P20+)") áp dụng: màn khớp hi-fi + spec, hi-fi thắng khi hai nguồn lệch; FE không tự chọn lệch. Mọi lệch được ghi `VD-P21-NN` ở ba nơi: [§6](#6-visual-decision-ledger-vd-p21-0121), [handoff addendum](./frontend-handoff-claude.md#thanhvuong-addendum--nợ-mới-p21-cho-các-phase-sau-2026-09-24) và Unified.
- Hard rule hiển thị trung thực (CLAUDE.md §3.3) đứng trên hi-fi. Khi copy hi-fi mâu thuẫn contract, màn render đúng contract và ghi `REQUIRES_BOBBY_DECISION`.

## 0. Packet và những gì đã đọc

**Packet P21 của Thanhvuong** (năm file cạnh file này):

| File | Nội dung |
|---|---|
| `thanhvuong-frontend-receipt.md` | Receipt này: đã đọc, git, file, route/link, mapping hi-fi, evidence, so hi-fi, ledger VD, discrepancy, Reuse report, kết luận, audit (§12) |
| [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md) | `CG-P21-01…05` theo template CLAUDE.md §5 (locator / actual / expected / đề xuất / test / fallback); việc Bobby quyết B1–B5; ngày kiểm lại + baseline |
| [thanhvuong-test-results.json](./thanhvuong-test-results.json) | Evidence máy đọc được: tree SHA, từng gate (lệnh, exit, số đếm), `not_run`, SHA-256 ảnh/log (không commit), lịch sử 3 lượt receipt |
| [thanhvuong-debt-register.json](./thanhvuong-debt-register.json) | Nợ đã đóng trong phase, `open_debt` thật, VD chờ Bobby, request mở, downstream gate |
| [thanhvuong-rollback.md](./thanhvuong-rollback.md) | Revert từng commit, mới nhất trước |

Dòng trạng thái ở Unified §13 và implementation note dưới [`#rl-p21`](../../../UNIFIED_IMPLEMENTATION_PLAN.md#p21-thanhvuong-frontend-implementation-note--screen-11-2026-09-24) đều trỏ về packet này.

**Đã đọc (`READ`), theo CLAUDE.md §7.9.** Commit ghi trong bảng là commit cuối chạm file đó (`git log -1 --format=%h <ref> -- <file>`).

Baseline `primus-origin/docs/research-loop-plan`:
- Lúc lập plan P21: `4d296c06`.
- Lúc đóng packet (sau `git fetch primus-origin`, 2026-09-24): **`0fa3c385`**, 11 commit mới (`4d296c06..0fa3c385`, xem [§1](#1-git-base-head-branch) và B1).
- **Chỉ so sánh, không merge/rebase.**
- Không commit mới nào chạm contract/service/evidence P21. Trong `packages/contracts` chỉ có `tooling/verify-generated.sh` +4, thêm release-candidate vào danh sách verify.

| File | Nhánh (`3af31923`) | Baseline `4d296c06` | Baseline `0fa3c385` |
|---|---|---|---|
| `CLAUDE.md` (§3, §5, §7.9, §7.10, §8) | `19310912` | `8ca7bc11` | `8ca7bc11` |
| `upgrade/research_loop/CLAUDE-FOR-thanhvuong.md` | `30fb9f21` | `30fb9f21` | `30fb9f21` |
| `upgrade/research_loop/THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` | `30fb9f21` | `51b11247` | `51b11247` |
| `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` (§13, `#rl-p21`, note P20 làm mẫu) | `a5455848` | `b61d6e25` | `fae0e9b2` (chỉ dòng RF-05/RF-06; không chạm `#rl-p21`) |
| `evidence/P21/{frontend-handoff-claude,README,phase-report,rollback}.md` | `454b99c6` | `454b99c6` | `454b99c6` |
| `evidence/P20/thanhvuong-*` (packet mẫu, 5 file) | `e5cf9a7f` | — (chưa có trên baseline) | — |
| `RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` §P21 (`P21-T01…T14`, `V11-P21-DR/BR/GX`) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `release-v1.1/docs/screens/11_release_candidate.md` (T01–T19, §7 copy verbatim, §11 CSS ledger) | `4a974015` | `4a974015` | `4a974015` |
| `release-v1.1/QuantBT 11 Release Candidate and Publish.dc.html`, mở trong browser ở 1280 và 660 (draft + published) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `release-v1.1/docs/RESEARCH_SCREEN_STATE_SEMANTICS_V1.md` | `4a974015` | `4a974015` | `4a974015` |
| `packages/contracts/openapi/research-release-candidate.openapi.json` + `generated/research-release-candidate.d.ts` | `454b99c6` | `454b99c6` | `454b99c6` |
| `apps/control-api/src/research/release-candidate.{service,contract,controller}.ts` (chỉ đọc, để lấy key, reason code và thứ tự thật cho stub) | `454b99c6` | `454b99c6` | `454b99c6` |
| `src/features/quantbt/QuantBTModule.tsx` | `65e74a7b` | `33b46fdb` | `33b46fdb` |
| `src/research/RunLibrary.tsx` | `0910ecc3` | `5346d91f` | `29733128` (S01) |
| `src/research/EvidenceFlow.tsx` | `65e74a7b` | `f1105d40` | `6a3f15cc` (S04) |
| `src/research/evidenceFlow.test.tsx` | `737d279d` | `f1105d40` | `6a3f15cc` |
| `src/research/FreezeDetail.tsx` | `737d279d` | `c9fcc7ba` | `cce22dc4` (S07) |
| `src/research/useFreeze.ts` | `65a8acc5` | `c9fcc7ba` | `cce22dc4` |
| `src/research/freezeClient.ts` | `13b0c176` | `c9fcc7ba` | `cce22dc4` |
| `src/research/freezeDetail.test.tsx` | `65a8acc5` | `8bd81b01` | `cce22dc4` |
| `src/research/AlphaImport.tsx` | `0ec4b6af` | `67d041f5` | `67d041f5` |
| `src/research/ResearchPanel.tsx` | `72204680` | `67d041f5` | `67d041f5` |
| `e2e/_probe-research-product.spec.ts` | `65a8acc5` | `6146ed75` | `6146ed75` |
| `src/research/{lineageClient,utcMinute}.ts` (S11 dùng lại) | `1fb29010` / `1757b7d5` | — | — |
| `src/research/researchRefusal.ts` (mapper chung của baseline) | — | `8bd81b01` | `6a3f15cc` |

Các file trên từ `QuantBTModule.tsx` trở xuống đổi **ở cả hai phía** (nhánh và baseline). Riêng dòng Unified cũng đổi cả hai phía, nhưng khác vùng. Khi tích hợp sẽ có xung đột, xem B1.

**Contract đã tiêu thụ.** `research-release-candidate.openapi.json` `version 1.0.0`, SHA-256 `aaad7744854dc7b8…`; `generated/research-release-candidate.d.ts` SHA-256 `5558743b960eb48c…`. d.ts dùng nguyên như trên nhánh; không chạy `generate` (d.ts đã có, commit cuối `454b99c6`).

Bốn operation:

| Operation | Method + path | Ghi chú |
|---|---|---|
| `researchReleaseCandidateComposeGetV1` | `GET /api/v1/quantbt/runs/{runId}/release-candidate` | |
| `researchReleaseCandidateDraftPatchV1` | `PATCH …/release-candidate/draft` | CAS `expected_revision` + `expected_source_fingerprint` |
| `researchReleaseCandidateLocalSealCreateV1` | `POST …/release-candidate/seal` | 201, idempotent |
| `researchReleaseCandidatePackGetV1` | `GET /api/v1/research/release-candidates/{releaseCandidateId}` | |

- OpenAPI **không khai** ETag/304; `cache-control: private, no-store`. Controller vẫn gửi header `etag` (`release-candidate.controller.ts:54`, `:109`) và không đọc `If-None-Match`; FE không dùng header này (`CG-P21-03`).
- `DraftPatch` (OpenAPI) khai mỗi declaration `minLength 1 / maxLength 4096 | null` và khối `not` cấm cả hai null; d.ts không diễn đạt được `not` (D15).
- Problem theo status: 400 `…_INVALID`, 403 `…_FORBIDDEN`, 404 `…_NOT_FOUND`, 409 `…_CONFLICT`, 422 `…_NOT_PUBLISHABLE`, 503 `…_UNAVAILABLE`; 401 đến từ gateway.
- Không có fixture release-candidate ở cả ba ref: `git ls-tree -r <ref> --name-only | grep -ci "release-candidate"` trong `packages/contracts/fixtures` và `apps/portal/registry/fixtures` = 0 ở `HEAD`, `4d296c06`, `0fa3c385`.

### 0.1 Guide `P21-T01…T14` + `V11-P21-*` — frontend cover được gì

| ID | Nội dung Guide | Frontend hôm nay |
|---|---|---|
| T01 | Mọi 17 field có actual source | Backend. FE in 17 dòng `fields`/`yaml` server nguyên thứ tự; null → `null  # <reason_code>` (U12; browser copy-yaml 17 dòng) |
| T02 | Thiếu mandatory item block publish | **Hiển thị:** hàng MISSING đỏ + reason; nút seal `aria-disabled` + lý do `P21_REQUIRED_EVIDENCE_MISSING` (U06, U10; browser missing). Seal verdict là của server (`actions.may_seal`), FE không tính |
| T03 | DEGRADED hợp lệ không bị cấm thêm | **Có:** hàng DEGRADED in title spec, nền `--state-degraded-bg`, không chặn seal ở FE (U09; browser degraded) |
| T04 | Scratch/DRAFT eligibility | **Hiển thị:** banner NOT_PUBLISHABLE + node dashed + lý do `P21_SCRATCH_RUN_UNBOUND` (U02, U06; browser unbound) |
| T05 | Concurrent draft không ghi đè declaration | **Có phía FE:** PATCH gửi CAS; 409 → đọc lại, giữ text local, banner (U18; browser patch-409) |
| T06 | Corrupt referenced part bị phát hiện | **Hiển thị:** `availability=PARTIAL` + `P21_REFERENCED_SOURCE_INTEGRITY_FAILED`, seal khoá (U26; browser partial) |
| T07 / T08 | Receipt/mirror không tạo digest vòng; RC frozen không đổi | Backend. FE pack route chỉ đọc `frozen_core`, không có control sửa (U30; browser pack-route: 0 textarea/edit/save/seal) |
| T09 | Test composer/evidence pack S11 chạy | **Có:** 34 unit `S11-U01…U33` + 82 probe; [§5.3](#53-spec-11-test-matrix-t01t19) |
| T10 / T11 / T12 | Selected artifact == final audit; centroid provenance; không gọi optimizer | Backend. FE chỉ GET compose và chỉ ghi khi người dùng bấm (mutation không tự phát = 0 ở mọi RECEIPT) |
| T13 | Local sealed pack chưa ACK không hiện delivered/approved | **Có:** chip `SEALED_LOCAL` riêng, `NOT_DELIVERED · NOT_APPROVED`, chip chính vẫn `DRAFT`, 0 chữ PUBLISHED trần (U22; browser sealed) |
| T14 | Integrity warning không đổi approval/runtime | Backend. FE không có action approval/runtime |
| `V11-P21-DR` | Delta/data thật | **NOT_RUN**: lane này không có compute/data thật; backend feature-dark |
| `V11-P21-BR` | Browser/visual/action | Một phần: `PRODUCT_ROUTE_BROWSER_RECEIPT` với API stub, preview riêng 4417 (không phải dev host) |
| `V11-P21-GX` | Protected hash, no-debt, report | Một phần: hook chạy tay, `git diff --check`; `open_debt` **không rỗng**; chưa có rebuild/deploy receipt |

`READ` khác `IMPLEMENTED`, và `IMPLEMENTED` khác `VERIFIED` (A4.1).

## 1. Git: base, head, branch

| Mục | Giá trị |
|---|---|
| Branch | `feat/thanhvuong/research-p17-p21`; remote duy nhất `primus-origin` |
| Base của P21 | `a5455848` (docs P20 sau audit) |
| Commit code P21 (tree) | `0dea25f8ecef28156c659b20b212a992c0b44014` feat(research): S11 release-candidate client + hooks (tree `2630f93e`)<br>`65e74a7bee88587bed66e60e2e8095e9bc108a9d` feat(research): S11 Release Candidate screen, pack route and entry links (tree `e0681dca`)<br>`ed92ac4a182404e378b1bb77724b8b9bc6705c33` test(research): S11 unit lane S11-U01..U33 (tree `94bb0750`)<br>`cad8bed951e04d5e4c69381b5117e0a950ed6e1a` fix(research): S11 leaves the empty-declaration rule to the server (tree `f700c0d5`; audit A1)<br>`e4c47d6af1e05cf0799b2d29b79c5bf3c759b80a` fix(research): S11 browser-receipt fixes — mirror status absence, rail wrap, degraded tint (tree `1d91416b`; audit B1–B5)<br>`3af319238d7a464b09344cbe4aa112dfc4f6b3d9` fix(research): S11 rail shares its width across the five nodes; degraded rows use the state tint (tree `78bb9370`; audit C1–C2)<br>`c16ece6149d7f99328a872d291290b4082ed0bba` fix(research): S11 restores the pre-send guard for two null declarations (tree `57a290a2`; revert `cad8bed9` sau gói C, đóng D15) |
| Ghi chú lịch sử | Commit 2 được amend một lần khi còn là HEAD local, trước commit 3, để bỏ hex trong comment CSS mà `tokens.test.ts` bắt. Không rebase, không force, không merge baseline |
| Docs commit | `docs(research): P21 Thanhvuong packet — S11 Release Candidate receipt, requests, debt, rollback` (5 file packet, commit chứa file này) · `docs(research): P21 §13 row, implementation note and handoff addendum` (Unified + handoff addendum). Commit không tự ghi được SHA của chính nó; SHA xem `git log` |
| Tác giả | `Vuong <thanhvuong11052003@gmail.com>`, trailer `Co-Authored-By: Claude Fable 5.1` |
| Baseline | `docs/research-loop-plan`: `4d296c06` lúc lập plan, `0fa3c385` lúc đóng packet. **Chưa merge/rebase**; theo quyết định D1 của Bobby, Codex sẽ merge (B1) |
| Push / PR | `a5455848..` docs commit thứ hai: 6 commit code + 2 docs commit, lên `primus-origin`, pre-push chạy tay exit 0, không force. Chưa có PR. Sau gói C: `c16ece61` (revert `cad8bed9`) + 1 docs commit (cập nhật D15 đóng), push lần 2, pre-push tay exit 0 |

`4d296c06..0fa3c385` (11 commit, chỉ ghi, không merge; 51 file +6208/−685):

| Commit | Nội dung | Chạm S11? |
|---|---|---|
| `0fa3c385` | docs: quyết định của Bobby cho ≤ P21 (`BACKEND_DEBT_P01_P21_CLAUDE_2026-09-24.md` §6) | **Có về quy trình.** D1: Codex merge nhánh Thanhvuong vào base (giữ 44 commit, không rebase/force), xung đột ở `QuantBTModule.tsx`, `EvidenceFlow.tsx`, `FreezeDetail.tsx`, `RunLibrary.tsx`. Claude không sửa 4 file đó tới khi merge xong. D3: Claude làm tới P21, P22+ là Codex. Doc ghi "S11 RC composer: TV không → làm mới toàn bộ", nay đã cũ (B1) |
| `eb68b89b`, `10a490e3` | chore verifier / e2e config; `verify-generated.sh` +4 (thêm release-candidate) | Không chạm file S11 |
| `f7c6d44e` | debt register P01–P21 | Không |
| `cce22dc4` | S07 Freeze (`FreezeDetail.tsx`, `useFreeze.ts`, `freezeClient.ts`, test) | Không chạm file S11; xung đột P17 cũ vẫn còn |
| `fae0e9b2` | RF-05/RF-06 docs (Unified chỉ dòng RF) | Không chạm `#rl-p21` |
| `a4aff585` | S05/S06 | Không |
| `6a3f15cc` | S04 Evidence Flow (`EvidenceFlow.tsx`, `evidenceFlow.test.tsx`, `researchRefusal.ts`) | **Có:** S11 commit `65e74a7b` biến "release candidate → 11" trong `EvidenceFlow.tsx` thành Link, nên chắc chắn xung đột |
| `29733128` | S01 Run Library | Không chạm S11 (S13 đã chạm, xem P20 B1) |
| `3b48d3e9`, `5bc77b9b` | các sửa khác trong đợt RF | Không chạm contract/service/evidence P21 |

Lưu ý thời điểm: `65e74a7b` (14:23 UTC) sửa `QuantBTModule.tsx` và `EvidenceFlow.tsx` **trước** commit quyết định `0fa3c385` (14:48 UTC). Từ lúc quyết định có hiệu lực, không commit nào của P21 chạm 4 file bị khoá (`cad8bed9`, `e4c47d6a`, `3af31923` chỉ sửa file S11 riêng).

## 2. File đã sửa (`git diff --numstat a5455848 c16ece61`; 12 file +3033/−37 không đổi so với `3af31923`, vì `c16ece61` revert `cad8bed9`)

| File | + | − | Mục đích |
|---|---:|---:|---|
| `src/research/releaseCandidateClient.ts` | 326 | 0 | 4 operation generated qua `call<T>` / `PortalApiError`; CSRF `x-portal-csrf` + content-type chỉ ở PATCH/POST; không `If-None-Match` (OpenAPI không khai ETag); `toRcRefusal` (read, F-04 qua `toLineageRefusal`) và `toRcWriteRefusal` (write: 401/403/404 denied · 409 conflict · 5xx/mạng unavailable · 400/422 terminal); `yamlText` (:179) join `key: value` server; không in `error.message` |
| `src/research/useReleaseCandidate.ts` | 294 | 0 | 1 read compose mỗi identity (AbortController + sequence guard; không poll, không refetch on focus); write guard đồng bộ bằng ref; PATCH CAS; seal rồi đọc lại compose; 409 → đọc lại; denied khoá cả hai write; 201 cùng id → replay; `usePack` |
| `src/research/ReleaseCandidateDetail.tsx` | 1430 | 0 | Màn S11 (`RC_PANELS` :157, CSS scoped `.rc-page` `RC_CSS` :182); `Rail` :517, `Taxonomy` :559, `CertChips` :635, `PackRow` :770, `RecordBlock` :912, `SealCard` :1019, `MirrorGhost` :1127, `useDeclarationEditor` :1171, `ReleaseCandidateScreen` :1424. Sửa sau audit: `cad8bed9` +3/−6, `e4c47d6a` +7/−7, `3af31923` +3/−3 |
| `src/research/ReleaseCandidateRoute.tsx` | 38 | 0 | Route compose + pack |
| `src/research/releaseCandidateDetail.test.tsx` | 911 | 0 | 34 test `S11-U01…U33` (U19 `each` 401/403); `cad8bed9` +8/−5 (U17), `e4c47d6a` +3 |
| `src/features/quantbt/QuantBTModule.tsx` | 6 | 2 | Mount `runs/:runId/release-candidate` và `release-candidates/:releaseCandidateId` trước `runs/:runId/*`; thêm vào regex loại `activeRunId` và `onReferenceRoute` |
| `src/research/EvidenceFlow.tsx` | 9 | 21 | "release candidate → 11" thành Link thật `data-action="release-candidate"` |
| `src/research/ReportDetail.tsx` | 3 | 9 | NoPrintBar "Release Candidate & Publish" thành Link; bỏ `RELEASE_UNROUTED` |
| `src/research/reportDetail.test.tsx` | 6 | 4 | S09-U10 / S09-U26 assert link S11 |
| `src/research/LineageDetail.tsx` | 6 | 1 | `RC_UNROUTED` viết lại: S11 theo run, mở từ Evidence Flow hoặc Run Report (VD-P21-19) |
| `src/research/researchBoundary.test.ts` | 1 | 0 | Thêm `releaseCandidateClient.ts` vào `NETWORK_MODULES` |
| `tsconfig.json` | 3 | 0 | Alias `@portal/contracts-research-release-candidate` |
| **Tổng** | **3033** | **37** | 12 file, tất cả thuộc `apps/portal/frontend/**` |

Theo commit:

| Commit | File | Dòng |
|---|---:|---|
| `0dea25f8` | 4 | +624/−0 |
| `65e74a7b` | 7 | +1501/−37 |
| `ed92ac4a` | 1 | +905/−0 |
| `cad8bed9` | 2 | +11/−11 |
| `e4c47d6a` | 2 | +10/−7 |
| `3af31923` | 1 | +3/−3 |

Không đụng backend, `packages/contracts/**`, OpenAPI, fixture canonical, migration, `apps/portal/strategy/**`, control-plane, deploy, `package.json` hay lock file.

- Không có DTO tự định nghĩa và không parse prose lỗi.
- Không đếm status, không sort, không tính seal verdict.
- Grep `toFixed|Intl|sort(|scrollIntoView|error.message` trên file S11 = 0 (audit A5).
- Không hex; `tokens.test.ts` xanh.

## 3. Route và link

| Hướng | Từ → tới | Điều kiện |
|---|---|---|
| Canonical (compose) | `/research/quantbt/runs/{runId}/release-candidate` | Đặt trước `runs/:runId/*`; không kích fetch legacy `/api/runs/{id}` (regex `activeRunId`) |
| Canonical (pack) | `/research/quantbt/release-candidates/{releaseCandidateId}` | Chỉ đọc (VD-P21-09); 403 = 404 `denied` |
| Vào | S04 Evidence Flow "release candidate → 11" | Link `data-action="release-candidate"` (browser LINKS `evidenceFlow=/research/quantbt/runs/R-WFO-118/release-candidate`) |
| Vào | S09 Run Report NoPrintBar "Release Candidate & Publish" | Link (browser LINKS `runReport=…/release-candidate`) |
| Vào (không nối) | S10 Lineage root card "rc & publish →" + pick `rc_` | Giữ span + title `RC_UNROUTED`: card theo alpha, không có run để định địa chỉ route theo run (VD-P21-19) |
| Ra | breadcrumb "Evidence Flow" | hub run `#stage=claim` |
| Ra | "run report" (header) | `/research/quantbt/runs/{runId}/report` |
| Ra | banner "New Run" | `/research/quantbt/runs/new` |
| Ra | rc node / sealed card id | pack route khi `SEALED_LOCAL` |
| Ra | cột source của pack | `source.href` server **nguyên chuỗi** nếu là path same-origin (`/` và không `//`), còn lại span (VD-P21-07, VD-P21-12; `CG-P21-02`) |

## 4. Mapping hi-fi → component / `data-panel` → field contract → typed state → assertion

"Unit" là vitest `S11-Uxx`; "Browser" là gate probe trên product route ([§5.2](#52-browser-receipt--product_route_browser_receipt-api-stub)), 1280 và 660. Dòng RECEIPT nào cũng `overflow=0 noise=0 otherMutations=0 foreign=0 legacyRuns=0 bare=0 knownBare=0`.

| Phần tử hi-fi | Component / `data-panel` | Field / operation | Typed state / absence | Unit | Browser |
|---|---|---|---|---|---|
| Breadcrumb + title + subtitle | `Header` / `header` | route `runId`; title/subtitle hi-fi verbatim | Mọi state; loading/refusal giữ đủ khối | U01, U03 | loading: 10 panel, 4 skeleton, `aria-busy`, 0 số |
| State chip DRAFT | `Header` chips | compose `state` | luôn `DRAFT` (VD-01) | U03, U06, U22 | mọi gate; sealed vẫn `DRAFT` |
| (mới) Chip SEALED_LOCAL + lifecycle | `SealChips` | `local_seal.state / delivery_state / approval_state` | chỉ khi SEALED_LOCAL; null → "delivery/approval not published" | U22, U30 | sealed: `NOT_DELIVERED · NOT_APPROVED`, 0 PUBLISHED |
| (mới) Dòng meta | `rc-meta` | `read_authority`, `as_of_utc_ms`, `source_fingerprint`, `draft.state/revision/updated_at_utc_ms` | loading → chữ state (VD-13) | U04, U30 | bound-virtual |
| Banner NOT_PUBLISHABLE + "New Run" | `Banner` / `banner` | `source_absences.alpha_binding` | chỉ khi NOT_PUBLISHED; in reason code | U02, U06 | unbound: copy verbatim, `overflow-wrap:anywhere` ở 660 (B5) |
| Partial / refusal notice | `Notice` (ResearchPanel) | compose `availability`; HTTP status | partial / denied / unavailable (+ "read again") / terminal; code + request id | U26, U27, U31 | partial, get-refusal-400/401/403/404/503, F04 |
| 1 · identity rail 5 node | `Rail` :517 / `identity` | `rail[]` key/value/detail/tone | tone ink/gold/green/dim (dim = dashed); rc node link pack khi sealed; `run` = "run / attempt" (VD-06) | U05 | geometry: 1280 `railTops=[337×5]` (1 hàng), 660 `[441,441,441,513,513]` (wrap); unbound dashed |
| Taxonomy 4 hàng "what / state / consequence" | `Taxonomy` :559 | `taxonomy[]` | in như server gửi (hôm nay toàn UNSET) | U07 | bound-virtual |
| Caption "change taxonomy vs last published rc — " | `Taxonomy` | `published_comparison` | id null → typed absence `P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED` (VD-04) | U07 | bound-virtual |
| Gate verdict | `IdentityBlock` | `gate_verdict.title/body` | verbatim | U02, U07 | bound-virtual, unbound |
| Chip claim-ceiling / engine-cert | `CertChips` :635 | `certification_axes.*` | có value → chip; vắng → ghost dashed + reason (VD-05) | U08 | bound-virtual |
| Counter pack | `PackBlock` | `pack_counts` | số server in nguyên, kể cả khi lệch mảng; pack route → "counts are not part of the frozen pack" (VD-18) | U09, U30 | missing: counter = số server |
| 2 · bảng pack 12 hàng | `PackRow` :770 / `pack` | `pack[]` | title COMPLETE/DEGRADED/INPUT verbatim; MISSING title = reason; digest null → absence + reason; digest 1 dòng ellipsis + `title` đủ (VD-21) | U09, U10 | 12 hàng; `digestOneLine=10/10` ở 1280 và 660; bảng ≥ 960 cuộn trong container |
| Hàng DEGRADED (nền vàng) | `PackRow` `tr[data-s=DEGRADED]` | `pack[].status` | nền `var(--state-degraded-bg)` (:264, C2) | U09 | degraded: `rgb(244, 236, 219)` = token, ≠ COMPLETE (trong suốt), ≠ nền trang `rgb(255,255,255)` |
| Hàng MISSING (đỏ) | `PackRow` | `pack[].status/availability` | nền `--bad-bg`, status đỏ | U10 | missing (sáng + tối) |
| Cột source / title Alpha360 | `SourceCell` | `pack[].source.href/label` | path same-origin → Link verbatim (VD-07); null/ngoài → span, passport có `ALPHA360_TITLE` (:106, VD-12) | U11 | bound-virtual |
| INPUT hàng 10 & 12 inline editor | `DeclarationRow`, `useDeclarationEditor` :1171 | PATCH draft (CAS) | saved / conflict / denied / unavailable / terminal; text giữ ở mọi refusal; ô trống → `null`; cả hai ô trống → chặn trước khi gửi theo contract (VD-08, VD-14, A1/D15) | U15–U21, U29 | input-saved, patch-409, patch-401, patch-503-retry |
| Footer pack | `PackBlock` | — | verbatim | U03 | mọi gate |
| 3 · record preview (YAML) | `RecordBlock` :912 / `record` | `yaml[]` (17) | null → `null  # <reason>` (VD-10); tone server | U12 | copy-yaml; YAML cuộn trong container (1280 710/524) |
| copy yaml / ✓ copied | `RecordBlock` | `yamlText(yaml)` | "✓ copied" chỉ khi resolve; reject → "copy unavailable" (VD-17) | U13, U14 | clipboard = join server, 17 dòng |
| Card Publish → local seal | `SealCard` :1019 / `seal` | POST seal | `aria-disabled` + `aria-describedby` → nhãn lý do · code (VD-02, VD-15) | U06, U22, U24 | bound-virtual, missing, unbound, keyboard (nút vẫn focus được) |
| SoD note | `SealCard` | — | verbatim | U03 | mọi gate |
| (mới) Sealed card | `SealedCard` / `sealed` | `local_seal` / SealResponse / PackResponse | id link pack route; replay → "already sealed — same pack" | U22, U23, U30 | sealed, sealed-replay |
| Publish (P22) | `PublishGhost` / `publish-ghost` | `actions.publish.blocked_reason` | ghost, không có gì bấm được | U25 | ghosts: interactive 0 |
| Approval inbox mirror | `MirrorGhost` :1127 / `mirror-ghost` | `source_absences.approval_mirror` (`mirror=null`) | ghost; status "status not published" `data-mirror-status="not-published"` (VD-20) | U25 | ghosts: interactive 0, opacity .75 dashed; text "status not published" |
| Rules of this screen | `Rules` / `rules` | — | verbatim | U01 | mọi gate |
| Pack route | `PackScreen`, `PackIdentity` | pack GET | read-only; 403 = 404 | U30, U31 | pack-route (sáng + tối): 0 textarea/edit/save/seal/counter |

## 5. Evidence

### 5.1 Test lanes (`apps/portal/frontend`, Node v20.20.2, head `3af31923`, receipt gói C lượt 2, 2026-09-24)

| Lane | Lệnh | Exit | Kết quả |
|---|---|---:|---|
| Typecheck | `npx tsc -b --noEmit` | 0 | PASS (`tsc.log` `99bb1a8bce0d56e1`) |
| Build | `npx vite build` | 0 | PASS; chỉ cảnh báo chunk > 500 kB có từ trước (`build.log` `674498503d8b6413`) |
| Unit toàn bộ | `npx vitest run` | 0 | **173 file · 3128 pass · 1 skip** (3129), 91.86 s, pass lượt đầu (`vitest.log` `e4fa57e629de1be6`) |
| Unit S11 | `npx vitest run src/research/releaseCandidateDetail.test.tsx` | 0 | **34/34** (`S11-U01…U33`, U19 × 2; `vitest-s11.log` `0c193adfc28d33ef`) |
| Browser tvp21 | `P21_SHOT_DIR=… npx playwright test -c tv-probe.config.ts e2e/_probe-research-tvp21.spec.ts --workers=1` | 0 | **82/82**, 2.8 phút (`pw-tvp21.log` `05650b13aa753ce6`, `p21/probe.log` `628600c7e85544b0`) |
| Browser toàn Research | `RESEARCH_SHOT_DIR=~/tv-shots/p21/final2/research P20_SHOT_DIR=… P21_SHOT_DIR=… npx playwright test -c tv-probe.config.ts --workers=1` | 0 | **244/244** (fixtures 8, product 74, tvp20 80, tvp21 82), 6.4 phút, 0 fail / 0 flaky (`pw-research-all.log` `bc3258c3d663e02f`, `all/p21/probe.log` `628600c7e85544b0`) |

Lịch sử receipt: ba lượt `cad8bed9 → e4c47d6a → 3af31923`, xem [§12.2](#122-ba-lượt-receipt-cad8bed9--e4c47d6a--3af31923); lượt 4 trên `c16ece61` xem [§12.3](#123-lượt-receipt-4-c16ece61-sau-gói-c). Lượt 4 (`c16ece61`, revert `cad8bed9`): tsc 0, build 0, S11 34/34, tvp21 **82/82** (2.9 phút, `final3/pw-tvp21.log` `304b62999f91ef12`; `final3/p21/probe.log` `628600c7e85544b0`, byte-giống lượt 3 vì commit không đổi DOM/CSS mà probe đo); toàn Research không chạy lại. Gói A trên `ed92ac4a`: tsc 0, build 0, vitest 173 file · 3128 pass · 1 skip, S11 34/34. Lượt full đầu của gói A có 2 fail:
- `tokens.test.ts` bắt hex trong comment CSS; sửa bằng amend commit 2.
- `foundation.test.tsx` P09-T04 là flake thời gian đã biết. Pass khi chạy riêng và ở lượt cuối.

Môi trường browser: Playwright 1.62.1, Chromium headless.
- **Preview:** `vite preview --port 4417 --strictPort --host 127.0.0.1` riêng của workspace, dựng từ build trên. Lượt 2 chạy dưới PID `2111604 2111635 2111636` (npm exec, sh, node vite) và đã kill theo PID cụ thể; `ss -ltnp | grep 4417` rỗng. Không đụng preview 4317–4320 (vẫn listen sau khi dọn).
- **Spec/config tạm:** tvp20 + tvp21 + `tv-probe.config.ts` **không commit, đã xoá**; `git status --short` rỗng; HEAD vẫn `3af31923`.
- **Hash spec/config:** tvp21 `e3fb71fef3235e25`; tvp20 `.c2` `1741ddd61264b05d` (bản của P20 C-2); config `ae27a91cd86f7b74`.
- `RESEARCH_SHOT_DIR` luôn phải đặt, vì default `/tmp/research-shots` thuộc user `bobby` (EACCES, B-report F-B2).

### 5.2 Browser receipt — `PRODUCT_ROUTE_BROWSER_RECEIPT` (API stub)

Routes:
- `/research/quantbt/runs/R-WFO-118/release-candidate`
- `/research/quantbt/release-candidates/rc_01J9P21SEAL0000000001`

Stub:
- `page.route` cho 4 operation, cộng `stubPortalApi(page,"healthy")`.
- Body dựng theo `research-release-candidate.d.ts`. Reason code, `gate_verdict`, rail và `seal_blocked_reason` lấy từ `release-candidate.service.ts`.
- Có nhãn "controlled same-origin test double" theo handoff.

**Đếm.** Spec tvp21 có **82 test** = 41 × 2 viewport. Mỗi viewport có 28 test sáng (G01…G21, G22 × 5 status, G24 hi-fi capture) và 13 test tối. 78 test có dòng RECEIPT; 4 test còn lại là G10 F-04 (dòng `F04@`) và G24 hi-fi (dòng `HIFI@`), mỗi loại × 2 viewport.
- Log có **78 RECEIPT** = 26 gate sáng × 2 viewport + 13 gate tối (`data-theme=operations`) × 2 viewport.
- Toàn bộ 78 RECEIPT: overflow > 0: **0** · console noise > 0: **0** · `otherMutations` > 0: **0** · foreign > 0: **0** · `legacyRuns` > 0: **0** · bare > 0: **0** · `knownBare` > 0: **0** · `OVERFLOW-CULPRIT`: 0.
- Console chỉ có lỗi mạng đã khai báo của chính request bị stub (4xx/5xx chủ ý).
- Counts ghi theo thứ tự GET compose / PATCH / POST seal / GET pack.

| # | Gate | 1280 | 660 | Tối | Counts | Assertion chính |
|---|---|---|---|---|---|---|
| 1 | loading | PASS | PASS | PASS | 1/0/0/0 | `aria-busy`, 10 panel, 4 skeleton, 0 số; seal disabled "the composition has not been read" |
| 2 | bound draft VIRTUAL | PASS | PASS | PASS | 1/0/0/0 | `may_seal=false`; nút `aria-disabled` + describedby "complete the two declarations first · P21_RESEARCHER_DECLARATIONS_REQUIRED" |
| 3 | unbound | PASS | PASS | PASS | 1/0/0/0 | banner NOT_PUBLISHABLE verbatim; node alpha/alpha_version dim + dashed "— unbound / scratch run"; YAML `alpha_version_id: null  # P21_ALPHA_BINDING_NOT_PUBLISHED` |
| 4 | MISSING | PASS | PASS | PASS | 1/0/0/0 | nền `--bad-bg` rgb(247,232,232) (tối rgb(51,27,27)); status rgb(180,58,58); counter = số server; seal "resolve MISSING rows first · …" |
| 5 | **DEGRADED hàng 9** | PASS | PASS | PASS | 1/0/0/0 | `data-n=9`, title "partial artifact — travels as DEGRADED, reviewer sees it"; **nền = `var(--state-degraded-bg)` `rgb(244, 236, 219)` ≠ COMPLETE (trong suốt) ≠ nền trang `rgb(255,255,255)`** (C2) |
| 6 | PARTIAL integrity | PASS | PASS | PASS | 1/0/0/0 | `data-rc-state=partial`, notice chứa `P21_REFERENCED_SOURCE_INTEGRITY_FAILED`, 12 hàng, seal khoá |
| 7 | INPUT edit → PATCH 200 | PASS | PASS | — | 1/1/0/0 | body đúng 4 khoá `{expected_revision:0, expected_source_fingerprint, known_limitations, proposed_use_restrictions}`; hàng 10/12 + draft cập nhật; seal mở |
| 8 | PATCH 409 | PASS | PASS | — | 2/1/0/0 | banner "evidence changed since composing — review the pack", đọc lại 1 lần, text gõ local còn nguyên |
| 9 | PATCH / seal 401 | PASS | PASS | — | 1/1/0/0 · 1/0/1/0 | text còn; writes off "writes are off — access changed"; 0 retry tự động |
| 10 | 403 = 404 (F-04) | PASS | PASS | PASS (GET) | 1/0/0/0 mỗi ca | GET 403/404 cùng câu "This run may not exist or may be outside your access — nothing here confirms either."; PATCH 403/404 cùng câu "Access changed — …" (dòng `F04@…`) |
| 11 | 503 unavailable | PASS | PASS | PASS (GET) | GET 2/0/0/0 · PATCH 1/2/0/0 | giữ composition + draft; retry chỉ khi bấm (đếm tăng đúng 1 sau click) |
| 12 | GET 400 / 401 | PASS | PASS | PASS | 1/0/0/0 | 400 terminal "This release candidate request is not valid…"; 401 denied "Your session has ended…" |
| 13 | seal 422 terminal | PASS | PASS | — | 1/0/1/0 | terminal, không retry |
| 14 | seal 201 → đọc lại | PASS | PASS | PASS | 2/0/1/0 | body `{draft_id, expected_draft_revision:1, expected_source_fingerprint}`; sealed card, chip `SEALED_LOCAL`, `NOT_DELIVERED · NOT_APPROVED`, chip chính vẫn `DRAFT`, rail rc green, YAML rc id |
| 15 | seal replay | PASS | PASS | — | 3/0/2/0 | "already sealed — same pack", cùng id `rc_01J9P21SEAL0000000001` |
| 16 | pack route read-only | PASS | PASS | PASS | 0/0/0/1 | `data-rc-mode=pack`, 12 hàng / 17 YAML, 0 textarea/edit/save/seal/counter, "counts are not part of the frozen pack", link về composition |
| 17 | copy yaml | PASS | PASS | — | 1/0/0/0 | clipboard (grant read/write) = join server `key: value`, 17 dòng, dòng 1 `release_candidate_id: null  # P21_ASSIGNED_ON_LOCAL_SEAL` |
| 18 | **ghost publish + mirror** | PASS | PASS | — | 1/0/0/0 | interactive trong publish-ghost/mirror-ghost = [0,0]; mirror opacity .75 dashed; **`[data-mirror-status]` text "status not published", attr `not-published`** (B1) |
| 19 | entry links 04/09/10 | PASS | PASS | — | 3/0/0/0 (+ fixture) | 04 và 09 → `/research/quantbt/runs/R-WFO-118/release-candidate`; 10 Lineage là SPAN có title `RC_UNROUTED`, 0 link rc |
| 20 | keyboard focus-visible | PASS | PASS | — | 1/0/0/0 | mọi tab stop `:focus-visible` + ring (link, 2 edit, copy yaml, dòng YAML cuộn, nút seal `aria-disabled` vẫn focus) |
| 21 | reduced motion | PASS | PASS | — | 1/0/0/0 | 0 animation/transition đang chạy |
| 22 | **geometry** | PASS | PASS | — | — | 660: `scrollWidth−innerWidth = 0`, pack sw/cw 960/594, YAML 710/594; 1280: pack 966/966, YAML 710/524. **Rail: 1280 `railTops=[337,337,337,337,337]` (1 hàng, left tăng dần, 5 `.rc-node`); 660 wrap `[441,441,441,513,513]`. Digest pack: `digestOneLine=10/10` (`white-space: nowrap`, 1 client rect, `title` = text) ở 1280 và 660** (C1, B4) |
| 23 | console 0 | PASS | PASS | PASS | — | noise = 0 ở mọi ca |
| 24 | đúng số request | PASS | PASS | PASS | cột Counts | `record()` assert GET/PATCH/POST/PACK từng ca; 0 mutation khác, 0 foreign, 0 legacy `/api/runs/` |
| 25 | bare-number scan | PASS | PASS | PASS | — | bare 0, **`knownBare` 0**: exception "—" của mirror ghost ở lượt B đã bỏ (B1) |
| 26 | hi-fi HTML | PASS | PASS | — | — | `file://…/QuantBT 11 Release Candidate and Publish.dc.html`: draft + published (click Publish); hi-fi tự tràn 52 px ở 660 (B7) |

CSRF: header `x-portal-csrf` không xuất hiện trong probe vì không có cookie. Log ghi `csrf=none(no cookie)` và không suy thêm gì từ đó. Unit S11 assert `x-portal-csrf` có ở PATCH và POST seal, vắng ở GET (stub cookie `tok_123`).

Ảnh (SHA-256 16 hex, `~/tv-shots/p21/final2/all/p21/`, không commit):

| File | 1280 | 660 |
|---|---|---|
| `p21-bound-virtual` | `edb55a501b85aba4` | `4cf56e76bbe3f5cd` |
| `p21-degraded` | `5a4da2b8e55ee9b4` | `17244f34ab487154` |
| `p21-missing` | `00c0677b4abd978c` | `6f31ac281c2f349e` |
| `p21-unbound` | `e82cb4e5b96e1803` | `647bca47d895d649` |
| `p21-sealed` | `24b0a8dda83cb091` | `a04b18e07f32088e` |
| `p21-sealed-replay` | `dd4ee4aa0d84d936` | `613373ee11720182` |
| `p21-pack-route` | `88a1e429afaa5fbd` | `a209391d69d48b1d` |
| `p21-copy-yaml` | `588667f77202c02f` | `73e973e068dede7a` |
| `p21-hifi-draft` | `981f4e83a02939b0` | `9122d2d04e4f2d70` |
| `p21-hifi-published` | `c47a59d779970d09` | `6751f37459f70cd2` |
| `p21-dark-bound-virtual` | `37c486fb0bdcf026` | `475e5344fafb0887` |
| `p21-dark-degraded` | `ae4efa2ff32dc8cb` | `b10a7855b07a4ac5` |

Danh sách đầy đủ (465 file trong `final2/hashes.txt`, 447 ảnh) ở [thanhvuong-test-results.json](./thanhvuong-test-results.json) `evidence_store`.

### 5.3 Spec 11 test matrix (T01–T19)

| Spec | Nội dung | Trạng thái |
|---|---|---|
| T01 | draft bound | **Có:** chip DRAFT; rail rc gold `rc_(draft)`; mirror ghost. YAML rc ghi `null  # P21_ASSIGNED_ON_LOCAL_SEAL` thay "(assigned on publish)" (VD-10) |
| T02 | publish click → PUBLISHING → PUBLISHED | **`PENDING_OWNER_PHASE` (P22).** P21 không có operation publish; nút là "Local seal evidence pack" (VD-02) |
| T03 | unbound | **Có:** banner; node dashed; seal disabled "seal blocked — bind alpha_version first · P21_SCRATCH_RUN_UNBOUND"; YAML av null đỏ |
| T04 | MISSING | **Có:** hàng đỏ; "resolve MISSING rows first"; counter = số server |
| T05 | DEGRADED hàng 9 | **Có:** nền tint vàng (`--state-degraded-bg`), title đúng; link nguồn = `source.href` server (`CG-P21-02`) |
| T06 | INPUT edit → PATCH | **Có:** textarea + `save declaration`, PATCH CAS. YAML không có dòng `known_limitations` (17 key server, VD-03), nên pack hàng 10/12 là nơi cập nhật |
| T07 | INPUT read-only sau publish | **Lệch / P22:** chưa có publish; sau SEALED_LOCAL INPUT vẫn sửa được vì server giữ `may_edit_draft: true` (VD-16) |
| T08 | 409 race | **Có:** banner + đọc lại, giữ text |
| T09 | copy yaml | **Có:** clipboard = join server; "✓ copied" 1.5 s; reject → "copy unavailable" (VD-17) |
| T10 | taxonomy CHANGED | **Một phần (unit):** server P21 luôn trả UNSET (không có predecessor), nên không dựng được bằng source thật; FE in đúng state server gửi (U07) |
| T11 | mirror poll SUPERSEDED | **`PENDING_OWNER_PHASE` (P22).** `mirror=null`, không poll |
| T12 | 12 link nguồn | **Có về hành vi:** Link = href server nguyên chuỗi; Alpha360 span + title hi-fi (VD-07, VD-12). Href lệch route FE, xem `CG-P21-02` |
| T13 | 660 px | **Có:** rail wrap, pack cuộn ngang ≥ 960, YAML cuộn, overflow trang 0 |
| T14 | axe | **Chưa chạy** (axe-core không có trong lock, B3). `aria-disabled` + `aria-describedby` có ở unit và browser |
| T15 | PATCH/seal 401 | **Có** |
| T16 | 403 / typed refusal | **Có**, 404 cùng câu với 403 (VD-11; D7) |
| T17 | 502/503/timeout | **Có:** unavailable, giữ composition/draft, retry do người dùng |
| T18 | mirror 502 → stale | **`PENDING_OWNER_PHASE` (P22)** |
| T19 | 422 | **Có:** seal 422 terminal (browser); PATCH 422 terminal (unit U21) |

Spec DoD "copy diff 0" **không đạt**, vì các lệch copy có chủ đích VD-02/04/05/10/13/15/17/20 đang chờ Bobby (B2). Spec DoD "screenshot ≤ 1%" không đo (không pixel-diff).

### 5.4 So hi-fi với product (1280 / 660)

Hi-fi mở `file://`, support.js render được. Bản draft và published (click Publish) ở `p21-hifi-draft-*`, `p21-hifi-published-*`. Biến thể unbound của hi-fi chỉ vào được qua demo props nên không chụp. So ở mức bố cục + copy, không pixel-diff.

| # | Vùng | Hi-fi | Product | Ledger |
|---|---|---|---|---|
| H1 | Rail | 1 hàng, id ngắn | Receipt B và lượt 1 C: 2 hàng ở 1280 (node chứa digest 71 ký tự). **`3af31923`: 1 hàng** (5 node chia đều rail, digest wrap trong node) | C1; VD-21 |
| H2 | Digest pack | `prm_7c1a9e`, `sha256:3fe4a1` ngắn | Digest 64-hex server, 1 dòng ellipsis + `title` đủ (DOM giữ nguyên chuỗi) | VD-21 |
| H3 | YAML | cắt `…` | cuộn ngang trong container (710/524 ở 1280) | B6 giữ (hi-fi cũng `overflow-x:auto`) |
| H4 | Chip DRAFT + "RUN REPORT" | dưới subtitle, căn trái | căn phải header | VD-19 (link) — layout ghi chung B2 |
| H5 | Module header "QuantBT Backtest REAL" phía trên | không có | shell module (nhánh chưa có DQ-01 của baseline) | B1 |
| H6 | Nút | Publish vàng đặc | "Local seal evidence pack", ghost viền đứt khi `aria-disabled` | VD-02, VD-15 |
| H7 | Nhãn source | "09 report", "05 split"… | nhãn server ("Engine Atlas"…) | VD-07 |
| H8 | Nền DEGRADED | `#fdfbf5` ấm rất nhạt | Lượt B: `--paper`, gần trùng nền trang; `e4c47d6a`: `--accent-soft` (xanh xám, sai); **`3af31923`: `--state-degraded-bg` tint degraded** | C2 (token rule over hi-fi) |
| H9 | Reason code ở 660 | — | Lượt B gãy giữa chữ (`break-all`); `e4c47d6a`: `overflow-wrap: anywhere` | B5 |
| H10 | Meta line mono | không có | có | VD-13 |
| H11 | Sidebar tối full-page dừng ~713 px | — | artefact shell, không thuộc S11 | ghi |
| H12 | 660 | hi-fi tự tràn 52 px | product 0 | B7 |
| H13 | Mirror status | "—" | "status not published" | VD-20 |
| H14 | Publish/mirror | card publish thật + inbox row PENDING SLA | ghost P22 | VD-02 |

## 6. Visual decision ledger `VD-P21-01…21`

Nguồn:
- 01–10 từ plan P21 §3.
- 11–19 phát hiện ở gói A.
- 20–21 từ audit sau gói B.

Mỗi VD cũng có ở [handoff addendum](./frontend-handoff-claude.md#thanhvuong-addendum--nợ-mới-p21-cho-các-phase-sau-2026-09-24) và ở note Unified. Ảnh so: hi-fi `p21-hifi-draft-1280.png` `981f4e83a02939b0` vs product `p21-bound-virtual-1280.png` `edb55a501b85aba4`, trừ khi ghi khác.

| VD | Hi-fi | Contract / spec | Quyết định trong code | State |
|---|---|---|---|---|
| `VD-P21-01` | Chip state DRAFT / PUBLISHED / NOT_PUBLISHABLE | `state` luôn `DRAFT`; `local_seal.state` riêng | Chip chính `DRAFT` + chip `SEALED_LOCAL` riêng khi seal; `NOT_PUBLISHABLE` chỉ là badge banner | `REQUIRES_BOBBY_DECISION` (layout). Ảnh sealed `24b0a8dda83cb091` |
| `VD-P21-02` | Card Publish + nút "Publish release candidate …" | P21 chỉ local seal; handoff: nút phải ghi **Local seal evidence pack** | Card local seal thay card publish; câu giải thích ngắn theo handoff; publish + mirror là ghost "P22 not commissioned" | `REQUIRES_BOBBY_DECISION` (copy/layout) |
| `VD-P21-03` | YAML 17 key hi-fi (`alpha_artifact_digest`, `entrypoint`, `selected_parameter_artifact_id`, …, `known_limitations`, `proposed_use_restrictions`, `created_at`) | `fields[17]` = `yaml[17]` key server khác | Render 17 key server nguyên thứ tự; declarations nằm ở pack 10/12 | `REQUIRES_BOBBY_DECISION` (hi-fi ≠ contract). Ảnh copy-yaml `588667f77202c02f` |
| `VD-P21-04` | Taxonomy CHANGED/UNCHANGED + caption "last published rc — rc_2026_08_c" | taxonomy toàn `UNSET`; `published_comparison` NOT_PUBLISHED `P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED` | In UNSET; caption là typed absence, không rc giả | `REQUIRES_BOBBY_DECISION` (copy) |
| `VD-P21-05` | Chip "claim ceiling B" / "engine cert L2" | `certification_axes` riêng; engine luôn NOT_PUBLISHED | Axis vắng → ghost dashed + reason; methodology có value → in value server (audit A4) | field-driven |
| `VD-P21-06` | Rail detail "θ* #143 · SelectionTraceV1" | `rail[].value/detail` server | In value/detail server; node `run` ghi nhãn "run / attempt" | field-driven |
| `VD-P21-07` | Nhãn/đích nguồn "09 report", "05 split" | `pack[].source.{label,href}` server; href lệch route FE (`/replay`, `/research/alphas/…`, `/research/quantbt`) | Link verbatim, không rewrite; test không assert route tồn tại | field-driven (`CG-P21-02`) |
| `VD-P21-08` | INPUT textarea inline, không có nút save rõ | PATCH CAS | Nút `save declaration` + CAS + banner 409 | `REQUIRES_BOBBY_DECISION` (layout) |
| `VD-P21-09` | Không có route pack | Pack GET có sẵn | Route read-only `/research/quantbt/release-candidates/:id` để rc node và sealed card có đích | route |
| `VD-P21-10` | YAML null `null   # NOT_PUBLISHABLE` | null + `availability.reason_code` | `null  # <reason_code>` | `REQUIRES_BOBBY_DECISION` (copy) |
| `VD-P21-11` | — (handoff codex: 404 terminal) | F-04 plan: 403 = 404, không xác nhận run tồn tại | 404 → `denied` cùng câu 403, ở cả read và write (audit A3) | `REQUIRES_BOBBY_DECISION` (discrepancy D7) |
| `VD-P21-12` | Alpha 360° "outside this prototype" | href null / không same-origin | Span; hàng passport có `ALPHA360_TITLE`; hàng khác "the server published no link for this row" | rule over hi-fi |
| `VD-P21-13` | Không có dòng meta | CAS fence cần thấy được | Dòng mono authority / as-of / source fingerprint / draft state·revision·saved-at | `REQUIRES_BOBBY_DECISION` (layout; cùng nhóm `S10-COUNTS-PANEL`, `VD-P20-08`) |
| `VD-P21-14` | Textarea không có rule | OpenAPI `DraftPatch`: mỗi declaration `string minLength 1 maxLength 4096 | null`, **khối `not` cấm cả hai null**; service `z.string().trim().min(1).max(4096)` + `superRefine` "at least one declaration is required" (400). d.ts không diễn đạt được `not` | Text đã khai hiện dưới hàng INPUT; một nút save gửi text editor đang mở + giá trị server của editor đóng; ô trống sau trim → `null`. **Sau audit A1 (`cad8bed9`):** bỏ rule FE "at least one declaration is required"; hai ô trống gửi `null`/`null` và server trả 400 → `terminal`, giữ text. Gói C kiểm lại thấy rule đó **có trong contract** (D15); `c16ece61` revert `cad8bed9`, khôi phục chặn trước khi gửi với đúng câu của contract, U17 trở lại chứng minh không có PATCH; debt `S11-A1-BOTH-NULL` đóng | `REQUIRES_BOBBY_DECISION` (hành vi trim A2; rule hai-null đã theo contract) |
| `VD-P21-15` | Nút publish disabled | handoff: `aria-describedby` giải thích | Nút `aria-disabled` (vẫn focus), describedby → nhãn lý do · code; VIRTUAL draft → "save the two declarations first — the draft is not persisted yet" (FE-derived từ `draft.draft_id === null`, vì POST seal cần `draft_id`, audit A6) | `REQUIRES_BOBBY_DECISION` (copy) |
| `VD-P21-16` | Spec T07: INPUT read-only sau publish | `may_edit_draft` luôn true; không có publish ở P21 | INPUT vẫn sửa được sau SEALED_LOCAL; seal lại do server quyết | `REQUIRES_BOBBY_DECISION` (spec ≠ contract) |
| `VD-P21-17` | "✓ copied" 1.5 s | Clipboard có thể bị từ chối | "✓ copied" chỉ khi `writeText` resolve; reject/không có → "copy unavailable"; timer clear khi unmount | rule over hi-fi |
| `VD-P21-18` | — | `PackResponse` không có `pack_counts` / `certification_axes` | Pack route: "counts are not part of the frozen pack"; chip cert ghost "not part of the frozen pack"; không đếm ở FE | field-driven (`CG-P21-05`). Ảnh pack-route `88a1e429afaa5fbd` |
| `VD-P21-19` | Header có link "run report"; S10 "rc & publish →" | Route S11 theo run | Giữ link run report → `/runs/:id/report`; S10 alpha-level giữ span + lý do viết lại | route |
| `VD-P21-20` | Mirror ghost status "—" | Hard rule 3: không "—" thay giá trị; `mirror=null` | `e4c47d6a`: "status not published" (`data-mirror-status="not-published"`, :1137) (audit B1) | `REQUIRES_BOBBY_DECISION` (copy hi-fi). Ảnh ghosts/bound-virtual `edb55a501b85aba4` |
| `VD-P21-21` | Digest và id ngắn trong pack và rail | Digest server 64-hex + tiền tố | Pack: 1 dòng ellipsis `max-width 250px` + `title` = giá trị đủ, DOM giữ chuỗi (audit B4). Rail: node chia đều rail (`flex: 1 1 150px`), digest wrap **trong** node (`3af31923`, C1) | `REQUIRES_BOBBY_DECISION` (layout). Ảnh `p21-bound-virtual-1280.png` `edb55a501b85aba4` vs hi-fi `981f4e83a02939b0` |

## 7. Discrepancy

| # | Mục | Nguồn A | Nguồn B | Đang làm | Loại |
|---|---|---|---|---|---|
| D1 | Publish | Hi-fi/spec: nút Publish, PUBLISHING → PUBLISHED, chip PUBLISHED | Contract P21: `publish.enabled=false`, `P22_PUBLICATION_NOT_COMMISSIONED` | Local seal card + publish ghost (VD-01/02); spec T02 `PENDING_OWNER_PHASE` | P22 boundary (B5) |
| D2 | Mirror | Hi-fi inbox row (subject, state, SLA, assignee, decisions) | `mirror=null`, không fixture, không poll | Ghost copy hi-fi + "status not published" (VD-20); spec T11/T18 `PENDING_OWNER_PHASE` | P22 boundary (B5) |
| D3 | Cert | Hi-fi "claim ceiling B" / "engine cert L2" | Hai axis riêng; engine luôn `NOT_PUBLISHED` | Ghost + reason (VD-05) | field-driven |
| D4 | Taxonomy | Hi-fi CHANGED/UNCHANGED + `rc_2026_08_c`; spec T10 | Toàn UNSET, `published_comparison` NOT_PUBLISHED | In server (VD-04); T10 chỉ unit | P22 (predecessor chỉ có khi publish) |
| D5 | YAML keys | Hi-fi 17 key (có `known_limitations`, `proposed_use_restrictions`, `created_at`) | Server 17 key khác | In server (VD-03) | `REQUIRES_BOBBY_DECISION` |
| D6 | Source href | Route FE: `runs/:id/execute`, `/research/quantbt/alphas/:id/compare`, `/research/quantbt/atlas`, không có `/research/alphas/:id` | Server: `…/replay`, `/research/alphas/{id}/compare`, `/research/quantbt`, `/research/alphas/{id}` | Link verbatim (VD-07) | `CG-P21-02` |
| D7 | 404 | Handoff codex P21: 400/404/422 terminal | Plan F-04 (S10/S13): 403 = 404 `denied`; baseline `0fa3c385` `researchRefusal.ts`: 404 → terminal `notFound` | Giữ F-04 như S10/S13 (VD-11, audit A3) | Bobby (B1) |
| D8 | INPUT sau seal | Spec T07 read-only sau publish | `may_edit_draft` luôn true | Editable (VD-16) | `REQUIRES_BOBBY_DECISION` |
| D9 | Pack route | Hi-fi không có | `PackResponse` có `frozen_core` nhưng không `pack_counts`/`certification_axes` | Route read-only (VD-09, VD-18) | `CG-P21-05` |
| D10 | Nền DEGRADED | Handoff "DEGRADED remains visible yellow"; hi-fi `#fdfbf5` | Token gate cấm raw color | `--state-degraded-bg` (`3af31923`, C2) | rule over hi-fi |
| D11 | YAML rc | Spec T01 "(assigned on publish)" | `release_candidate_id` null + `NOT_APPLICABLE` `P21_ASSIGNED_ON_LOCAL_SEAL` | `null  # P21_ASSIGNED_ON_LOCAL_SEAL` (VD-10) | `REQUIRES_BOBBY_DECISION` |
| D12 | Generate | Handoff: `npm --prefix packages/contracts run generate:research-release-candidate` trước khi dùng | Plan §0: d.ts đã có trên nhánh; FE không chạy generate (không sửa `packages/contracts`) | Dùng d.ts `454b99c6` (SHA `5558743b960eb48c`); baseline chỉ thêm verify script | ghi |
| D13 | "Code anatomy" | Handoff: render "Code anatomy" như presentation substage | Hi-fi 11 và spec 11 không có khối "Code anatomy" (grep hi-fi 0; spec chỉ có tiêu đề "Layout anatomy") | Không dựng khối mới | ghi; Bobby/Codex xác nhận ở B2 |
| D14 | Declaration trim | OpenAPI khai `minLength 1 / maxLength 4096`, không khai trim | Service trim rồi `min(1).max(4096)` | FE trim → null khi trống, không cắt độ dài, dựa vào 400 (VD-14). **Không mở request**: độ dài đã có trong contract | ghi |
| D15 | Hai declaration null (audit A1) | Audit A1 (và plan) cho rằng contract cho phép null cả hai | OpenAPI `DraftPatch.not` + `ResearchReleaseCandidateDraftPatchSchema.superRefine` (`release-candidate.contract.ts:31–35`) cấm cả hai null, trả 400 | Code `cad8bed9` gửi PATCH `null`/`null` → 400 → `terminal` panel-local, text còn. Không sửa `src` trong gói C (không phải lỗi probe, và brief cấm sửa); Fable sửa sau gói C: `c16ece61` revert `cad8bed9` | debt `S11-A1-BOTH-NULL` **ĐÓNG @ `c16ece61`**; receipt lượt 4 §12.3 |

Lỗi tìm ra và đã sửa trong phase:

| Mục | Tìm ra ở | Xử lý |
|---|---|---|
| Hex trong comment CSS | Gói A, `tokens.test.ts` | Amend commit 2 trước commit 3 |
| FE tự chặn PATCH khi cả hai declaration null | Audit A1 (tiền đề sai, D15) | `cad8bed9` (U17 đổi), **hoàn lại** ở `c16ece61` (U17 trở lại) |
| Mirror ghost in "—" trần | Gói B F-B1, audit B1 | `e4c47d6a` (VD-20) |
| Rail 2 hàng ở 1280 | Gói B H1, audit B2 → C1 | `e4c47d6a` cap node 340 px chưa đủ (li vẫn 549 px); `3af31923` `li { flex: 1 1 150px }` |
| Nền DEGRADED gần trùng trang | Gói B H8, audit B3 → C2 | `e4c47d6a` `--accent-soft` (xanh xám, sai); `3af31923` `--state-degraded-bg` |
| Digest pack 2 dòng | Gói B H2, audit B4 | `e4c47d6a` (VD-21) |
| Reason code gãy giữa chữ ở 660 | Gói B H9, audit B5 | `e4c47d6a` `overflow-wrap: anywhere` |

Còn mở (không sửa trong phase, xem [debt register](./thanhvuong-debt-register.json)):
- **`S11-A1-BOTH-NULL`** (D15): **ĐÓNG @ `c16ece61`** (revert `cad8bed9`). Từ `cad8bed9` đến `3af31923`, hai ô trống gửi PATCH `null`/`null` trái contract (OpenAPI `DraftPatch.not`, `superRefine` 400) và người dùng nhận `terminal`. `c16ece61` khôi phục chặn trước khi gửi với đúng câu của contract ("at least one declaration is required"); U17 chứng minh không có PATCH.
- **`S11-RAIL-DIGEST-WRAP`**: ở `3af31923` digest bundle trong node rail "selected params" wrap nhiều dòng bên trong node, nên node đó cao hơn các node khác. Rail 1 hàng, không tràn, nhưng khác hi-fi (id ngắn). Ghi chung VD-21, chờ B2.
- **`S11-T10-CHANGED-UNREACHABLE`**: taxonomy CHANGED chỉ có unit, không có source thật tới P22.
- **`S11-LOCAL-DUPLICATION`**: `call<T>` và mapper refusal riêng trong `releaseCandidateClient.ts`, trong khi baseline đã có `researchRefusal.ts`. Nên gộp khi tích hợp (B1).

## 8. Scale refine (CLAUDE.md §8)

| Ô | S11 |
|---|---|
| Cardinality | Contract cố định: rail 5, taxonomy 4, fields/yaml 17, pack 12, declarations 2. Không danh sách mở |
| Break point | Rail flex-wrap, `li` `flex: 1 1 150px`; pack table `min-width 960` cuộn trong `[data-pack-scroll]`; YAML cuộn trong container; ≤ 660 banner/meta wrap |
| Degradation | `availability=PARTIAL` → notice + reason, giữ 12 hàng; refusal HTTP → panel-level, giữ header/rules |
| Server contract | Đã có: bound cố định, CAS, idempotent seal, typed availability. Cần: fixture (`CG-P21-01`), href khớp route (`CG-P21-02`), ETag khai hay bỏ (`CG-P21-03`), `Problem.message` (`CG-P21-04`), counts/cert ở pack (`CG-P21-05`) |
| Invariant | Không đếm/sort/format; digest/id nguyên chuỗi (hiển thị ellipsis, `title` đủ); null không thành 0/—/N/A; chip chính không bao giờ PUBLISHED |
| Perf budget | 1 GET compose mỗi `runId`; write chỉ khi bấm; seal xong → 1 GET compose; không poll, không refetch on focus; response cũ bị bỏ (sequence guard) |

## 9. Request cho Codex

Receipt đầy đủ: [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md). Tất cả OPEN, kiểm lại 2026-09-24 trên `3af31923`, `4d296c06` và `0fa3c385` (contract, service, d.ts không đổi). Plan dự kiến thêm một request về `maxLength` declaration; gói C kiểm OpenAPI thấy đã có `minLength 1 / maxLength 4096` nên **không mở** (D14).

| ID | Nội dung |
|---|---|
| `CG-P21-01` | Fixture canonical compose/pack (bound READY, VIRTUAL, unbound, MISSING, DEGRADED, PARTIAL, SEALED_LOCAL, pack) + Problem |
| `02` | `pack[].source.href` lệch route FE canonical |
| `03` | ETag: controller gửi header `etag` (compose = `source_fingerprint`, pack = `pack_digest`) nhưng OpenAPI không khai header/304 và không xử lý `If-None-Match` — khai vào contract hay bỏ |
| `04` | `Problem.error.message`: FE chỉ in code + request_id — xác nhận message không dành cho UI |
| `05` | `PackResponse` không có `pack_counts` / `certification_axes`: xác nhận cố ý hay thêm vào frozen core |

## 10. Kết luận có phạm vi

- **`P21-A S11 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · đã push, chưa PR`.**
  - Composer + pack route + 3 entry link dựng theo hi-fi trong giới hạn contract P21 (nửa local). Publish/mirror là ghost P22; ô không có field giữ vị trí hi-fi + typed absence + `CG`.
  - Head `3af31923`: tsc 0, build 0, vitest 173 file · 3128 pass · 1 skip, S11 34/34, tvp21 82/82, probe Research 244/244 (`--workers=1`).
  - Head `c16ece61` (revert `cad8bed9`, sau gói C): tsc 0, build 0, S11 34/34, tvp21 82/82, 78 RECEIPT sạch (§12.3); toàn Research không chạy lại vì commit chỉ đổi gate trong `useDeclarationEditor` + U17.
  - 78 RECEIPT (1280/660; 26 gate sáng + 13 gate tối): overflow 0 / console 0 / mutation 0 / foreign 0 / bare 0 / knownBare 0.
  - Ở 1280: rail 1 hàng, digest pack 1 dòng; DEGRADED ≠ nền trang.
- **Chưa `VERIFIED`.** Còn thiếu:
  - `REAL_API_E2E_RECEIPT` (feature-dark), `V11-P21-DR`, axe (T14), telemetry.
  - Spec T02/T11/T18 (`PENDING_OWNER_PHASE` P22).
  - Tích hợp baseline (B1).
  - `CG-P21-01…05`.
  - VD `REQUIRES_BOBBY_DECISION` (B2).
  - `open_implementation_debt`: `S11-RAIL-DIGEST-WRAP` (`S11-A1-BOTH-NULL` đã đóng @ `c16ece61`).

## 11. Reuse report (v0.5 §11.3)

| Tái dùng | Từ đâu |
|---|---|
| `toLineageRefusal` / `LineageRefusal` (read refusal, 403 = 404 `denied`, câu F-04) | `research/lineageClient.ts` (S10) |
| Mẫu `call<T>` + CSRF + `PortalApiError` | `research/freezeClient.ts` (S07), `lib/api` |
| `iso()` UTC phút cho `as_of`, `sealed_at`, `updated_at` | `research/utcMinute.ts` (P18) |
| `ResearchPanel`, `ResearchState` / `researchState`, `Notice` | `research/ResearchPanel.tsx`, `research/state.ts` |
| Mẫu hook AbortController + sequence guard + write ref | `useCompare.ts` (S13), `useFreeze.ts` (S07) |
| Link style `data-action` ở hub | `EvidenceFlow.tsx` ("generate report → 09") |
| CSS scoped `.rc-page` specificity thấp | mẫu `.cp-page` (S13), `.ln-page` (S10) |
| Token Fund Paper (`--accent`, `--warn`, `--bad`, `--bad-bg`, `--good`, `--state-degraded-bg`, `--ink-*`, `--line*`, `--paper`, `--font-mono`) | `tokens.test.ts` xanh |

Mới hoặc cục bộ có chủ đích:
- `Rail`, `Taxonomy`, `CertChips`, `PackRow`, `SourceCell`, `DeclarationRow`, `RecordBlock`, `SealCard`, `SealedCard`, `PublishGhost`, `MirrorGhost`: grammar riêng của S11, không có component tương đương.
- `toRcWriteRefusal`: có 409 conflict, mà mapper read không có.

Việc gộp mapper/`call<T>` vào `researchRefusal.ts` của baseline để lại cho tích hợp (B1, debt `S11-LOCAL-DUPLICATION`). Không có màu raw ngoài token, không có asset ngoài, không thêm dependency.

## 12. Audit Fable P21 và ba lượt receipt

Fable audit sau mỗi gói (A → B → C lượt 1). Không có audit độc lập riêng như P20; các finding dưới đây là toàn bộ `AUDIT.md` của phase.

### 12.1 Finding → cách xử lý → bằng chứng

Dòng code tính ở `3af31923` (`ReleaseCandidateDetail.tsx`).

**Sau gói A (head sau audit `cad8bed9`):**

| Mã | Vấn đề | Xử lý | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| A1 | `useDeclarationEditor` tự chặn PATCH khi cả hai declaration null ("at least one declaration is required"), trong khi (theo audit) contract cho phép null cả hai và server quyết (hard rule 5) | Bỏ rule; S11-U17 đổi thành "hai ô trống gửi null" | FIXED @ `cad8bed9` (+11/−11). **Gói C kiểm lại: tiền đề sai** — OpenAPI `DraftPatch.not` và `superRefine` của server cấm cả hai null (D15). Hành vi từ `cad8bed9` đến `3af31923`: 400 → terminal, text còn. **Fable sửa sau gói C: `c16ece61` revert `cad8bed9`** (+11/−11), U17 trở lại chặn trước khi gửi; debt đóng | U17; VD-14; §12.3 |
| A2 | `normalized()` (:1167) trim → null: FE biến đổi input trước khi gửi | Giữ (server cũng trim, 1..4096) | RECORDED → VD-14, D14 (độ dài đã có trong OpenAPI, không mở request) | U15 |
| A3 | 404 → `denied` cùng câu 403, khác handoff codex (404 terminal) | Giữ theo F-04 | RECORDED → VD-11, D7, Bobby (B1) | U20, U26, U31; browser F04 |
| A4 | Chip cert in `methodology_claim.value` khi có ("claim ceiling B"); engine luôn ghost | Đúng contract | RECORDED → VD-05 | U08 |
| A5 | Grep `toFixed/Intl/sort(/scrollIntoView/error.message` = 0; không hex; không chữ PUBLISHED; copy hi-fi verbatim (subtitle, banner, footer pack, SoD, mirror ghost, rules, 2 title chip) | — | PASS | grep + U03 |
| A6 | Nút seal `aria-disabled` + `aria-describedby`; VIRTUAL draft chặn bằng câu FE-derived từ `draft.draft_id === null` | Đúng contract (POST seal cần `draft_id`) | RECORDED → VD-15 | U06, U24; browser keyboard |

**Sau gói B (head `e4c47d6a`):**

| Mã | Vấn đề (B-report) | Xử lý | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| B1 | Mirror ghost in "—" trần làm status (hi-fi verbatim), vi phạm hard rule 3 | "status not published" + `data-mirror-status` | FIXED @ `e4c47d6a` → VD-20 | browser ghosts: text + attr; `knownBare=0` |
| B2 | Rail 2 hàng ở 1280 vì node chứa digest 64-hex | `.rc-node max-width 340px` | **Chưa đủ** — lượt 1 gói C bắt lại (C1) | `final/pw-tvp21.log` `c0d46db8b2a2dbfe` |
| B3 | Hàng DEGRADED nền `--paper` gần trùng trang | `--accent-soft` | **Sai token** — sửa lại ở C2 | — |
| B4 | Digest pack 64-hex xuống 2 dòng | 1 dòng ellipsis + `title` đủ | FIXED @ `e4c47d6a` → VD-21 | `digestOneLine=10/10` |
| B5 | Reason code `break-all` gãy giữa chữ ở 660 | `overflow-wrap: anywhere` | FIXED @ `e4c47d6a` | `p21-unbound-660.png` `647bca47d895d649` |
| B6 | YAML cuộn ngang ở 1280 | Giữ (hi-fi cũng `overflow-x:auto`, nowrap) | ACCEPTED | yamlScroll 710/524 |
| B7 | Hi-fi tự tràn 52 px ở 660 | Ghi nhận, không phải lỗi product | RECORDED | `HIFI@660 overflow 52` |

**Sau gói C lượt 1 (probe trên `e4c47d6a`) → head `3af31923`:**

| Mã | Vấn đề | Xử lý | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| C1 | Rail vẫn 2 hàng ở 1280: cap 340 px nằm trên `.rc-node` nhưng `li` giữ width nội dung 549 px, mũi tên treo xa node. Width `li` `[178,147,131,549,136]`, tổng 958 > rail 934 px; tops `[337,337,337,410,418]` | `.rc-rail > li { flex: 1 1 150px; max-width: 100% }` (:215), `.rc-node { flex: 1 1 auto; min-width: 0; max-width: 100% }` | FIXED @ `3af31923` | lượt 2: `railTops=[337,337,337,337,337]` |
| C2 | `--accent-soft` là xanh xám `rgb(226,237,240)` trong theme research light; commit `e4c47d6a` ghi nhầm "tint vàng nhạt" | `tr[data-s="DEGRADED"] > td { background: var(--state-degraded-bg) }` (:264) | FIXED @ `3af31923` | degraded `rgb(244, 236, 219)` = token ≠ trang |

### 12.2 Ba lượt receipt `cad8bed9 → e4c47d6a → 3af31923`

| Lượt | Head | Probe | Kết quả | Evidence (`~/tv-shots/p21/…`) |
|---|---|---|---|---|
| Gói B | `cad8bed9` | spec `8519b24eaa0bbb2a` (`KNOWN_BARE={"—"}`) | tvp21 **82/82** (3.1 m); toàn Research **244/244** (6.2 m); knownBare=1 "—" (F-B1) | `pw-tvp21-final.log` `80a0beca2cbc7d0c`, `pw-research-all.log` `c6dc4040d3c84be2`, `probe.log` `65d78b900e4d61ca` |
| Gói C lượt 1 | `e4c47d6a` | spec `2fa574fd67663634` (KNOWN_BARE rỗng; G17 mirror status; G05 = `--accent-soft`; G02 `.rc-node` tops + digest 1 dòng) | tvp21 **81/82**: G02 @1280 rớt (rail 2 hàng) → **DỪNG**, không chạy toàn Research, không viết docs | `final/pw-tvp21.log` `c0d46db8b2a2dbfe`, ảnh chẩn đoán `dd406b518ea642b6` |
| Gói C lượt 2 | `3af31923` | spec `e3fb71fef3235e25` (G05 = `--state-degraded-bg`, ≠ COMPLETE, ≠ nền trang; G02 đo `.rc-rail > li` tops + left tăng dần) | Vòng 1 G02 @1280 rớt do **probe** (đo top `.rc-node` được căn giữa dọc trong `li`: `[363,363,363,337,363]`), sửa probe; tvp21 **82/82** (2.8 m); toàn Research **244/244** (6.4 m) | `final2/iter1/pw-tvp21.log` `2d6c45d787091153`; `final2/pw-tvp21.log` `05650b13aa753ce6`, `pw-research-all.log` `bc3258c3d663e02f`, `p21/probe.log` `628600c7e85544b0` |

Không phát hiện lỗi code mới ở lượt 2. Lỗi duy nhất trong lượt là của probe, cách đo top node rail; đã sửa ở probe, không sửa `src`.

### 12.3 Lượt receipt 4 `c16ece61` (sau gói C)

Gói C không sửa `src` (đúng brief) và ghi D15. Fable kiểm lại contract trên server (`release-candidate.contract.ts:31–35` `superRefine`, OpenAPI `DraftPatch.not`) và kết luận tiền đề A1 sai, nên gate gốc của gói A là rule của contract, không phải rule FE tự đặt. Sửa bằng `git revert cad8bed9` thành commit mới `c16ece6149d7f99328a872d291290b4082ed0bba` (tree `57a290a22c8266cbf8f36d1b99e7e7e25cbd7103`; `ReleaseCandidateDetail.tsx` +6/−3, `releaseCandidateDetail.test.tsx` +5/−8; U17 trở lại "save is refused before sending when both declarations would be empty"). Không đổi contract, backend, route hay DOM/CSS mà probe đo.

| Lane | Kết quả | Evidence (`~/tv-shots/p21/final3/`) |
|---|---|---|
| tsc `-b --noEmit` | 0 | terminal |
| vite build | 0 | terminal |
| vitest S11 | 34/34 | terminal |
| tvp21 `--workers=1` | **82/82**, 2.9 phút; 78 RECEIPT overflow 0 / console 0 / mutation 0 / bare 0 | `pw-tvp21.log` `304b62999f91ef12`; `p21/probe.log` `628600c7e85544b0` (byte-giống lượt 3) |
| Toàn Research | không chạy lại | commit chỉ đổi gate FE + U17 |

- Probe: cùng spec/config lượt 3 (`e3fb71fef3235e25` / `ae27a91cd86f7b74`), preview 4417 riêng, kill theo PID, `ss -ltnp | grep 4417` rỗng, spec/config tạm đã xoá, `git status --short` rỗng; không đụng 4317–4320.
- Vòng chạy đầu của lượt 4 ghi log vào `/tmp/p21-shots` (chưa tạo; 6 test đầu rớt vì `ENOENT`, không phải code); đặt `P21_SHOT_DIR` và chạy lại từ đầu. Log vòng đầu giữ ở `final3/iter1-pw-tvp21.log`, thư mục lệch dời vào `final3/iter1-shots-misrouted/`.
- Hash `final3/hashes.txt` 215 file.
