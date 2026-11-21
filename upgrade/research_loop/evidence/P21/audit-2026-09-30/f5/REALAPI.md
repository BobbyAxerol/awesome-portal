# F5 REALAPI lane — NOT A VALID RUN (blocked at sign-in, environment)

Tree: 6e540cda (detached), apps/portal/frontend, npm ci done.
Command: `npx playwright test -c playwright.research-preview.config.ts` (cwd apps/portal/frontend)
Exit code: 1. Counts: 0 passed, 54 failed, 0 skipped (54 cells). Log: scratchpad f5l/realapi.out.

seeded-run.json already existed in ~/.config/portal-research-preview (run_id rrun_464bf9c3..., profile p04); not created or touched.

## Every cell failed identically (first call of each test, signIn, spec line 88)
`expect(response.status(), "real BFF sign-in").toBeLessThan(300)` -> received 403.
Cause 1 (environment/invocation): default RESEARCH_PREVIEW_ORIGIN is http://localhost:8095, but the stack (PORTAL_PUBLIC_ORIGIN) only accepts https://research-portal.primusspark.com as Origin. Needed: RESEARCH_PREVIEW_ORIGIN=https://research-portal.primusspark.com RESEARCH_PREVIEW_BASE_URL=http://localhost:8095.
Cause 2 (environment, preview credentials): with the public Origin, POST /api/auth/login for claude-preview with the stored claude-preview.password returns 401 INVALID_CREDENTIALS (curl, status only). The stack was re-recorded today (identity.json recorded_at 2026-10-01T15:52:53Z), so the stored password file is likely stale vs. the BFF user. Not investigated further (secrets access was denied by the classifier).

## Classification
54/54: environment (origin + credential), not UI, not stub drift. No source/spec changes made. The earlier 50/54 tally is neither reproduced nor refuted. The 2 stub P22 cells and 2 CG-S00-AV-01 cells were not reached.
