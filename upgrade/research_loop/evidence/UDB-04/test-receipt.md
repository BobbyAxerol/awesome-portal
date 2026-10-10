# UDB-04 — Test / reuse receipt

See [report](./phase-report.md); private hashes in [index](./receipt-index.json).

## Focused validation

- Real disposable PG: initial4suites49tests, governance fix3suites43tests,
  retained revision8tests PASS. Overlap exists: **do not add** as unique total.
- Context/outage/cache/canary unit12PASS. Publication href3suites38PASS,
  subsequent negative URL/query/fragment contract5PASS. Generator check PASS.
- Config/source-stamp/safe-read-driver4Node file runners PASS; direct retry
  tests2PASS. Bash/new harness syntax and diff whitespace checked.
- Final Control Docker compile PASS. Normal grouped commit hook required;
  hook PASS is not latency/browser phase PASS. No FE source changed: don't
  rerun all FE unit/engine gates for docs; specific real browser still required.

The first complete Control regression attempt recorded 2,480 PASS / 1 FAIL /
3 SKIP: the historical N29 product test still expected an ungranted requester
to see a Governance condition in Command Center. The test is corrected to
assert the existing register's scoped empty rows/counts and a hidden CC
condition for that caller, plus positive
visibility for the owner and explicitly delegated R1 decision reader. Backend
authority is not weakened; this failed attempt remains in the private hook log.

## Initial harness lanes — historical, later retake below supersedes DR status

| Harness | Outcome |
|---|---|
| `acceptance-cell.mjs` | Private clone, actual images/caps; once-only init and terminal-down guard. No shared RWvolume. |
| `acceptance-api.mjs` |23test accounts via actual activation/login,20distinct readers; original clone users only scoped sessions, no password reset. |
| `acceptance-load.mjs` |64trial HEAVY+4queued,20readers/1,000full≤2MiB body reads. **Latency FAIL**, HTTP/resource safety PASS. |
| `acceptance-dr.mjs --resume-reads` |28auth cases; independent PG faults/restore, current-auth barrier,27table hashes/77manifest bytes. HTTP-only resume after closed idle socket. Newly added final-artifact backup/restore branch **NOT_RETAKEN**. |
| `acceptance-artifact-restore.mjs` | Original archive really restored into fresh labelled volume;68/68manifests/parts, temporary volume removed. Not later9disposable outputs. |
| `acceptance-export.mjs` | Prepare→finite worker→download82,416B SHA verified; wrong actor/workspace404; no legacy GET or engine rerun. |
| `acceptance-browser.mjs` |68cells/8Axe/keyboard cells/16sidle: overall **FAIL**; RC→R1 PASS. Labelled output permits distinct attempts, never overwrites old receipt to hide a failure. |
| Exact helper / small smoke | Web and Roadmap app-only rollout; exact web index and unchanged rootfs proved.2routes without503, CC bootstrap still occurs; does not close prior burst/Axe failure. |
| `acceptance-source.mjs before/after` |16Core custody groups/6SQLite tables/migrations/FKs/binding authority match. Sessions/login telemetry separately declared, not business exceptions. |
| `acceptance-cleanup.mjs`, cell`down` |23test users/session revocations,20grants, only2exact original-clone test sessions;8services/5volumes removed; source backup/post-revoke auth retained30days. |

## Recovery / resource caveats

9periodic cgroup samples include pagecache;959,516,672B observed max is not
lifetime peak (`memory.peak` unavailable). Hard cap4,536,870,912B,0observed
OOM. Shared preview not strict5GB. No24h soak claim.

The actual original archive68/68 restore and77clone byte parity across DB
restore are different proofs. Later9test outputs were removed with the
private clone, not archived in the original backup. The later final mixed-load
lane retained/restored `artifacts-final.tar.gz` alongside current DB/auth before
cutover and keeps it30days; it does not close the outstanding latency failures.
No source/product data lost,
no generated replacement called original bytes. Historical83/86 unchanged.

The corrected artifact lane validates the exact two stopped, clone-owned
volume holders, replaces only the labelled test artifact volume, and extracts
the verified final archive into that fresh volume. It must not overlay surviving
bytes and mistake their continued existence for backup recovery. This new
combined branch was initially NOT_RETAKEN. The later real checkpoint below
supersedes that state, not the original failed load or browser receipts.

## Later scoped retake

- Governance historical list contract corrected:200scoped empty rows/counts
  for the ungranted member; separate detail403 unchanged. Targeted real-PG
 6/6PASS; no authorization policy relaxed. The known-failed grouped attempt
  was stopped rather than running all remaining tests after that assertion.
- Final cache guard respects the published8MiB cap; larger Paper data only
  coalesces in flight.12context/cache/outage unit tests PASS, including exact
  DNS`EAI_AGAIN`→sanitized authority503. No FE or contract-limit change.
- New load195f098a:20principals/1,000GETs/64trial child+4queued,
  HTTPerrors0/OOM0. Four500ms summary gates FAIL:679/631/744/626ms;
  Report441ms now passes. Observed cgroup max1,787,994,112B, not lifetime peak.
- Corrected c18099d2 DR:28auth cases, real Core/Execution outages, stale
  pre-revoke restore rejected before cutover,27Execution hashes equal;
  final archive restored into a fresh volume,69/69manifests/3,212files/
  72,511,079B verified. Original83/86 historical exception population unchanged.
- Receipt paths permit a new bounded private lane without overwriting the
  old terminal lane. Original failed DNS receipt and backups retained.

These are scoped proofs on named images, **not** a final single-image mixed
load/browser PASS. Final code returns to8MiB compatibility; the mixed-load
and restored8MiB image still require the outstanding acceptance work.

Test-client retry is exactly one GET/HEAD retry for`UND_ERR_SOCKET`, never
POST/HTTP refusal/arbitrary transport error/product retry. Earlier failure
logs/images remain distinct. No false final single-image qualification.

## Final scoped rollout and cleanup

Control API4278509a (COPY hash7d20d6eb,549files) app-only rollout completed;
existing web/components, both PGs, NATS, worker and data unchanged. Final
source custody16Coregroups/6Roadmaptables PASS. Final owned identities
23disabled/0active sessions/0active grants;8services/5clone volumes removed,
remaining owned resources0. Archive/current-auth evidence30days retained.
The final normal root hook is required for the checkpoint commit; its exit
and SHA are returned in the handoff, not inferred from targeted tests.
