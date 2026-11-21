# UXM-02 — Luồng người dùng theo persona (nháp, Claude)

Mỗi luồng cho biết người dùng **hỏi gì ở mỗi bước**, màn nào trả lời, và **quyết định gì** kế tiếp. Mã M01–M10 là các màn lowfi trong [lowfi/](lowfi/).
Nguyên tắc: tối đa 3 lần bấm từ Overview tới câu trả lời; ngữ cảnh (môi trường, cửa sổ, bộ lọc) đi theo URL nên Back luôn về đúng chỗ.

## 1. Manager (đọc toàn quỹ)

```mermaid
flowchart TD
  A["M01 Overview<br/>Quỹ đang ở đâu? Có gì cần xử lý?"] -->|"Needs attention"| B["M09 Operations<br/>lệnh/ngoại lệ nào cần tôi"]
  A -->|"So sánh portfolio"| C["M02 Portfolios"]
  A -->|"Alpha nào kéo tụt?"| D["M03 Alpha Fleet<br/>lọc Health = Needs attention"]
  C --> E["M04 Portfolio 360<br/>vốn, allocation, rủi ro"]
  E -->|"alpha trong portfolio"| F["M05 Alpha 360<br/>hiệu suất, stage, score"]
  D -->|"peek"| F
  F -->|"deployment"| G["M07 Deployment<br/>(màn chi tiết giữ nguyên)"]
  F -->|"account"| H["M06 Account 360"]
  B -->|"UNKNOWN: kiểm tra yêu cầu gốc"| B
  E -->|"hành động"| I["Xem trước (không phải receipt)<br/>→ xác nhận → M09 theo dõi receipt"]
```

## 2. Researcher (chỉ lát của mình)

```mermaid
flowchart TD
  A["M01 bản own-slice<br/>Alpha của tôi chạy sao?"] --> B["M03 Fleet<br/>chỉ alpha của tôi"]
  B --> C["M05 Alpha 360<br/>stage, score (Pending), regime"]
  C -->|"Explain"| D["Score drawer<br/>lý do chưa có số"]
  C -->|"dừng alpha"| E["Yêu cầu archive<br/>(manager duyệt)"]
  E --> F["M08 Archived<br/>theo dõi paper monitor"]
  F -->|"đề nghị kích hoạt lại"| G["Manager review<br/>(researcher chỉ theo dõi)"]
```

## 3. Operator (xử lý sự cố/lệnh)

```mermaid
flowchart TD
  A["M09 Exceptions<br/>Cái nào đang kẹt/không rõ?"] --> B["Hàng lệnh<br/>Intent · Receipt · Reconciliation"]
  B -->|"Receipt = UNKNOWN"| C["Check original request<br/>(chỉ đọc; Send again bị tắt)"]
  B -->|"Applied nhưng đang catching up"| D["Chờ hiển thị cập nhật<br/>không gửi lại"]
  B -->|"Rejected"| E["Làm mới preview rồi quyết định"]
  C --> F["M06 Account 360<br/>đối soát vị thế/lệnh"]
  A -->|"Acknowledge / Resolve"| G["Đóng ngoại lệ"]
```

## 4. Người dùng hỏi "vì sao tôi không thấy/không làm được?"

```mermaid
flowchart LR
  A["Nút bị tắt / số ẩn"] --> B["M10 Profile & Access<br/>Tôi thấy gì · làm được gì · được cấp bởi ai, hết hạn khi nào"]
  B --> C["Lý do dễ hiểu<br/>(không lộ dữ liệu ngoài quyền)"]
```

## Quyết định của Bobby (2026-10-17, tất cả theo khuyến nghị UX)

| # | Quyết định |
| --- | --- |
| F1 | Manager **không** đi tắt từ Overview tới màn deployment; luôn qua Alpha/Account để giữ ngữ cảnh. Needs attention trỏ tới Operations hoặc Alpha/Account, không tới deployment |
| F2 | Hành động vốn (grant, recall, đặt mục tiêu ngân sách) **chỉ bắt đầu từ Portfolio 360 (M04)**; Operations chỉ theo dõi receipt |
| F3 | Researcher bấm **Request archive ở Alpha 360**; manager duyệt trong hàng chờ ở **Operations & Decisions**; tái kích hoạt chỉ manager |
