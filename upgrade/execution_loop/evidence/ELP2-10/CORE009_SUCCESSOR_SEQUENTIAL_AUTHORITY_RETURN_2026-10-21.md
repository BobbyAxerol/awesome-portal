# Core009 sequential READ / STREAM renewal —21October2026

**FOCUSED_SOURCE_QUALIFIED / NOT_INSTALLED / NOT_CONNECTED_READY.** Addendum to
the [first focused receipt](CORE009_SUCCESSOR_FOCUSED_GATE_RETURN_2026-10-21.md);
the sent original receipt and its logs remain unchanged.

## Real issue, reproduction and minimal fix

Independent review found that READ-only policy ADVANCE rev1→rev2 stranded the
expired STREAM predecessor at rev1. A later explicitly approved STREAM-only
KEEP rev2 was refused solely because its **historical predecessor** carried
rev1. That coupled independent app actions unnecessarily; the actual reader
requires the **new** grant to bind current policy, not history to be rewritten.

Actual regression against frozen f929 source: **17:26:16UTC,72 PASS/1 FAIL**,
failure at the new READ ADVANCE→STREAM KEEP case, typed SCOPE_REFUSED. It is a
real source bug, not a timeout/fixture failure. The old "wrong predecessor
policy is always ineligible" test was replaced by the correct sequential
semantics; new-grant wrong-policy refusal remains tested.

Minimal planner correction:

- Historical predecessor remains exact ID/revision/digest CAS, expired or
  revoked ALLOW, same owner/subject/action/domain/field policy/Paper.
- Require that predecessor's exact domain/field identity is still sealed by
  **current** reviewed policy; history alone is never current authority.
- New grant still has fresh ID/revision, current/next policy revision and
  covered finite source/operator/duration windows. All active/legacy
  constraints, target/current-user locks, no-resurrection and UNKNOWN drain
  fences remain unchanged. No route/schema/provider or action widening.
- PG regression stages READ first (STREAM denied), then explicit STREAM;
  existing READ grant, policy, sessions and historical facts stay unchanged.

Independent read-only re-review **ACCEPTS** this fix. Pure rerun17:26:37UTC:
**73/73 PASS**,633ms total. Affected PG file now has9 cases; one isolated
focused run is RUNNING, not prewritten PASS. Installer/revoke unchanged cases
will reuse their passing receipts; no redundant full regression requested.

### Actual affected terminal17:30 UTC

The isolated PG rerun is now terminal **EXIT0 /9 of9 PASS**, Vitest started
17:30:14UTC,22.00s including import/transform. Source TypeScript build,
migrations and the scoped PostgreSQL restore drill (four scoped-access row
digests) also PASS. Captured terminal log:
`/home/bobby/.local/state/portal-execution-elp210/20261021/successor-focused-ClGkOc/pg-sequential-captured.log`,
SHA256 `1367c5f7a9b5f3f6f3f669286ac0c32910f34b36b746fb08ab120d7f1e251556`.
This is captured output, not a claim that the omitted initial build lines are
present in that file. The unchanged installer6/revoke3 results are reused:
**91 distinct current focused cases**, not the sum of retries.

Correction committed as c85ac774 and rebased onto canonical4ed821fa as
**5518978867bb920c946ab3ff0ad67613705f452f**, tree
`084cf6923a35cbfde3d54091717bf061b392c403`. Combined writer slice: five files,
**+755/-0** (implementation260 lines/tests495). Correction itself: three files,
**+47/-3**. This is a source locator before final documentation rebase, not an
installed image or final Edge READY pin.

The runner cleaned its own PG/Node/network. A subsequent inventory observed
another agent's `control-api-test-*-30108061488512459` cell and heavy lock;
that cell was not selected for teardown and no overlapping heavy job started.
Normal/build controllers for the corrected frozen source must use fresh paths;
the aborted143 controller/logs remain immutable. No successor artifact was
installed and no session/grant/source/runtime was mutated by these tests.

## Obsolete normal attempt stopped, not counted as PASS

The normal hook on f929/tree0ebb94cf ran17:16:15→**17:25:26UTC**, then was
intentionally stopped after the independent source finding. Exact own timeout
PID2935508 (parent sudo2935507/controller2935478) received TERM. Terminal
**EXIT143 / ABORTED_FOR_SOURCE_FIX**, not an infrastructure failure or green
gate. No peer or runtime process was selected. Docker postcheck: zero test
containers/networks; runner trap cleaned its exact disposable resources.

Normal attempt logs/started/exit remain in the original private
`successor-focused-ClGkOc` directory. Do not overwrite or restart that script
on altered source. The prepared build controller requires matching EXIT0;
its f929 input is now superseded and **must not execute**. No image was built
or installed, no grants/session/source were created by this aborted attempt.

## Owners / next

Codex keeps this narrow writer and its tests; Claude keeps UI/observer/
financial/measurement code. No new frontend contract or mapping is needed.
Commit corrected source after PG/build/restore; freeze a fresh normal gate,
then actual image/pins before a new matched Edge source window. Old source
stays OFF. Manager issuer/financial source mappings, budget/calibration,
coexistence/G2 and real browser remain separate open gates.

Actual source refresh17:18:21UTC: Edge cc7e71f5/PM0956eaa unchanged. Edge Unified
line29317 (`original08-successor-source-intake-20261022`) acknowledges Codex
writer ownership/first focused proof and prepares artifact/CLI review, not
connected acceptance. No new Manager leaf/controlled issuer or economic-source
mapping returned. The public first-focused return was actually delivered to
both owners17:19:00UTC, SHA256
`32311edf7b5b88aa3e6ab854381fce466ebea6c75e762a0ee23a1c94645cce4f`.
This sequential correction supersedes only its source-readiness/freeze status.

Read cut17:32UTC confirms Edge's new section9 compatibility ACK applies to
**old f929/tree0ebb only**, not these corrected bytes. Source remains OFF,
new acceptance absent; no new finite manifest/window armed. Native trust ends
22Oct02:48UTC. PM's additive race/history-generation source evidence is46
distinct cases, not financial publication or a returned economic mapping.

## Claude independent review / immediately parallel follow-through

P21 overflow/canonical census fix at0201df80 and P22 observer corrections plus
wiring at58c782ede5c0b006c458dc5dcb78b828ee83ec59 are **ACCEPT / SOURCE_ONLY**.
The latter preserves RECONCILED-without-phase as not-observed, joins genuine
durable terminal receipts, bounds descriptor reads before I/O, refuses links
and wide modes, and leaves observer/default runtime OFF. CLI is seven-column
parameterized READ ONLY. No root PG/connected observer result is claimed.

Claude next, disjoint from this writer (no new public fields/UI redesign):

1. `quietGate.mjs:41`: controlled-clock delayed wake must not PASS after the
   cap if quiet was never achieved by the deadline; retain old M1 bytes, no
   repeat M1 requested.
2. `useFleetDataset.ts:225`: aborted shared flight cannot remain joinable;
   canceled waiter cannot receive another waiter's result. Keep one physical
   request and generation fences; exercise the three already-requested races.
3. `scripts/measure/lib/stage.mjs:40`: max-tabs rejection before all I/O; add
   zero-fetch negative. `lib/g2.mjs:13`: require matched source/apparatus/
   window/census, valid sample counts/percentiles; synthetic negatives now,
   actual G2 only on a returned source window. Pilot1/2/4/8/16 is not approved
   production numeric budget or calibration.
4. Append reachable P22 commit locators bb541418/7d770f21/11bd501b, retaining
   historical8de1e50f/3580ef8e/fdcaf69f; F1–F9 may now say source ACCEPT for
   P21/P22. Window requests must stop treating old Core/no-stream notes as
   current runtime readiness. Do not rewrite original measurement receipts.

Affected P22 PG specs, scheduled by integrator only in a free heavy slot:
maximum-data-operation, profile-projection, elp210-native-frame-coupled,
eds11r-rich-screen-warmup, elp205-current-page, elp204-account-policy-capture,
elp204-account-sync-capture, elp204-heartbeat-capture, elp204-bracket-capture,
execution-shared-admission, execution-shared-read-cache-maintenance (all
`apps/control-api/test/*.spec.ts`). `elp2-product-read.fixture.ts` is not an
independent test. Pure42+28+20 and155 existing source tests are Claude's
reported results; root independent acceptance is source review, not a rerun.

Backend next: corrected writer normal/image and genuine native READ then
separately eligible STREAM/revoke/recovery. Manager leaf/issuer, economic
ownership/census/cost mapping, numeric budget/calibration and coexistence/G2
remain named owner-input gates. Claude can complete the four source fixes and
fixture/browser preparation without waiting on them. ELP2-11 is not opened.
