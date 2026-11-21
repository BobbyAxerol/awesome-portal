# Final-audit relationship

P02 observes the current relationship only:

1. The facade receives a current `202` plus `run_id` and writes a queued
   local read model.
2. Existing RunSync updates that model only after a terminal detail and a
   summary with claims plus selected parameters are available.
3. Governance checks that same workspace-scoped model and pins its selected
   artifact before R1 creation.

There is no invented “final audit” endpoint, no client-issued evidence hash,
and no inference from an optimistic UI state. The existing R1 evidence record
is therefore the final audit relationship P02 may exercise. Future Research
run/attempt/audit models belong to P03/P05/P06/P10.
