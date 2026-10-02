# B11 SELECTION_SURFACES (S04/S05, S06, S07)

Base da185d7a. Frontend only; no commit, no server mutation.

- S04/S05 bound: CausalSelectionPanel (new, mounted in SplitDetail under the fold table for the cursor fold): own trial/params/objective/IS-inner/OOS/decay with scopes; inner rows observed (source-reported) vs guards.inner_min_folds (declared; typed absence keeps reason). Fold table/theta flow show "own - trial X"; ThetaStar/ThetaParams say "last fold only" for LAST_FOLD_DEPLOYMENT (never GLOBAL). EvidenceFlow verdict table: rule text, mean tooltips and data-score-basis follow rule.score_basis; fold id tooltip lists own selected_parameters.
- S06 bound: StudySurfaces (SearchSurface.tsx) with study selector; parent surface and K (freezeLineLabel, PoolFunnel) show NOT APPLICABLE + served reason; PER_FOLD_STUDY scope words, study_id/evaluation_scope in ledger scope text; LAST_FOLD_DEPLOYMENT card tag; INNER_VALIDATION_DECAY_J objective words; B4 journey says no run-global theta.
- S07 bound: FoldSelectionPanel.tsx (new, read-only). Engine wall clock stays absent with the served reason; OrchestrationClocks never used.
- NEEDS-SHARED: mount `<FoldSelectionPanel ordering={(freeze as { fold_ordering?: FoldOrdering }).fold_ordering} />` next to RetainedOrdering in FreezeDetail.tsx (~line 1548) plus the two compile fixes (FOLD_VERDICT_WORDS CAUSAL_DATA_TIME_SELECTION; reason_code ?? undefined) and StageLedger PER_FOLD_STUDY: false.
- Tests: src/research/selectionSurfaces.b11.test.tsx (typed builders from canonical fixtures; causal selection fixture is synthetic).
