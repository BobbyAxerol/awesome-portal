/**
 * W4 (fewer words) over VD-FG-01-01 — a refusal prints ONE short sentence. The reason
 * code, the request id and the server's sentence are the tooltip and the accessible
 * name of that sentence; none of them is printed text. A 403 and a 404 stay neutral:
 * the server's sentence is never offered, even as a tooltip.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PortalApiError } from "../lib/api";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import { NOTICE_SENTENCE } from "./ResearchNotice";
import { refusalDiagnostics, refusalState, toResearchRefusal } from "./researchRefusal";

afterEach(cleanup);

const SENTENCE = "zq server sentence: run R-9 is outside the admitted profile";
const refuse = (status: number, code: string | null, message = SENTENCE, requestId: string | null = "rq-77") =>
  toResearchRefusal(new PortalApiError(message, status, code, requestId));

describe("RefusalNote", () => {
  it("prints the short sentence; code, request id and the server sentence are the tooltip", () => {
    const { container } = render(
      <p>
        <RefusalNote refusal={refuse(404, "NOT_ADMITTED")} />
      </p>,
    );
    expect(container.textContent).toBe(NOTICE_SENTENCE.denied);
    const note = container.querySelector("[data-refusal-detail]")!;
    expect(note.getAttribute("data-refusal-code")).toBe("NOT_ADMITTED");
    expect(note.getAttribute("data-refusal-request")).toBe("rq-77");
    expect(note.getAttribute("title")).toContain("NOT_ADMITTED");
    expect(note.getAttribute("title")).toContain("request rq-77");
  });

  it("typed absence: no code, no sentence, no request id prints no tooltip and invents none", () => {
    const refusal = { ...refuse(500, null, "", null), detail: null };
    expect(refusalDiagnostics(refusal)).toBeNull();
    const { container } = render(
      <p>
        <RefusalNote refusal={refusal} />
      </p>,
    );
    expect(container.textContent).toBe(NOTICE_SENTENCE.unavailable);
    expect(container.querySelector("[data-refusal-detail]")?.getAttribute("title")).toBeNull();
    expect(container.querySelector("[data-refusal-code]")).toBeNull();
  });

  it("a refusal without a code still carries its request id and the sentence in the tooltip only", () => {
    const { container } = render(
      <p>
        <RefusalNote refusal={refuse(500, null)} />
      </p>,
    );
    const note = container.querySelector("[data-refusal-detail]")!;
    expect(container.querySelector("[data-refusal-code]")).toBeNull();
    expect(note.getAttribute("data-refusal-request")).toBe("rq-77");
    expect(note.getAttribute("title")).toContain(SENTENCE);
    expect(container.textContent).not.toContain("zq server sentence");
  });
});

describe("F-04 neutral denial", () => {
  it.each([
    [403, "RESEARCH_EVIDENCE_FORBIDDEN"],
    [404, "RESEARCH_SPLIT_NOT_FOUND"],
    [404, "RESEARCH_WORKSPACE_FORBIDDEN"],
    [403, null],
  ] as const)("%s %s keeps code and request id but offers no server sentence, not even as a title", (status, code) => {
    const refusal = refuse(status, code, "run R-WFO-118 belongs to workspace ws_quant_desk");
    expect(refusal.notFound).toBe(true);
    expect(refusalDiagnostics(refusal)?.sentence).toBeNull();
    const { container } = render(
      <p>
        <RefusalNote refusal={refusal} />
      </p>,
    );
    const note = container.querySelector("[data-refusal-detail]")!;
    expect(note.getAttribute("title")).not.toContain("ws_quant_desk");
    expect(note.getAttribute("title")).toContain("request rq-77");
    expect(container.innerHTML).not.toContain("ws_quant_desk");
    expect(container.textContent).toBe(NOTICE_SENTENCE.denied);
  });
});

describe("ResearchPanel notice for a refusal state", () => {
  it("shows ONE short sentence; code and request id are attributes and the tooltip, never printed", () => {
    const state = refusalState(refuse(503, "RESEARCH_SPLIT_UNAVAILABLE"), false);
    const { container } = render(<ResearchPanel title="p" state={state} />);
    const notice = container.querySelector("[data-research-notice]")!;
    expect(notice.getAttribute("data-research-state")).toBe("unavailable");
    expect(notice.textContent).toContain(NOTICE_SENTENCE.unavailable);
    expect(notice.getAttribute("data-refusal-code")).toBe("RESEARCH_SPLIT_UNAVAILABLE");
    expect(notice.getAttribute("data-refusal-request")).toBe("rq-77");
    expect(notice.textContent).not.toContain("RESEARCH_SPLIT_UNAVAILABLE");
    expect(notice.textContent).not.toContain("rq-77");
    expect(notice.textContent).not.toContain("zq server sentence");
    expect(notice.querySelector("details")).toBeNull();
    const tip = screen.getByTitle(/RESEARCH_SPLIT_UNAVAILABLE/);
    expect(tip.getAttribute("title")).toContain("request rq-77");
    expect(tip.getAttribute("title")).toContain(SENTENCE);
    expect(tip.getAttribute("tabindex")).toBe("0");
  });

  it("typed absence: a refusal with nothing to say carries no tooltip row", () => {
    const state = refusalState({ ...refuse(503, null, "", null), detail: null }, false);
    expect(state.diagnostics).toBeNull();
    const { container } = render(<ResearchPanel title="p" state={state} />);
    expect(container.querySelector("[data-refusal-code]")).toBeNull();
    expect(container.querySelector("[data-research-detail]")).toBeNull();
  });
});
