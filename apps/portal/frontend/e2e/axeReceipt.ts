/**
 * RF-04 · axe helpers shared by the Research probes.
 *
 * `analyze` runs axe on one screen root and returns EVERY finding, at every
 * impact level, node by node, with the colour pair axe measured. Nothing is
 * filtered: W5 landed the shared `--ink-faint` token (D-B1), so no finding is
 * accepted any more.
 *
 * `recordRow` writes one row per (screen, width) into a JSON receipt as soon as
 * the row is known. Playwright starts a fresh worker after a failed test, so
 * rows kept in module state until the end would lose everything recorded before
 * the failure. A row replaces an earlier row with the same key.
 */
import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Page } from "@playwright/test";

export interface AxeNodeFinding {
  target: string[];
  html: string;
  summary: string;
  foreground: string | null;
  background: string | null;
  contrast: number | null;
  /** Always `null`: no finding is accepted (the D-B1 exception was removed with the W5 token change). */
  accepted: null;
}

export interface AxeRuleFinding {
  rule: string;
  impact: string | null;
  help: string;
  help_url: string;
  nodes: AxeNodeFinding[];
}

export interface AxeResult {
  axe_version: string;
  violations: AxeRuleFinding[];
  /** Rules axe could not decide ("needs review"); listed, never counted as pass or fail. */
  incomplete: { rule: string; nodes: number }[];
  passes: number;
}

interface ColourData {
  fgColor?: string;
  bgColor?: string;
  contrastRatio?: number;
}

/** Runs axe on `include` (a selector) and returns every violation, node by node. */
export async function analyze(page: Page, include: string): Promise<AxeResult> {
  const result = await new AxeBuilder({ page }).include(include).analyze();
  const violations: AxeRuleFinding[] = result.violations.map((rule) => ({
    rule: rule.id,
    impact: rule.impact ?? null,
    help: rule.help,
    help_url: rule.helpUrl,
    nodes: rule.nodes.map((node) => {
      const data = (node.any[0]?.data ?? {}) as ColourData;
      const foreground = data.fgColor ?? null;
      return {
        target: node.target.map(String),
        html: node.html.length > 240 ? `${node.html.slice(0, 240)}…` : node.html,
        summary: (node.failureSummary ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
        foreground,
        background: data.bgColor ?? null,
        contrast: data.contrastRatio ?? null,
        accepted: null,
      };
    }),
  }));
  return {
    axe_version: result.testEngine.version,
    violations,
    incomplete: result.incomplete.map((rule) => ({ rule: rule.id, nodes: rule.nodes.length })),
    passes: result.passes.length,
  };
}

/** Nodes that fail a cell: every node (kept for callers; nothing is accepted any more). */
export function unaccepted(result: AxeResult): { rule: string; impact: string | null; target: string[]; foreground: string | null; background: string | null; summary: string }[] {
  return result.violations.flatMap((rule) =>
    rule.nodes
      .map((node) => ({ rule: rule.rule, impact: rule.impact, target: node.target, foreground: node.foreground, background: node.background, summary: node.summary })),
  );
}

/** Where a probe writes its receipt: `RESEARCH_A11Y_RECEIPT`, else `<RESEARCH_SHOT_DIR or /tmp/research-shots>/<name>`. */
export function receiptPath(name = "rf04-a11y-receipt.json"): string {
  return process.env.RESEARCH_A11Y_RECEIPT ?? join(process.env.RESEARCH_SHOT_DIR ?? "/tmp/research-shots", name);
}

/** Adds one row to the receipt (replacing a row with the same key) and writes the file at once. */
export function recordRow<T extends object>(label: string, key: string, row: T, file = receiptPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  const current = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { rows?: Array<T & { key: string }> }) : {};
  const rows = (current.rows ?? []).filter((r) => r.key !== key);
  rows.push({ key, ...row });
  rows.sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
  writeFileSync(file, `${JSON.stringify({ receipt: label, rows }, null, 2)}\n`);
}
