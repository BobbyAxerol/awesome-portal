# P23 F5 — real server-side session-revocation harness

2026-09-30 · Codex · `docs/research-loop-plan` · **SCOPED PASS 4/4 / full F5 OPEN**.

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
under the P23 runtime directory. Neither is counted as acceptance evidence.

After commit `38f3ab5e16e51b0e8b11f52602969dee9c6fa42f` passed the full
repository hook (175 Control API files, 1,349 tests passed, one environment
skip), the cell recorded `dirty:false` and the exact seven runnable image IDs.
The prior image IDs were reused: this commit changed only the P23 harness and
Markdown, none of the Dockerfile `COPY` inputs. The clean-source browser run
passed **4/4** (S02 and S14 at both widths): every POST returned typed 401
`SESSION_REQUIRED` after a real logout revoked the server session; browser
cookies remained present until the action. Visible `SESSION_EXPIRED` copy,
deep links, unmounted protected screens, 0 page errors, 0 off-origin requests
and 0 px horizontal overflow were verified. Jobs stayed **194→194**.

Private mode-0600 receipt:
