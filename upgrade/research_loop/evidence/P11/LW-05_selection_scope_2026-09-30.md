# LW-05 — Progress ordinal, source trial identity, and objective scope

Read-only R-WFO-020 preview comparison, before this change:

- Progress `folds[0].selection.trial = 394` is the one-based P11 journal ordinal.
- Retained current-source Search/Freeze `selected_trial_id = "393"` is the zero-based Optuna source ID. P10's producer explicitly converts `int(trial_id) + 1`; these identify the **same** selected trial, not different θ*.
- The selected candidate's `MODE_1_DECAY_J = -4.796929242668172` agrees between Progress and retained Search. The live trial callback's `best_objective = 4.948278702312006` is **raw IS mean Sharpe**; the old `best J₁` display label was wrong, not the stored number.

Correction: the Progress public snapshot now adds `source_trial_id: "393"` and `objective_kind: "MODE_1_DECAY_J"` beside its existing ordinal and selected objective, only for the immutable P10 Delta-WFO execution profile. Contract fields are optional for old/fixed profiles; an inconsistent source-ID/ordinal pair is rejected by the Control API schema. Current producer trial callbacks say `best IS Sharpe`; old stored events/snapshots remain byte-immutable while the public projection corrects their misleading display copy. OpenAPI and generated client expose the optional fields for Claude to bind; do not reinterpret the raw IS figure as selected J.

Focused verification: Control API build, public projection regression, QuantBT 1.1.1 WFO producer tests, and generated-contract fixture test. Exact-HEAD preview response and image IDs are to be recorded after the scoped backend image rollout; until then this is code+contract acceptance, not runtime acceptance.
