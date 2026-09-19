# Claude handoff — P01/P02 review lane

Codex has completed only the backend/contract portion of P02. Please review
P01 and P02 as `CONTRACT_FIXTURE` work, not a completed browser/product phase.

## You may review / implement later

- S02 New Run and S11 Release Candidate typed fixture consumption.
- Raw typed states for `202`, `201`, strict-R1 refusal, identity mismatch,
  reauthentication, and cursor ambiguity.
- URL cursor handling for `pick`, `trade`, `study`, and event sequence without
  treating URL state as a command.
- Visual/detail alignment with the HIFI and relevant screen docs.

## Do not alter in this review

- `apps/control-api/src/facade/**`, Governance contracts, existing Execution
  Loop contracts, runtime manifests, deploy files, production flags, or
  protected QuantBT source.
- Do not call the P02 supplemental envelope a live endpoint. It is producer
  input for P10 after P03 identity/auth work.
- Do not claim holdout/promotion actions exist. Their explicit typed owner gaps
  are DR01/DR03.

When frontend review is complete, add a separate handoff commit/status. P02
overall exit remains `P02-FE_REVIEW_PENDING` until then.
