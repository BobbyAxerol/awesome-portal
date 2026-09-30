# P23 F5 — real server-side session-revocation harness

2026-09-30 · Codex · `docs/research-loop-plan` · **HARNESS READY / clean-source receipt pending**.

`scripts/research-p23/f5-browser-revocation.mjs` tests S02 and S14 at 1280 and
660 px in the owned `portal-research-p23-ol12` cell. It logs in through the
real Portal API, loads each screen, then sends a separate real logout request
with the same session cookie. This revokes the database session while Chromium
deliberately retains its stale cookie. Each UI action must receive typed 401
`SESSION_REQUIRED`, show the `SESSION_EXPIRED` frame, preserve the deep link,
remove the protected screen, avoid raw server-message copy, and create no job.

An initial debug run failed 0/4 because Playwright filtered a secure `__Host-`
cookie when queried with the cell's HTTP URL. The harness now reads the whole
browser cookie jar and checks the named session cookie; the following debug
run passed 4/4 with jobs 194→194. Both private debug receipts are retained
under the P23 runtime directory. Neither is a clean-source acceptance receipt:
the harness was not yet committed and the cell still identified an earlier
candidate. A clean-tree identity and rerun are required before marking this
subgate PASS. Real typed 502 and full F5/P23/P24 remain OPEN.
