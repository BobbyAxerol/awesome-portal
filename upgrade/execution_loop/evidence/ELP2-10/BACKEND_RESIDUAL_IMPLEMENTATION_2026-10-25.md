# Seven backend residual packages — implementation record

## Entry / assignment

Bobby explicitly assigned all seven residual packages after the 25 Oct inventory.
Implement independent Core work now; do not manufacture source financial facts,
change accepted UI, install shared runtime, enable command/Live or push.
Input integration `7129943770e695e61825876bdf1936c191ccbf92` includes both preserved
Core and Claude source. New owned worktree `/home/bobby/portal-backend-residuals-20261025`,
branch `chore/backend-residuals-20261025`; clean at creation. Canonical `685bc1915`,
Claude `00e7f6cff` remain unchanged/clean. No new committed Claude request/ACK.
The previous visual runs on its frozen OTHER worktree; no edits there.

## Task / write ownership and exit matrix

| Package | Writer / owned paths | Required result |
| --- | --- | --- |
|1 Accounts +6 Operations health | Accounts/projection helper: manager-lists service, dedicated financial batch mapper and tests; operational-read health wiring and dedicated tests | Same-authorized-snapshot batch projection, no N+1; real optional carrier validated, absence preserved; source-backed health plan, no page-derived totals. |
|5 NET_PNL | Economic helper: manager economic reducer/builder/model/series implementation and focused tests, not shared schema/generator | Shared accepted input mapping for dataset/series, ownership/census/cut/revision/dedup checks and parity; no false complete or default zero. |
|7 History/realtime/calendar | Bounded-read helper: paper history/read helpers, calendar adapter, realtime/auth hint modules and tests | Explicit response-byte bounds and continuation; calendar/notices only from a verified source; cross-process revoke hint never replaces final authority fences. |
|2 Finite readers +3/4 scoped runtime/metadata | Primary: native current composition/controllers, scoped/read vocabulary/contracts, shared OpenAPI/schema/generated/fixtures and integration | Named principal-bound finite delivery, policy-filtered metadata/runtime/session, exact decimals/absence; existing defaults unchanged. |
| Shared files / migration / final integration | Primary only | Migration IDs reserved after census; one generation and affected build/test batch; explicit handoff and actual validation. |

No subagent commits, branch changes, heavy tests/builds, schema regeneration or
shared tracking writes. Writers read AGENTS/campaign rules, own package guide
and actual existing source before editing. Focused light tests only after lead
resource clearance; primary owns one serialized official PG/build batch and
independent review. Shared/public contract changes proposed to primary first.
No heavy overlap with the already-running official visual. Intermediate source
commits use approved R1; normal integration gate remains mandatory for landing.

## Validation / risks / rollback

Tests include positive supplied-source rows and absence; wrong actor/workspace,
scope/field denial, source/revision drift, same-snapshot joins, duplicate economic
leaves, zero versus missing, bounded bytes/pages and revoke during delivery.
Source-test proof, installed runtime, connected source and browser are distinct.
No initial PASS. No production numeric/budget/calibration approval inferred.
Rollback leaves this additive candidate unmounted; existing authority and old
readers remain; preserve originals, custody, data and both source histories.

## Progress and bidirectional handoff

Independent Core implementation is committed at
`fb9719ceaa2568f86a3c495f062cbbf6e8b8b84d`, tree
`4e8a94ed45766b9a67cb4e5fa77c09cf4002e2d3`:
70 files, **+6,525 / −334** (code/tests/generated contracts/integrity hashes).
The official affected PostgreSQL/build gate and bounded retake are terminal.
See §7 and [machine-readable results](backend-residual-test-results.json).
This is **not** installed runtime/connected acceptance or full ELP2-10 PASS.
Source inventory is retained in
[prior review](REMAINING_BACKEND_AND_CLAUDE_REQUESTS_2026-10-25.md).

### 1. Core implementation / exact residuals

| Package | Code implemented | What is NOT claimed |
| --- | --- | --- |
|1 Accounts | Optional owning financial refresh is called once for the whole original binding census, outside the replacement transaction; exact actor/session/workspace/environment, original source pages/cursor chain and cut are bound. Valid figures become `BindingProjectionRecord.listFigures` before `replaceBindings`. Local list reads reuse the original keyset batch in RR, no extra per-account SQL/HTTP. Wrong actor/cut/identity/currency/decimal refuses before replacement. | Edge has not supplied a qualified owning financial refresh adapter. The default retained adapter cannot invent missing figures. SCOPED_V2 has its own scalar/fact contract, not an implicit JSON/TEXT carrier for legacy `figures`. DEBT-052 is not closed as a real-source receipt. |
|2 Finite Manager | Native physical-send composition now covers Fund/Fleet/Portfolio/Deployment as well as Account/Alpha. Original action/resource and final publication/current-authority fences are retained. No ordinary fallback after a native error. Fund needs whole-population `business.read_all`; Portfolio its own read; Deployment an authorized exact tuple. | Not automatic migration of every unrelated Manager endpoint, ALL/sandbox/live, HISTORY or STREAM. Existing separately scoped readers retain their original authority. No new source provider is installed. |
|3 Scoped runtime/session | Separate reviewed detail vocabulary, source scalar mapper, same-authorized-deployment/session observations and closed Zod/JSON Schema support positive facts. No inference from `active` or source row existence. Session window remains partial, never complete reconciliation. | Observed RUNNING is not activation, source qualification, a STREAM grant or command readiness. Researcher policies gain no new detail names unless their reviewed artifact allows them. |
|4 Metadata | Closed Live/Resource DTOs and policy-filtered mappers cover account type, margin initial/maintenance, position side, order TIF/reduce/post-only/trigger, source session identity/clocks and exact fees. Optional filled quantity / average fill price are declared; zero/null/omission remain distinct. | Source catalogue's `conditional_order_group_legs.average_fill_price` is NOT aliased to `orders`. No unsupported new column is requested from the real `orders` operation. Complete order VWAP/credential-state fields still need their owning publication; partial fills are not silently treated as complete order execution. No credential bytes exposed. |
|5 NET_PNL | One owner-supplied economic mapper feeds real dataset/group/statement and retained-series callers. Source identity/leaves/census/ownership/cut/revisions are checked before dedup. Per-read frozen results and full proof snapshot pin row/group cursors even when amounts are unchanged. Stored calculator revisions survive rollback; incompatible old observations are excluded, never overwritten. | Accepted PM rules/proposal are not the missing PM/Edge wire mapping. No default trusted namespace, source ID or census is guessed. Missing source means absence, not fallback to duplicate sum. |
|6 Operations health | Qualified-source injection now reaches actual queue projection/query path; delivery/display axes and exceptions use the whole authorized filtered RR population, not the returned page. Binding is closed and source-invalid counts are refused. | The exact owning axes/view are not persisted by the present producer. `execution_operation_queue_health_v2` is a commissioning contract, not an installed table. No fake view/migration or status→delivery inference. |
|7 History/realtime | Same-cut UTF-8 byte census precedes loading selected dense/sparse history; whole response is bounded, oversized row/body returns typed413, never silent truncation. Sticky scoped CURRENT cannot open raw history; legacy needs independent HISTORY scope and final fence. PostgreSQL LISTEN/NOTIFY fans out bounded id-only revoke hints across processes with no echo, reconnect and shutdown cleanup. | New scoped full-history/native egress and actual connected Edge SSE/revoke are not certified. Notification is an accelerator, not authority/durable revoke. Trading calendar/Edge notice source still absent; settlement calendars are not substituted. |

### 2. Policy/resource changes and rollback

- No migration or production numeric calibration. History candidate policy is
  selected-history8MiB, maximum-row256KiB, full-workbench16MiB UTF-8; internal
  measured override uses `PAPER_HISTORY_BYTE_POLICY_TOKEN`. Existing exact
  history endpoint keeps keyset continuation and its own1MiB representation.
  These are byte-safety limits, not a newly measured production SLO.
- Revoke hint lifecycle uses a separate Core pool:2connections,1second
  connection/query/statement bounds, maximum4in-flight notifications,
  maximum1024-byte id-only envelope. No tokens/cookies in that channel.
  Dropped/unavailable hints leave authoritative current-policy/final-send
  fences intact. Shutdown destroys LISTEN socket before closing the pool.
- No shared runtime installed, no authority/grant seed, no UI files changed,
  no baseline re-record, no command/Live or source selection change.
- Rollback: keep candidate unmounted, or return to pinned source712994377;
  uninstall only the optional adapter, not data/identity/audit. Preserve old
  source-series revisions; mapping removal cannot relabel economic history.

### 3. Independent review and fixes found

Review ACCEPT: original finite actions/tuple authorization, filtering before
economic reduction, no shared-account hint dedup, final-send/current mapping
fences; bounded cross-process lifecycle and cleanup.

Review CHANGE fixed:

1. Economic→legacy/mappingA→B history could lose its calculation identity.
   Store now preserves it; materializer requires the expected calculator.
   Finite series refuses reserved `manager-series-economic.v1:*` after mapper
   removal while preserving previously accepted other source calculators.
2. Pagination pinned only mapper config, not resolved economic proof. Each
   read now freezes reductions by exact binding and fingerprints full resolved
   row/group/statement proof, not amounts alone.
3. Newly admitted session detail reached Resource reconciliation but its closed
   DTO did not declare it. Generator/schema/mapper are now aligned; explicit
   session observation is permitted only under the reviewed detail policy.
4. Workbench retained history was read directly after CURRENT resolution.
   Scoped CURRENT now keeps bounded CURRENT observations and reports missing
   independent history authority; legacy history is separately fenced.

### 4. Claude handoff — consume existing components, do not redesign

Read this packet and the source commit recorded below before updating readers.

| Consumer | Canonical published contract / fixture | Required mapping / acceptance |
| --- | --- | --- |
| Accounts list | Existing `BindingItem.figures` in execution-manager-lists; internal refresh/source helper lives at `src/manager-lists/binding-financial-batch.ts` | Preserve existing component. Use supplied exact amounts/coverage; absent figures stay absent. No per-account fetch loop; do not substitute raw wallet balance for native equity/headroom. |
| Scoped Live + stage details | `generated/execution-live-full.d.ts`, `LiveSourceOperationsReadV2`; `fixtures/execution-live-source.synthetic.valid.json.with_observed_stage` | Reader must accept positive observed `stage_facts.runtime` and partial sessions, exact fee/quantity values, false booleans and source null. Top-level activation/commands remain false/not asserted. Retain source/field absence behavior and deny hidden detail policy. |
| Resource360 | `generated/execution-resource-scoped.d.ts`, closed per-relation rows | Additive metadata only. Margin `initial`/`maintenance` are exact decimal text. Session ID/time is scoped business detail, not a global access proof. Never infer full fills/VWAP when source did not publish them. |
| Fleet/Portfolio/etc | Existing `ManagerDatasetResponse`, unchanged routes/DTO | No component rewrite. Same route now uses installed native finite delivery. Preserve workspace/environment/resource; do not start STREAM/HISTORY from a CURRENT success. |
| NET_PNL + series | Existing manager dataset/series DTO, typed reason/calc revision/provenance | Use server totals, not sum of shared accounts. Cursor refusal after economic proof drift requires refresh of that exact query. No UI-produced census/source identity. |
| Paper history | `generated/execution-paper-read.d.ts`; workbench GET now documents413 CommandProblem | `N33_HISTORY_ROW_TOO_LARGE`/`N33_HISTORY_RESPONSE_TOO_LARGE`: show bounded typed refusal; use existing authorized paginated history route if independently allowed. `workbench.account-equity-history / EXECUTION_READ_CURRENT_ONLY` must not hide authorized bounded CURRENT rows or imply a new HISTORY grant. |

Fixture/schema tests are not a real Edge/browser receipt. Claude owns fixture
consumer, overflow/visual and actual-source browser checks after source landing.
No fixture constants become source authority. ACK/consumer acceptance is OPEN.

### 5. Edge single-coordinator input/action list

| Owner via Edge | Exact next input/action | Core action when supplied |
| --- | --- | --- |
| Financial publication owner | Qualified financial refresh batch tied to original binding/source cut, plus full economic namespace/identity/leaves/census/revision mapping and current trust fence | Install matching private source adapters; qualify refresh→persistence→Accounts and dataset↔series parity. Do not seed money or re-label proposal SOURCE_VERIFIED. |
| Operations owning writer | Exact delivery/display axis carrier and scoped exception linkage/census, one-to-one queue projection identity | Commission the closed health view/source and measure same-filter aggregates. |
| Manager/catalogue owner | Actual account/order detail publication and semantics (not an alias from a different relation), session/runtime observations | Populate optional DTO members on the same authorized snapshot and run source-positive acceptance. |
| History/realtime owner | Separately qualified HISTORY/REPLAY/STREAM publication and finite/SSE trust/source pins; venue session calendar and notice envelope if supported | Complete each purpose independently, then connected revoke/restart/recovery. CURRENT does not grant the others. |

### 6. Backend next / phase disposition

Next Core implementation must address any failed affected gate first, then
commission each qualified source independently. Preserve valid receipts of
unchanged paths. ELP2-05/06/07/09/10 remain open for real financial/APPLIED,
business trust, original command STATUS/recovery and connected source/rights,
budget/calibration/coexistence/G2/browser. ELP2-11/release is not entry-ready.
No re-running whole engine or UI baseline simply because this Markdown changed.

### 7. Actual affected gates and measurements

Verification tier: **R1 source candidate only, R2 landing pending**. Campaign
§10.10c permits the affected backend/build/PG/contract lane for this intermediate
commit. It does not permit canonical ff-only while the integration gates are red.

| Check | Actual result / scope |
| --- | --- |
| Independent package tests | Accounts + Operations: 57/57; economic runtime/reducer/series: 226/226. These overlap the combined run below and are NOT added as extra coverage. |
| TypeScript no-emit | PASS on the changed backend source. |
| Contract tests | Five affected suites: 238 PASS before the final additive session field; the two directly affected schema suites then passed 16/16 on the final schema. No sum of duplicate coverage. |
| Generators / snapshot / integrity | All three changed generators `--check`, contract snapshot (709 files), and release integrity ledger `--check` PASS. Ledger refresh changes source hashes only; NO_GO/product activation remains unchanged. |
| Official affected API + real disposable PG | First attempt: production build PASS, 27/28 files PASS, 929/930 tests PASS. The sole failure was the new Fund test calling nonexistent `fund/overview` instead of existing `fund-overview`; there was no source ENTER. Corrected the fixture, not the route or authority. Restore was NOT_REACHED on that failed attempt. |
| Focused Fund + commissioning retake | PASS, 2 files / 142 tests (28 native finite + 114 commissioning), production build, migrations through 153, real dump/restore and versioned identity/session/command/custody preservation. Only those two specs were retaken, not the other 27 passing modules. Both runner exits and cleanup are terminal. |
| Default/new pure mapper differential | 11 unchanged scalar controls and unchanged BUSINESS vocabulary agree with source `712994377`. Four new positive scalar cases fail on the base and pass on the candidate. This is not a policy/authority proof: that imported function is deliberately unusable in this differential. An initial local harness spawn was sandbox-refused; a first expectation about the old newline grammar was incorrect and removed after observing the base, not hidden as a product PASS. |
| Tracking | `scripts/execution-tracking-test.sh` PASS. |
| Old frozen integration visual | FAIL, 474 PASS / 213 FAIL / 16 SKIP; see the separate qualification packet. Not rerun or re-recorded by this backend package. |

Official runner SHA256:
`969abe7a7b43d7361fcfe0555a4254a75d7312e29eb815cb0c82b673261bf322`.
Control API lockfile SHA256:
`81f9975ea19b321aea0e2e71ef6eead1b4ad19838434119e958ce59bafc76fa1`.
The runner uses pinned Node image
`sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
and PostgreSQL image
`sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`.
Its internal disposable cell has no public service and does not mount runtime DBs.

Actual SQL measurement in that disposable PG, 12,000 retained fixture rows,
three reads per requested size:

| Requested target points | Returned selected rows | UTF-8 selected rows bytes | Elapsed range (ms) |
| --- | --- | --- | --- |
| 100 | 102 | 17,137 | 220.219–254.233 |
| 200 | 200 | 33,601 | 225.864–240.204 |
| 400 | 351 | 58,969 | 261.295–307.909 |
| 2,000 | 1,342 | 225,457 | 248.876–309.537 |

The extrema-preserving selection is not an exact requested-row count.
This measures real repository SQL and the byte policy, **not** connected Edge
latency or a product SLO. The separate HTTP/component fixtures reach 100,000
rows, but their timings are not described as real source performance.

First official log (retained, including the failure):
`/home/bobby/.local/state/portal-backend-residuals/20261025/affected-api-pg-build.log`,
SHA256 `b81ddd064249e5df068d8e21d5193bf9fcd27b6966acebf85f47164dddff1770`.
Retake log:
`/home/bobby/.local/state/portal-backend-residuals/20261025/native-fund-retake-build-restore.log`,
SHA256 `a7cdd31ba321f24467a86485f40773e8e5241641d44a34641afa6f7783dd7dac`.

Final affected-test union: **29 distinct specs / 1,044 distinct test cases**
(902 unchanged passing cases from the other 27 initial specs + 142 in the
retake). This is compatible source evidence on the same production code,
not one invented all-green execution and not the full repository test suite.
Only the Fund fixture URL and commissioning test-double method changed after
the initial run; the other 27 specs and all production source are byte-identical.

Cleanup: runner-owned Node/PG containers and internal networks removed by the
runner trap. Read-only Docker inventory afterward found zero `control-api-test`
containers or networks. Direct unprivileged Docker inspection was denied, then
the same authorized `sudo -n docker` mechanism used by the runner confirmed
cleanup. No daemon setting or credential changed. Root filesystem: 68% used,
204 GiB free. **NO_ACTION_NEEDED**; preserve private logs and repository source.

### 8. Request disposition, not false closure

| Request | Core source result | Remaining owner/action |
| --- | --- | --- |
| FE-CAT-4 / DEBT-052 | Owning batch refresh, persisted `listFigures`, retained single-batch read wired. | Edge-qualified financial carrier; real refresh/read receipt and Claude consumer ACK. |
| Finite Manager | All six named finite surfaces use native delivery with original authority. | Source/current principal qualification; unrelated routes retain their own scoped path. |
| FE-067 / FE-072 | Positive scoped runtime/session vocabulary, DTO, policy and mapper aligned. | Claude accepts fixture; Edge supplies exact source observations and current policy. |
| FE-050 / FE-051 / FE-052 | Published optional business metadata listed in §4; exact decimals/false/null preserved. | Credential-status/margin-ratio/order aggregation semantics still require owning publication. No secret is a UI field. |
| DEBT-029 / FE-CAT-5 | One economic runtime adapter feeds dataset AND retained series; immutable proof/cursor and rollback checks. | Edge maps PM economic identity/census/cut; qualify shared-account parity with real source. |
| FE-CAT-2 | Injection reaches actual queue projection with whole-filtered-population health. | Owning axes/exception carrier, not a fake health view. |
| History / realtime | Byte budgets, separate HISTORY gate, PG cross-process hint lifecycle and tests. | Connected separate rights, SSE/restart/revoke acceptance; authoritative calendar/notices when provided. |

None of these rows is a claim that all seven source/consumer acceptance gates
are closed. No frontend files were modified; Claude keeps component/design
ownership and can consume the additive contract and positive fixtures now.

### 9. Follow-through assignment — writer and qualified notices

Bobby requested continuation without frontend/runtime changes. Rechecked Core,
Claude and HK source pins: no newer committed source mapping or Claude ACK.
PM's owning NET_PNL return still explicitly leaves the wire mapping open;
Edge's venue-calendar registry remains SOURCE_DARK. Do not manufacture either.

Next owned implementation: persistent Operations health ingress and its exact
one-to-one queue view (reserve migration154 after checking canonical, Claude
and integration migration directories); original queue/statuses stay untouched.
Use explicit source axes, immutable bounded receipts, contiguous source cursor,
same-target/workflow fencing, retry/conflict handling and retirement/expiry.
No automatic commissioning/provider or public mutation route. Validate with
real disposable PostgreSQL, including rollback and existing queue preservation.

Also audit Fleet notice qualification across every revision in a batch, not
only the initial snapshot. No SOURCE_VERIFIED relabel of TEST_ONLY revisions,
no skipping a rejected ordinal and no per-notice SQL fan-out.

Exit for this slice is focused source/build/PG proof and a committed handoff,
not upstream qualification, browser acceptance, canonical landing or ELP2-10
closure. Reuse unchanged prior gates; run one affected official batch, not a
full hook/visual campaign. Rollback keeps the candidate uninstalled; additive
health receipts must remain preserved even when its view is not mounted.

Implemented at4591ae580 and111c6d572:9code/test/fixture/migration files,
+523/−9; official affected7specs/138tests, production build, migration154 and
runner restore PASS. [Detailed source pins, tests, cleanup, qualified-source
requirements and Claude handoff](BACKEND_HEALTH_NOTICE_FOLLOWTHROUGH_2026-10-25.md).
The initial broad host test-typecheck was deliberately stopped, not reported
PASS. The required production build is the actual passed check. This source
slice does not install a publisher, make calendar/Edge notices available or
close the external financial/economic/metadata/source/browser gaps in§5/§8.
