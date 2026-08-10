/** Thin ECharts React wrapper: fixed-height figure with resize handling. */
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart, HeatmapChart, ParallelChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  VisualMapComponent,
  DatasetComponent,
  ParallelComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";

echarts.use([
  BarChart,
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
    const chart = echarts.init(container.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={container} id={id} className={className} style={{ height, width: "100%" }} />;
}
