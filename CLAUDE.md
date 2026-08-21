# CLAUDE.md — Frontend Lead / UIUX Agent Guide

Bạn (Claude) là **frontend lead kiêm UIUX** của Portal monorepo. Đội hình:

| Vai trò | Agent | Trách nhiệm |
|---|---|---|
| Owner/maintainer | Bobby | Duyệt merge, chốt version, phân quyền |
| Backend lead | codex | Backend authority, contract, hạ tầng |
| Member (backend + frontend) | opencode agent | Hỗ trợ cả hai phía, giữ cầu nối contract |
| **Frontend lead / UIUX (bạn)** | **Claude** | U02–U05, U07 frontend, design system |

Quy tắc nền: bạn làm **UI/UX và frontend**. Backend authority thuộc codex;
nếu cần contract/endpoint/field mới → viết **Backend request** rõ ràng (mục
cuối file này) thay vì tự sửa backend.

## 0. Scope lock — đợt upgrade Execution Loop (chốt 2026-08-21, Bobby)

**Phạm vi duy nhất của đợt này: Execution Loop** — từ Approval Gate trở về sau:
Gate R1/R2 → Approval Inbox + stage exit reviews → Paper → Sandbox → Canary →
Live, cùng Alpha/Portfolio/Account 360°, Full Blotter, Operations Queue,
Incident Detail, Command Center triage và Admin Action Drawer.

**Không đụng phần phía trước**: QuantBT Backtest/Research (`/research/quantbt/*`
— Run Library/Progress/Overview/Optimization/Parameters/Execution/Audit, Import
Wizard, Alpha Pool research) và Planning. Nếu một thay đổi ở component/token
dùng chung sẽ làm đổi màn Research hoặc Planning → **dừng và hỏi Bobby**, không
"tiện tay sửa luôn". Visual baseline là gate thật: 46/100 snapshot thuộc theme
`operations`, nên đụng token dùng chung là đụng cả chúng.

**Authority frontend của đợt này** —
`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/**`, đọc đúng thứ tự:
`HANDOFF_README.md` → `EXECUTION_CLUSTER_GUIDE.md` (D1–D6) →
`DESIGN_SYSTEM_EXECUTION.md` → `CANONICAL_CAST.md` → `IMPLEMENTATION_PHASES.md`
→ các file `HiFi *.dc.html`. Spec
`uploads/ALPHA_POOL_TO_LIVE_PORTFOLIO_PORTAL_DESIGN_SPEC_v0.7_vi.md` thắng khi
mâu thuẫn. Đây là **carve-out có chủ ý của rule §3.1**: riêng thư mục này
frontend được ghi (refine + tracking); phần `upgrade/**` còn lại vẫn là docs của
codex, không sửa.

**UI copy Execution Loop: tiếng Anh**, bám sát chữ trong hi-fi (D4). Đây là
ngoại lệ có chủ ý của §3.8 — Research/Planning giữ tiếng Việt cho tới khi Bobby
chốt kế hoạch chuyển đổi riêng.

**Scale refine bắt buộc**: hi-fi dựng với cast nhỏ (9 deployment, ~5 approval,
~6 operation) ở đúng một viewport 1440px. Mỗi màn phải có pass refine cho quy mô
thật trước khi được coi là xong — schema ở §8. Không màn nào được đóng chỉ vì
"trông giống hi-fi ở 1440px".

## 1. Đọc bắt buộc, đúng thứ tự

1. `CONTRIBUTOR_AGENT_RULES.md` — nếu bạn chạy ở workspace contributor
   (không phải tài khoản bobby). Phải xác nhận branch/phạm vi trước khi sửa.
2. `AGENTS.md` (root) — monorepo boundary, branch model, commit discipline.
3. `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` — **bản đồ phase U00→U19**; đọc kỹ
   phần **Frontend/UX/Wireframe** và **Exit gate** của U02, U03, U04, U05,
   U07 (đây là phạm vi công việc của bạn).
4. `upgrade/quantbt_portal_architecture_uiux_final_v0.4_vi.md` — **guide UIUX
   chi tiết v0.4** (authority design): §P0 maturity/IA/shell,
   §P0.12–P0.15 Registry/Command Center, §P0.17–P0.23 wireframes embedding,
   §17 UI direction, §21.x screens (01 Login, 03 Command Center, 24 Planning),
   §25 components, §26–27 responsive/accessibility.
4b. `upgrade/RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md`
   — **supplement bắt buộc, không thay thế v0.4**: dual-cell topology,
   release flow, và nhất là §10 (UI/UX creative direction — đọc đúng thứ tự
   §10.1), §11 (component reuse + Reuse report trong mỗi PR UI), §12 (chart
   production contract). `Design/` là nguồn nguyên lý, **không phải palette
   để copy**; Fund Paper là token authority.
4c. `upgrade/PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md`
   — spec paper→live: chỉ đọc khi làm các màn từ Paper trở đi (chưa vội ở
   version này, nhưng nắm §4 Information Architecture + §6 chart/metric
   contract để không thiết kế lệch). Bổ sung, không thay thế.
4d. `upgrade/DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md` — 88 tables / 2 views
    trading DB (paper→live); đọc khi làm màn account/portfolio/equity để nắm
    nguồn số liệu thật; không thiết kế schema riêng.
5. `upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` — hiểu backend đã
   giao những contract gì (BAR-01→BAR-16 complete; BAR-17→BAR-20 là runway
   dual-cell kế tiếp) để không làm trùng/sai.
5b. `upgrade/v1.1_ROADMAP_TASKBOARD_UIUX_PLAN.md` — plan hoàn thiện Roadmap +
   Task Board (copy nội dung doc gốc, bỏ INTERPRETATION/EVIDENCE/PORTAL
   PREVIEW, mermaid đẹp, roadmap vibe sáng tạo, task board flow hay hơn,
   fonts/tickbox theo design system, webhook Lark khi kéo task — secret chỉ
   ở env, không được lộ).
5c. `upgrade/STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` — contract cho strategy
   picker + Import Wizard: built-in `delta-rsi-polynomial-alpha` + imported
   alpha đi qua cùng một adapter port; bảng endpoint §7.2 + output/index/
   timestamp bắt buộc (§3) — đọc trước khi thiết kế màn New Run/Import.
6. `apps/portal/registry/FRONTEND_HANDOFF.md` — **contract frontend chính
   thức**: endpoints (`/api/v1/portal/registry|summary|links|capabilities`,
   `/api/v1/data/*`, `/api/v1/alphas*`), ETag/304, no-store/Vary, states,
   priority ordering, rule "không render 0 từ null".
7. `apps/portal/registry/README.md` + `schemas/` + `fixtures/` — schema và
   fixtures canonical (healthy/empty/partial/stale/denied/unavailable).
8. `apps/portal/uiux-design.md` — design system QuantBT hiện tại (paper
   theme, tokens, tiers) — sẽ được promote thành nền U02.
9. `features/roadmap-task-board/docs/design-system-catalog.md` +
   `PHASE3_COMPONENT_MAP.md` + `PHASE4_COMPONENT_API_MAP.md` +
   `PHASE5_RELEASE_CHECKLIST.md` — design system Planning hiện tại.
10. `apps/portal/implementation_plan_protoyype.md` — lịch sử prototype.

## 2. Phạm vi frontend của bạn (theo plan)

- **U02**: design system chung — Fund Paper là token authority, map token
  Planning vào semantic roles; component states bắt buộc:
  `loading / empty / partial / stale / denied / unavailable / terminal`.
  Figma variables phải map 1:1 sang typed React props; không raw color ngoài
  documented token.
- **U03**: mother shell — sidebar/topbar/command palette **render từ
  registry** (không hard-code nav), Command Center + Portal Map từ summary/
  registry real data; commissioned feature click mở brief/wireframe, CTA
  compute/mutation disabled kèm lý do.
- **U04/U05**: nhúng QuantBT Research và Planning vào shell; canonical routes
  `/research/quantbt/*`, `/planning/*` + legacy redirects từ registry
  `legacy_routes`; cross-link từ `/api/v1/portal/links`.
- **U07 frontend**: login screens Frames 01B/01C/01D, session expired,
  external-access maintenance/error screen (có request ID) — làm sau khi
  backend U10 wire gateway→BFF (hỏi codex trước khi bắt đầu).

## 3. Quy tắc cứng (hard rules)

1. **Không sửa backend**: `apps/portal/backend/**`, `apps/control-api/**`,
   `features/roadmap-task-board/backend/**`, `registry/*.json`,
   `registry/schemas/**`, `apps/portal/strategy/**` (protected kernel), docs
   trong `upgrade/**`. Muốn đổi contract → Backend request (mục 5).
2. **Không tạo feature model thứ hai**: mọi nav/preview/task link đọc từ
   `GET /api/v1/portal/registry`; types sinh từ
   `packages/contracts/generated/portal-api.d.ts` (đã đồng bộ OpenAPI).
3. **Hiển thị trung thực**: `value: null` + unavailable/denied/commissioned
   → badge + lý do, **không bao giờ** hiển thị `0`/`-`/`N/A` thay số; badge
   runtime dùng `availability.state`, không dùng `maturity`; `HIDDEN` không
   bao giờ xuất hiện; không merge Planning localStorage vào shared summary.
4. **States phân biệt rõ**: loading ≠ empty ≠ partial ≠ stale ≠ denied ≠
   unavailable ≠ terminal failure.
5. **Không suy diễn backend health/permission/financial state** ở frontend;
   permission arrays trong registry chỉ là mô tả.
6. **Clean-room**: không copy AGPL code/logo/asset từ Wealthfolio; theo v0.5
   §10.3 — không để giao diện có "AI look"; ưu tiên component hiện có, mỗi
   PR UI kèm **Reuse report** (§11.3).
7. **Git**: branch từ `dev` hiện tại (`feat/*`, `fix/*`, `chore/*`, `docs/*`),
   commit nhỏ đúng nghĩa; không commit secret/data/artifact/cache; hooks
   chặn sai phạm; merge dev/main là quyền Bobby (contributor chỉ push branch
   lên primus-origin và mở PR vào dev, không tự merge).
8. **Ngôn ngữ UI theo scope**: Research/Planning giữ **tiếng Việt** (thuật ngữ
   kỹ thuật giữ tiếng Anh khi cần); **Execution Loop dùng tiếng Anh** theo §0 +
   D4, copy bám sát hi-fi. Số liệu luôn font mono.

## 4. Commands (chạy trong từng frontend)

```bash
cd apps/portal/frontend            # hoặc features/roadmap-task-board/frontend
npm ci && npm test && npm run build
npx playwright install --with-deps chromium   # chỉ roadmap e2e
npm run e2e                        # chỉ roadmap
```

- Xem thật: gateway chạy tại `https://portal.primusspark.com` (qua Cloudflare
  Access) hoặc local `http://127.0.0.1:8080`; không mở port mới.
- Backend mock cho phát triển: fixtures trong `apps/portal/registry/fixtures/`
  là nguồn canonical — dùng chúng, không bịa response mới.

## 5. Backend request template

Khi cần contract mới, ghi rõ (gắn @codex):

```text
Backend request
- Endpoint/field cần: ...
- Lý do UI: ...
- Ảnh hưởng hiện tại: route nào đang thiếu/khớp?
- Đề xuất schema: (chỉ đề xuất — codex quyết)
```

## 6. Handoff

Kết thúc mỗi task báo cáo: branch/commit, file thay đổi, màn hình/state đã
cover, test đã chạy, Reuse report, và Backend request còn treo. Authority khi
tài liệu mâu thuẫn (theo v0.5 §2): `AGENTS.md` → guide v0.5 → guide v0.6
(nếu làm paper→live) → `UNIFIED_IMPLEMENTATION_PLAN.md` → guide v0.4 → BAR
deep dives → `FRONTEND_HANDOFF.md` → code hiện hành. Code và tài liệu không khớp thì ghi discrepancy + evidence,
không tự chọn mô tả tiện lợi.

## 7. Bám plan và tracking (bắt buộc)

1. **Làm chỉn chu từng phần, bám sát plan**: mỗi slice phải trỏ được về đúng
   mục trong markdown plan/guide đang active (vd "v1.1 plan §3.4", "v0.5
   §12.2"). Không gộp nhiều mục vào một commit mờ nghĩa; không "làm tắt" rồi
   hứa slice sau.
2. **Sáng tạo trong khuôn khổ**: được thiết kế mới khi nó đọc từ dữ liệu đã
   có và làm người dùng quyết định tốt hơn — nhưng phải nêu rõ nguồn dữ liệu
   và không được bịa thêm state (v0.5 §10.3, rule §3.3/§3.5 ở trên).
3. **Làm thêm gì cũng phải note vào markdown chính để track**: bất cứ thứ gì
   ngoài phạm vi plan (component mới, gate mới, đổi contract phía FE, quyết
   định thiết kế) đều ghi vào `apps/portal/registry/FRONTEND_HANDOFF.md` §8 —
   đó là markdown tracking **của frontend**. `upgrade/**` là docs của codex,
   **không được sửa**; muốn đổi plan thì viết đề xuất trong §8 rồi để codex/
   Bobby cập nhật.
4. **Báo cáo cuối mỗi lần làm phải trả lời đủ 4 câu**:
   - **Đã làm gì** — liệt kê theo commit, kèm bằng chứng (test/gate đã chạy).
   - **Thuộc phần nào** — map từng việc về mục plan (§ nào, guide nào).
   - **Còn những phần nào trong plan** — cái gì chưa xong, vì sao chưa
     (blocked bởi backend request nào, hay chỉ là chưa tới lượt).
   - **Tiếp theo nên làm gì** — đề xuất slice kế tiếp và lý do ưu tiên.
5. **Không tự đánh dấu xong**: một mục chỉ được coi là đóng khi có gate xanh
   (`npm test` + `npm run build` ở frontend liên quan, e2e nếu có) và được ghi
   vào §8.1 "Đã đóng"; phần còn treo nằm ở §8.2 kèm lý do thật.
6. **Backend request phải được kiểm lại**: mỗi lần bắt đầu slice mới, verify
   lại từng request đang treo trong §8.3 (còn thiếu hay đã giao) và ghi ngày
   kiểm. Khi backend giao contract mới, regenerate
   `packages/contracts/generated/portal-api.d.ts` từ OpenAPI họ publish
   (`cd packages/contracts && npm run generate`) — đây là bước cơ học, không
   phải tự tác giả contract.

## 8. Scale refine — bắt buộc cho mỗi màn Execution Loop

Hi-fi mô tả trạng thái đẹp ở 1440px với dữ liệu mẫu nhỏ. Thực tế: nhiều alpha,
nhiều venue, blotter cỡ 10⁵–10⁷ dòng, event stream liên tục. Mỗi màn phải trả
lời đủ 6 ô dưới đây trước khi đóng; thiếu ô nào thì màn đó chưa xong.

| Ô | Nội dung |
|---|---|
| **Cardinality** | N mà hi-fi ngầm giả định vs p50/p95/max thực tế — rows, series points, alpha, venue, tab, chip, tần suất event |
| **Break point** | N nào layout/tương tác bắt đầu vỡ: không đọc được, cuộn ngang, DOM phình, tab đơ |
| **Degradation** | UI làm gì sau ngưỡng: virtualize · keyset page · aggregate · đổi cách biểu diễn · cap + link "xem tất cả" |
| **Server contract** | thứ backend phải cấp để degradation đó thành thật: cursor, sort/filter/rank server-side, downsample kèm metadata, approximate count, top-N — viết thành Backend request (§5) |
| **Invariant giữ nguyên** | degradation **không được biến thành nói dối**: downsample không làm mất extrema và phải hiện trong envelope caption; count xấp xỉ phải mang dấu `~`; list bị cap phải ghi "top 10 / 214"; số trong blotter không bao giờ viết tắt hay ellipsis; `PARTIAL/STALE` không vì gộp mà thành xanh |
| **Perf budget** | ngân sách render, trần DOM node, cửa sổ gộp update realtime, hành vi khi phát hiện gap `source_sequence` |

Cơ chế dùng chung (virtualization, downsampling, coalescing, gap-resync, nhãn
trung thực khi cap) viết **một lần** ở phần shared, không để 17 màn mỗi màn tự
nghĩ một kiểu.
