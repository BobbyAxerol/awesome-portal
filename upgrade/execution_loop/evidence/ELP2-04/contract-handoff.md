# ELP2-04 — Scoped reader handoff to Claude

Status: **AWAITING_CONSUMER_REVIEW; NOT_RUNTIME_ACTIVATED**.
Producer branch: `docs/research-loop-plan`; base
`c1d6b2dc53f1f80ac44cdfd9d96d159c4e9aae64`. The closeout receipt in this
packet supplies the actual landing/test pin. Until that pin exists these
contracts are working-tree changes, not a deployed artifact.

## 1. What changed and what did not

The server selects legacy compatibility versus scoped V2 from current durable
policy. There is no browser flag to acquire scope. A removed/pending V2 policy
cannot fall back to legacy. Session, viewer/source workspace, profile, current
resource membership, field policy and source publication participate in the
scope and final delivery fence. The browser cannot supply a relation, authority
tuple, policy proof or trusted profile mapping.

Legacy response versions remain distinct. V2 uses finite DTOs and scoped
counts; it is not a legacy full response with some rows hidden. No frontend
file, layout, token or baseline is changed by this backend package. No source,
stream, mutation, preview or production activation is authorized by delivery.

## 2. Contract/consumer map

| Consumer | Published source / generated types | Required behavior |
| --- | --- | --- |
| History | `execution-history.openapi.json` / `execution-history.d.ts`; `executionRetainedHistoryGet` | Exact decimals, UTC-ms public times; opaque server continuation. Preserve null/zero and authorized coverage across pages. Private microsecond cursor prevents duplicates without exposing extra precision. |
| Fleet, Portfolios, Bindings | existing `execution-manager-lists.openapi.json` / `.d.ts`, response union with scoped Manager DTO | Scope before search/sort/count/page; `profile_dispositions` explains partial all-environment reads. Do not turn denied profiles into zero totals or drop permitted profiles. Portfolio pagination accepts bounded after/before. |
| Alpha/Portfolio/Account/Binding detail | `execution-resource-scoped.openapi.json` / `.d.ts`; four `executionScoped*ResourceGetV2` operations | Consume finite panel fields. Shared-account identity is not permission to display the account's whole balance. Financial summaries may remain typed unavailable while authorized raw panels are available. |
| Adapter and Alpha/Account records | `execution-scoped-records.openapi.json` / `.d.ts`; `executionScopedAdapterGet`, `executionScopedAlphaRecordsGet`, `executionScopedAccountRecordsGet` | No generic raw payload rendering. Query/filter only published fields; preserve scope-bound cursor and availability. |
| Technical health/diagnostics | same scoped-records file; `executionScopedTechnicalHealthGet`, `executionScopedTechnicalDiagnosticsGet` | Technical permission is independent of full business read. Do not show topology, global findings/counts or raw admission diagnostics in a business-only view. |
| Retained banner/context | existing `execution-retained-review.openapi.json` / `.d.ts`, V1/V2 union | V2 does not publish global history counts/clocks. Null is “not published”, not zero/current time. Retained mode never implies stream or mutation permission. |
| Local query analytics | existing `execution-query-analytics.openapi.json` / `.d.ts`, additive `execution.query-analytics-envelope.v2` | `scoped_metadata` states authorized-only coverage. Global observation clock is null; `as_of` comes only from authorized record timestamps or is null. Do not cast V2 into V1. |
| Named retained operation pages | `execution-retained-operation-page.v1.schema.json` additive scope fields | `visibility`, `coverage`, `read_scope` travel together. Authorized observations do not upgrade rejected/current-source authority or claim replay. |
| Command Center | existing `execution-command-center.openapi.json` / `.d.ts` additive `read_scope` | Fleet counters are visible-deployment-only. Unresolved Portal workflow/journal/reconciliation cards keep explicit reasons, not fake zero or whole-screen denial. |

All OpenAPI/schema/generated paths above are relative to `packages/contracts/`.
Regenerate with `npm run generate:execution-history` there (chains the scoped
families), and the existing Command Center generator for that existing file.
Canonical examples are `fixtures/execution-*.synthetic.valid.json` and
`fixtures/execution-query-analytics.scoped.v2.json`. Their lane is explicitly
**TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT**; they must not be shown as real users,
real grants, accepted TS mappings or current runtime facts.

## 3. Refusals and continuation

- Preserve HTTP 400/403/404/409/503 and typed error codes. Unknown and hidden
  resource lookups must not become an existence oracle.
- `EXECUTION_READ_ACCESS_CHANGED` invalidates a flight/cursor after policy,
  session, membership or publication changes. Start a fresh authorized read;
  never retry by stripping the cursor's authority or switching to a legacy API.
- `ANALYTICS_SCOPED_TRANSPORT_NOT_COMMISSIONED`,
  `MARKET_CONTEXT_SCOPED_TRANSPORT_NOT_COMMISSIONED` and
  `EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED` describe exact unqualified V2
  transports. They do not mean all local scoped reads are unavailable.
- Public venue price candles and private Market Context are different sources;
  public-data permission is not a grant to private account/market projections.
- Refresh performs a new authorized read. Never cache effective permission with
  immutable payload, infer export from read, or reopen a global stream after a
  V2 refusal. Current gate authority still controls Governance separately.

## 4. Claude work and acceptance

When Bobby assigns frontend: inspect existing shared components and UX guide;
add typed V2 branches, manager/researcher variants, per-profile partial states,
safe missing-clock/financial-summary copy and opaque pagination. Preserve
workspace deep links and Research consumers. No design implementation is
assigned by this handoff alone.

Fixture gates: schema union narrowing; full/own/linked-shell/denied/empty;
missing global metadata; revoked cursor; technical-only versus business-only;
no stream/poll fallback; no hidden totals in text/tooltips/export buttons.
Real API/browser gates require a separately qualified source/profile and
approved policy; test fixtures do not meet that prerequisite. Record
`ACCEPTED` or `CHANGES_REQUESTED` with producer pin, bundle/API identity and
receipt. Producer delivery alone cannot close consumer acceptance.

## 5. Remaining dependencies and next phase

Read the current route-census disposition and closeout receipt before enabling
any V2 policy. Parent Governance/incident/workflow target lineage, source
publication and exact technical field policy must not be inferred from a
workspace role or a scoped child panel. The external decision/request IDs in
ELP2-00/03 retain their original owners. ELP2-05 is not started by this package;
dependency readiness and owner assignment are separate.

## 6. Prompt for the next explicitly assigned Claude review

> Read Unified §14 ELP2-01…04, this handoff, `closeout-2026-10-16.md` and
> `route-census-closeout.md` on `docs/research-loop-plan`; pin the producer
> commit before changing a consumer. Review generated V1/V2 narrowing and the
> canonical TEST_ONLY fixtures. Wire only the screens Bobby assigns, preserving
> the accepted shared UI and workspace/deep links. Show authorized-only counts,
> per-profile partial states and null clocks/financial summaries truthfully.
> Do not enable policy/source/SSE or replace a commissioning refusal with an
> empty list/zero/legacy request. Catalogue readiness is not permission.
> Acknowledge ELP2-REQ-04-010 as ACCEPTED or CHANGES_REQUESTED, with exact
> component/operation/field and receipt; record fixture versus real API/browser
> separately. Any missing positive parent/alias contract belongs to008/009,
> not a frontend workaround. Do not open the next backend phase or deploy.

This text is a prepared handoff, not proof that Claude received or accepted it.

## 2026-10-17 — additive finite readers, consumer still owner-held

Read [the exact producer packet](finite-account-command-readers.md) first.
Account-sync current/snapshot use the existing named-page DTO, five public
candidate fields and their distinct source clocks; private sync_id stays
private even in legacy. V2 field/resource/current-source scope is not widened.
Other27 unclassified aliases remain closed; no complete-history/health claim.

Additive `executionCapitalCommandCollectionV1` publishes `CommandCollectionQuery`
and `CommandCollection` in `execution-trusted-commands.d.ts`. Require explicit
workspace/resource_kind/resource_id/environment. limit1..100(default25), signed
after; no global totals/mixed queue. Preserve UNKNOWN/null amounts and four
status axes. Hidden/unknown404, invalid400, refresh409 and unavailable503 are
not empty successes. Canonical synthetic fixture is
`execution-trusted-command-collection.synthetic.valid.json`.
Regenerate with `npm --prefix packages/contracts run generate:execution-trusted-commands`.
Existing submit/detail schemas and UI remain unchanged. Source at this entry
is UNCOMMITTED/NOT_RUN; consult terminal addendum before consumption.
AWAITING_CONSUMER_REVIEW / NOT_STARTED_BY_OWNER_DIRECTION, not delivered UI.

**Producer landed,2026-10-17T20:07Z:**
`5cac1151e27a3276ed9c32f56fe485197c2cdcaa` supersedes UNCOMMITTED for the
finite readers above. [Actual hook/restore/source and cleanup receipt](finite-account-command-readers.md#finite-reader-terminal-20261017-2007).
No further schema/field change in this addendum; do not rerun or regenerate
unchanged contracts just for this record. Consumer still awaits Bobby's
assignment and Claude's actual acknowledgement/browser receipt.
