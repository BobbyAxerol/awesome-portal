/** Thin ECharts React wrapper: fixed-height figure with resize handling. */
import * as echarts from "echarts/core";
import { BarChart, CandlestickChart, LineChart, ScatterChart, HeatmapChart, ParallelChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  VisualMapComponent,
  DatasetComponent,
  ParallelComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";

echarts.use([
  BarChart,
  CandlestickChart,
  LineChart,
  ScatterChart,
  HeatmapChart,
  ParallelChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  VisualMapComponent,
  DatasetComponent,
  ParallelComponent,
  CanvasRenderer,
]);

export interface EChartProps {
  option: EChartsOption;
  height?: number;
  className?: string;
  id?: string;
}

export function EChart({ option, height = 320, className, id }: EChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!container.current) return;
    // Initialise only once the page's fonts are in: a chart painted before
    // JetBrains Mono arrives keeps its fallback glyphs (ECharts does not repaint
    // on font load), which made the same screen render two ways at random.
    let disposed = false;
    let chart: echarts.ECharts | null = null;
    let cleanupFns: (() => void)[] = [];
    const start = () => {
      if (disposed || !container.current) return;
      chart = echarts.init(container.current, undefined, { renderer: "canvas" });
      chartRef.current = chart;
      // A synchronous first paint (lazyUpdate:false) is what keeps screenshots
      // deterministic; jsdom has no canvas context and throws inside it.
      try {
        chart.setOption(optionRef.current, { notMerge: true, lazyUpdate: false });
      } catch {
        /* no canvas backend */
      }
      // Resize only on a real size change: an unconditional resize() repaints
      // the canvas, and a repaint racing a screenshot is a nondeterministic pixel.
      const onResize = () => {
        const el = container.current;
        if (!el || !chart) return;
        // jsdom reports no size and no canvas context; resize() there is a
        // throw, not a repaint. The chart is invisible either way.
        try {
          if (Math.abs(el.clientWidth - chart.getWidth()) > 1 || Math.abs(el.clientHeight - chart.getHeight()) > 1) chart.resize();
        } catch {
          /* no canvas backend */
        }
      };
      window.addEventListener("resize", onResize);
      // The container can change width without the window doing so (a grid
      // column collapsing, a rail appearing); a canvas sized at init would then
      // overflow its tile. Observe the element, not just the viewport.
      // The observer only fires on a real box change (plus once on observe), so
      // an unconditional resize here is one repaint per change, never a churn.
      const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { try { chart?.resize(); } catch { /* no canvas backend */ } }) : null;
      ro?.observe(container.current);
      // The width read at init can belong to a layout that is still settling
      // (a grid column widening as its siblings mount). Re-check on the next
      // two frames so the final size is reached before anything observes it.
      // A container that had no width at init (a grid column still laying
      // out, a group mounting behind siblings) leaves a 100px default canvas
      // behind; the observer does not always see the change. Re-check on the
      // first ten frames and again at 300ms and 1s — cheap, and it settles
      // every case measured so far.
      let raf = 0;
      let frames = 0;
      const tick = () => {
        onResize();
        frames += 1;
        if (frames < 10) raf = requestAnimationFrame(tick);
      };
      if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
      const t1 = window.setTimeout(onResize, 300);
      const t2 = window.setTimeout(onResize, 1000);
      cleanupFns = [() => ro?.disconnect(), () => window.removeEventListener("resize", onResize), () => { if (raf) cancelAnimationFrame(raf); }, () => window.clearTimeout(t1), () => window.clearTimeout(t2)];
    };
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (fonts && fonts.status !== "loaded") void fonts.ready.then(start);
    else start();
    return () => {
      disposed = true;
      for (const fn of cleanupFns) fn();
      // jsdom has no canvas context: zrender's clear() dereferences a null
      // 2D context on dispose. The chart is gone either way.
      try {
        chart?.dispose();
      } catch {
        /* no canvas backend */
      }
      chartRef.current = null;
    };
  }, []);

  const optionRef = useRef(option);
  optionRef.current = option;
  useEffect(() => {
    try {
      chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: false });
    } catch {
      /* no canvas backend */
    }
  }, [option]);

  return <div ref={container} id={id} className={className} style={{ height, width: "100%" }} />;
}
