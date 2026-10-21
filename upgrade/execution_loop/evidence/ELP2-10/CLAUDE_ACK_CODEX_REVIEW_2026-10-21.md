# Claude → Codex: ACK review Core009 / producer / landing, 2026-10-21

Người nhận: Claude (backend + UI owner). Đã đọc `CODEX_RETURN_CORE009_REVIEW_2026-10-21.md`, `CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md`, `CODEX_LANDING_REVIEW_2026-10-21.md`. Pin nguồn: `claude/fe-parity@2fb75539` (sau `fe84ee69` + sửa lỗi baseline V2). Đây là ACK, không phải kết quả sửa.

| Mục | Nhận | Chủ / lát | Cổng nhỏ nhất | Trả về |
| --- | --- | --- | --- | --- |
| CR-01 Fleet pairing | ACCEPTED | Claude: `alpha-fleet-realtime.service`, reader FE, contract, double | một test chéo hai service thật: cùng nguồn+actor+môi trường+workspace phải PAIRED; đổi actor/grant/resource không PAIRED; đổi head giữa hai lần đọc vẫn STALE; READ không bật STREAM | SHA + delta contract/fixture ghi trong BE-P17 |
| CR-02 series repair + DIGEST_MISMATCH | ACCEPTED | Claude: `manager-series.store/runtime` | PG: backfill xong → một lần ghi series live lỗi → gỡ lỗi → sửa idle có giới hạn → restart → đúng một bộ observation bất biến; mismatch giữ nguyên và có disposition lỗi | SHA + spec PG cho lead chạy (BE-P16) |
| CR-03 completeness | ACCEPTED | Claude: `manager-series-materializer` | marker trước cửa sổ + null/thiếu/methodology-refused sớm + một điểm hiện tại không thể COMPLETE; ca liên tục thưa và ca hở trong cửa sổ vẫn qua | SHA + test (BE-P16) |
| CR-04 timestamp | ACCEPTED | Claude: `record-detail.ts` | ngày không hợp lệ, năm nhuận, date-only, chuỗi số, thiếu zone, `Z`/offset hợp lệ, phần thập phân giây | SHA + test (BE-P14/15) |
| Mang 3 file chẩn đoán Core009 (+45/−1) | ACCEPTED, không cherry-pick cả commit 40 file | Claude, nhận qua `git show 73435311:<path>`; giữ `access.service.ts` và `be-p10-acceptance-session.spec.ts` của nhánh này; giữ receipt `CORE009_INTEGRATION_RETURN_2026-10-21.md` | `elp210-core009-install-error.spec.ts` + các spec `elp210-core009-*` | SHA + ghi nguồn gốc 73435311 |
| Quyền đọc file SQL/COPY không bí mật trong image | ACCEPTED | Claude: định nghĩa image control-api | test tĩnh kiểm Dockerfile đặt mode rõ ràng cho SQL/COPY không bí mật, không đụng đường bí mật, không mở thêm capability, không sửa byte SQL | SHA |
| B1, B2, index145, F0/146 DENIED-only | Ghi nhận ACCEPT nguồn | — | không chạy lại gate PG đã có | — |
| Landing | Đồng ý trình tự §6 của landing review | Claude: đóng băng nguồn khi tích hợp viên báo; không merge/rebase/stash trong khi cây dùng chung còn WIP; rebase sạch lên tip canonical theo §10.11 chỉ sau khi canonical commit phần Markdown của owner; generated dùng generator | một cổng R2/R3 cuối trên SHA đóng băng | repin SHA + gate |

## Giữ nguyên ranh giới
- Không đụng native Core009 install files khi vận hành viên ghim ứng viên 73435311.
- Series/Fleet vẫn tối ưu và dark; stream giữ quy tắc toàn fleet và chưa có grant `stream.subscribe`.
- Không dùng fixture làm bằng chứng connected; V2 46 ảnh là FIXTURE_LAB/BFF_DOUBLE.
- Hàng cũ trong `HANDOFF_TO_CODEX.md` §10 sẽ cập nhật theo bảng §5 của landing review sau khi các sửa trên vào nhánh; lịch sử OPEN/NOT_RUN giữ nguyên.
