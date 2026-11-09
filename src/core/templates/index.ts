import type { Subset, SubsetType, Template, TemplateSlot, Terrain, WangType } from "../model";

/**
 * Subset templates. A set bit / value 2 means terrain B, value 1 means terrain A, 0 means unused.
 * Wang id order (Tiled): top, top-right, right, bottom-right, bottom, bottom-left, left, top-left.
 * The app never fills slots; templates only describe the expected shape of each slot.
 */

export const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

// 8-neighbour bit values in Wang-id order.
const BIT = [1, 2, 4, 8, 16, 32, 64, 128];

/** Drops corner bits whose two adjacent edges aren't both set (standard blob reduction). */
export function reduceBlobMask(m: number): number {
  const N = m & 1, E = m & 4, S = m & 16, W = m & 64;
  let r = m & (1 | 4 | 16 | 64);
  if (m & 2 && N && E) r |= 2;
  if (m & 8 && E && S) r |= 8;
  if (m & 32 && S && W) r |= 32;
  if (m & 128 && W && N) r |= 128;
  return r;
}

/** The 47 distinct reduced blob masks, ascending. */
export const BLOB47_MASKS: number[] = [...new Set(Array.from({ length: 256 }, (_, m) => reduceBlobMask(m)))].sort((a, b) => a - b);

function build(wangType: WangType, cols: number, rows: number, ids: number[][]): Template {
  const slots: TemplateSlot[] = ids.map((wangId, i) => ({ col: i % cols, row: Math.floor(i / cols), wangId }));
  return { wangType, cols, rows, slots };
}

export const BLOB47: Template = build(
  "mixed",
  8,
  6,
  BLOB47_MASKS.map((m) => BIT.map((b) => (m & b ? 2 : 1))),
);

/** Index = NE*1 + SE*2 + SW*4 + NW*8. */
export const CORNER16: Template = build(
  "corner",
  4,
  4,
  Array.from({ length: 16 }, (_, i) => {
    const v = (bit: number) => (i & bit ? 2 : 1);
    return [0, v(1), 0, v(2), 0, v(4), 0, v(8)];
  }),
);

/** Index = N*1 + E*2 + S*4 + W*8. */
export const EDGE16: Template = build(
  "edge",
  4,
  4,
  Array.from({ length: 16 }, (_, i) => {
    const v = (bit: number) => (i & bit ? 2 : 1);
    return [v(1), 0, v(2), 0, v(4), 0, v(8), 0];
  }),
);

export function builtinTemplate(type: SubsetType): Template | null {
  switch (type) {
    case "blob47":
      return BLOB47;
    case "corner16":
      return CORNER16;
    case "edge16":
      return EDGE16;
    default:
      return null;
  }
}

/** The template for a subset, or null for unstructured subsets. */
export function templateOf(s: Pick<Subset, "type" | "template">): Template | null {
  if (s.type === "custom") return s.template ?? null;
  return builtinTemplate(s.type);
}

/** Positions that are terrain B, e.g. "N-NE-E"; "all" / "none" at the extremes. */
export function slotDirs(wangId: number[]): string {
  const used = wangId.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const b = used.filter((i) => wangId[i] === 2);
  if (b.length === 0) return "none";
  if (b.length === used.length) return "all";
  return b.map((i) => DIRS[i]).join("-");
}

const sanitize = (s: string) => s.trim().replace(/[^A-Za-z0-9_-]+/g, "_") || "terrain";

/** Auto-name for a tile drawn into a slot: `{A}_{B}_{dirs}`. */
export function slotName(terrains: [Terrain, Terrain], wangId: number[]): string {
  return `${sanitize(terrains[0].name)}_${sanitize(terrains[1].name)}_${slotDirs(wangId)}`;
}

/** Most slots a custom template may have (keeps the editor and the fill wizard usable). */
export const MAX_TEMPLATE_SLOTS = 64;

/** Validates a user-defined template; returns a list of problems (empty = valid). */
export function validateTemplate(t: Template): string[] {
  const errs: string[] = [];
  if (t.cols < 1 || t.rows < 1) errs.push("Grid must be at least 1×1.");
  if (t.slots.length > MAX_TEMPLATE_SLOTS) errs.push(`A template can have at most ${MAX_TEMPLATE_SLOTS} slots (this one has ${t.slots.length}).`);
  const seen = new Set<string>();
  for (const [i, s] of t.slots.entries()) {
    if (s.col < 0 || s.row < 0 || s.col >= t.cols || s.row >= t.rows) errs.push(`Slot ${i + 1} is outside the grid.`);
    const k = s.col + "," + s.row;
    if (seen.has(k)) errs.push(`Slot ${i + 1} overlaps another slot.`);
    seen.add(k);
    if (s.wangId.length !== 8 || s.wangId.some((v) => v < 0 || v > 2)) errs.push(`Slot ${i + 1} has an invalid Wang id.`);
    const allowed = t.wangType === "corner" ? [1, 3, 5, 7] : t.wangType === "edge" ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7];
    if (s.wangId.some((v, j) => v !== 0 && !allowed.includes(j))) errs.push(`Slot ${i + 1} uses positions not allowed in a ${t.wangType} set.`);
  }
  return errs;
}
