# Baseline trước tái cấu trúc

Tài liệu này ghi lại hiện trạng đã kiểm tra vào ngày 2026-08-11. Nó không thay đổi kiến trúc sản phẩm; mục đích là làm điểm đối chiếu để đợt tái cấu trúc đầu tiên có thể giữ nguyên giao diện, dữ liệu seed và API hiện có.

## Phạm vi hiện tại

- `quant_trading_ecosystem_architecture_migration_portal_vi.html` là một ứng dụng đơn tệp (~4.5k dòng), gồm:
  - CSS, markup trang tài liệu và các sơ đồ Mermaid;
  - Manager Portal v2: Alpha Pool, Backtest Engine, Paper Trading và Live Trading;
  - Task Board, Migration Roadmap, Reports, tìm kiếm, sao chép, theme và in;
  - seed data `BASE_TASKS`, `ROADMAP_PHASES` và state UI ở browser.
- `server.py` là backend cục bộ tối giản (~162 dòng):
  - phục vụ HTML cho `/` và các đường dẫn GET không phải API;
  - `GET /api/health`, `GET|PUT /api/tasks`, `GET|PUT /api/roadmap`;
  - lưu JSON vào `data/`; không có xác thực vì đây là server loopback dùng cục bộ.
- Không có dependency bên thứ ba, manifest build hay test tự động.

## Luồng dữ liệu cần giữ nguyên

```text
BASE_TASKS / ROADMAP_PHASES
        │
        ├── localStorage (mặc định khi mở file tĩnh)
        │
        └── server.py API khi /api/health phản hồi thành công
                └── data/tasks.json, data/roadmap.json
```

Các khóa local storage hiện hữu là `quantPortalTasksV1`, `quantPortalPhasesV1`, `quantBoardViewV1` và `quantPortalTheme`. Không đổi tên hoặc thay đổi schema trong lần tách đầu nếu không có migration tương thích ngược.

## Ranh giới tách đề xuất (giữ nguyên hành vi)

Tách theo thứ tự dưới đây, với mỗi bước phải chạy được độc lập và không thay đổi URL/API:

1. Trích CSS ra `assets/css/` theo nhóm `base`, `portal`, `responsive`.
2. Trích JavaScript ra `assets/js/` theo trách nhiệm: `core-ui`, `task-board`, `roadmap`, `manager-portal`, `api-sync`.
3. Giữ `BASE_TASKS` và `ROADMAP_PHASES` ở một module seed-data riêng, export theo schema không đổi.
4. Chỉ sau khi parity được kiểm tra, tách nội dung tài liệu (`doc-page`) và các template UI lớn thành các fragment/module.
5. Giữ `server.py` như adapter tương thích; nếu thay backend, phải bảo toàn các endpoint và dạng JSON hiện tại.

## Điều kiện an toàn trước/sau mỗi bước

- Mở trực tiếp HTML: docs, theme, tìm kiếm, Task Board và Roadmap vẫn hoạt động qua `localStorage`.
- Chạy `python3 server.py`: badge chuyển sang API; Task Board/Roadmap đọc và ghi được qua API.
- Không thay đổi `id`, `data-page-id`, các hash URL đang dùng, hay tên khóa local storage nếu chưa có migration.
- Mermaid render được khi thư viện có mặt; nếu lỗi, source vẫn copy được như hiện tại.
- Không đưa dữ liệu runtime tại `data/` hay bí mật local vào Git.

## Điểm cần quyết định trước đợt tái cấu trúc kế tiếp

- Chọn mức độ tách: vẫn là static portal nhiều file, hay chuyển sang hệ thống build/framework.
- Xác định có cần dữ liệu dùng chung nhiều người hay chỉ tiếp tục local-first.
- Nếu portal trở thành production, bổ sung authentication/authorization, validation schema, kiểm thử API và chính sách backup cho dữ liệu task/roadmap.
