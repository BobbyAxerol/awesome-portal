# Core → Edge C2 checkpoint — 07:00 UTC, 2026-11-05

Prepared before the checkpoint. **A2 NOT_READY; B2 NOT_SIGNED; V2 recovery
NOT_READY.** No runtime candidate, source grant or connected acceptance was
installed. This is a progress checkpoint, **not an A2 delivery ETA**. C-P3-1…4
and R-P5-1…5 are acknowledged individually in
`CORE_C2_BLOCK_NEW_RECOVERY_PROGRESS_20261105.md` (SHA256
`a858d85868a39a28d8d6b7e360f58b6d2d07e0077d447d836c7c7bd97b1c643f`).

| Item | Status, owner and next action |
| --- | --- |
| P1/P2 | **Core NOT_READY**: one-key issuer/JWKS and exact-byte request binding are prepared; current source issuer SHA256 `52ffd2330a2ba13318a50120dbcf201cf557848ebb92d156028d128470864599`. Disposable PG **13/13** includes revoke between issue and revalidation and expiry while checking the fence. This revalidation does not hold authority through HTTP delivery. Core must qualify issuer composition, source registration, authenticated issuance/delivery and runtime image/config pins. |
| P3/P4 | **Core NOT_READY connected**: selected P3/recovery regression **8 passed, 102 deselected**; source-only reverse TLS candidate and public certificate material exist. Core must commission exact mTLS listener and registered source; source-only tests are not actual source ENTER/RESOLVE or ACK. |
| P5 | **Core NOT_READY**: global revision is accepted for Paper by TS. Source-only fail-closed capture exists, but truthful reason provenance, before/at-change announcement, recipient ACK and N+1 republication are not commissioned. Unknown reason and overflow remain fenced; no fabricated reason or reopening. |
| P6/P7 | **Core NOT_READY**: Bobby approved READ + HISTORY for exactly `paper-portfolio-g1` and `paper-root-g1`. Owner/workspace observation and that decision do not create an authenticated P7 record. Unmounted Research-only review/confirmation candidate is default-off; **15/15** focused synthetic tests include Nest/Fastify session/CSRF tests and Ed25519 codec with real public B1 bytes. P7 source verifier, safe ACL, authenticated owner/step-up, real acceptance and binding remain to be commissioned. |
| P8/B2 | **Core NOT_READY / NOT_SIGNED**: TS source-level `C2_SEALED` is observed, but Bobby requires genuine A2 acceptance before signing B2. Signer ownership, current P7, the release fence and original signature receipt remain unqualified; Core cannot honestly commit to one-hour delivery yet. |
| Recovery | **Core NOT_READY**: local 18-table mutation fence PG **2/2** and restored-session quarantine PG **1/1** are isolated preparations only. A stale no-op may still hold locks; public identity/policy/grants, old DB clone/process and in-flight network are not fully fenced. Independent checkpoint, complete post-snapshot original/terminal/ACK coverage and cutover remain open. |
| Delivery custody | **Core NOT_READY**: an unmounted bounded local obligation candidate, no bearer storage and no invented ACK, passed disposable PG **3/3**, SQL SHA256 `7d8fe7c04950ab35f59e212a4197566155c527f9c789d250ff5bb917a50b6862`. The new three-table schema is **not covered** by the earlier 18-table fence. Sender/HTTP custody, authorized original binding, cross-process cancellation, recipient ACK and recovery remain to be implemented and qualified. |

TS's RESOLVE ACK confirms Core received a source terminal; it does not prove
that the intended recipient received Core's ISSUE response. Core will not
permit a replacement merely from terminal, expiry or local socket completion.
Edge remains the sole TS counterpart for the original-bound recipient delivery
protocol and authoritative post-snapshot coverage; Core's preparations do not
depend on receiving a fabricated acknowledgement.

All PG results are from separate disposable cells that cleaned their own
containers/networks. The first 10/11 owner test failure and the failed
quarantine attempt before its ACL correction are recorded as failures, not
included in passing counts. No normal final hook, commit, push, runtime mount,
production/dev/main/stable change, credential, Live or command activation
occurred. No reliable A2 delivery deadline can yet be supplied; the next Core
progress checkpoint is **07:30 UTC** unless a substantive item is ready sooner.
