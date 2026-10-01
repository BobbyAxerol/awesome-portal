# B3 CG-FG-S11-02 — selected-params compose source facts

Status: BACKEND_CANDIDATE; exact-head preview pending.

The P21 Screen-11 compose GET now has a typed `selected_params` read model. WFO uses the immutable retained global selection trial id; numeric source ids are zero-based and the visible trial number is one-based. A P04 persisted numeric trial id follows the same rule. A centroid/composite selection has no trial ordinal (`NOT_APPLICABLE`); a missing or nonnumeric source id is `NOT_PUBLISHED`. The engine does not publish a distinct `param_set_id`; it remains null with `P21_PARAM_SET_ID_NOT_PUBLISHED`. Do not relabel selection id or parameter digest as that identity.

Only the recomposed GET payload changes. `release_candidate_packs_v1`, frozen core, source fingerprint, pack digest and existing local seals are untouched. The P04 pre-retained golden still matches byte-for-byte after excluding this additive display field.

Generated client: `packages/contracts/generated/research-release-candidate.d.ts` → `ComposeResponseP21.selected_params`; canonical WFO example: `packages/contracts/fixtures/research-release-candidate.wfo-retained.valid.json`.

Focused evidence: P21 service/contract and WFO retained tests pass; P04 golden 1/1; Control API build; generated contract test 3/3. Full hook and exact-preview result will be appended after commit. Claude owns S11 data binding and browser/HiFi receipt.
