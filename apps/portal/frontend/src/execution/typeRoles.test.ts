/**
 * EL-V2-02 structural gate — the type-role scale is the only typography.
 *
 * Before this phase, `execution.css` carried 151 `font-family` and 201
 * `font-size` declarations, 127 of them "10px monospace"; nothing could stop a
 * screen inventing a size, and nothing noticed that IBM Plex was declared and
 * never loaded. These checks read the stylesheet and the token file rather
 * than a rendered page, so they fail in unit time, on the exact line.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "execution.css"), "utf8");
const tokens = readFileSync(join(__dirname, "../styles/tokens.css"), "utf8");
const base = readFileSync(join(__dirname, "../styles/base.css"), "utf8");

/** §5.2, verbatim. */
const SCALE: Record<string, { size: number; line: number; family: "body" | "mono"; weight: number }> = {
  title: { size: 24, line: 32, family: "body", weight: 400 },
  subtitle: { size: 14, line: 20, family: "body", weight: 400 },
  section: { size: 15, line: 22, family: "body", weight: 600 },
  body: { size: 13, line: 20, family: "body", weight: 400 },
  control: { size: 13, line: 18, family: "body", weight: 500 },
  th: { size: 11, line: 16, family: "body", weight: 500 },
  data: { size: 12, line: 18, family: "body", weight: 400 },
  num: { size: 14, line: 20, family: "mono", weight: 400 },
  kpi: { size: 24, line: 32, family: "mono", weight: 400 },
  // Owner override 2026-08-25 (EL-V2-10, "chữ ở đâu cũng không phải một kiểu"):
  // meta and caption are prose and read in the sans; `id` is the mono role
  // for identifiers. Mono is evidence only: num · kpi · id · term.
  meta: { size: 12, line: 16, family: "body", weight: 400 },
  id: { size: 12, line: 16, family: "mono", weight: 400 },
  term: { size: 12, line: 18, family: "mono", weight: 400 },
  caption: { size: 11, line: 14, family: "body", weight: 400 },
};

describe("the locked role scale", () => {
  it("defines every §5.2 role with exactly the published size, line, weight and family", () => {
    for (const [role, spec] of Object.entries(SCALE)) {
      const m = new RegExp(`--exec-font-${role}:\\s*(\\d+)\\s+(\\d+)px/(\\d+)px\\s+var\\(--font-(body|mono)\\);`).exec(css);
      expect(m, `--exec-font-${role} missing or malformed`).not.toBeNull();
      expect(Number(m![1]), `${role} weight`).toBe(spec.weight);
      expect(Number(m![2]), `${role} size`).toBe(spec.size);
      expect(Number(m![3]), `${role} line`).toBe(spec.line);
      expect(m![4], `${role} family`).toBe(spec.family);
    }
  });

  it("has no font-family or font-size declaration anywhere — every rule goes through a role", () => {
    // The role tokens themselves use the `font:` shorthand, so a literal
    // `font-family:` or `font-size:` is, by construction, a screen inventing
    // its own typography.
    const families = css.match(/font-family\s*:/g) ?? [];
    const sizes = css.match(/font-size\s*:/g) ?? [];
    expect(families, "font-family literals (was 151)").toHaveLength(0);
    expect(sizes, "font-size literals (was 201)").toHaveLength(0);
  });

  it("uses only the roles it defines", () => {
    const used = new Set((css.match(/--exec-font-([a-z]+)\)/g) ?? []).map((s) => s.replace(/--exec-font-|\)/g, "")));
    for (const role of used) expect(Object.keys(SCALE), `unknown role ${role}`).toContain(role);
    // And a scan that finds nothing is not a pass.
    expect(used.size).toBeGreaterThan(8);
  });

  it("never applies uppercase outside the table-header role", () => {
    // Universal uppercase was half of the "micro-mono" effect. th keeps it as
    // an option (§5.2); nothing else shouts.
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const offenders = rules
      // Command Center v4 matches hi-fi 5a to the letter (owner, 2026-08-25):
      // mono 11px uppercase panel titles and 10px uppercase cell labels.
      // A comment sitting above a rule is captured with its selector, which
      // made the prefix test fail on a rule that is exempt — the comment was
      // never the thing being audited.
      .map(([m, sel, body]) => [m, sel.replace(/\/\*[\s\S]*?\*\//g, "").trim(), body] as [string, string, string])
      .filter(([, sel, body]) => /text-transform\s*:\s*uppercase/.test(body) && !/--exec-font-th\)/.test(body) && !/\.exec-role-th/.test(sel) && !/^\s*\.exec-(cc|inc2|oq|bl|af|a3|rp|pf2|ab|bd|ac|lv|lf|cn|sbc|sb|pw|px|po|360|surface|gov|gate|cli)[-\s]/.test(sel))
      .map(([, sel]) => sel.trim().replace(/\s+/g, " ").slice(0, 60));
    expect(offenders).toEqual([]);
  });
});

describe("two families, and only the two that are bundled", () => {
  it("declares IBM Plex Sans and IBM Plex Mono for the Carbon surface — and bundles them", () => {
    // Owner, 2026-08-25: the hi-fi family returns, this time with the bytes
    // behind it (main.tsx imports @fontsource/ibm-plex-*). The claim and the
    // bundle must agree; the test below checks the package side.
    const carbon = tokens.slice(tokens.indexOf('[data-theme="operations-carbon"]'));
    expect(carbon).toMatch(/--font-body:\s*"IBM Plex Sans"/);
    expect(carbon).toMatch(/--font-mono:\s*"IBM Plex Mono"/);
    const main = readFileSync(join(__dirname, "../main.tsx"), "utf8");
    expect(main).toMatch(/@fontsource\/ibm-plex-sans\/300\.css/);
    expect(main).toMatch(/@fontsource\/ibm-plex-mono\/400\.css/);
  });

  it("keeps base.css reading the tokens rather than hard-coding families", () => {
    // §5.1: shared selectors must read semantic font tokens, or the Execution
    // surface cannot change typography through tokens at all.
    expect(base).not.toMatch(/font-family:\s*"(Inter|JetBrains|Newsreader)/);
  });

  it("only resolves families the package bundles", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@fontsource/inter"]).toBeTruthy();
    expect(pkg.dependencies["@fontsource/jetbrains-mono"]).toBeTruthy();
    expect(pkg.dependencies["@fontsource/ibm-plex-sans"]).toBeTruthy();
    expect(pkg.dependencies["@fontsource/ibm-plex-mono"]).toBeTruthy();
  });
});
