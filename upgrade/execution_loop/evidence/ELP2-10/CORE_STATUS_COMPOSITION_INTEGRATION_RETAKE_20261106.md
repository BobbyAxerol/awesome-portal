# Core STATUS / transport / financial composition retake — 2026-11-06

**PARTIAL WIP INTEGRATION REVIEW.** Not a frozen candidate, normal hook,
installed runtime, owner-authority qualification, source/ACK receipt, V2
restore, connected acceptance, or phase PASS. Checkout is
`docs/research-loop-plan@2faa8968fddb` plus shared uncommitted WIP.

## Review and bounded retake

Reviewed the tracked WIP diffs for `command-source-assertion`, its private
transport, `command-status-composition`, `current-human-transport` and
`financial-source-composition` together with their focused tests. The generic
reverse transport rejects a constructed C2 candidate; STATUS and financial
legacy compositions refuse a supplied C2 delivery-schema configuration.
The separate STATUS HTTP delivery callback is explicitly TEST_ONLY and is not
a production source/field-authority or sole-egress solution. The candidate
P7 issuer remains blocked at bootstrap; no assertion of deploy readiness is
made here. These observations are not a whole-tree review.

One bounded command in `apps/control-api`:

```sh
flock -n /tmp/portal-heavy.lock env NODE_OPTIONS=--max-old-space-size=1536 \
  ./node_modules/.bin/vitest run --maxWorkers=1 --no-file-parallelism \
  test/command-source-assertion.spec.ts test/command-source-assertion-transport.spec.ts \
  test/command-status-composition.spec.ts test/elp210-current-human-transport.spec.ts \
  test/financial-source-composition.spec.ts
```

Result **5 files, 234/234 PASS**, exit 0. Tests use synthetic identities,
test doubles and loopback listeners as specified by the individual suites;
they do not establish real Edge/PM/TS identity, delivery, financial carrier,
ACK, browser or recovery. Test counts overlap older receipts and must not be
added to them. No separate project-wide typecheck, migration, build, normal
hook or product browser run was performed here. Test process exited and its
in-process listeners were test-owned; actual CPU/memory peaks NOT_MEASURED.
No runtime/DB/service, credential, frontend, command/Live or remote changed.

## Direct source and test SHA-256 at retake

The listed files matched before/after the command. This is not a complete
transitive dependency pin or proof that the shared worktree was frozen.

| File under `apps/control-api/` | SHA-256 |
| --- | --- |
| `src/execution-v2/command-source-assertion.ts` | `c8e7e3a1cc0b4859261343245020a3976094cb2410c6bc53e93d9b8754854991` |
| `src/execution-v2/command-source-assertion-transport.ts` | `49a1437529ce6071969f2724ca76c3856266a87d90d19e953206057a827528bc` |
| `src/execution-v2/command-status-composition.ts` | `0dee7ba1fc6489631ebf480add076f62559ba02a2aa9532c75e236498dfc0a6e` |
| `src/execution-v2/current-human-candidate.ts` | `8929d23c4fca6916f0b912a5e583d09c773a299a19ba0e25575227824e34e099` |
| `src/execution-v2/current-human-transport.ts` | `e96bb9f65e56272873acf83fe056f60dda2513859b2688c24b9e4b0002a7d97c` |
| `src/execution-v2/financial-source-composition.ts` | `1584cacf1411d25aea2d8c24083e575261458d9bda67da1a64f3dd5ad80b1ede` |
| `test/command-source-assertion.spec.ts` | `745c6e1c6a0d0f211268eb5951f9b56a84bd6d0a725e266d5c67a0b846e58719` |
| `test/command-source-assertion-transport.spec.ts` | `04301efc1b4b185c85613695ead6ac34198bf7c1b56fc8411ddfc23abe7e63bc` |
| `test/command-status-composition.spec.ts` | `a7f543842f362b2cf7cfbf8c958f877a499c2c41e848ca020c32dbc2a24366f0` |
| `test/elp210-current-human-transport.spec.ts` | `ea4c8320fbc56ede48aff64e6f702d48d08e617e9128911e3f7100a543637083` |
| `test/financial-source-composition.spec.ts` | `725896f31a57cf4aff17900691c1890bcff6317416612fed7e31f2ac980e1f25` |

## Remaining / rollback

Finish actual independent P7 owner-auth/DB-role qualification and sole
custody-protected egress, monotonic independent V2 authority and old-holder
fencing, then reconcile genuine source terminal/ACK via Edge. Complete
whole-WIP review, migration/rollback and normal hook on a frozen candidate;
do not reuse this retake for a changed dependency without impact analysis.
No frontend contract/action. Rollback is to keep the WIP uninstalled and all
existing fail-closed fences in place.
