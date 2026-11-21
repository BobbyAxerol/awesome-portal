# Resolved requests to Codex — P13→P16 frontend, 2026-09-23

Everything Claude needs from the backend after building Screens 04–07 and
re-auditing all three deep dives against their handoffs, specs and hi-fi.
Nothing below is worked around in the product. The three previously open
requests are now resolved through named, generated contracts or an explicit
presentation ruling; Claude still needs to consume them and return browser
receipts.

**Closed since the last round:** `CG-P13-01`, `CG-P13-02`, `CG-P14-01`,
`CG-P15-01` and `CG-P16-01`. P13 is closed by
[the run-identity / fold-navigation amendment](./P13/contract-amendment-run-identity-fold-navigation.md),
consumed at `f8e2d8cf`; the P14–P16 decisions are linked in each section.


> **All three closed and consumed, 2026-09-23 (`c650307d`).** Codex delivered
> the axis ruling, the candidate-selection-metric amendment and the
> verification scope at `ccc4c6e5`; the three screens read them at `c650307d`,
> with the ruling's required resize acceptance in the browser lane. The
> sections below are kept as the record of what was asked and why. Nothing in
> §4 has changed: no real-API receipt exists for any Research screen, the Astra
> reopened items remain backend work, and Screen 04's address is still Bobby's
> call.

---

## 1 · `CG-P14-01` — the Screen 05 time axis — RESOLVED

**Screen:** 05 Split · **Spec:** 05 §2.3 ("Trục thời gian dưới cùng: tick năm")
**Source locator:** `research-split.openapi.json` → `SplitDetail.timeline`

Spec 05's first rule is that the screen never recomputes a date. The contract
publishes one timeline range and four spans; an axis tick series is neither.
So the axis carries its two endpoints and each window's own ISO range, and no
ticks between them.

| | |
|---|---|
| **Decision** | explicit [UTC-axis presentation ruling](./P14/axis-label-presentation-ruling.md); no synthetic tick relation |
| **Published authority** | `timeline` and windows remain sole semantic boundaries; bounded UTC labels are visual only |
| **Claude action** | use UTC labels without local-time/current-time/calendar inference; test narrow/desktop label density sends no request and changes no semantic range |

## 2 · `CG-P15-01` — the candidate selection metric for a declared-not-executed request — RESOLVED

**Screen:** 06 Search · **Spec:** 06 §2 (claim row), §5-B2 (J formula)
**Source locator:** `research-search.openapi.json` → `Selection`, `RequestedOptimizer`

The hi-fi's claim row carries `candidate_selection_metric` with a
`CONFIRMED`/`INFERRED` tag. That is a property of the requested mode, not of a
trial, so it may be knowable even for a run that executed no search — but no
field carries it and `selection_trace` is `NOT_PUBLISHED`.

| | |
|---|---|
| **Published shape** | required `requested_optimizer.candidate_selection_metric`, discriminated `CONFIRMED/RUN_BOUND_ENGINE_DEFAULT` or `NOT_PUBLISHED/NONE` |
| **Current P04 value** | `NOT_PUBLISHED`, `value=null`, `P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC` |
| **Claude action** | regenerate and render the typed reason; do not infer from a mode name or mutable `robust_decay` engine-catalogue default. See [amendment](./P15/contract-amendment-candidate-selection-metric.md). |

## 3 · `CG-P16-01` — a verification result that carries its own scope — RESOLVED

**Screen:** 07 Freeze · **Source locator:** `research-freeze.openapi.json` → `FreezeVerification`

`FreezeVerification` carries `result` and `integrity` but no
`verification_scope`. The screen prints the scope beside the result a reader
just triggered — taken from the snapshot that reread. That is correct today
only because both come from the same run at the same moment.

| | |
|---|---|
| **Published shape** | required top-level `FreezeVerification.verification_scope` |
| **Server rule** | same bounded re-read supplies its own scope: `PARTIAL_MATCH/BLOCKED → PORTAL_RETAINED_DIGEST_BINDING_ONLY`, `NOT_PUBLISHED → NONE` |
| **Claude action** | render this response field beside the triggered result, not a value borrowed from a cached detail. See [amendment](./P16/contract-amendment-verification-scope.md). |

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
