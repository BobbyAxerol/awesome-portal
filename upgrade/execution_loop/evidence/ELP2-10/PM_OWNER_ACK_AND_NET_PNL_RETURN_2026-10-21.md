# PM owning return — C4 PM07/target and C5 NET_PNL, 21 October 2026

Status: **ACTUAL_PM_ACK / SOURCE_RULES_RETURNED / WIRE_MAPPING_OPEN**.
Read the complete9164-byte owner return over approved SSH after delivery:

- PM commit `c0095d120e855a17ba53e2523231b4d6566164fa`.
- `/home/bobby/.worktrees/trading-system-pm-v1_1/contracts/baseline/portfolio-account-v1_1/pma11-13-14-16-portal-owner-intake.json`.
- SHA256 `3e29f0395e3b07f885baecf3a0c0057367d3111359de34382af37fe904c8c407`.
- Declared owner `TS_PM`, status
  `ACKNOWLEDGED_SOURCE_DISPOSITION_NOT_RUNTIME_COMMISSIONED`.

PM explicitly acknowledges all three received files: PM07, target01/06 and
NET_PNL. TS03 still needs its own TS return; this PM acknowledgement does not
answer for TS or the separate DL target owner.

## C4 dispositions

PM07/current-recall source already exists; exact installed authenticated
operation/environment/profile/target and human/workload/business/field authority
held through COMMIT remain uncommissioned. Existing qualified runtime/native
lists stay empty. Do not ask Claude to rebuild the source implementation.

Target preparation/harness exists. Physical target/storage/durability/quota,
measured headroom, approved bounds/window/workload/SLO/fault admission are still
required. Existing2CPU/1536MiB correctness approval is not the proposed
3CPU/2560MiB pilot or absolute measurement approval. No measurement launched.

## C5 economic rule returned by PM — not selected by Portal

At the same cut, currency, basis and environment, PM's
`services/portfolio_management/operator_reports_contract.py` (`AccountRow`,
`ReportHeader`, `aggregate_rows`) defines:

1. Equal rows with the same trusted `source_id`: count once.
2. Changed content under that identity: `REPORT_SOURCE_CONFLICT`.
3. Different identities whose economic `leaves` overlap:
   `REPORT_SOURCE_OVERLAP`, not additive merely because fact IDs differ.
4. Only validated disjoint source populations may sum. Missing expected
   sources/valuation proof is PARTIAL, never zero.

Physical-account equality alone proves neither duplication nor disjointness.
PM logical accounts may share a physical pool. Attribution needs original /
effective ownership history, source census, assignment/owner digests and current
read authority; no inferred weights from capital/budget or deployment names.
Cumulative account snapshots are not an event stream to sum across time.

The current compatibility producer computes realized + unrealized + funding −
fees. This is **not** proof of complete interest/other costs, arbitrary Portal
window, Score methodology or commissioned economics export. Preserve native
model/valuation/source revisions, currency/FX and all-time/window semantics.
Original versus restated/corrected output remains explicitly distinct.

PM found **no accepted wire mapping** for Portal's `economic_account_ref` or
`ownership_partition_ref`; neither may be equated to account/deployment/portfolio
by convenience. The required bridge must bind source_id/leaves, mode/venue,
logical/physical scope, currency/basis, effective/recorded/valuation cutoffs,
window/origin/methodology, economic/cashflow/valuation/ownership revisions,
cost layers and correction/original provenance from the selected producer.

## Action for Claude / producer owners

- Claude: use the returned duplicate/conflict/overlap rules for the shared
  reader and series path **only after an explicit selected-producer mapping**.
  Current source identity or equal monetary value alone is insufficient.
  Keep unknown attribution typed unavailable/partial, not fabricated zero,
  silent account-only dedupe or blindly additive distinct fact IDs.
- Edge/PM: return the exact mapping and genuine reconciled producer examples;
  current owner examples14/28/null are explicitly TEST_ONLY. They can guide
  regression fixtures but are never runtime facts or qualification.
- Core: independently review the mapping/implementation when delivered;
  no Portal economic formula/Score weight changes in this intake.

Existing PM test locators are in the pinned JSON. PM ran **zero new report
tests** for this source disposition; no new test count, installed financial
acceptance, command grant or full ELP2-10 closure is claimed. Original Core
785387ba/07becd72 recovery remains exclusively Codex-owned.
