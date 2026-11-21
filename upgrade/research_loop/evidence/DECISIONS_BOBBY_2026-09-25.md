# Quyết định Bobby duyệt — 2026-09-25

Nguồn: tin nhắn Bobby 2026-09-25 ("tôi duyệt luôn cái này … tự quyết định cho phù hợp
HIFI, specification, sáng tạo, đúng luồng và link chung với các màn"). File này là chỗ
board và các record trỏ tới; mỗi dòng có trạng thái và nơi thực hiện.

## 1. Bảo mật worker — `CG-RF02-01`

| Quyết định | Thực hiện |
|---|---|
| Worker P06 bỏ `seccomp/apparmor=unconfined`, chạy profile hẹp | seccomp = moby v28.0.0 default + `unshare, mount, umount2, setns, fsopen, fsconfig, fsmount, move_mount`; AppArmor `portal-research-child` = docker-default chỉ cho proc trên `/proc`, tmpfs, propagation private; `systempaths=unconfined` giữ vì kernel chặn `--mount-proc` khi `/proc` bị che. Profile đã nạp lên host. Chứng minh trong image worker: mặc định Docker hỏng (unshare EPERM), profile hẹp chạy sandbox, bind mount và mount ngoài namespace của child bị từ chối; run thật WFO `rrun_f5e09186…` và P04 `rrun_566ef922…` COMPLETED/READY |

Hệ quả: đường chạy alpha import (source người dùng) không còn bị chặn vì lý do sandbox; việc mở nó vẫn là một phase riêng (admission + transfer source theo digest).

## 2. Lệch HiFi được chấp nhận — RF-04 / RF-06

| # | Màn | Lệch so với HiFi | Vì sao giữ |
|---|---|---|---|
| H1 | 01 | Nhãn "stitched OOS equity" cũng dùng cho run chỉ có một cửa sổ OOS | Cùng một chuỗi retained; tách nhãn theo số cửa sổ sẽ đổi nghĩa giữa hai run cùng loại |
| H2 | 04 | 15 ô metric thay vì 5 | Spec 04 liệt kê 15 metric engine publish; HiFi chỉ minh hoạ 5. Ô nào server không publish thì có lý do typed |
| H3 | 04 | EChart 3 tách thành hai chart nhỏ (rolling Sharpe · rolling beta) + thêm EChart 5 (rolling 20) | Hai chuỗi khác đơn vị; gộp chung trục sẽ nói dối. EChart 5 đọc chuỗi retained có sẵn |
| H4 | 04 | Passport dạng card + panel dataset inline thay vì strip + drawer (DQ-02) | HiFi thắng spec về hình; drawer ẩn các digest người audit cần thấy ngay |
| H5 | 03 | 5 stage thay vì 11 (DQ-04) | Engine chỉ phát 5 stage có thật; 11 stage của HiFi là minh hoạ, vẽ 6 stage không có nguồn là bịa |
| H6 | 01/04 | Tiền tệ 2 chữ số thập phân, không ký hiệu `$` | Account engine không mang đơn vị tiền tệ công khai; `$` là suy diễn |
| H7 | 12 | Chữ OOS-use của mode_3 global = "retrospective", mode_4 per_fold_causal = "withheld until Stage 4" | Theo đúng logic engine (W4 `bd2b60d1`); HiFi viết sai so với engine |
| H8 | 12 | Claim `event_lifecycle`: engine suy ra L0, catalogue ghi L2 — màn hiện cả hai và chỗ lệch | Không được chọn một bên để làm đẹp; lệch là một fact cho người đọc |

Các mục còn lại trong [audit §8–§9](./AUDIT_P11_P15_CLAUDE_2026-09-24.md) đã khớp HiFi (đo ở 1440) và không cần quyết định.

## 3. Quyết định chủ sở hữu giao cho Claude tự chốt theo HiFi/spec

| Mục | Người thực hiện | Nơi ghi |
|---|---|---|
| DR-02 — định nghĩa cảnh báo chung Search (06) / Freeze (07) | W5a | `P16/W5A_A10_CLAUDE_2026-09-25.md` |
| Reveal (P17-FE-DG-02 / P13-T12) | W5b | `P17/W5B_REPLAY_CLAUDE_2026-09-25.md` |
| A10c what-if lưới 81 ô — bắt buộc làm (D2) | W5a | như trên |
