/**
 * Reports content, read out of the locked fragment.
 *
 * `view-reports` is a byte-preserved fragment of the golden document, hashed in
 * `content-integrity-views.json`. Until now it was rendered with
 * `dangerouslySetInnerHTML`, which meant the screen inherited the legacy
 * document's markup, its inline styles and its `var(--muted)`/`var(--primary)`
 * colours — variables Fund Paper never defined, so they resolved to nothing.
 *
 * This parses the same fragment into a typed model so the screen can be built
 * from design-system primitives. The fragment is NOT edited and NOT duplicated:
 * it stays the single source, its hash stays gated, and the model is derived
 * from it at runtime. That is the whole point: render with primitives while
 * keeping the source's content-integrity hash.
 *
 * Parsing is strict. A fragment that does not match this shape means the parser
 * is wrong about a document that cannot silently change, so it throws rather
 * than rendering a half-empty screen.
 */

/** A run of inline content. The intro paragraph mixes prose with `<code>`. */
export type Inline =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string };

export interface ReportsCard {
  eyebrow: string;
  heading: string;
  body: string;
}

export interface ReportsDiagram {
  caption: string;
  /** Mermaid source, exactly as the document carries it. */
  source: string;
}

export interface ReportsDocument {
  title: string;
  intro: Inline[];
  repository: { label: string; href: string };
  role: { title: string; detail: string };
  cards: ReportsCard[];
  diagram: ReportsDiagram;
}

export class ReportsParseError extends Error {
  constructor(what: string) {
    super(`view-reports fragment does not match the expected shape: ${what}`);
    this.name = "ReportsParseError";
  }
}

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new ReportsParseError(what);
  return value;
}

/** Collapses the whitespace the source HTML uses for indentation. */
function text(node: Element | null | undefined, what: string): string {
  return required(node, what).textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/** Splits a paragraph into text and `<code>` runs, preserving order. */
function inlineRuns(paragraph: Element): Inline[] {
  const runs: Inline[] = [];
  for (const child of Array.from(paragraph.childNodes)) {
    if (child.nodeType === 3) {
      const value = (child.textContent ?? "").replace(/\s+/g, " ");
      if (value.trim()) runs.push({ kind: "text", value });
      continue;
    }
    const element = child as Element;
    const value = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    runs.push({ kind: element.tagName === "CODE" ? "code" : "text", value });
  }
  if (!runs.length) throw new ReportsParseError("intro paragraph is empty");
  return runs;
}

export function parseReportsFragment(html: string): ReportsDocument {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body
    .firstElementChild;
  const shell = required(root?.querySelector(".panel-shell"), ".panel-shell");

  const header = required(shell.querySelector(".panel-header"), ".panel-header");
  const link = required(header.querySelector("a[href]"), "repository link");

  const banner = required(shell.querySelector(".status-banner"), ".status-banner");
  const bannerBody = required(banner.querySelector("div"), ".status-banner body");

  const cards = Array.from(shell.querySelectorAll(".report-grid-card"))
    // The diagram shares the card class; it is parsed separately below.
    .filter((card) => !card.classList.contains("diagram-card"))
    .map((card) => ({
      eyebrow: text(card.querySelector(".eyebrow"), "card eyebrow"),
      heading: text(card.querySelector("h3"), "card heading"),
      body: text(card.querySelector("p"), "card body"),
    }));
  if (!cards.length) throw new ReportsParseError("no report cards found");

  const diagramCard = required(shell.querySelector(".diagram-card"), ".diagram-card");
  // `.mermaid-source` is the hidden copy-source twin of the visible `pre`; both
  // hold the same text, so either one is the document's diagram source.
  const source = required(
    diagramCard.querySelector(".mermaid-source") ?? diagramCard.querySelector("pre.mermaid"),
    "mermaid source",
  ).textContent;

  return {
    title: text(header.querySelector("h1"), "h1"),
    intro: inlineRuns(required(header.querySelector("p"), "intro paragraph")),
    repository: {
      label: text(link, "repository label"),
      href: required(link.getAttribute("href"), "repository href"),
    },
    role: {
      title: text(bannerBody.querySelector("strong"), "role title"),
      detail: text(bannerBody.querySelector("div"), "role detail"),
    },
    cards,
    diagram: {
      caption: text(diagramCard.querySelector(".artifact-toolbar span"), "diagram caption"),
      // Mermaid is whitespace-sensitive, so the source keeps its own newlines;
      // only the trailing indentation of the HTML is trimmed.
      source: required(source, "mermaid source text").trim(),
    },
  };
}

/**
 * Every piece of prose the model carries, in document order.
 *
 * Used by the content test to prove the render neither drops nor invents text
 * relative to the fragment.
 */
export function documentStrings(document: ReportsDocument): string[] {
  return [
    document.title,
    ...document.intro.map((run) => run.value.trim()),
    document.repository.label,
    document.role.title,
    document.role.detail,
    ...document.cards.flatMap((card) => [card.eyebrow, card.heading, card.body]),
    document.diagram.caption,
  ].filter(Boolean);
}
