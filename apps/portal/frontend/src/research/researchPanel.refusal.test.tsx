/**
 * VD-FG-01-01 (Bobby, 2026-10-01) — a refusal shows its reason-code chip and
 * request id; the server's sentence is a tooltip with an accessible name and is
 * never printed. The typed state and the code stay on screen.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PortalApiError } from "../lib/api";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import { REFUSAL_COPY, refusalDiagnostics, refusalState, toResearchRefusal } from "./researchRefusal";

afterEach(cleanup);

const SENTENCE = "zq server sentence: run R-9 is outside the admitted profile";
const refuse = (status: number, code: string | null, message = SENTENCE, requestId: string | null = "rq-77") =>
  toResearchRefusal(new PortalApiError(message, status, code, requestId));

describe("RefusalNote", () => {
  it("prints the fixed sentence, the code chip and the request id; the server sentence is the title", () => {
    const { container } = render(
      <p>
        <RefusalNote refusal={refuse(404, "NOT_ADMITTED")} />
      </p>,
    );
    const text = container.textContent ?? "";
    expect(text).toContain(REFUSAL_COPY.denied);
    expect(container.querySelector("[data-refusal-code]")?.textContent).toBe("NOT_ADMITTED");
    expect(container.querySelector("[data-refusal-request]")?.textContent).toBe("request_id rq-77");
    expect(text).not.toContain("zq server sentence");
    const note = container.querySelector("[data-refusal-detail]")!;
    expect(note.getAttribute("title")).toBe(SENTENCE);
    expect(note.getAttribute("aria-label")).toContain(SENTENCE);
    expect(note.getAttribute("aria-label")).toContain("NOT_ADMITTED");
    expect(screen.getByRole("note", { name: /NOT_ADMITTED — zq server sentence/ })).toBe(note);
  });

  it("typed absence: no code, no sentence, no request id prints no chip and invents none", () => {
    const refusal = { ...refuse(500, null, "", null), detail: null };
    expect(refusalDiagnostics(refusal)).toBeNull();
    const { container } = render(
      <p>
        <RefusalNote refusal={refusal} />
      </p>,
    );
    expect(container.textContent).toBe(REFUSAL_COPY.unavailable);
    expect(container.querySelector("[data-refusal-detail]")).toBeNull();
    expect(container.querySelector("[data-refusal-code]")).toBeNull();
  });

  it("a refusal without a code still shows its request id and keeps the sentence as the tooltip only", () => {
    const { container } = render(
      <p>
        <RefusalNote refusal={refuse(500, null)} />
      </p>,
    );
    expect(container.querySelector("[data-refusal-code]")).toBeNull();
    expect(container.querySelector("[data-refusal-request]")?.textContent).toBe("request_id rq-77");
    expect(container.querySelector("[data-refusal-detail]")?.getAttribute("title")).toBe(SENTENCE);
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
    expect(note.getAttribute("title")).toBeNull();
    expect(note.getAttribute("aria-label")).toBeNull();
    expect(container.innerHTML).not.toContain("ws_quant_desk");
    expect(container.querySelector("[data-refusal-request]")?.textContent).toBe("request_id rq-77");
  });
});

describe("ResearchPanel notice for a refusal state", () => {
  it("shows state word, fixed reason, code chip and request id, never the server sentence", () => {
    const state = refusalState(refuse(503, "RESEARCH_SPLIT_UNAVAILABLE"), false);
    const { container } = render(<ResearchPanel title="p" state={state} />);
    const notice = container.querySelector("[data-research-state]")!;
    expect(notice.textContent).toContain("unavailable");
    expect(notice.textContent).toContain(REFUSAL_COPY.unavailable);
    expect(notice.querySelector("[data-refusal-code]")?.textContent).toBe("RESEARCH_SPLIT_UNAVAILABLE");
    expect(notice.textContent).toContain("request_id rq-77");
    expect(notice.textContent).not.toContain("zq server sentence");
    expect(notice.querySelector("details")).toBeNull();
    expect(notice.querySelector("[data-refusal-detail]")?.getAttribute("title")).toBe(SENTENCE);
  });

  it("typed absence: a refusal with nothing to say renders no diagnostics row", () => {
    const state = refusalState({ ...refuse(503, null, "", null), detail: null }, false);
    expect(state.diagnostics).toBeNull();
    const { container } = render(<ResearchPanel title="p" state={state} />);
    expect(container.querySelector("[data-refusal-detail]")).toBeNull();
    expect(container.querySelector("[data-research-detail]")).toBeNull();
  });
});
