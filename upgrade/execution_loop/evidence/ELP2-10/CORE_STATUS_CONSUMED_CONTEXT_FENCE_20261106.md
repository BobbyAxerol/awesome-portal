# STATUS retained-read context fence — 2026-11-06

**SOURCE WIP / TEST ONLY.** Not an installed gateway, genuine Edge ACK, V2
restore, final integration gate, A2 acceptance, or phase PASS. Worktree
`docs/research-loop-plan@2faa8968fddb` includes shared uncommitted changes.

## Finding and change

The local authority kept its context after `acknowledgeRetainedRead` completed.
In the synthetic unit composition, the same context could subsequently mint a
new STATUS assertion; another issuance could race while consumption was still
waiting. Both new negative tests failed before this change. This does not prove
a production exploit: the durable candidate has separate preparation and
lease guards, and the test source is synthetic.

The authority now takes a local close fence before awaiting retained-read
census/consume; issue and same-context recovery recheck it after asynchronous
operations. An issued context cannot escape after closure, and a failed
consume releases the local fence for a legitimate retry. A completed read can
still prepare a fresh context under the existing durable original/ACK rules.
No terminal, ACK, new intent, grant or source operation is fabricated.

## Checks

- Initial selected regression: 2 failures, demonstrating the unfenced local
  behavior. The assertions printed in test diagnostics were synthetic tokens.
- Source-assertion, source transport and Edge status transport unit suites:
  **167/167 PASS** in an authorized loopback retake. The initial sandbox run
  had 77 loopback `EPERM` failures and 90 passes; it is not the retake.
- After adding the consume-failure regression, source-assertion suite:
  **83/83 PASS**. These tests overlap the first suite and are not additive.
- `bash scripts/test-elp2-restore-inventory-rls.sh status-recovery`:
  **3 PASS / 5 SKIP**, including the real disposable-PG UNKNOWN → terminal →
  ACK sequence and refusal to issue from the old consumed context. Synthetic
  source and loopback mTLS; the other five cases were not run. The script's
  isolated cell configured an aggregate 2 CPU / 1.5 GiB; peaks not measured.
- Focused strict TypeScript for `command-source-assertion.ts`: exit 0;
  tracked `git diff --check` and execution tracking passed. This is not the
  full test-inclusive project typecheck or normal hook.
- The script's own trap cleaned its named disposable containers/network;
  a read-only `elp2-restore` container listing was empty. No shared runtime,
  database, frontend, credential or remote server was changed.

## Selected SHA-256

| File | Hash |
| --- | --- |
| `command-source-assertion.ts` | `c8e7e3a1cc0b4859261343245020a3976094cb2410c6bc53e93d9b8754854991` |
| `command-source-assertion.spec.ts` | `745c6e1c6a0d0f211268eb5951f9b56a84bd6d0a725e266d5c67a0b846e58719` |
| `command-source-assertion-pg.spec.ts` | `58e507ea1e5bf7819897fc19808eeae30031aa54043bac0cd78c58d517fa3958` |
| `test-elp2-restore-inventory-rls.sh` | `012de1838287af5fb1333ad49f48bfec93fcebc4ee5be51b1e4367bc0c9c8d25` |

## Remaining and handoff

This is an in-process fence, not an independent old-holder fence or proof of
durable cross-process closure in all versions. Review the original/lease/ACK
fences and P7/custody composition on the integrated candidate; actual Edge
terminal/ACK, independent recovery authority, restore, qualification and
normal hook remain open. No frontend contract or consumer action changed.
Keep issuer and V2 restore fenced. Rollback is to leave this WIP uninstalled.
