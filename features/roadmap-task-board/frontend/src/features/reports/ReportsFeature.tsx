/**
 * Reports screen, rendered from the parsed document rather than from its HTML.
 *
 * The content still comes from the locked `view-reports` fragment — same bytes,
 * same hash, same integrity gate. What changed is the rendering path: the screen
 * is built from design-system primitives instead of injecting legacy markup, so
 * it inherits Fund Paper tokens like every other surface and stops carrying the
 * old document's inline styles (`var(--muted)`, `var(--primary)` — variables
 * this design system never defined, which is why they resolved to nothing).
 *
 * A parse failure is loud. The fragment is committed and hash-gated, so it
 * cannot drift on its own: if parsing fails, the parser is wrong, and a silently
 * empty screen would hide that.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Card, StateView } from "@/components/ui";
import { VIEW_PANELS } from "@/content/views";

import { ReportsParseError, parseReportsFragment, type ReportsDocument } from "./reportsModel";

/** Renders the mermaid diagram through the shared pipeline. */
function DiagramFigure({
  caption,
  source,
  theme,
}: {
  caption: string;
  source: string;
  theme: "light" | "dark";
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let cancelled = false;
    // Same renderer the document pages use, so a theme switch re-renders the
    // diagram from its source instead of leaving stale SVG behind.
    void import("@/lib/mermaid").then(({ renderMermaid }) =>
      renderMermaid(root, theme).then((ok) => {
        if (!cancelled) setFailed(!ok);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [theme, source]);

  return (
    <Card className="diagram-card reports-diagram">
      <div className="artifact-toolbar">
        <span>{caption}</span>
        <button
          type="button"
          className="mini-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(source).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? "Copied ✓" : "Copy Mermaid"}
        </button>
      </div>
      <div ref={container}>
        {failed ? (
          <StateView kind="failed" message="The mermaid diagram could not be rendered." />
        ) : (
          <pre className="mermaid">{source}</pre>
        )}
      </div>
    </Card>
  );
}

function ReportsBody({ document: doc, theme }: { document: ReportsDocument; theme: "light" | "dark" }) {
  return (
    <section className="feature-surface" data-testid="reports-feature">
      <header className="feature-header">
        <div>
          <h1>{doc.title}</h1>
          <p>
            {doc.intro.map((run, index) =>
              run.kind === "code" ? (
                <code key={index}>{run.value}</code>
              ) : (
                <span key={index}>{run.value}</span>
              ),
            )}
          </p>
        </div>
        <div className="feature-actions">
          <a
            className="btn-primary"
            href={doc.repository.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {doc.repository.label}
          </a>
        </div>
      </header>

      {/* The banner states a recommendation, not a runtime state, so it uses the
        * neutral sync-notice surface rather than an availability tone. */}
      <div className="sync-notice reports-role" role="note">
        <div>
          <strong>{doc.role.title}</strong>
          <p>{doc.role.detail}</p>
        </div>
      </div>

      <div className="reports-grid">
        {doc.cards.map((card) => (
          <Card key={card.heading} className="reports-card">
            <p className="mono-label">{card.eyebrow}</p>
            <h3>{card.heading}</h3>
            <p>{card.body}</p>
          </Card>
        ))}
      </div>

      <DiagramFigure caption={doc.diagram.caption} source={doc.diagram.source} theme={theme} />
    </section>
  );
}

export function ReportsFeature({ theme }: { theme: "light" | "dark" }) {
  const parsed = useMemo(() => {
    const panel = VIEW_PANELS.find((item) => item.id === "view-reports");
    if (!panel) return { error: "The view-reports fragment is not in the bundle." } as const;
    try {
      return { document: parseReportsFragment(panel.html) } as const;
    } catch (error) {
      return {
        error:
          error instanceof ReportsParseError
            ? error.message
            : "The view-reports fragment could not be read.",
      } as const;
    }
  }, []);

  if ("error" in parsed) {
    return (
      <section className="feature-surface" data-testid="reports-feature">
        <StateView kind="failed" message={parsed.error} />
      </section>
    );
  }

  return <ReportsBody document={parsed.document} theme={theme} />;
}
