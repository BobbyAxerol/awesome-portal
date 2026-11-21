# Core009 R3 diagnostic — 21 October 2026, 06:14 UTC

Status: **FAILED / INTERRUPTED; NOT COMMITTED OR INSTALLED**. This supersedes
the earlier “normal hook running” note, not the genuine focused 54/54 receipt.

The normal hook on candidate `734353113d8bec85f78b35ab81c9c1a40e93a67e`
plus the two-file transport-close repair passed contracts (1147/1147) and API
compilation, but its real-PG API run reported seven failed cases in four files:

| File | Failed cases |
| --- | --- |
| `elp2-access-transaction.spec.ts` | Current actor/session missing, queued submit + receipt replay |
| `elp210-native-frame-coupled.spec.ts` | Lost source ACK; two Manager people `FAIL_BEFORE_SECOND_RELEASE`; `LOOKUP_FAILURE` |
| `profile-projection.spec.ts` | Real60s fan-out; full-depth lineage drain |
| `governance.spec.ts` | 182k Approval Inbox |

The complete API suite was not finished. At06:13 the operator interrupted only
the verified Vitest process in the owned disposable cell. Git returned1; no
commit was created, no hook was bypassed. Its EXIT trap removed node
`fc84357e5db27fc5ea86f12ec51e6272d5c62e5e66171e6cd6dbd5ad9c1c097c`, PG
`b74ead8576ab06c3ded5c2a9bb5dd991ec765a53303b3e1cbeac169f50f742f7`, their
private network `control-api-test-net-3878042` and `/tmp/tmp.B5PRlAPW46`.
Actual absence was checked. Other agents' cells and all installed services
were preserved.

Log: `/home/bobby/.local/state/portal-execution-elp210/20261021/core009-integration/recovery-normal-hook.log`;
SHA256 `5fba76868648da964f3dbdd8301cb557dd05bb8b2e54f5ac69bf3ccdb50722ef`.
The interrupted log has no final assertion stacks: timings alone do not prove
load flakiness or a transport regression. In particular the intentional
Manager lookup failure happens before native HTTP; this is a diagnostic lead,
not a waived gate. A peer heavy test was also active; no causal claim yet.

One focused retake of these four files plus the changed transport spec is
queued through `/tmp/portal-heavy.lock`, using the existing bounded Node22/PG
script, unchanged deadlines and assertions. No full-hook retry has been started.
Receipt: `recovery-failed-gates-focused.log` in the same private state directory.
Waiting or partial results are not PASS. Fix actual defects before another
normal R3 commit. No source changes were made to Claude-owned tests/modules.

## Operational consequence

Core still runs image9cf5fffa; no new build, CLI recovery, service restart or
install was performed. Eight original native admissions remain seven settled /
one original unresolved at the latest correlated cut. The06:45–07:15 Edge
recovery-only ACK is conditional on a genuinely qualified repair. If readiness
does not fit, request a new explicit source availability window; never extend
grant/session/intake or pretend the old window was used. Expired temporary
credential cleanup still requires official original-custody recovery.

C4 owner requests, C5 NET_PNL ownership and Claude UI/source review continue
independently. This test failure does not revoke or duplicate those assignments.
