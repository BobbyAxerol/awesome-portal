/**
 * RF02-F3 · Q3 (Bobby, 2026-09-23): P03's query keys are deferred, not
 * forgotten. They are wired when the Portal ships a workspace selector — the
 * moment two workspaces can share one browser session. Until then there is one
 * workspace per session and logout unmounts every Research cache.
 *
 * This test is the trigger. It fails the day a workspace switch appears in
 * product code while `queryKeys.ts` is still unimported, so the deferral
 * cannot outlive its reason unnoticed.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function productFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return productFiles(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

const FILES = productFiles(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

/** What a workspace selector looks like in code: a way to change the active workspace. */
const WORKSPACE_SWITCH = /\b(switchWorkspace|setActiveWorkspace|selectWorkspace|WorkspaceSelector|WorkspaceSwitcher|onWorkspaceChange)\b/;

describe("RF02-F3 — the query-key deferral has a live trigger", () => {
  const switchers = FILES.filter((file) => WORKSPACE_SWITCH.test(file.text)).map((file) => file.path);
  const keyUsers = FILES.filter(
    (file) => !file.path.endsWith("queryKeys.ts") && /from "\.\/queryKeys"|from "\.\.\/research\/queryKeys"/.test(file.text),
  ).map((file) => file.path);

  it("wires query keys once a workspace can be switched", () => {
    if (switchers.length > 0) {
      expect(keyUsers, `workspace switch found in ${switchers.join(", ")} but queryKeys.ts is unused`).not.toEqual([]);
    }
  });

  it("records today's state: no workspace switch, so the deferral holds", () => {
    expect(switchers).toEqual([]);
  });
});
