# Core integrated qualification — fixture repair, 25Oct2026

## Scope and preservation

Bobby assigned continuing ELP2-10 qualification and real-source acceptance.
The normal integration gate is frozen separately at
`59a2c1c68e4359bfaf46e79234fad51650861616`, staged tree
`8b72407410b177014dc1298b7272068b609b6905`. Its source/index are not changed
while it runs. Its failed tests are not labelled load flakes or a green gate.

Repair workspace: `/home/bobby/portal-core-provider-assembly-20261025`, branch
`chore/core-provider-assembly-20261025`, parent
`f9b816cd5d4e8417e89d2e554ac6ebd89f913b13`. The affected test files have identical
parent bytes in the frozen integration candidate. This repair is test-only;
no production guard, API, UI, baseline, grant, original, custody or runtime
configuration is relaxed. Rollback: revert the repair commit, never business
data. No push/shared-preview/stable/dev/main/provider28445 or SUBMIT/Live change.

## Source-backed findings and changes

| Finding | Exact repair | Safety boundary retained |
| --- | --- | --- |
| Six ordinary `ExecutionAccessService` doubles omit the new method used at final scoped delivery | Add explicit `hasNativeCurrentRelations: () => false` in `current-view-authority`, `current-view-composition`, `elp2-analytics-reads`, `elp2-retained-metadata`, `elp2-command-center-context`, and `elp2-manager-scoped-world.harness` | Real native-current service keeps mandatory physical-egress fences. No optional-chain/default-false production bypass; native-specific fixtures are not mechanically converted. |
| Two STATUS suites read contracts using the checkout layout at collection time | `command-source-assertion` and `edge-command-status-transport` use `PORTAL_CONTRACTS_DIR` with the original repository-relative fallback | The official cell mounts `/contracts:ro` and explicitly sets that variable. Fixture content and contracts do not change. |
| Ordinary-policy intake mock predates same-intent settled-drain recovery | Add a no-op TEST_ONLY `recoverSettledRootDrain` method; assert recovery and subsequent `QUALIFY` verifier call before the expected source refusal | The real coordinator still recovers the original drain before qualification. The mock creates no receipt, grant, intent or source acceptance. |
| Old `main.ts` boot harness does not isolate the newly introduced optional runtime modules | Explicitly mock their absent selection/preparation ports, assert no optional preparation, and check the unchanged identity of dependency members rather than the outer merged object | The actual `main.ts`, schema requirements, shared pool, owner, cleanup and private runtime validation remain unchanged. Dedicated composition/runtime tests still own those validations. |

The changes are ten test paths, `+64/-16`; no production-source file is modified.
Independent read-only review accepted the nine-path `+20/-9` cut and diagnosed
the additional main-bootstrap failure; the primary reviewed its isolated
`+44/-7` harness repair. Authorize-only and empty native-specific mocks are intentionally
unchanged, rather than hiding native behavior with a blanket replacement.

## Verification ledger

| Gate | Actual disposition |
| --- | --- |
| Ten changed TypeScript files parsed/transpiled with repository TypeScript | PASS, syntax only; not runtime tests. One earlier subprocess-based enumerator was sandbox-refused; the explicit ten-path check passed without escalation. |
| `git diff --check` | PASS before focused execution |
| Normal R2 on the frozen integration candidate | FAIL: contracts1,887/build PASS; full API11,081PASS/67FAIL/8SKIP across554files. API restore NOT_RUN after failure; original log retained, not relabelled PASS. |
| Focused repaired specs through official disposable PG/build/restore runner | PASS: 10 files /158 tests; production build and actual PostgreSQL dump/restore plus identity/session/command/custody preservation PASS. Ran only after the existing heavy gate terminated and cleaned its cells. |
| Required compare-only pinned visual | NOT_RUN; no baseline re-record authorized |
| Real-source/runtime commissioning | NOT_PROVEN by this repair |

Focused retake after the existing gate terminates:

```text
test/current-view-authority.spec.ts
test/current-view-composition.spec.ts
test/elp2-analytics-reads.spec.ts
test/elp2-retained-metadata.spec.ts
test/elp2-command-center-context.spec.ts
test/elp2-manager-scoped-fixtures.spec.ts
test/command-source-assertion.spec.ts
test/edge-command-status-transport.spec.ts
test/ordinary-policy-intake.spec.ts
test/elp210-core009-main-boot.spec.ts
```

The harness is exercised by `elp2-manager-scoped-fixtures.spec.ts`; it is not
passed to the runner as a spec. One bounded official command owned its disposable
PG, production build and restore/preservation checks. The retake started at
2026-10-25 14:05:36 UTC; Vitest duration34.77s. The official runner returned0.
Private log: `/home/bobby/.local/state/portal-integrations/20261025/core-fixture-focused-20261025.log`,
SHA256 `75e445654023e7d57d74912a9674e20cac751795cdb88af577e59a62e05434cd`.
The exact owned node/PostgreSQL cells with suffix202610251405256 were absent
on the post-run read-only census; no broad cleanup was used. A denied request
to stop the earlier failing cell was not retried or bypassed; that gate finished
unchanged before this retake. No heavy tests overlapped.

Code commit `c8e4ac08f` contains only the ten test paths, `+64/-16`.
Verification: focused intermediate under campaign §10.10c; `--no-verify` avoids
duplicating the full landing gate here. This Markdown-only receipt uses R0,
diff/path checks, and does not turn the failed frozen R2 into PASS.

## Handoff and next actions

- **Codex:** focused retake and owned code commit complete. Integrate the reviewed repair without losing
  Claude history. Normal R2 plus required visual remain landing conditions;
  a focused PASS alone is not canonical landing or connected acceptance.
- **Claude:** no generated type, fixture payload, enum, component or design
  changes required by this test repair. Do not repeat the heavy integration
  gate. Consumer work continues from its existing qualified contract cut.
- **Edge/PM:** separate registered-provider runtime/source originals, independent
  rights/trust, financial APPLIED-to-ACK and command STATUS commissioning remain
  required. These fixture fixes do not manufacture any of those inputs.
- **Phase status:** ELP2-05/06/07/09/10 remain incomplete; ELP2-11 is not entry-ready.
