# Core independent backend work — 27 October 2026

Status: **SOURCE LANDED; connected qualification remains OPEN**. Base
`docs/research-loop-plan@21b03093cceab847e903cf6be212e96bd62926b9`.
This packet is not an ELP2-10 or ELP2-11 acceptance, a real Edge receipt,
a runtime installation, or a frontend handoff claiming new fields.

## Work and decisions

1. Accounts source-cut fence now compares the complete fractional timestamp,
   including digits beyond JavaScript milliseconds and UTC offsets. Previously
   a future sub-millisecond observation could round down to the cut. Four
   field-specific regression cases failed before the fix and passed after.
   Unknown source cut retains the prior explicit-absence behavior. The staged
   History byte-census fence and runner/contract test repairs remain part of
   the same not-yet-landed batch; see `CORE_BACKEND_BATCH_2026-10-27.md`.
2. FE-068: read the current creation grant after the awaited step-up lookup,
   before the final session/workspace fence. Tests exercise revoke during the
   lookup, membership revoke and workspace isolation. This is advisory;
   the final mutation still owns its own authorization check. It does not
   prove an atomic final grant fence at HTTP egress.
3. Financial/economic isolated suites: **129/129 PASS**, including the shared
   dataset/series reducer, census/ownership and absence cases. These are local
   synthetic inputs, not evidence that an Edge financial carrier is qualified.
4. STATUS preparation now reserves bounded transport capacity before asking
   the authority to issue an assertion; concurrent distinct prepares cannot
   over-admit. Exact unresolved retries are admitted, reservations release on
   failure, and no unresolved custody is evicted. The focused real-loopback
   TLS test: **15/15 PASS**, including five added capacity/retry cases. The
   first sandboxed attempt could not bind loopback (`EPERM`); the bounded
   isolated retake ran with loopback permission. This is not a gateway receipt.
5. Remaining STATUS risk: `originals` is process-lifetime bounded at 128;
   completed entries are not evicted. Do not silently evict them: immutable
   original/source-codec change detection and UNKNOWN recovery must survive.
   Design a durable source-bound release/census before claiming lifetime
   throughput qualification.
6. Score focused test selectors: **113 PASS, 37 SKIP** across four files; no
   production calibration or source tie-out is inferred. Migration preservation
   and current-workload fixture suites passed individually within a combined
   test invocation, but its workload-selection file failed; direct diagnosis
   showed the sandbox rejected its `spawnSync` subprocess with `EPERM`, causing
   the two CLI assertions to see empty output. The isolated retake with
   subprocess permission passed **10/10**, including both M5/M7 dry-run CLIs.
   No actual
   load, approved target or measured G2 claim is implied.
7. FE-069 has an additional integration limitation: Run Library's facet SQL
   orders distinct workspace alphas and silently applies `LIMIT 200`, while the
   consumer describes the returned collection as the whole workspace. The
   existing run-list keyset pagination does not paginate this distinct facet.
   Do not call this complete for more than 200 alphas; provide a bounded,
   authorized, paginated catalogue with explicit completeness and coordinate
   the consumer, without modifying Claude's components here. Local candidate
   adds `researchRunLibraryAlphaCatalogueV1`, generated type
   `RunLibraryAlphaCatalogueResponse`, fixture and capability inventory. It
   pages the same run-derived workspace population in stable alpha-id order;
   it is not a registry or create permission. Each page is a fresh authorized
   snapshot and a signed cursor binds workspace and page size. Concurrent
   changes require a fresh traversal to obtain a single-current census.
   Local service/controller/contract selectors pass. The isolated PostgreSQL
   retake completed build/migrations, **20/20 tests** and restore drill; it
   walks 405 alphas over three pages, excludes another workspace and rejects
   a subsequent page after membership is revoked. Its source snapshot predates
   the last additional response-schema ordering/cursor-length validation;
   the service tests were rerun after that hardening. This is not an Edge or
   browser receipt. Do not call the endpoint delivered before the final commit
   gate passes.
8. The route/ownership ledger gate found three already-existing operation
   health tables missing from persistence ownership. Classified the verified
   source publication heads, immutable receipts, current observations and
   derived health view from migration154 and the writer call graph. No
   deletion/retention policy or qualified source was created. Ledger retake:
   **22/22 PASS**, including route census; original missing-table failure is
   preserved in this packet. This is a backend inventory fix, not a UI change.

## Claude request reconciliation (source/consumer, not connected acceptance)

The older `FRONTEND_BACKEND_SYNC.md` §6 OPEN rows are historical: the
later consumer receipts and source below supersede them where they disagree.
This does not treat a synthetic reader receipt as a qualified Edge source.

| Request | Verified existing work | What still remains |
| --- | --- | --- |
| FE-066 identity | V1 consumer accepted in `UXM-07/consumer-receipt-be-p2-p3-2026-10-20.md`; `execution/product-read-source.ts` has a scoped identity seam. | Qualified source names and authorized scoped parent/alpha coverage, where still absent; no name inferred from an ID. |
| FE-067/072 runtime/session and rows | V1 consumer accepted in that receipt; later `BACKEND_RESIDUAL_IMPLEMENTATION_2026-10-25.md` records scoped vocabulary, DTO, policy and mapper. | Consumer and actual source/current-policy qualification for positive scoped observations; missing source facts remain absent. |
| FE-068 eligibility | Prior readers/ports accepted but screen wiring was partial in `UXM-07/consumer-receipt-be-p5-2026-10-20.md`; `execution-v2/step-up-family.ts` and `access.service.ts` already distinguish delegated capital and access-admin proof. | This batch hardens the separate governance grant ordering; Claude checks remaining consumer wiring. Eligibility is advisory, not command permission. |
| FE-069 picker/lookup | Existing filtered run cursor, scope and same-key lookup were accepted in the BE-P5 consumer receipt. | The distinct run-alpha facet separately stopped at 200; new paginated candidate above needs final landing and consumer adoption. It is not a complete Alpha registry. |
| FE-070 calendar | Contract and reader accepted in the BE-P2/P3 receipt; the Portal seam exists. | Edge-qualified venue source; current state remains `SOURCE_DARK`. |
| FE-071 Canary | V1 contract/consumer accepted in BE-P2/P3; source-derived caps/check dates were not all published. | Qualified scoped/source facts and browser acceptance; do not synthesize policy limits or rollback readiness. |
| DEBT-052 / DEBT-029 | Batch Accounts refresh and one shared economic dataset/series reducer are documented in `BACKEND_RESIDUAL_IMPLEMENTATION_2026-10-25.md`. | Edge-owned financial carrier, shared-account identity/census and proof; actual API and population parity. |

The original FE-068 delegated-capital step-up concern in the BE-P5 consumer
receipt is not a reason to reimplement its old proposal: the current source
already has the distinct `CAPITAL_COMMAND` family and checks its own current
ALLOW in `access.service.ts`. This is a source check, not a new runtime receipt.

## Gate history and next work

- The first normal-hook attempt for this batch stopped immediately at the
  contracts snapshot check because the new OpenAPI/generated type had not yet
  been snapshotted. The repository's `packages/contracts/tooling/snapshot.py`
  regenerated the tracked hashes; the new fixture was also explicitly added
  to the snapshot inventory. `snapshot.py --check` matches **710** files.
  That attempt is **FAIL**, not a suite PASS. Retake the unchanged normal
  hook for this corrected batch.
- The second attempt passed the contract snapshot and stopped at the P01
  static route census: this new GET was absent. The repository's
  `p01-baseline.mjs --write-live-routes` added exactly that route and raised
  the count 322 → 323; no existing route was removed. This attempt also
  failed before full test execution; the live route gate then passed with no
  collisions and an unchanged protected kernel. Separately running the P01
  historical `--verify` check reported an archive content-digest mismatch;
  that is a different point-in-time gate, not the live-route hook. No historical
  evidence was regenerated or declared PASS. The corrected batch still
  requires its normal hook.
- A third attempt passed the route gate and reached the contract suite:
  **111 files / 1,897 tests passed, one failed**. The failure was the §56
  governance test hard-coding two Library paths. The test now names all three
  exact paths and asserts every one is GET-only; the affected governance and
  Library suites retook **7/7 PASS**. This failed full attempt is retained,
  not a normal-hook PASS; a final retake remains required.
- The subsequent hook passed contract **112 files / 1,898 tests**, generated
  types and the Control API build. The full Control API suite then reported
  **one failure among 74 tests** in `elp204-explicit-portfolio-list.spec.ts`.
  Since a passing hook was already impossible, the operator sent SIGINT to
  that exact disposable Vitest process; the remaining suite and this hook's
  restore step are **INTERRUPTED**, not PASS. The script exited 1 and its test
  processes cleaned up. A focused retake of that whole file on a new isolated
  database passed **74/74**, as did its build, migrations and restore drill.
  The interrupted run did not emit the detailed assertion report before SIGINT;
  the failure did not reproduce in the focused retake, but its exact cause and
  whether it predates this batch are **unknown**. Do not call the full hook
  PASS or claim that a timing-sensitive failure was fixed.
- Selected Control API cell on disposable PostgreSQL: build and migrations
  PASS; **9 suites / 157 tests PASS**; the legacy plus versioned identity,
  session, command and custody PostgreSQL restore drill PASS. The exact two
  disposable test containers were absent after script cleanup. Its source
  snapshot predates the STATUS capacity edit; the separate 15-test TLS retake
  above covers the later STATUS source. The sparse History SQL measurement
  used 12,000 test rows; 100/200/400/2,000 target-point reads returned
  102/200/351/1,342 rows, 17,137/33,601/58,969/225,457 JSON row bytes, and
  observed 223–297 ms across the three samples per target. This is an isolated
  SQL measurement, not an HTTP, concurrent-load, real-source or SLO receipt.
- Complete the FE/DEBT producer/contract/consumer review and the alpha-facet
  pagination; test History at substantial bounded size and recovery, then
  review Score/qualification and ELP2-11 preservation evidence. Run the normal
  hook once on the final batch before committing; previous interrupted runs
  are not PASS. Preserve unrelated Edge packet WIP.
- Claude, after the final commit: regenerate/read `RunLibraryAlphaCatalogueResponse`
  for `GET /api/v1/quantbt/runs/alpha-catalogue`; traverse `page.next_cursor`
  while `page.has_more`, show loading/failure and do not describe an incomplete
  first page as the entire workspace. A cursor is bound to workspace and page
  size; changes between per-page snapshots require restart for a current census.
  This is the Library's run-derived alpha facet, not the alpha registry and not
  a create-eligibility grant. Keep the approved UI; test empty, >200, failure,
  workspace change and revoked membership. Code remains local until committed.
- Edge remains the only coordinator for authoritative financial/census and
  gateway inputs. Calendar remains `SOURCE_DARK`; no source qualification,
  production budget/calibration, command/Live enablement or browser acceptance
  is asserted here.

## Final local landing receipt

The corrected code, schema, generated client, tests and inventory landed on
`docs/research-loop-plan` as
`feafe56ae217aae73aac54b38b0d0051fd056d2d` (31 files, +839/−30). The normal
hook on that exact staged batch passed: contract **112 files, 1,898 tests**;
Control API **566 files passed, 4 skipped; 11,676 tests passed, 8 skipped**;
Control API build, PostgreSQL migrations and restore drill, workspace and
tracking gates passed. This includes the final hardened catalogue schema and
its **2/2 PostgreSQL** tests, the catalogue **3/3** service/controller tests,
the financial batch **58/58**, and STATUS transport **15/15**. These counts
overlap the full suite and must not be added to it. The previously interrupted
attempt and its unknown Portfolio failure remain recorded above; its retake in
the final hook passed 74/74, without establishing the earlier cause.

Claude may now consume the catalogue handoff above on this SHA. The page is a
run-derived alpha facet, not a registry or create permission. No frontend was
changed. `originals` lifetime capacity remains a real STATUS design gap;
actual Edge financial/census, Calendar, gateway, connected READ/STREAM,
calibration, coexistence/G2 and browser qualification remain open. ELP2-10
and ELP2-11 are not closed, and the candidate is not installed or released.
No push, production/dev/main, command or Live action was taken.

Verification: R0 for this Markdown-only receipt and associated tracking update:
explicit-path staging, `git diff --cached --check`, link/path inspection and
`scripts/execution-tracking-test.sh`; no repeated code/build hook.
