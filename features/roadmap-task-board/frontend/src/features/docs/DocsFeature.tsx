import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui";
import { DOC_PAGES } from "@/content/pages/index";
import type { View } from "@/lib/router";
import { useRawContent } from "@/lib/useRawContent";

/**
 * The migrated architecture document.
 *
 * Two things were wrong with how it read, and both are about reach rather than
 * content — every one of the sixteen pages is present and hash-verified against
 * the legacy HTML by `tests/content-integrity.test.ts`.
 *
 * 1. Document navigation lived in the standalone app's sidebar, which the
 *    Portal shell does not render. Embedded — the path every reader actually
 *    takes — there was no way to leave the first page, so fifteen sixteenths of
 *    the document were unreachable while being fully migrated.
 *
 * 2. There was no way to read the document as a document. A reference work
 *    split into sixteen separately-addressed pages with no continuous mode
 *    cannot be read straight through, searched with the browser, or printed
 *    whole.
 *
 * So navigation belongs to the feature, not to a host's chrome, and the reader
 * chooses between one section and the whole thing. Single-section stays the
 * default: it is the right mode for looking something up, which is the common
 * case, and it keeps first paint to one page's markup.
 */

interface TocItem {
  id: string;
  level: number;
  text: string;
  /** Page the heading belongs to — only meaningful in continuous mode. */
  pageId: string;
}

type ReadingMode = "section" | "document";

function extractToc(html: string, pageId: string): TocItem[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("h1, h2, h3")]
    // A heading with no id cannot be scrolled to, and a contents entry that
    // does nothing when clicked is worse than an absent one.
    .filter((element) => element.id)
    .map((element) => ({
      id: element.id,
      level: Number(element.tagName[1]),
      text: element.textContent ?? "",
      pageId,
    }));
}

export function DocsFeature({
  pageId,
  theme,
  onNavigate,
}: {
  pageId: string | null;
  theme: "light" | "dark";
  onNavigate: (view: View, page?: string) => void;
}) {
  const pageIndex = Math.max(
    0,
    DOC_PAGES.findIndex((item) => item.id === pageId),
  );
  const page = DOC_PAGES[pageIndex];
  const [mode, setMode] = useState<ReadingMode>("section");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRawContent(theme);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return DOC_PAGES;
    return DOC_PAGES.filter(
      (item) =>
        item.title.toLowerCase().includes(normalized) ||
        item.html.toLowerCase().includes(normalized),
    );
  }, [query]);

  const toc = useMemo(() => {
    if (mode === "document") {
      return DOC_PAGES.flatMap((item) => extractToc(item.html, item.id));
    }
    return extractToc(page.html, page.id);
  }, [mode, page]);

  const goTo = useCallback(
    (id: string) => {
      onNavigate("docs", id);
      // In continuous mode the target is already mounted, so scrolling is the
      // whole navigation; in section mode the click swaps the page instead.
      if (mode === "document") {
        document.getElementById(`doc-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [mode, onNavigate],
  );

  const previous = pageIndex > 0 ? DOC_PAGES[pageIndex - 1] : null;
  const next = pageIndex < DOC_PAGES.length - 1 ? DOC_PAGES[pageIndex + 1] : null;

  return (
    <div className="doc-layout" data-testid="docs-feature" data-mode={mode}>
      <main className="doc-main">
        <div className="doc-controls">
          <div className="doc-picker">
            <label className="mono-label" htmlFor="doc-page-select">
              Section
            </label>
            <select
              id="doc-page-select"
              className="input doc-page-select"
              value={page.id}
              onChange={(event) => goTo(event.target.value)}
            >
              {DOC_PAGES.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {index + 1}. {item.title}
                </option>
              ))}
            </select>
            <span className="mono doc-position">
              {pageIndex + 1} / {DOC_PAGES.length}
            </span>
          </div>

          <div className="doc-mode" role="group" aria-label="Reading mode">
            {(["section", "document"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`doc-mode-btn ${mode === candidate ? "is-active" : ""}`}
                aria-pressed={mode === candidate}
                onClick={() => setMode(candidate)}
              >
                {candidate === "section" ? "This section" : "Whole document"}
              </button>
            ))}
          </div>

          <div className="doc-search" role="search">
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the document… (Ctrl/⌘ K)"
              aria-label="Search the document"
            />
          </div>
        </div>

        {query && (
          <div className="search-results" role="listbox" aria-label="Document search results">
            {filtered.length ? (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="search-result"
                  onClick={() => {
                    goTo(item.id);
                    setQuery("");
                  }}
                >
                  <span className="mono-label">{item.id}</span> {item.title}
                </button>
              ))
            ) : (
              <p className="search-empty">No section matches that search.</p>
            )}
          </div>
        )}

        <div className="view-panel active" ref={containerRef} data-testid={`doc-page-${page.id}`}>
          {mode === "document" ? (
            DOC_PAGES.map((item, index) => (
              <section
                key={item.id}
                id={`doc-section-${item.id}`}
                className="doc-section"
                data-testid={`doc-section-${item.id}`}
              >
                <p className="mono-label doc-section-marker">
                  {index + 1} / {DOC_PAGES.length} · {item.id}
                </p>
                <article className="doc-article" dangerouslySetInnerHTML={{ __html: item.html }} />
              </section>
            ))
          ) : (
            <article className="doc-article" dangerouslySetInnerHTML={{ __html: page.html }} />
          )}
        </div>

        {mode === "section" ? (
          <nav className="doc-pager" aria-label="Adjacent sections">
            {previous ? (
              <button type="button" className="doc-pager-btn" onClick={() => goTo(previous.id)}>
                <span className="mono-label">Previous</span>
                <span>{previous.title}</span>
              </button>
            ) : (
              <span />
            )}
            {next ? (
              <button
                type="button"
                className="doc-pager-btn doc-pager-next"
                onClick={() => goTo(next.id)}
              >
                <span className="mono-label">Next</span>
                <span>{next.title}</span>
              </button>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>

      <aside className="toc-rail" aria-label="Table of contents">
        <p className="mono-label">{mode === "document" ? "Contents" : "On this page"}</p>
        <nav>
          {toc.map((item, index) => (
            <button
              key={`${item.pageId}-${item.id}-${index}`}
              type="button"
              className={`toc-item toc-l${item.level}`}
              data-target={item.id}
              title={item.text}
              onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {item.text}
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
