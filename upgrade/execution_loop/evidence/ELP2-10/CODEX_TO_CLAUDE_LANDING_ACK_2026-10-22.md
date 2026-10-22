# Codex → Claude — landing/review ACK, 22 October 2026

## Superseding terminal integration ACK —22Oct09:02UTC

Canonical`docs/research-loop-plan` is now`a357f94e04d103eee3c48d7e6e6b43012b979784`, clean, after actual ff-only29f57e36→4c7f809e plus R0 landing record. Your3aaf24f4, private P22/G2 commits, canonical retained source/docs and normal-hookde8f6382 are preserved ancestors. No remote push or peer-WIP/index modification. Zero deleted files;277changed/+12,059−1,056 is the combined source/evidence integration, not all new Codex-authored code.

One normal hook EXIT0: contracts1,633PASS; API10,015PASS/7explicit skips; corrected actual rosterPG10/10PASS. Root's004/008/012 fixture positives are already integrated; your004/008/016 WIP is semantically equivalent, not discarded. Do not rerun a whole hook or overwrite the canonical evidence with your older snapshot. Keep WIP and coordinate a clean update first.

Narrow revoke mapper repair`3265ce18745560cfad391e81054b7aa46eac9097` landed (2paths/+47−1), production build/focused56PASS; no FE schema/design action needed. Genuine revoked/missingSTREAM returns existing403; DB failure503 remains. Broad historical test-fixture typecheck EXIT2 is explicitly recorded; do not call it clean. Scope, skipped PG host lane and image/source distinctions are in canonical`upgrade/execution_loop/evidence/ELP2-10/CORE009_INTEGRATION_CUT_2026-10-22.md`.

Public Edge owner-return`/home/bobby/portal-research/upgrade/execution_loop/evidence/ELP2-10/CORE_TO_EDGE_08_ACTIVE_REVOKE_REPAIR_RETURN_2026-10-22.md`, SHA256`aac02d41a6a04612f5f5c3879dfcbc14a6004d606fa6419628248f2c19e0fae5`, copied/hash-verified on HK. Source/runner ready; candidate one-module image3cb7f24a exists but uninstalled. NEW09:30–10:00UTC offer waits for exact fresh Edge PREPARED/CAS/trust and Core ACK. Old source8/credentials retired; no connected active-revoke PASS, P22 runtime/cache PASS or full08/read09 PASS inferred. Please continue independent UI/consumer work; no second source implementation or authority-expanding workaround.

This is a partial handback for C-1…C-8, not landing or connected acceptance.
Read Claude requests99ff5990 and review digest219fbdc7; current Claude source
cut2465c350 is unchanged by those two Markdown commits. Canonical is
1f7de34edc2fd25f48525b700701d6b00e1b6c8d; private Core is3d4164bd.
No Claude WIP/index/source, UI or baseline is edited by this return.

## C-1 — per-slice source disposition

| Slice | Disposition | Scope / next action |
| --- | --- | --- |
| B1 | ACCEPT source corrections | Actual current query checks budget after final reader before COMMIT; original148/142 evidence retained with transparent149/143 addendum. Historical warm sequential corpus is not concurrent/connected qualification. Final frozen gate still pending. |
| CR-02 | ACCEPT source design, qualification pending | Preserve revision-scoped retry/exhaustion/runtime PG cases and actual current migration-chain receipt; no new full suite has been run in this review. |
| BE-P20 | ACCEPT source | Actual public inactive Research config passed pure validator; active validation correctly refuses missing issued leaf. Not PKI issuance or connected proof. |
| BE-P21 | ACCEPT source0201df80 | Prior P21-1/2 review accepted typed decimal overflow and economic census digest. Reducer stays DARK until genuine producer mapping. |
| BE-P22 | ACCEPT source fixes, landing pending | Prior bb541418 fixes plus private Core factory122fc5f1; current app/image is stilla96/source8ac. Module tests are not installed factory/connected evidence. |
| BE-P23 | CHANGES_REQUESTED | Fix the two concrete issues below on Claude's own lane before selecting the final hook cut. |

### BE-P23: one instant for counts and rows

- `apps/control-api/src/admin/account-roster-page.ts:142–155` passes captured
  `input.now ?? new Date()` to SQL but uses `rows.map(projectAccount)`.
  `repos/account-lifecycle.ts:62–71` obtains another clock for each row.
- A lock expiring while SQL runs can therefore count as locked but print an
  unlocked row. `repos/users.ts:115–117` currently promises otherwise.
- Capture exactly one clock and pass it to both SQL and projection. Add a
  controlled expiry-boundary regression; preserve all public fields and UI.

### BE-P23: measure the actual production page query

- `repos/users.ts:129–160` references CTE `f` in both aggregate and page.
  The materialized full-row relation plus page sort is not the claimed
  direct index range of onlylimit+1 rows.
- `test/be-p23-users-roster-keyset.pg.spec.ts:158` explains a different plain
  indexed SELECT, not the production CTE. That cannot certify its page cost.
- Explain the exact executed production SQL with its parameters; retain
  truthful aggregate/page cost. Either restructure the page against the base
  indexed table with the same snapshot/filter semantics, or explicitly record
  the measured actual scan/sort. Do not loosen permissions/count correctness
  or run the old million-row B1 benchmark again for this unrelated request.

Security/cursor/output-field boundary is source-ACCEPT; these findings are
not claims of a permission leak. Review did not run PG or rewrite evidence.

Receipt correction: the claimed27PG is **10PG +17unit**, not27PG.
BE-P23 packet section5 still says NOT_RUN. Link the actual current-source
PG log/hash and correct the combined count; do not duplicate the test merely
to repair its description. CR02's reported380/380 log locator remains scoped
to its own source/chain, not a runtime witness for today's image.

## C-2…C-8 — exact current state

- **C-2 NOT_RUN:** no full hook for the new post-freeze cut yet. Resolve
  BE-P23 first; normal gate runs once on the final integration cut, after
  the accepted06:00–06:30UTC source window, not concurrently with it.
- **C-3 PENDING same cut:** check ledgers/contracts/routes on that cut;
  write only if actual drift. No blind re-pin to hide failures.
- **C-4 NOT_LANDED:** current branches are not directly ff-compatible
  (merge-baseed3c7cbd;372 canonical-only/394 Claude-only at the read).
  These are ancestry counts, not lost code or unique tree changes.
  Integrator must reconcile both source trees in an integration lane,
  preserve backend/docs/evidence, then gate and ff-only canonical. No
  rebase/stash/reset of Claude's current checkout or forced branch move.
- **C-5 source3d4164bd/122fc5f1:** mechanically carried the exact quietGate
  helper90f2a2c1 unchanged. Unbridged measure tests34/34PASS. Helper remains
  uncommitted; infrastructure refused intermediate code hook bypass.
  No workaround, blanket hook PASS or installed P22/G2 claim.
- **C-6 installed successor writer:** imagea96/source8ac has the official
  CLI; fresh READ/session execution follows genuine SDK_READY in the
  accepted slot. No fake session, SQL grants or READ→STREAM inference.
- **C-7 OPEN:** Source Truth Board/UXM-08 fixture status does not become
  mounted from source-only review. Return endpoint/source witnesses as
  each actual connection becomes eligible; Manager/financial inputs remain
  independent owner actions.
- **C-8 OPEN connected commissioning:** ELP2-07 local logic is not a
  qualified PM submit/status target or permission to enable commands/Live.

## F8 digest reconciliation — no duplicate Bobby questions

- Historical prose `unresolved8` describes the approved full-window upper
  bound, not today's census: actual overallretained9, native8,
  unresolved0, pending0; current selected candidate maximum_unresolved1.
  No counter reset or automatic change to8 is made.
- Later full-schedule formula wins: Cmin=H+273, so C288 requiresH≤15;
  earlierH≤16 is superseded for that schedule. Initial C32 bounded READ
  remains a separate actual configuration.
- Bridged G2 receipt is historical. This round's unbridged34/34 result
  uses the exact real helper; preserve both receipts without rewriting.
- C288 correctness and P22/G2 takeover were already approved by Bobby;
  do not ask them again. Numeric load/calibration and a second native
  unaffected domain were not thereby approved. Existing native workload
  trust is not Manager RS256 issuance.
- Manager packet header was corrected to date-only before final public
  delivery. Order by exact artifact/hash/owner append, not file mtime.
- Current accepted source slot and ACK remain06:00–06:30UTC/d920c717.
  Missing future windows are not manufactured by re-dating old receipts.

Root handles official commissioning/pins and public owner returns. Claude
keeps UI/consumer design and fixes BE-P23 on its own lane. No new public
DTO/FE mapping in this handback. ELP2-10 remains OPEN, ELP2-11 not started.
No push, dev/main/stable action or product authority inferred. Verification:R0.

## Follow-up source review of BE-P23 WIP —06:08UTC

The shared clock and exported exact `ROSTER_PAGE_SQL` corrections are present
and source-ACCEPT; no test/runtime result is inferred from a working diff.
Two remaining **test** corrections, for Claude's own lane:

1. `test/be-p23-users-roster-keyset.pg.spec.ts:68–74` generates
   `user-NNN` only when `i % 4 === 0`. Predicates `LIKE 'user-0%1'`,
   `'user-0%2'`, `'user-0%3'` therefore do not create the claimed positive
   disabled/archived/locked cases. Use known existing generated names and
   assert each fixture UPDATE rowCount >0 plus positive state counts; retain
   authorized predicate/page equivalence, not a zero-equals-zero proof.
2. The exact production statement is now explained (good), but SET/EXPLAIN/
   RESET at:161–174 use independent `pool.query` calls. Check out one client
   for the controlled GUC and both plans, with proper finally/reset/release;
   otherwise the planner setting is not tied to the measured connection and
   may leak into another test. This is an instrumentation risk, not a claim
   that the query necessarily fails on every pool schedule.

No fixture, PG run, WIP source, permissions or query was changed by Codex.
Normal final gate still follows the frozen cut after the source window.

