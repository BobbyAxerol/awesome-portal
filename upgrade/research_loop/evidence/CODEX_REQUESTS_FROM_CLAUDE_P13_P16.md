# Open requests to Codex — P13→P16 frontend, 2026-09-23

Everything Claude needs from the backend after building Screens 04–07 and
re-auditing all three deep dives against their handoffs, specs and hi-fi.
Nothing below is worked around in the product: each gap is a visible, typed
absence on screen today.

**Closed since the last round:** `CG-P13-01` and `CG-P13-02`, by
[the run-identity / fold-navigation amendment](./P13/contract-amendment-run-identity-fold-navigation.md),
consumed at `f8e2d8cf`.

---

## 1 · `CG-P14-01` — the Screen 05 time axis

**Screen:** 05 Split · **Spec:** 05 §2.3 ("Trục thời gian dưới cùng: tick năm")
**Source locator:** `research-split.openapi.json` → `SplitDetail.timeline`

Spec 05's first rule is that the screen never recomputes a date. The contract
publishes one timeline range and four spans; an axis tick series is neither.
So the axis carries its two endpoints and each window's own ISO range, and no
ticks between them.

| | |
|---|---|
| **Expected** | either a published tick/label set for the axis, **or** an explicit ruling that generating axis labels from `timeline` is presentation rather than a computed boundary |
| **Actual** | neither; the axis is honest and sparse |
| **What the screen does meanwhile** | endpoints + per-window ISO ranges, no derived dates |

## 2 · `CG-P15-01` — the candidate selection metric for a declared-not-executed request

**Screen:** 06 Search · **Spec:** 06 §2 (claim row), §5-B2 (J formula)
**Source locator:** `research-search.openapi.json` → `Selection`, `RequestedOptimizer`

The hi-fi's claim row carries `candidate_selection_metric` with a
`CONFIRMED`/`INFERRED` tag. That is a property of the requested mode, not of a
trial, so it may be knowable even for a run that executed no search — but no
field carries it and `selection_trace` is `NOT_PUBLISHED`.

| | |
|---|---|
| **Expected** | a typed `candidate_selection_metric` (with its confirmed/inferred provenance) on `requested_optimizer`, **or** a ruling that a `DECLARED_NOT_EXECUTED` request publishes no metric |
| **Actual** | neither; the metric chip and the formula panel are both absent |
| **What the screen does meanwhile** | nothing is inferred from the mode name |

## 3 · `CG-P16-01` — a verification result that carries its own scope

**Screen:** 07 Freeze · **Source locator:** `research-freeze.openapi.json` → `FreezeVerification`

`FreezeVerification` carries `result` and `integrity` but no
`verification_scope`. The screen prints the scope beside the result a reader
just triggered — taken from the snapshot that reread. That is correct today
only because both come from the same run at the same moment.

| | |
|---|---|
| **Expected** | `verification_scope` on `FreezeVerification` itself |
| **Actual** | absent; scope is borrowed from the snapshot |
| **Why it matters** | a re-read is the one action on this surface, and its answer should carry the qualification that belongs to it rather than one inherited from a different document |

---

## 4 · Standing items, not new requests

| Item | Owner | State |
|---|---|---|
| `REAL_API_E2E_RECEIPT` for Screens 01–07 | backend + Bobby | every Claude lane is fixture-backed and labelled `PRODUCT_ROUTE_BROWSER_RECEIPT`; no backend has been called |
| Astra `AUDIT_REOPENED` items — P13 A01/A02/A04/A05/A07, P14 A03, P15 A09, P16 | Codex | not closed by any screen; the screens render whatever the remediated contracts publish |
| Screen 04's route address | Bobby | Screen 04 sits at `/runs/:runId/evidence`; spec 04 §1 names `/runs/{id}`, held by the approved legacy workspace. One line to move if wanted |
| Screen 08 (P17) | Claude, next | until it exists, Screen 04's execute tab and Screen 07's next-stage stay refused affordances |
| `foundation.test.tsx`, `tradeReplayEvents.test.tsx` | — | each failed once under parallel load and passed in isolation; logged as flakes, not patched, in files this campaign never touched |

## 5 · What the audit changed on our side (no backend needed)

Re-reading the handoffs against the built screens found published facts that
were rendered nowhere. Fixed at `bdeb0268`, no contract change required:

- provenance (adapter, engine, input scope, every digest) was missing from all
  three deep dives;
- `windows.holdout.result_exposure_state` (S05), a window's `evaluation_state`,
  the frozen table's `bound_state`, `readiness` and the verification's
  `freeze_revision` (S07), and `readiness` (S06) were all unread;
- spec 07's title and `verify now` button copy were paraphrased;
- spec 07's two-clock note and spec 06's "mode is fixed at submit" were absent;
- the hard-refresh, keyboard-name and ETag/304 checks each handoff requires had
  not been written for S05–S07.

Spec 07's subtitle is deliberately **not** rendered: "Selection closed before
any out-of-sample bar was read" asserts the ordering this source states it does
not assert. The file says so where the string would have gone.
