/**
 * The chart interaction contract (SPEC_W5 §2): one hook, two sr-only nodes.
 *
 * ```tsx
 * const c = useChartContract({ label: "OOS equity", noun: "point", count: n,
 *   describe: (i) => points[i].title, summary: "Equity chart, 90 points, ..." });
 * <div {...c.regionProps}> ...marks aria-hidden... {c.text ? <Tip>{c.text}</Tip> : null} {c.nodes} </div>
 * ```
 *
 * Returns `{ regionProps, index, setIndex, text }` as in the spec, plus three additive fields:
 *  - `live`      the string last written by a KEY or TAP (hover never writes it). Pass it to
 *                `<ChartLive text={live}/>`; `nodes` already does so.
 *  - `summaryId` the id `regionProps["aria-describedby"]` points at, for `<ChartSummary id=.../>`.
 *  - `nodes`     `<ChartLive/>` + `<ChartSummary/>` ready to render inside the region's parent.
 *
 * `regionProps` carries role=group, tabIndex (undefined when `count` is 0), aria-roledescription,
 * aria-label (just `label`, no key help), aria-describedby, the focus-ring `className`
 * ("outline-offset-2 focus-visible:outline focus-visible:outline-1"), `style.touchAction: "pan-y"`,
 * and key + pointer handlers. A caller that has its own className/style/handlers merges them: the
 * spread would otherwise override them.
 *
 * Keys (ignored with Ctrl/Meta/Alt): Left/Right = previous/next point, Shift = 10 points (or
 * `zoom.pan` when `zoom` is given and `zoom.zoomed !== false`), Home/End = first/last,
 * PageUp/PageDown = `events.prev/next` (only when `events` is given), Escape = clear readout,
 * + = - _ 0 only when `zoom` is given, Enter/Space only when `onActivate` is given and a point is
 * read. The readout is `describe(i)`: the point's own title; the UI computes nothing.
 *
 * Pointer: with `xs` (plot x in percent of the region width) move/hover snaps to the nearest
 * point; a pointerdown of any type sets the readout, announces it, and (touch/pen) pins it. A pin
 * survives pointerleave and blur, and ends on Escape, a tap on the same point, a tap on no point
 * within 24 px, or a pointerdown outside the region (one document listener, removed on unmount).
 * Mouse pointerleave/blur clear. `controlledIndex` makes the caller own the index (hover is then
 * ignored; keys and taps go through `onIndex`). `locate` maps a pointer to a point where x alone does not
 * (a 2-D plane, an ECharts canvas); `pointProps(i)` does the same per mark where marks wrap (the month strip).
 *
 * The hook never animates; entry motion stays in chartLife / useDrawIn / entryAnimation.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent, type HTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** Distance within which a tap snaps to a point (WCAG 2.5.8 target size). */
export const TAP_SNAP_PX = 24;
const JUMP = 10;
const RING = "outline-offset-2 focus-visible:outline focus-visible:outline-1";
const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** The index whose x is nearest to `pct` (percent of the plot width). */
export function nearestIndex(xs: readonly number[], pct: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i += 1) if (Math.abs(xs[i]! - pct) < Math.abs(xs[best]! - pct)) best = i;
  return best;
}

export interface ChartContractOptions {
  /** aria-label: one short phrase, no key help. */
  label: string;
  /** "point" | "bar" | "bucket" | "candidate" */
  noun: string;
  /** 0 => not focusable; the caller renders its typed absence. */
  count: number;
  /** The readout, equal to the point's title text. */
  describe(i: number): string;
  /** The sr-only summary sentence (served strings only). */
  summary: string;
  xs?: readonly number[];
  zoom?: { zoomIn(): void; zoomOut(): void; pan(dir: -1 | 1): void; reset(): void; zoomed?: boolean };
  events?: { prev(): void; next(): void };
  onActivate?(i: number): void;
  onIndex?(i: number | null): void;
  controlledIndex?: number | null;
  /**
   * A chart whose points are not placed by x alone (a 2-D plane, an ECharts canvas) maps a pointer position to a
   * point: client coordinates and the region's rect in, point index (null = no point there) out. It replaces `xs`.
   */
  locate?(clientX: number, clientY: number, region: DOMRect): number | null;
  /** `false`: the chart draws its own hover (ECharts); the hook then reads keys and presses only. */
  hover?: boolean;
}

/** Props for one mark inside a region whose marks wrap or sit off the x-axis (months in rows). */
export interface ChartPointProps {
  onPointerDown(event: PointerEvent<HTMLElement>): void;
  onPointerEnter(event: PointerEvent<HTMLElement>): void;
}

export interface ChartContract {
  regionProps: HTMLAttributes<HTMLElement>;
  index: number | null;
  setIndex(i: number | null): void;
  /** Handlers for the mark of point `i`: a press reads (and, for touch, pins) it exactly like a hit on `xs`. */
  pointProps(i: number): ChartPointProps;
  text: string | null;
  live: string | null;
  summaryId: string;
  nodes: ReactNode;
}

export function ChartLive({ text }: { text: string | null }) {
  return (
    <span role="status" aria-live="polite" data-chart-live style={SR_ONLY}>
      {text ?? ""}
    </span>
  );
}

export function ChartSummary({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} data-chart-summary style={SR_ONLY}>
      {text}
    </p>
  );
}

export function useChartContract(o: ChartContractOptions): ChartContract {
  const id = useId();
  const summaryId = `${id}chart-summary`;
  const [own, setOwn] = useState<number | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const regionRef = useRef<HTMLElement | null>(null);
  const optsRef = useRef(o);
  optsRef.current = o;

  const count = Math.max(0, o.count);
  const raw = o.controlledIndex !== undefined ? o.controlledIndex : own;
  const index = raw !== null && raw !== undefined && raw >= 0 && raw < count ? raw : null;
  const text = index === null ? null : o.describe(index);
  const indexRef = useRef(index);
  indexRef.current = index;

  const commit = useCallback((i: number | null, announce: boolean) => {
    const cur = optsRef.current;
    setOwn(i);
    setLive(i !== null && announce ? cur.describe(i) : null);
    cur.onIndex?.(i);
  }, []);
  const setIndex = useCallback((i: number | null) => commit(i, false), [commit]);
  const clear = useCallback(() => {
    setPinned(false);
    commit(null, false);
  }, [commit]);

  /* A pinned (touch) readout is dismissed by a tap anywhere outside the region. */
  useEffect(() => {
    if (!pinned) return;
    const onDown = (event: globalThis.PointerEvent) => {
      const el = regionRef.current;
      if (el && event.target instanceof Node && el.contains(event.target)) return;
      clear();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinned, clear]);

  const pick = (event: PointerEvent<HTMLElement>): { i: number; within: boolean } | null => {
    const { xs, locate } = optsRef.current;
    if (locate) {
      const at = locate(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
      return at === null || at < 0 || at >= optsRef.current.count ? { i: -1, within: false } : { i: at, within: true };
    }
    if (!xs || xs.length === 0) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = event.clientX - rect.left;
    const i = nearestIndex(xs, (x / rect.width) * 100);
    return { i, within: Math.abs((xs[i]! / 100) * rect.width - x) <= TAP_SNAP_PX };
  };
  const isMouse = (event: PointerEvent<HTMLElement>) => !event.pointerType || event.pointerType === "mouse";

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (optsRef.current.controlledIndex !== undefined || optsRef.current.hover === false) return;
    const hit = pick(event);
    if (!hit) return;
    /* Hover (and a touch drag) moves the readout but never the live node. */
    setOwn(hit.i);
    optsRef.current.onIndex?.(hit.i);
  };
  /** A press on point `i`: set, announce and (touch/pen) pin the readout; a second tap on it lets go. */
  const press = (i: number, touch: boolean) => {
    if (touch && pinned && indexRef.current === i) {
      clear();
      return;
    }
    setPinned(touch);
    commit(i, true);
  };
  /* A mark's own press runs before the region's (bubbling): the region must not read the same press twice. */
  const pressed = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    regionRef.current = event.currentTarget;
    if (pressed.current) {
      pressed.current = false;
      return;
    }
    const hit = pick(event);
    const touch = !isMouse(event);
    if (!hit) {
      if (touch && indexRef.current !== null) setPinned(true);
      return;
    }
    if (!hit.within) {
      clear();
      return;
    }
    press(hit.i, touch);
  };
  const pointProps = (i: number): ChartPointProps => ({
    onPointerDown: (event) => {
      if (count === 0) return;
      pressed.current = true;
      press(i, !isMouse(event));
    },
    onPointerEnter: (event) => {
      if (!isMouse(event) || optsRef.current.controlledIndex !== undefined) return;
      setOwn(i);
      optsRef.current.onIndex?.(i);
    },
  });
  const onPointerLeave = (event: PointerEvent<HTMLElement>) => {
    if (isMouse(event) && !pinned) commit(null, false);
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (pinned) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    commit(null, false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const cur = optsRef.current;
    if (count === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    regionRef.current = event.currentTarget;
    const { key, shiftKey } = event;
    const handled = () => event.preventDefault();
    const zoom = cur.zoom;
    if (zoom && (key === "+" || key === "=")) return handled(), zoom.zoomIn();
    if (zoom && (key === "-" || key === "_")) return handled(), zoom.zoomOut();
    if (zoom && key === "0") return handled(), zoom.reset();
    if (key === "PageUp" && cur.events) return handled(), cur.events.prev();
    if (key === "PageDown" && cur.events) return handled(), cur.events.next();
    if (key === "Enter" || key === " ") {
      if (!cur.onActivate || indexRef.current === null) return;
      return handled(), cur.onActivate(indexRef.current);
    }
    const at = indexRef.current;
    let next: number | null | undefined;
    if (key === "ArrowRight" || key === "ArrowLeft") {
      const dir = key === "ArrowRight" ? 1 : -1;
      if (shiftKey && zoom && zoom.zoomed !== false) return handled(), zoom.pan(dir);
      const step = shiftKey ? JUMP : 1;
      const from = at ?? (dir === 1 ? -1 : count);
      next = Math.min(count - 1, Math.max(0, from + dir * step));
    } else if (key === "Home") next = 0;
    else if (key === "End") next = count - 1;
    else if (key === "Escape") next = null;
    if (next === undefined) return;
    handled();
    setPinned(false);
    commit(next, true);
  };

  const regionProps: HTMLAttributes<HTMLElement> = {
    role: "group",
    tabIndex: count > 0 ? 0 : undefined,
    "aria-roledescription": "chart",
    "aria-label": o.label,
    "aria-describedby": summaryId,
    className: RING,
    style: { touchAction: "pan-y" },
    onKeyDown,
    onPointerMove,
    onPointerDown,
    onPointerLeave,
    onBlur,
  };

  return {
    regionProps,
    index,
    setIndex,
    pointProps,
    text,
    live,
    summaryId,
    nodes: (
      <>
        <ChartLive text={live} />
        <ChartSummary id={summaryId} text={o.summary} />
      </>
    ),
  };
}
