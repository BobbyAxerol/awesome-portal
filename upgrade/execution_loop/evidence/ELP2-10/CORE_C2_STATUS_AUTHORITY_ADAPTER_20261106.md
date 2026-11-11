# C2 STATUS authority adapter — 2026-11-06

**UNMOUNTED SOURCE/TEST WIP.** No new runtime, source, P7 acceptance, Edge
ACK, command or Live operation was commissioned. This is not an ELP2-07,
ELP2-10 or ELP2-11 completion receipt. Base commit
`2faa8968fddbde59b2e59525e334ba3d83886144`; the shared WIP is not frozen.

## Candidate and boundaries

The STATUS authority now forwards a private copy of the exact PM request
bytes and complete context link through its issuance, revalidation and
restart recovery seams. An unmounted adapter connects those seams to the C2
P7/custody candidate. It requires the exact candidate instance, C2-configured
source workload, selected owner/workspace, Paper scope, request digest and
context link. The existing issuer remains responsible for the P7, custody,
current-session and database checks. P7 READ/HISTORY does not grant a command
permission. No source terminal, recipient ACK or trading action is fabricated.

This is **not wired into `CommandStatusComposition`** or an HTTP delivery
custody path. The authority/mock suite and the two-PG adapter suite below
exercise the two ends separately; they do not prove a combined listener or a
connected end-to-end flow. The existing generic C2 signer and bootstrap fences
remain closed. C2 same-request issuance is still conservatively refused even
after an authenticated terminal/ACK; repeated STATUS polling is not claimed.
An ambiguous custody append now marks the in-memory context for recovery and
retains the issuance quota; the next request must rejoin the committed lease
through the authenticated source and durable link rather than use the cached
failed promise or mint another lease; a missing link fails closed instead of
falling back to the pre-lease creation path. The new same-process case is currently
verified with synthetic ports, not the combined PostgreSQL/mTLS path. A real
Edge original/terminal/ACK,
full V2 restore fencing and independent authority are still required.

## Validation and cleanup

- `npx vitest run test/command-source-assertion.spec.ts --maxWorkers=1
  --no-file-parallelism`: final **78/78 PASS**. Synthetic unit coverage checks
  exact request bytes/context passed to issuance, revalidation and restart,
  and the existing negative and ACK paths. The first attempted invocation used
  unsupported `--minWorkers` and did not run tests. The first full run had two
  failures because the synthetic DB mock did not model the newer locked census;
  a subsequent run had one restored-preparation mock failure. The final run
  passed after correcting the mock. The new same-process recovery test first
  failed because its synthetic persisted row omitted `request_digest`; the
  corrected final retake passed. Those failures are not counted as passes.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, including
  positive adapter issue/resume/revalidate, wrong workspace/body, same-lease
  restart, ambiguous custody and revoke, on two disposable PostgreSQL clusters
  with synthetic identities. A sandboxed first attempt could not run `sudo`;
  the authorized isolated retake completed exit 0. The script declares a
  maximum 2 CPU / 1.5 GiB; peak resource consumption was not measured.
- Selected strict TypeScript check of the authority, adapter, imports and
  authority unit test completed exit 0 with a 768 MiB Node heap cap. This is
  not the full build, project typecheck or normal hook. `git diff --check`
  passed for tracked changes.
- Read-only exact-prefix Docker checks showed no remaining `elp2-c2-p7-`
  test containers or networks. No unrelated resources were removed.

## Exact source pins

| Path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/command-source-assertion.ts` | `a6ac5e5236d0a720c8e8040ec13664bd6e1dc296040b3fcd296707ca7b7c2386` |
| `apps/control-api/src/execution-v2/c2-command-status-authority-adapter.ts` | `16401ddd884f7b8a040e400f42f859cfe4c16d1495a21f7b01f16d3cbf569084` |
| `apps/control-api/src/execution-v2/c2-custodied-issuer-candidate.ts` | `76371fc8a040f0fc8ce3b8573ab350c3a55ede5cd64338f7a8d02093fbbc4fc1` |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `184b6ebc2c9b44c924d70f7fd294e70d44517e0f44562a0792635385d8147b8c` |
| `apps/control-api/test/command-source-assertion.spec.ts` | `4a065d6b759282b29153f6fb5605aa6db4fe204cd36fbc1b60c483aa17f499be` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `d9e57623e2832c912244f3b8cf80e0ebb20da64dea2837fe4eb912ffe9bef8e1` |

## Next action and rollback

Core: verify same-process ambiguity recovery on the combined real-PostgreSQL
composition and implement source-terminal/ACK-backed successor semantics;
compose the exact adapter with the real authority and
HTTP custody under the existing off-by-default and commissioning fences, then
test the combined flow, restart and negative paths. Keep the genuine Edge
original/ACK and source qualification as distinct acceptance gates. Review
the shared WIP before freezing a candidate and running the normal hook. Claude
has no new frontend field or action. Before installation, rollback is to leave
this candidate unmounted; preserve all existing custody and authority records.
