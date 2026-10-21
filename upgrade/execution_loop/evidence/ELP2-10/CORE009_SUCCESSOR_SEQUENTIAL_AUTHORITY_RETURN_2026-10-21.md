# Core009 sequential READ / STREAM renewal —21October2026

**SOURCE_FIX_IN_PROGRESS / NOT_INSTALLED / NOT_CONNECTED_READY.** Addendum to
the [first focused receipt](CORE009_SUCCESSOR_FOCUSED_GATE_RETURN_2026-10-21.md);
the sent original receipt and its logs remain unchanged.

## Real issue, reproduction and minimal fix

Independent review found that READ-only policy ADVANCE rev1→rev2 stranded the
expired STREAM predecessor at rev1. A later explicitly approved STREAM-only
KEEP rev2 was refused solely because its **historical predecessor** carried
rev1. That coupled independent app actions unnecessarily; the actual reader
requires the **new** grant to bind current policy, not history to be rewritten.

Actual regression against frozen f929 source: **17:26:16UTC,72 PASS/1 FAIL**,
failure at the new READ ADVANCE→STREAM KEEP case, typed SCOPE_REFUSED. It is a
real source bug, not a timeout/fixture failure. The old "wrong predecessor
policy is always ineligible" test was replaced by the correct sequential
semantics; new-grant wrong-policy refusal remains tested.

Minimal planner correction:

- Historical predecessor remains exact ID/revision/digest CAS, expired or
  revoked ALLOW, same owner/subject/action/domain/field policy/Paper.
- Require that predecessor's exact domain/field identity is still sealed by
  **current** reviewed policy; history alone is never current authority.
- New grant still has fresh ID/revision, current/next policy revision and
  covered finite source/operator/duration windows. All active/legacy
  constraints, target/current-user locks, no-resurrection and UNKNOWN drain
  fences remain unchanged. No route/schema/provider or action widening.
- PG regression stages READ first (STREAM denied), then explicit STREAM;
  existing READ grant, policy, sessions and historical facts stay unchanged.

Independent read-only re-review **ACCEPTS** this fix. Pure rerun17:26:37UTC:
**73/73 PASS**,633ms total. Affected PG file now has9 cases; one isolated
focused run is RUNNING, not prewritten PASS. Installer/revoke unchanged cases
will reuse their passing receipts; no redundant full regression requested.

## Obsolete normal attempt stopped, not counted as PASS

The normal hook on f929/tree0ebb94cf ran17:16:15→**17:25:26UTC**, then was
intentionally stopped after the independent source finding. Exact own timeout
PID2935508 (parent sudo2935507/controller2935478) received TERM. Terminal
**EXIT143 / ABORTED_FOR_SOURCE_FIX**, not an infrastructure failure or green
gate. No peer or runtime process was selected. Docker postcheck: zero test
containers/networks; runner trap cleaned its exact disposable resources.

Normal attempt logs/started/exit remain in the original private
`successor-focused-ClGkOc` directory. Do not overwrite or restart that script
on altered source. The prepared build controller requires matching EXIT0;
its f929 input is now superseded and **must not execute**. No image was built
or installed, no grants/session/source were created by this aborted attempt.

## Owners / next

Codex keeps this narrow writer and its tests; Claude keeps UI/observer/
financial/measurement code. No new frontend contract or mapping is needed.
Commit corrected source after PG/build/restore; freeze a fresh normal gate,
then actual image/pins before a new matched Edge source window. Old source
stays OFF. Manager issuer/financial source mappings, budget/calibration,
coexistence/G2 and real browser remain separate open gates.

Actual source refresh17:18:21UTC: Edge cc7e71f5/PM0956eaa unchanged. Edge Unified
line29317 (`original08-successor-source-intake-20261022`) acknowledges Codex
writer ownership/first focused proof and prepares artifact/CLI review, not
connected acceptance. No new Manager leaf/controlled issuer or economic-source
mapping returned. The public first-focused return was actually delivered to
both owners17:19:00UTC, SHA256
`32311edf7b5b88aa3e6ab854381fce466ebea6c75e762a0ee23a1c94645cce4f`.
This sequential correction supersedes only its source-readiness/freeze status.
