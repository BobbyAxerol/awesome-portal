# P05 frontend handoff — durable artifact states; original backend slice had no new screen

> **Coordination amendment — 2026-09-20.** The missing named DTO/download
> action still blocks only data/action activation. It no longer blocks
> HIFI-preserving artifact panel composition from the frozen state contract;
> follow the [P03–P06 contract-first vertical-slice brief](../../CLAUDE_P03_P06_VERTICAL_SLICE_RECOVERY_BRIEF.md).
> Fixtures may be used only in the isolated visual/test lane and may never
> appear as product truth.

The original P05 **backend** slice changed no browser route or UI/UX code. Its
output remains the server-side consumer contract for P09/P11; the present
recovery slice may compose panels from it, but must not create a direct
filesystem, database, Python-worker or Rust-reader browser path.

## Consumer boundary

- Browser talks only to a named same-origin Control-API DTO once P10/P11
  publish it. It never receives artifact storage paths, raw relation cursors,
  HMAC keys, lease epochs, worker identities or database locators.
- Treat `WRITING`, `SEALED`, `CORRUPT`, `MISSING` and `ABORTED` as exact typed
  states. There is no P05 `READY` state.
- A filesystem-sealed candidate is not automatically a database `SEALED`
  artifact. Do not render a download/action from an unregistered candidate.
- Preserve UTC milliseconds and exact decimal strings. Do not parse opaque IDs
  or recreate totals by loading a whole table in the browser.

## Future rich-panel behavior

Keep the approved HIFI composition. Alter only panel truth:

- `WRITING`: show bounded progress/partial evidence if a later DTO explicitly
  supplies it; no "complete" badge or download.
- `SEALED`: show manifest revision, row/byte/coverage metadata and a server
  scoped export action when P10/P11 publish one.
- `CORRUPT` / `MISSING`: retain the panel with the exact typed integrity state;
  remove the unsafe download/action and do not substitute generic fixture data.
- `ABORTED` / denied / unavailable: retain context and server-provided reason;
  never imply a retry, scheduler, or permission the backend has not admitted.

## Required future tests

1. Same-origin DTO only; browser attempts no direct path/data/engine request.
2. Sealed, writing, corrupt, missing, aborted, denied and unavailable panels
   preserve the approved layout and exact state label.
3. Download/action is absent for every state except an explicit server-admitted
   sealed export.
4. Decimal/null/UTC formatting round-trips without float conversion.
5. Cursor/row limits stay server-owned; no full-artifact client preload.
