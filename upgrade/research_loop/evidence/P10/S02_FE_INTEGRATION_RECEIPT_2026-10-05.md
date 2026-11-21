# S02 linked-window setup — frontend integration receipt

Date: 2026-10-05. Owner: Bobby; UI: Claude; backend: Codex (`S02_LINKED_WINDOW_SETUP_2026-10-05.md`).
Lane `claude/fe-parity` on `docs/research-loop-plan`. Commits `d9dc8697` (feature), `0f4919c5` (browser-found fixes);
this receipt's e2e/baseline commit follows. Nothing pushed. State: `READY_FOR_BOBBY_REVIEW`, not `OWNER_ACCEPTED`.

## Delivered (handoff §5)

| §5 | What | Where |
|---|---|---|
| 1 | Setup options read when Alpha/version/workspace/dataset/symbol/timeframe settles (300 ms), obsolete answers fenced by context + `source_revision`; disabled profiles keep the server's typed reason | `setupClient.ts`, `useRunSetup.ts` |
| 2 | Three Window: four linked inputs A/B/C/D + track; B and C edit both windows that share them in one patch; precise UTC inputs, keyboard (±1 bar, Shift/PageUp/PageDown, Home/End), pointer drag commits once on release; Suggest / Apply / Reset | `LinkedWindowCalendar.tsx`, `WindowSetupBar.tsx`, `useWindowSuggestion.ts` |
| 3 | Advanced: suggestion sends the profile's admitted frequency / window mode (profile list, not the release default); rail draws folds from `planned_folds.items` only, typed absence otherwise; no independent holdout, no invented inner plan | `FoldTimeline.tsx`, `dataDeclarationV2.ts` |
| 4 | A cloned v1 run needs no guard field and stays v1; explicit "Use v2 guards" fills EMPTY guard fields only; `0 applies no guard` shown | `runDraft.ts`, `NewRunRoute.tsx`, `NewRun.tsx` |
| 5 | Coverage prefill is only the fallback (setup absent); the first suggestion auto-applies once, only into an empty draft or one holding only an untouched prefill; 450 ms estimate debounce/abort untouched; no request on mount or per drag/keystroke | `runDraft.ts`, `useWindowSuggestion.ts` |
| 6 | Clone path: preflight always taken anew; any edit retires the token | existing hook, verified |

## Real-API evidence (preview rebuilt from `0f4919c5`: API `635fc5e0…`, Control `cd14acb7…`, Web `590aa677…`; running images equal `identity.json`)

- `e2e/_preview-research-s02-setup.spec.ts` 8/8 at 1280 and 660 px. Delta BTCUSDT 1h: first suggestion fills
  2026-08-02 23:00 → 09-13 23:00 → 09-25 23:00 → 10-01 23:00 UTC, IS 1,008 / OOS 288 / Holdout 144 bars (equals the backend proof);
  1 setup GET + 1 suggestion POST; moving B asks nothing; Reset empties. Advanced: 5 engine folds. Imported alpha: Advanced shows
  `Not runnable · Alpha executor mismatch` and Suggest is off. v1 clone: preflight body is `requested-spec.v1` with no guard keys, Run off
  until a preflight, off again after an edit. Preflights/run-creates: only the clone preflight (no run was created, no job started).
- Full lane on `localhost:8095`: 309 passed, 1 skipped, 2 failed (P24 matrix S02 over `localhost`, W5 S06 tab-stop budget). Both were then resolved as the notes below say and re-run alone: matrix S02 passes on the public origin; the W5 budget test passes with the new budget.

## Found in the browser (not by unit tests) and fixed

Suggest had no profile before a mode was chosen; the "Your bounds kept" note contradicted a suggestion; the track axis was squeezed by 6 years
of coverage; every edge turned red for an unrelated "choose a mode" error; the default frequency was the release's `quarterly` (profile admits
`weekly`) so Advanced suggestion was refused; the reset baseline was read after the patch landed (Reset did nothing after auto-apply);
"≈ N folds" repeated the timeline's count.

## Gate notes (honest)

- P24 matrix S02 cell: an imported alpha version is now ACTIVE, so a plain visit preselects nothing. The cell now opens a copy of the P04 run;
  `getOnly` lets the two stateless computing POSTs through. The cell passes on the public origin; on `localhost` the Control API's Origin
  check returns 403 for those POSTs, so run it with the default base URL. The real-API cells need `RESEARCH_PREVIEW_BASE_URL=http://localhost:8095`
  today because Cloudflare injects an analytics script on the public host that trips the console gate (environmental).
- W5 S06 tab stops are 120 (budget was < 120): the cinema's sampler-configuration tooltip added one deliberate stop (Codex `99de587e`);
  budget is now < 125.
- Cinema probe text follows Codex's wording (`sampler internal trace: not published`).
- Hand-offs unchanged: no 409 problem code distinguishes an obsolete `options_revision` from other conflicts (POST 409 is treated as stale);
  canonical declaration-estimate fixtures carry no `planned_folds.items`; the VN profile (source clock `Asia/Ho_Chi_Minh`) is disabled and a non-UTC
  suggestion is refused by the UI (`SOURCE_TIMEZONE_NOT_UTC`).

## Rollback

`git revert 0f4919c5 d9dc8697` restores three independent window rows; backend routes are additive and unaffected.
