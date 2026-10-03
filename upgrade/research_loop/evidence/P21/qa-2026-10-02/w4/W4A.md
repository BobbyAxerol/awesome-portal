# W4A — shared primitives + S00–S03 (fewer words)

Status: primitives + S00-S03 landed (uncommitted, base bfbf5ca4). Other groups import these exact signatures
(all under `apps/portal/frontend/src/research/`).

## humanise.ts
```ts
export function humanise(token: string | null | undefined): string; // null/undefined/"" -> ""
```
- `walk_forward_oos` -> `walk-forward OOS`; `COMPLETED` -> `completed`; `NOT_ISSUED` -> `not issued`.
- Acronyms OOS / IS / UTC / WFO / RC kept upper (`IS` only when not the first word).
- Known phrases: `not_causal_multi_fold_global_calibration` -> `not causal · multi-fold · global calibration`;
  `three_window_decay|three_window_current` -> `three-window`; `per_fold_causal` -> `per-fold causal`.
- A string that is not a bare enum token (spaces, punctuation, ids with hex tails) is returned unchanged.
- Replaces `humanToken` (reportText.tsx; left in place, not my file) and the inline `.toLowerCase().replace(/_/g," ")`.

## formatValue.ts
```ts
export const formatValue: {
  utc(ms: number): string;                       // "2026-10-02 16:31 UTC"; non-finite -> ""
  number(value: string | number, o?: { dp?: number; unit?: string }): string;
};
export const utc: typeof formatValue.utc;  export const number: typeof formatValue.number;
```
- `number`: never a raw float, U+2212 for negatives, no `-0.00`. Default dp 2 (3 for unit `ratio`).
  Known units (`currency|fraction|percent|count|bars|seconds|ratio`) follow `researchFormat.formatMetric`;
  any other unit string is appended after a space. A non-numeric string is returned unchanged.

## Absence.tsx
```tsx
export function Absence(p: { reason: string | null; state?: string; what?: string }): JSX.Element;
export function AbsenceSummary(p: { column: string; reason: string | null; count: number; total: number }): JSX.Element;
export const ABSENCE_SHORT: Record<string, string>;  // allowlist, reason code -> short visible sentence
```
- `Absence`: visible = allowlist sentence for the code (else the state phrase: NOT_PUBLISHED `not published`,
  NOT_APPLICABLE `n/a here`, PENDING `pending`, NOT_READ `not loaded`, NOT_DECLARED `not set`; unknown -> `not published`);
  with `what` the visible text is `what · phrase`. Tooltip (`title`, and `aria-label`) = researchRefusal sentence for the
  code + the code in brackets; `data-reason-code`, `data-not-published`, `tabIndex=0` (keyboard reachable). Never invents codes.
- `AbsenceSummary`: ONE caption line `seed · not published` (or `seed · not published in 7 of 100` when count < total);
  code in tooltip.

## PageHeader.tsx
```tsx
export function PageHeader(p: {
  title: ReactNode;
  prev?: { label: string; href: string };
  next?: { label: string; href: string };
  copy?: boolean;           // copy-link icon button (aria-label "Copy link")
  children?: ReactNode;     // extra lines under the h1 (status, chips)
}): JSX.Element;
```
- No breadcrumb (the top bar shows the path). One `<h1 data-page-title>`. `← prev · next →` in a `<nav aria-label="Previous and next">`;
  links carry `data-action="page-prev|page-next"` and get a 44 px hit area at <= 720 px (researchScreenTouch.css).

PageHeader note: links render as react-router `<Link>` inside a Router and as a plain `<a>` outside one.
`researchScreenTouch.css` gained `a[data-action="page-prev|page-next"]` in the 44 px mobile tier (shared file, 2 lines).

## Screens (what changed)
- S03 RunProgress: finished run console = last 10 lines + `show all (N)` / `show last 10` (`data-action="console-show-all"`, `CONSOLE_TAIL`);
  PageHeader (`← Library · Evidence Flow →`, copy link, no crumb); claim chips/seal humanised (`humanise`), seal = `sealed` + tooltip, hand-off cursor field removed
  (it is the open-evidence button's label); completion banner removed (stage pills already link); transport label of a closed stream is sr-only + tooltip;
  no `eta none`, no tqdm line on a final run; global-study identical per-fold selection printed once (`data-shared-selection`, needs >= 3 identical done folds);
  failure printed once (code in tooltip, no `details`); `holdout sealed` (sentence in tooltip); artifact sha in tooltip only. RunMetaStrip gained `omitRunStatus` (drops the `run <id>` span only; the status chip stays - W1 tests and live runs need it).
- S01 RunLibrary: breadcrumb removed; no claim line on a card with no claim to quote (`not-issued|pending|failed|cancelled` keep a hidden `data-claim-kind` marker; the ledger carries the counts);
  evidence-trail label is the group's aria-label; alpha version and mode shared by every card are said once beside the counter (`data-common-binding`, `data-common-mode`);
  all-time absence = `no series` (no `all time` label); final-30D pair omitted when `partial_window` (it equals the all-time pair); rc approval words humanised; `+ new run` (dropped `preflight first`).
- S00 JourneyMap: PageHeader (no crumb), `pick a run →` x13 -> tooltip + aria-label with one header hint `Cards open after you choose a run.`; legacy `NN · ` card numbers dropped.
- S02 NewRun: unvisited step prints no caption; claim forecast: no `payload sha256 · after preflight`, claim token humanised; clone banner `copied from <run>` (intent sentence in tooltip);
  folded preflight line `preflight not run`; the third `Run preflight first.` copy removed (button tooltip remains); estimate error line without status/code (tooltip); optimizer-defaults words via humanise.
  The rail already printed no ReviewRows off the Review step (W2).

## Not done / partly
- S03: EVIDENCE CURSOR card kept (it is the per-fold open-evidence control); queue/attempt strip kept (already a collapsed `<details>`); status chip beside the h1 word on terminal runs kept.
- S01: `FAILED AT / REASON / RUNTIME` labels are server metric labels; header `claim ledger` label kept (test + bar caption).
- S00: server descriptor v3 text unchanged (card descriptions were already tooltip-only; mapping section already gone).
- S02: windows/data step sentences (`single: not admitted…`, regex pattern line, `1min · 5min … not declared`) not touched in this pass.
