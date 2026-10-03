import { Link } from "react-router-dom";

import { libraryHref } from "./runLinks";

/** D7: an unknown address under /research/quantbt: one sentence, one exit. */
export function ResearchNotFound() {
  return (
    <div
      data-research-not-found=""
      role="status"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "64px 16px", textAlign: "center" }}
    >
      <h1 style={{ fontSize: "var(--text-body, 14px)", fontWeight: 600 }}>Page not found.</h1>
      <Link to={libraryHref()} className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 16px" }}>
        Library
      </Link>
    </div>
  );
}
