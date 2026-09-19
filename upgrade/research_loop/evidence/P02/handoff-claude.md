# Claude handoff — P01/P02 review lane

Codex has completed the P02 backend/contract portion and incorporated Claude's
P01/P02 review findings as a **contract/spec amendment**. This remains
`CONTRACT_FIXTURE` work, not a completed browser/product phase.

## You may review / implement later

- S02 New Run typed fixture consumption from
  `requested-spec.v1.schema.json` / `requested-spec.v1.d.ts`; do not manually
  invent an alternate field map. The adjacent `requested-spec-field-map.v1.json`
  maps the 24 P01 source controls to canonical payload paths.
- S11 Release Candidate typed fixture consumption with the shared
  `denied`/`unavailable` semantics in
  `release-v1.1/docs/RESEARCH_SCREEN_STATE_SEMANTICS_V1.md`.
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
  input for P10 after P03 identity/auth work. Dynamic manifest keys/options
  are P04 authority; never hardcode a future engine response from this type.
- Do not claim holdout/promotion actions exist. Their explicit typed owner gaps
  are DR01/DR03.

The P01/P02 review itself is complete. P10/P21/P22 must retain a separate
implementation/review receipt: type availability is not a browser acceptance.
