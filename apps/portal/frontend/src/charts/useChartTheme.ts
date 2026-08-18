/**
 * The chart palette, as a reactive value.
 *
 * Chart colours are plain values baked into an ECharts option object, so they do
 * not follow a CSS variable when the theme changes — the option has to be rebuilt.
 * This hook is the reactive source for that: it returns the theme name plus the
 * palettes derived from it, so a view can put one dependency in its `useMemo` and
 * have every chart follow the shell.
 *
 * It reads the *preference*, not `<html data-theme>`. The attribute is applied in
 * an effect, so on the render where the preference changes the DOM still reports
 * the old theme; a chart built from that would be one frame behind the page.
 */
import { useMemo } from "react";

import { usePreferences } from "../app/preferences";
import { chartTokens, paletteNow, roleColorsNow } from "./theme";

export function useChartTheme() {
  const { theme } = usePreferences();
  return useMemo(
    () => ({
      theme,
      tokens: chartTokens(theme),
      palette: paletteNow(theme),
      roleColors: roleColorsNow(theme),
    }),
    [theme],
  );
}
