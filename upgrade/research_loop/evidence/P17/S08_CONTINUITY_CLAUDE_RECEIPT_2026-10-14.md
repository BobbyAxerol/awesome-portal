# S08 Execute replay — continuity, mode 5 and window size (Claude receipt, 2026-10-14)

Frontend consumption of §58 (CG-RP-01…05) and §59 (CG-RP-06…08). Real preview
API, GET-only after sign-in, `claude-preview`. Fixture/Mode-5 evidence below is
a real product run, not a synthetic fixture.

## What was built (commits on `claude/fe-parity`)

| Commit | Change |
| --- | --- |
| `0c1a6e42` | Glyph overlay clips to the plot area (SVG clipPath + out-of-plot hide); play across folds keeps earlier windows as a trail with labelled fold separators. |
| `4ba9c57d` | `execution.split_shape` (`SINGLE_FULL_WINDOW`) disables play-across with "One full-sample window"; separators read `fold_capital.boundaries[]`. |
| `36139c9e` | Play across folds continues along `window_cursor.next_window_cursor` (no fold-start read, crossing named from the first new bar's `fold_id`); `retainedContinue(next|previous)`. |
| `4963a89d` | Window limit = `min(fold bars, 2,000, page.max_bars)` (legacy 200 when not advertised); trail 4,000. |
| this commit | Mode 5 shows one "full sample" chip and legend (no IS/OOS/holdout); separator label clear of the readout; preview spec `_preview-research-s08-continuity`. |

## Where the numbers come from

200 (old server cap) and 600 (trail) were client choices, never measured.
Chromium, lightweight-charts, candles + 2 lines (1100×260): setData 38–77 ms for
600–8,192 bars; reveal tick 0.6 ms @200, 1.7 ms @2,000, 5.2 ms @8,192; heap flat.
Client cap 2,000 keeps a tick under 2 ms and holds every real 168-bar fold whole.
Chart cost only; whole-screen cost not measured. Server: §59 (8,192 request
ceiling, 1 MiB payload, p95 307/280 ms two readers).

## Real preview receipt

- Preview: `control-api` + `portal-web` rebuilt from `4963a89d`/later, scoped `up`,
  no DB/migration; running image id == tag for both services.
- Mode 5 run `rrun_97c8ed4483b411213c21714be0aeb510`: profile
  `p10.delta-mode5-global-1h.v2`, alpha `av_delta_rsi_polynomial_alpha_1_0_1`,
  Delta RSI, 200 trials, seed 42, full span 2020-01-14 → 2026-10-01 (58,848
  bars, one full-span fold), COMPLETED/READY in ~2 min. Preflight estimate 119 CPU s.
  (The default seed binding `…_1_0_0` leaves every mode-5 profile
  `ALPHA_EXECUTOR_MISMATCH`.)
- Browser, 1280 and 660 (4 tests): mode 5 switch disabled "One full-sample window";
  0 glyphs outside the plot (8 drawn); 0 horizontal overflow; 0 non-GET writes; 0 failed API reads.
  Walk-forward `rrun_6f7e63ce…` (3 folds): turning the switch on reads nothing; play
  at 64× crosses fold_01→02→03 along the cursor, status "Entered fold_0N · capital
  carry_position…", chart "336 bars · 168 from earlier folds", separator tooltip
  "fold_02 begins · same parameters · trial 0 · equity carried · position carried · bars 960–1127".
- Screenshots kept outside Git (`/tmp/s08-shots`).

## Not done / limits

- Previous-window button still uses the page's own `prev_cursor`; `retainedContinue("previous")` exists, untested in a browser.
- Boundary labels of folds already passed are scrolled out at speed; the view keeps the reader's zoom.
- Whole-screen render cost at 2,000+ bars not measured; no baseline re-record.
- Mode-5 run is one run; no other full-sample run was checked.
