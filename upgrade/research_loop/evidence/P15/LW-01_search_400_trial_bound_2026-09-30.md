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
