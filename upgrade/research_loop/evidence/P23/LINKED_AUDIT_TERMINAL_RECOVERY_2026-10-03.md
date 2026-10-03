# P23 — linked-audit terminal routing and real-candidate checkpoint

2026-10-03 · Codex · **CORRECTION_TESTED / RUNTIME_RECOVERY_PENDING**.

## Candidate and actual result

The normal hook passed 267 canonical contract tests and 1,879 Control tests
with one named skip. The complete implementation landed by safe rebase/FF as
`576a32fe`, preserving every Claude FE commit through `a9ff796a`. Only owned
`portal-research-p23-ol12` (:8096) was built/started, with original volumes,
existing QA credentials and forward migration 094. No remote/production/
protected source/shared :8095 worker was changed.

The intended parent `rrun_c3bc2113431102c1715a9d6d28d7b2bf` actually has
`REUSED_ORIGINAL`: 13 generation-child MATCHes, optimizer_reinvoked=false.
The first harness correctly refused before admission. Its failure receipt
SHA-256 is `db6283b0a7d80eb70c71c439ddcae6f07f3a1dea04d1741c950fb4482ac74035`.
Inventory: 82 ready retained Delta parents; the three without frozen Reports
are what-if diagnostics, not a non-reusable primary-run example. No bytes,
proof or seal were removed to manufacture one.

A separately labelled **reusable-parent boundary-only** attempt exercised
actual API admission/idempotent replay and allocated exactly one child:
`rrun_5a999cbd16d1cc3dd06a816494ae7b68`. Native evaluation and P05 artifact/proof
ACK succeeded. The journal persisted run_completed sequence 26, CPU 8 seconds,
peak RSS 330,129,408 bytes. Control nevertheless stayed RUNNING because the
terminal callback incorrectly entered the P04 Report sidecar. That is a real
wiring bug: recover its journal, not manual READY or another engine run.
Failure receipt SHA-256:
`ce3f25b26974670e600803f1f0ae756e512020853504c0d009cffac8d48d34be`.
Even a recovered boundary-only PASS cannot close the non-reusable requirement.

## Correction and gates

- Skip both fixed/current-source child Report materialization for the exact
  pinned-audit profile, keeping normal sidecar no-ops and P06 checkpoint order.
  Proof remains additive on the parent Report/RC/Lineage.
- Use its actual 120-second CPU cap, not the P04 45-second cap. Refuse P04
  evidence/split sidecars before event persistence.
- Enforce the already published/private import filename limit of 128 in Zod;
  its old regex admitted 131. Invalid input is 400, not a valid upstream-502
  proof. Existing OpenAPI/types are unchanged.

Focused regressions **25/25 PASS**; compile and the grouped normal hook gate
the correction commit. Then rebuild only Control API and recover the exact
child from its journal, without rerunning native evaluation. The missing NATS
terminal-notification stream is non-authoritative; logs remain evidence.

## Remaining full goal / C4

Non-reusable source example; current-candidate JSON-502/restored-browser and
image/bundle proof; three original missing manifests (83/86, strict false) or
explicit scope disposition; genuine second qualified engine; P24/release.
P22 GET runtime already accepted, not retaken. Failed child/original+restore
volumes/artifacts/backups/rollback images retained; no pruning or QA reset.
At teardown revoke only the new QA sessions and stop only this owned cell.
