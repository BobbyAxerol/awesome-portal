# Quy tắc cho contributor agent

Tài liệu này áp dụng cho agent chạy thay mặt Thanh Vuong. Agent là contributor,
không phải maintainer của Portal.

## Xác nhận bắt buộc đầu phiên

Trước khi sửa file, agent phải trả lời đúng ý sau và nêu tên nhánh đang mở:

> Tôi xác nhận tôi đang làm trong workspace cục bộ được Bobby cấp cho nhánh
> được chỉ định. Tôi sẽ không chuyển sang main hoặc dev, không kết nối Git
> remote, không push, không merge, không dùng SSH, sudo hoặc credential của
> Bobby. Tôi chỉ sửa đúng phạm vi đã được yêu cầu.

Không cần chờ thêm sau lời xác nhận nếu phạm vi công việc đã rõ. Nếu nhánh,
mục tiêu, hoặc phạm vi chưa rõ, agent phải dừng và hỏi Bobby.

## Quyền và giới hạn

- Bobby là maintainer duy nhất. Bobby có toàn quyền commit, merge và push tới
  origin và primus-origin khi Bobby yêu cầu.
- Thanh chỉ làm trên một nhánh feat, fix, chore hoặc docs mà Bobby đã tạo và
  cấp workspace. Main và dev là protected branch đối với Thanh.
- Workspace của Thanh phải không có Git remote. Không được thêm, đổi, xóa,
  fetch, pull hoặc push remote; không chạy gh, ssh, scp, curl có credential,
  hoặc bất kỳ lệnh nào gửi source ra ngoài.
- Không truy cập /home/bobby, không dùng sudo, không tìm hoặc dùng SSH key,
  token, secret, file environment, dữ liệu thật hay artifact runtime.
- Không checkout, merge, rebase, reset, cherry-pick, force-push, dùng
  --no-verify, hoặc sửa lịch sử Git.
- Chỉ được tạo local commit khi Bobby nói rõ hãy commit. Commit chỉ được nằm
  trên đúng nhánh được giao; tuyệt đối không commit trực tiếp vào main hoặc dev.
- Không sửa control plane trừ khi Bobby yêu cầu rõ ràng: AGENTS.md,
  CONTRIBUTING.md, CONTRIBUTOR_AGENT_RULES.md, .githooks, .github, deploy,
  compose.yaml, Makefile, Git ignore files, hay script quản trị contributor.

## Cách làm việc

1. Kiểm tra nhánh và chạy scripts/verify-contributor-workspace.sh.
2. Đọc AGENTS.md và tài liệu của domain được giao trước khi sửa.
3. Chỉ sửa phần source cần thiết. Không đưa generated files, caches, secrets,
   data, database hay dependency folders vào thay đổi.
4. Chạy test phù hợp mà workspace cho phép. Không cài package hệ thống và
   không thay đổi service đang chạy.
5. Nếu Bobby chưa yêu cầu commit, dừng ở trạng thái thay đổi cục bộ. Nếu đã
   yêu cầu commit, tạo một commit nhỏ, rõ nghĩa trên nhánh được giao.
6. Kết thúc bằng handoff: nhánh, danh sách file thay đổi, test đã chạy/kết quả,
   commit SHA nếu có, và rủi ro hoặc việc chưa làm. Không tự tạo PR, merge hay
   push.

Các Git hooks là lớp cảnh báo và chặn thao tác nhầm. Quyền thực tế đến từ
workspace riêng không có remote, credential Bobby không được chia sẻ, và chỉ
Bobby mới import/push thay đổi.
