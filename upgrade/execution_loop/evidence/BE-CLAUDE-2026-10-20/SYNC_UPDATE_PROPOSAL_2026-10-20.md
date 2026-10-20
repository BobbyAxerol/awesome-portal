# Đề xuất cập nhật `FRONTEND_BACKEND_SYNC.md` — Claude, 2026-10-20

**Trạng thái:** `PROPOSAL_FOR_CODEX_TO_PASTE` · R0 (Markdown). **Không sửa** `upgrade/execution_loop/FRONTEND_BACKEND_SYNC.md` hay `UNIFIED_IMPLEMENTATION_PLAN.md` (đang là WIP của Codex). Tài liệu này là nguồn dán.
Cơ sở: [ACK](ACK_ALL_BACKEND_2026-10-20.md) (pin `e1f3938e`), ledger [BE-P1…P10](.), consumer receipt trong `../UXM-07/` (`be-p2-p3`, `be-p5`, `manager`, `manager-dataset-port`, `self-access`, `self-navigation`, `be-p7`), `../UXM-08/README.md`, `../UXM-09/README.md`, Edge handback trong [Core009 priority handoff](../ELP2-10/CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md).
**Quy tắc dán:** (1) không xoá dòng lịch sử; chỉ đổi ô `Status` / thêm đoạn; (2) **dùng ID gốc**, request mới là hậu tố `#n` của ID cha (không phải ID mới); (3) mức gate: `SOURCE_ONLY / FIXTURE_VERIFIED / INSTALLED / CONNECTED_VERIFIED / OWNER_ACCEPTED`; lane: `FIXTURE_LAB / BFF_DOUBLE / REAL_READ_RETAINED / REAL_READ_QUALIFIED`; (4) chưa có `ACCEPTED` của Codex hay ACK của Bobby ở đâu cả — `consumer ACCEPTED` chỉ là bản ghi của consumer (Rules §10.3, §10.12.4).

## 1. Đoạn mới cho §0 "Nhật ký pin" (đặt trên cùng)

```
### Claude round — 2026-10-20 (all-backend ACK, after Codex 7818d563)

ACK handoff CLAUDE_ALL_BACKEND_HANDOFF_2026-10-20 (sha256 7da2f79a…): evidence/BE-CLAUDE-2026-10-20/ACK_ALL_BACKEND_2026-10-20.md.
Peer claude/fe-parity e1f3938e read (clean at start, 259 commits over Core 7818d563, not landed/pushed; ref later e8e5f571). BE-P1…P8 FIXTURE_VERIFIED
(contract + consumer fixture/double; hook R2/R3 and PostgreSQL specs NOT_RUN); BE-P9/P10 SOURCE_ONLY (fakes; image 7b2c7f34… predates them);
BE-P11…P13 being written, not assessed. Nothing is INSTALLED, CONNECTED_VERIFIED or OWNER_ACCEPTED. REAL_READ_RETAINED / REAL_READ_QUALIFIED NOT_RUN.
Core009: PREPARED_SOURCE_ONLY; Edge revision-2 three corrections ACCEPTED_WITH_CHANGES at source (BE-P10 Revision 3, new pins), PG/R3/image NOT_RUN.
Proposals (not edits): SYNC_UPDATE_PROPOSAL, UNIFIED_UPDATE_PROPOSAL, SOURCE_TRUTH_BOARD_PROPOSAL, REQUESTS_FOR_SOURCE_OWNERS (same folder).
```

## 2. §1 Hộp thư — thay các dòng ELP2-REQ (cột "Cần làm ngay?")

| ID | Nội dung ngắn | Cần làm ngay? (thay) |
| --- | --- | --- |
| ELP2-REQ-06-001 | named reads Score/Regime/Manager | Consumer: dataset + series + Fleet đã đọc (`FIXTURE_VERIFIED`, BFF_DOUBLE); thật NOT_RUN. Chưa có ACCEPTED của Codex |
| ELP2-REQ-08-001 | receipt vốn non-amount | UXM-09 fixture đã đọc (`ACCEPTED_FIXTURE_ONLY` đề xuất); không đóng được bằng fixture |
| ELP2-REQ-09-001 | map `ScopedRealtimeFrame` | UXM-08 slice + browser receipt `FIXTURE_LAB` 9/9 (`ACCEPTED_FIXTURE_ONLY` đề xuất); real-source chặn bởi `#A` (mục 5) |
| ELP2-REQ-10-001 | commissioning/coverage | UXM-10 fixture receipt 138/138 (FIXTURE_LAB/BFF_DOUBLE); **không** là G2/budget |
| ELP2-REQ-10-008 | unused identity finish | Core008 `INSTALLED`; identity COMMIT+Core ACK — không reissue. Mục `#1` mở: negative lost-issue-response chưa có connected |
| ELP2-REQ-10-009 | existing native READ/STREAM composition | `SOURCE_ONLY` (BE-P9/P10). Chi tiết mục 6 |

## 3. Ô `Status` thay thế cho các dòng OPEN (cột Status của §3, §3b, §6)

Mẫu ô: `SUPERSEDED: <giao hàng> · consumer <verdict> (<receipt>) · <gate> · <lane> · OPEN còn lại: …`. Mọi dòng dưới đây: Codex ACCEPTED = chưa.

| ID | Ô Status mới | Receipt trích dẫn |
| --- | --- | --- |
| FE-012 | SUPERSEDED: BE-P4 `current_stage` trong sort+group · consumer CONSUMED trên Fleet · `FIXTURE_VERIFIED` · `BFF_DOUBLE`. OPEN: đọc thật; Cockpit/Portfolios không có điều khiển để nối | manager-dataset-port §2, §7 |
| FE-013 | SUPERSEDED: BE-P4 series + BE-P8 `ratio_scale`/metric↔unit · consumer ACCEPTED (Overview, Portfolio 360, Compare, MeasureSeg) · `FIXTURE_VERIFIED` · `BFF_DOUBLE`. OPEN: nguồn `MISSING` → mọi profile `SERIES_SOURCE_NOT_PUBLISHED`; writer `precomputed_series` (xem 5, `ELP2-REQ-06-002#1`) | manager §9, §7; BE-P8 |
| FE-015, FE-060 | SUPERSEDED: BE-P5 batch + BE-P7 `CAPITAL_COMMAND` step-up (batch `v2`, `challenges[2]`) · consumer ACCEPTED (reader + model + port); cockpit mount PARTIAL · `FIXTURE_VERIFIED` · `BFF_DOUBLE`. OPEN: PG 2 test `elp2-access-transaction`; Q1–Q3 BE-P7 §7 | be-p7 §1, §2.1–2.2; BE-P7 §2 |
| FE-027 | SUPERSEDED một phần: BE-P4 `current_stage` published · consumer ACCEPTED. OPEN: `entered_at_ms`, `days_in_stage`, `gate_state` (`STAGE_ENTRY_TIME_NOT_PUBLISHED`; PM timeline §58.154) | manager §7; dataset-port §7 |
| FE-033 | SUPERSEDED: Codex `IN` + BE-P4 `comparison` · consumer ACCEPTED (Compare ALIGNED/INCOMPARABLE) · `FIXTURE_VERIFIED` · `BFF_DOUBLE`. OPEN: nguồn series | manager §7 |
| FE-037 | SUPERSEDED: BE-P7 `account_operations` (typed absence `COMMAND_FAMILY_NOT_COMMISSIONED`); token `execution.accounts.manage` đã gỡ ở FE · `FIXTURE_VERIFIED` · `BFF_DOUBLE`. OPEN: OWNER_DECISION (Codex/Bobby xác nhận bỏ token) | be-p7 §2.5; BE-P7 §3 |
| FE-038 | SUPERSEDED: BE-P7 `/self-context` + route `/administration/my-access` · consumer ACCEPTED (route + rail entry) · `FIXTURE_VERIFIED`. OPEN: registry rev 7 (`#1`) | be-p7 §2.4, §6 |
| FE-057 | SUPERSEDED: Codex timestamps + BE-P7 `/self-context` · consumer ACCEPTED (W1 hook, W3 shell, context reader) · `FIXTURE_VERIFIED` · `BFF_DOUBLE`. OPEN: đọc thật; `#2` | self-access; self-navigation §6; be-p7 §2.3 |
| FE-058 | SUPERSEDED: BE-P7 · consumer ACCEPTED (rail entry; token dropped). OPEN: `#2` quyết định màn đọc cap gộp | be-p7 §1 |
| FE-059 | SUPERSEDED: BE-P5 batch → BE-P7 v2 · reader ACCEPTED; chưa màn nào render hàng loạt | be-p5 §4.2; be-p7 §2.1 |
| FE-062 | SUPERSEDED: BE-P5 `GET /pending-recalls` · consumer ACCEPTED (dock) · `FIXTURE_VERIFIED` · `FIXTURE_LAB`. OPEN: `#1` `#2` `#3` | be-p5 §3 |
| FE-063 | SUPERSEDED: BE-P5 `recipient_account_id` · consumer ACCEPTED (reader) · `FIXTURE_VERIFIED` · `FIXTURE_LAB` | be-p5 §2 |
| FE-065 | OPEN → **chuyển thành request cho PM** (BE-P8 §3): Portal không thu hẹp; xem `REQUESTS_FOR_SOURCE_OWNERS` SRC-C | BE-P8 §3 |
| FE-066 | SUPERSEDED: BE-P3 5 key identity · consumer ACCEPTED (thân V1 bốn màn stage) · `FIXTURE_VERIFIED` · `FIXTURE_LAB`. OPEN: SCOPED_V2 (`#R2`), nguồn tên alpha (`#R4`) | be-p2-p3 §2–3 |
| FE-067 | SUPERSEDED: BE-P2 `stage_facts` · consumer ACCEPTED (thân V1) · `FIXTURE_VERIFIED` · `FIXTURE_LAB`. OPEN: SCOPED_V2 (`#R1`); `runtime_state`/sessions/finding_type chưa có nguồn | be-p2-p3 §2 |
| FE-068 | SUPERSEDED: BE-P5 stage-action eligibility + BE-P7 một predicate · consumer ACCEPTED (readers; 9/10 action có điều khiển). OPEN: `#2` `#3` | be-p5 §4.1; be-p7 §2.6 |
| FE-069 | SUPERSEDED: BE-P5 lookup + run list · consumer ACCEPTED · `FIXTURE_VERIFIED` · `FIXTURE_LAB`. OPEN: copy (Bobby) | be-p5 §5 |
| FE-070 | SUPERSEDED một phần: BE-P2 contract + mapping · consumer ACCEPTED. OPEN: nguồn lịch (`N28_VENUE_CALENDAR_NOT_ACTIVE`) | be-p2-p3 §2 |
| FE-071, FE-072 | SUPERSEDED: BE-P2 · consumer ACCEPTED (thân V1) · `FIXTURE_VERIFIED` · `FIXTURE_LAB`. OPEN: SCOPED_V2 (`#R1`); nguồn từng fact (Board proposal) | be-p2-p3 §2 |
| S3-U1 | **giữ OPEN** (route flag-off, passthrough POST, không qualified); Codex qualify hoặc retire; không bật để né Paper payload | BE-P3 §S3-U1 |
| S3-U2 | SUPERSEDED: BE-P3 4 schema + fixture legacy · consumer ACCEPTED · double e2e sửa 7 probe · `FIXTURE_VERIFIED` · `BFF_DOUBLE`. OPEN: `#R3` (FE) | be-p2-p3 §2, §3 |
| S3-U3, S3-U4, S3-U5 | SUPERSEDED: BE-P3 · consumer ACCEPTED (U3 reader-level, chưa màn; U4 quantity; U5 như FE-066). OPEN: U4 notional (E5, OWNER_DECISION) | be-p2-p3 §2 |
| MD-1…MD-8 (đoạn §6) | MD-1,2,3,6,7,8: SUPERSEDED BE-P1 (producer-only phần JSON Schema không nói được); MD-4: delivered, chờ Codex ACCEPTED (đổi hành vi producer); **MD-5: SUPERSEDED BE-P6 canonical zero khi emit** (Bobby chọn C), oracle FE đã lật · `FIXTURE_VERIFIED` · `FIXTURE_LAB` | manager §1, §7; BE-P1; BE-P6 |
| FE-049, FE-056, FE-061 | giữ `CLAUDE_DELIVERED`, chờ Codex review (không đổi) | priority-requests §5 |

## 4. Request mới = hậu tố `#n` của ID gốc (chưa gửi Codex; owner/done-when)

| Khoá | Cha | Cần gì | Owner | Done-when | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| FE-038#1 | FE-038 | registry rev 7: feature `PROFILE_ACCESS_SELF` (route `/administration/my-access`, `permissions: []`, hiển thị theo projection); JSON đề xuất ở be-p7 §6 | Codex | registry có entry; FE bỏ `withSelfEntry` mượn feature | OPEN |
| FE-057#1 | FE-057 | quy tắc workspace mặc định khi nhiều membership (hint grant-record vs lưu lựa chọn) — BE-P7 Q5 | Codex | chốt quy tắc | OPEN (đề xuất BE-P7) |
| FE-057#2 | FE-057 | có fetch khi `focus` không (mặc định: chỉ kiểm hết hạn) — self-navigation §7.4 | Codex | trả lời + tần suất tối đa | OPEN |
| FE-057#3 | FE-057 | `default_workspace.UNAVAILABLE` + `self_entry.permission ALLOWED` nên để entry `UNAVAILABLE`? (be-p7 §5) | Codex | schema nói rõ | OPEN |
| FE-058#2 | FE-058 | màn đọc cap đã gộp từ shell hay chỉ server từ chối (guard `execution.*` cục bộ vẫn chặn sau rail) — self-navigation §7.6 | Codex + FE writers | một quy tắc chung | OPEN |
| FE-057#4 | FE-057 | duyệt copy hết hạn "…Retry to check again." và "Checking again." + các câu mới step-up/chooser (be-p7 §3; 3 câu capture đã duyệt ở `e8e5f571`) | Bobby | duyệt hoặc đổi | OPEN |
| FE-068#2 | FE-068 | wording hợp đồng: mô tả `StageActionEligibilityRow` ("three live routes"); "11 action" vs 10; copy `ADMIN_ROLE_REQUIRED` ("role" ≠ "grant") — be-p5 §6.3 | Codex / Bobby | sửa mô tả hợp đồng. **Copy 3 câu capture đã được Bobby duyệt 2026-10-20 (commit `e8e5f571`)**: "Needs the Admin role", "The grant does not cover this deployment", "The paper projection is not authorised for this capture" | OPEN (chỉ phần wording hợp đồng) |
| FE-068#3 | FE-068 | `paper.exit_review_request`: control V2 chưa có; reader đã sẵn — be-p5 §8.1 | FE (Claude) | control đọc `stageActionReason` | OPEN (FE) |
| FE-060#2 | FE-060 | cockpit `laneModel` nhận `challenges[]`; mount step-up khi có target vốn — be-p5 §8.2, be-p7 §2.2 | FE (Claude) | màn test `REQUIRED/ACTIVE/PLAN_DEPENDENT` | OPEN (FE) |
| FE-015#1 | FE-015 | BE-P7 Q1 (`proof_family` cột vs tiền tố `stpcap_`), Q2 (TTL riêng), Q3 (proof ACCESS_ADMIN thoả lệnh vốn?) | Codex | trả lời; nếu cột → ai giữ migration `1723680000146` | OPEN |
| FE-062#1 | FE-062 | prefill `expected_versions` từ discovery — cần form pending-control (FE chưa có) | FE | form + test | OPEN (FE) |
| FE-062#2 | FE-062 | discovery lần đầu cho recall chưa từng qua Portal: PM remainder-read đã qualify + 5 CAS + tương quan lệnh gốc (`RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED`) | PM / Edge | read có receipt | OPEN |
| FE-062#3 | FE-062 | `original_recall_id` = PM `command_id`? (BE-P5 Q2) | PM / Codex | xác nhận | OPEN |
| FE-027#1 | FE-027 | `entered_at_ms`, `days_in_stage`, `gate_state`, ordered transitions: stage timeline PM §58.154 hoặc effective-stage journal | PM / Edge | publish + thêm scalar INTEGER vào sort enum (BE-P4 §5) | OPEN |
| FE-033#1 | FE-033 | tài liệu hoá hoặc bỏ `WINDOW_MISMATCH`/`UNIT_MIXED` (không thể xảy ra trong body hợp lệ); subject `ALPHA`/`DEPLOYMENT` có cần không (BE-P4 Q c) | Codex | quyết định | OPEN |
| FE-013#1 | FE-013 | Codex ACCEPTED: tập `ratio_scale` (FRACTION, PERCENT), không bump `schema_version`, `RATIO_SCALE_MIXED`; BE-P8 §3–4 | Codex | ACCEPTED/CHANGES_REQUESTED | OPEN |
| ELP2-REQ-06-002#1 | ELP2-REQ-06-002 | writer `precomputed_series` + 12 đầu vào (population, window, basis, currency, quality, methodology, cashflow/economic revision, FX, cost/funding, denominator, dedup, lineage) | Core / PM / Edge | 5 đầu vào đầu có chủ → writer; `REAL_READ_QUALIFIED` | OPEN (SRC-F) |
| FE-066#R2 | FE-066 | alpha_id/portfolio_name trên thân SCOPED_V2 (field purpose mới) — be-p2-p3 §3 R-2 | Codex | field cho phép + fixture | OPEN |
| FE-067#R1 | FE-067 | `stage_facts` (+ Canary compliance) trên thân SCOPED_V2 (v3 hoặc field purpose) — R-1; cũng là FE-071/072 | Codex | v3 + fixture; FE thêm reader chặt | OPEN |
| FE-066#R4 | FE-066 | nguồn tên alpha: `name` trên `strategies`/`alphas` hoặc tương đương Execution↔Research — R-4, BE-P3 | Codex / Bobby | quyết định | OPEN |
| S3-U2#R3 | S3-U2 | Alpha screen đọc `alpha-resource.v2`/`subject-records.v2` | FE (Claude) | reader dispatch theo `schema_version` | OPEN (FE) |
| FE-070#1 | FE-070 | nguồn lịch phiên (data-layer calendar, holiday, ATO/ATC) | DL / Codex | `N28_VENUE_CALENDAR_NOT_ACTIVE` hết | OPEN |
| FE-067#2, FE-071#1, FE-072#1 | FE-067/071/072 | nguồn từng fact: `runtime_state`+since, binding `manager.sessions/reconciliation`, `finding_type`, base risk limits, daily loss, flatten/drill, broker side, equity, series, gap window — bảng ở [Board proposal §3](SOURCE_TRUTH_BOARD_PROPOSAL_2026-10-20.md) | Codex / TS / PM / DL | từng mã `*_NOT_PUBLISHED` có chủ | OPEN |

### UXM-08 (alias `UXM08-REQ-x` → ID cha `ELP2-REQ-09-001`)

| Khoá | Locator (rút gọn) | Done-when | Chặn real-source? |
| --- | --- | --- | --- |
| ELP2-REQ-09-001#A | `execution-scoped-realtime.d.ts` `paths`/`operations = Record<string, never>` | operationId cho snapshot `alpha_fleet_overview` (+ stream hoặc "không có stream"); 4 số (heartbeat, im lặng tối đa, cửa sổ gộp, ngân sách reconnect) hoặc "FE tự chọn, trần server là X" | **Có, cứng** |
| #B | `ScopedRealtimeFrame` 10 key, không có dataset | trường `dataset` + fixture âm; hoặc ghi "một connection/một dataset" | Có điều kiện (>1 dataset/connection) |
| #C | `NativeProfileRealtimeHeaders`, `projection_generation`, `Quality.source_set_ref` | snapshot mang generation + source set baseline | Có (an toàn) |
| #D | `failClosed.test.ts:111` `DESCRIPTIVE` | dòng `reconnect_required` kèm lý do — chủ gate | Không |
| #E | `SOURCE_TRUTH_BOARD.md` | hàng "Scoped realtime `alpha_fleet_overview`" (xem Board proposal hàng 19) | Không (nhưng cần theo §10.12.3) |
| #F | `execution-manager-scoped.synthetic.valid.json` `cases[0..1]` | ca ≥2 portfolio, ≥2 env (live+paper), 2 currency, account dùng chung, `has_more=true`, 1 researcher | Không (chặn chứng minh F02/F04/F05/F19) |

### UXM-09 (khoá `UXM09-x` → cha)

| Khoá | Cha | Cần gì | Owner |
| --- | --- | --- | --- |
| FE-020#a | FE-020 | F0 apply: publish body thành công/ACCEPTED hay xác nhận chỉ `RelayDenied`; cost/impact có đơn vị hoặc "không có" | Codex + PM |
| FE-020#b | FE-020 | idempotency key của F0 apply (hiện route theo `operation_id`; key Portal `command_apply:<uuid>` do fake port mô phỏng) | Codex |
| FE-032#1 | FE-032 | lý do source reject typed; bit `replayed` trên `CommandStatus`; venue `PARTIALLY_FILLED` + số lượng; tra theo idempotency key | Codex + PM |
| FE-015#2 | FE-015 | per-operation: capability + grant cần để bật, `reason_class` | Codex |
| FE-037#2 | FE-037 | tên grant gửi lệnh (FE giữ "provisional") | Codex / Bobby |
| FE-034#1 | FE-034 | archive/monitor/reactivate (5 hàng "Requires separate certification") | Codex + PM + Research |
| ELP2-REQ-04-010#1 | ELP2-REQ-04-010 | catalogue: server gắn `classification` vào mọi entry và `scope.capability_state=PARTIAL`, schema ghi hằng `DISABLED` (§6c UXM-09) → giữ DISABLED hoặc nới schema; thêm fixture có `classification` | Codex |

## 5. Edge handback (Core009) — đoạn dán vào §0 và các khoá

```
Edge revision-2 CHANGES_REQUESTED on BE-P10 (FE0deeee70) — three items, ACCEPTED_WITH_CHANGES at SOURCE_ONLY:
 1 exact-session token cleanup  b70f8f77  research-acceptance-session.ts sha256 6a4ed7dc…1eb3
 2 verified bounded token write  4b2b76e0  be-p10-acceptance-session.spec 63/63
 3 offline --dry-run before Pool/schema/compose  81e8a546  execution-native-session.ts sha256 fa353d33…0257, spec 23/23
Ledger ingress a0e545e9; runbook rev 2 in place sha256 bd9c908b…cb35e. PG, normal R3, image build, runtime: NOT_RUN.
Edge sources referenced: e2f337a4 (runner), e37a5e39, 6e8f7f2d (official-session binding), e766034c (published runner 3bbc4417+e766034c); PREPARED, not INSTALLED, not CONNECTED.
```

| Khoá | Cha | Nội dung | Owner | Trạng thái |
| --- | --- | --- | --- | --- |
| ELP2-REQ-10-009#1 | 10-009 | ba điều chỉnh của Edge (trên) | Claude (BE-P10 Rev 3; BE-P11 theo brief) | `SOURCE_ONLY` |
| #2 | 10-009 | disposable-PG `be-p10-manager-revoke-pg.spec.ts`, ordinary R3 trên composition cuối, build image | Claude / Codex | NOT_RUN |
| #3 | 10-009 | đầu vào Edge: seals catalogue/profile/field-policy, pin quan sát mới, trust gia hạn (trust ứng viên hết 2026-10-20T08:00:59Z UTC, tức đã qua nếu chưa gia hạn), `approval_ref` (Bobby), cửa sổ hữu hạn | Edge / PM / Bobby | `NOT_PROVIDED` |
| #4 | 10-009 | STREAM route reachability từ process đang chạy; chu kỳ poll của stream coordinator (BE-P10 Q4, Q5) | Codex | OPEN |
| #5 | 10-009 | phân phối token file cho harness Edge (UID 0600; đường dẫn, không giá trị) — BE-P10 Q6 | Codex / Edge | OPEN |
| ELP2-REQ-10-008#1 | 10-008 | negative lost-issue-response connected: không giả attempt/receipt, không reissue identity | Edge / Core | NOT_RUN |

## 6. Đoạn thay cho cuối §6 "Trạng thái nhất quán"

```
FE-057, 058, 059, 060, 062, 063, 066, 067, 068, 069, 070, 071, 072, S3-U2..U5: DELIVERED (BE-P2/P3/P5/P7) -> consumer ACCEPTED, FIXTURE_VERIFIED,
FIXTURE_LAB / BFF_DOUBLE, Codex ACCEPTED not yet. FE-065: request to PM (not a Portal narrowing). FE-064 still blank on purpose.
FE-061, 056, 049: CLAUDE_DELIVERED, waiting Codex review. S3-U1: OPEN. MD-1..8: BE-P1/P6, MD-4 waiting Codex ACCEPTED.
```
