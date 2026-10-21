# Claude consumer: kế hoạch nghiệm thu kết nối original08 — 21 Oct 2026

Trạng thái: **PLAN ONLY / NOT_CONNECTED / KHÔNG CÓ BẰNG CHỨNG KẾT NỐI**. Claude sở hữu phía CONSUMER (FE + readers); Edge chạy ca kết nối (`EDGE_TO_CORE_08_ACCEPTANCE_HANDOFF_2026-10-21.md` §5, §3 "Next real read tests"). Tài liệu này không áp dụng, không build, không reload gì; không khóa (§10.10b); không docker/PG/test. Nguồn tham chiếu: `CORE009_FIXTURE_ROUTE_DIAGNOSIS_2026-10-21.md` (nginx `^~ /api/v1/execution/` → `portal-fixture-bff:4100`; Core thật riêng tư ở `172.22.0.5:4000`).

## 0. Sự thật consumer hôm nay (đọc trước, đừng suy diễn thêm)

| # | Sự thật | Hệ quả |
| --- | --- | --- |
| F1 | `alphaFleetRealtime` (snapshot barrier + `readFleetSseBlock`) và `scopedStreamMachine/Controller` **chỉ được nối vào slice fixture** (`/execution/slice`, khóa `scoped`, `canonicalLane.ts` "answers from memory", không fetch, không EventSource). Không màn production nào gọi `/manager/fleet/realtime-snapshot` hay `/manager/fleet/stream`. | Ca STREAM của Edge **không có consumer trình duyệt**. Bằng chứng consumer cho STREAM = byte thật Edge/Claude bắt được, chạy qua reader nghiêm ngặt offline (§1.3). Muốn thấy UI thật cho stream phải có transport adapter (EventSource/fetch-stream) = công việc FE riêng, chưa làm, không nằm trong kế hoạch này. |
| F2 | READ qua màn hình có thật: Fleet (`GET /alphas`, dataset `GET /manager/fleet`), Blotter (`GET /screens/blotter`), Workbench (`GET /deployments/:id/...`), Access (`/api/admin/profile-access/v2/self-context`, `/api/admin/access/self`). Lỗi HTTP → `panelStatusForHttp`: 401/403 `denied` ("Withheld"), 404/406/409/5xx `unavailable` ("Unavailable"), 429 `stale` ("Stale"), reason = `CODE: message` từ body lỗi. | Revoke thật hiển thị thế nào phụ thuộc mã HTTP Core chọn: **404 (workspace/grant unavailable) hiển thị "Unavailable", không phải "Withheld"**. Đó là quan sát, không được "sửa" để khớp mong đợi. |
| F3 | Header native `X-Portal-Realtime-State` / `X-Portal-Realtime-Cursor` có reader (`readNativeBaselineHeaders`) nhưng adapter HTTP của màn production chưa chuyển hai header này. | Phải bắt header ở mức response (harness), không dựa vào UI. |
| F4 | Bootstrap vỏ (`/api/auth/context`, registry, links, summary) vẫn do fixture trả: UI ghi "Fixture reviewer" và banner vàng. | Nhãn danh tính trên UI **không** là bằng chứng danh tính; danh tính chỉ chứng bằng `workspace_id`/`scope_fingerprint` trong body Core; `self-context` thật cần bước D §2 (không additive, quyết định riêng). |
| F5 | `get()` của app không đặt `cache: no-store` và không đọc `Cache-Control`. | `no-store` chỉ chứng minh bằng header response bắt ở harness (`page.on('response')`), không bằng code app. |

## 1. Ca của Edge → màn/route/reader consumer → trạng thái UI mong đợi → biên nhận

### 1.1 Bảng map ca

| Ca Edge (§5) | Route/đường | Reader / máy trạng thái | Màn hình thấy được | Mức bằng chứng consumer có thể đạt |
| --- | --- | --- | --- | --- |
| C1 READ positive control | `GET /api/v1/execution/manager/fleet` (dataset FLEET), `GET /alphas`, `GET /screens/blotter`, `GET /deployments/:id/{...}`, `GET /manager/fleet/realtime-snapshot` | `managerDataset`/`readAlphaFleet`/`readProfileEnvelope`; barrier: `readAlphaFleetRealtimeSnapshot` + `pairBaselineWithFleet`; header: `readNativeBaselineHeaders` | Fleet (bảng + dataset drawer), Blotter, Workbench; barrier: không có màn (F1) | UI cho 4 màn; barrier = offline reader |
| (nền) Access / self-context | `/api/admin/profile-access/v2/self-context`, `/api/admin/access/self` | `readAccessSelfContext`, `useSelfContext`, `selfNavigationPort` | Shell, Access | Hôm nay **fixture** (location `=` trong `fixture-bff.conf`); chỉ thành bằng chứng sau quyết định bước D §2 |
| C2 STREAM positive (qualified riêng) | `GET /manager/fleet/stream?environment=&workspace_id=&cursor=` (SSE) | `readFleetSseBlock/readFleetSseEvent` → `readScopedRealtimeFrame`; `scopedStreamMachine` (offline replay) | Không có màn production (F1); slice chỉ fixture | Byte SSE thật qua reader offline + replay vào máy trạng thái trong test (không UI) |
| C3 stream-only revoke, READ không đổi | stream đóng bằng frame `access_revoked`/`unavailable`; READ cùng phiên vẫn 200 | máy: `access_revoked` terminal; READ: reader màn | Fleet/Blotter/Workbench **vẫn hiện dữ liệu**; không có UI stream | READ UI còn nguyên (DOM) + frame terminal offline |
| C4 READ revoke qua cache/cursor/reconnect/SSE | đọc lại cùng route sau revoke; cursor trang cũ; kết nối lại stream | `useFleetRead`/`useFleetDataset`/`useBlotterRead` (+ `scopedEviction`), pager keyset (`next_cursor`), máy stream | Fleet, Blotter, Workbench: panel lỗi đúng mã HTTP (F2) | UI + header + DOM |
| C5 per-frame current authority | mỗi frame SSE được cấp quyền lại ở phía Core | `readScopedRealtimeFrame` (kiểm `terminal` ⇒ không cursor/generation/quality), `checkScopedBinding` | Không có màn (F1) | Chuỗi ordinal frame offline: sau lần đổi quyền, frame kế tiếp phải terminal |
| C6 recovery | cursor hết hạn / nguồn mới / epoch đổi sau recovery | máy: `resync_required` → đọc snapshot → mở lại (budget); pager "Start over" | Fleet dataset drawer (trang cũ → "Start over"); slice chỉ fixture | UI cho cursor trang; stream offline |

### 1.2 Trạng thái UI mong đợi theo kết quả (đối chiếu, không phải kết quả đã quan sát)

| Kết quả Core | Reader/máy | Mong đợi trên UI hoặc trong kết quả reader | Văn bản/DOM cần chụp |
| --- | --- | --- | --- |
| 200 barrier `stream.state=AVAILABLE` | `snapshot.stream.state="available"`, có `cursor`, 4 biên trong ngưỡng schema | (offline) `ok:true`; ordinal là chuỗi thập phân; `source.edge_notice_source=NOT_COMMISSIONED` | kết quả reader + `ordinal`, `lineage_revision` (12 ký tự đầu) |
| 200 `UNAVAILABLE` + `WHOLE_FLEET_AUTHORITY_REQUIRED` | `stream.reason`, cursor phải `null` | baseline đọc được, **không** có cursor; consumer nói "không có stream", không "đang lỗi" | reason code đúng chuỗi; `resume_cursor:null` |
| 200 `UNAVAILABLE` + `STREAM_AUTHORITY_NOT_GRANTED` | như trên | READ vẫn dùng được; tách bạch với `WHOLE_FLEET_AUTHORITY_REQUIRED` (khác cấp quyền) | reason code |
| 200 `UNAVAILABLE` + `STREAM_CAPACITY_REACHED` | như trên | không retry tự động (máy không poll) | reason code; số lần gọi = 1 |
| `PAIRED` | `pairBaselineWithFleet(barrier, fleet.lineage.revision)` bằng nhau tuyệt đối | barrier ghép với fleet cùng scope/head | hai digest (12 ký tự đầu), kết quả `PAIRED` |
| `STALE_BASELINE` | khác nhau (head mới hơn, actor/grant/resource khác) | KHÔNG dùng cursor của barrier cũ; đọc lại cặp (barrier, fleet) | hai digest, kết quả; không "gần đúng" |
| Frame `revalidate` / `heartbeat` | `ok:true`, có `resume_cursor`, cùng generation | heartbeat chỉ đổi cursor, không đổi độ tươi | event_type, thứ tự, hash cursor |
| Frame terminal `access_revoked` (`ACCESS_CHANGED`) | máy → `access_revoked`; không retry; `evictScopedCaches` | dữ liệu scope bị gỡ; câu: "Your access to this scope changed, so nothing read under it is kept. Open My access." (chỉ nơi `scopedEviction` nối) | frame cuối: `terminal:true`, cursor/generation/quality = null, reason; DOM của câu trên nếu có màn mounted |
| Frame terminal `resync_required` (`CURSOR_INVALID_OR_EXPIRED`, `SNAPSHOT_REQUIRED`...) | máy → đọc snapshot rồi mở lại, có trần | chip "Resync required"; câu "The stream position expired." / "A fresh read is needed before updates can resume." | reason, số lần resync |
| Frame terminal `unavailable` | máy → `unavailable`, dữ liệu `not_confirmed` | "Unavailable"; không tự retry | reason |
| Frame bị reader từ chối | máy fail-closed: bỏ stream, đọc lại | `SCHEMA_REFUSED`: "A stream message was refused; re-reading instead." | `drop.reason` + `detail`, **không** chép nguyên body |
| READ 401/403 | `denied` | PanelState "Withheld" + reason `CODE: message` | status, `x-request-id`, DOM reason |
| READ 404 (workspace/grant unavailable) | `unavailable` | "Unavailable" (không "Withheld") | như trên |
| READ 409 (authority/publication đổi giữa lúc đọc) | `unavailable` | "Unavailable"; không tự đọc lại | như trên |
| READ 429 | `stale` | "Stale" | như trên |
| Cursor trang (keyset) hết hạn/đổi scope | pager | dừng, một lối ra: "Start over" (đọc lại từ đầu); không phát lại cursor cũ | cursor băm, DOM nút |
| 503 publication chưa qualified | `unavailable` | "Unavailable"; không suy ra "revoke" | status + code |

### 1.3 Biên nhận consumer phải bắt (không HAR)

Mỗi request một dòng NDJSON do harness ghi từ danh sách trắng; nếu không có trong danh sách thì không ghi:

| Trường | Ghi gì | KHÔNG ghi |
| --- | --- | --- |
| định danh | số thứ tự, thời điểm (UTC ms), case id (C1..C6), route (đường dẫn, không query) | `Cookie`, `Authorization`, CSRF, session id, token, giá trị cursor |
| yêu cầu | method, tham số `environment`/`workspace_id` (định danh, không bí mật), **sha256 + độ dài của `cursor`**, có/không `Last-Event-ID` | giá trị cursor |
| phản hồi | status; `x-request-id`; `Cache-Control` (phải `no-store`); `Content-Type`; `X-Accel-Buffering` (SSE); `X-Portal-Realtime-State`; sha256 của `X-Portal-Realtime-Cursor`; **có/không** `X-Fixture-Overlay` và `X-Real-Route` (§2) | body thô (chỉ băm sha256 + kích thước) |
| body (đã qua reader) | `ok` hay `drop.reason/detail`; `stream.state`, `reason_code`, `scope_fingerprint` (12 ký tự đầu), `lineage_revision` (12 ký tự đầu), `ordinal` (chuỗi), `edge_notice_source`, `qualification` | số liệu tài chính |
| khung SSE | thứ tự khung (0,1,2...), `event_type`, `terminal`, `reason_code`, có/không `resume_cursor` (+ băm), độ trễ so với khung trước (ms), `id:` có/không | `data:` thô |
| DOM | đoạn văn bản hiển thị đúng chữ của phần reason (selector + `innerText`), `role=status` liên quan, ảnh chụp (tên + sha256) | nội dung bảng có số liệu thật |
| nền | số lỗi console / `pageerror` (§3.5), build id (`org.opencontainers.image.revision` của web), cờ build | |

Ghi `NOT_OBSERVED` khi không bắt được; không điền suy luận. Biên nhận nằm ở thư mục riêng ngoài Git; chỉ bản đã làm sạch (băm, mã, ordinal) mới đưa vào evidence.

### 1.4 NOT-evidence (loại tuyệt đối)

| Không tính | Lý do |
| --- | --- |
| Mọi thứ trả qua lane fixture (`portal-fixture-bff`, `X-Fixture-Overlay: on`, banner vàng, `FIXTURE_LAB`, ảnh chụp từ stack này, golden `stub-golden.json`) | Dữ liệu mẫu cùng hình dạng, không phải nguồn thật |
| 8095 mặc định (overlay `^~ /api/v1/execution/` → fixture) | Diagnosis: "HTTP200/237B/no native headers" là fixture, không phải native lease |
| `fixtureBff/routeTable.ts` ca có tên `[partial viewer]`, `[stream not granted]`, `[capacity]`, `[wide ordinal]` | Hợp đồng giả lập của Claude |
| Slice `/execution/slice` (nhãn "Fixture frames, not a real stream") | Máy trạng thái chạy bằng khung đóng gói |
| Từ chối vì phiên **hết hạn** (idle 05:08:51Z / absolute 05:38:51Z, `NOOP_EXPIRED`) | Không phải revoke chủ động (handoff §2.5, §5) |
| 401 vì không gửi cookie/Host sai | Là lỗi harness |
| Probe riêng tư Edge ở `172.22.0.5:4000` không qua nginx | Chứng minh backend riêng, không phải route/browser (diagnosis) |
| Màn hình vẫn hiện "Fixture reviewer" làm bằng chứng danh tính | F4 |
| Đóng stream do hết cửa sổ/cap/`SLOW_CLIENT`/`RECONNECT_LIMIT` coi là revoke | Phải thấy `ACCESS_CHANGED`/`access_revoked` hoặc từ chối cấp quyền thật |
| Một ca đạt coi là đóng FULL08 | Edge cần ma trận ca đầy đủ; consumer chỉ trả phần của mình |

## 2. Thiết kế cutover một route thật mỗi lần (CHƯA ÁP DỤNG, CHƯA BUILD)

Tệp mẫu: `deploy/research-preview/nginx-real-routes.conf.example` (ngoài thư mục được mount nên không thể bị `include` nhầm). Đoạn hướng dẫn: `deploy/research-preview/README-fixture.md`, mục "Cutover một route thật".

Nguyên tắc: giữ nguyên overlay fixture; chỉ thêm **location khớp chính xác (`=`)** cho từng đường dẫn, thắng `^~ /api/v1/execution/` theo luật nginx; không đụng compose, không đụng container `control-api`.

| Bước | Thêm location (mỗi bước một khối, một lần reload) | Dùng cho ca | Điều kiện đi tiếp |
| --- | --- | --- | --- |
| A | `= /api/v1/execution/manager/fleet/realtime-snapshot` | C1 (barrier), C2 (lấy cursor) | Barrier thật qua nginx đọc `ok:true` hoặc drop có lý do |
| B | `= /api/v1/execution/manager/fleet/stream` (SSE, không đệm, đọc có hạn) | C2, C3, C5 | Edge có STREAM qualified riêng + cửa sổ hữu hạn |
| C | `= /api/v1/execution/manager/fleet` (dataset FLEET, để ghép `lineage.revision`) | C1, C4 (`PAIRED/STALE_BASELINE`) | A xong; không ghép được nếu thiếu bước này |
| D | (không additive) `/api/auth/context`, `/api/admin/access/self`, `/api/admin/profile-access/v2/{self-context,effective}` | Access/self-context; danh tính thật | Các đường này đã là location `=` trong `fixture-bff.conf` (tracked): thêm khối trùng làm `nginx -t` hỏng. Chuyển sang Core thật = sửa tệp đó hoặc tắt lane fixture cho các đường này: quyết định riêng (O4). Tới lúc đó Access vẫn là fixture, không phải bằng chứng |
| E | Blotter `= /api/v1/execution/screens/blotter`, Workbench `^~ /api/v1/execution/deployments/` | C1/C4 trên Blotter/Workbench | Từng route, không gộp |

Vận hành (do Operator/Edge thực hiện, không phải Claude):

| Việc | Cách |
| --- | --- |
| Bật | Sao chép khối của bước vào tệp **không theo dõi** `deploy/research-preview/nginx/fixture-bff/real-routes.conf` (thư mục này đã mount `:ro` vào `/etc/nginx/fixture/`, và `portal.conf` đã `include /etc/nginx/fixture/*.conf`) → `nginx -t` trong `portal-web` → `nginx -s reload`. Không `compose up`, không recreate, không đụng `control-api`. |
| Upstream | Biến + `resolver 127.0.0.11` để nginx **không** cần phân giải `control-api` lúc khởi động (stack fixture có thể không có nó). Trỏ `control-api:4000`, `Host $host`, `Cookie` giữ nguyên (nginx chuyển tiếp mặc định), không thêm `Authorization`. Kiểm lại trước reload: tên đó phân giải về container Core đã duyệt (ID/IP `172.22.0.5`/image `9cf5fffa` theo diagnosis); lệch thì dừng. |
| Dấu hiệu | Đáp ứng thật mang `X-Real-Route: core` và **không** có `X-Fixture-Overlay`. Thiếu dấu → coi là fixture. |
| Rollback | Xóa `real-routes.conf` → `nginx -t` → `nginx -s reload`. Đường dẫn quay về fixture ngay. Không có thay đổi dữ liệu để hoàn tác. |
| Giới hạn | Mỗi bước một cửa sổ hữu hạn; stream: `proxy_read_timeout` ngắn (mẫu 90s), `proxy_buffering off`, `gzip off`, `Connection ''`; không tăng cap; mỗi lần mở stream/READ tiêu thụ admission, heartbeat native giữ admission → ca ngắn, đóng kết nối ngay khi xong. |

Điều kiện tiên quyết (đủ **tất cả** mới reload):

| # | Điều kiện | Chủ |
| --- | --- | --- |
| P1 | Codex chấp nhận route (route acceptance) của đúng đường dẫn | Codex |
| P2 | Cửa sổ hữu hạn UTC khớp giữa Core/Edge/Claude, ghi trước; không trượt cửa sổ đã hết hạn | Core+Edge |
| P3 | Cookie phiên **do Core cấp**, hữu hạn, cùng Host nghiên cứu; tham chiếu riêng, không giá trị trong Git/chat | Core |
| P4 | Không tăng cap/quota; không đổi policy/trust | Core |
| P5 | Edge xác nhận ca này cần route (không lặp ca đã PASS) | Edge |
| P6 | Không có container nào của Claude khởi động lại preview `control-api` (retained-review của Codex) | Claude |

**Claude không áp dụng, không build, không reload. Chỉ viết tệp mẫu và mô tả.**

## 3. Pre-flight phía consumer (làm TRƯỚC khi Edge chạy ca)

### 3.1 Cờ build

| Mục | Giá trị mong đợi | Kiểm cách rẻ |
| --- | --- | --- |
| `PORTAL_EXECUTION_V2_SCREENS` | đúng 20 khóa: `fleet,archived,portfolios,alpha,workbench,sandbox,canary,live,request,account,ops,profile,overview,cockpit,shell,compare,blotter,admin,users,replay` | `grep` env preview (không in giá trị khác) + bundle name |
| `command`, `scoped` | **không có** trong danh sách | như trên |
| `VITE_EXECUTION_PREVIEW_ENABLED` | `true` (overlay preview) | grep compose |
| Build id | khớp `org.opencontainers.image.revision` trên image đang chạy (không tin tag; xem ghi nhớ "release tag lags") | so sánh image ID đang chạy với tag; tên bundle với host công khai |

### 3.2 Danh sách khóa V2 và màn dùng

| Khóa | Màn cần cho ca |
| --- | --- |
| `fleet` | C1, C3, C4, C6 |
| `blotter` | C1, C4 |
| `workbench` | C1, C4 |
| `shell`, `admin`, `users`, `account` | vỏ + Access |
| các khóa còn lại | giữ nguyên danh sách, không bàn thêm |

### 3.3 Ghi fixture phải tắt

| Mục | Giá trị |
| --- | --- |
| `FIXTURE_WRITES` | `refuse` (mặc định); `doubles` bị cấm trong cửa sổ kết nối |
| `FIXTURE_VARIANTS`, `FIXTURE_SCALE`, `FIXTURE_NOW_ISO` | để mặc định; ghi lại giá trị vào biên nhận |
| Route khác | mọi thứ không thuộc bước đang bật vẫn đi fixture (banner vàng còn): ghi rõ trong biên nhận |

### 3.4 Cookie phiên (không bao giờ in giá trị)

| Quy tắc | Chi tiết |
| --- | --- |
| Nguồn | tệp riêng quyền 0600 ngoài repo do Core/Edge chỉ định bằng tham chiếu; harness đọc trong tiến trình, nạp vào ngữ cảnh trình duyệt (`addCookies`) |
| Host | cookie host-only → phải gọi đúng Host nghiên cứu (cùng Host Core đã cấp); không dùng `localhost` trừ khi chính Core cấp cho đó |
| Log | không in/echo cookie, header cookie, `Set-Cookie`, CSRF; allow-list ở §1.3; không `--trace on`, không HAR, không video có lộ cookie; `x-request-id` đủ để Core đối chiếu |
| Login | `POST /api/auth/login` bị fixture từ chối (404/405) và Claude không đăng nhập; không có tài khoản mới |
| Hết hạn | ghi `exp` do Core công bố; quá hạn thì dừng ca, không xin gia hạn thay Core |

### 3.5 Ngân sách lỗi console

| Hạng mục | Ngân sách |
| --- | --- |
| `pageerror` / uncaught | 0 |
| `console.error` ngoài "Failed to load resource" | 0 |
| "Failed to load resource" | chỉ cho đúng các request trong ca revoke mà Edge khai trước (status+route+số lượng); thừa/lạ → FAIL |
| Cảnh báo CSP/mixed-content | 0 |
| Đếm | ghi tổng, danh sách đã băm; chạy lại không "xóa" log |

### 3.6 Kiểm rẻ trước cửa sổ (chỉ grep/đọc)

| Kiểm | Kỳ vọng |
| --- | --- |
| Reader còn nghiêm ngặt (`AF-S1..S4`, `UNSUPPORTED_SOURCE` khi `edge_notice_source≠NOT_COMMISSIONED`) | không bị nới kể từ `4ebc4d9e` |
| Máy stream không poll, `access_revoked` terminal | như `scopedStreamMachine.ts` |
| Harness biên nhận dùng allow-list §1.3 | được rà soát trước chạy |

## 4. Khi nhận phản hồi thật đầu tiên từ Core riêng tư

| Bước | Việc Claude làm | Cấm |
| --- | --- | --- |
| 1 | Giữ byte thô ở thư mục riêng (0600, ngoài Git); tính sha256, kích thước | Đưa body thô vào Git/chat |
| 2 | Chạy qua đúng reader hiện có (offline, test conformance mới đọc tệp bắt được; chưa tạo hôm nay) | Chạy qua bản reader đã sửa |
| 3 | So khớp **hình dạng**: tập khóa (`hasOnly/hasAll`), kiểu ordinal (chuỗi), `lineage_revision` dạng `sha256:`, `stream.state` hoa, `resume_cursor` null khi UNAVAILABLE, biên stream trong ngưỡng schema, `source` = (`PORTAL_PUBLICATION_REVISION`, `NOT_COMMISSIONED`, `SOURCE_VERIFIED`), header `Cache-Control`/`X-Portal-Realtime-*` | Coi "gần giống" là đạt |
| 4 | Diff với fixture: bảng khóa-theo-khóa giữa thân thật và thân của `bffDoubleManager` (khác biệt có hai hướng: double thừa/ thiếu) | Sửa fixture cho khớp mà chưa phân loại |
| 5 | Phân loại mỗi sai khác: **P** (Core sản xuất sai so với hợp đồng) → yêu cầu Core kèm `drop.reason/detail`; **C** (hợp đồng/schema thiếu) → Codex; **F** (consumer sai) → Claude sửa nhỏ nhất; **E** (nhiễu môi trường) → ghi, không kết luận | Nới reader, thêm khóa "bỏ qua", đổi regex, tăng ngưỡng để thân thật qua |
| 6 | Reader `ok:true` → sao chép bản đã làm sạch (băm, mã, ordinal, tập khóa) vào evidence làm `real-observed`; **không** thay fixture tổng hợp | Gắn nhãn "connected PASS" khi chưa có Edge xác nhận ca |
| 7 | Báo lại Edge đúng phân loại; ca đạt chỉ nói "consumer đọc được thân/khung này", không nói "ca PASS" | Tuyên bố 09 connected / 10 cutover / 11 acceptance |

## 5. Ba yêu cầu nguồn cho chủ nguồn (consumer thấy được)

| # | Yêu cầu | Chủ | Consumer thấy gì hôm nay → sau khi có | Ghi chú |
| --- | --- | --- | --- | --- |
| R1 | Commission nguồn notice (đưa `edge_notice_source` khỏi `NOT_COMMISSIONED`) | Edge (nguồn notice) qua Core (publication) | Reader hiện **từ chối** (`UNSUPPORTED_SOURCE`) mọi thân khác `NOT_COMMISSIONED` (AF-4); UI chỉ nói "Portal publication revision", không nói "live Edge feed" | Khi hợp đồng đổi giá trị này cần Codex sửa schema + Claude thêm giá trị có kiểu; không nới ngầm |
| R2 | Cấp `stream.subscribe` (STREAM authority) tách bạch với READ | Core (grant); Edge/PM qualify | `STREAM_AUTHORITY_NOT_GRANTED` ↔ `AVAILABLE` + cursor | READ không được suy ra STREAM; ca C2/C3 cần grant riêng, hữu hạn |
| R3 | Gợi ý `revokeSession` liên tiến trình qua DB `LISTEN/NOTIFY` | Core (control-api) | Quan sát độ trễ từ revoke đến khung terminal / 401 ở lần đọc kế; hôm nay phụ thuộc kiểm quyền từng khung/lần đọc | Đây là yêu cầu hiệu năng/độ tức thời, không đổi hợp đồng; Claude chỉ đo độ trễ biên nhận |

## 6. Việc mở

| # | Mục | Chủ |
| --- | --- | --- |
| O1 | Không có transport stream trong FE production (F1): cần quyết định có làm adapter không, hay chỉ nghiệm thu stream bằng reader offline | Bobby/Claude |
| O2 | Test conformance trên byte bắt được (bước 2 §4) chưa viết; chỉ viết khi có byte thật | Claude |
| O3 | Harness biên nhận allow-list chưa viết (không có script trong lượt này) | Claude |
| O4 | Bước D (bootstrap thật) cần quyết định riêng | Claude + Codex |
| O5 | R1..R3 chờ chủ nguồn | Edge/Core |
