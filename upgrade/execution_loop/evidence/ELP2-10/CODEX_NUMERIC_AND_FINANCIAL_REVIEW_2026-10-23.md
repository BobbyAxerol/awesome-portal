# Codex review — numeric proposal, financial inputs and Portal-owned follow-through

Date: 2026-10-23 (Asia/Saigon). Scope: approved ELP2-10 closeout, independent
read-only review of Claude's source and packets. **SOURCE_REVIEW_ONLY**: no tests,
network requests, runtime changes, numeric approval or source qualification in
this review. This receipt is not a full ELP2-10 PASS.

## 1. Pins and ownership

- Reviewed Claude source: `claude/post-land-20261022`,
  `2f9ca2dc8f6769ea91f7d123083c2f6d4805c730`, clean when read.
- Canonical comparison: `docs/research-loop-plan`,
  `282c7b3947b5a32c4deac30b5c00a52a78095e4a`.
- Receipt destination: `/home/bobby/portal-research-closeout`, integrator lane
  `chore/core009-approved-closeout-20261023`, base
  `4543234567c28fbadb454745df386665b6cbce29`; pending integration changes belong
  to the primary integrator. This writer adds only this receipt, with no staging,
  commit, shared tracker edit or modification of incoming code.
- Authority: campaign rules §10.13. Claude implements Portal backend/frontend;
  Codex reviews/integrates and coordinates sources. **Edge is the sole TS/PM
  coordinator**. Source delivery, installed configuration, connected proof and
  consumer acceptance remain separate states.

Locators below refer to the frozen Claude SHA unless stated otherwise. Numeric
proposal: `CLAUDE_NUMERIC_PROPOSAL_PACKET_2026-10-23.md` in this directory.

## 2. Numeric proposal — ACCEPT / CHANGE

| Item | Disposition | Evidence and required correction |
| --- | --- | --- |
| Proposed versus approved | ACCEPT | Proposal lines 7–8, 24–28 and 60–62 correctly separate limits, workload proposals, calibration and measurement. Keep original NOT_RUN receipts immutable. No proposed value is approved/applied by this receipt. |
| Tab census N-12 | CHANGE | Proposal line 79 calls the driver rule unknown. `scripts/measure/lib/stage.mjs:35–58` defines total concurrent virtual tabs as the **sum** of entries. B2 is 8 + 10 × 2 = **28**, not 16. `scripts/measure/measure.test.mjs:134–157` contains source assertions for this rule. Retaining that proposed workload requires an authorization admitting at least 28 virtual tabs; do not shrink the workload to clear a 16-tab authorization. This is a source correction, not a new permission. |
| M2c duration N-21/N-22 | CHANGE | Proposal lines 98–99 quote about 16 minutes/cell. The admission calculation in `scripts/measure/m2-tab-amplification.mjs:34–36` uses 600 seconds visible + 300 hidden + 240 allowance = **19 minutes/cell**, or **95 minutes for five cells**, before end guards/settlement. It is an admission reservation, not a measured wall-clock duration. |
| Shared M2c→M5 window | CHANGE | Proposal lines 170–172 allow M2c before M5. At the proposed shape, M5 is 6 × 600 seconds = 60 minutes plus 6 × 300 seconds stabilization = 30 minutes: **90 minutes**, before margin. M2c + M5 therefore requires at least **185 minutes**, not the proposed 120-minute M5 envelope. Use separate exact authorizations or an explicitly computed combined plan; no slot should be requested before accepted artifacts and runner readiness. |
| Repetition/stabilization durations | ACCEPT WITH LIMIT | Proposal N-07/N-08 and lines 212–217 are plans/recommendations, not a new mandatory runtime approval. Follow the accepted pinned plan's repetitions, order and minimum duration. Do not silently convert an unapproved recommendation into a fixed waiting requirement or shorten an accepted gate to pass. |
| C288 and retained history | CHANGE / REFRESH BEFORE RUN | Proposal lines 140–143 correctly distinguish formulas but retain historical H values. With recorded H=21, historical full-suite formula **H + 273 = 294 > 288**. The former missing-case reservation was H=16 + 244 + 2 + 20 = 282; it is not a fresh full-suite budget. Derive the remaining-case schedule and actual census before admission; if its exact requirement exceeds the approved cap, obtain a separate disposition. Never prune custody/audit or renew an old grant to fit. |
| Native versus Manager load | ACCEPT | Proposal lines 176–185 correctly exclude broad load/conformance traffic from finite native08. Current Manager workload needs real authorized IDs and qualified route bindings; native READ/session is not load authority and READ does not imply STREAM. |
| Scalar budgets / calibration | ACCEPT AS PROPOSAL ONLY | Proposal lines 108–132 and 303–309 require scalar bounds, baseline/population, validity and approval references, plus independently frozen fit/evaluation calibration. The 1.25 rule is explicitly recommended, not scientifically established or applied here. Formula/weights/bands stay selected; runtime calibration remains distinct. |
| Source inspection wording | MINOR CHANGE | Proposal line 3 says no code/test/docker/runtime/network used, while lines 34–40 describe read-only SHA computations. Describe the verification as read-only source/filesystem inspection plus hash checks, with tests/runtime/network NOT_RUN; do not describe hashes as measurements. |

These changes do not waive G2, invent numeric budgets, approve Sandbox access,
or require rebuilding an image solely for this Markdown review.

## 3. Financial facts — reconcile the packets before wiring

**CHANGE:** `FE_CAT_4_BINDINGS_LIST_FIGURES_2026-10-23.md:61` describes
`broker_account_sync_effective.native_equity` as an existing source. The same
revision's `FE_CAT_8_9_ADDITIVE_FIELDS_2026-10-23.md:36` states that the field is
not published. The generated census confirms the latter:
`apps/control-api/src/execution/eds11r-manager-relation-registry.generated.ts:708–759`
lists buying power, currency, status, source and sync time, but **neither native
equity nor wallet balance**. The current allowlist in
`apps/control-api/src/profile-read/profile-read.service.ts:87–90` also lacks both.

Do not enable the bindings projection writer by assuming that field already
exists. Edge must return the owning publication/semantics and qualification for
these distinct figures. Missing native equity must not become wallet balance,
buying power or zero. Keep exact decimals, each currency separately, ownership,
coverage and source observation time. Existing fixture values are not evidence
that a financial source is mounted.

**ACCEPT:** FE-CAT-2/4/5/8/9 additive contract/consumer work is useful before a
source is mounted. Fixture delivery does not close real-source wiring.

**CHANGE TO DEBT WORDING:** `FE_CAT_5_CONTRIBUTORS_DIGEST_2026-10-23.md:26`
requests a group truncation/continuation signal. Current
`apps/control-api/src/execution-v2/manager-model.ts:391,553` refuses more than
200 groups with `EXECUTION_READ_SCOPE_LIMIT`; it does not silently truncate.
Continuation is a scalability addition, not proof of an existing silent-total
bug. No partial list may be presented as the full authorized population.

## 4. Safe last-sign-in fact — Portal-owned, root implementation reserved

**CHANGE** to the suggested session maximum in
`FE_CAT_8_9_ADDITIVE_FIELDS_2026-10-23.md:23–24`: a session is not necessarily a
successful human/app sign-in.

- `auth/auth.service.ts:515–523`: normal `login_succeeded` audit and session share
  the bounded transaction.
- `auth/auth.service.ts:633–655`: preview auto-login explicitly records
  `login_succeeded` with reason `PREVIEW_AUTO_LOGIN`.
- `auth/auth.service.ts:674–727`: acceptance operator creates a session but
  records `research_acceptance_session_issued`; this is expressly not password,
  Zero Trust or human-presence proof.
- `repos/sessions.ts:96–99`: `last_seen_at` is activity, not sign-in.

For an interactive/app-login roster timestamp, use the latest persisted
`auth_audit_events.occurred_at` for `event_type='login_succeeded'`,
`result='SUCCESS'`, `actor_user_id=target_user_id=the roster user`, excluding
`reason_code='PREVIEW_AUTO_LOGIN'`. Describe this boundary explicitly. Neither
acceptance issuance nor later session activity may overwrite that fact.
Absent history means omitted/unknown, not `null`/"Never signed in", unless
lifetime coverage is independently established. No production purge was found
in the inspected source; that alone does not prove lifetime coverage.

The real read remains unwired at this reviewed SHA: `repos/users.ts:67–95`
and `:172–187` return no login fact; `admin/account-roster-page.ts:157` projects
only account state; unpaged `admin/account-lifecycle.service.ts:219–221` uses
the old list. Root owns the narrowly reserved implementation and regression
test. Keep timestamp projection out of immutable lifecycle before/after audit
states. Functional wiring needs no schema change by itself; explain the actual
SQL before adding an index, since migration0000 currently has only the global
audit-time index. No schema/index change is authorized by this review receipt.

## 5. Exact next work — do not hand Portal implementation back to Edge

| Portal-owned implementation/review | Input Edge must return through its source owners |
| --- | --- |
| Queue same-snapshot health/count wiring; `operations/operational-read.service.ts:187` currently leaves `healthPlan` undefined. | Delivery receipt sequence/time; per-target applied-through/freshness semantics; named exception family and original incident-child target attestations. Confirm or replace proposed vocabularies before enabling them. |
| Bindings `list_figures` projection/select/refresh path and invocation of `bindingCounts`; helpers alone are not production wiring (`FE_CAT_4:52–66`). | Distinct native equity/wallet facts; virtual used/headroom and sleeve population; source timestamps, currencies, economic ownership, coverage and qualified publications. Counts remain Portal-authorized counts, not an Edge task. |
| User-scoped persisted visit baseline and digest comparison (`FE_CAT_5:28`). | Current source facts and revisions to compare; Edge must not invent the user's previous Portal visit. |
| Authorized same-snapshot portfolio label joins; safe roster login timestamp. | Strategy/deployment labels not already published, and any source-owned identity attribution. Labels never authorize access. |
| Group attribution/truncation-or-continuation contract and metric disposition. FE-CAT-1 metric enum still lacks drawdown, concentration, cost-drag and forward days (`manager-model.contract.ts:24–30`). | Eligible raw financial publication, definition/window/coverage and economic ownership; calibrated Score publications only after config approval. |
| Contract mapping and consumer tests for order-level VWAP/fees, budget and exposure. | Order-level aggregation semantics and per-currency fees; budget used versus approved definitions; allocation-grain gross/long/short exposures with source provenance. Do not sum unrelated fill currencies or rename allocated capital as budget. |
| Manager trust/profile integration and business-read acceptance using the issued Research identity. | Reconciled ingress/profile/audience/kid/JWKS/leaf pins and exact ready business-read target. No new key or stable-rights copy is implied. |
| Command submit/status/recovery integration, factory/cache/cursor qualification; keep real command/Live off. | Commissioned Core→Edge gateway and exact operation/status/recovery pins. Portal must not bypass Edge to reach TS/PM. |
| Current-workload dry-run, exact numeric packet corrections and later bounded collection. | Accepted coexistence target/plan, 14 scalar bounds with approval references, collectors and source-call counters; G2 census/result adapter and accepted window. Calibration population and fit/evaluation artifact remain separate. |

The smallest consolidated Edge return can address the above source-input
columns family by family. Do not require all financial inputs before accepting
an eligible independent READ result. An unaffected control after READ-domain
revoke needs a genuinely separate authorized economic domain; the Paper-only
scope does not automatically authorize Sandbox. Record exact owner/action if
that added domain is not supplied; never substitute READ surviving STREAM-only
revoke, a second URL, or a fixture.

## 6. Exit, handoff and cleanup

- Review verdict: **ACCEPT useful additive source/fixture work; CHANGE the
  exact factual/numeric statements above before commissioning**.
- Tests, PG EXPLAIN, load, browser, TLS/business reads and qualification:
  **NOT_RUN by this reviewer**. No unchanged PASS receipt was rerun or promoted.
- Resource use: read-only Git/source inspection plus this one Markdown write.
  No process/container/network/credential or test-data resource created;
  cleanup **NO_ACTION_NEEDED**.
- Root integrates this receipt, fixes the reserved last-login slice, updates
  shared trackers and returns consolidated source requests. Claude keeps UI
  ownership and can implement the independent Portal-owned items in §5.
- ELP2-10 remains open until its actual gates and consumer receipts are met;
  this review neither opens ELP2-11 nor permits dev/main merge, release or push.
