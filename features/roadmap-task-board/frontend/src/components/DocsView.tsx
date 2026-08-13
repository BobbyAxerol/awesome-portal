import { useMemo, useState } from "react";
import { DOC_PAGES } from "@/content/pages/index";
import { useRawContent } from "@/lib/useRawContent";
import { Input } from "@/components/ui";

interface TocItem {
  id: string;
  level: number;
  text: string;
}

function extractToc(html: string): TocItem[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items: TocItem[] = [];
  for (const el of doc.querySelectorAll("h1, h2, h3")) {
    items.push({ id: el.id, level: Number(el.tagName[1]), text: el.textContent ?? "" });
  }
  return items;
}

export function DocsView({
  pageId,
  theme,
  onNavigate,
}: {
  pageId: string | null;
  theme: "light" | "dark";
  onNavigate: (view: string, page: string) => void;
}) {
  const page = DOC_PAGES.find((p) => p.id === pageId) ?? DOC_PAGES[0];
  const [query, setQuery] = useState("");
  const containerRef = useRawContent(theme);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOC_PAGES;
    return DOC_PAGES.filter((p) => p.title.toLowerCase().includes(q) || p.html.toLowerCase().includes(q));
  }, [query]);

  const toc = useMemo(() => extractToc(page.html), [page]);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="doc-layout">
      <main className="doc-main">
        <div className="context-tabs" role="tablist" aria-label="Document filter">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm tài liệu…"
            aria-label="Search documents"
          />
        </div>
        <div className="view-panel active" ref={containerRef}>
          <article className="doc-article">
            <div
              // The content is a byte-preserved fragment from the golden baseline.
              dangerouslySetInnerHTML={{ __html: page.html }}
            />
          </article>
        </div>
        {query && (
          <div className="search-results" role="listbox">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className="search-result"
                onClick={() => {
                  onNavigate("docs", p.id);
                  setQuery("");
                }}
              >
                <span className="mono-label">{p.id}</span> {p.title}
              </button>
            ))}
          </div>
        )}
      </main>
      <aside className="toc-rail" aria-label="Table of contents">
        <p className="mono-label">On this page</p>
        <nav>
          {toc.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`toc-item toc-l${item.level}`}
              onClick={() => jump(item.id)}
            >
              {item.text}
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}