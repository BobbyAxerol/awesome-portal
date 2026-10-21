# BE-P21 — Reducer nguồn kinh tế C5 (dark, thuần, chưa nối runtime) (ELP2-10 C5) (Claude, 2026-10-21)

Owner Claude (backend, ACT_NOW của `C5_FINANCIAL_PRODUCER_REVIEW_AND_CLAUDE_HANDOFF_2026-10-21`). Nhánh `claude/post-freeze-20261021`. Tier **R2 hẹp, theo §10.10b/c** (Codex đang chạy landing gate, máy giữ yên): `tsc` chỉ 3 file mới, `vitest` chỉ spec mới (`--maxWorkers=1`).
**NOT_RUN: full tsc, các spec khác, PG, Docker, hook, generators/contract regeneration (không có schema công khai nào đổi), lock.** Mọi giá trị là `TEST_ONLY`; 14/28/null của PM chỉ gợi ý fixture, không phải sự kiện runtime. **Không claim qualification, không claim nguồn tài chính, không đóng ELP2-10.**

Trạng thái: **PROPOSAL_NOT_A_PRODUCER_MAPPING**. Mọi tên trường là đề xuất phía Portal; không phải cột producer, không phải wire mapping.

## 1. Cái đã dựng (3 file mới, không sửa file nào có sẵn)

| File | Nội dung |
| --- | --- |
| `src/execution-v2/manager-economic-source.contract.ts` | Shape đóng (zod `.strict()`) của input/output. Chỉ ngữ nghĩa mà handoff liệt kê: danh tính nguồn có namespace, leaves + census kỳ vọng, bằng chứng ownership/attribution, valuation/cut/window, khóa so sánh, 4 revision (economic/cashflow/valuation/ownership), restatement, lớp chi phí. `economic_account_ref` / `ownership_partition_ref` là **typed-absent** (`NO_ACCEPTED_BRIDGE` / `NOT_PUBLISHED_BY_SOURCE`) trừ khi bridge đã duyệt cung cấp. Chỉ có metric `NAV` / `NET_PNL`: RETURN không biểu diễn được. |
| `src/execution-v2/manager-economic-source-reducer.ts` | `reduceEconomicSource(input)`: thuần, toàn phần (input sai = verdict REFUSED, không throw), BigInt qua `sumExactDecimals` (cùng phép cộng với reader), không float/FX/carry-forward/đồng hồ. |
| `test/manager-economic-source-reducer.spec.ts` | 64 test, fixture tổng hợp `TEST_ONLY`. |

## 2. Cái nó cưỡng chế (luật PM, đúng thứ tự ưu tiên cố định)

1. **Cổng bằng chứng -> `UNAVAILABLE`**: có dòng legacy (không source id tin cậy/leaves), source id thuộc namespace không được `trust_policy` bảo chứng (policy rỗng = không tin gì, đây là mặc định dark), hoặc census chưa publish. Không đánh giá gì thêm: không dedupe theo account, không về 0.
2. **Từ chối -> `REFUSED`** (không số): khóa so sánh lệch so với expectation (currency, basis, environment, metric, cut effective/recorded, window, valuation cutoff, 4 revision, quan hệ restatement); nguồn ngoài census; cùng id đổi nội dung = `REPORT_SOURCE_CONFLICT`; id khác nhau mà `leaves` giao nhau = `REPORT_SOURCE_OVERLAP`.
3. **Độ phủ -> `PARTIAL`** (không số, không subtotal): nguồn kỳ vọng không có dòng, dòng thiếu valuation, thiếu ownership, hoặc nêu lớp chi phí còn thiếu.
4. **`COMPLETE`**: tổng decimal chính xác, mỗi nguồn tin cậy bất biến đúng một lần; xuất `economic_set_digest` (expectation + census + [namespace, id, content digest]).

Cùng id tin cậy + cùng nội dung bất biến = 1 lần (nội dung không gồm `portal_fact_id` và gợi ý `physical_account_ref`; `14` = `14.000`; thứ tự leaves không quan trọng). Cumulative snapshot không phải event: expectation chứa đúng **một** cut và mọi dòng phải bằng nó, nên dòng của cut khác là REFUSED; muốn lịch sử thì gọi mỗi cut một lần và không cộng các kết quả.

## 3. Cái nó từ chối suy diễn

Tiền bằng nhau, account vật lý bằng nhau, `portal_fact_id` bằng/khác nhau, `economic_account_ref`/`ownership_partition_ref` bằng nhau: **không** chứng minh trùng lặp, **cũng không** chứng minh rời nhau (đều có test). Không suy trọng số attribution từ capital/budget/tên deployment. Không FX, không rebase, không nội suy, không giá trị thiếu = 0. Không suy "net của những gì" từ `realized+unrealized+funding−fees`: lớp chi phí chỉ đến từ nguồn, thiếu thì PARTIAL.

Hai điểm bảo thủ **do Portal thêm** để "validated" có nghĩa, Core xem lại: (a) dòng ngoài census bị REFUSED (không tự thêm vào quần thể); (b) `PARTIAL` không mang subtotal (khớp `managerMetricConsistent`: AVAILABLE <=> value khác null).

## 4. Dataset VÀ series cùng gọi thế nào (thiết kế, chưa sửa model/series)

Một input-builder, một hàm. Dataset (`managerPartitionTotals`): mỗi (population, partition, metric) một lần, cut = cut của document. Series (`deriveSeriesObservations`): cùng builder, mỗi instant một lần với instant đó làm cut/valuation cutoff; `reason_codes[0]` là reason_code của metric/observation, `economic_set_digest` có thể gộp vào `input_digest` làm kiểm tra parity writer/reader. Spec có hai caller giả (reader / writer re-send 3 revision đảo thứ tự) cho ra cùng tập, digest và giá trị.

## 5. Mapping producer còn nợ (PM/Edge trả; không đoán)

Từ bảng "PM/Edge return" của handoff: (1) namespace + vòng đời source id, so sánh nội dung bất biến, luật correction; (2) ngữ pháp leaf, quần thể/census kỳ vọng, luật thiếu nguồn; (3) phạm vi logical/physical, lịch sử ownership (original/effective), assignment/owner digest, quyền đọc hiện hành; (4) effective/recorded/valuation cutoff, revision nguồn/model, window/origin, ngữ nghĩa all-time; (5) currency/basis/environment/venue/mode, chính sách FX nếu có; (6) 4 revision economic/cashflow/valuation/ownership, methodology, tên các lớp chi phí đã gồm/thiếu (fee/funding/interest/borrow/slippage/khác), denominator; (7) quan hệ original/corrected/restated và provenance nội dung; (8) bridge được duyệt cho `economic_account_ref` / `ownership_partition_ref` (hoặc typed absence). Kèm ví dụ producer thật đã đối soát hoặc `NOT_PUBLISHED` có locator. Còn nợ: danh sách **đóng** tên lớp chi phí (hiện là chuỗi mờ), quy ước rỗng/`null` của window ALL.

## 6. Claude sẽ tích hợp thế nào (sau khi có mapping + one-writer)

1. Chờ mapping được chấp nhận + Core review; lịch one-writer cho `manager-model.ts`, `manager-series-observation.ts`, `manager-series-materializer.ts`, `manager-model.contract.ts` (hiện không đụng).
2. Viết **một** input-builder từ `ManagerFact` (+ census) sang input của reducer; thay phép cộng NET_PNL (và NAV nếu mapping áp dụng) ở dataset và ở `deriveSeriesObservations` bằng cùng lời gọi; map `state/reason_codes` sang `availability`/`reason_code` hiện có; gộp `economic_set_digest` vào `input_digest` của observation.
3. Chỉ khi output được publish ra ngoài mới đổi OpenAPI/contract và chạy generators; chạy lại spec reader/series hiện có, thêm test parity thật (reader vs writer trên cùng document), rồi gate bình thường. Tên trường đề xuất ở đây được đổi theo mapping chính thức, không giữ vì đã code.
4. Cho tới lúc đó file dark: test `is not wired` bảo đảm không file nào trong `src/` import nó; mặc định mọi dòng chưa chứng minh -> `UNAVAILABLE`.

## 7. Evidence

`tsc` chỉ 3 file: sạch. `vitest` spec mới: 64 passed. Mutation kiểm tra: nới điều kiện overlap làm đỏ 3 test (overlap, physical-account, order-independence). Commit `--no-verify` theo §10.10b.

## 8. Sửa theo review Codex (CHANGES_REQUESTED, `CODEX_BE_P21_P22_REVIEW_AND_ONE_WRITER_RETURN_2026-10-21` mục BE-P21) — 2026-10-21

Vẫn dark (không import runtime), không đổi `exactDecimal` toàn cục, không widen/truncate/round. Chỉ sửa đúng hai điểm:

- **P21-1 (sum overflow)**: hai input hợp lệ 128 chữ số cộng ra 129 chữ số làm `emit()` ném khi parse output. Nay bước COMPLETE kiểm tổng bằng chính `exactDecimal` (bound dùng chung); vượt bound -> `REFUSED`, `value: null`, `sources: []`, `economic_set_digest: null`, reason code mới `ECONOMIC_SUM_OVERFLOW` (detail `SUM_EXCEEDS_EXACT_DECIMAL_BOUND`). Không dùng output type rộng hơn. Code mới thêm vào enum `economicFindingCode` (contract) và `REFUSAL_CODES` (reducer). Tổng nằm đúng biên 128 ký tự vẫn COMPLETE.
- **P21-2 (population không vào digest)**: `economic_set_digest` nay gộp thêm `expected_sources` là danh sách danh tính census chuẩn hoá, sắp xếp (`JSON.stringify([namespace, source_id])`, sort), nên cùng `census_ref` mờ với quần thể khác -> digest khác; thứ tự census không ảnh hưởng. Giá trị digest đổi so với bản trước (chưa có consumer nào ghim). Comment contract cập nhật.

Test: +4 (`BE-P21 review fixes`): overflow 2x128 chữ số -> REFUSED/overflow (kèm BigInt độc lập 129 chữ số) ; cộng thập phân thường + biên 128 ký tự vẫn COMPLETE; cùng census_ref + cùng dòng, census `[a]` vs `[a,b]` vs `[a,c]` -> digest khác; thứ tự census bất biến. Tổng **68 passed** (trước 64; các test parity cũ vẫn xanh). `tsc` chỉ 2 file contract/reducer: sạch. NOT_RUN như mục đầu (full tsc, spec khác, PG, Docker, hook, lock).
