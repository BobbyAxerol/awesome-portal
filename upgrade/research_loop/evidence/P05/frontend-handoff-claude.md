# P05 frontend handoff — durable artifact states, not a new screen

P05 changes **no browser route and no UI/UX code**. Its output is a future
server-side consumer contract for P09/P11. Do not create a direct filesystem,
database, Python-worker or Rust-reader browser path.

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
