# B3 CG-FG-S11-02 — selected-params compose source facts

Status: BACKEND_ACCEPTED at `ae715219`; exact-head isolated preview proved.

The P21 Screen-11 compose GET now has a typed `selected_params` read model. WFO uses the immutable retained global selection trial id; numeric source ids are zero-based and the visible trial number is one-based. A P04 persisted numeric trial id follows the same rule. A centroid/composite selection has no trial ordinal (`NOT_APPLICABLE`); a missing or nonnumeric source id is `NOT_PUBLISHED`. The engine does not publish a distinct `param_set_id`; it remains null with `P21_PARAM_SET_ID_NOT_PUBLISHED`. Do not relabel selection id or parameter digest as that identity.

Only the recomposed GET payload changes. `release_candidate_packs_v1`, frozen core, source fingerprint, pack digest and existing local seals are untouched. The P04 pre-retained golden still matches byte-for-byte after excluding this additive display field.

Generated client: `packages/contracts/generated/research-release-candidate.d.ts` → `ComposeResponseP21.selected_params`; canonical WFO example: `packages/contracts/fixtures/research-release-candidate.wfo-retained.valid.json`.

Focused evidence: P21 service/contract and WFO retained tests pass; P04 golden 1/1; Control API build; generated contract test 3/3; full hook 1,397 Control API tests passed (1 skipped), contracts snapshot 221 files. Isolated `:8095` preview built exact commit `ae715219` as image `sha256:694644be760cc30739f9aa3ec52bde40c6fee73a12c7bed26b4ce42c136f27c5` and returned authenticated GET 200 for real WFO `rrun_3258a4c450816129d2d285f25b801061`: `selected_trial_number=394` from source trial 393; `param_set_id=null` with `P21_PARAM_SET_ID_NOT_PUBLISHED`; source fingerprint `990bd21c23422b481f1c54f224667c1ec8221463d1938707b139dab27ce876db`. Claude owns S11 data binding and browser/HiFi receipt.
