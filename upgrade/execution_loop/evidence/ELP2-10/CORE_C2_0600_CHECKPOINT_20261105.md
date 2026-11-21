# Core → Edge C2: 06:00 UTC checkpoint — 2026-11-05

**A2 NOT_READY; B2 NOT_SIGNED; recovery NOT_READY.** This is a progress
checkpoint, not an A2 delivery or a connected acceptance. Core will provide
its next progress checkpoint by **06:30 UTC**; this is not a delivery ETA.
TS `C2_SEALED` is confirmed at source level, not an installed runtime. Per
Bobby's instruction B2 must not be signed until genuine A2 acceptance.

| Item | Current evidence and next owner/action |
| --- | --- |
| P1 issuer/JWKS | Core prepared a separate unmounted key; exact composition JWKS SHA256 `c2be5bf172d2e16b7fdb048431295c7caa67c1e869b94e8ed547eaa7aff35f25`. Core must bind the real issuer/subject and install and verify the endpoint; this is not an A2 pin. |
| P3 transport | Research-only CA/server and TS-CSR client certificates are staged, not installed. Core independently checked the actual client certificate: valid from 2026-11-05 to 2027-05-04, with `openssl x509 -checkend 10368000` passing the 120-day remaining threshold at this checkpoint. An earlier verbal concern incorrectly read this approximately 180-day certificate as 120 days; no replacement was made. Listener/mTLS is not yet proven. |
| P7 owner and scope | Bobby approved READ + HISTORY exclusively for `paper-portfolio-g1` and `paper-root-g1`. Core verified the Research owner/workspace mapping read-only; no active owner session was present. A real current owner session/step-up, Core workload/application registration, qualified verifier and immutable acceptance are still needed. The TS DB/head is not a prerequisite for preparing this acceptance. |
| P8 signer | The dedicated Research public P8 key was prepared and shared; it has not been registered as A2 signer or used to sign B2. Preserve the existing private key and do not treat public preparation as acceptance. |
| P5 revision | The source-only outbox is not installed or qualified. An ACL-specific isolated test found that an existing native-authority trigger needs SELECT on `portal_native_current_read_obligations`; Core is checking actual runtime ACL and rerunning with minimal synthetic test privileges. No production grants were changed. Announcement delivery/ACK and DR fencing remain open. |
| Recovery | Independent-store prototype and original/terminal handling have focused isolated tests, but are not an independently trusted checkpoint, old-holder fence, verified post-snapshot coverage or actual source ACK. Restore/cutover remains blocked. |

## Focused evidence and limits

- A1 public intake: 5/5 isolated checks; a previous combined local run passed
  94/94 across 13 test files. These are source-level tests, not commissioning.
- Pre-ENTER UNKNOWN PostgreSQL tests: 4/4; updated P7 synthetic verifier tests:
  2/2; recovery-original PostgreSQL tests: 2/2, in disposable databases.
- A prior P5 run passed 3/3 as a database owner, but its later least-privilege
  ACL run failed and is **not PASS**. Core is fixing test cleanup and checking
  the actual runtime role before deciding the necessary ACL.
- The manifest formatter validates TS's names/hash structure on synthetic
  input (3/3); it remains `DRAFT_NOT_DELIVERABLE`, with no real A2 written.

Core code and evidence are work in progress, not an installed image, schema,
runtime configuration, authenticated owner acceptance or B2 signature. No
credentials, cookies or private keys are in this return. Edge may inspect the
public candidates already mirrored but must not treat them as an A2 bundle.
