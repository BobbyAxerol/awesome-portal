# UDB-02 — Execution store split / retained preview closeout

2026-10-10 · **PASS_ISOLATED_STORE_HYDRATED_PREVIEW** · branch
`docs/research-loop-plan`, parent `4a79429a`.

## Scope and result

Execution read data is now in its own private PostgreSQL16.15 container,
named volume, limited role and bounded pool. Core identity/Governance and
Research remain in the original DB. No frontend edit, public contract change,
remote push, dev/main/stable rollout, Edge/TS access or SSE/command activation.

Seven projection/mirror/history/cache/query repositories inject
`EXECUTION_DATA_POOL`. Command Center's single projection query uses that
pool while Governance/operations remain Core. This is explicitly **not** a
cross-DB atomic snapshot. Core pool lookup is DSN-keyed; domain creation cannot
replace the legacy identity pool. Borrowed/idle connection disconnects are
handled with sanitized, throttled diagnostics; query errors still propagate.

Target domain has27 public tables /14 internal FK constraints; no users,
credentials, membership/grants or Research schema. Independent migration
`131.execution-store.v1`, digest
`be5fd2dfbd537f582e3135b7edadf1fce0ead8ac7852ad18f5e0c5b617341347`.
Reuse16 frozen, SHA-pinned historical DDL inputs; three workspace FK targets
become explicit Core-validated reference receipts, never an authorization DB.
Original Core ledger125 entries is unchanged. Existing RC→R1 remains Core.

Runtime PG:512MiB cap,1CPU,24connections,64MiB buffers,1MiB work_mem,
16MiB autovacuum ×2,256MiB max WAL,32MiB per-process temp limit, no PG port.
Pool6 connections /12 queued, acquisition2s /statement5s; real overload
refuses extra Promise **and** callback-query requests. Separate owner DSN
mounts only in PG/one-shot operator; runtime cannot update retained facts.
Future combined P23 overlay keeps total PG900,000,000B split650M/250M and
long-running4.6GB budget, **versioned only / not applied or qualified here**.

## T01 — Imported data and parity

Source is the existing **local Portal dev DB**, not Trading System DB.
Read-only repeatable-read export; original workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660`; exact PostgreSQL JSON/UTC microseconds and
decimal strings. Import empty scope only, atomic transaction, SHA/row counts,
bounded file/row limits, immutable run ID and idempotent content verification.

| Primary import table | Retained / source | SHA-256 of canonical rows |
|---|---:|---|
| Profile snapshots |3/3|`05fbca106ea959f4547e06e223629a472c0db6683476f78758a21d5f026bd025`|
| Manager snapshots |6/6|`dae8d6cf93259555a3187197d6968c875104004150e5e1ddd799f7b382596f2e`|
| Alpha fleet projection |254/254|`6e494e46546dcef4e8052bc9de18e9478b92b3951d3286f0162d3ad8dbc4f6f3`|
| Binding projection |174/174|`0e07984003b365a20477d68ff5e07d0e01b1479d54d19e1a5571dad695b46478`|
| Portfolio projection |2/2|`cc1e954ed3abf964826e051b8026503cf08852e12e3f3c6aa5329361c27a956b`|
| Legacy history |49,421/752,796|`b667d8679aff4414c0ff30ac5ecaf5f191d593ea304600b64db053c62109dfe7`|

Run `udb02-20261010-pk`:87,500,845B, file SHA
`f3abc13c95a64f27f20dc18159ca8d69d4f125db887eaee5410c9ac03ed15d5f`,
manifest digest `75935f49a26a3d8069dfd81948c09b62ac8b0aa6d268ec01a773dd0ed278d2af`.
Latest≤20,000 history rows **per environment/profile/relation**, not entire
population/full history. Fill source includes1970 timestamps; preserve rather
than silently repair. Overall latest history timestamp2026-09-27T03:40:00Z.

Complement `udb02-current-20261010`:7,966,180B, file SHA
`09a90264ba4fcf4a702edf6c1cee75fe4074ef19eb5d1367968070c8baccfa69`,
manifest digest `718c16ca68208ce03380e4f5feeed6b07b52b6d0399fcf2c61087422f2eb4e49`.
4,136 current entities /100 batches /7 revisions /1,808 observations;
entity-row SHA `73409d3baa2c02e3d9fbb221b86d9802bab57686d3864c74069d310847077279`.
Full metadata hashes are in the two private manifests and restored receipt.
No mirror range, cache, lease, flight, live upstream continuation/cursor rows
imported. Source/import time is never promoted to freshness.

## T02 — Authority and custody

The named **in-process operator provisioning API**, restricted to local/dev,
resolves the active immutable Core owner anchor. It creates exactly one review
workspace/OWNER membership for Bobby and one product audit event. No copied
source users, bootstrap, reset password, activation/session/grant/role change.
Existing nonmember `claude-preview` still receives404 in the source workspace;
its preview auto-login is not a blanket authority grant. UDB-03 owns normal
review access and screen workspace propagation.

Original user/credential/activation/anchor/binding/grant rows and original
workspace membership hashes unchanged. Research112 runs/jobs/producers,
37 seals,4 RC packs,2 publications and migration ledger hashes unchanged.
All19,035 preexisting session rows retain original SHA
`76f89e2f99d48922e5c6b8e0ead6b4981677e6b4509886a6291e580622d1ec9b`.
The12 ordinary test sessions created through AuthService are all **REVOKED**;
none are left active. No temporary account created.

Final live HTTP14-case receipt includes fleet206 with50-row page/cursor,
Paper bindings139/detail, Sandbox35, Live typed empty0, Portfolio2, wrong
workspace/nonmember/missing binding/wrong profile404, bad environment400,
anonymous401 and Research Library on Core200. Limited domain role denied
fact UPDATE42501 and identity SELECT42P01.

## T03/T04 — Tests, restart, restore and rollback

- Real disposable PostgreSQL **38/38** across isolated-store, local authority,
  Command Center, health and Manager-list suites. Covers exact decimal/UTC,
  run-ID/file/schema tamper, wrong Core target, provisioning negatives, real
  independent connection/queue budgets and domain DI versus Core AuthService.
- Config source assertions7/7, shell syntax, actual Control API image build
  and final readiness pass. Public OpenAPI/generated types are unchanged.
- Execution DB stopped/started while API/Core remained running; Core DB
  restarted while API/Execution remained running. Other DB/API PIDs unchanged,
  custody/ledger unchanged and named BFF readback PASS after each restart.
  Python intake/worker paused only during the quiet Core restart window.
- Final custom-format domain backup restored into a private disposable PG,
  with exact image BFF against restored domain + original Core. Both immutable
  import receipts and **all10 table hashes/counts** verified with runtime
  SELECT permission;13 actual BFF cases PASS. Mirror history remains0.
- Actual rollback to the reconstructed parent baseline, readiness/custody
  verified, then idempotent reapply. Both volumes and all Research artifacts
  retained; no down migration/delete/overwrite.

Final image: `sha256:75e972a8f903c63b1ed79dce6eebbf57d80021484f5d414632b9b54092487325`.
Independent-restart receipt image: `sha256:0dccf26bab1f74f0fd12598064cfd3699d2ff9156a4023063847995208b17dd2`;
final delta adds only current-entity transfer, not pool/Auth/reader logic.
Reuse independent-restart proofs; retake final restore/content/live BFF only.

Final domain backup SHA `0c25be27a8417b11236d3b1c2434b8cf8e9c9f3badc0828c9d2670925949ca18`.
Original Core backup SHA `d9b3876fc7e49dfa8ee0ea175f06c37745897810a3711a5d7f4e8f28ff90a74f`.
Backups, identity manifests and raw actual API bodies are private under
`/home/bobby/.local/state/portal-udb02/`; never added to Git. Primary restart
receipt directory `apply-20261010T105025Z`; final import/live/restore/coverage/
session-custody directory `apply-20261010T110435Z`.

### Historical attempts and permanent corrections

1. New-volume role init encountered password-file mode0600 from umask077.
   Explicit PG-readable password mode under private0700 parent + versioned
   idempotent role bootstrap fixed recovery; no existing password rotation or
   volume deletion. Retain failed attempt104744Z, not a PASS.
2. Gateway validation preceded restored Python DNS. Start order corrected;
   `resume` completes the recorded window without reimport/auth mutation.
3. Old floating image tag had lost its original OCI index reference. Do not
   call a new build that same artifact. Rebuilt exact parent source `4a79429a`
   in a clean detached temporary worktree, producing rollback image
   `sha256:cf6736ab3d9a044151924ac9d85e8f4b80216942d2a897f376bf604341608e38`.
   Original rollback record preserved; replacement pin has separate provenance.
   That image passed actual rollback/reapply. The helper now pins a resolvable
   immutable alias **before** replacing a build tag; rollback checks the image
   before stopping the working API and uses `--pull never`.
4. First normal commit hook rejected old N29/EDS-12 source-input SHA bindings
   after the reviewed pool/config changes. Canonical
   `scripts/refresh-release-integrity-ledgers.sh --write` refreshed only the
   four generated qualification/manifest files in dependency order; semantic
   verdicts, deployed evidence and authority unchanged. The chain check PASS;
   reattempt the normal hook, no bypass or engine/browser retest.

## C4 and remaining boundaries

Owned test/restore containers, network and disposable restore volume are gone;
temporary `/home/bobby/portal-udb02-rollback-source` worktree removed only after
clean-status check. No unrelated container/image/volume/branch cleanup.
Private exports/backups/evidence and exact current/previous rollback aliases
retain30days; live domain volume remains intentionally for review.

Read-only capacity: root180,417,847,296B free (~27%, above20% build stop),
RAM available14,765,490,176B. Docker images87.82GB (73.45GB reclaimable),
build cache191.1GB (61.97GB reclaimable), volumes31.02GB. **Capacity
observation required below30%; no broad pruning**. Any global cache cleanup
is a separate quiet maintenance action after age/ownership/protected-image
inventory. UDB-02 exact teardown complete / NO_ADDITIONAL_PHASE_CLEANUP_NEEDED.
No Actions runner service is loaded on this local host; none restarted.

Idle sampled Docker working set: Execution89.62MiB/512MiB, Core104.5MiB/1.5GiB,
Control82.97MiB. This is a snapshot, **not** a measured load/cgroup peak or P23
5GB/SLO acceptance. Domain tables total92,291,072B (~88MiB); mirror range0.

No known open **UDB-02** implementation debt. Next **UDB-03**, only after
Bobby approval: explicit retained-read mode, unified viewer/resource policy,
per-panel coverage/typed stale absence, Claude rich-screen handoff. UDB-04
owns combined load/browser/release preparation. Neither full-product
availability nor production readiness is inferred from hydration alone.
