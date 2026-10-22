# Prompt for the Edge owner — current Core009 reply

```text
Edge — tiếp tục C7/EPG10-08 trong worktree hiện tại:
/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2

Đọc AGENTS/rules, Unified hiện hành, handoff original08 §11 và:
upgrade/evidence/execution-edge-v1_2/EPG10-08/CORE_TO_EDGE_08_ACTION_HANDOFF_2026-10-22.md
Đối chiếu bốn receipt được link trong handoff; không dùng note OPEN cũ để
yêu cầu lại successor build hoặc8PM transfer đã hoàn tất.

Core đã trả ACK image/config/schema và giao đúng8PM files tại:
/home/bobby/secure/edge-core009-trust-20261022-5e3a2ac0/
Trust12504f44 còn hiệu lực đến23Oct10:00:58 giờ VN. C288 đã được Bobby duyệt
riêng Research, chưa áp dụng; unresolved8/reserve20/history giữ nguyên.
Cửa sổ10:15–10:45 ngày22Oct và §10.5 đều hết hạn: trả slot tương lai khả thi.

Làm ngay phần Edge được giao:
1. Xác minh public pins/private refs thật; repin source/SDK/config và WIP.
2. Chuẩn bị acceptance/install/revoke/runtime bytes MỚI và readonly preflight
   trong scope đã duyệt. Trả PREPARED: IDs/CAS, raw hashes/document digests,
   source_set_ref, human/domain/mapping/config pins, expiry, slot VN+UTC.
   Phân biệt human mapping với protected-owner mapping; không tự thay owner.
3. Chờ đúng Core hash ACK trước khi arm/install. Sau ACK, chạy đúng finite
   target đã duyệt và trả SDK_READY thật với installation receipt/revision,
   fingerprint/effective interval, runtime pins và process/cleanup witness.
4. Core sẽ dùng official writer cấp current READ và session thật sau READY.
   Sau đó Edge chạy bounded READ/terminal/Core ACK và cleanup đúng scope.

Không bắt bounded READ chờ P22/cache/control, STREAM, Manager PKI, tài chính
hay calibration/G2. Các phần đó vẫn ghi owner/action riêng, không miễn gate.
READ không tự cấp STREAM; không dùng fixture/non-native200 làm control.
Không sửa stable/dev/provider28445, không SQL seed/reset, không tạo receipt/
attempt/ACK giả, không retry UNKNOWN bằng key mới, không đưa secret vào Git/chat.

Trả từng phần sẵn sàng vào:
upgrade/evidence/execution-edge-v1_2/EPG10-08/EDGE_TO_CORE_08_BINDING_REPLY_2026-10-22.md
Link từ Edge Unified. Báo lại full path + SHA256 + trạng thái PREPARED/READY
thật + field còn thiếu/owner/action. Chỉ báo connected PASS khi có receipt thật.
Không yêu cầu Bobby cấp lại phê duyệt chung cho gói Research đã duyệt.
```

