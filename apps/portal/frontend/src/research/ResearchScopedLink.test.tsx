import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { ResearchScopedLink, ResearchScopedLineageLink, ResearchScopedAnchor, workspaceNamedHref } from "./ResearchScopedLink";

afterEach(cleanup);

it("preserves query/hash and appends one encoded workspace to a named Research link", () => {
  const href = workspaceNamedHref("/research/quantbt/runs/rrun_test/search?read=retained#fold=3", "ws&review");
  const url = new URL(href as string, "http://localhost");
  expect(url.searchParams.get("read")).toBe("retained");
  expect(url.searchParams.getAll("workspace_id")).toEqual(["ws&review"]);
  expect(url.hash).toBe("#fold=3");
});

it("never replaces or duplicates an explicit destination workspace", () => {
  const href = "/research/quantbt/compare?workspace_id=ws-destination&mode=pair#fold=3";
  expect(workspaceNamedHref(href, "ws-current")).toBe(href);
});

it("does not scope external, unrelated, relative or object destinations", () => {
  for (const href of ["https://other.example/research/quantbt/runs", "//other.example/research/quantbt/runs", "/execution", "/research/quantbtx", "../runs", "#fold=3"])
    expect(workspaceNamedHref(href, "ws-current")).toBe(href);
  const to = { pathname: "/execution", search: "?a=1" };
  expect(workspaceNamedHref(to, "ws-current")).toBe(to);
  expect(workspaceNamedHref("/research/quantbt/runs")).toBe("/research/quantbt/runs");
});

it("keeps the original single anchor DOM, props, content and forwarded ref", () => {
  const ref = createRef<HTMLAnchorElement>();
  const { container } = render(<MemoryRouter initialEntries={["/research/quantbt/compare?workspace_id=ws-current"]}>
    <ResearchScopedLink ref={ref} to="/research/quantbt/runs/rrun_test/report#stage=execute" className="existing-token" title="existing-copy" data-action="existing-action">Report</ResearchScopedLink>
  </MemoryRouter>);
  expect(container.children).toHaveLength(1);
  expect(ref.current).toBe(container.querySelector("a"));
  expect(ref.current?.className).toBe("existing-token");
  expect(ref.current?.title).toBe("existing-copy");
  expect(ref.current?.textContent).toBe("Report");
  expect(ref.current?.dataset.action).toBe("existing-action");
  expect(ref.current?.getAttribute("href")).toBe("/research/quantbt/runs/rrun_test/report?workspace_id=ws-current#stage=execute");
});

it("scopes S13's lightweight lineage links without changing their DOM or data props", () => {
  const { container } = render(<MemoryRouter initialEntries={["/research/quantbt/compare?workspace_id=ws-current"]}>
    <ResearchScopedLineageLink to="/research/quantbt/alphas/alpha_test/lineage?run=rrun_test" action="open-lineage" primary extra={{ "data-source": "original" }}>Lineage</ResearchScopedLineageLink>
  </MemoryRouter>);
  const link = container.querySelector("a")!;
  expect(container.children).toHaveLength(1);
  expect(link.dataset.action).toBe("open-lineage");
  expect(link.dataset.primary).toBe("true");
  expect(link.dataset.source).toBe("original");
  expect(new URL(link.href).searchParams.get("workspace_id")).toBe("ws-current");
  expect(new URL(link.href).searchParams.get("run")).toBe("rrun_test");
});

it("retains S14's original same-origin anchor fallback outside a Router", () => {
  const { container } = render(<ResearchScopedLineageLink to="/research/quantbt/runs/new?alpha=alpha_test" action="new-run">Run</ResearchScopedLineageLink>);
  expect(container.children).toHaveLength(1);
  const link = container.querySelector("a")!;
  expect(link.getAttribute("href")).toBe("/research/quantbt/runs/new?alpha=alpha_test");
  expect(link.dataset.action).toBe("new-run");
});

it("native anchors keep native DOM, modified-click semantics, standalone fallback and query/hash scope", () => {
  const ref = createRef<HTMLAnchorElement>();
  const { container, unmount } = render(<MemoryRouter initialEntries={["/research/quantbt/runs?workspace_id=ws-current"]}><ResearchScopedAnchor ref={ref} href="/research/quantbt/runs/r/progress#fold=3" target="_blank" title="original" data-native>Progress</ResearchScopedAnchor></MemoryRouter>);
  expect(container.children).toHaveLength(1);
  expect(ref.current?.getAttribute("href")).toBe("/research/quantbt/runs/r/progress?workspace_id=ws-current#fold=3");
  expect(ref.current?.target).toBe("_blank");
  expect(ref.current?.title).toBe("original");
  unmount();
  const isolated = render(<ResearchScopedAnchor href="/research/quantbt/runs">Runs</ResearchScopedAnchor>);
  expect(isolated.container.querySelector("a")?.getAttribute("href")).toBe("/research/quantbt/runs");
});
