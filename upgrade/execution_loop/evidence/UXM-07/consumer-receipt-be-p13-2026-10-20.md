# UXM-07 — Consumer receipt: BE-P13 (F0 apply truth, idempotency, typed absences, catalogue alignment), 2026-10-20

Writer: Claude (FE writer, consumer side). Consumer receipt per Rules §10.12.4 for the producer delivery
[BE-P13](../BE-CLAUDE-2026-10-20/BE-P13.md) (`3c653cc6`, `b8792631`, `f7e9343e`, ledger `be089fa4`). This is the consumer's record, **not an ACK of Bobby** (§10.3).
`FRONTEND_BACKEND_SYNC.md` and `UNIFIED_IMPLEMENTATION_PLAN.md` are **not edited here**.

## 0. Pin and lane

| Item | Value |
| --- | --- |
| Base | `claude/fe-parity` @ `be089fa4`; commits below on a private worktree branch, none pushed, none ff-merged |
| Contract artifacts read | `execution-operations.v1.schema.json` (`ExecutionCommandPlan`, `CostImpactAbsence`, `F0ApplyDecision`, `F0ApplyDeniedProblem`, `F0ApplyKeyConflictProblem`, `F0ApplyAttemptLookup`, `CommandCatalogueEntry`, `ServedCommandCatalogue`, `RelayDenied`), `execution-trusted-commands.openapi.json` (`CommandStatus`, `CommandSubmitResult`, `CommandPreview`), fixtures `execution-command-{plan,plan.emergency-close,apply-denied,apply-denied.replayed,apply-key-conflict,apply-attempt.none|found|conflict,catalog,catalog.served}`, `execution-trusted-commands.synthetic` (`submit_first`, `submit_replayed`), `execution-command-currency.synthetic` |
| Lane | **FIXTURE_LAB** (canonical bodies, schema as oracle). The story's fake port is a scripted fake; **nothing here sends, enables or connects a command**. No `REAL_READ_*` |
| Tier | **R1 only, R2 pending** (§10.10): focused vitest + `tsc`. No Docker, no visual suite, no full hook |

## 1. Verdicts (published vs consumed)

| # | Published (BE-P13) | Consumed | Verdict |
| --- | --- | --- | --- |
| 1 | F0 plan `current_primitive` (null or the 5-key N16B object) + `cost_impact`; `CommandPreview.cost_impact` | `readCommandPlanV1` PLAN_KEYS 17 -> 19, `readCommandPreviewV1` requires `cost_impact`; `planImpact(costImpact)` builds the plan view's impact from the field | **ACCEPTED**. Not shown: the primitive has no plan fact row (copy belongs to the screen owner) |
| 2 | F0 apply 409 is the envelope `{error, request_id, details}`; `details` = six RelayDenied fields + `request_key` + `replayed`; key conflict `details` `{request_key, source_request_sent:false}` | NEW `readF0ApplyDeniedV1` / `readF0ApplyKeyConflictV1` / `readF0ApplyAnswerV1`; the story's `classifySubmit` reads them, `DENIED.decision` is the 8-key denial (`replayed` shown as one fact row), the conflict is a dismissible typed `REJECTED` | **ACCEPTED** (V2 story). **CHANGES_REQUESTED on V1**: `commandPlan.ts#readRelayDenial` and `httpApi.applyPlan` still read `source_request_sent` at the top level (V1 untouched by instruction) |
| 3 | `F0ApplyAttemptLookup` NONE / FOUND / CONFLICT | NEW `readF0ApplyAttemptLookupV1`, `lookup.ts#classifyAttemptLookup`, fake-port `lookup({id, requestKey})` | **ACCEPTED** reader + port. **PARTIAL** UI: no control asks "query by key" (the receipt copy for an F0 UNKNOWN says there is nothing to query by; changing it is the screen owner's) |
| 4 | `source_rejection` and `venue_fill` on every `CommandStatus` (typed absences, `quantities` null, no PUBLISHED member) | `readCommandStatusV1` requires both as closed unions and refuses a PUBLISHED member or any quantity; fixtures, collection/workflow statuses (11 embedded) all read | **ACCEPTED**. The server's pairing (rejection NOT_PUBLISHED iff REJECTED; fill NOT_APPLICABLE iff venue NOT_APPLICABLE) is **not** invented as a reader rule (the schema does not say it); a test observes it in every fixture. FacetList's "Fill quantity ...: Not published (FE-032)" is still keyed on the venue word, not on `venue_fill` (changing the condition changes what is shown) |
| 5 | `CommandSubmitResult` = status + `replayed` (capital submit 200 only) | NEW `readCommandSubmitResultV1`; `classifySubmit` decides ACCEPTED/REPLAYED by the bit (the "id already shown" inference and `knownCommandIds` are gone); `readCommandStatusV1` refuses the key | **ACCEPTED** |
| 6 | Served catalogue (`ServedCommandCatalogue`): N16B enum members and extras, `classification` required, no CONNECTED | `readCommandCatalogueV2` reads `execution-command-catalog.served.valid.json` (story lane switched); extract refused by name (`missing_key`); CURRENT_PRIMITIVE_CONFIRMED + N16B reason + five constant extras only together; CONNECTED / `runtime_active` true refused as `sendable_claim`; `capability_state` stays DISABLED | **ACCEPTED**. Known V1 divergence: `adminCatalog.readCommandCatalogue` reads the two N16B words as null (row says "no reason was published"); the story uses the strict reader and shows the N16B reason |
| 7 | Conformance | see §3 | **ACCEPTED** |

No `CHANGES_REQUESTED` against the producer. The one open question for the owner is the V1 `readRelayDenial` path (row 2).

## 2. Commits (in order)

1. `ced5c632` commandOperation reader (tasks 1, 2, 3).
2. `a60bee41` commandCurrency reader (tasks 4, 5).
3. `0e47b143` commandCatalogue reader (task 6) + testkit checker boolean schemas; `f76a65d7` its `runtime_active` in the failClosed form + flag registration.
4. `28cced1c` story wiring: `screens/command` (`model.ts`, `storyData.ts`, `fakePort.ts`, `lookup.ts`, `port.ts`, `catalogueLane.ts`, `useCommandFlow.ts`, one `ReceiptPanel.tsx` row), their tests, and the shared files in §4.
5. this receipt (docs, R0).

## 3. Conformance, with the numbers

| Suite | Tests | What is pinned |
| --- | --- | --- |
| `commandOperation.conformance` | 18,440 | new matrices G (plan primitive x key x cost: 144 states, 4 schema-valid, 3 read, 1 stricter `primitive-identity`), H (apply denied, 1,800 states, 2 read), I (key conflict, 96, 1), J (lookup, 360, 8 schema-valid, 3 read, stricter `lookup-identity` + UTC instants); L3 negatives per body (plan EC 158, denied 202, conflict 99, lookup 199 cases), reader-looser-than-schema = 0 |
| `commandOperation.test` | 31 | fail-closed flags (`source_request_sent`, `retry_allowed`, `replayed`), legacy top-level shape refused, free text dropped, lookup variants |
| `commandCurrency.conformance` | 7,273 | `CommandSubmitResult` oracle, matrix K (typed absences, 9 x 11 x 3 x 3 = 891 states, 36 read), matrix L (replayed, 336 states, 14 read), submit negatives, stored-vs-served contrast |
| `commandCurrency.test` | 95 | no published branch, required keys, `replayed` only on the submit result |
| `commandCatalogue.conformance` | 6,662 | served schema as oracle, matrix N (N16B: 144 states, 10 schema-valid, 5 read; stricter `reason-state`, `primitive-identity`), new named stricter cases, 98 negatives on the N16B branch |
| `commandCatalogue.test` | 19 | extract refused, N16B facts, V1 divergence pinned |
| `screens/command` `model.test` / `storyData.test` | 44 / 22 | wire bodies equal the files on disk, `replayed` bit decides REPLAYED, conflict is dismissible, danger-flag bodies are UNKNOWN |

**Mutation controls** (cheap): in each of the three conformance files a deliberately loose stand-in reader must be caught by the "accepts a schema-invalid payload" counter (>20 / >50 / >100) while the real reader scores 0.

**Oracle fix found on the way**: the testkit checker ignored boolean property schemas, so the N16B `else` branch (`runtime_active: false`, the other four extras `false`) never rejected a stray extra. `testkit/schema.ts` now applies `true`/`false` schemas; a testkit test pins it; all 31 reader/testkit files stay green with the stricter oracle.

## 4. Shared files touched (outside `readers/**` and `screens/command/**`)

| File | Why |
| --- | --- |
| `testkit/schema.ts`, `testkit/testkit.conformance.test.ts` | boolean schemas (above) |
| `src/execution/adminCatalog.fixtures.ts` | `COMMAND_PLAN_FIXTURE` is the generated mirror of `execution-command-plan.valid.json` (compared by `commandPlan.test`); +`current_primitive`, +`cost_impact` |
| `src/fixtureBff/golden/stub-golden.json` | re-recorded with `FIXTURE_BFF_CAPTURE=1` after the plan body grew: exactly the 16 `POST /commands/plans` entries changed (sha256 + 634 -> 735 bytes), nothing else |
| `src/execution/adminCatalog.test.ts` | V1 vocabulary test now pins the one known gap (schema enum = V1 words + `N16B_RUNTIME_ACTIVATION_PENDING`); V1 source untouched |
| `src/execution/failClosed.test.ts` | registers `runtime_active` (dangerous `true`, read with `!== false`) |

## 5. NOT_RUN

Playwright V2 (the story's e2e), visual suite, Docker, the full R2 hook, `scripts/refresh-release-integrity-ledgers.sh`, any real HTTP: not run (R1 only). Contracts workspace checks (`contracts-test.sh`) not run here; no contract file was edited.

## 6. Follow-ups that are not mine

- V1 `readRelayDenial` / `httpApi.applyPlan` read the pre-BE-P13 shape (row 2).
- Screen copy (UI-B): a plan fact for `current_primitive`, a "query by key" control for an F0 UNKNOWN receipt, the FacetList fill note keyed on `venue_fill`.
- The workflow coverage inventory in `execution-workflow-fixtures.mjs` is stale (BE-P13 §6); producer-side.
