# B3 CG-FG-S04-04 — P04 per-fold metrics are not applicable

Status: backend accepted at `b4965e34` (rebased from `0db92ca2`).

P04 is one fixed IS/OOS window, not a walk-forward fold study. For a current P04 Evidence Hub, `source_absences.per_fold_metrics` now reads `NOT_APPLICABLE/P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS` even if an older immutable source projection recorded a generic source gap. No sealed source object is rewritten. WFO/imported lanes preserve their own source availability.

Verification: Evidence focused regression test, contracts 204/204 and full hook 1401 pass/1 skip. Exact-head healthy preview image `sha256:b12fd4b213f4aa6d4e640e8dae275ab3a23d312c80b880698a7a7b97771af786`: authenticated P04 Evidence GET HTTP 200 with `source_absences.per_fold_metrics={state:NOT_APPLICABLE,reason_code:P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS}`. Claude may render structural N/A on S04, not an engine-missing warning. No public schema change, frontend change, migration, or runtime activation.
