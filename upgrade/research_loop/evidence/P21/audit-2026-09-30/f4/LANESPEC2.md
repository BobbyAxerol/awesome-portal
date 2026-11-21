# LANESPEC2 - real-API lane spec brought to the QA-wave behaviour (2026-10-02)

Only `apps/portal/frontend/e2e/_preview-research-real-api.spec.ts` changed. No source, no commit.
Lane against the live preview (bundle index-B22EAcys.js): before 44 pass / 10 fail; after 54 pass / 0 fail (run 2). Run 1 (after the five triaged fixes) 52/2: one more intended change (S13 identical series) found and pinned.

| cell (x laptop, mobile) | classification | new assertion |
|---|---|---|
| X1 S11 DOUBLE seal (2) | SPEC-STALE (QA S11 U1) | no `[data-seal-chip]`; `[data-panel='sealed']` aria-label + h3 say "sealed locally"; header `[data-state-chip]` = SEALED (was DRAFT) |
| X1 S11 P04/WFO mobile (2) | SPEC-STALE (QA S11 U2) | frame scroll <= client, page no h-overflow, tbody display block, SOURCE (labelled) and NOTE cells present |
| W5c S10 (2) | SPEC-STALE (QA S10 U4) | no pick + an attempt with a release candidate: link `[data-action='release-candidate']` title "newest release candidate of this alpha"; unrouted span + reason only when none |
| W5c S13 (2) | SPEC-STALE (QA S13 sharedCert, BreakableCode) | identical cert absences: `[data-ladder-cert]` once (state attr, "cert not published", code), no per-card `[data-cert-absent]`; else per card `[data-reason-code]` attribute = code |
| E20 S14 (2) | SPEC-STALE (QA S14) | `[data-meta]` absent and no `/api/v1/research/alphas/import` in the screen text |
| W5c S13 fold lines (2, found in run 1) | SPEC-STALE (QA S13 UX-5) | `[data-fold-line]` count = distinct series; sum of `data-fold-line-members` = drawn attempts |

Also corrected the non-seal state-chip expectation (SEALED when `local_seal.state` is SEALED_LOCAL and not delivered), same U1 reason.
Real regressions found: none. Honest information still observable in each case (seal state, cert reason code, RC link reason, SOURCE/NOTE).
Logs: scratchpad/est/lanespec2-run1.log, lanespec2-run2.log.
