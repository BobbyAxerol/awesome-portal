# LW-07 — Portal admission beside immutable QuantBT Atlas

The private QuantBT Atlas is a pinned source catalogue. Its
`current_release.submission_constraints.profile_id=p10.fixed-qualification.v1`
and one-trial/null-seed constraint describe that source release, **not**
every Portal run profile. The P10 Portal run-admission predicate separately
admits `p04.fixed-qualification.v1` and, under the Research WFO feature
gate, `p10.delta-signal-notional-wfo.v1`.

The current-release BFF now adds `portal_admission` without modifying
`atlas.current_release` or historical identity responses. It reports
each profile's enabled/disabled state, source-release verification reason,
route/protocol/mode/schedule/timeframe, trial bounds, seed and WFO temporal
bounds. Normal WFO admits exactly three trials and seed 42; the isolated
dev-only preview profile admits 2–400 with the same locked identity/seed.
The ETag includes this flag-dependent descriptor. The field explicitly
says profile facts are informational: immutable preflight and authenticated
run admission remain the only create authority.

OpenAPI `PortalAdmission`, regenerated
`packages/contracts/generated/research-foundation.d.ts`, canonical current
fixture and focused backend/contract tests cover fixed, WFO, preview bounds
and disabled/source-unverified states. Claude should bind the **Portal
admission** object for S02 run-copy; it must not infer a 1-trial WFO from
the QuantBT source-catalogue field. Historical Atlas remains identity-only.

Pinned isolated-preview acceptance on source commit `d88121e6`, Control API
image `sha256:a4342a9f90a00b209176dae23c8e26d9a7848384b168e416260a1d8a09fb2f23`:
GET `/api/v1/research/quantbt/atlas` returned HTTP 200. The current Portal
admission advertised P04 ENABLED (one trial, null seed) and WFO ENABLED
(2–400 trials, seed 42, max span 92 days, folds 2–16). The note is
`PROFILE_FACTS_ONLY_PREFLIGHT_AND_RUN_ADMISSION_ARE_AUTHORITATIVE`.
