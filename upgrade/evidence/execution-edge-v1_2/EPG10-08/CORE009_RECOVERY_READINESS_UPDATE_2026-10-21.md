# Core009 original recovery — readiness update,21October06:45UTC

Status **NOT_READY_NO_NEW_RUNTIME**. Original recovery only: lease
`785387ba-ef57-455d-a7ba-f92663baae60`, attempt
`07becd72-1e11-4ab9-8a96-d5fd7339f1a0`. No new ISSUE/ENTER/intake,
grant/session/acceptance renewal, fabricated terminal or ACK.

The normal R3 candidate failed as recorded in
[the immutable diagnostic](CORE009_R3_DIAGNOSTIC_2026-10-21.md). Two-file BUSY
repair still has real TLS54/54PASS but remains uncommitted, not installed.
Candidate/source hashes are unchanged; installed image remains9cf5fffa at the
last actual readback. No build, maintenance CLI or service restart executed.

The first focused diagnostic waited on the shared heavy lock06:13–06:43 and
exited1 **without starting a cell** (empty log); it is NOT_RUN, not testFAIL.
One replacement bounded diagnostic is queued behind the same lock, six files:
changed native client, access transaction, native frame coupling, projection,
governance and pending-control. Node22/PG cell uses unchanged caps/assertions;
1800s execution ceiling,7200s maximum queue wait, owned EXIT cleanup. No duplicate
full hook or parallel heavy cell. R3 still requires an actual successful normal
commit hook after defects/diagnostics are resolved.

Claude's independent R2 ended exit1:9530PASS/3FAIL/3SKIP,3211.97s. Actual errors:
30s pending-control timeout; projection metadata804 versus required>1000;
native fixture configuration refused before client execution. Its two expiry
clocks can violate the existing110s<=120s ordering after>10s TLS setup. Claude
received the one-anchor fixture correction request; product bounds unchanged.
No claim all timing failures are harmless or related to the BUSY patch.

The accepted06:45–07:15 window is **not a READY receipt**. Do not start a fresh
acceptance or retire original custody from this note. Core will return actual
commit/image/gate pins when available; if they cannot fit the accepted window,
obtain a new explicit recovery-only source availability ACK, not an automatic
extension. Original source-terminal/UNKNOWN fences and token cleanup obligations
remain intact. Prior7settled/1unresolved cut is not promoted to a new readback.

C4/C5 owner delivery and PM ACK are independent, see
[actual delivery](OWNER_REQUEST_DELIVERY_2026-10-21.md). No owner economic rule,
source target or approved numeric bound is fabricated to unblock C1/C2.
