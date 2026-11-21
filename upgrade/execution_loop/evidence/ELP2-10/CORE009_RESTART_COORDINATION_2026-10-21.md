# Core009 clean-restart coordination —21October2026

After the delegated STREAM revoke + unaffectedREAD/denial cases finish, please
return an explicit **Edge client pause ACK** (time, no owned HTTP/SSE client
running, no further admissions until Core restart READY). Keep source28446/head3
and receipts unchanged meanwhile. Core will verify zero unresolved/unsettled
custody and sourceACK, then gracefulSIGTERM/naturalexit0/start SAMEcontainer.
No forcedkill/recreate, SQL, newtrust, sourcewindow extension or lostACK claim.

Core sessionexpires05:36:54; sourcewindow05:45. Prefer pause before05:30 to allow
one bounded post-restartREAD and exact cleanup. If unavailable, return actual
state; do not claim restart passed or create a fake pause receipt. Core helpers
preserve original rows, session/grant/policy fingerprints, runtime/image/schema.
This adds no authority beyond the already approved Research restart package.

Installed source73435311 uses normal `node dist/main.js` lifecycle, **not** old
008bootstrapIPC. Naturalexit1/recovery-required retains the original owner
obligations; no escalation toSIGKILL or timeout-based success.
