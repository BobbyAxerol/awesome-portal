# UXM-07 — Consumer receipt: BE-P14 (RV-12 canonical scoped fixtures), 2026-10-20

Writer: Claude (FE writer, consumer side). Consumer receipt per Rules §10.12.4 for the producer delivery
[BE-P14](../BE-CLAUDE-2026-10-20/BE-P14.md) (`453c572a`, `645687c8`, ledger). This is the consumer's record, **not an ACK of Bobby** (§10.3).
`FRONTEND_BACKEND_SYNC.md` and `UNIFIED_IMPLEMENTATION_PLAN.md` are **not edited here**.

## 0. Pin and lane

| Item | Value |
| --- | --- |
| Base | `claude/fe-parity` @ `19164986`; commits below on a private worktree branch, none pushed, none ff-merged |
| Contract artifacts read | `execution-manager-scoped.v1.schema.json` (`ManagerScopedResponse`), fixtures `execution-manager-scoped.{scenarios.synthetic.valid,bounded.synthetic.valid,refusals.synthetic.negative}.json`; the producer's row key `resourceKey` (`apps/control-api/src/manager-lists/scoped-manager.reader.ts:24`) |
| Lane | **FIXTURE_LAB** (canonical bodies, schema as oracle). The pager's port is a scripted fake; nothing here fetches, polls or opens a route. No `REAL_READ_*` |
| Tier | **R1 only, R2 pending** (§10.10): focused vitest + `tsc`. No Docker, no visual suite, no full hook |
| Files owned | `v2/screens/slice/**` only. The scoped reader lives there (`scopedRead.ts`), not in `v2/readers/`; `readers/scopedRealtime.ts` is untouched. L0 digests of the three new fixtures verified unchanged at the end of each suite |

## 1. Verdicts (published vs consumed)

| # | Published (BE-P14) | Consumed | Verdict |
| --- | --- | --- | --- |
| 1 | Scenarios: 7 scenarios / 9 pages, the answer of the real reader | `scopedRead.scenarios.conformance.test.ts` validates all 9 against the schema and reads all 9; the four surfaces (ALPHA_FLEET, PORTFOLIOS, BINDINGS, BINDING_DETAIL) are each read | **ACCEPTED** after the SS-4 fix (row 2) |
| 2 | Finding: SS-4 collides two BINDINGS items of one environment | Reproduced red first (test "two bindings of one environment are two rows" failed on `19164986`; so did the bindings page in the scenario sweep). Fix: `ROW_IDENTITY` per dataset, environment always part of it: ALPHA_FLEET = alpha + version + portfolio; PORTFOLIOS = portfolio; BINDINGS and BINDING_DETAIL = binding. These are the fields of the producer's `resourceKey` that the dataset carries. The TRUE identity twice is still refused for every kind; a `binding_id` does not make two ALPHA_FLEET rows distinct | **ACCEPTED** (commit `7262becd`). Real FE reader defect, fixed on the consumer side; no producer change |
| 3 | Bounded: 100 of 101, `has_more`, one item with 200 totals | Reads in < 3 s; 100 rows and the 200-total item whole; screen label "Showing 100 of 101" (server's `returned_count` of `visible_count`, authorized rows, never a global count); the 200 currencies all render, none truncated | **ACCEPTED** |
| 4 | 20 schema mutations | All 20 applied to the researcher page: each refused by the reader; 17 `SCHEMA_AND_PRODUCER` also fail the schema; the 3 `PRODUCER_ONLY` pass the schema and are refused by the reader's own rules (SS-2 for has-more and returned-count; **new SS-7** for `no-dispositions`). Reader-looser-than-schema = 0 | **ACCEPTED**. See row 8 for the schema gap |
| 5 | 15 runtime refusals (status + code) | NEW `scopedRefusal.ts#readScopedRefusal(status, body)`: the pair `(status, error.code)` decides, never `message`; the table holds exactly the 9 pairs the fixture proves; unknown pair or non-envelope = `null` (fail closed). Typed outcomes: `cursor_reset` (400 x3, action `restart_chain`), `access_changed` (409, `refetch_scope`), `authority_unavailable` (503), `not_available` (404 and 400: one outcome on purpose, a hidden field is not an oracle), `policy_pending` (403), `field_policy_pending` (503) | **ACCEPTED** |
| 6 | Cursor chain (`fleet-owner-paper-chain`, 3 pages) | NEW `scopedPager.ts`: single flight (presses while a read is open are ignored and counted), cursors opaque (held in the closure, handed to the port unchanged, absent from the state), one page kept, changed query = new chain (stale answer dropped), 400 cursor codes restart from page 1 once, 409 refetches the scope once, other refusals clear the rows; a page of another workspace/surface/environment is unreadable | **ACCEPTED** as a module. **PARTIAL** UI: the slice has no live port and no route, so no pager control is rendered (it would be invented UI). Wiring is owed to the first real read |
| 7 | Leakage canary, dispositions, shared balance, null/"0"/absent | Slice DOM tests (`slice.scenarios.test.tsx`): the researcher page holds none of A3 / P3 / D3 / version A3 / Cirrus / `20000.000000000000000001` / B2 in the view model or the rendered HTML; chips say Denied / Unavailable with a short typed reason (Policy pending, Not recorded, Not granted, Authority unavailable), an unknown reason prints its code; no DISCONNECTED/REVOKED word; the shared account total appears once, on B2, and portfolio / alpha rows carry no balance field or column at all; a published `"0"` is a value, an explicit null is an absence **with its currency**, an unstated currency has no cell | **ACCEPTED** |
| 8 | Schema looser than the producer in three recorded places (`no-dispositions`, `has-more-without-cursor`, `returned-count-above-items`) | Consumer enforces all three itself (SS-7, SS-2) | **CHANGES_REQUESTED (contract decision, Codex/Bobby)**: add `minItems: 1` to `profile_dispositions` and state the two page cross-field rules so a non-FE consumer cannot read what the producer would refuse |

Open questions for the lead (not blockers):
- The producer states the single-owner account balance (X1) on the P1 item and the A1 item `financial_totals`, and the shared account (XS) on the binding only. The slice shows **no** balance on portfolio or alpha rows by choice (a balance is a fact of the binding). If the product wants the single-owner balance on those rows, that is a screen decision; the reader already carries it.
- `is_full_resource: true` on the researcher's own alphas is shown nowhere; it must not be read as "balance complete" (BE-P14 finding).

## 2. Commits (in order)

1. `7262becd` SS-4 per-dataset identity + SS-7 + scenarios / bounded / mutations conformance.
2. `f7f76edb` typed refusals + single-flight pager (+ their tests).
3. `2d8d4f95` slice: PORTFOLIOS and BINDINGS panels, disposition chips, "Showing N of M", currency kept on an absent figure; DOM tests.
4. this receipt (docs, R0).

## 3. Stricter than the schema, named (all in `scopedRead.ts`)

SS-1 totals keyed by currency · SS-2 page counts and `has_more` vs `next_cursor` · SS-3 display-safe text · SS-4 a row once by its dataset identity (rewritten) · SS-5 at most 10,000 instances · SS-6 negative zero · **SS-7 at least one disposition (new)**. The existing L3 "refused schema-valid payloads" group stays pinned by name.

## 4. Gates run (R1)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit -p .` | exit 0 |
| `vitest run src/execution/v2/readers src/execution/v2/screens/slice src/fixtureBff` + `disabledReason`, `absentValues`, `failClosed`, `v2Hygiene` | 53 files passed, 1 skipped, 65,255 tests passed, 5 expected-fail (pre-existing), no failure |
| New suites | `scopedRead.scenarios.conformance` (42), `scopedRefusal.conformance` (19), `scopedPager.test` (17), `slice.scenarios.test` (12): 90 tests |
| Full hook, visual suite, Docker, build flag on/off | **NOT_RUN** (R2 owed at landing) |

L0 digests: the three RV-12 fixtures and the original `execution-manager-scoped.synthetic` are byte-identical at the end of every suite. No contract file, `FRONTEND_BACKEND_SYNC.md` or `UNIFIED_IMPLEMENTATION_PLAN.md` was edited.
