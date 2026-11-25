/**
 * The blotter prints exact decimals losslessly: every significant digit, no insignificant trailing zeros, thousands grouped.
 * The exact source string stays in the title; the CSV export keeps the raw source text.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { readProfileEnvelope } from "../../../api/profileRead";
import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";
import { ExactText } from "./OrderDetail";
import { COLUMNS, blotterCsv, readBlotter, readExact, trimExact, type BlotterOrder } from "./blotterModel";

afterEach(cleanup);

describe("trimExact", () => {
  it.each([
    ["2.000000000000000000", "2"],
    ["58312.900000000000000000", "58,312.9"],
    ["0.001230000", "0.00123"],
    ["0.000", "0"],
    ["0", "0"],
    ["-1234.500", "-1,234.5"],
    ["-0.000000000000000001", "-0.000000000000000001"],
    ["1234567", "1,234,567"],
    ["100", "100"],
    ["100.000", "100"],
    // more than 18 significant digits: nothing is rounded
    ["123456789012345678.123456789012345678900", "123,456,789,012,345,678.1234567890123456789"],
    ["9007199254740993.0000000001", "9,007,199,254,740,993.0000000001"],
  ])("%s -> %s", (raw, shown) => expect(trimExact(raw)).toBe(shown));

  it("returns a non-decimal text as it is, never an invented number", () => {
    for (const raw of ["0E-18", "1e-5", "NaN", ""]) expect(trimExact(raw)).toBe(raw);
  });
});

describe("blotter cells", () => {
  const canonical = loadCanonical<Draft>("execution-full-blotter.partial");
  const order = (): BlotterOrder => readBlotter(readProfileEnvelope(structuredClone(canonical))!)!.orders[0]!;

  it("renders the 18-decimal source strings without insignificant zeros and keeps the exact text in the title", () => {
    const quantity = readExact("2.000000000000000000");
    const price = readExact("58312.900000000000000000");
    const { container } = render(<><ExactText value={quantity} /><ExactText value={price} /></>);
    const cells = [...container.querySelectorAll("span.exec-blt2-num")];
    expect(cells.map((c) => c.textContent)).toEqual(["2", "58,312.9"]);
    expect(cells.map((c) => c.getAttribute("title"))).toEqual(["2.000000000000000000", "58312.900000000000000000"]);
  });

  it("a stated absent or unreadable value still takes the Not available path, never 0", () => {
    const { container } = render(<><ExactText value={readExact(null)} /><ExactText value={readExact("0E-18")} /></>);
    expect(container.textContent).toBe("Not availableNot available · unreadable value");
  });

  it("the CSV keeps the raw source values byte for byte", () => {
    const row: BlotterOrder = {
      ...order(), orderId: "o1", submittedAt: null, status: null, side: null, orderType: null,
      quantity: readExact("2.000000000000000000"), price: readExact("58312.900000000000000000"),
    };
    const csv = blotterCsv([row], COLUMNS.filter((c) => ["order", "price", "qty"].includes(c.id)));
    expect(csv).toBe("Order,Price,Quantity\r\no1,58312.900000000000000000,2.000000000000000000\r\n");
  });
});
