/**
 * Flag — kind, not label, decides the glyph and the colour.
 *
 * The defect these tests close is the kit's regex: "Recall pending" came out as
 * pending, "Needs attention" as a failure and "Accepted" as applied. A caller
 * picks the kind from the enum; nothing here reads the label to decide it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Flag } from "./Flag";
import { FLAG_KINDS, FLAG_KIND_TABLE } from "./flagKinds";

afterEach(cleanup);

const SRC = join(__dirname, "../..");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

describe("Flag", () => {
  it("covers the 16 kinds, including neutral and attention", () => {
    expect(FLAG_KINDS).toHaveLength(16);
    expect(FLAG_KINDS).toContain("neutral");
    expect(FLAG_KINDS).toContain("attention");
    expect(Object.keys(FLAG_KIND_TABLE).sort()).toEqual([...FLAG_KINDS].sort());
  });

  for (const kind of FLAG_KINDS) {
    it(`${kind}: renders data-k, a decorative glyph and its canonical label`, () => {
      const spec = FLAG_KIND_TABLE[kind];
      const { container } = render(<Flag kind={kind} />);
      const flag = container.querySelector(".exec-flag")!;
      expect(flag.tagName).toBe("SPAN");
      expect(flag.getAttribute("data-k")).toBe(kind);
      const glyph = flag.querySelector("[aria-hidden='true']")!;
      expect(glyph.textContent).toBe(spec.glyph);
      expect(spec.glyph.length).toBeGreaterThan(0);
      // The word is real text, so colour and shape are never the only cue.
      expect(flag.textContent).toBe(`${spec.glyph}${spec.label}`);
      expect(screen.getByText(spec.label)).toBeTruthy();
    });
  }

  it("never lets partial, stale, unknown or pending borrow the tick of applied or ok", () => {
    const tick = new Set([FLAG_KIND_TABLE.ok.glyph, FLAG_KIND_TABLE.applied.glyph]);
    for (const kind of ["partial", "stale", "unknown", "pending"] as const) {
      expect(tick.has(FLAG_KIND_TABLE[kind].glyph), kind).toBe(false);
    }
  });

  it("gives every kind but the ok and applied pair a glyph of its own", () => {
    const seen = new Map<string, string>();
    const shared: string[] = [];
    for (const kind of FLAG_KINDS) {
      const glyph = FLAG_KIND_TABLE[kind].glyph;
      const first = seen.get(glyph);
      if (first) shared.push(`${first}+${kind}`);
      else seen.set(glyph, kind);
    }
    expect(shared).toEqual(["ok+applied"]);
  });

  it("keeps the label a caller supplies and announces the kind before it", () => {
    const { container } = render(<Flag kind="applied" label="Synced" />);
    const flag = container.querySelector(".exec-flag")!;
    expect(flag.getAttribute("data-k")).toBe("applied");
    expect(flag.querySelector(".exec-flag-sr")!.textContent).toBe("Applied: ");
    expect(flag.textContent).toContain("Synced");
  });

  it("does not announce twice when the label is the kind's own word", () => {
    const { container } = render(<Flag kind="stale" />);
    expect(container.querySelector(".exec-flag-sr")).toBeNull();
  });

  it("does not take the kind from the label", () => {
    const { container } = render(<Flag kind="recall" label="Pending recall" />);
    expect(container.querySelector(".exec-flag")!.getAttribute("data-k")).toBe("recall");
  });

  it("falls back to the canonical label when the caller's is blank", () => {
    render(<Flag kind="partial" label="  " />);
    expect(screen.getByText(FLAG_KIND_TABLE.partial.label)).toBeTruthy();
  });

  it("marks the size for table cells and is never a button", () => {
    const { container } = render(<Flag kind="ok" size="sm" />);
    expect(container.querySelector(".exec-flag")!.getAttribute("data-size")).toBe("sm");
    expect(container.querySelector("button, [role='button'], a")).toBeNull();
  });
});

describe("flag.css against the tokens", () => {
  const css = read("execution/v2/css/flag.css");
  const tokens = read("styles/tokens.css");

  it("writes a direct ink/tint/border pair for every kind, with no indirection", () => {
    for (const kind of FLAG_KINDS) {
      const rule = new RegExp(`\\.exec-flag\\[data-k="${kind}"\\]\\s*\\{([^}]*)\\}`).exec(css);
      expect(rule, `no rule for ${kind}`).not.toBeNull();
      const body = rule![1];
      expect(body).toMatch(new RegExp(`(?:^|[\\s;])color:\\s*var\\(--f-${kind}\\);`));
      expect(body).toMatch(new RegExp(`background:\\s*var\\(--f-${kind}-bg\\);`));
      expect(body).toMatch(new RegExp(`border-color:\\s*var\\(--f-${kind}\\);`));
    }
    expect(css).not.toMatch(/--c\b|--bg\b/);
  });

  it("references only flag tokens that tokens.css declares", () => {
    const used = new Set([...css.matchAll(/var\((--f-[a-z-]+)\)/g)].map((m) => m[1]));
    const missing = [...used].filter((name) => !new RegExp(`^\\s*${name}:`, "m").test(tokens));
    expect(missing).toEqual([]);
  });

  it("takes its type from the label role and holds no colour literal", () => {
    expect(css).toContain("font: var(--exec-font-label)");
    expect(css).not.toMatch(/font-(?:family|size)\s*:/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|color-mix\(/);
  });
});
