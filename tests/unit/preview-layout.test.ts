import { describe, expect, it } from "vitest";
import { canvasLayout, MAX_CANVAS_PIXELS } from "../../src/components/attachments/preview-layout";

describe("PDF canvas allocation", () => {
  it("caps large and extremely narrow pages without losing CSS zoom", () => {
    for (const [width, height] of [
      [600, 800],
      [100000, 100000],
      [1, 1000000],
      [1000000, 1],
    ] as const) {
      const result = canvasLayout(width, height, 1200, 3, 4);
      expect(result.width * result.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(8192);
      expect(result.ratio).toBeLessThanOrEqual(2);
    }
  });
  it("fits a phone and preserves relative zoom", () => {
    const fit = canvasLayout(600, 800, 390, 1, 3);
    expect(fit.cssWidth).toBeLessThanOrEqual(390);
    expect(canvasLayout(600, 800, 390, 1.25, 3).cssWidth).toBeCloseTo(fit.cssWidth * 1.25);
  });
  it("rejects invalid geometry before allocating", () => {
    for (const dimension of [0, -1, Infinity, NaN])
      expect(() => canvasLayout(dimension, 800, 390, 1, 1)).toThrow();
  });
});
