# CG-FG-S10-03 — structured claim family on Attempt Lineage

Status: backend candidate; full hook and exact-HEAD preview receipt pending.

P19 now returns `run_facts.claim.family`, `family_origin` and `family_availability` with the same conservative family rule as P20 Compare. The server no longer asks S10 to infer a family from a sentence. The two positive paths are (1) `walk_forward_oos` from an accepted RS-02 WFO seal that still matches its SEALED P05 artifact, and (2) a valid persisted P14 fixed-profile split with an outer-OOS observation window. A missing/malformed split, unsealed source artifact, unrelated profile, historical absence or mere claim text stays typed `NOT_PUBLISHED`. A draft without a primary run stays `NOT_APPLICABLE`.

The P19 repository reads only the visible primary run ids (at most 128) in its existing workspace-scoped repeatable-read transaction: latest seal plus artifact match, then one batched latest-split query. No N+1 source call, HMD read, engine rerun, command or new database table. P20 consumes the same helper, and its text and ranking semantics are preserved.

Focused tests: P19 service/fixtures plus P20 Compare parity, 24/24; Control API source build passed. The P19 fixture includes a source-attested WFO family and a false-attestation negative test; full-hook PostgreSQL and exact-HEAD read evidence are added after commit.

Frontend handoff: regenerate `research-attempt-lineage.d.ts`; bind S10's claim panel to `run_facts.claim.family` and its typed availability/origin. Do not parse `claim.text` or substitute an issued certificate grade for family. Do not change the approved S10 layout or visual baseline.
