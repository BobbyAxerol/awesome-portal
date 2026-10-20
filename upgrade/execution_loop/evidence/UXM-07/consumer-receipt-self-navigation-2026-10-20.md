# UXM-07 — Consumer receipt: self-navigation hook, shell merge, self-only "My access" (FE-037/038/057/058), 2026-10-20

Người viết: Claude (FE writer F9). Tiếp nối [consumer-receipt-self-access-2026-10-20](consumer-receipt-self-access-2026-10-20.md) §7 ("Còn lại" 1, 2): W1 hook, W3 gộp token vào shell, bề mặt "My access" chỉ-của-mình, tên `execution.accounts.manage`. Đây là ghi nhận của consumer, **không phải ACK của Bobby** (§10.3). `FRONTEND_BACKEND_SYNC.md` và `UNIFIED_IMPLEMENTATION_PLAN.md` **không sửa ở đây**: ô đề xuất ở §6, request mới ở §7.

## 0. Pin và lane

| Mục | Giá trị |
| --- | --- |
| Base | `claude/fe-parity` @ `7df531d3` (worktree F9, chưa push, chưa ff) |
| Producer | Codex `7818d563` (FE-057 `observed_at_ms`/`valid_until_ms`), trả lời Q1–Q6 ở [self-access-consumer-return](../ELP2-03/self-access-consumer-return-2026-10-19.md) |
| Tầng kiểm chứng | **R1 only, R2 pending** (§10.10): vitest tập trung + `tsc`; một spec Playwright V2 trên bản build riêng; **không** Docker, visual, hook đầy đủ |
| Lane | `FIXTURE_LAB` (thân là fixture canonical `execution-access.synthetic.valid.json`, chỉ đổi scope và đồng hồ) trên `BFF_DOUBLE` (fetch giả trong test; double e2e `bffDoubleSelfAccess.ts`). **Không** có đọc runtime thật: image đang cài vẫn chưa phục vụ hai trường mới |

## 1. Việc đã làm

### W1 · `useSelfNavigation` (`v2/shell/useSelfNavigation.ts`, port ở `selfNavigationPort.ts`)

- **Port** `SelfNavigationPort.read(question, signal)` khoá theo (workspace, environment, **session**). Không có sẵn port self-navigation trong `api/ports.ts`/`httpApi.ts`, và read nằm dưới `/api/admin/**`, ngoài `ExecutionApi` mà màn nhận; rail lại nằm **trên** router. Vì vậy port nằm cạnh hook, `ports.ts`/`httpApi.ts` **không đụng**. Kết quả có kiểu: `ok` (qua reader chặt) | `conflict` (409) | `denied` (401/403, giữ status) | `unavailable` (mọi thứ khác, mỗi loại một câu thật; 500 không nói gì về quyền). Không throw, `no-store`, same-origin; khoá session **không gửi đi** (cookie là session).
- **Scope isolation**: view suy ra trong lúc render từ `slot.key === scopeKey`, nên khung đầu tiên sau khi đổi workspace/env/session đã rỗng, không đợi effect. Test: `result.current` ngay sau `rerender` là `loading` với 0 token (3 trục), và ở shell: DOM ngay sau click không còn Portfolios.
- **Câu trả lời muộn**: mỗi read mang token; rời scope hoặc unmount thì `abort()` + tăng token; câu trả lời đến sau bị bỏ dù đúng. Câu trả lời mà `workspace_id`/`environment` không phải thứ đã hỏi (`navigationAnswers`) là **lỗi**, không hiển thị.
- **Single-flight**: Retry, re-read hết hạn, mount lại cùng câu hỏi đều nhập vào read đang bay.
- **409 đúng một lần**, ngay lập tức; 409 lần hai là lỗi có lý do ("could not settle ... after one retry (409)"). 401/403/5xx/mạng **không** tự thử lại.
- **Không storage, không polling**: test chặn `Storage.prototype` và `setInterval` suốt một vòng đời. Đồng hồ duy nhất: **một** `setTimeout` tại `valid_until_ms` (chia lát khi quá 2^31-1 ms), cộng kiểm tra đồng bộ khi tab quay lại (`focus`/`visibilitychange`) — **không request** trừ khi trần đã qua.
- **Hết hạn = đóng, không phải lease**: tới `valid_until_ms` (end-exclusive) gate không cấp token; hook đọc lại **tối đa một lần tự động mỗi scope**. Nếu câu trả lời lại hết hạn/lỗi/bị từ chối thì dừng tới khi người dùng bấm Retry (Retry trả lại một lần tự động). Máy chủ trả trần +1 ms liên tục không thể tạo bão timer (test: 24 giờ giả lập, 2 read, 0 timer treo).
- **Không hỏi khi thiếu scope**: cờ tắt, không session, hoặc không có `workspace_id` trên địa chỉ → `idle`: không request, không dòng thông báo, rail như hôm nay.

### W3 · gộp vào `PortalShell`/`Sidebar` (sau cờ V2 `shell`)

- `app/PortalShell.tsx` thêm **một** lazy mount thứ hai (`V2SelfNavigation`) dưới cùng chuỗi raw env như `V2CommandBar`, và chỉ mount khi `V2_SHELL_ON` (manifest có `shell`). Cờ tắt: không chunk, không state khác `NO_SELF_NAV`, `capabilities` chính là danh sách session như trước. Controller (`v2/shell/SelfNavigation.tsx`) không render gì; nó đưa lên shell `{ tokens, notice }` qua `useLayoutEffect` (shell render lại trước paint, nên khung đầu của scope mới không mang token scope cũ).
- Token **chỉ được thêm** vào capabilities để liệt kê (`navCapabilities`/selfNavGate: phần session không bao giờ bị sửa, không gửi ngược lên máy chủ). Câu hỏi dùng **env đang chọn của ContextBar** (mặc định `live` như ContextBar) và `workspace_id` trên địa chỉ.
- Dòng **"Navigation unavailable: <reason>"** + nút **Retry** (hết hạn hoặc lỗi), vẽ **đầu tiên bên trong `<nav aria-label="Primary navigation">`** của chính rail (cùng landmark, `role="status"` lịch sự cho câu, nút thường trong thứ tự Tab). Không focus tự động; Retry vẫn là **cùng một phần tử, không `disabled`** khi đang đọc lại (nút disabled làm rơi focus) và báo bằng `aria-busy` + chữ "Checking again.". Rail thu gọn: câu thành tên truy cập + tooltip của nút. Class `exec-selfnav*` nằm trong `v2/css/selfnav.css` (v2Hygiene xanh); markup nằm ở `v2/shell`, **không** trong `Sidebar.tsx`, vì `v2Hygiene` coi chuỗi `exec-*` trong nguồn V1 là va chạm.
- `Sidebar.tsx` chỉ thêm prop `notice?` (bị bỏ qua khi `v2Shell=false`); `commandRouting.ts` thêm hằng `V2_SHELL_ON`. `PortalShell.flagOff.test` **giữ nguyên digest, xanh** (6 digest không đổi); `PortalShell.v2Gating.test` cập nhật đếm lazy import V2 từ 1 lên 2 và thêm kiểm tra riêng cho cổng mới (xem §5 "Sửa test sẵn có").
- Câu hết hạn của `selfNavGate` đổi "Reload to check again." thành "Retry to check again." (có nút Retry rồi); đây vẫn là **copy đề xuất chờ Bobby duyệt**; 2 test pin được cập nhật cùng chữ.
- **Rail không bao giờ liệt kê thứ máy chủ không liệt kê**: mục `execution.*` chỉ xuất hiện khi session đã giữ token (hôm nay không ai phát) hoặc projection `ENTERABLE`. Hai điều cần nói thẳng: (a) token **session** vẫn được tôn trọng kể cả khi projection nói `HIDDEN` (đúng chỉ thị "chỉ thêm"); (b) Overview/Alpha Fleet/Approvals ngoài projection theo thiết kế (Q3), vẫn theo cap thật.

### "My access" chỉ của mình (audit §2)

Trên màn Profile & Access V2 (`v2/screens/access/index.tsx`), ma trận quản trị V1 chỉ còn khi **owner flag VÀ `administration.profile_access.manage`** cùng nằm trong câu trả lời session. Trước đây chỉ cần owner flag. Thiếu một trong hai (kể cả session chưa tải/không đọc được, và `?view=manage` gõ tay) thì chỉ có self-view; self-view chỉ gọi `GET /v2/effective`.

### Trình duyệt (1280 và 660)

`e2e/execution-v2-selfnav.spec.ts` + `e2e/bffDoubleSelfAccess.ts`; kết quả ở §4.

## 2. Audit: mọi liên kết/route dẫn tới ma trận chính sách

Tất cả liên kết "My access" / "See what you can access" trỏ về **một** đường dẫn `/administration/profile-access` (17 tệp nguồn khai báo hằng; 33 chỗ truyền `accessHref=`). Không liên kết nào mang `?view=manage`, fragment hay sub-path (test `accessLinks.audit.test.ts` đọc nguồn và ghim).

| Điểm vào | Dẫn tới | Chặn ma trận bằng |
| --- | --- | --- |
| `DockAction accessHref` (Drawer.tsx; command, live, canary, sandbox, alpha, operations, account, workbench...) | đường dẫn trần + context chung | route chỉ mount ma trận như prop `manage` của self-view; không link nào chứa tab `manage` |
| `ContextBar accessHref` ("My access" cạnh khoá env/window) | như trên | như trên |
| Users (`UsersEntry` → `accessHref`) | như trên | như trên; Users V2 chỉ link, không nhúng ma trận |
| Rail "Profile & Access" | cùng route | `isNavigable`: hiện chỉ khi giữ `administration.profile_access.manage`; người thường **không có mục rail** (FE-038, §7 mục 3) |
| `?view=manage` gõ tay | self-view | `canManage` = owner **và** capability, fail closed |
| Cờ `profile` tắt (V1) | V1 `ProfileAccess` | không đổi: `enabled: owner` chặn mọi fetch policy của người không phải owner (test ghim); **không** đụng V1 vì cờ tắt phải y hệt |
| `research/screenRoutes.ts` (`portal_access`) | cùng route | như trên |

Giới hạn trung thực: cùng một **đường dẫn** phục vụ cả self-view lẫn (cho admin) ma trận. Codex Q4 muốn "bề mặt/route/drawer self-only riêng". Hiện thực hiện tại là bề mặt self-view riêng **trên cùng đường dẫn**, không phải route mới: đổi sang route mới chạm hằng ở 17 tệp thuộc các writer khác và `PROFILE_ACCESS` của registry (Codex rev 7), nên để thành quyết định ở §7.

## 3. `execution.accounts.manage`: mọi chỗ dùng, không đổi tên

Codex Q3 viết rõ **không có** capability `execution.accounts.manage` và **không nêu tên cuối**; vì vậy không đổi tên.

| Chỗ | Vai trò |
| --- | --- |
| `v2/screens/account/model.ts:79` | `ACCOUNT_CAPABILITY.manage`, hằng duy nhất; `ACCOUNT_NEEDS.manage = { allOf: [...] }` |
| `v2/screens/account/Account360.tsx:131` | `holds(capabilities, ACCOUNT_NEEDS.manage)` → `canManage` cho `PhysicalBinding` |
| `v2/screens/account/BindingDrawer.tsx:114` | `holds(...)` → lý do và liên kết của "Rotate credential" |
| `v2/screens/account/PhysicalBinding.tsx:29,78` | prop `canManage` → "Rotate credential" |
| `v2/screens/account/account.test.tsx:375` | test dựng session có token để bật nút |
| docs: `consumer-review-self-contracts` §8, `debt-register.json` DEBT-UXM07-005, `FRONTEND_BACKEND_SYNC` FE-058 | ghi nhận "không có thay thế" |

**Đề xuất** (chờ Codex nêu tên hoặc xác nhận bỏ; FE-B sở hữu màn Account): bỏ token, vì 28 action của eligibility không có action nào cho "xoay credential/binding" (chỉ `account.read`, `binding.read`). Nút "Rotate credential" giữ **tắt cho mọi người** với lý do "Not published" trỏ tới request ở §7 mục 1, thay vì một token không ai phát. Khi Codex publish action (vd. một action binding trong family preview có step-up) thì nút đọc eligibility thật. `accounts.manage` **không được map sang `account.read`**.

## 4. Kiểm chứng

| Gate | Lane | Kết quả |
| --- | --- | --- |
| `npx tsc --noEmit -p .` | tĩnh | exit 0, không dòng nào |
| `vitest run src/app src/execution/v2/shell src/execution/v2/readers/accessSelf src/execution/v2/screens/access src/execution/disabledReason.test.ts src/execution/v2/v2Hygiene.test.ts --maxWorkers=2` | FIXTURE_LAB / BFF_DOUBLE | 35 file, 3075 pass, 3 skipped, 0 fail. Trong đó mới 88 test: hook 32, port 13, controller/notice 5, shell 16, double 6, audit liên kết 7, Sidebar +4, Access +4, gating +1 |
| `PortalShell.flagOff.test` (digest 6 route × đóng/mở) | tĩnh jsdom | xanh, digest **không re-pin** |
| `disabledReason.test`, `v2Hygiene.test` | tĩnh | xanh |
| Playwright `execution-v2-selfnav.spec.ts` (chromium-v2, 1280 và 660, 17 test) | FIXTURE_LAB / BFF_DOUBLE | 17/17 xanh, 1.3 phút chạy test (79 s tường kể cả build, 1 worker). Lần chạy đầu 15/17: hai lỗi **của spec** (đếm request sau Forward giả định không có bfcache; màn Overview khoá env nên nút Sandbox bị disable), đã sửa spec, không sửa mã sản phẩm. Chạy trên bản build riêng cổng 4286 (cổng 4176 đang bị writer khác giữ bằng worktree khác) bằng config tạm không commit, cùng project `chromium-v2` |
| Build cờ tắt (`VITE_EXECUTION_V2_SCREENS` rỗng, preview tắt) + grep năm chuỗi (`Navigation unavailable`, `exec-selfnav`, `SelfNavigation`, `self-navigation`, `selfnav`) trên toàn `dist` | tĩnh | 0 tệp khớp (448 asset). Build cờ bật có chunk riêng `SelfNavigation-*.js` chứa chuỗi (grep có hiệu lực) |
| `src/fixtureBff` (equivalence 2, server 6) | — | 8 fail **có sẵn, không do thay đổi này**: `screens/paper/dep_94`, `dependentRequired` trong checker của testkit; không tệp nào của vòng này nằm trong đường đó. Chưa chứng minh trên cây sạch (NOT_RUN), chủ: người tích hợp ở R2 |
| Visual pinned-image, hook R2, vitest rộng, Docker | — | NOT_RUN (chủ: người tích hợp, R2/R3) |

Trình duyệt chứng minh (ở cả hai bề rộng): console sạch + không request ra ngoài origin; không tràn ngang; `workspace_id`/`env` sống sót qua click rail; reload/Back/Forward giữ rail đúng scope trên địa chỉ; Retry bằng bàn phím tới được (Tab) và Enter đọc lại, câu hiện ra không cướp focus; 409 một lần; 409 hai lần thấy lý do và dừng; trần hết hạn đóng rail với câu "Portal clock" và đúng **2** request; "My access" của người thường chỉ gọi `/v2/effective` (và self-navigation của shell), không gọi policy/users/activity, kể cả `view=manage`; owner có capability vẫn có tab thứ hai. Test câu trả lời muộn chạy ở 1280 (cần ContextBar đổi env, không có ở drawer 660).

Không chứng minh: runtime thật (image chưa phục vụ trường mới), nhiều-tab, bfcache (Forward có thể khôi phục trang cũ, giữ trạng thái cùng scope, không hỏi lại), đồng hồ lệch giữa client và Portal (chỉ dùng một chiều để đóng).

### Sửa test sẵn có (có lý do)

- `PortalShell.v2Gating.test`: "đúng 1 lazy import V2" thành "đúng 2", mỗi cái sau raw env; thêm test riêng cho cổng `V2SelfNavigation`.
- `selfNavGate.test` (2 chỗ): chữ "Retry to check again."
- Không test nào bị nới để xanh.

## 5. Tệp chạm

Mới: `v2/shell/{useSelfNavigation.ts, selfNavigationPort.ts, SelfNavigation.tsx}` + 4 test, `v2/css/selfnav.css`, `app/selfNavView.ts`, `app/PortalShell.selfNavigation.test.tsx`, `screens/access/accessLinks.audit.test.ts`, `e2e/bffDoubleSelfAccess.ts`, `e2e/execution-v2-selfnav.spec.ts`.
Sửa (**dùng chung**): `app/PortalShell.tsx`, `app/Sidebar.tsx`, `app/commandRouting.ts` (3 dòng), `v2/shell/selfNavGate.ts` (chữ), `v2/screens/access/index.tsx`. Không đụng: `api/ports.ts`, `httpApi.ts`, `roleNav.ts`, `contextFacts.ts`, `routeFeatures.tsx`, các double khác, `v2Lane.ts`, `FRONTEND_BACKEND_SYNC.md`, `UNIFIED_IMPLEMENTATION_PLAN.md`.

## 6. Ô đề xuất cho sổ (Codex/vòng sau dán; tôi không sửa tệp)

- `FE-057 | DELIVERED -> consumer ACCEPTED; hook W1 + shell W3 nối (R1 only, R2 pending) | FIXTURE_LAB/BFF_DOUBLE, chưa có runtime thật`
- `FE-058 | Q1-Q5 áp dụng trong shell: rail liệt kê theo projection (env ContextBar, scope = workspace_id trên địa chỉ); tên accounts.manage CHƯA có -> chờ Codex (§7.1); phủ 4/7 mục theo thiết kế`
- `FE-037 | đóng một phần: 4/4 tên nav có projection; accounts.manage mở`
- `FE-038 | self-view tách khỏi ma trận (owner + capability); rail cho người thường CHƯA có (registry rev 7)`
- `FE-059 | OPEN, không đổi`

## 7. Request mới / quyết định (chưa gửi; Codex quyết, Bobby duyệt phần copy/route)

1. **Codex — tên cuối của `execution.accounts.manage` hoặc xác nhận bỏ**, kèm: có thêm action eligibility cho thao tác binding (xoay credential...) hay không, family và step-up nào. Đến lúc đó nút giữ tắt, lý do "Not published".
2. **Codex — session phát workspace**: rail chỉ hỏi khi địa chỉ có `workspace_id`, nên rời màn Execution (vd. sang Research) rail trở về cap của session. Đề xuất `/api/admin/access/self` công bố workspace mặc định của actor (hoặc cho biết nguồn khác); không đoán.
3. **Codex/Bobby — Profile & Access cho người thường**: người không có `administration.profile_access.manage` không có mục rail (chỉ liên kết "My access"), vì `isNavigable` lọc theo registry và Q4 cấm bỏ cap khỏi `PROFILE_ACCESS`. Cần rev 7: một feature self riêng (route riêng), sau đó đổi 17 hằng đường dẫn (writer khác, một bước riêng). `self_entry.route` vẫn `null`.
4. **Codex — trigger làm mới**: Q5 nêu "mount/env/focus/409". Đã làm mount, env/workspace/session, 409 một lần, và **focus chỉ kiểm tra hết hạn, không fetch**. Nếu cần fetch khi focus thì nói rõ tần suất tối đa; mặc định không.
5. **Bobby — copy hết hạn** ("The navigation read for your session ended at ... (Portal clock) and is no longer shown. Retry to check again.") và "Checking again." vẫn là đề xuất.
6. **FE-B / các writer màn** (không phải Codex): màn kiểm `holds(session caps, execution.*)` riêng sẽ vẫn từ chối dù rail đã liệt kê; Portfolios V2 không truyền `capabilities` từ route nên không bị tường client, các màn khác chưa kiểm từng cái. Cần quyết định chung: màn đọc cap đã gộp từ shell (context), hay chỉ server từ chối. Tôi không đổi màn của họ.

## 8. Còn lại và rollback

- Còn lại: R2 (vitest rộng, build bật/tắt, hook) trên đúng SHA; ghi nhận Codex §6–7; Bobby duyệt copy; bề mặt self-only bằng route riêng (§7.3).
- Rollback: bỏ `V2SelfNavigation` khỏi `PortalShell`, prop `notice` khỏi `Sidebar`, `V2_SHELL_ON`; rail quay lại cap session (fail closed, không khôi phục quyền nào). Phần `canManage` có thể revert riêng (trở lại owner flag).
