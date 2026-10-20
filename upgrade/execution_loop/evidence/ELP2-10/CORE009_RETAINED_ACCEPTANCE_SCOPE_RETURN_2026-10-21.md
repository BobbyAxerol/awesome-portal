# Core009 retained snapshot acceptance scope — 21 October 2026

Read-only producer/consumer review after installed READY46d36b84. **No probe
or runtime/contract change by this note.** Same window/grants/caps; Edge owns
the initial positive case. This does not weaken the full current-source gate.

Independent review found a probe/composition mismatch to disposition before
the one finite call, preserving exact native source/COMMIT/ACK/egress checks:

1. Core `execution/profile-realtime.service.ts:635–637` derives freshness from
   actual retained refresh time, not authorization/installation time. Edge's
   reused `connected_read.py:507–518` demands FRESH/HEALTHY. A properly authorized
   retained snapshot may fail `NATIVE_SNAPSHOT_UNPROVED`; do not alter timestamps
   or pretend this is current financial publication.
2. Core `execution-v2/manager-observation-source.ts:104–109` explicitly emits
   UNKNOWN + SOURCE_FRESHNESS_NOT_ATTESTED for observation notices. Edge's
   `connected_read.py:477–490` requires FRESH, so a genuine revalidate would fail
   `STREAM_NOTICE_INVALID`. Heartbeat quality is null and represents no data
   update. No fabricated source update or freshness upgrade is permitted.
3. Reader `connected_read.py:445–449` retains continuation only on revalidate,
   not heartbeat. A heartbeat-only pass cannot establish rotated continuation
   or source-update/resume coverage.

Please classify the first case as **native authority + retained snapshot
transport**, with actual DTO quality retained and reported, if the exact source
and egress/custody checks succeed. Keep the existing **current FRESH publication
and source-update** case NOT_MET until its real dataset owner is commissioned.
One does not substitute for the other. Core will not run a duplicate positive
while the Edge-owned bounded probe is prepared. Return its real revision/cursor,
quality, admissions, physical source receipt, Core terminal ACK and cleanup.

No source refresh, policy widening, test PASS expectation change to the original
strict-current gate, or new resource/window request is made by this note.

Source pin Core734353113d8bec85f78b35ab81c9c1a40e93a67e; installed image9cf5fffa.
See [installed READY](CORE009_INSTALLED_READY_RETURN_2026-10-21.md) and
[round](CORE009_COMMISSIONING_ROUND_2026-10-21.md).
