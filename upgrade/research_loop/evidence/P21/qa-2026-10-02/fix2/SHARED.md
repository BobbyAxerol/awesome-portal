# fix2 SHARED
| defect | status | file | test |
|---|---|---|---|
| UX-15 / U12 / U13 skip link | FIXED: "Skip to content" first focusable, visible on focus, focuses main#portal-content (tabIndex -1) | app/PortalShell.tsx, styles/shell.css (additive) | PortalShell.test "skip link" |
| S02 dark error box 3.05:1 | ALREADY FIXED (verify: 5.01:1) | | |
| S02 R88 SESSION_REQUIRED (preflightClient.ts) | SKIPPED: not in SHARED file list | | |
| "+" on non-signed rates / units count for seconds (formatMetric) | SKIPPED: formatMetric cannot know which rates are signed without a server field | | |
| S06 D10 dark ramp, FAILED-RETRYABLE vocabulary, ResearchPanel duplicate banner | SKIPPED: no verify README for SHARED; needs owning-screen files/decision | | |

No verify README exists for SHARED; scope taken from GROUPS.md. No browser check run.
