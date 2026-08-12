# Phase 1 — Inventory: user flows và hành vi hiện hữu

> Ngày: 2026-08-12 · Golden source: `legacy/portal.html` (sha `3ed4e5eb…`)
> Đây là danh sách user-flow phải giữ nguyên trong portal mới (Phase 2–3). Mỗi flow có gate kiểm thử tương ứng.

## 1. Khởi động & data mode

| # | Flow | Hành vi hiện hữu (cần parity) | Gate |
| --- | --- | --- | --- |
| F1 | Mở file tĩnh / khởi động không API | `detectApi()` probe `fetch('api/health', {cache:'no-store'})`; thất bại → `apiMode='local'`, badge `● local`; dữ liệu từ `localStorage` | badge local; board/roadmap render từ LS |
| F2 | Khởi động với backend | `api/health` OK → `apiMode='api'`, badge `● api`; `GET api/tasks|roadmap` trả `{initialized, items}` — nếu initialized, nạp items; nếu rỗng, seed `BASE_TASKS`/`ROADMAP_PHASES` và PUT lên server | badge api; board/roadmap hiển thị dữ liệu server |
| F3 | Lưu mọi mutation | `saveTasks()/savePhases()` luôn ghi `localStorage`; nếu `apiMode==='api'` thêm `PUT api/tasks|roadmap` (bulk snapshot) | sau reload state còn nguyên cả 2 chế độ |
| F4 | Đổi theme | toggle `documentElement.dataset.theme` light/dark; đổi giá trị CSS vars; rerender Mermaid (theme 'dark'/'default'); lưu `quantPortalTheme`; `prefers-color-scheme` máy nếu chưa có giá trị | theme giữ sau reload; Mermaid chuyển theme |

## 2. Docs

| # | Flow | Hành vi hiện hữu | Gate |
| --- | --- | --- | --- |
| F5 | Hash routing docs | Load với `#view=docs&page=<id>` → `applyHash()` → `setView('docs')` + `showPage(page)`; page mặc định `quantitative-trading-ecosystem` | mọi hash route trong manifest mở đúng page |
| F6 | Sidebar TOC | 5 nhóm label, 16 nav-item → click → `showPage(data-page)`; active highlight; scroll spy cuộn theo | click/scroll đồng bộ active |
| F7 | Context tabs (page TOC strip) | pills theo heading trong page; click cuộn mượt tới mục; active theo vùng đọc | tab khớp heading |
| F8 | Search | `Ctrl/Cmd+K` hoặc nút → overlay; `buildSearchIndex()` (tiêu đề, h1-h3, data-page-id); highlight; Enter/click → mở page + scroll; Esc đóng | tìm đúng văn bản page |
| F9 | Copy page / copy mermaid / copy code | nút Copy → `navigator.clipboard` text (mermaid source hoặc code) | nội dung copy byte-chính xác |
| F10 | Mermaid render | `renderMermaid` qua `mermaid.run`, `data-processed`, theme theo data-theme; nếu lỗi hiện `.diagram-error`; `rerenderAllMermaid` khi đổi theme | hash source trùng manifest |
| F11 | Print | `#printBtn → window.print()`; CSS in ẩn chân trang điều hướng, sidebar, controls | in ra ít nhất content đầy đủ |

## 3. Task Board

| # | Flow | Hành vi hiện hữu | Gate |
| --- | --- | --- | --- |
| F12 | View toggle kanban/table | `#boardView` (lưu `quantBoardViewV1`) | giữ lựa chọn sau reload |
| F13 | Filter | `taskSearch` (title/owner), `workstreamFilter`, `priorityFilter`, `phaseFilter`, `ownerFilter` — `renderBoard()` lọc live | filter đúng tập task |
| F14 | Kéo thả kanban | drag task giữa 5 cột (Backlog/Ready/In Progress/Validating/Done); cập nhật status + position; lưu | order + status sau reload đúng |
| F15 | Table edit inline | thay đổi select/input trong `#taskTableWrap` cập nhật task trực tiếp | cập nhật persisted |
| F16 | Modal editor | `#taskModal`: Xem/Sửa chi tiết, Save, Delete (confirm); Esc/click ngoài đóng; datalist ws/owner | CRUD đủ, không mất dữ liệu |
| F17 | Reset / Export | Reset → confirm → khôi phục `BASE_TASKS`; Export → tải JSON | file JSON đúng schema |
| F18 | Add task | `#addTaskBtn` → tạo task mới với id tự sinh `TASK-…`, status Backlog | tạo + lưu + render |

## 4. Roadmap

| # | Flow | Hành vi hiện hữu | Gate |
| --- | --- | --- | --- |
| F19 | Timeline | 24 tuần, 6 phase (P0–P5) theo `ROADMAP_PHASES`, bar theo start/end, màu theo tone | khớp seed + manifest |
| F20 | Edit phase | click Edit → form (name/id/start/end/owner/tone/outcome) → save → `savePhases` | persisted |
| F21 | Add / delete / import / export / reset phase | như initRoadmap; import validate JSON array | data nguyên vẹn |

## 5. Reports / Evidence / Manager Portal

| # | Flow | Hành vi hiện hữu | Gate |
| --- | --- | --- | --- |
| F22 | Reports | view tĩnh, Mermaid render, copy | parity geometry |
| F23 | Evidence & Appendix | view tĩnh, bảng + code blocks | parity |
| F24 | Manager Portal v2 | Alpha Pool (search/filter/drawer), Backtest Engine (config → progress → metrics/candles/compare/registry), Paper Trading (pause/stop/promote gate ≥28 ngày & MaxDD>-12%), Live Trading (tabs, ticker 2600ms, kill switch fail-closed); toàn bộ demo data seed PRNG | luồng hoạt động không crash; khớp anchors |

## 6. Responsive & shell

| # | Flow | Hành vi hiện hữu | Gate |
| --- | --- | --- | --- |
| F25 | <820px | sidebar ẩn (`transform:translateX(-100%)`), nút hamburger/menu mở `sidebar-open`; workspace margin-left 0 | anchor 390px docs: sidebar off-canvas |
| F26 | Topbar | logo brand SVG, tabs, nút theme/print/search/menu | layout anchors 1440/1024/768/390 |

## Khoá localStorage (đã có, giữ nguyên)

`quantPortalTasksV1`, `quantPortalPhasesV1`, `quantBoardViewV1`, `quantPortalTheme`.

## API tương thích (giữ nguyên)

`GET /api/health`, `GET|PUT /api/tasks`, `GET|PUT /api/roadmap` — shape `{initialized, items}` cho GET, body JSON array cho PUT. Backend v1: `/api/v1/*` + `/api/docs`.