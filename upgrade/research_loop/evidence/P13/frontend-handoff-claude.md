# P13 frontend handoff — Screen 04 Evidence Flow Hub

> **RS-01 amendment (2026-09-22):** regenerate `research-evidence.d.ts`. For
> R2 render generated registry labels/scopes, exact decimals and
> `series_metadata` sampling/coverage/omission facts. Never derive monthly,
> rolling or histogram values/endpoints in TSX, or present R1 wording as R2
> truth. Digest/revision mismatch stays a panel-local typed unavailable state.
> See [RS-01 handoff](../RS-01/frontend-handoff-claude.md).

**Astra review addendum — 2026-09-22: `AUDIT_REOPENED`.** Read the
[P13–P17 audit/remediation guide](../../P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md)
and Unified checkpoint before using this handoff. The v1 facts below describe
a partial fixed-profile surface, not full screen/backend acceptance or proof
that QuantBT lacks the omitted capabilities. Preserve your rich composition;
consume new generated contracts per panel when published. No backend/runtime
change is authorized by this audit note. Finish/preserve your P12 work.

Backend and generated P13 contracts are ready, but **feature/runtime remains
dark**. Work only in the Research Screen-04 composition, route, client and
tests you own. Do not modify P13 Control API, migrations, runtime role grants,
worker/QuantBT adapter, progress relay, deployment overlay or Execution code
to make a panel render.

## Mandatory reading chain — record `READ`, do not skip

1. [`CLAUDE-FOR-thanhvuong.md` A13.1–A13.4](../../CLAUDE-FOR-thanhvuong.md),
   especially the full handoff-chain and browser-first HiFi rules.
2. P10/P11/P12 packets and handoffs: [`../P10/README.md`](../P10/README.md),
   [`../P11/README.md`](../P11/README.md),
   [`../P11 display-fact amendment`](../P11/contract-amendment-display-facts.md),
   [`../P12/README.md`](../P12/README.md), and the current P12 frontend work.
3. This packet and [phase report](./phase-report.md).
4. Screen-04 [spec](../../release-v1.1/docs/screens/04_evidence_flow.md) and
   `QuantBT 04 Evidence Flow.dc.html` **opened in a browser**, not merely read
   as text.
5. Generated source only:
   [`research-evidence.openapi.json`](../../../../packages/contracts/openapi/research-evidence.openapi.json)
   and [`research-evidence.d.ts`](../../../../packages/contracts/generated/research-evidence.d.ts).

## Use only these named operations

Regenerate before writing the client:

```bash
npm --prefix packages/contracts run generate:research-evidence
```

| Operation | Product role |
|---|---|
| `researchEvidenceHubGetV1` | one Hub snapshot for Screen 04; retain ETag/revision and exact decimal strings |
| `researchEvidenceSeriesGetV1` | lazy per-tab/chart read for `EQUITY_OOS`, `MONTHLY_RETURNS`, `ROLLING_RETURNS_20` or `RETURN_DISTRIBUTION` |

Never call `/internal/*`, legacy alpha/run routes, a direct Portal/QuantBT DB,
artifact/Parquet/file path, worker journal, source transport or fixture API on
a product route. Do not decode a digest/revision or compute metrics/certificates
in the browser. A new operation/field must be a focused `CG-P13-*` request,
not a hand-written DTO or error-string parser.

## Required rich-but-truthful composition

Keep the complete Screen-04 visual shell and seven-tab hierarchy from HiFi.
Do not replace the whole route with a generic `Unavailable` envelope. Preserve
the selected passport/inspection context while loading each panel.

| Available P13 fact | Required presentation rule |
|---|---|
| Hub `metrics` | exact decimal/unit and registry-provided scope/origin; no JS float conversion or null→0 |
| `series` link + lazy response | request only the active/visible needed series; values are capped and may be sampled; do not eager fetch all four |
| same `revision`/ETag across Hub and series | render together; if a series revision differs, discard it, reread the Hub, then lazily retry that series |
| `source_absences`, `NOT_APPLICABLE`, `NOT_PUBLISHED`, `PENDING_SOURCE_CALLBACK`, legacy | retain panel layout with the exact typed reason; no faux line, metric, benchmark, funding, fold or certificate |
| P11 claim/certificate | render a grade chip only for a typed `ISSUED` certificate; a claim string never earns one |

P13 does **not** publish rich fold verdicts, split/search/freeze segments,
artifact manifest, replay/order ledger, broker evidence, benchmark/funding
series, research linkage, holdout proof or a promotion action. Keep their HiFi
panels/menus as panel-local typed source gaps with precise copy; do not invent
an authority state, timer or optimistic action.

## Browser/HiFi receipt is mandatory

Before claiming P13 FE completion, use a production-like build and compare the
open Screen-04 HiFi HTML directly with the implementation at **1280px and
660px**. The receipt must include the mapping:

`HiFi element / interaction / copy → component or panel → generated field or
operation → typed state → browser assertion`.

Exercise all seven tabs/drawers, active-vs-inactive lazy network coverage,
Hub/series revision mismatch discard, exact-value tooltip/table, resource
switch, hard-refresh/deep-link, loading/empty/partial/denied/unavailable and
keyboard/focus/overflow. Record console/network output and distinguish
`COMPONENT_FIXTURE_BROWSER_RECEIPT`, `PRODUCT_ROUTE_BROWSER_RECEIPT` and
`REAL_API_E2E_RECEIPT`. Do not re-record broad visual snapshots to make a
regression disappear; screenshots/traces/session state stay private.

## Checkpoint for return after quota reset

Claude currently has P12 frontend files unstaged in this shared worktree. Do
not stage, reset, reformat or absorb them while beginning P13. First inspect
`git status`, finish the P12 handoff owned files, then build P13 in separate
owned paths. Send Codex a Markdown receipt with files/line count, contract
revision, all handoffs read, mapping matrix, browser command/build SHA/routes/
viewports, test counts, console/network outcome, source gaps and a clear
no-debt conclusion. If blocked by a missing server fact, send exactly one
minimal `CG-P13-*` request with source locator and expected/actual; do not
silently downgrade the screen.
