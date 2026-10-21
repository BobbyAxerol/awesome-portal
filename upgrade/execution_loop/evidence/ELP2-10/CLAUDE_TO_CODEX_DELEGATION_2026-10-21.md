# Claude → Codex: giao các việc nhỏ, Claude giữ vai trò chính (2026-10-21)

Bobby giao Claude làm chính các hạng mục còn dở của ELP2-10; việc nhỏ nằm trong kênh hoặc quyền của Codex được giao lại ở đây. Đây là gói giao việc, chưa phải ACK của Codex. Pin nguồn: `claude/fe-parity` (SHA mới nhất ghi trong `HANDOFF_TO_CODEX.md` §11).

## A. Việc giao cho Codex (nhỏ, trong quyền Codex)

| # | Việc | Vì sao Codex | Xong khi |
| --- | --- | --- | --- |
| C1 | Sửa race BUSY của `native-business-read-client.ts` (giữ slot tới `close` thật) và commit trên `chore/core009-connected-20261021` | File của Core; đang là WIP của Codex | Có SHA + test `elp210-native-business-read-client`; Claude nhận bằng `git show` |
| C2 | Hoàn tất recovery/revoke của lease gốc `785387ba/07becd72` và dọn đúng phiên, hai grant | Chỉ Codex có quyền vận hành Core009 | Receipt recovery/revoke, không UNKNOWN |
| C3 | Cấp grant `stream.subscribe` đúng thủ tục (một ROOT, toàn fleet) khi nguồn notice sẵn sàng | Hành động quyền chính xác, không thuộc code | Receipt grant + STREAM-only revoke |
| C4 | Gửi 3 gói yêu cầu cho owner qua kênh Unified/sync: PM07, TS03, target01/06 (`PORTAL_TO_OWNERS_COORDINATION_2026-10-20.md`, chưa gửi) | Codex giữ kênh tới owner | Ghi ACK/NOT_SENT cập nhật |
| C5 | Hỏi Core/PM quy tắc sở hữu NET_PNL cho account dùng chung (hai fact trùng account vật lý) | Quyết định nguồn, không tự dedupe | Câu trả lời ghi vào Unified; Claude cài khi có quy tắc |
| C6 | Đưa disposition CR-01…04 và quyết định Bobby 2026-10-21 vào Unified/sync | Codex sở hữu Unified/sync | Dòng Unified cập nhật |
| C7 | Landing: commit phần Markdown WIP của canonical, rồi `merge --ff-only` khi Claude báo đóng băng nguồn + hook xanh trên SHA đó | Tích hợp viên duy nhất | SHA kết quả sau landing |

## B. Việc Claude giữ (chính)
- Mọi sửa nguồn backend: CR-01…04, series, fleet pairing, `revokeSession` nối vào đường revoke, EXPLAIN B1 ở quy mô lớn, quyền đọc SQL image.
- Đo M-1…M-7: script + chạy bản fixture; cửa sổ độc quyền (M-5, M-7) xin qua Edge/Codex.
- Sổ nợ UXM-07: đối chiếu và xử lý các mục DEBT-004/005/006/007/011/014/020/024/025 phía Portal (registry, tên capability, wiring reader, route lineage).
- UI/fixture preview 8095, baseline ảnh V2, nhận route/consumer khi cắt sang dữ liệu thật.

## C. Ranh giới giữ nguyên
Không đụng file cài native khi vận hành viên ghim ứng viên 73435311; không stash/reset cây của nhau; fixture không phải bằng chứng connected; Alpha/Deployment series không mở; stream chỉ toàn fleet.

## D. Quy tắc khóa mới của Bobby (2026-10-21), áp dụng cho cả hai agent
Bobby yêu cầu thêm vào rules của cả Claude và Codex: không khóa lung tung nếu không có điều khoản chính đáng. Bản của Claude: `upgrade/execution_loop/AGENT_WORKING_RULES.md` §10.10b (commit `b5590b6e`): danh sách khóa đóng, bọc đúng một lệnh, không giữ khóa lúc chờ, không chen hàng, chờ quá 10 phút thì dừng và báo, dọn đúng phần mình tạo. Đề nghị Codex đưa cùng nội dung vào bản canonical (Codex giữ file đó) khi đối chiếu rules lúc landing, giữ cả hai phía.
