/**
 * An objective formula, typeset — RF02-F1 (Q5: KaTeX pinned, lazy, mono fallback).
 *
 * The formula text is the engine's, from the Atlas manifest
 * (`facts.objective.stages[].formula`). This module does not interpret it: it
 * maps identifiers to `\texttt{…}`, `*` to `\cdot` and `max` to `\max`, and
 * nothing else, so the typeset line says exactly what the text says. A formula
 * containing anything outside that small grammar is shown as the text itself.
 *
 * KaTeX is a separate chunk, loaded the first time a formula is on screen.
 * Until it arrives — or if it never does — the reader sees the same formula in
 * mono, never an empty box. Shared with Screen 06 when that screen shows one.
 */

import { useEffect, useRef, useState } from "react";

const TOKEN = /\s*([A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?|[-+*/(),])/y;

/** The LaTeX for a formula, or null when it is outside the grammar above. */
export function formulaToTex(formula: string): string | null {
  const parts: string[] = [];
  TOKEN.lastIndex = 0;
  let index = 0;
  while (index < formula.length) {
    if (/^\s*$/.test(formula.slice(index))) break;
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(formula);
    if (!match) return null;
    const token = match[1];
    index = TOKEN.lastIndex;
    if (token === "max") parts.push("\\max");
    else if (token === "*") parts.push("\\cdot");
    else if (token === ",") parts.push(",\\,");
    else if (/^[A-Za-z_]/.test(token)) parts.push(`\\texttt{${token.replace(/_/g, "\\_")}}`);
    else parts.push(token);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

type KatexModule = { render: (tex: string, element: HTMLElement, options: Record<string, unknown>) => void };

let katexPromise: Promise<KatexModule> | null = null;

/**
 * Starts the KaTeX chunk without waiting for a formula to mount. The Atlas
 * calls it when the route mounts, so the chunk downloads alongside the Atlas
 * read instead of after it (RF-04, FE-X-04: typeset landed 530–690 ms cold,
 * 5.6 s on a slow link, all of it queued behind the data).
 */
export function preloadKatex(): void {
  void loadKatex().catch(() => {
    /* The mono fallback stays; a failed preload is retried by the first formula. */
    katexPromise = null;
  });
}

function loadKatex(): Promise<KatexModule> {
  katexPromise ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(
    ([module]) => ((module as { default?: KatexModule }).default ?? (module as unknown as KatexModule)),
  );
  return katexPromise;
}

export function Formula({ formula }: { formula: string }) {
  const tex = formulaToTex(formula);
  const target = useRef<HTMLSpanElement>(null);
  const [typeset, setTypeset] = useState(false);

  useEffect(() => {
    setTypeset(false);
    if (tex === null) return;
    let alive = true;
    loadKatex()
      .then((katex) => {
        if (!alive || !target.current) return;
        // trust stays false and throwOnError false: a formula KaTeX cannot
        // parse renders as its source in red, never as markup or script.
        katex.render(tex, target.current, { throwOnError: false, output: "html", trust: false });
        setTypeset(true);
      })
      .catch(() => {
        /* The mono fallback stays on screen. */
      });
    return () => {
      alive = false;
    };
  }, [tex]);

  return (
    <span className="inline-flex items-baseline" data-formula-state={typeset ? "katex" : "fallback"}>
      {/* KaTeX writes into this node; React never renders children into it. */}
      <span ref={target} role="math" className="text-[12px]" aria-label={formula} hidden={!typeset} />
      {typeset ? null : (
        <span className="mono text-[11px]" style={{ color: "var(--ink)" }}>
          {formula}
        </span>
      )}
    </span>
  );
}
