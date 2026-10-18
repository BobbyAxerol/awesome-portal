/**
 * UXM-07 S0 · the flag-off proof: with VITE_EXECUTION_V2_SCREENS unset the
 * preview frame renders exactly the markup it rendered before V2 existed.
 * The snapshot below was captured from the V1 frame before the V2 branch was
 * added; a diff here is a pixel change on every V1 screen.
 */
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewFrame } from "../ExecutionPreviewRoute";
import { EXECUTION_V2_SCREENS, EXECUTION_V2_SHELL, parseV2Manifest } from "./flags";

afterEach(cleanup);

describe("V2 flag off", () => {
  it("the manifest is empty and the shell flag is off", () => {
    expect(parseV2Manifest(undefined).size).toBe(0);
    expect(EXECUTION_V2_SCREENS.size).toBe(0);
    expect(EXECUTION_V2_SHELL).toBe(false);
  });

  it("PreviewFrame renders the V1 markup with no V2 element", async () => {
    let container!: HTMLElement;
    await act(async () => {
      container = render(
      <MemoryRouter initialEntries={["/execution/fleet"]}>
        <PreviewFrame screenId="alpha_fleet"><p>child</p></PreviewFrame>
      </MemoryRouter>,
      ).container;
    });
    expect(container.querySelector(".exec-ctxbar, .exec-cmdbar, .exec-flag")).toBeNull();
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div data-theme="operations-carbon" data-density="operational" data-surface="deployments" class="exec-surface exec-preview-shell"><aside class="exec-preview-banner" role="status" data-execution-preview="http"><strong>PORTAL READS · SAME-ORIGIN</strong><span>Every read is a same-origin Portal BFF call · commands go through the relay</span><details class="exec-preview-details"><summary>Details</summary><p>The browser calls only the Portal's declared /api/v1/execution routes on this origin. It never contacts AWS-HK, the Trading System, any broker or any database directly; screens whose contract is not published render a typed unavailable state instead of substitute data.</p></details><details class="exec-preview-inspector"><summary>Inspector</summary><dl class="exec-preview-inspector-list"><div><dt>screen</dt><dd><code data-preview-screen-id="true">alpha_fleet</code></dd></div><div><dt>delivery</dt><dd><code>http</code></dd></div><div><dt>build flag</dt><dd><code>VITE_EXECUTION_PREVIEW_ENABLED=true</code></dd></div></dl></details></aside><p>child</p></div>"`);
  });
});
