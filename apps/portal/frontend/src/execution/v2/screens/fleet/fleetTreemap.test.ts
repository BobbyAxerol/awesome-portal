import { describe, expect, it } from "vitest";

import { squarify } from "./FleetMap";

describe("Fleet Map treemap geometry (QA2 R2-10)", () => {
  it("every rectangle's area is proportional to its weight and the rectangles tile the parent without overlap", () => {
    const weights = [100, 25, 40, 7, 7, 1, 60];
    const rects = squarify(weights.map((weight, index) => ({ key: index, weight })), { x: 0, y: 0, w: 100, h: 100 });
    expect(rects).toHaveLength(weights.length);
    const total = weights.reduce((a, b) => a + b, 0);
    for (const { key, rect } of rects) expect(rect.w * rect.h).toBeCloseTo((weights[key]! / total) * 10000, 6);
    expect(rects.reduce((sum, { rect }) => sum + rect.w * rect.h, 0)).toBeCloseTo(10000, 6);
    for (const a of rects) {
      for (const b of rects) {
        if (a === b) continue;
        const overlapX = Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w) - Math.max(a.rect.x, b.rect.x);
        const overlapY = Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h) - Math.max(a.rect.y, b.rect.y);
        expect(overlapX > 1e-9 && overlapY > 1e-9).toBe(false);
      }
    }
  });
});
