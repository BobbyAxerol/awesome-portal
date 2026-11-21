# VD-F1-01…03 và VD-TEXT-01 — quyết định của Bobby, 2026-10-01

Nguồn: Bobby (chat 2026-10-01) — "duyệt cả 3 … giảm số chữ hard code, hard text đi, bố cục thì vẫn theo HiFi thôi, còn backend cần làm thì cũng viết lại và note lại". Nguyên tắc: chữ/chip **không cần cho luồng UX thì bỏ**, nhường chỗ cho biểu đồ và số liệu. Các lệch HiFi dưới đây là **đã duyệt** (thay "HiFi thắng về chữ"); **bố cục, khoảng cách, khối, biểu đồ giữ đúng HiFi**.

| Id | Quyết định | Lệch HiFi | Backend |
|---|---|---|---|
| **VD-F1-01** | S14 câu từ chối origin = **"Request refused — reload the page and try again."**; mã chỉ ở dòng chi tiết; không nêu nguyên nhân | HiFi 14 không có câu này (trạng thái lỗi do FG-08) | không |
| **VD-F1-02** | S10: **bỏ chip lifecycle-version khỏi từng node**; node chỉ hiện trạng thái của chính attempt (COMPLETED / FAILED / CANCELLED / RUNNING / DRAFT…); lifecycle version (ACTIVE / SUPERSEDED / ABANDONED) hiện **một lần ở tiêu đề band**; 4 nút lọc giữ, nhãn đúng cái chúng lọc | HiFi H10:100,318 có chip ACTIVE/DRAFT/SUPERSEDED/ABANDONED trên node | **CG-FG-S10-02 đóng "won't-do"** — Codex không làm `lineage_status` / `superseded_by` |
| **VD-F1-03** | S13: giữa hai thẻ claim bằng nhau **không in gì**; "claim ↑" chỉ ở bước claim thật sự tăng; câu luật dài → tooltip tiêu đề ladder (một dòng ngắn chỉ khi có bước tăng); khi **mọi** thẻ cùng một claim → dòng "N attempts · one claim: <family>" + lưới thẻ không mũi tên | HiFi H13:73,77,329 vẽ ladder 4 bậc tăng dần cố định | không |
| **VD-TEXT-01** | Giảm chữ hard-code ở màn có biểu đồ/số liệu theo `fe-inventory/B2_text_trim_proposal.md`: bỏ footer "rules of this screen", subtitle dưới header, "— đuôi giải thích" của tiêu đề khối, câu "the UI computes nothing / never infers" dưới biểu đồ; rút caption; giữ typed absence ngắn + mã lý do, nhãn scope/đơn vị/legend/trục. Tooltip qua `title`. Ước lượng −78% chữ (≈5.516 → ≈1.210) | phần lớn chữ bỏ đi là nguyên văn HiFi | xin bản ngắn của chữ do server trả (BR-TXT-01) |

Việc làm: đợt F1b (`FRONTEND_GAPS_FOR_SONNET_2026-09-30.md` §8). Visual baseline sẽ đổi → trình Bobby, không tự `--update`.
