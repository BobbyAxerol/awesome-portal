# B11 PROFILES_PROGRESS (S02, S03)

S02 bound: `selectProfile` now also keys on the served `optimization_schedule`; the causal profile
(schedule `per_fold_causal` AND `inner_validation=REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY`) is never inferred from v2.
Schedule option is selectable only from the served causal profile (disabled -> its served `reason`);
inner controls use served `inner_constraints`; caps shown as served (`trial_scope`, `trial_count`, `max_total_trials`).
Not served -> legacy behaviour unchanged. NewRun.tsx, dataDeclarationV2.ts, NewRunRoute.tsx.

S03 bound: PER_FOLD_STUDY fold notes, evidence cursor and live fold rows show `study_id` + `source_trial_id`
(ordinal only in tooltip, "cumulative, not a native trial id"); study row counts server reported/planned folds;
pct untouched. useRunProgress.ts, RunProgress.tsx, RunProgressRoute.tsx.
Not touched: features/runs/RunProgress.tsx (legacy run API, not the research route), StageLedger/FreezeDetail.
NEEDS-SHARED: StageLedger.tsx scope map lacks PER_FOLD_STUDY (Bobby's compile fix) and still receives
foldTrials ordinals; if it prints trial labels it should take foldTrialIds too.
Tests: declarationEstimate.test.tsx (+5), runProgress.perFoldStudy.test.tsx (new, 7). Typed builders, labelled.
