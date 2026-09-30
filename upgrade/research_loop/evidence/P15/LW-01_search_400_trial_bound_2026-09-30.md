# LW-01 — bounded Search response for preview 400-trial WFO

The 400-trial preview profile already admits at most 400 retained TRIAL rows and
64 CANDIDATE rows. Its diagnostic probe counts objective terms from both
relations. The Search response schema still capped `objective_rows` and
`objective_rows_recomposed` at 128, so an otherwise valid seal became a typed
503 even for a one-row ledger page.

The only changed ceiling is the derived probe bound, `400 + 64 = 464`, in Zod
and OpenAPI. The seal remains 64 trials in normal deployments and 400 only
under the existing dev/local preview flag. Candidates remain capped at 64;
ledger pages remain 200 rows; the whole response remains capped at 1 MiB.
No source mutation, profile expansion, or frontend change is included.

Focused receipt: `research-preview-long-wfo.spec.ts` 11/11, including a
canonical response with 400 surface points, a 200-row ledger, 464 probe rows,
OpenAPI/Zod parity, sub-1-MiB size, and refusal at 465. The real preview API
receipt is still required before marking LW-01 closed; this test establishes
contract acceptance, not that the currently deployed image has changed.

Real isolated-preview API receipt (2026-09-30, commit d5c4e1f3; Control API
image sha256:faf48410ae94faa24a2e836350bcedccebf027f2d7fc114ac218d6aec38e9450):
R-WFO-020, run rrun_3258a4c450816129d2d285f25b801061, returned HTTP 200,
trial_count=400 and probe.objective_rows=439. Two limit=200 keyset pages
returned 200 + 200 distinct trial ids, has_more=true then false; response
bodies were 662454 and 663151 bytes. No source or business rows were copied.
