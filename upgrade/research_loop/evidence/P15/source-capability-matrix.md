# P15 source-capability matrix

This matrix is the source-as-is disposition for the original P15 test IDs. It
does not convert a missing optimizer fact into an implementation skip or a
passing generic claim.

| Test | Current P04/P10/P14 fact | P15-A proof / disposition |
|---|---|---|
| P15-T01 | one persisted request may declare a mode/schedule; P04 executes fixed qualification only | `DECLARED_NOT_EXECUTED`; five executable modes/schedules are `SOURCE_CAPABILITY_BLOCKED` |
| P15-T02 | no best/selected/centroid/trial identity | `selected_trial_ref=null` and `FIXED_PARAMETER_PROFILE`; no raw-best fallback exists |
| P15-T03 | no objective metric | source absence is typed; no score defaults to zero |
| P15-T04 | no constraint/sampler evidence | typed study absence; no inferred formal constraint |
| P15-T05 | no duplicate/prune events | typed study absence; no reclassification possible |
| P15-T06 | no study/trial identifiers | no ledger/collision lookup is exposed |
| P15-T07 | no trial relation or total count | ledger is `NOT_APPLICABLE` with all total/sample/page fields null |
| P15-T08 | no sampler/seed/warm-start/baseline trace | each is individually typed source absence |
| P15-T09 | generated BFF is ready; Screen-06 is Claude-owned | browser/HIFI receipt pending frontend owner |
| P15-T10 | no inspectable trial/pick or frozen selection artifact | no product pick/freeze/jump field is published; server cannot mutate selection |
| P15-T11 | no centroid/selected candidate/trial | null selected ref, no fake trial ID/jump |
| P15-T12 | no population/feasible/pruned/duplicate totals | no totals are emitted, preventing false reconciliation |
| P15-T13 | no raw diagnostic data | all diagnostics are typed `NOT_APPLICABLE`, never arbitrary numeric encoding |
| P15-T14 | fixed declared range/bundle is real; dynamic bound/widen/DR-02 trace is not | exact static range shown only after digest match; generic widening remains source/phase blocked |

The P15 service/controller/openapi/unit/fresh-PostgreSQL tests prove the P15-A
responses above. A future source contract can advance these rows only by
publishing immutable study/trial/evaluation/selection/diagnostics facts and a
new versioned reader; it may not change the meaning of P04 historical receipts.
