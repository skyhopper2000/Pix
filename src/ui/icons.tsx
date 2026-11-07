import { useUi } from "../state/app";

/**
 * Pixel-art UI icons (32×32), drawn in Pix itself. Each icon has a light-theme and a
 * dark-theme file in ./icons, kept under the names they were exported with so a
 * re-export can be dropped in as-is (note `bark_ers` = dark eraser, `light_cir` / `dark_circ`).
 */
const files = import.meta.glob<string>("./icons/*.png", { eager: true, query: "?url", import: "default" });
const url = (file: string): string => {
  const u = files[`./icons/${file}.png`];
  if (!u) throw new Error(`Missing icon ${file}.png`);
  return u;
};

const ICONS = {
  pen: { light: "light_pen", dark: "dark_pen" },
  eraser: { light: "light_ers", dark: "bark_ers" },
  fill: { light: "light_fill", dark: "dark_fill" },
  line: { light: "light_line", dark: "dark_line" },
  rect: { light: "light_rec", dark: "dark_rec" },
  ellipse: { light: "light_cir", dark: "dark_circ" },
  shade: { light: "light_shade", dark: "dark_shade" },
  select: { light: "light_rec_select", dark: "dark_rec_select" },
  picker: { light: "light_pick", dark: "dark_pick" },
} as const satisfies Record<string, { light: string; dark: string }>;

export type IconName = keyof typeof ICONS;

const URLS = Object.fromEntries(
  Object.entries(ICONS).map(([k, v]) => [k, { light: url(v.light), dark: url(v.dark) }]),
) as Record<IconName, { light: string; dark: string }>;

export const LOGO_URL = url("logo");

/** A theme-aware icon, shown 1 icon pixel per device pixel (see --icon-px in App). */
export function Icon({ name }: { name: IconName }) {
  const theme = useUi((s) => s.theme);
  return <img className="icon-img" src={URLS[name][theme]} alt="" draggable={false} />;
}

/**
 * CSS size for a 32px icon so each icon pixel covers a whole number of device pixels
 * (at 125 % Windows scaling, 32 CSS px would be 40 device px and smear the pixels).
 */
export function iconCssPx(devicePixelRatio: number): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return (32 * Math.max(1, Math.floor(dpr))) / dpr;
}
