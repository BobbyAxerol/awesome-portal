# P19 frontend handoff — Screen 10 Attempt Lineage

**Backend state:** `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK`. Claude owns Screen 10 rich product composition and browser/HiFi acceptance; Codex owns this backend contract. Do not modify P19 backend, migrations, feature flags, deployment overlay or existing P12 frontend WIP to make a visual state look populated.

## Read first and record `READ`

1. `CLAUDE-FOR-thanhvuong.md`, P19 in the unified plan, and the full Screen 10 spec + HiFi HTML at 1280px and 660px.
2. [P19 phase report](./phase-report.md) and [P19 backend packet](./README.md).
3. Generated sources only: `packages/contracts/openapi/research-attempt-lineage.openapi.json` and `packages/contracts/generated/research-attempt-lineage.d.ts`.

Regenerate before consuming:

```bash
npm --prefix packages/contracts run generate:research-attempt-lineage
```

Do not hand-write DTOs, parse server strings, derive a promotion from metrics, or calculate/normalize config diffs in the browser.

## Exact named consumer

`researchAttemptLineageGetV1` maps one same-origin request:

```text
GET /api/v1/research/alphas/{alphaId}/lineage?workspace_id=&limit=
```

`workspace_id` may be omitted to use the authenticated workspace. `limit` is 1–128. Preserve exact UTC milliseconds and strings; do not derive unknown facts from a returned prefix.

`400/401/403/404/503` are panel-local typed states. Do not retry a 401/403 in a loop, turn 404 into a workspace/Alpha existence hint, or request a source, worker, artifact, cursor, relation, credential or command endpoint.

## Required rich-but-truthful composition

- Retain the HIFI shell and S10 hierarchy: version bands, attempt chips, storied cards, probes/toggle, diff drawer, failed/abandoned/draft treatment, visibility counter and rules footer. Replace only an affected panel state; never replace the entire route with a generic unavailable page.
- Render `alpha.versions[].promotion_pick` exactly. `NOT_PUBLISHED` stays a rich typed source-gap panel; never infer a winner from `ACTIVE`, time, return, Sharpe or another metric. `PUBLISHED` may link only to returned attempt/run identities.
- Render `semantic_diff.changes` exactly from server facts. Render `gates_reset` solely as the special disclosure/navigation chip—**no click, `setState`, network mutation or approval reset**.
- Preserve all retained logical attempts in visible counts; retries are secondary `primary_run.technical_retry_count`, never cards/chips. Render `FAILED` and `ABANDONED` visibly with returned reason where present.
- `coverage=PARTIAL` / `P19_BOUNDED_GRAPH_LIMIT_REACHED` and per-node `child_runs_coverage=PARTIAL` / `P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT` require visible bounded-history copy. Do not call a returned list complete or hide disclosure behind a tooltip-only treatment.
- `exposure.state=NOT_PUBLISHED` means no persisted fact was published—not zero risk or clean exposure. Preserve returned roles/timestamps and exact typed absence.
- `historical_semantic_diff=NOT_PUBLISHED` retains the card/tree layout and shows its source gap; no client-derived fallback diff.
- P10 currently supports only `NEW`; Screen 10 may navigate to declared screens but must not expose fake Clone/Reproduce/Upgrade actions.

## Mandatory browser / HIFI evidence

Before return, inspect the HiFi HTML and product route side-by-side in a real browser at **1280px and 660px**. Record a mapping:

`HiFi element / interaction → product component → generated field/operation → typed state → browser assertion`.

Cover S10 T01–T12: filter/count reconciliation, probe toggle/deep link, version-change/GATES RESET disclosure, missing/published promotion, failed and abandoned cards, bounded 100-attempt virtualization, keyboard/focus, overflow, back/forward, dark/available/partial/not-published/error states and a console with zero warnings/errors. Keep fixture, contract corpus, actual API and pixel evidence separate. Do not re-record a global baseline to hide unrelated drift.

Return one receipt with commits, files/counts, generated revision, browser commands/viewports, console/network evidence, HIFI delta decisions and exact `CG-P19-*` requests only for genuinely missing typed source facts.

## Thanhvuong addendum (2026-09-24) — visual decision ledger and rule for later phases

Phần trên của codex giữ nguyên; mục này chỉ bổ sung.

- **Quyết định Bobby 2026-09-24:** S10 version này chốt theo đúng hi-fi; điểm nào không hợp lý thì mở version mới để làm gọn scope.
- **Trạng thái S10:** code `c9dd195e` (R1) khớp hi-fi 7 điểm, ghi thành ledger `VD-P19-01…07` trong [Unified note P19](../../../UNIFIED_IMPLEMENTATION_PLAN.md#p19-thanhvuong-frontend-implementation-note--screen-10-2026-09-24). Receipt R2 cùng head: vitest 3067 pass · 1 skip, S10 52/52, probe Research 119/119; chi tiết ở [receipt §13](./thanhvuong-frontend-receipt.md#13-vòng-khớp-hi-fi-r1-c9dd195e-và-receipt-r2).
- **Còn treo:** hai ngoại lệ spec-over-hi-fi (`VD-P19-02` thứ tự band, `VD-P19-04` bước rail 22/26) chờ Bobby; ô hi-fi thiếu field chờ `CG-P19-03…08`, `10`, `14` ([backend requests](./thanhvuong-backend-requests.md)).
- **Rule cho P20+** (bản đầy đủ ở Unified note):
  - màn phải khớp cả hi-fi lẫn spec, lệch thì hi-fi thắng;
  - FE không tự chọn lệch: ghi `VD-PXX-NN` vào ledger của note phase và vào handoff phase; cần thì mở version mới;
  - ô hi-fi không có field giữ đúng vị trí và hình dạng hi-fi, hiện typed absence, kèm request `CG-PXX-NN`;
  - nợ mới phát sinh khi làm P20 ghi vào cả handoff lẫn Unified.
