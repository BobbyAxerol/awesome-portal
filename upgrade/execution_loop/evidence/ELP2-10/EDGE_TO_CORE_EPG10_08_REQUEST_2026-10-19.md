# Edge → Core: yêu cầu ghép nối EPG10-08 hiện hành

Ngày: 2026-10-19 (Asia/Saigon). Người yêu cầu: Edge, theo chỉ đạo Bobby
đặt yêu cầu vào đúng checkout Core và gửi prompt cho agent Core.

**Trạng thái: OPEN / AWAITING_CORE_ACK. Đây là request, không phải receipt
đã sửa/cài đặt. EPG10-08 vẫn NOT_MET; 09 connected chưa được nghiệm thu.**

## 1. Đọc ở đâu, ai sở hữu

Checkout Core đang được dùng trên SGP: `/home/bobby/portal-research`,
nhánh `docs/research-loop-plan`. Source pin lúc đọc:
`f46439157fe25892fc4372dda532bd1f8bdc4773`, cộng WIP của Core đã stage.
Không chuyển sang stable/main/dev hoặc checkout integration cũ.

Đọc theo thứ tự:

1. Root `AGENTS.md`, [campaign rules](../../AGENT_WORKING_RULES.md).
2. [Unified §14](../../../UNIFIED_IMPLEMENTATION_PLAN.md#execution-loop-v2),
   [Core installed handoff](CORE_INSTALLED_EDGE_HANDOFF_2026-10-19.md)
   và [wire/owner return](CORE_TO_EDGE_EPG10_08_OWNER_RETURN.md).
3. Request này; rồi đối chiếu source/runtime mới nhất trước khi sửa.

Đây là phần tiếp nối C7 / EPG10-08 đã giao, không mở phase hoặc framework mới.
Core sở hữu Core session/current-human/policy/composition và gói cài đặt của
mình; Edge sở hữu helper/operator, source window và connected acceptance.
Bobby hiện chỉ giao Edge **ghi tài liệu phối hợp**: việc tạo request này không
tự cấp một cửa sổ restart/deploy rộng hơn cho bất kỳ agent nào.

## 2. P1 — sửa cleanup khi mất phản hồi issue-identity trước khi Edge sử dụng

**ID `ELP2-REQ-10-008`; Edge → Core; status OPEN.**
Giữ locator cũ `CORE_UNUSED_IDENTITY_FINISH_OWNER_ACTION.md` làm provenance,
không coi đây là bug mới hoặc hai công việc khác nhau.

Nói ngắn: Core tạo phiên/identity tạm, nhưng response bị mất trước khi PM/Edge
prepare attempt. Khi đó cần thu hồi **đúng phiên chưa dùng**, không bắt Edge
tạo attempt hay receipt rollback giả chỉ để cleanup.

### Quan sát thực tế và source pin

Đây là **gap được đọc từ code**, không phải một orphan/session đã phát sinh.
Lần kiểm tra IPC chỉ đọc lúc 2026-10-19 21:54:56 Asia/Saigon
(14:54:56 UTC) là READY, unresolved=0, terminal=null, mọi callback counter=0;
Edge chưa gọi issue/finish.

Private source đang cài trên SGP:

`/home/bobby/secure/portal-research-c7-20261019/reverse-runtime-v1/reverse-bootstrap.cjs`

SHA256 `e997debdcbc0500dd91252f6ff5a79ad31f5571d3ddbd6caae077ec2fb298cea`.
Đây là locator nguồn private; không đưa file descriptor/secret vào Git.
[Candidate source](../../../../apps/control-api/src/execution-v2/current-human-candidate.ts)
SHA256 `74aa99af7e02056dd5552185069b4ed5195a3f2f40ea8398d709f8d8102bedd3`.

- Bootstrap 175–191 lưu session + ISSUED lease trước response IPC.
- Mất response trước source prepare: chưa có attempt/physical receipt hợp lệ.
- `finish` 193–209 gọi `beginDrain`; candidate 663–670 retire ISSUED thật.
- `ownedTerminal` 156–168 vẫn yêu cầu source terminal thật hoặc đúng một event
  `SOURCE_ROLLED_BACK_UNENTERED`. RETIRED chưa từng dùng không đạt điều kiện.
- Dẫn tới `SOURCE_TERMINAL_REQUIRED`, chưa logout được đúng session.
  Phát hành lại identity không giải quyết được và không được dùng làm fallback.

### Sửa tối thiểu và bất biến

Giữ nguyên `ownedTerminal` cùng các predicate COMMIT/UNKNOWN/source receipt.
Thêm eligibility riêng, chỉ dùng cho private finish của identity **chưa dùng**:

- Drain thật đã COMMIT, đúng drain ID/revision, trạng thái DRAIN_READY.
- Đúng original lease/session/revision/user/workspace/environment/workload/
  request digest; lease RETIRED, attempt và terminal receipt đều null.
- Không có ENTER/UNKNOWN/source terminal/unentered-source-rollback event,
  callback hoặc obligation chưa giải quyết; facts thiếu/mâu thuẫn phải từ chối.
- Chỉ cho logout đúng temporary session và hoàn tất drain; không tạo quyền
  READ/command, source attempt, rollback receipt, terminal ACK hay identity khác.
- Retry/mất logout ACK phải tiếp tục đúng session/drain. Không giả `finished`,
  không coi timeout là rollback, không xóa custody/audit khi UNKNOWN.

Tái dùng RETIRED/FINISHED hiện có; không cần thêm public state/schema/API chỉ
để giải quyết nhánh chưa dùng này. Chọn sửa tại source/installer có thể tái lập,
không chỉ sửa tay bootstrap đang chạy rồi báo là source đã land.

### Test và done-when

Focused cases: mất issue response trước prepare; unused finish bình thường;
finish lặp lại; logout ACK mất rồi recover; sai lease/session/binding; facts
thiếu; ENTERED/UNKNOWN/terminal/source-rollback/callback/unresolved phải từ
chối unused path; race ENTER ↔ drain phải dùng fence thật khi applicable.
Reuse receipt không đổi có impact attribution, không cộng test cũ hai lần.

**Done-when P1:** Core trả source + focused evidence + trạng thái cài đặt thật.
Nếu SOURCE_ONLY thì ghi rõ NOT_INSTALLED; Edge chưa phát hành assertion thật
trên bootstrap cũ. Edge chỉ đóng request sau khi kiểm pin/consumer receipt;
Core test xanh không tự đóng connected08.

## 3. P2 — chuẩn bị composition READ/STREAM sẵn có, tách khỏi identity

**ID `ELP2-REQ-10-009`; Edge → Core; status OPEN.**
Locator cũ `CONNECTED_READ_BINDING_OWNER_ACTION.md` giữ provenance.
Không bắt P1 phải chờ toàn bộ P2 mới bàn giao bản sửa cleanup.

Installed reverse bootstrap hiện mới gắn current-human identity, chưa gắn
native READ consumer. Dùng lại [native-core-runtime.ts](../../../../apps/control-api/src/execution-v2/native-core-runtime.ts)
→ `composeNativeCore` → `nativeCoreManagerReadConsumer`; cùng pool,
trust, current-human mutation/recovery coordinator và retained recovery registry,
không dựng app/authority/policy engine thứ hai.

Dùng [core-owner-commissioning.ts](../../../../apps/control-api/src/execution-v2/core-owner-commissioning.ts)
và installer hiện có cho artifact private root-owned0600
`portal.private-owner-manager-commissioning.v1`, pin hash độc lập và đúng
physical DB/login/protected Portal owner/principal/workspace/intake interval.
Policy/grant phải đúng reviewed catalogue/profile/field seals và revision.

**READ và STREAM là hai quyền khác nhau.** `installReviewedManagerDomainPolicy`
trả `stream_commissioned:false`; cài read policy không tự bật stream.
Core xác nhận và dùng seam commissioning `stream.subscribe` thực có tương ứng,
không chỉ chèn stream grant vào artifact rồi tuyên bố stream active.
Không overwrite nonempty/conflicting policy bằng fresh-policy installer.

Exact candidate đang nghiệm thu: issuer `portal-control-api.native-manager-read`,
subject `usr_5a38d5dfb08b44748f5776fbe04a1434`,
workspace `ws_06G19F61YB8CFR7TEWMS7HQ660`, paper/`PAPER_BINANCE_USDM`.
Đây là test cell đã chọn, **không phải giới hạn sản phẩm chỉ Paper**.
Core DB `portal_control` system `7688673963308855330`;
source TS DB `live_data_executor` system `7674585245102796834`.
TS UUID/version chỉ lấy từ physical identity receipt + Core ACK thật; không
suy từ username, copy protected stable owner hoặc tự seed mapping.

Edge/source tự xử lý native READ acceptance và transport binding đã review.
Provider28445 hiện có global client trust và sáu stable bindings; Core không
thay leaf/key hay restart provider đó. TLS, identity và health200 không phải
grant READ/STREAM; source-update SSE cần data ingestion thật, không chỉ authority.

Core có thể chuẩn bị source/composition và return chính xác input thiếu ngay;
chỉ bind phần phụ thuộc sau receipt/ACK/grants thật. Không fake session/grant/
fixture để báo nghiệm thu. Giữ stable/dev auth, public auto actor và command flags.

## 4. Core trả gì cho Edge

Trả một owner-return Markdown cạnh file này và link từ Unified, theo đúng thứ
đã làm; không cần tạo bộ framework hoặc sao chép lại toàn bộ campaign:

1. Request008/009: ACK/IN_PROGRESS/DELIVERED riêng; changed paths + commit
   (chưa commit: UNCOMMITTED + exact diff hash), bootstrap/source hashes.
   Không áp lại companion helper cũ 44ee/551a/e19/5291.
2. Lệnh/test thực chạy, counts PASS/FAIL/SKIP, receipt/log hashes, reused cases,
   cleanup; tách isolated/model/source và installed/connected evidence.
3. P1 đã cài hay chưa. Nếu cài: source commit, immutable image, effective config,
   bootstrap hash, schema ledger/physical DB, bounded window/rollback receipt
   và trạng thái READY/unresolved/callback thật. Nếu chưa: SOURCE_ONLY,
   NOT_INSTALLED và đúng thao tác/owner còn thiếu; không nhận green hook là deploy.
4. P2: seam/pins đã ghép, policy/grant/read/stream readiness riêng, exact source
   input còn cần Edge trả; missing input phải có owner/done-when.
5. Chỉ secure references/hashes cho trust/session/config; không token, cookie,
   private key, credential/DSN hay raw dữ liệu nghiệp vụ. Chỉ chép sang HK gói
   đã review/được phép; file bàn giao chưa tự là consumer ACK.

Handoff cũ cài `f4643915` vẫn đúng lịch sử; dòng “không cần cài Core thêm”
không được dùng để bỏ qua P1 mới được phát hiện. Không rebuild/install lại
những phần không đổi chỉ vì cập nhật tài liệu.

## 5. Edge đang cung cấp gì và bước sau

Official helper giữ pin đã publish tại
`6adc398b573e297b731863e5ed93f0f7f59ab2fd`,
SHA256 `5f1a0f293311f752d934de72666f8b2e9d671c899eec115d08d7ccd30265dec2`.

Operator mới chỉ ISOLATED_QUALIFIED_NOT_PUBLISHED, không phải Core runtime fix:
source `e108a0a740831a3905c6174597420888160097de7ff4edd682bf276965f42424`,
tests `a9ea6d20d3574cc63ef30666d91143a8ccc1d20f938d57a6a3f99c856e4d47b5`,
receipt `108cd0ec4aeb532a7907c72fb3ee1ad9d16c0e4d4acaf00b117802d7c1e08be0`.
67 PASS là65 overlapping regressions +2 real loopback TLS/socket tests;
callbacks vẫn TEST_ONLY, không phải actual Core/PM SDK/DB hay connected08.

Hai packet nguồn đầy đủ hiện còn ở SGP
`/tmp/epg10-08-operator-unit-sgp-9webn1pg/upgrade/evidence/execution-edge-v1_2/EPG10-08/`:
unused-finish SHA256 `5a70c133acfacb4e03f96bc573e859f13427e1dc0cea419f015c6165e3124aed`;
read-binding SHA256 `f71aa8a575bd069a2859160ec988b05b58507302f7005a52d2054728c7351607`.
File này giữ yêu cầu thiết yếu bền vững trong repo Core, không phụ thuộc việc
thư mục tạm còn tồn tại để hiểu/sửa P1. HK canonical Edge vẫn chờ hết lượt đo
tải của owner khác để mirror/hook/commit, không được đọc overlay thành published.

Thứ tự tiếp theo: P1 owner-return + Edge operator publication → verify custody/
trust/window → genuine same-attempt identity COMMIT/Core ACK + exact cleanup →
bind native READ và Core READ/STREAM → revoke/cache/cursor/SSE/recovery thật
trong chính08. Không coi identity-only thành08 COMPLETE; không mở09 connected
hoặc command/Live mutation từ request này.
