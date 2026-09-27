# E15 — Progress artifact and journal closeout

Date: 2026-09-27  
Scope: producer/worker backend only; no frontend or runtime deployment.

## Product truth

The worker now seals three real immutable producer inputs for every P10 run:

1. `research/requested-spec.json`
2. `research/effective-spec-receipt.json`
3. `research/dataset-binding-receipt.json`

They join the existing progress journal and progress receipt. A fixed P04 run also has its source-owned evidence and split receipts, giving Screen 03 the seven artifact rows required by the approved HiFi. An Advanced-WFO run does not manufacture those P04 receipts; it truthfully seals five P11 artifacts while its retained-current-source lane owns the WFO evidence.

## Safety and immutability

- Every new file derives only from the already validated, bounded P10 envelope.
- No credential, token, source path, lease token or raw market row is copied.
- Files are mode 0600 and listed in the CAS mandatory-file set.
- A missing file fails seal; no partial path becomes readable.
- The progress journal receives every `artifact_writing` fact before it is exported.
- After CAS commit, each row receives exact byte size and digest through `artifact_sealed`.

## Progress semantics

- Retained WFO trials and fold completion remain source-backed.
- Global selection and parameter digest are repeated per completed fold because that is the actual QuantBT global schedule.
- No `fold_segment_observed` is emitted. QuantBT does not publish per-fold search/OOS/freeze wall-clock segments; inventing them for the timeline would be false.

## Verification

- Python compile: pass.
- Focused tests cover exact receipt bodies, forbidden-field scan, file mode 0600, mandatory CAS membership and SEALED digest rows.
- The standard Portal backend/pre-commit test environment remains the authoritative pytest gate.

## Frontend handoff

Screen 03 may render every artifact exactly as supplied. It must not assume every execution profile has seven rows, and it must show the typed segment absence rather than drawing inferred fold subsegments.
