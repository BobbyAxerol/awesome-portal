/**
 * Per-venue contribution — one bar chart per currency, never an FX mix.
 * Bars are placed with Number() (geometry only); the label on every bar is
 * the server's decimal string. A venue with no published value is drawn as a
 * gap and named in the caption.
 */
import { useId, useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "../../charts/EChart";
import { baseOption, chartTokens } from "../../charts/theme";
import { activeTheme } from "../../styles/tokens";

export interface ContributionRow {
  venue: string;
  value: string | null;
  currency: string;
  note?: string | null;
}

export function contributionOption(rows: readonly ContributionRow[], currency: string): EChartsOption {
  const tokens = chartTokens(activeTheme());
  const mine = rows.filter((r) => r.currency === currency);
  return baseOption({
    animation: false,
    grid: { left: 64, right: 16, top: 12, bottom: 28 },
    tooltip: { trigger: "axis", formatter: (p: unknown) => { const list = Array.isArray(p) ? p : [p]; const first = list[0] as { name?: string }; const row = mine.find((r) => r.venue === first?.name); return `${first?.name}: ${row?.value ?? "not published"} ${currency}${row?.note ? ` ${row.note}` : ""}`; } },
    xAxis: { type: "category", data: mine.map((r) => r.venue) },
    yAxis: { type: "value", scale: true, axisLabel: { formatter: (v: number) => String(v) } },
    series: [
      {
        type: "bar",
        data: mine.map((r) => {
          const n = r.value === null ? null : Number(r.value.replace(/,/g, ""));
          return n === null || !Number.isFinite(n) ? null : { value: n, itemStyle: { color: n < 0 ? tokens.bad : tokens.good } };
        }),
        label: { show: true, position: "top", formatter: (p: { dataIndex: number }) => mine[p.dataIndex]?.value ?? "" },
      },
    ],
  });
}

export function ContributionChart({ rows }: { rows: readonly ContributionRow[] }) {
  const currencies = useMemo(() => Array.from(new Set(rows.map((r) => r.currency))), [rows]);
  const uid = useId();
  if (rows.length === 0) return null;
  return (
    <div className="exec-contrib-charts">
      {currencies.map((ccy) => (
        <figure key={ccy} className="exec-chart-tile exec-contrib-chart" aria-label={`Contribution by venue · ${ccy}`}>
          <h3 className="exec-section-title">Contribution by venue · {ccy}</h3>
          <EChart id={`${uid}-contrib-${ccy}`} option={contributionOption(rows, ccy)} height={160} />
          <figcaption className="exec-role-meta">
            {rows.filter((r) => r.currency === ccy && r.value === null).length
              ? `not published: ${rows.filter((r) => r.currency === ccy && r.value === null).map((r) => r.venue).join(", ")} · `
              : ""}
            one axis per currency — venues are never mixed across FX
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
