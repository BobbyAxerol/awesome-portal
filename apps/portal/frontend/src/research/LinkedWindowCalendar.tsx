/**
 * S02 linked-window setup: the Three Window range as one calendar with four linked edges.
 *
 * IS = [A, B), OOS = [B, C), Holdout = [C, D): B is both the IS end and the OOS start, C both the OOS end and the
 * Holdout start, so one instant is typed (or dragged) once and one `onChange` patch carries it. Every boundary is a
 * half-open UTC end-exclusive instant. The precise inputs (`InstantInput`, the form's own UTC input) stay; the
 * proportional track adds two slider handles (B, C). A drag is a local preview and commits once, on release; each
 * key on a focused handle is one atomic patch (the caller debounces whatever it asks the server).
 *
 * Tab stops: the four inputs plus the two handles. The handles are controls, not a chart region, so the chart
 * contract's one-stop rule does not apply; each is a `role="slider"` with a UTC `aria-valuetext`.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { DateInput } from "./DateInput";
import { InstantInput, inputStyle } from "./InstantInput";
import {
  barCount,
  ceilDay,
  DAY_MS,
  DAY_SPLITS,
  dayLimits,
  dayUnit,
  edgeLimits,
  floorDay,
  splitOfDays,
  EDGE_KEYS,
  msAt,
  msToInstant,
  orderedEdges,
  parseEdges,
  percentOn,
  splitSeventyTwentyTen,
  trackAxis,
  snapEdge,
  spanOn,
  stepEdge,
  utcLabel,
  type EdgeKey,
  type EdgeStrings,
} from "./windowGeometry";

export interface LinkedWindowCalendarProps {
  /** The draft's UTC instant strings; "" when empty. */
  edges: EdgeStrings;
  /** One patch per edit. Editing B changes the IS end and the OOS start together: the caller maps `b` to both. */
  onChange(next: Partial<Record<EdgeKey, string>>): void;
  /** Bar size of the timeframe in ms, for stepping and snapping; null = no stepping help. */
  barMs: number | null;
  /** The verified data range (epoch ms): the track axis (padded 1%); A may not precede `from`, D may not pass `to`; also the base of the Last N d presets. */
  range?: { from: number; to: number } | null;
  /** Served coverage on the same clock (epoch ms): drawn as a faint band. */
  coverage?: { from: number; to: number } | null;
  /** Bars the bound version declares before the IS start. */
  warmupBars?: number | null;
  /** The profile's maximum span (`max_span_days`) in ms. */
  maxSpanMs?: number | null;
  errors?: Partial<Record<EdgeKey, string>>;
  /** Edges that read as wrong without a message of their own (the message is printed once elsewhere). */
  invalid?: Partial<Record<EdgeKey, boolean>>;
  disabled?: boolean;
  /** Per-edge slot for a typed refusal line (the estimator's refusal naming that field). */
  fieldRefusals?: Partial<Record<EdgeKey, ReactNode>>;
  /** Prefix for element ids. */
  idPrefix: string;
  /**
   * "day" (default): whole UTC days. Date inputs, one-day steps, drags snap to UTC midnight, quick picks.
   * "exact": the datetime-local inputs, bar/minute steps and the 70/20/10 + Last N d presets as before.
   */
  granularity?: "day" | "exact";
  /** Day mode: the server's suggestion as day edges (`suggestionToDayEdges`); a `Recommended` chip applies exactly these four edges. */
  recommended?: Record<EdgeKey, string> | null;
}

const LABEL: Record<EdgeKey, string> = {
  a: "IS start (A)",
  b: "IS end · OOS start (B)",
  c: "OOS end · Holdout start (C)",
  d: "Holdout end exclusive (D)",
};
const ROLES = [
  { key: "is", label: "IS", tone: "var(--role-is)", from: "a", to: "b" },
  { key: "oos", label: "OOS", tone: "var(--role-oos)", from: "b", to: "c" },
  { key: "holdout", label: "Holdout", tone: "var(--role-holdout)", from: "c", to: "d" },
] as const;
/** WCAG 2.5.8 target size. */
const HANDLE = 24;

function days(ms: number): string {
  return `${Math.round((ms / DAY_MS) * 10) / 10} d`;
}

interface Drag {
  edge: EdgeKey;
  origin: number;
  now: number;
}

export function LinkedWindowCalendar({
  edges,
  onChange,
  barMs,
  range = null,
  coverage = null,
  warmupBars = null,
  maxSpanMs = null,
  errors = {},
  invalid = {},
  disabled = false,
  fieldRefusals = {},
  idPrefix,
  granularity = "day",
  recommended = null,
}: LinkedWindowCalendarProps) {
  const day = granularity === "day";
  const unit = day ? dayUnit(barMs) : null;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDragged = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const ms = parseEdges(edges);
  const ordered = orderedEdges(ms);
  /* While a handle is dragged the preview replaces its edge locally; nothing leaves the component until release. */
  const preview = drag && ordered ? { ...ordered, [drag.edge]: drag.now } : ordered;
  const shownEdge = (key: EdgeKey): string => (drag && preview && (key === drag.edge) ? msToInstant(drag.now) : edges[key]);

  /* The axis is computed from the committed edges, never the preview, so the track does not rescale under a drag. */
  const known = EDGE_KEYS.flatMap((key) => (ms[key] !== null ? [ms[key]!] : []));
  const drawn = known.length > 0 ? { from: Math.min(...known), to: Math.max(...known) } : null;
  const axis = trackAxis(drawn, range, coverage);
  /* Day mode: the last full verified day is the D ceiling and the first midnight the A floor; a span cap is whole days. */
  const lastDay = range ? floorDay(range.to) : null;
  const bounds = day
    ? { range: range ? { from: ceilDay(range.from), to: floorDay(range.to) } : null, maxSpanMs: maxSpanMs !== null && maxSpanMs > 0 ? floorDay(maxSpanMs) : maxSpanMs }
    : { range, maxSpanMs };
  const limitOf = (edge: EdgeKey, o: { a: number; b: number; c: number; d: number }) => {
    const lim = edgeLimits(edge, o, barMs, bounds, unit);
    return day ? dayLimits(lim) : lim;
  };
  const limits = ordered ? { a: limitOf("a", ordered), b: limitOf("b", ordered), c: limitOf("c", ordered), d: limitOf("d", ordered) } : null;
  const span = ordered ? ordered.d - ordered.a : 0;

  /* Percent position of a pointer on the track -> an instant. */
  const instantAtPointer = (event: PointerEvent<HTMLElement>): number | null => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || !axis) return null;
    return msAt((event.clientX - rect.left) / rect.width, axis);
  };
  const press = (edge: EdgeKey) => (event: PointerEvent<HTMLElement>) => {
    if (disabled || !ordered || !limits?.[edge]) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragged({ edge, origin: ordered[edge], now: ordered[edge] });
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const cur = dragRef.current;
    const lim = cur && limits?.[cur.edge];
    if (!cur || !lim) return;
    const at = instantAtPointer(event);
    if (at === null) return;
    const now = snapEdge(at, day ? floorDay(cur.origin) : cur.origin, barMs, lim, unit);
    if (now !== cur.now) setDragged({ ...cur, now });
  };
  const release = (event: PointerEvent<HTMLElement>) => {
    const cur = dragRef.current;
    if (!cur) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragged(null);
    /* One patch, and only when the edge actually moved. */
    if (cur.now !== cur.origin) onChange({ [cur.edge]: msToInstant(cur.now) });
  };
  const cancel = () => setDragged(null);

  const key = (edge: EdgeKey) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape" && dragRef.current) {
      event.preventDefault();
      cancel();
      return;
    }
    const lim = limits?.[edge];
    if (disabled || !ordered || !lim) return;
    let from = ordered[edge];
    /* An edge that is off midnight (a copied value) first moves to the nearest midnight in the key's direction. */
    if (day && from % DAY_MS !== 0) {
      if (["ArrowRight", "PageUp"].includes(event.key)) from = ceilDay(from) - DAY_MS;
      else if (["ArrowLeft", "PageDown"].includes(event.key)) from = floorDay(from) + DAY_MS;
    }
    const next = stepEdge(event.key, event.shiftKey, from, span, barMs, lim, unit);
    if (next === null) return;
    event.preventDefault();
    if (next !== ordered[edge]) onChange({ [edge]: msToInstant(next) });
  };

  const asStrings = (e: { a: number; b: number; c: number; d: number }) => ({ a: msToInstant(e.a), b: msToInstant(e.b), c: msToInstant(e.c), d: msToInstant(e.d) });
  const presets: readonly Preset[] = day ? [] : [
    (() => {
      const title = "Re-split A..D by observed bar count: IS 70%, OOS 20%, Holdout 10%, snapped to the bar grid.";
      const split = ms.a !== null && ms.d !== null ? splitSeventyTwentyTen(ms.a, ms.d, barMs) : null;
      const reason = barMs === null ? "Needs a known bar size." : ms.a === null || ms.d === null || ms.d <= ms.a ? "Needs a valid A and D." : split === null ? "A..D is too short to split." : null;
      return { key: "70-20-10", label: "70/20/10", title, reason, edges: split && ms.a !== null && ms.d !== null ? asStrings({ a: ms.a, d: ms.d, ...split }) : null };
    })(),
    ...([30, 60, 90] as const).map((n): Preset => {
      const title = `Set A..D to the last ${n} days of the verified range, then split 70/20/10.`;
      const want = n * DAY_MS;
      const to = range?.to ?? null;
      const a = to === null ? null : to - (barMs !== null ? Math.round(want / barMs) * barMs : want);
      const split = a !== null && to !== null ? splitSeventyTwentyTen(a, to, barMs) : null;
      const reason =
        range === null ? "Needs a verified data range."
        : barMs === null ? "Needs a known bar size."
        : maxSpanMs !== null && maxSpanMs > 0 && want > maxSpanMs ? `${n} days exceeds the profile's maximum span (${days(maxSpanMs)}).`
        : range.to - range.from < want ? `The verified range is shorter than ${n} days.`
        : split === null ? "Too short to split." : null;
      return { key: `last-${n}d`, label: `Last ${n}d`, title, reason, edges: a !== null && to !== null && split ? asStrings({ a, d: to, ...split }) : null };
    }),
  ];

  /* ---- Day mode quick picks: one click = one onChange with all four edges. ---- */
  const dayStrings = (a: number, b: number, c: number, d: number): Record<EdgeKey, string> => ({ a: msToInstant(a), b: msToInstant(b), c: msToInstant(c), d: msToInstant(d) });
  const currentSplit = ms.a !== null && ms.b !== null && ms.c !== null && ms.d !== null
    ? DAY_SPLITS.find((sp) => {
        const got = splitOfDays(ms.a!, ms.d!, sp);
        return got !== null && got.b === ms.b && got.c === ms.c;
      }) ?? null
    : null;
  const ratio = currentSplit ?? DAY_SPLITS[0];
  const maxLen = (() => {
    if (lastDay === null || range === null) return null;
    const room = Math.floor((lastDay - ceilDay(range.from)) / DAY_MS);
    const cap = maxSpanMs !== null && maxSpanMs > 0 ? Math.floor(maxSpanMs / DAY_MS) : Infinity;
    return Math.min(room, cap);
  })();
  const rangePick = (key: string, label: string, n: number | null, title: string, reasonOverride: string | null): QuickPick => {
    const reason =
      range === null || lastDay === null ? "Needs a verified data range."
      : reasonOverride !== null ? reasonOverride
      : n === null ? null
      : maxSpanMs !== null && maxSpanMs > 0 && n * DAY_MS > maxSpanMs ? `${n} days exceeds the profile's maximum span (${days(maxSpanMs)}).`
      : lastDay - range.from < n * DAY_MS ? `The verified range is shorter than ${n} days.`
      : null;
    const a = lastDay !== null && n !== null ? lastDay - n * DAY_MS : null;
    const split = a !== null && lastDay !== null ? splitOfDays(a, lastDay, ratio) : null;
    const out = reason === null && a !== null && lastDay !== null && split !== null ? dayStrings(a, split.b, split.c, lastDay) : null;
    return { key, label, title, reason: reason ?? (out === null ? "Too short to split." : null), edges: out, selected: a !== null && lastDay !== null && ms.a === a && ms.d === lastDay };
  };
  const rangePicks: readonly QuickPick[] = [
    ...(recommended
      ? [(() => {
          const r = parseEdges(recommended);
          const same = EDGE_KEYS.every((k) => r[k] !== null && r[k] === ms[k]);
          return { key: "recommended", label: "Recommended", title: "The suggested windows, in whole days.", reason: null, edges: recommended, selected: same } satisfies QuickPick;
        })()]
      : []),
    ...([30, 60, 90] as const).map((n) => rangePick(`last-${n}d`, `Last ${n} days`, n, `Set A..D to the last ${n} days of the verified range, keeping the current split.`, null)),
    (() => {
      const n = maxLen !== null && maxLen >= 3 ? maxLen : null;
      const pick = rangePick("max", "Max", n, `The longest range the verified data${maxSpanMs !== null && maxSpanMs > 0 ? " and the profile's maximum span" : ""} allow, keeping the current split.`, range !== null && n === null ? "The verified range is too short." : null);
      return n === null ? pick : { ...pick, title: `${pick.title} (${n} days)` };
    })(),
  ];
  const splitPicks: readonly QuickPick[] = DAY_SPLITS.map((sp) => {
    const got = ms.a !== null && ms.d !== null ? splitOfDays(ms.a, ms.d, sp) : null;
    const reason = ms.a === null || ms.d === null || ms.d <= ms.a ? "Needs a valid A and D." : got === null ? "A..D has too few days for this split." : null;
    return {
      key: `split-${sp.key}`,
      label: sp.label,
      title: `Re-split A..D as IS ${sp.is}% / OOS ${sp.oos}% / Holdout ${100 - sp.is - sp.oos}%, by whole days.`,
      reason,
      edges: got && ms.a !== null && ms.d !== null ? dayStrings(ms.a, got.b, got.c, ms.d) : null,
      selected: currentSplit?.key === sp.key,
    };
  });

  const errorId = (k: EdgeKey) => `${idPrefix}-err-${k}`;
  const barsOf = (from: EdgeKey, to: EdgeKey): number | null => (preview ? barCount(preview[from], preview[to], barMs) : null);
  const overMax = maxSpanMs !== null && maxSpanMs > 0 && span > maxSpanMs;

  return (
    <div className="flex flex-col gap-2" data-linked-window-calendar>
      {day ? (
        <div className="flex flex-col gap-1" data-calendar-quick-picks>
          {([["Range", "Range quick picks", rangePicks, "data-calendar-presets"], ["Split", "Split quick picks", splitPicks, "data-calendar-splits"]] as const).map(([name, aria, picks, attr]) => (
            <div key={name} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={aria} {...{ [attr]: "" }}>
              <span className="mono w-[44px] text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>{name}</span>
              {picks.map((pick) => (
                <button
                  key={pick.key}
                  type="button"
                  className="btn-ghost mono text-[10px]"
                  disabled={disabled || pick.reason !== null}
                  title={pick.reason ?? pick.title}
                  aria-pressed={pick.selected}
                  style={pick.selected ? { borderColor: "var(--accent)" } : undefined}
                  onClick={() => pick.edges && onChange(pick.edges)}
                  data-calendar-preset={pick.key}
                >
                  {pick.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2.5 min-[560px]:grid-cols-2" data-calendar-inputs>
        {EDGE_KEYS.map((k) => (
          <label key={k} className="flex min-w-0 flex-col gap-1" data-calendar-edge={k}>
            <span className="mono text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>{LABEL[k]}</span>
            {day ? (
              <DateInput
                style={inputStyle(Boolean(errors[k]) || invalid[k] === true)}
                value={shownEdge(k)}
                onChange={(value) => onChange({ [k]: value })}
                label={LABEL[k]}
                describedBy={errors[k] ? errorId(k) : undefined}
                invalid={Boolean(errors[k]) || invalid[k] === true}
                disabled={disabled}
              />
            ) : (
              <InstantInput
                style={inputStyle(Boolean(errors[k]) || invalid[k] === true)}
                value={shownEdge(k)}
                onChange={(value) => onChange({ [k]: value })}
                label={LABEL[k]}
                describedBy={errors[k] ? errorId(k) : undefined}
                invalid={Boolean(errors[k]) || invalid[k] === true}
                disabled={disabled}
              />
            )}
            {errors[k] ? (
              <span id={errorId(k)} className="text-[9.5px]" style={{ color: "var(--bad)" }} data-edge-error={k}>{errors[k]}</span>
            ) : null}
            {fieldRefusals[k] ?? null}
          </label>
        ))}
      </div>

      {day ? null : <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Window presets" data-calendar-presets>
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="btn-ghost mono text-[10px]"
            disabled={disabled || preset.reason !== null}
            title={preset.reason ?? preset.title}
            onClick={() => preset.edges && onChange(preset.edges)}
            data-calendar-preset={preset.key}
          >
            {preset.label}
          </button>
        ))}
      </div>}

      <div className="flex flex-col gap-1" data-calendar-track-block>
        <div
          ref={trackRef}
          role="group"
          aria-label="Window range, IS then OOS then Holdout"
          className="relative"
          style={{ height: HANDLE, touchAction: "pan-y" }}
          data-calendar-track
        >
          {/* The rail and the segments sit on the vertical centre of the 24px handle row. */}
          <div className="absolute inset-x-0 top-1/2 h-[10px] -translate-y-1/2 rounded-full" style={{ background: "var(--paper-sunken)" }} aria-hidden="true">
            {axis && coverage && coverage.to > coverage.from ? (
              <span
                className="absolute top-0 h-full rounded-full"
                style={{ ...cssSpan(spanOn(coverage.from, coverage.to, axis)), background: "var(--accent-2)", opacity: 0.2 }}
                data-calendar-coverage
              />
            ) : null}
            {axis
              ? ROLES.map((role) => {
                  const from = preview ? preview[role.from] : ms[role.from];
                  const to = preview ? preview[role.to] : ms[role.to];
                  return from !== null && to !== null && to > from ? (
                    <span
                      key={role.key}
                      className="absolute top-0 h-full rounded-full"
                      style={{ ...cssSpan(spanOn(from, to, axis)), background: role.tone, opacity: 0.85 }}
                      data-calendar-segment={role.key}
                    />
                  ) : null;
                })
              : null}
          </div>
          {axis && preview && limits
            ? EDGE_KEYS.map((edge) => {
                const lim = limits[edge];
                if (!lim) return null;
                const at = preview[edge];
                return (
                  <div
                    key={edge}
                    role="slider"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={`${LABEL[edge]} handle`}
                    aria-orientation="horizontal"
                    aria-valuemin={Number.isFinite(lim.min) ? lim.min : Math.min(axis.from, at)}
                    aria-valuemax={Number.isFinite(lim.max) ? lim.max : Math.max(axis.to, at)}
                    aria-valuenow={at}
                    aria-valuetext={`${day && at % DAY_MS === 0 ? `${utcLabel(at).slice(0, 10)} UTC` : utcLabel(at)}, end exclusive`}
                    aria-disabled={disabled || undefined}
                    className="absolute top-0 flex cursor-ew-resize items-center justify-center rounded-[4px] outline-offset-1 focus-visible:outline focus-visible:outline-1"
                    style={{ left: `${percentOn(at, axis)}%`, width: HANDLE, height: HANDLE, marginLeft: -HANDLE / 2, touchAction: "none", outlineColor: "var(--accent)", cursor: disabled ? "default" : undefined }}
                    onPointerDown={press(edge)}
                    onPointerMove={move}
                    onPointerUp={release}
                    onPointerCancel={cancel}
                    onKeyDown={key(edge)}
                    data-calendar-handle={edge}
                    data-dragging={drag?.edge === edge ? "" : undefined}
                  >
                    <span className="block h-[16px] w-[4px] rounded-full border" style={{ background: "var(--paper-raised)", borderColor: "var(--ink)" }} aria-hidden="true" />
                  </div>
                );
              })
            : null}
        </div>

        <div className="mono flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[9.5px]" data-calendar-legend>
          {ROLES.map((role) => {
            const bars = barsOf(role.from, role.to);
            const whole = preview ? days(preview[role.to] - preview[role.from]) : null;
            /* A one-day bar says the same thing as the day count: print it once. */
            const barsText = bars !== null ? `${bars.toLocaleString("en-US")} bars` : null;
            return (
              <span key={role.key} data-calendar-role={role.key}>
                <span style={{ color: role.key === "is" ? "var(--ink-faint)" : role.tone }}>{role.label}</span>
                {day ? (
                  <span style={{ color: "var(--ink-soft)" }}>
                    {whole !== null ? ` ${whole}` : ""}
                    {barsText !== null && barMs !== DAY_MS ? ` (${barsText})` : ""}
                  </span>
                ) : barsText !== null ? <span style={{ color: "var(--ink-soft)" }}> {barsText}</span> : null}
              </span>
            );
          })}
          <span style={{ color: "var(--ink-faint)" }} data-calendar-utc>UTC · end exclusive</span>
          {day && lastDay !== null ? (
            <span style={{ color: "var(--ink-faint)" }} data-calendar-verified>data verified through {new Date(lastDay).toISOString().slice(0, 10)} (last full day)</span>
          ) : null}
          {warmupBars !== null ? <span style={{ color: "var(--ink-faint)" }} data-calendar-warmup>warmup {warmupBars.toLocaleString("en-US")} bars before A</span> : null}
          {ordered && maxSpanMs !== null && maxSpanMs > 0 ? (
            <span style={{ color: overMax ? "var(--bad)" : "var(--ink-faint)" }} data-calendar-span={overMax ? "over" : "ok"}>
              span {days(span)} · max {days(maxSpanMs)}{overMax ? " exceeded" : ""}
            </span>
          ) : null}
        </div>
        {!ordered ? (
          <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-calendar-empty>
            Fill A, B, C and D in increasing order to drag the boundaries.
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface QuickPick {
  key: string;
  label: string;
  title: string;
  reason: string | null;
  edges: Record<EdgeKey, string> | null;
  selected: boolean;
}

interface Preset {
  key: string;
  label: string;
  title: string;
  /** Why the preset cannot run now; null when it can. */
  reason: string | null;
  /** The four edges one click patches at once. */
  edges: Record<EdgeKey, string> | null;
}

function cssSpan(s: { left: number; width: number }): { left: string; width: string } {
  return { left: `${s.left}%`, width: `${s.width}%` };
}
