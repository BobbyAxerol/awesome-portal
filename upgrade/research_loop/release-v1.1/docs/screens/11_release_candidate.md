# SPEC 11 · Release Candidate & Publish — `QuantBT 11 Release Candidate and Publish.dc.html`

> Màn compose ĐƠN VỊ PROMOTE DUY NHẤT (rc_) và publish nó cho Approval Inbox. Guide plan cho agent code; copy VERBATIM; số = CSS px.
> Luật gốc: (1) đơn vị đi xa là rc_, không bao giờ là run_id trần; (2) DEGRADED đi theo pack như-DEGRADED, MISSING chặn; (3) màn này không tính, không duyệt, không sửa bản ghi đã publish — động từ duy nhất là publish.
> Presentation states dùng chung [Research Screen State Semantics v1](../RESEARCH_SCREEN_STATE_SEMANTICS_V1.md). `denied`/`unavailable` là overlay trình bày, không thay `DRAFT`/`PUBLISHED` và không biến màn thành envelope.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 11 Release Candidate and Publish.dc.html` |
| Route | `/research/quantbt/runs/{id}/release-candidate` |
| Vai trò | 3 khối: (1) identity & lineage rail + change taxonomy; (2) evidence pack 12 mục R1; (3) YAML record preview + Publish + approval-inbox mirror |
| Persona | researcher (composer) · manager (đọc trước duyệt) |
| Shell | Có |
| Inbound | 04 header/claim tab · 09 promotion line · 10 promotion pick / rc chip · 01 rc chip |
| Outbound | breadcrumb 04 · 12 evidence rows link 04/05/06/07/08/09 · Alpha 360° (ngoài prototype — chip xám title) |
| Tweaks (hi-fi) | demoState draft/published · binding bound/unbound |
| Console chuẩn | 0 error/warning |

## 2. Layout anatomy

### 2.1 Header
- Breadcrumb `Evidence Flow / R-WFO-118 / Release Candidate & Publish`.
- Title 26px Newsreader: **Release Candidate — compose, pin, publish** + state chip phải: `DRAFT` vàng / `PUBLISHED` xanh / `NOT_PUBLISHABLE` đỏ (grammar pill 999px).
- Subtitle italic: "A run is evidence; what travels is the release candidate. Publish writes one immutable record — the Approval Inbox reads it. Nothing here recomputes or approves."
- Nút phải: `run report` (→09).

### 2.2 NOT_PUBLISHABLE banner (chỉ scratch)
- Khối dashed đỏ: badge `NOT_PUBLISHABLE` + "This run was submitted without an alpha_version binding — a scratch research run. It stays fully usable as evidence for you, but no release candidate can be composed from it. Bind a version at New Run and re-run to publish." (link New Run).

### 2.3 Khối 1 · Identity & lineage
- Label: "1 · identity & lineage — the unit that travels" + phải: "spec v0.7 §3.1 — binding goes through rc_, never alpha↔run directly".
- **Rail 5 node** (card nhỏ nối mũi tên →): `alpha` alpha_momentum_btc · `alpha_version` av_0_9_3 (sha256:3fe4a1 · U14 ACTIVE) · `run / attempt` R-WFO-118 · att_04 (final_audit_run · COMPLETE) · `selected params` prm_7c1a9e (θ* #143 · SelectionTraceV1) · `release candidate` rc_(draft) vàng / rc_2026_0914_a xanh khi published; unbound: node av dashed "— unbound / scratch run", node rc dashed "blocked — no av_".
- **Change taxonomy** (bảng 4 hàng vs last rc): `what 210 · state 120 · consequence flex`:
  - code/entrypoint (av_) — UNCHANGED xanh — "no gate re-run from this row"
  - selected strategy params — CHANGED đỏ — "R1 + R2 re-run — numerical artifact changed"
  - data contract / dataset snapshot — UNCHANGED — như trên
  - target venue / account / capital — UNSET xám — "belongs to deployment candidate → Gate R2, Execution side"
- **Gate verdict** (cột phải): "R1 + R2 must run — selected params changed" + giải thích prm cũ→mới + câu venue thuộc R2.
- lastRc caption: "change taxonomy vs last published rc — rc_2026_08_c (av_0_9_3 · prm_49b2e0 · APPROVED, now superseded-on-publish)".

### 2.4 Khối 2 · Evidence pack (12 hàng — bảng cuộn ngang min-width 960)
- Header: "2 · evidence pack — 12 items of gate R1, each linked to the screen that proves it" + chip đôi: `claim ceiling B` vàng (title holdout unlock note) + `engine cert L2 · engine-causal` xanh (title trục riêng) + counter `9 COMPLETE · 1 DEGRADED · 2 INPUT · 0 MISSING`.
- Cột: `# 26 · item 250 · status 96 · digest/value 250 · source 110 · note flex`.
- 12 hàng đúng thứ tự (item · status · source): Alpha Version passport ok Alpha360° (không link — title "outside this prototype") · Engine/capability/backend ok →09 · Dataset & universe snapshots ok →05 · Methodology claim ok →04 · Selected params lineage ok →07 · Final audit replay ok →08 · Metrics semantics ok →09 · Execution assumptions ok →08 · Robustness/param stability/regime **DEGRADED** →06 (nền #fdfbf5) · Known limitations & waivers INPUT · Reproducibility/parity checksums ok →09 · Proposed use restrictions INPUT.
- Status grammar: COMPLETE xanh 700 · DEGRADED vàng (title "partial artifact — travels as DEGRADED, reviewer sees it") · INPUT xanh-biển (title "researcher declaration — part of the signed pack") · MISSING đỏ (chặn).
- Footer: "DEGRADED travels as DEGRADED — the reviewer sees it. MISSING blocks publish. The two INPUT rows are the researcher's own signed declarations."

### 2.5 Khối 3 · Record preview + publish + mirror
- **YAML preview** (trái, nền #fdfdfa, mono 10.5, key 270px): 17 dòng đúng thứ tự §3.2 spec binding (rc id "(assigned on publish)" vàng khi draft; av null đỏ khi unbound; known_limitations/restrictions vàng; created_at "— (on publish)"). Nút `copy yaml` / `✓ copied`.
- **Publish card** (phải, viền vàng): label "publish" + câu: "Publishing freezes this exact combination as {rc} in the portal governance store. It creates no account, no allocation, and does not start Paper — it only makes the candidate reviewable." + nút `Publish release candidate rc_2026_0914_a` (vàng đậm; unbound: dashed disabled "publish blocked — bind alpha_version first") + note SoD: "Separation of duties: the publisher cannot be the sole R1 approver where policy requires it. R1 approval default expiry: approved_at + 90d (policy default — confirm)."
- **Published card** (thay publish khi published): viền xanh — `rc_2026_0914_a` + "published_at … · by researcher@bobby · evidence digest sha256:aa47c1. Any further change to code, params, or methodology creates a NEW candidate and supersedes this one — this record itself never mutates." + `reset demo` (chỉ hi-fi).
- **Approval mirror**: ghost dashed opacity .75 khi draft ("— not yet published · SLA starts at publish · Preview of the inbox row this publish will create… It stays a ghost until the record exists — this screen never fakes a governance state."); published: card thật — chip `R1 · RESEARCH EVIDENCE` + subject `rc_2026_0914_a — alpha_momentum_btc av_0_9_3` + `PENDING` vàng + `SLA 5d · 4d 21h left` + dòng meta "assignee pool: Quant Reviewers · conditions: none yet · decision outcomes: APPROVED · APPROVED_WITH_CONDITIONS · CHANGES_REQUESTED · REJECTED · SUPERSEDED · EXPIRED" + note: "The reviewer opens this row, walks the same evidence links you pinned above, and records one of six outcomes… You cannot edit anything past this point — only supersede with a new candidate."

### 2.6 Rules footer
"The promotable unit is rc_, never a bare run_id. Digests pinned at publish are verified downstream. This screen never computes, approves, or mutates — its one verb is publish."

## 3. Tính động — state machine

| Từ | Event | Đến | Side effects |
|---|---|---|---|
| DRAFT (bound, 0 MISSING) | Publish click | PUBLISHING | nút disabled "publishing…"; POST |
| PUBLISHING | 201 {rc_id, published_at} | PUBLISHED | rail node rc xanh; YAML rc điền; publish card → published card; mirror ghost → PENDING; state chip PUBLISHED |
| PUBLISHING | 409 (pack đổi/race) | DRAFT | banner đỏ "evidence changed since composing — review the pack"; refetch |
| DRAFT (unbound) | — | — | publish disabled + banner NOT_PUBLISHABLE |
| DRAFT (MISSING > 0) | — | — | publish disabled + note "resolve MISSING rows first"; hàng MISSING đỏ |
| PUBLISHED | mirror poll 60s | PUBLISHED | SLA countdown/status cập nhật (read-model) |
| PUBLISHED | rc superseded (poll) | PUBLISHED | mirror status SUPERSEDED + note |
| DRAFT hoặc PUBLISHING | publish/PATCH trả 401, 403 hoặc typed authorization refusal | domain state không bị suy đoán đổi | presentation `denied`; dừng retry/poll liên quan, giữ INPUT local chưa gửi, disable publish/PATCH, hiện đường reauth/access; không render empty hay lộ pack/mirror ngoài scope |
| DRAFT hoặc PUBLISHING | publish/PATCH trả 502, 503, timeout/offline | domain state không bị suy đoán đổi | presentation `unavailable`; giữ draft + composition, không optimistic publish/fallback fixture; retry do người dùng chọn và bounded |
| PUBLISHED | mirror poll trả 401/403 | PUBLISHED | presentation `denied`; dừng poll, giữ last accepted mirror chỉ khi scope còn hợp lệ, không dùng cache để lách quyền |
| PUBLISHED | mirror poll trả 502/503/timeout | PUBLISHED | presentation `unavailable`; nếu last mirror có source `as_of` thì có thể render `stale` cùng timestamp, còn không chỉ render unavailable |
| DRAFT/PUBLISHING | publish/PATCH 422/protocol terminal | domain state không bị suy đoán đổi | presentation `terminal`; render safe reason/field target, giữ INPUT; không collapse route hoặc tự retry mutation |

- INPUT rows: 2 field editable KHI DRAFT (textarea inline mở từ nút "edit" trên hàng; lưu draft server `PATCH /release-candidates/draft`); PUBLISHED: read-only.
- Mirror KHÔNG có nút hành động nào — read-model thuần.
- `RcComposeDetail.state` là domain state. Presentation state được giữ ngoài DTO
  đó cho tới khi P21/P22 publish một envelope typed; client không được tự gắn
  `stale` nếu source thiếu `as_of`/freshness.

## 4. Data contract

```ts
interface RcComposeDetail {
  run: { id: string; attempt: string; binding: AlphaBinding | null };
  state: 'DRAFT'|'PUBLISHED';
  rail: RailNode[5];
  taxonomy: { what: string; state: 'UNCHANGED'|'CHANGED'|'UNSET'; consequence: string }[];
  gate_verdict: { title: string; body: string };
  last_rc: string;
  pack: { n: number; item: string; status: 'COMPLETE'|'DEGRADED'|'INPUT'|'MISSING';
          digest: string; source: { label: string; href: string | null }; note: string }[];
  yaml: { k: string; v: string; tone: 'ink'|'gold'|'red'|'dim' }[];   // 17 dòng server dựng
  publish: { enabled: boolean; blocked_reason: string | null; rc_id: string };
  mirror: MirrorRow | null;   // null khi draft (ghost render local copy)
}
type RcPresentationState = 'loading'|'empty'|'partial'|'stale'|'denied'|'unavailable'|'terminal';
interface RcPresentationMeta {
  state: RcPresentationState;
  as_of?: string;          // source-only, never browser invented
  reason_code?: string;
  display_message?: string; // safe server copy or fixed status-class copy only
  retryable: boolean;
}
POST /runs/{id}/release-candidates → 201 { rc_id, published_at, mirror }
PATCH /runs/{id}/release-candidates/draft { known_limitations?, proposed_use_restrictions? }
GET  /release-candidates/{rcId}/mirror → MirrorRow   // poll 60s khi PUBLISHED
```
- Taxonomy/gate verdict do server so với last rc — FE không diff.
- YAML là 17 dòng server dựng (một nguồn cho preview và record thật) — copy yaml = join dòng.
- Mirror từ governance read-model (BAR-12); mọi trường verbatim.

## 5. Pitfalls — chớ làm sai
1. WRONG: FE dựng YAML từ mảnh dữ liệu. RIGHT: server dựng 17 dòng — preview = record.
2. WRONG: DEGRADED chặn publish hoặc bị ẩn. RIGHT: đi theo pack, hàng nền vàng nhạt.
3. WRONG: mirror có nút approve/reject. RIGHT: read-only tuyệt đối; quyết định ở Execution side.
4. WRONG: sau publish còn sửa được INPUT. RIGHT: khoá; sửa = supersede bằng candidate mới.
5. WRONG: unbound ẩn cả màn. RIGHT: mở đủ, publish khoá + banner — người dùng học được vì sao.
6. WRONG: optimistic publish. RIGHT: chờ 201; 409 xử lý như bảng §3.
7. WRONG: hai trục cert gộp một chip. RIGHT: claim ceiling ⊥ engine cert — 2 chip, 2 title.
8. WRONG: link evidence mở tab mới mất ngữ cảnh. RIGHT: cùng tab, breadcrumb quay lại (SPA).
9. WRONG: đếm pack ở FE. RIGHT: counter server (một nguồn với validation publish).
10. WRONG: tự thêm mục pack thứ 13. RIGHT: 12 mục là hợp đồng R1 — thêm/bớt là việc spec Execution.

## 6. Test matrix
| ID | Case | Expected |
|---|---|---|
| T01 | draft bound | chip DRAFT; rail rc vàng draft; YAML rc "(assigned on publish)"; mirror ghost |
| T02 | publish click | PUBLISHING → PUBLISHED; rail xanh; mirror PENDING SLA; chip PUBLISHED |
| T03 | unbound | banner; node av/rc dashed; publish disabled đúng label; YAML av null đỏ |
| T04 | MISSING fixture | hàng đỏ; publish disabled "resolve MISSING rows first"; counter có 1 MISSING |
| T05 | DEGRADED hàng 9 | nền vàng; status title đúng; link →06 |
| T06 | INPUT edit (draft) | textarea; PATCH; YAML known_limitations cập nhật |
| T07 | INPUT sau publish | read-only |
| T08 | 409 race | banner đỏ; refetch pack |
| T09 | copy yaml | clipboard = join(k: v); ✓ 1.5s |
| T10 | taxonomy CHANGED | hàng đỏ; gate verdict "R1 + R2 must run…" |
| T11 | mirror poll SUPERSEDED | status đổi + note |
| T12 | 12 link nguồn | 10 link đúng màn; Alpha360° không link + title |
| T13 | 660px | rail wrap; bảng pack cuộn ngang min 960; YAML cuộn |
| T14 | axe | bảng th scope; nút publish aria-disabled kèm lý do (aria-describedby); 0 serious |
| T15 | publish/PATCH 401 | `denied`; INPUT local còn, publish/PATCH disable, không retry tự động/không empty; reauth/access affordance có aria label |
| T16 | publish/PATCH 403 hoặc typed refusal | `denied`; domain DRAFT/PUBLISHED không bị ghi đè, reason safe render, không leak pack/mirror trái scope |
| T17 | publish/PATCH 502/503/timeout | `unavailable`; giữ composition/draft, không optimistic `PUBLISHED`, retry user-triggered bounded |
| T18 | mirror 502 sau snapshot có `as_of` | `stale` chỉ với timestamp source; thiếu `as_of` phải `unavailable`; poll dừng khi tab hidden/denied |
| T19 | publish/PATCH 422 | `terminal` cho request; map reason/field an toàn, INPUT còn; không generic error thay toàn màn |

## 7. Copy inventory — VERBATIM (bổ sung ngoài §2)
- Publish blocked: "publish blocked — bind alpha_version first" / "resolve MISSING rows first"
- 409: "evidence changed since composing — review the pack"
- Chip title claim ceiling: "methodology claim ceiling — holdout locked, unlock lifts B → A"
- Chip title engine cert: "engine execution-contract certification (0–4) — separate axis from the methodology claim"
- Denied: "Access changed — reauthenticate or ask a workspace administrator." (nối safe `display_message` khi server có)
- Unavailable: "Release candidate service is temporarily unavailable — your draft is kept locally."
- Toàn bộ câu dài §2.2–2.6 giữ nguyên từng ký tự (đã khớp hi-fi).

## 8. TS architecture & guide plan
```
<RcPage> → {NotPublishableBanner?, LineageRail, TaxonomyTable+GateVerdict, EvidencePack, YamlPreview, PublishCard|PublishedCard, ApprovalMirror}
```
1. Types + fixtures (draft-bound, published, unbound, missing) — từ hi-fi values.
2. LineageRail (5 node grammar) + Taxonomy — T01/T03/T10.
3. EvidencePack bảng + INPUT edit + counter — T04–T07/T12.
4. YamlPreview + copy — T09.
5. Publish mutation + 409 + mirror poll — T02/T08/T11/T15–T19; dùng presentation state chung, không đổi domain `RcComposeDetail.state`.
6. A11y/responsive — T13/T14 và denied/unavailable affordance T15–T18.
7. DoD: T01–T19 xanh; copy diff 0; screenshot draft/published/unbound/denied/unavailable ≤1%; integration 10→11 (promotion pick) + 01 rc chip → 11 đúng run.

## 9. Phi phạm vi
- Không duyệt/điều kiện/waiver ở đây (Execution side).
- Không lịch sử rc versions UI (v2 — governance log).
- Không export YAML file (copy đủ; record thật nằm DB).

## 10. Glossary
- rc_: release candidate — combination bất biến của av_ + params + run + digests; đơn vị duy nhất đi qua R1.
- evidence pack: 12 mục R1 — mỗi mục một nguồn màn chứng minh.
- mirror: hình chiếu read-only của hàng Approval Inbox bên Execution.
- SoD: separation of duties — người publish không thể là người duyệt duy nhất.


## 11. Per-element CSS ledger

### 11.1 State chip + banner
- `.rc-state`: font-family JetBrains Mono; font-size 10px; font-weight 700
- `.rc-state`: letter-spacing .05em; border-radius 999px; padding 2px 10px
- `.rc-state[data-s=DRAFT]`: border 1px solid #9a6a1f; color #9a6a1f; background #f4ecdb
- `.rc-state[data-s=PUBLISHED]`: border 1px solid #1e7b4f; color #1e7b4f; background #eef5f0
- `.rc-state[data-s=NOT_PUBLISHABLE]`: border 1px solid #b43a3a; color #b43a3a; background #f7e8e8
- `.rc-banner`: display flex; gap 12px; align-items center
- `.rc-banner`: border 1px dashed #b43a3a; border-radius 8px; background #f7e8e8; padding 10px 14px
- `.rc-banner .badge`: font mono 12px 700; color #b43a3a

### 11.2 Lineage rail
- `.rc-rail`: display flex; align-items stretch; flex-wrap wrap; row-gap 10px
- `.rc-node`: display flex; flex-direction column; gap 1px
- `.rc-node`: border 1px solid #e3e0d7; border-radius 8px; background #ffffff
- `.rc-node`: padding 7px 12px; min-width 150px
- `.rc-node .k`: font-size 9px; uppercase; letter-spacing .07em; color #939db0
- `.rc-node .v`: font-family JetBrains Mono; font-size 11.5px; font-weight 600
- `.rc-node .sub`: font-family JetBrains Mono; font-size 9px; color #939db0
- `.rc-node[data-tone=gold]`: border-color #9a6a1f; background #fdfbf5; .v color #9a6a1f
- `.rc-node[data-tone=green]`: border-color #1e7b4f; background #eef5f0; .v color #1e7b4f
- `.rc-node[data-tone=dim]`: border-style dashed; border-color #c9c5ba; .v color #939db0
- `.rc-arrow`: padding 0 8px; color #939db0; font-size 12px; align-self center

### 11.3 Taxonomy + verdict
- `.rc-tax .row`: display flex; align-items baseline; font-size 11px
- `.rc-tax .row`: padding 3px 0; border-bottom 1px solid #f4f2ec
- `.rc-tax .what`: width 210px; flex none; color #4e5a6e
- `.rc-tax .state`: width 120px; flex none; font mono 10px 600
- `.rc-tax [data-s=UNCHANGED]`: color #1e7b4f
- `.rc-tax [data-s=CHANGED]`: color #b43a3a
- `.rc-tax [data-s=UNSET]`: color #939db0
- `.rc-verdict .t`: font mono 12px 700; color #9a6a1f

### 11.4 Evidence pack
- `.rc-pack`: overflow-x auto
- `.rc-pack .head, .rc-pack .row`: min-width 960px
- `.rc-pack .row`: display flex; align-items baseline; padding 6px 16px; border-bottom 1px solid #f4f2ec
- `.rc-pack .row[data-s=DEGRADED]`: background #fdfbf5
- `.rc-pack .row[data-s=MISSING]`: background #f7e8e8
- `.rc-status`: width 96px; flex none; font mono 9.5px 700
- `.rc-status[data-s=COMPLETE]`: color #1e7b4f
- `.rc-status[data-s=DEGRADED]`: color #9a6a1f
- `.rc-status[data-s=INPUT]`: color #0f4c5c
- `.rc-status[data-s=MISSING]`: color #b43a3a
- `.rc-ceiling`: font mono 10px 700; border 1px solid #9a6a1f; radius 3px; padding 1px 7px; background #f4ecdb; color #9a6a1f
- `.rc-engcert`: font mono 10px 700; border 1px solid #0f4c5c; radius 3px; padding 1px 7px; background #e2edf0; color #0f4c5c

### 11.5 YAML + publish + mirror
- `.rc-yaml`: background #fdfdfa; padding 10px 14px; overflow-x auto
- `.rc-yaml .line`: display flex; font mono 10.5px; line-height 1.75; white-space nowrap
- `.rc-yaml .k`: color #7a8699; width 270px; flex none
- `.rc-yaml [data-tone=gold]`: color #9a6a1f
- `.rc-yaml [data-tone=red]`: color #b43a3a
- `.rc-yaml [data-tone=dim]`: color #7a8699
- `.rc-publish`: border 1px solid #9a6a1f; border-radius 10px; background #fdfbf5; padding 14px 16px
- `.rc-publishbtn`: border 1px solid #9a6a1f; background #9a6a1f; color #fff; radius 6px
- `.rc-publishbtn`: font mono 11px 600; letter-spacing .03em; padding 9px 14px
- `.rc-publishbtn:disabled`: border 1px dashed #c9c5ba; background #faf9f5; color #939db0; cursor not-allowed
- `.rc-published`: border 1px solid #1e7b4f; background #eef5f0; border-radius 10px; padding 14px 16px
- `.rc-mirror[data-ghost=true]`: border 1px dashed #c9c5ba; background #faf9f5; opacity .75
- `.rc-mirror .gate`: font mono 10px 700; color #0f4c5c; border 1px solid #0f4c5c; radius 3px; padding 1px 6px
- `.rc-mirror .status[data-s=PENDING]`: font mono 10px 700; color #9a6a1f; border 1px solid #9a6a1f; background #f4ecdb; radius 3px; padding 1px 7px

## 12. Fixture guide
- RC_DRAFT_BOUND (canonical): pack 9/1/2/0; yaml 17 dòng; mirror ghost.
- RC_PUBLISHED: rc_2026_0914_a; mirror PENDING SLA "4d 21h left"; published card.
- RC_UNBOUND: binding null; rail av/rc dashed; publish blocked.
- RC_MISSING: hàng 3 (dataset snapshots) MISSING đỏ; publish blocked lý do rows.
- RC_SUPERSEDED_MIRROR: mirror status SUPERSEDED + note "superseded by rc_2026_10_a".
- Mọi digest import từ fixtures/canonical.ts.

## 13. Bảng quyết định publish
| binding | MISSING | state | Nút publish |
|---|---|---|---|
| bound | 0 | DRAFT | enabled — "Publish release candidate rc_…" |
| bound | >0 | DRAFT | disabled — "resolve MISSING rows first" |
| unbound | bất kỳ | DRAFT | disabled — "publish blocked — bind alpha_version first" |
| — | — | PUBLISHED | không render nút (published card thay thế) |

## 14. Integration tests liên màn
1. 10 PROMOTION PICK → 11 đúng run att_04; rail khớp band.
2. 01 rc chip (APPROVED) → 11 published view + mirror trạng thái thật.
3. 11 evidence row 9 (DEGRADED) → 06; breadcrumb quay lại giữ nguyên state DRAFT (không refetch mất INPUT đang gõ — draft PATCH trước khi rời, hoặc cảnh báo unsaved).
4. 09 promotion line ↔ 11 state đồng bộ (cùng read-model — test contract).
5. Publish xong → 01 card 118 rc chip đổi DRAFT→rc id (invalidate listRuns).

## 15. Telemetry
- rc_view {state, binding}
- rc_publish_click {result: 201|409|blocked}
- rc_pack_link_click {row}
- rc_input_edit {field}
- rc_copy_yaml

## 16. Reviewer checklist
1. [ ] YAML render đúng 17 dòng server — không key sinh ở FE (grep).
2. [ ] Publish disabled states đúng bảng §13 + aria-describedby lý do.
3. [ ] Mirror không có element interactive (grep button/link trong mirror trừ none).
4. [ ] 409 flow giữ INPUT người dùng đã gõ (draft PATCH trước refetch).
5. [ ] Hai chip cert 2 title riêng — không gộp.
6. [ ] Copy diff §7 = 0; screenshot 4 fixture ≤1%.
7. [ ] Poll mirror dừng khi tab ẩn; resume khi hiện.
8. [ ] Grep run_id trần trong payload publish = 0 ngoài final_audit_run_id (đúng field).
9. [ ] `denied`/`unavailable` không overwrite `RcComposeDetail.state`, không auto-retry mutation và không thay rich composition bằng envelope.

## 17. Không-trạng-thái & phi phạm vi (nhắc)
- State màn: {rcState, inputDrafts, publishing} — không gì khác; pack/status/yaml đều server.
- Không lịch sử phiên bản rc UI; không duyệt; không export file; không đổi binding tại đây (về 02).

> End of spec 11 · v1.1 · pair with hi-fi `QuantBT 11 Release Candidate and Publish.dc.html`.
