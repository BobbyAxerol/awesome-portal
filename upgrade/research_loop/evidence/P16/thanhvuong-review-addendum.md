# P16 — Thanhvuong review addendum (Screen 07 Freeze)

**Trạng thái:** `P16 frontend review correction pending Codex source-capability disposition`.
P16-A frontend đã sửa và có receipt dưới đây. **P16-B không done**: vẫn
`SOURCE_CAPABILITY_BLOCKED` theo [capability matrix](./source-capability-matrix.md).
Addendum này chỉ ghi lại thay đổi và evidence. Nó không đổi rule, không đổi
contract, không đổi phase gate.

Bobby sẽ hợp thức hoá phạm vi "P16 review correction + P17–P21 frontend" trong
policy. Campaign handoff hiện ghi P16 là phần chỉ đọc, và contributor không tự
sửa rule/control-plane.

## 1. Git: base, head, branch

| Mục | Giá trị |
|---|---|
| Branch | `feat/thanhvuong/research-p17-p21` → remote `primus-origin` (`git@github.com:PrimusSparkQuant/awesome-primus-portal.git`) |
| Base (provisioned, `docs/research-loop-plan`) | `30fb9f21473bfa4cd1bd6baecb4b927f2ad8d196` = `git merge-base HEAD primus-origin/docs/research-loop-plan` |
| Frontend head (đã push) | `65a8acc55fcea186a94f2b7e1eb31f81032ec19a` — `fix(research): align S07 Freeze with hi-fi panels and keep BLOCKED visible` |
| Docs head | commit chứa file này (chỉ thêm file này + một dòng trạng thái P16 trong Unified §13) |
| PR | chưa mở. Khi Bobby yêu cầu: một PR duy nhất vào `docs/research-loop-plan`, không merge/rebase/force-push |

## 2. File frontend đã sửa (`git diff --numstat 30fb9f21..65a8acc5`)

| File | + | − | Mục đích |
|---|---:|---:|---|
| `apps/portal/frontend/src/research/FreezeDetail.tsx` | 314 | 95 | F1 trục data-time (IS / outer OOS / holdout gạch chéo, đặt theo UTC-ms server); F2 bảng frozen parameters 5 cột (số mono, cột Reading `25.7% · in range` lấy từ `position_percent` + `bound_state`); F4 panel "Binding down to Stage 4" typed-absent (`not compared`); layout 2 cột ở xl; `break-all` cho digest; kết quả verify trong `role="status" aria-live="polite"` |
| `apps/portal/frontend/src/research/useFreeze.ts` | 4 | 1 | `rowCount` lấy từ `freeze.integrity.checks.length` thay vì `frozen_parameters`, để BLOCKED (bảng rỗng có chủ đích) không bị `researchState` đọc thành `empty` |
| `apps/portal/frontend/src/research/freezeDetail.test.tsx` | 112 | 0 | Unit: trục F1, bảng F2, F4, BLOCKED không thành empty, live region có sẵn trước khi bấm verify |
| `apps/portal/frontend/e2e/_probe-research-product.spec.ts` | 151 | 0 | Browser: bảng thẳng hàng + F1/F4 ở laptop/mobile; BLOCKED giữ mismatch ở laptop/mobile; reduced motion trước/sau verify (T16) |
| **Tổng** | **581** | **96** | 4 file |

Không đụng backend, `packages/contracts/**`, OpenAPI, generated client,
fixtures canonical, migrations, `apps/portal/strategy/**`, control-plane,
`package.json` hay lock file. `npm run generate:research-freeze` trong
`packages/contracts` (openapi-typescript 7.13.0) exit 0, `git status` sạch:
generated type khớp OpenAPI.

## 3. Receipt thực tế — chạy lại 2026-09-23T09:19Z trên workspace Linux

### 3.1 Workspace và verifier (Rules A1.1/A1.2)

| Kiểm tra | Kết quả |
|---|---|
| `id -un` / `id -u` / `id -nG` | `thanhvuong` / `1001` / `thanhvuong primus-market-data-readers` |
| `pwd -P` = `git rev-parse --show-toplevel` | `/home/thanhvuong/awesome-primus-portal` |
| `git branch --show-current` | `feat/thanhvuong/research-p17-p21` |
| `git remote` | chỉ `primus-origin` (URL SSH, không có credential nhúng) |
| `./scripts/verify-contributor-workspace.sh` | **exit 0**: "Contributor workspace verification passed for branch feat/thanhvuong/research-p17-p21 and remote primus-origin." |
| Hook có active không | **Không.** `git config --get core.hooksPath` không đặt ở cấp nào (exit 1), `.git/hooks/` trống. Repo có `.githooks/{pre-commit,pre-push,…}` nhưng workspace này chưa được nối vào. Verifier ở trên không kiểm tra điều này |
| Hệ quả | Commit `65a8acc5` và lần push của nó **chạy không có hook**. Báo cáo chat trước đó ghi "pre-push hook chạy bình thường" là **sai**; câu đó được rút lại tại đây. Không dùng `--no-verify`, và cũng không có hook nào để bỏ qua |
| Bù bằng chạy tay (không sửa cấu hình) | Chạy trực tiếp `.githooks/pre-commit` trên staged diff của docs commit này. Kiểm lại `65a8acc5` bằng cùng các luật: 4 path đều thuộc `apps/portal/frontend/**`, không có path nào khớp danh sách secret/kernel/control-plane trong `.githooks/lib/access-policy.sh`, và `git diff --check 30fb9f21 65a8acc5` sạch. Kết quả ghi ở §3.6 |
| **Việc của Bobby** | Nối hook cho workspace (`scripts/install-git-hooks.sh` là file control-plane; contributor không tự chạy hay sửa), và cân nhắc cho verifier kiểm tra `core.hooksPath` |

### 3.2 Test lanes (`apps/portal/frontend`, Node v20.20.2, tree frontend == `65a8acc5`)

| Lane | Lệnh | Exit | Kết quả |
|---|---|---:|---|
| Typecheck | `npx tsc -b --noEmit` | 0 | PASS |
| Build | `npm run build` | 0 | PASS (chỉ có cảnh báo chunk size, đã có từ trước) |
| Unit toàn bộ | `npx vitest run` (chạy 3 lần) | 1 | **2935 pass · 1 fail · 1 skip** (168 file). Xem 3.3 |
| Unit file lỗi, chạy riêng | `npx vitest run src/app/PortalShell.test.tsx` ×3 | 0 | 18/18 pass cả 3 lần |
| Browser toàn Research | `playwright test -c <probe config trỏ 127.0.0.1:4417>` | 0 | **82/82 PASS** (14 test S07) |
| Browser quét state (spec tạm, không commit, đã xoá) | 8 test | 0 | **8/8 PASS** (bảng 3.4) |

Playwright 1.62.1, Chromium build `chromium-1234` (headless). Preview là
`vite preview` **riêng của workspace này** ở `127.0.0.1:4417`, dựng từ build
trên. Preview đã tắt đúng PID sau khi chạy. Không đụng preview 4317–4320 của
Bobby.

> **Đính chính trước đó:** lần quét P16 đầu tiên (chỉ gửi qua chat) đã chạy
> probe mặc định vào preview 4317 của Bobby. Các con số đó không phải của
> workspace này và đã bị thay bằng số ở trên.

### 3.3 Unit fail ngoài diff — ghi nhận, không vá

- Test: `src/app/PortalShell.test.tsx › embedding (U04/U05) › mounts QuantBT under its canonical route with no nested topbar`.
  Kết quả `expected +0 to be 1` (`.portal-topbar`), kèm uncaught
  `TypeError: Cannot read properties of undefined (reading 'filtered_rows')`
  tại `src/research/RunLibrary.tsx:776`.
- Chạy cả suite thì fail 3/3 lần. Chạy riêng thì pass 3/3. Lúc đó load average
  của máy là 7.8–9.2 trên 8 core (máy dùng chung).
- `git diff --stat 30fb9f21 65a8acc5 -- src/app src/research/RunLibrary.tsx`
  rỗng. Commit này không chạm vào `src/app/**`, `RunLibrary.tsx` hay nơi nào
  import `useFreeze`/`FreezeDetail` ngoài route S07.
- Kết luận có phạm vi: lỗi phụ thuộc tải và nằm ngoài diff P16. Nhưng
  `RunLibrary.tsx:776` đọc `response.page` khi `page` undefined là một điểm
  giòn có thật. **Owner: Bobby quyết** có mở `fix/*` riêng không. Addendum
  này không gọi lane unit là PASS sạch.

### 3.4 Browser receipt — `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture canonical, API stub)

Route `/research/quantbt/runs/R-WFO-118/freeze`, viewport 1280 và 660.

| State / tương tác | Assertion | Kết quả |
|---|---|---|
| PARTIAL (fixture `freeze-detail.json`) | 3 check `match`, cả hai digest in ra, `source artifact bytes · not attested`, không có "chain intact" | PASS, overflow 0 px ở 1280/660 |
| F2 thẳng hàng | Header 5 cột; thanh range và giá trị cùng cột (đo toạ độ) | PASS ở laptop/mobile |
| F1 / F4 hiển thị | Trục 3 đoạn + legend; F4 `not compared`, chỉ sealed bundle digest có giá trị | PASS |
| BLOCKED (check `P10_MANIFEST_BINDING` = MISMATCH) | `[data-integrity=BLOCKED]`, mismatch in cả hai digest, `[data-frozen]` = 0, lý do bảng rỗng hiện ra, `stage4` vẫn có | PASS, overflow 0 px ở 1280/660 |
| Loading | `aria-busy`, 0 integrity, 0 frozen parameter trước khi response về | PASS |
| 401 / 403 / 404 / 503 | state `denied` / `denied` / `empty` / `unavailable`; giữ shell + breadcrumb; không render `0` | PASS. **Nhưng in nguyên server `error.message`** (xem P16 open question ở §4) |
| Bàn phím + verify race | Tab tới `verify now`, focus ring `solid 2px`; Enter ×2 + click → **đúng 1 POST**; `role=status` = 1 | PASS |
| Không POST ngầm | mount, hash có fold, đổi fold, render lại → 0 POST | PASS (probe 14 test S07) |
| Reduced motion (T16) | Không có animation trước và sau verify khi `prefers-reduced-motion` | PASS |
| Hard refresh / deep link / ETag | test probe đã có sẵn | PASS |
| Network | Chỉ same-origin: `/api/v1/quantbt/runs/:id/freeze`, `…/freeze/verify`, `…/current-source/freeze` + shell (`/api/v1/portal/registry`, `/summary`, `/api/auth/context`, `/api/admin/access/self`, `/api/runs`, `/api/strategies`) | PASS |
| Console | Chỉ 1 dòng 404 của `current-source/freeze` (P04 không được lane retained-source admit, đúng như mong đợi) | PASS |

Screenshot và log **không commit** (Rules A4.1). Chúng nằm trong workspace
`~/tv-shots/p16-addendum/` và `~/tv-shots/p16/`. SHA-256 (16 ký tự đầu):

| File | SHA-256 |
|---|---|
| `s07-freeze-composed-laptop.png` | `4a3377306095bb35` |
| `s07-freeze-composed-mobile.png` | `e71c35743fd06db2` |
| `s07-freeze-blocked-laptop.png` | `cc337f2f670142f7` |
| `s07-freeze-blocked-mobile.png` | `ca8fc72e01fa4316` |
| `scan-blocked-1280.png` | `7337373d97fef0b7` |
| `scan-loading.png` | `d5c09e36f9873ad4` |
| `scan-refusal-401.png` / `-403.png` | `985b844ae3061eae` |
| `scan-refusal-404.png` | `49f9ed35d7251aff` |
| `scan-refusal-503.png` | `0555986fcccb7b43` |
| hi-fi `hifi-07-1280.png` / `hifi-07-660.png` | `ce4dd1cafd4e6cd5` / `85054a6dc4abf94c` |

**Chưa có:** `REAL_API_E2E_RECEIPT` (`FEATURE_RESEARCH_FREEZE=false`, backend
feature-dark); axe scan (T14), vì axe-core không có trong lock file và thêm
vào sẽ đổi digest m0 freeze manifest (Bobby quyết cách chạy).

### 3.5 HiFi receipt — `QuantBT 07 S3 Freeze.dc.html` vs product

| HiFi element | Panel / field | Typed state | Kết luận |
|---|---|---|---|
| ✓ ORDER VERIFIED, cert B, 4 nút scenario demo | `freeze.ordering.wall_clock` | `NOT_ASSERTED` | Cố ý không vẽ |
| F3 digest chain + VERIFY DIGEST | `freeze.integrity.checks[]`, `POST …/freeze/verify` → `FreezeVerification.verification_scope` | `PARTIAL` / `PARTIAL_MATCH` | Khớp, có qualifier, không có "chain intact" |
| What-if slider, grid 9×9, PROPOSE NEW ATTEMPT | `freeze.what_if.grid`, `diagnostic_evaluate.may_submit`, `sibling_draft.may_create` | `NOT_APPLICABLE`, `false` | Không có control nào |
| F1 trục data time | `freeze.ordering.data_time.{is,outer_oos,holdout}` | `AVAILABLE`, `THREE_WINDOW_CURRENT` | Đã sửa. 3 window, không có 5 fold (P04) |
| F2 bảng θ* 5 cột | `freeze.frozen_parameters[]` | `WITHIN_DECLARED_RANGE` | Đã sửa, không tính lại % hay giá trị ở browser |
| F4 Binding down to Stage 4 | chỉ sealed bundle digest được publish | typed-absent | Đã sửa → `CG-P16-02` |
| BLOCKED (handoff bắt buộc, HiFi không vẽ) | `integrity.state=BLOCKED` | `BLOCKED` | Đã sửa (trước đó hiện thành `empty`) |
| Dòng code-fixed `issl = True` | không có field | — | → `CG-P16-03` |
| COPY EVIDENCE LINK · next: S4 Execute → | không có operation / S08 chưa có route | — | Bobby quyết (copy link phá invariant "verify là action duy nhất"); next link thuộc P17 |
| Tiêu đề "Freeze — what was sealed, and when" | spec §2.1: "S3 · Freeze — ordering & integrity" | — | `VISUAL_DECISION_REQUIRED` cho Bobby; đề xuất giữ spec vì wall-clock `NOT_ASSERTED` |
| Breadcrumb trong shell header | shell dùng chung | — | Ngoài S07, đề xuất task shell riêng |

Bản HiFi HTML tự tràn 132 px ở 660 và có 4 cảnh báo dc-runtime. Đây là lỗi
của file HTML, không phải của product.

### 3.6 Luật hook chạy tay

| Đối tượng | Kiểm tra | Kết quả |
|---|---|---|
| `65a8acc5` (range từ `30fb9f21`) | `git diff --check` | exit 0 |
| `65a8acc5` | path so với luật kernel/secret/control-plane của `.githooks` | 4 path `apps/portal/frontend/**`, không path nào bị chặn |
| Docs commit này | `.githooks/pre-commit` chạy trực tiếp trên index | exit 0 (branch contributor, `diff --cached --check`, không path bị chặn, verifier pass) |

## 4. Toàn bộ request P16 cho Codex — giữ ID gốc, không cấp ID mới

Mục P16-B ghi theo đúng tên hàng trong
[source-capability-matrix.md](./source-capability-matrix.md). Chỉ
`CG-P16-02` và `CG-P16-03` có ID. Câu hỏi về error copy là open question
chưa có ID; Codex/Bobby cấp ID nếu nhận.

| # | Mục | Actual (hôm nay) | Expected | Source locator | Typed fallback đang render | Test cần có khi fact tồn tại |
|---|---|---|---|---|---|---|
| 1 | **P16-B · artifact bytes / expected digest** | `freeze.integrity.source_artifact_bytes.state=NOT_ATTESTED` (`P10_ARTIFACT_BYTES_NOT_ATTESTED`) | Versioned source artifact identity: byte digest + size + algorithm + immutable receipt ref | `research-freeze.openapi.json` → `Integrity.source_artifact_bytes` (`SourceGap`) | "source artifact bytes · not attested" trong panel binding; integrity mãi là `PARTIAL` | Verify MATCH trên bytes → integrity khác `PARTIAL`; MISMATCH bytes → `BLOCKED` + cả hai digest; UI không bao giờ tự tính digest |
| 2 | **P16-B · candidate population / selected trial** | `freeze.selection.selection_artifact_ref`, `selected_trial_ref`, `selection_sequence` = `null`; `source_profile=FIXED_PROFILE_NO_SELECTION_ARTIFACT` | Bounded population, selected artifact/trial identity, immutable selection record | `FreezeDetail.freeze.selection` | Dòng "selection artifact · selected trial · selection sequence — none published"; không có trial card | P16-T01, P16-T11: passport hiện đúng trial đã chọn, population đếm từ server |
| 3 | **P16-B · causal wall-clock ordering** | `freeze.ordering.wall_clock.state=NOT_ASSERTED` (`P04_PUBLISHES_NO_WALL_CLOCK_ORDER`) | Event UTC do nguồn phát (vd. `params_frozen_at`, `bundle_frozen_at`, `outer_oos_first_read_at`) kèm event identity/order semantics + clock provenance | `FreezeDetail.freeze.ordering.wall_clock` | "wall clock ordering · not asserted"; chỉ vẽ trục data-time, không verdict | P16-T05: timeline wall-clock tách khỏi data-time; không có verdict khi thiếu event |
| 4 | **P16-B · exact what-if grid** | `freeze.what_if.grid.state=NOT_APPLICABLE`, `objective_definition=null`, `effective_cell_count=null` | Evaluation identity bất biến, objective convention (ΔJ), grid tính sẵn có giới hạn, mapping clamp/step, trạng thái cell missing/queued | `FreezeDetail.freeze.what_if.grid` | Panel what-if `not applicable`, không slider, không grid | P16-T06, T12, T14 (ΔJ đúng mode/objective/window; fixed params đúng hash scope) |
| 5 | **P16-B · diagnostic evaluation / cancel** | `freeze.what_if.diagnostic_evaluate.may_submit=false` | Intake idempotent được uỷ quyền riêng, có budget, cancel, audit | `FreezeDetail.freeze.what_if.diagnostic_evaluate` | "diagnostic evaluate — not applicable", không có nút | P16-T07, T13: 1 click = 1 job, cancel, không POST khi mount |
| 6 | **P16-B · sibling draft** | `freeze.what_if.sibling_draft.may_create=false` | Contract draft/provenance có version + lineage + authorization có scope | `FreezeDetail.freeze.what_if.sibling_draft` | "sibling draft — not applicable" | P16-T08: draft mang lineage về run gốc |
| 7 | **`CG-P16-02`** — Stage 4 binding digests | Chỉ có sealed bundle digest. Không có sealed params digest, params digest replay dùng, runtime bundle digest. Replay contract chỉ có `source_transform_digest` | 3 digest còn thiếu, đặt cùng revision với freeze, để F4 so sealed với replayed | `research-freeze.openapi.json` (F4 không có field); `research-replay` contract | Panel F4: 3 dòng `not published`, header `not compared`, không có ✓/BOUND | F4 so 2 cặp: MATCH → "bound", MISMATCH → blocked + cả hai digest; so sánh do server quyết, UI chỉ render |
| 8 | **`CG-P16-03`** — code-fixed parameters & hash scope | HiFi vẽ `issl = True (fixed)`; contract không có field; `Parameter.kind` chỉ có `NUMERIC`. Liên quan Astra A10: binding cần tra theo adapter digest lịch sử của run, không so với hằng số P04 hiện tại | `code_fixed_values_ref` (Guide §6.6) + hash scope của từng param (θ digest hay bundle/code digest), theo Guide P16 bước 5 (§6.6/12.4) | Guide `RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` §6.6 dòng 399–403, P16 dòng 2303; `Parameter` schema | Không vẽ dòng code-fixed (không bịa field) | P16-T14 "fixed params nằm đúng hash scope"; P07-T12 roundtrip |
| 9 | **Open question (chưa có ID) — typed error copy** | GET freeze trả 401/403/404/503 thì màn in nguyên `problem.error.message` (`freezeClient.ts:81`). Test với chuỗi `internal-secret-trace-xyz` thì chuỗi này hiện trên màn. Cùng pattern có ở 10 file `src/research/*.ts` | Handoff P16: "never show internal error text" | `freezeClient.ts:76–87`; `Problem { error, request_id }` | State `denied`/`empty`/`unavailable` đúng, nhưng kèm message server | Nếu BFF không cam kết `error.message` là copy công khai: frontend đổi đồng loạt sang copy theo mã + `request_id`, trong một `fix/*` riêng; test assert chuỗi server không bao giờ lên màn |

Không mục nào ở trên được frontend hand-map, đọc thẳng DB/artifact/Parquet,
hay lấy từ fixture để lấp. Mọi khoảng trống giữ nguyên typed state trong panel
của nó.

## 5. Phân loại quyết định (Rules A4.1)

- **(a) Bobby quyết:** nối `.githooks` cho workspace thanhvuong (§3.1);
  hợp thức hoá scope P16 correction; tiêu đề S07
  (`VISUAL_DECISION_REQUIRED`); COPY EVIDENCE LINK và invariant probe; task
  shell breadcrumb; cách chạy axe (T14); có mở `fix/*` cho
  `RunLibrary.tsx:776` / flake `PortalShell` không.
- **(b) Frontend làm được trong scope, sau khi (a)/(c) trả lời:** render các
  fact mới khi Codex publish contract (mục 1–8); đổi error copy (mục 9).
- **(c) Source/backend (Codex):** mục 1–8, trả lời mục 9.

## 6. Kết luận có phạm vi

- P16-A S07: frontend khớp HiFi trong giới hạn contract, có
  `PRODUCT_ROUTE_BROWSER_RECEIPT` ở 1280/660, không có known in-scope defect
  nào trên S07.
- Chưa phải `VERIFIED` đầy đủ, vì còn thiếu: `REAL_API_E2E_RECEIPT`, axe
  (T14), lane unit toàn bộ chưa sạch (§3.3, ngoài diff), và các quyết định ở
  §5(a).
- **P16-B: `SOURCE_CAPABILITY_BLOCKED`, không done**, chờ Codex xử lý mục
  1–8.
