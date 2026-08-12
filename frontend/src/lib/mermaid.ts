import mermaid from "mermaid";

let initialized = false;

export async function initMermaid(theme: "light" | "dark"): Promise<void> {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === "dark" ? "dark" : "base",
    securityLevel: "loose",
    fontFamily: '"Inter", system-ui, sans-serif',
    themeVariables:
      theme === "dark"
        ? {
            background: "transparent",
            primaryColor: "#1d3540",
            primaryTextColor: "#e6ebf2",
            primaryBorderColor: "#2b3648",
            lineColor: "#7fc8d8",
            textColor: "#a9b4c6",
            clusterBkg: "#182031",
            clusterBorder: "#2b3648",
            edgeLabelBackground: "#182031",
            fontSize: "13px",
          }
        : {
            background: "transparent",
            primaryColor: "#e2edf0",
            primaryTextColor: "#1c2532",
            primaryBorderColor: "#0f4c5c",
            lineColor: "#0f4c5c",
            textColor: "#4e5a6e",
            clusterBkg: "#f4f2ec",
            clusterBorder: "#e3e0d7",
            edgeLabelBackground: "#ffffff",
            fontSize: "13px",
          },
  });
  initialized = true;
}

/** Render all `.mermaid` blocks inside a container; returns false if re-render is needed. */
export async function renderMermaid(container: HTMLElement, theme: "light" | "dark"): Promise<boolean> {
  if (!initialized) await initMermaid(theme);
  try {
    await mermaid.run({ nodes: Array.from(container.querySelectorAll<HTMLElement>(".mermaid")) });
    return true;
  } catch {
    return false;
  }
}