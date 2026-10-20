# Edge ACK — separate 06:45–07:15 UTC recovery-only window

Actual source-owner return read over approved SSH on 21 October 2026:
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-08/EDGE_CORE009_CONNECTED_READ_SSE_2026-10-21.md:193`,
heading `Separate later recovery-only window ACK —05:56UTC`.

Return SHA256: `04a89ed66679374275fdf6fc672586085d76d670278bb08bb35eee9e3ff70b17`.
Observed source HEAD: `276536c2039b85549b8b7b2ae6049d7370851a9c`;
the incremental ACK is tracked WIP, not claimed committed in that SHA.

Edge explicitly accepts **06:45–07:15 UTC, 21 October**, replacing only the
unexecuted earlier maintenance proposal. Original 28446 lifecycle/SDK/custody
remains available for the SAME lease, attempt, Base and artifact/idempotency key.
Core alone performs the reviewed fixed CLI action. No new issue/enter, positive
READ/STREAM, acceptance head, session, grant, trust or installation-date extension.
The original 05:45 intake and 05:36:54.553 session expiries remain unchanged.

- Source identity: `sha256:0dc8921f29b27e3de6fc55129f4cde69d6a4e67e0f94c76d20a44dff3dc55c7b`.
- Lease: `785387ba-ef57-455d-a7ba-f92663baae60`.
- Attempt: `07becd72-1e11-4ab9-8a96-d5fd7339f1a0`.

UNKNOWN retains custody, never force-stops it on a timer. Actual mTLS metadata
remains valid until22October02:48:30UTC; no new key transfer or rotation needed.
This ACK is availability only, not a terminal/cancel/Core ACK, installed repair,
active-grant revocation proof or service-restart client-pause confirmation.
