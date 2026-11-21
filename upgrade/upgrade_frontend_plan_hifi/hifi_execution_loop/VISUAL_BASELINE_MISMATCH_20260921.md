# Visual baseline mismatch — classification and evidence

**Author:** Claude · 2026-09-21 · **Not a P10 artifact.** P10's own gates are
green and its failure set is identical to the pre-existing one; this file
exists so the 33 mismatches are owned by someone rather than carried along.

**Nothing was re-recorded, no threshold was widened, and no Tailwind
configuration was touched while producing this.**

## The result

`npm run e2e:visual` at `4b90eea7`: **exit 1 — 33 failed / 299 passed**, 25
distinct test names across three specs.

| spec | failures |
|---|---|
| `execution-fixtures.spec.ts` | 21 |
| `visual.spec.ts` | 7 |
| `execution-journeys.spec.ts` | 5 |

## The decisive measurement

The failing subset was run in a clean worktree at **`6fbe5a7c`** — the commit
whose message is *"fix(ci): stabilize CodeQL and execution visual baseline"* and
which last wrote the `execution-fixtures` snapshots — with the same
`node_modules` and on the same host.

```
8 failed / 9 passed
✘ execution fixtures @ laptop      › lifecyclerail
✘ execution fixtures @ workstation › lifecyclerail
✘ execution fixtures @ laptop      › charttile
✘ execution fixtures @ workstation › charttile
✘ research theme   › planning-reports @ tablet, @ mobile
✘ operations theme › planning-reports @ tablet
✘ research theme · research › run-overview @ laptop
```

**The baselines do not reproduce on this host at the commit that recorded
them.** That is the whole finding. No code change since is implicated, because
the mismatch exists before any of them.

`6fbe5a7c` also **precedes** `7441c572`, so the Tailwind content-glob change
cannot be the cause either.

## What was ruled out, and how

| Hypothesis | Measurement | Verdict |
|---|---|---|
| Flake, load, nondeterminism | same test run twice, `actual` PNGs hashed | **byte-identical** — not flake |
| The Tailwind content glob (`7441c572`) | failure set before/after codex's safelist; and the bisect above | **unchanged**, and fails at an earlier commit — not the cause |
| Missing or CDN-delivered fonts | `fonts.googleapis`/`gstatic` aborted, element re-hashed | **byte-identical** — fonts are self-hosted via `@fontsource`, nothing is fetched |
| Fonts not actually rendering | `document.fonts.load()` then measured | Inter `1328` vs absent-font `1138.53`; `Inter`, `Newsreader`, `JetBrains Mono` all `loaded`; **0 failed font requests** |
| A different Playwright or Chromium | `package-lock.json` | `1.62.1` pinned since **2026-09-08**, before every baseline |
| P09 / P10 frontend work | failure set vs a clean worktree at `cac85b43` | **identical by name**, `comm` empty both directions |

### Two corrections to earlier reports

1. The P09 packet proposed `7441c572`'s Tailwind glob as the probable cause.
   **That was wrong.** Codex's safelist replacement changed the failure set by
   zero tests, and the mismatch reproduces at a commit that predates the glob.
2. An intermediate measurement here suggested Inter was falling back. **That was
   also wrong** — the probe measured a span before any element had triggered the
   web font, so it read the fallback. Forcing `document.fonts.load()` first
   shows every family resolving correctly.

Both are recorded rather than quietly dropped, because the first one is already
written into the P09 evidence and someone will otherwise act on it.

## Classification of the 33

Artifacts regenerated at `4b90eea7`; `actual` and `expected` compared pixel
dimensions.

| group | count | signature |
|---|---|---|
| **A — rasterisation only** | 23 | identical dimensions, diff ratio 0.01–0.02 against a 0.002 threshold |
| **B — one- to two-pixel reflow** | 9 | height differs by 1–2 px |
| **C — accumulated reflow** | 1 | `phase-2-gate-r1-review-states-only`, 4159 vs 4205 px |

Group C was traced to its first differing row (230): the line
`ALPHA VERSION  av_2041 · supersedes av_1988 ✓ verified` **wraps to two lines in
the baseline and fits on one here**. The text is identical; only its measured
width differs, and the changed wrap point accumulates down the panel into 46 px.

That single case explains the whole family: a sub-pixel difference in text
advance width, large enough to move a wrap point, produced by a text stack that
is not the one the baselines were recorded against.

## What this costs today

The gate cannot detect a real regression. Thirty-three shots are red before any
change is made, so a genuine break lands in the same pile and is indistinguishable
from it. That is worse than having no gate, because the red is routinely
explained away.

## The decision, for the visual owner

Not mine to take: the failing shots are Execution and Planning screens outside
the Research scope, and re-recording them would absorb a difference nobody
reviewed.

Two honest options:

1. **Re-record on the environment the gate will actually run on, and pin that
   environment.** A container image with a fixed Chromium and font stack, used
   both to record and to verify. Baselines recorded anywhere else will drift
   again the first time the host differs.
2. **Move the gate into that container** and leave the baselines alone.

What must not happen: `--update-snapshots` on a developer host. It would make
the suite green by adopting whatever this machine renders, and the next host
would be red again for the same reason.

## Reproduce

```bash
cd apps/portal/frontend
npm run e2e:visual                     # 33 failed / 299 passed at 4b90eea7

git worktree add --detach /tmp/vb 6fbe5a7c
ln -s .../node_modules /tmp/vb/apps/portal/frontend/node_modules
cd /tmp/vb/apps/portal/frontend
npx playwright test -g "lifecyclerail|charttile|run-overview|planning-reports"
# 8 failed / 9 passed — the baselines fail at their own recording commit
```
