# FE-CAT-4 / DEBT-UXM07-052: figures and counts on the bindings list (2026-10-23)

Level: R0 note, contract SOURCE_ONLY (additive, optional), FE and fixture lane FIXTURE_VERIFIED. Nothing here connects a real source. Approved by the Codex closeout of 2026-10-23, section 5 (FE-CAT-4 / DEBT-052). Replaces the capped two-read fallback for every row whose producer publishes the figures; the fallback stays for rows without them.

## 1. Decision in one paragraph
`execution.bindings-list.v1` gets two OPTIONAL additions and nothing else changes: `BindingItem.figures` (native equity, virtual used, virtual headroom per currency; sleeve count) and an envelope-level `counts` (per-environment, all, issues). Existing producers, the L0 fixture `execution-bindings-list.valid.json` and every old reader are untouched: an old body is still valid, and a new body is still readable by a tolerant old reader. The control-api maps the figures only when the projection row carries them; today it does not (no column, no migration), so it publishes nothing. The Accounts list uses the figures when a row has them and reads the two carriers only for rows without them.

## 2. Exact names

### Row: `BindingItem.figures` (optional object, `additionalProperties: false`)
Each property is optional and nullable. **Omitted** = this producer has no owning source for the figure (the reader then reads the row's carriers). **`null`** = the owning source did not report it (typed absence; no fallback, never 0). A value is only ever a published value; zero is a published `"0"` or `0`.

| Property | Type | Meaning |
|---|---|---|
| `native_equity` | `BindingAmountFigure[1..8] \| null` | The venue's NATIVE equity of the account behind the binding. Never the wallet balance (a different figure, Account 360 prints both). |
| `virtual_used` | `BindingAmountFigure[1..8] \| null` | Sum of the binding's virtual allocations in use, one entry per currency. |
| `virtual_headroom` | `BindingAmountFigure[1..8] \| null` | The source's headroom (may be negative), one entry per currency. |
| `sleeve_count` | `BindingSleeveFigure \| null` | Sleeves on the binding. |

`BindingAmountFigure` = `{ currency, value, observed_at, coverage }`, all required. `value` is an exact decimal string (`^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`, at most 128 characters; no exponent, no float, no thousands separator). One currency per entry; entries of one array have distinct currencies (the schema cannot say it; the control-api and the Portal reader reject or null a duplicate, never merge). A mixed-currency binding is several entries, never a sum or a conversion.
`BindingSleeveFigure` = `{ count (integer >= 0), observed_at, coverage }`.
`coverage` reuses the published `Completeness` vocabulary: `COMPLETE | PARTIAL | UNKNOWN` (how much of the owning population the figure covers; `PARTIAL` for a binding whose published sleeves are fewer than expected).
`observed_at` = the instant the OWNING source observed the figure (not the projection refresh).

### Envelope: `BindingsResponse.counts` (optional)
`{ basis: "AUTHORIZED_SNAPSHOT", observed_at, coverage, all?, issues?, by_environment?: { paper?, sandbox?, live? } }`; every count is an integer >= 0 or `null`.
- `by_environment.<env>`: authorized bindings of that environment. `all`: the sum, `null` unless every environment is countable. `issues`: authorized bindings, across all environments, whose state or credential state the owning facts call wrong (Portal rule: state in SUSPENDED/DISABLED/INACTIVE/REVOKED/ERROR, or credential in STALE/DEGRADED/FAILED/ERROR/REVOKED/EXPIRED/INVALID/MISMATCH); `null` when any binding's words do not decide it.
- `null` = not computable from owning facts. `0` = counted zero. Omitted = the producer computes none.
- Computed from the SAME authorized snapshots as the page, authorization first (section 4). A read is still one environment; the counts of the other environments come from their own authorized snapshots.

## 3. What the Portal does
- Reader (`profileRead.ts`): reads `figures` and `counts`; a malformed figure or count rejects the row/the read (fails closed, same as the file's other readers); unknown keys inside `figures`/`counts` are ignored and never promoted (a `wallet_balance` key is dropped); the four published keys are read.
- Row facts (`model.ts listFactsFromFigures`): a row has list facts only when all four keys are present (value or `null`); a half-published row is read per row, never shown half and half. One line per currency (currencies with native equity first, then alphabetical); a line holds only its own currency; the check compares virtual with physical per currency, exact integer decimal comparison, no float.
- Accounts list: rows with list facts cost no read; `useRowFacts` receives only the rows without them and its cap (20) counts those rows alone. A mixed-currency row stacks one line per currency inside the same cell (layout and columns unchanged); `Partial coverage` is printed when a figure's coverage is not COMPLETE. The cap footnote is the old sentence when no row is published and says "does not publish ... such rows" otherwise.
- Tab strip: the selected tab keeps the count of the read; the other tabs show the published `by_environment` count; `null` or an absent count prints nothing (never 0, never invented). The all-environment `issues` count appears only in the Issues control's title; the visible Issues count stays "loaded rows".
- The Portal never derives or displays a count of a hidden row: it prints only published numbers or the length of rows the server returned.

## 4. Authorization, null vs zero, pagination (server rules, tested in-process)
- Order: rows and fields are authorized BEFORE counts, aggregation and cache. `bindingCounts` filters rows through `authorize` first and never calls the issue classifier on a hidden row; a hidden row contributes to no count, no issue and no headroom.
- Null vs zero: an environment without a snapshot is `null`, not 0; `all`/`issues` are `null` unless every environment is countable (a partial sum would read as a total); an undecidable issue makes the issue count `null`, not an under-count; no snapshot observation instant means no `counts` at all.
- Pagination is unchanged: the figures ride on rows, sort fields and cursors are the same (`updated_at`, `venue`, `state`, `binding_id`), so a cursor stays on its exact snapshot. The cursor, `total_count` and `filtered_count` are the page's own.
- Not touched: the scoped V2 path (`portal.execution.manager-scoped.v1`) has its own contract and is not changed here.

## 5. DELIVERED vs ACCEPTED_FOR_IMPLEMENTATION

DELIVERED (FIXTURE_VERIFIED, no real source):
- schema, generated type, snapshot pin, new synthetic fixture `execution-bindings-list.figures.synthetic.valid.json` (L0 fixture byte-for-byte unchanged);
- control-api `binding-figures.ts` (`mapBindingFigures`, `bindingCounts`) and `mapBindingRow` wired into `bindingsResource` (published only when the projection row carries `list_figures`);
- Portal reader, row facts, Accounts list, tab counts;
- fixture lane (`e2e/bffSimulated.ts`, populated profile, opt-in): see section 7.

ACCEPTED_FOR_IMPLEMENTATION (owner: Edge/Core, then Codex for the projection):
- the projection input below. Until it exists the control-api publishes no `figures` and no `counts`, the Portal keeps the fallback, and DEBT-UXM07-052 stays OPEN (downgraded to "contract and consumer delivered; source input pending"). `listRowFacts` and the cap are deleted only when every producer publishes the figures.
- the control-api wiring of `bindingCounts` (it needs the other environments' authorized binding snapshots and an issue classifier over the owning state/credential words; the function and its rules are delivered and tested, the call is not wired because today's service keeps one environment per refresh).

### The exact input Edge must supply
Grain: one object per BINDING (the venue API-key/credential container), per environment, inside the binding projection refresh (`execution_binding_projection`), as ONE jsonb column `list_figures` (additive migration owned by Codex; the control-api's `BindingRow.list_figures?: unknown` and `mapBindingRow` already read it, `selectColumns` gets the column on that day).

| Figure | Field | Owning fact (source) | Currency rule | Observation time | Coverage |
|---|---|---|---|---|---|
| native equity | `native_equity[]` | the venue's native equity of the account behind the binding: `broker_account_sync_effective.native_equity` (the newest broker report). NOT `wallet_balance`. | the broker row's currency; one entry per currency the venue reports; `null` when the venue did not report equity | `synced_at` of that broker report | `COMPLETE`, or `PARTIAL` when the report covers part of the binding's accounts |
| virtual used | `virtual_used[]` | binding exposure bucket `used` (the sum of the binding's virtual allocations) | the bucket's currency; one entry per bucket; never converted or summed across buckets | the bucket's `newest_source_as_of` | the exposure `population_completeness` (`PARTIAL` when `account_count < expected_account_count`) |
| virtual headroom | `virtual_headroom[]` | the same bucket's published `headroom` (the source's number; the Portal does not compute it) | as above | as above | as above |
| sleeve count | `sleeve_count` | exposure `expected_account_count` (else `account_count`) | none | exposure `newest_source_as_of` | `PARTIAL` when only part of the expected sleeves is published |

Rules for the producer: omit a figure key if the family is not qualified (no owning source); write `null` when the source answered "not reported"; never write 0 for an absent figure; never put a wallet balance in `native_equity`; all four keys present (value or null) is what lets the Portal skip the per-row reads for that row. Counts: computed in the control-api over the authorized binding snapshots of each environment (not stored by Edge).

## 6. Tests run (this slice)
See the final report of the slice for exact commands and pass counts; the files are `packages/contracts/test/execution-bindings-list-figures.spec.ts`, `apps/control-api/test/binding-figures.spec.ts`, `apps/portal/frontend/src/execution/api/bindingFigures.test.ts`, `.../screens/account/listFigures.test.tsx`, `.../fixtureBff/bindingsListSimulated.test.ts`. The old N+1 fallback tests (`account.test.tsx`, `rowFactsCache.test.tsx`) are unchanged and stay green.

## 7. Fixture lane (FIXTURE_LAB, opt-in `simulated`/`reviewManager`)
`e2e/bffSimulated.ts` adds an overlay for `GET /broker-bindings` on the populated profile:
- `bnc_main@BINANCE`: native equity 414,010.40 USDT, a different figure from the 412,880.25 wallet balance on the account resource (unequal case); virtual used and headroom in USDC and USDT (mixed-currency case); 3 sleeves, coverage PARTIAL.
- `bnc_sub@BINANCE`: `native_equity: null` while the account reports a wallet balance of 118,050.00 (absent-equity case).
- `okx_main@OKX`, every non-live and every generated binding: no `figures` (they keep the capped fallback).
- `counts`: the double's own bindings by environment (native five plus the scale lane's generated ones); every count equals the length of that environment's served list, so a hidden row cannot be counted (hidden-row case; the authorization rule itself is tested in the control-api).
The L0 fixtures are not edited.

## 8. Effects to know before landing
- The N29 product-acceptance pin (`services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/product-acceptance.v1.json`, key `br72_schema_sha256`) pins the old `execution-manager-lists.v1.schema.json` hash. It must be re-pinned from the gate's table (then EDS-12, which pins N29), not by hand. Not done in this slice (no full hook).
- The populated-profile Accounts visual baselines will differ for the live list (two rows now carry published figures, one row a second currency line, tab counts). They were not re-recorded here.
- `contracts-snapshot.json`: exactly two hash lines changed (schema, d.ts) and one added (the new fixture); `tooling/snapshot.py` TRACKED gained the new fixture.
