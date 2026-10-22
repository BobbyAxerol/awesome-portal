# Claude support — validation, incident eligibility, Paper history and capital fixtures

22 October 2026. Bobby explicitly assigned this local backend/data support.
Base `docs/research-loop-plan@5f8de2ca865c937cdeee3791fc5ea38028a48129`;
Claude `3aaf24f4e66bca6c27962ddbbc2049cfb6505421` plus peer WIP preserved.
**SOURCE/TEST ONLY, NOT_INSTALLED; no approved component rewritten.**

## 1. Actual backend changes

### DEBT-UXM07-043 — new access writes

Input-only checks on grant preview/proposal, revoke/preview-revoke and step-up
workspace reject C0/C1, bidi/invisible controls, whitespace-only text and
malformed UTF-16. Preserve exact bytes, printable Unicode and256/512 codepoint
limits. Opaque revisions, password bytes, stored grant/selector decoding and
historical response schemas are unchanged. No migration/normalization/repair
of immutable grants. Access OpenAPI now separates `AccessWriteChange`/
`AccessWriteSelector`/`AccessWriteText` from historical read types.

Actual **Research-only read-only audit**,22Oct10:50:03.503UTC:
5 `portal_access_grants_v2.grant_fact` rows,0 unsafe rows/string fields,
0 whitespace-only fields,0 malformed Unicode fields. One READ ONLY transaction,
5s statement timeout, ROLLBACK; no values or IDs emitted. This is not a
production/stable/all-database audit. The control API running there is still
the old image; source protection is not yet installed.

### DEBT-UXM07-042 — existing Portal incident workflow only

Additive sibling GET:
`/api/v1/execution/operations/incidents/{incident_id}/eligibility`.
Operation `executionIncidentActionEligibilityGetV1`; generated
`execution-incident-eligibility.d.ts` → `components.schemas.IncidentActionEligibility`.
Optional `workspace_id`, current membership required; private,no-store.
Existing detail v1/v2 envelopes and POST contracts are unchanged.

Exactly three ordered advisory actions: `incident.acknowledge`,
`incident.mitigate`, `incident.resolve`. Read `eligible`, `blocker_codes`,
`required_inputs`, `workflow_version`; never infer a grant or TS permit.
SQL reads incident/version and two full-population evidence `EXISTS` in one
statement, not the first250 detail evidence rows. Mutation still validates
the **exact submitted evidence hash**, expected workflow version, session,
ADMIN, workspace, Origin/CSRF and idempotency. Pre/post current-mode fences
remain; SCOPED_V2 returns `INCIDENT_SCOPED_PARENT_NOT_COMMISSIONED` before
lookup. This does not commission the scoped writer or resume a deployment.

Other DEBT-042 economic controls remain NOT_COMMISSIONED as already decided:
return-capital is not recall; lock allocation is not form locking; instance
registration is not deployment activation; credential rotation remains the
published self-context refusal. No new AccessAction/resource kind or
`maintenance.execute` alias was introduced.

### DEBT-UXM07-047 — measured history, one real correctness repair

The sparse downsample path previously counted numeric-eligible equity but
then used an ordinary raw reader with a target-sized LIMIT. Null/malformed
rows could displace valid later rows and invalidate coverage. Sparse history
now uses the exact same eligibility/scope/range predicate as count/dense,
ordered `ts,row_id`; sourceRows describes actual selected eligible rows.
Ordinary `timeSeriesHistory` behavior remains unchanged. No arbitrary history
cap was imposed; scoped reads retain their existing RR read-only transaction.

`targetPoints=2000` remains a **target, not a hard output ceiling**. SQL dense
extrema/last retention has no LIMIT; series count and epoch buckets matter.
Snapshot cap200, hot-window2000 and retained history are distinct. Never use
snapshot panel coverage in place of `data.history_windows.account_equity`.

## 2. Actual measurement — synthetic adapter, NOT SQL/HTTP/browser capacity

Harness uses the real Paper producer → serialize → existing FE strict
reader/model → pure chart reducer.11 timed samples after2 warmups per depth.
Deep measurement source hash
`76e6974f7d8ad9acdeb600dcca6f76a4c6bbbfced7aaa38e6a05faf606bfa5d6`.
Final harness hash
`33783895474482381efc6d438493cfc5f37d7a230a0db951dc6baf99cbf0ac51`
only makes repeated timing opt-in; semantic default avoids adding27s to every
hook. Original32k generic20s harness timeout was fixed by using a measurement-
only45s test timeout and bounded repetitions; it was not a service SLO result.

| Input / returned rows | JSON bytes | Producer+serialize p50/p95 ms | Parse+reader+model p50/p95 ms | Pure chart reducer p50/p95 ms |
| ---: | ---: | ---: | ---: | ---: |
|720|391931|8.022 /14.261|12.015 /24.985|4.817 /8.690|
|2000|1074675|26.379 /32.511|27.456 /62.592|16.767 /18.509|
|8000|4277796|107.191 /164.167|110.056 /160.377|66.667 /106.187|
|32000|17134171|470.121 /663.228|533.186 /774.377|328.485 /454.078|

Chart retains respectively720/1000/1232/1280 plotted points; strict reader/model
still processes all returned history. Missing fee stays absent, actual funding
`"0"` stays zero, malformed tail rejects. Snapshot panel count1 alongside32k
history is explicitly tested. These are measured support points on a shared
host, not an approved production response-byte/latency/DOM budget, load/G2 or
calibration. DEBT-047 is not globally closed by inventing a2k or32k ceiling.
If an enforceable bound is wanted, design byte/page policy preserving all
history access rather than silently truncating it.
The32k synthetic envelope is17,134,171bytes, larger than16MiB: this is
explicitly **not** proof that the current16MiB cached HTTP response can serve
it. Do not set32k as an API/DOM default from this microbenchmark. Any paged/
byte-budget change is separate contract work, not an implicit cap in this fix.

Focused repeat:

```sh
# apps/control-api; default semantic lane is cheap
node_modules/.bin/vitest run test/paper-history-depth.spec.ts test/paper-history-population.spec.ts --maxWorkers=1 --no-file-parallelism
# Repeat deep timing only when needed, never on every hook:
PAPER_HISTORY_DEPTH_MEASURE=1 node_modules/.bin/vitest run test/paper-history-depth.spec.ts --maxWorkers=1 --no-file-parallelism
```

## 3. Claude handoff — bind existing components, do not rebuild them

1. Regenerate/use `execution-incident-eligibility.d.ts`. In the existing
   incident rail bind the three actions/reasons, preserve required evidence
   inputs and use the returned workflow version. Use canonical
   `execution-incident-eligibility.synthetic.valid.json` cases `open`,
   `mitigation_ready`, `resolution_ready`, `resolved`; fixture mode is explicit,
   never a real API fallback. POST refusal/current check stays authoritative.
2. Overview: existing `api.getManagerDataset({surface:"FUND",environment,
   workspaceId})` → `executionManagerFundOverviewGetV1` → `ManagerDataset` →
   existing reader `capitalStatements[].metrics` and `scores`. For the current/
   cumulative capital fixture **omit performance window**; its metrics have
   window:null, and the fixture intentionally refuses unsupported windows.
   Do not send the NAV series window and silently ignore a400.
3. Bind exact capital keys `initial_funds`, `added_funds`, `returned_capital`,
   `current_nav`, `current_budget`, `pending_amount`. Keep economic/currency
   partitions, unit, quality, window and absence; never sum money in browser
   or relabel allocation/net PnL as capital. Existing NAV/NET_PNL/RETURN series
   consumer is already implemented—do not rewrite it. Direct-NAV/raw/
   composition Score semantics remain distinct; pending calibration stays absent.
4. Fleet already consumes Manager dataset for single-environment/table mode.
   Exercise Paper table, page/group/filter/drawer/back/reload; default All/board
   intentionally uses the list and is not proof the dataset consumer is absent.
5. Rich fixture profiles `populated`/`layout-stress` now expose six explicit
   synthetic capital facts with genuine0, typed null, signed exact decimals,
   long labels and currency partitions. Existing `sparse-realistic` stays
   unchanged. `review-manager.ts` facts are independent synthetic values, not
   alleged financial-source publication. Runtime installation was not done.
6. Paper chart/table caption must use history source_rows/returned_rows/
   downsample. Add FE L2 depth cell from the measured corpus, then browser
   render/memory/overflow checks; reducer timing is not DOM timing.

Claude exit gate: strict generated/reader/fixture parity; current refusal and
absence rendered honestly; targeted tests; real browser1280/660 on exact
bundle/profile, no overflow/console error, keyboard/focus, table/history scale
disposition and verified async request settlement. Preserve current HiFi/
components, no baseline re-record or new UI without its normal owner approval.
Prior98/100 matrix +focused6/6 is not relabelled one100/100 run.

## 4. Verification, ownership and next work

Already actual focused runs: access write boundary9/9; incident unit20/20;
access contract71/71; incident contract8/8; Paper population+fast depth12/12;
rich fixture19/19; route ownership ledger22/22. Route census320,
0collisions/protected kernel MATCH. Generator/snapshot552files PASS.
These scopes overlap neither SQL nor installed/browser qualification.
Final PG/build/cleanup disposition and commit are appended below after they
actually complete. No full hook per campaign§10.10c: focused source slice,
not a frozen landing; no repeated45minute gate for receipts.

No source/authority/session/listener/install or upstream command/Live action;
no production/dev/main, UI component/CSS/token/baseline, peer WIP or remote
push change. Dedicated test cells must clean only their own resources.
Rollback is source-only; do not roll back immutable grants/audit by DB restore.

Codex next: complete named PG/build checks and commit owned paths; answer
[CORE-01…07](CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md) through Edge.
Claude next: the six consumer checks above independently of source windows.
Financial trusted-row builder/runtime trust, active revoke connected specimen,
numeric budget/calibration/G2/browser stay their own explicit gates. ELP2-10
remains open; ELP2-11 is not entered.

## 5. Actual focused closeout —22Oct2026,11:31UTC

One disposable runner, after acquiring `/tmp/portal-heavy.lock` (no concurrent
heavy gate):

```sh
bash scripts/control-api-test.sh test/incident-workflow.spec.ts test/paper-history-sparse.pg.spec.ts
```

**PASS,exit0:** Control API TypeScript build; fresh isolated migrations through
149; incident HTTP/workflow4/4 + actual sparse history SQL1/1,5/5 total,
17.71s Vitest (build/prepare separate). Real decimals`-2.50`/`100.125`,zero,
null/malformed exclusion, peer workspace/deployment/range isolation and the
ordinary raw reader were checked. An independent review initially suspected
regex over-escaping; a raw source-byte count found exactly two JS backslashes
(one SQL backslash), and the actual decimal PG case passes. No unnecessary
regex rewrite was made. Existing incident boundary regression4/4 also passes.

The same runner's PostgreSQL dump/restore drill passed, including four scoped-
access row digests; no new product migration was added or applied to Research.
Cell suffix36525811398412719; Node bound3CPU/3GiB, PG1CPU/1GiB. Two actual
samples (not peaks): Node98.08–113.83% CPU,1.275–1.403GiB; PG0–0.03%,
72.95–73.73MiB. These test-cell measurements are not G2/production capacity.
Cleanup exact container/network queries returned zero resources at11:31:19UTC,
recorded in the [machine receipt](claude-local-support-test-results-2026-10-22.json).

Generators --check, two independently regenerated OpenAPI types byte-diff,
contract snapshot552files, N29/EDS12 integrity (runtime_effect NONE), route
census320/0collisions/protected kernel MATCH, R2 ownership ledger and tracking
checks passed. EDS12 re-pin was mechanical; source/runtime qualification
states remain unchanged. No full hook: this is an intermediate focused source
slice under campaign§10.10c, not frozen candidate landing/connected delivery.

Only fixture data and its test changed under Portal; no component, CSS,
typography, router or baseline was edited. Independent review ACCEPT applies
to source/contract only. Runtime and Claude consumer/browser gates remain
NOT_INSTALLED/NOT_RUN; they are not waived by these tests. Source commit and
final mirror pins are indexed in Unified/sync after the local commit exists.

Source commit **`cab09dc94cd47584d2fe4a28379c04b63d823ca5`**,35 files,
**+2754/−50** (including generated contracts, tests and machine evidence).
The initial full Edge return is committed as
`e5b8c9b660ef6c2af49b7132f3ba65910724247c`; final public delivery is indexed
in sync. Claude may consume the new type/fixture now at this exact source;
actual API use waits for the normal reviewed preview installation. No push,
branch merge or runtime rebuild/install is implied by these local commits.
