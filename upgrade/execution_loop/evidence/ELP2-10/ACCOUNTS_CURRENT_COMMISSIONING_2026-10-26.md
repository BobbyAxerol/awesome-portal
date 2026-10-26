# Accounts CURRENT commissioning — 26 October 2026

**Later source follow-through:** [27-Oct native BFF implementation and tests](ACCOUNTS_NATIVE_EGRESS_2026-10-27.md)
at `6964b48640a180f564c45592e02009837255355f` closes the BFF source gap identified
below. This historical investigation remains intact; actual source/trust/runtime
READ/STREAM and browser acceptance are not implied by that implementation.

## Approved scope and entry pins

Bobby assigned: Accounts CURRENT → actual source/rights/trust binding → READ
and independently authorized STREAM through Edge. This is not permission to
invent source authority, reopen retired windows, enable commands/Live or change
stable/dev/main/provider28445. No push or UI/component changes.

- Canonical `/home/bobby/portal-research`, `docs/research-loop-plan`, entry
  `c2f1b19b6760cfb4cbc9ead7aa6c9ec5cd41f918`; clean.
- Latest committed Claude `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` is an
  ancestor. No new committed consumer request at entry. Earlier local merge
  exception does **not** waive installation/qualification gates.
- Read-only HK refresh: `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`,
  `feat/execution-edge-upgrade-v1_2`,
  `8727e5303b1815d54bc2bdcb927a55457ff4da5b`. Three tracked peer Markdown
  changes, +148/−3, and untracked peer files are preserved. No remote writes.
- Reuse candidate image and clone receipts from
  [the actual package/install investigation](CURRENT_SOURCE_REUSE_AND_COMMISSIONING_BLOCKERS_2026-10-26.md).
  Do not rerun compilation/migration just for the consolidated source label.

## Single-writer task map and checks

| Owner | Scope | Exit |
| --- | --- | --- |
| Primary Codex | Source selection, runtime/binding/trust investigation; exact backend defect repairs if found; shared plan/sync/receipt and integration | Actual route/source/authority pins, affected tests, real connected receipt or exact actionable missing input; preserve all old custody |
| `accounts_current_review` | Initially read-only route/provider/writer audit; then explicitly assigned three NEW operator/CLI/test files only, no SSH/DB/runtime/Git | Identify minimal CURRENT path; implement the missing private operational caller without replacing the existing policy/receipt engine |

Resources: initial investigation read-only. Any approved isolated correctness
cell stays within existing 2 CPU / 1.5 GiB / 300-second allocation and existing
heavy-test lock; no new load/calibration budget. Reuse historical basic CURRENT
acceptance only after checking source compatibility, not as a present human grant.
Finite READ need not wait for financial APPLIED, NET_PNL, Score or Calendar.
STREAM/HISTORY/REPLAY remain separate purposes with their own current rights.

Validation targets: exact Paper Accounts operation; actual identity/workspace,
wrong workspace/subject, expired/revoked policy and final-egress deny; source
certificate/audience/purpose; preserved original status/recovery; independent
STREAM revoke before expiry and cleanup when the source is genuinely admitted.
No fixture result counts as connected/source/browser qualification.

Rollback: leave unselected candidate off; if installing an approved binding,
remove only its admission/mount after draining genuine obligations. Never erase
attempts, policy/audit, source custody or restore revoked access.

## Entry constraints to resolve, not assumed missing source

1. The sandbox SSH denial was retried with explicit execution escalation;
   read-only HK refresh succeeded. Edge source remains the known SHA above.
2. Initial local Docker enumeration returned permission denied on
   `/var/run/docker.sock`, including the explicit escalated retry. No socket
   chmod or credential workaround was attempted. **Resolved:** the existing
   official preview script already uses `sudo -n docker`; that exact supported
   mechanism works with approved execution escalation. The observations below
   therefore replace the initial "runtime unobserved" state, not the failed
   command's history. No runtime was changed.
3. Basic `ManagerCurrentAccounts` and the broader Manager overview dataset are
   different read paths. Qualify the precise path, not a global AVAILABLE flag.

Implementation, tests, connected observations and next-owner actions follow
below as actually completed; no PASS is predeclared.

## Direct source and target observations

Read-only queries, bounded at 2 seconds, through Edge's projection store only;
no direct TS/PM database shortcut. Read the correct owned HK source lane
`/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`,
`feat/core-current-policy-wire-20261024`,
`86178d694abf156453cdf450553fa80bdd9becab` (clean).

| Actual observation | Result / limit |
| --- | --- |
| Research control-api image | `sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`, tag `local/portal-research-core-current-view:20261023-forward151` |
| Research effective configuration | `PORTAL_ENV=local`, `AUTH_MODE=dev`, `EXECUTION_READ_PROFILE=retained_review_v1`; all four `CONTROL_API_{NATIVE_CORE,NATIVE_ROOT,NATIVE_CURRENT,CURRENT_VIEW}_CONFIG_FILE` references **UNSET** |
| Core workspace | `ws_06G19F61YB8CFR7TEWMS7HQ660`; current-read custody table absent; actual target has not received migrations 152–154 or the selected new composition |
| Preserved schema | Existing private current-human schema remains installed; do not recreate it or discard its audit/custody |
| Active Paper projection epoch | `01a05c70-81ec-7380-801d-45c706f937c0`, source workspace `workspace_execution_manager`, adapter `portal.execution.manager-projection.manager-v2.runtime.v5` |
| Latest sealed source cycle | `n24-cycle-3cdb719493ade1fb79def4f57cfef2204bfb1011ab484970004fc940d0045501`, catalogue `sha256:0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44`, realtime sequence 35954 |
| Actual source time | `2026-10-20T13:31:29.218203Z`; six days old at this inspection, **not** a newly live/current source observation |
| Three Accounts grains in that epoch | `manager.account/public.accounts`: 196; `relation.account_balances/public.account_balances`: 341; `relation.account_policies/public.account_policies`: 185. **722 rows are not 722 distinct accounts.** |
| Native Research trust | The 24 October temporary Core/PM TLS leaves expired at `2026-10-25T12:59:52Z`. No use/extension of expired trust, no new key issuance this turn. The separate Manager CSR/client PKI is not this native trust bundle. |

The first Edge projection query used the container's default `postgres`
database and returned relation-not-found. The read-only retry selected the
actual `portal_projection` database; only that result supports the table above.
Actual nested source timestamps are canonical UTC `...Z`; the suspected offset
format mismatch was **not reproduced**, and no timestamp parser was changed.

The 24 October bounded source-byte probe is reusable only as compatible
source-byte evidence: its epoch/cycle/catalogue and 196/341/185 populations
match these direct observations. Its state remains
`SOURCE_VERIFIED_BYTES_ONLY_NOT_HUMAN_AUTHORIZED`. Neither it nor old E6/E7
basic CURRENT acceptance supplies a new human grant, source original or STREAM.

## Exact CURRENT route, not an undifferentiated Manager enablement

- `GET /api/v1/execution/resources/accounts/:resource_id` uses
  `ManagerCurrentAccounts`, dataset `manager-current:ACCOUNT`, and the three
  grains above. It publishes identity/balance facts, not invented financial
  analytics. Tupleless source selections require ordinary
  `business.read_all` with whole-population authority.
- `GET /api/v1/execution/manager/accounts/:id/overview` uses the independently
  commissioned `alpha_fleet_overview` dataset and its own `account.read`
  capability. Do not claim that basic Account360 source acceptance populates
  this broader stored Manager document.
- Native Manager-domain grants, ADMIN, source metadata and a TLS handshake
  cannot create the ordinary entity/root authority required by the first path.

## Confirmed Core repairs and verification

Source package committed on the canonical Research branch:
`022a0b4ac1dca36f91be47591172984c765a7c9b` — 10 files, +527/−10
(production 6 files +178/−5; tests 3 files +305/−5; test-result JSON
1 file +44). R1 intermediate verification under campaign §10.10c, not a
full-R2 landing/installation claim. No remote push.

### Local certificate-chain preflight

`current-view-runtime.ts` parsed certificates/key pairs but did not verify
links/signatures between the supplied local intermediate certificates. It now
checks issuer CA status, issuer linkage and signature for every adjacent pair,
for both inbound and outbound TLS. The `ca_ref` remains **peer** trust: valid
deployments with different Core/Edge issuing CAs remain supported. This is a
startup/preflight correctness repair, **not** a claim of an observed TLS bypass.

Eight new regressions cover both directions: valid local chain with a different
peer CA, wrong signing key, non-CA issuer, reordered chain, and input-buffer
wiping on failure. Independent source review: **ACCEPT**, no runtime claim.

Actual focused results:

- `current-view-runtime.spec.ts`: **20/20 PASS**, 4.47 seconds.
- Combined runtime + Manager metadata/publication + Account360 suites:
  **91/91 PASS**, 9.82 seconds. This includes the 20 above, not 111 unique tests.
- Production `tsc -p tsconfig.build.json --noEmit --incremental false`:
  **PASS** for the trust repair before the new operator files were added.
- No container, listener, source lease, session, grant or source receipt was
  created by these tests. Temporary private TEST_ONLY certificate files are
  removed by the test teardown.

### Missing operational policy/ROOT entry point

Confirmed by production call-site audit: `composeOrdinaryPolicyIntake` and
`acceptRootTsReceipt` had only test callers. The existing native successor CLI
renews Manager-domain grants; it cannot install ordinary policy/accept roots.
Therefore **genuine Edge input alone was not sufficient**: Core still owed an
operational caller. The new `execution-ordinary-policy.ts` CLI now supports:

```text
node dist/cli/execution-ordinary-policy.js install-policy \
  --artifact <root-owned-private-file> --sha256 <approved-hash> \
  --not-before-ms <N> --not-after-ms <N> [--dry-run]
node dist/cli/execution-ordinary-policy.js accept-root [--dry-run]
```

Both require the private native/Core ROOT references, exact Research target and
equal bounded pool profile. The actual Root provider is registered in the SAME
`native.compose(pool, [], undefined, root.provider)` mutation coordinator.
`install-policy` calls the existing pinned-artifact writer and reports policy
acknowledgement only. `accept-root` takes ONLY the validated original in the
ROOT runtime (`grant_id`, `accepted_fact_digest`), not ACCEPTED JSON from argv.
Its actual source verifier owns QUALIFY/COMMIT and the existing receipt writer.
It neither reinstalls policy nor depends on the old artifact intake window.

Dry-run checks files/configuration, not database/source acceptance, and creates
no pool, provider, listener, session or grant. Normal cleanup drains the same
Root provider before ending its pool. Uncertain drain returns fixed recovery75
without `pool.end`, fake ACK or deleted custody. The operator runner must impose
its reviewed external deadline: CLI sets `process.exitCode` and deliberately
does not declare unjoined PG/source handles cleaned up. Retrying uses the SAME
original/private manifest; the CLI never substitutes a new original to hide
UNKNOWN custody. Genuine QUALIFY/COMMIT attempts remain owned by the existing
recovery-aware engine.

Operator boundary tests: **32/32 PASS**, 852ms; orchestration doubles only, not a
genuine source/authority/PG/connected receipt. First 31/32 run had an empty-array
`it.each` harness argument error; corrected case wrapping without weakening any
product assertion. The existing source/PG engine receipts are reused only for
unchanged engine internals; these new callers have not run on Research.

### Native-profile route and actual SessionGuard factory wiring

Two additional reproducible Core defects were found in this round:

1. The Research native routing ceiling could not admit the basic
   `/api/v1/execution/resources/accounts/:resource_id` route even when its
   separately commissioned `ManagerCurrentAccounts` composer was installed.
2. `AppModule` explicitly created `SessionGuard` with four constructor arguments,
   dropping the existing native-current/status dependencies as well as the new
   basic Accounts dependency. Constructor `@Optional` decorators do **not**
   populate an object produced by that explicit factory.

The routing helper now admits that exact GET only with the independently
installed basic Accounts composer. Paper/configured-workspace and real session/
workspace checks remain; no other resource, write, broader overview or STREAM
permission follows. The actual factory now optionally injects/forwards all three
private compositions (finite native Manager, command STATUS, basic Accounts).
One regression calls and checks the actual registered provider factory, not
only a hand-constructed guard. The initial review correctly required this
factory fix before accepting the routing-only patch.

Final grouped focused lane: runtime + publication + Account360 + native routing/
actual guard factory + operator, **5 files / 252 unique tests PASS**, 20.41s.
Earlier 20/91/158/32 counts are overlapping selectors, **not** additional 301
new behaviours. Final production no-emit typecheck **PASS**, including all new
operator files and the actual AppModule wiring. Execution tracking and diff
checks **PASS**. [Machine-readable result](accounts-current-20261026.test-results.json).
No public OpenAPI/type/field semantics changed; no generator rerun needed.

### Further Core integration gap found — not just an Edge input

The same independent review traced the *whole* basic three-grain path:
`prepareNativeCoreRuntime` starts from `unqualifiedAccessTrust`; Root adds
`verifyRootReceipt`, but leaves ordinary current relations/mapping delegated.
`CurrentViewAuthority.register` uses `deliverScopedTogether`, whose native
`currentRelations` branch deliberately refuses detached DTO delivery.
Consequently, accepting Root or simply substituting `NativeCurrentAccountScopes`
does **not** make this BFF a genuine native finite read.

This round does **not** remove that safety fence or install a purported
ordinary trust built from a detached native source result. Core still owes an
explicit three-grain BFF composition retaining actual principal, all original
purposes, real source custody and final physical HTTP send. Alternatively it
would need an independently qualified compatible ordinary source-trust provider;
none is installed by this package. This is implementation work, not a new
Bobby decision or an unspecified external blocker. The route/guard/operator
repairs above are necessary groundwork, not completion of that remaining work.

Independent implementation review identifies the narrow next seam (design
review only, **NOT IMPLEMENTED / NOT CONNECTED**):

1. `ExecutionReadScopes.deliverNativeTogether` may mint a non-serializable
   WeakMap-held ticket only after every genuine per-purpose context matches its
   original scope; invalidate it on build exit. Bind exact issuer, actor/session,
   viewer/workspace, dataset, binding and every original requirement.
2. Reverse CurrentView callbacks may use that ticket only for provisional Paper
   CURRENT query authority, with actual `currentPrincipal` and DB-only
   `confirmReadContext`. No replacement scope, ordinary detached fence, or
   SERVED/terminal inference. No STREAM/HISTORY/REPLAY/export inheritance.
3. Keep the target ACCOUNT obligation **and** each actual source-selection
   resource (which can be a different account). Only identical obligations may
   deduplicate. Preserve existing 4-purpose/200-resource and principal/custody
   caps; overflow is a refusal, never silent truncation.
4. `ManagerCurrentAccounts` must prepare selections before the one finite send;
   native controller ownership must follow the existing raw-response/late
   hijack pattern, without DTO/error fallback after native ownership. The
   existing basic DTO populates accounts/balances only, not account-policies.
5. Recheck the exact metadata/publication after ENTER, then expiry/composition/
   transport ownership synchronously before physical dispatch. Native build
   runs **before** ENTER; only ENTER → final Core COMMIT → physical dispatch
   can support a real send receipt. Retain same-original UNKNOWN/ACK recovery.

Affected tests for that next implementation: genuine reverse resolve/recheck
through a multi-grain single response; fake/clone/dead/foreign tickets;
actor/session/workspace/dataset/resource/field mismatch; revoke between grains
and after ENTER; publication change/expiry; missing purpose/cap overflow;
abort/shutdown/lost ACK and no double-write. Existing ordinary/native engine
tests are reusable only for unchanged internals; a bridge unit PASS will not
replace the real connected/private custody/API receipt.

## Ordered remaining commissioning work — no new Bobby decision implied

| Owner | Exact action / required fact | Do not substitute |
| --- | --- | --- |
| Core — source implemented, actual execution pending | Run the new explicit `install-policy` / `accept-root` operator only against matching genuinely prepared source/target artifacts | SQL grant seed, auto-install during startup, arbitrary caller-provided ACCEPTED JSON |
| Core — NEXT IMPLEMENTATION | Complete the basic three-grain BFF's native finite-delivery composition, with the real current principal/purposes and held source through physical HTTP send; qualify it in the existing isolated cell | Strip native marker, weaken `deliverReadComposition`, treat Root acceptance or the routing fix as a READ receipt |
| Core + Edge coordinator | Bind the reviewed ordinary root and real source original: correspondence ID/version/manifest hash, original grant ID/accepted-fact digest, registry/payload/approval pins, exact Research issuer/subject/workspace/workload/action | Stable policy copy, source ID alone, dummy accepted fact, user ADMIN |
| Core + Edge coordinator | Prepare valid Research-only native trust and matching private source/Core configuration **after** the source/original is ready; preserve separate Manager CSR/key custody | Reopen retired window, extend expired CA/grant, regenerate unrelated Manager keys |
| Core | Backup and forward-migrate actual Research safely, install the qualified selected composition through the official writer, then check CURRENT Account360 through real authenticated API and final-egress negatives | Old candidate image plus a source-only unit PASS labelled connected |
| Core + Edge; then Claude | Independently admit STREAM; test active revoke before expiry, same-original recovery/restart and bounded cache/cursor/SSE, then browser on that installed candidate | READ implying STREAM, NOOP_EXPIRED, fixture labelled real |

Claude can continue UI/fixture work against already published contracts and
retained review; there is no new public field or component to rewrite here.
Do **not** label the new source CURRENT or the full Accounts/Manager chain
connected until the exact operation above has an actual API receipt.

**Current disposition: Accounts source bytes observed; actual Research CURRENT
binding/authority not installed; READ/STREAM connected NOT_MET. ELP2-10 remains
open; ELP2-11 is not entered.** No UI, push, stable/dev/main/provider28445,
command/Live, shared runtime or authority mutation this round.

Verification tier **R1 intermediate source package**, campaign §10.10c: narrow
production typecheck + five affected Vitest files, no PG/schema engine changes.
The full R2 hook is not repeated or claimed green; earlier documented consumer/
visual failures remain open. No new candidate image was built: the preserved
`70e6217f…` image predates these new files and cannot be represented as containing
them. Build/install is a later qualified source/target step, not accomplished by
writing this receipt. No new source/private-input copy was sent to HK.
