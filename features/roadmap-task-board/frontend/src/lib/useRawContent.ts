import { useCallback, useEffect, useRef } from "react";

/** Renders raw legacy fragments (docs/views) + wires copy-source buttons and Mermaid. */
export function useRawContent(theme: "light" | "dark") {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const copySource = useCallback(async (button: HTMLElement) => {
    const card = button.closest(".diagram-card, .code-card");
    const source = card?.querySelector(".mermaid-source, pre code");
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source.textContent ?? "");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = source.textContent ?? "";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    button.textContent = "Copied ✓";
    window.setTimeout(() => (button.textContent = "Copy Mermaid"), 1600);
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".copy-source");
      if (target) {
        e.preventDefault();
        void copySource(target);
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [copySource]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const mermaidEls = root.querySelectorAll<HTMLElement>(".mermaid");
    if (mermaidEls.length === 0) return;
    let cancelled = false;
    void import("@/lib/mermaid").then(({ renderMermaid }) =>
      renderMermaid(root, theme).then((ok) => {
        if (!ok && !cancelled) {
          mermaidEls.forEach((el) => (el.textContent = "Diagram render failed"));
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [theme]);

  return containerRef;
}