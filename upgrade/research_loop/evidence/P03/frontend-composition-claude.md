# P03 frontend composition — Research panel state boundary

**Status:** `FE_PANEL_BOUNDARY_COMPLETE` · Claude · 2026-09-20
**Directive:** [P03–P06 vertical-slice brief](../../CLAUDE_P03_P06_VERTICAL_SLICE_RECOVERY_BRIEF.md)

## What was built

`apps/portal/frontend/src/research/ResearchPanel.tsx` — the boundary every
Research panel renders through, plus `ResearchValue` for a number the server
did not send.

The panel keeps its frame, header and minimum body height in every state. Only
the body changes. That is the whole claim: a screen that collapses into a
centred message when the server says *denied* has lost every other fact it was
carrying, which is the failure RL-L02 records.

| Behaviour | Why |
|---|---|
| `stale` and `partial` keep rendering children under the notice | a number an operator knows is four minutes old beats a blank where the number was |
| `denied` withholds content **and** its identifier | the reason names the refusal without confirming the object exists or who owns it |
| withheld panel is `role="alert"`, demoted panel is `role="status"` | the two are different claims and should not sound alike |
| skeleton is `aria-hidden` under one `role="status"` named *Loading* | a screen reader hears "loading", not three grey rectangles |
| every panel is a **named region** (`aria-label`) | a panel must be reachable by name, not be an anonymous box |
| actions appear only in `available`/`stale`/`partial` | see the finding below |
| `ResearchValue(null)` prints *not reported* | `0` and `—` both read as answers; neither is one |

## Finding FE-P03-01 — retaining content and being actionable are different questions

The first implementation tied action visibility to content visibility. Because
`unavailable` and `terminal` retain content, they also kept offering their
`Export` button — visible in the first browser capture. A button whose
dependency is down teaches the reader only that the button fails.

Fixed: actions require `available`, `stale` or `partial`. A test now asserts
the offered/withheld split across all ten fixture outcomes.

**This was not caught by 112 unit tests.** It was caught by looking at the
rendered page.

## Reuse

Semantics come from `researchState()` over `lib/portalState.ts` — the same
`ComponentState` vocabulary Execution uses. Execution's `PanelState` was **not**
reused: it lives in the `exec-*` Carbon namespace and importing it would pull a
dark surface into a paper one, while editing it is out of scope. One state
language, two skins.
