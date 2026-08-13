import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui";
import { DOC_PAGES } from "@/content/pages/index";
import type { View } from "@/lib/router";
import { useRawContent } from "@/lib/useRawContent";

interface TocItem {
  id: string;
  level: number;
  text: string;
}

function extractToc(html: string): TocItem[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("h1, h2, h3")].map((element) => ({
    id: element.id,
    level: Number(element.tagName[1]),
    text: element.textContent ?? "",
  }));
}

/** Raw document fragments remain the only source of document content. */
export function DocsFeature({ pageId, theme, onNavigate }: { pageId: string | null; theme: "light" | "dark"; onNavigate: (view: View, page?: string) => void }) {
  const page = DOC_PAGES.find((item) => item.id === pageId) ?? DOC_PAGES[0];
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
    return DOC_PAGES.filter((item) => item.title.toLowerCase().includes(normalized) || item.html.toLowerCase().includes(normalized));
  }, [query]);
  const toc = useMemo(() => extractToc(page.html), [page]);

  return (
    <div className="doc-layout" data-testid="docs-feature">
      <main className="doc-main">
        <div className="context-tabs" role="search">
          <Input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm kiếm tài liệu… (Ctrl/⌘ K)" aria-label="Search documents" />
        </div>
        {query && (
          <div className="search-results" role="listbox" aria-label="Document search results">
            {filtered.length ? filtered.map((item) => (
              <button key={item.id} type="button" className="search-result" onClick={() => { onNavigate("docs", item.id); setQuery(""); }}>
                <span className="mono-label">{item.id}</span> {item.title}
              </button>
            )) : <p className="search-empty">Không có tài liệu phù hợp.</p>}
          </div>
        )}
        <div className="view-panel active" ref={containerRef} data-testid={`doc-page-${page.id}`}>
          <article className="doc-article" dangerouslySetInnerHTML={{ __html: page.html }} />
        </div>
      </main>
      <aside className="toc-rail" aria-label="Table of contents">
        <p className="mono-label">On this page</p>
        <nav>
          {toc.map((item) => (
            <button key={item.id} type="button" className={`toc-item toc-l${item.level}`} onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {item.text}
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
