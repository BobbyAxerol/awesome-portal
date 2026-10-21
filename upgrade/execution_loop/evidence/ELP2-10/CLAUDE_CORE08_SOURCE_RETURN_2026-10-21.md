# Claude → Core: phần nguồn của "Return bundle" original08, 2026-10-21

Trạng thái: **SOURCE_ONLY / PARTIAL_RETURN / NOT_INSTALLED / NOT_CONNECTED / FULL08_NOT_MET**.
Trả lời `EDGE_TO_CORE_08_ACCEPTANCE_HANDOFF_2026-10-21.md` §3 hàng "Qualified source" (nửa Claude) và phần Claude của các hàng khác. Chủ: Claude (backend + FE source). Cắt đọc: 2026-10-21 11:46 UTC.
Không có secret, không SSH/HK, không runtime, không Docker/PG/test mới, không lock (Rules §10.10b). Chỉ `git`, `sha256sum`, `grep` đọc. Dọn dẹp: `NO_ACTION_NEEDED` (không tài nguyên nào được tạo).
Gói này **không** cài, không phục hồi bản gốc, không dọn dẹp, không cấp session/grant, không khẳng định hook cuối trên SHA đóng băng. Vận hành thuộc Core operator (Codex); xác minh thuộc Edge.

## 0. Đọc nhanh

| Câu hỏi của Core/Edge | Trả lời |
| --- | --- |
| Nguồn nào được xác nhận? | Đỉnh nhánh này `4ebc4d9e8d911354c32eda9473302b95af27b2dd` (`claude/fe-parity`). **Repin về SHA landing đã đóng băng** trước khi dùng làm bằng chứng; tất cả số liệu dưới đây gắn với SHA/log cụ thể ở §1, không gắn với "đỉnh" chung. |
| Có hook cuối trên SHA này không? | **Không.** Hook xanh gần nhất là `a896bd08` trên `9d15755f`; từ đó có 2 hook đỏ (§1.3) và các sửa chưa qua hook. |
| Ảnh đã cài `73435311` / `sha256:9cf5fffa…` có chứa cây này không? | **Không.** Cây này hơn ứng viên 1.432 file (§2). Ảnh tương lai từ cây chung phải có digest riêng, không kế thừa digest của ứng viên. |
| Cần Core trả gì cho Claude? | Hai file BUSY (Codex WIP, chưa commit) — SHA commit đã qua R3 + delta hai file (§2.4). Chưa có thì Claude không đóng băng được nguồn. |

## 1. Qualified source

### 1.1 Pin

| Mục | Giá trị |
| --- | --- |
| Nhánh / đỉnh được ghim | `claude/fe-parity` @ `4ebc4d9e8d911354c32eda9473302b95af27b2dd` (`git rev-parse` trên worktree này, sạch, 2026-10-21 11:46 UTC) |
| Cha chung với ứng viên Core | canonical `7818d5631e0da37563bca5715fd46d40b66ef1de` |
| Ứng viên Core đã ghim | `734353113d8bec85f78b35ab81c9c1a40e93a67e` (`chore/core009-connected-20261021`) |
| SHA landing | **PLACEHOLDER-1: chưa tồn tại.** Điền khi tích hợp viên đóng băng; mọi hàng "đã chạy" dưới đây phải được chạy lại hoặc biện luận tác động trên SHA đó (Landing review §6 bước 4). |
| Build provenance (ảnh, digest) | **PLACEHOLDER-2: không có.** Claude không build ảnh. Ảnh `9cf5fffa…` là ảnh cũ đang chạy, không phải ảnh của cây này. |

### 1.2 Bằng chứng theo cổng (đã tồn tại)

Log nằm ngoài Git, trong `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/` (`SP/` bên dưới). Chỉ ghi đường dẫn + SHA256; không chép nội dung.

| Cổng | Cây / SHA | Kết quả thật | Log (`SP/`) | SHA256 |
| --- | --- | --- | --- | --- |
| Hook R2 đầy đủ (tiền đề) | commit `30207702` trên `105775f0` | exit 0. Contracts 89 file/1.504 PASS; control-api 463 file PASS, 2 file skip / 9.232 PASS, 3 skip; route ledger 316; restore drill + 4 digest scoped-access PASS | `hook-r2g.plain` | `8c0940b8ed2d7e40d7acaef86c57c50fdb2e9440e53187d7d59f7e849dae6af4` |
| **Hook R2 đầy đủ, xanh gần nhất** | commit `a896bd08` trên nguồn `9d15755f` (BE-P15/16/17, parent Paper Exit, RV-06/10/11/13/14, registry rev 8) | exit 0. Contracts 90 file/1.577 PASS; control-api 472 file PASS, 2 file skip / **9.445 PASS**, 3 skip (2.445,71 s); route ledger 319, 0 collision; N17A…N29, EDS-12, R3-2, tracking reconciliation PASS; restore drill + 4 digest PASS | `hook-r2h.plain` (thô: `hook-r2h.log` `97d87e003c51733725962591c0158535f1b366db6113fbdc45dcc8ef1e23c991`) | `acdbbf30468a9c7ad311551a6dc1536d5c3d442b5cb8809d18da18b4cec8232b` |
| Hook R2, lần i (**ĐỎ**) | cây ≈ `799effc8`/`7378d423` (Codex ghim lỗi tại `7378d423`, docs-only so với `799effc8`) | exit 1. Contracts 90/1.577 PASS; control-api 3 FAIL / 9.530 PASS / 3 skip (3.211,97 s) | `hook-r2i.plain` (thô: `hook-r2i.log` `0195449503d1a6ae5875c29af3ae7e81ab9413d03892e43ab750c08e3e064d8e`) | `d51b308a16c9aa4999ca97994370ead1bfedcbc10505b0ad71e81971125b5630` |
| Hook R2, lần j (**ĐỎ**) | cây `90f84643` (hook chạy 10:03–10:57 UTC theo log; hook đỏ nên không có commit hook) | exit 1. Contracts 90/1.577 PASS; control-api **5 FAIL** / 9.599 PASS / 7 skip, 2 file FAIL (2.892,39 s); route ledger 319 PASS | `hook-r2j.plain` (thô: `hook-r2j.log` `e5a333127f817aab0a0b9a7c61ca35fea8a3c3af640293166b28b0e3fd45602a`) | `a61baf27bb202fa29ce697c6c879c8a01d1510288bb3bd69b4e4e13b91062873` |
| PG tập trung trên chuỗi hiện tại | cây làm việc bắt đầu 11:11:10 UTC, 3 phút 38 giây sau commit `4ebc4d9e` (11:07:32) | **10 file / 380 test PASS** (98,92 s). Chạy runner `scripts/control-api-test.sh`; restore drill + 4 digest scoped-access in dòng PASS của runner. Gồm: access-transaction 155, operational-current 77 (có ca index M1), manager-series-pg 21, manager-lists 13, manager-dataset-invariants 52, original-score-custody 31, stream-revocation-hints.pg 6, query-total-deadline 9, series-repair 10, fleet-stage-counts 6 | `pg-target.log` | `09b48ecdf602d2d3c50ff4bd86c52538b3972f8b279180c778dd2c431c6017c4` |
| Frontend vitest | `src/execution` + `src/app`, đỉnh trước hook j | **378 file / 80.924 test** (số do lane Claude báo) | **PLACEHOLDER-3: không tìm thấy log tương ứng trong scratchpad** | — |
| V2 visual (pinned image) | `54ebc7ac` (re-record `v2-access-390`) | spec V2 **61 ô**, ghi baseline rồi so sánh **hai lần liên tiếp xanh** (61/61, 61/61), lane FIXTURE_LAB/BFF_DOUBLE | `evidence/UXM-07/v2-baselines-2026-10-21/README.md` (trong Git); biên nhận hai lần chạy cả suite: `evidence/UXM-07/visual-suite-runs-2026-10-21.md` | log ảnh không commit |

Ghi chú đọc: số đếm là của runner tại thời điểm đó, không cộng dồn giữa các hàng. PG tập trung 380 **không** thay hook; nó chỉ phủ 10 file, nhưng là 10 file chứa đúng các đường đã đổi sau `a896bd08` (CR-02/148, B1 deadline, display-safety walker, revocation hint, index 149). `pg-target.log` không in `exit=`; dòng PASS cuối là dòng của runner khi thành công.

### 1.3 Hai lần đỏ, nguyên nhân thật và sửa

| Lần | Ca đỏ | Nguyên nhân (đã định vị) | Sửa | Chứng minh sau sửa |
| --- | --- | --- | --- | --- |
| j `90f84643` | `be-p18-stream-revocation-hints.pg.spec.ts:109` (1 ca) | Tên người dùng fixture `p18-password` đưa vào helper mật khẩu và trúng blocklist thật. **Lỗi fixture, chính sách giữ nguyên.** | `64244222`: chỉ đổi actor fixture sang mật khẩu hợp lệ | `pg-target.log`: file đó 6/6 PASS |
| j `90f84643` | `elp206-original-score-custody.spec.ts:147–160` (4 ca) | `text` dùng chung của tài liệu nguồn bị siết cho an toàn hiển thị UI; custody gốc phải giữ nguyên byte nguồn. **Lỗi sản phẩm** (đặt sai tầng). | `64244222`: kiểm an toàn hiển thị nằm trên schema **RESPONSE** của dataset (`manager-model.contract.ts`, `manager-dataset-invariants.ts`), không trên tài liệu dùng chung | `pg-target.log`: custody 31/31 PASS |
| (Codex review) | walker `manager-dataset-invariants.ts:103` | Hết ngân sách độ sâu/node bị bỏ qua êm: phần chưa duyệt được chấp nhận | `4ebc4d9e`: thêm validation issue khi cạn ngân sách, giữ dừng sớm sau issue đã có; thêm 1 ca cutoff thuần | `pg-target.log`: dataset-invariants 52/52 PASS |
| i (≈`7378d423`) | `elp207-pending-control-transaction` (quá 30.000 ms), `elp210-native-frame-coupled` ("current identity operation is not available"), `profile-projection` (804 không > 1.000) | **Chưa đo được nguyên nhân.** Codex (07:07 UTC) yêu cầu 3 sửa chẩn đoán test (đồng hồ fixture, chẩn đoán từng scope, rendezvous) và không cho gọi là nhiễu tải. | **Chưa sửa:** không có commit nào chạm 3 file test đó sau `7f45f663` (2026-10-20 04:04 UTC). Ở lần j cả 3 PASS trên file test không đổi — đó **không** phải bằng chứng nguyên nhân. | Còn nợ; CHANGE_TEST_DIAGNOSTICS vẫn mở. Cổng nhỏ nhất: 3 file đó + hook cuối |

Codex CR02/B1 return (`CODEX_CR02_B1_REVIEW_RETURN_2026-10-21.md`) và các sửa đáp ứng: CR02 `75c3d7e6` (ACCEPT thiết kế nguồn, cần PG chuỗi hiện tại → `be-p16-manager-series-pg` 21 + `series-repair` 10 PASS ở trên); B1 total deadline kiểm lại sau vòng arming + trước COMMIT (`4ebc4d9e`, `be-p18-query-total-deadline` 9/9 gồm ca "late final reader" và "arming round trip"); evidence B1 quan sát gốc khôi phục (`last:148…, n:142`) kèm ghi chú đổi tên sang 149 (`BE-P18-b1-explain.md` dòng cuối). **Chờ Codex ACK** các sửa này; chưa có.

### 1.4 CHƯA được chứng minh (không dùng làm bằng chứng)

| # | Chưa có | Hệ quả |
| --- | --- | --- |
| N1 | **Hook cuối trên SHA đóng băng.** Từ `a896bd08` chỉ có 2 hook đỏ + PG tập trung xanh. `64244222`/`4ebc4d9e` chạm `manager-model.contract.ts`, `manager-dataset-invariants.ts`, `query/postgres.ts`; N29/EDS-12 pin lại và contracts-snapshot **chưa** chạy lại sau hai commit này. | Không ai được gọi cây này "R2/R3 xanh". |
| N2 | Playwright **host** `chromium-v2`: 329 ca chọn, **262 PASS / 6 FAIL / 61 skip** (17,1 phút). 6 ca: `coexistence` budget account-360, coexistence compare + workbench (V1 vs V2 cờ tắt/bật), drawer new-request Esc, `links` hai tầng, `s1` New request "duplicate". **Đang triage, chưa có nguyên nhân.** Chạy trên host, không phải ảnh pinned. | Không dùng làm PASS hay FAIL kết luận; không thay 61/61 ở bảng trên. Log `pw-v2-host.log` SHA256 `020a05a08caf96270e6c416baaf168e2a33d1cacc5e92e3129f8be6cb7ee990e` |
| N3 | Không cài, không kết nối: 0/14 `CONNECTED_VERIFIED`, 0 `INSTALLED`, 0 `OWNER_ACCEPTED`. | Mọi "PASS" ở §1.2 là SOURCE/FIXTURE/PG tổng hợp. |
| N4 | Tái chạy trên Node22 pin cho 3 chẩn đoán Node20 của Codex (CR-03 42/42, CR-04 123/123) nằm ở hook cuối. | Chỉ tính một lần, không nhân đôi. |
| N5 | Một assertion PG của CR-01 trong `elp2-read-scope.spec.ts` (BE-P17 §9.1: NOT_RUN ở thời điểm đó). `pg-target.log` không có file này. | Còn NOT_RUN cho tới khi có log. |
| N6 | Số liệu tài chính, NET_PNL shared-account, subject Alpha/Deployment: **chưa qualified / không mở** (Bobby 2026-10-21). | Không có xuất bản tài chính thật. |

## 2. Kế toán diff theo đích cài

Mỗi so sánh là endpoint cây, đếm một lần; các phạm vi chồng nhau **không cộng**.

### 2.1 Cây này so với ứng viên `73435311`

`git diff 73435311 4ebc4d9e`: **1.432 file, +285.100/−7.181** (gồm FE, contracts, `upgrade/`, ảnh, ledger). Phần ảnh hưởng ảnh control-api: `apps/control-api` **177 file, +17.345/−304** (5 migration, `src/` mới + sửa, `test/`); `deploy/images/control-api.Dockerfile` +14/−3; `scripts/control-api-image-permissions-test.sh` (mới, 178 dòng); phần còn lại thuộc FE/contracts/docs/preview và **không** nằm trong ảnh control-api: `apps/portal` 693 file +118.238/−2.947; `packages` 168 file +70.696/−3.817; `upgrade` 354 file +75.599/−86.

### 2.2 KHÔNG có trong ứng viên `73435311` (không có trong ảnh đã cài)

| Nhóm | Nội dung | Nguồn / dấu vết |
| --- | --- | --- |
| Migration 145–149 | 5 file `.sql` cộng thêm (SHA256 ở §3) | `apps/control-api/migrations/` |
| BE-P15 | `record-detail.ts` + parser giờ ISO có vùng giờ (CR-04 `63201e94`), specs `be-p15-record-detail*` | |
| BE-P16 | writer series NAV/NET_PNL: `manager-series-*.ts`, repair budget (CR-02 `75c3d7e6`), materializer (CR-03 `ec228e53`), controller đọc `GET /api/v1/execution/manager/series`. **Slot `series` không ai đặt** (`grep "new ManagerSeriesRuntime(" src` = 0): writer tối. | `manager-series*.ts` |
| BE-P17 | Fleet realtime: `GET /api/v1/execution/manager/fleet/realtime-snapshot` và `/stream` (mounted trong `app.module.ts`); pairing CR-01 `dd9609af` | `alpha-fleet-realtime*.ts` |
| BE-P18 | gợi ý thu hồi stream `auth/stream-revocation-hints.ts` (`966fc18a`, chạm `auth.service.ts` +11, `admin.service.ts`, `account-lifecycle.service.ts`); total deadline + semi-join B1 (`343f5bbb`, `4ebc4d9e`, `postgres.ts`) | |
| BE-P13 | F0 apply attempts (DENIED-only), migration 146 | |
| Khác | B1 incident-link/status-facets, B2 build arg portal-web, self-eligibility/self-context/step-up, stage facts/scoped stage, paper-exit parent, harness `scripts/measure/*`, fixture-BFF preview | |
| Quyền ảnh | `deploy/images/control-api.Dockerfile` (SQL/migrations/package.json root:root 0644/0755, `native-schema` 0755; COPY bí mật `bootstrap-users.yaml` giữ nguyên). **`66b501f2` ≡ `6da309df`** (cùng blob Dockerfile `460b0e36…` và script `ddeee778…`; `66b501f2` là hash trước rebase). SHA256 Dockerfile: ứng viên `2c44fbad6b92f41b49e9357ca4c5c8357371ba7400df4674141c6ef6f86a295c` → cây này `37d1542e54ded1d1ea9ea528fa7c780f2b4d734445937cb2d9566f24a661f67b`. Sửa này thuộc ảnh **tương lai**, không phải ảnh `9cf5fffa` đang chạy. | Codex ACCEPT source (producer review) |
| Preview/overlay | `deploy/nginx/portal.conf` (+include `/etc/nginx/fixture/*.conf`, glob rỗng = không đổi), `fixture-bff.Dockerfile`, compose fixture | Lane portal-web/preview, không thuộc ảnh control-api |

### 2.3 Byte-identical với ứng viên

| Phạm vi | Kết quả (đo ở `4ebc4d9e`) |
| --- | --- |
| 40 đường ứng viên đổi so với canonical | **35 giống từng byte** (blob), **5 khác** |
| 5 đường khác | `auth.service.ts` +11/−0; `access.service.ts` +76/−21; `research-acceptance-session.ts` +4/−0; `be-p10-acceptance-session.spec.ts` +2/−1; `be-p10-manager-revoke.spec.ts` +44/−0 |
| Diagnostic carry `38b312c6` (≡ `1328d1b7`) | **Không phải delta.** `execution-native-install.ts` (blob `5659a939`), `native-install-error.ts` (`18af1002`), `elp210-core009-install-error.spec.ts` (`799903e4`) và `CORE009_INTEGRATION_RETURN_2026-10-21.md` (`c6ce01f8`) giống từng byte ứng viên; đây là nội dung của chính ứng viên được nhận về nhánh này. |
| BUSY (2 file Codex đang sửa) | `native-business-read-client.ts` (blob `d545cf1e`, SHA256 `67a6949c61f894e8a9d9d81edd26e5be8482e236dd58533c011b3db480f5259d`) và `elp210-native-business-read-client.spec.ts` (SHA256 `e04b608268edfa9bc154346323ff699b086d1c19d34b1bade77d72c6691aaac0`): **giống ứng viên, chưa có bản sửa BUSY**. |

Điều chỉnh so với Landing review §8 (lúc `ec228e53` chỉ "2 đường khác"): sau **BE-P18 `966fc18a`** có **5** đường khác ở các file AuthService/acceptance-session/revoke-spec. Đó là phần Claude cộng thêm (hint thu hồi, không throw, gọi sau commit), chưa có ACCEPT của producer review riêng cho riêng BE-P18; CLI `execution-native-revoke` là process riêng nên hint là no-op trong CLI (BE-P17 §10).

### 2.4 Carry còn nợ từ Core

| Mục | Đường | Trạng thái | Chủ |
| --- | --- | --- | --- |
| BUSY fix (giữ slot tới `close` thật; status → cancel cùng attempt) | `apps/control-api/src/execution-v2/native-business-read-client.ts`, `apps/control-api/test/elp210-native-business-read-client.spec.ts` | **WIP Codex, chưa commit.** `CORE009_C1_C7_RETURN` ghi: staged +43/−3, diff nhị phân `1e0095b6bc0eee3d7c8848ce2baed778e847dc023865145f4e3898989b648a89`; client `65d3d8ff1585e6e1d6bdb11528a307bd0d23f6fa3044f1edc8367ef18ee3a15f`; test `054abcaad9e6f3ddd8e7db7a465875afc1354d4952e0d5dd205c0339b7465425`; 379/379 tập trung PASS (log `…/core009-integration/recovery-six-file-focused.log` SHA256 `5e065fc3bad834ad79bdf8533af7727e7a023b24dedb2daa390e4207d0e44a62`). **Chưa có SHA commit** (PLACEHOLDER-4). | Codex |
| Cách nhận | `git show <sha>:<path>` đúng 2 đường (HANDOFF §11), kèm test `elp210-native-business-read-client`; không cherry-pick cả commit, không đụng `access.service.ts` / `be-p10-acceptance-session.spec.ts` của Claude. | Claude, **chỉ sau** khi Codex trả SHA đã qua R3 |
| Không còn nợ | diagnostic mapper (đã vào, §2.3); biên nhận ứng viên | — |

**Cây này không phải ảnh đã cài và không được thừa hưởng digest của nó.** Digest `sha256:9cf5fffa…`, Compose config `423573a8…`, ứng viên `73435311` chỉ mô tả ảnh đã chạy / ứng viên nhỏ hơn. Mọi biên nhận "installed" của cây chung phải có image ID riêng, build riêng, readback riêng.

## 3. Rollback và đánh số migration

Migration chạy bằng one-shot `migrate:up` (`node dist/cli/migrate.js`), **không** do API tự chạy khi khởi động (Dockerfile). Chỉ cộng, không đổi cột/ràng buộc/view/writer hiện có. Không có Down nào chạy tự động trong sản xuất.

| # | Tệp | SHA256 (`.sql`) | Thay đổi | Down Migration (tham chiếu rollback) | Dữ liệu giữ lại |
| --- | --- | --- | --- | --- | --- |
| 144 | `…144_execution-pending-recall-control.sql` | `6021729cc8ab9ea87c293256fa1d22f0c4567f1e0abb6e11418784895432a7e1` | (đối chứng) giống ở canonical, ứng viên, cây này | — | — |
| 145 | `…145_execution-incident-links-operation-lookup-index.sql` | `57a0e087bdee387f6d5deea0944b8752d0927f70aa3e9ff46864be553b406f06` | 1 index `execution_incident_operation_links_operation_idx` | `DROP INDEX IF EXISTS execution_incident_operation_links_operation_idx;` | Toàn bộ dữ liệu bảng; chỉ mất index (đọc chậm lại, không sai) |
| 146 | `…146_execution-f0-apply-attempts.sql` | `6d83cad1f2201260c698993c91088bf7ceca3291e81bf11f1344e7b373eb8454` | bảng append-only `execution_f0_apply_attempts` + trigger/hàm; chỉ DENIED, `source_request_sent=false` | `DROP TRIGGER … ; DROP FUNCTION reject_execution_f0_apply_attempt_mutation(); DROP TABLE execution_f0_apply_attempts;` | **Down xoá các dòng attempt** (không phải dữ liệu kinh doanh: câu trả lời DENIED có thể tái tạo). Sao lưu trước nếu muốn giữ replay theo key. |
| 147 | `…147_execution-manager-series-observations.sql` | `2093aed3c6e9aa4463d0bd130ca4883b5097a777df08c0709a98d6d471ff8454` | 3 bảng series (revisions, observations, checkpoints) + trigger append-only | **No-op có chủ ý.** Rollback = không đặt slot `series` (đã mặc định không đặt); giữ bảng (custody dẫn xuất của revision đã giữ; DROP sẽ rút ngắn im lặng mọi cửa sổ) | Giữ toàn bộ |
| 148 | `…148_execution-manager-series-repair-attempts.sql` | `f4b37ce7832a174f6e1e1f8a702b586dbdbcbe83ac5005d8417933816148f0d5` | cột `repair_attempts jsonb NOT NULL DEFAULT '[]'` (CHECK ≤16) trên `execution_manager_series_checkpoints` | **No-op có chủ ý.** Giữ cột; bỏ qua nó (hoàn mã) trả hành vi một-chẩn-đoán cũ | Giữ toàn bộ |
| 149 | `…149_execution-operation-queue-scope-lookup-index.sql` | `f306ecc973f2ea878c70bc26c000f888801c39d88274589562c3ca96b22d3c7b` | 1 index biểu thức `execution_operation_queue_scope_idx` (khóa copy từ view migration 141) | `DROP INDEX IF EXISTS execution_operation_queue_scope_idx;` | Toàn bộ dữ liệu; chỉ mất index (truy vấn scope hẹp quay lại quét bảng ≈1 s/yêu cầu ở 1M dòng) |

Ghi chú số: **148** thuộc ngân sách sửa series (CR-02); **149** là index scope B1. Gốc ban đầu là `148_execution-operation-queue-scope-lookup-index`; đổi tên sang 149 ở `90f84643` khi gộp, **nội dung không đổi** (SHA256 trước/sau `f306ecc9…`, Codex xác nhận byte-identical). Các số đo và `BE-P18-b1-explain.plans.json` được quan sát dưới tên 148 trên chuỗi 142 migration và được giữ nguyên, kèm ghi chú đổi tên (`BE-P18-b1-explain.md`); không đo lại 1M dòng chỉ vì số. Mọi sửa sau này là migration cộng thêm mới, không sửa SHA256 trên.

| Thay đổi cộng thêm khác | Rollback |
| --- | --- |
| Mã control-api (BE-P13/15/16/17/18, B1) | Revert theo từng commit (danh sách trong `git log 7818d563..4ebc4d9e`); hoặc không dùng ảnh mới — ảnh cũ `9cf5fffa…` vẫn là điểm quay lại (Core giữ tham chiếu ảnh/Compose) |
| Quyền ảnh `6da309df` | Revert một commit; ảnh `9cf5fffa` không bị ảnh hưởng (không đổi) |
| Route mới (`manager/series`, `fleet/realtime-snapshot`, `fleet/stream`) | Chỉ đọc, không ghi trạng thái; gỡ bằng quay lại ảnh cũ. Không cờ để tắt riêng |
| FE V2 | Cờ build `EXECUTION_V2_SCREENS` rỗng = mọi màn V1 (B2); `evidence/UXM-07/rollback.md` |

## 4. Điều kiện Claude cần từ Core/Edge lúc cài (Core có thể tự kiểm)

Áp dụng cho **ảnh cây chung tương lai**, không cho việc cài ứng viên `73435311` đang chờ (ứng viên không chứa gì ở §2.2; schema của nó dừng ở 144). Mỗi dòng là một kiểm đọc/tĩnh; Claude chưa chạy dòng nào trên runtime.

| # | Kiểm | Kỳ vọng | Nếu lệch |
| --- | --- | --- | --- |
| C1 | Ảnh build từ SHA landing đã đóng băng; `org.opencontainers.image.revision` của ảnh = SHA đó | Digest mới; không dùng lại `9cf5fffa…` hay digest ứng viên | Dừng; không cài |
| C2 | `sha256sum` 5 file `.sql` 145–149 trong ảnh = bảng §3 | Khớp | Dừng; lệch SHA256 = có sửa lịch sử |
| C3 | `pgmigrations` của đích: cuối ≤144 trước, chỉ 145→149 theo thứ tự sau; **không** có hàng tên cũ `1723680000148_execution-operation-queue-scope-lookup-index` | Không có tên cũ | Có: dừng, lệch tên với tệp; xử lý theo quy trình migration của Core, không sửa SHA256 |
| C4 | 145 và 149 là `CREATE INDEX` thường (khóa SHARE chặn ghi bảng link / `execution_operation_queue_items` lúc build) | Core chọn cửa sổ; có thể tạo trước đúng định nghĩa bằng `CONCURRENTLY` (`IF NOT EXISTS` biến migration thành no-op) | Bảng lớn: dùng đường tạo trước |
| C5 | Migrations chạy bằng one-shot riêng; API không tự migrate | Xác nhận Compose có job riêng | — |
| C6 | **Không đổi cờ runtime / biến môi trường.** Khác biệt Compose/env của ảnh cây chung so với ảnh đang chạy = rỗng; Claude `grep process.env` trong các tệp BE-P16/P17 mới = 0 | Rỗng | Có biến mới: trả Claude |
| C7 | Slot `series` không được lắp: không có `new ManagerSeriesRuntime(` trong `src` (grep) và 3 bảng `execution_manager_series_*` đếm 0 dòng sau cài | 0 dòng; writer tối | Có dòng: dừng, ai đó lắp slot ngoài phạm vi |
| C8 | Fleet **stream** tối: một lần đọc `GET /api/v1/execution/manager/fleet/realtime-snapshot` bằng người xem ROOT hợp lệ → `stream = UNAVAILABLE / STREAM_AUTHORITY_NOT_GRANTED`; người xem một phần → `WHOLE_FLEET_AUTHORITY_REQUIRED`. Grant `stream.subscribe` ở **ROOT** của Fleet chưa được cấp (grant Plan B của Core009 là grant Manager-domain native, khác ROOT) | Chưa `AVAILABLE` | `AVAILABLE`: dừng, **không** tính là PASS; báo Claude (câu hỏi ngữ nghĩa nguồn) |
| C9 | `edge_notice_source` của baseline = `NOT_COMMISSIONED` (literal trong schema); mọi `quality` còn `PARTIAL/UNKNOWN/PROVISIONAL`, `source_as_of_ms:null` | Đúng như vậy | Khác: dừng |
| C10 | Ảnh `9cf5fffa…`, Compose `423573a8…`, container hiện chạy **không bị đụng** bởi việc chuẩn bị cây chung | Không đổi | — |
| C11 | Với cài ứng viên `73435311`: schema đích cuối 144; không áp 145–149 chỉ vì cây Claude có chúng | Không áp | — |
| C12 | `revokeSession` hint: CLI `execution-native-revoke` / `revokeAcceptanceSession` là process riêng nên hint là no-op; process server đang chạy dựa vào fence mỗi poll (≤5 s) | Core không coi hint là bằng chứng thu hồi | Xem Edge §5 "active revoke ≠ NOOP_EXPIRED" |

## 5. Claude KHÔNG trả / KHÔNG làm

Tham chiếu handoff §2 mục 1–5 và §3.

| Mục | Việc | Chủ | Claude |
| --- | --- | --- | --- |
| §2.1 | R3 thường đã đóng băng, commit nguồn mạch lạc, build ảnh có điều kiện; terminal counts/exit/log hash; dọn dẹp | PM operator (R3 thường) | Chỉ báo bằng chứng của **Claude** ở §1; không chạy hook trùng, không build ảnh. Hook cuối trên SHA đóng băng: Claude chạy khi tích hợp viên báo đóng băng (Landing review §6.4) — chưa làm. |
| §2.2 | Cài trên đích Research cô lập; ACK client-pause/quiescence; kế hoạch swap root 0600; sao lưu hậu-quiescence; fence mọi namespace dispatch lịch sử | Core operator (Codex) | Không cài, không tạo/bịa `.closed`/pause receipt, không đụng stable/dev/provider 28445 |
| §2.3 | READY trả cho Edge: container/image/start/restart, pin config/schema/helper, rollback, cửa sổ recovery-only khớp | Core operator + Edge (khớp ACK) | Chỉ cung cấp tham chiếu rollback nguồn (§3). Không đề xuất/trượt cửa sổ, không tuyên bố READY |
| §2.4 | Phục hồi chính thức same-artifact/same-idempotency với Base/binding gốc; terminal nguồn có xác thực + ACK Core bền; exit 75/UNKNOWN giữ custody | Core operator (Codex) + Edge xác minh | Không thử lại, không khoá mới, không SQL tay, không forge terminal. Mã lease `785387ba…`/attempt `07becd72…` chỉ là locator, không dùng |
| §2.5 | Dọn dẹp chung STREAM → READ → phiên tạm; drain handler/pool; process exit; disposition grant/session; đĩa trước/sau | Core operator + Edge | Không có tài nguyên runtime do Claude tạo cần dọn (`NO_ACTION_NEEDED`) |
| §3 "Operator window" | Cửa sổ UTC rõ ràng + ACK khớp Core/Edge | Core operator + Edge | Không |
| §3 "Next real read tests" | User/workspace/profile Research thật, READ + STREAM tách biệt, tham chiếu phiên riêng tư, route/cursor, coordinated revoke | Core operator (cấp), Edge (chạy runner) | Không cấp session/grant, không giữ token; consumer FE chỉ đọc qua cổng đã duyệt. Fleet stream cần grant ROOT riêng (§4 C8) |
| §4 | PKI Manager all-mode (leaf/chain, pin tin cậy, đối chiếu TLS/JWKS ba Edge) | Core operator + chủ PKI | Không; không tái tạo/dùng lại khóa |
| Hook/gate | PASS "installed", "connected", "financial published" | — | Không khẳng định (N3, N6) |

## 6. Bản nháp 3 dòng cho mục Unified/sync (Core integrator dán; Claude không sửa các file đó)

```text
ELP2-10 · Claude Core08 source return (SOURCE_ONLY, chưa cài/chưa nối): claude/fe-parity@4ebc4d9e8d911354c32eda9473302b95af27b2dd — repin về SHA landing đã đóng băng; cây này hơn ứng viên 73435311 1.432 file và KHÔNG thừa hưởng digest ảnh 9cf5fffa/73435311; migration cộng thêm 145–149 (SHA256 trong packet).
Gate: hook a896bd08@9d15755f xanh (472 file/9.445 PASS); hook đỏ i (3 ca) và j@90f84643 (5 ca, 2 nguyên nhân: fixture mật khẩu + custody/display-safety, sửa ở 64244222/4ebc4d9e); PG tập trung 380/380; V2 61 ô 2 lần so sánh xanh; CHƯA có hook cuối trên SHA đóng băng, Playwright host 262/6/61 đang triage, nợ chẩn đoán 3 test lần i, BUSY carry chờ SHA commit từ Codex.
Link: upgrade/execution_loop/evidence/ELP2-10/CLAUDE_CORE08_SOURCE_RETURN_2026-10-21.md — Core operator giữ cài đặt/phục hồi/dọn dẹp; Edge tự xác minh từng ca; ELP2-10 vẫn NOT_MET.
```

## 7. Chỗ trống còn mở

| Mã | Còn thiếu | Ai điền |
| --- | --- | --- |
| PLACEHOLDER-1 | SHA landing đóng băng + kết quả hook cuối (exit, số đếm, SHA256 log) | Tích hợp viên (đóng băng) → Claude chạy/ghi |
| PLACEHOLDER-2 | Image ID/digest, build provenance của ảnh cây chung | PM/Core operator |
| PLACEHOLDER-3 | Log + SHA256 của FE 378 file/80.924 test (không tìm thấy trong scratchpad) | Claude (chạy lại hoặc chỉ log) |
| PLACEHOLDER-4 | SHA commit BUSY (2 file) đã qua R3 từ Codex | Codex |
| P-5 | Nguyên nhân 6 ca Playwright host; chẩn đoán test của 3 ca lần i | Claude |
| P-6 | Codex ACK/CHANGE cho `64244222`, `4ebc4d9e`, CR-02 PG; producer review riêng cho BE-P18 | Codex |

## 8. Nguồn đọc cho gói này

Handoff Edge→Core §§1–5; `CODEX_LANDING_REVIEW` §§1–11; `CODEX_CLAUDE_PRODUCER_REVIEW`; `CODEX_CR02_B1_REVIEW_RETURN`; `CORE009_C1_C7_RETURN`; `HOOK_RESULT_2026-10-20.md`; `HANDOFF_TO_CODEX.md` §§10–11; BE-P10/P16/P17/P18-b1; `F1_F9_CLOSURE`; `BOBBY_DECISIONS`; `UXM-07/v2-baselines-2026-10-21/README.md`, `visual-suite-runs-2026-10-21.md`; 5 file migration; Dockerfile; `app.module.ts`; log trong `SP/`. Lệnh đã chạy: `git rev-parse/diff/show/log/merge-base/cat-file`, `sha256sum`, `grep`. Không test, không Docker, không PG, không lock. BE-P9/BE-P11 không có file receipt riêng trong cây này (chỉ nằm trong HANDOFF §6/§10 và BE-P10); thuộc ứng viên `73435311`, không thuộc delta §2.2.
