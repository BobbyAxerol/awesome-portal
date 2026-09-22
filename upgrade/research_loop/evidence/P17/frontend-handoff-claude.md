# P17 frontend handoff — Screen 08 Execute / Replay

P17 backend is ready but feature-dark. Work only in Screen-08 composition,
route, generated client and tests you own. Do not modify P17 Control API,
P13 evidence reader, OpenAPI, PostgreSQL, deployment overlays, source adapter,
Execution code or Claude's unfinished P12 work to make a generic replay look
complete.

## Mandatory reading — record `READ`

1. `CLAUDE-FOR-thanhvuong.md` A13.1–A13.4: ownership, handoff and browser-first
   HiFi rules.
2. P13, P15 and P16 packets, then this packet and
   [source capability matrix](./source-capability-matrix.md).
3. Screen-08 spec and `QuantBT 08 S4 Execute Replay.dc.html`, opened in a
   browser at 1280px and 660px before composing.
4. Generated source only:
   `packages/contracts/openapi/research-replay.openapi.json` and
   `packages/contracts/generated/research-replay.d.ts`.

Generate before consuming:

```bash
npm --prefix packages/contracts run generate:research-replay
```

## One named operation

`researchReplayDetailGetV1` reads one immutable same-origin replay view. It
accepts only generated `workspace_id`, `limit` and one of opaque `cursor`,
`before`, `at`. Preserve returned revision/ETag, UTC milliseconds and exact
decimal strings. Do not define a local DTO, parse raw error strings, derive a
sequence/digest/date, call worker/source/artifact/raw-market endpoints, or
send a route/relation/revision/command input.

## Required rich-but-truthful composition

Keep the HiFi shell, layout hierarchy and responsive geometry. Substitute each
panel's content with the typed P17 state; do not replace the entire route with
an unavailable envelope.

| Generated fact / state | Screen rule |
|---|---|
| `route.state=RETROSPECTIVE_EQUITY_ONLY` | label equity chart/playhead as retrospective source sample; never call it an execution account/position state |
| `equity_replay.items` | use virtual/bounded rendering; local play/pause/step may advance already loaded samples, but must not fetch once per animation frame |
| `at` / `playback_cursor` | use only for explicit direct seek/deep link; preserve opaque token; a fresh tab must recover through one typed read |
| `sampling=EXTREMA_BUCKET_V1` | render sampling limitation; never draw interpolated bars/events between samples |
| `route_capabilities` / `source_absences` | retain the visual panel but render named typed reason; no fake orders/fills/trades/positions/candles/OCO/MAE-MFE/funding/multi-leg rows |
| `state_at_cursor.execution_state` | show it as unavailable instead of inferring from equity/P11 progress |
| `availability` / 400/401/403/404/503 | preserve shell and existing typed-error grammar; no internal prose or source field disclosure |

Reveal mode, if added, is presentation-only. It must hide future values inside
the current playhead panel without changing revision/digest/certificate; any
retrospective summary needs an explicit label. No engine compute, run action,
or command may occur on mount, seek, step, playback tick or fold change.

## Browser/HiFi receipt required

At 1280px and 660px, record a mapping:

`HiFi element / interaction / copy → component → generated field/operation →
typed state → browser assertion`.

Exercise loading, full/equity-sampled P17-A, pending, legacy, not-published,
400/401/403/404/503, ETag refresh, hard refresh/deep-link, forward/backward
seek, keyboard/focus, overflow, virtual long window and no-request-on-playback.
Keep `COMPONENT_FIXTURE_BROWSER_RECEIPT`, `PRODUCT_ROUTE_BROWSER_RECEIPT` and
`REAL_API_E2E_RECEIPT` distinct. Do not re-record a broad visual baseline to
hide unrelated drift.

Return one P17 receipt to Codex with files/line count, generated contract
revision, mapping matrix, browser command/build SHA/routes/viewports,
console/network result, test counts, source gaps and a no-debt conclusion. A
missing fact gets one focused `CG-P17-*` request with exact expected/actual
typed shape.
