# Mục đích và vị trí truy cập — Migration Tracker

> Bản đính chính về mục đích sản phẩm và kiến trúc thông tin (IA) của portal này.
> Áp dụng cho cả bản legacy lẫn Frontend V2.

## 1. Mục đích

Portal này **không phải** thành phần nổi bật của hệ sinh thái quant (không phải trang
chủ, không phải "manager dashboard" chính của hệ thống cha). Mục đích duy nhất của nó:

> **Chốt phương án migration + theo dõi (track) task triển khai để manager xem và duyệt.**

Cụ thể:

1. **Chốt phương án** — các trang Docs chứa đánh giá hiện trạng từng layer, quyết định
   giữ/sửa/thay, kiến trúc đích sau upgrade V1 và thứ tự migration. Đây là tài liệu
   "source of truth" cho quyết định migration (đã đóng băng tại `portal-baseline-v1`).
2. **Task tracker cho manager** — Roadmap (6 phase P0–P5) và Task Board (Kanban 36 task
   ACQ/…) là nơi manager theo dõi tiến độ, phê duyệt trạng thái và kiểm chứng tiến độ
   triển khai; mọi thay đổi để lại dấu vết (audit) trên backend.
3. **Bằng chứng và báo cáo** — Evidence (repo/artifact đối chiếu) và Reports (tóm tắt
   định kỳ) phục vụ việc review của manager.
4. **Manager Platform (view "Portal")** — chỉ là *bản mockup minh họa* domain nội bộ
   (Alpha Pool → Backtest → Paper → Live) để manager hình dung hệ thống đích. **Không
   phải hệ thống thật, không phải mục tiêu của portal này.**

## 2. Vị trí truy cập (IA)

Trong hệ thống cha (parent ecosystem portal), portal này **không được** đặt nổi bật
ở wireframe/top-level navigation. Đường dẫn mẹ chỉ nên trỏ vào nó từ:

- **Settings** của hệ thống cha (liên kết phụ "Migration Tracker"), hoặc
- **Mục quản lý Task** (nơi manager làm việc với task, coi đây là một công cụ theo dõi).

### Cách thể hiện trong Frontend V2

| Khu vực | Vị trí | Nội dung |
|---|---|---|
| Topbar (top-tabs) | Nổi bật, cấp 1 | Docs · Roadmap · Board · Reports · Evidence |
| Sidebar → "Quản lý Task" | Cấp 2, nhóm quản lý task | Roadmap · Board (bản sao, tiện truy cập khi ở nhánh khác) |
| Sidebar → "Settings" | Cấp 2, nhóm settings | **Portal** (Manager Platform mockup — chỉ truy cập tại đây) |

Quy tắc:

- View **Portal** không nằm trong top-tabs; chỉ vào được từ sidebar nhóm Settings.
- Hash cũ `#view=portal` vẫn hoạt động (router giữ tương thích legacy), nhưng không còn
  đường dẫn nổi bật nào trỏ tới.
- Top-tabs chỉ tối đa 5 mục; bất kỳ mục nào bị hạ cấp sau này cũng đi vào sidebar
  nhóm Settings thay vì tăng số tab.

## 3. Hệ quả cho roadmap phát triển

- Phase 3 (feature migration) ưu tiên hoàn thiện **Docs + Roadmap + Board** trước —
  đây là phần manager thực sự dùng.
- Manager Platform (view Portal) giữ mức *mockup trình bày*; mọi chi tiết vận hành
  thật của domain nội bộ nằm ở trang docs "13. Manager Platform — Domain nội bộ",
  không phải ở view này.
- Các màn hình Reports/Evidence giữ nguyên thứ tự và nội dung hiện có (không đổi
  theo yêu cầu này).

## 4. Tham chiếu

- `upgrade/KE_HOACH_MIGRATION_5_PHASE.md` — kế hoạch 5 phase.
- `docs/design-system-catalog.md` — component map, vị trí từng component trong shell.
- `docs/adr/0001-portal-architecture.md` — quyết định kiến trúc frontend.
