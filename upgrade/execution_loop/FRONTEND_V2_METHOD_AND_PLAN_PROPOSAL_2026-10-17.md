# Execution Loop V2 — phương pháp frontend, kế hoạch và request backend (ĐỀ XUẤT, chờ Bobby duyệt)

Ngày 2026-10-17 · tác giả Claude (frontend lead) · trạng thái **PROPOSED — chưa có gì được thực hiện**.
Không đổi UI, không đổi backend, không deploy. Quy tắc đề xuất nằm ở
[AGENT_WORKING_RULES.md §9](AGENT_WORKING_RULES.md#9-frontend-v2--quy-tắc-thiết-kế-trước-khi-có-hifi-proposed-chờ-bobby-duyệt);
file này là phần phân tích, kế hoạch và request.

Viết cho: Bobby (duyệt), Codex (nhận request), và chính Claude ở các lượt sau.

---

## 0. Đã đọc gì, chưa đọc gì (trung thực)

Câu hỏi "đã đọc hết chưa": **lần trước chưa**; lượt này đọc như sau.

| Phần | Cách đọc | Mức |
| --- | --- | --- |
| UX guide v1.1 (533 dòng), AGENT_WORKING_RULES (326), README, REVIEW_DECISIONS (197) | Tôi đọc toàn bộ | Đầy đủ |
| Backend guide v1.2 (1665 dòng) | Tôi đọc toàn bộ | Đầy đủ |
| Hai ảnh lowfi | Tôi xem trực tiếp | Đầy đủ |
| Handoff ELP2-00, 06, 07, 08 | Tôi đọc toàn bộ | Đầy đủ |
| Score spec (1654 dòng) + feasibility | Agent đọc từng dòng, trả digest có locator | Qua digest |
| Edge guide (1405), ELP2-09, ELP2-10 | Agent đọc từng dòng; riêng `commissioning-followthrough.md` (1959 dòng) chỉ đọc đầu, cuối, grep | Qua digest, một file chưa đọc hết |
| Packet ELP2-01…05 | Agent đọc toàn bộ markdown; JSON route census chỉ đọc cấu trúc | Qua digest |
| Code/contract của 26 commit (348 file, ≈125.000 dòng) | Agent khảo sát route, contract, fixture, flag; **không ai đọc từng dòng** | Khảo sát, không phải đọc hết |
| Frontend hiện hữu | Agent khảo sát 92 lần đọc file | Khảo sát |

Tôi đã tự kiểm lại các điểm quyết định trong code: `apps/control-api/src/main.ts` boot không kèm dependency;
`manager-model.service.ts` trả 503 `EXECUTION_READ_PUBLICATION_NOT_QUALIFIED` khi chưa có document
`SOURCE_VERIFIED`; field allowlist ở `manager-model.contract.ts:12-19`. Các chi tiết còn lại là lời agent,
đã ghi locator ở các mục dưới để kiểm lại khi cần.

**Cây `/home/bobby/portal-research` đang có 70 thay đổi staged chưa commit (ELP2-04/06/07/08 đang làm dở của Codex).**
Một số contract (Regime publication, thêm case workflow) chỉ có ở đó, không có trong 26 commit. Xem §7.

---

## 1. Backend đã viết lại guide thành gì (hiện trạng thật)

### 1.1 Sự thật quan trọng nhất

**Chưa có dữ liệu V2 thật nào để frontend nối vào.** Cả ba tầng cùng nói vậy:

1. Contract/route tồn tại và được mount, nhưng control-api boot không có trust, không có Manager runtime
   (`main.ts` gọi `createControlApiApp(config, pool)` không dependency). Sáu route Manager luôn trả 503 cho tới khi
   có publication đạt chuẩn.
2. Cả 42 logical family trong catalogue đều `UNAVAILABLE / NEW_EDGE_V1_EXPORT_NOT_QUALIFIED`, `enabled_environments=[]`.
3. Preview đang chạy là retained build `045788b1`; sáu operation Manager trả 404 ở đó. Dữ liệu `TEST_ONLY` bị
   service từ chối phục vụ theo thiết kế.

Hệ quả: **V2 hiện chỉ làm được ở làn "thiết kế + fixture"**. Làn "đọc thật" mở theo từng endpoint khi Codex/TS/Edge
đạt chuẩn nguồn (ELP2-REQ-05-001, 06-002, 07-001, 00-004, 00-005 còn OPEN). Mọi receipt trình duyệt phải ghi rõ làn nào.

### 1.2 Bảng: guide yêu cầu → backend đã giao → frontend phải làm gì

| Yêu cầu trong guide | Backend đã giao | Mount? | Hệ quả cho UI |
| --- | --- | --- | --- |
| Fund Overview, Fleet, Portfolio/Alpha/Account/Deployment 360 | Sáu `GET /api/v1/execution/manager/{fund-overview,fleet,portfolios/{id}/overview,alphas/{id}/overview,accounts/{id}/overview,deployments/{id}/overview}`; schema `portal.execution.manager-dataset.v1`; types `execution-manager-models.d.ts`; 4 fixture synthetic | Mount, luôn 503 mặc định | Dựng UI bằng generated types + fixture; không có bằng chứng đọc thật |
| `environment` | **Bắt buộc**, đúng một giá trị `paper\|sandbox\|live`; **không có ALL** | — | Mỗi màn manager là một environment-partition. "All" chỉ là điều hướng, không thể cộng tiền (xem §1.3) |
| Row grain `alpha × version × portfolio` | Đúng grain này, kèm `children[]` (deployment/account/stage/binding) | — | Expandable row là bắt buộc, không phải trang trí |
| Sort / filter / group server-side | 16 scalar (9 TEXT, 7 DECIMAL); filter op `EQ\|GTE\|LTE\|IS_NULL` (≤16); sort ≤3 key, null cuối cả hai chiều; `group_by` ≤2 trên 8 key; `limit` 1–200; cursor ký; 1 MiB. Field tiền cần `economic_partition` | — | Cột/bộ lọc UI chỉ được dựng trên allowlist này. **Không có** `search`, `window`, `currency` thành param riêng |
| Initial / Added Funds (lowfi ảnh 1) | `capital_statements[]` theo partition: `initial_funds, added_funds, returned_capital, current_nav, realized/unrealized_pnl, actual/pending_fees, …`; `funding_bucket_pnl` **luôn null** (`LOT_ATTRIBUTION_METHOD_NOT_APPROVED`) | — | Xem §1.3: bố cục lowfi phải đổi |
| QBTS / score | `scores{raw, composition, direct_nav, regime}` + `score_details[]`; **mọi score hiện `policy_pending`, value null**; band, P/R/B, bounds nằm trong publication | — | Phải render typed-pending thành một state thiết kế đàng hoàng, không được là chỗ trống |
| Equity 30D | Chỉ scalar `equity_30d_end_value` và `return_30d_pct`; **không có chuỗi điểm** trong manager dataset | — | Sparkline cần nguồn khác (route `alphas/equity-sparklines` hiện có, key theo alpha, FE đang hard-code env paper) — xem request R-04 |
| Chart hiệu suất cấp quỹ/portfolio | `/views/equity-chart` chỉ có subject `alpha\|deployment\|account\|portfolio`; **không có root/fund** | Mount | M01 không có nguồn chuỗi. Xem R-01 |
| Realtime | `ScopedRealtimeFrame` **chỉ thông báo** (`NOTIFICATION_ONLY`), 5 loại frame; **không có route** (paths rỗng); user đã lên V2 thì SSE cũ trả 503 | Không mount | UI = làm mới có kiểm soát (refetch), không áp delta; trạng thái "không stream" là mặc định |
| Lệnh vốn | 4 route `capital-commands` (preview/submit/status/reconcile), 8 operation; mặc định `COMMAND_RELAY_NOT_QUALIFIED` | Mount, dark | Chỉ dựng được preview-bị-khóa và receipt đa chiều bằng fixture |
| Quyền / profile | 8 route `/api/admin/profile-access/v2/*` + `/api/auth/profile`; 56 action; selector 4 loại | Mount, trust chưa qualified | M10 dựng được bằng fixture; `grants[].current` **không phải quyền bấm nút** |
| Archive / paper monitor (M08) | **Không có route đọc nào**. Chỉ có schema `ArchiveDisposition`/`WorkflowLifecycle` (hàm thuần) | Không | M08 chỉ làm được lowfi + state; cần request R-05 |
| Saved views | **Không có**. `WorkflowNavigation.saved_view_grants_access:false`, chỉ có `query_revision` | Không | Saved view = quyết định thiết kế + backend (R-07) |
| Export | **Không có route**; `report.export` chỉ là capability name | Không | Không đưa nút export vào V2 giai đoạn đầu |
| Researcher slice | Field policy `PENDING`; không field nào visible cho researcher | — | Không thiết kế số liệu cho researcher; chỉ shell + typed absence (cần Bobby duyệt ma trận) |

### 1.3 Hai điều hai ảnh lowfi không thể giữ nguyên

**Ảnh 1 (Overview).** Bảng 10 hàng × 2 cột (Initial / Added Funds):
- Backend xác nhận Initial/Added là **dòng tiền**, không phải hai track record; không có lãi lỗ, %, drawdown, score theo cột.
  Phần lớn 18 ô của hai cột sẽ là "không có phương pháp" — một bảng gần như toàn N/A không phải thiết kế tốt.
- Đề xuất: bảng chính một cột giá trị (Current NAV, Net PnL, Realized/Unrealized, Return %, Current DD, Max DD,
  PortfolioScore, AlphaScore) + một khối **Capital** riêng (Initial, Added, Returned, Net contributed) +
  chart PnL. Cột Initial/Added chỉ xuất hiện trong khối Capital, nơi nó có nghĩa. Bobby cần duyệt thay đổi này.

**Ảnh 2 (Fleet, tab All/Live/Canary/Sandbox).**
- Backend: một lần gọi = một environment; Canary không phải environment (là stage thuộc profile live).
  Tab "All" **không thể có cột tiền chung**. "All" chỉ hợp lệ như danh sách điều hướng; tiền luôn theo một partition.
- Đề xuất: hàng đầu chọn **partition kinh tế** (Live/Canary chung tiền thật; Sandbox; Paper — tách), `All stages`
  là lọc hiển thị stage-presence; cột tiền luôn ghi partition. Cần Bobby chốt ngữ nghĩa tab "All".

---

## 2. Frontend hiện hữu: có gì, thiếu gì (từ khảo sát code)

**Giữ/tái dùng tốt:** `PanelState` + các trạng thái loading/empty/partial/stale/denied/unavailable; badge/chip
(`StatusChip`, `SourceFreshness`, `FreshnessIndicator`…); `ExecutionDecisionBar` (đã sửa lượt trước);
`formatExactMoney`/`Published`/`capPreserving` (null không bao giờ thành 0); `ChoiceMenu`/`Segmented`;
`KeysetTable` (có ảo hóa, `totalCount`/`filteredCount`); `PrimusFinancialChart` (server re-query theo preset,
caption downsample giữ cực trị); correlation matrix (mẫu a11y tốt nhất); lab `/execution/_fixtures` + BFF double.

**Thiếu so với guide (quan trọng nhất):**

1. **Không có khái niệm score nào** (QBTS, AlphaScore, PortfolioScore, regime, NAV/manager scope): `grep` rỗng.
2. **Fleet lọc phía client** trên trang đã tải (venue/owner là `<select>` lọc cục bộ); chỉ chip stage đi lên server;
   không UI nào gửi `sort`; state là `useState`, không URL; grain row chỉ `alphaId`; sparkline hard-code env `paper`.
3. **Không có global context** (window/currency/economic domain); workspace trên topbar là chữ tĩnh.
4. **Không có saved view, column chooser, sort header, `aria-sort`, group-by UI**; `KeysetTable` chỉ hiển thị
   `appliedSort` ở footer.
5. **Dialog/drawer không modal** (`role=dialog`/focus trap chỉ có ở popover Retained).
6. **Chart**: một series/chart, marker chỉ là mốc thời gian (không có ngữ nghĩa nạp/rút), tooltip DOM không rõ
   bàn phím/cảm ứng, sparkline `aria-hidden` (guide §15 đòi text alternative), heatmap không có legend,
   không có chart cấp quỹ.
7. **Typography**: gate `typeRoles.test.ts` chỉ bắt `font-family/font-size` nên ≈501 khai báo `font:` literal
   (9–11px mono) lọt qua — vì vậy các màn hi-fi cũ nhỏ chữ.
8. **Không màn nào kiểm 660px** cho Execution (chỉ Research); lab chỉ có 1280/1728, journeys 1440.
9. **Nav thiếu** Overview manager-first, Archived Alphas, Operations & Decisions; chưa rõ M01 ở `/` hay `/execution`.
10. **Sơ đồ hai theme**: Governance sáng, Execution tối carbon — quyết định theme cho V2 cần Bobby.

Phân loại M01…M10: **NEW** M01, M02, M08 · **REFINE** M03, M04, M05, M06, M09, M10 · **PRESERVE** M07
(chi tiết ở khảo sát; bảng đầy đủ nằm trong mục 2 của rules §9.7).

---

## 3. Làm frontend khi chưa có HiFi: dựa trên quy tắc gì

Ý chính: thay HiFi bằng **chuỗi cổng có bằng chứng**, mỗi cổng một sản phẩm kiểm được. Toàn văn quy tắc ở
[rules §9](AGENT_WORKING_RULES.md#9-frontend-v2--quy-tắc-thiết-kế-trước-khi-có-hifi-proposed-chờ-bobby-duyệt).
Tóm tắt:

```
G0 pins → G1 Screen Spec Card → G2 Wireframe (Bobby duyệt) → G3 State+field matrix
      → G4 Build ở lab bằng generated types + fixture → G5 Browser receipt so wireframe (1280/660)
      → G6 Đọc thật (chỉ khi nguồn đạt chuẩn) → G7 Đóng (hồ sơ + Scale-refine)
```

- **Wireframe thay HiFi**: xám, dùng token/type-role hiện có, một file HTML/CSS mỗi màn ở 1280 và 660,
  kèm state matrix. Bobby duyệt wireframe theo nhóm màn trước khi viết component.
- **Nguồn field**: guide → generated type → fixture canonical. Không field nào không truy được về contract.
- **Một component duy nhất render metric** (value/unit/availability/reason/confidence), để số không bao giờ bị format ở nơi khác.
- **Làn bằng chứng ghi trên mọi receipt**: `FIXTURE_LAB` / `BFF_DOUBLE` / `REAL_READ_RETAINED` / `REAL_READ_QUALIFIED`.
- **Reuse trước, đề xuất mới có lý do**; chart/component V1 kém → ghi đề xuất cho Bobby (§5), không tự thay.

---

## 4. Kế hoạch: phase, thứ tự, và việc cần Bobby

Bám UXM-00…10; không phase nào tự chạy (rules §7). Đề xuất chia gói để duyệt từng phần:

| Gói | Nội dung | Sản phẩm | Cần ai | Điều kiện bắt đầu |
| --- | --- | --- | --- | --- |
| A | **UXM-00** audit trình duyệt preview retained + reuse map + route/deep-link inventory; ghi rõ không audit được V2 thật | Packet `evidence/UXM-00/` + bảng giữ/đổi/thêm | Bobby giao | Có ngay (đọc, không đổi gì) |
| B | **UXM-01/02** IA, metric dictionary (field → grain/unit/availability/copy key), role journeys, state inventory | Dictionary + Screen Spec Card M01–M10 | Bobby duyệt IA | Sau A |
| C | **UXM-03/04** wireframe M01/M02/M04 (Overview, Portfolios), M03/M05/M06/M07 (Fleet + 360) | Wireframe HTML 1280/660 + state matrix | **Bobby duyệt từng nhóm** | Sau B |
| D | **UXM-05** score/regime/archive, M08, M09/M10 wireframe | Wireframe + copy | Bobby duyệt | Song song C khi IA khóa |
| E | **UXM-06/07** hoàn thiện thiết kế + dựng component ở lab bằng fixture | Component + lab group + baseline mới (chỉ nhóm mới) | Bobby giao | Wireframe đã duyệt |
| F | **UXM-08** nối đọc thật | Receipt có source/bundle/API pin | Codex qualify nguồn + Bobby | Từng endpoint qualified |
| G | **UXM-09/10** lệnh, acceptance | — | Codex 07 qualified | Sau F |

Gợi ý nguồn lực: A–D (đọc nhiều, thiết kế, nhiều ràng buộc chồng) là chỗ **effort cao/model mạnh** đáng giá;
E (dựng theo wireframe đã duyệt) làm ở effort thường. Quyết định của Bobby.

### Việc không cần chờ Codex (Claude làm được ngay khi được giao)
UXM-00, 01, 02, 03–05 wireframe, E (fixture/lab). Tất cả chỉ cần generated types và fixture đã có.

### Việc bị chặn bởi Codex/nguồn
Mọi thứ ở F, G; các request R-01…R-10 (§6) ảnh hưởng lúc nối thật, không chặn wireframe.

---

## 5. Gợi ý chart/component V1 chưa tốt (đề xuất, chưa làm)

| # | Hiện trạng V1 | Đề xuất V2 | Cần backend? |
| --- | --- | --- | --- |
| 1 | Equity chart một series; marker chỉ là mốc thời gian | Chart cấp quỹ/portfolio: chọn partition (một đường mỗi lần), nạp/rút là **marker riêng, không tính lãi**; preset 7D/30D/90D/ALL ghi cửa sổ rõ; không dual-axis (guide §15) | Có — R-01 |
| 2 | Tooltip DOM, bàn phím/cảm ứng không rõ | Con trỏ + phím mũi tên đọc từng điểm; nút "Table view" (đã có) thành mặc định cho a11y; `role=img` + mô tả | Không |
| 3 | Sparkline `aria-hidden` | `aria-label` "start → end, change, window, coverage"; trạng thái "no series" có lý do; không sort theo sparkline (sort theo scalar `equity_30d_end_value`/`return_30d_pct`) | R-04 (batch series theo row) |
| 4 | Không có timeline xuyên stage | **Stage timeline bar**: Paper → Sandbox → Canary → Live, đoạn actual tô đậm, ghi `actual_duration` bên cạnh score (guide §9.1) | Có — dữ liệu stage history |
| 5 | Không có hiển thị score | **P/R/B ba thanh + total + band chip**, click mở drawer sáu thành phần nguyên tử; contribution khác ngôn ngữ thị giác (pts, không màu band); "Sơ bộ" là pill, không làm mờ số | Không (fixture), thật khi publish |
| 6 | Heatmap không legend | Thêm legend + giá trị null là lỗ có chú thích | Không |
| 7 | Bảng list không sort/group/chọn cột | Header sort có `aria-sort`, chip bộ lọc xóa từng cái/tất cả, column chooser, group header, URL-state | Không (allowlist đã có) |

Mọi thay đổi chart đi qua wireframe + Bobby duyệt; không đổi token chung.

---

## 6. Request backend mới cho Codex (đề xuất; Codex quyết schema)

ID dự kiến `ELP2-REQ-FE-nnn`, owner/lifecycle theo rules §7.3. Mỗi request có locator, UI bị chặn, done-when.

| ID | Cần gì | Vì sao UI cần | UI bị chặn | Done-when |
| --- | --- | --- | --- | --- |
| R-01 | **Chuỗi thời gian manager-scope** (fund/portfolio/alpha): equity, net PnL, return; mỗi điểm theo partition; marker dòng tiền riêng; metadata downsample (giữ cực trị, bucket); cửa sổ tường minh | `/views/equity-chart` không có subject root/fund; manager dataset chỉ có scalar | M01 chart, M04 | Schema + fixture + type; partition và flow marker tách |
| R-02 | **Portfolios Directory** (M02): list portfolio với metrics/score/health/group/sort, hoặc xác nhận `fleet group_by=portfolio_id` đủ (và nêu cột thiếu) | Contract nói "directory cần refine"; hiện chỉ có `listPortfolios` nhẹ | M02 | Quyết định + contract |
| R-03 | **Điều hướng đa-environment ("All")**: hoặc endpoint union trả hàng + tham chiếu partition, hoặc xác nhận FE gọi 3 lần và ghép; nêu cursor/đếm | `environment` bắt buộc một giá trị; `listAlphaFleet` default `all` nhưng sort/filter hạn chế | M03 tab All | Quyết định + contract |
| R-04 | **Batch sparkline/series theo row-key** (alpha×version×portfolio), có `environment`, độ dài/coverage | Route hiện có key theo alpha, FE hard-code env | M03 cột Equity 30D | Contract + fixture |
| R-05 | **Archived Alphas read** (M08): archive reason/date, previous stage, residual obligations (đếm an toàn), monitor state, lineage clone | Không route nào | M08 | Contract + fixture; không lộ ngoài quyền |
| R-06 | **Tham số truy vấn thiếu**: `search` (tên/ID), `window` cho metric, currency/partition mặc định | Guide đòi tìm kiếm/cửa sổ; manager dataset không có | M03, M01 | Quyết định cho từng param |
| R-07 | **Saved views**: server-stored versioned hay chỉ URL? Nếu server: schema + ACL re-evaluate | Guide §4.3 | M03 | Quyết định + (nếu có) contract |
| R-08 | **Từ điển copy công khai**: danh sách `public_copy_key` + `reason_code` đầy đủ (registry duy nhất), nhãn band tiếng Anh, nhãn "Forward tổng hợp xuyên stage…" tiếng Anh | Guide viết tiếng Việt; UI phải tiếng Anh; digest score nêu 5 điểm mơ hồ về reason/status | Mọi màn có score/state | Registry + bản dịch được duyệt |
| R-09 | **Eligibility cho hành động** theo exact resource: `allowed` + lý do typed an toàn cho từng action (để nút khóa có lý do thật) | `AccessEffective.current` không phải quyền nút; workflow action mặc định `SOURCE_NOT_QUALIFIED` | M04–M09 action | Contract + fixture deny/revoke |
| R-10 | **Làm rõ mơ hồ score/state** (liệt kê trong §8): khi nào PortfolioScore `unbound`; ánh xạ `provisional`↔`evidence_status`; Regime có `policy_pending` không; mã lý do "not linked" cho researcher; enum freshness (`UNRESOLVED` hay `UNKNOWN`) | Digest score/packet 01–05 | Score drawer, researcher shell | Văn bản chốt trong packet |

Request chung về nguồn (không phải FE tự giải quyết, chỉ ghi để theo dõi): 05-001, 06-002, 07-001, 00-004, 00-005
vẫn OPEN. Frontend **không** cần Codex bật nguồn để làm wireframe/lab; chỉ cần để làm F.

Đề xuất nhỏ cho tài liệu của Codex (không phải request kỹ thuật): guide Edge vẫn mô tả delta "UPSERT/TOMBSTONE"
trong khi ELP2-09 là notification-only; guide dùng freshness `UNRESOLVED`, contract sinh ra dùng `UNKNOWN`.

---

## 7. Phối hợp Claude ↔ Codex (đề xuất)

| | Claude (frontend-first) | Codex (backend-first) | Chung |
| --- | --- | --- | --- |
| Sở hữu | Wireframe, component, copy tiếng Anh, typed consumer, browser receipt, request FE→BE | Contract, generated types, fixture canonical, nguồn/runtime, ledger request BE→FE | Mapping field↔component, lane bằng chứng |
| Không tự sửa | Contract/generated/registry/backend | UI đã duyệt/baseline | — |
| Nhịp | Trước mỗi gói: đọc handoff mới + `git log` + xin pin SHA producer | Mỗi slice ghi "Claude cần nối ở đâu" (đã làm tốt) | ACK = `ACCEPTED`/`CHANGES_REQUESTED` với locator, không im lặng |
| Request | Gửi ở §6 theo template, có "UI bị chặn" + done-when | Trả lời ID, ghi trạng thái vào packet | Một ledger/ID, không nhân bản |
| Làm bên kia | Chỉ khi Bobby giao kèm (rules §1) | Tương tự | Ghi rõ trong scope card |

**Cảnh báo vận hành cần Bobby/Codex biết.** `/home/bobby/portal-research` (cây tích hợp) đang có 70 thay đổi staged
chưa commit của Codex. Tôi làm việc ở worktree riêng `portal-research-fe` và trước đây ff-merge vào cây đó. Với
cây đang dơ, tôi **sẽ không ff-merge** cho tới khi Codex commit hoặc hai bên thống nhất lượt hạ cánh; commit của
tôi nằm ở nhánh `claude/fe-parity`. Không dùng stash chung.

---

## 8. Điều còn mơ hồ trong tài liệu (để chốt, không đoán)

Từ digest của các agent (locator trong báo cáo gốc):
1. `unbound` áp cho PortfolioScore khi nào (spec nói thiếu research binding chỉ làm Regime unbound).
2. Ánh xạ `provisional/available` ↔ `evidence_status limited/sufficient_for_display`; tên `insufficient_data` vs `evidence_status=insufficient`.
3. Regime thiếu `policy_pending` trong enum dù spec nhắc preview chưa duyệt.
4. Registry `reason_code` đầy đủ chưa có; `not_applicable` không nằm trong enum status.
5. Mã/typed code cho researcher "không linked" chưa nêu (chỉ "cùng hình dạng not-found").
6. Freshness enum `UNRESOLVED` (guide) vs `UNKNOWN` (contract); tên frame lowercase vs guide uppercase.
7. Alias tên: số alias mở (21/33 vs 24/30), route census 112 vs 113+ — các số này đã cũ sau staged work.
8. Nhãn tiếng Việt trong guide ("Yếu/Khá/Sơ bộ…") vs luật UI tiếng Anh — chưa có bản dịch được duyệt.
9. Hai drawdown (windowed R vs since-inception) cần nhãn phân biệt.

---

## 9. Quyết định cần Bobby

1. **Duyệt hoặc sửa bộ quy tắc §9** trong rules guide (đây là điều kiện để tôi làm bất cứ gói nào).
2. **Ngữ nghĩa tab "All" của Fleet** (§1.3): partition-first như đề xuất, hay khác.
3. **Tái cấu trúc bảng Overview** (§1.3): một cột + khối Capital + PnL chart.
4. **M01 ở đâu** (`/` hay `/execution`) và **theme** của V2 (Execution tối carbon, Governance sáng).
5. **Giao gói A (UXM-00)** làm ngay không? (không đổi gì; cho ra audit + reuse map).
6. **Mức effort/model** cho gói B–D.
7. **Researcher view**: xác nhận V2 giai đoạn đầu chỉ dựng shell + typed absence (field matrix chưa duyệt).
8. **Có thêm kiểm 660px cho Execution** không (hiện chưa có).

## 10. Giới hạn của báo cáo này

- Chưa chạy gì, chưa mở trình duyệt, chưa audit UI đang phục vụ (đó là UXM-00).
- Code backend được khảo sát chứ không đọc từng dòng; số liệu route/alias đang thay đổi theo staged work.
- Mọi đề xuất bố cục/chart ở trên là ý kiến thiết kế, chưa phải wireframe, chưa được duyệt.
- Không claim nghiệm thu, không claim real-API, không claim "backend sẵn sàng".

---

# Phần B — Bổ sung lượt 2 (2026-10-17): fixture ↔ endpoint thật, và ba luồng TS song song

Nguồn: ba khảo sát chỉ-đọc qua SSH tới HK (TS execution, PM, Edge), cộng kiểm tra tại chỗ. **Chưa kiểm runtime/Docker
của HK**; một agent chạy thêm `docker ps` chỉ-đọc ngoài danh sách lệnh tôi cho phép (không đổi gì) — ghi lại để minh bạch.
Nhánh `claude/fe-parity` của tôi đang **chậm hơn** `docs/research-loop-plan` (Codex vừa thêm `322e2347`); phải rebase
và re-pin trước G0 của bất kỳ gói nào.

## 11. Giải pháp "wireframe + fixture trước" có đúng không, và chuyển sang endpoint thật có dễ không

**Kết luận: hướng đúng, nhưng chưa đủ.** Để chuyển sang thật chỉ là đổi adapter (không viết lại màn), cần thêm 6 điều.
Hiện chưa có điều nào trong 6 điều này trong kho.

| # | Điều kiện | Hiện trạng | Đề xuất |
| --- | --- | --- | --- |
| 1 | **Port-first**: mọi màn chỉ nói chuyện với một interface `ManagerApi`, mỗi method = một `operationId` đã sinh | V1 đã có mẫu (`ExecutionApi`, `createHttpApi`/`createFixtureApi`), nhưng V1 không có method nào cho sáu route Manager | Định nghĩa `ManagerApi` khớp 1:1 với `executionManager*GetV1`; adapter fixture và adapter HTTP cùng implement; component không biết đang ở làn nào |
| 2 | **Reader ở ranh giới, cùng một cổng cho cả fixture lẫn thật** | FE **không có thư viện kiểm schema** (không `ajv`/`zod`); V1 dùng reader viết tay (`rows.ts`) "kiểm, không sửa" | Mỗi response V2 đi qua một reader kiểm giá trị (enum, decimal, null/availability) theo type sinh ra; fixture không được dễ tính hơn thật. Chọn: hand-reader (không thêm dependency, nhưng nhiều code) hay `ajv` với JSON schema đã publish (`execution-manager-dataset.v1.schema.json`) — **quyết định cần Bobby/Codex** |
| 3 | **Fixture đủ phong phú và giống thật** | Fixture Manager canonical của Codex **rất nhỏ**: 1 hàng, 1,7–5 KB mỗi file, gắn `TEST_ONLY`; không có case lỗi/rỗng/lớn | Bốn tầng fixture (xem dưới) |
| 4 | **Cổng "fixture conformance"** | Chưa có | Test chạy mọi fixture FE tự thêm qua JSON schema đã publish; fixture không hợp lệ bị loại. Fixture canonical của Codex không bao giờ bị sửa |
| 5 | **Cổng "parity" khi có response thật** | Chưa có | Khi một endpoint đạt chuẩn: chụp response đã che → thành fixture `REAL_RECEIPT` → chạy lại toàn bộ test component trên nó → so cấu trúc (field có mặt, mẫu null) với fixture synthetic; chênh lệch → sửa fixture, không sửa thật |
| 6 | **Pin và theo dõi schema đang đổi** | Cây Codex đang có 70 thay đổi staged (Regime mở rộng, thêm case workflow); contract còn dịch chuyển | Mỗi gói ghi SHA producer ở G0; types luôn sinh lại bằng lệnh của contracts; test drift `verify-generated`; không type viết tay |

**Bốn tầng fixture** (đều phải qua cổng conformance):

- **L0 canonical** — của Codex, nguyên văn, không sửa.
- **L1 ma trận state** — tôi sinh bằng cách biến đổi hợp lệ từ L0 để phủ **mọi tổ hợp** `availability × status × reason_code × freshness × completeness` mà type cho phép (lấy từ union type sinh ra, kiểm bằng `never`).
- **L2 quy mô** — sinh từ schema: 200 hàng, nhiều nhóm, cursor, 1 MiB; để kiểm sort/page/group và ngân sách DOM.
- **L3 âm tính** — field thừa, enum lạ, decimal sai, `availability=AVAILABLE` nhưng `value=null`; reader phải từ chối.

**Rủi ro lớn nhất không phải kỹ thuật mà là "fixture quá đẹp".** Ba luồng bên dưới cho thấy lúc đầu dữ liệu thật sẽ **rất thưa**
(nhiều null/unavailable). Fixture L1 phải có một **profile "thưa thực tế"** phản ánh đúng điều đó, và wireframe phải
đẹp ngay cả khi phần lớn KPI là `unavailable` — xem §13.

## 12. Ba luồng song song bên TS: hiện tại và hệ quả

Mốc quan sát 2026-10-17 ~11:15Z, qua SSH chỉ-đọc.

| | Luồng 1 — TS execution chính (P18.4 Data Layer + writer) | Luồng 2 — Portfolio & Account Management (PM) | Luồng 3 — Execution Portal Edge (EPG10) |
| --- | --- | --- | --- |
| Worktree | `…/trading-system-next-upgrade`, `feat/v2-rust-first-okx-demo`, `c4819bc0` | `…/trading-system-pm-v1_1`, `673ce7cf` | `…/portal-execution-edge-upgrade-v1_2`, `8560ac10` (30 commit trước main; **không có trong repo local**) |
| Đang làm | Đóng bản data-path v2.2.4: G13 chạy 67/76 dừng do harness (IDR-111); stage-100 cuối chưa chạy lại; certificate còn DRAFT; PR/tag chưa mở | ≈60 commit từ 13/10: history reader (membership, economic, capital, binding, alias…), Edge command handoff, stored-report source; P03 trust, P14 adapter, P16 campaign chưa xong; cutover chưa bắt đầu | EPG10-00…11 "độc lập xong, kết nối đầy đủ NOT_MET"; mọi PASS là TEST_ONLY, Postgres dùng-một-lần |
| Có thể cấp cho Portal | Manager-v2 read facade (orders, fills, positions, accounts, portfolios, reconciliation, command journal), market candles/quote (decimal string, UTC ms); N11 24 truy vấn (7 typed-unavailable) **source-dark** | Hợp đồng và ngữ nghĩa vốn/ngân sách/membership/lifecycle; **không cái nào mount**, 12 dataset báo cáo đều `UNAVAILABLE` | Đọc Manager 200 hàng/1 MiB (cờ mặc định tắt); scoped read, scoped notice, snapshot/cursor/epoch **chưa mount**; relay lệnh chưa mount |
| **Không cấp được** | NAV, TWR, dòng vốn nạp/rút, identity người, lịch sử sổ vốn, journal kinh tế đầy đủ, score | return/Sharpe/drawdown (`UNAVAILABLE_METHOD_NOT_CERTIFIED`), `RETURN_CAPITAL` (không publish), apply/cancel pending, lock/unlock, reallocate, archive + paper clone (mới là đề xuất) | Lệnh (0 operation qualified), SSE, export, identity người (chỉ workload) |
| Chặn thật | Chưa chặn shape của Portal; ảnh hưởng độ tin cậy nến/quote (Trade Replay) | Trust người (RG03/RG17), owner-return, TLS leaf hết hạn, native fence | ELP2-REQ-05-001 (fence publisher), 06-002, 07-001, 10-002 (14 ngân sách còn null) |

**Ý nghĩa tổng hợp.** Không luồng nào đang đưa dữ liệu V2 qua cổng Portal. Điều kiện cần cho "đọc thật" nằm **ở cả ba
luồng cùng lúc** (nguồn TS đã công bố + PM đã mount + Edge đã nối). Frontend không đẩy nhanh được; chỉ đảm bảo khi
đến lúc thì chuyển được bằng adapter.

### Mâu thuẫn giữa nguồn TS/PM/Edge và contract Portal (cần chốt, không đoán)

1. **Tên stage**: Portal `CANARY`, `LIVE`; TS command dùng `LIVE_CANARY`, `LIVE_FULL`; DB `mode` không có canary; PM nói canary là profile/stage, không phải environment. Ánh xạ hiện là suy luận.
2. **`economic_domain`**: Portal `ACTUAL|PAPER|SANDBOX` vs PM `paper|sandbox|live`. Quy tắc "live → ACTUAL" chưa ai viết.
3. **`alpha_version_id`**: Portal row grain cần nó; PM **không có khái niệm version** trong contract đã đọc.
4. **Tên metric**: Portal `initial_funds` vs PM `opening`; Portal tách `decreases_applied`/`recall_applied` nhưng PM gộp `budget_decreases`; Portal có `pending_fees` nhưng PM chỉ có một `fees`.
5. **Tổng thiếu nguồn**: PM đặt **cả aggregate = null** khi thiếu một nguồn (không có tổng một phần). UI không được kỳ vọng "một phần tổng".
6. **Return**: TS chỉ có Modified-Dietz do người gọi cấp trọng số, **không phải TWR**, không có chuỗi NAV; drawdown null khi có dòng tiền ngoài. UI không được gọi là TWR.
7. **Chế độ thừa**: DB và journal có `replay`, `backtest`; Portal phải lọc.
8. **Từ vựng freshness/completeness có ít nhất 4 bộ** (Edge canonical OK/AGING/STALE/PAUSED/UNKNOWN; Manager source FRESH/DEGRADED/…; guide FRESH/STALE/UNRESOLVED; Portal FRESH/STALE/UNKNOWN). Chỗ `AGING` rơi vào đâu ở Manager row chưa rõ.
9. **Owner id**: PM là UUID, Portal là text tự do — giữ nguyên chuỗi, không chuẩn hóa.
10. **Docs lỗi thời**: Edge-Unified §23.4 (hàng 04–10) cũ; hàng "guide" ở Unified local vẫn ghi READ_ONLY. Mọi số alias/route trong packet đã cũ sau staged work.

## 13. "Bản đồ sự thật nguồn": field nào thật sự có trước

Đề xuất một tài liệu sống (một file, hai bên cùng ghi) — **Source Truth Board**: mỗi field Portal → contract Portal →
Edge → TS/PM nguồn → trạng thái (`EXISTS_MOUNTED` / `SOURCE_DARK` / `MISSING`) → owner → request ID. Frontend đọc nó ở
G0/G1 của mỗi màn. Dự báo sơ bộ (dựa trên khảo sát, **chưa kiểm runtime**):

| Nhóm field | Khả năng có sớm | Lý do |
| --- | --- | --- |
| Định danh (alpha, portfolio, deployment, account, stage presence, lifecycle) | Cao nhất | Manager-v2 projections và registry đã có; PM identity/instance contract có |
| Orders, fills, positions, reconciliation, command journal | Cao | Manager-v2 projection có sẵn trong TS; cần qualified publication |
| Allocation, internal account balance | Trung bình | Có ở bảng TS; cần source-set/partition proof và dedupe |
| Net/unrealized PnL, fees, funding | Trung bình-thấp | Có bảng/economic facts; chưa rõ populate và coverage; PM nulls aggregate khi thiếu |
| Initial/Added/Returned funds, capital statement | Thấp | PM source-dark; `RETURN_CAPITAL` không publish; không có sổ dòng tiền ngoài ở TS |
| NAV, equity 30D, return %, drawdown | Thấp | Không có chuỗi NAV; chưa chứng nhận phương pháp; Modified-Dietz không phải TWR |
| QBTS/AlphaScore/PortfolioScore | Rất thấp | `policy_pending`; thiếu calibration và input |
| Regime Fit | Rất thấp | Chưa có binding research ↔ deployment |
| Archived Alphas, paper monitor | Rất thấp | Chỉ là đề xuất, chưa phê duyệt |

**Hệ quả thiết kế:**

1. **M01 Overview là màn khó nhất** (phụ thuộc NAV, dòng vốn, score — đều thưa). Wireframe phải tốt khi KPI chính là
   "unavailable có lý do"; không dựng M01 làm màn đầu tiên cho "đọc thật".
2. **Lát dọc "đọc thật" đầu tiên nên là M07 (deployment) → M06 (account) → M03 (fleet)** — các field định danh và
   orders/fills/positions có khả năng đạt sớm nhất. M01, M05 (score), M08 sau cùng.
3. Cần một **buổi rà contract chung với Codex trước khi khóa wireframe M01**, để chốt KPI nào ngày đầu là
   `unavailable` có chủ đích và KPI nào có đường dữ liệu.

## 14. Cách thảo luận/làm để đủ ngữ cảnh và đúng nhất

1. **G0 mở rộng**: mỗi gói ghi SHA của cả bốn: Portal producer, TS (luồng 1), PM, Edge; đọc nguồn qua SSH chỉ-đọc
   **chỉ khi được giao**, không chạy gì khác. Không dùng docs cũ khi có evidence mới hơn.
2. **Source Truth Board** (§13) là điều kiện vào G1.
3. **Rà soát từ vựng một lần**: Codex chốt bảng ánh xạ stage/domain/freshness/completeness (R-10 mở rộng) trước UXM-01.
4. **Mỗi request FE→BE nêu rõ luồng sở hữu** (TS/PM/Edge/Portal) để Codex chuyển đúng chỗ.
5. **Nhịp đối soát**: trước mỗi gói, đọc `git log` ba worktree HK + packet mới; thay đổi lớn → cập nhật board.
6. **Giữ "đọc thật" tách khỏi "thiết kế"**: wireframe, fixture, lab đi trước; mỗi endpoint chỉ vào G6 khi cả ba luồng
   và Portal cùng qualified.

## 15. Request bổ sung cho Codex/Edge/PM (thêm vào §6)

| ID | Cần gì | Chủ sở hữu | UI bị chặn |
| --- | --- | --- | --- |
| R-11 | Bảng ánh xạ chính thức: stage (`CANARY`/`LIVE_CANARY`/`LIVE_FULL`), `economic_domain` ↔ environment, filter `replay/backtest` | Portal + TS + PM | Mọi màn có stage/partition |
| R-12 | Chốt `alpha_version_id` đến từ đâu (PM không có) và cách gắn vào row grain | PM + Research + Portal | M03/M05 |
| R-13 | Chốt tên metric statement (`opening`↔`initial_funds`, tách decrease/recall, `pending_fees`) | PM + Portal | M01/M04 capital |
| R-14 | Quy ước tổng thiếu nguồn: Portal hiển thị `PARTIAL` thế nào khi PM null cả aggregate | Portal + PM | M01/M04 |
| R-15 | Ghi chú rõ mọi return hiện là Modified-Dietz không phải TWR; nhãn `methodology_ref` | TS + Portal | Return/DD cells |
| R-16 | Hợp nhất từ vựng freshness/completeness (một bảng ánh xạ + chỗ của `AGING`) | Edge + Portal | Chip freshness mọi màn |
| R-17 | Đưa code Edge EPG10 (đang chỉ ở HK) vào nhánh tích hợp hoặc ghi rõ nó không phải nguồn của Portal contract | Codex/Bobby | Căn cứ tham chiếu ELP2-09 |

## 16. Giới hạn của Phần B

- Không kiểm runtime/Docker/DB của HK; "đang chạy" chỉ là lời tài liệu. Một agent thấy container Edge cũ chạy 4 tuần
  (bản legacy, không phải EPG10).
- Dự báo "field nào có sớm" (§13) là phán đoán từ khảo sát code/tài liệu, **không phải cam kết** của bất kỳ luồng nào.
- Chi tiết dòng-theo-dòng của ba luồng nằm trong báo cáo agent gốc, không chép lại ở đây.

## 17. Cập nhật lượt 3 (2026-10-17): sổ đồng bộ và quy tắc làm song song

- Request FE→BE chuyển thành ledger sống [FRONTEND_BACKEND_SYNC.md](FRONTEND_BACKEND_SYNC.md) (ID `ELP2-REQ-FE-001…019`
  thay cho R-01…R-17 ở §6/§15, kèm cột tham chiếu), có nhật ký pin, hộp thư đến, đặc tả bàn giao API và vòng đời fixture.
- Quy tắc round-start/round-end, review hai chiều, giữ nhánh thẳng hàng và vai trò lead UI/UX: Rules §10.
- Đọc lại `docs/research-loop-plan` @ `f1f5fc7d`: non-amount capital receipts, Regime/score recalculation, realtime Hub,
  PM control candidate — đều chưa mount, không đổi kết luận "chưa có dữ liệu thật".
- Còn một điểm chưa đối chiếu: pin PM (`673ce7cf` tôi đọc vs `e62b6825` Codex ghi) — FE-019.

## 18. Quyết định của Bobby, 2026-10-17

| Mục | Quyết định |
| --- | --- |
| Rules §9–§10 (gồm sổ đồng bộ, review hai chiều, kinh tế subagent §10.8) | **Duyệt nguyên văn**, hiệu lực từ round sau; không phải giao UXM |
| Lát dọc nối-thật đầu tiên (§13) | **Không chọn.** Thiết kế cả bộ M01–M10 song song (wireframe + fixture), nối thật sau theo từng nguồn qualified. Thứ tự gợi ý M07→M06→M03 ở §13 chỉ còn là dự báo độ sẵn sàng dữ liệu |
| Cách cài reader ở ranh giới (§11 điều kiện 2, Rules 9.8.2) | **Chưa chốt** — Bobby cần giải thích lại tác động; đang chờ phần giải thích |
| Commit tài liệu | Trên `claude/fe-parity`, không ff-merge vào cây tích hợp |
