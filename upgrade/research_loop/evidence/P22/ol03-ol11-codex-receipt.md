# OL-03 → OL-11 — P22 backend delivery receipt (historical pre-runtime)

> Superseded by [OL-03→OL-13 closeout](./ol03-ol13-codex-receipt.md) and the [real-preview receipt](./real-preview-receipt.json). This file preserves the pre-runtime checkpoint only.

**Branch:** `codex/research-ol-p22-p24` (isolated worktree)
**Scope:** P22 only; no P01–P21 source or frontend files were modified.
**Runtime:** no deployment, no shared preview (:8095), no Production/Execution call.

| OL | Result | Evidence |
|---|---|---|
| OL-03 | P22 publication intent/replay transitions kept actor-bound; additive attempt/conflict/downstream fields | `release-candidate-publication.repository.ts`, migration 070 |
| OL-04 | Sealed-pack claim extraction and final-audit `rrun_` mapping are source-backed; missing claim stays typed unavailable | `p22-publication-bridge.service.ts`, bridge tests |
| OL-05 | P22-only compose overlay and loopback `:8097` lifecycle script; volumes/project are namespaced | `compose.research-p22-publication.yaml`, `p22-publication.sh` |
| OL-06 | Final-audit materialisation uses a narrow `SECURITY DEFINER` bridge; no direct runtime DML on `run_read_models` | migration 070 and privilege test |
| OL-07 | Existing P19 promotion-fact schema is preserved; P22 richer receipt is separate and immutable | `p22_promotion_pick_receipts_v1`, `p22_record_promotion_pick` |
| OL-08 | Approval status is checked against the exact R1 row; only APPROVED/APPROVED_WITH_CONDITION appends the P19 source fact | migration 070 function |
| OL-09 | Contracts/OpenAPI and generated declarations updated; focused service/contract/bridge tests pass | `npm run generate:research-release-candidate-publication`; 20 focused tests |
| OL-10 | Migration cleanup list includes the P22 relations; no duplicate P19 table is created | `test/harness.ts` and migration review |
| OL-11 | Canonical route disposition recorded: only `GET …/publication` and `POST …/publish`; old contributor routes rejected | this receipt and handoff amendment |

**Not claimed:** real Delta→R1 preview, browser receipt, P23 resource/DR qualification, or product activation.
The OL migration and privilege gate were executed on a fresh disposable PostgreSQL 16 cell and
passed 2/2; that is schema evidence, not a product receipt. Real Delta-to-R1, browser and P23
evidence still require the isolated stack and private owner evidence.
