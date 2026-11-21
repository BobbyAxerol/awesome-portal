# FE-CAT-2: queue health counts and delivery/display axes (2026-10-23)

Level: R0 note. Contract SOURCE_ONLY (additive, optional); control-api, FE and fixture lane FIXTURE_VERIFIED. No real source is connected. Closeout 2026-10-23 section 5 (FE-CAT-2): "additive queue/incident health, pending-receipt/lag/exception counts and delivery/display axes; count at the same authorized snapshot, never derive global counts from one page; missing coverage remains explicit, not zero."

## 1. Decision
The SAME contract is extended additively: `portal.execution.operational-queue.v2` (the FE-042 links and FE-043 status counts already live there). No parallel read. Two optional additions; the L0 fixtures and `OperationalQueueItemV2` (and so the workflow detail, which still rejects the new keys) are unchanged.

## 2. Exact names

### Page: `page.health` (optional object, `additionalProperties: false`)
`{ basis: "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS", pending_receipt_count?, display_lag_count?, open_exception_count? }`; each count is `OperationalHealthCountV2` = `{ count: integer | null, observed_at: timestamp | null, coverage: COMPLETE | PARTIAL | UNKNOWN }`, all three keys required inside it.
- **omitted key** = this producer has no owning source for it (the Portal prints today's "Not published", never 0).
- **`count: null`** = the owning source did not report it (not computable); then `observed_at` is null and `coverage` is UNKNOWN. Never 0.
- **`count: 0`** = a counted zero; it carries `observed_at` and COMPLETE/PARTIAL.
- **`coverage: PARTIAL`** = some authorized filtered rows did not report the axis, so the number is a floor, not a total.
- `observed_at` is when the Portal counted it inside the page snapshot, not a source clock.
- `pending_receipt_count` = authorized filtered rows whose `delivery_state` is `AWAITING_RECEIPT`; `display_lag_count` = rows whose `display_state` is `CATCHING_UP`. Both are therefore <= `filtered_count` and >= the matching rows already on the page (enforced in the zod contract and the FE reader). `open_exception_count` = open exceptions the owning source counts for the same authorized scope (source unnamed, see section 5).

### Row: `page.rows[].delivery_state`, `display_state` (optional, nullable)
- `delivery_state`: `NOT_APPLICABLE | AWAITING_RECEIPT | RECEIPT_CONFIRMED | RECEIPT_FAILED`.
- `display_state`: `CURRENT | CATCHING_UP | STALE`.
- Omitted = no owning source on this producer; `null` = the source did not report the axis for this row. The vocabularies are Portal proposals for Codex/Edge to confirm or replace (closed enums, so a change is a contract change, not a UI edit).

### Incident detail
No field added. The published `portal.execution.incident-current-root.v2` carries no health, receipt, display or exception fact, and `historical_children` is a typed `NOT_PUBLISHED / ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED`. Nothing in a published contract field can fill the Incident detail blocks without inventing an incident fact, so the exact Edge input is in section 5 instead.

## 3. Server rules (control-api, tested in-process, no database)
- Counted by the engine's grouped counts under the minted scope and ALL applied filters (`excludeFilterFields: []`) in the page's own repeatable-read transaction. The loaded rows are used only for their own axes, never to count; a hidden row is outside the scope predicate and so in no count.
- Fail closed: the groups of an axis must add up to exactly `filtered_count` (a count over any other set is refused) and may hold only the closed domain plus `NOT_REPORTED`.
- Published only when a `QueueHealthPlan` names a source. `OperationalReadService.healthPlan` is `undefined`, the production view has no such column, and no migration is added, so today the read is byte-for-byte what it was (asserted: `selectColumns` unchanged, no extra statement).
- The day the view carries them: `delivery_state` / `display_state` as NON-NULL closed-domain view columns, with the extra value `NOT_REPORTED` for "source did not report" (published as JSON null; `groupedCounts` refuses SQL NULL groups by design), declared as resource filters so they are countable; `queueHealthResource(plan)` adds exactly those columns.

## 4. What the Portal does
- Reader: strict; present-but-malformed health or axes void the page; absent stays `undefined`.
- Health strip (layout unchanged): an integer prints exactly as received (a counted 0 is 0; PARTIAL adds "at least: some rows did not report"); `null` prints "Not published (FE-032/FE-031): the source did not report it."; an omitted key keeps the existing gap wording. Nothing is derived from the loaded rows.
- Columns (the six kit columns stay six): Display draws the row's `display_state` as a flag; a null or omitted axis is a typed "Not published (FE-032)" gap (the null case says the source did not report it); delivery is one meta line under Receipt, only when a value exists.

## 5. DELIVERED vs ACCEPTED_FOR_IMPLEMENTATION
DELIVERED (FIXTURE_VERIFIED): schema, openapi, d.ts, new fixture `execution-operational-queue-health.synthetic.valid.json`, zod contract and service plan, FE reader, strip and columns, fixture lane (`e2e/bffDoubleV2.ts`, opt-in `simulated`).

ACCEPTED_FOR_IMPLEMENTATION (owner Edge/Core, then Codex for the view):

| Figure | Exact input needed | Grain | Owning fact | Observation / coverage |
|---|---|---|---|---|
| `delivery_state` per row | non-null view column `delivery_state` on `execution_operation_queue_v2`, value from the closed set or `NOT_REPORTED` | one per queue operation | the venue/Edge command receipt for that operation: receipt received (`RECEIPT_CONFIRMED`), expected and not yet received (`AWAITING_RECEIPT`), refused or lost (`RECEIPT_FAILED`), none expected for a BLOCKED/preview-only operation (`NOT_APPLICABLE`) | Edge receipt time per row (to replace the Portal read time in `observed_at`); a row with no receipt record at all is `NOT_REPORTED`, which makes the count PARTIAL |
| `display_state` per row | non-null view column `display_state` | one per queue operation | whether the figures shown for the operation's target (balances, positions) have caught up with the receipt: `CURRENT`, `CATCHING_UP` (projection behind the receipt), `STALE` (beyond budget). Owner: the projection worker's per-target applied-through sequence against the receipt sequence | the projection's as-of per target; unknown target = `NOT_REPORTED` |
| `pending_receipt_count`, `display_lag_count` | none beyond the two columns: the control-api counts them | whole authorized filtered set | derived from the two columns, never separately stored | PARTIAL when any filtered row is `NOT_REPORTED` |
| `open_exception_count` | a named exception family and a count source, as a `plan.exceptions` callback inside the page snapshot | open exceptions for the authorized scope | NOT NAMED by any published contract today (FE-031: "incident children and exceptions have no subject feed"). Edge must say what an "exception" is (an open reconciliation difference? an unresolved F0 refusal? a failed receipt?) and its target grain before this can be counted | its own source as-of; a source that cannot count returns `{count: null}` and the Portal prints "Not published" |
| Incident detail blocks | not requested as fields: needs the incident's children (annotations, evidence, linked receipts) with their ORIGINAL target attested; `historical_children` stays `NOT_PUBLISHED / ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED` until Edge attests the target at write time | per incident child | incident child tables | per child |

Until those exist the production server publishes no `health` and no axes, and the Portal keeps its four gaps. Confirm or replace the two vocabularies before Edge builds the columns.

## 6. Fixture lane (FIXTURE_LAB, opt-in)
`e2e/bffDoubleV2.ts` (additive, simulate branch only): delivery and display axes restated from each row's own source status; health counted over the filtered set. Cases: pending receipts a positive count (COMPLETE); display lag a counted ZERO (PARTIAL, a floor, while a BLOCKED row's display is null, and exact COMPLETE under `source_status=SUCCEEDED`); open exceptions typed null (UNKNOWN); with simulation off every key is omitted. A BLOCKED row's display is null (not reported).

## 7. Effects before landing
- Pins: a repository search for the old sha256 of the operations schema, openapi, d.ts and generator found them only in `packages/contracts/contracts-snapshot.json` (regenerated, 4 changed lines plus 1 added). The N29 product-acceptance file pins `br72_*` (manager-lists) hashes, not operations, so this slice does NOT need an N29 re-pin; the gate's own table is still the authority and was not run.
- Operations visual baselines for the simulated profiles will differ (Display column now draws flags, strip shows numbers). Not re-recorded.
- `packages/contracts/test/execution-operation-reader.spec.ts` pinned "ten" component types; it is now twelve (`OperationalHealthCountV2`, `OperationalQueueHealthV2`).
