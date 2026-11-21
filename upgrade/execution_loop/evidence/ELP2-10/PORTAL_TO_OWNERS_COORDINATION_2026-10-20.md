# Portal → owners: ba request-packet điều phối (2026-10-20)

Người viết: Claude (Portal backend owner, `AGENT_WORKING_RULES.md` §10.13). Gốc: `EDGE_CONNECTED_ACCEPTANCE_PRIORITY_HANDOFF_2026-10-20.md` §2, §4, §5 (P1).
Source Portal: `claude/fe-parity` @ `105775f0371aca10a5614fdcecffbc121feeaf61` (repin về SHA landing).

**Không có gì trong file này được PM, TS, DL, Research hay target owner duyệt, chấp nhận hoặc xác nhận.** Ba packet là yêu cầu điều phối, trạng thái `REQUESTS_WRITTEN / NOT_SENT`: file này nằm trong Git, **chưa được gửi** tới ai. Portal không sửa, không deploy, không duyệt hộ phần nào của owner; không tự chốt số, roster hay cửa sổ. Không secret, token, session hay giá trị private. Không mở phase mới, không mở UI task, không bật command / Live.
Mức mọi thứ Portal đã có ở dưới: `FIXTURE_VERIFIED` hoặc `SOURCE_ONLY`; `CONNECTED_VERIFIED` = 0.

---

## Packet 1 — PM07: command relay target

| Mục | Nội dung |
| --- | --- |
| Gửi tới | PM / TS authority owner (worktree PM trên HK). Portal consumer owner = Claude phối hợp, không sửa hộ PM. Edge giữ phía transport / relay. |
| Request gốc | Edge EPG10-07 (`COMMAND_RELAY_AND_OWNER_RETURN.md`), RG03 / RG04 / RG16 / RG17 theo handoff §4. Portal không có bản các RG này trong cây; dùng đúng bản gốc của PM / Edge. |
| Pin nguồn (nguyên văn từ handoff Edge §4) | Worktree `/home/bobby/.worktrees/trading-system-pm-v1_1`, branch `feat/portfolio-account-v1_1-parallel@ff2bb673bbd3200367cde9871ad46c6790337e12`. Đọc `contracts/baseline/portfolio-account-v1_1/pma11-14-edge-command-{transport,handoff}.json` và main plan / PM guide R2 hiện hành trong chính worktree đó. Descriptor `83d251e847169571bdfd13839d9a2bcace7db3dda1e5be5b340650a56a6437ba`; handoff `7b62d7e17198347c85adc5267a319a175733adc2cb3b540d167a35135ed04a0b`. |
| Portal đã làm (consumer) | (1) **BE-P13** (commit `3c653cc6`, `b8792631`, `f7e9343e`, ledger `be089fa4`): F0 apply 409 là envelope `{error, request_id, details}`; `details` mang sáu trường RelayDenied + `request_key` + `replayed`; xung đột key có `details {request_key, source_request_sent:false}`; `CommandStatus` luôn có `source_rejection` và `venue_fill` (typed absence, không có nhánh PUBLISHED); `CommandSubmitResult` mang bit `replayed`. Consumer receipt: `evidence/UXM-07/consumer-receipt-be-p13-2026-10-20.md` (verdict ACCEPTED các mục 1–7 ở V2, **FIXTURE_LAB**, R1; R2 chưa). (2) **BE-P12** consumer receipt (`consumer-receipt-be-p12-2026-10-20.md`): identity / stage facts trên thân SCOPED_V2, không liên quan relay. (3) FE `apps/portal/frontend/src/execution/commandPlan.ts#readRelayDenial` đã sửa (RV-01 trong `HANDOFF_TO_CODEX.md`): đọc `details` của 409; deny-by-default theo hướng trung thực (`source_request_sent` không đọc được ⇒ coi là đã gửi; `retry_allowed` không đọc được ⇒ không cho thử lại); hồi quy bằng fixture chuẩn. Mức `FIXTURE_VERIFIED`; hook R2/R3 terminal: `HOOK_RESULT_2026-10-20.md` (pending). (4) Portal **không** gửi, không bật, không kết nối command nào; 78 nút command vẫn disabled với `blocked_reason`. |
| Portal chưa có / không làm | Không có body thành công của F0 apply (chỉ `RelayDenied` hoặc xung đột key); không có `idempotency key` trong body (key do fake port mô phỏng); lý do reject typed, `replayed` trên status, số lượng partial và tra theo key là `Not published` (SRC-B3 trong `BE-CLAUDE-2026-10-20/REQUESTS_FOR_SOURCE_OWNERS_2026-10-20.md`); PM recall remainder-read chưa qualify (SRC-L1); `pma11-14` còn TEST_ONLY, native targets rỗng, lease provider chưa cấu hình (SRC-L2). Không dùng grant luôn-đúng, read JWT hay shortcut CLI/shell để thay đường submit. |
| Cần PM trả (theo handoff §4) | (a) Transport thực, đã xác thực: human / workload / session / delegation hiện hành. (b) Revision hiện hành và **authority được giữ xuyên outer COMMIT** (held-COMMIT revoke proof). (c) Status / recovery theo quyền hiện hành. (d) Lineage kết quả hoàn chỉnh gốc và mới nhất; retention; idempotency. (e) Exact native target / profile cells theo operation / mode. (f) Cập nhật các claim TLS cũ bằng evidence mới trong RG03 / RG04 / RG16 / RG17 gốc; không tự coi chứng chỉ cũ còn là blocker. (g) UNKNOWN giữ **cùng key và custody**, không retry bằng key mới, không nói APPLIED là filled. |
| Đường trả | Trong owner-return / packet PM hiện có của request gốc (EPG10-07), và Portal ghi nhận bằng consumer receipt mới trong `evidence/UXM-07/`. Không tạo ledger mới. Return công khai dùng hash và bounded metrics; secret ở file private SGP/HK, chỉ gửi path + hash. |
| NOT_RUN | Không submit thật, không status / recovery thật, không UNKNOWN thật, không one-effect evidence; không chạy relay; chưa có PG / R3 trên byte cuối cho BE-P13 (migration 146 cũng `NOT_RUN`); không kiểm TLS hiện tại; không biết trạng thái RG03 / 04 / 16 / 17 sau snapshot. Không có CONNECTED command nào. |

---

## Packet 2 — TS03: publisher fence và export coverage

| Mục | Nội dung |
| --- | --- |
| Gửi tới | TS native journal / publisher owner (HK). Portal / Edge phối hợp phần source return; Edge chạy lại chính EPG10-03 khi return đủ. |
| Request gốc | Edge EPG10-03 (`CAPTURE_CONTRACT_AND_OWNER_RETURN.md`). `ELP2-REQ-05-001` / `05-002` ở Portal là `OPEN_SOURCE_CONTRACT` (TS / Edge capture owner), xem `ACK_ALL_BACKEND_2026-10-20.md`. |
| Pin nguồn (nguyên văn từ handoff Edge §4) | TS canonical `/home/bobby/trading_system@668e10320c0bf5a9089e33b72f317d8d7c7215c3`; next-upgrade active `/home/bobby/.worktrees/trading-system-next-upgrade@0cd356dab20dc385d9effbda408a0ea53280aa4b`. N03 manifest `contracts/portal-execution-owner/ts-oc-02/n03-source-implementation/owner-implementation.manifest.json`, SHA `f3a496034abbb9fc3e29789d147b8040825015ed700113725717dd460d414872`, trạng thái `OWNER_IMPLEMENTED_SOURCE_DARK_NOT_ACCEPTED`, `owner_accepted:false` tại cut. |
| Portal đã làm (consumer) | Phía Portal **không tiêu thụ TS publisher thật**; mọi thứ liên quan là fixture. (1) Scoped realtime / snapshot đọc có phạm vi: contract và fixture L0 đã có (`execution-scoped-realtime`), `SnapshotPort` chỉ có bản fixture, **không có operation OpenAPI** (`paths = Record<string, never>`), nên chưa có đường thật từ publisher tới Portal. Mức `FIXTURE_VERIFIED`; yêu cầu tương ứng là SRC-A trong `REQUESTS_FOR_SOURCE_OWNERS_2026-10-20.md` (owner Codex ở phía hợp đồng). (2) Portal ghi rõ `ScopedNoticeSource` kiểm chứng, snapshot barrier, binding có tên là phụ thuộc server còn thiếu. (3) Portal không lấy polled fill ACK, copy outbox hay manifest SOURCE_DARK làm journal authority (theo handoff). (4) Watchdog "stream im lặng" và ngưỡng gộp / resync của FE là giả định của FE, chưa có nguồn thật để xác nhận (SRC-A). |
| Portal chưa có / không làm | Không kiểm tra, không sửa, không accept N03; không suy publisher đã chạy từ việc manifest tồn tại; không đo coverage hộ TS. Portal không chốt ngữ nghĩa order / epoch / barrier thay TS. |
| Cần TS owner trả (theo handoff §4) | Native publisher fence; writer / export coverage; committed ordering, source epoch, barrier; ngữ nghĩa delta / correction / retention / recovery theo contract đã chốt; query và installed-runtime proof. Kèm source / image / config pins, endpoint và identity **references** (không giá trị), cửa sổ, acceptance result và limitations. |
| Đường trả | Owner-return của EPG10-03 trong evidence root của Edge (`upgrade/evidence/execution-edge-v1_2/EPG10-03/`) và/hoặc packet TS; Portal đối chiếu bằng consumer receipt mới khi return đủ. Edge chạy lại 03; Portal không tự sửa TS hay mở phase mới. |
| NOT_RUN | Không gọi TS, không chạy publisher, không đọc journal thật, không có runtime proof; Portal chưa tiêu thụ một frame thật nào; N03 `owner_accepted:false` chưa đổi; không biết trạng thái TS sau cut của handoff. |

---

## Packet 3 — target01 / target06: roster, cận số, cửa sổ hữu hạn

| Mục | Nội dung |
| --- | --- |
| Gửi tới | Owner PM / TS / DL / Research của **từng** target (Portal không biết ai giữ từng target; không giả định). Edge đo bằng harness hiện có. |
| Request gốc | Edge EPG10-01 và EPG10-06 (`EPG10-06/RESOURCE_ENVELOPE_AND_HOT_PATH.md`), phase packet theo handoff §5. |
| Pin nguồn (nguyên văn từ handoff Edge §4–§5) | PM pilot nguồn trong `contracts/baseline/portfolio-account-v1_1/`: `pma11-16-finite-pilot-proposal.json` SHA `77a7b9859386cc32d9b0017b0b92ab79db381bcc74556c6d43a1034c1dfefaaa`; `pma11-16-finite-pilot-evidence.json` SHA `57d37691f1b8a350a7033cd8186737ead0eec3694c1529472269b126d53cbcae`; `execution_ready:false`, resource status `PROPOSED_NOT_APPROVED` tại cut; PG 2 CPU / 2 GiB + worker 1 CPU / 512 MiB là đề xuất, **không** là ngân sách production duyệt. PM worktree `feat/portfolio-account-v1_1-parallel@ff2bb673bbd3200367cde9871ad46c6790337e12`. Edge source đã push `bc4b8fe14cf6524411acfc7ffbf08ec4e5175996` (branch `feat/execution-edge-upgrade-v1_2`, repository `BobbyAxerol/awesome-portal`); Edge113test Manager materialization PASS ở `bc4b8fe1` chỉ là isolated correctness. |
| Portal đã làm | **Chỉ** phần Portal được giao: nhắc tới Edge01 explicit-roster observer hiện có (hỗ trợ 10–120 s, dùng lại cho từng arm với cùng instrumentation, theo handoff §5). Portal không thêm adapter, framework, số hay giả định roster. Portal không đặt số ngân sách: hai tài liệu nháp của Claude (`BE-CLAUDE-2026-10-20/ELP2-10_BUDGET_CALIBRATION_PROPOSAL_2026-10-20.md`, `ELP2-10_MEASUREMENT_PROTOCOLS_2026-10-20.md`) đều ghi `PROPOSED_NOT_APPROVED` / `NOT_RUN`, không ràng buộc owner nào, **không** gửi kèm packet này như yêu cầu và không dùng thay phê duyệt. |
| Cần owner trả (theo handoff §5) | (a) Roster target TS–DL–Research / PM chính xác: service / image / config / physical DB / storage refs, headroom. (b) Cận số đã duyệt kèm approval refs; workload / burst / outage / resync; thời lượng / số lần lặp; stop / rollback. (c) Cửa sổ đo **hữu hạn**. (d) Với pilot PM: device / quota / durability / admission của filesystem thật; frozen source / config / image closure; restore và probe độc lập; target có tên. (e) Phạm vi đúng: không suy full coexistence từ kết quả isolated, không coi image test P184 của peer là TS writer thực, không nhét pilot vào B0 / B1 / B2 (6k / 9k canonical TRADE events/s, 600 s, hai lần lặp, 12 cell) và không hạ validator để PASS. Pilot (20 operations/arm, 1 op/s, tracing OFF/ON, restore độc lập, arm 60 s) có thể chuẩn bị trước Core009 và trước TS publication; owner làm phần mình ngay, không đợi Edge. |
| Đường trả | Owner-return của EPG10-01 / EPG10-06 theo phase packet Edge; Edge phân loại measured coexistence hoặc pilot theo đúng phạm vi. Portal chỉ ghi nhận bằng consumer receipt nếu có số liệu liên quan. |
| NOT_RUN | Không đo, không chạy pilot, không mở listener, không áp tải. Không có roster, bound, window hay storage/admission nào được xác nhận. Worker Paper cũ restart / OOM: Portal không chạm, không nâng cap, không coi đã sửa. |

---

## Trạng thái chung

| Packet | Owner được yêu cầu | Phản hồi | Trạng thái |
| --- | --- | --- | --- |
| 1 PM07 | PM / TS authority | Chưa có | `REQUESTS_WRITTEN / NOT_SENT` |
| 2 TS03 | TS native publisher owner | Chưa có | `REQUESTS_WRITTEN / NOT_SENT` |
| 3 target01/06 | PM / TS / DL / Research theo từng target | Chưa có | `REQUESTS_WRITTEN / NOT_SENT` |

Gửi là bước của Claude / lead sau khi Bobby cho phép kênh; viết file không phải là gửi. P0 Core009 đi theo `EDGE_ACK_AND_OWNER_RETURN_2026-10-20.md`, không phụ thuộc ba packet này và ngược lại.
