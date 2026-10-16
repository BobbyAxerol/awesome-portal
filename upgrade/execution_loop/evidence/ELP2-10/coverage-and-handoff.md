# ELP2-10 — quality/performance consumer handoff and open ledger

Producer: normal-hook commit containing this packet, parent
`e6620f416e43bc8c18a044339a598c436d8556ba`; `docs/research-loop-plan`.
Code delivery is not runtime qualification or consumer acceptance. No frontend
changes. Claude remains **NOT_STARTED_BY_OWNER_DIRECTION**;
handoff **AWAITING_CONSUMER_REVIEW**.

## Contract and compatibility

All six named ELP2-06 Manager operations/types stay identical. Use
`executionManager{FundOverview,Fleet,Portfolio360,Alpha360,Account360,Deployment360}GetV1`
and `ManagerDataset`/`ManagerMetric` from
`packages/contracts/generated/execution-manager-models.d.ts`, schema
`portal.execution.manager-dataset.v1`. OpenAPI/Zod/generated type byte hashes
are unchanged; generator `--check` verifies no structural change. No new browser
route, query parameter, source cursor, credential or perf configuration input.

| Requirement → consumer | Served semantics / example | Task when assigned / acceptance |
| --- | --- | --- |
|T10-02/14 → Fund/Fleet/360 PnL/return|`value:null`, `availability:UNAVAILABLE`, `reason_code:METHODOLOGY_NOT_PUBLISHED`, original unit/currency/basis/freshness/provenance retained; not0|Short public absence copy, technical detail only as appropriate; don't hide otherwise available capital/balance/fee cards|
|T10-01/09 → capital statement/score|Deposit/withdrawal/budget are separate source facts; source-zero trading PnL remains `"0"`; missing PnL null. Funding-bucket PnL null / LOT_ATTRIBUTION_METHOD_NOT_APPROVED|Never label capital movement profit or invent lot attribution; do not sum ratios or actual/Paper/Sandbox money|
|T10-04/11 → all Manager reads|Current grants/fields and current head still checked for each request. Bounded capacity returns existing sanitized503|Safe bounded manual/retry behavior; no per-card TS reads, source polling, or raw internal error text|
|T10-10/13 → Score/Regime|Raw/composition/direct score remain independent `policy_pending`, Regime unavailable. No numeric preview becomes product value|No calibration constants in FE; not0 score or auto-promotion. Existing06/08 handoffs still apply|
|T10-07 → operator-only consumer|Private holder/epoch/fencing/restore controls, no HTTP DTO|Not a UI form and not browser-supplied inputs. Do not activate from a rendered screen|

Canonical synthetic consumer fixture (not source receipt):
`packages/contracts/fixtures/execution-manager-dataset.rows.synthetic.valid.json`
SHA256 `c4af2ad63d06ea7ed54242bd7cc892dbad5744218545821e3913cc5f591d0c77`.
Same row contains published net-PnL zero and unavailable unrealized-PnL missing
methodology, both in row and its economic partition. Remaining context is
partial/stale and explicitly TEST_ONLY. Fixture must not be product-ingested.
Type hash `3a3958a5677966a0110d91f1c650b9044a0402121a3d78563081121bb814aa8f`.
Existing200-row/1MiB response, exact decimals/UTC ms, scope-bound cursor and
400/401/404/409/503 semantics remain unchanged; detailed mapping in06 handoff.

Additive migration137 is a **server-only** coordination change. Frozen131/135
digests are preserved. Normal-hook real PG tests verify fresh/forward/idempotent
isolated-store ledger, anti-Core-target handling and prior snapshot coupling;
no live DB migration occurred. Do not copy private lease table into Core identity.

## Request/debt ledger

| ID / sender → owner | Locator / observed vs expected / impact | Done-when / delivery / consumer status |
| --- | --- | --- |
|ELP2-REQ-10-001 Codex→Claude|This handoff; UXM-08/10 Manager dependent absence and capacity. Fixture delivered, FE on owner hold|When assigned acknowledge producer SHA/type/fixture, bind null/zero/methodology states, independently measure approved build at1280/660, keyboard/overflow/a11y/context/error/idle fanout. **AWAITING_CONSUMER_REVIEW**, not consumer-complete|
|ELP2-REQ-10-002 Codex→Portal/Edge operations and capacity owner|Manifest per-family42×3 budgets null, source14groups null, source audit§2; no paired B0/B1/B2 or actual shared-host resource/coexistence receipt. Affects full10/11, not independent local backend delivery|Freeze approved numeric/profile/workload/placement envelope and test window after exact source qualification; measure source/BFF/TS/DL/Research and applicable performanceG2. **BLOCKED_BUDGET_AND_SOURCE_EVIDENCE**. No generic source gap duplicated: use05-001/06-002/07-001 below|

Inherited canonical dependencies, **not new duplicate requests**:

- [05 packet](../ELP2-05/coverage-and-handoff.md): ELP2-REQ-05-001 qualified
  source publication/coverage, current-page versus retained/durable authority.
- [06 packet](../ELP2-06/coverage-and-handoff.md): ELP2-REQ-06-002 private
  materializer/recompute commissioning and source/config binding. Optional
  Manager payload exists; not a running governed worker. No production score.
- [07 packet](../ELP2-07/coverage-and-handoff.md): ELP2-REQ-07-001 trusted
  PM/Edge command/status/transport and current commit authority.
- [00 ledger](../ELP2-00/decisions-and-handoff.md): existing00-004 exact runtime
  attestation and00-005 Score implementation/config request; pure calculator
  was delivered06, runtime/calibration acceptance is still separate. Formula/
  weights/bands are already chosen, not reopened. Approved
  horizon anchors/stress/block/grid/maturity and Regime support remain pending.
- [09 packet](../ELP2-09/coverage-and-handoff.md): actual source→browser
  privacy/revocation/continuity/propagation and09-001 consumer acknowledgement.

Independent review C1/C2 (autocommit/TTL-after-lock) **DELIVERED in this commit**,
source reviewer ACCEPTED_AFTER_CHANGE; actual regression test receipt is in the
final normal hook. No unresolved newly observed app bug is reclassified as an
external dependency. No Claude request was received during this backend slice;
writing this prompt does not mean Claude received/accepted it.

## Prompt Bobby can give Claude after assigning frontend

> Read campaign rules, Unified§14/UXM-08/10,06/08/09 handoffs and this complete
> ELP2-10 packet. Acknowledge exact producer commit/type/fixture. Audit/reuse
> accepted components; do not change shared tokens/baselines or financial grain.
> Use generated Manager types; show missing methodology only on dependent
> PnL/return, keep capital/fees independently readable, distinguish null from
> actual zero, preserve profile/currency/freshness/provenance and current scope.
> Use typed sanitized503, never source exceptions or invented polling/SSE.
> Score remains policy_pending until approved source/config; no numeric fixture
> promotion. Design/fixture work can proceed without source activation; real
> API/browser/load acceptance needs qualified source/build/profile. Record
>1280/660/a11y/overflow/URL/back/reload/revoke/idle-request receipt and separate
> fixture/runtime proof. Missing contract goes into this request ledger with
> locator/UI impact/typed semantics/test/done-when. Do not self-activate runtime.

Backend next: only an assigned selected10 operational measurement window once
budget/source/config inputs exist; or separately assigned11 migration/handoff
preparation that does not claim missing10gates. No11 starts automatically.
