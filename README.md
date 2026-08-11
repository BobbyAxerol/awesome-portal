# Primus Spark Quant Ecosystem — Migration Portal

Một portal tĩnh bằng tiếng Việt để lưu trữ đánh giá hiện trạng, kế hoạch acquisition/migration và bản demo Manager Portal cho hệ sinh thái giao dịch định lượng.

## Chạy cục bộ

Không cần cài dependency:

```bash
python3 server.py
```

Mở `http://127.0.0.1:8000`.

Không chạy backend, bạn vẫn có thể mở trực tiếp tệp HTML; trạng thái Task Board và Roadmap khi đó chỉ nằm trong `localStorage` của trình duyệt. Khi chạy `server.py`, hai trạng thái này được lưu cục bộ tại `data/tasks.json` và `data/roadmap.json`; đây là dữ liệu runtime nên không được đưa vào Git.

## Cấu trúc hiện tại

| Đường dẫn | Vai trò |
| --- | --- |
| `quant_trading_ecosystem_architecture_migration_portal_vi.html` | Toàn bộ nội dung, CSS và JavaScript của portal. |
| `server.py` | HTTP server cục bộ và API lưu Task Board/Roadmap, chỉ dùng Python standard library. |
| `docs/RESTRUCTURING_BASELINE.md` | Bản đồ hiện trạng và các ranh giới đề xuất trước khi tách mã. |

Xem [baseline tái cấu trúc](docs/RESTRUCTURING_BASELINE.md) trước khi thay đổi cấu trúc. Mục tiêu của đợt tách đầu tiên là giữ nguyên hành vi và giao diện hiện có.
