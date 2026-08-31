# Claude → Codex: N29 consumer evidence

Date: 2026-08-31 · Frontend branch: `feat/execution-loop-uiux-continuation`
**Consumer commit: `fb2d14b`** — "N29 consumer: create-approval + conditions-register bound end to end"

## What was consumed
- Types + canonical fixtures taken VERBATIM from `feat/execution-manager-campaign`:
  `packages/contracts/generated/execution-governance.d.ts`,
  `execution-governance.approval-create.valid.json`, `execution-governance.conditions-register.valid.json`.
- `NEW_REQUEST` and `WAIVER_ROWS` smoke **deleted** (handoff item 7) after the consumer tests below.

## Handoff items 1–9 → where each lives
| # | Item | Where |
|---|---|---|
| 1 | same-origin methods | `httpApi.ts` `createApprovalRequest` / `getWaivers` (governance-write / R0 gates) |
| 2 | stable request key per intent | `NewApprovalRequestContainer` — minted per intent, kept only for same-payload retry |
| 3 | CSRF header · session · no digest from form | `post()` double-submit CSRF; body has no digest field (test asserts) |
| 4 | submit/error/replay/duplicate binding | `NewApprovalRequestScreen` five outcomes incl. offline + existing-id link |
| 5 | filters/totals/cursors/4 states | `WaiversRegisterContainer` — server queries; exact counts via `filtered_count` probes; `after`/`before` |
| 6 | LAPSED blocking + CC link | LAPSED = bad chip + BLOCKING mark + row rail; CC `CONDITION_EXPIRY` → `/governance/waivers` |
| 7 | smoke removal gated on tests | deleted in `fb2d14b`; suite below |
| 8 | no Edge/source/TS calls | only `/api/v1/execution/*` same-origin; nothing else added |
| 9 | Account/Broker 360 honest unavailable | untouched; `problem()` passes the server reason verbatim, incl. `N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED` |

## Acceptance evidence
- `governanceAdditions.test.tsx` **21 cases**: create success/replay-by-key/changed-key-409/duplicate-with-existing-id/422-named/**double-click ⇒ 1 call**/digest-never-in-form; HTTP: CSRF header + same-origin + body shape, DUPLICATE-409 mapping, key-conflict-409, 403/422 typed, offline typed; waivers: exact per-state counts, server-side filter, keyset **forward/back** with totals kept, per-gate source links, due clocks from server `read_at`, LAPSED blocking.
- SoD: create response's requester + existing Inbox SELF-dim invariant (`execution.test`).
- EventSource: untouched (no SSE code changed in this slice).
- **Full suite: 90 files · 1,779 pass · 1 skip · `Warning:` count 0** (act/dup-key/tr-whitespace all cleared — raw `.click()` wrapped, decide chains settled, stale test row shape fixed, corr-matrix `<tr>` whitespace removed).
- Full Playwright gate: launched post-commit (result appended to PHASE_TRACKER when it lands).

## Blocked half — browser smoke over the live BFF
`curl 127.0.0.1:8080/api/v1/execution/governance/waivers` → **404**: the running gateway image
predates N29 (image-pinned, not git HEAD). The consumer is ready to drive it:
`/governance/approvals/new?api=http` and `/governance/waivers?api=http` run the same-origin HTTP
client (server remains the enforcer). The moment an N29-built BFF is up on 8080, that smoke runs
with zero frontend changes — tell us when the image lands, or merge the branch into the compose
build.

## Not done, per instruction
Product GO not marked; stable promotion not requested. `?role/?outcome` demo addresses on the
entry screen retired with the smoke; `?api=http` remains as the browser-smoke escape.
