/**
 * User preferences: the UI settings that survive a restart. They live in the UI store like any
 * other UI state and are mirrored to localStorage whenever one of them changes.
 */

export interface Prefs {
  theme: "dark" | "light";
  pixelPerfect: boolean;
  previewGrid: boolean;
  highlightUses: boolean;
  slotGuides: boolean;
  /** Multiplier for every UI font size (1 = 100%). */
  fontScale: number;
  /** Shortcut overrides by command id. "" means the command has no shortcut. */
  shortcuts: Record<string, string>;
}

export const PREF_KEYS = ["theme", "pixelPerfect", "previewGrid", "highlightUses", "slotGuides", "fontScale", "shortcuts"] as const satisfies readonly (keyof Prefs)[];

export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.6;

export const defaultPrefs = (): Prefs => ({
  theme: "dark",
  pixelPerfect: true,
  previewGrid: true,
  highlightUses: false,
  slotGuides: true,
  fontScale: 1,
  shortcuts: {},
});

const STORAGE_KEY = "pix.prefs";
const LEGACY_THEME_KEY = "tilestudio.theme";

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Reads saved preferences, ignoring anything malformed. */
export function loadPrefs(): Prefs {
  const d = defaultPrefs();
  if (typeof localStorage === "undefined") return d;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Before preferences existed only the theme was saved.
      if (localStorage.getItem(LEGACY_THEME_KEY) === "light") d.theme = "light";
      return d;
    }
    const o = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    const shortcuts: Record<string, string> = {};
    if (o.shortcuts && typeof o.shortcuts === "object") {
      for (const [k, v] of Object.entries(o.shortcuts)) if (typeof v === "string") shortcuts[k] = v;
    }
    const scale = typeof o.fontScale === "number" && Number.isFinite(o.fontScale) ? o.fontScale : 1;
    return {
      theme: o.theme === "light" ? "light" : "dark",
      pixelPerfect: bool(o.pixelPerfect, d.pixelPerfect),
      previewGrid: bool(o.previewGrid, d.previewGrid),
      highlightUses: bool(o.highlightUses, d.highlightUses),
      slotGuides: bool(o.slotGuides, d.slotGuides),
      fontScale: Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale)),
      shortcuts,
    };
  } catch {
    return d;
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: preferences last for this session only */
  }
}

export function pickPrefs(s: Prefs): Prefs {
  const out = {} as Record<string, unknown>;
  for (const k of PREF_KEYS) out[k] = s[k];
  return out as unknown as Prefs;
}
