# Quy tắc cho contributor agent

Tài liệu này áp dụng cho agent chạy thay mặt Thanh Vuong. Agent là contributor,
không phải maintainer của Portal.

## Xác nhận bắt buộc đầu phiên

Trước khi sửa file, agent phải xác nhận tên branch hiện tại và nói rõ ý sau:

> Tôi xác nhận tôi chỉ làm trên branch được Bobby giao trong workspace của
> Thanh. Tôi chỉ có thể push đúng feature branch đó lên primus-origin khi
> Bobby yêu cầu; tôi sẽ không dùng origin, không push dev/main/tag, không merge
> PR, không dùng credential của Bobby và không sửa ngoài phạm vi được giao.

Nếu branch, mục tiêu, hoặc phạm vi chưa rõ, agent phải dừng và hỏi Bobby.

## Quyền và giới hạn

- Bobby giữ toàn quyền với canonical local checkout và remote BobbyAxerol.
- Thanh làm việc bình thường trên branch feat, fix, chore hoặc docs mà Bobby
  đã checkout và cấp workspace.
- Thanh được commit local trên branch được giao. Khi Bobby yêu cầu handoff,
  Thanh được chạy git push -u primus-origin <branch> và tạo PR có base là dev.
- Chỉ primus-origin được phép dùng từ workspace này. Origin không tồn tại và
  không được thêm lại. Không push main, dev, tag, branch khác, branch deletion,
  hay ref mapping khác tên branch hiện tại.
- Không merge, auto-merge, approve, dismiss review, rebase, reset, force-push,
  cherry-pick vào protected branch, dùng --no-verify, hoặc sửa lịch sử chung.
- Không truy cập /home/bobby, không dùng sudo, không tìm hoặc dùng SSH key,
  token, secret, file environment, dữ liệu thật hay artifact runtime của Bobby.
- Không sửa control plane trừ khi Bobby yêu cầu rõ ràng: AGENTS.md,
  CONTRIBUTING.md, CONTRIBUTOR_AGENT_RULES.md, .githooks, .github, deploy,
  compose.yaml, Makefile, Git ignore files, hay script quản trị contributor.

## Cách làm việc

1. Chạy scripts/verify-contributor-workspace.sh trước khi sửa.
2. Đọc AGENTS.md và tài liệu của domain được giao trước khi sửa.
3. Sửa đúng source cần thiết; không đưa generated files, cache, secrets, data,
   database hay dependency folder vào commit.
4. Chạy test phù hợp. Không cài package hệ thống và không thay đổi service
   đang chạy.
5. Commit nhỏ, rõ nghĩa trên đúng branch được giao. Không chuyển branch nếu
   Bobby không yêu cầu.
6. Chỉ khi Bobby yêu cầu, push branch đó lên primus-origin và tạo/cập nhật PR
   vào dev. Sau đó dừng, không tự merge.
7. Kết thúc bằng handoff: branch, commit SHA, link PR nếu có, file thay đổi,
   test đã chạy/kết quả, và rủi ro hoặc việc chưa làm.

Hooks sẽ chặn nhầm lẫn phổ biến. Quyền merge cuối cùng phải được chặn bởi branch
protection của primus-origin; agent không được xem local hook là lý do để vượt
qua quy tắc đó.
