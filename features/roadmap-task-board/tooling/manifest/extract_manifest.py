#!/usr/bin/env python3
"""Phase 1 — content-integrity-manifest extractor for the golden portal.

Reads legacy/portal.html (the frozen golden source) and emits a deterministic
manifest: byte-exact SHA-256 per doc-page (markup + text), per mermaid-source,
per code block, per link list and per seed-data block, plus a full inventory
of ids, data-page-ids, headings, API endpoints, localStorage keys and hash
routes.

Run:
    python3 tooling/manifest/extract_manifest.py            # write manifest
    python3 tooling/manifest/extract_manifest.py --verify   # re-compute + compare
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "legacy" / "portal.html"
MANIFEST_PATH = ROOT / "docs" / "contracts" / "content-integrity-manifest.json"
EXTRACTOR_VERSION = "1.0.0"


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def strip_tags(value: str) -> str:
    text = re.sub(r"<[^>]+>", "", value)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n", text).strip()


def section_ranges(source: str) -> List[Dict[str, Any]]:
    """Locate each <section ... data-page-id="..."> ... </section> as raw slices."""
    starts = list(re.finditer(r"<section\b[^>]*\bdata-page-id=(\"[^\"]+\"|'[^']+')[^>]*>", source))
    result: List[Dict[str, Any]] = []
    for start in starts:
        page_id = start.group(1)[1:-1]
        i = start.end()
        depth = 1
        while depth and i < len(source):
            open_tag = source.find("<section", i)
            close_tag = source.find("</section>", i)
            if close_tag == -1:
                break
            if open_tag != -1 and open_tag < close_tag:
                depth += 1
                i = open_tag + len("<section")
            else:
                depth -= 1
                i = close_tag + len("</section>")
        if depth == 0:
            result.append(
                {
                    "page_id": page_id,
                    "start": start.start(),
                    "end": i,
                    "markup": source[start.start() : i],
                    "inner": source[start.end() : i - len("</section>")],
                }
            )
        else:
            print(f"WARN: unbalanced section for {page_id}", file=sys.stderr)
    return result


def extract_seed(source: str, name: str) -> Dict[str, Any]:
    """Extract a top-level `const NAME = [...] ;` JSON literal, raw and parsed."""
    pattern = re.compile(r"\bconst\s+" + name + r"\s*=\s*(\[.*?\])\s*;", re.S)
    match = pattern.search(source)
    if not match:
        return {"found": False}
    raw = match.group(1)
    parsed = json.loads(raw)
    return {
        "found": True,
        "sha256": sha256(raw),
        "count": len(parsed),
        "ids": [str(item.get("id", "")) for item in parsed],
    }


def build_manifest(source: str) -> Dict[str, Any]:
    doc_pages: List[Dict[str, str]] = []
    for section in section_ranges(source):
        title = re.search(r'data-title="([^"]+)"', section["markup"].split(">", 1)[0])
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", section["inner"], re.S)
        doc_pages.append(
            {
                "data_page_id": section["page_id"],
                "data_title": html.unescape(title.group(1)) if title else "",
                "h1": strip_tags(h1.group(1)) if h1 else "",
                "sha256_markup": sha256(section["inner"]),
                "sha256_text": sha256(strip_tags(section["inner"])),
            }
        )

    mermaid_sources: List[Dict[str, str]] = []
    for match in re.finditer(r'<div class="mermaid-source"[^>]*>(.*?)</div>', source, re.S):
        raw = match.group(1)
        mermaid_sources.append(
            {"index": len(mermaid_sources), "sha256": sha256(raw), "preview": raw[:80]}
        )

    code_blocks: List[Dict[str, str]] = []
    for match in re.finditer(r"<pre><code class=\"language-([a-z0-9]+)\">(.*?)</code></pre>", source, re.S):
        code_blocks.append(
            {
                "index": len(code_blocks),
                "language": match.group(1),
                "sha256": sha256(match.group(2)),
                "preview": match.group(2)[:80],
            }
        )

    hrefs = [m.group(1) for m in re.finditer(r'href="([^"]+)"', source)]
    views = sorted(set(re.findall(r"data-view=['\"]([a-z]+)['\"]", source)))
    api_endpoints = sorted(
        set(
            match.group(1)
            for match in re.finditer(r"['\"](/?api/[a-z0-9_/{}-]+)['\"]", source)
        )
    )
    storage_keys = sorted(
        set(re.findall(r"['\"]quant\w+V1['\"]|['\"]quantPortalTheme['\"]", source))
    )

    return {
        "schema_version": 1,
        "extractor_version": EXTRACTOR_VERSION,
        "source": str(GOLDEN.relative_to(ROOT)),
        "source_sha256": sha256(source),
        "doc_pages": doc_pages,
        "mermaid_sources": mermaid_sources,
        "code_blocks": code_blocks,
        "links": {"count": len(hrefs), "sha256": sha256("\n".join(sorted(hrefs)))},
        "seed_data": {
            "BASE_TASKS": extract_seed(source, "BASE_TASKS"),
            "ROADMAP_PHASES": extract_seed(source, "ROADMAP_PHASES"),
        },
        "inventory": {
            "ids": sorted(set(re.findall(r'\bid="([^"]+)"', source))),
            "data_page_ids": [page["data_page_id"] for page in doc_pages],
            "views": views,
            "hash_routes": ["#view=" + view for view in views],
            "api_endpoints": api_endpoints,
            "localstorage_keys": [key.strip("'\"") for key in storage_keys],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Portal content integrity manifest")
    parser.add_argument("--verify", action="store_true", help="re-compute and compare against stored manifest")
    args = parser.parse_args()

    if not GOLDEN.exists():
        print(f"golden source missing: {GOLDEN}", file=sys.stderr)
        return 2
    source = GOLDEN.read_text(encoding="utf-8")
    computed = build_manifest(source)

    if not args.verify:
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_text(json.dumps(computed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary = (
            f"doc_pages={len(computed['doc_pages'])} "
            f"mermaid={len(computed['mermaid_sources'])} "
            f"code_blocks={len(computed['code_blocks'])} "
            f"links={computed['links']['count']} "
            f"ids={len(computed['inventory']['ids'])}"
        )
        print(f"wrote {MANIFEST_PATH.relative_to(ROOT)} — {summary}")
        return 0

    stored = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    failures: List[str] = []
    if stored["source_sha256"] != computed["source_sha256"]:
        failures.append("source_sha256")
    if stored["doc_pages"] != computed["doc_pages"]:
        failures.append("doc_pages")
    if stored["mermaid_sources"] != computed["mermaid_sources"]:
        failures.append("mermaid_sources")
    if stored["code_blocks"] != computed["code_blocks"]:
        failures.append("code_blocks")
    if stored["links"] != computed["links"]:
        failures.append("links")
    if stored["seed_data"] != computed["seed_data"]:
        failures.append("seed_data")
    if stored["inventory"] != computed["inventory"]:
        failures.append("inventory")
    if failures:
        print(f"VERIFY FAIL: {', '.join(failures)}", file=sys.stderr)
        return 1
    print("VERIFY OK — content integrity matches golden baseline")
    return 0


if __name__ == "__main__":
    sys.exit(main())
