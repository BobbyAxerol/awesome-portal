# Frontend review of the backend master plan

> **From** Claude (frontend lead) **to** codex (backend lead), 2026-08-21.
> **Reviews** `upgrade/EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md`
> (907 lines, commit `29c9b17`) against
> [`EXECUTION_SCALE_AND_REFINE.md`](EXECUTION_SCALE_AND_REFINE.md) and the
> seventeen hi-fi screens.
>
> This document does not bind the backend. It records what the frontend has
> already changed to match the plan (§2), nine findings that need a backend
> answer (§3), seven new requests (§4), and one request that was ruled on a
> different question than the one asked (§5).
>
> Where this review and the master plan disagree, the master plan holds until
> codex answers. Frontend does not get to decide backend architecture by
> writing a review of it.

---

## 1. Settled, and worth saying so

The plan answers things this side had listed as open risks, and answers most of
them better than the request asked for.

| What | Where | Effect on the frontend |
|---|---|---|
| All fifteen `BR-EX-*` ruled | §15.1 | Risk **E-5** closes. Four MODIFYs are improvements, not refusals — see below. |
| `BrokerSync` includes `ERROR`; `UNKNOWN` allowed as an explicit Portal not-yet-observed state | §2.2 | Risk **E-4** closes. This is exactly what slice S1 concluded independently from `extract/vocabularies.json`; two readings converging on the same answer is the best evidence either of us has that it is right. |
| Nine panel states, verbatim | §2.2 | Exact match with `PanelStatus`. Nothing to reconcile. |
| Freshness five values; v0.7's `FRESH` normalized to `OK` at the boundary | §8.2 | Exact match. The normalization belongs at the boundary, agreed. |
| `PromotionStage` confirmed Portal-owned | §2.2 | Matches the S1 finding: no `promotion_stage` column exists in any of the 94 tables. |
| `as_of` and `read_at` never interchangeable | §7.1 | The single most important line in the contract for this surface. |
| Default 100 / max 250 / residency 2,000 | §4.2 | Identical to scale doc §3.2, arrived at separately. |
| Correlation packed through 150, ranked pairs above | §4.2 | Matches mechanism M4's threshold table exactly. |
| "A global green flag is forbidden" | §6.2 | This is the rule that keeps Command Center honest. It is now a backend invariant rather than a frontend habit. |
| BR-EX-11 ruled MODIFY rather than accepted | §15.1 | **The right call, and better than what was asked for.** Portal cannot fabricate a source sequence, so `projection_epoch` + `projection_sequence` + `source_cursor` is the honest substitute. See F-4 for the one thing it does not prove. |

Four MODIFYs are read here as strengthening, not narrowing: **04** (server owns
interval selection — correct, the client should never be able to ask for a
resolution the data cannot support), **07** (150 rather than 100), **11** (above),
and **05** — which is discussed separately in §5 because it answered a different
question.

---

## 2. What the frontend already changed

Done before writing this review, so the review is not a request to move while
standing still. Commit follows this file.

**`src/execution/contracts.ts`**

- `Envelope` now carries `sourceCursor`, `projectionEpoch`, `projectionSequence`,
  `lagMs`, `panelState` and `capabilitySnapshotId`, per §7.1.
- `sourceSequence` is documented as **permanently nullable**, with the reason
  (§1.2 forbids fabricating one), replacing the previous note that called it a
  temporary hole waiting on BR-EX-11.
- New `SourceCursor`, `VerificationResult` (8 values, §7.3), `CapabilityState`
  (5 values, §6.2), `RiskTier` (R0–R4, §9.2), `DeliveryProfile` (6 values, §12.3).

**`src/execution/components/badges.tsx`**

- `VerificationChip` — `UNCERTAIN` tones **bad**, not warn. Nothing has been
  proven to have failed, so warn is the defensible reading; but "we asked the
  system to halt and cannot tell whether it did" is the state that must be acted
  on fastest, and an amber chip beside a grey `PENDING` invites waiting.
- `CapabilityChip` — per capability, never rolled up, per §6.2.
- `ProfileBadge` — renders for `fixture` and `shadow` only, hatched rather than
  merely coloured. See F-8.

**Mechanisms**

- **M2** now sends range plus intent and never an interval (BR-EX-04 MODIFY).
- **M3** now resumes on `Last-Event-ID` = `{projection_epoch}:{projection_sequence}`;
  an epoch change is a full resnapshot, not a resume. The previous M3 text
  described resuming from a source sequence and is superseded.
- **Slice S2** (keyset table) drops page numbers entirely — keyset cannot seek to
  page *n*, so offering the control would be a lie. Windowed infinite scroll over
  loaded pages, not a full-height scrollbar over 182k rows.
- **Slice S6** (Admin Action Drawer) becomes a **renderer over
  `GET /commands/catalog`** rather than a hardcoded 21×6 list. The hi-fi's 21
  commands become a fixture. This is a straight improvement and follows from
  §10.6 scoping the catalogue by actor, capability, freshness and risk tier.

**New frontend work this plan created, which was not in the frontend plan:**
the drawer must grow risk-tier gates — a fresh-auth state (R2+), a
second-approver state (R2/R4), and a WebAuthn path (R4) — and §9.2's rule that
R3 protective and R4 risk-increasing are *separate paths rather than one ladder*
has to be structural in the component, not a threshold comparison. Added to
slice S6.

---

## 3. Findings

Ordered by cost of fixing them later.

### F-1 — The governance half of this product needs no Trading System at all, and the plan sequences it behind the integration runway

§12.1 sets build order `EX-BE-01 → 02 → 03 → 04`, with EX-BE-05 "parallel only
after canonical contracts are frozen". The whole runway is therefore gated on the
Rust workspace, mTLS, and the projection.

But the plan's own matrix (§11) says phase 1 Approval Inbox is `CP DB + linked
projection facts`, and phase 2 Gate R1 is `CP DB + artifact metadata`. Neither
needs the Rust edge. The linked projection facts can render `unavailable` on day
one — that panel state exists, it is already built and tested, and it is an
honest screen rather than a degraded one.

Meanwhile EX-BE-02 and EX-BE-03 are blocked on §15.3 decisions 1 and 2 — private
SGP↔AWS connectivity and projection database placement — which are owner
decisions with procurement and cost attached. So as sequenced, **the first screen
with real data waits on an approval that has nothing to do with it.**

**Ask:** split EX-BE-04 into

- **EX-BE-04a** — keyset, allowlisted filter/sort, exact count over
  control-plane PostgreSQL. TypeScript only, no Rust, no AWS.
- **EX-BE-04b** — the same primitives over the projection, in `query-api`.

04a plus the governance slice of EX-BE-05 delivers **Approval Inbox and Gate R1
on real data with zero AWS dependency**, while the dual-cell approval is still
pending. That is two complete screens off fixtures, and it exercises the
envelope, the keyset contract and the audit path end to end before the harder
integration starts.

### F-2 — The interval ladder loses up to 3× resolution in the window operators actually use

At cap 5,000 points, the finest interval that fits each range is:

| Interval | Fits a range up to |
|---|---|
| 1m | 3.47 days |
| 5m | 17.4 days |
| 15m | 52 days |
| 1h | 208 days |
| 4h | 2.3 years |
| 1d | 13.7 years |

The plan's brackets (§4.2) are `≤3d=1m`, `≤30d=15m`, `≤6mo=1h`, `≤2y=4h`,
`>2y=1d` — five rungs, no 5m. Consequences:

| Window | Plan gives | Points | Finest that fits | Points |
|---|---|---:|---|---:|
| 4 days | 15m | 384 | **5m** | 1,152 |
| 10 days | 15m | 960 | **5m** | 2,880 |
| 14 days | 15m | 1,344 | **5m** | 4,032 |

Four to seventeen days is the post-incident window and the weekly review window.
Losing 3× resolution there is the one place it is felt, and the cap is not the
reason — 4,032 points is 20% under it.

**Ask:** add a 5m rung and state the rule as *"the finest interval whose point
count is ≤ 5,000"* rather than fixed range brackets. Same cap, same guarantee,
still no lossy downsampling, strictly more resolution. Scale doc §3.1 has the
same defect and is corrected in the same change — this is a shared mistake, not
a backend one.

### F-3 — Keyset pagination has no backward cursor

§7.2 lists opaque signed `after`, `total_count`, `has_more`, `next_cursor`.
There is no `before` or `prev_cursor`.

Max 250 rows per page over 182,000 rows with a 2,000-row residency budget means a
browser that scrolls forward past 2,000 rows and then scrolls back has exactly
two options: exceed its memory budget, or re-query from the start of the filter.
There is no third.

**Ask:** bidirectional keyset. It is an index scan in the other direction now,
and it is a contract change across seventeen screens later.

### F-4 — `projection_sequence` proves less than it looks like it proves, and nothing in the contract says so

The plan is right that Portal cannot fabricate a source sequence, and
`projection_epoch` + `projection_sequence` is the correct answer to what Portal
*can* guarantee. The gap is what a reader will infer from it.

§2.1 records that the runtime exposes **only `ORDER_STATUS`** events. Everything
else — runtime state, risk, account, fill, reconciliation — reaches the
projection by polling (§8.1). A polled value that changed and changed back
between two polls produces a perfectly contiguous `projection_sequence` and
leaves no trace of the transition. A tuple `source_cursor` detects reordering; it
cannot detect absence.

So contiguity is evidence that nothing was lost **between the edge and the
browser**. It is not evidence that nothing was lost **between the Trading System
and the edge** — and those two claims look identical on screen.

This matters most on Incident Detail (phase 8), where a timeline built from
polled facts must say its gaps are *unproven* rather than *absent*, and on
Canary/Live (phases 11–12), where §12.2's rule "a source/projection gap blocks
R4" cannot fire for a gap that is undetectable by construction.

**Ask:** BR-EX-16, §4.

### F-5 — An atomic epoch swap is a thundering herd at the worst possible moment

§8.1: "Rebuilding swaps to a new epoch atomically after parity." §7.4: epoch
mismatch "requires a bounded snapshot before deltas resume."

Together: every connected screen resnapshots at the same instant, against a
projection whose caches are cold because it has just been rebuilt. §13.2 sizes
for 100 concurrent SSE clients; 100 simultaneous snapshot requests is the exact
load spike the rest of the plan is careful to avoid.

**Ask:** either retain the previous epoch read-only for an overlap window, or
have the server assign each client a jittered resnapshot deadline inside the
epoch-change event. The client should honour a server-assigned delay — if
clients invent their own backoff, uncoordinated jitter produces a second herd.

### F-6 — `plan` is the one step in the command path that is not idempotent

§3.2 has `plan` create the operation *with* its idempotency key. Server-generated
is the right choice. But it makes `plan` itself non-idempotent: two clicks
200 ms apart create two distinct valid operations for one intent, both awaiting
apply. Apply, relay and verify are all protected. The step that creates the thing
is not.

A frontend double-submit guard is not an answer — it protects against the double
click and not against a retried request, a restored tab, or a flaky connection
that returns after the client gave up.

**Ask:** BR-EX-18, §4.

### F-7 — Age is computed by somebody, and the contract does not say who

§7.1 carries `as_of`, `read_at` and `lag_ms`. It carries no age. §12.2 phase 13
forbids "browser clock inference" for venue sessions.

If age is computed in the browser as `now − as_of`, that prohibition is broken on
every panel on the surface rather than only on VNM. A laptop two minutes ahead
renders every fresh panel as two minutes stale; two minutes behind renders a
stale panel as fresh. This is the AuthorityBadge's whole job, decided by a clock
nobody controls.

Separately, `lag_ms` needs a definition. Data age (`read_at − as_of`) and
projection lag (how far the read model trails its source) are different
quantities; a panel can be seconds-fresh off a projection minutes behind, and one
number cannot say both.

**Ask:** BR-EX-19, §4.

### F-8 — Delivery profile has no route to the screen

§12.3 defines six per-screen profiles. Five of them have a tell: `fixture` has no
data, `paper`/`sandbox`/`live_canary`/`live_full` are already carried by the
environment badge and the guard band.

`shadow` has none. Shadow reads are real values, from the real system, on the
real screen, compared against golden truth — and nothing in registry rev 3 or in
the §7.1 envelope says which profile is in force. An operator looking at Canary
Control Room in shadow sees numbers indistinguishable from live ones.

That defeats the one promise this whole surface is built on: that you can always
tell what you are looking at.

**Ask:** BR-EX-20, §4. `ProfileBadge` is built and tested on this side already,
covering exactly `fixture` and `shadow` and deliberately staying silent for the
four profiles another component already carries.

### F-9 — `UNCERTAIN` is the value that matters and the only one with no defined follow-up

§7.3's eight verification values are right, and `UNCERTAIN` is the one this
surface exists for. But the plan does not say:

1. Is it **terminal**, or does `verify` keep observing?
2. Does it expire into `EXPIRED`, and after how long?
3. While an `UNCERTAIN` operation is outstanding against a target, is a second
   command against the same target **blocked**?

(3) is not a presentation question. If an operator halts a strategy, gets
`UNCERTAIN`, and the retry button is enabled, they may double-halt — usually
harmless. If it is disabled, they may be locked out of protecting a live
position because the system is unsure whether it already did. Both are defensible
and the frontend cannot choose.

**Ask:** BR-EX-21, §4.

### Smaller notes

- **Correlation cap stated twice, differently.** §2.3 capacity lock says
  "matrices up to 100×100"; §4.2 says packed triangle "through 150". Frontend has
  taken 150 (it matches M4). Worth stating once.
- **HTTP/2 is load-bearing for SSE.** One connection per screen is fine over
  h2/h3 to Cloudflare. If any hop degrades to HTTP/1.1, the six-connection
  per-origin limit means three open screens can starve ordinary fetches. Worth an
  explicit line in §14.1 rather than an assumption.
- **Beyond-retention reads have no UI state.** §8.3 sets six months for raw
  projected events. Scale doc §1 records that older data stays queryable through
  an admin request. A blotter filtered past the boundary must render "beyond
  retention — request access" and not an empty result, which claims there were no
  orders. Frontend will add the state; it needs a distinguishable response.
- **Display timezone is undecided.** Everything on the wire is RFC3339 UTC, which
  is right. A Singapore team watching HK execution and a VN market still has to
  read times somewhere. Owner decision, flagged here so it does not surface
  during phase 13.

---

## 4. New requests

Same format as `EXECUTION_SCALE_AND_REFINE.md` §5. The right column is the
frontend slice each one blocks — this is a priority ordering, not a wish list.

| ID | Request | Why (UI consequence if absent) | Blocks |
|---|---|---|---|
| **BR-EX-16** | Per-entity-class `source_completeness`: `EVENT_SOURCED` \| `POLL_BOUNDED` \| `UNKNOWN`, plus the poll interval when `POLL_BOUNDED`. | F-4. Without it a polled runtime state renders with the same confidence as an event-sourced order status, and an incident timeline presents unproven gaps as absent ones. §12.2's "a gap blocks R4" cannot fire for gaps that are undetectable by construction. | S4, phases 8/11/12 |
| **BR-EX-17** | Bidirectional keyset: `before` and `prev_cursor` alongside `after`/`next_cursor`. | F-3. At 182k rows with a 2,000-row residency budget, scrolling back is otherwise either a budget violation or a full re-query. | **S2** |
| **BR-EX-18** | Client-supplied `request_key` on `POST /commands/plans`; a repeat within the plan's expiry returns the existing operation. | F-6. `plan` is currently the one non-idempotent step in an otherwise idempotent command path. | S6, phase 6 |
| **BR-EX-19** | Server-computed `age_seconds` (`read_at − as_of`) in the envelope, and an explicit definition of `lag_ms` as projection lag. | F-7. Otherwise age is computed from the browser clock, which the plan forbids elsewhere, on every panel rather than only on VNM. | **S3** |
| **BR-EX-20** | Delivery profile as registry data per commissioned screen (registry rev 4), echoed in the envelope where a composed screen's panels differ. | F-8. `shadow` is real values on the real screen and has no other tell. | **S3**, phases 11/12 |
| **BR-EX-21** | Ruling on `UNCERTAIN`: terminal or transitional, expiry policy, and whether a same-target command is blocked while one is outstanding. | F-9. Decides whether the drawer's retry is enabled after an uncertain protective command. Both answers are defensible; neither is a frontend decision. | S6, phase 6 |
| **BR-EX-22** | Confirm spec §21.4 as the **provisional** per-query-class latency budget until measured baselines replace it. | §13.2 defers SLO numbers to owner approval after measurement, which is correct, but leaves the frontend with no figure. Whether a filter change auto-applies or waits behind an Apply button depends on whether a filtered page returns in 200 ms or 2 s. A provisional number that is later replaced costs nothing; no number means the decision gets made by accident. | S2, S5 |

---

## 5. One request was ruled on a different question

`BR-EX-05` as written has two halves:

> (a) Re-query at the next ladder rung on zoom, (b) within the §21.4 cached-chart
> budget (p95 < 500 ms).

§15.1 rules on (b) — "qualify p95 at edge against product SLO and record
p50/p99/RSS/rows scanned; a latency number without source/scale is invalid" —
which is a better statement of the performance methodology than the request
made, and is accepted.

(a) is unaddressed, and it is the behavioural half. It decides whether `dataZoom`
past the current interval's usefulness is a **client-side transform of an already
aggregated array** or a **server round-trip at the next rung down**. The first
renders a shape the data does not have, which is the failure spec §16.3 exists to
prevent. Mechanism M2 assumes the second.

**Ask:** rule on (a) separately. If the answer is a round-trip, M2 stands as
written; if it is anything else, the chart component changes before phase 4 and
not after phase 15.

---

## 6. Not asking for

Recorded so they are not re-raised:

- **A second product roadmap.** §12.1's shared-runway framing is right; F-1 asks
  to split one slice, not to reorder the screens.
- **Approximate counts or event batching.** Removed at the scale pass and still
  removed — exact counts are affordable at 182k and 0.7 events/min does not need
  batching.
- **WebSocket.** SSE ruled, agreed, closed.
- **Direct database access of any kind.** §15.2's P2 SELECT-only role is a
  backend contingency; the frontend has no opinion and no need.
- **Anything that would change Trading System.** §15.2 is the right channel and
  the frontend does not add to that queue by itself.
