# Remaining backend and Claude requests — 25 October 2026

## Scope and verified pins

Read-only inventory requested by Bobby; no new implementation, phase entry,
runtime installation, UI modification or source qualification. Snapshot:
25Oct2026 21:52 Asia/Saigon /14:52UTC. Canonical685bc1915db51c7869254c1fdfa68991d7e4aae4,
Claude00e7f6cff2fadbd88b8ed461fa870b28ee88ad94 and integration
d2827483114e5b9a7137f90a0cb2f18085e8a624 are clean at inspection. No new
committed Claude request/ACK since the preceding checkpoint. Runtime/peer
source pins in the existing returns are historical observations, not refreshed
network observations in this review. Edge remains the sole TS/PM coordinator.

One existing independent reviewer reused; no new agent, build, database test,
SSH mutation or test cell. Primary checked the key source paths and owns this
inventory/sync only. SOURCE_REVIEW is not a new PASS receipt.

## 1. Concrete implementation residuals

| Request / area | Actual missing work and evidence | Next owner / dependency |
| --- | --- | --- |
| FE-CAT-4 / DEBT-UXM07-052, Accounts list | `apps/control-api/src/manager-lists/manager-lists.service.ts:511` reads only identity/venue/sync; `:952` does not populate `listFigures`. DTO, migration151, persistence, counts and FE reader already exist. Connect one authorized same-snapshot batch financial carrier; no per-row network fanout or invented equity. | Portal implementation; Edge returns qualified financial carrier/semantics before real population. |
| Remaining finite native reads | `apps/control-api/src/execution/native-review-profile.ts:27` widens named Account/Alpha overview only; deployments/operations/current relations and stream have their own listed routes. Fleet/Portfolio and other routes are not implicitly converted. Map each actual consumer route to its own final-authority/physical-delivery path, not a broad allowlist bypass. | Core composition; exact source/rights before mounting each route. |
| FE-067 / FE-072, scoped runtime/session | `execution/scoped-stage-facts.ts:19` explicitly excludes these fields; `execution/scoped-stage-wire.contract.ts:85` refuses positive runtime/session facts. Requires reviewed field vocabulary, scoped DTO/policy and mapper with negatives, not just a UI toggle. | Portal contract/mapper can be prepared; Edge supplies authoritative source fields. |
| FE-050/051 / FE-CAT-9, account metadata | `resource-read/scoped-resource.contract.ts:32,69,109` lacks requested credential scopes/expiry, account modes, margin ratio and long/short details. `execution-v2/manager-current-accounts.ts:135` serves only accounts/balances. Extend the closed scoped path coherently; open legacy rows/fixtures are not delivery of this path. | Portal schema/mapper; Edge catalogue/grain/field authorization. |
| FE-052 / FE-072, order execution | Scoped orders at `resource-read/scoped-resource.contract.ts:141` lack order-level filled quantity/VWAP/slippage/per-currency fees; `execution/stage-rows.ts:94` retains missing leverage/ack latency. Bracket leg quantity/average price already exist; do not describe all execution data as absent. | Portal contract/adapter; Edge owning order aggregation, correction and completeness semantics. |
| DEBT-029 / FE-CAT-5, NET_PNL | `execution-v2/manager-economic-source-reducer.ts:2` is explicitly DARK; `manager-model.ts:112` deduplication is not a runtime economic-leaf NET_PNL mapping. Wire shared dataset/series builder only after accepted source identity/census/ownership mapping. | Portal integration + Edge-coordinated economic source acceptance. |
| FE-CAT-2, Operations health | `operations/operational-read.service.ts:187` leaves `healthPlan` undefined. Contract/helper/consumer exist; owning delivery/applied-through axes and exception family are not wired to a production view. | Portal view/refresh after Edge confirms sources and vocabulary; no counts derived from one loaded page. |
| FE-070, calendar | `paper-read/paper-read.service.ts:434` always returns the unpublished calendar variant. DTO and mapper exist. | Wire owning venue calendar through Edge, then exact venue/session tests. |
| DEBT-026 /027, realtime | `execution-v2/alpha-fleet-realtime.service.ts:153` still marks Edge notices NOT_COMMISSIONED. `execution-v2/access.service.ts:882` documents CLI hints as process-local no-op; cross-process fast notification is absent. Current per-poll/final-write fences remain authoritative. | Qualified notice stream + independent STREAM rights. Cross-process hint is a bounded latency improvement requiring its own design/disposition, not proof of a permission bypass. |
| DEBT-047, Paper history | Downsampling and multi-series tests exist, but total byte policy/large-row bounds, real PG plan and transport measurements remain qualification work. Do not repeat the retired synthetic17.13MB claim as a real HTTP result. | Portal impact review and bounded response/measurement design; affected source/candidate only. |

FE-046 already has paging and nullable sequence/command/receipt parsing; real
values depend on owning source. FE-068/DEBT-042 advisory eligibility exists,
but Return capital/Lock allocation/Deploy version/Rotate credential and
canary/live families are not commissioned. These are distinct actions, not
aliases for recall/register/maintenance. Command STATUS implementation is not
permission to SUBMIT or trade Live.

## 2. Phase-level residuals

| Phase | Remaining exit work |
| --- | --- |
| ELP2-05 | Financial proof/verifier/channel, genuine receiver COMMIT→APPLIED→durable source ACK, correct financial mapping. Owning factories already have source/tests; deployment caller/source commissioning is separate. |
| ELP2-06 | Complete finite Manager reads and closed scoped fields; source/identity/trust binding; actual Accounts/Portfolio/Exposure consistency. |
| ELP2-07 | Commission existing-original STATUS/recovery through Edge; independent gateway/authority. Uncommissioned SUBMIT/Live remains off. |
| ELP2-09 | Qualified CURRENT/STREAM and separate HISTORY/REPLAY rights; cache/cursor/SSE/revoke/restart/recovery acceptance. Reuse valid earlier receipts only after impact analysis. |
| ELP2-10 | Finish integrated gates/landing, accepted budget/calibration artifacts, matched coexistence/G2 workload and actual-source browser acceptance. |
| ELP2-11 | Not entry-ready: integrated migration/preservation, restore/rollback, final manifest/handoff after prior gates. No release/dev/main promotion implied. |

## 3. Do not redo delivered work

The six packages linked graph, Fleet stage timing, persisted visit digest,
Accounts figures contract/repository, Contributors continuation/attribution,
and names/finance contract/fixtures are source-delivered. Do not recreate them
from stale OPEN rows. Last-sign-in from successful login audit, decimal Stage
Drift, request-key lookup, FE-073/074 and incident advisory eligibility are also
in the inspected source. Latest Claude includes `group_page` consumption;
the older handoff's "not observed" wording is superseded at this source pin.
Source-delivered does not mean installed or browser/source-accepted.

## 4. Qualification and request handoff

The already-running official compare-only visual has progressed beyond480/703
and emitted actual failures, including400 Fleet query and501 reader responses
in coexistence lanes. This is NOT a green visual gate. Classify exact request,
fixture, served-contract and source-revision causes before assigning a backend
or frontend fix; do not suppress console assertions or re-record baselines.
No terminal count is claimed here. Repaired full R2 remains NOT_STARTED;
earlier full failure and focused158PASS remain distinct.

ACT_NOW: resolve integrated consumer/contract failures and complete frozen
landing gates without heavy overlap. NEXT_GATE: Accounts batch projection,
remaining native finite-reader composition and scoped runtime/session contract;
then financial/NET_PNL and remaining source-bound families. Source-readiness
must not block independent contract/fixture work. INFO: no new public DTO was
delivered by this inventory; Claude has no new mapping task from this round.

Claude retains approved UI/component/baseline ownership and should reconcile
the stale debt rows against this cut. Core/Edge own exact source selection,
rights, trust and commissioning; no fixture value becomes a real financial
fact. No new Bobby decision is manufactured by this report.

Verification: R0 Markdown only; explicit diff/link/source-locator checks and
execution tracking check recorded with the commit. No new test coverage,
runtime resource or cleanup action; NO_ACTION_NEEDED. No push or canonical
ff-only landing in this review.
