# B1 CG-FG-S10-01 — Promotion Pick selection truth

The P19 lineage read now matches its immutable promotion fact to the exact P22 pick receipt by workspace, AlphaVersion, run and fact digest. It exposes `selected_trial_id` only from that receipt and `selected_params_digest` only from the matching selection record. An absent or ambiguous receipt stays typed `NOT_PUBLISHED`; the approval/evidence-set digest is never presented as a parameter digest. No P22/P19 writer, UI, migration or runtime setting changed.

Verification: Control API build; P19 focused service/fixture tests 10/10; P22 settlement on a disposable PostgreSQL database 1/1 (the approved exact fact joins one receipt and correctly discloses absent selection); generated contracts snapshot 220 tracked files; contracts suite. The positive selected-trial/digest path is asserted in the P19 service test, while the SQL path is exercised against migrated PostgreSQL.

Frontend handoff: regenerate `research-attempt-lineage.d.ts`; render the new `PromotionPick.selected_trial_id`, `selected_params_digest` and their availability codes, never substitute an approval digest. Existing P19 response fields are unchanged.
