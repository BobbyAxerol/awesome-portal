import { useEffect, useId, useState, type RefObject } from "react";

/** Plot margins in CSS px. EventRibbon uses the same numbers (through CSS custom properties) to line up with an EquityPanel. */
export const CHART_MARGIN = { l: 60, r: 78, t: 28, b: 26 } as const;

export const DEFAULT_CHART_WIDTH = 760;

/**
 * Width of an element, tracked with ResizeObserver. Where nothing can be
 * measured (first paint, jsdom) the fallback is used, so a chart always draws.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = DEFAULT_CHART_WIDTH): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const apply = () => {
      const w = Math.round(el.clientWidth);
      if (w >= 160) setWidth(w);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** A stable per-instance id for SVG defs and aria references (colons stripped: they break `url(#id)`). */
export function useChartId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, "")}`;
}
