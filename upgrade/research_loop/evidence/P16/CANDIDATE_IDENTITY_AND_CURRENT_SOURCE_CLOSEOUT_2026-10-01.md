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
