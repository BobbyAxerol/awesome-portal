# LW-05 — Progress ordinal, source trial identity, and objective scope

Read-only R-WFO-020 preview comparison, before this change:

- Progress `folds[0].selection.trial = 394` is the one-based P11 journal ordinal.
- Retained current-source Search/Freeze `selected_trial_id = "393"` is the zero-based Optuna source ID. P10's producer explicitly converts `int(trial_id) + 1`; these identify the **same** selected trial, not different θ*.
- The selected candidate's `MODE_1_DECAY_J = -4.796929242668172` agrees between Progress and retained Search. The live trial callback's `best_objective = 4.948278702312006` is **raw IS mean Sharpe**; the old `best J₁` display label was wrong, not the stored number.

Correction: the Progress public snapshot now adds `source_trial_id: "393"` and `objective_kind: "MODE_1_DECAY_J"` beside its existing ordinal and selected objective, only for the immutable P10 Delta-WFO execution profile. Contract fields are optional for old/fixed profiles; an inconsistent source-ID/ordinal pair is rejected by the Control API schema. Current producer trial callbacks say `best IS Sharpe`; old stored events/snapshots remain byte-immutable while the public projection corrects their misleading display copy. OpenAPI and generated client expose the optional fields for Claude to bind; do not reinterpret the raw IS figure as selected J.

Verification: full hook 180 Control API test files / 1,381 tests passed, with one pre-existing skip; Control API build; QuantBT 1.1.1 producer tests 67/67; generated-contract fixture 5/5.

The exact-HEAD isolated preview at commit `4df0074f` ran Control API image `sha256:6899d21a9f6474ab6da1c78fea887cee24118c7f7bdb8775c54076e727da6cf3` and Portal API image `sha256:140747e5c0fc5f85b1ef0efcfee8cef886cffeb81b7834bca745f2d626f42b9d`. Authenticated, read-only R-WFO-020 Progress GET returned HTTP 200 with `folds[0].selection={trial:394,source_trial_id:"393",objective_kind:"MODE_1_DECAY_J",objective:"-4.796929242668172"}`; `overall.tqdm_line` says `best IS Sharpe 4.948`. Search GET returned HTTP 200 with `selected_trial_id:"393"`, the same selected J, and separately `raw_best_is.objective:"4.948278702312006", objective_kind:"IS_MEAN_SHARPE"`. No source journal, run or business row was modified for this verification.
