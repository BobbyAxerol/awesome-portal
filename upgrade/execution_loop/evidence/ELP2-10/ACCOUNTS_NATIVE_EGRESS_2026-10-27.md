# Accounts CURRENT native egress — 27 October 2026

## Entry and assignment

Bobby explicitly assigns finishing the Accounts BFF's native custody through
physical HTTP delivery, then genuine source/rights/trust binding and independent
READ/STREAM acceptance through Edge. Canonical `/home/bobby/portal-research`,
`docs/research-loop-plan`, entry `c7b7137a7d06ab3338e8e988afeed46ed30d2be3`, clean.
Read [preceding investigation and independent design review](ACCOUNTS_CURRENT_COMMISSIONING_2026-10-26.md).
No frontend, push, stable/dev/main/provider28445 or command/Live change. No new
goal. Existing Research-only operational approval applies; no invented rights,
source receipt, expired window or copied stable credential.

## Single-writer map

| Owner | Files / task | Acceptance |
| --- | --- | --- |
| Primary | `read-scope.ts`, CurrentView authority/client/composition, AppModule, shared journal/receipt, integrated tests and operational source checks | Real held ticket, all original purposes, existing final native send, no detached native DTO |
| Accounts adapter writer | `manager-current-accounts.ts`, resource-read service/controller, corresponding tests only | Same closed Account360 DTO, complete source selections, native raw response with late hijack, no fallback/double-write |
| Independent reviewer | Read-only authority/egress review and test-gap audit; no shared edits or runtime | ACCEPT/CHANGE with exact invariant and locator |

Source API seam: internal `HeldNativeReadScopes` is minted only during genuine
`ExecutionReadScopes.deliverNativeTogether` build after checking all contexts,
never serializable, and dies at build exit. Native CurrentView calls must match
the exact principal/binding/requirement held by it, CURRENT/Paper only. Retain
target ACCOUNT plus each source pin; do not borrow the first grain's authority.
Existing source ENTER → final Core COMMIT → single physical send and same-original
terminal/ACK recovery remain authoritative. Maximum four distinct purposes;
only identical requirements may deduplicate. Public OpenAPI/DTO unchanged.

Implementation port for adapter writer: `CurrentViewCoreComposition` gains
`hasNativeCurrentRelations(): boolean` and
`deliverNative(principal, selections, response, build(read), validation)` where
`read(selection)` returns the existing `{ status: 200, body: Buffer }` and
`validation` supplies optional async `validateAfterEnter` and synchronous
`validateBeforeDispatch`. Only primary edits this core port.

## Verification and resources

Focused ordinary/native scope, CurrentView authority/client/composition,
Account360/controller and actual factory tests; production no-emit typecheck.
One combined lane after integration, not repeated full build/hooks. Native
custody engine/DB schema unchanged unless evidence identifies a real defect;
reuse only compatible engine receipts, never as a new connected result.
Any isolated operational cell remains within approved 2 CPU/1.5 GiB/300s and
heavy-test scheduling. Real READ/STREAM/browser is NOT_RUN at entry. Source,
image, effective config and migration pins must be recorded independently.

Rollback: selected composition OFF/drain only its genuine obligations, preserve
all source/Core audit/custody and original attempts. No broad cleanup.

## Implemented source and independent review

Code commit **`6964b48640a180f564c45592e02009837255355f`**, canonical Research:
15 files, **+935/−50** (production 8 files +269/−40, tests 6 files +601/−10,
compact machine-readable receipt 1 file +65). No frontend changes. This is an
R1 focused source delivery under campaign §10.10c, **not** an installed/connected
or full-R2 delivery. The earlier BFF implementation gap is now implemented;
the operating/source acceptance gates below remain distinct.

- `read-scope.ts`: genuine issuer-bound WeakMap ticket exists only inside the
  validated native composition build. Exact actor/session/authentication time,
  viewer/workspace, binding, dataset and requirement must match. DB-only checks
  before/after awaited work; no replacement source observation or authorization.
- CurrentView authority/client/composition: retain the ticket through each real
  finite Edge request and reverse resolve/recheck. The complete BFF has one
  tracked native delivery; its allowlist is captured before awaits. Identical
  requirements may share field unions; different obligations are not dropped.
  Actual source ENTER, final Core COMMIT, physical send, source terminal and ACK
  are still owned by the existing native engine. Private query completion is
  **not** SERVED. No READ→STREAM/HISTORY/REPLAY/export expansion.
- `ManagerCurrentAccounts`: native mode refuses the ordinary detached DTO path.
  It holds the requested ACCOUNT and every source-selection ACCOUNT, even when
  a selection is pinned to a different account. All current grains use the same
  `manager-current:ACCOUNT` dataset binding; exact-resource filtering preserves
  separate purposes. Account/balance facts only; no policy or financial panels
  invented from the three source grains. Public DTO/OpenAPI unchanged.
- Metadata is requalified after ENTER; expiry, running state and response
  ownership are checked synchronously immediately before dispatch. An async
  pre-dispatch validator is rejected rather than introducing an unsafe await.
- Resource service/controller: actual raw response passed into native delivery;
  Fastify hijack happens late. After native ownership, an error/lost ACK cannot
  trigger framework fallback or a second response. Other resource routes and
  the ordinary default remain unchanged.
- Actual AppModule CurrentView factory now selects the installed finite native
  scopes when present. Both actual-factory suites cover optional injection and
  default behavior; constructor never implicitly starts the listener and its
  loader-owned TLS buffers are still wiped.

Independent review **ACCEPT** after one genuine bug was fixed: hashing a `Date`
object collapses authentication-time differences. The held identity now hashes
`authenticationTime.valueOf()` locally (no global digest semantics change),
with a one-millisecond mismatch regression. The suspected target/source-purpose
collision was investigated and **not reproduced**: the existing non-ROOT
exact-resource filter retains distinct tupleless ACCOUNT obligations. No safety
fence was weakened for either case.

## Actual tests, scope and cleanup

One final integrated lane, 26-Oct **17:46:19–17:46:56 UTC** / 27-Oct
**00:46:19–00:46:56 Asia/Saigon**, **9 files / 321 unique PASS, 0 FAIL, 0 SKIP**,
reported duration 36.77s, one worker, no PostgreSQL/Docker/load gate.

| Suite | PASS |
| --- | ---: |
| current-view-authority | 34 |
| current-view-composition | 17 |
| current-view-edge-client | 16 |
| current-view-held-native | 30 |
| current-view-installation | 5 |
| native-current-manager-series | 22 |
| manager-current-accounts | 40 |
| native-research-review-mode | 130 |
| resource-read | 27 |

The new cases cover exact/dead/clone/foreign tickets, wrong user/session/time/
workspace/dataset/resource/fields, target plus source purposes, temporal grant/
session ceilings, revoke between grains and after ENTER, metadata changes,
scope overflow, ordinary native refusal, shutdown/context cleanup and late
ownership/lost-ACK no-double-write. Real loopback mTLS/private reverse callbacks
run against actual Core auth/evaluation. DB/source/physical-egress ports are
explicit **TEST_ONLY doubles**: these are not a new native-provider, PostgreSQL,
real-source or browser receipt. The unchanged engine's earlier custody tests
remain component evidence only, never relabelled connected.

Final production `tsc -p tsconfig.build.json --noEmit --incremental false`:
**PASS**. Tracking reconciliation and `git diff --check`: **PASS**. No full
hook/build repeated: campaign §§10.10a/c select the affected backend lane for
this intermediate commit. Existing full-R2, hygiene and visual debts from local
consolidation are **not waived**, repaired or counted as new failures here.

Shared-code counterfactual per §10.10a.5: isolated detached worktree at entry
`c7b7137a7…`, only the updated composition test copied via patch. All nine
ordinary/default cases **PASS** (8 deselected); positive native multi-grain case
**fails as expected** because entry code has no `deliverNative`. The same
positive case passes in the new source. This temporary worktree and its one
dependency symlink were removed; all test listeners/sockets closed. No shared
worktree/ref, pool, grant, source custody, trust or service was removed.

Earlier attempts are not hidden: sandbox initially refused loopback bind
(`listen EPERM`, 25 transport cases); rerun used the permitted loopback cell.
The expanded harness initially read `query` instead of the preceding resource
URL segment, causing seven failures; corrected the harness, not authority
expectations. Separate writer/focused counts overlap the final 321 and are not
additional coverage.

[Compact result and raw-report hash](accounts-native-egress-20261027.test-results.json).
Original 133,188-byte Vitest report retained locally, mode0600, outside Git:
`/home/bobby/.local/state/portal-execution-accounts-native-egress-20261027/vitest.raw.json`,
SHA256 `0fe20f290f0bdaf5d4f6261bf6d3aa9dc1e26db74b7c07ab623e7c5b4ddb457a`.
The checked-in summary avoids hundreds of duplicate assertion descriptions.

## Fresh operational observations — source is not installation

Read-only HK audit at **26-Oct17:49:07UTC / 27-Oct00:49:07VN**:
Edge remains `8727e5303b1815d54bc2bdcb927a55457ff4da5b`, existing peer Markdown
WIP preserved; owned policy-wire remains clean
`86178d694abf156453cdf450553fa80bdd9becab`. Latest inspected public return is
the 26-Oct source-reuse packet; no newer valid READY/original was evidenced.

The private gateway already implements ROOT_RECEIPT and FINITE_CURRENT, but its
real registration needs exact issuer/subject/workspace/workload, correspondence
ID/version/manifest hash and original grant/accepted-fact digest; CURRENT adds
actor/principal/actions. The PM public factory return explicitly remains
uninstalled without an actual deployment caller. Public qualification vectors
are TEST_ONLY. A private directory/UNAPPROVED reference or the old source seal
is **not** a genuine accepted registration. This public audit does not establish
that no valid registration exists anywhere: the coordinator must resolve the
actual selected private reference against the owning source.

Read-only actual Research inspection at **26-Oct17:52:05UTC** confirms image
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`,
tag `local/portal-research-core-current-view:20261023-forward151`, effective
`retained_review_v1`. The **actual loader names**
`CONTROL_API_NATIVE_CORE_CONFIG_FILE`, `CONTROL_API_NATIVE_ROOT_CONFIG_FILE`,
`CONTROL_API_NATIVE_CURRENT_CONFIG_FILE`, `CONTROL_API_CURRENT_VIEW_CONFIG_FILE`
are all UNSET. An initial presence-only check used non-loader aliases; it is
superseded by this loader-name check, not used as evidence. No env secret values
were output. Code commit6964 is not in that running image.

Native Research trust last observed expired25-Oct12:59:52UTC. Separate Manager
PKI cannot substitute. No old slot/grant/CA was extended or copied; no fresh
session/grant/trust, migration, installed image or connected receipt this round.

## Ordered remaining work and Claude handoff

| Owner | Next action / exact acceptance | State |
| --- | --- | --- |
| Core coordinator working through Edge | Resolve/select the actual accepted ROOT/CURRENT original and registration in the owned source candidate, or commission it through the official source writer. Match issuer, subject, actor/session/workspace, actions, correspondence/version/manifest and source approval pins. Install the already-written gateway/factory deliberately; do not insert SQL or call a TEST_ONLY vector real | NOT_INSTALLED; not an unspecified external wait |
| Core | Prepare matching fresh Research-only purpose-specific trust after source readiness; build the integrated backend once, backup and forward-migrate152–154, assert existing private schema, install the four pinned configuration references | NOT_RUN; existing approved limits/rollback, not a new credential decision |
| Core | Run official install-policy/accept-root with that same pool/coordinator/original; actual finite Account360 API, wrong workspace/revoke, same-original recovery and source terminal/ACK. Preserve all custody/audit if uncertain | NOT_RUN; BFF source implementation is no longer missing |
| Core/Edge, then Claude | Independently commission STREAM and prove active revoke before expiry, restart/recovery, cache/cursor/SSE; take browser receipt against the exact installed image/principal/workspace | NOT_MET; READ never grants STREAM |

**Claude:** no new public field/enum, generator, component or layout change.
Keep existing Account360 consumer and fixtures. After actual install, verify
the named basic resource route with the provided real principal/workspace;
broader Manager account overview and other resource readers are not implicitly
converted. Do not retake F5 using this source receipt or the old retained image.
Return API/source/image pins and observed panel states, not fixture-as-live.

Independent next-ready backend: the actual ROOT/CURRENT source selection and
Research installation above, without waiting for financial/Score/Calendar.
Financial proof/APPLIED, STATUS gateway, budget/calibration/G2 and broader
connected/browser qualification remain independently open. **ELP2-10 stays
open; ELP2-11 not entered.** No UI, push, dev/main/stable/provider28445 or
command/Live change. Rollback remains selected-composition admission OFF +
drain/recovery of the same originals; preserve authority/audit/history.

Documentation verification: **R0**, scoped Markdown diff/link/tracking checks
PASS; no build/tests repeated for this documentation-only journal commit
(campaign §10.10d). Code is already committed above; no peer source or WIP
included. No goal created/resumed, no remote push or runtime installation.
