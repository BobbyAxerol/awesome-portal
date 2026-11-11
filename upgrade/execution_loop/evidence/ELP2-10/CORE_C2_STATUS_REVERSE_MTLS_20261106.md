# C2 STATUS reverse mTLS — 2026-11-06

**TEST/SOURCE WIP ONLY.** No production/research listener, credential,
registration or Edge source was installed. This receipt extends the previous
[STATUS successor receipt](CORE_C2_STATUS_SUCCESSOR_NUMERIC_JOURNAL_20261106.md)
and supersedes its point-in-time P7 test-file hash; it is not an ELP2-07/10/11
or connected acceptance receipt. Base commit `2faa8968fddbde59b2e59525e334ba3d83886144`.

## Scope

The P7 disposable-PG test now creates an unbound
`createC2CustodiedCurrentHumanTransport` with the **same** issuer, P7 fence and
independent candidate custody used to mint the synthetic STATUS lease. An
explicitly allocated loopback HTTPS listener and in-memory test CA/leafs then
exercise the reverse route. No TLS private material is persisted or logged.

The test verifies the pinned synthetic source can ENTER, retain/RESOLVE a
COMMITTED proof and retry that same terminal; a different CA-valid leaf is
disconnected before HTTP parsing. In a later test, after P7 owner revocation,
the still-unexpired new ENTER is rejected and its lease remains ISSUED, while
RESOLVE for a different, already-entered original succeeds via the reverse
listener. These are deliberately synthetic source proofs; a Core terminal
response is not proof that an Edge recipient received a STATUS response.

The issuer-side `C2CommandStatusAuthorityAdapter` is used for STATUS issuance
in this test, but this does **not** wire the adapter into
`CommandStatusComposition`, exercise the complete STATUS assertion authority
and authenticated recipient ACK over HTTP, or prove real Edge authority. It
also does not prove qualified independent custody or V2 restore.

## Validation and cleanup

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: initial **4 PASS / 5
  FAIL** when the new negative test incorrectly expected HTTP 403; the server
  correctly resets a foreign certificate before parsing HTTP. Four subsequent
  cases depended on state not created after the first failure. Corrected to
  expect `ECONNRESET` plus the listener's deny counter; final retake after the
  revoke/terminal additions **9/9 PASS**, on two disposable PostgreSQL systems.
  Counts are suite results, not nine independent connected product runs.
- The listener allocated only `127.0.0.1` in the test cell and closed via
  `finally`. The script cleaned its own containers/network; read-only
  `elp2-c2-p7-` prefix checks found none afterwards. The cell is bounded to
  2 CPU / 1.5 GiB; measured peak usage was not captured. `git diff --check`
  passed for tracked changes.
- This is a test-only follow-through; no new full typecheck or normal hook
  was run. Earlier focused strict typecheck does not include this revised test
  file. Do not treat Vitest transpilation as typecheck.

## Pins

| Path under `apps/control-api/` | SHA-256 |
| --- | --- |
| `test/c2-p7-owner-intent-candidate-pg.spec.ts` | `356dd0066c462f63d9841dea998c6fa0e2b486f975162e29b6de4bb7c3d0230a` |
| `src/execution-v2/current-human-transport.ts` | `c5fe3f48eff835bf2bdca071a77488daf93c252fdda1f1c02c5efe3c035518a2` |
| `src/execution-v2/c2-custodied-terminal-candidate.ts` | `e5654b26783350aa16a6e633f6cbd1140ac7603b32dc7299acb4b4a92b20e948` |
| `src/execution-v2/c2-command-status-authority-adapter.ts` | `16401ddd884f7b8a040e400f42f859cfe4c16d1495a21f7b01f16d3cbf569084` |
| `src/execution-v2/current-human-candidate.ts` | `ae41d2874f54fac399585102a847c8235f641b1af66d4367f1eb9d9908eb8c8f` |

## Next action and rollback

Core still must compose the actual STATUS authority and HTTP custody with the
same C2 candidate, P7 fence and independently qualified custody; test recovery
and authenticated delivery ACK on that combined path. Connect only against a
current Edge source and Research authority after qualification. Independent
monotonic restore authority, old-holder fencing, post-snapshot terminal/ACK
reconciliation and final integration/migration gates remain open. Claude has
no new frontend field/action. Before commissioning, rollback is to leave the
candidate unmounted and V2 restore refused; retain existing custody history.
