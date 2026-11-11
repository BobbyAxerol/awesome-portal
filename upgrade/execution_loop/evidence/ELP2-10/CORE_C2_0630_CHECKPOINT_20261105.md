# Core → Edge C2 checkpoint — 06:30 UTC, 2026-11-05

Prepared before the checkpoint. **A2 NOT_READY; B2 NOT_SIGNED; V2 recovery
NOT_READY.** Source-only results are not installed runtime or connected proof.
Next Core progress checkpoint: **07:00 UTC**, not an A2 delivery ETA.

| Work | Status, evidence and next action |
| --- | --- |
| P1/P3/P4 | JWKS, Research trust and public P8 candidate pins were sent in earlier returns. Client certificate matches TS CSR and has more than 120 days remaining. Core must still build/install a reviewed candidate, register qualified source/workload, verify issuer and real TLS listener. No listener or A2 has been activated. |
| P5 | TS accepted fail-closed global revision for C2 Paper. Current candidate blocks new admissions when an event lacks its genuine reason while permitting revoke; isolated PG **4/4**. This is not a complete before/at-change announcement, recipient ACK or operational resolution. The exact updated pin and limits are in `CORE_C2_P5_FENCE_AND_ORIGINAL_RECOVERY_20261105.md`. |
| P6/P7 | Bobby approved READ + HISTORY for exactly `paper-portfolio-g1` and `paper-root-g1`. Owner/workspace matched in read-only Research inspection, but no active owner session was found. Source-only P7 verifier/transaction candidate now checks owner/session/step-up, registered binding, monotonic revoke and concurrent lock ordering; focused isolated PG **6/6**. It is still `RECORDED_NOT_AUTHORIZED`: the real owner-intent record, trusted verifier/writer ACL and actual authenticated approval are not installed. Core is implementing those independently; TS DB/head is not a prerequisite. |
| P8/B2 | Separate P8 public key prepared, not yet accepted as A2 signer. TS source-level `C2_SEALED` was observed. Per Bobby, sign only after genuine A2 acceptance; no actual signing has occurred. Current custody does not yet prove a release fence across reserve → signature → durable receipt, so no one-hour delivery promise is made. |
| Recovery | Known-original recovery now uses an exact lookup beyond the first 128, with Paper scope and wrong-binding negatives; isolated PG **3/3**. Its result only proves phase/binding comparison, **not source receipt digest or durable ACK**. A local-generation fence on the seven candidate Core custody tables passed synthetic and actual-candidate-schema PG **2/2**. It is not installed, does not fence a cloned/old DB or HTTP/TS and cannot authorize cutover. |

## Core work in progress

1. Complete owner-intent persistence/verifier and the real registration and
   authority path; do not convert the chat scope decision, a fixture, or a
   generic step-up into an authenticated P7 acceptance.
2. Design a monotonic Core C2 `BLOCK_NEW` fence that does not overflow the
   global revision or strand exact-original RESOLVE; classify C2 leases with a
   durable marker rather than inferring them from workspace/workload. Keep
   all candidates unmounted until complete.
3. Qualify externally held checkpoint, old-holder fencing and post-snapshot
   original/terminal/ACK completeness; local generation and Q3's per-lease
   lock alone are insufficient. Preserve the V2 DR refusal.

## Edge/TS contract needed in parallel

Review of public Edge worktrees and TS source/answers found that the TS
`{replayed,phase}` RESOLVE ACK confirms Core received the source terminal; it
does **not** prove the recipient received Core's issue/business response.
Please establish an authenticated, durable recipient delivery/idempotency
receipt bound to the exact original, lease, attempt and response digest, with
restart/UNKNOWN semantics, or confirm another source-authoritative protocol.
Core cannot safely treat terminal, expiry or a byte-identical request as proof
that a new intent may be issued. Edge remains the sole TS counterpart.

For recovery, retain the Q3 request for authoritative original/terminal/ACK
coverage or an independent durable watermark: the bounded source journal
removes resolved rows after ACK and exact-original readback is not a complete
historical enumeration. Do not replace this with fixture data.

No credential, cookie, bearer token or private key is included; no Git push,
stable/dev/main/production, Live command or runtime change occurred.
