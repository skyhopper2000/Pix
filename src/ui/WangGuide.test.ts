import { describe, expect, it } from "vitest";
import { guideRegions } from "./WangGuide";

describe("slot guide regions", () => {
  it("lays out corner sets and infers edges between equal corners", () => {
    // NE corner = B, others A
    const g = guideRegions([0, 2, 0, 1, 0, 1, 0, 1]);
    expect(g).toEqual([1, 0, 2, 1, 0, 0, 1, 1, 1]);
  });
  it("fills the centre only when every used position agrees", () => {
    expect(guideRegions([2, 2, 2, 2, 2, 2, 2, 2])[4]).toBe(2);
    expect(guideRegions([2, 0, 1, 0, 1, 0, 1, 0])[4]).toBe(0);
  });
});
