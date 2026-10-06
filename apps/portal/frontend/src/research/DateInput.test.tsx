import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateInput, dateInputValue } from "./DateInput";

afterEach(cleanup);

describe("dateInputValue", () => {
  it("reads the date of any draft instant and keeps a non-midnight time", () => {
    expect(dateInputValue("")).toEqual({ input: "", kept: null, raw: null });
    expect(dateInputValue("2026-05-01T00:00")).toEqual({ input: "2026-05-01", kept: null, raw: null });
    expect(dateInputValue("2026-05-01T00:00:00Z")).toEqual({ input: "2026-05-01", kept: null, raw: null });
    expect(dateInputValue("2026-05-01")).toEqual({ input: "2026-05-01", kept: null, raw: null });
    expect(dateInputValue("2026-05-01T23:00")).toEqual({ input: "2026-05-01", kept: "+23:00", raw: null });
    expect(dateInputValue("2026-05-01T07:30:15Z")).toEqual({ input: "2026-05-01", kept: "+07:30:15", raw: null });
    expect(dateInputValue("2026-05-01T00:00:00.500Z").kept).toBe("+00:00:00.500");
    expect(dateInputValue("May 1")).toEqual({ input: "", kept: null, raw: "May 1" });
  });
});

describe("DateInput", () => {
  it("is a labelled date input with a UTC suffix", () => {
    render(<DateInput value="2026-05-01T00:00" onChange={() => undefined} label="IS start (A)" describedBy="e" invalid />);
    const input = screen.getByLabelText("IS start (A)") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.value).toBe("2026-05-01");
    expect(input.getAttribute("aria-describedby")).toBe("e");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector("[data-utc-suffix]")!.textContent).toBe("UTC");
    expect(document.querySelector("[data-instant-time-kept]")).toBeNull();
  });

  it("emits midnight for a date and an empty string when cleared", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} label="D" />);
    fireEvent.change(screen.getByLabelText("D"), { target: { value: "2026-06-02" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-06-02T00:00");
    cleanup();
    render(<DateInput value="2026-06-02T00:00" onChange={onChange} label="D" />);
    fireEvent.change(screen.getByLabelText("D"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("shows the kept time of a non-midnight value; editing the date replaces it with midnight", () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-05-01T23:00" onChange={onChange} label="D" />);
    expect((screen.getByLabelText("D") as HTMLInputElement).value).toBe("2026-05-01");
    expect(document.querySelector("[data-instant-time-kept]")!.textContent!.trim()).toBe("+23:00 UTC kept");
    fireEvent.change(screen.getByLabelText("D"), { target: { value: "2026-05-02" } });
    expect(onChange).toHaveBeenCalledWith("2026-05-02T00:00");
  });

  it("disabled and an unreadable value", () => {
    render(<DateInput value="garbage" onChange={() => undefined} label="D" disabled />);
    expect((screen.getByLabelText("D") as HTMLInputElement).disabled).toBe(true);
    expect(document.querySelector("[data-instant-unshown]")!.textContent).toContain("garbage");
  });
});
