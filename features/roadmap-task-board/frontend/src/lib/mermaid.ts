import mermaid from "mermaid";

import { readTokenPalette, WORKSTREAM_SLOTS } from "./workstream";

/**
 * Mermaid theming.
 *
 * Mermaid builds its SVG from a JS config object and cannot read CSS custom
 * properties, so the palette is *read out* of the computed root style rather
 * than duplicated here. tokens.css therefore stays the single source of truth
 * and a theme change cannot leave the diagrams behind.
 */
function themeVariables(): Record<string, string> {
  const { token } = readTokenPalette();
  const surface = token("--paper-raised");
  const ink = token("--ink");
  return {
    background: "transparent",
    primaryColor: token("--accent-soft"),
    primaryTextColor: ink,
    primaryBorderColor: token("--accent"),
    secondaryColor: token("--surface-2"),
    tertiaryColor: token("--paper-sunken"),
    lineColor: token("--ink-soft"),
    textColor: token("--ink-soft"),
    mainBkg: token("--accent-soft"),
    nodeBorder: token("--accent"),
    clusterBkg: token("--paper-sunken"),
    clusterBorder: token("--line"),
    edgeLabelBackground: surface,
    titleColor: ink,
    fontFamily: token("--font-body") || '"Inter", system-ui, sans-serif',
    fontSize: token("--text-base") || "13px",
  };
}

/**
 * Re-initialises mermaid against the tokens currently live on the root.
 *
 * There is deliberately no light/dark branch: `data-theme` has already swapped
 * the token values by the time this runs, so reading them covers both modes.
 * Callers pass the theme only as the signal that a re-read is due.
 */
export async function initMermaid(_theme: "light" | "dark"): Promise<void> {
  mermaid.initialize({
    startOnLoad: false,
    // `base` in both modes: the palette comes from our tokens either way, so
    // mermaid's own dark theme would only fight them.
    theme: "base",
    securityLevel: "loose",
    themeVariables: themeVariables(),
    flowchart: { curve: "basis", useMaxWidth: true, padding: 12 },
    sequence: { useMaxWidth: true },
  });
}

/**
 * Colours the nodes of a rendered diagram by workstream slot.
 *
 * Mermaid emits one `<g class="node">` per node; each gets the identity hue of
 * its slot. Colour is additive only — the node label is always present, so a
 * reader who cannot separate two hues still reads two different names
 * (v0.5 §12.3).
 */
function paintNodes(svg: SVGElement): void {
  const { workstream, other } = readTokenPalette();
  const nodes = Array.from(svg.querySelectorAll<SVGGElement>("g.node"));
  nodes.forEach((node, index) => {
    const hue = index < WORKSTREAM_SLOTS ? workstream[index] : other;
    if (!hue) return;
    for (const shape of node.querySelectorAll<SVGElement>("rect, polygon, circle, path")) {
      shape.style.stroke = hue;
      shape.style.strokeWidth = "1.5px";
    }
  });
}

/** Recreate diagrams from their original text so a theme switch cannot leave stale SVG. */
export async function renderMermaid(container: HTMLElement, theme: "light" | "dark"): Promise<boolean> {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(".mermaid"));
  for (const node of nodes) {
    const source = node.dataset.mermaidSource ?? node.textContent ?? "";
    node.dataset.mermaidSource = source;
    node.removeAttribute("data-processed");
    node.textContent = source;
  }
  try {
    // Theme tokens can be temporarily unavailable while the embedded feature
    // is mounting or unmounting (notably during route changes and jsdom test
    // cleanup). Treat initialization failure like any other renderer failure
    // so the caller can show its deterministic fallback instead of leaking an
    // unhandled promise rejection.
    await initMermaid(theme);
    await mermaid.run({ nodes });
    for (const node of nodes) {
      const svg = node.querySelector("svg");
      if (svg) {
        // Let the diagram shrink with its container instead of forcing the
        // card to scroll at narrow breakpoints.
        svg.removeAttribute("width");
        svg.setAttribute("width", "100%");
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        paintNodes(svg);
      }
    }
    return true;
  } catch {
    return false;
  }
}
