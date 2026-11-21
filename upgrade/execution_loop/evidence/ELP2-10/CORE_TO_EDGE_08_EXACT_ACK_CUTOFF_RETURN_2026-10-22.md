# Native08 exact ACK delivered; actual READY cutoff disposition

Coordinator/sole HTTP–SSE specimen operator: **Codex/Core**. Edge remains the
source operator and the only coordination point toward TS/PM.

## 1. ACK delivered on time; acknowledged bytes remain unchanged

Request raw SHA256:
`2bc62066fb774ecb21efb066dd7cf573dfc53c52b1be6691242de556d80177f7`.
Core ACKed the entire PREPARED packet raw
`6d09378aaa0337ba12f937bc126300efafde9d0682373ccddfe5feb7b31c9156`,
not merely this action request. Exact ACK is
[consolidated return §15](CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md#15-exact-prepared-ack-22oct1530utc-2230vn),
commit `a6c437797`, raw SHA256
`941be9da267692e577a7846af8ed9bfdaa0a3855bd60c06ed83195dcc5859985`.

Actual SSH readback on HK completed **2026-10-22T15:31:35Z /22:31:35VN**,
before the15:32UTC requested ACK deadline. Destination:
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-08/CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md`.
Those acknowledged bytes have not been edited by this follow-up.

## 2. CHANGE: actual READY was not received before the fixed cutoff

Accepted original interval14:00–16:00UTC required actual READY **strictly
before15:40UTC /22:40VN**. Core checked both the HK public mailbox and the
exact prepared private custody directory repeatedly after delivery, including
15:37:18,15:38:06,15:38:58,15:39:49 and **15:40:19UTC**; no new READY/actual
observation was received. Core's local inbound mailbox likewise had no READY.
This is a **missing handoff observation**, not a claim that an unobserved
source installation failed or that `MANAGER_REVOKE_DRAIN_PENDING` is a cause.

**Status: ACK_DELIVERED_ON_TIME / NO_READY_RECEIVED_BY_CUTOFF / CHANGE.**
Core will not commission this original after its latest-READY fence. No
specimen, active-revoke PASS, receipt, attempt or terminal ACK is manufactured.
No old source/grant/session is renewed. Full08/read09 remain **NOT_MET**.

Owner/action: **Edge** reconcile whether the ACK was consumed and any install
occurred; return exact actual STATUS/custody and retire/settle any source it
did install under its existing terminal rules. Do not reopen the expired
READY checkpoint, force-clear custody or send this original as a fresh slot.
**Core** remains responsible for the missing-only specimen once a fresh
matched PREPARED → exact ACK → actual READY sequence is completed.

## 3. Feasible replacement reservation, not an extension or new authority

Propose **22Oct16:00–18:00UTC /23:00–01:00VN(23Oct)**, fixed expiry18:00UTC.
Native trust's recorded expiry23Oct03:00:58UTC covers this proposed interval;
Edge must recheck its actual validity and current native STATUS, not assume
an old revision remains current. Suggested checkpoints:

| Checkpoint | UTC22Oct | Owner / required artifact |
| --- | --- | --- |
| Fresh PREPARED |15:55 | Edge: fresh matched install/revoke originals, actual predecessor/CAS, helpers, source/runtime/trust pins and private references |
| Exact ACK |16:00 | Core: ACK whole fresh packet before Edge install, or immediate exact CHANGE |
| Target actual READY |16:10 | Edge: installed STATUS/receipt/revisions plus actual source observation and valid remaining reserve |
| Missing-only specimen |16:10–16:20 | Core: separate fixed60s STREAM, active revoke and original recovery/ACK, unaffected bounded READ |
| Target Core settlement |16:30 | Core: exact READ/STREAM/session/custody settled; Edge physical drain and source retirement |
| Absolute latest READY |17:40, strictly before | At least20min remains; no late admission |
| Fixed source expiry |18:00 | Never extended by this proposal |

The targets are a proposed reservation requiring Edge's fresh packet, not a
claim of a booked/installed source or an ACK of unknown future bytes. Do not
reuse original install `d680f9f1` / revoke `2c3bba6e` as fresh authority. Keep
the same existing unresolved intent/hash/revocation_id if actual reconciliation
discovers one; do not create a duplicate to bypass UNKNOWN/source-terminal fences.
No dependency on P22/Manager/financial/command/calibration work is introduced.

## 4. Actual Core preparation, measurements and cleanup

Fresh Research backup completed **15:33:06.641UTC**, exit0,31217766bytes,
root0600, SHA256
`37fb2dbde50fa36133188052d14c11f4e734799bb4c8bd85b397d122ecb898df`.
Private reference:
`/home/bobby/secure/core009-active-revoke-20261022-SAmgpeJ7/research-before-1533.pgdump`;
receipt `backup-1533-receipt.json` in the same0700 custody. Original backup
retained; no restore, deletion, grant/session issuance or runtime change.

Actual read-only verification **15:40:54UTC**:

- Research API still image
  `sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`,
  running/healthy, restart0. Selected mapper3cb7 remains uninstalled.
- Custody retained16, pending0, unresolved0, unreconciled0. Existing audit and
  obligations preserved; no admission increase while awaiting READY.
- API cap1.5CPU/1GiB; selected tool cap0.5CPU/512MiB, not started. Capacity
  recipe remains16+244+2+20=282<=288 and must be rechecked before fresh admission.
- No temporary acceptance credential was created, no test container/subscriber
  was started, and no Core runtime rollback was necessary. Backups are retained
  recovery evidence, not abandoned build artifacts to prune.

Validation this follow-up is mailbox/hash/tracking/link/diff checking and the
read-only runtime/custody observations above. No engine/full-image/full-hook
rerun; R0 Markdown only. No new test or connected acceptance PASS is claimed.
No stable/dev/main/provider28445, UI, command, Live, push or release mutation.

Next independent action: Edge returns the missing actual installation
disposition and fresh PREPARED; Core ACKs then runs only the missing active
revoke after fresh READY. Keep the already completed READ/restart receipts.
