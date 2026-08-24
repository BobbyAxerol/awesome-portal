# Dựng cho tablet và điện thoại — 2026-08-23

Bobby duyệt hỗ trợ 834 (tablet) và bảo *"cố gắng build cho lap và điện thoại luôn"*, tức overrule lập
luận cũ của tôi rằng 390 không đáng theo đuổi. Làm theo.

## Kết quả đo được

| Khổ | Trước | Sau |
|---|---|---|
| 390 (phone) | thân trang **932px** — gấp 2,4 lần màn hình | **390px** — hết cuộn ngang |
| 834 (tablet) | thân trang **932px** | **834px** — hết cuộn ngang |
| Số hộp tràn không có khung cuộn @834 | 8 | **0** |

## Cách làm: tìm gốc, không vá 96 triệu chứng

Ở 390 có 96 phần tử bị cắt. Vá từng cái là sai cách — con số **932 xuất hiện ở cả hai khổ**, nghĩa là có
một sàn cứng chung. Đo ngược lên thì shell **đã co đúng** (`.portal-rail` về 0), thủ phạm nằm trong nội
dung. Từ đó ra **sáu nguyên nhân gốc**, không phải 96 lỗi:

| # | Gốc | Sửa |
|---|---|---|
| 1 | `<span class="exec-num">` bọc **cả câu danh tính bảy phần** trong Account/Broker 360 | Tách mỗi phần một span, dấu `·` để ngoài — đúng mẫu Portfolio 360 đã dùng. `.exec-num` mang `nowrap` để **bảo vệ số**; áp cho một câu thì thành một khối 900px không bẻ được |
| 2 | 18 bảng rộng không có khung cuộn | Bọc `.exec-scroll-x` (`overflow-x: auto`) |
| 3 | `.exec-queue-body` — media query cũ đổi sang `column` nhưng **để quên `align-items`** | Trong flex cột, `flex-start` khiến item rộng bằng nội dung → 612px trong khung 326px. Thêm `align-items: stretch` + `flex-wrap: nowrap` |
| 4 | Lưới cột cố định (`exec-grid-2`, `360-grid3`, `cc-twoup`, `cc-row`, `cert-strip`, `alpha-tiles`) | Một khối `@media (max-width: 640px)` gộp về một cột |
| 5 | Token máy không có chỗ ngắt trong `li` lineage và note guard-rule | `overflow-wrap: anywhere`. Riêng `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4` là **48px cuối cùng** của cuộn ngang ở phone |
| 6 | Chip `nowrap` mang câu chứ không mang số | `white-space: normal` + cho xuống dòng |

Không chỗ nào **ẩn nội dung hay cắt ngắn giá trị**. Cột không vừa thì xuống dưới; bảng không vừa thì
cuộn trong hộp của nó; token dài thì xuống dòng — M6 muốn mọi ký tự còn trên màn hình.

## Hai sai lầm của tôi trong đợt này, ghi lại

**Đoán tên class thay vì tra.** Tôi viết `.exec-evidence-list li` cho danh sách artifact; tên thật là
`.exec-live-lineage`. Rule không ăn, và tôi mất một vòng đo mới phát hiện. Lặp lại lần hai với chip.

**Thêm `flex-wrap: wrap` vào `.exec-queue-body`** để "cho rail xuống dòng" — nhưng media query đã đổi nó
sang `flex-direction: column`, và **wrap trong flex cột nghĩa là đẻ thêm cột**, làm khung nở ngang.
Tôi tự tạo ra chính lỗi mình đang sửa. Đã gỡ; bản sửa đúng chỉ là `align-items` + `nowrap`.

## Một chỗ **chưa đóng được**, ghi rõ

Chip cross-filter của Full Blotter: cần **326px dòng không bẻ được trong hộp 284px** ở khổ phone.

Sáu lần thử — `white-space: normal` trên chip, `overflow-wrap: anywhere` trên text, `min-width: 0` trên
chip với tư cách flex item, rồi trên các con của nó. Mỗi lần số dịch vài pixel (356 → 347, 344 → 335)
mà không đóng. `min-width: auto` phải được gỡ ở **mọi tầng** giữa chữ và hộp hẹp, và còn một tầng đang
giữ.

Nó **được chứa**: thân trang không cuộn ngang (gate assert điều đó ở cả bốn khổ). Tôi pin con số 6 trong
`execution-surface-audit.spec.ts` để nó **giảm được nhưng không tăng được**, và ghi lại đây thay vì mài
tiếp hoặc xoá test cho suite xanh.

## Gate

`execution-surface-audit.spec.ts` giờ chạy **cả bốn** breakpoint (28 test). Suite ảnh vẫn chỉ baseline
laptop + workstation: đóng băng từng pixel một layout phone là khoá lại một hình dạng chưa ai duyệt,
còn câu hỏi ở đây khác hẳn — *dùng được ở khổ này không*, chứ không phải *có đổi không*.
