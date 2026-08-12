# Design System Catalog — Quant Ecosystem Portal V2

**Chủ trương:** palette Fund Paper (đã duyệt ở `upgrade/KE_HOACH_MIGRATION_5_PHASE.md` §2).
Raw hex **chỉ sống trong** `frontend/src/styles/tokens.css`; component tuyệt đối không hardcode màu.

## Tokens (`tokens.css`)

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--paper` | `#faf9f5` | `#141a24` | nền trang |
| `--paper-raised` | `#ffffff` | `#182031` | card / topbar / modal |
| `--paper-sunken` | `#f4f2ec` | `#10151e` | sidebar, khu vực chìm |
| `--surface-2` | `#eef3fb` | `#15233d` | tint legacy (kanban col, toolbar) |
| `--surface-3` | `#e3f0ff` | `#0c2d4a` | tint nổi (portal stage) |
| `--ink` | `#1c2532` | `#e6ebf2` | text chính |
| `--ink-soft` | `#4e5a6e` | `#a9b4c6` | text phụ |
| `--ink-faint` | `#939db0` | `#6b7891` | caption, mono-label |
| `--line` | `#e3e0d7` | `#2b3648` | border chính |
| `--line-soft` | `#efede4` | `#222b3a` | border phụ/hover |
| `--accent` | `#0f4c5c` | `#7fc8d8` | accent chính (nav, link, primary) |
| `--accent-soft` | `#e2edf0` | `#1d3540` | nền accent |
| `--accent-2` | `#9a6a1f` | `#d8a94e` | accent phụ (warn-ish, fig-num) |
| `--accent-2-soft` | `#f4ecdb` | `#3a2f1b` | nền accent-2 |
| `--good` / `--good-bg` | `#1e7b4f` / `#e3f1e9` | `#62c18a` / `#16301f` | success |
| `--bad` / `--bad-bg` | `#b43a3a` / `#f7e8e8` | `#e07a7a` / `#3a1c1c` | danger |
| `--font-display` | Newsreader | | tiêu đề chữ serif |
| `--font-body` | Inter | | thân chữ |
| `--font-mono` | JetBrains Mono | | mono-label, code |
| `--topbar-h` 56px · `--sidebar-w` 280px · `--rail-w` 250px · `--content-max` 1440px | | | cấu trúc |

Dark theme: `:root[data-theme="dark"]` + `prefers-color-scheme` fallback khi chưa set.

## Primitives (`base.css`)

`.label, .card, .kpi-value, .chip (+tone), .badge-pass/fail/pending, .btn-primary/ghost,
.input, .navtab, .state-loading/empty/failed, .collapsible, .definition-list,
.section-title, .dek, .mono-label, .table-wrap, .chart-figure/frame, .modal-*, .toast-*`

Tất cả đều có `:focus-visible` outline và tôn trọng `prefers-reduced-motion`.

## Shell (`shell.css` + component `PortalShell.tsx`)

Topbar (sticky 56px, brand = logo+name+tag V2) → top-tabs 6 views → actions (sync-badge API/LOCAL + theme toggle).
Workspace: sidebar 280px (docs: 16 pages / khác: 5 views), content, view-panel active.
Docs layout: `doc-layout` grid `1fr + 250px` toc-rail sticky; breakpoints 1024/820/640.

## Legacy views (`legacy-views.css` + `LegacyView.tsx`)

5 view-panel (roadmap/board/reports/evidence/portal) giữ HTML byte-exact từ golden
(`src/content/views.ts`), style ported từ legacy đã map token; loại bỏ rule đụng shell
(topbar/sidebar/...) và `@media print` (print.css quản lý). Mermaid render chung qua lib.

## Component map (legacy selector → component)

| Legacy khái niệm | Component/Module |
|---|---|
| `<section class="doc-page" data-page-id>` (16 trang) | `DocsView` + `src/content/pages/*` raw |
| `<div class="mermaid-source">` + `.copy-source` | `lib/useRawContent.ts` (delegation + clipboard) |
| `<div class="mermaid">` | `lib/mermaid.ts` (mermaid.run, theme-aware) |
| `<section class="view-panel" id="view-*">` | `LegacyView` + `src/content/views.ts` raw |
| `#view=docs&page=…` hash | `lib/router.ts` |
| `quantPortalTasksV1/PhasesV1/BoardViewV1/Theme` | `lib/storage.ts` |
| `api/health`, `api/tasks`, `api/roadmap` | `lib/api.ts` (detectApi + legacy compat) |
| topbar/nav/sidebar | `PortalShell.tsx` |
| Modal/toast/badge/chip/table | `components/ui.tsx` |
| Palette cũ `--surface/--border/--muted/...` | tokens.css (map trong port_legacy_css.mjs) |

## Chạy song song (legacy vs new)

| Chế độ | Lệnh | Trang |
|---|---|---|
| Legacy (default) | `python server.py` | `:8000` |
| New V2 | `cd frontend && npm run dev` | `5173` (proxy `/api` → `:8000`) |
| Verify | `node tooling/screenshots/verify_geometry.mjs`, `node tooling/screenshots/new.mjs` | — |

Gate: `npm test` (integrity 100%) + `npm run build` + geometry 4 viewport không overflow.