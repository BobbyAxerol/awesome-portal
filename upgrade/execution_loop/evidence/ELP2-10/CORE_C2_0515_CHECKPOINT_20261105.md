# Core → Edge C2 checkpoint — 2026-11-05 05:15 UTC

This is a progress checkpoint, sent ahead of 05:15 UTC, not an A2 bundle or an
acceptance request. It supplements [source and test pins](CORE_C2_PREPARATION_FOLLOWTHROUGH_20261105.md).
Core checkout `docs/research-loop-plan` base `2faa8968fddbde59b2e59525e334ba3d83886144`
has uncommitted candidate work; no new candidate is installed. The latest Edge
worktree observation is source `636d58a7c4368a617903734ab1d0ce933d2804ca`, with
existing tracked and untracked peer work preserved.

| Item | Status and owner | Evidence / next action |
|---|---|---|
| A1/B1 bytes | READY for preparation, Core | Independent B1 input pin and source checks in the linked follow-through; not an authority acceptance. |
| P1/P2 and O-1 | NOT_READY, Core | Existing transport and issuer are source candidates; production-path digest binding and actual issuer/JWKS installation still require implementation, gate and runtime verification. |
| P3/P4 and O-4 | NOT_READY, Core | mTLS candidate exists, but no C2 listener/client certificate/source registration is installed or verified. The currently running Research Control API image is `sha256:d65e77860860dbf24fa5bbf6ded8bc6225b063ebc15578ed6a2dd8d1e92132f8`; a disposable network-none/read-only 0.25 CPU/64 MiB cell using this image reports `/usr/bin/openssl` `ENOENT`. Host verifier tests cannot establish image support. The first probe failed due to the diagnostic script dereferencing absent stdout; the corrected probe exited 0 and explicitly reported `ENOENT`. Neither probe changes preview. |
| P5/P6 and O-2 | NOT_READY, Core | Confirm protected-owner identity mapping, real Paper workspace and workload against current authority; global revision remains conservative until TS confirms its source semantics. Do not equate the TS principal UUID with a Portal identity without an actual binding. |
| P7/O-3 acceptance | NOT_READY, Core | No genuine accepted delegation record has been established; build/use a real accepted record, do not derive one from delivered B1 or fixture. |
| P8 signer and B2 | NOT_READY, Core | P8 signer custody/authority and durable one-shot signing are not commissioned. B2 remains unsigned; `C2_SEALED`, A2 acceptance and approved exact scope are required. Delivery within one hour after seal cannot currently be promised. |
| P3/P5 source contract | NOT_READY, Edge/TS | Edge has already relayed Bobby's same-original terminal and global-revision disposition; actual TS acceptance is still needed. Core does not ask again for A1/B1 or assert TS agreement. |
| Recovery V2 | NOT_READY, Core; source facts via Edge/TS | Local drain, exact-original terminal verification and inventory tests are preparation only. Independent current checkpoint, old-holder fencing, source terminal and ACK-after-snapshot reconciliation, and a real fenced restore drill remain. Legacy V2 refusal is retained. |

Focused suite **32/32** and a disposable PostgreSQL recovery retake **1/1**
(111 unrelated tests skipped) are described in the linked follow-through. A
second isolated PostgreSQL retake also verified UNKNOWN remains fenced through
construction of a new service instance before exact-original resolution; it is
not a separate-process restore/cutover proof. Focused TypeScript passed with the
repository decorator flags; the earlier ad-hoc command without those flags
failed and is not counted as a pass. The isolated cell's containers/network
were removed. An earlier local mTLS **19/19** used test-only trust, not an
installed A2 listener. No full hook, deploy, signing, Live, dev/main or push.

Core continues the independent implementation lanes; timing of a complete A2
or B2 is not yet knowable. Edge's next source-owned action is to relay TS's
actual P3/P5 decision and, when available, `C2_SEALED`; no request to resend
already received A1/B1.
