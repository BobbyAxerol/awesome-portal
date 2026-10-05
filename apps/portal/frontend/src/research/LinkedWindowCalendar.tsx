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

import { InstantInput, inputStyle } from "./InstantInput";
import {
  axisOf,
  barCount,
  edgeLimits,
  EDGE_KEYS,
  msAt,
  msToInstant,
  orderedEdges,
  parseEdges,
  percentOn,
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
const DAY_MS = 86_400_000;

function days(ms: number): string {
  return `${Math.round((ms / DAY_MS) * 10) / 10} d`;
}

interface Drag {
  edge: "b" | "c";
  origin: number;
  now: number;
}

export function LinkedWindowCalendar({
  edges,
  onChange,
  barMs,
  coverage = null,
  warmupBars = null,
  maxSpanMs = null,
  errors = {},
  invalid = {},
  disabled = false,
  fieldRefusals = {},
  idPrefix,
}: LinkedWindowCalendarProps) {
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

  const drawn = preview ? [[preview.a, preview.d] as const] : EDGE_KEYS.flatMap((key) => (ms[key] !== null ? [[ms[key]!, ms[key]!] as const] : []));
  const axis = axisOf(drawn, coverage);
  const limits = ordered ? { b: edgeLimits("b", ordered, barMs), c: edgeLimits("c", ordered, barMs) } : null;
  const span = ordered ? ordered.d - ordered.a : 0;

  /* Percent position of a pointer on the track -> an instant. */
  const instantAtPointer = (event: PointerEvent<HTMLElement>): number | null => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || !axis) return null;
    return msAt((event.clientX - rect.left) / rect.width, axis);
  };
  const press = (edge: "b" | "c") => (event: PointerEvent<HTMLElement>) => {
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
    const now = snapEdge(at, cur.origin, barMs, lim);
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

  const key = (edge: "b" | "c") => (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape" && dragRef.current) {
      event.preventDefault();
      cancel();
      return;
    }
    const lim = limits?.[edge];
    if (disabled || !ordered || !lim) return;
    const next = stepEdge(event.key, event.shiftKey, ordered[edge], span, barMs, lim);
    if (next === null) return;
    event.preventDefault();
    if (next !== ordered[edge]) onChange({ [edge]: msToInstant(next) });
  };

  const errorId = (k: EdgeKey) => `${idPrefix}-err-${k}`;
  const barsOf = (from: EdgeKey, to: EdgeKey): number | null => (preview ? barCount(preview[from], preview[to], barMs) : null);
  const overMax = maxSpanMs !== null && maxSpanMs > 0 && span > maxSpanMs;

  return (
    <div className="flex flex-col gap-2" data-linked-window-calendar>
      <div className="grid grid-cols-1 gap-2.5 min-[560px]:grid-cols-2" data-calendar-inputs>
        {EDGE_KEYS.map((k) => (
          <label key={k} className="flex min-w-0 flex-col gap-1" data-calendar-edge={k}>
            <span className="mono text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>{LABEL[k]}</span>
            <InstantInput
              style={inputStyle(Boolean(errors[k]) || invalid[k] === true)}
              value={shownEdge(k)}
              onChange={(value) => onChange({ [k]: value })}
              label={LABEL[k]}
              describedBy={errors[k] ? errorId(k) : undefined}
              invalid={Boolean(errors[k]) || invalid[k] === true}
              disabled={disabled}
            />
            {errors[k] ? (
              <span id={errorId(k)} className="text-[9.5px]" style={{ color: "var(--bad)" }} data-edge-error={k}>{errors[k]}</span>
            ) : null}
            {fieldRefusals[k] ?? null}
          </label>
        ))}
      </div>

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
            ? (["b", "c"] as const).map((edge) => {
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
                    aria-valuemin={lim.min}
                    aria-valuemax={lim.max}
                    aria-valuenow={at}
                    aria-valuetext={`${utcLabel(at)}, end exclusive`}
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
            return (
              <span key={role.key} data-calendar-role={role.key}>
                <span style={{ color: role.key === "is" ? "var(--ink-faint)" : role.tone }}>{role.label}</span>
                {bars !== null ? <span style={{ color: "var(--ink-soft)" }}> {bars.toLocaleString("en-US")} bars</span> : null}
              </span>
            );
          })}
          <span style={{ color: "var(--ink-faint)" }} data-calendar-utc>UTC · end exclusive</span>
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

function cssSpan(s: { left: number; width: number }): { left: string; width: string } {
  return { left: `${s.left}%`, width: `${s.width}%` };
}
