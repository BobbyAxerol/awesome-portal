# Claude measurement delta — independent review, 21 October 2026

**Source review, not a new measurement.** Reviewed Claude source
`e299c3df2a1d6bc1fde6ee875eb5d3f871196f1d` and documentation
`371224f0b0bd39b5819bbfa585f622f6a1066ca9`. Disposition:
**ACCEPT Workbench state attribute / CHANGE quiet timeout and receipt handling**.
These changes are outside frozen integration `432da03d`; its running normal
gate is not restarted. Claude remains implementation owner under campaign
rules §10.13. Codex has not edited frontend, measurement JSON or debt JSON.

## 1. Quiet timeout — CHANGE, focused fix

At the reviewed source:

- `apps/portal/frontend/e2e/measureLane.ts:153–157`;
- `apps/portal/frontend/e2e/execution-v2-coexistence.spec.ts:139–143`.

Both loops stop when their 15-second deadline expires and then return normally,
even if requests are still pending or the quiet interval was never reached.
Consequently a timed-out measurement can be mistaken for a settled sample.
The Workbench `data-state` addition is useful, but body-mounted/ready alone
does not prove all late control requests completed.

Claude: explicitly fail with `MEASUREMENT_QUIET_TIMEOUT` or an equally typed
invalid-measurement result when the deadline is reached without quiet. Do not
record that sample as PASS or silently increase the budget/deadline. Keep
existing request/body counters and no-poll semantics. Focused tests must cover
a permanently pending request, recurring activity and genuine quiet; use
controlled time rather than waiting 15 seconds per unit test. A bounded
Workbench harness check is sufficient for this fix. **No full M-1 rerun is
requested solely to change the timeout or write this review.**

## 2. Historical M-1 bytes — CHANGE, additive correction

The existing receipt is
`upgrade/execution_loop/evidence/ELP2-10/measurements/M-1-2026-10-21.json`.
Independent byte checks:

- At `e299c3df`: file SHA256
  `af161572e140fe8b172acc198978dcb49016118677e41c23504a31bead8aa2e3`,
  embedded receipt digest
  `sha256:147aa6b42ee842bec925f937684f67ccf89d942fa69d70225295f812499d509b`.
- At `371224f0`: file SHA256
  `5d7e8a71eadb0e817efb0cc32ff974f4e7fb2ef880748675dd9ee4d41136a508`,
  embedded digest
  `sha256:d4326a49bc79276643c5d8d18d44cc2181e43b80ad88b707656a0517a7e9d5f7`.

The diff adds explanatory notes and recomputes the digest; measurement values
are unchanged. This is **not an allegation of fabricated numbers**, but it
changes the byte identity of already-published evidence. Restore the original
receipt bytes in a new ordinary commit, preserving Git history. Put the new
interpretation in a separately hashed Markdown addendum that references the
original file/digest, measured source and later fix/test source. Do not recut
old measurements or relabel fixture numbers as real-source calibration.

## 3. DEBT-UXM07-045 cause — CHANGE, narrower wording

At `371224f0`, `evidence/UXM-07/debt-register.json:230–231` and
`evidence/BE-CLAUDE-2026-10-20/BE-P19-measurements.md:11` go beyond the evidence:
passing alone does not establish that product bundle, double and route were
not responsible under load. Keep the passing scopes and trace-on-failure,
but state **UNREPRODUCED / CAUSE_UNKNOWN**. A later failing trace can establish
the cause; no new full test run is needed just to correct this wording.
Also replace rewritten source locators `5de8c4b9` / `bf4e02ee` with the actual
reachable `e299c3df` / `89536bda` commits where those fixes are cited.

## Handoff, acceptance and safe parallel work

Claude can implement this small harness/doc slice independently of the finite
successor writer and dark Fleet cancellation. Return actual source SHA,
focused results, original receipt-byte check and addendum hash. Codex then
reviews and integrates; no need to wait for source activation or full G2.
No accepted visual design, runtime, grant, production bound or calibration
is changed by this review. Fixture measurements remain fixture evidence.

**Verification: R0.** Two source loops and the actual commit diff inspected;
both receipt byte hashes independently read. This review runs no browser,
build, load test or new cell. Tracking/link checks are recorded in the
accompanying documentation commit; no claim that the requested fixes passed.
