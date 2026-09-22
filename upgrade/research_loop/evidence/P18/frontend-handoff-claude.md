# P18 frontend handoff — Screen 09 Run Report, print and bounded export

**Backend state:** `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK`. Screen 09 product/browser/print acceptance is Claude-owned. Do not claim runtime activation, a real QuantBT run or `PRODUCT_ACTIVE` from this handoff.

## Read first and record `READ`

1. `CLAUDE-FOR-thanhvuong.md` A13.1–A13.4, the P18 guide/spec/HiFi HTML at 1280px and 660px, and [P18 phase report](./phase-report.md).
2. RS-03 plus P13–P17 handoffs. They define the current source profile and typed absences that Screen 09 must preserve.
3. Generated source only: `packages/contracts/openapi/research-report.openapi.json` and `packages/contracts/generated/research-report.d.ts`.

Generate before consuming:

```bash
npm --prefix packages/contracts run generate:research-report
```

Do not hand-write report/export DTOs, hand-parse errors, calculate financial values or modify P18 backend/migrations/flags. Do not overwrite existing P12 frontend WIP.

## Exact named consumer boundary

| Operation | Use |
| --- | --- |
| `researchReportDetailGetV1` | One same-origin immutable report read; preserve returned ETag/revision and UTC/exact-decimal strings. A 304 retains the exact current revision. |
| `researchReportExportCreateV1` | Existing same-origin CSRF/origin mechanics only. Offer JSON/CSV only and reuse returned job; never generate a client filename, PDF, Parquet or archive. |
| `researchReportExportStatusGetV1` | Poll only while `QUEUED`/`RUNNING`, with one bounded interval and cleanup on terminal, unmount or hidden route. Never poll a report itself. |
| `researchReportExportDownloadGetV1` | Use only when typed state is `READY`; its `download_href` is opaque/same-origin. Do not download or poll on mount. |

Treat `400/401/403/404/409/503` as typed panel-local states. A `409` job is not ready; do not create a replacement job in a retry loop. Foreign/not-found objects must remain indistinguishable. No browser input may name a workspace relation, source cursor, revision, lease, worker, artifact path or command.

## Rich but truthful Screen 09 rules

- Keep the approved HiFi shell, hierarchy, dense evidence layout, print hierarchy and responsive geometry. Replace content inside an affected panel; never replace the entire route with an unavailable envelope.
- Render `frozen_core` exactly: UTC milliseconds as supplied, exact decimal strings without JS math, current scope/origin/availability labels and report/source revisions/digests. A report never changes because a user inspected a trial.
- `source_digests` are identification/provenance only. Every physical artifact is currently `NOT_PUBLISHED`, because P04 does not expose artifact bytes. Keep a rich artifact panel with its exact typed reason; never offer a fake download or call an artifact/raw-market endpoint.
- Keep fold, optimizer/selection, audited fills, promotion, execution replay, Parquet and archive panels visible with typed absence. Do not turn an absence into a zero, guessed chart, generic “soon”, engine call or fixture.
- Approval annotation is separate from the frozen core. It is display-only in this phase; do not invent an edit endpoint.
- Use browser print CSS/page breaks only. No `doc-page.js`, custom element, hidden DOM body or client-side PDF route is authorized.

## Required browser/HiFi receipt

For 1280px and 660px record `HiFi element / interaction / product component → generated operation + field → typed state → browser assertion`.

Cover loading, available/partial/not-published, P04 fixed profile, 304, 400/401/403/404/409/503, JSON/CSV queued-running-ready-failed, hard refresh, deep link, keyboard/focus, overflow, print preview and no report mutation after a trial inspect. Prove no export polling after terminal/unmount and no request per print render. Keep fixture, contract-corpus, actual API and pixel evidence separate; do not re-record a global baseline to hide unrelated visual drift.

Return one P18 receipt with commits, files/counts, generated revision, mapping matrix, browser command/results/viewports, console/network evidence, source gaps and exact `CG-P18-*` requests for any genuinely missing typed field.
