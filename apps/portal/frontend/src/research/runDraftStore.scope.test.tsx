import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyDraft } from "./NewRunRoute";
import { RunLibrary } from "./RunLibrary";
import type { RunLibraryResponse } from "./runLibraryClient";
import { readLibraryDraftSummary } from "./libraryDraftChip";
import { researchState } from "./state";
import { RUN_DRAFT_STORAGE_KEY, clearRunDraft, readDraftSummary, restoreRunDraft, runDraftScope, runDraftStorageKey, saveRunDraft } from "./runDraftStore";

const auth = vi.hoisted(() => ({ actorId: "actor_a" as string | null }));
vi.mock("../auth/session", () => ({ useSession: () => ({ principal: auth.actorId ? { principalId: auth.actorId } : null, access: { kind: "unavailable", requestId: null } }) }));
const A = runDraftScope("actor_a", "workspace_a")!, B = runDraftScope("actor_a", "workspace_b")!, OTHER = runDraftScope("actor_b", "workspace_a")!;
const draft = () => ({ ...emptyDraft(), symbol: "BTCUSDT", datasetId: "real-fixture-dataset" });
beforeEach(() => { window.sessionStorage.clear(); auth.actorId = "actor_a"; });
afterEach(cleanup);

it("A autosave cannot restore in workspace B/another actor; returning to original A resumes it", () => {
  const held = draft(); saveRunDraft(held, A);
  expect(restoreRunDraft(emptyDraft(), "", B)).toBeNull();
  expect(restoreRunDraft(emptyDraft(), "", OTHER)).toBeNull();
  expect(restoreRunDraft(emptyDraft(), "", A)).toEqual(held);
  expect(readLibraryDraftSummary(A)).not.toBeNull();
  expect(readLibraryDraftSummary(B)).toBeNull();
  expect(readLibraryDraftSummary(OTHER)).toBeNull();
});
it("unknown auth/workspace disables persistence and never adopts a legacy global draft", () => {
  window.sessionStorage.setItem(RUN_DRAFT_STORAGE_KEY, JSON.stringify(draft()));
  expect(runDraftScope(null, "workspace_a")).toBeNull();
  expect(runDraftScope("actor_a", undefined)).toBeNull();
  for (const scope of [undefined, null, A]) {
    expect(restoreRunDraft(emptyDraft(), "", scope)).toBeNull();
    expect(readDraftSummary(scope)).toBeNull();
  }
  saveRunDraft(draft()); expect(window.sessionStorage.length).toBe(1);
  expect(window.sessionStorage.getItem(runDraftStorageKey(A)!)).toBeNull();
});
it("a payload claiming a different actor/workspace is refused even under the scoped key", () => {
  window.sessionStorage.setItem(runDraftStorageKey(A)!, JSON.stringify({ version: 2, actor_id: "actor_b", workspace_id: A.workspaceId, draft: draft() }));
  expect(restoreRunDraft(emptyDraft(), "", A)).toBeNull();
});
it("clearing A does not delete B or another actor's stored declaration", () => {
  saveRunDraft(draft(), A); saveRunDraft(draft(), B); saveRunDraft(draft(), OTHER);
  clearRunDraft(A);
  expect(restoreRunDraft(emptyDraft(), "", A)).toBeNull();
  expect(restoreRunDraft(emptyDraft(), "", B)).toEqual(draft());
  expect(restoreRunDraft(emptyDraft(), "", OTHER)).toEqual(draft());
});
it("the product Library chip consumes only the authenticated actor and explicit workspace", () => {
  saveRunDraft(draft(), A);
  const fixture = JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8")) as RunLibraryResponse;
  const mount = (workspaceId: string) => render(<MemoryRouter initialEntries={[`/research/quantbt/runs?workspace_id=${workspaceId}`]}><RunLibrary workspaceId={workspaceId} filters={{ q: "", status: [], mode: [], alpha: [], group: false, sel: [] }} onFilters={() => {}} onToggleSel={() => {}} response={fixture} items={[]} state={researchState({ kind: "ok", rowCount: 0 })} sparklines={new Map()} onVisible={() => {}} onLoadNext={() => {}} onLoadPrevious={() => {}} /></MemoryRouter>);
  mount(A.workspaceId);
  expect(document.querySelector('[data-action="continue-draft"]')?.getAttribute("href")).toContain(`workspace_id=${A.workspaceId}`);
  cleanup(); mount(B.workspaceId); expect(document.querySelector('[data-action="continue-draft"]')).toBeNull();
  cleanup(); auth.actorId = "actor_b"; mount(A.workspaceId); expect(document.querySelector('[data-action="continue-draft"]')).toBeNull();
  cleanup(); auth.actorId = null; mount(A.workspaceId); expect(document.querySelector('[data-action="continue-draft"]')).toBeNull();
});
