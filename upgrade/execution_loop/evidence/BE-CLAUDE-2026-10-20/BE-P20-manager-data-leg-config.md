# BE-P20 - Validator cấu hình overlay Research cho Manager data leg (Claude, 2026-10-21)

Claude (backend writer, giao theo Core009 handoff §4 và `CORE009_EXISTING_MANAGER_DATA_LEG_PREPARATION_2026-10-21.md`). Tier R3, gate hẹp:
`vitest` spec riêng (`--maxWorkers=2`) + `tsc` trên đúng 4 file mới. Không lock, không Docker/PG/hook, không SSH, không đọc/sinh/tìm byte khoá,
không đọc `/home/bobby/secure/**`. Không sửa `current-source.proxy.ts`, `delegation.ts`, `config.ts` hay bất kỳ runtime nào; không ledger/route/bảng.
Mọi giá trị fixture là `TEST_ONLY`/synthetic. **Không phải** PKI issuance, trust pin, grant, approval hay cấu hình runtime.

## Giao gì

| File | Vai trò |
| --- | --- |
| `apps/control-api/src/execution-v2/manager-data-leg-config.ts` | Hàm thuần `inspectManagerDataLegConfig(value, opts)` + `...Bytes(bytes, opts)` (bytes phải là JSON compact canonical, như Core009). Không fs/net/DB/đồng hồ (caller đưa `nowMs`). |
| `apps/control-api/src/cli/manager-data-leg-validate.ts` | CLI offline theo mẫu `core009-validate`: chỉ mở đúng 1 file `--config`; validate mọi option trước khi mở; exit 0/1/2. |
| `apps/control-api/test/fixtures/manager-data-leg-config.ts` | Fixture dương synthetic: `goodConfig()` (3 mode, leaf đã cấp, STREAM bật riêng) và `inactiveConfig()` (mới có CSR, chưa leaf, STREAM tắt). |
| `apps/control-api/test/be-p20-manager-data-leg-config.spec.ts` | 119 test: 5 dương + 106 hàng ma trận âm + 5 test biên (workspace kỳ vọng, input rỗng/không canonical, độ sâu/số node, không echo giá trị) + 3 test CLI. |

## Tài liệu cấu hình (`portal.manager-data-leg-config.v1`)

`workspace_id`, `file_refs` (4 key), `delegation {issuer, algorithm RS256, scopes}`, `features` (tên env thật trong `config.ts`), `activation`,
`modes.{paper,sandbox,live}`, `canary {resolves_as}`, `public_inputs` (hash 64-hex + mô tả leaf). Không có field nào chứa giá trị khoá.

## Kiểm gì

- Bốn key `EXECUTION_EDGE_PRIVATE_KEY_FILE | _CA_FILE | _CLIENT_CERT_FILE | _CLIENT_KEY_FILE` đúng bằng `/run/secrets/research-native/{edge-signing,edge-ca,edge-client,edge-client-key}.pem`; thiếu/thừa key, lệch path, trùng path, `..` đều bị từ chối.
- Mỗi mode: origin đúng `https://10.70.0.2:{8443,8444,8445}` (cổng của mode khác = `ORIGIN_PORT_MODE_MISMATCH`; 28446/http/host khác/dấu `/` cuối = `ORIGIN_NOT_EXACT`), profile `*_BINANCE_USDM`, audience `portal-execution-edge-{paper,sandbox,live}` (pin N13B của `config.ts`), issuer `portal-control-api`, workspace đúng workspace Research truyền vào (bắt buộc truyền, không có mặc định), kid `research-*` duy nhất giữa các mode (<=32 ký tự như `EXECUTION_EDGE_KEY_ID`), TTL số nguyên 1..60.
- READ và STREAM tách: read chỉ `execution:manager-v2:read`, `grants_stream=false`, resource realtime trong read = `READ_GRANTS_STREAM`; stream chỉ `execution:manager-realtime`, bật thì phải có grant hash riêng và khác grant READ; scope delegation đúng `["execution.read"]`.
- Tắt: `FEATURE_EXECUTION_COMMAND_RELAY`, `_REALTIME_SSE` (legacy SSE), `_LOCAL_R0_TASKS`, `_CURRENT_SOURCE_PAPER_DNSE` phải `"false"`; `activation.command/capital/live_trading` phải `false`; ba `CURRENT_SOURCE_{PAPER,SANDBOX,LIVE}` + `EDGE` phải `"true"`.
- Canary chỉ `{resolves_as:"live"}`; mọi field endpoint riêng hoặc `modes.canary` bị từ chối.
- Hash công khai: signer khác client key; leaf phải `kind=issued_leaf`, khác hash CSR/public key/CA, `public_key_sha256` = client key, SAN `spiffe://primusspark/portal/control-api/paper` (đổi được bằng `expectedLeafSanUri` khi owner PKI trả contract SAN khác), EKU chỉ `clientAuth`, `ca=false`, có `digitalSignature`, hiệu lực hợp lệ (và còn hiệu lực tại `nowMs`). Leaf vắng = lỗi, trừ `--inactive-preparation` (cảnh báo).
- Từ chối marker: tái dùng khoá stable (`stable`, `execution-k1`, `prod`, `ed25519`/`native-core|trust`, hoặc hash nằm trong `knownStableSha256`), CSR đưa như leaf, marker CA test (`test|self-signed|snakeoil|dummy|fake|...`), giá trị giống vật liệu khoá (header PEM, chuỗi base64/hex >= 80 ký tự, dạng JWT, chuỗi > 512), tên key giống bí mật (`secret|password|token|private_key|pem|d|p|q...`, trừ 4 tên file-ref).
- Findings chỉ có `code` + JSON `path`, không bao giờ echo giá trị (có test).

## Cố ý KHÔNG làm

Không mở/stat file nào được tham chiếu (test CLI khẳng định chỉ mở file config). Không cấp/ký/kiểm chữ ký chứng chỉ, không kiểm SPKI thật (chỉ so chuỗi hash do owner trả). Không nối vào runtime/config loader/compose; không đổi `config.ts`. Pass != leaf được tin cậy, != grant READ/STREAM, != cửa sổ reconcile.

## Core/Edge dùng trước cửa sổ reconcile

1. Core điền tài liệu từ bundle công khai đã nhận (hash từ `inactive-public-manifest.json`, leaf + chain khi owner PKI trả) rồi chạy:
   `node dist/cli/manager-data-leg-validate.js --config <file> --workspace-id <ws Research> --now <UTC> [--reviewed-kids ...] [--stable-sha256 <hash public của khoá stable/native>]`.
   Trước khi có leaf: thêm `--inactive-preparation` (STREAM nên tắt). Sau khi có leaf: bỏ cờ này; exit 0 là điều kiện cần để Core trình overlay lên Edge.
2. Edge/target owner chạy cùng lệnh trên cùng bytes (đối chiếu `input_sha256` trong report) trước khi chốt pin TLS/JWKS cũ/mới + rollback cho shared reconcile; hai bên phải ra cùng report.
3. Report không thay `Core validates issued material` và không thay review của owner PKI; chỉ chặn các lỗi cấu trúc rẻ trước khi chạm listener đang chạy.

## Điểm mở cần owner quyết (validator đang theo yêu cầu, nghiêm hơn runtime)

- **Kid theo từng mode vs một kid**: runtime hiện chỉ có một `EXECUTION_EDGE_KEY_ID` và một private key dùng cho cả ba profile (`current-source.proxy.ts` ~L756-760), nên overlay kiểu hiện tại sẽ có cùng một kid ở cả 3 mode. Validator theo yêu cầu (kid duy nhất giữa các mode) sẽ từ chối cấu hình đó. Cần Core/Edge chốt: (a) cấp 3 signer/kid riêng và Edge JWKS overlap 3 kid (cần sửa runtime sau này, ngoài P20), hoặc (b) cho phép một kid dùng chung có review (đổi rule `DUPLICATE_KID_ACROSS_MODES` thành cảnh báo). Chưa đổi gì.
- SAN leaf: dùng đúng URI Paper trong CSR (`.../control-api/paper`) cho cả 3 mode theo prep note; handoff cũng nói URI "Paper-named" không tự động là grant cho mọi môi trường. Nếu owner PKI yêu cầu SAN khác theo mode, cần đổi sang SAN theo mode trước khi cấp.

## Còn nợ ở source owner (source-head/writer handoff, không thuộc P20)

- Owner PKI/target thật: tên + tham chiếu issuer, **leaf đã ký** + chain công khai + hash đầy đủ (validity/EKU/SAN/SPKI); CSR không phải leaf; không tạo CA test.
- Edge owner: review public JWK overlap giữ kid stable; pin TLS/JWKS cũ/mới, ảnh/config cũ và rollback, cửa sổ hữu hạn cho shared Paper reconcile (ba listener 8443/8444/8445); chưa thực hiện.
- Source/PM: fresh Manager relation head (Portal Manager publication head) và writer đủ tiêu chuẩn; STREAM cần nguồn whole-Fleet đạt chuẩn + grant scoped chính thức, C3 cần ROOT scope riêng. Native recovery (28446) độc lập và không bị giữ bởi P20.
- Trước khi có đủ: không tuyên bố "fresh Manager data" từ report này.
