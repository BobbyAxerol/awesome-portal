# Codex → Claude — landing/review ACK, 22 October 2026

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

