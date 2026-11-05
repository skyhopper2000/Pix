import { describe, expect, it } from "vitest";
import type { Terrain } from "../model";
import { BLOB47, BLOB47_MASKS, CORNER16, EDGE16, reduceBlobMask, slotDirs, slotName, validateTemplate } from ".";

describe("templates", () => {
  it("has exactly 47 blob masks including empty and full", () => {
    expect(BLOB47_MASKS).toHaveLength(47);
    expect(BLOB47_MASKS[0]).toBe(0);
    expect(BLOB47_MASKS.at(-1)).toBe(255);
    expect(BLOB47.slots).toHaveLength(47);
    expect(BLOB47.cols * BLOB47.rows).toBeGreaterThanOrEqual(47);
  });

  it("drops corners without both adjacent edges", () => {
    expect(reduceBlobMask(2)).toBe(0); // NE alone
    expect(reduceBlobMask(1 | 2 | 4)).toBe(7); // N, NE, E
  });

  it("uses only the positions each set type allows", () => {
    for (const t of [BLOB47, CORNER16, EDGE16]) expect(validateTemplate(t)).toEqual([]);
    expect(CORNER16.slots[0].wangId).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(CORNER16.slots[1].wangId).toEqual([0, 2, 0, 1, 0, 1, 0, 1]);
    expect(EDGE16.slots[15].wangId).toEqual([2, 0, 2, 0, 2, 0, 2, 0]);
  });

  it("names slots by terrain B positions", () => {
    const t: [Terrain, Terrain] = [
      { name: "grass", color: "#00ff00" },
      { name: "dirt", color: "#884400" },
    ];
    expect(slotName(t, CORNER16.slots[1].wangId)).toBe("grass_dirt_NE");
    expect(slotDirs(CORNER16.slots[0].wangId)).toBe("none");
    expect(slotDirs(CORNER16.slots[15].wangId)).toBe("all");
    expect(slotDirs(EDGE16.slots[3].wangId)).toBe("N-E");
  });

  it("rejects bad custom templates", () => {
    const errs = validateTemplate({ wangType: "corner", cols: 1, rows: 1, slots: [{ col: 0, row: 0, wangId: [2, 0, 0, 0, 0, 0, 0, 0] }] });
    expect(errs.length).toBe(1);
  });
});
