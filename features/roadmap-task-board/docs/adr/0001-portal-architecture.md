# ADR-0001: Portal migration architecture

- **Trạng thái:** Accepted (Phase 1 gate)
- **Ngày:** 2026-08-12
- **Bối cảnh:** Portal hiện là HTML đơn tệp ~4.5k dòng (content docs + Manager Portal v2 + Task Board + Roadmap). Backend mới (`backend/`, FastAPI+SQLite+Discord outbox) đã xong. Cần chuyển UI sang cấu trúc component hoá mà không đụng nội dung tài liệu.

## Quyết định

1. **Frontend: React + TypeScript + Vite** trong `frontend/`, cùng hướng với `awesome-quant-portal` — tái dùng đúng cách phân ranh shell/component/API, không sao chép UI.
2. **Backend: FastAPI + Pydantic + SQLite** (giữ nguyên, đã xong) — không đổi kiến trúc.
3. **Không iframe** — embedded Interpretation là feature lazy-load cùng design token/shell; iframe dễ lệch theme/focus/responsive/print.
4. **Strangler migration** — frontend mới chạy song song với HTML + `server.py` cũ; chỉ đổi default sau UAT; rollback = quay về legacy artifact + JSON export.
5. **Nội dung docs là raw fragment** theo `docs/contracts/content-integrity-manifest.json` — mọi component render raw markup, không parse prose/Markdown, không sửa Mermaid source.

## Hệ quả

- Content hash 100% trùng golden (gate Phase 2–3).
- API compat `GET|PUT /api/tasks|roadmap` + `GET /api/health` duy trì; UI mới dùng `/api/v1` với adapter local-first.
- Design token duy nhất theo Fund Paper (`tokens.css`), không raw hex ngoài token.