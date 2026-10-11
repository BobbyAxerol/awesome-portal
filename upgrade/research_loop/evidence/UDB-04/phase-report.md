# UDB-04 — Delivery and acceptance checkpoint

**Later amendment:** Bobby approved the [16 MiB coordinated cache limit](./cache-limit-amendment.md)
on2026-10-11. This supersedes historical8MiB/not-activated statements below,
not their failed load/browser results or the overall OPEN verdict.

2026-10-11 Asia/Saigon · `docs/research-loop-plan` · parent `16f2c18c`.
**ACCEPTANCE_OPEN — NOT_PHASE_PASS**. [Unified](../../../UNIFIED_IMPLEMENTATION_PLAN.md#udb-04),
[tests](./test-receipt.md), [gaps](./debt-register.json), [Claude handoff](./handoff.md).

## Delivered backend fixes

1. Retained context shares only bounded2s metadata/data, never session/rights:
   nine domain queries for20callers instead of180. Core access checked before
   and after; owner calculated separately per caller; errors not cached.
2. Retained snapshots coalesce by workspace/environment/profile. Measured
   Paper view8,594,668B exceeds the published8MiB cache cap. A16MiB diagnostic
   candidate was tested but did not close the SLOs; **final code keeps8MiB**
   so the current strict browser contract remains truthful. A larger view is
   shared only while in flight, not retained. Maximum3entries/2s; scoped PG16 SHA-256
   revalidation reuses unchanged bytes without advancing original source
   clocks. Changed inputs reload; expired cache +DB outage refuses. Transaction
   capture bypasses the memo. HTTP private/no-store; permission cache0.
3. Command Center reads domain/auth **before** holding Core transaction;
   removes duplicate raw multi-MiB snapshots. Governance triage/today rows
   **and counts** now use the same fresh gates as Inbox. A nonowner ADMIN or
   retained USER grant cannot grant governance read/decide or Research access.
4. Exact Canary/Live workflow envelopes keep Core workspace authority;
   Canary no longer mistakes source-workspace access for workflow membership.
5. Core transport loss, including observed Docker DNS`EAI_AGAIN`, returns typed503`PORTAL_AUTHORITY_UNAVAILABLE`;
   known raw read-store disconnects return503`PORTAL_READ_STORE_UNAVAILABLE`,
   private/no-store/Retry-After. Invalid SQL/contracts and arbitrary private
   error text remain distinct. No cached auth/stale fallback/mutation retry.
6. Real RC mirror/conflicting-publication href carries authorized
   `workspace_id`. Zod/OpenAPI/types/canonical fixture/negative URL tests
   updated; no sealed pack/publication/grant rewritten. Legacy link accepted;
   external URL, extra query and fragment rejected. Generator avoids unrelated
   semantic-identical P21 formatting churn.
7. Strict combined test profile: Core900,000,000B +Execution536,870,912B +API
   500,000,000B;8service caps sum4,536,870,912B. One350MB utility fits; MinIO
   plus utility does not. Existing pool6/queue12 and SLOs **not relaxed**.
8. Exact-image helper accepts explicitly named app-only`--force-recreate`;
   never DB/NATS/implicit full-stack/migrate/bootstrap; worker guard retained.
   A new OCI index with the same runtime config previously stayed on the old
   container index. Current web index now matches the built index.

No frontend source/component/theme/baseline changed. No new migration,
original credential reset, Trading System direct access, Edge renewal,
source/SSE/command, remote push, dev/main/stable or signed-release action.

## Measured gate results

| Gate | Actual result |
|---|---|
| T01 authority |28real API cases PASS: Bobby anchor vs nonowner ADMIN, actual scoped claude-preview reviewer, distinct readers, disabled/revoked/expired, wrong workspace/profile/object, CSRF/Origin and genuine owner step-up refusal. **Stan absent/not tested**. Actual RC→R1; authorized downstream404 records missing capture, not a fabricated approved chain. |
| T02 resources |1real64trial HEAVY +4durable queued intents,20authenticated readers,1,000full-body bounded GETs.0HTTPerrors/0OOM on512MiB Execution profile.9periodic cgroup samples observe959,516,672B max; hard cap4,536,870,912B includes pagecache. Kernel`memory.peak` unavailable: not lifetime-peak proof. |
| T02 latency |**FAIL**. Library833/Progress657/Evidence617/Report501/CC524ms p95 vs500. Search436 vs750; Replay613 vs1000; retained context331/Fleet356/bindings443 vs500 PASS. |
| T03 DB/current authority |Actual separate PG outages/restores PASS: Research remains available during Execution outage; Core outage fails both authenticated planes closed. Old pre-revoke backup rejected **before** app start; current auth custody hash required for cutover.27Execution table hashes match. |
| T03 artifacts |Original lanes:77/77 clone parity and68/68 original archive restore. **Later combined recovery PASS** on the DNS-corrected image:69/69 manifests,3,212files/72,511,079B, actual final archive extracted into a fresh clone-owned volume;27Execution table hashes and current-auth barrier PASS. Populations remain separate. |
| T04 browser |68cells1280/660:0overflow/pageerror/businesswrite; realRC→R1 click+reload preserves workspace. Overall **FAIL**:3Portfolio/context503s,2CC bootstrap GETs,6of8Axe cells fail.2route retake passes without503, but does not close full burst/matrix; bootstrap still reproduced. |
| T04 export |Real prepare→worker→download82,416B SHA-256 verified, private/no-store, wrong actor/workspace404; no legacy GET or engine rerun. |
| T05 custody/cleanup |23owned users disabled/sessions revoked,20grants revoked; original cloned users only2exact test sessions revoked, no password/global-session change.8test services/5clone volumes removed.16original Core custody groups/6Roadmap tables/migrations/FKs/binding authority unchanged. |

Failed250MB Execution OOM and650MB Core reclaim candidates remain failed;
earlier pool/latency/URL/browser attempts retained separately. Current API
image is **not** qualified by an earlier failed-load image. A post-Nginx idle
socket failure required HTTP-only resume after auth hash/fresh DB restore/
artifact re-verification; no full DR rerun or fictitious green.

Original P23 strict83/86 and its3accepted historical test exceptions remain
unchanged; neither68/68 nor77/77 rewrites that denominator or recovers bytes.
Original backup is retained30days. Later9disposable test outputs were not in
that earlier archive and were removed with the test clone. No shared/product
data removed; no claim those new test bytes can be recovered. Next already-
required final mixed-load lane did exercise the corrected final artifact
archive/restore before its scoped cleanup; the later checkpoint below supersedes
the earlier NOT_RETAKEN state, not any failed-load result.

## Later checkpoint — same scope, new real evidence

Private retake directory:`acceptance-final-20261011`; earlier receipts remain
unchanged in`acceptance-20261011`. New1real64trial child +4queued intents,
20distinct readers/1,000full GETs:0HTTPerrors/0OOM,10cgroup samples,
observed charge1,787,994,112B within hard cap4,536,870,912B. Kernel lifetime
peak still unavailable. Warm p95 **Library679/Progress631/Evidence744/CC626ms
FAIL** against500; Report441,Search337,Replay493,context328,Fleet344,
bindings417 PASS. This load used195f098a; it is not qualification of a later
image or the restored8MiB bound.

The first retake's Core outage exposed raw DNS`EAI_AGAIN`→500. Failed receipt,
log and exact backup bytes preserved separately. The corrected c18099d2
image returns503`PORTAL_AUTHORITY_UNAVAILABLE`;28API authority checks,
current-auth/stale-backup rejection,27table parity and **fresh-volume69/69
archive recovery PASS**. Archive38,390,882B SHA-256
`4f1e0f347db3d22d0c48d959c2ac563a18a676a8a6faee70dc8ed4d216ff3264`;
restored verified tree SHA
`10ef09c03270811bf91cf8b0363773fa573ebfdbc4c48d1eeafcbbf1f4d05605`.
The common byte-verifier's default`byte_recovery_performed:false` describes
verification itself; the harness performed a separate archive restore after
removing the exact stopped clone holders and replacing their labelled volume.
Do not mistake that generic verifier field for a skipped restore.

Final8MiB cache guard retains compatibility with the published v1 context and
Claude's strict reader. Unit12/12 and Governance6/6 PASS. A coordinated16MiB
contract/consumer amendment remains an optional proposal, **not activated**.
No frontend file changed. Mixed-load/browser still OPEN; no single-image
cross-loop acceptance or phase PASS is claimed.

## Exact preview and reuse

<https://research-portal.primusspark.com>, preview only.

- Current Control API:`sha256:4278509ab934b444df92a37b2fb06f3c6367f74776cdeeceddaa3362a2142803`.
  Applied app-only at2026-10-10T21:57:16Z; exact549Docker COPY inputs SHA-256
  `7d20d6eb68d8cff85f1dd515d2ca01fc1a42d293e742aafee4c5847414d24fba`.
  This supersedes the historical195f098a/babefa97 runtime identity above,
  not its failed load, nor the scoped c18099d2 DR result. Cache8MiB and DNS
  outage mapping are present; no final-image full-load/browser PASS claimed.
  Built from recorded parent plus this working diff, **not** signed/clean
  release. Post-commit byte check binds same inputs without docs-only rebuild.
- Web:`sha256:ae86a99c9aff2eeb05be0ea9d987b332d224799408e70fce5d342791ea672d3d`,
  bundle`/assets/index-CBEWyyfN.js`. Previous7fc8be4e index has identical
  filesystem layers SHA`92d6887dd1aaec0df7f08bf61c7aa952f54c1e239702a86abb065c79ae80db34`.
  Exact index applied by helper; unchanged68cell evidence reused by byte
  proof, not presumed PASS. No new baseline or UI redesign.
- API/worker unchanged20da7661, PG16.15 digestcf78e766. Additive final R1 URL
  change covered by focused tests/browser, not a fresh full-load qualification.
- Roadmap originalda8e8418 index was already unresolvable; separately
  qualifiede32bd322 replacement has identical actual application bytes
  SHA`f8099983f1a978571c274356f2e4a81a7c8178654696adbc98ab32c4becbfd73`.
  App-only rollout retains existing SQLite volume;6table custody passes.
  Replacement provenance, not recovery of the original OCI index.

Shared preview uses its normal preview RAM profile, **not** strict5GB.
Source/Edge/Market Context/mirror writer+reads/SSE/commands remain off;
retained data stays STALE/PARTIAL. Core identity remains the single authority.
No shared PG restart, migration/bootstrap or stable volume takeover.

## Packet, C4 and next work

Private raw receipts/backups/screenshots:
`/home/bobby/.local/state/portal-udb04/acceptance-20261011` and
`/home/bobby/.local/state/portal-udb04/acceptance-final-20261011`,0700/0600,30days.
[Index](./receipt-index.json) commits counts/hashes only, not credentials,
JWT/cookies, business rows or market data. Free disk≈26.86%; active/rollback
images protected; no broad prune/VACUUMFULL. Recomputable image/cache cleanup
is a named quiet-window C4 follow-up, not permission to prune during builds.
The final clone's23owned identities/all their sessions and20review grants
were revoked; original cloned users only2exact sessions, never their passwords
or global sessions. All8services/5owned volumes removed; remaining owned
container/volume counts0/0. Final archive and post-cleanup auth backup retained.
Final shared custody recheck PASS:16Core groups/6Roadmap tables and identity
binding authority unchanged. At21:58UTC disk free178,430,943,232B/665,811,062,784B
(26.80%); no image pruning, all current/previous rollback pins protected.

Remaining: Codex closes4summary SLOs and Portfolio burst; Claude closes CC
bootstrap/accessibility from [handoff](./handoff.md). The later combined
artifact recovery is now proven, not pending. Final load/browser must align
to one candidate before reconciling affected
P23/P24, not rerun every unchanged engine/UI gate. Only all applicable PASS
permits`CROSS_LOOP_PREVIEW_READY_FOR_BOBBY_REVIEW`; currently **not achieved**.
