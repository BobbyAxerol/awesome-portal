# Candidate identity and current-source closeout — 2026-10-01

## Finding and scoped correction

Actual preview run `rrun_a76afa62adb6c427ba2f4cec44bb43bd` completed 400 trials, nine folds, retained all OOS-generation records, and sealed its source series. Freeze nevertheless reported nine candidate mismatches. P05 normalized `rvol=1.0` to the exact decimal string `"1"`; the old TypeScript hash serialized it as Python int `1`. QuantBT 1.1.1 `_strategy_candidate_id` serializes the selected Python float as `1.0`. Independent invocation of the installed pinned function returns `00b18de5ca922d3223fc317e`, matching the nine source children; the former Portal hash was `f844f1d15753484fde5c61c5`.

The read-side correction takes int/float kinds from the historical child binding, applies the same rule to Fold Ordering and Stage-4 Binding, and includes ordering in the Freeze revision/ETag. It never substitutes an observed child's ID as the expected value or changes sealed decimal parameters. An unknown binding/kind remains `NOT_COMPUTABLE`. Genuine mismatches still fail the regression test. The pinned Delta child only permits the two float what-if axes; integer axes remain integers. A future child must register its own kinds with its historical binding.

The mandatory aggregate gate also caught the S11 retained-lane composer still invoking Fold Ordering without historical kinds. That backend path now resolves kinds by the producer's exact profile digest. Its existing real-retained fixture and disposable PostgreSQL compose/seal tests remain strict; a new unknown-profile assertion forbids fallback to current kinds. The first aggregate run failed (five assertions) and is not counted as acceptance.

The P05 display sample also reserves one real pre-generation selection-stage witness for each OOS child (when source retained it). Both records retain original ordinals and source fingerprints. The same 64-record bound, source counts and truncation remain; a missing witness is never fabricated. Earlier immutable seals/reports are not repaired in place.

Focused tests: Fold Ordering, surface/Stage-4 and Report 52/52; pinned QuantBT independently reproduced the actual candidate ID; Control API production build passed. Pinned Python catalog and lifecycle regressions are recorded with the grouped commit. A fresh corrected-image receipt is still required for the final Report/S11 path: the previous run's frozen Report was created with the old false mismatch and must not be silently rewritten.

## Other changes in this same batch

- BR-TXT-02: future S09 report notes/warnings/provenance/promotion caption are concise (≤12 words in the affected rows), preserving numerical scopes and separate source digests. Existing frozen Reports retain their original bytes. This is the S09 part of BR-TXT-01, not a claim that every long reason in Atlas/Compare/Search is fixed.
- BR-F4-01: Research dataset catalog publishes `1d` rather than HMD's pandas-style `1D`; both designate the same fixed day interval. Old uppercase catalog responses remain schema-compatible. Other timeframes and source coverage are unchanged. Canonical fixture and generated contract description are regenerated; no frontend file is edited. This fixes the declaration spelling, not a blanket admission of every timeframe/profile.

## Handoff and limits

Claude already landed F4/F5 consumer commit `fedfac44`; it is preserved in this backend branch. S03 can consume planned folds and actual cumulative trial rate; S09 consumes source-file digest with `FULL_STITCHED_SOURCE_SERIES`; S01 uses workspace Library last-30D; S04 uses named Evidence v2. Do not relabel old Reports as regenerated v2. The remaining BR-D4-1 metadata index, v2 executable profile/early refusal decision, T12 utility admission, T14 source exposure writer, unified P23 acceptance and P24 release rehearsal are not closed by this receipt.

Scope: owned isolated preview only, no frontend change, no direct TS access, no production deployment, no remote push. Private API payloads stay under the approved owner-state receipt directory, not Git.

## Corrected-image real acceptance — PASS

Commit `83201af3` passed the full hook (Control API 1,408 pass / 1 skip; contracts 205/205). The backend-only refresh preserved Claude's actual frontend image. Exact images: Control API `sha256:9ce39caca76183e8b2510bd78bc910dd277ede2a44b201d8624c226e18ce4b88`; Portal API/worker `sha256:38391587121f9cdcd58d6c44d11e26c97573effc02a250e611ea3afa97e40d0e`; web `sha256:6883c4175e3e0f77d863b51b4cba2050eba5aca0c2704b81237f6fbb5fad93d0`.

- Existing `rrun_a76afa62adb6c427ba2f4cec44bb43bd`: Freeze now reports 9 MATCH / 0 MISMATCH and Stage-4 params MATCH; the earlier frozen Report and source-series receipt are byte-for-byte unchanged. Private receipt SHA-256 `50183d2a6df262172773f152ceafcda66ed5bbf680dc77b36be44ac75887a302`.
- Fresh **R-WFO-023**, `rrun_3d5633d2adb712722fe4ba108102aa5d`: real read-only HMD `crypto-binance-1m`, BTCUSDT/1h, 2026-06-01..2026-09-01, first OOS boundary 2026-07-01, weekly expanding, global mode-1, seed 42, 400 trials, 9 folds. Admission → isolated child → P05 retention → actual named API reads → Report → RC seal/pack all passed. Stage-4 is `BOUND`, every fold has exactly one retained OOS-generation record, source drop=0, 9 MATCH / 0 MISMATCH. Observed trial rate `9.152993995`; analytics v2 has 1,488 OOS observations and Library 23 last-30D points. Largest response 269,014 bytes, within 1 MiB.
- Actual source Parquet SHA-256 `858a5cd71095e808cafcd0783d7a5df841978d26fbb68255f3726a569dd132a5`, 126,868 bytes, `FULL_STITCHED_SOURCE_SERIES`, equals Report equity digest. Frozen Report revision `p18r1_45e018386ed712b209f6ace87839982bb38df857f4361fd7a43fd390d5c5cbe4`. Local RC `rc_06GFFDG3SA17Y5WPBN58NFM5B2`, pack SHA-256 `a720a588558db15d4c85ebcb152889e6a3d363c24d0f075655236d9a1f8afbbf`, remains `NOT_DELIVERED / NOT_APPROVED`; no approval publication or live command was performed.
- Private complete fresh receipt SHA-256 `92d6b6be8570c604be56fa96cbe48c3076421159aa5381c987c0a548ef9cc2ad`. It stores exact API responses and image IDs under the owner-state directory, mode 0600; no source market rows, credentials or preflight token enter Git.

This closes the named fresh-run acceptance for LW-03, CG-FG-S09-02 and non-null S03 rate, plus the candidate false-mismatch correction, **on this preview profile**. Global selection stays explicitly non-causal, model transitions are not broker fills, and missing engine wall-clock/certification facts stay typed. Not universal profile coverage, production activation, P23 aggregate or P24 release acceptance. The parallel P04 regression exposed a separate combined-passport byte budget error; see the P13 packet, not a PASS for that failed run.
