# R-A fixture variant follow-through — 29 October 2026

Input: `claude/slice-codex-consumers@2a2a2d5a48fafd2759ef591e7543e136a05d30bf` and `CODEX_TO_CLAUDE_FOUR_REQUESTS_2026-10-29.md`. Worktree: `fix/uxm07-ra-variant-20261029`. This is a candidate, not a landed change or source/authority acceptance.

## Scope and implementation

- A declared view reads its declared deployment's book even when that deployment's stage has completed; it does not substitute another alpha's current deployment. Completed stage facts remain completed. W101 now selects a genuinely current Sandbox for the failure scenario; it does not rewrite the retired record.
- Fixture-only `GET /__fixture/variants?view_id=...` returns one declared relation; the denied test workspace is refused. Live, Canary and Sandbox may show `Fixture view of ...` only after their room succeeds and the fixture overlay is present; the reply must carry a valid `x-fixture-lane` beginning `FIXTURE_LAB` (including configured fixture-lane labels). Product payloads and production schema are unchanged. The relation is presentation metadata, never an access grant.
- Live gap and mismatch navigation names the base deployment. Fixture Operations and Blotter independently refuse the negative workspace; unknown views are not resolved by suffix stripping. W37 uses the declared relation, not suffix parsing.
- R-B and R-C are unchanged: the guarded join is not a shared-snapshot proof; equity projection remains fixture-only, unmounted on the real API and not connected to screens.

## Verification

- Focused Vitest: **343/343** across nine files (variant/stage, fixture context, Live/Canary/Sandbox, R-B and R-C reader).
- After accepting custom fixture-lane labels, the three affected Vitest files passed **105/105**. The first retry lacked sandbox permission to listen on localhost and failed with `EPERM`; the permitted localhost retry passed.
- Cross-screen graph / retirement: **124/124** across world ties, stage standing and variant tests. First world-ties run found W37 and W101 expected the old behavior; their checks were changed as described above and the rerun passed.
- Isolated `dist-ra` Vite build succeeded. Chromium **4/4**: fixture journey Live → Operations → Incident at 1280 and 660, with workspace and base target carried through, plus Canary and Sandbox fixture-base labels. This uses a browser BFF double plus the declared fixture graph, not the connected Edge or production API. Initial dev-server attempts failed on Vite dependencies; an initial built-browser run reached Operations but failed due to a wrong test selector, corrected before the passing rerun.
- The full frontend `tsc -b` was interrupted under concurrent host load and is **not PASS**. The full integrated-tree normal hook, visual baseline, R-B `DecisionCockpit` end-to-end, connected source and the wider UXM-07 browser suite remain separate gates; none is claimed PASS here.

## Handoff / rollback

Claude: review the fixture-only subtitle and the browser scenario against approved UX; do not infer a real deployment relationship from the ID, and retain destination permission checks. R-C still needs a separately qualified producer and consumer. Codex integrator: reconcile this candidate with the current Claude and Core tips, rerun affected tests and the normal gate once on the final frozen tree; do not overwrite WIP. The candidate can be reverted by reverting its scoped commit(s); no migration, production configuration, deployment or source mutation is involved.
