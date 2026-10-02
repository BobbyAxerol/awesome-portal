# B11 REPLAY_REPORT (S08 S09 S10/S12/S13)
- S08 bound: segment OUTER_FOLD_SELECTION own digest/study/trial/params shown as "own params" chip + fold-chip title (ExecuteCandleReplay.tsx); legacy segments keep the progress join; no global theta.
- S09 bound: row score_basis (data attr, IS title, caption), params_handoff PER_FOLD_SELECTION_APPLIES_TO_OWN_OOS (own params column + caption), final audit PER_FOLD_PARAMETER_SELECTIONS ("= own selection"; ReportFailedSheet.tsx FinalAuditBlock touched minimally).
- S13 bound: LineageDetail labels scope OUTER_FOLD_SELECTED_OOS_MEAN. S10 RunLibrary and S12 Compare: no change needed (no grep hit for the changed enums; they render published all-time/basis fields verbatim).
- Tests: executeS08Bindings, reportDetail.test, lineageDetail.w6b (typed mutations of canonical fixtures).
