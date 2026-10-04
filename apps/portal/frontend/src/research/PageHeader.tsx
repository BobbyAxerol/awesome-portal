/**
 * W4A — the one page header: one h1, `← prev · next →`, an optional copy-link
 * icon. No breadcrumb: the top bar already shows the path.
 */
import { useState, type ReactNode } from "react";
import { Link, useInRouterContext } from "react-router-dom";

const MONO = "var(--font-mono)";
const DISPLAY = "var(--font-display)";

export interface PageHeaderLink {
  label: string;
  href: string;
}

/** Inside a Router a link is a client-side navigation; outside one (a unit test, a bare mount) it is a plain anchor. */
function HeaderLink({ href, action, children }: { href: string; action: string; children: ReactNode }) {
  const inRouter = useInRouterContext();
  const style = { fontFamily: MONO, fontSize: 11, color: "var(--accent)", textDecoration: "none" } as const;
  return inRouter ? (
    <Link data-action={action} to={href} style={style}>
      {children}
    </Link>
  ) : (
    <a data-action={action} href={href} style={style}>
      {children}
    </a>
  );
}

export function PageHeader({
  title,
  prev,
  next,
  copy,
  children,
}: {
  title: ReactNode;
  prev?: PageHeaderLink;
  next?: PageHeaderLink;
  copy?: boolean;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    const href = typeof window !== "undefined" ? window.location.href : "";
    void navigator.clipboard?.writeText(href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <header
      data-page-header
      style={{ display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid var(--line)", paddingBottom: 10, minWidth: 0 }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", justifyContent: "space-between" }}>
        <h1
          data-page-title
          style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 300, letterSpacing: "-.01em", lineHeight: "normal", margin: 0, overflowWrap: "anywhere", minWidth: 0 }}
        >
          {title}
        </h1>
        {prev || next || copy ? (
          <nav aria-label="Previous and next" className="page-header-nav" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {prev ? (
              <HeaderLink action="page-prev" href={prev.href}>
                ← {prev.label}
              </HeaderLink>
            ) : null}
            {prev && next ? (
              <span aria-hidden="true" style={{ color: "var(--ink-faint)" }}>
                ·
              </span>
            ) : null}
            {next ? (
              <HeaderLink action="page-next" href={next.href}>
                {next.label} →
              </HeaderLink>
            ) : null}
            {copy ? (
              <button
                type="button"
                data-action="copy-link"
                className="no-print"
                onClick={onCopy}
                aria-label="Copy link"
                title={copied ? "Copied" : "Copy link"}
                style={{ border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper-raised)", color: "var(--ink-soft)", width: 28, height: 28, cursor: "pointer", padding: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
                  <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" />
                </svg>
              </button>
            ) : null}
          </nav>
        ) : null}
      </div>
      {children}
    </header>
  );
}
