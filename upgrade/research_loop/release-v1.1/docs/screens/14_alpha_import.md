# SPEC 14 · Alpha Import — standardize av_ — `QuantBT 14 Alpha Import.dc.html`

> Cửa vào của mọi av_: nộp MỘT file .py theo contract, qua 7 cổng fail-closed, thành alpha_version bất biến trong registry. Guide plan; copy VERBATIM.
> Luật gốc: (1) contract là MỘT file .py (mirror delta-rsi) — không yaml rời; (2) 7 gate fail-closed: một gate đỏ là dừng, không "import tạm"; (3) av_ sinh ra bất biến — sửa code là av_ mới.

## 1. Meta
| Key | Value |
|---|---|
| Route | `/research/alphas/import` |
| Vai trò | Wizard 3 bước: Upload & parse → 7 gates → Register (DRAFT → ACTIVE) |
| Inbound | 02 Context "import new version →" · 10 band · Journey P2 |
| Outbound | 02 (`new run with this av_ →`) · 10 (lineage) · Alpha 360° (ngoài prototype) |
| Tweaks (hi-fi) | gateState: clean / failing |
| Console chuẩn | 0 error/warning |

## 2. Layout
### 2.1 Bước 1 — Upload & parse
- Dropzone .py (một file) + ô paste; sau parse: **contract mirror table** — bảng trường đọc được từ file: `entrypoint class · declared timeframes · required columns · warmup bars · determinism.seed_required · parameter_space (maximal surface: 6 params + bounds) · version note`.
- Mỗi trường: giá trị mono + chip `parsed` xanh / `missing` đỏ; thiếu trường contract → gate 1 sẽ đỏ.

### 2.2 Bước 2 — 7 gates (fail-closed, chạy tuần tự, dừng ở gate đỏ)
1. `contract-complete` — đủ trường bắt buộc.
2. `entrypoint-importable` — import khô trong sandbox (không chạy chiến lược).
3. `digest-unique` — sha256 artifact chưa tồn tại (trùng → "identical artifact already registered as av_0_9_2 — re-registering is forbidden; bump the code, not the label.").
4. `parameter-space-sane` — bounds hợp lệ, kiểu đúng, ≤ 12 params.
5. `determinism-declared` — seed_required khai rõ true/false.
6. `data-contract-known` — required columns ∈ catalog cột hỗ trợ.
7. `no-lookahead-static-scan` — static scan cấm gọi future index (heuristic; note "static scan — runtime causality is proven per run at Stage 3/4").
- Mỗi gate: hàng `# · tên · trạng thái PASS xanh / FAIL đỏ + message verbatim / SKIPPED xám (sau gate đỏ) · thời gian ms`.
- Failing fixture: gate 3 đỏ — các gate sau SKIPPED; nút bước 3 disabled; note: "fail-closed: a red gate stops the import — there is no provisional registration."

### 2.3 Bước 3 — Register
- Card kết quả: `av_0_3_0` mới + digest sha256:88c1f2 + state `DRAFT` + supersedes av_0_2_1 (→ SUPERSEDED khi ACTIVATE) + entrypoint.
- 2 nút: `activate now` (DRAFT→ACTIVE — cần quyền; note "a DRAFT version can run as evidence but cannot compose rc_") + `new run with this av_ →` (02 Context prefill).
- Registry strip: các version hiện có của alpha (chip + state) — link 10.

## 3. Data contract
```ts
POST /alphas/import/parse { file } → { mirror: MirrorField[], parse_ok: boolean }
POST /alphas/import/gates { file_ref } → { gates: GateRow[], all_pass: boolean }   // server chạy; FE render tuần tự theo kết quả
POST /alphas/import/register { file_ref, alpha_id } → { av, digest, state:'DRAFT', supersedes }
POST /alphas/{av}/activate → { state:'ACTIVE' }
interface GateRow { n: number; name: string; state: 'PASS'|'FAIL'|'SKIPPED'; message: string; ms: number }
```
- Gates chạy SERVER; FE animate tuần tự theo mảng trả về (stagger 120ms) — không tự chạy gì.
- Mirror table là parse server (AST) — FE không parse .py.

## 4. Pitfalls — chớ làm sai
1. WRONG: FE parse .py bằng regex. RIGHT: server AST parse; FE render mirror.
2. WRONG: gate đỏ vẫn cho next "để xem". RIGHT: fail-closed; step 3 disabled + note verbatim.
3. WRONG: gate chạy song song hiển thị lộn xộn. RIGHT: tuần tự, SKIPPED sau gate đỏ.
4. WRONG: activate ngầm sau register. RIGHT: DRAFT mặc định; activate là hành động riêng (quyền).
5. WRONG: cho sửa parameter_space trong wizard. RIGHT: space đến từ code — sửa là sửa file, nộp lại.
6. WRONG: digest trùng cho "ghi đè". RIGHT: message gate 3 verbatim — bump code.
7. WRONG: static-scan PASS diễn giải "không lookahead". RIGHT: note giới hạn heuristic §2.2-7.
8. WRONG: upload nhiều file/zip v1. RIGHT: một .py (contract single-file); nhiều file → lỗi "single-file contract — bundle imports inside the module or wait for package support (v2)."

## 5. Test matrix
| ID | Case | Expected |
|---|---|---|
| T01 | upload clean .py | mirror đủ trường parsed; step 2 enable |
| T02 | thiếu warmup trong file | mirror missing đỏ; gate 1 FAIL; sau đó SKIPPED |
| T03 | failing fixture gate 3 | message digest-unique verbatim; step 3 disabled |
| T04 | clean gates | 7 PASS stagger 120ms; step 3 enable |
| T05 | register | av_0_3_0 DRAFT; supersedes note; registry strip cập nhật |
| T06 | activate | ACTIVE; note rc composable biến mất |
| T07 | new run with av_ | 02 Context prefill alpha+av; passport khớp |
| T08 | upload 2 file | lỗi single-file verbatim |
| T09 | reduced-motion | stagger tắt (render tức thì) |
| T10 | axe | dropzone label; gate rows role=list; 0 serious |
| T11 | copy diff | verbatim toàn bộ |
| T12 | 660px | bảng mirror cuộn; không tràn |

## 6. Copy inventory — VERBATIM
- Gate 3 fail §2.2-3 · fail-closed note §2.2 · DRAFT note §2.3 · static-scan note §2.2-7 · single-file lỗi §4-8.

## 7. Guide plan
1. Types + fixtures (clean/failing/2-file) — mirror values từ hi-fi.
2. Dropzone + mirror table — T01/T02/T08.
3. Gates renderer tuần tự — T03/T04/T09.
4. Register card + activate + prefill 02 — T05–T07.
5. DoD: T01–T12 xanh; copy diff 0; screenshot clean/failing ≤1%; integration 14→02→(01 filter alpha) đúng chuỗi spec 01 §15.4.

## 8. Phi phạm vi
- Không editor code trong wizard; không versioning UI (10 lo); không quét bảo mật sâu (pipeline CI riêng của registry).


## 9. Per-element CSS ledger
- `.ai-drop`: border 1.5px dashed #c9c5ba; border-radius 10px; background #fdfdfa
- `.ai-drop`: padding 26px; text-align center; color #939db0
- `.ai-drop[data-over=true]`: border-color #0f4c5c; background #e2edf0
- `.ai-mirror .row`: display flex; gap 10px; font-size 11px; padding 3px 0; border-bottom 1px solid #f4f2ec
- `.ai-mirror .k`: width 210px; flex none; font mono 10px; color #4e5a6e
- `.ai-mirror .chip[data-s=parsed]`: color #1e7b4f; border 1px solid #1e7b4f; font mono 8.5px 700; radius 3px; padding 0 4px
- `.ai-mirror .chip[data-s=missing]`: color #b43a3a; border 1px solid #b43a3a
- `.ai-gate`: display flex; gap 10px; align-items baseline; font mono 10.5px; padding 4px 0; border-bottom 1px solid #f4f2ec
- `.ai-gate .n`: width 22px; color #939db0
- `.ai-gate .state[data-s=PASS]`: color #1e7b4f; font-weight 700
- `.ai-gate .state[data-s=FAIL]`: color #b43a3a; font-weight 700
- `.ai-gate .state[data-s=SKIPPED]`: color #c9c5ba
- `.ai-gate .ms`: margin-left auto; font-size 9px; color #939db0
- `.ai-result`: border 1px solid #1e7b4f; border-radius 10px; background #eef5f0; padding 14px 16px
- `.ai-result .av`: font mono 14px 700; color #1e7b4f
- `.ai-draftnote`: font-size 10.5px; color #9a6a1f
- `.ai-registry .chip`: grammar ln-chip (spec 10 §9.1)

## 10. State machine wizard
| Từ | Event | Đến | Side effects |
|---|---|---|---|
| upload | file .py drop | parsing | POST parse; spinner inline |
| parsing | parse_ok | mirrored | mirror table; nút "run gates" enable |
| parsing | parse fail | upload | lỗi đỏ + giữ dropzone |
| mirrored | run gates | gating | POST gates; render tuần tự stagger 120ms |
| gating | all_pass | passed | step 3 enable |
| gating | FAIL gate k | failed | gates sau SKIPPED; step 3 disabled; note fail-closed |
| passed | register | registered | card av_ DRAFT; registry strip cập nhật |
| registered | activate | active | state ACTIVE; note DRAFT biến mất |
| registered/active | new run with av_ | (rời màn) | 02 prefill ?alpha=&av= |

## 11. Fixture guide
- PY_CLEAN: mirror đủ 7 trường; 7 gate PASS (ms: 12·84·6·9·3·11·142).
- PY_MISSING_WARMUP: mirror warmup missing; gate 1 FAIL.
- PY_DUP_DIGEST: gate 3 FAIL message verbatim.
- Registry trước: av_0_2_1 (SUPERSEDED) · av_0_9_2 · av_0_9_3 (ACTIVE); sau register: + av_0_3_0 DRAFT (khớp chuỗi 02 Context fixture).

## 12. Integration tests
1. 14 register → "new run with this av_" → 02 Context: alpha + av_0_3_0 DRAFT hiện đúng, note vàng activate-before-publish.
2. 14 → 10: registry strip chip → band ?av=.
3. Digest av mới (sha256:88c1f2) khớp fixture 02 — import từ canonical.

## 13. Reviewer checklist
1. [ ] FE không đọc nội dung .py ngoài gửi file (grep parse client = 0).
2. [ ] Gate tuần tự đúng thứ tự server trả; SKIPPED sau FAIL; stagger tắt khi reduced-motion.
3. [ ] Fail-closed: mọi đường tới step 3 bị chặn khi có FAIL (kể cả URL step deep-link).
4. [ ] Copy diff §6 = 0; screenshot clean/failing ≤1%.
5. [ ] Single-file: input accept=".py" + multiple từ chối với copy §4-8.

## 14. Glossary
- contract mirror: bảng phản chiếu những gì parse được từ .py — người nộp thấy hệ đọc gì.
- fail-closed: một cổng đỏ dừng toàn bộ — không có "import tạm".
- maximal surface: parameter_space khai trong code — trần cho mọi sweep ở 02.
- DRAFT/ACTIVE/SUPERSEDED: vòng đời av_ trong registry (U14).

> End of spec 14 · v1.1 · pair with hi-fi `QuantBT 14 Alpha Import.dc.html`.
